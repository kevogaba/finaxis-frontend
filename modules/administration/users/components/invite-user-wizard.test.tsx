import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { UUID_PATTERN } from '@/lib/api/wire';
import {
  EMAIL_CHECK_FAILED,
  EMAIL_CHECK_REFUSED,
  memberEmailMessage,
  NEEDS_A_BRANCH,
  NEEDS_A_ROLE,
  ROLE_BRANCH_UNASSIGNED,
  SESSION_EXPIRED,
} from '../invite-rules';
import { InviteUserWizard } from './invite-user-wizard';

const { inviteUser } = vi.hoisted(() => ({ inviteUser: vi.fn() }));
vi.mock('../invite-actions', () => ({
  inviteUser: (...args: unknown[]) => inviteUser(...args) as unknown,
}));

type User = ReturnType<typeof userEvent.setup>;

const ORG = '11111111-1111-4111-8111-111111111111';
const WESTLANDS = 'a4000000-0000-4000-8000-0000000000aa';
const HEAD_OFFICE = 'b2000000-0000-4000-8000-0000000000bb';
const TELLER = 'c1000000-0000-4000-8000-0000000000cc';
const ROLES = [{ id: TELLER, label: 'Teller (TELLER)' }];
const BRANCHES = [
  { id: HEAD_OFFICE, label: 'Head Office (HEAD_OFFICE)' },
  { id: WESTLANDS, label: 'Westlands Branch (WESTLANDS)' },
];
const EMAIL = 'neema.wanjiku@greenfield.example';

const fetchMock = vi.fn<(input: string) => Promise<Response>>();
const answer = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function renderWizard() {
  renderWithProviders(
    <InviteUserWizard
      roles={ROLES}
      branches={BRANCHES}
      rolesCapped={false}
      branchesCapped={false}
      contextOrganisationId={ORG}
    />,
  );
}

