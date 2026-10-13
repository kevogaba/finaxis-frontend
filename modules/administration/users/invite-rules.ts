import { z } from 'zod';
import { canAll, type PermissionHolder } from '@/auth/permissions';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { BRANCH_ASSIGNMENT_TYPES } from '@/modules/administration/branches/branch-contract';
import { MEMBERSHIP_STATUSES, MEMBERSHIP_TYPES, type MembershipStatus } from './user-contract';
import type { SelectOption } from './user-rules';

/**
 * The Invite user wizard's gate, routes, choices and copy (spec §10.5). Client-safe: the pages, the
 * wizard, the route handler and the Server Action share it, so every string is defined once.
 */

/** Inviting posts `user.invite` and assigns branches (`user.assign_branch` per branch, contract
 * §E.3); the email check reads the user directory, the pickers the roles and the branches. A holder
 * without any of them gets no half-working wizard (Ruling 4). */
export const INVITE_CODES = [
  'user.invite',
  'user.assign_branch',
  'user.view',
  'role.view',
  'branch.view',
] as const;

export function canInviteUsers(holder: PermissionHolder): boolean {
  return canAll(holder, INVITE_CODES);
}

export const USERS_HREF = '/admin/users';
export const INVITE_HREF = '/admin/users/new';
export const userRecordHref = (userId: string) => `${USERS_HREF}/${userId}`;

/** STAFF and ADMIN members need a branch assignment; AUDITOR and SYSTEM are branch-exempt
 * (contract §F). */
export function needsBranch(membershipType: string): boolean {
  return membershipType === 'STAFF' || membershipType === 'ADMIN';
}

export interface ChoiceOption {
  value: string;
  label: string;
}

export const MEMBERSHIP_TYPE_OPTIONS: readonly ChoiceOption[] = MEMBERSHIP_TYPES.map((value) => ({
  value,
  label: humanizeEnum(value),
}));
export const ASSIGNMENT_TYPE_OPTIONS: readonly ChoiceOption[] = BRANCH_ASSIGNMENT_TYPES.map(
  (value) => ({ value, label: humanizeEnum(value) }),
);
/** The page's `{ id, label }` options as a select's choices. */
export const toChoices = (options: readonly SelectOption[]): ChoiceOption[] =>
  options.map((option) => ({ value: option.id, label: option.label }));

/** The words 09's `RoleScopeFields` uses for the same two scopes. */
export const SCOPE_OPTIONS: readonly ChoiceOption[] = [
  { value: 'TENANT', label: 'Institution (all branches)' },
  { value: 'BRANCH', label: 'One branch' },
];

/** The Identity step's fields, in order, with their labels (the step's error summary names them). */
export const IDENTITY_FIELDS = [
  'displayName',
  'email',
  'username',
  'phone',
  'membershipType',
] as const;
export type IdentityField = (typeof IDENTITY_FIELDS)[number];
export const IDENTITY_LABELS: Record<IdentityField, string> = {
  displayName: 'Full name',
  email: 'Email',
  username: 'Username',
  phone: 'Phone',
  membershipType: 'Membership type',
};
export const INVITATION_FIELDS = ['sendIdentityInvite', 'sendApplicationInvite'] as const;

// The page's states.
export const INVITE_FORBIDDEN =
  'Inviting someone needs permission to invite users and assign branches, and to view users, roles and branches. Ask an administrator if you need access.';
export const NO_ACTIVE_BRANCHES =
  'There are no active branches to assign. Activate one under Branches first.';
/** The pickers read one page of 100 by name (AGENTS.md's eighth paging exception, Ruling 10): past
 * it they say so, never presenting a capped list as the whole set (L1). */
export const OPTION_CEILING = 100;
export const ROLES_CAPPED = `Only the first ${OPTION_CEILING} active roles by name are offered here.`;
export const BRANCHES_CAPPED = `Only the first ${OPTION_CEILING} active branches by name are offered here.`;

// The Access step's refusals (invite-schema.ts).
export const CHOOSE_BRANCH = 'Choose a branch.';
/** An unfinished branch row: the section is optional for auditors and system members, so the words
 * offer both ways out (Ruling 13). */
