import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { expect, test } from '@playwright/test';
import {
  requireAuthority,
  requireBranchPermission,
  requireContext,
  requirePermission,
} from './fake-api/access.mts';
import { encodeContext } from './fake-api/context-token.mts';
import type { RouteContext } from './fake-api/router.mts';
import { IDS, seedScenario } from './fake-api/scenarios.mts';
import type { RunState } from './fake-api/state.mts';

// 07b-prefixed seed IDs (lane rules §5); seeded here, not as a scenario — no route needs them.
const BRANCH_ROLE = '07b00000-0000-4000-8000-000000000001';
const BRANCH_GRANT = '07b00000-0000-4000-8000-000000000002';
// Synthetic, so no seed ever holds it: any layer may add real TENANT_ADMIN codes to
// TENANT_ADMIN_PERMISSIONS (lane rules §5), which would make a real code a TENANT grant here. A
// code outside the fake's catalogue counts as ACTIVE and pairs with no view.
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
  // A route's own `@PreAuthorize` reads the selected context's authorities: a BRANCH grant counts
  // only while its branch is selected, and never at institution level.
  test('a BRANCH grant passes a route gate only while its branch is selected', () => {
    const state = withBranchGrantAtHeadOffice();
    const headOffice = requireContext(contextAt(state, IDS.headOffice));
    const westlands = requireContext(contextAt(state, IDS.westlands));
    const institution = requireContext(contextAt(state, null));
    const refused = 'You are not permitted to perform this action.';

    expect(() => {
      requireAuthority(headOffice, [BRANCH_ONLY]);
    }).not.toThrow();
    expect(() => {
      requirePermission(headOffice, BRANCH_ONLY);
    }).toThrow(`Missing permission: ${BRANCH_ONLY}.`);
    expect(() => {
      requireAuthority(westlands, [BRANCH_ONLY]);
    }).toThrow(refused);
    expect(() => {
      requireAuthority(institution, [BRANCH_ONLY]);
    }).toThrow(refused);
    // Any one of the route's codes passes (`hasAnyAuthority`).
    expect(() => {
      requireAuthority(westlands, [BRANCH_ONLY, 'audit.view']);
    }).not.toThrow();
    // /auth/me reports the context's effective codes, BRANCH grants at the selected branch included.
    expect(headOffice.permissions.has(BRANCH_ONLY)).toBe(true);
    expect(institution.permissions.has(BRANCH_ONLY)).toBe(false);
  });

  // BG-03: the target check counts a BRANCH grant at the target whichever branch is selected, and
  // pairs a mutation with its views there (ADR 0030); the route gate checks the code alone.
  test('pairs a mutation with its views at the target, whichever branch is selected', () => {
    const state = withBranchGrantAtHeadOffice();
    const role = state.roles.find((candidate) => candidate.id === BRANCH_ROLE);
    role?.permissions.push('gl_account.create');
    const westlands = requireContext(contextAt(state, IDS.westlands));
    expect(() => {
      requireBranchPermission(westlands, 'gl_account.create', IDS.headOffice);
    }).toThrow('Missing permission: gl_account.view.');
    expect(() => {
      requireAuthority(requireContext(contextAt(state, IDS.headOffice)), ['gl_account.create']);
    }).not.toThrow();
    role?.permissions.push('gl_account.view');
    expect(() => {
      requireBranchPermission(
        requireContext(contextAt(state, IDS.westlands)),
        'gl_account.create',
        IDS.headOffice,
      );
    }).not.toThrow();
    expect(() => {
      requireBranchPermission(
        requireContext(contextAt(state, IDS.westlands)),
        'gl_account.create',
        IDS.westlands,
      );
    }).toThrow('Missing permission: gl_account.create.');
  });

  test('refuses a tenant-scope mutation whose view is held only at branch scope', () => {
    const state = withBranchGrantAtHeadOffice();
    state.roles
      .find((candidate) => candidate.id === BRANCH_ROLE)
      ?.permissions.push('gl_account.view');
    state.roles
      .find((candidate) => candidate.id === IDS.tenantAdminRole)
      ?.permissions.push('gl_account.create');
    const headOffice = requireContext(contextAt(state, IDS.headOffice));
    expect(() => {
      requirePermission(headOffice, 'gl_account.create');
    }).toThrow('Missing permission: gl_account.view.');
    expect(() => {
      requireBranchPermission(headOffice, 'gl_account.create', IDS.headOffice);
    }).not.toThrow();
  });

  test('a TENANT grant satisfies every check, at a branch and at institution level', () => {
    const state = seedScenario('default');
    for (const branchId of [IDS.headOffice, null]) {
      const access = requireContext(contextAt(state, branchId));
      expect(() => {
        requirePermission(access, 'audit.view');
      }).not.toThrow();
      expect(() => {
        requireAuthority(access, ['audit.view']);
      }).not.toThrow();
      expect(() => {
        requireBranchPermission(access, 'audit.view', IDS.westlands);
      }).not.toThrow();
    }
  });
});
