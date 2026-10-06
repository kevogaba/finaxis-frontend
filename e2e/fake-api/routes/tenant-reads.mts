import { requireContext, requirePermission, requireTenantContext } from '../access.mts';
import { pageOf, problem, sendJson } from '../http.mts';
import { route } from '../router.mts';
import type { Route } from '../router.mts';
import type { FakeBranch, FakeMembership, FakeUser, RunState } from '../state.mts';

const BRANCH_SORTS: Record<string, (branch: FakeBranch) => string> = {
  branchCode: (branch) => branch.code,
  branchName: (branch) => branch.name,
  branchType: (branch) => branch.type,
  status: (branch) => branch.status,
  createdAt: (branch) => branch.createdAt,
};

/** `/branches` and its platform twin (contract §E.2 "sort as /branches"): filter, sort, page. An
 * off-list `sort_by` is a 500 (BG-07); `Object.hasOwn` keeps `toString` out of the allow-list. */
export function branchPage(state: RunState, organisationId: string, query: URLSearchParams) {
  const q = query.get('q')?.toLowerCase();
  const status = query.get('status');
  const type = query.get('type');
  const sortBy = query.get('sort_by') ?? 'createdAt';
  const direction = (query.get('sort_dir') ?? 'DESC').toUpperCase();
  // `sort_by` is user-controlled: `toString` must not resolve to an `Object.prototype` member.
  const key = Object.hasOwn(BRANCH_SORTS, sortBy) ? BRANCH_SORTS[sortBy] : undefined;
  if (!key || (direction !== 'ASC' && direction !== 'DESC')) {
    throw problem(500, 'internal_error', 'An unexpected error occurred.');
  }
  const branches = state.branches
    .filter(
      (branch) =>
        branch.organisationId === organisationId &&
        (!q || branch.code.toLowerCase().includes(q) || branch.name.toLowerCase().includes(q)) &&
        (!status || branch.status === status) &&
        (!type || branch.type === type),
    )
    .sort((a, b) => key(a).localeCompare(key(b)));
  const ordered = direction === 'DESC' ? branches.reverse() : branches;
  return pageOf(
    ordered.map((branch) => ({
      id: branch.id,
      organisation_id: branch.organisationId,
      branch_code: branch.code,
      branch_name: branch.name,
      branch_type: branch.type,
      status: branch.status,
      created_at: branch.createdAt,
    })),
    query,
  );
}

export function userSummaryWire(user: FakeUser, membership: FakeMembership) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.displayName,
    user_status: user.status,
    membership_status: membership.status,
  };
}

/** `/tenant/users` and `/platform/tenants/{id}/users`: newest first (reverse seed order). */
export function institutionUserPage(
  state: RunState,
  organisationId: string,
  query: URLSearchParams,
) {
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
    rows.map(({ user, membership }) => userSummaryWire(user, membership)),
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
    sendJson(context.res, 200, userSummaryWire(user, membership));
  }),

  route('GET', '/api/v1/branches', (context) => {
    const access = requireContext(context);
    requireTenantContext(access);
    requirePermission(access, 'branch.view');
    sendJson(context.res, 200, branchPage(context.state, access.organisation.id, context.query));
  }),

  route('GET', '/api/v1/tenant/users', (context) => {
    const access = requireContext(context);
    requireTenantContext(access);
    requirePermission(access, 'user.view');
    sendJson(
      context.res,
      200,
      institutionUserPage(context.state, access.organisation.id, context.query),
    );
  }),
];
