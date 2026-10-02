import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import TextField from '@mui/material/TextField';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { UUID_PATTERN } from '@/lib/api/wire';
import type { ActionResult } from '@/lib/api/action-result';
import { AssignmentDrawer } from './assignment-drawer';

const INVALID: ActionResult = {
  ok: false,
  formError: 'Check the highlighted fields and try again.',
  fieldErrors: { assignmentType: 'Choose an assignment type.' },
  code: 'validation_failed',
  requestId: 'req-4',
};

const NETWORK_ERROR_COPY =
  "We couldn't confirm this change. Try again; it's safe to retry. If it keeps failing, reload the page.";

const keyOf = (formData: FormData | undefined) => {
  const value = formData?.get('idempotencyKey');
  return typeof value === 'string' ? value : '';
};

function setup(
  action: (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>,
  extra: { contextOrganisationId?: string } = {},
) {
  const onSuccess = vi.fn();
  const props = {
    title: 'Assign a user',
    description: 'Give a user access to Westlands Branch.',
    submitLabel: 'Assign user',
    action,
    onClose: vi.fn(),
    onSuccess,
    ...extra,
  };
  const fields = (fieldErrors: Partial<Record<string, string>>) => (
    <>
      <input type="hidden" name="branchId" value="b-1" />
      <TextField
        name="assignmentType"
        label="Assignment type"
        defaultValue="OPERATE"
        error={Boolean(fieldErrors.assignmentType)}
        helperText={fieldErrors.assignmentType}
      />
    </>
  );
  const view = renderWithProviders(
    <AssignmentDrawer open {...props}>
      {fields}
    </AssignmentDrawer>,
  );
  return { ...view, props, fields, onSuccess };
}

describe('AssignmentDrawer', () => {
  it('is a dialog named by its title and submits a key with its fields', async () => {
    const user = userEvent.setup();
    const action = vi.fn((_previous: ActionResult | null, _formData: FormData) =>
      Promise.resolve<ActionResult>({ ok: true }),
    );
    const { onSuccess } = setup(action);

    expect(screen.getByRole('dialog', { name: 'Assign a user' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Assign user' }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    const formData = action.mock.calls[0]?.[1];
    expect(formData?.get('branchId')).toBe('b-1');
    expect(formData?.get('assignmentType')).toBe('OPERATE');
    expect(keyOf(formData)).toMatch(UUID_PATTERN);
  });

  it('shows a failure on its field with the reference and retries with the same key', async () => {
    const user = userEvent.setup();
    const action = vi
      .fn((_previous: ActionResult | null, _formData: FormData) =>
        Promise.resolve<ActionResult>({ ok: true }),
      )
      .mockResolvedValueOnce(INVALID);
    const { onSuccess } = setup(action);

    await user.click(screen.getByRole('button', { name: 'Assign user' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('req-4');
    expect(screen.getByText('Choose an assignment type.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Assign user' }));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(keyOf(action.mock.calls[1]?.[1])).toBe(keyOf(action.mock.calls[0]?.[1]));
  });

  it('uses a fresh key each time it opens', async () => {
    const user = userEvent.setup();
    const action = vi.fn((_previous: ActionResult | null, _formData: FormData) =>
      Promise.resolve<ActionResult>({ ok: true }),
    );
    const { props, fields, rerender } = setup(action);

    await user.click(screen.getByRole('button', { name: 'Assign user' }));
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });
    rerender(
      <AssignmentDrawer {...props} open={false}>
        {fields}
      </AssignmentDrawer>,
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    rerender(
      <AssignmentDrawer {...props} open>
        {fields}
      </AssignmentDrawer>,
    );
    await user.click(screen.getByRole('button', { name: 'Assign user' }));
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(2);
    });

    expect(keyOf(action.mock.calls[1]?.[1])).not.toBe(keyOf(action.mock.calls[0]?.[1]));
  });

  // React 19 resets every uncontrolled field on a `<form action>` submit, success or failure
  // (07 gate fix b88cc4c). This fails against that code path even though the retry-key test above
  // doesn't, because a reset restores the same default the fixture starts with.
  it('keeps an edited uncontrolled field across a failed submit and resends it on retry', async () => {
    const user = userEvent.setup();
    const action = vi
      .fn((_previous: ActionResult | null, _formData: FormData) =>
        Promise.resolve<ActionResult>({ ok: true }),
      )
      .mockResolvedValueOnce(INVALID);
    setup(action);

    const assignmentType = screen.getByRole('textbox', { name: 'Assignment type' });
    fireEvent.change(assignmentType, { target: { value: 'VIEW' } });

    await user.click(screen.getByRole('button', { name: 'Assign user' }));
    await screen.findByRole('alert');
    expect(assignmentType).toHaveValue('VIEW');

    await user.click(screen.getByRole('button', { name: 'Assign user' }));
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(2);
    });
    expect(action.mock.calls[1]?.[1]?.get('assignmentType')).toBe('VIEW');
  });

  it('shows a safe failure when the action rejects, stays open, and retries with the same key', async () => {
    const user = userEvent.setup();
    const action = vi
      .fn((_previous: ActionResult | null, _formData: FormData) =>
        Promise.resolve<ActionResult>({ ok: true }),
      )
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { props, onSuccess } = setup(action);

    await user.click(screen.getByRole('button', { name: 'Assign user' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(NETWORK_ERROR_COPY);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Assign user' }));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(keyOf(action.mock.calls[1]?.[1])).toBe(keyOf(action.mock.calls[0]?.[1]));
  });

  it('carries the rendered organisation id in the FormData when contextOrganisationId is set', async () => {
    const user = userEvent.setup();
    const action = vi.fn((_previous: ActionResult | null, _formData: FormData) =>
      Promise.resolve<ActionResult>({ ok: true }),
    );
    setup(action, { contextOrganisationId: 'org-1' });

    await user.click(screen.getByRole('button', { name: 'Assign user' }));
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });
    expect(action.mock.calls[0]?.[1]?.get('contextOrganisationId')).toBe('org-1');
  });

  // Last: its action never settles, so it leaves a permanently pending promise behind — harmless
  // once unmounted, but only once nothing after it in this file still awaits a settled action.
  it('ignores Escape while the action is pending, so the drawer and its key survive', async () => {
    const user = userEvent.setup();
    const action = vi.fn(
      (_previous: ActionResult | null, _formData: FormData) =>
        new Promise<ActionResult>(() => undefined),
    );
    const { props } = setup(action);

    // Escape closes an idle drawer, so the pending check below can't pass vacuously.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Assign user' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
