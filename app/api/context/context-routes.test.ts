import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  clearContextToken,
  discoverBranches,
  discoverOrganisations,
  headersMock,
  requireAuthenticatedUser,
  parseDiscoveryPageQuery,
  selectBranch,
  selectOrganisation,
  setContextToken,
} = vi.hoisted(() => ({
  clearContextToken: vi.fn(),
  discoverBranches: vi.fn(),
  discoverOrganisations: vi.fn(),
  headersMock: vi.fn(),
  parseDiscoveryPageQuery: vi.fn((value: string | string[] | null | undefined) => {
    const firstValue = Array.isArray(value) ? value[0] : value;
    if (firstValue === null || firstValue === undefined || firstValue === '') {
      return 0;
    }
    return /^\d+$/.test(firstValue) ? Number.parseInt(firstValue, 10) : null;
  }),
  requireAuthenticatedUser: vi.fn(),
  selectBranch: vi.fn(),
  selectOrganisation: vi.fn(),
  setContextToken: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: headersMock }));
vi.mock('@/auth/context-cookie', () => ({ clearContextToken, setContextToken }));
vi.mock('@/auth/require-authenticated-user', () => ({
  requireAuthenticatedUser,
  UnauthenticatedContextRequestError: class UnauthenticatedContextRequestError extends Error {},
}));
vi.mock('@/auth/context-service', () => ({
  ContextTokenMissingError: class ContextTokenMissingError extends Error {},
  discoverBranches,
  discoverOrganisations,
  parseDiscoveryPageQuery,
  selectBranch,
  selectOrganisation,
}));

const { GET: getBranches } = await import('./branches/route');
const { POST: postBranch } = await import('./branch/route');
const { POST: postOrganisation } = await import('./organisation/route');
const { GET: getOrganisations } = await import('./organisations/route');

const requestHeaders = new Headers({ cookie: 'finaxis.session_token=session-value' });
const organisationId = '9b4c0317-9d61-41d7-a68d-5713ad5b3db2';
const branchId = 'd0e5649c-88fd-4601-8696-0c733987a51c';

function organisationDiscoveryRequest(query = ''): Request {
  return new Request(`http://localhost/api/context/organisations${query}`);
}

function branchDiscoveryRequest(query = ''): Request {
  return new Request(`http://localhost/api/context/branches${query}`);
}

