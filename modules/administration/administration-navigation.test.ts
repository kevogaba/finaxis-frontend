import { describe, expect, it } from 'vitest';
import { visibleNavigationItems } from '@/components/shell/workspace-navigation';
import { administrationNavigationItems } from './administration-navigation';

describe('administrationNavigationItems', () => {
  it('lists Users & access right after Overview, gated on user.view', () => {
    expect(administrationNavigationItems.slice(0, 3).map((item) => item.href)).toEqual([
      '/admin',
      '/admin/users',
      '/admin/branches',
    ]);
    const users = administrationNavigationItems[1];
    expect(users?.label).toBe('Users & access');
    expect(users?.requiresAny).toEqual(['user.view']);
  });

  it('shows Users & access only to a holder of user.view', () => {
    const labels = (permissions: string[]) =>
      visibleNavigationItems(administrationNavigationItems, permissions).map((item) => item.label);

    expect(labels(['user.view'])).toEqual(['Overview', 'Users & access']);
    expect(labels(['branch.view'])).toEqual(['Overview', 'Branches']);
  });
});
