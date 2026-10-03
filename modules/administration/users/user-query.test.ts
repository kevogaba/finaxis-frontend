import { describe, expect, it } from 'vitest';
import { hasUserFilters, parseUserListQuery, userListApiPath } from './user-query';

describe('user list query', () => {
  it('defaults to the first page of 10, with no filters', () => {
    const query = parseUserListQuery(new URLSearchParams());
    expect(query).toEqual({ page: 0, size: 10 });
    expect(userListApiPath(query)).toBe('/api/v1/tenant/users?page=0&size=10');
    expect(hasUserFilters(query)).toBe(false);
  });

  it('keeps a trimmed search capped at 100 characters', () => {
    expect(parseUserListQuery(new URLSearchParams({ q: '  ann  ' })).q).toBe('ann');
    expect(parseUserListQuery(new URLSearchParams({ q: 'x'.repeat(150) })).q).toHaveLength(100);
  });

  it('drops a blank search instead of keeping an empty one', () => {
    expect(parseUserListQuery(new URLSearchParams({ q: '   ' }))).toEqual({ page: 0, size: 10 });
  });

  it('keeps known statuses and drops anything else, never sending it', () => {
    const query = parseUserListQuery(
      new URLSearchParams({ userStatus: 'SUSPENDED', membershipStatus: 'BOGUS' }),
    );
    expect(query).toEqual({ page: 0, size: 10, userStatus: 'SUSPENDED' });
    expect(
      parseUserListQuery(new URLSearchParams({ userStatus: 'active' })).userStatus,
    ).toBeUndefined();
    expect(userListApiPath(query)).toBe(
      '/api/v1/tenant/users?user_status=SUSPENDED&page=0&size=10',
    );
  });

  it('reads each filter, the search and the paging from the URL', () => {
    expect(
      parseUserListQuery(
        new URLSearchParams(
          'q=ann&userStatus=INVITED&membershipStatus=PENDING_APPROVAL&page=2&size=20',
        ),
      ),
    ).toEqual({
      q: 'ann',
      userStatus: 'INVITED',
      membershipStatus: 'PENDING_APPROVAL',
      page: 2,
      size: 20,
    });
  });

  it('sends snake_case filters, encodes the search, and never sends a sort', () => {
    const path = userListApiPath({
      q: 'ann.mwangi@greenfield.example',
      userStatus: 'ACTIVE',
      membershipStatus: 'PENDING_APPROVAL',
      page: 1,
      size: 20,
    });
    expect(path).toBe(
      '/api/v1/tenant/users?q=ann.mwangi%40greenfield.example&user_status=ACTIVE&membership_status=PENDING_APPROVAL&page=1&size=20',
    );
    expect(path).not.toContain('sort');
  });

  it('never parses or sends a sort from the URL either', () => {
    const query = parseUserListQuery(new URLSearchParams('sortBy=displayName&sortDir=desc'));
    expect(query).toEqual({ page: 0, size: 10 });
    expect(userListApiPath(query)).not.toContain('sort');
  });

  it('falls back for an unlisted page size or a negative page', () => {
    expect(parseUserListQuery(new URLSearchParams({ size: '25', page: '-1' }))).toEqual({
      page: 0,
      size: 10,
    });
  });

  it('reports a filter whenever the search or either status is set', () => {
    expect(hasUserFilters({ page: 0, size: 10, q: 'ann' })).toBe(true);
    expect(hasUserFilters({ page: 0, size: 10, userStatus: 'ACTIVE' })).toBe(true);
    expect(hasUserFilters({ page: 0, size: 10, membershipStatus: 'REVOKED' })).toBe(true);
    expect(hasUserFilters({ page: 3, size: 50 })).toBe(false);
  });
});
