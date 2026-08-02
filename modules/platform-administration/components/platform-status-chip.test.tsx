import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { PlatformStatusChip } from './platform-status-chip';

describe('PlatformStatusChip', () => {
  it('renders a visible text label instead of relying on color alone', () => {
    renderWithProviders(<PlatformStatusChip status="pending_review" />);

    expect(screen.getByText('Pending Review')).toBeInTheDocument();
    expect(screen.getByLabelText('Status: Pending Review')).toBeInTheDocument();
  });

  it.each(['ACTIVE', 'SUCCESS', 'SUSPENDED', 'REJECTED', 'FAILED', 'DRAFT', undefined])(
    'maps %s to a visible status label',
    (status) => {
      renderWithProviders(<PlatformStatusChip status={status} />);

      expect(screen.getByLabelText(/^Status:/)).toBeInTheDocument();
    },
  );

  it('does not render INACTIVE with the success (active) color', () => {
    renderWithProviders(<PlatformStatusChip status="INACTIVE" />);

    const chip = screen.getByLabelText('Status: Inactive');
    expect(chip.className).not.toMatch(/success/i);
  });
});
