import { Component, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import TextField from '@mui/material/TextField';
import { renderWithProviders } from '@/test/test-utils';
import { UUID_PATTERN } from '@/lib/api/wire';
import type { ActionResult } from '@/lib/api/action-result';
import { ReasonDialog } from './reason-dialog';

/** A rejected action must never escape to this boundary (I1) — today it does. */
class TestErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  override state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  override render() {
    return this.state.hasError ? <div>boundary caught an error</div> : this.props.children;
  }
}

const BUSY: ActionResult = {
  ok: false,
  formError: 'Another business date change is in progress. Try again in a moment.',
  fieldErrors: {},
  code: 'lifecycle.business_date_lock_timeout',
  requestId: 'req-7',
};

function setup(
  action: (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>,
) {
  const onSuccess = vi.fn();
  const props = {
    title: 'Start close of business?',
    description: 'The business date moves to Closing.',
    confirmLabel: 'Start close of business',
    reason: 'optional' as const,
    action,
    onClose: vi.fn(),
    onSuccess,
  };
  const view = renderWithProviders(<ReasonDialog open {...props} />);
  return { ...view, props, onSuccess };
}

const keyOf = (formData: FormData | undefined) => {
  const value = formData?.get('idempotencyKey');
  return typeof value === 'string' ? value : '';
};

describe('ReasonDialog', () => {
  it('submits the reason with an idempotency key and reports success', async () => {
    const user = userEvent.setup();
    const action = vi.fn((_previous: ActionResult | null, _formData: FormData) =>
      Promise.resolve<ActionResult>({ ok: true }),
    );
    const { onSuccess } = setup(action);

    await user.type(screen.getByRole('textbox', { name: 'Reason (optional)' }), 'End of day');
    await user.click(screen.getByRole('button', { name: 'Start close of business' }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    const formData = action.mock.calls[0]?.[1];
    expect(formData?.get('reason')).toBe('End of day');
    expect(keyOf(formData)).toMatch(UUID_PATTERN);
  });

  it('shows a failure with its reference and retries with the same key (a safe replay)', async () => {
    const user = userEvent.setup();
    const action = vi
      .fn((_previous: ActionResult | null, _formData: FormData) =>
        Promise.resolve<ActionResult>({ ok: true }),
      )
      .mockResolvedValueOnce(BUSY);
    const { onSuccess } = setup(action);

    await user.click(screen.getByRole('button', { name: 'Start close of business' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Another business date change is in progress',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('req-7');

    await user.click(screen.getByRole('button', { name: 'Start close of business' }));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(keyOf(action.mock.calls[1]?.[1])).toBe(keyOf(action.mock.calls[0]?.[1]));
  });

  it('uses a fresh key each time the dialog opens', async () => {
    const user = userEvent.setup();
    const action = vi.fn((_previous: ActionResult | null, _formData: FormData) =>
      Promise.resolve<ActionResult>({ ok: true }),
    );
    const { props, rerender } = setup(action);

    await user.click(screen.getByRole('button', { name: 'Start close of business' }));
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });
    rerender(<ReasonDialog {...props} open={false} />);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    rerender(<ReasonDialog {...props} open />);
    await user.click(screen.getByRole('button', { name: 'Start close of business' }));
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(2);
    });

    expect(keyOf(action.mock.calls[1]?.[1])).not.toBe(keyOf(action.mock.calls[0]?.[1]));
  });

  it('keeps the reason and any extra field after a failed submit (D2: no lost input on retry)', async () => {
    const user = userEvent.setup();
    const action = vi
      .fn((_previous: ActionResult | null, _formData: FormData) =>
        Promise.resolve<ActionResult>({ ok: true }),
      )
      .mockResolvedValueOnce(BUSY);
    const onSuccess = vi.fn();
    renderWithProviders(
      <ReasonDialog
        open
        title="Advance the business date"
        description="Choose a later date."
        confirmLabel="Advance date"
        reason="optional"
        action={action}
        onClose={vi.fn()}
        onSuccess={onSuccess}
        fields={() => <TextField name="newBusinessDate" label="New business date" />}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: 'New business date' }), '2026-09-08');
    await user.type(screen.getByRole('textbox', { name: 'Reason (optional)' }), 'End of day');
    await user.click(screen.getByRole('button', { name: 'Advance date' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Another business date change is in progress',
    );
    // React 19's <form action> auto-resets every uncontrolled field on every submit outcome
    // (requestFormReset); both the reason and the `fields` slot must survive it.
    expect(screen.getByRole('textbox', { name: 'New business date' })).toHaveValue('2026-09-08');
    expect(screen.getByRole('textbox', { name: 'Reason (optional)' })).toHaveValue('End of day');

    await user.click(screen.getByRole('button', { name: 'Advance date' }));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    const secondFormData = action.mock.calls[1]?.[1];
    expect(secondFormData?.get('newBusinessDate')).toBe('2026-09-08');
    expect(secondFormData?.get('reason')).toBe('End of day');
    expect(keyOf(secondFormData)).toBe(keyOf(action.mock.calls[0]?.[1]));
  });

  it('marks a required reason as required', () => {
    renderWithProviders(
      <ReasonDialog
        open
        title="Suspend?"
        description="Suspends access."
        confirmLabel="Suspend"
        reason="required"
        action={() => Promise.resolve<ActionResult>({ ok: true })}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Reason' })).toBeRequired();
  });

  it('recovers from a rejected action with safe copy, keeps the reason, and retries with the same key (I1)', async () => {
    const user = userEvent.setup();
    const action = vi
      .fn((_previous: ActionResult | null, _formData: FormData) =>
        Promise.resolve<ActionResult>({ ok: true }),
      )
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const onSuccess = vi.fn();
    renderWithProviders(
      <TestErrorBoundary>
        <ReasonDialog
          open
          title="Start close of business?"
          description="The business date moves to Closing."
          confirmLabel="Start close of business"
          reason="optional"
          action={action}
          onClose={vi.fn()}
          onSuccess={onSuccess}
        />
      </TestErrorBoundary>,
    );

    await user.type(screen.getByRole('textbox', { name: 'Reason (optional)' }), 'End of day');
    await user.click(screen.getByRole('button', { name: 'Start close of business' }));

    // Today the rejection escapes ReasonForm's reducer to this boundary instead of the alert.
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't confirm this change");
    expect(screen.queryByText('boundary caught an error')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Reason (optional)' })).toHaveValue('End of day');

    await user.click(screen.getByRole('button', { name: 'Start close of business' }));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(keyOf(action.mock.calls[1]?.[1])).toBe(keyOf(action.mock.calls[0]?.[1]));
  });

  it('moves focus to the invalid field after a failed submit with field errors (M01)', async () => {
    const user = userEvent.setup();
    const fieldFailure: ActionResult = {
      ok: false,
      formError: 'Check the highlighted fields and try again.',
      fieldErrors: { reason: 'Keep it under 500 characters.' },
      code: 'validation_failed',
      requestId: null,
    };
    const action = vi
      .fn((_previous: ActionResult | null, _formData: FormData) =>
        Promise.resolve<ActionResult>({ ok: true }),
      )
      .mockResolvedValueOnce(fieldFailure);
    setup(action);

    await user.click(screen.getByRole('button', { name: 'Start close of business' }));
    await screen.findByRole('alert');

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Reason (optional)' })).toHaveFocus();
    });
  });

  it('colours the confirm button error and marks the dialog alertdialog for tone="error" (V3)', () => {
    renderWithProviders(
      <ReasonDialog
        open
        title="Close Westlands Branch?"
        description="Closing is permanent."
        confirmLabel="Close branch"
        reason="required"
        action={() => Promise.resolve<ActionResult>({ ok: true })}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        tone="error"
      />,
    );
    expect(
      screen.getByRole('alertdialog', { name: 'Close Westlands Branch?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close branch' })).toHaveClass(
      'MuiButton-colorError',
    );
  });

  it('defaults to the primary tone: a plain dialog role and no error colour (V3)', () => {
    setup(() => Promise.resolve<ActionResult>({ ok: true }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start close of business' })).not.toHaveClass(
      'MuiButton-colorError',
    );
  });

  it('links the description to the dialog for assistive tech (M14)', () => {
    setup(() => Promise.resolve<ActionResult>({ ok: true }));
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'The business date moves to Closing.',
    );
  });

  it('carries the rendered organisation id as a hidden field when provided (I2)', () => {
    renderWithProviders(
      <ReasonDialog
        open
        title="Start close of business?"
        description="The business date moves to Closing."
        confirmLabel="Start close of business"
        reason="optional"
        action={() => Promise.resolve<ActionResult>({ ok: true })}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        contextOrganisationId="org-1"
      />,
    );
    expect(
      document.querySelector<HTMLInputElement>('input[name="contextOrganisationId"]')?.value,
    ).toBe('org-1');
  });

  // Last: its action never settles, so it leaves a permanently pending promise behind — harmless
  // once unmounted, but only once nothing after it in this file still awaits a settled action.
  it('cannot be closed or submitted again while the action is pending', async () => {
    const user = userEvent.setup();
    const action = vi.fn(
      (_previous: ActionResult | null, _formData: FormData) =>
        new Promise<ActionResult>(() => undefined),
    );
    const onClose = vi.fn();
    renderWithProviders(
      <ReasonDialog
        open
        title="Start close of business?"
        description="The business date moves to Closing."
        confirmLabel="Start close of business"
        reason="optional"
        action={action}
        onClose={onClose}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Start close of business' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });
    expect(screen.getByRole('button', { name: 'Start close of business' })).toBeDisabled();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    expect(action).toHaveBeenCalledTimes(1);
    expect(keyOf(action.mock.calls[0]?.[1])).toMatch(UUID_PATTERN);
  });
});
