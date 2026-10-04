import { describe, expect, it } from 'vitest';
import { lastPageIfPastEnd } from '@/lib/api/paging';
import {
  MEMBERSHIP_STATUSES,
  USER_STATUSES,
  type MembershipStatus,
  type UserStatus,
} from './user-contract';
import {
  ACCESS_DESCRIPTION,
  MEMBERSHIP_MISSING,
  MEMBERSHIP_UNAVAILABLE,
  NO_ACTIVE_ROLES,
  NO_MEMBERSHIP_VIEW,
  OWN_MEMBERSHIP,
  PARTIAL_SCAN_NOTE,
  PROVISIONING_NOTE,
  ROLES_UNAVAILABLE,
  SCAN_CEILING,
  USER_MAKER_CHECKER_BLOCKED,
  type MembershipAction,
  type OnboardingKey,
  accountBlockedNote,
  availableMembershipActions,
  blockedMembershipActions,
  branchAssignmentCount,
  branchAssignmentsEmptyState,
  branchContextNote,
  canAssignUserBranch,
  canAssignUserRole,
  membershipActionsNote,
  onboardingProgress,
  onboardingState,
  pageOfItems,
  parseUserId,
  roleScopeBranches,
  roleScopeHint,
  rolesCappedHint,
  rolesCappedNoneActive,
  userStatusLabel,
} from './user-rules';

const ALL = [
  'membership.view',
  'user.approve',
  'membership.suspend',
  'membership.reactivate',
  'membership.revoke',
  'user.view',
];
const LIFECYCLE = [
  'user.approve',
  'membership.suspend',
  'membership.reactivate',
  'membership.revoke',
];
const FULL = ['Done', 'Done', 'Done', 'Done'];

