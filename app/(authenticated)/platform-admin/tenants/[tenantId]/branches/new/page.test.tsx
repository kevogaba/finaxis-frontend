import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import { renderWithProviders } from '@/test/test-utils';
import { UUID_PATTERN } from '@/lib/api/wire';
import {
  BRANCH_CREATE_INACTIVE,
  branchCreateDescription,
  branchCreateWarning,
  PARENTS_PARTIAL,
  PARENTS_UNAVAILABLE,
} from '@/modules/platform-administration/branches/institution-branch-rules';
import { TENANT_STATUSES } from '@/modules/platform-administration/tenants/tenant-contract';

const PLATFORM = '00000000-0000-0000-0000-000000000000';
// Lettered, so its upper-case form differs from it.
const ACME = '17000000-0000-4000-8000-00000000000a';
const HEAD_OFFICE = '22222222-2222-4222-8222-222222222222';

const {
  createInstitutionBranchDraft,
  getCurrentContextProfile,
  getInstitutionBranchIndex,
  getTenant,
  redirect,
} = vi.hoisted(() => ({
  createInstitutionBranchDraft: vi.fn(),
  getCurrentContextProfile: vi.fn(),
  getInstitutionBranchIndex: vi.fn(),
  getTenant: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => redirect(to) as unknown,
}));
// parseInstitutionId reads the reserved platform organisation from here. A literal, because vi.mock
// is hoisted above the constants (the same id as PLATFORM).
vi.mock('@/config/env.server', () => ({
  serverEnv: { PLATFORM_ORGANISATION_ID: '00000000-0000-0000-0000-000000000000' },
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/modules/platform-administration/tenants/tenant-service', () => ({
  getTenant: (...args: unknown[]) => getTenant(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/branches/institution-branch-service', () => ({
  getInstitutionBranchIndex: (...args: unknown[]) => getInstitutionBranchIndex(...args) as unknown,
}));
// The form's Server Action: the wrapper imports it, and one test submits through it.
vi.mock('@/modules/platform-administration/branches/institution-branch-actions', () => ({
  createInstitutionBranchDraft: (...args: unknown[]) =>
    createInstitutionBranchDraft(...args) as unknown,
}));

const { default: NewInstitutionBranchPage } = await import('./page');

interface Setup {
  permissions?: string[];
  status?: string;
  timezone?: string;
  /** What the tenant read settles with; an Error rejects it. */
  tenant?: Error;
  /** What the branch index read settles with; an Error rejects it. */
  index?: Error;
  truncated?: boolean;
}

/** Programs every read the page makes. A test names only what it varies. */
function setup({
  permissions = ['branch.view', 'branch.create'],
  status = 'ACTIVE',
  timezone = 'Africa/Nairobi',
  tenant,
  index,
  truncated = false,
}: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { permissions },
    context: { organization: { id: PLATFORM, name: 'Platform' }, branch: null },
  });
  if (tenant) getTenant.mockRejectedValue(tenant);
  else {
    getTenant.mockResolvedValue({
      id: ACME,
      tenantCode: 'acme',
      displayName: 'Acme SACCO',
      countryCode: 'KE',
      status,
      timezone,
    });
  }
  if (index) getInstitutionBranchIndex.mockRejectedValue(index);
  else {
    getInstitutionBranchIndex.mockResolvedValue({
      names: new Map([[HEAD_OFFICE, { name: 'Head Office', code: 'HEAD_OFFICE' }]]),
      truncated,
    });
  }
}

async function show(tenantId = ACME) {
  return renderWithProviders(
    await NewInstitutionBranchPage({ params: Promise.resolve({ tenantId }) }),
  );
}

