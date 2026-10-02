import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { IDS } from './fake-api/scenarios.mts';

const FAKE_API_URL = `http://127.0.0.1:${process.env.FAKE_API_PORT ?? '3199'}`;
const SETTINGS = `${FAKE_API_URL}/api/v1/tenant/settings`;

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
}

async function list(request: APIRequestContext, headers: Record<string, string>) {
  const response = await request.get(`${SETTINGS}?size=100`, { headers });
  return ((await response.json()) as { items: Item[] }).items;
}

test.describe('fake API tenant settings', () => {
  test('lists the catalogue with defaults and stored extras by key, masking the platform-only value', async ({
    request,
  }) => {
    const items = await list(request, await tenantHeaders(request));

    expect(items.map((item) => item.key)).toEqual([
      'audit_retention_days',
      'base_currency',
      'business-date.timezone',
      'business_date_auto_advance_enabled',
      'default_timezone',
      'require_maker_checker_for_branch_creation',
      'require_maker_checker_for_user_invites',
      'settings.operational',
    ]);
    const value = (key: string) => items.find((item) => item.key === key)?.value;
    expect(value('audit_retention_days')).toBe('***REDACTED***');
    expect(value('business_date_auto_advance_enabled')).toBe('false');
    expect(value('base_currency')).toBe('KES');
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
      expect.objectContaining({ value: null }),
    );
  });

  test('canonicalises writes, rejects bad values, and guards the platform key and a frozen currency', async ({
    request,
  }) => {
    const headers = await tenantHeaders(request);
    const put = (key: string, value: string) =>
      request.put(`${SETTINGS}/${key}`, {
        headers: { ...headers, 'Idempotency-Key': randomUUID() },
        data: { value },
      });

    const written = await put('base_currency', 'ugx');
    expect(written.status()).toBe(200);
    expect(await written.json()).toMatchObject({ key: 'base_currency', value: 'UGX' });
    expect(await (await put('base_currency', 'XXX')).json()).toMatchObject({
      status: 422,
      code: 'accounting.currency_invalid',
    });
    expect(await (await put('default_timezone', 'Mars/Olympus')).json()).toMatchObject({
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
    expect((await put('audit_retention_days', '30')).status()).toBe(403);

    const frozen = await tenantHeaders(request, 'settings-currency-frozen');
    const reset = await request.delete(`${SETTINGS}/base_currency`, {
      headers: { ...frozen, 'Idempotency-Key': randomUUID() },
    });
    expect(await reset.json()).toMatchObject({
      status: 409,
      code: 'accounting.functional_currency_frozen',
    });
  });
});
