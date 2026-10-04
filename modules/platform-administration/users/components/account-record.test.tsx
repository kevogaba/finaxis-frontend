import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { UserSummary } from '@/modules/administration/users/user-contract';
import { renderWithProviders } from '@/test/test-utils';
import { accountScopeNote, OWN_ACCOUNT, type AccountScope } from '../account-rules';
import { AccountRecord } from './account-record';

// The hero's client component imports these Server Actions; nothing here submits one.
vi.mock('../account-actions', () => ({
  deactivateAccount: vi.fn(),
  reactivateAccount: vi.fn(),
  suspendAccount: vi.fn(),
}));

// Lettered, so its upper case differs from it.
const ESI = '17000000-0000-4000-8000-0000000000a7';
const ORG = '00000000-0000-0000-0000-000000000000';
const ALL_CODES = ['user.view', 'user.suspend', 'user.activate', 'user.deactivate'];

const USER: UserSummary = {
  id: ESI,
  username: 'esi.mensah',
  email: 'esi.mensah@acme.example',
  displayName: 'Esi Mensah',
  userStatus: 'ACTIVE',
  membershipStatus: 'ACTIVE',
};

interface Setup {
  user?: Partial<UserSummary>;
  scope?: AccountScope;
  permissions?: readonly string[];
  signedInUserId?: string | null;
}

function show({
  user = {},
  scope = 'institution',
  permissions = ALL_CODES,
  signedInUserId = null,
}: Setup = {}) {
  return renderWithProviders(
    <AccountRecord
      user={{ ...USER, ...user }}
      scope={scope}
      back={{ href: '/platform-admin/tenants/t/users', label: 'Back to users' }}
      eyebrow="Platform administration · User in Acme SACCO"
      membershipLabel="Membership in Acme SACCO"
      holder={{ permissions }}
      signedInUserId={signedInUserId}
      contextOrganisationId={ORG}
    />,
  );
}

/** The value beside a fact's label in the description list. */
function fact(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: 'dt' });
  const value = term.nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`No value for ${label}`);
  return value;
}

describe('AccountRecord', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('names the person in the h1 and words both chips', () => {
    show();

    expect(screen.getByRole('heading', { level: 1, name: 'Esi Mensah' })).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('Account active')).toBeVisible();
    expect(screen.getByText('Membership active')).toBeVisible();
    expect(screen.getByText('esi.mensah · esi.mensah@acme.example')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to users' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants/t/users',
    );
  });

  it('shows the institution scope note and the membership label it is given', () => {
    show({ scope: 'institution' });

    expect(screen.getByRole('note')).toHaveTextContent(accountScopeNote('institution'));
    expect(screen.getByText('Membership in Acme SACCO', { selector: 'dt' })).toBeVisible();
    expect(fact('Membership in Acme SACCO')).toHaveTextContent('Active');
  });

  it('shows the platform scope note', () => {
    show({ scope: 'platform' });

    expect(screen.getByRole('note')).toHaveTextContent(accountScopeNote('platform'));
    expect(screen.getByRole('note')).not.toHaveTextContent("this institution's own administrators");
  });

  it('offers the actions by status and code, and none without a code', () => {
    const { unmount } = show();

    expect(screen.getByRole('button', { name: 'Suspend account' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Deactivate account' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Reactivate account' })).toBeNull();
    unmount();

    // `user.view` alone shows the record: no action, and no note about actions either.
    show({ permissions: ['user.view'] });
    expect(screen.queryByRole('button', { name: /account$/ })).toBeNull();
    expect(screen.queryByText(/deactivated/i)).toBeNull();
    expect(screen.queryByText(/Only an active account/)).toBeNull();
  });

  it('offers Reactivate alone for a suspended account', () => {
    show({ user: { userStatus: 'SUSPENDED' } });

    expect(screen.getByRole('button', { name: 'Reactivate account' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Suspend account' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Deactivate account' })).toBeNull();
  });

  it('says a deactivated account is final, with no action', () => {
    show({ user: { userStatus: 'DEACTIVATED' } });

    expect(screen.queryByRole('button', { name: /account$/ })).toBeNull();
    expect(
      screen.getByText("This account is deactivated. The platform can't reactivate it."),
    ).toBeVisible();
  });

  it('disables Suspend and Deactivate on your own record, comparing ids in one case', () => {
    show({ signedInUserId: ESI.toUpperCase() });

    for (const name of ['Suspend account', 'Deactivate account']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(OWN_ACCOUNT);
    }
    expect(screen.getAllByText(OWN_ACCOUNT)).toHaveLength(1);
  });

  it("leaves another person's account actionable", () => {
    show({ signedInUserId: '17000000-0000-4000-8000-0000000000ef' });

    expect(screen.getByRole('button', { name: 'Suspend account' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Deactivate account' })).toBeEnabled();
  });

  it("doesn't block anything when the signed-in person can't be told (a null id)", () => {
    show({ signedInUserId: null });

    expect(screen.getByRole('button', { name: 'Suspend account' })).toBeEnabled();
  });

  it('words a provisioning account', () => {
    show({ user: { userStatus: 'PROVISIONING_IDP', membershipStatus: 'PENDING_APPROVAL' } });

    expect(fact('Account')).toHaveTextContent('Provisioning identity');
    expect(within(fact('Membership in Acme SACCO')).getByText('Pending approval')).toBeVisible();
    expect(screen.queryByText(/idp/i)).toBeNull();
  });
});
