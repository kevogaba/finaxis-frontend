'use server';

import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiDelete, apiPatch, apiPost } from '@/lib/api/tenant-api';
import { UUID_PATTERN, uuidSchema } from '@/lib/api/wire';
import {
  ADDRESS_KEYS,
  addressWire,
  BRANCH_ASSIGNMENT_TYPES,
  branchDraftResultSchema,
} from './branch-contract';
import { ACTIVATE_FORBIDDEN, branchDraftSchema } from './branch-rules';

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

// Submit/Activate/Reactivate take an optional reason, Suspend/Close/Return/Discard a required one;
// the body is `{}` when there's no reason (contract §D).
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
      const address = addressWire(input);
      const draft = branchDraftResultSchema.parse(
        await apiPost(
          '/api/v1/branches',
          {
            branch_code: input.branchCode,
            branch_name: input.branchName,
            branch_type: input.branchType,
            parent_branch_id: input.parentBranchId || null,
            timezone: input.timezone,
            ...(Object.keys(address).length > 0 ? { address } : {}),
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

const RELOAD = 'Reload the page and try again.';

/** The edit form's stored address keys outside the five, as JSON: kept, never guessed at. */
const otherAddress = z
  .string()
  .transform((text, context): unknown => {
    try {
      return JSON.parse(text);
    } catch {
      context.addIssue({ code: 'custom', message: RELOAD });
      return z.NEVER;
    }
  })
  .pipe(z.record(z.string(), z.string(), { error: RELOAD }));

/** An address field as the edit form sends it: trimmed, uncapped. The form caps a value the user
 * changed at 120 (`branchEditSchema`); the platform caps none, so an unchanged stored value of any
 * length goes back with a changed neighbour, as stored. */
const sentAddressField = z.string().trim().optional();

/** Every field optional: the edit form sends only what changed, and the five address fields
 * together when the address did. */
const updateInput = branchDraftSchema
  .omit({ branchCode: true, branchType: true })
  .partial()
  .extend({
    line_1: sentAddressField,
    line_2: sentAddressField,
    city: sentAddressField,
    region: sentAddressField,
    postal_code: sentAddressField,
    idempotencyKey,
    branchId: uuidSchema,
    otherAddress: otherAddress.optional(),
  });

/** `otherAddress` is no field the form shows, so its parse failing (a stale or altered page)
 * names no highlighted field: say so at the form's level instead. */
function staleOtherAddress(result: ActionResult): ActionResult {
  if (result.ok || result.fieldErrors.otherAddress === undefined) return result;
  const fieldErrors = Object.fromEntries(
    Object.entries(result.fieldErrors).filter(([name]) => name !== 'otherAddress'),
  );
  return {
    ...result,
    formError: `We couldn't keep this branch's other address details. ${RELOAD}`,
    fieldErrors,
  };
}

/** PATCH /branches/{id} (BG-13): an absent field stays as it is, an empty parent detaches with
 * `null`, and the address is replaced whole. */
export async function updateBranch(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(updateInput, formData, async (input) => {
    const addressSent = ADDRESS_KEYS.some((key) => input[key] !== undefined);
    await apiPatch(
      `/api/v1/branches/${input.branchId}`,
      {
        ...(input.branchName === undefined ? {} : { branch_name: input.branchName }),
        ...(input.parentBranchId === undefined
          ? {}
          : { parent_branch_id: input.parentBranchId || null }),
        ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
        ...(addressSent ? { address: addressWire(input, input.otherAddress) } : {}),
      },
      input.idempotencyKey,
    );
    // Before the redirect, as updateRole does: the record layout's hero shows the new name.
    refresh();
    redirect(`/admin/branches/${input.branchId}`);
  });
  // 409 = the state OR a closed parent; 422 = the zone, the branch as its own parent or a cycle.
  return explain(
    explain(
      explain(
        staleOtherAddress(result),
        'conflict',
        'This branch can no longer be edited in its current state, or the parent you chose has closed. Refresh and check.',
      ),
      'invalid_operation',
      "The time zone or parent branch isn't accepted. A branch can't be its own ancestor.",
    ),
    'resource_not_found',
    'The parent branch no longer exists.',
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
  // The drafter and the editors have their own codes, explained by describeProblem (BG-08).
  return explain(
    await transition('activate', transitionInput, formData),
    'forbidden',
    ACTIVATE_FORBIDDEN,
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

/** Withdraw and Return: one route, which the platform tells apart by the caller (its creator or
 * latest submitter withdraws). A 409 is the state: the tenant is ACTIVE for any tenant caller. */
export async function returnBranch(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explain(
    await transition('return', reasonedInput, formData),
    'conflict',
    "This branch isn't waiting for approval any more: it was decided, returned or withdrawn elsewhere. Refresh to see where it stands.",
  );
}

export async function discardBranch(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = explain(
    await transition('discard', reasonedInput, formData),
    'lifecycle.head_office_branch_protected',
    "The head office can't be discarded.",
  );
  // 409 = the closure guard OR the state (no longer a draft) — never assert which.
  return explain(
    result,
    'conflict',
    'This draft still has an active child branch or assignment, or it changed. Refresh and check.',
  );
}

const assignInput = z.object({
  idempotencyKey,
  branchId: z.string().regex(UUID_PATTERN, 'Choose a branch.'),
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
