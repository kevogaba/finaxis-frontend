import {
  activeAssignmentRows,
  actorRef,
  requireAuthority,
  requireContext,
  requirePermission,
  requireTenantContext,
} from '../access.mts';
import type { AccessContext } from '../access.mts';
import { recordAuditEvent } from '../audit-log.mts';
import {
  UUID,
  instantKey,
  objectBody,
  pageOf,
  problem,
  readBody,
  reasonField,
  sendJson,
  stringField,
  tenantListOrder,
} from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { numberOnActivation } from '../member-number.mts';
import { makerCheckerRequired } from './settings.mts';
import { route } from '../router.mts';
import type { Route, RouteContext } from '../router.mts';
import type { FakeDispatch, FakeMembership, FakeUser } from '../state.mts';

const NEED_A_BRANCH = ['STAFF', 'ADMIN'];
const membershipNotFound = () => problem(404, 'resource_not_found', 'Membership not found.');
const conflict = (detail: string) => problem(409, 'conflict', detail);
/** BG-35: a refusal of your own membership, after the permission check and the lookup. */
const selfChange = () =>
  problem(
    403,
    'lifecycle.self_membership_change',
    'A member cannot suspend or revoke their own membership.',
  );

export interface Member {
  membership: FakeMembership;
  user: FakeUser;
}

function tenantAccess(context: RouteContext): AccessContext {
  const access = requireContext(context);
  requireTenantContext(access);
  return access;
}

/** Contract §A: `q` is a case-insensitive substring in which `%` and `_` stay LIKE wildcards. */
function likeMatcher(q: string): RegExp {
  const pattern = q.replace(/[.*+?^${}()|[\]\\%_]/g, (char) =>
    char === '%' ? '.*' : char === '_' ? '.' : `\\${char}`,
  );
  return new RegExp(pattern, 'i');
}

/** Who invited the member (BG-08): the re-inviter after a re-invite. */
const inviterWire = (access: AccessContext, membership: FakeMembership) => ({
  created_by: actorRef(access, membership.organisationId, membership.invitedBy),
});

/** MembershipSummaryResponse: the member's names, the primary branch's name and `created_at` come
 * embedded (BG-09), and `member_number` last, `null` until the first activation (BG-17). */
const summaryWire = (access: AccessContext, { membership, user }: Member) => ({
  id: membership.id,
  user_id: membership.userId,
  membership_status: membership.status,
  membership_type: membership.type,
  primary_branch_id: membership.primaryBranchId,
  username: user.username,
  email: user.email,
  display_name: user.displayName,
  primary_branch_name:
    access.state.branches.find((branch) => branch.id === membership.primaryBranchId)?.name ?? null,
  created_at: membership.createdAt,
  ...inviterWire(access, membership),
  member_number: membership.memberNumber ?? null,
});

/** `allowedMembershipSorts`; without `sort_by`, newest first. */
const MEMBERSHIP_SORTS: Record<string, (member: Member & { id: string }) => string> = {
  createdAt: ({ membership }) => instantKey(membership.createdAt),
  membershipStatus: ({ membership }) => membership.status,
  membershipType: ({ membership }) => membership.type,
};

/** `InvitationStatus.kt`'s closed failure codes; any other stored prefix reads UNKNOWN. */
const KNOWN_ERROR_CODES = [
  'IDENTITY_PROVIDER_FAILED',
  'CONFLICT',
  'NOT_FOUND',
  'INVALID_STATE',
  'DATABASE_ERROR',
  'UNEXPECTED',
  'CANCELLED',
];

/** `deriveInvitationStatus` (platform #274, BG-11): no dispatch is AWAITING_APPROVAL while pending
 * and NOT_REQUIRED after; SUCCEEDED is COMPLETED; FAILED is COMPLETED behind an ACTIVE or SUSPENDED
 * membership (stale) and FAILED otherwise, a REVOKED one included; anything else is IN_PROGRESS.
 * The code comes from the stored `<CODE>:<ExceptionClass>`, only while FAILED. ponytail: the fake
 * runs no provisioning job, so a revoke never turns a queued dispatch into `CANCELLED`. */