describe('context routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(requestHeaders);
    requireAuthenticatedUser.mockResolvedValue({});
  });

  it.each([
    [
      'organisation discovery',
      () => getOrganisations(organisationDiscoveryRequest()),
      discoverOrganisations,
    ],
    [
      'organisation selection',
      () =>
        postOrganisation(
          new Request('http://localhost/api/context/organisation', {
            body: JSON.stringify({ organisation_id: organisationId }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          }),
        ),
      selectOrganisation,
    ],
    ['branch discovery', () => getBranches(branchDiscoveryRequest()), discoverBranches],
    [
      'branch selection',
      () =>
        postBranch(
          new Request('http://localhost/api/context/branch', {
            body: JSON.stringify({ branch_id: branchId }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          }),
        ),
      selectBranch,
    ],
  ])(
    'returns a safe 401 before %s invokes its context service',
    async (_route, invoke, service) => {
      requireAuthenticatedUser.mockRejectedValueOnce(
        new (
          await import('@/auth/require-authenticated-user')
        ).UnauthenticatedContextRequestError(),
      );

      const response = await invoke();

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        message: 'Your session has expired. Please sign in again.',
      });
      expect(requireAuthenticatedUser).toHaveBeenCalledWith(requestHeaders);
      expect(service).not.toHaveBeenCalled();
    },
  );

  it('discovers a bounded page of organisations with request headers', async () => {
    discoverOrganisations.mockResolvedValueOnce({
      context_token: 'injected-discovery-token',
      items: [
        {
          display_name: 'Finaxis Holdings',
          membership_id: '6c2be1af-2e56-47b6-a9ba-26ef2cdbf73e',
          membership_status: 'ACTIVE',
          organisation_id: organisationId,
          organisation_status: 'ACTIVE',
          tenant_code: 'FINAXIS',
          unknown_field: 'must-not-reach-browser',
        },
      ],
      page: {
        has_next: false,
        has_previous: false,
        number: 0,
        size: 25,
        total_items: 1,
        total_pages: 1,
        unknown_field: 'must-not-reach-browser',
      },
      unknown_field: 'must-not-reach-browser',
    });

    const response = await getOrganisations(organisationDiscoveryRequest('?page=2'));

    expect(discoverOrganisations).toHaveBeenCalledWith(requestHeaders, 2);
    await expect(response.json()).resolves.toEqual({
      items: [
        {
          displayName: 'Finaxis Holdings',
          membershipId: '6c2be1af-2e56-47b6-a9ba-26ef2cdbf73e',
          membershipStatus: 'ACTIVE',
          organisationId,
          organisationStatus: 'ACTIVE',
          tenantCode: 'FINAXIS',
        },
      ],
      page: {
        hasNext: false,
        hasPrevious: false,
        number: 0,
        size: 25,
        totalItems: 1,
        totalPages: 1,
      },
    });
  });

  it('maps paginated branch discovery to the browser DTO and omits backend-only fields', async () => {
    discoverBranches.mockResolvedValueOnce({
      context_token: 'injected-discovery-token',
      items: [
        {
          branch_code: 'HQ',
          branch_id: branchId,
          branch_name: 'Headquarters',
          branch_status: 'ACTIVE',
          unknown_field: 'must-not-reach-browser',
        },
      ],
      page: {
        has_next: false,
        has_previous: false,
        number: 0,
        size: 25,
        total_items: 1,
        total_pages: 1,
      },
      unknown_field: 'must-not-reach-browser',
    });

    const response = await getBranches(branchDiscoveryRequest('?page=3'));

    expect(discoverBranches).toHaveBeenCalledWith(requestHeaders, 3);

    await expect(response.json()).resolves.toEqual({
      items: [
        {
          branchCode: 'HQ',
          branchId,
          branchName: 'Headquarters',
          branchStatus: 'ACTIVE',
        },
      ],
      page: {
        hasNext: false,
        hasPrevious: false,
        number: 0,
        size: 25,
        totalItems: 1,
        totalPages: 1,
      },
    });
  });

  it.each([
    [
      'organisation discovery',
      () => getOrganisations(organisationDiscoveryRequest('?page=-1')),
      discoverOrganisations,
    ],
    [
      'branch discovery',
      () => getBranches(branchDiscoveryRequest('?page=not-a-page')),
      discoverBranches,
    ],
  ])(
    'rejects malformed page queries before %s calls the service',
    async (_route, invoke, service) => {
      const response = await invoke();

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        message: 'A valid non-negative page is required.',
      });
      expect(service).not.toHaveBeenCalled();
    },
  );

  it('requires an existing context token for branch discovery without exposing it', async () => {
    discoverBranches.mockRejectedValueOnce(
      new (await import('@/auth/context-service')).ContextTokenMissingError(),
    );

    const response = await getBranches(branchDiscoveryRequest());

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toEqual({
      message: 'Your saved context is no longer valid. Select an organisation again.',
    });
    expect(JSON.stringify(body)).not.toContain('context_token');
    expect(clearContextToken).toHaveBeenCalledOnce();
  });

  it('rejects missing and malformed organisation identifiers', async () => {
    const missing = await postOrganisation(
      new Request('http://localhost/api/context/organisation', { method: 'POST' }),
    );
    const malformed = await postOrganisation(
      new Request('http://localhost/api/context/organisation', {
        body: JSON.stringify({ organisation_id: 'not-a-uuid' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    );

    expect(missing.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(selectOrganisation).not.toHaveBeenCalled();
  });

  it('selects an organisation, stores its token, and never returns that token', async () => {
    selectOrganisation.mockResolvedValueOnce({
      assigned_branch_ids: [branchId],
      branch_id: branchId,
      context_header: 'X-Active-Organisation-Context',
      context_token: 'signed-organisation-context',
      membership_id: '6c2be1af-2e56-47b6-a9ba-26ef2cdbf73e',
      organisation_id: organisationId,
      requires_branch_selection: false,
      unknown_field: 'must-not-reach-browser',
    });

    const response = await postOrganisation(
      new Request('http://localhost/api/context/organisation', {
        body: JSON.stringify({ organisation_id: organisationId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    );

    expect(selectOrganisation).toHaveBeenCalledWith(requestHeaders, organisationId);
    expect(setContextToken).toHaveBeenCalledWith('signed-organisation-context');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      assignedBranchIds: [branchId],
      branchId,
      membershipId: '6c2be1af-2e56-47b6-a9ba-26ef2cdbf73e',
      organisationId,
      requiresBranchSelection: false,
    });
  });

  it('maps selection authorization failures to safe messages', async () => {
    selectOrganisation.mockRejectedValueOnce({ status: 403 });

    const response = await postOrganisation(
      new Request('http://localhost/api/context/organisation', {
        body: JSON.stringify({ organisation_id: organisationId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'You do not have access to this context.',
    });
  });

  it('maps expired sessions during selection to a safe 401 message', async () => {
    selectOrganisation.mockRejectedValueOnce({ status: 401 });

    const response = await postOrganisation(
      new Request('http://localhost/api/context/organisation', {
        body: JSON.stringify({ organisation_id: organisationId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: 'Your session has expired. Please sign in again.',
    });
  });

  it('rejects missing and malformed branch identifiers before invoking the service', async () => {
    const missing = await postBranch(
      new Request('http://localhost/api/context/branch', { method: 'POST' }),
    );
    const malformed = await postBranch(
      new Request('http://localhost/api/context/branch', {
        body: JSON.stringify({ branch_id: 'not-a-uuid' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    );

    expect(missing.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(selectBranch).not.toHaveBeenCalled();
  });

  it('selects a branch, replaces the context cookie, and excludes its token from JSON', async () => {
    selectBranch.mockResolvedValueOnce({
      branch_id: branchId,
      context_header: 'X-Active-Organisation-Context',
      context_token: 'signed-branch-context',
      membership_id: '6c2be1af-2e56-47b6-a9ba-26ef2cdbf73e',
      organisation_id: organisationId,
      unknown_field: 'must-not-reach-browser',
    });

    const response = await postBranch(
      new Request('http://localhost/api/context/branch', {
        body: JSON.stringify({ branch_id: branchId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    );

    expect(selectBranch).toHaveBeenCalledWith(requestHeaders, branchId);
    expect(setContextToken).toHaveBeenCalledWith('signed-branch-context');
    await expect(response.json()).resolves.toEqual({
      branchId,
      membershipId: '6c2be1af-2e56-47b6-a9ba-26ef2cdbf73e',
      organisationId,
    });
  });

  it('clears stale branch context after a backend authorization rejection', async () => {
    selectBranch.mockRejectedValueOnce({ status: 403 });

    const response = await postBranch(
      new Request('http://localhost/api/context/branch', {
        body: JSON.stringify({ branch_id: branchId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'You do not have access to this context.',
    });
    expect(clearContextToken).toHaveBeenCalledOnce();
  });
});
