'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiDelete, apiPost } from '@/lib/api/tenant-api';
import { UUID_PATTERN, uuidSchema } from '@/lib/api/wire';
import { BRANCH_ASSIGNMENT_TYPES, branchDraftResultSchema } from './branch-contract';
import { branchDraftSchema } from './branch-rules';

const idempotencyKey = z.uuid();

// No `|| null` transform (prefer-nullish-coalescing has no autofix): `transition()` tests the
// value, and a trimmed '' is falsy, so a blank reason still sends `{}`.
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

const transitionInput = z.object({ idempotencyKey, branchId: uuidSchema, reason: optionalReason });
const reasonedInput = transitionInput.extend({ reason: requiredReason });

// Submit/Activate/Reactivate take an optional reason, Suspend/Close a required one; the body is
// `{}` when there's no reason (contract §D).
function transition(
  path: string,
  schema: typeof transitionInput | typeof reasonedInput,
  formData: FormData,
): Promise<ActionResult> {
  return runServerAction(schema, formData, (input) =>
    apiPost(
      `/api/v1/branches/${input.branchId}/${path}`,
      input.reason ? { reason: input.reason } : {},
      input.idempotencyKey,
    ),
  );
}

export async function createBranchDraft(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(
    branchDraftSchema.extend({ idempotencyKey }),
    formData,
    async (input) => {
      const draft = branchDraftResultSchema.parse(
        await apiPost(
          '/api/v1/branches',
          {
            branch_code: input.branchCode,
            branch_name: input.branchName,
            branch_type: input.branchType,
            parent_branch_id: input.parentBranchId || null,
            timezone: input.timezone,
          },
          input.idempotencyKey,
        ),
      );
      // Rethrown by runServerAction (unstable_rethrow): the client navigates to the new record.
      redirect(`/admin/branches/${draft.branchId}`);
    },
  );
  // 409 = duplicate code OR organisation not ACTIVE (contract §E.3) — never assert which.
  return explain(
    result,
    'conflict',
    "The branch couldn't be created. Its code may already be in use, or the institution can't add branches right now.",
    { branchCode: 'This code may already be in use.' },
  );
}

export async function submitBranch(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transition('submit', transitionInput, formData);
}

export async function activateBranch(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // BG-08: the backend answers a maker-checker violation with the same 403 as a missing permission.
  return explain(
    await transition('activate', transitionInput, formData),
    'forbidden',
    "You can't activate this branch. Your role may not allow it, or you drafted it — a different administrator must activate it.",
  );
}

export async function suspendBranch(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transition('suspend', reasonedInput, formData);
}

export async function reactivateBranch(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transition('reactivate', transitionInput, formData);
}

export async function closeBranch(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explain(
    await transition('close', reasonedInput, formData),
    'conflict',
    // 409 = this guard OR an invalid transition or a race (contract §I) — never assert which.
    "This branch couldn't be closed. A branch can't be closed while users are assigned to it or child branches are active. It may also have changed — refresh and check.",
  );
}

const assignInput = z.object({
  idempotencyKey,
  branchId: uuidSchema,
  userId: z.string().regex(UUID_PATTERN, 'Choose a user.'),
  assignmentType: z.enum(BRANCH_ASSIGNMENT_TYPES, { error: 'Choose an assignment type.' }),
});

export async function assignBranchUser(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(assignInput, formData, (input) =>
    apiPost(
      '/api/v1/tenant/branch-assignments',
      { user_id: input.userId, branch_id: input.branchId, assignment_type: input.assignmentType },
      input.idempotencyKey,
    ),
  );
  return explain(
    result,
    'conflict',
    "This user can't be assigned here: their membership may be revoked, or the branch isn't active.",
  );
}

const revokeInput = z.object({ idempotencyKey, assignmentId: uuidSchema });

export async function revokeBranchAssignment(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(revokeInput, formData, (input) =>
    apiDelete(`/api/v1/tenant/branch-assignments/${input.assignmentId}`, input.idempotencyKey),
  );
  return explain(
    result,
    'conflict',
    // 409 = this guard OR an already-revoked assignment or a race (contract §I) — never assert which.
    "This assignment couldn't be revoked. It may be the user's last branch assignment (staff and admin members need one), or it changed — refresh and check.",
  );
}
