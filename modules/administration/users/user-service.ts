import 'server-only';
import { cache } from 'react';
import { toQueryString } from '@/lib/api/query-string';
import { apiGet } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import { listAuditEvents } from '@/modules/administration/audit/audit-service';
import {
  branchAssignmentPageSchema,
  type BranchAssignment,
} from '@/modules/administration/branches/branch-contract';
import { listRoleAssignments } from '@/modules/administration/roles/role-service';
import {
  membershipDetailSchema,
  membershipPageSchema,
  userPageSchema,
  userSummarySchema,
  type MembershipSummary,
} from './user-contract';
import { userListApiPath, type UserListQuery } from './user-query';
import { SCAN_CEILING } from './user-rules';

export function listUsers(query: UserListQuery) {
  return apiGet(userListApiPath(query), userPageSchema);
}

/** One read per request: the record layout and its tabs share it. `async`, so a malformed id
 * rejects (a `load()` failure) instead of throwing synchronously past `load()`. */
export const getUser = cache(async (userId: string) => {
  const id = uuidSchema.parse(userId);
  return await apiGet(`/api/v1/tenant/users/${id}`, userSummarySchema);
});

const SCAN_PAGE_SIZE = 100;
// ponytail: at most SCAN_CEILING rows (5 pages of 100) per scan, like the lookup indexes (spec §6.3).
// The backend has no user_id filter on memberships or branch assignments (BG-09). The ceiling is
// shared with user-rules.ts, whose copy names it.
const SCAN_PAGES = SCAN_CEILING / SCAN_PAGE_SIZE;

/** BG-09: memberships can't be filtered by user. `q` is a case-insensitive substring over username,
 * email and name, with `%` and `_` as wildcards (contract §A), so the hits are a superset: match
 * the user id exactly, never the first hit. null when not found within the ceiling. */
export const findUserMembership = cache(
  async (userId: string, email: string): Promise<MembershipSummary | null> => {
    const id = uuidSchema.parse(userId).toLowerCase();
    const q = email.trim();
    if (!q) return null;
    for (let page = 0; page < SCAN_PAGES; page += 1) {
      const result = await apiGet(
        `/api/v1/tenant/memberships${toQueryString({ q, page, size: SCAN_PAGE_SIZE })}`,
        membershipPageSchema,
      );
      const match = result.items.find((membership) => membership.userId.toLowerCase() === id);
      if (match) return match;
      if (!result.page.hasNext) return null;
    }
    return null;
  },
);

export const getMembership = cache(async (membershipId: string) => {
  const id = uuidSchema.parse(membershipId);
  return await apiGet(`/api/v1/tenant/memberships/${id}`, membershipDetailSchema);
});

export interface UserBranchScan {
  items: BranchAssignment[];
  /** The ceiling was reached with more rows unread: the list may be incomplete. */
  truncated: boolean;
}

/** BG-09: branch assignments have no user_id filter. With a branch selected the backend forces the
 * search to that branch (§E.4), so the result is that branch's rows only. 12 reuses it. */
export const listUserBranchAssignments = cache(async (userId: string): Promise<UserBranchScan> => {
  const id = uuidSchema.parse(userId).toLowerCase();
  // By id: the order is unspecified (`sort_*` is ignored), so with LIMIT/OFFSET paging and no order a
  // row can repeat across pages or be skipped. Even an uncapped scan (`truncated: false`) is best
  // effort, not a proof of completeness (BG-09).
  const rows = new Map<string, BranchAssignment>();
  for (let page = 0; page < SCAN_PAGES; page += 1) {
    const result = await apiGet(
      `/api/v1/tenant/branch-assignments${toQueryString({ status: 'ACTIVE', page, size: SCAN_PAGE_SIZE })}`,
      branchAssignmentPageSchema,
    );
    for (const row of result.items) if (row.userId.toLowerCase() === id) rows.set(row.id, row);
    if (!result.page.hasNext) return { items: [...rows.values()], truncated: false };
  }
  return { items: [...rows.values()], truncated: true };
});

/** BG-08: the inviter is only in the audit log (`user.invite`, contract §G maker lookups); null
 * when the log holds no such event for them (or it names no actor). A malformed id is null too,
 * with no read. Every read failure
 * REJECTS (like `countUserRoleAssignments`), so the caller settles it with `load()`, which redirects
 * on a lost session or a stale context; it decides what any other failure means (never a quiet
 * null here). */
export async function getUserInviter(userId: string): Promise<string | null> {
  const id = uuidSchema.safeParse(userId);
  if (!id.success) return null;
  const events = await listAuditEvents({
    entityType: 'USER',
    entityId: id.data,
    action: 'user.invite',
    page: 0,
    size: 1,
  });
  return events.items[0]?.actorUserId ?? null;
}

/** BG-15: one `size=1` read. Rejects when it fails, so the caller settles it with `load()` and can
 * say it failed instead of treating a failure as "not permitted" (never a quiet null). */
export async function countUserRoleAssignments(userId: string): Promise<number> {
  const page = await listRoleAssignments({ userId, status: 'ACTIVE' }, { page: 0, size: 1 });
  return page.page.totalItems;
}
