import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { branchContextNote, PARTIAL_SCAN_NOTE } from '@/modules/administration/users/user-rules';
import { renderWithProviders } from '@/test/test-utils';
import {
  BRANCHES_NOT_PERMITTED,
  MEMBERSHIP_NOT_FOUND,
  MEMBERSHIP_NOT_PERMITTED,
  NO_ACTIVE_BRANCH,
  NO_ACTIVE_ROLE,
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
  membership: {
    ok: true,
    value: {
      id: MEMBERSHIP,
      userId: ROSE,
      status: 'PENDING_APPROVAL',
      type: 'STAFF',
      primaryBranchId: WESTLANDS,
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
  scan: {
    ok: true,
    value: {
      items: [
        {
          id: 'f6000000-0000-4000-8000-0000000000f2',
          userId: ROSE,
          branchId: WESTLANDS,
          assignmentType: 'HOME',
          status: 'ACTIVE',
        },
      ],
      truncated: false,
    },
  },
  roleIndex: new Map([
    [TELLER, { name: 'Teller', code: 'TELLER', status: 'ACTIVE', systemRole: false }],
  ]),
  branchIndex: new Map([[WESTLANDS, { name: 'Westlands Branch', code: 'WESTLANDS' }]]),
  selectedBranch: null,
  canSwitch: true,
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
    expect(within(branches).getByText('Westlands Branch')).toBeInTheDocument();
    // Nothing here can be revoked: this page decides the request, it doesn't edit access.
    expect(screen.queryByRole('button', { name: /Revoke/ })).toBeNull();
    // The card and the two scrolling tables are the only regions (each found by its own name above).
    expect(screen.getAllByRole('region')).toHaveLength(3);
  });

  it("says what the holder can't read, never none", () => {
    show({ membership: null, roles: null, scan: null });

    expect(fact('Membership type')).toHaveTextContent(MEMBERSHIP_NOT_PERMITTED);
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
      scan: { ok: false, problem: { ...FAILED, requestId: 'req-11' } },
    });

    expect(fact('Membership type')).toHaveTextContent(READ_FAILED);
    expect(fact('Membership type')).toHaveTextContent('Reference: req-9');
    expect(screen.getByText('Reference: req-10')).toBeInTheDocument();
    expect(screen.getByText('Reference: req-11')).toBeInTheDocument();
    expect(screen.queryByText(NO_ACTIVE_ROLE)).toBeNull();
    expect(screen.queryByText(NO_ACTIVE_BRANCH)).toBeNull();
  });

  it('says the roles are capped when one page doesn’t hold them all (rule 9)', () => {
    const roles = PROPS.roles?.ok ? PROPS.roles.value : null;
    if (!roles) throw new Error('the fixture has roles');
    show({ roles: { ok: true, value: { ...roles, page: page(101, true) } } });

    expect(screen.getByRole('note')).toHaveTextContent(ROLES_CAPPED);
  });

  it('says when the branch scan is partial, and when a selected branch narrows it', () => {
    const scan = PROPS.scan?.ok ? PROPS.scan.value : null;
    if (!scan) throw new Error('the fixture has a scan');
    show({
      scan: { ok: true, value: { ...scan, truncated: true } },
      selectedBranch: { name: 'Westlands Branch' },
      canSwitch: false,
    });

    const notes = screen.getAllByRole('note').map((note) => note.textContent);
    expect(notes).toEqual([branchContextNote('Westlands Branch', false), PARTIAL_SCAN_NOTE]);
  });

  it('says none when there are none, and a membership it couldn’t find', () => {
    show({
      membership: { ok: true, value: null },
      roles: { ok: true, value: { items: [], page: page(0) } },
      scan: { ok: true, value: { items: [], truncated: false } },
    });

    expect(fact('Membership type')).toHaveTextContent(MEMBERSHIP_NOT_FOUND);
    expect(screen.getByText(NO_ACTIVE_ROLE)).toBeInTheDocument();
    expect(screen.getByText(NO_ACTIVE_BRANCH)).toBeInTheDocument();
  });

  it('names a branch the index doesn’t know by its short id, and no primary branch as None', () => {
    const membership = PROPS.membership?.ok ? PROPS.membership.value : null;
    if (!membership) throw new Error('the fixture has a membership');
    const { unmount } = show({
      membership: { ok: true, value: { ...membership, primaryBranchId: UNKNOWN_BRANCH } },
    });
    expect(fact('Primary branch')).toHaveTextContent('d4000000');
    unmount();

    show({ membership: { ok: true, value: { ...membership, primaryBranchId: null } } });
    expect(fact('Primary branch')).toHaveTextContent('None');
  });
});
