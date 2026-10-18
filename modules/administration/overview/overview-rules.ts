import { can, canAll, canAny, type PermissionHolder } from '@/auth/permissions';
import {
  BRANCH_ACTIVATION_CODES,
  USER_APPROVAL_CODES,
} from '@/modules/administration/approvals/approval-rules';
import { READINESS_CODES, READINESS_LINKS } from './readiness-rules';

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
