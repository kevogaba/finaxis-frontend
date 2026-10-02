import { parseListSort, sortQuery, type ListSort } from '@/lib/api/list-sort';
import { parsePaging } from '@/lib/api/paging';
import { toQueryString } from '@/lib/api/query-string';
import {
  BRANCH_SORT_FIELDS,
  BRANCH_STATUSES,
  type BranchSortField,
  type BranchStatus,
} from './branch-contract';

export const DEFAULT_BRANCH_PAGE_SIZE = 10;
export const DEFAULT_BRANCH_SORT: ListSort<BranchSortField> = { by: 'createdAt', dir: 'DESC' };

export interface BranchListQuery {
  q?: string;
  status?: BranchStatus;
  type?: string;
  sort: ListSort<BranchSortField>;
  page: number;
  size: number;
}

/** URL → validated directory query; unknown statuses and sort fields are dropped, never sent. */
export function parseBranchListQuery(params: URLSearchParams): BranchListQuery {
  const query: BranchListQuery = {
    ...parsePaging(params, DEFAULT_BRANCH_PAGE_SIZE),
    sort: parseListSort(params, BRANCH_SORT_FIELDS, DEFAULT_BRANCH_SORT),
  };
  const q = params.get('q')?.trim().slice(0, 100);
  if (q) query.q = q;
  const status = BRANCH_STATUSES.find((value) => value === params.get('status'));
  if (status) query.status = status;
  // Free text on the wire: an unknown type returns an empty page, never an error (contract §A).
  const type = params.get('type')?.trim().slice(0, 50);
  if (type) query.type = type;
  return query;
}

export function branchListApiPath(query: BranchListQuery): string {
  return `/api/v1/branches${toQueryString({
    q: query.q,
    status: query.status,
    type: query.type,
    ...sortQuery(query.sort),
    page: query.page,
    size: query.size,
  })}`;
}
