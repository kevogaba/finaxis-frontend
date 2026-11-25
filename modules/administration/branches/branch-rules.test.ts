import { describe, expect, it } from 'vitest';
import type { BranchStatus } from './branch-contract';
import {
  availableBranchActions,
  branchDraftSchema,
  branchEditSchema,
  branchTypeLabel,
  canActOnBranch,
  canAssignUsers,
  changedBranchFields,
  canCreateBranch,
  canEditBranch,
  canRevokeAssignments,
  EDIT_DRAFT_WARNING,
  EDITABLE_BRANCH_STATES,
  isTimeZone,
  parentOptions,
  pendingBranchAction,
  scopedBranchView,
  sentBackNote,
  timeZones,
} from './branch-rules';

const ALL = [
  'branch.view',
  'branch.create',
  'branch.approve',
  'branch.suspend',
  'branch.reactivate',
  'branch.close',
];
/** Every code held tenant-wide. */
const wide = (permissions: readonly string[]) => ({ permissions, tenantPermissions: permissions });
// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const ME = 'a1000000-0000-4000-8000-0000000000aa';
const MARY = 'b2000000-0000-4000-8000-0000000000bb';
const actor = (id: string) => ({ id, displayName: null });
const A = 'branch-a';
const B = 'branch-b';

/** Branch A, which Mary drafted and submitted, as the record hands it to the rules. */
const branchIn = (status: BranchStatus, overrides = {}) => ({
  id: A,
  status,
  branchCode: 'THIKA_ROAD',
  createdBy: actor(MARY),
  submittedBy: actor(MARY),
  ...overrides,
});
const at = (id: string, status: BranchStatus = 'ACTIVE') => branchIn(status, { id });

/** `codes` held through one role at branches A and B, with `selected` the working context: its
 * grants are in `permissions` only while one of them is selected (`/auth/me`). */
const atAandB = (codes: readonly string[], selected: string | null) => ({
  permissions: selected === A || selected === B ? codes : [],
  tenantPermissions: [],
  branchPermissions: Object.fromEntries(codes.map((code) => [code, [A, B]])),
});
const DRAFT = {
  branchCode: 'NAIROBI_CBD',
  branchName: 'Nairobi CBD Branch',
  branchType: 'OPERATIONS',
  parentBranchId: '',
  timezone: 'Africa/Nairobi',
};

