import { requireContext, requirePermission, requirePlatformContext } from '../access.mts';
import { pageOf, parseInstantParam, problem, sendJson } from '../http.mts';
import { route } from '../router.mts';
import type { Route } from '../router.mts';
import type { FakeOrganisation } from '../state.mts';

const SORTS: Record<string, (tenant: FakeOrganisation) => string> = {
  tenantCode: (tenant) => tenant.code,
  displayName: (tenant) => tenant.displayName,
  countryCode: (tenant) => tenant.countryCode,
  createdAt: (tenant) => tenant.createdAt,
};

/** Mirrors FoundationQueryService.validateSort: unknown sort → 500 internal_error. */
function sortTenants(tenants: FakeOrganisation[], query: URLSearchParams): FakeOrganisation[] {
  const sortBy = query.get('sort_by') ?? 'createdAt';
  const direction = (query.get('sort_dir') ?? 'DESC').toUpperCase();
  const key = SORTS[sortBy];
  if (!key || (direction !== 'ASC' && direction !== 'DESC')) {
    throw problem(500, 'internal_error', 'An unexpected error occurred.');
  }
  const sorted = [...tenants].sort((a, b) => key(a).localeCompare(key(b)));
  return direction === 'DESC' ? sorted.reverse() : sorted;
}

function summary(tenant: FakeOrganisation) {
  return {
    id: tenant.id,
    tenant_code: tenant.code,
    display_name: tenant.displayName,
    country_code: tenant.countryCode,
    status: tenant.status,
    created_at: tenant.createdAt,
  };
}

function detail(tenant: FakeOrganisation) {
  return {
    ...summary(tenant),
    base_currency_code: tenant.baseCurrencyCode,
    timezone: tenant.timezone,
    bootstrap_status: tenant.bootstrapStatus,
    bootstrap_failure_code: tenant.bootstrapFailureCode,
    updated_at: tenant.updatedAt,
  };
}

export const platformTenantRoutes: Route[] = [
  route('GET', '/api/v1/platform/tenants', (context) => {
    const access = requireContext(context);
    requirePlatformContext(access);
    requirePermission(access, 'tenant.view');
    const { query } = context;
    const q = query.get('q')?.toLowerCase();
    const status = query.get('status');
    const country = query.get('country');
    const createdFrom = parseInstantParam(query, 'created_from');
    const createdTo = parseInstantParam(query, 'created_to');
    const tenants = context.state.organisations.filter(
      (tenant) =>
        (!q ||
          tenant.code.toLowerCase().includes(q) ||
          tenant.displayName.toLowerCase().includes(q)) &&
        (!status || tenant.status === status) &&
        (!country || tenant.countryCode === country) &&
        (createdFrom === undefined || Date.parse(tenant.createdAt) >= createdFrom) &&
        (createdTo === undefined || Date.parse(tenant.createdAt) <= createdTo),
    );
    sendJson(context.res, 200, pageOf(sortTenants(tenants, query).map(summary), query));
  }),

  route('GET', '/api/v1/platform/tenants/:tenant_id', (context) => {
    const access = requireContext(context);
    requirePlatformContext(access);
    requirePermission(access, 'tenant.view');
    const tenant = context.state.organisations.find(
      (candidate) => candidate.id === context.params.tenant_id,
    );
    if (!tenant) {
      throw problem(404, 'resource_not_found', 'Tenant not found.');
    }
    sendJson(context.res, 200, detail(tenant));
  }),
];
