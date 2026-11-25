import type { ActionResult } from '@/lib/api/action-result';
import { sendBackCopy } from '@/modules/administration/branches/branch-rules';
import type { MembershipDecision } from './approval-contract';
import type { ApprovalDecision } from './approval-rules';

// ── The decisions' copy (Rulings 6, 10) ──────────────────────────────────────────────────────────

export interface DecisionCopy {
  label: string;
  title: string;
  description: string;
  reason: 'optional' | 'required';
  /** The reason field's label, when not "Reason". */
  reasonLabel?: string;
  /** Said under the reason field. */
  reasonHelperText?: string;
  /** Irreversible and destructive: an error-toned trigger and an alertdialog. */
  destructive: boolean;
}

/** Decision Q7 (BG-01): the optional remark every Approve dialog takes, for a member (the user
 * record, the approval page) and an institution. The platform trims it, drops a blank one and
 * refuses one over 500 characters; it keeps it on the approval's audit row, and an institution's
 * as its status reason. */
export const APPROVAL_REMARK = {
  reasonLabel: 'Remark (optional)',
  reasonHelperText: 'Recorded with the approval. Up to 500 characters.',
} as const;

/** The remark's field error over 500 characters: it says "remark", and exactly 500 is accepted. */
export const APPROVAL_REMARK_TOO_LONG = 'Keep the remark to 500 characters or fewer.';

export function decisionCopy(decision: ApprovalDecision, name: string): DecisionCopy {
  switch (decision) {
    case 'approve':
      return {
        label: 'Approve',
        title: `Approve ${name}?`,
        description:
          "Their membership becomes active once their sign-in identity is ready. If they don't have one yet, it is created first and the invitation is sent when it completes. An approval can't be undone.",
        reason: 'optional',
        ...APPROVAL_REMARK,
        destructive: false,
      };
    case 'reject':
      return {
        label: 'Reject & revoke',
        title: `Reject and revoke ${name}?`,
        description:
          'This is permanent. The membership is revoked, and this email can never be invited to this institution again.',
        reason: 'required',
        destructive: true,
      };
    case 'activate':
      return {
        label: 'Activate',
        title: `Activate ${name}?`,
        description:
          "The branch goes live: it can take user assignments and become a working context. A live branch can be suspended or closed, but it can't return to a draft.",
        reason: 'optional',
        destructive: false,
      };
    case 'withdraw':
    case 'return': {
      const { label, title, description, reasonLabel } = sendBackCopy(decision, name);
      return { label, title, description, reasonLabel, reason: 'required', destructive: false };
    }
  }
}

/** 200 = the membership is ACTIVE; 202 = it stays PENDING_APPROVAL while the identity is created
 * (contract §E.3). `recorded`: the echo couldn't be read, so the toast claims neither. */
export type ApprovalOutcome = 'active' | 'provisioning' | 'recorded';

export const APPROVED_TOAST: Record<ApprovalOutcome, string> = {
  active: 'Approved. Their membership is active.',
  provisioning:
    'Approved. Identity provisioning is queued: the invitation is sent when it completes.',
  recorded: 'Approval recorded',
};
export const REJECTED_TOAST = 'Membership revoked';
export const ACTIVATED_TOAST = 'Branch activated';

export function approvalOutcome(echo: MembershipDecision | null): ApprovalOutcome {
  if (echo?.membershipStatus === 'ACTIVE') return 'active';
  if (echo?.membershipStatus === 'PENDING_APPROVAL') return 'provisioning';
  return 'recorded';
}

/** `approveUser`'s result: a success carries which way the approval went (Ruling 10). */
export type ApproveResult =
  { ok: true; outcome: ApprovalOutcome } | Extract<ActionResult, { ok: false }>;

/** Frontend-only problem codes: the actions refuse before any write (Ruling 5; precedent: 17's
 * `own_account`, 16's `tenant_code_taken`). */
export const APPROVAL_CHANGED_CODE = 'approval_changed';
export const ACCOUNT_BLOCKED_CODE = 'account_blocked';

export const APPROVAL_CHANGED =
  'This approval changed since the page loaded. Refresh to see where it stands.';
export const BRANCH_CHANGED =
  'This branch changed since the page loaded. Refresh to see where it stands.';

// ── Page copy ────────────────────────────────────────────────────────────────────────────────────

export const QUEUE_DESCRIPTION =
  'Memberships waiting for approval and branches waiting for activation. An administrator other than the one who asked must decide each.';
export const USER_QUEUE_DESCRIPTION =
  "Newest first. Someone marked Provisioning identity was already approved and needs no decision, so the tab's count leaves them out.";
export const BRANCH_QUEUE_DESCRIPTION = 'Branches submitted for activation.';
export const NO_USERS_WAITING = 'No users are waiting for approval';
export const NO_BRANCHES_WAITING = 'No branches are waiting for activation';
export const NO_APPROVAL_ACCESS =
  "Your role can't approve users or activate branches. Ask an administrator if you need access.";
export const USER_APPROVAL_FORBIDDEN =
  "Your role can't approve users. Ask an administrator if you need access.";
export const BRANCH_ACTIVATION_FORBIDDEN =
  "Your role can't activate branches. Ask an administrator if you need access.";

export const USER_APPROVAL_EYEBROW = 'Approval queue · User onboarding';
export const BRANCH_APPROVAL_EYEBROW = 'Approval queue · Branch activation';
// By kind only: the Request card also shows on a page whose request was already decided.
export const USER_REQUEST = 'User onboarding: a new membership';
export const BRANCH_REQUEST = 'Branch activation: a submitted branch';
export const REQUEST_DESCRIPTION = 'Who asked, and when. The full history is in the audit trail.';
export const CHECKS_DESCRIPTION =
  "What the platform requires before it approves or activates. A check this page can't read is left to the platform.";
export const READ_FAILED = "Couldn't be loaded";

/** One page of role assignments and one of branch assignments: a pending user holds a handful
 * (Ruling 8, AGENTS.md's seventh paging exception). */
export const REQUESTED_ACCESS_CEILING = 100;
export const REQUESTED_ACCESS_DESCRIPTION =
  'The access they get once approved: their roles and branches were assigned when they were invited.';
export const ROLES_NOT_PERMITTED = "Your role can't view role assignments.";
export const BRANCHES_NOT_PERMITTED = "Your role can't view branch assignments.";
export const MEMBERSHIP_NOT_PERMITTED = "Your role can't view memberships.";
export const NO_ACTIVE_ROLE = 'They hold no active role.';
// A branch-scoped role-assignment view sees only its branches' rows: it can't say "none" (rule 9).
export const NO_ACTIVE_ROLE_SEEN =
  'No active role was found among the role assignments this page could check.';
export const NO_ACTIVE_BRANCH = 'They hold no active branch assignment.';
// A branch-scoped view sees only its branches' rows: it can't say "none" (rule 9).
export const NO_ACTIVE_BRANCH_SEEN =
  'No active branch assignment was found among those this page could check.';
export const ROLES_CAPPED = `Only the first ${REQUESTED_ACCESS_CEILING} role assignments are shown. Their record lists them all.`;
export const BRANCHES_CAPPED = `Only the first ${REQUESTED_ACCESS_CEILING} branch assignments are shown. Their record lists them all.`;
