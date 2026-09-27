import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { FinaxisUser } from '@/auth/auth.types';
import type { ApplicationContext } from '@/config/application-context';
import { GlobalHeader } from './global-header';
import { ApplicationContextProvider } from './organization-context';

// A stable router object: the real Next router is memoized, and both AppSwitcher instances
// GlobalHeader renders call useRouter().
const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, useRouter: () => router };
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

function renderHeader(onOpenNavigation = vi.fn(), onOpenContextSwitcher = vi.fn()) {
  renderWithProviders(
    <ApplicationContextProvider value={CONTEXT}>
      <GlobalHeader
        user={USER}
        platformOrganisationId="platform"
        onOpenNavigation={onOpenNavigation}
        onOpenContextSwitcher={onOpenContextSwitcher}
      />
    </ApplicationContextProvider>,
  );
  return onOpenNavigation;
}

describe('GlobalHeader', () => {
  it('shows the workspace, organisation, branch, and account identity', () => {
    renderHeader();

    expect(
      screen.getByRole('button', { name: /current workspace: administration/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Umoja Teachers SACCO')).toBeInTheDocument();
    expect(screen.getByText('Westlands Branch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jane Muthoni' })).toBeInTheDocument();
  });

  it('opens the context switcher', async () => {
    const user = userEvent.setup();
    const onOpenContextSwitcher = vi.fn();
    renderHeader(vi.fn(), onOpenContextSwitcher);

    await user.click(screen.getByRole('button', { name: /switch organisation or branch/i }));
    expect(onOpenContextSwitcher).toHaveBeenCalledTimes(1);
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
    expect(screen.getByRole('button', { name: 'Switch application' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /notifications/i })).not.toBeInTheDocument();
  });

  it('shows All branches for an institution-level context', () => {
    renderWithProviders(
      <ApplicationContextProvider value={{ ...CONTEXT, branch: null }}>
        <GlobalHeader
          user={USER}
          platformOrganisationId="platform"
          onOpenNavigation={vi.fn()}
          onOpenContextSwitcher={vi.fn()}
        />
      </ApplicationContextProvider>,
    );

    expect(screen.getByText('All branches')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /switch organisation or branch.*all branches/i }),
    ).toBeInTheDocument();
  });

  it('renders the business date slot', () => {
    renderWithProviders(
      <ApplicationContextProvider value={CONTEXT}>
        <GlobalHeader
          user={USER}
          platformOrganisationId="platform"
          onOpenNavigation={vi.fn()}
          onOpenContextSwitcher={vi.fn()}
          businessDate={<span>Business date slot</span>}
        />
      </ApplicationContextProvider>,
    );
    expect(screen.getByText('Business date slot')).toBeInTheDocument();
  });

  it('renders the notifications slot', () => {
    renderWithProviders(
      <ApplicationContextProvider value={CONTEXT}>
        <GlobalHeader
          user={USER}
          platformOrganisationId="platform"
          onOpenNavigation={vi.fn()}
          onOpenContextSwitcher={vi.fn()}
          notifications={<span>Notifications slot</span>}
        />
      </ApplicationContextProvider>,
    );
    expect(screen.getByText('Notifications slot')).toBeInTheDocument();
  });
});