function invitationWire(membership: FakeMembership) {
  const { dispatch } = membership;
  if (!dispatch) {
    return {
      status: membership.status === 'PENDING_APPROVAL' ? 'AWAITING_APPROVAL' : 'NOT_REQUIRED',
      attempts: 0,
      last_error_code: null,
      updated_at: null,
    };
  }
  let status = 'IN_PROGRESS';
  if (dispatch.status === 'SUCCEEDED') status = 'COMPLETED';
  else if (dispatch.status === 'FAILED') {
    status = ['ACTIVE', 'SUSPENDED'].includes(membership.status) ? 'COMPLETED' : 'FAILED';
  }
  const prefix = /^([A-Z][A-Z_]*):/.exec(dispatch.lastError ?? '')?.[1];
  return {
    status,
    attempts: dispatch.attempts,
    last_error_code:
      status === 'FAILED' && dispatch.lastError !== null
        ? prefix && KNOWN_ERROR_CODES.includes(prefix)
          ? prefix
          : 'UNKNOWN'
        : null,
    updated_at: dispatch.updatedAt,
  };
}

/** `recordDispatch`: the job an approval queues, PENDING with no attempt yet. */
const queuedDispatch = (): FakeDispatch => ({
  status: 'PENDING',
  attempts: 0,
  lastError: null,
  updatedAt: new Date().toISOString(),
});

const IDENTITY_PROVISIONING_REFUSED =
  'The user account is not in a state that allows identity provisioning.';

/** `requeueFailedProvisioning`: a dispatch never recorded, or one that SUCCEEDED, is the first
 * approval's 409; a FAILED one runs again (PENDING, the time moved, the attempts and the stored
 * error kept); one still queued or running is left alone. Returns JobRunr's outcome. */
function requeueFailedProvisioning(dispatch: FakeDispatch | undefined): string {
  if (!dispatch || dispatch.status === 'SUCCEEDED') throw conflict(IDENTITY_PROVISIONING_REFUSED);
  if (dispatch.status !== 'FAILED') return 'NOT_FAILED';
  dispatch.status = 'PENDING';
  dispatch.updatedAt = new Date().toISOString();
  return 'REQUEUED';
}

/** `finaxis.invitation.resend-cooldown`'s default. */
const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

/** MembershipDetailResponse: every read and membership mutation carries `invitation` (BG-11), and
 * `member_number` (BG-17). */
const detailWire = (access: AccessContext, { membership, user }: Member) => ({
  id: membership.id,
  organisation_id: membership.organisationId,
  user_id: membership.userId,
  username: user.username,
  email: user.email,
  display_name: user.displayName,
  user_status: user.status,
  membership_status: membership.status,
  membership_type: membership.type,
  primary_branch_id: membership.primaryBranchId,
  created_at: membership.createdAt,
  updated_at: membership.updatedAt,
  ...inviterWire(access, membership),
  invitation: invitationWire(membership),
  member_number: membership.memberNumber ?? null,
});

function memberOf(context: RouteContext, access: AccessContext): Member | null {
  const membership = context.state.memberships.find(
    (candidate) =>
      candidate.id === context.params.membership_id &&
      candidate.organisationId === access.organisation.id,
  );
  const user =
    membership && context.state.users.find((candidate) => candidate.id === membership.userId);
  return membership && user ? { membership, user } : null;
}

/** ActivateMembershipRequest (platform #179, BG-01), and the platform checker's SubmitBranchRequest
 * and ActivateBranchRequest: the body is optional, and its one property is an optional decision
 * remark of at most 500 characters (Bean Validation, on the raw text). Any other property is refused
 * (ApiJsonCodec). Returns the body and the remark, trimmed, a blank one none
 * (DecisionRemark.optional). */
export async function activationRemark(
  context: RouteContext,
): Promise<{ body: Record<string, unknown>; remark: string | null }> {
  const raw = await readBody(context.req);
  const body = raw === undefined ? {} : objectBody(raw, ['reason']);
  const reason = reasonField(body, false);
  if (reason !== null && reason.length > 500) {
    throw problem(400, 'validation_failed', 'Validation failed.', [
      { field: 'reason', code: 'Size', message: 'size must be between 0 and 500' },
    ]);
  }
  return { body, remark: reason === null || reason.trim() === '' ? null : reason.trim() };
}

/** `checker`: the platform checker's window (ADR 0028), which only the platform route has: its
 * institution, and the check that runs between the maker refusals and the state check. */
interface PlatformChecker {
  organisationId: string;
  requireOpen: () => void;
}

