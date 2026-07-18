import { describe, expect, it } from 'vitest';
import { createContentSecurityPolicy, createSecurityHeaders, keycloakOrigin } from './next.config';

describe('next security headers', () => {
  it('adds the Keycloak issuer origin to form-action', () => {
    const csp = createContentSecurityPolicy({
      KEYCLOAK_ISSUER: 'http://localhost:8080/realms/finaxis',
      NODE_ENV: 'production',
    });

    expect(csp).toContain("form-action 'self' http://localhost:8080");
  });

  it('requires Keycloak issuer when emitting CSP outside tests', () => {
    expect(() => createContentSecurityPolicy({ NODE_ENV: 'production' })).toThrow(
      'KEYCLOAK_ISSUER is required',
    );
  });

  it('rejects invalid Keycloak issuer values', () => {
    expect(() => keycloakOrigin({ KEYCLOAK_ISSUER: 'not a url', NODE_ENV: 'production' })).toThrow(
      'KEYCLOAK_ISSUER must be a valid URL',
    );
  });

  it('allows React development eval without weakening production CSP', () => {
    const developmentCsp = createContentSecurityPolicy({
      KEYCLOAK_ISSUER: 'http://localhost:8080/realms/finaxis',
      NODE_ENV: 'development',
    });
    const productionCsp = createContentSecurityPolicy({
      KEYCLOAK_ISSUER: 'https://identity.finaxis.example/realms/finaxis',
      NODE_ENV: 'production',
    });

    expect(developmentCsp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(productionCsp).toContain("script-src 'self' 'unsafe-inline'");
    expect(productionCsp).not.toContain("'unsafe-eval'");
  });

  it('keeps HSTS production-only', () => {
    expect(
      createSecurityHeaders({
        KEYCLOAK_ISSUER: 'https://identity.finaxis.example/realms/finaxis',
        NODE_ENV: 'production',
      }),
    ).toContainEqual({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains',
    });
    expect(
      createSecurityHeaders({
        KEYCLOAK_ISSUER: 'http://localhost:8080/realms/finaxis',
        NODE_ENV: 'development',
      }),
    ).not.toContainEqual({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains',
    });
  });
});
