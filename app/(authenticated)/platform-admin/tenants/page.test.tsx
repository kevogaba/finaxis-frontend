import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, within } from '@/test/test-utils';

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
vi.mock('@/config/application-context', () => ({ isPlatformOrganisation: () => false }));
vi.mock('@/modules/platform-administration/tenants/tenant-service', () => ({
  listTenants: (...args: unknown[]) => listTenants(...args) as unknown,
}));

const { default: TenantDirectoryPage } = await import('./page');

describe('TenantDirectoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentContextProfile.mockResolvedValue({
      kind: 'resolved',
      profile: { permissions: ['tenant.view'] },
    });
    listTenants.mockResolvedValue({
      items: [],
      page: {
        number: 0,
        size: 10,
        totalItems: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false,
      },
    });
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
});