describe('onboardingState', () => {
  it.each([
    // The spec §10.5 table.
    ['PENDING_APPROVAL', 'DRAFT', 'AWAITING_APPROVAL', 'Awaiting approval', 'warning'],
    [
      'PENDING_APPROVAL',
      'PROVISIONING_IDP',
      'PROVISIONING_IDENTITY',
      'Provisioning identity',
      'warning',
    ],
    ['ACTIVE', 'INVITED', 'AWAITING_FIRST_SIGN_IN', 'Awaiting first sign-in', 'info'],
    ['ACTIVE', 'ACTIVE', 'ACTIVE', 'Active', 'success'],
    ['SUSPENDED', 'ACTIVE', 'SUSPENDED', 'Suspended', 'error'],
    ['REVOKED', 'DRAFT', 'REVOKED', 'Revoked', 'error'],
    // Beyond the table: an existing global account awaiting approval, and blocked accounts.
    ['PENDING_APPROVAL', 'ACTIVE', 'AWAITING_APPROVAL', 'Awaiting approval', 'warning'],
    ['ACTIVE', 'SUSPENDED', 'ACCOUNT_BLOCKED', 'Account suspended', 'error'],
    ['ACTIVE', 'DEACTIVATED', 'ACCOUNT_BLOCKED', 'Account deactivated', 'error'],
    ['ACTIVE', 'DRAFT', 'ACCOUNT_NOT_READY', 'Account not ready', 'warning'],
    ['PENDING_APPROVAL', 'LOCKED', 'ACCOUNT_BLOCKED', 'Account locked', 'error'],
  ] as const)('%s + %s → %s', (membership, user, key, label, tone) => {
    expect(onboardingState(membership, user)).toEqual({ key, label, tone });
  });

  it('reads "Account <status>" exactly for a live membership with a blocked account', () => {
    const blocked = ['SUSPENDED', 'LOCKED', 'DEACTIVATING', 'DEACTIVATED', 'ARCHIVED'];
    for (const membership of MEMBERSHIP_STATUSES) {
      for (const user of USER_STATUSES) {
        const live = membership === 'PENDING_APPROVAL' || membership === 'ACTIVE';
        expect(
          onboardingState(membership, user).key === 'ACCOUNT_BLOCKED',
          `${membership} ${user}`,
        ).toBe(live && blocked.includes(user));
      }
    }
  });

  it('answers every one of the 4 × 10 status pairs with a labelled state', () => {
    for (const membership of MEMBERSHIP_STATUSES) {
      for (const user of USER_STATUSES) {
        const state = onboardingState(membership, user);
        expect(state.label.length, `${membership} ${user}`).toBeGreaterThan(0);
        expect(state.tone, `${membership} ${user}`).toMatch(/^(success|warning|error|info)$/);
      }
    }
  });

  it('ignores the account for a suspended or revoked membership', () => {
    for (const user of USER_STATUSES) {
      expect(onboardingState('SUSPENDED', user).key, user).toBe('SUSPENDED');
      expect(onboardingState('REVOKED', user).key, user).toBe('REVOKED');
    }
  });

  // Every pair written out literally from the plan's Ruling 4 (the spec's six rows, "Account
  // <status>" for a blocked account, "Awaiting approval" for any other pending account, "Account not
  // ready" for an active membership whose account is neither INVITED nor ACTIVE), never derived
  // from the rule under test. Typed as a full record, so a new status fails the typecheck here.
  const EXPECTED_KEY: Record<MembershipStatus, Record<UserStatus, OnboardingKey>> = {
    PENDING_APPROVAL: {
      DRAFT: 'AWAITING_APPROVAL',
      PENDING_APPROVAL: 'AWAITING_APPROVAL',
      PROVISIONING_IDP: 'PROVISIONING_IDENTITY',
      INVITED: 'AWAITING_APPROVAL',
      ACTIVE: 'AWAITING_APPROVAL',
      SUSPENDED: 'ACCOUNT_BLOCKED',
      LOCKED: 'ACCOUNT_BLOCKED',
      DEACTIVATING: 'ACCOUNT_BLOCKED',
      DEACTIVATED: 'ACCOUNT_BLOCKED',
      ARCHIVED: 'ACCOUNT_BLOCKED',
    },
    ACTIVE: {
      DRAFT: 'ACCOUNT_NOT_READY',
      PENDING_APPROVAL: 'ACCOUNT_NOT_READY',
      PROVISIONING_IDP: 'ACCOUNT_NOT_READY',
      INVITED: 'AWAITING_FIRST_SIGN_IN',
      ACTIVE: 'ACTIVE',
      SUSPENDED: 'ACCOUNT_BLOCKED',
      LOCKED: 'ACCOUNT_BLOCKED',
      DEACTIVATING: 'ACCOUNT_BLOCKED',
      DEACTIVATED: 'ACCOUNT_BLOCKED',
      ARCHIVED: 'ACCOUNT_BLOCKED',
    },
    SUSPENDED: {
      DRAFT: 'SUSPENDED',
      PENDING_APPROVAL: 'SUSPENDED',
      PROVISIONING_IDP: 'SUSPENDED',
      INVITED: 'SUSPENDED',
      ACTIVE: 'SUSPENDED',
      SUSPENDED: 'SUSPENDED',
      LOCKED: 'SUSPENDED',
      DEACTIVATING: 'SUSPENDED',
      DEACTIVATED: 'SUSPENDED',
      ARCHIVED: 'SUSPENDED',
    },
    REVOKED: {
      DRAFT: 'REVOKED',
      PENDING_APPROVAL: 'REVOKED',
      PROVISIONING_IDP: 'REVOKED',
      INVITED: 'REVOKED',
      ACTIVE: 'REVOKED',
      SUSPENDED: 'REVOKED',
      LOCKED: 'REVOKED',
      DEACTIVATING: 'REVOKED',
      DEACTIVATED: 'REVOKED',
      ARCHIVED: 'REVOKED',
    },
  };

  it.each(MEMBERSHIP_STATUSES)(
    'pins the key of every user status under the %s membership',
    (membership) => {
      for (const user of USER_STATUSES) {
        expect(onboardingState(membership, user).key, `${membership} ${user}`).toBe(
          EXPECTED_KEY[membership][user],
        );
      }
    },
  );

  it.each([
    ['PENDING_APPROVAL', 'PENDING_APPROVAL', 'AWAITING_APPROVAL', 'Awaiting approval', 'warning'],
    ['PENDING_APPROVAL', 'INVITED', 'AWAITING_APPROVAL', 'Awaiting approval', 'warning'],
    ['ACTIVE', 'PENDING_APPROVAL', 'ACCOUNT_NOT_READY', 'Account not ready', 'warning'],
    ['ACTIVE', 'PROVISIONING_IDP', 'ACCOUNT_NOT_READY', 'Account not ready', 'warning'],
  ] as const)('%s + %s → %s (label and tone)', (membership, user, key, label, tone) => {
    expect(onboardingState(membership, user)).toEqual({ key, label, tone });
  });
});

describe('userStatusLabel', () => {
  it('words PROVISIONING_IDP as an identity, never the acronym', () => {
    expect(userStatusLabel('PROVISIONING_IDP')).toBe('Provisioning identity');
    expect(userStatusLabel('DRAFT')).toBe('Draft');
    expect(userStatusLabel('DEACTIVATING')).toBe('Deactivating');
    expect(USER_STATUSES.map(userStatusLabel).filter((label) => /idp/i.test(label))).toEqual([]);
  });
});

