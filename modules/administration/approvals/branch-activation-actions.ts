'use server';

import { z } from 'zod';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiPost } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import { getBranch } from '@/modules/administration/branches/branch-service';
import {
  ACTIVATE_FORBIDDEN,
  APPROVAL_CHANGED_CODE,
  BRANCH_CHANGED,
  BRANCH_CONTEXT_CODE,
  BRANCH_CONTEXT_REFUSAL,
  MAKER_CHECKER_CODE,
} from './approval-copy';
import { decider, knownMaker, refuse } from './approval-guards';
import { isSameUser } from './approval-rules';

// No `|| null` transform: a trimmed '' is falsy, so a blank reason still sends `{}`.
const activationInput = z.object({
  idempotencyKey: z.uuid(),
  branchId: uuidSchema,
  reason: z.string().trim().max(500, 'Keep the reason under 500 characters.').optional(),
});

/** Branch activation (contract §E.3): All branches only (BG-03, refused before any read), still
 * pending, and never by its drafter when the audit log names them (Ruling 5): each refused before
 * any write. The reason is optional. */
export async function activatePendingBranch(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(activationInput, formData, async (input) => {
    const selected = await decider();
    if (selected.context.branch !== null) throw refuse(409, BRANCH_CONTEXT_CODE);
    const branch = await getBranch(input.branchId.toLowerCase());
    if (branch.status !== 'PENDING_APPROVAL') throw refuse(409, APPROVAL_CHANGED_CODE);
    const holder = { permissions: selected.profile.permissions };
    if (isSameUser(await knownMaker('branch', branch.id, holder), selected.profile.user_id)) {
      throw refuse(403, MAKER_CHECKER_CODE);
    }
    await apiPost(
      `/api/v1/branches/${branch.id.toLowerCase()}/activate`,
      input.reason ? { reason: input.reason } : {},
      input.idempotencyKey,
    );
  });
  let explained = explain(result, BRANCH_CONTEXT_CODE, BRANCH_CONTEXT_REFUSAL);
  explained = explain(explained, APPROVAL_CHANGED_CODE, BRANCH_CHANGED);
  explained = explain(explained, MAKER_CHECKER_CODE, MAKER_CHECKER_BLOCKED);
  return explain(explained, 'forbidden', ACTIVATE_FORBIDDEN);
}
