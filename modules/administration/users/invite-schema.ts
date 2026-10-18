import { z } from 'zod';
import { UUID_PATTERN } from '@/lib/api/wire';
import { BRANCH_ASSIGNMENT_TYPES } from '@/modules/administration/branches/branch-contract';
import { ROLE_SCOPE_TYPES } from '@/modules/administration/roles/role-contract';
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
  needsBranch,
  ROLE_BRANCH_UNASSIGNED,
} from './invite-rules';
import { MEMBERSHIP_TYPES } from './user-contract';

/**
 * The Invite user wizard's values, their rules and the InviteUser body (spec §10.5, contract §D).
 * Client-safe: the wizard (React Hook Form) and the Server Action refuse the same things with the
 * same words (spec §6.4).
 */

const USERNAME = /^[a-zA-Z0-9._-]{3,50}$/;
const OPTIONAL_PHONE = /^(\+[1-9]\d{1,14})?$/;
const isMembershipType = (value: string) => (MEMBERSHIP_TYPES as readonly string[]).includes(value);
const isAssignmentType = (value: string) =>
  (BRANCH_ASSIGNMENT_TYPES as readonly string[]).includes(value);
const isScopeType = (value: string) => (ROLE_SCOPE_TYPES as readonly string[]).includes(value);
const isId = (value: string) => UUID_PATTERN.test(value);

/** InviteUser's identity (contract §D), with 16's messages for the same rules (Ruling 11). */
const IDENTITY_SHAPE = {
  displayName: z
    .string()
    .trim()
    .min(2, 'Enter a name of at least 2 characters.')
    .max(100, 'Use at most 100 characters.'),
  // RFC 5321's limit; the email check's route refuses a longer one (the contract states none).
  email: z.email('Enter a valid email address.').max(254, 'Use at most 254 characters.'),
  username: z
    .string()
    .trim()
    .regex(USERNAME, 'Use 3–50 letters, digits, dots, underscores or hyphens.'),
  phone: z
    .string()
    .trim()
    .regex(OPTIONAL_PHONE, 'Use the international format, e.g. +254712000140.'),
  membershipType: z.string().refine(isMembershipType, 'Choose a membership type.'),
};

// Rows stay plain strings, so every Access rule runs in one pass (a failed enum would skip the
// object's refinement) and each message is the rule's own.
const branchRowSchema = z.object({ branchId: z.string(), assignmentType: z.string() });
const roleRowSchema = z.object({ roleId: z.string(), scopeType: z.string(), branchId: z.string() });
export type BranchRow = z.output<typeof branchRowSchema>;
export type RoleRow = z.output<typeof roleRowSchema>;

const BOOLEAN_TEXT = z.enum(['true', 'false']);
const INVITATION_SHAPE = {
  sendIdentityInvite: BOOLEAN_TEXT,
  sendApplicationInvite: BOOLEAN_TEXT,
};

interface AccessValues {
  membershipType: string;
  primaryBranchId: string;
  branchAssignments: readonly BranchRow[];
  roleAssignments: readonly RoleRow[];
}

/** The rules the backend answers with a 500 (BG-07), checked before anything is sent: STAFF and
 * ADMIN need a branch; at least one role; a branch-scoped role's branch must be one they are
 * assigned to; no row twice. Roles and branches are ACTIVE because only ACTIVE ones are offered. */