/**
 * UserProvisioningService.approve, shared by the tenant route and the platform checker's: the
 * maker-checker refusals, then (platform only) the window, the state, the prerequisites and the
 * account, then the `user.approve` row. The platform checker is never relaxed by a switch.
 */
export function approveMembership(
  context: RouteContext,
  access: AccessContext,
  target: Member | null,
  { body, remark }: { body: Record<string, unknown>; remark: string | null },
  checker: PlatformChecker | null,
): void {
  const organisationId = checker?.organisationId ?? access.organisation.id;
  // Decided from the state before the change, so a replay answers with the stored status: a 202
  // whenever provisioning is (re)queued, for a user with no identity link or one still
  // provisioning.
  const queues =
    target?.user.identityLinked === false || target?.user.status === 'PROVISIONING_IDP';
  const status = queues ? 202 : 200;
  sendIdempotent(
    context,
    body,
    () => {
      if (!target) throw membershipNotFound();
      const { membership, user } = target;
      // Maker-checker (BG-08, MembershipCheckerRule): before the state check, inside `produce`,
      // so the key rolls back. The inviter first, then the member themself; a stored `false`
      // switch lets either approve, audited HIGH (ADR 0032), but never the platform checker.
      const isMaker = membership.invitedBy === access.claims.userId;
      const isBeneficiary = membership.userId === access.claims.userId;
      const selfApproved =
        checker === null &&
        (isMaker || isBeneficiary) &&
        !makerCheckerRequired(
          context.state,
          organisationId,
          'require_maker_checker_for_user_invites',
        );
      if (isMaker && !selfApproved) {
        throw problem(
          403,
          'lifecycle.approver_is_membership_maker',
          "The approver cannot be the member's inviter.",
        );
      }
      if (isBeneficiary && !selfApproved) {
        throw problem(
          403,
          'lifecycle.approver_is_membership_beneficiary',
          'The approver cannot be the invited user.',
        );
      }
      checker?.requireOpen();
      if (membership.status !== 'PENDING_APPROVAL') {
        throw conflict('The request conflicts with the current resource state.');
      }
      const hasRole = context.state.roleAssignments.some(
        (row) =>
          row.userId === user.id &&
          row.organisationId === organisationId &&
          row.status === 'ACTIVE',
      );
      const hasBranch = activeAssignmentRows(context.state, user.id, organisationId).length > 0;
      // Missing prerequisites are a 409 (contract §F, BG-07): the branch first, then the role.
      if (NEED_A_BRANCH.includes(membership.type) && !hasBranch) {
        throw conflict(
          'The membership cannot be approved until the user has an active branch assignment.',
        );
      }
      if (!hasRole) {
        throw conflict(
          'The membership cannot be approved until the user has an active role assignment.',
        );
      }
      // The account's state, last (UserProvisioningService's requestKeycloakProvisioningIfNeeded,
      // then activateMembershipIfPossible). A repeat while provisioning requeues a failed job or
      // leaves a queued one alone, another 202 (BG-11): the membership stays PENDING_APPROVAL. The
      // first approval of this membership's life (no dispatch yet: a re-invite, ADR 0037) queues
      // its own.
      if (user.status === 'PROVISIONING_IDP') {
        if (membership.dispatch) requeueFailedProvisioning(membership.dispatch);
        else membership.dispatch = queuedDispatch();
      } else {
        if (user.identityLinked === false) {
          // No identity yet: only a DRAFT or PENDING_APPROVAL account may be provisioned.
          if (!['DRAFT', 'PENDING_APPROVAL'].includes(user.status)) {
            throw conflict(IDENTITY_PROVISIONING_REFUSED);
          }
          user.status = 'PROVISIONING_IDP';
          membership.dispatch = queuedDispatch();
        } else {
          // Linked: only an ACTIVE or INVITED account's membership may be activated, so a
          // suspended or deactivated account blocks the approval.
          if (!['ACTIVE', 'INVITED'].includes(user.status)) {
            throw conflict(
              'The user account is not in a state that allows the membership to be activated.',
            );
          }
          membership.status = 'ACTIVE';
          numberOnActivation(context.state.memberships, membership);
        }
      }
      membership.updatedAt = new Date().toISOString();
      // The remark lands on the `user.approve` row. ponytail: the platform also stores it as the
      // membership's status reason on a 200, which no read returns (BG-01), so the fake doesn't.
      // A platform checker's row is written to the institution's log, marked `checkerScope`.
      recordAuditEvent(context.state, access, {
        entityType: 'USER',
        entityId: user.id,
        action: 'user.approve',
        reason: remark,
        organisationId,
        // UserProvisioningService.selfApprovalMetadata: a relaxed approval is HIGH and says so.
        ...(selfApproved && { severity: 'HIGH', metadata: { selfApproved: 'true' } }),
        ...(checker && { metadata: { checkerScope: 'PLATFORM' } }),
      });
      return detailWire(access, target);
    },
    status,
  );
}