const parentBranch = () => screen.getByRole('combobox', { name: 'Parent branch' });

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('NewInstitutionBranchPage: the form', () => {
  it('shows the form with the BG-18 warning for an active institution', async () => {
    const user = userEvent.setup();
    setup();

    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Create branch draft' })).toBeVisible();
    expect(screen.getByText(branchCreateDescription('Acme SACCO'))).toBeVisible();
    expect(screen.getByRole('note')).toHaveTextContent(branchCreateWarning('Acme SACCO'));
    expect(screen.getByRole('combobox', { name: 'Timezone' })).toHaveValue('Africa/Nairobi');
    expect(parentBranch()).toHaveAccessibleDescription('Optional.');
    await user.click(parentBranch());
    expect(
      within(screen.getByRole('listbox')).getByRole('option', {
        name: 'Head Office (HEAD_OFFICE)',
      }),
    ).toBeVisible();
    expect(getInstitutionBranchIndex).toHaveBeenCalledWith(ACME);
  });

  it("falls back to UTC for a zone the browser can't format", async () => {
    setup({ timezone: 'UTC+3' });

    await show();

    expect(screen.getByRole('combobox', { name: 'Timezone' })).toHaveValue('UTC');
  });

  it("says when the branch names couldn't be read, instead of offering none silently", async () => {
    setup({ index: new BackendApiError(500, { requestId: 'req-9' }) });

    await show();

    expect(parentBranch()).toHaveAccessibleDescription(PARENTS_UNAVAILABLE);
    // The form still works without a parent (Optional).
    expect(screen.getByRole('textbox', { name: 'Branch code' })).toBeVisible();
  });

  it('says when the parent list was capped, instead of presenting it as every branch', async () => {
    setup({ truncated: true });

    await show();

    expect(parentBranch()).toHaveAccessibleDescription(PARENTS_PARTIAL);
  });

  it('sends the lower-cased institution and the rendered organisation with the draft', async () => {
    const user = userEvent.setup();
    createInstitutionBranchDraft.mockResolvedValue({ ok: true });
    setup();

    await show(ACME.toUpperCase());

    // The route's id is read lower-cased (contract §A) and every link is built from it.
    expect(getTenant).toHaveBeenCalledWith(ACME);
    expect(getInstitutionBranchIndex).toHaveBeenCalledWith(ACME);
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${ACME}/branches`,
    );
    await user.type(screen.getByRole('textbox', { name: 'Branch code' }), 'THIKA');
    await user.type(screen.getByRole('textbox', { name: 'Branch name' }), 'Thika Road Branch');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    await waitFor(() => {
      expect(createInstitutionBranchDraft).toHaveBeenCalledTimes(1);
    });
    const sent = createInstitutionBranchDraft.mock.calls[0]?.[1] as FormData;
    expect(sent.get('tenantId')).toBe(ACME);
    expect(sent.get('contextOrganisationId')).toBe(PLATFORM);
    expect(sent.get('idempotencyKey')).toMatch(UUID_PATTERN);
  });
});

describe('NewInstitutionBranchPage: refusals', () => {
  it.each([
    ['only branch.view', ['branch.view']],
    ['only branch.create', ['branch.create']],
    ['neither code', []],
  ])('refuses without branch.create and branch.view (%s)', async (_label, permissions) => {
    setup({ permissions });

    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Create branch draft' })).toBeVisible();
    expect(screen.getByText("You don't have permission")).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to branches' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${ACME}/branches`,
    );
    expect(screen.queryByRole('textbox', { name: 'Branch code' })).toBeNull();
    expect(getInstitutionBranchIndex).not.toHaveBeenCalled();
  });

  it.each(TENANT_STATUSES.filter((status) => status !== 'ACTIVE'))(
    "refuses an institution that isn't active (%s)",
    async (status) => {
      setup({ status });

      await show();

      expect(screen.getByText(BRANCH_CREATE_INACTIVE.title)).toBeVisible();
      expect(screen.getByText(BRANCH_CREATE_INACTIVE.description)).toBeVisible();
      expect(screen.getByRole('link', { name: 'Back to branches' })).toBeVisible();
      expect(screen.queryByRole('textbox', { name: 'Branch code' })).toBeNull();
      expect(getInstitutionBranchIndex).not.toHaveBeenCalled();
    },
  );

  it('answers an unknown institution with the not-found page', async () => {
    setup({ tenant: new BackendApiError(404, { code: 'resource_not_found' }) });

    await expect(
      NewInstitutionBranchPage({ params: Promise.resolve({ tenantId: ACME }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(getInstitutionBranchIndex).not.toHaveBeenCalled();
  });

  it.each([
    ['the platform organisation', PLATFORM],
    ['a malformed id', 'pwani-fishermen'],
    ['a path-like id', '../x'],
  ])('answers %s with the not-found page, reading nothing', async (_label, tenantId) => {
    setup();

    await expect(
      NewInstitutionBranchPage({ params: Promise.resolve({ tenantId }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(getTenant).not.toHaveBeenCalled();
    expect(getCurrentContextProfile).not.toHaveBeenCalled();
    expect(getInstitutionBranchIndex).not.toHaveBeenCalled();
  });

  it("says so, with no form, when the institution can't be read", async () => {
    setup({ tenant: new BackendApiError(403, { code: 'forbidden' }) });

    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Create branch draft' })).toBeVisible();
    expect(screen.getByText("You don't have permission")).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Branch code' })).toBeNull();
  });

  it('shows the failure with its reference, with no form, on a server error', async () => {
    setup({ tenant: new BackendApiError(500, { requestId: 'req-7' }) });

    await show();

    expect(screen.getByText(/req-7/)).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Branch code' })).toBeNull();
  });

  // Rule 21: a page settles every read with load(), so a lost session or a stale context redirects
  // instead of rendering the form (or its parent list) over a dead session.
  it.each([
    ['the institution read', 'tenant', new BackendApiError(401), '/login?reason=session_expired'],
    ['the parent index read', 'index', new BackendApiError(401), '/login?reason=session_expired'],
    [
      'the institution read',
      'tenant',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      '/select-context',
    ],
    [
      'the parent index read',
      'index',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      '/select-context',
    ],
  ] as const)(
    'redirects when %s finds the session or the context lost (%#)',
    async (_label, which, error, to) => {
      setup({ [which]: error });

      await expect(
        NewInstitutionBranchPage({ params: Promise.resolve({ tenantId: ACME }) }),
      ).rejects.toThrow(`NEXT_REDIRECT:${to}`);
    },
  );
});
