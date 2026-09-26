import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ToastProvider, useToast } from './toast-provider';

function Trigger() {
  const notify = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        notify('Context switched to Head Office');
      }}
    >
      Notify
    </button>
  );
}

describe('ToastProvider', () => {
  it('shows a status message and dismisses it', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Notify' }));
    expect(await screen.findByText('Context switched to Head Office')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByText('Context switched to Head Office')).not.toBeInTheDocument();
  });

  it('requires a provider', () => {
    // Plain RTL render: `renderWithProviders` now mounts `ToastProvider` itself (AppProviders,
    // spec §8), which would satisfy `useToast` and hide the missing-provider error this pins.
    function Orphan() {
      useToast();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(/ToastProvider/);
  });
});
