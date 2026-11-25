import { z } from 'zod';
import {
  canActAtBranch,
  canAllTenantWide,
  canTenantWide,
  type PermissionHolder,
} from '@/auth/permissions';
import { withViews } from '@/auth/permission-views';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { uuidSchema } from '@/lib/api/wire';
import type { BranchStatus } from './branch-contract';

export type BranchLifecycleAction = 'submit' | 'activate' | 'suspend' | 'reactivate' | 'close';

const ACTIONS_BY_STATUS: Record<BranchStatus, readonly BranchLifecycleAction[]> = {
  DRAFT: ['submit'],
  PENDING_APPROVAL: ['activate'],
  ACTIVE: ['suspend', 'close'],
  SUSPENDED: ['reactivate', 'close'],
  CLOSED: [],
  ARCHIVED: [],
};

// Contract §E.3: submitting a draft is gated by `branch.create`, not a code of its own.
const PERMISSION: Record<BranchLifecycleAction, string> = {
  submit: 'branch.create',
  activate: 'branch.approve',
  suspend: 'branch.suspend',
  reactivate: 'branch.reactivate',
  close: 'branch.close',
};

/**
 * Whether the holder may run `code` on `branch` (BG-03): the route's own gate, `routeCodes` (the
 * code unless the route names others) in the selected context, and the service's check of `code`
 * and its views on the target, held tenant-wide or at that branch (`canActAtBranch`). A branch-scope
 * grant counts only while its branch is ACTIVE (platform #242), so a DRAFT, PENDING_APPROVAL or
 * SUSPENDED branch is acted on tenant-wide only.
 */
export function canActOnBranch(
  holder: PermissionHolder,
  code: string,
  branch: { id: string; status: BranchStatus },
  routeCodes?: readonly string[],
): boolean {
  return canActAtBranch(holder, code, branch.status === 'ACTIVE' ? branch.id : null, routeCodes);
}

/** Every transition reads the branch back (BG-31), so it needs `branch.view` there too, which
 * `canActOnBranch` checks with the code's other views. */
export function availableBranchActions(
  branch: { id: string; status: BranchStatus },
  holder: PermissionHolder,
): BranchLifecycleAction[] {
  return ACTIONS_BY_STATUS[branch.status].filter((action) =>
    canActOnBranch(holder, PERMISSION[action], branch),
  );
}

/** POST /branches checks `branch.create` and its view tenant-wide (`requireTenantPermission`), so a
 * branch-scoped grant creates nothing, whichever branch is selected; the record it redirects to and
 * submitting the draft read the branch back with that view (spec §6.6). */
export function canCreateBranch(holder: PermissionHolder): boolean {
  return canAllTenantWide(holder, withViews(['branch.create']));
}

export const MAKER_CHECKER_BLOCKED =
  'You drafted this branch, so another administrator must activate it.';
/** Activate's `forbidden`: a missing permission only, since the drafter and the editors have
 * their own codes (BG-08). The branch record and the approval page share it. */
export const ACTIVATE_FORBIDDEN = "You can't activate this branch. Your role doesn't allow it.";

/** Assigning needs an ACTIVE branch (else 409) and the write on it (`canActOnBranch`); the drawer's
 * user search reads `/tenant/users`, which needs `user.view` tenant-wide (BG-33). */
export function canAssignUsers(
  branch: { id: string; status: BranchStatus },
  holder: PermissionHolder,
): boolean {
  return (
    branch.status === 'ACTIVE' &&
    canActOnBranch(holder, 'user.assign_branch', branch) &&
    canTenantWide(holder, 'user.view')
  );
}

/** A revoke is checked on the assignment's own branch (BG-03). */
export function canRevokeAssignments(
  holder: PermissionHolder,
  branch: { id: string; status: BranchStatus },
): boolean {
  return canActOnBranch(holder, 'user.revoke_branch', branch);
}

/** BG-03: `GET /branches` lists only the branches a branch-scoped `branch.view` covers. */
export function scopedBranchView(holder: PermissionHolder): boolean {
  return !canTenantWide(holder, 'branch.view');
}

export const SCOPED_BRANCHES_NOTE = 'Only branches you can view are shown.';

/** `HEAD_OFFICE` → `Head office`; free text such as `Service centre` stays as typed. */
export function branchTypeLabel(type: string): string {
  return /^[A-Z0-9_]+$/.test(type) ? humanizeEnum(type) : type;
}

/** `Intl` lists neither UTC spelling, though the platform's zone list holds both. */
const UTC_ZONES = ['UTC', 'Etc/UTC'];

/** The zones a time-zone field offers: the runtime's IANA list plus UTC, sorted, with `current`
 * first when the list lacks it, so a stored value still shows. */
export function timeZones(current?: string): string[] {
  const zones = [...new Set([...Intl.supportedValuesOf('timeZone'), ...UTC_ZONES])].sort();
  return current && !zones.includes(current) ? [current, ...zones] : zones;
}

/** `Etc/GMT-3`: the fixed offsets the platform names (TimeZoneRule; V37 stored offsets as these). */
const FIXED_OFFSET = /^Etc\/GMT[+-]\d{1,2}$/;
/** Ids the runtime accepts but the JDK's list (TimeZoneRule) leaves out. */
const NOT_IN_JDK = new Set(['EST', 'MST', 'HST', 'ROC', 'GMT+0', 'GMT-0', 'US/Pacific-New']);

/**
 * An IANA id the platform accepts (TimeZoneRule, #276): a listed zone, a link to one (`Asia/Kolkata`
 * where the runtime lists `Asia/Calcutta`), or a fixed `Etc/GMT` offset. A raw offset (`+03:00`)
 * is refused, though `Intl` formats with it: it resolves to itself, never to a listed zone.
 */
export function isTimeZone(value: string): boolean {
  let zone: string;
  try {
    zone = new Intl.DateTimeFormat('en-GB', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return false;
  }
  // The platform matches ids exactly: a wrong-case spelling resolves to the same zone, but it is
  // refused (`africa/nairobi`, `Utc`), as are the few ids the JDK doesn't list.
  if (NOT_IN_JDK.has(value) || (value !== zone && value.toLowerCase() === zone.toLowerCase())) {
    return false;
  }
  return /^[A-Z]/.test(value) && (FIXED_OFFSET.test(zone) || timeZones().includes(zone));
}

/** CreateBranch (contract §D), shared by the form (RHF) and the Server Action. The timezone is an
 * IANA id, as the platform requires (a raw offset is a 422, #276). */
export const branchDraftSchema = z.object({
  branchCode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_-]{2,20}$/, 'Use 2–20 capital letters, digits, underscores or hyphens.'),
  branchName: z
    .string()
    .trim()
    .min(2, 'Enter a name of at least 2 characters.')
    .max(100, 'Use at most 100 characters.'),
  branchType: z
    .string()
    .trim()
    .min(1, 'Enter a branch type.')
    .max(50, 'Use at most 50 characters.'),
  parentBranchId: z.union([z.literal(''), uuidSchema]),
  timezone: z.string().refine(isTimeZone, 'Choose a timezone.'),
});

export type BranchDraftValues = z.infer<typeof branchDraftSchema>;
