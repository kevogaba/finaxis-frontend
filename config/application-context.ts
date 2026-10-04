import 'server-only';
import { serverEnv } from '@/config/env.server';

export const administrationModule = {
  id: 'administration',
  name: 'Administration',
} as const;

export const platformAdministrationModule = {
  id: 'platform-administration',
  name: 'Platform Administration',
} as const;

export type ApplicationContextModule =
  typeof administrationModule | typeof platformAdministrationModule;

export interface ApplicationContextOrganization {
  id: string;
  name: string;
}

export interface ApplicationContextBranch {
  id: string;
  name: string;
}

export interface ApplicationContext {
  module: ApplicationContextModule;
  organization: ApplicationContextOrganization;
  /** `null` = All branches (organisation selected, no branch — institution level). */
  branch: ApplicationContextBranch | null;
}

/**
 * Case-insensitive: UUID_PATTERN (lib/api/wire.ts) and the env's `z.uuid()` both accept upper
 * case, so a strict comparison would let an upper-cased platform id pass as an ordinary one.
 */
export function isPlatformOrganisation(organisationId: string): boolean {
  return organisationId.toLowerCase() === serverEnv.PLATFORM_ORGANISATION_ID.toLowerCase();
}

export function resolveApplicationContextModule(organisationId: string): ApplicationContextModule {
  return isPlatformOrganisation(organisationId)
    ? platformAdministrationModule
    : administrationModule;
}
