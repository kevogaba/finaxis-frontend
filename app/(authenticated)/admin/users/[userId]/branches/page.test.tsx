import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import type { UserBranchAssignmentsTable } from '@/modules/administration/users/components/user-branch-assignments-table';
import { PARTIAL_SCAN_NOTE } from '@/modules/administration/users/user-rules';
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
vi.mock('@/components/context/switch-to-all-branches-button', () => ({
  SwitchToAllBranchesButton: () => <button type="button">Switch to All branches</button>,
}));
// The real table, recording the rows the page hands it: a full tie in the sort is invisible in the
// rendered cells.
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
const OTHER_BRANCHES = 'They may be assigned to other branches.';
const SWITCH_TO_SEE = 'Switch to All branches to see them.';
const BEYOND_CEILING =
  'Only the first 500 branch assignments were checked, so they may be assigned beyond them.';
const contextNote = (name: string) =>
  `Only ${name} is visible with a branch selected. Switch to All branches to see this user's other branch assignments.`;
const singleBranchNote = (name: string) =>
  `Only ${name} is visible: your account is assigned to this branch only, so this user's other branch assignments can't be shown.`;

interface Branch {
  id: string;
  status: string;
}
interface Row {
  id: string;
  branchId: string;
  assignmentType: string;
}
interface Setup {
  permissions?: string[];
  selectedBranch?: { id: string; name: string } | null;
  profileBranches?: Branch[];
  membershipStatus?: string;
  rows?: Row[];
  truncated?: boolean;
  scanError?: Error;
  userError?: Error;
  activeBranches?: { id: string; branchName: string; branchCode: string }[];
  activeHasNext?: boolean;
  activeError?: Error;
  index?: [string, { name: string; code: string }][];
}

