import { z } from 'zod';
import {
  actorRefSchema,
  businessDateSchema,
  instantSchema,
  pageSchema,
  uuidSchema,
} from '@/lib/api/wire';

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

/** `sort_by` allow-list for `GET /branches` (contract §E.3); anything else is a 400 (BG-26). */
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
    created_by: actorRefSchema,
    submitted_by: actorRefSchema,
  })
  .transform((branch) => ({
    id: branch.id,
    branchCode: branch.branch_code,
    branchName: branch.branch_name,
    branchType: branch.branch_type,
    status: branch.status,
    createdAt: branch.created_at,
    createdBy: branch.created_by,
    submittedBy: branch.submitted_by,
  }));

export type BranchSummary = z.output<typeof branchSummarySchema>;

export const branchPageSchema = pageSchema(branchSummarySchema);

/** The address fields a form offers, in display order (decision Q9). A stored address is a flat
 * map of strings and may hold other keys, which are shown and kept as they are. */
export const ADDRESS_KEYS = ['line_1', 'line_2', 'city', 'region', 'postal_code'] as const;
export type AddressKey = (typeof ADDRESS_KEYS)[number];

/** A stored address's keys outside the five, with their values, as stored. */
export function otherAddressEntries(address: Readonly<Record<string, string>>): [string, string][] {
  const known: readonly string[] = ADDRESS_KEYS;
  return Object.entries(address).filter(([key]) => !known.includes(key));
}

/** The wire's address (decision Q9): the five fields' non-blank values, then the stored keys
 * outside the five from `stored`, so a save keeps them (PATCH replaces the address whole). */
export function addressWire(
  fields: Partial<Record<AddressKey, string>>,
  stored: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const known = ADDRESS_KEYS.flatMap((key) => (fields[key] ? [[key, fields[key]] as const] : []));
  return Object.fromEntries([...known, ...otherAddressEntries(stored)]);
}

/** One line: the known keys in order, then the others as stored, blanks skipped; null if none. */
export function formatAddress(address: Readonly<Record<string, string>>): string | null {
  const values = [
    ...ADDRESS_KEYS.map((key) => address[key]),
    ...otherAddressEntries(address).map(([, value]) => value),
  ];
  const parts = values.map((value) => value?.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** `opened_on` is the business date of the first activation, `closed_on` that of the closure (a
 * discarded draft has one too, BG-01); each is shown once set. */
export const branchDetailSchema = z
  .object({
    id: uuidSchema,
    branch_code: z.string(),
    branch_name: z.string(),
    branch_type: z.string(),
    parent_branch_id: uuidSchema.nullable(),
    status: z.enum(BRANCH_STATUSES),
    timezone: z.string(),
    // `{}` when none; echoes exactly the stored keys (BG-13).
    address: z.record(z.string(), z.string()),
    opened_on: businessDateSchema.nullable(),
    closed_on: businessDateSchema.nullable(),
    status_reason: z.string().nullable(),
    created_at: instantSchema,
    updated_at: instantSchema,
    // The latest submitter: the tenant activate route refuses only the creator (and editors), the
    // platform route the submitter too (BG-08).
    created_by: actorRefSchema,
    submitted_by: actorRefSchema,
  })
  .transform((branch) => ({
    id: branch.id,
    branchCode: branch.branch_code,
    branchName: branch.branch_name,
    branchType: branch.branch_type,
    parentBranchId: branch.parent_branch_id,
    status: branch.status,
    timezone: branch.timezone,
    address: branch.address,
    openedOn: branch.opened_on,
    closedOn: branch.closed_on,
    statusReason: branch.status_reason,
    createdAt: branch.created_at,
    updatedAt: branch.updated_at,
    createdBy: branch.created_by,
    submittedBy: branch.submitted_by,
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
