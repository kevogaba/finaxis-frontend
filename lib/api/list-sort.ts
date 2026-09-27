/**
 * List sort state in the URL (`sortBy`, `sortDir`) → the backend's `sort_by`/`sort_dir` (spec
 * §6.2). `sort_by` values are camelCase and endpoint-specific; anything outside the caller's
 * allow-list is dropped before the request — the backend answers an unknown value with a 500.
 * Import-free (like paging.ts) so a client sort control can use it.
 */
export type SortDir = 'ASC' | 'DESC';

export interface ListSort<Field extends string> {
  by: Field;
  dir: SortDir;
}

export function parseListSort<Field extends string>(
  params: URLSearchParams,
  allowed: readonly Field[],
  fallback: ListSort<Field>,
): ListSort<Field> {
  const requested = params.get('sortBy');
  const by = allowed.find((field) => field === requested);
  if (by === undefined) return fallback;
  return { by, dir: params.get('sortDir')?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC' };
}

export function sortQuery<Field extends string>(
  sort: ListSort<Field>,
): { sort_by: Field; sort_dir: SortDir } {
  return { sort_by: sort.by, sort_dir: sort.dir };
}
