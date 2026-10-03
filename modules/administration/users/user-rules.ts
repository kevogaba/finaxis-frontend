import { can, canAll, canAny, type PermissionHolder } from '@/auth/permissions';
import { humanizeEnum, type StatusTone } from '@/components/data-display/status-chip';
import { UUID_PATTERN, type Page } from '@/lib/api/wire';
import type { MembershipStatus, UserStatus } from './user-contract';

export type OnboardingKey =
  | 'AWAITING_APPROVAL'
  | 'PROVISIONING_IDENTITY'
  | 'AWAITING_FIRST_SIGN_IN'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'ACCOUNT_BLOCKED'
  | 'ACCOUNT_NOT_READY';

export interface OnboardingState {
  key: OnboardingKey;
  label: string;
  tone: StatusTone;
}

const NOT_READY: readonly UserStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'PROVISIONING_IDP'];
// Contract §F: approval and sign-in need the account ACTIVE or INVITED.
const BLOCKED: readonly UserStatus[] = [
  'SUSPENDED',
  'LOCKED',
  'DEACTIVATING',
  'DEACTIVATED',
  'ARCHIVED',
];

function accountBlocked(user: UserStatus): OnboardingState {
  return {
    key: 'ACCOUNT_BLOCKED',
    label: `Account ${humanizeEnum(user).toLowerCase()}`,
    tone: 'error',
  };
}

/** A user status in words: `humanizeEnum` would print "Provisioning idp". */
export function userStatusLabel(status: UserStatus): string {
  return status === 'PROVISIONING_IDP' ? 'Provisioning identity' : humanizeEnum(status);
}

/** Spec §10.5's onboarding table (contract §F), made total over every status pair. */
export function onboardingState(membership: MembershipStatus, user: UserStatus): OnboardingState {
  switch (membership) {
    case 'REVOKED':
      return { key: 'REVOKED', label: 'Revoked', tone: 'error' };
    case 'SUSPENDED':
      return { key: 'SUSPENDED', label: 'Suspended', tone: 'error' };
    case 'PENDING_APPROVAL':
      // Approval already ran for a PROVISIONING_IDP user (BG-11); a blocked account can't be
      // approved (a 500); any other account waits.
      if (user === 'PROVISIONING_IDP') {
        return { key: 'PROVISIONING_IDENTITY', label: 'Provisioning identity', tone: 'warning' };
      }
      return BLOCKED.includes(user)
        ? accountBlocked(user)
        : { key: 'AWAITING_APPROVAL', label: 'Awaiting approval', tone: 'warning' };
    case 'ACTIVE':
      if (user === 'ACTIVE') return { key: 'ACTIVE', label: 'Active', tone: 'success' };
      if (user === 'INVITED') {
        return { key: 'AWAITING_FIRST_SIGN_IN', label: 'Awaiting first sign-in', tone: 'info' };
      }
      return NOT_READY.includes(user)
        ? { key: 'ACCOUNT_NOT_READY', label: 'Account not ready', tone: 'warning' }
        : accountBlocked(user);
  }
}

export interface OnboardingStep {
  label: string;
  detail: string;
  /** Always a word, never colour alone (WCAG 1.4.1). */
  state: { label: string; tone: StatusTone };
}

export type OnboardingProgress =
  { kind: 'steps'; steps: OnboardingStep[]; note: string | null } | { kind: 'note'; note: string };

const STEPS = [
  { label: 'Invited', detail: 'The membership is created and waits for approval.' },
  { label: 'Approved', detail: 'A different administrator approves it.' },
  {
    label: 'Identity provisioned',
    detail: 'Their sign-in identity is created and the invitation is sent.',
  },
  { label: 'First sign-in', detail: 'They sign in to this institution for the first time.' },
] as const;

const DONE = { label: 'Done', tone: 'success' } as const;
const WAITING = { label: 'Waiting', tone: 'warning' } as const;
const IN_PROGRESS = { label: 'In progress', tone: 'warning' } as const;
const NOT_STARTED = { label: 'Not started', tone: 'default' } as const;

const PROGRESS: Partial<Record<OnboardingKey, { done: number; next: OnboardingStep['state'] }>> = {
  AWAITING_APPROVAL: { done: 1, next: WAITING },
  PROVISIONING_IDENTITY: { done: 2, next: IN_PROGRESS },
  AWAITING_FIRST_SIGN_IN: { done: 3, next: WAITING },
  ACTIVE: { done: 4, next: WAITING },
};

export const PROVISIONING_NOTE =
  "Approval ran, and their sign-in identity is being created. The invitation is sent when it completes. If it stays here, identity provisioning may be switched off on the platform, and it can't be retried from here.";

/** The Overview's onboarding card. Derived from the two statuses only: the API exposes no
 * invitation record or timestamps (BG-11). Once onboarding has stopped, a sentence replaces the
 * steps rather than guessing which ones happened. */
