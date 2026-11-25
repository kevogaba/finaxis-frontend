import {
  can,
  canAll,
  canAllTenantWide,
  canAny,
  canTenantWide,
  ownAccessBlocked,
  type PermissionHolder,
} from '@/auth/permissions';
import { withViews } from '@/auth/permission-views';
import { humanizeEnum, type StatusTone } from '@/components/data-display/status-chip';
import { UUID_PATTERN } from '@/lib/api/wire';
import { formatInstant } from '@/lib/format';
import type { MakerGate } from '@/modules/administration/approvals/maker-checker';
import { SCOPED_BRANCHES_NOTE } from '@/modules/administration/branches/branch-rules';
import type {
  Invitation,
  InvitationStatus,
  MembershipStatus,
  MembershipType,
  UserStatus,
} from './user-contract';

export type OnboardingKey =
  | 'AWAITING_APPROVAL'
  | 'PROVISIONING_IDENTITY'
  | 'IDENTITY_IN_PROGRESS'
  | 'IDENTITY_FAILED'
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

/** BG-28: a list row that is PENDING_APPROVAL with its account PROVISIONING_IDP. Usually approval
 * ran and the sign-in identity is being set up, but a re-invited member whose account was never
 * provisioned reads the same: only the membership's `invitation` tells them apart, and list rows
 * carry none (platform 6a8ea28). */
export function awaitsIdentity(user: {
  membershipStatus: MembershipStatus;
  userStatus: UserStatus;
}): boolean {
  return user.membershipStatus === 'PENDING_APPROVAL' && user.userStatus === 'PROVISIONING_IDP';
}

/** A user status in words: `humanizeEnum` would print "Provisioning idp". */
export function userStatusLabel(status: UserStatus): string {
  return status === 'PROVISIONING_IDP' ? 'Provisioning identity' : humanizeEnum(status);
}

const AWAITING_APPROVAL: OnboardingState = {
  key: 'AWAITING_APPROVAL',
  label: 'Awaiting approval',
  tone: 'warning',
};

/** A pending membership whose account waits on identity provisioning, told apart by the
 * membership's `invitation` (BG-11) where it was read. Unread (list rows carry none, and it needs
 * `membership.view`), the account's own status is all that is known. AWAITING_APPROVAL: no
 * approval of this membership's life has queued it yet (a re-invite, ADR 0037), so it waits. */
function identityState(invitation: InvitationStatus | null | undefined): OnboardingState {
  switch (invitation) {
    case undefined:
    case null:
      return { key: 'PROVISIONING_IDENTITY', label: 'Provisioning identity', tone: 'warning' };
    case 'FAILED':
      return { key: 'IDENTITY_FAILED', label: 'Identity failed', tone: 'error' };
    case 'AWAITING_APPROVAL':
      return AWAITING_APPROVAL;
    default:
      return { key: 'IDENTITY_IN_PROGRESS', label: 'Identity in progress', tone: 'warning' };
  }
}

/** Spec §10.5's onboarding table (contract §F), made total over every status pair. `invitation`:
 * the membership's `invitation.status` where it was read (BG-11), which splits a provisioning
 * identity into in progress and failed. */
