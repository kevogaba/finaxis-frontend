import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { FinaxisUser } from '@/auth/auth.types';
import type { ApplicationContext } from '@/config/application-context';
import { AppShell } from './app-shell';

// A stable router object: the real Next router is memoized, and the context dialog's load
// effect depends on `[open, router]`, so a fresh object per render would re-run it every render.
const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, usePathname: () => '/platform-admin', useRouter: () => router };
});

const USER: FinaxisUser = {
  id: 'user-1',
  name: 'Jane Muthoni',
  email: 'jane.muthoni@finaxis.test',
  permissions: [],
  roles: [],
  branches: [],
};

const PLATFORM: ApplicationContext = {
  module: { id: 'platform-administration', name: 'Platform Administration' },
  organization: { id: 'platform', name: 'Platform' },
  branch: { id: 'ops', name: 'Platform Operations' },
};

const ADMINISTRATION: ApplicationContext = {
  module: { id: 'administration', name: 'Administration' },
  organization: { id: 'org-1', name: 'Umoja Teachers SACCO' },
  branch: { id: 'branch-1', name: 'Westlands Branch' },
};

describe('AppShell', () => {
  it('renders the module navigation filtered by permissions, the page, and the footer', () => {
    renderWithProviders(
      <AppShell
        user={USER}
        context={PLATFORM}
        initialNavCollapsed={false}
        platformOrganisationId="platform"
      >
        <div>Page content</div>
      </AppShell>,
    );

    expect(screen.getByText('Page content')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Overview' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'SACCO institutions' })).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Finaxis');
  });

  it('shows gated items when the user holds the permission', () => {
    renderWithProviders(
      <AppShell
        user={{ ...USER, permissions: ['tenant.view'] }}
        context={PLATFORM}
        initialNavCollapsed={false}
        platformOrganisationId="platform"
      >
        <div />
      </AppShell>,
    );

    expect(screen.getAllByRole('link', { name: 'SACCO institutions' }).length).toBeGreaterThan(0);
  });

  it('persists the collapse preference in a cookie', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AppShell
        user={USER}
        context={PLATFORM}
        initialNavCollapsed={false}
        platformOrganisationId="platform"
      >
        <div />
      </AppShell>,
    );

    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));

    expect(document.cookie).toContain('finaxis_nav=collapsed');
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeInTheDocument();
  });

  it('clears the collapse cookie when the rail expands again', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AppShell
        user={USER}
        context={PLATFORM}
        initialNavCollapsed={false}
        platformOrganisationId="platform"
      >
        <div />
      </AppShell>,
    );

    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    expect(document.cookie).toContain('finaxis_nav=collapsed');

    await user.click(screen.getByRole('button', { name: 'Expand navigation' }));

    expect(document.cookie).not.toContain('finaxis_nav');
    expect(screen.getByRole('button', { name: 'Collapse navigation' })).toBeInTheDocument();
  });

  it('opens the mobile navigation drawer from the header button', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AppShell
        user={USER}
        context={PLATFORM}
        initialNavCollapsed={false}
        platformOrganisationId="platform"
      >
        <div />
      </AppShell>,
    );

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('shows only the platform notifications node in a platform context', () => {
    renderWithProviders(
      <AppShell
        user={USER}
        context={PLATFORM}
        initialNavCollapsed={false}
        platformOrganisationId="platform"
        notifications={{
          administration: <span>Tenant node</span>,
          'platform-administration': <span>Platform node</span>,
        }}
      >
        <div />
      </AppShell>,
    );

    expect(screen.getByText('Platform node')).toBeInTheDocument();
    expect(screen.queryByText('Tenant node')).not.toBeInTheDocument();
  });

  it('shows only the tenant notifications node in an administration context', () => {
    renderWithProviders(
      <AppShell
        user={USER}
        context={ADMINISTRATION}
        initialNavCollapsed={false}
        platformOrganisationId="platform"
        notifications={{
          administration: <span>Tenant node</span>,
          'platform-administration': <span>Platform node</span>,
        }}
      >
        <div />
      </AppShell>,
    );

    expect(screen.getByText('Tenant node')).toBeInTheDocument();
    expect(screen.queryByText('Platform node')).not.toBeInTheDocument();
  });
});
