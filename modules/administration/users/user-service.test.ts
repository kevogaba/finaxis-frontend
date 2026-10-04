import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZodType } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { branchAssignmentPageSchema } from '@/modules/administration/branches/branch-contract';
import {
  membershipDetailSchema,
  membershipPageSchema,
  userPageSchema,
  userSummarySchema,
} from './user-contract';
import { userListApiPath, type UserListQuery } from './user-query';
import { SCAN_CEILING } from './user-rules';

const { apiGet, listAuditEvents, listRoleAssignments } = vi.hoisted(() => ({
  apiGet: vi.fn<(path: string, schema: ZodType) => Promise<unknown>>(),
  listAuditEvents: vi.fn(),
  listRoleAssignments: vi.fn(),
}));
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (path: string, schema: ZodType) => apiGet(path, schema),
}));
vi.mock('@/modules/administration/audit/audit-service', () => ({
  listAuditEvents: (...args: unknown[]) => listAuditEvents(...args) as unknown,
}));
vi.mock('@/modules/administration/roles/role-service', () => ({
  listRoleAssignments: (...args: unknown[]) => listRoleAssignments(...args) as unknown,
}));

const service = await import('./user-service');

const ANN = '10000000-0000-4000-8000-00000000000a';
const JOANN = '10000000-0000-4000-8000-00000000000b';
const OTHER = '10000000-0000-4000-8000-00000000000c';
const EMAIL = 'ann.mwangi@greenfield.example';
const BRANCH = '44444444-4444-4444-8444-444444444444';
const MEMBERSHIP_ID = '20000000-0000-4000-8000-000000000001';

const membershipWire = (userId: string, id = MEMBERSHIP_ID) => ({
  id,
  user_id: userId,
  membership_status: 'ACTIVE',
  membership_type: 'STAFF',
  primary_branch_id: BRANCH,
});

const assignmentWire = (id: string, userId: string) => ({
  id,
  user_id: userId,
  branch_id: BRANCH,
  assignment_type: 'HOME',
  status: 'ACTIVE',
});

/** One backend page, run through the schema the service handed `apiGet` (so a wire drift fails). */
const page = (items: readonly unknown[], hasNext: boolean) => (_path: string, schema: ZodType) =>
  Promise.resolve(
    schema.parse({
      items,
      page: {
        number: 0,
        size: 100,
        total_items: items.length,
        total_pages: 1,
        has_next: hasNext,
        has_previous: false,
      },
    }),
  );

