import { can, canAll, type PermissionHolder } from '@/auth/permissions';
import { humanizeEnum } from '@/components/data-display/status-chip';
import type { BranchStatus } from '@/modules/administration/branches/branch-contract';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import type { MembershipStatus, UserStatus } from '@/modules/administration/users/user-contract';
import {
  accountBlockedNote,
  onboardingState,
  PROVISIONING_NOTE,
  USER_MAKER_CHECKER_BLOCKED,
} from '@/modules/administration/users/user-rules';

/**
 * Layer 12's rules, client-safe: who sees which queue, and where a request stands and what it
 * offers. The decisions' wording and the pages' copy are in `approval-copy.ts`, the bell's
 * arithmetic in `approval-notifications.ts`, the control checks in `approval-checks.ts`.
 */

// ── Who sees what (Ruling 2) ─────────────────────────────────────────────────────────────────────

/** The User onboarding tab and the bell's user count: `user.view` lists the users, `user.approve`
 * decides. The decision also reads the membership back (`membership.view`, BG-31): the detail page
 * says so when it is missing. */
export const USER_APPROVAL_CODES = ['user.approve', 'user.view'] as const;
/** The Branch activation tab and the bell's branch count: activate reads the branch back (BG-31). */
export const BRANCH_ACTIVATION_CODES = ['branch.activate', 'branch.view'] as const;

export const APPROVALS_HREF = '/admin/approvals';
export const USER_QUEUE_HREF = `${APPROVALS_HREF}/users`;
export const BRANCH_QUEUE_HREF = `${APPROVALS_HREF}/branches`;

export function userApprovalHref(userId: string): string {
  return `${USER_QUEUE_HREF}/${userId}`;
}

export function branchApprovalHref(branchId: string): string {
  return `${BRANCH_QUEUE_HREF}/${branchId}`;
}

export const USER_QUEUE_LABEL = 'User onboarding';
export const BRANCH_QUEUE_LABEL = 'Branch activation';

/** Structurally the kit's `RecordTab`. */
export interface ApprovalQueueTab {
  href: string;
  label: string;
}

/** Spec §10.6's tab counts: actionable users and pending branches; `null` when not read or the
 * read failed, so the label carries no number (never a 0 it doesn't know). */
export interface QueueCounts {
  users: number | null;
  branches: number | null;
}

const NO_COUNTS: QueueCounts = { users: null, branches: null };

/** The queue's tabs, in order, for what the holder can see; `/admin/approvals` opens the first. */
export function approvalQueueTabs(
  holder: PermissionHolder,
  counts: QueueCounts = NO_COUNTS,
): ApprovalQueueTab[] {
  const label = (text: string, count: number | null) =>
    count === null ? text : `${text} (${count})`;
  const tabs: ApprovalQueueTab[] = [];
  if (canAll(holder, USER_APPROVAL_CODES)) {
    tabs.push({ href: USER_QUEUE_HREF, label: label(USER_QUEUE_LABEL, counts.users) });
  }
  if (canAll(holder, BRANCH_ACTIVATION_CODES)) {
    tabs.push({ href: BRANCH_QUEUE_HREF, label: label(BRANCH_QUEUE_LABEL, counts.branches) });
  }
  return tabs;
}

/** The backend's and `/auth/me`'s ids are canonical lower case (contract §A); compared without case
 * anyway, so the maker-checker gate never rests on letter case (Ruling 5). */
export function isSameUser(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a.toLowerCase() === b.toLowerCase();
}

// ── Where a request stands, and what it offers (Rulings 5–7) ─────────────────────────────────────

/** `awaiting` takes Approve and Reject & revoke; `blocked` (a pending membership whose account is
 * suspended, locked or deactivated: approving it is a 500, contract §F) shows Approve disabled and
 * takes Reject & revoke; `provisioning` was already approved (BG-11) and takes no decision here. */
export type UserApprovalState = 'awaiting' | 'blocked' | 'provisioning' | 'decided';

export function userApprovalState(
  membership: MembershipStatus,
  user: UserStatus,
): UserApprovalState {
  if (membership !== 'PENDING_APPROVAL') return 'decided';
  switch (onboardingState(membership, user).key) {
    case 'PROVISIONING_IDENTITY':
      return 'provisioning';
    case 'ACCOUNT_BLOCKED':
      return 'blocked';
    default:
      return 'awaiting';
  }
}

export type ApprovalDecision = 'approve' | 'reject' | 'activate';

/** Every membership transition reads the membership back, so `membership.view` gates both (BG-31);
 * then each decision's own code: Approve `user.approve`, Reject & revoke `membership.revoke`. */
export function availableUserDecisions(
  state: UserApprovalState,
  holder: PermissionHolder,
): ApprovalDecision[] {
  if (!can(holder, 'membership.view') || (state !== 'awaiting' && state !== 'blocked')) return [];
  const decisions: ApprovalDecision[] = [];
  if (can(holder, 'user.approve')) decisions.push('approve');
  if (can(holder, 'membership.revoke')) decisions.push('reject');
  return decisions;
}

/** The offered decisions shown disabled, each with its caption (spec §6.6): a blocked account
 * first, then maker-checker (the inviter is known only with `audit.view`, BG-08). */
export function blockedUserDecisions(
  decisions: readonly ApprovalDecision[],
  subject: { state: UserApprovalState; userStatus: UserStatus; invitedByMe: boolean },
): Partial<Record<ApprovalDecision, string>> {
  if (!decisions.includes('approve')) return {};
  if (subject.state === 'blocked') return { approve: accountBlockedNote(subject.userStatus) };
  if (subject.invitedByMe) return { approve: USER_MAKER_CHECKER_BLOCKED };
  return {};
}

/** Why a user approval offers no decision, shown in place of the bar; null while it waits. */
export function userOutcomeNote(
  state: UserApprovalState,
  membership: MembershipStatus,
): string | null {
  if (state === 'provisioning') return PROVISIONING_NOTE;
  if (state !== 'decided') return null;
  switch (membership) {
    case 'ACTIVE':
      return 'Approved: this membership is active.';
    case 'REVOKED':
      return "Rejected: this membership was revoked, and this email can't be invited to this institution again.";
    default:
      return `This membership isn't waiting for approval: it is ${humanizeEnum(membership).toLowerCase()}.`;
  }
}

/** Activate reads the branch back (BG-31) and needs the All branches context (BG-03), which the
 * page checks before it offers the bar. */
export function availableBranchDecisions(
  status: BranchStatus,
  holder: PermissionHolder,
): ApprovalDecision[] {
  return status === 'PENDING_APPROVAL' && canAll(holder, BRANCH_ACTIVATION_CODES)
    ? ['activate']
    : [];
}

export function blockedBranchDecisions(
  decisions: readonly ApprovalDecision[],
  subject: { draftedByMe: boolean },
): Partial<Record<ApprovalDecision, string>> {
  return decisions.includes('activate') && subject.draftedByMe
    ? { activate: MAKER_CHECKER_BLOCKED }
    : {};
}

/** Why a branch activation offers no decision; null while it waits. */
export function branchOutcomeNote(status: BranchStatus): string | null {
  switch (status) {
    case 'PENDING_APPROVAL':
      return null;
    case 'ACTIVE':
      return 'Activated: this branch is live.';
    case 'DRAFT':
      return "This branch is still a draft: it hasn't been submitted for activation.";
    default:
      return `This branch isn't waiting for activation: it is ${humanizeEnum(status).toLowerCase()}.`;
  }
}
