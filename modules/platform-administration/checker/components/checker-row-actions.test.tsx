import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { CHECKER_AUDIT_NOTE, PLATFORM_ACTIVATE_BLOCKED } from '../checker-rules';
import { BranchCheckerActions, MemberApproveButton } from './checker-row-actions';

const {
  activateInstitutionBranch,
  approveAsPlatformChecker,
  returnInstitutionBranch,
  submitInstitutionBranch,
} = vi.hoisted(() => ({
  activateInstitutionBranch: vi.fn(),
  approveAsPlatformChecker: vi.fn(),
  returnInstitutionBranch: vi.fn(),
  submitInstitutionBranch: vi.fn(),
}));
vi.mock('../checker-actions', () => ({
  activateInstitutionBranch: (...args: unknown[]) => activateInstitutionBranch(...args) as unknown,
  approveAsPlatformChecker: (...args: unknown[]) => approveAsPlatformChecker(...args) as unknown,
  returnInstitutionBranch: (...args: unknown[]) => returnInstitutionBranch(...args) as unknown,
  submitInstitutionBranch: (...args: unknown[]) => submitInstitutionBranch(...args) as unknown,
}));

const TENANT = '15000000-0000-4000-8000-0000000000f1';
const MEMBERSHIP = '15000000-0000-4000-8000-0000000000b2';
const BRANCH = '15000000-0000-4000-8000-0000000000c3';
const ORG = '00000000-0000-0000-0000-000000000000';

const failure = {
  ok: false,
  formError: 'This institution now has its own approvers. The platform can no longer approve here.',
  fieldErrors: {},
  code: 'lifecycle.platform_checker_closed',
  requestId: 'req-7',
};

/** I2: every dialog carries the institution, its subject and the rendered organisation. */
function expectScoped(formData: FormData, subject: [string, string]) {
  expect(formData.get('tenantId')).toBe(TENANT);
  expect(formData.get(subject[0])).toBe(subject[1]);
  expect(formData.get('contextOrganisationId')).toBe(ORG);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('MemberApproveButton', () => {
  const button = (blocked: string | null = null) => (
    <main>
      <h1>Bidii Traders SACCO</h1>
      <MemberApproveButton
        tenantId={TENANT}
        membershipId={MEMBERSHIP}
        name="Otieno Ouma"
        blocked={blocked}
        contextOrganisationId={ORG}
      />
    </main>
  );

  it('approves with an optional remark, says the platform checks it, and toasts the outcome', async () => {
    const user = userEvent.setup();
    approveAsPlatformChecker.mockResolvedValueOnce({ ok: true, outcome: 'active' });
    renderWithProviders(button());

    // The row's label is short; its name says whom it approves (WCAG 2.4.6).
    await user.click(screen.getByRole('button', { name: 'Approve Otieno Ouma' }));
    const dialog = screen.getByRole('dialog', { name: 'Approve Otieno Ouma?' });
    expect(dialog).toHaveAccessibleDescription(expect.stringContaining(CHECKER_AUDIT_NOTE));
    const remark = within(dialog).getByRole('textbox', { name: 'Remark (optional)' });
    expect(remark).not.toBeRequired();
    await user.type(remark, 'First teller');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(approveAsPlatformChecker).toHaveBeenCalledTimes(1);
    });
    const formData = approveAsPlatformChecker.mock.calls[0]?.[1] as FormData;
    expectScoped(formData, ['membershipId', MEMBERSHIP]);
    expect(formData.get('reason')).toBe('First teller');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Approved. Their membership is active.',
    );
  });

  it('keeps the remark and the key after a refusal, and explains it', async () => {
    const user = userEvent.setup();
    approveAsPlatformChecker.mockResolvedValueOnce(failure);
    approveAsPlatformChecker.mockResolvedValueOnce({ ok: true, outcome: 'provisioning' });
    renderWithProviders(button());

    await user.click(screen.getByRole('button', { name: 'Approve Otieno Ouma' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'Kept');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(await within(dialog).findByText(/now has its own approvers/)).toBeVisible();
    expect(within(dialog).getByRole('textbox')).toHaveValue('Kept');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(approveAsPlatformChecker).toHaveBeenCalledTimes(2);
    });
    const keys = approveAsPlatformChecker.mock.calls.map(
      ([, data]) => (data as FormData).get('idempotencyKey') as string,
    );
    expect(keys[0]).toBe(keys[1]);
    // The toast, not the dialog's own refusal alert, which shows until the dialog closes.
    expect(await screen.findByText(/Identity provisioning is queued/)).toBeVisible();
  });

  it('is disabled with its caption for someone the platform would refuse', () => {
    renderWithProviders(
      button('You invited this user, so another administrator must approve them.'),
    );

    const approve = screen.getByRole('button', { name: 'Approve Otieno Ouma' });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAccessibleDescription(
      'You invited this user, so another administrator must approve them.',
    );
  });
});

