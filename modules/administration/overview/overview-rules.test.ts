import { describe, expect, it } from 'vitest';
import type { Page } from '@/lib/api/wire';
import type { AuditEvent } from '@/modules/administration/audit/audit-contract';
import type { BranchSummary } from '@/modules/administration/branches/branch-contract';
import type { UserSummary } from '@/modules/administration/users/user-contract';
import {
  activityDescription,
  activityRows,
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
  membershipId: '20000000-0000-4000-8000-000000000001',
  membershipType: 'STAFF',
  createdAt: '2026-07-01T08:00:00Z',
  membershipCreatedAt: '2026-07-01T08:00:00Z',
  createdBy: null,
});

const branch = (tail: string, name: string, code: string): BranchSummary => ({
  id: `14c00000-0000-4000-8000-0000000000${tail}`,
  branchCode: code,
  branchName: name,
  branchType: 'OPERATIONS',
  status: 'PENDING_APPROVAL',
  createdAt: '2026-09-15T08:00:00Z',
  createdBy: null,
  submittedBy: null,
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
};

describe('which cards a holder sees (Ruling 2)', () => {
  const ALL = [
    'business_date.view',
    'user.approve',
    'user.view',
    'branch.approve',
    'branch.view',
    'settings.view',
    'membership.view',
    'audit.view',
    'tenant.view',
  ];

  it('shows every card to a holder of every code', () => {
    const cards = overviewCards({ permissions: ALL, tenantPermissions: ALL });
    expect(cards).toEqual({
      businessDate: true,
      approvals: { users: true, branches: true },
      readiness: true,
      activity: { names: true, timeZone: true },
    });
    expect(noOverviewCards(cards)).toBe(false);
  });

  it('reads the actors and the timezone only with their own codes (rule 5)', () => {
    expect(
      overviewCards({ permissions: ['audit.view'], tenantPermissions: ['audit.view'] }).activity,
    ).toEqual({
      names: false,
      timeZone: false,
    });
    const reader = ['audit.view', 'user.view'];
    expect(overviewCards({ permissions: reader, tenantPermissions: reader }).activity).toEqual({
      names: true,
      timeZone: false,
    });
  });

  // GET /tenant/users and /tenant/users/{id} check user.view tenant-wide (BG-33).
  it('reads no names and no user requests while user.view is held only at branch scope', () => {
    const cards = overviewCards({
      permissions: ALL,
      tenantPermissions: ['audit.view', 'tenant.view', 'branch.approve', 'branch.view'],
    });
    expect(cards.activity).toEqual({ names: false, timeZone: true });
    expect(cards.approvals).toEqual({ users: false, branches: true });
  });

  // The business date, audit and institution reads are checked tenant-wide too (BG-33).
  it('omits the business date and activity cards while their reads are held only at branch scope', () => {
    const cards = overviewCards({ permissions: ALL, tenantPermissions: [] });
    expect(cards.businessDate).toBe(false);
    expect(cards.activity).toBeNull();
  });

  it('offers each kind of request only with both of its codes', () => {
    expect(overviewCards({ permissions: ['user.approve', 'branch.view'] }).approvals).toBeNull();
    const codes = ['branch.approve', 'branch.view', 'user.view'];
    expect(overviewCards({ permissions: codes, tenantPermissions: codes }).approvals).toEqual({
      users: false,
      branches: true,
    });
  });

  // A pending branch grants no branch-scoped permission (platform #242, BG-03).
  it('offers no branch requests to an approver whose grant is branch-scoped', () => {
    expect(
      overviewCards({
        permissions: ['branch.approve', 'branch.view'],
        tenantPermissions: ['branch.view'],
      }).approvals,
    ).toBeNull();
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
      const holder = { permissions: [code], tenantPermissions: [code] };
      expect(noOverviewCards(overviewCards(holder)), code).toBe(false);
    }
    expect(noOverviewCards(overviewCards({ permissions: ['branch.approve', 'branch.view'] }))).toBe(
      false,
    );
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
    expect(view.provisioning).toBe(
      '1 identity is still being provisioned: approval already ran. If provisioning failed, it can be retried from their user record.',
    );
    expect(view.empty).toBe(false);
    expect(view.failures).toEqual([]);
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
      '5 identities are still being provisioned: approval already ran. If provisioning failed, it can be retried from their user record.',
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

describe('the Recent activity rows', () => {
  const event = (tail: string, action: string, actorUserId: string | null): AuditEvent => ({
    id: `14f00000-0000-4000-8000-0000000000${tail}`,
    occurredAt: '2026-09-08T06:00:00Z',
    actorType: actorUserId ? 'USER' : 'SYSTEM',
    actorUserId,
    branchId: null,
    action,
    entityType: 'USER',
    entityId: null,
    outcome: 'SUCCESS',
    severity: 'INFO',
    reason: null,
  });
  const JANE = '14d00000-0000-4000-8000-0000000000aa';
  const UNKNOWN = '14d00000-0000-4000-8000-0000000000bb';

  it('names the action and the actor, in the organisation timezone, linking to the event', () => {
    const rows = activityRows(
      [
        event('a1', 'user.welcome_email', null),
        event('a2', 'user.invite', JANE),
        event('a3', 'branch.create_draft', UNKNOWN),
      ],
      new Map([[JANE, 'Backend Jane Manager']]),
      'Africa/Nairobi',
    );
    expect(rows[0]).toEqual({
      id: '14f00000-0000-4000-8000-0000000000a1',
      action: 'Sent welcome email',
      actor: 'System',
      when: '08 Sep 2026 · 09:00',
      href: '/admin/audit?event=14f00000-0000-4000-8000-0000000000a1',
      linkLabel: 'View event: Sent welcome email, 08 Sep 2026 09:00',
    });
    expect(rows.map((row) => row.actor)).toEqual(['System', 'Backend Jane Manager', '14d00000']);
  });

  it('says which timezone the times are in', () => {
    expect(activityDescription('UTC')).toBe('The latest events. Times in UTC.');
  });
});
