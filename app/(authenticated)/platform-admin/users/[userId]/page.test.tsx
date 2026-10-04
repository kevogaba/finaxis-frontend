import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import type { SelectedContextProfile } from '@/auth/context-service';
import {
  accountScopeNote,
  ACCOUNT_DEACTIVATED_NOTE,
  OWN_ACCOUNT,
} from '@/modules/platform-administration/users/account-rules';
import { renderWithProviders } from '@/test/test-utils';

// A real SelectedContextProfile, checked by the type: the context could not be resolved.
const CONTEXT_NOT_SELECTED = {
  kind: 'redirect-to-context-selection',
  reason: 'invalid-context',
} satisfies SelectedContextProfile;

// Lettered, so their upper-case forms differ from them (Ruling 4).
const USER = '17000000-0000-4000-8000-0000000000a7';
const ME = '17000000-0000-4000-8000-0000000000ef'; // the signed-in platform administrator
const PLATFORM = '00000000-0000-0000-0000-000000000000';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ALL_CODES = ['user.view', 'user.suspend', 'user.activate', 'user.deactivate'];
const EYEBROW = 'Platform administration · Platform user';

// Every read the platform's user pages could make, so "only through getPlatformUser" is checked
// against all of them at once: a read added later through another service must be listed here.
const reads = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  getPlatformUser: vi.fn(),
  getInstitutionUser: vi.fn(),
  listInstitutionUsers: vi.fn(),
  listPlatformUsers: vi.fn(),
  getTenant: vi.fn(),
}));
const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => redirect(to) as unknown,
  usePathname: () => `/platform-admin/users/${USER}`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: (...args: unknown[]) =>
    reads.getCurrentContextProfile(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/users/institution-user-service', () => ({
  getPlatformUser: (...args: unknown[]) => reads.getPlatformUser(...args) as unknown,
  getInstitutionUser: (...args: unknown[]) => reads.getInstitutionUser(...args) as unknown,
  listInstitutionUsers: (...args: unknown[]) => reads.listInstitutionUsers(...args) as unknown,
  listPlatformUsers: (...args: unknown[]) => reads.listPlatformUsers(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/tenants/tenant-service', () => ({
  getTenant: (...args: unknown[]) => reads.getTenant(...args) as unknown,
}));
// The hero's dialogs import the Server Actions; nothing here submits one.
vi.mock('@/modules/platform-administration/users/account-actions', () => ({
  deactivateAccount: vi.fn(),
  reactivateAccount: vi.fn(),
  suspendAccount: vi.fn(),
}));

const { default: PlatformUserPage } = await import('./page');

interface Setup {
  permissions?: string[];
  /** The signed-in user's own id, as `/auth/me` reports it. */
  signedInAs?: string;
  userStatus?: string;
  /** What the user read rejects with, when it fails. */
  user?: Error;
}

/** Programs the reads the page makes. A test names only what it varies. */
function setup({
  permissions = ALL_CODES,
  signedInAs = ME,
  userStatus = 'ACTIVE',
  user,
}: Setup = {}) {
  reads.getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { permissions, user_id: signedInAs },
    context: { organization: { id: PLATFORM, name: 'Platform' }, branch: null },
  });
  if (user) reads.getPlatformUser.mockRejectedValue(user);
  else {
    reads.getPlatformUser.mockResolvedValue({
      id: USER,
      username: 'esi.mensah',
      email: 'esi.mensah@platform.example',
      displayName: 'Esi Mensah',
      userStatus,
      membershipStatus: 'ACTIVE',
    });
  }
}

const render = (userId = USER) => PlatformUserPage({ params: Promise.resolve({ userId }) });
async function show(userId = USER) {
  return renderWithProviders(await render(userId));
}

const button = (name: string) => screen.queryByRole('button', { name });

