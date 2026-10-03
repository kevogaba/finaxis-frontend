import { createHash, randomUUID } from 'node:crypto';
import { requireContext, requirePermission, requireTenantContext } from '../access.mts';
import type { AccessContext } from '../access.mts';
import { recordAuditEvent } from '../audit-log.mts';
import { objectBody, pageOf, problem, readBody, sendJson, stringField } from '../http.mts';
import type { Violation } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { route } from '../router.mts';
import type { Route, RouteContext } from '../router.mts';
import type { FakeRole, FakeRoleAssignment } from '../state.mts';

type CatalogueRow = readonly [code: string, name: string, module: string, risk: string];

/**
 * The 54 foundation codes (contract §J), with the backend's V2 seed names, modules and risks
 * (source f74e44b). The 26 accounting codes aren't surfaced yet.
 */
const CATALOGUE: readonly CatalogueRow[] = [
  ['tenant.create', 'Create organisation', 'tenant', 'HIGH'],
  ['tenant.submit_for_approval', 'Submit organisation for approval', 'tenant', 'HIGH'],
  ['tenant.approve', 'Approve organisation', 'tenant', 'CRITICAL'],
  ['tenant.activate', 'Activate organisation', 'tenant', 'CRITICAL'],
  ['tenant.suspend', 'Suspend organisation', 'tenant', 'CRITICAL'],
  ['tenant.deprovision', 'Deprovision organisation', 'tenant', 'CRITICAL'],
  ['tenant.view', 'View organisation', 'tenant', 'MEDIUM'],
  ['tenant.update_draft', 'Update organisation draft', 'tenant', 'HIGH'],
  ['tenant.reject', 'Reject organisation draft', 'tenant', 'HIGH'],
  ['tenant.reactivate', 'Reactivate organisation', 'tenant', 'CRITICAL'],
  ['tenant.bootstrap_retry', 'Retry administrator bootstrap', 'tenant', 'HIGH'],
  ['branch.create', 'Create branch', 'branch', 'HIGH'],
  ['branch.approve', 'Approve branch', 'branch', 'HIGH'],
  ['branch.activate', 'Activate branch', 'branch', 'HIGH'],
  ['branch.suspend', 'Suspend branch', 'branch', 'HIGH'],
  ['branch.close', 'Close branch', 'branch', 'HIGH'],
  ['branch.view', 'View branch', 'branch', 'LOW'],
  ['branch.reactivate', 'Reactivate branch', 'branch', 'HIGH'],
  ['user.invite', 'Invite user', 'iam', 'HIGH'],
  ['user.approve', 'Approve user', 'iam', 'HIGH'],
  ['user.activate', 'Activate user', 'iam', 'HIGH'],
  ['user.suspend', 'Suspend user', 'iam', 'HIGH'],
  ['user.deactivate', 'Deactivate user', 'iam', 'HIGH'],
  ['user.assign_branch', 'Assign user branch', 'iam', 'HIGH'],
  ['user.assign_role', 'Assign user role', 'iam', 'HIGH'],
  ['user.revoke_branch', 'Revoke branch assignment', 'iam', 'HIGH'],
  ['user.revoke_role', 'Revoke role assignment', 'iam', 'HIGH'],
  ['user.view', 'View users', 'iam', 'LOW'],
  ['role.create', 'Create role', 'iam', 'HIGH'],
  ['role.update', 'Update role', 'iam', 'HIGH'],
  ['role.activate', 'Activate role', 'iam', 'HIGH'],
  ['role.deactivate', 'Deactivate role', 'iam', 'HIGH'],
  ['role.assign_permission', 'Assign permission to role', 'iam', 'CRITICAL'],
  ['role.remove_permission', 'Remove role permission', 'iam', 'CRITICAL'],
  ['role.view', 'View roles', 'iam', 'LOW'],
  ['membership.view', 'View memberships', 'iam', 'LOW'],
  ['membership.suspend', 'Suspend membership', 'iam', 'HIGH'],
  ['membership.reactivate', 'Reactivate membership', 'iam', 'HIGH'],
  ['membership.revoke', 'Revoke membership', 'iam', 'HIGH'],
  ['iam.profile.read', 'View own profile', 'iam', 'LOW'],
  ['auth.select_organisation', 'Select organisation', 'iam', 'LOW'],
  ['auth.select_branch', 'Select branch', 'iam', 'LOW'],
  ['branch_assignment.view', 'View branch assignments', 'iam', 'LOW'],
  ['role_assignment.view', 'View role assignments', 'iam', 'LOW'],
  ['permission.view', 'View permissions', 'iam', 'LOW'],
  ['audit.view', 'View audit log', 'audit', 'MEDIUM'],
  ['settings.view', 'View settings', 'settings', 'LOW'],
  ['settings.update', 'Update settings', 'settings', 'HIGH'],
  ['tenant_setting.manage_platform', 'Manage platform-only settings', 'settings', 'HIGH'],
  ['business_date.view', 'View business date', 'settings', 'LOW'],
  ['business_date.advance', 'Advance business date', 'settings', 'CRITICAL'],
  ['business_date.reopen', 'Reopen business date', 'settings', 'CRITICAL'],
  ['cob.start', 'Start close of business', 'settings', 'HIGH'],
  ['cob.complete', 'Complete close of business', 'settings', 'HIGH'],
];

