import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { IDS, TENANT_SCENARIO_IDS } from './fake-api/scenarios.mts';

const FAKE_API_URL = `http://127.0.0.1:${process.env.FAKE_API_PORT ?? '3199'}`;
const api = (path: string) => `${FAKE_API_URL}/api/v1${path}`;

/** A fresh run of `scenario`, with a context token for `organisationId`. */
async function signIn(request: APIRequestContext, scenario: string, organisationId: string) {
  const authorization = { Authorization: `Bearer e2e.${scenario}.${randomUUID()}` };
  const selection = await request.post(api('/auth/select-organisation'), {
    headers: authorization,
    data: { organisation_id: organisationId },
  });
  const { context_token: contextToken } = (await selection.json()) as { context_token: string };
  return { ...authorization, 'X-Active-Organisation-Context': contextToken };
}

const ADMIN = {
  email: 'amina@tujenge.example',
  username: 'amina.otieno',
  display_name: 'Amina Otieno',
  phone_e164: '+254712000140',
  send_application_invite: false,
};
const DRAFT = {
  tenant_code: 'tujenge-traders',
  display_name: 'Tujenge Traders SACCO',
  legal_name: 'Tujenge Traders Co-operative Society Ltd',
  registration_number: null,
  country_code: 'KE',
  base_currency_code: 'KES',
  timezone: 'Africa/Nairobi',
  admin: ADMIN,
  initial_settings: { audit_retention_days: '365' },
  business_date: null,
};

