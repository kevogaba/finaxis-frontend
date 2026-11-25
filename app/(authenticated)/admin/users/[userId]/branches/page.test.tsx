import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import type { UserBranchAssignmentsTable } from '@/modules/administration/users/components/user-branch-assignments-table';
import { OWN_ACCESS, SCOPED_ASSIGNMENTS_NOTE } from '@/modules/administration/users/user-rules';
import { SCOPED_BRANCHES_NOTE } from '@/modules/administration/branches/branch-rules';
import { resolvedStyle } from '@/test/resolved-style';
import { renderWithProviders } from '@/test/test-utils';

const {
  getBranchIndex,
  getCurrentContextProfile,
  getUser,
  listBranches,
  listUserBranchAssignments,
  redirect,
  tableRows,
} = vi.hoisted(() => ({
  getBranchIndex: vi.fn(),
  getCurrentContextProfile: vi.fn(),
  getUser: vi.fn(),
  listBranches: vi.fn(),
  listUserBranchAssignments: vi.fn(),
  redirect: vi.fn(),
  // The rows the page handed the table, in order, one entry per render of the table.
  tableRows: [] as { assignmentId: string }[][],
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
    usePathname: () => '/admin/users/branches',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
});
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/lib/api/lookups', () => ({
  getBranchIndex: () => getBranchIndex() as unknown,
  // Not the runner's zone (Africa/Nairobi), so only the organisation's can produce these times.
  getOrganisationTimeZone: () => Promise.resolve('Asia/Kolkata'),
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  getUser: (...args: unknown[]) => getUser(...args) as unknown,
  listUserBranchAssignments: (...args: unknown[]) => listUserBranchAssignments(...args) as unknown,
}));
vi.mock('@/modules/administration/branches/branch-service', () => ({
  listBranches: (...args: unknown[]) => listBranches(...args) as unknown,
}));
vi.mock('@/modules/administration/branches/branch-actions', () => ({
  assignBranchUser: vi.fn(),
  revokeBranchAssignment: vi.fn(),
}));
// The real table, recording the rows the page hands it, in order.
vi.mock(
  '@/modules/administration/users/components/user-branch-assignments-table',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/modules/administration/users/components/user-branch-assignments-table')
      >();
    return {
      ...actual,
      UserBranchAssignmentsTable: (props: ComponentProps<typeof UserBranchAssignmentsTable>) => {
        tableRows.push([...props.rows]);
        return actual.UserBranchAssignmentsTable(props);
      },
    };
  },
);

const { default: UserBranchesPage } = await import('./page');

const FELIX = '10000000-0000-4000-8000-00000000000d';
const ORG = '11111111-1111-4111-8111-111111111111';
const HEAD_OFFICE = '22222222-2222-4222-8222-222222222222';
const WESTLANDS = '44444444-4444-4444-8444-444444444444';
const KISUMU = '55555555-5555-4555-8555-555555555555';
const UNKNOWN_BRANCH = '99999999-9999-4999-8999-999999999999';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ALL_CODES = [
  'user.view',
  'user.assign_branch',
  'user.revoke_branch',
  'branch_assignment.view',
  'branch.view',
];
const DESCRIPTION =
  'Branches this user can work in. Assignment types are labels; roles grant permissions.';
const UNAVAILABLE =
  "Branches couldn't be loaded, so none can be assigned right now. Refresh to try again.";
const TRUNCATED_NOTE = 'Only the first 100 active branches are listed.';
const NO_ROWS = 'This user has no branch assignments.';
const OFFER = 'Assign a branch so they can work there.';
const OTHER_BRANCHES = "They may be assigned to branches you can't view.";
/** The names the platform embeds in each assignment (BG-09). */
const NAMES: Record<string, string> = {
  [HEAD_OFFICE]: 'Head Office',
  [WESTLANDS]: 'Westlands Branch',
  [KISUMU]: 'Kisumu',
};
/** Every code tenant-wide but these, held only through BRANCH grants (BG-33), at `heldAt`. */
const scopedTo = (...codes: string[]) => ALL_CODES.filter((code) => !codes.includes(code));

