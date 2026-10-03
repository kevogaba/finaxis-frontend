import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { RoleAssignmentsTable, type RoleAssignmentRow } from './role-assignments-table';

const { revokeRoleAssignment } = vi.hoisted(() => ({ revokeRoleAssignment: vi.fn() }));
vi.mock('../role-actions', () => ({
  assignRole: vi.fn(),
  revokeRoleAssignment: (...args: unknown[]) => revokeRoleAssignment(...args) as unknown,
}));

// vitest.config.ts resets no mocks, so each case must start with a clean call count.
beforeEach(() => {
  revokeRoleAssignment.mockReset();
});

const ASSIGNMENT = '09000000-0000-4000-8000-00000000000e';
const OTHER = '09000000-0000-4000-8000-00000000000f';
const ORG = '11111111-1111-4111-8111-111111111111';

const tenantRow: RoleAssignmentRow = {
  assignmentId: ASSIGNMENT,
  name: 'Grace Achieng',
  email: 'grace@example.test',
  scopeType: 'TENANT',
  branchLabel: 'All branches',
  self: false,
  revocable: true,
};
const branchRow: RoleAssignmentRow = {
  assignmentId: OTHER,
  name: 'Peter Otieno',
  email: null,
  scopeType: 'BRANCH',
  branchLabel: 'Westlands Branch',
  self: false,
  revocable: true,
};

describe('RoleAssignmentsTable', () => {
  it('names each scope, and revokes with the id and the rendered organisation (I2)', async () => {
    const user = userEvent.setup();
    revokeRoleAssignment.mockResolvedValueOnce({ ok: true });
    renderWithProviders(
      <RoleAssignmentsTable
        rows={[tenantRow, branchRow]}
        roleName="Teller"
        canRevoke
        contextOrganisationId={ORG}
      />,
    );

    const table = screen.getByRole('table', { name: 'Role assignments' });
    expect(table).toHaveTextContent('grace@example.test');
    expect(table).toHaveTextContent('Westlands Branch');
    // The name carries user, role and scope, so one user's rows stay distinguishable in 10.
    expect(
      screen.getByRole('button', {
        name: "Revoke Peter Otieno's Teller assignment (Westlands Branch)",
      }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: "Revoke Grace Achieng's Teller assignment (institution-wide)",
      }),
    );
    const dialog = screen.getByRole('alertdialog', {
      name: "Revoke Grace Achieng's Teller assignment?",
    });
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(revokeRoleAssignment).toHaveBeenCalledTimes(1);
    });
    const formData = revokeRoleAssignment.mock.calls[0]?.[1] as FormData;
    expect(formData.get('assignmentId')).toBe(ASSIGNMENT);
    expect(formData.get('contextOrganisationId')).toBe(ORG);
  });

  it("offers no Revoke for a row the context can't reach (§E.4: a 404)", () => {
    renderWithProviders(
      <RoleAssignmentsTable
        rows={[tenantRow, { ...branchRow, revocable: false }]}
        roleName="Teller"
        canRevoke
      />,
    );

    expect(
      screen.getByRole('button', {
        name: "Revoke Grace Achieng's Teller assignment (institution-wide)",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Revoke/ })).toHaveLength(1);
    expect(screen.getByRole('table', { name: 'Role assignments' })).toHaveTextContent(
      'Peter Otieno',
    );
  });

  it('has no Revoke button or Actions column without revoke rights', () => {
    renderWithProviders(
      <RoleAssignmentsTable rows={[tenantRow]} roleName="Teller" canRevoke={false} />,
    );

    expect(screen.getByRole('table', { name: 'Role assignments' })).toHaveTextContent(
      'Grace Achieng',
    );
    expect(screen.queryByRole('button', { name: /^Revoke/ })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
  });
});