test.describe('fake API platform tenants (contract §E.2, layer 16)', () => {
  test('creates a draft from a snake_case body, and refuses camelCase, a missing phone and a taken code', async ({
    request,
  }) => {
    const headers = await signIn(request, 'platform-tenants', IDS.platformOrganisation);

    const created = await request.post(api('/platform/tenants'), { headers, data: DRAFT });
    expect(created.status()).toBe(201);
    const { organisation_id: id } = (await created.json()) as { organisation_id: string };
    const detail = (await (
      await request.get(api(`/platform/tenants/${id}`), { headers })
    ).json()) as Record<string, unknown>;
    expect(detail).toMatchObject({
      tenant_code: 'tujenge-traders',
      status: 'DRAFT',
      bootstrap_status: 'DRAFT',
    });
    // Write-only (BG-14): never returned.
    expect(Object.keys(detail)).not.toContain('legal_name');

    // A valid body plus one property the wire format doesn't know. Were unknown properties ignored,
    // this would answer 201: a body that also lacked a required field would hide that.
    const camel = await request.post(api('/platform/tenants'), {
      headers,
      data: { ...DRAFT, tenant_code: 'camel-case', tenantCode: 'camel-case' },
    });
    expect(camel.status()).toBe(400);
    expect(await camel.json()).toMatchObject({ code: 'invalid_json' });
    // Nothing was created, and the same body without the extra property is valid.
    const withoutExtra = await request.post(api('/platform/tenants'), {
      headers,
      data: { ...DRAFT, tenant_code: 'camel-case' },
    });
    expect(withoutExtra.status()).toBe(201);

    const noPhone = await request.post(api('/platform/tenants'), {
      headers,
      data: { ...DRAFT, tenant_code: 'no-phone', admin: { ...ADMIN, phone_e164: null } },
    });
    expect(noPhone.status()).toBe(400);
    expect(await noPhone.json()).toMatchObject({
      code: 'validation_failed',
      violations: [{ field: 'admin.phone_e164', code: 'NotBlank' }],
    });

    // BG-07: the backend answers a taken code with a 500, so the app looks it up after a failed create.
    const taken = await request.post(api('/platform/tenants'), {
      headers,
      data: { ...DRAFT, tenant_code: 'acme' },
    });
    expect(taken.status()).toBe(500);
  });

  test('refuses the approval to its maker and to its submitter, and approves a request another operator submitted with a replayable 202', async ({
    request,
  }) => {
    const headers = await signIn(request, 'platform-tenants', IDS.platformOrganisation);
    const umoja = `/platform/tenants/${TENANT_SCENARIO_IDS.umoja}`;

    const submitted = await request.post(api(`${umoja}/submit`), { headers, data: {} });
    expect(await submitted.json()).toMatchObject({
      status: 'PENDING_APPROVAL',
      bootstrap_status: 'PENDING_ACTIVATION',
    });
    // Jane drafted and submitted Umoja, so she can't approve it (maker-checker; the same 403 as a
    // missing permission, BG-08).
    const own = await request.post(api(`${umoja}/approve`), { headers, data: {} });
    expect(own.status()).toBe(403);
    expect(await own.json()).toMatchObject({ code: 'forbidden' });
    // Another operator drafted Mwangaza, but Jane submitted it: the submitter alone is refused too.
    const submittedOnly = await request.post(
      api(`/platform/tenants/${TENANT_SCENARIO_IDS.mwangaza}/approve`),
      { headers, data: {} },
    );
    expect(submittedOnly.status()).toBe(403);
    expect(await submittedOnly.json()).toMatchObject({ code: 'forbidden' });

    const once = { ...headers, 'Idempotency-Key': randomUUID() };
    const harambee = api(`/platform/tenants/${TENANT_SCENARIO_IDS.harambee}/approve`);
    const approved = await request.post(harambee, { headers: once, data: {} });
    expect(approved.status()).toBe(202);
    expect(await approved.json()).toMatchObject({ status: 'ACTIVE', bootstrap_status: 'QUEUED' });
    // The same key replays the stored 202 instead of failing a second transition (index item 2).
    const replay = await request.post(harambee, { headers: once, data: {} });
    expect(replay.status()).toBe(202);
    expect(replay.headers()['idempotency-replayed']).toBe('true');
  });

  test('requires reasons, guards transitions, amends only a draft, and retries only a failed bootstrap', async ({
    request,
  }) => {
    const headers = await signIn(request, 'platform-tenants', IDS.platformOrganisation);
    const acme = `/platform/tenants/${IDS.acme}`;

    const short = await request.post(api(`${acme}/suspend`), { headers, data: { reason: 'ab' } });
    expect(short.status()).toBe(400);
    expect(await short.json()).toMatchObject({
      code: 'validation_failed',
      violations: [{ field: 'reason' }],
    });
    const notPending = await request.post(api(`${acme}/reject`), {
      headers,
      data: { reason: 'Not pending' },
    });
    expect(notPending.status()).toBe(409);
    // BG-07: an unknown tenant on reject is a 500, not a 404.
    const unknown = await request.post(api(`/platform/tenants/${randomUUID()}/reject`), {
      headers,
      data: { reason: 'Unknown tenant' },
    });
    expect(unknown.status()).toBe(500);

    const notDraft = await request.patch(api(acme), {
      headers,
      data: { ...DRAFT, tenant_code: 'acme' },
    });
    expect(notDraft.status()).toBe(409);
    const amended = await request.patch(api(`/platform/tenants/${TENANT_SCENARIO_IDS.umoja}`), {
      headers,
      data: {
        ...DRAFT,
        tenant_code: 'umoja-teachers',
        display_name: 'Umoja Teachers Co-operative SACCO',
      },
    });
    expect(await amended.json()).toMatchObject({
      tenant_code: 'umoja-teachers',
      display_name: 'Umoja Teachers Co-operative SACCO',
      status: 'DRAFT',
    });

    const notFailed = await request.post(api(`${acme}/bootstrap/retry`), { headers, data: {} });
    expect(notFailed.status()).toBe(409);
    const retried = await request.post(
      api(`/platform/tenants/${TENANT_SCENARIO_IDS.pwani}/bootstrap/retry`),
      { headers, data: {} },
    );
    expect(retried.status()).toBe(202);
    expect(await retried.json()).toMatchObject({
      bootstrap_status: 'PROVISIONING_IDENTITY',
      bootstrap_failure_code: null,
    });
  });

  test('refuses an unknown property on a reason body too, before the transition runs', async ({
    request,
  }) => {
    const headers = await signIn(request, 'platform-tenants', IDS.platformOrganisation);
    const suspend = api(`/platform/tenants/${IDS.acme}/suspend`);
    // Acme is ACTIVE and the reason is valid: only the extra property is wrong.
    const extra = await request.post(suspend, {
      headers,
      data: { reason: 'Compliance review', reasonText: 'x' },
    });
    expect(extra.status()).toBe(400);
    expect(await extra.json()).toMatchObject({ code: 'invalid_json' });
    // Still ACTIVE: the same reason alone suspends it.
    const suspended = await request.post(suspend, {
      headers,
      data: { reason: 'Compliance review' },
    });
    expect(suspended.status()).toBe(200);
    expect(await suspended.json()).toMatchObject({ status: 'SUSPENDED' });
  });

  test('seeds the platform organisation, Acme and one institution per lifecycle state', async ({
    request,
  }) => {
    const headers = await signIn(request, 'platform-tenants', IDS.platformOrganisation);
    const listed = await request.get(api('/platform/tenants?size=100'), { headers });
    const { items } = (await listed.json()) as {
      items: { tenant_code: string; status: string }[];
    };
    expect(Object.fromEntries(items.map((tenant) => [tenant.tenant_code, tenant.status]))).toEqual({
      PLATFORM: 'ACTIVE',
      acme: 'ACTIVE',
      'umoja-teachers': 'DRAFT',
      'harambee-farmers': 'PENDING_APPROVAL',
      'mwangaza-savings': 'PENDING_APPROVAL',
      'pwani-fishermen': 'ACTIVE',
      'kilimo-bora': 'SUSPENDED',
      'nairobi-metro-teachers': 'REJECTED',
    });
  });

  test('answers an off-list sort_by as a 500, including names every object inherits', async ({
    request,
  }) => {
    const headers = await signIn(request, 'platform-tenants', IDS.platformOrganisation);
    // BG-07: only the four camelCase keys sort; a name from Object.prototype is no key.
    for (const sortBy of ['tenant_code', 'toString', 'constructor', '__proto__']) {
      const refused = await request.get(api(`/platform/tenants?sort_by=${sortBy}`), { headers });
      expect(refused.status(), sortBy).toBe(500);
    }
    const sorted = await request.get(api('/platform/tenants?sort_by=tenantCode&sort_dir=ASC'), {
      headers,
    });
    expect(sorted.status()).toBe(200);
  });

  test('needs the platform context and the tenant permissions', async ({ request }) => {
    const tenantHeaders = await signIn(request, 'default', IDS.greenfield);
    const wrongContext = await request.post(api('/platform/tenants'), {
      headers: tenantHeaders,
      data: DRAFT,
    });
    expect(wrongContext.status()).toBe(403);
    expect(await wrongContext.json()).toMatchObject({
      code: 'Reserved platform organisation context is required for this route.',
    });

    // `platform-operator` holds tenant.view only: the read-only gating scenario.
    const readOnly = await signIn(request, 'platform-operator', IDS.platformOrganisation);
    const refused = await request.post(api(`/platform/tenants/${IDS.acme}/suspend`), {
      headers: readOnly,
      data: { reason: 'Compliance review' },
    });
    expect(refused.status()).toBe(403);
    expect(await refused.json()).toMatchObject({ code: 'forbidden' });
  });
});