async function choose(user: User, label: string, option: string, scope?: HTMLElement) {
  await user.click(within(scope ?? document.body).getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
}

async function next(user: User, step: string) {
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('heading', { level: 2, name: step });
}

async function fillIdentity(user: User) {
  await user.type(screen.getByRole('textbox', { name: 'Full name' }), 'Neema Wanjiku');
  await user.type(screen.getByRole('textbox', { name: 'Email' }), EMAIL);
  await user.type(screen.getByRole('textbox', { name: 'Username' }), 'neema.wanjiku');
  await choose(user, 'Membership type', 'Staff');
}

async function fillAccess(user: User) {
  await choose(
    user,
    'Branch',
    'Westlands Branch (WESTLANDS)',
    screen.getByRole('group', {
      name: 'Branch assignment 1',
    }),
  );
  await choose(user, 'Role', 'Teller (TELLER)', screen.getByRole('group', { name: 'Role 1' }));
}

beforeEach(() => {
  // Reset, not clear: a failed test's unused queued answers must not leak into the next one.
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(() => answer(200, { membershipStatus: null }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InviteUserWizard: the steps', () => {
  it('summarises the identity’s invalid fields and focuses the first, without checking the email', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText('Check these fields: Full name, Email, Username, Membership type.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Full name' })).toHaveFocus();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks the email on Continue, then moves to Access with its heading focused', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();
    await fillIdentity(user);

    await next(user, 'Access');

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/tenant/users/invite-check?email=${encodeURIComponent(EMAIL)}`,
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Access' })).toHaveFocus();
    });
  });

  it('keeps an email already in use on Identity, says why, and clears it once changed', async () => {
    const user = userEvent.setup({ delay: null });
    fetchMock.mockImplementationOnce(() => answer(200, { membershipStatus: 'REVOKED' }));
    renderWizard();
    await fillIdentity(user);

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const email = screen.getByRole('textbox', { name: 'Email' });
    await waitFor(() => {
      expect(email).toHaveAccessibleDescription(memberEmailMessage('REVOKED'));
    });
    await waitFor(() => {
      expect(email).toHaveFocus();
    });
    expect(screen.getByText('Check these fields: Email.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Identity' })).toBeInTheDocument();

    await user.type(email, 'x');
    await waitFor(() => {
      expect(email).not.toHaveAccessibleDescription(memberEmailMessage('REVOKED'));
    });
  });

  it.each([
    [502, EMAIL_CHECK_FAILED],
    [401, SESSION_EXPIRED],
    [403, EMAIL_CHECK_REFUSED],
  ])(
    'says a failed check (%i) failed, never reading it as a free email (L1)',
    async (status, message) => {
      const user = userEvent.setup({ delay: null });
      fetchMock.mockImplementationOnce(() => answer(status, { message: 'upstream detail' }));
      renderWizard();
      await fillIdentity(user);

      await user.click(screen.getByRole('button', { name: 'Continue' }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText(message).closest('[role="alert"]')).toHaveFocus();
      });
      expect(screen.queryByText('upstream detail')).toBeNull();
      expect(screen.getByRole('heading', { level: 2, name: 'Identity' })).toBeInTheDocument();
    },
  );

  it.each([
    ['an unreadable answer', () => answer(200, { membershipStatus: 'GONE' })],
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])(
    'says the check failed after %s, never reading it as a free email (L1)',
    async (_case, reply) => {
      const user = userEvent.setup({ delay: null });
      fetchMock.mockImplementationOnce(reply);
      renderWizard();
      await fillIdentity(user);

      await user.click(screen.getByRole('button', { name: 'Continue' }));

      expect(await screen.findByText(EMAIL_CHECK_FAILED)).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText(EMAIL_CHECK_FAILED).closest('[role="alert"]')).toHaveFocus();
      });
      expect(screen.getByRole('heading', { level: 2, name: 'Identity' })).toBeInTheDocument();
    },
  );

  it('drops a failed check’s message once Continue refuses an emptied email', async () => {
    const user = userEvent.setup({ delay: null });
    fetchMock.mockImplementationOnce(() => answer(502, {}));
    renderWizard();
    await fillIdentity(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(EMAIL_CHECK_FAILED)).toBeInTheDocument();

    await user.clear(screen.getByRole('textbox', { name: 'Email' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Check these fields: Email.')).toBeInTheDocument();
    expect(screen.queryByText(EMAIL_CHECK_FAILED)).toBeNull();
  });

  it('focuses the check’s Alert again when a retried check fails too', async () => {
    const user = userEvent.setup({ delay: null });
    fetchMock
      .mockImplementationOnce(() => answer(502, {}))
      .mockImplementationOnce(() => answer(502, {}));
    renderWizard();
    await fillIdentity(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText(EMAIL_CHECK_FAILED).closest('[role="alert"]')).toHaveFocus();
    });

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByText(EMAIL_CHECK_FAILED).closest('[role="alert"]')).toHaveFocus();
    });
  });

  it('checks an email edited during its check again, never continuing with it unchecked', async () => {
    const user = userEvent.setup({ delay: null });
    let reply: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          reply = resolve;
        }),
    );
    renderWizard();
    await fillIdentity(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'x');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    reply(new Response(JSON.stringify({ membershipStatus: null }), { status: 200 }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });
    expect(screen.getByRole('heading', { level: 2, name: 'Identity' })).toBeInTheDocument();
    await next(user, 'Access');
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/tenant/users/invite-check?email=${encodeURIComponent(`${EMAIL}x`)}`,
    );
  });

  it('stays on Identity when another of its answers changes during the check', async () => {
    const user = userEvent.setup({ delay: null });
    let reply: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          reply = resolve;
        }),
    );
    renderWizard();
    await fillIdentity(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    const username = screen.getByRole('textbox', { name: 'Username' });
    await user.clear(username);
    await user.type(username, 'ne');

    reply(new Response(JSON.stringify({ membershipStatus: null }), { status: 200 }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });
    expect(screen.getByRole('heading', { level: 2, name: 'Identity' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Check these fields: Username.')).toBeInTheDocument();
  });

  it('drops an in-use answer about an email edited during its check', async () => {
    const user = userEvent.setup({ delay: null });
    let reply: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          reply = resolve;
        }),
    );
    renderWizard();
    await fillIdentity(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    const email = screen.getByRole('textbox', { name: 'Email' });
    await user.type(email, 'x');

    reply(new Response(JSON.stringify({ membershipStatus: 'ACTIVE' }), { status: 200 }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });
    expect(email).not.toHaveAccessibleDescription(memberEmailMessage('ACTIVE'));
    expect(screen.queryByText('Check these fields: Email.')).toBeNull();
  });

  it('drops a failed answer about an email edited during its check', async () => {
    const user = userEvent.setup({ delay: null });
    let reply: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          reply = resolve;
        }),
    );
    renderWizard();
    await fillIdentity(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'x');

    reply(new Response(JSON.stringify({}), { status: 502 }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });
    // The check failed for an email no longer in the field: nothing about it is said, and the next
    // Continue checks the edited one.
    expect(screen.queryByText(EMAIL_CHECK_FAILED)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Identity' })).toBeInTheDocument();
  });

  it('refuses a branch-scoped role at a branch they aren’t assigned to before Review', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();
    await fillIdentity(user);
    await next(user, 'Access');
    const branchRow = screen.getByRole('group', { name: 'Branch assignment 1' });
    await choose(user, 'Branch', 'Westlands Branch (WESTLANDS)', branchRow);
    const roleRow = screen.getByRole('group', { name: 'Role 1' });
    await choose(user, 'Role', 'Teller (TELLER)', roleRow);
    await choose(user, 'Scope', 'One branch', roleRow);
    await choose(user, 'Branch', 'Westlands Branch (WESTLANDS)', roleRow);
    // Their only branch changes after the role named it.
    await choose(user, 'Branch', 'Head Office (HEAD_OFFICE)', branchRow);

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Check these fields: Roles.')).toBeInTheDocument();
    expect(within(roleRow).getByRole('combobox', { name: 'Branch' })).toHaveAccessibleDescription(
      ROLE_BRANCH_UNASSIGNED,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Access' })).toBeInTheDocument();
  });

  it('focuses the failure Alert when the server refuses a whole list, which has no field to focus', async () => {
    const user = userEvent.setup({ delay: null });
    inviteUser.mockResolvedValueOnce({
      ok: false,
      formError: 'Check the highlighted fields and try again.',
      fieldErrors: { roleAssignments: NEEDS_A_ROLE },
      code: 'validation_failed',
      requestId: null,
    });
    renderWizard();
    await fillIdentity(user);
    await next(user, 'Access');
    await fillAccess(user);
    await next(user, 'Invitation');
    await next(user, 'Review');

    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    await screen.findByRole('heading', { level: 2, name: 'Access' });
    expect(screen.getByText(NEEDS_A_ROLE)).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByText('Check the highlighted fields and try again.').closest('[role="alert"]'),
      ).toHaveFocus();
    });
  });

  it('returns to a step from the review with its answers kept, and links Cancel to the directory', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/admin/users');
    await fillIdentity(user);
    await next(user, 'Access');
    await fillAccess(user);
    await next(user, 'Invitation');
    await next(user, 'Review');

    await user.click(screen.getByRole('button', { name: 'Edit identity' }));

    await screen.findByRole('heading', { level: 2, name: 'Identity' });
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Identity' })).toHaveFocus();
    });
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue(EMAIL);
    expect(screen.getByRole('combobox', { name: 'Membership type' })).toHaveTextContent('Staff');
  });

  it('clears a branch refusal that a membership change has made moot, before Access shows it again', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();
    await fillIdentity(user);
    await next(user, 'Access');
    await user.click(screen.getByRole('button', { name: 'Remove branch assignment 1' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(NEEDS_A_BRANCH)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('heading', { level: 2, name: 'Identity' });
    await choose(user, 'Membership type', 'Auditor');
    await next(user, 'Access');

    await waitFor(() => {
      expect(screen.queryByText(NEEDS_A_BRANCH)).toBeNull();
    });
  });
});

