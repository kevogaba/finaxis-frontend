import { beforeEach, describe, expect, it, vi } from 'vitest';

const { backendApi, readContextToken } = vi.hoisted(() => ({
  backendApi: { get: vi.fn(), post: vi.fn() },
  readContextToken: vi.fn(),
}));

vi.mock('@/auth/backend-api', () => ({ backendApi }));
vi.mock('@/auth/context-cookie', () => ({ readContextToken }));

const {
  ContextTokenMissingError,
  discoverBranches,
  discoverOrganisations,
  getSelectedContextProfile,
  profileToFinaxisUser,
  selectBranch,
  selectOrganisation,
} = await import('./context-service');

const requestHeaders = new Headers({ cookie: 'finaxis.session_token=session-value' });
const organisationId = '9b4c0317-9d61-41d7-a68d-5713ad5b3db2';
const branchId = 'd0e5649c-88fd-4601-8696-0c733987a51c';

const profile = {
  branches: [
    {
      code: 'HQ',
      id: branchId,
      name: 'Headquarters',
      status: 'ACTIVE',
    },
  ],
  email: 'jane.muthoni@finaxis.test',
  full_name: 'Jane Muthoni',
  keycloak_subject: 'keycloak-subject',
  membership: {
    id: '6c2be1af-2e56-47b6-a9ba-26ef2cdbf73e',
    status: 'ACTIVE',
  },
  organisation: {
    code: 'FINAXIS',
    id: organisationId,
    name: 'Finaxis Holdings',
    status: 'ACTIVE',
  },
  permissions: [],
  roles: [],
  selected_branch: {
    code: 'HQ',
    id: branchId,
    name: 'Headquarters',
    status: 'ACTIVE',
  },
  user_id: 'user-1',
};

