'use server';

import { z } from 'zod';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { apiPost } from '@/lib/api/tenant-api';
import { isoToBusinessDate } from '@/lib/business-date';

const BASE = '/api/v1/tenant/business-date';

const reason = z
  .string()
  .trim()
  .max(500, 'Keep the reason under 500 characters.')
  .optional()
  .transform((value) => {
    if (!value) return null;
    return value;
  });

const transitionInput = z.object({ idempotencyKey: z.uuid(), reason });

const advanceInput = transitionInput.extend({
  newBusinessDate: z.string().transform((value, context) => {
    const date = isoToBusinessDate(value);
    if (!date) {
      context.addIssue({ code: 'custom', message: 'Choose a valid date.' });
      return z.NEVER;
    }
    return date;
  }),
});

// The backend requires a body on every transition; `reason` only when there is one (contract §D).
const reasonBody = (value: string | null) => (value ? { reason: value } : {});

function transition(path: string, formData: FormData): Promise<ActionResult> {
  return runServerAction(transitionInput, formData, (input) =>
    apiPost(`${BASE}${path}`, reasonBody(input.reason), input.idempotencyKey),
  );
}

export async function startCloseOfBusiness(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transition('/cob/start', formData);
}

export async function completeCloseOfBusiness(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transition('/cob/complete', formData);
}

export async function reopenBusinessDate(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transition('/reopen', formData);
}

export async function advanceBusinessDate(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runServerAction(advanceInput, formData, (input) =>
    apiPost(
      `${BASE}/advance`,
      { new_business_date: input.newBusinessDate, ...reasonBody(input.reason) },
      input.idempotencyKey,
    ),
  );
}
