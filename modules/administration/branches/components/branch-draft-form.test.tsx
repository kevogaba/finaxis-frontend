import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { UUID_PATTERN } from '@/lib/api/wire';
import { BranchDraftForm } from './branch-draft-form';

const { createBranchDraft, updateBranch } = vi.hoisted(() => ({
  createBranchDraft: vi.fn(),
  updateBranch: vi.fn(),
}));
vi.mock('../branch-actions', () => ({
  createBranchDraft: (...args: unknown[]) => createBranchDraft(...args) as unknown,
  updateBranch: (...args: unknown[]) => updateBranch(...args) as unknown,
}));

const TENANT = '99999999-9999-4999-8999-999999999999';
const ORG = '00000000-0000-0000-0000-000000000000';
const PARENTS = [
  { id: '22222222-2222-4222-8222-222222222222', label: 'Head Office (HEAD_OFFICE)' },
];
const CONFLICT = {
  ok: false,
  formError:
    "The branch couldn't be created. Its code may already be in use, or the institution can't add branches right now.",
  fieldErrors: { branchCode: 'This code may already be in use.' },
  code: 'conflict',
  requestId: 'req-3',
};
const FORBIDDEN = {
  ok: false,
  formError: "The platform can't create a branch in an institution you aren't a member of.",
  fieldErrors: {},
  code: 'forbidden',
  requestId: 'req-9',
};
const sent = (call: number) => createBranchDraft.mock.calls[call]?.[1] as FormData | undefined;

function renderForm(props: Partial<ComponentProps<typeof BranchDraftForm>> = {}) {
  renderWithProviders(
    <BranchDraftForm parents={PARENTS} defaultTimeZone="Africa/Nairobi" {...props} />,
  );
  return {
    code: screen.getByRole('textbox', { name: 'Branch code' }),
    name: screen.getByRole('textbox', { name: 'Branch name' }),
    create: screen.getByRole('button', { name: 'Create draft' }),
  };
}

