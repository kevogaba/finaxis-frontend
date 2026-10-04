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
      maker: { ok: true, value: { actorUserId: VICTOR, name: 'Victor Otieno' } },
      me: ME,
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

  it("fails the maker check for the signed-in user's own invitation, whatever the case", () => {
    const own = checks({
      maker: { ok: true, value: { actorUserId: ME.toUpperCase(), name: null } },
    });
    expect(byId('maker', own)).toMatchObject({
      state: 'failed',
      detail: USER_MAKER_CHECKER_BLOCKED,
    });
  });

  it('names an unnamed maker by short id', () => {
    const unnamed = checks({ maker: { ok: true, value: { actorUserId: VICTOR, name: null } } });
    expect(byId('maker', unnamed)?.detail).toBe('Invited by b2000000.');
  });

  it.each([
    [
      'not permitted',
      null,
      "Your role can't view the audit trail, so this page can't tell who invited them.",
    ],
    [
      'a failed read',
      { ok: false, problem: { requestId: 'req-7' } } as const,
      "Who invited them couldn't be loaded. Reference: req-7",
    ],
    [
      'no invitation event',
      { ok: true, value: null } as const,
      "The audit trail doesn't say who invited them.",
    ],
  ])('leaves the maker check to the platform when %s', (_case, maker, why) => {
    expect(byId('maker', checks({ maker }))).toMatchObject({
      state: 'platform',
      detail: `${VERIFIED_ON_APPROVAL} ${why}`,
    });
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
      maker: { ok: true, value: { actorUserId: ME, name: 'Backend Jane Manager' } },
      me: ME,
      organisationName: 'Greenfield SACCO',
    });
    expect(list.map((check) => [check.label, check.state])).toEqual([
      ['Drafted by someone else', 'failed'],
      ['Institution is active', 'passed'],
    ]);
    expect(list[0]?.detail).toBe(MAKER_CHECKER_BLOCKED);
  });
});
