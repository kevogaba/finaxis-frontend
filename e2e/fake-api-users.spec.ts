import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import {
  DISPATCH_EDGE_IDS as EDGES,
  IDS,
  REINVITED_SCENARIO_IDS as REINVITED,
  seedScenario,
  USER_SCENARIO_IDS as USERS,
  type ScenarioName,
} from './fake-api/scenarios.mts';
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
  primary_branch_name: string | null;
}

interface AssignmentRow {
  id: string;
  user_id: string;
  branch_id: string | null;
  scope_type?: string;
  status: string;
  branch_name?: string;
  assigned_at?: string;
}

interface AuditRow {
  id: string;
  actor_id: string | null;
  reason: string | null;
}

interface MembershipDetail {
  id: string;
  membership_status: string;
  membership_type: string;
  primary_branch_id: string | null;
  member_number: number | null;
  updated_at: string;
}

interface ProblemBody {
  code: string;
  violations: { field: string }[] | null;
}

const read = async <T>(response: APIResponse): Promise<T> => (await response.json()) as T;

const membershipPath = (membershipId: string) => `/tenant/memberships/${membershipId}`;

/** A fresh run of `scenario` at institution level, with the requests as the app sends them. */
async function signIn(request: APIRequestContext, scenario: ScenarioName = 'users') {
  const headers = await contextFor(request, scenario, null);
  return {
    get: (path: string) => request.get(api(path), { headers }),
    /** A mutation carries a fresh Idempotency-Key unless the test pins one. */
    post: (path: string, data?: Record<string, unknown>, key: string = randomUUID()) =>
      request.post(api(path), { headers: { ...headers, 'Idempotency-Key': key }, data }),
    remove: (path: string) => request.delete(api(path), { headers }),
    patch: (path: string, data?: unknown, key: string = randomUUID()) =>
      request.patch(api(path), { headers: { ...headers, 'Idempotency-Key': key }, data }),
  };
}

async function expectProblem(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status()).toBe(status);
  expect(await read<ProblemBody>(response)).toMatchObject({ code });
}

