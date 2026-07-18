export const AUTH_COOKIE_PREFIX = 'finaxis';

export interface AssignedBranch {
  id: string;
  name: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
}

export interface FinaxisUser {
  id: string;
  name: string;
  email: string;
  username?: string;
  image?: string;
  roles: readonly string[];
  branches: readonly AssignedBranch[];
  organization?: OrganizationSummary;
}
