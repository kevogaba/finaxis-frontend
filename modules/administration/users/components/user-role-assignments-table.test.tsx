import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import {
  UserRoleAssignmentsTable,
  type UserRoleAssignmentRow,
} from './user-role-assignments-table';

const { revokeRoleAssignment } = vi.hoisted(() => ({ revokeRoleAssignment: vi.fn() }));
vi.mock('@/modules/administration/roles/role-actions', () => ({
  assignRole: vi.fn(),
  revokeRoleAssignment: (...args: unknown[]) => revokeRoleAssignment(...args) as unknown,
}));

// vitest.config.ts resets no mocks, so each case must start with a clean call count.
beforeEach(() => {
  revokeRoleAssignment.mockReset();
});

const TENANT_ASSIGNMENT = '10000000-0000-4000-8000-000000000306';
const BRANCH_ASSIGNMENT = '10000000-0000-4000-8000-000000000307';
const LOANS_ASSIGNMENT = '10000000-0000-4000-8000-000000000308';
const ORG = '11111111-1111-4111-8111-111111111111';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const hidden = (name: string, root: ParentNode) =>
  root.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;

/** Rule 6: every confirmation carries the rendered organisation, a minted key and its row's
 * assignment, or the cross-tab guard and the retry's replay silently stop working. */
function expectScoped(root: ParentNode, assignmentId: string) {
  expect(hidden('contextOrganisationId', root)).toBe(ORG);
  expect(hidden('idempotencyKey', root)).toMatch(UUID);
  expect(hidden('assignmentId', root)).toBe(assignmentId);
}

const tenantRow: UserRoleAssignmentRow = {
  assignmentId: TENANT_ASSIGNMENT,
  roleName: 'Teller',
  roleCode: 'TELLER',
  roleStatus: 'ACTIVE',
  scopeType: 'TENANT',
  branchLabel: 'All branches',
  revocable: true,
};
const branchRow: UserRoleAssignmentRow = {
  ...tenantRow,
  assignmentId: BRANCH_ASSIGNMENT,
  scopeType: 'BRANCH',
  branchLabel: 'Westlands Branch',
};
const disabledRow: UserRoleAssignmentRow = {
  ...tenantRow,
  assignmentId: LOANS_ASSIGNMENT,
  roleName: 'Loans officer',
  roleCode: 'LOANS_OFFICER',
  roleStatus: 'DISABLED',
};

interface Overrides {
  rows?: readonly UserRoleAssignmentRow[];
  self?: boolean;
  canRevoke?: boolean;
}

const renderTable = ({ rows = [tenantRow], self = false, canRevoke = true }: Overrides = {}) =>
  renderWithProviders(
    <UserRoleAssignmentsTable
      rows={rows}
      userName="Felix Omondi"
      self={self}
      canRevoke={canRevoke}
      contextOrganisationId={ORG}
    />,
  );

/** The data row whose Role cell names `roleName` (the Scope cell's text may repeat across rows). */
function rowOf(roleName: string, index = 0): HTMLElement {
  const row = screen
    .getAllByRole('row')
    .filter((candidate) => within(candidate).queryByText(roleName))
    .at(index);
  if (!row) throw new Error(`No row ${index} for ${roleName}`);
  return row;
}

