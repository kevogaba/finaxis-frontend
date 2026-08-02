import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { BrowserBranch, BrowserOrganisation, BrowserPage } from '@/auth/context-browser-dto';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

const { ContextSelectionPage } = await import('./context-selection-page');

const organisation: BrowserOrganisation = {
  displayName: 'Finaxis Holdings',
  membershipId: '6c2be1af-2e56-47b6-a9ba-26ef2cdbf73e',
  membershipStatus: 'ACTIVE',
  organisationId: '9b4c0317-9d61-41d7-a68d-5713ad5b3db2',
  organisationStatus: 'ACTIVE',
  tenantCode: 'FINAXIS',
};

const branch: BrowserBranch = {
  branchCode: 'HQ',
  branchId: 'd0e5649c-88fd-4601-8696-0c733987a51c',
  branchName: 'Headquarters',
  branchStatus: 'ACTIVE',
};

const secondBranch: BrowserBranch = {
  branchCode: 'CBD',
  branchId: 'a1f67f2c-ed99-4544-98f5-7a4c0ebec64e',
  branchName: 'CBD Branch',
  branchStatus: 'ACTIVE',
};

const secondOrganisation: BrowserOrganisation = {
  displayName: 'Acme SACCO',
  membershipId: 'b6b4fc5d-152d-4a34-8c93-ce1a6d6a3a20',
  membershipStatus: 'ACTIVE',
  organisationId: 'de344a05-97ed-4b63-b28b-5f07d1ddf555',
  organisationStatus: 'ACTIVE',
  tenantCode: 'ACME',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function browserPage<T>(
  items: readonly T[],
  page: Partial<BrowserPage<T>['page']> = {},
): BrowserPage<T> {
  return {
    items,
    page: {
      hasNext: page.hasNext ?? false,
      hasPrevious: page.hasPrevious ?? false,
      number: page.number ?? 0,
      size: page.size ?? 25,
      totalItems: page.totalItems ?? items.length,
      totalPages: page.totalPages ?? 1,
    },
  };
}

function organisationPage(
  items: readonly BrowserOrganisation[],
  page: Partial<BrowserPage<BrowserOrganisation>['page']> = {},
): BrowserPage<BrowserOrganisation> {
  return browserPage(items, page);
}

function branchPage(
  items: readonly BrowserBranch[],
  page: Partial<BrowserPage<BrowserBranch>['page']> = {},
): BrowserPage<BrowserBranch> {
  return browserPage(items, page);
}

async function chooseOrganisation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('combobox', { name: /organisation/i }));
  await user.click(screen.getByRole('option', { name: /finaxis holdings/i }));
}

async function chooseBranch(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('combobox', { name: /branch/i }));
  await user.click(screen.getByRole('option', { name: /headquarters/i }));
}

