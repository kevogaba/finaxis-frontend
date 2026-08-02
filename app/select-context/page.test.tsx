import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { redirect } from 'next/navigation';

const { discoverOrganisations, getAuthenticatedUser, headersMock, renderedSelection } = vi.hoisted(
  () => ({
    discoverOrganisations: vi.fn(),
    getAuthenticatedUser: vi.fn(),
    headersMock: vi.fn(),
    renderedSelection: vi.fn(),
  }),
);

vi.mock('next/headers', () => ({ headers: headersMock }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));
vi.mock('@/auth/get-authenticated-user', () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUser(...args) as unknown,
}));
vi.mock('@/auth/context-service', () => ({
  discoverOrganisations: (...args: unknown[]) => discoverOrganisations(...args) as unknown,
  parseDiscoveryPageQuery: (value: string | string[] | null | undefined): number | null => {
    const firstValue = Array.isArray(value) ? value[0] : value;
    if (firstValue === null || firstValue === undefined || firstValue === '') {
      return 0;
    }
    return /^\d+$/.test(firstValue) ? Number.parseInt(firstValue, 10) : null;
  },
}));
vi.mock('@/components/context/context-selection-page', () => ({
  ContextSelectionPage: (props: Record<string, unknown>) => {
    renderedSelection(props);
    return <div>Select context mock</div>;
  },
}));

const { default: SelectContextPage } = await import('./page');

const requestHeaders = new Headers({ cookie: 'finaxis.session_token=session-value' });

describe('SelectContextPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(requestHeaders);
  });

  it('validates the Better Auth session through getAuthenticatedUser before discovery', async () => {
    getAuthenticatedUser.mockResolvedValueOnce({
      branches: [],
      email: 'jane.muthoni@finaxis.test',
      id: 'user-1',
      name: 'Jane Muthoni',
      roles: [],
    });
    discoverOrganisations.mockResolvedValueOnce({
      items: [
        {
          display_name: 'Finaxis Holdings',
          membership_id: 'membership-1',
          membership_status: 'ACTIVE',
          organisation_id: 'organisation-1',
          organisation_status: 'ACTIVE',
          tenant_code: 'FINAXIS',
        },
      ],
      page: {
        has_next: false,
        has_previous: true,
        number: 3,
        size: 25,
        total_items: 76,
        total_pages: 4,
      },
    });

    const ui = await SelectContextPage({
      searchParams: Promise.resolve({ next: '/admin/users', page: '3' }),
    });
    render(ui);

    expect(screen.getByText('Select context mock')).toBeInTheDocument();
    expect(getAuthenticatedUser).toHaveBeenCalledWith(requestHeaders);
    expect(discoverOrganisations).toHaveBeenCalledWith(requestHeaders, 3);
    expect(renderedSelection).toHaveBeenCalledWith({
      destination: '/admin/users',
      organisations: {
        items: [
          {
            displayName: 'Finaxis Holdings',
            membershipId: 'membership-1',
            membershipStatus: 'ACTIVE',
            organisationId: 'organisation-1',
            organisationStatus: 'ACTIVE',
            tenantCode: 'FINAXIS',
          },
        ],
        page: {
          hasNext: false,
          hasPrevious: true,
          number: 3,
          size: 25,
          totalItems: 76,
          totalPages: 4,
        },
      },
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('redirects missing sessions to the fixed login path before discovery', async () => {
    getAuthenticatedUser.mockResolvedValueOnce(null);

    await expect(
      SelectContextPage({ searchParams: Promise.resolve({ next: '/admin/users', page: '3' }) }),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(redirect).toHaveBeenCalledWith('/login?reason=session_expired');
    expect(discoverOrganisations).not.toHaveBeenCalled();
  });

  it('falls back to the fixed profile destination for unsafe redirect requests', async () => {
    getAuthenticatedUser.mockResolvedValueOnce({
      branches: [],
      email: 'jane.muthoni@finaxis.test',
      id: 'user-1',
      name: 'Jane Muthoni',
      roles: [],
    });
    discoverOrganisations.mockResolvedValueOnce({
      items: [],
      page: {
        has_next: false,
        has_previous: false,
        number: 0,
        size: 25,
        total_items: 0,
        total_pages: 0,
      },
    });

    const ui = await SelectContextPage({
      searchParams: Promise.resolve({ next: 'https://evil.test/admin', page: '0' }),
    });
    render(ui);

    expect(renderedSelection).toHaveBeenCalledWith({
      destination: '/profile',
      organisations: {
        items: [],
        page: {
          hasNext: false,
          hasPrevious: false,
          number: 0,
          size: 25,
          totalItems: 0,
          totalPages: 0,
        },
      },
    });
  });
});
