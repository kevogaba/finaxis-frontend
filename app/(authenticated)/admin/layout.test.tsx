import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { redirect } from 'next/navigation';

const getCurrentContextProfile = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));

const { default: AdministrationLayout } = await import('./layout');

describe('AdministrationLayout', () => {
  it('renders tenant pages for a tenant context', async () => {
    getCurrentContextProfile.mockResolvedValueOnce({
      kind: 'resolved',
      context: { module: { id: 'administration', name: 'Administration' } },
    });
    render(await AdministrationLayout({ children: <div>Tenant page</div> }));
    expect(screen.getByText('Tenant page')).toBeInTheDocument();
  });

  it('sends platform contexts to the platform workspace', async () => {
    getCurrentContextProfile.mockResolvedValueOnce({
      kind: 'resolved',
      context: { module: { id: 'platform-administration', name: 'Platform Administration' } },
    });
    await expect(AdministrationLayout({ children: <div /> })).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/platform-admin');
  });
});
