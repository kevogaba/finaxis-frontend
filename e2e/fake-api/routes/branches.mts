import { randomUUID } from 'node:crypto';
import { requireContext, requirePermission, requireTenantContext } from '../access.mts';
import type { AccessContext } from '../access.mts';
import { recordAuditEvent } from '../audit-log.mts';
import { objectBody, pageOf, problem, readBody, sendJson, stringField } from '../http.mts';
import type { Violation } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { route } from '../router.mts';
import type { Route, RouteContext } from '../router.mts';
import type { FakeBranch, FakeBranchAssignment } from '../state.mts';

const BRANCH_CODE = /^[A-Z0-9_-]{2,20}$/;
const ASSIGNMENT_TYPES = ['HOME', 'OPERATE', 'APPROVE', 'VIEW'];
const NEED_A_BRANCH = ['STAFF', 'ADMIN'];

const branchNotFound = () => problem(404, 'resource_not_found', 'Branch not found.');

function tenantAccess(context: RouteContext): AccessContext {
  const access = requireContext(context);
  requireTenantContext(access);
  return access;
}

/** Contract §E.4 / BG-03: with a branch selected, every other branch is a 404. */
function reachableBranch(access: AccessContext, branchId: string): FakeBranch {
  const branch = access.state.branches.find(
    (candidate) => candidate.id === branchId && candidate.organisationId === access.organisation.id,
  );
  if (!branch || (access.claims.branchId !== null && access.claims.branchId !== branchId)) {
    throw branchNotFound();
  }
  return branch;
}

const detailWire = (branch: FakeBranch) => ({
  id: branch.id,
  organisation_id: branch.organisationId,
  branch_code: branch.code,
  branch_name: branch.name,
  branch_type: branch.type,
  parent_branch_id: branch.parentBranchId,
  status: branch.status,
  timezone: branch.timezone,
  address: {}, // stored, never returned (BG-13)
  opened_on: null, // never set by the API (BG-13)
  closed_on: null,
  status_reason: branch.statusReason,
  created_at: branch.createdAt,
  updated_at: branch.updatedAt,
});

const assignmentWire = (row: FakeBranchAssignment) => ({
  id: row.id,
  user_id: row.userId,
  branch_id: row.branchId,
  assignment_type: row.type,
  status: row.status,
});

function reasonField(body: Record<string, unknown>, required: boolean): string | null {
  const reason = stringField(body, 'reason', { required });
  if (required && (reason === null || reason.trim().length < 3 || reason.length > 500)) {
    throw problem(400, 'validation_failed', 'Validation failed.', [
      { field: 'reason', code: 'Size', message: 'size must be between 3 and 500' },
    ]);
  }
  return reason;
}

type Guard = (access: AccessContext, branch: FakeBranch) => void;

const makerChecker: Guard = (access, branch) => {
  if (branch.draftedBy === access.claims.userId) {
    throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
  }
};

const nothingActiveBelow: Guard = (access, branch) => {
  const assigned = access.state.branchAssignments.some(
    (row) => row.branchId === branch.id && row.status === 'ACTIVE',
  );
  const activeChild = access.state.branches.some(
    (candidate) => candidate.parentBranchId === branch.id && candidate.status === 'ACTIVE',
  );
  if (assigned || activeChild) {
    throw problem(409, 'conflict', 'Branch still has active assignments or active child branches.');
  }
};

function transition(
  path: string,
  permission: string,
  from: readonly string[],
  to: string,
  action: string,
  reasonRequired: boolean,
  guard: Guard = () => undefined,
): Route {
  return route('POST', `/api/v1/branches/:branch_id/${path}`, async (context) => {
    const access = tenantAccess(context);
    const branch = reachableBranch(access, context.params.branch_id ?? '');
    requirePermission(access, permission, 'branch');
    requirePermission(access, 'branch.view', 'branch'); // read-back (BG-31)
    const raw = await readBody(context.req);
    // Submit/Activate/Reactivate bodies are optional; Suspend/Close need a reason (contract §D).
    const body = raw === undefined && !reasonRequired ? {} : objectBody(raw, ['reason']);
    const reason = reasonField(body, reasonRequired);
    sendIdempotent(context, body, () => {
      if (!from.includes(branch.status)) {
        throw problem(409, 'conflict', `The branch must be ${from.join(' or ')}.`);
      }
      guard(access, branch);
      branch.status = to;
      branch.statusReason = reason; // overwritten by every transition (contract §C)
      branch.updatedAt = new Date().toISOString();
      recordAuditEvent(context.state, access, {
        entityType: 'BRANCH',
        entityId: branch.id,
        action,
        reason,
      });
      return detailWire(branch);
    });
  });
}

