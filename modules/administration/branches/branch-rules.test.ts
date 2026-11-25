import { describe, expect, it } from 'vitest';
import {
  availableBranchActions,
  branchDraftSchema,
  canActOnBranch,
  branchTypeLabel,
  canAssignUsers,
  canCreateBranch,
  canRevokeAssignments,
  isTimeZone,
  scopedBranchView,
  timeZones,
} from './branch-rules';
import type { BranchStatus } from './branch-contract';

const ALL = [
  'branch.view',
  'branch.create',
  'branch.approve',
  'branch.suspend',
  'branch.reactivate',
  'branch.close',
];
const DRAFT = {
  branchCode: 'NAIROBI_CBD',
  branchName: 'Nairobi CBD Branch',
  branchType: 'OPERATIONS',
  parentBranchId: '',
  timezone: 'Africa/Nairobi',
};

/** Every code held tenant-wide. */
const wide = (permissions: readonly string[]) => ({ permissions, tenantPermissions: permissions });

const A = 'branch-a';
const B = 'branch-b';
const at = (id: string, status: BranchStatus = 'ACTIVE') => ({ id, status });

/** `codes` held through one role at branches A and B, with `selected` the working context: its
 * grants are in `permissions` only while one of them is selected (`/auth/me`). */
const atAandB = (codes: readonly string[], selected: string | null) => ({
  permissions: selected === A || selected === B ? codes : [],
  tenantPermissions: [],
  branchPermissions: Object.fromEntries(codes.map((code) => [code, [A, B]])),
});

