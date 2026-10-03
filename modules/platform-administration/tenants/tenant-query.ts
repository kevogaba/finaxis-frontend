import { parseListSort, sortQuery, type ListSort } from '@/lib/api/list-sort';
import { parsePaging } from '@/lib/api/paging';
import { toQueryString } from '@/lib/api/query-string';
import { instantSchema } from '@/lib/api/wire';
import {
  TENANT_SORT_FIELDS,
  TENANT_STATUSES,
  type TenantSortField,
  type TenantStatus,
} from './tenant-contract';

export const DEFAULT_TENANT_PAGE_SIZE = 10;
export const DEFAULT_TENANT_SORT: ListSort<TenantSortField> = { by: 'createdAt', dir: 'DESC' };

export interface TenantListQuery {
  q?: string;
  status?: TenantStatus;
  country?: string;
  createdFrom?: string;
  createdTo?: string;
  sort: ListSort<TenantSortField>;
  page: number;
  size: number;
}

/** An ISO instant from the toolbar's datetime field (contract §A); anything else is dropped. */
function instantParam(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name);
  return value && instantSchema.safeParse(value).success ? value : undefined;
}

/** URL → validated directory query. Unknown statuses, countries, dates and sort fields are dropped,
 * never sent: an unknown `sort_by` is a backend 500, and an unknown filter value an empty page. */
export function parseTenantListQuery(params: URLSearchParams): TenantListQuery {
  const query: TenantListQuery = {
    ...parsePaging(params, DEFAULT_TENANT_PAGE_SIZE),
    sort: parseListSort(params, TENANT_SORT_FIELDS, DEFAULT_TENANT_SORT),
  };
  const q = params.get('q')?.trim().slice(0, 100);
  if (q) query.q = q;
  const status = TENANT_STATUSES.find((value) => value === params.get('status'));
  if (status) query.status = status;
  const country = params.get('country');
  if (country && /^[A-Z]{2}$/.test(country)) query.country = country;
  const createdFrom = instantParam(params, 'createdFrom');
  if (createdFrom) query.createdFrom = createdFrom;
  const createdTo = instantParam(params, 'createdTo');
  if (createdTo) query.createdTo = createdTo;
  return query;
}

export function hasTenantFilters(query: TenantListQuery): boolean {
  return Boolean(query.q ?? query.status ?? query.country ?? query.createdFrom ?? query.createdTo);
}

export function tenantListApiPath(query: TenantListQuery): string {
  return `/api/v1/platform/tenants${toQueryString({
    q: query.q,
    status: query.status,
    country: query.country,
    created_from: query.createdFrom,
    created_to: query.createdTo,
    ...sortQuery(query.sort),
    page: query.page,
    size: query.size,
  })}`;
}
