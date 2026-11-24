import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** A UUID in its 8-4-4-4-12 text form, either case (the backend's UUID decode ignores case). */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Violation {
  field: string;
  code: string;
  message: string;
}

export interface Problem {
  status: number;
  code: string;
  detail: string;
  violations?: Violation[] | null;
  /** A 401's RFC 6750 challenge parameters (`error`, `error_description`, `error_uri`), without
   * the scheme; `sendProblem` adds `resource_metadata` as the platform does. */
  challenge?: string;
}

/** Thrown by handlers; rendered as problem+json by the server (mirrors ApiExceptionHandler). */
export class ProblemError extends Error {
  readonly problem: Problem;

  constructor(value: Problem) {
    super(value.detail);
    this.name = 'ProblemError';
    this.problem = value;
  }
}

export function problem(
  status: number,
  code: string,
  detail: string,
  violations: Violation[] | null = null,
): ProblemError {
  return new ProblemError({ status, code, detail, violations });
}

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'X-Request-Id': randomUUID(),
    ...headers,
  });
  res.end(JSON.stringify(body));
}

export function sendNoContent(res: ServerResponse, headers: Record<string, string> = {}): void {
  res.writeHead(204, { 'X-Request-Id': randomUUID(), ...headers });
  res.end();
}

/** Spring Security's `BearerTokenAuthenticationEntryPoint` challenge: the error's parameters, if
 * any, then the RFC 9728 `resource_metadata` URL on the request's own origin, so a missing token
 * gets a bare `Bearer resource_metadata="…"` (the platform's ApiAuthenticationEntryPoint). */
function bearerChallenge(parameters: string | undefined, origin: string): string {
  const metadata = `resource_metadata="${origin}/.well-known/oauth-protected-resource"`;
  return `Bearer ${parameters ? `${parameters}, ${metadata}` : metadata}`;
}

export function sendProblem(
  res: ServerResponse,
  instance: string,
  value: Problem,
  origin: string,
): void {
  const requestId = randomUUID();
  res.writeHead(value.status, {
    'Content-Type': 'application/problem+json;charset=UTF-8',
    'X-Request-Id': requestId,
    ...(value.status === 401 && {
      'WWW-Authenticate': bearerChallenge(value.challenge, origin),
    }),
  });
  res.end(
    JSON.stringify({
      type: `urn:finaxis:problem:${value.code}`,
      title: TITLES[value.status] ?? 'Error',
      status: value.status,
      detail: value.detail,
      instance,
      code: value.code,
      request_id: requestId,
      violations: value.violations ?? null,
    }),
  );
}

export async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    // Mirrors ApiExceptionHandler.invalidJson: every HttpMessageNotReadableException (malformed
    // JSON, unrecognized/camelCase property, missing/mistyped field) gets this one generic detail
    // — the backend never discloses which field, only the request_id for log correlation.
    throw problem(400, 'invalid_json', 'Malformed request body.');
  }
}

/** Mirrors ApiJsonCodec: a JSON object whose keys are all known snake_case properties. */
export function objectBody(body: unknown, allowedKeys: readonly string[]): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw problem(400, 'invalid_json', 'Malformed request body.');
  }
  const unknownKey = Object.keys(body).find((key) => !allowedKeys.includes(key));
  if (unknownKey !== undefined) {
    throw problem(400, 'invalid_json', 'Malformed request body.');
  }
  return body as Record<string, unknown>;
}

export function stringField(
  body: Record<string, unknown>,
  key: string,
  options: { required: boolean },
): string | null {
  const value = body[key];
  if (value === undefined || value === null) {
    if (options.required) {
      throw problem(400, 'invalid_json', 'Malformed request body.');
    }
    return null;
  }
  if (typeof value !== 'string') {
    throw problem(400, 'invalid_json', 'Malformed request body.');
  }
  return value;
}

/** A mutation's `reason` (contract §D). Required: 3–500 characters, else `validation_failed`.
 * Optional: returned as sent, so a caller that caps it does so itself. */
export function reasonField(body: Record<string, unknown>, required: boolean): string | null {
  const reason = stringField(body, 'reason', { required });
  if (required && (reason === null || reason.trim().length < 3 || reason.length > 500)) {
    throw problem(400, 'validation_failed', 'Validation failed.', [
      { field: 'reason', code: 'Size', message: 'size must be between 3 and 500' },
    ]);
  }
  return reason;
}

/**
 * TimeZoneRule (#276): an IANA id, spelled exactly; a raw offset (`+03:00`) is refused although
 * `Intl` formats with it. ponytail: the runtime's list (through a link such as `Asia/Kolkata`), UTC
 * and the `Etc/GMT` offsets stand in for the JDK's zone list.
 */
