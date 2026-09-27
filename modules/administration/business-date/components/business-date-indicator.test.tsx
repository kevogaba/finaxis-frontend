import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

const getBusinessDate = vi.fn();
vi.mock('../business-date-service', () => ({
  getBusinessDate: () => getBusinessDate() as unknown,
}));

const { BusinessDateIndicator } = await import('./business-date-indicator');

describe('BusinessDateIndicator', () => {
  beforeEach(() => {
    getBusinessDate.mockReset();
  });

  it('links the current date and status to the business date page', async () => {
    getBusinessDate.mockResolvedValueOnce({ date: '07-09-2026', status: 'OPEN' });
    renderWithProviders(<>{await BusinessDateIndicator()}</>);

    const link = screen.getByRole('link', { name: 'Mon, 7 Sep 2026 · Business date · Open' });
    expect(link).toHaveAttribute('href', '/admin/business-date');
    expect(within(link).getByTestId('EventOutlinedIcon')).toBeInTheDocument();
  });

  it('renders nothing when the read fails, so the shell survives', async () => {
    getBusinessDate.mockRejectedValueOnce(new Error('forbidden'));
    renderWithProviders(<>{await BusinessDateIndicator()}</>);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
