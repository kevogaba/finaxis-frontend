import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { problem, respondToError, sendJson } from './http.mts';
import { matchRoute } from './router.mts';
import type { Route } from './router.mts';
import { authRoutes } from './routes/auth.mts';
import { auditRoutes } from './routes/audit.mts';
import { branchRoutes } from './routes/branches.mts';
import { businessDateRoutes } from './routes/business-date.mts';
import { membershipRoutes } from './routes/memberships.mts';
import { platformTenantRoutes } from './routes/platform-tenants.mts';
import { roleRoutes } from './routes/roles.mts';
import { settingsRoutes } from './routes/settings.mts';
import { tenantReadRoutes } from './routes/tenant-reads.mts';
import { stateForToken } from './state.mts';

/** Each layer appends its route list here. */
const routes: Route[] = [
  ...authRoutes,
  ...platformTenantRoutes,
  ...tenantReadRoutes,
  ...auditRoutes,
  ...businessDateRoutes,
  ...branchRoutes,
  ...settingsRoutes,
  ...roleRoutes,
  ...membershipRoutes,
];

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
    respondToError(res, url.pathname, error);
  }
}

const port = Number(process.env.FAKE_API_PORT ?? '3199');
const server = createServer((req, res) => {
  // `handle` catches everything it can attribute to a route, but a rejection can still escape it
  // (e.g. the URL parse above, or a bug in `respondToError` itself) — left unhandled, that would
  // throw an unhandledRejection and kill the fake for the whole run, not just this one request.
  handle(req, res).catch((error: unknown) => {
    console.error(error);
    if (!res.headersSent) {
      res.writeHead(500);
    }
    res.end();
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`fake API listening on http://127.0.0.1:${String(port)}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