const MEMBERSHIP_EDIT_KEYS = ['membership_type', 'primary_branch_id'];
/** `ProfileUpdateService.ASSIGNABLE_TYPES`: SYSTEM is reserved, so refused like an unknown type. */
const ASSIGNABLE_TYPES = ['STAFF', 'ADMIN', 'AUDITOR'];
const malformed = () => problem(400, 'invalid_json', 'Malformed request body.');
const invalidOperation = () =>
  problem(422, 'invalid_operation', 'The request cannot be processed in its current state.');

/** UpdateMembershipRequest's decode, while the argument resolves (before the route's gate): a type
 * that isn't text, or a primary branch that isn't a UUID, fails it. `primary_branch_id` is an
 * `Optional<UUID>?`: absent keeps the branch, an explicit null clears it. ponytail: Jackson's
 * reading of `""` as an `Optional<UUID>` isn't mirrored (the fake refuses it); the app sends an id
 * or `null`. */
function membershipEdit(body: Record<string, unknown>) {
  const type = stringField(body, 'membership_type', { required: false });
  const changesBranch = 'primary_branch_id' in body;
  const branchId = stringField(body, 'primary_branch_id', { required: false });
  if (branchId !== null && !UUID.test(branchId)) throw malformed();
  return { type, changesBranch, branchId: branchId?.toLowerCase() ?? null };
}

/** Suspend, reactivate and revoke: permission (and the BG-31 read-back) before any state check;
 * every state check inside `produce`, so a refusal stores nothing and a replay answers as before. */
function transition(
  path: 'suspend' | 'reactivate' | 'revoke',
  permission: string,
  reasonRequired: boolean,
  apply: (access: AccessContext, member: Member, reason: string | null) => void,
): Route {
  return route('POST', `/api/v1/tenant/memberships/:membership_id/${path}`, async (context) => {
    const access = tenantAccess(context);
    requirePermission(access, permission);
    const raw = await readBody(context.req);
    // Reactivate's body is optional; suspend and revoke need a reason (contract §D).
    const body = raw === undefined && !reasonRequired ? {} : objectBody(raw, ['reason']);
    const reason = reasonField(body, reasonRequired);
    if (reason !== null && reason.length > 500) {
      throw problem(400, 'validation_failed', 'Validation failed.', [
        { field: 'reason', code: 'Size', message: 'size must be between 0 and 500' },
      ]);
    }
    sendIdempotent(context, body, () => {
      const member = memberOf(context, access);
      if (!member) throw membershipNotFound(); // BG-07: once a 500
      apply(access, member, reason);
      member.membership.updatedAt = new Date().toISOString();
      return detailWire(access, member);
    });
  });
}

