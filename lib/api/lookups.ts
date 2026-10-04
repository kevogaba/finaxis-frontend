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
/** The most roles the index holds. Callers that offer the roles as options pass it to the copy that
 * says so when the scan stopped short (`getRoleIndexScan().truncated`). */
export const ROLE_INDEX_CEILING = ROLE_PAGE_SIZE * ROLE_PAGE_CEILING;

export interface RoleIndexScan {
  index: ReadonlyMap<string, RoleIndexEntry>;
  /** The scan ran out of pages while the last one it read still said there were more: the index
   * holds the first `ROLE_INDEX_CEILING` roles by name, not the whole catalogue. */
  truncated: boolean;
}

/** Every role by id (spec §6.3), sorted by name, and whether the ceiling cut it short. Empty and not
 * truncated, never partial, on any failure (for example without `role.view`). One scan per request. */
export const getRoleIndexScan = cache(async (): Promise<RoleIndexScan> => {
  const index = new Map<string, RoleIndexEntry>();
  let truncated = false;
  try {
    for (let page = 0; page < ROLE_PAGE_CEILING; page += 1) {
      const result = await apiGet(
        `/api/v1/tenant/roles?page=${page}&size=${ROLE_PAGE_SIZE}&sort_by=roleName&sort_dir=ASC`,
        pageSchema(roleIndexSchema),
      );
      result.items.forEach(({ id, entry }) => {
        index.set(id, entry);
      });
      truncated = result.page.hasNext;
      if (!truncated) break;
    }
  } catch {
    // Empty, never partial, when any page fails (e.g. without role.view); callers fall back to
    // short IDs.
    index.clear();
    truncated = false;
  }
  return { index, truncated };
});

/** The role index without the truncation flag, for callers that only resolve names (12's assignment
 * lists). A picker that offers roles as options (10's, 11's) reads `getRoleIndexScan`, so it can say
 * when the catalogue was cut short. */
export const getRoleIndex = cache(
  async (): Promise<ReadonlyMap<string, RoleIndexEntry>> => (await getRoleIndexScan()).index,
);

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
