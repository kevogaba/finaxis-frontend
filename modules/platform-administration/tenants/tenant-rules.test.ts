import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  availableTenantActions,
  canRetryBootstrap,
  countryLabel,
  countryName,
  currencyLabel,
  EMPTY_TENANT_DRAFT,
  initialSettings,
  provisioningTimeline,
  tenantDraftBody,
  tenantDraftSchema,
  tenantFormOptions,
  visibleTenantTotal,
  type TenantDraftValues,
} from './tenant-rules';

const EVERY_CODE = {
  permissions: [
    'tenant.view',
    'tenant.update_draft',
    'tenant.submit_for_approval',
    'tenant.approve',
    'tenant.reject',
    'tenant.suspend',
    'tenant.reactivate',
    'tenant.deprovision',
    'tenant.bootstrap_retry',
  ],
};

const VALID: TenantDraftValues = {
  ...EMPTY_TENANT_DRAFT,
  tenantCode: 'tujenge-traders',
  displayName: 'Tujenge Traders SACCO',
  countryCode: 'KE',
  baseCurrencyCode: 'KES',
  timezone: 'Africa/Nairobi',
  adminEmail: 'amina@tujenge.example',
  adminUsername: 'amina.otieno',
  adminDisplayName: 'Amina Otieno',
  adminPhone: '+254712000140',
};

describe('tenant lifecycle availability', () => {
  it.each([
    ['DRAFT', ['submit', 'amend']],
    ['PENDING_APPROVAL', ['approve', 'reject']],
    ['ACTIVE', ['suspend', 'deprovision']],
    ['SUSPENDED', ['reactivate', 'deprovision']],
    ['PROVISIONING', []],
    ['DEPROVISIONING', []],
    ['DEPROVISIONED', []],
    ['REJECTED', []],
    ['ARCHIVED', []],
  ] as const)('offers %s → %j with every code', (status, expected) => {
    expect(availableTenantActions(status, EVERY_CODE)).toEqual(expected);
  });

  it("needs each action's own code, and offers nothing without the tenant.view read-back (BG-31)", () => {
    expect(
      availableTenantActions('ACTIVE', { permissions: ['tenant.view', 'tenant.suspend'] }),
    ).toEqual(['suspend']);
    expect(
      availableTenantActions('PENDING_APPROVAL', {
        permissions: ['tenant.approve', 'tenant.reject'],
      }),
    ).toEqual([]);
  });

  it('offers a bootstrap retry only for a FAILED bootstrap, with both codes', () => {
    expect(canRetryBootstrap('FAILED', EVERY_CODE)).toBe(true);
    expect(canRetryBootstrap('QUEUED', EVERY_CODE)).toBe(false);
    expect(canRetryBootstrap(null, EVERY_CODE)).toBe(false);
    expect(canRetryBootstrap('FAILED', { permissions: ['tenant.bootstrap_retry'] })).toBe(false);
    expect(canRetryBootstrap('FAILED', { permissions: ['tenant.view'] })).toBe(false);
  });
});

describe('provisioningTimeline', () => {
  const chips = (...args: Parameters<typeof provisioningTimeline>) =>
    provisioningTimeline(...args)?.map((step) => step.state.label);

  it("isn't tracked without a bootstrap record", () => {
    expect(provisioningTimeline('ACTIVE', null)).toBeNull();
  });

  it.each([
    ['DRAFT', 'DRAFT', ['Done', 'Waiting', 'Not started', 'Not started']],
    ['PENDING_APPROVAL', 'PENDING_ACTIVATION', ['Done', 'Done', 'Waiting', 'Not started']],
    ['ACTIVE', 'QUEUED', ['Done', 'Done', 'Done', 'In progress']],
    ['ACTIVE', 'PROVISIONING_IDENTITY', ['Done', 'Done', 'Done', 'In progress']],
    ['ACTIVE', 'COMPLETED', ['Done', 'Done', 'Done', 'Done']],
    // BG-24: a later invitee's failure can turn COMPLETED into FAILED; the timeline shows it as is.
    ['ACTIVE', 'FAILED', ['Done', 'Done', 'Done', 'Failed']],
    ['REJECTED', 'DRAFT', ['Done', 'Done', 'Rejected', 'Not started']],
  ] as const)('%s with a %s bootstrap reads %j', (status, bootstrap, expected) => {
    expect(chips(status, bootstrap)).toEqual(expected);
  });

  it('tones each state, and says why a rejected request stopped', () => {
    const rejected = provisioningTimeline('REJECTED', 'DRAFT') ?? [];
    expect(rejected[2]).toEqual({
      label: 'Approved',
      detail: 'Rejected. A rejected request is final, and its tenant code stays taken.',
      state: { label: 'Rejected', tone: 'error' },
    });
    expect(provisioningTimeline('ACTIVE', 'COMPLETED')?.[0]?.state.tone).toBe('success');
    expect(provisioningTimeline('DRAFT', 'DRAFT')?.[3]?.state.tone).toBe('default');
  });
});

