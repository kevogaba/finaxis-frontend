import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ApplicationContextProvider } from '@/components/shell/organization-context';
import { ALL_BRANCHES_UNAVAILABLE } from './all-branches-copy';
import { SwitchToAllBranchesButton } from './switch-to-all-branches-button';

const { router, selectOrganisationRequest, selectBranchRequest, EXPIRED } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  selectOrganisationRequest: vi.fn(),
  selectBranchRequest: vi.fn(),
  EXPIRED: new Error('session expired'),
}));
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, useRouter: () => router };
});
vi.mock('./context-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./context-api')>();
  return {
    ...actual,
    selectOrganisationRequest: (...args: unknown[]) =>
      selectOrganisationRequest(...args) as unknown,
    selectBranchRequest: (...args: unknown[]) => selectBranchRequest(...args) as unknown,
    isSessionExpired: (error: unknown) => error === EXPIRED,
  };
});

function renderButton() {
  renderWithProviders(
    <ApplicationContextProvider
      value={{
        module: { id: 'administration', name: 'Administration' },
        organization: { id: 'org-1', name: 'Greenfield SACCO' },
        branch: { id: 'b-1', name: 'Head Office' },
      }}
    >
      <SwitchToAllBranchesButton />
    </ApplicationContextProvider>,
  );
  return screen.getByRole('button', { name: 'Switch to All branches' });
}

describe('SwitchToAllBranchesButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-selects the organisation at institution level for a multi-branch user', async () => {
    const user = userEvent.setup();
    selectOrganisationRequest.mockResolvedValueOnce({
      branchId: null,
      requiresBranchSelection: true,
      assignedBranchIds: ['b-1', 'b-2'],
    });

    await user.click(renderButton());

    expect(selectOrganisationRequest).toHaveBeenCalledWith('org-1');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Switched to Greenfield SACCO · All branches',
    );
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(selectBranchRequest).not.toHaveBeenCalled();
  });

  it('says All branches is unavailable when the backend pins the only branch', async () => {
    const user = userEvent.setup();
    selectOrganisationRequest.mockResolvedValueOnce({
      branchId: 'b-1',
      requiresBranchSelection: false,
      assignedBranchIds: ['b-1'],
    });

    await user.click(renderButton());

    const unavailable = await screen.findByRole('alert');
    expect(unavailable).toHaveTextContent(ALL_BRANCHES_UNAVAILABLE);
    // Informational, not a failure.
    expect(unavailable).toHaveClass('MuiAlert-colorInfo');
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('pins a single branch listed twice again, as context selection does', async () => {
    const user = userEvent.setup();
    selectOrganisationRequest.mockResolvedValueOnce({
      branchId: null,
      requiresBranchSelection: true,
      assignedBranchIds: ['b-1', 'b-1'],
    });
    selectBranchRequest.mockResolvedValueOnce(undefined);

    await user.click(renderButton());

    await waitFor(() => {
      expect(selectBranchRequest).toHaveBeenCalledWith('b-1');
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(ALL_BRANCHES_UNAVAILABLE);
  });

  it('still refreshes when the re-pin fails after the organisation POST moved the context', async () => {
    const user = userEvent.setup();
    selectOrganisationRequest.mockResolvedValueOnce({
      branchId: null,
      requiresBranchSelection: true,
      assignedBranchIds: ['b-1', 'b-1'],
    });
    selectBranchRequest.mockRejectedValueOnce(new Error('context lost'));

    await user.click(renderButton());

    const failure = await screen.findByRole('alert');
    expect(failure).toHaveTextContent("couldn't switch to All branches");
    expect(failure).toHaveClass('MuiAlert-colorError');
    // The header and page must re-read the context the server now holds.
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('sends an expired session to login and explains any other failure', async () => {
    const user = userEvent.setup();
    selectOrganisationRequest.mockRejectedValueOnce(EXPIRED);
    const button = renderButton();

    await user.click(button);
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/login?reason=session_expired');
    });

    selectOrganisationRequest.mockRejectedValueOnce(new Error('network'));
    await user.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't switch to All branches");
    // Neither POST succeeded, so the context never moved.
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
