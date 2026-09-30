import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { BackendApiError } from '@/auth/backend-api';
import type { RecordAuditView } from './record-audit-tab';

const { listAuditEvents, redirect, router } = vi.hoisted(() => ({
  listAuditEvents: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    redirect: (to: string) => redirect(to) as unknown,
    usePathname: () => '/admin/users/u1/audit',
    useRouter: () => router,
    useSearchParams: () => new URLSearchParams(),
  };
});
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('../audit-service', () => ({
  listAuditEvents: (...args: unknown[]) => listAuditEvents(...args) as unknown,
}));
vi.mock('@/lib/api/lookups', () => ({
  getOrganisationTimeZone: () => Promise.resolve('Africa/Nairobi'),
  getBranchIndex: () => Promise.resolve(new Map()),
  resolveUserNames: () =>
    Promise.resolve(new Map([['66666666-6666-4666-8666-666666666666', 'Mary Wanjiku']])),
}));

const { RecordAuditTab } = await import('./record-audit-tab');

const USER_ID = '66666666-6666-4666-8666-666666666666';
const MEMBERSHIP_ID = '33333333-3333-4333-8333-333333333333';
const PATH = '/admin/users/u1/audit';
const VIEWS: readonly [RecordAuditView, ...RecordAuditView[]] = [
  { value: 'user', label: 'User record', filter: { entityType: 'USER', entityId: USER_ID } },
  {
    value: 'membership',
    label: 'Membership',
    filter: { entityType: 'MEMBERSHIP', entityId: MEMBERSHIP_ID },
  },
  { value: 'performed', label: 'Performed by', filter: { actorId: USER_ID } },
];
const EVENT = {
  id: 'e1',
  occurredAt: '2026-09-07T07:59:00Z',
  actorType: 'USER',
  actorUserId: USER_ID,
  branchId: null,
  action: 'user.invite',
  entityType: 'USER',
  entityId: USER_ID,
  outcome: 'SUCCESS',
  severity: 'INFO',
  reason: null,
};

function pageOf(items: unknown[], page: Record<string, number | boolean> = {}) {
  return {
    items,
    page: {
      number: 0,
      size: 20,
      totalItems: items.length,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
      ...page,
    },
  };
}

describe('RecordAuditTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the default view with a view toggle and links into the audit trail', async () => {
    listAuditEvents.mockResolvedValueOnce(pageOf([EVENT]));

    renderWithProviders(
      await RecordAuditTab({ views: VIEWS, params: new URLSearchParams(), path: PATH }),
    );

    expect(listAuditEvents).toHaveBeenCalledWith({
      page: 0,
      size: 20,
      entityType: 'USER',
      entityId: USER_ID,
    });
    expect(screen.getByRole('region', { name: 'Audit trail' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'User record' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('link', { name: 'View event: Invited user, 07 Sep 2026 10:59' }),
    ).toHaveAttribute('href', `/admin/audit?entityType=USER&entityId=${USER_ID}&event=e1`);
  });

  it('reads the view and page from the URL, falling back to the first view for an unknown one', async () => {
    listAuditEvents.mockResolvedValueOnce(
      pageOf([EVENT], { number: 1, totalItems: 21, totalPages: 2, hasPrevious: true }),
    );
    renderWithProviders(
      await RecordAuditTab({
        views: VIEWS,
        params: new URLSearchParams('view=performed&page=1'),
        path: PATH,
      }),
    );
    expect(listAuditEvents).toHaveBeenLastCalledWith({ page: 1, size: 20, actorId: USER_ID });
    expect(
      screen.getByRole('link', { name: 'View event: Invited user, 07 Sep 2026 10:59' }),
    ).toHaveAttribute('href', `/admin/audit?actorId=${USER_ID}&event=e1`);

    listAuditEvents.mockResolvedValueOnce(pageOf([]));
    await RecordAuditTab({ views: VIEWS, params: new URLSearchParams('view=bogus'), path: PATH });
    expect(listAuditEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityType: 'USER', entityId: USER_ID }),
    );
  });

  it('shows no toggle for a single view and an empty state with no events', async () => {
    listAuditEvents.mockResolvedValueOnce(pageOf([]));
    const [onlyView] = VIEWS;

    renderWithProviders(
      await RecordAuditTab({
        views: [onlyView],
        params: new URLSearchParams(),
        path: PATH,
        title: 'Activity',
      }),
    );

    expect(screen.getByRole('region', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.getByText('No audit events')).toBeInTheDocument();
  });

  it('keeps the section and shows a forbidden state for a 403', async () => {
    listAuditEvents.mockRejectedValueOnce(new BackendApiError(403, { code: 'forbidden' }));

    renderWithProviders(
      await RecordAuditTab({ views: VIEWS, params: new URLSearchParams(), path: PATH }),
    );

    expect(screen.getByRole('region', { name: 'Audit trail' })).toBeInTheDocument();
    expect(screen.getByText("You don't have permission")).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('keeps the section and shows a safe error for a 500', async () => {
    listAuditEvents.mockRejectedValueOnce(new BackendApiError(500, { requestId: 'req-1' }));

    renderWithProviders(
      await RecordAuditTab({ views: VIEWS, params: new URLSearchParams(), path: PATH }),
    );

    expect(screen.getByRole('region', { name: 'Audit trail' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('redirects a page past the end to the last page, keeping the view', async () => {
    listAuditEvents.mockResolvedValueOnce(pageOf([], { number: 5, totalItems: 21, totalPages: 2 }));

    await expect(
      RecordAuditTab({
        views: VIEWS,
        params: new URLSearchParams('view=membership&page=5'),
        path: PATH,
      }),
    ).rejects.toThrow(`NEXT_REDIRECT:${PATH}?view=membership&page=1`);
  });
});
