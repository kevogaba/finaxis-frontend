import { describe, expect, it } from 'vitest';
import { parseUserListQuery } from '@/modules/administration/users/user-query';
import {
  institutionUserListApiPath,
  institutionUsersHref,
  PLATFORM_USERS_HREF,
} from './institution-user-query';

const ID = '17000000-0000-4000-8000-0000000000ac';

describe('institution user query', () => {
  it("lists an institution's users with the user filters and no sort (newest first)", () => {
    const query = parseUserListQuery(
      new URLSearchParams(
        'q=mensah&userStatus=SUSPENDED&membershipStatus=ACTIVE&sortBy=username&page=1',
      ),
    );
    expect(institutionUserListApiPath(ID, query)).toBe(
      `/api/v1/platform/tenants/${ID}/users?q=mensah&user_status=SUSPENDED&membership_status=ACTIVE&page=1&size=10`,
    );
  });

  it('builds the paths of the Users tab and the platform users page', () => {
    expect(institutionUsersHref(ID)).toBe(`/platform-admin/tenants/${ID}/users`);
    expect(PLATFORM_USERS_HREF).toBe('/platform-admin/users');
  });
});
