import { parsePaging } from '@/lib/api/paging';
import { toQueryString } from '@/lib/api/query-string';
import {
  MEMBERSHIP_STATUSES,
  USER_STATUSES,
  type MembershipStatus,
  type UserStatus,
} from './user-contract';

export const DEFAULT_USER_PAGE_SIZE = 10;

export interface UserListQuery {
  q?: string;
  userStatus?: UserStatus;
  membershipStatus?: MembershipStatus;
  page: number;
  size: number;
}

/** URL → validated directory query. Unknown statuses are dropped, never sent; the endpoint has no
 * sort (contract §E.3), so none is parsed or sent. */
export function parseUserListQuery(params: URLSearchParams): UserListQuery {
  const query: UserListQuery = parsePaging(params, DEFAULT_USER_PAGE_SIZE);
  const q = params.get('q')?.trim().slice(0, 100);
  if (q) query.q = q;
  const userStatus = USER_STATUSES.find((value) => value === params.get('userStatus'));
  if (userStatus) query.userStatus = userStatus;
  const membershipStatus = MEMBERSHIP_STATUSES.find(
    (value) => value === params.get('membershipStatus'),
  );
  if (membershipStatus) query.membershipStatus = membershipStatus;
  return query;
}

export function hasUserFilters(query: UserListQuery): boolean {
  return Boolean(query.q ?? query.userStatus ?? query.membershipStatus);
}

export function userListApiPath(query: UserListQuery): string {
  return `/api/v1/tenant/users${toQueryString({
    q: query.q,
    user_status: query.userStatus,
    membership_status: query.membershipStatus,
    page: query.page,
    size: query.size,
  })}`;
}
