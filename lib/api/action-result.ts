import 'server-only';
import { refresh } from 'next/cache';
import { headers } from 'next/headers';
import { redirect, unstable_rethrow } from 'next/navigation';
import type { z } from 'zod';
import { getAuthenticatedUser } from '@/auth/get-authenticated-user';
import { getCurrentContextProfile } from '@/auth/context-service';
import { redirectIfSessionLost } from './load';
import { describeProblem } from './problem';

const CONTEXT_CHANGED_MESSAGE =
  'You switched organisation in another tab. Reload this page and try again.';

export type ActionResult =
  | { ok: true }
  | {
      ok: false;
      formError: string;
      fieldErrors: Partial<Record<string, string>>;
      code: string | null;
      requestId: string | null;
    };

/** The shape `useActionState` expects of a form's Server Action. */
export type FormAction = (
  previous: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

/**
 * Every Server Action runs through here (spec §6.4): session → zod-validated form fields → the
 * backend call → `refresh()`. Failures become a safe `ActionResult`, never a raw backend payload.
 */
export async function runServerAction<S extends z.ZodType>(
  schema: S,
  formData: FormData,
  run: (input: z.output<S>) => Promise<unknown>,
): Promise<ActionResult> {
  const requestHeaders = await headers();
  if (!(await getAuthenticatedUser(requestHeaders))) {
    redirect('/login?reason=session_expired');
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Partial<Record<string, string>> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.map(String).join('.')] ??= issue.message;
    }
    return {
      ok: false,
      formError: 'Check the highlighted fields and try again.',
      fieldErrors,
      code: 'validation_failed',
      requestId: null,
    };
  }

  try {
    // I2: a mutation must run against the organisation the page rendered, not whatever context
    // cookie the browser holds at submit time — the field is present only when the caller (the
    // kit dialogs) renders it, and getCurrentContextProfile() is called here, inside the try, so
    // a failed /auth/me read maps through the same safe-failure path below instead of rejecting.
    const contextOrganisationId = formData.get('contextOrganisationId');
    if (typeof contextOrganisationId === 'string' && contextOrganisationId) {
      const profile = await getCurrentContextProfile();
      const renderedOrganisationId =
        profile.kind === 'resolved' ? profile.context.organization.id : null;
      if (renderedOrganisationId !== contextOrganisationId) {
        return {
          ok: false,
          formError: CONTEXT_CHANGED_MESSAGE,
          fieldErrors: {},
          code: 'context_changed',
          requestId: null,
        };
      }
    }

    await run(parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    redirectIfSessionLost(error, requestHeaders);
    const problem = describeProblem(error);
    return {
      ok: false,
      formError: problem.message,
      fieldErrors: {},
      code: problem.code,
      requestId: problem.requestId,
    };
  }

  refresh();
  return { ok: true };
}