describe('BranchDraftForm', () => {
  beforeEach(() => {
    createBranchDraft.mockReset();
  });

  it('validates on the client before calling the action', async () => {
    const user = userEvent.setup();
    const { code, create } = renderForm();

    await user.type(code, 'nairobi cbd');
    await user.click(create);

    expect(
      await screen.findByText('Use 2–20 capital letters, digits, underscores or hyphens.'),
    ).toBeInTheDocument();
    expect(code).toHaveAttribute('aria-invalid', 'true');
    expect(createBranchDraft).not.toHaveBeenCalled();
  });

  it('shows an error summary naming every invalid field on a client validation failure (V2)', async () => {
    const user = userEvent.setup();
    const { code, create } = renderForm();

    // Code fails the regex and name is left blank (fails min-length): two client errors.
    await user.type(code, 'nairobi cbd');
    await user.click(create);

    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent('Branch code');
    expect(summary).toHaveTextContent('Branch name');
    expect(code).toHaveFocus();
    expect(createBranchDraft).not.toHaveBeenCalled();
  });

  it('never duplicates the summary for a server-side field failure (V2)', async () => {
    const user = userEvent.setup();
    createBranchDraft.mockResolvedValueOnce(CONFLICT);
    const { code, name, create } = renderForm();

    await user.type(code, 'NAIROBI_CBD');
    await user.type(name, 'Nairobi CBD Branch');
    await user.click(create);

    // Only the server-failure Alert renders: CONFLICT's fieldErrors are applied with
    // `type: 'server'`, which the client-only summary above must not pick up.
    expect(await screen.findByText('This code may already be in use.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('req-3');
  });

  it('sends the fields with one key, shows server field errors, and retries with the same key', async () => {
    const user = userEvent.setup();
    createBranchDraft.mockResolvedValueOnce(CONFLICT).mockResolvedValueOnce({ ok: true });
    const { code, name, create } = renderForm();

    await user.type(code, 'NAIROBI_CBD');
    await user.type(name, 'Nairobi CBD Branch');
    await user.click(create);

    expect(await screen.findByText('This code may already be in use.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('req-3');
    expect(Object.fromEntries(sent(0) ?? new FormData())).toEqual({
      idempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown,
      branchCode: 'NAIROBI_CBD',
      branchName: 'Nairobi CBD Branch',
      branchType: 'OPERATIONS',
      parentBranchId: '',
      timezone: 'Africa/Nairobi',
      line_1: '',
      line_2: '',
      city: '',
      region: '',
      postal_code: '',
    });

    await user.click(create);
    await waitFor(() => {
      expect(createBranchDraft).toHaveBeenCalledTimes(2);
    });
    expect(sent(1)?.get('idempotencyKey')).toBe(sent(0)?.get('idempotencyKey'));
  });

  it('sends the rendered organisation id only when the prop is passed (I2)', async () => {
    const user = userEvent.setup();
    createBranchDraft.mockResolvedValueOnce({ ok: true });
    const { code, name, create } = renderForm({
      contextOrganisationId: '11111111-1111-4111-8111-111111111111',
    });

    await user.type(code, 'NAIROBI_CBD');
    await user.type(name, 'Nairobi CBD Branch');
    await user.click(create);

    await waitFor(() => {
      expect(createBranchDraft).toHaveBeenCalledTimes(1);
    });
    expect(sent(0)?.get('contextOrganisationId')).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('submits through a passed action with its hidden fields, the key and the organisation', async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValueOnce(CONFLICT).mockResolvedValueOnce({ ok: true });
    const { code, name, create } = renderForm({
      action,
      hiddenFields: { tenantId: TENANT },
      contextOrganisationId: ORG,
      cancelHref: `/platform-admin/tenants/${TENANT}/branches`,
    });

    await user.type(code, 'THIKA');
    await user.type(name, 'Thika Road Branch');
    await user.click(create);
    expect(await screen.findByText('This code may already be in use.')).toBeInTheDocument();
    expect(code).toHaveValue('THIKA');
    await user.click(create);

    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(2);
    });
    const [first, second] = action.mock.calls.map((call) => call[1] as FormData);
    for (const sent of [first, second]) {
      expect(sent?.get('tenantId')).toBe(TENANT);
      expect(sent?.get('contextOrganisationId')).toBe(ORG);
      expect(sent?.get('idempotencyKey')).toMatch(UUID_PATTERN);
    }
    expect(second?.get('idempotencyKey')).toBe(first?.get('idempotencyKey'));
    expect(createBranchDraft).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${TENANT}/branches`,
    );
  });

  it('takes an optional address in five labelled fields (decision Q9)', async () => {
    const user = userEvent.setup();
    createBranchDraft.mockResolvedValueOnce({ ok: true });
    const { code, name, create } = renderForm();

    expect(screen.getByRole('group', { name: 'Address (optional)' })).toBeInTheDocument();
    await user.type(code, 'THIKA');
    await user.type(name, 'Thika Road Branch');
    await user.type(screen.getByRole('textbox', { name: 'Address line 1' }), '3 Lake Road');
    await user.type(screen.getByRole('textbox', { name: 'City or town' }), 'Thika');
    for (const label of ['Address line 2', 'Region', 'Postal code']) {
      expect(screen.getByRole('textbox', { name: label })).not.toBeRequired();
    }
    await user.click(create);

    await waitFor(() => {
      expect(createBranchDraft).toHaveBeenCalledTimes(1);
    });
    expect(sent(0)?.get('line_1')).toBe('3 Lake Road');
    expect(sent(0)?.get('city')).toBe('Thika');
    expect(sent(0)?.get('region')).toBe('');
  });

  describe('editing a branch (BG-13)', () => {
    const BRANCH = {
      id: '44444444-4444-4444-8444-444444444444',
      branchCode: 'WESTLANDS',
      branchName: 'Westlands Branch',
      branchType: 'OPERATIONS',
      parentBranchId: '22222222-2222-4222-8222-222222222222',
      timezone: 'Africa/Nairobi',
      address: { line_1: 'Mpaka Road', city: 'Nairobi', building: 'Block B' },
    };
    const sentUpdate = (call: number) =>
      Object.fromEntries((updateBranch.mock.calls[call]?.[1] as FormData | undefined) ?? []);

    function renderEdit(branch: typeof BRANCH = BRANCH) {
      renderWithProviders(
        <BranchDraftForm
          branch={branch}
          parents={PARENTS}
          defaultTimeZone="Africa/Nairobi"
          contextOrganisationId={ORG}
        />,
      );
      return {
        name: screen.getByRole('textbox', { name: 'Branch name' }),
        save: screen.getByRole('button', { name: 'Save changes' }),
      };
    }

    beforeEach(() => {
      updateBranch.mockReset();
    });

    it('shows the stored values, with the code, type and other address keys read-only', () => {
      renderEdit();
      expect(screen.getByRole('textbox', { name: 'Branch name' })).toHaveValue('Westlands Branch');
      for (const [label, value] of [
        ['Branch code', 'WESTLANDS'],
        ['Branch type', 'OPERATIONS'],
        ['building', 'Block B'],
      ]) {
        expect(screen.getByRole('textbox', { name: label })).toHaveAttribute('readonly');
        expect(screen.getByRole('textbox', { name: label })).toHaveValue(value);
      }
      expect(screen.getByRole('textbox', { name: 'Address line 1' })).toHaveValue('Mpaka Road');
      expect(screen.getByRole('combobox', { name: 'Parent branch' })).toHaveValue(
        'Head Office (HEAD_OFFICE)',
      );
      expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
        'href',
        `/admin/branches/${BRANCH.id}`,
      );
      expect(screen.queryByRole('button', { name: 'Create draft' })).not.toBeInTheDocument();
    });

    it('sends only what changed, and retries with the same key (Review Focus 2)', async () => {
      const user = userEvent.setup();
      updateBranch.mockResolvedValueOnce(CONFLICT).mockResolvedValueOnce({ ok: true });
      const { name, save } = renderEdit();

      await user.type(name, ' Mall');
      await user.click(save);

      await waitFor(() => {
        expect(updateBranch).toHaveBeenCalledTimes(1);
      });
      expect(sentUpdate(0)).toEqual({
        idempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown,
        branchId: BRANCH.id,
        contextOrganisationId: ORG,
        branchName: 'Westlands Branch Mall',
      });
      expect(createBranchDraft).not.toHaveBeenCalled();
      // The failure has settled (Save is no longer pending) before the retry.
      expect(await screen.findByText(/Reference: req-3/)).toBeInTheDocument();

      await user.click(save);
      await waitFor(() => {
        expect(updateBranch).toHaveBeenCalledTimes(2);
      });
      expect(sentUpdate(1).idempotencyKey).toBe(sentUpdate(0).idempotencyKey);
    });

    it('sends the whole address, keeping the other stored keys', async () => {
      const user = userEvent.setup();
      updateBranch.mockResolvedValueOnce({ ok: true });
      const { save } = renderEdit();

      await user.clear(screen.getByRole('textbox', { name: 'City or town' }));
      await user.click(save);

      await waitFor(() => {
        expect(updateBranch).toHaveBeenCalledTimes(1);
      });
      expect(sentUpdate(0)).toMatchObject({
        line_1: 'Mpaka Road',
        city: '',
        otherAddress: '{"building":"Block B"}',
      });
      expect(sentUpdate(0)).not.toHaveProperty('branchName');
    });

    it('saves a name-only edit past a stored address line longer than the form allows', async () => {
      const user = userEvent.setup();
      updateBranch.mockResolvedValueOnce({ ok: true });
      const long = 'Plot 7, '.repeat(20).trim(); // the platform caps none
      const { name, save } = renderEdit({
        ...BRANCH,
        address: { ...BRANCH.address, line_1: long },
      });

      await user.type(name, ' Mall');
      await user.click(save);

      await waitFor(() => {
        expect(updateBranch).toHaveBeenCalledTimes(1);
      });
      expect(sentUpdate(0)).not.toHaveProperty('line_1');
      expect(screen.queryByText(/Check the highlighted fields/)).not.toBeInTheDocument();
    });

    it('says when nothing changed, and sends nothing', async () => {
      const user = userEvent.setup();
      const { save } = renderEdit();

      await user.click(save);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        "You haven't changed anything yet.",
      );
      expect(updateBranch).not.toHaveBeenCalled();
    });
  });

  describe('keyboard focus after a failed submit (gate finding I2)', () => {
    /** Submits with the action held open, and models what a browser does to the focused submit
     * button the moment it goes disabled: focus drops to `<body>`. jsdom keeps it on the disabled
     * button (its `blur()` is a no-op there), so focus goes to a field and is blurred instead. */
    async function submitThenSettle(result: unknown) {
      const user = userEvent.setup();
      let settle: (value: unknown) => void = () => undefined;
      createBranchDraft.mockReturnValueOnce(
        new Promise((resolve) => {
          settle = resolve;
        }),
      );
      const form = renderForm();
      await user.type(form.code, 'THIKA');
      await user.type(form.name, 'Thika Road Branch');
      await user.click(form.create);
      await waitFor(() => {
        expect(form.create).toBeDisabled();
      });
      form.code.focus();
      form.code.blur();
      expect(document.body).toHaveFocus();
      await act(async () => {
        settle(result);
        await Promise.resolve();
      });
      return form;
    }

    it('puts focus back on Create draft when the failure names no field (BG-18)', async () => {
      const { create } = await submitThenSettle(FORBIDDEN);

      expect(await screen.findByRole('alert')).toHaveTextContent('req-9');
      await waitFor(() => {
        expect(create).toHaveFocus();
      });
    });

    it('leaves focus on the field a failure names, not on Create draft', async () => {
      const { code, create } = await submitThenSettle(CONFLICT);

      expect(await screen.findByText('This code may already be in use.')).toBeInTheDocument();
      await waitFor(() => {
        expect(code).toHaveFocus();
      });
      expect(create).not.toHaveFocus();
    });
  });

  it('says why the parent list is incomplete, in place of "Optional."', () => {
    renderForm({ parentsNote: 'Optional. Only the first 500 branches are listed.' });
    expect(screen.getByRole('combobox', { name: 'Parent branch' })).toHaveAccessibleDescription(
      'Optional. Only the first 500 branches are listed.',
    );
  });

  it('keeps 08\'s own defaults: its tenant action, Cancel to the branch list and "Optional."', async () => {
    const user = userEvent.setup();
    createBranchDraft.mockResolvedValueOnce({ ok: true });
    const { code, name, create } = renderForm();

    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/admin/branches');
    expect(screen.getByRole('combobox', { name: 'Parent branch' })).toHaveAccessibleDescription(
      'Optional.',
    );
    await user.type(code, 'THIKA');
    await user.type(name, 'Thika Road Branch');
    await user.click(create);

    await waitFor(() => {
      expect(createBranchDraft).toHaveBeenCalledTimes(1);
    });
    expect(sent(0)?.has('tenantId')).toBe(false);
  });
});
