import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import { renderWithProviders } from '@/test/test-utils';

const { countBranchActivations, countUserApprovals, getCurrentContextProfile, redirect } =
  vi.hoisted(() => ({
    countBranchActivations: vi.fn(),
    countUserApprovals: vi.fn(),
    getCurrentContextProfile: vi.fn(),
    redirect: vi.fn(),
  }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (to: string) => redirect(to) as unknown,
  usePathname: () => '/admin/approvals/branches',
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/modules/administration/approvals/approval-service', () => ({
  countBranchActivations: () => countBranchActivations() as unknown,
  countUserApprovals: () => countUserApprovals() as unknown,
}));

const { default: ApprovalQueueLayout } = await import('./layout');

const BOTH = ['user.approve', 'user.view', 'branch.activate', 'branch.view'];
const resolved = (permissions: string[]) => ({
  kind: 'resolved',
  profile: { permissions },
  context: { organization: { id: 'org-1', name: 'Greenfield' }, branch: null },
});
const show = async (children: ReactNode = null) =>
  renderWithProviders(await ApprovalQueueLayout({ children }));
const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.textContent);

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
  countUserApprovals.mockResolvedValue({ pending: 9, provisioning: 1 });
  countBranchActivations.mockResolvedValue(3);
});

describe('ApprovalQueueLayout', () => {
  it('is the queue’s one h1, with a counted tab per queue, the current one selected', async () => {
    getCurrentContextProfile.mockResolvedValue(resolved(BOTH));
    await show(<p>Tab body</p>);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Approval queue' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Approval queue sections' });
    // Spec §10.6: the actionable users (pending less provisioning) and the pending branches.
    expect(tabNames()).toEqual(['User onboarding (8)', 'Branch activation (3)']);
    expect(within(nav).getByRole('tab', { name: 'Branch activation (3)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Tab body')).toBeInTheDocument();
  });

  it('reads and offers only what the holder’s codes allow, and nothing without either pair', async () => {
    getCurrentContextProfile.mockResolvedValue(resolved(['branch.activate', 'branch.view']));
    const { unmount } = await show();
    expect(tabNames()).toEqual(['Branch activation (3)']);
    expect(countUserApprovals).not.toHaveBeenCalled();
    unmount();

    getCurrentContextProfile.mockResolvedValue(resolved(['user.approve', 'branch.activate']));
    await show();
    expect(screen.queryByRole('navigation', { name: 'Approval queue sections' })).toBeNull();
    // Only the first render's branch count: the second read nothing.
    expect(countBranchActivations).toHaveBeenCalledTimes(1);
  });

  it('leaves a tab’s label without a number when its count fails, never a 0', async () => {
    getCurrentContextProfile.mockResolvedValue(resolved(BOTH));
    countUserApprovals.mockRejectedValue(new BackendApiError(503));
    await show();

    expect(tabNames()).toEqual(['User onboarding', 'Branch activation (3)']);
  });

  it.each([
    ['a 401', new BackendApiError(401), '/login?reason=session_expired'],
    [
      'a stale context',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      '/select-context',
    ],
  ])('redirects when a count finds %s', async (_case, error, to) => {
    getCurrentContextProfile.mockResolvedValue(resolved(BOTH));
    countBranchActivations.mockRejectedValue(error);
    await expect(show()).rejects.toThrow(`NEXT_REDIRECT:${to}`);
  });
});
