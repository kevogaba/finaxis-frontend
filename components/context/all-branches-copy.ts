/**
 * Read by both the Server Component `BranchContextState` and its client button. It lives in this
 * plain module, not in the `'use client'` button file, because a Server Component that imports a
 * value from a client module gets a client reference instead of the string.
 */
export const ALL_BRANCHES_UNAVAILABLE =
  "All branches isn't available for your account because you're assigned to a single branch. Ask an administrator for access to this branch.";
