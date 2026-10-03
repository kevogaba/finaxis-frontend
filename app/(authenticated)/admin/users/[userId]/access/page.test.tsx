import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import {
  ACCESS_DESCRIPTION,
  NO_ACTIVE_ROLES,
  ROLES_UNAVAILABLE,
} from '@/modules/administration/users/user-rules';
import { renderWithProviders } from '@/test/test-utils';

const {
  getBranchIndex,
  getCurrentContextProfile,
  getRoleIndex,
  getUser,
  listRoleAssignments,
  listUserBranchAssignments,
  redirect,
} = vi.hoisted(() => ({
  getBranchIndex: vi.fn(),
  getCurrentContextProfile: vi.fn(),
  getRoleIndex: vi.fn(),
  getUser: vi.fn(),
  listRoleAssignments: vi.fn(),
  listUserBranchAssignments: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => {
  // The real `unstable_rethrow` for load(), plus the pagination bar's hooks outside an app router.
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    notFound: () => {
      throw new Error('NEXT_NOT_FOUND');
    },
    redirect: (to: string) => redirect(to) as unknown,
    usePathname: () => '/admin/users/access',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
});
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/lib/api/lookups', () => ({
  getBranchIndex: () => getBranchIndex() as unknown,
  getRoleIndex: () => getRoleIndex() as unknown,
}));
vi.mock('@/modules/administration/roles/role-service', () => ({
  listRoleAssignments: (...args: unknown[]) => listRoleAssignments(...args) as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  getUser: (...args: unknown[]) => getUser(...args) as unknown,
  listUserBranchAssignments: (...args: unknown[]) => listUserBranchAssignments(...args) as unknown,
}));
vi.mock('@/modules/administration/roles/role-actions', () => ({
  assignRole: vi.fn(),
  revokeRoleAssignment: vi.fn(),
}));

const { default: UserAccessPage } = await import('./page');

const FELIX = '10000000-0000-4000-8000-00000000000d';
const ORG = '11111111-1111-4111-8111-111111111111';
const HEAD_OFFICE = '22222222-2222-4222-8222-222222222222';
const WESTLANDS = '44444444-4444-4444-8444-444444444444';
const KISUMU = '55555555-5555-4555-8555-555555555555';
const TELLER = '66666666-6666-4666-8666-666666666666';
const AUDITOR = '77777777-7777-4777-8777-777777777777';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ALL_CODES = [
  'user.view',
  'user.assign_role',
  'user.revoke_role',
  'role_assignment.view',
  'role.view',
  'branch_assignment.view',
];
const TENANT_HELP = 'Applies at every branch and at institution level.';
const UNREADABLE_HINT =
  "Their branch assignments can't be read here, so only institution scope is available.";
const PARTIAL_HINT =
  'Only the first 500 branch assignments were checked and none of theirs was among them, so only institution scope is offered here.';
const NO_BRANCH_HINT = 'Assign them to a branch first to give a branch-scoped role.';
const notAssignedHint = (branch: string) =>
  `They aren't assigned to ${branch}. Assign them there first to give a branch-scoped role.`;

type RoleIndex = [string, { name: string; code: string; status: string; systemRole: boolean }][];
const TELLER_ROLE: RoleIndex = [
  [TELLER, { name: 'Teller', code: 'TELLER', status: 'ACTIVE', systemRole: false }],
];
const DISABLED_TELLER: RoleIndex = [
  [TELLER, { name: 'Teller', code: 'TELLER', status: 'DISABLED', systemRole: false }],
];
const TELLER_AND_DISABLED_AUDITOR: RoleIndex = [
  ...TELLER_ROLE,
  [AUDITOR, { name: 'Auditor', code: 'AUDITOR', status: 'DISABLED', systemRole: false }],
];
const BRANCH_INDEX: [string, { name: string; code: string }][] = [
  [HEAD_OFFICE, { name: 'Head Office', code: 'HEAD_OFFICE' }],
  [WESTLANDS, { name: 'Westlands Branch', code: 'WESTLANDS' }],
  [KISUMU, { name: 'Kisumu', code: 'KISUMU' }],
];

