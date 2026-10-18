import { describe, expect, it } from 'vitest';
import type { Page } from '@/lib/api/wire';
import type { BranchSummary } from '@/modules/administration/branches/branch-contract';
import type { UserSummary } from '@/modules/administration/users/user-contract';
import {
  APPROVAL_PREVIEW_SIZE,
  noOverviewCards,
  overviewCards,
  pendingApprovalsView,
  userPreviewSize,
  type PendingApprovalsReads,
} from './overview-rules';

const ok = <T>(value: T) => ({ ok: true as const, value });
const failed = (requestId: string | null) => ({ ok: false as const, problem: { requestId } });

function page<T>(items: T[], totalItems = items.length): Page<T> {
  return {
    items,
    page: {
      number: 0,
      size: APPROVAL_PREVIEW_SIZE,
      totalItems,
      totalPages: Math.ceil(totalItems / APPROVAL_PREVIEW_SIZE),
      hasNext: totalItems > items.length,
      hasPrevious: false,
    },
  };
}

const user = (tail: string, name: string, userStatus: UserSummary['userStatus']): UserSummary => ({
  id: `14b00000-0000-4000-8000-0000000000${tail}`,
  username: name.toLowerCase().replace(/\s+/g, '.'),
  email: `${name.toLowerCase().replace(/\s+/g, '.')}@greenfield.example`,
  displayName: name,
  userStatus,
  membershipStatus: 'PENDING_APPROVAL',
});

const branch = (tail: string, name: string, code: string): BranchSummary => ({
  id: `14c00000-0000-4000-8000-0000000000${tail}`,
  branchCode: code,
  branchName: name,
  branchType: 'OPERATIONS',
  status: 'PENDING_APPROVAL',
  createdAt: '2026-09-15T08:00:00Z',
});

const WANJIKU = user('a4', 'Wanjiku Kariuki', 'DRAFT');
const BARAKA = user('a3', 'Baraka Otieno', 'PROVISIONING_IDP');
const HALIMA = user('a1', 'Halima Odhiambo', 'DRAFT');
const MALINDI = branch('c3', 'Malindi Branch', 'MALINDI');
const NYERI = branch('c2', 'Nyeri Branch', 'NYERI');
const KAKAMEGA = branch('c1', 'Kakamega Branch', 'KAKAMEGA');

const READS: PendingApprovalsReads = {
  users: ok(page([WANJIKU, BARAKA, HALIMA])),
  userCounts: ok({ pending: 3, provisioning: 1 }),
  branches: ok(page([MALINDI, NYERI, KAKAMEGA])),
  branchSelected: false,
};

describe('which cards a holder sees (Ruling 2)', () => {
  const ALL = [
    'business_date.view',
    'user.approve',
    'user.view',
    'branch.activate',
    'branch.view',
    'settings.view',
    'membership.view',
    'audit.view',
    'tenant.view',
  ];

  it('shows every card to a holder of every code', () => {
    const cards = overviewCards({ permissions: ALL });
    expect(cards).toEqual({
      businessDate: true,
      approvals: { users: true, branches: true },
      readiness: true,
      activity: { names: true, timeZone: true },
    });
    expect(noOverviewCards(cards)).toBe(false);
  });

  it('reads the actors and the timezone only with their own codes (rule 5)', () => {
    expect(overviewCards({ permissions: ['audit.view'] }).activity).toEqual({
      names: false,
      timeZone: false,
    });
    expect(overviewCards({ permissions: ['audit.view', 'user.view'] }).activity).toEqual({
      names: true,
      timeZone: false,
    });
  });

  it('offers each kind of request only with both of its codes', () => {
    expect(overviewCards({ permissions: ['user.approve', 'branch.view'] }).approvals).toBeNull();
    expect(
      overviewCards({ permissions: ['branch.activate', 'branch.view', 'user.view'] }).approvals,
    ).toEqual({ users: false, branches: true });
  });

  it('keeps Readiness while any one item can be checked, and omits the rest', () => {
    expect(overviewCards({ permissions: ['membership.view'] })).toEqual({
      businessDate: false,
      approvals: null,
      readiness: true,
      activity: null,
    });
    expect(overviewCards({ permissions: ['iam.profile.read'] }).readiness).toBe(false);
  });

  it('knows when no card applies, so the page can say so once', () => {
    expect(noOverviewCards(overviewCards({ permissions: ['iam.profile.read'] }))).toBe(true);
    for (const code of ['business_date.view', 'settings.view', 'audit.view']) {
      expect(noOverviewCards(overviewCards({ permissions: [code] })), code).toBe(false);
    }
    expect(
      noOverviewCards(overviewCards({ permissions: ['branch.activate', 'branch.view'] })),
    ).toBe(false);
  });
});

