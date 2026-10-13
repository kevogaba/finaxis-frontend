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

interface AuditRow {
  actor_id: string | null;
  occurred_at: string;
}

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

  test('names each request’s maker in the audit trail', async ({ request }) => {
    const { get } = await signIn(request);
    const maker = async (entityType: string, entityId: string, action: string) =>
      read<Paged<AuditRow>>(
        await get(
          `/tenant/audit-events?entity_type=${entityType}&entity_id=${entityId}&action=${action}&page=0&size=1`,
        ),
      );
    expect((await maker('USER', APPROVALS.rose, 'user.invite')).items[0]).toMatchObject({
      actor_id: USERS.victor,
      occurred_at: '2026-09-24T08:00:00Z',
    });
    expect((await maker('USER', USERS.carol, 'user.invite')).items[0]?.actor_id).toBe(IDS.jane);
    expect(
      (await maker('BRANCH', APPROVALS.naivasha, 'branch.create_draft')).items[0]?.actor_id,
    ).toBe(IDS.jane);
    expect(
      (await maker('BRANCH', APPROVALS.kericho, 'branch.create_draft')).items[0]?.actor_id,
    ).toBe(USERS.victor);
    expect((await maker('BRANCH', APPROVALS.lamu, 'branch.create_draft')).items[0]?.actor_id).toBe(
      USERS.victor,
    );
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

    test('a member with no role, or a staff member with no branch: 500 (BG-07)', async ({
      request,
    }) => {
      const { post } = await signIn(request);
      for (const membership of [APPROVALS.roseMembership, APPROVALS.samuelMembership]) {
        expect((await post(`/tenant/memberships/${membership}/activate`)).status()).toBe(500);
      }
    });

    test('the inviter: 403 (BG-08)', async ({ request }) => {
      const { post } = await signIn(request);
      expect((await post(`/tenant/memberships/${USERS.carolMembership}/activate`)).status()).toBe(
        403,
      );
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

    test('its drafter: 403 (BG-08)', async ({ request }) => {
      const { post } = await signIn(request);
      expect((await post(`/branches/${APPROVALS.naivasha}/activate`)).status()).toBe(403);
    });

    test('a branch context can’t reach a pending branch: 404 (BG-03)', async ({ request }) => {
      const { get } = await signIn(request, 'approvals', IDS.headOffice);
      expect((await get(`/branches/${APPROVALS.kericho}`)).status()).toBe(404);
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
