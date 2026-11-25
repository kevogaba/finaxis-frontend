'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiPatch, apiPost } from '@/lib/api/tenant-api';
import { isoToBusinessDate } from '@/lib/business-date';
import { APPROVAL_REMARK_TOO_LONG } from '@/modules/administration/approvals/approval-copy';
import { isInstitutionId } from './institution-id';
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
/** BG-29: the reserved platform organisation is no institution, so no action can target it (in any
 * letter case: isInstitutionId). A malformed id gets the same refusal. */
const tenantId = z.string().refine(isInstitutionId, 'Choose an institution.');
/** A frontend-only problem code for a duplicate tenant code (BG-07: the backend's answer is the
 * generic 409 `conflict`, so the directory confirms it). */
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
 * hedges. Only create sends settings, so only its copy points at the initial settings. No base
 * currency setting is ever sent (it mirrors `base_currency_code`), so the currency 422 is the
 * institution's own. */
function explainDraft(result: ActionResult, withSettings: boolean): ActionResult {
  const taken = explain(
    result,
    TENANT_CODE_TAKEN,
    'This tenant code is already in use. Choose another.',
    { tenantCode: 'This code is already in use.' },
  );
  const currency = explain(
    taken,
    'accounting.currency_invalid',
    "The platform can't settle in this currency. Choose another base currency.",
    { baseCurrencyCode: "The platform can't settle in this currency." },
  );
  return explain(
    currency,
    'invalid_operation',
    withSettings
      ? 'The platform refused a value. Check the timezone and the initial settings.'
      : 'The platform refused a value. Check the timezone and the other details.',
  );
}

const isDuplicateCodeFailure = (error: unknown) =>
  error instanceof BackendApiError && error.status === 409 && error.code === 'conflict';

/** The lookup only disambiguates a failure, so an unreadable directory leaves the original error.
 * An amend excepts its own draft, whose unchanged code the directory holds. */
const codeTaken = (code: string, exceptTenantId?: string) =>
  tenantCodeTaken(code, exceptTenantId).catch(() => false);

export async function createTenantDraft(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(
    tenantDraftSchema.extend({ idempotencyKey }),
    formData,
    async (input) => {
      let created: unknown;
      try {
        created = await apiPost(
          BASE,
          {
            ...tenantDraftBody(input),
            initial_settings: initialSettings(input),
            business_date: isoToBusinessDate(input.businessDate),
          },
          input.idempotencyKey,
        );
      } catch (error) {
        // BG-07: a duplicate code is a 409 `conflict`, whose detail is never read, so the directory
        // names it, and only after the create failed: a retry that replays a create whose
        // response was lost (same key) must reach the POST, not meet its own draft in the
        // directory. A failed mutation rolls back its idempotency key (the contract), so a retry
        // with the same key after this failure is safe.
        if (isDuplicateCodeFailure(error) && (await codeTaken(input.tenantCode))) {
          // A frontend-detected condition travels as a typed problem, so runServerAction maps it
          // like any other (precedent: tenant-api.ts's synthesized 403 for a missing context token).
          throw new BackendApiError(409, { code: TENANT_CODE_TAKEN });
        }
        throw error;
      }
      const draft = tenantDraftResultSchema.parse(created);
      // Rethrown by runServerAction (unstable_rethrow): the client navigates to the new record.
      redirect(`/platform-admin/tenants/${draft.tenantId}`);
    },
  );
  return explainDraft(result, true);
}

export async function amendTenantDraft(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(
    tenantAmendSchema.extend({ idempotencyKey, tenantId }),
    formData,
    async (input) => {
      try {
        // A full replacement (contract §D). Settings and the business date are ignored: unsent.
        await apiPatch(`${BASE}/${input.tenantId}`, tenantDraftBody(input), input.idempotencyKey);
      } catch (error) {
        // BG-07: a 409 `conflict` is a draft no longer a draft OR a code another institution holds.
        // As on create, only the directory names the code, and only after the amend failed.
        if (isDuplicateCodeFailure(error) && (await codeTaken(input.tenantCode, input.tenantId))) {
          throw new BackendApiError(409, { code: TENANT_CODE_TAKEN });
        }
        throw error;
      }
      redirect(`/platform-admin/tenants/${input.tenantId}`);
    },
  );
  // A 409 the directory couldn't pin on the code: never assert which cause, nor mark the code.
  return explain(
    explainDraft(result, false),
    'conflict',
    "This draft couldn't be amended. Its tenant code may already be in use, or it may already have been submitted. Refresh and check.",
  );
}

const tenantInput = z.object({ idempotencyKey, tenantId });

/** Submit and bootstrap retry take no body (contract §E.2). `apiPost` always sends JSON, so the
 * body is `{}`, which the backend never reads; a reason is never forwarded. */
function command(path: string, formData: FormData): Promise<ActionResult> {
  return runServerAction(tenantInput, formData, (input) =>
    apiPost(`${BASE}/${input.tenantId}/${path}`, {}, input.idempotencyKey),
  );
}

const optionalReasonInput = tenantInput.extend({ reason: optionalReason });
// Decision Q7: Approve's remark, the same bound in the field's own word.
const optionalRemarkInput = tenantInput.extend({
  reason: z.string().trim().max(500, APPROVAL_REMARK_TOO_LONG).optional(),
});
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
  schema:
    | typeof optionalReasonInput
    | typeof optionalRemarkInput
    | typeof requiredReasonInput
    | typeof deprovisionInput,
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
  // A missing permission only: the maker, an amender and the first administrator have their own
  // codes, explained by `describeProblem` (BG-08). The optional remark (decision Q7, BG-01) becomes
  // the tenant's `status_reason`.
  return explain(
    await reasoned('approve', optionalRemarkInput, formData),
    'forbidden',
    "You can't approve this institution. Your role doesn't allow it.",
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
