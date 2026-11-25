import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { MAKER_CHECKER_BLOCKED } from '../branch-rules';
import { BranchLifecycleActions } from './branch-lifecycle-actions';

// Both mocked actions are hoisted (not just `suspendBranch`, as the brief's own snippet does):
// the drafter's-Submit focus test below also needs to control `submitBranch`'s resolution.
const { discardBranch, returnBranch, suspendBranch, submitBranch } = vi.hoisted(() => ({
  discardBranch: vi.fn(),
  returnBranch: vi.fn(),
  suspendBranch: vi.fn(),
  submitBranch: vi.fn(),
}));
vi.mock('../branch-actions', () => ({
  submitBranch: (...args: unknown[]) => submitBranch(...args) as unknown,
  discardBranch: (...args: unknown[]) => discardBranch(...args) as unknown,
  activateBranch: vi.fn(),
  returnBranch: (...args: unknown[]) => returnBranch(...args) as unknown,
  reactivateBranch: vi.fn(),
  closeBranch: vi.fn(),
  suspendBranch: (...args: unknown[]) => suspendBranch(...args) as unknown,
}));

const ID = '44444444-4444-4444-8444-444444444444';
const ORG_ID = '55555555-5555-4555-8555-555555555555';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('BranchLifecycleActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // BG-08: maker-checker off lets the drafter activate, warned before the decision.
  it('shows a self-approval warning above the actions, leaving Activate enabled', () => {
    const warning = 'Maker-checker is off for branch creation. You drafted this branch.';
    renderWithProviders(
      <BranchLifecycleActions
        branchId={ID}
        branchCode="KAREN"
        branchName="Karen Branch"
        actions={['activate']}
        activateBlocked={false}
        warning={warning}
        selectedHere={false}
      />,
    );

    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(warning);
    const activate = screen.getByRole('button', { name: 'Activate' });
    expect(activate).toBeEnabled();
    expect(note.compareDocumentPosition(activate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('explains a blocked activation, tied to the disabled button (BG-08)', () => {
    renderWithProviders(
      <BranchLifecycleActions
        branchId={ID}
        branchCode="KAREN"
        branchName="Karen Branch"
        actions={['activate']}
        activateBlocked
        selectedHere={false}
      />,
    );

    const activate = screen.getByRole('button', { name: 'Activate' });
    expect(activate).toBeDisabled();
    expect(activate).toHaveAccessibleDescription(MAKER_CHECKER_BLOCKED);

    // V6: an explicit flex-end on this nested wrapper keeps Activate at the hero's right edge
    // even once the caption's flexBasis:100% below widens the box RecordHero sizes around it.
    expect(activate.parentElement).toHaveStyle({ justifyContent: 'flex-end' });
    expect(screen.getByText(MAKER_CHECKER_BLOCKED)).toHaveStyle({ textAlign: 'right' });
  });

  it("opens Close's confirmation as an alertdialog with an error-toned button (V3)", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <BranchLifecycleActions
        branchId={ID}
        branchCode="KAREN"
        branchName="Westlands Branch"
        actions={['suspend', 'close']}
        activateBlocked={false}
        selectedHere={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Close branch' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Close Westlands Branch?' });
    expect(within(dialog).getByRole('button', { name: 'Close branch' })).toHaveClass(
      'MuiButton-colorError',
    );
  });

  it(
    'suspends with a required reason, the branch id and the rendered organisation (I2), ' +
      'then focuses Reactivate after the transition (I3, PF6)',
    async () => {
      const user = userEvent.setup();
      suspendBranch.mockResolvedValueOnce({ ok: true });
      const { rerender } = renderWithProviders(
        <main>
          <h1>Westlands Branch</h1>
          <BranchLifecycleActions
            branchId={ID}
            branchCode="KAREN"
            branchName="Westlands Branch"
            actions={['suspend', 'close']}
            activateBlocked={false}
            selectedHere
            contextOrganisationId={ORG_ID}
          />
        </main>,
      );

      expect(screen.getByRole('button', { name: 'Close branch' })).toHaveClass(
        'MuiButton-colorError',
      );
      await user.click(screen.getByRole('button', { name: 'Suspend' }));
      const dialog = screen.getByRole('dialog', { name: 'Suspend Westlands Branch?' });
      expect(within(dialog).getByText(/choose a working context again/)).toBeInTheDocument();
      const reason = within(dialog).getByRole('textbox', { name: 'Reason' });
      expect(reason).toBeRequired();
      await user.type(reason, 'Cash count');
      await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));

      await waitFor(() => {
        expect(suspendBranch).toHaveBeenCalledTimes(1);
      });
      const formData = suspendBranch.mock.calls[0]?.[1] as FormData;
      expect(formData.get('branchId')).toBe(ID);
      expect(formData.get('reason')).toBe('Cash count');
      expect(formData.get('contextOrganisationId')).toBe(ORG_ID);
      expect(await screen.findByRole('alert')).toHaveTextContent('Branch suspended');

      // The server component swaps the action set after `refresh()`; simulate that next render.
      rerender(
        <main>
          <h1>Westlands Branch</h1>
          <BranchLifecycleActions
            branchId={ID}
            branchCode="KAREN"
            branchName="Westlands Branch"
            actions={['reactivate', 'close']}
            activateBlocked={false}
            selectedHere
            contextOrganisationId={ORG_ID}
          />
        </main>,
      );

      // MUI's Dialog keeps the rest of the page aria-hidden until its exit transition finishes,
      // so the button may not be reachable by role immediately after `rerender`.
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Reactivate' })).toHaveFocus();
      });
    },
  );

  it('falls back to the record title when a transition leaves no enabled action (I3, PF6)', async () => {
    const user = userEvent.setup();
    submitBranch.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderWithProviders(
      <main>
        <h1>Karen Branch</h1>
        <BranchLifecycleActions
          branchId={ID}
          branchCode="KAREN"
          branchName="Karen Branch"
          actions={['submit']}
          activateBlocked={false}
          selectedHere={false}
        />
      </main>,
    );

    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    const dialog = screen.getByRole('dialog', { name: 'Submit Karen Branch for approval?' });
    await user.click(within(dialog).getByRole('button', { name: 'Submit for approval' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Submitted for approval');

    // The drafter's Submit leaves only a disabled Activate (BG-08): no enabled button remains.
    rerender(
      <main>
        <h1>Karen Branch</h1>
        <BranchLifecycleActions
          branchId={ID}
          branchCode="KAREN"
          branchName="Karen Branch"
          actions={['activate']}
          activateBlocked
          selectedHere={false}
        />
      </main>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Karen Branch' })).toHaveFocus();
    });
  });
  it.each([
    [
      'Withdraw',
      'withdraw',
      'Withdraw Karen Branch?',
      'It goes back to draft so you can change it and submit it again.',
      'Reason',
      'Branch withdrawn',
    ],
    [
      'Return for changes',
      'return',
      'Return Karen Branch for changes?',
      'It goes back to draft. Its maker sees your reason.',
      'What needs to change',
      'Returned for changes',
    ],
  ] as const)(
    'sends a pending branch back with %s: outlined, a required reason, the branch and the organisation',
    async (label, id, title, description, field, toast) => {
      const user = userEvent.setup();
      returnBranch.mockResolvedValueOnce({ ok: true });
      renderWithProviders(
        <BranchLifecycleActions
          branchId={ID}
          branchCode="KAREN"
          branchName="Karen Branch"
          actions={['activate', id]}
          activateBlocked={false}
          selectedHere={false}
          contextOrganisationId={ORG_ID}
        />,
      );

      const trigger = screen.getByRole('button', { name: label });
      expect(trigger).toHaveClass('MuiButton-outlined', 'MuiButton-colorPrimary');
      await user.click(trigger);
      const dialog = screen.getByRole('dialog', { name: title });
      expect(dialog).toHaveAccessibleDescription(description);
      const reason = within(dialog).getByRole('textbox', { name: field });
      expect(reason).toBeRequired();
      await user.type(reason, 'Wrong parent');
      await user.click(within(dialog).getByRole('button', { name: label }));

      expect(await screen.findByRole('alert')).toHaveTextContent(toast);
      const sent = returnBranch.mock.calls[0]?.[1] as FormData;
      expect(sent.get('branchId')).toBe(ID);
      expect(sent.get('reason')).toBe('Wrong parent');
      expect(sent.get('contextOrganisationId')).toBe(ORG_ID);
      expect(sent.get('idempotencyKey')).toMatch(UUID);
    },
  );

  it('keeps the drafter’s Withdraw outlined when it is the only action', () => {
    renderWithProviders(
      <BranchLifecycleActions
        branchId={ID}
        branchCode="KAREN"
        branchName="Karen Branch"
        actions={['withdraw']}
        activateBlocked={false}
        selectedHere={false}
      />,
    );
    expect(screen.getByRole('button', { name: 'Withdraw' })).toHaveClass('MuiButton-outlined');
  });

  it('discards a draft through an error-toned alertdialog that names the code it keeps', async () => {
    const user = userEvent.setup();
    discardBranch.mockResolvedValueOnce({ ok: true });
    renderWithProviders(
      <BranchLifecycleActions
        branchId={ID}
        branchCode="KAREN"
        branchName="Karen Branch"
        actions={['submit', 'discard']}
        activateBlocked={false}
        selectedHere={false}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Discard draft' });
    expect(trigger).toHaveClass('MuiButton-outlined', 'MuiButton-colorError');
    await user.click(trigger);
    const dialog = screen.getByRole('alertdialog', { name: 'Discard the Karen Branch draft?' });
    expect(dialog).toHaveAccessibleDescription(
      "The draft closes and can't be reopened. Its code KAREN stays taken.",
    );
    expect(within(dialog).getByRole('button', { name: 'Discard draft' })).toHaveClass(
      'MuiButton-colorError',
    );
    await user.type(within(dialog).getByRole('textbox', { name: 'Reason' }), 'Opened by mistake');
    await user.click(within(dialog).getByRole('button', { name: 'Discard draft' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Draft discarded');
    const sent = discardBranch.mock.calls[0]?.[1] as FormData;
    expect(sent.get('branchId')).toBe(ID);
    expect(sent.get('reason')).toBe('Opened by mistake');
  });

  // Review Focus 1 and 2: a return refused because someone acted first keeps the typed reason, and
  // the retry replays with the same key.
  it('keeps the reason and the key after a refused return, and retries with them', async () => {
    const user = userEvent.setup();
    const refusal =
      "This branch isn't waiting for approval any more: it was decided, returned or withdrawn elsewhere. Refresh to see where it stands.";
    returnBranch
      .mockResolvedValueOnce({
        ok: false,
        formError: refusal,
        fieldErrors: {},
        code: 'conflict',
        requestId: 'req-9',
      })
      .mockResolvedValueOnce({ ok: true });
    renderWithProviders(
      <BranchLifecycleActions
        branchId={ID}
        branchCode="KAREN"
        branchName="Karen Branch"
        actions={['activate', 'return']}
        activateBlocked={false}
        selectedHere={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Return for changes' }));
    const dialog = screen.getByRole('dialog', { name: 'Return Karen Branch for changes?' });
    const reason = within(dialog).getByRole('textbox', { name: 'What needs to change' });
    await user.type(reason, 'Wrong parent');
    await user.click(within(dialog).getByRole('button', { name: 'Return for changes' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(refusal);
    expect(reason).toHaveValue('Wrong parent');

    await user.click(within(dialog).getByRole('button', { name: 'Return for changes' }));
    await waitFor(() => {
      expect(returnBranch).toHaveBeenCalledTimes(2);
    });
    const [first, second] = returnBranch.mock.calls.map((call) => call[1] as FormData);
    expect(second?.get('idempotencyKey')).toBe(first?.get('idempotencyKey'));
    expect(second?.get('reason')).toBe('Wrong parent');
  });
});
