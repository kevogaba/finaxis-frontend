import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import {
  ACCOUNT_CHANGED,
  ACCOUNT_DEACTIVATED_NOTE,
  CONFIRM_USERNAME_MISMATCH,
  OWN_ACCOUNT,
  type AccountAction,
} from '../account-rules';
import { AccountLifecycleActions } from './account-lifecycle-actions';

const { deactivateAccount, reactivateAccount, suspendAccount } = vi.hoisted(() => ({
  deactivateAccount: vi.fn(),
  reactivateAccount: vi.fn(),
  suspendAccount: vi.fn(),
}));
vi.mock('../account-actions', () => ({
  deactivateAccount: (...args: unknown[]) => deactivateAccount(...args) as unknown,
  reactivateAccount: (...args: unknown[]) => reactivateAccount(...args) as unknown,
  suspendAccount: (...args: unknown[]) => suspendAccount(...args) as unknown,
}));

const USER = '17000000-0000-4000-8000-0000000000a7';
const ORG = '00000000-0000-0000-0000-000000000000';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NAME = 'Esi Mensah';
const USERNAME = 'esi.mensah';

interface Overrides {
  actions: readonly AccountAction[];
  blocked?: Partial<Record<AccountAction, string>>;
  note?: string | null;
}

/** The hero's slot: the record title is the page's `h1`, the focus fallback's target. */
const record = ({ actions, blocked = {}, note = null }: Overrides) => (
  <main>
    <h1>{NAME}</h1>
    <AccountLifecycleActions
      userId={USER}
      userName={NAME}
      username={USERNAME}
      actions={actions}
      blocked={blocked}
      note={note}
      contextOrganisationId={ORG}
    />
  </main>
);
const renderActions = (overrides: Overrides) => renderWithProviders(record(overrides));

/** Rule 6: every dialog carries the person, a minted key and the rendered organisation, or the
 * cross-tab guard and the replay silently stop working. */
function expectScoped(sent: FormData | undefined) {
  expect(sent?.get('userId')).toBe(USER);
  expect(sent?.get('contextOrganisationId')).toBe(ORG);
  expect(sent?.get('idempotencyKey')).toMatch(UUID);
}