function expectNothingRead() {
  for (const [name, read] of Object.entries(reads)) expect(read, name).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('PlatformUserPage: the record', () => {
  it('shows the person as a platform user, with the platform variant of the account note', async () => {
    setup();

    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Esi Mensah' })).toBeInTheDocument();
    expect(screen.getByText(EYEBROW)).toBeVisible();
    expect(screen.getByText('esi.mensah · esi.mensah@platform.example')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to platform users' })).toHaveAttribute(
      'href',
      '/platform-admin/users',
    );
    expect(screen.getByText('Membership in the platform organisation')).toBeVisible();
    // scope="platform": the institution's own sentence has no place on a platform user.
    expect(screen.getByRole('note')).toHaveTextContent(accountScopeNote('platform'));
    expect(screen.getByRole('note')).not.toHaveTextContent('Their membership here');
  });

  it('reads only through getPlatformUser, with the id as the backend knows it', async () => {
    setup();

    await show();

    expect(reads.getPlatformUser).toHaveBeenCalledTimes(1);
    expect(reads.getPlatformUser).toHaveBeenCalledWith(USER);
    // The profile is the page's one other read; no institution, directory or tenant read.
    expect(reads.getCurrentContextProfile).toHaveBeenCalledTimes(1);
    for (const name of [
      'getInstitutionUser',
      'listInstitutionUsers',
      'listPlatformUsers',
      'getTenant',
    ] as const) {
      expect(reads[name], name).not.toHaveBeenCalled();
    }
  });

  it('reads an upper-case id in lower case, and in no other (the positive control for the guard)', async () => {
    setup();

    await show(USER.toUpperCase());

    expect(reads.getPlatformUser).toHaveBeenCalledWith(USER);
    expect(JSON.stringify(reads.getPlatformUser.mock.calls)).not.toContain(USER.toUpperCase());
    expect(screen.getByRole('heading', { level: 1, name: 'Esi Mensah' })).toBeInTheDocument();
  });

  it.each([
    ['a malformed id', 'not-a-uuid'],
    ['a path-like id', '../x'],
    ['an id with a tail', `${USER}x`],
    ['an id with a prefix', `x${USER}`],
    ['an empty id', ''],
  ])('answers %s with not-found, before any read', async (_case, userId) => {
    await expect(render(userId)).rejects.toThrow('NEXT_NOT_FOUND');

    expectNothingRead();
  });

  it('answers a user the backend does not have with not-found and no record', async () => {
    setup({ user: new BackendApiError(404, { code: 'resource_not_found' }) });

    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('shows the forbidden state, under the only h1, when the record cannot be read', async () => {
    setup({ user: new BackendApiError(403, { code: 'forbidden' }) });

    await show();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Platform user' })).toBeInTheDocument();
    expect(screen.getByText(EYEBROW)).toBeVisible();
    expect(screen.getByText("You don't have permission")).toBeVisible();
    expect(screen.queryByText('Something went wrong')).toBeNull();
    // Neither the hero nor its actions are shown over a record that did not load.
    expect(screen.queryByRole('link', { name: 'Back to platform users' })).toBeNull();
    expect(button('Suspend account')).toBeNull();
  });

  it('shows the error state, with its reference, for a 5xx, and never not-found', async () => {
    setup({ user: new BackendApiError(503, { requestId: 'req-p' }) });

    // A transient failure is not an absent record: the page renders, it does not throw not-found.
    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Platform user' })).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeVisible();
    expect(screen.getByText('Reference: req-p')).toBeVisible();
    expect(screen.queryByText("You don't have permission")).toBeNull();
    expect(button('Suspend account')).toBeNull();
  });

  // AGENTS.md: a page settles a read with load(), which redirects on a lost session or a stale
  // context rather than rendering a failure.
  it.each([
    ['a 401', new BackendApiError(401), '/login?reason=session_expired'],
    [
      'a stale context',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      '/select-context',
    ],
  ])('redirects, rendering nothing, when the user read fails with %s', async (_n, failure, to) => {
    setup({ user: failure });

    await expect(render()).rejects.toThrow(`NEXT_REDIRECT:${to}`);

    expect(redirect).toHaveBeenCalledTimes(1);
  });
});

describe('PlatformUserPage: your own account', () => {
  it("disables Suspend and Deactivate on your own record, comparing the profile's id with the read's", async () => {
    // The profile's id in upper case, the read's in lower: one case on both sides (Ruling 6).
    setup({ signedInAs: USER.toUpperCase() });

    await show();

    for (const name of ['Suspend account', 'Deactivate account']) {
      expect(button(name)).toBeDisabled();
      expect(button(name)).toHaveAccessibleDescription(OWN_ACCOUNT);
    }
    expect(screen.getAllByText(OWN_ACCOUNT)).toHaveLength(1);
  });

  it("leaves them enabled on someone else's record, for a holder of every code (the control)", async () => {
    // The route names this person and so does the read; only the profile's id decides.
    setup({ signedInAs: ME });

    await show();

    expect(button('Suspend account')).toBeEnabled();
    expect(button('Deactivate account')).toBeEnabled();
    expect(screen.queryByText(OWN_ACCOUNT)).toBeNull();
  });
});

describe('PlatformUserPage: what the holder can do', () => {
  it("offers only the actions the holder's codes allow", async () => {
    setup({ permissions: ['user.view', 'user.suspend'] });

    await show();

    expect(button('Suspend account')).toBeEnabled();
    expect(button('Deactivate account')).toBeNull();
  });

  it('says why there is no action on a deactivated account, to a holder of an account code', async () => {
    setup({ userStatus: 'DEACTIVATED' });

    await show();

    expect(screen.getByText(ACCOUNT_DEACTIVATED_NOTE)).toBeVisible();
    expect(screen.queryByRole('button', { name: /account$/ })).toBeNull();
  });

  it('shows neither actions nor a note to a holder of no account code', async () => {
    setup({ permissions: ['user.view'] });

    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Esi Mensah' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /account$/ })).toBeNull();
    expect(screen.queryByText(ACCOUNT_DEACTIVATED_NOTE)).toBeNull();
  });

  it('shows the record with no actions, and does not throw, when the context did not resolve', async () => {
    setup();
    reads.getCurrentContextProfile.mockResolvedValue(CONTEXT_NOT_SELECTED);

    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Esi Mensah' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /account$/ })).toBeNull();
  });

  it('carries the person, the rendered organisation and a minted key into each dialog (rule 6)', async () => {
    const user = userEvent.setup();
    setup();
    await show();

    await user.click(screen.getByRole('button', { name: 'Suspend account' }));

    const dialog = await screen.findByRole('dialog', { name: "Suspend Esi Mensah's account?" });
    const hidden = (name: string) =>
      dialog.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;
    expect(hidden('userId')).toBe(USER);
    expect(hidden('contextOrganisationId')).toBe(PLATFORM);
    expect(hidden('idempotencyKey')).toMatch(UUID);
  });
});
