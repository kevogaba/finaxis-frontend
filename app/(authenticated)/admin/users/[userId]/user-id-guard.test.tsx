import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SelectedContextProfile } from '@/auth/context-service';

// A real SelectedContextProfile, checked by the type: the context could not be resolved.
const CONTEXT_NOT_SELECTED = {
  kind: 'redirect-to-context-selection',
  reason: 'invalid-context',
} satisfies SelectedContextProfile;

// Lettered at its end, so its upper-case form differs from it (Ruling 16).
const FELIX = '10000000-0000-4000-8000-00000000000d';

// Every read any of the five routes can make, so "before any backend read" is checked against all of
// them at once: a read someone adds later and forgets to guard still has to be listed here.
const reads = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  getUser: vi.fn(),
  findUserMembership: vi.fn(),
  getMembership: vi.fn(),
  listUserBranchAssignments: vi.fn(),
  getUserInviter: vi.fn(),
  countUserRoleAssignments: vi.fn(),
  listRoleAssignments: vi.fn(),
  listBranches: vi.fn(),
  listAuditEvents: vi.fn(),
  getBranchIndex: vi.fn(),
  getRoleIndex: vi.fn(),
  getOrganisationTimeZone: vi.fn(),
  resolveUserNames: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: (...args: unknown[]) =>
    reads.getCurrentContextProfile(...args) as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  getUser: (...args: unknown[]) => reads.getUser(...args) as unknown,
  findUserMembership: (...args: unknown[]) => reads.findUserMembership(...args) as unknown,
  getMembership: (...args: unknown[]) => reads.getMembership(...args) as unknown,
  listUserBranchAssignments: (...args: unknown[]) =>
    reads.listUserBranchAssignments(...args) as unknown,
  getUserInviter: (...args: unknown[]) => reads.getUserInviter(...args) as unknown,
  countUserRoleAssignments: (...args: unknown[]) =>
    reads.countUserRoleAssignments(...args) as unknown,
}));
vi.mock('@/modules/administration/roles/role-service', () => ({
  listRoleAssignments: (...args: unknown[]) => reads.listRoleAssignments(...args) as unknown,
}));
vi.mock('@/modules/administration/branches/branch-service', () => ({
  listBranches: (...args: unknown[]) => reads.listBranches(...args) as unknown,
}));
vi.mock('@/modules/administration/audit/audit-service', () => ({
  listAuditEvents: (...args: unknown[]) => reads.listAuditEvents(...args) as unknown,
}));
vi.mock('@/lib/api/lookups', () => ({
  getBranchIndex: (...args: unknown[]) => reads.getBranchIndex(...args) as unknown,
  getRoleIndex: (...args: unknown[]) => reads.getRoleIndex(...args) as unknown,
  getOrganisationTimeZone: (...args: unknown[]) =>
    reads.getOrganisationTimeZone(...args) as unknown,
  resolveUserNames: (...args: unknown[]) => reads.resolveUserNames(...args) as unknown,
}));
// The pages import the Server Actions their client components submit; nothing here submits one.
vi.mock('@/modules/administration/users/membership-actions', () => ({
  approveMembership: vi.fn(),
  reactivateMembership: vi.fn(),
  revokeMembership: vi.fn(),
  suspendMembership: vi.fn(),
}));
vi.mock('@/modules/administration/roles/role-actions', () => ({
  assignRole: vi.fn(),
  revokeRoleAssignment: vi.fn(),
}));
vi.mock('@/modules/administration/branches/branch-actions', () => ({
  assignBranchUser: vi.fn(),
  revokeBranchAssignment: vi.fn(),
}));

const { default: RecordLayout } = await import('./layout');
const { default: OverviewPage } = await import('./page');
const { default: AccessPage } = await import('./access/page');
const { default: BranchesPage } = await import('./branches/page');
const { default: AuditPage } = await import('./audit/page');

const routes: Record<string, (userId: string) => Promise<unknown>> = {
  'the record layout': (userId) =>
    RecordLayout({ children: null, params: Promise.resolve({ userId }) }),
  'the Overview tab': (userId) => OverviewPage({ params: Promise.resolve({ userId }) }),
  'the Roles & access tab': (userId) =>
    AccessPage({ params: Promise.resolve({ userId }), searchParams: Promise.resolve({}) }),
  'the Branch assignments tab': (userId) =>
    BranchesPage({ params: Promise.resolve({ userId }), searchParams: Promise.resolve({}) }),
  'the Audit tab': (userId) =>
    AuditPage({ params: Promise.resolve({ userId }), searchParams: Promise.resolve({}) }),
};

describe.each(Object.entries(routes))('%s', (_name, render) => {
  beforeEach(() => {
    vi.resetAllMocks();
    for (const read of Object.values(reads))
      read.mockRejectedValue(new Error('unreachable backend'));
    reads.getCurrentContextProfile.mockResolvedValue(CONTEXT_NOT_SELECTED);
  });

  it.each(['not-a-uuid', '../x', 'new', '', `${FELIX}x`])(
    'answers %j with not-found, without reading the backend',
    async (userId) => {
      await expect(render(userId)).rejects.toThrow('NEXT_NOT_FOUND');

      for (const [name, read] of Object.entries(reads)) {
        expect(read, name).not.toHaveBeenCalled();
      }
    },
  );

  it('reads an upper-case id in its lower-case form (Ruling 16), and in no other', async () => {
    // Positive control for the cases above: a valid id does read. The backend is unreachable here,
    // so the route settles on its failure branch; only what it asked for matters.
    await Promise.resolve(render(FELIX.toUpperCase())).catch(() => undefined);

    expect(reads.getUser).toHaveBeenCalledWith(FELIX);
    for (const [name, read] of Object.entries(reads)) {
      for (const call of read.mock.calls) {
        expect(JSON.stringify(call), name).not.toContain(FELIX.toUpperCase());
      }
    }
  });
});