describe('the Pending approvals preview (Ruling 5)', () => {
  it('lists users first, then branches, each newest first as read, leaving provisioning out', () => {
    const view = pendingApprovalsView(READS);
    expect(view.rows.map((row) => row.name)).toEqual([
      'Wanjiku Kariuki',
      'Halima Odhiambo',
      'Malindi Branch',
      'Nyeri Branch',
      'Kakamega Branch',
    ]);
    expect(view.rows[0]).toEqual({
      id: WANJIKU.id,
      kind: 'user',
      name: 'Wanjiku Kariuki',
      detail: 'User onboarding · wanjiku.kariuki@greenfield.example',
      href: `/admin/approvals/users/${WANJIKU.id}`,
      reviewLabel: 'Review Wanjiku Kariuki',
    });
    expect(view.rows[2]).toEqual({
      id: MALINDI.id,
      kind: 'branch',
      name: 'Malindi Branch',
      detail: 'Branch activation · MALINDI · Operations',
      href: `/admin/approvals/branches/${MALINDI.id}`,
      reviewLabel: 'Review Malindi Branch',
    });
  });

  it('stops at five rows', () => {
    const many = [1, 2, 3, 4].map((n) => user(`d${String(n)}`, `Member ${String(n)}`, 'DRAFT'));
    const view = pendingApprovalsView({ ...READS, users: ok(page(many)) });
    expect(view.rows.map((row) => row.name)).toEqual([
      'Member 1',
      'Member 2',
      'Member 3',
      'Member 4',
      'Malindi Branch',
    ]);
  });

  it("counts with the bell's words and links, and notes identities still provisioning", () => {
    const view = pendingApprovalsView(READS);
    expect(view.summary).toEqual([
      {
        id: 'user-onboarding',
        text: '2 users are waiting for approval.',
        href: '/admin/approvals/users',
        linkLabel: 'Review user onboarding',
      },
      {
        id: 'branch-activation',
        text: '3 branches are waiting for activation.',
        href: '/admin/approvals/branches',
        linkLabel: 'Review branch activation',
      },
    ]);
    expect(view.provisioning).toBe('1 identity is still being provisioned: approval already ran.');
    expect(view.empty).toBe(false);
    expect(view.failures).toEqual([]);
  });

  it('asks for All branches before activating, with a branch selected', () => {
    const view = pendingApprovalsView({ ...READS, branchSelected: true });
    expect(view.summary[1]?.text).toBe(
      '3 branches are waiting for activation. Switch to All branches to activate them.',
    );
  });

  it('reads only the kinds the holder can decide', () => {
    const view = pendingApprovalsView({ ...READS, users: null, userCounts: null });
    expect(view.rows.map((row) => row.kind)).toEqual(['branch', 'branch', 'branch']);
    expect(view.summary.map((entry) => entry.id)).toEqual(['branch-activation']);
    expect(view.provisioning).toBeNull();
  });

  it('says nothing waits only when every permitted read said so', () => {
    const none = pendingApprovalsView({
      users: ok(page([])),
      userCounts: ok({ pending: 0, provisioning: 0 }),
      branches: ok(page([])),
      branchSelected: false,
    });
    expect(none).toEqual({
      summary: [],
      rows: [],
      failures: [],
      provisioning: null,
      empty: true,
    });
  });

  it.each([
    [
      'the user rows',
      { users: failed('14e00000-0000-4000-8000-0000000000a1') },
      "Users waiting for approval couldn't be loaded. Reference: 14e00000-0000-4000-8000-0000000000a1",
    ],
    [
      'the user counts',
      { userCounts: failed('14e00000-0000-4000-8000-0000000000a2') },
      "Users waiting for approval couldn't be loaded. Reference: 14e00000-0000-4000-8000-0000000000a2",
    ],
    [
      'the branch rows',
      { branches: failed(null) },
      "Branches waiting for activation couldn't be loaded.",
    ],
  ])(
    'says %s failed, never that nothing waits, and gives no partial count',
    (_case, change, failure) => {
      const view = pendingApprovalsView({ ...READS, ...change });
      expect(view.failures).toEqual([failure]);
      expect(view.summary).toEqual([]);
      expect(view.empty).toBe(false);
    },
  );

  it('still lists what the other read found', () => {
    const view = pendingApprovalsView({ ...READS, branches: failed(null) });
    expect(view.rows.map((row) => row.name)).toEqual(['Wanjiku Kariuki', 'Halima Odhiambo']);
  });

  it('never says nothing waits when the only read failed (L1)', () => {
    expect(
      pendingApprovalsView({
        users: null,
        userCounts: null,
        branches: failed(null),
        branchSelected: false,
      }),
    ).toEqual({
      summary: [],
      rows: [],
      failures: ["Branches waiting for activation couldn't be loaded."],
      provisioning: null,
      empty: false,
    });
  });

  it('lists five users waiting for a decision when the first five rows are provisioning (BG-11)', () => {
    const approved = [1, 2, 3, 4, 5].map((n) =>
      user(`e${String(n)}`, `Approved ${String(n)}`, 'PROVISIONING_IDP'),
    );
    const waiting = [1, 2, 3, 4, 5, 6].map((n) =>
      user(`f${String(n)}`, `Waiting ${String(n)}`, 'DRAFT'),
    );
    const view = pendingApprovalsView({
      ...READS,
      users: ok(page([...approved, ...waiting], 11)),
      userCounts: ok({ pending: 11, provisioning: 5 }),
      branches: null,
    });
    expect(view.rows.map((row) => row.name)).toEqual([
      'Waiting 1',
      'Waiting 2',
      'Waiting 3',
      'Waiting 4',
      'Waiting 5',
    ]);
    expect(view.provisioning).toBe(
      '5 identities are still being provisioned: approval already ran.',
    );
  });

  it.each([
    [0, 5],
    [1, 6],
    [5, 10],
    [95, 100],
    [400, 100],
  ])('with %i provisioning, reads a page of %i (at most 100)', (provisioning, size) => {
    expect(userPreviewSize(provisioning)).toBe(size);
  });
});
