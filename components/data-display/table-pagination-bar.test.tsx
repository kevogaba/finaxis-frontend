import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { TablePaginationBar } from './table-pagination-bar';

// The real Next.js router is memoized; a fresh object per render breaks tests that assert on
// calls across re-renders. Return one stable router object from vi.hoisted instead.
const { push, router } = vi.hoisted(() => {
  const push = vi.fn();
  return { push, router: { push, replace: vi.fn(), refresh: vi.fn() } };
});

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => '/admin/audit',
    useRouter: () => router,
    useSearchParams: () => new URLSearchParams('entityType=USER'),
  };
});

const PAGE = {
  number: 0,
  size: 10,
  totalItems: 25,
  totalPages: 3,
  hasNext: true,
  hasPrevious: false,
};

describe('TablePaginationBar', () => {
  beforeEach(() => {
    push.mockReset();
  });

  it('moves to the next page keeping filters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TablePaginationBar page={PAGE} />);

    await user.click(screen.getByRole('button', { name: /next page/i }));
    expect(push).toHaveBeenCalledWith('/admin/audit?entityType=USER&page=1', { scroll: false });
  });

  it('changes rows per page and returns to the first page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TablePaginationBar page={{ ...PAGE, number: 2 }} />);

    await user.click(screen.getByRole('combobox', { name: /rows per page/i }));
    await user.click(screen.getByRole('option', { name: '50' }));
    expect(push).toHaveBeenCalledWith('/admin/audit?entityType=USER&size=50', { scroll: false });
  });
});
