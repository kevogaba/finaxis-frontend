import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { GlobalHeader } from './global-header';
import { ApplicationContextProvider } from './organization-context';
import type { FinaxisUser } from '@/auth/auth.types';
import type { ApplicationContext } from '@/config/application-context';

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
  organization: { id: 'greenfield-sacco', name: 'GreenField SACCO' },
  branch: { id: 'nairobi-central', name: 'Nairobi Central Branch' },
};

describe('GlobalHeader', () => {
  it('shows the current module, organization, branch, and user', () => {
    renderWithProviders(
      <ApplicationContextProvider value={CONTEXT}>
        <GlobalHeader user={USER} />
      </ApplicationContextProvider>,
    );

    expect(screen.getByText('Administration')).toBeInTheDocument();
    expect(screen.getByText(/greenfield sacco/i)).toBeInTheDocument();
    expect(screen.getByText(/nairobi central branch/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /jane muthoni/i })).toBeInTheDocument();
  });

  it('renders the theme, notification, and app-switcher controls', () => {
    renderWithProviders(
      <ApplicationContextProvider value={CONTEXT}>
        <GlobalHeader user={USER} />
      </ApplicationContextProvider>,
    );

    expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /switch application/i })).toBeInTheDocument();
  });
});
