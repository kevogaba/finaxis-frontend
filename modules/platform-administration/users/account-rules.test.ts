import { describe, expect, it } from 'vitest';
import { USER_STATUSES, type UserStatus } from '@/modules/administration/users/user-contract';
import {
  ACCOUNT_DEACTIVATED_NOTE,
  ACCOUNT_NOT_ACTIONABLE_NOTE,
  accountActionsNote,
  accountChipLabel,
  accountScopeNote,
  availableAccountActions,
  blockedAccountActions,
  membershipChipLabel,
  OWN_ACCOUNT,
  type AccountAction,
} from './account-rules';

const ALL = { permissions: ['user.view', 'user.suspend', 'user.activate', 'user.deactivate'] };
const EXPECTED: Record<UserStatus, AccountAction[]> = {
  DRAFT: [],
  PENDING_APPROVAL: [],
  PROVISIONING_IDP: [],
  INVITED: [],
  ACTIVE: ['suspend', 'deactivate'],
  SUSPENDED: ['reactivate'],
  LOCKED: [],
  DEACTIVATING: [],
  DEACTIVATED: [],
  ARCHIVED: [],
};

describe('account rules', () => {
  it.each(USER_STATUSES.map((status) => [status, EXPECTED[status]] as const))(
    'offers each status its actions: %s → %j',
    (status, expected) => {
      expect(availableAccountActions(status, ALL)).toEqual(expected);
    },
  );

  it("needs each action's own code and user.view, which it implies (ADR 0030)", () => {
    const holder = (...codes: string[]) => ({ permissions: ['user.view', ...codes] });
    expect(availableAccountActions('ACTIVE', holder('user.suspend'))).toEqual(['suspend']);
    expect(availableAccountActions('ACTIVE', holder('user.deactivate'))).toEqual(['deactivate']);
    expect(availableAccountActions('ACTIVE', holder('user.activate'))).toEqual([]);
    expect(availableAccountActions('SUSPENDED', holder('user.suspend', 'user.deactivate'))).toEqual(
      [],
    );
    expect(availableAccountActions('SUSPENDED', holder('user.activate'))).toEqual(['reactivate']);
    expect(availableAccountActions('ACTIVE', holder())).toEqual([]);
    // The mutation without its view.
    expect(availableAccountActions('ACTIVE', { permissions: ['user.suspend'] })).toEqual([]);
  });

  it('blocks Suspend and Deactivate on your own account only', () => {
    expect(blockedAccountActions(['suspend', 'deactivate'], { self: true })).toEqual({
      suspend: OWN_ACCOUNT,
      deactivate: OWN_ACCOUNT,
    });
    expect(blockedAccountActions(['suspend', 'deactivate'], { self: false })).toEqual({});
    // Reactivate never needs it (a suspended account can't be signed in), and only offered actions
    // get a caption.
    expect(blockedAccountActions(['reactivate'], { self: true })).toEqual({});
    expect(blockedAccountActions(['deactivate'], { self: true })).toEqual({
      deactivate: OWN_ACCOUNT,
    });
  });

  it.each([
    ['DEACTIVATED', ACCOUNT_DEACTIVATED_NOTE],
    ['INVITED', ACCOUNT_NOT_ACTIONABLE_NOTE],
    ['PROVISIONING_IDP', ACCOUNT_NOT_ACTIONABLE_NOTE],
    ['LOCKED', ACCOUNT_NOT_ACTIONABLE_NOTE],
    ['ACTIVE', null],
    ['SUSPENDED', null],
  ] as const)('explains a %s account with no action: %j', (status, note) => {
    expect(accountActionsNote(status, ALL)).toBe(note);
  });

  it('says nothing to a holder without any account code', () => {
    expect(accountActionsNote('DEACTIVATED', { permissions: ['user.view'] })).toBeNull();
  });

  it('words the hero chips and the scope notes', () => {
    expect(accountChipLabel('PROVISIONING_IDP')).toBe('Account provisioning identity');
    expect(accountChipLabel('SUSPENDED')).toBe('Account suspended');
    expect(membershipChipLabel('PENDING_APPROVAL')).toBe('Membership pending approval');
    expect(accountScopeNote('institution')).toContain('in every institution they belong to');
    expect(accountScopeNote('institution')).toContain("this institution's own administrators");
    expect(accountScopeNote('platform')).toContain('in every institution they belong to');
    // The platform page has no institution of its own to name.
    expect(accountScopeNote('platform')).not.toContain('this institution');
  });
});
