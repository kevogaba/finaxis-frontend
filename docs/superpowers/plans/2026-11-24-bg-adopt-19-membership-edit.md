# bg-adopt 19 — Member number and membership edit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** The user record shows the member number, who invited the member, and when they were first
invited. An administrator can change a membership's type and primary branch (BG-17, tenant part).

**Architecture:**

- **Membership card:** gains the facts.
- **Edit membership:** a kit dialog with two fields. It stays on `useActionState` plus native
  constraints, per the `AGENTS.md` rule for one- or two-field dialogs.
- **Server Action:** `updateMembership`, a PATCH that sends only changed fields.

**Spec:** [§8 entry 19](../specs/2026-11-24-backend-gap-adoption-design.md#19--member-number-and-membership-edit)
· designs `#d-membership` · register BG-17.

## Wire facts (platform `6a8ea28`)

- **`member_number`:** a positive integer assigned at first activation, never edited. It is on
  membership items and detail, `null` until the membership is first activated.
- **`PATCH /tenant/memberships/{membership_id}`** (`membership.update` + `membership.view`)
  - Body: `{ membership_type?: 'STAFF' | 'ADMIN' | 'AUDITOR', primary_branch_id?: uuid | null }`.
    An absent field is unchanged; `null` clears the branch.
  - 422 `invalid_operation`: an empty body, an unknown or SYSTEM type, a REVOKED or SYSTEM
    membership, or a non-ACTIVE branch.
  - 409 `conflict`: an ACTIVE membership moving to STAFF or ADMIN while the user has no active
    branch assignment.
  - Answers the detail. Editing your own membership is allowed.
- **As built (verified in platform source at `6a8ea28`):**
  - _Gate._ `MembershipUpdateController` carries `@PreAuthorize("hasAuthority('membership.update')")`
    (the selected context), and `ProfileUpdateService.updateMembership` then calls
    `requireTenantPermission` (the code and its view, tenant-wide), so the UI gates on
    `canAllTenantWide(withViews(['membership.update']))`. There is no self rule and no
    `user.assign_self` check: your own membership is editable, so no `ownAccessBlocked`.
  - _Body._ `membership_type` is a `String?`, so an explicit `null` is absent too;
    `primary_branch_id` is an `Optional<UUID>?`: absent keeps, `null` clears. Any other key is 400
    `invalid_json`.
  - _Order._ The body's 400s, the route gate (403 naming nothing), the service's 403 naming the
    code, then 422 for no field or an unknown or SYSTEM type (before the lookup), 404, 422 for a
    REVOKED or SYSTEM membership, the 409, and last 422 for a branch that isn't an ACTIVE branch of
    the tenant.
  - _The 409_ applies to an ACTIVE membership only (a pending or suspended one may become Staff or
    Admin without an assignment), and counts an ACTIVE assignment to an ACTIVE branch.
  - _Primary branch._ It must be an ACTIVE branch of the tenant; the user needs no assignment there.
  - _Response and audit._ The full detail (`invitation` and `member_number` included); one
    `membership.update` row on the MEMBERSHIP with `changedFields` (names, never values) and the
    member as `subject_user_id`.
  - _`member_number`._ `JooqFoundationLifecyclePersistence.saveMembership` takes it from the
    organisation's `MEMBER` counter the first time the membership becomes ACTIVE and keeps it
    through suspension, revocation and re-invite (ADR 0040); V38 requires one of every ACTIVE and
    SUSPENDED membership. It is on the summary and the detail, `@JsonInclude(ALWAYS)`.

## Tasks

### Task 1: Facts

- **Contract:** `user-contract.ts`'s membership detail outputs `memberNumber: number | null`.
- **Membership card** (`admin/users/[userId]/page.tsx`):
  - Member no. (or "—" when null), Invited by (`createdBy`, PR 08), and First invited (the
    membership's `createdAt`, `dd-MM-yyyy`).
  - Rename the card's "Created" to "First invited".
- **Tests:** page tests.
- **As built:**
  - The card reads Member no. (first), Membership type, Membership status, Primary branch, Last
    invited by (`makerLabel`: "You (…)" for the caller, "—" for the system), First invited, Updated
    and Membership ID.
  - _Deviation from spec §8 entry 19's "Invited by" label:_ the maker fact reads "Last invited by".
    A re-invite makes the re-inviter the membership's `created_by` but keeps its `created_at`
    (ADR 0037), so "Invited by" beside "First invited" read as if the re-inviter had sent the first
    invitation, on its date. "Last" says whose invitation it is; "First invited" keeps its date.
  - First invited is rendered like every other instant in the app, date and time in the
    organisation's zone (`First invited (Africa/Nairobi)` · `01 Jul 2026 · 11:00`), not
    `dd-MM-yyyy`: the UI never shows the wire's business-date format.

### Task 2: Edit membership

- **Rule:** `user-rules.ts` `canEditMembership(record, holder)`: `withViews(['membership.update'])`,
  and the membership is not REVOKED or SYSTEM.
- **Action:** `membership-actions.ts` `updateMembership`.
  - Fields: `{ idempotencyKey, membershipId, membershipType?, primaryBranchId? ('' means None → null) }`.
  - Sends only the fields that differ from `current*` hidden inputs.
  - 409 copy: "Staff and Admin members need an active branch assignment first. Assign a branch,
    then change the type."
  - 422 copy: "These changes weren't accepted. The branch may no longer be active, or this
    membership can't be edited."
  - If nothing changed, return a field error rather than send `{}`: "Change the type or the
    primary branch first."
- **Dialog** (`components/edit-membership-button.tsx`, client)
  - Title: "Edit <name>'s membership".
  - Fields: Membership type (Staff, Admin, Auditor) and Primary branch (the institution's ACTIVE
    branches, one page of 100, or "None").
  - The branch options come from the server page (the existing Assign-branch drawer's bounded read).
- **Membership card:** an "Edit membership" button when `canEditMembership`.
- **Tests:** action tests (only changed fields; `null` branch; key reuse; both refusals), RTL, and
  e2e: change a member's type and branch, then see the card update.
- **As built:**
  - _Kit._ `ReasonDialog` gained `reason: 'none'` (no reason field): the PATCH takes no reason,
    and `ConfirmDialog` dispatches through `<form action>`, which would reset the two selects on a
    failed submit. The dialog's description: "The type decides whether they need a branch
    assignment: Staff and Admin members do, Auditors don't."
  - _Nothing changed._ A form-level error (the dialog's alert), not a field error: neither field is
    wrong on its own. The action throws a frontend-only code (`membership_unchanged`, as
    `revokeMembership`'s `membership_changed`) before any call.
  - _Gate._ `canEditMembership` takes the user read's `membershipStatus` and `membershipType`, so
    the page decides before the membership read and reads the branches beside it; the button is
    shown only once the membership read succeeded, on the membership as read.
  - _Branch options._ Read only where the holder has `branch.view` anywhere (`GET /branches` is
    target-aware, BG-03). The current primary branch is always offered (named from the branch
    index), so keeping it needs no read and sends nothing. The helper under the field says what the
    primary branch is, then "Only the first 100 active branches are listed." past the page, and
    `SCOPED_BRANCHES_NOTE` for a branch-scoped `branch.view`. Without `branch.view` (no read), it
    says the current branch or None can be chosen; when the read failed, it says so, in the
    Assign-branch drawer's words: "Branches couldn't be loaded. You can keep the current primary
    branch or choose None; refresh to try again." (`primaryBranchHint`'s `read`).
  - _404_ keeps `describeProblem`'s generic words.
  - _Audit vocabulary._ `membership.update` reads "Edited membership", on MEMBERSHIP.
  - _`AGENTS.md`._ The fifth named exception names the dialog's options.

### Task 3: Fake API

- **`routes/memberships.mts`:** the PATCH route with the rules above, and the audit row
  `membership.update`.
- **Member number:** `member_number` is assigned from a per-organisation counter at first
  activation. Seeded ACTIVE members get numbers.
- **Specs:** `e2e/fake-api-users.spec.ts`.
- **As built:**
  - `e2e/fake-api/member-number.mts` numbers a membership as it becomes ACTIVE (an approval's 200,
    a reactivation, which keeps it), the next after the organisation's highest; ponytail: no
    counter row, since a number is never edited and a membership never deleted. `seedScenario`
    numbers every seeded ACTIVE and SUSPENDED membership per organisation in seed order (V35); a
    seeded REVOKED one has none: the seed comment says Hassan was revoked before his approval
    (his account ACTIVE through another institution, so no dispatch of his own here), which keeps
    entry 18's re-invite of him consistent with a null number.
  - Entry 18's re-invite reuses the membership and leaves its number alone, so a returning member
    keeps it (`e2e/fake-api-invite.spec.ts`'s Esther case asserts it).
  - The `users` scenario's tenant administrator holds `membership.update` (V32).
  - The PATCH mirrors the order above, the route gate (`requireAuthority`) then the service's check
    (`requirePermission`), and every rule after the decode inside `produce`.

### Task 4: Gates, docs, commit

- [x] Run `pnpm check` and the full e2e suite: green.
- [x] Register: BG-17's tenant part adopted (frontend #126). It stays Partly fixed until PR 21.
- [x] Contract: the PATCH row and `member_number`.
- [x] Commit `feat(users): member number and membership edit`.
- **As built:** `README.md`'s user record notes describe the card and the edit, and the register's
  counts line is unchanged (BG-17 stays Partly fixed).
