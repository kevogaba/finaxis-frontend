import 'server-only';
import { auth } from './auth';
import { mapAuthenticatedUser } from './map-authenticated-user';
import { getE2eAuthenticatedUser } from './e2e-test-mode';
import type { FinaxisUser } from './auth.types';

export async function getAuthenticatedUser(headers: Headers): Promise<FinaxisUser | null> {
  const e2eUser = getE2eAuthenticatedUser(headers);
  if (e2eUser) {
    return e2eUser;
  }

  const session = await auth.api.getSession({ headers });

  if (!session) {
    return null;
  }

  return mapAuthenticatedUser({
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
  });
}
