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
  test('/auth/me lists each ACTIVE role once (BG-23)', async ({ request }) => {
    const headers = await signIn(request, 'profile-roles', IDS.greenfield);

    const me = await request.get(`${FAKE_API_URL}/api/v1/auth/me`, { headers });
    const body = (await me.json()) as {
      roles: { code: string; status: string }[];
      permissions: string[];
    };

    // TENANT_ADMIN is held at TENANT and at Head Office; LEGACY_TELLER is DISABLED.
    expect(body.roles.map((candidate) => candidate.code)).toEqual(['TENANT_ADMIN']);
    expect(body.permissions).not.toContain('user.suspend');
  });

  test('/auth/me reports where each code is held, over every ACTIVE branch (BG-33)', async ({
    request,
  }) => {
    // Jane holds branch.view and branch.approve only at Head Office; the rest tenant-wide.
    const headers = await signIn(request, 'overview-branch-scoped', IDS.greenfield);

    const me = await request.get(`${FAKE_API_URL}/api/v1/auth/me`, { headers });
    const body = (await me.json()) as {
      permissions: string[];
      permission_scopes: { code: string; scope: string; branch_ids?: string[] }[];
    };

    const scopes = body.permission_scopes;
    expect(scopes.map((entry) => entry.code)).toEqual(
      [...scopes.map((entry) => entry.code)].sort(),
    );
    // Institution level: the BRANCH grant isn't effective here, yet its scope is reported.
    expect(body.permissions).not.toContain('branch.view');
    expect(scopes).toContainEqual({
      code: 'branch.view',
      scope: 'BRANCH',
      branch_ids: [IDS.headOffice],
    });
    // A TENANT entry carries no branch_ids at all (not null).
    expect(scopes.find((entry) => entry.code === 'user.view')).toStrictEqual({
      code: 'user.view',
      scope: 'TENANT',
    });
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
