import { describe, expect, it } from 'vitest';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import {
  BRANCHES_CAPPED,
  CHOOSE_ROLE,
  CHOOSE_ROW_BRANCH,
  NEEDS_A_BRANCH,
  NEEDS_A_ROLE,
  ROLES_CAPPED,
} from '../invite-rules';
import { EMPTY_INVITE, inviteSchema, type InviteValues } from '../invite-schema';
import { InviteAccessFields } from './invite-access-fields';

type User = ReturnType<typeof userEvent.setup>;

const WESTLANDS = 'a4000000-0000-4000-8000-0000000000aa';
const HEAD_OFFICE = 'b2000000-0000-4000-8000-0000000000bb';
const TELLER = 'c1000000-0000-4000-8000-0000000000cc';
const ROLES = [{ id: TELLER, label: 'Teller (TELLER)' }];
const BRANCHES = [
  { id: HEAD_OFFICE, label: 'Head Office (HEAD_OFFICE)' },
  { id: WESTLANDS, label: 'Westlands Branch (WESTLANDS)' },
];

interface HarnessProps {
  values?: Partial<InviteValues>;
  rolesCapped?: boolean;
  branchesCapped?: boolean;
}

/** The step inside its own form, validated as the wizard's Continue does. `Server` sets a list
 * refusal the way applyFieldErrors does for a server field error. */
function Harness({ values = {}, rolesCapped = false, branchesCapped = false }: HarnessProps) {
  const {
    control,
    trigger,
    setError,
    formState: { errors },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { ...EMPTY_INVITE, membershipType: 'STAFF', ...values },
  });
  return (
    <form>
      <InviteAccessFields
        control={control}
        trigger={trigger}
        roles={ROLES}
        branches={BRANCHES}
        rolesCapped={rolesCapped}
        branchesCapped={branchesCapped}
        branchListError={errors.branchAssignments}
        roleListError={errors.roleAssignments}
      />
      <button
        type="button"
        onClick={() => {
          void trigger(['branchAssignments', 'roleAssignments']);
        }}
      >
        Check
      </button>
      <button
        type="button"
        onClick={() => {
          setError('branchAssignments', { type: 'server', message: NEEDS_A_BRANCH });
        }}
      >
        Server
      </button>
    </form>
  );
}

