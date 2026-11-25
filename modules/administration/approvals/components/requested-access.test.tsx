import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { SCOPED_ASSIGNMENTS_NOTE } from '@/modules/administration/users/user-rules';
import { SCOPED_ROLE_ASSIGNMENTS_NOTE } from '@/modules/administration/roles/role-rules';
import { renderWithProviders } from '@/test/test-utils';
import {
  BRANCHES_CAPPED,
  BRANCHES_NOT_PERMITTED,
  MEMBERSHIP_NOT_PERMITTED,
  NO_ACTIVE_BRANCH,
  NO_ACTIVE_BRANCH_SEEN,
  NO_ACTIVE_ROLE,
  NO_ACTIVE_ROLE_SEEN,
  READ_FAILED,
  ROLES_CAPPED,
  ROLES_NOT_PERMITTED,
} from '../approval-copy';
import { RequestedAccess } from './requested-access';

// The assignment tables import their revoke buttons' Server Actions; nothing here submits one.
vi.mock('@/modules/administration/roles/role-actions', () => ({
  assignRole: vi.fn(),
  revokeRoleAssignment: vi.fn(),
}));
vi.mock('@/modules/administration/branches/branch-actions', () => ({
  assignBranchUser: vi.fn(),
  revokeBranchAssignment: vi.fn(),
}));

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const MEMBERSHIP = 'a1000000-0000-4000-8000-0000000000aa';
const ROSE = 'b2000000-0000-4000-8000-0000000000bb';
const WESTLANDS = 'c3000000-0000-4000-8000-0000000000cc';
const UNKNOWN_BRANCH = 'd4000000-0000-4000-8000-0000000000dd';
const TELLER = 'e5000000-0000-4000-8000-0000000000ee';
const UNKNOWN_ROLE = '97000000-0000-4000-8000-0000000000ab';
const FAILED = {
  title: 'Something went wrong',
  message: 'Try again.',
  code: null,
  requestId: 'req-9',
};

const page = (count: number, hasNext = false) => ({
  number: 0,
  size: 100,
  totalItems: count,
  totalPages: 1,
  hasNext,
  hasPrevious: false,
});

type Props = ComponentProps<typeof RequestedAccess>;

const PROPS: Props = {
  userName: 'Rose Atieno',
  membershipType: 'STAFF',
  membership: {
    ok: true,
    value: {
      id: MEMBERSHIP,
      userId: ROSE,
      status: 'PENDING_APPROVAL',
      type: 'STAFF',
      primaryBranchId: WESTLANDS,
      createdAt: '2026-11-01T06:00:00Z',
      updatedAt: '2026-11-01T06:00:00Z',
      createdBy: null,
    },
  },
  roles: {
    ok: true,
    value: {
      items: [
        {
          id: 'f6000000-0000-4000-8000-0000000000f1',
          userId: ROSE,
          roleId: TELLER,
          scopeType: 'BRANCH',
          branchId: WESTLANDS,
          status: 'ACTIVE',
        },
      ],
      page: page(1),
    },
  },
  branches: {
    ok: true,
    value: {
      items: [
        {
          id: 'f6000000-0000-4000-8000-0000000000f2',
          userId: ROSE,
          branchId: WESTLANDS,
          assignmentType: 'HOME',
          status: 'ACTIVE',
          branchName: 'Westlands Branch',
          assignedAt: '2026-11-02T07:30:00Z',
        },
      ],
      page: page(1),
    },
  },
  timeZone: 'Africa/Nairobi',
  roleIndex: new Map([
    [TELLER, { name: 'Teller', code: 'TELLER', status: 'ACTIVE', systemRole: false }],
  ]),
  branchIndex: new Map([[WESTLANDS, { name: 'Westlands Branch', code: 'WESTLANDS' }]]),
  scopedView: false,
};

const show = (overrides: Partial<Props> = {}) =>
  renderWithProviders(<RequestedAccess {...PROPS} {...overrides} />);
const card = () => screen.getByRole('region', { name: 'Requested access' });
function fact(label: string): HTMLElement {
  const value = within(card()).getByText(label, { selector: 'dt' }).nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`"${label}" has no value cell`);
  return value;
}

