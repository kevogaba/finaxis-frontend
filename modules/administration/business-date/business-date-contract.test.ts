import { describe, expect, it } from 'vitest';
import { businessDateHistoryPageSchema, currentBusinessDateSchema } from './business-date-contract';

describe('business date contract', () => {
  it('maps the current business date', () => {
    expect(
      currentBusinessDateSchema.parse({
        organisation_id: 'o1',
        current_business_date: '07-09-2026',
        status: 'OPEN',
      }),
    ).toEqual({ date: '07-09-2026', status: 'OPEN' });
  });

  it('rejects an ISO date or an unknown status (schema drift)', () => {
    const base = { organisation_id: 'o1', current_business_date: '07-09-2026', status: 'OPEN' };
    expect(
      currentBusinessDateSchema.safeParse({ ...base, current_business_date: '2026-09-07' }).success,
    ).toBe(false);
    expect(currentBusinessDateSchema.safeParse({ ...base, status: 'PAUSED' }).success).toBe(false);
  });

  it('maps history entries, which carry no id', () => {
    const page = businessDateHistoryPageSchema.parse({
      items: [
        {
          event_type: 'ADVANCED',
          from_status: 'OPEN',
          to_status: 'OPEN',
          from_business_date: '04-09-2026',
          to_business_date: '07-09-2026',
          actor_id: 'u1',
          reason: null,
          occurred_at: '2026-09-07T05:00:00Z',
        },
      ],
      page: {
        number: 0,
        size: 20,
        total_items: 1,
        total_pages: 1,
        has_next: false,
        has_previous: false,
      },
    });
    expect(page.items[0]).toEqual({
      eventType: 'ADVANCED',
      fromStatus: 'OPEN',
      toStatus: 'OPEN',
      fromBusinessDate: '04-09-2026',
      toBusinessDate: '07-09-2026',
      actorUserId: 'u1',
      reason: null,
      occurredAt: '2026-09-07T05:00:00Z',
    });
  });
});
