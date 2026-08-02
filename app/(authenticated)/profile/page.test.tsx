import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redirect } from 'next/navigation';

const { getAuthenticatedUser, getSelectedContextProfile, profileToFinaxisUser } = vi.hoisted(
  () => ({
    getAuthenticatedUser: vi.fn(),
    getSelectedContextProfile: vi.fn(),
    profileToFinaxisUser: vi.fn(),
  }),
);

vi.mock('next/headers', () => ({ headers: vi.fn(() => new Headers()) }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));
vi.mock('@/auth/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/auth/get-authenticated-user', () => ({ getAuthenticatedUser }));
vi.mock('@/auth/context-service', () => ({ getSelectedContextProfile, profileToFinaxisUser }));
vi.mock('@/components/profile/profile-view', () => ({
  ProfileView: ({ user, signedInAt }: { user: unknown; signedInAt: Date }) => (
    <div data-profile={JSON.stringify(user)}>{signedInAt.toISOString()}</div>
  ),
}));

const { auth } = await import('@/auth/auth');
const { default: ProfilePage } = await import('./page');

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.api.getSession).mockResolvedValue({
      session: { createdAt: new Date('2026-07-26T10:00:00.000Z') },
      user: { id: 'user-1' },
    } as never);
    getAuthenticatedUser.mockResolvedValue({
      email: 'jane@example.test',
      id: 'user-1',
      name: 'Jane',
      roles: [],
      branches: [],
      permissions: [],
    });
    getSelectedContextProfile.mockResolvedValue({
      context: {},
      kind: 'resolved',
      profile: { user_id: 'backend-user-1' },
    });
    profileToFinaxisUser.mockReturnValue({ id: 'backend-user-1', name: 'Backend Jane' });
  });

  it('renders the backend profile mapping with the Better Auth signed-in timestamp', async () => {
    const element = await ProfilePage();

    expect(profileToFinaxisUser).toHaveBeenCalledWith(
      { user_id: 'backend-user-1' },
      expect.objectContaining({ id: 'user-1' }),
    );
    expect(element.props.signedInAt).toEqual(new Date('2026-07-26T10:00:00.000Z'));
  });

  it('redirects to context selection when the backend context is not resolved', async () => {
    getSelectedContextProfile.mockResolvedValueOnce({
      kind: 'redirect-to-context-selection',
      reason: 'missing-context-token',
    });

    await expect(ProfilePage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/select-context');
  });
});
