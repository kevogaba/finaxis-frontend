import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { AuditActorPicker } from './audit-actor-picker';

// One stable router object from vi.hoisted (carried layer-05 rule), as audit-view-toggle.test.tsx.
const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => '/admin/audit',
    useRouter: () => router,
    useSearchParams: () => new URLSearchParams('entityType=USER&page=2&event=e1'),
  };
});

const VICTOR = '10000000-0000-4000-8000-00000000000a';
const VICTOR_OPTION = {
  id: VICTOR,
  displayName: 'Victor Otieno',
  email: 'victor.otieno@greenfield.example',
  username: 'victor.otieno',
  membershipStatus: 'ACTIVE',
};

// A fresh Response per call: a body can be read only once (as user-picker.test.tsx).
const respond = (body: unknown) => () =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

describe('AuditActorPicker', () => {
  beforeEach(() => {
    router.push.mockReset();
    vi.spyOn(globalThis, 'fetch').mockImplementation(respond({ items: [VICTOR_OPTION] }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters by the chosen user and returns to the first page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuditActorPicker />);

    await user.type(screen.getByRole('combobox', { name: 'Actor' }), 'vic');
    await user.click(await screen.findByRole('option', { name: /Victor Otieno/ }));

    expect(router.push).toHaveBeenCalledTimes(1);
    const [href, options] = router.push.mock.lastCall ?? [];
    const url = new URL(String(href), 'http://localhost');
    expect(url.pathname).toBe('/admin/audit');
    expect(url.searchParams.get('actorId')).toBe(VICTOR);
    // The other filters stay; the page and the open event do not.
    expect(url.searchParams.get('entityType')).toBe('USER');
    expect(url.searchParams.has('page')).toBe(false);
    expect(url.searchParams.has('event')).toBe(false);
    expect(options).toEqual({ scroll: false });
  });

  it('searches the tenant users by what was typed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuditActorPicker />);

    await user.type(screen.getByRole('combobox', { name: 'Actor' }), 'vic');
    await screen.findByRole('option', { name: /Victor Otieno/ });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(globalThis.fetch).mock.calls[0]?.[0]).toBe('/api/tenant/users?q=vic');
  });

  it('does not navigate when the typed text drops the choice (no actorId to filter by)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuditActorPicker />);
    const input = screen.getByRole('combobox', { name: 'Actor' });
    await user.type(input, 'vic');
    await user.click(await screen.findByRole('option', { name: /Victor Otieno/ }));
    // Positive control: the choice itself navigated, once.
    expect(router.push).toHaveBeenCalledTimes(1);

    // A handler that throws doesn't reach the test as an exception (React reports it as a window
    // 'error' event), so listen for that: otherwise a crash on the picker's `null` would pass.
    const onError = vi.fn();
    window.addEventListener('error', onError);
    await user.type(input, 'x');
    window.removeEventListener('error', onError);

    expect(onError).not.toHaveBeenCalled();
    // The picker reported `null` here; no second navigation, so the filter is left as it was.
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});
