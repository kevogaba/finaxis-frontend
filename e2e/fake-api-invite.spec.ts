import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import {
  IDS,
  INVITE_SCENARIO_IDS as INVITE,
  INVITE_SCENARIO_TEXT as TEXT,
  seedScenario,
  USER_SCENARIO_IDS as USERS,
  type ScenarioName,
} from './fake-api/scenarios.mts';
import { api, contextFor } from './support/fake-api';

interface Paged<T> {
  items: T[];
  page: { total_items: number };
}

interface UserRow {
  id: string;
  username: string;
  email: string;
  display_name: string;
  user_status: string;
  membership_status: string;
}

interface Invitation {
  user_id: string;
  membership_id: string;
  user_status: string;
  membership_status: string;
}

interface ProblemBody {
  code: string;
  violations: { field: string; code: string }[] | null;
}

const read = async <T>(response: APIResponse): Promise<T> => (await response.json()) as T;

/** A valid InviteUser body (contract §D): Neema, staff at Westlands, a Teller everywhere. */
const BODY = {
  email: 'neema.wanjiku@greenfield.example',
  username: 'neema.wanjiku',
  display_name: 'Neema Wanjiku',
  phone_e164: '+254712000140',
  membership_type: 'STAFF',
  primary_branch_id: IDS.westlands,
  branch_assignments: [{ branch_id: IDS.westlands, assignment_type: 'HOME' }],
  role_assignments: [{ role_id: USERS.teller, scope_type: 'TENANT', branch_id: null }],
  send_keycloak_invite: true,
  send_application_invite: false,
};

/** A fresh run of `scenario`, with the requests as the app sends them. */
async function signIn(
  request: APIRequestContext,
  scenario: ScenarioName = 'users-invite',
  branchId: string | null = null,
) {
  const headers = await contextFor(request, scenario, branchId);
  return {
    get: (path: string) => request.get(api(path), { headers }),
    /** A mutation carries a fresh Idempotency-Key unless the test pins one. */
    invite: (data: Record<string, unknown>, key: string = randomUUID()) =>
      request.post(api('/tenant/users'), { headers: { ...headers, 'Idempotency-Key': key }, data }),
  };
}

async function expectProblem(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status()).toBe(status);
  expect(await read<ProblemBody>(response)).toMatchObject({ code });
}

