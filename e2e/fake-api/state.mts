import { problem } from './http.mts';
import { seedScenario, SCENARIOS } from './scenarios.mts';

export interface FakeOrganisation {
  id: string;
  code: string;
  displayName: string;
  countryCode: string;
  baseCurrencyCode: string;
  timezone: string;
  status: string;
  bootstrapStatus: string | null;
  bootstrapFailureCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FakeUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  status: string;
  keycloakSubject: string;
}

export interface FakeMembership {
  id: string;
  organisationId: string;
  userId: string;
  status: string;
  type: string;
  primaryBranchId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FakeBranch {
  id: string;
  organisationId: string;
  code: string;
  name: string;
  type: string;
  status: string;
  timezone: string;
  parentBranchId: string | null;
  statusReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FakeBranchAssignment {
  id: string;
  organisationId: string;
  userId: string;
  branchId: string;
  type: string;
  status: string;
}

export interface FakeRole {
  id: string;
  organisationId: string;
  code: string;
  name: string;
  description: string | null;
  systemRole: boolean;
  status: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FakeRoleAssignment {
  id: string;
  organisationId: string;
  userId: string;
  roleId: string;
  scopeType: 'TENANT' | 'BRANCH';
  branchId: string | null;
  status: string;
}

/** One isolated backend per bearer token (`e2e.<scenario>.<run>`). Later layers add collections. */
export interface RunState {
  actorUserId: string;
  forbidOrganisationSelection: boolean;
  organisations: FakeOrganisation[];
  users: FakeUser[];
  memberships: FakeMembership[];
  branches: FakeBranch[];
  branchAssignments: FakeBranchAssignment[];
  roles: FakeRole[];
  roleAssignments: FakeRoleAssignment[];
}

const runs = new Map<string, RunState>();
const TOKEN_PATTERN = /^e2e\.([a-z0-9-]+)\.([A-Za-z0-9-]+)$/;

/**
 * Resolves (and on first use seeds) the state for a bearer token. An unknown shape or scenario
 * behaves like an invalid JWT: 401 with an empty body (contract §A "Auth").
 */
export function stateForToken(token: string): RunState {
  const match = TOKEN_PATTERN.exec(token);
  const scenario = match?.[1];
  if (!match || scenario === undefined || !SCENARIOS.includes(scenario)) {
    throw problem(401, 'invalid_token', '');
  }
  const existing = runs.get(token);
  if (existing) {
    return existing;
  }
  const seeded = seedScenario(scenario);
  runs.set(token, seeded);
  return seeded;
}
