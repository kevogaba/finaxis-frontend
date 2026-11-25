import { describe, expect, it } from 'vitest';
import { membershipDecisionSchema, pendingCountSchema } from './approval-contract';

// The activate response is a whole MembershipDetail; only its two statuses are read.
const wire = {
  id: 'c3000000-0000-4000-8000-000000000001',
  organisation_id: 'd4000000-0000-4000-8000-000000000001',
  user_id: 'e5000000-0000-4000-8000-000000000001',
  username: 'amina.odhiambo',
  email: 'amina.odhiambo@greenfield.example',
  display_name: 'Amina Odhiambo',
  user_status: 'PROVISIONING_IDP',
  membership_status: 'PENDING_APPROVAL',
  membership_type: 'STAFF',
  primary_branch_id: null,
  created_at: '2026-09-20T08:00:00Z',
  updated_at: '2026-09-20T08:00:00Z',
};

describe('membershipDecisionSchema', () => {
  it('reads the two statuses that tell a 200 from a 202, and nothing else', () => {
    expect(membershipDecisionSchema.parse(wire)).toEqual({
      membershipStatus: 'PENDING_APPROVAL',
      userStatus: 'PROVISIONING_IDP',
    });
  });

  it.each([
    ['an unknown membership status', { ...wire, membership_status: 'APPROVED' }],
    ['a missing user status', { ...wire, user_status: undefined }],
    ['an empty body', {}],
  ])('rejects %s (the action then claims neither outcome)', (_case, body) => {
    expect(membershipDecisionSchema.safeParse(body).success).toBe(false);
  });
});

// BG-22: `GET /tenant/approvals/pending-count` omits a key the caller can't approve
// (`@JsonInclude(NON_NULL)`): an absent key and a 0 mean different things.
describe('pendingCountSchema', () => {
  it.each([
    ['both kinds', { memberships: 8, branches: 2 }, { memberships: 8, branches: 2 }],
    ['memberships only', { memberships: 0 }, { memberships: 0 }],
    ['branches only', { branches: 3 }, { branches: 3 }],
    ['neither (never sent: that caller is refused)', {}, {}],
  ])('reads %s, keeping a missing key missing', (_case, wire, counts) => {
    const parsed = pendingCountSchema.parse(wire);
    expect(parsed).toEqual(counts);
    expect(Object.keys(parsed)).toEqual(Object.keys(counts));
  });

  it('ignores keys it doesn’t read', () => {
    expect(pendingCountSchema.parse({ memberships: 1, journals: 4 })).toEqual({ memberships: 1 });
  });

  it.each([
    ['a null count (the platform omits the key instead)', { memberships: null }],
    ['a fractional count', { branches: 1.5 }],
    ['a negative count', { memberships: -1 }],
    ['a count sent as text', { branches: '3' }],
  ])('rejects %s', (_case, wire) => {
    expect(pendingCountSchema.safeParse(wire).success).toBe(false);
  });
});
