import { describe, expect, it } from 'vitest';
import { visibleNavigationItems } from '@/components/shell/workspace-navigation';
import { platformAdministrationNavigationItems } from './platform-administration-navigation';

describe('platformAdministrationNavigationItems', () => {
  it('lists Platform users after SACCO institutions, gated on user.view', () => {
    expect(platformAdministrationNavigationItems.map((item) => item.href)).toEqual([
      '/platform-admin',
      '/platform-admin/tenants',
      '/platform-admin/users',
    ]);
    expect(platformAdministrationNavigationItems[2]).toMatchObject({
      label: 'Platform users',
      requiresAny: ['user.view'],
    });
  });

  it('shows Platform users only to a holder of user.view', () => {
    const labels = (permissions: string[]) =>
      visibleNavigationItems(platformAdministrationNavigationItems, permissions).map(
        (item) => item.label,
      );

    expect(labels(['user.view'])).toEqual(['Overview', 'Platform users']);
    expect(labels(['tenant.view'])).toEqual(['Overview', 'SACCO institutions']);
  });
});
