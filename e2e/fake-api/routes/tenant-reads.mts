import { requireContext, requirePermission, requireTenantContext } from '../access.mts';
import { pageOf, problem, sendJson } from '../http.mts';
import { route } from '../router.mts';
import type { Route } from '../router.mts';
import type { FakeBranch } from '../state.mts';

const BRANCH_SORTS: Record<string, (branch: FakeBranch) => string> = {
  branchCode: (branch) => branch.code,
  branchName: (branch) => branch.name,
  branchType: (branch) => branch.type,
  status: (branch) => branch.status,
  createdAt: (branch) => branch.createdAt,
};

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
    sendJson(context.res, 200, {
      id: user.id,
      username: user.username,
      email: user.email,
      display_name: user.displayName,
      user_status: user.status,
      membership_status: membership.status,
    });
  }),

  route('GET', '/api/v1/branches', (context) => {
    const access = requireContext(context);
    requireTenantContext(access);
    requirePermission(access, 'branch.view');
    const { query } = context;
    const q = query.get('q')?.toLowerCase();
    const status = query.get('status');
    const type = query.get('type');
    const sortBy = query.get('sort_by') ?? 'createdAt';
    const direction = (query.get('sort_dir') ?? 'DESC').toUpperCase();
    const key = BRANCH_SORTS[sortBy];
    if (!key || (direction !== 'ASC' && direction !== 'DESC')) {
      throw problem(500, 'internal_error', 'An unexpected error occurred.');
    }
    const branches = context.state.branches
      .filter(
        (branch) =>
          branch.organisationId === access.organisation.id &&
          (!q || branch.code.toLowerCase().includes(q) || branch.name.toLowerCase().includes(q)) &&
          (!status || branch.status === status) &&
          (!type || branch.type === type),
      )
      .sort((a, b) => key(a).localeCompare(key(b)));
    const ordered = direction === 'DESC' ? branches.reverse() : branches;
    sendJson(
      context.res,
      200,
      pageOf(
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
      ),
    );
  }),

  route('GET', '/api/v1/tenant/users', (context) => {
    const access = requireContext(context);
    requireTenantContext(access);
    requirePermission(access, 'user.view');
    const { query, state } = context;
    const q = query.get('q')?.toLowerCase();
    const userStatus = query.get('user_status');
    const membershipStatus = query.get('membership_status');
    const rows = state.memberships
      .filter((membership) => membership.organisationId === access.organisation.id)
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
      .reverse()
      .map(({ user, membership }) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.displayName,
        user_status: user.status,
        membership_status: membership.status,
      }));
    sendJson(context.res, 200, pageOf(rows, query));
  }),
];
