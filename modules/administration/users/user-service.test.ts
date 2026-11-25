import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZodType } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { branchAssignmentPageSchema } from '@/modules/administration/branches/branch-contract';
import { membershipDetailSchema, userPageSchema, userSummarySchema } from './user-contract';
import { userListApiPath, type UserListQuery } from './user-query';

const { apiGet, listRoleAssignments } = vi.hoisted(() => ({
  apiGet: vi.fn<(path: string, schema: ZodType) => Promise<unknown>>(),
  listRoleAssignments: vi.fn(),
}));
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (path: string, schema: ZodType) => apiGet(path, schema),
}));
vi.mock('@/modules/administration/roles/role-service', () => ({
  listRoleAssignments: (...args: unknown[]) => listRoleAssignments(...args) as unknown,
}));

const service = await import('./user-service');

const ANN = '10000000-0000-4000-8000-00000000000a';
const BRANCH = '44444444-4444-4444-8444-444444444444';
const MEMBERSHIP_ID = '20000000-0000-4000-8000-000000000001';

const assignmentWire = (id: string, userId: string) => ({
  id,
  user_id: userId,
  branch_id: BRANCH,
  assignment_type: 'HOME',
  status: 'ACTIVE',
  username: 'ann.mwangi',
  display_name: 'Ann Mwangi',
  branch_name: 'Westlands Branch',
  assigned_at: '2026-11-02T07:30:00Z',
});

