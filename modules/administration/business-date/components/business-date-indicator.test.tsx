import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notFound } from 'next/navigation';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

/** A real `notFound()` throw, outside `next/navigation`'s mocks: it carries the digest shape
 * `unstable_rethrow` (real, unmocked here) recognizes and forwards (M20). */
function capturedNotFoundError(): unknown {
  try {
    notFound();
  } catch (error) {
    return error;
  }
  throw new Error('notFound() did not throw');
}

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

  it('rethrows a Next.js control-flow error instead of swallowing it as a failed read (M20)', async () => {
    const notFoundError = capturedNotFoundError();
    getBusinessDate.mockRejectedValueOnce(notFoundError);

    await expect(BusinessDateIndicator()).rejects.toBe(notFoundError);
  });
});
