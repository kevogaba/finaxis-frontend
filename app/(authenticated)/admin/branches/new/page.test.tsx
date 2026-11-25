import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { permissionScopes } from '@/test/permission-scopes';
import { renderWithProviders } from '@/test/test-utils';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
const CODES = ['branch.create', 'branch.view'];
const auth = vi.hoisted(() => ({ branchOnly: [] as string[] }));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () =>
    Promise.resolve({
      kind: 'resolved',
      profile: { permissions: CODES, permission_scopes: permissionScopes(CODES, auth.branchOnly) },
      context: {
        organization: { id: 'org-1', name: 'Greenfield' },
        branch: { id: 'b-1', name: 'Head Office' },
      },
    }),
}));
vi.mock('@/lib/api/lookups', () => ({
  getOrganisationTimeZone: () => Promise.resolve('Africa/Nairobi'),
  getBranchIndex: () => Promise.resolve(new Map()),
}));
vi.mock('@/modules/administration/branches/branch-actions', () => ({ createBranchDraft: vi.fn() }));

const { default: NewBranchPage } = await import('./page');

describe('NewBranchPage', () => {
  // BG-03: a draft is the tenant-wide holder's to open and submit, whichever branch is selected.
  it('offers the form with a branch selected, with no advice to switch to All branches', async () => {
    renderWithProviders(await NewBranchPage());

    expect(screen.getByRole('heading', { level: 1, name: 'Create branch' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Branch code/ })).toBeInTheDocument();
    expect(screen.queryByText(/All branches/)).toBeNull();
    // The form needs branch.view tenant-wide, so its parents are every branch: no scoped note.
    expect(screen.getByRole('combobox', { name: 'Parent branch' })).toHaveAccessibleDescription(
      'Optional.',
    );
  });

  // The platform checks branch.create and its view tenant-wide (requireTenantPermission).
  it('refuses a branch-scoped branch.create holder with their branch selected', async () => {
    auth.branchOnly = CODES;
    try {
      renderWithProviders(await NewBranchPage());
    } finally {
      auth.branchOnly = [];
    }

    expect(screen.getByRole('heading', { level: 1, name: 'Create branch' })).toBeInTheDocument();
    expect(screen.getByText("You don't have permission")).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Branch code/ })).toBeNull();
  });
});
