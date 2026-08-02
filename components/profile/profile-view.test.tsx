import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ProfileView } from './profile-view';
import type { FinaxisUser } from '@/auth/auth.types';

const SIGNED_IN_AT = new Date('2026-07-17T09:00:00Z');

describe('ProfileView', () => {
  it('shows empty states for branches and roles when none are assigned', () => {
    const user: FinaxisUser = {
      id: 'user-1',
      name: 'Jane Muthoni',
      email: 'jane.muthoni@finaxis.test',
      roles: [],
      permissions: [],
      branches: [],
    };

    renderWithProviders(<ProfileView user={user} signedInAt={SIGNED_IN_AT} />);

    expect(screen.getByText('No branches assigned')).toBeInTheDocument();
    expect(screen.getByText('No application roles assigned')).toBeInTheDocument();
    expect(screen.getByText('No organisation assigned')).toBeInTheDocument();
    expect(screen.getByText('No branch selected')).toBeInTheDocument();
    expect(screen.getByText('No application permissions assigned')).toBeInTheDocument();
  });

  it('renders assigned branches, roles, and organization as chips', () => {
    const user: FinaxisUser = {
      id: 'user-2',
      name: 'Kevin Otieno',
      email: 'kevin.otieno@finaxis.test',
      roles: ['branch-teller'],
      permissions: ['iam.profile.read'],
      branches: [{ id: 'nairobi-central', name: 'Nairobi Central Branch' }],
      selectedBranch: { id: 'nairobi-central', name: 'Nairobi Central Branch' },
      organization: { id: 'greenfield-sacco', name: 'GreenField SACCO' },
    };

    renderWithProviders(<ProfileView user={user} signedInAt={SIGNED_IN_AT} />);

    expect(screen.getAllByText('Nairobi Central Branch')).toHaveLength(2);
    expect(screen.getByText('branch-teller')).toBeInTheDocument();
    expect(screen.getByText('GreenField SACCO')).toBeInTheDocument();
    expect(screen.getByText('iam.profile.read')).toBeInTheDocument();
  });

  it('shows the user ID only inside the technical-details section, not the main view', () => {
    const user: FinaxisUser = {
      id: 'user-3',
      name: 'Amina Yusuf',
      email: 'amina.yusuf@finaxis.test',
      roles: [],
      permissions: [],
      branches: [],
    };

    renderWithProviders(<ProfileView user={user} signedInAt={SIGNED_IN_AT} />);

    expect(screen.getByText(/user id: user-3/i)).toBeInTheDocument();
  });
});
