import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import { ACTIVATE_FORBIDDEN, BRANCH_CHANGED, BRANCH_CONTEXT_REFUSAL } from './approval-copy';

const { apiPost, getAuthenticatedUser, getBranch, getCurrentContextProfile, getMakerEvent } =
  vi.hoisted(() => ({
    apiPost: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
      Promise.resolve<unknown>({}),
    ),
    getAuthenticatedUser: vi.fn(),
    getBranch: vi.fn(),
    getCurrentContextProfile: vi.fn(),
    getMakerEvent: vi.fn(),
  }));
vi.mock('@/config/env.server', () => ({ serverEnv: {} }));
vi.mock('@/lib/api/tenant-api', () => ({
  apiPost: (path: string, body: Record<string, unknown>, key: string) => apiPost(path, body, key),
}));
// The real runServerAction runs here (the guards are the point), so its own reads are mocked.
vi.mock('next/cache', () => ({ refresh: vi.fn() }));
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
vi.mock('@/modules/administration/branches/branch-service', () => ({
  getBranch: (id: string) => getBranch(id) as unknown,
}));
vi.mock('./approval-service', () => ({
  getMakerEvent: (kind: string, id: string) => getMakerEvent(kind, id) as unknown,
}));

const { activatePendingBranch } = await import('./branch-activation-actions');

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const ME = 'a1000000-0000-4000-8000-0000000000aa';
const VICTOR = 'b2000000-0000-4000-8000-0000000000bb';
const BRANCH = 'e5000000-0000-4000-8000-0000000000ee';
const ORGANISATION = 'f6000000-0000-4000-8000-0000000000ff';
const OTHER_ORGANISATION = '17000000-0000-4000-8000-000000000011';
const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

function resolved(
  branch: { id: string; name: string } | null = null,
  permissions: string[] = ['branch.activate', 'branch.view', 'audit.view'],
) {
  return {
    kind: 'resolved',
    profile: { user_id: ME, permissions },
    context: { organization: { id: ORGANISATION, name: 'Greenfield Teachers SACCO' }, branch },
  };
}

function branchForm(extra: Record<string, string> = {}): FormData {
  const data = new FormData();
  // The URL id may be upper-case; the write uses the backend's lower-case id.
  const fields = {
    idempotencyKey: KEY,
    branchId: BRANCH.toUpperCase(),
    contextOrganisationId: ORGANISATION,
    ...extra,
  };
  Object.entries(fields).forEach(([name, value]) => {
    data.set(name, value);
  });
  return data;
}