describe('ContextSelectionPage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('renders one labelled organisation control and an actionable empty state', () => {
    renderWithProviders(<ContextSelectionPage organisations={organisationPage([])} />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole('combobox', { name: /organisation/i })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/no organisations are available/i);
  });

  it('shows safe retryable organisation load errors without also showing the empty state', () => {
    renderWithProviders(
      <ContextSelectionPage hasOrganisationLoadError organisations={organisationPage([])} />,
    );

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t load organisations/i);
    expect(screen.queryByText(/no organisations are available/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /organisation/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeEnabled();
  });

  it('loads the next organisation page through the discovery route', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        organisationPage([secondOrganisation], {
          hasNext: false,
          hasPrevious: true,
          number: 1,
          totalItems: 2,
          totalPages: 2,
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <ContextSelectionPage
        organisations={organisationPage([organisation], {
          hasNext: true,
          hasPrevious: false,
          number: 0,
          totalItems: 2,
          totalPages: 2,
        })}
      />,
    );

    const organisationPages = screen.getByRole('navigation', { name: /organisation pages/i });
    await user.click(within(organisationPages).getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/context/organisations?page=1');
    });
    expect(await screen.findByText(/page 2 of 2/i)).toBeInTheDocument();
  });

  it('shows safe retryable error copy when organisation selection fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'member details: secret' }, 403));
    const user = userEvent.setup();
    renderWithProviders(<ContextSelectionPage organisations={organisationPage([organisation])} />);

    await chooseOrganisation(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn.t update your context\. please try again\./i,
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('member details: secret');
    expect(screen.getByRole('combobox', { name: /organisation/i })).toBeEnabled();
  });

  it('disables the organisation control while its selection request is pending', async () => {
    let resolveSelection: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveSelection = resolve;
        }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ContextSelectionPage organisations={organisationPage([organisation])} />);

    await chooseOrganisation(user);

    expect(screen.getByRole('combobox', { name: /organisation/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('status')).toHaveTextContent(/saving organisation/i);
    resolveSelection(
      jsonResponse({
        assignedBranchIds: [branch.branchId],
        branchId: branch.branchId,
        membershipId: organisation.membershipId,
        organisationId: organisation.organisationId,
        requiresBranchSelection: false,
      }),
    );
  });

  it('completes immediately when the organisation response includes an auto-selected branch', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        assignedBranchIds: [branch.branchId],
        branchId: branch.branchId,
        membershipId: organisation.membershipId,
        organisationId: organisation.organisationId,
        requiresBranchSelection: false,
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ContextSelectionPage organisations={organisationPage([organisation])} />);

    await chooseOrganisation(user);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/profile');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/context/organisation');
  });

  it('navigates auto-selected branches to a fixed internal destination when provided', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        assignedBranchIds: [branch.branchId],
        branchId: branch.branchId,
        membershipId: organisation.membershipId,
        organisationId: organisation.organisationId,
        requiresBranchSelection: false,
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <ContextSelectionPage
        destination="/admin"
        organisations={organisationPage([organisation])}
      />,
    );

    await chooseOrganisation(user);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/admin');
    });
  });

  it('shows a branch loading state after an organisation requires branch selection', async () => {
    let resolveBranches: (response: Response) => void = () => undefined;
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          assignedBranchIds: [branch.branchId],
          branchId: null,
          membershipId: organisation.membershipId,
          organisationId: organisation.organisationId,
          requiresBranchSelection: true,
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveBranches = resolve;
          }),
      );
    const user = userEvent.setup();
    renderWithProviders(<ContextSelectionPage organisations={organisationPage([organisation])} />);

    await chooseOrganisation(user);

    expect(await screen.findByRole('status')).toHaveTextContent(/loading branches/i);
    expect(screen.getByRole('combobox', { name: /organisation/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    resolveBranches(jsonResponse(branchPage([branch])));
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /branch/i })).toBeEnabled();
    });
  });

  it('loads branches after organisation selection and completes an explicit branch selection', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          assignedBranchIds: [branch.branchId],
          branchId: null,
          membershipId: organisation.membershipId,
          organisationId: organisation.organisationId,
          requiresBranchSelection: true,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(branchPage([branch])))
      .mockResolvedValueOnce(
        jsonResponse({
          branchId: branch.branchId,
          membershipId: organisation.membershipId,
          organisationId: organisation.organisationId,
        }),
      );
    const user = userEvent.setup();
    renderWithProviders(<ContextSelectionPage organisations={organisationPage([organisation])} />);

    await chooseOrganisation(user);
    await chooseBranch(user);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/profile');
    });
    const fetchUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(fetchUrls).toEqual([
      '/api/context/organisation',
      '/api/context/branches?page=0',
      '/api/context/branch',
    ]);
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      body: JSON.stringify({ branch_id: branch.branchId }),
      method: 'POST',
    });
  });

  it('loads the next branch page without exposing the selected organisation in the query', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          assignedBranchIds: [branch.branchId, secondBranch.branchId],
          branchId: null,
          membershipId: organisation.membershipId,
          organisationId: organisation.organisationId,
          requiresBranchSelection: true,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          branchPage([branch], {
            hasNext: true,
            hasPrevious: false,
            number: 0,
            totalItems: 2,
            totalPages: 2,
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          branchPage([secondBranch], {
            hasNext: false,
            hasPrevious: true,
            number: 1,
            totalItems: 2,
            totalPages: 2,
          }),
        ),
      );
    const user = userEvent.setup();
    renderWithProviders(<ContextSelectionPage organisations={organisationPage([organisation])} />);

    await chooseOrganisation(user);
    const branchPages = await screen.findByRole('navigation', { name: /branch pages/i });
    await user.click(within(branchPages).getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith('/api/context/branches?page=1');
    });
    expect(String(fetchMock.mock.calls[2]?.[0])).not.toContain(organisation.organisationId);
    expect(await screen.findByText(/page 2 of 2/i)).toBeInTheDocument();
  });

  it('shows safe error copy when explicit branch selection fails', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          assignedBranchIds: [branch.branchId],
          branchId: null,
          membershipId: organisation.membershipId,
          organisationId: organisation.organisationId,
          requiresBranchSelection: true,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(branchPage([branch])))
      .mockResolvedValueOnce(jsonResponse({ message: 'context token leaked detail' }, 403));
    const user = userEvent.setup();
    renderWithProviders(<ContextSelectionPage organisations={organisationPage([organisation])} />);

    await chooseOrganisation(user);
    await chooseBranch(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn.t update your context\. please try again\./i,
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(/context token leaked detail/i);
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows a safe branch-discovery error and retries without exposing response details', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          assignedBranchIds: [branch.branchId],
          branchId: null,
          membershipId: organisation.membershipId,
          organisationId: organisation.organisationId,
          requiresBranchSelection: true,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ message: 'backend token: secret' }, 502))
      .mockResolvedValueOnce(jsonResponse(branchPage([branch])));
    const user = userEvent.setup();
    renderWithProviders(<ContextSelectionPage organisations={organisationPage([organisation])} />);

    await chooseOrganisation(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load branches/i);
    expect(screen.getByRole('alert')).not.toHaveTextContent('backend token: secret');
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByRole('combobox', { name: /branch/i })).toBeEnabled();
  });

  it('shows an actionable empty branch state after an organisation requires branch selection', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          assignedBranchIds: [],
          branchId: null,
          membershipId: organisation.membershipId,
          organisationId: organisation.organisationId,
          requiresBranchSelection: true,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(branchPage([])));
    const user = userEvent.setup();
    renderWithProviders(<ContextSelectionPage organisations={organisationPage([organisation])} />);

    await chooseOrganisation(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/no branches are available/i);
  });

  it('disables both controls while an explicit branch selection is pending', async () => {
    let resolveBranch: (response: Response) => void = () => undefined;
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          assignedBranchIds: [branch.branchId],
          branchId: null,
          membershipId: organisation.membershipId,
          organisationId: organisation.organisationId,
          requiresBranchSelection: true,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(branchPage([branch])))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveBranch = resolve;
          }),
      );
    const user = userEvent.setup();
    renderWithProviders(<ContextSelectionPage organisations={organisationPage([organisation])} />);

    await chooseOrganisation(user);
    await chooseBranch(user);

    expect(screen.getByRole('combobox', { name: /organisation/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('combobox', { name: /branch/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('status')).toHaveTextContent(/saving branch/i);
    resolveBranch(
      jsonResponse({
        branchId: branch.branchId,
        membershipId: organisation.membershipId,
        organisationId: organisation.organisationId,
      }),
    );
  });
});