export function isIanaZone(value: string): boolean {
  let zone: string;
  try {
    zone = new Intl.DateTimeFormat('en-GB', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return false;
  }
  // TimeZoneRule matches the JDK's ids exactly: a wrong-case spelling and the few ids the JDK
  // leaves out are refused, though the runtime resolves them.
  if (
    ['EST', 'MST', 'HST', 'ROC', 'GMT+0', 'GMT-0', 'US/Pacific-New'].includes(value) ||
    (value !== zone && value.toLowerCase() === zone.toLowerCase())
  ) {
    return false;
  }
  return (
    /^[A-Z]/.test(value) &&
    (zone === 'UTC' ||
      /^Etc\/GMT[+-]\d{1,2}$/.test(zone) ||
      Intl.supportedValuesOf('timeZone').includes(zone))
  );
}

function intParam(
  query: URLSearchParams,
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const raw = query.get(name);
  if (raw === null) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    // L0 (live finding): bad paging is `invalid_parameter` with no violations on every paged
    // route, not the auth-only `validation_failed` quirk the fake used to carve out.
    throw problem(400, 'invalid_parameter', `Invalid ${name}.`);
  }
  return value;
}

/** Contract §A `instant`: ISO-8601 UTC with a literal `Z` — a date-only value is not one. */
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * Mirrors the backend binding an instant-typed query parameter (e.g. `created_from`/`created_to`,
 * `occurred_from`/`occurred_to`) as `Instant`: compares by time, not by string, so an inclusive
 * upper bound on an exact timestamp still matches. An absent or blank value means "no filter"; a
 * present value that isn't a valid instant is a 400 (contract §B).
 */
export function parseInstantParam(query: URLSearchParams, name: string): number | undefined {
  const value = query.get(name);
  if (!value) {
    return undefined;
  }
  const time = INSTANT_PATTERN.test(value) ? Date.parse(value) : NaN;
  if (Number.isNaN(time)) {
    throw problem(400, 'invalid_parameter', `Invalid ${name}.`, [
      { field: name, code: 'invalid_parameter', message: 'must be an ISO-8601 instant' },
    ]);
  }
  return time;
}

/**
 * Mirrors `requireValidSort` (BG-26): an off-list `sort_by`, or a `sort_dir` other than ASC or DESC
 * in any case, is a 400 `invalid_parameter` with one violation on the field, never echoing the
 * value. `sort_by` is user-controlled, so the allow-list is read with `Object.hasOwn`: `toString`
 * must not resolve to an `Object.prototype` member.
 */
export function sortKey<T>(
  query: URLSearchParams,
  keys: Partial<Record<string, (row: T) => string>>,
  fallback: { by: string; dir: 'ASC' | 'DESC' },
): { key: (row: T) => string; descending: boolean } {
  const refuse = (field: string, message: string) =>
    problem(400, 'invalid_parameter', 'One or more request parameters are invalid.', [
      { field, code: 'invalid_parameter', message },
    ]);
  const sortBy = query.get('sort_by') ?? fallback.by;
  const key = Object.hasOwn(keys, sortBy) ? keys[sortBy] : undefined;
  if (!key) {
    throw refuse('sort_by', `Sort field must be one of: ${Object.keys(keys).sort().join(', ')}.`);
  }
  const direction = (query.get('sort_dir') ?? fallback.dir).toUpperCase();
  if (direction !== 'ASC' && direction !== 'DESC') {
    throw refuse('sort_dir', 'Sort direction must be ASC or DESC.');
  }
  return { key, descending: direction === 'DESC' };
}

export function pageOf<T>(items: readonly T[], query: URLSearchParams) {
  const number = intParam(query, 'page', 0, 0, Number.MAX_SAFE_INTEGER);
  const size = intParam(query, 'size', 25, 1, 100);
  const start = number * size;
  return {
    items: items.slice(start, start + size),
    page: {
      number,
      size,
      total_items: items.length,
      total_pages: Math.ceil(items.length / size),
      has_next: start + size < items.length,
      has_previous: number > 0,
    },
  };
}

/**
 * Renders a caught error as the fake API's response. Checks `headersSent` first: a handler that
 * already wrote its response and then threw must not write headers again — that would throw
 * ERR_HTTP_HEADERS_SENT and, left unhandled, crash the whole run (every branch below writes
 * headers, so this has to run before any of them).
 */
export function respondToError(
  res: ServerResponse,
  instance: string,
  error: unknown,
  origin: string,
): void {
  if (res.headersSent) {
    console.error(error);
    res.end();
    return;
  }
  if (error instanceof ProblemError) {
    sendProblem(res, instance, error.problem, origin);
    return;
  }
  console.error(error);
  sendProblem(
    res,
    instance,
    { status: 500, code: 'internal_error', detail: 'An unexpected error occurred.' },
    origin,
  );
}
