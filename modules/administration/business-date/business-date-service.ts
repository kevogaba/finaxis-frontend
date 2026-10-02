import 'server-only';
import { cache } from 'react';
import { toQueryString } from '@/lib/api/query-string';
import { apiGet } from '@/lib/api/tenant-api';
import { businessDateHistoryPageSchema, currentBusinessDateSchema } from './business-date-contract';

/** One read per request, shared by the page and the app-bar indicator. */
export const getBusinessDate = cache(() =>
  apiGet('/api/v1/tenant/business-date', currentBusinessDateSchema),
);

export function listBusinessDateHistory(paging: { page: number; size: number }) {
  return apiGet(
    `/api/v1/tenant/business-date/history${toQueryString(paging)}`,
    businessDateHistoryPageSchema,
  );
}
