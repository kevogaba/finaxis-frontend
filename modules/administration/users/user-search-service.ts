import 'server-only';
import { toQueryString } from '@/lib/api/query-string';
import { apiGet } from '@/lib/api/tenant-api';
import { userPageSchema, type UserSummary } from './user-contract';
import type { TenantUserOption } from './user-option';

const SEARCH_SIZE = 10;

function toOption(user: UserSummary): TenantUserOption {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    username: user.username,
    membershipStatus: user.membershipStatus,
  };
}

/** First page only of `GET /tenant/users?q=` (username, email, name; newest first). */
export async function searchTenantUsers(q: string): Promise<TenantUserOption[]> {
  const page = await apiGet(
    `/api/v1/tenant/users${toQueryString({ q: q || undefined, size: SEARCH_SIZE })}`,
    userPageSchema,
  );
  return page.items.map(toOption);
}
