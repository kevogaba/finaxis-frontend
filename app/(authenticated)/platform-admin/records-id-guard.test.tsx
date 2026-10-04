import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendApiError } from '@/auth/backend-api';
import type { SelectedContextProfile } from '@/auth/context-service';

// A real SelectedContextProfile, checked by the type: the context could not be resolved.
const CONTEXT_NOT_SELECTED = {
  kind: 'redirect-to-context-selection',
  reason: 'invalid-context',
} satisfies SelectedContextProfile;

// Lettered, so their upper-case forms differ from them (Ruling 4). Hoisted: the env mock below is
// evaluated while the static imports above load.
const { PLATFORM } = vi.hoisted(() => ({ PLATFORM: 'abcdef01-2345-4678-89ab-cdef01234567' }));
const INSTITUTION = '17000000-0000-4000-8000-0000000000ac';
const BRANCH = '17000000-0000-4000-8000-0000000000b2';
const USER = '17000000-0000-4000-8000-0000000000a7';

// Every read any of the layer's record routes can make, so "before any backend read" is checked
// against all of them at once: a read someone adds later and forgets to guard must be listed here.
const reads = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  getTenant: vi.fn(),
  listInstitutionBranches: vi.fn(),
  getInstitutionBranch: vi.fn(),
  getInstitutionBranchIndex: vi.fn(),
  listInstitutionUsers: vi.fn(),
  getInstitutionUser: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  // The branches tab's toolbar and the draft form are client components; nothing here navigates.
  usePathname: () => '/platform-admin/tenants',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/config/env.server', () => ({ serverEnv: { PLATFORM_ORGANISATION_ID: PLATFORM } }));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: (...args: unknown[]) =>
    reads.getCurrentContextProfile(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/tenants/tenant-service', () => ({
  getTenant: (...args: unknown[]) => reads.getTenant(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/branches/institution-branch-service', () => ({
  listInstitutionBranches: (...args: unknown[]) =>
    reads.listInstitutionBranches(...args) as unknown,
  getInstitutionBranch: (...args: unknown[]) => reads.getInstitutionBranch(...args) as unknown,
  getInstitutionBranchIndex: (...args: unknown[]) =>
    reads.getInstitutionBranchIndex(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/users/institution-user-service', () => ({
  listInstitutionUsers: (...args: unknown[]) => reads.listInstitutionUsers(...args) as unknown,
  getInstitutionUser: (...args: unknown[]) => reads.getInstitutionUser(...args) as unknown,
}));
// The draft page and the user record import the Server Actions their client components submit;
// nothing here submits one.
vi.mock('@/modules/platform-administration/branches/institution-branch-actions', () => ({
  createInstitutionBranchDraft: vi.fn(),
}));
vi.mock('@/modules/platform-administration/users/account-actions', () => ({
  deactivateAccount: vi.fn(),
  reactivateAccount: vi.fn(),
  suspendAccount: vi.fn(),
}));

const { default: BranchesTab } = await import('./tenants/[tenantId]/(record)/branches/page');
const { default: BranchRecord } = await import('./tenants/[tenantId]/branches/[branchId]/page');
const { default: BranchDraftPage } = await import('./tenants/[tenantId]/branches/new/page');
const { default: UsersTab } = await import('./tenants/[tenantId]/(record)/users/page');
const { default: InstitutionUserRecord } = await import('./tenants/[tenantId]/users/[userId]/page');

type ReadName = keyof typeof reads;

interface RecordIds {
  branchId: string;
  userId: string;
}

interface Route {
  render: (tenantId: string, ids: RecordIds) => Promise<unknown>;
  /** What the route reads with its lower-cased ids, once they are valid (the positive control). */
  expectedReads: readonly (readonly [ReadName, readonly unknown[]])[];
}

