import { describe, expect, it } from 'vitest';
import { visibleNavigationItems } from '@/components/shell/workspace-navigation';
import { administrationNavigationItems } from './administration-navigation';

const labels = (permissions: string[]) =>
  visibleNavigationItems(administrationNavigationItems, permissions).map((item) => item.label);

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
    expect(queue?.requiresAny).toEqual(['user.approve', 'branch.activate']);
    const users = administrationNavigationItems[2];
    expect(users?.label).toBe('Users & access');
    expect(users?.requiresAny).toEqual(['user.view']);
  });

  it('shows the Approval queue to a holder of either decision, and only then', () => {
    expect(labels(['user.approve'])).toEqual(['Overview', 'Approval queue']);
    expect(labels(['branch.activate', 'branch.view'])).toEqual([
      'Overview',
      'Approval queue',
      'Branches',
    ]);
    expect(labels(['user.view'])).toEqual(['Overview', 'Users & access']);
    expect(labels(['branch.view'])).toEqual(['Overview', 'Branches']);
  });
});
