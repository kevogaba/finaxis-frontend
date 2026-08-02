import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { ApiPage, TenantListQuery, TenantSummary } from '../platform-administration.types';
import { TenantTable } from './tenant-table';

const page = (
  items: readonly TenantSummary[],
  totalItems = items.length,
): ApiPage<TenantSummary> => ({
  items,
  page: {
    number: 0,
    size: 25,
    totalItems,
    totalPages: totalItems > 0 ? 1 : 0,
    hasNext: false,
    hasPrevious: false,
  },
});

describe('TenantTable', () => {
  it('renders tenant metadata, optional values, and pagination filters', () => {
    const query: TenantListQuery = {
      country: 'KE',
      createdFrom: '2026-01-01',
      createdTo: '2026-12-31',
      q: 'Acme',
      size: 10,
      sortBy: 'displayName',
      sortDir: 'desc',
      status: 'ACTIVE',
    };

    renderWithProviders(
      <TenantTable
        pathname="/platform-admin/tenants"
        query={query}
        tenantsPage={page([
          {
            id: 'tenant-1',
            tenantCode: 'ACME',
            displayName: 'Acme SACCO',
            countryCode: 'KE',
            status: 'ACTIVE',
            bootstrapStatus: 'PARTIAL_SUCCESS',
            createdAt: '2026-07-01T08:00:00Z',
            updatedAt: 'not-a-date',
          },
          {
            id: 'tenant-2',
            tenantCode: 'BETA',
            displayName: 'Beta Cooperative',
            countryCode: 'UG',
            status: 'DRAFT',
          },
        ])}
      />,
    );

    expect(screen.getByText('Acme SACCO')).toBeInTheDocument();
    expect(screen.getByText('ACME')).toBeInTheDocument();
    expect(screen.getByText('Bootstrap: PARTIAL SUCCESS')).toBeInTheDocument();
    expect(screen.getByText('Beta Cooperative')).toBeInTheDocument();
    expect(screen.getByText('Not yet updated')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(4);
    expect(screen.getByText('not-a-date')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-01-01')).toHaveAttribute('name', 'createdFrom');
    expect(screen.getByDisplayValue('2026-12-31')).toHaveAttribute('name', 'createdTo');
    expect(screen.getByDisplayValue('displayName')).toHaveAttribute('name', 'sortBy');
    expect(screen.getByDisplayValue('desc')).toHaveAttribute('name', 'sortDir');
    expect(screen.getByRole('link', { name: 'Acme SACCO' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants/tenant-1',
    );
  });

  it('renders the unfiltered empty state and uses defaults for an incomplete query', () => {
    renderWithProviders(
      <TenantTable pathname="/platform-admin/tenants" query={{}} tenantsPage={page([])} />,
    );

    expect(
      screen.getByText('No tenants are available in the live directory yet.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Clear filters' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Apply filters' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('25')).toHaveAttribute('name', 'size');
  });

  it('renders the filtered empty state with a clear-filters action', () => {
    renderWithProviders(
      <TenantTable
        pathname="/platform-admin/tenants"
        query={{ q: 'Missing' }}
        tenantsPage={page([])}
      />,
    );

    expect(screen.getByText('No tenants matched the current filters.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Clear filters' })[1]).toHaveAttribute(
      'href',
      '/platform-admin/tenants',
    );
  });
});
