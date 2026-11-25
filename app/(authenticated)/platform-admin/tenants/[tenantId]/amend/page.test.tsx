import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
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

// The page said this before the platform returned the draft (BG-14).
const RE_ENTER = /enter them again/;

function sessionWith(permissions: string[]) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { permissions },
    context: { organization: { id: ORG } },
  });
}

/** `stored`: the detail's drafted administrator, which it returns only for a draft. */
function tenantWith(status: string, stored = true) {
  getTenant.mockResolvedValue({
    id: TENANT,
    tenantCode: 'umoja-teachers',
    displayName: 'Umoja Teachers SACCO',
    legalName: 'Umoja Teachers Co-operative Society Ltd',
    registrationNumber: null,
    countryCode: 'KE',
    baseCurrencyCode: 'KES',
    timezone: 'Africa/Nairobi',
    status,
    statusReason: null,
    bootstrapStatus: null,
    bootstrapFailureCode: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    admin:
      status === 'DRAFT' && stored
        ? {
            email: 'amina@umoja.example',
            username: 'amina.otieno',
            displayName: 'Amina Otieno',
            phoneE164: '+254712000140',
            sendApplicationInvite: true,
          }
        : null,
    requestedBy: null,
    submittedBy: null,
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

  // BG-14: the draft comes back whole, so nothing is asked again.
  it('opens the wizard pre-filled from the draft, asking for nothing again', async () => {
    await renderPage();

    expect(screen.getByRole('form', { name: 'Amend tenant draft' })).toBeInTheDocument();
    expect(screen.queryByText(RE_ENTER)).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveValue(
      'Umoja Teachers SACCO',
    );
    expect(screen.getByRole('textbox', { name: 'Legal name' })).toHaveValue(
      'Umoja Teachers Co-operative Society Ltd',
    );
    expect(screen.getByRole('textbox', { name: 'Registration number' })).toHaveValue('');
  });

  // A draft with no bootstrap record: the platform returns no administrator and its amend would
  // discard one, so the wizard asks for none.
  it('says the platform keeps no administrator for a draft without one', async () => {
    const user = userEvent.setup();
    tenantWith('DRAFT', false);
    await renderPage();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByText(
        "The platform keeps no draft administrator for this institution, so there's none to change here.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Email' })).toBeNull();
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
