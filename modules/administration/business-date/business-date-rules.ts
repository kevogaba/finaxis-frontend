import { canAllTenantWide, type PermissionHolder } from '@/auth/permissions';
import { withViews } from '@/auth/permission-views';
import { humanizeEnum } from '@/components/data-display/status-chip';
import type { BusinessDateStatus } from './business-date-contract';

/** Each action's id is also the permission that allows it. */
export type BusinessDateAction =
  'cob.start' | 'business_date.advance' | 'cob.complete' | 'business_date.reopen';

const ACTIONS_BY_STATUS: Record<BusinessDateStatus, readonly BusinessDateAction[]> = {
  OPEN: ['cob.start', 'business_date.advance'],
  CLOSING: ['cob.complete'],
  CLOSED: ['business_date.reopen'],
};

/** Each action with the `business_date.view` it implies, tenant-wide, as BusinessDateService
 * checks them (ADR 0030, BG-33). */
export function availableBusinessDateActions(
  status: BusinessDateStatus,
  holder: PermissionHolder,
): BusinessDateAction[] {
  return ACTIONS_BY_STATUS[status].filter((action) =>
    canAllTenantWide(holder, withViews([action])),
  );
}

const EVENT_LABELS: Record<string, string> = {
  ADVANCED: 'Date advanced',
  COB_STARTED: 'Close of business started',
  COB_COMPLETED: 'Close of business completed',
  REOPENED: 'Reopened',
};

export function historyEventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? humanizeEnum(eventType);
}
