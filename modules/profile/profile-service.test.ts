import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REQUEST_PATHNAME_HEADER, type FinaxisUser } from '@/auth/auth.types';
import type { BackendProfile } from '@/auth/context.types';
import type { ApplicationContext } from '@/config/application-context';

const { get, getAuthenticatedUser, getCurrentContextProfile, requestHeaders } = vi.hoisted(() => ({
  get: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  getCurrentContextProfile: vi.fn(),
  requestHeaders: new Headers(),
}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(requestHeaders) }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock('@/auth/backend-api', () => ({
  backendApi: { get: (...args: unknown[]) => get(...args) as unknown },
}));
vi.mock('@/auth/get-authenticated-user', () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUser(...args) as unknown,
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
  // The shell's mapper, reduced to what toProfileUser builds on.
  profileToFinaxisUser: (profile: BackendProfile): FinaxisUser => ({
    id: profile.user_id,
    name: profile.full_name ?? '',
    email: profile.email ?? '',
    roles: profile.roles.map((role) => role.code),
    permissions: profile.permissions,
    branches: [],
  }),
}));

const { listMyOrganisations, requireProfile, toProfileUser } = await import('./profile-service');

const PROFILE: BackendProfile = {
  user_id: '55555555-5555-4555-8555-555555555555',
  keycloak_subject: 'kc-subject-never-rendered',
  email: 'jane@greenfield.example',
  full_name: 'Jane Manager',
  organisation: { id: 'org-1', code: 'greenfield', name: 'Greenfield SACCO', status: 'ACTIVE' },
  membership: { id: 'm-1', status: 'ACTIVE' },
  selected_branch: null,
  branches: [
    { id: 'b-1', code: 'HEAD_OFFICE', name: 'Head Office', status: 'ACTIVE' },
    { id: 'b-2', code: 'WESTLANDS', name: 'Westlands Branch', status: 'SUSPENDED' },
  ],
  roles: [{ id: 'r-1', code: 'LEGACY_TELLER', name: 'Legacy teller', status: 'DISABLED' }],
  permissions: ['audit.view'],
};
const SESSION_USER: FinaxisUser = {
  id: 'session-user',
  name: 'Session User',
  email: 'session@greenfield.example',
  roles: [],
  permissions: [],
  branches: [],
};
const CONTEXT: ApplicationContext = {
  module: { id: 'administration', name: 'Administration' },
  organization: { id: 'org-1', name: 'Greenfield SACCO' },
  branch: null,
};

describe('profile service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestHeaders.delete(REQUEST_PATHNAME_HEADER);
  });

  it('adds only display fields to the sanitized user, and never the Keycloak subject', () => {
    const user = toProfileUser(PROFILE, SESSION_USER);

    expect(user).toMatchObject({
      id: PROFILE.user_id,
      organization: { id: 'org-1', name: 'Greenfield SACCO', code: 'greenfield', status: 'ACTIVE' },
      branches: [
        { id: 'b-1', code: 'HEAD_OFFICE', name: 'Head Office', status: 'ACTIVE' },
        { id: 'b-2', code: 'WESTLANDS', name: 'Westlands Branch', status: 'SUSPENDED' },
      ],
      membershipStatus: 'ACTIVE',
      assignedRoles: [
        { id: 'r-1', code: 'LEGACY_TELLER', name: 'Legacy teller', status: 'DISABLED' },
      ],
      permissions: ['audit.view'],
    });
    expect(JSON.stringify(user)).not.toContain('kc-subject-never-rendered');
    expect(toProfileUser({ ...PROFILE, organisation: null }, SESSION_USER)).toBeNull();
  });

  it('sends a missing session to login before reading the context', async () => {
    getAuthenticatedUser.mockResolvedValueOnce(null);

    await expect(requireProfile()).rejects.toThrow('NEXT_REDIRECT:/login?reason=session_expired');
    expect(getCurrentContextProfile).not.toHaveBeenCalled();
  });

  it('sends an unresolved context to /select-context, keeping the tab it came from', async () => {
    requestHeaders.set(REQUEST_PATHNAME_HEADER, '/profile/roles');
    getAuthenticatedUser.mockResolvedValue(SESSION_USER);
    getCurrentContextProfile.mockResolvedValueOnce({
      kind: 'redirect-to-context-selection',
      reason: 'invalid-context',
    });

    await expect(requireProfile()).rejects.toThrow(
      'NEXT_REDIRECT:/select-context?next=%2Fprofile%2Froles',
    );

    getCurrentContextProfile.mockResolvedValueOnce({
      kind: 'resolved',
      profile: { ...PROFILE, organisation: null },
      context: CONTEXT,
    });
    await expect(requireProfile()).rejects.toThrow(
      'NEXT_REDIRECT:/select-context?next=%2Fprofile%2Froles',
    );
  });

  it('returns the profile user and the typed context once both check out', async () => {
    getAuthenticatedUser.mockResolvedValueOnce(SESSION_USER);
    getCurrentContextProfile.mockResolvedValueOnce({
      kind: 'resolved',
      profile: PROFILE,
      context: CONTEXT,
    });

    const { user, context } = await requireProfile();

    expect(user.membershipStatus).toBe('ACTIVE');
    expect(context).toBe(CONTEXT);
  });

  it('lists organisations from the URL page with the bare session JWT (no context header)', async () => {
    get.mockResolvedValueOnce({
      items: [
        {
          organisation_id: 'org-1',
          membership_id: 'm-1',
          tenant_code: 'greenfield',
          display_name: 'Greenfield SACCO',
          organisation_status: 'ACTIVE',
          membership_status: 'ACTIVE',
          ignored_extra: true,
        },
      ],
      page: {
        number: 1,
        size: 20,
        total_items: 21,
        total_pages: 2,
        has_next: false,
        has_previous: true,
      },
    });

    const result = await listMyOrganisations({ page: 1, size: 20 });

    // Exactly two arguments: no context token, so no X-Active-Organisation-Context header.
    expect(get).toHaveBeenCalledWith('/api/v1/auth/organisations?page=1&size=20', requestHeaders);
    expect(result).toEqual({
      items: [
        { id: 'org-1', code: 'greenfield', name: 'Greenfield SACCO', membershipStatus: 'ACTIVE' },
      ],
      page: {
        number: 1,
        size: 20,
        totalItems: 21,
        totalPages: 2,
        hasNext: false,
        hasPrevious: true,
      },
    });
  });

  it('rejects a malformed organisation so the tab shows the safe error state', async () => {
    get.mockResolvedValueOnce({
      items: [{ organisation_id: 'org-1', tenant_code: 'greenfield', membership_status: 'ACTIVE' }],
      page: {
        number: 0,
        size: 10,
        total_items: 1,
        total_pages: 1,
        has_next: false,
        has_previous: false,
      },
    });

    await expect(listMyOrganisations({ page: 0, size: 10 })).rejects.toThrow();
  });
});
