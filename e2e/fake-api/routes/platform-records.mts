import { randomUUID } from 'node:crypto';
import {
  PLATFORM_ORGANISATION_ID,
  requireContext,
  requirePermission,
  requirePlatformContext,
} from '../access.mts';
import type { AccessContext } from '../access.mts';
import { recordAuditEvent } from '../audit-log.mts';
import { objectBody, problem, readBody, reasonField, sendJson } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { route } from '../router.mts';
import type { Route, RouteContext } from '../router.mts';
import type { FakeBranch, FakeOrganisation, FakeUser, RunState } from '../state.mts';
import {
  BRANCH_DRAFT_KEYS,
  branchDetailWire,
  draftBranchFields,
  hasAmended,
  moveBranch,
  withdrawing,
} from './branches.mts';
import { activationRemark, approveMembership } from './memberships.mts';
import type { Member } from './memberships.mts';
import { branchPage, institutionUserPage, userSummaryWire } from './tenant-reads.mts';

function platformAccess(context: RouteContext): AccessContext {
  const access = requireContext(context);
  requirePlatformContext(access);
  return access;
}

/** Any organisation, the platform's own included: `/tenants/{PLATFORM}/users` lists its members. */
function findTenant(context: RouteContext): FakeOrganisation {
  const tenant = context.state.organisations.find(
    (candidate) => candidate.id === context.params.tenant_id,
  );
  if (!tenant) throw problem(404, 'resource_not_found', 'Tenant not found.');
  return tenant;
}

function findUser(state: RunState, userId: string): FakeUser {
  const user = state.users.find((candidate) => candidate.id === userId);
  if (!user) throw problem(404, 'resource_not_found', 'User not found.');
  return user;
}

const tenantNotFound = () => problem(404, 'resource_not_found', 'Tenant not found.');

/** A mutation's institution: the platform organisation is never a tenant to act on (404). */
function findInstitution(context: RouteContext): FakeOrganisation {
  const tenant = findTenant(context);
  if (tenant.id === PLATFORM_ORGANISATION_ID) throw tenantNotFound();
  return tenant;
}

/** `requireOrganisationAllowsBranch`: a draft, a submission and a return need an ACTIVE or
 * PROVISIONING institution, else a plain 409. */
function requireBranchesAllowed(tenant: FakeOrganisation): void {
  if (tenant.status !== 'ACTIVE' && tenant.status !== 'PROVISIONING') {
    throw problem(409, 'conflict', 'The organisation must be ACTIVE or PROVISIONING.');
  }
}

const checkerClosed = () =>
  problem(
    409,
    'lifecycle.platform_checker_closed',
    'The tenant already has its own active members or branches, so its own approvers must approve this.',
  );

/**
 * ADR 0028's two windows: the platform checker acts only while the tenant has no ACTIVE membership,
 * or no ACTIVE branch, that the system did not make (`hasActiveMembershipBeyondBootstrap`,
 * `hasActiveBranchBeyondBootstrap`). The fake's "absent maker" is the system, as everywhere.
 */
function requireMemberWindow(state: RunState, tenantId: string): void {
  if (
    state.memberships.some(
      (row) => row.organisationId === tenantId && row.status === 'ACTIVE' && row.invitedBy,
    )
  ) {
    throw checkerClosed();
  }
}

function requireBranchWindow(state: RunState, tenantId: string): void {
  if (
    state.branches.some(
      (row) => row.organisationId === tenantId && row.status === 'ACTIVE' && row.draftedBy,
    )
  ) {
    throw checkerClosed();
  }
}

/** ReturnBranchRequest: a required body and reason of 3–500 characters. */
async function requiredReason(context: RouteContext) {
  const body = objectBody(await readBody(context.req), ['reason']);
  return { body, reason: reasonField(body, true)?.trim() ?? null };
}

/** A branch of the path tenant, or 404 (after the permission check, so it reveals nothing). */
function institutionBranch(context: RouteContext, tenant: FakeOrganisation): FakeBranch {
  const found = context.state.branches.find(
    (candidate) =>
      candidate.id === context.params.branch_id && candidate.organisationId === tenant.id,
  );
  if (!found) throw problem(404, 'resource_not_found', 'Branch not found.');
  return found;
}