describe('RequestedAccess', () => {
  it('shows the membership, then the roles and branches in keyboard-scrollable regions', () => {
    show();

    expect(fact('Membership type')).toHaveTextContent('Staff');
    expect(fact('Primary branch')).toHaveTextContent('Westlands Branch (WESTLANDS)');
    expect(within(card()).getByRole('heading', { level: 3, name: 'Roles' })).toBeInTheDocument();
    const roles = screen.getByRole('region', { name: 'Role assignments' });
    expect(roles).toHaveAttribute('tabindex', '0');
    expect(within(roles).getByText('Teller')).toBeInTheDocument();
    const branches = screen.getByRole('region', { name: 'Branch assignments table' });
    expect(branches).toHaveAttribute('tabindex', '0');
    // The embedded name and the date, in the organisation's time zone (BG-09).
    expect(within(branches).getByText('Westlands Branch')).toBeInTheDocument();
    expect(within(branches).getByText('02 Nov 2026 · 10:30')).toBeInTheDocument();
    // Nothing here can be revoked: this page decides the request, it doesn't edit access.
    expect(screen.queryByRole('button', { name: /Revoke/ })).toBeNull();
    // The card and the two scrolling tables are the only regions (each found by its own name above).
    expect(screen.getAllByRole('region')).toHaveLength(3);
  });

  it("says what the holder can't read, never none", () => {
    show({ membership: null, roles: null, branches: null });

    // The type comes with the user read (BG-09); the primary branch needs the membership.
    expect(fact('Membership type')).toHaveTextContent('Staff');
    expect(fact('Primary branch')).toHaveTextContent(MEMBERSHIP_NOT_PERMITTED);
    expect(screen.getByText(ROLES_NOT_PERMITTED)).toBeInTheDocument();
    expect(screen.getByText(BRANCHES_NOT_PERMITTED)).toBeInTheDocument();
    expect(screen.queryByText(NO_ACTIVE_ROLE)).toBeNull();
    expect(screen.queryByText(NO_ACTIVE_BRANCH)).toBeNull();
  });

  it('says a failed read failed, with its reference, never none (rule 9)', () => {
    show({
      membership: { ok: false, problem: FAILED },
      roles: { ok: false, problem: { ...FAILED, requestId: 'req-10' } },
      branches: { ok: false, problem: { ...FAILED, requestId: 'req-11' } },
    });

    expect(fact('Primary branch')).toHaveTextContent(READ_FAILED);
    expect(fact('Primary branch')).toHaveTextContent('Reference: req-9');
    expect(screen.getByText('Reference: req-10')).toBeInTheDocument();
    expect(screen.getByText('Reference: req-11')).toBeInTheDocument();
    expect(screen.queryByText(NO_ACTIVE_ROLE)).toBeNull();
    expect(screen.queryByText(NO_ACTIVE_BRANCH)).toBeNull();
  });

  // BG-03: a branch-scoped role_assignment.view lists only its branches' BRANCH-scope rows.
  it('says a branch-scoped view narrows the roles, and never says none', () => {
    show({ rolesScoped: true });
    expect(screen.getByRole('note')).toHaveTextContent(SCOPED_ROLE_ASSIGNMENTS_NOTE);

    const roles = PROPS.roles?.ok ? PROPS.roles.value : null;
    if (!roles) throw new Error('the fixture has roles');
    show({ rolesScoped: true, roles: { ok: true, value: { ...roles, items: [] } } });
    expect(screen.getByText(NO_ACTIVE_ROLE_SEEN)).toBeInTheDocument();
    expect(screen.queryByText(NO_ACTIVE_ROLE)).toBeNull();
  });

  it('says the roles are capped when one page doesn’t hold them all (rule 9)', () => {
    const roles = PROPS.roles?.ok ? PROPS.roles.value : null;
    if (!roles) throw new Error('the fixture has roles');
    show({ roles: { ok: true, value: { ...roles, page: page(101, true) } } });

    expect(screen.getByRole('note')).toHaveTextContent(ROLES_CAPPED);
  });

  it('says when the branches are capped, and when a branch-scoped view narrows them', () => {
    const branches = PROPS.branches?.ok ? PROPS.branches.value : null;
    if (!branches) throw new Error('the fixture has branches');
    show({
      branches: { ok: true, value: { ...branches, page: page(101, true) } },
      scopedView: true,
    });

    const notes = screen.getAllByRole('note').map((note) => note.textContent);
    expect(notes).toEqual([SCOPED_ASSIGNMENTS_NOTE, BRANCHES_CAPPED]);
  });

  it('says none when there are none', () => {
    show({
      roles: { ok: true, value: { items: [], page: page(0) } },
      branches: { ok: true, value: { items: [], page: page(0) } },
    });

    expect(screen.getByText(NO_ACTIVE_ROLE)).toBeInTheDocument();
    expect(screen.getByText(NO_ACTIVE_BRANCH)).toBeInTheDocument();
  });

  it('names a branch the index doesn’t know by its short id, and no primary branch as None', () => {
    const membership = PROPS.membership?.ok ? PROPS.membership.value : null;
    if (!membership) throw new Error('the fixture has a membership');
    const { unmount } = show({
      membership: { ok: true, value: { ...membership, primaryBranchId: UNKNOWN_BRANCH } },
    });
    expect(fact('Primary branch').textContent).toBe('d4000000');
    unmount();

    show({ membership: { ok: true, value: { ...membership, primaryBranchId: null } } });
    expect(fact('Primary branch')).toHaveTextContent('None');
  });

  it('says the branches are capped for a tenant-wide view, and still lists the page', () => {
    const branches = PROPS.branches?.ok ? PROPS.branches.value : null;
    if (!branches) throw new Error('the fixture has branches');
    show({ branches: { ok: true, value: { ...branches, page: page(101, true) } } });

    expect(screen.getAllByRole('note').map((note) => note.textContent)).toEqual([BRANCHES_CAPPED]);
    const table = screen.getByRole('region', { name: 'Branch assignments table' });
    expect(within(table).getByText('Westlands Branch')).toBeInTheDocument();
    expect(screen.queryByText(NO_ACTIVE_BRANCH)).toBeNull();
  });

  // BG-03: a search by user lists every branch to a tenant-wide view, the grant's branches else.
  it('says a branch-scoped view narrows the branches', () => {
    show({ scopedView: true });

    expect(screen.getAllByRole('note').map((note) => note.textContent)).toEqual([
      SCOPED_ASSIGNMENTS_NOTE,
    ]);
  });

  it('labels an institution-wide role, a role that grants nothing, and ids the indexes lack', () => {
    const roles = PROPS.roles?.ok ? PROPS.roles.value : null;
    if (!roles) throw new Error('the fixture has roles');
    const [first] = roles.items;
    if (!first) throw new Error('the fixture has a role');
    show({
      roles: {
        ok: true,
        value: {
          ...roles,
          items: [
            { ...first, scopeType: 'TENANT', branchId: null },
            {
              ...first,
              id: 'f6000000-0000-4000-8000-0000000000f3',
              roleId: UNKNOWN_ROLE,
              branchId: UNKNOWN_BRANCH,
            },
          ],
        },
      },
      roleIndex: new Map([
        [TELLER, { name: 'Teller', code: 'TELLER', status: 'DISABLED', systemRole: false }],
      ]),
    });

    const table = screen.getByRole('region', { name: 'Role assignments' });
    expect(within(table).getByText('All branches')).toBeInTheDocument();
    expect(within(table).getByText('TELLER')).toBeInTheDocument();
    expect(within(table).getByText('Disabled')).toBeInTheDocument();
    expect(within(table).getByText('97000000')).toBeInTheDocument();
    expect(within(table).getByText('d4000000')).toBeInTheDocument();
  });

  it('has no Actions column on either table', () => {
    show();

    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
  });

  it('never says none when a branch-scoped view hides rows (rule 9)', () => {
    show({ branches: { ok: true, value: { items: [], page: page(0) } }, scopedView: true });
    expect(screen.queryByText(NO_ACTIVE_BRANCH)).toBeNull();
    expect(screen.getByText(NO_ACTIVE_BRANCH_SEEN)).toBeInTheDocument();
  });
});
