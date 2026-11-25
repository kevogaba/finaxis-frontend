import { can, canAll, type PermissionHolder } from '@/auth/permissions';
import { withViews } from '@/auth/permission-views';
import type { ActorRef } from '@/lib/api/wire';
import { userApprovalState } from '@/modules/administration/approvals/approval-rules';
import { isMaker, isSameUser } from '@/modules/administration/approvals/maker-checker';
import type { BranchStatus } from '@/modules/administration/branches/branch-contract';
import {
  pendingBranchAction,
  type SendBackAction,
} from '@/modules/administration/branches/branch-rules';
import type { MembershipStatus, UserStatus } from '@/modules/administration/users/user-contract';
import {
  accountBlockedNote,
  USER_MAKER_CHECKER_BLOCKED,
} from '@/modules/administration/users/user-rules';
import type { TenantStatus } from '../tenants/tenant-contract';

/**
 * The platform checker (ADR 0028, BG-02): while a new institution has no approver of its own, a
 * platform administrator approves its first members and submits, returns and activates its first
 * branches, from the institution record's Users and Branches tabs. Pure and client-safe.
 */

/** `unknown`: the window's read failed, so the actions stay offered and the platform's named 409
 * (`lifecycle.platform_checker_closed`) explains a closed one. */
export type CheckerWindow = 'open' | 'closed' | 'unknown';

/**
 * One window from one bounded read of the institution's ACTIVE rows (`size=1`): open while none is
 * ACTIVE beyond the one the system made, its first administrator or its head office
 * (`hasActiveMembershipBeyondBootstrap`, `hasActiveBranchBeyondBootstrap`). The system makes at
 * most one of each, and a platform caller sees every other maker (`created_by` is null only for the
 * system), so two ACTIVE rows close it, and one keeps it open only when it names no maker.
 */
export function checkerWindow(active: {
  items: readonly { createdBy: ActorRef }[];
  page: { totalItems: number };
}): Exclude<CheckerWindow, 'unknown'> {
  if (active.page.totalItems === 0) return 'open';
  return active.page.totalItems === 1 && active.items[0]?.createdBy === null ? 'open' : 'closed';
}

// ── Members ──────────────────────────────────────────────────────────────────────────────────────

/** `POST /platform/tenants/{id}/memberships/{mid}/activate`: `user.approve` with its view, in the
 * platform organisation, for an ACTIVE institution (else a plain 409). */
export const MEMBER_CHECKER_CODES = withViews(['user.approve']);

export function canCheckMembers(tenantStatus: TenantStatus, holder: PermissionHolder): boolean {
  return tenantStatus === 'ACTIVE' && canAll(holder, MEMBER_CHECKER_CODES);
}

export const OWN_MEMBERSHIP_APPROVAL = "You can't approve your own membership.";

interface MemberRow {
  id: string;
  membershipStatus: MembershipStatus;
  userStatus: UserStatus;
  createdBy: ActorRef;
}

/** A row's Approve: `null` when it isn't offered (decided, or already approved into identity
 * provisioning, BG-11), else the caption that disables it, or `null` for none. The platform checker
 * is never the maker or the beneficiary, whatever the institution's switch (`MembershipCheckerRule`).
 * `callerId` null (no profile): nothing blocks, and the platform decides. */
export function memberApproval(
  row: MemberRow,
  callerId: string | null,
): { blocked: string | null } | null {
  const state = userApprovalState(row.membershipStatus, row.userStatus);
  if (state !== 'awaiting' && state !== 'blocked') return null;
  if (state === 'blocked') return { blocked: accountBlockedNote(row.userStatus) };
  if (isSameUser(row.createdBy?.id, callerId)) return { blocked: USER_MAKER_CHECKER_BLOCKED };
  if (isSameUser(row.id, callerId)) return { blocked: OWN_MEMBERSHIP_APPROVAL };
  return { blocked: null };
}

// ── Branches ─────────────────────────────────────────────────────────────────────────────────────

/** Submit, Return (or Withdraw, for the branch's own maker) and Activate, in the row's order. */
export type CheckerBranchAction = 'submit' | SendBackAction | 'activate';

/** Submit and return need an ACTIVE or PROVISIONING institution; activate an ACTIVE one. */
const BRANCH_STATES: readonly TenantStatus[] = ['ACTIVE', 'PROVISIONING'];

/** Whether the tab offers any branch action: `branch.create` or `branch.approve`, each with
 * `branch.view`, in the platform organisation. */
export function canCheckBranches(tenantStatus: TenantStatus, holder: PermissionHolder): boolean {
  return (
    BRANCH_STATES.includes(tenantStatus) &&
    can(holder, 'branch.view') &&
    (can(holder, 'branch.create') || can(holder, 'branch.approve'))
  );
}

