import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { BRANCH_SCENARIO_IDS, IDS } from './fake-api/scenarios.mts';
import { api, contextFor } from './support/fake-api';

test.describe('fake API branches (contract §E.3–§E.4)', () => {
  // BG-03 (platform #154): the selected branch no longer pins administration.
  test('reaches any branch from a branch context with a tenant-wide grant', async ({ request }) => {
    const atHeadOffice = await contextFor(request, 'branches', IDS.headOffice);
    const own = await request.get(api(`/branches/${IDS.headOffice}`), { headers: atHeadOffice });
    expect(own.status()).toBe(200);
    expect(await own.json()).toMatchObject({
      branch_code: 'HEAD_OFFICE',
      address: {},
      opened_on: null,
      closed_on: null,
    });
    // Another branch, a pending one, and an unknown id: read, activated, and 404.
    const westlands = await request.get(api(`/branches/${IDS.westlands}`), {
      headers: atHeadOffice,
    });
    expect(westlands.status()).toBe(200);
    expect(
      (
        await request.post(api(`/branches/${BRANCH_SCENARIO_IDS.thikaRoad}/activate`), {
          headers: atHeadOffice,
          data: {},
        })
      ).status(),
    ).toBe(200);
    expect(
      (await request.get(api(`/branches/${randomUUID()}`), { headers: atHeadOffice })).status(),
    ).toBe(404);
    expect(
      (
        await request.post(api(`/branches/${randomUUID()}/suspend`), {
          headers: atHeadOffice,
          data: { reason: 'Cash audit' },
        })
      ).status(),
    ).toBe(404);
  });

  // An explicit branch_id is honoured, a user_id search spans every branch, and a search with
  // neither defaults to the selected branch (BranchAssignmentController).
  test('searches assignments by branch_id or user_id, whichever branch is selected', async ({
    request,
  }) => {
    const atHeadOffice = await contextFor(request, 'branches', IDS.headOffice);
    const search = async (query: string) =>
      (await (
        await request.get(api(`/tenant/branch-assignments${query}`), { headers: atHeadOffice })
      ).json()) as { items: { branch_id: string; user_id: string }[] };

    const westlands = await search(`?branch_id=${IDS.westlands}`);
    expect(new Set(westlands.items.map((row) => row.branch_id))).toEqual(new Set([IDS.westlands]));
    expect(westlands.items).toHaveLength(3);
    const peter = await search(`?user_id=${BRANCH_SCENARIO_IDS.peter}`);
    expect(peter.items.map((row) => row.branch_id).sort()).toEqual(
      [IDS.headOffice, IDS.westlands].sort(),
    );
    const neither = await search('');
    expect(new Set(neither.items.map((row) => row.branch_id))).toEqual(new Set([IDS.headOffice]));
  });

  // A branch-scope grant counts only on its own ACTIVE branch (platform #242), and a mutation's
  // own gate reads the selected branch's grants.
  test('refuses a branch-scoped caller every other branch with 403, never 404', async ({
    request,
  }) => {
    const atHeadOffice = await contextFor(request, 'branches-branch-scoped', IDS.headOffice);
    const get = (path: string) => request.get(api(path), { headers: atHeadOffice });
    expect((await get(`/branches/${IDS.headOffice}`)).status()).toBe(200);
    for (const branchId of [IDS.westlands, BRANCH_SCENARIO_IDS.thikaRoad, randomUUID()]) {
      const refused = await get(`/branches/${branchId}`);
      expect(refused.status(), branchId).toBe(403);
      expect(await refused.json()).toMatchObject({ code: 'forbidden' });
    }
    // The route's own gate passes (branch.suspend at the selected Head Office); the target check
    // names the code it lacks at Westlands.
    const suspend = await request.post(api(`/branches/${IDS.westlands}/suspend`), {
      headers: atHeadOffice,
      data: { reason: 'Cash audit' },
    });
    expect(suspend.status()).toBe(403);
    expect(await suspend.json()).toMatchObject({ detail: 'Missing permission: branch.suspend.' });

    // The list is target-aware too: the ACTIVE branches the grant covers (BG-03).
    const listed = (await (await get('/branches')).json()) as {
      items: { id: string }[];
      page: { total_items: number };
    };
    expect(listed.items.map((branch) => branch.id)).toEqual([IDS.headOffice]);
    expect(listed.page.total_items).toBe(1);

    // Assignments: only Head Office's are visible, and another branch is a 403.
    expect((await get(`/tenant/branch-assignments?branch_id=${IDS.westlands}`)).status()).toBe(403);
    const peter = (await (
      await get(`/tenant/branch-assignments?user_id=${BRANCH_SCENARIO_IDS.peter}`)
    ).json()) as { items: { branch_id: string }[] };
    expect(peter.items.map((row) => row.branch_id)).toEqual([IDS.headOffice]);
    for (const assignmentId of [BRANCH_SCENARIO_IDS.peterAtWestlands, randomUUID()]) {
      const revoke = await request.delete(api(`/tenant/branch-assignments/${assignmentId}`), {
        headers: atHeadOffice,
      });
      expect(revoke.status(), assignmentId).toBe(403);
    }
    const assign = await request.post(api('/tenant/branch-assignments'), {
      headers: atHeadOffice,
      data: {
        user_id: BRANCH_SCENARIO_IDS.mary,
        branch_id: IDS.westlands,
        assignment_type: 'OPERATE',
      },
    });
    expect(assign.status()).toBe(403);

    // At All branches the grant still reads Head Office, but a mutation's gate refuses it, naming
    // nothing (Spring's `@PreAuthorize` refusal).
    const institution = await contextFor(request, 'branches-branch-scoped', null);
    expect(
      (await request.get(api(`/branches/${IDS.headOffice}`), { headers: institution })).status(),
    ).toBe(200);
    const listedThere = (await (
      await request.get(api('/branches'), { headers: institution })
    ).json()) as { items: { id: string }[] };
    expect(listedThere.items.map((branch) => branch.id)).toEqual([IDS.headOffice]);
    const gated = await request.post(api(`/branches/${IDS.headOffice}/suspend`), {
      headers: institution,
      data: { reason: 'Cash audit' },
    });
    expect(gated.status()).toBe(403);
    expect(await gated.json()).toMatchObject({
      code: 'forbidden',
      detail: 'You are not permitted to perform this action.',
    });
  });

  // BG-03: the route's own gate reads the selected context, the service the target, so one role
  // held at two branches acts on either while one of them is selected.
  test('acts on another branch through the same role there, from either of its branches', async ({
    request,
  }) => {
    const atHeadOffice = await contextFor(request, 'branches-two-branch-scoped', IDS.headOffice);
    const listed = (await (
      await request.get(api('/branches?sort_by=branchName&sort_dir=ASC'), { headers: atHeadOffice })
    ).json()) as { items: { id: string }[] };
    expect(listed.items.map((branch) => branch.id)).toEqual([IDS.headOffice, IDS.westlands]);

    const assign = await request.post(api('/tenant/branch-assignments'), {
      headers: atHeadOffice,
      data: {
        user_id: BRANCH_SCENARIO_IDS.mary,
        branch_id: IDS.westlands,
        assignment_type: 'OPERATE',
      },
    });
    expect(assign.status()).toBe(201);
    const revoke = await request.delete(
      api(`/tenant/branch-assignments/${BRANCH_SCENARIO_IDS.peterAtWestlands}`),
      { headers: atHeadOffice },
    );
    expect(revoke.status()).toBe(200);
    const suspend = await request.post(api(`/branches/${IDS.westlands}/suspend`), {
      headers: atHeadOffice,
      data: { reason: 'Cash audit' },
    });
    expect(suspend.status()).toBe(200);
    expect(await suspend.json()).toMatchObject({ status: 'SUSPENDED' });

    // At All branches the same grants pass no route gate.
    const institution = await contextFor(request, 'branches-two-branch-scoped', null);
    const gated = await request.post(api(`/branches/${IDS.headOffice}/suspend`), {
      headers: institution,
      data: { reason: 'Cash audit' },
    });
    expect(gated.status()).toBe(403);
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
    // BG-08: the record names its creator and its latest submitter.
    const jane = { id: IDS.jane, display_name: 'Backend Jane Manager' };
    expect(
      await (await request.get(api(`/branches/${branchId}`), { headers })).json(),
    ).toMatchObject({ created_by: jane, submitted_by: jane });
    const own = await request.post(api(`/branches/${branchId}/activate`), { headers, data: {} });
    expect(own.status()).toBe(403);
    // BG-08: its own code, never the `forbidden` of a missing permission.
    expect(await own.json()).toMatchObject({ code: 'lifecycle.approver_is_branch_maker' });
    // Before the state: the drafter's DRAFT, which alone would be a 409, is refused by name too.
    const draft = await request.post(api('/branches'), {
      headers,
      data: {
        branch_code: 'NAIROBI_CBD_2',
        branch_name: 'Nairobi CBD Annex',
        branch_type: 'OPERATIONS',
        parent_branch_id: null,
        timezone: 'Africa/Nairobi',
      },
    });
    const { branch_id: draftId } = (await draft.json()) as { branch_id: string };
    const early = await request.post(api(`/branches/${draftId}/activate`), { headers, data: {} });
    expect(early.status()).toBe(403);
    expect(await early.json()).toMatchObject({ code: 'lifecycle.approver_is_branch_maker' });

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

  test('answers an off-list branch sort_by as a 400, including names every object inherits', async ({
    request,
  }) => {
    const headers = await contextFor(request, 'default', null);
    // BG-26: only the five camelCase keys sort; a name from Object.prototype is no key.
    for (const sortBy of ['branch_code', 'toString', 'constructor', '__proto__']) {
      const refused = await request.get(api(`/branches?sort_by=${sortBy}`), { headers });
      expect(refused.status(), sortBy).toBe(400);
      expect(await refused.json()).toMatchObject({
        code: 'invalid_parameter',
        violations: [
          {
            field: 'sort_by',
            message:
              'Sort field must be one of: branchCode, branchName, branchType, createdAt, status.',
          },
        ],
      });
    }
    const sideways = await request.get(api('/branches?sort_dir=up'), { headers });
    expect(sideways.status()).toBe(400);
    expect(await sideways.json()).toMatchObject({ violations: [{ field: 'sort_dir' }] });
    const sorted = await request.get(api('/branches?sort_by=branchCode&sort_dir=ASC'), { headers });
    expect(sorted.status()).toBe(200);

    // The route has no endpoint gate, and FoundationQueryService.searchBranches checks the sort
    // before branch.view: a caller who can't list (the 403 is the control) meets the 400 first.
    const cannotList = await contextFor(request, 'no-branch-view', IDS.headOffice);
    const refused = await request.get(api('/branches'), { headers: cannotList });
    expect(refused.status()).toBe(403);
    expect(await refused.json()).toMatchObject({
      code: 'forbidden',
      detail: 'You are not permitted to perform this action.',
    });
    const refusedFirst = await request.get(api('/branches?sort_by=branch_code'), {
      headers: cannotList,
    });
    expect(refusedFirst.status()).toBe(400);
    expect(await refusedFirst.json()).toMatchObject({ violations: [{ field: 'sort_by' }] });
  });

  test('refuses a malformed parent_branch_id as invalid_json, accepting any case of a real one', async ({
    request,
  }) => {
    const headers = await contextFor(request, 'branches', null);
    const draft = (code: string, parent: string | null) =>
      request.post(api('/branches'), {
        headers,
        data: {
          branch_code: code,
          branch_name: 'Nairobi CBD Branch',
          branch_type: 'OPERATIONS',
          parent_branch_id: parent,
          timezone: 'Africa/Nairobi',
        },
      });

    // The decode fails before the field checks, so a short code can't turn it into validation_failed.
    for (const code of ['NAIROBI_CBD', 'a']) {
      const malformed = await draft(code, 'not-a-uuid');
      expect(malformed.status(), code).toBe(400);
      expect(await malformed.json()).toMatchObject({ code: 'invalid_json' });
    }

    // The controls: no parent, and a real parent whose id is written in capitals.
    expect((await draft('NAIROBI_CBD', null)).status()).toBe(201);
    const parent = await draft('KILIMANI', null);
    const { branch_id: parentId } = (await parent.json()) as { branch_id: string };
    const upper = parentId.toUpperCase();
    expect(upper).not.toBe(parentId);
    const child = await draft('KILIMANI_ANNEX', upper);
    expect(child.status()).toBe(201);
    const { branch_id: childId } = (await child.json()) as { branch_id: string };
    const read = await request.get(api(`/branches/${childId}`), { headers });
    expect(await read.json()).toMatchObject({ parent_branch_id: parentId });
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
