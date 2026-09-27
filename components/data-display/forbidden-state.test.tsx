import { describe, expect, it, vi } from 'vitest';
import Button from '@mui/material/Button';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ApplicationContextProvider } from '@/components/shell/organization-context';
import { ALL_BRANCHES_UNAVAILABLE } from '@/components/context/all-branches-copy';
import type { ApplicationContext } from '@/config/application-context';
import { BranchContextState, ForbiddenState } from './forbidden-state';

// One stable router object from vi.hoisted (carried layer-05/06 rule).
const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, useRouter: () => router };
});

const CONTEXT: ApplicationContext = {
  module: { id: 'administration', name: 'Administration' },
  organization: { id: 'org-1', name: 'Greenfield SACCO' },
  branch: { id: 'b-1', name: 'Head Office' },
};

describe('ForbiddenState', () => {
  it('explains a missing permission inline by default', () => {
    renderWithProviders(<ForbiddenState />);
    expect(screen.getByText("You don't have permission")).toBeInTheDocument();
    expect(screen.getByText(/Ask an administrator/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a custom explanation and action (e.g. maker-checker)', () => {
    renderWithProviders(
      <ForbiddenState
        title="You can't approve your own invitation"
        description="Another administrator must approve this user."
        action={<Button>Back to approvals</Button>}
      />,
    );
    expect(screen.getByText("You can't approve your own invitation")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to approvals' })).toBeInTheDocument();
  });

  it('guides a branch context that cannot reach the branch to All branches', () => {
    renderWithProviders(
      <ApplicationContextProvider value={CONTEXT}>
        <BranchContextState />
      </ApplicationContextProvider>,
    );
    expect(screen.getByText('Switch to All branches to manage this branch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to All branches' })).toBeInTheDocument();
  });

  it('never offers All branches to a user with at most one distinct branch', () => {
    renderWithProviders(
      <ApplicationContextProvider value={CONTEXT}>
        <BranchContextState allBranchesAvailable={false} />
      </ApplicationContextProvider>,
    );
    expect(screen.getByText(ALL_BRANCHES_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Switch to All branches to manage this branch'),
    ).not.toBeInTheDocument();
  });
});
