import { z } from 'zod';
import {
  canActAtBranch,
  canAllTenantWide,
  canTenantWide,
  type PermissionHolder,
} from '@/auth/permissions';
import { withViews } from '@/auth/permission-views';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { uuidSchema, type ActorRef } from '@/lib/api/wire';
import { isMaker } from '@/modules/administration/approvals/maker-checker';
import type { BranchDetail, BranchStatus } from './branch-contract';

/** Withdraw and Return are one route, `POST /branches/{id}/return`, told apart by the caller. */
export type SendBackAction = 'withdraw' | 'return';

export type BranchLifecycleAction =
  'submit' | 'discard' | 'activate' | SendBackAction | 'suspend' | 'reactivate' | 'close';

const ACTIONS_BY_STATUS: Record<BranchStatus, readonly BranchLifecycleAction[]> = {
  DRAFT: ['submit', 'discard'],
  PENDING_APPROVAL: ['activate', 'withdraw', 'return'],
  ACTIVE: ['suspend', 'close'],
  SUSPENDED: ['reactivate', 'close'],
  CLOSED: [],
  ARCHIVED: [],
};

// Contract §E.3: submit, discard and withdraw (a maker's own request) need `branch.create`.
const PERMISSION: Record<BranchLifecycleAction, string> = {
  submit: 'branch.create',
  discard: 'branch.create',
  activate: 'branch.approve',
  withdraw: 'branch.create',
  return: 'branch.approve',
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

/** The bootstrap's head office, which discard refuses by its code (`isHeadOffice`, 409
 * `lifecycle.head_office_branch_protected`). */
const HEAD_OFFICE_CODE = 'HEAD_OFFICE';

interface BranchMakers {
  createdBy: ActorRef;
  submittedBy: ActorRef;
}

/** BranchProvisioningService.returnForChanges: the branch's creator or latest submitter withdraws
 * their own request; anyone else returns it as a checker. */
export function pendingBranchAction(branch: BranchMakers, callerId: string): SendBackAction {
  return isMaker([branch.createdBy?.id, branch.submittedBy?.id], callerId) ? 'withdraw' : 'return';
}

/** `POST /branches/{id}/return`'s own gate: `hasAnyAuthority('branch.create', 'branch.approve')`;
 * the service then checks the intent's code (`PERMISSION`) on the target. */
export const RETURN_ROUTE_CODES = ['branch.create', 'branch.approve'] as const;

/** Every transition reads the branch back (BG-31), so it needs `branch.view` there too, which
 * `canActOnBranch` checks with the code's other views. Withdraw, Return and Discard act on a
 * PENDING_APPROVAL or DRAFT branch, so they need their code tenant-wide (#242), as the platform's
 * discard does anyway. */
export function availableBranchActions(
  branch: Pick<BranchDetail, 'id' | 'status' | 'branchCode'> & BranchMakers,
  holder: PermissionHolder,
  callerId: string,
): BranchLifecycleAction[] {
  const sendBack = pendingBranchAction(branch, callerId);
  return ACTIONS_BY_STATUS[branch.status].filter((action) => {
    if ((action === 'withdraw' || action === 'return') && action !== sendBack) return false;
    if (action === 'discard' && branch.branchCode === HEAD_OFFICE_CODE) return false;
    const route = action === 'withdraw' || action === 'return' ? RETURN_ROUTE_CODES : undefined;
    return canActOnBranch(holder, PERMISSION[action], branch, route);
  });
}

/** Withdraw's and Return's words, the same on the branch record and the approval page. */
export function sendBackCopy(action: SendBackAction, name: string) {
  return action === 'withdraw'
    ? {
        label: 'Withdraw',
        title: `Withdraw ${name}?`,
        description: 'It goes back to draft so you can change it and submit it again.',
        reasonLabel: 'Reason',
        success: 'Branch withdrawn',
      }
    : {
        label: 'Return for changes',
        title: `Return ${name} for changes?`,
        description: 'It goes back to draft. Its maker sees your reason.',
        reasonLabel: 'What needs to change',
        success: 'Returned for changes',
      };
}

/** A draft that carries a reason was sent back: every transition overwrites `status_reason`, and
 * creating a draft leaves it null. Neutral, since the record can't tell a withdrawal from a return
 * (no actor of the last transition). */
export function sentBackNote(branch: Pick<BranchDetail, 'status' | 'statusReason'>): string | null {
  return branch.status === 'DRAFT' && branch.statusReason
    ? `Sent back: ${branch.statusReason}`
    : null;
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
