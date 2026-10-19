import 'server-only';
import { cache } from 'react';
import { toQueryString } from '@/lib/api/query-string';
import { apiGet } from '@/lib/api/tenant-api';
import type { Page } from '@/lib/api/wire';
import type { AuditEvent } from '@/modules/administration/audit/audit-contract';
import { listAuditEvents } from '@/modules/administration/audit/audit-service';
import { DEFAULT_BRANCH_SORT } from '@/modules/administration/branches/branch-query';
import { listBranches } from '@/modules/administration/branches/branch-service';
import { membershipPageSchema } from '@/modules/administration/users/user-contract';
import { ACTIVITY_SIZE } from './overview-rules';

/**
 * The overview's own reads (spec §10.8). The rest are other layers' and shared per request: 12's
 * approval counts and queue pages, 07's business date, 13's settings. Every function here REJECTS on
 * a failed read, so the card settles it with `load()` (rule 6): nothing here catches.
 */

/** Branches: one `size=1` read (BG-15). Pending branches are 12's `countBranchActivations`. */
export const countActiveBranches = cache(async (): Promise<number> => {
  const result = await listBranches({
    status: 'ACTIVE',
    sort: DEFAULT_BRANCH_SORT,
    page: 0,
    size: 1,
  });
  return result.page.totalItems;
});

/** People: ACTIVE memberships, one `size=1` read (BG-15). The endpoint has `membership_status`
 * (contract §E.3); it needs `membership.view`. */
export const countActiveMemberships = cache(async (): Promise<number> => {
  const result = await apiGet(
    `/api/v1/tenant/memberships${toQueryString({ membership_status: 'ACTIVE', page: 0, size: 1 })}`,
    membershipPageSchema,
  );
  return result.page.totalItems;
});

/** Recent activity: the five newest events (the endpoint lists newest first, contract §E.3). */
export function listRecentActivity(): Promise<Page<AuditEvent>> {
  return listAuditEvents({ page: 0, size: ACTIVITY_SIZE });
}
