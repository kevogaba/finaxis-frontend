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

export function sendProblem(res: ServerResponse, instance: string, value: Problem): void {
  const requestId = randomUUID();
  res.writeHead(value.status, {
    'Content-Type': 'application/problem+json;charset=UTF-8',
    'X-Request-Id': requestId,
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
 * headers, so this has to run before any of them, including the `invalid_token` one).
 */
export function respondToError(res: ServerResponse, instance: string, error: unknown): void {
  if (res.headersSent) {
    console.error(error);
    res.end();
    return;
  }
  if (error instanceof ProblemError) {
    if (error.problem.code === 'invalid_token') {
      // Invalid/expired JWT: empty 401 body, like the real resource server.
      res.writeHead(401, { 'WWW-Authenticate': 'Bearer error="invalid_token"' });
      res.end();
      return;
    }
    sendProblem(res, instance, error.problem);
    return;
  }
  console.error(error);
  sendProblem(res, instance, {
    status: 500,
    code: 'internal_error',
    detail: 'An unexpected error occurred.',
  });
}
