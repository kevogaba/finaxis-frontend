import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

const signInSocial = vi.fn();

vi.mock('@/auth/auth-client', () => ({
  authClient: {
    signIn: {
      social: (...args: unknown[]) =>
        signInSocial(...args) as Promise<{ error?: { message: string } }>,
    },
  },
}));

const { ContinueWithKeycloakButton } = await import('./continue-with-keycloak-button');

describe('ContinueWithKeycloakButton', () => {
  // The mock is module-scoped (needed so vi.mock's factory can close over it),
  // so its call history must be cleared between tests — otherwise assertions
  // like `toHaveBeenCalledTimes(1)` see calls left over from earlier tests.
  beforeEach(() => {
    signInSocial.mockClear();
  });

  it('initiates Keycloak OAuth sign-in with the correct provider id and destinations', async () => {
    signInSocial.mockResolvedValueOnce({ error: undefined });
    const user = userEvent.setup();
    renderWithProviders(<ContinueWithKeycloakButton />);

    await user.click(screen.getByRole('button', { name: /continue to finaxis/i }));

    expect(signInSocial).toHaveBeenCalledWith({
      provider: 'keycloak',
      callbackURL: '/admin',
      errorCallbackURL: '/login?error=authentication_failed',
    });
  });

  it('disables the button and shows a loading label while redirecting', async () => {
    let resolveSignIn: (value: { error?: undefined }) => void = () => undefined;
    signInSocial.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve;
        }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ContinueWithKeycloakButton />);

    const button = screen.getByRole('button', { name: /continue to finaxis/i });
    await user.click(button);

    expect(screen.getByRole('button', { name: /redirecting/i })).toBeDisabled();
    resolveSignIn({ error: undefined });
  });

  it('prevents a second submission while a redirect is in flight', async () => {
    signInSocial.mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves within this test */
        }),
    );
    // MUI's disabled Button styling sets `pointer-events: none`, which is
    // real, meaningful CSS in this jsdom run (vitest.config.ts has
    // `css: true`). userEvent's default pointer-events guard would refuse to
    // dispatch the second click, but the intent of this test is to confirm
    // that a click reaching the handler while a redirect is already in
    // flight is a no-op — so the guard is disabled here rather than relying
    // on userEvent's simulated pointer-events check to stand in for it.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithProviders(<ContinueWithKeycloakButton />);

    const button = screen.getByRole('button', { name: /continue to finaxis/i });
    await user.click(button);
    await user.click(screen.getByRole('button', { name: /redirecting/i }));

    expect(signInSocial).toHaveBeenCalledTimes(1);
  });

  it('shows an accessible error message when sign-in fails to start', async () => {
    signInSocial.mockResolvedValueOnce({ error: { message: 'network error' } });
    const user = userEvent.setup();
    renderWithProviders(<ContinueWithKeycloakButton />);

    await user.click(screen.getByRole('button', { name: /continue to finaxis/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't start the sign-in/i);
    expect(screen.getByRole('button', { name: /continue to finaxis/i })).toBeEnabled();
  });

  it('shows an accessible error message and re-enables the button when sign-in rejects', async () => {
    signInSocial.mockRejectedValueOnce(new Error('network error'));
    const user = userEvent.setup();
    renderWithProviders(<ContinueWithKeycloakButton />);

    await user.click(screen.getByRole('button', { name: /continue to finaxis/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't start the sign-in/i);
    expect(screen.getByRole('button', { name: /continue to finaxis/i })).toBeEnabled();
  });
});