/** Programs every service the page reads. A test names only what it varies. */
function setup({
  permissions = ALL_CODES,
  selectedBranch = null,
  profileBranches = [
    { id: HEAD_OFFICE, status: 'ACTIVE' },
    { id: WESTLANDS, status: 'ACTIVE' },
  ],
  membershipStatus = 'ACTIVE',
  rows = [],
  truncated = false,
  scanError,
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
}: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { permissions, user_id: 'someone-else', branches: profileBranches },
    context: { organization: { id: ORG, name: 'Greenfield' }, branch: selectedBranch },
  });
  if (userError) getUser.mockRejectedValue(userError);
  else getUser.mockResolvedValue({ id: FELIX, displayName: 'Felix Omondi', membershipStatus });
  if (scanError) listUserBranchAssignments.mockRejectedValue(scanError);
  else listUserBranchAssignments.mockResolvedValue({ items: rows, truncated });
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
const switchButton = () => screen.queryByRole('button', { name: 'Switch to All branches' });
const dataRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
/** The Branch and Assignment type cells of a data row (the Actions cell only holds the revoke). */
const cellText = (tr: HTMLElement) =>
  within(tr)
    .getAllByRole('cell')
    .slice(0, 2)
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
    expect(listUserBranchAssignments).toHaveBeenCalledWith(FELIX);
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
  it('sorts by branch name, then assignment type, naming an unknown branch by its short id', async () => {
    setup({
      rows: [
        row(5, WESTLANDS, 'HOME'),
        row(4, HEAD_OFFICE, 'VIEW'),
        row(3, HEAD_OFFICE, 'HOME'),
        row(2, UNKNOWN_BRANCH, 'OPERATE'),
        row(1, KISUMU, 'APPROVE'),
      ],
    });

    await show();

    expect(dataRows().map(cellText)).toEqual([
      // An unknown branch shows its short id and no code; digits sort before letters.
      ['99999999', 'Operate'],
      ['Head OfficeHEAD_OFFICE', 'Home'],
      ['Head OfficeHEAD_OFFICE', 'View'],
      ['KisumuKISUMU', 'Approve'],
      ['Westlands BranchWESTLANDS', 'Home'],
    ]);
  });

  it('orders one branch by assignment type even when the assignment ids say otherwise', async () => {
    setup({
      rows: [
        row(1, HEAD_OFFICE, 'VIEW'),
        row(2, HEAD_OFFICE, 'HOME'),
        row(3, HEAD_OFFICE, 'APPROVE'),
      ],
    });

    await show();

    expect(dataRows().map((tr) => cellText(tr)[1])).toEqual(['Approve', 'Home', 'View']);
  });

  it('breaks a full tie by assignment id, so the scan order never moves a row between pages', async () => {
    const [a, b, c] = [
      row(7, HEAD_OFFICE, 'HOME'),
      row(8, HEAD_OFFICE, 'HOME'),
      row(9, HEAD_OFFICE, 'HOME'),
    ];
    setup({ rows: [c, a, b] });

    await show();

    expect(tableRows.at(-1)?.map((r) => r.assignmentId)).toEqual([a.id, b.id, c.id]);
  });

  it('pages the sorted rows by the URL: page 2 of 25 holds the last 5', async () => {
    setup({
      rows: Array.from({ length: 25 }, (_, n) =>
        row(n + 1, n % 2 === 0 ? HEAD_OFFICE : WESTLANDS, n < 12 ? 'HOME' : 'OPERATE'),
      ),
    });

    await show(FELIX, { page: '2' });

    expect(dataRows()).toHaveLength(5);
    expect(screen.getByText('21–25 of 25')).toBeInTheDocument();
    // An in-range page is not redirected.
    expect(redirect).not.toHaveBeenCalled();
  });

  it('reads the page size from the URL', async () => {
    setup({ rows: Array.from({ length: 25 }, (_, n) => row(n + 1, HEAD_OFFICE, 'HOME')) });

    await show(FELIX, { size: '20' });

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

  it('shows the forbidden state for a 403 scan, and still offers the assignment', async () => {
    setup({ scanError: new BackendApiError(403, { code: 'forbidden' }) });

    await show();

    expect(screen.getByText("You don't have permission")).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: 'Assign branch' })).toBeInTheDocument();
  });

  it('shows the error state, with its reference, for any other scan failure', async () => {
    setup({ scanError: new BackendApiError(500, { requestId: 'req-1' }) });

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
});

