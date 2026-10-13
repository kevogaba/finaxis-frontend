import { headers } from 'next/headers';
import { BackendApiError } from '@/auth/backend-api';
import {
  requireAuthenticatedUser,
  UnauthenticatedContextRequestError,
} from '@/auth/require-authenticated-user';
import type { EmailCheck } from '@/modules/administration/users/invite-rules';
import { findMemberByEmail } from '@/modules/administration/users/invite-service';

/** RFC 5321's limit, which the Identity step enforces; the contract states none. */
const MAX_EMAIL = 254;

/**
 * Same-origin email check for the Invite user wizard's Identity step (Ruling 1): the membership
 * status this email already has in the institution, or null. A read, so a Route Handler, not a
 * Server Action (Next's guidance); the context token stays server-side, as for UserPicker's search.
 */
export async function GET(request: Request): Promise<Response> {
  const email = (new URL(request.url).searchParams.get('email') ?? '').trim();
  if (!email || email.length > MAX_EMAIL) {
    return Response.json({ message: 'Enter an email address.' }, { status: 400 });
  }
  try {
    await requireAuthenticatedUser(await headers());
    const member = await findMemberByEmail(email);
    const answer: EmailCheck = { membershipStatus: member?.membershipStatus ?? null };
    return Response.json(answer);
  } catch (error) {
    if (
      error instanceof UnauthenticatedContextRequestError ||
      (error instanceof BackendApiError && error.status === 401)
    ) {
      return Response.json({ message: 'Your session has expired.' }, { status: 401 });
    }
    if (error instanceof BackendApiError && error.status === 403) {
      return Response.json({ message: "You can't check emails in this context." }, { status: 403 });
    }
    return Response.json({ message: 'The email check is unavailable.' }, { status: 502 });
  }
}
