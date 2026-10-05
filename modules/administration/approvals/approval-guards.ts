import 'server-only';
import { BackendApiError } from '@/auth/backend-api';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can, type PermissionHolder } from '@/auth/permissions';
import { getMakerEvent, type ApprovalSubjectKind } from './approval-service';

/**
 * The decision actions' shared guards (Ruling 5). Each refusal is a frontend-only problem code
 * thrown inside `runServerAction`, so it reaches the dialog as a named failure before any backend
 * call (precedent: 17's `own_account`).
 */
export function refuse(status: number, code: string): BackendApiError {
  return new BackendApiError(status, { code });
}

/** Fail closed: without a resolved profile nobody can tell who is deciding, so a lost session or a
 * stale context reaches the redirect before any call (17's `refuseOwnAccount`). */
export async function decider() {
  const selected = await getCurrentContextProfile();
  if (selected.kind !== 'resolved') throw refuse(403, 'invalid_active_tenant_context');
  return selected;
}

/** BG-08: the maker, read again here only with `audit.view`. A lost session or a stale context
 * still redirects (rethrown to `runServerAction`); any other `BackendApiError` leaves the maker
 * unknown, and the backend's maker-checker 403 is then the guard. Anything else (an unreadable
 * audit page, a `ZodError`) rethrows and fails the action with a reference (Ruling 5). Never a
 * blanket catch (rule 10). */
export async function knownMaker(
  kind: ApprovalSubjectKind,
  subjectId: string,
  holder: PermissionHolder,
): Promise<string | null> {
  if (!can(holder, 'audit.view')) return null;
  try {
    return (await getMakerEvent(kind, subjectId))?.actorUserId ?? null;
  } catch (error) {
    const sessionLost =
      error instanceof BackendApiError &&
      (error.status === 401 || error.code === 'invalid_active_tenant_context');
    if (error instanceof BackendApiError && !sessionLost) return null;
    throw error;
  }
}
