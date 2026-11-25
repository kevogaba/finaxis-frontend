# bg-adopt 18 — Re-invite a revoked member — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** The invite wizard lets a revoked member be invited again: the platform re-invites them on
the same membership (BG-28). Revocation stops being described as permanent.

**Architecture:**

- **Wizard:** the Identity step's email check stops refusing a REVOKED membership. It shows an info
  Alert instead.
- **Action:** the invite action and its body are unchanged.
- **Copy:** the revoke and reject-and-revoke dialogs, and the REVOKED onboarding note.

**Spec:** [§8 entry 18](../specs/2026-11-24-backend-gap-adoption-design.md#18--re-invite)
· designs `#d-reinvite` · register BG-28.

## Wire facts (platform `6a8ea28`)

- **Re-invite.** `POST /tenant/users` with an email whose membership here is REVOKED answers 201
  with the **same membership id**, back to PENDING_APPROVAL.
  - `created_by` becomes the re-inviter.
  - It clears `joined_at`, `suspended_at`, `revoked_at` and `status_reason`, and deletes the direct
    permission overrides.
  - It keeps `created_at` and `member_number`, and creates fresh assignments from the request.
  - The account is matched by email, so the request's username, display name and phone are ignored.
  - Audit: `membership.reinvite` on `MEMBERSHIP` (no `user.invite` row).
- **Approval:** the re-inviter is refused at approval (`lifecycle.approver_is_membership_maker`,
  PR 03/08).

## Tasks

### Task 1: Wizard

- **`invite-rules.ts`:** `memberEmailMessage('REVOKED')` stops being an error. Add
  `REINVITE_NOTE(name)`:
  - "**This re-invites <name>.** Their revoked membership returns to awaiting approval with the
    access you choose next. They keep their member number and their existing account details, so
    the name and phone you enter here are ignored. Someone else must approve them."
- **`invite-user-wizard.tsx`:** on `outcome.kind === 'member'` with REVOKED, show the info Alert and
  let Continue proceed. Other statuses still set the email error.
- **`REVIEW_NOTE`:** the Review step mentions the re-invite when it applies.
- **Tests:** wizard RTL; `e2e/users-invite.spec.ts` (Hassan, REVOKED, is re-invited and lands on his
  record as awaiting approval; the inviter's Approve is disabled).

### Task 2: Copy

- **Revocation stops being permanent** in:
  - `user-lifecycle-actions.tsx`
  - `user-rules.ts`
  - `approval-copy.ts`
  - `approval-rules.ts`
- **The new dialog body** reads, for example: "<name> loses access to <institution> and every
  assignment here. They can be invited again later."
- **Tests:** RTL tests that assert the copy.

### Task 3: Fake API

- **`routes/invitations.mts`:** the reinvite path, matching the wire facts above. `created_by` (the
  fake's `invitedBy`) is the caller. The audit row is `membership.reinvite` on `MEMBERSHIP`.
- **Specs:** `e2e/fake-api-invite.spec.ts` (Hassan: 201, the same id).

### Task 4: Gates, docs, commit

- [x] Run `pnpm check` and the full e2e suite: green.
- [x] Register:
  - BG-28 → **Adopted** (frontend #125), keeping "rejected tenant stays terminal" under Still
    open.
  - Item 8 (the wizard part) adopted.
- [x] Contract: the invite row's REVOKED behaviour.
- [x] Commit `feat(users): re-invite a revoked member`.

## As built

**Verified against the platform** (`6a8ea28`: `UserProvisioningService.invite`,
`InviteeResolution.findOrCreateInvitee`, `reinviteMembership`,
`JooqUserProvisioningStore.resetMembershipForReinvite`, the `REINVITE` edge in
`FoundationLifecycleDefinitions`, ADR 0037). Every wire fact above holds. Facts the plan didn't
state:

- **As built:** the reset also writes the request's `membership_type` and `primary_branch_id`, and
  the invitation preferences (`send_keycloak_invite`, `send_application_invite`) are saved from the
  request, as for a first invitation. The response's `user_status` is the account's own (Hassan's
  is ACTIVE), not DRAFT.
- **As built:** every other membership status (PENDING_APPROVAL, ACTIVE, SUSPENDED) is still 409
  `conflict`, and the invite's own rules (organisation, branches, roles, the need for a branch and
  a role) run before the re-invite, so a bad body is refused the same way. A membership ended by
  Reject & revoke is REVOKED too, so it is re-invited the same way; only a rejected _tenant_ stays
  terminal (ADR 0037 decision 13, BG-28's Still open).
- **As built:** an existing account's username is never checked (no `usernameInUse` on the reuse
  path), so a 409 for a revoked member's email can only be another cause (an inactive
  organisation, a race).
- **As built:** the wizard's email check (`GET /tenant/users?q=`,
  `JooqIamAdministrationQueries.searchUsers`) lists every membership here, REVOKED included, with
  its `membership_status`, so the check sees a revoked member as REVOKED.
- **As built:** until the new approval queues a dispatch, the membership's `invitation` reads as
  awaiting approval, never the first life's (`InvitationDispatchReader`, entry 17's field).

**Deviations, with reasons:**

