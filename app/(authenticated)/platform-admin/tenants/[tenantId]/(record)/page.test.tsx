import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

// Lettered, so its upper-case form differs from it.
const PLATFORM = 'abcdef01-2345-4678-89ab-cdef01234567';
const INSTITUTION = '17000000-0000-4000-8000-0000000000ac';

const ME = '17000000-0000-4000-8000-0000000000ef';

const { getTenant } = vi.hoisted(() => ({ getTenant: vi.fn() }));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/config/env.server', () => ({ serverEnv: { PLATFORM_ORGANISATION_ID: PLATFORM } }));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () =>
    Promise.resolve({ kind: 'resolved', profile: { user_id: ME, permissions: [] } }),
}));
vi.mock('@/modules/platform-administration/tenants/tenant-service', () => ({
  getTenant: (...args: unknown[]) => getTenant(...args) as unknown,
}));

const { default: TenantOverviewPage } = await import('./page');

type Actor = { id: string; displayName: string | null } | null;

async function show(
  bootstrapStatus: string | null,
  makers: { requestedBy?: Actor; submittedBy?: Actor } = {},
) {
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
    requestedBy: null,
    submittedBy: null,
    ...makers,
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

  // BG-08: the record names who asked, so the disabled decisions explain themselves.
  it('names who requested and who submitted it, marking the signed-in administrator', async () => {
    await show('PENDING_ACTIVATION', {
      requestedBy: { id: '16000000-0000-4000-8000-000000000007', displayName: 'Otieno Operator' },
      submittedBy: { id: ME, displayName: 'Jane' },
    });

    const value = (label: string) =>
      screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
    expect(value('Requested by')).toBe('Otieno Operator');
    expect(value('Submitted by')).toBe('You (Jane)');
  });

  it('shows a dash for a maker the platform names nobody for', async () => {
    await show('DRAFT');

    const value = (label: string) =>
      screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
    expect(value('Requested by')).toBe('—');
    expect(value('Submitted by')).toBe('—');
  });
});