describe('user service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('listUsers', () => {
    it('reads the directory path with the user page schema', async () => {
      apiGet.mockImplementationOnce(page([], false));
      const query: UserListQuery = {
        q: 'ann',
        userStatus: 'ACTIVE',
        membershipStatus: 'SUSPENDED',
        page: 1,
        size: 20,
      };
      await service.listUsers(query);
      expect(apiGet).toHaveBeenCalledWith(userListApiPath(query), userPageSchema);
      expect(apiGet.mock.lastCall?.[1]).toBe(userPageSchema);
    });
  });

  describe('getUser and getMembership', () => {
    it('read by a validated id, with their own schemas', async () => {
      apiGet.mockResolvedValue({});
      await service.getUser(ANN);
      expect(apiGet).toHaveBeenLastCalledWith(`/api/v1/tenant/users/${ANN}`, userSummarySchema);
      expect(apiGet.mock.lastCall?.[1]).toBe(userSummarySchema);
      await service.getMembership(MEMBERSHIP_ID);
      expect(apiGet).toHaveBeenLastCalledWith(
        `/api/v1/tenant/memberships/${MEMBERSHIP_ID}`,
        membershipDetailSchema,
      );
      expect(apiGet.mock.lastCall?.[1]).toBe(membershipDetailSchema);
    });

    it('reject a malformed id before any call', async () => {
      await expect(service.getUser('../x')).rejects.toThrow();
      await expect(service.getMembership('../x')).rejects.toThrow();
      expect(apiGet).not.toHaveBeenCalled();
    });
  });

  describe('findUserMembership', () => {
    it('matches the membership by user id, never the first hit', async () => {
      // q=ann.mwangi@… also matches joann.mwangi@… (a substring), and Joann comes first.
      apiGet.mockImplementationOnce(
        page(
          [membershipWire(JOANN, '20000000-0000-4000-8000-000000000002'), membershipWire(ANN)],
          false,
        ),
      );
      const found = await service.findUserMembership(ANN, EMAIL);
      expect(found?.userId).toBe(ANN);
      expect(found?.id).toBe(MEMBERSHIP_ID);
      expect(apiGet).toHaveBeenCalledWith(
        '/api/v1/tenant/memberships?q=ann.mwangi%40greenfield.example&page=0&size=100',
        membershipPageSchema,
      );
      expect(apiGet.mock.lastCall?.[1]).toBe(membershipPageSchema);
    });

    it('keeps scanning while pages have more, and stops at the page that holds the user', async () => {
      apiGet
        .mockImplementationOnce(page([membershipWire(JOANN)], true))
        .mockImplementationOnce(page([membershipWire(ANN)], true));
      expect((await service.findUserMembership(ANN, EMAIL))?.userId).toBe(ANN);
      expect(apiGet).toHaveBeenCalledTimes(2);
      expect(apiGet.mock.lastCall?.[0]).toContain('page=1&size=100');
    });

    it('scans at most five pages of 100, then gives up with null', async () => {
      apiGet.mockImplementation(page([membershipWire(JOANN)], true));
      expect(await service.findUserMembership(ANN, EMAIL)).toBeNull();
      expect(apiGet).toHaveBeenCalledTimes(5);
      expect(apiGet.mock.lastCall?.[0]).toContain('page=4&size=100');
    });

    it('stops at the last page, with null', async () => {
      apiGet.mockImplementationOnce(page([membershipWire(JOANN)], false));
      expect(await service.findUserMembership(ANN, EMAIL)).toBeNull();
      expect(apiGet).toHaveBeenCalledTimes(1);
    });

    it("matches an upper-case user id against the backend's lower-case one", async () => {
      apiGet.mockImplementationOnce(page([membershipWire(ANN)], false));
      expect((await service.findUserMembership(ANN.toUpperCase(), EMAIL))?.userId).toBe(ANN);
    });

    it('skips the read for a blank email', async () => {
      expect(await service.findUserMembership(ANN, '   ')).toBeNull();
      expect(apiGet).not.toHaveBeenCalled();
    });

    it('trims the email it searches for', async () => {
      apiGet.mockImplementationOnce(page([membershipWire(ANN)], false));
      await service.findUserMembership(ANN, `  ${EMAIL}  `);
      expect(apiGet.mock.lastCall?.[0]).toContain('q=ann.mwangi%40greenfield.example&');
    });

    it('rejects a malformed user id before any call', async () => {
      await expect(service.findUserMembership('../x', EMAIL)).rejects.toThrow();
      expect(apiGet).not.toHaveBeenCalled();
    });

    it('rejects when a page fails, so the caller can show the failure (never a quiet null)', async () => {
      apiGet.mockRejectedValueOnce(new Error('service unavailable'));
      await expect(service.findUserMembership(ANN, EMAIL)).rejects.toThrow('service unavailable');

      apiGet
        .mockImplementationOnce(page([membershipWire(JOANN)], true))
        .mockRejectedValueOnce(new Error('timed out'));
      await expect(service.findUserMembership(OTHER, EMAIL)).rejects.toThrow('timed out');
    });
  });

  describe('listUserBranchAssignments', () => {
    const A1 = '30000000-0000-4000-8000-000000000001';
    const A2 = '30000000-0000-4000-8000-000000000002';
    const A3 = '30000000-0000-4000-8000-000000000003';
    const PATH = '/api/v1/tenant/branch-assignments?status=ACTIVE&page=0&size=100';

    it("keeps only the user's rows across pages, never filtering by branch", async () => {
      apiGet
        .mockImplementationOnce(page([assignmentWire(A1, ANN), assignmentWire(A2, JOANN)], true))
        .mockImplementationOnce(page([assignmentWire(A3, ANN)], false));
      const scan = await service.listUserBranchAssignments(ANN);
      expect(scan.items.map((row) => row.id)).toEqual([A1, A3]);
      expect(scan.truncated).toBe(false);
      expect(apiGet).toHaveBeenNthCalledWith(1, PATH, branchAssignmentPageSchema);
      expect(apiGet.mock.calls.map(([path]) => path)).toEqual([
        PATH,
        '/api/v1/tenant/branch-assignments?status=ACTIVE&page=1&size=100',
      ]);
      for (const [path] of apiGet.mock.calls) expect(path).not.toContain('branch_id');
    });

    it('keeps a row repeated across pages once', async () => {
      apiGet
        .mockImplementationOnce(page([assignmentWire(A1, ANN)], true))
        .mockImplementationOnce(page([assignmentWire(A1, ANN), assignmentWire(A2, ANN)], false));
      const scan = await service.listUserBranchAssignments(ANN);
      expect(scan.items.map((row) => row.id)).toEqual([A1, A2]);
    });

    it('matches an upper-case user id', async () => {
      apiGet.mockImplementationOnce(page([assignmentWire(A1, ANN)], false));
      expect((await service.listUserBranchAssignments(ANN.toUpperCase())).items).toHaveLength(1);
    });

    it('marks the scan truncated when the fifth page still has more', async () => {
      apiGet.mockImplementation(page([assignmentWire(A1, JOANN)], true));
      const scan = await service.listUserBranchAssignments(ANN);
      expect(apiGet).toHaveBeenCalledTimes(5);
      expect(apiGet.mock.lastCall?.[0]).toContain('page=4&size=100');
      expect(scan).toEqual({ items: [], truncated: true });
    });

    it('reads SCAN_CEILING rows at most, as pages of 100 (A-m3)', async () => {
      apiGet.mockImplementation(page([assignmentWire(A1, JOANN)], true));
      await service.listUserBranchAssignments(ANN);
      expect(apiGet).toHaveBeenCalledTimes(SCAN_CEILING / 100);
    });

    it('is complete when a page ends the scan, even on the fifth', async () => {
      apiGet.mockImplementation(page([assignmentWire(A1, JOANN)], true));
      apiGet.mockImplementationOnce(page([], true));
      apiGet.mockImplementationOnce(page([], true));
      apiGet.mockImplementationOnce(page([], true));
      apiGet.mockImplementationOnce(page([], true));
      apiGet.mockImplementationOnce(page([assignmentWire(A2, ANN)], false));
      const scan = await service.listUserBranchAssignments(ANN);
      expect(apiGet).toHaveBeenCalledTimes(5);
      expect(scan.truncated).toBe(false);
      expect(scan.items.map((row) => row.id)).toEqual([A2]);
    });

    it('rejects a malformed user id before any call, and a failed page rejects', async () => {
      await expect(service.listUserBranchAssignments('../x')).rejects.toThrow();
      expect(apiGet).not.toHaveBeenCalled();
      apiGet.mockRejectedValueOnce(new Error('forbidden'));
      await expect(service.listUserBranchAssignments(ANN)).rejects.toThrow('forbidden');
    });
  });

  describe('getUserInviter', () => {
    it("reads the user.invite event's actor", async () => {
      listAuditEvents.mockResolvedValueOnce({ items: [{ actorUserId: OTHER }], page: {} });
      await expect(service.getUserInviter(ANN)).resolves.toBe(OTHER);
      expect(listAuditEvents).toHaveBeenCalledWith({
        entityType: 'USER',
        entityId: ANN,
        action: 'user.invite',
        page: 0,
        size: 1,
      });
    });

    it('is null when there is no event, or the event has no actor', async () => {
      listAuditEvents.mockResolvedValueOnce({ items: [], page: {} });
      await expect(service.getUserInviter(ANN)).resolves.toBeNull();
      listAuditEvents.mockResolvedValueOnce({ items: [{ actorUserId: null }], page: {} });
      await expect(service.getUserInviter(ANN)).resolves.toBeNull();
    });

    // Never a quiet null: a 401 or a stale-context failure must reach the caller's `load()`, which
    // redirects on it; the caller decides what any other failure means.
    it.each([
      ['a 401', new BackendApiError(401, { code: 'unauthorized' })],
      ['a stale context', new BackendApiError(403, { code: 'invalid_active_tenant_context' })],
      ['a 5xx', new BackendApiError(500, { requestId: 'req-1' })],
    ])("rejects with the audit read's own error on %s", async (_name, failure) => {
      listAuditEvents.mockRejectedValueOnce(failure);
      await expect(service.getUserInviter(ANN)).rejects.toBe(failure);
    });

    it('is null for a malformed id, without reading the audit log', async () => {
      await expect(service.getUserInviter('../x')).resolves.toBeNull();
      expect(listAuditEvents).not.toHaveBeenCalled();
    });
  });

  describe('countUserRoleAssignments', () => {
    it('counts ACTIVE assignments with one size-1 read', async () => {
      listRoleAssignments.mockResolvedValueOnce({ items: [], page: { totalItems: 3 } });
      await expect(service.countUserRoleAssignments(ANN)).resolves.toBe(3);
      expect(listRoleAssignments).toHaveBeenCalledWith(
        { userId: ANN, status: 'ACTIVE' },
        { page: 0, size: 1 },
      );
    });

    it('rejects when unreadable, so the page can say it failed (never a quiet null, 1a)', async () => {
      listRoleAssignments.mockRejectedValueOnce(new Error('forbidden'));
      await expect(service.countUserRoleAssignments(ANN)).rejects.toThrow('forbidden');
    });
  });
});
