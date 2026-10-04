import { describe, expect, it } from 'vitest';
import { membershipDecisionSchema } from './approval-contract';

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
