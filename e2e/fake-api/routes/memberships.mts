import {
  activeAssignmentRows,
  actorRef,
  requireContext,
  requirePermission,
  requireTenantContext,
} from '../access.mts';
import type { AccessContext } from '../access.mts';
import { recordAuditEvent } from '../audit-log.mts';
import { objectBody, pageOf, problem, readBody, reasonField, sendJson } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { makerCheckerRequired } from './settings.mts';
import { route } from '../router.mts';
import type { Route, RouteContext } from '../router.mts';
import type { FakeMembership, FakeUser } from '../state.mts';

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

const summaryWire = (access: AccessContext, membership: FakeMembership) => ({
  id: membership.id,
  user_id: membership.userId,
  membership_status: membership.status,
  membership_type: membership.type,
  primary_branch_id: membership.primaryBranchId,
  ...inviterWire(access, membership),
});

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
      // then activateMembershipIfPossible). A repeat while provisioning requeues it, another 202
      // that changes nothing (BG-11): the membership stays PENDING_APPROVAL.
      if (user.status !== 'PROVISIONING_IDP') {
        if (user.identityLinked === false) {
          // No identity yet: only a DRAFT or PENDING_APPROVAL account may be provisioned.
          if (!['DRAFT', 'PENDING_APPROVAL'].includes(user.status)) {
            throw conflict('The user account is not in a state that allows identity provisioning.');
          }
          user.status = 'PROVISIONING_IDP';
        } else {
          // Linked: only an ACTIVE or INVITED account's membership may be activated, so a
          // suspended or deactivated account blocks the approval.
          if (!['ACTIVE', 'INVITED'].includes(user.status)) {
            throw conflict(
              'The user account is not in a state that allows the membership to be activated.',
            );
          }
          membership.status = 'ACTIVE';
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
    const q = query.get('q');
    const matcher = q ? likeMatcher(q) : null;
    const status = query.get('membership_status');
    const type = query.get('membership_type');
    const rows = state.memberships
      .filter((membership) => membership.organisationId === access.organisation.id)
      .flatMap((membership) => {
        const user = state.users.find((candidate) => candidate.id === membership.userId);
        return user ? [{ membership, user }] : [];
      })
      .filter(
        ({ membership, user }) =>
          (!matcher ||
            [user.username, user.email, user.displayName].some((value) => matcher.test(value))) &&
          (!status || membership.status === status) &&
          (!type || membership.type === type),
      )
      // `sort_*` is accepted and ignored (contract §E.3); newest first = reverse seed order, as the
      // fake's /tenant/users does.
      .reverse()
      .map(({ membership }) => summaryWire(access, membership));
    sendJson(context.res, 200, pageOf(rows, query));
  }),

  route('GET', '/api/v1/tenant/memberships/:membership_id', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'membership.view');
    const member = memberOf(context, access);
    if (!member) throw membershipNotFound();
    sendJson(context.res, 200, detailWire(access, member));
  }),

  route('POST', '/api/v1/tenant/memberships/:membership_id/activate', async (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'user.approve');
    const request = await activationRemark(context);
    approveMembership(context, access, memberOf(context, access), request, null);
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
