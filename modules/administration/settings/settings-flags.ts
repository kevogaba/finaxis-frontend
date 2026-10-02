/**
 * Editing (PUT /tenant/settings/{key}) ships behind this flag: spec §10.7, BG-04. It stays false
 * unless RUN-STATE records the t0 PUT probe as PASS (plan 13, Ruling 1). When BG-04 closes, flip it
 * here; the page, the Server Action guard, and e2e/settings.spec.ts all follow.
 *
 * Import-free on purpose, so the E2E spec can import it. `as boolean` stops a bare literal making
 * every check of it an always-true/false condition to the type checker (no-unnecessary-condition).
 */
export const SETTINGS_EDIT_ENABLED = false as boolean;
