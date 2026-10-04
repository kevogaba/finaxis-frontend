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
const T = '17000000-0000-4000-8000-0000000000ac';
const ESI = '17000000-0000-4000-8000-0000000000a7';
const ME = '17000000-0000-4000-8000-0000000000ef'; // the signed-in platform administrator, not Esi
const ORG = '55555555-5555-4555-8555-555555555555';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ALL_CODES = ['user.view', 'user.suspend', 'user.activate', 'user.deactivate'];

const { getCurrentContextProfile, getInstitutionUser, getTenant, redirect } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  getInstitutionUser: vi.fn(),
  getTenant: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => redirect(to) as unknown,
  usePathname: () => `/platform-admin/tenants/${T}/users/${ESI}`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
// parseInstitutionId reads the reserved platform organisation from here. A literal, because vi.mock
// is hoisted above the constants.
vi.mock('@/config/env.server', () => ({
  serverEnv: { PLATFORM_ORGANISATION_ID: '00000000-0000-0000-0000-000000000000' },
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: (...args: unknown[]) => getCurrentContextProfile(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/tenants/tenant-service', () => ({
  getTenant: (...args: unknown[]) => getTenant(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/users/institution-user-service', () => ({
  getInstitutionUser: (...args: unknown[]) => getInstitutionUser(...args) as unknown,
}));
// The hero's dialogs import the Server Actions; nothing here submits one.
vi.mock('@/modules/platform-administration/users/account-actions', () => ({
  deactivateAccount: vi.fn(),
  reactivateAccount: vi.fn(),
  suspendAccount: vi.fn(),
}));

const { default: InstitutionUserPage } = await import('./page');

interface Setup {
  permissions?: string[];
  /** The signed-in user's own id, as `/auth/me` reports it. */
  signedInAs?: string;
  userStatus?: string;
  /** What the user read settles with; an Error rejects it. */
  user?: Error;
  /** What the institution read settles with; an Error rejects it. */
  tenant?: Error;
}

/** Programs every read the page makes. A test names only what it varies. */
function setup({
  permissions = ALL_CODES,
  signedInAs = ME,
  userStatus = 'ACTIVE',
  user,
  tenant,
}: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { permissions, user_id: signedInAs },
    context: { organization: { id: ORG, name: 'Platform' }, branch: null },
  });
  if (user) getInstitutionUser.mockRejectedValue(user);
  else {
    getInstitutionUser.mockResolvedValue({
      id: ESI,
      username: 'esi.mensah',
      email: 'esi.mensah@acme.example',
      displayName: 'Esi Mensah',
      userStatus,
      membershipStatus: 'ACTIVE',
    });
  }
  if (tenant) getTenant.mockRejectedValue(tenant);
  else {
    getTenant.mockResolvedValue({
      id: T,
      tenantCode: 'acme',
      displayName: 'Acme SACCO',
      countryCode: 'KE',
      status: 'ACTIVE',
    });
  }
}

async function show(tenantId = T, userId = ESI) {
  const element = await InstitutionUserPage({ params: Promise.resolve({ tenantId, userId }) });
  return renderWithProviders(element);
}

const button = (name: string) => screen.queryByRole('button', { name });
const FALLBACK_EYEBROW = 'Platform administration · Institution user';

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('InstitutionUserPage: the record', () => {
  it("shows the person under the institution's name, with a way back to its users", async () => {
    setup();

    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Esi Mensah' })).toBeInTheDocument();
    expect(screen.getByText('Platform administration · User in Acme SACCO')).toBeVisible();
    expect(screen.getByText('esi.mensah · esi.mensah@acme.example')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to users' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${T}/users`,
    );
    expect(screen.getByText('Membership in Acme SACCO')).toBeVisible();
    // The institution variant of the note: the membership is the institution's own to manage.
    expect(screen.getByRole('note')).toHaveTextContent(accountScopeNote('institution'));
    expect(getInstitutionUser).toHaveBeenCalledWith(T, ESI);
    expect(getTenant).toHaveBeenCalledWith(T);
  });

  it('reads upper-case ids in lower case, and in no other (the positive control for the guard)', async () => {
    setup();

    await show(T.toUpperCase(), ESI.toUpperCase());

    expect(getInstitutionUser).toHaveBeenCalledWith(T, ESI);
    expect(getTenant).toHaveBeenCalledWith(T);
    for (const read of [getInstitutionUser, getTenant]) {
      expect(JSON.stringify(read.mock.calls)).not.toMatch(/[A-F]/);
    }
    expect(screen.getByRole('heading', { level: 1, name: 'Esi Mensah' })).toBeInTheDocument();
  });

  it("answers an institution's other user, which the backend 404s, with not-found and no record", async () => {
    setup({ user: new BackendApiError(404, { code: 'resource_not_found' }) });

    await expect(show()).rejects.toThrow('NEXT_NOT_FOUND');

    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('shows the forbidden state, under the only h1, when the record cannot be read', async () => {
    setup({ user: new BackendApiError(403, { code: 'forbidden' }) });

    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'User record' })).toBeInTheDocument();
    expect(screen.getByText(FALLBACK_EYEBROW)).toBeVisible();
    expect(screen.getByText("You don't have permission")).toBeVisible();
    expect(screen.queryByText('Something went wrong')).toBeNull();
    // Neither the hero nor its actions are shown over a record that did not load.
    expect(button('Suspend account')).toBeNull();
    expect(screen.queryByText('Back to users')).toBeNull();
  });

  it('shows the error state, with its reference, for any other failure', async () => {
    setup({ user: new BackendApiError(503, { requestId: 'req-x' }) });

    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'User record' })).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeVisible();
    expect(screen.getByText('Reference: req-x')).toBeVisible();
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

    await expect(show()).rejects.toThrow(`NEXT_REDIRECT:${to}`);

    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it('redirects to login when the institution read finds the session lost', async () => {
    setup({ tenant: new BackendApiError(401) });

    await expect(show()).rejects.toThrow('NEXT_REDIRECT:/login?reason=session_expired');
  });
});

