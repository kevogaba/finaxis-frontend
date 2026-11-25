import { describe, expect, it } from 'vitest';
import { visibleNavigationItems } from '@/components/shell/workspace-navigation';
import { administrationNavigationItems } from './administration-navigation';

// Every code tenant-wide unless a case says otherwise.
const labels = (permissions: string[], tenantPermissions: string[] = permissions) =>
  visibleNavigationItems(administrationNavigationItems, { permissions, tenantPermissions }).map(
    (item) => item.label,
  );

describe('administrationNavigationItems', () => {
  it('lists the Approval queue right after Overview, then Users & access (spec §8)', () => {
    expect(administrationNavigationItems.slice(0, 4).map((item) => item.href)).toEqual([
      '/admin',
      '/admin/approvals',
      '/admin/users',
      '/admin/branches',
    ]);
    const queue = administrationNavigationItems[1];
    expect(queue?.label).toBe('Approval queue');
    expect(queue?.requiresAny).toEqual(['user.approve', 'branch.approve']);
    const users = administrationNavigationItems[2];
    expect(users?.label).toBe('Users & access');
    expect(users?.requiresAny).toEqual(['user.view']);
    expect(users?.tenantWide).toBe(true);
  });

  // GET /tenant/users checks user.view tenant-wide (BG-33).
  it('hides a page whose read is held only at branch scope, except the target-aware Branches', () => {
    expect(labels(['user.view'], [])).toEqual(['Overview']);
    expect(labels(['role.view', 'settings.view', 'business_date.view', 'audit.view'], [])).toEqual([
      'Overview',
    ]);
    expect(labels(['branch.view'], [])).toEqual(['Overview', 'Branches']);
  });

  // BG-03: GET /branches answers a branch-scoped branch.view with its branches at All branches,
  // where the grant isn't in the selected context's permissions.
  it('shows Branches for a branch.view held at any branch, and no other page', () => {
    const atAllBranches = (heldAtAnyBranch: string[]) =>
      visibleNavigationItems(
        administrationNavigationItems,
        { permissions: [], tenantPermissions: [] },
        heldAtAnyBranch,
      ).map((item) => item.label);
    expect(atAllBranches(['branch.view'])).toEqual(['Overview', 'Branches']);
    expect(atAllBranches([])).toEqual(['Overview']);
    expect(atAllBranches(['user.view', 'role.view', 'audit.view'])).toEqual(['Overview']);
  });

  it('shows the Approval queue to a holder of either decision, and only then', () => {
    expect(labels(['user.approve'])).toEqual(['Overview', 'Approval queue']);
    expect(labels(['branch.approve', 'branch.view'])).toEqual([
      'Overview',
      'Approval queue',
      'Branches',
    ]);
    expect(labels(['user.view'])).toEqual(['Overview', 'Users & access']);
    expect(labels(['branch.view'])).toEqual(['Overview', 'Branches']);
  });
});
