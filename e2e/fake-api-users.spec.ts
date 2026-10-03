import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { IDS, seedScenario, USER_SCENARIO_IDS as USERS } from './fake-api/scenarios.mts';
import { api, contextFor } from './support/fake-api';

interface Paged<T> {
  items: T[];
  page: {
    number: number;
    size: number;
    total_items: number;
    total_pages: number;
    has_next: boolean;
    has_previous: boolean;
  };
}

interface MembershipSummary {
  id: string;
  user_id: string;
  membership_status: string;
  membership_type: string;
  primary_branch_id: string | null;
}

interface AssignmentRow {
  id: string;
  user_id: string;
  branch_id: string | null;
  scope_type?: string;
  status: string;
}

interface AuditRow {
  actor_id: string | null;
  reason: string | null;
}

interface ProblemBody {
  code: string;
  violations: { field: string }[] | null;
}

const read = async <T>(response: APIResponse): Promise<T> => (await response.json()) as T;

const membershipPath = (membershipId: string) => `/tenant/memberships/${membershipId}`;

/** A fresh run of `scenario` at institution level, with the requests as the app sends them. */
async function signIn(request: APIRequestContext, scenario = 'users') {
  const headers = await contextFor(request, scenario, null);
  return {
    get: (path: string) => request.get(api(path), { headers }),
    /** A mutation carries a fresh Idempotency-Key unless the test pins one. */
    post: (path: string, data?: Record<string, unknown>, key: string = randomUUID()) =>
      request.post(api(path), { headers: { ...headers, 'Idempotency-Key': key }, data }),
    remove: (path: string) => request.delete(api(path), { headers }),
  };
}

async function expectProblem(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status()).toBe(status);
  expect(await read<ProblemBody>(response)).toMatchObject({ code });
}

