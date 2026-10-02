import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { humanizeEnum, StatusChip, statusTone } from './status-chip';

describe('status chip', () => {
  it('humanizes backend enums', () => {
    expect(humanizeEnum('PENDING_APPROVAL')).toBe('Pending approval');
    expect(humanizeEnum('ACTIVE')).toBe('Active');
    expect(humanizeEnum('PROVISIONING_IDP')).toBe('Provisioning idp');
  });

  it.each([
    ['ACTIVE', 'success'],
    ['SUCCESS', 'success'],
    ['COMPLETED', 'success'],
    ['PENDING_APPROVAL', 'warning'],
    ['DRAFT', 'warning'],
    ['SUSPENDED', 'error'],
    ['DENIED', 'error'],
    ['FAILURE', 'error'],
    ['HIGH', 'error'],
    ['MEDIUM', 'warning'],
    ['INFO', 'default'],
    ['SOMETHING_NEW', 'default'],
  ])('%s has the %s tone', (value, tone) => {
    expect(statusTone(value)).toBe(tone);
  });

  it('renders the label as text, never colour alone', () => {
    renderWithProviders(<StatusChip value="PENDING_APPROVAL" />);
    expect(screen.getByText('Pending approval')).toBeInTheDocument();
  });
});
