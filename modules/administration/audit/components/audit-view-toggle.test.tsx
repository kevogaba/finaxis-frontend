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

  it('keeps every button its own bordered, rounded pill so a wrapped row never reads as a broken group', () => {
    // MUI assigns the grouped-middle/last styling (no left border, square inner corners) by child
    // position, not by visual row, so a 4th button already carries it in jsdom without real wrap.
    renderWithProviders(
      <AuditViewToggle
        views={[
          { value: 'user', label: 'User record' },
          { value: 'account', label: 'Account' },
          { value: 'membership', label: 'Membership' },
          { value: 'performed', label: 'Performed by' },
        ]}
        value="user"
      />,
    );
    const last = getComputedStyle(screen.getByRole('button', { name: 'Performed by' }));
    expect(last.marginLeft).toBe('0px');

    // The radius/border-color reset is expressed through this theme's CSS custom properties (so
    // it still tracks dark mode), and jsdom's computed style doesn't resolve `var()` inside a
    // shorthand (a jsdom limitation the theme render test works around the same way) — so read
    // the generated rule directly and prove it wins the group's own corner/border override by
    // outright higher specificity (a doubled root class), not just stylesheet order.
    const css = [...document.querySelectorAll('style')].map((el) => el.textContent).join('\n');
    const doubled =
      /\.(css-[\w-]+-MuiToggleButtonGroup-root)\.\1 \.MuiToggleButtonGroup-grouped\{([^}]*)\}/.exec(
        css,
      );
    if (!doubled) throw new Error('expected a doubled-root override rule for .grouped');
    const [, , overrideBody] = doubled;
    expect(overrideBody).toContain('margin:0');
    expect(overrideBody).toContain('border-left:1px solid');
    expect(overrideBody).toMatch(/border-radius:/);
  });
});
