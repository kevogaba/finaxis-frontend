import { afterEach, describe, expect, it, vi } from 'vitest';

// A lettered id, so upper-casing it actually changes it.
const PLATFORM = 'abcdef01-2345-4678-89ab-cdef01234567';
const OTHER = 'abcdef01-2345-4678-89ab-cdef01234568';

const { serverEnv } = vi.hoisted(() => ({ serverEnv: { PLATFORM_ORGANISATION_ID: '' } }));
vi.mock('@/config/env.server', () => ({ serverEnv }));

const {
  administrationModule,
  isPlatformOrganisation,
  platformAdministrationModule,
  resolveApplicationContextModule,
} = await import('./application-context');

describe('isPlatformOrganisation', () => {
  afterEach(() => {
    serverEnv.PLATFORM_ORGANISATION_ID = PLATFORM;
  });

  it.each([
    ['the exact id', PLATFORM, true],
    ['the id in upper case', PLATFORM.toUpperCase(), true],
    ['the id in mixed case', 'ABCDEF01-2345-4678-89ab-CDEF01234567', true],
    ['a different id', OTHER, false],
    ['an empty string', '', false],
  ])('%s', (_name, id, expected) => {
    serverEnv.PLATFORM_ORGANISATION_ID = PLATFORM;
    expect(isPlatformOrganisation(id)).toBe(expected);
  });

  it('is case-insensitive when the configured id is itself upper case (z.uuid() accepts it)', () => {
    serverEnv.PLATFORM_ORGANISATION_ID = PLATFORM.toUpperCase();
    expect(isPlatformOrganisation(PLATFORM)).toBe(true);
    expect(isPlatformOrganisation(PLATFORM.toUpperCase())).toBe(true);
    expect(isPlatformOrganisation(OTHER)).toBe(false);
  });
});

describe('resolveApplicationContextModule', () => {
  it('maps the platform organisation, in any letter case, to the platform module', () => {
    serverEnv.PLATFORM_ORGANISATION_ID = PLATFORM;
    expect(resolveApplicationContextModule(PLATFORM)).toBe(platformAdministrationModule);
    expect(resolveApplicationContextModule(PLATFORM.toUpperCase())).toBe(
      platformAdministrationModule,
    );
  });

  it('maps every other organisation to the administration module', () => {
    serverEnv.PLATFORM_ORGANISATION_ID = PLATFORM;
    expect(resolveApplicationContextModule(OTHER)).toBe(administrationModule);
  });
});
