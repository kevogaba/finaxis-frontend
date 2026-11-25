import { describe, expect, it } from 'vitest';
import type { BranchStatus } from '@/modules/administration/branches/branch-contract';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import {
  PROVISIONING_NOTE,
  USER_MAKER_CHECKER_BLOCKED,
} from '@/modules/administration/users/user-rules';
import {
  approvalQueueTabs,
  canSeeBranchActivations,
  canSeeUserApprovals,
  availableBranchDecisions,
  availableUserDecisions,
  blockedBranchDecisions,
  blockedUserDecisions,
  BRANCH_QUEUE_HREF,
  branchApprovalHref,
  branchOutcomeNote,
  USER_QUEUE_HREF,
  userApprovalHref,
  userApprovalState,
  userOutcomeNote,
} from './approval-rules';

// Distinct first blocks, so a short id names its id.
const VICTOR = 'b2000000-0000-4000-8000-0000000000bb';

/** Every code held tenant-wide. */
const wide = (permissions: readonly string[]) => ({ permissions, tenantPermissions: permissions });
const APPROVER = wide(['user.approve', 'user.view', 'membership.view', 'membership.revoke']);

describe('the queue', () => {
  it.each([
    [
      ['user.approve', 'user.view', 'branch.approve', 'branch.view'],
      ['User onboarding', 'Branch activation'],
    ],
    [['user.approve', 'user.view'], ['User onboarding']],
    [['branch.approve', 'branch.view'], ['Branch activation']],
    // Each tab needs its read code too: a decision without its read-back lists nothing.
    [['user.approve', 'branch.approve'], []],
    // And the reverse: the read codes alone decide nothing.
    [['user.view', 'branch.view'], []],
    [[], []],
  ])('offers the tabs %j allows: %j', (permissions, labels) => {
    expect(
      approvalQueueTabs({ permissions, tenantPermissions: permissions }).map((tab) => tab.label),
    ).toEqual(labels);
  });

  // GET /tenant/users checks user.view tenant-wide (BG-33).
  it('offers no User onboarding tab while user.view is held only at branch scope', () => {
    const permissions = ['user.approve', 'user.view', 'branch.approve', 'branch.view'];
    const holder = {
      permissions,
      tenantPermissions: ['user.approve', 'branch.approve', 'branch.view'],
    };
    expect(approvalQueueTabs(holder).map((tab) => tab.label)).toEqual(['Branch activation']);
    expect(canSeeUserApprovals(holder)).toBe(false);
    expect(canSeeUserApprovals({ ...holder, tenantPermissions: ['user.view'] })).toBe(true);
  });

  // A pending branch grants no branch-scoped permission (platform #242): only a tenant-wide
  // approver can activate one, whichever branch is selected (BG-03).
  it.each(['branch.approve', 'branch.view'])(
    'offers no Branch activation tab while %s is held only at a branch',
    (scoped) => {
      const permissions = ['branch.approve', 'branch.view'];
      const holder = {
        permissions,
        tenantPermissions: permissions.filter((code) => code !== scoped),
      };
      expect(approvalQueueTabs(holder)).toEqual([]);
      expect(canSeeBranchActivations(holder)).toBe(false);
      expect(canSeeBranchActivations(wide(permissions))).toBe(true);
    },
  );

  it('counts a tab only when its count was read (spec §10.6), never a 0 it doesn’t know', () => {
    const codes = ['user.approve', 'user.view', 'branch.approve', 'branch.view'];
    const both = { permissions: codes, tenantPermissions: codes };
    expect(approvalQueueTabs(both, { users: 8, branches: 0 }).map((tab) => tab.label)).toEqual([
      'User onboarding (8)',
      'Branch activation (0)',
    ]);
    expect(approvalQueueTabs(both, { users: null, branches: 3 }).map((tab) => tab.label)).toEqual([
      'User onboarding',
      'Branch activation (3)',
    ]);
  });

  it('builds every href from one root', () => {
    const codes = ['user.approve', 'user.view'];
    expect(approvalQueueTabs({ permissions: codes, tenantPermissions: codes })[0]?.href).toBe(
      '/admin/approvals/users',
    );
    expect(USER_QUEUE_HREF).toBe('/admin/approvals/users');
    expect(BRANCH_QUEUE_HREF).toBe('/admin/approvals/branches');
    expect(userApprovalHref(VICTOR)).toBe(`/admin/approvals/users/${VICTOR}`);
    expect(branchApprovalHref(VICTOR)).toBe(`/admin/approvals/branches/${VICTOR}`);
  });
});

