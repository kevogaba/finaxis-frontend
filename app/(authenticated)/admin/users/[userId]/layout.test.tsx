import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import { SELF_APPROVAL_NOTE_USERS } from '@/modules/administration/approvals/maker-checker';
import {
  accountBlockedNote,
  NO_MEMBERSHIP_VIEW,
  OWN_MEMBERSHIP,
  USER_MAKER_CHECKER_BLOCKED,
} from '@/modules/administration/users/user-rules';
import { renderWithProviders } from '@/test/test-utils';
import { permissionScopes } from '@/test/permission-scopes';
import type { SelectedContextProfile } from '@/auth/context-service';

// A real SelectedContextProfile, checked by the type: the context could not be resolved.
const CONTEXT_NOT_SELECTED = {
  kind: 'redirect-to-context-selection',
  reason: 'invalid-context',
} satisfies SelectedContextProfile;

const {
  getCurrentContextProfile,
  getMembership,
  getUser,
  readMakerCheckerSwitch,
  redirect,
  router,
} = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  getMembership: vi.fn(),
  getUser: vi.fn(),
  readMakerCheckerSwitch: vi.fn(),
  redirect: vi.fn(),
  // One stable router object, as in table-pagination-bar.test.tsx.
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => redirect(to) as unknown,
  usePathname: () => '/admin/users/10000000-0000-4000-8000-00000000000d',
  useRouter: () => router,
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  getMembership: (...args: unknown[]) => getMembership(...args) as unknown,
  getUser: (...args: unknown[]) => getUser(...args) as unknown,
}));
vi.mock('@/modules/administration/settings/settings-service', () => ({
  readMakerCheckerSwitch: (...args: unknown[]) => readMakerCheckerSwitch(...args) as unknown,
}));
// The hero's dialogs import the Server Actions; nothing here submits one.
vi.mock('@/modules/administration/users/membership-actions', () => ({
  approveMembership: vi.fn(),
  reactivateMembership: vi.fn(),
  resendInvitation: vi.fn(),
  retryInvitation: vi.fn(),
  revokeMembership: vi.fn(),
  suspendMembership: vi.fn(),
}));

const { default: UserRecordLayout } = await import('./layout');

const FELIX = '10000000-0000-4000-8000-00000000000d';
const ME = '10000000-0000-4000-8000-0000000000aa'; // the signed-in administrator, not Felix
const VICTOR = '10000000-0000-4000-8000-000000000001'; // someone who invited Felix
const MEMBERSHIP = '10000000-0000-4000-8000-00000000000e';
const ORG = '55555555-5555-4555-8555-555555555555';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ALL_CODES = [
  'membership.view',
  'user.approve',
  'membership.suspend',
  'membership.reactivate',
  'membership.revoke',
  'audit.view',
  'role_assignment.view',
  'branch_assignment.view',
];
const without = (...codes: string[]) => ALL_CODES.filter((code) => !codes.includes(code));

interface Setup {
  permissions?: string[];
  /** Codes held only at a branch, which All branches doesn't select: in `/auth/me`'s scopes, not its
   * `permissions`. */
  elsewhere?: string[];
  /** The signed-in user's own id, as `/auth/me` reports it. */
  signedInAs?: string;
  membershipStatus?: string;
  userStatus?: string;
  /** The record's inviter id (`created_by`, BG-08); null for the system, or someone hidden. */
  inviter?: string | null;
  /** `require_maker_checker_for_user_invites`, as the reader answers it. */
  switchState?: 'on' | 'off' | 'unknown';
  /** The membership's `invitation.status` (BG-11), or an Error that rejects its read. */
  invitation?: string | null | Error;
}

/** Programs every service the layout reads. A test names only what it varies. */
function setup({
  permissions = ALL_CODES,
  elsewhere = [],
  signedInAs = ME,
  membershipStatus = 'ACTIVE',
  userStatus = 'ACTIVE',
  inviter = null,
  switchState = 'on',
  invitation = 'IN_PROGRESS',
}: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: {
      permissions,
      permission_scopes: [
        ...permissionScopes(permissions),
        ...permissionScopes(elsewhere, elsewhere),
      ],
      user_id: signedInAs,
    },
    context: { organization: { id: ORG, name: 'Greenfield' }, branch: null },
  });
  getUser.mockResolvedValue({
    id: FELIX,
    username: 'felix.omondi',
    email: 'felix.omondi@greenfield.example',
    displayName: 'Felix Omondi',
    membershipStatus,
    userStatus,
    membershipId: MEMBERSHIP,
    createdBy: inviter === null ? null : { id: inviter, displayName: null },
  });
  readMakerCheckerSwitch.mockResolvedValue(switchState);
  if (invitation instanceof Error) getMembership.mockRejectedValue(invitation);
  else {
    getMembership.mockResolvedValue({
      id: MEMBERSHIP,
      status: membershipStatus,
      invitation:
        invitation === null
          ? null
          : { status: invitation, attempts: 3, lastErrorCode: 'CONFLICT', updatedAt: null },
    });
  }
}

