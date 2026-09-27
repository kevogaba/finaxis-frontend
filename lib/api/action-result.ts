import 'server-only';
import { refresh } from 'next/cache';
import { headers } from 'next/headers';
import { redirect, unstable_rethrow } from 'next/navigation';
import type { z } from 'zod';
import { getAuthenticatedUser } from '@/auth/get-authenticated-user';
import { redirectIfSessionLost } from './load';
import { describeProblem } from './problem';

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