interface CatalogueEntry {
  id: string;
  code: string;
  name: string;
  module: string;
  risk: string;
}

// Layer 09 seed ids (lane rules §5), numbered from …0100 so they never meet the scenario counter.
const PERMISSIONS: readonly CatalogueEntry[] = CATALOGUE.map(
  ([code, name, module, risk], index) => ({
    id: `09000000-0000-4000-8000-${(0x100 + index).toString(16).padStart(12, '0')}`,
    code,
    name,
    module,
    risk,
  }),
);

const ROLE_CODE = /^[A-Z0-9_-]{2,20}$/;

/** A stable UUID for something the fake keeps no row for: one role's grant of one code. It is
 * derived at runtime like a `randomUUID()` id, not a seed id (Ruling 18). */
function derivedId(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

const roleNotFound = () => problem(404, 'resource_not_found', 'Role not found.');
const assignmentNotFound = () => problem(404, 'resource_not_found', 'Role assignment not found');
const immutable = () => problem(409, 'conflict', 'System roles cannot be modified.');

function tenantAccess(context: RouteContext): AccessContext {
  const access = requireContext(context);
  requireTenantContext(access);
  return access;
}

function findRole(access: AccessContext, roleId: string): FakeRole {
  const role = access.state.roles.find(
    (candidate) => candidate.id === roleId && candidate.organisationId === access.organisation.id,
  );
  if (!role) throw roleNotFound();
  return role;
}

const summaryWire = (role: FakeRole) => ({
  id: role.id,
  role_code: role.code,
  role_name: role.name,
  system_role: role.systemRole,
  status: role.status,
});

const detailWire = (role: FakeRole) => ({
  id: role.id,
  organisation_id: role.organisationId,
  role_code: role.code,
  role_name: role.name,
  description: role.description,
  system_role: role.systemRole,
  status: role.status,
  created_at: role.createdAt,
  updated_at: role.updatedAt,
});

const permissionWire = (entry: CatalogueEntry) => ({
  id: entry.id,
  permission_code: entry.code,
  permission_name: entry.name,
  module_code: entry.module,
  risk_level: entry.risk,
  status: 'ACTIVE',
});

const assignmentWire = (row: FakeRoleAssignment) => ({
  id: row.id,
  user_id: row.userId,
  role_id: row.roleId,
  branch_id: row.branchId,
  scope_type: row.scopeType,
  status: row.status,
});

/** A role's grants, newest first (contract §E.3); a seeded code reads as granted at creation. */
function grantsOf(role: FakeRole) {
  return role.permissions
    .map((code) => ({
      id: derivedId(`${role.id}:${code}`),
      role_id: role.id,
      permission_id:
        PERMISSIONS.find((entry) => entry.code === code)?.id ?? derivedId(`permission:${code}`),
      permission_code: code,
      granted_at: role.grantedAt?.[code] ?? role.createdAt,
    }))
    .sort(
      (a, b) =>
        b.granted_at.localeCompare(a.granted_at) ||
        a.permission_code.localeCompare(b.permission_code),
    );
}

/** Mirrors the backend's sort parsing: an off-list `sort_by` or `sort_dir` is a 500 (BG-07).
 * `sort_by` is user-controlled, so the allow-list is read with `Object.hasOwn`: `toString` must not
 * resolve to an `Object.prototype` member. */
function orderBy<T>(
  rows: T[],
  keys: Partial<Record<string, (row: T) => string>>,
  query: URLSearchParams,
  fallback: { by: string; dir: string },
): T[] {
  const sortBy = query.get('sort_by') ?? fallback.by;
  const key = Object.hasOwn(keys, sortBy) ? keys[sortBy] : undefined;
  const direction = (query.get('sort_dir') ?? fallback.dir).toUpperCase();
  if (!key || (direction !== 'ASC' && direction !== 'DESC')) {
    throw problem(500, 'internal_error', 'An unexpected error occurred.');
  }
  const ordered = rows.sort((a, b) => key(a).localeCompare(key(b)));
  return direction === 'DESC' ? ordered.reverse() : ordered;
}

const ROLE_SORTS: Partial<Record<string, (role: FakeRole) => string>> = {
  roleCode: (role) => role.code,
  roleName: (role) => role.name,
  status: (role) => role.status,
  createdAt: (role) => role.createdAt,
};

const PERMISSION_SORTS: Partial<Record<string, (entry: CatalogueEntry) => string>> = {
  permissionCode: (entry) => entry.code,
  permissionName: (entry) => entry.name,
  riskLevel: (entry) => entry.risk,
  // Every fake entry is ACTIVE and has no creation time, so these sort as ties.
  status: () => '',
  createdAt: () => '',
};

const ASSIGNMENT_FILTERS: Record<string, (row: FakeRoleAssignment) => string | null> = {
  user_id: (row) => row.userId,
  role_id: (row) => row.roleId,
  branch_id: (row) => row.branchId,
  scope_type: (row) => row.scopeType,
  status: (row) => row.status,
};

/** Activate / deactivate: any state → ACTIVE / DISABLED, custom roles only (contract §E.3). */
function statusRoute(path: 'activate' | 'deactivate', status: 'ACTIVE' | 'DISABLED'): Route {
  return route('POST', `/api/v1/tenant/roles/:role_id/${path}`, (context) => {
    const access = tenantAccess(context);
    requirePermission(access, `role.${path}`);
    requirePermission(access, 'role.view'); // read-back (BG-31)
    const role = findRole(access, context.params.role_id ?? '');
    // The endpoint takes no input (contract §E.3), so every request fingerprints as `{}`.
    sendIdempotent(context, {}, () => {
      if (role.systemRole) throw immutable();
      role.status = status;
      role.updatedAt = new Date().toISOString();
      recordAuditEvent(context.state, access, {
        entityType: 'ROLE',
        entityId: role.id,
        action: `role.${path}`,
        reason: null,
      });
      return detailWire(role);
    });
  });
}

export const roleRoutes: Route[] = [
  route('GET', '/api/v1/tenant/roles', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'role.view');
    const { query } = context;
    const q = query.get('q')?.toLowerCase();
    const status = query.get('status');
    const systemRole = query.get('system_role');
    const roles = context.state.roles.filter(
      (role) =>
        role.organisationId === access.organisation.id &&
        (!q || role.code.toLowerCase().includes(q) || role.name.toLowerCase().includes(q)) &&
        (!status || role.status === status) &&
        (systemRole === null || String(role.systemRole) === systemRole),
    );
    const ordered = orderBy(roles, ROLE_SORTS, query, { by: 'createdAt', dir: 'DESC' });
    sendJson(context.res, 200, pageOf(ordered.map(summaryWire), query));
  }),

  route('POST', '/api/v1/tenant/roles', async (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'role.create');
    requirePermission(access, 'role.view'); // read-back (BG-31)
    const body = objectBody(await readBody(context.req), ['role_code', 'role_name', 'description']);
    const code = stringField(body, 'role_code', { required: true }) ?? '';
    const name = stringField(body, 'role_name', { required: true }) ?? '';
    const description = stringField(body, 'description', { required: false });
    const violations: Violation[] = [];
    if (!ROLE_CODE.test(code)) {
      violations.push({
        field: 'role_code',
        code: 'Pattern',
        message: 'Role code must be 2-20 uppercase letters, numbers, hyphens, or underscores.',
      });
    }
    if (name.trim() === '') {
      violations.push({ field: 'role_name', code: 'NotBlank', message: 'must not be blank' });
    }
    if (violations.length > 0) {
      throw problem(400, 'validation_failed', 'Validation failed.', violations);
    }
    sendIdempotent(
      context,
      body,
      () => {
        const { roles } = context.state;
        if (roles.some((c) => c.organisationId === access.organisation.id && c.code === code)) {
          throw problem(409, 'conflict', 'A role with this code already exists.');
        }
        const now = new Date().toISOString();
        const created: FakeRole = {
          id: randomUUID(),
          organisationId: access.organisation.id,
          code,
          name,
          description,
          systemRole: false,
          status: 'ACTIVE',
          permissions: [],
          createdAt: now,
          updatedAt: now,
        };
        roles.push(created);
        recordAuditEvent(context.state, access, {
          entityType: 'ROLE',
          entityId: created.id,
          action: 'role.create',
          reason: null,
        });
        return detailWire(created);
      },
      201,
    );
  }),

  route('GET', '/api/v1/tenant/roles/:role_id', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'role.view');
    sendJson(context.res, 200, detailWire(findRole(access, context.params.role_id ?? '')));
  }),

  route('PATCH', '/api/v1/tenant/roles/:role_id', async (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'role.update');
    requirePermission(access, 'role.view');
    const role = findRole(access, context.params.role_id ?? '');
    // The body is required (contract §D). As in the backend (BG-34), a non-null field replaces
    // the stored one, blank included; the UI pre-validates the name.
    const body = objectBody(await readBody(context.req), ['role_name', 'description']);
    const name = stringField(body, 'role_name', { required: false });
    const description = stringField(body, 'description', { required: false });
    sendIdempotent(context, body, () => {
      if (role.systemRole) throw immutable();
      if (name !== null) role.name = name;
      if (description !== null) role.description = description;
      role.updatedAt = new Date().toISOString();
      recordAuditEvent(context.state, access, {
        entityType: 'ROLE',
        entityId: role.id,
        action: 'role.update',
        reason: null,
      });
      return detailWire(role);
    });
  }),

  statusRoute('activate', 'ACTIVE'),
  statusRoute('deactivate', 'DISABLED'),

  route('GET', '/api/v1/tenant/roles/:role_id/permissions', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'role.view');
    const role = findRole(access, context.params.role_id ?? '');
    sendJson(context.res, 200, pageOf(grantsOf(role), context.query));
  }),

  route('POST', '/api/v1/tenant/roles/:role_id/permissions', async (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'role.assign_permission');
    requirePermission(access, 'role.view');
    const role = findRole(access, context.params.role_id ?? '');
    const body = objectBody(await readBody(context.req), ['permission_code']);
    const code = stringField(body, 'permission_code', { required: true }) ?? '';
    sendIdempotent(
      context,
      body,
      () => {
        if (role.systemRole) throw immutable();
        if (!PERMISSIONS.some((entry) => entry.code === code)) {
          throw problem(404, 'resource_not_found', 'Permission not found.');
        }
        // Idempotent like the backend's grantPermission: a repeat returns the existing grant.
        if (!role.permissions.includes(code)) {
          role.permissions.push(code);
          role.grantedAt = { ...role.grantedAt, [code]: new Date().toISOString() };
          recordAuditEvent(context.state, access, {
            entityType: 'ROLE',
            entityId: role.id,
            action: 'role.assign_permission',
            reason: null,
          });
        }
        return grantsOf(role).find((grant) => grant.permission_code === code);
      },
      201,
    );
  }),

  route('DELETE', '/api/v1/tenant/roles/:role_id/permissions/:grant_id', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'role.remove_permission');
    requirePermission(access, 'role.view');
    const role = findRole(access, context.params.role_id ?? '');
    // The lookup runs inside `produce`, so a replay of a landed removal answers from the store
    // instead of missing the grant it already removed.
    sendIdempotent(context, {}, () => {
      const grant = grantsOf(role).find((candidate) => candidate.id === context.params.grant_id);
      if (!grant) throw problem(404, 'resource_not_found', 'Role permission not found');
      if (role.systemRole) throw immutable();
      role.permissions = role.permissions.filter((code) => code !== grant.permission_code);
      recordAuditEvent(context.state, access, {
        entityType: 'ROLE',
        entityId: role.id,
        action: 'role.remove_permission',
        reason: null,
      });
      // Contract §E.3: the remaining grants, page 0, size 100.
      return pageOf(grantsOf(role), new URLSearchParams({ page: '0', size: '100' }));
    });
  }),

  route('GET', '/api/v1/tenant/permissions', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'permission.view');
    const { query } = context;
    const q = query.get('q')?.toLowerCase();
    const risk = query.get('risk_level');
    const status = query.get('status');
    const rows = PERMISSIONS.filter(
      (entry) =>
        (!q || entry.code.includes(q) || entry.name.toLowerCase().includes(q)) &&
        (!risk || entry.risk === risk) &&
        (!status || status === 'ACTIVE'),
    );
    const ordered = orderBy(rows, PERMISSION_SORTS, query, { by: 'permissionCode', dir: 'ASC' });
    sendJson(context.res, 200, pageOf(ordered.map(permissionWire), query));
  }),

  route('GET', '/api/v1/tenant/role-assignments', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'role_assignment.view');
    const { query } = context;
    const rows = context.state.roleAssignments.filter(
      (row) =>
        row.organisationId === access.organisation.id &&
        Object.entries(ASSIGNMENT_FILTERS).every(([name, value]) => {
          const wanted = query.get(name);
          return wanted === null || value(row) === wanted;
        }),
    );
    // Newest first (contract §E.3); the fake keeps no assignment time, so reverse insert order.
    sendJson(context.res, 200, pageOf(rows.reverse().map(assignmentWire), query));
  }),

  route('POST', '/api/v1/tenant/role-assignments', async (context) => {
    const access = tenantAccess(context);
    const body = objectBody(await readBody(context.req), [
      'user_id',
      'role_id',
      'scope_type',
      'branch_id',
    ]);
    const userId = stringField(body, 'user_id', { required: true }) ?? '';
    const roleId = stringField(body, 'role_id', { required: true }) ?? '';
    const scope = stringField(body, 'scope_type', { required: true }) ?? '';
    const branchId = stringField(body, 'branch_id', { required: false });
    if (scope !== 'TENANT' && scope !== 'BRANCH') {
      throw problem(400, 'invalid_json', 'Malformed request body.');
    }
    if (scope === 'BRANCH') {
      // Source f74e44b: `requireNotNull(branchId)` runs before the service's 409 (BG-07).
      if (branchId === null) throw problem(500, 'internal_error', 'An unexpected error occurred.');
      // Contract §E.4: another branch while a branch is selected is a 404.
      if (access.claims.branchId !== null && access.claims.branchId !== branchId) {
        throw assignmentNotFound();
      }
    }
    requirePermission(access, 'user.assign_role', scope === 'BRANCH' ? 'branch' : 'tenant');
    sendIdempotent(
      context,
      body,
      () => {
        const { state } = context;
        const organisationId = access.organisation.id;
        const member = state.memberships.find(
          (candidate) => candidate.userId === userId && candidate.organisationId === organisationId,
        );
        if (!member) throw problem(404, 'resource_not_found', 'Membership not found.');
        if (member.status === 'REVOKED') {
          throw problem(409, 'conflict', 'The membership does not allow assignments.');
        }
        if (!state.roles.some((r) => r.id === roleId && r.organisationId === organisationId)) {
          throw roleNotFound();
        }
        if (scope === 'TENANT' && branchId !== null) {
          throw problem(422, 'invalid_operation', 'Invalid operation.');
        }
        const assignedThere = state.branchAssignments.some(
          (row) =>
            row.userId === userId &&
            row.branchId === branchId &&
            row.organisationId === organisationId &&
            row.status === 'ACTIVE',
        );
        if (scope === 'BRANCH' && !assignedThere) {
          throw problem(409, 'conflict', 'The user has no active assignment at this branch.');
        }
        // A repeat returns the existing row (source f74e44b: `activeRoleAssignment`).
        const existing = state.roleAssignments.find(
          (row) =>
            row.userId === userId &&
            row.roleId === roleId &&
            row.scopeType === scope &&
            row.branchId === branchId &&
            row.status === 'ACTIVE',
        );
        if (existing) return assignmentWire(existing);
        const created: FakeRoleAssignment = {
          id: randomUUID(),
          organisationId,
          userId,
          roleId,
          scopeType: scope,
          branchId,
          status: 'ACTIVE',
        };
        state.roleAssignments.push(created);
        recordAuditEvent(state, access, {
          entityType: 'USER_ROLE_ASSIGNMENT',
          entityId: created.id,
          action: 'user.assign_role',
          reason: null,
        });
        return assignmentWire(created);
      },
      201,
    );
  }),

  route('DELETE', '/api/v1/tenant/role-assignments/:assignment_id', (context) => {
    const access = tenantAccess(context);
    const row = context.state.roleAssignments.find(
      (candidate) =>
        candidate.id === context.params.assignment_id &&
        candidate.organisationId === access.organisation.id,
    );
    if (!row) throw assignmentNotFound();
    const branchScoped = row.scopeType === 'BRANCH';
    if (
      branchScoped &&
      access.claims.branchId !== null &&
      access.claims.branchId !== row.branchId
    ) {
      throw assignmentNotFound();
    }
    requirePermission(access, 'user.revoke_role', branchScoped ? 'branch' : 'tenant');
    requirePermission(access, 'role_assignment.view'); // read-back (BG-31)
    sendIdempotent(context, {}, () => {
      // Source f74e44b: revoking a REVOKED assignment is a no-op that still returns it.
      if (row.status === 'ACTIVE') {
        row.status = 'REVOKED';
        recordAuditEvent(context.state, access, {
          entityType: 'USER_ROLE_ASSIGNMENT',
          entityId: row.id,
          action: 'user.revoke_role',
          reason: null,
        });
      }
      // ponytail: summary fields only; the real API returns RoleAssignmentDetail and the UI
      // ignores the body (08's Ruling 14).
      return assignmentWire(row);
    });
  }),
];
