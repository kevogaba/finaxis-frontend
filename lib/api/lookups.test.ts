import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';

const apiGet = vi.fn();
vi.mock('./tenant-api', () => ({ apiGet: (...args: unknown[]) => apiGet(...args) as unknown }));

const { getBranchIndex, getOrganisationTimeZone, resolveUserNames } = await import('./lookups');

/** Parses `raw` with whatever schema the call site passes, so a schema miss rejects like the real `apiGet`. */
const wire =
  (raw: unknown) =>
  (_path: string, schema: z.ZodType): Promise<unknown> =>
    Promise.resolve().then(() => schema.parse(raw));

/** `pageMetadataSchema` requires all six fields; `total_items`/`total_pages` are filler here. */
const envelope = (number: number, hasNext: boolean) => ({
  number,
  size: 100,
  total_items: 0,
  total_pages: 0,
  has_next: hasNext,
  has_previous: number > 0,
});

beforeEach(() => {
  apiGet.mockReset();
});

describe('lookups', () => {
  it('resolves each distinct user id once and skips unresolvable ones', async () => {
    apiGet.mockImplementation((path: string, schema: z.ZodType) =>
      path.endsWith('/u1')
        ? wire({ id: 'u1', display_name: 'Jane', email: 'j@x' })(path, schema)
        : Promise.reject(new BackendApiError(404)),
    );

    const names = await resolveUserNames(['u1', 'u1', 'u2']);

    expect(names.get('u1')).toBe('Jane');
    expect(names.has('u2')).toBe(false);
    expect(apiGet.mock.calls.filter(([path]) => String(path).endsWith('/u1'))).toHaveLength(1);
    expect(apiGet).toHaveBeenCalledWith('/api/v1/tenant/users/u1', expect.anything());
  });

  it('pages through branches until the last page', async () => {
    apiGet
      .mockImplementationOnce(
        wire({
          items: [{ id: 'b1', branch_name: 'Head Office', branch_code: 'HQ' }],
          page: envelope(0, true),
        }),
      )
      .mockImplementationOnce(
        wire({
          items: [{ id: 'b2', branch_name: 'Westlands', branch_code: 'WST' }],
          page: envelope(1, false),
        }),
      );

    const index = await getBranchIndex();

    expect(index.get('b1')).toEqual({ name: 'Head Office', code: 'HQ' });
    expect(index.get('b2')).toEqual({ name: 'Westlands', code: 'WST' });
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(apiGet).toHaveBeenNthCalledWith(
      1,
      '/api/v1/branches?page=0&size=100&sort_by=branchName&sort_dir=ASC',
      expect.anything(),
    );
    expect(apiGet).toHaveBeenNthCalledWith(
      2,
      '/api/v1/branches?page=1&size=100&sort_by=branchName&sort_dir=ASC',
      expect.anything(),
    );
  });

  it('stops at the 5-page ceiling', async () => {
    apiGet.mockImplementation((path: string, schema: z.ZodType) =>
      wire({ items: [], page: envelope(0, true) })(path, schema),
    );

    await getBranchIndex();

    expect(apiGet).toHaveBeenCalledTimes(5);
    expect(apiGet).toHaveBeenNthCalledWith(
      5,
      '/api/v1/branches?page=4&size=100&sort_by=branchName&sort_dir=ASC',
      expect.anything(),
    );
  });

  it('falls back to UTC when the organisation timezone is unreadable', async () => {
    apiGet.mockRejectedValueOnce(new BackendApiError(403));
    await expect(getOrganisationTimeZone()).resolves.toBe('UTC');
  });

  it('falls back to UTC when the backend returns a zone Intl cannot format', async () => {
    apiGet.mockImplementationOnce(wire({ timezone: 'Mars/Olympus' }));
    await expect(getOrganisationTimeZone()).resolves.toBe('UTC');
  });

  it('resolves the organisation timezone on the happy path', async () => {
    apiGet.mockImplementationOnce(wire({ timezone: 'Africa/Nairobi' }));
    await expect(getOrganisationTimeZone()).resolves.toBe('Africa/Nairobi');
    expect(apiGet).toHaveBeenCalledWith('/api/v1/tenant', expect.anything());
  });
});
