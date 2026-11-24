import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { IDS } from './fake-api/scenarios.mts';

const FAKE_API_URL = `http://127.0.0.1:${process.env.FAKE_API_PORT ?? '3199'}`;
const SETTINGS = `${FAKE_API_URL}/api/v1/tenant/settings`;
const INVITES = 'require_maker_checker_for_user_invites';
const ADVANCE = 'business_date_auto_advance_enabled';

async function tenantHeaders(request: APIRequestContext, scenario = 'default') {
  const authorization = { Authorization: `Bearer e2e.${scenario}.${randomUUID()}` };
  const selection = await request.post(`${FAKE_API_URL}/api/v1/auth/select-organisation`, {
    headers: authorization,
    data: { organisation_id: IDS.greenfield },
  });
  const { context_token: contextToken } = (await selection.json()) as { context_token: string };
  return { ...authorization, 'X-Active-Organisation-Context': contextToken };
}

interface Item {
  key: string;
  value: string | null;
  is_default: boolean;
  label: string | null;
  group: string | null;
}

async function list(request: APIRequestContext, headers: Record<string, string>) {
  const response = await request.get(`${SETTINGS}?size=100`, { headers });
  return ((await response.json()) as { items: Item[] }).items;
}

test.describe('fake API tenant settings', () => {
  test("lists the catalogue by key with its metadata, the organisation's currency, and stored extras", async ({
    request,
  }) => {
    const items = await list(request, await tenantHeaders(request));

    // settings.operational is the platform's own row: stored, never listed.
    expect(items.map((item) => item.key)).toEqual([
      'audit_retention_days',
      'base_currency',
      'business_date_auto_advance_enabled',
      'default_timezone',
      'legacy.operational_profile',
      'require_maker_checker_for_branch_creation',
      'require_maker_checker_for_user_invites',
    ]);
    const item = (key: string) => items.find((candidate) => candidate.key === key);
    expect(item('base_currency')).toEqual({
      key: 'base_currency',
      value: 'KES',
      value_type: 'CURRENCY',
      sensitive: false,
      platform_admin_only: false,
      // A mirror of the organisation's column, never a default.
      is_default: false,
      label: 'Base currency',
      description:
        "The currency the ledger posts in. Read-only: it mirrors the organisation's base currency and cannot be changed here.",
      group: 'General',
    });
    // Unset, so null rather than masked.
    expect(item('audit_retention_days')).toMatchObject({
      value: null,
      is_default: true,
      group: 'Audit',
    });
    expect(item(INVITES)).toMatchObject({
      value: 'true',
      is_default: true,
      label: 'Require maker-checker for user invitations',
      group: 'Approvals',
    });
    expect(item(ADVANCE)).toMatchObject({
      value: 'false',
      is_default: true,
      group: 'Business date',
    });
    expect(item('default_timezone')).toMatchObject({ value: 'Africa/Nairobi', is_default: false });
    expect(item('legacy.operational_profile')).toMatchObject({
      label: null,
      description: null,
      group: null,
    });
  });

  test('replays a reset for the same key as an empty 204, and the default applies', async ({
    request,
  }) => {
    const headers = await tenantHeaders(request);
    const key = randomUUID();
    const reset = () =>
      request.delete(`${SETTINGS}/default_timezone`, {
        headers: { ...headers, 'Idempotency-Key': key },
        data: { reason: 'Back to default' },
      });

    const first = await reset();
    const replay = await reset();

    expect(first.status()).toBe(204);
    expect(replay.status()).toBe(204);
    expect(replay.headers()['idempotency-replayed']).toBe('true');
    expect(await replay.text()).toBe('');
    expect((await list(request, headers)).find((item) => item.key === 'default_timezone')).toEqual(
      expect.objectContaining({ value: null, is_default: true }),
    );
  });

  test('stores a canonical value, replays it, and records a high-severity row for a maker-checker switch', async ({
    request,
  }) => {
    const headers = await tenantHeaders(request);
    const once = { ...headers, 'Idempotency-Key': randomUUID() };
    const put = () =>
      request.put(`${SETTINGS}/${INVITES}`, {
        headers: once,
        data: { value: 'FALSE', reason: 'Two-person team' },
      });

    const written = await put();
    expect(written.status()).toBe(200);
    const body = (await written.json()) as Item;
    expect(body).toMatchObject({ key: INVITES, value: 'false', is_default: false });
    const replay = await put();
    expect(replay.headers()['idempotency-replayed']).toBe('true');
    expect(await replay.json()).toEqual(body);

    const timeZone = await request.put(`${SETTINGS}/default_timezone`, {
      headers: { ...headers, 'Idempotency-Key': randomUUID() },
      data: { value: 'Africa/Kampala' },
    });
    expect(await timeZone.json()).toMatchObject({ value: 'Africa/Kampala', is_default: false });

    const audit = await request.get(
      `${FAKE_API_URL}/api/v1/tenant/audit-events?entity_type=ORGANISATION_SETTING&action=settings.update`,
      { headers },
    );
    const rows = (
      (await audit.json()) as {
        items: { resource_id: string; severity: string }[];
      }
    ).items;
    // One row per write (the replay records none), HIGH for the maker-checker switch only.
    expect(rows.map((row) => [row.resource_id, row.severity]).sort()).toEqual([
      ['default_timezone', 'INFO'],
      [INVITES, 'HIGH'],
    ]);
  });

  test('refuses the base currency, a raw offset, a bad value, an unknown key and the platform key', async ({
    request,
  }) => {
    const headers = await tenantHeaders(request);
    const put = (key: string, value: string) =>
      request.put(`${SETTINGS}/${key}`, {
        headers: { ...headers, 'Idempotency-Key': randomUUID() },
        data: { value },
      });

    expect(await (await put('base_currency', 'UGX')).json()).toMatchObject({
      status: 422,
      code: 'invalid_operation',
    });
    const reset = await request.delete(`${SETTINGS}/base_currency`, {
      headers: { ...headers, 'Idempotency-Key': randomUUID() },
    });
    expect(await reset.json()).toMatchObject({ status: 422, code: 'invalid_operation' });
    for (const zone of ['+03:00', 'UTC+3', 'Mars/Olympus']) {
      expect(await (await put('default_timezone', zone)).json()).toMatchObject({
        status: 422,
        code: 'invalid_operation',
      });
    }
    expect(await (await put(INVITES, 'yes')).json()).toMatchObject({
      status: 422,
      code: 'invalid_operation',
    });
    expect(await (await put('default_timezone', '  ')).json()).toMatchObject({
      status: 400,
      code: 'validation_failed',
    });
    expect(await (await put('nope', 'x')).json()).toMatchObject({
      status: 422,
      code: 'invalid_operation',
    });
    expect((await put('audit_retention_days', '3650')).status()).toBe(403);
    // Nothing was written.
    const items = await list(request, headers);
    expect(items.find((item) => item.key === 'base_currency')?.value).toBe('KES');
    expect(items.find((item) => item.key === INVITES)?.value).toBe('true');
  });

  test('turns automatic advance on only with business_date.advance, and off with settings.update', async ({
    request,
  }) => {
    const headers = await tenantHeaders(request, 'business-date-read-only');
    const put = (value: string) =>
      request.put(`${SETTINGS}/${ADVANCE}`, {
        headers: { ...headers, 'Idempotency-Key': randomUUID() },
        data: { value },
      });

    const on = await put('true');
    expect(on.status()).toBe(403);
    expect(await on.json()).toMatchObject({
      code: 'forbidden',
      detail: 'Missing permission: business_date.advance.',
    });
    expect((await put('false')).status()).toBe(200);

    const admin = await tenantHeaders(request);
    expect(
      (
        await request.put(`${SETTINGS}/${ADVANCE}`, {
          headers: { ...admin, 'Idempotency-Key': randomUUID() },
          data: { value: 'true' },
        })
      ).status(),
    ).toBe(200);
  });
});
