import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import {
  NO_USERS_WAITING,
  USER_APPROVAL_FORBIDDEN,
} from '@/modules/administration/approvals/approval-copy';
import { USER_QUEUE_LABEL } from '@/modules/administration/approvals/approval-rules';
import { renderWithProviders } from '@/test/test-utils';

const { getCurrentContextProfile, listUserApprovals, redirect } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  listUserApprovals: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (to: string) => redirect(to) as unknown,
  usePathname: () => '/admin/approvals/users',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/modules/administration/approvals/approval-service', () => ({
  listUserApprovals: (...args: unknown[]) => listUserApprovals(...args) as unknown,
}));

const { default: UserOnboardingPage } = await import('./page');

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const ROSE = 'a1000000-0000-4000-8000-0000000000a1';
const USHA = 'a5000000-0000-4000-8000-0000000000a5';
const CODES = ['user.approve', 'user.view'];

function users(totalItems: number, number = 0) {
  return {
    items:
      totalItems === 0
        ? []
        : [
            {
              id: USHA,
              username: 'usha.patel',
              email: 'usha.patel@greenfield.example',
              displayName: 'Usha Patel',
              userStatus: 'SUSPENDED',
              membershipStatus: 'PENDING_APPROVAL',
            },
            {
              id: ROSE,
              username: 'rose.atieno',
              email: 'rose.atieno@greenfield.example',
              displayName: 'Rose Atieno',
              userStatus: 'DRAFT',
              membershipStatus: 'PENDING_APPROVAL',
            },
          ],
    page: {
      number,
      size: 10,
      totalItems,
      totalPages: Math.ceil(totalItems / 10),
      hasNext: false,
      hasPrevious: number > 0,
    },
  };
}

function setup(permissions = CODES) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { permissions },
    context: { organization: { id: 'org-1', name: 'Greenfield' }, branch: null },
  });
}

const show = async (searchParams: Record<string, string> = {}) =>
  renderWithProviders(await UserOnboardingPage({ searchParams: Promise.resolve(searchParams) }));

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('UserOnboardingPage', () => {
  it('lists pending memberships, each linking to its approval page, in a named scroll region', async () => {
    setup();
    listUserApprovals.mockResolvedValue(users(2));
    await show({ page: '0', size: '20' });

    expect(listUserApprovals).toHaveBeenCalledExactlyOnceWith({ page: 0, size: 20 });
    const card = screen.getByRole('region', { name: USER_QUEUE_LABEL });
    const table = within(card).getByRole('region', { name: 'Users table' });
    expect(table).toHaveAttribute('tabindex', '0');
    expect(within(table).getByRole('link', { name: 'Rose Atieno' })).toHaveAttribute(
      'href',
      `/admin/approvals/users/${ROSE}`,
    );
    expect(within(table).getByText('Account suspended')).toBeInTheDocument();
  });

  it('says nothing is waiting, never an empty table', async () => {
    setup();
    listUserApprovals.mockResolvedValue(users(0));
    await show();

    expect(screen.getByText(NO_USERS_WAITING)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Users table' })).toBeNull();
  });

  it('reads nothing without both codes, and says why', async () => {
    setup(['user.approve']);
    await show();

    expect(screen.getByText(USER_APPROVAL_FORBIDDEN)).toBeInTheDocument();
    expect(listUserApprovals).not.toHaveBeenCalled();
  });

  it('tells a 403 from a failure, keeping the reference (never an empty queue)', async () => {
    setup();
    listUserApprovals.mockRejectedValueOnce(new BackendApiError(403, { code: 'forbidden' }));
    const { unmount } = await show();
    expect(screen.getByText("You don't have permission")).toBeInTheDocument();
    expect(screen.queryByText(NO_USERS_WAITING)).toBeNull();
    unmount();

    listUserApprovals.mockRejectedValueOnce(new BackendApiError(503, { requestId: 'req-7' }));
    await show();
    expect(screen.getByText('Reference: req-7')).toBeInTheDocument();
    expect(screen.queryByText(NO_USERS_WAITING)).toBeNull();
  });

  it.each([
    ['a 401', new BackendApiError(401), '/login?reason=session_expired'],
    [
      'a stale context',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      '/select-context',
    ],
  ])('redirects on %s', async (_case, error, to) => {
    setup();
    listUserApprovals.mockRejectedValue(error);
    await expect(show()).rejects.toThrow(`NEXT_REDIRECT:${to}`);
  });

  it('sends a page past the end to the last page, keeping the size', async () => {
    setup();
    listUserApprovals.mockResolvedValue({ ...users(12, 4), items: [] });
    await expect(show({ page: '4', size: '10' })).rejects.toThrow(
      'NEXT_REDIRECT:/admin/approvals/users?page=1&size=10',
    );
  });
});
