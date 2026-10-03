import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import {
  UserBranchAssignmentsTable,
  type UserBranchAssignmentRow,
} from './user-branch-assignments-table';

const { revokeBranchAssignment } = vi.hoisted(() => ({ revokeBranchAssignment: vi.fn() }));
vi.mock('@/modules/administration/branches/branch-actions', () => ({
  assignBranchUser: vi.fn(),
  revokeBranchAssignment: (...args: unknown[]) => revokeBranchAssignment(...args) as unknown,
}));

// vitest.config.ts resets no mocks, so each case must start with a clean call count.
beforeEach(() => {
  revokeBranchAssignment.mockReset();
});

const HOME_ASSIGNMENT = '10000000-0000-4000-8000-000000000207';
const OPERATE_ASSIGNMENT = '10000000-0000-4000-8000-0000000002a1';
const ORG = '11111111-1111-4111-8111-111111111111';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const hidden = (name: string, root: ParentNode) =>
  root.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;

/** Rule 6: every confirmation carries the rendered organisation, a minted key and its row's
 * assignment, or the cross-tab guard and the retry's replay silently stop working. */
function expectScoped(root: ParentNode, assignmentId: string) {
  expect(hidden('contextOrganisationId', root)).toBe(ORG);
  expect(hidden('idempotencyKey', root)).toMatch(UUID);
  expect(hidden('assignmentId', root)).toBe(assignmentId);
}

const westlandsHome: UserBranchAssignmentRow = {
  assignmentId: HOME_ASSIGNMENT,
  branchName: 'Westlands Branch',
  branchCode: 'WESTLANDS',
  assignmentType: 'HOME',
};
const headOfficeOperate: UserBranchAssignmentRow = {
  assignmentId: OPERATE_ASSIGNMENT,
  branchName: 'Head Office',
  branchCode: 'HEAD_OFFICE',
  assignmentType: 'OPERATE',
};

interface Overrides {
  rows?: readonly UserBranchAssignmentRow[];
  canRevoke?: boolean;
}

const renderTable = ({
  rows = [westlandsHome, headOfficeOperate],
  canRevoke = true,
}: Overrides = {}) =>
  renderWithProviders(
    <UserBranchAssignmentsTable
      rows={rows}
      userName="Felix Omondi"
      canRevoke={canRevoke}
      contextOrganisationId={ORG}
    />,
  );

/** The data row whose Branch cell names `branchName`. */
function rowOf(branchName: string): HTMLElement {
  const row = screen
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByText(branchName));
  if (!row) throw new Error(`No row for ${branchName}`);
  return row;
}

