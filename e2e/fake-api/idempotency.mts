import type { ServerResponse } from 'node:http';
import { problem, sendJson, sendNoContent } from './http.mts';
import type { RouteContext } from './router.mts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function respond(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string>,
): void {
  if (status === 204) {
    sendNoContent(res, headers);
    return;
  }
  sendJson(res, status, body, headers);
}

/**
 * Mirrors the backend's Idempotency-Key handling (contract §A): a success replays for the same key;
 * the same key with a different method, path, or body → 409 IDEMPOTENCY_KEY_REUSED; a failure
 * (`produce` throws) stores nothing, so retrying with the same key is safe.
 */
export function sendIdempotent(
  context: RouteContext,
  body: unknown,
  produce: () => unknown,
  status = 200,
): void {
  const header = context.req.headers['idempotency-key'];
  const key = Array.isArray(header) ? header[0] : header;
  if (key === undefined) {
    respond(context.res, status, produce(), {});
    return;
  }
  if (!UUID.test(key)) {
    throw problem(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be a UUID.');
  }
  const fingerprint = `${context.req.method ?? ''} ${context.path} ${JSON.stringify(body)}`;
  const stored = context.state.idempotency.get(key);
  if (stored) {
    if (stored.fingerprint !== fingerprint) {
      throw problem(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'The idempotency key was used for a different request.',
      );
    }
    respond(context.res, stored.status, stored.body, {
      'Idempotency-Key': key,
      'Idempotency-Replayed': 'true',
    });
    return;
  }
  const response = produce();
  context.state.idempotency.set(key, { fingerprint, status, body: response });
  respond(context.res, status, response, { 'Idempotency-Key': key });
}
