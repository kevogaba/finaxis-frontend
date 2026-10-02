import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { Permission } from '../role-contract';
import { MAX_GRANTS_PER_SUBMIT } from '../role-rules';
import {
  GrantPermissionsButton,
  PermissionChecklist,
  RemovePermissionButton,
} from './role-permission-actions';

const { grantPermissions, removePermission } = vi.hoisted(() => ({
  grantPermissions: vi.fn(),
  removePermission: vi.fn(),
}));
vi.mock('../role-actions', () => ({
  grantPermissions: (...args: unknown[]) => grantPermissions(...args) as unknown,
  removePermission: (...args: unknown[]) => removePermission(...args) as unknown,
}));

// vitest.config.ts resets no mocks, so without this the retry test would count the first test's
// call, and a `Once` value left unconsumed by one test would leak into the next.
beforeEach(() => {
  grantPermissions.mockReset();
  removePermission.mockReset();
});

const ROLE = '09000000-0000-4000-8000-000000000008';
const GRANT = '09000000-0000-4000-8000-0000000000f1';
const ORG = '11111111-1111-4111-8111-111111111111';
const permission = (
  code: string,
  name: string,
  module: string,
  risk: Permission['risk'],
): Permission => ({ id: code, code, name, module, risk, status: 'ACTIVE' });
const CATALOGUE = [
  permission('business_date.view', 'View business date', 'settings', 'LOW'),
  permission('business_date.advance', 'Advance business date', 'settings', 'CRITICAL'),
  permission('cob.start', 'Start close of business', 'settings', 'HIGH'),
  permission('role.view', 'View roles', 'iam', 'LOW'),
];
const codesField = () => document.querySelector<HTMLInputElement>('input[name="permissionCodes"]');
const keyField = () => document.querySelector<HTMLInputElement>('input[name="idempotencyKey"]');

describe('PermissionChecklist', () => {
  it('groups by module, filters by search and risk, and carries the joined codes', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <form>
        <PermissionChecklist permissions={CATALOGUE} truncated={false} />
      </form>,
    );

    expect(screen.getByRole('group', { name: 'IAM' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Settings' })).toBeInTheDocument();

    const search = screen.getByRole('searchbox', { name: 'Search permissions' });
    await user.type(search, 'business date');
    expect(screen.queryByRole('checkbox', { name: /^View roles/ })).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: /^Advance business date/ }));
    await user.clear(search);
    await user.click(screen.getByRole('checkbox', { name: /^View roles/ }));
    expect(codesField()?.value).toBe('business_date.advance,role.view');
    expect(screen.getByRole('status')).toHaveTextContent('2 selected');

    await user.click(screen.getByRole('combobox', { name: 'Risk' }));
    await user.click(screen.getByRole('option', { name: 'High' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: /^Start close of business/ })).not.toBeChecked();
    // Filtered-out rows keep their selection.
    expect(codesField()?.value).toBe('business_date.advance,role.view');
  });

  it('caps the selection at 25 and says when the catalogue was truncated', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: MAX_GRANTS_PER_SUBMIT + 1 }, (_, index) => {
      const n = String(index).padStart(2, '0');
      return permission(`code.n${n}`, `Permission ${n}`, 'iam', 'LOW');
    });
    renderWithProviders(
      <form>
        <PermissionChecklist permissions={many} truncated />
      </form>,
    );

    // One lookup, in document order (code order): a role-and-name query per click made this test
    // take 7–11 s of its 15 s budget.
    const boxes = screen.getAllByRole('checkbox');
    for (const box of boxes.slice(0, MAX_GRANTS_PER_SUBMIT)) {
      await user.click(box);
    }
    expect(screen.getByRole('checkbox', { name: /^Permission 25/ })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('25 selected — up to 25 at a time');
    expect(screen.getByText('Only the first 100 catalogue permissions are listed.')).toBeVisible();
  });
});

