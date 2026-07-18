export interface ApplicationContextModule {
  id: string;
  name: string;
}

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

/**
 * Stand-in for the future organization/branch-selection flow. Branch and
 * organization resolution isn't implemented yet — this fixture unblocks the
 * shell's header/context UI until a real selection API exists. Never
 * treat this as authoritative for authorization.
 */
export const applicationContext: ApplicationContext = {
  module: {
    id: 'administration',
    name: 'Administration',
  },
  organization: {
    id: 'greenfield-sacco',
    name: 'GreenField SACCO',
  },
  branch: {
    id: 'nairobi-central',
    name: 'Nairobi Central Branch',
  },
};