describe('activatePendingBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ id: 'session-user' });
    getCurrentContextProfile.mockResolvedValue(resolved());
    getMakerEvent.mockResolvedValue({ actorUserId: VICTOR, occurredAt: '2026-09-10T08:00:00Z' });
    getBranch.mockResolvedValue({ id: BRANCH, status: 'PENDING_APPROVAL' });
  });

  it.each([
    ['a blank reason', '   ', {}],
    ['a reason', '  Licence received ', { reason: 'Licence received' }],
  ])('activates by the backend’s lower-cased id with %s', async (_case, reason, body) => {
    await expect(activatePendingBranch(null, branchForm({ reason }))).resolves.toEqual({
      ok: true,
    });
    expect(getBranch).toHaveBeenCalledExactlyOnceWith(BRANCH);
    expect(getMakerEvent).toHaveBeenCalledExactlyOnceWith('branch', BRANCH);
    expect(apiPost).toHaveBeenCalledExactlyOnceWith(
      `/api/v1/branches/${BRANCH}/activate`,
      body,
      KEY,
    );
  });

  it('refuses in a branch context before any read (BG-03)', async () => {
    getCurrentContextProfile.mockResolvedValue(resolved({ id: BRANCH, name: 'Westlands' }));
    await expect(activatePendingBranch(null, branchForm())).resolves.toMatchObject({
      ok: false,
      code: 'branch_context',
      formError: BRANCH_CONTEXT_REFUSAL,
    });
    expect(getBranch).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it.each(['ACTIVE', 'DRAFT', 'SUSPENDED'])(
    'refuses a %s branch before any write',
    async (status) => {
      getBranch.mockResolvedValue({ id: BRANCH, status });
      await expect(activatePendingBranch(null, branchForm())).resolves.toMatchObject({
        ok: false,
        code: 'approval_changed',
        formError: BRANCH_CHANGED,
      });
      expect(apiPost).not.toHaveBeenCalled();
    },
  );

  it('refuses its drafter, matched case-insensitively, before any write', async () => {
    getMakerEvent.mockResolvedValue({
      actorUserId: ME.toUpperCase(),
      occurredAt: '2026-09-10T08:00:00Z',
    });
    await expect(activatePendingBranch(null, branchForm())).resolves.toMatchObject({
      ok: false,
      code: 'maker_checker',
      formError: MAKER_CHECKER_BLOCKED,
    });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('explains the backend’s 403 without asserting which guard it was', async () => {
    apiPost.mockRejectedValueOnce(
      new BackendApiError(403, { code: 'forbidden', requestId: 'req-5' }),
    );
    await expect(activatePendingBranch(null, branchForm())).resolves.toMatchObject({
      ok: false,
      formError: ACTIVATE_FORBIDDEN,
      requestId: 'req-5',
    });
  });

  it('refuses a reason over 500 characters before any read', async () => {
    const result = await activatePendingBranch(null, branchForm({ reason: 'x'.repeat(501) }));
    expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(getBranch).not.toHaveBeenCalled();
  });

  // Beyond the plan's rows: the layer's Review Focus 1 and the 4a review's lessons (the guard
  // reads' own failures, the maker compare in both orders, the cross-tab and id guards).

  it('sends a reason of exactly 500 characters', async () => {
    const reason = 'x'.repeat(500);
    await activatePendingBranch(null, branchForm({ reason }));
    expect(apiPost).toHaveBeenCalledExactlyOnceWith(
      `/api/v1/branches/${BRANCH}/activate`,
      { reason },
      KEY,
    );
  });

  it('refuses its drafter when the signed-in id is the upper-case one, before any write', async () => {
    getCurrentContextProfile.mockResolvedValue({
      ...resolved(),
      profile: { user_id: ME.toUpperCase(), permissions: ['branch.activate', 'audit.view'] },
    });
    getMakerEvent.mockResolvedValue({ actorUserId: ME, occurredAt: '2026-09-10T08:00:00Z' });
    await expect(activatePendingBranch(null, branchForm())).resolves.toMatchObject({
      ok: false,
      code: 'maker_checker',
      formError: MAKER_CHECKER_BLOCKED,
    });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('leaves maker-checker to the backend without audit.view (no maker read)', async () => {
    getCurrentContextProfile.mockResolvedValue(resolved(null, ['branch.activate', 'branch.view']));
    await activatePendingBranch(null, branchForm());
    expect(getMakerEvent).not.toHaveBeenCalled();
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it('leaves maker-checker to the backend when the audit log records no drafter', async () => {
    getMakerEvent.mockResolvedValue(null);
    await expect(activatePendingBranch(null, branchForm())).resolves.toEqual({ ok: true });
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a 403', new BackendApiError(403, { code: 'forbidden' })],
    ['a 5xx', new BackendApiError(503, { requestId: 'req-maker' })],
  ])('leaves maker-checker to the backend when the maker read fails with %s', async (_c, error) => {
    getMakerEvent.mockRejectedValue(error);
    apiPost.mockRejectedValueOnce(
      new BackendApiError(403, { code: 'forbidden', requestId: 'req-2' }),
    );
    await expect(activatePendingBranch(null, branchForm())).resolves.toMatchObject({
      ok: false,
      code: 'forbidden',
      formError: ACTIVATE_FORBIDDEN,
      requestId: 'req-2',
    });
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a lost session', new BackendApiError(401), 'NEXT_REDIRECT:/login?reason=session_expired'],
    [
      'a stale context',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      'NEXT_REDIRECT:/select-context',
    ],
  ])('redirects when the maker read finds %s, before any write', async (_case, error, to) => {
    getMakerEvent.mockRejectedValue(error);
    await expect(activatePendingBranch(null, branchForm())).rejects.toThrow(to);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('fails the action with a reference, before any write, when the audit page is unreadable', async () => {
    // Ruling 5's one asymmetry: only a BackendApiError leaves the maker unknown; the action never
    // guesses past a response it can't read.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unreadable = z.object({ items: z.array(z.unknown()) }).safeParse({}).error;
    getMakerEvent.mockRejectedValue(unreadable);
    await expect(activatePendingBranch(null, branchForm())).resolves.toMatchObject({
      ok: false,
      code: 'contract_mismatch',
      requestId: expect.any(String),
    });
    expect(apiPost).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  it('redirects a lost session reading the branch, before any write', async () => {
    getBranch.mockRejectedValue(new BackendApiError(401));
    await expect(activatePendingBranch(null, branchForm())).rejects.toThrow(
      'NEXT_REDIRECT:/login?reason=session_expired',
    );
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('fails closed with the reference when the branch read fails', async () => {
    getBranch.mockRejectedValue(new BackendApiError(503, { requestId: 'req-read' }));
    await expect(activatePendingBranch(null, branchForm())).resolves.toMatchObject({
      ok: false,
      requestId: 'req-read',
    });
    expect(getMakerEvent).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('fails closed when nobody can say who is deciding (no resolved profile)', async () => {
    getCurrentContextProfile.mockResolvedValue({
      kind: 'redirect-to-context-selection',
      reason: 'invalid-context',
    });
    // No cross-tab field, so the action's own check is the one that runs.
    const submitted = new FormData();
    submitted.set('idempotencyKey', KEY);
    submitted.set('branchId', BRANCH);
    await expect(activatePendingBranch(null, submitted)).rejects.toThrow(
      'NEXT_REDIRECT:/select-context',
    );
    expect(getBranch).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('refuses a submit after an organisation switch, before any read', async () => {
    getCurrentContextProfile.mockResolvedValue({
      ...resolved(),
      context: { organization: { id: OTHER_ORGANISATION }, branch: null },
    });
    await expect(activatePendingBranch(null, branchForm())).resolves.toMatchObject({
      ok: false,
      code: 'context_changed',
    });
    expect(getBranch).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it.each(['../x', '', `${BRANCH}/../revoke`])(
    'refuses the branch id %j with no read',
    async (branchId) => {
      const result = await activatePendingBranch(null, branchForm({ branchId }));
      expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
      expect(getBranch).not.toHaveBeenCalled();
      expect(apiPost).not.toHaveBeenCalled();
    },
  );

  it('refuses a malformed idempotency key with no read', async () => {
    const result = await activatePendingBranch(null, branchForm({ idempotencyKey: 'not-a-key' }));
    expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(getBranch).not.toHaveBeenCalled();
  });
});