describe('onboardingProgress', () => {
  const states = (membership: MembershipStatus, user: UserStatus) => {
    const progress = onboardingProgress(membership, user);
    return progress.kind === 'steps'
      ? progress.steps.map((step) => step.state.label)
      : progress.note;
  };

  it('walks the four onboarding steps', () => {
    expect(states('PENDING_APPROVAL', 'DRAFT')).toEqual([
      'Done',
      'Waiting',
      'Not started',
      'Not started',
    ]);
    expect(states('PENDING_APPROVAL', 'PROVISIONING_IDP')).toEqual([
      'Done',
      'Done',
      'In progress',
      'Not started',
    ]);
    expect(states('ACTIVE', 'INVITED')).toEqual(['Done', 'Done', 'Done', 'Waiting']);
    expect(states('ACTIVE', 'ACTIVE')).toEqual(FULL);
  });

  it('names each step and says what it is, with a tone that never stands alone', () => {
    const progress = onboardingProgress('PENDING_APPROVAL', 'DRAFT');
    if (progress.kind !== 'steps') throw new Error('expected the steps');
    expect(progress.steps.map((step) => step.label)).toEqual([
      'Invited',
      'Approved',
      'Identity provisioned',
      'First sign-in',
    ]);
    expect(progress.steps.map((step) => step.state.tone)).toEqual([
      'success',
      'warning',
      'default',
      'default',
    ]);
    for (const step of progress.steps) expect(step.detail.length).toBeGreaterThan(0);
  });

  it('explains a provisioning identity under the steps (BG-11)', () => {
    expect(onboardingProgress('PENDING_APPROVAL', 'PROVISIONING_IDP')).toMatchObject({
      kind: 'steps',
      note: PROVISIONING_NOTE,
    });
    expect(onboardingProgress('ACTIVE', 'ACTIVE')).toMatchObject({ kind: 'steps', note: null });
    expect(onboardingProgress('PENDING_APPROVAL', 'DRAFT')).toMatchObject({
      kind: 'steps',
      note: null,
    });
  });

  it('replaces the steps with a sentence once onboarding has stopped', () => {
    expect(states('SUSPENDED', 'ACTIVE')).toMatch(/suspended/);
    expect(states('REVOKED', 'ACTIVE')).toMatch(/permanent/);
    expect(states('ACTIVE', 'LOCKED')).toBe(
      "Their account is locked on the platform, so they can't sign in to any institution.",
    );
    expect(states('PENDING_APPROVAL', 'DEACTIVATING')).toBe(
      "Their account is deactivating on the platform, so they can't sign in to any institution.",
    );
    expect(states('ACTIVE', 'DRAFT')).toBe(
      "The membership is active, but their account isn't ready to sign in yet.",
    );
  });

  // The seven in-flight pairs (plan Ruling 4); the other 33 have stopped or are blocked.
  const IN_FLIGHT = [
    ['PENDING_APPROVAL', 'DRAFT'],
    ['PENDING_APPROVAL', 'PENDING_APPROVAL'],
    ['PENDING_APPROVAL', 'PROVISIONING_IDP'],
    ['PENDING_APPROVAL', 'INVITED'],
    ['PENDING_APPROVAL', 'ACTIVE'],
    ['ACTIVE', 'INVITED'],
    ['ACTIVE', 'ACTIVE'],
  ];

  it('shows the steps for exactly the seven in-flight pairs and one sentence for the other 33, never both', () => {
    let steps = 0;
    for (const membership of MEMBERSHIP_STATUSES) {
      for (const user of USER_STATUSES) {
        const label = `${membership} ${user}`;
        const progress = onboardingProgress(membership, user);
        const inFlight = IN_FLIGHT.some(([m, u]) => m === membership && u === user);
        expect(progress.kind, label).toBe(inFlight ? 'steps' : 'note');
        if (progress.kind === 'steps') {
          steps += 1;
          expect(progress.steps, label).toHaveLength(4);
          // The only text a timeline carries is the provisioning note, under the third step.
          const provisioning = membership === 'PENDING_APPROVAL' && user === 'PROVISIONING_IDP';
          expect(progress.note, label).toBe(provisioning ? PROVISIONING_NOTE : null);
        } else {
          expect('steps' in progress, label).toBe(false);
          expect(progress.note.length, label).toBeGreaterThan(0);
        }
      }
    }
    expect(steps).toBe(7);
  });
});

