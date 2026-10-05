'use server';

import { z } from 'zod';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiPost } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import type { UserStatus } from '@/modules/administration/users/user-contract';
import {
  accountBlockedNote,
  USER_MAKER_CHECKER_BLOCKED,
} from '@/modules/administration/users/user-rules';
import { getMembership, getUser } from '@/modules/administration/users/user-service';
import { membershipDecisionSchema } from './approval-contract';
import {
  ACCOUNT_BLOCKED_CODE,
  APPROVAL_CHANGED,
  APPROVAL_CHANGED_CODE,
  approvalOutcome,
  APPROVE_FAILED,
  APPROVE_FORBIDDEN,
  MAKER_CHECKER_CODE,
  REJECT_FAILED,
  type ApprovalOutcome,
  type ApproveResult,
} from './approval-copy';
import { decider, knownMaker, refuse } from './approval-guards';
import { isSameUser, userApprovalState } from './approval-rules';

const membershipDecisionInput = z.object({ idempotencyKey: z.uuid(), membershipId: uuidSchema });
const requiredReason = z
  .string()
  .trim()
  .min(3, 'Give a reason of at least 3 characters.')
  .max(500, 'Keep the reason under 500 characters.');

/** Ruling 5: the membership the request writes, read back by its own id, and its user by the
 * membership's `user_id` (the backend's ids, never the form's): its state decides what may run. */
async function membershipState(membershipId: string) {
  const membership = await getMembership(membershipId.toLowerCase());
  const user = await getUser(membership.userId);
  return {
    membership,
    userStatus: user.userStatus,
    state: userApprovalState(membership.status, user.userStatus),
  };
}

/** `blocked`: the account status a refusal named, so it reads as the disabled caption does. */
function explainApproval(result: ActionResult, blocked: UserStatus | null): ActionResult {
  let explained = explain(result, APPROVAL_CHANGED_CODE, APPROVAL_CHANGED);
  if (blocked) explained = explain(explained, ACCOUNT_BLOCKED_CODE, accountBlockedNote(blocked));
  explained = explain(explained, MAKER_CHECKER_CODE, USER_MAKER_CHECKER_BLOCKED);
  explained = explain(explained, 'forbidden', APPROVE_FORBIDDEN);
  return explain(explained, 'internal_error', APPROVE_FAILED);
}

/** Ruling 5: Approve is refused before any write wherever the page wouldn't offer it: a membership
 * no longer pending, a provisioning one (re-approval is a 500, BG-07), a blocked account, or the
 * signed-in user's own invitation. 200 or 202 is read from the echo (Ruling 10). */
export async function approveUser(
  _previous: ApproveResult | null,
  formData: FormData,
): Promise<ApproveResult> {
  const seen: { outcome: ApprovalOutcome; blocked: UserStatus | null } = {
    outcome: 'recorded',
    blocked: null,
  };
  const result = await runServerAction(membershipDecisionInput, formData, async (input) => {
    const selected = await decider();
    const { membership, userStatus, state } = await membershipState(input.membershipId);
    if (state === 'blocked') {
      seen.blocked = userStatus;
      throw refuse(409, ACCOUNT_BLOCKED_CODE);
    }
    if (state !== 'awaiting') throw refuse(409, APPROVAL_CHANGED_CODE);
    const holder = { permissions: selected.profile.permissions };
    if (isSameUser(await knownMaker('user', membership.userId, holder), selected.profile.user_id)) {
      throw refuse(403, MAKER_CHECKER_CODE);
    }
    const echo = membershipDecisionSchema.safeParse(
      await apiPost(
        `/api/v1/tenant/memberships/${membership.id.toLowerCase()}/activate`,
        {},
        input.idempotencyKey,
      ),
    );
    seen.outcome = approvalOutcome(echo.success ? echo.data : null);
  });
  if (result.ok) return { ok: true, outcome: seen.outcome };
  const explained = explainApproval(result, seen.blocked);
  // `explain` never turns a failure into a success; this keeps the result's type exact.
  return explained.ok ? { ok: true, outcome: seen.outcome } : explained;
}

/** D12: Reject & revoke is the revoke endpoint: terminal (BG-28). Refused before any write unless
 * the membership is still pending (or already revoked: a replay), so a stale page never revokes
 * someone another administrator approved meanwhile (Ruling 5); a provisioning membership takes no
 * decision here (Ruling 12). It fails closed without a resolved profile, as Approve does. */
export async function rejectUser(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(
    membershipDecisionInput.extend({ reason: requiredReason }),
    formData,
    async (input) => {
      await decider();
      const { membership, state } = await membershipState(input.membershipId);
      // REVOKED is the revoke's own end state: maybe this key's earlier revoke whose response was
      // lost, which the backend replays; anyone else's revoke answers 500 (REJECT_FAILED).
      if (state !== 'awaiting' && state !== 'blocked' && membership.status !== 'REVOKED') {
        throw refuse(409, APPROVAL_CHANGED_CODE);
      }
      await apiPost(
        `/api/v1/tenant/memberships/${membership.id.toLowerCase()}/revoke`,
        { reason: input.reason },
        input.idempotencyKey,
      );
    },
  );
  return explain(
    explain(result, APPROVAL_CHANGED_CODE, APPROVAL_CHANGED),
    'internal_error',
    REJECT_FAILED,
  );
}
