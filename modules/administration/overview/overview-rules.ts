import { can, canAll, canAny, type PermissionHolder } from '@/auth/permissions';
import type { NotificationEntry } from '@/components/shell/notifications-menu';
import { formatInstant, shortId } from '@/lib/format';
import type { Page } from '@/lib/api/wire';
import {
  approvalNotifications,
  type UserApprovalCounts,
} from '@/modules/administration/approvals/approval-notifications';
import {
  BRANCH_ACTIVATION_CODES,
  BRANCH_QUEUE_LABEL,
  branchApprovalHref,
  USER_APPROVAL_CODES,
  USER_QUEUE_LABEL,
  userApprovalHref,
} from '@/modules/administration/approvals/approval-rules';
import type { AuditEvent } from '@/modules/administration/audit/audit-contract';
import { auditTrailHref } from '@/modules/administration/audit/audit-rows';
import { actionLabel } from '@/modules/administration/audit/audit-vocabulary';
import type { BranchSummary } from '@/modules/administration/branches/branch-contract';
import { branchTypeLabel } from '@/modules/administration/branches/branch-rules';
import type { UserSummary } from '@/modules/administration/users/user-contract';
import {
  provisioningNote,
  READINESS_CODES,
  READINESS_LINKS,
  type Settled,
} from './readiness-rules';

/**
 * Layer 14's overview (spec §10.8), client-safe: which cards a holder sees, the Pending approvals
 * preview, the Recent activity rows, and every string the page and its cards share.
 */

export const OVERVIEW_TITLE = 'Administration Overview';
export const OVERVIEW_DESCRIPTION =
  "Manage your institution's operational setup, users, and controls.";

export const CARD_TITLES = {
  businessDate: 'Business date',
  approvals: 'Pending approvals',
  readiness: 'Operational readiness',
  activity: 'Recent activity',
} as const;

export interface OverviewCards {
  businessDate: boolean;
  /** The kinds of request the holder can decide; `null`: neither, so the card is omitted. */
  approvals: { users: boolean; branches: boolean } | null;
  readiness: boolean;
  /** `null` without `audit.view`; else whether the actors' names (`user.view`) and the
   * organisation's timezone (`tenant.view`) may be read: without them, short ids and UTC (rule 5). */
  activity: { names: boolean; timeZone: boolean } | null;
}

/** Ruling 2: a card the holder could never read or act on is omitted, decided before any read.
 * Readiness shows while at least one of its items can be checked. */
export function overviewCards(holder: PermissionHolder): OverviewCards {
  const users = canAll(holder, USER_APPROVAL_CODES);
  const branches = canAll(holder, BRANCH_ACTIVATION_CODES);
  return {
    businessDate: can(holder, 'business_date.view'),
    approvals: users || branches ? { users, branches } : null,
    readiness: canAny(holder, Object.values(READINESS_CODES)),
    activity: can(holder, 'audit.view')
      ? { names: can(holder, 'user.view'), timeZone: can(holder, 'tenant.view') }
      : null,
  };
}

/** True when no card applies: the page then says so once, under its heading (Ruling 2). */
export function noOverviewCards(cards: OverviewCards): boolean {
  return !cards.businessDate && !cards.approvals && !cards.readiness && !cards.activity;
}

export const NO_OVERVIEW_CARDS =
  'Nothing on this overview is available to your role here; the navigation lists the pages you can open.';

// ── Business date ────────────────────────────────────────────────────────────────────────────────

export const BUSINESS_DATE_HREF = READINESS_LINKS.businessDate.href;
export const BUSINESS_DATE_DESCRIPTION = 'The date this institution is working on.';
export const BUSINESS_DATE_LINK = READINESS_LINKS.businessDate.label;

// ── Pending approvals (Ruling 5) ─────────────────────────────────────────────────────────────────

/** The preview's length, and the branch read's page size (spec §10.8: up to five rows). */
export const APPROVAL_PREVIEW_SIZE = 5;
/** The users read's ceiling: the backend's maximum page (contract §A). */
export const USER_PREVIEW_CEILING = 100;

/** BG-11: an approved user can stay PROVISIONING_IDP with a pending membership for good, and the
 * endpoint can't leave such rows out, so the users read is wide enough to skip every one of them
 * and still hold five requests waiting for a decision (Ruling 5). */
export function userPreviewSize(provisioning: number): number {
  return Math.min(USER_PREVIEW_CEILING, APPROVAL_PREVIEW_SIZE + Math.max(0, provisioning));
}

export const APPROVALS_DESCRIPTION = 'Requests waiting for a decision, newest first.';
export const APPROVALS_LINK = 'Open the approval queue';
export const REQUESTS_LABEL = 'Requests waiting for a decision';
export const REVIEW = 'Review';

export interface ApprovalRow {
  id: string;
  kind: 'user' | 'branch';
  name: string;
  /** The queue it sits in, then an email, or a code and a type. */
  detail: string;
  href: string;
  /** The Review link's accessible name: "Review <name>". */
  reviewLabel: string;
}

