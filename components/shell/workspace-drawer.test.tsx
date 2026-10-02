import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent, screen, within } from '@testing-library/react';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import { renderWithProviders } from '@/test/test-utils';
import { WorkspaceDrawer } from './workspace-drawer';
import type { WorkspaceNavigationItem } from './workspace-navigation';

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, usePathname: () => '/admin/users' };
});

const ITEMS: WorkspaceNavigationItem[] = [
  { href: '/admin', label: 'Overview', icon: HomeOutlined },
  { href: '/admin/users', label: 'Users & access', icon: GroupOutlined },
];

function renderDrawer(overrides: Partial<Parameters<typeof WorkspaceDrawer>[0]> = {}) {
  const props = {
    items: ITEMS,
    navigationAriaLabel: 'Administration',
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    mobileOpen: false,
    onMobileClose: vi.fn(),
    footerTitle: 'Umoja Teachers SACCO',
    footerSubtitle: 'Westlands Branch',
    ...overrides,
  };
  renderWithProviders(<WorkspaceDrawer {...props} />);
  return props;
}

describe('WorkspaceDrawer', () => {
  it('shows the brand, the active item, and the organisation footer', () => {
    renderDrawer();

    expect(screen.getAllByText('Finaxis').length).toBeGreaterThan(0);
    const nav = screen.getAllByRole('navigation', { name: 'Administration' })[0];
    if (!nav) throw new Error('navigation landmark missing');
    expect(within(nav).getByRole('link', { name: 'Users & access' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getAllByText('Umoja Teachers SACCO').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Westlands Branch').length).toBeGreaterThan(0);
  });

  it('asks to collapse and expand through an accessible control', async () => {
    const user = userEvent.setup();
    const props = renderDrawer();

    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    expect(props.onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('renders an icon rail with an expand control when collapsed', () => {
    renderDrawer({ collapsed: true });

    expect(screen.getByRole('button', { name: 'Expand navigation' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('closes the mobile drawer on Escape', async () => {
    const user = userEvent.setup();
    const props = renderDrawer({ mobileOpen: true });

    await user.keyboard('{Escape}');
    expect(props.onMobileClose).toHaveBeenCalled();
  });

  it('closes the mobile drawer when a rail link inside it is followed', () => {
    const props = renderDrawer({ mobileOpen: true });

    // Both the permanent rail and the temporary drawer render their own copy of the nav (MUI's
    // `ModalProps={{ keepMounted: true }}` keeps the latter in the DOM). jsdom's default (desktop)
    // emulated width resolves both Drawers' responsive `display` as a real browser would at that
    // width, so only the permanent copy is exposed to role queries — reach the temporary drawer's
    // copy directly (the second `<a href="/admin">` in DOM order) to exercise its `onNavigate`.
    const overviewLinks = document.querySelectorAll<HTMLAnchorElement>('a[href="/admin"]');
    const mobileOverviewLink = overviewLinks[1];
    if (!mobileOverviewLink) throw new Error('mobile drawer link missing');

    fireEvent.click(mobileOverviewLink);

    expect(props.onMobileClose).toHaveBeenCalledTimes(1);
  });
});