/** Contract §D: every account body is required (`{}` minimum for reactivate); the account status
 * lives on the user, so a change shows in every institution. */
function accountTransition(
  path: 'suspend' | 'reactivate' | 'deactivate',
  permission: string,
  from: string,
  to: string,
  reasonRequired: boolean,
): Route {
  return route('POST', `/api/v1/platform/users/:user_id/${path}`, async (context) => {
    const access = platformAccess(context);
    requirePermission(access, permission);
    // BG-35 (UserProvisioningService): your own account, after the permission and before the
    // lookup. Reactivating your own stays allowed.
    if (path !== 'reactivate' && context.params.user_id === access.claims.userId) {
      throw problem(
        403,
        'lifecycle.self_account_change',
        'A user cannot suspend or deactivate their own account.',
      );
    }
    const user = findUser(context.state, context.params.user_id ?? '');
    const body = objectBody(await readBody(context.req), ['reason']);
    const reason = reasonField(body, reasonRequired);
    if (!reasonRequired && reason !== null && reason.length > 500) {
      throw problem(400, 'validation_failed', 'Validation failed.', [
        { field: 'reason', code: 'Size', message: 'size must be between 0 and 500' },
      ]);
    }
    sendIdempotent(context, body, () => {
      if (user.status !== from) throw problem(409, 'conflict', `The account must be ${from}.`);
      user.status = to;
      if (path === 'deactivate') {
        // Contract §G: deactivation revokes every ACTIVE role assignment of the account, in every
        // organisation and at either scope, with one `user.deactivation_assignment_revoked` row per
        // assignment. The contract names neither the log nor the actor of these rows. The fake
        // writes each in the assignment's own organisation (BG-06's rule for a platform action on
        // a tenant; BG-06 puts the account's own lifecycle rows under PLATFORM), with the calling
        // operator as the actor. Suspend and reactivate leave the assignments, and so do branch
        // assignments and memberships.
        for (const assignment of context.state.roleAssignments) {
          if (assignment.userId !== user.id || assignment.status !== 'ACTIVE') continue;
          assignment.status = 'REVOKED';
          recordAuditEvent(context.state, access, {
            entityType: 'USER_ROLE_ASSIGNMENT',
            entityId: assignment.id,
            action: 'user.deactivation_assignment_revoked',
            reason,
            organisationId: assignment.organisationId,
          });
        }
      }
      return { user_id: user.id, status: to };
    });
  });
}

