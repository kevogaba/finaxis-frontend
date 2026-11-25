import { isActivePermission, viewsRequiredBy } from './catalogue.mts';
import { decodeContext } from './context-token.mts';
import type { ContextClaims } from './context-token.mts';
import { problem } from './http.mts';
import type { RouteContext } from './router.mts';
import type { FakeBranchAssignment, FakeMembership, FakeOrganisation, RunState } from './state.mts';

export const PLATFORM_ORGANISATION_ID = '00000000-0000-0000-0000-000000000000';

export interface AccessContext {
  state: RunState;
  claims: ContextClaims;
  organisation: FakeOrganisation;
  membership: FakeMembership;
  /** Everything the context holds: TENANT grants plus, with a branch selected, that branch's
   * BRANCH grants — what `/auth/me` reports. */
  permissions: ReadonlySet<string>;
  /** TENANT-scope grants only (contract §E "T"). */
  tenantPermissions: ReadonlySet<string>;
}

/** Contract §E.4: `tenant` counts TENANT grants only; `branch` also counts BRANCH grants at the
 * selected branch. */
export type PermissionScope = 'tenant' | 'branch';

/** ACTIVE assignment rows on ACTIVE branches — one row per assignment, so branches can repeat. */
export function activeAssignmentRows(
  state: RunState,
  userId: string,
  organisationId: string,
): FakeBranchAssignment[] {
  return state.branchAssignments.filter(
    (row) =>
      row.userId === userId &&
      row.organisationId === organisationId &&
      row.status === 'ACTIVE' &&
      state.branches.some((branch) => branch.id === row.branchId && branch.status === 'ACTIVE'),
  );
}

function effectivePermissions(
  state: RunState,
  claims: ContextClaims,
): { all: Set<string>; tenant: Set<string> } {
  const all = new Set<string>();
  const tenant = new Set<string>();
  for (const assignment of state.roleAssignments) {
    if (
      assignment.userId !== claims.userId ||
      assignment.organisationId !== claims.organisationId ||
      assignment.status !== 'ACTIVE'
    ) {
      continue;
    }
    // A BRANCH grant counts only while its branch is selected — never at institution level.
    if (
      assignment.scopeType === 'BRANCH' &&
      (claims.branchId === null || assignment.branchId !== claims.branchId)
    ) {
      continue;
    }
    const role = state.roles.find((candidate) => candidate.id === assignment.roleId);
    if (role?.status !== 'ACTIVE') {
      continue;
    }
    // Runtime honours only ACTIVE codes (V21): a DEPRECATED grant confers nothing.
    for (const code of role.permissions.filter(isActivePermission)) {
      all.add(code);
      if (assignment.scopeType === 'TENANT') tenant.add(code);
    }
  }
  return { all, tenant };
}

export interface PermissionScopeEntry {
  code: string;
  scope: 'TENANT' | 'BRANCH';
  branch_ids?: string[];
}

/** `/auth/me`'s `permission_scopes` (BG-33): every ACTIVE code the member holds through an ACTIVE
 * role, over every ACTIVE branch rather than only the selected one, sorted by code. A code held
 * tenant-wide is one TENANT entry, with no `branch_ids`. */
export function permissionScopes(
  state: RunState,
  userId: string,
  organisationId: string,
): PermissionScopeEntry[] {
  const tenant = new Set<string>();
  const branches = new Map<string, Set<string>>();
  for (const assignment of state.roleAssignments) {
    const role = state.roles.find((candidate) => candidate.id === assignment.roleId);
    const branchActive =
      assignment.scopeType === 'TENANT' ||
      state.branches.some((row) => row.id === assignment.branchId && row.status === 'ACTIVE');
    if (
      assignment.userId !== userId ||
      assignment.organisationId !== organisationId ||
      assignment.status !== 'ACTIVE' ||
      role?.status !== 'ACTIVE' ||
      !branchActive
    ) {
      continue;
    }
    for (const code of role.permissions.filter(isActivePermission)) {
      if (assignment.scopeType === 'TENANT') tenant.add(code);
      else branches.set(code, (branches.get(code) ?? new Set()).add(assignment.branchId ?? ''));
    }
  }
  return [...new Set([...tenant, ...branches.keys()])]
    .sort()
    .map((code) =>
      tenant.has(code)
        ? { code, scope: 'TENANT' }
        : { code, scope: 'BRANCH', branch_ids: [...(branches.get(code) ?? [])].sort() },
    );
}

