import type { FakeMembership } from './state.mts';

/**
 * `ReferenceSequences.next` on the organisation's `MEMBER` counter (ADR 0040): the next number after
 * the highest any of its memberships holds. ponytail: no counter row is kept, since a number is
 * never edited and a membership never deleted, so the highest held is the counter's value.
 */
function nextMemberNumber(memberships: readonly FakeMembership[], organisationId: string): number {
  return (
    Math.max(
      0,
      ...memberships
        .filter((row) => row.organisationId === organisationId)
        .map((row) => row.memberNumber ?? 0),
    ) + 1
  );
}

/**
 * `JooqFoundationLifecyclePersistence.saveMembership` as a membership becomes ACTIVE: it keeps the
 * number it has (a reactivation, a re-invited member's next approval), or takes its organisation's
 * next one on its first activation.
 */
export function numberOnActivation(
  memberships: readonly FakeMembership[],
  membership: FakeMembership,
): void {
  membership.memberNumber ??= nextMemberNumber(memberships, membership.organisationId);
}

/** V35's backfill, for a seed: every membership that has been active (ACTIVE, or SUSPENDED, which
 * only an ACTIVE one becomes) is numbered per organisation, in seed order; V38 holds both to it. A
 * seeded REVOKED membership is one revoked before its approval (Hassan's), so it has none. */
export function numberSeededMembers(memberships: readonly FakeMembership[]): void {
  for (const membership of memberships) {
    if (membership.status === 'ACTIVE' || membership.status === 'SUSPENDED') {
      numberOnActivation(memberships, membership);
    }
  }
}
