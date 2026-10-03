import { describe, expect, it } from 'vitest';
import { hasTenantFilters, parseTenantListQuery, tenantListApiPath } from './tenant-query';

const parse = (query: string) => parseTenantListQuery(new URLSearchParams(query));

describe('tenant directory query', () => {
  it('defaults to the newest first, ten per page', () => {
    expect(parse('')).toEqual({ sort: { by: 'createdAt', dir: 'DESC' }, page: 0, size: 10 });
  });

  it('keeps every known filter, trimmed', () => {
    expect(
      parse(
        'q=%20acme%20&status=SUSPENDED&country=KE&createdFrom=2026-07-01T00%3A00%3A00.000Z' +
          '&createdTo=2026-07-31T23%3A59%3A59.999Z&sortBy=tenantCode&sortDir=desc&page=2&size=20',
      ),
    ).toEqual({
      q: 'acme',
      status: 'SUSPENDED',
      country: 'KE',
      createdFrom: '2026-07-01T00:00:00.000Z',
      createdTo: '2026-07-31T23:59:59.999Z',
      sort: { by: 'tenantCode', dir: 'DESC' },
      page: 2,
      size: 20,
    });
  });

  it('drops what the backend would answer with a 500 or an empty page (review focus 5)', () => {
    expect(
      parse(
        'status=PAUSED&country=Kenya&createdFrom=2026-07-01&createdTo=yesterday' +
          '&sortBy=status&size=25&page=-1',
      ),
    ).toEqual({ sort: { by: 'createdAt', dir: 'DESC' }, page: 0, size: 10 });
  });

  it('builds the snake_case path with the camelCase sort, leaving out what is unset', () => {
    expect(
      tenantListApiPath(
        parse(
          'q=acme&country=KE&createdTo=2026-07-31T23%3A59%3A59.999Z&sortBy=displayName&sortDir=ASC',
        ),
      ),
    ).toBe(
      '/api/v1/platform/tenants?q=acme&country=KE&created_to=2026-07-31T23%3A59%3A59.999Z' +
        '&sort_by=displayName&sort_dir=ASC&page=0&size=10',
    );
  });

  it('knows when a filter narrows the list', () => {
    expect(hasTenantFilters(parse(''))).toBe(false);
    expect(hasTenantFilters(parse('sortBy=displayName&page=1'))).toBe(false);
    expect(hasTenantFilters(parse('createdFrom=2026-07-01T00%3A00%3A00.000Z'))).toBe(true);
  });
});
