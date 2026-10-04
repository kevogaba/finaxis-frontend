import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { UUID_PATTERN } from '@/lib/api/wire';
import { BranchDraftForm } from './branch-draft-form';

const { createBranchDraft } = vi.hoisted(() => ({ createBranchDraft: vi.fn() }));
vi.mock('../branch-actions', () => ({
  createBranchDraft: (...args: unknown[]) => createBranchDraft(...args) as unknown,
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
