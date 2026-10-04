import { describe, expect, it } from 'vitest';
import { BRANCH_QUEUE_HREF, USER_QUEUE_HREF } from './approval-rules';
import {
  actionableUserApprovals,
  approvalNotifications,
  APPROVALS_UNAVAILABLE,
  NOTHING_WAITING,
} from './approval-notifications';

describe('the bell (Ruling 9)', () => {
  it.each([
    [{ pending: 9, provisioning: 1 }, 8],
    [{ pending: 2, provisioning: 2 }, 0],
    // The two reads aren't atomic: a decision between them can't make the count negative.
    [{ pending: 1, provisioning: 3 }, 0],
  ])('counts %j as %i actionable', (counts, expected) => {
    expect(actionableUserApprovals(counts)).toBe(expected);
  });

  it('adds actionable users to pending branches, with an entry and a link each', () => {
    expect(
      approvalNotifications({
        users: { ok: true, value: { pending: 9, provisioning: 1 } },
        branches: { ok: true, value: 3 },
        branchSelected: false,
      }),
    ).toEqual({
      label: 'Notifications: 11 approvals waiting',
      total: 11,
      entries: [
        {
          id: 'user-onboarding',
          text: '8 users are waiting for approval.',
          href: USER_QUEUE_HREF,
          linkLabel: 'Review user onboarding',
        },
        {
          id: 'branch-activation',
          text: '3 branches are waiting for activation.',
          href: BRANCH_QUEUE_HREF,
          linkLabel: 'Review branch activation',
        },
      ],
      emptyText: NOTHING_WAITING,
      unavailableText: APPROVALS_UNAVAILABLE,
    });
  });

  it('counts only what the holder may read, in the singular when it is one', () => {
    const users = approvalNotifications({
      users: { ok: true, value: { pending: 1, provisioning: 0 } },
      branches: null,
      branchSelected: false,
    });
    expect(users.label).toBe('Notifications: 1 approval waiting');
    expect(users.entries.map((entry) => entry.text)).toEqual(['1 user is waiting for approval.']);
    const branches = approvalNotifications({
      users: null,
      branches: { ok: true, value: 1 },
      branchSelected: false,
    });
    expect(branches.entries.map((entry) => entry.text)).toEqual([
      '1 branch is waiting for activation.',
    ]);
  });

  it('tells a branch context that activation needs All branches (BG-03)', () => {
    const props = approvalNotifications({
      users: null,
      branches: { ok: true, value: 2 },
      branchSelected: true,
    });
    expect(props.entries[0]?.text).toBe(
      '2 branches are waiting for activation. Switch to All branches to activate them.',
    );
  });

  it('reads none at zero, with no entries', () => {
    expect(
      approvalNotifications({
        users: { ok: true, value: { pending: 1, provisioning: 1 } },
        branches: { ok: true, value: 0 },
        branchSelected: false,
      }),
    ).toMatchObject({ label: 'Notifications: nothing waiting', total: 0, entries: [] });
  });

  it.each([
    ['the user counts', { ok: false } as const, { ok: true, value: 2 } as const],
    [
      'the branch count',
      { ok: true, value: { pending: 4, provisioning: 0 } } as const,
      { ok: false } as const,
    ],
  ])('never reads as none when %s failed: the whole count is unknown', (_part, users, branches) => {
    expect(approvalNotifications({ users, branches, branchSelected: false })).toMatchObject({
      label: "Notifications (couldn't be loaded)",
      total: null,
      entries: [],
    });
  });
});
