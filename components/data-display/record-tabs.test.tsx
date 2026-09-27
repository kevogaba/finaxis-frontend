import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { RecordTabs } from './record-tabs';

let pathname = '/admin/branches/b1/users';
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, usePathname: () => pathname };
});

const TABS = [
  { href: '/admin/branches/b1', label: 'Overview' },
  { href: '/admin/branches/b1/users', label: 'Users' },
  { href: '/admin/branches/b1/audit', label: 'Audit' },
];

describe('RecordTabs', () => {
  it('renders deep-linkable tabs inside a named navigation landmark', () => {
    pathname = '/admin/branches/b1/users';
    renderWithProviders(<RecordTabs label="Westlands Branch sections" tabs={TABS} />);

    expect(
      screen.getByRole('navigation', { name: 'Westlands Branch sections' }),
    ).toBeInTheDocument();
    const users = screen.getByRole('tab', { name: 'Users' });
    expect(users).toHaveAttribute('href', '/admin/branches/b1/users');
    expect(users).toHaveAttribute('aria-selected', 'true');
    expect(users).toHaveAttribute('aria-current', 'page');
    const overview = screen.getByRole('tab', { name: 'Overview' });
    expect(overview).toHaveAttribute('aria-selected', 'false');
    expect(overview).not.toHaveAttribute('aria-current');
  });

  it('keeps the parent tab on a sub-route and selects Overview on the record root', () => {
    pathname = '/admin/branches/b1/users/u9';
    const { unmount } = renderWithProviders(<RecordTabs label="Sections" tabs={TABS} />);
    expect(screen.getByRole('tab', { name: 'Users' })).toHaveAttribute('aria-selected', 'true');
    unmount();

    pathname = '/admin/branches/b1';
    renderWithProviders(<RecordTabs label="Sections" tabs={TABS} />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });
});
