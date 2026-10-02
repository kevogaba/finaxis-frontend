import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { BRANCH_SCENARIO_IDS, IDS } from './fake-api/scenarios.mts';

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

test.describe('fake API branches (contract §E.3–§E.4)', () => {
  test('hides every other branch from a branch-selected context (BG-03)', async ({ request }) => {
    const atHeadOffice = await contextFor(request, 'default', IDS.headOffice);
    const own = await request.get(api(`/branches/${IDS.headOffice}`), { headers: atHeadOffice });
    expect(own.status()).toBe(200);
    expect(await own.json()).toMatchObject({
      branch_code: 'HEAD_OFFICE',
      address: {},
      opened_on: null,
      closed_on: null,
    });
    expect(
      (await request.get(api(`/branches/${IDS.westlands}`), { headers: atHeadOffice })).status(),
    ).toBe(404);
    expect(
      (
        await request.get(api(`/tenant/branch-assignments?branch_id=${IDS.westlands}`), {
          headers: atHeadOffice,
        })
      ).status(),
    ).toBe(404);

    const institution = await contextFor(request, 'default', null);
    expect(
      (await request.get(api(`/branches/${IDS.westlands}`), { headers: institution })).status(),
    ).toBe(200);
  });

  test('records the drafter and refuses their own activation (maker-checker)', async ({
    request,
  }) => {
    const headers = await contextFor(request, 'branches', null);
    const created = await request.post(api('/branches'), {
      headers,
      data: {
        branch_code: 'NAIROBI_CBD',
        branch_name: 'Nairobi CBD Branch',
        branch_type: 'OPERATIONS',
        parent_branch_id: null,
        timezone: 'Africa/Nairobi',
      },
    });
    expect(created.status()).toBe(201);
    const { branch_id: branchId } = (await created.json()) as { branch_id: string };

    expect(
      (await request.post(api(`/branches/${branchId}/submit`), { headers, data: {} })).status(),
    ).toBe(200);
    const own = await request.post(api(`/branches/${branchId}/activate`), { headers, data: {} });
    expect(own.status()).toBe(403);
    expect(await own.json()).toMatchObject({ code: 'forbidden' });

    const drafts = await request.get(
      api(
        `/tenant/audit-events?entity_type=BRANCH&entity_id=${branchId}&action=branch.create_draft`,
      ),
      { headers },
    );
    expect(await drafts.json()).toMatchObject({ items: [{ actor_id: IDS.jane }] });
    expect(
      (
        await request.post(api(`/branches/${BRANCH_SCENARIO_IDS.thikaRoad}/activate`), {
          headers,
          data: {},
        })
      ).status(),
    ).toBe(200);
  });

  test("guards close and a staff member's last assignment", async ({ request }) => {
    const headers = await contextFor(request, 'branches', null);
    expect(
      (
        await request.post(api(`/branches/${IDS.westlands}/close`), {
          headers,
          data: { reason: 'Relocating' },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await request.delete(
          api(`/tenant/branch-assignments/${BRANCH_SCENARIO_IDS.maryAtWestlands}`),
          { headers },
        )
      ).status(),
    ).toBe(409);
    const revoked = await request.delete(
      api(`/tenant/branch-assignments/${BRANCH_SCENARIO_IDS.peterAtWestlands}`),
      { headers },
    );
    expect(await revoked.json()).toMatchObject({ status: 'REVOKED' });
  });

  test('answers an off-list branch sort_by as a 500, including names every object inherits', async ({
    request,
  }) => {
    const headers = await contextFor(request, 'default', null);
    // BG-07: only the five camelCase keys sort; a name from Object.prototype is no key.
    for (const sortBy of ['branch_code', 'toString', 'constructor', '__proto__']) {
      const refused = await request.get(api(`/branches?sort_by=${sortBy}`), { headers });
      expect(refused.status(), sortBy).toBe(500);
    }
    const sorted = await request.get(api('/branches?sort_by=branchCode&sort_dir=ASC'), { headers });
    expect(sorted.status()).toBe(200);
  });

  test('rejects unknown properties and searches tenant users', async ({ request }) => {
    const headers = await contextFor(request, 'branches', null);
    const camel = await request.post(api('/branches'), { headers, data: { branchCode: 'X1' } });
    expect(camel.status()).toBe(400);
    expect(await camel.json()).toMatchObject({ code: 'invalid_json' });

    const users = await request.get(api('/tenant/users?q=peter'), { headers });
    expect(await users.json()).toMatchObject({
      items: [
        {
          id: BRANCH_SCENARIO_IDS.peter,
          display_name: 'Peter Otieno',
          membership_status: 'ACTIVE',
        },
      ],
      page: { total_items: 1 },
    });
  });
});
