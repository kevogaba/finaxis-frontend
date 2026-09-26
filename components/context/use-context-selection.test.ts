import { describe, expect, it } from 'vitest';
import { nextStepAfterOrganisation } from './use-context-selection';

describe('nextStepAfterOrganisation', () => {
  it('finishes when the backend auto-selected the only branch', () => {
    expect(
      nextStepAfterOrganisation({
        requiresBranchSelection: false,
        branchId: 'b-1',
        assignedBranchIds: ['b-1'],
      }),
    ).toBe('done-branch');
  });

  it('finishes at institution level for members with no branches', () => {
    expect(
      nextStepAfterOrganisation({
        requiresBranchSelection: false,
        branchId: null,
        assignedBranchIds: [],
      }),
    ).toBe('done-institution');
  });

  it('auto-selects the single distinct branch when duplicate rows made the backend ask', () => {
    expect(
      nextStepAfterOrganisation({
        requiresBranchSelection: true,
        branchId: null,
        assignedBranchIds: ['b-1'],
      }),
    ).toEqual({ autoSelect: 'b-1' });
  });

  it('asks for a branch (offering All branches) when several distinct branches exist', () => {
    expect(
      nextStepAfterOrganisation({
        requiresBranchSelection: true,
        branchId: null,
        assignedBranchIds: ['b-1', 'b-2'],
      }),
    ).toBe('choose-branch');
  });
});
