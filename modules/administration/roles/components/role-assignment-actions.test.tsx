import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import {
  AssignRoleButton,
  RevokeRoleAssignmentButton,
  RoleScopeFields,
} from './role-assignment-actions';

const { revokeRoleAssignment } = vi.hoisted(() => ({ revokeRoleAssignment: vi.fn() }));
vi.mock('../role-actions', () => ({
  assignRole: vi.fn(),
  revokeRoleAssignment: (...args: unknown[]) => revokeRoleAssignment(...args) as unknown,
}));

// vitest.config.ts resets no mocks, so each case must start with a clean call count.
beforeEach(() => {
  revokeRoleAssignment.mockReset();
});

const WESTLANDS = '44444444-4444-4444-8444-444444444444';
const ROLE = '09000000-0000-4000-8000-000000000007';
const ASSIGNMENT = '09000000-0000-4000-8000-00000000000e';
const ORG = '11111111-1111-4111-8111-111111111111';
const hidden = (name: string, root: ParentNode = document) =>
  root.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;

describe('RoleScopeFields', () => {
  it('reveals a branch choice for one-branch scope, defaulting a lone branch', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <form>
        <RoleScopeFields
          branches={[{ id: WESTLANDS, label: 'Westlands Branch (WESTLANDS)' }]}
          fieldErrors={{}}
        />
      </form>,
    );

    expect(hidden('scopeType')).toBe('TENANT');
    expect(screen.queryByRole('combobox', { name: 'Branch' })).toBeNull();
    await user.click(screen.getByRole('combobox', { name: 'Scope' }));
    await user.click(screen.getByRole('option', { name: 'One branch' }));

    expect(hidden('scopeType')).toBe('BRANCH');
    expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveTextContent(
      'Westlands Branch (WESTLANDS)',
    );
    expect(hidden('branchId')).toBe(WESTLANDS);
  });

  it('disables one-branch scope with no reachable branch and shows server field errors', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <form>
        <RoleScopeFields branches={[]} fieldErrors={{ scopeType: 'Choose a scope.' }} />
      </form>,
    );

    expect(screen.getByText('Choose a scope.')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Scope' }));
    expect(screen.getByRole('option', { name: 'One branch' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

describe('AssignRoleButton', () => {
  it('opens a drawer that carries the role and the rendered organisation (I2)', async () => {
    const user = userEvent.setup();
    // UserPicker fetches only once its list opens, so this needs no fetch mock.
    renderWithProviders(
      <AssignRoleButton
        roleId={ROLE}
        roleName="Teller"
        branches={[]}
        contextOrganisationId={ORG}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Assign role' }));
    const drawer = screen.getByRole('dialog', { name: 'Assign this role' });
    expect(hidden('contextOrganisationId', drawer)).toBe(ORG);
    expect(hidden('roleId', drawer)).toBe(ROLE);
  });
});

describe('RevokeRoleAssignmentButton', () => {
  it('warns before revoking your own assignment, sends the id (I2), then focuses the title (I3)', async () => {
    const user = userEvent.setup();
    revokeRoleAssignment.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderWithProviders(
      <main>
        <h1>Compliance</h1>
        <RevokeRoleAssignmentButton
          assignmentId={ASSIGNMENT}
          userLabel="Backend Jane Manager"
          roleLabel="Compliance"
          scopeLabel="institution-wide"
          self
          contextOrganisationId={ORG}
        />
      </main>,
    );

    await user.click(
      screen.getByRole('button', {
        name: "Revoke Backend Jane Manager's institution-wide assignment",
      }),
    );
    const dialog = screen.getByRole('alertdialog', {
      name: "Revoke Backend Jane Manager's Compliance assignment?",
    });
    expect(dialog).toHaveTextContent('This is your own assignment');
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(revokeRoleAssignment).toHaveBeenCalledTimes(1);
    });
    const formData = revokeRoleAssignment.mock.calls[0]?.[1] as FormData;
    expect(formData.get('assignmentId')).toBe(ASSIGNMENT);
    expect(formData.get('contextOrganisationId')).toBe(ORG);
    expect(await screen.findByRole('alert')).toHaveTextContent('Assignment revoked');

    rerender(
      <main>
        <h1>Compliance</h1>
      </main>,
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Compliance' })).toHaveFocus();
    });
  });

  it("doesn't warn about someone else's assignment", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <RevokeRoleAssignmentButton
        assignmentId={ASSIGNMENT}
        userLabel="Grace Achieng"
        roleLabel="Teller"
        scopeLabel="Westlands Branch"
        self={false}
        contextOrganisationId={ORG}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: "Revoke Grace Achieng's Westlands Branch assignment" }),
    );
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).not.toHaveTextContent('your own assignment');
    expect(hidden('contextOrganisationId', dialog)).toBe(ORG);
  });
});
