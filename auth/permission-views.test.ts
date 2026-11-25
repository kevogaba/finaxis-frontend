import { describe, expect, it } from 'vitest';
import { PERMISSION_VIEWS, requiredViews, withViews } from './permission-views';

describe('permission view pairs (ADR 0030, V22)', () => {
  it('names every view a mutation needs, in the platform order', () => {
    expect(requiredViews('user.invite')).toEqual(['membership.view', 'user.view']);
    expect(requiredViews('user.assign_role')).toEqual(['role_assignment.view']);
    expect(requiredViews('user.assign_self')).toEqual(['user.view']);
  });

  it('needs nothing for a view or an unknown code', () => {
    expect(requiredViews('user.view')).toEqual([]);
    expect(requiredViews('auth.select_branch')).toEqual([]);
    expect(requiredViews('nope.create')).toEqual([]);
  });

  it("appends each code's views once, after the codes", () => {
    expect(withViews(['user.invite'])).toEqual(['user.invite', 'membership.view', 'user.view']);
    expect(withViews(['user.assign_role', 'role_assignment.view'])).toEqual([
      'user.assign_role',
      'role_assignment.view',
    ]);
    expect(withViews(['user.invite', 'user.approve'])).toEqual([
      'user.invite',
      'user.approve',
      'membership.view',
      'user.view',
    ]);
  });

  it('pairs only views', () => {
    const views = Object.values(PERMISSION_VIEWS).flat();
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) expect(view).toMatch(/\.view$/);
  });
});
