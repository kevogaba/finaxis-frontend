import { z } from 'zod';
import { can, canAll, canTenantWide, type PermissionHolder } from '@/auth/permissions';
import { withViews } from '@/auth/permission-views';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { uuidSchema } from '@/lib/api/wire';
import type { BranchStatus } from './branch-contract';

export type BranchLifecycleAction = 'submit' | 'activate' | 'suspend' | 'reactivate' | 'close';

const ACTIONS_BY_STATUS: Record<BranchStatus, readonly BranchLifecycleAction[]> = {
  DRAFT: ['submit'],
  PENDING_APPROVAL: ['activate'],
  ACTIVE: ['suspend', 'close'],
  SUSPENDED: ['reactivate', 'close'],
  CLOSED: [],
  ARCHIVED: [],
};

// Contract §E.3: submitting a draft is gated by `branch.create`, not a code of its own.
const PERMISSION: Record<BranchLifecycleAction, string> = {
  submit: 'branch.create',
  activate: 'branch.approve',
  suspend: 'branch.suspend',
  reactivate: 'branch.reactivate',
  close: 'branch.close',
};

/** Every transition reads the branch back, so it also needs `branch.view` (BG-31). */
export function availableBranchActions(
  status: BranchStatus,
  holder: PermissionHolder,
): BranchLifecycleAction[] {
  if (!can(holder, 'branch.view')) return [];
  return ACTIONS_BY_STATUS[status].filter((action) => can(holder, PERMISSION[action]));
}

/** POST /branches needs only `branch.create`, but the record it redirects to and submitting the
 * draft both read the branch back, so the create flow also needs `branch.view` (spec §6.6). */
export function canCreateBranch(holder: PermissionHolder): boolean {
  return canAll(holder, ['branch.create', 'branch.view']);
}

export const MAKER_CHECKER_BLOCKED =
  'You drafted this branch, so another administrator must activate it.';
/** Activate's `forbidden`: a missing permission only, since the drafter and the editors have
 * their own codes (BG-08). The branch record and the approval page share it. */
export const ACTIVATE_FORBIDDEN = "You can't activate this branch. Your role doesn't allow it.";

/** BG-08: the drafter comes from the audit log. An unknown drafter never blocks — the backend
 * decides, and a 403 is explained then. */
export function activateBlocked(makerId: string | null, userId: string | null): boolean {
  return makerId !== null && makerId === userId;
}

/** Assigning needs an ACTIVE branch (else 409) and the write's views (ADR 0030); the drawer's user
 * search reads `/tenant/users`, which needs `user.view` tenant-wide (BG-33). */
export function canAssignUsers(status: BranchStatus, holder: PermissionHolder): boolean {
  return (
    status === 'ACTIVE' &&
    canAll(holder, withViews(['user.assign_branch'])) &&
    canTenantWide(holder, 'user.view')
  );
}

export function canRevokeAssignments(holder: PermissionHolder): boolean {
  return canAll(holder, withViews(['user.revoke_branch']));
}

/** `HEAD_OFFICE` → `Head office`; free text such as `Service centre` stays as typed. */
export function branchTypeLabel(type: string): string {
  return /^[A-Z0-9_]+$/.test(type) ? humanizeEnum(type) : type;
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** CreateBranch (contract §D), shared by the form (RHF) and the Server Action. The backend
 * doesn't validate the timezone; an invalid one would break every date on the record later. */
export const branchDraftSchema = z.object({
  branchCode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_-]{2,20}$/, 'Use 2–20 capital letters, digits, underscores or hyphens.'),
  branchName: z
    .string()
    .trim()
    .min(2, 'Enter a name of at least 2 characters.')
    .max(100, 'Use at most 100 characters.'),
  branchType: z
    .string()
    .trim()
    .min(1, 'Enter a branch type.')
    .max(50, 'Use at most 50 characters.'),
  parentBranchId: z.union([z.literal(''), uuidSchema]),
  timezone: z.string().refine(isTimeZone, 'Choose a timezone.'),
});

export type BranchDraftValues = z.infer<typeof branchDraftSchema>;
