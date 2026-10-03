import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import {
  accountBlockedNote,
  MEMBERSHIP_MISSING,
  MEMBERSHIP_UNAVAILABLE,
  NO_MEMBERSHIP_VIEW,
  OWN_MEMBERSHIP,
  USER_MAKER_CHECKER_BLOCKED,
} from '@/modules/administration/users/user-rules';
import { renderWithProviders } from '@/test/test-utils';
import type { SelectedContextProfile } from '@/auth/context-service';

// A real SelectedContextProfile, checked by the type: the context could not be resolved.
const CONTEXT_NOT_SELECTED = {
  kind: 'redirect-to-context-selection',
  reason: 'invalid-context',
} satisfies SelectedContextProfile;

const { findUserMembership, getCurrentContextProfile, getUser, getUserInviter, router } =
  vi.hoisted(() => ({
    findUserMembership: vi.fn(),
    getCurrentContextProfile: vi.fn(),
    getUser: vi.fn(),
    getUserInviter: vi.fn(),
    // One stable router object, as in table-pagination-bar.test.tsx.
    router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  }));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  usePathname: () => '/admin/users/10000000-0000-4000-8000-00000000000d',
  useRouter: () => router,
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  getUser: (...args: unknown[]) => getUser(...args) as unknown,
  findUserMembership: (...args: unknown[]) => findUserMembership(...args) as unknown,
  getUserInviter: (...args: unknown[]) => getUserInviter(...args) as unknown,
}));
// The hero's dialogs import the Server Actions; nothing here submits one.
vi.mock('@/modules/administration/users/membership-actions', () => ({
  approveMembership: vi.fn(),
  reactivateMembership: vi.fn(),
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
  /** The signed-in user's own id, as `/auth/me` reports it. */
  signedInAs?: string;
  membershipStatus?: string;
  userStatus?: string;
  /** What the membership lookup settles with; an Error rejects it. */
  membership?: { id: string } | null | Error;
  /** What the inviter read settles with. */
  inviter?: string | null;
}

/** Programs every service the layout reads. A test names only what it varies. */
function setup({
  permissions = ALL_CODES,
  signedInAs = ME,
  membershipStatus = 'ACTIVE',
  userStatus = 'ACTIVE',
  membership = { id: MEMBERSHIP },
  inviter = null,
}: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { permissions, user_id: signedInAs },
    context: { organization: { id: ORG, name: 'Greenfield' }, branch: null },
  });
  getUser.mockResolvedValue({
    id: FELIX,
    username: 'felix.omondi',
    email: 'felix.omondi@greenfield.example',
    displayName: 'Felix Omondi',
    membershipStatus,
    userStatus,
  });
  if (membership instanceof Error) findUserMembership.mockRejectedValue(membership);
  else findUserMembership.mockResolvedValue(membership);
  getUserInviter.mockResolvedValue(inviter);
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
    setup({ membershipStatus: 'PENDING_APPROVAL', userStatus: 'PROVISIONING_IDP' });

    await show();

    expect(screen.getByText('Provisioning identity')).toBeInTheDocument();
    expect(screen.getByText('Membership pending approval')).toBeInTheDocument();
    expect(screen.queryByText(/idp/i)).not.toBeInTheDocument();
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

  it('offers the Overview alone when the context did not resolve', async () => {
    setup();
    getCurrentContextProfile.mockResolvedValue(CONTEXT_NOT_SELECTED);

    await show();

    expect(tabNames()).toEqual(['Overview']);
  });
});