interface Assignment {
  id: string;
  roleId: string;
  scopeType: 'TENANT' | 'BRANCH';
  branchId: string | null;
}
const assignment = (
  n: number,
  roleId: string,
  scopeType: Assignment['scopeType'],
  branchId: string | null = null,
): Assignment => ({
  id: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  roleId,
  scopeType,
  branchId,
});

interface Setup {
  permissions?: string[];
  /** The role index the page reads: empty on any failure (lib/api/lookups.ts). */
  index?: RoleIndex;
  branchIndex?: typeof BRANCH_INDEX;
  membershipStatus?: string;
  selectedBranch?: { id: string; name: string } | null;
  /** The signed-in user's own id (the record is Felix's). */
  profileUserId?: string;
  /** The user's ACTIVE role assignments on the requested page. */
  rows?: Assignment[];
  /** The page the backend answers: defaults to a single page holding `rows`. */
  page?: { number: number; size: number; totalItems: number; totalPages: number };
  assignmentsError?: Error;
  /** The branch assignments the scan found (only `branchId` is read). */
  scanned?: { branchId: string }[];
  truncated?: boolean;
  scanError?: Error;
  userError?: Error;
}

/** Programs every service the page reads. A test names only what it varies. */
function setup({
  permissions = ALL_CODES,
  index = TELLER_ROLE,
  branchIndex = BRANCH_INDEX,
  membershipStatus = 'ACTIVE',
  selectedBranch = null,
  profileUserId = 'someone-else',
  rows = [],
  page,
  assignmentsError,
  scanned = [],
  truncated = false,
  scanError,
  userError,
}: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { permissions, user_id: profileUserId, branches: [] },
    context: { organization: { id: ORG, name: 'Greenfield' }, branch: selectedBranch },
  });
  if (userError) getUser.mockRejectedValue(userError);
  else getUser.mockResolvedValue({ id: FELIX, displayName: 'Felix Omondi', membershipStatus });
  if (assignmentsError) listRoleAssignments.mockRejectedValue(assignmentsError);
  else {
    const { number, size, totalItems, totalPages } = page ?? {
      number: 0,
      size: 10,
      totalItems: rows.length,
      totalPages: rows.length === 0 ? 0 : 1,
    };
    listRoleAssignments.mockResolvedValue({
      items: rows,
      page: {
        number,
        size,
        totalItems,
        totalPages,
        hasNext: number + 1 < totalPages,
        hasPrevious: number > 0,
      },
    });
  }
  if (scanError) listUserBranchAssignments.mockRejectedValue(scanError);
  else listUserBranchAssignments.mockResolvedValue({ items: scanned, truncated });
  getRoleIndex.mockResolvedValue(new Map(index));
  getBranchIndex.mockResolvedValue(new Map(branchIndex));
}

type Query = Record<string, string | undefined>;
const renderPage = (userId = FELIX, query: Query = {}) =>
  UserAccessPage({ params: Promise.resolve({ userId }), searchParams: Promise.resolve(query) });

async function show(userId = FELIX, query: Query = {}) {
  const element = await renderPage(userId, query);
  if (!element) throw new Error('The page rendered nothing');
  return renderWithProviders(element);
}

/** What `redirect()` was called with, once the page has thrown the mock's NEXT_REDIRECT. */
async function redirectedTo(userId: string, query: Query): Promise<string | undefined> {
  await expect(renderPage(userId, query)).rejects.toThrow('NEXT_REDIRECT');
  expect(redirect).toHaveBeenCalledTimes(1);
  return redirect.mock.calls[0]?.[0] as string | undefined;
}

const hidden = (name: string, root: ParentNode) =>
  root.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;

