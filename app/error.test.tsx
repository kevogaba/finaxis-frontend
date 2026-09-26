import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/test-utils';
import ErrorBoundary from './error';

describe('root error boundary', () => {
  it('renders the fallback heading', () => {
    renderWithProviders(
      <ErrorBoundary error={new Error('backend detail: sensitive')} retry={vi.fn()} />,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: /something went wrong/i }),
    ).toBeInTheDocument();
  });

  it('shows the digest as a support reference when one is given', () => {
    renderWithProviders(
      <ErrorBoundary
        error={Object.assign(new Error('backend detail: sensitive'), { digest: 'abc123' })}
        retry={vi.fn()}
      />,
    );

    expect(screen.getByText('Reference: abc123')).toBeInTheDocument();
  });

  it('never renders the raw error message', () => {
    renderWithProviders(
      <ErrorBoundary
        error={new Error('backend detail: sensitive context token')}
        retry={vi.fn()}
      />,
    );

    expect(screen.queryByText(/sensitive context token/i)).not.toBeInTheDocument();
  });

  it('calls retry when Try again is clicked', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    renderWithProviders(<ErrorBoundary error={new Error('failure')} retry={retry} />);

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
