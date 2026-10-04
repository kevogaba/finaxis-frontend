import { randomUUID } from 'node:crypto';
import { requireContext, requirePermission, requirePlatformContext } from '../access.mts';
import type { AccessContext } from '../access.mts';
import { objectBody, problem, readBody, reasonField, sendJson } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { route } from '../router.mts';
import type { Route, RouteContext } from '../router.mts';
import type { FakeBranch, FakeOrganisation, FakeUser, RunState } from '../state.mts';
import { BRANCH_DRAFT_KEYS, branchDetailWire, draftBranchFields } from './branches.mts';
import { branchPage, institutionUserPage, userSummaryWire } from './tenant-reads.mts';

const forbidden = () => problem(403, 'forbidden', 'You are not permitted to perform this action.');

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

/** BG-18 (BranchProvisioningService): `branch.create` must hold inside the tenant too: an ACTIVE
 * membership there and an ACTIVE TENANT-scope role that grants it. */
function canCreateIn(state: RunState, userId: string, organisationId: string): boolean {
  const member = state.memberships.some(
    (row) =>
      row.userId === userId && row.organisationId === organisationId && row.status === 'ACTIVE',
  );
  return (
    member &&
    state.roleAssignments.some(
      (grant) =>
        grant.userId === userId &&
        grant.organisationId === organisationId &&
        grant.status === 'ACTIVE' &&
        grant.scopeType === 'TENANT' &&
        state.roles.some(
          (role) =>
            role.id === grant.roleId &&
            role.status === 'ACTIVE' &&
            role.permissions.includes('branch.create'),
        ),
    )
  );
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
      // ponytail: deactivation also revokes the user's role assignments (contract §G); nothing in
      // the platform workspace reads them, so the fake leaves them.
      user.status = to;
      return { user_id: user.id, status: to };
    });
  });
}

export const platformRecordRoutes: Route[] = [
  route('GET', '/api/v1/platform/tenants/:tenant_id/branches', (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'branch.view');
    sendJson(context.res, 200, branchPage(context.state, findTenant(context).id, context.query));
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
    sendJson(context.res, 200, branchDetailWire(found));
  }),

  route('POST', '/api/v1/platform/tenants/:tenant_id/branches', async (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'branch.create');
    const tenant = findTenant(context);
    const body = objectBody(await readBody(context.req), BRANCH_DRAFT_KEYS);
    const draft = draftBranchFields(body);
    sendIdempotent(
      context,
      body,
      () => {
        // Inside the producer, so a refusal stores nothing and a retry re-executes.
        if (!canCreateIn(context.state, access.claims.userId, tenant.id)) throw forbidden();
        // Contract §E.3 `POST /branches`: 409 unless the organisation is ACTIVE or PROVISIONING.
        if (tenant.status !== 'ACTIVE' && tenant.status !== 'PROVISIONING') {
          throw problem(409, 'conflict', 'The organisation must be ACTIVE or PROVISIONING.');
        }
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
          parentBranchId: draft.parentId,
          statusReason: null,
          createdAt: now,
          updatedAt: now,
          draftedBy: access.claims.userId,
        };
        branches.push(created);
        // ponytail: no audit row; it lands in the tenant's log, which the platform can't read (BG-06).
        return { branch_id: created.id, status: 'DRAFT' };
      },
      201,
    );
  }),

  route('GET', '/api/v1/platform/tenants/:tenant_id/users', (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'user.view');
    sendJson(
      context.res,
      200,
      institutionUserPage(context.state, findTenant(context).id, context.query),
    );
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
    sendJson(context.res, 200, userSummaryWire(user, membership));
  }),

  accountTransition('suspend', 'user.suspend', 'ACTIVE', 'SUSPENDED', true),
  accountTransition('reactivate', 'user.activate', 'SUSPENDED', 'ACTIVE', false),
  accountTransition('deactivate', 'user.deactivate', 'ACTIVE', 'DEACTIVATED', true),
];
