'use server';

import { z } from 'zod';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiPost } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import { membershipDecisionSchema } from '@/modules/administration/approvals/approval-contract';
import {
  APPROVAL_REMARK_TOO_LONG,
  approvalOutcome,
  type ApprovalOutcome,
  type ApproveResult,
} from '@/modules/administration/approvals/approval-copy';
import { ACTIVATE_FORBIDDEN } from '@/modules/administration/branches/branch-rules';
import { APPROVE_FORBIDDEN, APPROVE_NOT_FOUND } from '@/modules/administration/users/user-rules';
import { isInstitutionId } from '../tenants/institution-id';
import {
  CHECKER_ACTIVATE_CONFLICT,
  CHECKER_APPROVE_CONFLICT,
  CHECKER_RETURN_CONFLICT,
  CHECKER_SUBMIT_CONFLICT,
} from './checker-rules';

const BASE = '/api/v1/platform/tenants';
const idempotencyKey = z.uuid();
/** BG-29: never the reserved platform organisation (the platform answers it with a 404). */
const tenantId = z.string().refine(isInstitutionId, 'Choose an institution.');

// No `|| null` transform: a trimmed '' is falsy, so a blank optional reason still sends `{}`.
const optionalReason = z
  .string()
  .trim()
  .max(500, 'Keep the reason under 500 characters.')
  .optional();
const requiredReason = z
  .string()
  .trim()
  .min(3, 'Give a reason of at least 3 characters.')
  .max(500, 'Keep the reason under 500 characters.');
// Decision Q7: Approve's remark, the same bound in the field's own word (PR 12).
const optionalRemark = z.string().trim().max(500, APPROVAL_REMARK_TOO_LONG).optional();

/** The body is `{}` without a reason (contract §D). */
const body = (reason: string | undefined) => (reason ? { reason } : {});

// ── Members ──────────────────────────────────────────────────────────────────────────────────────

const approveInput = z.object({
  idempotencyKey,
  tenantId,
  membershipId: uuidSchema,
  reason: optionalRemark,
});

/**
 * `POST /platform/tenants/{id}/memberships/{mid}/activate` (ADR 0028, BG-02): the platform checker
 * approves a new institution's member. 200 or 202 is read from the echo, as the institution's own
 * approval is (Ruling 10), and the optional remark (decision Q7) is sent only when it isn't blank.
 * The platform refuses the inviter, the member themself and a closed window by name
 * (`describeProblem`); there is no pre-read, since the platform holds every rule.
 */
export async function approveAsPlatformChecker(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ApproveResult> {
  const seen: { outcome: ApprovalOutcome } = { outcome: 'recorded' };
  const result = await runServerAction(approveInput, formData, async (input) => {
    const echo = membershipDecisionSchema.safeParse(
      await apiPost(
        `${BASE}/${input.tenantId.toLowerCase()}/memberships/${input.membershipId.toLowerCase()}/activate`,
        body(input.reason),
        input.idempotencyKey,
      ),
    );
    seen.outcome = approvalOutcome(echo.success ? echo.data : null);
  });
  if (result.ok) return { ok: true, outcome: seen.outcome };
  const explained = explain(
    explain(
      explain(result, 'forbidden', APPROVE_FORBIDDEN),
      'resource_not_found',
      APPROVE_NOT_FOUND,
    ),
    'conflict',
    CHECKER_APPROVE_CONFLICT,
  );
  // `explain` never turns a failure into a success; this keeps the result's type exact.
  return explained.ok ? { ok: true, outcome: seen.outcome } : explained;
}

// ── Branches ─────────────────────────────────────────────────────────────────────────────────────

const branchInput = z.object({ idempotencyKey, tenantId, branchId: uuidSchema });

function branchTransition(
  path: 'submit' | 'activate' | 'return',
  reason: typeof optionalReason | typeof requiredReason,
  formData: FormData,
): Promise<ActionResult> {
  return runServerAction(branchInput.extend({ reason }), formData, (input) =>
    apiPost(
      `${BASE}/${input.tenantId.toLowerCase()}/branches/${input.branchId.toLowerCase()}/${path}`,
      body(input.reason),
      input.idempotencyKey,
    ),
  );
}

/** `…/branches/{bid}/submit` (`branch.create`): the window closed is a named 409. */
export async function submitInstitutionBranch(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explain(
    await branchTransition('submit', optionalReason, formData),
    'conflict',
    CHECKER_SUBMIT_CONFLICT,
  );
}

/** `…/branches/{bid}/activate` (`branch.approve`): its creator, its submitter and anyone who edited
 * it are refused by name, as is a closed window; a 403 `forbidden` is a missing permission. */
export async function activateInstitutionBranch(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explain(
    explain(
      await branchTransition('activate', optionalReason, formData),
      'forbidden',
      ACTIVATE_FORBIDDEN,
    ),
    'conflict',
    CHECKER_ACTIVATE_CONFLICT,
  );
}

/** `…/branches/{bid}/return`: Return for changes, or Withdraw for the branch's creator or latest
 * submitter, one route that the platform tells apart by the caller (a withdrawal isn't bounded by
 * the window). */
export async function returnInstitutionBranch(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explain(
    await branchTransition('return', requiredReason, formData),
    'conflict',
    CHECKER_RETURN_CONFLICT,
  );
}
