import { describe, expect, it } from 'vitest';
import {
  accountBlockedNote,
  USER_MAKER_CHECKER_BLOCKED,
} from '@/modules/administration/users/user-rules';
import { TENANT_STATUSES } from '../tenants/tenant-contract';
import {
  activateBlocked,
  branchCheckerNote,
  canCheckBranches,
  canCheckMembers,
  CHECKER_APPROVE_CONFLICT,
  checkerBranchActions,
  checkerWindow,
  memberApproval,
  memberCheckerNote,
  OWN_MEMBERSHIP_APPROVAL,
  PLATFORM_ACTIVATE_BLOCKED,
  type CheckerWindow,
} from './checker-rules';

const ME = '15000000-0000-4000-8000-0000000000aa';
const MAKER = '15000000-0000-4000-8000-0000000000a1';
const SOMEONE = { id: MAKER, displayName: 'Wanjiru Njeri' };
const ME_REF = { id: ME, displayName: 'Jane' };

const ALL = {
  permissions: [
    'branch.view',
    'branch.create',
    'branch.approve',
    'user.view',
    'user.approve',
    'membership.view',
  ],
};

const page = (total: number, createdBy: (typeof SOMEONE | null)[]) => ({
  items: createdBy.map((maker) => ({ createdBy: maker })),
  page: { totalItems: total },
});

describe('checkerWindow (ADR 0028)', () => {
  it('is open with no active row, or with only the one the system made', () => {
    expect(checkerWindow(page(0, []))).toBe('open');
    expect(checkerWindow(page(1, [null]))).toBe('open');
  });

  it('closes on one active row someone made, or on any two (the system makes at most one)', () => {
    expect(checkerWindow(page(1, [SOMEONE]))).toBe('closed');
    expect(checkerWindow(page(2, [null]))).toBe('closed');
    expect(checkerWindow(page(7, [SOMEONE]))).toBe('closed');
  });
});

describe('the members window', () => {
  it.each(TENANT_STATUSES.map((status) => [status, status === 'ACTIVE'] as const))(
    'checks members of a %s institution: %s',
    (status, checks) => {
      expect(canCheckMembers(status, ALL)).toBe(checks);
    },
  );

  it('needs user.approve with membership.view (ADR 0030)', () => {
    expect(canCheckMembers('ACTIVE', { permissions: ['user.approve'] })).toBe(false);
    expect(canCheckMembers('ACTIVE', { permissions: ['membership.view'] })).toBe(false);
    expect(canCheckMembers('ACTIVE', { permissions: ['user.approve', 'membership.view'] })).toBe(
      true,
    );
  });

  const row = (overrides: Partial<Parameters<typeof memberApproval>[0]> = {}) => ({
    id: '15000000-0000-4000-8000-0000000000a2',
    membershipStatus: 'PENDING_APPROVAL' as const,
    userStatus: 'INVITED' as const,
    createdBy: SOMEONE,
    ...overrides,
  });

  it('offers Approve on a pending member, enabled', () => {
    expect(memberApproval(row(), ME)).toEqual({ blocked: null });
    expect(memberApproval(row({ userStatus: 'DRAFT' }), ME)).toEqual({ blocked: null });
  });

  it('offers nothing on a decided member, or one already approved into provisioning (BG-11)', () => {
    expect(memberApproval(row({ membershipStatus: 'ACTIVE' }), ME)).toBeNull();
    expect(memberApproval(row({ membershipStatus: 'REVOKED' }), ME)).toBeNull();
    expect(memberApproval(row({ userStatus: 'PROVISIONING_IDP' }), ME)).toBeNull();
  });

  it("disables it for the member's inviter and the member themself: the checker is never relaxed", () => {
    expect(memberApproval(row({ createdBy: ME_REF }), ME)).toEqual({
      blocked: USER_MAKER_CHECKER_BLOCKED,
    });
    expect(memberApproval(row({ id: ME }), ME)).toEqual({ blocked: OWN_MEMBERSHIP_APPROVAL });
    // Ids compare without case (contract §A).
    expect(memberApproval(row({ createdBy: ME_REF }), ME.toUpperCase())?.blocked).toBe(
      USER_MAKER_CHECKER_BLOCKED,
    );
  });

  it('disables it for a blocked account first, as the user record does', () => {
    expect(memberApproval(row({ userStatus: 'SUSPENDED', createdBy: ME_REF }), ME)).toEqual({
      blocked: accountBlockedNote('SUSPENDED'),
    });
  });

  it('blocks nothing without a profile: the platform decides', () => {
    expect(memberApproval(row({ createdBy: null }), null)).toEqual({ blocked: null });
  });

  it.each<[CheckerWindow, string | null]>([
    [
      'open',
      'Platform checking is open: Bidii SACCO has no active member besides its first administrator, so a platform administrator can approve its first members.',
    ],
    ['closed', 'Bidii SACCO now approves its own members.'],
    ['unknown', null],
  ])('words the %s window', (opening, text) => {
    expect(memberCheckerNote('Bidii SACCO', opening)?.text ?? null).toBe(text);
  });
});

