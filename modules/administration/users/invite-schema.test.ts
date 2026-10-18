import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CHOOSE_ASSIGNMENT_TYPE,
  CHOOSE_BRANCH,
  CHOOSE_ROLE,
  CHOOSE_ROLE_BRANCH,
  CHOOSE_ROW_BRANCH,
  CHOOSE_SCOPE,
  DUPLICATE_BRANCH_ROW,
  DUPLICATE_ROLE_ROW,
  NEEDS_A_BRANCH,
  NEEDS_A_ROLE,
  ROLE_BRANCH_UNASSIGNED,
} from './invite-rules';
import {
  checkInviteAccess,
  EMPTY_INVITE,
  INVITE_FORM_SHAPE,
  inviteBody,
  inviteSchema,
  type InviteValues,
} from './invite-schema';

// Distinct first blocks, so a message names its row; lettered, so an upper-cased copy differs.
const WESTLANDS = 'a4000000-0000-4000-8000-0000000000aa';
const HEAD_OFFICE = 'b2000000-0000-4000-8000-0000000000bb';
const TELLER = 'c1000000-0000-4000-8000-0000000000cc';
const SUPERVISOR = 'd1000000-0000-4000-8000-0000000000dd';

const VALID: InviteValues = {
  displayName: 'Neema Wanjiku',
  email: 'neema.wanjiku@greenfield.example',
  username: 'neema.wanjiku',
  phone: '',
  membershipType: 'STAFF',
  primaryBranchId: '',
  branchAssignments: [{ branchId: WESTLANDS, assignmentType: 'HOME' }],
  roleAssignments: [{ roleId: TELLER, scopeType: 'TENANT', branchId: '' }],
  sendIdentityInvite: 'true',
  sendApplicationInvite: 'false',
};

