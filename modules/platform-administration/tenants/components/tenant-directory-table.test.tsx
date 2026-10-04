import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { TenantSummary } from '../tenant-contract';
import { TenantDirectoryTable } from './tenant-directory-table';

const LONG =
  'Nairobi Metropolitan Public Service Teachers and Allied Workers Savings and Credit Co-op Society Ltd';
const TENANTS: TenantSummary[] = [
  {
    id: '16000000-0000-4000-8000-000000000005',
    tenantCode: 'kilimo-bora',
    displayName: 'Kilimo Bora SACCO',
    countryCode: 'KE',
    status: 'SUSPENDED',
    createdAt: '2026-08-10T08:00:00Z',
  },
  {
    id: '16000000-0000-4000-8000-000000000006',
    tenantCode: 'nairobi-metro-teachers',
    displayName: LONG,
    countryCode: 'TZ',
    status: 'REJECTED',
    createdAt: '2026-08-01T08:00:00Z',
  },
];

describe('TenantDirectoryTable', () => {
  it('links each institution and every sortable header, and marks the sorted column', () => {
    renderWithProviders(
      <TenantDirectoryTable
        tenants={TENANTS}
        sort={{ by: 'displayName', dir: 'ASC' }}
        sortHref={(field) => `/sort/${field}`}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Institution' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    for (const [label, field] of [
      ['Institution', 'displayName'],
      ['Code', 'tenantCode'],
      ['Country', 'countryCode'],
      ['Created (UTC)', 'createdAt'],
    ] as const) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', `/sort/${field}`);
    }
    // Status isn't in the sort allow-list, and an unknown sort_by is a backend 500 (BG-07).
    expect(
      within(screen.getByRole('columnheader', { name: 'Lifecycle' })).queryByRole('link'),
    ).toBeNull();
    expect(screen.getByRole('link', { name: 'Kilimo Bora SACCO' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants/16000000-0000-4000-8000-000000000005',
    );
    expect(screen.getByText('Suspended')).toBeInTheDocument();
    expect(screen.getByText('10 Aug 2026')).toBeInTheDocument();
  });

  it('keeps a long name and the country on one line, with the full value in title (index item 4)', () => {
    renderWithProviders(
      <TenantDirectoryTable
        tenants={TENANTS}
        sort={{ by: 'createdAt', dir: 'DESC' }}
        sortHref={() => '/'}
      />,
    );

    expect(screen.getByRole('link', { name: LONG })).toHaveAttribute('title', LONG);
    expect(screen.getByText('TZ · Tanzania')).toHaveAttribute('title', 'TZ · Tanzania');
  });
});
