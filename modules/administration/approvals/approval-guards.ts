import 'server-only';
import { BackendApiError } from '@/auth/backend-api';
import { getCurrentContextProfile } from '@/auth/context-service';
import { APPROVAL_CHANGED_CODE } from './approval-copy';

/**
 * The decision actions' shared guards (Ruling 5). Each refusal is a frontend-only problem code
 * thrown inside `runServerAction`, so it reaches the dialog as a named failure before any backend
 * call, except `postFromEndState`'s 'changed' reading, which follows the POST (precedent: 17's
 * `own_account`).
 */
export function refuse(status: number, code: string): BackendApiError {
  return new BackendApiError(status, { code });
}

/** A lost session or a stale context: it reaches the redirect, never reads as a failed decision. */
export function isSessionLost(error: unknown): boolean {
  return (
    error instanceof BackendApiError &&
    (error.status === 401 || error.code === 'invalid_active_tenant_context')
  );
}

/** A decision's POST from a state that may be the decision's own end state (an approval's 200 or
 * 202, an activation): when its response was lost the dialog keeps its key, so the backend replays
 * the stored answer. A backend failure from such a state means someone else decided first, so it
 * reads as "changed"; a lost session, a 403 (permission or maker-checker) and anything that isn't a
 * `BackendApiError` keep their own handling (a network failure is a synthesized 502, so it reads as
 * changed too). */
export async function postFromEndState<Result>(
  endState: boolean,
  post: () => Promise<Result>,
): Promise<Result> {
  if (!endState) return post();
  try {
    return await post();
  } catch (error) {
    if (error instanceof BackendApiError && !isSessionLost(error) && error.status !== 403) {
      throw refuse(409, APPROVAL_CHANGED_CODE);
    }
    throw error;
  }
}

/** Fail closed: without a resolved profile nobody can tell who is deciding, so a lost session or a
 * stale context reaches the redirect before any call (17's `refuseOwnAccount`). */
export async function decider() {
  const selected = await getCurrentContextProfile();
  if (selected.kind !== 'resolved') throw refuse(403, 'invalid_active_tenant_context');
  return selected;
}
