import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import {
  MEMBERSHIP_UNAVAILABLE,
  USER_MAKER_CHECKER_BLOCKED,
} from '@/modules/administration/users/user-rules';
import { ACTIVATED_TOAST, APPROVED_TOAST, REJECTED_TOAST } from '../approval-copy';
import type { ApprovalDecision } from '../approval-rules';
import { DecisionBar, type DecisionSubject } from './decision-bar';

const { activatePendingBranch, approveUser, rejectUser } = vi.hoisted(() => ({
  activatePendingBranch: vi.fn(),
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
}));
vi.mock('../approval-actions', () => ({
  approveUser: (...args: unknown[]) => approveUser(...args) as unknown,
  rejectUser: (...args: unknown[]) => rejectUser(...args) as unknown,
}));
vi.mock('../branch-activation-actions', () => ({
  activatePendingBranch: (...args: unknown[]) => activatePendingBranch(...args) as unknown,
}));

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const MEMBERSHIP = 'a4000000-0000-4000-8000-000000000004';
const BRANCH = 'b5000000-0000-4000-8000-000000000005';
const ORG = 'c6000000-0000-4000-8000-000000000006';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NAME = 'Rose Atieno';
const BRANCH_NAME = 'Kericho Branch';

interface Overrides {
  subject?: DecisionSubject;
  decisions?: readonly ApprovalDecision[];
  blocked?: Partial<Record<ApprovalDecision, string>>;
  note?: string | null;
}

/** The hero's slot: the record title is the page's `h1`, the focus fallback's target. */
const record = ({
  subject = { kind: 'membership', membershipId: MEMBERSHIP },
  decisions = ['approve', 'reject'],
  blocked = {},
  note = null,
}: Overrides = {}) => (
  <main>
    <h1>{subject.kind === 'branch' ? BRANCH_NAME : NAME}</h1>
    <DecisionBar
      subject={subject}
      name={subject.kind === 'branch' ? BRANCH_NAME : NAME}
      decisions={decisions}
      blocked={blocked}
      note={note}
      contextOrganisationId={ORG}
    />
  </main>
);

/** Every dialog carries the subject's backend id, a minted key and the rendered organisation, or
 * the action's re-read, the replay and the cross-tab guard silently stop working. */
function expectScoped(sent: FormData | undefined, field: 'membershipId' | 'branchId') {
  expect(sent?.get(field)).toBe(field === 'membershipId' ? MEMBERSHIP : BRANCH);
  expect(sent?.get('contextOrganisationId')).toBe(ORG);
  expect(sent?.get('idempotencyKey')).toMatch(UUID);
}

