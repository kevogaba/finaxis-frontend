# bg-adopt 08 — Read makers from records and honour the maker-checker switches — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** Who made a request now comes from the record itself (`created_by`, `submitted_by`,
`requested_by`), not from the audit log. So it works without `audit.view` and from the platform
context, and a re-invited member's maker is the re-inviter.

Approve is disabled for the maker only when a maker-checker switch is known to be on. When the
switch is off, the maker may approve, and the dialog says that approval is audited as high severity.
When the switch can't be read, Approve stays enabled and the platform's named refusal (PR 03)
explains a refusal (decision Q4).

**Architecture:**

- **Actor ref:** a shared `actorRefSchema` in `lib/api/wire.ts` feeds the branch, membership, user
  and tenant contracts.
- **Audit-log maker reads:** deleted.
- **Maker gating:** a small pure rule decides each maker gate from the maker id, the caller id, and
  the switch: `'on' | 'off' | 'unknown'`.
- **Switch read:** a server-only reader fetches the switch with
  `GET /tenant/settings/{key}`. It answers `'unknown'` without `settings.view`, or when the read
  fails.

**Spec:** [§8 entry 08](../specs/2026-11-24-backend-gap-adoption-design.md#08--makers-and-switches)
· designs `#d-makers` · register BG-08, and items 6 and 8.

## Wire facts (platform `6a8ea28`)

- **`ActorRef`:** `{ id: string, display_name: string | null } | null`. It is `null` when the actor
  is unknown, the system, or hidden. A tenant caller sees a maker only when the maker is a member of
  that tenant.
- **Where makers appear**
  - **Branches** (tenant and platform routes, summary and detail): `created_by`, `submitted_by`.
  - **Memberships** (items and detail) and `/tenant/users` (items and detail): `created_by`, the
    inviter, or the re-inviter after a re-invite. Users also carry `membership_id`,
    `membership_type`, `created_at` and `membership_created_at`.
  - **Platform tenants** (summary and detail): `requested_by`, `submitted_by`. They are `null` on
    `GET /tenant`.
- **Refusals** (PR 03 already explains them):
  - Membership activate refuses `created_by` (`approver_is_membership_maker`) and the member themself
    (`approver_is_membership_beneficiary`).
  - Tenant branch activate refuses `created_by` and anyone who edited the branch (`…_branch_maker` /
    `…_branch_modifier`).
  - Platform branch activate also refuses `submitted_by`.
  - Tenant approve and reject refuse `requested_by` and `submitted_by` (`…_tenant_maker`), plus
    editors (`…_tenant_modifier`).
- **The switches**
  - `require_maker_checker_for_user_invites` covers membership approval;
    `require_maker_checker_for_branch_creation` covers branch activation.
  - Each is on unless the stored value is the literal `"false"`.
  - **Off** relaxes the maker, the beneficiary (memberships) and editors (branches), each audited
    HIGH. It never relaxes the platform checker routes, and never tenant approval, which is
    platform-only.
  - Reading a switch needs `settings.view`: `GET /tenant/settings/{key}` returns the setting detail.

## Interfaces

- `lib/api/wire.ts`:
  - `export const actorRefSchema` parses snake_case to `{ id: string; displayName: string | null } | null`.
  - `export type ActorRef = z.output<typeof actorRefSchema>`.
- Contracts gain these fields:
  - `branch-contract.ts`: `createdBy` and `submittedBy` on summary and detail.
  - `user-contract.ts`: `createdBy` on membership summary and detail, and on user summary and
    detail; plus `membershipId`, `membershipType`, `createdAt` and `membershipCreatedAt` on users.
  - `tenant-contract.ts`: `requestedBy` and `submittedBy` on summary and detail.
- `modules/administration/approvals/maker-checker.ts` (new, pure):
  - `export type SwitchState = 'on' | 'off' | 'unknown'`.
  - `export function makerGate(input: { makerIds: readonly (string | null | undefined)[]; callerId: string; switchState: SwitchState }): 'allowed' | 'blocked' | 'allowed-self-approval'`
    - `'blocked'`: the caller is a maker and the switch is `'on'`.
    - `'allowed-self-approval'`: the caller is a maker and the switch is `'off'`.
    - Otherwise `'allowed'`, including a maker whose switch is `'unknown'`.
  - Ids compare case-insensitively.
- `modules/administration/settings/settings-service.ts`:
  - `export async function readMakerCheckerSwitch(kind: 'user_invites' | 'branch_creation', holder: PermissionHolder): Promise<SwitchState>`.
  - It answers `'unknown'` without `settings.view`. Otherwise it reads the key: `'off'` when the
    value is `"false"`, `'on'` for anything else. A failed read answers `'unknown'`.
- Copy (approved):
  - `SELF_APPROVAL_NOTE_USERS`: "Maker-checker is off for user invitations. You invited this person.
    Approving is allowed and recorded as a high-severity event."
  - `SELF_APPROVAL_NOTE_BRANCHES`: "Maker-checker is off for branch creation. You drafted this
    branch. Activating is allowed and recorded as a high-severity event."
  - Blocked captions keep today's wording: "You invited this person, so someone else must approve
    them." and "You drafted this branch, so someone else must activate it."
  - New for the institution record: "You requested or submitted this institution, so another
    platform administrator must decide it."

---

### Task 1: Actor refs on the wire

- [ ] Failing contract tests, for each contract: the snake_case fields parse, `null` parses, and a
      `display_name: null` parses.
- [ ] Implement `actorRefSchema` and the contract fields; PASS.
- [ ] Fake API: emit `created_by`/`submitted_by` on branches (`routes/branches.mts`,
      `routes/tenant-reads.mts`, the platform branch routes), `created_by` on memberships and users,
      and the users' membership fields. - Emit `requested_by`/`submitted_by` on platform tenants. - `FakeBranch.draftedBy`, `FakeMembership.invitedBy` and the organisation's creator/submitter
      already exist in `state.mts`: map them to `{ id, display_name }`, with `null` for the system. - A tenant caller gets `null` when the maker isn't a member of that tenant. - Update the fake-API specs that snapshot these bodies.

### Task 2: Makers from the record, not the audit log

- **Delete:**
  - `approval-service.ts` `getMakerEvent`/`MAKER_LOOKUP`
  - `approval-guards.ts` `knownMaker`
  - `branch-service.ts` `getBranchMaker`
  - `user-service.ts` `getUserInviter`
  - their tests
- **Callers read the record's maker instead:**
  - `app/(authenticated)/admin/branches/[branchId]/layout.tsx`
  - `app/(authenticated)/admin/users/[userId]/layout.tsx`
  - `app/(authenticated)/admin/approvals/branches/[branchId]/page.tsx`
  - `app/(authenticated)/admin/approvals/users/[userId]/page.tsx`
- **Facts:** `request-facts.tsx` shows "Invited by", or "Drafted by" and "Submitted by", from the
  record's actor refs.
  - Name: `displayName`, or "You (<name>)" for the caller.
  - "—" when `null`.
- **Control checks:** `approval-checks.ts`'s maker check resolves from the record. It no longer
  depends on `audit.view`, so the "Checked on approval / Verified by the platform on approval"
  state is gone for this check. Delete `MAKER_COPY`'s audit variants.
- **Tests:** page and component tests, plus
  `e2e/approvals.spec.ts` ("leaves the checks to the platform when the audit trail can't be read"
  becomes "names the maker without audit access") and `e2e/users.spec.ts` (the inviter).

### Task 3: Switch-aware decisions (Q4)

- **Rule:** `maker-checker.ts` with a table test over makers × switch states.
- **Switch read:** `readMakerCheckerSwitch` with service tests: no `settings.view` → unknown;
  `"false"` → off; a failed read → unknown.
- **Gating:** use `makerGate` in place of today's maker comparisons.
  - Approval: `approval-rules.ts` around `availableUserDecisions`/`availableBranchDecisions`.
  - User record: `user-rules.ts` (`activateBlocked`).
  - Branch record: `activateBlocked` in its layout.
  - `'blocked'` keeps today's disabled button and caption. `'allowed-self-approval'` enables the
    action and shows the warning Alert note above the decision bar or hero actions.
- **Actions:** delete the pre-write maker refusals in `approval-actions.ts` and
  `branch-activation-actions.ts`. The platform decides, and PR 03's `BY_CODE` names its refusal.
- **Institution record:** `tenant-rules.ts` disables Approve and Reject for a caller whose id equals
  `requestedBy` or `submittedBy` (no switch applies), with the caption above.
- **Tests:** rules, actions (no pre-write refusal), RTL for the note, and e2e.
  - A scenario where the switch is stored `"false"` and the maker approves their own invitee
    successfully, after seeing the note.
  - The institution record shows disabled Approve and Reject for the requester.

### Task 4: The fake API's switches

- **Approval routes:** `routes/memberships.mts` activate and `routes/branches.mts` activate read the
  tenant's stored switch.
  - Off: the maker or beneficiary is allowed. Audit as the platform does: a membership's
    `user.approve` row becomes severity HIGH with `selfApproved` metadata
    (`UserProvisioningService.kt:228-270`, `selfApprovalMetadata`); a branch writes an extra
    `branch.self_approve` HIGH row (`BranchProvisioningService.kt:239-260`).
- **Platform checker routes:** never relaxed.
- **Spec:** `e2e/fake-api-approvals.spec.ts` covers the off-switch path.

### Task 5: Gates, docs, commit

- [ ] Run `pnpm check` and the full e2e suite: green.
- [ ] Register:
  - BG-08 → **Closed** (frontend #NN).
  - Items 6 (the approvals part) and 8 adopted.
  - BG-02's "read the switches before refusing the maker" is done.
- [ ] Contract: the maker fields on the branch, membership, user and tenant rows, and the
      switch-off behaviour.
- [ ] Commit `feat(approvals): read makers from records and honour the maker-checker switches`.

## Scope note (review, 2026-11-25)

The maker facts are shown on the two approval pages and the institution Overview. The user record's
Membership card gains "Invited by" in entry 19, and the branch record's Overview gains "Drafted by"
and "Submitted by" in entry 11, which reworks that card for the address. Until then the user and
branch records name the maker only in the blocked caption.
