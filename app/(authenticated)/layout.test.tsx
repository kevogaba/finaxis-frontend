import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { redirect } from 'next/navigation';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers()),
}));

const getAuthenticatedUser = vi.fn();
vi.mock('@/auth/get-authenticated-user', () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUser(...args) as unknown,
}));

const { default: AuthenticatedLayout } = await import('./layout');

describe('AuthenticatedLayout', () => {
  it('renders children when a session is present', async () => {
    getAuthenticatedUser.mockResolvedValueOnce({
      id: 'user-1',
      name: 'Jane Muthoni',
      email: 'jane.muthoni@finaxis.test',
      roles: [],
      branches: [],
    });

    const ui = await AuthenticatedLayout({ children: <div>Protected content</div> });
    render(ui);

    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('redirects to /login with reason=session_expired when there is no session', async () => {
    getAuthenticatedUser.mockResolvedValueOnce(null);

    await expect(AuthenticatedLayout({ children: <div>Protected content</div> })).rejects.toThrow(
      'NEXT_REDIRECT',
    );

    expect(redirect).toHaveBeenCalledWith('/login?reason=session_expired');
  });
});
