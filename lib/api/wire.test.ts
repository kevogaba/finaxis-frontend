import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { businessDateSchema, instantSchema, pageSchema, uuidSchema } from './wire';

const envelope = {
  items: [{ id: 'a' }],
  page: {
    number: 1,
    size: 20,
    total_items: 41,
    total_pages: 3,
    has_next: true,
    has_previous: true,
  },
};

describe('wire helpers', () => {
  it('maps the snake_case page envelope to camelCase and keeps items typed', () => {
    const parsed = pageSchema(z.object({ id: z.string() })).parse(envelope);

    expect(parsed).toEqual({
      items: [{ id: 'a' }],
      page: {
        number: 1,
        size: 20,
        totalItems: 41,
        totalPages: 3,
        hasNext: true,
        hasPrevious: true,
      },
    });
  });

  it('ignores extra fields and rejects missing page metadata', () => {
    const schema = pageSchema(z.object({ id: z.string() }));
    expect(schema.safeParse({ ...envelope, extra: true }).success).toBe(true);
    expect(schema.safeParse({ items: [] }).success).toBe(false);
  });

  it('accepts canonical UUIDs (including the reserved nil UUID) and ISO instants', () => {
    expect(uuidSchema.safeParse('00000000-0000-0000-0000-000000000000').success).toBe(true);
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
    expect(instantSchema.safeParse('2026-07-21T10:15:30Z').success).toBe(true);
    expect(instantSchema.safeParse('2026-07-21T10:15:30.123456Z').success).toBe(true);
    expect(instantSchema.safeParse('21-07-2026').success).toBe(false);
  });

  it('accepts dd-MM-yyyy business dates only', () => {
    expect(businessDateSchema.safeParse('07-09-2026').success).toBe(true);
    expect(businessDateSchema.safeParse('2026-09-07').success).toBe(false);
    expect(businessDateSchema.safeParse('31-02-2026').success).toBe(false);
  });
});
