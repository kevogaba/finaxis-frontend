import { encodeContext } from '../context-token.mts';
import { objectBody, pageOf, problem, readBody, sendJson, stringField } from '../http.mts';
import { activeAssignmentRows, requireContext, requirePermission } from '../access.mts';
import { route } from '../router.mts';
import type { Route } from '../router.mts';
import type { FakeBranch, RunState } from '../state.mts';

function profileBranch(branch: FakeBranch) {
  return { id: branch.id, code: branch.code, name: branch.name, status: branch.status };
}

/** `/branches` (AvailableBranch) — always ACTIVE, so it reuses `activeAssignmentRows`'s filter. */
function branchRows(state: RunState, userId: string, organisationId: string): FakeBranch[] {
  return activeAssignmentRows(state, userId, organisationId)
    .map((row) => state.branches.find((branch) => branch.id === row.branchId))
    .filter((branch): branch is FakeBranch => branch !== undefined)
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Contract §C: `/me`'s `branches[]` is "per ACTIVE assignment ... may include SUSPENDED
 * branches" — unlike `branchRows`, only the assignment needs to be ACTIVE, not the branch.
 */
function profileBranches(state: RunState, userId: string, organisationId: string): FakeBranch[] {
  return state.branchAssignments
    .filter(
      (row) =>
        row.userId === userId && row.organisationId === organisationId && row.status === 'ACTIVE',
    )
    .map((row) => state.branches.find((branch) => branch.id === row.branchId))
    .filter((branch): branch is FakeBranch => branch !== undefined)
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Contract §A ("Missing required fields"): a `@NotNull` uuid field that's absent or null is
 * `validation_failed` with a `NotNull` violation — distinct from `stringField`'s `invalid_json`
 * for a present-but-wrong-type value, and from bad paging's violations-less `invalid_parameter`
 * (`http.mts`'s `intParam`).
 */
function requiredIdField(body: Record<string, unknown>, key: string): string {
  if (body[key] === undefined || body[key] === null) {
    throw problem(400, 'validation_failed', `Field "${key}" must not be null.`, [
      { field: key, code: 'NotNull', message: 'must not be null' },
    ]);
  }
  return stringField(body, key, { required: true }) ?? '';
}

export const authRoutes: Route[] = [
  route('GET', '/api/v1/auth/organisations', ({ res, query, state }) => {
    const items = state.memberships
      .filter(
        (membership) => membership.userId === state.actorUserId && membership.status === 'ACTIVE',
      )
      .flatMap((membership) => {
        const organisation = state.organisations.find(
          (candidate) =>
            candidate.id === membership.organisationId && candidate.status === 'ACTIVE',
        );
        return organisation
          ? [
              {
                organisation_id: organisation.id,
                membership_id: membership.id,
                tenant_code: organisation.code,
                display_name: organisation.displayName,
                organisation_status: organisation.status,
                membership_status: membership.status,
              },
            ]
          : [];
      });
    sendJson(res, 200, pageOf(items, query));
  }),

  route('POST', '/api/v1/auth/select-organisation', async ({ req, res, state }) => {
    const body = objectBody(await readBody(req), ['organisation_id']);
    const organisationId = requiredIdField(body, 'organisation_id');
    const membership = state.memberships.find(
      (candidate) =>
        candidate.organisationId === organisationId &&
        candidate.userId === state.actorUserId &&
        candidate.status === 'ACTIVE',
    );
    if (state.forbidOrganisationSelection || !membership) {
      throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
    }
    const assigned = activeAssignmentRows(state, state.actorUserId, organisationId)
      .map((row) => row.branchId)
      .sort();
    const branchId = assigned.length === 1 ? (assigned[0] ?? null) : null;
    sendJson(res, 200, {
      organisation_id: organisationId,
      membership_id: membership.id,
      context_token: encodeContext({
        userId: state.actorUserId,
        organisationId,
        membershipId: membership.id,
        branchId,
      }),
      context_header: 'X-Active-Organisation-Context',
      branch_id: branchId,
      requires_branch_selection: assigned.length > 1,
      assigned_branch_ids: assigned,
    });
  }),

  route('GET', '/api/v1/auth/branches', (context) => {
    const access = requireContext(context);
    requirePermission(access, 'auth.select_branch');
    const items = branchRows(context.state, access.claims.userId, access.claims.organisationId).map(
      (branch) => ({
        branch_id: branch.id,
        branch_code: branch.code,
        branch_name: branch.name,
        branch_status: branch.status,
      }),
    );
    sendJson(context.res, 200, pageOf(items, context.query));
  }),

  route('POST', '/api/v1/auth/select-branch', async (context) => {
    const access = requireContext(context);
    requirePermission(access, 'auth.select_branch');
    const body = objectBody(await readBody(context.req), ['branch_id']);
    const branchId = requiredIdField(body, 'branch_id');
    const allowed = activeAssignmentRows(
      context.state,
      access.claims.userId,
      access.claims.organisationId,
    ).some((row) => row.branchId === branchId);
    if (!allowed) {
      throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
    }
    sendJson(context.res, 200, {
      organisation_id: access.claims.organisationId,
      membership_id: access.claims.membershipId,
      branch_id: branchId,
      context_token: encodeContext({ ...access.claims, branchId }),
      context_header: 'X-Active-Organisation-Context',
    });
  }),

  route('GET', '/api/v1/auth/me', (context) => {
    const access = requireContext(context);
    requirePermission(access, 'iam.profile.read');
    const { state } = context;
    const user = state.users.find((candidate) => candidate.id === access.claims.userId);
    if (!user) {
      throw problem(404, 'resource_not_found', 'User not found.');
    }
    const branches = profileBranches(state, user.id, access.organisation.id);
    const selected = state.branches.find((branch) => branch.id === access.claims.branchId);
    const roles = state.roleAssignments
      .filter(
        (assignment) =>
          assignment.userId === user.id &&
          assignment.organisationId === access.organisation.id &&
          assignment.status === 'ACTIVE',
      )
      .flatMap((assignment) => state.roles.filter((role) => role.id === assignment.roleId))
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((role) => ({ id: role.id, code: role.code, name: role.name, status: role.status }));
    sendJson(context.res, 200, {
      user_id: user.id,
      keycloak_subject: user.keycloakSubject,
      email: user.email,
      full_name: user.displayName,
      organisation: {
        id: access.organisation.id,
        code: access.organisation.code,
        name: access.organisation.displayName,
        status: access.organisation.status,
      },
      membership: { id: access.membership.id, status: access.membership.status },
      selected_branch: selected ? profileBranch(selected) : null,
      branches: branches.map(profileBranch),
      roles,
      permissions: [...access.permissions].sort(),
    });
  }),
];
