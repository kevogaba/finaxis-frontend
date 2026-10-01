import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { UUID_PATTERN } from '@/lib/api/wire';
import { RoleForm } from './role-form';

const { createRole, updateRole } = vi.hoisted(() => ({
  createRole: vi.fn(),
  updateRole: vi.fn(),
}));
vi.mock('../role-actions', () => ({
  createRole: (...args: unknown[]) => createRole(...args) as unknown,
  updateRole: (...args: unknown[]) => updateRole(...args) as unknown,
}));

const ROLE = '09000000-0000-4000-8000-000000000007';
const ORG = '11111111-1111-4111-8111-111111111111';
const CONFLICT = {
  ok: false,
  formError: "The role couldn't be created. Its code may already be in use.",
  fieldErrors: { roleCode: 'This code may already be in use.' },
  code: 'conflict',
  requestId: 'req-3',
};
const sent = (action: typeof createRole, call: number) =>
  action.mock.calls[call]?.[1] as FormData | undefined;
const field = (name: string) => screen.getByRole('textbox', { name });

describe('RoleForm', () => {
  beforeEach(() => {
    createRole.mockReset();
    updateRole.mockReset();
  });

  it('validates on the client, with the field errors and a summary (spec §9)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoleForm />);

    await user.type(field('Role code'), 'credit clerk');
    await user.click(screen.getByRole('button', { name: 'Create role' }));

    expect(
      await screen.findByText('Use 2–20 capital letters, digits, underscores or hyphens.'),
    ).toBeInTheDocument();
    expect(field('Role code')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Check Role code, Role name.');
    expect(createRole).not.toHaveBeenCalled();
  });

  it('sends the fields with one key, shows server field errors, and retries with the same key', async () => {
    const user = userEvent.setup();
    createRole.mockResolvedValueOnce(CONFLICT).mockResolvedValueOnce({ ok: true });
    renderWithProviders(<RoleForm contextOrganisationId={ORG} />);

    await user.type(field('Role code'), 'CREDIT_CLERK');
    await user.type(field('Role name'), 'Credit clerk');
    await user.click(screen.getByRole('button', { name: 'Create role' }));

    expect(await screen.findByText('This code may already be in use.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('req-3');
    expect(Object.fromEntries(sent(createRole, 0) ?? new FormData())).toEqual({
      idempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown,
      roleCode: 'CREDIT_CLERK',
      roleName: 'Credit clerk',
      description: '',
      contextOrganisationId: ORG,
    });

    await user.click(screen.getByRole('button', { name: 'Create role' }));
    await waitFor(() => {
      expect(createRole).toHaveBeenCalledTimes(2);
    });
    expect(sent(createRole, 1)?.get('idempotencyKey')).toBe(
      sent(createRole, 0)?.get('idempotencyKey'),
    );
  });

  it('edits a role: the code is read-only and never sent', async () => {
    const user = userEvent.setup();
    updateRole.mockResolvedValueOnce({ ok: true });
    renderWithProviders(
      <RoleForm
        role={{ id: ROLE, roleCode: 'TELLER', roleName: 'Teller', description: 'Front desk.' }}
      />,
    );

    expect(field('Role code')).toHaveAttribute('readonly');
    expect(field('Role code')).toHaveValue('TELLER');
    await user.clear(field('Role name'));
    await user.type(field('Role name'), 'Senior teller');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(updateRole).toHaveBeenCalledTimes(1);
    });
    expect(Object.fromEntries(sent(updateRole, 0) ?? new FormData())).toEqual({
      idempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown,
      roleId: ROLE,
      roleName: 'Senior teller',
      description: 'Front desk.',
    });
    expect(createRole).not.toHaveBeenCalled();
  });
});
