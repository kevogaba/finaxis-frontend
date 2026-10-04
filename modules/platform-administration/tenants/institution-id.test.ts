import { describe, expect, it, vi } from 'vitest';

// A lettered id, so upper-casing it actually changes it.
const PLATFORM = 'abcdef01-2345-4678-89ab-cdef01234567';
const INSTITUTION = '16000000-0000-4000-8000-00000000abcd';

vi.mock('@/config/env.server', () => ({ serverEnv: { PLATFORM_ORGANISATION_ID: PLATFORM } }));

const { isInstitutionId, parseInstitutionId } = await import('./institution-id');

describe('isInstitutionId', () => {
  it.each([
    ['a valid lower-case id', INSTITUTION, true],
    ['a valid upper-case id', INSTITUTION.toUpperCase(), true],
    ['the platform organisation, lower case', PLATFORM, false],
    ['the platform organisation, upper case', PLATFORM.toUpperCase(), false],
    ['the platform organisation, mixed case', 'ABCDEF01-2345-4678-89ab-CDEF01234567', false],
    ['a malformed id', 'pwani-fishermen', false],
    ['a path-like id', '../x', false],
    ['an empty string', '', false],
  ])('%s', (_name, id, expected) => {
    expect(isInstitutionId(id)).toBe(expected);
  });
});

describe('parseInstitutionId', () => {
  it('answers an institution id in lower case', () => {
    expect(parseInstitutionId(INSTITUTION.toUpperCase())).toBe(INSTITUTION);
    expect(parseInstitutionId(INSTITUTION)).toBe(INSTITUTION);
  });

  it.each([
    ['the platform organisation', PLATFORM],
    ['the platform organisation in upper case', PLATFORM.toUpperCase()],
    ['a malformed id', 'pwani-fishermen'],
    ['a path-like id', '../x'],
    ['an empty id', ''],
  ])('answers null for %s', (_case, id) => {
    expect(parseInstitutionId(id)).toBeNull();
  });
});
