import { describe, expect, it } from 'vitest';
import {
  MEMBERSHIP_STATUSES,
  USER_STATUSES,
  type MembershipStatus,
  type UserStatus,
} from './user-contract';
import {
  ACCESS_DESCRIPTION,
  NO_ACTIVE_ROLES,
  NO_MEMBERSHIP_VIEW,
  OWN_ACCESS,
  OWN_MEMBERSHIP,
  PROVISIONING_NOTE,
  ROLE_SCOPE_ASSIGNMENTS_PAGE,
  ROLES_UNAVAILABLE,
  SCOPED_ASSIGNMENTS_NOTE,
  USER_MAKER_CHECKER_BLOCKED,
  type MembershipAction,
  type OnboardingKey,
  accountBlockedNote,
  availableMembershipActions,
  blockedMembershipActions,
  branchAssignmentCount,
  branchAssignmentsEmptyState,
  canAssignUserBranch,
  canAssignUserRole,
  membershipActionsNote,
  onboardingProgress,
  onboardingState,
  ownAccessBlocked,
  parseUserId,
  roleScopeBranches,
  roleScopeHint,
  rolesCappedHint,
  rolesCappedNoneActive,
  scopedAssignmentView,
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
/** Every code held tenant-wide. */
const wide = (permissions: readonly string[]) => ({ permissions, tenantPermissions: permissions });

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
    const holder = wide(ALL.filter((code) => code !== 'membership.view'));
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
    expect(availableMembershipActions({ membershipStatus, userStatus }, wide(ALL))).toEqual(
      actions,
    );
  });

  it("needs each action's own code; Reject & revoke needs membership.revoke", () => {
    const only = (...codes: string[]) => wide(['membership.view', ...codes]);
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
      const holder = wide(['membership.view', ...codes]);
      expect(
        availableMembershipActions({ membershipStatus, userStatus: 'ACTIVE' }, holder),
      ).toEqual(expected);
    },
  );

  it('offers nothing for a code that belongs to a different status', () => {
    const holder = wide(['membership.view', 'membership.suspend']);
    expect(availableMembershipActions(pending, holder)).toEqual([]);
    expect(
      availableMembershipActions({ membershipStatus: 'REVOKED', userStatus: 'ACTIVE' }, holder),
    ).toEqual([]);
  });

  it('keeps Approve for a blocked account, leaving the disabled caption to blockedMembershipActions', () => {
    expect(
      availableMembershipActions(
        { membershipStatus: 'PENDING_APPROVAL', userStatus: 'LOCKED' },
        wide(ALL),
      ),
    ).toEqual(['approve', 'reject']);
  });

  // Review Focus 3: UserProvisioningService checks each membership decision, and the
  // membership.view it implies, tenant-wide (BG-33).
  it.each([
    ['the mutation', 'membership.suspend'],
    ['its view', 'membership.view'],
  ])('offers no Suspend while %s is held only at branch scope', (_case, branchOnly) => {
    const holder = { permissions: ALL, tenantPermissions: ALL.filter((c) => c !== branchOnly) };
    const active = { membershipStatus: 'ACTIVE', userStatus: 'ACTIVE' } as const;
    expect(availableMembershipActions(active, holder)).not.toContain('suspend');
    expect(availableMembershipActions(active, wide(ALL))).toContain('suspend');
  });
});

describe('blockedMembershipActions', () => {
  const subject = {
    membershipStatus: 'ACTIVE',
    userStatus: 'ACTIVE',
    self: false,
    makerGate: 'allowed',
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
      blockedMembershipActions(['approve', 'reject'], { ...pending, makerGate: 'blocked' }),
    ).toEqual({ approve: USER_MAKER_CHECKER_BLOCKED });
    // Maker-checker off, or unreadable: the inviter keeps Approve (decision Q4).
    expect(
      blockedMembershipActions(['approve'], { ...pending, makerGate: 'allowed-self-approval' }),
    ).toEqual({});
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
        makerGate: 'blocked',
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
      blockedMembershipActions(['reject'], { ...pending, self: true, makerGate: 'blocked' }),
    ).toEqual({});
    expect(
      blockedMembershipActions(['reactivate'], { ...subject, self: true, makerGate: 'blocked' }),
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
    expect(membershipActionsNote({ permissions: [] })).toBeNull();
    expect(membershipActionsNote({ permissions: ['membership.view', 'user.view'] })).toBeNull();
  });

  it.each(LIFECYCLE)('tells %s without membership.view why nothing is offered', (code) => {
    expect(membershipActionsNote({ permissions: [code] })).toBe(NO_MEMBERSHIP_VIEW);
  });

  // BG-09: the user read carries the membership's id, so there is no lookup to miss or fail.
  it('says nothing once the holder can view memberships', () => {
    expect(membershipActionsNote({ permissions: ['membership.view', 'user.approve'] })).toBeNull();
  });
});