describe('availableMembershipActions', () => {
  const pending = { membershipStatus: 'PENDING_APPROVAL', userStatus: 'DRAFT' } as const;

  it('offers nothing without membership.view, whatever the status and other codes', () => {
    const holder = { permissions: ALL.filter((code) => code !== 'membership.view') };
    expect(availableMembershipActions(pending, holder)).toEqual([]);
    for (const membershipStatus of MEMBERSHIP_STATUSES) {
      expect(
        availableMembershipActions({ membershipStatus, userStatus: 'ACTIVE' }, holder),
      ).toEqual([]);
    }
  });

  it.each([
    ['PENDING_APPROVAL', 'DRAFT', ['approve', 'reject']],
    ['PENDING_APPROVAL', 'PROVISIONING_IDP', ['reject']],
    ['ACTIVE', 'ACTIVE', ['suspend', 'revoke']],
    ['SUSPENDED', 'ACTIVE', ['reactivate', 'revoke']],
    ['REVOKED', 'ACTIVE', []],
  ] as const)('%s + %s offers %j', (membershipStatus, userStatus, actions) => {
    expect(
      availableMembershipActions({ membershipStatus, userStatus }, { permissions: ALL }),
    ).toEqual(actions);
  });

  it("needs each action's own code; Reject & revoke needs membership.revoke", () => {
    const only = (...codes: string[]) => ({ permissions: ['membership.view', ...codes] });
    expect(availableMembershipActions(pending, only('membership.revoke'))).toEqual(['reject']);
    expect(availableMembershipActions(pending, only('user.approve'))).toEqual(['approve']);
  });

  // 4 statuses × 5 holders (membership.view alone, then with exactly one lifecycle code), the
  // expected actions written out literally from the plan's Ruling 5 matrix.
  const SINGLE_CODE: [MembershipStatus, string[], MembershipAction[]][] = [
    ['PENDING_APPROVAL', [], []],
    ['PENDING_APPROVAL', ['user.approve'], ['approve']],
    ['PENDING_APPROVAL', ['membership.suspend'], []],
    ['PENDING_APPROVAL', ['membership.reactivate'], []],
    ['PENDING_APPROVAL', ['membership.revoke'], ['reject']],
    ['ACTIVE', [], []],
    ['ACTIVE', ['user.approve'], []],
    ['ACTIVE', ['membership.suspend'], ['suspend']],
    ['ACTIVE', ['membership.reactivate'], []],
    ['ACTIVE', ['membership.revoke'], ['revoke']],
    ['SUSPENDED', [], []],
    ['SUSPENDED', ['user.approve'], []],
    ['SUSPENDED', ['membership.suspend'], []],
    ['SUSPENDED', ['membership.reactivate'], ['reactivate']],
    ['SUSPENDED', ['membership.revoke'], ['revoke']],
    ['REVOKED', [], []],
    ['REVOKED', ['user.approve'], []],
    ['REVOKED', ['membership.suspend'], []],
    ['REVOKED', ['membership.reactivate'], []],
    ['REVOKED', ['membership.revoke'], []],
  ];

  it.each(SINGLE_CODE)(
    '%s with membership.view and %j offers %j',
    (membershipStatus, codes, expected) => {
      const holder = { permissions: ['membership.view', ...codes] };
      expect(
        availableMembershipActions({ membershipStatus, userStatus: 'ACTIVE' }, holder),
      ).toEqual(expected);
    },
  );

  it('offers nothing for a code that belongs to a different status', () => {
    const holder = { permissions: ['membership.view', 'membership.suspend'] };
    expect(availableMembershipActions(pending, holder)).toEqual([]);
    expect(
      availableMembershipActions({ membershipStatus: 'REVOKED', userStatus: 'ACTIVE' }, holder),
    ).toEqual([]);
  });

  it('keeps Approve for a blocked account, leaving the disabled caption to blockedMembershipActions', () => {
    expect(
      availableMembershipActions(
        { membershipStatus: 'PENDING_APPROVAL', userStatus: 'LOCKED' },
        { permissions: ALL },
      ),
    ).toEqual(['approve', 'reject']);
  });
});

