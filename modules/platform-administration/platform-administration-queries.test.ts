import { describe, expect, it } from 'vitest';
import {
  parseAuditListQuery,
  parseBranchListQuery,
  parseTenantListQuery,
  parseUserListQuery,
  toQueryString,
} from './platform-administration-queries';

describe('platform administration query parsing', () => {
  it('applies safe pagination defaults and preserves supported tenant filters', () => {
    const query = parseTenantListQuery(
      new URLSearchParams('q=Acme%20Ltd&status=ACTIVE&page=2&size=50&sortDir=desc'),
    );

    expect(query).toEqual({
      q: 'Acme Ltd',
      status: 'ACTIVE',
      country: undefined,
      createdFrom: undefined,
      createdTo: undefined,
      page: 2,
      size: 50,
      sortBy: undefined,
      sortDir: 'desc',
    });
  });

  it('normalizes empty filters and parses user and branch filters', () => {
    expect(parseUserListQuery(new URLSearchParams('q=&userStatus=ACTIVE'))).toEqual({
      q: undefined,
      userStatus: 'ACTIVE',
      membershipStatus: undefined,
      page: 0,
      size: 25,
    });
    expect(parseBranchListQuery(new URLSearchParams('type=HEAD_OFFICE&size=10'))).toMatchObject({
      type: 'HEAD_OFFICE',
      page: 0,
      size: 10,
    });
  });

  it('validates audit UUID filters and rejects malformed values', () => {
    expect(() => parseAuditListQuery(new URLSearchParams('actorId=not-a-uuid'))).toThrow();
    expect(
      parseAuditListQuery(
        new URLSearchParams('actorId=11111111-1111-1111-1111-111111111111&entityType=TENANT'),
      ),
    ).toMatchObject({ actorId: '11111111-1111-1111-1111-111111111111', entityType: 'TENANT' });
  });

  it('encodes query values and omits undefined values', () => {
    expect(toQueryString({ q: 'Acme Ltd', page: 0, size: 25, status: undefined })).toBe(
      '?q=Acme+Ltd&page=0&size=25',
    );
  });

  it('bounds pagination and rejects malformed pagination values', () => {
    expect(parseTenantListQuery(new URLSearchParams('size=100'))).toMatchObject({ size: 100 });
    expect(() => parseTenantListQuery(new URLSearchParams('size=101'))).toThrow();
    expect(() => parseTenantListQuery(new URLSearchParams('page=-1'))).toThrow();
    expect(parseTenantListQuery(new URLSearchParams('page=not-a-number')).page).toBe(0);
  });
});
