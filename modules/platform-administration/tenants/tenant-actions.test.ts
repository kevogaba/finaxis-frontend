import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';

const { apiPatch, apiPost, redirect, runServerAction, tenantCodeTaken } = vi.hoisted(() => ({
  apiPost: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
    Promise.resolve<unknown>({}),
  ),
  apiPatch: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
    Promise.resolve<unknown>({}),
  ),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  runServerAction: vi.fn(),
  tenantCodeTaken: vi.fn((_code: string) => Promise.resolve(false)),
}));
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) as unknown }));
vi.mock('@/lib/api/tenant-api', () => ({
  apiPost: (path: string, body: Record<string, unknown>, key: string) => apiPost(path, body, key),
  apiPatch: (path: string, body: Record<string, unknown>, key: string) => apiPatch(path, body, key),
}));
vi.mock('@/lib/api/action-result', () => ({
  runServerAction: (...args: unknown[]) => runServerAction(...args) as unknown,
}));
vi.mock('./tenant-service', () => ({
  tenantCodeTaken: (code: string) => tenantCodeTaken(code),
}));
// The reserved platform organisation (BG-29), by the id the tests below use for it. The real
// isPlatformOrganisation runs against this env, so the case-insensitive comparison is exercised.
vi.mock('@/config/env.server', () => ({
  serverEnv: { PLATFORM_ORGANISATION_ID: 'abcdef01-2345-4678-89ab-cdef01234567' },
}));

const actions = await import('./tenant-actions');

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const TENANT = '16000000-0000-4000-8000-000000000001';
// Lettered, so its upper-case form differs from it (the nil UUID has no letters to change).
const PLATFORM = 'abcdef01-2345-4678-89ab-cdef01234567';
const FIELDS = {
  tenantCode: 'tujenge-traders',
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
  adminSendApplicationInvite: 'false',
  defaultTimezoneSetting: '',
  baseCurrencySetting: '',
  auditRetentionDays: '',
};
const INSTITUTION = {
  tenant_code: 'tujenge-traders',
  display_name: 'Tujenge Traders SACCO',
  legal_name: null,
  registration_number: null,
  country_code: 'KE',
  base_currency_code: 'KES',
  timezone: 'Africa/Nairobi',
  admin: {
    email: 'amina@tujenge.example',
    username: 'amina.otieno',
    display_name: 'Amina Otieno',
    phone_e164: '+254712000140',
    send_application_invite: false,
  },
};

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(fields).forEach(([name, value]) => {
    data.set(name, value);
  });
  return data;
}

const failure = (code: string) => ({
  ok: false as const,
  formError: 'generic',
  fieldErrors: {},
  code,
  requestId: 'req-1',
});

