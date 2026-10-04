import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';

const TENANT = '16000000-0000-4000-8000-000000000001';
const ORG = '00000000-0000-0000-0000-000000000000';

const { getCurrentContextProfile, getTenant } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  getTenant: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/config/env.server', () => ({
  serverEnv: { PLATFORM_ORGANISATION_ID: 'abcdef01-2345-4678-89ab-cdef01234567' },
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: (...args: unknown[]) => getCurrentContextProfile(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/tenants/tenant-service', () => ({
  getTenant: (...args: unknown[]) => getTenant(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/tenants/tenant-actions', () => ({
  amendTenantDraft: vi.fn(),
  createTenantDraft: vi.fn(),
}));

const { default: AmendTenantPage } = await import('./page');

const RE_ENTER = /so enter them again/;

function sessionWith(permissions: string[]) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { permissions },
    context: { organization: { id: ORG } },
  });
}

function tenantWith(status: string) {
  getTenant.mockResolvedValue({
    id: TENANT,
    tenantCode: 'umoja-teachers',
    displayName: 'Umoja Teachers SACCO',
    countryCode: 'KE',
    baseCurrencyCode: 'KES',
    timezone: 'Africa/Nairobi',
    status,
    bootstrapStatus: null,
    bootstrapFailureCode: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });
}

async function renderPage() {
  renderWithProviders(await AmendTenantPage({ params: Promise.resolve({ tenantId: TENANT }) }));
}

describe('AmendTenantPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantWith('DRAFT');
    sessionWith(['tenant.view', 'tenant.update_draft']);
  });

  it('tells the wizard branch to enter the unreadable details again', async () => {
    await renderPage();

    expect(screen.getByText(RE_ENTER)).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Amend tenant draft' })).toBeInTheDocument();
  });

  it('gives a session without the amend permission no form instructions, and a way back', async () => {
    sessionWith(['tenant.view']);

    await renderPage();

    expect(screen.getByText("You don't have permission")).toBeInTheDocument();
    expect(screen.queryByText(RE_ENTER)).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to the record' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${TENANT}`,
    );
  });

  it('gives a tenant past the draft stage no form instructions, and a way back', async () => {
    tenantWith('ACTIVE');

    await renderPage();

    expect(screen.getByText('Only a draft can be amended')).toBeInTheDocument();
    expect(screen.queryByText(RE_ENTER)).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to the record' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${TENANT}`,
    );
  });
});
