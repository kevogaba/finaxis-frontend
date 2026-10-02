import { describe, expect, it } from 'vitest';
import {
  branchAssignmentPageSchema,
  branchDetailSchema,
  branchDraftResultSchema,
  branchPageSchema,
} from './branch-contract';

const WESTLANDS = '44444444-4444-4444-8444-444444444444';
const HEAD_OFFICE = '22222222-2222-4222-8222-222222222222';
const PAGE = {
  number: 0,
  size: 10,
  total_items: 1,
  total_pages: 1,
  has_next: false,
  has_previous: false,
};
const DETAIL = {
  id: WESTLANDS,
  organisation_id: '11111111-1111-4111-8111-111111111111',
  branch_code: 'WESTLANDS',
  branch_name: 'Westlands Branch',
  branch_type: 'OPERATIONS',
  parent_branch_id: HEAD_OFFICE,
  status: 'SUSPENDED',
  timezone: 'Africa/Nairobi',
  address: {},
  opened_on: null,
  closed_on: '30-09-2026',
  status_reason: 'Cash audit',
  created_at: '2026-07-01T08:00:00Z',
  updated_at: '2026-07-24T08:00:00Z',
};

describe('branch contract', () => {
  it('maps a branch detail, ignoring the always-empty address (BG-13)', () => {
    expect(branchDetailSchema.parse(DETAIL)).toEqual({
      id: WESTLANDS,
      branchCode: 'WESTLANDS',
      branchName: 'Westlands Branch',
      branchType: 'OPERATIONS',
      parentBranchId: HEAD_OFFICE,
      status: 'SUSPENDED',
      timezone: 'Africa/Nairobi',
      openedOn: null,
      closedOn: '30-09-2026',
      statusReason: 'Cash audit',
      createdAt: '2026-07-01T08:00:00Z',
      updatedAt: '2026-07-24T08:00:00Z',
    });
  });

  it('rejects an unknown status or an ISO date (schema drift → error state)', () => {
    expect(branchDetailSchema.safeParse({ ...DETAIL, status: 'PAUSED' }).success).toBe(false);
    expect(branchDetailSchema.safeParse({ ...DETAIL, closed_on: '2026-09-30' }).success).toBe(
      false,
    );
  });

  it('maps directory and assignment pages, which carry nothing else (D8)', () => {
    const branches = branchPageSchema.parse({
      items: [
        {
          id: WESTLANDS,
          organisation_id: 'o1',
          branch_code: 'WESTLANDS',
          branch_name: 'Westlands Branch',
          branch_type: 'OPERATIONS',
          status: 'ACTIVE',
          created_at: '2026-07-01T08:00:00Z',
        },
      ],
      page: PAGE,
    });
    expect(branches.items[0]).toEqual({
      id: WESTLANDS,
      branchCode: 'WESTLANDS',
      branchName: 'Westlands Branch',
      branchType: 'OPERATIONS',
      status: 'ACTIVE',
      createdAt: '2026-07-01T08:00:00Z',
    });

    const assignments = branchAssignmentPageSchema.parse({
      items: [
        {
          id: '08000000-0000-4000-8000-000000000009',
          user_id: '08000000-0000-4000-8000-000000000001',
          branch_id: WESTLANDS,
          assignment_type: 'HOME',
          status: 'ACTIVE',
        },
      ],
      page: PAGE,
    });
    expect(assignments.items[0]).toEqual({
      id: '08000000-0000-4000-8000-000000000009',
      userId: '08000000-0000-4000-8000-000000000001',
      branchId: WESTLANDS,
      assignmentType: 'HOME',
      status: 'ACTIVE',
    });
  });

  it('reads the new draft id', () => {
    expect(branchDraftResultSchema.parse({ branch_id: WESTLANDS, status: 'DRAFT' })).toEqual({
      branchId: WESTLANDS,
    });
  });
});
