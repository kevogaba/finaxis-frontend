import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { seedScenario } from './fake-api/scenarios.mts';

const FAKE_API_URL = `http://127.0.0.1:${process.env.FAKE_API_PORT ?? '3199'}`;

function bearer(scenario = 'default') {
  return { Authorization: `Bearer e2e.${scenario}.${randomUUID()}` };
}

test.describe('fake API', () => {
  test('is healthy', async ({ request }) => {
    const response = await request.get(`${FAKE_API_URL}/__health`);
    expect(response.status()).toBe(200);
  });

  test('rejects a missing bearer token with problem JSON', async ({ request }) => {
    const response = await request.get(`${FAKE_API_URL}/api/v1/auth/organisations`);
    expect(response.status()).toBe(401);
    expect(response.headers()['content-type']).toContain('application/problem+json');
    expect(await response.json()).toMatchObject({
      code: 'authentication_required',
      status: 401,
      violations: null,
    });
  });

  test('rejects an unknown scenario token with an empty 401 like an invalid JWT', async ({
    request,
  }) => {
    const response = await request.get(`${FAKE_API_URL}/api/v1/auth/organisations`, {
      headers: { Authorization: 'Bearer not-a-fake-token' },
    });
    expect(response.status()).toBe(401);
    expect(await response.text()).toBe('');
  });

  test('returns resource_not_found for unknown routes', async ({ request }) => {
    const response = await request.get(`${FAKE_API_URL}/api/v1/nope`, { headers: bearer() });
    expect(response.status()).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'resource_not_found' });
  });

  // No route yet exposes user/role state to assert this over HTTP (Task 2+ adds those routes),
  // so this seeds directly: two independent tokens for the same scenario must never observe each
  // other's mutations, which requires every seed to own fresh objects/arrays, not shared fixtures.
  test('seeds independent, unshared fixtures for every call', () => {
    const first = seedScenario('default');
    const second = seedScenario('default');

    expect(first.users[0]).toBeDefined();
    expect(first.users[0]).not.toBe(second.users[0]);

    const firstRole = first.roles[0];
    const secondRole = second.roles[0];
    expect(firstRole).toBeDefined();
    expect(firstRole?.permissions).not.toBe(secondRole?.permissions);
    expect(firstRole?.permissions).toEqual(secondRole?.permissions);
  });

  test('selects a multi-branch organisation and requires a branch', async ({ request }) => {
    const headers = bearer();
    const organisations = await request.get(`${FAKE_API_URL}/api/v1/auth/organisations`, {
      headers,
    });
    expect(await organisations.json()).toMatchObject({
      items: [{ display_name: 'Greenfield SACCO', tenant_code: 'greenfield' }],
      page: { number: 0, size: 25, total_items: 1, total_pages: 1 },
    });

    const selection = await request.post(`${FAKE_API_URL}/api/v1/auth/select-organisation`, {
      headers,
      data: { organisation_id: '11111111-1111-4111-8111-111111111111' },
    });
    const body = (await selection.json()) as {
      context_token: string;
      requires_branch_selection: boolean;
      branch_id: string | null;
    };
    expect(body.requires_branch_selection).toBe(true);
    expect(body.branch_id).toBeNull();

    const profile = await request.get(`${FAKE_API_URL}/api/v1/auth/me`, {
      headers: { ...headers, 'X-Active-Organisation-Context': body.context_token },
    });
    expect(await profile.json()).toMatchObject({
      full_name: 'Backend Jane Manager',
      selected_branch: null,
      organisation: { name: 'Greenfield SACCO' },
    });
  });

  test('treats a stale context token as invalid_active_tenant_context', async ({ request }) => {
    const response = await request.get(`${FAKE_API_URL}/api/v1/auth/me`, {
      headers: { ...bearer(), 'X-Active-Organisation-Context': 'stale-context-token' },
    });
    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'invalid_active_tenant_context' });
  });

  // Controller ruling: Task 1 deferred this — an unknown (camelCase) property on the body is
  // rejected the same way as every other fake-API route, regardless of the field it's shadowing.
  test('rejects an unknown property on select-organisation', async ({ request }) => {
    const response = await request.post(`${FAKE_API_URL}/api/v1/auth/select-organisation`, {
      headers: bearer(),
      data: { organisationId: '11111111-1111-4111-8111-111111111111' },
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'invalid_json' });
  });

  // Contract §A ("Missing required fields"): a missing organisation_id is validation_failed
  // with a NotNull violation, not invalid_json (and not the violations-less paging quirk).
  test('requires organisation_id on select-organisation', async ({ request }) => {
    const response = await request.post(`${FAKE_API_URL}/api/v1/auth/select-organisation`, {
      headers: bearer(),
      data: {},
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'validation_failed',
      violations: [{ field: 'organisation_id', code: 'NotNull' }],
    });
  });
});
