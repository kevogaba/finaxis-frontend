import { describe, expect, it } from 'vitest';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { BRANCHES_CAPPED, NEEDS_A_BRANCH, ROLES_CAPPED } from '../invite-rules';
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
  capped?: boolean;
}

/** The step inside its own form, validated as the wizard's Continue does. */
function Harness({ values = {}, capped = false }: HarnessProps) {
  const {
    control,
    trigger,
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
        rolesCapped={capped}
        branchesCapped={capped}
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
    </form>
  );
}

async function choose(user: User, scope: HTMLElement, label: string, option: string) {
  await user.click(within(scope).getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
}

const group = (name: string) => screen.getByRole('group', { name });

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
    expect(screen.queryByText(BRANCHES_CAPPED)).toBeNull();
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
  });

  it('says a staff member needs a branch once the last one is removed', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Remove branch assignment 1' }));
    await user.click(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByText(NEEDS_A_BRANCH)).toBeInTheDocument();
  });

  it('tells an auditor the branches are optional', () => {
    renderWithProviders(<Harness values={{ membershipType: 'AUDITOR' }} />);
    expect(
      screen.getByText(
        'Optional for auditors and system members. Assignment types are labels; roles grant permissions.',
      ),
    ).toBeInTheDocument();
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
    await choose(user, role, 'Scope', 'One branch');
    expect(within(role).getByRole('combobox', { name: 'Scope' })).toHaveAccessibleDescription(
      'Applies only while that branch is selected.',
    );
    await user.click(within(role).getByRole('combobox', { name: 'Branch' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Westlands Branch (WESTLANDS)',
    ]);
  });

  it('offers every active branch as primary, or none', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('combobox', { name: 'Primary branch' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'None',
      'Head Office (HEAD_OFFICE)',
      'Westlands Branch (WESTLANDS)',
    ]);
  });

  it('says when either list stops at 100 (L1)', () => {
    renderWithProviders(<Harness capped />);
    expect(screen.getByText(BRANCHES_CAPPED)).toBeInTheDocument();
    expect(screen.getByText(ROLES_CAPPED)).toBeInTheDocument();
  });
});
