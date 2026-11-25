import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendApiError } from '@/auth/backend-api';
import { ACTIVATE_FORBIDDEN } from '@/modules/administration/branches/branch-rules';
import { BRANCH_CHANGED } from './approval-copy';

const { apiPost, getAuthenticatedUser, getBranch, getCurrentContextProfile, refresh } = vi.hoisted(
  () => ({
    apiPost: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
      Promise.resolve<unknown>({}),
    ),
    getAuthenticatedUser: vi.fn(),
    getBranch: vi.fn(),
    getCurrentContextProfile: vi.fn(),
    refresh: vi.fn(),
  }),
);
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
vi.mock('@/modules/administration/branches/branch-service', () => ({
  getBranch: (id: string) => getBranch(id) as unknown,
}));

const { activatePendingBranch } = await import('./branch-activation-actions');

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const ME = 'a1000000-0000-4000-8000-0000000000aa';
const BRANCH = 'e5000000-0000-4000-8000-0000000000ee';
const WESTLANDS = 'c3000000-0000-4000-8000-0000000000cc';
const ORGANISATION = 'f6000000-0000-4000-8000-0000000000ff';
const OTHER_ORGANISATION = '17000000-0000-4000-8000-000000000011';
const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

function resolved(
  branch: { id: string; name: string } | null = null,
  permissions: string[] = ['branch.approve', 'branch.view'],
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
    // Drains the once-queued answers a refused activation never reached, so they can't leak into
    // the next test.
    apiPost.mockReset();
    getAuthenticatedUser.mockResolvedValue({ id: 'session-user' });
    getCurrentContextProfile.mockResolvedValue(resolved());
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
    expect(apiPost).toHaveBeenCalledExactlyOnceWith(
      `/api/v1/branches/${BRANCH}/activate`,
      body,
      KEY,
    );
  });

  // BG-03: the platform checks the target branch, so a selected branch refuses nothing here.
  it('activates with another branch selected', async () => {
    getCurrentContextProfile.mockResolvedValue(resolved({ id: WESTLANDS, name: 'Westlands' }));
    await expect(activatePendingBranch(null, branchForm())).resolves.toEqual({ ok: true });
    expect(apiPost).toHaveBeenCalledExactlyOnceWith(`/api/v1/branches/${BRANCH}/activate`, {}, KEY);
  });

  it.each(['DRAFT', 'SUSPENDED'])('refuses a %s branch before any write', async (status) => {
    getBranch.mockResolvedValue({ id: BRANCH, status });
    await expect(activatePendingBranch(null, branchForm())).resolves.toMatchObject({
      ok: false,
      code: 'approval_changed',
      formError: BRANCH_CHANGED,
    });
    expect(apiPost).not.toHaveBeenCalled();
  });

  // ACTIVE is the activation's own end state: a same-key retry whose first response was lost
  // reaches the endpoint, which replays the stored answer.
  it.each([
    ['a blank reason', '   ', {}],
    ['a reason', '  Licence received ', { reason: 'Licence received' }],
  ])(
    'lets an ACTIVE branch through with %s, posting once with the same key',
    async (_c, reason, body) => {
      getBranch.mockResolvedValue({ id: BRANCH, status: 'ACTIVE' });
      await expect(activatePendingBranch(null, branchForm({ reason }))).resolves.toEqual({
        ok: true,
      });
      expect(apiPost).toHaveBeenCalledExactlyOnceWith(
        `/api/v1/branches/${BRANCH}/activate`,
        body,
        KEY,
      );
      expect(refresh).toHaveBeenCalledTimes(1);
    },
  );

  it('reads a refused POST from an ACTIVE branch as changed, not as a failed activation', async () => {
    getBranch.mockResolvedValue({ id: BRANCH, status: 'ACTIVE' });
    apiPost.mockRejectedValueOnce(new BackendApiError(500, { requestId: 'req-b' }));
    await expect(activatePendingBranch(null, branchForm())).resolves.toMatchObject({
      ok: false,
      code: 'approval_changed',
      formError: BRANCH_CHANGED,
    });
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it('keeps a 403 from an ACTIVE branch as the activation refusal', async () => {
    getBranch.mockResolvedValue({ id: BRANCH, status: 'ACTIVE' });
    apiPost.mockRejectedValueOnce(
      new BackendApiError(403, { code: 'forbidden', requestId: 'req-c' }),
    );
    await expect(activatePendingBranch(null, branchForm())).resolves.toMatchObject({
      ok: false,
      formError: ACTIVATE_FORBIDDEN,
      requestId: 'req-c',
    });
  });

  it('redirects a lost session from an ACTIVE branch’s POST, not a changed reading', async () => {
    getBranch.mockResolvedValue({ id: BRANCH, status: 'ACTIVE' });
    apiPost.mockRejectedValueOnce(new BackendApiError(401));
    await expect(activatePendingBranch(null, branchForm())).rejects.toThrow(
      'NEXT_REDIRECT:/login?reason=session_expired',
    );
  });

  it('keeps a 500 from a pending branch as the generic failure, not as changed', async () => {
    apiPost.mockRejectedValueOnce(new BackendApiError(500, { requestId: 'req-z' }));
    // No backend code and no changed reading: the generic failure keeps its reference.
    await expect(activatePendingBranch(null, branchForm())).resolves.toMatchObject({
      ok: false,
      code: null,
      requestId: 'req-z',
    });
  });

  it('explains the backend’s `forbidden` as a missing permission only (BG-08)', async () => {
    apiPost.mockRejectedValueOnce(
      new BackendApiError(403, { code: 'forbidden', requestId: 'req-5' }),
    );
    await expect(activatePendingBranch(null, branchForm())).resolves.toMatchObject({
      ok: false,
      formError: "You can't activate this branch. Your role doesn't allow it.",
      requestId: 'req-5',
    });
  });

  it.each([
    [
      'lifecycle.approver_is_branch_maker',
      'You drafted or submitted this branch, so someone else must activate it.',
    ],
    [
      'lifecycle.approver_is_branch_modifier',
      'You edited this branch, so someone else must activate it.',
    ],
  ])('names the platform’s %s refusal by its code (BG-08)', async (code, copy) => {
    // An editor can't be known before the refusal: nothing exposes who amended a branch.
    apiPost.mockRejectedValueOnce(new BackendApiError(403, { code, requestId: 'req-6' }));
    await expect(activatePendingBranch(null, branchForm())).resolves.toMatchObject({
      ok: false,
      code,
      formError: copy,
      requestId: 'req-6',
    });
  });

  it('refuses a reason over 500 characters before any read', async () => {
    const result = await activatePendingBranch(null, branchForm({ reason: 'x'.repeat(501) }));
    expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(getBranch).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  // Beyond the plan's rows: the layer's Review Focus 1 and the 4a review's lessons (the guard
  // reads' own failures, the cross-tab and id guards). The drafter is the platform's to refuse: a
  // switch may let them activate (BG-08), and its named refusal is explained below.

  it('sends a reason of exactly 500 characters', async () => {
    const reason = 'x'.repeat(500);
    await activatePendingBranch(null, branchForm({ reason }));
    expect(apiPost).toHaveBeenCalledExactlyOnceWith(
      `/api/v1/branches/${BRANCH}/activate`,
      { reason },
      KEY,
    );
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
    expect(apiPost).not.toHaveBeenCalled();
  });
});
