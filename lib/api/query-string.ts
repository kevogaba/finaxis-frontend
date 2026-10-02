function queryFromParams(params: URLSearchParams): URLSearchParams {
  const result = new URLSearchParams();
  for (const [key, value] of params) {
    if (value !== '') result.set(key, value);
  }
  return result;
}

export function toQueryString(query: Record<string, string | number | undefined>): string {
  const params = queryFromParams(
    new URLSearchParams(
      Object.entries(query)
        .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
        .map(([key, value]) => [key, String(value)]),
    ),
  );
  const value = params.toString();
  return value ? `?${value}` : '';
}

/** A page's awaited `searchParams` as `URLSearchParams` (first value wins; empty values dropped). */
export function toSearchParams(
  record: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  Object.entries(record).forEach(([key, value]) => {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) params.set(key, first);
  });
  return params;
}

/** `pathname` with `params` plus `changes` applied (`null` deletes a key). */
export function hrefWith(
  pathname: string,
  params: URLSearchParams,
  changes: Record<string, string | null>,
): string {
  const next = new URLSearchParams(params);
  Object.entries(changes).forEach(([key, value]) => {
    if (value === null) next.delete(key);
    else next.set(key, value);
  });
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}
