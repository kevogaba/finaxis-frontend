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