export function onboardingProgress(
  membership: MembershipStatus,
  user: UserStatus,
): OnboardingProgress {
  const state = onboardingState(membership, user);
  const progress = PROGRESS[state.key];
  if (progress) {
    return {
      kind: 'steps',
      steps: STEPS.map((step, index) => ({
        ...step,
        state: index < progress.done ? DONE : index === progress.done ? progress.next : NOT_STARTED,
      })),
      note: state.key === 'PROVISIONING_IDENTITY' ? PROVISIONING_NOTE : null,
    };
  }
  switch (state.key) {
    case 'SUSPENDED':
      return {
        kind: 'note',
        note: "The membership is suspended, so they can't sign in to this institution until it's reactivated.",
      };
    case 'REVOKED':
      return {
        kind: 'note',
        note: "The membership is revoked. This is permanent: this email can't be invited to this institution again.",
      };
    case 'ACCOUNT_BLOCKED':
      return {
        kind: 'note',
        note: `Their account is ${humanizeEnum(user).toLowerCase()} on the platform, so they can't sign in to any institution.`,
      };
    default:
      return {
        kind: 'note',
        note: "The membership is active, but their account isn't ready to sign in yet.",
      };
  }
}

export type MembershipAction = 'approve' | 'reject' | 'suspend' | 'reactivate' | 'revoke';

const ACTIONS_BY_STATUS: Record<MembershipStatus, readonly MembershipAction[]> = {
  PENDING_APPROVAL: ['approve', 'reject'],
  ACTIVE: ['suspend', 'revoke'],
  SUSPENDED: ['reactivate', 'revoke'],
  REVOKED: [],
};

// Reject & revoke is the revoke endpoint (D12, contract §E.3).
const PERMISSION: Record<MembershipAction, string> = {
  approve: 'user.approve',
  reject: 'membership.revoke',
  suspend: 'membership.suspend',
  reactivate: 'membership.reactivate',
  revoke: 'membership.revoke',
};

const LIFECYCLE_CODES = [...new Set(Object.values(PERMISSION))];

export interface MembershipSubject {
  membershipStatus: MembershipStatus;
  userStatus: UserStatus;
  /** The signed-in user's own record (the backend's id, Ruling 6). */
  self: boolean;
  /** The signed-in user is the `user.invite` actor; false when unknown (BG-08). */
  invitedByMe: boolean;
}

/** The hero's actions, in display order. Every transition reads the membership back, so the
 * `membership.view` gate runs first (BG-31); then the status; then each action's own code. Approve
 * is withheld once approval ran (re-approving a PROVISIONING_IDP user is a 500, BG-07). */
export function availableMembershipActions(
  status: Pick<MembershipSubject, 'membershipStatus' | 'userStatus'>,
  holder: PermissionHolder,
): MembershipAction[] {
  if (!can(holder, 'membership.view')) return [];
  return ACTIONS_BY_STATUS[status.membershipStatus].filter(
    (action) =>
      can(holder, PERMISSION[action]) &&
      !(action === 'approve' && status.userStatus === 'PROVISIONING_IDP'),
  );
}

export const NO_MEMBERSHIP_VIEW =
  "Membership actions need permission to view memberships, which your role doesn't include.";
export const MEMBERSHIP_MISSING =
  "This user's membership couldn't be found, so its actions aren't available.";
export const MEMBERSHIP_UNAVAILABLE =
  "This user's membership couldn't be loaded, so its actions aren't available. Refresh to try again.";
export const OWN_MEMBERSHIP =
  "You can't suspend or revoke your own membership. Ask another administrator.";
export const USER_MAKER_CHECKER_BLOCKED =
  'You invited this user, so another administrator must approve them.';

export function accountBlockedNote(user: UserStatus): string {
  return `Their account is ${humanizeEnum(user).toLowerCase()} on the platform, so this membership can't be approved.`;
}

/** The offered actions that are contextually blocked, each with the caption that says why: shown
 * disabled, not hidden (spec §6.6), like the inviter's Approve (spec §10.5). */
export function blockedMembershipActions(
  actions: readonly MembershipAction[],
  subject: MembershipSubject,
): Partial<Record<MembershipAction, string>> {
  const blocked: Partial<Record<MembershipAction, string>> = {};
  for (const action of actions) {
    if (action === 'approve' && BLOCKED.includes(subject.userStatus)) {
      blocked.approve = accountBlockedNote(subject.userStatus); // contract §F, else a 500
    } else if (action === 'approve' && subject.invitedByMe) {
      blocked.approve = USER_MAKER_CHECKER_BLOCKED; // maker-checker (BG-08)
    } else if ((action === 'suspend' || action === 'revoke') && subject.self) {
      blocked[action] = OWN_MEMBERSHIP; // Ruling 6, BG-35
    }
  }
  return blocked;
}

