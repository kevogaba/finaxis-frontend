import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { UserSummary } from '../user-contract';
import { UserDirectoryTable } from './user-directory-table';

const FELIX = '10000000-0000-4000-8000-000000000a01';
const GRACE = '10000000-0000-4000-8000-000000000a02';
const HASSAN = '10000000-0000-4000-8000-000000000a03';

const USERS: UserSummary[] = [
  {
    id: FELIX,
    username: 'felix.omondi',
    email: 'felix.omondi@greenfield.example',
    displayName: 'Felix Omondi',
    userStatus: 'DRAFT',
    membershipStatus: 'PENDING_APPROVAL',
  },
  {
    id: GRACE,
    username: 'grace.wanjiru',
    email: 'grace.wanjiru@greenfield.example',
    displayName: 'Grace Wanjiru',
    userStatus: 'PROVISIONING_IDP',
    membershipStatus: 'PENDING_APPROVAL',
  },
  {
    id: HASSAN,
    username: 'hassan.ali',
    email: 'hassan.ali@greenfield.example',
    displayName: 'Hassan Ali',
    userStatus: 'INVITED',
    membershipStatus: 'ACTIVE',
  },
];

function rowOf(name: string): HTMLElement {
  const row = screen.getByRole('link', { name }).closest('tr');
  if (!row) throw new Error(`No row for ${name}`);
  return row;
}

describe('UserDirectoryTable', () => {
  it("links each name to the user's record and shows the email under it", () => {
    renderWithProviders(<UserDirectoryTable users={USERS} />);

    const link = screen.getByRole('link', { name: 'Felix Omondi' });
    expect(link).toHaveAttribute('href', `/admin/users/${FELIX}`);
    expect(link).toHaveAttribute('title', 'Felix Omondi');
    const cell = link.closest('td');
    expect(cell).not.toBeNull();
    expect(within(cell as HTMLElement).getByText('felix.omondi@greenfield.example')).toBeVisible();
    expect(screen.getByText('felix.omondi')).toBeInTheDocument();
  });

  it('derives the onboarding chip from both statuses', () => {
    renderWithProviders(<UserDirectoryTable users={USERS} />);

    expect(within(rowOf('Grace Wanjiru')).getByText('Provisioning identity')).toBeInTheDocument();
    expect(within(rowOf('Hassan Ali')).getByText('Awaiting first sign-in')).toBeInTheDocument();
    expect(within(rowOf('Felix Omondi')).getByText('Awaiting approval')).toBeInTheDocument();
  });

  it('humanizes the membership and user statuses', () => {
    renderWithProviders(<UserDirectoryTable users={USERS.slice(0, 1)} />);

    const row = rowOf('Felix Omondi');
    expect(within(row).getByText('Pending approval')).toBeInTheDocument();
    expect(within(row).getByText('Draft')).toBeInTheDocument();
  });

  it('hides the initials avatar from assistive technology', () => {
    renderWithProviders(<UserDirectoryTable users={USERS.slice(0, 1)} />);

    expect(screen.getByText('FO').closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Felix Omondi' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /FO/ })).toBeNull();
  });

  it('is a table named Users with the five headers and no sort links', () => {
    renderWithProviders(<UserDirectoryTable users={USERS} />);

    expect(screen.getByRole('table', { name: 'Users' })).toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'User',
      'Username',
      'Onboarding',
      'Membership',
      'User status',
    ]);
    for (const header of headers) {
      expect(header).not.toHaveAttribute('aria-sort');
      expect(within(header).queryByRole('link')).toBeNull();
    }
  });
});
