import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import {
  IDS,
  RECORD_SCENARIO_IDS as R,
  TENANT_SCENARIO_IDS as T,
  type ScenarioName,
} from './fake-api/scenarios.mts';
import { api, contextFor } from './support/fake-api';

interface Paged<T> {
  items: T[];
  page: { total_items: number };
}

interface BranchRow {
  id: string;
  branch_code: string;
  branch_name: string;
}

interface UserRow {
  id: string;
  display_name: string;
  user_status: string;
  membership_status: string;
}

interface ProblemBody {
  code: string;
  violations: { field: string }[] | null;
}

interface AssignmentRow {
  id: string;
  user_id: string;
  scope_type: string;
  status: string;
}

interface AuditRow {
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  reason: string | null;
}

const read = async <T>(response: APIResponse): Promise<T> => (await response.json()) as T;

/** A fresh run of `scenario` in the platform context (the platform operator has one branch, which
 * selection pins), with the requests as the app sends them. */
async function signIn(request: APIRequestContext, scenario: ScenarioName = 'platform-records') {
  const headers = await contextFor(request, scenario, null, IDS.platformOrganisation);
  return {
    get: (path: string) => request.get(api(path), { headers }),
    /** A mutation carries a fresh Idempotency-Key unless the test pins one. */
    post: (path: string, data?: Record<string, unknown>, key: string = randomUUID()) =>
      request.post(api(path), { headers: { ...headers, 'Idempotency-Key': key }, data }),
    /** The same run (the bearer is the run), read as a member of one institution: what a platform
     * action wrote in that tenant's own records, which the platform context can't read (BG-06). */
    asTenant: async (organisationId: string) => {
      const bearer = { Authorization: headers.Authorization ?? '' };
      const selected = await request.post(api('/auth/select-organisation'), {
        headers: bearer,
        data: { organisation_id: organisationId },
      });
      const { context_token: token } = await read<{ context_token: string }>(selected);
      const tenant = { ...bearer, 'X-Active-Organisation-Context': token };
      return { get: (path: string) => request.get(api(path), { headers: tenant }) };
    },
  };
}

async function expectProblem(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status()).toBe(status);
  expect(await read<ProblemBody>(response)).toMatchObject({ code });
}

const acme = (tail: string) => `/platform/tenants/${IDS.acme}${tail}`;

const DRAFT = {
  branch_code: 'THIKA',
  branch_name: 'Thika Road Branch',
  branch_type: 'OPERATIONS',
  parent_branch_id: R.acmeHeadOffice,
  timezone: 'Africa/Nairobi',
};

