import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import AdminOverviewPage from './page';

describe('AdminOverviewPage', () => {
  it('renders one h1 and quick links to each management area', () => {
    renderWithProviders(<AdminOverviewPage />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: /manage users/i })).toHaveAttribute(
      'href',
      '/admin/users',
    );
    expect(screen.getByRole('link', { name: /manage branches/i })).toHaveAttribute(
      'href',
      '/admin/branches',
    );
    expect(screen.getByRole('link', { name: /review roles/i })).toHaveAttribute(
      'href',
      '/admin/roles',
    );
    expect(screen.getByRole('link', { name: /open audit logs/i })).toHaveAttribute(
      'href',
      '/admin/audit',
    );
    expect(screen.getByRole('link', { name: /open settings/i })).toHaveAttribute(
      'href',
      '/admin/settings',
    );
  });

  it('labels summary figures as sample data rather than implying they are live', () => {
    renderWithProviders(<AdminOverviewPage />);
    expect(screen.getByText(/sample data/i)).toBeInTheDocument();
  });
});
