import type { PageMetadata } from './wire';

/** Rows-per-page options for every list (spec §6.2). Any other `size` falls back to the default. */
export const PAGE_SIZES = [10, 20, 30, 40, 50] as const;

export function parsePaging(
  params: URLSearchParams,
  defaultSize: number,
): { page: number; size: number } {
  const page = Number(params.get('page') ?? '0');
  const size = Number(params.get('size') ?? String(defaultSize));
  return {
    page: Number.isInteger(page) && page >= 0 ? page : 0,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : defaultSize,
  };
}

/**
 * The 0-based page a list should redirect to when the requested `page` is past the last one that
 * has any items (e.g. a bookmarked or hand-edited `?page=5` after the result set shrank) — `null`
 * when the requested page is in range (including an empty tenant, where nothing to redirect to).
 * Compares against `totalPages`, not just "items came back empty", so a page within range that is
 * merely empty because it's the first read of an empty tenant never redirects.
 */
export function lastPageIfPastEnd(page: PageMetadata): number | null {
  const lastPage = Math.max(0, page.totalPages - 1);
  return page.totalItems > 0 && page.number > lastPage ? lastPage : null;
}
