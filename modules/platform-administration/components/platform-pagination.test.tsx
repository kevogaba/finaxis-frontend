import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { PlatformPagination } from './platform-pagination';

describe('PlatformPagination', () => {
  it('preserves existing filters while building pagination links', () => {
    renderWithProviders(
      <PlatformPagination
        pathname="/platform-admin/tenants"
        page={{
          number: 1,
          size: 25,
          totalItems: 75,
          totalPages: 3,
          hasNext: true,
          hasPrevious: true,
        }}
        searchParams={{ q: 'finaxis', status: 'ACTIVE', size: '25' }}
      />,
    );

    expect(screen.getByRole('link', { name: 'Go to previous page' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants?q=finaxis&status=ACTIVE&size=25&page=0',
    );
    expect(screen.getByRole('link', { name: 'Go to next page' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants?q=finaxis&status=ACTIVE&size=25&page=2',
    );
    expect(screen.getByText(/75 results.*Page 2 of 3/)).toBeInTheDocument();
  });
});
