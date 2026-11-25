import 'server-only';
import { cache } from 'react';
import { toQueryString } from '@/lib/api/query-string';
import { apiGet } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import { tenantDetailSchema, tenantPageSchema } from './tenant-contract';
import { tenantListApiPath, type TenantListQuery } from './tenant-query';

export function listTenants(query: TenantListQuery) {
  return apiGet(tenantListApiPath(query), tenantPageSchema);
}

/** One read per request: the record layout (hero) and its tabs share it. `async`, so a malformed id
 * rejects (a `load()` failure) instead of throwing synchronously past `load()`. */
export const getTenant = cache(async (tenantId: string) => {
  const id = uuidSchema.parse(tenantId);
  return await apiGet(`/api/v1/platform/tenants/${id}`, tenantDetailSchema);
});

/**
 * BG-07: a duplicate `tenant_code` fails with the generic 409 `conflict`, so a failed create or
 * amend looks it up. `q` is a case-insensitive substring match on code or name (contract §A; codes
 * hold no `%` or `_`), so the codes are compared exactly here, ignoring case. An amend passes its
 * own id as `exceptTenantId`: an unchanged code matches the draft itself, which is no duplicate
 * (the platform's own check excepts it too). ponytail: one page of 100 matches — a code buried
 * deeper still reaches the generic 409.
 */
export async function tenantCodeTaken(code: string, exceptTenantId?: string): Promise<boolean> {
  const matches = await apiGet(
    `/api/v1/platform/tenants${toQueryString({ q: code, page: 0, size: 100 })}`,
    tenantPageSchema,
  );
  const wanted = code.toLowerCase();
  const except = exceptTenantId?.toLowerCase();
  return matches.items.some(
    (tenant) => tenant.tenantCode.toLowerCase() === wanted && tenant.id.toLowerCase() !== except,
  );
}
