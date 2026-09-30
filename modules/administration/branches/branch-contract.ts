import { z } from 'zod';
import { businessDateSchema, instantSchema, pageSchema, uuidSchema } from '@/lib/api/wire';

export const BRANCH_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'ACTIVE',
  'SUSPENDED',
  'CLOSED',
  'ARCHIVED',
] as const;
export type BranchStatus = (typeof BRANCH_STATUSES)[number];

/** `branch_type` is free text (contract §F); these are the values the backend itself writes. */
export const BRANCH_TYPE_SUGGESTIONS = ['HEAD_OFFICE', 'OPERATIONS'] as const;

/** Labels only — an assignment type grants no permissions (contract §D). */
export const BRANCH_ASSIGNMENT_TYPES = ['HOME', 'OPERATE', 'APPROVE', 'VIEW'] as const;
export type BranchAssignmentType = (typeof BRANCH_ASSIGNMENT_TYPES)[number];

/** `sort_by` allow-list for `GET /branches` (contract §E.3); anything else is a backend 500. */
export const BRANCH_SORT_FIELDS = [
  'branchName',
  'branchCode',
  'branchType',
  'status',
  'createdAt',
] as const;
export type BranchSortField = (typeof BRANCH_SORT_FIELDS)[number];

const branchSummarySchema = z
  .object({
    id: uuidSchema,
    branch_code: z.string(),
    branch_name: z.string(),
    branch_type: z.string(),
    status: z.enum(BRANCH_STATUSES),
    created_at: instantSchema,
  })
  .transform((branch) => ({
    id: branch.id,
    branchCode: branch.branch_code,
    branchName: branch.branch_name,
    branchType: branch.branch_type,
    status: branch.status,
    createdAt: branch.created_at,
  }));

export type BranchSummary = z.output<typeof branchSummarySchema>;

export const branchPageSchema = pageSchema(branchSummarySchema);

/** `address` is always `{}` and `opened_on`/`closed_on` are never set (BG-13) — not mapped. */
export const branchDetailSchema = z
  .object({
    id: uuidSchema,
    branch_code: z.string(),
    branch_name: z.string(),
    branch_type: z.string(),
    parent_branch_id: uuidSchema.nullable(),
    status: z.enum(BRANCH_STATUSES),
    timezone: z.string(),
    opened_on: businessDateSchema.nullable(),
    closed_on: businessDateSchema.nullable(),
    status_reason: z.string().nullable(),
    created_at: instantSchema,
    updated_at: instantSchema,
  })
  .transform((branch) => ({
    id: branch.id,
    branchCode: branch.branch_code,
    branchName: branch.branch_name,
    branchType: branch.branch_type,
    parentBranchId: branch.parent_branch_id,
    status: branch.status,
    timezone: branch.timezone,
    openedOn: branch.opened_on,
    closedOn: branch.closed_on,
    statusReason: branch.status_reason,
    createdAt: branch.created_at,
    updatedAt: branch.updated_at,
  }));

export type BranchDetail = z.output<typeof branchDetailSchema>;

// `status` stays a plain string: a create that succeeded must never fail on its echo.
export const branchDraftResultSchema = z
  .object({ branch_id: uuidSchema, status: z.string() })
  .transform((result) => ({ branchId: result.branch_id }));

const branchAssignmentSchema = z
  .object({
    id: uuidSchema,
    user_id: uuidSchema,
    branch_id: uuidSchema,
    assignment_type: z.enum(BRANCH_ASSIGNMENT_TYPES),
    status: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    userId: row.user_id,
    branchId: row.branch_id,
    assignmentType: row.assignment_type,
    status: row.status,
  }));

export type BranchAssignment = z.output<typeof branchAssignmentSchema>;

export const branchAssignmentPageSchema = pageSchema(branchAssignmentSchema);
