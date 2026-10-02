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
    for (const code of role.permissions) {
      all.add(code);
      if (assignment.scopeType === 'TENANT') tenant.add(code);
    }
  }
  return { all, tenant };
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

export function requirePermission(
  access: AccessContext,
  code: string,
  scope: PermissionScope = 'tenant',
): void {
  const held = scope === 'branch' ? access.permissions : access.tenantPermissions;
  if (!held.has(code)) {
    throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
  }
}

/**
 * The `code` argument below is a full sentence, not a snake_case slug — that's not a mistake.
 * Mirrors ForbiddenOperationException's "sentence codes" (contract §I): the backend's `detail` for
 * every one of these wrong-context 403s is the same generic "not permitted" text (its default
 * `safeDetail`); only `code` carries the specific, human-readable reason.
 */
export function requirePlatformContext(access: AccessContext): void {
  if (access.organisation.id !== PLATFORM_ORGANISATION_ID) {
    throw problem(
      403,
      'Reserved platform organisation context is required for this route.',
      'You are not permitted to perform this action.',
    );
  }
}

/** See `requirePlatformContext`'s note on the backend's "sentence codes". */
export function requireTenantContext(access: AccessContext): void {
  if (access.organisation.id === PLATFORM_ORGANISATION_ID) {
    throw problem(
      403,
      'Branch operations are restricted to non-platform tenant context.',
      'You are not permitted to perform this action.',
    );
  }
}
