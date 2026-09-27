import 'server-only';
import { ZodError } from 'zod';
import { BackendApiError } from '@/auth/backend-api';

export interface ProblemView {
  title: string;
  message: string;
  code: string | null;
  requestId: string | null;
}

const BY_STATUS: Record<number, Pick<ProblemView, 'title' | 'message'>> = {
  400: {
    title: 'Check the details',
    message: "Some details weren't accepted. Review them and try again.",
  },
  403: {
    title: 'Access denied',
    message:
      "You don't have permission for this in your current context. Ask an administrator if you need access.",
  },
  404: {
    title: 'Not found',
    message: "This record doesn't exist or isn't available in your current context.",
  },
  409: {
    title: 'This changed',
    message: "The record changed or is in a state that doesn't allow this. Refresh and try again.",
  },
  422: {
    title: 'Check the details',
    message: "Some details weren't accepted. Review them and try again.",
  },
  429: { title: 'Too many requests', message: 'Please wait a moment and try again.' },
};

const GENERIC = {
  title: 'Something went wrong',
  message: "The platform didn't respond as expected. Try again in a moment.",
};

/** Safe, user-facing description of any failure; never echoes server or exception messages. */
export function describeProblem(error: unknown): ProblemView {
  if (error instanceof BackendApiError) {
    const known = BY_STATUS[error.status] ?? GENERIC;
    return { ...known, code: error.code, requestId: error.requestId };
  }

  // Non-BackendApiError failures are programming errors, not user-caused ones: 2xx responses have no
  // backend request id, so mint a support reference here instead of losing the failure silently.
  const requestId = crypto.randomUUID();

  if (error instanceof ZodError) {
    // Issue paths and codes only — never the values themselves, which may carry backend data.
    console.error(
      `Unreadable backend response (support reference ${requestId}):`,
      error.issues.map((issue) => ({ path: issue.path, code: issue.code })),
    );
    return {
      title: GENERIC.title,
      message:
        "The platform returned data this page couldn't read. Try again, or report the reference.",
      code: 'contract_mismatch',
      requestId,
    };
  }

  console.error(`Unexpected error (support reference ${requestId}):`, error);
  return { ...GENERIC, code: null, requestId };
}