export const platformRecordRoutes: Route[] = [
  route('GET', '/api/v1/platform/tenants/:tenant_id/branches', (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'branch.view');
    sendJson(context.res, 200, branchPage(access, findTenant(context).id, context.query));
  }),

  route('GET', '/api/v1/platform/tenants/:tenant_id/branches/:branch_id', (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'branch.view');
    const tenant = findTenant(context);
    const found = context.state.branches.find(
      (candidate) =>
        candidate.id === context.params.branch_id && candidate.organisationId === tenant.id,
    );
    if (!found) throw problem(404, 'resource_not_found', 'Branch not found.');
    sendJson(context.res, 200, branchDetailWire(access, found));
  }),

  route('POST', '/api/v1/platform/tenants/:tenant_id/branches', async (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'branch.create');
    const tenant = findInstitution(context);
    const body = objectBody(await readBody(context.req), BRANCH_DRAFT_KEYS);
    const draft = draftBranchFields(body);
    sendIdempotent(
      context,
      body,
      () => {
        // BG-18 (platform #153): the platform's own `branch.create` and `branch.view` are all it
        // takes, with no membership inside the tenant. Inside the producer, so a refusal stores
        // nothing and a retry re-executes.
        requireBranchesAllowed(tenant);
        const { branches } = context.state;
        if (branches.some((row) => row.organisationId === tenant.id && row.code === draft.code)) {
          throw problem(409, 'conflict', 'A branch with this code already exists.');
        }
        if (
          draft.parentId !== null &&
          !branches.some((row) => row.id === draft.parentId && row.organisationId === tenant.id)
        ) {
          throw problem(404, 'resource_not_found', 'Parent branch not found.');
        }
        const now = new Date().toISOString();
        const created: FakeBranch = {
          id: randomUUID(),
          organisationId: tenant.id,
          code: draft.code,
          name: draft.name,
          type: draft.type,
          status: 'DRAFT',
          timezone: draft.timezone,
          address: draft.address,
          parentBranchId: draft.parentId,
          statusReason: null,
          createdAt: now,
          updatedAt: now,
          draftedBy: access.claims.userId,
        };
        branches.push(created);
        // Written to the tenant's own log (BG-06: unreadable from the platform context), with the
        // calling operator as the actor and branch, as the tenant route does.
        recordAuditEvent(context.state, access, {
          entityType: 'BRANCH',
          entityId: created.id,
          action: 'branch.create_draft',
          reason: null,
          organisationId: tenant.id,
        });
        return { branch_id: created.id, status: 'DRAFT' };
      },
      201,
    );
  }),

  // ADR 0028 (BG-02): the platform checker of a tenant's first members.
  route(
    'POST',
    '/api/v1/platform/tenants/:tenant_id/memberships/:membership_id/activate',
    async (context) => {
      const access = platformAccess(context);
      requirePermission(access, 'user.approve');
      // PermissionGuard.requirePlatformChecker: the platform organisation is never a tenant.
      if (context.params.tenant_id === PLATFORM_ORGANISATION_ID) throw tenantNotFound();
      const request = await activationRemark(context);
      const tenantId = context.params.tenant_id ?? '';
      const membership = context.state.memberships.find(
        (row) => row.id === context.params.membership_id && row.organisationId === tenantId,
      );
      const user = membership && context.state.users.find((row) => row.id === membership.userId);
      const target: Member | null = membership && user ? { membership, user } : null;
      approveMembership(context, access, target, request, {
        organisationId: tenantId,
        // requirePlatformCheckerOpen: an ACTIVE tenant (else a plain 409), then the window.
        requireOpen: () => {
          const tenant = context.state.organisations.find((row) => row.id === tenantId);
          if (tenant?.status !== 'ACTIVE') {
            throw problem(
              409,
              'conflict',
              'The request conflicts with the current resource state.',
            );
          }
          requireMemberWindow(context.state, tenantId);
        },
      });
    },
  ),

  // ADR 0028 (BG-02): submit, activate and return a tenant's first branches. Each answers with the
  // branch detail and writes the FSM's row and the checker's own, in the tenant's log.
  route(
    'POST',
    '/api/v1/platform/tenants/:tenant_id/branches/:branch_id/submit',
    async (context) => {
      const access = platformAccess(context);
      requirePermission(access, 'branch.create');
      const tenant = findInstitution(context);
      const branch = institutionBranch(context, tenant);
      const { body, remark: reason } = await activationRemark(context);
      sendIdempotent(context, body, () => {
        requireBranchesAllowed(tenant);
        requireBranchWindow(context.state, tenant.id);
        // submitForApproval re-checks the draft's code before the transition (`branchCodeExists`,
        // excluding itself): a plain 409. ponytail: `uq_branch_organisation_code` keeps a real
        // tenant from ever holding a duplicate; only a seeded one reaches this.
        if (
          context.state.branches.some(
            (row) =>
              row.organisationId === tenant.id && row.code === branch.code && row.id !== branch.id,
          )
        ) {
          throw problem(409, 'conflict', 'The request conflicts with the current resource state.');
        }
        if (branch.status !== 'DRAFT') throw problem(409, 'conflict', 'The branch must be DRAFT.');
        moveBranch(access, branch, {
          path: 'submit',
          to: 'PENDING_APPROVAL',
          action: 'branch.submit',
          reason,
          branchId: branch.id,
        });
        recordAuditEvent(context.state, access, {
          entityType: 'BRANCH',
          entityId: branch.id,
          action: 'branch.submit_as_platform_checker',
          reason: null,
          organisationId: tenant.id,
          branchId: branch.id,
          metadata: { checkerScope: 'PLATFORM' },
        });
        return branchDetailWire(access, branch);
      });
    },
  ),

  route(
    'POST',
    '/api/v1/platform/tenants/:tenant_id/branches/:branch_id/activate',
    async (context) => {
      const access = platformAccess(context);
      requirePermission(access, 'branch.approve');
      const tenant = findInstitution(context);
      const branch = institutionBranch(context, tenant);
      const { body, remark: reason } = await activationRemark(context);
      sendIdempotent(context, body, () => {
        // The order: the window, the maker-checker rule (its creator or latest submitter, then
        // anyone who amended it, never relaxed), the tenant's state, then the branch's.
        requireBranchWindow(context.state, tenant.id);
        if (withdrawing(access, branch)) {
          throw problem(
            403,
            'lifecycle.approver_is_branch_maker',
            "The approver cannot be the branch's creator or submitter.",
          );
        }
        if (hasAmended(access, branch)) {
          throw problem(
            403,
            'lifecycle.approver_is_branch_modifier',
            'The approver cannot be someone who amended the branch.',
          );
        }
        if (tenant.status !== 'ACTIVE') {
          throw problem(409, 'conflict', 'The organisation must be ACTIVE.');
        }
        if (branch.status !== 'PENDING_APPROVAL') {
          throw problem(409, 'conflict', 'The branch must be PENDING_APPROVAL.');
        }
        moveBranch(access, branch, {
          path: 'activate',
          to: 'ACTIVE',
          action: 'branch.activate',
          reason,
          branchId: branch.id,
        });
        recordAuditEvent(context.state, access, {
          entityType: 'BRANCH',
          entityId: branch.id,
          action: 'branch.activate_as_platform_checker',
          reason: null,
          organisationId: tenant.id,
          branchId: branch.id,
          metadata: { checkerScope: 'PLATFORM' },
        });
        return branchDetailWire(access, branch);
      });
    },
  ),

  route(
    'POST',
    '/api/v1/platform/tenants/:tenant_id/branches/:branch_id/return',
    async (context) => {
      const access = platformAccess(context);
      // returnForChanges classifies first: its creator or latest submitter withdraws
      // (`branch.create`), anyone else returns it as the checker (`branch.approve`). A branch
      // outside the tenant has no maker, so it classifies as a return.
      const candidate = context.state.branches.find(
        (row) =>
          row.id === context.params.branch_id && row.organisationId === context.params.tenant_id,
      );
      const withdrawal = candidate !== undefined && withdrawing(access, candidate);
      requirePermission(access, withdrawal ? 'branch.create' : 'branch.approve');
      const tenant = findInstitution(context);
      const branch = institutionBranch(context, tenant);
      const { body, reason } = await requiredReason(context);
      sendIdempotent(context, body, () => {
        // Only a checker's return is bounded: taking back one's own request grants nothing.
        if (!withdrawal) requireBranchWindow(context.state, tenant.id);
        requireBranchesAllowed(tenant);
        if (branch.status !== 'PENDING_APPROVAL') {
          throw problem(409, 'conflict', 'The branch must be PENDING_APPROVAL.');
        }
        moveBranch(access, branch, {
          path: 'return',
          to: 'DRAFT',
          action: 'branch.return_for_changes',
          reason,
          branchId: branch.id,
        });
        // A withdrawal never carries the checker marker, even on the platform route.
        recordAuditEvent(context.state, access, {
          entityType: 'BRANCH',
          entityId: branch.id,
          action: withdrawal ? 'branch.withdraw' : 'branch.return_for_changes_as_platform_checker',
          reason,
          organisationId: tenant.id,
          branchId: branch.id,
          ...(!withdrawal && { metadata: { checkerScope: 'PLATFORM' } }),
        });
        return branchDetailWire(access, branch);
      });
    },
  ),

  route('GET', '/api/v1/platform/tenants/:tenant_id/users', (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'user.view');
    sendJson(context.res, 200, institutionUserPage(access, findTenant(context).id, context.query));
  }),

  route('GET', '/api/v1/platform/tenants/:tenant_id/users/:user_id', (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'user.view');
    const tenant = findTenant(context);
    const membership = context.state.memberships.find(
      (row) => row.userId === context.params.user_id && row.organisationId === tenant.id,
    );
    const user = context.state.users.find((row) => row.id === context.params.user_id);
    if (!membership || !user) throw problem(404, 'resource_not_found', 'User not found.');
    sendJson(context.res, 200, userSummaryWire(access, user, membership));
  }),

  accountTransition('suspend', 'user.suspend', 'ACTIVE', 'SUSPENDED', true),
  accountTransition('reactivate', 'user.activate', 'SUSPENDED', 'ACTIVE', false),
  accountTransition('deactivate', 'user.deactivate', 'ACTIVE', 'DEACTIVATED', true),
];
