import { randomUUID } from 'node:crypto';
import {
  actorRef,
  branchVisibility,
  canSee,
  mutationVisibility,
  requireAssignSelf,
  requireAuthority,
  requireBranchPermission,
  requireContext,
  requirePermission,
  requireTenantContext,
} from '../access.mts';
import type { AccessContext } from '../access.mts';
import { recordAuditEvent } from '../audit-log.mts';
import {
  objectBody,
  pageOf,
  problem,
  readBody,
  reasonField,
  sendJson,
  stringField,
  UUID,
} from '../http.mts';
import type { Violation } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { makerCheckerRequired } from './settings.mts';
import { route } from '../router.mts';
import type { Route, RouteContext } from '../router.mts';
import type { FakeBranch, FakeBranchAssignment } from '../state.mts';

const BRANCH_CODE = /^[A-Z0-9_-]{2,20}$/;
const ASSIGNMENT_TYPES = ['HOME', 'OPERATE', 'APPROVE', 'VIEW'];
const NEED_A_BRANCH = ['STAFF', 'ADMIN'];

const branchNotFound = () => problem(404, 'resource_not_found', 'Branch not found.');

function tenantAccess(context: RouteContext): AccessContext {
  const access = requireContext(context);
  requireTenantContext(access);
  return access;
}

/** BG-03 (`BranchProvisioningService.requireBranchPermission`): `code` on the target branch first,
 * so a branch-scoped caller gets 403 for any branch its grants don't cover, an unknown id included;
 * then a 404 for an unknown id, whichever branch is selected. */
function targetBranch(access: AccessContext, branchId: string, code: string): FakeBranch {
  requireBranchPermission(access, code, branchId);
  const branch = access.state.branches.find(
    (candidate) => candidate.id === branchId && candidate.organisationId === access.organisation.id,
  );
  if (!branch) throw branchNotFound();
  return branch;
}

/** The makers every branch body carries (BranchSummaryResponse, BranchDetailResponse; BG-08). */
export const branchMakersWire = (access: AccessContext, branch: FakeBranch) => ({
  created_by: actorRef(access, branch.organisationId, branch.draftedBy),
  submitted_by: actorRef(access, branch.organisationId, branch.submittedBy),
});

export const branchDetailWire = (access: AccessContext, branch: FakeBranch) => ({
  id: branch.id,
  organisation_id: branch.organisationId,
  branch_code: branch.code,
  branch_name: branch.name,
  branch_type: branch.type,
  parent_branch_id: branch.parentBranchId,
  status: branch.status,
  timezone: branch.timezone,
  address: {}, // stored, never returned (BG-13)
  opened_on: null, // never set by the API (BG-13)
  closed_on: branch.closedOn ?? null, // only a discarded draft's, so far (#222)
  status_reason: branch.statusReason,
  created_at: branch.createdAt,
  updated_at: branch.updatedAt,
  ...branchMakersWire(access, branch),
});

export const BRANCH_DRAFT_KEYS = [
  'branch_code',
  'branch_name',
  'branch_type',
  'parent_branch_id',
  'timezone',
  'address',
];

/** CreateBranch (contract §D): required strings are `invalid_json` when missing, and so is a
 * `parent_branch_id` that is no UUID (the DTO's decode fails); the code pattern and name size are
 * `validation_failed`. A parent is returned in its canonical lower-case form, as the decode would
 * give it. Shared with the platform route. */
export function draftBranchFields(body: Record<string, unknown>) {
  const code = stringField(body, 'branch_code', { required: true }) ?? '';
  const name = stringField(body, 'branch_name', { required: true }) ?? '';
  const type = stringField(body, 'branch_type', { required: true }) ?? '';
  const timezone = stringField(body, 'timezone', { required: true }) ?? '';
  const rawParent = stringField(body, 'parent_branch_id', { required: false });
  if (rawParent !== null && !UUID.test(rawParent)) {
    throw problem(400, 'invalid_json', 'Malformed request body.');
  }
  const parentId = rawParent?.toLowerCase() ?? null;
  const violations: Violation[] = [];
  if (!BRANCH_CODE.test(code)) {
    violations.push({
      field: 'branch_code',
      code: 'Pattern',
      message: 'must match "^[A-Z0-9_-]{2,20}$"',
    });
  }
  if (name.trim().length < 2 || name.length > 100) {
    violations.push({
      field: 'branch_name',
      code: 'Size',
      message: 'size must be between 2 and 100',
    });
  }
  if (violations.length > 0) {
    throw problem(400, 'validation_failed', 'Validation failed.', violations);
  }
  return { code, name, type, timezone, parentId };
}

