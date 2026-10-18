import { humanizeEnum, type StatusTone } from '@/components/data-display/status-chip';
import { SETTINGS_EDIT_ENABLED } from '@/modules/administration/settings/settings-flags';

/**
 * Spec §10.8's Operational readiness (D11): five items, each computed from live reads by an
 * explicit rule (Ruling 1). Client-safe and pure: the section settles each read with `load()` and
 * hands it here. A read the holder can't make is `null` (never read, and said so); a failed read is
 * never shown as ready, as absent or as zero (rule 6).
 */

/** A settled read, structurally `Loaded<T>` (lib/api/load.ts is server-only); `null`: the holder
 * lacks the item's code, so nothing was read. */
export type Settled<T> =
  { ok: true; value: T } | { ok: false; problem: { requestId: string | null } } | null;

export type ReadinessItemId = 'institution' | 'branches' | 'people' | 'onboarding' | 'businessDate';

/** The one read code each item needs (Ruling 3). The organisation's status comes from the signed-in
 * profile (`/auth/me`), so the Institution profile item needs only the settings read. */
export const READINESS_CODES: Record<ReadinessItemId, string> = {
  institution: 'settings.view',
  branches: 'branch.view',
  people: 'membership.view',
  onboarding: 'user.view',
  businessDate: 'business_date.view',
};

export const READINESS_LABELS: Record<ReadinessItemId, string> = {
  institution: 'Institution profile',
  branches: 'Branches',
  people: 'People',
  onboarding: 'Onboarding',
  businessDate: 'Business date',
};

export type ReadinessState = 'ready' | 'attention' | 'unknown' | 'failed';

/** Each state's chip: the words always carry the meaning, the tone only repeats it. */
export const READINESS_STATES: Record<ReadinessState, { label: string; tone: StatusTone }> = {
  ready: { label: 'Ready', tone: 'success' },
  attention: { label: 'Needs attention', tone: 'warning' },
  unknown: { label: "Can't be checked", tone: 'default' },
  failed: { label: "Couldn't be checked", tone: 'error' },
};

export const READINESS_DESCRIPTION =
  "Each item is computed from live data. One your role can't read says so.";
export const NOT_PERMITTED = "Can't be checked with your permissions.";

/** One item's verdict, from its reads alone. */
export interface ReadinessCheck {
  id: ReadinessItemId;
  label: string;
  state: ReadinessState;
  /** One or two sentences: what was found, what is missing, or why it can't be said. */
  detail: string;
}

/** "Couldn't be loaded." with the failed read's reference (rule 6). */
function readFailed(problem: { requestId: string | null }): string {
  return problem.requestId
    ? `Couldn't be loaded. Reference: ${problem.requestId}`
    : "Couldn't be loaded.";
}

const counted = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

function item(id: ReadinessItemId, state: ReadinessState, detail: string): ReadinessCheck {
  return { id, label: READINESS_LABELS[id], state, detail };
}

/** A stored setting as the settings read maps it: a masked value is `null` but `redacted`. */
export interface SettingFact {
  key: string;
  value: string | null;
  redacted: boolean;
}

const PROFILE_KEYS = [
  ['default_timezone', 'default timezone'],
  ['base_currency', 'base currency'],
] as const;

/** BG-04: the platform can't save a setting yet, so an unset key can't be set from this app. */
const UNSAVABLE = SETTINGS_EDIT_ENABLED ? '' : " Settings can't be saved yet.";

/** Organisation ACTIVE, and `default_timezone` and `base_currency` set (spec §10.8). Every request
 * re-validates the organisation as ACTIVE (contract §A), so the status the profile carries is
 * checked but in practice always passes. */
export function institutionItem(
  organisationStatus: string,
  settings: Settled<{ items: readonly SettingFact[] }>,
): ReadinessCheck {
  if (organisationStatus !== 'ACTIVE') {
    return item(
      'institution',
      'attention',
      `The institution is ${humanizeEnum(organisationStatus).toLowerCase()}.`,
    );
  }
  if (settings === null) return item('institution', 'unknown', NOT_PERMITTED);
  if (!settings.ok) return item('institution', 'failed', readFailed(settings.problem));
  const isSet = (key: string) =>
    settings.value.items.some(
      (setting) => setting.key === key && (setting.value !== null || setting.redacted),
    );
  const missing = PROFILE_KEYS.filter(([key]) => !isSet(key)).map(([, label]) => label);
  if (missing.length > 0) {
    return item('institution', 'attention', `Not set: ${missing.join(' and ')}.${UNSAVABLE}`);
  }
  return item('institution', 'ready', 'Active, with a default timezone and a base currency.');
}

/** At least one ACTIVE branch and none PENDING_APPROVAL (spec §10.8). */
export function branchesItem(active: Settled<number>, pending: Settled<number>): ReadinessCheck {
  if (active === null || pending === null) return item('branches', 'unknown', NOT_PERMITTED);
  if (!active.ok) return item('branches', 'failed', readFailed(active.problem));
  if (!pending.ok) return item('branches', 'failed', readFailed(pending.problem));
  const waiting =
    pending.value > 0
      ? ` ${counted(pending.value, 'branch is', 'branches are')} waiting for activation.`
      : '';
  if (active.value < 1) return item('branches', 'attention', `No branch is active yet.${waiting}`);
  const live = counted(active.value, 'branch is', 'branches are');
  if (pending.value > 0) return item('branches', 'attention', `${live} active.${waiting}`);
  return item('branches', 'ready', `${live} active, and none is waiting for activation.`);
}

/** At least two ACTIVE memberships, so maker-checker is possible (spec §10.8, BG-02). */
export function peopleItem(active: Settled<number>): ReadinessCheck {
  if (active === null) return item('people', 'unknown', NOT_PERMITTED);
  if (!active.ok) return item('people', 'failed', readFailed(active.problem));
  if (active.value < 2) {
    return item(
      'people',
      'attention',
      `${active.value === 0 ? 'No member is' : 'Only 1 member is'} active. Approvals need at least two, so someone other than the requester can decide (maker-checker).`,
    );
  }
  return item('people', 'ready', `${counted(active.value, 'member is', 'members are')} active.`);
}
