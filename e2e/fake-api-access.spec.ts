import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { expect, test } from '@playwright/test';
import { requireContext, requirePermission } from './fake-api/access.mts';
import { encodeContext } from './fake-api/context-token.mts';
import type { RouteContext } from './fake-api/router.mts';
import { IDS, seedScenario } from './fake-api/scenarios.mts';
import type { RunState } from './fake-api/state.mts';

// 07b-prefixed seed IDs (lane rules §5); seeded here, not as a scenario — no route needs them.
const BRANCH_ROLE = '07b00000-0000-4000-8000-000000000001';
const BRANCH_GRANT = '07b00000-0000-4000-8000-000000000002';
// Synthetic, so no seed ever holds it: any layer may add real TENANT_ADMIN codes to
// TENANT_ADMIN_PERMISSIONS (lane rules §5), which would make a real code a TENANT grant here. The
// fake API never checks codes against a catalogue.
const BRANCH_ONLY = '07b.branch_only';

function withBranchGrantAtHeadOffice(): RunState {
  const state = seedScenario('default');
  state.roles.push({
    id: BRANCH_ROLE,
    organisationId: IDS.greenfield,
    code: 'BRANCH_OPS',
    name: 'Branch operations',
    description: null,
    systemRole: false,
    status: 'ACTIVE',
    permissions: [BRANCH_ONLY],
    createdAt: '2026-07-01T08:00:00Z',
    updatedAt: '2026-07-01T08:00:00Z',
  });
  state.roleAssignments.push({
    id: BRANCH_GRANT,
    organisationId: IDS.greenfield,
    userId: IDS.jane,
    roleId: BRANCH_ROLE,
    scopeType: 'BRANCH',
    branchId: IDS.headOffice,
    status: 'ACTIVE',
  });
  return state;
}

function contextAt(state: RunState, branchId: string | null): RouteContext {
  const req = new IncomingMessage(new Socket());
  req.headers['x-active-organisation-context'] = encodeContext({
    userId: IDS.jane,
    organisationId: IDS.greenfield,
    membershipId: IDS.greenfieldMembership,
    branchId,
  });
  return {
    req,
    res: new ServerResponse(req),
    params: {},
    query: new URLSearchParams(),
    state,
    path: '/api/v1/branches',
  };
}

test.describe('fake API permission scopes (contract §E.4)', () => {
  test('a BRANCH grant counts only for branch-scoped checks at its own branch', () => {
    const state = withBranchGrantAtHeadOffice();
    const headOffice = requireContext(contextAt(state, IDS.headOffice));
    const westlands = requireContext(contextAt(state, IDS.westlands));
    const institution = requireContext(contextAt(state, null));

    expect(() => {
      requirePermission(headOffice, BRANCH_ONLY, 'branch');
    }).not.toThrow();
    expect(() => {
      requirePermission(headOffice, BRANCH_ONLY);
    }).toThrow('not permitted');
    expect(() => {
      requirePermission(westlands, BRANCH_ONLY, 'branch');
    }).toThrow('not permitted');
    expect(() => {
      requirePermission(institution, BRANCH_ONLY, 'branch');
    }).toThrow('not permitted');
    // /auth/me reports the context's effective codes, BRANCH grants at the selected branch included.
    expect(headOffice.permissions.has(BRANCH_ONLY)).toBe(true);
    expect(institution.permissions.has(BRANCH_ONLY)).toBe(false);
  });

  test('a TENANT grant satisfies both scopes, at a branch and at institution level', () => {
    const state = seedScenario('default');
    for (const branchId of [IDS.headOffice, null]) {
      const access = requireContext(contextAt(state, branchId));
      expect(() => {
        requirePermission(access, 'audit.view');
      }).not.toThrow();
      expect(() => {
        requirePermission(access, 'audit.view', 'branch');
      }).not.toThrow();
    }
  });
});
