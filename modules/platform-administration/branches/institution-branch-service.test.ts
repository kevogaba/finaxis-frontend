import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZodType } from 'zod';
import {
  branchDetailSchema,
  branchPageSchema,
} from '@/modules/administration/branches/branch-contract';
import { parseBranchListQuery } from '@/modules/administration/branches/branch-query';
import { institutionBranchListApiPath } from './institution-branch-query';

const { apiGet } = vi.hoisted(() => ({
  apiGet: vi.fn<(path: string, schema: ZodType) => Promise<unknown>>(),
}));
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (path: string, schema: ZodType) => apiGet(path, schema),
}));

const service = await import('./institution-branch-service');

// Lettered, so each id's upper case differs from it.
const TENANT = '17000000-0000-4000-8000-0000000000ab';
const BRANCH = '17000000-0000-4000-8000-0000000000b7';
const QUERY = parseBranchListQuery(new URLSearchParams('q=thika&status=ACTIVE&page=2'));

/** One page of the index read: `count` branches, ids numbered from `first`. */
function indexPage(first: number, count: number, hasNext: boolean) {
  return {
    items: Array.from({ length: count }, (_, offset) => ({
      id: `17000000-0000-4000-8000-${String(first + offset).padStart(12, '0')}`,
      branchName: `Branch ${first + offset}`,
      branchCode: `B${first + offset}`,
    })),
    page: { hasNext },
  };
}

describe('institution branch service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists an institution's branches by a validated, lower-cased id", async () => {
    apiGet.mockResolvedValueOnce({ items: [], page: {} });
    await service.listInstitutionBranches(TENANT.toUpperCase(), QUERY);
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith(
      institutionBranchListApiPath(TENANT, QUERY),
      branchPageSchema,
    );
    expect(apiGet.mock.calls[0]?.[0]).toContain(`/api/v1/platform/tenants/${TENANT}/branches?`);
    expect(apiGet.mock.calls[0]?.[1]).toBe(branchPageSchema);
  });

  it("reads one branch by both ids, with 08's detail schema", async () => {
    apiGet.mockResolvedValueOnce({});
    await service.getInstitutionBranch(TENANT.toUpperCase(), BRANCH.toUpperCase());
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet.mock.calls[0]?.[0]).toBe(`/api/v1/platform/tenants/${TENANT}/branches/${BRANCH}`);
    expect(apiGet.mock.calls[0]?.[1]).toBe(branchDetailSchema);
  });

  it('rejects a malformed id before any call', async () => {
    await expect(service.listInstitutionBranches('../x', QUERY)).rejects.toThrow();
    await expect(service.getInstitutionBranch(TENANT, 'not-a-uuid')).rejects.toThrow();
    await expect(service.getInstitutionBranch('../x', BRANCH)).rejects.toThrow();
    await expect(service.getInstitutionBranchIndex('x')).rejects.toThrow();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('indexes up to five pages of 100 by name, and says when it stopped early', async () => {
    for (let page = 0; page < 5; page += 1) {
      apiGet.mockResolvedValueOnce(indexPage(page * 100 + 1, 2, true));
    }
    const capped = await service.getInstitutionBranchIndex(TENANT);

    expect(apiGet).toHaveBeenCalledTimes(5);
    expect(apiGet.mock.calls.map(([path]) => path)).toEqual(
      [0, 1, 2, 3, 4].map(
        (page) =>
          `/api/v1/platform/tenants/${TENANT}/branches?page=${page}&size=100&sort_by=branchName&sort_dir=ASC`,
      ),
    );
    expect(apiGet.mock.calls.every(([, schema]) => schema === branchPageSchema)).toBe(true);
    expect(capped.truncated).toBe(true);
    expect(capped.names.size).toBe(10);

    vi.clearAllMocks();
    apiGet.mockResolvedValueOnce(indexPage(1, 2, true));
    apiGet.mockResolvedValueOnce(indexPage(101, 1, false));
    const whole = await service.getInstitutionBranchIndex(TENANT);

    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(whole.truncated).toBe(false);
    expect([...whole.names]).toEqual([
      ['17000000-0000-4000-8000-000000000001', { name: 'Branch 1', code: 'B1' }],
      ['17000000-0000-4000-8000-000000000002', { name: 'Branch 2', code: 'B2' }],
      ['17000000-0000-4000-8000-000000000101', { name: 'Branch 101', code: 'B101' }],
    ]);
  });

  it('rejects when any index page fails (never a partial or empty index)', async () => {
    apiGet.mockResolvedValueOnce(indexPage(1, 2, true));
    apiGet.mockRejectedValueOnce(new Error('service unavailable'));
    await expect(service.getInstitutionBranchIndex(TENANT)).rejects.toThrow('service unavailable');
    expect(apiGet).toHaveBeenCalledTimes(2);
  });
});
