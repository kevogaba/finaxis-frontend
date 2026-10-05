import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { UserStatus } from '../user-contract';
import {
  MEMBERSHIP_MISSING,
  MEMBERSHIP_UNAVAILABLE,
  OWN_MEMBERSHIP,
  USER_MAKER_CHECKER_BLOCKED,
  type MembershipAction,
} from '../user-rules';
import { UserLifecycleActions } from './user-lifecycle-actions';

const { approveMembership, reactivateMembership, revokeMembership, suspendMembership } = vi.hoisted(
  () => ({
    approveMembership: vi.fn(),
    reactivateMembership: vi.fn(),
    revokeMembership: vi.fn(),
    suspendMembership: vi.fn(),
  }),
);
vi.mock('../membership-actions', () => ({
  approveMembership: (...args: unknown[]) => approveMembership(...args) as unknown,
  reactivateMembership: (...args: unknown[]) => reactivateMembership(...args) as unknown,
  revokeMembership: (...args: unknown[]) => revokeMembership(...args) as unknown,
  suspendMembership: (...args: unknown[]) => suspendMembership(...args) as unknown,
}));

const MEMBERSHIP = '10000000-0000-4000-8000-000000000004';
const ORG = '55555555-5555-4555-8555-555555555555';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NAME = 'Amina Odhiambo';

interface Overrides {
  /** Defaults to a found membership; `null` is the hero after a failed or missed lookup. */
  membershipId?: string | null;
  actions: readonly MembershipAction[];
  blocked?: Partial<Record<MembershipAction, string>>;
  note?: string | null;
  /** The user's account status as the page rendered it; omitted, the prop is not passed at all. */
  userStatus?: UserStatus;
}

/** The hero's slot: the record title is the page's `h1`, the focus fallback's target. */
const record = ({
  membershipId = MEMBERSHIP,
  actions,
  blocked = {},
  note = null,
  userStatus,
}: Overrides) => (
  <main>
    <h1>{NAME}</h1>
    <UserLifecycleActions
      membershipId={membershipId}
      userName={NAME}
      actions={actions}
      blocked={blocked}
      note={note}
      userStatus={userStatus}
      contextOrganisationId={ORG}
    />
  </main>
);
const renderActions = (overrides: Overrides) => renderWithProviders(record(overrides));

/** Rule 6: every dialog carries the membership, a minted key and the rendered organisation, or the
 * cross-tab guard and the replay silently stop working. */
function expectScoped(sent: FormData | undefined) {
  expect(sent?.get('membershipId')).toBe(MEMBERSHIP);
  expect(sent?.get('contextOrganisationId')).toBe(ORG);
  expect(sent?.get('idempotencyKey')).toMatch(UUID);
}