describe('InviteUserWizard: sending', () => {
  it('sends every answer once, returns to a server field error’s step, and retries with the same key', async () => {
    const user = userEvent.setup({ delay: null });
    inviteUser
      .mockResolvedValueOnce({
        ok: false,
        formError: 'Check the highlighted fields and try again.',
        fieldErrors: { 'roleAssignments.0.scopeType': 'Choose a scope.' },
        code: 'validation_failed',
        requestId: null,
      })
      .mockResolvedValueOnce({
        ok: false,
        formError: "The platform didn't respond as expected. Try again in a moment.",
        fieldErrors: {},
        code: null,
        requestId: 'req-5',
      });
    renderWizard();
    await fillIdentity(user);
    await next(user, 'Access');
    await fillAccess(user);
    await next(user, 'Invitation');
    await next(user, 'Review');
    expect(screen.getByRole('region', { name: 'Access' })).toHaveTextContent(
      'Westlands Branch (WESTLANDS) · Home',
    );
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    // The refused row's field, back on its step.
    expect(await screen.findByRole('heading', { level: 2, name: 'Access' })).toBeInTheDocument();
    const scope = within(screen.getByRole('group', { name: 'Role 1' })).getByRole('combobox', {
      name: 'Scope',
    });
    await waitFor(() => {
      expect(scope).toHaveAccessibleDescription('Choose a scope.');
    });
    await waitFor(() => {
      expect(scope).toHaveFocus();
    });
    expect(Object.fromEntries(inviteUser.mock.calls[0]?.[1] as FormData)).toEqual({
      idempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown,
      contextOrganisationId: ORG,
      displayName: 'Neema Wanjiku',
      email: EMAIL,
      username: 'neema.wanjiku',
      phone: '',
      membershipType: 'STAFF',
      primaryBranchId: '',
      branchAssignments: JSON.stringify([{ branchId: WESTLANDS, assignmentType: 'HOME' }]),
      roleAssignments: JSON.stringify([{ roleId: TELLER, scopeType: 'TENANT', branchId: '' }]),
      sendIdentityInvite: 'true',
      sendApplicationInvite: 'false',
    });

    // The refused row, corrected: the retry sends it under the same key.
    const role = screen.getByRole('group', { name: 'Role 1' });
    await choose(user, 'Scope', 'One branch', role);
    await choose(user, 'Branch', 'Westlands Branch (WESTLANDS)', role);

    await next(user, 'Invitation');
    await next(user, 'Review');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    // Nothing to return to: the failure's Alert takes focus, with its reference.
    const failed = (await screen.findByText(/Reference: req-5/)).closest('[role="alert"]');
    await waitFor(() => {
      expect(failed).toHaveFocus();
    });
    const [first, second] = inviteUser.mock.calls.map((call) => call[1] as FormData);
    // One key per wizard: the retry replays safely (spec §6.4).
    expect(second?.getAll('idempotencyKey')).toEqual([first?.get('idempotencyKey')]);
    expect(second?.get('roleAssignments')).toBe(
      JSON.stringify([{ roleId: TELLER, scopeType: 'BRANCH', branchId: WESTLANDS }]),
    );
  });

  it('shows a safe message, never the error text, when the action itself rejects', async () => {
    const user = userEvent.setup({ delay: null });
    inviteUser.mockRejectedValueOnce(new Error('socket hang up'));
    let fail: (error: Error) => void = () => undefined;
    inviteUser.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    renderWizard();
    await fillIdentity(user);
    await next(user, 'Access');
    await fillAccess(user);
    await next(user, 'Invitation');
    await next(user, 'Review');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    const alert = (await screen.findByText(/We couldn't confirm this change/)).closest(
      '[role="alert"]',
    );
    await waitFor(() => {
      expect(alert).toHaveFocus();
    });
    expect(screen.queryByText(/socket hang up/)).toBeNull();

    // A resend in flight: no second send, the stale Alert hidden, nothing moves the wizard under it.
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Send invitation' })).toBeDisabled();
    });
    for (const edit of screen.getAllByRole('button', { name: /^Edit / })) {
      expect(edit).toBeDisabled();
    }
    expect(screen.queryByText(/We couldn't confirm this change/)).toBeNull();
    fail(new Error('socket hang up'));

    const resent = (await screen.findByText(/We couldn't confirm this change/)).closest(
      '[role="alert"]',
    );
    await waitFor(() => {
      expect(resent).toHaveFocus();
    });
    expect(screen.queryByText(/socket hang up/)).toBeNull();
  });
});