describe('scopedAssignmentView', () => {
  // BG-03: a search by user lists every branch for a tenant-wide view, the grant's branches else.
  it('is scoped unless branch_assignment.view is held tenant-wide', () => {
    const codes = ['branch_assignment.view'];
    expect(scopedAssignmentView({ permissions: codes, tenantPermissions: codes })).toBe(false);
    expect(scopedAssignmentView({ permissions: codes, tenantPermissions: [] })).toBe(true);
    expect(SCOPED_ASSIGNMENTS_NOTE).toBe('Only assignments at branches you can view are shown.');
  });
});

describe('role and branch assignment gates', () => {
  it('refuses a role assignment on a revoked membership or without role.view', () => {
    const holder = { permissions: ['user.assign_role', 'role_assignment.view', 'role.view'] };
    expect(canAssignUserRole('REVOKED', holder, false)).toBe(false);
    expect(
      canAssignUserRole(
        'ACTIVE',
        { permissions: ['user.assign_role', 'role_assignment.view'] },
        false,
      ),
    ).toBe(false);
    expect(canAssignUserRole('ACTIVE', { permissions: ['role.view'] }, false)).toBe(false);
    // Review Focus 3: user.assign_role implies role_assignment.view (ADR 0030).
    expect(
      canAssignUserRole('ACTIVE', { permissions: ['user.assign_role', 'role.view'] }, false),
    ).toBe(false);
    expect(canAssignUserRole('SUSPENDED', holder, false)).toBe(true);
    expect(canAssignUserRole('PENDING_APPROVAL', holder, false)).toBe(true);
  });

  it('refuses a branch assignment on a revoked membership or without branch.view', () => {
    const codes = ['user.assign_branch', 'branch_assignment.view', 'branch.view'];
    expect(canAssignUserBranch('REVOKED', { permissions: codes }, false)).toBe(false);
    expect(
      canAssignUserBranch(
        'ACTIVE',
        { permissions: codes.filter((code) => code !== 'branch.view') },
        false,
      ),
    ).toBe(false);
    expect(
      canAssignUserBranch(
        'ACTIVE',
        { permissions: codes.filter((code) => code !== 'branch_assignment.view') },
        false,
      ),
    ).toBe(false);
    expect(
      canAssignUserBranch(
        'ACTIVE',
        { permissions: codes.filter((code) => code !== 'user.assign_branch') },
        false,
      ),
    ).toBe(false);
    expect(canAssignUserBranch('PENDING_APPROVAL', { permissions: codes }, false)).toBe(true);
  });

  // Platform #342 (ADR 0044): adding to your own access also needs user.assign_self, and its
  // view, tenant-wide; only the seeded administrators hold it (Review Focus 3).
  const ASSIGNER = [
    'user.view',
    'user.assign_role',
    'role_assignment.view',
    'role.view',
    'user.assign_branch',
    'branch_assignment.view',
    'branch.view',
  ];
  const iamAdmin = { permissions: ASSIGNER, tenantPermissions: ASSIGNER };
  const tenantAdmin = {
    permissions: [...ASSIGNER, 'user.assign_self'],
    tenantPermissions: [...ASSIGNER, 'user.assign_self'],
  };

  it.each([
    ['an IAM_ADMIN-shaped holder', true, iamAdmin],
    [
      'user.assign_self held only at branch scope',
      true,
      { permissions: [...ASSIGNER, 'user.assign_self'], tenantPermissions: ASSIGNER },
    ],
    [
      'user.assign_self without user.view tenant-wide',
      true,
      { permissions: [...ASSIGNER, 'user.assign_self'], tenantPermissions: ['user.assign_self'] },
    ],
    ['a tenant administrator', false, tenantAdmin],
  ] as const)('blocks your own access for %s → %s', (_case, blocked, holder) => {
    expect(ownAccessBlocked(true, holder)).toBe(blocked);
    expect(canAssignUserRole('ACTIVE', holder, true)).toBe(!blocked);
    expect(canAssignUserBranch('ACTIVE', holder, true)).toBe(!blocked);
  });

  it("never blocks someone else's access", () => {
    expect(ownAccessBlocked(false, iamAdmin)).toBe(false);
    expect(canAssignUserRole('ACTIVE', iamAdmin, false)).toBe(true);
    expect(canAssignUserBranch('ACTIVE', iamAdmin, false)).toBe(true);
    expect(OWN_ACCESS).toBe("You can't add to your own access. A tenant administrator can.");
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
        const subject = { membershipStatus, userStatus, self: true, makerGate: 'blocked' as const };
        const actions = availableMembershipActions(subject, wide(ALL));
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

describe('ROLE_SCOPE_ASSIGNMENTS_PAGE', () => {
  it('is the platform page maximum, and the hint that names it says whatever it is (A-m3)', () => {
    expect(ROLE_SCOPE_ASSIGNMENTS_PAGE).toBe(100);
    expect(
      roleScopeHint({ readable: true, offered: 0, truncated: true, someBranches: true }),
    ).toContain(`first ${ROLE_SCOPE_ASSIGNMENTS_PAGE} of`);
  });
});

describe('roleScopeBranches', () => {
  const label = (id: string) =>
    ({ b1: 'Westlands Branch', b2: 'Head Office', b3: 'Kisumu' })[id] ?? id;
  const anywhere = () => true;

  it('offers a branch held twice (HOME and OPERATE) once, sorted by label', () => {
    expect(
      roleScopeBranches(
        [{ branchId: 'b1' }, { branchId: 'b2' }, { branchId: 'b1' }],
        anywhere,
        label,
      ),
    ).toEqual([
      { id: 'b2', label: 'Head Office' },
      { id: 'b1', label: 'Westlands Branch' },
    ]);
  });

  it('keeps only the branches the holder may assign at (BG-03)', () => {
    const rows = [{ branchId: 'b1' }, { branchId: 'b2' }, { branchId: 'b3' }];
    const reachable = (id: string) => id !== 'b2';
    expect(roleScopeBranches(rows, reachable, label)).toEqual([
      { id: 'b3', label: 'Kisumu' },
      { id: 'b1', label: 'Westlands Branch' },
    ]);
    expect(roleScopeBranches(rows, () => false, label)).toEqual([]);
    expect(roleScopeBranches([], anywhere, label)).toEqual([]);
  });
});

describe('roleScopeHint', () => {
  const UNREADABLE =
    "Their branch assignments can't be read here, so only institution scope is available.";

  it('says nothing while every branch of theirs is on offer', () => {
    expect(
      roleScopeHint({ readable: true, offered: 2, truncated: false, someBranches: false }),
    ).toBeUndefined();
    expect(
      roleScopeHint({ readable: false, offered: 1, truncated: false, someBranches: true }),
    ).toBeUndefined();
  });

  it('says the branches on offer may be only some when a capped page still held one (Ruling 8)', () => {
    const CAPPED = 'Only the first 100 of their branch assignments are offered.';
    expect(
      roleScopeHint({ readable: true, offered: 1, truncated: true, someBranches: false }),
    ).toBe(CAPPED);
    expect(roleScopeHint({ readable: true, offered: 3, truncated: true, someBranches: true })).toBe(
      CAPPED,
    );
  });

  it('explains an unreadable scan, and no assignment where the holder may assign', () => {
    expect(
      roleScopeHint({ readable: false, offered: 0, truncated: false, someBranches: false }),
    ).toBe(UNREADABLE);
    // Without institution scope, "only institution scope" would be wrong too.
    expect(
      roleScopeHint({ readable: false, offered: 0, truncated: false, someBranches: true }),
    ).toBe("Their branch assignments can't be read here, so no branch can be offered.");
    expect(
      roleScopeHint({ readable: true, offered: 0, truncated: false, someBranches: true }),
    ).toBe(
      "They aren't assigned to a branch where you can assign roles. Assign them to one first to give a branch-scoped role.",
    );
    expect(
      roleScopeHint({ readable: true, offered: 0, truncated: false, someBranches: false }),
    ).toBe('Assign them to a branch first to give a branch-scoped role.');
  });

  it('says a capped page is partial instead of claiming the user has no branch (Ruling 8)', () => {
    expect(
      roleScopeHint({ readable: true, offered: 0, truncated: true, someBranches: false }),
    ).toBe(
      'Only the first 100 of their branch assignments were checked, so only institution scope is offered here.',
    );
    expect(roleScopeHint({ readable: true, offered: 0, truncated: true, someBranches: true })).toBe(
      'Only the first 100 of their branch assignments were checked, and none was at a branch where you can assign roles.',
    );
  });

  it('keeps the unreadable explanation ahead of the capped one', () => {
    expect(
      roleScopeHint({ readable: false, offered: 0, truncated: true, someBranches: false }),
    ).toBe(UNREADABLE);
  });
});

describe('branchAssignmentCount', () => {
  it("counts the read's total, and says when the view is branch-scoped", () => {
    expect(branchAssignmentCount(2, false)).toBe('2');
    expect(branchAssignmentCount(0, false)).toBe('0');
    expect(branchAssignmentCount(1, true)).toBe('1 at branches you can view');
    expect(branchAssignmentCount(0, true)).toBe('0 at branches you can view');
  });
});

describe('branchAssignmentsEmptyState', () => {
  const OFFER = 'Assign a branch so they can work there.';
  const OTHER = "They may be assigned to branches you can't view.";
  const base = { scoped: false, assignOffered: false };

  it('claims no assignments only when nothing was hidden (a tenant-wide view)', () => {
    expect(branchAssignmentsEmptyState(base)).toEqual({
      title: 'No branch assignments',
      description: 'This user has no branch assignments.',
    });
    expect(branchAssignmentsEmptyState({ ...base, assignOffered: true })).toEqual({
      title: 'No branch assignments',
      description: OFFER,
    });
  });

  it('says a branch-scoped view sees only its branches', () => {
    const scoped = { ...base, scoped: true };
    expect(branchAssignmentsEmptyState(scoped)).toEqual({
      title: 'No assignment at branches you can view',
      description: OTHER,
    });
    expect(branchAssignmentsEmptyState({ ...scoped, assignOffered: true })).toEqual({
      title: 'No assignment at branches you can view',
      description: `${OTHER} ${OFFER}`,
    });
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
