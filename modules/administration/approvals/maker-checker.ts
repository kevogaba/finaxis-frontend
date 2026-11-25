/**
 * Maker-checker on a decision (BG-08, ADR 0032). Who made a request comes from the record itself
 * (`created_by`, `submitted_by`, `requested_by`), and the tenant's switch decides whether its maker
 * may still decide it. Pure and client-safe.
 */

/** A tenant's `require_maker_checker_*` switch as the page could read it: `unknown` without
 * `settings.view` tenant-wide, or when the read failed. */
export type SwitchState = 'on' | 'off' | 'unknown';

export type MakerGate = 'allowed' | 'blocked' | 'allowed-self-approval';

/** The backend's and `/auth/me`'s ids are canonical lower case (contract §A); compared without case
 * anyway, so the gate never rests on letter case (Ruling 5). An unknown id never matches. */
export function isSameUser(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/** The caller is one of the request's makers; a `null` maker (the system, or one the caller may
 * not see) is never the caller. */
export function isMaker(makerIds: readonly (string | null | undefined)[], callerId: string) {
  return makerIds.some((id) => isSameUser(id, callerId));
}

/** Blocked only when the switch is known to be on. Off lets the maker decide, audited HIGH by the
 * platform; unknown leaves the decision enabled, and the platform's named refusal explains itself
 * (decision Q4). */
export function makerGate(input: {
  makerIds: readonly (string | null | undefined)[];
  callerId: string;
  switchState: SwitchState;
}): MakerGate {
  if (!isMaker(input.makerIds, input.callerId)) return 'allowed';
  if (input.switchState === 'on') return 'blocked';
  return input.switchState === 'off' ? 'allowed-self-approval' : 'allowed';
}

export const SELF_APPROVAL_NOTE_USERS =
  'Maker-checker is off for user invitations. You invited this person. Approving is allowed and recorded as a high-severity event.';
export const SELF_APPROVAL_NOTE_BRANCHES =
  'Maker-checker is off for branch creation. You drafted this branch. Activating is allowed and recorded as a high-severity event.';
