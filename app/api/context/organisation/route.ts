import { headers } from 'next/headers';
import { z } from 'zod';
import { toBrowserOrganisationSelection } from '@/auth/context-browser-dto';
import { selectOrganisation } from '@/auth/context-service';
import { setContextToken } from '@/auth/context-cookie';
import {
  requireAuthenticatedUser,
  UnauthenticatedContextRequestError,
} from '@/auth/require-authenticated-user';

const uuidSyntax = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requestSchema = z.object({
  organisation_id: z.string().regex(uuidSyntax),
});
const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';
const CONTEXT_ACCESS_DENIED_MESSAGE = 'You do not have access to this context.';

async function readOrganisationId(request: Request): Promise<string | null> {
  try {
    const body: unknown = await request.json();
    const parsed = requestSchema.safeParse(body);
    return parsed.success ? parsed.data.organisation_id : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const organisationId = await readOrganisationId(request);
  if (!organisationId) {
    return Response.json({ message: 'A valid organisation_id is required.' }, { status: 400 });
  }

  try {
    const requestHeaders = await headers();
    await requireAuthenticatedUser(requestHeaders);
    const selection = await selectOrganisation(requestHeaders, organisationId);
    await setContextToken(selection.context_token);
    return Response.json(toBrowserOrganisationSelection(selection));
  } catch (error) {
    if (error instanceof UnauthenticatedContextRequestError) {
      return Response.json({ message: SESSION_EXPIRED_MESSAGE }, { status: 401 });
    }

    const status =
      typeof error === 'object' && error !== null && 'status' in error ? error.status : 502;
    if (status === 401) {
      return Response.json({ message: SESSION_EXPIRED_MESSAGE }, { status });
    }
    if (status === 403) {
      return Response.json({ message: CONTEXT_ACCESS_DENIED_MESSAGE }, { status });
    }

    return Response.json(
      { message: 'Context service is temporarily unavailable.' },
      { status: 502 },
    );
  }
}