async function choose(user: User, scope: HTMLElement, label: string, option: string) {
  await user.click(within(scope).getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
}

const group = (name: string) => screen.getByRole('group', { name });
const noteTexts = () => screen.getAllByRole('note').map((note) => note.textContent);

describe('InviteAccessFields', () => {
  it('starts with one branch row and one role row, branches first, then the primary branch', () => {
    renderWithProviders(<Harness />);

    expect(
      screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(['Branch assignments', 'Roles']);
    expect(
      within(group('Branch assignment 1')).getByRole('combobox', { name: 'Assignment type' }),
    ).toHaveTextContent('Home');
    expect(within(group('Role 1')).getByRole('combobox', { name: 'Scope' })).toHaveTextContent(
      'Institution (all branches)',
    );
    expect(screen.getByRole('combobox', { name: 'Primary branch' })).toHaveAccessibleDescription(
      'Optional. Shown on their record as their main branch.',
    );
    // The primary branch is the step's last field, after both sections.
    expect(screen.getAllByRole('combobox').at(-1)).toBe(
      screen.getByRole('combobox', { name: 'Primary branch' }),
    );
    expect(
      screen.getByText(
        'Staff and admin members need at least one branch. Assignment types are labels; roles grant permissions.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(BRANCHES_CAPPED)).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('adds a row with its first field focused, and returns focus to Add after a remove', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Add branch' }));
    await waitFor(() => {
      expect(
        within(group('Branch assignment 2')).getByRole('combobox', { name: 'Branch' }),
      ).toHaveFocus();
    });

    await user.click(screen.getByRole('button', { name: 'Remove branch assignment 2' }));
    expect(screen.queryByRole('group', { name: 'Branch assignment 2' })).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add branch' })).toHaveFocus();
    });

    await user.click(screen.getByRole('button', { name: 'Add role' }));
    await waitFor(() => {
      expect(within(group('Role 2')).getByRole('combobox', { name: 'Role' })).toHaveFocus();
    });

    await user.click(screen.getByRole('button', { name: 'Remove role 2' }));
    expect(screen.queryByRole('group', { name: 'Role 2' })).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add role' })).toHaveFocus();
    });
  });

  it('says a staff member needs a branch once the last one is removed', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Remove branch assignment 1' }));
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText(NEEDS_A_BRANCH)).toBeInTheDocument();

    // Adding a row clears the list's refusal (rule 8); the new row's own refusal takes its place.
    await user.click(screen.getByRole('button', { name: 'Add branch' }));
    await waitFor(() => {
      expect(screen.queryByText(NEEDS_A_BRANCH)).toBeNull();
      expect(
        within(group('Branch assignment 1')).getByRole('combobox', { name: 'Branch' }),
      ).toHaveAccessibleDescription(CHOOSE_ROW_BRANCH);
    });

    await choose(user, group('Branch assignment 1'), 'Branch', 'Westlands Branch (WESTLANDS)');
    expect(
      within(group('Branch assignment 1')).getByRole('combobox', { name: 'Branch' }),
    ).not.toHaveAccessibleDescription();
  });

  it('clears a stale role refusal once a role row is added, and names the new row', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Remove role 1' }));
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText(NEEDS_A_ROLE)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add role' }));
    await waitFor(() => {
      expect(screen.queryByText(NEEDS_A_ROLE)).toBeNull();
      expect(
        within(group('Role 1')).getByRole('combobox', { name: 'Role' }),
      ).toHaveAccessibleDescription(CHOOSE_ROLE);
    });

    await choose(user, group('Role 1'), 'Role', 'Teller (TELLER)');
    expect(
      within(group('Role 1')).getByRole('combobox', { name: 'Role' }),
    ).not.toHaveAccessibleDescription();
  });

  it('ties each list refusal to the Add button it names', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);
    // Neither button points at a message while none shows (a dangling IDREF is not a message).
    expect(screen.getByRole('button', { name: 'Add branch' })).not.toHaveAttribute(
      'aria-describedby',
    );
    expect(screen.getByRole('button', { name: 'Add role' })).not.toHaveAttribute(
      'aria-describedby',
    );

    await user.click(screen.getByRole('button', { name: 'Remove branch assignment 1' }));
    await user.click(screen.getByRole('button', { name: 'Remove role 1' }));
    await user.click(screen.getByRole('button', { name: 'Check' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add branch' })).toHaveAccessibleDescription(
        NEEDS_A_BRANCH,
      );
    });
    expect(screen.getByRole('button', { name: 'Add role' })).toHaveAccessibleDescription(
      NEEDS_A_ROLE,
    );
  });

  it('shows a list refusal the server sends onto the list', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Server' }));
    expect(await screen.findByText(NEEDS_A_BRANCH)).toBeInTheDocument();
  });

  it('tells an auditor the branches are optional, and refuses an untouched row at its field', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness values={{ membershipType: 'AUDITOR' }} />);
    expect(
      screen.getByText(
        'Optional for auditors and system members. Assignment types are labels; roles grant permissions.',
      ),
    ).toBeInTheDocument();

    // Ruling 13: the untouched row is refused at its own Branch field, never as a missing branch.
    await user.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => {
      expect(
        within(group('Branch assignment 1')).getByRole('combobox', { name: 'Branch' }),
      ).toHaveAccessibleDescription(CHOOSE_ROW_BRANCH);
    });
    expect(screen.queryByText(NEEDS_A_BRANCH)).toBeNull();
  });

  it('offers one-branch scope only once a branch is assigned, and only their branches', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);
    const role = group('Role 1');

    expect(within(role).getByRole('combobox', { name: 'Scope' })).toHaveAccessibleDescription(
      'Applies at every branch and at institution level. Add a branch above to scope a role to one branch.',
    );
    await user.click(within(role).getByRole('combobox', { name: 'Scope' }));
    expect(screen.getByRole('option', { name: 'One branch' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.keyboard('{Escape}');

    await choose(user, group('Branch assignment 1'), 'Branch', 'Westlands Branch (WESTLANDS)');
    expect(within(role).getByRole('combobox', { name: 'Scope' })).toHaveAccessibleDescription(
      'Applies at every branch and at institution level.',
    );
    await choose(user, role, 'Scope', 'One branch');
    expect(within(role).getByRole('combobox', { name: 'Scope' })).toHaveAccessibleDescription(
      'Applies only while that branch is selected.',
    );
    await user.click(within(role).getByRole('combobox', { name: 'Branch' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Westlands Branch (WESTLANDS)',
    ]);
  });

  it('keeps the branch a role already names, even after its row moves off it', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);
    const role = group('Role 1');

    await choose(user, group('Branch assignment 1'), 'Branch', 'Westlands Branch (WESTLANDS)');
    await choose(user, role, 'Scope', 'One branch');
    await choose(user, role, 'Branch', 'Westlands Branch (WESTLANDS)');
    await choose(user, group('Branch assignment 1'), 'Branch', 'Head Office (HEAD_OFFICE)');

    expect(within(role).getByRole('combobox', { name: 'Branch' })).toHaveTextContent(
      'Westlands Branch (WESTLANDS)',
    );
  });

  it('offers every active branch as primary, or none', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);

    // Unset, it says so, as the Review step's "Not set" does, rather than reading blank.
    expect(screen.getByRole('combobox', { name: 'Primary branch' })).toHaveTextContent(/^None$/);
    await user.click(screen.getByRole('combobox', { name: 'Primary branch' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'None',
      'Head Office (HEAD_OFFICE)',
      'Westlands Branch (WESTLANDS)',
    ]);
  });

  it('says when either list stops at 100 (L1)', () => {
    renderWithProviders(<Harness rolesCapped branchesCapped />);
    expect(noteTexts()).toEqual([BRANCHES_CAPPED, ROLES_CAPPED]);
  });

  it('says a capped branch list on its own', () => {
    renderWithProviders(<Harness branchesCapped />);
    expect(noteTexts()).toEqual([BRANCHES_CAPPED]);
  });

  it('says a capped role list on its own', () => {
    renderWithProviders(<Harness rolesCapped />);
    expect(noteTexts()).toEqual([ROLES_CAPPED]);
  });
});
