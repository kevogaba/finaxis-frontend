import type { StatusTone } from '@/components/data-display/status-chip';
import { shortId } from '@/lib/format';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import type { MembershipType } from '@/modules/administration/users/user-contract';
import { USER_MAKER_CHECKER_BLOCKED } from '@/modules/administration/users/user-rules';
import { BRANCHES_NOT_PERMITTED, ROLES_NOT_PERMITTED } from './approval-copy';
import { isSameUser } from './approval-rules';

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

/** The maker's audit event, as the page resolved it: `null` value = no such event. */
export interface MakerFact {
  actorUserId: string | null;
  /** From the user lookup; null falls back to the short id. */
  name: string | null;
}

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
    failed: USER_MAKER_CHECKER_BLOCKED,
    notPermitted: "Your role can't view the audit trail, so this page can't tell who invited them.",
    failedRead: "Who invited them couldn't be loaded.",
    unrecorded: "The audit trail doesn't say who invited them.",
  },
  branch: {
    label: 'Drafted by someone else',
    passed: (who: string) => `Drafted by ${who}.`,
    failed: MAKER_CHECKER_BLOCKED,
    notPermitted: "Your role can't view the audit trail, so this page can't tell who drafted it.",
    failedRead: "Who drafted it couldn't be loaded.",
    unrecorded: "The audit trail doesn't say who drafted it.",
  },
} as const;

function makerCheck(
  kind: 'user' | 'branch',
  maker: CheckRead<MakerFact | null>,
  me: string,
): ControlCheck {
  const copy = MAKER_COPY[kind];
  const check = (state: CheckState, detail: string) => checkOf('maker', copy.label, state, detail);
  if (maker === null) return check('platform', copy.notPermitted);
  if (!maker.ok)
    return check('platform', `${copy.failedRead}${reference(maker.problem.requestId)}`);
  const actor = maker.value?.actorUserId ?? null;
  if (actor === null) return check('platform', copy.unrecorded);
  if (isSameUser(actor, me)) return check('failed', copy.failed);
  return check('passed', copy.passed(maker.value?.name ?? shortId(actor)));
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
  maker: CheckRead<MakerFact | null>;
  /** The signed-in user's id, from `/auth/me` (never the URL's). */
  me: string;
  /** ACTIVE role assignments found (one page). */
  roles: CheckRead<number>;
  /** ACTIVE branch assignments found; `complete`: the scan wasn't capped and no branch narrowed it. */
  branches: CheckRead<{ count: number; complete: boolean }>;
  /** null: the membership couldn't be read (no `membership.view`, not found, or failed). */
  membershipType: MembershipType | null;
  organisationName: string;
}): ControlCheck[] {
  return [
    makerCheck('user', input.maker, input.me),
    roleCheck(input.roles),
    branchCheck(input.branches, input.membershipType),
    institutionCheck(input.organisationName),
  ];
}

export function branchControlChecks(input: {
  maker: CheckRead<MakerFact | null>;
  me: string;
  organisationName: string;
}): ControlCheck[] {
  return [makerCheck('branch', input.maker, input.me), institutionCheck(input.organisationName)];
}
