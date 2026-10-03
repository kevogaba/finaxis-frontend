import { z } from 'zod';
import type { BranchListQuery, UserListQuery } from './platform-administration.types';

const pageSchema = z.number().int().min(0).default(0);
const sizeSchema = z.number().int().min(1).max(100).default(25);

export function parsePage(value: string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return pageSchema.parse(Number.isInteger(parsed) ? parsed : 0);
}

export function parseSize(value: string | null | undefined): number {
  const parsed = Number(value ?? 25);
  return sizeSchema.parse(Number.isInteger(parsed) ? parsed : 25);
}

function optionalText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed?.length ? trimmed : undefined;
}

export function parseUserListQuery(params: URLSearchParams): UserListQuery {
  return {
    q: optionalText(params.get('q')),
    userStatus: optionalText(params.get('userStatus')),
    membershipStatus: optionalText(params.get('membershipStatus')),
    page: parsePage(params.get('page')),
    size: parseSize(params.get('size')),
  };
}

export function parseBranchListQuery(params: URLSearchParams): BranchListQuery {
  return {
    q: optionalText(params.get('q')),
    status: optionalText(params.get('status')),
    type: optionalText(params.get('type')),
    page: parsePage(params.get('page')),
    size: parseSize(params.get('size')),
    sortBy: optionalText(params.get('sortBy')),
    sortDir: params.get('sortDir') === 'desc' ? 'desc' : 'asc',
  };
}

export { toQueryString } from '@/lib/api/query-string';