test.describe('fake API platform records (contract §E.2, layer 17)', () => {
  test("lists an institution's branches with the /branches filters and sort; an unknown sort is a 500", async ({
    request,
  }) => {
    const { get } = await signIn(request);
    const list = async (query: string) =>
      read<Paged<BranchRow>>(await get(acme(`/branches${query}`)));

    const all = await list('');
    expect(all.page.total_items).toBe(5);
    // Newest first, and the summary's seven fields only (no timezone, no parent).
    expect(all.items[0]?.id).toBe(R.acmeLikoni);
    expect(Object.keys(all.items[0] ?? {})).toEqual([
      'id',
      'organisation_id',
      'branch_code',
      'branch_name',
      'branch_type',
      'status',
      'created_at',
    ]);

    expect((await list('?status=SUSPENDED')).items.map((item) => item.id)).toEqual([R.acmeNakuru]);
    expect((await list('?q=road')).items.map((item) => item.id)).toEqual([R.acmeMombasaRoad]);
    const byCode = await list('?sort_by=branchCode&sort_dir=ASC');
    expect(byCode.items[0]?.branch_code).toBe('HEAD_OFFICE');

    // BG-07: an off-list sort is a 500, and `toString` doesn't resolve on the allow-list.
    await expectProblem(await get(acme('/branches?sort_by=toString')), 500, 'internal_error');

    const pwani = await read<Paged<BranchRow>>(await get(`/platform/tenants/${T.pwani}/branches`));
    expect(pwani.items.map((item) => item.id)).toEqual([R.pwaniHeadOffice]);
  });

  test('reads a branch of that institution only, its address never returned (BG-13)', async ({
    request,
  }) => {
    const { get } = await signIn(request);

    const nakuru = await read<Record<string, unknown>>(
      await get(acme(`/branches/${R.acmeNakuru}`)),
    );
    expect(nakuru).toMatchObject({
      id: R.acmeNakuru,
      status: 'SUSPENDED',
      status_reason: 'Premises under renovation',
      opened_on: null,
    });
    expect(nakuru.address).toEqual({});

    // Pwani's head office is not Acme's to read.
    await expectProblem(
      await get(acme(`/branches/${R.pwaniHeadOffice}`)),
      404,
      'resource_not_found',
    );
  });

  test('creates a draft only where the operator is a member with branch.create (BG-18)', async ({
    request,
  }) => {
    const { get, post } = await signIn(request);
    const k1 = randomUUID();
    const k2 = randomUUID();

    const created = await post(acme('/branches'), DRAFT, k1);
    expect(created.status()).toBe(201);
    const { branch_id: branchId, status } = await read<{ branch_id: string; status: string }>(
      created,
    );
    expect(status).toBe('DRAFT');
    expect(await read(await get(acme(`/branches/${branchId}`)))).toMatchObject({
      status: 'DRAFT',
      branch_code: 'THIKA',
    });

    // Jane is no member of Pwani: the platform code isn't enough. The refusal stores nothing, so the
    // same key is refused again rather than replayed.
    const atPwani = `/platform/tenants/${T.pwani}/branches`;
    await expectProblem(await post(atPwani, DRAFT, k2), 403, 'forbidden');
    const retry = await post(atPwani, DRAFT, k2);
    await expectProblem(retry, 403, 'forbidden');
    expect(retry.headers()['idempotency-replayed']).toBeUndefined();

    // The code is taken, whatever the key.
    await expectProblem(await post(acme('/branches'), DRAFT), 409, 'conflict');

    // A parent from Pwani, under a code Acme doesn't have yet (the code is checked first).
    await expectProblem(
      await post(acme('/branches'), {
        ...DRAFT,
        branch_code: 'MERU',
        parent_branch_id: R.pwaniHeadOffice,
      }),
      404,
      'resource_not_found',
    );
  });

  test('refuses unknown properties and validates the draft', async ({ request }) => {
    const { post } = await signIn(request);

    // A valid body plus one property the wire format doesn't know.
    await expectProblem(
      await post(acme('/branches'), { ...DRAFT, branch_code: 'NYERI', branchCode: 'NYERI' }),
      400,
      'invalid_json',
    );
    // The control: the same body without the extra property is valid.
    expect((await post(acme('/branches'), { ...DRAFT, branch_code: 'NYERI' })).status()).toBe(201);

    const short = await post(acme('/branches'), { ...DRAFT, branch_code: 'ab' });
    expect(short.status()).toBe(400);
    const body = await read<ProblemBody>(short);
    expect(body.code).toBe('validation_failed');
    expect(body.violations?.[0]?.field).toBe('branch_code');
  });

  test('refuses a malformed parent_branch_id as invalid_json before any other check (contract §D)', async ({
    request,
  }) => {
    const { get, post } = await signIn(request);

    // `parent_branch_id` is a `uuid?`: the DTO's decode fails, so it is a decode error, not a 404.
    await expectProblem(
      await post(acme('/branches'), { ...DRAFT, branch_code: 'MERU', parent_branch_id: 'nope' }),
      400,
      'invalid_json',
    );
    // Before the field checks: a short code is `validation_failed` on its own.
    await expectProblem(
      await post(acme('/branches'), { ...DRAFT, branch_code: 'a', parent_branch_id: 'nope' }),
      400,
      'invalid_json',
    );

    // The controls: the UUID decode ignores case, and null or absent is no parent.
    const upper = R.acmeHeadOffice.toUpperCase();
    expect(upper).not.toBe(R.acmeHeadOffice);
    const upperParent = await post(acme('/branches'), {
      ...DRAFT,
      branch_code: 'MERU',
      parent_branch_id: upper,
    });
    expect(upperParent.status()).toBe(201);
    const { branch_id: childId } = await read<{ branch_id: string }>(upperParent);
    expect(await read(await get(acme(`/branches/${childId}`)))).toMatchObject({
      parent_branch_id: R.acmeHeadOffice,
    });
    expect(
      (
        await post(acme('/branches'), { ...DRAFT, branch_code: 'NYERI', parent_branch_id: null })
      ).status(),
    ).toBe(201);
  });

  test("records a platform draft in the institution's audit log, once and only on success", async ({
    request,
  }) => {
    const { post, asTenant } = await signIn(request);
    const atAcme = await asTenant(IDS.acme);
    const drafts = async () =>
      (
        await read<Paged<AuditRow>>(
          await atAcme.get('/tenant/audit-events?action=branch.create_draft'),
        )
      ).items;
    expect(await drafts()).toEqual([]);
    const key = randomUUID();

    const created = await post(acme('/branches'), DRAFT, key);
    expect(created.status()).toBe(201);
    const { branch_id: branchId } = await read<{ branch_id: string }>(created);
    expect(await drafts()).toMatchObject([
      {
        action: 'branch.create_draft',
        resource_type: 'BRANCH',
        resource_id: branchId,
        actor_id: IDS.jane,
        reason: null,
      },
    ]);

    // A replay by the same key and a taken code each add nothing to Acme's log. (A refusal at
    // Pwani would write to Pwani's log, which this run can't read, so that step only shows that
    // Acme's stays untouched.)
    const replay = await post(acme('/branches'), DRAFT, key);
    expect(replay.headers()['idempotency-replayed']).toBe('true');
    await expectProblem(
      await post(`/platform/tenants/${T.pwani}/branches`, DRAFT),
      403,
      'forbidden',
    );
    await expectProblem(await post(acme('/branches'), DRAFT), 409, 'conflict');
    expect(await drafts()).toHaveLength(1);
  });

  test("lists users per institution, newest first, and the platform's own members", async ({
    request,
  }) => {
    const { get } = await signIn(request);
    const list = async (path: string) => read<Paged<UserRow>>(await get(path));

    const everyone = await list(acme('/users'));
    expect(everyone.items).toHaveLength(8);
    expect(everyone.items[0]?.id).toBe(R.nyokabi);
    expect(everyone.items[7]?.id).toBe(IDS.jane);

    expect((await list(acme('/users?user_status=SUSPENDED'))).items.map((item) => item.id)).toEqual(
      [R.baraka],
    );
    expect((await list(acme('/users?q=mensah'))).items.map((item) => item.id)).toEqual([R.esi]);

    // `{PLATFORM}` lists the platform's members: Sara, Peter, then Jane (newest first).
    const platform = await list(`/platform/tenants/${IDS.platformOrganisation}/users`);
    expect(platform.items.map((item) => item.id)).toEqual([R.sara, R.peter, IDS.jane]);

    // Esi belongs to Acme and Pwani, not to Kilimo Bora.
    expect(await read(await get(`/platform/tenants/${T.pwani}/users/${R.esi}`))).toMatchObject({
      id: R.esi,
      membership_status: 'ACTIVE',
    });
    await expectProblem(
      await get(`/platform/tenants/${T.kilimo}/users/${R.esi}`),
      404,
      'resource_not_found',
    );
  });

  test('suspends and reactivates an account everywhere, refusing the wrong state', async ({
    request,
  }) => {
    const { get, post } = await signIn(request);
    const suspend = `/platform/users/${R.esi}/suspend`;
    const reactivate = `/platform/users/${R.esi}/reactivate`;

    const suspended = await post(suspend, { reason: 'Fraud review' });
    expect(suspended.status()).toBe(200);
    expect(await read(suspended)).toEqual({ user_id: R.esi, status: 'SUSPENDED' });
    // The status lives on the account, so every institution sees it.
    expect(await read(await get(`/platform/tenants/${T.pwani}/users/${R.esi}`))).toMatchObject({
      user_status: 'SUSPENDED',
    });
    expect(await read(await get(acme(`/users/${R.esi}`)))).toMatchObject({
      user_status: 'SUSPENDED',
    });

    await expectProblem(await post(suspend, { reason: 'Fraud review' }), 409, 'conflict');

    // Contract §D: the body is required, `{}` at the least.
    await expectProblem(await post(reactivate), 400, 'invalid_json');
    const reactivated = await post(reactivate, {});
    expect(reactivated.status()).toBe(200);
    expect(await read(reactivated)).toEqual({ user_id: R.esi, status: 'ACTIVE' });
    await expectProblem(await post(reactivate, {}), 409, 'conflict');
  });

  test("deactivation revokes the account's role assignments and audits each in its own institution", async ({
    request,
  }) => {
    const { post, asTenant } = await signIn(request);
    const atAcme = await asTenant(IDS.acme);
    const assignmentsOf = async (userId: string) =>
      (
        await read<Paged<AssignmentRow>>(
          await atAcme.get(`/tenant/role-assignments?user_id=${userId}`),
        )
      ).items;
    const statusesOf = async (userId: string) =>
      Object.fromEntries((await assignmentsOf(userId)).map((row) => [row.id, row.status]));
    const revocations = async () =>
      (
        await read<Paged<AuditRow>>(
          await atAcme.get('/tenant/audit-events?action=user.deactivation_assignment_revoked'),
        )
      ).items;
    const base = `/platform/users/${R.achieng}`;
    const active = {
      [R.achiengTenantRoleAssignment]: 'ACTIVE',
      [R.achiengBranchRoleAssignment]: 'ACTIVE',
      [R.achiengRevokedRoleAssignment]: 'REVOKED',
    };
    expect(await statusesOf(R.achieng)).toEqual(active);

    // Suspending leaves every assignment, and a deactivation refused for the wrong state revokes
    // nothing and records nothing.
    expect((await post(`${base}/suspend`, { reason: 'Fraud review' })).status()).toBe(200);
    expect(await statusesOf(R.achieng)).toEqual(active);
    await expectProblem(
      await post(`${base}/deactivate`, { reason: 'Left the platform' }),
      409,
      'conflict',
    );
    expect(await statusesOf(R.achieng)).toEqual(active);
    expect(await revocations()).toEqual([]);
    expect((await post(`${base}/reactivate`, {})).status()).toBe(200);
    expect(await statusesOf(R.achieng)).toEqual(active);

    const key = randomUUID();
    const reason = 'Left the platform';
    expect((await post(`${base}/deactivate`, { reason }, key)).status()).toBe(200);
    // Both ACTIVE assignments (tenant and branch scope) are revoked; the REVOKED one and another
    // user's stay as they were.
    expect(await statusesOf(R.achieng)).toEqual({
      [R.achiengTenantRoleAssignment]: 'REVOKED',
      [R.achiengBranchRoleAssignment]: 'REVOKED',
      [R.achiengRevokedRoleAssignment]: 'REVOKED',
    });
    expect(await statusesOf(R.esi)).toEqual({ [R.esiTenantRoleAssignment]: 'ACTIVE' });
    const rows = await revocations();
    expect(rows.map((row) => row.resource_id).sort()).toEqual(
      [R.achiengTenantRoleAssignment, R.achiengBranchRoleAssignment].sort(),
    );
    for (const row of rows) {
      expect(row).toMatchObject({
        action: 'user.deactivation_assignment_revoked',
        resource_type: 'USER_ROLE_ASSIGNMENT',
        reason,
      });
    }

    // A replay by the key and a deactivation of a DEACTIVATED account add nothing.
    const replay = await post(`${base}/deactivate`, { reason }, key);
    expect(replay.headers()['idempotency-replayed']).toBe('true');
    await expectProblem(await post(`${base}/deactivate`, { reason }), 409, 'conflict');
    expect(await revocations()).toHaveLength(2);
  });

  test('deactivates for good', async ({ request }) => {
    const { post } = await signIn(request);
    const base = `/platform/users/${R.achieng}`;

    const deactivated = await post(`${base}/deactivate`, { reason: 'Left the platform' });
    expect(deactivated.status()).toBe(200);
    expect(await read(deactivated)).toEqual({ user_id: R.achieng, status: 'DEACTIVATED' });

    await expectProblem(await post(`${base}/reactivate`, {}), 409, 'conflict');
    await expectProblem(await post(`${base}/suspend`, { reason: 'Fraud review' }), 409, 'conflict');
  });

  test('validates reasons, refuses unknown properties, and replays by key', async ({ request }) => {
    const { post } = await signIn(request);
    const suspend = `/platform/users/${R.achieng}/suspend`;
    const key = randomUUID();

    await expectProblem(await post(suspend, {}), 400, 'invalid_json');
    const tooShort = await post(suspend, { reason: 'ab' });
    expect(tooShort.status()).toBe(400);
    const problem = await read<ProblemBody>(tooShort);
    expect(problem.code).toBe('validation_failed');
    expect(problem.violations?.[0]?.field).toBe('reason');
    await expectProblem(
      await post(suspend, { reason: 'Fraud review', reasonText: 'x' }),
      400,
      'invalid_json',
    );

    // The control: the same body without the extra property is valid, and replays by its key.
    const once = await post(suspend, { reason: 'Fraud review' }, key);
    expect(once.status()).toBe(200);
    const again = await post(suspend, { reason: 'Fraud review' }, key);
    expect(again.status()).toBe(200);
    expect(again.headers()['idempotency-replayed']).toBe('true');

    await expectProblem(
      await post(`/platform/users/${randomUUID()}/suspend`, { reason: 'Fraud review' }),
      404,
      'resource_not_found',
    );
  });

  test('gates every route on its platform code, and on the platform context', async ({
    request,
  }) => {
    const readOnly = await signIn(request, 'platform-records-read-only');
    await expectProblem(
      await readOnly.post(`/platform/users/${R.esi}/suspend`, { reason: 'Fraud review' }),
      403,
      'forbidden',
    );
    await expectProblem(await readOnly.post(acme('/branches'), DRAFT), 403, 'forbidden');
    // Reactivate and deactivate have their own codes (Sara is SUSPENDED and Esi ACTIVE, so a
    // miswired gate would answer 200).
    await expectProblem(
      await readOnly.post(`/platform/users/${R.sara}/reactivate`, {}),
      403,
      'forbidden',
    );
    await expectProblem(
      await readOnly.post(`/platform/users/${R.esi}/deactivate`, { reason: 'Left the platform' }),
      403,
      'forbidden',
    );
    // The control: the read code is still held.
    expect((await readOnly.get(acme('/users'))).status()).toBe(200);

    // BG-30: Jane's Acme membership selects Acme, but the platform routes want the platform's.
    const atAcme = await contextFor(request, 'platform-records', null, IDS.acme);
    const wrongContext = await request.get(api(acme('/users')), { headers: atAcme });
    expect(wrongContext.status()).toBe(403);
    expect(await read<ProblemBody>(wrongContext)).toMatchObject({
      code: 'Reserved platform organisation context is required for this route.',
    });
    const atPlatform = await signIn(request);
    expect((await atPlatform.get(acme('/users'))).status()).toBe(200);
  });

  test('seeds 100-character names', async ({ request }) => {
    const { get } = await signIn(request);

    const users = await read<Paged<UserRow>>(await get(acme('/users')));
    expect(users.items[0]?.id).toBe(R.nyokabi);
    expect(users.items[0]?.display_name.length).toBe(100);

    const likoni = await read<BranchRow>(await get(acme(`/branches/${R.acmeLikoni}`)));
    expect(likoni.branch_name.length).toBe(100);
  });
});
