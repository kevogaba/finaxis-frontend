import { requireContext, requirePermission, requireTenantContext } from '../access.mts';
import type { AccessContext } from '../access.mts';
import { recordAuditEvent } from '../audit-log.mts';
import { objectBody, pageOf, problem, readBody, sendJson, stringField } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { route } from '../router.mts';
import type { Route, RouteContext } from '../router.mts';
import type { FakeBusinessDate, RunState } from '../state.mts';

const BASE = '/api/v1/tenant/business-date';
const DATE = /^(\d{2})-(\d{2})-(\d{4})$/;

/** Strict dd-MM-yyyy → day number (the backend's date codec), or null. */
function dayNumber(value: string): number | null {
  const match = DATE.exec(value);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  return date.getUTCDate() === day &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCFullYear() === year
    ? time / 86_400_000
    : null;
}

function viewer(context: RouteContext): AccessContext {
  const access = requireContext(context);
  requireTenantContext(access);
  requirePermission(access, 'business_date.view');
  return access;
}

function currentFor(state: RunState, access: AccessContext): FakeBusinessDate {
  const record = state.businessDates.find(
    (candidate) => candidate.organisationId === access.organisation.id,
  );
  if (!record) {
    throw problem(404, 'resource_not_found', 'Business date not found.');
  }
  return record;
}

function takeLock(state: RunState): void {
  if (state.lockTimeoutsRemaining > 0) {
    state.lockTimeoutsRemaining -= 1;
    throw problem(
      409,
      'lifecycle.business_date_lock_timeout',
      'Timed out waiting for the business date lock.',
    );
  }
}

const toWire = (record: FakeBusinessDate) => ({
  organisation_id: record.organisationId,
  current_business_date: record.date,
  status: record.status,
});

/**
 * Each transition's permission code is also its audit action name (contract §G/§J), so
 * `recordAuditEvent` reuses `permission` directly instead of taking a separate action argument.
 */
function transition(
  path: string,
  permission: string,
  from: FakeBusinessDate['status'],
  to: FakeBusinessDate['status'],
  eventType: string,
): Route {
  return route('POST', `${BASE}${path}`, async (context) => {
    const access = viewer(context);
    requirePermission(access, permission);
    const body = objectBody(await readBody(context.req), ['reason']);
    const reason = stringField(body, 'reason', { required: false });
    sendIdempotent(context, body, () => {
      const record = currentFor(context.state, access);
      takeLock(context.state);
      if (record.status !== from) {
        throw problem(409, 'conflict', `The business date must be ${from}.`);
      }
      record.status = to;
      context.state.businessDateHistory.unshift({
        organisationId: record.organisationId,
        eventType,
        fromStatus: from,
        toStatus: to,
        fromDate: record.date,
        toDate: record.date,
        actorUserId: access.claims.userId,
        reason,
        occurredAt: new Date().toISOString(),
      });
      recordAuditEvent(context.state, access, {
        entityType: 'BUSINESS_DATE',
        entityId: null,
        action: permission,
        reason,
      });
      return toWire(record);
    });
  });
}

export const businessDateRoutes: Route[] = [
  route('GET', BASE, (context) => {
    const access = viewer(context);
    sendJson(context.res, 200, toWire(currentFor(context.state, access)));
  }),

  route('GET', `${BASE}/history`, (context) => {
    const access = viewer(context);
    const entries = context.state.businessDateHistory
      .filter((entry) => entry.organisationId === access.organisation.id)
      .map((entry) => ({
        event_type: entry.eventType,
        from_status: entry.fromStatus,
        to_status: entry.toStatus,
        from_business_date: entry.fromDate,
        to_business_date: entry.toDate,
        actor_id: entry.actorUserId,
        reason: entry.reason,
        occurred_at: entry.occurredAt,
      }));
    sendJson(context.res, 200, pageOf(entries, context.query));
  }),

  transition('/cob/start', 'cob.start', 'OPEN', 'CLOSING', 'COB_STARTED'),
  transition('/cob/complete', 'cob.complete', 'CLOSING', 'CLOSED', 'COB_COMPLETED'),
  transition('/reopen', 'business_date.reopen', 'CLOSED', 'OPEN', 'REOPENED'),

  route('POST', `${BASE}/advance`, async (context) => {
    const access = viewer(context);
    requirePermission(access, 'business_date.advance');
    const body = objectBody(await readBody(context.req), ['new_business_date', 'reason']);
    const next = stringField(body, 'new_business_date', { required: true }) ?? '';
    const reason = stringField(body, 'reason', { required: false });
    const nextDay = dayNumber(next);
    if (nextDay === null) {
      // Mirrors ApiJsonCodec's one generic detail for a malformed body (http.mts's `readBody`):
      // the backend never discloses which field failed its `date` codec.
      throw problem(400, 'invalid_json', 'Malformed request body.');
    }
    sendIdempotent(context, body, () => {
      const record = currentFor(context.state, access);
      takeLock(context.state);
      if (record.status !== 'OPEN') {
        throw problem(409, 'conflict', 'The business date must be OPEN to advance.');
      }
      if (nextDay <= (dayNumber(record.date) ?? Number.MAX_SAFE_INTEGER)) {
        throw problem(
          422,
          'invalid_operation',
          'The new business date must be after the current one.',
        );
      }
      const previous = record.date;
      record.date = next;
      context.state.businessDateHistory.unshift({
        organisationId: record.organisationId,
        eventType: 'ADVANCED',
        fromStatus: 'OPEN',
        toStatus: 'OPEN',
        fromDate: previous,
        toDate: next,
        actorUserId: access.claims.userId,
        reason,
        occurredAt: new Date().toISOString(),
      });
      recordAuditEvent(context.state, access, {
        entityType: 'BUSINESS_DATE',
        entityId: null,
        action: 'business_date.advance',
        reason,
      });
      return {
        organisation_id: record.organisationId,
        previous_business_date: previous,
        new_business_date: next,
      };
    });
  }),
];
