import 'server-only';
import { getAuthenticatedUser } from './get-authenticated-user';
import type { FinaxisUser } from './auth.types';

export class UnauthenticatedContextRequestError extends Error {
  constructor() {
    super('An authenticated session is required.');
    this.name = 'UnauthenticatedContextRequestError';
  }
}

export async function requireAuthenticatedUser(headers: Headers): Promise<FinaxisUser> {
  const user = await getAuthenticatedUser(headers);
  if (!user) {
    throw new UnauthenticatedContextRequestError();
  }

  return user;
}
