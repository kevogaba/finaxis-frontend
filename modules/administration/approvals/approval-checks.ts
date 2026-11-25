import type { StatusTone } from '@/components/data-display/status-chip';
import type { ActorRef } from '@/lib/api/wire';
import { shortId } from '@/lib/format';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import type { MembershipType } from '@/modules/administration/users/user-contract';
import { USER_MAKER_CHECKER_BLOCKED } from '@/modules/administration/users/user-rules';
import { BRANCHES_NOT_PERMITTED, ROLES_NOT_PERMITTED } from './approval-copy';
import { isSameUser, type SwitchState } from './maker-checker';

// ── Control checks (spec §10.6, Rulings 5 and 7) ─────────────────────────────────────────────────

export type CheckState = 'passed' | 'failed' | 'platform' | 'not-required';

/** A word on every state, never colour alone (WCAG 1.4.1). Short, so a chip never truncates at
 * 375 px: a platform check's detail opens with `VERIFIED_ON_APPROVAL` instead (spec §10.6). */
export const CHECK_STATES: Record<CheckState, { label: string; tone: StatusTone }> = {
  passed: { label: 'Passed', tone: 'success' },
  failed: { label: 'Not met', tone: 'error' },
  platform: { label: 'Checked on approval', tone: 'info' },
  'not-required': { label: 'Not required', tone: 'default' },
};

export const VERIFIED_ON_APPROVAL = 'Verified by the platform on approval.';

export interface ControlCheck {
  id: 'maker' | 'role' | 'branch' | 'institution';
  label: string;
  state: CheckState;
  detail: string;
}

/** A page read's outcome, structurally `Loaded<T>`; `null`: not permitted, nothing was read. */
export type CheckRead<T> =
  { ok: true; value: T } | { ok: false; problem: { requestId: string | null } } | null;

const reference = (requestId: string | null) => (requestId ? ` Reference: ${requestId}` : '');

/** A check that can't be computed reads "Verified by the platform on approval", then says why. */
function checkOf(
  id: ControlCheck['id'],
  label: string,
  state: CheckState,
  detail: string,
): ControlCheck {
  return {
    id,
    label,
    state,
    detail: state === 'platform' ? `${VERIFIED_ON_APPROVAL} ${detail}` : detail,
  };
}

const MAKER_COPY = {
  user: {
    label: 'Invited by someone else',
    passed: (who: string) => `Invited by ${who}.`,
    notMine: "They weren't invited by you.",
    failed: USER_MAKER_CHECKER_BLOCKED,
    switchedOff:
      'Maker-checker is off for user invitations, so you may approve your own invitation.',
    unknownSwitch: "You invited them, and this page couldn't read whether maker-checker is on.",
  },
  branch: {
    label: 'Drafted by someone else',
    passed: (who: string) => `Drafted by ${who}.`,
    notMine: "It wasn't drafted by you.",
    failed: MAKER_CHECKER_BLOCKED,
    switchedOff: 'Maker-checker is off for branch creation, so you may activate your own draft.',
    unknownSwitch: "You drafted it, and this page couldn't read whether maker-checker is on.",
  },
} as const;

/** BG-08: the maker is the record's own `created_by`, so this check needs no `audit.view`. A `null`
 * maker (the system, or someone the caller may not see) is never the caller. */
function makerCheck(
  kind: 'user' | 'branch',
  maker: ActorRef,
  me: string,
  switchState: SwitchState,
): ControlCheck {
  const copy = MAKER_COPY[kind];
  const check = (state: CheckState, detail: string) => checkOf('maker', copy.label, state, detail);
  if (maker === null) return check('passed', copy.notMine);
  if (!isSameUser(maker.id, me)) {
    return check('passed', copy.passed(maker.displayName ?? shortId(maker.id)));
  }
  // Your own request: the switch decides (`makerGate`); unread, the platform does (Q4).
  switch (switchState) {
    case 'on':
      return check('failed', copy.failed);
    case 'off':
      return check('not-required', copy.switchedOff);
    default:
      return check('platform', copy.unknownSwitch);
  }
}

/** Contract §A: every request re-validates the organisation ACTIVE, so a page that loaded knows. */
function institutionCheck(organisationName: string): ControlCheck {
  return checkOf(
    'institution',
    'Institution is active',
    'passed',
    `${organisationName} is active. The platform checks this on every request.`,
  );
}

function roleCheck(roles: CheckRead<number>): ControlCheck {
  const check = (state: CheckState, detail: string) =>
    checkOf('role', 'Has an active role', state, detail);
  if (roles === null) return check('platform', ROLES_NOT_PERMITTED);
  if (!roles.ok) {
    return check(
      'platform',
      `Their roles couldn't be loaded.${reference(roles.problem.requestId)}`,
    );
  }
  return roles.value > 0
    ? check('passed', 'They hold an active role.')
    : check(
        'failed',
        'They hold no active role. The platform refuses approval until they hold one.',
      );
}

function branchCheck(
  branches: CheckRead<{ count: number; complete: boolean }>,
  membershipType: MembershipType | null,
): ControlCheck {
  const check = (state: CheckState, detail: string) =>
    checkOf('branch', 'Has an active branch assignment', state, detail);
  // Contract §F: AUDITOR and SYSTEM members are branch-exempt.
  if (membershipType === 'AUDITOR' || membershipType === 'SYSTEM') {
    return check('not-required', "Auditors and system members don't need one.");
  }
  if (membershipType === null) {
    return check(
      'platform',
      "Their membership type couldn't be read, so this page can't tell whether they need one.",
    );
  }
  if (branches === null) return check('platform', BRANCHES_NOT_PERMITTED);
  if (!branches.ok) {
    return check(
      'platform',
      `Their branch assignments couldn't be loaded.${reference(branches.problem.requestId)}`,
    );
  }
  if (branches.value.count > 0) return check('passed', 'They hold an active branch assignment.');
  // A capped scan, or one a selected branch narrowed (§E.4), can't prove "none" (rule 9).
  return branches.value.complete
    ? check(
        'failed',
        'Staff and admin members need an active branch assignment. The platform refuses approval until they hold one.',
      )
    : check('platform', 'None was found among the branch assignments this page could check.');
}

export function userControlChecks(input: {
  /** The record's inviter (`created_by`). */
  maker: ActorRef;
  /** The signed-in user's id, from `/auth/me` (never the URL's). */
  me: string;
  /** `require_maker_checker_for_user_invites`, as the page could read it. */
  switchState: SwitchState;
  /** ACTIVE role assignments found (one page). */
  roles: CheckRead<number>;
  /** ACTIVE branch assignments found; `complete`: the scan wasn't capped and no branch narrowed it. */
  branches: CheckRead<{ count: number; complete: boolean }>;
  /** null: the membership couldn't be read (no `membership.view`, not found, or failed). */
  membershipType: MembershipType | null;
  organisationName: string;
}): ControlCheck[] {
  return [
    makerCheck('user', input.maker, input.me, input.switchState),
    roleCheck(input.roles),
    branchCheck(input.branches, input.membershipType),
    institutionCheck(input.organisationName),
  ];
}

export function branchControlChecks(input: {
  /** The record's creator (`created_by`): the tenant route refuses it, not the submitter. */
  maker: ActorRef;
  me: string;
  switchState: SwitchState;
  organisationName: string;
}): ControlCheck[] {
  return [
    makerCheck('branch', input.maker, input.me, input.switchState),
    institutionCheck(input.organisationName),
  ];
}