test.describe('fake API invitations (contract §E.3, layer 11)', () => {
  test('invites a new person: 201, a DRAFT user and a pending membership with its access', async ({
    request,
  }) => {
    const { get, invite } = await signIn(request);

    const created = await invite(BODY);
    expect(created.status()).toBe(201);
    const invitation = await read<Invitation>(created);
    expect(invitation).toMatchObject({
      user_status: 'DRAFT',
      membership_status: 'PENDING_APPROVAL',
    });

    // Newest first: the directory lists her at the top.
    const users = await read<Paged<UserRow>>(await get('/tenant/users?size=1'));
    expect(users.items[0]).toEqual({
      id: invitation.user_id,
      username: 'neema.wanjiku',
      email: 'neema.wanjiku@greenfield.example',
      display_name: 'Neema Wanjiku',
      user_status: 'DRAFT',
      membership_status: 'PENDING_APPROVAL',
    });
    const membership = await read<{ membership_type: string; primary_branch_id: string }>(
      await get(`/tenant/memberships/${invitation.membership_id}`),
    );
    expect(membership).toMatchObject({
      membership_type: 'STAFF',
      primary_branch_id: IDS.westlands,
    });
    const roles = await read<Paged<{ role_id: string; scope_type: string }>>(
      await get(`/tenant/role-assignments?user_id=${invitation.user_id}`),
    );
    expect(roles.items).toMatchObject([
      { role_id: USERS.teller, scope_type: 'TENANT', branch_id: null, status: 'ACTIVE' },
    ]);
    const branches = await read<Paged<{ user_id: string; assignment_type: string }>>(
      await get(`/tenant/branch-assignments?branch_id=${IDS.westlands}&status=ACTIVE&size=100`),
    );
    expect(branches.items.filter((row) => row.user_id === invitation.user_id)).toMatchObject([
      { assignment_type: 'HOME' },
    ]);
    // The maker lookup's source (contract §G): Jane invited her.
    const audit = await read<Paged<{ actor_id: string }>>(
      await get(
        `/tenant/audit-events?entity_type=USER&entity_id=${invitation.user_id}&action=user.invite`,
      ),
    );
    expect(audit.items).toMatchObject([{ actor_id: IDS.jane }]);
  });

  test('replays a success for the same key and refuses the key with another body', async ({
    request,
  }) => {
    const { get, invite } = await signIn(request);
    const key = randomUUID();
    const first = await read<Invitation>(await invite(BODY, key));

    const replay = await invite(BODY, key);
    expect(replay.status()).toBe(201);
    expect(replay.headers()['idempotency-replayed']).toBe('true');
    expect(await read<Invitation>(replay)).toEqual(first);
    await expectProblem(
      await invite({ ...BODY, display_name: 'Neema W.' }, key),
      409,
      'IDEMPOTENCY_KEY_REUSED',
    );
    // Neither the replay nor the refused reuse wrote anything: one membership, one row.
    const rows = await read<Paged<UserRow>>(await get('/tenant/users?q=neema.wanjiku'));
    expect(rows.page.total_items).toBe(1);
  });

  test('reuses an account another institution has, ignoring the entered identity', async ({
    request,
  }) => {
    const { get, invite } = await signIn(request);
    const created = await invite({
      ...BODY,
      email: TEXT.rehemaEmail.toUpperCase(),
      username: 'someone.else',
      display_name: 'Someone Else',
    });
    expect(created.status()).toBe(201);
    expect(await read<Invitation>(created)).toMatchObject({
      user_id: INVITE.rehema,
      user_status: 'ACTIVE',
      membership_status: 'PENDING_APPROVAL',
    });
    expect(await read<UserRow>(await get(`/tenant/users/${INVITE.rehema}`))).toMatchObject({
      display_name: TEXT.rehemaName,
      username: 'rehema.mwangi',
    });
  });

  test('refuses an unknown or camelCase property, a null flag and a missing field (invalid_json)', async ({
    request,
  }) => {
    const { invite } = await signIn(request);
    await expectProblem(await invite({ ...BODY, invited_by: IDS.jane }), 400, 'invalid_json');
    await expectProblem(await invite({ ...BODY, displayName: 'Neema' }), 400, 'invalid_json');
    await expectProblem(await invite({ ...BODY, send_keycloak_invite: null }), 400, 'invalid_json');
    const { username: _username, ...withoutUsername } = BODY;
    await expectProblem(await invite(withoutUsername), 400, 'invalid_json');
    await expectProblem(
      await invite({ ...BODY, branch_assignments: [{ branch_id: IDS.westlands }] }),
      400,
      'invalid_json',
    );
    // Control: the same body without the extra key succeeds.
    expect((await invite(BODY)).status()).toBe(201);
  });

  test('takes the flags as optional (absent = their defaults), and a null list as none', async ({
    request,
  }) => {
    const { invite } = await signIn(request);
    const {
      send_keycloak_invite: _keycloak,
      send_application_invite: _application,
      ...rest
    } = BODY;
    expect((await invite(rest)).status()).toBe(201);
    // Contract §D: "Missing = absent or null", and a missing list is [].
    const auditor = await invite({
      ...rest,
      email: 'auditor.null@greenfield.example',
      username: 'auditor.null',
      membership_type: 'AUDITOR',
      branch_assignments: null,
      primary_branch_id: null,
    });
    expect(auditor.status()).toBe(201);
  });

  test('validates the identity fields with violations', async ({ request }) => {
    const { invite } = await signIn(request);
    const refused = await invite({
      ...BODY,
      email: 'neema@',
      username: 'ne',
      display_name: 'N',
      phone_e164: '0712000140',
    });
    expect(refused.status()).toBe(400);
    const body = await read<ProblemBody>(refused);
    expect(body.code).toBe('validation_failed');
    expect(body.violations?.map((violation) => violation.field)).toEqual([
      'email',
      'username',
      'display_name',
      'phone_e164',
    ]);
  });

  test('needs user.invite, and user.assign_branch only for an invited branch', async ({
    request,
  }) => {
    // `users` holds user.assign_branch but no user.invite.
    await expectProblem(await (await signIn(request, 'users')).invite(BODY), 403, 'forbidden');
    // `users-invite-limited` holds user.invite but no user.assign_branch.
    const limited = await signIn(request, 'users-invite-limited');
    await expectProblem(await limited.invite(BODY), 403, 'forbidden');
    const auditor = { ...BODY, membership_type: 'AUDITOR', branch_assignments: [] };
    expect((await limited.invite({ ...auditor, primary_branch_id: null })).status()).toBe(201);
  });

  test('invites from a branch context too, to any branch (no branch restriction)', async ({
    request,
  }) => {
    const { invite } = await signIn(request, 'users-invite', IDS.headOffice);
    expect((await invite(BODY)).status()).toBe(201);
  });

  test('seeds a pending branch, a disabled role and the two outside accounts', () => {
    const state = seedScenario('users-invite');
    // Greenfield's own branch: only the wizard's ACTIVE filter keeps it out.
    expect(state.branches.find((branch) => branch.id === INVITE.kisumu)).toMatchObject({
      organisationId: IDS.greenfield,
      status: 'PENDING_APPROVAL',
    });
    expect(state.roles.find((role) => role.id === USERS.loansOfficer)?.status).toBe('DISABLED');
    expect(
      state.memberships
        .filter((row) => row.organisationId === INVITE.pwaniTraders)
        .map((row) => row.userId),
    ).toEqual([INVITE.rehema, INVITE.otieno]);
    // …and only there: neither has a membership in Greenfield.
    expect(
      state.memberships.filter(
        (row) =>
          row.organisationId === IDS.greenfield &&
          (row.userId === INVITE.rehema || row.userId === INVITE.otieno),
      ),
    ).toEqual([]);
  });

  test('grants user.invite only in its own scenarios, and user.assign_branch not in the limited one', () => {
    const codes = (scenario: ScenarioName) =>
      seedScenario(scenario).roles.find((role) => role.id === IDS.tenantAdminRole)?.permissions ??
      [];
    expect(codes('users-invite')).toEqual(
      expect.arrayContaining(['user.invite', 'user.assign_branch']),
    );
    expect(codes('users-invite-limited')).toContain('user.invite');
    expect(codes('users-invite-limited')).not.toContain('user.assign_branch');
    expect(codes('users')).not.toContain('user.invite');
  });
});

