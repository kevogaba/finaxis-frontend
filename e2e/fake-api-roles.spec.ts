import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { IDS, ROLE_SCENARIO_IDS } from './fake-api/scenarios.mts';

const FAKE_API_URL = `http://127.0.0.1:${process.env.FAKE_API_PORT ?? '3199'}`;
const api = (path: string) => `${FAKE_API_URL}/api/v1${path}`;

/** Headers for a fresh run: at one branch, or at institution level (`null`). */
async function contextFor(
  request: APIRequestContext,
  scenario: string,
  branchId: string | null,
): Promise<Record<string, string>> {
  const bearer = { Authorization: `Bearer e2e.${scenario}.${randomUUID()}` };
  const organisation = await request.post(api('/auth/select-organisation'), {
    headers: bearer,
    data: { organisation_id: IDS.greenfield },
  });
  const { context_token: institution } = (await organisation.json()) as { context_token: string };
  if (branchId === null) return { ...bearer, 'X-Active-Organisation-Context': institution };
  const branch = await request.post(api('/auth/select-branch'), {
    headers: { ...bearer, 'X-Active-Organisation-Context': institution },
    data: { branch_id: branchId },
  });
  const { context_token: pinned } = (await branch.json()) as { context_token: string };
  return { ...bearer, 'X-Active-Organisation-Context': pinned };
}

