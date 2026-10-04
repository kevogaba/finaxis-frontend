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

/**
 * Ruling 8. The shared branch service refuses an institution that isn't ACTIVE (or the transient
 * PROVISIONING) with a 409 (contract §E.3), so only an ACTIVE one is offered. BG-18's second
 * condition, a membership with `branch.create` inside the institution, can't be seen from the
 * platform: the form warns, and a 403 is explained.
 */
export function canCreateInstitutionBranch(
  status: TenantStatus,
  holder: PermissionHolder,
): boolean {
  return status === 'ACTIVE' && canAll(holder, BRANCH_CREATE_CODES);
}

export const BRANCHES_DESCRIPTION =
  "The institution's own administrators submit, activate and change its branches.";
export const BRANCH_DETAIL_DESCRIPTION =
  "Read-only here: the institution's own administrators run its branches. The platform doesn't return a branch's address.";
export const BRANCH_CREATE_REFUSED =
  'The platform refused this branch. You must also be an active member of this institution, with a role there that allows creating branches. Ask one of its administrators to create it, or to give you that access.';
export const BRANCH_CREATE_CONFLICT =
  "The branch couldn't be created. Its code may already be in use, or the institution can't add branches right now.";
export const BRANCH_CODE_MAY_BE_TAKEN = 'This code may already be in use.';
export const BRANCH_CREATE_INACTIVE = {
  title: 'Only an active institution can take new branches',
  description: "This institution isn't active, so the platform would refuse a new branch.",
} as const;
export const PARENTS_UNAVAILABLE =
  "Optional. This institution's branches couldn't be loaded, so no parent can be chosen right now. Refresh to try again.";
export const PARENTS_PARTIAL = `Optional. Only the first ${BRANCH_INDEX_CEILING} branches are listed.`;

export function branchCreateDescription(institutionName: string): string {
  return `The draft is created in ${institutionName}. Its own administrators then submit it and activate it.`;
}

/** BG-18, shown on the form as a warning note. */
export function branchCreateWarning(institutionName: string): string {
  return `You can create a branch here only if you're also an active member of ${institutionName}, with a role there that allows creating branches. Otherwise the platform refuses it.`;
}

/** The parent picker's helper (rule 9): a failed or capped index never reads as "no branches". */
export function parentsNote(
  index: { ok: false } | { ok: true; truncated: boolean },
): string | undefined {
  if (!index.ok) return PARENTS_UNAVAILABLE;
  return index.truncated ? PARENTS_PARTIAL : undefined;
}
