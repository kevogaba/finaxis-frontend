import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ApplicationContextProvider } from './organization-context';
import { ContextSwitcherDialog } from './context-switcher-dialog';

// A stable router object: the real Next router is memoized, and the dialog's load effect
// depends on `[open, router]`, so a fresh object per render would refetch and consume the next
// fetch mock as an organisation page.
const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, useRouter: () => router };
});

const PAGE = {
  number: 0,
  size: 25,
  totalItems: 1,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
};
const ORG = {
  organisationId: 'org-2',
  membershipId: 'm-2',
  tenantCode: 'imara',
  displayName: 'Imara SACCO',
  organisationStatus: 'ACTIVE',
  membershipStatus: 'ACTIVE',
};

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function renderDialog(onClose = vi.fn()) {
  renderWithProviders(
    <ApplicationContextProvider
      value={{
        module: { id: 'administration', name: 'Administration' },
        organization: { id: 'org-1', name: 'Umoja SACCO' },
        branch: { id: 'b-1', name: 'Head Office' },
      }}
    >
      <ContextSwitcherDialog open onClose={onClose} platformOrganisationId="platform" />
    </ApplicationContextProvider>,
  );
  return onClose;
}

describe('ContextSwitcherDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    router.push.mockReset();
    router.refresh.mockReset();
    router.replace.mockReset();
  });

  it('switches to a single-branch organisation and goes to its workspace', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [ORG], page: PAGE }))
      .mockImplementationOnce(() =>
        json({ branchId: 'b-9', requiresBranchSelection: false, assignedBranchIds: ['b-9'] }),
      );
    const onClose = renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Imara SACCO/ }));

    await vi.waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/admin');
    });
    expect(onClose).toHaveBeenCalled();
    // A push to a route the user may already be on (e.g. staying in tenant administration while
    // switching organisation) is a same-URL no-op for the Next router; only `refresh()` forces the
    // shared authenticated layout to re-read the new context cookie.
    expect(router.refresh).toHaveBeenCalled();
  });

  it('lands at All branches when closed after the organisation was committed', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [ORG], page: PAGE }))
      .mockImplementationOnce(() =>
        json({ branchId: null, requiresBranchSelection: true, assignedBranchIds: ['b-1', 'b-2'] }),
      )
      .mockImplementationOnce(() =>
        json({
          items: [
            {
              branchId: 'b-1',
              branchCode: 'HQ',
              branchName: 'Head Office',
              branchStatus: 'ACTIVE',
            },
            { branchId: 'b-2', branchCode: 'WST', branchName: 'Westlands', branchStatus: 'ACTIVE' },
          ],
          page: { ...PAGE, totalItems: 2 },
        }),
      );
    const onClose = renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Imara SACCO/ }));
    await screen.findByRole('combobox', { name: 'Branch' });
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/admin');
    expect(router.refresh).toHaveBeenCalled();
    expect(await screen.findByText(/Imara SACCO · All branches/)).toBeInTheDocument();
  });

  it('finishes at the committed organisation when a failed auto-pin leaves the branch step incomplete', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [ORG], page: PAGE }))
      .mockImplementationOnce(() =>
        json({ branchId: null, requiresBranchSelection: true, assignedBranchIds: ['b-1'] }),
      )
      .mockImplementationOnce(() => Promise.resolve(new Response('{}', { status: 500 })));
    const onClose = renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Imara SACCO/ }));

    // The auto-pin POST failed, which clears the Organisation select back to blank — but the
    // organisation token is already issued (onOrganisationCommitted already fired), so closing
    // now must still finish at that organisation, not a stale one.
    await screen.findByText(/couldn't update your context/i);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/admin');
    expect(router.refresh).toHaveBeenCalled();
    expect(await screen.findByText(/Imara SACCO · All branches/)).toBeInTheDocument();
  });
});