/** One backend page, run through the schema the service handed `apiGet` (so a wire drift fails). */
const page =
  (items: readonly unknown[], hasNext: boolean, totalItems = items.length) =>
  (_path: string, schema: ZodType) =>
    Promise.resolve(
      schema.parse({
        items,
        page: {
          number: 0,
          size: 100,
          total_items: totalItems,
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

  // BG-28: list rows can't tell a re-invited member from one approved and being provisioned.
  describe('readRowInvitations', () => {
    const holder = (permissions: string[]) => ({ permissions, tenantPermissions: permissions });
    const row = (n: number, userStatus: string, membershipStatus = 'PENDING_APPROVAL') =>
      userSummarySchema.parse({
        id: `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
        username: `user.${n}`,
        email: `user.${n}@greenfield.example`,
        display_name: `User ${n}`,
        user_status: userStatus,
        membership_status: membershipStatus,
        membership_id: `31000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
        membership_type: 'STAFF',
        created_at: '2026-11-01T08:00:00Z',
        membership_created_at: '2026-11-01T08:00:00Z',
        created_by: null,
      });
    const membershipWith = (status: string | null) => ({
      invitation:
        status === null ? null : { status, attempts: 0, lastErrorCode: null, updatedAt: null },
    });

    it('reads only the rows awaiting an identity, in parallel, keyed by user', async () => {
      const reinvited = row(1, 'PROVISIONING_IDP');
      const approved = row(2, 'PROVISIONING_IDP');
      const users = [reinvited, row(3, 'DRAFT'), approved, row(4, 'PROVISIONING_IDP', 'ACTIVE')];
      let pending = 0;
      let overlapped = false;
      apiGet.mockImplementation(async (path) => {
        pending += 1;
        if (pending > 1) overlapped = true;
        await Promise.resolve();
        pending -= 1;
        return membershipWith(path.endsWith('01') ? 'AWAITING_APPROVAL' : 'IN_PROGRESS');
      });

      await expect(service.readRowInvitations(users, holder(['membership.view']))).resolves.toEqual(
        { [reinvited.id]: 'AWAITING_APPROVAL', [approved.id]: 'IN_PROGRESS' },
      );
      expect(apiGet.mock.calls.map(([path]) => path)).toEqual([
        `/api/v1/tenant/memberships/${reinvited.membershipId}`,
        `/api/v1/tenant/memberships/${approved.membershipId}`,
      ]);
      expect(overlapped).toBe(true);
    });

    it('reads nothing without membership.view tenant-wide', async () => {
      const users = [row(5, 'PROVISIONING_IDP')];
      await expect(service.readRowInvitations(users, holder(['user.view']))).resolves.toEqual({});
      await expect(
        service.readRowInvitations(users, {
          permissions: ['membership.view'],
          tenantPermissions: [],
          branchPermissions: { 'membership.view': [BRANCH] },
        }),
      ).resolves.toEqual({});
      expect(apiGet).not.toHaveBeenCalled();
    });

    it('leaves out a read that fails or carries no invitation, so the row keeps its label', async () => {
      const failed = row(6, 'PROVISIONING_IDP');
      const unknown = row(7, 'PROVISIONING_IDP');
      const reinvited = row(8, 'PROVISIONING_IDP');
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      apiGet
        .mockRejectedValueOnce(new Error('upstream'))
        .mockResolvedValueOnce(membershipWith(null))
        .mockResolvedValueOnce(membershipWith('AWAITING_APPROVAL'));

      await expect(
        service.readRowInvitations([failed, unknown, reinvited], holder(['membership.view'])),
      ).resolves.toEqual({ [reinvited.id]: 'AWAITING_APPROVAL' });
      log.mockRestore();
    });

    it('logs one line per call counting the failed reads, by status, never their text', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      apiGet
        .mockRejectedValueOnce(new BackendApiError(429, { code: 'rate_limited' }))
        .mockResolvedValueOnce(membershipWith('IN_PROGRESS'))
        .mockRejectedValueOnce(new Error('socket hang up: user.3@greenfield.example'));
      const rows = [1, 2, 3].map((n) => row(n, 'PROVISIONING_IDP'));

      await service.readRowInvitations(rows, holder(['membership.view']));

      expect(log).toHaveBeenCalledExactlyOnceWith(
        'Invitation lookups failed for 2 of 3 rows (statuses: 429, none); those rows keep their status-only label.',
      );
      log.mockClear();
      apiGet.mockResolvedValue(membershipWith('IN_PROGRESS'));
      await service.readRowInvitations(rows, holder(['membership.view']));
      expect(log).not.toHaveBeenCalled();
      log.mockRestore();
    });

    it('looks up at most ten rows of a page; the rest keep their status-only label', async () => {
      expect(service.ROW_INVITATION_LOOKUPS).toBe(10);
      const rows = Array.from({ length: 12 }, (_, i) => row(i + 1, 'PROVISIONING_IDP'));
      apiGet.mockResolvedValue(membershipWith('AWAITING_APPROVAL'));

      const invitations = await service.readRowInvitations(rows, holder(['membership.view']));

      expect(apiGet).toHaveBeenCalledTimes(10);
      expect(Object.keys(invitations)).toEqual(rows.slice(0, 10).map((user) => user.id));
      expect(apiGet.mock.calls.map(([path]) => path)).not.toContain(
        `/api/v1/tenant/memberships/${rows[10]?.membershipId ?? ''}`,
      );
    });
  });

  describe('listUserBranchAssignments', () => {
    const A1 = '30000000-0000-4000-8000-000000000001';

    // BG-09: one page the platform sorts and pages, by user (BG-03: never a branch, so the selected
    // one doesn't narrow it), with each branch's name embedded.
    it("reads one page of the user's ACTIVE assignments, newest assigned first", async () => {
      apiGet.mockImplementationOnce(page([assignmentWire(A1, ANN)], true, 12));
      const result = await service.listUserBranchAssignments(ANN, { page: 1, size: 10 });
      expect(apiGet).toHaveBeenCalledTimes(1);
      expect(apiGet).toHaveBeenCalledWith(
        `/api/v1/tenant/branch-assignments?user_id=${ANN}&status=ACTIVE&sort_by=assignedAt&sort_dir=DESC&page=1&size=10`,
        branchAssignmentPageSchema,
      );
      expect(apiGet.mock.lastCall?.[1]).toBe(branchAssignmentPageSchema);
      expect(apiGet.mock.lastCall?.[0]).not.toContain('branch_id');
      expect(result.items).toEqual([
        {
          id: A1,
          userId: ANN,
          branchId: BRANCH,
          assignmentType: 'HOME',
          status: 'ACTIVE',
          branchName: 'Westlands Branch',
          assignedAt: '2026-11-02T07:30:00Z',
        },
      ]);
      expect(result.page).toMatchObject({ totalItems: 12, hasNext: true });
    });

    it('rejects a malformed user id before any call, and a failed read rejects', async () => {
      await expect(
        service.listUserBranchAssignments('../x', { page: 0, size: 10 }),
      ).rejects.toThrow();
      expect(apiGet).not.toHaveBeenCalled();
      apiGet.mockRejectedValueOnce(new Error('forbidden'));
      await expect(service.listUserBranchAssignments(ANN, { page: 0, size: 10 })).rejects.toThrow(
        'forbidden',
      );
    });
  });

  describe('countUserBranchAssignments', () => {
    it('counts ACTIVE assignments with one size-1 read', async () => {
      apiGet.mockImplementationOnce(page([], true, 7));
      await expect(service.countUserBranchAssignments(ANN)).resolves.toBe(7);
      expect(apiGet).toHaveBeenCalledTimes(1);
      expect(apiGet.mock.lastCall?.[0]).toBe(
        `/api/v1/tenant/branch-assignments?user_id=${ANN}&status=ACTIVE&sort_by=assignedAt&sort_dir=DESC&page=0&size=1`,
      );
    });

    it('rejects when unreadable, so the page can say it failed (never a quiet null, 1a)', async () => {
      apiGet.mockRejectedValueOnce(new Error('forbidden'));
      await expect(service.countUserBranchAssignments(ANN)).rejects.toThrow('forbidden');
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
