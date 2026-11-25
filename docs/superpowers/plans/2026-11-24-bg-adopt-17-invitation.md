# bg-adopt 17 — Invitation status with retry and resend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** The user record shows where a member's invitation stands, including a failed identity
provisioning with its reason. Approvers can retry provisioning, and inviters can resend the identity
provider's email (BG-11). The Invitation step says the email asks for a password and lasts 72 hours
(BG-25).

**Architecture:**

- **Contract:** `invitation` on the membership detail contract.
- **State:** `onboardingState` splits "Provisioning identity" into in progress and failed.
- **Actions:** two hero actions through the kit `ConfirmDialog`, each with a new Server Action.
- **Onboarding card:** shows the invitation facts.

**Spec:** [§8 entry 17](../specs/2026-11-24-backend-gap-adoption-design.md#17--invitation-status)
· designs `#d-invite-status` · register BG-11, BG-25.

## Wire facts (platform `6a8ea28`)

- **`invitation`**
  - Shape: `{ status, attempts: number, last_error_code: string | null, updated_at: string | null }`.
  - It is on the membership detail and on every membership mutation response.
  - `status` values: `AWAITING_APPROVAL`, `IN_PROGRESS`, `FAILED`, `COMPLETED` and `NOT_REQUIRED`.
  - `last_error_code`, only when FAILED, is one of `IDENTITY_PROVIDER_FAILED`, `CONFLICT`,
    `NOT_FOUND`, `INVALID_STATE`, `DATABASE_ERROR`, `UNEXPECTED`, `CANCELLED` or `UNKNOWN`.
  - A REVOKED membership whose last dispatch failed still reads FAILED (often `CANCELLED`).
- **`POST /tenant/memberships/{id}/invitation/retry`** (`user.approve` + `membership.view`; no body)
  - Requeues for a PENDING_APPROVAL membership whose user is PROVISIONING_IDP and whose dispatch
    exists and hasn't succeeded. Otherwise 409 `conflict`.
  - A running job is a 200 no-op.
  - No maker-checker rule applies: the inviter can retry.
  - Answers the detail. Audit: `user.invitation_retry`.
- **`POST /tenant/memberships/{id}/invitation/resend`** (`user.invite` + `membership.view` +
  `user.view`; no body)
  - For an INVITED user with an ACTIVE membership and a dispatch row. Otherwise 409
    `lifecycle.invitation_resend_not_applicable`.
  - Within the cooldown (5 minutes by default): 409 `lifecycle.invitation_resend_too_soon`.
- **Approving again** while provisioning is unfinished is 202 and requeues. Once it has succeeded,
  it is 409.
- **The identity provider's email** asks for `VERIFY_EMAIL` and `UPDATE_PASSWORD`, with a 72-hour
  link.

**As built** (checked against platform `6a8ea28`):

- `MembershipDetailResponse.invitation` is documented nullable ("`null` on the result of a mutation
  that does not read it"), though every membership route reads it back; the schema parses a null
  as unknown. `attempts` counts provisioning attempts plus resends. The status is derived
  (`deriveInvitationStatus`): no dispatch is AWAITING_APPROVAL while pending and NOT_REQUIRED after;
  SUCCEEDED is COMPLETED; FAILED is COMPLETED behind an ACTIVE or SUSPENDED membership and FAILED
  otherwise; anything else is IN_PROGRESS. The code is read from the stored `<CODE>:<Class>`, any
  other prefix being `UNKNOWN`.
- Retry: `@PreAuthorize('user.approve')`, then `requireTenantPermission` (with `membership.view`)
  before the lookup, so tenant-wide. A requeued FAILED dispatch goes back to PENDING
  (IN_PROGRESS) with its attempts kept and its `updated_at` moved. Its 409 is `conflict` both for
  the wrong statuses and for a dispatch never recorded or already SUCCEEDED.
- Resend: `@PreAuthorize('user.invite')`, then `requireTenantPermission` (with `membership.view`
  and `user.view`), tenant-wide. Past the status check it touches the user's newest SUCCEEDED
  provisioning dispatch in any institution (`attempts` + 1, `updated_at` now), only when that
  changed at least the cooldown ago (`finaxis.invitation.resend-cooldown`, `5m` by default, set
  in code, not in `application.yaml`); with no succeeded dispatch it is `…_not_applicable` too.
  The cooldown runs from provisioning's own success, so a resend within five minutes of it is
  `…_too_soon`.
- Approve again while PROVISIONING_IDP: a FAILED job is requeued, a queued one left alone (202);
  a dispatch that SUCCEEDED is 409. The first approval of a re-invited membership's life queues a
  job of its own, so a PROVISIONING_IDP user whose invitation reads AWAITING_APPROVAL is awaiting
  approval, not provisioning (ADR 0037).
- Audit: `user.invitation_retry` (metadata `membershipId`, `job`) and `user.invitation_resend`
  (`membershipId`, `attempt`), both on USER / the user's id.
- Keycloak: `invitation-required-actions` defaults to `VERIFY_EMAIL,UPDATE_PASSWORD` and
  `invitation-lifespan` to `72h`. With admin provisioning off, the fallback gateway throws, so the
  job fails (`IDENTITY_PROVIDER_FAILED`) rather than sticking.

## Interfaces

- `user-contract.ts`: the membership detail outputs `invitation: { status, attempts, lastErrorCode, updatedAt }`.
- `user-rules.ts`
  - `onboardingState` gains `'IDENTITY_IN_PROGRESS' | 'IDENTITY_FAILED'` in place of
    `'PROVISIONING_IDENTITY'`. FAILED is read from `invitation.status === 'FAILED'` with a
    PROVISIONING_IDP user and a PENDING_APPROVAL membership.
  - `export function canRetryProvisioning(record, holder): boolean`.
  - `export function canResendInvitation(record, holder): boolean`.
  - `export const INVITATION_ERROR_COPY: Record<string, string>`, one sentence per code:
    - `IDENTITY_PROVIDER_FAILED`: "The identity provider refused the request. Check that it's
      configured, then retry."
    - `CONFLICT`: "An account with these details already exists at the identity provider."
    - `NOT_FOUND`: "The account wasn't found at the identity provider."
    - `INVALID_STATE`: "The account was in a state the identity provider couldn't use."
    - `DATABASE_ERROR`: "The platform couldn't save the result."
    - `UNEXPECTED`: "Something unexpected went wrong."
    - `CANCELLED`: "Provisioning was cancelled."
    - `UNKNOWN`: "The reason wasn't recorded."
- `membership-actions.ts`: `retryInvitation` and `resendInvitation`, with
  `{ idempotencyKey, membershipId }`.

## Tasks

### Task 1: Contract and state

- **State and copy:** the contract field, `onboardingState`, `onboardingProgress`, and the copy
  table. Delete `PROVISIONING_NOTE` ("…can't be retried from here"), including its reuse in
  `approval-rules.ts`, which gets an equivalent.
- **Onboarding card** (`onboarding-timeline.tsx`): the third step reads "Identity failed" in error
  tone, or "Identity in progress". Beneath it:
  - Invitation: "<status label>" plus "after <n> attempts" when attempts > 1;
  - Reason (FAILED only), from `INVITATION_ERROR_COPY`;
  - Last update (the date and time).
- **Tests:** unit tests for the state table and the copy; RTL for the card.

**As built:**

- `PROVISIONING_IDENTITY` ("Provisioning identity") stays beside the two new keys, for an
  invitation that wasn't read: list rows carry none, and a reader without `membership.view` or a
  failed read has none. An AWAITING_APPROVAL invitation reads Awaiting approval (above).
- The third step's chip reads "Failed" (error) or "In progress", like the other steps' chips; the
  hero's chip carries "Identity failed" and "Identity in progress".
- `PROVISIONING_NOTE` became `IDENTITY_IN_PROGRESS_NOTE` and `IDENTITY_FAILED_NOTE` on the record.
  The approval page has `PROVISIONING_OUTCOME` and `PROVISIONING_FAILED_OUTCOME`, with a
  `provisioning-failed` approval state, since it reads the membership and can tell them apart.
  `approveUser`'s own guard reads no invitation: a provisioning identity, failed or not, is
  Approve's end state for a same-key replay.
- The layout reads the membership (cached with the Overview's read) only for a PENDING_APPROVAL
  member whose account is PROVISIONING_IDP, and only with `membership.view` tenant-wide, as 16's
  Overview and approval page read it (BG-33).
- `invitationFacts` covers every read invitation, not only a provisioning one. The time row reads
  "Last update (<zone>)", like the card's other instants, and is left out when null.
- After review: the status row reads "Identity provisioning", not "Invitation", since a
  NOT_REQUIRED one can sit beside Resend. It counts the attempts only while FAILED or IN_PROGRESS:
  a resend adds one to a completed dispatch's count, so "Completed after 2 attempts" read one
  resend as a failure. `IDENTITY_PROVIDER_FAILED` reads "… Check that it's configured." and adds
  ", then retry" (`INVITATION_RETRY_COPY`) only where the hero offers Retry (a REVOKED record's
  failed invitation, or a reader without `user.approve`, keeps the plain words), and
  `invitationErrorText` reads both tables with `Object.hasOwn`, so a code like `toString` reads
  as unrecorded.
- The audit vocabulary names `user.invitation_retry` and `user.invitation_resend`.

### Task 2: Retry and Resend

- **Retry provisioning**
  - Shown for a PENDING_APPROVAL membership, a PROVISIONING_IDP user and invitation FAILED, with
    `withViews(['user.approve'])`.
  - Dialog: "Retry identity provisioning for <name>?" / "We'll ask the identity provider to create
    their account again."
  - 409 copy: "Provisioning can't be retried now. Refresh to see where it stands."
- **Resend invitation**
  - Shown for an INVITED user with an ACTIVE membership, with `withViews(['user.invite'])`.
  - Dialog: "Resend <name>'s invitation?" / "The identity provider emails them a new link to verify
    their address and set a password. The link lasts 72 hours. Delivery depends on how the platform
    is set up."
  - `too_soon`: "An invitation was sent moments ago. Try again in a few minutes."
  - `not_applicable`: "There's no invitation to resend for this person."
- **Hero:** `user-lifecycle-actions.tsx` renders both through `copyFor`.
- **Approve on provisioning:** `availableMembershipActions` no longer withholds Approve "because it
  is a 500". For a PROVISIONING_IDP member, Retry is the action and Approve stays hidden, to avoid
  two buttons doing the same.
- **BG-25 copy:** `INVITATION_NOTE` and the invite wizard's identity-provider option description say
  the email asks the person to verify their address and set a password, that the link lasts 72
  hours, and that delivery depends on the platform's setup.
- **Overview:** the provisioning note's copy now says these members can be retried from their
  record.
- **Tests:** action tests (key reuse, each 409); RTL; e2e:
  - a member whose provisioning failed shows the reason, and Retry moves them to in progress;
  - an awaiting-first-sign-in member: Resend succeeds, and a second Resend shows the too-soon
    message.

**As built:**

- `canRetryProvisioning` and `canResendInvitation` are folded into `availableMembershipActions`
  (one status table, `actionsFor`, then each action's code with its views, tenant-wide), so the
  hero has one source.
- Resend is offered whatever the invitation reads: the platform touches the user's newest
  succeeded dispatch in any institution, which this membership's invitation doesn't show.
- The resend 409s are named in `describeProblem`'s `BY_CODE`; Retry's plain `conflict` is
  explained in its action (`RETRY_CONFLICT`).
- The overview's note: "… approval already ran. If provisioning failed, it can be retried from
  their user record." The design keeps the count: list rows carry no invitation.
- The Invitation step's note now reads "Whether these emails go out depends on how the platform is
  set up. If creating their sign-in identity fails, their user record says so, but an email that
  isn't delivered isn't shown."
- After review: `too_soon` reads "Their account was set up, or an invitation sent, moments ago. Try
  again in a few minutes." (titled "Too soon to resend"): the cooldown, five minutes by default and
  configurable, runs from the newest succeeded dispatch in any institution, provisioning's own
  success or the last resend. `not_applicable` adds "Refresh to see where they stand.", since on a
  stale page it most often means they have signed in. The approval page's provisioning-failed
  outcome is a warning, not information.
- After review: the hero's focus recovery runs only for a success whose refresh changed the action
  set. The success records the set it was offered in, and the effect runs on each new `actions`
  array (every refresh delivers one) and consumes it: Resend, which keeps the set, leaves its
  trigger focused (the closing dialog restores it) and nothing behind for a later refresh, or the
  unmount's fallback, to move focus on.

### Task 3: Fake API

- **`routes/memberships.mts`:** detail and mutations carry `invitation`, derived from fake dispatch
  state on the user or membership (`dispatchStatus`, `attempts`, `lastErrorCode`, `updatedAt` in
  `state.mts`).
  - Retry and resend routes follow the rules above, including the 5-minute cooldown, based on
    `updatedAt`.
  - A repeat approve while provisioning is 202 (PR 03 may already do this).
- **Scenarios:** a member with FAILED provisioning (`IDENTITY_PROVIDER_FAILED`, 3 attempts) and an
  INVITED/ACTIVE member.
- **Specs:** `e2e/fake-api-users.spec.ts`.

**As built:** the dispatch lives on the fake membership (`dispatch`: status, attempts, lastError,
updatedAt), one per life as the platform keys it. Daniel's failed three times
(`IDENTITY_PROVIDER_FAILED`), Esther's succeeded in August, and `overview-attention`'s Baraka has a
queued one. An approval that starts provisioning queues one, and a repeat requeues a failed one.
The resend e2e runs in `users-invite`, whose administrator holds `user.invite`. After review,
`users-invite-dispatch-edges` adds Grace (invited, ACTIVE membership, no dispatch: a resend is not
applicable) and Kevin (pending, provisioning, a dispatch that already SUCCEEDED: a retry is a 409).

### Task 4: Gates, docs, commit

- [x] Run `pnpm check` and the full e2e suite: green.
- [x] Register: BG-11 and BG-25 → **Adopted** (frontend #124), keeping their Still open.
- [x] Contract: the `invitation` object, retry and resend.
- [x] Commit `feat(users): invitation status with retry and resend`.
