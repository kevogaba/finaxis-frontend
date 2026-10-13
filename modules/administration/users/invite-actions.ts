'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiPost } from '@/lib/api/tenant-api';
import { invitationResultSchema } from './invite-contract';
import {
  EMAIL_TAKEN,
  EMAIL_TAKEN_CODE,
  INVITE_FAILED,
  INVITE_MAY_BE_SENT,
  INVITE_REFUSED,
  memberEmailMessage,
  USERNAME_IN_USE,
  USERNAME_TAKEN,
  USERNAME_TAKEN_CODE,
  userRecordHref,
  USERS_HREF,
} from './invite-rules';
import { checkInviteAccess, INVITE_FORM_SHAPE, inviteBody } from './invite-schema';
import { findMemberByEmail, findMemberByUsername } from './invite-service';
import type { MembershipStatus } from './user-contract';

const inviteInput = z
  .object({ ...INVITE_FORM_SHAPE, idempotencyKey: z.uuid() })
  .superRefine(checkInviteAccess);

/** BG-07: an invite rule failure is a 500 `internal_error`, which any bug is too. */
const isRuleFailure = (error: unknown): error is BackendApiError =>
  error instanceof BackendApiError && error.status === 500 && error.code === 'internal_error';

/**
 * Invite user (spec §10.5): one `POST /tenant/users` with the key the wizard minted on mount, then
 * the new user's record. The wizard checked the email on its Identity step; the POST still goes
 * first here, so a retry that replays an invitation whose response was lost (same key) is never
 * turned away by its own new member (Ruling 1, as 16's tenant code). After a 500 it names a taken
 * email, or else a username a member here holds (Ruling 15), keeping the 500's reference.
 */
export async function inviteUser(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const taken: { status: MembershipStatus | null } = { status: null };
  const result = await runServerAction(inviteInput, formData, async (input) => {
    let created: unknown;
    try {
      created = await apiPost('/api/v1/tenant/users', inviteBody(input), input.idempotencyKey);
    } catch (error) {
      if (isRuleFailure(error)) {
        // Only disambiguates the failure: an unreadable directory leaves the original error. A
        // failed mutation rolls back its key (contract §A), so a retry with it is safe.
        const member = await findMemberByEmail(input.email).catch(() => null);
        if (member) {
          taken.status = member.membershipStatus;
          // A frontend-detected condition travels as a typed problem (16's `tenant_code_taken`).
          throw new BackendApiError(409, { code: EMAIL_TAKEN_CODE, requestId: error.requestId });
        }
        if (await findMemberByUsername(input.username).catch(() => null)) {
          throw new BackendApiError(409, { code: USERNAME_TAKEN_CODE, requestId: error.requestId });
        }
      }
      throw error;
    }
    const invitation = invitationResultSchema.safeParse(created);
    // Rethrown by runServerAction (unstable_rethrow). The invitation exists either way: an echo
    // without a readable id lands on the directory, where the new member is listed first.
    redirect(invitation.success ? userRecordHref(invitation.data.userId) : USERS_HREF);
  });
  const emailNamed =
    taken.status === null
      ? result
      : explain(result, EMAIL_TAKEN_CODE, EMAIL_TAKEN, { email: memberEmailMessage(taken.status) });
  const named = explain(emailNamed, USERNAME_TAKEN_CODE, USERNAME_TAKEN, {
    username: USERNAME_IN_USE,
  });
  const refused = explain(named, 'forbidden', INVITE_REFUSED);
  // A 409 for a reused key: this wizard already sent different answers, which may have landed.
  const reused = explain(refused, 'IDEMPOTENCY_KEY_REUSED', INVITE_MAY_BE_SENT);
  return explain(reused, 'internal_error', INVITE_FAILED);
}
