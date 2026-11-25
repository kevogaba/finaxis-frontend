import { canAll, type PermissionHolder } from '@/auth/permissions';
import { UUID_PATTERN } from '@/lib/api/wire';
import type { TenantStatus } from '../tenants/tenant-contract';

/** A route's branch id, lower-cased (contract §A), or null: not found, before any read. */
export function parseBranchId(param: string): string | null {
  return UUID_PATTERN.test(param) ? param.toLowerCase() : null;
}

/** The platform create needs `branch.create`; the redirect after it reads the draft back. */
export const BRANCH_CREATE_CODES = ['branch.create', 'branch.view'] as const;

/** The most branches the parent picker and the parent-name lookup read (5 pages of 100). */
export const BRANCH_INDEX_CEILING = 500;

/** The institution states a draft can be created in: any other is a 409 (`requireOrganisationAllowsBranch`). */
const DRAFT_STATES: readonly TenantStatus[] = ['ACTIVE', 'PROVISIONING'];

/**
 * BG-18 (platform #153): the platform route checks `branch.create` and `branch.view` in the platform
 * organisation only, with no membership inside the institution, for an ACTIVE or PROVISIONING one.
 */
export function canCreateInstitutionBranch(
  status: TenantStatus,
  holder: PermissionHolder,
): boolean {
  return DRAFT_STATES.includes(status) && canAll(holder, BRANCH_CREATE_CODES);
}

export const BRANCHES_DESCRIPTION =
  "The institution's own administrators submit, activate and change its branches, once it has approvers of its own.";
/** The record after a create lands here: it points to where the draft goes next (BG-02). */
export const BRANCH_DETAIL_DESCRIPTION =
  "The institution's own administrators change its branches. While platform checking is open, a platform administrator submits and activates them from the institution's Branches tab.";
export const BRANCH_CREATE_CONFLICT =
  "The branch couldn't be created. Its code may already be in use, or the institution can't add branches right now.";
export const BRANCH_CODE_MAY_BE_TAKEN = 'This code may already be in use.';
export const BRANCH_CREATE_INACTIVE = {
  title: "This institution can't take new branches",
  description:
    'Only an active institution, or one being provisioned, can take new branches. The platform would refuse one here.',
} as const;
export const PARENTS_UNAVAILABLE =
  "Optional. This institution's branches couldn't be loaded, so no parent can be chosen right now. Refresh to try again.";
export const PARENTS_PARTIAL = `Optional. Only the first ${BRANCH_INDEX_CEILING} branches are listed.`;

export function branchCreateDescription(institutionName: string): string {
  return `The draft is created in ${institutionName}. It is then submitted and activated from its Branches tab, by a platform administrator until the institution has an active branch besides its head office.`;
}

/** The parent picker's helper (rule 9): a failed or capped index never reads as "no branches". */
export function parentsNote(
  index: { ok: false } | { ok: true; truncated: boolean },
): string | undefined {
  if (!index.ok) return PARENTS_UNAVAILABLE;
  return index.truncated ? PARENTS_PARTIAL : undefined;
}
