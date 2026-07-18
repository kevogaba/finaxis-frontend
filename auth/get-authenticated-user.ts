import 'server-only';
import { auth } from './auth';
import { mapAuthenticatedUser } from './map-authenticated-user';
import type { FinaxisUser } from './auth.types';

export async function getAuthenticatedUser(headers: Headers): Promise<FinaxisUser | null> {
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
