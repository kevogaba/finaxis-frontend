import { toQueryString } from '@/lib/api/query-string';
import type { UserListQuery } from '@/modules/administration/users/user-query';

/** An institution's users from the platform context (contract §E.2): newest first, no sort. The
 * platform organisation's id lists the platform's own members (BG-10). */
export function institutionUserListApiPath(tenantId: string, query: UserListQuery): string {
  return `/api/v1/platform/tenants/${tenantId}/users${toQueryString({
    q: query.q,
    user_status: query.userStatus,
    membership_status: query.membershipStatus,
    page: query.page,
    size: query.size,
  })}`;
}

export function institutionUsersHref(tenantId: string): string {
  return `/platform-admin/tenants/${tenantId}/users`;
}

export const PLATFORM_USERS_HREF = '/platform-admin/users';