export function checkInviteAccess(values: AccessValues, ctx: z.RefinementCtx): void {
  const issue = (path: (string | number)[], message: string) => {
    ctx.addIssue({ code: 'custom', path, message });
  };
  const assigned = new Set<string>();
  const branchPairs = new Set<string>();
  values.branchAssignments.forEach((row, index) => {
    const branch = isId(row.branchId);
    const type = isAssignmentType(row.assignmentType);
    if (!branch) issue(['branchAssignments', index, 'branchId'], CHOOSE_ROW_BRANCH);
    if (!type) issue(['branchAssignments', index, 'assignmentType'], CHOOSE_ASSIGNMENT_TYPE);
    if (!branch) return;
    const branchId = row.branchId.toLowerCase();
    assigned.add(branchId);
    const pair = `${branchId} ${row.assignmentType}`;
    if (type && branchPairs.has(pair)) {
      issue(['branchAssignments', index, 'assignmentType'], DUPLICATE_BRANCH_ROW);
    }
    branchPairs.add(pair);
  });
  if (values.branchAssignments.length === 0 && needsBranch(values.membershipType)) {
    issue(['branchAssignments'], NEEDS_A_BRANCH);
  }

  if (values.roleAssignments.length === 0) issue(['roleAssignments'], NEEDS_A_ROLE);
  const grants = new Set<string>();
  values.roleAssignments.forEach((row, index) => {
    const role = isId(row.roleId);
    const scope = isScopeType(row.scopeType);
    if (!role) issue(['roleAssignments', index, 'roleId'], CHOOSE_ROLE);
    if (!scope) issue(['roleAssignments', index, 'scopeType'], CHOOSE_SCOPE);
    if (row.scopeType !== 'BRANCH') {
      if (role && scope) {
        const grant = `${row.roleId.toLowerCase()} TENANT`;
        if (grants.has(grant)) issue(['roleAssignments', index, 'roleId'], DUPLICATE_ROLE_ROW);
        grants.add(grant);
      }
      return;
    }
    if (!isId(row.branchId)) {
      issue(['roleAssignments', index, 'branchId'], CHOOSE_ROLE_BRANCH);
      return;
    }
    const branchId = row.branchId.toLowerCase();
    if (!assigned.has(branchId)) {
      issue(['roleAssignments', index, 'branchId'], ROLE_BRANCH_UNASSIGNED);
    }
    if (!role) return;
    const grant = `${row.roleId.toLowerCase()} ${branchId}`;
    if (grants.has(grant)) issue(['roleAssignments', index, 'roleId'], DUPLICATE_ROLE_ROW);
    grants.add(grant);
  });

  // Any ACTIVE branch may be primary (contract §D; Ruling 6); the picker offers only ACTIVE ones.
  if (values.primaryBranchId !== '' && !isId(values.primaryBranchId)) {
    issue(['primaryBranchId'], CHOOSE_BRANCH);
  }
}

/** The wizard's React Hook Form values, validated in the browser. */
export const inviteSchema = z
  .object({
    ...IDENTITY_SHAPE,
    primaryBranchId: z.string(),
    branchAssignments: z.array(branchRowSchema),
    roleAssignments: z.array(roleRowSchema),
    ...INVITATION_SHAPE,
  })
  .superRefine(checkInviteAccess);

export type InviteValues = z.output<typeof inviteSchema>;

/** FormData carries each list as one JSON field; an unreadable one is refused like a bad field. */
function jsonList<S extends z.ZodType>(schema: S) {
  return z
    .string()
    .transform((raw, ctx): unknown => {
      try {
        return JSON.parse(raw);
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Check this list and try again.' });
        return z.NEVER;
      }
    })
    .pipe(schema);
}

/** The Server Action's FormData fields: the same values and rules, the lists as JSON. Not refined,
 * so the action can add its own fields (zod can't extend a refined object); the action refines it
 * with `checkInviteAccess`. */
export const INVITE_FORM_SHAPE = {
  ...IDENTITY_SHAPE,
  primaryBranchId: z.string(),
  branchAssignments: jsonList(z.array(branchRowSchema)),
  roleAssignments: jsonList(z.array(roleRowSchema)),
  ...INVITATION_SHAPE,
};

export const EMPTY_BRANCH_ROW: BranchRow = { branchId: '', assignmentType: 'HOME' };
export const EMPTY_ROLE_ROW: RoleRow = { roleId: '', scopeType: 'TENANT', branchId: '' };

/** One empty row of each to start (Ruling 2); the identity-provider invitation on, the application
 * invitation off (spec §10.5; Ruling 5). */
export const EMPTY_INVITE: InviteValues = {
  displayName: '',
  email: '',
  username: '',
  phone: '',
  membershipType: '',
  primaryBranchId: '',
  branchAssignments: [EMPTY_BRANCH_ROW],
  roleAssignments: [EMPTY_ROLE_ROW],
  sendIdentityInvite: 'true',
  sendApplicationInvite: 'false',
};

/** InviteUser (contract §D), built field by field (spec §6.2: never spread form values). An empty
 * phone and primary branch are `null`; an institution-wide role carries `branch_id: null` (contract
 * §D's AssignRole rule); the two flags are always booleans, never `null`. */
export function inviteBody(values: InviteValues): Record<string, unknown> {
  return {
    email: values.email,
    username: values.username,
    display_name: values.displayName,
    phone_e164: values.phone || null,
    membership_type: values.membershipType,
    primary_branch_id: values.primaryBranchId || null,
    branch_assignments: values.branchAssignments.map((row) => ({
      branch_id: row.branchId,
      assignment_type: row.assignmentType,
    })),
    role_assignments: values.roleAssignments.map((row) => ({
      role_id: row.roleId,
      scope_type: row.scopeType,
      branch_id: row.scopeType === 'BRANCH' ? row.branchId : null,
    })),
    send_keycloak_invite: values.sendIdentityInvite === 'true',
    send_application_invite: values.sendApplicationInvite === 'true',
  };
}
