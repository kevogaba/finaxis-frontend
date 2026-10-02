import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { ownStyle } from '@/test/own-style';
import { renderWithProviders } from '@/test/test-utils';
import type { TenantLifecycleAction } from '../tenant-rules';
import { TenantLifecycleActions } from './tenant-lifecycle-actions';

const {
  approveTenant,
  deprovisionTenant,
  reactivateTenant,
  rejectTenant,
  submitTenant,
  suspendTenant,
} = vi.hoisted(() => ({
  approveTenant: vi.fn(),
  deprovisionTenant: vi.fn(),
  reactivateTenant: vi.fn(),
  rejectTenant: vi.fn(),
  submitTenant: vi.fn(),
  suspendTenant: vi.fn(),
}));
vi.mock('../tenant-actions', () => ({
  submitTenant: (...args: unknown[]) => submitTenant(...args) as unknown,
  approveTenant: (...args: unknown[]) => approveTenant(...args) as unknown,
  rejectTenant: (...args: unknown[]) => rejectTenant(...args) as unknown,
  suspendTenant: (...args: unknown[]) => suspendTenant(...args) as unknown,
  reactivateTenant: (...args: unknown[]) => reactivateTenant(...args) as unknown,
  deprovisionTenant: (...args: unknown[]) => deprovisionTenant(...args) as unknown,
}));

const ID = '16000000-0000-4000-8000-000000000001';
const ORG_ID = '00000000-0000-0000-0000-000000000000';
const NAME = 'Umoja Teachers SACCO';

const record = (actions: readonly TenantLifecycleAction[]) => (
  <main>
    <h1>{NAME}</h1>
    <TenantLifecycleActions
      tenantId={ID}
      tenantName={NAME}
      tenantCode="umoja-teachers"
      actions={actions}
      contextOrganisationId={ORG_ID}
    />
  </main>
);

/** I2: every dialog carries the tenant and the rendered organisation, or the cross-tab guard
 * (runServerAction's `context_changed`) silently stops working. */
function expectScoped(formData: FormData) {
  expect(formData.get('tenantId')).toBe(ID);
  expect(formData.get('contextOrganisationId')).toBe(ORG_ID);
}

