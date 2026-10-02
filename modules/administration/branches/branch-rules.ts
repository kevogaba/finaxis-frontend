import { z } from 'zod';
import { can, canAll, type PermissionHolder } from '@/auth/permissions';
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
  activate: 'branch.activate',
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

/** BG-08: the drafter comes from the audit log. An unknown drafter never blocks — the backend
 * decides, and a 403 is explained then. */
export function activateBlocked(makerId: string | null, userId: string | null): boolean {
  return makerId !== null && makerId === userId;
}

/** Assigning needs an ACTIVE branch (else 409), the read-back permission (BG-31), and
 * `user.view` for the drawer's user search. */
export function canAssignUsers(status: BranchStatus, holder: PermissionHolder): boolean {
  return (
    status === 'ACTIVE' &&
    can(holder, 'user.assign_branch') &&
    can(holder, 'branch_assignment.view') &&
    can(holder, 'user.view')
  );
}

export function canRevokeAssignments(holder: PermissionHolder): boolean {
  return can(holder, 'user.revoke_branch') && can(holder, 'branch_assignment.view');
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