describe('GrantPermissionsButton', () => {
  it('submits the role, the checked codes and the rendered organisation (I2)', async () => {
    const user = userEvent.setup();
    grantPermissions.mockResolvedValueOnce({ ok: true });
    renderWithProviders(
      <GrantPermissionsButton
        roleId={ROLE}
        roleName="Operations supervisor"
        available={CATALOGUE}
        truncated={false}
        contextOrganisationId={ORG}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Grant permissions' }));
    const drawer = screen.getByRole('dialog', { name: 'Grant permissions' });
    await user.click(within(drawer).getByRole('checkbox', { name: /^Start close of business/ }));
    await user.click(within(drawer).getByRole('button', { name: 'Grant permissions' }));

    await waitFor(() => {
      expect(grantPermissions).toHaveBeenCalledTimes(1);
    });
    const formData = grantPermissions.mock.calls[0]?.[1] as FormData;
    expect(formData.get('roleId')).toBe(ROLE);
    expect(formData.get('permissionCodes')).toBe('cob.start');
    expect(formData.get('contextOrganisationId')).toBe(ORG);
    expect(await screen.findByRole('alert')).toHaveTextContent('Permissions granted');
  });

  it('clears the search on Escape without closing the drawer or dropping the selection', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <GrantPermissionsButton
        roleId={ROLE}
        roleName="Operations supervisor"
        available={CATALOGUE}
        truncated={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Grant permissions' }));
    const drawer = screen.getByRole('dialog', { name: 'Grant permissions' });
    await user.click(within(drawer).getByRole('checkbox', { name: /^View roles/ }));
    const search = within(drawer).getByRole('searchbox', { name: 'Search permissions' });
    await user.type(search, 'cob');
    await user.keyboard('{Escape}');

    expect(search).toHaveValue('');
    // Not in the brief: a drawer closing on Escape stays mounted through its exit transition, so
    // only focus tells at once (MUI's FocusTrap returns it to the trigger the moment it closes).
    expect(search).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Grant permissions' })).toBeInTheDocument();
    expect(codesField()?.value).toBe('role.view');
  });

  // Not in the brief: the list filters as you type, so Enter in the search box must never submit.
  it('does not submit when Enter is pressed in the search box', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <GrantPermissionsButton
        roleId={ROLE}
        roleName="Operations supervisor"
        available={CATALOGUE}
        truncated={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Grant permissions' }));
    const drawer = screen.getByRole('dialog', { name: 'Grant permissions' });
    await user.type(
      within(drawer).getByRole('searchbox', { name: 'Search permissions' }),
      'cob{Enter}',
    );

    expect(grantPermissions).not.toHaveBeenCalled();
  });

  it('keeps the selection and the key after a partial failure, so the retry replays (Ruling 5)', async () => {
    const user = userEvent.setup();
    grantPermissions
      .mockResolvedValueOnce({
        ok: false,
        formError: '1 of 2 permissions were granted before this failed. Retrying is safe.',
        fieldErrors: {},
        code: 'internal_error',
        requestId: 'req-9',
      })
      .mockResolvedValueOnce({ ok: true });
    renderWithProviders(
      <GrantPermissionsButton
        roleId={ROLE}
        roleName="Operations supervisor"
        available={CATALOGUE}
        truncated={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Grant permissions' }));
    const drawer = screen.getByRole('dialog', { name: 'Grant permissions' });
    await user.click(within(drawer).getByRole('checkbox', { name: /^Start close of business/ }));
    await user.click(within(drawer).getByRole('checkbox', { name: /^View roles/ }));
    const key = keyField()?.value;
    await user.click(within(drawer).getByRole('button', { name: 'Grant permissions' }));

    expect(await within(drawer).findByRole('alert')).toHaveTextContent('1 of 2 permissions');
    expect(within(drawer).getByRole('checkbox', { name: /^View roles/ })).toBeChecked();
    await user.click(within(drawer).getByRole('button', { name: 'Grant permissions' }));
    await waitFor(() => {
      expect(grantPermissions).toHaveBeenCalledTimes(2);
    });
    const retry = grantPermissions.mock.calls[1]?.[1] as FormData;
    expect(retry.get('permissionCodes')).toBe('cob.start,role.view');
    expect(retry.get('idempotencyKey')).toBe(key);
  });

  // Not in the brief: the checklist is the one place the server's `permissionCodes` error shows.
  it('shows the server error on the checklist when nothing is selected', async () => {
    const user = userEvent.setup();
    grantPermissions.mockResolvedValueOnce({
      ok: false,
      formError: 'Check the highlighted fields and try again.',
      fieldErrors: { permissionCodes: 'Choose at least one permission.' },
      code: 'validation_failed',
      requestId: null,
    });
    renderWithProviders(
      <GrantPermissionsButton
        roleId={ROLE}
        roleName="Operations supervisor"
        available={CATALOGUE}
        truncated={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Grant permissions' }));
    const drawer = screen.getByRole('dialog', { name: 'Grant permissions' });
    await user.click(within(drawer).getByRole('button', { name: 'Grant permissions' }));

    expect(await within(drawer).findByText('Choose at least one permission.')).toBeInTheDocument();
    // The error is tied to its controls: every group, and the search box when filters hide them all.
    expect(within(drawer).getByRole('group', { name: 'IAM' })).toHaveAccessibleDescription(
      'Choose at least one permission.',
    );
    expect(
      within(drawer).getByRole('searchbox', { name: 'Search permissions' }),
    ).toHaveAccessibleDescription('Choose at least one permission.');
    // The field travels empty, not absent, so the server's own message is the one that comes back.
    const formData = grantPermissions.mock.calls[0]?.[1] as FormData;
    expect(formData.get('permissionCodes')).toBe('');
  });

  // Not in the brief (Ruling 6): a partial failure's refresh() shrinks `available`, but the open
  // drawer keeps the list it opened with, so a checked row is still there for the replay.
  it('keeps the options it opened with when the available list shrinks', async () => {
    const user = userEvent.setup();
    const button = (available: readonly Permission[]) => (
      <GrantPermissionsButton
        roleId={ROLE}
        roleName="Operations supervisor"
        available={available}
        truncated={false}
      />
    );
    const { rerender } = renderWithProviders(button(CATALOGUE));

    await user.click(screen.getByRole('button', { name: 'Grant permissions' }));
    const drawer = screen.getByRole('dialog', { name: 'Grant permissions' });
    await user.click(within(drawer).getByRole('checkbox', { name: /^Start close of business/ }));

    rerender(button(CATALOGUE.filter((entry) => entry.code !== 'cob.start')));

    expect(
      within(drawer).getByRole('checkbox', { name: /^Start close of business/ }),
    ).toBeChecked();
    expect(codesField()?.value).toBe('cob.start');
  });
});

describe('RemovePermissionButton', () => {
  it('confirms a critical removal as an alert dialog, sends the ids, then focuses the title (I3)', async () => {
    const user = userEvent.setup();
    removePermission.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderWithProviders(
      <main>
        <h1>Operations supervisor</h1>
        <RemovePermissionButton
          roleId={ROLE}
          grantId={GRANT}
          label="Advance business date"
          critical
          contextOrganisationId={ORG}
        />
      </main>,
    );

    await user.click(screen.getByRole('button', { name: 'Remove Advance business date' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Remove Advance business date?' });
    expect(dialog).toHaveTextContent('is a critical permission');
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(removePermission).toHaveBeenCalledTimes(1);
    });
    const formData = removePermission.mock.calls[0]?.[1] as FormData;
    expect([
      formData.get('roleId'),
      formData.get('grantId'),
      formData.get('contextOrganisationId'),
    ]).toEqual([ROLE, GRANT, ORG]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission removed');

    // The refreshed table no longer has this row, so the button unmounts.
    rerender(
      <main>
        <h1>Operations supervisor</h1>
      </main>,
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Operations supervisor' })).toHaveFocus();
    });
  });

  it('confirms a non-critical removal as a plain dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <RemovePermissionButton
        roleId={ROLE}
        grantId={GRANT}
        label="View business date"
        critical={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Remove View business date' }));
    expect(
      screen.getByRole('dialog', { name: 'Remove View business date?' }),
    ).not.toHaveTextContent('critical');
  });
});