export function onboardingState(
  membership: MembershipStatus,
  user: UserStatus,
  invitation?: InvitationStatus | null,
): OnboardingState {
  switch (membership) {
    case 'REVOKED':
      return { key: 'REVOKED', label: 'Revoked', tone: 'error' };
    case 'SUSPENDED':
      return { key: 'SUSPENDED', label: 'Suspended', tone: 'error' };
    case 'PENDING_APPROVAL':
      // Approval already ran for a PROVISIONING_IDP user (BG-11); a blocked account can't be
      // approved (a 409, BG-07); any other account waits.
      if (user === 'PROVISIONING_IDP') return identityState(invitation);
      return BLOCKED.includes(user) ? accountBlocked(user) : AWAITING_APPROVAL;
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
const FAILED = { label: 'Failed', tone: 'error' } as const;
const NOT_STARTED = { label: 'Not started', tone: 'default' } as const;

const PROGRESS: Partial<Record<OnboardingKey, { done: number; next: OnboardingStep['state'] }>> = {
  AWAITING_APPROVAL: { done: 1, next: WAITING },
  PROVISIONING_IDENTITY: { done: 2, next: IN_PROGRESS },
  IDENTITY_IN_PROGRESS: { done: 2, next: IN_PROGRESS },
  IDENTITY_FAILED: { done: 2, next: FAILED },
  AWAITING_FIRST_SIGN_IN: { done: 3, next: WAITING },
  ACTIVE: { done: 4, next: WAITING },
};

/** Under the steps while the identity is being created (BG-11). */
export const IDENTITY_IN_PROGRESS_NOTE =
  'Approval ran, and their sign-in identity is being created. The invitation is sent when it completes.';
/** Under the steps once creating it failed: the reason is in the invitation facts below it. */
export const IDENTITY_FAILED_NOTE =
  "Approval ran, but their sign-in identity couldn't be created. Once the reason below is dealt with, provisioning can be retried.";

const NOTES: Partial<Record<OnboardingKey, string>> = {
  PROVISIONING_IDENTITY: IDENTITY_IN_PROGRESS_NOTE,
  IDENTITY_IN_PROGRESS: IDENTITY_IN_PROGRESS_NOTE,
  IDENTITY_FAILED: IDENTITY_FAILED_NOTE,
};

/** The Overview's onboarding card, from the two statuses and, where it was read, the membership's
 * `invitation` (BG-11). Once onboarding has stopped, a sentence replaces the steps rather than
 * guessing which ones happened. */
export function onboardingProgress(
  membership: MembershipStatus,
  user: UserStatus,
  invitation?: InvitationStatus | null,
): OnboardingProgress {
  const state = onboardingState(membership, user, invitation);
  const progress = PROGRESS[state.key];
  if (progress) {
    return {
      kind: 'steps',
      steps: STEPS.map((step, index) => ({
        ...step,
        state: index < progress.done ? DONE : index === progress.done ? progress.next : NOT_STARTED,
      })),
      note: NOTES[state.key] ?? null,
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
        // BG-28: inviting the email again re-invites them on this membership.
        note: "The membership is revoked, so they can't use this institution. Inviting this email again brings them back on the same membership, after a new approval.",
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

const UNRECORDED = "The reason wasn't recorded.";

/** BG-11: the words for each closed failure code of a FAILED invitation, never the platform's own
 * text (it returns none). */
export const INVITATION_ERROR_COPY: Readonly<Record<string, string>> = {
  IDENTITY_PROVIDER_FAILED:
    "The identity provider refused the request. Check that it's configured.",
  CONFLICT: 'An account with these details already exists at the identity provider.',
  NOT_FOUND: "The account wasn't found at the identity provider.",
  INVALID_STATE: "The account was in a state the identity provider couldn't use.",
  DATABASE_ERROR: "The platform couldn't save the result.",
  UNEXPECTED: 'Something unexpected went wrong.',
  CANCELLED: 'Provisioning was cancelled.',
  UNKNOWN: UNRECORDED,
};

/** The codes whose words say what to do first, as worded where Retry provisioning is on offer. A
 * revoked membership's failed invitation, or a reader who can't retry, keeps the plain words. */
export const INVITATION_RETRY_COPY: Readonly<Record<string, string>> = {
  IDENTITY_PROVIDER_FAILED:
    "The identity provider refused the request. Check that it's configured, then retry.",
};

/** A failure code in words; a code the platform adds later, or none, reads as unrecorded. The
 * tables are read with `Object.hasOwn`: a code is the platform's text, and `toString` must not
 * find `Object.prototype`'s. `retryable`: Retry provisioning is offered beside it. */
export function invitationErrorText(code: string | null, retryable = false): string {
  if (code === null) return UNRECORDED;
  if (retryable && Object.hasOwn(INVITATION_RETRY_COPY, code)) {
    return INVITATION_RETRY_COPY[code] ?? UNRECORDED;
  }
  return Object.hasOwn(INVITATION_ERROR_COPY, code)
    ? (INVITATION_ERROR_COPY[code] ?? UNRECORDED)
    : UNRECORDED;
}

export interface InvitationFact {
  label: string;
  value: string;
}

/** Where the attempts are worth saying: a resend adds one to a completed dispatch's count (platform
 * #274), so "Completed after 2 attempts" would count resends as failures. While it failed or runs,
 * every attempt was a provisioning attempt (a resend touches only a succeeded dispatch). */
const COUNTS_ATTEMPTS: readonly InvitationStatus[] = ['FAILED', 'IN_PROGRESS'];

/** The Onboarding card's invitation facts (BG-11): where the identity provisioning stands, with the
 * attempts once there was more than one while it failed or is in progress, the reason while it is
 * FAILED, and when it last changed, in the organisation's zone. A time it lacks is left out, never
 * shown blank. Labelled "Identity provisioning", not "Invitation": a NOT_REQUIRED one (an account
 * that already had an identity) can still be sent its invitation again. `retryable`: Retry
 * provisioning is offered beside it, so the reason may say to retry. */
export function invitationFacts(
  invitation: Invitation,
  timeZone: string,
  { retryable = false }: { retryable?: boolean } = {},
): InvitationFact[] {
  const status = humanizeEnum(invitation.status);
  const counted = COUNTS_ATTEMPTS.includes(invitation.status) && invitation.attempts > 1;
  const facts: InvitationFact[] = [
    {
      label: 'Identity provisioning',
      value: counted ? `${status} after ${invitation.attempts} attempts` : status,
    },
  ];
  if (invitation.status === 'FAILED') {
    facts.push({
      label: 'Reason',
      value: invitationErrorText(invitation.lastErrorCode, retryable),
    });
  }
  if (invitation.updatedAt !== null) {
    const when = formatInstant(invitation.updatedAt, timeZone);
    facts.push({ label: `Last update (${timeZone})`, value: `${when.date} · ${when.time}` });
  }
  return facts;
}

export type MembershipAction =
  'approve' | 'retry' | 'resend' | 'reject' | 'suspend' | 'reactivate' | 'revoke';

/** The actions a status offers, in display order, before any permission. A pending member whose
 * identity is being created takes Reject & revoke only (approving again only requeues it, BG-11);
 * once it failed, Retry provisioning in Approve's place, never both (the two would do the same).
 * An invited account with an ACTIVE membership can be sent its invitation again. */
function actionsFor(status: MembershipStatusSubject): readonly MembershipAction[] {
  switch (status.membershipStatus) {
    case 'PENDING_APPROVAL':
      switch (onboardingState('PENDING_APPROVAL', status.userStatus, status.invitation).key) {
        case 'IDENTITY_FAILED':
          return ['retry', 'reject'];
        case 'IDENTITY_IN_PROGRESS':
        case 'PROVISIONING_IDENTITY':
          return ['reject'];
        default:
          return ['approve', 'reject'];
      }
    case 'ACTIVE':
      return status.userStatus === 'INVITED'
        ? ['resend', 'suspend', 'revoke']
        : ['suspend', 'revoke'];
    case 'SUSPENDED':
      return ['reactivate', 'revoke'];
    case 'REVOKED':
      return [];
  }
}

// Reject & revoke is the revoke endpoint (D12, contract §E.3). Retry is no approval, but it is
// `user.approve`'s (InvitationRecoveryService.retry); Resend is `user.invite`'s.
const PERMISSION: Record<MembershipAction, string> = {
  approve: 'user.approve',
  retry: 'user.approve',
  resend: 'user.invite',
  reject: 'membership.revoke',
  suspend: 'membership.suspend',
  reactivate: 'membership.reactivate',
  revoke: 'membership.revoke',
};

const LIFECYCLE_CODES = [...new Set(Object.values(PERMISSION))];

/** What decides the hero's actions: the two statuses and, where the membership was read, its
 * `invitation.status` (BG-11). */
export interface MembershipStatusSubject {
  membershipStatus: MembershipStatus;
  userStatus: UserStatus;
  invitation?: InvitationStatus | null;
}

export interface MembershipSubject extends MembershipStatusSubject {
  /** The signed-in user's own record (the backend's id, Ruling 6). */
  self: boolean;
  /** Approve's maker-checker gate for the signed-in user (BG-08, `maker-checker.ts`). */
  makerGate: MakerGate;
}

/** The hero's actions, in display order. Every transition reads the membership back, so the
 * `membership.view` gate runs first (BG-31); then the status (`actionsFor`); then each action's own
 * code with the views it implies, all tenant-wide, as UserProvisioningService and
 * InvitationRecoveryService check them (ADR 0030, BG-33). */
export function availableMembershipActions(
  status: MembershipStatusSubject,
  holder: PermissionHolder,
): MembershipAction[] {
  if (!can(holder, 'membership.view')) return [];
  return actionsFor(status).filter((action) =>
    canAllTenantWide(holder, withViews([PERMISSION[action]])),
  );
}

/** `user.view` held only at branch scope: the directory and its pickers need it tenant-wide
 * (BG-33). */
export const USERS_BRANCH_SCOPED =
  'Your role lets you view users at a branch only. Seeing everyone in this institution needs that permission for the whole institution. Ask an administrator if you need access.';
export const NO_MEMBERSHIP_VIEW =
  "Membership actions need permission to view memberships, which your role doesn't include.";
export const OWN_MEMBERSHIP =
  "You can't suspend or revoke your own membership. Ask another administrator.";
export const USER_MAKER_CHECKER_BLOCKED =
  'You invited this user, so another administrator must approve them.';
/** Approve's refusals (the user record and the approval page): a missing permission only, since
 * the inviter and the member have their own codes (BG-08); an unknown membership, a 404; one
 * already decided or still lacking a role or branch, a 409 (BG-07). */
export const APPROVE_FORBIDDEN = "You can't approve this user. Your role doesn't allow it.";
export const APPROVE_NOT_FOUND = 'This request no longer exists. Refresh the page.';
export const APPROVE_CONFLICT =
  'This request was already decided, or the person has no active role or branch yet. Refresh and check.';
/** Revoke and Reject & revoke: refused with a 409 only once the membership is revoked (BG-07). */
export const REVOKE_CONFLICT = 'This membership was already revoked. Refresh and check.';
/** Retry provisioning's 409 `conflict`: the membership is no longer pending with its identity
 * provisioning, or provisioning already succeeded (BG-11). */
export const RETRY_CONFLICT = "Provisioning can't be retried now. Refresh to see where it stands.";
/** Layer 12, P-3: a frontend-only code; `revokeMembership` refuses a stale Reject & revoke. */
export const MEMBERSHIP_CHANGED_CODE = 'membership_changed';
export const MEMBERSHIP_CHANGED =
  'This membership changed since the page loaded. Refresh to see its status.';

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
      blocked.approve = accountBlockedNote(subject.userStatus); // contract §F, else a 409 (BG-07)
    } else if (action === 'approve' && subject.makerGate === 'blocked') {
      blocked.approve = USER_MAKER_CHECKER_BLOCKED; // maker-checker (BG-08)
    } else if ((action === 'suspend' || action === 'revoke') && subject.self) {
      blocked[action] = OWN_MEMBERSHIP; // Ruling 6, BG-35
    }
  }
  return blocked;
}

/** Why the hero has no actions the holder's codes suggest; null when nothing needs saying
 * (including for a holder with no lifecycle code at all). The user read carries the membership's id
 * (BG-09), so the actions never wait on a lookup. */
export function membershipActionsNote(holder: PermissionHolder): string | null {
  if (!canAny(holder, LIFECYCLE_CODES)) return null;
  return can(holder, 'membership.view') ? null : NO_MEMBERSHIP_VIEW;
}

/** BG-17 (platform #161, ADR 0033): `PATCH /tenant/memberships/{id}` checks `membership.update` and
 * its view tenant-wide (`requireTenantPermission`), and refuses a REVOKED or SYSTEM membership
 * (422). The user read carries both, so the page decides before the membership read. Your own
 * membership is editable: `ProfileUpdateService` has no self rule and no `user.assign_self` check. */
export function canEditMembership(
  record: { membershipStatus: MembershipStatus; membershipType: MembershipType },
  holder: PermissionHolder,
): boolean {
  return (
    record.membershipStatus !== 'REVOKED' &&
    record.membershipType !== 'SYSTEM' &&
    canAllTenantWide(holder, withViews(['membership.update']))
  );
}

export const EDIT_MEMBERSHIP_DESCRIPTION =
  "The type decides whether they need a branch assignment: Staff and Admin members do, Auditors don't.";
/** The 409 `conflict`: an ACTIVE membership moving to STAFF or ADMIN while its user has no ACTIVE
 * assignment to an ACTIVE branch. */
export const MEMBERSHIP_TYPE_NEEDS_BRANCH =
  'Staff and Admin members need an active branch assignment first. Assign a branch, then change the type.';
/** The 422 `invalid_operation` a page-offered edit can still meet: the branch left ACTIVE since the
 * page loaded, or the membership was revoked meanwhile. */
export const MEMBERSHIP_EDIT_REFUSED =
  "These changes weren't accepted. The branch may no longer be active, or this membership can't be edited.";
/** A frontend-only code: the dialog was saved as it opened, so nothing is sent (an empty body is a
 * 422). */
export const MEMBERSHIP_UNCHANGED_CODE = 'membership_unchanged';
export const MEMBERSHIP_UNCHANGED = 'Change the type or the primary branch first.';

/** The Edit membership dialog's Primary branch options are one page of the institution's ACTIVE
 * branches, by name (AGENTS.md's fifth exception, like the Assign-branch drawer's), read where the
 * holder has `branch.view` somewhere. `read`: `listed`, `failed` (the read failed, said as the
 * Assign-branch drawer says it), or `unread` (no `branch.view`, so none was made). The current
 * primary branch is offered either way, so keeping it needs no read. */
export function primaryBranchHint(input: {
  read: 'listed' | 'failed' | 'unread';
  truncated: boolean;
  scoped: boolean;
}): string {
  if (input.read === 'failed') {
    return "Branches couldn't be loaded. You can keep the current primary branch or choose None; refresh to try again.";
  }
  if (input.read === 'unread') {
    return "Branches can't be listed here, so you can keep the current primary branch or choose None.";
  }
  return [
    'Shown on their record as their main branch.',
    input.truncated ? 'Only the first 100 active branches are listed.' : '',
    input.scoped ? SCOPED_BRANCHES_NOTE : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export const OWN_ACCESS = "You can't add to your own access. A tenant administrator can.";

// Client components import the role rules, so the rule itself lives in auth/permissions.ts.
export { ownAccessBlocked };

/** A REVOKED membership takes no assignment (409). The write needs its views (ADR 0030); the
 * role select reads the role index, which needs `role.view`. `self`: the record is the caller's. */
export function canAssignUserRole(
  status: MembershipStatus,
  holder: PermissionHolder,
  self: boolean,
): boolean {
  return (
    status !== 'REVOKED' &&
    canAll(holder, [...withViews(['user.assign_role']), 'role.view']) &&
    !ownAccessBlocked(self, holder)
  );
}

/** The write needs its views (ADR 0030); the branch select needs `branch.view`. */
export function canAssignUserBranch(
  status: MembershipStatus,
  holder: PermissionHolder,
  self: boolean,
): boolean {
  return (
    status !== 'REVOKED' &&
    canAll(holder, [...withViews(['user.assign_branch']), 'branch.view']) &&
    !ownAccessBlocked(self, holder)
  );
}

/** The Assign-role drawer's branch scopes come from one page of the user's ACTIVE branch
 * assignments, the platform's largest (AGENTS.md's fifth paging exception); past it the hint says
 * so. Client-safe, so the copy that names it and the page that reads it can't drift apart. */
export const ROLE_SCOPE_ASSIGNMENTS_PAGE = 100;

export const ACCESS_DESCRIPTION =
  'Roles this user holds. Institution scope applies everywhere; branch scope only while that branch is selected.';
export const NO_ACTIVE_ROLES =
  'There are no active roles to assign. Create or activate one under Roles & permissions.';
/** The role index answers an empty map on any failure, and every tenant has system roles, so an empty
 * index is a failed read, not "no roles". */
export const ROLES_UNAVAILABLE =
  "Roles couldn't be loaded, so none can be assigned right now. Refresh to try again.";
/** The role index stops at a ceiling (`ROLE_INDEX_CEILING` in lib/api/lookups.ts, server-only, so
 * the page passes it in): past it the picker offers only the first roles by name, and says so. */
export function rolesCappedHint(ceiling: number): string {
  return `Only the first ${ceiling} roles by name are offered here; roles after that can't be assigned from this page.`;
}
/** The capped index held no ACTIVE role, but roles beyond it were never read: "none are active"
 * would be a capped scan presented as the whole catalogue. */
export function rolesCappedNoneActive(ceiling: number): string {
  return `None of the first ${ceiling} roles by name is active, and roles after that can't be assigned from this page.`;
}

/** BG-03: a branch assignment search by user lists every branch to a tenant-wide
 * `branch_assignment.view`, and only the ACTIVE branches a branch-scoped grant covers otherwise,
 * whichever branch is selected. */
export function scopedAssignmentView(holder: PermissionHolder): boolean {
  return !canTenantWide(holder, 'branch_assignment.view');
}

export const SCOPED_ASSIGNMENTS_NOTE = 'Only assignments at branches you can view are shown.';

/** A select's option (structurally 09's `BranchOption`). */
export interface SelectOption {
  id: string;
  label: string;
}

/** BRANCH scope needs an existing ACTIVE assignment at that branch (else 409), and the holder's
 * grant there (`reachable`: `canAssignRoleAt`, BG-03). A branch held twice is offered once. */
export function roleScopeBranches(
  rows: readonly { branchId: string }[],
  reachable: (branchId: string) => boolean,
  label: (branchId: string) => string,
): SelectOption[] {
  return [...new Set(rows.map((row) => row.branchId))]
    .filter(reachable)
    .map((id) => ({ id, label: label(id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Why "One branch" is disabled; while a branch is on offer, that the offer may be only some of
 * them, or undefined when it is all of them. `truncated`: their assignments ran past the one page
 * read (`ROLE_SCOPE_ASSIGNMENTS_PAGE`), so a branch held after it looks unassigned and the hint says
 * so instead of claiming they have none, or that the branches offered are all theirs (Ruling 8). */
export function roleScopeHint(input: {
  readable: boolean;
  offered: number;
  truncated: boolean;
  /** The holder assigns roles at some branches only (not tenant-wide). */
  someBranches: boolean;
}): string | undefined {
  if (input.offered > 0) {
    return input.truncated
      ? `Only the first ${ROLE_SCOPE_ASSIGNMENTS_PAGE} of their branch assignments are offered.`
      : undefined;
  }
  if (!input.readable) {
    return input.someBranches
      ? "Their branch assignments can't be read here, so no branch can be offered."
      : "Their branch assignments can't be read here, so only institution scope is available.";
  }
  if (input.truncated) {
    return input.someBranches
      ? `Only the first ${ROLE_SCOPE_ASSIGNMENTS_PAGE} of their branch assignments were checked, and none was at a branch where you can assign roles.`
      : `Only the first ${ROLE_SCOPE_ASSIGNMENTS_PAGE} of their branch assignments were checked, so only institution scope is offered here.`;
  }
  if (input.someBranches) {
    return "They aren't assigned to a branch where you can assign roles. Assign them to one first to give a branch-scoped role.";
  }
  return 'Assign them to a branch first to give a branch-scoped role.';
}

/** `scoped`: the caller views only some branches' assignments (`scopedAssignmentView`), so the
 * count is theirs, never the institution's. */
export function branchAssignmentCount(count: number, scoped: boolean): string {
  return scoped ? `${count} at branches you can view` : String(count);
}

/** The Branch assignments tab's empty state. "No branch assignments" is a fact only when every
 * branch could be seen: a branch-scoped view sees only its branches (BG-03). */
export function branchAssignmentsEmptyState(input: {
  scoped: boolean;
  /** An Assign branch button is on the tab. */
  assignOffered: boolean;
}): { title: string; description: string } {
  const offer = 'Assign a branch so they can work there.';
  if (!input.scoped) {
    return {
      title: 'No branch assignments',
      description: input.assignOffered ? offer : 'This user has no branch assignments.',
    };
  }
  return {
    title: 'No assignment at branches you can view',
    description: [
      "They may be assigned to branches you can't view.",
      ...(input.assignOffered ? [offer] : []),
    ].join(' '),
  };
}

/** The record route's id (spec §6.8), canonicalised to lower case (contract §A) so the reads, the
 * audit filters and the self check all see the backend's form. null → not found, before any read. */
export function parseUserId(param: string): string | null {
  return UUID_PATTERN.test(param) ? param.toLowerCase() : null;
}
