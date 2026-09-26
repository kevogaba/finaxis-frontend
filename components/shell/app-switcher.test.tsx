import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { AppSwitcher } from './app-switcher';

// A stable router object: the real Next router is memoized, and both AppSwitcher instances call
// useRouter(), so a fresh object per render would re-run effects that depend on it.
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
  totalItems: 2,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
};
function organisations(ids: string[]) {
  return new Response(
    JSON.stringify({
      items: ids.map((id) => ({
        organisationId: id,
        membershipId: `m-${id}`,
        tenantCode: id,
        displayName: id,
        organisationStatus: 'ACTIVE',
        membershipStatus: 'ACTIVE',
      })),
      page: PAGE,
    }),
    { status: 200 },
  );
}

describe('AppSwitcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    router.push.mockReset();
    router.refresh.mockReset();
    router.replace.mockReset();
  });

  it('offers only Administration when the user has no platform membership', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(organisations(['umoja']));
    renderWithProviders(
      <AppSwitcher
        currentModuleId="administration"
        platformOrganisationId="platform"
        onOpenContextSwitcher={vi.fn()}
        trigger="icon"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch application' }));

    expect(await screen.findByRole('dialog', { name: 'Finaxis apps' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Finaxis apps' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Administration/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Platform administration/ }),
    ).not.toBeInTheDocument();
  });

  it('switches into the platform workspace through the real context change', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(organisations(['umoja', 'platform']))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            branchId: 'ops',
            requiresBranchSelection: false,
            assignedBranchIds: ['ops'],
          }),
          { status: 200 },
        ),
      );
    renderWithProviders(
      <AppSwitcher
        currentModuleId="administration"
        platformOrganisationId="platform"
        onOpenContextSwitcher={vi.fn()}
        trigger="icon"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch application' }));
    await user.click(await screen.findByRole('button', { name: /Platform administration/ }));

    await vi.waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/platform-admin');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/context/organisation',
      expect.objectContaining({ body: JSON.stringify({ organisation_id: 'platform' }) }),
    );
    expect(router.refresh).toHaveBeenCalled();
    expect(await screen.findByText('Switched to platform')).toBeInTheDocument();
  });

  it('auto-pins the single distinct branch and finishes the switch to the platform', async () => {
    const user = userEvent.setup();
    const onOpenContextSwitcher = vi.fn();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(organisations(['umoja', 'platform']))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            branchId: null,
            requiresBranchSelection: true,
            assignedBranchIds: ['ops', 'ops'],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    renderWithProviders(
      <AppSwitcher
        currentModuleId="administration"
        platformOrganisationId="platform"
        onOpenContextSwitcher={onOpenContextSwitcher}
        trigger="icon"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch application' }));
    await user.click(await screen.findByRole('button', { name: /Platform administration/ }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/context/branch',
        expect.objectContaining({ body: JSON.stringify({ branch_id: 'ops' }) }),
      );
      expect(router.push).toHaveBeenCalledWith('/platform-admin');
      expect(router.refresh).toHaveBeenCalled();
    });
    expect(onOpenContextSwitcher).not.toHaveBeenCalled();
    expect(await screen.findByText('Switched to platform')).toBeInTheDocument();
  });

  it('sends the user to select-context with no toast when the auto-pin finds the context already gone (403)', async () => {
    const user = userEvent.setup();
    const onOpenContextSwitcher = vi.fn();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(organisations(['umoja', 'platform']))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            branchId: null,
            requiresBranchSelection: true,
            assignedBranchIds: ['ops', 'ops'],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 403 }));
    renderWithProviders(
      <AppSwitcher
        currentModuleId="administration"
        platformOrganisationId="platform"
        onOpenContextSwitcher={onOpenContextSwitcher}
        trigger="icon"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch application' }));
    await user.click(await screen.findByRole('button', { name: /Platform administration/ }));

    await vi.waitFor(() => {
      expect(router.refresh).toHaveBeenCalled();
    });
    expect(router.push).not.toHaveBeenCalled();
    expect(onOpenContextSwitcher).not.toHaveBeenCalled();
    expect(screen.queryByText(/Switched to/)).not.toBeInTheDocument();
  });

  it('lands on All branches when several distinct branches are assigned', async () => {
    const user = userEvent.setup();
    const onOpenContextSwitcher = vi.fn();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(organisations(['umoja', 'platform']))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            branchId: null,
            requiresBranchSelection: true,
            assignedBranchIds: ['ops', 'hq'],
          }),
          { status: 200 },
        ),
      );
    renderWithProviders(
      <AppSwitcher
        currentModuleId="administration"
        platformOrganisationId="platform"
        onOpenContextSwitcher={onOpenContextSwitcher}
        trigger="icon"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch application' }));
    await user.click(await screen.findByRole('button', { name: /Platform administration/ }));

    await vi.waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/platform-admin');
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(router.refresh).toHaveBeenCalled();
    expect(await screen.findByText('Switched to platform · All branches')).toBeInTheDocument();
    expect(onOpenContextSwitcher).not.toHaveBeenCalled();
  });

  it('asks for a tenant organisation when switching back to Administration', async () => {
    const user = userEvent.setup();
    const onOpenContextSwitcher = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(organisations(['umoja', 'platform']));
    renderWithProviders(
      <AppSwitcher
        currentModuleId="platform-administration"
        platformOrganisationId="platform"
        onOpenContextSwitcher={onOpenContextSwitcher}
        trigger="icon"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch application' }));
    await user.click(await screen.findByRole('button', { name: /Administration/ }));

    expect(onOpenContextSwitcher).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(organisations(['umoja']));
    renderWithProviders(
      <AppSwitcher
        currentModuleId="administration"
        platformOrganisationId="platform"
        onOpenContextSwitcher={vi.fn()}
        trigger="icon"
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Switch application' });
    await user.click(trigger);
    await screen.findByRole('button', { name: /Administration/ });
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
