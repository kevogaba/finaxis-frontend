import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { SectionHeading } from './section-heading';

describe('SectionHeading', () => {
  it('renders a breadcrumb, one h1, and the description', () => {
    renderWithProviders(
      <SectionHeading
        parentLabel="Administration"
        parentHref="/admin"
        label="Users"
        description="Invite and manage accounts."
      />,
    );

    expect(screen.getByRole('link', { name: 'Administration' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument();
    expect(screen.getByText('Invite and manage accounts.')).toBeInTheDocument();
  });
});
