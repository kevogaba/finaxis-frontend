import { parseListSort, sortQuery, type ListSort } from '@/lib/api/list-sort';
import { parsePaging } from '@/lib/api/paging';
import { toQueryString } from '@/lib/api/query-string';
import {
  ROLE_SORT_FIELDS,
  ROLE_STATUSES,
  type RoleSortField,
  type RoleStatus,
} from './role-contract';

export const DEFAULT_ROLE_PAGE_SIZE = 10;
export const DEFAULT_ROLE_SORT: ListSort<RoleSortField> = { by: 'createdAt', dir: 'DESC' };

/** The directory's Type filter: the URL's `type` → the wire's `system_role`. */
export const ROLE_TYPE_FILTERS = ['system', 'custom'] as const;
export type RoleTypeFilter = (typeof ROLE_TYPE_FILTERS)[number];

const SYSTEM_ROLE: Record<RoleTypeFilter, string> = { system: 'true', custom: 'false' };

export interface RoleListQuery {
  q?: string;
  status?: RoleStatus;
  type?: RoleTypeFilter;
  sort: ListSort<RoleSortField>;
  page: number;
  size: number;
}

/** URL → validated directory query; unknown statuses, types and sort fields are dropped, never
 * sent. */
export function parseRoleListQuery(params: URLSearchParams): RoleListQuery {
  const query: RoleListQuery = {
    ...parsePaging(params, DEFAULT_ROLE_PAGE_SIZE),
    sort: parseListSort(params, ROLE_SORT_FIELDS, DEFAULT_ROLE_SORT),
  };
  const q = params.get('q')?.trim().slice(0, 100);
  if (q) query.q = q;
  const status = ROLE_STATUSES.find((value) => value === params.get('status'));
  if (status) query.status = status;
  const type = ROLE_TYPE_FILTERS.find((value) => value === params.get('type'));
  if (type) query.type = type;
  return query;
}

export function roleListApiPath(query: RoleListQuery): string {
  return `/api/v1/tenant/roles${toQueryString({
    q: query.q,
    status: query.status,
    system_role: query.type === undefined ? undefined : SYSTEM_ROLE[query.type],
    ...sortQuery(query.sort),
    page: query.page,
    size: query.size,
  })}`;
}
