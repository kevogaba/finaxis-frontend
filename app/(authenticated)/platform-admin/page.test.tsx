import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendApiError } from '@/auth/backend-api';
import { renderWithProviders, screen } from '@/test/test-utils';

const { getCurrentContextProfile, listTenants } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  listTenants: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: (...args: unknown[]) => getCurrentContextProfile(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/tenants/tenant-service', () => ({
  listTenants: (...args: unknown[]) => listTenants(...args) as unknown,
}));

const { default: PlatformOverviewPage } = await import('./page');

const directory = (totalItems: number) => ({
  items: [],
  page: {
    number: 0,
    size: 1,
    totalItems,
    totalPages: totalItems,
    hasNext: totalItems > 1,
    hasPrevious: false,
  },
});

describe('PlatformOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentContextProfile.mockResolvedValue({
      context: {
        branch: { id: 'branch-1', name: 'Platform HQ' },
        module: { id: 'platform-administration', name: 'Platform Administration' },
        organization: { id: 'platform-org-1', name: 'Finaxis Platform' },
      },
      kind: 'resolved',
    });
  });

  it('counts the institutions from one size-1 read, leaving out the platform organisation (BG-29)', async () => {
    listTenants.mockResolvedValueOnce(directory(2));
    renderWithProviders(await PlatformOverviewPage());

    expect(
      screen.getByRole('heading', { level: 1, name: 'Platform overview' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Finaxis Platform')).toBeInTheDocument();
    expect(screen.getByText('Platform HQ')).toBeInTheDocument();
    expect(screen.getByText('1 tenant is available from the live directory.')).toBeInTheDocument();
    expect(listTenants).toHaveBeenCalledWith({
      sort: { by: 'createdAt', dir: 'DESC' },
      page: 0,
      size: 1,
    });
    expect(screen.getByRole('link', { name: 'Open tenant directory' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants',
    );
  });

  it('says the directory is empty when only the platform organisation exists', async () => {
    listTenants.mockResolvedValueOnce(directory(1));
    renderWithProviders(await PlatformOverviewPage());

    expect(
      screen.getByText('No tenants are available in the live directory yet.'),
    ).toBeInTheDocument();
  });

  it('renders the safe error state with its reference, keeping the directory link', async () => {
    listTenants.mockRejectedValueOnce(new BackendApiError(503, { requestId: 'req-9' }));
    renderWithProviders(await PlatformOverviewPage());

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Reference: req-9')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open tenant directory' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants',
    );
  });
});
