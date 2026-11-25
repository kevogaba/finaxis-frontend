import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { EditMembershipButton } from './edit-membership-button';

const { updateMembership } = vi.hoisted(() => ({ updateMembership: vi.fn() }));
vi.mock('@/modules/administration/users/membership-actions', () => ({
  updateMembership: (...args: unknown[]) => updateMembership(...args) as unknown,
}));

// vitest.config.mts resets no mocks, so each case must start with a clean call count.
beforeEach(() => {
  updateMembership.mockReset();
});

const MEMBERSHIP = '10000000-0000-4000-8000-00000000000e';
const WESTLANDS = '44444444-4444-4444-8444-444444444444';
const HEAD_OFFICE = '22222222-2222-4222-8222-222222222222';
const ORG = '11111111-1111-4111-8111-111111111111';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HINT = 'Shown on their record as their main branch.';
const TYPE_NEEDS_BRANCH =
  'Staff and Admin members need an active branch assignment first. Assign a branch, then change the type.';
const BRANCHES = [
  { id: HEAD_OFFICE, label: 'Head Office (HEAD_OFFICE)' },
  { id: WESTLANDS, label: 'Westlands Branch (WESTLANDS)' },
];

function renderButton(primaryBranchId: string | null = WESTLANDS) {
  return renderWithProviders(
    <EditMembershipButton
      membershipId={MEMBERSHIP}
      userName="Felix Omondi"
      membershipType="STAFF"
      primaryBranchId={primaryBranchId}
      branches={BRANCHES}
      branchHint={HINT}
      contextOrganisationId={ORG}
    />,
  );
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Edit membership' }));
  return screen.getByRole('dialog', { name: "Edit Felix Omondi's membership" });
}

async function choose(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  field: string,
  option: string,
) {
  await user.click(within(dialog).getByRole('combobox', { name: field }));
  await user.click(screen.getByRole('option', { name: option }));
}

/** The fields the action received on its `call`th submit. */
const submitted = (call: number) => {
  const formData = updateMembership.mock.calls[call]?.[1] as FormData | undefined;
  return Object.fromEntries(formData?.entries() ?? []);
};

describe('EditMembershipButton', () => {
  it('opens on the membership as read, with the two fields and no reason', async () => {
    const user = userEvent.setup();
    renderButton();

    const dialog = await openDialog(user);

    expect(dialog).toHaveAccessibleDescription(
      "The type decides whether they need a branch assignment: Staff and Admin members do, Auditors don't.",
    );
    expect(within(dialog).getByRole('combobox', { name: 'Membership type' })).toHaveTextContent(
      /^Staff$/,
    );
    expect(within(dialog).getByRole('combobox', { name: 'Primary branch' })).toHaveTextContent(
      /^Westlands Branch \(WESTLANDS\)$/,
    );
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('combobox', { name: 'Membership type' }));
    // SYSTEM is the platform's own (422): never on offer.
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Staff',
      'Admin',
      'Auditor',
    ]);
  });

  it('shows None for a member with no primary branch', async () => {
    const user = userEvent.setup();
    renderButton(null);

    const dialog = await openDialog(user);

    expect(within(dialog).getByRole('combobox', { name: 'Primary branch' })).toHaveTextContent(
      /^None$/,
    );
  });

  it('posts the choices beside the values it opened with, the key and the organisation', async () => {
    const user = userEvent.setup();
    updateMembership.mockResolvedValue({ ok: true });
    renderButton();

    const dialog = await openDialog(user);
    await choose(user, dialog, 'Membership type', 'Auditor');
    await choose(user, dialog, 'Primary branch', 'None');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(submitted(0)).toEqual({
      idempotencyKey: expect.stringMatching(UUID) as unknown,
      contextOrganisationId: ORG,
      membershipId: MEMBERSHIP,
      currentMembershipType: 'STAFF',
      currentPrimaryBranchId: WESTLANDS,
      membershipType: 'AUDITOR',
      primaryBranchId: '',
    });
    expect(await screen.findByText('Membership updated')).toBeInTheDocument();
  });

  // Review Focus 1 and 2: a refusal keeps the dialog, its choices and its key.
  it('explains a refusal, keeps the choices and reuses the minted key on retry', async () => {
    const user = userEvent.setup();
    updateMembership
      .mockResolvedValueOnce({
        ok: false,
        formError: TYPE_NEEDS_BRANCH,
        fieldErrors: {},
        code: 'conflict',
        requestId: 'req-9',
      })
      .mockResolvedValueOnce({ ok: true });
    renderButton();

    const dialog = await openDialog(user);
    await choose(user, dialog, 'Membership type', 'Admin');
    await choose(user, dialog, 'Primary branch', 'Head Office (HEAD_OFFICE)');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      `${TYPE_NEEDS_BRANCH} Reference: req-9`,
    );
    expect(within(dialog).getByRole('combobox', { name: 'Membership type' })).toHaveTextContent(
      /^Admin$/,
    );
    expect(within(dialog).getByRole('combobox', { name: 'Primary branch' })).toHaveTextContent(
      /^Head Office \(HEAD_OFFICE\)$/,
    );

    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(updateMembership).toHaveBeenCalledTimes(2);
    });
    expect(submitted(1)).toEqual(submitted(0));
    expect(submitted(1)).toMatchObject({ membershipType: 'ADMIN', primaryBranchId: HEAD_OFFICE });
  });

  it('mints a fresh key each time it opens', async () => {
    const user = userEvent.setup();
    updateMembership.mockResolvedValue({ ok: true });
    renderButton();

    let dialog = await openDialog(user);
    await choose(user, dialog, 'Membership type', 'Admin');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    dialog = await openDialog(user);
    await choose(user, dialog, 'Membership type', 'Auditor');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(updateMembership).toHaveBeenCalledTimes(2);
    });

    expect(submitted(1).idempotencyKey).not.toBe(submitted(0).idempotencyKey);
  });
});
