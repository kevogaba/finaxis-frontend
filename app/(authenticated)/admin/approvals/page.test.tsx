import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { SelectedContextProfile } from '@/auth/context-service';
import { NO_APPROVAL_ACCESS } from '@/modules/administration/approvals/approval-copy';
import {
  BRANCH_QUEUE_HREF,
  USER_QUEUE_HREF,
} from '@/modules/administration/approvals/approval-rules';
import { renderWithProviders } from '@/test/test-utils';

const CONTEXT_NOT_SELECTED = {
  kind: 'redirect-to-context-selection',
  reason: 'invalid-context',
} satisfies SelectedContextProfile;

const { getCurrentContextProfile, redirect } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (to: string) => redirect(to) as unknown,
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));

const { default: ApprovalQueuePage } = await import('./page');

const resolved = (permissions: string[]) => ({
  kind: 'resolved',
  profile: { permissions },
  context: { organization: { id: 'org-1', name: 'Greenfield' }, branch: null },
});

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('ApprovalQueuePage', () => {
  it.each([
    [
      'both queues',
      ['user.approve', 'user.view', 'branch.activate', 'branch.view'],
      USER_QUEUE_HREF,
    ],
    ['branch activation only', ['branch.activate', 'branch.view'], BRANCH_QUEUE_HREF],
    ['user onboarding only', ['user.approve', 'user.view'], USER_QUEUE_HREF],
  ])('opens the first tab the holder can see (%s)', async (_case, permissions, to) => {
    getCurrentContextProfile.mockResolvedValue(resolved(permissions));
    await expect(ApprovalQueuePage()).rejects.toThrow(`NEXT_REDIRECT:${to}`);
  });

  it.each([
    ['a holder who can approve nothing', resolved(['user.approve', 'branch.view'])],
    ['an unresolved context', CONTEXT_NOT_SELECTED],
  ])('says so under the page h1 for %s', async (_case, profile) => {
    getCurrentContextProfile.mockResolvedValue(profile);
    renderWithProviders(await ApprovalQueuePage());

    expect(screen.getByRole('heading', { level: 1, name: 'Approval queue' })).toBeInTheDocument();
    expect(screen.getByText(NO_APPROVAL_ACCESS)).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });
});
