# bg-adopt 16 — Read a member's membership and assignments by id — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** The user record finds the member's membership and branch assignments directly (BG-09).
That retires the email search over 5 × 100 memberships, the 5 × 100 assignment scan, their
"partial" notes, and the per-page name lookups.

**Architecture:**

- **Membership:** the user read already carries `membershipId` (PR 08's contract), so the record
  reads `GET /tenant/memberships/{membershipId}` directly.
- **Branch assignments:** the tab becomes a normal server-paginated list,
  `GET /tenant/branch-assignments?user_id=&status=ACTIVE&sort_by=assignedAt`, with URL state and
  `TablePaginationBar`, using the embedded branch names.

**Spec:** [§8 entry 16](../specs/2026-11-24-backend-gap-adoption-design.md#16--member-reads-by-id)
· designs `#d-assign` · register BG-09.

## Wire facts (platform `6a8ea28`)

- **User reads.** `GET /tenant/users/{id}` and its list items carry `membership_id`,
  `membership_type`, `created_at` (the account's), `membership_created_at` and `created_by`.
- **`GET /tenant/memberships`** takes `user_id` and `member_number` filters. Its items carry
  `username`, `email`, `display_name`, `primary_branch_name`, `created_at`, `created_by` and
  `member_number`. Sort: `createdAt`, `membershipStatus`, `membershipType`.
- **`GET /tenant/branch-assignments`**
  - `user_id` ignores the selected branch, but results stay limited to branches where the caller
    holds `branch_assignment.view` (ACTIVE ones for a branch-scoped holder).
  - Items add `username`, `display_name`, `branch_name` and `assigned_at`.
  - Sort: `assignedAt`, `assignmentType`, `status`.
- **`/tenant/users?sort_by=createdAt`** sorts by the account's creation date (not the membership's).
  User onboarding keeps the list's default order, as today.

## Tasks

### Task 1: Membership by id

- **Callers:** `findUserMembership` (`modules/administration/users/user-service.ts`) is deleted. Its
  callers read the membership by `user.membershipId`:
  - `admin/users/[userId]/layout.tsx`, `page.tsx`, `audit/page.tsx`, `access/page.tsx`
  - `app/(authenticated)/admin/approvals/users/[userId]/page.tsx`
  - `approvals/components/requested-access.tsx`
- **Missing membership:** delete `MembershipLookup`'s `'missing'` state and its hero note. A user
  without a membership id here is a 404 (the user read is tenant-scoped).
- **Tests:** layout and page tests; the e2e users suite.

**As built:**

- The platform confirms it: `UserInTenantSummaryResponse.membership_id` is non-null, and the user
  read is the membership joined to the account (`findUserInTenant`), so a user without a
  membership here is the user read's own 404. The schema keeps `membership_id` required.
- The layout reads no membership at all: its actions post `user.membershipId`. With nothing
  looked up, `MembershipLookup` goes entirely (`'failed'` too), with both hero notes
  (`MEMBERSHIP_MISSING`, `MEMBERSHIP_UNAVAILABLE`); `membershipActionsNote(holder)` says only that
  `membership.view` is missing. `UserLifecycleActions` and `DecisionBar` take a required
  `membershipId`.
- The Overview and the approval page read `GET /tenant/memberships/{id}` only with
  `membership.view` held tenant-wide (`canTenantWide`), as the platform checks it
  (`requireTenantPermission`): a branch-scoped holder gets the not-permitted copy, not a 403 shown
  as a failure. The approval page takes the membership type from the user read,
  so its branch check no longer waits on `membership.view`; a failed membership read costs only the
  primary branch ("Couldn't be loaded"), never the decisions. `MEMBERSHIP_NOT_FOUND` goes.
- The Audit tab always offers the Membership view (the filter needs only `audit.view`) and reads
  no context.

### Task 2: Branch assignments paged by the platform

- **`listUserBranchAssignments(userId, page, size)`**: one page of
  `?user_id=&status=ACTIVE&sort_by=assignedAt&sort_dir=DESC&page=&size=`.
- **The tab** (`admin/users/[userId]/branches/page.tsx`) reads `page` and `size` from the URL and
  renders `TablePaginationBar`. Rows show Branch (the embedded name), Type and Assigned.
- **Delete** from `user-rules.ts`: `SCAN_CEILING`, `PARTIAL_SCAN_NOTE`, the "(partial)" count,
  `branchAssignmentsEmptyState`'s partial variants, `roleScopeHint`'s truncation and `pageOfItems`.
  `invite-service.ts` stops importing `SCAN_CEILING`; use a constant there if it still needs one.
- **The Overview's Branches count** uses the read's `totalItems` (`size=1`).
- **Branch-scoped note:** keep it only for a branch-scoped `branch_assignment.view` holder
  (`permission_scopes`, PR 04): "Only branches you can view are listed."
- **`AGENTS.md`:** rewrite the fifth named exception. The scan is gone; the Assign-branch and
  Assign-role drawers' option sets stay as they are.
- **Tests:** page and service tests; e2e `users.spec.ts` (pagination of a member with many
  assignments; no partial notes). Retire the specs for the ceiling and the partial notes.

**As built:**

- `countUserBranchAssignments` (`size=1`) beside `listUserBranchAssignments`. Rows show the
  embedded name with no code (items carry none) and Assigned as date and time in the
  organisation's zone, like the other tables. The tab reads the branch index only for a
  branch-scoped Assign-branch grant's options.
- `roleScopeHint` keeps its truncation, now over `ROLE_SCOPE_ASSIGNMENTS_PAGE` (100): the Roles &
  access tab reads one page of 100 of the user's assignments for the Assign-role drawer's branch
  scopes, and a page that ran out must not claim "no branch" (Ruling 8), nor pass for all of their
  branches: while it still offers some, `RoleScopeFields` says "Only the first 100 of their branch
  assignments are offered." under the Branch field. Its labels prefer the index (with the code),
  else the embedded name.
- The record's assignment reads (the Overview count, the Branch assignments tab and the
  Assign-role drawer's scopes) gate on `canAnywhere(holder, 'branch_assignment.view')`: the search
  by user is target-aware with no route gate, so a branch grant reads it at All branches too.
- The approval page's Requested access reads its branches the same way, one page of 100
  (`listRequestedBranches`, `BRANCHES_CAPPED`; the ceiling is now `REQUESTED_ACCESS_CEILING`), and
  its branch check counts the page's `totalItems`; AGENTS.md's seventh exception says so too.
- The branch-scoped note was entry 09's already (`SCOPED_ASSIGNMENTS_NOTE`, "Only assignments at
  branches you can view are shown."): kept, rather than the plan's wording.
- `invite-service.ts` keeps its own 5-page ceiling as a literal.

### Task 3: Fake API

- **`routes/memberships.mts`:** the `user_id` and `member_number` filters; the item fields.
- **`routes/branches.mts`:** branch-assignment search with `user_id` (ignores the selected branch,
  limited to the caller's viewable branches), embedded names and `assigned_at`, and sort.
- **`routes/tenant-reads.mts`:** the user summary and detail carry the membership fields (if PR 08
  didn't already).
- **Scenarios:** the `users-many-assignments` scenario becomes a pagination fixture.
- **Specs:** `e2e/fake-api-users.spec.ts`.

**As built:**

- Memberships: `user_id`, the names, `primary_branch_name` and `created_at`, and the platform's
  sort (`createdAt`, `membershipStatus`, `membershipType`, newest first, the id breaking ties; any
  other `sort_by` is a 400). `member_number`, field and filter, waits for entry 19, which seeds the
  numbers.
- Branch assignments: the names and `assigned_at` on the list, POST and DELETE bodies, and the
  sort (`assignedAt`, `assignmentType`, `status`), checked after the 403s. DELETE answers the
  platform's `BranchAssignmentDetailResponse` (organisation, assigner, revoker and timestamps),
  POST the summary.
- `tenant-reads.mts` needed nothing: PR 08 added the user read's membership fields.
- `users-many-assignments` gives Felix eleven outposts (`a16…` ids), twelve assignments in all.
- The branch record's Users tab keeps one user read per visible row, for the email the assignment
  items don't carry.

### Task 4: Gates, docs, commit

- [x] Run `pnpm check` and the full e2e suite: green.
- [x] Register: BG-09 → **Adopted** (frontend #123), keeping Still open (no role `ids`; role items
      thin).
- [x] Contract: the membership and branch-assignment filter rows.
- [x] Commit `feat(users): read a member's membership and assignments by id`.
