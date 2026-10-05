'use server';

import { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiPost } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import { MEMBERSHIP_STATUSES, USER_STATUSES } from './user-contract';
import { MEMBERSHIP_CHANGED, MEMBERSHIP_CHANGED_CODE } from './user-rules';
import { getMembership, getUser } from './user-service';

const idempotencyKey = z.uuid();
const membershipInput = z.object({ idempotencyKey, membershipId: uuidSchema });

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

// BG-08: a maker-checker refusal is the same 403 as a missing permission — never assert which.
const APPROVE_FORBIDDEN =
  "You can't approve this user. Your role may not allow it, or you invited them — a different administrator must approve them.";
// BG-07: missing prerequisites, a membership that is no longer pending and a re-approval are 500s.
const APPROVE_FAILED =
  "The approval couldn't complete. They may still need an active role and, for staff and admin members, an active branch assignment, or approval may already have run. Refresh and check.";
const REVOKE_FAILED =
  "This membership couldn't be revoked. It may already be revoked — refresh and check.";

function transition(
  path: 'activate' | 'suspend' | 'reactivate',
  schema: z.ZodType<{ idempotencyKey: string; membershipId: string; reason?: string }>,
  formData: FormData,
): Promise<ActionResult> {
  return runServerAction(schema, formData, (input) =>
    apiPost(
      `/api/v1/tenant/memberships/${input.membershipId}/${path}`,
      input.reason ? { reason: input.reason } : {},
      input.idempotencyKey,
    ),
  );
}

/** The activate endpoint reads no body (contract §E.3): `{}` is sent. 200 = ACTIVE, 202 =
 * identity provisioning queued; the refreshed record shows which (Ruling 9). 12 reuses it. */
export async function approveMembership(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await transition('activate', membershipInput, formData);
  return explain(explain(result, 'forbidden', APPROVE_FORBIDDEN), 'internal_error', APPROVE_FAILED);
}

export async function suspendMembership(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transition('suspend', membershipInput.extend({ reason: requiredReason }), formData);
}

export async function reactivateMembership(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transition('reactivate', membershipInput.extend({ reason: optionalReason }), formData);
}

const revokeInput = membershipInput.extend({
  reason: requiredReason,
  // Layer 12, P-3: Reject & revoke names the status it was offered for (PENDING_APPROVAL) ...
  expectedStatus: z.enum(MEMBERSHIP_STATUSES).optional(),
  // ... and the user's status as the page rendered it: a 202 approval keeps the membership
  // PENDING_APPROVAL and moves only the user to PROVISIONING_IDP (contract §E.3, BG-11), so the
  // membership status alone can't tell "approved meanwhile".
  expectedUserStatus: z.enum(USER_STATUSES).optional(),
});

/** Revoke and Reject & revoke (D12): terminal; every assignment goes with it (BG-28). With an
 * `expectedStatus`, a membership that moved on since the page loaded (approved with a 200,
 * suspended) is refused before the terminal call, and so is one that was approved into identity
 * provisioning (a 202) when the page showed a user who was not provisioning: a stale Reject never
 * revokes an approved member. A record the page showed as provisioning stays revocable (10 offers
 * it), and a membership already REVOKED goes through to the backend, which replays this key's
 * earlier success (anyone else's revoke answers 500: REVOKE_FAILED). Every guard read failure
 * rejects, so a lost session or a stale context redirects and any other failure fails closed. */
export async function revokeMembership(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(revokeInput, formData, async (input) => {
    if (input.expectedStatus) {
      const current = await getMembership(input.membershipId);
      // The user is read only when the membership still looks untouched and the page showed a user
      // who was not provisioning: a page that showed provisioning has nothing to compare against.
      const approvedMeanwhile =
        current.status === input.expectedStatus &&
        input.expectedUserStatus !== undefined &&
        input.expectedUserStatus !== 'PROVISIONING_IDP' &&
        (await getUser(current.userId)).userStatus === 'PROVISIONING_IDP';
      // REVOKED is the revoke's own end state: maybe this key's earlier revoke whose response was
      // lost, which the backend replays; anyone else's revoke answers 500 (REVOKE_FAILED).
      if (
        (current.status !== input.expectedStatus && current.status !== 'REVOKED') ||
        approvedMeanwhile
      ) {
        throw new BackendApiError(409, { code: MEMBERSHIP_CHANGED_CODE });
      }
    }
    await apiPost(
      `/api/v1/tenant/memberships/${input.membershipId}/revoke`,
      { reason: input.reason },
      input.idempotencyKey,
    );
  });
  return explain(
    explain(result, MEMBERSHIP_CHANGED_CODE, MEMBERSHIP_CHANGED),
    'internal_error',
    REVOKE_FAILED,
  );
}