test.describe('fake API memberships and the users scenarios (contract §E.3, layer 10)', () => {
  test('lists memberships by a substring search or a user, newest first, with names (BG-09)', async ({
    request,
  }) => {
    const { get } = await signIn(request);
    const list = async (query: string) =>
      read<Paged<MembershipSummary>>(await get(`/tenant/memberships${query}`));

    // Ann's address sits inside Joann's, so the search returns both. They were created together, so
    // the higher id, Joann's, comes first.
    const nested = await list('?q=ann.mwangi@greenfield.example');
    expect(nested.items.map((item) => item.user_id)).toEqual([USERS.joann, USERS.ann]);
    expect(nested.page.total_items).toBe(2);
    // Names, the primary branch's name and the creation embedded (BG-09), with the inviter (BG-08).
    expect(Object.keys(nested.items[0] ?? {})).toEqual([
      'id',
      'user_id',
      'membership_status',
      'membership_type',
      'primary_branch_id',
      'username',
      'email',
      'display_name',
      'primary_branch_name',
      'created_at',
      'created_by',
      'member_number',
    ]);
    expect(nested.items[0]).toMatchObject({
      id: USERS.joannMembership,
      membership_status: 'ACTIVE',
      membership_type: 'STAFF',
      username: 'joann.mwangi',
      email: 'joann.mwangi@greenfield.example',
      display_name: 'Joann Mwangi',
      primary_branch_name: null,
      created_at: '2026-07-01T08:00:00Z',
    });
    expect(nested.items[1]).toMatchObject({ id: USERS.annMembership, membership_type: 'ADMIN' });
    expect((await list(`?user_id=${USERS.felix}`)).items).toEqual([
      expect.objectContaining({
        id: USERS.felixMembership,
        primary_branch_id: IDS.westlands,
        primary_branch_name: 'Westlands Branch',
      }),
    ]);

    // Newest first across the whole directory; the seeds share a creation time, so by id.
    const everyone = await list('');
    expect(everyone.items.map((item) => item.user_id)).toEqual([
      IDS.jane,
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
    ]);

    const suspended = await list('?membership_status=SUSPENDED');
    expect(suspended.items.map((item) => item.user_id)).toEqual([USERS.gladys]);
    const auditors = await list('?membership_type=AUDITOR');
    expect(auditors.items.map((item) => item.user_id)).toEqual([USERS.wanjiru]);

    // The sort is honoured (BG-26): ascending by type, the id breaking ties, highest first.
    const byType = await list('?sort_by=membershipType&sort_dir=ASC');
    expect(byType.items.map((item) => item.membership_type)).toEqual([
      'ADMIN',
      'ADMIN',
      'ADMIN',
      'AUDITOR',
      ...Array<string>(9).fill('STAFF'),
    ]);
    expect(byType.items.slice(0, 3).map((item) => item.user_id)).toEqual([
      IDS.jane,
      USERS.ann,
      USERS.victor,
    ]);
    // A `sort_dir` alone changes nothing; an unknown field is a 400 naming the field.
    expect((await list('?sort_dir=ASC')).items).toEqual(everyone.items);
    const bogus = await get('/tenant/memberships?sort_by=bogus');
    expect(bogus.status()).toBe(400);
    expect(await read<ProblemBody>(bogus)).toMatchObject({
      code: 'invalid_parameter',
      violations: [{ field: 'sort_by' }],
    });
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
      'created_by',
      'invitation',
      'member_number',
    ]);
    // Felix's account already had an identity: nothing was provisioned (BG-11).
    expect(detail.invitation).toEqual({
      status: 'NOT_REQUIRED',
      attempts: 0,
      last_error_code: null,
      updated_at: null,
    });

    await expectProblem(await get(membershipPath(randomUUID())), 404, 'resource_not_found');
  });

  // BG-11 (platform #274, deriveInvitationStatus): every detail carries `invitation`.
  test('derives each member invitation from its provisioning dispatch', async ({ request }) => {
    const { get } = await signIn(request);
    const invitation = async (membershipId: string) =>
      (await read<{ invitation: unknown }>(await get(membershipPath(membershipId)))).invitation;

    expect(await invitation(USERS.aminaMembership)).toEqual({
      status: 'AWAITING_APPROVAL',
      attempts: 0,
      last_error_code: null,
      updated_at: null,
    });
    expect(await invitation(USERS.danielMembership)).toEqual({
      status: 'FAILED',
      attempts: 3,
      last_error_code: 'IDENTITY_PROVIDER_FAILED',
      updated_at: '2026-11-24T06:14:00Z',
    });
    expect(await invitation(USERS.estherMembership)).toEqual({
      status: 'COMPLETED',
      attempts: 1,
      last_error_code: null,
      updated_at: '2026-08-02T09:00:00Z',
    });
    // Revoked with no dispatch: nothing was provisioned.
    expect(await invitation(USERS.hassanMembership)).toMatchObject({ status: 'NOT_REQUIRED' });
  });

  // BG-28: a re-invited member whose account was never provisioned lists exactly as Daniel does;
  // only the membership detail's invitation tells them apart.
  test('seeds a re-invited member whose account still provisions, awaiting approval', async ({
    request,
  }) => {
    const { get } = await signIn(request, 'users-reinvited');
    const pending = await read<{ items: { id: string; user_status: string }[] }>(
      await get('/tenant/users?membership_status=PENDING_APPROVAL&user_status=PROVISIONING_IDP'),
    );
    expect(pending.items.map((row) => row.id).sort()).toEqual(
      [REINVITED.kamau, USERS.daniel].sort(),
    );
    const detail = await read<{ invitation: unknown; created_by: unknown }>(
      await get(membershipPath(REINVITED.kamauMembership)),
    );
    expect(detail).toMatchObject({
      invitation: { status: 'AWAITING_APPROVAL', attempts: 0 },
      created_by: { id: USERS.victor },
    });
  });

  test('retries a failed provisioning: IN_PROGRESS, no maker-checker, a queued one left alone, audited', async ({
    request,
  }) => {
    const { get, post } = await signIn(request);
    const retry = `${membershipPath(USERS.danielMembership)}/invitation/retry`;
    const key = randomUUID();

    // Jane didn't invite Daniel, but a retry isn't a decision anyway: no body is read.
    const first = await post(retry, undefined, key);
    expect(first.status()).toBe(200);
    const detail = await read<{ invitation: { status: string; updated_at: string } }>(first);
    expect(detail).toMatchObject({
      id: USERS.danielMembership,
      membership_status: 'PENDING_APPROVAL',
      user_status: 'PROVISIONING_IDP',
      // The attempts stay until the job runs; the code goes with FAILED.
      invitation: { status: 'IN_PROGRESS', attempts: 3, last_error_code: null },
    });
    expect(detail.invitation.updated_at).not.toBe('2026-11-24T06:14:00Z');

    const replay = await post(retry, undefined, key);
    expect(replay.headers()['idempotency-replayed']).toBe('true');
    // A new key while the job is queued: a 200 that changes nothing.
    const again = await post(retry);
    expect(again.status()).toBe(200);
    expect(await read(again)).toMatchObject({ invitation: { status: 'IN_PROGRESS' } });

    const rows = await read<Paged<AuditRow & { metadata_json?: string }>>(
      await get(
        `/tenant/audit-events?entity_type=USER&entity_id=${USERS.daniel}&action=user.invitation_retry`,
      ),
    );
    expect(rows.page.total_items).toBe(2);
  });

  test('refuses a retry with nothing to retry (409 conflict), an unknown id (404), and without user.approve (403 first)', async ({
    request,
  }) => {
    const { post } = await signIn(request);
    const retry = (membershipId: string) =>
      post(`${membershipPath(membershipId)}/invitation/retry`);

    // Awaiting approval, active, revoked: none is provisioning.
    for (const membershipId of [
      USERS.aminaMembership,
      USERS.estherMembership,
      USERS.hassanMembership,
    ]) {
      await expectProblem(await retry(membershipId), 409, 'conflict');
    }
    await expectProblem(await retry(randomUUID()), 404, 'resource_not_found');

    const readOnly = await signIn(request, 'users-read-only');
    await expectProblem(
      await readOnly.post(`${membershipPath(randomUUID())}/invitation/retry`),
      403,
      'forbidden',
    );
  });

  test('approving a failed provisioning again requeues it: a 202, IN_PROGRESS', async ({
    request,
  }) => {
    const { post } = await signIn(request);
    const approved = await post(`${membershipPath(USERS.danielMembership)}/activate`, {});
    expect(approved.status()).toBe(202);
    expect(await read(approved)).toMatchObject({
      membership_status: 'PENDING_APPROVAL',
      user_status: 'PROVISIONING_IDP',
      invitation: { status: 'IN_PROGRESS', attempts: 3 },
    });
  });

  test('resends an invited member invitation once per cooldown, counting the attempt, audited', async ({
    request,
  }) => {
    const { get, post } = await signIn(request, 'users-invite');
    const resend = `${membershipPath(USERS.estherMembership)}/invitation/resend`;
    const key = randomUUID();

    const first = await post(resend, undefined, key);
    expect(first.status()).toBe(200);
    expect(await read(first)).toMatchObject({
      id: USERS.estherMembership,
      membership_status: 'ACTIVE',
      user_status: 'INVITED',
      invitation: { status: 'COMPLETED', attempts: 2, last_error_code: null },
    });
    // The same key replays; a new one inside the five minutes is too soon.
    expect((await post(resend, undefined, key)).headers()['idempotency-replayed']).toBe('true');
    await expectProblem(await post(resend), 409, 'lifecycle.invitation_resend_too_soon');

    const rows = await read<Paged<AuditRow>>(
      await get(
        `/tenant/audit-events?entity_type=USER&entity_id=${USERS.esther}&action=user.invitation_resend`,
      ),
    );
    expect(rows.page.total_items).toBe(1);
  });

  test('refuses a resend to anyone not invited with an active membership, and without user.invite', async ({
    request,
  }) => {
    const { post } = await signIn(request, 'users-invite');
    const resend = (membershipId: string) =>
      post(`${membershipPath(membershipId)}/invitation/resend`);

    // An active account, a pending one, one still provisioning, a revoked membership.
    for (const membershipId of [
      USERS.felixMembership,
      USERS.aminaMembership,
      USERS.danielMembership,
      USERS.hassanMembership,
    ]) {
      await expectProblem(
        await resend(membershipId),
        409,
        'lifecycle.invitation_resend_not_applicable',
      );
    }
    await expectProblem(await resend(randomUUID()), 404, 'resource_not_found');

    // `users` holds no user.invite: refused before the lookup.
    const noInvite = await signIn(request);
    await expectProblem(
      await noInvite.post(`${membershipPath(randomUUID())}/invitation/resend`),
      403,
      'forbidden',
    );
  });

  // The platform's two dispatch edges (InvitationRecoveryService): an invited member with an ACTIVE
  // membership and no succeeded dispatch anywhere has nothing to resend, and a dispatch that already
  // SUCCEEDED has nothing to retry, though the statuses alone would allow both.
  test('refuses a resend with no succeeded dispatch, and a retry of one that succeeded, changing nothing', async ({
    request,
  }) => {
    const { get, post } = await signIn(request, 'users-invite-dispatch-edges');
    const detail = async (membershipId: string) =>
      read<{ membership_status: string; user_status: string; invitation: unknown }>(
        await get(membershipPath(membershipId)),
      );
    const audited = async (userId: string, action: string) =>
      (
        await read<Paged<AuditRow>>(
          await get(`/tenant/audit-events?entity_type=USER&entity_id=${userId}&action=${action}`),
        )
      ).page.total_items;

    const grace = await detail(EDGES.graceMembership);
    expect(grace).toMatchObject({
      membership_status: 'ACTIVE',
      user_status: 'INVITED',
      invitation: { status: 'NOT_REQUIRED', attempts: 0, last_error_code: null, updated_at: null },
    });
    await expectProblem(
      await post(`${membershipPath(EDGES.graceMembership)}/invitation/resend`),
      409,
      'lifecycle.invitation_resend_not_applicable',
    );
    expect(await detail(EDGES.graceMembership)).toEqual(grace);
    expect(await audited(EDGES.grace, 'user.invitation_resend')).toBe(0);

    const kevin = await detail(EDGES.kevinMembership);
    expect(kevin).toMatchObject({
      membership_status: 'PENDING_APPROVAL',
      user_status: 'PROVISIONING_IDP',
      invitation: {
        status: 'COMPLETED',
        attempts: 1,
        last_error_code: null,
        updated_at: '2026-11-24T06:14:00Z',
      },
    });
    await expectProblem(
      await post(`${membershipPath(EDGES.kevinMembership)}/invitation/retry`),
      409,
      'conflict',
    );
    expect(await detail(EDGES.kevinMembership)).toEqual(kevin);
    expect(await audited(EDGES.kevin, 'user.invitation_retry')).toBe(0);
  });

  test("approves: 202 queues identity provisioning, a replay returns the stored 202, and a new key's re-approval requeues it", async ({
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
      // Queued, with no attempt yet (BG-11).
      invitation: { status: 'IN_PROGRESS', attempts: 0, last_error_code: null },
    });

    const replay = await post(activate, {}, key);
    expect(replay.status()).toBe(202);
    expect(replay.headers()['idempotency-replayed']).toBe('true');
    expect(await read(replay)).toMatchObject({
      membership_status: 'PENDING_APPROVAL',
      user_status: 'PROVISIONING_IDP',
    });

    // A new key is a new request: the user is still provisioning, so approving again requeues it
    // (BG-07, BG-11), another 202 that changes nothing.
    const requeued = await post(activate, {});
    expect(requeued.status()).toBe(202);
    expect(requeued.headers()['idempotency-replayed']).toBeUndefined();
    expect(await read(requeued)).toMatchObject({
      membership_status: 'PENDING_APPROVAL',
      user_status: 'PROVISIONING_IDP',
    });

    // Two approvals, two audit rows: the replay wrote none.
    const approvals = await read<Paged<AuditRow>>(
      await get(
        `/tenant/audit-events?entity_type=USER&entity_id=${USERS.amina}&action=user.approve`,
      ),
    );
    expect(approvals.page.total_items).toBe(2);
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

  test('refuses the inviter and the member themself by name (403), before the state, rolling the key back', async ({
    request,
  }) => {
    const { get, post } = await signIn(request);
    const activate = `${membershipPath(USERS.carolMembership)}/activate`;
    const key = randomUUID();

    // Jane invited Carol, and Jane is the signed-in approver (BG-08): its own code, not
    // `forbidden`.
    const maker = 'lifecycle.approver_is_membership_maker';
    await expectProblem(await post(activate, {}, key), 403, maker);
    // The failed request stored nothing, so the same key is judged afresh, not replayed.
    const again = await post(activate, {}, key);
    await expectProblem(again, 403, maker);
    expect(again.headers()['idempotency-replayed']).toBeUndefined();

    expect(await read(await get(membershipPath(USERS.carolMembership)))).toMatchObject({
      membership_status: 'PENDING_APPROVAL',
      user_status: 'DRAFT',
    });

    // Jane's own membership is ACTIVE, which alone would be a 409: the beneficiary answers first.
    await expectProblem(
      await post(`${membershipPath(IDS.greenfieldMembership)}/activate`, {}),
      403,
      'lifecycle.approver_is_membership_beneficiary',
    );
  });

  test('answers an unknown membership with a 404, and a non-pending one or missing prerequisites with a 409 (BG-07)', async ({
    request,
  }) => {
    const { post, remove } = await signIn(request);
    const approve = async (membershipId: string) =>
      post(`${membershipPath(membershipId)}/activate`, {});

    await expectProblem(await approve(USERS.estherMembership), 409, 'conflict'); // already ACTIVE
    await expectProblem(await approve(randomUUID()), 404, 'resource_not_found');
    // No ACTIVE role assignment: Amina's only one is her institution-wide Teller. The approval test
    // above is the control, since without this removal Amina approves.
    expect((await remove(`/tenant/role-assignments/${USERS.aminaTeller}`)).status()).toBe(200);
    await expectProblem(await approve(USERS.aminaMembership), 409, 'conflict');

    // Suspend, reactivate and revoke of an unknown membership are 404s as well.
    const unknown = membershipPath(randomUUID());
    await expectProblem(
      await post(`${unknown}/suspend`, { reason: 'Cash audit' }),
      404,
      'resource_not_found',
    );
    await expectProblem(await post(`${unknown}/reactivate`), 404, 'resource_not_found');
    await expectProblem(
      await post(`${unknown}/revoke`, { reason: 'Left the SACCO' }),
      404,
      'resource_not_found',
    );
  });

  test('refuses suspending or revoking your own membership by name, after the lookup (BG-35)', async ({
    request,
  }) => {
    const { get, post } = await signIn(request);
    const own = membershipPath(IDS.greenfieldMembership);
    const self = 'lifecycle.self_membership_change';

    await expectProblem(await post(`${own}/suspend`, { reason: 'Cash audit' }), 403, self);
    await expectProblem(await post(`${own}/revoke`, { reason: 'Left the SACCO' }), 403, self);
    // Reactivating your own stays allowed: the ACTIVE membership's state answers, a 409.
    await expectProblem(await post(`${own}/reactivate`), 409, 'conflict');
    expect(await read(await get(own))).toMatchObject({ membership_status: 'ACTIVE' });
  });

  test('checks permission before state', async ({ request }) => {
    const { get, post } = await signIn(request, 'users-read-only');
    const esther = membershipPath(USERS.estherMembership);

    // Esther is not pending, which alone would be a 409: the missing permission answers first.
    await expectProblem(await post(`${esther}/activate`, {}), 403, 'forbidden');
    // And each of the others, whose state check would otherwise be a 200, a 409 or a 404.
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

    // The approval takes only an optional remark (platform #179, BG-01), so any other property is
    // refused; the remark alone is the control.
    const activate = `${membershipPath(USERS.aminaMembership)}/activate`;
    await expectProblem(await post(activate, { reason: 'x', note: 'x' }), 400, 'invalid_json');
    expect((await post(activate, { reason: 'x' })).status()).toBe(202);
  });

  test('revokes for good, cascading to every assignment; a second revoke is a 409', async ({
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

    // Terminal: a second revoke, under a new key, is a 409 (BG-07).
    await expectProblem(await post(revoke, { reason: 'Left the SACCO' }), 409, 'conflict');
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

    // The seeded invite event for Amina.
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

  test("pages users-many-assignments: Felix's twelve, newest assigned first, names embedded", async ({
    request,
  }) => {
    const { get } = await signIn(request, 'users-many-assignments');
    const page = async (query: string) =>
      read<Paged<AssignmentRow>>(
        await get(`/tenant/branch-assignments?user_id=${USERS.felix}&status=ACTIVE${query}`),
      );

    const first = await page('&page=0&size=10');
    expect(first.page).toMatchObject({ total_items: 12, total_pages: 2, has_next: true });
    expect(first.items[0]).toEqual({
      id: 'a1600000-0000-4000-8000-000000000061',
      user_id: USERS.felix,
      branch_id: 'a1600000-0000-4000-8000-000000000011',
      assignment_type: 'OPERATE',
      status: 'ACTIVE',
      username: 'felix.omondi',
      display_name: 'Felix Omondi',
      branch_name: 'Outpost 11',
      assigned_at: '2026-10-11T08:00:00Z',
    });
    // His seeded Westlands Home, the oldest, ends the second page.
    const second = await page('&page=1&size=10');
    expect(second.items.map((row) => row.branch_name)).toEqual(['Outpost 01', 'Westlands Branch']);
    expect(second.items[1]).toMatchObject({
      id: '10000000-0000-4000-8000-000000000207',
      assigned_at: '2026-07-01T08:00:00Z',
    });
    // Ascending when asked, with the same twelve.
    const oldest = await page('&sort_by=assignedAt&sort_dir=ASC&size=1');
    expect(oldest.items[0]?.branch_name).toBe('Westlands Branch');
    // The control: without the outposts he holds one.
    const plain = await read<Paged<AssignmentRow>>(
      await (
        await signIn(request)
      ).get(`/tenant/branch-assignments?user_id=${USERS.felix}&status=ACTIVE`),
    );
    expect(plain.page.total_items).toBe(1);
  });

  test('sorts branch assignments only by the fields the platform allows', async ({ request }) => {
    const { get } = await signIn(request);
    const bogus = await get(`/tenant/branch-assignments?user_id=${USERS.felix}&sort_by=bogus`);
    expect(bogus.status()).toBe(400);
    expect(await read<ProblemBody>(bogus)).toMatchObject({
      code: 'invalid_parameter',
      violations: [{ field: 'sort_by' }],
    });
    await expectProblem(
      await get(`/tenant/branch-assignments?sort_dir=sideways`),
      400,
      'invalid_parameter',
    );
    // Each allowed field answers.
    for (const field of ['assignedAt', 'assignmentType', 'status']) {
      expect((await get(`/tenant/branch-assignments?sort_by=${field}`)).status(), field).toBe(200);
    }
  });

  test('reads memberships in a branch context too, and searches assignments by user (BG-03)', async ({
    request,
  }) => {
    const headers = await contextFor(request, 'users', IDS.westlands);
    const get = (path: string) => request.get(api(path), { headers });

    // Memberships are never branch-restricted: everyone is listed, and any one can be read.
    expect(
      (await read<Paged<MembershipSummary>>(await get('/tenant/memberships'))).page,
    ).toMatchObject({
      total_items: 13,
    });
    expect((await get(membershipPath(USERS.estherMembership))).status()).toBe(200);
    // With neither branch_id nor user_id, assignments default to the selected branch (Jane's, and
    // four seeded people's).
    const rows = (
      await read<Paged<AssignmentRow>>(await get('/tenant/branch-assignments?status=ACTIVE'))
    ).items;
    expect(rows.map((row) => row.user_id).sort()).toEqual(
      [IDS.jane, USERS.amina, USERS.carol, USERS.daniel, USERS.felix].sort(),
    );
    expect(new Set(rows.map((row) => row.branch_id))).toEqual(new Set([IDS.westlands]));
    // A user_id search spans every branch: Esther's Head Office row, from Westlands.
    const esther = (
      await read<Paged<AssignmentRow>>(
        await get(`/tenant/branch-assignments?user_id=${USERS.esther}&status=ACTIVE`),
      )
    ).items;
    expect(esther.map((row) => row.branch_id)).toEqual([IDS.headOffice]);
  });

  // BG-17 (ADR 0040, V35/V38): taken at the first activation, from the organisation's counter.
  test('numbers members at their first activation and keeps the number for life', async ({
    request,
  }) => {
    const { get, post } = await signIn(request);
    const numberOf = async (membershipId: string) =>
      (await read<MembershipDetail>(await get(membershipPath(membershipId)))).member_number;

    // The seed numbers everyone ever active, in order; a pending one has none, nor Hassan, revoked
    // before his approval.
    expect(await numberOf(IDS.greenfieldMembership)).toBe(1);
    expect(await numberOf(USERS.victorMembership)).toBe(2);
    expect(await numberOf(USERS.felixMembership)).toBe(4);
    expect(await numberOf(USERS.gladysMembership)).toBe(5);
    expect(await numberOf(USERS.joannMembership)).toBe(8);
    expect(await numberOf(USERS.brianMembership)).toBeNull();
    expect(await numberOf(USERS.hassanMembership)).toBeNull();
    // The list carries it too.
    const list = await read<Paged<MembershipSummary & { member_number: number | null }>>(
      await get(`/tenant/memberships?user_id=${USERS.felix}`),
    );
    expect(list.items[0]?.member_number).toBe(4);

    // Brian's account has an identity, so his approval activates him (200): the next number.
    const approved = await post(`${membershipPath(USERS.brianMembership)}/activate`, {});
    expect(approved.status()).toBe(200);
    expect(await read(approved)).toMatchObject({ membership_status: 'ACTIVE', member_number: 9 });

    // A suspension and a reactivation keep it.
    const felix = membershipPath(USERS.felixMembership);
    expect(await read(await post(`${felix}/suspend`, { reason: 'Cash audit' }))).toMatchObject({
      member_number: 4,
    });
    expect(await read(await post(`${felix}/reactivate`))).toMatchObject({
      membership_status: 'ACTIVE',
      member_number: 4,
    });
    // A pending approval that queues identity provisioning (202) takes no number yet.
    const queued = await post(`${membershipPath(USERS.aminaMembership)}/activate`, {});
    expect(queued.status()).toBe(202);
    expect(await read(queued)).toMatchObject({ member_number: null });
  });

  // BG-17 (platform #161, ProfileUpdateService.updateMembership).
  test('edits a membership type and primary branch, changing only what is sent, audited', async ({
    request,
  }) => {
    const { get, patch } = await signIn(request);
    const felix = membershipPath(USERS.felixMembership);

    const typed = await patch(felix, { membership_type: 'AUDITOR' });
    expect(typed.status()).toBe(200);
    expect(await read(typed)).toMatchObject({
      id: USERS.felixMembership,
      membership_status: 'ACTIVE',
      membership_type: 'AUDITOR',
      primary_branch_id: IDS.westlands,
      member_number: 4,
    });
    // An explicit null clears the branch; an id sets it; an absent type stays.
    expect(await read(await patch(felix, { primary_branch_id: null }))).toMatchObject({
      membership_type: 'AUDITOR',
      primary_branch_id: null,
    });
    expect(await read(await patch(felix, { primary_branch_id: IDS.headOffice }))).toMatchObject({
      membership_type: 'AUDITOR',
      primary_branch_id: IDS.headOffice,
    });
    // An explicit null type is no change: with the branch, only the branch moves.
    expect(
      await read(await patch(felix, { membership_type: null, primary_branch_id: IDS.westlands })),
    ).toMatchObject({ membership_type: 'AUDITOR', primary_branch_id: IDS.westlands });
    // The primary branch needs no assignment there: Felix holds Westlands only.
    expect(
      await read(
        await patch(felix, { membership_type: 'STAFF', primary_branch_id: IDS.headOffice }),
      ),
    ).toMatchObject({ membership_type: 'STAFF', primary_branch_id: IDS.headOffice });

    // Your own membership is editable: no self rule.
    const own = await patch(membershipPath(IDS.greenfieldMembership), { membership_type: 'STAFF' });
    expect(own.status()).toBe(200);

    // One `membership.update` row per edit, on the MEMBERSHIP, naming the fields and no values.
    const rows = await read<Paged<AuditRow>>(
      await get(
        `/tenant/audit-events?entity_type=MEMBERSHIP&entity_id=${USERS.felixMembership}&action=membership.update`,
      ),
    );
    expect(rows.page.total_items).toBe(5);
    // The list leaves the metadata out; each row's detail carries it.
    const metadata = await Promise.all(
      rows.items.map(async (row) => {
        const detail = await read<{ metadata_json: string }>(
          await get(`/tenant/audit-events/${row.id}`),
        );
        return JSON.parse(detail.metadata_json) as unknown;
      }),
    );
    expect(metadata).toEqual(
      expect.arrayContaining([
        { changedFields: 'membership_type' },
        { changedFields: 'primary_branch_id' },
        { changedFields: 'membership_type,primary_branch_id' },
      ]),
    );
    expect(rows.items[0]).toMatchObject({ actor_id: IDS.jane, reason: null });
  });

  test('replays a membership edit for the same key, and a refusal stores nothing', async ({
    request,
  }) => {
    const { patch } = await signIn(request);
    const wanjiru = membershipPath(USERS.wanjiruMembership);
    const key = randomUUID();

    // Wanjiru, an ACTIVE auditor with no branch assignment: Staff needs one (409).
    await expectProblem(await patch(wanjiru, { membership_type: 'STAFF' }, key), 409, 'conflict');
    // The key was rolled back, so it carries a different edit.
    const first = await patch(wanjiru, { primary_branch_id: IDS.headOffice }, key);
    expect(first.status()).toBe(200);
    const replay = await patch(wanjiru, { primary_branch_id: IDS.headOffice }, key);
    expect(replay.headers()['idempotency-replayed']).toBe('true');
    expect(await read(replay)).toEqual(await read(first));
  });

  test('refuses a membership edit in the platform order', async ({ request }) => {
    const { patch } = await signIn(request);
    const felix = membershipPath(USERS.felixMembership);

    // The body decodes first: an unknown key, a type that isn't text, a branch that isn't a UUID.
    await expectProblem(await patch(felix, { reason: 'x' }), 400, 'invalid_json');
    await expectProblem(await patch(felix, { membership_type: 1 }), 400, 'invalid_json');
    await expectProblem(await patch(felix, { primary_branch_id: 'head' }), 400, 'invalid_json');
    // Then 422: no field, an unknown or SYSTEM type (before the lookup, so even for an unknown id).
    await expectProblem(await patch(felix, {}), 422, 'invalid_operation');
    await expectProblem(await patch(felix, { membership_type: null }), 422, 'invalid_operation');
    await expectProblem(
      await patch(membershipPath(randomUUID()), { membership_type: 'SYSTEM' }),
      422,
      'invalid_operation',
    );
    await expectProblem(await patch(felix, { membership_type: 'GUEST' }), 422, 'invalid_operation');
    // An unknown id, then a REVOKED membership, then a branch that isn't ACTIVE here.
    await expectProblem(
      await patch(membershipPath(randomUUID()), { membership_type: 'STAFF' }),
      404,
      'resource_not_found',
    );
    await expectProblem(
      await patch(membershipPath(USERS.hassanMembership), { membership_type: 'AUDITOR' }),
      422,
      'invalid_operation',
    );
    await expectProblem(
      await patch(felix, { primary_branch_id: randomUUID() }),
      422,
      'invalid_operation',
    );
    // The 409 comes before the branch: Wanjiru to Staff, at a branch that doesn't exist.
    await expectProblem(
      await patch(membershipPath(USERS.wanjiruMembership), {
        membership_type: 'ADMIN',
        primary_branch_id: randomUUID(),
      }),
      409,
      'conflict',
    );
  });

  test('asks only an ACTIVE membership for a branch assignment before Staff or Admin', async ({
    request,
  }) => {
    const { patch, post } = await signIn(request);
    const wanjiru = membershipPath(USERS.wanjiruMembership);

    await expectProblem(await patch(wanjiru, { membership_type: 'STAFF' }), 409, 'conflict');
    // Suspended, the same auditor with no assignment may become Staff.
    expect((await post(`${wanjiru}/suspend`, { reason: 'Cash audit' })).status()).toBe(200);
    expect(await read(await patch(wanjiru, { membership_type: 'STAFF' }))).toMatchObject({
      membership_status: 'SUSPENDED',
      membership_type: 'STAFF',
    });
  });

  test('gates a membership edit on membership.update and its view, tenant-wide', async ({
    request,
  }) => {
    const readOnly = await signIn(request, 'users-read-only');
    await expectProblem(
      await readOnly.patch(membershipPath(USERS.felixMembership), { membership_type: 'AUDITOR' }),
      403,
      'forbidden',
    );
    const limited = await signIn(request, 'users-limited');
    const refused = await limited.patch(membershipPath(USERS.felixMembership), {
      membership_type: 'AUDITOR',
    });
    expect(refused.status()).toBe(403);
    expect(await read(refused)).toMatchObject({
      code: 'forbidden',
      detail: 'Missing permission: membership.view.',
    });
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
