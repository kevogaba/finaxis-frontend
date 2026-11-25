import { z } from 'zod';
import { actorRefSchema, instantSchema, pageSchema, uuidSchema } from '@/lib/api/wire';

/** Contract §F. Seen at rest: DRAFT, PROVISIONING_IDP, INVITED, ACTIVE, SUSPENDED, DEACTIVATED. */
export const USER_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'PROVISIONING_IDP',
  'INVITED',
  'ACTIVE',
  'SUSPENDED',
  'LOCKED',
  'DEACTIVATING',
  'DEACTIVATED',
  'ARCHIVED',
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const MEMBERSHIP_STATUSES = ['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REVOKED'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** AUDITOR and SYSTEM are branch-exempt (contract §F). */
export const MEMBERSHIP_TYPES = ['STAFF', 'ADMIN', 'AUDITOR', 'SYSTEM'] as const;
export type MembershipType = (typeof MEMBERSHIP_TYPES)[number];

/** UserInTenantSummary (contract §C): the list item and `GET /tenant/users/{id}` share it. Spec
 * §6.1: the platform module reuses it (layer 17). `createdAt` is the account's, `createdBy` the
 * membership's inviter (the re-inviter after a re-invite, BG-08). */
export const userSummarySchema = z
  .object({
    id: uuidSchema,
    username: z.string(),
    email: z.string(),
    display_name: z.string(),
    user_status: z.enum(USER_STATUSES),
    membership_status: z.enum(MEMBERSHIP_STATUSES),
    membership_id: uuidSchema,
    membership_type: z.enum(MEMBERSHIP_TYPES),
    created_at: instantSchema,
    membership_created_at: instantSchema,
    created_by: actorRefSchema,
  })
  .transform((user) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.display_name,
    userStatus: user.user_status,
    membershipStatus: user.membership_status,
    membershipId: user.membership_id,
    membershipType: user.membership_type,
    createdAt: user.created_at,
    membershipCreatedAt: user.membership_created_at,
    createdBy: user.created_by,
  }));

export type UserSummary = z.output<typeof userSummarySchema>;

export const userPageSchema = pageSchema(userSummarySchema);

/** MembershipSummary, for the overview's `size=1` count. Items also carry the member's names,
 * `primary_branch_name`, `created_at` and `member_number` (BG-09), which nothing reads. */
const membershipSummarySchema = z
  .object({
    id: uuidSchema,
    user_id: uuidSchema,
    membership_status: z.enum(MEMBERSHIP_STATUSES),
    membership_type: z.enum(MEMBERSHIP_TYPES),
    primary_branch_id: uuidSchema.nullable(),
    created_by: actorRefSchema,
  })
  .transform((membership) => ({
    id: membership.id,
    userId: membership.user_id,
    status: membership.membership_status,
    type: membership.membership_type,
    primaryBranchId: membership.primary_branch_id,
    createdBy: membership.created_by,
  }));

export type MembershipSummary = z.output<typeof membershipSummarySchema>;

export const membershipPageSchema = pageSchema(membershipSummarySchema);

/** MembershipDetail: the identity fields repeat the user read and aren't mapped. */
export const membershipDetailSchema = z
  .object({
    id: uuidSchema,
    organisation_id: uuidSchema,
    user_id: uuidSchema,
    username: z.string(),
    email: z.string(),
    display_name: z.string(),
    user_status: z.enum(USER_STATUSES),
    membership_status: z.enum(MEMBERSHIP_STATUSES),
    membership_type: z.enum(MEMBERSHIP_TYPES),
    primary_branch_id: uuidSchema.nullable(),
    created_at: instantSchema,
    updated_at: instantSchema,
    created_by: actorRefSchema,
  })
  .transform((membership) => ({
    id: membership.id,
    userId: membership.user_id,
    status: membership.membership_status,
    type: membership.membership_type,
    primaryBranchId: membership.primary_branch_id,
    createdAt: membership.created_at,
    updatedAt: membership.updated_at,
    createdBy: membership.created_by,
  }));

export type MembershipDetail = z.output<typeof membershipDetailSchema>;
