import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { ApplicationContext } from '@/config/application-context';
import type { ProfileUser } from '@/modules/profile/profile-rules';

const { getSession, getOrganisationTimeZone, redirect, requireProfile } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getOrganisationTimeZone: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  requireProfile: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) as unknown }));
vi.mock('@/auth/auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSession(...args) as unknown } },
}));
vi.mock('@/lib/api/lookups', () => ({
  getOrganisationTimeZone: () => getOrganisationTimeZone() as unknown,
}));
vi.mock('@/modules/profile/profile-service', () => ({
  requireProfile: () => requireProfile() as unknown,
}));

const { default: ProfileOverviewPage } = await import('./page');

const USER: ProfileUser = {
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Jane Manager',
  email: 'jane@greenfield.example',
  roles: ['TENANT_ADMIN'],
  permissions: ['audit.view'],
  branches: [{ id: 'b-1', code: 'HEAD_OFFICE', name: 'Head Office', status: 'ACTIVE' }],
  organization: { id: 'org-1', name: 'Greenfield SACCO', code: 'greenfield', status: 'ACTIVE' },
  membershipStatus: 'ACTIVE',
  assignedRoles: [{ id: 'r-1', code: 'TENANT_ADMIN', name: 'Tenant admin', status: 'ACTIVE' }],
};
const TENANT: ApplicationContext = {
  module: { id: 'administration', name: 'Administration' },
  organization: { id: 'org-1', name: 'Greenfield SACCO' },
  branch: { id: 'b-1', name: 'Head Office' },
};
const SIGNED_IN = { session: { createdAt: new Date('2026-07-26T00:00:00.000Z') } };

describe('ProfileOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue(SIGNED_IN);
    getOrganisationTimeZone.mockResolvedValue('Africa/Nairobi');
  });

  it('shows identity and the active context, signed in at organisation time', async () => {
    requireProfile.mockResolvedValueOnce({ user: USER, context: TENANT });

    renderWithProviders(await ProfileOverviewPage());

    const identity = screen.getByRole('region', { name: 'Identity' });
    expect(identity).toHaveTextContent('Jane Manager');
    expect(within(identity).getByText('55555555')).toHaveAttribute('title', USER.id);
    expect(identity).toHaveTextContent('26 Jul 2026 · 03:00 (Africa/Nairobi)');
    const active = screen.getByRole('region', { name: 'Active context' });
    expect(active).toHaveTextContent('Administration');
    expect(active).toHaveTextContent('greenfield');
    expect(active).toHaveTextContent('Head Office');
  });

  it('uses UTC in the platform workspace without reading the tenant, and names All branches', async () => {
    requireProfile.mockResolvedValueOnce({
      user: USER,
      context: {
        module: { id: 'platform-administration', name: 'Platform Administration' },
        organization: { id: 'platform', name: 'Platform' },
        branch: null,
      },
    });

    renderWithProviders(await ProfileOverviewPage());

    expect(getOrganisationTimeZone).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Identity' })).toHaveTextContent(
      '26 Jul 2026 · 00:00 (UTC)',
    );
    expect(screen.getByRole('region', { name: 'Active context' })).toHaveTextContent(
      'All branches (institution level)',
    );
  });

  it('sends a vanished session to login', async () => {
    requireProfile.mockResolvedValueOnce({ user: USER, context: TENANT });
    getSession.mockResolvedValueOnce(null);

    await expect(ProfileOverviewPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login?reason=session_expired');
  });
});
