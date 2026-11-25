import { describe, expect, it } from 'vitest';
import {
  ASSIGNMENT_TYPE_OPTIONS,
  canInviteUsers,
  EMAIL_CHECK_FAILED,
  EMAIL_CHECK_REFUSED,
  emailCheckSchema,
  INVITE_CODES,
  INVITE_CONFLICT,
  INVITE_HREF,
  memberEmailMessage,
  MEMBERSHIP_TYPE_OPTIONS,
  needsBranch,
  REINVITE_CONFLICT,
  REINVITE_NOTE,
  reinviteLead,
  reinviteReviewNote,
  REVIEW_NOTE,
  SCOPE_OPTIONS,
  userRecordHref,
  USERS_HREF,
} from './invite-rules';

describe('who may invite (Ruling 4)', () => {
  it('needs every code the wizard uses, and only those', () => {
    // user.invite implies membership.view and user.view, and each invited branch is assigned
    // through user.assign_branch, which implies branch_assignment.view (ADR 0030).
    expect(INVITE_CODES).toEqual([
      'user.invite',
      'user.assign_branch',
      'membership.view',
      'user.view',
      'branch_assignment.view',
      'role.view',
      'branch.view',
    ]);
    const all = { permissions: INVITE_CODES, tenantPermissions: INVITE_CODES };
    expect(canInviteUsers(all)).toBe(true);
    for (const missing of INVITE_CODES) {
      const rest = INVITE_CODES.filter((code) => code !== missing);
      expect(canInviteUsers({ permissions: rest, tenantPermissions: rest }), missing).toBe(false);
    }
  });

  // Review Focus 3: POST /tenant/users checks user.invite and its views tenant-wide (BG-33); each
  // branch assignment is checked on its own branch, so a branch-scoped user.assign_branch counts.
  it.each([
    ['user.view held only at branch scope', false, ['user.invite', 'membership.view']],
    ['user.invite held only at branch scope', false, ['membership.view', 'user.view']],
    ['the invite and its views tenant-wide', true, ['user.invite', 'membership.view', 'user.view']],
  ] as const)('%s → %s', (_case, expected, tenantWide) => {
    const holder = { permissions: INVITE_CODES, tenantPermissions: tenantWide };
    expect(canInviteUsers(holder)).toBe(expected);
  });

  it('builds every href from the directory', () => {
    expect(USERS_HREF).toBe('/admin/users');
    expect(INVITE_HREF).toBe('/admin/users/new');
    expect(userRecordHref('11000000-0000-4000-8000-0000000000e1')).toBe(
      '/admin/users/11000000-0000-4000-8000-0000000000e1',
    );
  });
});

describe('the choices', () => {
  it.each([
    ['STAFF', true],
    ['ADMIN', true],
    ['AUDITOR', false],
    ['SYSTEM', false],
    ['', false],
  ])('a %s member needs a branch: %s (contract §F)', (type, needed) => {
    expect(needsBranch(type)).toBe(needed);
  });

  it('words the membership types, assignment types and scopes', () => {
    expect(MEMBERSHIP_TYPE_OPTIONS.map((option) => option.label)).toEqual([
      'Staff',
      'Admin',
      'Auditor',
      'System',
    ]);
    expect(ASSIGNMENT_TYPE_OPTIONS.map((option) => option.label)).toEqual([
      'Home',
      'Operate',
      'Approve',
      'View',
    ]);
    expect(SCOPE_OPTIONS).toEqual([
      { value: 'TENANT', label: 'Institution (all branches)' },
      { value: 'BRANCH', label: 'One branch' },
    ]);
  });
});

describe('an email already in use here (BG-28)', () => {
  it.each([
    [
      'PENDING_APPROVAL',
      'This email already has an invitation to this institution waiting for approval.',
    ],
    ['ACTIVE', 'This email already belongs to a member of this institution.'],
    [
      'SUSPENDED',
      'This email belongs to a suspended member of this institution. Reactivate them from their record instead.',
    ],
  ] as const)('names a %s membership', (status, message) => {
    expect(memberEmailMessage(status)).toBe(message);
  });

  it("reads the route handler's answer, and nothing it doesn't know", () => {
    const hassan = { membershipStatus: 'REVOKED', displayName: 'Hassan Ali' };
    expect(emailCheckSchema.parse({ member: hassan })).toEqual({ member: hassan });
    expect(emailCheckSchema.parse({ member: null })).toEqual({ member: null });
    // Only a revoked member is named: a refused email's member never is, even if sent.
    expect(emailCheckSchema.parse({ member: { membershipStatus: 'ACTIVE' } })).toEqual({
      member: { membershipStatus: 'ACTIVE' },
    });
    expect(
      emailCheckSchema.parse({ member: { membershipStatus: 'SUSPENDED', displayName: 'Esther' } }),
    ).toEqual({ member: { membershipStatus: 'SUSPENDED' } });
    expect(
      emailCheckSchema.safeParse({ member: { ...hassan, membershipStatus: 'GONE' } }).success,
    ).toBe(false);
    expect(emailCheckSchema.safeParse({ member: { membershipStatus: 'REVOKED' } }).success).toBe(
      false,
    );
    expect(emailCheckSchema.safeParse({}).success).toBe(false);
  });

  it('re-invites a revoked member by name, saying what the platform keeps and ignores, and what Continue does', () => {
    expect(reinviteLead('Hassan Ali')).toBe('This re-invites Hassan Ali.');
    // A member number is taken at first activation (platform V35): one revoked while pending has
    // none, so the copy says "any".
    expect(REINVITE_NOTE).toBe(
      'Their revoked membership returns to awaiting approval with the access you choose next. They keep any member number they had, and their existing account details stay as they are, so the name, username and phone you enter here are ignored. Someone else must approve them. Continue to choose their access, or change the email.',
    );
    expect(reinviteReviewNote('Hassan Ali')).toBe(
      'Sending re-invites Hassan Ali now: their revoked membership returns to awaiting approval with the access above. They keep any member number they had, and their existing account details stay as they are, so the name, username and phone above are ignored. A different administrator must approve it before they can use this institution.',
    );
  });
});

describe('copy that promises no more than the platform does', () => {
  it('names every cause a 409 can have, and says what approval decides (Ruling 3, BG-07)', () => {
    expect(INVITE_CONFLICT).toContain(
      "conflicts with an existing member or username, or the institution isn't active",
    );
    expect(REVIEW_NOTE).toContain('must approve it before they can use this institution.');
  });

  it("names a revoked member's 409 without the username its re-invite never checks (BG-28)", () => {
    expect(REINVITE_CONFLICT).toContain("the institution isn't active");
    expect(REINVITE_CONFLICT).not.toMatch(/username/i);
  });

  it('asks for a reload, never a retry, when the email check is refused (Ruling 12)', () => {
    expect(EMAIL_CHECK_FAILED).toContain('Select Continue to try again.');
    expect(EMAIL_CHECK_REFUSED).toContain('Reload the page');
    expect(EMAIL_CHECK_REFUSED).not.toMatch(/try again/i);
  });
});