/** Rule 6: a mutation surface carries the rendered organisation and a minted key. */
function expectScoped(root: ParentNode) {
  expect(hidden('contextOrganisationId', root)).toBe(ORG);
  expect(hidden('idempotencyKey', root)).toMatch(UUID);
}

const assignButton = () => screen.queryByRole('button', { name: 'Assign role' });
const revokeButtons = () => screen.queryAllByRole('button', { name: /^Revoke / });
const dataRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const cellTexts = (tr: HTMLElement) =>
  within(tr)
    .getAllByRole('cell')
    .map((cell) => cell.textContent);

async function openDrawer() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Assign role' }));
  const drawer = await screen.findByRole('dialog', { name: 'Assign a role' });
  return { user, drawer, scope: within(drawer).getByRole('combobox', { name: /^Scope/ }) };
}

/** Opens the Scope select: the "One branch" option, and whether it can be chosen. */
async function oneBranchOption(
  user: ReturnType<typeof userEvent.setup>,
  scope: HTMLElement,
): Promise<HTMLElement> {
  await user.click(scope);
  return await screen.findByRole('option', { name: 'One branch' });
}

/** Chooses "One branch", then lists the Branch select's options. */
async function branchOptions(user: ReturnType<typeof userEvent.setup>, scope: HTMLElement) {
  await user.click(await oneBranchOption(user, scope));
  await user.click(await screen.findByRole('combobox', { name: /^Branch/ }));
  return within(await screen.findByRole('listbox'))
    .getAllByRole('option')
    .map((option) => option.textContent);
}

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('UserAccessPage: the record id', () => {
  it.each(['not-a-uuid', '../x', 'new', ''])(
    'answers not-found for %j before any backend read',
    async (id) => {
      setup();

      await expect(renderPage(id)).rejects.toThrow('NEXT_NOT_FOUND');

      expect(getUser).not.toHaveBeenCalled();
      expect(getCurrentContextProfile).not.toHaveBeenCalled();
      expect(listRoleAssignments).not.toHaveBeenCalled();
      expect(getRoleIndex).not.toHaveBeenCalled();
      expect(getBranchIndex).not.toHaveBeenCalled();
      expect(listUserBranchAssignments).not.toHaveBeenCalled();
    },
  );

  it('reads a valid id, in its lower-case form, from every service that takes it', async () => {
    setup({ rows: [assignment(1, TELLER, 'TENANT')] });

    await show(FELIX.toUpperCase());

    // Positive control for the cases above: a valid id does read, and the page renders.
    expect(getUser).toHaveBeenCalledWith(FELIX);
    expect(listRoleAssignments).toHaveBeenCalledWith(
      { userId: FELIX, status: 'ACTIVE' },
      expect.anything(),
    );
    expect(listUserBranchAssignments).toHaveBeenCalledWith(FELIX);
    expect(screen.getByRole('table', { name: 'Role assignments' })).toBeInTheDocument();
  });

  it('reads the ACTIVE assignments only, ten to a page unless the URL says otherwise', async () => {
    setup();

    await show(FELIX, { page: '2', size: '20' });

    expect(listRoleAssignments).toHaveBeenCalledWith(
      { userId: FELIX, status: 'ACTIVE' },
      { page: 2, size: 20 },
    );
  });

  it('defaults to the first page of ten', async () => {
    setup();

    await show();

    expect(listRoleAssignments).toHaveBeenCalledWith(
      { userId: FELIX, status: 'ACTIVE' },
      { page: 0, size: 10 },
    );
  });

  it('renders nothing when the record itself failed (the layout shows that failure)', async () => {
    setup({ userError: new BackendApiError(404, { code: 'resource_not_found' }) });

    expect(await renderPage()).toBeNull();
  });
});