export const CHOOSE_ROW_BRANCH = 'Choose a branch, or remove this row.';
export const CHOOSE_ASSIGNMENT_TYPE = 'Choose an assignment type.';
export const DUPLICATE_BRANCH_ROW = 'This branch already has this assignment type above.';
export const NEEDS_A_BRANCH = 'Add a branch: staff and admin members need at least one.';
export const NEEDS_A_ROLE = 'Add at least one role.';
export const CHOOSE_ROLE = 'Choose a role.';
export const CHOOSE_SCOPE = 'Choose a scope.';
export const CHOOSE_ROLE_BRANCH = 'Choose the branch this role applies at.';
export const ROLE_BRANCH_UNASSIGNED = 'Assign them to this branch under Branch assignments first.';
export const DUPLICATE_ROLE_ROW = 'This role is already listed with the same scope.';

/** Why the email can't be invited, by the membership it already has here (BG-28: a revoked one
 * blocks the email for good). */
export function memberEmailMessage(status: MembershipStatus): string {
  switch (status) {
    case 'PENDING_APPROVAL':
      return 'This email already has an invitation to this institution waiting for approval.';
    case 'ACTIVE':
      return 'This email already belongs to a member of this institution.';
    case 'SUSPENDED':
      return 'This email belongs to a suspended member of this institution. Reactivate them from their record instead.';
    case 'REVOKED':
      return "This email's membership here was revoked, so it can't be invited to this institution again.";
  }
}

/** The route handler's answer to the email check (Ruling 1): the membership this email already has
 * here, or null. */
export const emailCheckSchema = z.object({
  membershipStatus: z.enum(MEMBERSHIP_STATUSES).nullable(),
});
export type EmailCheck = z.output<typeof emailCheckSchema>;

// The email check (the Identity step's Continue, Ruling 12) and the submit (Rulings 1, 3).
export const EMAIL_CHECK_FAILED =
  "We couldn't check whether this email is already in use. Select Continue to try again.";
export const SESSION_EXPIRED = 'Your session has expired. Sign in again.';
/** A 403 from the check: the context went stale (it then needs context selection, which a reload
 * runs through the page's load()), or `user.view` is held only at branch scope (BG-33). Retrying
 * can't help, so this never says "try again". */
export const EMAIL_CHECK_REFUSED =
  "This email can't be checked in your current context. Reload the page; if this keeps happening, ask an administrator for access.";
/** A frontend-only problem code: the email has a membership here (found after a failed invite). */
export const EMAIL_TAKEN_CODE = 'email_taken';
export const EMAIL_TAKEN = "This email can't be invited: it is already in use in this institution.";
/** A frontend-only problem code: the username belongs to a member here (found after a failed
 * invite whose email is free here, Ruling 15). */
export const USERNAME_TAKEN_CODE = 'username_taken';
export const USERNAME_TAKEN =
  "This username can't be used: it already belongs to someone in this institution.";
export const USERNAME_IN_USE = 'This username belongs to someone in this institution.';
export const INVITE_REFUSED =
  "You can't send this invitation. Your role may not allow inviting users, or assigning one of these branches.";
/** BG-07: every invite rule failure is a 500. The ones the wizard can't check are named here. */
export const INVITE_FAILED =
  "The platform couldn't create this invitation. The username may already belong to another account, here or in another institution, or a role or branch may have changed since this page loaded. Check them, then try again.";
/** A 409 IDEMPOTENCY_KEY_REUSED: this wizard's key already sent different answers, so an earlier
 * send may have succeeded with its response lost (Ruling 16). */
export const INVITE_MAY_BE_SENT =
  'This invitation may already have been sent. Check the directory before sending it again.';

/** What sending does, and what the tenant can't see (BG-02, BG-07, BG-11; Ruling 3). */
export const REVIEW_NOTE =
  'Sending creates the invitation now. A different administrator must approve it before they can use this institution. If this email already has a Finaxis account, that account is reused: its name, username and phone stay as they are.';
/** BG-25: delivery depends on the platform, and a failure isn't readable (Ruling 5). */
export const INVITATION_NOTE =
  "Whether these emails go out depends on the platform: identity provisioning and email can be switched off there, and a failed delivery isn't shown here.";