export const membershipRoutes: Route[] = [
  route('GET', '/api/v1/tenant/memberships', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'membership.view');
    const { query, state } = context;
    // The sort is checked after the permission (BG-26).
    const order = tenantListOrder(query, MEMBERSHIP_SORTS, 'createdAt');
    const q = query.get('q');
    const matcher = q ? likeMatcher(q) : null;
    const status = query.get('membership_status');
    const type = query.get('membership_type');
    const userId = query.get('user_id');
    const rows = state.memberships
      .filter((membership) => membership.organisationId === access.organisation.id)
      .flatMap((membership) => {
        const user = state.users.find((candidate) => candidate.id === membership.userId);
        return user ? [{ id: membership.id, membership, user }] : [];
      })
      .filter(
        ({ membership, user }) =>
          (!matcher ||
            [user.username, user.email, user.displayName].some((value) => matcher.test(value))) &&
          (!status || membership.status === status) &&
          (!type || membership.type === type) &&
          (!userId || membership.userId === userId),
      )
      .sort(order)
      .map((member) => summaryWire(access, member));
    sendJson(context.res, 200, pageOf(rows, query));
  }),

  route('GET', '/api/v1/tenant/memberships/:membership_id', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'membership.view');
    const member = memberOf(context, access);
    if (!member) throw membershipNotFound();
    sendJson(context.res, 200, detailWire(access, member));
  }),

  // BG-17 (ProfileUpdateService.updateMembership, platform #161): the body decodes first, then the
  // route's `membership.update` gate (the selected context, naming nothing), then the service's
  // `membership.update` and its view tenant-wide (403 naming the code). Inside `produce`: no field
  // or an unknown or SYSTEM type is 422, an unknown id 404, a REVOKED or SYSTEM membership 422, an
  // ACTIVE one moving to STAFF or ADMIN with no ACTIVE assignment to an ACTIVE branch 409, and a
  // primary branch that isn't an ACTIVE branch here 422. No self rule. Audited `membership.update`
  // on the MEMBERSHIP, naming the changed fields only; answers the detail.
  route('PATCH', '/api/v1/tenant/memberships/:membership_id', async (context) => {
    const access = tenantAccess(context);
    const raw = await readBody(context.req);
    if (raw === undefined) throw malformed();
    const body = objectBody(raw, MEMBERSHIP_EDIT_KEYS);
    const edit = membershipEdit(body);
    requireAuthority(access, ['membership.update']);
    requirePermission(access, 'membership.update');
    sendIdempotent(context, body, () => {
      const changed = [
        ...(edit.type === null ? [] : ['membership_type']),
        ...(edit.changesBranch ? ['primary_branch_id'] : []),
      ];
      if (changed.length === 0) throw invalidOperation();
      if (edit.type !== null && !ASSIGNABLE_TYPES.includes(edit.type)) throw invalidOperation();
      const member = memberOf(context, access);
      if (!member) throw membershipNotFound();
      const { membership, user } = member;
      if (membership.status === 'REVOKED' || membership.type === 'SYSTEM') {
        throw invalidOperation();
      }
      if (
        edit.type !== null &&
        NEED_A_BRANCH.includes(edit.type) &&
        membership.status === 'ACTIVE' &&
        activeAssignmentRows(access.state, user.id, access.organisation.id).length === 0
      ) {
        throw conflict(
          'The membership cannot take this type until the user has an active branch assignment.',
        );
      }
      if (
        edit.branchId !== null &&
        !access.state.branches.some(
          (branch) =>
            branch.id === edit.branchId &&
            branch.organisationId === access.organisation.id &&
            branch.status === 'ACTIVE',
        )
      ) {
        throw invalidOperation();
      }
      if (edit.type !== null) membership.type = edit.type;
      if (edit.changesBranch) membership.primaryBranchId = edit.branchId;
      membership.updatedAt = new Date().toISOString();
      recordAuditEvent(access.state, access, {
        entityType: 'MEMBERSHIP',
        entityId: membership.id,
        action: 'membership.update',
        reason: null,
        metadata: { changedFields: changed.join(',') },
      });
      return detailWire(access, member);
    });
  }),

  route('POST', '/api/v1/tenant/memberships/:membership_id/activate', async (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'user.approve');
    const request = await activationRemark(context);
    approveMembership(context, access, memberOf(context, access), request, null);
  }),

  // BG-11 (InvitationRecoveryService.retry): `user.approve` and its view, tenant-wide, before the
  // lookup; no body is read and no maker-checker rule applies. Only a pending member whose account
  // waits on provisioning, with a dispatch that hasn't succeeded, is retried (409 `conflict`
  // otherwise); a job still queued is a 200 that changes nothing. Audited on the user.
  route('POST', '/api/v1/tenant/memberships/:membership_id/invitation/retry', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'user.approve');
    sendIdempotent(context, {}, () => {
      const member = memberOf(context, access);
      if (!member) throw membershipNotFound();
      const { membership, user } = member;
      if (membership.status !== 'PENDING_APPROVAL' || user.status !== 'PROVISIONING_IDP') {
        throw conflict(IDENTITY_PROVISIONING_REFUSED);
      }
      const job = requeueFailedProvisioning(membership.dispatch);
      recordAuditEvent(access.state, access, {
        entityType: 'USER',
        entityId: user.id,
        action: 'user.invitation_retry',
        reason: null,
        metadata: { membershipId: membership.id, job },
      });
      return detailWire(access, member);
    });
  }),

  // BG-11 (InvitationRecoveryService.resend): `user.invite` and its views (`membership.view`,
  // `user.view`), tenant-wide, first. An INVITED account with an ACTIVE membership only (else 409
  // `lifecycle.invitation_resend_not_applicable`); then the user's newest SUCCEEDED provisioning
  // dispatch, in any institution, is touched (an attempt, the time) unless it changed within the
  // cooldown (409 `lifecycle.invitation_resend_too_soon`); with none, not applicable either.
  route('POST', '/api/v1/tenant/memberships/:membership_id/invitation/resend', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'user.invite');
    sendIdempotent(context, {}, () => {
      const member = memberOf(context, access);
      if (!member) throw membershipNotFound();
      const { membership, user } = member;
      const notApplicable = () =>
        problem(
          409,
          'lifecycle.invitation_resend_not_applicable',
          'An invitation can be resent only to an account that is invited and has not signed in.',
        );
      if (user.status !== 'INVITED' || membership.status !== 'ACTIVE') throw notApplicable();
      const newest = access.state.memberships
        .filter((row) => row.userId === user.id && row.dispatch?.status === 'SUCCEEDED')
        .map((row) => row.dispatch)
        .filter((dispatch): dispatch is FakeDispatch => dispatch !== undefined)
        .sort((a, b) => instantKey(b.updatedAt).localeCompare(instantKey(a.updatedAt)))[0];
      if (!newest) throw notApplicable();
      if (Date.now() - new Date(newest.updatedAt).getTime() < RESEND_COOLDOWN_MS) {
        throw problem(
          409,
          'lifecycle.invitation_resend_too_soon',
          'This invitation was sent a moment ago; wait before sending it again.',
        );
      }
      newest.attempts += 1;
      newest.updatedAt = new Date().toISOString();
      recordAuditEvent(access.state, access, {
        entityType: 'USER',
        entityId: user.id,
        action: 'user.invitation_resend',
        reason: null,
        metadata: { membershipId: membership.id, attempt: String(newest.attempts) },
      });
      return detailWire(access, member);
    });
  }),

  transition('suspend', 'membership.suspend', true, (access, { membership, user }, reason) => {
    if (user.id === access.claims.userId) throw selfChange();
    if (membership.status !== 'ACTIVE') {
      throw problem(409, 'conflict', 'The membership must be ACTIVE.');
    }
    membership.status = 'SUSPENDED';
    // Suspend and reactivate are keyed by the user id, revoke by the membership id (BG-16).
    recordAuditEvent(access.state, access, {
      entityType: 'USER',
      entityId: user.id,
      action: 'membership.suspend',
      reason,
    });
  }),

  transition(
    'reactivate',
    'membership.reactivate',
    false,
    (access, { membership, user }, reason) => {
      if (membership.status !== 'SUSPENDED') {
        throw problem(409, 'conflict', 'The membership must be SUSPENDED.');
      }
      membership.status = 'ACTIVE';
      // A suspended membership was numbered when it first became ACTIVE: it keeps that number.
      numberOnActivation(access.state.memberships, membership);
      recordAuditEvent(access.state, access, {
        entityType: 'USER',
        entityId: user.id,
        action: 'membership.reactivate',
        reason,
      });
    },
  ),

  transition('revoke', 'membership.revoke', true, (access, { membership, user }, reason) => {
    if (user.id === access.claims.userId) throw selfChange();
    if (membership.status === 'REVOKED') throw conflict('The membership is already REVOKED.');
    membership.status = 'REVOKED';
    // Terminal, and every assignment goes with it (contract §E.3).
    const mine = (row: { userId: string; organisationId: string; status: string }) =>
      row.userId === user.id &&
      row.organisationId === membership.organisationId &&
      row.status === 'ACTIVE';
    for (const row of access.state.branchAssignments.filter(mine)) row.status = 'REVOKED';
    for (const row of access.state.roleAssignments.filter(mine)) row.status = 'REVOKED';
    recordAuditEvent(access.state, access, {
      entityType: 'MEMBERSHIP',
      entityId: membership.id,
      action: 'membership.revoke',
      reason,
    });
  }),
];