describe('UserLifecycleActions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('approves through a confirmation that carries the membership, key and organisation (I2)', async () => {
    const user = userEvent.setup();
    approveMembership.mockResolvedValueOnce({ ok: true });
    renderActions({ actions: ['approve', 'reject'] });

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = screen.getByRole('dialog', { name: `Approve ${NAME}?` });
    // The activate endpoint reads no body, so Approve is a bare confirmation: no reason field.
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(approveMembership).toHaveBeenCalledTimes(1);
    });
    expectScoped(approveMembership.mock.calls[0]?.[1] as FormData);
    expect(await screen.findByRole('alert')).toHaveTextContent('Approval recorded');
  });

  it('makes Reject & revoke an alertdialog with the permanence warning and a required reason', async () => {
    const user = userEvent.setup();
    revokeMembership.mockResolvedValueOnce({ ok: true });
    renderActions({ actions: ['approve', 'reject'], userStatus: 'DRAFT' });

    await user.click(screen.getByRole('button', { name: 'Reject & revoke' }));
    const dialog = screen.getByRole('alertdialog', { name: `Reject and revoke ${NAME}?` });
    expect(dialog).toHaveTextContent('can never be invited to this institution again');
    const reason = within(dialog).getByRole('textbox', { name: /^Reason/ });
    expect(reason).toBeRequired();
    expect(within(dialog).getByRole('button', { name: 'Reject & revoke' })).toHaveClass(
      'MuiButton-colorError',
    );

    await user.type(reason, 'Not our member');
    await user.click(within(dialog).getByRole('button', { name: 'Reject & revoke' }));
    await waitFor(() => {
      expect(revokeMembership).toHaveBeenCalledTimes(1);
    });
    const sent = revokeMembership.mock.calls[0]?.[1] as FormData;
    expectScoped(sent);
    expect(sent.get('reason')).toBe('Not our member');
    // Layer 12, P-3: the action refuses it unless the membership is still pending.
    expect(sent.get('expectedStatus')).toBe('PENDING_APPROVAL');
    // A 202 approval keeps the membership pending and moves only the user, so the action also needs
    // the user's status as this page rendered it.
    expect(sent.get('expectedUserStatus')).toBe('DRAFT');
    expect(await screen.findByRole('alert')).toHaveTextContent('Membership revoked');
  });

  it('names the rendered user status as it was, including a record shown as provisioning', async () => {
    const user = userEvent.setup();
    revokeMembership.mockResolvedValueOnce({ ok: true });
    renderActions({ actions: ['reject'], userStatus: 'PROVISIONING_IDP' });

    await user.click(screen.getByRole('button', { name: 'Reject & revoke' }));
    const dialog = screen.getByRole('alertdialog', { name: `Reject and revoke ${NAME}?` });
    await user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), 'Not our member');
    await user.click(within(dialog).getByRole('button', { name: 'Reject & revoke' }));

    await waitFor(() => {
      expect(revokeMembership).toHaveBeenCalledTimes(1);
    });
    expect((revokeMembership.mock.calls[0]?.[1] as FormData).get('expectedUserStatus')).toBe(
      'PROVISIONING_IDP',
    );
  });

  it('sends no expected user status when the page names none', async () => {
    const user = userEvent.setup();
    revokeMembership.mockResolvedValueOnce({ ok: true });
    renderActions({ actions: ['reject'] });

    await user.click(screen.getByRole('button', { name: 'Reject & revoke' }));
    const dialog = screen.getByRole('alertdialog', { name: `Reject and revoke ${NAME}?` });
    await user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), 'Not our member');
    await user.click(within(dialog).getByRole('button', { name: 'Reject & revoke' }));

    await waitFor(() => {
      expect(revokeMembership).toHaveBeenCalledTimes(1);
    });
    const sent = revokeMembership.mock.calls[0]?.[1] as FormData;
    expect(sent.get('expectedStatus')).toBe('PENDING_APPROVAL');
    expect(sent.get('expectedUserStatus')).toBeNull();
  });

  it('draws the destructive actions in the error colour and the first action as the primary', () => {
    renderActions({ actions: ['suspend', 'revoke'] });

    expect(screen.getByRole('button', { name: 'Suspend' })).toHaveClass('MuiButton-contained');
    expect(screen.getByRole('button', { name: 'Revoke' })).toHaveClass(
      'MuiButton-outlined',
      'MuiButton-colorError',
    );
  });

  it('disables Approve for its inviter and says why', () => {
    renderActions({
      actions: ['approve', 'reject'],
      blocked: { approve: USER_MAKER_CHECKER_BLOCKED },
    });

    const approve = screen.getByRole('button', { name: 'Approve' });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAccessibleDescription(USER_MAKER_CHECKER_BLOCKED);
    expect(screen.getByRole('button', { name: 'Reject & revoke' })).toBeEnabled();
  });

  it('disables Suspend and Revoke on your own record with one caption', () => {
    renderActions({
      actions: ['suspend', 'revoke'],
      blocked: { suspend: OWN_MEMBERSHIP, revoke: OWN_MEMBERSHIP },
    });

    for (const name of ['Suspend', 'Revoke']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(OWN_MEMBERSHIP);
    }
    expect(screen.getAllByText(OWN_MEMBERSHIP)).toHaveLength(1);
  });

  it('keeps the typed reason and the key after a refused suspend', async () => {
    const user = userEvent.setup();
    suspendMembership
      .mockResolvedValueOnce({
        ok: false,
        formError: 'Refused',
        fieldErrors: {},
        code: 'conflict',
        requestId: 'req-1',
      })
      .mockResolvedValueOnce({ ok: true });
    renderActions({ actions: ['suspend', 'revoke'] });

    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    const dialog = screen.getByRole('dialog', { name: `Suspend ${NAME}?` });
    const reason = within(dialog).getByRole('textbox', { name: /^Reason/ });
    expect(reason).toBeRequired();
    await user.type(reason, 'Cash audit');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Refused Reference: req-1');
    expect(reason).toHaveValue('Cash audit');

    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    await waitFor(() => {
      expect(suspendMembership).toHaveBeenCalledTimes(2);
    });
    const [first, second] = suspendMembership.mock.calls.map((call) => call[1] as FormData);
    expect(second?.get('idempotencyKey')).toBe(first?.get('idempotencyKey'));
    // The refused attempt carries the scope too.
    expectScoped(first);
    expectScoped(second);
    expect(second?.get('reason')).toBe('Cash audit');
  });

  it('asks Reactivate for an optional reason', async () => {
    const user = userEvent.setup();
    reactivateMembership.mockResolvedValueOnce({ ok: true });
    renderActions({ actions: ['reactivate', 'revoke'] });

    await user.click(screen.getByRole('button', { name: 'Reactivate' }));
    const dialog = screen.getByRole('dialog', { name: `Reactivate ${NAME}?` });
    expect(within(dialog).getByRole('textbox', { name: 'Reason (optional)' })).not.toBeRequired();
    await user.click(within(dialog).getByRole('button', { name: 'Reactivate' }));

    await waitFor(() => {
      expect(reactivateMembership).toHaveBeenCalledTimes(1);
    });
    expectScoped(reactivateMembership.mock.calls[0]?.[1] as FormData);
    expect(await screen.findByRole('alert')).toHaveTextContent('Membership reactivated');
  });

  it('moves focus to the replacement action after a transition', async () => {
    const user = userEvent.setup();
    suspendMembership.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderActions({ actions: ['suspend', 'revoke'] });

    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    const dialog = screen.getByRole('dialog', { name: `Suspend ${NAME}?` });
    await user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), 'Cash audit');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Membership suspended');
    expectScoped(suspendMembership.mock.calls[0]?.[1] as FormData);

    // The server component swaps the action set after `refresh()`; simulate that next render.
    rerender(record({ actions: ['reactivate', 'revoke'] }));

    // MUI's Dialog keeps the rest of the page aria-hidden until its exit transition finishes, so
    // the button may not be reachable by role immediately after `rerender`.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reactivate' })).toHaveFocus();
    });
  });

  it('falls back to the record title when only a blocked action remains', async () => {
    const user = userEvent.setup();
    suspendMembership.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderActions({ actions: ['suspend', 'revoke'] });

    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    const dialog = screen.getByRole('dialog', { name: `Suspend ${NAME}?` });
    await user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), 'Cash audit');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Membership suspended');
    expectScoped(suspendMembership.mock.calls[0]?.[1] as FormData);

    // A disabled button can't take focus, so with nothing enabled left the title is the target
    // (08's drafter-Submit case: the only action on offer is the blocked one).
    rerender(record({ actions: ['revoke'], blocked: { revoke: OWN_MEMBERSHIP } }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: NAME })).toHaveFocus();
    });
  });

  it('falls back to the record title when the membership re-read fails after a transition', async () => {
    const user = userEvent.setup();
    suspendMembership.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderActions({ actions: ['suspend', 'revoke'] });

    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    const dialog = screen.getByRole('dialog', { name: `Suspend ${NAME}?` });
    await user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), 'Cash audit');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Membership suspended');
    expectScoped(suspendMembership.mock.calls[0]?.[1] as FormData);

    // `refresh()` re-runs the layout. If its membership lookup now fails, the hero keeps only the
    // note (no membership, no action) and this component stays mounted, so nothing unmounts to
    // run the cleanup: the effect is what returns focus to the title.
    rerender(record({ membershipId: null, actions: [], note: MEMBERSHIP_UNAVAILABLE }));

    expect(await screen.findByText(MEMBERSHIP_UNAVAILABLE)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: NAME })).toHaveFocus();
    });
  });

  it('falls back to the record title when no action remains', async () => {
    const user = userEvent.setup();
    revokeMembership.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderActions({ actions: ['suspend', 'revoke'], userStatus: 'ACTIVE' });

    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    const dialog = screen.getByRole('alertdialog', { name: `Revoke ${NAME}'s membership?` });
    expect(dialog).toHaveTextContent('Every role and branch assignment here is revoked with it');
    expect(dialog).toHaveTextContent('can never be invited to this institution again');
    const reason = within(dialog).getByRole('textbox', { name: /^Reason/ });
    expect(reason).toBeRequired();
    await user.type(reason, 'Left the SACCO');
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Membership revoked');
    expectScoped(revokeMembership.mock.calls[0]?.[1] as FormData);
    // A plain Revoke names no expected status: any non-terminal membership may be revoked.
    expect((revokeMembership.mock.calls[0]?.[1] as FormData).get('expectedStatus')).toBeNull();
    expect((revokeMembership.mock.calls[0]?.[1] as FormData).get('expectedUserStatus')).toBeNull();

    // A revoked membership has no action left, so the layout drops the whole component.
    rerender(
      <main>
        <h1>{NAME}</h1>
      </main>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: NAME })).toHaveFocus();
    });
  });

  it('offers no action without a membership to act on', () => {
    renderWithProviders(
      <UserLifecycleActions
        membershipId={null}
        userName={NAME}
        actions={['approve', 'reject']}
        blocked={{}}
        note={MEMBERSHIP_MISSING}
        contextOrganisationId={ORG}
      />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(MEMBERSHIP_MISSING)).toBeInTheDocument();
  });

  it('shows the note on its own', () => {
    renderActions({ actions: [], note: MEMBERSHIP_MISSING });

    expect(screen.getByText(MEMBERSHIP_MISSING)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
