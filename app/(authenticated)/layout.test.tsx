import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { REQUEST_PATHNAME_HEADER } from '@/auth/auth.types';

const { profileToFinaxisUser, renderedShell } = vi.hoisted(() => ({
  profileToFinaxisUser: vi.fn((profile: Record<string, unknown>, _fallbackUser: unknown) => {
    return {
      branches: [{ id: 'branch-1', name: 'Headquarters' }],
      email: profile.email,
      id: profile.user_id,
      image: undefined,
      name: profile.full_name,
      organization: { id: 'organisation-1', name: 'Finaxis Holdings' },
      permissions: (profile.permissions as string[] | undefined) ?? [],
      roles: ['Branch Teller'],
      username: undefined,
    };
  }),
  renderedShell: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: () => undefined })),
  headers: vi.fn(() => new Headers()),
}));

vi.mock('@/config/env.server', () => ({
  serverEnv: { PLATFORM_ORGANISATION_ID: 'platform-org' },
}));

const getAuthenticatedUser = vi.fn();
vi.mock('@/auth/get-authenticated-user', () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUser(...args) as unknown,
}));

const getCurrentContextProfile = vi.fn();
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: (...args: unknown[]) => getCurrentContextProfile(...args) as unknown,
  profileToFinaxisUser: (profile: Record<string, unknown>, fallbackUser: unknown) =>
    profileToFinaxisUser(profile, fallbackUser) as unknown,
}));

vi.mock('@/modules/administration/business-date/components/business-date-indicator', () => ({
  BusinessDateIndicator: () => null,
}));

vi.mock('@/components/shell/app-shell', () => ({
  AppShell: ({
    children,
    context,
    initialNavCollapsed,
    platformOrganisationId,
    user,
    businessDate,
    notifications,
  }: {
    children: React.ReactNode;
    context: unknown;
    initialNavCollapsed: boolean;
    platformOrganisationId: unknown;
    user: unknown;
    businessDate: unknown;
    notifications: unknown;
  }) => {
    renderedShell({
      context,
      initialNavCollapsed,
      platformOrganisationId,
      user,
      businessDate,
      notifications,
    });
    return children;
  },
}));

const { default: AuthenticatedLayout } = await import('./layout');

