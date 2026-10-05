import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendApiError } from '@/auth/backend-api';
import {
  accountBlockedNote,
  USER_MAKER_CHECKER_BLOCKED,
} from '@/modules/administration/users/user-rules';
import {
  APPROVAL_CHANGED,
  APPROVE_FAILED,
  APPROVE_FORBIDDEN,
  REJECT_FAILED,
} from './approval-copy';

const {
  apiPost,
  getAuthenticatedUser,
  getCurrentContextProfile,
  getMakerEvent,
  getMembership,
  getUser,
  refresh,
} = vi.hoisted(() => ({
  apiPost: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
    Promise.resolve<unknown>({}),
  ),
  getAuthenticatedUser: vi.fn(),
  getCurrentContextProfile: vi.fn(),
  getMakerEvent: vi.fn(),
  getMembership: vi.fn(),
  getUser: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@/config/env.server', () => ({ serverEnv: {} }));
vi.mock('@/lib/api/tenant-api', () => ({
  apiPost: (path: string, body: Record<string, unknown>, key: string) => apiPost(path, body, key),
}));
// The real runServerAction runs here (the guards are the point), so its own reads are mocked.
vi.mock('next/cache', () => ({ refresh: () => refresh() as unknown }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  unstable_rethrow: vi.fn(),
}));
vi.mock('@/auth/get-authenticated-user', () => ({
  getAuthenticatedUser: () => getAuthenticatedUser() as unknown,
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  getMembership: (id: string) => getMembership(id) as unknown,
  getUser: (id: string) => getUser(id) as unknown,
}));
vi.mock('./approval-service', () => ({
  getMakerEvent: (kind: string, id: string) => getMakerEvent(kind, id) as unknown,
}));

const actions = await import('./approval-actions');

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const ME = 'a1000000-0000-4000-8000-0000000000aa';
const VICTOR = 'b2000000-0000-4000-8000-0000000000bb';
const USER = 'c3000000-0000-4000-8000-0000000000cc';
const MEMBERSHIP = 'd4000000-0000-4000-8000-0000000000dd';
const ORGANISATION = 'f6000000-0000-4000-8000-0000000000ff';
const OTHER_ORGANISATION = '17000000-0000-4000-8000-000000000011';
const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const ALL_CODES = [
  'user.approve',
  'user.view',
  'membership.view',
  'membership.revoke',
  'audit.view',
];

function resolved(permissions: string[] = ALL_CODES) {
  return {
    kind: 'resolved',
    profile: { user_id: ME, permissions },
    context: {
      organization: { id: ORGANISATION, name: 'Greenfield Teachers SACCO' },
      branch: null,
    },
  };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(fields).forEach(([name, value]) => {
    data.set(name, value);
  });
  return data;
}

// The URL id may be upper-case; every write uses the backend's lower-case id.
const membershipForm = (extra: Record<string, string> = {}) =>
  form({
    idempotencyKey: KEY,
    membershipId: MEMBERSHIP.toUpperCase(),
    contextOrganisationId: ORGANISATION,
    ...extra,
  });

function pending(membershipStatus = 'PENDING_APPROVAL', userStatus = 'ACTIVE') {
  getMembership.mockResolvedValue({ id: MEMBERSHIP, userId: USER, status: membershipStatus });
  getUser.mockResolvedValue({ id: USER, userStatus, membershipStatus });
}

describe('the user decisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ id: 'session-user' });
    getCurrentContextProfile.mockResolvedValue(resolved());
    getMakerEvent.mockResolvedValue({ actorUserId: VICTOR, occurredAt: '2026-09-24T08:00:00Z' });
    pending();
  });

  describe('approveUser', () => {
    it('approves the membership the backend names, by its lower-cased id, with {} and the form key', async () => {
      await actions.approveUser(null, membershipForm());
      expect(getMembership).toHaveBeenCalledExactlyOnceWith(MEMBERSHIP);
      expect(getUser).toHaveBeenCalledExactlyOnceWith(USER);
      expect(getMakerEvent).toHaveBeenCalledExactlyOnceWith('user', USER);
      expect(apiPost).toHaveBeenCalledExactlyOnceWith(
        `/api/v1/tenant/memberships/${MEMBERSHIP}/activate`,
        {},
        KEY,
      );
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['a 200 (ACTIVE)', { membership_status: 'ACTIVE', user_status: 'ACTIVE' }, 'active'],
      [
        'a 202 (identity provisioning)',
        { membership_status: 'PENDING_APPROVAL', user_status: 'PROVISIONING_IDP' },
        'provisioning',
      ],
      ['an unreadable echo', { status: 'ok' }, 'recorded'],
      ['no echo', undefined, 'recorded'],
    ])('reads which way it went from %s', async (_case, echo, outcome) => {
      apiPost.mockResolvedValueOnce(echo);
      await expect(actions.approveUser(null, membershipForm())).resolves.toEqual({
        ok: true,
        outcome,
      });
    });

    it.each([
      [
        'a blocked account',
        'PENDING_APPROVAL',
        'SUSPENDED',
        'account_blocked',
        // The same words as the disabled caption: one name for the account's state.
        accountBlockedNote('SUSPENDED'),
      ],
      [
        'an approval provisioning',
        'PENDING_APPROVAL',
        'PROVISIONING_IDP',
        'approval_changed',
        APPROVAL_CHANGED,
      ],
      ['an approved membership', 'ACTIVE', 'ACTIVE', 'approval_changed', APPROVAL_CHANGED],
      ['a revoked membership', 'REVOKED', 'ACTIVE', 'approval_changed', APPROVAL_CHANGED],
    ])('refuses %s before any write', async (_case, membership, user, code, formError) => {
      pending(membership, user);
      await expect(actions.approveUser(null, membershipForm())).resolves.toMatchObject({
        ok: false,
        code,
        formError,
      });
      expect(apiPost).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('refuses the inviter, matched case-insensitively, before any write', async () => {
      getMakerEvent.mockResolvedValue({
        actorUserId: ME.toUpperCase(),
        occurredAt: '2026-09-24T08:00:00Z',
      });
      await expect(actions.approveUser(null, membershipForm())).resolves.toMatchObject({
        ok: false,
        code: 'maker_checker',
        formError: USER_MAKER_CHECKER_BLOCKED,
      });
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('leaves maker-checker to the backend without audit.view (no maker read)', async () => {
      getCurrentContextProfile.mockResolvedValue(
        resolved(ALL_CODES.filter((code) => code !== 'audit.view')),
      );
      await actions.approveUser(null, membershipForm());
      expect(getMakerEvent).not.toHaveBeenCalled();
      expect(apiPost).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['a 403', new BackendApiError(403, { code: 'forbidden' })],
      ['a 5xx', new BackendApiError(503, { requestId: 'req-maker' })],
    ])(
      'leaves maker-checker to the backend when the maker read fails with %s',
      async (_case, error) => {
        getMakerEvent.mockRejectedValue(error);
        apiPost.mockRejectedValueOnce(
          new BackendApiError(403, { code: 'forbidden', requestId: 'req-2' }),
        );
        await expect(actions.approveUser(null, membershipForm())).resolves.toMatchObject({
          ok: false,
          code: 'forbidden',
          formError: APPROVE_FORBIDDEN,
          requestId: 'req-2',
        });
        expect(apiPost).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      ['a lost session', new BackendApiError(401), 'NEXT_REDIRECT:/login?reason=session_expired'],
      [
        'a stale context',
        new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
        'NEXT_REDIRECT:/select-context',
      ],
    ])('redirects when the maker read finds %s, before any write', async (_case, error, to) => {
      getMakerEvent.mockRejectedValue(error);
      await expect(actions.approveUser(null, membershipForm())).rejects.toThrow(to);
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('fails closed when nobody can say who is deciding (no resolved profile)', async () => {
      getCurrentContextProfile.mockResolvedValue({
        kind: 'redirect-to-context-selection',
        reason: 'invalid-context',
      });
      // No cross-tab field, so the action's own check is the one that runs.
      const submitted = form({ idempotencyKey: KEY, membershipId: MEMBERSHIP });
      await expect(actions.approveUser(null, submitted)).rejects.toThrow(
        'NEXT_REDIRECT:/select-context',
      );
      expect(getMembership).not.toHaveBeenCalled();
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('explains a 500 with the likely causes, keeping the reference', async () => {
      apiPost.mockRejectedValueOnce(
        new BackendApiError(500, { code: 'internal_error', requestId: 'req-3' }),
      );
      await expect(actions.approveUser(null, membershipForm())).resolves.toMatchObject({
        ok: false,
        formError: APPROVE_FAILED,
        requestId: 'req-3',
      });
    });

    it('refuses a submit after an organisation switch, before any read', async () => {
      getCurrentContextProfile.mockResolvedValue({
        ...resolved(),
        context: { organization: { id: OTHER_ORGANISATION }, branch: null },
      });
      await expect(actions.approveUser(null, membershipForm())).resolves.toMatchObject({
        ok: false,
        code: 'context_changed',
      });
      expect(getMembership).not.toHaveBeenCalled();
      expect(apiPost).not.toHaveBeenCalled();
    });

    it.each(['../x', '', `${MEMBERSHIP}/../revoke`])(
      'refuses the membership id %j with no read',
      async (membershipId) => {
        const result = await actions.approveUser(null, membershipForm({ membershipId }));
        expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
        expect(getMembership).not.toHaveBeenCalled();
      },
    );
  });

  describe('rejectUser', () => {
    it('fails closed when nobody can say who is deciding (no resolved profile)', async () => {
      getCurrentContextProfile.mockResolvedValue({
        kind: 'redirect-to-context-selection',
        reason: 'invalid-context',
      });
      const submitted = form({
        idempotencyKey: KEY,
        membershipId: MEMBERSHIP,
        reason: 'Duplicate invitation',
      });
      await expect(actions.rejectUser(null, submitted)).rejects.toThrow(
        'NEXT_REDIRECT:/select-context',
      );
      expect(getMembership).not.toHaveBeenCalled();
      expect(apiPost).not.toHaveBeenCalled();
    });

    it.each([
      ['awaiting', 'ACTIVE'],
      ['blocked', 'LOCKED'],
    ])(
      'revokes a membership %s with the trimmed reason and the form key',
      async (_case, userStatus) => {
        pending('PENDING_APPROVAL', userStatus);
        await expect(
          actions.rejectUser(null, membershipForm({ reason: '  Duplicate invitation  ' })),
        ).resolves.toEqual({ ok: true });
        expect(apiPost).toHaveBeenCalledExactlyOnceWith(
          `/api/v1/tenant/memberships/${MEMBERSHIP}/revoke`,
          { reason: 'Duplicate invitation' },
          KEY,
        );
      },
    );

    it.each([
      ['provisioning', 'PENDING_APPROVAL', 'PROVISIONING_IDP'],
      ['approved meanwhile', 'ACTIVE', 'ACTIVE'],
    ])(
      'never revokes a membership %s (refused before any write)',
      async (_case, membership, user) => {
        pending(membership, user);
        await expect(
          actions.rejectUser(null, membershipForm({ reason: 'Duplicate invitation' })),
        ).resolves.toMatchObject({
          ok: false,
          code: 'approval_changed',
          formError: APPROVAL_CHANGED,
        });
        expect(apiPost).not.toHaveBeenCalled();
      },
    );

    it('lets a revoked membership through, so a same-key retry replays its success', async () => {
      pending('REVOKED', 'ACTIVE');
      await expect(
        actions.rejectUser(null, membershipForm({ reason: 'Duplicate invitation' })),
      ).resolves.toEqual({ ok: true });
      expect(apiPost).toHaveBeenCalledExactlyOnceWith(
        `/api/v1/tenant/memberships/${MEMBERSHIP}/revoke`,
        { reason: 'Duplicate invitation' },
        KEY,
      );
    });

    it('refuses a reason under 3 characters after trimming, before any read', async () => {
      const result = await actions.rejectUser(null, membershipForm({ reason: '  ab ' }));
      expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
      expect(result.ok ? null : result.fieldErrors.reason).toBe(
        'Give a reason of at least 3 characters.',
      );
      expect(getMembership).not.toHaveBeenCalled();
    });

    it('explains a 500 as possibly already revoked, keeping the reference', async () => {
      apiPost.mockRejectedValueOnce(
        new BackendApiError(500, { code: 'internal_error', requestId: 'req-4' }),
      );
      await expect(
        actions.rejectUser(null, membershipForm({ reason: 'Duplicate invitation' })),
      ).resolves.toMatchObject({ ok: false, formError: REJECT_FAILED, requestId: 'req-4' });
    });
  });
});
