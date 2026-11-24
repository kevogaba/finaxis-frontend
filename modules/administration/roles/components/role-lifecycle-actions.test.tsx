import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { RoleLifecycleActions } from './role-lifecycle-actions';

const { activateRole, archiveRole, deactivateRole } = vi.hoisted(() => ({
  activateRole: vi.fn(),
  archiveRole: vi.fn(),
  deactivateRole: vi.fn(),
}));
vi.mock('../role-actions', () => ({
  activateRole: (...args: unknown[]) => activateRole(...args) as unknown,
  archiveRole: (...args: unknown[]) => archiveRole(...args) as unknown,
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

  // #342: re-enabling a role you hold adds to your own access, so Activate shows disabled.
  it('shows a blocked Activate disabled with its reason, keeping Edit', () => {
    renderWithProviders(
      <RoleLifecycleActions
        roleId={ROLE}
        roleName="Loans officer"
        editHref="/admin/roles/x/edit"
        action="activate"
        blocked="Held, so no."
        heldByMe
      />,
    );

    const activate = screen.getByRole('button', { name: 'Activate' });
    expect(activate).toBeDisabled();
    expect(activate).toHaveAccessibleDescription('Held, so no.');
    expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument();
  });

  it('falls back to the record title when the toggle that remains is blocked (I3)', async () => {
    const user = userEvent.setup();
    deactivateRole.mockResolvedValueOnce({ ok: true });
    const actions = (action: 'activate' | 'deactivate', blocked?: string) => (
      <main>
        <h1>Teller</h1>
        <RoleLifecycleActions
          roleId={ROLE}
          roleName="Teller"
          action={action}
          blocked={blocked}
          heldByMe
        />
      </main>
    );
    const { rerender } = renderWithProviders(actions('deactivate'));

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Deactivate' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Role deactivated');

    // You held it, so the refreshed hero offers Activate disabled: it can't take focus.
    rerender(actions('activate', 'Held, so no.'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Teller' })).toHaveFocus();
    });
  });

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

  describe('Archive (ADR 0035)', () => {
    beforeEach(() => {
      archiveRole.mockClear();
    });
    const FINAL =
      "Archiving is final. The role can't be edited, activated or assigned again, and its code TELLER stays reserved.";
    const hero = (activeAssignments: number | null) => (
      <main>
        <h1>Teller</h1>
        <RoleLifecycleActions
          roleId={ROLE}
          roleName="Teller"
          action="deactivate"
          archive={{ roleCode: 'TELLER', activeAssignments }}
          heldByMe={false}
          contextOrganisationId={ORG}
        />
      </main>
    );

    it('archives after the status toggle, then focuses the record title (I3)', async () => {
      const user = userEvent.setup();
      archiveRole.mockResolvedValueOnce({ ok: true });
      const { rerender } = renderWithProviders(hero(0));

      const buttons = screen.getAllByRole('button').map((button) => button.textContent);
      expect(buttons).toEqual(['Deactivate', 'Archive']);
      expect(screen.getByRole('button', { name: 'Archive' })).toHaveClass(
        'MuiButton-outlined',
        'MuiButton-colorError',
      );
      await user.click(screen.getByRole('button', { name: 'Archive' }));
      const dialog = screen.getByRole('alertdialog', { name: 'Archive Teller?' });
      expect(dialog).toHaveAccessibleDescription(FINAL);
      await user.click(within(dialog).getByRole('button', { name: 'Archive' }));

      await waitFor(() => {
        expect(archiveRole).toHaveBeenCalledTimes(1);
      });
      const formData = archiveRole.mock.calls[0]?.[1] as FormData;
      expect(formData.get('roleId')).toBe(ROLE);
      expect(formData.get('contextOrganisationId')).toBe(ORG);
      expect(await screen.findByRole('alert')).toHaveTextContent('Role archived');

      // An archived role offers nothing, so the layout drops the actions.
      rerender(
        <main>
          <h1>Teller</h1>
        </main>,
      );
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Teller' })).toHaveFocus();
      });
    });

    it.each([
      [1, 'This role still has 1 active assignment. Revoke it first.'],
      [3, 'This role still has 3 active assignments. Revoke them first.'],
    ])('with %i active assignment(s), says so and offers only Cancel', async (count, warning) => {
      const user = userEvent.setup();
      renderWithProviders(hero(count));

      await user.click(screen.getByRole('button', { name: 'Archive' }));
      const dialog = screen.getByRole('alertdialog', { name: 'Archive Teller?' });
      expect(dialog).toHaveTextContent(warning);
      expect(within(dialog).getByRole('button', { name: 'Archive' })).toBeDisabled();
      const view = within(dialog).getByRole('link', { name: 'View assignments' });
      expect(view).toHaveAttribute('href', `/admin/roles/${ROLE}/assignments`);

      // The layout stays mounted across tabs, so following the link closes the dialog. (jsdom
      // can't navigate, so the click goes no further.)
      view.addEventListener('click', (event) => {
        event.preventDefault();
      });
      await user.click(view);
      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
      expect(archiveRole).not.toHaveBeenCalled();
    });

    it('leaves the platform to refuse when the count is unknown', async () => {
      const user = userEvent.setup();
      renderWithProviders(hero(null));

      await user.click(screen.getByRole('button', { name: 'Archive' }));
      const dialog = screen.getByRole('alertdialog', { name: 'Archive Teller?' });
      expect(dialog).not.toHaveTextContent('still has');
      expect(within(dialog).getByRole('button', { name: 'Archive' })).toBeEnabled();
    });
  });
});