describe('UserRoleAssignmentsTable', () => {
  it('lists each role with its code, scope and branch under their column headers', () => {
    renderTable({ rows: [tenantRow, branchRow] });

    const table = screen.getByRole('table', { name: 'Role assignments' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Role', 'Scope', 'Branch', 'Actions']);
    expect(screen.getByRole('region', { name: 'Role assignments' })).toHaveAttribute(
      'tabindex',
      '0',
    );
    const tenant = rowOf('Teller', 0);
    expect(within(tenant).getByText('TELLER')).toBeInTheDocument();
    expect(within(tenant).getByText('Institution')).toBeInTheDocument();
    expect(within(tenant).getByText('All branches')).toBeInTheDocument();
    const branch = rowOf('Teller', 1);
    expect(within(branch).getByText('Branch')).toBeInTheDocument();
    expect(within(branch).getByText('Westlands Branch')).toBeInTheDocument();
  });

  it('names each revoke by role and scope', () => {
    renderTable({ rows: [tenantRow, branchRow] });

    // Felix's two Teller rows differ only by scope, so the name must carry it (WCAG 2.4.6).
    expect(
      within(rowOf('Teller', 0)).getByRole('button', {
        name: "Revoke Felix Omondi's Teller assignment (institution-wide)",
      }),
    ).toBeInTheDocument();
    expect(
      within(rowOf('Teller', 1)).getByRole('button', {
        name: "Revoke Felix Omondi's Teller assignment (Westlands Branch)",
      }),
    ).toBeInTheDocument();
  });

  it('marks a role that grants nothing', () => {
    renderTable({ rows: [disabledRow, tenantRow] });

    expect(within(rowOf('Loans officer')).getByText('Disabled')).toBeInTheDocument();
    // An ACTIVE role renders no chip at all: neither "Disabled" nor a redundant "Active".
    expect(within(rowOf('Teller')).queryByText('Disabled')).toBeNull();
    expect(within(rowOf('Teller')).queryByText('Active')).toBeNull();
    expect(screen.getAllByText('Disabled')).toHaveLength(1);
  });

  it('shows no role chip for an unknown role status, and no code for an unknown role', () => {
    renderTable({
      rows: [{ ...tenantRow, roleName: '10000000', roleCode: null, roleStatus: null }],
    });

    const row = rowOf('10000000');
    expect(within(row).queryByText('Disabled')).toBeNull();
    expect(within(row).queryByText('Active')).toBeNull();
    // The cell holds the name only: the Scope chip and the branch are the other two cells.
    expect(within(row).getAllByRole('cell')[0]).toHaveTextContent(/^10000000$/);
  });

  it('forwards the organisation and the assignment to the revoke (I2)', async () => {
    const user = userEvent.setup();
    revokeRoleAssignment.mockResolvedValueOnce({ ok: true });
    renderTable({ rows: [tenantRow, branchRow] });

    await user.click(
      screen.getByRole('button', {
        name: "Revoke Felix Omondi's Teller assignment (Westlands Branch)",
      }),
    );
    const dialog = screen.getByRole('alertdialog', {
      name: "Revoke Felix Omondi's Teller assignment?",
    });
    expect(dialog).toHaveTextContent('Felix Omondi loses Teller (Westlands Branch) immediately.');
    expectScoped(dialog, BRANCH_ASSIGNMENT);
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(revokeRoleAssignment).toHaveBeenCalledTimes(1);
    });
    const sent = revokeRoleAssignment.mock.calls[0]?.[1] as FormData;
    expect(sent.get('assignmentId')).toBe(BRANCH_ASSIGNMENT);
    expect(sent.get('contextOrganisationId')).toBe(ORG);
    expect(sent.get('idempotencyKey')).toMatch(UUID);
  });

  it('warns on your own record that the revoke removes your own permissions', async () => {
    const user = userEvent.setup();
    renderTable({ self: true });
    await user.click(screen.getByRole('button', { name: /^Revoke Felix Omondi's Teller/ }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('This is your own assignment');
    expectScoped(dialog, TENANT_ASSIGNMENT);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
  });

  it("doesn't warn on someone else's record", async () => {
    const user = userEvent.setup();
    renderTable({ self: false });
    await user.click(screen.getByRole('button', { name: /^Revoke Felix Omondi's Teller/ }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).not.toHaveTextContent('your own assignment');
    expectScoped(dialog, TENANT_ASSIGNMENT);
  });

  it("renders no revoke for a row the context can't revoke", () => {
    renderTable({ rows: [tenantRow, { ...branchRow, revocable: false }] });

    expect(screen.getAllByRole('button', { name: /^Revoke/ })).toHaveLength(1);
    expect(
      within(rowOf('Teller', 0)).getByRole('button', { name: /institution-wide/ }),
    ).toBeInTheDocument();
    // The row stays listed, just without the action.
    const branch = rowOf('Teller', 1);
    expect(within(branch).getByText('Westlands Branch')).toBeInTheDocument();
    expect(within(branch).queryByRole('button')).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
  });

  it('has no Actions column without canRevoke', () => {
    renderTable({ rows: [tenantRow], canRevoke: false });

    expect(screen.getByRole('table', { name: 'Role assignments' })).toHaveTextContent('Teller');
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Revoke/ })).toBeNull();
    expect(within(rowOf('Teller')).getAllByRole('cell')).toHaveLength(3);
  });
});
