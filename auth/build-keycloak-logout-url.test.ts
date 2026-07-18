import { describe, expect, it } from 'vitest';
import { buildKeycloakLogoutUrl } from './build-keycloak-logout-url';

const BASE_INPUT = {
  issuer: 'http://localhost:8080/realms/finaxis',
  clientId: 'finaxis-web',
  trustedOrigins: ['http://localhost:3100', 'http://localhost:3000'],
};

describe('buildKeycloakLogoutUrl', () => {
  it('builds the Keycloak end-session URL with client_id and post_logout_redirect_uri', () => {
    const url = buildKeycloakLogoutUrl({
      ...BASE_INPUT,
      postLogoutRedirectUri: 'http://localhost:3100/login',
    });

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      'http://localhost:8080/realms/finaxis/protocol/openid-connect/logout',
    );
    expect(parsed.searchParams.get('client_id')).toBe('finaxis-web');
    expect(parsed.searchParams.get('post_logout_redirect_uri')).toBe('http://localhost:3100/login');
  });

  it('rejects a post-logout redirect whose origin is not in the trusted list', () => {
    expect(() =>
      buildKeycloakLogoutUrl({
        ...BASE_INPUT,
        postLogoutRedirectUri: 'http://evil.example/login',
      }),
    ).toThrow(/untrusted origin/);
  });
});
