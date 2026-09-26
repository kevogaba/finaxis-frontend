import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { FinaxisUser } from '@/auth/auth.types';
import type { ApplicationContext } from '@/config/application-context';
import { GlobalHeader } from './global-header';
import { ApplicationContextProvider } from './organization-context';

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, usePathname: () => '/admin' };
});

const USER: FinaxisUser = {
  id: 'user-1',
  name: 'Jane Muthoni',
  email: 'jane.muthoni@finaxis.test',
  permissions: [],
  roles: [],
  branches: [],
};

const CONTEXT: ApplicationContext = {
  module: { id: 'administration', name: 'Administration' },
  organization: { id: 'org-1', name: 'Umoja Teachers SACCO' },
  branch: { id: 'branch-1', name: 'Westlands Branch' },
};

function renderHeader(onOpenNavigation = vi.fn()) {
  renderWithProviders(
    <ApplicationContextProvider value={CONTEXT}>
      <GlobalHeader user={USER} onOpenNavigation={onOpenNavigation} />
    </ApplicationContextProvider>,
  );
  return onOpenNavigation;
}

describe('GlobalHeader', () => {
  it('shows the workspace, organisation, branch, and account identity', () => {
    renderHeader();

    expect(screen.getByText('Administration')).toBeInTheDocument();
    expect(screen.getByText('Umoja Teachers SACCO')).toBeInTheDocument();
    expect(screen.getByText('Westlands Branch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jane Muthoni' })).toBeInTheDocument();
  });

  it('links the context control to context selection, returning to the current page', () => {
    renderHeader();

    expect(screen.getByRole('link', { name: /switch organisation or branch/i })).toHaveAttribute(
      'href',
      '/select-context?next=%2Fadmin',
    );
  });

  it('opens the mobile navigation', async () => {
    const user = userEvent.setup();
    const onOpenNavigation = renderHeader();

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(onOpenNavigation).toHaveBeenCalledTimes(1);
  });

  it('keeps the theme and app-switcher controls and has no placeholder notifications', () => {
    renderHeader();

    expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /switch application/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /notifications/i })).not.toBeInTheDocument();
  });
});
