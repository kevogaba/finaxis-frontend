import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { FinaxisUser } from '@/auth/auth.types';
import type { ApplicationContext } from '@/config/application-context';
import { AppShell } from './app-shell';

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, usePathname: () => '/platform-admin' };
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

describe('AppShell', () => {
  it('renders the module navigation filtered by permissions, the page, and the footer', () => {
    renderWithProviders(
      <AppShell user={USER} context={PLATFORM} initialNavCollapsed={false}>
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
      >
        <div />
      </AppShell>,
    );

    expect(screen.getAllByRole('link', { name: 'SACCO institutions' }).length).toBeGreaterThan(0);
  });

  it('persists the collapse preference in a cookie', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AppShell user={USER} context={PLATFORM} initialNavCollapsed={false}>
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
      <AppShell user={USER} context={PLATFORM} initialNavCollapsed={false}>
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
      <AppShell user={USER} context={PLATFORM} initialNavCollapsed={false}>
        <div />
      </AppShell>,
    );

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
