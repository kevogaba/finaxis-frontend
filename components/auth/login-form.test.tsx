import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { LoginForm } from './login-form';
import { mockAuthenticate } from './mock-authenticate';
import type { MockAuthResult } from './mock-authenticate';

vi.mock('./mock-authenticate', () => ({
  mockAuthenticate: vi.fn(),
}));

const mockedAuthenticate = vi.mocked(mockAuthenticate);

describe('LoginForm', () => {
  beforeEach(() => {
    mockedAuthenticate.mockReset();
  });

  it('renders all required controls', () => {
    renderWithProviders(<LoginForm />);

    expect(screen.getByRole('textbox', { name: /email or username/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show password/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /remember me/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /forgot password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enterprise sso/i })).toBeInTheDocument();
  });

  it('shows required-field validation errors when submitted empty', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/enter your email or username/i).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/password must be at least 8 characters/i).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(mockedAuthenticate).not.toHaveBeenCalled();
  });

  it('validates malformed email-like identifiers', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByRole('textbox', { name: /email or username/i }), 'not-an-email@');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/enter a valid email address/i).length).toBeGreaterThan(0);
    });
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    const passwordInput = screen.getByLabelText(/^password$/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(passwordInput).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('shows a success notice on valid mock submission', async () => {
    mockedAuthenticate.mockResolvedValueOnce({ status: 'success' });
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(
      screen.getByRole('textbox', { name: /email or username/i }),
      'member@finaxis.test',
    );
    await user.type(screen.getByLabelText(/^password$/i), 'supersecret');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/ui foundation is ready/i)).toBeInTheDocument();
    expect(mockedAuthenticate).toHaveBeenCalledWith({
      identifier: 'member@finaxis.test',
      password: 'supersecret',
    });
  });

  it('disables the submit button while the mock request is pending', async () => {
    let resolveAuth: (value: MockAuthResult) => void = () => undefined;
    mockedAuthenticate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAuth = resolve;
        }),
    );
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(
      screen.getByRole('textbox', { name: /email or username/i }),
      'member@finaxis.test',
    );
    await user.type(screen.getByLabelText(/^password$/i), 'supersecret');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    const pendingButton = await screen.findByRole('button', { name: /signing in/i });
    expect(pendingButton).toBeDisabled();

    resolveAuth({ status: 'success' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^sign in$/i })).not.toBeDisabled(),
    );
  });

  it('shows a generic error for a locked demo account', async () => {
    mockedAuthenticate.mockResolvedValueOnce({
      status: 'error',
      message: 'We could not sign you in with those details. Check your credentials and try again.',
    });
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(
      screen.getByRole('textbox', { name: /email or username/i }),
      'locked@finaxis.test',
    );
    await user.type(screen.getByLabelText(/^password$/i), 'supersecret');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/we could not sign you in/i)).toBeInTheDocument();
  });

  it('submits via the keyboard', async () => {
    mockedAuthenticate.mockResolvedValueOnce({ status: 'success' });
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(
      screen.getByRole('textbox', { name: /email or username/i }),
      'member@finaxis.test',
    );
    await user.type(screen.getByLabelText(/^password$/i), 'supersecret{Enter}');

    expect(await screen.findByText(/ui foundation is ready/i)).toBeInTheDocument();
  });

  it('exposes accessible names and associates errors with their fields', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    const identifierInput = await screen.findByRole('textbox', { name: /email or username/i });
    expect(identifierInput).toHaveAttribute('aria-invalid', 'true');

    const passwordInput = screen.getByLabelText(/^password$/i);
    expect(passwordInput).toHaveAttribute('aria-invalid', 'true');
  });
});