describe('TenantLifecycleActions', () => {
  it('links Amend, submits through a confirmation with no reason, then focuses Approve', async () => {
    const user = userEvent.setup();
    submitTenant.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderWithProviders(record(['submit', 'amend']));

    // The first action is the contained primary: the forward action leads, Amend is outlined.
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toHaveClass(
      'MuiButton-contained',
    );
    expect(screen.getByRole('link', { name: 'Amend draft' })).toHaveClass('MuiButton-outlined');
    expect(screen.getByRole('link', { name: 'Amend draft' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${ID}/amend`,
    );
    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    const dialog = screen.getByRole('dialog', { name: `Submit ${NAME} for approval?` });
    // The endpoint reads no body (contract §E.2): nothing to type.
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Submit for approval' }));

    await waitFor(() => {
      expect(submitTenant).toHaveBeenCalledTimes(1);
    });
    const formData = submitTenant.mock.calls[0]?.[1] as FormData;
    expectScoped(formData);
    expect(formData.has('reason')).toBe(false);
    expect(await screen.findByRole('alert')).toHaveTextContent('Submitted for approval');

    // The layout re-renders with PENDING_APPROVAL's actions after refresh().
    rerender(record(['approve', 'reject']));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Approve' })).toHaveFocus();
    });
  });

  it('rejects with a required reason, then focuses the title once no action is left', async () => {
    const user = userEvent.setup();
    rejectTenant.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderWithProviders(record(['approve', 'reject']));

    expect(screen.getByRole('button', { name: 'Reject' })).toHaveClass('MuiButton-colorError');
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    // Irreversible: the error tone makes it an alertdialog.
    const dialog = screen.getByRole('alertdialog', { name: `Reject ${NAME}?` });
    const reason = within(dialog).getByRole('textbox', { name: 'Reason' });
    expect(reason).toBeRequired();
    await user.type(reason, 'Duplicate request');
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));

    await waitFor(() => {
      expect(rejectTenant).toHaveBeenCalledTimes(1);
    });
    const formData = rejectTenant.mock.calls[0]?.[1] as FormData;
    expect(formData.get('reason')).toBe('Duplicate request');
    expectScoped(formData);
    expect(await screen.findByRole('alert')).toHaveTextContent('Request rejected');

    // REJECTED offers nothing, so the layout drops the component: its unmount cleanup focuses the
    // record title (standing ruling 4).
    rerender(
      <main>
        <h1>{NAME}</h1>
      </main>,
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: NAME })).toHaveFocus();
    });
  });

  it('explains an approve refusal inside the dialog, with its reference (BG-08)', async () => {
    const user = userEvent.setup();
    approveTenant.mockResolvedValueOnce({
      ok: false,
      formError:
        "You can't approve this institution. Your role may not allow it, or you created or submitted the request: a different platform administrator must approve it.",
      fieldErrors: {},
      code: 'forbidden',
      requestId: 'req-7',
    });
    renderWithProviders(record(['approve', 'reject']));

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = screen.getByRole('dialog', { name: `Approve ${NAME}?` });
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /created or submitted the request.*Reference: req-7/,
    );
    expectScoped(approveTenant.mock.calls[0]?.[1] as FormData);
  });

  it('suspends with a required reason', async () => {
    const user = userEvent.setup();
    suspendTenant.mockResolvedValueOnce({ ok: true });
    renderWithProviders(record(['suspend', 'deprovision']));

    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    const dialog = screen.getByRole('dialog', { name: `Suspend ${NAME}?` });
    const reason = within(dialog).getByRole('textbox', { name: 'Reason' });
    expect(reason).toBeRequired();
    await user.type(reason, 'Compliance review');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));

    await waitFor(() => {
      expect(suspendTenant).toHaveBeenCalledTimes(1);
    });
    const formData = suspendTenant.mock.calls[0]?.[1] as FormData;
    expect(formData.get('reason')).toBe('Compliance review');
    expectScoped(formData);
    expect(await screen.findByRole('alert')).toHaveTextContent('Institution suspended');
  });

  it('reactivates with an optional reason', async () => {
    const user = userEvent.setup();
    reactivateTenant.mockResolvedValueOnce({ ok: true });
    renderWithProviders(record(['reactivate', 'deprovision']));

    await user.click(screen.getByRole('button', { name: 'Reactivate' }));
    const dialog = screen.getByRole('dialog', { name: `Reactivate ${NAME}?` });
    expect(within(dialog).getByRole('textbox', { name: 'Reason (optional)' })).not.toBeRequired();
    await user.click(within(dialog).getByRole('button', { name: 'Reactivate' }));

    await waitFor(() => {
      expect(reactivateTenant).toHaveBeenCalledTimes(1);
    });
    const formData = reactivateTenant.mock.calls[0]?.[1] as FormData;
    expect(formData.get('reason')).toBe('');
    expectScoped(formData);
    expect(await screen.findByRole('alert')).toHaveTextContent('Institution reactivated');
  });

  it('deprovisions only with the typed tenant code, keeping the reason and the key (CRITICAL)', async () => {
    const user = userEvent.setup();
    deprovisionTenant
      .mockResolvedValueOnce({
        ok: false,
        formError: 'Check the highlighted fields and try again.',
        fieldErrors: { confirmCode: 'Type the tenant code exactly as shown.' },
        code: 'validation_failed',
        requestId: null,
      })
      .mockResolvedValueOnce({ ok: true });
    renderWithProviders(record(['suspend', 'deprovision']));

    expect(screen.getByRole('button', { name: 'Deprovision' })).toHaveClass('MuiButton-colorError');
    await user.click(screen.getByRole('button', { name: 'Deprovision' }));
    const dialog = screen.getByRole('alertdialog', { name: `Deprovision ${NAME}?` });
    const confirm = within(dialog).getByRole('textbox', { name: 'Type umoja-teachers to confirm' });
    // The code to type back stands out in the prompt: monospace and bold, still part of its name.
    // The outlined input's notch repeats the label, so the code appears twice.
    const codes = within(dialog).getAllByText('umoja-teachers', { selector: 'code' });
    for (const code of codes) {
      expect(ownStyle(code, 'font-family')).toContain('monospace');
      expect(ownStyle(code, 'font-weight')).toBe('700');
    }
    await user.type(confirm, 'umoja');
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Reason' }),
      'Merged into Harambee',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Deprovision' }));

    await waitFor(() => {
      expect(confirm).toHaveAccessibleDescription('Type the tenant code exactly as shown.');
    });
    expect(confirm).toHaveFocus();
    expect(within(dialog).getByRole('textbox', { name: 'Reason' })).toHaveValue(
      'Merged into Harambee',
    );

    await user.clear(confirm);
    await user.type(confirm, 'umoja-teachers');
    await user.click(within(dialog).getByRole('button', { name: 'Deprovision' }));
    await waitFor(() => {
      expect(deprovisionTenant).toHaveBeenCalledTimes(2);
    });
    const [first, second] = deprovisionTenant.mock.calls.map((call) => call[1] as FormData);
    // A refused attempt keeps its key: the retry replays safely (index item 2).
    expect(second?.get('idempotencyKey')).toBe(first?.get('idempotencyKey'));
    expect(second?.get('tenantCode')).toBe('umoja-teachers');
    expect(second?.get('confirmCode')).toBe('umoja-teachers');
    // Both attempts, the refused one included, carry the scope.
    [first, second].forEach((attempt) => {
      expect(attempt?.get('tenantId')).toBe(ID);
      expect(attempt?.get('contextOrganisationId')).toBe(ORG_ID);
    });
  });
});
