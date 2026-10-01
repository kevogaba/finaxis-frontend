import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { BranchUserRow } from './branch-users-table';
import { BranchUsersTable } from './branch-users-table';

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
});
