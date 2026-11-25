# bg-adopt 14 — Pending counts from the count routes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** The bells read the platform's pending-approval counts instead of several `size=1` list
reads (BG-22). Requests the caller created leave the count, and a kind the caller can't approve is
left out.

**Architecture:**

- **Contract and reader:** one approval-count contract and one service function per context.
- **Tenant bell:** keeps its existing provisioning read and subtracts it from the membership count,
  so the bell keeps counting only decidable requests.
- **Unchanged:** the queue's tab counts and the overview cards keep their list totals.

**Spec:** [§8 entry 14](../specs/2026-11-24-backend-gap-adoption-design.md#14--pending-counts)
· register BG-22.

## Wire facts (platform `6a8ea28`)

- **`GET /tenant/approvals/pending-count`**
  - Gate: `hasAnyAuthority('user.approve', 'branch.approve')`.
  - Returns `{ memberships?: number, branches?: number }`.
    - `memberships` is present for `user.approve` holders.
    - `branches` is present only for tenant-wide `branch.approve`.
    - A key is omitted, not 0, when the caller can't approve that kind. Neither is 403.
  - Counts PENDING_APPROVAL rows less those the caller created, unless the tenant's switch is off.
    Memberships include identities still provisioning.
- **`GET /platform/approvals/pending-count`:** `{ tenants: number }` for `tenant.approve` holders.
  It leaves out tenants the caller requested or submitted.

**As built:** checked against the platform at `6a8ea28` (`ApprovalCountController`,
`PlatformApprovalCountController`, `ApprovalCountQueryService`, `JooqPendingApprovalCountStore`).
The facts above hold, with these details:

- **Both kinds are tenant-wide.** `memberships` needs `user.approve` with `membership.view`
  tenant-wide (`requireTenantPermission`, which reads the tenant-wide set), not just "`user.approve`
  holders"; `branches` needs `branch.approve` with `branch.view` at every branch
  (`mutationBranchVisibility` must be `AllBranches`).
- **The 403 for neither** is the endpoint gate's `forbidden` ("You are not permitted to perform
  this action.") when the selected context holds neither code, and otherwise the service's named
  refusal for the first kind, `Missing permission: user.approve.` (or `membership.view`).
- **The exclusion** is `created_by IS DISTINCT FROM caller`, so a row with no maker counts. The
  switches are read per kind: `require_maker_checker_for_user_invites` for memberships,
  `require_maker_checker_for_branch_creation` for branches.
- **The platform route** needs `tenant.approve` with `tenant.view` in the platform organisation,
  never counts the platform organisation, and excludes a tenant whose requester **or** latest
  submitter is the caller, whatever any switch says. `tenants` is always sent.
- **The provisioning read doesn't cover the same population.** `GET /tenant/users` has no
  `created_by` filter, so `membership_status=PENDING_APPROVAL&user_status=PROVISIONING_IDP` counts
  every inviter's requests, **including the caller's own**, which `memberships` already left out
  while the switch is on. `memberships − provisioning` would remove a caller's own provisioning
  request twice: for example, Amina (someone else's) waits and the caller's own invitee is
  provisioning, so `memberships` = 1 and provisioning = 1, and the bell would read "Nothing is
  waiting" while Amina waits.

## Tasks

### Task 1: Contract and reads

- **`modules/administration/approvals/approval-contract.ts`:**
  `pendingCountSchema = z.object({ memberships: z.number().int().optional(), branches: z.number().int().optional() })`.
- **`approval-service.ts`:** `export async function readPendingCounts(): Promise<{ memberships?: number; branches?: number }>`
  replaces `countUserApprovals` and `countBranchActivations` in the bell. Keep those two if the
  queue tabs or the overview still use them.
- **Platform:** a `readPlatformPendingCount()` in the platform tenants or overview service.
- **Tests:** service tests (path, schema, missing keys).

**As built:** the schemas also refuse a negative count (`nonnegative()`), and an explicit `null`,
since the platform omits a key rather than send one. `platformPendingCountSchema` lives in
`tenant-contract.ts` and reads the bare number, and `readPlatformPendingCount` in the platform
`overview-service.ts`, beside the `countTenantsInStatus` the bell used. `countUserApprovals` and
`countBranchActivations` stay: the queue's tab counts, the overview's Pending approvals card and
its readiness items use them.

### Task 2: Bells

- **`components/shell/tenant-notifications.tsx`** and `approval-notifications.ts`:
  - users = `memberships − provisioning` (the existing provisioning read, never below 0);
  - branches = `branches`;
  - a missing key means that line isn't shown;
  - the `branch.approve` gate comes from the response, not a client code check.
- **`components/shell/platform-notifications.tsx`:** `tenants`.
- **Tests:** RTL for missing keys and the subtraction; e2e `approvals.spec.ts`'s bell numbers. The
  fake excludes the caller's own requests, so expected numbers may change; derive them from the
  scenario.

**As built:**

- **No subtraction (the honest option).** Since the two populations differ (see the wire facts),
  the user line is `min(memberships, pending − provisioning)` (`bellUserApprovals`). The platform's
  count still holds identities provisioning, and the User onboarding tab's total (the two
  `size=1` reads of `countUserApprovals`, shared per request with the queue and the overview)
  still holds the caller's own requests: both are upper bounds on what the caller can decide, so
  the bell takes the lower. It is exact while the caller has no request of their own pending, and
  never reads below what waits. A tighter answer would need the caller's own provisioning requests,
  which only a bounded scan could find (a new named exception): not worth it for a badge the
  platform itself calls an upper bound. In the `approvals` scenario the bell reads 8 users (Jane
  can decide 7: Carol is hers and Daniel is provisioning) and 2 branches.
- **Who asks.** The route refuses a caller who approves neither kind tenant-wide, which `load()`
  would show as "couldn't be loaded". The tab totals are read beside the count route, not after it,
  for a holder of the membership pair and `user.view` tenant-wide (`canCountUserApprovals`);
  without `user.view` there is no tab to cap the line or to open, so there is no user line. So the
  bell asks only a caller it can show a line to (`canCountPendingApprovals`): that one, or a
  holder of `branch.approve` and `branch.view` tenant-wide. A holder of the membership pair alone
  has no bell, never one that reads "nothing waiting" while members wait. The lines shown are the
  keys the platform sends.
- **Shared words.** `approvalNotifications` now takes plain counts and stays the words the
  overview's Pending approvals card and Onboarding item say over their list totals;
  `bellNotifications` is the bell's arithmetic over the count route.
- **Badge at zero.** `NotificationsMenu` renders its MUI `Badge` only while there is a count. A
  hidden `Badge` keeps its previous number as text (for its exit animation), so a bell refreshed in
  place from 1 to 0 kept a "1" its name ("Notifications: nothing waiting") no longer carried: axe's
  serious `label-content-name-mismatch`. The platform-tenants return test found it, since Jane's
  platform bell now drops from 1 to 0 there (it went from 2 to 1 before).
- **Branch hint.** Entry 09, which landed below this entry, retired "Switch to All branches to
  activate them" (BG-03): a tenant-wide `branch.approve` holder activates from any branch context,
  so the bell's branch line simply shows for one, with no advice, and `bellNotifications` takes no
  branch flags.
- **Platform copy.** With the caller's own requests left out, the empty text "No institutions are
  waiting for approval." could be false, so it reads "No institutions are waiting for your
  approval." (the tenant bell's says "for your approval" already).
- **E2E.** The `approvals` bell reads 10 (8 users, 2 branches; 11 with maker-checker off), 9 after
  Kericho's activation; the platform bell reads 1 (Jane submitted Mwangaza), then "nothing
  waiting" after Harambee's approval while the overview's tile still counts Mwangaza;
  `overview-branch-scoped` reads 3 (the users) instead of "couldn't be loaded", since the platform
  counts no branches for `branch.approve` held at one branch. The invite wizard's bell stays at 3
  after Jane's own invitation, so the `refresh()` before the redirect
  (`invite-actions.test.ts`) is proved end to end with the switch off
  (`users-invite-self-approval`), where her invitation counts and the bell goes from 3 to 4.

### Task 3: Fake API

- **Both routes,** with the platform's exclusions (`created_by` = caller unless the switch is off;
  tenants exclude requester and submitter) and the key-omission rules.
