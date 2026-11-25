import { ProblemError } from './http.mts';
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
  /** `requested_by` and `submitted_by` (BG-08); the maker-checker refuses both (contract §E.2). */
  createdBy?: string;
  submittedBy?: string;
  /** `legal_name`, `registration_number` and `status_reason` (BG-14, BG-01); absent = `null`. */
  legalName?: string | null;
  registrationNumber?: string | null;
  statusReason?: string | null;
  /** The first administrator as drafted (BG-14); absent = none (a SQL-seeded tenant). */
  admin?: FakeTenantAdmin;
}

/** A tenant draft's first administrator, as `admin` on create and amend takes it. */
export interface FakeTenantAdmin {
  email: string;
  username: string;
  displayName: string;
  phoneE164: string | null;
  sendApplicationInvite: boolean;
}

export interface FakeUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  status: string;
  keycloakSubject: string;
  /** Layer 10: approval answers 200 when the user already has an identity link, else 202 and the
   * user becomes PROVISIONING_IDP (contract §E.3). Absent = linked: existing literals stay valid. */
  identityLinked?: boolean;
}

/** A membership's identity-provisioning dispatch (platform #274's `identity_dispatch_log` row for
 * its current life), from which its `invitation` is derived (BG-11). */
export interface FakeDispatch {
  /** PENDING (queued), RUNNING, FAILED or SUCCEEDED. */
  status: string;
  /** Provisioning attempts plus resends. */
  attempts: number;
  /** `<CODE>:<ExceptionClass>` once an attempt failed; kept when it is requeued. */
  lastError: string | null;
  updatedAt: string;
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
  /** The membership's `created_by`, its inviter (BG-08); absent = the system. */
  invitedBy?: string;
  /** Its identity-provisioning dispatch (BG-11); absent = none recorded. */
  dispatch?: FakeDispatch;
  /** `member_number` (BG-17, ADR 0040): taken at the first activation and kept for life; absent =
   * `null`, never activated. */
  memberNumber?: number;
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
  /** `created_by` and the latest submitter, `submitted_by` (BG-08); absent = the system. */
  draftedBy?: string;
  submittedBy?: string;
  /** The business dates of the first activation and of closure (BG-13); absent = `null`. */
  openedOn?: string;
  closedOn?: string;
  /** The stored address, a flat map of strings (BG-13); absent = `{}`. */
  address?: Record<string, string>;
}

export interface FakeBranchAssignment {
  id: string;
  organisationId: string;
  userId: string;
  branchId: string;
  type: string;
  status: string;
  /** `assigned_at` (BG-09), which the list sorts by, newest first. */
  assignedAt: string;
  /** Set by a revoke, whose answer is the detail shape (`BranchAssignmentDetailResponse`). */
  revokedAt?: string;
  revokedBy?: string;
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
  /** Stored tenant settings only; an unset catalogue key shows its default, and `base_currency`
   * reads the organisation's column (contract §H). */
  tenantSettings: FakeTenantSetting[];
}

const runs = new Map<string, RunState>();
const TOKEN_PATTERN = /^e2e\.([a-z0-9-]+)\.([A-Za-z0-9-]+)$/;

/**
 * Resolves (and on first use seeds) the state for a bearer token. An unknown shape or scenario
 * behaves like an invalid JWT (ApiBearerTokenEntryPoint, BG-30): a 401 problem body with its
 * request id and the RFC 6750 `invalid_token` challenge, as `BearerTokenErrors.invalidToken` builds
 * it with the platform's fixed description.
 */
export function stateForToken(token: string): RunState {
  const match = TOKEN_PATTERN.exec(token);
  const scenario = match?.[1];
  if (!match || scenario === undefined || !SCENARIOS.includes(scenario)) {
    throw new ProblemError({
      status: 401,
      code: 'authentication_required',
      detail: 'Authentication is required.',
      challenge:
        'error="invalid_token", error_description="The access token is invalid or has expired.", ' +
        'error_uri="https://tools.ietf.org/html/rfc6750#section-3.1"',
    });
  }
  const existing = runs.get(token);
  if (existing) {
    return existing;
  }
  const seeded = seedScenario(scenario);
  runs.set(token, seeded);
  return seeded;
}
