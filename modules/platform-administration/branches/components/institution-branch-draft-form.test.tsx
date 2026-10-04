import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { UUID_PATTERN } from '@/lib/api/wire';
import { institutionBranchesHref } from '../institution-branch-query';
import { InstitutionBranchDraftForm } from './institution-branch-draft-form';

const { createBranchDraft, createInstitutionBranchDraft } = vi.hoisted(() => ({
  createBranchDraft: vi.fn(),
  createInstitutionBranchDraft: vi.fn(),
}));
vi.mock('../institution-branch-actions', () => ({
  createInstitutionBranchDraft: (...args: unknown[]) =>
    createInstitutionBranchDraft(...args) as unknown,
}));
// 08's own action: the wrapper must never fall back to it.
vi.mock('@/modules/administration/branches/branch-actions', () => ({
  createBranchDraft: (...args: unknown[]) => createBranchDraft(...args) as unknown,
}));

const TENANT = '17000000-0000-4000-8000-00000000000a';
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

describe('InstitutionBranchDraftForm', () => {
  beforeEach(() => {
    createBranchDraft.mockReset();
    createInstitutionBranchDraft.mockReset();
  });

  it("submits 08's form through the platform action with the institution, the organisation and one key", async () => {
    const user = userEvent.setup();
    createInstitutionBranchDraft
      .mockResolvedValueOnce(CONFLICT)
      .mockResolvedValueOnce({ ok: true });
    renderWithProviders(
      <InstitutionBranchDraftForm
        tenantId={TENANT}
        parents={PARENTS}
        defaultTimeZone="Africa/Nairobi"
        contextOrganisationId={ORG}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: 'Branch code' }), 'THIKA');
    await user.type(screen.getByRole('textbox', { name: 'Branch name' }), 'Thika Road Branch');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText('This code may already be in use.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    await waitFor(() => {
      expect(createInstitutionBranchDraft).toHaveBeenCalledTimes(2);
    });
    const [first, second] = createInstitutionBranchDraft.mock.calls.map(
      (call) => call[1] as FormData,
    );
    for (const sent of [first, second]) {
      expect(sent?.get('tenantId')).toBe(TENANT);
      expect(sent?.get('contextOrganisationId')).toBe(ORG);
      expect(sent?.get('idempotencyKey')).toMatch(UUID_PATTERN);
      expect(sent?.get('branchCode')).toBe('THIKA');
    }
    expect(second?.get('idempotencyKey')).toBe(first?.get('idempotencyKey'));
    expect(createBranchDraft).not.toHaveBeenCalled();
  });

  it("sends Cancel back to the institution's Branches tab", () => {
    renderWithProviders(
      <InstitutionBranchDraftForm
        tenantId={TENANT}
        parents={PARENTS}
        defaultTimeZone="Africa/Nairobi"
      />,
    );

    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      institutionBranchesHref(TENANT),
    );
  });

  it('passes the parent note through to the Parent branch field', () => {
    renderWithProviders(
      <InstitutionBranchDraftForm
        tenantId={TENANT}
        parents={[]}
        parentsNote="Optional. Only the first 500 branches are listed."
        defaultTimeZone="Africa/Nairobi"
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Parent branch' })).toHaveAccessibleDescription(
      'Optional. Only the first 500 branches are listed.',
    );
  });
});
