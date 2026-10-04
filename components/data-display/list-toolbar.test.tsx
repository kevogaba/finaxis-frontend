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

const SEARCH_FIELDS = [
  { kind: 'search' as const, name: 'q', label: 'Search', placeholder: 'Code or name' },
];

const DATETIME_FIELDS = [{ kind: 'datetime' as const, name: 'occurredFrom', label: 'From' }];
const END_OF_MINUTE_FIELDS = [
  { kind: 'datetime' as const, name: 'occurredTo', label: 'To', endOfMinute: true },
];

const PAGE = {
  number: 0,
  size: 10,
  totalItems: 25,
  totalPages: 3,
  hasNext: true,
  hasPrevious: false,
};

// vitest.config.ts pins TZ to Africa/Nairobi, matching the org zone used below, so the browser-zone
// helper text stays hidden unless a test passes a *different* `timeZone`.
const NAIROBI = 'Africa/Nairobi';

describe('ListToolbar', () => {
  beforeEach(() => {
    push.mockReset();
    search = 'entityType=USER&page=2';
  });

  it('writes a filter to the URL and resets the page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ListToolbar fields={FIELDS} resultLabel="41 events" timeZone={NAIROBI} />);

    await user.click(screen.getByRole('combobox', { name: 'Entity type' }));
    await user.click(screen.getByRole('option', { name: 'Branch' }));

    expect(push).toHaveBeenCalledWith('/admin/audit?entityType=BRANCH', { scroll: false });
  });

  it('removes a filter when "all" is chosen and clears everything', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ListToolbar fields={FIELDS} resultLabel="41 events" timeZone={NAIROBI} />);

    await user.click(screen.getByRole('combobox', { name: 'Entity type' }));
    await user.click(screen.getByRole('option', { name: 'All entity types' }));
    expect(push).toHaveBeenCalledWith('/admin/audit', { scroll: false });

    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute(
      'href',
      '/admin/audit',
    );
  });

  it('falls back to "all" for a URL value that is not among the field options', () => {
    search = 'entityType=NOPE';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    renderWithProviders(<ListToolbar fields={FIELDS} resultLabel="30 events" timeZone={NAIROBI} />);

    expect(screen.getByRole('combobox', { name: 'Entity type' })).toHaveTextContent(
      'All entity types',
    );
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('out-of-range'));

    warn.mockRestore();
  });

  it('shows the result count as a status region with removable chips', async () => {
    search = 'actorId=0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
    const user = userEvent.setup();
    renderWithProviders(
      <ListToolbar
        fields={FIELDS}
        resultLabel="3 events"
        timeZone={NAIROBI}
        chips={[{ label: 'Actor: Jane', removeParam: 'actorId' }]}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('3 events');
    screen.getByRole('button', { name: 'Actor: Jane' }).focus();
    await user.keyboard('{Delete}');
    expect(push).toHaveBeenCalledWith('/admin/audit', { scroll: false });
  });

  it('removes a chip on Enter/Space and moves focus to Clear filters', async () => {
    search = 'actorId=0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
    const user = userEvent.setup();
    renderWithProviders(
      <ListToolbar
        fields={FIELDS}
        resultLabel="3 events"
        timeZone={NAIROBI}
        chips={[{ label: 'Actor: Jane', removeParam: 'actorId' }]}
      />,
    );

    const chip = screen.getByRole('button', { name: 'Actor: Jane' });
    chip.focus();
    await user.keyboard('{Enter}');

    expect(push).toHaveBeenCalledWith('/admin/audit', { scroll: false });
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveFocus();
  });

  it('deletes the cleared params in the same navigation when the field changes', async () => {
    search = 'entityType=USER&action=user.invite&page=2';
    const user = userEvent.setup();
    renderWithProviders(
      <ListToolbar fields={FIELDS_WITH_CLEARS} resultLabel="1 event" timeZone={NAIROBI} />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Entity type' }));
    await user.click(screen.getByRole('option', { name: 'Branch' }));

    expect(push).toHaveBeenCalledWith('/admin/audit?entityType=BRANCH', { scroll: false });
  });

  it('shows the browser zone only when it differs from the page timeZone', () => {
    search = 'page=2';
    renderWithProviders(
      <ListToolbar fields={DATETIME_FIELDS} resultLabel="1 event" timeZone="UTC" />,
    );

    expect(screen.getByText('Your local time (Africa/Nairobi)')).toBeInTheDocument();
  });

  it('shows no zone helper when the browser and page zones match', () => {
    search = 'page=2';
    renderWithProviders(
      <ListToolbar fields={DATETIME_FIELDS} resultLabel="1 event" timeZone={NAIROBI} />,
    );

    expect(screen.queryByText(/Your local time/)).not.toBeInTheDocument();
  });

  it('navigates on datetime blur only when the resulting instant changed', () => {
    search = 'page=2';
    renderWithProviders(
      <ListToolbar fields={DATETIME_FIELDS} resultLabel="1 event" timeZone={NAIROBI} />,
    );

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
    renderWithProviders(
      <ListToolbar fields={DATETIME_FIELDS} resultLabel="1 event" timeZone={NAIROBI} />,
    );

    // 10:00 UTC is 13:00 in Africa/Nairobi (+03:00): pins that the field shows local time.
    expect(screen.getByLabelText('From')).toHaveValue('2026-09-01T13:00');

    fireEvent.blur(screen.getByLabelText('From'));

    expect(push).not.toHaveBeenCalled();
  });

  it('does not navigate on an unchanged blur even when the URL instant has seconds or no milliseconds', () => {
    // toLocalInput truncates to the minute, so both of these display as the same "10:00" the user
    // never edited; comparing local forms (not ISO strings) must skip both, not just an exact
    // millisecond match.
    search = new URLSearchParams({ occurredFrom: '2026-09-01T07:00:30Z' }).toString();
    renderWithProviders(
      <ListToolbar fields={DATETIME_FIELDS} resultLabel="1 event" timeZone={NAIROBI} />,
    );

    fireEvent.blur(screen.getByLabelText('From'));

    expect(push).not.toHaveBeenCalled();
  });

  it('commits on Enter, exactly once', () => {
    search = 'page=2';
    renderWithProviders(
      <ListToolbar fields={DATETIME_FIELDS} resultLabel="1 event" timeZone={NAIROBI} />,
    );

    const field = screen.getByLabelText('From');
    fireEvent.change(field, { target: { value: '2026-09-01T10:00' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    const expectedParams = new URLSearchParams();
    expectedParams.set('occurredFrom', '2026-09-01T07:00:00.000Z');
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(`/admin/audit?${expectedParams.toString()}`, {
      scroll: false,
    });
  });

  it('skips a year the browser accepts but Date cannot parse, instead of throwing', () => {
    search = 'page=2';
    renderWithProviders(
      <ListToolbar fields={DATETIME_FIELDS} resultLabel="1 event" timeZone={NAIROBI} />,
    );

    const field = screen.getByLabelText('From');
    fireEvent.change(field, { target: { value: '10000-01-01T00:00' } });
    // jsdom keeps the typed value rather than sanitizing it away — otherwise this would pass for
    // the wrong reason (an empty value is already a no-op).
    expect(field).toHaveValue('10000-01-01T00:00');

    // A listener that throws doesn't propagate back through element.dispatchEvent() per the DOM
    // spec (and React 19 doesn't rethrow it synchronously either) — jsdom instead reports it as a
    // window 'error' event, so `expect(() => fireEvent.blur(field)).not.toThrow()` would pass
    // whether or not the RangeError guard exists. This listener is the actual, non-vacuous check.
    const onError = vi.fn();
    window.addEventListener('error', onError);
    fireEvent.blur(field);
    window.removeEventListener('error', onError);

    expect(onError).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('stores the end of the chosen minute for an endOfMinute field', () => {
    search = '';
    renderWithProviders(
      <ListToolbar fields={END_OF_MINUTE_FIELDS} resultLabel="1 event" timeZone={NAIROBI} />,
    );

    const field = screen.getByLabelText('To');
    fireEvent.change(field, { target: { value: '2026-09-01T10:00' } });
    fireEvent.blur(field);

    expect(push).toHaveBeenCalledWith(
      expect.stringMatching(/occurredTo=2026-09-01T07%3A00%3A59\.999Z$/),
      { scroll: false },
    );
  });

  it('builds a click-triggered navigation on the query a still-in-flight blur push produced', async () => {
    const user = userEvent.setup();
    search = '';
    const { rerender } = renderWithProviders(
      <>
        <ListToolbar fields={DATETIME_FIELDS} resultLabel="25 events" timeZone={NAIROBI} />
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
        <ListToolbar fields={DATETIME_FIELDS} resultLabel="25 events" timeZone={NAIROBI} />
        <TablePaginationBar page={PAGE} />
      </>,
    );
    search = '';
    rerender(
      <>
        <ListToolbar fields={DATETIME_FIELDS} resultLabel="25 events" timeZone={NAIROBI} />
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
        <ListToolbar fields={DATETIME_FIELDS} resultLabel="25 events" timeZone={NAIROBI} />
        <TablePaginationBar page={PAGE} />
      </>,
    );
    await user.click(screen.getByRole('button', { name: /next page/i }));

    expect(push).toHaveBeenLastCalledWith('/admin/audit?entityType=USER&page=1', {
      scroll: false,
    });
  });

  it('commits a trimmed search on Enter, once, and resets the page', async () => {
    search = 'status=ACTIVE&page=2';
    const user = userEvent.setup();
    renderWithProviders(
      <ListToolbar fields={SEARCH_FIELDS} resultLabel="2 branches" timeZone={NAIROBI} />,
    );

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), '  west {Enter}');

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/admin/audit?status=ACTIVE&q=west', { scroll: false });
  });

  it('skips an unchanged blur and clears the search when emptied', async () => {
    search = 'q=west';
    const user = userEvent.setup();
    renderWithProviders(
      <ListToolbar fields={SEARCH_FIELDS} resultLabel="1 branch" timeZone={NAIROBI} />,
    );
    const field = screen.getByRole('searchbox', { name: 'Search' });
    expect(field).toHaveValue('west');

    await user.click(field);
    await user.tab();
    expect(push).not.toHaveBeenCalled();

    await user.clear(field);
    await user.tab();
    expect(push).toHaveBeenCalledWith('/admin/audit', { scroll: false });
  });

  it('commits the moment the native clear (x) empties the box, without waiting for blur (V9)', async () => {
    search = 'q=west';
    const user = userEvent.setup();
    renderWithProviders(
      <ListToolbar fields={SEARCH_FIELDS} resultLabel="1 branch" timeZone={NAIROBI} />,
    );
    const field = screen.getByRole('searchbox', { name: 'Search' });
    expect(field).toHaveValue('west');

    await user.clear(field);

    // No blur/tab here: the commit must already have happened on the clearing change itself, or
    // the box (now empty) and the still-filtered results would disagree (gate finding V9).
    expect(push).toHaveBeenCalledWith('/admin/audit', { scroll: false });
    expect(field).toHaveFocus();
  });

  it('renders extra controls after the fields and before the chips', () => {
    search = 'q=west&actorId=0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
    renderWithProviders(
      <ListToolbar
        fields={SEARCH_FIELDS}
        resultLabel="3 events"
        timeZone={NAIROBI}
        chips={[{ label: 'Actor: Jane', removeParam: 'actorId' }]}
      >
        <button type="button">Extra</button>
      </ListToolbar>,
    );

    const field = screen.getByRole('searchbox', { name: 'Search' });
    const extra = screen.getByRole('button', { name: 'Extra' });
    const chip = screen.getByRole('button', { name: 'Actor: Jane' });
    const clear = screen.getByRole('link', { name: 'Clear filters' });
    const follows = (before: HTMLElement, after: HTMLElement) =>
      Boolean(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(field, extra)).toBe(true);
    expect(follows(extra, chip)).toBe(true);
    expect(follows(chip, clear)).toBe(true);
    // Positive control for the order checks: the helper can say "no".
    expect(follows(extra, field)).toBe(false);
  });

  it('resets the search box on every URL change, including back to empty (Clear filters)', () => {
    search = '';
    const { rerender } = renderWithProviders(
      <ListToolbar fields={SEARCH_FIELDS} resultLabel="6 branches" timeZone={NAIROBI} />,
    );
    const field = screen.getByRole('searchbox', { name: 'Search' });
    fireEvent.change(field, { target: { value: 'west' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    search = 'q=west'; // the commit lands
    rerender(<ListToolbar fields={SEARCH_FIELDS} resultLabel="1 branch" timeZone={NAIROBI} />);
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('west');

    search = ''; // "Clear filters": the old text must not come back, nor re-commit on blur
    rerender(<ListToolbar fields={SEARCH_FIELDS} resultLabel="6 branches" timeZone={NAIROBI} />);
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('');
  });
});
