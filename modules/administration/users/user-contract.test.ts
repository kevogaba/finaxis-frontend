import { describe, expect, it } from 'vitest';
import {
  MEMBERSHIP_STATUSES,
  MEMBERSHIP_TYPES,
  USER_STATUSES,
  membershipDetailSchema,
  membershipPageSchema,
  userPageSchema,
  userSummarySchema,
} from './user-contract';

const USER = '10000000-0000-4000-8000-00000000000d';
const MEMBERSHIP = '20000000-0000-4000-8000-000000000001';
const ORGANISATION = '11111111-1111-4111-8111-111111111111';
const BRANCH = '44444444-4444-4444-8444-444444444444';
const VICTOR = '10000000-0000-4000-8000-000000000001';
const INVITER = { id: VICTOR, display_name: 'Victor Otieno' };
const PAGE = {
  number: 0,
  size: 10,
  total_items: 1,
  total_pages: 1,
  has_next: false,
  has_previous: false,
};

const wireUser = {
  id: USER,
  username: 'felix.omondi',
  email: 'felix.omondi@greenfield.example',
  display_name: 'Felix Omondi',
  user_status: 'ACTIVE',
  membership_status: 'ACTIVE',
  membership_id: MEMBERSHIP,
  membership_type: 'STAFF',
  created_at: '2026-06-01T08:00:00Z',
  membership_created_at: '2026-07-01T08:00:00Z',
  created_by: INVITER,
};

const wireMembership = {
  id: MEMBERSHIP,
  user_id: USER,
  membership_status: 'ACTIVE',
  membership_type: 'STAFF',
  primary_branch_id: BRANCH,
  created_by: INVITER,
};

const wireDetail = {
  ...wireMembership,
  organisation_id: ORGANISATION,
  username: 'felix.omondi',
  email: 'felix.omondi@greenfield.example',
  display_name: 'Felix Omondi',
  user_status: 'ACTIVE',
  created_at: '2026-07-01T08:00:00Z',
  updated_at: '2026-07-24T08:00:00Z',
};

describe('user contract', () => {
  it('maps a user summary to camelCase and ignores extra fields', () => {
    expect(userSummarySchema.parse({ ...wireUser, last_login_at: null })).toEqual({
      id: USER,
      username: 'felix.omondi',
      email: 'felix.omondi@greenfield.example',
      displayName: 'Felix Omondi',
      userStatus: 'ACTIVE',
      membershipStatus: 'ACTIVE',
      membershipId: MEMBERSHIP,
      membershipType: 'STAFF',
      createdAt: '2026-06-01T08:00:00Z',
      membershipCreatedAt: '2026-07-01T08:00:00Z',
      createdBy: { id: VICTOR, displayName: 'Victor Otieno' },
    });
  });

  it('keeps a null inviter and an inviter with no display name (BG-08)', () => {
    expect(userSummarySchema.parse({ ...wireUser, created_by: null }).createdBy).toBeNull();
    expect(
      userSummarySchema.parse({ ...wireUser, created_by: { id: VICTOR, display_name: null } })
        .createdBy,
    ).toEqual({ id: VICTOR, displayName: null });
    expect(membershipDetailSchema.parse({ ...wireDetail, created_by: null }).createdBy).toBeNull();
  });

  it.each([
    ['an unknown user status', { ...wireUser, user_status: 'BLOCKED' }],
    ['an unknown membership status', { ...wireUser, membership_status: 'INVITED' }],
    ['a missing field', { ...wireUser, display_name: undefined }],
    ['a malformed id', { ...wireUser, id: 'not-a-uuid' }],
    ['an absent inviter', { ...wireUser, created_by: undefined }],
    ['an unknown membership type', { ...wireUser, membership_type: 'GUEST' }],
  ])('rejects %s', (_case, wire) => {
    expect(userSummarySchema.safeParse(wire).success).toBe(false);
  });

  it('accepts every documented status and rejects a lower-case one', () => {
    for (const userStatus of USER_STATUSES) {
      expect(userSummarySchema.safeParse({ ...wireUser, user_status: userStatus }).success).toBe(
        true,
      );
    }
    for (const membershipStatus of MEMBERSHIP_STATUSES) {
      expect(
        userSummarySchema.safeParse({ ...wireUser, membership_status: membershipStatus }).success,
      ).toBe(true);
    }
    expect(userSummarySchema.safeParse({ ...wireUser, user_status: 'active' }).success).toBe(false);
  });

  it('maps a page of users with its paging metadata', () => {
    const page = userPageSchema.parse({ items: [wireUser], page: PAGE });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.displayName).toBe('Felix Omondi');
    expect(page.page.totalItems).toBe(1);
  });

  it('rejects a page when one user carries an unknown status', () => {
    expect(
      userPageSchema.safeParse({
        items: [wireUser, { ...wireUser, user_status: 'BLOCKED' }],
        page: PAGE,
      }).success,
    ).toBe(false);
  });

  it('maps a membership summary, keeping a null primary branch', () => {
    const page = membershipPageSchema.parse({
      items: [wireMembership, { ...wireMembership, primary_branch_id: null }],
      page: PAGE,
    });
    expect(page.items[0]).toEqual({
      id: MEMBERSHIP,
      userId: USER,
      status: 'ACTIVE',
      type: 'STAFF',
      primaryBranchId: BRANCH,
      createdBy: { id: VICTOR, displayName: 'Victor Otieno' },
    });
    expect(page.items[1]).toMatchObject({ primaryBranchId: null });
  });

  it('rejects an unknown membership type', () => {
    expect(
      membershipPageSchema.safeParse({
        items: [{ ...wireMembership, membership_type: 'GUEST' }],
        page: PAGE,
      }).success,
    ).toBe(false);
  });

  it('accepts every documented membership type', () => {
    for (const membershipType of MEMBERSHIP_TYPES) {
      expect(
        membershipPageSchema.safeParse({
          items: [{ ...wireMembership, membership_type: membershipType }],
          page: PAGE,
        }).success,
      ).toBe(true);
    }
  });

  it('rejects an unknown membership status on the summary', () => {
    expect(
      membershipPageSchema.safeParse({
        items: [{ ...wireMembership, membership_status: 'INVITED' }],
        page: PAGE,
      }).success,
    ).toBe(false);
  });

  it('maps a membership detail with its instants', () => {
    expect(membershipDetailSchema.parse(wireDetail)).toEqual({
      id: MEMBERSHIP,
      userId: USER,
      status: 'ACTIVE',
      type: 'STAFF',
      primaryBranchId: BRANCH,
      createdAt: '2026-07-01T08:00:00Z',
      updatedAt: '2026-07-24T08:00:00Z',
      createdBy: { id: VICTOR, displayName: 'Victor Otieno' },
    });
  });

  it.each([
    ['an unknown user status', { ...wireDetail, user_status: 'BLOCKED' }],
    ['an unknown membership status', { ...wireDetail, membership_status: 'INVITED' }],
    ['an unknown membership type', { ...wireDetail, membership_type: 'GUEST' }],
    ['a malformed organisation id', { ...wireDetail, organisation_id: 'not-a-uuid' }],
  ])('rejects %s on the detail', (_case, wire) => {
    expect(membershipDetailSchema.safeParse(wire).success).toBe(false);
  });

  it('rejects a date-only instant on the detail', () => {
    expect(
      membershipDetailSchema.safeParse({ ...wireDetail, created_at: '2026-07-01' }).success,
    ).toBe(false);
    expect(
      membershipDetailSchema.safeParse({ ...wireDetail, updated_at: '2026-07-01' }).success,
    ).toBe(false);
  });
});
