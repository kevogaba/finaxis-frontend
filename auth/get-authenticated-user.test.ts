import { describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

const { auth } = await import('./auth');
const { getAuthenticatedUser } = await import('./get-authenticated-user');

describe('getAuthenticatedUser', () => {
  it('returns null when there is no session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

    const result = await getAuthenticatedUser(new Headers());

    expect(result).toBeNull();
  });

  it('maps a present session to a FinaxisUser', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      session: { id: 'session-1', userId: 'user-1' },
      user: {
        id: 'user-1',
        name: 'Amina Yusuf',
        email: 'amina.yusuf@finaxis.test',
        image: null,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as never);

    const result = await getAuthenticatedUser(new Headers());

    expect(result).toEqual({
      id: 'user-1',
      name: 'Amina Yusuf',
      email: 'amina.yusuf@finaxis.test',
      username: undefined,
      image: undefined,
      roles: [],
      branches: [],
      organization: undefined,
      permissions: [],
    });
  });
});
