import 'server-only';
import { cache } from 'react';
import { toQueryString } from '@/lib/api/query-string';
import { apiGet } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import { listAuditEvents } from '@/modules/administration/audit/audit-service';
import {
  branchAssignmentPageSchema,
  branchDetailSchema,
  branchPageSchema,
} from './branch-contract';
import { branchListApiPath, type BranchListQuery } from './branch-query';

export function listBranches(query: BranchListQuery) {
  return apiGet(branchListApiPath(query), branchPageSchema);
}

/** One read per request: the record layout (hero) and its tabs share it. `async`, so a malformed
 * id rejects (a `load()` failure) instead of throwing synchronously past `load()`. */
export const getBranch = cache(async (branchId: string) => {
  const id = uuidSchema.parse(branchId);
  return await apiGet(`/api/v1/branches/${id}`, branchDetailSchema);
});

/** ACTIVE assignments at one branch (with a branch selected the backend forces its own). */
export async function listBranchAssignments(
  branchId: string,
  paging: { page: number; size: number },
) {
  const id = uuidSchema.parse(branchId);
  return await apiGet(
    `/api/v1/tenant/branch-assignments${toQueryString({
      branch_id: id,
      status: 'ACTIVE',
      page: paging.page,
      size: paging.size,
    })}`,
    branchAssignmentPageSchema,
  );
}

/** BG-15: no count endpoint — one `size=1` read. A failure rejects, for the page's `load()`. */
export async function countActiveAssignments(branchId: string): Promise<number> {
  return (await listBranchAssignments(branchId, { page: 0, size: 1 })).page.totalItems;
}

/** BG-08: the drafter is only in the audit log (`branch.create_draft`, contract §G "maker
 * lookups"); null when the log holds no such event for the branch (or it names no actor). Every
 * read failure REJECTS (like `getUserInviter`), so the caller settles it with `load()`, which
 * redirects on a lost session or a stale context; it decides what any other failure means (never a
 * quiet null here). */
export async function getBranchMaker(branchId: string): Promise<string | null> {
  const events = await listAuditEvents({
    entityType: 'BRANCH',
    entityId: branchId,
    action: 'branch.create_draft',
    page: 0,
    size: 1,
  });
  return events.items[0]?.actorUserId ?? null;
}
