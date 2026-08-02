import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { PlatformPageShell } from './platform-page-shell';

describe('PlatformPageShell', () => {
  it('renders the heading, description, breadcrumbs, and page content', () => {
    renderWithProviders(
      <PlatformPageShell
        title="Tenant detail"
        description="Inspect the selected tenant without performing write actions."
        breadcrumbs={[
          { href: '/platform-admin', label: 'Overview' },
          { href: '/platform-admin/tenants', label: 'Tenants' },
          { label: 'Tenant detail' },
        ]}
      >
        <div>Tenant body</div>
      </PlatformPageShell>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Tenant detail' })).toBeInTheDocument();
    expect(
      screen.getByText('Inspect the selected tenant without performing write actions.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/platform-admin',
    );
    expect(screen.getByText('Tenant body')).toBeInTheDocument();
  });
});
