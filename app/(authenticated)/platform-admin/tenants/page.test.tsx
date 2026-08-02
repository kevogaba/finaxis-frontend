import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';

const { listTenants } = vi.hoisted(() => ({
  listTenants: vi.fn(),
}));

const requestHeaders = new Headers({ cookie: 'finaxis.context=platform-context' });

vi.mock('next/headers', () => ({ headers: vi.fn(() => requestHeaders) }));
vi.mock('@/modules/platform-administration/platform-administration-service', () => ({
  platformAdministrationService: {
    listTenants: (...args: unknown[]) => listTenants(...args) as unknown,
  },
}));

const { default: TenantDirectoryPage } = await import('./page');

describe('TenantDirectoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTenants.mockResolvedValue({
      items: [
        {
          id: 'tenant-1',
          tenantCode: 'ACME',
          displayName: 'Acme SACCO',
          countryCode: 'KE',
          baseCurrencyCode: 'KES',
          timezone: 'Africa/Nairobi',
          status: 'ACTIVE',
          bootstrapStatus: 'SUCCESS',
          createdAt: '2026-07-01T08:00:00Z',
          updatedAt: '2026-07-24T08:00:00Z',
        },
      ],
      page: {
        number: 1,
        size: 25,
        totalItems: 75,
        totalPages: 3,
        hasNext: true,
        hasPrevious: true,
      },
    });
  });

  it('parses URL filters, renders the tenant table, and preserves filters in pagination links', async () => {
    const ui = await TenantDirectoryPage({
      searchParams: Promise.resolve({
        country: 'KE',
        page: '1',
        q: 'Acme',
        size: '25',
        status: 'ACTIVE',
      }),
    });
    renderWithProviders(ui);

    expect(listTenants).toHaveBeenCalledWith(requestHeaders, {
      country: 'KE',
      createdFrom: undefined,
      createdTo: undefined,
      page: 1,
      q: 'Acme',
      size: 25,
      sortBy: undefined,
      sortDir: 'asc',
      status: 'ACTIVE',
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Tenant directory' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search tenants')).toHaveValue('Acme');
    expect(screen.getByLabelText('Status')).toHaveValue('ACTIVE');
    expect(screen.getByLabelText('Country')).toHaveValue('KE');
    expect(screen.getByRole('columnheader', { name: 'Tenant' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Country' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Acme SACCO' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants/tenant-1',
    );
    expect(screen.getByLabelText('Status: Active')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to previous page' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants?country=KE&q=Acme&size=25&sortDir=asc&status=ACTIVE&page=0',
    );
    expect(screen.getByRole('link', { name: 'Go to next page' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants?country=KE&q=Acme&size=25&sortDir=asc&status=ACTIVE&page=2',
    );
  });

  it('renders an empty state when no tenants match the current filters', async () => {
    listTenants.mockResolvedValueOnce({
      items: [],
      page: {
        number: 0,
        size: 25,
        totalItems: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false,
      },
    });

    const ui = await TenantDirectoryPage({
      searchParams: Promise.resolve({ q: 'Missing tenant', status: 'SUSPENDED' }),
    });
    renderWithProviders(ui);

    expect(screen.getByText(/no tenants matched the current filters/i)).toBeInTheDocument();
  });

  it('renders a backend error state instead of a broken table', async () => {
    listTenants.mockRejectedValueOnce(new Error('Tenant service timed out.'));

    const ui = await TenantDirectoryPage({ searchParams: Promise.resolve({}) });
    renderWithProviders(ui);

    expect(screen.getByText(/tenant directory is temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByText('Tenant service timed out.')).toBeInTheDocument();
  });
});
