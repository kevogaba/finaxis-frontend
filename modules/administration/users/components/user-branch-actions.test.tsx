import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { AssignUserBranchButton } from './user-branch-actions';

const { assignBranchUser } = vi.hoisted(() => ({ assignBranchUser: vi.fn() }));
vi.mock('@/modules/administration/branches/branch-actions', () => ({
  assignBranchUser: (...args: unknown[]) => assignBranchUser(...args) as unknown,
  revokeBranchAssignment: vi.fn(),
}));

// vitest.config.ts resets no mocks, so each case must start with a clean call count.
beforeEach(() => {
  assignBranchUser.mockReset();
});

const FELIX = '10000000-0000-4000-8000-00000000000d';
const WESTLANDS = '44444444-4444-4444-8444-444444444444';
const HEAD_OFFICE = '33333333-3333-4333-8333-333333333333';
const ORG = '11111111-1111-4111-8111-111111111111';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TRUNCATED_NOTE = 'Only the first 100 active branches are listed.';
const TYPE_HELP = 'A label only — it grants no permissions.';
const TWO_BRANCHES = [
  { id: HEAD_OFFICE, label: 'Head Office (HEAD_OFFICE)' },
  { id: WESTLANDS, label: 'Westlands Branch (WESTLANDS)' },
];
const LONE_BRANCH = [{ id: WESTLANDS, label: 'Westlands Branch (WESTLANDS)' }];

const hidden = (name: string, root: ParentNode = document) =>
  root.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;

/** Rule 6: every drawer carries the rendered organisation and a minted key, or the cross-tab guard
 * and the retry's replay silently stop working. */
function expectScoped(root: ParentNode) {
  expect(hidden('contextOrganisationId', root)).toBe(ORG);
  expect(hidden('idempotencyKey', root)).toMatch(UUID);
}

interface Overrides {
  branches?: readonly { id: string; label: string }[];
  truncated?: boolean;
}

function renderButton({ branches = TWO_BRANCHES, truncated }: Overrides = {}) {
  return renderWithProviders(
    <AssignUserBranchButton
      userId={FELIX}
      userName="Felix Omondi"
      branches={branches}
      truncated={truncated}
      contextOrganisationId={ORG}
    />,
  );
}

async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Assign branch' }));
  return screen.getByRole('dialog', { name: 'Assign to a branch' });
}

