import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { BranchSummary } from '../branch-contract';
import { BranchDirectoryTable } from './branch-directory-table';

const LONG =
  'Old Town Branch — Moi Avenue, Tom Mboya Street and River Road Customer Service Centre';
const BRANCHES: BranchSummary[] = [
  {
    id: '44444444-4444-4444-8444-444444444444',
    branchCode: 'WESTLANDS',
    branchName: 'Westlands Branch',
    branchType: 'OPERATIONS',
    status: 'SUSPENDED',
    createdAt: '2026-07-01T08:00:00Z',
  },
  {
    id: '08000000-0000-4000-8000-000000000008',
    branchCode: 'OLD_TOWN',
    branchName: LONG,
    branchType: 'Service centre',
    status: 'CLOSED',
    createdAt: '2026-07-15T08:00:00Z',
  },
];

describe('BranchDirectoryTable', () => {
  it('links each branch, marks the sorted column, and links every sort field', () => {
    renderWithProviders(
      <BranchDirectoryTable
        branches={BRANCHES}
        sort={{ by: 'branchName', dir: 'ASC' }}
        sortHref={(field) => `/sort/${field}`}
        timeZone="Africa/Nairobi"
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Branch' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(screen.getByRole('columnheader', { name: 'Created' })).not.toHaveAttribute('aria-sort');
    for (const [label, field] of [
      ['Branch', 'branchName'],
      ['Code', 'branchCode'],
      ['Type', 'branchType'],
      ['Status', 'status'],
      ['Created', 'createdAt'],
    ]) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', `/sort/${field}`);
    }
    expect(screen.getByRole('link', { name: 'Westlands Branch' })).toHaveAttribute(
      'href',
      '/admin/branches/44444444-4444-4444-8444-444444444444',
    );
    expect(screen.getByRole('link', { name: LONG })).toHaveAttribute('title', LONG);
    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(screen.getByText('Service centre')).toBeInTheDocument();
    expect(screen.getByText('Suspended')).toBeInTheDocument();
    expect(screen.getByText('01 Jul 2026')).toBeInTheDocument();
  });
});
