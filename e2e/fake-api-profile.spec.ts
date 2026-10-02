import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { IDS } from './fake-api/scenarios.mts';

const FAKE_API_URL = `http://127.0.0.1:${process.env.FAKE_API_PORT ?? '3199'}`;

/** A fresh run of `scenario`, with a context token for `organisationId`. */
async function signIn(request: APIRequestContext, scenario: string, organisationId: string) {
  const authorization = { Authorization: `Bearer e2e.${scenario}.${randomUUID()}` };
  const selection = await request.post(`${FAKE_API_URL}/api/v1/auth/select-organisation`, {
    headers: authorization,
    data: { organisation_id: organisationId },
  });
  const { context_token: contextToken } = (await selection.json()) as { context_token: string };
  return { ...authorization, 'X-Active-Organisation-Context': contextToken };
}

test.describe('fake API profile scenarios (layer 15)', () => {
  test('/auth/me lists a role per assignment, including a DISABLED role that grants nothing', async ({
    request,
  }) => {
    const headers = await signIn(request, 'profile-roles', IDS.greenfield);

    const me = await request.get(`${FAKE_API_URL}/api/v1/auth/me`, { headers });
    const body = (await me.json()) as {
      roles: { code: string; status: string }[];
      permissions: string[];
    };

    // Contract §C: one row per ACTIVE assignment at any scope — the frontend de-duplicates.
    expect(body.roles.filter((candidate) => candidate.code === 'TENANT_ADMIN')).toHaveLength(2);
    expect(body.roles).toContainEqual(
      expect.objectContaining({ code: 'LEGACY_TELLER', status: 'DISABLED' }),
    );
    expect(body.permissions).not.toContain('user.suspend');
  });

  test('a platform operator holding audit.view still cannot read the tenant audit trail', async ({
    request,
  }) => {
    const headers = await signIn(request, 'platform-audit-viewer', IDS.platformOrganisation);

    const me = await request.get(`${FAKE_API_URL}/api/v1/auth/me`, { headers });
    expect(((await me.json()) as { permissions: string[] }).permissions).toContain('audit.view');

    const audit = await request.get(`${FAKE_API_URL}/api/v1/tenant/audit-events`, { headers });
    expect(audit.status()).toBe(403);
  });
});
