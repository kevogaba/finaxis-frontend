import { headers } from 'next/headers';
import { z } from 'zod';
import { toBrowserBranchSelection } from '@/auth/context-browser-dto';
import { clearContextToken, setContextToken } from '@/auth/context-cookie';
import { ContextTokenMissingError, selectBranch } from '@/auth/context-service';
import {
  requireAuthenticatedUser,
  UnauthenticatedContextRequestError,
} from '@/auth/require-authenticated-user';

const uuidSyntax = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requestSchema = z.object({
  branch_id: z.string().regex(uuidSyntax),
});
const STALE_CONTEXT_MESSAGE =
  'Your saved context is no longer valid. Select an organisation again.';
const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';
const CONTEXT_ACCESS_DENIED_MESSAGE = 'You do not have access to this context.';

async function readBranchId(request: Request): Promise<string | null> {
  try {
    const body: unknown = await request.json();
    const parsed = requestSchema.safeParse(body);
    return parsed.success ? parsed.data.branch_id : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const branchId = await readBranchId(request);
  if (!branchId) {
    return Response.json({ message: 'A valid branch_id is required.' }, { status: 400 });
  }

  try {
    const requestHeaders = await headers();
    await requireAuthenticatedUser(requestHeaders);
    const selection = await selectBranch(requestHeaders, branchId);
    await setContextToken(selection.context_token);
    return Response.json(toBrowserBranchSelection(selection));
  } catch (error) {
    if (error instanceof UnauthenticatedContextRequestError) {
      return Response.json({ message: SESSION_EXPIRED_MESSAGE }, { status: 401 });
    }

    if (error instanceof ContextTokenMissingError) {
      await clearContextToken();
      return Response.json({ message: STALE_CONTEXT_MESSAGE }, { status: 409 });
    }

    const status =
      typeof error === 'object' && error !== null && 'status' in error ? error.status : 502;
    if (status === 401) {
      return Response.json({ message: SESSION_EXPIRED_MESSAGE }, { status });
    }
    if (status === 403) {
      await clearContextToken();
      return Response.json({ message: CONTEXT_ACCESS_DENIED_MESSAGE }, { status });
    }

    return Response.json(
      { message: 'Context service is temporarily unavailable.' },
      { status: 502 },
    );
  }
}