test.describe('fake API memberships and the users scenarios (contract §E.3, layer 10)', () => {
  test('lists memberships by a substring search, newest first, with no names', async ({
    request,
  }) => {
    const { get } = await signIn(request);
    const list = async (query: string) =>
      read<Paged<MembershipSummary>>(await get(`/tenant/memberships${query}`));

    // Ann's address sits inside Joann's, so the search returns both: Joann, the newer, first.
    const nested = await list('?q=ann.mwangi@greenfield.example');
    expect(nested.items.map((item) => item.user_id)).toEqual([USERS.joann, USERS.ann]);
    expect(nested.page.total_items).toBe(2);
    // No names on a summary (BG-09): exactly these five fields.
    expect(Object.keys(nested.items[0] ?? {})).toEqual([
      'id',
      'user_id',
      'membership_status',
      'membership_type',
      'primary_branch_id',
    ]);
    expect(nested.items[0]).toMatchObject({
      id: USERS.joannMembership,
      membership_status: 'ACTIVE',
      membership_type: 'STAFF',
    });
    expect(nested.items[1]).toMatchObject({ id: USERS.annMembership, membership_type: 'ADMIN' });

    // Newest first across the whole directory.
    const everyone = await list('');
    expect(everyone.items.map((item) => item.user_id)).toEqual([
      USERS.joann,
      USERS.ann,
      USERS.wanjiru,
      USERS.hassan,
      USERS.gladys,
      USERS.felix,
      USERS.esther,
      USERS.daniel,
      USERS.carol,
      USERS.brian,
      USERS.amina,
      USERS.victor,
      IDS.jane,
    ]);

    const suspended = await list('?membership_status=SUSPENDED');
    expect(suspended.items.map((item) => item.user_id)).toEqual([USERS.gladys]);
    const auditors = await list('?membership_type=AUDITOR');
    expect(auditors.items.map((item) => item.user_id)).toEqual([USERS.wanjiru]);

    // `sort_*` is accepted and ignored (contract §E.3): same rows, same order, never a 500.
    const sorted = await get('/tenant/memberships?sort_by=bogus&sort_dir=ASC');
    expect(sorted.status()).toBe(200);
    expect((await read<Paged<MembershipSummary>>(sorted)).items).toEqual(everyone.items);
  });

  test('treats % and _ in q as wildcards (contract §A)', async ({ request }) => {
    const { get } = await signIn(request);
    const userIds = async (q: string) =>
      (
        await read<Paged<MembershipSummary>>(
          await get(`/tenant/memberships?q=${encodeURIComponent(q)}`),
        )
      ).items.map((item) => item.user_id);

    // `_` stands for one character, `%` for any run of them. Read literally, neither text matches
    // an address, so a fake that escaped them would answer an empty page.
    expect(await userIds('a_n.mwangi')).toEqual([USERS.joann, USERS.ann]);
    expect(await userIds('ann.mwangi%greenfield.example')).toEqual([USERS.joann, USERS.ann]);
    // The search is case-insensitive, and reads the name as well as the username and the email.
    expect(await userIds('ANN.MWANGI@')).toEqual([USERS.joann, USERS.ann]);
    expect(await userIds('backend jane')).toEqual([IDS.jane]);
    // Only those two are wildcards: `.` stays a literal dot (the name has a space where this has a
    // dot, and the username and email have none of these dots).
    expect(await userIds('backend.jane.manager')).toEqual([]);
  });

  test('reads one membership with its identity and dates; an unknown id is a 404', async ({
    request,
  }) => {
    const { get } = await signIn(request);
    const felix = await get(membershipPath(USERS.felixMembership));
    expect(felix.status()).toBe(200);
    const detail = await read<Record<string, unknown>>(felix);
    expect(detail).toMatchObject({
      id: USERS.felixMembership,
      organisation_id: IDS.greenfield,
      user_id: USERS.felix,
      username: 'felix.omondi',
      email: 'felix.omondi@greenfield.example',
      display_name: 'Felix Omondi',
      user_status: 'ACTIVE',
      membership_status: 'ACTIVE',
      membership_type: 'STAFF',
      primary_branch_id: IDS.westlands,
      created_at: '2026-07-01T08:00:00Z',
      updated_at: '2026-07-24T08:00:00Z',
    });
    expect(Object.keys(detail)).toEqual([
      'id',
      'organisation_id',
      'user_id',
      'username',
      'email',
      'display_name',
      'user_status',
      'membership_status',
      'membership_type',
      'primary_branch_id',
      'created_at',
      'updated_at',
    ]);

    await expectProblem(await get(membershipPath(randomUUID())), 404, 'resource_not_found');
  });

  test("approves: 202 queues identity provisioning, a replay returns the stored 202, and a new key's re-approval is a 500", async ({
    request,
  }) => {
    const { get, post } = await signIn(request);
    const activate = `${membershipPath(USERS.aminaMembership)}/activate`;
    const key = randomUUID();

    const first = await post(activate, {}, key);
    expect(first.status()).toBe(202);
    expect(first.headers()['idempotency-replayed']).toBeUndefined();
    // The membership waits for the identity provider: it stays pending, the account moves on.
    expect(await read(first)).toMatchObject({
      id: USERS.aminaMembership,
      membership_status: 'PENDING_APPROVAL',
      user_status: 'PROVISIONING_IDP',
    });

    const replay = await post(activate, {}, key);
    expect(replay.status()).toBe(202);
    expect(replay.headers()['idempotency-replayed']).toBe('true');
    expect(await read(replay)).toMatchObject({
      membership_status: 'PENDING_APPROVAL',
      user_status: 'PROVISIONING_IDP',
    });

    // A new key is a new request: the user is now provisioning, so approving again is a 500.
    await expectProblem(await post(activate, {}), 500, 'internal_error');

    // One approval, one audit row: the replay and the refusal wrote none.
    const approvals = await read<Paged<AuditRow>>(
      await get(
        `/tenant/audit-events?entity_type=USER&entity_id=${USERS.amina}&action=user.approve`,
      ),
    );
    expect(approvals.page.total_items).toBe(1);
  });

  test('approves an account with an identity link straight to ACTIVE (200)', async ({
    request,
  }) => {
    const { get, post } = await signIn(request);
    const approved = await post(`${membershipPath(USERS.brianMembership)}/activate`, {});
    expect(approved.status()).toBe(200);
    expect(await read(approved)).toMatchObject({
      id: USERS.brianMembership,
      membership_status: 'ACTIVE',
      user_status: 'ACTIVE',
    });
    expect(await read(await get(membershipPath(USERS.brianMembership)))).toMatchObject({
      membership_status: 'ACTIVE',
    });
  });

  test('refuses the inviter (403) and rolls the key back', async ({ request }) => {
    const { get, post } = await signIn(request);
    const activate = `${membershipPath(USERS.carolMembership)}/activate`;
    const key = randomUUID();

    // Jane invited Carol, and Jane is the signed-in approver (BG-08): `forbidden`, like a missing
    // permission.
    await expectProblem(await post(activate, {}, key), 403, 'forbidden');
    // The failed request stored nothing, so the same key is judged afresh, not replayed.
    const again = await post(activate, {}, key);
    await expectProblem(again, 403, 'forbidden');
    expect(again.headers()['idempotency-replayed']).toBeUndefined();

    expect(await read(await get(membershipPath(USERS.carolMembership)))).toMatchObject({
      membership_status: 'PENDING_APPROVAL',
      user_status: 'DRAFT',
    });
  });

  test('answers a non-pending or unknown membership, or missing prerequisites, with a 500 (BG-07)', async ({
    request,
  }) => {
    const { post, remove } = await signIn(request);
    const refusedApproval = async (membershipId: string) =>
      expectProblem(
        await post(`${membershipPath(membershipId)}/activate`, {}),
        500,
        'internal_error',
      );

    await refusedApproval(USERS.estherMembership); // already ACTIVE
    await refusedApproval(randomUUID()); // unknown
    // No ACTIVE role assignment: Amina's only one is her institution-wide Teller. The approval test
    // above is the control, since without this removal Amina approves.
    expect((await remove(`/tenant/role-assignments/${USERS.aminaTeller}`)).status()).toBe(200);
    await refusedApproval(USERS.aminaMembership);

    // Suspend, reactivate and revoke of an unknown membership are 500s as well.
    const unknown = membershipPath(randomUUID());
    await expectProblem(
      await post(`${unknown}/suspend`, { reason: 'Cash audit' }),
      500,
      'internal_error',
    );
    await expectProblem(await post(`${unknown}/reactivate`), 500, 'internal_error');
    await expectProblem(
      await post(`${unknown}/revoke`, { reason: 'Left the SACCO' }),
      500,
      'internal_error',
    );
  });

  test('checks permission before state', async ({ request }) => {
    const { get, post } = await signIn(request, 'users-read-only');
    const esther = membershipPath(USERS.estherMembership);

    // Esther is not pending, which alone would be a 500: the missing permission answers first.
    await expectProblem(await post(`${esther}/activate`, {}), 403, 'forbidden');
    // And each of the others, whose state check would otherwise be a 200, a 409 or a 500.
    await expectProblem(
      await post(`${esther}/suspend`, { reason: 'Cash audit' }),
      403,
      'forbidden',
    );
    await expectProblem(await post(`${esther}/reactivate`), 403, 'forbidden');
    await expectProblem(
      await post(`${membershipPath(randomUUID())}/revoke`, { reason: 'Left the SACCO' }),
      403,
      'forbidden',
    );

    // The reads stay open, and nothing moved.
    expect(await read(await get(esther))).toMatchObject({ membership_status: 'ACTIVE' });
  });

  test('suspends and reactivates, refusing the wrong state with a 409', async ({ request }) => {
    const { post } = await signIn(request);
    const esther = membershipPath(USERS.estherMembership);

    const key = randomUUID();
    const suspended = await post(`${esther}/suspend`, { reason: 'Cash audit' }, key);
    expect(suspended.status()).toBe(200);
    expect(await read(suspended)).toMatchObject({
      id: USERS.estherMembership,
      membership_status: 'SUSPENDED',
    });
    // The same key replays the stored 200, not the 409 the membership's new state would give.
    const replay = await post(`${esther}/suspend`, { reason: 'Cash audit' }, key);
    expect(replay.status()).toBe(200);
    expect(replay.headers()['idempotency-replayed']).toBe('true');
    // A new key is a new request, and the membership is no longer ACTIVE.
    await expectProblem(await post(`${esther}/suspend`, { reason: 'Cash audit' }), 409, 'conflict');

    // Reactivate's body is optional: this one sends none.
    const reactivated = await post(`${esther}/reactivate`);
    expect(reactivated.status()).toBe(200);
    expect(await read(reactivated)).toMatchObject({ membership_status: 'ACTIVE' });
    await expectProblem(await post(`${esther}/reactivate`), 409, 'conflict');
  });

  test('validates reasons and refuses unknown properties', async ({ request }) => {
    const { post } = await signIn(request);
    const esther = membershipPath(USERS.estherMembership);

    // Suspend needs a reason: absent is a malformed body, 2 characters is a field violation.
    await expectProblem(await post(`${esther}/suspend`, {}), 400, 'invalid_json');
    const short = await post(`${esther}/suspend`, { reason: 'ab' });
    expect(short.status()).toBe(400);
    expect(await read<ProblemBody>(short)).toMatchObject({
      code: 'validation_failed',
      violations: [{ field: 'reason' }],
    });
    await expectProblem(
      await post(`${esther}/suspend`, { reason: 'x'.repeat(501) }),
      400,
      'validation_failed',
    );
    // A valid reason plus one property the wire format doesn't know. Were unknown properties
    // ignored, this would be a 200.
    await expectProblem(
      await post(`${esther}/suspend`, { reason: 'Cash audit', reasonText: 'x' }),
      400,
      'invalid_json',
    );
    // The control (rule 16): the same body without the extra key succeeds, so each refusal above
    // came from the one thing wrong with it.
    expect((await post(`${esther}/suspend`, { reason: 'Cash audit' })).status()).toBe(200);

    // Reactivate's reason is optional with no minimum, but 500 characters at most.
    await expectProblem(
      await post(`${esther}/reactivate`, { reason: 'x'.repeat(501) }),
      400,
      'validation_failed',
    );
    const brief = await post(`${esther}/reactivate`, { reason: 'ok' });
    expect(brief.status()).toBe(200);

    // The approval reads no body, so any property is refused; `{}` is the control.
    const activate = `${membershipPath(USERS.aminaMembership)}/activate`;
    await expectProblem(await post(activate, { reason: 'x' }), 400, 'invalid_json');
    expect((await post(activate, {})).status()).toBe(202);
  });

  test('revokes for good, cascading to every assignment; a second revoke is a 500', async ({
    request,
  }) => {
    const { get, post } = await signIn(request);
    const felixRoles = async (status: string) =>
      read<Paged<AssignmentRow>>(
        await get(`/tenant/role-assignments?user_id=${USERS.felix}&status=${status}`),
      );
    const activeBranchRows = async () =>
      (
        await read<Paged<AssignmentRow>>(
          await get('/tenant/branch-assignments?status=ACTIVE&size=100'),
        )
      ).items;
    const estherRoles = async () =>
      (
        await read<Paged<AssignmentRow>>(
          await get(`/tenant/role-assignments?user_id=${USERS.esther}&status=ACTIVE`),
        )
      ).page.total_items;

    // Before: Teller (institution-wide), Teller at Westlands and Loans officer, and his Home row.
    const before = await felixRoles('ACTIVE');
    expect(before.page.total_items).toBe(3);
    expect(before.items.find((row) => row.id === USERS.felixBranchTeller)).toMatchObject({
      scope_type: 'BRANCH',
      branch_id: IDS.westlands,
    });
    expect((await activeBranchRows()).filter((row) => row.user_id === USERS.felix)).toHaveLength(1);
    expect(await estherRoles()).toBe(1);

    const revoke = `${membershipPath(USERS.felixMembership)}/revoke`;
    const revoked = await post(revoke, { reason: 'Left the SACCO' });
    expect(revoked.status()).toBe(200);
    expect(await read(revoked)).toMatchObject({
      id: USERS.felixMembership,
      membership_status: 'REVOKED',
    });

    // After: every assignment of his is REVOKED, nobody else's is touched.
    expect((await felixRoles('ACTIVE')).page.total_items).toBe(0);
    expect((await felixRoles('REVOKED')).page.total_items).toBe(3);
    const stillActive = await activeBranchRows();
    expect(stillActive.some((row) => row.user_id === USERS.felix)).toBe(false);
    expect(stillActive.some((row) => row.user_id === USERS.esther)).toBe(true);
    expect(await estherRoles()).toBe(1);

    // Terminal: a second revoke, under a new key, is a 500.
    await expectProblem(await post(revoke, { reason: 'Left the SACCO' }), 500, 'internal_error');
  });

  test("writes the audit rows the record's views read", async ({ request }) => {
    const { get, post } = await signIn(request);
    expect(
      (
        await post(`${membershipPath(USERS.estherMembership)}/suspend`, { reason: 'Cash audit' })
      ).status(),
    ).toBe(200);
    expect(
      (
        await post(`${membershipPath(USERS.felixMembership)}/revoke`, { reason: 'Left the SACCO' })
      ).status(),
    ).toBe(200);

    const rows = async (query: string) =>
      read<Paged<AuditRow>>(await get(`/tenant/audit-events?${query}`));

    // A suspend is logged on the USER, keyed by the user id (BG-16), with the reason and the actor.
    const suspend = await rows(
      `entity_type=USER&entity_id=${USERS.esther}&action=membership.suspend`,
    );
    expect(suspend.page.total_items).toBe(1);
    expect(suspend.items[0]).toMatchObject({ actor_id: IDS.jane, reason: 'Cash audit' });
    // A revoke is logged on the MEMBERSHIP, keyed by the membership id.
    const revoke = await rows(
      `entity_type=MEMBERSHIP&entity_id=${USERS.felixMembership}&action=membership.revoke`,
    );
    expect(revoke.page.total_items).toBe(1);
    expect(revoke.items[0]).toMatchObject({ actor_id: IDS.jane, reason: 'Left the SACCO' });
    // Neither is logged under the other's key.
    expect(
      (
        await rows(
          `entity_type=MEMBERSHIP&entity_id=${USERS.estherMembership}&action=membership.suspend`,
        )
      ).page.total_items,
    ).toBe(0);

    // The seeded maker lookup: who invited Amina.
    const invite = await rows(`entity_type=USER&entity_id=${USERS.amina}&action=user.invite`);
    expect(invite.page.total_items).toBe(1);
    expect(invite.items[0]?.actor_id).toBe(USERS.victor);
  });

  test('gates the routes on membership.view', async ({ request }) => {
    const { get, post } = await signIn(request, 'users-limited');

    await expectProblem(await get('/tenant/memberships'), 403, 'forbidden');
    await expectProblem(await get(membershipPath(USERS.estherMembership)), 403, 'forbidden');
    // Every mutation reads its result back (BG-31), so it needs the view as well.
    await expectProblem(
      await post(`${membershipPath(USERS.brianMembership)}/activate`, {}),
      403,
      'forbidden',
    );
    // Controls: the scenario drops the membership view and the audit, and nothing else.
    await expectProblem(await get('/tenant/audit-events'), 403, 'forbidden');
    expect((await get('/tenant/users')).status()).toBe(200);
    expect((await get('/tenant/role-assignments')).status()).toBe(200);
    expect((await get('/tenant/branch-assignments')).status()).toBe(200);
  });

  test('seeds a 100-character display name', async ({ request }) => {
    const { get } = await signIn(request);
    const wanjiru = await read<{ display_name: string; username: string; email: string }>(
      await get(`/tenant/users/${USERS.wanjiru}`),
    );
    expect(wanjiru.display_name).toHaveLength(100);
    expect(wanjiru).toMatchObject({
      username: 'wanjiru.long',
      email:
        'wanjiru.njeri.kamau-otieno.achieng.muthoni@greenfield-teachers-and-public-service-sacco.example',
    });
  });

  test('pads users-many-assignments past the scan ceiling', async ({ request }) => {
    const page = async (scenario: string, number: number) =>
      read<Paged<AssignmentRow>>(
        await (
          await signIn(request, scenario)
        ).get(`/tenant/branch-assignments?status=ACTIVE&page=${String(number)}&size=100`),
      );

    // The scan reads five pages of 100: the fifth still has more, so it is truncated.
    const last = await page('users-many-assignments', 4);
    expect(last.page).toMatchObject({ number: 4, has_next: true });
    expect(last.items).toHaveLength(100);
    // Felix's own row is on the first page, inside the ceiling.
    const first = await page('users-many-assignments', 0);
    expect(first.items.find((row) => row.user_id === USERS.felix)).toMatchObject({
      id: '10000000-0000-4000-8000-000000000207',
      branch_id: IDS.westlands,
    });
    // The control: without the padding, the same page is past the end.
    const plain = await page('users', 4);
    expect(plain.page.has_next).toBe(false);
    expect(plain.items).toEqual([]);
  });

  test('reads memberships in a branch context too (contract §E.4)', async ({ request }) => {
    const headers = await contextFor(request, 'users', IDS.westlands);
    const get = (path: string) => request.get(api(path), { headers });

    // Memberships are never branch-restricted: everyone is listed, and any one can be read.
    expect(
      (await read<Paged<MembershipSummary>>(await get('/tenant/memberships'))).page,
    ).toMatchObject({
      total_items: 13,
    });
    expect((await get(membershipPath(USERS.estherMembership))).status()).toBe(200);
    // Branch assignments are: the search is forced to Westlands (Jane's, and four seeded people's).
    const rows = (
      await read<Paged<AssignmentRow>>(await get('/tenant/branch-assignments?status=ACTIVE'))
    ).items;
    expect(rows.map((row) => row.user_id).sort()).toEqual(
      [IDS.jane, USERS.amina, USERS.carol, USERS.daniel, USERS.felix].sort(),
    );
    expect(new Set(rows.map((row) => row.branch_id))).toEqual(new Set([IDS.westlands]));
  });

  test('seeds fresh objects for every call, so one run never leaks into another', () => {
    for (const scenario of [
      'users',
      'users-limited',
      'users-read-only',
      'users-many-assignments',
    ]) {
      const first = seedScenario(scenario);
      const second = seedScenario(scenario);
      for (const key of [
        'users',
        'memberships',
        'branchAssignments',
        'roles',
        'roleAssignments',
        'auditEvents',
      ] as const) {
        expect(first[key].length, `${scenario} ${key}`).toBeGreaterThan(0);
        expect(first[key], `${scenario} ${key}`).not.toBe(second[key]);
        first[key].forEach((row, index) => {
          expect(row, `${scenario} ${key}[${String(index)}]`).not.toBe(second[key][index]);
        });
      }
      first.roles.forEach((role, index) => {
        expect(role.permissions, `${scenario} role ${role.code}`).not.toBe(
          second.roles[index]?.permissions,
        );
      });
    }
  });
});
