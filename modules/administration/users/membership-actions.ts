'use server';

import { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiPatch, apiPost } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import { APPROVAL_REMARK_TOO_LONG } from '@/modules/administration/approvals/approval-copy';
import {
  EDITABLE_MEMBERSHIP_TYPES,
  MEMBERSHIP_STATUSES,
  MEMBERSHIP_TYPES,
  USER_STATUSES,
} from './user-contract';
import {
  APPROVE_CONFLICT,
  APPROVE_FORBIDDEN,
  APPROVE_NOT_FOUND,
  MEMBERSHIP_CHANGED,
  MEMBERSHIP_CHANGED_CODE,
  MEMBERSHIP_EDIT_REFUSED,
  MEMBERSHIP_TYPE_NEEDS_BRANCH,
  MEMBERSHIP_UNCHANGED,
  MEMBERSHIP_UNCHANGED_CODE,
  RETRY_CONFLICT,
  REVOKE_CONFLICT,
} from './user-rules';
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
// Decision Q7: Activate's remark, the same bound in the field's own word.
const optionalRemark = z.string().trim().max(500, APPROVAL_REMARK_TOO_LONG).optional();

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

/** Activate takes an optional remark (decision Q7, BG-01): `{ reason }` when it isn't blank, else
 * `{}`. The platform keeps it on the `user.approve` audit row. 200 = ACTIVE, 202 = identity
 * provisioning queued; the refreshed record shows which (Ruling 9). The maker-checker refusals
 * keep their own codes' words (`describeProblem`, BG-08). */
export async function approveMembership(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await transition(
    'activate',
    membershipInput.extend({ reason: optionalRemark }),
    formData,
  );
  const refused = explain(result, 'forbidden', APPROVE_FORBIDDEN);
  return explain(
    explain(refused, 'resource_not_found', APPROVE_NOT_FOUND),
    'conflict',
    APPROVE_CONFLICT,
  );
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

/** Revoke and Reject & revoke (D12): every assignment goes with it, and only a new invitation and
 * approval bring the member back (BG-28). With an `expectedStatus`, a membership that moved on
 * since the page loaded (approved with a 200, suspended) is refused before the revoking call, and
 * so is one that was approved into identity provisioning (a 202) when the page showed a user who
 * was not provisioning: a stale Reject never revokes an approved member. A record the page showed
 * as provisioning stays revocable (10 offers it), and a membership already REVOKED goes through to
 * the backend, which replays this key's earlier success (anyone else's revoke answers 409:
 * REVOKE_CONFLICT). Every guard read failure rejects, so a lost session or a stale context
 * redirects and any other failure fails closed. */
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
      // lost, which the backend replays; anyone else's revoke answers 409 (REVOKE_CONFLICT).
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
    'conflict',
    REVOKE_CONFLICT,
  );
}

/** Retry provisioning (BG-11, `InvitationRecoveryService.retry`): no body, and no approval, so no
 * maker-checker rule; a job still running makes it a 200 that changes nothing. A membership no
 * longer pending with its identity provisioning, or one whose provisioning succeeded, is a 409
 * `conflict`: RETRY_CONFLICT. The refreshed record shows where it stands. */
export async function retryInvitation(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(membershipInput, formData, (input) =>
    apiPost(
      `/api/v1/tenant/memberships/${input.membershipId}/invitation/retry`,
      {},
      input.idempotencyKey,
    ),
  );
  return explain(result, 'conflict', RETRY_CONFLICT);
}

/** Resend invitation (BG-11, `InvitationRecoveryService.resend`): no body. Its two 409s, an account
 * that isn't invited and a resend inside the cooldown, are named by their codes
 * (`describeProblem`). */
export async function resendInvitation(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runServerAction(membershipInput, formData, (input) =>
    apiPost(
      `/api/v1/tenant/memberships/${input.membershipId}/invitation/resend`,
      {},
      input.idempotencyKey,
    ),
  );
}

/** A primary branch as the dialog posts it: a branch id, or '' for None. */
const primaryBranch = z.union([z.literal(''), uuidSchema]);

const editInput = membershipInput.extend({
  membershipType: z.enum(EDITABLE_MEMBERSHIP_TYPES, { error: 'Choose a membership type.' }),
  primaryBranchId: primaryBranch,
  // The values the dialog opened with: only a field that differs from its own is sent.
  currentMembershipType: z.enum(MEMBERSHIP_TYPES),
  currentPrimaryBranchId: primaryBranch,
});

/** Edit membership (BG-17, `PATCH /tenant/memberships/{id}`): an absent field stays as it is, so
 * only what changed is sent, and None clears the primary branch with `null`. Saved unchanged, it
 * sends nothing (an empty body is a 422). The platform answers 409 `conflict` when an ACTIVE
 * membership moves to Staff or Admin with no active branch assignment, and 422 when the branch is
 * no longer ACTIVE or the membership was revoked meanwhile; your own membership is editable. */
export async function updateMembership(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(editInput, formData, async (input) => {
    const body = {
      ...(input.membershipType === input.currentMembershipType
        ? {}
        : { membership_type: input.membershipType }),
      ...(input.primaryBranchId === input.currentPrimaryBranchId
        ? {}
        : { primary_branch_id: input.primaryBranchId || null }),
    };
    if (Object.keys(body).length === 0) {
      throw new BackendApiError(422, { code: MEMBERSHIP_UNCHANGED_CODE });
    }
    await apiPatch(`/api/v1/tenant/memberships/${input.membershipId}`, body, input.idempotencyKey);
  });
  return explain(
    explain(
      explain(result, MEMBERSHIP_UNCHANGED_CODE, MEMBERSHIP_UNCHANGED),
      'conflict',
      MEMBERSHIP_TYPE_NEEDS_BRANCH,
    ),
    'invalid_operation',
    MEMBERSHIP_EDIT_REFUSED,
  );
}