describe('blockedMembershipActions', () => {
  const subject = {
    membershipStatus: 'ACTIVE',
    userStatus: 'ACTIVE',
    self: false,
    invitedByMe: false,
  } as const;

  it('disables Suspend and Revoke on your own record, with the reason', () => {
    expect(blockedMembershipActions(['suspend', 'revoke'], { ...subject, self: true })).toEqual({
      suspend: OWN_MEMBERSHIP,
      revoke: OWN_MEMBERSHIP,
    });
    expect(blockedMembershipActions(['suspend', 'revoke'], { ...subject, self: false })).toEqual(
      {},
    );
    expect(OWN_MEMBERSHIP).toBe(
      "You can't suspend or revoke your own membership. Ask another administrator.",
    );
  });

  it("disables only Approve for the user's inviter and for a blocked account", () => {
    const pending = {
      ...subject,
      membershipStatus: 'PENDING_APPROVAL',
      userStatus: 'DRAFT',
    } as const;
    expect(
      blockedMembershipActions(['approve', 'reject'], { ...pending, invitedByMe: true }),
    ).toEqual({ approve: USER_MAKER_CHECKER_BLOCKED });
    expect(
      blockedMembershipActions(['approve', 'reject'], { ...pending, userStatus: 'LOCKED' }),
    ).toEqual({
      approve: "Their account is locked on the platform, so this membership can't be approved.",
    });
  });

  it('names the blocked account before the inviter when both apply', () => {
    expect(
      blockedMembershipActions(['approve', 'reject'], {
        ...subject,
        membershipStatus: 'PENDING_APPROVAL',
        userStatus: 'SUSPENDED',
        invitedByMe: true,
      }),
    ).toEqual({ approve: accountBlockedNote('SUSPENDED') });
  });

  it('blocks nothing for an ordinary pending user, and only the actions each flag names', () => {
    const pending = {
      ...subject,
      membershipStatus: 'PENDING_APPROVAL',
      userStatus: 'DRAFT',
    } as const;
    expect(blockedMembershipActions(['approve', 'reject'], pending)).toEqual({});
    // Own record and inviter flags only ever matter for the actions they name.
    expect(
      blockedMembershipActions(['reject'], { ...pending, self: true, invitedByMe: true }),
    ).toEqual({});
    expect(
      blockedMembershipActions(['reactivate'], { ...subject, self: true, invitedByMe: true }),
    ).toEqual({});
    expect(blockedMembershipActions([], { ...subject, self: true })).toEqual({});
  });

  it('never blocks Approve or Reject on your own record', () => {
    const pending = {
      ...subject,
      membershipStatus: 'PENDING_APPROVAL',
      userStatus: 'ACTIVE',
    } as const;
    expect(blockedMembershipActions(['approve', 'reject'], { ...pending, self: true })).toEqual({});
  });
});

describe('membershipActionsNote', () => {
  it('says nothing to a holder with no lifecycle code at all', () => {
    for (const lookup of ['found', 'missing', 'failed'] as const) {
      expect(membershipActionsNote({ permissions: [] }, lookup)).toBeNull();
      expect(
        membershipActionsNote({ permissions: ['membership.view', 'user.view'] }, lookup),
      ).toBeNull();
    }
  });

  it.each(LIFECYCLE)('tells %s without membership.view why nothing is offered', (code) => {
    expect(membershipActionsNote({ permissions: [code] }, 'found')).toBe(NO_MEMBERSHIP_VIEW);
    expect(membershipActionsNote({ permissions: [code] }, 'missing')).toBe(NO_MEMBERSHIP_VIEW);
  });

  it('explains a missing or failed membership once the holder can view memberships', () => {
    const holder = { permissions: ['membership.view', 'user.approve'] };
    expect(membershipActionsNote(holder, 'missing')).toBe(MEMBERSHIP_MISSING);
    expect(membershipActionsNote(holder, 'failed')).toBe(MEMBERSHIP_UNAVAILABLE);
    expect(membershipActionsNote(holder, 'found')).toBeNull();
  });
});

describe('branchContextNote', () => {
  it('offers the switch when the signed-in user can leave the branch', () => {
    const note = branchContextNote('Westlands Branch', true);
    expect(note).toMatch(/^Only Westlands Branch is visible/);
    expect(
      note.endsWith("Switch to All branches to see this user's other branch assignments."),
    ).toBe(true);
  });

  it('names the single-branch account and never offers the switch', () => {
    const note = branchContextNote('Westlands Branch', false);
    expect(note).toContain('Westlands Branch');
    expect(note).toContain('assigned to this branch only');
    expect(note).not.toContain('Switch');
  });
});

describe('role and branch assignment gates', () => {
  it('refuses a role assignment on a revoked membership or without role.view', () => {
    const holder = { permissions: ['user.assign_role', 'role.view'] };
    expect(canAssignUserRole('REVOKED', holder)).toBe(false);
    expect(canAssignUserRole('ACTIVE', { permissions: ['user.assign_role'] })).toBe(false);
    expect(canAssignUserRole('ACTIVE', { permissions: ['role.view'] })).toBe(false);
    expect(canAssignUserRole('SUSPENDED', holder)).toBe(true);
    expect(canAssignUserRole('PENDING_APPROVAL', holder)).toBe(true);
  });

  it('refuses a branch assignment on a revoked membership or without branch.view', () => {
    const codes = ['user.assign_branch', 'branch_assignment.view', 'branch.view'];
    expect(canAssignUserBranch('REVOKED', { permissions: codes })).toBe(false);
    expect(
      canAssignUserBranch('ACTIVE', {
        permissions: codes.filter((code) => code !== 'branch.view'),
      }),
    ).toBe(false);
    expect(
      canAssignUserBranch('ACTIVE', {
        permissions: codes.filter((code) => code !== 'branch_assignment.view'),
      }),
    ).toBe(false);
    expect(
      canAssignUserBranch('ACTIVE', {
        permissions: codes.filter((code) => code !== 'user.assign_branch'),
      }),
    ).toBe(false);
    expect(canAssignUserBranch('PENDING_APPROVAL', { permissions: codes })).toBe(true);
  });
});