describe('branch rules', () => {
  it.each([
    ['DRAFT', ['submit', 'discard']],
    ['PENDING_APPROVAL', ['activate', 'return']],
    ['ACTIVE', ['suspend', 'close']],
    ['SUSPENDED', ['reactivate', 'close']],
    ['CLOSED', []],
    ['ARCHIVED', []],
  ] as const)('offers the %s transitions', (status, expected) => {
    expect(availableBranchActions(at(A, status), wide(ALL), ME)).toEqual(expected);
  });

  it('needs each code and branch.view, and submit is gated by branch.create (BG-31)', () => {
    expect(availableBranchActions(at(A), wide(['branch.view', 'branch.close']), ME)).toEqual([
      'close',
    ]);
    expect(
      availableBranchActions(at(A, 'DRAFT'), wide(['branch.view', 'branch.create']), ME),
    ).toEqual(['submit', 'discard']);
    expect(availableBranchActions(at(A), wide(['branch.suspend']), ME)).toEqual([]);
  });

  // BG-03: the route's own gate reads the selected context, and the service checks the target, a
  // tenant-wide grant or one at that branch, whichever branch is selected.
  it('acts on another branch through the same role there, while one of its branches is selected', () => {
    const codes = [...ALL, 'user.assign_branch', 'user.revoke_branch', 'branch_assignment.view'];
    const holder = { ...atAandB(codes, A), tenantPermissions: ['user.view'] };
    expect(availableBranchActions(at(B), holder, ME)).toEqual(['suspend', 'close']);
    expect(canAssignUsers(at(B), holder)).toBe(true);
    expect(canRevokeAssignments(holder, at(B))).toBe(true);
    // At All branches its grants pass no route gate, so nothing is offered anywhere.
    const institution = { ...atAandB(codes, null), tenantPermissions: ['user.view'] };
    expect(availableBranchActions(at(B), institution, ME)).toEqual([]);
    expect(canAssignUsers(at(B), institution)).toBe(false);
    expect(canRevokeAssignments(institution, at(B))).toBe(false);
    // A branch its grants don't name.
    expect(availableBranchActions(at('branch-c'), holder, ME)).toEqual([]);
    expect(canRevokeAssignments(holder, at('branch-c'))).toBe(false);
  });

  // #242: a branch-scope grant counts only while its branch is ACTIVE.
  it('acts on a branch that is not ACTIVE only tenant-wide', () => {
    const holder = atAandB(ALL, A);
    for (const status of ['SUSPENDED', 'PENDING_APPROVAL', 'DRAFT'] as const) {
      expect(availableBranchActions(at(B, status), holder, ME)).toEqual([]);
    }
    expect(
      canRevokeAssignments(
        atAandB(['user.revoke_branch', 'branch_assignment.view'], A),
        at(B, 'SUSPENDED'),
      ),
    ).toBe(false);
    expect(availableBranchActions(at(B, 'SUSPENDED'), wide(ALL), ME)).toEqual([
      'reactivate',
      'close',
    ]);
  });

  // BranchProvisioningService.returnForChanges: one route, two intents, told apart by the caller.
  it.each([
    ['its creator', { createdBy: actor(ME), submittedBy: actor(MARY) }, 'withdraw'],
    ['its latest submitter', { createdBy: actor(MARY), submittedBy: actor(ME) }, 'withdraw'],
    ['its creator, in capitals', { createdBy: actor(ME.toUpperCase()) }, 'withdraw'],
    ['anyone else', {}, 'return'],
    ['anyone, when the record names no maker', { createdBy: null, submittedBy: null }, 'return'],
  ] as const)('lets %s %s a pending branch', (_case, makers, intent) => {
    expect(pendingBranchAction({ ...branchIn('PENDING_APPROVAL'), ...makers }, ME)).toBe(intent);
  });

  it('withdraws with branch.create and returns with branch.approve, each with branch.view', () => {
    const own = branchIn('PENDING_APPROVAL', { createdBy: actor(ME) });
    const theirs = branchIn('PENDING_APPROVAL');
    const holder = (codes: string[]) => wide(['branch.view', ...codes]);

    expect(availableBranchActions(own, holder(['branch.create']), ME)).toEqual(['withdraw']);
    // A maker who also approves is still a maker: they withdraw, never return. The route's own
    // gate takes either code, but the target check wants the intent's, branch.create.
    expect(availableBranchActions(own, holder(['branch.approve']), ME)).toEqual(['activate']);
    expect(availableBranchActions(theirs, holder(['branch.approve']), ME)).toEqual([
      'activate',
      'return',
    ]);
    expect(availableBranchActions(theirs, holder(['branch.create']), ME)).toEqual([]);
    expect(availableBranchActions(theirs, wide(['branch.approve', 'branch.create']), ME)).toEqual(
      [],
    );
  });

  // Platform #242: a branch-scope grant counts only on an ACTIVE branch, so a pending one is
  // withdrawn or returned tenant-wide only, as Activate is, even were it the selected branch.
  it('offers a branch-scoped holder no Withdraw or Return on a pending branch', () => {
    const own = branchIn('PENDING_APPROVAL', { createdBy: actor(ME) });
    const theirs = branchIn('PENDING_APPROVAL');

    const scoped = (codes: string[]) => atAandB(['branch.view', ...codes], A);
    expect(availableBranchActions(own, scoped(['branch.create']), ME)).toEqual([]);
    expect(availableBranchActions(theirs, scoped(['branch.approve']), ME)).toEqual([]);
    // The code tenant-wide without its view there is not enough either (ADR 0030).
    expect(
      availableBranchActions(
        theirs,
        { permissions: ['branch.view', 'branch.approve'], tenantPermissions: ['branch.approve'] },
        ME,
      ),
    ).toEqual([]);
  });

  it('discards a draft with branch.create and branch.view held tenant-wide (#222)', () => {
    const draft = branchIn('DRAFT');
    const codes = ['branch.view', 'branch.create'];
    expect(availableBranchActions(draft, wide(codes), ME)).toEqual(['submit', 'discard']);
    // A grant on a branch never reaches a draft: only one held tenant-wide counts, for Submit too.
    expect(availableBranchActions(draft, atAandB(codes, A), ME)).toEqual([]);
    expect(
      availableBranchActions(
        draft,
        { permissions: codes, tenantPermissions: ['branch.create'] },
        ME,
      ),
    ).toEqual([]);
  });

  it('never offers to discard the head office, which the platform refuses by its code', () => {
    expect(
      availableBranchActions(branchIn('DRAFT', { branchCode: 'HEAD_OFFICE' }), wide(ALL), ME),
    ).toEqual(['submit']);
  });

  it('says why a draft came back, and nothing for any other reason or state', () => {
    expect(sentBackNote({ status: 'DRAFT', statusReason: 'Fix the parent' })).toBe(
      'Sent back: Fix the parent',
    );
    expect(sentBackNote({ status: 'DRAFT', statusReason: null })).toBeNull();
    expect(sentBackNote({ status: 'SUSPENDED', statusReason: 'Cash count' })).toBeNull();
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
    expect(availableBranchActions(at(A, 'PENDING_APPROVAL'), scoped, ME)).toEqual([]);
    expect(availableBranchActions(at(A, 'DRAFT'), scoped, ME)).toEqual([]);
  });

  it('says a branch-scoped branch.view lists only its branches', () => {
    expect(scopedBranchView(wide(['branch.view']))).toBe(false);
    expect(scopedBranchView(atAandB(['branch.view'], A))).toBe(true);
  });

  it('edits a DRAFT or ACTIVE branch with branch.update and branch.view (BG-13)', () => {
    const codes = ['branch.view', 'branch.update'];
    expect(EDITABLE_BRANCH_STATES).toEqual(['DRAFT', 'ACTIVE']);
    expect(canEditBranch(at(A), wide(codes))).toBe(true);
    expect(canEditBranch(at(A, 'DRAFT'), wide(codes))).toBe(true);
    for (const status of ['PENDING_APPROVAL', 'SUSPENDED', 'CLOSED', 'ARCHIVED'] as const) {
      expect(canEditBranch(at(A, status), wide(codes))).toBe(false);
    }
    // Review Focus 3: the mutation without its view (ADR 0030).
    expect(canEditBranch(at(A), wide(['branch.update']))).toBe(false);
  });

  it('edits through a branch-scope grant only at that ACTIVE branch, while it is selected', () => {
    const codes = ['branch.view', 'branch.update'];
    // The route's gate reads the selected context; the target check, the grant at the branch.
    expect(canEditBranch(at(A), atAandB(codes, A))).toBe(true);
    // Selected at B, the grant at A still passes both checks: B's grant opens the route.
    expect(canEditBranch(at(A), atAandB(codes, B))).toBe(true);
    // At All branches the route's gate sees no branch.update.
    expect(canEditBranch(at(A), atAandB(codes, null))).toBe(false);
    // A branch-scope grant reaches no draft (#242), even the selected branch's.
    expect(canEditBranch(at(A, 'DRAFT'), atAandB(codes, A))).toBe(false);
    // Nor a branch it doesn't name.
    expect(canEditBranch(at('branch-c'), atAandB(codes, A))).toBe(false);
  });

  it('warns that editing a draft costs its editor the activation', () => {
    expect(EDIT_DRAFT_WARNING).toBe(
      "If you edit this draft, you won't be able to activate it yourself.",
    );
  });

  it('offers as parents every open branch but itself and those below it', () => {
    const entry = (name: string, parentId: string | null, status = 'ACTIVE') => ({
      name,
      code: name.toUpperCase(),
      parentId,
      status,
    });
    const index = new Map([
      ['hq', entry('Head', null)],
      ['me', entry('Me', 'hq')],
      ['child', entry('Child', 'me')],
      ['grandchild', entry('Grandchild', 'child', 'DRAFT')],
      ['sibling', entry('Sibling', 'hq', 'SUSPENDED')],
      ['closed', entry('Closed', null, 'CLOSED')],
      ['archived', entry('Archived', null, 'ARCHIVED')],
    ]);
    expect(parentOptions(index, 'me', 'hq')).toEqual([
      { id: 'hq', label: 'Head (HEAD)' },
      { id: 'sibling', label: 'Sibling (SIBLING)' },
    ]);
    // The current parent stays listed even once closed, so the field still shows it.
    expect(parentOptions(index, 'me', 'closed').map((option) => option.id)).toEqual([
      'hq',
      'sibling',
      'closed',
    ]);
    // A parent the index lacks (past its ceiling, or unreadable) by its short id.
    const parent = 'c3000000-0000-4000-8000-0000000000cc';
    expect(parentOptions(new Map(), 'me', parent)).toEqual([{ id: parent, label: 'c3000000' }]);
  });

  describe('changedBranchFields (BG-13)', () => {
    const stored = {
      branchName: 'Westlands Branch',
      parentBranchId: null,
      timezone: 'Africa/Nairobi',
      address: { line_1: 'Mpaka Road', city: ' Nairobi ', building: 'Block B' },
    };
    const values = {
      ...DRAFT,
      branchName: 'Westlands Branch',
      line_1: 'Mpaka Road',
      line_2: '',
      city: 'Nairobi',
      region: '',
      postal_code: '',
    };

    it('is empty when nothing changed, whatever whitespace was stored', () => {
      expect(changedBranchFields(stored, values)).toEqual({});
    });

    it('names each changed field, an emptied parent as ""', () => {
      expect(
        changedBranchFields(stored, {
          ...values,
          branchName: 'Westlands Mall',
          timezone: 'Africa/Kampala',
        }),
      ).toEqual({ branchName: 'Westlands Mall', timezone: 'Africa/Kampala' });
      expect(changedBranchFields({ ...stored, parentBranchId: 'hq' }, values)).toEqual({
        parentBranchId: '',
      });
      expect(changedBranchFields(stored, { ...values, parentBranchId: 'hq' })).toEqual({
        parentBranchId: 'hq',
      });
    });

    it('sends the five address fields together, with the other stored keys as JSON', () => {
      expect(changedBranchFields(stored, { ...values, city: 'Kisumu' })).toEqual({
        line_1: 'Mpaka Road',
        line_2: '',
        city: 'Kisumu',
        region: '',
        postal_code: '',
        otherAddress: '{"building":"Block B"}',
      });
      // No other stored key, no JSON.
      expect(changedBranchFields({ ...stored, address: { city: 'Nairobi' } }, values)).toEqual({
        line_1: 'Mpaka Road',
        line_2: '',
        city: 'Nairobi',
        region: '',
        postal_code: '',
      });
    });
  });

  it('takes an optional address of at most 120 characters a field, trimmed (Q9)', () => {
    expect(
      branchDraftSchema.parse({ ...DRAFT, line_1: ' Kenyatta Avenue ', postal_code: '' }),
    ).toMatchObject({ line_1: 'Kenyatta Avenue', postal_code: '' });
    const long = branchDraftSchema.safeParse({ ...DRAFT, city: 'x'.repeat(121) });
    expect(long.success).toBe(false);
    expect(long.error?.issues[0]).toMatchObject({
      path: ['city'],
      message: 'Use at most 120 characters.',
    });
  });

  it('edits with the fixed code and type unchecked, and keeps an unusual stored zone', () => {
    const schema = branchEditSchema({ timezone: '+05:30', address: {} });
    const values = { ...DRAFT, branchCode: 'legacy code', branchType: 'x'.repeat(80) };
    expect(schema.safeParse({ ...values, timezone: '+05:30' }).success).toBe(true);
    expect(schema.safeParse({ ...values, timezone: 'Africa/Kampala' }).success).toBe(true);
    expect(schema.safeParse({ ...values, timezone: '+03:00' }).success).toBe(false);
    expect(schema.safeParse({ ...values, branchName: 'N' }).success).toBe(false);
  });

  it('caps only an address value the user changed, so a long stored one never blocks a save', () => {
    const stored = 'Plot 7, '.repeat(20).trim(); // 159 characters: the platform caps none
    const schema = branchEditSchema({
      timezone: 'Africa/Nairobi',
      address: { line_1: ` ${stored} `, city: 'Nairobi' },
    });
    const values = { ...DRAFT, line_1: stored, city: 'Nairobi' };
    // A name-only edit, the long line untouched (the form trims, as the comparison does).
    expect(schema.safeParse({ ...values, branchName: 'Westlands Mall' }).success).toBe(true);
    // A changed neighbour sends it back unchanged: still accepted.
    expect(schema.safeParse({ ...values, city: 'Kisumu' }).success).toBe(true);
    // Changed, it must fit the 120.
    const edited = schema.safeParse({ ...values, line_1: `${stored}!` });
    expect(edited.error?.issues).toEqual([
      expect.objectContaining({ path: ['line_1'], message: 'Use at most 120 characters.' }),
    ]);
    // A field stored short and changed to something long is refused too.
    expect(schema.safeParse({ ...values, region: 'x'.repeat(121) }).success).toBe(false);
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
