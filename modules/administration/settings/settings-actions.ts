'use server';

import { z } from 'zod';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { apiDelete, apiPut } from '@/lib/api/tenant-api';
import {
  AUTO_ADVANCE_KEY,
  AUTO_ADVANCE_NEEDS_PERMISSION,
  EDITABLE_KEYS,
  INVALID_VALUE,
  MAKER_CHECKER_KEYS,
} from './settings-rules';

// 07's verbatim (business-date-actions.ts:9-16); controller ruling: copy it rather than the brief's transform.
const reason = z
  .string()
  .trim()
  .max(500, 'Keep the reason under 500 characters.')
  .optional()
  .transform((value) => {
    if (!value) return null;
    return value;
  });

// Only the editable keys: read-only, platform-only and unknown keys never reach the backend.
const resetInput = z.object({ idempotencyKey: z.uuid(), key: z.enum(EDITABLE_KEYS), reason });
const updateInput = resetInput
  .extend({
    value: z.string().trim().min(1, 'Choose a value.').max(64, 'Choose a value from the list.'),
  })
  // Turning a maker-checker switch off relaxes a control: the reason is required (spec §8, 07).
  .refine(
    (input) =>
      // The platform lowercases a boolean (TenantSettingCatalog), so `False` turns it off too.
      !(MAKER_CHECKER_KEYS.includes(input.key) && input.value.toLowerCase() === 'false') ||
      (input.reason?.length ?? 0) >= 3,
    { path: ['reason'], message: 'Give a reason of at least 3 characters.' },
  );

const settingPath = (key: string) => `/api/v1/tenant/settings/${encodeURIComponent(key)}`;
// `reason` only when there is one (contract §D).
const reasonBody = (value: string | null) => (value ? { reason: value } : {});

/** PUT → 200 with the setting. The platform names a refused value (422) and, for turning
 * automatic advance on, a missing `business_date.advance` (403). */
export async function updateSetting(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(updateInput, formData, (input) =>
    apiPut(
      settingPath(input.key),
      { value: input.value, ...reasonBody(input.reason) },
      input.idempotencyKey,
    ),
  );
  if (result.ok) return result;
  if (result.code === 'invalid_operation') {
    return {
      ...result,
      formError: INVALID_VALUE,
      fieldErrors: { ...result.fieldErrors, value: INVALID_VALUE },
    };
  }
  if (
    result.code === 'forbidden' &&
    formData.get('key') === AUTO_ADVANCE_KEY &&
    formData.get('value') === 'true'
  ) {
    return { ...result, formError: AUTO_ADVANCE_NEEDS_PERMISSION };
  }
  return result;
}

/** DELETE → 204; the platform default applies again. */
export async function resetSetting(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runServerAction(resetInput, formData, (input) =>
    apiDelete(settingPath(input.key), input.idempotencyKey, reasonBody(input.reason)),
  );
}
