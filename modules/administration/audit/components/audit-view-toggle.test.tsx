import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { AuditViewToggle } from './audit-view-toggle';

// One stable router object from vi.hoisted (carried layer-05 rule).
const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => '/admin/users/u1/audit',
    useRouter: () => router,
    useSearchParams: () => new URLSearchParams('view=user&page=2'),
  };
});

const VIEWS = [
  { value: 'user', label: 'User record' },
  { value: 'membership', label: 'Membership' },
];

describe('AuditViewToggle', () => {
  it('switches the view through the URL and returns to the first page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuditViewToggle views={VIEWS} value="user" />);

    expect(screen.getByRole('group', { name: 'Audit view' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'User record' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Membership' }));

    expect(router.push).toHaveBeenCalledWith('/admin/users/u1/audit?view=membership', {
      scroll: false,
    });
  });

  it('ignores a click on the selected view', async () => {
    const user = userEvent.setup();
    router.push.mockClear();
    renderWithProviders(<AuditViewToggle views={VIEWS} value="user" />);

    await user.click(screen.getByRole('button', { name: 'User record' }));

    expect(router.push).not.toHaveBeenCalled();
  });
});
