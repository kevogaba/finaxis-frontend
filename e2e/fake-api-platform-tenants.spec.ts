import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { IDS, LONG_RETURN_REASON, TENANT_SCENARIO_IDS } from './fake-api/scenarios.mts';

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
  initial_settings: { audit_retention_days: '3650' },
  business_date: null,
};
/** AmendTenantDraft with only the five fields the PATCH requires (BG-14): Umoja's own. */
const UMOJA_REQUIRED = {
  tenant_code: 'umoja-teachers',
  display_name: 'Umoja Teachers SACCO',
  country_code: 'KE',
  base_currency_code: 'KES',
  timezone: 'Africa/Nairobi',
};
/** Umoja's seeded first administrator, as the detail returns it. */
const UMOJA_ADMIN = {
  email: 'wanjiku@umoja.example',
  username: 'wanjiku.kamau',
  display_name: 'Wanjiku Kamau',
  phone_e164: '+254712000201',
  send_application_invite: true,
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
    // BG-14: the legal identity and, to a holder of tenant.update_draft while it is a draft, the
    // first administrator come back; no transition has recorded a reason yet.
    expect(detail).toMatchObject({
      tenant_code: 'tujenge-traders',
      status: 'DRAFT',
      bootstrap_status: 'DRAFT',
      legal_name: 'Tujenge Traders Co-operative Society Ltd',
      registration_number: null,
      status_reason: null,
      admin: ADMIN,
    });

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

    // BG-07: a taken code is the generic 409, so the app looks it up after a failed create.
    const taken = await request.post(api('/platform/tenants'), {
      headers,
      data: { ...DRAFT, tenant_code: 'acme' },
    });
    expect(taken.status()).toBe(409);
    expect(await taken.json()).toMatchObject({ code: 'conflict' });
  });

  test('refuses retention outside 2555–36500 days, a different base currency setting and a raw offset', async ({
    request,
  }) => {
    const headers = await signIn(request, 'platform-tenants', IDS.platformOrganisation);
    const create = (code: string, changes: Record<string, unknown>) =>
      request.post(api('/platform/tenants'), {
        headers,
        data: { ...DRAFT, tenant_code: code, ...changes },
      });
    const refused = async (code: string, changes: Record<string, unknown>) => {
      const response = await create(code, changes);
      expect(response.status(), code).toBe(422);
      expect(await response.json()).toMatchObject({ code: 'invalid_operation' });
    };

    await refused('short-retention', { initial_settings: { audit_retention_days: '2554' } });
    await refused('long-retention', { initial_settings: { audit_retention_days: '36501' } });
    await refused('other-currency', { initial_settings: { base_currency: 'UGX' } });
    await refused('offset-zone', { timezone: '+03:00' });
    await refused('offset-setting', { initial_settings: { default_timezone: '+03:00' } });
    await refused('bad-switch', {
      initial_settings: { require_maker_checker_for_user_invites: 'yes' },
    });

    // The bounds themselves, the draft's own currency, and an Etc/GMT zone are accepted.
    for (const [code, changes] of [
      ['min-retention', { initial_settings: { audit_retention_days: '2555' } }],
      ['max-retention', { initial_settings: { audit_retention_days: '36500' } }],
      ['same-currency', { initial_settings: { base_currency: 'kes' } }],
      ['fixed-offset', { timezone: 'Etc/GMT-3' }],
    ] as const) {
      expect((await create(code, changes)).status(), code).toBe(201);
    }
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
    // Jane drafted and submitted Umoja, so she can't approve it (maker-checker, its own code:
    // BG-08).
    const maker = 'lifecycle.approver_is_tenant_maker';
    const own = await request.post(api(`${umoja}/approve`), { headers, data: {} });
    expect(own.status()).toBe(403);
    expect(await own.json()).toMatchObject({ code: maker });
    // Nor reject it.
    const ownReject = await request.post(api(`${umoja}/reject`), {
      headers,
      data: { reason: 'Changed my mind' },
    });
    expect(ownReject.status()).toBe(403);
    expect(await ownReject.json()).toMatchObject({ code: maker });
    // Another operator drafted Mwangaza, but Jane submitted it: the submitter alone is refused too.
    const submittedOnly = await request.post(
      api(`/platform/tenants/${TENANT_SCENARIO_IDS.mwangaza}/approve`),
      { headers, data: {} },
    );
    expect(submittedOnly.status()).toBe(403);
    expect(await submittedOnly.json()).toMatchObject({ code: maker });

    const once = { ...headers, 'Idempotency-Key': randomUUID() };
    const harambee = api(`/platform/tenants/${TENANT_SCENARIO_IDS.harambee}/approve`);
    // Platform #179 (BG-01): an optional remark of at most 500 characters, and no other property,
    // both refused before the transition runs.
    const long = await request.post(harambee, { headers, data: { reason: 'x'.repeat(501) } });
    expect(long.status()).toBe(400);
    expect(await long.json()).toMatchObject({
      code: 'validation_failed',
      violations: [{ field: 'reason' }],
    });
    const extra = await request.post(harambee, {
      headers,
      data: { reason: 'KYC pack reviewed', remark: 'x' },
    });
    expect(extra.status()).toBe(400);
    expect(await extra.json()).toMatchObject({ code: 'invalid_json' });
    const approved = await request.post(harambee, { headers: once, data: {} });
    expect(approved.status()).toBe(202);
    expect(await approved.json()).toMatchObject({ status: 'ACTIVE', bootstrap_status: 'QUEUED' });
    // The same key replays the stored 202 instead of failing a second transition (index item 2).
    const replay = await request.post(harambee, { headers: once, data: {} });
    expect(replay.status()).toBe(202);
    expect(replay.headers()['idempotency-replayed']).toBe('true');
  });

  test('approves with a remark of exactly 500 characters, or with no body at all', async ({
    request,
  }) => {
    const headers = await signIn(request, 'platform-tenants', IDS.platformOrganisation);
    const harambee = api(`/platform/tenants/${TENANT_SCENARIO_IDS.harambee}/approve`);
    const approved = await request.post(harambee, {
      headers,
      data: { reason: 'x'.repeat(500) },
    });
    expect(approved.status()).toBe(202);
    // The remark becomes the status reason, as every transition's reason does.
    expect(await approved.json()).toMatchObject({
      status: 'ACTIVE',
      status_reason: 'x'.repeat(500),
    });

    const fresh = await signIn(request, 'platform-tenants', IDS.platformOrganisation);
    // `@RequestBody(required = false)`: no body is `{}`, and no remark is a null reason.
    const bare = await request.post(harambee, { headers: fresh });
    expect(bare.status()).toBe(202);
    expect(await bare.json()).toMatchObject({ status_reason: null });
  });

  test('returns a pending request to draft with its reason, refusing its makers, and clears the reason on the next submission (BG-01)', async ({
    request,
  }) => {
    const headers = await signIn(request, 'platform-tenants', IDS.platformOrganisation);
    const harambee = `/platform/tenants/${TENANT_SCENARIO_IDS.harambee}`;

    // ReturnTenantRequest: a required reason of 3–500 characters, and no other property.
    for (const data of [{}, { reason: 'ab' }, { reason: 'x'.repeat(501) }]) {
      const refused = await request.post(api(`${harambee}/return`), { headers, data });
      expect(refused.status(), JSON.stringify(data)).toBe(400);
    }
    const extra = await request.post(api(`${harambee}/return`), {
      headers,
      data: { reason: 'Fix the name', note: 'x' },
    });
    expect(await extra.json()).toMatchObject({ code: 'invalid_json' });

    // Jane submitted Mwangaza: its maker can't return it, by name (TenantCheckerRule).
    const own = await request.post(
      api(`/platform/tenants/${TENANT_SCENARIO_IDS.mwangaza}/return`),
      {
        headers,
        data: { reason: 'Changed my mind' },
      },
    );
    expect(own.status()).toBe(403);
    expect(await own.json()).toMatchObject({ code: 'lifecycle.approver_is_tenant_maker' });

    const once = { ...headers, 'Idempotency-Key': randomUUID() };
    const returned = await request.post(api(`${harambee}/return`), {
      headers: once,
      data: { reason: '  Attach the registration certificate  ' },
    });
    expect(returned.status()).toBe(200);
    // Back to a draft: the reason trimmed, the bootstrap record a draft again with its submission
    // forgotten, and the drafted administrator shown to Jane, who may amend it.
    expect(await returned.json()).toMatchObject({
      status: 'DRAFT',
      status_reason: 'Attach the registration certificate',
      bootstrap_status: 'DRAFT',
      requested_by: null,
      submitted_by: null,
      admin: { email: 'okello@harambee.example', send_application_invite: false },
    });
    const replay = await request.post(api(`${harambee}/return`), {
      headers: once,
      data: { reason: '  Attach the registration certificate  ' },
    });
    expect(replay.headers()['idempotency-replayed']).toBe('true');
    // Not pending any more: the state's 409.
    const again = await request.post(api(`${harambee}/return`), {
      headers,
      data: { reason: 'Attach the registration certificate' },
    });
    expect(again.status()).toBe(409);
    expect(await again.json()).toMatchObject({ code: 'conflict' });

    // An amend is no transition, so the reason stays; the next submission clears it.
    const amended = await request.patch(api(harambee), {
      headers,
      data: {
        tenant_code: 'harambee-farmers',
        display_name: 'Harambee Farmers SACCO',
        country_code: 'UG',
        base_currency_code: 'UGX',
        timezone: 'Africa/Kampala',
      },
    });
    expect(await amended.json()).toMatchObject({
      status_reason: 'Attach the registration certificate',
    });
    const resubmitted = await request.post(api(`${harambee}/submit`), { headers, data: {} });
    expect(await resubmitted.json()).toMatchObject({
      status: 'PENDING_APPROVAL',
      status_reason: null,
      bootstrap_status: 'PENDING_ACTIVATION',
    });

    // tenant.reject is the gate: the read-only operator gets the plain 403.
    const readOnly = await signIn(request, 'platform-operator', IDS.platformOrganisation);
    const forbidden = await request.post(api(`${harambee}/return`), {
      headers: readOnly,
      data: { reason: 'Attach the registration certificate' },
    });
    expect(forbidden.status()).toBe(403);
    expect(await forbidden.json()).toMatchObject({ code: 'forbidden' });
  });

  test('amends keeping what it leaves out, clearing a null, and replacing the administrator whole (BG-14)', async ({
    request,
  }) => {
    const headers = await signIn(request, 'platform-tenants', IDS.platformOrganisation);
    const umoja = api(`/platform/tenants/${TENANT_SCENARIO_IDS.umoja}`);
    const amend = (data: Record<string, unknown>) => request.patch(umoja, { headers, data });

    // Seeded as returned: its reason, legal identity and administrator all come back.
    expect(await (await request.get(umoja, { headers })).json()).toMatchObject({
      legal_name: 'Umoja Teachers Co-operative Society Ltd',
      registration_number: null,
      status_reason: LONG_RETURN_REASON,
      admin: UMOJA_ADMIN,
    });

    // Absent keeps (and an amend leaves the status reason alone).
    const kept = await amend({ ...UMOJA_REQUIRED, display_name: 'Umoja Teachers Co-op SACCO' });
    expect(kept.status()).toBe(200);
    expect(await kept.json()).toMatchObject({
      display_name: 'Umoja Teachers Co-op SACCO',
      legal_name: 'Umoja Teachers Co-operative Society Ltd',
      status_reason: LONG_RETURN_REASON,
      admin: UMOJA_ADMIN,
    });
    // `null` clears; a string sets; `admin: null` keeps, like an absent one.
    const cleared = await amend({
      ...UMOJA_REQUIRED,
      legal_name: null,
      registration_number: 'CS/2019/0042',
      admin: null,
    });
    expect(await cleared.json()).toMatchObject({
      legal_name: null,
      registration_number: 'CS/2019/0042',
      admin: UMOJA_ADMIN,
    });

    // A sent admin states send_application_invite (AmendInitialAdminDto's @NotNull)...
    const { send_application_invite: _invite, ...withoutInvite } = UMOJA_ADMIN;
    const noInvite = await amend({ ...UMOJA_REQUIRED, admin: withoutInvite });
    expect(noInvite.status()).toBe(400);
    expect(await noInvite.json()).toMatchObject({
      code: 'validation_failed',
      violations: [{ field: 'admin.send_application_invite', code: 'NotNull' }],
    });
    // ...and replaces the administrator whole.
    const replaced = await amend({
      ...UMOJA_REQUIRED,
      admin: { ...UMOJA_ADMIN, phone_e164: '+254712000299', send_application_invite: false },
    });
    expect(await replaced.json()).toMatchObject({
      admin: { ...UMOJA_ADMIN, phone_e164: '+254712000299', send_application_invite: false },
    });

    // The Optional fields are bounded by the controller: a 400 with no violations.
    const long = await amend({ ...UMOJA_REQUIRED, legal_name: 'x'.repeat(101) });
    expect(long.status()).toBe(400);
    expect(await long.json()).toMatchObject({ code: 'validation_failed', violations: null });

    // A business date is applied (dd-MM-yyyy, or it fails to bind); settings can't be amended.
    expect((await amend({ ...UMOJA_REQUIRED, business_date: '05-10-2026' })).status()).toBe(200);
    const isoDate = await amend({ ...UMOJA_REQUIRED, business_date: '2026-10-05' });
    expect(await isoDate.json()).toMatchObject({ code: 'invalid_json' });
    const settings = await amend({
      ...UMOJA_REQUIRED,
      initial_settings: { audit_retention_days: '3650' },
    });
    expect(settings.status()).toBe(422);
    expect(await settings.json()).toMatchObject({ code: 'invalid_operation' });
    expect((await amend({ ...UMOJA_REQUIRED, initial_settings: {} })).status()).toBe(200);
  });

  test('shows the drafted administrator only to an amender, and only while it is a draft (BG-14)', async ({
    request,
  }) => {
    const umoja = api(`/platform/tenants/${TENANT_SCENARIO_IDS.umoja}`);
    const noAmend = await signIn(request, 'platform-tenants-no-amend', IDS.platformOrganisation);
    expect(await (await request.get(umoja, { headers: noAmend })).json()).toMatchObject({
      status: 'DRAFT',
      legal_name: 'Umoja Teachers Co-operative Society Ltd',
      admin: null,
    });
    // Harambee holds one, but is no draft.
    const headers = await signIn(request, 'platform-tenants', IDS.platformOrganisation);
    const harambee = api(`/platform/tenants/${TENANT_SCENARIO_IDS.harambee}`);
    expect(await (await request.get(harambee, { headers })).json()).toMatchObject({
      status: 'PENDING_APPROVAL',
      registration_number: 'CS/2018/0117',
      admin: null,
    });
  });

  // JooqInitialAdministratorBootstrapStore.amendDraft updates the bootstrap row, so a draft with
  // none (a SQL-seeded tenant) keeps none: a sent administrator is validated, then discarded.
  test('discards an administrator sent for a draft with no bootstrap record (BG-14)', async ({
    request,
  }) => {
    const headers = await signIn(
      request,
      'platform-tenants-no-administrator',
      IDS.platformOrganisation,
    );
    const umoja = api(`/platform/tenants/${TENANT_SCENARIO_IDS.umoja}`);
    expect(await (await request.get(umoja, { headers })).json()).toMatchObject({
      status: 'DRAFT',
      admin: null,
    });

    const { send_application_invite: _invite, ...withoutInvite } = UMOJA_ADMIN;
    const invalid = await request.patch(umoja, {
      headers,
      data: { ...UMOJA_REQUIRED, admin: withoutInvite },
    });
    expect(invalid.status()).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: 'validation_failed' });

    const amended = await request.patch(umoja, {
      headers,
      data: { ...UMOJA_REQUIRED, display_name: 'Umoja Teachers Co-op SACCO', admin: UMOJA_ADMIN },
    });
    expect(amended.status()).toBe(200);
    expect(await amended.json()).toMatchObject({
      display_name: 'Umoja Teachers Co-op SACCO',
      admin: null,
    });
  });

  // ReactivateTenantRequest bounds its optional reason at 500 too (6a8ea28).
  test('reactivates with a reason of at most 500 characters', async ({ request }) => {
    const headers = await signIn(request, 'platform-tenants', IDS.platformOrganisation);
    const kilimo = api(`/platform/tenants/${TENANT_SCENARIO_IDS.kilimo}/reactivate`);
    const long = await request.post(kilimo, { headers, data: { reason: 'x'.repeat(501) } });
    expect(long.status()).toBe(400);
    expect(await long.json()).toMatchObject({
      code: 'validation_failed',
      violations: [{ field: 'reason' }],
    });
    // Still SUSPENDED: refused before the transition runs.
    const reactivated = await request.post(kilimo, {
      headers,
      data: { reason: 'x'.repeat(500) },
    });
    expect(reactivated.status()).toBe(200);
    expect(await reactivated.json()).toMatchObject({ status: 'ACTIVE' });
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
    // BG-07: an unknown tenant on reject is a 404.
    const unknown = await request.post(api(`/platform/tenants/${randomUUID()}/reject`), {
      headers,
      data: { reason: 'Unknown tenant' },
    });
    expect(unknown.status()).toBe(404);
    expect(await unknown.json()).toMatchObject({ code: 'resource_not_found' });

    // The state before validateAmend: settings an amend can't take don't hide the 409.
    const notDraft = await request.patch(api(acme), {
      headers,
      data: { ...DRAFT, tenant_code: 'acme' },
    });
    expect(notDraft.status()).toBe(409);
    const { initial_settings: _settings, ...amendable } = DRAFT;
    const amended = await request.patch(api(`/platform/tenants/${TENANT_SCENARIO_IDS.umoja}`), {
      headers,
      data: {
        ...amendable,
        tenant_code: 'umoja-teachers',
        display_name: 'Umoja Teachers Co-operative SACCO',
      },
    });
    expect(await amended.json()).toMatchObject({
      tenant_code: 'umoja-teachers',
      display_name: 'Umoja Teachers Co-operative SACCO',
      status: 'DRAFT',
    });
    // BG-07: another institution's code is the generic 409 on amend too.
    const takenOnAmend = await request.patch(
      api(`/platform/tenants/${TENANT_SCENARIO_IDS.umoja}`),
      { headers, data: { ...amendable, tenant_code: 'acme' } },
    );
    expect(takenOnAmend.status()).toBe(409);
    expect(await takenOnAmend.json()).toMatchObject({ code: 'conflict' });

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
      acme: 'ACTIVE',
      'umoja-teachers': 'DRAFT',
      'harambee-farmers': 'PENDING_APPROVAL',
      'mwangaza-savings': 'PENDING_APPROVAL',
      'pwani-fishermen': 'ACTIVE',
      'kilimo-bora': 'SUSPENDED',
      'nairobi-metro-teachers': 'REJECTED',
    });
  });

  test('leaves the platform organisation out of the list and its total unless include_platform=true (platform #283)', async ({
    request,
  }) => {
    const headers = await signIn(request, 'platform-tenants', IDS.platformOrganisation);
    const read = async (query: string) =>
      (await (await request.get(api(`/platform/tenants?${query}`), { headers })).json()) as {
        items: { id: string }[];
        page: { total_items: number };
      };
    const without = await read('size=100&status=ACTIVE');
    expect(without.items.map((tenant) => tenant.id)).not.toContain(IDS.platformOrganisation);
    const withIt = await read('size=100&status=ACTIVE&include_platform=true');
    expect(withIt.items.map((tenant) => tenant.id)).toContain(IDS.platformOrganisation);
    expect(withIt.page.total_items).toBe(without.page.total_items + 1);
  });

  test('answers an off-list sort_by or sort_dir as a 400, including names every object inherits', async ({
    request,
  }) => {
    const headers = await signIn(request, 'platform-tenants', IDS.platformOrganisation);
    // BG-26: only the four camelCase keys sort; a name from Object.prototype is no key.
    for (const sortBy of ['tenant_code', 'toString', 'constructor', '__proto__']) {
      const refused = await request.get(api(`/platform/tenants?sort_by=${sortBy}`), { headers });
      expect(refused.status(), sortBy).toBe(400);
      expect(await refused.json()).toMatchObject({
        code: 'invalid_parameter',
        violations: [
          {
            field: 'sort_by',
            message: 'Sort field must be one of: countryCode, createdAt, displayName, tenantCode.',
          },
        ],
      });
    }
    const sideways = await request.get(api('/platform/tenants?sort_dir=sideways'), { headers });
    expect(sideways.status()).toBe(400);
    expect(await sideways.json()).toMatchObject({ violations: [{ field: 'sort_dir' }] });
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
    // BG-30: a stable code, with the sentence in the detail.
    expect(await wrongContext.json()).toMatchObject({
      code: 'platform_context_required',
      detail: 'Reserved platform organisation context is required for this route.',
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

  test("answers an unknown tenant's suspend with a 404 and a rejected tenant's code with a 409 (BG-07, BG-28)", async ({
    request,
  }) => {
    const headers = await signIn(request, 'platform-tenants', IDS.platformOrganisation);

    // BG-07: suspend, like reject, answers an unknown tenant with a 404.
    const unknown = await request.post(
      api('/platform/tenants/00000000-0000-4000-8000-0000000000ff/suspend'),
      { headers, data: { reason: 'Compliance review' } },
    );
    expect(unknown.status()).toBe(404);
    expect(await unknown.json()).toMatchObject({ code: 'resource_not_found' });

    // BG-28: a rejected tenant keeps its code, so a new draft under it is a 409 too (BG-07).
    const taken = await request.post(api('/platform/tenants'), {
      headers,
      data: { ...DRAFT, tenant_code: 'nairobi-metro-teachers' },
    });
    expect(taken.status()).toBe(409);
    expect(await taken.json()).toMatchObject({ code: 'conflict' });
  });
});