- **Spec:** `e2e/fake-api-approvals.spec.ts`.

**As built:** `e2e/fake-api/routes/approval-counts.mts` serves both, in the platform's order: the
endpoint gate over the selected context's codes (`forbidden`), the context (tenant or platform),
then each kind tenant-wide with its views, a named 403 for neither. The spec pins the counts with
and without the switch, at a branch, after decisions (a 202 stays counted), the key omission
(`users-invite`, `overview-limited`, `overview-branch-scoped`, zeros in `approvals-empty`), the 403s
and the platform's exclusion. No scenario holds an approve code at one branch only without the
other kind tenant-wide, so the named 403 for neither is mirrored but not pinned.

### Task 4: Gates, docs, commit

- [x] Run `pnpm check` and the full e2e suite: green.
- [x] Register: BG-22 → **Adopted** (frontend #121), with "no feed" kept under Still open.
- [x] Contract: the two count routes.
- [x] Commit `feat(approvals): pending counts from the count routes`.

**As built:** the register also records the 2026-11-25 verification, and the summary line reads
10 backend fixed · 6 partly fixed · 0 open · 3 adopted · 16 closed. `README.md` describes both
bells, and `AGENTS.md`'s ninth list exception says the overview's card sits beside the queue's tab
counts, not the bell's.
