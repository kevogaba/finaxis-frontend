import { describe, expect, it } from 'vitest';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import {
  PROVISIONING_NOTE,
  USER_MAKER_CHECKER_BLOCKED,
} from '@/modules/administration/users/user-rules';
import {
  approvalQueueTabs,
  availableBranchDecisions,
  availableUserDecisions,
  blockedBranchDecisions,
  blockedUserDecisions,
  BRANCH_QUEUE_HREF,
  branchApprovalHref,
  branchOutcomeNote,
  isSameUser,
  USER_QUEUE_HREF,
  userApprovalHref,
  userApprovalState,
  userOutcomeNote,
} from './approval-rules';

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const ME = 'a1000000-0000-4000-8000-0000000000aa';
const VICTOR = 'b2000000-0000-4000-8000-0000000000bb';

const APPROVER = {
  permissions: ['user.approve', 'user.view', 'membership.view', 'membership.revoke'],
};

describe('the queue', () => {
  it.each([
    [
      ['user.approve', 'user.view', 'branch.activate', 'branch.view'],
      ['User onboarding', 'Branch activation'],
    ],
    [['user.approve', 'user.view'], ['User onboarding']],
    [['branch.activate', 'branch.view'], ['Branch activation']],
    // Each tab needs its read code too: a decision without its read-back lists nothing.
    [['user.approve', 'branch.activate'], []],
    [[], []],
  ])('offers the tabs %j allows: %j', (permissions, labels) => {
    expect(approvalQueueTabs({ permissions }).map((tab) => tab.label)).toEqual(labels);
  });

  it('counts a tab only when its count was read (spec §10.6), never a 0 it doesn’t know', () => {
    const both = { permissions: ['user.approve', 'user.view', 'branch.activate', 'branch.view'] };
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
    expect(approvalQueueTabs({ permissions: ['user.approve', 'user.view'] })[0]?.href).toBe(
      '/admin/approvals/users',
    );
    expect(USER_QUEUE_HREF).toBe('/admin/approvals/users');
    expect(BRANCH_QUEUE_HREF).toBe('/admin/approvals/branches');
    expect(userApprovalHref(VICTOR)).toBe(`/admin/approvals/users/${VICTOR}`);
    expect(branchApprovalHref(VICTOR)).toBe(`/admin/approvals/branches/${VICTOR}`);
  });

  it('compares user ids without letter case, and never matches an unknown one', () => {
    expect(isSameUser(ME.toUpperCase(), ME)).toBe(true);
    expect(isSameUser(VICTOR, ME)).toBe(false);
    expect(isSameUser(null, ME)).toBe(false);
    expect(isSameUser(null, null)).toBe(false);
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
    expect(
      availableUserDecisions('awaiting', { permissions: ['user.approve', 'membership.view'] }),
    ).toEqual(['approve']);
    expect(
      availableUserDecisions('awaiting', { permissions: ['membership.revoke', 'membership.view'] }),
    ).toEqual(['reject']);
  });

  it('offers nothing without membership.view (BG-31), and nothing once decided or provisioning', () => {
    expect(
      availableUserDecisions('awaiting', {
        permissions: ['user.approve', 'user.view', 'membership.revoke'],
      }),
    ).toEqual([]);
    expect(availableUserDecisions('provisioning', APPROVER)).toEqual([]);
    expect(availableUserDecisions('decided', APPROVER)).toEqual([]);
  });

  it('disables Approve for a blocked account first, then for its inviter, never Reject', () => {
    expect(
      blockedUserDecisions(['approve', 'reject'], {
        state: 'blocked',
        userStatus: 'SUSPENDED',
        invitedByMe: true,
      }),
    ).toEqual({
      approve: "Their account is suspended on the platform, so this membership can't be approved.",
    });
    expect(
      blockedUserDecisions(['approve', 'reject'], {
        state: 'awaiting',
        userStatus: 'DRAFT',
        invitedByMe: true,
      }),
    ).toEqual({ approve: USER_MAKER_CHECKER_BLOCKED });
    expect(
      blockedUserDecisions(['approve', 'reject'], {
        state: 'awaiting',
        userStatus: 'DRAFT',
        invitedByMe: false,
      }),
    ).toEqual({});
    expect(
      blockedUserDecisions(['reject'], {
        state: 'awaiting',
        userStatus: 'DRAFT',
        invitedByMe: true,
      }),
    ).toEqual({});
  });

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
  const ACTIVATOR = { permissions: ['branch.activate', 'branch.view'] };

  it('offers Activate only while pending, and only with both codes', () => {
    expect(availableBranchDecisions('PENDING_APPROVAL', ACTIVATOR)).toEqual(['activate']);
    expect(availableBranchDecisions('ACTIVE', ACTIVATOR)).toEqual([]);
    expect(
      availableBranchDecisions('PENDING_APPROVAL', { permissions: ['branch.activate'] }),
    ).toEqual([]);
  });

  it('disables Activate for its drafter', () => {
    expect(blockedBranchDecisions(['activate'], { draftedByMe: true })).toEqual({
      activate: MAKER_CHECKER_BLOCKED,
    });
    expect(blockedBranchDecisions(['activate'], { draftedByMe: false })).toEqual({});
    expect(blockedBranchDecisions([], { draftedByMe: true })).toEqual({});
  });

  it.each([
    ['PENDING_APPROVAL', null],
    ['ACTIVE', 'Activated: this branch is live.'],
    ['DRAFT', "This branch is still a draft: it hasn't been submitted for activation."],
    ['CLOSED', "This branch isn't waiting for activation: it is closed."],
  ] as const)('notes a %s branch: %j', (status, note) => {
    expect(branchOutcomeNote(status)).toBe(note);
  });
});
