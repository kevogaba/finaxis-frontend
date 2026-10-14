import { expect, test } from '@playwright/test';
import {
  IDS,
  INVITE_SCENARIO_IDS as INVITE,
  seedScenario,
  USER_SCENARIO_IDS as USERS,
  type ScenarioName,
} from './fake-api/scenarios.mts';

test.describe('fake API invitations (contract §E.3, layer 11)', () => {
  test('seeds a pending branch, a disabled role and the two outside accounts', () => {
    const state = seedScenario('users-invite');
    expect(state.branches.find((branch) => branch.id === INVITE.kisumu)?.status).toBe(
      'PENDING_APPROVAL',
    );
    expect(state.roles.find((role) => role.id === USERS.loansOfficer)?.status).toBe('DISABLED');
    expect(
      state.memberships
        .filter((row) => row.organisationId === INVITE.pwaniTraders)
        .map((row) => row.userId),
    ).toEqual([INVITE.rehema, INVITE.otieno]);
  });

  test('grants user.invite only in its own scenarios, and user.assign_branch not in the limited one', () => {
    const codes = (scenario: ScenarioName) =>
      seedScenario(scenario).roles.find((role) => role.id === IDS.tenantAdminRole)?.permissions ??
      [];
    expect(codes('users-invite')).toEqual(
      expect.arrayContaining(['user.invite', 'user.assign_branch']),
    );
    expect(codes('users-invite-limited')).toContain('user.invite');
    expect(codes('users-invite-limited')).not.toContain('user.assign_branch');
    expect(codes('users')).not.toContain('user.invite');
  });
});
