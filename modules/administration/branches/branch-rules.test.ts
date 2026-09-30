import { describe, expect, it } from 'vitest';
import {
  activateBlocked,
  availableBranchActions,
  branchDraftSchema,
  branchTypeLabel,
  canAssignUsers,
  canRevokeAssignments,
} from './branch-rules';

const ALL = [
  'branch.view',
  'branch.create',
  'branch.activate',
  'branch.suspend',
  'branch.reactivate',
  'branch.close',
];
const DRAFT = {
  branchCode: 'NAIROBI_CBD',
  branchName: 'Nairobi CBD Branch',
  branchType: 'OPERATIONS',
  parentBranchId: '',
  timezone: 'Africa/Nairobi',
};

describe('branch rules', () => {
  it.each([
    ['DRAFT', ['submit']],
    ['PENDING_APPROVAL', ['activate']],
    ['ACTIVE', ['suspend', 'close']],
    ['SUSPENDED', ['reactivate', 'close']],
    ['CLOSED', []],
    ['ARCHIVED', []],
  ] as const)('offers the %s transitions', (status, expected) => {
    expect(availableBranchActions(status, { permissions: ALL })).toEqual(expected);
  });

  it('needs each code and branch.view, and submit is gated by branch.create (BG-31)', () => {
    expect(
      availableBranchActions('ACTIVE', { permissions: ['branch.view', 'branch.close'] }),
    ).toEqual(['close']);
    expect(
      availableBranchActions('DRAFT', { permissions: ['branch.view', 'branch.create'] }),
    ).toEqual(['submit']);
    expect(availableBranchActions('ACTIVE', { permissions: ['branch.suspend'] })).toEqual([]);
  });

  it('blocks activation only for a known drafter (BG-08)', () => {
    expect(activateBlocked('u1', 'u1')).toBe(true);
    expect(activateBlocked('u2', 'u1')).toBe(false);
    expect(activateBlocked(null, 'u1')).toBe(false);
  });

  it('assigns only to an ACTIVE branch, with all three codes', () => {
    const holder = { permissions: ['user.assign_branch', 'branch_assignment.view', 'user.view'] };
    expect(canAssignUsers('ACTIVE', holder)).toBe(true);
    expect(canAssignUsers('SUSPENDED', holder)).toBe(false);
    expect(canAssignUsers('ACTIVE', { permissions: ['user.assign_branch', 'user.view'] })).toBe(
      false,
    );
    // The drawer's user search (GET /tenant/users) needs user.view.
    expect(
      canAssignUsers('ACTIVE', { permissions: ['user.assign_branch', 'branch_assignment.view'] }),
    ).toBe(false);
    expect(
      canRevokeAssignments({ permissions: ['user.revoke_branch', 'branch_assignment.view'] }),
    ).toBe(true);
    expect(canRevokeAssignments({ permissions: ['user.revoke_branch'] })).toBe(false);
  });

  it('labels enum-like types and keeps free text as typed', () => {
    expect(branchTypeLabel('HEAD_OFFICE')).toBe('Head office');
    expect(branchTypeLabel('Service centre')).toBe('Service centre');
  });

  it('validates a draft like the backend does, plus a real timezone', () => {
    expect(branchDraftSchema.safeParse(DRAFT).success).toBe(true);
    expect(branchDraftSchema.safeParse({ ...DRAFT, branchCode: 'nairobi cbd' }).success).toBe(
      false,
    );
    expect(branchDraftSchema.safeParse({ ...DRAFT, branchCode: 'X' }).success).toBe(false);
    expect(branchDraftSchema.safeParse({ ...DRAFT, branchName: 'N' }).success).toBe(false);
    expect(branchDraftSchema.safeParse({ ...DRAFT, timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(branchDraftSchema.safeParse({ ...DRAFT, parentBranchId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });
});
