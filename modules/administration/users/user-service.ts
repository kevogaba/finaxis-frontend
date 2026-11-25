import 'server-only';
import { cache } from 'react';
import { BackendApiError } from '@/auth/backend-api';
import { canTenantWide, type PermissionHolder } from '@/auth/permissions';
import { toQueryString } from '@/lib/api/query-string';
import { apiGet } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import { branchAssignmentPageSchema } from '@/modules/administration/branches/branch-contract';
import { listRoleAssignments } from '@/modules/administration/roles/role-service';
import {
  membershipDetailSchema,
  userPageSchema,
  userSummarySchema,
  type InvitationStatus,
  type UserSummary,
} from './user-contract';
import { userListApiPath, type UserListQuery } from './user-query';
import { awaitsIdentity } from './user-rules';

export function listUsers(query: UserListQuery) {
  return apiGet(userListApiPath(query), userPageSchema);
}

/** One read per request: the record layout and its tabs share it. `async`, so a malformed id
 * rejects (a `load()` failure) instead of throwing synchronously past `load()`. */
export const getUser = cache(async (userId: string) => {
  const id = uuidSchema.parse(userId);
  return await apiGet(`/api/v1/tenant/users/${id}`, userSummarySchema);
});

export const getMembership = cache(async (membershipId: string) => {
  const id = uuidSchema.parse(membershipId);
  return await apiGet(`/api/v1/tenant/memberships/${id}`, membershipDetailSchema);
});

/** At most this many rows of a page are looked up by `readRowInvitations`: a page holds up to 50,
 * and each lookup is a membership read the page awaits before it renders, against the tenant's read
 * rate limit. Rows past it keep their status-only label. */
export const ROW_INVITATION_LOOKUPS = 10;

/** BG-28: the `invitation` status of each row given that `awaitsIdentity`, by user id, so its label
 * is exact: a re-invited member whose account was never provisioned awaits approval, not identity.
 * One membership read per such row, in parallel, for the first `ROW_INVITATION_LOOKUPS` of them (a
 * page's; usually none or one). Only with `membership.view` tenant-wide, the read's gate (BG-33). A
 * read that fails is left out, so its row keeps the label it had: the lookup only sharpens a label.
 * Failures are logged as one server-side line per call, by count and status, never the error text
 * (as `describeProblem`). */
export async function readRowInvitations(
  users: readonly UserSummary[],
  holder: PermissionHolder,
): Promise<Record<string, InvitationStatus>> {
  if (!canTenantWide(holder, 'membership.view')) return {};
  const rows = users.filter(awaitsIdentity).slice(0, ROW_INVITATION_LOOKUPS);
  const reads = await Promise.allSettled(rows.map((user) => getMembership(user.membershipId)));
  const invitations: Record<string, InvitationStatus> = {};
  const failures: string[] = [];
  reads.forEach((read, index) => {
    const user = rows[index];
    if (read.status === 'rejected') {
      failures.push(read.reason instanceof BackendApiError ? String(read.reason.status) : 'none');
    } else if (user && read.value.invitation) {
      invitations[user.id] = read.value.invitation.status;
    }
  });
  if (failures.length > 0) {
    console.error(
      `Invitation lookups failed for ${failures.length} of ${rows.length} rows (statuses: ${failures.join(', ')}); those rows keep their status-only label.`,
    );
  }
  return invitations;
}

/** One page of the user's ACTIVE branch assignments, newest assigned first, with each branch's
 * name embedded (BG-09). `user_id` ignores the selected branch and lists every branch the caller
 * may view: all of them for a tenant-wide `branch_assignment.view`, the ACTIVE ones a branch-scoped
 * grant covers otherwise (BG-03). */
export async function listUserBranchAssignments(
  userId: string,
  paging: { page: number; size: number },
) {
  const id = uuidSchema.parse(userId);
  return await apiGet(
    `/api/v1/tenant/branch-assignments${toQueryString({
      user_id: id,
      status: 'ACTIVE',
      sort_by: 'assignedAt',
      sort_dir: 'DESC',
      page: paging.page,
      size: paging.size,
    })}`,
    branchAssignmentPageSchema,
  );
}

/** BG-15: one `size=1` read of the above. Rejects when it fails, for the page's `load()`. */
export async function countUserBranchAssignments(userId: string): Promise<number> {
  return (await listUserBranchAssignments(userId, { page: 0, size: 1 })).page.totalItems;
}

/** BG-15: one `size=1` read. Rejects when it fails, so the caller settles it with `load()` and can
 * say it failed instead of treating a failure as "not permitted" (never a quiet null). */
export async function countUserRoleAssignments(userId: string): Promise<number> {
  const page = await listRoleAssignments({ userId, status: 'ACTIVE' }, { page: 0, size: 1 });
  return page.page.totalItems;
}
