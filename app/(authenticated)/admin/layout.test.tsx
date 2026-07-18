import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

// Partial mock (via importOriginal): see the identical note in
// components/shell/workspace-drawer.test.tsx — next/link needs the rest of
// next/navigation's real exports to keep working.
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, usePathname: () => '/admin/users' };
});

const { default: AdministrationLayout } = await import('./layout');

describe('AdministrationLayout', () => {
  it('renders the Administration navigation and the page content', () => {
    renderWithProviders(<AdministrationLayout>{<div>Users page</div>}</AdministrationLayout>);

    expect(screen.getAllByRole('link', { name: 'Users' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('Users page')).toBeInTheDocument();
  });

  it('opens the mobile drawer from the mobile menu button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdministrationLayout>{<div>Users page</div>}</AdministrationLayout>);

    await user.click(screen.getByRole('button', { name: /open navigation/i }));

    expect(screen.getAllByRole('link', { name: 'Branches' }).length).toBeGreaterThan(0);
  });
});
