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
    [
      'REVOKED',
      "This email's membership here was revoked, so it can't be invited to this institution again.",
    ],
  ] as const)('names a %s membership', (status, message) => {
    expect(memberEmailMessage(status)).toBe(message);
  });

  it("reads the route handler's answer, and nothing it doesn't know", () => {
    expect(emailCheckSchema.parse({ membershipStatus: 'REVOKED' })).toEqual({
      membershipStatus: 'REVOKED',
    });
    expect(emailCheckSchema.parse({ membershipStatus: null })).toEqual({ membershipStatus: null });
    expect(emailCheckSchema.safeParse({ membershipStatus: 'GONE' }).success).toBe(false);
    expect(emailCheckSchema.safeParse({}).success).toBe(false);
  });
});

describe('copy that promises no more than the platform does', () => {
  it('names every cause a 409 can have, and says what approval decides (Ruling 3, BG-07)', () => {
    expect(INVITE_CONFLICT).toContain(
      "conflicts with an existing member or username, or the institution isn't active",
    );
    expect(REVIEW_NOTE).toContain('must approve it before they can use this institution.');
  });

  it('asks for a reload, never a retry, when the email check is refused (Ruling 12)', () => {
    expect(EMAIL_CHECK_FAILED).toContain('Select Continue to try again.');
    expect(EMAIL_CHECK_REFUSED).toContain('Reload the page');
    expect(EMAIL_CHECK_REFUSED).not.toMatch(/try again/i);
  });
});
