import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { BackendApiError } from '@/auth/backend-api';
import type { RecordAuditTab } from '@/modules/administration/audit/components/record-audit-tab';
import { renderWithProviders } from '@/test/test-utils';
import type { SelectedContextProfile } from '@/auth/context-service';

// A real SelectedContextProfile, checked by the type: the context could not be resolved.
const CONTEXT_NOT_SELECTED = {
  kind: 'redirect-to-context-selection',
  reason: 'invalid-context',
} satisfies SelectedContextProfile;

const { findUserMembership, getCurrentContextProfile, getUser, tabs } = vi.hoisted(() => ({
  findUserMembership: vi.fn(),
  getCurrentContextProfile: vi.fn(),
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
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  getUser: (...args: unknown[]) => getUser(...args) as unknown,
  findUserMembership: (...args: unknown[]) => findUserMembership(...args) as unknown,
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
const EMAIL = 'felix.omondi@greenfield.example';
const BOTH = ['audit.view', 'membership.view'];
const TAIL =
  "Role and branch assignment changes are recorded on each assignment and branch, so they don't appear here.";
// The description names only the histories the tab offers.
const WITH_MEMBERSHIP = `This user's history across their record, account and membership, and what they did. ${TAIL}`;
const WITHOUT_MEMBERSHIP = `This user's history across their record and account, and what they did. ${TAIL}`;

interface Setup {
  permissions?: string[];
  /** What the membership lookup settles with; an Error rejects it. */
  membership?: { id: string } | null | Error;
}

function setup({ permissions = BOTH, membership = { id: FELIX_MEMBERSHIP } }: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({ kind: 'resolved', profile: { permissions } });
  getUser.mockResolvedValue({ id: FELIX, email: EMAIL, displayName: 'Felix Omondi' });
  if (membership instanceof Error) findUserMembership.mockRejectedValue(membership);
  else findUserMembership.mockResolvedValue(membership);
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

const labels = (tab: ComponentProps<typeof RecordAuditTab>) => tab.views.map((v) => v.label);

beforeEach(() => {
  vi.resetAllMocks();
  tabs.length = 0;
});

describe('UserAuditPage: the four views', () => {
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
  });

  it("filters and links by the lower-case id, however the URL's id was typed (Ruling 16)", async () => {
    setup();

    const tab = await show(FELIX.toUpperCase());

    expect(JSON.stringify(tab.views)).not.toContain(FELIX.toUpperCase());
    expect(tab.views[0].filter).toEqual({ entityType: 'USER', entityId: FELIX });
    expect(tab.path).toBe(`/admin/users/${FELIX}/audit`);
  });

  it("looks the membership up by the record's own id and email, the layout's arguments", async () => {
    setup();

    await show();

    // The same arguments as the layout's call, so `cache()` serves the layout's read.
    expect(findUserMembership).toHaveBeenCalledTimes(1);
    expect(findUserMembership).toHaveBeenCalledWith(FELIX, EMAIL);
  });

  it('keeps the other three views when no membership was found for the user', async () => {
    setup({ membership: null });

    const tab = await show();

    expect(findUserMembership).toHaveBeenCalledTimes(1); // it was looked for
    expect(labels(tab)).toEqual(['User record', 'Account', 'Performed by']);
    expect(tab.views[2]).toEqual({
      value: 'actor',
      label: 'Performed by',
      filter: { actorId: FELIX },
    });
  });

  it('keeps the other three views when the membership lookup fails', async () => {
    setup({ membership: new BackendApiError(500, { requestId: 'req-1' }) });

    const tab = await show();

    expect(labels(tab)).toEqual(['User record', 'Account', 'Performed by']);
  });

  it('offers no membership view, and reads no membership, without membership.view', async () => {
    setup({ permissions: ['audit.view'] });

    const tab = await show();

    expect(findUserMembership).not.toHaveBeenCalled();
    expect(labels(tab)).toEqual(['User record', 'Account', 'Performed by']);
  });

  it('offers no membership view when the context did not resolve', async () => {
    setup();
    getCurrentContextProfile.mockResolvedValue(CONTEXT_NOT_SELECTED);

    const tab = await show();

    expect(findUserMembership).not.toHaveBeenCalled();
    expect(labels(tab)).toEqual(['User record', 'Account', 'Performed by']);
  });
});

describe('UserAuditPage: what it hands the shared tab', () => {
  it("passes the tab's own path, the URL's state and the description", async () => {
    setup();

    const tab = await show(FELIX, { view: 'actor', page: '2' });

    expect(tab.path).toBe(`/admin/users/${FELIX}/audit`);
    expect(tab.params.get('view')).toBe('actor');
    expect(tab.params.get('page')).toBe('2');
    expect(tab.description).toBe(WITH_MEMBERSHIP);
  });

  it.each([
    ['no membership was found', { membership: null }],
    ['the membership lookup failed', { membership: new BackendApiError(500, { requestId: 'r' }) }],
    ['the holder cannot view memberships', { permissions: ['audit.view'] }],
  ] as [string, Setup][])(
    'does not promise membership history when %s, and so offers no Membership view',
    async (_label, overrides) => {
      setup(overrides);

      const tab = await show();

      expect(labels(tab)).not.toContain('Membership');
      expect(tab.description).toBe(WITHOUT_MEMBERSHIP);
    },
  );

  it('renders nothing when the record itself failed (the layout shows that failure)', async () => {
    setup();
    getUser.mockRejectedValue(new BackendApiError(404, { code: 'resource_not_found' }));

    const element = await UserAuditPage({
      params: Promise.resolve({ userId: FELIX }),
      searchParams: Promise.resolve({}),
    });

    expect(element).toBeNull();
    expect(findUserMembership).not.toHaveBeenCalled();
  });
});