describe('AuthenticatedLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when a session is present', async () => {
    const user = {
      id: 'user-1',
      name: 'Jane Muthoni',
      email: 'jane.muthoni@finaxis.test',
      roles: [],
      branches: [],
    };
    getAuthenticatedUser.mockResolvedValueOnce(user);
    const profile = {
      branches: [{ id: 'branch-1', code: 'HQ', name: 'Headquarters', status: 'ACTIVE' }],
      email: 'backend.jane@finaxis.test',
      full_name: 'Jane Backend',
      keycloak_subject: 'keycloak-subject',
      membership: { id: 'membership-1', status: 'ACTIVE' },
      organisation: {
        code: 'FINAXIS',
        id: 'organisation-1',
        name: 'Finaxis Holdings',
        status: 'ACTIVE',
      },
      permissions: [],
      roles: [{ id: 'role-1', code: 'BRANCH_TELLER', name: 'Branch Teller', status: 'ACTIVE' }],
      selected_branch: { id: 'branch-1', code: 'HQ', name: 'Headquarters', status: 'ACTIVE' },
      user_id: 'backend-user-1',
    };
    getCurrentContextProfile.mockResolvedValueOnce({
      context: {
        branch: { id: 'branch-1', name: 'Headquarters' },
        module: { id: 'administration', name: 'Administration' },
        organization: { id: 'organisation-1', name: 'Finaxis Holdings' },
      },
      kind: 'resolved',
      profile,
    });

    const ui = await AuthenticatedLayout({ children: <div>Protected content</div> });
    render(ui);

    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
    expect(renderedShell).toHaveBeenCalledWith({
      context: {
        branch: { id: 'branch-1', name: 'Headquarters' },
        module: { id: 'administration', name: 'Administration' },
        organization: { id: 'organisation-1', name: 'Finaxis Holdings' },
      },
      initialNavCollapsed: false,
      platformOrganisationId: 'platform-org',
      user: {
        branches: [{ id: 'branch-1', name: 'Headquarters' }],
        email: 'backend.jane@finaxis.test',
        id: 'backend-user-1',
        image: undefined,
        name: 'Jane Backend',
        organization: { id: 'organisation-1', name: 'Finaxis Holdings' },
        permissions: [],
        roles: ['Branch Teller'],
        username: undefined,
      },
      businessDate: null,
      notifications: expect.objectContaining({
        administration: expect.anything(),
        'platform-administration': expect.anything(),
      }),
    });
    expect(profileToFinaxisUser).toHaveBeenCalledWith(profile, user);
  });

  it.each([
    ['administration', ['business_date.view'], true],
    ['administration', [], false],
    ['platform-administration', ['business_date.view'], false],
  ])('module %s with %j shows the business date: %s', async (moduleId, permissions, shown) => {
    getAuthenticatedUser.mockResolvedValueOnce({
      id: 'user-1',
      name: 'Jane Muthoni',
      email: 'jane.muthoni@finaxis.test',
      roles: [],
      branches: [],
    });
    getCurrentContextProfile.mockResolvedValueOnce({
      kind: 'resolved',
      context: {
        branch: null,
        module: { id: moduleId, name: 'Workspace' },
        organization: { id: 'organisation-1', name: 'Finaxis Holdings' },
      },
      profile: {
        user_id: 'u',
        full_name: 'Jane',
        email: 'j@x',
        branches: [],
        roles: [],
        permissions,
      },
    });

    render(await AuthenticatedLayout({ children: <div /> }));

    const props = renderedShell.mock.calls[0]?.[0] as { businessDate: unknown };
    expect(props.businessDate !== null).toBe(shown);
  });

  it('redirects to /login with reason=session_expired when there is no session', async () => {
    getAuthenticatedUser.mockResolvedValueOnce(null);

    await expect(AuthenticatedLayout({ children: <div>Protected content</div> })).rejects.toThrow(
      'NEXT_REDIRECT',
    );

    expect(redirect).toHaveBeenCalledWith('/login?reason=session_expired');
    expect(getCurrentContextProfile).not.toHaveBeenCalled();
    expect(renderedShell).not.toHaveBeenCalled();
  });

  it('redirects to context selection without rendering the shell when no valid context resolves', async () => {
    getAuthenticatedUser.mockResolvedValueOnce({
      id: 'user-1',
      name: 'Jane Muthoni',
      email: 'jane.muthoni@finaxis.test',
      roles: [],
      branches: [],
    });
    getCurrentContextProfile.mockResolvedValueOnce({
      kind: 'redirect-to-context-selection',
      reason: 'missing-context-token',
    });

    await expect(AuthenticatedLayout({ children: <div>Protected content</div> })).rejects.toThrow(
      'NEXT_REDIRECT',
    );

    expect(redirect).toHaveBeenCalledWith('/select-context');
    expect(renderedShell).not.toHaveBeenCalled();
  });

  it('preserves the originally requested path through context selection', async () => {
    vi.mocked(headers).mockResolvedValueOnce(
      new Headers({ [REQUEST_PATHNAME_HEADER]: '/admin/users' }),
    );
    getAuthenticatedUser.mockResolvedValueOnce({
      id: 'user-1',
      name: 'Jane Muthoni',
      email: 'jane.muthoni@finaxis.test',
      roles: [],
      branches: [],
    });
    getCurrentContextProfile.mockResolvedValueOnce({
      kind: 'redirect-to-context-selection',
      reason: 'missing-context-token',
    });

    await expect(AuthenticatedLayout({ children: <div>Protected content</div> })).rejects.toThrow(
      'NEXT_REDIRECT',
    );

    expect(redirect).toHaveBeenCalledWith('/select-context?next=%2Fadmin%2Fusers');
  });

  it('passes a collapsed rail preference from the cookie', async () => {
    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValueOnce({
      get: (name: string) => (name === 'finaxis_nav' ? { name, value: 'collapsed' } : undefined),
    } as unknown as Awaited<ReturnType<typeof cookies>>);
    getAuthenticatedUser.mockResolvedValueOnce({
      id: 'user-1',
      name: 'Jane Muthoni',
      email: 'jane.muthoni@finaxis.test',
      roles: [],
      branches: [],
    });
    getCurrentContextProfile.mockResolvedValueOnce({
      context: {
        branch: { id: 'branch-1', name: 'Headquarters' },
        module: { id: 'administration', name: 'Administration' },
        organization: { id: 'organisation-1', name: 'Finaxis Holdings' },
      },
      kind: 'resolved',
      profile: {
        user_id: 'u',
        full_name: 'Jane',
        email: 'j@x',
        branches: [],
        roles: [],
        permissions: [],
      },
    });

    render(await AuthenticatedLayout({ children: <div /> }));

    expect(renderedShell).toHaveBeenCalledWith(
      expect.objectContaining({ initialNavCollapsed: true }),
    );
  });

  it('treats a tampered cookie value as expanded rather than collapsed', async () => {
    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValueOnce({
      get: (name: string) => (name === 'finaxis_nav' ? { name, value: 'COLLAPSED' } : undefined),
    } as unknown as Awaited<ReturnType<typeof cookies>>);
    getAuthenticatedUser.mockResolvedValueOnce({
      id: 'user-1',
      name: 'Jane Muthoni',
      email: 'jane.muthoni@finaxis.test',
      roles: [],
      branches: [],
    });
    getCurrentContextProfile.mockResolvedValueOnce({
      context: {
        branch: { id: 'branch-1', name: 'Headquarters' },
        module: { id: 'administration', name: 'Administration' },
        organization: { id: 'organisation-1', name: 'Finaxis Holdings' },
      },
      kind: 'resolved',
      profile: {
        user_id: 'u',
        full_name: 'Jane',
        email: 'j@x',
        branches: [],
        roles: [],
        permissions: [],
      },
    });

    render(await AuthenticatedLayout({ children: <div /> }));

    expect(renderedShell).toHaveBeenCalledWith(
      expect.objectContaining({ initialNavCollapsed: false }),
    );
  });
});
