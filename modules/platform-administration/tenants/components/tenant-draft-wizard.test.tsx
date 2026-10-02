import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { ownStyle } from '@/test/own-style';
import { renderWithProviders } from '@/test/test-utils';
import { UUID_PATTERN } from '@/lib/api/wire';
import { EMPTY_TENANT_DRAFT, type TenantFormOptions } from '../tenant-rules';
import { TenantDraftWizard } from './tenant-draft-wizard';

const { amendTenantDraft, createTenantDraft } = vi.hoisted(() => ({
  amendTenantDraft: vi.fn(),
  createTenantDraft: vi.fn(),
}));
vi.mock('../tenant-actions', () => ({
  amendTenantDraft: (...args: unknown[]) => amendTenantDraft(...args) as unknown,
  createTenantDraft: (...args: unknown[]) => createTenantDraft(...args) as unknown,
}));

type User = ReturnType<typeof userEvent.setup>;

const ORG_ID = '00000000-0000-0000-0000-000000000000';
const TENANT = '16000000-0000-4000-8000-000000000001';
const OPTIONS: TenantFormOptions = {
  countries: [
    { value: 'KE', label: 'Kenya' },
    { value: 'UG', label: 'Uganda' },
  ],
  currencies: [{ value: 'KES', label: 'KES · Kenyan Shilling' }],
  timeZones: [{ value: 'Africa/Nairobi', label: 'Africa/Nairobi' }],
};

async function pick(user: User, label: string, option: string) {
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
}

async function next(user: User, step: string) {
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('heading', { level: 2, name: step });
}

async function fillAdministrator(user: User) {
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'amina@tujenge.example');
  await user.type(screen.getByRole('textbox', { name: 'Username' }), 'amina.otieno');
  await user.type(screen.getByRole('textbox', { name: 'Full name' }), 'Amina Otieno');
  await user.type(screen.getByRole('textbox', { name: 'Phone' }), '+254712000140');
}

