# bg-adopt 20 — Count columns for roles, branches and institutions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** The roles, branches and institutions directories show the counts the platform now puts on
list items (BG-15). A count the caller isn't allowed to see shows "—" with a tooltip.

**Architecture:**

- **Contracts:** three summary contracts gain nullable count fields.
- **Cell:** a shared, client-safe `CountCell` renders a number, or "—" plus a tooltip for `null`.
- **Tables:** three tables gain columns. `branch-directory-table.tsx` is shared by `/admin/branches`,
  the approval queue's Branch activation tab and the institution record's Branches tab. The queue
  tab hides the People column (`showCounts` prop) because pending branches have no users.

**Spec:** [§8 entry 20](../specs/2026-11-24-backend-gap-adoption-design.md#20--count-columns)
· designs `#d-counts` · register BG-15.

## Wire facts (platform `6a8ea28`)

- **Role summary**
  - `permission_count: number` counts every grant, whatever the permission's status.
  - `active_user_count: number | null` counts distinct users with an ACTIVE assignment. It is
    `null` unless the caller holds `role_assignment.view` tenant-wide.
- **Branch summary:** `active_user_count: number | null` counts distinct users. It is `null`
  unless `branch_assignment.view` covers that branch.
- **Platform tenant summary**
  - `active_branch_count: number | null` is `null` without `branch.view`.
  - `active_user_count: number | null` counts ACTIVE memberships; `null` without `user.view`.
  - For a platform caller both are judged in the platform organisation.
- **No counts:** detail responses carry no counts, and lists can't sort by a count.

## Tasks

### Task 1: Contracts and the cell

- **Contracts:** `role-contract.ts` (`permissionCount`, `activeUserCount`), `branch-contract.ts`
  (`activeUserCount`) and `tenant-contract.ts` (`activeBranchCount`, `activeUserCount`).
- **`CountCell`** (`components/data-display/count-cell.tsx`): `{ value: number | null; deniedLabel: string }`.
  It renders tabular numerals, or "—" with an MUI `Tooltip` whose title is `deniedLabel`.
- **Tests:** contract and cell tests; the cell is accessible (tooltip text exposed as the "—"'s
  accessible name).

### Task 2: Columns

- **Roles:** Permissions (`permissionCount`), and People (`activeUserCount`; denied label "Needs
  permission to view role assignments").
- **Branches:** People (denied label "Needs permission to view this branch's assignments").
- **Institutions:** Active branches and Active members (denied labels name `branch.view` and
  `user.view` in words).
- **Layout:** columns right-aligned. Below `md`, the count columns hide, as other secondary columns
  do in these tables; follow their existing responsive pattern.
- **Tests:** table tests; e2e column checks at desktop and 375 px (Review Focus 5).

### Task 3: Fake API

- **Counts:** role `summaryWire` (`routes/roles.mts`), `branchPage` (`routes/tenant-reads.mts`) and
  tenant `summary()` (`routes/platform-tenants.mts`) carry the counts, with the null rules above.
- **Specs:** the matching `fake-api-*.spec.ts`.

### Task 4: Gates, docs, commit

- [ ] Run `pnpm check` and the full e2e suite: green.
- [ ] Register: BG-15 → **Closed** (frontend #NN), keeping Still open.
- [ ] Contract: the count fields.
- [ ] Commit `feat(directories): count columns for roles, branches and institutions`.
