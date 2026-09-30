import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import type { ApplicationContext } from '@/config/application-context';
import type { ProfileUser } from '@/modules/profile/profile-rules';
import { renderWithProviders } from '@/test/test-utils';

const { listMyOrganisations, redirect, requireProfile, router } = vi.hoisted(() => ({
  listMyOrganisations: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  requireProfile: vi.fn(),
  // One stable router object, as in table-pagination-bar.test.tsx.
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => {
  // The real `unstable_rethrow` for load(), plus the pagination bar's hooks outside an app router.
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    redirect: (to: string) => redirect(to) as unknown,
    usePathname: () => '/profile/contexts',
    useRouter: () => router,
    useSearchParams: () => new URLSearchParams(),
  };
});
vi.mock('@/config/env.server', () => ({
  serverEnv: { PLATFORM_ORGANISATION_ID: 'platform-org' },
}));
vi.mock('@/modules/profile/components/switch-context-button', () => ({
  SwitchContextButton: () => <button type="button">Switch context</button>,
}));
vi.mock('@/modules/profile/profile-service', () => ({
  listMyOrganisations: (...args: unknown[]) => listMyOrganisations(...args) as unknown,
  requireProfile: () => requireProfile() as unknown,
}));

const { default: ProfileContextsPage } = await import('./page');

const USER: ProfileUser = {
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Jane Manager',
  email: 'jane@greenfield.example',
  roles: [],
  permissions: [],
  branches: [
    { id: 'b-1', code: 'HEAD_OFFICE', name: 'Head Office', status: 'ACTIVE' },
    { id: 'b-2', code: 'WESTLANDS', name: 'Westlands Branch', status: 'SUSPENDED' },
  ],
  organization: { id: 'org-1', name: 'Greenfield SACCO', code: 'greenfield', status: 'ACTIVE' },
  membershipStatus: 'ACTIVE',
  assignedRoles: [],
};
const TENANT: ApplicationContext = {
  module: { id: 'administration', name: 'Administration' },
  organization: { id: 'org-1', name: 'Greenfield SACCO' },
  branch: { id: 'b-1', name: 'Head Office' },
};
const ORGANISATIONS = [
  { id: 'org-1', code: 'greenfield', name: 'Greenfield SACCO', membershipStatus: 'ACTIVE' },
  { id: 'org-2', code: 'lakeside', name: 'Lakeside SACCO', membershipStatus: 'ACTIVE' },
];
const FIRST_PAGE = {
  number: 0,
  size: 10,
  totalItems: 2,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
};
// BG-23: 21 memberships counted, then filtered after paging.
const OVERCOUNTED = { size: 20, totalItems: 21, totalPages: 2, hasNext: false, hasPrevious: true };
const render = async (query: Record<string, string> = {}) => {
  renderWithProviders(await ProfileContextsPage({ searchParams: Promise.resolve(query) }));
};

describe('ProfileContextsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireProfile.mockResolvedValue({ user: USER, context: TENANT });
  });

  it('reads the URL page and marks the current organisation and branch', async () => {
    listMyOrganisations.mockResolvedValueOnce({ items: ORGANISATIONS, page: FIRST_PAGE });

    await render();

    expect(listMyOrganisations).toHaveBeenCalledWith({ page: 0, size: 10 });
    const organisations = screen.getByRole('table', { name: 'Organisations' });
    expect(within(organisations).getByRole('row', { name: /Greenfield SACCO/ })).toHaveTextContent(
      'Current',
    );
    expect(
      within(organisations).getByRole('row', { name: /Lakeside SACCO/ }),
    ).not.toHaveTextContent('Current');
    const branches = screen.getByRole('table', { name: 'Branches in Greenfield SACCO' });
    expect(within(branches).getByRole('row', { name: /Head Office/ })).toHaveTextContent('Current');
    expect(within(branches).getByRole('row', { name: /Westlands Branch/ })).not.toHaveTextContent(
      'Current',
    );
  });

  it('shows the safe error state with its support reference when the read fails', async () => {
    listMyOrganisations.mockRejectedValueOnce(new BackendApiError(503, { requestId: 'req-1' }));

    await render();

    const organisations = screen.getByRole('region', { name: 'Organisations' });
    expect(within(organisations).getByRole('alert')).toHaveTextContent('req-1');
    // Branches come from /auth/me, not this read, so they still render.
    expect(screen.getByRole('table', { name: 'Branches in Greenfield SACCO' })).toBeInTheDocument();
  });

  it('sends a page past the end to the last page, keeping the size', async () => {
    listMyOrganisations.mockResolvedValueOnce({ items: [], page: { ...OVERCOUNTED, number: 5 } });

    await expect(render({ page: '5', size: '20' })).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/profile/contexts?size=20&page=1');
  });

  it('explains an empty in-range page and keeps the pagination bar (BG-23)', async () => {
    listMyOrganisations.mockResolvedValueOnce({ items: [], page: { ...OVERCOUNTED, number: 1 } });

    await render({ page: '1', size: '20' });

    expect(redirect).not.toHaveBeenCalled();
    const organisations = screen.getByRole('region', { name: 'Organisations' });
    expect(organisations).toHaveTextContent('No organisations on this page');
    expect(within(organisations).queryByRole('table')).not.toBeInTheDocument();
    expect(within(organisations).getByRole('button', { name: /previous page/i })).toBeEnabled();
  });
});
