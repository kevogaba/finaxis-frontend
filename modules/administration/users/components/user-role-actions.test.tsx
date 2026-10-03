import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { AssignUserRoleButton } from './user-role-actions';

const { assignRole } = vi.hoisted(() => ({ assignRole: vi.fn() }));
vi.mock('@/modules/administration/roles/role-actions', () => ({
  assignRole: (...args: unknown[]) => assignRole(...args) as unknown,
  revokeRoleAssignment: vi.fn(),
}));

// vitest.config.ts resets no mocks, so each case must start with a clean call count.
beforeEach(() => {
  assignRole.mockReset();
});

const FELIX = '10000000-0000-4000-8000-00000000000d';
const TELLER = '10000000-0000-4000-8000-000000000019';
const SUPERVISOR = '10000000-0000-4000-8000-00000000001a';
const WESTLANDS = '44444444-4444-4444-8444-444444444444';
const ORG = '11111111-1111-4111-8111-111111111111';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HINT = 'Assign them to a branch first to give a branch-scoped role.';
const TWO_ROLES = [
  { id: TELLER, label: 'Teller (TELLER)' },
  { id: SUPERVISOR, label: 'Branch supervisor (SUPERVISOR)' },
];

const hidden = (name: string, root: ParentNode = document) =>
  root.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;

interface Overrides {
  roles?: readonly { id: string; label: string }[];
  branches?: readonly { id: string; label: string }[];
  branchHint?: string;
}

function renderButton({ roles = TWO_ROLES, branches = [], branchHint }: Overrides = {}) {
  return renderWithProviders(
    <AssignUserRoleButton
      userId={FELIX}
      userName="Felix Omondi"
      roles={roles}
      branches={branches}
      branchHint={branchHint}
      contextOrganisationId={ORG}
    />,
  );
}

async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Assign role' }));
  return screen.getByRole('dialog', { name: 'Assign a role' });
}

describe('AssignUserRoleButton', () => {
  it('opens a drawer that carries the user, the key and the organisation (I2)', async () => {
    const user = userEvent.setup();
    renderButton();

    const drawer = await openDrawer(user);

    expect(drawer).toHaveTextContent('Give Felix Omondi a role. It takes effect immediately.');
    expect(hidden('userId', drawer)).toBe(FELIX);
    expect(hidden('contextOrganisationId', drawer)).toBe(ORG);
    expect(hidden('idempotencyKey', drawer)).toMatch(UUID);
  });

  it('offers the roles it is given and preselects a lone one', async () => {
    const user = userEvent.setup();
    const { unmount } = renderButton();

    let drawer = await openDrawer(user);
    const role = within(drawer).getByRole('combobox', { name: /^Role/ });
    expect(role).toBeRequired();
    // Two roles: nothing is chosen for the administrator.
    expect(hidden('roleId', drawer)).toBe('');
    await user.click(role);
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Teller (TELLER)',
      'Branch supervisor (SUPERVISOR)',
    ]);
    await user.click(screen.getByRole('option', { name: 'Branch supervisor (SUPERVISOR)' }));
    expect(hidden('roleId', drawer)).toBe(SUPERVISOR);

    unmount();
    renderButton({ roles: [{ id: TELLER, label: 'Teller (TELLER)' }] });
    drawer = await openDrawer(user);
    expect(hidden('roleId', drawer)).toBe(TELLER);
    expect(within(drawer).getByRole('combobox', { name: /^Role/ })).toHaveTextContent(
      'Teller (TELLER)',
    );
  });

  it('passes the branch hint to the scope field', async () => {
    const user = userEvent.setup();
    renderButton({ branches: [], branchHint: HINT });

    const drawer = await openDrawer(user);
    const scope = within(drawer).getByRole('combobox', { name: /^Scope/ });
    expect(scope).toHaveAccessibleDescription(
      `Applies at every branch and at institution level. ${HINT}`,
    );
    await user.click(scope);
    expect(screen.getByRole('option', { name: 'One branch' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('offers a branch scope the user can hold, with no hint', async () => {
    const user = userEvent.setup();
    renderButton({
      branches: [{ id: WESTLANDS, label: 'Westlands Branch (WESTLANDS)' }],
      branchHint: undefined,
    });

    const drawer = await openDrawer(user);
    const scope = within(drawer).getByRole('combobox', { name: /^Scope/ });
    expect(scope).toHaveAccessibleDescription('Applies at every branch and at institution level.');
    await user.click(scope);
    expect(screen.getByRole('option', { name: 'One branch' })).not.toHaveAttribute('aria-disabled');
  });

  it('assigns the chosen role with the user, the scope, the key and the organisation, then confirms', async () => {
    const user = userEvent.setup();
    assignRole.mockResolvedValueOnce({ ok: true });
    renderButton({ roles: [{ id: TELLER, label: 'Teller (TELLER)' }] });

    const drawer = await openDrawer(user);
    await user.click(within(drawer).getByRole('button', { name: 'Assign role' }));

    await waitFor(() => {
      expect(assignRole).toHaveBeenCalledTimes(1);
    });
    const sent = assignRole.mock.calls[0]?.[1] as FormData;
    expect(sent.get('userId')).toBe(FELIX);
    expect(sent.get('roleId')).toBe(TELLER);
    expect(sent.get('scopeType')).toBe('TENANT');
    expect(sent.has('branchId')).toBe(false);
    expect(sent.get('contextOrganisationId')).toBe(ORG);
    expect(sent.get('idempotencyKey')).toMatch(UUID);
    expect(await screen.findByRole('alert')).toHaveTextContent('Role assigned');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Assign a role' })).toBeNull();
    });
  });

  it("shows the server's role error under the select and keeps the drawer open", async () => {
    const user = userEvent.setup();
    assignRole.mockResolvedValueOnce({
      ok: false,
      formError: 'Check the highlighted fields and try again.',
      fieldErrors: { roleId: 'Choose a role.' },
      code: 'validation_failed',
      requestId: null,
    });
    renderButton({ roles: [{ id: TELLER, label: 'Teller (TELLER)' }] });

    const drawer = await openDrawer(user);
    await user.click(within(drawer).getByRole('button', { name: 'Assign role' }));

    const role = await within(drawer).findByRole('combobox', { name: /^Role/ });
    await waitFor(() => {
      expect(role).toHaveAccessibleDescription('Choose a role.');
    });
    expect(role).toBeInvalid();
    expect(screen.getByRole('dialog', { name: 'Assign a role' })).toBeInTheDocument();
    // The lone role stays chosen: a failed submit keeps what was entered (a retry replays safely).
    expect(hidden('roleId', drawer)).toBe(TELLER);
  });
});