describe('where a user approval stands', () => {
  it.each([
    ['PENDING_APPROVAL', 'DRAFT', 'awaiting'],
    ['PENDING_APPROVAL', 'ACTIVE', 'awaiting'],
    ['PENDING_APPROVAL', 'PROVISIONING_IDP', 'provisioning'],
    ['PENDING_APPROVAL', 'SUSPENDED', 'blocked'],
    ['PENDING_APPROVAL', 'DEACTIVATED', 'blocked'],
    ['ACTIVE', 'ACTIVE', 'decided'],
    ['REVOKED', 'DRAFT', 'decided'],
  ] as const)('reads a %s membership of a %s account as %s', (membership, user, state) => {
    expect(userApprovalState(membership, user)).toBe(state);
  });

  it('offers Approve and Reject & revoke while it waits, each by its own code', () => {
    expect(availableUserDecisions('awaiting', APPROVER)).toEqual(['approve', 'reject']);
    expect(availableUserDecisions('blocked', APPROVER)).toEqual(['approve', 'reject']);
    expect(availableUserDecisions('awaiting', wide(['user.approve', 'membership.view']))).toEqual([
      'approve',
    ]);
    expect(
      availableUserDecisions('awaiting', wide(['membership.revoke', 'membership.view'])),
    ).toEqual(['reject']);
  });

  // Review Focus 3: approving and revoking are checked tenant-wide, with membership.view (BG-33).
  it('offers no decision held, or whose view is held, only at branch scope', () => {
    const codes = APPROVER.permissions;
    const held = (tenantWide: readonly string[]) => ({
      permissions: codes,
      tenantPermissions: tenantWide,
    });
    expect(
      availableUserDecisions('awaiting', held(['membership.view', 'membership.revoke'])),
    ).toEqual(['reject']);
    expect(availableUserDecisions('awaiting', held(['user.approve', 'membership.revoke']))).toEqual(
      [],
    );
  });

  it('offers nothing without membership.view (BG-31), and nothing once decided or provisioning', () => {
    expect(
      availableUserDecisions('awaiting', wide(['user.approve', 'user.view', 'membership.revoke'])),
    ).toEqual([]);
    expect(availableUserDecisions('provisioning', APPROVER)).toEqual([]);
    expect(availableUserDecisions('decided', APPROVER)).toEqual([]);
  });

  it('disables Approve for a blocked account first, then for a blocked maker, never Reject', () => {
    expect(
      blockedUserDecisions(['approve', 'reject'], {
        state: 'blocked',
        userStatus: 'SUSPENDED',
        makerGate: 'blocked',
      }),
    ).toEqual({
      approve: "Their account is suspended on the platform, so this membership can't be approved.",
    });
    expect(
      blockedUserDecisions(['approve', 'reject'], {
        state: 'awaiting',
        userStatus: 'DRAFT',
        makerGate: 'blocked',
      }),
    ).toEqual({ approve: USER_MAKER_CHECKER_BLOCKED });
    expect(
      blockedUserDecisions(['reject'], {
        state: 'awaiting',
        userStatus: 'DRAFT',
        makerGate: 'blocked',
      }),
    ).toEqual({});
  });

  // A maker whose switch is off, or can't be read, keeps Approve (decision Q4).
  it.each(['allowed', 'allowed-self-approval'] as const)(
    'keeps Approve enabled for a %s maker gate',
    (makerGate) => {
      expect(
        blockedUserDecisions(['approve', 'reject'], {
          state: 'awaiting',
          userStatus: 'DRAFT',
          makerGate,
        }),
      ).toEqual({});
    },
  );

  it('says what happened instead of offering a decision', () => {
    expect(userOutcomeNote('awaiting', 'PENDING_APPROVAL')).toBeNull();
    expect(userOutcomeNote('blocked', 'PENDING_APPROVAL')).toBeNull();
    expect(userOutcomeNote('provisioning', 'PENDING_APPROVAL')).toBe(PROVISIONING_NOTE);
    expect(userOutcomeNote('decided', 'ACTIVE')).toBe('Approved: this membership is active.');
    expect(userOutcomeNote('decided', 'REVOKED')).toBe(
      "Rejected: this membership was revoked, and this email can't be invited to this institution again.",
    );
    expect(userOutcomeNote('decided', 'SUSPENDED')).toBe(
      "This membership isn't waiting for approval: it is suspended.",
    );
  });
});

