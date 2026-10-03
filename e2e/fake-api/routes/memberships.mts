import {
  activeAssignmentRows,
  requireContext,
  requirePermission,
  requireTenantContext,
} from '../access.mts';
import type { AccessContext } from '../access.mts';
import { recordAuditEvent } from '../audit-log.mts';
import { objectBody, pageOf, problem, readBody, reasonField, sendJson } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { route } from '../router.mts';
import type { Route, RouteContext } from '../router.mts';
import type { FakeMembership, FakeUser } from '../state.mts';

const NEED_A_BRANCH = ['STAFF', 'ADMIN'];
const internalError = () => problem(500, 'internal_error', 'An unexpected error occurred.');

interface Member {
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

const summaryWire = (membership: FakeMembership) => ({
  id: membership.id,
  user_id: membership.userId,
  membership_status: membership.status,
  membership_type: membership.type,
  primary_branch_id: membership.primaryBranchId,
});

const detailWire = ({ membership, user }: Member) => ({
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
    requirePermission(access, 'membership.view'); // read-back (BG-31)
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
      if (!member) throw internalError(); // an unknown membership is a 500 (BG-07)
      apply(access, member, reason);
      member.membership.updatedAt = new Date().toISOString();
      return detailWire(member);
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
      .map(({ membership }) => summaryWire(membership));
    sendJson(context.res, 200, pageOf(rows, query));
  }),

  route('GET', '/api/v1/tenant/memberships/:membership_id', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'membership.view');
    const member = memberOf(context, access);
    if (!member) throw problem(404, 'resource_not_found', 'Membership not found.');
    sendJson(context.res, 200, detailWire(member));
  }),

  route('POST', '/api/v1/tenant/memberships/:membership_id/activate', async (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'user.approve');
    requirePermission(access, 'membership.view'); // read-back (BG-31)
    const raw = await readBody(context.req);
    // The endpoint reads no body: none or `{}`, and any property is refused (ApiJsonCodec).
    const body = raw === undefined ? {} : objectBody(raw, []);
    const target = memberOf(context, access);
    // Decided from the state before the change, so a replay answers with the stored status.
    const status = target?.user.identityLinked === false ? 202 : 200;
    sendIdempotent(
      context,
      body,
      () => {
        if (!target) throw internalError();
        const { membership, user } = target;
        // Not pending, or a re-approval of a provisioning user: 500 (BG-07, BG-11).
        if (membership.status !== 'PENDING_APPROVAL' || user.status === 'PROVISIONING_IDP') {
          throw internalError();
        }
        // Maker-checker (BG-08): inside `produce`, so the key rolls back.
        if (membership.invitedBy === access.claims.userId) {
          throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
        }
        const organisationId = access.organisation.id;
        const hasRole = context.state.roleAssignments.some(
          (row) =>
            row.userId === user.id &&
            row.organisationId === organisationId &&
            row.status === 'ACTIVE',
        );
        const hasBranch = activeAssignmentRows(context.state, user.id, organisationId).length > 0;
        // Missing prerequisites are a 500 too (contract §F, BG-07).
        if (!hasRole || (NEED_A_BRANCH.includes(membership.type) && !hasBranch)) {
          throw internalError();
        }
        if (user.identityLinked === false) {
          user.status = 'PROVISIONING_IDP'; // the membership stays PENDING_APPROVAL (202)
        } else {
          membership.status = 'ACTIVE';
          if (user.status === 'DRAFT') user.status = 'INVITED';
        }
        membership.updatedAt = new Date().toISOString();
        recordAuditEvent(context.state, access, {
          entityType: 'USER',
          entityId: user.id,
          action: 'user.approve',
          reason: null,
        });
        return detailWire(target);
      },
      status,
    );
  }),

  transition('suspend', 'membership.suspend', true, (access, { membership, user }, reason) => {
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
    if (membership.status === 'REVOKED') throw internalError(); // already revoked (BG-07)
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
