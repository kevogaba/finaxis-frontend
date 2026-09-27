import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { UUID_PATTERN } from '@/lib/api/wire';
import { ConfirmDialog } from './confirm-dialog';

/** PR 07's `ActionResult`, restated: the dialog must accept it without importing layer 07. */
type FullResult =
  | { ok: true }
  | {
      ok: false;
      formError: string;
      fieldErrors: Partial<Record<string, string>>;
      code: string | null;
      requestId: string | null;
    };

const CHANGED: FullResult = {
  ok: false,
  formError: 'This record changed. Refresh and try again.',
  fieldErrors: {},
  code: 'conflict',
  requestId: 'req-9',
};

function keyOf(formData: FormData | undefined): string {
  const value = formData?.get('idempotencyKey');
  return typeof value === 'string' ? value : '';
}

function setup(
  action: (previous: FullResult | null, formData: FormData) => Promise<FullResult>,
  tone?: 'primary' | 'error',
) {
  const onSuccess = vi.fn();
  const props = {
    title: 'Submit Westlands Branch for approval?',
    description: 'A second administrator must activate it.',
    confirmLabel: 'Submit for approval',
    tone,
    action,
    onClose: vi.fn(),
    onSuccess,
  };
  const view = renderWithProviders(
    <ConfirmDialog open {...props}>
      <input type="hidden" name="branchId" value="b-1" />
    </ConfirmDialog>,
  );
  return { ...view, props, onSuccess };
}

describe('ConfirmDialog', () => {
  it('submits an idempotency key with the hidden inputs and reports success', async () => {
    const user = userEvent.setup();
    const action = vi.fn((_previous: FullResult | null, _formData: FormData) =>
      Promise.resolve<FullResult>({ ok: true }),
    );
    const { onSuccess } = setup(action);

    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    const formData = action.mock.calls[0]?.[1];
    expect(formData?.get('branchId')).toBe('b-1');
    expect(keyOf(formData)).toMatch(UUID_PATTERN);
  });

  it('shows a failure with its reference and retries with the same key (a safe replay)', async () => {
    const user = userEvent.setup();
    const action = vi
      .fn((_previous: FullResult | null, _formData: FormData) =>
        Promise.resolve<FullResult>({ ok: true }),
      )
      .mockResolvedValueOnce(CHANGED);
    const { onSuccess } = setup(action);

    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This record changed');
    expect(screen.getByRole('alert')).toHaveTextContent('req-9');

    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(keyOf(action.mock.calls[1]?.[1])).toBe(keyOf(action.mock.calls[0]?.[1]));
  });

  it('uses a fresh key each time the dialog opens', async () => {
    const user = userEvent.setup();
    const action = vi.fn((_previous: FullResult | null, _formData: FormData) =>
      Promise.resolve<FullResult>({ ok: true }),
    );
    const { props, rerender } = setup(action);

    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });
    rerender(<ConfirmDialog {...props} open={false} />);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    rerender(<ConfirmDialog {...props} open />);
    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(2);
    });

    expect(keyOf(action.mock.calls[1]?.[1])).not.toBe(keyOf(action.mock.calls[0]?.[1]));
  });

  it('cannot be closed or submitted again while the action is pending', async () => {
    const user = userEvent.setup();
    // Never settles: the request is still in flight for the rest of the test.
    const action = vi.fn(
      (_previous: FullResult | null, _formData: FormData) =>
        new Promise<FullResult>(() => undefined),
    );
    const { props } = setup(action);
    const key = document.querySelector<HTMLInputElement>('input[name="idempotencyKey"]')?.value;

    // Escape closes an idle dialog, so the pending check below can't pass vacuously. The keydown
    // goes to the dialog itself: focus may sit on the now-disabled submit button.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });
    // A loading Button is disabled, so a second click or an implicit Enter can't submit again.
    // (A second user-event click on it would throw on `pointer-events: none`.)
    expect(screen.getByRole('button', { name: /Submit for approval/ })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(action).toHaveBeenCalledTimes(1);
    expect(key).toMatch(UUID_PATTERN);
    expect(keyOf(action.mock.calls[0]?.[1])).toBe(key);
  });

  it('marks a destructive confirmation with the error colour', () => {
    setup(() => Promise.resolve<FullResult>({ ok: true }), 'error');
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toHaveClass(
      'MuiButton-colorError',
    );
  });
});