/**
 * Contract §E.1: discovery and selection need `auth.select_organisation` from an ACTIVE
 * tenant-scope role assignment in the target organisation (no context exists yet, so branch-scope
 * grants can't count).
 */
export function canSelectOrganisation(
  state: RunState,
  userId: string,
  organisationId: string,
): boolean {
  return state.roleAssignments.some(
    (assignment) =>
      assignment.userId === userId &&
      assignment.organisationId === organisationId &&
      assignment.status === 'ACTIVE' &&
      assignment.scopeType === 'TENANT' &&
      state.roles.some(
        (role) =>
          role.id === assignment.roleId &&
          role.status === 'ACTIVE' &&
          role.permissions.includes('auth.select_organisation'),
      ),
  );
}

const invalidContext = () =>
  problem(403, 'invalid_active_tenant_context', 'Active tenant context is invalid or unavailable.');

/** Mirrors SecurityConfiguration's per-request context re-validation (contract §A "Context"). */
export function requireContext({ req, state }: RouteContext): AccessContext {
  const header = req.headers['x-active-organisation-context'];
  const claims = decodeContext(Array.isArray(header) ? header[0] : header);
  if (claims?.userId !== state.actorUserId) {
    throw invalidContext();
  }
  const user = state.users.find((candidate) => candidate.id === claims.userId);
  const membership = state.memberships.find((candidate) => candidate.id === claims.membershipId);
  const organisation = state.organisations.find(
    (candidate) => candidate.id === claims.organisationId,
  );
  if (
    (user?.status !== 'ACTIVE' && user?.status !== 'INVITED') ||
    membership?.status !== 'ACTIVE' ||
    organisation?.status !== 'ACTIVE'
  ) {
    throw invalidContext();
  }
  if (
    claims.branchId !== null &&
    !activeAssignmentRows(state, claims.userId, claims.organisationId).some(
      (row) => row.branchId === claims.branchId,
    )
  ) {
    throw invalidContext();
  }
  const { all, tenant } = effectivePermissions(state, claims);
  return {
    state,
    claims,
    organisation,
    membership,
    permissions: all,
    tenantPermissions: tenant,
  };
}

/** A mutation also needs each view the catalogue pairs with it, at the same scope, before any
 * lookup or write (ADR 0030); the 403 names the first missing code in its detail. */
export function requirePermission(
  access: AccessContext,
  code: string,
  scope: PermissionScope = 'tenant',
): void {
  const held = scope === 'branch' ? access.permissions : access.tenantPermissions;
  const missing = [code, ...viewsRequiredBy(code)].find((candidate) => !held.has(candidate));
  if (missing !== undefined) {
    throw problem(403, 'forbidden', `Missing permission: ${missing}.`);
  }
}

/** Adding to your own access also needs `user.assign_self` (and its view) tenant-wide, which
 * only the seeded administrators hold (#342, ADR 0044): a self-assignment, or widening a role
 * the caller holds. */
export function requireAssignSelf(access: AccessContext, own: boolean): void {
  if (own) requirePermission(access, 'user.assign_self');
}

/** `RoleManagementService.requireMayWidenHeldRole`: the caller holds the role through an ACTIVE
 * assignment at any scope. */
export function holdsRole(access: AccessContext, roleId: string): boolean {
  return access.state.roleAssignments.some(
    (row) =>
      row.userId === access.claims.userId &&
      row.organisationId === access.organisation.id &&
      row.roleId === roleId &&
      row.status === 'ACTIVE',
  );
}

/** Mirrors `WrongContext` (BG-30): a stable code, with the sentence in the detail. */
export function requirePlatformContext(access: AccessContext): void {
  if (access.organisation.id !== PLATFORM_ORGANISATION_ID) {
    throw problem(
      403,
      'platform_context_required',
      'Reserved platform organisation context is required for this route.',
    );
  }
}

/** See `requirePlatformContext`: the platform organisation is no tenant context. */
export function requireTenantContext(access: AccessContext): void {
  if (access.organisation.id === PLATFORM_ORGANISATION_ID) {
    throw problem(
      403,
      'tenant_context_required',
      'This route is restricted to non-platform tenant context.',
    );
  }
}
