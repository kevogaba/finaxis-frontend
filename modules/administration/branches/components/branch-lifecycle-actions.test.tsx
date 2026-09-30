import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { MAKER_CHECKER_BLOCKED } from '../branch-rules';
import { BranchLifecycleActions } from './branch-lifecycle-actions';

// Both mocked actions are hoisted (not just `suspendBranch`, as the brief's own snippet does):
// the drafter's-Submit focus test below also needs to control `submitBranch`'s resolution.
const { suspendBranch, submitBranch } = vi.hoisted(() => ({
  suspendBranch: vi.fn(),
  submitBranch: vi.fn(),
}));
vi.mock('../branch-actions', () => ({
  submitBranch: (...args: unknown[]) => submitBranch(...args) as unknown,
  activateBranch: vi.fn(),
  reactivateBranch: vi.fn(),
  closeBranch: vi.fn(),
  suspendBranch: (...args: unknown[]) => suspendBranch(...args) as unknown,
}));

const ID = '44444444-4444-4444-8444-444444444444';
const ORG_ID = '55555555-5555-4555-8555-555555555555';

describe('BranchLifecycleActions', () => {
  it('explains a blocked activation, tied to the disabled button (BG-08)', () => {
    renderWithProviders(
      <BranchLifecycleActions
        branchId={ID}
        branchName="Karen Branch"
        actions={['activate']}
        activateBlocked
        selectedHere={false}
      />,
    );

    const activate = screen.getByRole('button', { name: 'Activate' });
    expect(activate).toBeDisabled();
    expect(activate).toHaveAccessibleDescription(MAKER_CHECKER_BLOCKED);
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
});
