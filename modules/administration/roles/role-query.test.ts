import { describe, expect, it } from 'vitest';
import { parseRoleListQuery, roleListApiPath } from './role-query';

const parse = (query: string) => parseRoleListQuery(new URLSearchParams(query));

describe('role list query', () => {
  it('reads filters, sort, and paging from the URL', () => {
    expect(
      parse('q=%20tell%20&status=DISABLED&type=custom&sortBy=roleCode&sortDir=desc&page=2&size=20'),
    ).toEqual({
      q: 'tell',
      status: 'DISABLED',
      type: 'custom',
      sort: { by: 'roleCode', dir: 'DESC' },
      page: 2,
      size: 20,
    });
  });

  it('drops anything the backend would reject or answer with a 500', () => {
    expect(parse('status=PAUSED&type=both&sortBy=role_code&size=7&page=-1')).toEqual({
      sort: { by: 'createdAt', dir: 'DESC' },
      page: 0,
      size: 10,
    });
  });

  it('builds the snake_case request: system_role from the type, camelCase sort values', () => {
    expect(roleListApiPath(parse('q=tell&type=system&sortBy=roleName'))).toBe(
      '/api/v1/tenant/roles?q=tell&system_role=true&sort_by=roleName&sort_dir=ASC&page=0&size=10',
    );
    expect(roleListApiPath(parse('type=custom'))).toBe(
      '/api/v1/tenant/roles?system_role=false&sort_by=createdAt&sort_dir=DESC&page=0&size=10',
    );
  });
});