test.describe("fake API invitations: the backend's rules (BG-07)", () => {
  test('answers each invite rule failure with a 500, storing nothing (BG-07)', async ({
    request,
  }) => {
    const { get, invite } = await signIn(request);
    const branchRole = (branchId: string | null) => ({
      ...BODY,
      role_assignments: [{ role_id: USERS.supervisor, scope_type: 'BRANCH', branch_id: branchId }],
    });
    const failures: Record<string, unknown>[] = [
      { ...BODY, role_assignments: [] },
      { ...BODY, branch_assignments: [], primary_branch_id: null },
      { ...BODY, membership_type: 'ADMIN', branch_assignments: [], primary_branch_id: null },
      { ...BODY, role_assignments: [{ role_id: USERS.loansOfficer, scope_type: 'TENANT' }] },
      { ...BODY, branch_assignments: [{ branch_id: INVITE.kisumu, assignment_type: 'HOME' }] },
      { ...BODY, primary_branch_id: INVITE.kisumu },
      {
        ...BODY,
        role_assignments: [
          { role_id: USERS.teller, scope_type: 'TENANT', branch_id: IDS.westlands },
        ],
      },
      branchRole(null),
      branchRole(IDS.headOffice),
      // Existing memberships here, in any status (BG-28): Esther is ACTIVE, Hassan REVOKED.
      { ...BODY, email: 'esther.njoki@greenfield.example' },
      { ...BODY, email: 'Hassan.Ali@greenfield.example' },
      // A username another account holds, with a new email.
      { ...BODY, username: TEXT.takenUsername },
    ];
    for (const body of failures) {
      await expectProblem(await invite(body), 500, 'internal_error');
    }
    // Control: the same body succeeds once the rule holds, and the failures stored nothing.
    expect((await invite(branchRole(IDS.westlands))).status()).toBe(201);
    const users = await read<Paged<UserRow>>(await get('/tenant/users?q=neema'));
    expect(users.page.total_items).toBe(1);
  });

  test('lets an auditor in with no branch', async ({ request }) => {
    const { invite } = await signIn(request);
    const created = await invite({
      ...BODY,
      membership_type: 'AUDITOR',
      branch_assignments: [],
      primary_branch_id: null,
    });
    expect(created.status()).toBe(201);
  });
});
