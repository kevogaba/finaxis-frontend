import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { PERMISSION_VIEWS, requiredViews } from '../auth/permission-views';
import { IDS, ROLE_SCENARIO_IDS, USER_SCENARIO_IDS } from './fake-api/scenarios.mts';
import { api, contextFor } from './support/fake-api';

test.describe('fake API roles (contract §E.3)', () => {
  test('lists, filters, and sorts roles; an off-list sort is a 400', async ({ request }) => {
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
    const refused = await request.get(api('/tenant/roles?sort_by=role_name'), { headers });
    expect(refused.status()).toBe(400);
    // BG-26: one violation on the field, naming the allowed keys and never the value.
    expect(await refused.json()).toMatchObject({
      code: 'invalid_parameter',
      violations: [
        {
          field: 'sort_by',
          code: 'invalid_parameter',
          message: 'Sort field must be one of: createdAt, roleCode, roleName, status.',
        },
      ],
    });
  });

  test('answers an off-list sort_by or sort_dir as a 400, including names every object inherits', async ({
    request,
  }) => {
    const headers = await contextFor(request, 'roles', null);
    // BG-26: a name from Object.prototype is no sort key, on the roles list and the catalogue.
    for (const path of ['/tenant/roles', '/tenant/permissions']) {
      for (const sortBy of ['toString', 'constructor', '__proto__']) {
        const refused = await request.get(api(`${path}?sort_by=${sortBy}`), { headers });
        expect(refused.status(), `${path} ${sortBy}`).toBe(400);
        expect(await refused.json()).toMatchObject({ violations: [{ field: 'sort_by' }] });
      }
      const sideways = await request.get(api(`${path}?sort_dir=SIDEWAYS`), { headers });
      expect(sideways.status(), path).toBe(400);
      expect(await sideways.json()).toMatchObject({
        code: 'invalid_parameter',
        violations: [{ field: 'sort_dir', message: 'Sort direction must be ASC or DESC.' }],
      });
      // The direction is read in any case.
      expect((await request.get(api(`${path}?sort_dir=asc`), { headers })).status(), path).toBe(
        200,
      );
    }
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

  test("composes a role only with each mutation's views (ADR 0030)", async ({ request }) => {
    const headers = await contextFor(request, 'roles', null);
    const path = `/tenant/roles/${ROLE_SCENARIO_IDS.teller}/permissions`;
    const grant = (code: string) =>
      request.post(api(path), { headers, data: { permission_code: code } });

    // Teller holds business_date.view and branch.view, but not role_assignment.view.
    const refused = await grant('user.assign_role');
    expect(refused.status()).toBe(400);
    expect(await refused.json()).toMatchObject({ code: 'validation_failed', violations: null });
    expect((await grant('role_assignment.view')).status()).toBe(201);
    expect((await grant('user.assign_role')).status()).toBe(201);

    // A view a held mutation needs can't be removed; re-granting is a no-op.
    const grants = (await (await request.get(api(path), { headers })).json()) as {
      items: { id: string; permission_code: string }[];
    };
    const view = grants.items.find((row) => row.permission_code === 'role_assignment.view');
    const removal = await request.delete(api(`${path}/${view?.id ?? ''}`), { headers });
    expect(removal.status()).toBe(400);
    expect(await removal.json()).toMatchObject({ code: 'validation_failed', violations: null });
    expect((await grant('user.assign_role')).status()).toBe(201);

    // The role reads report a legacy violator's missing views: BRANCH_MANAGER holds
    // user.assign_branch without branch_assignment.view.
    const manager = await request.get(api(`/tenant/roles/${ROLE_SCENARIO_IDS.branchManager}`), {
      headers,
    });
    expect(await manager.json()).toMatchObject({
      missing_view_permissions: ['branch_assignment.view'],
    });
    const list = (await (await request.get(api('/tenant/roles?size=100'), { headers })).json()) as {
      items: { role_code: string; missing_view_permissions: string[] }[];
    };
    expect(list.items.find((row) => row.role_code === 'TELLER')?.missing_view_permissions).toEqual(
      [],
    );
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
    // BG-07: the request's own 400, naming branch_id.
    const noBranch = await assign(institution, { ...tom, scope_type: 'BRANCH', branch_id: null });
    expect(noBranch.status()).toBe(400);
    expect(await noBranch.json()).toMatchObject({
      code: 'validation_failed',
      violations: [{ field: 'branch_id', code: 'BranchScopeRequiresBranch' }],
    });
    // BG-27: a role that isn't ACTIVE can't be newly assigned.
    const disabled = await assign(institution, {
      user_id: ROLE_SCENARIO_IDS.tom,
      role_id: ROLE_SCENARIO_IDS.loansOfficer,
      scope_type: 'TENANT',
      branch_id: null,
    });
    expect(disabled.status()).toBe(422);
    expect(await disabled.json()).toMatchObject({ code: 'invalid_operation' });

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

  // Platform #342 (ADR 0044): below the tenant administrator, nobody adds to their own access.
  test('refuses user.assign_self as a grant, then a held role, in the platform order', async ({
    request,
  }) => {
    const headers = await contextFor(request, 'roles-self', null);
    const grant = (roleId: string, code: string) =>
      request.post(api(`/tenant/roles/${roleId}/permissions`), {
        headers,
        data: { permission_code: code },
      });

    // 409 for a system role comes first, then the 422 for user.assign_self on any role.
    expect((await grant(IDS.tenantAdminRole, 'user.assign_self')).status()).toBe(409);
    const notGrantable = await grant(ROLE_SCENARIO_IDS.compliance, 'user.assign_self');
    expect(notGrantable.status()).toBe(422);
    expect(await notGrantable.json()).toMatchObject({ code: 'invalid_operation' });
    // Jane holds Compliance: even a re-grant, even an unknown code, is the holder 403.
    for (const code of ['audit.view', 'nope.view']) {
      const held = await grant(ROLE_SCENARIO_IDS.compliance, code);
      expect(held.status(), code).toBe(403);
      expect(await held.json()).toMatchObject({
        code: 'forbidden',
        detail: 'Missing permission: user.assign_self.',
      });
    }
    // A role she doesn't hold takes the grant.
    expect((await grant(ROLE_SCENARIO_IDS.teller, 'cob.start')).status()).toBe(201);
  });

  test('refuses re-enabling a held role, and nothing else about its status', async ({
    request,
  }) => {
    const headers = await contextFor(request, 'roles-self', null);
    const status = async (roleId: string, path: 'activate' | 'deactivate') =>
      (await request.post(api(`/tenant/roles/${roleId}/${path}`), { headers, data: {} })).status();

    // Jane holds the DISABLED Loans officer in this scenario.
    expect(await status(ROLE_SCENARIO_IDS.loansOfficer, 'activate')).toBe(403);
    // Deactivating a held role is allowed; re-enabling it is not.
    expect(await status(ROLE_SCENARIO_IDS.compliance, 'deactivate')).toBe(200);
    expect(await status(ROLE_SCENARIO_IDS.compliance, 'activate')).toBe(403);
    // A role she doesn't hold is re-enabled as before.
    expect(await status(ROLE_SCENARIO_IDS.teller, 'deactivate')).toBe(200);
    expect(await status(ROLE_SCENARIO_IDS.teller, 'activate')).toBe(200);
  });

  test('refuses assigning yourself a role or a branch without user.assign_self', async ({
    request,
  }) => {
    const self = await contextFor(request, 'roles-self', null);
    const admin = await contextFor(request, 'roles', null);
    // The roles data has no user.assign_branch; the users data does.
    const usersSelf = await contextFor(request, 'users-self', null);
    const usersAdmin = await contextFor(request, 'users', null);
    const role = (headers: Record<string, string>, userId: string) =>
      request.post(api('/tenant/role-assignments'), {
        headers,
        data: {
          user_id: userId,
          role_id: ROLE_SCENARIO_IDS.opsSupervisor,
          scope_type: 'TENANT',
          branch_id: null,
        },
      });
    const branch = (headers: Record<string, string>, userId: string) =>
      request.post(api('/tenant/branch-assignments'), {
        headers,
        data: { user_id: userId, branch_id: IDS.headOffice, assignment_type: 'OPERATE' },
      });

    for (const refused of [await role(self, IDS.jane), await branch(usersSelf, IDS.jane)]) {
      expect(refused.status()).toBe(403);
      expect(await refused.json()).toMatchObject({
        code: 'forbidden',
        detail: 'Missing permission: user.assign_self.',
      });
    }
    // Someone else, or a tenant administrator assigning themselves, goes through.
    expect((await role(self, ROLE_SCENARIO_IDS.tom)).status()).toBe(201);
    expect((await branch(usersSelf, USER_SCENARIO_IDS.felix)).status()).toBe(201);
    expect((await role(admin, IDS.jane)).status()).toBe(201);
    expect((await branch(usersAdmin, IDS.jane)).status()).toBe(201);
    // The tenant administrator can't grant user.assign_self either.
    const grant = await request.post(api(`/tenant/roles/${ROLE_SCENARIO_IDS.teller}/permissions`), {
      headers: admin,
      data: { permission_code: 'user.assign_self' },
    });
    expect(grant.status()).toBe(422);
  });

  test('rejects unknown properties and lists the catalogue', async ({ request }) => {
    const headers = await contextFor(request, 'roles', null);
    const camel = await request.post(api('/tenant/roles'), { headers, data: { roleCode: 'X1' } });
    expect(await camel.json()).toMatchObject({ code: 'invalid_json' });
    const critical = await request.get(api('/tenant/permissions?risk_level=CRITICAL&size=100'), {
      headers,
    });
    expect(await critical.json()).toMatchObject({ page: { total_items: 16 } });
    // The platform's 86 codes; V21 deprecated branch.activate.
    const all = await request.get(api('/tenant/permissions?size=100'), { headers });
    expect(await all.json()).toMatchObject({ page: { total_items: 86 } });
    const active = await request.get(api('/tenant/permissions?status=ACTIVE&size=100'), {
      headers,
    });
    expect(await active.json()).toMatchObject({ page: { total_items: 85 } });
    const invite = await request.get(api('/tenant/permissions?q=user.invite'), { headers });
    expect(await invite.json()).toMatchObject({
      items: [
        {
          permission_code: 'user.invite',
          status: 'ACTIVE',
          kind: 'MUTATION',
          grant_scope: 'TENANT',
          required_view_permissions: ['membership.view', 'user.view'],
        },
      ],
    });
  });

  test("pins the app's view pairs to the catalogue (ADR 0030)", async ({ request }) => {
    const headers = await contextFor(request, 'roles', null);
    const catalogue = (await (
      await request.get(api('/tenant/permissions?size=100'), { headers })
    ).json()) as {
      items: { permission_code: string; kind: string; required_view_permissions: string[] }[];
    };
    const mutations = catalogue.items.filter((item) => item.kind === 'MUTATION');
    expect(mutations).toHaveLength(Object.keys(PERMISSION_VIEWS).length);
    for (const item of catalogue.items) {
      expect(item.required_view_permissions, item.permission_code).toEqual(
        [...requiredViews(item.permission_code)].sort(),
      );
    }
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
