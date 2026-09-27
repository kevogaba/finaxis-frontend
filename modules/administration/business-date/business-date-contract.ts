import { z } from 'zod';
import { businessDateSchema, instantSchema, pageSchema } from '@/lib/api/wire';

export const BUSINESS_DATE_STATUSES = ['OPEN', 'CLOSING', 'CLOSED'] as const;
export type BusinessDateStatus = (typeof BUSINESS_DATE_STATUSES)[number];

export const currentBusinessDateSchema = z
  .object({
    organisation_id: z.string(),
    current_business_date: businessDateSchema,
    status: z.enum(BUSINESS_DATE_STATUSES),
  })
  .transform((value) => ({ date: value.current_business_date, status: value.status }));

export type CurrentBusinessDate = z.output<typeof currentBusinessDateSchema>;

const historyEntrySchema = z
  .object({
    event_type: z.string(),
    from_status: z.string().nullable(),
    to_status: z.string(),
    from_business_date: businessDateSchema.nullable(),
    to_business_date: businessDateSchema,
    actor_id: z.string().nullable(),
    reason: z.string().nullable(),
    occurred_at: instantSchema,
  })
  .transform((entry) => ({
    eventType: entry.event_type,
    fromStatus: entry.from_status,
    toStatus: entry.to_status,
    fromBusinessDate: entry.from_business_date,
    toBusinessDate: entry.to_business_date,
    actorUserId: entry.actor_id,
    reason: entry.reason,
    occurredAt: entry.occurred_at,
  }));

export type BusinessDateHistoryEntry = z.output<typeof historyEntrySchema>;

export const businessDateHistoryPageSchema = pageSchema(historyEntrySchema);
