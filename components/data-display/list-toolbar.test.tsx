import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ListToolbar } from './list-toolbar';
import { TablePaginationBar } from './table-pagination-bar';

// The real Next.js router is memoized; a fresh object per render breaks tests that assert on
// calls across re-renders. Return one stable router object from vi.hoisted instead.
const { push, router } = vi.hoisted(() => {
  const push = vi.fn();
  return { push, router: { push, replace: vi.fn(), refresh: vi.fn() } };
});

let search = 'entityType=USER&page=2';
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => '/admin/audit',
    useRouter: () => router,
    useSearchParams: () => new URLSearchParams(search),
  };
});

const FIELDS = [
  {
    kind: 'select' as const,
    name: 'entityType',
    label: 'Entity type',
    allLabel: 'All entity types',
    options: [
      { value: 'USER', label: 'User' },
      { value: 'BRANCH', label: 'Branch' },
    ],
  },
];

const FIELDS_WITH_CLEARS = [
  {
    kind: 'select' as const,
    name: 'entityType',
    label: 'Entity type',
    allLabel: 'All entity types',
    options: [
      { value: 'USER', label: 'User' },
      { value: 'BRANCH', label: 'Branch' },
    ],
    clears: ['action'] as const,
  },
];

const DATETIME_FIELDS = [{ kind: 'datetime' as const, name: 'occurredFrom', label: 'From' }];

const PAGE = {
  number: 0,
  size: 10,
  totalItems: 25,
  totalPages: 3,
  hasNext: true,
  hasPrevious: false,
};

describe('ListToolbar', () => {
  beforeEach(() => {
    push.mockReset();
    search = 'entityType=USER&page=2';
  });

  it('writes a filter to the URL and resets the page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ListToolbar fields={FIELDS} resultLabel="41 events" />);

    await user.click(screen.getByRole('combobox', { name: 'Entity type' }));
    await user.click(screen.getByRole('option', { name: 'Branch' }));

    expect(push).toHaveBeenCalledWith('/admin/audit?entityType=BRANCH', { scroll: false });
  });

  it('removes a filter when "all" is chosen and clears everything', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ListToolbar fields={FIELDS} resultLabel="41 events" />);

    await user.click(screen.getByRole('combobox', { name: 'Entity type' }));
    await user.click(screen.getByRole('option', { name: 'All entity types' }));
    expect(push).toHaveBeenCalledWith('/admin/audit', { scroll: false });

    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute(
      'href',
      '/admin/audit',
    );
  });

  it('shows the result count and removable chips', async () => {
    search = 'actorId=0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
    const user = userEvent.setup();
    renderWithProviders(
      <ListToolbar
        fields={FIELDS}
        resultLabel="3 events"
        chips={[{ label: 'Actor: Jane', removeParam: 'actorId' }]}
      />,
    );

    expect(screen.getByText('3 events')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Actor: Jane' }).focus();
    await user.keyboard('{Delete}');
    expect(push).toHaveBeenCalledWith('/admin/audit', { scroll: false });
  });

  it('deletes the cleared params in the same navigation when the field changes', async () => {
    search = 'entityType=USER&action=user.invite&page=2';
    const user = userEvent.setup();
    renderWithProviders(<ListToolbar fields={FIELDS_WITH_CLEARS} resultLabel="1 event" />);

    await user.click(screen.getByRole('combobox', { name: 'Entity type' }));
    await user.click(screen.getByRole('option', { name: 'Branch' }));

    expect(push).toHaveBeenCalledWith('/admin/audit?entityType=BRANCH', { scroll: false });
  });

  it('navigates on datetime blur only when the resulting instant changed', () => {
    search = 'page=2';
    renderWithProviders(<ListToolbar fields={DATETIME_FIELDS} resultLabel="1 event" />);

    const field = screen.getByLabelText('From');
    fireEvent.change(field, { target: { value: '2026-09-01T10:00' } });
    fireEvent.blur(field);

    // Pinned to Africa/Nairobi (vitest.config.ts): 10:00 local (+03:00) is 07:00 UTC. A literal
    // (not a computed `new Date(...).toISOString()`) so removing that TZ pin turns this red on a
    // UTC CI runner instead of silently passing.
    const iso = '2026-09-01T07:00:00.000Z';
    const expectedParams = new URLSearchParams();
    expectedParams.set('occurredFrom', iso);
    expect(push).toHaveBeenCalledWith(`/admin/audit?${expectedParams.toString()}`, {
      scroll: false,
    });
  });

  it('does not navigate on a datetime blur that leaves the instant unchanged', () => {
    const iso = '2026-09-01T10:00:00.000Z';
    search = new URLSearchParams({ occurredFrom: iso }).toString();
    renderWithProviders(<ListToolbar fields={DATETIME_FIELDS} resultLabel="1 event" />);

    // 10:00 UTC is 13:00 in Africa/Nairobi (+03:00): pins that the field shows local time.
    expect(screen.getByLabelText('From')).toHaveValue('2026-09-01T13:00');

    fireEvent.blur(screen.getByLabelText('From'));

    expect(push).not.toHaveBeenCalled();
  });

  it('builds a click-triggered navigation on the query a still-in-flight blur push produced', async () => {
    const user = userEvent.setup();
    search = '';
    const { rerender } = renderWithProviders(
      <>
        <ListToolbar fields={DATETIME_FIELDS} resultLabel="25 events" />
        <TablePaginationBar page={PAGE} />
      </>,
    );

    const field = screen.getByLabelText('From');
    fireEvent.change(field, { target: { value: '2026-09-01T10:00' } });
    fireEvent.blur(field);
    await user.click(screen.getByRole('button', { name: /next page/i }));

    // The blur's push (occurredFrom, pinned to Africa/Nairobi) hasn't committed — useSearchParams
    // still reports the pre-blur `search`. The pagination click must build on the pending query,
    // not on that stale snapshot, or the just-typed filter is lost.
    expect(push).toHaveBeenLastCalledWith(
      '/admin/audit?occurredFrom=2026-09-01T07%3A00%3A00.000Z&page=1',
      { scroll: false },
    );

    // Simulate that navigation committing, then the user going Back to the pre-blur URL — the
    // same query the pending record's `from` was keyed on. With no clearing effect, `pending.from
    // === query` would match again and resurrect the stale occurredFrom filter. The commit's own
    // render (not a click) is what must clear it.
    search = 'occurredFrom=2026-09-01T07%3A00%3A00.000Z&page=1';
    rerender(
      <>
        <ListToolbar fields={DATETIME_FIELDS} resultLabel="25 events" />
        <TablePaginationBar page={PAGE} />
      </>,
    );
    search = '';
    rerender(
      <>
        <ListToolbar fields={DATETIME_FIELDS} resultLabel="25 events" />
        <TablePaginationBar page={PAGE} />
      </>,
    );
    await user.click(screen.getByRole('button', { name: /next page/i }));

    // The stale pending record was cleared on commit, so this click builds on the real (empty)
    // query, not the resurrected occurredFrom filter.
    expect(push).toHaveBeenLastCalledWith('/admin/audit?page=1', { scroll: false });

    // A later click after an unrelated commit builds only on that real URL too.
    search = 'entityType=USER';
    rerender(
      <>
        <ListToolbar fields={DATETIME_FIELDS} resultLabel="25 events" />
        <TablePaginationBar page={PAGE} />
      </>,
    );
    await user.click(screen.getByRole('button', { name: /next page/i }));

    expect(push).toHaveBeenLastCalledWith('/admin/audit?entityType=USER&page=1', {
      scroll: false,
    });
  });
});
