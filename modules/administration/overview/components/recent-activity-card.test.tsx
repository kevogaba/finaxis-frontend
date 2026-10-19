import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import type { Page } from '@/lib/api/wire';
import type { AuditEvent } from '@/modules/administration/audit/audit-contract';
import { renderWithProviders } from '@/test/test-utils';

const reads = vi.hoisted(() => ({
  getOrganisationTimeZone: vi.fn<() => Promise<string>>(),
  listRecentActivity: vi.fn<() => Promise<Page<AuditEvent>>>(),
  resolveUserNames: vi.fn<(ids: readonly string[]) => Promise<ReadonlyMap<string, string>>>(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/lib/api/lookups', () => ({
  getOrganisationTimeZone: () => reads.getOrganisationTimeZone(),
  resolveUserNames: (ids: readonly string[]) => reads.resolveUserNames(ids),
}));
vi.mock('../overview-service', () => ({
  listRecentActivity: () => reads.listRecentActivity(),
}));

const { RecentActivitySection } = await import('./recent-activity-card');

const JANE = '14d10000-0000-4000-8000-0000000000aa';
const REFERENCE = '14a40000-0000-4000-8000-0000000000aa';

const event = (tail: string, action: string, actorUserId: string | null): AuditEvent => ({
  id: `14f10000-0000-4000-8000-0000000000${tail}`,
  occurredAt: '2026-09-07T07:59:00Z',
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

function page(items: AuditEvent[]): Page<AuditEvent> {
  return {
    items,
    page: { number: 0, size: 5, totalItems: 30, totalPages: 6, hasNext: true, hasPrevious: false },
  };
}

async function show(names = true, timeZone = true) {
  return renderWithProviders(<>{await RecentActivitySection({ names, timeZone })}</>);
}

const card = () => screen.getByRole('region', { name: 'Recent activity' });

beforeEach(() => {
  vi.resetAllMocks();
  reads.getOrganisationTimeZone.mockResolvedValue('Africa/Nairobi');
  reads.resolveUserNames.mockResolvedValue(new Map([[JANE, 'Backend Jane Manager']]));
});

describe('RecentActivitySection', () => {
  it('lists the latest events by action, actor and time, each opening in the audit trail', async () => {
    reads.listRecentActivity.mockResolvedValue(
      page([event('a1', 'user.invite', JANE), event('a2', 'cob.start', null)]),
    );
    await show();

    expect(reads.resolveUserNames).toHaveBeenCalledExactlyOnceWith([JANE]);
    expect(card()).toHaveTextContent('The latest events. Times in Africa/Nairobi.');
    const rows = within(within(card()).getByRole('list', { name: 'Latest events' })).getAllByRole(
      'listitem',
    );
    expect(rows.map((row) => row.textContent)).toEqual([
      'Invited userBackend Jane Manager · 07 Sep 2026 · 10:59',
      'Started close of businessSystem · 07 Sep 2026 · 10:59',
    ]);
    expect(
      within(card()).getByRole('link', { name: 'View event: Invited user, 07 Sep 2026 10:59' }),
    ).toHaveAttribute('href', '/admin/audit?event=14f10000-0000-4000-8000-0000000000a1');
    expect(within(card()).getByRole('link', { name: 'View all activity' })).toHaveAttribute(
      'href',
      '/admin/audit',
    );
  });

  it('names no actor without user.view: a short id, and no name read', async () => {
    reads.listRecentActivity.mockResolvedValue(page([event('a1', 'user.invite', JANE)]));
    await show(false, true);

    expect(reads.resolveUserNames).not.toHaveBeenCalled();
    expect(within(card()).getByRole('listitem')).toHaveTextContent(
      'Invited user14d10000 · 07 Sep 2026 · 10:59',
    );
  });

  it("reads no timezone without tenant.view: the times are UTC's", async () => {
    reads.listRecentActivity.mockResolvedValue(page([event('a1', 'user.invite', JANE)]));
    await show(true, false);

    expect(reads.getOrganisationTimeZone).not.toHaveBeenCalled();
    expect(card()).toHaveTextContent('The latest events. Times in UTC.');
    expect(within(card()).getByRole('listitem')).toHaveTextContent(
      'Invited userBackend Jane Manager · 07 Sep 2026 · 07:59',
    );
  });

  it('never names its link after the audit trail, which the navigation item owns', async () => {
    reads.listRecentActivity.mockResolvedValue(page([event('a1', 'user.invite', JANE)]));
    await show();

    expect(screen.queryByRole('link', { name: /audit trail/i })).toBeNull();
  });

  it('says when nothing has been recorded', async () => {
    reads.listRecentActivity.mockResolvedValue(page([]));
    await show();

    expect(card()).toHaveTextContent('Nothing has been recorded yet.');
    expect(within(card()).queryByRole('list')).toBeNull();
  });

  it('shows a failed read with its reference, and resolves no names', async () => {
    reads.listRecentActivity.mockRejectedValue(new BackendApiError(503, { requestId: REFERENCE }));
    await show();

    expect(within(card()).getByRole('alert')).toHaveTextContent(`Reference: ${REFERENCE}`);
    expect(reads.resolveUserNames).not.toHaveBeenCalled();
  });

  it.each([
    ['a lost session to sign-in', new BackendApiError(401), ';/login?reason=session_expired;'],
    [
      'a stale context to context selection',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      ';/select-context;',
    ],
  ])('sends %s instead of showing a failure', async (_case, error, digest) => {
    reads.listRecentActivity.mockRejectedValue(error);
    await expect(RecentActivitySection({ names: true, timeZone: true })).rejects.toMatchObject({
      digest: expect.stringContaining(digest) as unknown,
    });
  });
});
