import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
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

type User = ReturnType<typeof userEvent.setup>;

/** Types, then picks the first match with the keyboard alone: focus never leaves the input. */
async function pickByKeyboard(user: User) {
  await user.type(screen.getByRole('combobox', { name: 'Actor' }), 'vic');
  await screen.findByRole('option', { name: /Victor Otieno/ });
  await user.keyboard('{ArrowDown}{Enter}');
}

const actorInput = () => screen.getByRole('combobox', { name: 'Actor' });

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

    // Only the last search matters: under load the picker's 300 ms debounce can also fire for
    // 'v' or 'vi' between two keystrokes, so neither the call count nor the first call is stable.
    await waitFor(() => {
      expect(vi.mocked(globalThis.fetch).mock.lastCall?.[0]).toBe('/api/tenant/users?q=vic');
    });
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

  it('puts keyboard focus back on the Actor input once the chosen actor lands', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<AuditActorPicker />);
    await pickByKeyboard(user);
    expect(router.push).toHaveBeenCalledTimes(1);
    const before = actorInput();
    expect(before).toHaveFocus(); // the keyboard pick left it there

    // The page re-renders with the new filter: the picker starts over, empty, on a fresh input.
    rerender(<AuditActorPicker actorId={VICTOR} />);

    expect(actorInput()).not.toBe(before);
    expect(actorInput()).toHaveValue('');
    expect(actorInput()).toHaveFocus();
  });

  it('does not take focus on a first render that already has an actor applied', () => {
    renderWithProviders(<AuditActorPicker actorId={VICTOR} />);

    expect(actorInput()).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  it('does not take focus when the actor changed without a pick here (Back, chip removal)', () => {
    const { rerender } = renderWithProviders(<AuditActorPicker actorId={VICTOR} />);

    rerender(<AuditActorPicker />);

    expect(actorInput()).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  it('leaves focus where the user moved it while the new filter was landing', async () => {
    const user = userEvent.setup();
    const page = (actorId?: string) => (
      <>
        <AuditActorPicker actorId={actorId} />
        <button type="button">Elsewhere</button>
      </>
    );
    const { rerender } = renderWithProviders(page());
    await pickByKeyboard(user);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();

    rerender(page(VICTOR));

    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
    expect(actorInput()).not.toHaveFocus();
  });

  it('does not navigate when the actor already applied is picked again, and clears the stale name', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuditActorPicker actorId={VICTOR} />);

    await pickByKeyboard(user);

    expect(router.push).not.toHaveBeenCalled();
    // The chip already names Victor; the box must not keep "Victor Otieno" beside it.
    expect(actorInput()).toHaveValue('');
    expect(actorInput()).toHaveFocus();
  });
});
