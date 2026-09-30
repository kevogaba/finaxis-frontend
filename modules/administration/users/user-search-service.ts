import 'server-only';
import { z } from 'zod';
import { toQueryString } from '@/lib/api/query-string';
import { apiGet } from '@/lib/api/tenant-api';
import { pageSchema, uuidSchema } from '@/lib/api/wire';
import type { TenantUserOption } from './user-option';

// ponytail: a search-only UserInTenantSummary; layer 10 owns the full users contract and may
// re-point this at it.
const tenantUserSchema = z
  .object({
    id: uuidSchema,
    username: z.string(),
    email: z.string(),
    display_name: z.string(),
    user_status: z.string(),
    membership_status: z.string(),
  })
  .transform((user) => ({
    id: user.id,
    displayName: user.display_name,
    email: user.email,
    username: user.username,
    membershipStatus: user.membership_status,
  }));

const SEARCH_SIZE = 10;

/** First page only of `GET /tenant/users?q=` (username, email, name; newest first). */
export async function searchTenantUsers(q: string): Promise<TenantUserOption[]> {
  const page = await apiGet(
    `/api/v1/tenant/users${toQueryString({ q: q || undefined, size: SEARCH_SIZE })}`,
    pageSchema(tenantUserSchema),
  );
  return [...page.items];
}
