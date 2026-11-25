'use server';

import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiPost } from '@/lib/api/tenant-api';
import { invitationResultSchema } from './invite-contract';
import {
  type BlockingMembershipStatus,
  EMAIL_TAKEN,
  EMAIL_TAKEN_CODE,
  INVITE_CONFLICT,
  INVITE_MAY_BE_SENT,
  INVITE_REFUSED,
  INVITE_REJECTED,
  INVITE_REJECTED_CODE,
  INVITE_STALE_ACCESS,
  memberEmailMessage,
  REINVITE_CONFLICT,
  USERNAME_IN_USE,
  USERNAME_TAKEN,
  USERNAME_TAKEN_CODE,
  userRecordHref,
  USERS_HREF,
} from './invite-rules';
import { checkInviteAccess, INVITE_FORM_SHAPE, inviteBody } from './invite-schema';
import { findMemberByEmail, findMemberByUsername } from './invite-service';

const inviteInput = z
  .object({ ...INVITE_FORM_SHAPE, idempotencyKey: z.uuid() })
  .superRefine(checkInviteAccess);

/** BG-07: a backend refusal by status and code (the detail is never read). */
const isProblem = (error: unknown, status: number, code: string): error is BackendApiError =>
  error instanceof BackendApiError && error.status === status && error.code === code;

/**
 * Invite user (spec §10.5): one `POST /tenant/users` with the key the wizard minted on mount, then
 * the new user's record. The wizard checked the email on its Identity step; the POST still goes
 * first here, so a retry that replays an invitation whose response was lost (same key) is never
 * turned away by its own new member (Ruling 1, as 16's tenant code). After a 409 `conflict` it
 * names a taken email, or else a username a member here holds (Ruling 15), keeping the 409's
 * reference: the platform's code alone can't tell them apart (BG-07). A revoked member's email is
 * re-invited, never refused, and its account's username is never checked, so it names neither
 * and its 409 says so without the username (BG-28). The body is the same for a re-invite: the
 * platform matches the account by email.
 */
export async function inviteUser(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const taken: { status: BlockingMembershipStatus | null; revoked: boolean } = {
    status: null,
    revoked: false,
  };
  const result = await runServerAction(inviteInput, formData, async (input) => {
    let created: unknown;
    try {
      created = await apiPost('/api/v1/tenant/users', inviteBody(input), input.idempotencyKey);
    } catch (error) {
      if (isProblem(error, 400, 'validation_failed')) {
        throw new BackendApiError(400, { code: INVITE_REJECTED_CODE, requestId: error.requestId });
      }
      if (isProblem(error, 409, 'conflict')) {
        // Only disambiguates the failure: an unreadable directory leaves the original error. A
        // failed mutation rolls back its key (contract §A), so a retry with it is safe.
        const member = await findMemberByEmail(input.email).catch(() => null);
        taken.revoked = member?.membershipStatus === 'REVOKED';
        if (member && member.membershipStatus !== 'REVOKED') {
          taken.status = member.membershipStatus;
          // A frontend-detected condition travels as a typed problem (16's `tenant_code_taken`).
          throw new BackendApiError(409, { code: EMAIL_TAKEN_CODE, requestId: error.requestId });
        }
        if (!member && (await findMemberByUsername(input.username).catch(() => null))) {
          throw new BackendApiError(409, { code: USERNAME_TAKEN_CODE, requestId: error.requestId });
        }
      }
      throw error;
    }
    const invitation = invitationResultSchema.safeParse(created);
    // The shell's bell counts the members awaiting approval, and the layout it sits in is reused by
    // the router, so refresh before redirecting (as updateRole does). runServerAction's own
    // refresh() never runs, because redirect() throws first.
    refresh();
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
  const rejected = explain(reused, INVITE_REJECTED_CODE, INVITE_REJECTED);
  const stale = explain(rejected, 'invalid_operation', INVITE_STALE_ACCESS);
  return explain(stale, 'conflict', taken.revoked ? REINVITE_CONFLICT : INVITE_CONFLICT);
}
