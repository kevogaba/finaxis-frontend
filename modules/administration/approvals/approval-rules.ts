import { can, canAllTenantWide, canTenantWide, type PermissionHolder } from '@/auth/permissions';
import { withViews } from '@/auth/permission-views';
import { humanizeEnum } from '@/components/data-display/status-chip';
import type { BranchDetail } from '@/modules/administration/branches/branch-contract';
import {
  canActOnBranch,
  MAKER_CHECKER_BLOCKED,
  pendingBranchAction,
  RETURN_ROUTE_CODES,
} from '@/modules/administration/branches/branch-rules';
import type {
  InvitationStatus,
  MembershipStatus,
  UserStatus,
} from '@/modules/administration/users/user-contract';
import {
  accountBlockedNote,
  onboardingState,
  USER_MAKER_CHECKER_BLOCKED,
} from '@/modules/administration/users/user-rules';
import type { MakerGate } from './maker-checker';

/**
 * Layer 12's rules, client-safe: who sees which queue, and where a request stands and what it
 * offers. The decisions' wording and the pages' copy are in `approval-copy.ts`, the bell's
 * arithmetic in `approval-notifications.ts`, the control checks in `approval-checks.ts`.
 */

// ── Who sees what (Ruling 2) ─────────────────────────────────────────────────────────────────────

/** The User onboarding tab: `user.view` lists the users, `user.approve` decides. The decision also
 * reads the membership back (`membership.view`, BG-31): the detail page says so when it is
 * missing. */
export const USER_APPROVAL_CODES = ['user.approve', 'user.view'] as const;

/** `GET /tenant/users` checks `user.view` tenant-wide (BG-33), so a branch-scoped grant reads no
 * pending users. */
export function canSeeUserApprovals(holder: PermissionHolder): boolean {
  return can(holder, 'user.approve') && canTenantWide(holder, 'user.view');
}
/** The Branch activation tab: activate reads the branch back (BG-31). */
export const BRANCH_ACTIVATION_CODES = ['branch.approve', 'branch.view'] as const;

/** A pending branch grants no branch-scoped permission (platform #242), so only a tenant-wide
 * holder activates one, whichever branch is selected (BG-03). */
export function canSeeBranchActivations(holder: PermissionHolder): boolean {
  return canAllTenantWide(holder, BRANCH_ACTIVATION_CODES);
}

/** The bell's user line: the platform's membership count, capped by the User onboarding tab's
 * totals (`countUserApprovals`), which need `user.view` tenant-wide (BG-33). */
export function canCountUserApprovals(holder: PermissionHolder): boolean {
  return canAllTenantWide(holder, [...withViews(['user.approve']), 'user.view']);
}

/** BG-22: `GET /tenant/approvals/pending-count` counts memberships for `user.approve` and branches
 * for `branch.approve`, each with its views and tenant-wide (a pending branch has no ACTIVE branch
 * to hold a branch-scope grant at), and refuses a caller who holds neither (403). The bell asks it
 * only of a caller it can show a line to: the user line also needs the tab's read, so a holder of
 * the membership pair alone, with neither `user.view` nor the branch pair, has no bell, never one
 * that reads "nothing waiting" while members wait. Which lines it shows are the keys sent. */
export function canCountPendingApprovals(holder: PermissionHolder): boolean {
  return canCountUserApprovals(holder) || canSeeBranchActivations(holder);
}

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
  if (canSeeUserApprovals(holder)) {
    tabs.push({ href: USER_QUEUE_HREF, label: label(USER_QUEUE_LABEL, counts.users) });
  }
  if (canSeeBranchActivations(holder)) {
    tabs.push({ href: BRANCH_QUEUE_HREF, label: label(BRANCH_QUEUE_LABEL, counts.branches) });
  }
  return tabs;
}

// ── Where a request stands, and what it offers (Rulings 5–7) ─────────────────────────────────────

/** `awaiting` takes Approve and Reject & revoke; `blocked` (a pending membership whose account is
 * suspended, locked or deactivated: approving it is a 409, contract §F) shows Approve disabled and
 * takes Reject & revoke; `provisioning` was already approved (BG-11) and takes no decision here,
 * and `provisioning-failed` is that, once creating the identity failed (the user record retries
 * it). `invitation`: the membership's `invitation.status`, where it was read. */
export type UserApprovalState =
  'awaiting' | 'blocked' | 'provisioning' | 'provisioning-failed' | 'decided';

export function userApprovalState(
  membership: MembershipStatus,
  user: UserStatus,
  invitation?: InvitationStatus | null,
): UserApprovalState {
  if (membership !== 'PENDING_APPROVAL') return 'decided';
  switch (onboardingState(membership, user, invitation).key) {
    case 'PROVISIONING_IDENTITY':
    case 'IDENTITY_IN_PROGRESS':
      return 'provisioning';
    case 'IDENTITY_FAILED':
      return 'provisioning-failed';
    case 'ACCOUNT_BLOCKED':
      return 'blocked';
    default:
      return 'awaiting';
  }
}

