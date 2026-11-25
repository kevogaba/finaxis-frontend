import { describe, expect, it } from 'vitest';
import { TENANT_STATUSES } from '../tenants/tenant-contract';
import {
  BRANCH_DETAIL_DESCRIPTION,
  branchCreateDescription,
  canCreateInstitutionBranch,
  parentsNote,
  PARENTS_PARTIAL,
  PARENTS_UNAVAILABLE,
  parseBranchId,
} from './institution-branch-rules';

const BOTH = { permissions: ['branch.create', 'branch.view'] };

describe('institution branch rules', () => {
  it('lower-cases a branch id and refuses anything else', () => {
    expect(parseBranchId('17000000-0000-4000-8000-0000000000B2')).toBe(
      '17000000-0000-4000-8000-0000000000b2',
    );
    for (const param of ['not-a-uuid', '../x', '', '17000000-0000-4000-8000-0000000000b2x']) {
      expect(parseBranchId(param)).toBeNull();
    }
  });

  // BG-18 (platform #153): ACTIVE or PROVISIONING, with no membership inside the institution.
  it.each(
    TENANT_STATUSES.map(
      (status) => [status, status === 'ACTIVE' || status === 'PROVISIONING'] as const,
    ),
  )('offers a branch draft for a %s institution: %s', (status, offered) => {
    expect(canCreateInstitutionBranch(status, BOTH)).toBe(offered);
  });

  it('needs both branch.create and branch.view (the redirect reads the draft back)', () => {
    expect(canCreateInstitutionBranch('ACTIVE', { permissions: ['branch.create'] })).toBe(false);
    expect(canCreateInstitutionBranch('ACTIVE', { permissions: ['branch.view'] })).toBe(false);
  });

  it('says why the parent picker is incomplete, never that there are no branches', () => {
    expect(parentsNote({ ok: false })).toBe(PARENTS_UNAVAILABLE);
    expect(parentsNote({ ok: true, truncated: true })).toBe(PARENTS_PARTIAL);
    expect(parentsNote({ ok: true, truncated: false })).toBeUndefined();
    expect(PARENTS_PARTIAL).toBe('Optional. Only the first 500 branches are listed.');
  });

  it('names the institution in the create description, and who then moves the draft on', () => {
    expect(branchCreateDescription('Acme SACCO')).toBe(
      'The draft is created in Acme SACCO. It is then submitted and activated from its Branches tab, by a platform administrator until the institution has an active branch besides its head office.',
    );
  });

  it("points the branch record, where a create lands, to the institution's Branches tab", () => {
    expect(BRANCH_DETAIL_DESCRIPTION).toBe(
      "The institution's own administrators change its branches. While platform checking is open, a platform administrator submits and activates them from the institution's Branches tab.",
    );
  });
});
