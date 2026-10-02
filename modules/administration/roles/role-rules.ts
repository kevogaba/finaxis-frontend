import { z } from 'zod';
import { can, canAll, type PermissionHolder } from '@/auth/permissions';
import { humanizeEnum } from '@/components/data-display/status-chip';
import type { Permission, RoleScopeType, RoleStatus } from './role-contract';

interface RoleShape {
  systemRole: boolean;
  status: RoleStatus;
}

export function roleTypeLabel(systemRole: boolean): string {
  return systemRole ? 'System role' : 'Custom role';
}

export const SYSTEM_ROLE_NOTE =
  "System roles come from the platform: their name, status and permissions can't be changed. You can still assign them.";

export type RoleLifecycleAction = 'activate' | 'deactivate';

/** Every role mutation reads the role back, so it also needs `role.view` (BG-31). */
export function canCreateRole(holder: PermissionHolder): boolean {
  return canAll(holder, ['role.create', 'role.view']);
}

/** The one status toggle on offer — custom roles only, since a system role answers 409 (contract
 * §E.3). Activate and deactivate work from any state, so an ARCHIVED role offers Activate. */
export function roleStatusAction(
  role: RoleShape,
  holder: PermissionHolder,
): RoleLifecycleAction | null {
  if (role.systemRole || !can(holder, 'role.view')) return null;
  if (role.status === 'ACTIVE') return can(holder, 'role.deactivate') ? 'deactivate' : null;
  return can(holder, 'role.activate') ? 'activate' : null;
}

export function canEditRole(role: RoleShape, holder: PermissionHolder): boolean {
  return !role.systemRole && canAll(holder, ['role.update', 'role.view']);
}

/** The drawer browses the catalogue, so granting also needs `permission.view`. */
export function canGrantPermissions(role: RoleShape, holder: PermissionHolder): boolean {
  return (
    !role.systemRole && canAll(holder, ['role.assign_permission', 'role.view', 'permission.view'])
  );
}

export function canRemovePermissions(role: RoleShape, holder: PermissionHolder): boolean {
  return !role.systemRole && canAll(holder, ['role.remove_permission', 'role.view']);
}

/** Only an ACTIVE role: a DISABLED one grants nothing (BG-27). The drawer's user search needs
 * `user.view`. System roles are assignable. */
export function canAssignRole(role: Pick<RoleShape, 'status'>, holder: PermissionHolder): boolean {
  return role.status === 'ACTIVE' && canAll(holder, ['user.assign_role', 'user.view']);
}

export function canRevokeRoleAssignments(holder: PermissionHolder): boolean {
  return canAll(holder, ['user.revoke_role', 'role_assignment.view']);
}

/** From a branch-selected context, revoking a BRANCH assignment at another branch is a 404
 * (contract §E.4), so its Revoke is hidden rather than a dead end. `null` is institution level. */
export function isAssignmentRevocable(
  assignment: { scopeType: RoleScopeType; branchId: string | null },
  selectedBranchId: string | null,
): boolean {
  return (
    selectedBranchId === null ||
    assignment.scopeType !== 'BRANCH' ||
    assignment.branchId === selectedBranchId
  );
}

/** The Assignments card's description. An assigner looking at an inactive role is told why Assign
 * is missing (Ruling 10: a DISABLED role grants nothing). */
export function assignmentsDescription(
  role: Pick<RoleShape, 'status'>,
  holder: PermissionHolder,
): string {
  // The permission rule lives only in canAssignRole: ask it about the role once it is ACTIVE.
  return role.status !== 'ACTIVE' && canAssignRole({ status: 'ACTIVE' }, holder)
    ? 'Activate this role to assign it.'
    : 'Who holds this role. Institution scope applies everywhere; branch scope only while that branch is selected.';
}

export function scopeLabel(scopeType: RoleScopeType): string {
  return scopeType === 'TENANT' ? 'Institution' : 'Branch';
}

const MODULE_LABELS: Partial<Record<string, string>> = { iam: 'IAM' };

export function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? humanizeEnum(module);
}

export interface PermissionGroup {
  module: string;
  label: string;
  permissions: Permission[];
}

/** The catalogue grouped by module: groups by label, permissions by code. */
export function groupByModule(permissions: readonly Permission[]): PermissionGroup[] {
  const groups = new Map<string, Permission[]>();
  for (const permission of permissions) {
    const group = groups.get(permission.module);
    if (group) group.push(permission);
    else groups.set(permission.module, [permission]);
  }
  return [...groups]
    .map(([module, items]) => ({
      module,
      label: moduleLabel(module),
      permissions: items.sort((a, b) => a.code.localeCompare(b.code)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Codes per grant submit, each its own POST (Ruling 5); the write budget is 120/min. */
export const MAX_GRANTS_PER_SUBMIT = 25;

/** CreateRole (contract §D), shared by the form (RHF) and the Server Action. The backend columns
 * are TEXT; the name and description caps are the frontend's (Ruling 19). */
export const roleDraftSchema = z.object({
  roleCode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_-]{2,20}$/, 'Use 2–20 capital letters, digits, underscores or hyphens.'),
  roleName: z.string().trim().min(1, 'Enter a role name.').max(100, 'Use at most 100 characters.'),
  description: z.string().trim().max(500, 'Use at most 500 characters.'),
});

export type RoleDraftValues = z.infer<typeof roleDraftSchema>;

/** The edit form: the code shows read-only and is never sent (UpdateRole has no code). */
export const roleEditFormSchema = roleDraftSchema.extend({ roleCode: z.string() });