describe('the branches window', () => {
  it.each(
    TENANT_STATUSES.map(
      (status) => [status, status === 'ACTIVE' || status === 'PROVISIONING'] as const,
    ),
  )('checks branches of a %s institution: %s', (status, checks) => {
    expect(canCheckBranches(status, ALL)).toBe(checks);
  });

  it('needs branch.view and either mutation code', () => {
    expect(canCheckBranches('ACTIVE', { permissions: ['branch.view'] })).toBe(false);
    expect(canCheckBranches('ACTIVE', { permissions: ['branch.create'] })).toBe(false);
    expect(canCheckBranches('ACTIVE', { permissions: ['branch.view', 'branch.create'] })).toBe(
      true,
    );
    expect(canCheckBranches('ACTIVE', { permissions: ['branch.view', 'branch.approve'] })).toBe(
      true,
    );
  });

  const draft = { status: 'DRAFT' as const, createdBy: SOMEONE, submittedBy: null };
  const pending = { status: 'PENDING_APPROVAL' as const, createdBy: SOMEONE, submittedBy: SOMEONE };
  const context = (overrides: Partial<Parameters<typeof checkerBranchActions>[1]> = {}) => ({
    tenantStatus: 'ACTIVE' as const,
    window: 'open' as const,
    holder: ALL,
    callerId: ME,
    ...overrides,
  });

  it('offers Submit on a draft, and Return then Activate on a pending branch', () => {
    expect(checkerBranchActions(draft, context())).toEqual(['submit']);
    expect(checkerBranchActions(pending, context())).toEqual(['return', 'activate']);
  });

  it('offers nothing on any other branch', () => {
    for (const status of ['ACTIVE', 'SUSPENDED', 'CLOSED', 'ARCHIVED'] as const) {
      expect(checkerBranchActions({ ...pending, status }, context())).toEqual([]);
    }
  });

  it('offers Withdraw, not Return, to its creator or latest submitter, with Activate disabled', () => {
    const submitted = { ...pending, submittedBy: ME_REF };
    expect(checkerBranchActions(submitted, context())).toEqual(['withdraw', 'activate']);
    expect(activateBlocked(submitted, ME)).toBe(PLATFORM_ACTIVATE_BLOCKED);
    expect(activateBlocked({ ...pending, createdBy: ME_REF }, ME)).toBe(PLATFORM_ACTIVATE_BLOCKED);
    expect(activateBlocked(pending, ME)).toBeNull();
    expect(activateBlocked(submitted, null)).toBeNull();
  });

  it('offers only the unbounded Withdraw once the window is closed', () => {
    const closed = context({ window: 'closed' });
    expect(checkerBranchActions(draft, closed)).toEqual([]);
    expect(checkerBranchActions(pending, closed)).toEqual([]);
    expect(checkerBranchActions({ ...pending, submittedBy: ME_REF }, closed)).toEqual(['withdraw']);
  });

  it('offers everything while the window is unknown: the named 409 explains a closed one', () => {
    expect(checkerBranchActions(pending, context({ window: 'unknown' }))).toEqual([
      'return',
      'activate',
    ]);
  });

  it('activates only in an ACTIVE institution, and acts in no state but it and PROVISIONING', () => {
    expect(checkerBranchActions(pending, context({ tenantStatus: 'PROVISIONING' }))).toEqual([
      'return',
    ]);
    expect(checkerBranchActions(draft, context({ tenantStatus: 'PROVISIONING' }))).toEqual([
      'submit',
    ]);
    expect(checkerBranchActions(pending, context({ tenantStatus: 'SUSPENDED' }))).toEqual([]);
  });

  it('gates each action on its own code, and all of them on branch.view', () => {
    const only = (...permissions: string[]) => context({ holder: { permissions } });
    expect(checkerBranchActions(draft, only('branch.view', 'branch.approve'))).toEqual([]);
    expect(checkerBranchActions(pending, only('branch.view', 'branch.create'))).toEqual([]);
    expect(checkerBranchActions(pending, only('branch.view', 'branch.approve'))).toEqual([
      'return',
      'activate',
    ]);
    expect(
      checkerBranchActions(
        { ...pending, createdBy: ME_REF },
        only('branch.view', 'branch.approve'),
      ),
    ).toEqual(['activate']);
    expect(checkerBranchActions(pending, only('branch.create', 'branch.approve'))).toEqual([]);
  });

  it.each<[CheckerWindow, string | null]>([
    [
      'open',
      'Platform checking is open: Bidii SACCO has no active branch besides its head office, so a platform administrator can submit, return and activate its first branches.',
    ],
    ['closed', 'Bidii SACCO now approves its own branches.'],
    ['unknown', null],
  ])('words the %s window', (opening, text) => {
    expect(branchCheckerNote('Bidii SACCO', opening, 'ACTIVE')?.text ?? null).toBe(text);
  });

  it("doesn't promise Activate for a PROVISIONING institution, which can't take it yet", () => {
    expect(branchCheckerNote('Bidii SACCO', 'open', 'PROVISIONING')?.text).toBe(
      'Platform checking is open: Bidii SACCO has no active branch besides its head office, so a platform administrator can submit and return its first branches. Activation waits until the institution is active.',
    );
    expect(branchCheckerNote('Bidii SACCO', 'closed', 'PROVISIONING')?.text).toBe(
      'Bidii SACCO now approves its own branches.',
    );
  });
});

describe("the actions' hedged 409s", () => {
  it("names every plain cause of Approve's 409, the account's state included", () => {
    expect(CHECKER_APPROVE_CONFLICT).toBe(
      "This request couldn't be approved. It may already have been decided, the person may have no active role or branch yet, their account may be suspended or deactivated, or the institution may not be active. Refresh and check.",
    );
  });
});
