import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ProblemError, problem, sendJson, sendProblem } from './http.mts';
import { matchRoute } from './router.mts';
import type { Route } from './router.mts';
import { authRoutes } from './routes/auth.mts';
import { stateForToken } from './state.mts';

/** Each layer appends its route list here. */
const routes: Route[] = [...authRoutes];

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://fake-api.local');
  if (url.pathname === '/__health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }
  try {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw problem(401, 'authentication_required', 'Authentication is required.');
    }
    const state = stateForToken(authorization.slice('Bearer '.length));
    const match = matchRoute(routes, req.method ?? 'GET', url.pathname);
    if (!match) {
      throw problem(404, 'resource_not_found', 'No route matches this request.');
    }
    await match.route.handler({
      req,
      res,
      params: match.params,
      query: url.searchParams,
      state,
      path: url.pathname,
    });
  } catch (error) {
    if (error instanceof ProblemError) {
      if (error.problem.code === 'invalid_token') {
        // Invalid/expired JWT: empty 401 body, like the real resource server.
        res.writeHead(401, { 'WWW-Authenticate': 'Bearer error="invalid_token"' });
        res.end();
        return;
      }
      sendProblem(res, url.pathname, error.problem);
      return;
    }
    console.error(error);
    sendProblem(res, url.pathname, {
      status: 500,
      code: 'internal_error',
      detail: 'An unexpected error occurred.',
    });
  }
}

const port = Number(process.env.FAKE_API_PORT ?? '3199');
const server = createServer((req, res) => {
  void handle(req, res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`fake API listening on http://127.0.0.1:${String(port)}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
