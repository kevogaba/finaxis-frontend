import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { AuditEventDrawer } from './audit-event-drawer';

// The real Next.js router is memoized; a fresh object per render breaks tests that assert on
// calls across re-renders (carried layer-05 rule). Return one stable router from vi.hoisted.
const { push, router } = vi.hoisted(() => {
  const push = vi.fn();
  return { push, router: { push, replace: vi.fn(), refresh: vi.fn() } };
});
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, useRouter: () => router };
});

describe('AuditEventDrawer', () => {
  it('shows event facts and pretty-printed before/after JSON, and closes to the list URL', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AuditEventDrawer
        closeHref="/admin/audit?entityType=USER"
        detail={{
          title: 'Invited user',
          occurred: '07 Sep 2026 · 10:28 (Africa/Nairobi)',
          facts: [
            { label: 'Actor', value: 'Grace Nduku' },
            { label: 'Reason', value: 'New teller' },
          ],
          before: null,
          after: '{\n  "status": "DRAFT"\n}',
          metadata: '{}',
        }}
      />,
    );

    expect(screen.getByRole('dialog', { name: /invited user/i })).toBeInTheDocument();
    expect(screen.getByText('Grace Nduku')).toBeInTheDocument();
    expect(screen.getByText(/"status": "DRAFT"/)).toBeInTheDocument();
    expect(screen.getByText('No previous state recorded.')).toBeInTheDocument();
    expect(screen.getByText('07 Sep 2026 · 10:28 (Africa/Nairobi)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(push).toHaveBeenCalledWith('/admin/audit?entityType=USER', { scroll: false });
  });
});
