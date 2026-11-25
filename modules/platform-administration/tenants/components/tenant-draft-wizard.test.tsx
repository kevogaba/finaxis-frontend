import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { ownStyle } from '@/test/own-style';
import { renderWithProviders } from '@/test/test-utils';
import { UUID_PATTERN } from '@/lib/api/wire';
import {
  EMPTY_TENANT_DRAFT,
  type TenantDraftValues,
  type TenantFormOptions,
} from '../tenant-rules';
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

    // Legal name, registration number, and the two optional settings.
    const unset = screen.getAllByText('Not set');
    expect(unset).toHaveLength(4);
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
    await user.type(screen.getByRole('textbox', { name: 'Audit retention (days)' }), '3650');
    await next(user, 'Review');
    expect(screen.getByRole('region', { name: 'Institution' })).toHaveTextContent('Kenya');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    // BG-07: the duplicate-code refusal returns the wizard to the code, focused.
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
      auditRetentionDays: '3650',
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

  it('returns to the institution after a currency refusal', async () => {
    const user = userEvent.setup();
    const refused = "The platform can't settle in this currency.";
    createTenantDraft.mockResolvedValueOnce({
      ok: false,
      formError: `${refused} Choose another base currency.`,
      fieldErrors: { baseCurrencyCode: refused },
      code: 'accounting.currency_invalid',
      requestId: null,
    });
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

    // The earliest marked step, with its field marked.
    expect(await screen.findByRole('heading', { level: 2, name: 'Institution' })).toBeVisible();
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Base currency' })).toHaveAccessibleDescription(
        refused,
      );
    });
  });

  it("asks for no base currency setting (it follows the institution's) and bounds retention", async () => {
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
    expect(screen.queryByRole('combobox', { name: /Base currency/ })).toBeNull();
    const retention = screen.getByRole('textbox', { name: 'Audit retention (days)' });
    await user.type(retention, '365');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByText('Check these fields: Audit retention (days).'),
    ).toBeInTheDocument();
    expect(retention).toHaveAccessibleDescription('Enter 2555 to 36500 days.');

    await user.clear(retention);
    await user.type(retention, '2555');
    await next(user, 'Review');
    expect(screen.getByRole('region', { name: 'Initial settings' })).not.toHaveTextContent(
      'Base currency',
    );
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

  describe('amend (BG-14)', () => {
    // As tenantAmendDefaults builds them from a draft the platform returned whole.
    const DRAFT: TenantDraftValues = {
      ...EMPTY_TENANT_DRAFT,
      tenantCode: 'umoja-teachers',
      displayName: 'Umoja Teachers SACCO',
      legalName: 'Umoja Teachers Co-operative Society Ltd',
      registrationNumber: 'CS/2019/0042',
      countryCode: 'KE',
      baseCurrencyCode: 'KES',
      timezone: 'Africa/Nairobi',
      adminEmail: 'amina@umoja.example',
      adminUsername: 'amina.otieno',
      adminDisplayName: 'Amina Otieno',
      adminPhone: '+254712000140',
      adminSendApplicationInvite: 'true',
    };
    const REQUIRED = {
      tenantCode: 'umoja-teachers',
      displayName: 'Umoja Teachers SACCO',
      countryCode: 'KE',
      baseCurrencyCode: 'KES',
      timezone: 'Africa/Nairobi',
    };
    const sent = (call: number) =>
      Object.fromEntries((amendTenantDraft.mock.calls[call]?.[1] as FormData | undefined) ?? []);
    const renderAmend = () =>
      renderWithProviders(
        <TenantDraftWizard
          tenantId={TENANT}
          defaults={DRAFT}
          options={OPTIONS}
          contextOrganisationId={ORG_ID}
        />,
      );

    it('opens pre-filled in three steps, with the code read-only and an optional business date', async () => {
      const user = userEvent.setup();
      amendTenantDraft.mockResolvedValueOnce({ ok: true });
      renderAmend();

      expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(3);
      expect(screen.getByRole('textbox', { name: 'Tenant code' })).toHaveAttribute('readonly');
      expect(screen.getByRole('textbox', { name: 'Legal name' })).toHaveValue(
        'Umoja Teachers Co-operative Society Ltd',
      );
      expect(screen.getByRole('textbox', { name: 'Registration number' })).toHaveValue(
        'CS/2019/0042',
      );
      // The platform applies a business date but never returns one: offered, never pre-filled.
      const date = screen.getByLabelText('First business date');
      expect(date).toHaveValue('');
      expect(date).toHaveAccessibleDescription(
        "Optional. Leave it empty to keep the draft's date, or today in the institution's timezone at approval if it has none.",
      );
      expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
        'href',
        `/platform-admin/tenants/${TENANT}`,
      );

      await next(user, 'First administrator');
      expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('amina@umoja.example');
      expect(screen.getByRole('textbox', { name: 'Phone' })).toHaveValue('+254712000140');
      expect(screen.getByRole('checkbox', { name: 'Send application invite' })).toBeChecked();
      await next(user, 'Review');
      expect(screen.queryByRole('region', { name: 'Initial settings' })).toBeNull();
      expect(screen.getByRole('region', { name: 'Institution' })).toHaveTextContent('Unchanged');
      expect(screen.getByText("Saving keeps anything you didn't change.")).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Save draft' }));

      // Nothing optional changed: the five fields the PATCH requires, and nothing else.
      await waitFor(() => {
        expect(amendTenantDraft).toHaveBeenCalledTimes(1);
      });
      expect(sent(0)).toEqual({
        idempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown,
        tenantId: TENANT,
        // The cross-tab guard (07's I2): a dropped forward would silently disable it.
        contextOrganisationId: ORG_ID,
        ...REQUIRED,
      });
      expect(createTenantDraft).not.toHaveBeenCalled();
    });

    it('sends a cleared field, the whole administrator and a business date, and retries with the same key', async () => {
      const user = userEvent.setup();
      amendTenantDraft
        .mockResolvedValueOnce({
          ok: false,
          formError: "The platform didn't respond as expected. Try again in a moment.",
          fieldErrors: {},
          code: null,
          requestId: 'req-6',
        })
        .mockResolvedValueOnce({ ok: true });
      renderAmend();

      await user.clear(screen.getByRole('textbox', { name: 'Registration number' }));
      await user.type(screen.getByLabelText('First business date'), '2026-10-05');
      await next(user, 'First administrator');
      const phone = screen.getByRole('textbox', { name: 'Phone' });
      await user.clear(phone);
      await user.type(phone, '+254712000141');
      await next(user, 'Review');
      expect(screen.getByRole('region', { name: 'Institution' })).toHaveTextContent(
        'Monday, 5 October 2026',
      );
      await user.click(screen.getByRole('button', { name: 'Save draft' }));

      expect(await screen.findByText(/Reference: req-6/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Save draft' }));
      await waitFor(() => {
        expect(amendTenantDraft).toHaveBeenCalledTimes(2);
      });
      const expected = {
        idempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown,
        tenantId: TENANT,
        contextOrganisationId: ORG_ID,
        ...REQUIRED,
        // Cleared: sent empty, which the action sends as null.
        registrationNumber: '',
        businessDate: '2026-10-05',
        // One administrator field changed, so all five go: the platform replaces it whole.
        adminEmail: 'amina@umoja.example',
        adminUsername: 'amina.otieno',
        adminDisplayName: 'Amina Otieno',
        adminPhone: '+254712000141',
        adminSendApplicationInvite: 'true',
      };
      expect(sent(0)).toEqual(expected);
      // Review Focus 2: the same body under the key minted on mount, so a retry replays.
      expect(sent(1)).toEqual(sent(0));
    });

    // A draft with no bootstrap record: the platform returns no administrator and would discard one
    // sent, so the step says so, asks nothing, and the PATCH carries no `admin`.
    it('says the platform keeps no administrator for a draft without one, and sends none', async () => {
      const user = userEvent.setup();
      amendTenantDraft.mockResolvedValueOnce({ ok: true });
      const empty = {
        adminEmail: '',
        adminUsername: '',
        adminDisplayName: '',
        adminPhone: '',
        adminSendApplicationInvite: 'false',
      } as const;
      renderWithProviders(
        <TenantDraftWizard
          tenantId={TENANT}
          withoutAdministrator
          defaults={{ ...DRAFT, ...empty }}
          options={OPTIONS}
          contextOrganisationId={ORG_ID}
        />,
      );
      const NOTE =
        "The platform keeps no draft administrator for this institution, so there's none to change here.";

      expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(3);
      await next(user, 'First administrator');
      expect(screen.getByText(NOTE)).toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'Email' })).toBeNull();
      await next(user, 'Review');
      const card = screen.getByRole('region', { name: 'First administrator' });
      expect(card).toHaveTextContent(NOTE);
      expect(within(card).queryByRole('button', { name: 'Edit first administrator' })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Save draft' }));

      await waitFor(() => {
        expect(amendTenantDraft).toHaveBeenCalledTimes(1);
      });
      expect(sent(0)).toEqual({
        idempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown,
        tenantId: TENANT,
        contextOrganisationId: ORG_ID,
        ...REQUIRED,
      });
    });
  });
});
