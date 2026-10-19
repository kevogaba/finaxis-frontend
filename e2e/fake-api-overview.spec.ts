import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import {
  IDS,
  OVERVIEW_SCENARIO_IDS as OVERVIEW,
  OVERVIEW_SCENARIO_TEXT as TEXT,
  seedScenario,
  type ScenarioName,
} from './fake-api/scenarios.mts';
import { api, contextFor } from './support/fake-api';

interface Paged<T> {
  items: T[];
  page: { total_items: number };
}

const read = async <T>(response: APIResponse): Promise<T> => (await response.json()) as T;

/** A fresh run of `scenario` at institution level, reading through the fake's routes. */
async function signIn(request: APIRequestContext, scenario: ScenarioName) {
  const headers = await contextFor(request, scenario, null);
  return (path: string) => request.get(api(path), { headers });
}

const total = async (response: APIResponse) =>
  (await read<Paged<unknown>>(response)).page.total_items;

test.describe('fake API: the overview scenarios (layer 14)', () => {
  test('overview-attention: four pending members newest first, one of them provisioning', async ({
    request,
  }) => {
    const get = await signIn(request, 'overview-attention');
    const pending = await read<Paged<{ id: string; user_status: string; email: string }>>(
      await get('/tenant/users?membership_status=PENDING_APPROVAL&page=0&size=5'),
    );
    expect(pending.items.map((row) => row.id)).toEqual([
      OVERVIEW.wanjiku,
      OVERVIEW.baraka,
      OVERVIEW.nyokabi,
      OVERVIEW.halima,
    ]);
    expect(pending.items[1]?.user_status).toBe('PROVISIONING_IDP');
    expect(pending.items[2]?.email).toBe(TEXT.longEmail);
    expect(
      await total(
        await get(
          '/tenant/users?membership_status=PENDING_APPROVAL&user_status=PROVISIONING_IDP&page=0&size=1',
        ),
      ),
    ).toBe(1);
  });

  test('overview-attention: three branches waiting, newest first, beside two active ones', async ({
    request,
  }) => {
    const get = await signIn(request, 'overview-attention');
    const waiting = await read<Paged<{ id: string; branch_name: string }>>(
      await get('/branches?status=PENDING_APPROVAL&sort_by=createdAt&sort_dir=DESC&page=0&size=5'),
    );
    expect(waiting.items.map((row) => row.id)).toEqual([
      OVERVIEW.malindi,
      OVERVIEW.nyeri,
      OVERVIEW.kakamega,
    ]);
    expect(waiting.items[0]?.branch_name).toHaveLength(100);
    expect(
      await total(await get('/branches?status=ACTIVE&sort_by=createdAt&sort_dir=DESC&size=1')),
    ).toBe(2);
  });

  test('overview-attention: one active member, no locale settings, the date closed', async ({
    request,
  }) => {
    const get = await signIn(request, 'overview-attention');
    expect(await total(await get('/tenant/memberships?membership_status=ACTIVE&size=1'))).toBe(1);
    const settings = await read<Paged<{ key: string; value: string | null }>>(
      await get('/tenant/settings?size=100'),
    );
    expect(
      settings.items
        .filter((row) => row.key === 'default_timezone' || row.key === 'base_currency')
        .map((row) => row.value),
    ).toEqual([null, null]);
    expect(await read<{ status: string }>(await get('/tenant/business-date'))).toMatchObject({
      current_business_date: '07-09-2026',
      status: 'CLOSED',
    });
    const events = await read<Paged<{ id: string; actor_id: string | null }>>(
      await get('/tenant/audit-events?page=0&size=5'),
    );
    expect(events.items[0]).toMatchObject({ id: OVERVIEW.welcomeEvent, actor_id: null });
  });

  test('overview-ready: two active members, and nothing waits', async ({ request }) => {
    const get = await signIn(request, 'overview-ready');
    expect(await total(await get('/tenant/memberships?membership_status=ACTIVE&size=1'))).toBe(2);
    expect(await total(await get('/tenant/users?membership_status=PENDING_APPROVAL&size=1'))).toBe(
      0,
    );
    expect(await total(await get('/branches?status=PENDING_APPROVAL&size=1'))).toBe(0);
    expect(await read<{ status: string }>(await get('/tenant/business-date'))).toMatchObject({
      status: 'OPEN',
    });
  });

  test('overview-limited: the attention data without five codes, refusing those reads', async ({
    request,
  }) => {
    const codes = (scenario: ScenarioName) =>
      seedScenario(scenario).roles.find((role) => role.id === IDS.tenantAdminRole)?.permissions ??
      [];
    expect(codes('overview-attention')).toEqual(
      expect.arrayContaining(['user.approve', 'branch.activate', 'audit.view']),
    );
    expect(codes('default')).not.toContain('user.approve');
    expect(codes('default')).not.toContain('branch.activate');
    const limited = codes('overview-limited');
    for (const code of [
      'business_date.view',
      'audit.view',
      'membership.view',
      'settings.view',
      'user.approve',
    ]) {
      expect(limited).not.toContain(code);
    }
    expect(limited).toEqual(
      expect.arrayContaining(['branch.activate', 'branch.view', 'user.view']),
    );
    const get = await signIn(request, 'overview-limited');
    expect((await get('/tenant/business-date')).status()).toBe(403);
    expect((await get('/tenant/memberships?membership_status=ACTIVE&size=1')).status()).toBe(403);
  });

  test('overview-branch-scoped: branch codes held at Head Office only, so the branch reads are refused', async ({
    request,
  }) => {
    const headers = await contextFor(request, 'overview-branch-scoped', IDS.headOffice);
    const get = (path: string) => request.get(api(path), { headers });
    const me = await read<{ permissions: string[] }>(await get('/auth/me'));
    expect(me.permissions).toEqual(expect.arrayContaining(['branch.view', 'branch.activate']));
    expect((await get('/branches?status=ACTIVE&size=1')).status()).toBe(403);
    expect(
      (
        await get('/branches?status=PENDING_APPROVAL&sort_by=createdAt&sort_dir=DESC&page=0&size=5')
      ).status(),
    ).toBe(403);
    expect(
      (await get('/tenant/users?membership_status=PENDING_APPROVAL&page=0&size=5')).status(),
    ).toBe(200);
  });
});
