import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import Button from '@mui/material/Button';
import { renderWithProviders } from '@/test/test-utils';
import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders the eyebrow, a single h1, the description, and actions', () => {
    renderWithProviders(
      <PageHeader
        eyebrow="Administration"
        title="Users & access"
        description="Create staff identities and govern access."
        actions={<Button>Invite user</Button>}
      />,
    );

    expect(screen.getByText('Administration')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Users & access' })).toBeInTheDocument();
    expect(screen.getByText('Create staff identities and govern access.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite user' })).toBeInTheDocument();
  });

  it('renders only the title when nothing else is given', () => {
    renderWithProviders(<PageHeader title="Overview" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
  });
});
