import { describe, expect, it } from 'vitest';
import ManageAccountsOutlined from '@mui/icons-material/ManageAccountsOutlined';
import {
  isNavigationItemActive,
  visibleNavigationItems,
} from '@/components/shell/workspace-navigation';
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
    expect(platformAdministrationNavigationItems[2]?.icon).toBe(ManageAccountsOutlined);
  });

  it('shows Platform users only to a holder of user.view', () => {
    const labels = (permissions: string[]) =>
      visibleNavigationItems(platformAdministrationNavigationItems, permissions).map(
        (item) => item.label,
      );

    expect(labels(['user.view'])).toEqual(['Overview', 'Platform users']);
    expect(labels(['tenant.view'])).toEqual(['Overview', 'SACCO institutions']);
  });

  it('lights Platform users on its own records only, and SACCO institutions on an institution user', () => {
    const INSTITUTION = '17000000-0000-4000-8000-0000000000ac';
    const USER = '17000000-0000-4000-8000-0000000000a7';
    const active = (pathname: string) =>
      platformAdministrationNavigationItems
        .filter((item) => isNavigationItemActive(pathname, item.href))
        .map((item) => item.label);

    expect(active('/platform-admin')).toEqual(['Overview']);
    expect(active('/platform-admin/users')).toEqual(['Platform users']);
    expect(active(`/platform-admin/users/${USER}`)).toEqual(['Platform users']);
    expect(active(`/platform-admin/tenants/${INSTITUTION}/users`)).toEqual(['SACCO institutions']);
    expect(active(`/platform-admin/tenants/${INSTITUTION}/users/${USER}`)).toEqual([
      'SACCO institutions',
    ]);
  });
});
