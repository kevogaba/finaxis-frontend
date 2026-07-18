import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/auth/auth';
import { serverEnv } from '@/config/env.server';
import { buildKeycloakLogoutUrl } from '@/auth/build-keycloak-logout-url';

export async function POST(request: NextRequest) {
  await auth.api.signOut({ headers: request.headers });

  const logoutUrl = buildKeycloakLogoutUrl({
    issuer: serverEnv.KEYCLOAK_ISSUER,
    clientId: serverEnv.KEYCLOAK_CLIENT_ID,
    postLogoutRedirectUri: serverEnv.AUTH_POST_LOGOUT_REDIRECT_URI,
    trustedOrigins: [serverEnv.BETTER_AUTH_URL, ...serverEnv.AUTH_TRUSTED_ORIGINS],
  });

  return NextResponse.redirect(logoutUrl, { status: 303 });
}
