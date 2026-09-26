import { useState } from 'react';
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

function renderDialog(
  onClose = vi.fn(),
  branch: { id: string; name: string } | null = { id: 'b-1', name: 'Head Office' },
) {
  renderWithProviders(
    <ApplicationContextProvider
      value={{
        module: { id: 'administration', name: 'Administration' },
        organization: { id: 'org-1', name: 'Umoja SACCO' },
        branch,
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
    const branchCombobox = await screen.findByRole('combobox', { name: 'Branch' });
    expect(branchCombobox).toHaveFocus();
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

  it('lands at All branches when closed while the organisation POST is still in flight', async () => {
    const user = userEvent.setup();
    let resolveSelect!: (response: Response) => void;
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [ORG], page: PAGE }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSelect = resolve;
          }),
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

    const onClose = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <ApplicationContextProvider
          value={{
            module: { id: 'administration', name: 'Administration' },
            organization: { id: 'org-1', name: 'Umoja SACCO' },
            branch: { id: 'b-1', name: 'Head Office' },
          }}
        >
          <ContextSwitcherDialog
            open={open}
            onClose={() => {
              onClose();
              setOpen(false);
            }}
            platformOrganisationId="platform"
          />
        </ApplicationContextProvider>
      );
    }
    renderWithProviders(<Harness />);

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Imara SACCO/ }));
    await screen.findByText(/saving organisation/i);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();

    resolveSelect(
      new Response(
        JSON.stringify({
          branchId: null,
          requiresBranchSelection: true,
          assignedBranchIds: ['b-1', 'b-2'],
        }),
        { status: 200 },
      ),
    );

    await vi.waitFor(() => {
      expect(router.refresh).toHaveBeenCalled();
    });
    expect(router.push).toHaveBeenCalledWith('/admin');
    expect(await screen.findByText(/Imara SACCO · All branches/)).toBeInTheDocument();
  });

  it('sends the platform organisation to its own workspace', async () => {
    const user = userEvent.setup();
    const PLATFORM_ORG = { ...ORG, organisationId: 'platform', displayName: 'Platform' };
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [PLATFORM_ORG], page: PAGE }))
      .mockImplementationOnce(() =>
        json({ branchId: 'b-p', requiresBranchSelection: false, assignedBranchIds: ['b-p'] }),
      );
    renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Platform/ }));

    await vi.waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/platform-admin');
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  const CURRENT_ORG = { ...ORG, organisationId: 'org-1', displayName: 'Umoja SACCO' };
  const BRANCHES_PAGE = {
    items: [
      { branchId: 'b-1', branchCode: 'HQ', branchName: 'Head Office', branchStatus: 'ACTIVE' },
      { branchId: 'b-2', branchCode: 'WST', branchName: 'Westlands', branchStatus: 'ACTIVE' },
    ],
    page: { ...PAGE, totalItems: 2 },
  };

  const CHOOSE_BRANCH = {
    branchId: null,
    requiresBranchSelection: true,
    assignedBranchIds: ['b-1', 'b-2'],
  };

  // The context cookie is shared across tabs (and a previous switch's refresh may still be in
  // flight), so the ambient `current` context is never trusted as the server's: re-picking the
  // current organisation always re-POSTs select-organisation, which resets the cookie to it.
  it('re-POSTs select-organisation when the current organisation is re-picked, then refreshes without pushing on a branch pick', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [CURRENT_ORG], page: PAGE }))
      .mockImplementationOnce(() => json(CHOOSE_BRANCH))
      .mockImplementationOnce(() => json(BRANCHES_PAGE))
      .mockImplementationOnce(() => json({}));
    renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Umoja SACCO/ }));
    await user.click(await screen.findByRole('combobox', { name: 'Branch' }));
    await user.click(screen.getByRole('option', { name: /Westlands/ }));

    await vi.waitFor(() => {
      expect(router.refresh).toHaveBeenCalled();
    });
    expect(router.push).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/context/organisation',
      expect.objectContaining({ body: JSON.stringify({ organisation_id: 'org-1' }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/context/branches?page=0');
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/context/branch',
      expect.objectContaining({ body: JSON.stringify({ branch_id: 'b-2' }) }),
    );
  });

  it('finishes at All branches with a refresh but no push when Close is clicked after re-picking the current organisation', async () => {
    // The re-POST already unpinned Head Office server-side, so Close is not a cancel.
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [CURRENT_ORG], page: PAGE }))
      .mockImplementationOnce(() => json(CHOOSE_BRANCH))
      .mockImplementationOnce(() => json(BRANCHES_PAGE));
    const onClose = renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Umoja SACCO/ }));
    await screen.findByRole('combobox', { name: 'Branch' });
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).toHaveBeenCalled();
    expect(await screen.findByText('Switched to Umoja SACCO · All branches')).toBeInTheDocument();
  });

  it('cancels with no push, refresh or toast on a plain Close with nothing chosen', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => json({ items: [ORG], page: PAGE }));
    const onClose = renderDialog();

    await screen.findByRole('combobox', { name: 'Organisation' });
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(screen.queryByText(/Switched to/)).not.toBeInTheDocument();
  });

  it('switches the current organisation to All branches with no second POST once its re-POST succeeded', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [CURRENT_ORG], page: PAGE }))
      .mockImplementationOnce(() => json(CHOOSE_BRANCH))
      .mockImplementationOnce(() => json(BRANCHES_PAGE));
    renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Umoja SACCO/ }));
    await user.click(await screen.findByRole('combobox', { name: 'Branch' }));
    await user.click(screen.getByRole('option', { name: /All branches/ }));

    await vi.waitFor(() => {
      expect(router.refresh).toHaveBeenCalled();
    });
    expect(router.push).not.toHaveBeenCalled();
    expect(await screen.findByText('Switched to Umoja SACCO · All branches')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('resets the cookie and refreshes, with no toast or push, when All branches is re-picked for an institution-level current organisation', async () => {
    // Another tab may have moved the shared cookie to a different organisation: the re-POST puts it
    // back, and the refresh re-renders the shell from the server rather than trusting `current`.
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [CURRENT_ORG], page: PAGE }))
      .mockImplementationOnce(() => json(CHOOSE_BRANCH))
      .mockImplementationOnce(() => json(BRANCHES_PAGE));
    const onClose = renderDialog(vi.fn(), null);

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Umoja SACCO/ }));
    await user.click(await screen.findByRole('combobox', { name: 'Branch' }));
    await user.click(screen.getByRole('option', { name: /All branches/ }));

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/context/organisation',
      expect.objectContaining({ body: JSON.stringify({ organisation_id: 'org-1' }) }),
    );
    expect(onClose).toHaveBeenCalled();
    expect(router.refresh).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.queryByText(/Switched to/)).not.toBeInTheDocument();
  });

  it.each([
    ['5xxs', () => Promise.resolve(new Response('{}', { status: 500 }))],
    ['403s', () => Promise.resolve(new Response('{}', { status: 403 }))],
    ['fails with a network error', () => Promise.reject(new Error('network error'))],
  ])(
    'shows a retryable state with no false success when the current organisation re-POST %s',
    async (_label, failure) => {
      const user = userEvent.setup();
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementationOnce(() => json({ items: [CURRENT_ORG], page: PAGE }))
        .mockImplementationOnce(failure)
        .mockImplementationOnce(() => json(CHOOSE_BRANCH))
        .mockImplementationOnce(() => json(BRANCHES_PAGE));
      renderDialog();

      await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
      await user.click(screen.getByRole('option', { name: /Umoja SACCO/ }));

      await screen.findByText(/couldn't update your context/i);
      expect(router.push).not.toHaveBeenCalled();
      expect(router.refresh).not.toHaveBeenCalled();
      expect(screen.queryByText(/Switched to/)).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: 'Branch' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('combobox', { name: 'Organisation' }));
      await user.click(screen.getByRole('option', { name: /Umoja SACCO/ }));
      await user.click(await screen.findByRole('combobox', { name: 'Branch' }));
      await user.click(screen.getByRole('option', { name: /All branches/ }));

      // The full organisation name must reach the toast — onComplete never fires with an empty id.
      expect(await screen.findByText('Switched to Umoja SACCO · All branches')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(4);
    },
  );

  it('sends the user to login when the organisations list fails with a session-expired 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() =>
      Promise.resolve(new Response('{}', { status: 401 })),
    );
    renderDialog();

    await vi.waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/login?reason=session_expired');
    });
  });

  it('sends the user to login when the organisation POST fails with a session-expired 401', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [ORG], page: PAGE }))
      .mockImplementationOnce(() => Promise.resolve(new Response('{}', { status: 401 })));
    renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Imara SACCO/ }));

    await vi.waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/login?reason=session_expired');
    });
  });

  it('closes with a refresh but no toast or push when the branch list 403s for a different, already-committed organisation', async () => {
    // Unlike the fast-path case above, picking a *different* organisation (org-2) commits it via a
    // real select-organisation POST first (`committed` gets set) — the bug this covers is that a
    // later 403 must still clear that stale commit, not let Close finish at the committed org.
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [ORG], page: PAGE }))
      .mockImplementationOnce(() =>
        json({ branchId: null, requiresBranchSelection: true, assignedBranchIds: ['b-1', 'b-2'] }),
      )
      .mockImplementationOnce(() => Promise.resolve(new Response('{}', { status: 403 })));
    const onClose = renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Imara SACCO/ }));
    await screen.findByText(/do not have access/i);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.queryByText(/Switched to/)).not.toBeInTheDocument();
  });

  it('lets the organisations list be retried after a server error', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => Promise.resolve(new Response('{}', { status: 502 })))
      .mockImplementationOnce(() => json({ items: [ORG], page: PAGE }));
    renderDialog();

    await screen.findByText(/couldn't load organisations/i);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('combobox', { name: 'Organisation' })).toBeInTheDocument();
  });
});