const assignmentWire = (row: FakeBranchAssignment) => ({
  id: row.id,
  user_id: row.userId,
  branch_id: row.branchId,
  assignment_type: row.type,
  status: row.status,
});

/** Runs before the state check; what it returns runs after the transition is recorded. */
type Guard = (
  access: AccessContext,
  branch: FakeBranch,
) => ((reason: string | null) => void) | undefined;

/** BG-08: the drafter is refused by name, before the state check (BranchProvisioningService). The
 * tenant route doesn't refuse the submitter; the fake keeps no amenders yet. A stored `false`
 * switch lets the drafter activate, with an extra `branch.self_approve` row, HIGH (ADR 0032). */
const makerChecker: Guard = (access, branch) => {
  if (branch.draftedBy !== access.claims.userId) return undefined;
  if (
    makerCheckerRequired(
      access.state,
      access.organisation.id,
      'require_maker_checker_for_branch_creation',
    )
  ) {
    throw problem(
      403,
      'lifecycle.approver_is_branch_maker',
      "The approver cannot be the branch's creator or submitter.",
    );
  }
  return (reason) => {
    recordAuditEvent(access.state, access, {
      entityType: 'BRANCH',
      entityId: branch.id,
      action: 'branch.self_approve',
      reason,
      severity: 'HIGH',
    });
  };
};

const nothingActiveBelow: Guard = (access, branch) => {
  const assigned = access.state.branchAssignments.some(
    (row) => row.branchId === branch.id && row.status === 'ACTIVE',
  );
  const activeChild = access.state.branches.some(
    (candidate) => candidate.parentBranchId === branch.id && candidate.status === 'ACTIVE',
  );
  if (assigned || activeChild) {
    throw problem(409, 'conflict', 'Branch still has active assignments or active child branches.');
  }
};

/** Discard (#222): the head office is refused by its code, before the state; then the closure
 * guard, whose 409 and the state's look alike. */
const notHeadOffice: Guard = (access, branch) => {
  if (branch.code === 'HEAD_OFFICE') {
    throw problem(
      409,
      'lifecycle.head_office_branch_protected',
      'The head office branch cannot be discarded; it is activated with the tenant.',
    );
  }
  return nothingActiveBelow(access, branch);
};

/** BranchProvisioningService.returnForChanges: the creator or latest submitter withdraws their own
 * request (`branch.create`), anyone else returns it (`branch.approve`). */
const withdrawing = (access: AccessContext, branch: FakeBranch) =>
  [branch.draftedBy, branch.submittedBy].includes(access.claims.userId);

/** The code a return needs: the intent is read from the branch's makers before any permission
 * check (`isBranchMaker`), so an unknown id is a checker's return, refused on the target branch. */
function returnIntent(access: AccessContext, branchId: string): string {
  const branch = access.state.branches.find(
    (candidate) => candidate.id === branchId && candidate.organisationId === access.organisation.id,
  );
  return branch && withdrawing(access, branch) ? 'branch.create' : 'branch.approve';
}

/** A withdrawal writes `branch.withdraw` beside the FSM's row, both with the reason. */
const withdrawal: Guard = (access, branch) => {
  if (!withdrawing(access, branch)) return undefined;
  return (reason) => {
    recordAuditEvent(access.state, access, {
      entityType: 'BRANCH',
      entityId: branch.id,
      action: 'branch.withdraw',
      reason,
    });
  };
};

function transition(
  path: string,
  permission: string | ((access: AccessContext, branchId: string) => string),
  from: readonly string[],
  to: string,
  action: string,
  reasonRequired: boolean,
  guard: Guard = () => undefined,
  /** The route's own `@PreAuthorize` codes, any of which passes it; the target code by default. */
  routeCodes?: readonly string[],
): Route {
  return route('POST', `/api/v1/branches/:branch_id/${path}`, async (context) => {
    const access = tenantAccess(context);
    const branchId = context.params.branch_id ?? '';
    const code = typeof permission === 'string' ? permission : permission(access, branchId);
    // The route's own gate reads the selected context's authorities, its codes alone; the service
    // checks the code and its views on the target (BG-03).
    requireAuthority(access, routeCodes ?? [code]);
    const branch = targetBranch(access, branchId, code);
    const raw = await readBody(context.req);
    // Submit/Activate/Reactivate bodies are optional; Suspend/Close/Return/Discard need a reason
    // (contract §D).
    const body = raw === undefined && !reasonRequired ? {} : objectBody(raw, ['reason']);
    const reason = reasonField(body, reasonRequired);
    sendIdempotent(context, body, () => {
      // The guard first: activate's maker-checker precedes the state (BG-08); close's guard and its
      // state check are both 409 `conflict`, so their order doesn't show.
      const after = guard(access, branch);
      if (!from.includes(branch.status)) {
        throw problem(409, 'conflict', `The branch must be ${from.join(' or ')}.`);
      }
      branch.status = to;
      if (path === 'submit') branch.submittedBy = access.claims.userId; // the latest submitter
      // The tenant's business date (#222); opened_on stays null.
      if (path === 'discard') {
        branch.closedOn = access.state.businessDates.find(
          (row) => row.organisationId === branch.organisationId,
        )?.date;
      }
      branch.statusReason = reason; // overwritten by every transition (contract §C)
      branch.updatedAt = new Date().toISOString();
      recordAuditEvent(context.state, access, {
        entityType: 'BRANCH',
        entityId: branch.id,
        action,
        reason,
      });
      after?.(reason);
      return branchDetailWire(access, branch);
    });
  });
}

