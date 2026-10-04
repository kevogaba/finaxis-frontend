import { sortQuery } from '@/lib/api/list-sort';
import { toQueryString } from '@/lib/api/query-string';
import type { BranchListQuery } from '@/modules/administration/branches/branch-query';

/** An institution's branches from the platform context (contract §E.2): the `/branches` filters and
 * sort allow-list, scoped by the path. The caller passes a validated, lower-cased id. */
export function institutionBranchListApiPath(tenantId: string, query: BranchListQuery): string {
  return `/api/v1/platform/tenants/${tenantId}/branches${toQueryString({
    q: query.q,
    status: query.status,
    type: query.type,
    ...sortQuery(query.sort),
    page: query.page,
    size: query.size,
  })}`;
}

/** The record's Branches tab; the branch record and the draft form live below it. */
export function institutionBranchesHref(tenantId: string): string {
  return `/platform-admin/tenants/${tenantId}/branches`;
}
