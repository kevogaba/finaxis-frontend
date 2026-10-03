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
  /** Maker-checker only (activate ≠ drafter); the real API keeps the drafter in the audit log. */
  draftedBy?: string;
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
  /** Layer 09: when each code was granted at runtime; a seeded code reads as granted at
   * `createdAt`. Optional, so existing `FakeRole` literals (07b's access spec) stay valid. */
  grantedAt?: Record<string, string>;
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

export interface FakeBusinessDate {
  organisationId: string;
  date: string;
  status: 'OPEN' | 'CLOSING' | 'CLOSED';
}

export interface FakeBusinessDateEvent {
  organisationId: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string;
  fromDate: string | null;
  toDate: string;
  actorUserId: string | null;
  reason: string | null;
  occurredAt: string;
}

export interface FakeAuditEvent {
  id: string;
  organisationId: string;
  occurredAt: string;
  actorUserId: string | null;
  actorType: 'USER' | 'SYSTEM';
  branchId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  outcome: string;
  severity: string;
  reason: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  metadataJson: string;
}

export interface FakeTenantSetting {
  organisationId: string;
  key: string;
  value: string;
  valueType: string;
  sensitive: boolean;
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
  auditEvents: FakeAuditEvent[];
  businessDates: FakeBusinessDate[];
  /** Newest first, like the API. */
  businessDateHistory: FakeBusinessDateEvent[];
  /** Idempotency-Key → the successful response it replays. */
  idempotency: Map<string, { fingerprint: string; status: number; body: unknown }>;
  /** Mutations that fail with a lock timeout before one succeeds. */
  lockTimeoutsRemaining: number;
  /** Stored tenant settings only; an unset catalogue key shows its default (contract §H). */
  tenantSettings: FakeTenantSetting[];
  /** The tenant has posted a journal, so `base_currency` can't change (409). */
  baseCurrencyFrozen: boolean;
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