export type ApprovalDecision = 'approve' | 'reject' | 'activate' | 'withdraw' | 'return';

/** Every membership transition reads the membership back, so `membership.view` gates both (BG-31);
 * then each decision's own code: Approve `user.approve`, Reject & revoke `membership.revoke`. */
export function availableUserDecisions(
  state: UserApprovalState,
  holder: PermissionHolder,
): ApprovalDecision[] {
  if (!can(holder, 'membership.view') || (state !== 'awaiting' && state !== 'blocked')) return [];
  const decisions: ApprovalDecision[] = [];
  // Each checked with membership.view, tenant-wide (ADR 0030, BG-33).
  if (canAllTenantWide(holder, withViews(['user.approve']))) decisions.push('approve');
  if (canAllTenantWide(holder, withViews(['membership.revoke']))) decisions.push('reject');
  return decisions;
}

/** The offered decisions shown disabled, each with its caption (spec §6.6): a blocked account
 * first, then the inviter while maker-checker is known to be on (`makerGate`, BG-08). */
export function blockedUserDecisions(
  decisions: readonly ApprovalDecision[],
  subject: { state: UserApprovalState; userStatus: UserStatus; makerGate: MakerGate },
): Partial<Record<ApprovalDecision, string>> {
  if (!decisions.includes('approve')) return {};
  if (subject.state === 'blocked') return { approve: accountBlockedNote(subject.userStatus) };
  if (subject.makerGate === 'blocked') return { approve: USER_MAKER_CHECKER_BLOCKED };
  return {};
}

/** Approval ran; the identity is being created (BG-11). */
export const PROVISIONING_OUTCOME =
  'Approved: their sign-in identity is being created, and the invitation is sent when it completes. If creating it fails, it can be retried from their user record.';
/** Approval ran, but creating the identity failed (BG-11): the record says why and retries it. */
export const PROVISIONING_FAILED_OUTCOME =
  "Approved, but their sign-in identity couldn't be created. Their user record says why, and provisioning can be retried from there.";

/** Why a user approval offers no decision, shown in place of the bar; null while it waits. */
export function userOutcomeNote(
  state: UserApprovalState,
  membership: MembershipStatus,
): string | null {
  if (state === 'provisioning') return PROVISIONING_OUTCOME;
  if (state === 'provisioning-failed') return PROVISIONING_FAILED_OUTCOME;
  if (state !== 'decided') return null;
  switch (membership) {
    case 'ACTIVE':
      return 'Approved: this membership is active.';
    case 'REVOKED':
      // BG-28: inviting the email again re-invites them on this membership.
      return 'Rejected: this membership was revoked. Inviting this email again brings them back for a new approval.';
    default:
      return `This membership isn't waiting for approval: it is ${humanizeEnum(membership).toLowerCase()}.`;
  }
}

/** Activate is checked on the target branch and reads it back (BG-03, BG-31): a pending branch
 * grants no branch-scope permission (#242), so `branch.approve` and its view tenant-wide. Beside
 * it, the return route's intent for the caller: its maker withdraws (`branch.create`, there too),
 * anyone else returns (`branch.approve`), past the route's own gate (`RETURN_ROUTE_CODES`). */
export function availableBranchDecisions(
  branch: Pick<BranchDetail, 'id' | 'status' | 'createdBy' | 'submittedBy'>,
  holder: PermissionHolder,
  callerId: string,
): ApprovalDecision[] {
  if (branch.status !== 'PENDING_APPROVAL' || !canActOnBranch(holder, 'branch.approve', branch)) {
    return [];
  }
  const sendBack = pendingBranchAction(branch, callerId);
  const code = sendBack === 'withdraw' ? 'branch.create' : 'branch.approve';
  return canActOnBranch(holder, code, branch, RETURN_ROUTE_CODES)
    ? ['activate', sendBack]
    : ['activate'];
}

/** Activate disabled for its drafter while maker-checker is known to be on (`makerGate`, BG-08). */
export function blockedBranchDecisions(
  decisions: readonly ApprovalDecision[],
  subject: { makerGate: MakerGate },
): Partial<Record<ApprovalDecision, string>> {
  return decisions.includes('activate') && subject.makerGate === 'blocked'
    ? { activate: MAKER_CHECKER_BLOCKED }
    : {};
}

/** Why a branch activation offers no decision; null while it waits. A draft with a reason was
 * sent back (`sentBackNote`). */
export function branchOutcomeNote(
  branch: Pick<BranchDetail, 'status' | 'statusReason'>,
): string | null {
  switch (branch.status) {
    case 'PENDING_APPROVAL':
      return null;
    case 'ACTIVE':
      return 'Activated: this branch is live.';
    case 'DRAFT':
      return branch.statusReason
        ? 'Sent back to draft: it can be changed and submitted again.'
        : "This branch is still a draft: it hasn't been submitted for activation.";
    default:
      return `This branch isn't waiting for activation: it is ${humanizeEnum(branch.status).toLowerCase()}.`;
  }
}
