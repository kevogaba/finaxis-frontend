import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

const apiGet = vi.fn();
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args) as unknown,
}));

const { getBusinessDate, listBusinessDateHistory } = await import('./business-date-service');

/** Parses `raw` with whatever schema the call site passes, so a schema miss rejects like the real `apiGet`. */
const wire =
  (raw: unknown) =>
  (_path: string, schema: z.ZodType): Promise<unknown> =>
    Promise.resolve().then(() => schema.parse(raw));

describe('business date service', () => {
  it('reads the current business date at the exact path and maps it to camelCase', async () => {
    apiGet.mockImplementationOnce(
      wire({ organisation_id: 'o1', current_business_date: '07-09-2026', status: 'OPEN' }),
    );

    await expect(getBusinessDate()).resolves.toEqual({ date: '07-09-2026', status: 'OPEN' });
    expect(apiGet).toHaveBeenCalledWith('/api/v1/tenant/business-date', expect.anything());
  });

  it('reads history at the exact paginated path and maps entries to camelCase', async () => {
    apiGet.mockImplementationOnce(
      wire({
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
      }),
    );

    const result = await listBusinessDateHistory({ page: 0, size: 20 });

    expect(apiGet).toHaveBeenCalledWith(
      '/api/v1/tenant/business-date/history?page=0&size=20',
      expect.anything(),
    );
    expect(result.items[0]).toEqual({
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
