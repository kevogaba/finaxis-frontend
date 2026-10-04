import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

// Lettered, so its upper-case form differs from it.
const PLATFORM = 'abcdef01-2345-4678-89ab-cdef01234567';
const INSTITUTION = '17000000-0000-4000-8000-0000000000ac';

const { getCurrentContextProfile, getTenant } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  getTenant: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  usePathname: () => `/platform-admin/tenants/${INSTITUTION}`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/config/env.server', () => ({ serverEnv: { PLATFORM_ORGANISATION_ID: PLATFORM } }));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: (...args: unknown[]) => getCurrentContextProfile(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/tenants/tenant-service', () => ({
  getTenant: (...args: unknown[]) => getTenant(...args) as unknown,
}));
// The hero's dialogs import the Server Actions; nothing here submits one.
vi.mock('@/modules/platform-administration/tenants/tenant-actions', () => ({
  approveTenant: vi.fn(),
  deprovisionTenant: vi.fn(),
  reactivateTenant: vi.fn(),
  rejectTenant: vi.fn(),
  submitTenant: vi.fn(),
  suspendTenant: vi.fn(),
}));

const { default: TenantRecordLayout } = await import('./layout');

async function show(permissions: string[]) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { permissions, user_id: '17000000-0000-4000-8000-0000000000ef' },
    context: { organization: { id: PLATFORM, name: 'Platform' }, branch: null },
  });
  renderWithProviders(
    await TenantRecordLayout({
      children: <p>Tab body</p>,
      params: Promise.resolve({ tenantId: INSTITUTION }),
    }),
  );
}

const tabNames = () =>
  within(screen.getByRole('navigation', { name: 'Acme SACCO sections' }))
    .getAllByRole('tab')
    .map((tab) => tab.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  getTenant.mockResolvedValue({
    id: INSTITUTION,
    tenantCode: 'acme',
    displayName: 'Acme SACCO',
    countryCode: 'KE',
    status: 'ACTIVE',
  });
});

describe('TenantRecordLayout: the tabs', () => {
  it('adds Branches and Users after Provisioning, each linking to its route', async () => {
    await show(['tenant.view', 'branch.view', 'user.view']);

    expect(tabNames()).toEqual(['Overview', 'Provisioning', 'Branches', 'Users']);
    expect(screen.getByRole('tab', { name: 'Branches' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${INSTITUTION}/branches`,
    );
    expect(screen.getByRole('tab', { name: 'Users' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${INSTITUTION}/users`,
    );
  });

  it.each([
    [
      ['tenant.view', 'user.view'],
      ['Overview', 'Provisioning', 'Users'],
    ],
    [
      ['tenant.view', 'branch.view'],
      ['Overview', 'Provisioning', 'Branches'],
    ],
    [['tenant.view'], ['Overview', 'Provisioning']],
  ])('offers a tab only with its view code: %j', async (permissions, tabs) => {
    await show(permissions);

    expect(tabNames()).toEqual(tabs);
  });
});

describe('TenantRecordLayout: the hero', () => {
  it('writes the subtitle as the tenant code, then the country as the Overview does', async () => {
    await show(['tenant.view']);

    expect(screen.getByText('acme · KE · Kenya')).toBeInTheDocument();
  });
});
