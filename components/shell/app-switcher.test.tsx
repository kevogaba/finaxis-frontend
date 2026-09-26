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

    expect(await screen.findByRole('button', { name: /Administration/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Platform administration/ }),
    ).not.toBeInTheDocument();
  });

  it('switches into the platform workspace through the real context change', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
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
