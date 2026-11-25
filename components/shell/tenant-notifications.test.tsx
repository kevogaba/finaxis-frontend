import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import type { SelectedContextProfile } from '@/auth/context-service';
import type { BackendProfile } from '@/auth/context.types';
import type { ApplicationContext } from '@/config/application-context';
import type { PendingCounts } from '@/modules/administration/approvals/approval-contract';
import {
  APPROVALS_UNAVAILABLE,
  NOTHING_WAITING,
  type UserApprovalCounts,
} from '@/modules/administration/approvals/approval-notifications';
import { renderWithProviders } from '@/test/test-utils';
import { permissionScopes } from '@/test/permission-scopes';

const { countUserApprovals, getCurrentContextProfile, readPendingCounts } = vi.hoisted(() => ({
  countUserApprovals: vi.fn<() => Promise<UserApprovalCounts>>(),
  getCurrentContextProfile: vi.fn<() => Promise<SelectedContextProfile>>(),
  readPendingCounts: vi.fn<() => Promise<PendingCounts>>(),
}));

// `load()`'s catch reads the request headers; `next/navigation` stays real, so `redirect()` and
// `unstable_rethrow` behave as in production (as platform-notifications.test.tsx).
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile(),
}));
vi.mock('@/modules/administration/approvals/approval-service', () => ({
  countUserApprovals: () => countUserApprovals(),
  readPendingCounts: () => readPendingCounts(),
}));

const { PendingApprovalNotifications } = await import('./tenant-notifications');

const ORGANISATION = '17000000-0000-4000-8000-0000000000cc';
const WESTLANDS = '28000000-0000-4000-8000-0000000000dd';
const USERS = ['user.approve', 'membership.view', 'user.view'];
const BRANCHES = ['branch.approve', 'branch.view'];
const BOTH = [...USERS, ...BRANCHES];

const PROFILE: BackendProfile = {
  user_id: '39000000-0000-4000-8000-0000000000aa',
  keycloak_subject: 'kc-admin',
  email: null,
  full_name: null,
  organisation: null,
  membership: { id: '4a000000-0000-4000-8000-0000000000bb', status: 'ACTIVE' },
  selected_branch: null,
  branches: [],
  roles: [],
  permissions: [],
  permission_scopes: [],
};

const MODULES = {
  platform: { id: 'platform-administration', name: 'Platform Administration' },
  tenant: { id: 'administration', name: 'Administration' },
} as const satisfies Record<string, ApplicationContext['module']>;

const ACTIVE_BRANCH = { code: 'WESTLANDS', name: 'Westlands Branch', status: 'ACTIVE' };

function resolved(
  permissions: string[],
  options: {
    module?: ApplicationContext['module'];
    branch?: ApplicationContext['branch'];
    /** Of `permissions`, the ones held only at one branch (BG-33). */
    branchOnly?: string[];
  } = {},
) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: {
      ...PROFILE,
      permissions,
      permission_scopes: permissionScopes(permissions, options.branchOnly),
      branches: [{ ...ACTIVE_BRANCH, id: WESTLANDS }],
    },
    context: {
      module: options.module ?? MODULES.tenant,
      organization: { id: ORGANISATION, name: 'Greenfield Teachers SACCO' },
      branch: options.branch ?? null,
    },
  });
}

