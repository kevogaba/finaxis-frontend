import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
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

interface Overrides {
  requestedBy?: Actor;
  submittedBy?: Actor;
  status?: string;
  statusReason?: string | null;
  legalName?: string | null;
  registrationNumber?: string | null;
}

async function show(bootstrapStatus: string | null, overrides: Overrides = {}) {
  getTenant.mockResolvedValue({
    id: INSTITUTION,
    tenantCode: 'acme',
    displayName: 'Acme SACCO',
    legalName: null,
    registrationNumber: null,
    countryCode: 'KE',
    baseCurrencyCode: 'KES',
    timezone: 'Africa/Nairobi',
    status: 'DRAFT',
    statusReason: null,
    bootstrapStatus,
    createdAt: '2026-09-03T07:15:00Z',
    updatedAt: '2026-09-03T07:15:00Z',
    admin: null,
    requestedBy: null,
    submittedBy: null,
    ...overrides,
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

const value = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
const RETURNED = 'Returned for changes.';

// BG-14: the detail returns them since platform #166.
describe('TenantOverviewPage: the legal identity', () => {
  it('shows the legal name and registration number', async () => {
    await show('DRAFT', {
      legalName: 'Acme Savings and Credit Co-operative Society Ltd',
      registrationNumber: 'CS/2019/0042',
    });

    expect(value('Legal name')).toBe('Acme Savings and Credit Co-operative Society Ltd');
    expect(value('Registration number')).toBe('CS/2019/0042');
    // No more "the platform doesn't return them".
    expect(screen.queryByText(/doesn't return/)).toBeNull();
  });

  it.each([
    ['never recorded', null],
    // A blank one stored before the platform trimmed it reads as unset, never as a gap.
    ['stored blank', ''],
  ])('shows a dash for each one %s', async (_case, stored) => {
    await show('DRAFT', { legalName: stored, registrationNumber: stored });

    expect(value('Legal name')).toBe('—');
    expect(value('Registration number')).toBe('—');
  });
});

// BG-01: a draft carries a reason only when a checker returned it.
describe('TenantOverviewPage: a returned draft', () => {
  it('says it was returned for changes, and why, as a note', async () => {
    await show('DRAFT', { statusReason: 'Attach the registration certificate.' });

    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(`${RETURNED} Attach the registration certificate.`);
    expect(within(note).getByText(RETURNED).tagName).toBe('STRONG');
  });

  it.each([
    ['a draft never returned', { statusReason: null }],
    // Every transition overwrites the reason: a rejection's or a suspension's is no return.
    ['a rejected request', { status: 'REJECTED', statusReason: 'Duplicate request' }],
    ['a suspended institution', { status: 'SUSPENDED', statusReason: 'Compliance review' }],
  ])('says nothing of a return for %s', async (_case, overrides) => {
    await show('DRAFT', overrides);

    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.queryByText(RETURNED)).toBeNull();
  });
});
