# bg-adopt 12 — An optional remark on every approval — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** Approving a member, or an institution, can carry an optional remark of at most 500
characters (BG-01, decision Q7). Branch activation already sends one.

**Architecture:** Approve changes from `ConfirmDialog` to the kit `ReasonDialog` with an optional
field labelled "Remark", in three places:

- the user record (`user-lifecycle-actions.tsx`)
- the approval page's decision bar (`decision-bar.tsx`)
- the institution record (`tenant-lifecycle-actions.tsx`)

The actions send `{ reason }` only when the remark isn't blank.

**Spec:** [§8 entry 12](../specs/2026-11-24-backend-gap-adoption-design.md#12--approval-remarks)
· designs `#d-remark` · register BG-01.

## Wire facts (platform `6a8ea28`)

- `POST /tenant/memberships/{id}/activate`,
  `POST /platform/tenants/{tenant_id}/memberships/{id}/activate` and
  `POST /platform/tenants/{id}/approve` take an optional `{ reason }`, at most 500 characters. They
  accept `{}`.
- Membership detail doesn't return the remark (it is in the audit row). Tenant detail returns
  `status_reason`.

**As built:** checked against the platform at `6a8ea28`:

- All three routes take `@RequestBody(required = false) @Valid` (`ActivateMembershipRequest`,
  `ApproveTenantRequest`): no body, `{}` and `{"reason": null}` are all accepted. `@Size(max = 500)`
  checks the raw text (400 `validation_failed`); `DecisionRemark.optional` then trims it, and a blank
  or whitespace-only remark is none, never stored. Any other property is 400 `invalid_json`.
- A member's remark is always on the `user.approve` audit row; on a 200 the platform also stores it
  as the membership's status reason, which no read returns (on a 202 it is on the audit row only).
- An institution's remark is on both approval transitions (and the head office's activation) and
  their audit rows, and becomes the tenant's `status_reason`, which its detail returns.

## Tasks

### Task 1: Actions accept a remark

- **`membership-actions.ts`:** `approveMembership` uses `membershipInput.extend({ reason: optionalReason })`.
  Drop the "reads no body" comment.
- **Approvals:** `approval-actions.ts`'s approve does the same.
- **Tenants:** `tenant-actions.ts`'s approve switches from `command()` to the reasoned helper, with
  an optional reason.
- **Tests:**
  - `{ reason: 'x' }` is sent when given, and `{}` when blank.
  - 501 characters is a field error.
  - The minted key is reused on retry.

### Task 2: Dialogs

- **The three Approve dialogs** become `ReasonDialog` with `reasonRequired={false}`.
  - Label: "Remark (optional)". Helper: "Recorded with the approval. Up to 500 characters."
  - Title and body keep today's copy (`approval-copy.ts` `reason: null` → the optional config).
- **Tests:** RTL for each dialog, and an e2e approve with a remark (user approval page and the
  institution record).

### Task 3: Fake API

- **`routes/memberships.mts`:** activate accepts an optional `reason` (at most 500) instead of
  `objectBody(raw, [])`.
- **`routes/platform-tenants.mts`:** approve accepts `reason`; the platform memberships activate
  route does the same.
- **Audit:** the reason is stored on the audit row.

**As built** (Tasks 2 and 3):

- `ReasonDialog` has no `reasonRequired` prop: the dialogs pass `reason="optional"`, the label
  `Remark (optional)` (used as given, so "(optional)" appears once) and a new `reasonHelperText`
  prop, which a field error replaces. The label and helper text are one constant,
  `APPROVAL_REMARK` in `approval-copy.ts`, shared by the three dialogs. Branch activation keeps its
  "Reason (optional)" field.
- Over 500 characters the remark's field error says "Keep the remark to 500 characters or fewer."
  (`APPROVAL_REMARK_TOO_LONG`), not the reasons' "under 500", since exactly 500 is accepted.
  Reactivation keeps its reason's words.
- `ReasonDialog`, like `ConfirmDialog`, hides a failure while a retry is pending, so a stale error
  never sits beside the success that follows it.
- `approveUser` now takes `ActionResult | null` as its unused previous state, so the decision bar's
  wrapper is a plain `FormAction`.
- The fake API has no platform memberships activate route: the UI doesn't call it until 15 adopts
  the platform checker, and the fake adds only routes a layer uses.
- The fake keeps a tenant's remark nowhere: it writes no audit row for platform actions and its
  detail has no `status_reason` until 13. It validates the remark like the platform. Its tenant
  transition helper now refuses any optional remark over 500 characters, so reactivate is checked
  too (`ReactivateTenantRequest` has the same `@Size`, and the platform trims it and drops a blank
  one, `DecisionRemark.optional`), and the contract's ReactivateTenant row says so.

### Task 4: Gates, docs, commit

- [x] Run `pnpm check` and the full e2e suite: green.
- [x] Register: BG-01 "an optional remark on Approve" adopted (frontend #119).
- [x] Contract: the activate and approve rows take an optional `{reason}`.
- [x] Commit `feat(approvals): an optional remark on every approval`.
