import {
  actorRef,
  branchVisibility,
  canSee,
  requireContext,
  requirePermission,
  requireTenantContext,
} from '../access.mts';
import type { AccessContext, BranchVisibility } from '../access.mts';
import { pageOf, problem, sendJson, sortKey } from '../http.mts';
import { route } from '../router.mts';
import type { Route } from '../router.mts';
import type { FakeBranch, FakeMembership, FakeUser } from '../state.mts';
import { branchMakersWire } from './branches.mts';

const BRANCH_SORTS: Record<string, (branch: FakeBranch) => string> = {
  branchCode: (branch) => branch.code,
  branchName: (branch) => branch.name,
  branchType: (branch) => branch.type,
  status: (branch) => branch.status,
  createdAt: (branch) => branch.createdAt,
};

/** The branch lists' sort: an off-list `sort_by` or `sort_dir` is a 400 (`sortKey`, BG-26). */
const branchSort = (query: URLSearchParams) =>
  sortKey(query, BRANCH_SORTS, { by: 'createdAt', dir: 'DESC' });

/** `/branches` and its platform twin (contract §E.2 "sort as /branches"): filter, sort, page. A
 * caller that validates the sort earlier passes it in. */
export function branchPage(
  access: AccessContext,
  organisationId: string,
  query: URLSearchParams,
  { key, descending } = branchSort(query),
  visibility: BranchVisibility = 'all',
) {
  const q = query.get('q')?.toLowerCase();
  const status = query.get('status');
  const type = query.get('type');
  const branches = access.state.branches
    .filter(
      (branch) =>
        branch.organisationId === organisationId &&
        canSee(visibility, branch.id) &&
        (!q || branch.code.toLowerCase().includes(q) || branch.name.toLowerCase().includes(q)) &&
        (!status || branch.status === status) &&
        (!type || branch.type === type),
    )
    .sort((a, b) => key(a).localeCompare(key(b)));
  const ordered = descending ? branches.reverse() : branches;
  return pageOf(
    ordered.map((branch) => ({
      id: branch.id,
      organisation_id: branch.organisationId,
      branch_code: branch.code,
      branch_name: branch.name,
      branch_type: branch.type,
      status: branch.status,
      created_at: branch.createdAt,
      ...branchMakersWire(access, branch),
    })),
    query,
  );
}

export function userSummaryWire(access: AccessContext, user: FakeUser, membership: FakeMembership) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.displayName,
    user_status: user.status,
    membership_status: membership.status,
    membership_id: membership.id,
    membership_type: membership.type,
    // ponytail: the fake keeps no account creation time, so the membership's stands in.
    created_at: membership.createdAt,
    membership_created_at: membership.createdAt,
    created_by: actorRef(access, membership.organisationId, membership.invitedBy),
  };
}

/** `/tenant/users` and `/platform/tenants/{id}/users`: newest first (reverse seed order). */
export function institutionUserPage(
  access: AccessContext,
  organisationId: string,
  query: URLSearchParams,
) {
  const { state } = access;
  const q = query.get('q')?.toLowerCase();
  const userStatus = query.get('user_status');
  const membershipStatus = query.get('membership_status');
  const rows = state.memberships
    .filter((membership) => membership.organisationId === organisationId)
    .flatMap((membership) => {
      const user = state.users.find((candidate) => candidate.id === membership.userId);
      return user ? [{ user, membership }] : [];
    })
    .filter(
      ({ user, membership }) =>
        (!q ||
          [user.username, user.email, user.displayName].some((value) =>
            value.toLowerCase().includes(q),
          )) &&
        (!userStatus || user.status === userStatus) &&
        (!membershipStatus || membership.status === membershipStatus),
    )
    // ponytail: "newest user first" = reverse seed order; the fake keeps no user creation time.
    .reverse();
  return pageOf(
    rows.map(({ user, membership }) => userSummaryWire(access, user, membership)),
    query,
  );
}

export const tenantReadRoutes: Route[] = [
  route('GET', '/api/v1/tenant', (context) => {
    const access = requireContext(context);
    requireTenantContext(access);
    requirePermission(access, 'tenant.view');
    const tenant = access.organisation;
    sendJson(context.res, 200, {
      id: tenant.id,
      tenant_code: tenant.code,
      display_name: tenant.displayName,
      country_code: tenant.countryCode,
      base_currency_code: tenant.baseCurrencyCode,
      timezone: tenant.timezone,
      status: tenant.status,
      bootstrap_status: tenant.bootstrapStatus,
      bootstrap_failure_code: tenant.bootstrapFailureCode,
      created_at: tenant.createdAt,
      updated_at: tenant.updatedAt,
      // Shown to platform callers only (BG-08).
      requested_by: null,
      submitted_by: null,
    });
  }),

  route('GET', '/api/v1/tenant/users/:user_id', (context) => {
    const access = requireContext(context);
    requireTenantContext(access);
    requirePermission(access, 'user.view');
    const membership = context.state.memberships.find(
      (candidate) =>
        candidate.userId === context.params.user_id &&
        candidate.organisationId === access.organisation.id,
    );
    const user = context.state.users.find((candidate) => candidate.id === context.params.user_id);
    if (!membership || !user) {
      throw problem(404, 'resource_not_found', 'User not found.');
    }
    sendJson(context.res, 200, userSummaryWire(access, user, membership));
  }),

  route('GET', '/api/v1/branches', (context) => {
    const access = requireContext(context);
    requireTenantContext(access);
    // No endpoint gate here (ADR 0030 point 5), and FoundationQueryService.searchBranches checks
    // the sort before branch.view, so a bad sort is a 400 even for a caller who can't list.
    const sort = branchSort(context.query);
    // BG-03: target-aware. A tenant-wide `branch.view` lists every branch, a branch-scoped one the
    // ACTIVE branches it covers, whichever branch is selected; held nowhere is a 403 naming nothing
    // (`requireListRestriction`).
    const visibility = branchVisibility(access, 'branch.view');
    if (visibility !== 'all' && visibility.size === 0) {
      throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
    }
    sendJson(
      context.res,
      200,
      branchPage(access, access.organisation.id, context.query, sort, visibility),
    );
  }),

  route('GET', '/api/v1/tenant/users', (context) => {
    const access = requireContext(context);
    requireTenantContext(access);
    requirePermission(access, 'user.view');
    sendJson(context.res, 200, institutionUserPage(access, access.organisation.id, context.query));
  }),
];