export const branchRoutes: Route[] = [
  // A target-aware read with no route gate of its own (ADR 0030 point 5).
  route('GET', '/api/v1/branches/:branch_id', (context) => {
    const access = tenantAccess(context);
    const branch = targetBranch(access, context.params.branch_id ?? '', 'branch.view');
    sendJson(context.res, 200, branchDetailWire(access, branch));
  }),

  route('POST', '/api/v1/branches', async (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'branch.create');
    const body = objectBody(await readBody(context.req), BRANCH_DRAFT_KEYS);
    const { code, name, type, timezone, parentId } = draftBranchFields(body);
    sendIdempotent(
      context,
      body,
      () => {
        const { branches } = context.state;
        if (branches.some((c) => c.organisationId === access.organisation.id && c.code === code)) {
          throw problem(409, 'conflict', 'A branch with this code already exists.');
        }
        if (
          parentId !== null &&
          !branches.some((c) => c.id === parentId && c.organisationId === access.organisation.id)
        ) {
          throw problem(404, 'resource_not_found', 'Parent branch not found.');
        }
        const now = new Date().toISOString();
        const created: FakeBranch = {
          id: randomUUID(),
          organisationId: access.organisation.id,
          code,
          name,
          type,
          status: 'DRAFT',
          timezone,
          parentBranchId: parentId,
          statusReason: null,
          createdAt: now,
          updatedAt: now,
          draftedBy: access.claims.userId,
        };
        branches.push(created);
        recordAuditEvent(context.state, access, {
          entityType: 'BRANCH',
          entityId: created.id,
          action: 'branch.create_draft',
          reason: null,
        });
        return { branch_id: created.id, status: 'DRAFT' };
      },
      201,
    );
  }),

  transition('submit', 'branch.create', ['DRAFT'], 'PENDING_APPROVAL', 'branch.submit', false),
  transition(
    'activate',
    'branch.approve',
    ['PENDING_APPROVAL'],
    'ACTIVE',
    'branch.activate',
    false,
    makerChecker,
  ),
  // `hasAnyAuthority('branch.create', 'branch.approve')`, then the intent's code on the target.
  transition(
    'return',
    returnIntent,
    ['PENDING_APPROVAL'],
    'DRAFT',
    'branch.return_for_changes',
    true,
    withdrawal,
    ['branch.create', 'branch.approve'],
  ),
  transition(
    'discard',
    'branch.create',
    ['DRAFT'],
    'CLOSED',
    'branch.discard',
    true,
    notHeadOffice,
  ),
  transition('suspend', 'branch.suspend', ['ACTIVE'], 'SUSPENDED', 'branch.suspend', true),
  transition(
    'reactivate',
    'branch.reactivate',
    ['SUSPENDED'],
    'ACTIVE',
    'branch.reactivate',
    false,
  ),
  transition(
    'close',
    'branch.close',
    ['ACTIVE', 'SUSPENDED'],
    'CLOSED',
    'branch.close',
    true,
    nothingActiveBelow,
  ),

  // BG-03 (`IamQueryService.searchBranchAssignments`): the branches the caller may view, from
  // every grant; an explicit branch_id outside them is a 403. With no branch_id the search defaults
  // to the selected branch when the caller may view it, unless user_id names someone: then it spans
  // every branch the caller may view.
  route('GET', '/api/v1/tenant/branch-assignments', (context) => {
    const access = tenantAccess(context);
    const visibility = branchVisibility(access, 'branch_assignment.view');
    if (visibility !== 'all' && visibility.size === 0) {
      throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
    }
    const requested = context.query.get('branch_id');
    const userId = context.query.get('user_id');
    if (requested && !canSee(visibility, requested)) {
      throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
    }
    const selected = access.claims.branchId;
    const branchId =
      requested ??
      (userId === null && selected !== null && canSee(visibility, selected) ? selected : null);
    const type = context.query.get('assignment_type');
    const status = context.query.get('status');
    const rows = context.state.branchAssignments.filter(
      (row) =>
        row.organisationId === access.organisation.id &&
        canSee(visibility, row.branchId) &&
        (!branchId || row.branchId === branchId) &&
        (!userId || row.userId === userId) &&
        (!type || row.type === type) &&
        (!status || row.status === status),
    );
    sendJson(context.res, 200, pageOf(rows.map(assignmentWire), context.query));
  }),

  route('POST', '/api/v1/tenant/branch-assignments', async (context) => {
    const access = tenantAccess(context);
    requireAuthority(access, ['user.assign_branch']);
    const body = objectBody(await readBody(context.req), [
      'user_id',
      'branch_id',
      'assignment_type',
    ]);
    const userId = stringField(body, 'user_id', { required: true }) ?? '';
    const type = stringField(body, 'assignment_type', { required: true }) ?? '';
    if (!ASSIGNMENT_TYPES.includes(type)) {
      throw problem(400, 'invalid_json', 'Malformed request body.');
    }
    const branch = targetBranch(
      access,
      stringField(body, 'branch_id', { required: true }) ?? '',
      'user.assign_branch',
    );
    // #342: after the route's own check (the branch's existence is part of it), before the user,
    // organisation and membership lookups.
    requireAssignSelf(access, userId === access.claims.userId);
    sendIdempotent(
      context,
      body,
      () => {
        const { state } = context;
        const member = state.memberships.find(
          (m) => m.userId === userId && m.organisationId === access.organisation.id,
        );
        if (!member) throw problem(404, 'resource_not_found', 'User not found.');
        if (branch.status !== 'ACTIVE' || member.status === 'REVOKED') {
          throw problem(
            409,
            'conflict',
            'The branch or the membership does not allow new assignments.',
          );
        }
        // One ACTIVE row per (user, branch, type): a repeat returns the existing row.
        const existing = state.branchAssignments.find(
          (row) =>
            row.userId === userId &&
            row.branchId === branch.id &&
            row.type === type &&
            row.status === 'ACTIVE',
        );
        if (existing) return assignmentWire(existing);
        const created: FakeBranchAssignment = {
          id: randomUUID(),
          organisationId: access.organisation.id,
          userId,
          branchId: branch.id,
          type,
          status: 'ACTIVE',
        };
        state.branchAssignments.push(created);
        recordAuditEvent(state, access, {
          entityType: 'BRANCH',
          entityId: branch.id,
          action: 'branch.assign_user',
          reason: null,
        });
        return assignmentWire(created);
      },
      201,
    );
  }),

  // BG-03 (`BranchProvisioningService.revokeAssignment`): an authorised combined lookup. A 404 for
  // an unknown id only to a tenant-wide holder; anyone else gets one 403 for an unknown id and for a
  // row on a branch it may not act on.
  route('DELETE', '/api/v1/tenant/branch-assignments/:assignment_id', (context) => {
    const access = tenantAccess(context);
    requireAuthority(access, ['user.revoke_branch']);
    const visibility = mutationVisibility(access, 'user.revoke_branch');
    const { state } = context;
    const row = state.branchAssignments.find(
      (candidate) =>
        candidate.id === context.params.assignment_id &&
        candidate.organisationId === access.organisation.id,
    );
    if (!row && visibility === 'all') {
      throw problem(404, 'resource_not_found', 'Branch assignment not found.');
    }
    if (!row || !canSee(visibility, row.branchId)) {
      throw problem(403, 'forbidden', 'Missing permission: user.revoke_branch.');
    }
    sendIdempotent(context, {}, () => {
      if (row.status !== 'ACTIVE')
        throw problem(409, 'conflict', 'The assignment is already revoked.');
      const member = state.memberships.find(
        (m) => m.userId === row.userId && m.organisationId === row.organisationId,
      );
      const others = state.branchAssignments.some(
        (c) =>
          c.id !== row.id &&
          c.userId === row.userId &&
          c.organisationId === row.organisationId &&
          c.status === 'ACTIVE',
      );
      if (member && NEED_A_BRANCH.includes(member.type) && !others) {
        throw problem(
          409,
          'conflict',
          "A staff or admin member's last branch assignment can't be revoked.",
        );
      }
      row.status = 'REVOKED';
      recordAuditEvent(state, access, {
        entityType: 'BRANCH',
        entityId: row.branchId,
        action: 'branch.revoke_user',
        reason: null,
      });
      // ponytail: summary fields only; the real API returns BranchAssignmentDetail and the UI
      // ignores the body.
      return assignmentWire(row);
    });
  }),
];
