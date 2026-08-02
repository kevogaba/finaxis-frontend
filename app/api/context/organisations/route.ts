import { headers } from 'next/headers';
import { toBrowserOrganisationPage } from '@/auth/context-browser-dto';
import { discoverOrganisations, parseDiscoveryPageQuery } from '@/auth/context-service';
import {
  requireAuthenticatedUser,
  UnauthenticatedContextRequestError,
} from '@/auth/require-authenticated-user';

const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';
const CONTEXT_ACCESS_DENIED_MESSAGE = 'You do not have access to this context.';
const INVALID_PAGE_MESSAGE = 'A valid non-negative page is required.';

export async function GET(request: Request): Promise<Response> {
  try {
    const requestHeaders = await headers();
    await requireAuthenticatedUser(requestHeaders);

    const page = parseDiscoveryPageQuery(new URL(request.url).searchParams.get('page'));
    if (page === null) {
      return Response.json({ message: INVALID_PAGE_MESSAGE }, { status: 400 });
    }

    return Response.json(
      toBrowserOrganisationPage(await discoverOrganisations(requestHeaders, page)),
    );
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
