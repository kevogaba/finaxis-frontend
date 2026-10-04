import 'server-only';
import { cache } from 'react';
import { toQueryString } from '@/lib/api/query-string';
import { apiGet } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import {
  branchDetailSchema,
  branchPageSchema,
} from '@/modules/administration/branches/branch-contract';
import type { BranchListQuery } from '@/modules/administration/branches/branch-query';
import { institutionBranchListApiPath } from './institution-branch-query';
import { BRANCH_INDEX_CEILING } from './institution-branch-rules';

const id = (value: string) => uuidSchema.parse(value).toLowerCase();

/** `async`, so a malformed id rejects (a `load()` failure) instead of throwing past `load()`. */
export async function listInstitutionBranches(tenantId: string, query: BranchListQuery) {
  return await apiGet(institutionBranchListApiPath(id(tenantId), query), branchPageSchema);
}

/** One read per request. 08's detail schema: `address` (always `{}`, BG-13) isn't mapped. */
export const getInstitutionBranch = cache(async (tenantId: string, branchId: string) => {
  return await apiGet(
    `/api/v1/platform/tenants/${id(tenantId)}/branches/${id(branchId)}`,
    branchDetailSchema,
  );
});

export interface InstitutionBranchIndex {
  names: ReadonlyMap<string, { name: string; code: string }>;
  /** The ceiling was reached with more branches unread. */
  truncated: boolean;
}

const INDEX_PAGE_SIZE = 100;
// ponytail: at most BRANCH_INDEX_CEILING branches (5 pages of 100, spec §6.3's lookup ceiling) for
// the parent picker and parent names; `truncated` says when there were more.
const INDEX_PAGES = BRANCH_INDEX_CEILING / INDEX_PAGE_SIZE;

/** An institution's branches by id, sorted by name. Rejects on any failure, never answers a
 * partial or empty index for a failed read, so a caller can say it couldn't load (rule 9). */
export const getInstitutionBranchIndex = cache(
  async (tenantId: string): Promise<InstitutionBranchIndex> => {
    const institution = id(tenantId);
    const names = new Map<string, { name: string; code: string }>();
    for (let page = 0; page < INDEX_PAGES; page += 1) {
      const result = await apiGet(
        `/api/v1/platform/tenants/${institution}/branches${toQueryString({
          page,
          size: INDEX_PAGE_SIZE,
          sort_by: 'branchName',
          sort_dir: 'ASC',
        })}`,
        branchPageSchema,
      );
      for (const branch of result.items) {
        names.set(branch.id, { name: branch.branchName, code: branch.branchCode });
      }
      if (!result.page.hasNext) return { names, truncated: false };
    }
    return { names, truncated: true };
  },
);
