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
  branch: ApplicationContextBranch;
}

export function isPlatformOrganisation(organisationId: string): boolean {
  return organisationId === serverEnv.PLATFORM_ORGANISATION_ID;
}

export function resolveApplicationContextModule(organisationId: string): ApplicationContextModule {
  return isPlatformOrganisation(organisationId)
    ? platformAdministrationModule
    : administrationModule;
}

/**
 * Stand-in for the future organization/branch-selection flow. Branch and
 * organization resolution isn't implemented yet — this fixture unblocks the
 * shell's header/context UI until a real selection API exists. Never
 * treat this as authoritative for authorization.
 */
export const applicationContext: ApplicationContext = {
  module: administrationModule,
  organization: {
    id: 'greenfield-sacco',
    name: 'GreenField SACCO',
  },
  branch: {
    id: 'nairobi-central',
    name: 'Nairobi Central Branch',
  },
};
