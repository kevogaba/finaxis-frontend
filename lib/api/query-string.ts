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
