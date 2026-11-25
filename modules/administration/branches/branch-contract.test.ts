import { describe, expect, it } from 'vitest';
import {
  branchAssignmentPageSchema,
  branchDetailSchema,
  branchDraftResultSchema,
  branchPageSchema,
  formatAddress,
} from './branch-contract';

const WESTLANDS = '44444444-4444-4444-8444-444444444444';
const HEAD_OFFICE = '22222222-2222-4222-8222-222222222222';
const VICTOR = '10000000-0000-4000-8000-000000000001';
const MARY = '08000000-0000-4000-8000-000000000001';
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
  created_by: { id: VICTOR, display_name: 'Victor Otieno' },
  submitted_by: { id: MARY, display_name: null },
};

describe('branch contract', () => {
  it('maps a branch detail, with its stored address as sent (BG-13)', () => {
    expect(
      branchDetailSchema.parse({ ...DETAIL, address: { city: 'Nairobi', building: 'Block B' } }),
    ).toEqual({
      id: WESTLANDS,
      branchCode: 'WESTLANDS',
      branchName: 'Westlands Branch',
      branchType: 'OPERATIONS',
      parentBranchId: HEAD_OFFICE,
      status: 'SUSPENDED',
      timezone: 'Africa/Nairobi',
      address: { city: 'Nairobi', building: 'Block B' },
      openedOn: null,
      closedOn: '30-09-2026',
      statusReason: 'Cash audit',
      createdAt: '2026-07-01T08:00:00Z',
      updatedAt: '2026-07-24T08:00:00Z',
      createdBy: { id: VICTOR, displayName: 'Victor Otieno' },
      submittedBy: { id: MARY, displayName: null },
    });
  });

  it('keeps a null maker: the system, or one the caller may not see (BG-08)', () => {
    expect(
      branchDetailSchema.parse({ ...DETAIL, created_by: null, submitted_by: null }),
    ).toMatchObject({ createdBy: null, submittedBy: null });
    expect(branchDetailSchema.safeParse({ ...DETAIL, created_by: undefined }).success).toBe(false);
  });

  it('rejects an unknown status or an ISO date (schema drift → error state)', () => {
    expect(branchDetailSchema.safeParse({ ...DETAIL, status: 'PAUSED' }).success).toBe(false);
    expect(branchDetailSchema.safeParse({ ...DETAIL, closed_on: '2026-09-30' }).success).toBe(
      false,
    );
  });

  it('maps directory and assignment pages', () => {
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
          created_by: null,
          submitted_by: { id: VICTOR, display_name: 'Victor Otieno' },
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
      createdBy: null,
      submittedBy: { id: VICTOR, displayName: 'Victor Otieno' },
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

  it('refuses an address that is no flat map of strings (schema drift → error state)', () => {
    expect(branchDetailSchema.parse(DETAIL)).toMatchObject({ address: {} });
    expect(branchDetailSchema.safeParse({ ...DETAIL, address: { city: 3 } }).success).toBe(false);
    expect(branchDetailSchema.safeParse({ ...DETAIL, address: undefined }).success).toBe(false);
  });

  // Decision Q9: the five known keys in their order, then any other stored key as stored.
  it('formats an address: known keys in order, then the others, blanks skipped', () => {
    expect(
      formatAddress({
        postal_code: '00100',
        building: 'Block B',
        city: 'Nairobi',
        line_1: 'Kenyatta Avenue',
        line_2: ' ',
        region: 'Nairobi County',
      }),
    ).toBe('Kenyatta Avenue, Nairobi, Nairobi County, 00100, Block B');
  });

  it('formats an empty address as null', () => {
    expect(formatAddress({})).toBeNull();
    expect(formatAddress({ line_1: '', city: '  ' })).toBeNull();
  });

  it('reads the new draft id', () => {
    expect(branchDraftResultSchema.parse({ branch_id: WESTLANDS, status: 'DRAFT' })).toEqual({
      branchId: WESTLANDS,
    });
  });
});
