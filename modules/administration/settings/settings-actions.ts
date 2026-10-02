'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/auth/get-authenticated-user';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { apiDelete, apiPut } from '@/lib/api/tenant-api';
import { SETTINGS_EDIT_ENABLED } from './settings-flags';
import { EDIT_UNAVAILABLE, EDITABLE_KEYS, withSettingProblem } from './settings-rules';

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

// Only the two editable keys: read-only, platform-only and unknown keys never reach the backend.
const resetInput = z.object({ idempotencyKey: z.uuid(), key: z.enum(EDITABLE_KEYS), reason });
const updateInput = resetInput.extend({
  value: z.string().trim().min(1, 'Choose a value.').max(64, 'Choose a value from the list.'),
});

const settingPath = (key: string) => `/api/v1/tenant/settings/${encodeURIComponent(key)}`;
// `reason` only when there is one (contract §D).
const reasonBody = (value: string | null) => (value ? { reason: value } : {});

/** PUT, behind SETTINGS_EDIT_ENABLED (BG-04). Guarded here too: a Server Action is callable directly. */
export async function updateSetting(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!SETTINGS_EDIT_ENABLED) {
    // Session first, as runServerAction does on the enabled path (index: every Server Action
    // validates the session server-side).
    if (!(await getAuthenticatedUser(await headers()))) {
      redirect('/login?reason=session_expired');
    }
    return {
      ok: false,
      formError: EDIT_UNAVAILABLE,
      fieldErrors: {},
      code: 'settings_edit_unavailable',
      requestId: null,
    };
  }
  return withSettingProblem(
    await runServerAction(updateInput, formData, (input) =>
      apiPut(
        settingPath(input.key),
        { value: input.value, ...reasonBody(input.reason) },
        input.idempotencyKey,
      ),
    ),
  );
}

/** DELETE → 204; the platform default applies again. */
export async function resetSetting(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withSettingProblem(
    await runServerAction(resetInput, formData, (input) =>
      apiDelete(settingPath(input.key), input.idempotencyKey, reasonBody(input.reason)),
    ),
    'reset',
  );
}