test.describe('fake API roles (contract §E.3)', () => {
  test('lists, filters, and sorts roles; an off-list sort is a 500', async ({ request }) => {
    const headers = await contextFor(request, 'roles', null);
    const all = (await (await request.get(api('/tenant/roles'), { headers })).json()) as {
      items: { role_code: string }[];
      page: { total_items: number };
    };
    expect(all.page.total_items).toBe(6);
    // Newest first by default (createdAt DESC, contract §E.3).
    expect(all.items[0]?.role_code).toBe('COMPLIANCE');
    // toMatchObject matches arrays by length too, so this asserts exactly the two system roles.
    const system = await request.get(
      api('/tenant/roles?system_role=true&sort_by=roleName&sort_dir=ASC'),
      { headers },
    );
    expect(await system.json()).toMatchObject({
      items: [{ role_code: 'BRANCH_MANAGER' }, { role_code: 'TENANT_ADMIN' }],
      page: { total_items: 2 },
    });
    expect((await request.get(api('/tenant/roles?sort_by=role_name'), { headers })).status()).toBe(
      500,
    );
  });

  test('keeps system roles immutable and edits a custom one', async ({ request }) => {
    const headers = await contextFor(request, 'roles', null);
    const system = await request.patch(api(`/tenant/roles/${IDS.tenantAdminRole}`), {
      headers,
      data: { role_name: 'Admin', description: null },
    });
    expect(system.status()).toBe(409);
    const edited = await request.patch(api(`/tenant/roles/${ROLE_SCENARIO_IDS.teller}`), {
      headers,
      data: { role_name: 'Senior teller', description: null },
    });
    expect(await edited.json()).toMatchObject({
      role_name: 'Senior teller',
      description: 'Front-desk cash and member service.',
    });
    const disabled = await request.post(
      api(`/tenant/roles/${ROLE_SCENARIO_IDS.teller}/deactivate`),
      { headers, data: {} },
    );
    expect(await disabled.json()).toMatchObject({ status: 'DISABLED' });
  });

  test('grants idempotently, lists newest first, and removes by grant id', async ({ request }) => {
    const headers = await contextFor(request, 'roles', null);
    const path = `/tenant/roles/${ROLE_SCENARIO_IDS.teller}/permissions`;
    const keyed = { ...headers, 'Idempotency-Key': randomUUID() };
    const first = await request.post(api(path), {
      headers: keyed,
      data: { permission_code: 'cob.start' },
    });
    expect(first.status()).toBe(201);
    const replay = await request.post(api(path), {
      headers: keyed,
      data: { permission_code: 'cob.start' },
    });
    expect(replay.headers()['idempotency-replayed']).toBe('true');

    const grants = (await (await request.get(api(path), { headers })).json()) as {
      items: { id: string; permission_code: string }[];
    };
    expect(grants.items.map((grant) => grant.permission_code)).toEqual([
      'cob.start',
      'branch.view',
      'business_date.view',
    ]);
    expect(
      (await request.post(api(path), { headers, data: { permission_code: 'nope.view' } })).status(),
    ).toBe(404);
    const removed = await request.delete(api(`${path}/${grants.items[0]?.id ?? ''}`), { headers });
    expect(await removed.json()).toMatchObject({ page: { total_items: 2 } });
  });

  test('scopes role assignments like the backend', async ({ request }) => {
    const institution = await contextFor(request, 'roles', null);
    const assign = (headers: Record<string, string>, data: Record<string, unknown>) =>
      request.post(api('/tenant/role-assignments'), { headers, data });
    const tom = { user_id: ROLE_SCENARIO_IDS.tom, role_id: ROLE_SCENARIO_IDS.opsSupervisor };

    // Tom is assigned at Head Office only: Westlands is the guard's 409.
    expect(
      (
        await assign(institution, { ...tom, scope_type: 'BRANCH', branch_id: IDS.westlands })
      ).status(),
    ).toBe(409);
    expect(
      (
        await assign(institution, { ...tom, scope_type: 'BRANCH', branch_id: IDS.headOffice })
      ).status(),
    ).toBe(201);
    expect(
      (
        await assign(institution, { ...tom, scope_type: 'TENANT', branch_id: IDS.headOffice })
      ).status(),
    ).toBe(422);
    // Source f74e44b: requireNotNull before the service's check — BG-07's 500.
    expect(
      (await assign(institution, { ...tom, scope_type: 'BRANCH', branch_id: null })).status(),
    ).toBe(500);

    const atHeadOffice = await contextFor(request, 'roles', IDS.headOffice);
    expect(
      (
        await assign(atHeadOffice, {
          user_id: ROLE_SCENARIO_IDS.grace,
          role_id: ROLE_SCENARIO_IDS.opsSupervisor,
          scope_type: 'BRANCH',
          branch_id: IDS.westlands,
        })
      ).status(),
    ).toBe(404);

    const holders = await request.get(
      api(`/tenant/role-assignments?role_id=${ROLE_SCENARIO_IDS.teller}&status=ACTIVE`),
      { headers: institution },
    );
    expect(await holders.json()).toMatchObject({ page: { total_items: 2 } });
    const revoked = await request.delete(
      api(`/tenant/role-assignments/${ROLE_SCENARIO_IDS.tomTeller}`),
      { headers: institution },
    );
    expect(await revoked.json()).toMatchObject({ status: 'REVOKED' });
  });

  test('restricts only a BRANCH-scoped revoke at another branch (contract §E.4)', async ({
    request,
  }) => {
    const atHeadOffice = await contextFor(request, 'roles', IDS.headOffice);
    const holders = api(
      `/tenant/role-assignments?role_id=${ROLE_SCENARIO_IDS.teller}&status=ACTIVE`,
    );

    // Listing is never branch-restricted: Grace's Westlands grant shows from Head Office.
    expect(await (await request.get(holders, { headers: atHeadOffice })).json()).toMatchObject({
      page: { total_items: 2 },
    });
    const elsewhere = await request.delete(
      api(`/tenant/role-assignments/${ROLE_SCENARIO_IDS.graceTellerAtWestlands}`),
      { headers: atHeadOffice },
    );
    expect(elsewhere.status()).toBe(404);
    // The 404 changed nothing, and a TENANT-scoped assignment is revocable from any branch.
    expect(await (await request.get(holders, { headers: atHeadOffice })).json()).toMatchObject({
      page: { total_items: 2 },
    });
    const tenantScoped = await request.delete(
      api(`/tenant/role-assignments/${ROLE_SCENARIO_IDS.tomTeller}`),
      { headers: atHeadOffice },
    );
    expect(await tenantScoped.json()).toMatchObject({ status: 'REVOKED' });
  });

  test('rejects unknown properties and lists the catalogue', async ({ request }) => {
    const headers = await contextFor(request, 'roles', null);
    const camel = await request.post(api('/tenant/roles'), { headers, data: { roleCode: 'X1' } });
    expect(await camel.json()).toMatchObject({ code: 'invalid_json' });
    const critical = await request.get(api('/tenant/permissions?risk_level=CRITICAL&size=100'), {
      headers,
    });
    expect(await critical.json()).toMatchObject({ page: { total_items: 9 } });
  });

  test('roles-limited drops only update, activate, assignment-view and audit', async ({
    request,
  }) => {
    const headers = await contextFor(request, 'roles-limited', null);
    const teller = api(`/tenant/roles/${ROLE_SCENARIO_IDS.teller}`);
    const status = async (call: Promise<{ status(): number }>) => (await call).status();

    expect(await status(request.get(api('/tenant/roles'), { headers }))).toBe(200);
    expect(
      await status(request.patch(teller, { headers, data: { role_name: 'X', description: null } })),
    ).toBe(403);
    expect(await status(request.post(`${teller}/activate`, { headers, data: {} }))).toBe(403);
    expect(await status(request.get(api('/tenant/role-assignments'), { headers }))).toBe(403);
    expect(await status(request.get(api('/tenant/audit-events'), { headers }))).toBe(403);
    // Everything else the roles scenario grants stays.
    expect(await status(request.post(`${teller}/deactivate`, { headers, data: {} }))).toBe(200);
  });
});
