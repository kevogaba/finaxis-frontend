export interface BuildKeycloakLogoutUrlInput {
  issuer: string;
  clientId: string;
  postLogoutRedirectUri: string;
  trustedOrigins: readonly string[];
}

/**
 * Never accept an arbitrary logout redirect — the caller's
 * postLogoutRedirectUri must belong to a trusted origin, even though
 * config/env.server.ts already validates AUTH_POST_LOGOUT_REDIRECT_URI at
 * startup. This is defense in depth for any future caller of this function.
 */
export function buildKeycloakLogoutUrl({
  issuer,
  clientId,
  postLogoutRedirectUri,
  trustedOrigins,
}: BuildKeycloakLogoutUrlInput): string {
  const redirectOrigin = new URL(postLogoutRedirectUri).origin;
  const isTrusted = trustedOrigins.some((origin) => new URL(origin).origin === redirectOrigin);

  if (!isTrusted) {
    throw new Error(
      `Refusing to build a Keycloak logout URL for untrusted origin "${redirectOrigin}".`,
    );
  }

  const url = new URL(`${issuer}/protocol/openid-connect/logout`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);
  return url.toString();
}
