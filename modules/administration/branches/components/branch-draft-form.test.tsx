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
});
