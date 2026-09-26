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
  permissions: ReadonlySet<string>;
}

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

function effectivePermissions(state: RunState, claims: ContextClaims): Set<string> {
  const permissions = new Set<string>();
  for (const assignment of state.roleAssignments) {
    if (
      assignment.userId !== claims.userId ||
      assignment.organisationId !== claims.organisationId ||
      assignment.status !== 'ACTIVE'
    ) {
      continue;
    }
    if (assignment.scopeType === 'BRANCH' && assignment.branchId !== claims.branchId) {
      continue;
    }
    const role = state.roles.find((candidate) => candidate.id === assignment.roleId);
    if (role?.status === 'ACTIVE') {
      role.permissions.forEach((code) => permissions.add(code));
    }
  }
  return permissions;
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
  return {
    state,
    claims,
    organisation,
    membership,
    permissions: effectivePermissions(state, claims),
  };
}

export function requirePermission(access: AccessContext, code: string): void {
  if (!access.permissions.has(code)) {
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
