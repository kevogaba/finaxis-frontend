'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { isPlatformOrganisation } from '@/config/application-context';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiPatch, apiPost } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import { isoToBusinessDate } from '@/lib/business-date';
import { tenantDraftResultSchema } from './tenant-contract';
import {
  initialSettings,
  tenantAmendSchema,
  tenantDraftBody,
  tenantDraftSchema,
} from './tenant-rules';
import { tenantCodeTaken } from './tenant-service';

const BASE = '/api/v1/platform/tenants';
const idempotencyKey = z.uuid();
/** BG-29: the reserved platform organisation is no institution, so no action can target it. */
const tenantId = uuidSchema.refine((id) => !isPlatformOrganisation(id), 'Choose an institution.');
/** A frontend-only problem code for create's pre-check (BG-07: the backend's answer is a 500). */
const TENANT_CODE_TAKEN = 'tenant_code_taken';

// No `|| null` transform: `reasoned()` tests the value, and a trimmed '' is falsy, so a blank
// optional reason still sends `{}`.
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

/** Create and amend share these causes (contract §D, §I). Each 422 names its likely field and
 * hedges: the currency check also covers the base currency setting, the value check the settings. */
function explainDraft(result: ActionResult): ActionResult {
  const taken = explain(
    result,
    TENANT_CODE_TAKEN,
    'This tenant code is already in use. Choose another.',
    { tenantCode: 'This code is already in use.' },
  );
  const currency = explain(
    taken,
    'accounting.currency_invalid',
    "The platform can't settle in this currency. Choose another base currency, or clear the base currency setting.",
    { baseCurrencyCode: "The platform can't settle in this currency." },
  );
  return explain(
    currency,
    'invalid_operation',
    'The platform refused a value. Check the timezone and the initial settings.',
  );
}

export async function createTenantDraft(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(
    tenantDraftSchema.extend({ idempotencyKey }),
    formData,
    async (input) => {
      if (await tenantCodeTaken(input.tenantCode)) {
        // A frontend-detected condition travels as a typed problem, so runServerAction maps it like
        // any other (precedent: tenant-api.ts's synthesized 403 for a missing context token).
        throw new BackendApiError(409, { code: TENANT_CODE_TAKEN });
      }
      const draft = tenantDraftResultSchema.parse(
        await apiPost(
          BASE,
          {
            ...tenantDraftBody(input),
            initial_settings: initialSettings(input),
            business_date: isoToBusinessDate(input.businessDate),
          },
          input.idempotencyKey,
        ),
      );
      // Rethrown by runServerAction (unstable_rethrow): the client navigates to the new record.
      redirect(`/platform-admin/tenants/${draft.tenantId}`);
    },
  );
  return explainDraft(result);
}

export async function amendTenantDraft(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(
    tenantAmendSchema.extend({ idempotencyKey, tenantId }),
    formData,
    async (input) => {
      // A full replacement (contract §D). Settings and the business date are ignored, so not sent.
      await apiPatch(`${BASE}/${input.tenantId}`, tenantDraftBody(input), input.idempotencyKey);
      redirect(`/platform-admin/tenants/${input.tenantId}`);
    },
  );
  return explain(
    explainDraft(result),
    'conflict',
    'Only a draft can be amended. It may already have been submitted. Refresh and check.',
  );
}

const tenantInput = z.object({ idempotencyKey, tenantId });

/** Submit, approve and bootstrap retry take no body (contract §E.2). `apiPost` always sends JSON,
 * so the body is `{}`, which the backend never reads; a reason is never forwarded. */
function command(path: string, formData: FormData): Promise<ActionResult> {
  return runServerAction(tenantInput, formData, (input) =>
    apiPost(`${BASE}/${input.tenantId}/${path}`, {}, input.idempotencyKey),
  );
}

const optionalReasonInput = tenantInput.extend({ reason: optionalReason });
const requiredReasonInput = tenantInput.extend({ reason: requiredReason });
// CRITICAL (spec §11.2): the tenant code typed back. A UX guard; the permission is the gate.
const deprovisionInput = requiredReasonInput
  .extend({ tenantCode: z.string().min(1), confirmCode: z.string().trim() })
  .refine((input) => input.confirmCode === input.tenantCode, {
    path: ['confirmCode'],
    error: 'Type the tenant code exactly as shown.',
  });

/** The body is `{}` when there's no reason (contract §D). */
function reasoned(
  path: string,
  schema: typeof optionalReasonInput | typeof requiredReasonInput | typeof deprovisionInput,
  formData: FormData,
): Promise<ActionResult> {
  return runServerAction(schema, formData, (input) =>
    apiPost(
      `${BASE}/${input.tenantId}/${path}`,
      input.reason ? { reason: input.reason } : {},
      input.idempotencyKey,
    ),
  );
}

export async function submitTenant(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // 409 = missing metadata OR a race (contract §I): never assert which.
  return explain(
    await command('submit', formData),
    'conflict',
    "This draft couldn't be submitted. A required detail may be missing, or it changed. Amend it, or refresh and check.",
  );
}

export async function approveTenant(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // BG-08: a maker-checker refusal is the same 403 as a missing permission.
  return explain(
    await command('approve', formData),
    'forbidden',
    "You can't approve this institution. Your role may not allow it, or you created or submitted the request: a different platform administrator must approve it.",
  );
}

export async function rejectTenant(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explain(
    await reasoned('reject', requiredReasonInput, formData),
    'conflict',
    "This request can't be rejected any more. It may already have been decided. Refresh and check.",
  );
}

export async function suspendTenant(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return reasoned('suspend', requiredReasonInput, formData);
}

export async function reactivateTenant(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // 409 = incomplete setup (requireCompleteSetup) OR a race: hedged.
  return explain(
    await reasoned('reactivate', optionalReasonInput, formData),
    'conflict',
    "This institution couldn't be reactivated. Its setup may be incomplete, or it changed. Refresh and check.",
  );
}

export async function deprovisionTenant(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return reasoned('deprovision', deprovisionInput, formData);
}

export async function retryTenantBootstrap(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explain(
    await command('bootstrap/retry', formData),
    'conflict',
    "The bootstrap isn't in a failed state any more. Refresh and check.",
  );
}
