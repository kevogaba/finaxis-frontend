import { describe, expect, it } from 'vitest';
import type { Permission } from './role-contract';
import {
  assignmentsDescription,
  canAssignRole,
  canCreateRole,
  canEditRole,
  canGrantPermissions,
  canRemovePermissions,
  canRevokeRoleAssignments,
  grantableOptions,
  groupByModule,
  isAssignmentRevocable,
  moduleLabel,
  neededByNames,
  roleDraftSchema,
  roleStatusAction,
  scopeLabel,
} from './role-rules';

const ALL = [
  'role.view',
  'role.update',
  'role.activate',
  'role.deactivate',
  'role.assign_permission',
  'role.remove_permission',
  'permission.view',
  'user.assign_role',
  'user.revoke_role',
  'role_assignment.view',
  'user.view',
];
/** Every code held tenant-wide. */
const wide = (permissions: readonly string[]) => ({ permissions, tenantPermissions: permissions });
const CUSTOM = { systemRole: false, status: 'ACTIVE' } as const;
const SYSTEM = { systemRole: true, status: 'ACTIVE' } as const;
const DRAFT = { roleCode: 'CREDIT_CLERK', roleName: 'Credit clerk', description: '' };
const permission = (code: string, module: string): Permission => ({
  id: code,
  code,
  name: code,
  module,
  risk: 'LOW',
  status: 'ACTIVE',
  kind: 'VIEW',
  grantScope: 'TENANT',
  requiredViewPermissions: [],
});

describe('role rules', () => {
  it.each([
    ['ACTIVE', 'deactivate'],
    ['DISABLED', 'activate'],
    ['ARCHIVED', 'activate'],
  ] as const)('a custom %s role offers %s (any state → ACTIVE / DISABLED)', (status, expected) => {
    expect(roleStatusAction({ systemRole: false, status }, wide(ALL))).toBe(expected);
  });

  it('hides every mutation of a system role (contract §E.3: 409), but still assigns it', () => {
    const holder = { permissions: ALL, tenantPermissions: ALL };
    expect(roleStatusAction(SYSTEM, holder)).toBeNull();
    expect(canEditRole(SYSTEM, holder)).toBe(false);
    expect(canGrantPermissions(SYSTEM, holder)).toBe(false);
    expect(canRemovePermissions(SYSTEM, holder)).toBe(false);
    expect(canAssignRole(SYSTEM, holder)).toBe(true);
  });

  it('needs each code plus role.view for the read-back (BG-31)', () => {
    expect(roleStatusAction(CUSTOM, wide(['role.deactivate']))).toBeNull();
    expect(roleStatusAction(CUSTOM, wide(['role.view', 'role.activate']))).toBeNull();
    expect(canEditRole(CUSTOM, wide(['role.update']))).toBe(false);
    expect(canEditRole(CUSTOM, wide(['role.update', 'role.view']))).toBe(true);
    expect(canCreateRole(wide(['role.create']))).toBe(false);
    expect(canCreateRole(wide(['role.create', 'role.view']))).toBe(true);
    // The grant drawer browses the catalogue, so it needs permission.view too.
    expect(canGrantPermissions(CUSTOM, wide(['role.assign_permission', 'role.view']))).toBe(false);
    expect(
      canGrantPermissions(CUSTOM, wide(['role.assign_permission', 'role.view', 'permission.view'])),
    ).toBe(true);
    expect(canRemovePermissions(CUSTOM, wide(['role.remove_permission']))).toBe(false);
    expect(canRemovePermissions(CUSTOM, wide(['role.remove_permission', 'role.view']))).toBe(true);
  });

  // Review Focus 3: RoleManagementService checks each role mutation and its view tenant-wide
  // (BG-33), so a branch-scoped grant offers nothing.
  it.each([
    ['the mutation', 'role.update'],
    ['its view', 'role.view'],
  ])('offers no role change while %s is held only at branch scope', (_case, branchOnly) => {
    const codes = [...ALL, 'role.create'];
    const holder = { permissions: codes, tenantPermissions: codes.filter((c) => c !== branchOnly) };
    expect(canEditRole(CUSTOM, holder)).toBe(false);
    if (branchOnly === 'role.view') {
      expect(roleStatusAction(CUSTOM, holder)).toBeNull();
      expect(canCreateRole(holder)).toBe(false);
      expect(canGrantPermissions(CUSTOM, holder)).toBe(false);
      expect(canRemovePermissions(CUSTOM, holder)).toBe(false);
    }
  });

  it('assigns only ACTIVE roles, with the user search; revokes with the read-back', () => {
    const codes = ['user.assign_role', 'role_assignment.view', 'role.view', 'user.view'];
    const holder = { permissions: codes, tenantPermissions: codes };
    expect(canAssignRole(CUSTOM, holder)).toBe(true);
    expect(canAssignRole({ status: 'DISABLED' }, holder)).toBe(false);
    expect(canRevokeRoleAssignments({ permissions: ['user.revoke_role'] })).toBe(false);
    // Revoking is checked on the assignment's target, so a branch-scoped grant counts.
    expect(
      canRevokeRoleAssignments({ permissions: ['user.revoke_role', 'role_assignment.view'] }),
    ).toBe(true);
    expect([scopeLabel('TENANT'), scopeLabel('BRANCH')]).toEqual(['Institution', 'Branch']);
  });

  // Review Focus 3: user.assign_role implies role_assignment.view (ADR 0030), and the drawer's
  // user search reads /tenant/users, which needs user.view tenant-wide (BG-33).
  it.each([
    [
      'the mutation without its view',
      false,
      ['user.assign_role', 'role.view', 'user.view'],
      ['user.view'],
    ],
    [
      'user.view held only at branch scope',
      false,
      ['user.assign_role', 'role_assignment.view', 'role.view', 'user.view'],
      ['user.assign_role', 'role_assignment.view', 'role.view'],
    ],
    [
      'both tenant-wide',
      true,
      ['user.assign_role', 'role_assignment.view', 'role.view', 'user.view'],
      ['user.assign_role', 'role_assignment.view', 'role.view', 'user.view'],
    ],
  ] as const)('Assign: %s → %s', (_case, expected, permissions, tenantPermissions) => {
    expect(canAssignRole(CUSTOM, { permissions, tenantPermissions })).toBe(expected);
  });

  it('offers no revoke for a branch assignment elsewhere in a branch context (§E.4: 404)', () => {
    const here = { scopeType: 'BRANCH', branchId: 'branch-a' } as const;
    const elsewhere = { scopeType: 'BRANCH', branchId: 'branch-b' } as const;
    const everywhere = { scopeType: 'TENANT', branchId: null } as const;
    // Institution level reaches every assignment.
    expect(isAssignmentRevocable(here, null)).toBe(true);
    expect(isAssignmentRevocable(elsewhere, null)).toBe(true);
    // A branch context reaches its own branch and the institution-wide rows, nothing else.
    expect(isAssignmentRevocable(here, 'branch-a')).toBe(true);
    expect(isAssignmentRevocable(everywhere, 'branch-a')).toBe(true);
    expect(isAssignmentRevocable(elsewhere, 'branch-a')).toBe(false);
  });

  it('tells an assigner to activate an inactive role, and nobody else', () => {
    const codes = ['user.assign_role', 'role_assignment.view', 'role.view', 'user.view'];
    const assigner = { permissions: codes, tenantPermissions: codes };
    const activate = 'Activate this role to assign it.';
    expect(assignmentsDescription({ status: 'DISABLED' }, assigner)).toBe(activate);
    expect(assignmentsDescription({ status: 'ARCHIVED' }, assigner)).toBe(activate);
    // An ACTIVE role gets the ordinary description.
    expect(assignmentsDescription({ status: 'ACTIVE' }, assigner)).toMatch(/^Who holds this role/);
    // So does a viewer who couldn't assign it anyway, missing either permission.
    for (const permissions of [['user.view'], ['user.assign_role']]) {
      expect(assignmentsDescription({ status: 'DISABLED' }, { permissions })).toMatch(
        /^Who holds this role/,
      );
    }
  });

  it('groups the catalogue by module label, permissions by code', () => {
    const groups = groupByModule([
      permission('role.view', 'iam'),
      permission('audit.view', 'audit'),
      permission('auth.select_branch', 'iam'),
    ]);
    expect(groups.map((group) => [group.label, group.permissions.map((p) => p.code)])).toEqual([
      ['Audit', ['audit.view']],
      ['IAM', ['auth.select_branch', 'role.view']],
    ]);
    expect(moduleLabel('settings')).toBe('Settings');
  });

  it('validates a role like the backend does, plus the frontend caps', () => {
    expect(roleDraftSchema.safeParse(DRAFT).success).toBe(true);
    expect(roleDraftSchema.safeParse({ ...DRAFT, roleCode: 'credit clerk' }).success).toBe(false);
    expect(roleDraftSchema.safeParse({ ...DRAFT, roleCode: 'X' }).success).toBe(false);
    expect(roleDraftSchema.safeParse({ ...DRAFT, roleName: '   ' }).success).toBe(false);
    expect(roleDraftSchema.safeParse({ ...DRAFT, description: 'x'.repeat(501) }).success).toBe(
      false,
    );
  });
});

