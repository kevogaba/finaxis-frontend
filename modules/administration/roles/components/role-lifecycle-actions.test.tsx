import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { RoleLifecycleActions } from './role-lifecycle-actions';

const { activateRole, deactivateRole } = vi.hoisted(() => ({
  activateRole: vi.fn(),
  deactivateRole: vi.fn(),
}));
vi.mock('../role-actions', () => ({
  activateRole: (...args: unknown[]) => activateRole(...args) as unknown,
  deactivateRole: (...args: unknown[]) => deactivateRole(...args) as unknown,
}));

const ROLE = '09000000-0000-4000-8000-000000000007';
const ORG = '11111111-1111-4111-8111-111111111111';

describe('RoleLifecycleActions', () => {
  it(
    'warns a holder before deactivating, sends the role and organisation (I2), ' +
      'then focuses Activate (I3)',
    async () => {
      const user = userEvent.setup();
      deactivateRole.mockResolvedValueOnce({ ok: true });
      const actions = (action: 'activate' | 'deactivate') => (
        <main>
          <h1>Teller</h1>
          <RoleLifecycleActions
            roleId={ROLE}
            roleName="Teller"
            editHref={`/admin/roles/${ROLE}/edit`}
            action={action}
            heldByMe
            contextOrganisationId={ORG}
          />
        </main>
      );
      const { rerender } = renderWithProviders(actions('deactivate'));

      expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
        'href',
        `/admin/roles/${ROLE}/edit`,
      );
      await user.click(screen.getByRole('button', { name: 'Deactivate' }));
      const dialog = screen.getByRole('alertdialog', { name: 'Deactivate Teller?' });
      expect(dialog).toHaveTextContent('You hold this role yourself');
      await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));

      await waitFor(() => {
        expect(deactivateRole).toHaveBeenCalledTimes(1);
      });
      const formData = deactivateRole.mock.calls[0]?.[1] as FormData;
      expect(formData.get('roleId')).toBe(ROLE);
      expect(formData.get('contextOrganisationId')).toBe(ORG);
      expect(await screen.findByRole('alert')).toHaveTextContent('Role deactivated');

      // The server swaps the toggle after `refresh()`; simulate that next render.
      rerender(actions('activate'));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Activate' })).toHaveFocus();
      });
    },
  );

  it('falls back to the record title when no toggle remains (I3)', async () => {
    const user = userEvent.setup();
    activateRole.mockResolvedValueOnce({ ok: true });
    const actions = (action: 'activate' | null) => (
      <main>
        <h1>Loans officer</h1>
        <RoleLifecycleActions
          roleId={ROLE}
          roleName="Loans officer"
          editHref="/admin/roles/x/edit"
          action={action}
          heldByMe={false}
        />
      </main>
    );
    const { rerender } = renderWithProviders(actions('activate'));

    await user.click(screen.getByRole('button', { name: 'Activate' }));
    const dialog = screen.getByRole('dialog', { name: 'Activate Loans officer?' });
    expect(dialog).not.toHaveTextContent('You hold this role');
    await user.click(within(dialog).getByRole('button', { name: 'Activate' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Role activated');

    // A user without role.deactivate: the refreshed hero offers no toggle, only Edit.
    rerender(actions(null));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Loans officer' })).toHaveFocus();
    });
  });

  // Not in the brief: its tests keep the component mounted, so the unmount cleanup is unpinned.
  it('falls back to the record title when the whole component unmounts (I3)', async () => {
    const user = userEvent.setup();
    deactivateRole.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderWithProviders(
      <main>
        <h1>Teller</h1>
        <RoleLifecycleActions
          roleId={ROLE}
          roleName="Teller"
          action="deactivate"
          heldByMe={false}
        />
      </main>,
    );

    // No editHref: the user may not edit this role, so the hero offers no Edit link.
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Deactivate Teller?' });
    expect(dialog).not.toHaveTextContent('You hold this role');
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Role deactivated');

    // A user with role.deactivate but neither role.activate nor role.update: the refreshed layout
    // passes no actions, so this component unmounts instead of re-rendering.
    rerender(
      <main>
        <h1>Teller</h1>
      </main>,
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Teller' })).toHaveFocus();
    });
  });

  // T4-G4: refresh() swaps the action while the closed dialog is still fading out.
  it('never repaints the closing dialog as the other action', async () => {
    const user = userEvent.setup();
    deactivateRole.mockResolvedValueOnce({ ok: true });
    const actions = (action: 'activate' | 'deactivate') => (
      <main>
        <h1>Teller</h1>
        <RoleLifecycleActions roleId={ROLE} roleName="Teller" action={action} heldByMe={false} />
      </main>
    );
    const { rerender } = renderWithProviders(actions('deactivate'));

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Deactivate Teller?' });
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    // `hidden`: the page stays aria-hidden until the exit fade ends. The toast commits together
    // with `open=false` (both in onSuccess), so the dialog is closed but still mounted here.
    expect(await screen.findByRole('alert', { hidden: true })).toHaveTextContent(
      'Role deactivated',
    );

    rerender(actions('activate'));
    expect(screen.queryByText('Activate Teller?')).not.toBeInTheDocument();
  });
});
