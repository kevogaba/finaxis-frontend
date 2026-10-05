import type { ActionResult } from '@/lib/api/action-result';
import type { MembershipDecision } from './approval-contract';
import type { ApprovalDecision } from './approval-rules';

// ── The decisions' copy (Rulings 6, 10) ──────────────────────────────────────────────────────────

export interface DecisionCopy {
  label: string;
  title: string;
  description: string;
  /** `null`: the activate endpoint reads no body, so a confirmation without a reason. */
  reason: 'optional' | 'required' | null;
  /** Irreversible and destructive: an error-toned trigger and an alertdialog. */
  destructive: boolean;
}

export function decisionCopy(decision: ApprovalDecision, name: string): DecisionCopy {
  switch (decision) {
    case 'approve':
      return {
        label: 'Approve',
        title: `Approve ${name}?`,
        description:
          "Their membership becomes active once their sign-in identity is ready. If they don't have one yet, it is created first and the invitation is sent when it completes. An approval can't be undone.",
        reason: null,
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
export const MAKER_CHECKER_CODE = 'maker_checker';
export const BRANCH_CONTEXT_CODE = 'branch_context';

export const APPROVAL_CHANGED =
  'This approval changed since the page loaded. Refresh to see where it stands.';
export const BRANCH_CHANGED =
  'This branch changed since the page loaded. Refresh to see where it stands.';
export const BRANCH_CONTEXT_REFUSAL =
  'Branches are activated with All branches selected. Switch to All branches and try again.';
/** BG-08: a maker-checker refusal is the same 403 as a missing permission: never assert which. */
export const APPROVE_FORBIDDEN =
  "You can't approve this user. Your role may not allow it, or you invited them: a different administrator must approve them.";
/** BG-07: missing prerequisites are 500s. */
export const APPROVE_FAILED =
  "The approval couldn't complete. They may still need an active role and, for staff and admin members, an active branch assignment. Refresh and check.";
export const REJECT_FAILED =
  "This membership couldn't be revoked. It may already be revoked: refresh and check.";
export const ACTIVATE_FORBIDDEN =
  "You can't activate this branch. Your role may not allow it, or you drafted it: a different administrator must activate it.";

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

/** The Branch activation tab with a branch selected (Ruling 11): the list isn't branch-restricted,
 * but activation needs All branches (BG-03). */
export function branchQueueContextNote(branchName: string, canSwitch: boolean): string {
  return canSwitch
    ? `With ${branchName} selected, these branches can be listed but not activated. Switch to All branches to review them.`
    : `With ${branchName} selected, these branches can be listed but not activated, and your account works at this branch only. Ask an administrator who works at institution level to review them.`;
}

export const USER_APPROVAL_EYEBROW = 'Approval queue · User onboarding';
export const BRANCH_APPROVAL_EYEBROW = 'Approval queue · Branch activation';
// By kind only: the Request card also shows on a page whose request was already decided.
export const USER_REQUEST = 'User onboarding: a new membership';
export const BRANCH_REQUEST = 'Branch activation: a submitted branch';
export const REQUEST_DESCRIPTION = 'Who asked, and when. The full history is in the audit trail.';
export const CHECKS_DESCRIPTION =
  "What the platform requires before it approves or activates. A check this page can't read is left to the platform.";
export const MAKER_NOT_PERMITTED = "Your role can't view the audit trail";
export const MAKER_NOT_RECORDED = 'Not in the audit trail';
export const MEMBERSHIP_NOT_FOUND = "Their membership couldn't be found";
export const READ_FAILED = "Couldn't be loaded";

/** One page of role assignments: a pending user holds a handful (Ruling 8, AGENTS.md's seventh
 * paging exception). */
export const REQUESTED_ROLES_CEILING = 100;
export const REQUESTED_ACCESS_DESCRIPTION =
  'The access they get once approved: their roles and branches were assigned when they were invited.';
export const ROLES_NOT_PERMITTED = "Your role can't view role assignments.";
export const BRANCHES_NOT_PERMITTED = "Your role can't view branch assignments.";
export const MEMBERSHIP_NOT_PERMITTED = "Your role can't view memberships.";
export const NO_ACTIVE_ROLE = 'They hold no active role.';
export const NO_ACTIVE_BRANCH = 'They hold no active branch assignment.';
// A selected branch narrows the scan and a capped scan hides rows: neither can say "none" (rule 9).
export const NO_ACTIVE_BRANCH_SEEN =
  'No active branch assignment was found among those this page could check.';
export const ROLES_CAPPED = `Only the first ${REQUESTED_ROLES_CEILING} role assignments are shown. Their record lists them all.`;
