import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { AUTH_COOKIE_PREFIX, REQUEST_PATHNAME_HEADER } from '@/auth/auth.types';

const PROTECTED_PREFIXES = ['/admin', '/platform-admin', '/profile'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedRoute = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX });
  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/login?reason=session_expired', request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_PATHNAME_HEADER, pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/admin/:path*', '/platform-admin/:path*', '/profile'],
};