describe('InstitutionUserPage: the institution read is only a label', () => {
  it("falls back to plain words, never a false name, when the institution can't be read", async () => {
    setup({ tenant: new BackendApiError(503, { requestId: 'req-t' }) });

    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Esi Mensah' })).toBeInTheDocument();
    expect(screen.getByText(FALLBACK_EYEBROW)).toBeVisible();
    expect(screen.getByText('Membership in this institution')).toBeVisible();
    expect(screen.queryByText(/Acme/)).toBeNull();
    expect(screen.queryByText(/null|undefined/)).toBeNull();
    // The record and its actions still show: a failed label never blocks the account's lifecycle.
    expect(button('Suspend account')).toBeEnabled();
  });
});

describe('InstitutionUserPage: your own account', () => {
  it("disables Suspend and Deactivate on your own record, comparing the profile's id with the read's", async () => {
    // The profile's id in upper case, the read's in lower: one case on both sides (Ruling 6).
    setup({ signedInAs: ESI.toUpperCase() });

    await show();

    for (const name of ['Suspend account', 'Deactivate account']) {
      expect(button(name)).toBeDisabled();
      expect(button(name)).toHaveAccessibleDescription(OWN_ACCOUNT);
    }
    expect(screen.getAllByText(OWN_ACCOUNT)).toHaveLength(1);
  });

  it("leaves them enabled on someone else's record, though the URL names this person (the control)", async () => {
    // The URL's id is Esi's and so is the read's; only the profile's id decides, so a page that
    // compared the URL's id with the read's would disable these.
    setup({ signedInAs: ME });

    await show(T, ESI);

    expect(button('Suspend account')).toBeEnabled();
    expect(button('Deactivate account')).toBeEnabled();
    expect(screen.queryByText(OWN_ACCOUNT)).toBeNull();
  });
});

describe('InstitutionUserPage: what the holder can do', () => {
  it("offers only the actions the holder's codes allow", async () => {
    setup({ permissions: ['user.view', 'user.suspend'] });

    await show();

    expect(button('Suspend account')).toBeEnabled();
    expect(button('Deactivate account')).toBeNull();
  });

  it('says why there is no action on a deactivated account for a holder of an account code', async () => {
    setup({ userStatus: 'DEACTIVATED' });

    await show();

    expect(screen.getByText(ACCOUNT_DEACTIVATED_NOTE)).toBeVisible();
    expect(screen.queryByRole('button', { name: /account$/ })).toBeNull();
  });

  it('shows neither actions nor a note to a holder of no account code', async () => {
    setup({ permissions: ['user.view'] });

    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Esi Mensah' })).toBeInTheDocument();
    expect(button('Suspend account')).toBeNull();
    expect(button('Deactivate account')).toBeNull();
    expect(screen.queryByText(ACCOUNT_DEACTIVATED_NOTE)).toBeNull();
  });

  it('shows the record with no actions when the context did not resolve', async () => {
    setup();
    getCurrentContextProfile.mockResolvedValue(CONTEXT_NOT_SELECTED);

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
    expect(hidden('userId')).toBe(ESI);
    expect(hidden('contextOrganisationId')).toBe(ORG);
    expect(hidden('idempotencyKey')).toMatch(UUID);
  });
});
