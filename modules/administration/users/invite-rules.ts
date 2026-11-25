import { z } from 'zod';
import { canAll, canAllTenantWide, type PermissionHolder } from '@/auth/permissions';
import { withViews } from '@/auth/permission-views';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { BRANCH_ASSIGNMENT_TYPES } from '@/modules/administration/branches/branch-contract';
import { MEMBERSHIP_STATUSES, MEMBERSHIP_TYPES, type MembershipStatus } from './user-contract';
import type { SelectOption } from './user-rules';

/**
 * The Invite user wizard's gate, routes, choices and copy (spec §10.5). Client-safe: the pages, the
 * wizard, the route handler and the Server Action share it, so every string is defined once.
 */

/** `POST /tenant/users` checks `user.invite` and the views it implies tenant-wide (ADR 0030,
 * BG-33), as does the email check's user directory, and assigns each invited branch through
 * `user.assign_branch` (with `branch_assignment.view`) at that branch; the pickers read the roles and
 * the branches. A holder without any of them gets no half-working wizard (Ruling 4). */
const INVITE_WRITE_CODES = withViews(['user.invite']);
export const INVITE_CODES: readonly string[] = [
  ...withViews(['user.invite', 'user.assign_branch']),
  'role.view',
  'branch.view',
];

export function canInviteUsers(holder: PermissionHolder): boolean {
  return canAll(holder, INVITE_CODES) && canAllTenantWide(holder, INVITE_WRITE_CODES);
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
  'Inviting someone needs permission for the whole institution to invite users and to view users and memberships, and permission to assign branches and to view branch assignments, roles and branches. Ask an administrator if you need access.';
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
/** BG-07: a 409 `conflict` the email and username lookups couldn't name (an account in another
 * institution holds the username, or the institution isn't active). */
export const INVITE_CONFLICT =
  "This invitation conflicts with an existing member or username, or the institution isn't active. Check the email and username, then try again.";
/** BG-07: a 422 `invalid_operation`: a role or branch picked is unknown or no longer ACTIVE. */
export const INVITE_STALE_ACCESS =
  'A role or branch you picked is no longer active. Go back to Access and choose again.';
/** A frontend-only problem code: the platform's own 400 `validation_failed` (BG-07: no
 * `violations`), told apart from the fields this form flagged before sending. */
export const INVITE_REJECTED_CODE = 'invite_rejected';
export const INVITE_REJECTED =
  "The platform didn't accept these details. Check each step, then try again.";
/** A 409 IDEMPOTENCY_KEY_REUSED: this wizard's key already sent different answers, so an earlier
 * send may have succeeded with its response lost (Ruling 16). */
export const INVITE_MAY_BE_SENT =
  'This invitation may already have been sent. Check the directory before sending it again.';

/** What sending does, and what the tenant can't see (BG-02, BG-07, BG-11; Ruling 3). */
export const REVIEW_NOTE =
  'Sending creates the invitation now. A different administrator must approve it before they can use this institution. If this email already has a Finaxis account, that account is reused: its name, username and phone stay as they are.';
/** BG-25: the identity provider's email asks them to verify their address and set a password,
 * with a 72-hour link (platform #274); whether it goes out depends on the deployment. A failed
 * identity provisioning shows on the user record (BG-11); an undelivered email doesn't. */
export const INVITATION_NOTE =
  "Whether these emails go out depends on how the platform is set up. If creating their sign-in identity fails, their user record says so, but an email that isn't delivered isn't shown.";
/** BG-25: the identity-provider flag's description. */
export const IDENTITY_INVITE_DESCRIPTION =
  'After approval, once their sign-in identity is created, the identity provider emails them a link to verify their address and set a password. The link lasts 72 hours.';
