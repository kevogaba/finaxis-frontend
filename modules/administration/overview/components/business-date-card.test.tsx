import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import type { CurrentBusinessDate } from '@/modules/administration/business-date/business-date-contract';
import { renderWithProviders } from '@/test/test-utils';

const { getBusinessDate } = vi.hoisted(() => ({
  getBusinessDate: vi.fn<() => Promise<CurrentBusinessDate>>(),
}));

// `load()`'s catch reads the request headers; `next/navigation` stays real, so `redirect()` throws
// its digest as in production (as the bell's test).
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/modules/administration/business-date/business-date-service', () => ({
  getBusinessDate: () => getBusinessDate(),
}));

const { BusinessDateSection } = await import('./business-date-card');
const { OverviewCardSkeleton } = await import('./overview-card-skeleton');

const REFERENCE = '14a10000-0000-4000-8000-0000000000aa';

async function show() {
  return renderWithProviders(<>{await BusinessDateSection()}</>);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('BusinessDateSection', () => {
  it('shows the date with no timezone shift, its status, and a link to the page', async () => {
    getBusinessDate.mockResolvedValue({ date: '07-09-2026', status: 'CLOSED' });
    await show();

    const card = screen.getByRole('region', { name: 'Business date' });
    expect(within(card).getByRole('heading', { level: 2, name: 'Business date' })).toBeVisible();
    expect(within(card).getByText('Monday, 7 September 2026')).toBeInTheDocument();
    expect(within(card).getByText('Closed')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Open business date' })).toHaveAttribute(
      'href',
      '/admin/business-date',
    );
  });

  it('shows a failed read with its reference, in place of the date', async () => {
    getBusinessDate.mockRejectedValue(new BackendApiError(503, { requestId: REFERENCE }));
    await show();

    const card = screen.getByRole('region', { name: 'Business date' });
    expect(within(card).getByRole('alert')).toHaveTextContent(`Reference: ${REFERENCE}`);
    expect(within(card).queryByText(/2026/)).not.toBeInTheDocument();
  });

  it.each([
    ['a lost session to sign-in', new BackendApiError(401), ';/login?reason=session_expired;'],
    [
      'a stale context to context selection',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      ';/select-context;',
    ],
  ])('sends %s instead of showing a failure', async (_case, error, digest) => {
    getBusinessDate.mockRejectedValue(error);
    await expect(BusinessDateSection()).rejects.toMatchObject({
      digest: expect.stringContaining(digest) as unknown,
    });
  });
});

describe('OverviewCardSkeleton', () => {
  it('names the card at once and marks its body busy', () => {
    renderWithProviders(<OverviewCardSkeleton title="Recent activity" />);

    const card = screen.getByRole('region', { name: 'Recent activity' });
    expect(within(card).getByRole('heading', { level: 2, name: 'Recent activity' })).toBeVisible();
    expect(card.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
