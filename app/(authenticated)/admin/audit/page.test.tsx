import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { AuditFilters } from '@/modules/administration/audit/components/audit-filters';
import type { SelectedContextProfile } from '@/auth/context-service';

// A real SelectedContextProfile, checked by the type: the context could not be resolved.
const CONTEXT_NOT_SELECTED = {
  kind: 'redirect-to-context-selection',
  reason: 'invalid-context',
} satisfies SelectedContextProfile;

const { filters, getCurrentContextProfile, listAuditEvents } = vi.hoisted(() => ({
  // The props the page handed the filter bar, one entry per render of it.
  filters: [] as { actorSearch?: boolean; actorId?: string }[],
  getCurrentContextProfile: vi.fn(),
  listAuditEvents: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => {
  // The real `unstable_rethrow` for load(), plus the toolbar's hooks outside an app router.
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => '/admin/audit',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
});
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/lib/api/lookups', () => ({
  getOrganisationTimeZone: () => Promise.resolve('Africa/Nairobi'),
  getBranchIndex: () => Promise.resolve(new Map()),
  resolveUserNames: () => Promise.resolve(new Map()),
}));
vi.mock('@/modules/administration/audit/audit-service', () => ({
  listAuditEvents: (...args: unknown[]) => listAuditEvents(...args) as unknown,
  getAuditEvent: vi.fn(),
}));
// The real filter bar, recording the props the page hands it.
vi.mock('@/modules/administration/audit/components/audit-filters', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/modules/administration/audit/components/audit-filters')
    >();
  return {
    ...actual,
    AuditFilters: (props: ComponentProps<typeof AuditFilters>) => {
      filters.push({ actorSearch: props.actorSearch, actorId: props.actorId });
      return actual.AuditFilters(props);
    },
  };
});

const { default: AuditTrailPage } = await import('./page');

const VICTOR = '10000000-0000-4000-8000-000000000001';
const EMPTY_PAGE = {
  items: [],
  page: { number: 0, size: 20, totalItems: 0, totalPages: 0, hasNext: false, hasPrevious: false },
};

function signedInWith(permissions: string[]) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { permissions },
    context: { organization: { id: 'org-1', name: 'Greenfield' }, branch: null },
  });
}

type Query = Record<string, string | undefined>;
async function show(query: Query = {}) {
  renderWithProviders(await AuditTrailPage({ searchParams: Promise.resolve(query) }));
}

describe('AuditTrailPage: the actor search', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    filters.length = 0;
    listAuditEvents.mockResolvedValue(EMPTY_PAGE);
  });

  it('is offered with user.view, because it reads the tenant users', async () => {
    signedInWith(['audit.view', 'user.view']);

    await show();

    expect(filters.at(-1)?.actorSearch).toBe(true);
    expect(screen.getByRole('combobox', { name: 'Actor' })).toBeInTheDocument();
  });

  it('is not offered without user.view (the control for the case above)', async () => {
    signedInWith(['audit.view']);

    await show();

    // The page and its filter bar did render: only the search is missing.
    expect(screen.getByRole('combobox', { name: 'Entity type' })).toBeInTheDocument();
    expect(filters.at(-1)?.actorSearch).toBe(false);
    expect(screen.queryByRole('combobox', { name: 'Actor' })).not.toBeInTheDocument();
  });

  it('is not offered when the context did not resolve', async () => {
    getCurrentContextProfile.mockResolvedValue(CONTEXT_NOT_SELECTED);

    await show();

    expect(screen.getByRole('combobox', { name: 'Entity type' })).toBeInTheDocument();
    expect(filters.at(-1)?.actorSearch).toBe(false);
    expect(screen.queryByRole('combobox', { name: 'Actor' })).not.toBeInTheDocument();
  });

  it('tells the filter bar which actor is applied, so the search restarts when it changes', async () => {
    signedInWith(['audit.view', 'user.view']);

    await show({ actorId: VICTOR });

    expect(filters.at(-1)?.actorId).toBe(VICTOR);
    expect(listAuditEvents).toHaveBeenCalledWith(expect.objectContaining({ actorId: VICTOR }));
  });

  it.each([[{}], [{ actorId: 'not-a-uuid' }]])(
    'passes no actor when the URL has no valid one (%j)',
    async (query) => {
      signedInWith(['audit.view', 'user.view']);

      await show(query);

      expect(filters.length).toBeGreaterThan(0); // the filter bar did render
      expect(filters.at(-1)?.actorId).toBeUndefined();
    },
  );
});
