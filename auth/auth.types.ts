export const AUTH_COOKIE_PREFIX = 'finaxis';
export const CONTEXT_COOKIE_NAME = 'finaxis_context';
export const CONTEXT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;

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
  permissions: readonly string[];
  branches: readonly AssignedBranch[];
  selectedBranch?: AssignedBranch;
  organization?: OrganizationSummary;
}