describe('plain data', () => {
  // These values cross from a Server Component into Client Components: no function, element or
  // class instance may sneak in, so a JSON round trip must change nothing.
  it('survives a JSON round trip for every status pair', () => {
    const roundTrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
    for (const membershipStatus of MEMBERSHIP_STATUSES) {
      for (const userStatus of USER_STATUSES) {
        const label = `${membershipStatus} ${userStatus}`;
        const state = onboardingState(membershipStatus, userStatus);
        expect(roundTrip(state), label).toEqual(state);
        const progress = onboardingProgress(membershipStatus, userStatus);
        expect(roundTrip(progress), label).toEqual(progress);
        const subject = { membershipStatus, userStatus, self: true, invitedByMe: true };
        const actions = availableMembershipActions(subject, { permissions: ALL });
        expect(roundTrip(actions), label).toEqual(actions);
        const blocked = blockedMembershipActions(actions, subject);
        expect(roundTrip(blocked), label).toEqual(blocked);
      }
    }
  });
});

describe('copy constants', () => {
  it('keeps the captions the hero and the tabs render', () => {
    expect(USER_MAKER_CHECKER_BLOCKED).toBe(
      'You invited this user, so another administrator must approve them.',
    );
    expect(accountBlockedNote('DEACTIVATED')).toBe(
      "Their account is deactivated on the platform, so this membership can't be approved.",
    );
    expect(ACCESS_DESCRIPTION).toMatch(/^Roles this user holds\./);
    expect(NO_ACTIVE_ROLES).toBe(
      'There are no active roles to assign. Create or activate one under Roles & permissions.',
    );
    // A failed role read is not "no active roles": every tenant has system roles (1b).
    expect(ROLES_UNAVAILABLE).toBe(
      "Roles couldn't be loaded, so none can be assigned right now. Refresh to try again.",
    );
    // Context-neutral: the same note covers an institution scan and one forced to a selected branch.
    expect(PARTIAL_SCAN_NOTE).toBe(
      "This list may be incomplete: the platform can't filter branch assignments by user, so only the first 500 branch assignments were checked.",
    );
  });
});

describe('the capped role catalogue copy', () => {
  it('says that only the first roles by name are offered, and that the rest cannot be assigned here', () => {
    expect(rolesCappedHint(500)).toBe(
      "Only the first 500 roles by name are offered here; roles after that can't be assigned from this page.",
    );
  });

  it('names the ceiling it is given, never a number of its own', () => {
    expect(rolesCappedHint(120)).toContain('first 120 roles');
    expect(rolesCappedNoneActive(120)).toContain('first 120 roles');
  });

  it('says that none of them is active, not that no role is, when the ceiling cut the list short', () => {
    expect(rolesCappedNoneActive(500)).toBe(
      "None of the first 500 roles by name is active, and roles after that can't be assigned from this page.",
    );
    expect(rolesCappedNoneActive(500)).not.toBe(NO_ACTIVE_ROLES);
  });
});

describe('SCAN_CEILING', () => {
  it('is 500, and the sentences that name the ceiling say whatever it is (A-m3)', () => {
    expect(SCAN_CEILING).toBe(500);
    const checked = `first ${SCAN_CEILING} branch assignments were checked`;
    expect(PARTIAL_SCAN_NOTE).toContain(checked);
    expect(
      roleScopeHint({ readable: true, offered: 0, truncated: true, selectedBranchName: null }),
    ).toContain(checked);
  });
});

describe('roleScopeBranches', () => {
  const label = (id: string) =>
    ({ b1: 'Westlands Branch', b2: 'Head Office', b3: 'Kisumu' })[id] ?? id;

  it('offers a branch held twice (HOME and OPERATE) once, sorted by label', () => {
    expect(
      roleScopeBranches([{ branchId: 'b1' }, { branchId: 'b2' }, { branchId: 'b1' }], null, label),
    ).toEqual([
      { id: 'b2', label: 'Head Office' },
      { id: 'b1', label: 'Westlands Branch' },
    ]);
  });

  it('narrows to the selected branch in a branch context', () => {
    const rows = [{ branchId: 'b1' }, { branchId: 'b2' }, { branchId: 'b1' }];
    expect(roleScopeBranches(rows, 'b1', label)).toEqual([{ id: 'b1', label: 'Westlands Branch' }]);
    expect(roleScopeBranches(rows, 'b3', label)).toEqual([]);
    expect(roleScopeBranches([], null, label)).toEqual([]);
  });
});

