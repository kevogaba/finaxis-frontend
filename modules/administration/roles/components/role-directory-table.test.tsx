import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { RoleSummary } from '../role-contract';
import { RoleDirectoryTable } from './role-directory-table';

const TELLER = '09000000-0000-4000-8000-000000000007';
const LONG =
  'Compliance, risk and internal audit reviewer for member savings and credit operations';
const ROLES: RoleSummary[] = [
  { id: TELLER, roleCode: 'TELLER', roleName: 'Teller', systemRole: false, status: 'DISABLED' },
  {
    id: '66666666-6666-4666-8666-666666666666',
    roleCode: 'TENANT_ADMIN',
    roleName: LONG,
    systemRole: true,
    status: 'ACTIVE',
  },
];

describe('RoleDirectoryTable', () => {
  it('links each role, marks the sorted column, and leaves Type unsortable', () => {
    renderWithProviders(
      <RoleDirectoryTable
        roles={ROLES}
        sort={{ by: 'roleCode', dir: 'DESC' }}
        sortHref={(field) => `/sort/${field}`}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Code' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    expect(screen.getByRole('columnheader', { name: 'Role' })).not.toHaveAttribute('aria-sort');
    for (const [label, field] of [
      ['Role', 'roleName'],
      ['Code', 'roleCode'],
      ['Status', 'status'],
    ]) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', `/sort/${field}`);
    }
    expect(
      within(screen.getByRole('columnheader', { name: 'Type' })).queryByRole('link'),
    ).toBeNull();
    expect(screen.getByRole('link', { name: 'Teller' })).toHaveAttribute(
      'href',
      `/admin/roles/${TELLER}`,
    );
    expect(screen.getByRole('link', { name: LONG })).toHaveAttribute('title', LONG);
    expect(screen.getByText('System role')).toBeInTheDocument();
    expect(screen.getByText('Custom role')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });
});
