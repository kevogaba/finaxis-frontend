import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { BackendApiError } from '@/auth/backend-api';
import type { RecordAuditTab } from '@/modules/administration/audit/components/record-audit-tab';
import { renderWithProviders } from '@/test/test-utils';

const { getUser, tabs } = vi.hoisted(() => ({
  getUser: vi.fn(),
  // The props the page handed the shared audit tab, one entry per render of it.
  tabs: [] as ComponentProps<typeof RecordAuditTab>[],
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  getUser: (...args: unknown[]) => getUser(...args) as unknown,
}));
// The shared tab has its own tests; here only what the page hands it matters.
vi.mock('@/modules/administration/audit/components/record-audit-tab', () => ({
  RecordAuditTab: (props: ComponentProps<typeof RecordAuditTab>) => {
    tabs.push(props);
    return null;
  },
}));

const { default: UserAuditPage } = await import('./page');

// Lettered at its end, so its upper-case form differs from it (Ruling 16).
const FELIX = '10000000-0000-4000-8000-00000000000d';
const FELIX_MEMBERSHIP = '10000000-0000-4000-8000-00000000000e';
const TAIL =
  "Role and branch assignment changes are recorded on each assignment and branch, so they don't appear here.";
const DESCRIPTION = `This user's history across their record, account and membership, and what they did. ${TAIL}`;

function setup() {
  getUser.mockResolvedValue({
    id: FELIX,
    email: 'felix.omondi@greenfield.example',
    displayName: 'Felix Omondi',
    membershipId: FELIX_MEMBERSHIP,
  });
}

type Query = Record<string, string | string[] | undefined>;
async function show(userId = FELIX, query: Query = {}) {
  const element = await UserAuditPage({
    params: Promise.resolve({ userId }),
    searchParams: Promise.resolve(query),
  });
  if (!element) throw new Error('The page rendered nothing');
  renderWithProviders(element);
  const tab = tabs.at(-1);
  if (!tab) throw new Error('The audit tab was not rendered');
  return tab;
}

beforeEach(() => {
  vi.resetAllMocks();
  tabs.length = 0;
});

describe('UserAuditPage: the four views', () => {
  // BG-09: the user read carries the membership's id, so its view needs no membership read and no
  // membership.view (the tab itself needs audit.view).
  it('offers the record, the account, the membership and what the user did, each filtered by its subject', async () => {
    setup();

    const tab = await show();

    expect(tab.views).toEqual([
      { value: 'user', label: 'User record', filter: { entityType: 'USER', entityId: FELIX } },
      {
        value: 'account',
        label: 'Account',
        filter: { entityType: 'USER_ACCOUNT', entityId: FELIX },
      },
      {
        value: 'membership',
        label: 'Membership',
        filter: { entityType: 'MEMBERSHIP', entityId: FELIX_MEMBERSHIP },
      },
      { value: 'actor', label: 'Performed by', filter: { actorId: FELIX } },
    ]);
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("filters and links by the lower-case id, however the URL's id was typed (Ruling 16)", async () => {
    setup();

    const tab = await show(FELIX.toUpperCase());

    expect(getUser).toHaveBeenCalledWith(FELIX);
    expect(JSON.stringify(tab.views)).not.toContain(FELIX.toUpperCase());
    expect(tab.views[0].filter).toEqual({ entityType: 'USER', entityId: FELIX });
    expect(tab.path).toBe(`/admin/users/${FELIX}/audit`);
  });
});

describe('UserAuditPage: what it hands the shared tab', () => {
  it("passes the tab's own path, the URL's state and the description", async () => {
    setup();

    const tab = await show(FELIX, { view: 'actor', page: '2' });

    expect(tab.path).toBe(`/admin/users/${FELIX}/audit`);
    expect(tab.params.get('view')).toBe('actor');
    expect(tab.params.get('page')).toBe('2');
    expect(tab.description).toBe(DESCRIPTION);
  });

  it('renders nothing when the record itself failed (the layout shows that failure)', async () => {
    getUser.mockRejectedValue(new BackendApiError(404, { code: 'resource_not_found' }));

    const element = await UserAuditPage({
      params: Promise.resolve({ userId: FELIX }),
      searchParams: Promise.resolve({}),
    });

    expect(element).toBeNull();
    expect(tabs).toHaveLength(0);
  });
});
