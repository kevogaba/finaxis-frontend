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
});
