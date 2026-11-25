import { describe, expect, it } from 'vitest';
import { BRANCH_QUEUE_HREF, USER_QUEUE_HREF } from './approval-rules';
import {
  actionableUserApprovals,
  approvalNotifications,
  APPROVALS_UNAVAILABLE,
  bellNotifications,
  bellUserApprovals,
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

  // BG-22: the platform's count leaves out the caller's own requests but counts identities still
  // provisioning, over every inviter; the queue's total leaves out provisioning but counts the
  // caller's own. Each is an upper bound on what the caller can decide, so the bell takes the lower.
  it.each([
    // Nothing of the caller's own pending: exact, the queue's total.
    ['no request of the caller’s own', 4, { pending: 4, provisioning: 1 }, 3],
    // Carol is the caller's (left out by the platform), Daniel is provisioning: an upper bound.
    [
      'the caller’s own request and someone else’s provisioning',
      8,
      { pending: 9, provisioning: 1 },
      8,
    ],
    // The caller's own invite is the provisioning one: subtracting it from the platform's count
    // would read 0 while Amina waits.
    ['the caller’s own request still provisioning', 1, { pending: 2, provisioning: 1 }, 1],
    // The caller invited someone just now: their own isn't theirs to approve.
    ['a new invitation of the caller’s own', 3, { pending: 5, provisioning: 1 }, 3],
    ['nothing at all', 0, { pending: 0, provisioning: 0 }, 0],
    // The reads aren't atomic either.
    ['a decision between the reads', 2, { pending: 1, provisioning: 3 }, 0],
  ])('counts users with %s', (_case, memberships, counts, expected) => {
    expect(bellUserApprovals(memberships, counts)).toBe(expected);
  });

  it('adds the users the caller can decide to the branches, with an entry and a link each', () => {
    expect(
      bellNotifications({
        pending: { ok: true, value: { memberships: 8, branches: 2 } },
        users: { ok: true, value: { pending: 9, provisioning: 1 } },
      }),
    ).toEqual({
      label: 'Notifications: 10 approvals waiting',
      total: 10,
      entries: [
        {
          id: 'user-onboarding',
          text: '8 users are waiting for approval.',
          href: USER_QUEUE_HREF,
          linkLabel: 'Review user onboarding',
        },
        {
          id: 'branch-activation',
          text: '2 branches are waiting for activation.',
          href: BRANCH_QUEUE_HREF,
          linkLabel: 'Review branch activation',
        },
      ],
      emptyText: NOTHING_WAITING,
      unavailableText: APPROVALS_UNAVAILABLE,
    });
  });

  it('shows only the kinds the platform counted, in the singular when it is one', () => {
    const users = bellNotifications({
      pending: { ok: true, value: { memberships: 1 } },
      users: { ok: true, value: { pending: 1, provisioning: 0 } },
    });
    expect(users.label).toBe('Notifications: 1 approval waiting');
    expect(users.entries.map((entry) => entry.text)).toEqual(['1 user is waiting for approval.']);
    const branches = bellNotifications({
      pending: { ok: true, value: { branches: 1 } },
      users: null,
    });
    expect(branches.entries.map((entry) => entry.text)).toEqual([
      '1 branch is waiting for activation.',
    ]);
  });

  // A missing key is a kind the caller can't approve, never 0 of it; a key with no queue to cap
  // it (no tenant-wide `user.view`, so nothing read) has no tab to open either.
  it.each([
    [
      'no memberships key, though the queue was read',
      { branches: 2 },
      { pending: 4, provisioning: 0 },
    ],
    ['memberships, but no queue read', { memberships: 4, branches: 2 }, null],
  ] as const)('shows no user line for %s', (_case, value, users) => {
    const props = bellNotifications({
      pending: { ok: true, value },
      users: users === null ? null : { ok: true, value: users },
    });
    expect(props.entries.map((entry) => entry.id)).toEqual(['branch-activation']);
    expect(props.total).toBe(2);
  });

  it('shows no branch line without a branches key', () => {
    const props = bellNotifications({
      pending: { ok: true, value: { memberships: 3 } },
      users: { ok: true, value: { pending: 4, provisioning: 1 } },
    });
    expect(props.entries.map((entry) => entry.id)).toEqual(['user-onboarding']);
  });

  it('reads none at zero, with no entries', () => {
    expect(
      bellNotifications({
        pending: { ok: true, value: { memberships: 1, branches: 0 } },
        users: { ok: true, value: { pending: 1, provisioning: 1 } },
      }),
    ).toMatchObject({ label: 'Notifications: nothing waiting', total: 0, entries: [] });
  });

  it.each([
    [
      'the counts',
      { ok: false } as const,
      { ok: true, value: { pending: 4, provisioning: 0 } } as const,
    ],
    [
      'the queue’s user totals',
      { ok: true, value: { memberships: 4, branches: 2 } } as const,
      { ok: false } as const,
    ],
  ])('never reads as none when %s failed: the whole count is unknown', (_part, pending, users) => {
    expect(bellNotifications({ pending, users })).toMatchObject({
      label: "Notifications (couldn't be loaded)",
      total: null,
      entries: [],
    });
  });

  // The overview's card and Onboarding item say their list totals in the same words.
  it('says counts it is given, one entry per kind above zero', () => {
    expect(
      approvalNotifications({
        users: { ok: true, value: 3 },
        branches: { ok: true, value: 0 },
      }).entries.map((entry) => entry.text),
    ).toEqual(['3 users are waiting for approval.']);
    expect(approvalNotifications({ users: null, branches: { ok: false } })).toMatchObject({
      label: "Notifications (couldn't be loaded)",
      total: null,
      entries: [],
    });
  });
});
