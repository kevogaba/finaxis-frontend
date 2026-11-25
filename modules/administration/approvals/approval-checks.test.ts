import { describe, expect, it } from 'vitest';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import { USER_MAKER_CHECKER_BLOCKED } from '@/modules/administration/users/user-rules';
import { branchControlChecks, userControlChecks, VERIFIED_ON_APPROVAL } from './approval-checks';

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const ME = 'a1000000-0000-4000-8000-0000000000aa';
const VICTOR = 'b2000000-0000-4000-8000-0000000000bb';

describe('the control checks', () => {
  const checks = (overrides: Partial<Parameters<typeof userControlChecks>[0]> = {}) =>
    userControlChecks({
      maker: { id: VICTOR, displayName: 'Victor Otieno' },
      me: ME,
      switchState: 'on',
      roles: { ok: true, value: 1 },
      branches: { ok: true, value: { count: 1, complete: true } },
      membershipType: 'STAFF',
      organisationName: 'Greenfield SACCO',
      ...overrides,
    });
  const byId = (id: string, list = checks()) => list.find((check) => check.id === id);

  it('passes every check for a complete request invited by someone else', () => {
    expect(checks().map((check) => [check.label, check.state])).toEqual([
      ['Invited by someone else', 'passed'],
      ['Has an active role', 'passed'],
      ['Has an active branch assignment', 'passed'],
      ['Institution is active', 'passed'],
    ]);
    expect(byId('maker')?.detail).toBe('Invited by Victor Otieno.');
    expect(byId('institution')?.detail).toBe(
      'Greenfield SACCO is active. The platform checks this on every request.',
    );
  });

  // BG-08: the maker comes from the record, so no audit.view is needed and nothing is left unread.
  it("fails the maker check for the signed-in user's own invitation, whatever the case", () => {
    const own = checks({ maker: { id: ME.toUpperCase(), displayName: null } });
    expect(byId('maker', own)).toMatchObject({
      state: 'failed',
      detail: USER_MAKER_CHECKER_BLOCKED,
    });
  });

  it('names an unnamed maker by short id', () => {
    const unnamed = checks({ maker: { id: VICTOR, displayName: null } });
    expect(byId('maker', unnamed)?.detail).toBe('Invited by b2000000.');
  });

  it('passes the maker check for a request the record names no maker for (the system, or hidden)', () => {
    expect(byId('maker', checks({ maker: null }))).toMatchObject({
      state: 'passed',
      detail: "They weren't invited by you.",
    });
  });

  it('needs no other approver for your own invitation while maker-checker is off', () => {
    const own = checks({
      maker: { id: ME, displayName: 'Backend Jane Manager' },
      switchState: 'off',
    });
    expect(byId('maker', own)).toMatchObject({
      state: 'not-required',
      detail: 'Maker-checker is off for user invitations, so you may approve your own invitation.',
    });
  });

  // Decision Q4: without settings.view (or a failed read) the platform decides.
  it('leaves your own invitation to the platform when the switch is unknown', () => {
    const own = checks({ maker: { id: ME, displayName: null }, switchState: 'unknown' });
    expect(byId('maker', own)).toMatchObject({
      state: 'platform',
      detail: `${VERIFIED_ON_APPROVAL} You invited them, and this page couldn't read whether maker-checker is on.`,
    });
  });

  it("passes someone else's invitation whatever the switch", () => {
    for (const switchState of ['on', 'off', 'unknown'] as const) {
      expect(byId('maker', checks({ switchState }))?.state).toBe('passed');
    }
  });

  it('fails the role check only on a read that found none', () => {
    expect(byId('role', checks({ roles: { ok: true, value: 0 } }))?.state).toBe('failed');
    expect(byId('role', checks({ roles: null }))?.state).toBe('platform');
    expect(byId('role', checks({ roles: null }))?.detail).toBe(
      `${VERIFIED_ON_APPROVAL} Your role can't view role assignments.`,
    );
    expect(
      byId('role', checks({ roles: { ok: false, problem: { requestId: null } } }))?.detail,
    ).toBe(`${VERIFIED_ON_APPROVAL} Their roles couldn't be loaded.`);
  });

  // BG-03: a branch-scoped role_assignment.view sees only its branches' rows, so "none" is a guess.
  it('never fails the role check on a read a branch-scoped view narrowed', () => {
    const narrowed = checks({ roles: { ok: true, value: 0 }, rolesComplete: false });
    expect(byId('role', narrowed)?.state).toBe('platform');
    expect(byId('role', narrowed)?.detail).toContain(
      'None was found among the role assignments this page could check.',
    );
    expect(
      byId('role', checks({ roles: { ok: true, value: 1 }, rolesComplete: false }))?.state,
    ).toBe('passed');
  });

  it.each([
    ['an auditor', { membershipType: 'AUDITOR' as const }, 'not-required'],
    ['a system member', { membershipType: 'SYSTEM' as const }, 'not-required'],
    [
      'a staff member with none, after a complete scan',
      { branches: { ok: true as const, value: { count: 0, complete: true } } },
      'failed',
    ],
    // A capped scan, or one a selected branch narrowed, can't prove "none" (rule 9).
    [
      'a staff member with none in a partial scan',
      { branches: { ok: true as const, value: { count: 0, complete: false } } },
      'platform',
    ],
    ['an unread membership type', { membershipType: null }, 'platform'],
    ['no branch_assignment.view', { branches: null }, 'platform'],
  ])('checks the branch assignment of %s: %s', (_case, overrides, state) => {
    expect(byId('branch', checks(overrides))?.state).toBe(state);
  });

  it('leaves the branch check to the platform when the scan failed or was not permitted, never "none"', () => {
    expect(
      byId('branch', checks({ branches: { ok: false, problem: { requestId: 'req-8' } } }))?.detail,
    ).toBe(`${VERIFIED_ON_APPROVAL} Their branch assignments couldn't be loaded. Reference: req-8`);
    expect(byId('branch', checks({ branches: null }))?.detail).toBe(
      `${VERIFIED_ON_APPROVAL} Your role can't view branch assignments.`,
    );
  });

  it('checks a branch for its drafter and the institution only', () => {
    const list = branchControlChecks({
      maker: { id: ME, displayName: 'Backend Jane Manager' },
      me: ME,
      switchState: 'on',
      organisationName: 'Greenfield SACCO',
    });
    expect(list.map((check) => [check.label, check.state])).toEqual([
      ['Drafted by someone else', 'failed'],
      ['Institution is active', 'passed'],
    ]);
    expect(list[0]?.detail).toBe(MAKER_CHECKER_BLOCKED);
  });

  it('names the switch for a branch drafter when maker-checker is off, and anyone else by name', () => {
    const maker = (id: string, switchState: 'on' | 'off') =>
      branchControlChecks({
        maker: { id, displayName: 'Victor Otieno' },
        me: ME,
        switchState,
        organisationName: 'Greenfield SACCO',
      })[0];
    expect(maker(ME, 'off')).toMatchObject({
      state: 'not-required',
      detail: 'Maker-checker is off for branch creation, so you may activate your own draft.',
    });
    expect(maker(VICTOR, 'on')).toMatchObject({
      state: 'passed',
      detail: 'Drafted by Victor Otieno.',
    });
  });
});
