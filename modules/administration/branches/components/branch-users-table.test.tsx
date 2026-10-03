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

const ROWS: BranchUserRow[] = [
  {
    assignmentId: '08000000-0000-4000-8000-000000000001',
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
    renderWithProviders(<BranchUsersTable rows={ROWS} canRevoke />);

    // The users tab's `branchLabel` is opt-in: this table never passes it, so 08's strings stay as they were.
    await user.click(
      screen.getByRole('button', { name: "Revoke Jane Wanjiru's Operate assignment" }),
    );
    const dialog = screen.getByRole('alertdialog', { name: "Revoke Jane Wanjiru's assignment?" });
    expect(dialog).toHaveTextContent(
      'Jane Wanjiru loses the Operate assignment at this branch immediately.',
    );
  });
});
