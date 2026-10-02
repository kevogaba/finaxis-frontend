import 'server-only';
import { headers } from 'next/headers';
import { redirect, unstable_rethrow } from 'next/navigation';
import { BackendApiError } from '@/auth/backend-api';
import { contextSelectionRedirectPath } from '@/auth/context-selection-redirect';
import { describeProblem, type ProblemView } from './problem';

export type Loaded<T> = { ok: true; value: T } | { ok: false; problem: ProblemView };

/** 401 → login; a stale or missing context → context selection, keeping the current path. */
export function redirectIfSessionLost(error: unknown, requestHeaders: Headers): void {
  if (!(error instanceof BackendApiError)) return;
  if (error.status === 401) redirect('/login?reason=session_expired');
  if (error.code === 'invalid_active_tenant_context') {
    redirect(contextSelectionRedirectPath(requestHeaders));
  }
}

/** Settles a page's backend read; failures that don't redirect become a safe `ErrorState` view. */
export async function load<T>(promise: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    // A Next.js control-flow error (redirect()/notFound()/permanentRedirect(), including a
    // dynamic-rendering bail-out) must keep propagating, never turn into a swallowed, logged
    // "Something went wrong" — describeProblem has no way to tell those apart from a real failure.
    unstable_rethrow(error);
    redirectIfSessionLost(error, await headers());
    return { ok: false, problem: describeProblem(error) };
  }
}
