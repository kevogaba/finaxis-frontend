// auth/map-authenticated-user.test.ts
import { describe, expect, it } from 'vitest';
import { mapAuthenticatedUser } from './map-authenticated-user';

describe('mapAuthenticatedUser', () => {
  it('maps a well-formed session user to a FinaxisUser with empty roles and branches', () => {
    const result = mapAuthenticatedUser({
      id: 'user-1',
      name: 'Jane Muthoni',
      email: 'jane.muthoni@finaxis.test',
      image: null,
    });

    expect(result).toEqual({
      id: 'user-1',
      name: 'Jane Muthoni',
      email: 'jane.muthoni@finaxis.test',
      username: undefined,
      image: undefined,
      roles: [],
      permissions: [],
      branches: [],
      organization: undefined,
    });
  });

  it('carries the image through when present', () => {
    const result = mapAuthenticatedUser({
      id: 'user-2',
      name: 'Kevin Otieno',
      email: 'kevin.otieno@finaxis.test',
      image: 'https://cdn.finaxis.test/avatars/kevin.png',
    });

    expect(result.image).toBe('https://cdn.finaxis.test/avatars/kevin.png');
  });

  it('falls back to an empty name rather than throwing when name is blank', () => {
    const result = mapAuthenticatedUser({
      id: 'user-3',
      name: '',
      email: 'no-name@finaxis.test',
      image: null,
    });

    expect(result.name).toBe('');
    expect(result.roles).toEqual([]);
    expect(result.branches).toEqual([]);
  });
});
