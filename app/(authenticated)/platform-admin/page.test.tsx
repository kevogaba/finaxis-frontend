import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';

const { getSelectedContextProfile, listTenants } = vi.hoisted(() => ({
  getSelectedContextProfile: vi.fn(),
  listTenants: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: vi.fn(() => new Headers()) }));
vi.mock('@/auth/context-service', () => ({
  getSelectedContextProfile: (...args: unknown[]) => getSelectedContextProfile(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/platform-administration-service', () => ({
  platformAdministrationService: {
    listTenants: (...args: unknown[]) => listTenants(...args) as unknown,
  },
}));

const { default: PlatformOverviewPage } = await import('./page');

describe('PlatformOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSelectedContextProfile.mockResolvedValue({
      context: {
        branch: { id: 'branch-1', name: 'Platform HQ' },
        module: { id: 'platform-administration', name: 'Platform Administration' },
        organization: {
          id: 'platform-org-1',
          name: 'Finaxis Platform',
        },
      },
      kind: 'resolved',
    });
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
        number: 0,
        size: 25,
        totalItems: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    });
  });

  it('renders the overview heading, active platform context, and live resource links', async () => {
    const ui = await PlatformOverviewPage({ searchParams: Promise.resolve({}) });
    renderWithProviders(ui);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Platform overview' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Active platform context')).toBeInTheDocument();
    expect(screen.getByText('Finaxis Platform')).toBeInTheDocument();
    expect(screen.getByText('Platform HQ')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open tenant directory' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants',
    );
    expect(screen.getByRole('link', { name: 'Open audit event directory' })).toHaveAttribute(
      'href',
      '/platform-admin/audit',
    );
    expect(screen.getByText(/1 tenant is available from the live directory/i)).toBeInTheDocument();
  });

  it('stays useful when the live tenant directory is currently empty', async () => {
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

    const ui = await PlatformOverviewPage({ searchParams: Promise.resolve({}) });
    renderWithProviders(ui);

    expect(
      screen.getByText(/no tenants are available in the live directory yet/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open tenant directory' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants',
    );
  });

  it('renders a backend error state without dropping the navigation links', async () => {
    listTenants.mockRejectedValueOnce(new Error('Upstream platform service unavailable.'));

    const ui = await PlatformOverviewPage({ searchParams: Promise.resolve({}) });
    renderWithProviders(ui);

    expect(screen.getByText(/live tenant data is temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByText('Upstream platform service unavailable.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open audit event directory' })).toHaveAttribute(
      'href',
      '/platform-admin/audit',
    );
  });

  it('falls back to default pagination instead of crashing on an invalid page size', async () => {
    const ui = await PlatformOverviewPage({ searchParams: Promise.resolve({ size: '101' }) });
    renderWithProviders(ui);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Platform overview' }),
    ).toBeInTheDocument();
    expect(listTenants).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ page: 0, size: 25 }),
    );
  });
});