describe('where a branch activation stands', () => {
  const ACTIVATOR = wide(['branch.approve', 'branch.view']);
  const ME = 'a1000000-0000-4000-8000-0000000000aa';
  const actor = (id: string) => ({ id, displayName: null });
  const pending = (maker = VICTOR, status: BranchStatus = 'PENDING_APPROVAL') => ({
    id: 'branch-a',
    status,
    branchCode: 'KERICHO',
    createdBy: actor(maker),
    submittedBy: actor(maker),
  });

  it('offers Activate and Return only while pending, and only with both codes tenant-wide', () => {
    expect(availableBranchDecisions(pending(), ACTIVATOR, ME)).toEqual(['activate', 'return']);
    expect(availableBranchDecisions(pending(VICTOR, 'ACTIVE'), ACTIVATOR, ME)).toEqual([]);
    expect(availableBranchDecisions(pending(), wide(['branch.approve']), ME)).toEqual([]);
    expect(availableBranchDecisions(pending(), wide(['branch.view']), ME)).toEqual([]);
    // Held at that branch only: a pending branch grants no branch-scope permission (#242).
    expect(
      availableBranchDecisions(
        pending(),
        {
          permissions: ['branch.approve', 'branch.view'],
          tenantPermissions: ['branch.view'],
          branchPermissions: { 'branch.approve': ['branch-a'] },
        },
        ME,
      ),
    ).toEqual([]);
  });

  // The return route's two intents (BranchProvisioningService.returnForChanges): its maker
  // withdraws with branch.create, and never returns their own request.
  it('offers its maker Withdraw beside Activate, with branch.create tenant-wide only', () => {
    expect(availableBranchDecisions(pending(ME), ACTIVATOR, ME)).toEqual(['activate']);
    expect(
      availableBranchDecisions(pending(ME), wide([...ACTIVATOR.permissions, 'branch.create']), ME),
    ).toEqual(['activate', 'withdraw']);
    // branch.create held at a branch never reaches a pending one (#242): no Withdraw.
    expect(
      availableBranchDecisions(
        pending(ME),
        {
          permissions: [...ACTIVATOR.permissions, 'branch.create'],
          tenantPermissions: ACTIVATOR.permissions,
        },
        ME,
      ),
    ).toEqual(['activate']);
  });

  it('disables Activate only while the maker gate blocks it', () => {
    expect(blockedBranchDecisions(['activate'], { makerGate: 'blocked' })).toEqual({
      activate: MAKER_CHECKER_BLOCKED,
    });
    expect(blockedBranchDecisions(['activate', 'withdraw'], { makerGate: 'blocked' })).toEqual({
      activate: MAKER_CHECKER_BLOCKED,
    });
    expect(blockedBranchDecisions(['activate'], { makerGate: 'allowed' })).toEqual({});
    expect(blockedBranchDecisions(['activate'], { makerGate: 'allowed-self-approval' })).toEqual(
      {},
    );
    expect(blockedBranchDecisions([], { makerGate: 'blocked' })).toEqual({});
  });

  it.each([
    ['PENDING_APPROVAL', null, null],
    ['ACTIVE', null, 'Activated: this branch is live.'],
    ['DRAFT', null, "This branch is still a draft: it hasn't been submitted for activation."],
    ['DRAFT', 'Wrong parent', 'Sent back to draft: it can be changed and submitted again.'],
    ['CLOSED', 'Merged', "This branch isn't waiting for activation: it is closed."],
  ] as const)('notes a %s branch (reason %j): %j', (status, statusReason, note) => {
    expect(branchOutcomeNote({ status, statusReason })).toBe(note);
  });
});
