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
});
