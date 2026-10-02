import { headers } from 'next/headers';
import { BackendApiError } from '@/auth/backend-api';
import {
  requireAuthenticatedUser,
  UnauthenticatedContextRequestError,
} from '@/auth/require-authenticated-user';
import { searchTenantUsers } from '@/modules/administration/users/user-search-service';

const SESSION_EXPIRED = 'Your session has expired. Please sign in again.';

/** Same-origin user search for `UserPicker`: the context token stays server-side. */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireAuthenticatedUser(await headers());
    const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 100);
    return Response.json({ items: await searchTenantUsers(q) });
  } catch (error) {
    if (
      error instanceof UnauthenticatedContextRequestError ||
      (error instanceof BackendApiError && error.status === 401)
    ) {
      return Response.json({ message: SESSION_EXPIRED }, { status: 401 });
    }
    if (error instanceof BackendApiError && error.status === 403) {
      return Response.json({ message: "You can't search users in this context." }, { status: 403 });
    }
    return Response.json({ message: 'User search is temporarily unavailable.' }, { status: 502 });
  }
}