interface Row {
  id: string;
  branchId: string;
  assignmentType: string;
  branchName: string;
  assignedAt: string;
}
interface Setup {
  permissions?: string[];
  /** The codes held tenant-wide (`/auth/me` scopes); defaults to every code in `permissions`. */
  tenantWide?: string[];
  /** Where the others are held (BRANCH scopes' `branch_ids`); defaults to the selected branch. */
  heldAt?: string[];
  /** Codes held only through BRANCH grants at `heldAt` that the selected context doesn't hold: in
   * `/auth/me`'s scopes, not its `permissions`. */
  elsewhere?: string[];
  selectedBranch?: { id: string; name: string } | null;
  membershipStatus?: string;
  /** Every ACTIVE assignment of theirs, in the platform's order; the mock pages them. */
  rows?: Row[];
  rowsError?: Error;
  userError?: Error;
  activeBranches?: { id: string; branchName: string; branchCode: string }[];
  activeHasNext?: boolean;
  activeError?: Error;
  index?: [string, { name: string; code: string }][];
  /** The signed-in user's id: FELIX makes the record your own. */
  signedInAs?: string;
}

/** Programs every service the page reads. A test names only what it varies. */
function setup({
  permissions = ALL_CODES,
  tenantWide = permissions,
  selectedBranch = null,
  heldAt = selectedBranch ? [selectedBranch.id] : [],
  elsewhere = [],
  membershipStatus = 'ACTIVE',
  rows = [],
  rowsError,
  userError,
  activeBranches = [
    { id: HEAD_OFFICE, branchName: 'Head Office', branchCode: 'HEAD_OFFICE' },
    { id: WESTLANDS, branchName: 'Westlands Branch', branchCode: 'WESTLANDS' },
  ],
  activeHasNext = false,
  activeError,
  index = [
    [HEAD_OFFICE, { name: 'Head Office', code: 'HEAD_OFFICE' }],
    [WESTLANDS, { name: 'Westlands Branch', code: 'WESTLANDS' }],
    [KISUMU, { name: 'Kisumu', code: 'KISUMU' }],
  ],
  signedInAs = 'someone-else',
}: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: {
      permissions,
      permission_scopes: [
        ...permissions.map((code) =>
          tenantWide.includes(code)
            ? { code, scope: 'TENANT' }
            : { code, scope: 'BRANCH', branch_ids: heldAt },
        ),
        ...elsewhere.map((code) => ({ code, scope: 'BRANCH', branch_ids: heldAt })),
      ],
      user_id: signedInAs,
      branches: [],
    },
    context: { organization: { id: ORG, name: 'Greenfield' }, branch: selectedBranch },
  });
  if (userError) getUser.mockRejectedValue(userError);
  else getUser.mockResolvedValue({ id: FELIX, displayName: 'Felix Omondi', membershipStatus });
  if (rowsError) listUserBranchAssignments.mockRejectedValue(rowsError);
  else {
    // The platform pages them (BG-09): the page the URL asked for, past the end empty.
    listUserBranchAssignments.mockImplementation(
      (_userId: string, { page, size }: { page: number; size: number }) =>
        Promise.resolve({
          items: rows.slice(page * size, (page + 1) * size),
          page: {
            number: page,
            size,
            totalItems: rows.length,
            totalPages: Math.ceil(rows.length / size),
            hasNext: (page + 1) * size < rows.length,
            hasPrevious: page > 0,
          },
        }),
    );
  }
  if (activeError) listBranches.mockRejectedValue(activeError);
  else {
    listBranches.mockResolvedValue({
      items: activeBranches,
      page: {
        number: 0,
        size: 100,
        totalItems: activeBranches.length,
        totalPages: 1,
        hasNext: activeHasNext,
        hasPrevious: false,
      },
    });
  }
  getBranchIndex.mockResolvedValue(new Map(index));
}