describe('BranchCheckerActions', () => {
  const actions = (
    list: Parameters<typeof BranchCheckerActions>[0]['actions'],
    activateBlocked: string | null = null,
  ) => (
    <main>
      <h1>Bidii Traders SACCO</h1>
      <BranchCheckerActions
        tenantId={TENANT}
        branchId={BRANCH}
        name="Nakuru Branch"
        actions={list}
        activateBlocked={activateBlocked}
        contextOrganisationId={ORG}
      />
    </main>
  );

  it('shows Return outlined then Activate contained, each named for the branch', () => {
    renderWithProviders(actions(['return', 'activate']));

    expect(screen.getByRole('button', { name: 'Return Nakuru Branch for changes' })).toHaveClass(
      'MuiButton-outlined',
    );
    expect(screen.getByRole('button', { name: 'Activate Nakuru Branch' })).toHaveClass(
      'MuiButton-contained',
    );
  });

  it('activates with an optional reason through the platform action, then focuses the title', async () => {
    const user = userEvent.setup();
    activateInstitutionBranch.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderWithProviders(actions(['return', 'activate']));

    await user.click(screen.getByRole('button', { name: 'Activate Nakuru Branch' }));
    const dialog = screen.getByRole('dialog', { name: 'Activate Nakuru Branch?' });
    expect(dialog).toHaveAccessibleDescription(expect.stringContaining(CHECKER_AUDIT_NOTE));
    expect(within(dialog).getByRole('textbox', { name: 'Reason (optional)' })).not.toBeRequired();
    await user.click(within(dialog).getByRole('button', { name: 'Activate' }));

    await waitFor(() => {
      expect(activateInstitutionBranch).toHaveBeenCalledTimes(1);
    });
    expectScoped(activateInstitutionBranch.mock.calls[0]?.[1] as FormData, ['branchId', BRANCH]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Branch activated');

    // The active branch offers nothing: the row empties, and focus goes to the record title.
    rerender(actions([]));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    });
  });

  it('returns for changes with a required reason', async () => {
    const user = userEvent.setup();
    returnInstitutionBranch.mockResolvedValueOnce({ ok: true });
    renderWithProviders(actions(['return', 'activate']));

    await user.click(screen.getByRole('button', { name: 'Return Nakuru Branch for changes' }));
    const dialog = screen.getByRole('dialog', { name: 'Return Nakuru Branch for changes?' });
    const reason = within(dialog).getByRole('textbox', { name: 'What needs to change' });
    expect(reason).toBeRequired();
    await user.type(reason, 'Fix the code');
    await user.click(within(dialog).getByRole('button', { name: 'Return for changes' }));

    await waitFor(() => {
      expect(returnInstitutionBranch).toHaveBeenCalledTimes(1);
    });
    expect((returnInstitutionBranch.mock.calls[0]?.[1] as FormData).get('reason')).toBe(
      'Fix the code',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Returned for changes');
  });

  it('submits a draft, then focuses the first enabled action the row now offers', async () => {
    const user = userEvent.setup();
    submitInstitutionBranch.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderWithProviders(actions(['submit']));

    await user.click(screen.getByRole('button', { name: 'Submit Nakuru Branch for approval' }));
    const dialog = screen.getByRole('dialog', { name: 'Submit Nakuru Branch for approval?' });
    await user.click(within(dialog).getByRole('button', { name: 'Submit for approval' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Submitted for approval');
    expectScoped(submitInstitutionBranch.mock.calls[0]?.[1] as FormData, ['branchId', BRANCH]);

    // The submitter withdraws it now, and can't activate it.
    rerender(actions(['withdraw', 'activate'], PLATFORM_ACTIVATE_BLOCKED));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Withdraw Nakuru Branch' })).toHaveFocus();
    });
  });

  it('withdraws through the return route, as its maker', async () => {
    const user = userEvent.setup();
    returnInstitutionBranch.mockResolvedValueOnce({ ok: true });
    renderWithProviders(actions(['withdraw', 'activate'], PLATFORM_ACTIVATE_BLOCKED));

    await user.click(screen.getByRole('button', { name: 'Withdraw Nakuru Branch' }));
    const dialog = screen.getByRole('dialog', { name: 'Withdraw Nakuru Branch?' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Reason' }), 'Wrong town');
    await user.click(within(dialog).getByRole('button', { name: 'Withdraw' }));

    await waitFor(() => {
      expect(returnInstitutionBranch).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Branch withdrawn');
  });

  it('disables Activate for its creator or submitter, tied to the caption', () => {
    renderWithProviders(actions(['withdraw', 'activate'], PLATFORM_ACTIVATE_BLOCKED));

    const activate = screen.getByRole('button', { name: 'Activate Nakuru Branch' });
    expect(activate).toBeDisabled();
    expect(activate).toHaveAccessibleDescription(PLATFORM_ACTIVATE_BLOCKED);
    expect(screen.getByRole('button', { name: 'Withdraw Nakuru Branch' })).toBeEnabled();
  });
});