const routes: Record<string, Route> = {
  'the Branches tab': {
    render: (tenantId) =>
      BranchesTab({ params: Promise.resolve({ tenantId }), searchParams: Promise.resolve({}) }),
    expectedReads: [
      ['getTenant', [INSTITUTION]],
      ['listInstitutionBranches', [INSTITUTION, expect.objectContaining({ page: 0 })]],
    ],
  },
  'the branch record': {
    render: (tenantId, { branchId }) =>
      BranchRecord({ params: Promise.resolve({ tenantId, branchId }) }),
    expectedReads: [
      ['getInstitutionBranch', [INSTITUTION, BRANCH]],
      ['getTenant', [INSTITUTION]],
    ],
  },
  'the branch draft page': {
    render: (tenantId) => BranchDraftPage({ params: Promise.resolve({ tenantId }) }),
    expectedReads: [['getTenant', [INSTITUTION]]],
  },
  'the Users tab': {
    render: (tenantId) =>
      UsersTab({ params: Promise.resolve({ tenantId }), searchParams: Promise.resolve({}) }),
    expectedReads: [
      ['getTenant', [INSTITUTION]],
      ['listInstitutionUsers', [INSTITUTION, expect.objectContaining({ page: 0 })]],
    ],
  },
  'the institution user record': {
    render: (tenantId, { userId }) =>
      InstitutionUserRecord({ params: Promise.resolve({ tenantId, userId }) }),
    expectedReads: [
      ['getInstitutionUser', [INSTITUTION, USER]],
      ['getTenant', [INSTITUTION]],
    ],
  },
};

const VALID_IDS: RecordIds = { branchId: BRANCH, userId: USER };

function expectNothingRead() {
  for (const [name, read] of Object.entries(reads)) expect(read, name).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  // A BackendApiError with a reference, so a settled failure logs nothing.
  for (const read of Object.values(reads)) {
    read.mockRejectedValue(new BackendApiError(500, { requestId: 'req-unreachable' }));
  }
  reads.getCurrentContextProfile.mockResolvedValue(CONTEXT_NOT_SELECTED);
});

describe.each(Object.entries(routes))('%s', (_name, route) => {
  it.each([
    ['a malformed institution id', 'pwani-fishermen', BRANCH],
    ['a path-like institution id', '../x', BRANCH],
    ['the platform organisation', PLATFORM, BRANCH],
    ['the platform organisation in upper case', PLATFORM.toUpperCase(), BRANCH],
    ['an empty institution id', '', BRANCH],
  ])('answers %s with not-found, without reading the backend', async (_case, tenantId) => {
    await expect(route.render(tenantId, VALID_IDS)).rejects.toThrow('NEXT_NOT_FOUND');

    expectNothingRead();
  });

  it('reads upper-case ids in lower case, and in no other', async () => {
    // Positive control for the cases above: valid ids do read. The backend is unreachable here, so
    // the route settles on its failure branch; only what it asked for matters.
    await Promise.resolve(
      route.render(INSTITUTION.toUpperCase(), {
        branchId: BRANCH.toUpperCase(),
        userId: USER.toUpperCase(),
      }),
    ).catch(() => undefined);

    for (const [name, args] of route.expectedReads) {
      expect(reads[name], name).toHaveBeenCalledWith(...args);
    }
    for (const [name, read] of Object.entries(reads)) {
      for (const call of read.mock.calls) {
        const text = JSON.stringify(call);
        expect(text, name).not.toContain(INSTITUTION.toUpperCase());
        expect(text, name).not.toContain(BRANCH.toUpperCase());
        expect(text, name).not.toContain(USER.toUpperCase());
      }
    }
  });
});

describe('the branch record: its own id', () => {
  it.each([
    ['a malformed branch id', INSTITUTION, 'not-a-uuid'],
    ['a branch id with a tail', INSTITUTION, `${BRANCH}x`],
  ])(
    'answers %s with not-found, without reading the backend',
    async (_case, tenantId, branchId) => {
      await expect(
        routes['the branch record']?.render(tenantId, { ...VALID_IDS, branchId }),
      ).rejects.toThrow('NEXT_NOT_FOUND');

      expectNothingRead();
    },
  );
});

describe('the institution user record: its own id', () => {
  it.each([
    ['a malformed user id', INSTITUTION, 'not-a-uuid'],
    ['a user id with a tail', INSTITUTION, `${USER}x`],
  ])('answers %s with not-found, without reading the backend', async (_case, tenantId, userId) => {
    await expect(
      routes['the institution user record']?.render(tenantId, { ...VALID_IDS, userId }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expectNothingRead();
  });
});
