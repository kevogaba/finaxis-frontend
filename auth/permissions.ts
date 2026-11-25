import type { BackendProfile } from './context.types';
import { withViews } from './permission-views';

/**
 * Permission checks over the sanitized FinaxisUser's effective permission codes (from
 * `/auth/me` for the active context). UI gating only — the backend remains the authority.
 * Client-safe: no server-only imports.
 */
export interface PermissionHolder {
  permissions: readonly string[];
  /** The codes held tenant-wide (`/auth/me`'s TENANT scopes, BG-33); none when absent. */
  tenantPermissions?: readonly string[];
  /** Each code held only through BRANCH grants, with the branches they name (`/auth/me`'s BRANCH
   * scopes' `branch_ids`): every ACTIVE branch, not only the selected one (#242); none when absent. */
  branchPermissions?: Readonly<Record<string, readonly string[]>>;
}

/** The holder a page gates with: its effective codes, the ones held tenant-wide, and where the
 * others are held; nothing without a profile (an unresolved context). */
export function permissionHolder(
  profile: Pick<BackendProfile, 'permissions' | 'permission_scopes'> | undefined,
): Required<PermissionHolder> {
  const scopes = profile?.permission_scopes ?? [];
  return {
    permissions: profile?.permissions ?? [],
    tenantPermissions: scopes
      .filter((entry) => entry.scope === 'TENANT')
      .map((entry) => entry.code),
    branchPermissions: Object.fromEntries(
      scopes
        .filter((entry) => entry.scope === 'BRANCH')
        .map((entry) => [entry.code, entry.branch_ids ?? []]),
    ),
  };
}

export function can(holder: PermissionHolder, code: string): boolean {
  return holder.permissions.includes(code);
}

export function canAll(holder: PermissionHolder, codes: readonly string[]): boolean {
  return codes.every((code) => can(holder, code));
}

export function canAny(holder: PermissionHolder, codes: readonly string[]): boolean {
  return codes.some((code) => can(holder, code));
}

/** For a route the platform checks tenant-wide: a branch-scoped grant doesn't count there. */
export function canTenantWide(holder: PermissionHolder, code: string): boolean {
  return holder.tenantPermissions?.includes(code) ?? false;
}

export function canAllTenantWide(holder: PermissionHolder, codes: readonly string[]): boolean {
  return codes.every((code) => canTenantWide(holder, code));
}

/** Whether `code` is held anywhere: in the selected context, tenant-wide, or through a BRANCH grant
 * at any branch (`branchPermissions`), whichever branch is selected. For a target-aware read the
 * platform answers with the branches a grant covers, at All branches too (BG-03). Server-side only:
 * a Client Component's holder has no `branchPermissions`. */
export function canAnywhere(holder: PermissionHolder, code: string): boolean {
  return (
    can(holder, code) ||
    canTenantWide(holder, code) ||
    (holder.branchPermissions?.[code]?.length ?? 0) > 0
  );
}

/** The platform's target check (`branchVisibility`, BG-03): every code held tenant-wide, or
 * through a BRANCH grant at `branchId`, whichever branch is selected. `null` is a target only a
 * tenant-wide grant reaches: institution scope, or a branch that isn't ACTIVE (#242). */
export function canAllAtBranch(
  holder: PermissionHolder,
  codes: readonly string[],
  branchId: string | null,
): boolean {
  return codes.every(
    (code) =>
      canTenantWide(holder, code) ||
      (branchId !== null && (holder.branchPermissions?.[code]?.includes(branchId) ?? false)),
  );
}

/**
 * A branch action passes two independent checks on the platform (BG-03):
 * - the route's own gate (`@PreAuthorize`): one of `routeCodes`, the action's code unless the route
 *   names others, in the selected context (`/auth/me`'s `permissions`), so at All branches only a
 *   tenant-wide grant passes it;
 * - the service's target check: `code` and every view it implies (ADR 0030) at `branchId`
 *   (`canAllAtBranch`).
 * So a role held at two branches acts on either while one of them is selected.
 */
export function canActAtBranch(
  holder: PermissionHolder,
  code: string,
  branchId: string | null,
  routeCodes: readonly string[] = [code],
): boolean {
  return canAny(holder, routeCodes) && canAllAtBranch(holder, withViews([code]), branchId);
}

/** Adding to your own access (a role or a branch for yourself, a permission to or re-enabling a
 * role you hold) also needs `user.assign_self` and its view tenant-wide, which only the seeded
 * administrators hold (platform #342, ADR 0044). */
export function ownAccessBlocked(self: boolean, holder: PermissionHolder): boolean {
  return self && !canAllTenantWide(holder, withViews(['user.assign_self']));
}
