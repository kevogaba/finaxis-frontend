import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import { PLATFORM_USERS_DESCRIPTION } from '@/modules/platform-administration/users/account-rules';
import { renderWithProviders } from '@/test/test-utils';

// Lettered, so its upper-case form differs from it.
const U = '17000000-0000-4000-8000-0000000000a7';

const { listInstitutionUsers, listPlatformUsers, redirect } = vi.hoisted(() => ({
  listInstitutionUsers: vi.fn(),
  listPlatformUsers: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => redirect(to) as unknown,
  usePathname: () => '/platform-admin/users',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
// Both reads are mocked so the page's choice between them is observable: the platform's members are
// listed through listPlatformUsers, never through an institution's list.
vi.mock('@/modules/platform-administration/users/institution-user-service', () => ({
  listInstitutionUsers: (...args: unknown[]) => listInstitutionUsers(...args) as unknown,
  listPlatformUsers: (...args: unknown[]) => listPlatformUsers(...args) as unknown,
}));

const { default: PlatformUsersPage } = await import('./page');

const ESI = {
  id: U,
  username: 'esi.mensah',
  email: 'esi.mensah@platform.example',
  displayName: 'Esi Mensah',
  userStatus: 'ACTIVE',
  membershipStatus: 'ACTIVE',
};

function userPage(
  items: readonly (typeof ESI)[],
  { number = 0, totalPages = 1, totalItems = items.length } = {},
) {
  return {
    items,
    page: { number, size: 10, totalItems, totalPages, hasNext: false, hasPrevious: number > 0 },
  };
}

/** Programs the read the page makes: a page, or an Error that rejects it. */
function setup(list: ReturnType<typeof userPage> | Error = userPage([ESI])) {
  if (list instanceof Error) listPlatformUsers.mockRejectedValue(list);
  else listPlatformUsers.mockResolvedValue(list);
}

async function show(searchParams: Record<string, string | string[] | undefined> = {}) {
  const element = await PlatformUsersPage({ searchParams: Promise.resolve(searchParams) });
  return renderWithProviders(element);
}

/** The page's own header: the eyebrow, the only h1 and the description, in every state. */
function expectHeader() {
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getByRole('heading', { level: 1, name: 'Platform users' })).toBeVisible();
  expect(screen.getByText('Platform administration')).toBeVisible();
  expect(screen.getByText(PLATFORM_USERS_DESCRIPTION)).toBeVisible();
}

/** What a failed read must never look like: a toolbar, a count, a table or the empty copy. */
function expectNoListOrAbsence() {
  expect(screen.queryByText('No users')).toBeNull();
  expect(screen.queryByText(/^0 users?$/)).toBeNull();
  expect(screen.queryByText('The platform organisation has no members yet.')).toBeNull();
  expect(screen.queryByText('No users match these filters.')).toBeNull();
  expect(screen.queryByRole('searchbox')).toBeNull();
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Users table' })).toBeNull();
}

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('PlatformUsersPage: the list', () => {
  it("lists the platform organisation's members, each linking to a platform user record", async () => {
    setup();

    await show();

    expectHeader();
    expect(screen.getByRole('link', { name: 'Esi Mensah' })).toHaveAttribute(
      'href',
      `/platform-admin/users/${U}`,
    );
    expect(screen.getByText('esi.mensah@platform.example')).toBeVisible();
    expect(listPlatformUsers).toHaveBeenCalledWith(expect.objectContaining({ page: 0 }));
    // Never an institution's list: the platform's own members are read through their own helper.
    expect(listInstitutionUsers).not.toHaveBeenCalled();
    // Account actions live on the record, never on the list.
    expect(screen.queryByRole('button', { name: /account/i })).toBeNull();
  });

  it('keeps one region "Users table" (and one table "Users"), a landmark name nothing else has', async () => {
    setup();

    await show();

    // axe rates landmark-unique moderate, so the serious/critical gate would not catch a clash.
    expect(screen.getAllByRole('region', { name: 'Users table' })).toHaveLength(1);
    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(screen.getAllByRole('table', { name: 'Users' })).toHaveLength(1);
    expect(within(screen.getByRole('region', { name: 'Users table' })).getByRole('table')).toBe(
      screen.getByRole('table', { name: 'Users' }),
    );
  });

  it("offers the directory's three filters, and counts from the total, not from the page", async () => {
    setup(userPage([ESI], { totalItems: 25, totalPages: 3 }));

    await show();

    expect(screen.getByRole('searchbox', { name: 'Search' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'User status' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Membership' })).toBeVisible();
    expect(screen.getByText('25 users')).toBeVisible();
  });

  it('counts one user in the singular', async () => {
    setup();

    await show();

    expect(screen.getByText('1 user')).toBeVisible();
  });

  it('sends the URL filters, parsed, through to the read', async () => {
    setup();

    await show({
      q: '  esi  ',
      userStatus: 'SUSPENDED',
      membershipStatus: 'ACTIVE',
      page: '2',
      size: '20',
    });

    expect(listPlatformUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'esi',
        userStatus: 'SUSPENDED',
        membershipStatus: 'ACTIVE',
        page: 2,
        size: 20,
      }),
    );
  });

  it('drops a status the directory does not know, rather than sending it', async () => {
    setup();

    await show({ userStatus: 'BOGUS', membershipStatus: 'NOPE' });

    const sent = listPlatformUsers.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty('userStatus');
    expect(sent).not.toHaveProperty('membershipStatus');
  });

  it("redirects a page past the end to the list's own last page, keeping the filters", async () => {
    setup(userPage([ESI], { number: 4, totalPages: 2, totalItems: 11 }));

    await expect(show({ page: '4', q: 'esi' })).rejects.toThrow(/^NEXT_REDIRECT:/);

    const target = new URL(
      (redirect.mock.calls[0]?.[0] as string | undefined) ?? '',
      'http://localhost',
    );
    expect(target.pathname).toBe('/platform-admin/users');
    expect(target.searchParams.get('page')).toBe('1');
    expect(target.searchParams.get('q')).toBe('esi');
  });

  it('drops the page parameter when the last page is the first', async () => {
    setup(userPage([ESI], { number: 3, totalPages: 1, totalItems: 1 }));

    await expect(show({ page: '3' })).rejects.toThrow(/^NEXT_REDIRECT:/);

    const target = new URL(
      (redirect.mock.calls[0]?.[0] as string | undefined) ?? '',
      'http://localhost',
    );
    expect(target.pathname).toBe('/platform-admin/users');
    expect(target.searchParams.has('page')).toBe(false);
  });
});

describe('PlatformUsersPage: failures and empty states', () => {
  it('shows the permission state on a 403, with the header and no list', async () => {
    setup(new BackendApiError(403, { code: 'forbidden' }));

    await show();

    expectHeader();
    expect(screen.getByText("You don't have permission")).toBeVisible();
    expect(screen.queryByText('Something went wrong')).toBeNull();
    expect(screen.queryByText(/Reference:/)).toBeNull();
    expectNoListOrAbsence();
  });

  it('shows the error state, with its reference, on any other failure, and never a count or an empty list', async () => {
    setup(new BackendApiError(503, { requestId: 'req-u' }));

    await show();

    expectHeader();
    expect(screen.getByText('Something went wrong')).toBeVisible();
    expect(screen.getByText('Reference: req-u')).toBeVisible();
    expect(screen.queryByText("You don't have permission")).toBeNull();
    // A failed read is never "no users" (rule 9).
    expectNoListOrAbsence();
  });

  it.each([
    ['no filter', {}, 'The platform organisation has no members yet.'],
    ['a user status', { userStatus: 'SUSPENDED' }, 'No users match these filters.'],
    ['a membership status', { membershipStatus: 'REVOKED' }, 'No users match these filters.'],
    ['a search', { q: 'zzz' }, 'No users match these filters.'],
  ])('words the empty state by its filters: %s', async (_label, searchParams, description) => {
    setup(userPage([]));

    await show(searchParams);

    expectHeader();
    expect(screen.getByText('No users')).toBeVisible();
    expect(screen.getByText(description)).toBeVisible();
    expect(screen.getByText('0 users')).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
  });

  // Rule 21: the read is settled with load(), so a lost session or a stale context redirects
  // instead of rendering a failure.
  it.each([
    ['a 401', new BackendApiError(401), '/login?reason=session_expired'],
    [
      'a stale context',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      '/select-context',
    ],
  ])('redirects, rendering nothing, when the read fails with %s', async (_n, failure, to) => {
    setup(failure);

    await expect(show()).rejects.toThrow(`NEXT_REDIRECT:${to}`);

    expect(redirect).toHaveBeenCalledTimes(1);
  });
});
