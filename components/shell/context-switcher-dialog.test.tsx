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

  it('re-POSTs select-organisation for the ambient organisation once a different one has been committed in this dialog session', async () => {
    // Once org-2 is committed, the server token has moved off org-1 — re-picking org-1 (the
    // organisation this dialog opened with) must go through a real select-organisation POST again,
    // not the same-organisation fast path (which would list org-2's branches under an "org-1" label).
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() =>
        json({ items: [CURRENT_ORG, ORG], page: { ...PAGE, totalItems: 2 } }),
      )
      .mockImplementationOnce(() =>
        json({ branchId: null, requiresBranchSelection: true, assignedBranchIds: ['b-7', 'b-8'] }),
      )
      .mockImplementationOnce(() => json(BRANCHES_PAGE))
      .mockImplementationOnce(() =>
        json({ branchId: null, requiresBranchSelection: true, assignedBranchIds: ['b-1', 'b-2'] }),
      )
      .mockImplementationOnce(() => json(BRANCHES_PAGE));
    renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Imara SACCO/ }));
    await screen.findByRole('combobox', { name: 'Branch' });
    await user.click(screen.getByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Umoja SACCO/ }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        '/api/context/organisation',
        expect.objectContaining({ body: JSON.stringify({ organisation_id: 'org-1' }) }),
      );
    });
  });

  it('re-lists the current organisation branches without re-POSTing select-organisation, then refreshes without pushing on a same-organisation branch pick', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [CURRENT_ORG], page: PAGE }))
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
    // The re-pick only listed branches (GET) and pinned one (POST select-branch) — it never
    // re-POSTed select-organisation, since the ambient token already covers this organisation.
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/context/branches?page=0');
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/context/branch',
      expect.objectContaining({ body: JSON.stringify({ branch_id: 'b-2' }) }),
    );
  });

  it('cancels with no push, refresh or toast when Close is clicked after re-picking the current organisation', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [CURRENT_ORG], page: PAGE }))
      .mockImplementationOnce(() => json(BRANCHES_PAGE));
    const onClose = renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Umoja SACCO/ }));
    await screen.findByRole('combobox', { name: 'Branch' });
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(screen.queryByText(/Switched to/)).not.toBeInTheDocument();
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

  it('POSTs select-organisation to clear a pinned branch when All branches is chosen for the current organisation', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [CURRENT_ORG], page: PAGE }))
      .mockImplementationOnce(() => json(BRANCHES_PAGE))
      .mockImplementationOnce(() =>
        json({ branchId: null, requiresBranchSelection: true, assignedBranchIds: ['b-1', 'b-2'] }),
      );
    renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Umoja SACCO/ }));
    await user.click(await screen.findByRole('combobox', { name: 'Branch' }));
    await user.click(screen.getByRole('option', { name: /All branches/ }));

    await vi.waitFor(() => {
      expect(router.refresh).toHaveBeenCalled();
    });
    expect(router.push).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/context/organisation',
      expect.objectContaining({ body: JSON.stringify({ organisation_id: 'org-1' }) }),
    );
    expect(await screen.findByText(/Umoja SACCO · All branches/)).toBeInTheDocument();
  });

  it('hides All branches for the current organisation once its loaded page has at most one distinct branch', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [CURRENT_ORG], page: PAGE }))
      .mockImplementationOnce(() =>
        json({
          items: [
            {
              branchId: 'b-1',
              branchCode: 'HQ',
              branchName: 'Head Office',
              branchStatus: 'ACTIVE',
            },
          ],
          page: { ...PAGE, totalItems: 1 },
        }),
      );
    renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Umoja SACCO/ }));
    await user.click(await screen.findByRole('combobox', { name: 'Branch' }));

    expect(screen.queryByRole('option', { name: /All branches/ })).not.toBeInTheDocument();
  });

  it('closes with no push, refresh or toast when All branches is picked and the current organisation already has no branch pinned', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [CURRENT_ORG], page: PAGE }))
      .mockImplementationOnce(() => json(BRANCHES_PAGE));
    const onClose = renderDialog(vi.fn(), null);

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Umoja SACCO/ }));
    await user.click(await screen.findByRole('combobox', { name: 'Branch' }));
    await user.click(screen.getByRole('option', { name: /All branches/ }));

    expect(onClose).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(screen.queryByText(/Switched to/)).not.toBeInTheDocument();
    // Nothing to unpin: only the GET organisations + GET branches calls, no unpin POST.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows a retryable state with no false-success toast/push when the unpin POST 5xxs', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [CURRENT_ORG], page: PAGE }))
      .mockImplementationOnce(() => json(BRANCHES_PAGE))
      .mockImplementationOnce(() => Promise.resolve(new Response('{}', { status: 500 })));
    renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Umoja SACCO/ }));
    await user.click(await screen.findByRole('combobox', { name: 'Branch' }));
    await user.click(screen.getByRole('option', { name: /All branches/ }));

    await screen.findByText(/couldn't update your context/i);
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(screen.queryByText(/Switched to/)).not.toBeInTheDocument();
    // The stale Branch select (loaded for the old, now-unpinned attempt) must not survive the
    // failure — otherwise a second pick from it fires onComplete with an empty organisationId.
    expect(screen.queryByRole('combobox', { name: 'Branch' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Organisation' })).toBeInTheDocument();
  });

  it('shows a retryable state with no false-success toast/push when the unpin POST fails with a network error', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [CURRENT_ORG], page: PAGE }))
      .mockImplementationOnce(() => json(BRANCHES_PAGE))
      .mockImplementationOnce(() => Promise.reject(new Error('network error')));
    renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Umoja SACCO/ }));
    await user.click(await screen.findByRole('combobox', { name: 'Branch' }));
    await user.click(screen.getByRole('option', { name: /All branches/ }));

    await screen.findByText(/couldn't update your context/i);
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(screen.queryByText(/Switched to/)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Branch' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Organisation' })).toBeInTheDocument();
  });

  it('shows access-denied with no false-success toast/push when the unpin POST 403s, and lets it be retried', async () => {
    // The organisation route never clears the context cookie and never returns 409 on a 403 (unlike
    // the branch endpoints) — the pinned context is intact, so this must not behave like a lost
    // context (no silent refresh-only Close, no disabled fast path): a retry can still succeed.
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [CURRENT_ORG], page: PAGE }))
      .mockImplementationOnce(() => json(BRANCHES_PAGE))
      .mockImplementationOnce(() => Promise.resolve(new Response('{}', { status: 403 })))
      .mockImplementationOnce(() => json(BRANCHES_PAGE))
      .mockImplementationOnce(() =>
        json({ branchId: null, requiresBranchSelection: true, assignedBranchIds: ['b-1', 'b-2'] }),
      );
    renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Umoja SACCO/ }));
    await user.click(await screen.findByRole('combobox', { name: 'Branch' }));
    await user.click(screen.getByRole('option', { name: /All branches/ }));

    await screen.findByText(/do not have access/i);
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(screen.queryByText(/Switched to/)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Branch' })).not.toBeInTheDocument();

    // Retry: re-pick the same organisation (the fast path still lists its branches, proving the
    // 403 was not treated as a lost context) and choose All branches again.
    await user.click(screen.getByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Umoja SACCO/ }));
    await user.click(await screen.findByRole('combobox', { name: 'Branch' }));
    await user.click(screen.getByRole('option', { name: /All branches/ }));

    await vi.waitFor(() => {
      expect(router.refresh).toHaveBeenCalled();
    });
    expect(router.push).not.toHaveBeenCalled();
    // The full organisation name must reach the toast — a regression that let onComplete fire with
    // an empty organisationId would show "Switched to  · All branches" instead.
    expect(await screen.findByText('Switched to Umoja SACCO · All branches')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

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

  it('closes with a refresh but no toast or push when the branch list 403s after re-picking the current organisation', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [CURRENT_ORG], page: PAGE }))
      .mockImplementationOnce(() => Promise.resolve(new Response('{}', { status: 403 })));
    const onClose = renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Umoja SACCO/ }));
    await screen.findByText(/do not have access/i);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.queryByText(/Switched to/)).not.toBeInTheDocument();
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
