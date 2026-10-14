import { randomUUID } from 'node:crypto';
import { requireContext, requirePermission, requireTenantContext } from '../access.mts';
import type { AccessContext } from '../access.mts';
import { recordAuditEvent } from '../audit-log.mts';
import { UUID, objectBody, problem, readBody, stringField } from '../http.mts';
import type { Violation } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { route } from '../router.mts';
import type { Route } from '../router.mts';
import type { FakeMembership, FakeUser, RunState } from '../state.mts';

/** Contract §D: InviteUser. */
const INVITE_KEYS = [
  'email',
  'username',
  'display_name',
  'phone_e164',
  'membership_type',
  'primary_branch_id',
  'branch_assignments',
  'role_assignments',
  'send_keycloak_invite',
  'send_application_invite',
];
const MEMBERSHIP_TYPES = ['STAFF', 'ADMIN', 'AUDITOR', 'SYSTEM'];
const ASSIGNMENT_TYPES = ['HOME', 'OPERATE', 'APPROVE', 'VIEW'];
const SCOPE_TYPES = ['TENANT', 'BRANCH'];
const USERNAME = /^[a-zA-Z0-9._-]{3,50}$/;
const E164 = /^\+[1-9]\d{1,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const invalidJson = () => problem(400, 'invalid_json', 'Malformed request body.');
// BG-07: every invite rule failure falls through to the generic handler as a 500.
const internalError = () => problem(500, 'internal_error', 'An unexpected error occurred.');
const NEED_A_BRANCH = ['STAFF', 'ADMIN'];

interface BranchAssignmentInput {
  branchId: string;
  type: string;
}

interface RoleAssignmentInput {
  roleId: string;
  scopeType: string;
  branchId: string | null;
}

interface Invitation {
  email: string;
  username: string;
  displayName: string;
  membershipType: string;
  primaryBranchId: string | null;
  branches: BranchAssignmentInput[];
  roles: RoleAssignmentInput[];
}

/** A UUID field as the backend binds it: absent or `null` only where nullable, else invalid_json. */
function uuidField(body: Record<string, unknown>, key: string, nullable: boolean): string | null {
  const value = body[key];
  if ((value === undefined || value === null) && nullable) return null;
  if (typeof value !== 'string' || !UUID.test(value)) throw invalidJson();
  return value.toLowerCase();
}

/** A list of exact-key objects; nested element fields are non-null (contract §B), so a missing or
 * mistyped one is invalid_json. An absent or null list is `[]` (contract §D: "Missing = absent or
 * null"; the lists are `[]` if missing). */
function listField(body: Record<string, unknown>, key: string, keys: readonly string[]) {
  const value = body[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalidJson();
  return value.map((item) => objectBody(item, keys));
}

/** `send_keycloak_invite` and `send_application_invite`: absent takes the default; `null` or a
 * non-boolean doesn't bind (contract §D: "don't send null"). */
function flagField(body: Record<string, unknown>, key: string): void {
  const value = body[key];
  if (value !== undefined && typeof value !== 'boolean') throw invalidJson();
}

/** Binding (400 invalid_json), then bean validation (400 validation_failed), as InviteUserRequest. */
function readInvitation(body: Record<string, unknown>): Invitation {
  const email = stringField(body, 'email', { required: true }) ?? '';
  const username = stringField(body, 'username', { required: true }) ?? '';
  const displayName = stringField(body, 'display_name', { required: true }) ?? '';
  const phone = stringField(body, 'phone_e164', { required: false });
  const membershipType = stringField(body, 'membership_type', { required: true }) ?? '';
  if (!MEMBERSHIP_TYPES.includes(membershipType)) throw invalidJson();
  const primaryBranchId = uuidField(body, 'primary_branch_id', true);
  const branches = listField(body, 'branch_assignments', ['branch_id', 'assignment_type']).map(
    (item) => {
      const type = stringField(item, 'assignment_type', { required: true }) ?? '';
      if (!ASSIGNMENT_TYPES.includes(type)) throw invalidJson();
      return { branchId: uuidField(item, 'branch_id', false) ?? '', type };
    },
  );
  const roles = listField(body, 'role_assignments', ['role_id', 'scope_type', 'branch_id']).map(
    (item) => {
      const scopeType = stringField(item, 'scope_type', { required: true }) ?? '';
      if (!SCOPE_TYPES.includes(scopeType)) throw invalidJson();
      return {
        roleId: uuidField(item, 'role_id', false) ?? '',
        scopeType,
        branchId: uuidField(item, 'branch_id', true),
      };
    },
  );
  flagField(body, 'send_keycloak_invite');
  flagField(body, 'send_application_invite');

  const violations: Violation[] = [];
  const check = (valid: boolean, field: string, rule: string, message: string) => {
    if (!valid) violations.push({ field, code: rule, message });
  };
  check(EMAIL.test(email), 'email', 'Email', 'must be a well-formed email address');
  check(USERNAME.test(username), 'username', 'Pattern', 'must match "^[a-zA-Z0-9._-]{3,50}$"');
  check(
    displayName.trim().length >= 2 && displayName.length <= 100,
    'display_name',
    'Size',
    'size must be between 2 and 100',
  );
  check(phone === null || E164.test(phone), 'phone_e164', 'Pattern', 'must be E.164');
  if (violations.length > 0) {
    throw problem(400, 'validation_failed', 'Validation failed.', violations);
  }
  return { email, username, displayName, membershipType, primaryBranchId, branches, roles };
}

/** `user.assign_branch` at each invited branch (contract §E.3 "B"): a TENANT grant, or a BRANCH grant
 * while that branch is the selected one (§E.4). */
function requireAssignAt(access: AccessContext, branchIds: readonly string[]): void {
  for (const branchId of branchIds) {
    const held =
      access.tenantPermissions.has('user.assign_branch') ||
      (access.claims.branchId === branchId && access.permissions.has('user.assign_branch'));
    if (!held) throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
  }
}

const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Mirrors UserProvisioningService's invite rules (BG-07: each is a 500; contract §D, §E.3, §F):
 * STAFF and ADMIN need a branch; at least one role; every role ACTIVE; every branch (assigned and
 * primary) ACTIVE; TENANT scope without a branch, BRANCH scope with one of the assigned branches; no
 * membership of the email in this organisation, in any status (BG-28); a username taken by another
 * email. Runs inside `produce`, so a refusal stores nothing.
 */
function checkInviteRules(
  state: RunState,
  organisationId: string,
  input: Invitation,
  existing: FakeUser | undefined,
): void {
  const activeBranch = (id: string) =>
    state.branches.some(
      (branch) =>
        branch.id === id && branch.organisationId === organisationId && branch.status === 'ACTIVE',
    );
  const activeRole = (id: string) =>
    state.roles.some(
      (role) =>
        role.id === id && role.organisationId === organisationId && role.status === 'ACTIVE',
    );
  const assigned = new Set(input.branches.map((row) => row.branchId));
  if (input.roles.length === 0) throw internalError();
  if (NEED_A_BRANCH.includes(input.membershipType) && input.branches.length === 0) {
    throw internalError();
  }
  if (input.branches.some((row) => !activeBranch(row.branchId))) throw internalError();
  if (input.primaryBranchId !== null && !activeBranch(input.primaryBranchId)) throw internalError();
  for (const row of input.roles) {
    if (!activeRole(row.roleId)) throw internalError();
    const scopeMatches =
      row.scopeType === 'TENANT'
        ? row.branchId === null
        : row.branchId !== null && assigned.has(row.branchId);
    if (!scopeMatches) throw internalError();
  }
  if (
    existing &&
    state.memberships.some(
      (membership) =>
        membership.userId === existing.id && membership.organisationId === organisationId,
    )
  ) {
    throw internalError();
  }
  if (!existing && state.users.some((user) => sameText(user.username, input.username))) {
    throw internalError();
  }
}

/**
 * The invitation (contract §E.3): an email that already has an account anywhere reuses it (case
 * aside), and the entered name, username and phone are then ignored; otherwise a DRAFT user with no
 * identity link. The membership waits for approval, the assignments are ACTIVE, and `user.invite`
 * is audited on the USER (the maker lookup's source, contract §G).
 */
function invite(state: RunState, access: AccessContext, input: Invitation) {
  const organisationId = access.organisation.id;
  const existing = state.users.find((user) => sameText(user.email, input.email));
  checkInviteRules(state, organisationId, input, existing);

  const now = new Date().toISOString();
  let user: FakeUser;
  if (existing) {
    user = existing;
  } else {
    user = {
      id: randomUUID(),
      username: input.username,
      email: input.email,
      displayName: input.displayName.trim(),
      status: 'DRAFT',
      keycloakSubject: `e2e-${input.username}`,
      // A new account has no identity link: its approval queues provisioning (a 202).
      identityLinked: false,
    };
    state.users.push(user);
  }
  const membership: FakeMembership = {
    id: randomUUID(),
    organisationId,
    userId: user.id,
    status: 'PENDING_APPROVAL',
    type: input.membershipType,
    primaryBranchId: input.primaryBranchId,
    createdAt: now,
    updatedAt: now,
    invitedBy: access.claims.userId,
  };
  state.memberships.push(membership);
  for (const row of input.branches) {
    state.branchAssignments.push({
      id: randomUUID(),
      organisationId,
      userId: user.id,
      branchId: row.branchId,
      type: row.type,
      status: 'ACTIVE',
    });
  }
  for (const row of input.roles) {
    state.roleAssignments.push({
      id: randomUUID(),
      organisationId,
      userId: user.id,
      roleId: row.roleId,
      scopeType: row.scopeType === 'BRANCH' ? 'BRANCH' : 'TENANT',
      branchId: row.branchId,
      status: 'ACTIVE',
    });
  }
  recordAuditEvent(state, access, {
    entityType: 'USER',
    entityId: user.id,
    action: 'user.invite',
    reason: null,
  });
  return {
    user_id: user.id,
    membership_id: membership.id,
    user_status: user.status,
    membership_status: membership.status,
  };
}

export const invitationRoutes: Route[] = [
  route('POST', '/api/v1/tenant/users', async (context) => {
    const access = requireContext(context);
    requireTenantContext(access);
    requirePermission(access, 'user.invite');
    const body = objectBody(await readBody(context.req), INVITE_KEYS);
    const input = readInvitation(body);
    requireAssignAt(access, [...new Set(input.branches.map((row) => row.branchId))]);
    // Every rule runs inside `produce`, so a refusal stores nothing and a retry with the same key
    // runs again (contract §A); a success replays for the same key.
    sendIdempotent(context, body, () => invite(context.state, access, input), 201);
  }),
];
