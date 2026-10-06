import { can, canAny, type PermissionHolder } from '@/auth/permissions';
import { humanizeEnum } from '@/components/data-display/status-chip';
import type { MembershipStatus, UserStatus } from '@/modules/administration/users/user-contract';
import { userStatusLabel } from '@/modules/administration/users/user-rules';

export type AccountAction = 'suspend' | 'reactivate' | 'deactivate';

/** Contract §E.2, §F: suspend and deactivate need an ACTIVE account, reactivate a SUSPENDED one.
 * The first action is the hero's contained one, so the reversible action leads. */
const ACTIONS_BY_STATUS: Partial<Record<UserStatus, readonly AccountAction[]>> = {
  ACTIVE: ['suspend', 'deactivate'],
  SUSPENDED: ['reactivate'],
};

const PERMISSION: Record<AccountAction, string> = {
  suspend: 'user.suspend',
  reactivate: 'user.activate',
  deactivate: 'user.deactivate',
};

const ACCOUNT_CODES = Object.values(PERMISSION);

/** No `.view` read-back is documented for the platform's user actions (contract §E.2), so each
 * action needs only its own code; the record itself needs `user.view` to render. */
export function availableAccountActions(
  status: UserStatus,
  holder: PermissionHolder,
): AccountAction[] {
  return (ACTIONS_BY_STATUS[status] ?? []).filter((action) => can(holder, PERMISSION[action]));
}

export const OWN_ACCOUNT =
  "You can't suspend or deactivate your own account. Ask another platform administrator.";
/** A frontend-only problem code: the actions refuse your own account before any call (Ruling 6). */
export const OWN_ACCOUNT_CODE = 'own_account';
export const ACCOUNT_CHANGED =
  'This account changed since the page loaded. Refresh to see its status.';
export const ACCOUNT_DEACTIVATED_NOTE =
  "This account is deactivated. The platform can't reactivate it.";
export const ACCOUNT_NOT_ACTIONABLE_NOTE =
  'Only an active account can be suspended or deactivated, and only a suspended one reactivated.';
export const CONFIRM_USERNAME_MISMATCH = 'Type the username exactly as shown.';
export const INSTITUTION_USERS_DESCRIPTION =
  "Everyone with a membership in this institution. Account actions on a user's record apply across the whole platform.";
export const PLATFORM_USERS_DESCRIPTION =
  "Members of the platform organisation, the people who run the platform. An institution's users are listed on its record.";

/** Your own account: Suspend and Deactivate are shown disabled with the reason (spec §6.6; BG-35). */
export function blockedAccountActions(
  actions: readonly AccountAction[],
  subject: { self: boolean },
): Partial<Record<AccountAction, string>> {
  const blocked: Partial<Record<AccountAction, string>> = {};
  if (!subject.self) return blocked;
  for (const action of actions) {
    if (action === 'suspend' || action === 'deactivate') blocked[action] = OWN_ACCOUNT;
  }
  return blocked;
}

/** Why the hero offers no account action to a holder who has an account code; null otherwise. */
export function accountActionsNote(status: UserStatus, holder: PermissionHolder): string | null {
  if (!canAny(holder, ACCOUNT_CODES)) return null;
  if (status === 'DEACTIVATED') return ACCOUNT_DEACTIVATED_NOTE;
  if (status === 'ACTIVE' || status === 'SUSPENDED') return null;
  return ACCOUNT_NOT_ACTIONABLE_NOTE;
}

export type AccountScope = 'institution' | 'platform';

export function accountScopeNote(scope: AccountScope): string {
  return scope === 'institution'
    ? "Account actions apply to this person's sign-in account on the whole platform, in every institution they belong to. Their membership here is managed by this institution's own administrators."
    : "Account actions apply to this person's sign-in account on the whole platform, in every institution they belong to.";
}

export function accountChipLabel(status: UserStatus): string {
  return `Account ${userStatusLabel(status).toLowerCase()}`;
}

export function membershipChipLabel(status: MembershipStatus): string {
  return `Membership ${humanizeEnum(status).toLowerCase()}`;
}
