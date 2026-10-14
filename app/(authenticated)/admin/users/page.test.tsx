import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import { INVITE_CODES } from '@/modules/administration/users/invite-rules';
import { renderWithProviders } from '@/test/test-utils';

const { getCurrentContextProfile, listUsers, redirect } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  listUsers: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => {
  // The real `unstable_rethrow` for load(), plus the list kit's hooks outside an app router.
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    redirect: (to: string) => redirect(to) as unknown,
    usePathname: () => '/admin/users',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
});
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  listUsers: (...args: unknown[]) => listUsers(...args) as unknown,
}));

const { default: UsersPage } = await import('./page');

const resolved = (permissions: readonly string[]) => ({
  kind: 'resolved',
  profile: { permissions },
  context: { organization: { id: 'org-1', name: 'Greenfield SACCO' }, branch: null },
});

const EMPTY = {
  items: [],
  page: { number: 0, size: 10, totalItems: 0, totalPages: 0, hasNext: false, hasPrevious: false },
};

const render = async () => {
  renderWithProviders(await UsersPage({ searchParams: Promise.resolve({}) }));
};

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
  listUsers.mockResolvedValue(EMPTY);
});

describe('UsersPage: the Invite user entry (Ruling 4)', () => {
  it('links to the wizard for a holder of every code it needs', async () => {
    getCurrentContextProfile.mockResolvedValue(resolved(INVITE_CODES));
    await render();
    expect(screen.getByRole('link', { name: 'Invite user' })).toHaveAttribute(
      'href',
      '/admin/users/new',
    );
  });

  it.each(INVITE_CODES)('is not offered without %s', async (missing) => {
    getCurrentContextProfile.mockResolvedValue(
      resolved(INVITE_CODES.filter((code) => code !== missing)),
    );
    await render();
    expect(screen.getByRole('heading', { level: 1, name: 'Users & access' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Invite user' })).toBeNull();
  });

  it('is not offered for an unresolved context', async () => {
    getCurrentContextProfile.mockResolvedValue({
      kind: 'redirect-to-context-selection',
      reason: 'invalid-context',
    });
    await render();
    expect(screen.getByRole('heading', { level: 1, name: 'Users & access' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Invite user' })).toBeNull();
  });

  it('lets a failed profile read reach the error boundary, never hiding the entry silently', async () => {
    getCurrentContextProfile.mockRejectedValue(new Error('profile read failed'));
    await expect(UsersPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'profile read failed',
    );
  });

  it('stays in the header when the directory read fails', async () => {
    getCurrentContextProfile.mockResolvedValue(resolved(INVITE_CODES));
    listUsers.mockRejectedValueOnce(new BackendApiError(503, { requestId: 'req-4' }));
    await render();
    expect(screen.getByText(/Reference: req-4/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Invite user' })).toBeInTheDocument();
  });
});
