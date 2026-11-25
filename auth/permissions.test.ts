import { describe, expect, it } from 'vitest';
import {
  can,
  canActAtBranch,
  canAll,
  canAllAtBranch,
  canAllTenantWide,
  canAny,
  canAnywhere,
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
      branchPermissions: { 'user.view': ['b-1', 'b-2'] },
    });
  });

  it('holds nothing without a profile (an unresolved context)', () => {
    expect(permissionHolder(undefined)).toEqual({
      permissions: [],
      tenantPermissions: [],
      branchPermissions: {},
    });
  });

  it('keeps a BRANCH scope with no branch_ids as held nowhere', () => {
    expect(
      permissionHolder({
        permissions: [],
        permission_scopes: [{ code: 'user.view', scope: 'BRANCH' }],
      }).branchPermissions,
    ).toEqual({ 'user.view': [] });
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

describe('acting on a branch (BG-03)', () => {
  const codes = ['branch.suspend', 'branch.view', 'user.revoke_branch', 'branch_assignment.view'];
  /** One role at branches A and B; `selected` its working context (`/auth/me`). */
  const atAandB = (selected: string | null) =>
    permissionHolder({
      permissions: selected === 'A' ? codes : [],
      permission_scopes: codes.map((code) => ({
        code,
        scope: 'BRANCH' as const,
        branch_ids: ['A', 'B'],
      })),
    });

  it('finds a code at a branch tenant-wide or through its BRANCH grants, whichever is selected', () => {
    expect(canAllAtBranch(atAandB(null), ['branch.suspend', 'branch.view'], 'B')).toBe(true);
    expect(canAllAtBranch(atAandB(null), ['branch.suspend'], 'C')).toBe(false);
    // `null`: institution scope, or a branch that isn't ACTIVE: tenant-wide only.
    expect(canAllAtBranch(atAandB('A'), ['branch.suspend'], null)).toBe(false);
    const wide = { permissions: ['branch.view'], tenantPermissions: ['branch.view'] };
    expect(canAllAtBranch(wide, ['branch.view'], null)).toBe(true);
    expect(canAllAtBranch(wide, ['branch.view', 'branch.close'], 'B')).toBe(false);
  });

  // The motivating case: the same role at A and B, A selected, opening B.
  it('passes the route gate in the selected context and the target check at the target', () => {
    expect(canActAtBranch(atAandB('A'), 'branch.suspend', 'B')).toBe(true);
    expect(canActAtBranch(atAandB('A'), 'user.revoke_branch', 'B')).toBe(true);
    // At All branches the route gate fails: the grants aren't in `permissions`.
    expect(canActAtBranch(atAandB(null), 'branch.suspend', 'B')).toBe(false);
    // A branch the grants don't name, or one that isn't ACTIVE.
    expect(canActAtBranch(atAandB('A'), 'branch.suspend', 'C')).toBe(false);
    expect(canActAtBranch(atAandB('A'), 'branch.suspend', null)).toBe(false);
    // The views a mutation implies, at the target (ADR 0030).
    expect(canActAtBranch(atAandB('A'), 'branch.close', 'B')).toBe(false);
  });

  // A target-aware read (GET /branches) answers a BRANCH grant at All branches too.
  it('finds a code held anywhere: selected context, tenant-wide or at any branch', () => {
    expect(canAnywhere(atAandB(null), 'branch.view')).toBe(true);
    expect(canAnywhere(atAandB('A'), 'branch.view')).toBe(true);
    expect(
      canAnywhere({ permissions: [], tenantPermissions: ['branch.view'] }, 'branch.view'),
    ).toBe(true);
    expect(canAnywhere(atAandB(null), 'branch.close')).toBe(false);
    // A BRANCH scope naming no branch is held nowhere.
    expect(
      canAnywhere({ permissions: [], branchPermissions: { 'branch.view': [] } }, 'branch.view'),
    ).toBe(false);
  });

  it('takes any of the route codes for the gate, and the intent code for the target', () => {
    const holder = {
      permissions: ['branch.create', 'branch.view'],
      tenantPermissions: ['branch.view'],
      branchPermissions: { 'branch.approve': ['B'] },
    };
    expect(canActAtBranch(holder, 'branch.approve', 'B', ['branch.create', 'branch.approve'])).toBe(
      true,
    );
    expect(canActAtBranch(holder, 'branch.approve', 'B')).toBe(false);
  });
});
