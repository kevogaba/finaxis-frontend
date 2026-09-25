import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

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
    throw problem(400, 'invalid_json', 'Request body is not valid JSON.');
  }
}

/** Mirrors ApiJsonCodec: a JSON object whose keys are all known snake_case properties. */
export function objectBody(body: unknown, allowedKeys: readonly string[]): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw problem(400, 'invalid_json', 'A JSON object body is required.');
  }
  const unknownKey = Object.keys(body).find((key) => !allowedKeys.includes(key));
  if (unknownKey !== undefined) {
    throw problem(400, 'invalid_json', `Unrecognized field "${unknownKey}".`);
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
      throw problem(400, 'invalid_json', `Missing required field "${key}".`);
    }
    return null;
  }
  if (typeof value !== 'string') {
    throw problem(400, 'invalid_json', `Field "${key}" must be a string.`);
  }
  return value;
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
    throw problem(400, 'validation_failed', `Invalid ${name}.`, [
      {
        field: name,
        code: 'invalid',
        message: `must be between ${String(min)} and ${String(max)}`,
      },
    ]);
  }
  return value;
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