describe('UserBranchesPage: what the list says about itself', () => {
  it('shows no note at institution level when the scan was complete', async () => {
    setup({ rows: [row(1, WESTLANDS, 'HOME')] });

    await show();

    expect(screen.getByRole('table')).toBeInTheDocument(); // the page did render
    expect(alerts()).toHaveLength(0);
    expect(switchButton()).toBeNull();
  });

  it('shows only the partial-scan note at institution level when the scan was capped, even with no row', async () => {
    setup({ rows: [], truncated: true });

    await show();

    expect(alerts().map((alert) => alert.textContent)).toEqual([PARTIAL_SCAN_NOTE]);
    // Not "No branch assignments": under a note saying the list may be incomplete, that is a guess.
    expect(emptyState().title).toBe('No branch assignments found');
    expect(switchButton()).toBeNull();
  });

  it('shows the branch note with the switch, then the partial-scan note, in a branch context with a capped scan', async () => {
    setup({ selectedBranch: { id: HEAD_OFFICE, name: 'Head Office' }, truncated: true });

    await show();

    expect(alerts()).toHaveLength(2);
    const context = noteOf(contextNote('Head Office'));
    const partial = noteOf(PARTIAL_SCAN_NOTE);
    expect(context).not.toBe(partial);
    expect(
      context.compareDocumentPosition(partial) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The switch is part of the note's message, not its `action` slot, and only in the first note.
    const button = within(context).getByRole('button', { name: 'Switch to All branches' });
    expect(button.closest('.MuiAlert-message')).not.toBeNull();
    expect(button.closest('.MuiAlert-action')).toBeNull();
    expect(within(partial).queryByRole('button')).toBeNull();
  });

  it('marks both static notes as notes, not alerts, so a screen reader is not interrupted on every visit (2)', async () => {
    setup({ selectedBranch: { id: HEAD_OFFICE, name: 'Head Office' }, truncated: true });

    await show();

    expect(alerts()).toHaveLength(2);
    for (const alert of alerts()) expect(alert).toHaveAttribute('role', 'note');
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    expect(screen.getAllByRole('note')).toHaveLength(2);
  });

  it('keeps the switch at the left of its note, not stretched across it (M1)', async () => {
    setup({ selectedBranch: { id: HEAD_OFFICE, name: 'Head Office' } });

    await show();

    // The shared button lays itself out for a centred state; its wrapper here hugs its content.
    expect(switchButton()?.parentElement).toHaveStyle({ width: 'fit-content' });
  });

  it('leaves room under the last note, so it does not touch the table header (M2)', async () => {
    setup({
      selectedBranch: { id: HEAD_OFFICE, name: 'Head Office' },
      truncated: true,
      rows: [row(1, HEAD_OFFICE, 'HOME')],
    });

    await show();

    // Three steps of the theme's spacing under the notes, as above them.
    const step3 = 'calc(3 * var(--finaxis-spacing))';
    const notes = alerts()[0]?.parentElement;
    expect(notes).toHaveStyle({ paddingTop: step3, paddingBottom: step3 });
  });

  it('shows only the branch note in a branch context when the scan was complete', async () => {
    setup({ selectedBranch: { id: HEAD_OFFICE, name: 'Head Office' } });

    await show();

    expect(alerts().map((alert) => alert.querySelector('.MuiAlert-message')?.textContent)).toEqual([
      `${contextNote('Head Office')}Switch to All branches`,
    ]);
    expect(screen.queryByText(PARTIAL_SCAN_NOTE)).toBeNull();
  });

  it("offers no switch when the account has one ACTIVE branch (a SUSPENDED one doesn't count) and says why", async () => {
    setup({
      selectedBranch: { id: HEAD_OFFICE, name: 'Head Office' },
      profileBranches: [
        { id: HEAD_OFFICE, status: 'ACTIVE' },
        { id: WESTLANDS, status: 'SUSPENDED' },
      ],
    });

    await show();

    expect(noteOf(singleBranchNote('Head Office'))).toBeInTheDocument();
    expect(screen.queryByText(contextNote('Head Office'))).toBeNull();
    expect(switchButton()).toBeNull();
  });

  it('offers the switch when the account has two ACTIVE branches (the control for the case above)', async () => {
    setup({
      selectedBranch: { id: HEAD_OFFICE, name: 'Head Office' },
      profileBranches: [
        { id: HEAD_OFFICE, status: 'ACTIVE' },
        { id: WESTLANDS, status: 'ACTIVE' },
        { id: KISUMU, status: 'SUSPENDED' },
      ],
    });

    await show();

    expect(switchButton()).toBeInTheDocument();
    expect(screen.queryByText(singleBranchNote('Head Office'))).toBeNull();
  });
});

describe('UserBranchesPage: the empty state says only what could be seen (1c)', () => {
  const HEAD = { id: HEAD_OFFICE, name: 'Head Office' };

  it('claims no assignments only when the whole list was visible: no branch selected, scan complete', async () => {
    setup();

    await show();

    expect(emptyState()).toEqual({ title: 'No branch assignments', description: OFFER });
  });

  it('says so, with no offer, when the whole list was visible and nothing can be assigned', async () => {
    setup({ membershipStatus: 'REVOKED' });

    await show();

    expect(emptyState()).toEqual({ title: 'No branch assignments', description: NO_ROWS });
  });

  it('names the selected branch, and says they may be elsewhere with the way to see them', async () => {
    setup({ selectedBranch: HEAD });

    await show();

    expect(emptyState()).toEqual({
      title: 'No assignment at Head Office',
      description: `${OTHER_BRANCHES} ${SWITCH_TO_SEE} ${OFFER}`,
    });
    expect(screen.queryByText('No branch assignments')).toBeNull();
  });

  it('leaves the switch out of the empty state when the account cannot switch', async () => {
    setup({
      selectedBranch: HEAD,
      profileBranches: [
        { id: HEAD_OFFICE, status: 'ACTIVE' },
        { id: WESTLANDS, status: 'SUSPENDED' },
      ],
    });

    await show();

    expect(emptyState()).toEqual({
      title: 'No assignment at Head Office',
      description: `${OTHER_BRANCHES} ${OFFER}`,
    });
  });

  it('keeps the offer out when nothing can be assigned, in a branch context', async () => {
    setup({ selectedBranch: HEAD, membershipStatus: 'REVOKED' });

    await show();

    expect(emptyState()).toEqual({
      title: 'No assignment at Head Office',
      description: `${OTHER_BRANCHES} ${SWITCH_TO_SEE}`,
    });
  });

  it('says a capped scan found none, and that they may be beyond what was checked', async () => {
    setup({ truncated: true });

    await show();

    expect(emptyState()).toEqual({
      title: 'No branch assignments found',
      description: `${BEYOND_CEILING} ${OFFER}`,
    });
    expect(screen.queryByText(NO_ROWS)).toBeNull();
  });

  it('keeps the offer out of a capped scan when nothing can be assigned', async () => {
    setup({ truncated: true, membershipStatus: 'REVOKED' });

    await show();

    expect(emptyState()).toEqual({
      title: 'No branch assignments found',
      description: BEYOND_CEILING,
    });
  });

  it('never claims "no assignment at" a branch whose list was capped: it says both things', async () => {
    setup({ selectedBranch: HEAD, truncated: true });

    await show();

    expect(emptyState()).toEqual({
      title: 'No branch assignments found',
      description: `${BEYOND_CEILING} ${OTHER_BRANCHES} ${SWITCH_TO_SEE} ${OFFER}`,
    });
  });

  it('shows no empty state at all while a row is listed (the control for the cases above)', async () => {
    setup({ selectedBranch: HEAD, truncated: true, rows: [row(1, HEAD_OFFICE, 'HOME')] });

    await show();

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByText(/^No (branch assignments|assignment at)/)).toBeNull();
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

  it("takes that note from the branch read, never from the scan's own ceiling", async () => {
    setup({ activeHasNext: false, truncated: true });
    await show();

    const { branch } = await openDrawer();

    expect(branch).toHaveAccessibleDescription('');
  });

  it('offers only the selected branch, labelled with its code and already chosen, without reading the list', async () => {
    setup({ selectedBranch: { id: HEAD_OFFICE, name: 'Head Office' }, activeHasNext: true });
    await show();

    const { drawer, branch } = await openDrawer();

    expect(listBranches).not.toHaveBeenCalled();
    expect(hidden('branchId', drawer)).toBe(HEAD_OFFICE);
    expect(branch).toHaveTextContent('Head Office (HEAD_OFFICE)');
    // No list was read, so there is nothing to say stops at 100.
    expect(branch).toHaveAccessibleDescription('');
  });

  it("labels the selected branch by its name alone when the branch index doesn't know it", async () => {
    setup({ selectedBranch: { id: HEAD_OFFICE, name: 'Head Office' }, index: [] });
    await show();

    const { branch } = await openDrawer();

    expect(branch).toHaveTextContent(/^Head Office$/);
  });

  it.each([
    ['a REVOKED membership', { membershipStatus: 'REVOKED' }],
    ['no user.assign_branch', { permissions: ALL_CODES.filter((c) => c !== 'user.assign_branch') }],
    ['no branch.view', { permissions: ALL_CODES.filter((c) => c !== 'branch.view') }],
    [
      'no branch_assignment.view',
      { permissions: ALL_CODES.filter((c) => c !== 'branch_assignment.view') },
    ],
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
