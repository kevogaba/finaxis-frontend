import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import { apiGet } from './tenant-api';
import { pageSchema } from './wire';

const tenantUserSchema = z
  .object({ id: z.string(), display_name: z.string(), email: z.string() })
  .transform((user) => ({ id: user.id, displayName: user.display_name, email: user.email }));

const branchNameSchema = z
  .object({ id: z.string(), branch_name: z.string(), branch_code: z.string() })
  .transform((branch) => ({
    id: branch.id,
    branchName: branch.branch_name,
    branchCode: branch.branch_code,
  }));

const tenantTimeZoneSchema = z.object({ timezone: z.string() });

/** One `GET /tenant/users/{id}` per id per request; unreadable users resolve to null. */
export const getTenantUser = cache(
  async (userId: string): Promise<{ id: string; displayName: string; email: string } | null> => {
    try {
      return await apiGet(`/api/v1/tenant/users/${encodeURIComponent(userId)}`, tenantUserSchema);
    } catch {
      return null;
    }
  },
);

// ponytail: one read per distinct visible ID (≤ 2 × page size, usually a handful of actors). Swap
// for a paged user index like getBranchIndex if the read budget (600/min) ever bites.
export async function resolveUserNames(
  ids: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const unique = [...new Set(ids)];
  const users = await Promise.all(unique.map((id) => getTenantUser(id)));
  return new Map(users.flatMap((user) => (user ? [[user.id, user.displayName] as const] : [])));
}

const BRANCH_PAGE_SIZE = 100;
// ponytail: name-resolution index capped at 500 branches; beyond that IDs render short. Add a
// backend name lookup (docs/backend-gaps.md BG-09) if tenants grow past it.
const BRANCH_PAGE_CEILING = 5;

export const getBranchIndex = cache(
  async (): Promise<ReadonlyMap<string, { name: string; code: string }>> => {
    const index = new Map<string, { name: string; code: string }>();
    try {
      for (let page = 0; page < BRANCH_PAGE_CEILING; page += 1) {
        const result = await apiGet(
          `/api/v1/branches?page=${page}&size=${BRANCH_PAGE_SIZE}&sort_by=branchName&sort_dir=ASC`,
          pageSchema(branchNameSchema),
        );
        result.items.forEach((branch) => {
          index.set(branch.id, { name: branch.branchName, code: branch.branchCode });
        });
        if (!result.page.hasNext) break;
      }
    } catch {
      // Without branch.view the index stays empty; callers fall back to short IDs.
    }
    return index;
  },
);

const roleIndexSchema = z
  .object({
    id: z.string(),
    role_code: z.string(),
    role_name: z.string(),
    system_role: z.boolean(),
    // A plain string: a lookup tolerates a status it doesn't know (the role directory doesn't).
    status: z.string(),
  })
  .transform((role) => ({
    id: role.id,
    entry: {
      name: role.role_name,
      code: role.role_code,
      status: role.status,
      systemRole: role.system_role,
    },
  }));

export interface RoleIndexEntry {
  name: string;
  code: string;
  status: string;
  systemRole: boolean;
}

const ROLE_PAGE_SIZE = 100;
// ponytail: name-resolution index capped at 500 roles (spec §6.3); beyond that IDs render short.
const ROLE_PAGE_CEILING = 5;

/** Every role by id (spec §6.3), sorted by name. It serves role names for 10's and 12's assignment
 * lists, and the ACTIVE roles for 10's and 11's role pickers. Empty without `role.view`. */
export const getRoleIndex = cache(async (): Promise<ReadonlyMap<string, RoleIndexEntry>> => {
  const index = new Map<string, RoleIndexEntry>();
  try {
    for (let page = 0; page < ROLE_PAGE_CEILING; page += 1) {
      const result = await apiGet(
        `/api/v1/tenant/roles?page=${page}&size=${ROLE_PAGE_SIZE}&sort_by=roleName&sort_dir=ASC`,
        pageSchema(roleIndexSchema),
      );
      result.items.forEach(({ id, entry }) => {
        index.set(id, entry);
      });
      if (!result.page.hasNext) break;
    }
  } catch {
    // Without role.view the index stays empty; callers fall back to short IDs.
  }
  return index;
});

export const getOrganisationTimeZone = cache(async (): Promise<string> => {
  try {
    const { timezone } = await apiGet('/api/v1/tenant', tenantTimeZoneSchema);
    // The backend validates timezones as Java ZoneIds, some of which (e.g. `UTC+3`) Intl rejects
    // with a RangeError; formatInstant would then crash the page, so fall back to UTC here too.
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone });
    return timezone;
  } catch {
    return 'UTC';
  }
});