async function show() {
  return renderWithProviders(<>{await PendingApprovalNotifications()}</>);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('PendingApprovalNotifications', () => {
  // BG-22: Carol is the caller's own (the platform leaves her out of 9), Daniel is provisioning
  // (the queue's 9 less 1): the bell takes the lower of the two upper bounds.
  it('counts the users the caller can decide and the branches the platform counted', async () => {
    const user = userEvent.setup({ delay: null });
    resolved(BOTH);
    readPendingCounts.mockResolvedValue({ memberships: 8, branches: 2 });
    countUserApprovals.mockResolvedValue({ pending: 9, provisioning: 1 });
    await show();

    const bell = screen.getByRole('button', { name: 'Notifications: 10 approvals waiting' });
    expect(within(bell).getByText('10')).toBeInTheDocument();
    await user.click(bell);
    const dialog = screen.getByRole('dialog', { name: 'Notifications' });
    expect(dialog).toHaveTextContent('8 users are waiting for approval.');
    expect(dialog).toHaveTextContent('2 branches are waiting for activation.');
    expect(within(dialog).getByRole('link', { name: 'Review user onboarding' })).toHaveAttribute(
      'href',
      '/admin/approvals/users',
    );
    expect(within(dialog).getByRole('link', { name: 'Review branch activation' })).toHaveAttribute(
      'href',
      '/admin/approvals/branches',
    );
  });

  it('never subtracts a provisioning request of the caller’s own twice', async () => {
    const user = userEvent.setup({ delay: null });
    resolved(USERS);
    // Two pending: Amina (someone else's) and the caller's own, still provisioning.
    readPendingCounts.mockResolvedValue({ memberships: 1 });
    countUserApprovals.mockResolvedValue({ pending: 2, provisioning: 1 });
    await show();

    await user.click(screen.getByRole('button', { name: 'Notifications: 1 approval waiting' }));
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toHaveTextContent(
      '1 user is waiting for approval.',
    );
  });

  it('shows only the kinds the platform counted', async () => {
    const user = userEvent.setup({ delay: null });
    resolved(BOTH);
    readPendingCounts.mockResolvedValue({ branches: 3 });
    countUserApprovals.mockResolvedValue({ pending: 4, provisioning: 0 });
    await show();

    await user.click(screen.getByRole('button', { name: 'Notifications: 3 approvals waiting' }));
    const dialog = screen.getByRole('dialog', { name: 'Notifications' });
    expect(dialog).toHaveTextContent('3 branches are waiting for activation.');
    expect(within(dialog).queryByRole('link', { name: 'Review user onboarding' })).toBeNull();
  });

  it('reads the queue’s user totals only for a holder who can open it', async () => {
    resolved(['user.approve', 'membership.view', ...BRANCHES]);
    readPendingCounts.mockResolvedValue({ memberships: 4, branches: 1 });
    await show();

    expect(
      screen.getByRole('button', { name: 'Notifications: 1 approval waiting' }),
    ).toBeInTheDocument();
    expect(countUserApprovals).not.toHaveBeenCalled();
  });

  // The platform would count the memberships, but with no User onboarding tab to cap or open there
  // is no user line, and no branch pair for a branch line: a bell would read "nothing waiting"
  // while members wait.
  it('shows no bell to a holder of the membership pair alone, without user.view', async () => {
    resolved(['user.approve', 'membership.view']);
    readPendingCounts.mockResolvedValue({ memberships: 4 });
    const { container } = await show();

    expect(container).toBeEmptyDOMElement();
    expect(readPendingCounts).not.toHaveBeenCalled();
    expect(countUserApprovals).not.toHaveBeenCalled();
  });

  // A pending branch has no ACTIVE branch to hold a grant at (platform #242), so the platform counts
  // none for a branch-scoped holder; asking with nothing tenant-wide would be a 403, read as
  // unavailable.
  it.each([
    ['branch.approve', ['branch.approve']],
    ['both branch codes', BRANCHES],
  ])('asks nothing of a holder who holds %s only at one branch', async (_case, branchOnly) => {
    resolved(BRANCHES, { branch: { id: WESTLANDS, name: 'Westlands Branch' }, branchOnly });
    const { container } = await show();

    expect(container).toBeEmptyDOMElement();
    expect(readPendingCounts).not.toHaveBeenCalled();
  });

  // BG-03: a tenant-wide approver activates from any branch context, so nothing to add.
  it('counts pending branches with a branch selected, with no advice to switch', async () => {
    const user = userEvent.setup({ delay: null });
    resolved(BRANCHES, { branch: { id: WESTLANDS, name: 'Westlands Branch' } });
    readPendingCounts.mockResolvedValue({ branches: 1 });
    await show();

    await user.click(screen.getByRole('button', { name: 'Notifications: 1 approval waiting' }));
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toHaveTextContent(
      /1 branch is waiting for activation\.Review branch activation$/,
    );
    expect(countUserApprovals).not.toHaveBeenCalled();
  });

  it('says nothing is waiting when nothing is', async () => {
    const user = userEvent.setup({ delay: null });
    resolved(BOTH);
    readPendingCounts.mockResolvedValue({ memberships: 1, branches: 0 });
    countUserApprovals.mockResolvedValue({ pending: 1, provisioning: 1 });
    await show();

    const bell = screen.getByRole('button', { name: 'Notifications: nothing waiting' });
    expect(bell).not.toHaveTextContent(/\d/);
    await user.click(bell);
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toHaveTextContent(
      NOTHING_WAITING,
    );
  });

  it.each([
    ['the counts', () => readPendingCounts.mockRejectedValue(new BackendApiError(503))],
    [
      'the queue’s user totals',
      () => countUserApprovals.mockRejectedValue(new BackendApiError(403, { code: 'forbidden' })),
    ],
  ])(
    "says the count couldn't be loaded when %s fail, never a partial number",
    async (_case, fail) => {
      const user = userEvent.setup({ delay: null });
      resolved(BOTH);
      readPendingCounts.mockResolvedValue({ memberships: 8, branches: 2 });
      countUserApprovals.mockResolvedValue({ pending: 9, provisioning: 1 });
      // describeProblem logs a 5xx that carries no request id (the 503 row): quieted here, as
      // problem.test.ts does; the assertions below are about what the bell shows.
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      fail();
      await show();
      // Restored as soon as the page has rendered, so a failing row below shows its own errors.
      logged.mockRestore();

      const bell = screen.getByRole('button', { name: "Notifications (couldn't be loaded)" });
      expect(bell).not.toHaveTextContent(/\d/);
      await user.click(bell);
      expect(screen.getByRole('dialog', { name: 'Notifications' })).toHaveTextContent(
        APPROVALS_UNAVAILABLE,
      );
    },
  );

  it.each([
    ['outside the administration workspace', BOTH, MODULES.platform],
    [
      'without the views the approve codes need',
      ['user.approve', 'branch.approve'],
      MODULES.tenant,
    ],
    ['with only the read codes', ['user.view', 'membership.view', 'branch.view'], MODULES.tenant],
  ])('reads nothing %s', async (_case, permissions, module) => {
    resolved(permissions, { module });
    const { container } = await show();

    expect(container).toBeEmptyDOMElement();
    expect(readPendingCounts).not.toHaveBeenCalled();
    expect(countUserApprovals).not.toHaveBeenCalled();
  });

  it('reads nothing while the context is not resolved', async () => {
    getCurrentContextProfile.mockResolvedValue({
      kind: 'redirect-to-context-selection',
      reason: 'invalid-context',
    });
    const { container } = await show();

    expect(container).toBeEmptyDOMElement();
    expect(readPendingCounts).not.toHaveBeenCalled();
  });

  it.each([
    ['a lost session to sign-in', new BackendApiError(401), ';/login?reason=session_expired;'],
    [
      'a stale context to context selection',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      ';/select-context;',
    ],
  ])('sends %s instead of reading it as unavailable', async (_case, error, digest) => {
    resolved(BOTH);
    readPendingCounts.mockRejectedValue(error);
    countUserApprovals.mockResolvedValue({ pending: 0, provisioning: 0 });

    await expect(PendingApprovalNotifications()).rejects.toMatchObject({
      digest: expect.stringContaining(digest) as unknown,
    });

    // The queue's user totals are settled the same way.
    readPendingCounts.mockResolvedValue({ memberships: 0, branches: 0 });
    countUserApprovals.mockRejectedValue(error);

    await expect(PendingApprovalNotifications()).rejects.toMatchObject({
      digest: expect.stringContaining(digest) as unknown,
    });
  });
});
