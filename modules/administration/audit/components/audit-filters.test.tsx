import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { AuditFilters } from './audit-filters';

// One stable router object from vi.hoisted (carried layer-05 rule), as list-toolbar.test.tsx does.
const { router } = vi.hoisted(() => {
  const push = vi.fn();
  return { router: { push, replace: vi.fn(), refresh: vi.fn() } };
});
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => '/admin/audit',
    useRouter: () => router,
    useSearchParams: () => new URLSearchParams('entityType=MEMBERSHIP&action=membership.suspend'),
  };
});

describe('AuditFilters', () => {
  it('renders a URL-carried action that is out of range for its entity type, without an MUI out-of-range warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    renderWithProviders(
      <AuditFilters
        entityType="MEMBERSHIP"
        action="membership.suspend"
        resultLabel="1 event"
        actorChip={null}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Action' })).toHaveTextContent(
      'Suspended membership',
    );
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('out-of-range'));

    warn.mockRestore();
  });
});
