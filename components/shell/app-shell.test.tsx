import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { AppShell } from './app-shell';
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

describe('AppShell', () => {
  it('renders the global header and the page content', () => {
    renderWithProviders(
      <AppShell user={USER} context={CONTEXT}>
        <div>Page content</div>
      </AppShell>,
    );

    expect(screen.getByText('Administration')).toBeInTheDocument();
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });
});
