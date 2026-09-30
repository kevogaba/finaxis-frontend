import type { AssignedBranch, FinaxisUser, OrganizationSummary } from '@/auth/auth.types';
import { can, type PermissionHolder } from '@/auth/permissions';
import { humanizeEnum } from '@/components/data-display/status-chip';
import type { ApplicationContextModule } from '@/config/application-context';

export interface ProfileBranch extends AssignedBranch {
  code: string;
  status: string;
}

export interface ProfileRole {
  id: string;
  code: string;
  name: string;
  status: string;
}

/**
 * The shell's sanitized `FinaxisUser` plus the display-only `/auth/me` fields the profile tabs
 * render (AGENTS.md: profile UI renders only the sanitized DTO — never the raw backend profile,
 * its Keycloak subject, or tokens). Built server-side by `toProfileUser`.
 */
export interface ProfileUser extends FinaxisUser {
  organization: OrganizationSummary & { code: string; status: string };
  branches: readonly ProfileBranch[];
  membershipStatus: string;
  /** Per ACTIVE role assignment at any scope, de-duplicated; may include DISABLED roles. */
  assignedRoles: readonly ProfileRole[];
}

export interface PermissionGroup {
  prefix: string;
  label: string;
  codes: readonly string[];
}

// Prefixes that humanize badly; every other prefix reads fine through humanizeEnum.
const PREFIX_LABELS: Readonly<Record<string, string>> = {
  iam: 'IAM',
  cob: 'Close of business',
};

/**
 * Effective codes grouped by their first segment (`business_date.view` → `business_date`).
 * `/auth/me` returns codes only; the catalogue's `module_code` needs `permission.view`, which the
 * platform context can't read — so the profile groups by prefix (lane ownership: 15).
 */
export function groupPermissions(codes: readonly string[]): PermissionGroup[] {
  const byPrefix = new Map<string, Set<string>>();
  for (const code of codes) {
    const prefix = code.split('.')[0] ?? code;
    byPrefix.set(prefix, (byPrefix.get(prefix) ?? new Set<string>()).add(code));
  }
  return [...byPrefix.keys()].sort().map((prefix) => ({
    prefix,
    label: PREFIX_LABELS[prefix] ?? humanizeEnum(prefix),
    codes: [...(byPrefix.get(prefix) ?? [])].sort(),
  }));
}

/**
 * Spec §10.9: own audit events "when audit.view" — and only in a tenant context. The tenant audit
 * API rejects the platform context even for an `audit.view` holder (BG-06).
 */
export function canViewActivity(
  user: PermissionHolder,
  moduleId: ApplicationContextModule['id'],
): boolean {
  return moduleId !== 'platform-administration' && can(user, 'audit.view');
}

export function workspaceHome(
  moduleId: ApplicationContextModule['id'],
): '/admin' | '/platform-admin' {
  return moduleId === 'platform-administration' ? '/platform-admin' : '/admin';
}
