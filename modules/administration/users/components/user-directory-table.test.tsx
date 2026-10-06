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
    const email = within(cell as HTMLElement).getByText('felix.omondi@greenfield.example');
    expect(email).toBeVisible();
    // TruncatedText keeps the full value in `title` and caps the width (a 100-character email).
    expect(email).toHaveAttribute('title', 'felix.omondi@greenfield.example');
    expect(screen.getByText('felix.omondi')).toBeInTheDocument();
  });

  it('links into another workspace when asked, keeping its region', () => {
    renderWithProviders(<UserDirectoryTable users={USERS} basePath="/platform-admin/users" />);

    expect(screen.getByRole('link', { name: 'Felix Omondi' })).toHaveAttribute(
      'href',
      `/platform-admin/users/${FELIX}`,
    );
    expect(screen.getByRole('region', { name: 'Users table' })).toHaveAttribute('tabindex', '0');
  });

  it('derives the onboarding chip from both statuses', () => {
    renderWithProviders(<UserDirectoryTable users={USERS} />);

    // The Onboarding cell is the third: "Provisioning identity" is also the user status below.
    const onboardingOf = (name: string) => within(rowOf(name)).getAllByRole('cell')[2];
    expect(onboardingOf('Grace Wanjiru')).toHaveTextContent('Provisioning identity');
    expect(onboardingOf('Hassan Ali')).toHaveTextContent('Awaiting first sign-in');
    expect(onboardingOf('Felix Omondi')).toHaveTextContent('Awaiting approval');
  });

  it('humanizes the membership and user statuses, each in its own column', () => {
    renderWithProviders(<UserDirectoryTable users={USERS} />);

    // PENDING_APPROVAL is valid in both enums, so the column is pinned by position.
    const felix = within(rowOf('Felix Omondi')).getAllByRole('cell');
    expect(felix[3]).toHaveTextContent('Pending approval');
    expect(felix[4]).toHaveTextContent('Draft');
    const hassan = within(rowOf('Hassan Ali')).getAllByRole('cell');
    expect(hassan[3]).toHaveTextContent('Active');
    expect(hassan[4]).toHaveTextContent('Invited');
  });

  it('words the provisioning user status as an identity, not an acronym', () => {
    renderWithProviders(<UserDirectoryTable users={USERS} />);

    const grace = within(rowOf('Grace Wanjiru')).getAllByRole('cell');
    expect(grace[4]).toHaveTextContent('Provisioning identity');
    expect(screen.queryByText(/idp/i)).not.toBeInTheDocument();
  });

  it('hides the initials avatar from assistive technology', () => {
    renderWithProviders(<UserDirectoryTable users={USERS.slice(0, 1)} />);

    expect(screen.getByText('FO').closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Felix Omondi' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /FO/ })).toBeNull();
  });

  it("holds the table in a named, keyboard-focusable region, so a narrow screen's horizontal scroll is reachable", () => {
    renderWithProviders(<UserDirectoryTable users={USERS} />);

    const region = screen.getByRole('region', { name: 'Users table' });
    expect(region).toHaveAttribute('tabindex', '0');
    // The table is the region's own content and keeps its own name.
    expect(within(region).getByRole('table', { name: 'Users' })).toBeInTheDocument();
    // One name per landmark: the table is not also a region named Users (axe's landmark-unique).
    expect(screen.queryByRole('region', { name: 'Users' })).toBeNull();
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
