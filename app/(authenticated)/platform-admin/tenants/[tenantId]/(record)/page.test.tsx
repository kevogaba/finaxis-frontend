import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

// Lettered, so its upper-case form differs from it.
const PLATFORM = 'abcdef01-2345-4678-89ab-cdef01234567';
const INSTITUTION = '17000000-0000-4000-8000-0000000000ac';

const { getTenant } = vi.hoisted(() => ({ getTenant: vi.fn() }));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/config/env.server', () => ({ serverEnv: { PLATFORM_ORGANISATION_ID: PLATFORM } }));
vi.mock('@/modules/platform-administration/tenants/tenant-service', () => ({
  getTenant: (...args: unknown[]) => getTenant(...args) as unknown,
}));

const { default: TenantOverviewPage } = await import('./page');

async function show(bootstrapStatus: string | null) {
  getTenant.mockResolvedValue({
    id: INSTITUTION,
    tenantCode: 'acme',
    displayName: 'Acme SACCO',
    countryCode: 'KE',
    baseCurrencyCode: 'KES',
    timezone: 'Africa/Nairobi',
    status: 'DRAFT',
    bootstrapStatus,
    createdAt: '2026-09-03T07:15:00Z',
    updatedAt: '2026-09-03T07:15:00Z',
  });
  const element = await TenantOverviewPage({ params: Promise.resolve({ tenantId: INSTITUTION }) });
  // The page renders nothing when the institution can't be read (the layout shows that failure).
  if (!element) throw new Error('the Overview rendered nothing');
  renderWithProviders(element);
}

describe('TenantOverviewPage', () => {
  it('writes the country as the directory and the hero do', async () => {
    await show('DRAFT');

    expect(screen.getByText('KE · Kenya')).toBeInTheDocument();
  });

  // M10: humanizeEnum would read "Draft" (and "Provisioning identity") for these.
  it.each([
    ['DRAFT', 'Not started'],
    ['PROVISIONING_IDENTITY', 'Setting up the first administrator'],
  ])('words the %s provisioning state', async (status, words) => {
    await show(status);

    expect(screen.getByText(words, { selector: '.MuiChip-label' })).toBeInTheDocument();
  });

  it('says provisioning is not tracked when the platform reports no state', async () => {
    await show(null);

    expect(screen.getByText('Not tracked')).toBeInTheDocument();
  });
});
