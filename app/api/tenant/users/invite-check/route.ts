import { headers } from 'next/headers';
import { BackendApiError } from '@/auth/backend-api';
import {
  requireAuthenticatedUser,
  UnauthenticatedContextRequestError,
} from '@/auth/require-authenticated-user';
import { describeProblem } from '@/lib/api/problem';
import type { EmailCheck } from '@/modules/administration/users/invite-rules';
import { INVITE_FORM_SHAPE } from '@/modules/administration/users/invite-schema';
import { findMemberByEmail } from '@/modules/administration/users/invite-service';

/** Every answer depends on this caller's cookies (the session and the institution's context), and
 * Next adds no Cache-Control to a dynamic response, so a shared cache must not keep one. */
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

/**
 * Same-origin email check for the Invite user wizard's Identity step (Ruling 1): the membership
 * status this email already has in the institution, or null, and for a revoked member their name
 * (the wizard re-invites them by name, BG-28); any other status refuses the email, so it answers
 * no name. The caller can read either from the directory: inviting needs `user.view`
 * institution-wide. A read, so a Route Handler, not a Server Action (Next's
 * guidance); the context token stays server-side, as for UserPicker's search.
 */
export async function GET(request: Request): Promise<Response> {
  const email = (new URL(request.url).searchParams.get('email') ?? '').trim();
  // The Identity step's own rule, so the two can't drift; a wildcard such as `%` is not an address.
  if (!INVITE_FORM_SHAPE.email.safeParse(email).success) {
    return reply({ message: 'Enter a valid email address.' }, 400);
  }
  try {
    await requireAuthenticatedUser(await headers());
    const member = await findMemberByEmail(email);
    const answer: EmailCheck = {
      member:
        member === null
          ? null
          : member.membershipStatus === 'REVOKED'
            ? { membershipStatus: 'REVOKED', displayName: member.displayName }
            : { membershipStatus: member.membershipStatus },
    };
    return reply(answer);
  } catch (error) {
    if (
      error instanceof UnauthenticatedContextRequestError ||
      (error instanceof BackendApiError && error.status === 401)
    ) {
      return reply({ message: 'Your session has expired.' }, 401);
    }
    if (error instanceof BackendApiError && error.status === 403) {
      return reply({ message: "You can't check emails in this context." }, 403);
    }
    // Logs the issue paths or a minted support reference; never echoes the error's text.
    describeProblem(error);
    return reply({ message: 'The email check is unavailable.' }, 502);
  }
}