describe('TenantDraftWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("summarises a step's invalid fields and focuses the first one", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TenantDraftWizard defaults={EMPTY_TENANT_DRAFT} options={OPTIONS} />);

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText(
        'Check these fields: Tenant code, Display name, Country, Base currency, Timezone.',
      ),
    ).toBeInTheDocument();
    const code = screen.getByRole('textbox', { name: 'Tenant code' });
    expect(code).toHaveFocus();
    expect(code).toHaveAccessibleDescription('Use 3–32 lowercase letters, digits or hyphens.');
    expect(createTenantDraft).not.toHaveBeenCalled();
  });

  it("clears a refused field's error as soon as it is fixed, not on a later blur", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TenantDraftWizard defaults={EMPTY_TENANT_DRAFT} options={OPTIONS} />);

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    // The blur that clears a stale error would land on Continue and shift the page under the click.
    await user.type(screen.getByRole('textbox', { name: 'Tenant code' }), 'acme');
    expect(
      await screen.findByText(
        'Check these fields: Display name, Country, Base currency, Timezone.',
      ),
    ).toBeInTheDocument();

    await pick(user, 'Country', 'Kenya');
    expect(
      await screen.findByText('Check these fields: Display name, Base currency, Timezone.'),
    ).toBeInTheDocument();
  });

  it('adds no error line on a blur, so a click on Continue never lands on a moved page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TenantDraftWizard defaults={EMPTY_TENANT_DRAFT} options={OPTIONS} />);

    await user.click(screen.getByRole('textbox', { name: 'Tenant code' }));
    await user.tab();
    await user.click(screen.getByRole('combobox', { name: 'Country' }));
    await user.tab();

    // Nothing is validated until Continue: an error line added by a blur would shift the page.
    expect(screen.getByRole('textbox', { name: 'Tenant code' })).not.toHaveAccessibleDescription(
      'Use 3–32 lowercase letters, digits or hyphens.',
    );
    expect(screen.queryByText('Choose a country.')).toBeNull();
  });

  it("shows an invalid choice's error right after the choice, and a valid choice clears it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TenantDraftWizard defaults={EMPTY_TENANT_DRAFT} options={OPTIONS} />);

    await pick(user, 'Country', 'Kenya');
    expect(screen.queryByText('Choose a country.')).toBeNull();
    // Emptying a required choice is a choice too: its refusal appears at once, before any blur.
    await user.clear(screen.getByRole('combobox', { name: 'Country' }));
    expect(await screen.findByText('Choose a country.')).toBeInTheDocument();

    await pick(user, 'Country', 'Uganda');
    await waitFor(() => {
      expect(screen.queryByText('Choose a country.')).toBeNull();
    });
  });

  it('disables the review Edit buttons while the save is pending', async () => {
    const user = userEvent.setup();
    // Always settled in `finally`: a save left pending would hold React's global action queue and
    // starve the tests after this one.
    let settle: (result: unknown) => void = () => undefined;
    createTenantDraft.mockReturnValueOnce(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    renderWithProviders(
      <TenantDraftWizard
        defaults={{
          ...EMPTY_TENANT_DRAFT,
          tenantCode: 'acme',
          displayName: 'Tujenge Traders SACCO',
          countryCode: 'KE',
          baseCurrencyCode: 'KES',
          timezone: 'Africa/Nairobi',
          adminEmail: 'amina@tujenge.example',
          adminUsername: 'amina.otieno',
          adminDisplayName: 'Amina Otieno',
          adminPhone: '+254712000140',
        }}
        options={OPTIONS}
      />,
    );

    await next(user, 'First administrator');
    await next(user, 'Initial settings');
    await next(user, 'Review');
    expect(screen.getByRole('button', { name: 'Edit institution' })).toBeEnabled();
    try {
      await user.click(screen.getByRole('button', { name: 'Create draft' }));
      await waitFor(() => {
        expect(createTenantDraft).toHaveBeenCalledTimes(1);
      });
      for (const name of [
        'Edit institution',
        'Edit first administrator',
        'Edit initial settings',
      ]) {
        expect(screen.getByRole('button', { name })).toBeDisabled();
      }
    } finally {
      settle({
        ok: false,
        formError: 'The platform did not respond.',
        fieldErrors: {},
        code: null,
        requestId: null,
      });
    }
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit institution' })).toBeEnabled();
    });
  });

  it("shows the review's unset answers muted and in regular weight, apart from real values", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TenantDraftWizard
        defaults={{
          ...EMPTY_TENANT_DRAFT,
          tenantCode: 'acme',
          displayName: 'Tujenge Traders SACCO',
          countryCode: 'KE',
          baseCurrencyCode: 'KES',
          timezone: 'Africa/Nairobi',
          adminEmail: 'amina@tujenge.example',
          adminUsername: 'amina.otieno',
          adminDisplayName: 'Amina Otieno',
          adminPhone: '+254712000140',
        }}
        options={OPTIONS}
      />,
    );

    await next(user, 'First administrator');
    await next(user, 'Initial settings');
    await next(user, 'Review');

    // Legal name, registration number, and the three optional settings.
    const unset = screen.getAllByText('Not set');
    expect(unset).toHaveLength(5);
    for (const element of unset) {
      expect(ownStyle(element, 'color')).toContain('--finaxis-palette-text-secondary');
      expect(ownStyle(element, 'font-weight')).toBe('400');
    }
  });

  it('walks every step, returns to a taken code, and retries the create with the same key', async () => {
    const user = userEvent.setup();
    createTenantDraft
      .mockResolvedValueOnce({
        ok: false,
        formError: 'This tenant code is already in use. Choose another.',
        fieldErrors: { tenantCode: 'This code is already in use.' },
        code: 'tenant_code_taken',
        requestId: null,
      })
      .mockResolvedValueOnce({
        ok: false,
        formError: "The platform didn't respond as expected. Try again in a moment.",
        fieldErrors: {},
        code: null,
        requestId: 'req-5',
      });
    renderWithProviders(
      <TenantDraftWizard
        defaults={EMPTY_TENANT_DRAFT}
        options={OPTIONS}
        contextOrganisationId={ORG_ID}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: 'Tenant code' }), 'acme');
    await user.type(screen.getByRole('textbox', { name: 'Display name' }), 'Tujenge Traders SACCO');
    await pick(user, 'Country', 'Kenya');
    await pick(user, 'Base currency', 'KES · Kenyan Shilling');
    await pick(user, 'Timezone', 'Africa/Nairobi');
    await next(user, 'First administrator');
    await fillAdministrator(user);
    await user.click(screen.getByRole('checkbox', { name: 'Send application invite' }));
    await next(user, 'Initial settings');
    await user.type(screen.getByRole('textbox', { name: 'Audit retention (days)' }), '365');
    await next(user, 'Review');
    expect(screen.getByRole('region', { name: 'Institution' })).toHaveTextContent('Kenya');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    // BG-07: the pre-check's refusal returns the wizard to the code, focused.
    const code = await screen.findByRole('textbox', { name: 'Tenant code' });
    await waitFor(() => {
      expect(code).toHaveFocus();
    });
    expect(code).toHaveAccessibleDescription('This code is already in use.');
    expect(Object.fromEntries(createTenantDraft.mock.calls[0]?.[1] as FormData)).toEqual({
      idempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown,
      contextOrganisationId: ORG_ID,
      tenantCode: 'acme',
      displayName: 'Tujenge Traders SACCO',
      legalName: '',
      registrationNumber: '',
      countryCode: 'KE',
      baseCurrencyCode: 'KES',
      timezone: 'Africa/Nairobi',
      businessDate: '',
      adminEmail: 'amina@tujenge.example',
      adminUsername: 'amina.otieno',
      adminDisplayName: 'Amina Otieno',
      adminPhone: '+254712000140',
      adminSendApplicationInvite: 'true',
      defaultTimezoneSetting: '',
      baseCurrencySetting: '',
      auditRetentionDays: '365',
    });

    await user.clear(code);
    await user.type(code, 'tujenge-traders');
    await next(user, 'First administrator');
    await next(user, 'Initial settings');
    await next(user, 'Review');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    // Nothing to return to: the failure's Alert takes focus, with its reference.
    const failed = (await screen.findByText(/Reference: req-5/)).closest('[role="alert"]');
    await waitFor(() => {
      expect(failed).toHaveFocus();
    });
    const [first, second] = createTenantDraft.mock.calls.map((call) => call[1] as FormData);
    // One key per wizard: the retry replays safely (index item 2).
    expect(second?.get('idempotencyKey')).toBe(first?.get('idempotencyKey'));
    expect(second?.get('tenantCode')).toBe('tujenge-traders');
  });

  it('focuses a refused choice field, and Edit on the review returns to its step with the answers kept', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TenantDraftWizard defaults={EMPTY_TENANT_DRAFT} options={OPTIONS} />);

    await user.type(screen.getByRole('textbox', { name: 'Tenant code' }), 'acme');
    await user.type(screen.getByRole('textbox', { name: 'Display name' }), 'Tujenge Traders SACCO');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByText('Check these fields: Country, Base currency, Timezone.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveFocus();

    await pick(user, 'Country', 'Kenya');
    await pick(user, 'Base currency', 'KES · Kenyan Shilling');
    await pick(user, 'Timezone', 'Africa/Nairobi');
    await next(user, 'First administrator');
    await fillAdministrator(user);
    await next(user, 'Initial settings');
    await next(user, 'Review');
    await user.click(screen.getByRole('button', { name: 'Edit institution' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Institution' })).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Tenant code' })).toHaveValue('acme');
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveValue('Kenya');
  });

  it('shows a safe message, never the error text, when the action itself rejects', async () => {
    const user = userEvent.setup();
    createTenantDraft.mockRejectedValueOnce(new Error('socket hang up'));
    renderWithProviders(
      <TenantDraftWizard
        defaults={{
          ...EMPTY_TENANT_DRAFT,
          tenantCode: 'acme',
          displayName: 'Tujenge Traders SACCO',
          countryCode: 'KE',
          baseCurrencyCode: 'KES',
          timezone: 'Africa/Nairobi',
          adminEmail: 'amina@tujenge.example',
          adminUsername: 'amina.otieno',
          adminDisplayName: 'Amina Otieno',
          adminPhone: '+254712000140',
        }}
        options={OPTIONS}
      />,
    );

    await next(user, 'First administrator');
    await next(user, 'Initial settings');
    await next(user, 'Review');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    const alert = (await screen.findByText(/We couldn't confirm this change/)).closest(
      '[role="alert"]',
    );
    await waitFor(() => {
      expect(alert).toHaveFocus();
    });
    expect(screen.queryByText(/socket hang up/)).toBeNull();
  });

  it('amends in three steps, with the code read-only and no business date or settings', async () => {
    const user = userEvent.setup();
    amendTenantDraft.mockResolvedValueOnce({ ok: true });
    renderWithProviders(
      <TenantDraftWizard
        tenantId={TENANT}
        defaults={{
          ...EMPTY_TENANT_DRAFT,
          tenantCode: 'umoja-teachers',
          displayName: 'Umoja Teachers SACCO',
          countryCode: 'KE',
          baseCurrencyCode: 'KES',
          timezone: 'Africa/Nairobi',
        }}
        options={OPTIONS}
        contextOrganisationId={ORG_ID}
      />,
    );

    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('textbox', { name: 'Tenant code' })).toHaveAttribute('readonly');
    expect(screen.queryByLabelText('First business date')).toBeNull();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${TENANT}`,
    );

    await next(user, 'First administrator');
    await fillAdministrator(user);
    await next(user, 'Review');
    expect(screen.queryByRole('region', { name: 'Initial settings' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      expect(amendTenantDraft).toHaveBeenCalledTimes(1);
    });
    const sent = amendTenantDraft.mock.calls[0]?.[1] as FormData;
    expect(sent.get('tenantId')).toBe(TENANT);
    expect(sent.get('tenantCode')).toBe('umoja-teachers');
    // The cross-tab guard (07's I2): a dropped forward would silently disable it.
    expect(sent.get('contextOrganisationId')).toBe(ORG_ID);
    expect(sent.has('businessDate')).toBe(false);
    expect(sent.has('auditRetentionDays')).toBe(false);
    expect(createTenantDraft).not.toHaveBeenCalled();
  });
});