const row = (n: number, branchId: string, assignmentType: string): Row => ({
  id: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  branchId,
  assignmentType,
  branchName: NAMES[branchId] ?? 'Unnamed',
  assignedAt: '2026-11-02T07:30:00Z',
});

type Query = Record<string, string | undefined>;
const renderPage = (userId = FELIX, query: Query = {}) =>
  UserBranchesPage({ params: Promise.resolve({ userId }), searchParams: Promise.resolve(query) });

async function show(userId = FELIX, query: Query = {}) {
  const element = await renderPage(userId, query);
  if (!element) throw new Error('The page rendered nothing');
  return renderWithProviders(element);
}

/** What `redirect()` was called with, once the page has thrown the mock's NEXT_REDIRECT. */
async function redirectedTo(query: Query): Promise<string | undefined> {
  await expect(renderPage(FELIX, query)).rejects.toThrow('NEXT_REDIRECT');
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

const alerts = () => [...document.querySelectorAll<HTMLElement>('.MuiAlert-root')];
/** The empty state's title and description, found through the card's own markup. */
const emptyState = () => {
  const title = screen.getByText(/^No (branch assignments|assignment at)/);
  return { title: title.textContent, description: title.nextElementSibling?.textContent };
};
const noteOf = (text: string): HTMLElement => {
  const note = screen.getByText(text).closest<HTMLElement>('.MuiAlert-root');
  if (!note) throw new Error(`"${text}" is not inside an Alert`);
  return note;
};
const dataRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
/** The Branch, Assignment type and Assigned cells of a data row (Actions only holds the revoke). */
const cellText = (tr: HTMLElement) =>
  within(tr)
    .getAllByRole('cell')
    .slice(0, 3)
    .map((cell) => cell.textContent);

async function openDrawer() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Assign branch' }));
  const drawer = await screen.findByRole('dialog', { name: 'Assign to a branch' });
  return { user, drawer, branch: within(drawer).getByRole('combobox', { name: /^Branch/ }) };
}