describe('UserBranchAssignmentsTable', () => {
  it('lists each branch with its code and assignment type under their column headers', () => {
    renderTable();

    const table = screen.getByRole('table', { name: 'Branch assignments' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Branch', 'Assignment type', 'Actions']);
    // Keyboard-scrollable at 375 px even when no row holds a button (07's history-table rule).
    expect(screen.getByRole('region', { name: 'Branch assignments' })).toHaveAttribute(
      'tabindex',
      '0',
    );
    const [westlandsBranch, westlandsType] = within(rowOf('Westlands Branch')).getAllByRole('cell');
    expect(westlandsBranch).toHaveTextContent('Westlands Branch');
    expect(westlandsBranch).toHaveTextContent('WESTLANDS');
    // The type is worded, never the raw HOME.
    expect(westlandsType).toHaveTextContent(/^Home$/);
    const [headOfficeBranch, headOfficeType] = within(rowOf('Head Office')).getAllByRole('cell');
    expect(headOfficeBranch).toHaveTextContent('HEAD_OFFICE');
    expect(headOfficeType).toHaveTextContent(/^Operate$/);
  });

  it('shows the branch name alone when no code is known', () => {
    renderTable({ rows: [{ ...westlandsHome, branchName: '44444444', branchCode: null }] });

    expect(within(rowOf('44444444')).getAllByRole('cell')[0]).toHaveTextContent(/^44444444$/);
  });

  it('names each revoke by type and branch', () => {
    renderTable();

    // A user's rows differ by branch (and a branch can hold two types), so the name carries both
    // (WCAG 2.4.6).
    expect(
      within(rowOf('Westlands Branch')).getByRole('button', {
        name: "Revoke Felix Omondi's Home assignment at Westlands Branch",
      }),
    ).toBeInTheDocument();
    expect(
      within(rowOf('Head Office')).getByRole('button', {
        name: "Revoke Felix Omondi's Operate assignment at Head Office",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Revoke/ })).toHaveLength(2);
  });

  it('forwards the organisation and the assignment to the revoke (I2)', async () => {
    const user = userEvent.setup();
    revokeBranchAssignment.mockResolvedValueOnce({ ok: true });
    renderTable();

    await user.click(
      screen.getByRole('button', {
        name: "Revoke Felix Omondi's Home assignment at Westlands Branch",
      }),
    );
    const dialog = screen.getByRole('alertdialog', {
      name: "Revoke Felix Omondi's assignment at Westlands Branch?",
    });
    expect(dialog).toHaveTextContent(
      'Felix Omondi loses the Home assignment at Westlands Branch immediately.',
    );
    expectScoped(dialog, HOME_ASSIGNMENT);
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(revokeBranchAssignment).toHaveBeenCalledTimes(1);
    });
    const sent = revokeBranchAssignment.mock.calls[0]?.[1] as FormData;
    expect(sent.get('assignmentId')).toBe(HOME_ASSIGNMENT);
    expect(sent.get('contextOrganisationId')).toBe(ORG);
    expect(sent.get('idempotencyKey')).toMatch(UUID);
  });

  it("carries the other row's own assignment, not the first row's", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(
      screen.getByRole('button', {
        name: "Revoke Felix Omondi's Operate assignment at Head Office",
      }),
    );
    const dialog = screen.getByRole('alertdialog', {
      name: "Revoke Felix Omondi's assignment at Head Office?",
    });
    expect(dialog).toHaveTextContent(
      'Felix Omondi loses the Operate assignment at Head Office immediately.',
    );
    expectScoped(dialog, OPERATE_ASSIGNMENT);
  });

  it('keeps the dialog and retries a failed revoke with the same key and organisation', async () => {
    const user = userEvent.setup();
    revokeBranchAssignment
      .mockResolvedValueOnce({
        ok: false,
        formError: "This assignment couldn't be revoked.",
        fieldErrors: {},
        code: 'conflict',
        requestId: null,
      })
      .mockResolvedValueOnce({ ok: true });
    renderTable();

    await user.click(
      screen.getByRole('button', {
        name: "Revoke Felix Omondi's Home assignment at Westlands Branch",
      }),
    );
    const dialog = screen.getByRole('alertdialog', {
      name: "Revoke Felix Omondi's assignment at Westlands Branch?",
    });
    expectScoped(dialog, HOME_ASSIGNMENT);
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "This assignment couldn't be revoked.",
    );
    const first = revokeBranchAssignment.mock.calls[0]?.[1] as FormData;
    const sentKey = first.get('idempotencyKey');
    expect(sentKey).toMatch(UUID);
    expect(first.get('contextOrganisationId')).toBe(ORG);
    // The dialog still holds that key (a remount would mint a new one) ...
    expectScoped(dialog, HOME_ASSIGNMENT);
    expect(hidden('idempotencyKey', dialog)).toBe(sentKey);

    // ... so the retry replays the same write, with the organisation again.
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => {
      expect(revokeBranchAssignment).toHaveBeenCalledTimes(2);
    });
    const retry = revokeBranchAssignment.mock.calls[1]?.[1] as FormData;
    expect(retry.get('idempotencyKey')).toBe(sentKey);
    expect(retry.get('contextOrganisationId')).toBe(ORG);
    expect(retry.get('assignmentId')).toBe(HOME_ASSIGNMENT);
  });

  it('has no Actions column without canRevoke', () => {
    renderTable({ canRevoke: false });

    expect(screen.getByRole('table', { name: 'Branch assignments' })).toHaveTextContent(
      'Westlands Branch',
    );
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Revoke/ })).toBeNull();
    expect(within(rowOf('Westlands Branch')).getAllByRole('cell')).toHaveLength(2);
  });
});
