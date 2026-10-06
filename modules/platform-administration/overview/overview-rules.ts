import type { NotificationsMenuProps } from '@/components/shell/notifications-menu';
import type { Page } from '@/lib/api/wire';
import type { TenantSummary } from '../tenants/tenant-contract';

/** The Needs attention table shows at most this many institutions per status (Ruling 10). */
export const ATTENTION_PREVIEW_SIZE = 5;

/**
 * BG-29: `status=ACTIVE` counts the reserved platform organisation. It is always ACTIVE while anyone
 * works in the platform context (contract §A re-validates the organisation on every request), so
 * that count holds it exactly once, and no other status ever holds it.
 */
export function activeInstitutionCount(activeTotal: number): number {
  return Math.max(0, activeTotal - 1);
}

/** A settled read, structurally `Loaded<Page<TenantSummary>>` (lib/api/load.ts is server-only). */
export type AttentionRead =
  { ok: true; value: Page<TenantSummary> } | { ok: false; problem: { requestId: string | null } };

export interface AttentionView {
  /** Pending approval first, then drafts, each oldest first as read. */
  rows: TenantSummary[];
  /** One sentence per failed read, with its reference. */
  failures: string[];
  /** Links to the full, filtered directory when a list holds more than the preview. */
  more: { href: string; label: string }[];
  /** Only when nothing is listed, and only what is known (rule 9). */
  empty: { title: string; description?: string } | null;
}

const DIRECTORY = '/platform-admin/tenants';
export const PENDING_HREF = `${DIRECTORY}?status=PENDING_APPROVAL&sortBy=createdAt&sortDir=ASC`;
export const DRAFTS_HREF = `${DIRECTORY}?status=DRAFT&sortBy=createdAt&sortDir=ASC`;

const reference = (requestId: string | null) => (requestId ? ` Reference: ${requestId}` : '');
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

export function attentionView(
  pending: AttentionRead,
  drafts: AttentionRead,
  isPlatform: (id: string) => boolean,
): AttentionView {
  const visible = (read: AttentionRead) =>
    read.ok ? read.value.items.filter((tenant) => !isPlatform(tenant.id)) : [];
  const pendingRows = visible(pending);
  const draftRows = visible(drafts);
  const failures = [
    ...(pending.ok
      ? []
      : [
          `Institutions pending approval couldn't be loaded.${reference(pending.problem.requestId)}`,
        ]),
    ...(drafts.ok ? [] : [`Drafts couldn't be loaded.${reference(drafts.problem.requestId)}`]),
  ];
  const more: AttentionView['more'] = [];
  if (pending.ok && pending.value.page.totalItems > pendingRows.length) {
    const total = pending.value.page.totalItems;
    more.push({
      href: PENDING_HREF,
      label: `View all ${total} ${plural(total, 'institution', 'institutions')} pending approval`,
    });
  }
  if (drafts.ok && drafts.value.page.totalItems > draftRows.length) {
    const total = drafts.value.page.totalItems;
    more.push({
      href: DRAFTS_HREF,
      label: `View all ${total} ${plural(total, 'draft', 'drafts')}`,
    });
  }
  const rows = [...pendingRows, ...draftRows];
  let empty: AttentionView['empty'] = null;
  if (rows.length === 0) {
    if (pending.ok && drafts.ok) {
      empty = {
        title: 'Nothing needs attention',
        description: 'No institution is waiting for approval, and there are no drafts.',
      };
    } else if (pending.ok) {
      empty = { title: 'No institution is waiting for approval' };
    } else if (drafts.ok) {
      empty = { title: 'There are no drafts' };
    }
  }
  return { rows, failures, more, empty };
}

export const OVERVIEW_DESCRIPTION =
  "Institutions by lifecycle, the platform's operators, and the requests waiting for someone.";
export const ATTENTION_DESCRIPTION =
  'Institutions waiting for approval, then drafts, oldest first.';

/** The five tiles' copy (Ruling 9); every link name is unique on the page (rule 12). */
export const KPI = {
  active: {
    label: 'Active institutions',
    caption: 'Leaves out the platform organisation itself',
    href: `${DIRECTORY}?status=ACTIVE`,
    link: 'View active institutions',
  },
  pending: {
    label: 'Pending approval',
    caption: 'Waiting for a second platform administrator',
    href: PENDING_HREF,
    link: 'Review pending institutions',
  },
  drafts: {
    label: 'Drafts',
    caption: 'Not yet submitted for approval',
    href: DRAFTS_HREF,
    link: 'View drafts',
  },
  suspended: {
    label: 'Suspended',
    caption: 'Nobody can work in them until they are reactivated',
    href: `${DIRECTORY}?status=SUSPENDED`,
    link: 'View suspended institutions',
  },
  operators: {
    label: 'Platform operators',
    caption: 'Active accounts with an active platform membership',
    href: '/platform-admin/users?userStatus=ACTIVE&membershipStatus=ACTIVE',
    link: 'View platform operators',
  },
} as const;

/** The platform badge (spec §8, BG-22). `null`: the read failed, which never reads as "none". */
export function pendingApprovalNotifications(count: number | null): NotificationsMenuProps {
  const common = {
    emptyText: 'No institutions are waiting for approval.',
    unavailableText: "Pending approvals couldn't be loaded. Refresh to try again.",
  };
  if (count === null) {
    return { ...common, label: "Notifications (couldn't be loaded)", total: null, entries: [] };
  }
  if (count === 0)
    return { ...common, label: 'Notifications: nothing waiting', total: 0, entries: [] };
  return {
    ...common,
    label: `Notifications: ${count} ${plural(count, 'institution', 'institutions')} waiting for approval`,
    total: count,
    entries: [
      {
        id: 'pending-institutions',
        text: `${count} ${plural(count, 'institution is', 'institutions are')} waiting for approval.`,
        // The Pending approval tile's list, oldest first: one name, one destination (rule 12).
        href: PENDING_HREF,
        linkLabel: 'Review pending institutions',
      },
    ],
  };
}
