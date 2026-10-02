/**
 * Permission checks over the sanitized FinaxisUser's effective permission codes (from
 * `/auth/me` for the active context). UI gating only — the backend remains the authority.
 * Client-safe: no server-only imports.
 */
export interface PermissionHolder {
  permissions: readonly string[];
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
