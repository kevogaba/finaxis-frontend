import { describe, expect, it } from 'vitest';
import { TENANT_STATUSES } from '../tenants/tenant-contract';
import {
  branchCreateDescription,
  branchCreateWarning,
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

  it.each(TENANT_STATUSES.map((status) => [status, status === 'ACTIVE'] as const))(
    'offers a branch draft for a %s institution: %s',
    (status, offered) => {
      expect(canCreateInstitutionBranch(status, BOTH)).toBe(offered);
    },
  );

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

  it('names the institution in the BG-18 warning and the create description', () => {
    expect(branchCreateWarning('Acme SACCO')).toBe(
      "You can create a branch here only if you're also an active member of Acme SACCO, with a role there that allows creating branches. Otherwise the platform refuses it.",
    );
    expect(branchCreateDescription('Acme SACCO')).toBe(
      'The draft is created in Acme SACCO. Its own administrators then submit it and activate it.',
    );
  });
});