describe('the grant drawer and Remove (ADR 0030)', () => {
  const entry = (code: string, name: string, overrides: Partial<Permission> = {}): Permission => ({
    ...permission(code, 'iam'),
    name,
    ...overrides,
  });
  const CATALOGUE = [
    entry('branch.view', 'View branch'),
    entry('branch.create', 'Create branch', {
      kind: 'MUTATION',
      requiredViewPermissions: ['branch.view'],
    }),
    entry('branch.activate', 'Activate branch', {
      kind: 'MUTATION',
      status: 'DEPRECATED',
      requiredViewPermissions: ['branch.view'],
    }),
    entry('tenant.create', 'Create organisation', {
      kind: 'MUTATION',
      grantScope: 'PLATFORM',
      requiredViewPermissions: ['tenant.view'],
    }),
    entry('role.view', 'View roles'),
  ];
  const byCode = new Map(CATALOGUE.map((item) => [item.code, item]));

  it('offers only ACTIVE tenant-scope codes the role lacks', () => {
    const offered = grantableOptions(CATALOGUE, new Set(['role.view']));
    expect(offered.map((item) => item.name)).toEqual(['View branch', 'Create branch']);
  });

  it('names the granted ACTIVE mutations that need a view, never a DEPRECATED one', () => {
    expect(
      neededByNames('branch.view', new Set(['branch.view', 'branch.activate']), byCode),
    ).toEqual([]);
    expect(
      neededByNames(
        'branch.view',
        new Set(['branch.view', 'branch.create', 'branch.activate']),
        byCode,
      ),
    ).toEqual(['Create branch']);
    expect(neededByNames('role.view', new Set(['branch.create']), byCode)).toEqual([]);
  });

  it('assumes a mutation it has no catalogue entry for still grants, naming it by code', () => {
    expect(neededByNames('branch.view', new Set(['branch.create']), new Map())).toEqual([
      'branch.create',
    ]);
  });
});
