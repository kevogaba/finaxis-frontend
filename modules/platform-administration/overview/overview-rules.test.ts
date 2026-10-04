import { describe, expect, it } from 'vitest';
import type { TenantSummary } from '../tenants/tenant-contract';
import {
  activeInstitutionCount,
  attentionView,
  DRAFTS_HREF,
  PENDING_HREF,
  pendingApprovalNotifications,
  type AttentionRead,
} from './overview-rules';

const PLATFORM = '00000000-0000-0000-0000-000000000000';
const isPlatform = (id: string) => id === PLATFORM;
const tenant = (
  id: string,
  displayName: string,
  status: TenantSummary['status'],
): TenantSummary => ({
  id,
  tenantCode: displayName.toLowerCase().replace(/\s+/g, '-'),
  displayName,
  countryCode: 'KE',
  status,
  createdAt: '2026-09-03T08:00:00Z',
});
const page = (items: TenantSummary[], totalItems = items.length): AttentionRead => ({
  ok: true,
  value: {
    items,
    page: {
      number: 0,
      size: 5,
      totalItems,
      totalPages: Math.ceil(totalItems / 5),
      hasNext: totalItems > 5,
      hasPrevious: false,
    },
  },
});
const failed = (requestId: string | null): AttentionRead => ({ ok: false, problem: { requestId } });
const MWANGAZA = tenant(
  '16000000-0000-4000-8000-000000000003',
  'Mwangaza Savings SACCO',
  'PENDING_APPROVAL',
);
const UMOJA = tenant('16000000-0000-4000-8000-000000000001', 'Umoja Teachers SACCO', 'DRAFT');

describe('activeInstitutionCount', () => {
  it.each([
    [3, 2],
    [1, 0],
    [0, 0],
  ])('subtracts the platform organisation exactly once: %i → %i', (total, expected) => {
    expect(activeInstitutionCount(total)).toBe(expected);
  });
});

describe('attentionView', () => {
  it('lists pending rows, then drafts, with no failure and no empty state', () => {
    const view = attentionView(page([MWANGAZA]), page([UMOJA]), isPlatform);
    expect(view.rows.map((row) => row.displayName)).toEqual([
      'Mwangaza Savings SACCO',
      'Umoja Teachers SACCO',
    ]);
    expect(view).toMatchObject({ failures: [], more: [], empty: null });
  });

  it('never lists the platform organisation', () => {
    const platformRow = tenant(PLATFORM, 'Platform', 'PENDING_APPROVAL');
    expect(attentionView(page([platformRow, MWANGAZA]), page([]), isPlatform).rows).toEqual([
      MWANGAZA,
    ]);
  });

  it('links to the rest of each list when it holds more than the preview', () => {
    const view = attentionView(page([MWANGAZA], 7), page([UMOJA], 6), isPlatform);
    expect(view.more).toEqual([
      { href: PENDING_HREF, label: 'View all 7 institutions pending approval' },
      { href: DRAFTS_HREF, label: 'View all 6 drafts' },
    ]);
  });

  it('names each failed read with its reference, and keeps the other half', () => {
    const view = attentionView(failed('req-1'), page([UMOJA]), isPlatform);
    expect(view.failures).toEqual([
      "Institutions pending approval couldn't be loaded. Reference: req-1",
    ]);
    expect(view.rows).toEqual([UMOJA]);
    expect(view.empty).toBeNull();
    expect(attentionView(page([]), failed(null), isPlatform).failures).toEqual([
      "Drafts couldn't be loaded.",
    ]);
  });

  it.each([
    [
      'both empty',
      page([]),
      page([]),
      {
        title: 'Nothing needs attention',
        description: 'No institution is waiting for approval, and there are no drafts.',
      },
    ],
    [
      'no pending, drafts failed',
      page([]),
      failed('req-2'),
      { title: 'No institution is waiting for approval' },
    ],
    ['pending failed, no drafts', failed('req-3'), page([]), { title: 'There are no drafts' }],
    ['both failed', failed('req-4'), failed('req-5'), null],
  ] as const)(
    'claims only what it knows when nothing is listed (%s)',
    (_case, pending, drafts, empty) => {
      expect(attentionView(pending, drafts, isPlatform).empty).toEqual(empty);
    },
  );

  it('points the links at the filtered directory, oldest first', () => {
    const pending = new URL(PENDING_HREF, 'http://x').searchParams;
    expect([pending.get('status'), pending.get('sortBy'), pending.get('sortDir')]).toEqual([
      'PENDING_APPROVAL',
      'createdAt',
      'ASC',
    ]);
    expect(new URL(DRAFTS_HREF, 'http://x').searchParams.get('status')).toBe('DRAFT');
  });
});

describe('pendingApprovalNotifications', () => {
  it('counts institutions waiting for approval, with a link to them', () => {
    expect(pendingApprovalNotifications(2)).toEqual({
      label: 'Notifications: 2 institutions waiting for approval',
      total: 2,
      entries: [
        {
          id: 'pending-institutions',
          text: '2 institutions are waiting for approval.',
          href: PENDING_HREF,
          linkLabel: 'Review pending institutions',
        },
      ],
      emptyText: 'No institutions are waiting for approval.',
      unavailableText: "Pending approvals couldn't be loaded. Refresh to try again.",
    });
    expect(pendingApprovalNotifications(1).entries[0]?.text).toBe(
      '1 institution is waiting for approval.',
    );
    expect(pendingApprovalNotifications(1).label).toBe(
      'Notifications: 1 institution waiting for approval',
    );
  });

  it('reads none at zero, and never none after a failed read', () => {
    expect(pendingApprovalNotifications(0)).toMatchObject({
      label: 'Notifications: nothing waiting',
      total: 0,
      entries: [],
    });
    expect(pendingApprovalNotifications(null)).toMatchObject({
      label: "Notifications (couldn't be loaded)",
      total: null,
      entries: [],
    });
  });
});