/** Each refusal as `path: message`, in the order zod reports them. */
function refusals(values: InviteValues): string[] {
  const result = inviteSchema.safeParse(values);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`);
}

describe('the identity', () => {
  it('accepts a valid invitation', () => {
    expect(refusals(VALID)).toEqual([]);
  });

  it('refuses each identity field by its own rule, with the same words as 16', () => {
    expect(
      refusals({
        ...VALID,
        displayName: ' N ',
        email: 'neema@',
        username: 'ne',
        phone: '0712000140',
        membershipType: '',
      }),
    ).toEqual([
      'displayName: Enter a name of at least 2 characters.',
      'email: Enter a valid email address.',
      'username: Use 3–50 letters, digits, dots, underscores or hyphens.',
      'phone: Use the international format, e.g. +254712000140.',
      'membershipType: Choose a membership type.',
    ]);
  });

  it('caps the name at 100 characters and the username at 50', () => {
    expect(refusals({ ...VALID, displayName: 'N'.repeat(101), username: 'n'.repeat(51) })).toEqual([
      'displayName: Use at most 100 characters.',
      'username: Use 3–50 letters, digits, dots, underscores or hyphens.',
    ]);
    expect(refusals({ ...VALID, displayName: 'N'.repeat(100), username: 'n'.repeat(50) })).toEqual(
      [],
    );
  });

  it('caps the email at 254 characters, with that rule’s own words', () => {
    // 64 + 1 + 182 + 8 = 255 characters, otherwise a valid address.
    const long = `${'n'.repeat(64)}@${'g'.repeat(182)}.example`;
    expect(refusals({ ...VALID, email: long })).toEqual(['email: Use at most 254 characters.']);
    expect(refusals({ ...VALID, email: long.slice(1) })).toEqual([]);
  });

  it('takes an E.164 phone, or none', () => {
    expect(refusals({ ...VALID, phone: '+254712000140' })).toEqual([]);
    expect(refusals({ ...VALID, phone: '+0712000140' })).toEqual([
      'phone: Use the international format, e.g. +254712000140.',
    ]);
  });
});

describe('the access rules (BG-07)', () => {
  it.each(['STAFF', 'ADMIN'])('asks a %s member for a branch', (membershipType) => {
    expect(refusals({ ...VALID, membershipType, branchAssignments: [] })).toEqual([
      `branchAssignments: ${NEEDS_A_BRANCH}`,
    ]);
  });

  it.each(['AUDITOR', 'SYSTEM'])('lets a %s member have no branch', (membershipType) => {
    expect(refusals({ ...VALID, membershipType, branchAssignments: [] })).toEqual([]);
  });

  it('asks for at least one role', () => {
    expect(refusals({ ...VALID, roleAssignments: [] })).toEqual([
      `roleAssignments: ${NEEDS_A_ROLE}`,
    ]);
  });

  it('names an unfinished row by its own field', () => {
    expect(
      refusals({
        ...VALID,
        branchAssignments: [{ branchId: '', assignmentType: '' }],
        roleAssignments: [{ roleId: '', scopeType: '', branchId: '' }],
      }),
    ).toEqual([
      `branchAssignments.0.branchId: ${CHOOSE_ROW_BRANCH}`,
      `branchAssignments.0.assignmentType: ${CHOOSE_ASSIGNMENT_TYPE}`,
      `roleAssignments.0.roleId: ${CHOOSE_ROLE}`,
      `roleAssignments.0.scopeType: ${CHOOSE_SCOPE}`,
    ]);
  });

  it('refuses an assignment type the contract has no word for', () => {
    expect(
      refusals({ ...VALID, branchAssignments: [{ branchId: WESTLANDS, assignmentType: 'OWNER' }] }),
    ).toEqual([`branchAssignments.0.assignmentType: ${CHOOSE_ASSIGNMENT_TYPE}`]);
  });

  it('refuses the same branch and type twice, in any letter case', () => {
    expect(
      refusals({
        ...VALID,
        branchAssignments: [
          { branchId: WESTLANDS, assignmentType: 'HOME' },
          { branchId: WESTLANDS, assignmentType: 'OPERATE' },
          { branchId: WESTLANDS.toUpperCase(), assignmentType: 'HOME' },
        ],
      }),
    ).toEqual([`branchAssignments.2.assignmentType: ${DUPLICATE_BRANCH_ROW}`]);
  });

  it('gives a branch-scoped role only a branch they are assigned to', () => {
    expect(
      refusals({
        ...VALID,
        roleAssignments: [{ roleId: SUPERVISOR, scopeType: 'BRANCH', branchId: HEAD_OFFICE }],
      }),
    ).toEqual([`roleAssignments.0.branchId: ${ROLE_BRANCH_UNASSIGNED}`]);
    expect(
      refusals({
        ...VALID,
        roleAssignments: [
          { roleId: SUPERVISOR, scopeType: 'BRANCH', branchId: WESTLANDS.toUpperCase() },
        ],
      }),
    ).toEqual([]);
  });

  it('asks a branch-scoped role for its branch', () => {
    expect(
      refusals({
        ...VALID,
        roleAssignments: [{ roleId: SUPERVISOR, scopeType: 'BRANCH', branchId: '' }],
      }),
    ).toEqual([`roleAssignments.0.branchId: ${CHOOSE_ROLE_BRANCH}`]);
  });

  it('ignores a leftover branch on an institution-wide role', () => {
    expect(
      refusals({
        ...VALID,
        roleAssignments: [{ roleId: TELLER, scopeType: 'TENANT', branchId: HEAD_OFFICE }],
      }),
    ).toEqual([]);
  });

  it('refuses the same role with the same scope twice, but not at two branches', () => {
    const twoBranches = [
      { branchId: WESTLANDS, assignmentType: 'HOME' },
      { branchId: HEAD_OFFICE, assignmentType: 'OPERATE' },
    ];
    expect(
      refusals({
        ...VALID,
        branchAssignments: twoBranches,
        roleAssignments: [
          { roleId: SUPERVISOR, scopeType: 'BRANCH', branchId: WESTLANDS },
          { roleId: SUPERVISOR, scopeType: 'BRANCH', branchId: HEAD_OFFICE },
          { roleId: TELLER, scopeType: 'TENANT', branchId: '' },
          { roleId: TELLER.toUpperCase(), scopeType: 'TENANT', branchId: '' },
          { roleId: SUPERVISOR, scopeType: 'BRANCH', branchId: WESTLANDS },
        ],
      }),
    ).toEqual([
      `roleAssignments.3.roleId: ${DUPLICATE_ROLE_ROW}`,
      `roleAssignments.4.roleId: ${DUPLICATE_ROLE_ROW}`,
    ]);
  });

  it('takes any branch as primary, or none (Ruling 6)', () => {
    expect(refusals({ ...VALID, primaryBranchId: HEAD_OFFICE })).toEqual([]);
    expect(refusals({ ...VALID, primaryBranchId: 'head-office' })).toEqual([
      `primaryBranchId: ${CHOOSE_BRANCH}`,
    ]);
  });

  it('starts with one empty row of each, so the first Continue names what is missing', () => {
    expect(refusals({ ...EMPTY_INVITE, ...identityOf(VALID) })).toEqual([
      `branchAssignments.0.branchId: ${CHOOSE_ROW_BRANCH}`,
      `roleAssignments.0.roleId: ${CHOOSE_ROLE}`,
    ]);
  });
});

function identityOf(values: InviteValues) {
  const { displayName, email, username, phone, membershipType } = values;
  return { displayName, email, username, phone, membershipType };
}

describe('the Server Action input', () => {
  const action = z.object(INVITE_FORM_SHAPE).superRefine(checkInviteAccess);
  const fields = (values: InviteValues) => ({
    ...values,
    branchAssignments: JSON.stringify(values.branchAssignments),
    roleAssignments: JSON.stringify(values.roleAssignments),
  });

  it('reads the lists from JSON and applies the same rules at the same paths', () => {
    expect(action.safeParse(fields(VALID)).data?.roleAssignments).toEqual(VALID.roleAssignments);
    const refused = action.safeParse(
      fields({
        ...VALID,
        roleAssignments: [{ roleId: SUPERVISOR, scopeType: 'BRANCH', branchId: HEAD_OFFICE }],
      }),
    );
    expect(refused.error?.issues.map((issue) => issue.path.map(String).join('.'))).toEqual([
      'roleAssignments.0.branchId',
    ]);
  });

  it('refuses a list it cannot read', () => {
    const refused = action.safeParse({ ...fields(VALID), branchAssignments: '[{' });
    expect(refused.error?.issues.map((issue) => issue.path.map(String).join('.'))).toEqual([
      'branchAssignments',
    ]);
  });
});

describe('the InviteUser body (contract §D)', () => {
  it('is built field by field in snake_case, with nulls for the empty optionals', () => {
    expect(inviteBody(VALID)).toEqual({
      email: 'neema.wanjiku@greenfield.example',
      username: 'neema.wanjiku',
      display_name: 'Neema Wanjiku',
      phone_e164: null,
      membership_type: 'STAFF',
      primary_branch_id: null,
      branch_assignments: [{ branch_id: WESTLANDS, assignment_type: 'HOME' }],
      role_assignments: [{ role_id: TELLER, scope_type: 'TENANT', branch_id: null }],
      send_keycloak_invite: true,
      send_application_invite: false,
    });
  });

  it('sends a branch-scoped role with its branch, and the filled-in optionals', () => {
    expect(
      inviteBody({
        ...VALID,
        phone: '+254712000140',
        primaryBranchId: WESTLANDS,
        roleAssignments: [
          { roleId: SUPERVISOR, scopeType: 'BRANCH', branchId: WESTLANDS },
          { roleId: TELLER, scopeType: 'TENANT', branchId: HEAD_OFFICE },
        ],
        sendIdentityInvite: 'false',
        sendApplicationInvite: 'true',
      }),
    ).toMatchObject({
      phone_e164: '+254712000140',
      primary_branch_id: WESTLANDS,
      role_assignments: [
        { role_id: SUPERVISOR, scope_type: 'BRANCH', branch_id: WESTLANDS },
        // A branch left behind on an institution-wide role is never sent (else a 422/500).
        { role_id: TELLER, scope_type: 'TENANT', branch_id: null },
      ],
      send_keycloak_invite: false,
      send_application_invite: true,
    });
  });

  it('never sends a form-only key', () => {
    expect(Object.keys(inviteBody(VALID)).sort()).toEqual([
      'branch_assignments',
      'display_name',
      'email',
      'membership_type',
      'phone_e164',
      'primary_branch_id',
      'role_assignments',
      'send_application_invite',
      'send_keycloak_invite',
      'username',
    ]);
  });
});
