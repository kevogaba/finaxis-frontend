import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, within } from '@/test/test-utils';

const PLATFORM = 'abcdef01-2345-4678-89ab-cdef01234567';

const { getCurrentContextProfile, listTenants } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  listTenants: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/platform-admin/tenants',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams('country=DD'),
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: (...args: unknown[]) => getCurrentContextProfile(...args) as unknown,
}));
vi.mock('@/config/application-context', () => ({
  isPlatformOrganisation: (id: string) => id === PLATFORM,
}));
vi.mock('@/modules/platform-administration/tenants/tenant-service', () => ({
  listTenants: (...args: unknown[]) => listTenants(...args) as unknown,
}));

const { default: TenantDirectoryPage } = await import('./page');

function tenantPage(
  items: readonly { id: string; tenantCode: string }[],
  page: { number?: number; totalItems: number; totalPages: number },
) {
  return {
    items: items.map((item) => ({
      ...item,
      displayName: item.tenantCode,
      countryCode: 'KE',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
    })),
    page: {
      number: page.number ?? 0,
      size: 10,
      totalItems: page.totalItems,
      totalPages: page.totalPages,
      hasNext: false,
      hasPrevious: (page.number ?? 0) > 0,
    },
  };
}

describe('TenantDirectoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentContextProfile.mockResolvedValue({
      kind: 'resolved',
      profile: { permissions: ['tenant.view'] },
    });
    listTenants.mockResolvedValue(tenantPage([], { totalItems: 0, totalPages: 0 }));
  });

  it('labels a country from the URL that is not canonical by its code, not as the country it aliases', async () => {
    renderWithProviders(
      await TenantDirectoryPage({ searchParams: Promise.resolve({ country: 'DD' }) }),
    );

    await userEvent.click(screen.getByRole('combobox', { name: 'Country' }));
    const options = within(screen.getByRole('listbox')).getAllByRole('option');

    expect(options.filter((option) => option.textContent === 'DD')).toHaveLength(1);
    expect(
      options
        .filter((option) => option.textContent === 'Germany')
        .map((option) => option.getAttribute('data-value')),
    ).toEqual(['DE']);
  });

  it('words the empty state by the visible total when a page holds only the platform row (BG-29)', async () => {
    // 11 backend items: the oldest, the platform organisation, sits alone on the second page.
    listTenants.mockResolvedValue(
      tenantPage([{ id: PLATFORM, tenantCode: 'platform' }], {
        number: 1,
        totalItems: 11,
        totalPages: 2,
      }),
    );

    renderWithProviders(
      await TenantDirectoryPage({ searchParams: Promise.resolve({ page: '1' }) }),
    );

    expect(screen.getByText('10 institutions')).toBeInTheDocument();
    expect(screen.getByText('No institutions on this page.')).toBeInTheDocument();
    expect(screen.queryByText(/have been created yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/match these filters/)).not.toBeInTheDocument();
  });

  it('says none have been created when only the platform organisation exists', async () => {
    listTenants.mockResolvedValue(
      tenantPage([{ id: PLATFORM, tenantCode: 'platform' }], { totalItems: 1, totalPages: 1 }),
    );

    renderWithProviders(await TenantDirectoryPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText('0 institutions')).toBeInTheDocument();
    expect(screen.getByText('No institutions have been created yet.')).toBeInTheDocument();
  });

  it('says nothing matches when a filter finds no institution', async () => {
    renderWithProviders(await TenantDirectoryPage({ searchParams: Promise.resolve({ q: 'zz' }) }));

    expect(screen.getByText('No institutions match these filters.')).toBeInTheDocument();
  });
});
