import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/test-utils';
import { AuditFilters } from './audit-filters';

// One stable router object from vi.hoisted (carried layer-05 rule), as list-toolbar.test.tsx does.
const { router } = vi.hoisted(() => {
  const push = vi.fn();
  return { router: { push, replace: vi.fn(), refresh: vi.fn() } };
});
let search = 'entityType=MEMBERSHIP&action=membership.suspend';
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => '/admin/audit',
    useRouter: () => router,
    useSearchParams: () => new URLSearchParams(search),
  };
});

describe('AuditFilters', () => {
  it('renders a URL-carried action that is out of range for its entity type, without an MUI out-of-range warning', () => {
    search = 'entityType=MEMBERSHIP&action=membership.suspend';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    renderWithProviders(
      <AuditFilters
        entityType="MEMBERSHIP"
        action="membership.suspend"
        resultLabel="1 event"
        actorChip={null}
        timeZone="Africa/Nairobi"
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Action' })).toHaveTextContent(
      'Suspended membership',
    );
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('out-of-range'));

    warn.mockRestore();
  });

  // L06-M23: a raw URL entityType that parseAuditQuery drops (unknown value) must not leave the
  // Entity type Select blank-with-a-console-warning while the list stays unfiltered.
  it('falls back to "All entity types" for a URL entityType the query parser dropped', () => {
    search = 'entityType=NOPE';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    renderWithProviders(
      <AuditFilters
        entityType={undefined}
        resultLabel="30 events"
        actorChip={null}
        timeZone="Africa/Nairobi"
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Entity type' })).toHaveTextContent(
      'All entity types',
    );
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('out-of-range'));

    warn.mockRestore();
  });

  // L06-M3: an entityId filter narrows the list with no visible cue unless a chip names it.
  it('renders a removable Entity chip', () => {
    search = '';
    renderWithProviders(
      <AuditFilters
        entityType={undefined}
        resultLabel="1 event"
        actorChip={null}
        entityChip={{ label: 'Entity: User · Mary Wanjiku', removeParam: 'entityId' }}
        timeZone="Africa/Nairobi"
      />,
    );

    expect(screen.getByText('Entity: User · Mary Wanjiku')).toBeInTheDocument();
  });

  it('offers the actor search only when users can be searched', () => {
    search = '';
    const props = {
      entityType: undefined,
      resultLabel: '1 event',
      actorChip: null,
      timeZone: 'Africa/Nairobi',
    };
    const { rerender } = renderWithProviders(<AuditFilters {...props} actorSearch />);

    expect(screen.getByRole('combobox', { name: 'Actor' })).toBeInTheDocument();

    rerender(<AuditFilters {...props} />);

    // The toolbar itself is still there: the search is the only thing that went.
    expect(screen.getByRole('combobox', { name: 'Entity type' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Actor' })).not.toBeInTheDocument();

    rerender(<AuditFilters {...props} actorSearch={false} />);

    expect(screen.queryByRole('combobox', { name: 'Actor' })).not.toBeInTheDocument();
  });

  it('puts the actor search after the date fields and before the actor chip', () => {
    search = 'actorId=10000000-0000-4000-8000-00000000000a';
    renderWithProviders(
      <AuditFilters
        entityType={undefined}
        resultLabel="4 events"
        actorChip={{ label: 'Actor: Victor Otieno', removeParam: 'actorId' }}
        actorSearch
        actorId="10000000-0000-4000-8000-00000000000a"
        timeZone="Africa/Nairobi"
      />,
    );

    const to = screen.getByLabelText('To');
    const actor = screen.getByRole('combobox', { name: 'Actor' });
    const chip = screen.getByRole('button', { name: 'Actor: Victor Otieno' });
    expect(to.compareDocumentPosition(actor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actor.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Positive control for the order checks: the comparison can say "no".
    expect(chip.compareDocumentPosition(actor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeFalsy();
  });

  it('restarts the actor search (empty) once the actor filter changes, and not on any other render', () => {
    search = '';
    const props = {
      entityType: undefined,
      resultLabel: '1 event',
      actorChip: null,
      actorSearch: true,
      timeZone: 'Africa/Nairobi',
    };
    const { rerender } = renderWithProviders(<AuditFilters {...props} />);
    const first = screen.getByRole('combobox', { name: 'Actor' });

    // The same filter (a re-render for any other reason): the same control, its text kept.
    rerender(<AuditFilters {...props} resultLabel="2 events" />);
    expect(screen.getByRole('combobox', { name: 'Actor' })).toBe(first);

    // A new actor filter landed: a fresh control, so nothing typed before it is left behind.
    rerender(<AuditFilters {...props} actorId="10000000-0000-4000-8000-00000000000a" />);
    const second = screen.getByRole('combobox', { name: 'Actor' });
    expect(second).not.toBe(first);
    expect(second).toHaveValue('');

    // And the filter changing again restarts it again.
    rerender(<AuditFilters {...props} actorId="10000000-0000-4000-8000-00000000000b" />);
    expect(screen.getByRole('combobox', { name: 'Actor' })).not.toBe(second);
  });

  it('drops a record-link entityId and action when the Entity type changes', async () => {
    search = 'entityType=USER&entityId=u-1&action=user.invite';
    router.push.mockReset();
    const user = userEvent.setup();
    renderWithProviders(
      <AuditFilters
        entityType="USER"
        action="user.invite"
        resultLabel="1 event"
        actorChip={null}
        timeZone="Africa/Nairobi"
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Entity type' }));
    await user.click(screen.getByRole('option', { name: 'Membership' }));

    const pushed = String(router.push.mock.calls.at(-1)?.[0]);
    expect(pushed).toContain('entityType=MEMBERSHIP');
    expect(pushed).not.toContain('entityId');
    expect(pushed).not.toContain('action');
  });
});

describe('AuditFilters: after an actor is picked', () => {
  const VICTOR = '10000000-0000-4000-8000-00000000000a';
  const props = {
    entityType: undefined,
    resultLabel: '4 events',
    actorChip: null,
    actorSearch: true,
    timeZone: 'Africa/Nairobi',
  };

  beforeEach(() => {
    search = '';
    router.push.mockReset();
    // A fresh Response per call: a body can be read only once.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            items: [
              {
                id: VICTOR,
                displayName: 'Victor Otieno',
                email: 'victor.otieno@greenfield.example',
                username: 'victor.otieno',
                membershipStatus: 'ACTIVE',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps keyboard focus on the Actor input when the chosen actor lands, so the next Tab continues from it', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<AuditFilters {...props} />);
    await user.type(screen.getByRole('combobox', { name: 'Actor' }), 'vic');
    await screen.findByRole('option', { name: /Victor Otieno/ });
    await user.keyboard('{ArrowDown}{Enter}');
    expect(router.push).toHaveBeenCalledTimes(1);
    const before = screen.getByRole('combobox', { name: 'Actor' });

    // The server's re-render: the filter and its chip have landed.
    rerender(
      <AuditFilters
        {...props}
        actorId={VICTOR}
        actorChip={{ label: 'Actor: Victor Otieno', removeParam: 'actorId' }}
      />,
    );

    const after = screen.getByRole('combobox', { name: 'Actor' });
    expect(after).not.toBe(before); // the search did start over ...
    expect(after).toHaveValue('');
    expect(after).toHaveFocus(); // ... without dropping focus to <body>
  });
});
