import { z } from 'zod';
import { businessDateDay } from '@/lib/business-date';

/**
 * Shared wire primitives for backend responses (contract §A–§B). Domain contracts compose these
 * with snake_case item schemas that transform to camelCase domain types.
 */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uuidSchema = z.string().regex(UUID_PATTERN);

/** ISO-8601 UTC instants (`…Z`, fractional seconds only when non-zero). */
export const instantSchema = z.iso.datetime({ offset: true });

export const pageMetadataSchema = z
  .object({
    number: z.number().int(),
    size: z.number().int(),
    total_items: z.number().int(),
    total_pages: z.number().int(),
    has_next: z.boolean(),
    has_previous: z.boolean(),
  })
  .transform((page) => ({
    number: page.number,
    size: page.size,
    totalItems: page.total_items,
    totalPages: page.total_pages,
    hasNext: page.has_next,
    hasPrevious: page.has_previous,
  }));

export type PageMetadata = z.output<typeof pageMetadataSchema>;

export interface Page<T> {
  items: readonly T[];
  page: PageMetadata;
}

export function pageSchema<Item extends z.ZodType>(item: Item) {
  return z.object({ items: z.array(item), page: pageMetadataSchema });
}

/** `dd-MM-yyyy` business date (contract §A). */
export const businessDateSchema = z
  .string()
  .refine((value) => businessDateDay(value) !== null, 'Expected a dd-MM-yyyy business date');
