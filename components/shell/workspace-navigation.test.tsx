import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import DomainOutlined from '@mui/icons-material/DomainOutlined';
import { renderWithProviders } from '@/test/test-utils';
import {
  isNavigationItemActive,
  visibleNavigationItems,
  WorkspaceNavigation,
  type WorkspaceNavigationItem,
} from './workspace-navigation';

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, usePathname: () => '/platform-admin/tenants/abc' };
});

const ITEMS: WorkspaceNavigationItem[] = [
  { href: '/platform-admin', label: 'Overview', icon: HomeOutlined },
  {
    href: '/platform-admin/tenants',
    label: 'SACCO institutions',
    icon: DomainOutlined,
    requiresAny: ['tenant.view'],
  },
];

describe('visibleNavigationItems', () => {
  it('keeps ungated items and items whose permission the user holds', () => {
    expect(visibleNavigationItems(ITEMS, ['tenant.view']).map((item) => item.label)).toEqual([
      'Overview',
      'SACCO institutions',
    ]);
    expect(visibleNavigationItems(ITEMS, []).map((item) => item.label)).toEqual(['Overview']);
  });

  it('hides an item whose requiresAny is empty, regardless of permissions held', () => {
    const unreachable: WorkspaceNavigationItem = {
      href: '/platform-admin/unreachable',
      label: 'Unreachable',
      icon: HomeOutlined,
      requiresAny: [],
    };

    expect(
      visibleNavigationItems([...ITEMS, unreachable], ['tenant.view']).map((item) => item.label),
    ).toEqual(['Overview', 'SACCO institutions']);
  });
});

describe('isNavigationItemActive', () => {
  it('matches exact paths and nested paths below multi-segment items', () => {
    expect(isNavigationItemActive('/platform-admin', '/platform-admin')).toBe(true);
    expect(isNavigationItemActive('/platform-admin/tenants/abc', '/platform-admin/tenants')).toBe(
      true,
    );
    expect(isNavigationItemActive('/platform-admin/tenants', '/platform-admin')).toBe(false);
  });
});

describe('WorkspaceNavigation', () => {
  it('marks the active item and labels the landmark', () => {
    renderWithProviders(<WorkspaceNavigation items={ITEMS} ariaLabel="Platform administration" />);

    const nav = screen.getByRole('navigation', { name: 'Platform administration' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'SACCO institutions' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('keeps accessible names when collapsed to icons', () => {
    renderWithProviders(
      <WorkspaceNavigation items={ITEMS} ariaLabel="Platform administration" collapsed />,
    );

    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.queryByText('SACCO institutions')).not.toBeInTheDocument();
  });
});
