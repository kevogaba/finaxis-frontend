import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { ownStyle } from '@/test/own-style';
import { renderWithProviders } from '@/test/test-utils';
import { REVIEW_NOTE } from '../invite-rules';
import type { InviteValues } from '../invite-schema';
import { InviteReview } from './invite-review';

const WESTLANDS = 'a4000000-0000-4000-8000-0000000000aa';
const HEAD_OFFICE = 'b2000000-0000-4000-8000-0000000000bb';
const TELLER = 'c1000000-0000-4000-8000-0000000000cc';
const SUPERVISOR = 'd1000000-0000-4000-8000-0000000000dd';
const ROLES = [
  { id: TELLER, label: 'Teller (TELLER)' },
  { id: SUPERVISOR, label: 'Branch supervisor (SUPERVISOR)' },
];
const BRANCHES = [
  { id: HEAD_OFFICE, label: 'Head Office (HEAD_OFFICE)' },
  { id: WESTLANDS, label: 'Westlands Branch (WESTLANDS)' },
];

const VALUES: InviteValues = {
  displayName: 'Neema Wanjiku',
  email: 'neema.wanjiku@greenfield.example',
  username: 'neema.wanjiku',
  phone: '',
  membershipType: 'STAFF',
  primaryBranchId: WESTLANDS,
  branchAssignments: [
    { branchId: WESTLANDS, assignmentType: 'HOME' },
    { branchId: HEAD_OFFICE, assignmentType: 'VIEW' },
  ],
  roleAssignments: [
    { roleId: TELLER, scopeType: 'TENANT', branchId: '' },
    { roleId: SUPERVISOR, scopeType: 'BRANCH', branchId: WESTLANDS },
  ],
  sendIdentityInvite: 'true',
  sendApplicationInvite: 'false',
};

const fact = (region: HTMLElement, label: string) =>
  within(region).getByText(label, { selector: 'dt' }).nextElementSibling;

describe('InviteReview', () => {
  it('lists every answer by step, in words', () => {
    renderWithProviders(
      <InviteReview
        values={VALUES}
        roles={ROLES}
        branches={BRANCHES}
        pending={false}
        onEdit={vi.fn()}
      />,
    );

    const identity = screen.getByRole('region', { name: 'Identity' });
    expect(fact(identity, 'Membership type')).toHaveTextContent('Staff');
    const access = screen.getByRole('region', { name: 'Access' });
    expect(
      within(fact(access, 'Branch assignments') as HTMLElement)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Westlands Branch (WESTLANDS) · Home', 'Head Office (HEAD_OFFICE) · View']);
    expect(
      within(fact(access, 'Roles') as HTMLElement)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Teller (TELLER) · Institution (all branches)',
      'Branch supervisor (SUPERVISOR) · Westlands Branch (WESTLANDS)',
    ]);
    expect(fact(access, 'Primary branch')).toHaveTextContent('Westlands Branch (WESTLANDS)');
    const invitation = screen.getByRole('region', { name: 'Invitation' });
    expect(fact(invitation, 'Identity-provider invitation')).toHaveTextContent('Yes');
    expect(fact(invitation, 'Application invitation')).toHaveTextContent('No');
    expect(screen.getByRole('note')).toHaveTextContent(REVIEW_NOTE);
  });

  it('shows an unset answer muted and in regular weight, apart from real values', () => {
    renderWithProviders(
      <InviteReview
        values={{
          ...VALUES,
          primaryBranchId: '',
          branchAssignments: [],
          membershipType: 'AUDITOR',
        }}
        roles={ROLES}
        branches={BRANCHES}
        pending={false}
        onEdit={vi.fn()}
      />,
    );

    // The phone and the primary branch; no branch reads None.
    const unset = [...screen.getAllByText('Not set'), screen.getByText('None')];
    expect(unset).toHaveLength(3);
    for (const element of unset) {
      expect(ownStyle(element, 'color')).toContain('--finaxis-palette-text-secondary');
      expect(ownStyle(element, 'font-weight')).toBe('400');
    }
  });

  it('returns to each step from its Edit button, and disables them while sending', async () => {
    const user = userEvent.setup({ delay: null });
    const onEdit = vi.fn();
    const { rerender } = renderWithProviders(
      <InviteReview
        values={VALUES}
        roles={ROLES}
        branches={BRANCHES}
        pending={false}
        onEdit={onEdit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit identity' }));
    await user.click(screen.getByRole('button', { name: 'Edit access' }));
    await user.click(screen.getByRole('button', { name: 'Edit invitation' }));
    expect(onEdit.mock.calls).toEqual([[0], [1], [2]]);

    rerender(
      <InviteReview values={VALUES} roles={ROLES} branches={BRANCHES} pending onEdit={onEdit} />,
    );
    for (const name of ['Edit identity', 'Edit access', 'Edit invitation']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });
});