beforeEach(() => {
  vi.resetAllMocks();
  tableRows.length = 0;
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('UserBranchesPage: the record id', () => {
  it.each(['not-a-uuid', '../x', 'new', ''])(
    'answers not-found for %j before any backend read',
    async (id) => {
      setup();

      await expect(renderPage(id)).rejects.toThrow('NEXT_NOT_FOUND');

      expect(getUser).not.toHaveBeenCalled();
      expect(getCurrentContextProfile).not.toHaveBeenCalled();
      expect(listUserBranchAssignments).not.toHaveBeenCalled();
      expect(getBranchIndex).not.toHaveBeenCalled();
      expect(listBranches).not.toHaveBeenCalled();
    },
  );

  it('reads a valid id, in its lower-case form, from every service that takes it', async () => {
    setup({ rows: [row(1, WESTLANDS, 'HOME')] });

    await show(FELIX.toUpperCase());

    // Positive control for the cases above: a valid id does read, and the page renders.
    expect(getUser).toHaveBeenCalledWith(FELIX);
    expect(listUserBranchAssignments).toHaveBeenCalledWith(FELIX, { page: 0, size: 10 });
    expect(screen.getByRole('table', { name: 'Branch assignments' })).toBeInTheDocument();
  });

  it('renders nothing when the record itself failed (the layout shows that failure)', async () => {
    setup({ userError: new BackendApiError(404, { code: 'resource_not_found' }) });

    expect(await renderPage()).toBeNull();
  });
});

describe('UserBranchesPage: landmarks', () => {
  it('names the card and the table region differently, so no two landmarks share a name (axe landmark-unique)', async () => {
    setup({ rows: [row(1, WESTLANDS, 'HOME')] });

    await show();

    // `getByRole` throws on two matches, so each name is held by exactly one region.
    expect(screen.getByRole('region', { name: 'Branch assignments' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Branch assignments table' })).toBeVisible();
    // The table keeps its own name: it is not a landmark.
    expect(screen.getByRole('table', { name: 'Branch assignments' })).toBeInTheDocument();
  });
});

describe('UserBranchesPage: the rows', () => {
  // BG-09: the platform sorts (newest assigned first) and pages; the rows carry their branch names.
  it("lists the platform's page in its order, with the embedded names and dates", async () => {
    const rows = [
      { ...row(5, WESTLANDS, 'HOME'), assignedAt: '2026-11-15T03:35:00Z' },
      row(4, HEAD_OFFICE, 'VIEW'),
      { ...row(2, UNKNOWN_BRANCH, 'OPERATE'), branchName: 'Mombasa Road' },
    ];
    setup({ rows });

    await show();

    expect(dataRows().map(cellText)).toEqual([
      // Five and a half hours ahead of UTC: the organisation's zone, not the runner's.
      ['Westlands Branch', 'Home', '15 Nov 2026 · 09:05'],
      ['Head Office', 'View', '02 Nov 2026 · 13:00'],
      // A branch no index holds is named by its assignment all the same.
      ['Mombasa Road', 'Operate', '02 Nov 2026 · 13:00'],
    ]);
    expect(tableRows.at(-1)?.map((r) => r.assignmentId)).toEqual(rows.map((r) => r.id));
    expect(screen.getByRole('columnheader', { name: 'Assigned (Asia/Kolkata)' })).toBeVisible();
  });

  it('reads no branch index for a tenant-wide grant: the rows name their branches', async () => {
    setup({ rows: [row(1, WESTLANDS, 'HOME')] });

    await show();

    expect(screen.getByRole('table')).toHaveTextContent('Westlands Branch');
    expect(getBranchIndex).not.toHaveBeenCalled();
  });

  it('reads the page the URL asks for: page 2 of 25 holds the last 5', async () => {
    setup({
      rows: Array.from({ length: 25 }, (_, n) =>
        row(n + 1, n % 2 === 0 ? HEAD_OFFICE : WESTLANDS, n < 12 ? 'HOME' : 'OPERATE'),
      ),
    });

    await show(FELIX, { page: '2' });

    expect(listUserBranchAssignments).toHaveBeenCalledWith(FELIX, { page: 2, size: 10 });
    expect(dataRows()).toHaveLength(5);
    expect(screen.getByText('21–25 of 25')).toBeInTheDocument();
    // An in-range page is not redirected.
    expect(redirect).not.toHaveBeenCalled();
  });

  it('reads the page size from the URL', async () => {
    setup({ rows: Array.from({ length: 25 }, (_, n) => row(n + 1, HEAD_OFFICE, 'HOME')) });

    await show(FELIX, { size: '20' });

    expect(listUserBranchAssignments).toHaveBeenCalledWith(FELIX, { page: 0, size: 20 });
    expect(dataRows()).toHaveLength(20);
    expect(screen.getByText('1–20 of 25')).toBeInTheDocument();
  });

  it('redirects a page past the end to the last page, keeping the other URL params', async () => {
    setup({ rows: Array.from({ length: 25 }, (_, n) => row(n + 1, HEAD_OFFICE, 'HOME')) });

    expect(await redirectedTo({ page: '9', size: '10' })).toBe(
      `/admin/users/${FELIX}/branches?page=2&size=10`,
    );
  });

  it('redirects to the bare path, with no page param, when the last page is the first', async () => {
    setup({ rows: [row(1, HEAD_OFFICE, 'HOME')] });

    expect(await redirectedTo({ page: '7' })).toBe(`/admin/users/${FELIX}/branches`);
  });

  it('keeps the size when it redirects to the first page', async () => {
    setup({ rows: [row(1, HEAD_OFFICE, 'HOME')] });

    expect(await redirectedTo({ page: '7', size: '20' })).toBe(
      `/admin/users/${FELIX}/branches?size=20`,
    );
  });

  it('does not redirect an empty list asked for a later page', async () => {
    setup({ rows: [] });

    await show(FELIX, { page: '3' });

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByText('No branch assignments')).toBeInTheDocument();
  });

  it('shows the forbidden state for a 403 read, and still offers the assignment', async () => {
    setup({ rowsError: new BackendApiError(403, { code: 'forbidden' }) });

    await show();

    expect(screen.getByText("You don't have permission")).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: 'Assign branch' })).toBeInTheDocument();
  });

  it('shows the error state, with its reference, for any other read failure', async () => {
    setup({ rowsError: new BackendApiError(500, { requestId: 'req-1' }) });

    await show();

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Reference: req-1')).toBeInTheDocument();
    expect(screen.queryByText("You don't have permission")).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('forwards the organisation and the row to each revoke', async () => {
    const user = userEvent.setup();
    const assignment = row(1, WESTLANDS, 'HOME');
    setup({ rows: [assignment] });
    await show();

    await user.click(
      screen.getByRole('button', {
        name: "Revoke Felix Omondi's Home assignment at Westlands Branch",
      }),
    );

    const dialog = await screen.findByRole('alertdialog', {
      name: "Revoke Felix Omondi's assignment at Westlands Branch?",
    });
    expectScoped(dialog);
    expect(hidden('assignmentId', dialog)).toBe(assignment.id);
  });

  it('warns before you revoke your own branch assignment on your own record (BG-35)', async () => {
    const user = userEvent.setup();
    setup({ rows: [row(1, WESTLANDS, 'HOME')], signedInAs: FELIX });
    await show();

    await user.click(
      screen.getByRole('button', {
        name: "Revoke Felix Omondi's Home assignment at Westlands Branch",
      }),
    );

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Revoke your own Westlands Branch assignment?',
    });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      "This is your own access. If Westlands Branch is your selected branch, you'll be asked to choose your context again.",
    );
  });

  it('offers a revoke only with user.revoke_branch', async () => {
    setup({
      permissions: ALL_CODES.filter((code) => code !== 'user.revoke_branch'),
      rows: [row(1, WESTLANDS, 'HOME')],
    });

    await show();

    expect(screen.getByRole('table')).toHaveTextContent('Westlands Branch');
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Revoke/ })).toBeNull();
  });

  it('offers a revoke with user.revoke_branch (the control for the case above)', async () => {
    setup({ rows: [row(1, WESTLANDS, 'HOME')] });

    await show();

    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Revoke/ })).toHaveLength(1);
  });

  // BG-03: a revoke held only at the selected branch reaches that branch's rows alone.
  // BG-03: the route's gate reads the selected context, the service the row's branch, whichever
  // branch is selected.
  it('offers a branch-scoped revoke on the rows at every branch its grant is held at', async () => {
    setup({
      tenantWide: scopedTo('user.revoke_branch'),
      selectedBranch: { id: WESTLANDS, name: 'Westlands Branch' },
      heldAt: [WESTLANDS, KISUMU],
      rows: [row(1, WESTLANDS, 'HOME'), row(2, HEAD_OFFICE, 'OPERATE'), row(3, KISUMU, 'VIEW')],
    });

    await show();

    // In the platform's order, as listed.
    expect(screen.getAllByRole('button', { name: /^Revoke/ })).toEqual([
      screen.getByRole('button', { name: /Home assignment at Westlands Branch$/ }),
      screen.getByRole('button', { name: /View assignment at Kisumu$/ }),
    ]);
  });

  it('offers a branch-scoped revoke nowhere at All branches', async () => {
    setup({
      permissions: scopedTo('user.revoke_branch'),
      tenantWide: scopedTo('user.revoke_branch'),
      rows: [row(1, WESTLANDS, 'HOME')],
    });

    await show();

    expect(screen.queryByRole('button', { name: /^Revoke/ })).toBeNull();
  });
});

