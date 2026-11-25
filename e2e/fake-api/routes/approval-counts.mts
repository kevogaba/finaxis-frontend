import {
  PLATFORM_ORGANISATION_ID,
  requireContext,
  requirePermission,
  requirePlatformContext,
  requireTenantContext,
} from '../access.mts';
import type { AccessContext } from '../access.mts';
import { problem, ProblemError, sendJson } from '../http.mts';
import { route } from '../router.mts';
import type { Route } from '../router.mts';
import { makerCheckerRequired } from './settings.mts';

/** Method security's refusal (`ApiExceptionHandler.accessDenied`): the endpoint's `@PreAuthorize`
 * reads the selected context's authorities, before the controller asks for its caller. */
function preAuthorize(access: AccessContext, codes: readonly string[]): void {
  if (!codes.some((code) => access.permissions.has(code))) {
    throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
  }
}

/** `ApprovalCountQueryService.holding`: the named refusal a check raised, or null when it passed. */
function refusal(check: () => void): ProblemError | null {
  try {
    check();
    return null;
  } catch (error) {
    if (error instanceof ProblemError) return error;
    throw error;
  }
}

/** Pending approval counts (BG-22, platform #169, ADR 0038): one count per kind, never an inbox. */
export const approvalCountRoutes: Route[] = [
  // ApprovalCountController + ApprovalCountQueryService.tenantPendingCounts.
  route('GET', '/api/v1/tenant/approvals/pending-count', (context) => {
    const access = requireContext(context);
    preAuthorize(access, ['user.approve', 'branch.approve']);
    requireTenantContext(access);
    // Each kind needs its approve code and that code's views tenant-wide: `user.approve` through
    // requireTenantPermission, `branch.approve` through mutationBranchVisibility, which must be
    // AllBranches (a branch-scoped holder is refused as one who holds it nowhere).
    const users = refusal(() => {
      requirePermission(access, 'user.approve');
    });
    const branches = refusal(() => {
      requirePermission(access, 'branch.approve');
    });
    // A caller who may approve neither gets the first resource's named 403.
    if (users && branches) throw users;
    const { state } = access;
    const organisationId = access.organisation.id;
    const me = access.claims.userId;
    // The maker-checker rule would refuse the caller's own, unless the tenant switched it off; an
    // unknown maker (`created_by IS DISTINCT FROM`) is counted. Identities still provisioning are
    // PENDING_APPROVAL memberships too, so they are counted.
    const excludeOwnInvites = makerCheckerRequired(
      state,
      organisationId,
      'require_maker_checker_for_user_invites',
    );
    const excludeOwnBranches = makerCheckerRequired(
      state,
      organisationId,
      'require_maker_checker_for_branch_creation',
    );
    // `@JsonInclude(NON_NULL)`: a kind the caller can't approve has no key at all.
    sendJson(context.res, 200, {
      ...(users
        ? {}
        : {
            memberships: state.memberships.filter(
              (row) =>
                row.organisationId === organisationId &&
                row.status === 'PENDING_APPROVAL' &&
                !(excludeOwnInvites && row.invitedBy === me),
            ).length,
          }),
      ...(branches
        ? {}
        : {
            branches: state.branches.filter(
              (row) =>
                row.organisationId === organisationId &&
                row.status === 'PENDING_APPROVAL' &&
                !(excludeOwnBranches && row.draftedBy === me),
            ).length,
          }),
    });
  }),

  // PlatformApprovalCountController + ApprovalCountQueryService.platformPendingCounts.
  route('GET', '/api/v1/platform/approvals/pending-count', (context) => {
    const access = requireContext(context);
    preAuthorize(access, ['tenant.approve']);
    requirePlatformContext(access);
    requirePermission(access, 'tenant.approve');
    const me = access.claims.userId;
    // The platform checker is never relaxed: a tenant the caller requested or last submitted is
    // always left out, and so is the platform organisation.
    sendJson(context.res, 200, {
      tenants: access.state.organisations.filter(
        (tenant) =>
          tenant.status === 'PENDING_APPROVAL' &&
          tenant.id !== PLATFORM_ORGANISATION_ID &&
          tenant.createdBy !== me &&
          tenant.submittedBy !== me,
      ).length,
    });
  }),
];
