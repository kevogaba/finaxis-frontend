import { describe, expect, it, vi } from 'vitest';
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
