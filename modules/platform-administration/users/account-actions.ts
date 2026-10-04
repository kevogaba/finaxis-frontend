'use server';

import { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { getCurrentContextProfile } from '@/auth/context-service';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiPost } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import {
  ACCOUNT_CHANGED,
  CONFIRM_USERNAME_MISMATCH,
  OWN_ACCOUNT,
  OWN_ACCOUNT_CODE,
} from './account-rules';

const idempotencyKey = z.uuid();
const accountInput = z.object({ idempotencyKey, userId: uuidSchema });
const requiredReason = z
  .string()
  .trim()
  .min(3, 'Give a reason of at least 3 characters.')
  .max(500, 'Keep the reason under 500 characters.');
// No `|| null` transform: a trimmed '' is falsy, so a blank reason still sends `{}`.
const optionalReason = z
  .string()
  .trim()
  .max(500, 'Keep the reason under 500 characters.')
  .optional();
// CRITICAL (Ruling 5): the username typed back. A UX guard; the permission is the gate.
const deactivateInput = accountInput
  .extend({
    reason: requiredReason,
    username: z.string().min(1),
    confirmUsername: z.string().trim(),
  })
  .refine((input) => input.confirmUsername === input.username, {
    path: ['confirmUsername'],
    error: CONFIRM_USERNAME_MISMATCH,
  });

/** Ruling 6, BG-35: suspending or deactivating your own account would end every session, and
 * deactivating it can't be undone. A hand-crafted request is refused too, before any call. */
async function refuseOwnAccount(userId: string): Promise<void> {
  const selected = await getCurrentContextProfile();
  if (selected.kind === 'resolved' && selected.profile.user_id.toLowerCase() === userId) {
    throw new BackendApiError(409, { code: OWN_ACCOUNT_CODE });
  }
}

function transition(
  path: 'suspend' | 'reactivate' | 'deactivate',
  schema: z.ZodType<{ idempotencyKey: string; userId: string; reason?: string }>,
  formData: FormData,
): Promise<ActionResult> {
  return runServerAction(schema, formData, async (input) => {
    const userId = input.userId.toLowerCase();
    if (path !== 'reactivate') await refuseOwnAccount(userId);
    return apiPost(
      `/api/v1/platform/users/${userId}/${path}`,
      input.reason ? { reason: input.reason } : {},
      input.idempotencyKey,
    );
  });
}

function explainAccount(result: ActionResult): ActionResult {
  return explain(explain(result, OWN_ACCOUNT_CODE, OWN_ACCOUNT), 'conflict', ACCOUNT_CHANGED);
}

/** ACTIVE only (contract §E.2): the account is suspended in every institution. */
export async function suspendAccount(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explainAccount(
    await transition('suspend', accountInput.extend({ reason: requiredReason }), formData),
  );
}

/** SUSPENDED only. The body is required, so a blank reason sends `{}` (contract §D). */
export async function reactivateAccount(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explainAccount(
    await transition('reactivate', accountInput.extend({ reason: optionalReason }), formData),
  );
}

/** ACTIVE only; permanent (§F) and the role assignments go with it (§G). */
export async function deactivateAccount(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explainAccount(await transition('deactivate', deactivateInput, formData));
}
