import { describe, expect, it } from 'vitest';
import Button from '@mui/material/Button';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { RecordHero } from './record-hero';
import { StatusChip } from './status-chip';

describe('RecordHero', () => {
  it('renders the back link, the only h1, eyebrow, subtitle, status, and actions', () => {
    renderWithProviders(
      <RecordHero
        back={{ href: '/admin/branches', label: 'Back to branches' }}
        avatar={{ kind: 'icon', icon: <AccountTreeOutlined /> }}
        eyebrow="Administration · Branch record"
        title="Westlands Branch"
        subtitle="WESTLANDS · Operations"
        status={<StatusChip value="SUSPENDED" />}
        actions={<Button>Reactivate</Button>}
      />,
    );

    expect(screen.getByRole('link', { name: 'Back to branches' })).toHaveAttribute(
      'href',
      '/admin/branches',
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Westlands Branch' })).toBeInTheDocument();
    expect(screen.getByText('Administration · Branch record')).toBeInTheDocument();
    expect(screen.getByText('WESTLANDS · Operations')).toBeInTheDocument();
    expect(screen.getByText('Suspended')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
  });

  it('shows a person as decorative initials and needs no back link', () => {
    renderWithProviders(
      <RecordHero
        avatar={{ kind: 'person', name: 'Mary Wanjiku' }}
        eyebrow="Administration · User record"
        title="Mary Wanjiku"
      />,
    );

    expect(screen.getByText('MW')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('heading', { level: 1, name: 'Mary Wanjiku' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
