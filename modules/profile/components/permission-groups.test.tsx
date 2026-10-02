import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { groupPermissions } from '../profile-rules';
import { PermissionGroups } from './permission-groups';

describe('PermissionGroups', () => {
  it('renders one list per prefix, named by its heading, with codes as items', () => {
    renderWithProviders(
      <PermissionGroups
        groups={groupPermissions(['audit.view', 'business_date.view', 'business_date.advance'])}
      />,
    );

    expect(screen.getByRole('heading', { level: 3, name: 'Audit' })).toBeInTheDocument();
    const dates = screen.getByRole('list', { name: 'Business date' });
    expect(
      within(dates)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['business_date.advance', 'business_date.view']);
  });
});