describe('UserRecordLayout: the membership actions', () => {
  it("offers the membership's actions, found by the record's own id and email", async () => {
    setup();

    await show();

    expect(findUserMembership).toHaveBeenCalledWith(FELIX, 'felix.omondi@greenfield.example');
    expect(button('Suspend')).toBeEnabled();
    expect(button('Revoke')).toBeEnabled();
    expect(screen.queryByText(MEMBERSHIP_MISSING)).not.toBeInTheDocument();
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

  it("disables Approve for the user's inviter, with the reason, after asking who invited them", async () => {
    setup({ membershipStatus: 'PENDING_APPROVAL', userStatus: 'DRAFT', inviter: ME });

    await show();

    expect(getUserInviter).toHaveBeenCalledWith(FELIX);
    expect(button('Approve')).toBeDisabled();
    expect(button('Approve')).toHaveAccessibleDescription(USER_MAKER_CHECKER_BLOCKED);
    // Rejecting is not approving: it stays available.
    expect(button('Reject & revoke')).toBeEnabled();
  });

  it('leaves Approve enabled when someone else invited them (the control for the case above)', async () => {
    setup({ membershipStatus: 'PENDING_APPROVAL', userStatus: 'DRAFT', inviter: VICTOR });

    await show();

    expect(getUserInviter).toHaveBeenCalledWith(FELIX);
    expect(button('Approve')).toBeEnabled();
    expect(screen.queryByText(USER_MAKER_CHECKER_BLOCKED)).not.toBeInTheDocument();
  });

  it('does not look up the inviter without audit.view, and leaves Approve enabled (the backend explains a 403)', async () => {
    setup({
      permissions: without('audit.view'),
      membershipStatus: 'PENDING_APPROVAL',
      userStatus: 'DRAFT',
      inviter: ME,
    });

    await show();

    expect(getUserInviter).not.toHaveBeenCalled();
    expect(button('Approve')).toBeEnabled();
  });

  it('does not look up the inviter when Approve is not on offer', async () => {
    setup({ membershipStatus: 'ACTIVE', inviter: ME });

    await show();

    expect(button('Suspend')).toBeInTheDocument(); // the hero did render its actions
    expect(button('Approve')).not.toBeInTheDocument();
    expect(getUserInviter).not.toHaveBeenCalled();
  });

  it('does not ask who invited them when no membership was found, since no action is on offer', async () => {
    setup({
      membershipStatus: 'PENDING_APPROVAL',
      userStatus: 'DRAFT',
      membership: null,
      inviter: ME,
    });

    await show();

    expect(screen.getByText(MEMBERSHIP_MISSING)).toBeInTheDocument(); // the lookup did run
    expect(button('Approve')).not.toBeInTheDocument();
    expect(getUserInviter).not.toHaveBeenCalled();
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

  it('says why there are no actions without membership.view, and looks nothing up', async () => {
    setup({ permissions: without('membership.view') });

    await show();

    expect(screen.getByText(NO_MEMBERSHIP_VIEW)).toBeInTheDocument();
    expect(findUserMembership).not.toHaveBeenCalled();
    expect(button('Suspend')).not.toBeInTheDocument();
    expect(button('Revoke')).not.toBeInTheDocument();
  });

  it('says the membership was not found, and offers nothing, when the lookup finds none', async () => {
    setup({ membership: null });

    await show();

    expect(screen.getByText(MEMBERSHIP_MISSING)).toBeInTheDocument();
    expect(screen.queryByText(MEMBERSHIP_UNAVAILABLE)).not.toBeInTheDocument();
    expect(button('Suspend')).not.toBeInTheDocument();
    expect(button('Revoke')).not.toBeInTheDocument();
  });

  it('says the membership could not be loaded, and offers nothing, when the lookup fails', async () => {
    setup({ membership: new BackendApiError(500, { requestId: 'req-2' }) });

    await show();

    expect(screen.getByText(MEMBERSHIP_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.queryByText(MEMBERSHIP_MISSING)).not.toBeInTheDocument();
    expect(button('Suspend')).not.toBeInTheDocument();
    expect(button('Revoke')).not.toBeInTheDocument();
    // The hero itself still renders: the failure only degrades its actions.
    expect(screen.getByRole('heading', { level: 1, name: 'Felix Omondi' })).toBeInTheDocument();
  });

  it('shows neither actions nor a note to a holder with no lifecycle code', async () => {
    setup({
      permissions: ['membership.view', 'role_assignment.view'],
      membershipStatus: 'ACTIVE',
    });

    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Felix Omondi' })).toBeInTheDocument();
    expect(findUserMembership).toHaveBeenCalledTimes(1); // it was looked up and found
    expect(button('Suspend')).not.toBeInTheDocument();
    expect(button('Revoke')).not.toBeInTheDocument();
    for (const note of [NO_MEMBERSHIP_VIEW, MEMBERSHIP_MISSING, MEMBERSHIP_UNAVAILABLE]) {
      expect(screen.queryByText(note)).not.toBeInTheDocument();
    }
  });
});
