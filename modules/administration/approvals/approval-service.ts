import 'server-only';
import { cache } from 'react';
import type { ListSort } from '@/lib/api/list-sort';
import { apiGet } from '@/lib/api/tenant-api';
import type { BranchSortField } from '@/modules/administration/branches/branch-contract';
import { DEFAULT_BRANCH_SORT } from '@/modules/administration/branches/branch-query';
import { listBranches } from '@/modules/administration/branches/branch-service';
import { listRoleAssignments } from '@/modules/administration/roles/role-service';
import { listUsers } from '@/modules/administration/users/user-service';
import { REQUESTED_ROLES_CEILING } from './approval-copy';
import { pendingCountSchema, type PendingCounts } from './approval-contract';
import type { UserApprovalCounts } from './approval-notifications';

/**
 * Layer 12's reads, shared with layer 14's pending-approvals card. Every function REJECTS on a
 * failed read, so the caller settles it with `load()`: a lost session or a stale context redirects,
 * and any other failure says so (rule 9). Nothing here blanket-catches.
 */

interface Paging {
  page: number;
  size: number;
}

/** The User onboarding tab (spec §10.6): newest first; the endpoint has no sort (contract §E.3).
 * It includes memberships whose user is already provisioning (the endpoint can't leave them out):
 * a consumer marks them, as the tab does, or skips them (layer 14's pending-approvals card). */
export function listUserApprovals(paging: Paging) {
  return listUsers({ membershipStatus: 'PENDING_APPROVAL', page: paging.page, size: paging.size });
}

export interface BranchActivationQuery extends Paging {
  sort: ListSort<BranchSortField>;
}

/** The Branch activation tab: the `/branches` list is target-aware (BG-03), and a pending branch is
 * listed only to a tenant-wide `branch.view` (#242), as the tab's gate requires. */
export function listBranchActivations(query: BranchActivationQuery) {
  return listBranches({
    status: 'PENDING_APPROVAL',
    sort: query.sort,
    page: query.page,
    size: query.size,
  });
}

/** Spec §8: two `size=1` reads (BG-15, BG-22). One pair per request: the bell, the queue and
 * layer 14's card share it. */
export const countUserApprovals = cache(async (): Promise<UserApprovalCounts> => {
  const [pending, provisioning] = await Promise.all([
    listUsers({ membershipStatus: 'PENDING_APPROVAL', page: 0, size: 1 }),
    listUsers({
      membershipStatus: 'PENDING_APPROVAL',
      userStatus: 'PROVISIONING_IDP',
      page: 0,
      size: 1,
    }),
  ]);
  return { pending: pending.page.totalItems, provisioning: provisioning.page.totalItems };
});

/** The Branch activation tab's total: one `size=1` read, which the queue and the overview's
 * readiness card share per request (the bell reads the count route, BG-22). */
export const countBranchActivations = cache(async (): Promise<number> => {
  const page = await listBranchActivations({ sort: DEFAULT_BRANCH_SORT, page: 0, size: 1 });
  return page.page.totalItems;
});

/** The bell's counts (BG-22): one read of the platform's count route, which leaves out the requests
 * the caller created and omits a kind they can't approve tenant-wide. Ask it only of a caller who
 * can approve one kind tenant-wide: one who can approve neither is refused (403). */
export function readPendingCounts(): Promise<PendingCounts> {
  return apiGet('/api/v1/tenant/approvals/pending-count', pendingCountSchema);
}

/** Requested access (spec §10.6): the user's ACTIVE role assignments, one bounded page (Ruling 8;
 * `hasNext` says when there are more). */
export function listRequestedRoles(userId: string) {
  return listRoleAssignments(
    { userId, status: 'ACTIVE' },
    { page: 0, size: REQUESTED_ROLES_CEILING },
  );
}