describe('roleScopeHint', () => {
  const CAPPED =
    'Only the first 500 branch assignments were checked and none of theirs was among them, so only institution scope is offered here.';

  it('says nothing while a branch is on offer', () => {
    expect(
      roleScopeHint({ readable: true, offered: 2, truncated: false, selectedBranchName: null }),
    ).toBeUndefined();
    expect(
      roleScopeHint({
        readable: false,
        offered: 1,
        truncated: false,
        selectedBranchName: 'Westlands Branch',
      }),
    ).toBeUndefined();
    // A capped scan that still found a branch has nothing to explain: the branch is offered.
    expect(
      roleScopeHint({ readable: true, offered: 1, truncated: true, selectedBranchName: null }),
    ).toBeUndefined();
  });

  it('explains an unreadable scan, a selected branch the user is not at, and no assignment', () => {
    expect(
      roleScopeHint({ readable: false, offered: 0, truncated: false, selectedBranchName: null }),
    ).toBe("Their branch assignments can't be read here, so only institution scope is available.");
    expect(
      roleScopeHint({
        readable: true,
        offered: 0,
        truncated: false,
        selectedBranchName: 'Westlands Branch',
      }),
    ).toBe(
      "They aren't assigned to Westlands Branch. Assign them there first to give a branch-scoped role.",
    );
    expect(
      roleScopeHint({ readable: true, offered: 0, truncated: false, selectedBranchName: null }),
    ).toBe('Assign them to a branch first to give a branch-scoped role.');
  });

  it('says a capped scan is partial instead of claiming the user has no branch (Ruling 8)', () => {
    // The scan stopped at its ceiling with rows unread, so "not assigned" would be a guess; the
    // sentence holds with or without a selected branch.
    expect(
      roleScopeHint({ readable: true, offered: 0, truncated: true, selectedBranchName: null }),
    ).toBe(CAPPED);
    expect(
      roleScopeHint({
        readable: true,
        offered: 0,
        truncated: true,
        selectedBranchName: 'Westlands Branch',
      }),
    ).toBe(CAPPED);
  });

  it('keeps the unreadable explanation ahead of the capped one', () => {
    expect(
      roleScopeHint({ readable: false, offered: 0, truncated: true, selectedBranchName: null }),
    ).toBe("Their branch assignments can't be read here, so only institution scope is available.");
  });
});

describe('branchAssignmentCount', () => {
  it('counts exactly, flags a partial scan, and scopes to a selected branch', () => {
    expect(branchAssignmentCount(2, false, null)).toBe('2');
    expect(branchAssignmentCount(500, true, null)).toBe('At least 500 (partial)');
    expect(branchAssignmentCount(1, false, 'Westlands Branch')).toBe('1 at Westlands Branch');
  });

  it('keeps the partial hedge in a branch context, where the scan is still capped', () => {
    // A branch with more than 500 ACTIVE assignments: the user's may lie beyond the window.
    expect(branchAssignmentCount(3, true, 'Westlands Branch')).toBe(
      'At least 3 at Westlands Branch (partial)',
    );
  });

  it('says none were found, never "At least 0", when a capped scan found nothing', () => {
    expect(branchAssignmentCount(0, true, 'Westlands Branch')).toBe(
      'None found at Westlands Branch (partial)',
    );
    expect(branchAssignmentCount(0, true, null)).toBe('None found (partial)');
    // A complete scan that found nothing is a fact, not a hedge.
    expect(branchAssignmentCount(0, false, null)).toBe('0');
    expect(branchAssignmentCount(0, false, 'Westlands Branch')).toBe('0 at Westlands Branch');
  });
});