describe('context service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('discovers the first bounded organisation page with the incoming request headers', async () => {
    backendApi.get.mockResolvedValueOnce({ items: [], page: {} });

    await discoverOrganisations(requestHeaders);

    expect(backendApi.get).toHaveBeenCalledWith(
      '/api/v1/auth/organisations?page=0&size=25',
      requestHeaders,
    );
  });

  it('forwards the requested organisation discovery page with the bounded page size', async () => {
    backendApi.get.mockResolvedValueOnce({ items: [], page: {} });

    await discoverOrganisations(requestHeaders, 4);

    expect(backendApi.get).toHaveBeenCalledWith(
      '/api/v1/auth/organisations?page=4&size=25',
      requestHeaders,
    );
  });

  it('rejects invalid organisation discovery pages before calling the backend', async () => {
    await expect(discoverOrganisations(requestHeaders, -1)).rejects.toBeDefined();

    expect(backendApi.get).not.toHaveBeenCalled();
  });

  it('validates organisation selection identifiers before calling the backend', async () => {
    await expect(selectOrganisation(requestHeaders, 'not-a-uuid')).rejects.toBeDefined();

    expect(backendApi.post).not.toHaveBeenCalled();
  });

  it('sends a validated organisation selection to the backend', async () => {
    backendApi.post.mockResolvedValueOnce({ organisation_id: organisationId });

    await selectOrganisation(requestHeaders, organisationId);

    expect(backendApi.post).toHaveBeenCalledWith(
      '/api/v1/auth/select-organisation',
      { organisation_id: organisationId },
      requestHeaders,
    );
  });

  it('uses only the HttpOnly context cookie for branch discovery', async () => {
    readContextToken.mockResolvedValueOnce('signed-context-token');
    backendApi.get.mockResolvedValueOnce({ items: [], page: {} });

    await discoverBranches(requestHeaders);

    expect(readContextToken).toHaveBeenCalledWith(requestHeaders);
    expect(backendApi.get).toHaveBeenCalledWith(
      '/api/v1/auth/branches?page=0&size=25',
      requestHeaders,
      'signed-context-token',
    );
  });

  it('forwards the requested branch discovery page with the bounded page size', async () => {
    readContextToken.mockResolvedValueOnce('signed-context-token');
    backendApi.get.mockResolvedValueOnce({ items: [], page: {} });

    await discoverBranches(requestHeaders, 2);

    expect(backendApi.get).toHaveBeenCalledWith(
      '/api/v1/auth/branches?page=2&size=25',
      requestHeaders,
      'signed-context-token',
    );
  });

  it('rejects branch selection when no server-side context cookie exists', async () => {
    readContextToken.mockResolvedValueOnce(null);

    await expect(selectBranch(requestHeaders, branchId)).rejects.toBeInstanceOf(
      ContextTokenMissingError,
    );

    expect(backendApi.post).not.toHaveBeenCalled();
  });

  it('validates branch identifiers and forwards the server-side context token', async () => {
    readContextToken.mockResolvedValueOnce('signed-context-token');
    backendApi.post.mockResolvedValueOnce({ branch_id: branchId });

    await selectBranch(requestHeaders, branchId);

    expect(backendApi.post).toHaveBeenCalledWith(
      '/api/v1/auth/select-branch',
      { branch_id: branchId },
      requestHeaders,
      'signed-context-token',
    );
  });

  it('resolves the selected backend profile and a typed application context from the HttpOnly cookie', async () => {
    readContextToken.mockResolvedValueOnce('signed-context-token');
    backendApi.get.mockResolvedValueOnce(profile);

    await expect(getSelectedContextProfile(requestHeaders)).resolves.toEqual({
      context: {
        branch: { id: branchId, name: 'Headquarters' },
        module: { id: 'administration', name: 'Administration' },
        organization: { id: organisationId, name: 'Finaxis Holdings' },
      },
      kind: 'resolved',
      profile,
    });
    expect(backendApi.get).toHaveBeenCalledWith(
      '/api/v1/auth/me',
      requestHeaders,
      'signed-context-token',
    );
  });

  it('maps the backend profile to a sanitized browser DTO', () => {
    const result = profileToFinaxisUser({
      ...profile,
      permissions: ['iam.profile.read', 'iam.user.invite'],
      roles: [
        { code: 'BRANCH_TELLER', id: 'role-1', name: 'Branch Teller', status: 'ACTIVE' },
        { code: 'TENANT_ADMIN', id: 'role-2', name: 'Tenant Administrator', status: 'ACTIVE' },
      ],
    });

    expect(result).toEqual({
      branches: [{ id: branchId, name: 'Headquarters' }],
      email: 'jane.muthoni@finaxis.test',
      id: 'user-1',
      image: undefined,
      name: 'Jane Muthoni',
      organization: { id: organisationId, name: 'Finaxis Holdings' },
      permissions: ['iam.profile.read', 'iam.user.invite'],
      roles: ['BRANCH_TELLER', 'TENANT_ADMIN'],
      selectedBranch: { id: branchId, name: 'Headquarters' },
      username: undefined,
    });
    expect(result).not.toHaveProperty('keycloakSubject');
  });

  it('keeps profile empty states explicit when backend values are null or empty', () => {
    const result = profileToFinaxisUser({
      ...profile,
      branches: [],
      email: 'fallback@finaxis.test',
      full_name: '   ',
      organisation: null,
      permissions: [],
      roles: [],
      selected_branch: null,
    });

    expect(result).toEqual({
      branches: [],
      email: 'fallback@finaxis.test',
      id: 'user-1',
      image: undefined,
      name: 'fallback@finaxis.test',
      organization: undefined,
      permissions: [],
      roles: [],
      selectedBranch: undefined,
      username: undefined,
    });
  });

  it('returns a typed redirect reason without calling the backend when no context cookie exists', async () => {
    readContextToken.mockResolvedValueOnce(null);

    await expect(getSelectedContextProfile(requestHeaders)).resolves.toEqual({
      kind: 'redirect-to-context-selection',
      reason: 'missing-context-token',
    });
    expect(backendApi.get).not.toHaveBeenCalled();
  });

  it('does not resolve a shell context when the profile has no selected branch', async () => {
    readContextToken.mockResolvedValueOnce('signed-context-token');
    backendApi.get.mockResolvedValueOnce({ ...profile, selected_branch: null });

    await expect(getSelectedContextProfile(requestHeaders)).resolves.toEqual({
      kind: 'redirect-to-context-selection',
      reason: 'profile-has-no-selected-branch',
    });
  });

  it('does not expose backend failures through the selected-context result', async () => {
    readContextToken.mockResolvedValueOnce('signed-context-token');
    backendApi.get.mockRejectedValueOnce(new Error('backend detail: sensitive context token'));

    await expect(getSelectedContextProfile(requestHeaders)).resolves.toEqual({
      kind: 'redirect-to-context-selection',
      reason: 'profile-request-failed',
    });
  });
});
