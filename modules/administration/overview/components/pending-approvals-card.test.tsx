import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import type { Page } from '@/lib/api/wire';
import type { UserApprovalCounts } from '@/modules/administration/approvals/approval-notifications';
import type { BranchSummary } from '@/modules/administration/branches/branch-contract';
import type { UserSummary } from '@/modules/administration/users/user-contract';
import { renderWithProviders } from '@/test/test-utils';

const reads = vi.hoisted(() => ({
  countUserApprovals: vi.fn<() => Promise<UserApprovalCounts>>(),
  listBranchActivations: vi.fn<(query: unknown) => Promise<Page<BranchSummary>>>(),
  listUserApprovals: vi.fn<(paging: unknown) => Promise<Page<UserSummary>>>(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/modules/administration/approvals/approval-service', () => ({
  countUserApprovals: () => reads.countUserApprovals(),
  listBranchActivations: (query: unknown) => reads.listBranchActivations(query),
  listUserApprovals: (paging: unknown) => reads.listUserApprovals(paging),
}));

const { PendingApprovalsSection } = await import('./pending-approvals-card');

const REFERENCE = '14a30000-0000-4000-8000-0000000000aa';

function page<T>(items: T[], totalItems = items.length): Page<T> {
  return {
    items,
    page: { number: 0, size: 5, totalItems, totalPages: 1, hasNext: false, hasPrevious: false },
  };
}

const person = (tail: string, displayName: string, userStatus: UserSummary['userStatus']) => ({
  id: `14b10000-0000-4000-8000-0000000000${tail}`,
  username: tail,
  email: `${tail}@greenfield.example`,
  displayName,
  userStatus,
  membershipStatus: 'PENDING_APPROVAL' as const,
});

const WANJIKU = person('a4', 'Wanjiku Kariuki', 'DRAFT');
const BARAKA = person('a3', 'Baraka Otieno', 'PROVISIONING_IDP');
const NYERI: BranchSummary = {
  id: '14c10000-0000-4000-8000-0000000000c2',
  branchCode: 'NYERI',
  branchName: 'Nyeri Branch',
  branchType: 'OPERATIONS',
  status: 'PENDING_APPROVAL',
  createdAt: '2026-09-15T08:00:00Z',
};

function waiting() {
  reads.listUserApprovals.mockResolvedValue(page([WANJIKU, BARAKA]));
  reads.countUserApprovals.mockResolvedValue({ pending: 2, provisioning: 1 });
  reads.listBranchActivations.mockResolvedValue(page([NYERI], 3));
}

async function show(users = true, branches = true, branchSelected = false) {
  return renderWithProviders(
    <>{await PendingApprovalsSection({ users, branches, branchSelected })}</>,
  );
}

const card = () => screen.getByRole('region', { name: 'Pending approvals' });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('PendingApprovalsSection', () => {
  it('reads both previews newest first: five, and past each identity still provisioning', async () => {
    waiting();
    await show();

    expect(reads.listUserApprovals).toHaveBeenCalledExactlyOnceWith({ page: 0, size: 6 });
    expect(reads.listBranchActivations).toHaveBeenCalledExactlyOnceWith({
      sort: { by: 'createdAt', dir: 'DESC' },
      page: 0,
      size: 5,
    });
    expect(reads.countUserApprovals).toHaveBeenCalledOnce();
  });

  it('counts each kind with its tab, then lists users before branches, each with Review', async () => {
    waiting();
    await show();

    expect(card()).toHaveTextContent('1 user is waiting for approval.');
    expect(within(card()).getByRole('link', { name: 'Review user onboarding' })).toHaveAttribute(
      'href',
      '/admin/approvals/users',
    );
    expect(card()).toHaveTextContent('3 branches are waiting for activation.');
    expect(within(card()).getByRole('link', { name: 'Review branch activation' })).toHaveAttribute(
      'href',
      '/admin/approvals/branches',
    );
    const rows = within(
      within(card()).getByRole('list', { name: 'Requests waiting for a decision' }),
    ).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Wanjiku KariukiUser onboarding · a4@greenfield.exampleReview',
      'Nyeri BranchBranch activation · NYERI · OperationsReview',
    ]);
    expect(within(card()).getByRole('link', { name: 'Review Wanjiku Kariuki' })).toHaveAttribute(
      'href',
      `/admin/approvals/users/${WANJIKU.id}`,
    );
    expect(within(card()).getByRole('link', { name: 'Review Nyeri Branch' })).toHaveAttribute(
      'href',
      `/admin/approvals/branches/${NYERI.id}`,
    );
    expect(within(card()).getByRole('note')).toHaveTextContent(
      '1 identity is still being provisioned: approval already ran.',
    );
    expect(within(card()).getByRole('link', { name: 'Open the approval queue' })).toHaveAttribute(
      'href',
      '/admin/approvals',
    );
  });

  it('never reads more than a page of 100 users (BG-11)', async () => {
    waiting();
    reads.countUserApprovals.mockResolvedValue({ pending: 300, provisioning: 200 });
    await show();

    expect(reads.listUserApprovals).toHaveBeenCalledExactlyOnceWith({ page: 0, size: 100 });
  });

  it("doesn't read the users preview after its count failed", async () => {
    waiting();
    reads.countUserApprovals.mockRejectedValue(new BackendApiError(503, { requestId: REFERENCE }));
    await show();

    expect(reads.listUserApprovals).not.toHaveBeenCalled();
    expect(within(card()).getByRole('alert')).toHaveTextContent(
      `Users waiting for approval couldn't be loaded. Reference: ${REFERENCE}`,
    );
    expect(within(card()).getByRole('link', { name: 'Review Nyeri Branch' })).toBeVisible();
  });

  it('reads only the kinds the holder can decide', async () => {
    waiting();
    await show(false, true);

    expect(reads.listUserApprovals).not.toHaveBeenCalled();
    expect(reads.countUserApprovals).not.toHaveBeenCalled();
    expect(within(card()).queryByRole('link', { name: 'Review user onboarding' })).toBeNull();
    expect(within(card()).queryByRole('note')).toBeNull();
  });

  it('reads no branches without both branch codes', async () => {
    waiting();
    await show(true, false);

    expect(reads.listBranchActivations).not.toHaveBeenCalled();
    expect(within(card()).queryByRole('link', { name: 'Review branch activation' })).toBeNull();
    expect(within(card()).getByRole('link', { name: 'Review Wanjiku Kariuki' })).toBeVisible();
  });

  it('says nothing is waiting only when every read said so', async () => {
    reads.listUserApprovals.mockResolvedValue(page([]));
    reads.countUserApprovals.mockResolvedValue({ pending: 0, provisioning: 0 });
    reads.listBranchActivations.mockResolvedValue(page([]));
    await show();

    expect(card()).toHaveTextContent('Nothing is waiting for your approval.');
    expect(within(card()).queryByRole('list')).toBeNull();
  });

  it('says nothing is waiting before it notes the identities still provisioning', async () => {
    reads.countUserApprovals.mockResolvedValue({ pending: 1, provisioning: 1 });
    reads.listUserApprovals.mockResolvedValue(page([BARAKA]));
    reads.listBranchActivations.mockResolvedValue(page([]));
    await show();

    const empty = within(card()).getByText('Nothing is waiting for your approval.');
    const note = within(card()).getByRole('note');
    expect(empty.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('never says nothing is waiting when its only read failed (L1)', async () => {
    reads.listBranchActivations.mockRejectedValue(
      new BackendApiError(503, { requestId: REFERENCE }),
    );
    await show(false, true);

    expect(within(card()).getByRole('alert')).toHaveTextContent(
      `Branches waiting for activation couldn't be loaded. Reference: ${REFERENCE}`,
    );
    expect(card()).not.toHaveTextContent('Nothing is waiting');
  });

  it('says a failed read failed, with its reference, and still lists what the other found', async () => {
    waiting();
    reads.listBranchActivations.mockRejectedValue(
      new BackendApiError(503, { requestId: REFERENCE }),
    );
    await show();

    expect(within(card()).getByRole('alert')).toHaveTextContent(
      `Branches waiting for activation couldn't be loaded. Reference: ${REFERENCE}`,
    );
    expect(card()).not.toHaveTextContent('Nothing is waiting');
    expect(within(card()).queryByRole('link', { name: 'Review user onboarding' })).toBeNull();
    expect(within(card()).getByRole('link', { name: 'Review Wanjiku Kariuki' })).toBeVisible();
  });

  it.each([
    ['a lost session to sign-in', new BackendApiError(401), ';/login?reason=session_expired;'],
    [
      'a stale context to context selection',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      ';/select-context;',
    ],
  ])('sends %s instead of showing a failure', async (_case, error, digest) => {
    waiting();
    reads.countUserApprovals.mockRejectedValue(error);
    await expect(
      PendingApprovalsSection({ users: true, branches: true, branchSelected: false }),
    ).rejects.toMatchObject({ digest: expect.stringContaining(digest) as unknown });
  });
});