describe('UserAccessPage: when no role can be offered (1b)', () => {
  it('says the roles could not be loaded, not that there are none, when the role index is empty', async () => {
    // Every tenant has system roles, so an empty index is a failed read (getRoleIndex swallows it).
    setup({ index: [] });

    await show();

    expect(screen.getByText(ROLES_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.queryByText(NO_ACTIVE_ROLES)).toBeNull();
    expect(screen.queryByText(ACCESS_DESCRIPTION)).toBeNull();
    expect(assignButton()).toBeNull();
  });

  it('says there are no active roles when the index is not empty but none of its roles is ACTIVE', async () => {
    setup({ index: DISABLED_TELLER });

    await show();

    expect(screen.getByText(NO_ACTIVE_ROLES)).toBeInTheDocument();
    expect(screen.queryByText(ROLES_UNAVAILABLE)).toBeNull();
    expect(assignButton()).toBeNull();
  });

  it('describes the tab and offers the assignment when an ACTIVE role exists (the control for the cases above)', async () => {
    setup();

    await show();

    expect(screen.getByText(ACCESS_DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByText(ROLES_UNAVAILABLE)).toBeNull();
    expect(screen.queryByText(NO_ACTIVE_ROLES)).toBeNull();
    expect(assignButton()).toBeInTheDocument();
  });

  it.each([
    ['a REVOKED membership', { membershipStatus: 'REVOKED' }],
    [
      'no user.assign_role',
      { permissions: ALL_CODES.filter((code) => code !== 'user.assign_role') },
    ],
    ['no role.view', { permissions: ALL_CODES.filter((code) => code !== 'role.view') }],
  ] as [string, Setup][])(
    'says nothing about roles being unavailable when nothing could be assigned anyway: %s',
    async (_label, overrides) => {
      setup({ ...overrides, index: [] });

      await show();

      expect(screen.getByText(ACCESS_DESCRIPTION)).toBeInTheDocument();
      expect(screen.queryByText(ROLES_UNAVAILABLE)).toBeNull();
      expect(screen.queryByText(NO_ACTIVE_ROLES)).toBeNull();
      expect(assignButton()).toBeNull();
    },
  );
});

describe('UserAccessPage: offering the assignment', () => {
  it.each([
    ['a REVOKED membership', { membershipStatus: 'REVOKED' }],
    [
      'no user.assign_role',
      { permissions: ALL_CODES.filter((code) => code !== 'user.assign_role') },
    ],
    ['no role.view', { permissions: ALL_CODES.filter((code) => code !== 'role.view') }],
    ['no ACTIVE role to offer', { index: DISABLED_TELLER }],
  ] as [string, Setup][])(
    'offers no assignment, and says the user holds no role rather than inviting one, with %s',
    async (_label, overrides) => {
      setup(overrides);

      await show();

      expect(assignButton()).toBeNull();
      expect(screen.getByText('No roles assigned')).toBeInTheDocument();
      expect(screen.getByText('This user holds no roles.')).toBeInTheDocument();
      expect(screen.queryByText('Assign a role to give them permissions.')).toBeNull();
    },
  );

  it('offers the assignment, and invites it on an empty list, with an ACTIVE role (the control for the cases above)', async () => {
    setup();

    await show();

    expect(assignButton()).toBeInTheDocument();
    expect(screen.getByText('No roles assigned')).toBeInTheDocument();
    expect(screen.getByText('Assign a role to give them permissions.')).toBeInTheDocument();
    expect(screen.queryByText('This user holds no roles.')).toBeNull();
  });

  it('offers only the ACTIVE roles, named with their codes', async () => {
    setup({ index: TELLER_AND_DISABLED_AUDITOR });
    await show();

    const { user, drawer } = await openDrawer();
    await user.click(within(drawer).getByRole('combobox', { name: /^Role/ }));

    expect(
      within(await screen.findByRole('listbox'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Teller (TELLER)']);
  });

  it('opens a drawer scoped to the user and the rendered organisation, with a minted key (I2)', async () => {
    setup();
    await show();

    const { drawer } = await openDrawer();

    expect(drawer).toHaveTextContent('Give Felix Omondi a role. It takes effect immediately.');
    expect(hidden('userId', drawer)).toBe(FELIX);
    expectScoped(drawer);
  });
});

describe('UserAccessPage: the branch scope on offer', () => {
  it('reads no branch assignments, and says they cannot be read here, without branch_assignment.view', async () => {
    setup({ permissions: ALL_CODES.filter((code) => code !== 'branch_assignment.view') });
    await show();

    const { user, drawer, scope } = await openDrawer();

    expect(listUserBranchAssignments).not.toHaveBeenCalled();
    // The role drawer itself still opens: only branch scope is withheld.
    expect(drawer).toBeVisible();
    expect(scope).toHaveAccessibleDescription(`${TENANT_HELP} ${UNREADABLE_HINT}`);
    expect(await oneBranchOption(user, scope)).toHaveAttribute('aria-disabled', 'true');
  });

  it('says the same when the scan itself failed, and never claims they have no branch', async () => {
    setup({ scanError: new BackendApiError(500, { requestId: 'req-1' }) });
    await show();

    const { scope } = await openDrawer();

    expect(listUserBranchAssignments).toHaveBeenCalledTimes(1);
    expect(scope).toHaveAccessibleDescription(`${TENANT_HELP} ${UNREADABLE_HINT}`);
  });

  it('says the scan was partial when a capped scan found none of their branches', async () => {
    setup({ scanned: [], truncated: true });
    await show();

    const { user, scope } = await openDrawer();

    expect(scope).toHaveAccessibleDescription(`${TENANT_HELP} ${PARTIAL_HINT}`);
    expect(await oneBranchOption(user, scope)).toHaveAttribute('aria-disabled', 'true');
  });

  it('says they have no branch to name when a complete scan found none, with no branch selected', async () => {
    setup({ scanned: [], truncated: false });
    await show();

    const { user, scope } = await openDrawer();

    expect(scope).toHaveAccessibleDescription(`${TENANT_HELP} ${NO_BRANCH_HINT}`);
    expect(await oneBranchOption(user, scope)).toHaveAttribute('aria-disabled', 'true');
  });

  it('names the selected branch when a complete scan found none of their rows there', async () => {
    setup({ selectedBranch: { id: HEAD_OFFICE, name: 'Head Office' }, scanned: [] });
    await show();

    const { scope } = await openDrawer();

    expect(scope).toHaveAccessibleDescription(`${TENANT_HELP} ${notAssignedHint('Head Office')}`);
  });

  it('says so too when they are assigned only at another branch than the selected one', async () => {
    setup({
      selectedBranch: { id: HEAD_OFFICE, name: 'Head Office' },
      scanned: [{ branchId: WESTLANDS }],
    });
    await show();

    const { user, scope } = await openDrawer();

    expect(scope).toHaveAccessibleDescription(`${TENANT_HELP} ${notAssignedHint('Head Office')}`);
    expect(await oneBranchOption(user, scope)).toHaveAttribute('aria-disabled', 'true');
  });

  it('offers exactly the branches they hold, once each, in label order, and no hint (the control for the cases above)', async () => {
    setup({
      scanned: [{ branchId: WESTLANDS }, { branchId: HEAD_OFFICE }, { branchId: WESTLANDS }],
    });
    await show();

    const { user, scope } = await openDrawer();

    expect(scope).toHaveAccessibleDescription(TENANT_HELP);
    expect(await branchOptions(user, scope)).toEqual([
      'Head Office (HEAD_OFFICE)',
      'Westlands Branch (WESTLANDS)',
    ]);
  });

  it('offers only the selected branch in a branch context, even when they hold others', async () => {
    setup({
      selectedBranch: { id: HEAD_OFFICE, name: 'Head Office' },
      scanned: [{ branchId: WESTLANDS }, { branchId: HEAD_OFFICE }, { branchId: KISUMU }],
    });
    await show();

    const { user, scope } = await openDrawer();

    expect(scope).toHaveAccessibleDescription(TENANT_HELP);
    expect(await branchOptions(user, scope)).toEqual(['Head Office (HEAD_OFFICE)']);
  });

  it("names a branch the index doesn't know by its short id", async () => {
    setup({ branchIndex: [], scanned: [{ branchId: WESTLANDS }] });
    await show();

    const { user, scope } = await openDrawer();

    expect(await branchOptions(user, scope)).toEqual(['44444444']);
  });

  it.each([
    ['a REVOKED membership', { membershipStatus: 'REVOKED' }],
    [
      'no user.assign_role',
      { permissions: ALL_CODES.filter((code) => code !== 'user.assign_role') },
    ],
    ['no role.view', { permissions: ALL_CODES.filter((code) => code !== 'role.view') }],
  ] as [string, Setup][])(
    'reads no branch assignments when the user cannot be given a role anyway: %s',
    async (_label, overrides) => {
      setup(overrides);

      await show();

      expect(screen.getByText('No roles assigned')).toBeInTheDocument(); // the page did render
      expect(listUserBranchAssignments).not.toHaveBeenCalled();
    },
  );
});

describe('UserAccessPage: the rows', () => {
  it('names each role and branch from the indexes, falling back to short ids, and flags a DISABLED role', async () => {
    const ghostRole = '88888888-8888-4888-8888-888888888888';
    setup({
      index: TELLER_AND_DISABLED_AUDITOR,
      rows: [
        assignment(1, TELLER, 'TENANT'),
        assignment(2, AUDITOR, 'BRANCH', WESTLANDS),
        assignment(3, ghostRole, 'BRANCH', '99999999-9999-4999-8999-999999999999'),
      ],
    });

    await show();

    expect(dataRows().map(cellTexts)).toEqual([
      ['TellerTELLER', 'Institution', 'All branches', 'Revoke'],
      ['AuditorDisabledAUDITOR', 'Branch', 'Westlands Branch', 'Revoke'],
      ['88888888', 'Branch', '99999999', 'Revoke'],
    ]);
  });

  it('shows the forbidden state for a 403 read, and still offers the assignment', async () => {
    setup({ assignmentsError: new BackendApiError(403, { code: 'forbidden' }) });

    await show();

    expect(screen.getByText("You don't have permission")).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(assignButton()).toBeInTheDocument();
  });

  it('shows the error state, with its reference, for any other read failure', async () => {
    setup({ assignmentsError: new BackendApiError(500, { requestId: 'req-2' }) });

    await show();

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Reference: req-2')).toBeInTheDocument();
    expect(screen.queryByText("You don't have permission")).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('forwards the rendered organisation and the row to each revoke', async () => {
    const user = userEvent.setup();
    const row = assignment(1, TELLER, 'TENANT');
    setup({ rows: [row] });
    await show();

    await user.click(
      screen.getByRole('button', {
        name: "Revoke Felix Omondi's Teller assignment (institution-wide)",
      }),
    );

    const dialog = await screen.findByRole('alertdialog', {
      name: "Revoke Felix Omondi's Teller assignment?",
    });
    expectScoped(dialog);
    expect(hidden('assignmentId', dialog)).toBe(row.id);
  });

  it("warns on the signed-in user's own record that the revoke is their own assignment", async () => {
    const user = userEvent.setup();
    setup({ rows: [assignment(1, TELLER, 'TENANT')], profileUserId: FELIX });
    await show();

    await user.click(screen.getByRole('button', { name: /^Revoke Felix Omondi's Teller/ }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'This is your own assignment: you lose these permissions too',
    );
  });

  it("gives no such warning on another user's record (the control for the case above)", async () => {
    const user = userEvent.setup();
    setup({ rows: [assignment(1, TELLER, 'TENANT')], profileUserId: 'someone-else' });
    await show();

    await user.click(screen.getByRole('button', { name: /^Revoke Felix Omondi's Teller/ }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Felix Omondi loses Teller (institution-wide) immediately.');
    expect(dialog).not.toHaveTextContent('your own assignment');
  });

  it('offers a revoke only with user.revoke_role and role_assignment.view', async () => {
    setup({
      permissions: ALL_CODES.filter((code) => code !== 'user.revoke_role'),
      rows: [assignment(1, TELLER, 'TENANT')],
    });

    await show();

    expect(screen.getByRole('table')).toHaveTextContent('Teller');
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    expect(revokeButtons()).toHaveLength(0);
  });

  it('offers a revoke with both codes (the control for the case above)', async () => {
    setup({ rows: [assignment(1, TELLER, 'TENANT')] });

    await show();

    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    expect(revokeButtons()).toHaveLength(1);
  });

  it('hides the revoke of a branch assignment at another branch in a branch context, not the rest', async () => {
    setup({
      selectedBranch: { id: HEAD_OFFICE, name: 'Head Office' },
      rows: [
        assignment(1, TELLER, 'TENANT'),
        assignment(2, TELLER, 'BRANCH', HEAD_OFFICE),
        assignment(3, TELLER, 'BRANCH', WESTLANDS),
      ],
    });

    await show();

    expect(dataRows().map((tr) => cellTexts(tr)[2])).toEqual([
      'All branches',
      'Head Office',
      'Westlands Branch',
    ]);
    expect(revokeButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
      "Revoke Felix Omondi's Teller assignment (institution-wide)",
      "Revoke Felix Omondi's Teller assignment (Head Office)",
    ]);
  });

  it('offers every revoke at institution level (the control for the case above)', async () => {
    setup({
      rows: [
        assignment(1, TELLER, 'TENANT'),
        assignment(2, TELLER, 'BRANCH', HEAD_OFFICE),
        assignment(3, TELLER, 'BRANCH', WESTLANDS),
      ],
    });

    await show();

    expect(revokeButtons()).toHaveLength(3);
  });
});

describe('UserAccessPage: paging', () => {
  const pageOf25 = (number: number) => ({
    number,
    size: 10,
    totalItems: 25,
    totalPages: 3,
  });

  it('shows the page the backend answered, with its place in the list', async () => {
    setup({
      rows: [assignment(21, TELLER, 'TENANT'), assignment(22, TELLER, 'TENANT')],
      page: pageOf25(2),
    });

    await show(FELIX, { page: '2' });

    expect(dataRows()).toHaveLength(2);
    expect(screen.getByText('21–25 of 25')).toBeInTheDocument();
    // An in-range page is not redirected.
    expect(redirect).not.toHaveBeenCalled();
  });

  it('redirects a page past the end to the last page, keeping the other URL params', async () => {
    setup({ rows: [], page: pageOf25(9) });

    expect(await redirectedTo(FELIX, { page: '9', size: '10' })).toBe(
      `/admin/users/${FELIX}/access?page=2&size=10`,
    );
  });

  it('redirects to the bare path, with no page param, when the last page is the first', async () => {
    setup({ rows: [], page: { number: 7, size: 10, totalItems: 3, totalPages: 1 } });

    expect(await redirectedTo(FELIX, { page: '7' })).toBe(`/admin/users/${FELIX}/access`);
  });

  it('keeps the size when it redirects to the first page', async () => {
    setup({ rows: [], page: { number: 7, size: 20, totalItems: 3, totalPages: 1 } });

    expect(await redirectedTo(FELIX, { page: '7', size: '20' })).toBe(
      `/admin/users/${FELIX}/access?size=20`,
    );
  });

  it('redirects within the lower-cased id, whatever case the URL had', async () => {
    setup({ rows: [], page: pageOf25(9) });

    expect(await redirectedTo(FELIX.toUpperCase(), { page: '9' })).toBe(
      `/admin/users/${FELIX}/access?page=2`,
    );
  });

  it('does not redirect an empty list asked for a later page', async () => {
    setup({ rows: [], page: { number: 3, size: 10, totalItems: 0, totalPages: 0 } });

    await show(FELIX, { page: '3' });

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByText('No roles assigned')).toBeInTheDocument();
  });
});