export const branchRoutes: Route[] = [
  route('GET', '/api/v1/branches/:branch_id', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'branch.view');
    sendJson(context.res, 200, detailWire(reachableBranch(access, context.params.branch_id ?? '')));
  }),

  route('POST', '/api/v1/branches', async (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'branch.create');
    const body = objectBody(await readBody(context.req), [
      'branch_code',
      'branch_name',
      'branch_type',
      'parent_branch_id',
      'timezone',
      'address',
    ]);
    const code = stringField(body, 'branch_code', { required: true }) ?? '';
    const name = stringField(body, 'branch_name', { required: true }) ?? '';
    const type = stringField(body, 'branch_type', { required: true }) ?? '';
    const timezone = stringField(body, 'timezone', { required: true }) ?? '';
    const parentId = stringField(body, 'parent_branch_id', { required: false });
    const violations: Violation[] = [];
    if (!BRANCH_CODE.test(code)) {
      violations.push({
        field: 'branch_code',
        code: 'Pattern',
        message: 'must match "^[A-Z0-9_-]{2,20}$"',
      });
    }
    if (name.trim().length < 2 || name.length > 100) {
      violations.push({
        field: 'branch_name',
        code: 'Size',
        message: 'size must be between 2 and 100',
      });
    }
    if (violations.length > 0) {
      throw problem(400, 'validation_failed', 'Validation failed.', violations);
    }
    sendIdempotent(
      context,
      body,
      () => {
        const { branches } = context.state;
        if (branches.some((c) => c.organisationId === access.organisation.id && c.code === code)) {
          throw problem(409, 'conflict', 'A branch with this code already exists.');
        }
        if (
          parentId !== null &&
          !branches.some((c) => c.id === parentId && c.organisationId === access.organisation.id)
        ) {
          throw problem(404, 'resource_not_found', 'Parent branch not found.');
        }
        const now = new Date().toISOString();
        const created: FakeBranch = {
          id: randomUUID(),
          organisationId: access.organisation.id,
          code,
          name,
          type,
          status: 'DRAFT',
          timezone,
          parentBranchId: parentId,
          statusReason: null,
          createdAt: now,
          updatedAt: now,
          draftedBy: access.claims.userId,
        };
        branches.push(created);
        recordAuditEvent(context.state, access, {
          entityType: 'BRANCH',
          entityId: created.id,
          action: 'branch.create_draft',
          reason: null,
        });
        return { branch_id: created.id, status: 'DRAFT' };
      },
      201,
    );
  }),

  transition('submit', 'branch.create', ['DRAFT'], 'PENDING_APPROVAL', 'branch.submit', false),
  transition(
    'activate',
    'branch.activate',
    ['PENDING_APPROVAL'],
    'ACTIVE',
    'branch.activate',
    false,
    makerChecker,
  ),
  transition('suspend', 'branch.suspend', ['ACTIVE'], 'SUSPENDED', 'branch.suspend', true),
  transition(
    'reactivate',
    'branch.reactivate',
    ['SUSPENDED'],
    'ACTIVE',
    'branch.reactivate',
    false,
  ),
  transition(
    'close',
    'branch.close',
    ['ACTIVE', 'SUSPENDED'],
    'CLOSED',
    'branch.close',
    true,
    nothingActiveBelow,
  ),

  route('GET', '/api/v1/tenant/branch-assignments', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'branch_assignment.view', 'branch');
    const requested = context.query.get('branch_id');
    const selected = access.claims.branchId;
    // With a branch selected the search is forced to it; asking for another is a 404 (BG-03).
    if (selected !== null && requested && requested !== selected) throw branchNotFound();
    const branchId = selected ?? requested;
    const type = context.query.get('assignment_type');
    const status = context.query.get('status');
    const rows = context.state.branchAssignments.filter(
      (row) =>
        row.organisationId === access.organisation.id &&
        (!branchId || row.branchId === branchId) &&
        (!type || row.type === type) &&
        (!status || row.status === status),
    );
    sendJson(context.res, 200, pageOf(rows.map(assignmentWire), context.query));
  }),

  route('POST', '/api/v1/tenant/branch-assignments', async (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'user.assign_branch');
    requirePermission(access, 'branch_assignment.view', 'branch');
    const body = objectBody(await readBody(context.req), [
      'user_id',
      'branch_id',
      'assignment_type',
    ]);
    const userId = stringField(body, 'user_id', { required: true }) ?? '';
    const type = stringField(body, 'assignment_type', { required: true }) ?? '';
    if (!ASSIGNMENT_TYPES.includes(type)) {
      throw problem(400, 'invalid_json', 'Malformed request body.');
    }
    const branch = reachableBranch(
      access,
      stringField(body, 'branch_id', { required: true }) ?? '',
    );
    sendIdempotent(
      context,
      body,
      () => {
        const { state } = context;
        const member = state.memberships.find(
          (m) => m.userId === userId && m.organisationId === access.organisation.id,
        );
        if (!member) throw problem(404, 'resource_not_found', 'User not found.');
        if (branch.status !== 'ACTIVE' || member.status === 'REVOKED') {
          throw problem(
            409,
            'conflict',
            'The branch or the membership does not allow new assignments.',
          );
        }
        // One ACTIVE row per (user, branch, type): a repeat returns the existing row.
        const existing = state.branchAssignments.find(
          (row) =>
            row.userId === userId &&
            row.branchId === branch.id &&
            row.type === type &&
            row.status === 'ACTIVE',
        );
        if (existing) return assignmentWire(existing);
        const created: FakeBranchAssignment = {
          id: randomUUID(),
          organisationId: access.organisation.id,
          userId,
          branchId: branch.id,
          type,
          status: 'ACTIVE',
        };
        state.branchAssignments.push(created);
        recordAuditEvent(state, access, {
          entityType: 'BRANCH',
          entityId: branch.id,
          action: 'branch.assign_user',
          reason: null,
        });
        return assignmentWire(created);
      },
      201,
    );
  }),

  route('DELETE', '/api/v1/tenant/branch-assignments/:assignment_id', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'user.revoke_branch');
    requirePermission(access, 'branch_assignment.view', 'branch');
    const { state } = context;
    const row = state.branchAssignments.find(
      (candidate) =>
        candidate.id === context.params.assignment_id &&
        candidate.organisationId === access.organisation.id,
    );
    if (!row) throw problem(404, 'resource_not_found', 'Branch assignment not found.');
    reachableBranch(access, row.branchId);
    sendIdempotent(context, {}, () => {
      if (row.status !== 'ACTIVE')
        throw problem(409, 'conflict', 'The assignment is already revoked.');
      const member = state.memberships.find(
        (m) => m.userId === row.userId && m.organisationId === row.organisationId,
      );
      const others = state.branchAssignments.some(
        (c) =>
          c.id !== row.id &&
          c.userId === row.userId &&
          c.organisationId === row.organisationId &&
          c.status === 'ACTIVE',
      );
      if (member && NEED_A_BRANCH.includes(member.type) && !others) {
        throw problem(
          409,
          'conflict',
          "A staff or admin member's last branch assignment can't be revoked.",
        );
      }
      row.status = 'REVOKED';
      recordAuditEvent(state, access, {
        entityType: 'BRANCH',
        entityId: row.branchId,
        action: 'branch.revoke_user',
        reason: null,
      });
      // ponytail: summary fields only; the real API returns BranchAssignmentDetail and the UI
      // ignores the body.
      return assignmentWire(row);
    });
  }),
];