/** The email lookup's outcome (Ruling 7): a miss within the ceiling isn't a failure. */
export type MembershipLookup = 'found' | 'missing' | 'failed';

/** Why the hero has no actions the holder's codes suggest; null when nothing needs saying
 * (including for a holder with no lifecycle code at all). */
export function membershipActionsNote(
  holder: PermissionHolder,
  lookup: MembershipLookup,
): string | null {
  if (!canAny(holder, LIFECYCLE_CODES)) return null;
  if (!can(holder, 'membership.view')) return NO_MEMBERSHIP_VIEW;
  if (lookup === 'missing') return MEMBERSHIP_MISSING;
  return lookup === 'failed' ? MEMBERSHIP_UNAVAILABLE : null;
}

/** A REVOKED membership takes no assignment (409). The role select reads `getRoleIndex`, which
 * needs `role.view`. */
export function canAssignUserRole(status: MembershipStatus, holder: PermissionHolder): boolean {
  return status !== 'REVOKED' && canAll(holder, ['user.assign_role', 'role.view']);
}

/** The write reads back `branch_assignment.view` (BG-31); the branch select needs `branch.view`. */
export function canAssignUserBranch(status: MembershipStatus, holder: PermissionHolder): boolean {
  return (
    status !== 'REVOKED' &&
    canAll(holder, ['user.assign_branch', 'branch_assignment.view', 'branch.view'])
  );
}

export const ACCESS_DESCRIPTION =
  'Roles this user holds. Institution scope applies everywhere; branch scope only while that branch is selected.';
export const NO_ACTIVE_ROLES =
  'There are no active roles to assign. Create or activate one under Roles & permissions.';
export const PARTIAL_SCAN_NOTE =
  "This list may be incomplete: the platform can't filter branch assignments by user, so only the first 500 in this institution were checked.";

/** `canSwitch`: the signed-in user has more than one ACTIVE branch, so All branches is open. */
export function branchContextNote(branchName: string, canSwitch: boolean): string {
  return canSwitch
    ? `Only ${branchName} is visible with a branch selected. Switch to All branches to see this user's other branch assignments.`
    : `Only ${branchName} is visible: your account is assigned to this branch only, so this user's other branch assignments can't be shown.`;
}

/** A select's option (structurally 09's `BranchOption`). */
export interface SelectOption {
  id: string;
  label: string;
}

/** BRANCH scope needs an existing ACTIVE assignment at that branch (else 409), and in a branch
 * context only the selected branch is reachable (§E.4). A branch held twice is offered once. */
export function roleScopeBranches(
  rows: readonly { branchId: string }[],
  selectedBranchId: string | null,
  label: (branchId: string) => string,
): SelectOption[] {
  return [...new Set(rows.map((row) => row.branchId))]
    .filter((id) => selectedBranchId === null || id === selectedBranchId)
    .map((id) => ({ id, label: label(id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function roleScopeHint(input: {
  readable: boolean;
  offered: number;
  selectedBranchName: string | null;
}): string | undefined {
  if (input.offered > 0) return undefined;
  if (!input.readable) {
    return "Their branch assignments can't be read here, so only institution scope is available.";
  }
  if (input.selectedBranchName) {
    return `They aren't assigned to ${input.selectedBranchName}. Assign them there first to give a branch-scoped role.`;
  }
  return 'Assign them to a branch first to give a branch-scoped role.';
}

export function branchAssignmentCount(
  count: number,
  truncated: boolean,
  selectedBranchName: string | null,
): string {
  // A capped scan is partial in a branch context too: the backend forces the search to the selected
  // branch (§E.4), and a branch with more than 500 ACTIVE assignments can hide the user's row.
  if (selectedBranchName) {
    return truncated
      ? `At least ${count} at ${selectedBranchName} (partial)`
      : `${count} at ${selectedBranchName}`;
  }
  return truncated ? `At least ${count} (partial)` : String(count);
}

/** Server-side paging of a bounded, already filtered list (the scan's rows for one user), so the
 * URL holds page and size like every other list (AGENTS.md). */
export function pageOfItems<T>(
  items: readonly T[],
  paging: { page: number; size: number },
): Page<T> {
  const start = paging.page * paging.size;
  return {
    items: items.slice(start, start + paging.size),
    page: {
      number: paging.page,
      size: paging.size,
      totalItems: items.length,
      totalPages: Math.ceil(items.length / paging.size),
      hasNext: start + paging.size < items.length,
      hasPrevious: paging.page > 0,
    },
  };
}

/** The record route's id (spec §6.8), canonicalised to lower case (contract §A) so the reads, the
 * audit filters and the self check all see the backend's form. null → not found, before any read. */
export function parseUserId(param: string): string | null {
  return UUID_PATTERN.test(param) ? param.toLowerCase() : null;
}
