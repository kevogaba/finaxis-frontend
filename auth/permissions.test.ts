import { describe, expect, it } from 'vitest';
import {
  can,
  canAll,
  canAllTenantWide,
  canAny,
  canTenantWide,
  permissionHolder,
} from './permissions';

const holder = { permissions: ['user.view', 'role.view'] };

describe('permission helpers', () => {
  it('checks a single code', () => {
    expect(can(holder, 'user.view')).toBe(true);
    expect(can(holder, 'user.invite')).toBe(false);
  });

  it('requires every code for canAll and any code for canAny', () => {
    expect(canAll(holder, ['user.view', 'role.view'])).toBe(true);
    expect(canAll(holder, ['user.view', 'user.invite'])).toBe(false);
    expect(canAny(holder, ['user.invite', 'role.view'])).toBe(true);
    expect(canAny(holder, ['user.invite'])).toBe(false);
  });

  it('treats an empty requirement list as satisfied for canAll and unsatisfied for canAny', () => {
    expect(canAll(holder, [])).toBe(true);
    expect(canAny(holder, [])).toBe(false);
  });
});

describe('tenant-wide grants (BG-33)', () => {
  const profile = {
    permissions: ['branch.view', 'user.view', 'role.view'],
    permission_scopes: [
      { code: 'branch.view', scope: 'TENANT' as const },
      { code: 'role.view', scope: 'TENANT' as const },
      { code: 'user.view', scope: 'BRANCH' as const, branch_ids: ['b-1', 'b-2'] },
    ],
  };

  it('holds only the TENANT entries tenant-wide', () => {
    expect(permissionHolder(profile)).toEqual({
      permissions: ['branch.view', 'user.view', 'role.view'],
      tenantPermissions: ['branch.view', 'role.view'],
    });
  });

  it('holds nothing without a profile (an unresolved context)', () => {
    expect(permissionHolder(undefined)).toEqual({ permissions: [], tenantPermissions: [] });
  });

  it('refuses a code held only at branch scope, or by a holder without scopes', () => {
    const scoped = permissionHolder(profile);
    expect(can(scoped, 'user.view')).toBe(true);
    expect(canTenantWide(scoped, 'user.view')).toBe(false);
    expect(canTenantWide(scoped, 'branch.view')).toBe(true);
    expect(canTenantWide(holder, 'user.view')).toBe(false);
  });

  it('requires every code tenant-wide for canAllTenantWide', () => {
    const scoped = permissionHolder(profile);
    expect(canAllTenantWide(scoped, ['branch.view', 'role.view'])).toBe(true);
    expect(canAllTenantWide(scoped, ['branch.view', 'user.view'])).toBe(false);
  });
});
