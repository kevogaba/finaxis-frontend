import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RunState } from './state.mts';

export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  state: RunState;
  path: string;
}

export type Handler = (context: RouteContext) => Promise<void> | void;

export interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

/** `path` uses `:name` segments, e.g. `/api/v1/platform/tenants/:tenant_id`. */
export function route(method: string, path: string, handler: Handler): Route {
  const keys: string[] = [];
  const source = path
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { method, pattern: new RegExp(`^${source}$`), keys, handler };
}

export function matchRoute(
  routes: readonly Route[],
  method: string,
  pathname: string,
): { route: Route; params: Record<string, string> } | null {
  for (const candidate of routes) {
    if (candidate.method !== method) {
      continue;
    }
    const match = candidate.pattern.exec(pathname);
    if (!match) {
      continue;
    }
    const params: Record<string, string> = {};
    candidate.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(match[index + 1] ?? '');
    });
    return { route: candidate, params };
  }
  return null;
}
