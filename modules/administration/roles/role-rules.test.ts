import { describe, expect, it } from 'vitest';
import type { Permission } from './role-contract';
import {
  assignmentsDescription,
  canArchiveRole,
  canAssignRole,
  canCreateRole,
  canEditRole,
  canGrantPermissions,
  canRemovePermissions,
  canRevokeRoleAssignments,
  grantableOptions,
  groupByModule,
  HELD_ROLE,
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
  'role.archive',
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
  // The role FSM (ADR 0035): each toggle only from its named state, nothing out of ARCHIVED.
  it.each([
    ['ACTIVE', 'deactivate'],
    ['DISABLED', 'activate'],
    ['ARCHIVED', null],
  ] as const)('a custom %s role offers %s', (status, expected) => {
    expect(roleStatusAction({ systemRole: false, status }, wide(ALL), false)).toBe(expected);
    // Holding the role changes nothing for ACTIVE or ARCHIVED.
    if (status !== 'DISABLED') {
      expect(roleStatusAction({ systemRole: false, status }, wide(ALL), true)).toBe(expected);
    }
  });

  it.each([
    ['a custom ACTIVE role', true, CUSTOM],
    ['a custom DISABLED role', true, { systemRole: false, status: 'DISABLED' }],
    ['an ARCHIVED role (final)', false, { systemRole: false, status: 'ARCHIVED' }],
    ['a system role (409)', false, SYSTEM],
  ] as const)('archives %s → %s', (_case, expected, role) => {
    expect(canArchiveRole(role, wide(ALL))).toBe(expected);
  });

  it('archives only with role.archive and role.view, both tenant-wide (BG-33)', () => {
    expect(canArchiveRole(CUSTOM, wide(['role.archive']))).toBe(false);
    expect(canArchiveRole(CUSTOM, wide(['role.archive', 'role.view']))).toBe(true);
    const branchView = {
      permissions: ['role.archive', 'role.view'],
      tenantPermissions: ['role.archive'],
    };
    expect(canArchiveRole(CUSTOM, branchView)).toBe(false);
  });

  it('offers no edit, grant or remove on an archived role (409)', () => {
    const archived = { systemRole: false, status: 'ARCHIVED' } as const;
    expect(canEditRole(archived, wide(ALL))).toBe(false);
    expect(canGrantPermissions(archived, wide(ALL), false)).toBe(false);
    expect(canRemovePermissions(archived, wide(ALL))).toBe(false);
  });

  it('hides every mutation of a system role (contract §E.3: 409), but still assigns it', () => {
    const holder = { permissions: ALL, tenantPermissions: ALL };
    expect(roleStatusAction(SYSTEM, holder, false)).toBeNull();
    expect(canEditRole(SYSTEM, holder)).toBe(false);
    expect(canGrantPermissions(SYSTEM, holder, false)).toBe(false);
    expect(canRemovePermissions(SYSTEM, holder)).toBe(false);
    expect(canAssignRole(SYSTEM, holder)).toBe(true);
  });

  it('needs each code plus role.view for the read-back (BG-31)', () => {
    expect(roleStatusAction(CUSTOM, wide(['role.deactivate']), false)).toBeNull();
    expect(roleStatusAction(CUSTOM, wide(['role.view', 'role.activate']), false)).toBeNull();
    expect(canEditRole(CUSTOM, wide(['role.update']))).toBe(false);
    expect(canEditRole(CUSTOM, wide(['role.update', 'role.view']))).toBe(true);
    expect(canCreateRole(wide(['role.create']))).toBe(false);
    expect(canCreateRole(wide(['role.create', 'role.view']))).toBe(true);
    // The grant drawer browses the catalogue, so it needs permission.view too.
    expect(canGrantPermissions(CUSTOM, wide(['role.assign_permission', 'role.view']), false)).toBe(
      false,
    );
    expect(
      canGrantPermissions(
        CUSTOM,
        wide(['role.assign_permission', 'role.view', 'permission.view']),
        false,
      ),
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
      expect(roleStatusAction(CUSTOM, holder, false)).toBeNull();
      expect(canCreateRole(holder)).toBe(false);
      expect(canGrantPermissions(CUSTOM, holder, false)).toBe(false);
      expect(canRemovePermissions(CUSTOM, holder)).toBe(false);
    }
  });

  // Platform #342 (ADR 0044): adding a permission to, or re-enabling, a role you hold also needs
  // user.assign_self (and its view) tenant-wide; only the seeded administrators hold it.
  it('blocks granting to, or re-enabling, a role you hold without user.assign_self', () => {
    const disabled = { systemRole: false, status: 'DISABLED' } as const;
    const iamAdmin = { permissions: ALL, tenantPermissions: ALL };
    expect(canGrantPermissions(CUSTOM, iamAdmin, true)).toBe(false);
    expect(roleStatusAction(disabled, iamAdmin, true)).toBeNull();
    // Deactivating a role you hold takes nothing from anyone's reach.
    expect(roleStatusAction(CUSTOM, iamAdmin, true)).toBe('deactivate');
    // A role you don't hold, or a holder with user.assign_self tenant-wide, is unaffected.
    expect(canGrantPermissions(CUSTOM, iamAdmin, false)).toBe(true);
    expect(roleStatusAction(disabled, iamAdmin, false)).toBe('activate');
    const admin = {
      permissions: [...ALL, 'user.assign_self'],
      tenantPermissions: [...ALL, 'user.assign_self'],
    };
    expect(canGrantPermissions(CUSTOM, admin, true)).toBe(true);
    expect(roleStatusAction(disabled, admin, true)).toBe('activate');
    // Held only at branch scope, it doesn't count.
    const branchScoped = { permissions: admin.permissions, tenantPermissions: ALL };
    expect(canGrantPermissions(CUSTOM, branchScoped, true)).toBe(false);
    expect(HELD_ROLE).toBe(
      'You hold this role, so adding to it or re-enabling it needs a tenant administrator.',
    );
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
    // An ACTIVE role gets the ordinary description.
    expect(assignmentsDescription({ status: 'ACTIVE' }, assigner)).toMatch(/^Who holds this role/);
    // So does a viewer who couldn't assign it anyway, missing either permission.
    for (const permissions of [['user.view'], ['user.assign_role']]) {
      expect(assignmentsDescription({ status: 'DISABLED' }, { permissions })).toMatch(
        /^Who holds this role/,
      );
    }
  });

  it('tells everyone an archived role is never assigned again', () => {
    const archived = "This role is archived, so it can't be assigned.";
    const codes = ['user.assign_role', 'role_assignment.view', 'role.view', 'user.view'];
    expect(
      assignmentsDescription(
        { status: 'ARCHIVED' },
        { permissions: codes, tenantPermissions: codes },
      ),
    ).toBe(archived);
    expect(assignmentsDescription({ status: 'ARCHIVED' }, { permissions: [] })).toBe(archived);
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

  it('never offers user.assign_self, which every role refuses (422, #342)', () => {
    const withSelf = [
      ...CATALOGUE,
      entry('user.assign_self', 'Assign self', {
        kind: 'MUTATION',
        requiredViewPermissions: ['user.view'],
      }),
    ];
    expect(grantableOptions(withSelf, new Set()).map((item) => item.code)).not.toContain(
      'user.assign_self',
    );
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