describe('AccountLifecycleActions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('suspends the account everywhere, with a required reason, the user, the key and the organisation', async () => {
    const user = userEvent.setup();
    suspendAccount.mockResolvedValueOnce({ ok: true });
    renderActions({ actions: ['suspend', 'deactivate'] });

    await user.click(screen.getByRole('button', { name: 'Suspend account' }));
    const dialog = screen.getByRole('dialog', { name: `Suspend ${NAME}'s account?` });
    expect(dialog).toHaveTextContent("can't sign in to any institution they belong to");
    const reason = within(dialog).getByRole('textbox', { name: /^Reason/ });
    expect(reason).toBeRequired();
    await user.type(reason, 'Fraud review');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend account' }));

    await waitFor(() => {
      expect(suspendAccount).toHaveBeenCalledTimes(1);
    });
    const sent = suspendAccount.mock.calls[0]?.[1] as FormData;
    expectScoped(sent);
    expect(sent.get('reason')).toBe('Fraud review');
    expect(await screen.findByRole('alert')).toHaveTextContent('Account suspended');
  });

  it('makes Deactivate an alertdialog that asks for the username typed back', async () => {
    const user = userEvent.setup();
    deactivateAccount.mockResolvedValueOnce({ ok: true });
    renderActions({ actions: ['suspend', 'deactivate'] });

    expect(screen.getByRole('button', { name: 'Deactivate account' })).toHaveClass(
      'MuiButton-outlined',
      'MuiButton-colorError',
    );
    await user.click(screen.getByRole('button', { name: 'Deactivate account' }));
    const dialog = screen.getByRole('alertdialog', { name: `Deactivate ${NAME}'s account?` });
    expect(dialog).toHaveTextContent("the platform can't reactivate a deactivated account");
    expect(dialog).toHaveTextContent('every institution they belong to');
    const confirm = within(dialog).getByRole('textbox', { name: `Type ${USERNAME} to confirm` });
    expect(confirm).toBeRequired();
    await user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), 'Left the platform');
    await user.type(confirm, USERNAME);
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate account' }));

    await waitFor(() => {
      expect(deactivateAccount).toHaveBeenCalledTimes(1);
    });
    const sent = deactivateAccount.mock.calls[0]?.[1] as FormData;
    expectScoped(sent);
    expect(sent.get('username')).toBe(USERNAME);
    expect(sent.get('confirmUsername')).toBe(USERNAME);
    expect(sent.get('reason')).toBe('Left the platform');
    expect(await screen.findByRole('alert')).toHaveTextContent('Account deactivated');
  });

  it('keeps the typed reason, the typed username and the key after a refused deactivate', async () => {
    const user = userEvent.setup();
    deactivateAccount
      .mockResolvedValueOnce({
        ok: false,
        formError: 'Check the highlighted fields and try again.',
        fieldErrors: { confirmUsername: CONFIRM_USERNAME_MISMATCH },
        code: 'validation_failed',
        requestId: null,
      })
      .mockResolvedValueOnce({ ok: true });
    renderActions({ actions: ['suspend', 'deactivate'] });

    await user.click(screen.getByRole('button', { name: 'Deactivate account' }));
    const dialog = screen.getByRole('alertdialog', { name: `Deactivate ${NAME}'s account?` });
    const confirm = within(dialog).getByRole('textbox', { name: `Type ${USERNAME} to confirm` });
    await user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), 'Left the platform');
    await user.type(confirm, 'esi');
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate account' }));

    expect(await within(dialog).findByText(CONFIRM_USERNAME_MISMATCH)).toBeInTheDocument();
    expect(confirm).toHaveValue('esi');
    // The mismatch is tied to its field: invalid, described by the message, and focused.
    expect(confirm).toBeInvalid();
    expect(confirm).toHaveAccessibleDescription(CONFIRM_USERNAME_MISMATCH);
    await waitFor(() => {
      expect(confirm).toHaveFocus();
    });
    await user.clear(confirm);
    await user.type(confirm, USERNAME);
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate account' }));
    await waitFor(() => {
      expect(deactivateAccount).toHaveBeenCalledTimes(2);
    });
    const [first, second] = deactivateAccount.mock.calls.map((call) => call[1] as FormData);
    expectScoped(first);
    expectScoped(second);
    expect(second?.get('idempotencyKey')).toBe(first?.get('idempotencyKey'));
    expect(first?.get('confirmUsername')).toBe('esi');
    expect(second?.get('confirmUsername')).toBe(USERNAME);
    expect(second?.get('reason')).toBe('Left the platform');
  });

  it('asks Reactivate for an optional reason', async () => {
    const user = userEvent.setup();
    reactivateAccount.mockResolvedValueOnce({ ok: true });
    renderActions({ actions: ['reactivate'] });

    await user.click(screen.getByRole('button', { name: 'Reactivate account' }));
    const dialog = screen.getByRole('dialog', { name: `Reactivate ${NAME}'s account?` });
    expect(dialog).toHaveTextContent('where their membership is active');
    expect(within(dialog).getByRole('textbox', { name: 'Reason (optional)' })).not.toBeRequired();
    await user.click(within(dialog).getByRole('button', { name: 'Reactivate account' }));

    await waitFor(() => {
      expect(reactivateAccount).toHaveBeenCalledTimes(1);
    });
    expectScoped(reactivateAccount.mock.calls[0]?.[1] as FormData);
    expect(await screen.findByRole('alert')).toHaveTextContent('Account reactivated');
  });

  it('keeps the typed reason and the key after a refused suspend', async () => {
    const user = userEvent.setup();
    suspendAccount
      .mockResolvedValueOnce({
        ok: false,
        formError: ACCOUNT_CHANGED,
        fieldErrors: {},
        code: 'conflict',
        requestId: 'req-1',
      })
      .mockResolvedValueOnce({ ok: true });
    renderActions({ actions: ['suspend', 'deactivate'] });

    await user.click(screen.getByRole('button', { name: 'Suspend account' }));
    const dialog = screen.getByRole('dialog', { name: `Suspend ${NAME}'s account?` });
    const reason = within(dialog).getByRole('textbox', { name: /^Reason/ });
    await user.type(reason, 'Fraud review');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend account' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      `${ACCOUNT_CHANGED} Reference: req-1`,
    );
    expect(reason).toHaveValue('Fraud review');

    await user.click(within(dialog).getByRole('button', { name: 'Suspend account' }));
    await waitFor(() => {
      expect(suspendAccount).toHaveBeenCalledTimes(2);
    });
    const [first, second] = suspendAccount.mock.calls.map((call) => call[1] as FormData);
    expect(second?.get('idempotencyKey')).toBe(first?.get('idempotencyKey'));
    // The refused attempt carries the scope too.
    expectScoped(first);
    expectScoped(second);
    expect(second?.get('reason')).toBe('Fraud review');
  });

  it('disables Suspend and Deactivate on your own account with one caption', () => {
    renderActions({
      actions: ['suspend', 'deactivate'],
      blocked: { suspend: OWN_ACCOUNT, deactivate: OWN_ACCOUNT },
    });

    for (const name of ['Suspend account', 'Deactivate account']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(OWN_ACCOUNT);
    }
    expect(screen.getAllByText(OWN_ACCOUNT)).toHaveLength(1);
  });

  it('shows the note when no action is offered', () => {
    renderActions({ actions: [], note: ACCOUNT_DEACTIVATED_NOTE });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(ACCOUNT_DEACTIVATED_NOTE)).toBeInTheDocument();
  });

  it('caps its box at 320 px from md, so a long caption wraps instead of squeezing the title', () => {
    renderActions({
      actions: ['suspend', 'deactivate'],
      blocked: { suspend: OWN_ACCOUNT, deactivate: OWN_ACCOUNT },
    });

    // jsdom has no media queries in a computed style, so the rule Emotion emitted is what shows it.
    const box = screen.getByRole('button', { name: 'Suspend account' }).parentElement;
    const emotionClass = [...(box?.classList ?? [])].find((name) => name.startsWith('css-'));
    expect(emotionClass).toBeDefined();
    const css = [...document.querySelectorAll('style')]
      .map((style) => style.textContent)
      .filter((text) => text.includes(`.${emotionClass}`))
      .join('');
    expect(css).toMatch(/@media[^{]*\(min-width:\s*900px\)\s*\{[^}]*max-width:\s*320px/);
  });

  it('moves focus to Reactivate account after a suspend', async () => {
    const user = userEvent.setup();
    suspendAccount.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderActions({ actions: ['suspend', 'deactivate'] });

    await user.click(screen.getByRole('button', { name: 'Suspend account' }));
    const dialog = screen.getByRole('dialog', { name: `Suspend ${NAME}'s account?` });
    await user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), 'Fraud review');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Account suspended');
    expectScoped(suspendAccount.mock.calls[0]?.[1] as FormData);

    // The server component swaps the action set after `refresh()`; simulate that next render.
    rerender(record({ actions: ['reactivate'] }));

    // MUI's Dialog keeps the rest of the page aria-hidden until its exit transition finishes, so
    // the button may not be reachable by role immediately after `rerender`.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reactivate account' })).toHaveFocus();
    });
  });

  it('moves focus to the first enabled action after a reactivate', async () => {
    const user = userEvent.setup();
    reactivateAccount.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderActions({ actions: ['reactivate'] });

    await user.click(screen.getByRole('button', { name: 'Reactivate account' }));
    const dialog = screen.getByRole('dialog', { name: `Reactivate ${NAME}'s account?` });
    await user.click(within(dialog).getByRole('button', { name: 'Reactivate account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Account reactivated');
    expectScoped(reactivateAccount.mock.calls[0]?.[1] as FormData);

    // Reactivate is gone; Suspend is the first action still on offer.
    rerender(record({ actions: ['suspend', 'deactivate'] }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Suspend account' })).toHaveFocus();
    });
  });

  it('falls back to the record title when only a blocked action remains', async () => {
    const user = userEvent.setup();
    reactivateAccount.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderActions({ actions: ['reactivate'] });

    await user.click(screen.getByRole('button', { name: 'Reactivate account' }));
    const dialog = screen.getByRole('dialog', { name: `Reactivate ${NAME}'s account?` });
    await user.click(within(dialog).getByRole('button', { name: 'Reactivate account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Account reactivated');
    expectScoped(reactivateAccount.mock.calls[0]?.[1] as FormData);

    // A disabled button can't take focus, so with nothing enabled left the title is the target.
    rerender(
      record({
        actions: ['suspend', 'deactivate'],
        blocked: { suspend: OWN_ACCOUNT, deactivate: OWN_ACCOUNT },
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: NAME })).toHaveFocus();
    });
  });

  it('falls back to the record title after a deactivate', async () => {
    const user = userEvent.setup();
    deactivateAccount.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderActions({ actions: ['suspend', 'deactivate'] });

    await user.click(screen.getByRole('button', { name: 'Deactivate account' }));
    const dialog = screen.getByRole('alertdialog', { name: `Deactivate ${NAME}'s account?` });
    await user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), 'Left the platform');
    await user.type(
      within(dialog).getByRole('textbox', { name: `Type ${USERNAME} to confirm` }),
      USERNAME,
    );
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Account deactivated');
    expectScoped(deactivateAccount.mock.calls[0]?.[1] as FormData);

    // A deactivated account has no action left (only a note), so the layout drops the component.
    rerender(
      <main>
        <h1>{NAME}</h1>
      </main>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: NAME })).toHaveFocus();
    });
  });

  it('falls back to the record title when a deactivate leaves only the note', async () => {
    const user = userEvent.setup();
    deactivateAccount.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderActions({ actions: ['suspend', 'deactivate'] });

    await user.click(screen.getByRole('button', { name: 'Deactivate account' }));
    const dialog = screen.getByRole('alertdialog', { name: `Deactivate ${NAME}'s account?` });
    await user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), 'Left the platform');
    await user.type(
      within(dialog).getByRole('textbox', { name: `Type ${USERNAME} to confirm` }),
      USERNAME,
    );
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Account deactivated');
    expectScoped(deactivateAccount.mock.calls[0]?.[1] as FormData);

    // What AccountRecord renders for a deactivated account: no action, the note (Ruling 5). The
    // component stays mounted, so the focus effect, not the unmount cleanup, reaches the title.
    rerender(record({ actions: [], note: ACCOUNT_DEACTIVATED_NOTE }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: NAME })).toHaveFocus();
    });
  });
});
