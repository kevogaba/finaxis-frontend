import { describe, expect, it } from 'vitest';
import type { AuditEvent } from './audit-contract';
import { auditEntityName, auditTrailHref, auditUserIds, toAuditRows } from './audit-rows';

const ACTOR = '55555555-5555-4555-8555-555555555555';
const BRANCH = '44444444-4444-4444-8444-444444444444';
const USER = '66666666-6666-4666-8666-666666666666';

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 'e1',
    occurredAt: '2026-09-07T07:59:00Z',
    actorType: 'USER',
    actorUserId: ACTOR,
    branchId: BRANCH,
    action: 'user.invite',
    entityType: 'USER',
    entityId: USER,
    outcome: 'SUCCESS',
    severity: 'INFO',
    reason: 'New teller',
    ...overrides,
  };
}

const LOOKUPS = {
  names: new Map([
    [ACTOR, 'Jane Manager'],
    [USER, 'Mary Wanjiku'],
  ]),
  branches: new Map([[BRANCH, { name: 'Westlands Branch', code: 'WESTLANDS' }]]),
  timeZone: 'Africa/Nairobi',
};
const LINKS = {
  detail: (id: string) => `/detail/${id}`,
  actor: (id: string) => `/actor/${id}`,
};

describe('audit rows', () => {
  it('resolves names, the organisation timezone, vocabulary labels, and links', () => {
    expect(toAuditRows([event()], LOOKUPS, LINKS)).toEqual([
      {
        id: 'e1',
        date: '07 Sep 2026',
        time: '10:59',
        actorLabel: 'Jane Manager',
        actorFilterHref: `/actor/${ACTOR}`,
        actionLabel: 'Invited user',
        action: 'user.invite',
        reason: 'New teller',
        entityLabel: 'User · Mary Wanjiku',
        branchLabel: 'Westlands Branch',
        outcome: 'SUCCESS',
        severity: 'INFO',
        detailHref: '/detail/e1',
      },
    ]);
  });

  it('falls back to System, short IDs, and dashes', () => {
    const [system] = toAuditRows(
      [
        event({
          actorUserId: null,
          actorType: 'SYSTEM',
          entityType: 'ROLE',
          entityId: 'abcdef12-0000-4000-8000-000000000000',
          branchId: null,
        }),
      ],
      { ...LOOKUPS, names: new Map() },
      LINKS,
    );
    expect(system).toMatchObject({
      actorLabel: 'System',
      actorFilterHref: null,
      entityLabel: 'Role · abcdef12',
      branchLabel: '—',
    });

    const [noEntity] = toAuditRows(
      [event({ entityType: 'BUSINESS_DATE', entityId: null })],
      LOOKUPS,
      LINKS,
    );
    expect(noEntity?.entityLabel).toBe('Business date · —');
  });

  it('collects only actor and USER-entity IDs for name resolution', () => {
    expect(
      auditUserIds([event(), event({ actorUserId: null, entityType: 'BRANCH', entityId: BRANCH })]),
    ).toEqual([ACTOR, USER]);
  });

  it('names users and branches from the lookups, and anything else by short ID', () => {
    expect(auditEntityName('BRANCH', BRANCH, LOOKUPS)).toBe('Westlands Branch');
    expect(auditEntityName('USER', 'ffffffff-0000-4000-8000-000000000000', LOOKUPS)).toBe(
      'ffffffff',
    );
    expect(auditEntityName('MEMBERSHIP', USER, LOOKUPS)).toBe('66666666');
  });

  it('links to the audit trail narrowed to a view, optionally with an event open', () => {
    expect(auditTrailHref({ entityType: 'BRANCH', entityId: BRANCH, event: 'e1' })).toBe(
      `/admin/audit?entityType=BRANCH&entityId=${BRANCH}&event=e1`,
    );
    expect(auditTrailHref({ actorId: ACTOR })).toBe(`/admin/audit?actorId=${ACTOR}`);
  });
});