async function show(userId = FELIX, children: ReactNode = <p>Tab body</p>) {
  const element = await UserRecordLayout({ children, params: Promise.resolve({ userId }) });
  return renderWithProviders(element);
}

const hidden = (name: string, root: ParentNode) =>
  root.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;
const sections = () => screen.getByRole('navigation', { name: 'Felix Omondi sections' });
const tabNames = () =>
  within(sections())
    .getAllByRole('tab')
    .map((tab) => tab.textContent);
const button = (name: string) => screen.queryByRole('button', { name });

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('UserRecordLayout: the record', () => {
  it('shows the person, their onboarding state and membership status, with the tab body below', async () => {
    setup();

    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Felix Omondi' })).toBeInTheDocument();
    expect(screen.getByText('felix.omondi · felix.omondi@greenfield.example')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to users' })).toHaveAttribute(
      'href',
      '/admin/users',
    );
    // The two hero chips, in words (their source and order are pinned by the next test).
    expect(screen.getByText('Active', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(screen.getByText('Membership active')).toBeInTheDocument();
    expect(screen.getByText('Tab body')).toBeInTheDocument();
  });

  // Task 1's onboarding table, as literals. Every row's onboarding label differs from the account
  // status's own wording, so a hero that showed the account status (or swapped the two chips) fails.
  it.each([
    ['PENDING_APPROVAL', 'DRAFT', 'Awaiting approval', 'Membership pending approval'],
    ['ACTIVE', 'INVITED', 'Awaiting first sign-in', 'Membership active'],
    ['PENDING_APPROVAL', 'LOCKED', 'Account locked', 'Membership pending approval'],
    ['ACTIVE', 'DRAFT', 'Account not ready', 'Membership active'],
    ['REVOKED', 'ACTIVE', 'Revoked', 'Membership revoked'],
  ])(
    'heads a %s membership of a %s account with its onboarding state, then the membership status',
    async (membershipStatus, userStatus, onboarding, membership) => {
      setup({ membershipStatus, userStatus });

      await show();

      expect(
        screen.getAllByText(/./, { selector: '.MuiChip-label' }).map((chip) => chip.textContent),
      ).toEqual([onboarding, membership]);
    },
  );

  it('names a user whose identity is still being provisioned in words, never "Provisioning idp"', async () => {
    // An invitation that couldn't be read: the account's own status is all that is known.
    setup({
      membershipStatus: 'PENDING_APPROVAL',
      userStatus: 'PROVISIONING_IDP',
      invitation: null,
    });

    await show();

    expect(screen.getByText('Provisioning identity')).toBeInTheDocument();
    expect(screen.getByText('Membership pending approval')).toBeInTheDocument();
    expect(screen.queryByText(/idp/i)).not.toBeInTheDocument();
  });

  // BG-11: the membership's invitation splits it, read only for a provisioning pending member.
  it.each([
    ['IN_PROGRESS', 'Identity in progress'],
    ['FAILED', 'Identity failed'],
    [null, 'Provisioning identity'],
    [new BackendApiError(500, {}), 'Provisioning identity'],
  ])('heads a provisioning member whose invitation is %s with "%s"', async (invitation, chip) => {
    setup({ membershipStatus: 'PENDING_APPROVAL', userStatus: 'PROVISIONING_IDP', invitation });

    await show();

    expect(getMembership).toHaveBeenCalledWith(MEMBERSHIP);
    expect(
      screen.getAllByText(/./, { selector: '.MuiChip-label' }).map((label) => label.textContent),
    ).toEqual([chip, 'Membership pending approval']);
  });

  it('reads no membership for any other member, or without membership.view tenant-wide', async () => {
    setup({ membershipStatus: 'PENDING_APPROVAL', userStatus: 'DRAFT' });
    await show();
    setup({ membershipStatus: 'ACTIVE', userStatus: 'INVITED' });
    await show();
    setup({
      membershipStatus: 'PENDING_APPROVAL',
      userStatus: 'PROVISIONING_IDP',
      permissions: without('membership.view'),
    });
    await show();
    // BG-33: the platform checks it tenant-wide, so a branch grant reads nothing.
    setup({
      membershipStatus: 'PENDING_APPROVAL',
      userStatus: 'PROVISIONING_IDP',
      permissions: without('membership.view'),
      elsewhere: ['membership.view'],
    });
    await show();

    expect(getMembership).not.toHaveBeenCalled();
  });

  it('answers a record the backend does not have with not-found', async () => {
    setup();
    getUser.mockRejectedValue(new BackendApiError(404, { code: 'resource_not_found' }));

    await expect(
      UserRecordLayout({ children: <p>Tab body</p>, params: Promise.resolve({ userId: FELIX }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('shows the forbidden state, under the only h1, when the record cannot be read', async () => {
    setup();
    getUser.mockRejectedValue(new BackendApiError(403, { code: 'forbidden' }));

    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'User record' })).toBeInTheDocument();
    expect(screen.getByText("You don't have permission")).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    // Neither the hero, the tabs nor the tab body is shown over a record that did not load.
    expect(screen.queryByRole('navigation', { name: /sections$/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Tab body')).not.toBeInTheDocument();
  });

  it('shows the error state, with its reference, for any other failure', async () => {
    setup();
    getUser.mockRejectedValue(new BackendApiError(500, { requestId: 'req-1' }));

    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'User record' })).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Reference: req-1')).toBeInTheDocument();
    expect(screen.queryByText("You don't have permission")).not.toBeInTheDocument();
    expect(screen.queryByText('Tab body')).not.toBeInTheDocument();
  });
});

describe('UserRecordLayout: the tabs', () => {
  it('lists every section the holder can read, linked by the lower-case id', async () => {
    setup();

    await show(FELIX.toUpperCase());

    expect(tabNames()).toEqual(['Overview', 'Roles & access', 'Branch assignments', 'Audit']);
    expect(
      within(sections())
        .getAllByRole('tab')
        .map((tab) => tab.getAttribute('href')),
    ).toEqual([
      `/admin/users/${FELIX}`,
      `/admin/users/${FELIX}/access`,
      `/admin/users/${FELIX}/branches`,
      `/admin/users/${FELIX}/audit`,
    ]);
  });

  it.each([
    ['role_assignment.view', 'Roles & access'],
    ['branch_assignment.view', 'Branch assignments'],
    ['audit.view', 'Audit'],
  ])('hides the %s section, and only it, without that code', async (code, tab) => {
    setup({ permissions: without(code) });

    await show();

    expect(tabNames()).not.toContain(tab);
    expect(tabNames()).toHaveLength(3);
    expect(tabNames()[0]).toBe('Overview');
  });

  // BG-03: the search by user answers with every branch a grant covers, at All branches too.
  it('offers Branch assignments at All branches to a view held only through a branch grant', async () => {
    setup({
      permissions: without('branch_assignment.view'),
      elsewhere: ['branch_assignment.view'],
    });

    await show();

    expect(tabNames()).toEqual(['Overview', 'Roles & access', 'Branch assignments', 'Audit']);
  });

  it('offers the Overview alone when the context did not resolve', async () => {
    setup();
    getCurrentContextProfile.mockResolvedValue(CONTEXT_NOT_SELECTED);

    await show();

    expect(tabNames()).toEqual(['Overview']);
  });
});

describe('UserRecordLayout: the membership actions', () => {
  // BG-09: the user read carries the membership's id, so nothing is looked up.
  it("offers the membership's actions by the id the user read carries", async () => {
    setup();

    await show();

    expect(getUser).toHaveBeenCalledTimes(1);
    expect(button('Suspend')).toBeEnabled();
    expect(button('Revoke')).toBeEnabled();
    expect(screen.queryByText(NO_MEMBERSHIP_VIEW)).not.toBeInTheDocument();
  });

  it('carries the membership, the rendered organisation and a minted key into each dialog (rule 6)', async () => {
    const user = userEvent.setup();
    setup();
    await show();

    await user.click(screen.getByRole('button', { name: 'Suspend' }));

    const dialog = await screen.findByRole('dialog', { name: 'Suspend Felix Omondi?' });
    expect(hidden('membershipId', dialog)).toBe(MEMBERSHIP);
    expect(hidden('contextOrganisationId', dialog)).toBe(ORG);
    expect(hidden('idempotencyKey', dialog)).toMatch(UUID);
  });

  // Layer 12, P-3: a 202 approval keeps the membership pending and moves only the user, so Reject &
  // revoke carries the account status this layout rendered (including a provisioning record, which
  // 10 deliberately leaves revocable). A plain Revoke names none.
  it.each(['DRAFT', 'PROVISIONING_IDP'])(
    'names the rendered %s user status in Reject & revoke, with the expected membership status',
    async (userStatus) => {
      const user = userEvent.setup();
      setup({ membershipStatus: 'PENDING_APPROVAL', userStatus });
      await show();

      await user.click(screen.getByRole('button', { name: 'Reject & revoke' }));

      const dialog = await screen.findByRole('alertdialog', {
        name: 'Reject and revoke Felix Omondi?',
      });
      expect(hidden('expectedStatus', dialog)).toBe('PENDING_APPROVAL');
      expect(hidden('expectedUserStatus', dialog)).toBe(userStatus);
    },
  );

  // BG-11: Retry in Approve's place once provisioning failed, never both.
  it('offers Retry provisioning, not Approve, once creating the identity failed', async () => {
    const user = userEvent.setup();
    setup({
      membershipStatus: 'PENDING_APPROVAL',
      userStatus: 'PROVISIONING_IDP',
      invitation: 'FAILED',
      inviter: ME, // the inviter may retry: it is no approval
    });
    await show();

    expect(button('Approve')).toBeNull();
    expect(button('Retry provisioning')).toBeEnabled();
    expect(button('Reject & revoke')).toBeEnabled();
    expect(readMakerCheckerSwitch).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Retry provisioning' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Retry identity provisioning for Felix Omondi?',
    });
    expect(hidden('membershipId', dialog)).toBe(MEMBERSHIP);
    expect(hidden('contextOrganisationId', dialog)).toBe(ORG);
    expect(hidden('idempotencyKey', dialog)).toMatch(UUID);
  });

  it.each([
    ['in progress', 'IN_PROGRESS'],
    ['unread', new BackendApiError(500, {})],
  ])('offers neither Approve nor Retry while provisioning is %s', async (_case, invitation) => {
    setup({ membershipStatus: 'PENDING_APPROVAL', userStatus: 'PROVISIONING_IDP', invitation });
    await show();

    expect(button('Approve')).toBeNull();
    expect(button('Retry provisioning')).toBeNull();
    expect(button('Reject & revoke')).toBeEnabled();
  });

  it('offers Resend invitation to an invited account with user.invite and its views', async () => {
    setup({
      membershipStatus: 'ACTIVE',
      userStatus: 'INVITED',
      permissions: [...ALL_CODES, 'user.invite', 'user.view'],
    });
    await show();

    expect(button('Resend invitation')).toBeEnabled();
    setup({
      membershipStatus: 'ACTIVE',
      userStatus: 'INVITED',
      permissions: [...ALL_CODES, 'user.invite'],
    });
    await show();
    // Without user.view, which user.invite implies (ADR 0030), only the first render offers it.
    expect(screen.getAllByRole('button', { name: 'Resend invitation' })).toHaveLength(1);
  });

  it('names no expected status of any kind in a plain Revoke', async () => {
    const user = userEvent.setup();
    setup();
    await show();

    await user.click(screen.getByRole('button', { name: 'Revoke' }));

    const dialog = await screen.findByRole('alertdialog', {
      name: "Revoke Felix Omondi's membership?",
    });
    expect(hidden('membershipId', dialog)).toBe(MEMBERSHIP);
    expect(hidden('expectedStatus', dialog)).toBeUndefined();
    expect(hidden('expectedUserStatus', dialog)).toBeUndefined();
  });

  it('disables Suspend and Revoke on your own record, with the reason', async () => {
    setup({ signedInAs: FELIX });

    await show();

    for (const name of ['Suspend', 'Revoke']) {
      expect(button(name)).toBeDisabled();
      expect(button(name)).toHaveAccessibleDescription(OWN_MEMBERSHIP);
    }
  });

  it("leaves them enabled on someone else's record (the control for the case above)", async () => {
    setup({ signedInAs: ME });

    await show();

    expect(button('Suspend')).toBeEnabled();
    expect(button('Revoke')).toBeEnabled();
    expect(screen.queryByText(OWN_MEMBERSHIP)).not.toBeInTheDocument();
  });

  // BG-08: the inviter is the record's `created_by`; the switch decides (decision Q4).
  it("disables Approve for the user's inviter while maker-checker is on, with the reason", async () => {
    setup({ membershipStatus: 'PENDING_APPROVAL', userStatus: 'DRAFT', inviter: ME });

    await show();

    expect(readMakerCheckerSwitch).toHaveBeenCalledExactlyOnceWith(
      'user_invites',
      expect.objectContaining({ permissions: ALL_CODES }),
    );
    expect(button('Approve')).toBeDisabled();
    expect(button('Approve')).toHaveAccessibleDescription(USER_MAKER_CHECKER_BLOCKED);
    // Rejecting is not approving: it stays available.
    expect(button('Reject & revoke')).toBeEnabled();
  });

  it('lets the inviter approve while maker-checker is off, saying so above the actions', async () => {
    setup({
      membershipStatus: 'PENDING_APPROVAL',
      userStatus: 'DRAFT',
      inviter: ME,
      switchState: 'off',
    });

    await show();

    expect(button('Approve')).toBeEnabled();
    expect(screen.getByRole('note')).toHaveTextContent(SELF_APPROVAL_NOTE_USERS);
    // Tabbing to Approve reads the warning too.
    expect(button('Approve')).toHaveAccessibleDescription(SELF_APPROVAL_NOTE_USERS);
  });

  it('leaves Approve enabled for the inviter when the switch can’t be read, for the platform to decide', async () => {
    setup({
      membershipStatus: 'PENDING_APPROVAL',
      userStatus: 'DRAFT',
      inviter: ME,
      switchState: 'unknown',
    });

    await show();

    expect(button('Approve')).toBeEnabled();
    expect(screen.queryByText(USER_MAKER_CHECKER_BLOCKED)).not.toBeInTheDocument();
    expect(screen.queryByText(SELF_APPROVAL_NOTE_USERS)).not.toBeInTheDocument();
  });

  it('leaves Approve enabled when someone else invited them, reading no switch', async () => {
    setup({ membershipStatus: 'PENDING_APPROVAL', userStatus: 'DRAFT', inviter: VICTOR });

    await show();

    expect(readMakerCheckerSwitch).not.toHaveBeenCalled();
    expect(button('Approve')).toBeEnabled();
    expect(screen.queryByText(USER_MAKER_CHECKER_BLOCKED)).not.toBeInTheDocument();
  });

  it('knows its inviter from the record without audit.view', async () => {
    setup({
      permissions: without('audit.view'),
      membershipStatus: 'PENDING_APPROVAL',
      userStatus: 'DRAFT',
      inviter: ME,
    });

    await show();

    expect(button('Approve')).toBeDisabled();
  });

  it('reads no switch when Approve is not on offer', async () => {
    setup({ membershipStatus: 'ACTIVE', inviter: ME });

    await show();

    expect(button('Suspend')).toBeInTheDocument(); // the hero did render its actions
    expect(button('Approve')).not.toBeInTheDocument();
    expect(readMakerCheckerSwitch).not.toHaveBeenCalled();
  });

  it('withholds Approve for a user whose identity is being provisioned, and keeps Reject & revoke', async () => {
    setup({ membershipStatus: 'PENDING_APPROVAL', userStatus: 'PROVISIONING_IDP' });

    await show();

    expect(button('Approve')).not.toBeInTheDocument();
    expect(button('Reject & revoke')).toBeEnabled();
  });

  it("disables Approve, with the reason, for a user whose account can't be approved", async () => {
    setup({ membershipStatus: 'PENDING_APPROVAL', userStatus: 'LOCKED' });

    await show();

    expect(button('Approve')).toBeDisabled();
    expect(button('Approve')).toHaveAccessibleDescription(accountBlockedNote('LOCKED'));
  });

  it('says why there are no actions without membership.view', async () => {
    setup({ permissions: without('membership.view') });

    await show();

    expect(screen.getByText(NO_MEMBERSHIP_VIEW)).toBeInTheDocument();
    expect(button('Suspend')).not.toBeInTheDocument();
    expect(button('Revoke')).not.toBeInTheDocument();
  });

  it('shows neither actions nor a note to a holder with no lifecycle code', async () => {
    setup({
      permissions: ['membership.view', 'role_assignment.view'],
      membershipStatus: 'ACTIVE',
    });

    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Felix Omondi' })).toBeInTheDocument();
    expect(button('Suspend')).not.toBeInTheDocument();
    expect(button('Revoke')).not.toBeInTheDocument();
    expect(screen.queryByText(NO_MEMBERSHIP_VIEW)).not.toBeInTheDocument();
  });
});
