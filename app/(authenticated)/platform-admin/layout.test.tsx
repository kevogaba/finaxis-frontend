import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { REQUEST_PATHNAME_HEADER } from '@/auth/auth.types';

const getSelectedContextProfile = vi.fn();

vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers()),
}));

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    redirect: vi.fn(() => {
      throw new Error('NEXT_REDIRECT');
    }),
    usePathname: () => '/platform-admin/tenants/tenant-1',
  };
});

vi.mock('@/auth/context-service', () => ({
  getSelectedContextProfile: (...args: unknown[]) => getSelectedContextProfile(...args) as unknown,
}));

const { default: PlatformAdministrationLayout } = await import('./layout');

describe('PlatformAdministrationLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the platform navigation with nested route active semantics', async () => {
    getSelectedContextProfile.mockResolvedValueOnce({
      context: {
        branch: { id: 'branch-1', name: 'Platform HQ' },
        module: { id: 'platform-administration', name: 'Platform Administration' },
        organization: {
          id: '8d0cb4e6-521a-4e51-bac0-e4d938c0ee76',
          name: 'Finaxis Platform',
        },
      },
      kind: 'resolved',
    });

    const ui = await PlatformAdministrationLayout({ children: <div>Tenant detail</div> });
    renderWithProviders(ui);

    expect(screen.getByRole('navigation', { name: 'Platform Administration' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Overview' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Tenants' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getAllByRole('link', { name: 'Audit Events' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Tenant detail')).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('redirects tenant contexts away from the platform workspace before rendering children', async () => {
    getSelectedContextProfile.mockResolvedValueOnce({
      context: {
        branch: { id: 'branch-2', name: 'Tenant HQ' },
        module: { id: 'administration', name: 'Administration' },
        organization: {
          id: '9b4c0317-9d61-41d7-a68d-5713ad5b3db2',
          name: 'Tenant SACCO',
        },
      },
      kind: 'resolved',
    });

    await expect(
      PlatformAdministrationLayout({ children: <div>Should not render</div> }),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(redirect).toHaveBeenCalledWith('/admin');
    expect(screen.queryByText('Should not render')).not.toBeInTheDocument();
  });

  it('preserves the originally requested platform-admin path through context selection', async () => {
    vi.mocked(headers).mockResolvedValueOnce(
      new Headers({ [REQUEST_PATHNAME_HEADER]: '/platform-admin/tenants' }),
    );
    getSelectedContextProfile.mockResolvedValueOnce({
      kind: 'redirect-to-context-selection',
      reason: 'missing-context-token',
    });

    await expect(
      PlatformAdministrationLayout({ children: <div>Should not render</div> }),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(redirect).toHaveBeenCalledWith('/select-context?next=%2Fplatform-admin%2Ftenants');
  });
});
