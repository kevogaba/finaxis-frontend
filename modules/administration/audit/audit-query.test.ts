import { describe, expect, it } from 'vitest';
import { auditApiPath, parseAuditQuery } from './audit-query';

const USER_ID = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

describe('audit query', () => {
  it('keeps valid filters and paging', () => {
    const query = parseAuditQuery(
      new URLSearchParams(
        `entityType=USER&action=user.invite&actorId=${USER_ID}&occurredFrom=2026-09-01T00:00:00.000Z&page=2&size=50`,
      ),
    );
    expect(query).toEqual({
      entityType: 'USER',
      action: 'user.invite',
      actorId: USER_ID,
      occurredFrom: '2026-09-01T00:00:00.000Z',
      page: 2,
      size: 50,
    });
  });

  it('drops unknown entity types, malformed ids and instants, and bad paging', () => {
    expect(
      parseAuditQuery(
        new URLSearchParams('entityType=NOPE&actorId=x&occurredTo=yesterday&page=-1&size=7'),
      ),
    ).toEqual({ page: 0, size: 20 });
  });

  it('builds the snake_case API path', () => {
    expect(auditApiPath({ entityType: 'BRANCH', page: 1, size: 20 })).toBe(
      '/api/v1/tenant/audit-events?entity_type=BRANCH&page=1&size=20',
    );
  });

  it('maps every filter to its snake_case wire name', () => {
    expect(
      auditApiPath({
        entityType: 'USER',
        entityId: 'e1111111-1111-4111-8111-111111111111',
        actorId: 'a2222222-2222-4222-8222-222222222222',
        action: 'user.invite',
        occurredFrom: '2026-09-01T00:00:00.000Z',
        occurredTo: '2026-09-02T00:00:00.000Z',
        page: 1,
        size: 20,
      }),
    ).toBe(
      '/api/v1/tenant/audit-events' +
        '?entity_type=USER' +
        '&entity_id=e1111111-1111-4111-8111-111111111111' +
        '&actor_id=a2222222-2222-4222-8222-222222222222' +
        '&action=user.invite' +
        '&occurred_from=2026-09-01T00%3A00%3A00.000Z' +
        '&occurred_to=2026-09-02T00%3A00%3A00.000Z' +
        '&page=1&size=20',
    );
  });
});
