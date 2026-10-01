import { describe, expect, it } from 'vitest';
import type { Permission } from './role-contract';
import {
  canAssignRole,
  canCreateRole,
  canEditRole,
  canGrantPermissions,
  canRemovePermissions,
  canRevokeRoleAssignments,
  groupByModule,
  moduleLabel,
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
});

describe('role rules', () => {
  it.each([
    ['ACTIVE', 'deactivate'],
    ['DISABLED', 'activate'],
    ['ARCHIVED', 'activate'],
  ] as const)('a custom %s role offers %s (any state → ACTIVE / DISABLED)', (status, expected) => {
    expect(roleStatusAction({ systemRole: false, status }, { permissions: ALL })).toBe(expected);
  });

  it('hides every mutation of a system role (contract §E.3: 409), but still assigns it', () => {
    const holder = { permissions: ALL };
    expect(roleStatusAction(SYSTEM, holder)).toBeNull();
    expect(canEditRole(SYSTEM, holder)).toBe(false);
    expect(canGrantPermissions(SYSTEM, holder)).toBe(false);
    expect(canRemovePermissions(SYSTEM, holder)).toBe(false);
    expect(canAssignRole(SYSTEM, holder)).toBe(true);
  });

  it('needs each code plus role.view for the read-back (BG-31)', () => {
    expect(roleStatusAction(CUSTOM, { permissions: ['role.deactivate'] })).toBeNull();
    expect(roleStatusAction(CUSTOM, { permissions: ['role.view', 'role.activate'] })).toBeNull();
    expect(canEditRole(CUSTOM, { permissions: ['role.update'] })).toBe(false);
    expect(canEditRole(CUSTOM, { permissions: ['role.update', 'role.view'] })).toBe(true);
    expect(canCreateRole({ permissions: ['role.create'] })).toBe(false);
    expect(canCreateRole({ permissions: ['role.create', 'role.view'] })).toBe(true);
    // The grant drawer browses the catalogue, so it needs permission.view too.
    expect(
      canGrantPermissions(CUSTOM, { permissions: ['role.assign_permission', 'role.view'] }),
    ).toBe(false);
    expect(canRemovePermissions(CUSTOM, { permissions: ['role.remove_permission'] })).toBe(false);
  });

  it('assigns only ACTIVE roles, with the user search; revokes with the read-back', () => {
    const holder = { permissions: ['user.assign_role', 'user.view'] };
    expect(canAssignRole(CUSTOM, holder)).toBe(true);
    expect(canAssignRole({ status: 'DISABLED' }, holder)).toBe(false);
    expect(canAssignRole(CUSTOM, { permissions: ['user.assign_role'] })).toBe(false);
    expect(canRevokeRoleAssignments({ permissions: ['user.revoke_role'] })).toBe(false);
    expect(
      canRevokeRoleAssignments({ permissions: ['user.revoke_role', 'role_assignment.view'] }),
    ).toBe(true);
    expect([scopeLabel('TENANT'), scopeLabel('BRANCH')]).toEqual(['Institution', 'Branch']);
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
