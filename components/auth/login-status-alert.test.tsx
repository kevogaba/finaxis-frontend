import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { LoginStatusAlert } from './login-status-alert';

describe('LoginStatusAlert', () => {
  it('renders nothing when there is no error or reason', () => {
    renderWithProviders(<LoginStatusAlert />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders a generic message for authentication_failed without protocol details', () => {
    renderWithProviders(<LoginStatusAlert error="authentication_failed" />);
    const alert = screen.getByRole('status');
    expect(alert).toHaveTextContent(/couldn't sign you in/i);
    expect(alert).not.toHaveTextContent(/oauth|token|keycloak/i);
  });

  it('renders a session-expired message', () => {
    renderWithProviders(<LoginStatusAlert reason="session_expired" />);
    expect(screen.getByRole('status')).toHaveTextContent(/session has expired/i);
  });

  it('renders a logged-out message', () => {
    renderWithProviders(<LoginStatusAlert reason="logged_out" />);
    expect(screen.getByRole('status')).toHaveTextContent(/signed out/i);
  });

  it('ignores an unrecognized reason rather than showing a blank alert', () => {
    renderWithProviders(<LoginStatusAlert reason="something_unexpected" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