describe('DecisionBar', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    ['a 200', 'active', APPROVED_TOAST.active],
    ['a 202', 'provisioning', APPROVED_TOAST.provisioning],
    ['an unreadable echo', 'recorded', APPROVED_TOAST.recorded],
  ] as const)(
    'approves through a bare confirmation and says what %s means',
    async (_case, outcome, toast) => {
      const user = userEvent.setup({ delay: null });
      approveUser.mockResolvedValueOnce({ ok: true, outcome });
      renderWithProviders(record());

      await user.click(screen.getByRole('button', { name: 'Approve' }));
      const dialog = screen.getByRole('dialog', { name: `Approve ${NAME}?` });
      // The activate endpoint reads no body: no reason field.
      expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
      expect(dialog).toHaveTextContent("An approval can't be undone.");
      await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(toast);
      expect(approveUser).toHaveBeenCalledTimes(1);
      const sent = approveUser.mock.calls[0]?.[1] as FormData;
      expectScoped(sent, 'membershipId');
      expect(sent.get('userId')).toBeNull();
    },
  );

  it('makes Reject & revoke an alertdialog with the permanence warning and a required reason', async () => {
    const user = userEvent.setup({ delay: null });
    rejectUser.mockResolvedValueOnce({ ok: true });
    renderWithProviders(record());

    const trigger = screen.getByRole('button', { name: 'Reject & revoke' });
    expect(trigger).toHaveClass('MuiButton-outlined', 'MuiButton-colorError');
    await user.click(trigger);
    const dialog = screen.getByRole('alertdialog', { name: `Reject and revoke ${NAME}?` });
    expect(dialog).toHaveTextContent('can never be invited to this institution again');
    const reason = within(dialog).getByRole('textbox', { name: /^Reason/ });
    expect(reason).toBeRequired();
    await user.type(reason, 'Duplicate invitation');
    await user.click(within(dialog).getByRole('button', { name: 'Reject & revoke' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(REJECTED_TOAST);
    const sent = rejectUser.mock.calls[0]?.[1] as FormData;
    expectScoped(sent, 'membershipId');
    expect(sent.get('reason')).toBe('Duplicate invitation');
  });

  it('activates a branch with an optional reason, carrying the branch', async () => {
    const user = userEvent.setup({ delay: null });
    activatePendingBranch.mockResolvedValueOnce({ ok: true });
    renderWithProviders(
      record({ subject: { kind: 'branch', branchId: BRANCH }, decisions: ['activate'] }),
    );

    await user.click(screen.getByRole('button', { name: 'Activate' }));
    const dialog = screen.getByRole('dialog', { name: `Activate ${BRANCH_NAME}?` });
    expect(within(dialog).getByRole('textbox', { name: 'Reason (optional)' })).not.toBeRequired();
    await user.click(within(dialog).getByRole('button', { name: 'Activate' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(ACTIVATED_TOAST);
    const sent = activatePendingBranch.mock.calls[0]?.[1] as FormData;
    expectScoped(sent, 'branchId');
    expect(sent.get('membershipId')).toBeNull();
  });

  it('disables Approve for its inviter and says why, leaving Reject & revoke enabled', () => {
    renderWithProviders(record({ blocked: { approve: USER_MAKER_CHECKER_BLOCKED } }));

    const approve = screen.getByRole('button', { name: 'Approve' });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAccessibleDescription(USER_MAKER_CHECKER_BLOCKED);
    expect(screen.getByRole('button', { name: 'Reject & revoke' })).toBeEnabled();
  });

  it('disables Activate for its drafter and says why', () => {
    renderWithProviders(
      record({
        subject: { kind: 'branch', branchId: BRANCH },
        decisions: ['activate'],
        blocked: { activate: MAKER_CHECKER_BLOCKED },
      }),
    );

    const activate = screen.getByRole('button', { name: 'Activate' });
    expect(activate).toBeDisabled();
    expect(activate).toHaveAccessibleDescription(MAKER_CHECKER_BLOCKED);
  });

  it('never wraps a decision label beside a long name', () => {
    renderWithProviders(record());

    for (const name of ['Approve', 'Reject & revoke']) {
      expect(screen.getByRole('button', { name })).toHaveStyle({ whiteSpace: 'nowrap' });
    }
  });

  it('offers no decision without a membership to act on, but shows the note', () => {
    renderWithProviders(
      record({
        subject: { kind: 'membership', membershipId: null },
        note: MEMBERSHIP_UNAVAILABLE,
      }),
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(MEMBERSHIP_UNAVAILABLE)).toBeInTheDocument();
  });

  it('keeps the key after a failed approval, and retries with it', async () => {
    const user = userEvent.setup({ delay: null });
    approveUser
      .mockResolvedValueOnce({
        ok: false,
        formError: 'The approval couldn’t complete.',
        fieldErrors: {},
        code: 'internal_error',
        requestId: 'req-1',
      })
      .mockResolvedValueOnce({ ok: true, outcome: 'active' });
    renderWithProviders(record());

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = screen.getByRole('dialog', { name: `Approve ${NAME}?` });
    const confirm = within(dialog).getByRole('button', { name: 'Approve' });
    await user.click(confirm);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Reference: req-1');

    await user.click(confirm);
    expect(await screen.findByRole('alert')).toHaveTextContent(APPROVED_TOAST.active);
    const [first, second] = approveUser.mock.calls.map((call) => call[1] as FormData);
    expect(second?.get('idempotencyKey')).toBe(first?.get('idempotencyKey'));
    expectScoped(first, 'membershipId');
    expectScoped(second, 'membershipId');
  });

  it.each([
    [
      'Reject & revoke',
      'alertdialog',
      `Reject and revoke ${NAME}?`,
      'membershipId',
      REJECTED_TOAST,
    ],
    ['Activate', 'dialog', `Activate ${BRANCH_NAME}?`, 'branchId', ACTIVATED_TOAST],
  ] as const)(
    'keeps the key after a failed %s, and retries with it',
    async (label, role, title, field, toast) => {
      const user = userEvent.setup({ delay: null });
      const action = field === 'membershipId' ? rejectUser : activatePendingBranch;
      action
        .mockResolvedValueOnce({
          ok: false,
          formError: 'Refused.',
          fieldErrors: {},
          code: 'conflict',
          requestId: 'req-2',
        })
        .mockResolvedValueOnce({ ok: true });
      renderWithProviders(
        field === 'membershipId'
          ? record()
          : record({ subject: { kind: 'branch', branchId: BRANCH }, decisions: ['activate'] }),
      );

      await user.click(screen.getByRole('button', { name: label }));
      const dialog = screen.getByRole(role, { name: title });
      if (field === 'membershipId') {
        await user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), 'Duplicate');
      }
      await user.click(within(dialog).getByRole('button', { name: label }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Reference: req-2');

      await user.click(within(dialog).getByRole('button', { name: label }));
      await waitFor(() => {
        expect(action).toHaveBeenCalledTimes(2);
      });
      // The reason dialog's failure alert can still be on screen as it closes, so the toast is
      // found by its words, not as the only alert.
      expect(await screen.findByText(toast)).toBeInTheDocument();
      const [first, second] = action.mock.calls.map((call) => call[1] as FormData);
      expect(second?.get('idempotencyKey')).toBe(first?.get('idempotencyKey'));
      expectScoped(first, field);
      expectScoped(second, field);
    },
  );

  it('moves focus to the record title when the decision empties the bar', async () => {
    const user = userEvent.setup({ delay: null });
    approveUser.mockResolvedValueOnce({ ok: true, outcome: 'provisioning' });
    const { rerender } = renderWithProviders(record());

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await user.click(
      within(screen.getByRole('dialog', { name: `Approve ${NAME}?` })).getByRole('button', {
        name: 'Approve',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(APPROVED_TOAST.provisioning);
    expectScoped(approveUser.mock.calls[0]?.[1] as FormData, 'membershipId');

    // `refresh()` re-renders the page: a decided request has no bar, so the component unmounts.
    rerender(
      <main>
        <h1>{NAME}</h1>
      </main>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: NAME })).toHaveFocus();
    });
  });

  it.each([
    ['the first enabled decision left', ['reject'], null, 'Reject & revoke'],
    ['the record title when nothing is left to act on', [], MEMBERSHIP_UNAVAILABLE, NAME],
  ] as const)(
    'moves focus to %s while the bar stays mounted',
    async (_case, decisions, note, focused) => {
      const user = userEvent.setup({ delay: null });
      approveUser.mockResolvedValueOnce({ ok: true, outcome: 'active' });
      const { rerender } = renderWithProviders(record());

      await user.click(screen.getByRole('button', { name: 'Approve' }));
      await user.click(
        within(screen.getByRole('dialog', { name: `Approve ${NAME}?` })).getByRole('button', {
          name: 'Approve',
        }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(APPROVED_TOAST.active);
      expectScoped(approveUser.mock.calls[0]?.[1] as FormData, 'membershipId');

      // `refresh()` re-renders the page with the decided state: the bar stays mounted with what is
      // left, so the effect (not the unmount cleanup) returns focus.
      rerender(record({ decisions, note }));

      await waitFor(() => {
        expect(
          screen.getByRole(decisions.length ? 'button' : 'heading', { name: focused }),
        ).toHaveFocus();
      });
    },
  );
});
