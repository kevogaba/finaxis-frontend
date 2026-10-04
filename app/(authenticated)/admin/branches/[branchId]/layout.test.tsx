import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import { renderWithProviders } from '@/test/test-utils';

const { getBranch, getBranchMaker, getCurrentContextProfile, redirect, router } = vi.hoisted(
  () => ({
    getBranch: vi.fn(),
    getBranchMaker: vi.fn(),
    getCurrentContextProfile: vi.fn(),
    redirect: vi.fn(),
    // One stable router object, as in table-pagination-bar.test.tsx.
    router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  }),
);

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => redirect(to) as unknown,
  usePathname: () => '/admin/branches/08000000-0000-4000-8000-000000000006',
  useRouter: () => router,
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/modules/administration/branches/branch-service', () => ({
  getBranch: (...args: unknown[]) => getBranch(...args) as unknown,
  getBranchMaker: (...args: unknown[]) => getBranchMaker(...args) as unknown,
}));
// The hero's dialogs import the Server Actions; nothing here submits one.
vi.mock('@/modules/administration/branches/branch-actions', () => ({
  activateBranch: vi.fn(),
  closeBranch: vi.fn(),
  reactivateBranch: vi.fn(),
  submitBranch: vi.fn(),
  suspendBranch: vi.fn(),
}));

const { default: BranchRecordLayout } = await import('./layout');

const BRANCH = '08000000-0000-4000-8000-000000000006';
const ME = '10000000-0000-4000-8000-0000000000aa'; // the signed-in administrator
const ORG = '55555555-5555-4555-8555-555555555555';
const ALL_CODES = ['branch.view', 'branch.activate', 'audit.view'];

/** Programs every service the layout reads: a branch awaiting approval, which Activate is on offer for. */
function setup(maker: string | null | Error = null) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { permissions: ALL_CODES, user_id: ME, branches: [] },
    context: { organization: { id: ORG, name: 'Greenfield' }, branch: null },
  });
  getBranch.mockResolvedValue({
    id: BRANCH,
    branchCode: 'LIK',
    branchName: 'Likoni',
    branchType: 'BRANCH',
    status: 'PENDING_APPROVAL',
  });
  if (maker instanceof Error) getBranchMaker.mockRejectedValue(maker);
  else getBranchMaker.mockResolvedValue(maker);
}

const params = () => Promise.resolve({ branchId: BRANCH });
const activate = () => screen.queryByRole('button', { name: 'Activate' });

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('BranchRecordLayout: the drafter lookup', () => {
  it("disables Activate for the branch's drafter, with the reason, after asking who drafted it", async () => {
    setup(ME);

    renderWithProviders(await BranchRecordLayout({ children: <p>Tab body</p>, params: params() }));

    expect(getBranchMaker).toHaveBeenCalledWith(BRANCH);
    expect(activate()).toBeDisabled();
    expect(activate()).toHaveAccessibleDescription(MAKER_CHECKER_BLOCKED);
  });

  // AGENTS.md: a page settles a read with load(), which redirects on a lost session or a stale
  // context. A quiet null here would render a stale page with Activate enabled.
  it.each([
    ['a 401', new BackendApiError(401), '/login?reason=session_expired'],
    [
      'a stale context',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      '/select-context',
    ],
  ])(
    'redirects, rendering nothing, when the drafter read fails with %s',
    async (_n, failure, to) => {
      setup(failure);

      await expect(
        BranchRecordLayout({ children: <p>Tab body</p>, params: params() }),
      ).rejects.toThrow(`NEXT_REDIRECT:${to}`);

      expect(getBranchMaker).toHaveBeenCalledWith(BRANCH);
      expect(redirect).toHaveBeenCalledTimes(1);
    },
  );

  // The backend's maker-checker 403 (BG-08) is the guard when the drafter can't be read, so an
  // ordinary failure (a permission that changed, a 5xx) leaves Activate on offer rather than blocking it.
  it.each([
    ['a 403', new BackendApiError(403, { code: 'forbidden' })],
    ['a 5xx', new BackendApiError(500, { requestId: 'req-3' })],
  ])(
    'renders the record, with Activate on offer, when the drafter read fails with %s',
    async (_n, failure) => {
      setup(failure);

      renderWithProviders(
        await BranchRecordLayout({ children: <p>Tab body</p>, params: params() }),
      );

      expect(getBranchMaker).toHaveBeenCalledWith(BRANCH);
      expect(redirect).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { level: 1, name: 'Likoni' })).toBeInTheDocument();
      expect(activate()).toBeEnabled();
      expect(screen.queryByText(MAKER_CHECKER_BLOCKED)).not.toBeInTheDocument();
      expect(screen.getByText('Tab body')).toBeInTheDocument();
    },
  );
});
