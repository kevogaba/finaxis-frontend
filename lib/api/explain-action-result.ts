import type { ActionResult } from './action-result';

/** Swaps the generic status message for one that names the guard behind a known code (spec §6.7),
 * never the backend's text. */
export function explain(
  result: ActionResult,
  code: string,
  formError: string,
  fieldErrors: Partial<Record<string, string>> = {},
): ActionResult {
  if (result.ok || result.code !== code) return result;
  return { ...result, formError, fieldErrors: { ...result.fieldErrors, ...fieldErrors } };
}
