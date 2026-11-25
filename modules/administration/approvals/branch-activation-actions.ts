'use server';

import { z } from 'zod';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiPost } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import { ACTIVATE_FORBIDDEN } from '@/modules/administration/branches/branch-rules';
import { getBranch } from '@/modules/administration/branches/branch-service';
import { APPROVAL_CHANGED_CODE, BRANCH_CHANGED } from './approval-copy';
import { decider, postFromEndState, refuse } from './approval-guards';

// No `|| null` transform: a trimmed '' is falsy, so a blank reason still sends `{}`.
const activationInput = z.object({
  idempotencyKey: z.uuid(),
  branchId: uuidSchema,
  reason: z.string().trim().max(500, 'Keep the reason under 500 characters.').optional(),
});

/** Branch activation (contract §E.3): still pending (or ACTIVE, its own end state: see below), else
 * refused before any write. The platform checks the target branch, whichever branch is selected
 * (BG-03). The drafter is the platform's to refuse: a switch may let them activate (BG-08), and
 * `describeProblem` names its refusal. The reason is optional. */
export async function activatePendingBranch(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(activationInput, formData, async (input) => {
    await decider();
    const branch = await getBranch(input.branchId.toLowerCase());
    // ACTIVE is the activation's own end state: maybe this key's earlier activation whose response
    // was lost, which the backend replays; anyone else's fails there and reads as "changed"
    // (postFromEndState). Other statuses are still refused.
    const endState = branch.status === 'ACTIVE';
    if (branch.status !== 'PENDING_APPROVAL' && !endState) {
      throw refuse(409, APPROVAL_CHANGED_CODE);
    }
    await postFromEndState(endState, () =>
      apiPost(
        `/api/v1/branches/${branch.id.toLowerCase()}/activate`,
        input.reason ? { reason: input.reason } : {},
        input.idempotencyKey,
      ),
    );
  });
  const explained = explain(result, APPROVAL_CHANGED_CODE, BRANCH_CHANGED);
  return explain(explained, 'forbidden', ACTIVATE_FORBIDDEN);
}
