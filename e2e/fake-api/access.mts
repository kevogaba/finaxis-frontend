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

/** A tenant-wide check (`requireTenantPermission`): a mutation also needs each view the catalogue
 * pairs with it, tenant-wide, before any lookup or write (ADR 0030); the 403 names the first missing
 * code in its detail. */
export function requirePermission(access: AccessContext, code: string): void {
  const missing = [code, ...viewsRequiredBy(code)].find(
    (candidate) => !access.tenantPermissions.has(candidate),
  );
  if (missing !== undefined) {
    throw problem(403, 'forbidden', `Missing permission: ${missing}.`);
  }
}

/** A route's own `@PreAuthorize("hasAnyAuthority(...)")` gate: one of `codes` among the principal's
 * authorities, the selected context's effective set (`/auth/me`'s `permissions`), with no view
 * pairing; Spring's refusal names nothing (`ApiExceptionHandler.accessDenied`). The service's own
 * checks follow it. */
export function requireAuthority(access: AccessContext, codes: readonly string[]): void {
  if (!codes.some((code) => access.permissions.has(code))) {
    throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
  }
}

/** Where a code is held (`PermissionGuard.branchVisibility`, BG-03): every branch for a TENANT
 * grant, else the ACTIVE branches its BRANCH grants name, whichever branch is selected (#242). */
export type BranchVisibility = 'all' | ReadonlySet<string>;

export function branchVisibility(access: AccessContext, code: string): BranchVisibility {
  const entry = permissionScopes(access.state, access.claims.userId, access.organisation.id).find(
    (candidate) => candidate.code === code,
  );
  if (entry === undefined) return new Set();
  return entry.scope === 'TENANT' ? 'all' : new Set(entry.branch_ids);
}

export const canSee = (visibility: BranchVisibility, branchId: string): boolean =>
  visibility === 'all' || visibility.has(branchId);

const missingPermission = (code: string) =>
  problem(403, 'forbidden', `Missing permission: ${code}.`);

/** `requireBranchPermission` (BG-03): the code and each view it implies (ADR 0030) on the target
 * branch, before any lookup, so an unknown id is a 403 to a branch-scoped caller, never an oracle. */
export function requireBranchPermission(
  access: AccessContext,
  code: string,
  branchId: string,
): void {
  const missing = [code, ...viewsRequiredBy(code)].find(
    (candidate) => !canSee(branchVisibility(access, candidate), branchId),
  );
  if (missing !== undefined) throw missingPermission(missing);
}

/** `mutationBranchVisibility`: where the code and every view it implies are all held; a 403 naming
 * the first code held nowhere. A route that names only an assignment id authorises through it. */
export function mutationVisibility(access: AccessContext, code: string): BranchVisibility {
  const scoped = [code, ...viewsRequiredBy(code)].flatMap((candidate) => {
    const held = branchVisibility(access, candidate);
    if (held === 'all') return [];
    if (held.size === 0) throw missingPermission(candidate);
    return [held];
  });
  const [first, ...rest] = scoped;
  if (first === undefined) return 'all';
  return new Set([...first].filter((id) => rest.every((held) => held.has(id))));
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

/** `ActorRefResponse` (BG-08): who made a record in `organisationId`. `null` for the system or an id
 * with no account, and for a tenant caller when that user isn't a member of the organisation
 * (`ActorRef.shownTo`); a platform caller sees every maker. */
export function actorRef(
  access: AccessContext,
  organisationId: string,
  userId: string | undefined,
): { id: string; display_name: string } | null {
  const user = access.state.users.find((candidate) => candidate.id === userId);
  if (!user) return null;
  const member = access.state.memberships.some(
    (row) => row.userId === user.id && row.organisationId === organisationId,
  );
  return member || access.organisation.id === PLATFORM_ORGANISATION_ID
    ? { id: user.id, display_name: user.displayName }
    : null;
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