describe('branchAssignmentsEmptyState', () => {
  const OFFER = 'Assign a branch so they can work there.';
  const OTHER = 'They may be assigned to other branches.';
  const SWITCH = 'Switch to All branches to see them.';
  const BEYOND =
    'Only the first 500 branch assignments were checked, so they may be assigned beyond them.';
  const base = {
    selectedBranchName: null,
    truncated: false,
    canSwitch: false,
    assignOffered: false,
  };

  it('claims no assignments only when nothing was hidden (no branch selected, scan complete)', () => {
    expect(branchAssignmentsEmptyState(base)).toEqual({
      title: 'No branch assignments',
      description: 'This user has no branch assignments.',
    });
    expect(branchAssignmentsEmptyState({ ...base, assignOffered: true })).toEqual({
      title: 'No branch assignments',
      description: OFFER,
    });
    // Switching is a branch-context matter: it changes nothing here.
    expect(branchAssignmentsEmptyState({ ...base, canSwitch: true })).toEqual({
      title: 'No branch assignments',
      description: 'This user has no branch assignments.',
    });
  });

  it('names the selected branch, and offers the switch only to an account that can switch', () => {
    const branch = { ...base, selectedBranchName: 'Head Office' };
    expect(branchAssignmentsEmptyState({ ...branch, canSwitch: true })).toEqual({
      title: 'No assignment at Head Office',
      description: `${OTHER} ${SWITCH}`,
    });
    expect(branchAssignmentsEmptyState(branch)).toEqual({
      title: 'No assignment at Head Office',
      description: OTHER,
    });
    expect(
      branchAssignmentsEmptyState({ ...branch, canSwitch: true, assignOffered: true }),
    ).toEqual({
      title: 'No assignment at Head Office',
      description: `${OTHER} ${SWITCH} ${OFFER}`,
    });
  });

  it('says a capped scan found none and that they may be beyond what was checked', () => {
    expect(branchAssignmentsEmptyState({ ...base, truncated: true })).toEqual({
      title: 'No branch assignments found',
      description: BEYOND,
    });
    expect(branchAssignmentsEmptyState({ ...base, truncated: true, assignOffered: true })).toEqual({
      title: 'No branch assignments found',
      description: `${BEYOND} ${OFFER}`,
    });
  });

  it('says both when a branch context was capped, and never claims "no assignment at" it', () => {
    expect(
      branchAssignmentsEmptyState({
        selectedBranchName: 'Head Office',
        truncated: true,
        canSwitch: true,
        assignOffered: true,
      }),
    ).toEqual({
      title: 'No branch assignments found',
      description: `${BEYOND} ${OTHER} ${SWITCH} ${OFFER}`,
    });
  });
});

describe('pageOfItems', () => {
  const items = Array.from({ length: 23 }, (_, index) => index);

  it('slices the last page and describes it like a server page', () => {
    expect(pageOfItems(items, { page: 2, size: 10 })).toEqual({
      items: [20, 21, 22],
      page: {
        number: 2,
        size: 10,
        totalItems: 23,
        totalPages: 3,
        hasNext: false,
        hasPrevious: true,
      },
    });
  });

  it('slices the first page and knows there is a next one', () => {
    const first = pageOfItems(items, { page: 0, size: 10 });
    expect(first.items).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(first.page).toMatchObject({ hasNext: true, hasPrevious: false });
  });

  it('returns no items past the end, which lastPageIfPastEnd sends back to the last page', () => {
    const past = pageOfItems(items, { page: 3, size: 10 });
    expect(past.items).toEqual([]);
    expect(past.page).toEqual({
      number: 3,
      size: 10,
      totalItems: 23,
      totalPages: 3,
      hasNext: false,
      hasPrevious: true,
    });
    expect(lastPageIfPastEnd(past.page)).toBe(2);
  });

  it('reports no pages for no items, and never asks for a redirect', () => {
    const none = pageOfItems([], { page: 0, size: 10 });
    expect(none.items).toEqual([]);
    expect(none.page).toEqual({
      number: 0,
      size: 10,
      totalItems: 0,
      totalPages: 0,
      hasNext: false,
      hasPrevious: false,
    });
    expect(lastPageIfPastEnd(none.page)).toBeNull();
  });

  it('has no next page when the items fill the last page exactly', () => {
    const exact = pageOfItems(
      Array.from({ length: 20 }, (_, index) => index),
      { page: 1, size: 10 },
    );
    expect(exact.page).toMatchObject({ totalPages: 2, hasNext: false, hasPrevious: true });
    expect(exact.items).toHaveLength(10);
  });
});

describe('parseUserId', () => {
  it('lower-cases an upper-case UUID', () => {
    expect(parseUserId('10000000-0000-4000-8000-00000000000D')).toBe(
      '10000000-0000-4000-8000-00000000000d',
    );
    expect(parseUserId('10000000-0000-4000-8000-00000000000d')).toBe(
      '10000000-0000-4000-8000-00000000000d',
    );
  });

  it.each([
    ['not-a-uuid', 'not-a-uuid'],
    ['a path', '../x'],
    ['an empty id', ''],
    ['a UUID followed by x', '10000000-0000-4000-8000-00000000000dx'],
    ['a UUID followed by a newline', '10000000-0000-4000-8000-00000000000d\n'],
    ['a UUID preceded by a space', ' 10000000-0000-4000-8000-00000000000d'],
    ['the new-user route segment', 'new'],
  ])('answers null for %s', (_case, param) => {
    expect(parseUserId(param)).toBeNull();
  });
});
