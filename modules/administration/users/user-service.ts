import 'server-only';
import { cache } from 'react';
import { toQueryString } from '@/lib/api/query-string';
import { apiGet } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import { branchAssignmentPageSchema } from '@/modules/administration/branches/branch-contract';
import { listRoleAssignments } from '@/modules/administration/roles/role-service';
import { membershipDetailSchema, userPageSchema, userSummarySchema } from './user-contract';
import { userListApiPath, type UserListQuery } from './user-query';

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