- The Identity step's first Continue on a revoked member's email shows the note (focused, as the
  check's failure Alert is) and stays; the next Continue for the same email goes on. The design
  shows the note on the Identity step with Continue still to press, and the inviter reads who this
  re-invites before choosing access. Editing the email hides the note, and a different revoked
  email asks again.
- The note says "the name, username and phone you enter here are ignored", where the spec says
  "the name and phone": the platform ignores the username too, and the form still asks for one.
- The route handler answers a revoked member's name with the status
  (`{ member: { membershipStatus: 'REVOKED', displayName } | { membershipStatus } | null }`; was
  `{ membershipStatus }`), so the note can name the member; every other status refuses the email,
  so it carries no name. The caller already reads names from the directory (inviting needs
  `user.view` institution-wide).
- `memberEmailMessage` takes only the statuses that refuse (`BlockingMembershipStatus`), and the
  invite action's post-409 lookups no longer name a revoked member's email (nor, for it, the
  username) as the cause: the platform re-invites it, so the hedged `INVITE_CONFLICT` explains
  the 409.
- Reject & revoke shares one description (`REJECT_AND_REVOKE_DESCRIPTION`) between the user record
  and the approval page, which had the same text.
- The audit vocabulary names `membership.reinvite` ("Re-invited member", on MEMBERSHIP), so the
  audit log doesn't fall back to "Membership: reinvite".
- The fake API keeps no membership dates, status reason or direct permission overrides, so its
  re-invite resets the status, type, primary branch, `updatedAt` and maker, and drops the first
  life's dispatch (entry 17's), so the invitation reads AWAITING_APPROVAL until the new approval
  queues one. A re-invited account still PROVISIONING_IDP is then offered Approve, not Retry, as
  entry 17 decides, and its approval queues a fresh dispatch.

## Added in review: a re-invited member whose account was never provisioned

Entry 17's review found that a re-invited member whose account is still PROVISIONING_IDP (revoked
before their first identity was set up, then invited again) reads as already approved wherever
only list data is at hand: their membership is PENDING_APPROVAL and their account PROVISIONING_IDP,
exactly like a member approved and waiting on their identity. **As built** (platform `6a8ea28`):
only the membership detail carries `invitation` (`InvitationDispatchReader` is joined in
`findMembershipById` alone); `/tenant/users`, `/tenant/memberships` and
`/tenant/approvals/pending-count` carry nothing that separates the two. Owner's choice: exact rows,
counts as entry 14 built them.

- **Rows:** `readRowInvitations` (`user-service.ts`) reads the membership of each row that
  `awaitsIdentity` (PENDING_APPROVAL + PROVISIONING_IDP), in parallel, bounded to the rows given,
  only with `membership.view` tenant-wide; a failed read keeps the row's status-only label. The
  users directory and the User onboarding tab pass the result to `UserDirectoryTable`
  (`invitations`), so a re-invited member reads Awaiting approval and an approved one Identity in
  progress or Identity failed. The overview's preview reads the rows awaiting an identity that could
  reach it (`previewInvitationRows`, at most five) and lists one whose invitation still awaits
  approval.
- **Counts:** unchanged (the bell, the queue tab and the overview still leave every
  PROVISIONING_IDP member out). Register BG-28's Still open and the README record the limit.
- **Copy:** the queue description and the overview's provisioning note say those members were
  usually approved already, and that their record shows where each stands.
- **Fake API:** the `users-reinvited` scenario adds Kamau Njoroge, re-invited by Victor, account
  PROVISIONING_IDP, no dispatch of this life (invitation AWAITING_APPROVAL).
- **Tests:** unit (`readRowInvitations`, `awaitsIdentity`, `previewInvitationRows`, the preview
  view), RTL (the table, both pages, the overview card), e2e (Kamau's queue and directory rows read
  Awaiting approval and the overview lists him; Daniel's read Identity failed).

## Fixed in review

- **The note never sits beside a refusal.** A second check that finds the email refused (someone
  else re-invited them between the two Continues) forgets the re-invite before it sets the email's
  error, and so does any 409 from the send (`INVITE_CONFLICT_CODES`); the note also hides while the
  email has an error. The next Continue checks again. RTL covers both.
- **The note says what the next Continue does:** "Continue to choose their access, or change the
  email."
- **Member number.** Platform V35 numbers a membership only at its first activation, so a member
  revoked while still pending (Reject & revoke included) has none: the note and the Review say
  "They keep any member number they had".
- **The row lookups are capped** at `ROW_INVITATION_LOOKUPS` (10) a page, since each is a membership
  read awaited before render against the tenant's read rate limit; rows past it keep their
  status-only label. Failed lookups still fall back silently in the UI, and are logged as one
  server-side line per call, by count and status, never the error's text (the repo's convention is
  `console.error`, as in `describeProblem`).
- **The route handler names only a revoked member;** every other status answers its status alone.
- **A revoked member's 409** says `REINVITE_CONFLICT` (an inactive institution or a change since
  the check), never the username, which the re-invite path never checks; `INVITE_CONFLICT` stays for
  every other 409.
- **Copy:** Revoke and Reject & revoke say "They can be invited again later."; the user queue's
  description says a re-invited member awaiting approval can be missing from the tab's count.
- **axe:** the Review step's re-invite note and the re-invited member's record are scanned.
