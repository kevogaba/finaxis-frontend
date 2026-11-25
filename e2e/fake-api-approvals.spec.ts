import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import {
  APPROVAL_SCENARIO_IDS as APPROVALS,
  APPROVAL_SCENARIO_TEXT as TEXT,
  IDS,
  USER_SCENARIO_IDS as USERS,
  type ScenarioName,
} from './fake-api/scenarios.mts';
import { api, contextFor } from './support/fake-api';

interface Paged<T> {
  items: T[];
  page: { total_items: number; has_next: boolean };
}

interface UserRow {
  id: string;
  display_name: string;
  email: string;
  user_status: string;
  membership_status: string;
}

interface BranchRow {
  id: string;
  branch_name: string;
  status: string;
}

type Actor = { id: string; display_name: string | null } | null;

interface MembershipEcho {
  membership_status: string;
  user_status: string;
}

const read = async <T>(response: APIResponse): Promise<T> => (await response.json()) as T;

/** A fresh run of `scenario`, at institution level unless a branch is named. */
async function signIn(
  request: APIRequestContext,
  scenario: ScenarioName = 'approvals',
  branchId: string | null = null,
) {
  const headers = await contextFor(request, scenario, branchId);
  return {
    get: (path: string) => request.get(api(path), { headers }),
    post: (path: string, data: Record<string, unknown> = {}) =>
      request.post(api(path), { headers: { ...headers, 'Idempotency-Key': randomUUID() }, data }),
  };
}

