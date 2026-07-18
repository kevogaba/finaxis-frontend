// components/shell/workspace-drawer.test.tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import { WorkspaceDrawer } from './workspace-drawer';
import type { WorkspaceNavigationItem } from './workspace-navigation';

// Partial mock (via importOriginal) rather than a full module replacement:
// next/link's App Router implementation reads other next/navigation
// exports internally, and replacing the whole module would break it.
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, usePathname: () => '/admin/users' };
});

const ITEMS: WorkspaceNavigationItem[] = [
  { href: '/admin', label: 'Overview', icon: DashboardOutlined },
  { href: '/admin/users', label: 'Users', icon: GroupOutlined },
];

describe('WorkspaceDrawer', () => {
  it('marks the current route as active with aria-current', () => {
    renderWithProviders(
      <WorkspaceDrawer items={ITEMS} mobileOpen={false} onMobileClose={() => undefined} />,
    );

    const usersLinks = screen.getAllByRole('link', { name: 'Users' });
    expect(usersLinks[0]).toHaveAttribute('aria-current', 'page');
    const overviewLinks = screen.getAllByRole('link', { name: 'Overview' });
    expect(overviewLinks[0]).not.toHaveAttribute('aria-current');
  });

  it('opens and closes the mobile drawer', async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <WorkspaceDrawer items={ITEMS} mobileOpen={true} onMobileClose={handleClose} />,
    );

    expect(screen.getAllByRole('link', { name: 'Users' }).length).toBeGreaterThan(0);

    await user.keyboard('{Escape}');
    expect(handleClose).toHaveBeenCalled();

    rerender(<WorkspaceDrawer items={ITEMS} mobileOpen={false} onMobileClose={handleClose} />);
  });
});
