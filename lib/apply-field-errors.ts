import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

/**
 * Merges a Server Action's `fieldErrors` into React Hook Form (spec §6.4). Only `fields` are set,
 * so a key the form doesn't render (e.g. `idempotencyKey`) stays in the form-level message; the
 * first one set takes focus.
 */
export function applyFieldErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fieldErrors: Partial<Record<string, string>>,
  fields: readonly Path<T>[],
): void {
  let focus = true;
  for (const field of fields) {
    const message = fieldErrors[field];
    if (message === undefined) continue;
    setError(field, { type: 'server', message }, { shouldFocus: focus });
    focus = false;
  }
}