export interface PendingApprovalsView {
  /** The bell's own entries (spec §8): each count with its tab's link. Empty after any failure. */
  summary: readonly NotificationEntry[];
  /** Up to five: users waiting for approval first, then branches, each newest first. */
  rows: readonly ApprovalRow[];
  /** One sentence per kind whose read failed, with its reference (rule 6). */
  failures: readonly string[];
  /** Identities still provisioning: approval already ran, so they are not listed (BG-11). */
  provisioning: string | null;
  /** Nothing waits, and every permitted read said so. */
  empty: boolean;
}

/** What the section read: each `null` when the holder can't decide that kind of request. */
export interface PendingApprovalsReads {
  /** The first page of memberships pending approval (`userPreviewSize` rows), provisioning
   * identities included. */
  users: Settled<Page<UserSummary>>;
  /** The bell's two counts (pending, and of those provisioning), shared per request. */
  userCounts: Settled<UserApprovalCounts>;
  /** The first page of branches pending activation, newest first; its total is the count. */
  branches: Settled<Page<BranchSummary>>;
  branchSelected: boolean;
}

const reference = (requestId: string | null) => (requestId ? ` Reference: ${requestId}` : '');

function userRow(user: UserSummary): ApprovalRow {
  return {
    id: user.id,
    kind: 'user',
    name: user.displayName,
    detail: `${USER_QUEUE_LABEL} · ${user.email}`,
    href: userApprovalHref(user.id),
    reviewLabel: `${REVIEW} ${user.displayName}`,
  };
}

function branchRow(branch: BranchSummary): ApprovalRow {
  return {
    id: branch.id,
    kind: 'branch',
    name: branch.branchName,
    detail: `${BRANCH_QUEUE_LABEL} · ${branch.branchCode} · ${branchTypeLabel(branch.branchType)}`,
    href: branchApprovalHref(branch.id),
    reviewLabel: `${REVIEW} ${branch.branchName}`,
  };
}

export function pendingApprovalsView(reads: PendingApprovalsReads): PendingApprovalsView {
  const failures: string[] = [];
  const userFailure =
    reads.users?.ok === false
      ? reads.users.problem
      : reads.userCounts?.ok === false
        ? reads.userCounts.problem
        : null;
  if (userFailure) {
    failures.push(
      `Users waiting for approval couldn't be loaded.${reference(userFailure.requestId)}`,
    );
  }
  if (reads.branches?.ok === false) {
    failures.push(
      `Branches waiting for activation couldn't be loaded.${reference(reads.branches.problem.requestId)}`,
    );
  }
  const users = reads.users?.ok
    ? reads.users.value.items.filter((user) => user.userStatus !== 'PROVISIONING_IDP').map(userRow)
    : [];
  const branches = reads.branches?.ok ? reads.branches.value.items.map(branchRow) : [];
  const rows = [...users, ...branches].slice(0, APPROVAL_PREVIEW_SIZE);
  // The bell's arithmetic and words, from the same reads: a count that failed is never a number.
  const summary =
    failures.length > 0
      ? []
      : approvalNotifications({
          users: reads.userCounts,
          branches:
            reads.branches === null
              ? null
              : reads.branches.ok
                ? { ok: true, value: reads.branches.value.page.totalItems }
                : { ok: false },
          branchSelected: reads.branchSelected,
        }).entries;
  const provisioning =
    reads.userCounts?.ok && reads.userCounts.value.provisioning > 0
      ? provisioningNote(reads.userCounts.value.provisioning)
      : null;
  return {
    summary,
    rows,
    failures,
    provisioning,
    empty: failures.length === 0 && summary.length === 0 && rows.length === 0,
  };
}

// ── Recent activity ──────────────────────────────────────────────────────────────────────────────

/** The five latest audit events (spec §10.8); the endpoint lists newest first. */
export const ACTIVITY_SIZE = 5;
export const ACTIVITY_HREF = auditTrailHref({});
/** Never "audit trail": that name belongs to the navigation item (e2e/audit.spec.ts finds it). */
export const ACTIVITY_LINK = 'View all activity';
export const ACTIVITY_LABEL = 'Latest events';
export const NO_ACTIVITY = 'Nothing has been recorded yet.';

/** The activity card's description before its zone is known (its skeleton, while the events load). */
export const ACTIVITY_DESCRIPTION = 'The latest events.';

export function activityDescription(timeZone: string): string {
  return `${ACTIVITY_DESCRIPTION} Times in ${timeZone}.`;
}

export interface ActivityRow {
  id: string;
  action: string;
  actor: string;
  /** `07 Sep 2026 · 10:59`, in the organisation's timezone. */
  when: string;
  /** The audit trail with this event's drawer open. */
  href: string;
  linkLabel: string;
}

/** Actors by resolved name, else a short id; a system event reads "System" (as the audit trail). */
export function activityRows(
  events: readonly AuditEvent[],
  names: ReadonlyMap<string, string>,
  timeZone: string,
): ActivityRow[] {
  return events.map((event) => {
    const at = formatInstant(event.occurredAt, timeZone);
    const action = actionLabel(event.action);
    return {
      id: event.id,
      action,
      actor: event.actorUserId
        ? (names.get(event.actorUserId) ?? shortId(event.actorUserId))
        : 'System',
      when: `${at.date} · ${at.time}`,
      href: auditTrailHref({ event: event.id }),
      linkLabel: `View event: ${action}, ${at.date} ${at.time}`,
    };
  });
}
