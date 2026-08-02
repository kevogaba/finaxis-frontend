export const AUTH_COOKIE_PREFIX = 'finaxis';
export const CONTEXT_COOKIE_NAME = 'finaxis_context';
export const CONTEXT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;

/**
 * Set by proxy.ts on protected routes so downstream Server Components can recover the
 * originally-requested path/query for a post-context-selection redirect, since Server
 * Component layouts have no direct access to the current request's pathname.
 */
export const REQUEST_PATHNAME_HEADER = 'x-finaxis-pathname';

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
