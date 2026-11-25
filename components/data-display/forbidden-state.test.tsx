import { describe, expect, it } from 'vitest';
import Button from '@mui/material/Button';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ForbiddenState } from './forbidden-state';

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
});
