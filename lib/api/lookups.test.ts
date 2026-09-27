import { describe, expect, it, vi } from 'vitest';
import { BackendApiError } from '@/auth/backend-api';

const apiGet = vi.fn();
vi.mock('./tenant-api', () => ({ apiGet: (...args: unknown[]) => apiGet(...args) as unknown }));

const { getBranchIndex, getOrganisationTimeZone, resolveUserNames } = await import('./lookups');

describe('lookups', () => {
  it('resolves each distinct user id once and skips unresolvable ones', async () => {
    apiGet.mockImplementation((path: string) =>
      path.endsWith('/u1')
        ? Promise.resolve({ id: 'u1', displayName: 'Jane', email: 'j@x' })
        : Promise.reject(new BackendApiError(404)),
    );

    const names = await resolveUserNames(['u1', 'u1', 'u2']);

    expect(names.get('u1')).toBe('Jane');
    expect(names.has('u2')).toBe(false);
    expect(apiGet.mock.calls.filter(([path]) => String(path).endsWith('/u1'))).toHaveLength(1);
  });

  it('pages through branches up to the ceiling', async () => {
    apiGet.mockReset();
    apiGet
      .mockResolvedValueOnce({
        items: [{ id: 'b1', branchName: 'Head Office', branchCode: 'HQ' }],
        page: { hasNext: true },
      })
      .mockResolvedValueOnce({
        items: [{ id: 'b2', branchName: 'Westlands', branchCode: 'WST' }],
        page: { hasNext: false },
      });

    const index = await getBranchIndex();

    expect(index.get('b2')).toEqual({ name: 'Westlands', code: 'WST' });
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it('falls back to UTC when the organisation timezone is unreadable', async () => {
    apiGet.mockReset();
    apiGet.mockRejectedValueOnce(new BackendApiError(403));
    await expect(getOrganisationTimeZone()).resolves.toBe('UTC');
  });

  it('falls back to UTC when the backend returns a zone Intl cannot format', async () => {
    apiGet.mockReset();
    apiGet.mockResolvedValueOnce({ timezone: 'Mars/Olympus' });
    await expect(getOrganisationTimeZone()).resolves.toBe('UTC');
  });
});
