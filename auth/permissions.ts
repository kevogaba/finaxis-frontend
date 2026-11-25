import type { BackendProfile } from './context.types';

/**
 * Permission checks over the sanitized FinaxisUser's effective permission codes (from
 * `/auth/me` for the active context). UI gating only — the backend remains the authority.
 * Client-safe: no server-only imports.
 */
export interface PermissionHolder {
  permissions: readonly string[];
  /** The codes held tenant-wide (`/auth/me`'s TENANT scopes, BG-33); none when absent. */
  tenantPermissions?: readonly string[];
}

/** The holder a page gates with: its effective codes, and the ones held tenant-wide; nothing
 * without a profile (an unresolved context). */
export function permissionHolder(
  profile: Pick<BackendProfile, 'permissions' | 'permission_scopes'> | undefined,
): Required<PermissionHolder> {
  return {
    permissions: profile?.permissions ?? [],
    tenantPermissions:
      profile?.permission_scopes
        .filter((entry) => entry.scope === 'TENANT')
        .map((entry) => entry.code) ?? [],
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