describe('branch rules', () => {
  it.each([
    ['DRAFT', ['submit']],
    ['PENDING_APPROVAL', ['activate']],
    ['ACTIVE', ['suspend', 'close']],
    ['SUSPENDED', ['reactivate', 'close']],
    ['CLOSED', []],
    ['ARCHIVED', []],
  ] as const)('offers the %s transitions', (status, expected) => {
    expect(availableBranchActions(at(A, status), wide(ALL))).toEqual(expected);
  });

  it('needs each code and branch.view, and submit is gated by branch.create (BG-31)', () => {
    expect(availableBranchActions(at(A), wide(['branch.view', 'branch.close']))).toEqual(['close']);
    expect(availableBranchActions(at(A, 'DRAFT'), wide(['branch.view', 'branch.create']))).toEqual([
      'submit',
    ]);
    expect(availableBranchActions(at(A), wide(['branch.suspend']))).toEqual([]);
  });

  // BG-03: the route's own gate reads the selected context, and the service checks the target, a
  // tenant-wide grant or one at that branch, whichever branch is selected.
  it('acts on another branch through the same role there, while one of its branches is selected', () => {
    const codes = [...ALL, 'user.assign_branch', 'user.revoke_branch', 'branch_assignment.view'];
    const holder = { ...atAandB(codes, A), tenantPermissions: ['user.view'] };
    expect(availableBranchActions(at(B), holder)).toEqual(['suspend', 'close']);
    expect(canAssignUsers(at(B), holder)).toBe(true);
    expect(canRevokeAssignments(holder, at(B))).toBe(true);
    // At All branches its grants pass no route gate, so nothing is offered anywhere.
    const institution = { ...atAandB(codes, null), tenantPermissions: ['user.view'] };
    expect(availableBranchActions(at(B), institution)).toEqual([]);
    expect(canAssignUsers(at(B), institution)).toBe(false);
    expect(canRevokeAssignments(institution, at(B))).toBe(false);
    // A branch its grants don't name.
    expect(availableBranchActions(at('branch-c'), holder)).toEqual([]);
    expect(canRevokeAssignments(holder, at('branch-c'))).toBe(false);
  });

  // #242: a branch-scope grant counts only while its branch is ACTIVE.
  it('acts on a branch that is not ACTIVE only tenant-wide', () => {
    const holder = atAandB(ALL, A);
    for (const status of ['SUSPENDED', 'PENDING_APPROVAL', 'DRAFT'] as const) {
      expect(availableBranchActions(at(B, status), holder)).toEqual([]);
    }
    expect(
      canRevokeAssignments(
        atAandB(['user.revoke_branch', 'branch_assignment.view'], A),
        at(B, 'SUSPENDED'),
      ),
    ).toBe(false);
    expect(availableBranchActions(at(B, 'SUSPENDED'), wide(ALL))).toEqual(['reactivate', 'close']);
  });

  it('offers the create flow only with branch.create and branch.view tenant-wide (spec §6.6)', () => {
    expect(canCreateBranch(wide(['branch.create']))).toBe(false);
    expect(canCreateBranch(wide(['branch.view']))).toBe(false);
    expect(canCreateBranch(wide(['branch.create', 'branch.view']))).toBe(true);
    // The platform checks branch.create tenant-wide (requireTenantPermission): a branch-scoped
    // holder creates nothing, even with their branch selected.
    expect(canCreateBranch(atAandB(['branch.create', 'branch.view'], A))).toBe(false);
    expect(
      canCreateBranch({
        permissions: ['branch.create', 'branch.view'],
        tenantPermissions: ['branch.create'],
        branchPermissions: { 'branch.view': [A] },
      }),
    ).toBe(false);
  });

  it('assigns only to an ACTIVE branch, with all three codes', () => {
    const codes = ['user.assign_branch', 'branch_assignment.view', 'user.view'];
    const holder = wide(codes);
    expect(canAssignUsers(at(A), holder)).toBe(true);
    expect(canAssignUsers(at(A, 'SUSPENDED'), holder)).toBe(false);
    // Review Focus 3: the mutation without its view (ADR 0030).
    expect(canAssignUsers(at(A), wide(['user.assign_branch', 'user.view']))).toBe(false);
    // The drawer's user search (GET /tenant/users) needs user.view tenant-wide (BG-33).
    expect(
      canAssignUsers(at(A), { permissions: codes, tenantPermissions: codes.slice(0, 2) }),
    ).toBe(false);
    expect(
      canRevokeAssignments(wide(['user.revoke_branch', 'branch_assignment.view']), at(A)),
    ).toBe(true);
    expect(canRevokeAssignments(wide(['user.revoke_branch']), at(A))).toBe(false);
  });

  it('acts on an ACTIVE branch through a grant at it, and on any other only tenant-wide', () => {
    const scoped = atAandB(['branch.approve', 'branch.view'], A);
    expect(canActOnBranch(scoped, 'branch.approve', at(A))).toBe(true);
    expect(canActOnBranch(scoped, 'branch.approve', at('branch-c'))).toBe(false);
    // A branch-scoped approver, a pending branch: not offered, even were it the selected one.
    for (const status of ['PENDING_APPROVAL', 'DRAFT'] as const) {
      expect(canActOnBranch(scoped, 'branch.approve', at(A, status))).toBe(false);
      expect(
        canActOnBranch(wide(['branch.approve', 'branch.view']), 'branch.approve', at(A, status)),
      ).toBe(true);
    }
    // The views a mutation implies, at the same scope (ADR 0030).
    expect(canActOnBranch(wide(['branch.approve']), 'branch.approve', at(A))).toBe(false);
    // A route that names other codes: its gate takes any of them, the target check the intent's.
    const maker = { ...wide(['branch.view']), permissions: ['branch.create', 'branch.view'] };
    expect(
      canActOnBranch(maker, 'branch.approve', at(A), ['branch.create', 'branch.approve']),
    ).toBe(false);
    expect(
      canActOnBranch(wide(['branch.approve', 'branch.view']), 'branch.approve', at(A), [
        'branch.create',
        'branch.approve',
      ]),
    ).toBe(true);
  });

  it('offers a branch-scoped approver no Activate, nor Submit, on a pending or draft branch', () => {
    const scoped = { ...atAandB(ALL, A), tenantPermissions: ['branch.view'] };
    expect(availableBranchActions(at(A, 'PENDING_APPROVAL'), scoped)).toEqual([]);
    expect(availableBranchActions(at(A, 'DRAFT'), scoped)).toEqual([]);
  });

  it('says a branch-scoped branch.view lists only its branches', () => {
    expect(scopedBranchView(wide(['branch.view']))).toBe(false);
    expect(scopedBranchView(atAandB(['branch.view'], A))).toBe(true);
  });

  it('labels enum-like types and keeps free text as typed', () => {
    expect(branchTypeLabel('HEAD_OFFICE')).toBe('Head office');
    expect(branchTypeLabel('Service centre')).toBe('Service centre');
  });

  it('validates a draft like the backend does, plus a real timezone', () => {
    expect(branchDraftSchema.safeParse(DRAFT).success).toBe(true);
    expect(branchDraftSchema.safeParse({ ...DRAFT, branchCode: 'nairobi cbd' }).success).toBe(
      false,
    );
    expect(branchDraftSchema.safeParse({ ...DRAFT, branchCode: 'X' }).success).toBe(false);
    expect(branchDraftSchema.safeParse({ ...DRAFT, branchName: 'N' }).success).toBe(false);
    expect(branchDraftSchema.safeParse({ ...DRAFT, timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(branchDraftSchema.safeParse({ ...DRAFT, parentBranchId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });

  it.each(['Africa/Nairobi', 'UTC', 'Etc/UTC', 'Etc/GMT-3', 'Etc/GMT+12', 'America/New_York'])(
    'accepts the IANA id %s',
    (zone) => {
      expect(isTimeZone(zone)).toBe(true);
    },
  );

  // The platform refuses a raw offset (TimeZoneRule, #276), though Intl formats with one.
  it.each([
    '+03:00',
    '-05:00',
    'UTC+3',
    'GMT+3',
    'Mars/Olympus',
    'africa/nairobi',
    'AFRICA/NAIROBI',
    'Utc',
    'ETC/GMT-3',
    'EST',
    'HST',
    'ROC',
    'GMT+0',
    'US/Pacific-New',
    'Etc/GMT+13',
    '',
  ])('refuses %j', (zone) => {
    expect(isTimeZone(zone)).toBe(false);
  });

  it('lists the runtime zones with both UTC spellings, sorted, a current one it lacks first', () => {
    const zones = timeZones();
    expect(zones).toContain('Africa/Nairobi');
    expect(zones).toContain('UTC');
    expect(zones).toContain('Etc/UTC');
    expect(zones).toEqual([...zones].sort());
    expect(new Set(zones).size).toBe(zones.length);
    expect(timeZones('Etc/GMT-3')[0]).toBe('Etc/GMT-3');
    expect(timeZones('UTC')).toEqual(zones);
  });
});