describe('visibleTenantTotal (BG-29)', () => {
  it('always leaves the platform organisation out of an unfiltered count', () => {
    expect(visibleTenantTotal(8, false, false)).toBe(7);
    expect(visibleTenantTotal(8, false, true)).toBe(7);
  });

  it('leaves it out of a filtered count only when its row is on the page in view', () => {
    expect(visibleTenantTotal(3, true, true)).toBe(2);
    expect(visibleTenantTotal(3, true, false)).toBe(3);
    expect(visibleTenantTotal(0, false, false)).toBe(0);
  });
});

describe('country, currency and timezone choices', () => {
  it('names a country and a currency in English, falling back to the code', () => {
    expect(countryName('KE')).toBe('Kenya');
    // Not a region subtag: Intl throws, and the code stays.
    expect(countryName('KEN')).toBe('KEN');
    expect(currencyLabel('KES')).toBe('KES · Kenyan Shilling');
    expect(currencyLabel('K')).toBe('K');
  });

  it('writes a country as its code, then its name, like a currency', () => {
    expect(countryLabel('KE')).toBe('KE · Kenya');
    expect(countryLabel('UG')).toBe('UG · Uganda');
  });

  it('lists every nameable country by name, every currency and every zone', () => {
    const options = tenantFormOptions();
    const labels = options.countries.map((option) => option.label);
    expect(options.countries).toContainEqual({ value: 'KE', label: 'Kenya' });
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    expect(options.currencies).toContainEqual({ value: 'KES', label: 'KES · Kenyan Shilling' });
    expect(options.timeZones).toContainEqual({ value: 'Africa/Nairobi', label: 'Africa/Nairobi' });
  });

  it('lists each country name once', () => {
    const labels = tenantFormOptions().countries.map((option) => option.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('leaves out withdrawn codes and pseudo or supranational regions', () => {
    const codes = tenantFormOptions().countries.map((option) => option.value);
    for (const code of ['DD', 'UK', 'XA', 'ZZ', 'EU']) expect(codes).not.toContain(code);
  });

  it('names Germany by its current code only', () => {
    expect(tenantFormOptions().countries.filter((option) => option.label === 'Germany')).toEqual([
      { value: 'DE', label: 'Germany' },
    ]);
  });

  it('still offers a withdrawn country code that is stored, so amend shows it', () => {
    const options = tenantFormOptions({
      countryCode: 'DD',
      baseCurrencyCode: 'KES',
      timezone: 'Africa/Nairobi',
    });
    expect(options.countries[0]).toEqual({ value: 'DD', label: 'DD' });
  });

  it('puts a stored value the runtime does not list first, so amend still shows it', () => {
    const options = tenantFormOptions({
      countryCode: 'KEN',
      baseCurrencyCode: 'KES',
      timezone: 'Mars/Olympus',
    });
    expect(options.countries[0]).toEqual({ value: 'KEN', label: 'KEN' });
    expect(options.currencies.filter((option) => option.value === 'KES')).toHaveLength(1);
    expect(options.timeZones[0]).toEqual({ value: 'Mars/Olympus', label: 'Mars/Olympus' });
  });

  describe('UTC', () => {
    const zones = (current?: { timezone: string }) =>
      tenantFormOptions(current && { countryCode: 'KE', baseCurrencyCode: 'KES', ...current })
        .timeZones;

    afterEach(() => {
      vi.restoreAllMocks();
    });

    // Intl.supportedValuesOf('timeZone') lists neither, though isTimeZone and the backend accept both.
    it('offers UTC and Etc/UTC, once each, in the sorted list', () => {
      const values = zones().map((option) => option.value);
      expect(values).toContain('UTC');
      expect(values).toContain('Etc/UTC');
      expect(new Set(values).size).toBe(values.length);
      expect(values).toEqual([...values].sort());
      expect(zones()).toContainEqual({ value: 'UTC', label: 'UTC' });
      expect(zones()).toContainEqual({ value: 'Etc/UTC', label: 'Etc/UTC' });
    });

    it('does not repeat a zone the runtime list already holds', () => {
      vi.spyOn(Intl, 'supportedValuesOf').mockImplementation((key) =>
        key === 'timeZone' ? ['Africa/Nairobi', 'UTC'] : ['KES'],
      );
      expect(zones().map((option) => option.value)).toEqual(['Africa/Nairobi', 'Etc/UTC', 'UTC']);
    });

    it('lists a stored UTC once, in place', () => {
      const values = zones({ timezone: 'UTC' }).map((option) => option.value);
      expect(values.filter((value) => value === 'UTC')).toHaveLength(1);
      expect(values).toEqual([...values].sort());
    });
  });
});

describe('tenantDraftSchema', () => {
  it('accepts a complete draft with every optional field left empty', () => {
    expect(tenantDraftSchema.safeParse(VALID).success).toBe(true);
  });

  it.each([
    ['tenantCode', 'Tujenge Traders', 'Use 3–32 lowercase letters, digits or hyphens.'],
    ['displayName', 'T', 'Enter a name of at least 2 characters.'],
    ['countryCode', '', 'Choose a country.'],
    ['baseCurrencyCode', 'KE', 'Choose a currency.'],
    ['timezone', 'Mars/Olympus', 'Choose a timezone.'],
    ['adminEmail', 'amina', 'Enter a valid email address.'],
    ['adminUsername', 'am', 'Use 3–50 letters, digits, dots, underscores or hyphens.'],
    // Required by the backend although it is typed nullable (spec §11.1).
    ['adminPhone', '', 'Use the international format, e.g. +254712000140.'],
    ['businessDate', '2026-02-30', 'Choose a valid date.'],
    ['defaultTimezoneSetting', 'Mars/Olympus', 'Choose a timezone.'],
    ['auditRetentionDays', '-1', 'Enter a whole number of days.'],
  ] as const)('rejects %s = %j with its own message', (field, value, message) => {
    const result = tenantDraftSchema.safeParse({ ...VALID, [field]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: [field], message });
  });
});

describe('the draft body', () => {
  it('builds the snake_case institution and administrator field by field, nulling blank optionals', () => {
    expect(
      tenantDraftBody({
        ...VALID,
        legalName: 'Tujenge Traders Co-operative Society Ltd',
        adminSendApplicationInvite: 'true',
      }),
    ).toEqual({
      tenant_code: 'tujenge-traders',
      display_name: 'Tujenge Traders SACCO',
      legal_name: 'Tujenge Traders Co-operative Society Ltd',
      registration_number: null,
      country_code: 'KE',
      base_currency_code: 'KES',
      timezone: 'Africa/Nairobi',
      admin: {
        email: 'amina@tujenge.example',
        username: 'amina.otieno',
        display_name: 'Amina Otieno',
        phone_e164: '+254712000140',
        send_application_invite: true,
      },
    });
  });

  it('sends only the catalogue settings that were filled in, as strings', () => {
    expect(initialSettings(VALID)).toEqual({});
    expect(
      initialSettings({
        ...VALID,
        defaultTimezoneSetting: 'Africa/Nairobi',
        baseCurrencySetting: 'KES',
        auditRetentionDays: '0365',
      }),
    ).toEqual({
      default_timezone: 'Africa/Nairobi',
      base_currency: 'KES',
      audit_retention_days: '365',
    });
  });
});
