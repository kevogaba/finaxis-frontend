import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { AssignBranchUserButton } from './branch-user-actions';

vi.mock('../branch-actions', () => ({
  assignBranchUser: vi.fn(),
  revokeBranchAssignment: vi.fn(),
}));

const BRANCH = '44444444-4444-4444-8444-444444444444';
const ME = '08000000-0000-4000-8000-0000000000aa';
const OTHER = '08000000-0000-4000-8000-000000000002';
const option = (id: string, displayName: string) => ({
  id,
  displayName,
  email: `${id}@greenfield.example`,
  username: id,
  membershipStatus: 'ACTIVE',
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AssignBranchUserButton: your own access (#342)', () => {
  it('leaves the excluded user out of the user search', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        Response.json({ items: [option(ME, 'Jane Self'), option(OTHER, 'Peter Other')] }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <AssignBranchUserButton branchId={BRANCH} branchName="Westlands" excludeUserId={ME} />,
    );

    await user.click(screen.getByRole('button', { name: 'Assign user' }));
    await user.type(screen.getByRole('combobox', { name: /^User/ }), 'e');

    expect(await screen.findByRole('option', { name: /Peter Other/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Jane Self/ })).toBeNull();
  });
});