describe('tenant actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mirrors runServerAction's contract (lib/api/action-result.ts): its own zod failures become
    // fieldErrors, a thrown BackendApiError becomes a failure carrying its code, and a redirect
    // keeps propagating. runServerAction has its own test.
    runServerAction.mockImplementation(
      async (schema: z.ZodType, formData: FormData, run: (input: unknown) => Promise<unknown>) => {
        const parsed = schema.safeParse(Object.fromEntries(formData));
        if (!parsed.success) {
          return {
            ok: false,
            formError: 'Check the highlighted fields and try again.',
            fieldErrors: Object.fromEntries(
              parsed.error.issues.map((issue) => [issue.path.map(String).join('.'), issue.message]),
            ),
            code: 'validation_failed',
            requestId: null,
          };
        }
        try {
          await run(parsed.data);
        } catch (error) {
          if (!(error instanceof BackendApiError)) throw error;
          return {
            ok: false,
            formError: 'generic',
            fieldErrors: {},
            code: error.code,
            requestId: error.requestId,
          };
        }
        return { ok: true };
      },
    );
  });

  it('creates a draft from an explicit snake_case body and redirects to the record', async () => {
    apiPost.mockResolvedValueOnce({ organisation_id: TENANT, status: 'DRAFT' });

    await expect(
      actions.createTenantDraft(
        null,
        form({
          ...FIELDS,
          idempotencyKey: KEY,
          businessDate: '2026-10-05',
          auditRetentionDays: '365',
        }),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/platform-admin/tenants/${TENANT}`);
    expect(tenantCodeTaken).not.toHaveBeenCalled();
    expect(apiPost).toHaveBeenCalledWith(
      '/api/v1/platform/tenants',
      {
        ...INSTITUTION,
        initial_settings: { audit_retention_days: '365' },
        business_date: '05-10-2026',
      },
      KEY,
    );
  });

  describe('a duplicate tenant code (BG-07)', () => {
    const create = () => actions.createTenantDraft(null, form({ ...FIELDS, idempotencyKey: KEY }));
    // The backend's answer to a duplicate code: a 500 with the generic code, as any bug would be.
    const duplicate = () =>
      new BackendApiError(500, { code: 'internal_error', requestId: 'req-3' });

    afterEach(() => {
      tenantCodeTaken.mockReset();
    });

    it('replays the create before looking at the directory, so a lost response is not stranded', async () => {
      // The first attempt created the draft but its response was lost. The retry carries the same
      // key, so the backend replays it; the draft's own code must not turn the retry away.
      tenantCodeTaken.mockResolvedValue(true);
      apiPost.mockResolvedValueOnce({ organisation_id: TENANT, status: 'DRAFT' });

      await expect(create()).rejects.toThrow(`NEXT_REDIRECT:/platform-admin/tenants/${TENANT}`);

      expect(tenantCodeTaken).not.toHaveBeenCalled();
      expect(apiPost).toHaveBeenCalledTimes(1);
      expect(apiPost).toHaveBeenCalledWith('/api/v1/platform/tenants', expect.anything(), KEY);
    });

    it('names a taken code, on the code field, when the create fails and the directory holds it', async () => {
      apiPost.mockRejectedValueOnce(duplicate());
      tenantCodeTaken.mockResolvedValueOnce(true);

      expect(await create()).toMatchObject({
        ok: false,
        code: 'tenant_code_taken',
        formError: 'This tenant code is already in use. Choose another.',
        fieldErrors: { tenantCode: 'This code is already in use.' },
      });
      expect(apiPost).toHaveBeenCalledWith('/api/v1/platform/tenants', expect.anything(), KEY);
      expect(tenantCodeTaken).toHaveBeenCalledWith('tujenge-traders');
    });

    it.each([
      ['the directory does not hold the code', () => tenantCodeTaken.mockResolvedValueOnce(false)],
      [
        'the directory cannot be read',
        () => tenantCodeTaken.mockRejectedValueOnce(new Error('socket hang up')),
      ],
    ])('keeps the original failure when %s', async (_name, arrange) => {
      apiPost.mockRejectedValueOnce(duplicate());
      arrange();

      expect(await create()).toEqual({
        ok: false,
        formError: 'generic',
        fieldErrors: {},
        code: 'internal_error',
        requestId: 'req-3',
      });
    });

    it.each([
      [422, 'invalid_operation'],
      [409, 'conflict'],
      [403, 'forbidden'],
      [500, 'something_else'],
      [500, null],
      [502, null],
    ])('does not look at the directory for a %s (%s)', async (status, code) => {
      apiPost.mockRejectedValueOnce(new BackendApiError(status, { code }));

      expect(await create()).toMatchObject({ ok: false, code });
      expect(tenantCodeTaken).not.toHaveBeenCalled();
    });
  });

  it('names the currency and value 422s without echoing the backend', async () => {
    apiPost.mockRejectedValueOnce(
      new BackendApiError(422, { code: 'accounting.currency_invalid', requestId: 'req-2' }),
    );
    expect(
      await actions.createTenantDraft(null, form({ ...FIELDS, idempotencyKey: KEY })),
    ).toMatchObject({
      code: 'accounting.currency_invalid',
      requestId: 'req-2',
      formError:
        "The platform can't settle in this currency. Choose another base currency, or clear the base currency setting.",
      fieldErrors: { baseCurrencyCode: "The platform can't settle in this currency." },
    });

    apiPost.mockRejectedValueOnce(new BackendApiError(422, { code: 'invalid_operation' }));
    expect(
      await actions.createTenantDraft(null, form({ ...FIELDS, idempotencyKey: KEY })),
    ).toMatchObject({
      formError: 'The platform refused a value. Check the timezone and the initial settings.',
    });
  });

  it('names the amend 422s without the settings, which an amend never sends', async () => {
    const amend = () => form({ ...FIELDS, idempotencyKey: KEY, tenantId: TENANT });

    apiPatch.mockRejectedValueOnce(
      new BackendApiError(422, { code: 'accounting.currency_invalid' }),
    );
    expect(await actions.amendTenantDraft(null, amend())).toMatchObject({
      code: 'accounting.currency_invalid',
      formError: "The platform can't settle in this currency. Choose another base currency.",
      fieldErrors: { baseCurrencyCode: "The platform can't settle in this currency." },
    });

    apiPatch.mockRejectedValueOnce(new BackendApiError(422, { code: 'invalid_operation' }));
    expect(await actions.amendTenantDraft(null, amend())).toMatchObject({
      code: 'invalid_operation',
      formError: 'The platform refused a value. Check the timezone and the other details.',
    });
  });

  describe('accounting.currency_invalid', () => {
    const REFUSED = "The platform can't settle in this currency.";
    const refused = () =>
      new BackendApiError(422, { code: 'accounting.currency_invalid', requestId: 'req-2' });

    it('marks both currency fields on create when an initial currency setting was sent', async () => {
      apiPost.mockRejectedValueOnce(refused());
      const result = await actions.createTenantDraft(
        null,
        form({ ...FIELDS, idempotencyKey: KEY, baseCurrencySetting: 'USD' }),
      );
      expect(result).toMatchObject({
        code: 'accounting.currency_invalid',
        requestId: 'req-2',
        formError:
          "The platform can't settle in this currency. Choose another base currency, or clear the base currency setting.",
      });
      expect(result).toHaveProperty('fieldErrors', {
        baseCurrencyCode: REFUSED,
        baseCurrencySetting: REFUSED,
      });
    });

    it('marks only the institution currency on create when no setting was sent', async () => {
      apiPost.mockRejectedValueOnce(refused());
      const result = await actions.createTenantDraft(
        null,
        form({ ...FIELDS, idempotencyKey: KEY, defaultTimezoneSetting: 'UTC' }),
      );
      expect(result).toHaveProperty('fieldErrors', { baseCurrencyCode: REFUSED });
    });

    it('marks only the institution currency on amend, which sends no settings', async () => {
      apiPatch.mockRejectedValueOnce(refused());
      const result = await actions.amendTenantDraft(
        null,
        form({ ...FIELDS, idempotencyKey: KEY, tenantId: TENANT, baseCurrencySetting: 'USD' }),
      );
      expect(result).toHaveProperty('fieldErrors', { baseCurrencyCode: REFUSED });
    });
  });

  it('validates on the server too: a bad phone never reaches the backend or the directory', async () => {
    const result = await actions.createTenantDraft(
      null,
      form({ ...FIELDS, idempotencyKey: KEY, adminPhone: '0712000140' }),
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { adminPhone: 'Use the international format, e.g. +254712000140.' },
    });
    expect(tenantCodeTaken).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('amends with a PATCH that replaces the institution and administrator, and nothing else', async () => {
    await expect(
      actions.amendTenantDraft(
        null,
        form({
          ...FIELDS,
          idempotencyKey: KEY,
          tenantId: TENANT,
          legalName: 'Tujenge Traders Co-operative Society Ltd',
          auditRetentionDays: '365',
        }),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/platform-admin/tenants/${TENANT}`);
    expect(apiPatch).toHaveBeenCalledWith(
      `/api/v1/platform/tenants/${TENANT}`,
      { ...INSTITUTION, legal_name: 'Tujenge Traders Co-operative Society Ltd' },
      KEY,
    );
    expect(tenantCodeTaken).not.toHaveBeenCalled();

    runServerAction.mockResolvedValueOnce(failure('conflict'));
    expect(await actions.amendTenantDraft(null, form({}))).toMatchObject({
      code: 'conflict',
      formError:
        'Only a draft can be amended. It may already have been submitted. Refresh and check.',
    });
  });

  it.each([
    ['submitTenant', 'submit'],
    ['approveTenant', 'approve'],
    ['retryTenantBootstrap', 'bootstrap/retry'],
  ] as const)('%s posts an empty body to …/%s, never a reason', async (name, path) => {
    await actions[name](null, form({ idempotencyKey: KEY, tenantId: TENANT, reason: 'ignored' }));
    expect(apiPost).toHaveBeenCalledWith(`/api/v1/platform/tenants/${TENANT}/${path}`, {}, KEY);
  });

  it('explains an approve 403 as permission or maker-checker (BG-08)', async () => {
    runServerAction.mockResolvedValueOnce(failure('forbidden'));
    expect(await actions.approveTenant(null, form({}))).toMatchObject({
      code: 'forbidden',
      requestId: 'req-1',
      formError: expect.stringContaining(
        'a different platform administrator must approve it',
      ) as unknown,
    });
  });

  it.each([
    ['submitTenant', "This draft couldn't be submitted."],
    ['rejectTenant', "This request can't be rejected any more."],
    ['reactivateTenant', "This institution couldn't be reactivated."],
    ['retryTenantBootstrap', "The bootstrap isn't in a failed state any more."],
  ] as const)('names the %s 409 and hedges it', async (name, message) => {
    runServerAction.mockResolvedValueOnce(failure('conflict'));
    expect(await actions[name](null, form({}))).toMatchObject({
      code: 'conflict',
      formError: expect.stringContaining(message) as unknown,
    });
  });

  it.each(['rejectTenant', 'suspendTenant'] as const)(
    '%s requires a reason of 3–500 characters before calling the backend',
    async (name) => {
      expect(
        await actions[name](null, form({ idempotencyKey: KEY, tenantId: TENANT, reason: 'ab' })),
      ).toMatchObject({
        ok: false,
        fieldErrors: { reason: 'Give a reason of at least 3 characters.' },
      });
      expect(apiPost).not.toHaveBeenCalled();

      await actions[name](
        null,
        form({ idempotencyKey: KEY, tenantId: TENANT, reason: ' Compliance review ' }),
      );
      expect(apiPost).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`/tenants/${TENANT}/(reject|suspend)$`)),
        { reason: 'Compliance review' },
        KEY,
      );
    },
  );

  it('reactivates with {} or {reason}', async () => {
    await actions.reactivateTenant(
      null,
      form({ idempotencyKey: KEY, tenantId: TENANT, reason: ' ' }),
    );
    expect(apiPost).toHaveBeenLastCalledWith(
      `/api/v1/platform/tenants/${TENANT}/reactivate`,
      {},
      KEY,
    );
    await actions.reactivateTenant(
      null,
      form({ idempotencyKey: KEY, tenantId: TENANT, reason: 'Review closed' }),
    );
    expect(apiPost).toHaveBeenLastCalledWith(
      `/api/v1/platform/tenants/${TENANT}/reactivate`,
      { reason: 'Review closed' },
      KEY,
    );
  });

  it('deprovisions only when the typed code matches the tenant code (CRITICAL)', async () => {
    const base = {
      idempotencyKey: KEY,
      tenantId: TENANT,
      tenantCode: 'kilimo-bora',
      reason: 'Merged into Harambee',
    };
    expect(
      await actions.deprovisionTenant(null, form({ ...base, confirmCode: 'kilimo' })),
    ).toMatchObject({
      ok: false,
      fieldErrors: { confirmCode: 'Type the tenant code exactly as shown.' },
    });
    expect(apiPost).not.toHaveBeenCalled();

    await actions.deprovisionTenant(null, form({ ...base, confirmCode: ' kilimo-bora ' }));
    expect(apiPost).toHaveBeenCalledWith(
      `/api/v1/platform/tenants/${TENANT}/deprovision`,
      { reason: 'Merged into Harambee' },
      KEY,
    );
  });

  it('refuses a deprovision whose tenant code and typed code are both empty', async () => {
    const result = await actions.deprovisionTenant(
      null,
      form({
        idempotencyKey: KEY,
        tenantId: TENANT,
        tenantCode: '',
        confirmCode: '',
        reason: 'Merged into Harambee',
      }),
    );
    expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it.each([
    'submitTenant',
    'approveTenant',
    'rejectTenant',
    'suspendTenant',
    'reactivateTenant',
    'deprovisionTenant',
    'retryTenantBootstrap',
  ] as const)(
    "%s refuses the platform organisation's id, in any letter case, before any backend call",
    async (name) => {
      for (const id of [PLATFORM, PLATFORM.toUpperCase()]) {
        const result = await actions[name](
          null,
          form({
            idempotencyKey: KEY,
            tenantId: id,
            reason: 'Compliance review',
            tenantCode: 'platform',
            confirmCode: 'platform',
          }),
        );
        expect(result).toMatchObject({
          ok: false,
          code: 'validation_failed',
          fieldErrors: { tenantId: 'Choose an institution.' },
        });
      }
      expect(apiPost).not.toHaveBeenCalled();
    },
  );

  it.each([PLATFORM, PLATFORM.toUpperCase()])(
    "refuses to amend the platform organisation's id (%s) before any backend call",
    async (id) => {
      const result = await actions.amendTenantDraft(
        null,
        form({ ...FIELDS, idempotencyKey: KEY, tenantId: id }),
      );
      expect(result).toMatchObject({
        ok: false,
        code: 'validation_failed',
        fieldErrors: { tenantId: 'Choose an institution.' },
      });
      expect(apiPatch).not.toHaveBeenCalled();
    },
  );

  it.each(['../x', 'not-a-uuid', ''])(
    'refuses a malformed tenant id (%j) before any backend call',
    async (id) => {
      const lifecycle = await actions.submitTenant(
        null,
        form({ idempotencyKey: KEY, tenantId: id }),
      );
      expect(lifecycle).toMatchObject({
        ok: false,
        code: 'validation_failed',
        fieldErrors: { tenantId: 'Choose an institution.' },
      });
      const amend = await actions.amendTenantDraft(
        null,
        form({ ...FIELDS, idempotencyKey: KEY, tenantId: id }),
      );
      expect(amend).toMatchObject({
        ok: false,
        code: 'validation_failed',
        fieldErrors: { tenantId: 'Choose an institution.' },
      });
      expect(apiPost).not.toHaveBeenCalled();
      expect(apiPatch).not.toHaveBeenCalled();
    },
  );
});
