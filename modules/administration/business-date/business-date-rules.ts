import { can, type PermissionHolder } from '@/auth/permissions';
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

/** Mutations also need `business_date.view`: the backend reads the result back (BG-31). */
export function availableBusinessDateActions(
  status: BusinessDateStatus,
  holder: PermissionHolder,
): BusinessDateAction[] {
  if (!can(holder, 'business_date.view')) return [];
  return ACTIONS_BY_STATUS[status].filter((action) => can(holder, action));
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
