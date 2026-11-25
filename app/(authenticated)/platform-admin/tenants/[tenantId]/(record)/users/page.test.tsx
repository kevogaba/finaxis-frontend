import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import { INSTITUTION_USERS_DESCRIPTION } from '@/modules/platform-administration/users/account-rules';
import { renderWithProviders } from '@/test/test-utils';

// Lettered, so their upper-case forms differ from them.
const T = '17000000-0000-4000-8000-0000000000ac';
const U = '17000000-0000-4000-8000-0000000000a7';

const { getCurrentContextProfile, getTenant, listInstitutionUsers, readActiveMembers, redirect } =
  vi.hoisted(() => ({
    getCurrentContextProfile: vi.fn(),
    getTenant: vi.fn(),
    listInstitutionUsers: vi.fn(),
    readActiveMembers: vi.fn(),
    redirect: vi.fn(),
  }));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => redirect(to) as unknown,
  usePathname: () => `/platform-admin/tenants/${T}/users`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
// parseInstitutionId reads the reserved platform organisation from here. A literal, because vi.mock
// is hoisted above the constants.
vi.mock('@/config/env.server', () => ({
  serverEnv: { PLATFORM_ORGANISATION_ID: '00000000-0000-0000-0000-000000000000' },
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: (...args: unknown[]) => getCurrentContextProfile(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/checker/checker-service', () => ({
  readActiveMembers: (...args: unknown[]) => readActiveMembers(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/checker/checker-actions', () => ({
  approveAsPlatformChecker: vi.fn(),
}));
vi.mock('@/modules/platform-administration/tenants/tenant-service', () => ({
  getTenant: (...args: unknown[]) => getTenant(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/users/institution-user-service', () => ({
  listInstitutionUsers: (...args: unknown[]) => listInstitutionUsers(...args) as unknown,
}));

const { default: UsersTab } = await import('./page');

const ME = '17000000-0000-4000-8000-0000000000ae';
const ADMIN = { id: '17000000-0000-4000-8000-0000000000a1', displayName: 'Achieng Odera' };
const CHECKER_CODES = ['user.view', 'user.approve', 'membership.view'];

const ESI = {
  id: U,
  username: 'esi.mensah',
  email: 'esi.mensah@acme.example',
  displayName: 'Esi Mensah',
  userStatus: 'ACTIVE',
  membershipStatus: 'ACTIVE',
  membershipId: '17000000-0000-4000-8000-0000000000c7',
  createdBy: null as { id: string; displayName: string } | null,
};
/** Pending, invited by the first administrator: the platform checker may approve him. */
const OTIENO = {
  ...ESI,
  id: '17000000-0000-4000-8000-0000000000a2',
  username: 'otieno.ouma',
  email: 'otieno@acme.example',
  displayName: 'Otieno Ouma',
  userStatus: 'INVITED',
  membershipStatus: 'PENDING_APPROVAL',
  membershipId: '17000000-0000-4000-8000-0000000000c2',
  createdBy: ADMIN,
};

function userPage(items: readonly (typeof ESI)[], number = 0, totalPages = 1) {
  return {
    items,
    page: {
      number,
      size: 10,
      totalItems: items.length,
      totalPages,
      hasNext: false,
      hasPrevious: number > 0,
    },
  };
}

interface Setup {
  permissions?: string[];
  status?: string;
  /** What the tenant read rejects with, when it fails. */
  tenant?: Error;
  /** What the list read settles with: a page, or an Error that rejects it. */
  list?: ReturnType<typeof userPage> | Error;
  /** What the checker window's read settles with (ACTIVE members, `size=1`). */
  active?: ReturnType<typeof userPage> | Error;
}

/** Programs every read the tab makes. A test names only what it varies. */
function setup({
  permissions = ['user.view'],
  status = 'ACTIVE',
  tenant,
  list = userPage([ESI]),
  active = userPage([ESI]),
}: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { user_id: ME, permissions },
    context: { organization: { id: '00000000-0000-0000-0000-000000000000', name: 'Platform' } },
  });
  if (tenant) getTenant.mockRejectedValue(tenant);
  else {
    getTenant.mockResolvedValue({
      id: T,
      tenantCode: 'acme',
      displayName: 'Acme SACCO',
      countryCode: 'KE',
      status,
    });
  }
  if (list instanceof Error) listInstitutionUsers.mockRejectedValue(list);
  else listInstitutionUsers.mockResolvedValue(list);
  if (active instanceof Error) readActiveMembers.mockRejectedValue(active);
  else readActiveMembers.mockResolvedValue(active);
}

async function show(
  searchParams: Record<string, string | string[] | undefined> = {},
  tenantId = T,
) {
  const element = await UsersTab({
    params: Promise.resolve({ tenantId }),
    searchParams: Promise.resolve(searchParams),
  });
  return { element, ...renderWithProviders(element) };
}

const section = () => screen.getByRole('region', { name: 'Users' });

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('UsersTab: the list', () => {
  it("lists the institution's users, each linking under the institution", async () => {
    setup();

    await show();

    expect(within(section()).getByRole('link', { name: 'Esi Mensah' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${T}/users/${U}`,
    );
    expect(screen.getByText('esi.mensah@acme.example')).toBeVisible();
    expect(within(section()).getByText(INSTITUTION_USERS_DESCRIPTION)).toBeVisible();
    // Account actions live on the record, never on the tab.
    expect(screen.queryByRole('button', { name: /account/i })).toBeNull();
    expect(listInstitutionUsers).toHaveBeenCalledWith(T, expect.objectContaining({ page: 0 }));
  });

  it('keeps one section "Users" and one region "Users table" (landmark names differ), and no h1', async () => {
    setup();

    await show();

    // axe rates landmark-unique moderate, so the serious/critical gate would not catch a clash.
    expect(screen.getAllByRole('region', { name: 'Users table' })).toHaveLength(1);
    expect(screen.getAllByRole('region', { name: 'Users' })).toHaveLength(1);
    expect(screen.getAllByRole('table', { name: 'Users' })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Users' })).toBeVisible();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it("offers the directory's three filters and counts the result", async () => {
    setup();

    await show();

    expect(screen.getByRole('searchbox', { name: 'Search' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'User status' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Membership' })).toBeVisible();
    expect(screen.getByText('1 user')).toBeVisible();
  });

  it("sends a filtered URL through to the read, and keeps the institution's own path", async () => {
    setup();

    await show({ q: 'esi', userStatus: 'SUSPENDED', membershipStatus: 'ACTIVE', page: '2' });

    expect(listInstitutionUsers).toHaveBeenCalledWith(
      T,
      expect.objectContaining({
        q: 'esi',
        userStatus: 'SUSPENDED',
        membershipStatus: 'ACTIVE',
        page: 2,
      }),
    );
  });

  it("redirects a page past the end to the institution's own last page", async () => {
    setup({ list: userPage([ESI], 4, 2) });

    await expect(show({ page: '4' })).rejects.toThrow(/^NEXT_REDIRECT:/);

    const target = new URL(
      (redirect.mock.calls[0]?.[0] as string | undefined) ?? '',
      'http://localhost',
    );
    expect(target.pathname).toBe(`/platform-admin/tenants/${T}/users`);
    expect(target.searchParams.get('page')).toBe('1');
  });

  // The controller's note (Task 4b review): the layout and the tab key getTenant separately when the
  // URL is mixed-case, so a split transient failure must not leave the tab blank.
  it("shows the failure inside the section, with its reference and no list, when the institution can't be read here", async () => {
    setup({ tenant: new BackendApiError(503, { requestId: 'req-t' }) });

    await show();

    expect(within(section()).getByText('Reference: req-t')).toBeVisible();
    expect(within(section()).getByText(INSTITUTION_USERS_DESCRIPTION)).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Users table' })).toBeNull();
    expect(screen.queryByText('No users')).toBeNull();
  });
});

describe('UsersTab: the platform checker (BG-02)', () => {
  const approve = (name: string) => screen.queryByRole('button', { name: `Approve ${name}` });

  it('says the window is open, and offers Approve on a pending member only', async () => {
    setup({ permissions: CHECKER_CODES, list: userPage([OTIENO, ESI]) });

    await show();

    expect(within(section()).getByRole('note')).toHaveTextContent(
      'Platform checking is open: Acme SACCO has no active member besides its first administrator, so a platform administrator can approve its first members.',
    );
    expect(approve('Otieno Ouma')).toBeEnabled();
    expect(approve('Esi Mensah')).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
    expect(readActiveMembers).toHaveBeenCalledWith(T);
  });

  it("disables Approve for the member's inviter, with the caption", async () => {
    setup({
      permissions: CHECKER_CODES,
      list: userPage([{ ...OTIENO, createdBy: { id: ME, displayName: 'Jane' } }]),
    });

    await show();

    expect(approve('Otieno Ouma')).toBeDisabled();
    expect(approve('Otieno Ouma')).toHaveAccessibleDescription(
      'You invited this user, so another administrator must approve them.',
    );
  });

  it('offers nothing once the institution has a second active member, and says it decides', async () => {
    setup({
      permissions: CHECKER_CODES,
      list: userPage([OTIENO, ESI]),
      active: {
        ...userPage([{ ...ESI, createdBy: ADMIN }]),
        page: { ...userPage([]).page, totalItems: 2 },
      },
    });

    await show();

    expect(within(section()).getByRole('note')).toHaveTextContent(
      'Acme SACCO now approves its own members.',
    );
    expect(approve('Otieno Ouma')).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
  });

  it("offers Approve with no note when the window can't be read: the platform's 409 explains", async () => {
    setup({
      permissions: CHECKER_CODES,
      list: userPage([OTIENO]),
      active: new BackendApiError(503, { requestId: 'req-w' }),
    });

    await show();

    expect(within(section()).queryByRole('note')).toBeNull();
    expect(approve('Otieno Ouma')).toBeEnabled();
  });

  it.each([
    ['without user.approve', ['user.view', 'membership.view'], 'ACTIVE'],
    ['without membership.view', ['user.view', 'user.approve'], 'ACTIVE'],
    ['for an institution that is not ACTIVE', CHECKER_CODES, 'SUSPENDED'],
  ])('neither reads the window nor offers Approve %s', async (_label, permissions, status) => {
    setup({ permissions, status, list: userPage([OTIENO]) });

    await show();

    expect(readActiveMembers).not.toHaveBeenCalled();
    expect(within(section()).queryByRole('note')).toBeNull();
    expect(approve('Otieno Ouma')).toBeNull();
  });
});

describe('UsersTab: failures and empty states', () => {
  it('shows the permission state on a 403 inside the section', async () => {
    setup({ list: new BackendApiError(403, { code: 'forbidden' }) });

    await show();

    expect(within(section()).getByText("You don't have permission")).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows the error state, with its reference, on any other failure', async () => {
    setup({ list: new BackendApiError(503, { requestId: 'req-u' }) });

    await show();

    expect(within(section()).getByText('Reference: req-u')).toBeVisible();
    expect(screen.queryByText("You don't have permission")).toBeNull();
    // A failed read is never an empty list.
    expect(screen.queryByText('No users')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it.each([
    ['no filter', {}, 'This institution has no users yet.'],
    ['a user status', { userStatus: 'SUSPENDED' }, 'No users match these filters.'],
    ['a membership status', { membershipStatus: 'REVOKED' }, 'No users match these filters.'],
    ['a search', { q: 'zzz' }, 'No users match these filters.'],
  ])('words the empty state by its filters: %s', async (_label, searchParams, description) => {
    setup({ list: userPage([]) });

    await show(searchParams);

    expect(screen.getByText('No users')).toBeVisible();
    expect(screen.getByText(description)).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
  });

  // Rule 21: every read is settled with load(), so a lost session redirects.
  it.each([
    ['the list read', { list: new BackendApiError(401) }],
    ['the institution read', { tenant: new BackendApiError(401) }],
  ])('redirects to login when %s finds the session lost', async (_label, programme) => {
    setup(programme);

    await expect(show()).rejects.toThrow('NEXT_REDIRECT:/login?reason=session_expired');
  });
});