test.describe('fake API: the approvals scenarios (layer 12)', () => {
  test('lists nine pending memberships newest first, one of them provisioning', async ({
    request,
  }) => {
    const { get } = await signIn(request);
    const pending = await read<Paged<UserRow>>(
      await get('/tenant/users?membership_status=PENDING_APPROVAL&page=0&size=10'),
    );
    expect(pending.items.map((row) => row.id)).toEqual([
      APPROVALS.usha,
      APPROVALS.zawadi,
      APPROVALS.tabitha,
      APPROVALS.samuel,
      APPROVALS.rose,
      USERS.daniel,
      USERS.carol,
      USERS.brian,
      USERS.amina,
    ]);
    // Usha is the blocked case: her account is suspended, though her membership is pending.
    expect(pending.items[0]?.user_status).toBe('SUSPENDED');
    const zawadi = pending.items[1];
    expect(zawadi?.display_name).toBe(TEXT.longName);
    expect(zawadi?.display_name).toHaveLength(100);
    expect(zawadi?.email).toBe(TEXT.longEmail);
    // One unbreakable token: no hyphen, space or slash a browser could wrap at.
    expect(TEXT.longEmail).toMatch(/^[a-z.@]{79}$/);

    const provisioning = await read<Paged<UserRow>>(
      await get(
        '/tenant/users?membership_status=PENDING_APPROVAL&user_status=PROVISIONING_IDP&page=0&size=1',
      ),
    );
    expect(provisioning.page.total_items).toBe(1);
  });

  test('lists three pending branches newest first, never the draft', async ({ request }) => {
    const { get } = await signIn(request);
    const pending = await read<Paged<BranchRow>>(
      await get('/branches?status=PENDING_APPROVAL&sort_by=createdAt&sort_dir=DESC&page=0&size=10'),
    );
    expect(pending.items.map((row) => row.id)).toEqual([
      APPROVALS.lamu,
      APPROVALS.naivasha,
      APPROVALS.kericho,
    ]);
    expect(pending.items[0]?.branch_name).toBe(TEXT.longBranch);
    expect(TEXT.longBranch).toHaveLength(100);
    // The draft the list leaves out really exists, as a DRAFT (deleting the seed would otherwise
    // keep this test green).
    const voi = await get(`/branches/${APPROVALS.voi}`);
    expect(voi.status()).toBe(200);
    expect(await read<BranchRow>(voi)).toMatchObject({ status: 'DRAFT' });
  });

  // BG-08: the record names its maker (ActorRefResponse); a tenant caller sees a member only.
  test('names each request’s maker on its record', async ({ request }) => {
    const { get } = await signIn(request);
    const inviter = async (userId: string) =>
      (await read<{ created_by: Actor }>(await get(`/tenant/users/${userId}`))).created_by;
    expect(await inviter(APPROVALS.rose)).toEqual({
      id: USERS.victor,
      display_name: 'Victor Otieno',
    });
    expect((await inviter(USERS.carol))?.id).toBe(IDS.jane);
    // Seeded by the system: no maker.
    expect(await inviter(IDS.jane)).toBeNull();
    const memberships = await read<Paged<{ user_id: string; created_by: Actor }>>(
      await get('/tenant/memberships?membership_status=PENDING_APPROVAL&size=100'),
    );
    expect(memberships.items.find((row) => row.user_id === USERS.carol)?.created_by?.id).toBe(
      IDS.jane,
    );
    const branch = async (id: string) =>
      read<{ created_by: Actor; submitted_by: Actor }>(await get(`/branches/${id}`));
    expect((await branch(APPROVALS.naivasha)).created_by?.id).toBe(IDS.jane);
    expect(await branch(APPROVALS.kericho)).toMatchObject({
      created_by: { id: USERS.victor, display_name: 'Victor Otieno' },
      submitted_by: { id: USERS.victor, display_name: 'Victor Otieno' },
    });
    const list = await read<Paged<{ id: string; created_by: Actor }>>(
      await get('/branches?status=PENDING_APPROVAL&size=100'),
    );
    expect(list.items.find((row) => row.id === APPROVALS.lamu)?.created_by?.id).toBe(USERS.victor);
  });

  // ADR 0032: a stored `false` relaxes the tenant's own maker; reading it needs settings.view.
  test.describe('the maker-checker switches', () => {
    test('reads a switch by its key, and refuses one without settings.view', async ({
      request,
    }) => {
      const on = await signIn(request);
      const key = 'require_maker_checker_for_user_invites';
      expect(await read(await on.get(`/tenant/settings/${key}`))).toMatchObject({
        key,
        value: 'true',
        is_default: true,
      });
      const off = await signIn(request, 'approvals-self-approval');
      expect(await read(await off.get(`/tenant/settings/${key}`))).toMatchObject({
        value: 'false',
        is_default: false,
      });
      const blind = await signIn(request, 'approvals-no-settings');
      expect((await blind.get(`/tenant/settings/${key}`)).status()).toBe(403);
    });

    test('off: the inviter approves, audited HIGH with selfApproved', async ({ request }) => {
      const { get, post } = await signIn(request, 'approvals-self-approval');
      const response = await post(`/tenant/memberships/${USERS.carolMembership}/activate`);
      expect(response.status()).toBe(202);
      const rows = await read<Paged<{ id: string; severity: string }>>(
        await get(`/tenant/audit-events?entity_id=${USERS.carol}&action=user.approve`),
      );
      expect(rows.items).toHaveLength(1);
      expect(rows.items[0]?.severity).toBe('HIGH');
      const detail = await read<{ metadata_json: string }>(
        await get(`/tenant/audit-events/${rows.items[0]?.id}`),
      );
      expect(JSON.parse(detail.metadata_json)).toEqual({ selfApproved: 'true' });
    });

    test('off: the drafter activates, with a branch.self_approve row, HIGH', async ({
      request,
    }) => {
      const { get, post } = await signIn(request, 'approvals-self-approval');
      const response = await post(`/branches/${APPROVALS.naivasha}/activate`, {
        reason: 'Licence received',
      });
      expect(response.status()).toBe(200);
      const rows = await read<Paged<{ severity: string; reason: string | null }>>(
        await get(
          `/tenant/audit-events?entity_id=${APPROVALS.naivasha}&action=branch.self_approve`,
        ),
      );
      expect(rows.items).toEqual([
        expect.objectContaining({ severity: 'HIGH', reason: 'Licence received' }),
      ]);
    });

    test('off: someone else’s approval is ordinary, with no extra row', async ({ request }) => {
      const { get, post } = await signIn(request, 'approvals-self-approval');
      expect((await post(`/branches/${APPROVALS.kericho}/activate`)).status()).toBe(200);
      const rows = await read<Paged<unknown>>(
        await get(`/tenant/audit-events?entity_id=${APPROVALS.kericho}&action=branch.self_approve`),
      );
      expect(rows.items).toHaveLength(0);
    });
  });

  test.describe('approves by the contract (§E.3, §F)', () => {
    test('an auditor with an identity: 200, ACTIVE', async ({ request }) => {
      const { post } = await signIn(request);
      const response = await post(`/tenant/memberships/${APPROVALS.tabithaMembership}/activate`);
      expect(response.status()).toBe(200);
      expect(await read<MembershipEcho>(response)).toMatchObject({
        membership_status: 'ACTIVE',
      });
    });

    test('a member with no identity yet: 202, still PENDING_APPROVAL, provisioning', async ({
      request,
    }) => {
      const { post } = await signIn(request);
      const response = await post(`/tenant/memberships/${APPROVALS.zawadiMembership}/activate`);
      expect(response.status()).toBe(202);
      expect(await read<MembershipEcho>(response)).toEqual(
        expect.objectContaining({
          membership_status: 'PENDING_APPROVAL',
          user_status: 'PROVISIONING_IDP',
        }),
      );
    });

    test('a member with no role, or a staff member with no branch: 409 (BG-07)', async ({
      request,
    }) => {
      const { post } = await signIn(request);
      for (const membership of [APPROVALS.roseMembership, APPROVALS.samuelMembership]) {
        const response = await post(`/tenant/memberships/${membership}/activate`);
        expect(response.status()).toBe(409);
        expect(await read(response)).toMatchObject({ code: 'conflict' });
      }
    });

    test('a member whose account is suspended: 409, and nothing changes (BG-07)', async ({
      request,
    }) => {
      const { get, post } = await signIn(request);
      // Usha holds a branch and a role, so only her SUSPENDED account blocks the approval
      // (UserProvisioningService's activateMembershipIfPossible): it is never reactivated by it.
      const response = await post(`/tenant/memberships/${APPROVALS.ushaMembership}/activate`);
      expect(response.status()).toBe(409);
      expect(await read(response)).toMatchObject({ code: 'conflict' });
      expect(
        await read<MembershipEcho>(await get(`/tenant/memberships/${APPROVALS.ushaMembership}`)),
      ).toMatchObject({ membership_status: 'PENDING_APPROVAL', user_status: 'SUSPENDED' });
    });

    test('the inviter: 403 by name (BG-08)', async ({ request }) => {
      const { post } = await signIn(request);
      const response = await post(`/tenant/memberships/${USERS.carolMembership}/activate`);
      expect(response.status()).toBe(403);
      expect(await read(response)).toMatchObject({
        code: 'lifecycle.approver_is_membership_maker',
      });
    });
  });

  test.describe('activates a branch by the contract (§E.3)', () => {
    test('someone else’s draft: 200, ACTIVE', async ({ request }) => {
      const { post } = await signIn(request);
      const response = await post(`/branches/${APPROVALS.kericho}/activate`, {
        reason: 'Licence received',
      });
      expect(response.status()).toBe(200);
      expect(await read<{ status: string }>(response)).toMatchObject({ status: 'ACTIVE' });
    });

    test('its drafter: 403 by name (BG-08)', async ({ request }) => {
      const { post } = await signIn(request);
      const response = await post(`/branches/${APPROVALS.naivasha}/activate`);
      expect(response.status()).toBe(403);
      expect(await read(response)).toMatchObject({ code: 'lifecycle.approver_is_branch_maker' });
    });

    test('a tenant-wide approver activates it from a branch context (BG-03)', async ({
      request,
    }) => {
      const { get, post } = await signIn(request, 'approvals', IDS.headOffice);
      expect((await get(`/branches/${APPROVALS.kericho}`)).status()).toBe(200);
      const response = await post(`/branches/${APPROVALS.kericho}/activate`);
      expect(response.status()).toBe(200);
      expect(await read<{ status: string }>(response)).toMatchObject({ status: 'ACTIVE' });
    });
  });

  test('approvals-limited reads no audit trail and no assignments, and can’t revoke', async ({
    request,
  }) => {
    const { get, post } = await signIn(request, 'approvals-limited');
    expect((await get('/tenant/audit-events?page=0&size=1')).status()).toBe(403);
    expect(
      (await get(`/tenant/role-assignments?user_id=${APPROVALS.zawadi}&page=0&size=1`)).status(),
    ).toBe(403);
    expect((await get('/tenant/branch-assignments?status=ACTIVE&page=0&size=100')).status()).toBe(
      403,
    );
    // The read codes the approvals pages still need stay (user.view).
    expect((await get(`/tenant/users/${APPROVALS.zawadi}`)).status()).toBe(200);
    expect(
      (
        await post(`/tenant/memberships/${APPROVALS.zawadiMembership}/revoke`, {
          reason: 'Not ours',
        })
      ).status(),
    ).toBe(403);
    // Still approvable: user.approve and membership.view stay.
    expect(
      (await post(`/tenant/memberships/${APPROVALS.zawadiMembership}/activate`)).status(),
    ).toBe(202);
  });

  test('approvals-long-org keeps the data under an 88-character organisation name', async ({
    request,
  }) => {
    const { get } = await signIn(request, 'approvals-long-org');
    const tenant = await read<{ display_name: string }>(await get('/tenant'));
    expect(tenant.display_name).toHaveLength(88);
    const pending = await read<Paged<UserRow>>(
      await get('/tenant/users?membership_status=PENDING_APPROVAL&page=0&size=1'),
    );
    expect(pending.page.total_items).toBe(9);
  });

  test('approvals-empty has nothing pending in either queue', async ({ request }) => {
    const { get } = await signIn(request, 'approvals-empty');
    const users = await read<Paged<UserRow>>(
      await get('/tenant/users?membership_status=PENDING_APPROVAL&page=0&size=1'),
    );
    const branches = await read<Paged<BranchRow>>(
      await get('/branches?status=PENDING_APPROVAL&page=0&size=1'),
    );
    expect([users.page.total_items, branches.page.total_items]).toEqual([0, 0]);
  });
});