interface BranchRow {
  status: BranchStatus;
  createdBy: ActorRef;
  submittedBy: ActorRef;
}

interface BranchContext {
  tenantStatus: TenantStatus;
  window: CheckerWindow;
  holder: PermissionHolder;
  callerId: string | null;
}

/**
 * `PlatformTenantBranchController`: submit (`branch.create`), activate (`branch.approve`) and return
 * (`branch.approve`) are the checker's, bounded by the window. A pending branch's creator or latest
 * submitter withdraws it instead (`branch.create`), which the window doesn't bound: taking back
 * one's own request grants nothing. Every route reads the branch back, so all need `branch.view`.
 */
export function checkerBranchActions(
  branch: BranchRow,
  { tenantStatus, window, holder, callerId }: BranchContext,
): CheckerBranchAction[] {
  if (!BRANCH_STATES.includes(tenantStatus) || !can(holder, 'branch.view')) return [];
  const open = window !== 'closed';
  if (branch.status === 'DRAFT') return open && can(holder, 'branch.create') ? ['submit'] : [];
  if (branch.status !== 'PENDING_APPROVAL') return [];
  const actions: CheckerBranchAction[] = [];
  const sendBack = callerId === null ? 'return' : pendingBranchAction(branch, callerId);
  if (
    sendBack === 'withdraw' ? can(holder, 'branch.create') : open && can(holder, 'branch.approve')
  ) {
    actions.push(sendBack);
  }
  if (open && tenantStatus === 'ACTIVE' && can(holder, 'branch.approve')) actions.push('activate');
  return actions;
}

export const PLATFORM_ACTIVATE_BLOCKED =
  'You created or submitted this branch, so another administrator must activate it.';

/** The platform route also refuses the submitter (`lifecycle.approver_is_branch_maker`), and no
 * switch relaxes it. An editor's refusal is explained when it comes: nothing exposes who edited. */
export function activateBlocked(branch: BranchRow, callerId: string | null): string | null {
  return callerId !== null && isMaker([branch.createdBy?.id, branch.submittedBy?.id], callerId)
    ? PLATFORM_ACTIVATE_BLOCKED
    : null;
}

// ── The tabs' notes ──────────────────────────────────────────────────────────────────────────────

export interface CheckerNote {
  /** Open: what a platform administrator may do here. Closed: that the institution decides. */
  open: boolean;
  text: string;
}

export function memberCheckerNote(name: string, window: CheckerWindow): CheckerNote | null {
  if (window === 'unknown') return null;
  return window === 'open'
    ? {
        open: true,
        text: `Platform checking is open: ${name} has no active member besides its first administrator, so a platform administrator can approve its first members.`,
      }
    : { open: false, text: `${name} now approves its own members.` };
}

/** Activation needs an ACTIVE institution, so a PROVISIONING one's open note doesn't promise it. */
export function branchCheckerNote(
  name: string,
  window: CheckerWindow,
  tenantStatus: TenantStatus,
): CheckerNote | null {
  if (window === 'unknown') return null;
  if (window === 'closed') return { open: false, text: `${name} now approves its own branches.` };
  const opening = `Platform checking is open: ${name} has no active branch besides its head office, so a platform administrator can`;
  return {
    open: true,
    text:
      tenantStatus === 'ACTIVE'
        ? `${opening} submit, return and activate its first branches.`
        : `${opening} submit and return its first branches. Activation waits until the institution is active.`,
  };
}

/** Said in each checker dialog: the decision lands in the institution's audit log. */
export const CHECKER_AUDIT_NOTE =
  "The institution's audit log records you as the platform checker.";

// ── The actions' refusals: each 409 hedges, since the platform's are plain `conflict` ────────────

/** The institution isn't ACTIVE, the membership isn't pending, the person has no active role or
 * branch yet, or their account can't be activated (suspended or deactivated): all a plain 409. */
export const CHECKER_APPROVE_CONFLICT =
  "This request couldn't be approved. It may already have been decided, the person may have no active role or branch yet, their account may be suspended or deactivated, or the institution may not be active. Refresh and check.";
export const CHECKER_SUBMIT_CONFLICT =
  "This draft couldn't be submitted. It may no longer be a draft, its code may now be in use, or the institution may not take branches right now. Refresh and check.";
export const CHECKER_ACTIVATE_CONFLICT =
  "This branch couldn't be activated. It may no longer be waiting for activation, or the institution may not be active. Refresh and check.";
export const CHECKER_RETURN_CONFLICT =
  "This branch isn't waiting for approval any more, or the institution changed. Refresh to see where it stands.";
