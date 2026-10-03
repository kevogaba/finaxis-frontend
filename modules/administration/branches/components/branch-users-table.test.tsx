import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { BranchUserRow } from './branch-users-table';
import { BranchUsersTable } from './branch-users-table';

vi.mock('@/modules/administration/branches/branch-actions', () => ({
  assignBranchUser: vi.fn(),
  revokeBranchAssignment: vi.fn(),
}));

const ASSIGNMENT = '08000000-0000-4000-8000-000000000001';
const ORG = '11111111-1111-4111-8111-111111111111';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const hidden = (name: string, root: ParentNode) =>
  root.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;

const ROWS: BranchUserRow[] = [
  {
    assignmentId: ASSIGNMENT,
    name: 'Jane Wanjiru',
    email: 'jane.wanjiru@greenfield.example',
    assignmentType: 'OPERATE',
  },
];

describe('BranchUsersTable', () => {
  it('drops the row hover: only the row actions are interactive (C7)', () => {
    renderWithProviders(<BranchUsersTable rows={ROWS} canRevoke={false} />);

    const row = screen.getByText('Jane Wanjiru').closest('tr');
    expect(row).not.toHaveClass('MuiTableRow-hover');
  });

  it('names each revoke by user and type alone: a branch page has no branch to name', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BranchUsersTable rows={ROWS} canRevoke contextOrganisationId={ORG} />);

    // The users tab's `branchLabel` is opt-in: this table never passes it, so 08's strings stay as they were.
    await user.click(
      screen.getByRole('button', { name: "Revoke Jane Wanjiru's Operate assignment" }),
    );
    const dialog = screen.getByRole('alertdialog', { name: "Revoke Jane Wanjiru's assignment?" });
    expect(dialog).toHaveTextContent(
      'Jane Wanjiru loses the Operate assignment at this branch immediately.',
    );
    // Rule 6: the revoke carries the rendered organisation, a minted key and its row's assignment.
    expect(hidden('contextOrganisationId', dialog)).toBe(ORG);
    expect(hidden('idempotencyKey', dialog)).toMatch(UUID);
    expect(hidden('assignmentId', dialog)).toBe(ASSIGNMENT);
  });
});
