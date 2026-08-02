import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { renderWithProviders, screen } from '@/test/test-utils';

const { getTenant } = vi.hoisted(() => ({
  getTenant: vi.fn(),
}));

const requestHeaders = new Headers({ cookie: 'finaxis.context=platform-context' });

vi.mock('next/headers', () => ({ headers: vi.fn(() => requestHeaders) }));
vi.mock('@/modules/platform-administration/platform-administration-service', () => ({
  platformAdministrationService: {
    getTenant: (...args: unknown[]) => getTenant(...args) as unknown,
  },
}));

const { default: TenantDetailPage } = await import('./page');

const tenant = {
  id: '99999999-9999-4999-8999-999999999999',
  tenantCode: 'ACME',
  displayName: 'Acme SACCO',
  countryCode: 'KE',
  baseCurrencyCode: 'KES',
  timezone: 'Africa/Nairobi',
  status: 'ACTIVE',
  bootstrapStatus: 'SUCCESS',
  bootstrapFailureCode: null,
  createdAt: '2026-07-01T08:00:00Z',
  updatedAt: '2026-07-24T08:00:00Z',
};

describe('TenantDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders tenant identity and lifecycle fields', async () => {
    getTenant.mockResolvedValueOnce(tenant);

    const ui = await TenantDetailPage({
      params: Promise.resolve({ tenantId: tenant.id }),
    });
    renderWithProviders(ui);

    expect(getTenant).toHaveBeenCalledWith(requestHeaders, tenant.id);
    expect(screen.getAllByRole('heading', { name: 'Acme SACCO' }).length).toBeGreaterThan(0);
    expect(screen.getByText('ACME')).toBeInTheDocument();
    expect(screen.getByText('KE')).toBeInTheDocument();
    expect(screen.getByText('KES')).toBeInTheDocument();
    expect(screen.getByLabelText('Status: Active')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tenant directory' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants',
    );
  });

  it('renders a not-found state for an unknown tenant id instead of a broken page', async () => {
    getTenant.mockRejectedValueOnce(Object.assign(new Error('Not found'), { status: 404 }));

    const ui = await TenantDetailPage({
      params: Promise.resolve({ tenantId: tenant.id }),
    });
    renderWithProviders(ui);

    expect(
      screen.getByText(/this tenant could not be found in the live directory/i),
    ).toBeInTheDocument();
  });

  it('renders a not-found state for a malformed tenant id instead of crashing', async () => {
    getTenant.mockRejectedValueOnce(new ZodError([]));

    const ui = await TenantDetailPage({
      params: Promise.resolve({ tenantId: 'not-a-uuid' }),
    });
    renderWithProviders(ui);

    expect(
      screen.getByText(/this tenant could not be found in the live directory/i),
    ).toBeInTheDocument();
  });

  it('renders a backend error state instead of a broken page', async () => {
    getTenant.mockRejectedValueOnce(new Error('Tenant service timed out.'));

    const ui = await TenantDetailPage({
      params: Promise.resolve({ tenantId: tenant.id }),
    });
    renderWithProviders(ui);

    expect(screen.getByText(/tenant detail is temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByText('Tenant service timed out.')).toBeInTheDocument();
  });
});