describe('AssignUserBranchButton', () => {
  it('opens a drawer that carries the user, the key and the organisation (I2)', async () => {
    const user = userEvent.setup();
    renderButton();

    const drawer = await openDrawer(user);

    expect(drawer).toHaveTextContent(
      'Give Felix Omondi access to a branch. It takes effect immediately.',
    );
    expect(hidden('userId', drawer)).toBe(FELIX);
    expectScoped(drawer);
  });

  it('offers the branches it is given and preselects a lone one', async () => {
    const user = userEvent.setup();
    const { unmount } = renderButton();

    let drawer = await openDrawer(user);
    expectScoped(drawer);
    const branch = within(drawer).getByRole('combobox', { name: /^Branch/ });
    expect(branch).toBeRequired();
    // Two branches: nothing is chosen for the administrator.
    expect(hidden('branchId', drawer)).toBe('');
    await user.click(branch);
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Head Office (HEAD_OFFICE)',
      'Westlands Branch (WESTLANDS)',
    ]);
    await user.click(screen.getByRole('option', { name: 'Westlands Branch (WESTLANDS)' }));
    expect(hidden('branchId', drawer)).toBe(WESTLANDS);

    unmount();
    renderButton({ branches: LONE_BRANCH });
    drawer = await openDrawer(user);
    expectScoped(drawer);
    expect(hidden('branchId', drawer)).toBe(WESTLANDS);
    expect(within(drawer).getByRole('combobox', { name: /^Branch/ })).toHaveTextContent(
      'Westlands Branch (WESTLANDS)',
    );
  });

  it('preselects the Operate type and offers every assignment type, worded', async () => {
    const user = userEvent.setup();
    renderButton();

    const drawer = await openDrawer(user);
    expectScoped(drawer);
    const type = within(drawer).getByRole('combobox', { name: /^Assignment type/ });
    expect(type).toBeRequired();
    expect(type).toHaveTextContent('Operate');
    expect(hidden('assignmentType', drawer)).toBe('OPERATE');
    expect(type).toHaveAccessibleDescription(TYPE_HELP);
    await user.click(type);
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Home', 'Operate', 'Approve', 'View']);
    await user.click(screen.getByRole('option', { name: 'Approve' }));
    expect(hidden('assignmentType', drawer)).toBe('APPROVE');
  });

  it("shows the server's branch error under the select, keeps the drawer open, and retries with the same key", async () => {
    const user = userEvent.setup();
    assignBranchUser
      .mockResolvedValueOnce({
        ok: false,
        formError: 'Check the highlighted fields and try again.',
        fieldErrors: { branchId: 'Choose a branch.' },
        code: 'validation_failed',
        requestId: null,
      })
      .mockResolvedValueOnce({ ok: true });
    renderButton({ branches: LONE_BRANCH });

    const drawer = await openDrawer(user);
    expectScoped(drawer);
    await user.click(within(drawer).getByRole('button', { name: 'Assign branch' }));

    const branch = await within(drawer).findByRole('combobox', { name: /^Branch/ });
    await waitFor(() => {
      expect(branch).toHaveAccessibleDescription('Choose a branch.');
    });
    expect(branch).toBeInvalid();
    // The type's own help is untouched by the branch's error.
    expect(
      within(drawer).getByRole('combobox', { name: /^Assignment type/ }),
    ).toHaveAccessibleDescription(TYPE_HELP);
    expect(screen.getByRole('dialog', { name: 'Assign to a branch' })).toBeInTheDocument();
    // The lone branch stays chosen: a failed submit keeps what was entered (a retry replays safely).
    expect(hidden('branchId', drawer)).toBe(WESTLANDS);

    // Rule 6 on the submit that failed: the organisation and the key went out with it.
    expect(assignBranchUser).toHaveBeenCalledTimes(1);
    const first = assignBranchUser.mock.calls[0]?.[1] as FormData;
    expect(first.get('contextOrganisationId')).toBe(ORG);
    const sentKey = first.get('idempotencyKey');
    expect(sentKey).toMatch(UUID);
    // The drawer still holds that key (a remount would mint a new one) ...
    expectScoped(drawer);
    expect(hidden('idempotencyKey', drawer)).toBe(sentKey);

    // ... so the retry replays the same write, with the organisation again.
    await user.click(within(drawer).getByRole('button', { name: 'Assign branch' }));
    await waitFor(() => {
      expect(assignBranchUser).toHaveBeenCalledTimes(2);
    });
    const retry = assignBranchUser.mock.calls[1]?.[1] as FormData;
    expect(retry.get('idempotencyKey')).toBe(sentKey);
    expect(retry.get('contextOrganisationId')).toBe(ORG);
    expect(await screen.findByText('Branch assigned')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Assign to a branch' })).toBeNull();
    });
  });

  it("shows the server's assignment type error under that select", async () => {
    const user = userEvent.setup();
    assignBranchUser.mockResolvedValueOnce({
      ok: false,
      formError: 'Check the highlighted fields and try again.',
      fieldErrors: { assignmentType: 'Choose an assignment type.' },
      code: 'validation_failed',
      requestId: null,
    });
    renderButton({ branches: LONE_BRANCH });

    const drawer = await openDrawer(user);
    await user.click(within(drawer).getByRole('button', { name: 'Assign branch' }));

    const type = await within(drawer).findByRole('combobox', { name: /^Assignment type/ });
    await waitFor(() => {
      expect(type).toHaveAccessibleDescription('Choose an assignment type.');
    });
    expect(type).toBeInvalid();
    expect(within(drawer).getByRole('combobox', { name: /^Branch/ })).toBeValid();
  });

  it('says when the branch list stops at 100', async () => {
    const user = userEvent.setup();
    const { unmount } = renderButton({ truncated: true });

    let drawer = await openDrawer(user);
    expectScoped(drawer);
    expect(within(drawer).getByRole('combobox', { name: /^Branch/ })).toHaveAccessibleDescription(
      TRUNCATED_NOTE,
    );

    unmount();
    renderButton();
    drawer = await openDrawer(user);
    expectScoped(drawer);
    expect(within(drawer).getByRole('combobox', { name: /^Branch/ })).toHaveAccessibleDescription(
      '',
    );
    expect(drawer).not.toHaveTextContent(TRUNCATED_NOTE);
  });

  it("puts the server's branch error in place of the 100-branch note", async () => {
    const user = userEvent.setup();
    assignBranchUser.mockResolvedValueOnce({
      ok: false,
      formError: 'Check the highlighted fields and try again.',
      fieldErrors: { branchId: 'Choose a branch.' },
      code: 'validation_failed',
      requestId: null,
    });
    renderButton({ branches: LONE_BRANCH, truncated: true });

    const drawer = await openDrawer(user);
    await user.click(within(drawer).getByRole('button', { name: 'Assign branch' }));

    const branch = await within(drawer).findByRole('combobox', { name: /^Branch/ });
    await waitFor(() => {
      expect(branch).toHaveAccessibleDescription('Choose a branch.');
    });
    expect(drawer).not.toHaveTextContent(TRUNCATED_NOTE);
  });

  it('assigns the chosen branch with the user, the type, the key and the organisation, then confirms', async () => {
    const user = userEvent.setup();
    assignBranchUser.mockResolvedValueOnce({ ok: true });
    renderButton();

    const drawer = await openDrawer(user);
    expectScoped(drawer);
    await user.click(within(drawer).getByRole('combobox', { name: /^Branch/ }));
    await user.click(screen.getByRole('option', { name: 'Head Office (HEAD_OFFICE)' }));
    await user.click(within(drawer).getByRole('button', { name: 'Assign branch' }));

    await waitFor(() => {
      expect(assignBranchUser).toHaveBeenCalledTimes(1);
    });
    const sent = assignBranchUser.mock.calls[0]?.[1] as FormData;
    expect(sent.get('userId')).toBe(FELIX);
    expect(sent.get('branchId')).toBe(HEAD_OFFICE);
    expect(sent.get('assignmentType')).toBe('OPERATE');
    expect(sent.get('contextOrganisationId')).toBe(ORG);
    expect(sent.get('idempotencyKey')).toMatch(UUID);
    expect(await screen.findByRole('alert')).toHaveTextContent('Branch assigned');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Assign to a branch' })).toBeNull();
    });
  });
});