describe('UserBranchesPage: what the list says about itself', () => {
  it('shows no note for a tenant-wide view, whichever branch is selected', async () => {
    setup({
      rows: [row(1, WESTLANDS, 'HOME')],
      selectedBranch: { id: HEAD_OFFICE, name: 'Head Office' },
    });

    await show();

    expect(screen.getByRole('table')).toBeInTheDocument(); // the page did render
    expect(alerts()).toHaveLength(0);
  });

  // BG-03: a search by user lists only the branches a branch-scoped view covers.
  it('says a branch-scoped view sees only its branches, as a note, not an alert (2)', async () => {
    setup({ tenantWide: scopedTo('branch_assignment.view'), rows: [row(1, HEAD_OFFICE, 'HOME')] });

    await show();

    expect(alerts().map((alert) => alert.textContent)).toEqual([SCOPED_ASSIGNMENTS_NOTE]);
    expect(noteOf(SCOPED_ASSIGNMENTS_NOTE)).toHaveAttribute('role', 'note');
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  // BG-03: the search by user answers a branch grant at All branches too, which the layout's tab
  // offers it (`canAnywhere`).
  it('lists a branch grant’s rows at All branches, under the same note', async () => {
    setup({
      permissions: scopedTo('branch_assignment.view'),
      elsewhere: ['branch_assignment.view'],
      heldAt: [HEAD_OFFICE],
      rows: [row(1, HEAD_OFFICE, 'HOME')],
    });

    await show();

    expect(listUserBranchAssignments).toHaveBeenCalledTimes(1);
    expect(within(screen.getByRole('table')).getByText('Head Office')).toBeInTheDocument();
    expect(alerts().map((alert) => alert.textContent)).toEqual([SCOPED_ASSIGNMENTS_NOTE]);
  });

  it('leaves room under the note, so it does not touch the table header (M2)', async () => {
    setup({ tenantWide: scopedTo('branch_assignment.view'), rows: [row(1, HEAD_OFFICE, 'HOME')] });

    await show();

    // Three steps of the theme's spacing under the note, as above it. jsdom 31 resolves the
    // computed padding, so compare it with what three steps resolve to.
    const step3 = resolvedStyle('paddingTop', 'calc(3 * var(--finaxis-spacing))');
    const notes = alerts()[0]?.parentElement;
    if (!notes) throw new Error('Notes container not found');
    expect(getComputedStyle(notes).paddingTop).toBe(step3);
    expect(getComputedStyle(notes).paddingBottom).toBe(step3);
  });
});

describe('UserBranchesPage: the empty state says only what could be seen (1c)', () => {
  it('claims no assignments only when the whole list was visible: a tenant-wide view', async () => {
    setup({ selectedBranch: { id: HEAD_OFFICE, name: 'Head Office' } });

    await show();

    expect(emptyState()).toEqual({ title: 'No branch assignments', description: OFFER });
  });

  it('says so, with no offer, when the whole list was visible and nothing can be assigned', async () => {
    setup({ membershipStatus: 'REVOKED' });

    await show();

    expect(emptyState()).toEqual({ title: 'No branch assignments', description: NO_ROWS });
  });

  it('says a branch-scoped view found none at its branches, and that they may be elsewhere', async () => {
    // The assignment's own view is branch-scoped too, so it assigns only at a selected branch.
    setup({ tenantWide: scopedTo('branch_assignment.view') });

    await show();

    expect(emptyState()).toEqual({
      title: 'No assignment at branches you can view',
      description: OTHER_BRANCHES,
    });
    expect(screen.queryByText('No branch assignments')).toBeNull();
  });

  it('shows no empty state at all while a row is listed (the control for the cases above)', async () => {
    setup({ tenantWide: scopedTo('branch_assignment.view'), rows: [row(1, HEAD_OFFICE, 'HOME')] });

    await show();

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByText(/^No (branch assignments|assignment at)/)).toBeNull();
  });
});

describe('UserBranchesPage: your own record (#342)', () => {
  it('shows Assign branch disabled with the reason, and reads no branch list', async () => {
    setup({ signedInAs: FELIX });
    await show();

    const button = screen.getByRole('button', { name: 'Assign branch' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(OWN_ACCESS);
    expect(listBranches).not.toHaveBeenCalled();
  });

  it('offers it on your own record with user.assign_self tenant-wide (the control)', async () => {
    setup({ signedInAs: FELIX, permissions: [...ALL_CODES, 'user.assign_self'] });
    await show();

    expect(screen.getByRole('button', { name: 'Assign branch' })).toBeEnabled();
    expect(screen.queryByText(OWN_ACCESS)).toBeNull();
  });
});

describe('UserBranchesPage: assigning a branch', () => {
  it('offers every ACTIVE branch, read as one bounded page, in a drawer scoped to the user and organisation', async () => {
    setup();
    await show();

    const { user, drawer, branch } = await openDrawer();

    expect(listBranches).toHaveBeenCalledTimes(1);
    expect(listBranches).toHaveBeenCalledWith({
      status: 'ACTIVE',
      sort: { by: 'branchName', dir: 'ASC' },
      page: 0,
      size: 100,
    });
    expectScoped(drawer);
    expect(hidden('userId', drawer)).toBe(FELIX);
    expect(drawer).toHaveTextContent('Give Felix Omondi access to a branch.');
    expect(branch).toHaveAccessibleDescription('');
    await user.click(branch);
    expect(
      within(await screen.findByRole('listbox'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Head Office (HEAD_OFFICE)', 'Westlands Branch (WESTLANDS)']);
  });

  it('says the branch list stops at 100 when the branch read has more', async () => {
    setup({ activeHasNext: true });
    await show();

    const { branch } = await openDrawer();

    expect(branch).toHaveAccessibleDescription(TRUNCATED_NOTE);
  });

  it("takes that note from the branch read, never from the assignments' own paging", async () => {
    setup({
      activeHasNext: false,
      rows: Array.from({ length: 25 }, (_, n) => row(n + 1, HEAD_OFFICE, 'HOME')),
    });
    await show();

    const { branch } = await openDrawer();

    expect(branch).toHaveAccessibleDescription('');
  });

  it('offers every ACTIVE branch to a tenant-wide grant, whichever branch is selected (BG-03)', async () => {
    setup({ selectedBranch: { id: HEAD_OFFICE, name: 'Head Office' } });
    await show();

    const { user, branch } = await openDrawer();

    expect(listBranches).toHaveBeenCalledTimes(1);
    await user.click(branch);
    expect(within(await screen.findByRole('listbox')).getAllByRole('option')).toHaveLength(2);
  });

  // A grant held only at the selected branch assigns there alone.
  it('offers a branch-scoped grant only the selected branch, labelled with its code and already chosen, without reading the list', async () => {
    setup({
      tenantWide: scopedTo('user.assign_branch'),
      selectedBranch: { id: HEAD_OFFICE, name: 'Head Office' },
      activeHasNext: true,
    });
    await show();

    const { drawer, branch } = await openDrawer();

    expect(listBranches).not.toHaveBeenCalled();
    expect(hidden('branchId', drawer)).toBe(HEAD_OFFICE);
    expect(branch).toHaveTextContent('Head Office (HEAD_OFFICE)');
    // No list was read, so there is nothing to say stops at 100.
    expect(branch).toHaveAccessibleDescription('');
  });

  it('offers a branch-scoped grant every branch it is held at, whichever is selected', async () => {
    setup({
      tenantWide: scopedTo('user.assign_branch'),
      selectedBranch: { id: WESTLANDS, name: 'Westlands Branch' },
      heldAt: [KISUMU, HEAD_OFFICE],
    });
    await show();

    const { user, branch } = await openDrawer();
    await user.click(branch);

    expect(listBranches).not.toHaveBeenCalled();
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Head Office (HEAD_OFFICE)',
      'Kisumu (KISUMU)',
    ]);
  });

  it("labels a branch the index doesn't know by its short id", async () => {
    setup({
      tenantWide: scopedTo('user.assign_branch'),
      selectedBranch: { id: HEAD_OFFICE, name: 'Head Office' },
      index: [],
    });
    await show();

    const { branch } = await openDrawer();

    expect(branch).toHaveTextContent(/^22222222$/);
  });

  // BG-03: the ACTIVE list is `GET /branches`' answer, only the branches `branch.view` covers.
  it('says a tenant-wide grant lists only the branches a branch-scoped branch.view covers', async () => {
    setup({ tenantWide: scopedTo('branch.view'), selectedBranch: { id: WESTLANDS, name: 'W' } });
    await show();

    const { branch } = await openDrawer();

    expect(branch).toHaveAccessibleDescription(SCOPED_BRANCHES_NOTE);
  });

  it.each([
    ['a REVOKED membership', { membershipStatus: 'REVOKED' }],
    ['no user.assign_branch', { permissions: ALL_CODES.filter((c) => c !== 'user.assign_branch') }],
    ['no branch.view', { permissions: ALL_CODES.filter((c) => c !== 'branch.view') }],
  ] as [string, Setup][])(
    'offers no assignment, and reads no branch list, with %s',
    async (_label, overrides) => {
      setup(overrides);

      await show();

      expect(screen.getByText(DESCRIPTION)).toBeInTheDocument(); // the page did render
      expect(screen.queryByRole('button', { name: 'Assign branch' })).toBeNull();
      expect(listBranches).not.toHaveBeenCalled();
      expect(screen.getByText(NO_ROWS)).toBeInTheDocument();
      expect(screen.queryByText(OFFER)).toBeNull();
    },
  );

  // Without the view the platform refuses the read, too.
  it('offers no assignment, and reads no branch list, with no branch_assignment.view', async () => {
    setup({
      permissions: ALL_CODES.filter((c) => c !== 'branch_assignment.view'),
      rowsError: new BackendApiError(403, { code: 'forbidden' }),
    });

    await show();

    expect(screen.getByText(DESCRIPTION)).toBeInTheDocument(); // the page did render
    expect(screen.queryByRole('button', { name: 'Assign branch' })).toBeNull();
    expect(listBranches).not.toHaveBeenCalled();
  });

  it('offers the assignment, and says so on an empty list, with every code and an ACTIVE membership (the control for the cases above)', async () => {
    setup();

    await show();

    expect(screen.getByRole('button', { name: 'Assign branch' })).toBeInTheDocument();
    expect(screen.getByText(OFFER)).toBeInTheDocument();
    expect(screen.queryByText(NO_ROWS)).toBeNull();
  });

  it("says so, and offers nothing, when the branch read failed, without promising an assignment it can't offer", async () => {
    setup({ activeError: new BackendApiError(500, { requestId: 'req-2' }) });

    await show();

    expect(screen.getByText(`${DESCRIPTION} ${UNAVAILABLE}`)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign branch' })).toBeNull();
    expect(screen.getByText(NO_ROWS)).toBeInTheDocument();
    expect(screen.queryByText(OFFER)).toBeNull();
  });

  it('offers nothing, and does not blame a failed read, when no branch is ACTIVE', async () => {
    setup({ activeBranches: [] });

    await show();

    expect(screen.getByText(DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByText(UNAVAILABLE, { exact: false })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Assign branch' })).toBeNull();
    expect(screen.getByText(NO_ROWS)).toBeInTheDocument();
  });
});
