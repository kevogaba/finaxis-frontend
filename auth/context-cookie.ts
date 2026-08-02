import 'server-only';
import { cookies } from 'next/headers';
import { CONTEXT_COOKIE_MAX_AGE_SECONDS, CONTEXT_COOKIE_NAME } from '@/auth/auth.types';
import { serverEnv } from '@/config/env.server';

function contextTokenFromHeader(headers: Headers): string | null {
  const cookieHeader = headers.get('cookie');
  if (!cookieHeader) {
    return null;
  }

  const cookie = cookieHeader
    .split(';')
    .map((value) => value.trim())
    .find((value) => {
      const separator = value.indexOf('=');
      return separator > 0 && value.slice(0, separator) === CONTEXT_COOKIE_NAME;
    });
  if (!cookie) {
    return null;
  }

  try {
    return decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
  } catch {
    return null;
  }
}

export async function readContextToken(headers?: Headers): Promise<string | null> {
  if (headers) {
    return contextTokenFromHeader(headers);
  }

  return (await cookies()).get(CONTEXT_COOKIE_NAME)?.value ?? null;
}

export async function setContextToken(token: string): Promise<void> {
  (await cookies()).set(CONTEXT_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: CONTEXT_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: serverEnv.NODE_ENV === 'production',
  });
}

export async function clearContextToken(): Promise<void> {
  (await cookies()).delete({ name: CONTEXT_COOKIE_NAME, path: '/' });
}
