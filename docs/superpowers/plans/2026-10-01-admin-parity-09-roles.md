# PR 09: Roles & permissions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [plan index](./2026-09-25-admin-parity-00-index.md)
> and the [parallel lane rules](./2026-09-27-admin-parity-parallel-lanes.md) first.

**Goal:** Ship `/admin/roles` (spec §10.4):

- a searchable, filterable, sortable directory;
- the create role form, which lands on the new role's Permissions tab;
- the role record, with hero actions (Edit, Activate/Deactivate) and four tabs:
  - **Overview:** the definition, plus permission and active-assignment counts;
  - **Permissions:** granted permissions, a **Grant permissions** drawer over the catalogue
    (search, risk filter, grouped by module) and confirmed removal;
  - **Assignments:** who holds the role, with assign (TENANT or BRANCH scope) and revoke;
  - **Audit.**

It also ships the pieces lane rules §3 give 09 for later layers:

- `getRoleIndex()`, consumed by 10, 11 and 12;
- the role-assignment contract: the schemas, `listRoleAssignments`, the `assignRole` and
  `revokeRoleAssignment` Server Actions, `RoleScopeFields` and `RevokeRoleAssignmentButton`,
  consumed by 10 and 11.

**Architecture:**

- Server Components read through `modules/administration/roles/role-service.ts`, which uses zod
  snake_case schemas in `role-contract.ts`. This copies 08's branches module, one-for-one.
- The record is a nested-route layout. The layout reads the role once (a `cache()`d `getRole`) and
  renders `RecordHero` plus `RecordTabs`. Each tab (`page.tsx`, `permissions/`, `assignments/`,
  `audit/`) and the `edit/` page fetches its own data.
- Mutations are Server Actions built on 07's `runServerAction`. Known 409s get guard-specific,
  hedged messages from a local `explain()`, as in 08.
- The two multi-field forms, create and edit, share one React Hook Form component (`RoleForm`).
  Endpoints with no body use `ConfirmDialog`. The grant and assign forms use 08's
  `AssignmentDrawer`.
- One grant submit may carry up to 25 codes. The action writes them one by one, and each write's
  idempotency key is derived from the drawer's minted key (Ruling 5).
- The permission catalogue (80 codes, contract §F) is one cached, bounded read, passed to the
  client drawer, which filters it.

**Tech Stack:** Next.js 16 (nested layouts, Server Actions, `redirect`, `refresh`), React 19
`useActionState`/`cache`, React Hook Form 7.88 with `@hookform/resolvers` 5 (zod 4.6), MUI 9.4
(`TableSortLabel`, `Drawer` via `AssignmentDrawer`, `Checkbox`/`FormControlLabel`, `Tabs` via
`RecordTabs`), `node:crypto` (server only), Vitest and RTL, Playwright and axe. No new packages.

**Spec:** [`…-design.md`](../specs/2026-09-25-admin-prototype-parity-design.md):

- §10.4 (roles and permissions);
- §6.2 (wire, D8), §6.3 (`getRoleIndex`, the lookup ceiling), §6.4 (mutations, RHF), §6.5
  (branch context), §6.6 (permissions, BG-31), §6.7 (errors);
- §8 (nav order: Roles & permissions comes after Branches);
- §9 (list and record patterns, assignment `Drawer`, error summary `Alert`).

Contract:

- §C: `RoleSummary`, `RoleDetail`, `RolePermissionSummary`, `RoleAssignmentSummary`/`Detail`,
  `PermissionSummary`;
- §D: `CreateRole`, `UpdateRole`, `AssignPermission`, `AssignRole`;
- §E.3: the roles, permissions and role-assignment rows; §E.4: context;
- §F (role, permission and role-assignment enums), §G (role audit vocabulary), §I, §J.

Gaps: BG-07, BG-09, BG-15, BG-16, BG-27, BG-31.

**Backend evidence.** Where this plan cites the backend beyond the contract, it read the backend
source read-only at `f74e44b`. The contract was built at `7a7f4c3`, so every such fact is marked
"source f74e44b" and is verified at the Controller live check.

**Base:** 09 forks from `G'_08` = `c6411f2e2e37c34b70f5090f79a06f354fd52fad` (`lane/08-branches`
after B2's rebase onto `5de6701`, which holds 06, 07b, 07, 15 and 08). 08's fix wave
(`fix-wave.json`, 14 items) lands **inside** build(09) as slot(08), at a task boundary (lane rules
§8). The slot produces F_08 and rebases `lane/09-roles` onto it. Plan as if the wave never lands:
no task depends on its outcome (Pre-flight notes, item 3). `refs/lane-base/09-roles` records the
fork.

**Branch:** `lane/09-roles` in lane X (controller worktree, ports 3100/3199). The controller
registers it as `admin-parity/09-roles` and commits this plan (`docs(plans): add plan 09`) at the
fork. **No task in this plan commits the plan.**

**Launch.** Tasks 1–8 are all implementer tasks. Launch build(09) with `"tasks": 8` and
`prev` = 08 (`slug` `2026-09-27-admin-parity-08-branches`, `head` `c6411f2…`, `branch`
`lane/08-branches`, 08's `visual` text). Pass the **Gate checklist** below as the run's `visual`
arg. The Pre-flight notes and the Gate checklist sit above Task 1. The Controller live check and
the Self-review follow Task 8, behind a fence line that tells task readers to stop.

## Global Constraints

See the index and the lane rules. Additionally:

**Command forms (lane X).** Every command below shows only the command part. Run it in the form
below. Where the shared-machine rules in the dispatch context (`context.md`) differ, they win
(08 ledger PF14). Single-quote every path that contains `(authenticated)` or `[roleId]`, because
zsh globs them.

```
# T: focused unit tests (foreground)
flock -o -E 75 -w 240 /tmp/finaxis-e2e.lock env VITEST_MAX_WORKERS=3 pnpm exec vitest run <files>

# P: prettier/eslint for .mts files, which lint-staged skips (foreground). `pnpm check` (the hook)
#    still runs `prettier --check .` and `eslint .` over them.
flock -o -E 75 -w 240 /tmp/finaxis-e2e.lock env VITEST_MAX_WORKERS=3 pnpm exec prettier --write <files>
flock -o -E 75 -w 240 /tmp/finaxis-e2e.lock env VITEST_MAX_WORKERS=3 pnpm exec eslint --max-warnings=0 <files>

# E: scoped E2E (run_in_background + log + Monitor). First, `ss -ltn '( sport = :3100 or sport = :3199 )'`
#    must show no listener you didn't start. Never kill a 3100 listener.
flock -o -E 75 -w 1800 /tmp/finaxis-e2e.lock env VITEST_MAX_WORKERS=3 PORT=3100 FAKE_API_PORT=3199 pnpm test:e2e <specs>

# C: commit (run_in_background + Monitor). Write the message to
#    <your scratchpad>/commit-msgs/<name>.txt with the Write tool first. Stage whole files only. The
#    husky wrapper locks the hook, so git never goes inside flock. The hook (lint-staged + the full
#    `pnpm check`) is the check: never run `pnpm check` by hand first, never `--no-verify`.
git add <whole files>
VITEST_MAX_WORKERS=3 git commit -F <your scratchpad>/commit-msgs/<name>.txt

# G: gates (the workflow's gate phase only, never an implementer step)
```

Exit 75 means the lock wait timed out: retry, don't skip. A subagent's commit trailer names its own
model.

**Standing rulings (every task).**

- **Cross-tab guard (07's I2).** Every `ConfirmDialog`, `AssignmentDrawer` and `RoleForm` that 09
  renders passes `contextOrganisationId` from the page's resolved context:
  `selected.kind === 'resolved' ? selected.context.organization.id : undefined`.
  `runServerAction` reads the hidden field and refuses a mismatch with `code: 'context_changed'`,
  without calling the backend. Each component test pins the hidden field.
- **Kit freeze (lane rules §6).** These files change only additively, and each change is one
  announced `refactor(kit): …` commit:
  - 07b's `RecordHero`, `RecordTabs`, `RecordAuditTab`, `AuditViewToggle`, `audit-rows.ts`,
    `ConfirmDialog`, `list-sort.ts`, `CopyIdButton`, `ForbiddenState`/`BranchContextState`,
    `SwitchToAllBranchesButton`, `e2e/support/admin.ts` and the fake `requirePermission`;
  - 07's `runServerAction`, `ReasonDialog` and `SectionCard`.

  09 plans **no** kit change. 08's own Produces items (`AssignmentDrawer`, `UserPicker`,
  `ListToolbar`'s `search` kind, `applyFieldErrors`) are consumed, never edited.

- **Server → MUI element rule (AGENTS.md).** Never pass a pre-built element from a Server
  Component into an MUI prop gated by `isValidElement`/`cloneElement` (Chip
  `icon`/`avatar`/`deleteIcon`, Tab `icon`, FormControlLabel `control`). Every server-rendered
  `StatusChip` stays label-only. The checklist's `FormControlLabel control={<Checkbox/>}` is built
  inside its `'use client'` file. `RecordHero`'s avatar icon renders as `Avatar` children, which is
  not gated (08's precedent).
- **Focus after a status-changing action (07's I3, 08's PF6).** After a successful toggle, focus
  moves to the toggle's replacement if it renders, else to the record title. After a removal or
  revoke that unmounts its row, focus moves to the record title. Task 4 creates the shared title
  helper (Ruling 15).
- **Seed IDs** use `09000000-0000-4000-8000-00000000000n` (lane rules §5).
  - The scenario counter starts at `…001`.
  - The fake permission catalogue numbers its ids from `…000000000100`, inside 09's prefix.
  - The `roles` builder copies `greenfieldTenant()` and appends to its own copies.
    `greenfieldTenant()` and its existing collections are never edited.
- **Lists.** Every list is server-paginated with URL state. `TablePaginationBar` routes through
  `useListNavigation()`, and so does `ListToolbar`. The only unpaginated reads are bounded lookups:
  `getRoleIndex` (≤ 5 × 100), the catalogue (1 × 100) and the granted-code set (1 × 100), each
  with a `ponytail:` ceiling (Ruling 6).
- **One `h1` per page:** `RecordHero`'s title on record pages, `PageHeader`'s elsewhere.
- **Accessibility gate:** axe light/dark × desktop/375 px with no serious or critical violations
  (Task 8), and no horizontal page scroll at 375 px.
- **Fake API:** erasable TypeScript only (no enums, namespaces or parameter properties), relative
  `.mts` imports, `import type` for types, prettier-clean by hand (form P). Any new `FakeRole`
  field is **optional**, because 07b's `e2e/fake-api-access.spec.ts` builds a `FakeRole` literal.
- **No new packages.** No `package.json`, lockfile, config or `test/*` change (controller-owned).
- **Lint traps (strictTypeChecked + stylisticTypeChecked).**
  - Use `??` only on nullable left operands.
  - Template literals take numbers and strings only.
  - Give arrow handlers braces when they return void.
  - Use `return await` inside `try`.
  - Write `interface`, not object `type` aliases.
  - Never use `delete obj[key]`, which `no-dynamic-delete` refuses.
  - Use `slotProps.htmlInput`, never the deprecated `inputProps`.

**Fake seed rule.** The fake `default` scenario stays read-only for role mutations. 09's mutation
codes live only in its own `roles` builder:

- `role.create`, `role.update`, `role.activate`, `role.deactivate`;
- `role.assign_permission`, `role.remove_permission`;
- `user.assign_role`, `user.revoke_role`.

`TENANT_ADMIN_PERMISSIONS` already holds the read codes 09 needs (`role.view`,
`role_assignment.view`, `permission.view`, `user.view`, `branch.view`, `audit.view`), so `default`
is the read-only gating scenario for `e2e/roles.spec.ts` "offers no mutations without the
permissions". The same reasoning is 08's Plan-1 ruling.

**Concurrent lane Y.** While 09 builds, Y finishes 13 (settings) and may start 16 (platform
tenants). Files both lanes may touch resolve by R2–R4 at integration:

- `administration-navigation.ts`: R2, spec §8 order. Roles & permissions goes after Branches;
  13's Settings goes before Business date.
- `scenarios.mts`, `state.mts`, `server.mts`: R3, append-only unions.
- `README.md`, `AGENTS.md`, `docs/backend-gaps.md`, the contract doc: R4. Add, never re-pad:
  09's contract notes go **below** the §E.3 table, never inside it.

**Rulings to record in the ledger** (the pre-flight writes these as `Ruling:` lines):

1. **Default stays read-only for role mutations.** See the fake seed rule above.
2. **The directory's columns are Role, Code, Type and Status.**
   - `RoleSummary` carries only `id`, `role_code`, `role_name`, `system_role` and `status`
     (contract §C, confirmed at source f74e44b). So spec §10.4's description and created columns
     can't render (D8: lists show only what their items carry).
   - Created order is the default (`createdAt DESC`, newest first). No header can offer it, because
     there's no created column. "Clear filters" returns to it.
   - Upgrade path: a Created column once role summaries carry `created_at` (BG-09 note, Task 8).
3. **Code gets its own sortable column** (08 Ruling 3). Role sorts by `roleName`, Code by
   `roleCode` and Status by `status`. Type isn't sortable, because no `system_role` sort field
   exists.
4. **Sort headers are server-built links** (08 Ruling 4). Each header shows its own
   `LinkPendingIndicator`. The rows carry no `hover` highlight, because only the name link
   navigates (08 fix-wave V8/C7).
5. **Granting several permissions in one submit.**
   - The drawer sends up to `MAX_GRANTS_PER_SUBMIT` = 25 codes, comma-joined in one hidden field.
     `runServerAction`'s `Object.fromEntries` keeps only one value per field name.
   - The action posts them **sequentially**. Each write's `Idempotency-Key` is
     `grantKey(formKey, code)`: the sha256 of `formKey:code`, formatted as a canonical lowercase
     8-4-4-4-12 UUID with version `4` and variant `8`. The backend refuses a non-canonical key with
     400 `INVALID_IDEMPOTENCY_KEY`.
   - The key is deterministic from the key the drawer minted when it opened, so a retry replays
     each write that already landed and resumes with the rest. This is AGENTS.md's intent ("never
     generate one per request"), and Task 8 records it as one AGENTS bullet.
   - A failure after some writes landed calls `refresh()`, so the landed grants show at once, and
     returns "N of M permissions were granted before this failed" plus the cause. The drawer keeps
     its selection for the retry.
   - Ceiling: 25 writes per submit. The write budget is 120/min (contract §A).
6. **The catalogue is one cached, bounded read.**
   - The read is `GET /tenant/permissions?page=0&size=100&sort_by=permissionCode&sort_dir=ASC`,
     with every status. Granted DEPRECATED and DISABLED codes still need their names.
   - The granted set is one bounded read: `GET /tenant/roles/{id}/permissions?page=0&size=100`.
   - The drawer lists the ACTIVE codes the role doesn't hold, grouped by module, and filters them
     client-side by search and risk. It captures its option list once per opening.
   - `ponytail:` both ceilings are 100. The catalogue has 80 codes (contract §F). When the read is
     truncated, the drawer says so.
   - The grants **table** stays server-paginated with URL state.
7. **Every removal confirms through `ConfirmDialog`.**
   - A CRITICAL grant, or one whose risk is unknown (catalogue unreadable), uses `tone="error"`
     (role `alertdialog`) with an explicit critical warning. Other removals use the primary tone.
   - Spec §10.4 requires confirming CRITICAL grants. One mechanism for all removals keeps one
     idempotency path.
8. **Edit is a page,** `/admin/roles/[roleId]/edit`, sharing the RHF `RoleForm` with create.
   - No kit dialog fits. `ReasonDialog` always renders a Reason field, and `UpdateRole` has none.
     `ConfirmDialog` posts through `<form action>`, so React resets typed fields after a failed
     submit (07's I1 class).
   - A blank description is sent as `null`, which keeps the current one: "a description can be
     replaced but not removed" (contract §D).
   - Source f74e44b shows that `""` would clear it. The UI never sends `""` (BG-09a, Task 8).
9. **Activate and Deactivate are custom-role only, through `ConfirmDialog`.** Their endpoints take
   no input, so the body is `{}`.
   - Deactivate uses the error tone, and adds a held-by-me warning when `/auth/me` lists the role
     for the signed-in user.
   - For a system role, every mutation control is hidden (contract §E.3: 409). The hero subtitle
     says "System role", and the Overview and Permissions sections explain that it's immutable.
     Assigning a system role stays available.
10. **Assignments.**
    - Assign is offered only for an ACTIVE role (BG-27: a DISABLED role grants nothing), and only
      with `user.view` (the `UserPicker` search).
    - BRANCH scope requires a branch, client-side (native `required`) and server-side (zod). It is
      never sent with a null `branch_id`, which is a 500 at source f74e44b (`requireNotNull`,
      BG-07). TENANT scope always sends `branch_id: null` (contract §D: else 422).
    - In a branch-selected context, the branch list holds only that branch (contract §E.4: another
      branch is a 404). At institution level it holds every branch in `getBranchIndex()`.
    - The 409 message names the branch-assignment guard first, then hedges.
11. **The Overview's counts** are one `size=1` read each (BG-15): permissions
    (`role.view`) and **active assignments** (`role_assignment.view`). The latter counts
    assignments, not distinct users: one user can hold the role at TENANT scope and at several
    branches. The row is labelled "Active assignments".
12. **Self-protection.** The backend has no guard, so two actions warn first, in their confirm
    copy:
    - revoking your own assignment (`assignment.userId === /auth/me user_id`);
    - deactivating a role you hold.
13. **The Audit tab has one view:** ROLE / role id. Role assignments are audited per assignment id
    (`USER_ROLE_ASSIGNMENT`, contract §G), and the audit API can't filter them by role (BG-16). One
    view means no toggle renders (08's PF10).
14. **`getRoleIndex` lives in `lib/api/lookups.ts`,** beside `getBranchIndex` (spec §6.1/§6.3).
    - It reads up to 5 pages of 100, sorted by `roleName`, with a local minimal schema like
      `branchNameSchema`.
    - `status` stays a plain `string`, so the lookup tolerates drift.
    - It returns an empty map on any failure, and callers fall back to short IDs.
15. **The record-title focus helper moves to the kit's folder as a new, import-free file,**
    `components/data-display/focus-record-title.ts`.
    - 08's `focusRecordTitle` lives in `branch-lifecycle-actions.tsx`. Importing it would drag
      08's Server Action module, and with it `auth`/env, into every roles component test, and
      into the roles client bundle.
    - 08's own ponytail note names this upgrade ("if another record page needs the same
      fallback").
    - 08 keeps its copy until a boundary switches it to the shared file. That is a deferred minor
      for the controller: 09 never edits an 08 file.
16. **Backend `validation_failed` violations are not mapped to fields** (07 and 08's rulings). The
    forms apply the same rules client-side and server-side.
17. **Create redirects to the new role's Permissions tab** (spec §10.4). Edit calls `refresh()` and
    then redirects to the record root: the edit page shares the `[roleId]` layout with its
    destination, so the hero must re-render with the new name. No toast crosses the redirect (08
    Ruling 13).
18. **Fake grant ids are derived, not seeded.**
    - `FakeRole.permissions` (codes) stays the source of truth for effective permissions
      (`access.mts`, frozen).
    - A grant's id is a stable sha256-derived UUID of `roleId:code`. Its `granted_at` comes from a
      new optional `FakeRole.grantedAt` map, falling back to `createdAt`.
    - The fake catalogue is the 54 foundation codes, with the names, modules and risks from the
      backend's V2 seed (source f74e44b). The 26 accounting codes aren't surfaced.
19. **Frontend length caps** (the backend columns are `TEXT`): role name 1–100 characters,
    description ≤ 500. The role code follows the contract's `^[A-Z0-9_-]{2,20}$`.

## Review Focus

Pins these index items:

- **Item 2 (double submit and retry):**
  - Task 3 `role-form.test.tsx` "retries with the same key";
  - Task 2 `role-actions.test.ts` "derives one stable, canonical key per code", for the grant
    fan-out;
  - the kit drawer and dialog keep their keys (08/07b tests).
- **Item 4 (long values at 375 px):** Task 8's a11y matrix renders the long-named Compliance role,
  the grant drawer and the assign drawer at 375 px.
- **Item 5 (schema drift):** Task 1 `role-contract.test.ts` "rejects drift…". The layout and tabs
  render `ErrorState` through `load()`.
- **Item 1 (stale context)** has no 09-specific trigger: no role mutation invalidates a context
  token (contract §A ties validity to the user, membership, organisation and branch, not roles).
  `load()` (06) covers every 09 read. No new pin.
- **Item 3 (branch cardinality)** is covered by the BRANCH-scope class below.

It adds five input classes:

1. **Hostile or stale URL state never reaches the backend.** An unknown `sortBy` is a backend
   500, and an unknown `status`, `type` or page size would send junk. Task 1 `role-query.test.ts`
   "drops anything the backend would reject or answer with a 500".
2. **System roles are immutable, and no control pretends otherwise.**
   - Task 1 `role-rules.test.ts` "hides every mutation of a system role";
   - Task 2 `role-actions.test.ts` "explains a 409 as an immutable role";
   - Task 8 `roles.spec.ts` "keeps a system role read-only".
3. **Self-lockout.** Revoking your own assignment, or deactivating a role you hold, warns before
   it happens.
   - Task 4 `role-lifecycle-actions.test.tsx` "warns a holder before deactivating";
   - Task 6 `role-assignment-actions.test.tsx` "warns before revoking your own assignment";
   - Task 8 "warns before you revoke your own assignment". Jane's long-named role isn't her only
     grant source, so the page survives the revoke.
4. **BRANCH-scope edge cases.**
   - BRANCH without a branch never reaches the backend (a 500 at source f74e44b).
   - TENANT always sends `branch_id: null` (else 422).
   - A branch context offers only its own branch (else 404).
   - No readable branches disables branch scope.
   - A user who isn't assigned at the branch gets the guard named (409).
   - Tests: Task 2 "assigns with an explicit scope body…", Task 6 `RoleScopeFields` tests, Task 8
     "offers only the selected branch…" and "explains a missing branch assignment…".
5. **A multi-permission grant that fails partway.** The landed writes show at once, the message
   says how many landed, and a retry replays them with the same derived keys.
   - Task 2 "a partial failure refreshes and says how many landed";
   - Task 5 `role-permission-actions.test.tsx`: "keeps the selection and the key after a partial
     failure, so the retry replays", "…carries the joined codes" and "caps the selection at 25…".

## Pre-flight notes (the build workflow's pre-flight phase; not a task)

Implementers never execute this section. The pre-flight runs it and writes the results to the
09 ledger.

1. **Confirm the base.**
   - `git log --oneline -1` shows `docs(plans): add plan 09`, on top of `c6411f2`.
   - `git merge-base --is-ancestor c6411f2e2e37c34b70f5090f79a06f354fd52fad HEAD` exits 0.
   - `git status --short` is empty.
2. **Slot(08) is pending, not applied.**
   - `.superpowers/sdd/2026-09-27-admin-parity-08-branches/fix-wave.json` exists, with 14 items
     and `reviewHead` `c6411f2`. There is no `fix-wave.done`.
   - 09 depends on none of the items. They are C1 (`UserPicker` `defaultValue?`), C4/C5 (picker
     messages), C6/C7 (the branch users tab), deferred-1, and V2–V9: the draft-form error summary,
     V3 (`ReasonDialog` `tone?`), Autocomplete density, the directory's Created nowrap, the hero
     action alignment, V7 (the record-title focus ring), V8 (no row hover) and V9 (search clear).
3. **After the slot lands** (each later task checks the code, not the ledger):
   - `grep -n "tone" components/data-display/reason-dialog.tsx`: 09 never uses `ReasonDialog`,
     so V3 changes nothing here.
   - `grep -n "defaultValue" modules/administration/users/components/user-picker.tsx`: an additive
     C1 prop. 09's call site passes none.
   - If V7 added a focus-visible ring to `RecordHero`'s `h1` (or the theme), 09's
     `focusRecordTitle` gets it for free, because it focuses the same `main h1`.
   - If V7 instead added a kit prop for the title focus target, record a
     `Ruling: 09 keeps its import-free helper; adopt the kit prop at the next boundary` and change
     nothing in 09.
   - Diff 08's `focusRecordTitle` (`modules/administration/branches/components/branch-lifecycle-actions.tsx`)
     against `components/data-display/focus-record-title.ts` from Task 4. If V7 changed its
     **body** (a class, a style, an attribute), mirror that change in the shared helper, in the
     next 09 task's commit, so both record pages show the same ring.
4. **Diff the pinned signatures** against `HEAD` with `git show HEAD:<path>`, never a moving tree.
   On any difference, adapt **09's call sites only**, never the producing file, and record a
   `Ruling:`.

   | From  | Item (path)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
   | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | 06    | `pageSchema`, `instantSchema`, `uuidSchema`, `UUID_PATTERN` (`lib/api/wire.ts`); `parsePaging`, `lastPageIfPastEnd`, `PAGE_SIZES` (`lib/api/paging.ts`); `toQueryString`, `toSearchParams` (`lib/api/query-string.ts`); `apiGet(path, schema)` (`lib/api/tenant-api.ts`); `load` (`lib/api/load.ts`); `getBranchIndex`, `getTenantUser`, `getOrganisationTimeZone` (`lib/api/lookups.ts`); `formatInstant`, `shortId` (`lib/format.ts`)                                                                                                                                                                                         |
   | 04/05 | `can`, `canAll`, `type PermissionHolder` (`auth/permissions.ts`); `getCurrentContextProfile` (`auth/context-service.ts`), whose `resolved.profile.user_id`, `.permissions` and `.roles[].id` and `resolved.context.organization.id`/`.branch` 09 reads; `PageHeader({ eyebrow?, title, description?, actions? })`                                                                                                                                                                                                                                                                                                               |
   | 06    | `ListToolbar({ fields, resultLabel, chips?, timeZone })` with `{ kind: 'select'; name; label; allLabel; options }`; `TablePaginationBar({ page })`; `ListNavigationProvider`, `ListNavigationProgress`, `ListBusyRegion`; `EmptyState({ title, description? })`, `ErrorState({ problem })`, `StatusChip({ value, label?, tone? })`, `humanizeEnum`, `TruncatedText({ value, maxWidth, variant?, color? })`, `DescriptionList({ items, columns? })`, `type DescriptionItem`, `LinkPendingIndicator`, `NextLink` (default export)                                                                                                 |
   | 07    | `runServerAction(schema, formData, run)`, `type ActionResult`, `type FormAction` (`lib/api/action-result.ts`); `apiPost(path, body, key)`, `apiPatch(path, body, key)`, `apiDelete(path, key, body?)`; `SectionCard({ title, description?, actions?, headingLevel?, children })`                                                                                                                                                                                                                                                                                                                                                |
   | 07b   | `RecordHero({ back?, avatar, eyebrow, title, subtitle?, status?, actions? })` with `avatar: { kind: 'icon'; icon }`; `RecordTabs({ label, tabs })`; `RecordAuditTab({ views, params, path, title?, description? })`; `CopyIdButton({ value, label? })`; `ForbiddenState({ title?, description?, action? })`; `ConfirmDialog({ open, title, description, confirmLabel, tone?, action, onClose, onSuccess, children?, contextOrganisationId? })`; `parseListSort`, `sortQuery`, `type ListSort` (`lib/api/list-sort.ts`)                                                                                                          |
   | 08    | `ToolbarField` `{ kind: 'search'; name; label; placeholder? }`; `hrefWith(pathname, params, changes)`; `applyFieldErrors(setError, fieldErrors, fields)` (`lib/apply-field-errors.ts`); `AssignmentDrawer({ open, title, description?, submitLabel, action, onClose, onSuccess, children: (fieldErrors) => ReactNode, contextOrganisationId? })`; `UserPicker({ name, label, required?, error?, helperText?, onChange? })`                                                                                                                                                                                                      |
   | fake  | `requireContext`, `requireTenantContext`, `requirePermission(access, code, scope = 'tenant')`, `type AccessContext` (`access.mts`); `sendIdempotent(context, body, produce, status = 200)` (`idempotency.mts`); `recordAuditEvent(state, access, { entityType, entityId, action, reason })` (`audit-log.mts`); `objectBody`, `readBody`, `stringField`, `pageOf`, `problem`, `sendJson`, `type Violation` (`http.mts`); `route`, `type Route`, `type RouteContext` (`router.mts`); `role`, `membership`, `assignment`, `tenantRoleAssignment`, `greenfieldTenant`, `IDS` (`scenarios.mts`, module-private helpers except `IDS`) |
   | e2e   | `enterAdmin(page, pathname, { heading, organisation?, branch? })`, `A11Y_CASES`, `applyA11yCase`, `expectA11yCaseApplied`, `expectNoSeriousOrCriticalViolations` (`e2e/support/admin.ts`); `authenticate(context, testInfo, scenario?)`, `selectMuiOption(page, label, option)` (`e2e/support/auth.ts`)                                                                                                                                                                                                                                                                                                                         |

5. **Confirm the seed and shared-file constraints.**
   - `grep -n "role\.\(create\|update\|activate\|deactivate\|assign_permission\|remove_permission\)\|user\.\(assign\|revoke\)_role" e2e/fake-api/scenarios.mts`
     finds no hit inside `TENANT_ADMIN_PERMISSIONS` (fake seed rule).
   - `ls e2e/fake-api/routes/` shows no `roles.mts`.
   - `grep -rn "tenant/roles\|tenant/permissions\|role-assignments" app modules lib e2e` is empty.
   - `grep -n "getRoleIndex" lib/api/lookups.ts` is empty.
   - `components/data-display/focus-record-title.ts` doesn't exist.
   - `administration-navigation.ts` holds Overview, Branches, Business date and Audit trail. If 13's
     Settings has landed, it sits before Business date. Roles & permissions goes directly after
     Branches either way.
6. **Read the Next.js guides** before first use:
   `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/{layout,page,dynamic-routes}.md`
   and `01-app/02-guides/server-actions.md` (`redirect` and `refresh` inside an action).
7. **Affected E2E per task** (08's PF9 shape):
   - Tasks 1, 2 and 4–6 run no Playwright. Task 1 changes no route. Tasks 4–6 render pages whose
     fake routes arrive in Task 7.
   - Task 3 runs `e2e/shell.spec.ts`, because the rail gains an entry.
   - Task 7 runs
     `e2e/fake-api-roles.spec.ts e2e/fake-api.spec.ts e2e/fake-api-access.spec.ts e2e/fake-api-profile.spec.ts`,
     because `state.mts` and `scenarios.mts` change.
   - Task 8 runs `e2e/roles.spec.ts e2e/fake-api-roles.spec.ts`.
   - The full suite runs only at the gates.
8. **Ledger lines to write now:**
   - the 19 Rulings above;
   - these deferred minors, as `Layer 09: minor (deferred): <location> — <summary>` lines:
     - 08's `branch-lifecycle-actions.tsx` should import `focusRecordTitle` from
       `components/data-display/focus-record-title.ts` (controller, at a boundary);
     - `docs/backend-gaps.md` needs a Summary row for BG-09a under its renumbered ID (controller,
       at registration; Task 8 adds none, per R4);
     - a Created column in the role directory when `RoleSummary` gains `created_at`;
     - a whole-row click target for directory rows (08 V8 deferral);
   - and "no live check in tasks: the Controller live check runs at L2 on X".

## Gate checklist (the run's `visual` arg; the gate's visual phase runs it, never an implementer)

On every page below, in light and dark at 1440 and 375 px (`roles` scenario, All branches):

- **Pages:**
  - `/admin/roles`, unfiltered, then filtered by type System, then sorted by Role descending;
  - `/admin/roles/new`, empty, then after a submit with two invalid fields (the error summary
    `Alert` plus the field errors);
  - the Teller record's Overview, Permissions, Assignments and Audit tabs, and `/edit`;
  - Tenant admin's Overview and Permissions tabs (no mutation controls, the immutable copy).
- **Overlays:**
  - the grant drawer, with "business" typed and Risk = Critical, plus 25 checked to show the cap;
  - the assign drawer, with Scope = One branch;
  - the Deactivate confirmation, as a role Jane holds (the Compliance role);
  - the Remove confirmation for a CRITICAL grant (Operations supervisor → Advance business date);
  - the Revoke confirmation for Jane's own assignment.
- **Keyboard pass:**
  - Sort headers: Enter follows them.
  - Search: Enter commits.
  - Record tabs: arrow keys move between them.
  - Grant drawer: Tab reaches search, Risk and each checkbox. Space toggles a checkbox, and
    **Enter in the search box never submits**. Escape closes the drawer when idle, never while
    pending.
  - Assign drawer: the user picker (type, arrows, Enter), then Scope, then Branch.
  - After Deactivate, focus is on Activate. After Remove or Revoke, focus is on the record title.
  - Every stop shows the 2 px focus ring, unclipped. The carried, known clips are the
    `TablePaginationBar` next-page ring and `RecordTabs` at 375 px (15 ledger); record them as
    known, not new.
- **No horizontal page scroll at 375 px.** The tables scroll inside their focusable regions.
- **The ui-ux-pro-max pre-delivery checklist** (`references/pro-rules.md`) on the four record tabs
  and the two drawers.

---

### Task 1: Role contract, query, rules, service, and `getRoleIndex`

**Files:**

- Create, under `modules/administration/roles/`:
  - `role-contract.ts`, `role-contract.test.ts`
  - `role-query.ts`, `role-query.test.ts`
  - `role-rules.ts`, `role-rules.test.ts`
  - `role-service.ts`, `role-service.test.ts`
- Modify: `lib/api/lookups.ts` (add `getRoleIndex`), `lib/api/lookups.test.ts` (import it; two
  cases)

**Interfaces:**

- Consumes:
  - `pageSchema`, `instantSchema`, `uuidSchema` (`lib/api/wire.ts`, 06);
  - `parseListSort`, `sortQuery`, `type ListSort` (`lib/api/list-sort.ts`, 07b);
  - `parsePaging` (`lib/api/paging.ts`), `toQueryString` (`lib/api/query-string.ts`),
    `apiGet(path, schema)` (`lib/api/tenant-api.ts`) (06);
  - `can`, `canAll`, `type PermissionHolder` (`auth/permissions.ts`, 04);
  - `humanizeEnum` (`components/data-display/status-chip.tsx`, 06).
- Produces (later layers consume the ones marked ★; 10, 11 and 12 per lane rules §3):
  - `role-contract.ts`:
    - `ROLE_STATUSES` and `type RoleStatus`;
    - `ROLE_SORT_FIELDS` and `type RoleSortField`;
    - `PERMISSION_RISK_LEVELS` and `type PermissionRiskLevel`;
    - `PERMISSION_STATUSES` and `type PermissionStatus`;
    - ★ `ROLE_SCOPE_TYPES` and `type RoleScopeType`;
    - ★ `ROLE_ASSIGNMENT_STATUSES` and `type RoleAssignmentStatus`;
    - `rolePageSchema` and `type RoleSummary`, which is
      `{ id, roleCode, roleName, systemRole, status }`;
    - `roleDetailSchema` and `type RoleDetail`: the summary plus `description: string | null`
      (blank → `null`), `createdAt` and `updatedAt`;
    - `roleCreatedSchema`, which maps the create echo to `{ roleId }`;
    - `permissionPageSchema` and `type Permission`, which is
      `{ id, code, name, module, risk, status }`;
    - `rolePermissionPageSchema` and `type RolePermissionGrant`, which is
      `{ id, permissionCode, grantedAt }`;
    - ★ `roleAssignmentPageSchema` and `type RoleAssignment`, which is
      `{ id, userId, roleId, branchId: string | null, scopeType, status }`.
  - `role-query.ts`:
    - `DEFAULT_ROLE_PAGE_SIZE = 10`, `DEFAULT_ROLE_SORT`;
    - `ROLE_TYPE_FILTERS` (`'system' | 'custom'`), `type RoleTypeFilter`;
    - `interface RoleListQuery { q?; status?; type?; sort; page; size }`;
    - `parseRoleListQuery(params)`, `roleListApiPath(query)`.
  - `role-rules.ts`:
    - `roleTypeLabel(systemRole)`, `SYSTEM_ROLE_NOTE`;
    - `type RoleLifecycleAction = 'activate' | 'deactivate'`;
    - `canCreateRole(holder)`, `roleStatusAction(role, holder)`, `canEditRole(role, holder)`,
      `canGrantPermissions(role, holder)`, `canRemovePermissions(role, holder)`;
    - ★ `canAssignRole(role, holder)`, ★ `canRevokeRoleAssignments(holder)`,
      ★ `scopeLabel(scopeType)`;
    - `moduleLabel(module)`, `interface PermissionGroup`, `groupByModule(permissions)`;
    - `MAX_GRANTS_PER_SUBMIT = 25`;
    - `roleDraftSchema`, `roleEditFormSchema` and `type RoleDraftValues`.
  - `role-service.ts` (server-only):
    - `listRoles(query)`;
    - `getRole(roleId)` (`cache`d);
    - `listRolePermissions(roleId, paging)`;
    - `countRolePermissions(roleId): Promise<number | null>`;
    - `listGrantedCodes(roleId): Promise<ReadonlySet<string> | null>`;
    - ★ `interface RoleAssignmentFilter { roleId?; userId?; branchId?; scopeType?; status? }`;
    - ★ `listRoleAssignments(filter: RoleAssignmentFilter, paging: { page: number; size: number })`,
      which resolves to `Page<RoleAssignment>`;
    - `countActiveRoleAssignments(roleId): Promise<number | null>`;
    - `getPermissionCatalogue()` (`cache`d), which resolves to `Page<Permission> | null`.
  - ★ `lib/api/lookups.ts`:
    - `interface RoleIndexEntry { name: string; code: string; status: string; systemRole: boolean }`;
    - `getRoleIndex(): Promise<ReadonlyMap<string, RoleIndexEntry>>` (`cache`d, ≤ 5 × 100,
      sorted by name, empty on any failure).

- [ ] **Step 1: Write the failing tests**

`modules/administration/roles/role-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  permissionPageSchema,
  roleAssignmentPageSchema,
  roleCreatedSchema,
  roleDetailSchema,
  rolePageSchema,
  rolePermissionPageSchema,
} from './role-contract';

const TELLER = '09000000-0000-4000-8000-000000000007';
const USER = '09000000-0000-4000-8000-000000000004';
const ASSIGNMENT = '09000000-0000-4000-8000-00000000000d';
const GRANT = '09000000-0000-4000-8000-0000000000f1';
const PERMISSION = '09000000-0000-4000-8000-000000000131';
const PAGE = {
  number: 0,
  size: 10,
  total_items: 1,
  total_pages: 1,
  has_next: false,
  has_previous: false,
};
const DETAIL = {
  id: TELLER,
  organisation_id: '11111111-1111-4111-8111-111111111111',
  role_code: 'TELLER',
  role_name: 'Teller',
  description: 'Front-desk cash and member service.',
  system_role: false,
  status: 'ACTIVE',
  created_at: '2026-08-01T08:00:00Z',
  updated_at: '2026-08-02T08:00:00Z',
};

describe('role contract', () => {
  it('maps a role detail and reads a blank description as none', () => {
    expect(roleDetailSchema.parse(DETAIL)).toEqual({
      id: TELLER,
      roleCode: 'TELLER',
      roleName: 'Teller',
      description: 'Front-desk cash and member service.',
      systemRole: false,
      status: 'ACTIVE',
      createdAt: '2026-08-01T08:00:00Z',
      updatedAt: '2026-08-02T08:00:00Z',
    });
    expect(roleDetailSchema.parse({ ...DETAIL, description: '  ' }).description).toBeNull();
    expect(roleDetailSchema.parse({ ...DETAIL, description: null }).description).toBeNull();
  });

  it('rejects drift: an unknown role status, scope type or risk level (→ error state)', () => {
    expect(roleDetailSchema.safeParse({ ...DETAIL, status: 'RETIRED' }).success).toBe(false);
    expect(
      roleAssignmentPageSchema.safeParse({
        items: [
          {
            id: ASSIGNMENT,
            user_id: USER,
            role_id: TELLER,
            branch_id: null,
            scope_type: 'REGION',
            status: 'ACTIVE',
          },
        ],
        page: PAGE,
      }).success,
    ).toBe(false);
    expect(
      permissionPageSchema.safeParse({
        items: [
          {
            id: PERMISSION,
            permission_code: 'cob.start',
            permission_name: 'Start close of business',
            module_code: 'settings',
            risk_level: 'SEVERE',
            status: 'ACTIVE',
          },
        ],
        page: PAGE,
      }).success,
    ).toBe(false);
  });

  it('maps directory, grant, assignment and catalogue pages, which carry nothing else (D8)', () => {
    expect(
      rolePageSchema.parse({
        items: [
          {
            id: TELLER,
            role_code: 'TELLER',
            role_name: 'Teller',
            system_role: false,
            status: 'DISABLED',
          },
        ],
        page: PAGE,
      }).items[0],
    ).toEqual({
      id: TELLER,
      roleCode: 'TELLER',
      roleName: 'Teller',
      systemRole: false,
      status: 'DISABLED',
    });
    expect(
      rolePermissionPageSchema.parse({
        items: [
          {
            id: GRANT,
            role_id: TELLER,
            permission_id: PERMISSION,
            permission_code: 'cob.start',
            granted_at: '2026-09-01T10:00:00.123Z',
          },
        ],
        page: PAGE,
      }).items[0],
    ).toEqual({ id: GRANT, permissionCode: 'cob.start', grantedAt: '2026-09-01T10:00:00.123Z' });
    expect(
      roleAssignmentPageSchema.parse({
        items: [
          {
            id: ASSIGNMENT,
            user_id: USER,
            role_id: TELLER,
            branch_id: null,
            scope_type: 'TENANT',
            status: 'ACTIVE',
          },
        ],
        page: PAGE,
      }).items[0],
    ).toEqual({
      id: ASSIGNMENT,
      userId: USER,
      roleId: TELLER,
      branchId: null,
      scopeType: 'TENANT',
      status: 'ACTIVE',
    });
    expect(
      permissionPageSchema.parse({
        items: [
          {
            id: PERMISSION,
            permission_code: 'business_date.advance',
            permission_name: 'Advance business date',
            module_code: 'settings',
            risk_level: 'CRITICAL',
            status: 'DEPRECATED',
          },
        ],
        page: PAGE,
      }).items[0],
    ).toEqual({
      id: PERMISSION,
      code: 'business_date.advance',
      name: 'Advance business date',
      module: 'settings',
      risk: 'CRITICAL',
      status: 'DEPRECATED',
    });
  });

  it('reads only the new role id from the create echo', () => {
    expect(roleCreatedSchema.parse({ ...DETAIL, status: 'SOMETHING_NEW' })).toEqual({
      roleId: TELLER,
    });
  });
});
```

`modules/administration/roles/role-query.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseRoleListQuery, roleListApiPath } from './role-query';

const parse = (query: string) => parseRoleListQuery(new URLSearchParams(query));

describe('role list query', () => {
  it('reads filters, sort, and paging from the URL', () => {
    expect(
      parse('q=%20tell%20&status=DISABLED&type=custom&sortBy=roleCode&sortDir=desc&page=2&size=20'),
    ).toEqual({
      q: 'tell',
      status: 'DISABLED',
      type: 'custom',
      sort: { by: 'roleCode', dir: 'DESC' },
      page: 2,
      size: 20,
    });
  });

  it('drops anything the backend would reject or answer with a 500', () => {
    expect(parse('status=PAUSED&type=both&sortBy=role_code&size=7&page=-1')).toEqual({
      sort: { by: 'createdAt', dir: 'DESC' },
      page: 0,
      size: 10,
    });
  });

  it('builds the snake_case request: system_role from the type, camelCase sort values', () => {
    expect(roleListApiPath(parse('q=tell&type=system&sortBy=roleName'))).toBe(
      '/api/v1/tenant/roles?q=tell&system_role=true&sort_by=roleName&sort_dir=ASC&page=0&size=10',
    );
    expect(roleListApiPath(parse('type=custom'))).toBe(
      '/api/v1/tenant/roles?system_role=false&sort_by=createdAt&sort_dir=DESC&page=0&size=10',
    );
  });
});
```

`modules/administration/roles/role-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Permission } from './role-contract';
import {
  canAssignRole,
  canCreateRole,
  canEditRole,
  canGrantPermissions,
  canRemovePermissions,
  canRevokeRoleAssignments,
  groupByModule,
  moduleLabel,
  roleDraftSchema,
  roleStatusAction,
  scopeLabel,
} from './role-rules';

const ALL = [
  'role.view',
  'role.update',
  'role.activate',
  'role.deactivate',
  'role.assign_permission',
  'role.remove_permission',
  'permission.view',
  'user.assign_role',
  'user.revoke_role',
  'role_assignment.view',
  'user.view',
];
const CUSTOM = { systemRole: false, status: 'ACTIVE' } as const;
const SYSTEM = { systemRole: true, status: 'ACTIVE' } as const;
const DRAFT = { roleCode: 'CREDIT_CLERK', roleName: 'Credit clerk', description: '' };
const permission = (code: string, module: string): Permission => ({
  id: code,
  code,
  name: code,
  module,
  risk: 'LOW',
  status: 'ACTIVE',
});

describe('role rules', () => {
  it.each([
    ['ACTIVE', 'deactivate'],
    ['DISABLED', 'activate'],
    ['ARCHIVED', 'activate'],
  ] as const)('a custom %s role offers %s (any state → ACTIVE / DISABLED)', (status, expected) => {
    expect(roleStatusAction({ systemRole: false, status }, { permissions: ALL })).toBe(expected);
  });

  it('hides every mutation of a system role (contract §E.3: 409), but still assigns it', () => {
    const holder = { permissions: ALL };
    expect(roleStatusAction(SYSTEM, holder)).toBeNull();
    expect(canEditRole(SYSTEM, holder)).toBe(false);
    expect(canGrantPermissions(SYSTEM, holder)).toBe(false);
    expect(canRemovePermissions(SYSTEM, holder)).toBe(false);
    expect(canAssignRole(SYSTEM, holder)).toBe(true);
  });

  it('needs each code plus role.view for the read-back (BG-31)', () => {
    expect(roleStatusAction(CUSTOM, { permissions: ['role.deactivate'] })).toBeNull();
    expect(roleStatusAction(CUSTOM, { permissions: ['role.view', 'role.activate'] })).toBeNull();
    expect(canEditRole(CUSTOM, { permissions: ['role.update'] })).toBe(false);
    expect(canEditRole(CUSTOM, { permissions: ['role.update', 'role.view'] })).toBe(true);
    expect(canCreateRole({ permissions: ['role.create'] })).toBe(false);
    expect(canCreateRole({ permissions: ['role.create', 'role.view'] })).toBe(true);
    // The grant drawer browses the catalogue, so it needs permission.view too.
    expect(
      canGrantPermissions(CUSTOM, { permissions: ['role.assign_permission', 'role.view'] }),
    ).toBe(false);
    expect(canRemovePermissions(CUSTOM, { permissions: ['role.remove_permission'] })).toBe(false);
  });

  it('assigns only ACTIVE roles, with the user search; revokes with the read-back', () => {
    const holder = { permissions: ['user.assign_role', 'user.view'] };
    expect(canAssignRole(CUSTOM, holder)).toBe(true);
    expect(canAssignRole({ status: 'DISABLED' }, holder)).toBe(false);
    expect(canAssignRole(CUSTOM, { permissions: ['user.assign_role'] })).toBe(false);
    expect(canRevokeRoleAssignments({ permissions: ['user.revoke_role'] })).toBe(false);
    expect(
      canRevokeRoleAssignments({ permissions: ['user.revoke_role', 'role_assignment.view'] }),
    ).toBe(true);
    expect([scopeLabel('TENANT'), scopeLabel('BRANCH')]).toEqual(['Institution', 'Branch']);
  });

  it('groups the catalogue by module label, permissions by code', () => {
    const groups = groupByModule([
      permission('role.view', 'iam'),
      permission('audit.view', 'audit'),
      permission('auth.select_branch', 'iam'),
    ]);
    expect(groups.map((group) => [group.label, group.permissions.map((p) => p.code)])).toEqual([
      ['Audit', ['audit.view']],
      ['IAM', ['auth.select_branch', 'role.view']],
    ]);
    expect(moduleLabel('settings')).toBe('Settings');
  });

  it('validates a role like the backend does, plus the frontend caps', () => {
    expect(roleDraftSchema.safeParse(DRAFT).success).toBe(true);
    expect(roleDraftSchema.safeParse({ ...DRAFT, roleCode: 'credit clerk' }).success).toBe(false);
    expect(roleDraftSchema.safeParse({ ...DRAFT, roleCode: 'X' }).success).toBe(false);
    expect(roleDraftSchema.safeParse({ ...DRAFT, roleName: '   ' }).success).toBe(false);
    expect(roleDraftSchema.safeParse({ ...DRAFT, description: 'x'.repeat(501) }).success).toBe(
      false,
    );
  });
});
```

`modules/administration/roles/role-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args) as unknown,
}));

const service = await import('./role-service');

const ROLE = '09000000-0000-4000-8000-000000000007';
const USER = '09000000-0000-4000-8000-000000000004';

describe('role service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads by validated ids only; a malformed id rejects (a load() failure)', async () => {
    apiGet.mockResolvedValueOnce({});
    await service.getRole(ROLE);
    expect(apiGet).toHaveBeenCalledWith(`/api/v1/tenant/roles/${ROLE}`, expect.anything());
    await expect(service.getRole('../../tenant')).rejects.toThrow();
    await expect(service.listRolePermissions('../x', { page: 0, size: 10 })).rejects.toThrow();
    await expect(
      service.listRoleAssignments({ userId: 'not-a-uuid' }, { page: 0, size: 10 }),
    ).rejects.toThrow();
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('lists role assignments with snake_case filters (10 and 12 read by user)', async () => {
    apiGet.mockResolvedValueOnce({ items: [], page: {} });
    await service.listRoleAssignments(
      { userId: USER, scopeType: 'BRANCH', status: 'ACTIVE' },
      { page: 1, size: 20 },
    );
    expect(apiGet).toHaveBeenCalledWith(
      `/api/v1/tenant/role-assignments?user_id=${USER}&scope_type=BRANCH&status=ACTIVE&page=1&size=20`,
      expect.anything(),
    );
  });

  it('counts with one size=1 read each, or null when unreadable (BG-15)', async () => {
    apiGet.mockResolvedValueOnce({ items: [], page: { totalItems: 4 } });
    await expect(service.countRolePermissions(ROLE)).resolves.toBe(4);
    expect(apiGet).toHaveBeenLastCalledWith(
      `/api/v1/tenant/roles/${ROLE}/permissions?page=0&size=1`,
      expect.anything(),
    );
    apiGet.mockResolvedValueOnce({ items: [], page: { totalItems: 2 } });
    await expect(service.countActiveRoleAssignments(ROLE)).resolves.toBe(2);
    expect(apiGet).toHaveBeenLastCalledWith(
      `/api/v1/tenant/role-assignments?role_id=${ROLE}&status=ACTIVE&page=0&size=1`,
      expect.anything(),
    );
    apiGet.mockRejectedValueOnce(new Error('forbidden'));
    await expect(service.countRolePermissions(ROLE)).resolves.toBeNull();
  });

  it('reads the whole catalogue in one bounded, code-sorted read — or null', async () => {
    const page = { items: [], page: { hasNext: false } };
    apiGet.mockResolvedValueOnce(page);
    await expect(service.getPermissionCatalogue()).resolves.toBe(page);
    expect(apiGet).toHaveBeenCalledWith(
      '/api/v1/tenant/permissions?page=0&size=100&sort_by=permissionCode&sort_dir=ASC',
      expect.anything(),
    );
    apiGet.mockRejectedValueOnce(new Error('forbidden'));
    await expect(service.getPermissionCatalogue()).resolves.toBeNull();
  });

  it('collects every granted code in one bounded read', async () => {
    apiGet.mockResolvedValueOnce({
      items: [{ permissionCode: 'cob.start' }, { permissionCode: 'branch.view' }],
      page: {},
    });
    await expect(service.listGrantedCodes(ROLE)).resolves.toEqual(
      new Set(['cob.start', 'branch.view']),
    );
    expect(apiGet).toHaveBeenCalledWith(
      `/api/v1/tenant/roles/${ROLE}/permissions?page=0&size=100`,
      expect.anything(),
    );
  });
});
```

`lib/api/lookups.test.ts`: change the dynamic import line to

```ts
const { getBranchIndex, getOrganisationTimeZone, getRoleIndex, resolveUserNames } =
  await import('./lookups');
```

and append inside `describe('lookups', …)`:

```ts
it('indexes roles by id across pages, sorted by name, keeping an unknown status', async () => {
  apiGet
    .mockImplementationOnce(
      wire({
        items: [
          {
            id: 'r1',
            role_code: 'TELLER',
            role_name: 'Teller',
            system_role: false,
            status: 'ACTIVE',
          },
        ],
        page: envelope(0, true),
      }),
    )
    .mockImplementationOnce(
      wire({
        items: [
          {
            id: 'r2',
            role_code: 'TENANT_ADMIN',
            role_name: 'Tenant admin',
            system_role: true,
            status: 'RETIRED',
          },
        ],
        page: envelope(1, false),
      }),
    );

  const index = await getRoleIndex();

  expect(index.get('r1')).toEqual({
    name: 'Teller',
    code: 'TELLER',
    status: 'ACTIVE',
    systemRole: false,
  });
  // A lookup never blanks every name over one status it doesn't know.
  expect(index.get('r2')).toEqual({
    name: 'Tenant admin',
    code: 'TENANT_ADMIN',
    status: 'RETIRED',
    systemRole: true,
  });
  expect(apiGet).toHaveBeenCalledTimes(2);
  expect(apiGet).toHaveBeenNthCalledWith(
    1,
    '/api/v1/tenant/roles?page=0&size=100&sort_by=roleName&sort_dir=ASC',
    expect.anything(),
  );
});

it('leaves the role index empty without role.view', async () => {
  apiGet.mockRejectedValueOnce(new BackendApiError(403));
  await expect(getRoleIndex()).resolves.toEqual(new Map());
});
```

- [ ] **Step 2: Run them to see them fail**

Run (form T): `modules/administration/roles lib/api/lookups.test.ts`. Expected: FAIL. The roles
modules don't exist, and `getRoleIndex` isn't exported.

- [ ] **Step 3: Write the contract**

`modules/administration/roles/role-contract.ts`:

```ts
import { z } from 'zod';
import { instantSchema, pageSchema, uuidSchema } from '@/lib/api/wire';

export const ROLE_STATUSES = ['ACTIVE', 'DISABLED', 'ARCHIVED'] as const;
export type RoleStatus = (typeof ROLE_STATUSES)[number];

/** `sort_by` allow-list for `GET /tenant/roles` (contract §E.3); anything else is a backend 500. */
export const ROLE_SORT_FIELDS = ['roleName', 'roleCode', 'status', 'createdAt'] as const;
export type RoleSortField = (typeof ROLE_SORT_FIELDS)[number];

export const PERMISSION_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type PermissionRiskLevel = (typeof PERMISSION_RISK_LEVELS)[number];

export const PERMISSION_STATUSES = ['ACTIVE', 'DEPRECATED', 'DISABLED'] as const;
export type PermissionStatus = (typeof PERMISSION_STATUSES)[number];

/** TENANT applies at every branch and at institution level; BRANCH only while that branch is the
 * selected context (contract §F). */
export const ROLE_SCOPE_TYPES = ['TENANT', 'BRANCH'] as const;
export type RoleScopeType = (typeof ROLE_SCOPE_TYPES)[number];

export const ROLE_ASSIGNMENT_STATUSES = ['ACTIVE', 'REVOKED'] as const;
export type RoleAssignmentStatus = (typeof ROLE_ASSIGNMENT_STATUSES)[number];

/** A blank description reads as none. */
const descriptionSchema = z
  .string()
  .nullable()
  .transform((value) => (value?.trim() ? value : null));

const roleSummarySchema = z
  .object({
    id: uuidSchema,
    role_code: z.string(),
    role_name: z.string(),
    system_role: z.boolean(),
    status: z.enum(ROLE_STATUSES),
  })
  .transform((role) => ({
    id: role.id,
    roleCode: role.role_code,
    roleName: role.role_name,
    systemRole: role.system_role,
    status: role.status,
  }));

/** Role summaries carry nothing else: no description, dates, or counts (D8, BG-09, BG-15). */
export type RoleSummary = z.output<typeof roleSummarySchema>;

export const rolePageSchema = pageSchema(roleSummarySchema);

export const roleDetailSchema = z
  .object({
    id: uuidSchema,
    role_code: z.string(),
    role_name: z.string(),
    description: descriptionSchema,
    system_role: z.boolean(),
    status: z.enum(ROLE_STATUSES),
    created_at: instantSchema,
    updated_at: instantSchema,
  })
  .transform((role) => ({
    id: role.id,
    roleCode: role.role_code,
    roleName: role.role_name,
    description: role.description,
    systemRole: role.system_role,
    status: role.status,
    createdAt: role.created_at,
    updatedAt: role.updated_at,
  }));

export type RoleDetail = z.output<typeof roleDetailSchema>;

// Only the id: a create that succeeded must never fail on its echo (08's branchDraftResultSchema).
export const roleCreatedSchema = z
  .object({ id: uuidSchema })
  .transform((role) => ({ roleId: role.id }));

const permissionSchema = z
  .object({
    id: uuidSchema,
    permission_code: z.string(),
    permission_name: z.string(),
    // tenant/branch/iam/audit/settings/accounting today; free text, so a new module never breaks.
    module_code: z.string(),
    risk_level: z.enum(PERMISSION_RISK_LEVELS),
    status: z.enum(PERMISSION_STATUSES),
  })
  .transform((permission) => ({
    id: permission.id,
    code: permission.permission_code,
    name: permission.permission_name,
    module: permission.module_code,
    risk: permission.risk_level,
    status: permission.status,
  }));

export type Permission = z.output<typeof permissionSchema>;

export const permissionPageSchema = pageSchema(permissionSchema);

const rolePermissionSchema = z
  .object({
    id: uuidSchema,
    role_id: uuidSchema,
    permission_id: uuidSchema,
    permission_code: z.string(),
    granted_at: instantSchema,
  })
  .transform((grant) => ({
    // The role-permission id that DELETE takes (contract §C).
    id: grant.id,
    permissionCode: grant.permission_code,
    grantedAt: grant.granted_at,
  }));

export type RolePermissionGrant = z.output<typeof rolePermissionSchema>;

export const rolePermissionPageSchema = pageSchema(rolePermissionSchema);

const roleAssignmentSchema = z
  .object({
    id: uuidSchema,
    user_id: uuidSchema,
    role_id: uuidSchema,
    branch_id: uuidSchema.nullable(),
    scope_type: z.enum(ROLE_SCOPE_TYPES),
    status: z.enum(ROLE_ASSIGNMENT_STATUSES),
  })
  .transform((row) => ({
    id: row.id,
    userId: row.user_id,
    roleId: row.role_id,
    // null exactly for TENANT scope (contract §C).
    branchId: row.branch_id,
    scopeType: row.scope_type,
    status: row.status,
  }));

export type RoleAssignment = z.output<typeof roleAssignmentSchema>;

export const roleAssignmentPageSchema = pageSchema(roleAssignmentSchema);
```

- [ ] **Step 4: Write the query and the rules**

`modules/administration/roles/role-query.ts`:

```ts
import { parseListSort, sortQuery, type ListSort } from '@/lib/api/list-sort';
import { parsePaging } from '@/lib/api/paging';
import { toQueryString } from '@/lib/api/query-string';
import {
  ROLE_SORT_FIELDS,
  ROLE_STATUSES,
  type RoleSortField,
  type RoleStatus,
} from './role-contract';

export const DEFAULT_ROLE_PAGE_SIZE = 10;
export const DEFAULT_ROLE_SORT: ListSort<RoleSortField> = { by: 'createdAt', dir: 'DESC' };

/** The directory's Type filter: the URL's `type` → the wire's `system_role`. */
export const ROLE_TYPE_FILTERS = ['system', 'custom'] as const;
export type RoleTypeFilter = (typeof ROLE_TYPE_FILTERS)[number];

const SYSTEM_ROLE: Record<RoleTypeFilter, string> = { system: 'true', custom: 'false' };

export interface RoleListQuery {
  q?: string;
  status?: RoleStatus;
  type?: RoleTypeFilter;
  sort: ListSort<RoleSortField>;
  page: number;
  size: number;
}

/** URL → validated directory query; unknown statuses, types and sort fields are dropped, never
 * sent. */
export function parseRoleListQuery(params: URLSearchParams): RoleListQuery {
  const query: RoleListQuery = {
    ...parsePaging(params, DEFAULT_ROLE_PAGE_SIZE),
    sort: parseListSort(params, ROLE_SORT_FIELDS, DEFAULT_ROLE_SORT),
  };
  const q = params.get('q')?.trim().slice(0, 100);
  if (q) query.q = q;
  const status = ROLE_STATUSES.find((value) => value === params.get('status'));
  if (status) query.status = status;
  const type = ROLE_TYPE_FILTERS.find((value) => value === params.get('type'));
  if (type) query.type = type;
  return query;
}

export function roleListApiPath(query: RoleListQuery): string {
  return `/api/v1/tenant/roles${toQueryString({
    q: query.q,
    status: query.status,
    system_role: query.type === undefined ? undefined : SYSTEM_ROLE[query.type],
    ...sortQuery(query.sort),
    page: query.page,
    size: query.size,
  })}`;
}
```

`modules/administration/roles/role-rules.ts`:

```ts
import { z } from 'zod';
import { can, canAll, type PermissionHolder } from '@/auth/permissions';
import { humanizeEnum } from '@/components/data-display/status-chip';
import type { Permission, RoleScopeType, RoleStatus } from './role-contract';

interface RoleShape {
  systemRole: boolean;
  status: RoleStatus;
}

export function roleTypeLabel(systemRole: boolean): string {
  return systemRole ? 'System role' : 'Custom role';
}

export const SYSTEM_ROLE_NOTE =
  "System roles come from the platform: their name, status and permissions can't be changed. You can still assign them.";

export type RoleLifecycleAction = 'activate' | 'deactivate';

/** Every role mutation reads the role back, so it also needs `role.view` (BG-31). */
export function canCreateRole(holder: PermissionHolder): boolean {
  return canAll(holder, ['role.create', 'role.view']);
}

/** The one status toggle on offer — custom roles only, since a system role answers 409 (contract
 * §E.3). Activate and deactivate work from any state, so an ARCHIVED role offers Activate. */
export function roleStatusAction(
  role: RoleShape,
  holder: PermissionHolder,
): RoleLifecycleAction | null {
  if (role.systemRole || !can(holder, 'role.view')) return null;
  if (role.status === 'ACTIVE') return can(holder, 'role.deactivate') ? 'deactivate' : null;
  return can(holder, 'role.activate') ? 'activate' : null;
}

export function canEditRole(role: RoleShape, holder: PermissionHolder): boolean {
  return !role.systemRole && canAll(holder, ['role.update', 'role.view']);
}

/** The drawer browses the catalogue, so granting also needs `permission.view`. */
export function canGrantPermissions(role: RoleShape, holder: PermissionHolder): boolean {
  return (
    !role.systemRole && canAll(holder, ['role.assign_permission', 'role.view', 'permission.view'])
  );
}

export function canRemovePermissions(role: RoleShape, holder: PermissionHolder): boolean {
  return !role.systemRole && canAll(holder, ['role.remove_permission', 'role.view']);
}

/** Only an ACTIVE role: a DISABLED one grants nothing (BG-27). The drawer's user search needs
 * `user.view`. System roles are assignable. */
export function canAssignRole(role: Pick<RoleShape, 'status'>, holder: PermissionHolder): boolean {
  return role.status === 'ACTIVE' && canAll(holder, ['user.assign_role', 'user.view']);
}

export function canRevokeRoleAssignments(holder: PermissionHolder): boolean {
  return canAll(holder, ['user.revoke_role', 'role_assignment.view']);
}

export function scopeLabel(scopeType: RoleScopeType): string {
  return scopeType === 'TENANT' ? 'Institution' : 'Branch';
}

const MODULE_LABELS: Partial<Record<string, string>> = { iam: 'IAM' };

export function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? humanizeEnum(module);
}

export interface PermissionGroup {
  module: string;
  label: string;
  permissions: Permission[];
}

/** The catalogue grouped by module: groups by label, permissions by code. */
export function groupByModule(permissions: readonly Permission[]): PermissionGroup[] {
  const groups = new Map<string, Permission[]>();
  for (const permission of permissions) {
    const group = groups.get(permission.module);
    if (group) group.push(permission);
    else groups.set(permission.module, [permission]);
  }
  return [...groups]
    .map(([module, items]) => ({
      module,
      label: moduleLabel(module),
      permissions: items.sort((a, b) => a.code.localeCompare(b.code)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Codes per grant submit, each its own POST (Ruling 5); the write budget is 120/min. */
export const MAX_GRANTS_PER_SUBMIT = 25;

/** CreateRole (contract §D), shared by the form (RHF) and the Server Action. The backend columns
 * are TEXT; the name and description caps are the frontend's (Ruling 19). */
export const roleDraftSchema = z.object({
  roleCode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_-]{2,20}$/, 'Use 2–20 capital letters, digits, underscores or hyphens.'),
  roleName: z.string().trim().min(1, 'Enter a role name.').max(100, 'Use at most 100 characters.'),
  description: z.string().trim().max(500, 'Use at most 500 characters.'),
});

export type RoleDraftValues = z.infer<typeof roleDraftSchema>;

/** The edit form: the code shows read-only and is never sent (UpdateRole has no code). */
export const roleEditFormSchema = roleDraftSchema.extend({ roleCode: z.string() });
```

- [ ] **Step 5: Write the service and `getRoleIndex`**

`modules/administration/roles/role-service.ts`:

```ts
import 'server-only';
import { cache } from 'react';
import { toQueryString } from '@/lib/api/query-string';
import { apiGet } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import {
  permissionPageSchema,
  roleAssignmentPageSchema,
  roleDetailSchema,
  rolePageSchema,
  rolePermissionPageSchema,
  type RoleAssignmentStatus,
  type RoleScopeType,
} from './role-contract';
import { roleListApiPath, type RoleListQuery } from './role-query';

interface Paging {
  page: number;
  size: number;
}

export function listRoles(query: RoleListQuery) {
  return apiGet(roleListApiPath(query), rolePageSchema);
}

/** One read per request: the record layout (hero) and its tabs share it. `async`, so a malformed
 * id rejects (a `load()` failure) instead of throwing synchronously past `load()`. */
export const getRole = cache(async (roleId: string) => {
  const id = uuidSchema.parse(roleId);
  return await apiGet(`/api/v1/tenant/roles/${id}`, roleDetailSchema);
});

/** A role's grants, newest first (contract §E.3). */
export async function listRolePermissions(roleId: string, paging: Paging) {
  const id = uuidSchema.parse(roleId);
  const query = toQueryString({ page: paging.page, size: paging.size });
  return await apiGet(`/api/v1/tenant/roles/${id}/permissions${query}`, rolePermissionPageSchema);
}

/** BG-15: no count endpoint, so one `size=1` read; null when unreadable. */
export async function countRolePermissions(roleId: string): Promise<number | null> {
  try {
    return (await listRolePermissions(roleId, { page: 0, size: 1 })).page.totalItems;
  } catch {
    return null;
  }
}

// ponytail: one page of 100 holds every grant (the catalogue has 80 codes, contract §F).
const GRANT_CEILING = 100;

/** Every code the role holds, for the grant drawer's "not yet granted" filter; null when
 * unreadable. */
export async function listGrantedCodes(roleId: string): Promise<ReadonlySet<string> | null> {
  try {
    const grants = await listRolePermissions(roleId, { page: 0, size: GRANT_CEILING });
    return new Set(grants.items.map((grant) => grant.permissionCode));
  } catch {
    return null;
  }
}

export interface RoleAssignmentFilter {
  roleId?: string;
  userId?: string;
  branchId?: string;
  scopeType?: RoleScopeType;
  status?: RoleAssignmentStatus;
}

const optionalId = (value: string | undefined) =>
  value === undefined ? undefined : uuidSchema.parse(value);

/** `GET /tenant/role-assignments`: newest first, never branch-restricted (contract §E.4). Layer 10
 * reads a user's roles with `{ userId }`; 12 reads a pending user's requested roles. */
export async function listRoleAssignments(filter: RoleAssignmentFilter, paging: Paging) {
  const query = toQueryString({
    user_id: optionalId(filter.userId),
    role_id: optionalId(filter.roleId),
    branch_id: optionalId(filter.branchId),
    scope_type: filter.scopeType,
    status: filter.status,
    page: paging.page,
    size: paging.size,
  });
  return await apiGet(`/api/v1/tenant/role-assignments${query}`, roleAssignmentPageSchema);
}

/** BG-15: one `size=1` read; null when unreadable. It counts assignments, not distinct users
 * (Ruling 11). */
export async function countActiveRoleAssignments(roleId: string): Promise<number | null> {
  try {
    const page = await listRoleAssignments({ roleId, status: 'ACTIVE' }, { page: 0, size: 1 });
    return page.page.totalItems;
  } catch {
    return null;
  }
}

// ponytail: the catalogue is 80 codes (contract §F), so a page of 100 holds it. Past that, the
// rest render as codes and the drawer says the list is truncated.
const CATALOGUE_PATH =
  '/api/v1/tenant/permissions?page=0&size=100&sort_by=permissionCode&sort_dir=ASC';

/** The permission catalogue, every status: granted DEPRECATED/DISABLED codes still need their
 * names. null without `permission.view` or when unreadable. */
export const getPermissionCatalogue = cache(async () => {
  try {
    return await apiGet(CATALOGUE_PATH, permissionPageSchema);
  } catch {
    return null;
  }
});
```

`lib/api/lookups.ts`: append after `getBranchIndex` (leave everything above it untouched):

```ts
const roleIndexSchema = z
  .object({
    id: z.string(),
    role_code: z.string(),
    role_name: z.string(),
    system_role: z.boolean(),
    // A plain string: a lookup tolerates a status it doesn't know (the role directory doesn't).
    status: z.string(),
  })
  .transform((role) => ({
    id: role.id,
    entry: {
      name: role.role_name,
      code: role.role_code,
      status: role.status,
      systemRole: role.system_role,
    },
  }));

export interface RoleIndexEntry {
  name: string;
  code: string;
  status: string;
  systemRole: boolean;
}

const ROLE_PAGE_SIZE = 100;
// ponytail: name-resolution index capped at 500 roles (spec §6.3); beyond that IDs render short.
const ROLE_PAGE_CEILING = 5;

/** Every role by id (spec §6.3), sorted by name. It serves role names for 10's and 12's assignment
 * lists, and the ACTIVE roles for 10's and 11's role pickers. Empty without `role.view`. */
export const getRoleIndex = cache(async (): Promise<ReadonlyMap<string, RoleIndexEntry>> => {
  const index = new Map<string, RoleIndexEntry>();
  try {
    for (let page = 0; page < ROLE_PAGE_CEILING; page += 1) {
      const result = await apiGet(
        `/api/v1/tenant/roles?page=${page}&size=${ROLE_PAGE_SIZE}&sort_by=roleName&sort_dir=ASC`,
        pageSchema(roleIndexSchema),
      );
      result.items.forEach(({ id, entry }) => {
        index.set(id, entry);
      });
      if (!result.page.hasNext) break;
    }
  } catch {
    // Without role.view the index stays empty; callers fall back to short IDs.
  }
  return index;
});
```

Run (form T): `modules/administration/roles lib/api/lookups.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit** (form C)

`git add modules/administration/roles/role-contract.ts modules/administration/roles/role-contract.test.ts modules/administration/roles/role-query.ts modules/administration/roles/role-query.test.ts modules/administration/roles/role-rules.ts modules/administration/roles/role-rules.test.ts modules/administration/roles/role-service.ts modules/administration/roles/role-service.test.ts lib/api/lookups.ts lib/api/lookups.test.ts`

```
feat(roles): add the role, catalogue, and role-assignment contract, list query, rules, and reads

getRoleIndex joins lib/api/lookups.ts beside getBranchIndex (spec §6.3) for layers 10 to 12.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 2: Role Server Actions

**Files:**

- Create: `modules/administration/roles/role-actions.ts`, `role-actions.test.ts`

**Interfaces:**

- Consumes:
  - `runServerAction`, `type ActionResult` (`lib/api/action-result.ts`, 07);
  - `apiPost(path, body, idempotencyKey)`, `apiPatch(path, body, idempotencyKey)` and
    `apiDelete(path, idempotencyKey, body?)` (`lib/api/tenant-api.ts`, 07 A1);
  - `UUID_PATTERN`, `uuidSchema` (`lib/api/wire.ts`);
  - `refresh` (`next/cache`), `redirect` (`next/navigation`), `createHash` (`node:crypto`);
  - from Task 1: `roleDraftSchema`, `roleCreatedSchema`, `ROLE_SCOPE_TYPES`,
    `MAX_GRANTS_PER_SUBMIT`.
- Produces: `FormAction`s (`(previous: ActionResult | null, formData: FormData) => Promise<ActionResult>`).
  Their FormData fields:

  | Action                            | Fields                                                                                                             | Wire                                                                                                           | Success                                             |
  | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
  | `createRole`                      | `idempotencyKey`, `roleCode`, `roleName`, `description`                                                            | `POST /tenant/roles` `{ role_code, role_name, description: '' → null }`                                        | `redirect` to `/admin/roles/{id}/permissions`       |
  | `updateRole`                      | `idempotencyKey`, `roleId`, `roleName`, `description`                                                              | `PATCH /tenant/roles/{id}` `{ role_name, description: '' → null }`                                             | `refresh()`, then `redirect` to `/admin/roles/{id}` |
  | `activateRole` / `deactivateRole` | `idempotencyKey`, `roleId`                                                                                         | `POST …/activate` / `…/deactivate` `{}`                                                                        | `refresh()`                                         |
  | `grantPermissions`                | `idempotencyKey`, `roleId`, `permissionCodes` (comma-joined, 1–25)                                                 | one `POST /tenant/roles/{id}/permissions` `{ permission_code }` per code, key `grantKey(idempotencyKey, code)` | `refresh()` (also on a partial failure)             |
  | `removePermission`                | `idempotencyKey`, `roleId`, `grantId`                                                                              | `DELETE /tenant/roles/{id}/permissions/{grantId}`                                                              | `refresh()`                                         |
  | ★ `assignRole`                    | `idempotencyKey`, `roleId`, `userId`, `scopeType` (`TENANT`/`BRANCH`), `branchId` (`''`/uuid; required for BRANCH) | `POST /tenant/role-assignments` `{ user_id, role_id, scope_type, branch_id }` (TENANT → `null`)                | `refresh()`                                         |
  | ★ `revokeRoleAssignment`          | `idempotencyKey`, `assignmentId`                                                                                   | `DELETE /tenant/role-assignments/{id}`                                                                         | `refresh()`                                         |

  ★: 10 (the user record's Roles & access tab) and 11 consume these. 10 renders `roleId` as a
  field (a role picker) and `userId` as a hidden input. 09 does the reverse.

- [ ] **Step 1: Write the failing test**

`modules/administration/roles/role-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

const { apiDelete, apiPatch, apiPost, redirect, refresh, runServerAction } = vi.hoisted(() => ({
  apiPost: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
    Promise.resolve<unknown>({}),
  ),
  apiPatch: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
    Promise.resolve<unknown>({}),
  ),
  apiDelete: vi.fn((_path: string, _key: string) => Promise.resolve<unknown>({})),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  refresh: vi.fn(),
  runServerAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) as unknown }));
vi.mock('next/cache', () => ({
  refresh: () => {
    refresh();
  },
}));
vi.mock('@/lib/api/tenant-api', () => ({
  apiPost: (path: string, body: Record<string, unknown>, key: string) => apiPost(path, body, key),
  apiPatch: (path: string, body: Record<string, unknown>, key: string) => apiPatch(path, body, key),
  apiDelete: (path: string, key: string) => apiDelete(path, key),
}));
vi.mock('@/lib/api/action-result', () => ({
  runServerAction: (...args: unknown[]) => runServerAction(...args) as unknown,
}));

const actions = await import('./role-actions');

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const OTHER_KEY = '1b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const ROLE = '09000000-0000-4000-8000-000000000007';
const USER = '09000000-0000-4000-8000-000000000004';
const BRANCH = '44444444-4444-4444-8444-444444444444';
const GRANT = '09000000-0000-4000-8000-0000000000f1';
const ASSIGNMENT = '09000000-0000-4000-8000-00000000000d';
const CANONICAL = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/;

type Run = (input: unknown) => Promise<unknown>;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(fields).forEach(([name, value]) => {
    data.set(name, value);
  });
  return data;
}

const failure = (code: string) => ({
  ok: false as const,
  formError: 'generic',
  fieldErrors: {},
  code,
  requestId: 'req-1',
});

const keysSent = () => apiPost.mock.calls.map(([, , key]) => key);

describe('role actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Pass-through: this file covers fields, bodies, and messages; runServerAction has its own test.
    runServerAction.mockImplementation(async (schema: z.ZodType, formData: FormData, run: Run) => {
      await run(schema.parse(Object.fromEntries(formData)));
      return { ok: true };
    });
  });

  it('creates a role with an explicit snake_case body and lands on its Permissions tab', async () => {
    apiPost.mockResolvedValueOnce({ id: ROLE, status: 'ACTIVE' });

    await expect(
      actions.createRole(
        null,
        form({
          idempotencyKey: KEY,
          roleCode: 'CREDIT_CLERK',
          roleName: ' Credit clerk ',
          description: '',
        }),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/admin/roles/${ROLE}/permissions`);
    expect(apiPost).toHaveBeenCalledWith(
      '/api/v1/tenant/roles',
      { role_code: 'CREDIT_CLERK', role_name: 'Credit clerk', description: null },
      KEY,
    );
  });

  it("points a create 409 at the code without claiming it's a duplicate", async () => {
    runServerAction.mockResolvedValueOnce(failure('conflict'));
    expect(await actions.createRole(null, form({}))).toMatchObject({
      code: 'conflict',
      requestId: 'req-1',
      fieldErrors: { roleCode: 'This code may already be in use.' },
      formError: expect.stringContaining('may already be in use') as unknown,
    });
  });

  it('updates the name, keeps a blank description (null), and returns to the record', async () => {
    await expect(
      actions.updateRole(
        null,
        form({ idempotencyKey: KEY, roleId: ROLE, roleName: 'Senior teller', description: ' ' }),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/admin/roles/${ROLE}`);
    expect(apiPatch).toHaveBeenCalledWith(
      `/api/v1/tenant/roles/${ROLE}`,
      { role_name: 'Senior teller', description: null },
      KEY,
    );
    // Before the redirect, so the shared record layout's hero re-renders with the new name.
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['activateRole', 'activate'],
    ['deactivateRole', 'deactivate'],
  ] as const)('%s posts {} with the client key', async (name, path) => {
    await actions[name](null, form({ idempotencyKey: KEY, roleId: ROLE }));
    expect(apiPost).toHaveBeenCalledWith(`/api/v1/tenant/roles/${ROLE}/${path}`, {}, KEY);
  });

  it('explains a 409 as an immutable role and leaves other failures alone', async () => {
    for (const action of [
      actions.updateRole,
      actions.deactivateRole,
      actions.removePermission,
      actions.grantPermissions,
    ]) {
      runServerAction.mockResolvedValueOnce(failure('conflict'));
      expect(await action(null, form({}))).toMatchObject({
        formError: expect.stringContaining('system roles are immutable') as unknown,
      });
    }
    runServerAction.mockResolvedValueOnce(failure('forbidden'));
    expect(await actions.activateRole(null, form({}))).toMatchObject({ formError: 'generic' });
  });

  it('derives one stable, canonical key per code from the form key (Ruling 5)', async () => {
    const fields = {
      idempotencyKey: KEY,
      roleId: ROLE,
      permissionCodes: 'cob.start, business_date.view,cob.start',
    };
    await actions.grantPermissions(null, form(fields));
    expect(apiPost.mock.calls.map(([path, body]) => [path, body])).toEqual([
      [`/api/v1/tenant/roles/${ROLE}/permissions`, { permission_code: 'cob.start' }],
      [`/api/v1/tenant/roles/${ROLE}/permissions`, { permission_code: 'business_date.view' }],
    ]);
    const keys = keysSent();
    expect(keys[0]).toMatch(CANONICAL);
    expect(keys[1]).toMatch(CANONICAL);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys).not.toContain(KEY);

    // The same form retried replays the same writes; a new opening's key derives new ones.
    apiPost.mockClear();
    await actions.grantPermissions(null, form(fields));
    expect(keysSent()).toEqual(keys);
    apiPost.mockClear();
    await actions.grantPermissions(null, form({ ...fields, idempotencyKey: OTHER_KEY }));
    expect(keysSent()).not.toContain(keys[0]);
  });

  it('refuses no codes or more than 25 before calling the backend', async () => {
    await expect(
      actions.grantPermissions(
        null,
        form({ idempotencyKey: KEY, roleId: ROLE, permissionCodes: '' }),
      ),
    ).rejects.toThrow();
    const many = Array.from({ length: 26 }, (_, index) => `code.n${String(index)}`).join(',');
    await expect(
      actions.grantPermissions(
        null,
        form({ idempotencyKey: KEY, roleId: ROLE, permissionCodes: many }),
      ),
    ).rejects.toThrow();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('a partial failure refreshes and says how many landed', async () => {
    // The real runServerAction turns a thrown backend error into a failure result.
    runServerAction.mockImplementationOnce(
      async (schema: z.ZodType, formData: FormData, run: Run) => {
        try {
          await run(schema.parse(Object.fromEntries(formData)));
          return { ok: true };
        } catch {
          return failure('internal_error');
        }
      },
    );
    apiPost.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('network'));

    const result = await actions.grantPermissions(
      null,
      form({
        idempotencyKey: KEY,
        roleId: ROLE,
        permissionCodes: 'cob.start,cob.complete,branch.view',
      }),
    );

    expect(apiPost).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: false,
      formError: '1 of 3 permissions were granted before this failed. generic Retrying is safe.',
    });
  });

  it('removes a grant with DELETE', async () => {
    await actions.removePermission(
      null,
      form({ idempotencyKey: KEY, roleId: ROLE, grantId: GRANT }),
    );
    expect(apiDelete).toHaveBeenCalledWith(
      `/api/v1/tenant/roles/${ROLE}/permissions/${GRANT}`,
      KEY,
    );
  });

  it('assigns with an explicit scope body: TENANT sends no branch, BRANCH needs one', async () => {
    const assign = (fields: Record<string, string>) =>
      actions.assignRole(
        null,
        form({ idempotencyKey: KEY, roleId: ROLE, userId: USER, ...fields }),
      );

    await assign({ scopeType: 'TENANT' });
    expect(apiPost).toHaveBeenLastCalledWith(
      '/api/v1/tenant/role-assignments',
      { user_id: USER, role_id: ROLE, scope_type: 'TENANT', branch_id: null },
      KEY,
    );
    await assign({ scopeType: 'BRANCH', branchId: BRANCH });
    expect(apiPost).toHaveBeenLastCalledWith(
      '/api/v1/tenant/role-assignments',
      { user_id: USER, role_id: ROLE, scope_type: 'BRANCH', branch_id: BRANCH },
      KEY,
    );
    // A branch left over from a scope change never travels with TENANT scope (else 422).
    await assign({ scopeType: 'TENANT', branchId: BRANCH });
    expect(apiPost).toHaveBeenLastCalledWith(
      '/api/v1/tenant/role-assignments',
      expect.objectContaining({ branch_id: null }),
      KEY,
    );

    apiPost.mockClear();
    // BRANCH with no branch is a 500 at source f74e44b (BG-07): refused before the backend.
    await expect(assign({ scopeType: 'BRANCH', branchId: '' })).rejects.toThrow();
    await expect(assign({ scopeType: 'BRANCH' })).rejects.toThrow();
    await expect(assign({ scopeType: 'TENANT', userId: '' })).rejects.toThrow();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('names the branch-assignment guard on an assign 409', async () => {
    runServerAction.mockResolvedValueOnce(failure('conflict'));
    expect(await actions.assignRole(null, form({}))).toMatchObject({
      formError: expect.stringContaining('must already be assigned to that branch') as unknown,
    });
  });

  it('revokes with DELETE', async () => {
    await actions.revokeRoleAssignment(
      null,
      form({ idempotencyKey: KEY, assignmentId: ASSIGNMENT }),
    );
    expect(apiDelete).toHaveBeenCalledWith(`/api/v1/tenant/role-assignments/${ASSIGNMENT}`, KEY);
  });
});
```

The schema-rejection cases pass because the pass-through mock calls `schema.parse` and throws. The
real `runServerAction` returns `fieldErrors` instead (08's deferred minor on the same pattern).

- [ ] **Step 2: Run it to see it fail**

Run (form T): `modules/administration/roles/role-actions.test.ts`. Expected: FAIL (no module).

- [ ] **Step 3: Write the actions**

`modules/administration/roles/role-actions.ts`:

```ts
'use server';

import { createHash } from 'node:crypto';
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { apiDelete, apiPatch, apiPost } from '@/lib/api/tenant-api';
import { UUID_PATTERN, uuidSchema } from '@/lib/api/wire';
import { ROLE_SCOPE_TYPES, roleCreatedSchema } from './role-contract';
import { MAX_GRANTS_PER_SUBMIT, roleDraftSchema } from './role-rules';

const idempotencyKey = z.uuid();

/** Swaps the generic status message for one that names the guard behind a known code (spec §6.7).
 * branch-actions.ts keeps the same private helper; a 'use server' module can't export it. */
function explain(
  result: ActionResult,
  code: string,
  formError: string,
  fieldErrors: Partial<Record<string, string>> = {},
): ActionResult {
  if (result.ok || result.code !== code) return result;
  return { ...result, formError, fieldErrors: { ...result.fieldErrors, ...fieldErrors } };
}

// 409 = a system role (immutable) OR an optimistic-lock race (contract §I): never assert which.
const IMMUTABLE =
  "This role can't be changed: system roles are immutable. It may also have changed — refresh and check.";

export async function createRole(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(
    roleDraftSchema.extend({ idempotencyKey }),
    formData,
    async (input) => {
      const role = roleCreatedSchema.parse(
        await apiPost(
          '/api/v1/tenant/roles',
          {
            role_code: input.roleCode,
            role_name: input.roleName,
            description: input.description || null,
          },
          input.idempotencyKey,
        ),
      );
      // Rethrown by runServerAction (unstable_rethrow): the client lands on the new role's
      // Permissions tab (spec §10.4), where granting comes next.
      redirect(`/admin/roles/${role.roleId}/permissions`);
    },
  );
  // 409 = a duplicate code (contract §E.3) or a race: hedge, and point at the code.
  return explain(
    result,
    'conflict',
    "The role couldn't be created. Its code may already be in use.",
    {
      roleCode: 'This code may already be in use.',
    },
  );
}

const updateInput = roleDraftSchema
  .omit({ roleCode: true })
  .extend({ idempotencyKey, roleId: uuidSchema });

export async function updateRole(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(updateInput, formData, async (input) => {
    await apiPatch(
      `/api/v1/tenant/roles/${input.roleId}`,
      // `null` keeps the current description: it can be replaced, never removed (contract §D).
      // Source f74e44b shows `""` would clear it (BG-09a), so a blank field never sends `""`.
      { role_name: input.roleName, description: input.description || null },
      input.idempotencyKey,
    );
    // The edit page shares the record layout with its destination, and the router can reuse that
    // segment, so refresh before redirecting: the hero must show the new name (server-actions.md:
    // "Place revalidation calls before `redirect`"). runServerAction's own refresh() never runs,
    // because redirect() throws first.
    refresh();
    redirect(`/admin/roles/${input.roleId}`);
  });
  return explain(result, 'conflict', IMMUTABLE);
}

const statusInput = z.object({ idempotencyKey, roleId: uuidSchema });

/** Activate and deactivate take no input (contract §E.3), so the body is `{}`. */
function setStatus(path: 'activate' | 'deactivate', formData: FormData): Promise<ActionResult> {
  return runServerAction(statusInput, formData, (input) =>
    apiPost(`/api/v1/tenant/roles/${input.roleId}/${path}`, {}, input.idempotencyKey),
  );
}

export async function activateRole(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explain(await setStatus('activate', formData), 'conflict', IMMUTABLE);
}

export async function deactivateRole(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explain(await setStatus('deactivate', formData), 'conflict', IMMUTABLE);
}

const PERMISSION_CODE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

const grantInput = z.object({
  idempotencyKey,
  roleId: uuidSchema,
  // One hidden field, comma-joined: runServerAction's Object.fromEntries keeps one value per name.
  permissionCodes: z
    .string()
    .transform((value) => [
      ...new Set(
        value
          .split(',')
          .map((code) => code.trim())
          .filter(Boolean),
      ),
    ])
    .pipe(
      z
        .array(z.string().regex(PERMISSION_CODE))
        .min(1, 'Choose at least one permission.')
        .max(
          MAX_GRANTS_PER_SUBMIT,
          `Grant at most ${MAX_GRANTS_PER_SUBMIT} permissions at a time.`,
        ),
    ),
});

/**
 * One stable key per code, derived from the key the drawer minted when it opened: a retry
 * replays every write that already landed (AGENTS.md, Ruling 5). Canonical lowercase hex with
 * version 4 and variant 8: the backend refuses a non-canonical key (400 INVALID_IDEMPOTENCY_KEY).
 */
function grantKey(formKey: string, code: string): string {
  const hex = createHash('sha256').update(`${formKey}:${code}`).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

export async function grantPermissions(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const progress = { granted: 0, total: 0 };
  const result = await runServerAction(grantInput, formData, async (input) => {
    progress.total = input.permissionCodes.length;
    // ponytail: sequential, ≤ MAX_GRANTS_PER_SUBMIT writes per submit (the write budget is
    // 120/min); a bulk-grant endpoint would make this one call.
    for (const code of input.permissionCodes) {
      await apiPost(
        `/api/v1/tenant/roles/${input.roleId}/permissions`,
        { permission_code: code },
        grantKey(input.idempotencyKey, code),
      );
      progress.granted += 1;
    }
  });
  if (result.ok) return result;
  if (progress.granted > 0) {
    // The grants that landed are real, so show them now. A retry replays them (same derived keys)
    // and resumes with the rest.
    refresh();
    return {
      ...result,
      formError: `${progress.granted} of ${progress.total} permissions were granted before this failed. ${result.formError} Retrying is safe.`,
    };
  }
  return explain(result, 'conflict', IMMUTABLE);
}

const removeInput = z.object({ idempotencyKey, roleId: uuidSchema, grantId: uuidSchema });

export async function removePermission(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(removeInput, formData, (input) =>
    apiDelete(
      `/api/v1/tenant/roles/${input.roleId}/permissions/${input.grantId}`,
      input.idempotencyKey,
    ),
  );
  return explain(result, 'conflict', IMMUTABLE);
}

const assignInput = z
  .object({
    idempotencyKey,
    roleId: uuidSchema,
    userId: z.string().regex(UUID_PATTERN, 'Choose a user.'),
    scopeType: z.enum(ROLE_SCOPE_TYPES, { error: 'Choose a scope.' }),
    // Rendered only for BRANCH scope (RoleScopeFields).
    branchId: z.union([z.literal(''), uuidSchema]).optional(),
  })
  // BRANCH without a branch is a 500 at source f74e44b (`requireNotNull`, BG-07): never send it.
  .refine((input) => input.scopeType === 'TENANT' || Boolean(input.branchId), {
    error: 'Choose a branch.',
    path: ['branchId'],
  });

export async function assignRole(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(assignInput, formData, (input) =>
    apiPost(
      '/api/v1/tenant/role-assignments',
      {
        user_id: input.userId,
        role_id: input.roleId,
        scope_type: input.scopeType,
        // TENANT must send null (else 422, contract §D).
        branch_id: input.scopeType === 'BRANCH' ? (input.branchId ?? null) : null,
      },
      input.idempotencyKey,
    ),
  );
  // 409 = this guard OR a revoked membership, an inactive institution or a race: hedge.
  return explain(
    result,
    'conflict',
    "This user can't be given the role here. For one branch, they must already be assigned to that branch — assign them under Branches first. Their membership may also be revoked; refresh and check.",
  );
}

const revokeInput = z.object({ idempotencyKey, assignmentId: uuidSchema });

export async function revokeRoleAssignment(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // Revoking an already-revoked assignment is a no-op 200 (source f74e44b), so no guard to name.
  return runServerAction(revokeInput, formData, (input) =>
    apiDelete(`/api/v1/tenant/role-assignments/${input.assignmentId}`, input.idempotencyKey),
  );
}
```

Run (form T): `modules/administration/roles/role-actions.test.ts`. Expected: PASS.

- [ ] **Step 4: Commit** (form C)

`git add modules/administration/roles/role-actions.ts modules/administration/roles/role-actions.test.ts`

```
feat(roles): add role, permission-grant, and role-assignment Server Actions

A multi-permission grant writes one code at a time, each with a key derived from the drawer's
key, so a retry replays what landed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 3: The directory, the role form, and navigation

**Files:**

- Create: `modules/administration/roles/components/role-directory-table.tsx`,
  `role-directory-table.test.tsx`
- Create: `modules/administration/roles/components/role-form.tsx` (client), `role-form.test.tsx`
- Create: `app/(authenticated)/admin/roles/page.tsx`, `app/(authenticated)/admin/roles/new/page.tsx`
- Modify: `modules/administration/administration-navigation.ts` (its own commit, per the registry
  rule)

**Interfaces:**

- Consumes:
  - Tasks 1–2;
  - 06: `load`, `lastPageIfPastEnd`, `toSearchParams`, `ListNavigationProvider`,
    `ListNavigationProgress`, `ListBusyRegion`, `TablePaginationBar`, `EmptyState`, `ErrorState`,
    `StatusChip`, `humanizeEnum`, `LinkPendingIndicator`, `NextLink`;
  - 08: `ListToolbar` with the `search` and `select` kinds, `hrefWith`, `applyFieldErrors`;
  - 07b: `ForbiddenState`; 04: `PageHeader`; 05: `getCurrentContextProfile`;
  - React Hook Form `useForm`, `zodResolver` (`@hookform/resolvers/zod`).
- Produces:
  - `RoleDirectoryTable({ roles, sort, sortHref: (field: RoleSortField) => string })`, a Server
    Component whose function prop never crosses to the client;
  - `RoleForm({ role?: Pick<RoleDetail, 'id' | 'roleCode' | 'roleName' | 'description'>; contextOrganisationId?: string })`,
    which creates without `role` and edits with it (Task 4 mounts the edit mode);
  - routes `/admin/roles` and `/admin/roles/new`, and the "Roles & permissions" nav entry
    (`role.view`).

- [ ] **Step 1: Load skills**

Invoke `frontend-design`, then `ui-ux-pro-max`:

```
python "/home/ogaba/.claude/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/2.13.0/.claude/skills/ui-ux-pro-max/scripts/search.py" "roles permissions directory record grant drawer core banking SACCO administration console data-dense" --design-system --density 9 --motion 2 --variance 3 -p "Finaxis Administration"
```

Add `--domain ux "sortable table headers checkbox catalogue grouped drawer scoped assignment"`.
Keep the output as working notes for the whole layer. The prototype is the reference:
`/home/ogaba/Downloads/finaxis-admin-prototype-source-v5/finaxis-admin-prototype/src/App.jsx:1341-1420`
(the directory) and `:2043-2110` (the record tabs). Its scope, users and permissions columns are
mock data the API can't back (Ruling 2).

- [ ] **Step 2: Write the failing tests**

`modules/administration/roles/components/role-directory-table.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { RoleSummary } from '../role-contract';
import { RoleDirectoryTable } from './role-directory-table';

const TELLER = '09000000-0000-4000-8000-000000000007';
const LONG =
  'Compliance, risk and internal audit reviewer for member savings and credit operations';
const ROLES: RoleSummary[] = [
  { id: TELLER, roleCode: 'TELLER', roleName: 'Teller', systemRole: false, status: 'DISABLED' },
  {
    id: '66666666-6666-4666-8666-666666666666',
    roleCode: 'TENANT_ADMIN',
    roleName: LONG,
    systemRole: true,
    status: 'ACTIVE',
  },
];

describe('RoleDirectoryTable', () => {
  it('links each role, marks the sorted column, and leaves Type unsortable', () => {
    renderWithProviders(
      <RoleDirectoryTable
        roles={ROLES}
        sort={{ by: 'roleCode', dir: 'DESC' }}
        sortHref={(field) => `/sort/${field}`}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Code' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    expect(screen.getByRole('columnheader', { name: 'Role' })).not.toHaveAttribute('aria-sort');
    for (const [label, field] of [
      ['Role', 'roleName'],
      ['Code', 'roleCode'],
      ['Status', 'status'],
    ]) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', `/sort/${field}`);
    }
    expect(
      within(screen.getByRole('columnheader', { name: 'Type' })).queryByRole('link'),
    ).toBeNull();
    expect(screen.getByRole('link', { name: 'Teller' })).toHaveAttribute(
      'href',
      `/admin/roles/${TELLER}`,
    );
    expect(screen.getByRole('link', { name: LONG })).toHaveAttribute('title', LONG);
    expect(screen.getByText('System role')).toBeInTheDocument();
    expect(screen.getByText('Custom role')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });
});
```

`modules/administration/roles/components/role-form.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { UUID_PATTERN } from '@/lib/api/wire';
import { RoleForm } from './role-form';

const { createRole, updateRole } = vi.hoisted(() => ({
  createRole: vi.fn(),
  updateRole: vi.fn(),
}));
vi.mock('../role-actions', () => ({
  createRole: (...args: unknown[]) => createRole(...args) as unknown,
  updateRole: (...args: unknown[]) => updateRole(...args) as unknown,
}));

const ROLE = '09000000-0000-4000-8000-000000000007';
const ORG = '11111111-1111-4111-8111-111111111111';
const CONFLICT = {
  ok: false,
  formError: "The role couldn't be created. Its code may already be in use.",
  fieldErrors: { roleCode: 'This code may already be in use.' },
  code: 'conflict',
  requestId: 'req-3',
};
const sent = (action: typeof createRole, call: number) =>
  action.mock.calls[call]?.[1] as FormData | undefined;
const field = (name: string) => screen.getByRole('textbox', { name });

describe('RoleForm', () => {
  beforeEach(() => {
    createRole.mockReset();
    updateRole.mockReset();
  });

  it('validates on the client, with the field errors and a summary (spec §9)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoleForm />);

    await user.type(field('Role code'), 'credit clerk');
    await user.click(screen.getByRole('button', { name: 'Create role' }));

    expect(
      await screen.findByText('Use 2–20 capital letters, digits, underscores or hyphens.'),
    ).toBeInTheDocument();
    expect(field('Role code')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Check Role code, Role name.');
    expect(createRole).not.toHaveBeenCalled();
  });

  it('sends the fields with one key, shows server field errors, and retries with the same key', async () => {
    const user = userEvent.setup();
    createRole.mockResolvedValueOnce(CONFLICT).mockResolvedValueOnce({ ok: true });
    renderWithProviders(<RoleForm contextOrganisationId={ORG} />);

    await user.type(field('Role code'), 'CREDIT_CLERK');
    await user.type(field('Role name'), 'Credit clerk');
    await user.click(screen.getByRole('button', { name: 'Create role' }));

    expect(await screen.findByText('This code may already be in use.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('req-3');
    expect(Object.fromEntries(sent(createRole, 0) ?? new FormData())).toEqual({
      idempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown,
      roleCode: 'CREDIT_CLERK',
      roleName: 'Credit clerk',
      description: '',
      contextOrganisationId: ORG,
    });

    await user.click(screen.getByRole('button', { name: 'Create role' }));
    await waitFor(() => {
      expect(createRole).toHaveBeenCalledTimes(2);
    });
    expect(sent(createRole, 1)?.get('idempotencyKey')).toBe(
      sent(createRole, 0)?.get('idempotencyKey'),
    );
  });

  it('edits a role: the code is read-only and never sent', async () => {
    const user = userEvent.setup();
    updateRole.mockResolvedValueOnce({ ok: true });
    renderWithProviders(
      <RoleForm
        role={{ id: ROLE, roleCode: 'TELLER', roleName: 'Teller', description: 'Front desk.' }}
      />,
    );

    expect(field('Role code')).toHaveAttribute('readonly');
    expect(field('Role code')).toHaveValue('TELLER');
    await user.clear(field('Role name'));
    await user.type(field('Role name'), 'Senior teller');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(updateRole).toHaveBeenCalledTimes(1);
    });
    expect(Object.fromEntries(sent(updateRole, 0) ?? new FormData())).toEqual({
      idempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown,
      roleId: ROLE,
      roleName: 'Senior teller',
      description: 'Front desk.',
    });
    expect(createRole).not.toHaveBeenCalled();
  });
});
```

Run (form T): `modules/administration/roles/components`. Expected: FAIL (no components).

- [ ] **Step 3: Write the directory table**

`modules/administration/roles/components/role-directory-table.tsx`:

```tsx
import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';
import { LinkPendingIndicator } from '@/components/navigation/link-pending-indicator';
import { StatusChip } from '@/components/data-display/status-chip';
import type { ListSort } from '@/lib/api/list-sort';
import type { RoleSortField, RoleSummary } from '../role-contract';
import { roleTypeLabel } from '../role-rules';

// Type has no sort field in the contract's allow-list, so it is the one plain header (Ruling 3).
const COLUMNS: readonly { field: RoleSortField | null; label: string }[] = [
  { field: 'roleName', label: 'Role' },
  { field: 'roleCode', label: 'Code' },
  { field: null, label: 'Type' },
  { field: 'status', label: 'Status' },
];

interface RoleDirectoryTableProps {
  roles: readonly RoleSummary[];
  sort: ListSort<RoleSortField>;
  /** Server Component: this function prop never crosses to the client — keep it that way. */
  sortHref: (field: RoleSortField) => string;
}

/** The role directory (spec §10.4): only what role summaries carry (Ruling 2). Rows carry no
 * hover highlight, since only the name link navigates (Ruling 4). */
export function RoleDirectoryTable({ roles, sort, sortHref }: RoleDirectoryTableProps) {
  return (
    <TableContainer sx={{ maxHeight: { md: 'calc(100dvh - 300px)' }, minHeight: 240 }}>
      <Table stickyHeader aria-label="Roles" sx={{ minWidth: 640 }}>
        <TableHead>
          <TableRow>
            {COLUMNS.map(({ field, label }) => {
              if (field === null) return <TableCell key={label}>{label}</TableCell>;
              const active = sort.by === field;
              const direction = active && sort.dir === 'DESC' ? 'desc' : 'asc';
              return (
                <TableCell key={field} sortDirection={active ? direction : false}>
                  <TableSortLabel
                    component={NextLink}
                    href={sortHref(field)}
                    active={active}
                    direction={direction}
                  >
                    {label}
                    <LinkPendingIndicator />
                  </TableSortLabel>
                </TableCell>
              );
            })}
          </TableRow>
        </TableHead>
        <TableBody>
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell>
                <Link
                  component={NextLink}
                  href={`/admin/roles/${role.id}`}
                  variant="body2"
                  noWrap
                  title={role.roleName}
                  sx={{ display: 'block', maxWidth: 360, fontWeight: 700 }}
                >
                  {role.roleName}
                  <LinkPendingIndicator />
                </Link>
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {role.roleCode}
                </Typography>
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{roleTypeLabel(role.systemRole)}</TableCell>
              <TableCell>
                <StatusChip value={role.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
```

- [ ] **Step 4: Write the role form**

`modules/administration/roles/components/role-form.tsx`:

```tsx
'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import NextLink from '@/components/navigation/next-link';
import type { ActionResult } from '@/lib/api/action-result';
import { applyFieldErrors } from '@/lib/apply-field-errors';
import { createRole, updateRole } from '../role-actions';
import type { RoleDetail } from '../role-contract';
import { roleDraftSchema, roleEditFormSchema, type RoleDraftValues } from '../role-rules';

const FIELDS = ['roleCode', 'roleName', 'description'] as const;
const LABELS: Record<(typeof FIELDS)[number], string> = {
  roleCode: 'Role code',
  roleName: 'Role name',
  description: 'Description',
};

// Mirrors ReasonDialog's own I1 catch: never `caught.message` (a network drop, a proxy's non-RSC
// 502/504, or a stale deployment's UnrecognizedActionError may carry detail unsafe to show).
const SUBMIT_FAILED =
  "We couldn't confirm this change. Try again; it's safe to retry. If it keeps failing, reload the page.";

interface RoleFormProps {
  /** Edit mode: the code shows read-only and is never sent (UpdateRole has no code, contract §D). */
  role?: Pick<RoleDetail, 'id' | 'roleCode' | 'roleName' | 'description'>;
  /** I2: the organisation the page rendered with; sent only when present. */
  contextOrganisationId?: string;
}

/**
 * Create or edit a custom role (spec §10.4) with React Hook Form and the zod resolver (spec
 * §6.4). Server field errors merge back with `applyFieldErrors`, and client failures get an error
 * summary (spec §9). One idempotency key per mount: a retry after a failure replays safely, and
 * success redirects (Ruling 17).
 */
export function RoleForm({ role, contextOrganisationId }: RoleFormProps) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RoleDraftValues>({
    resolver: role ? zodResolver(roleEditFormSchema) : zodResolver(roleDraftSchema),
    defaultValues: {
      roleCode: role?.roleCode ?? '',
      roleName: role?.roleName ?? '',
      description: role?.description ?? '',
    },
  });
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      try {
        return await (role ? updateRole : createRole)(previous, formData);
      } catch (caught) {
        // The success path is a Server Action redirect(), which must keep propagating rather
        // than being swallowed as a form failure (07 I1's defect class).
        unstable_rethrow(caught);
        return {
          ok: false,
          formError: SUBMIT_FAILED,
          fieldErrors: {},
          code: 'network_error',
          requestId: null,
        };
      }
    },
    null,
  );
  const failure = state && !state.ok ? state : null;
  // From an effect, not the reducer: RHF's setError commits outside the action's transition
  // (BranchDraftForm's note).
  useEffect(() => {
    if (failure) applyFieldErrors(setError, failure.fieldErrors, FIELDS);
  }, [failure, setError]);
  const invalid = FIELDS.filter((name) => errors[name]);

  const onValid = (values: RoleDraftValues) => {
    const formData = new FormData();
    formData.set('idempotencyKey', idempotencyKey);
    if (role) formData.set('roleId', role.id);
    else formData.set('roleCode', values.roleCode);
    formData.set('roleName', values.roleName);
    formData.set('description', values.description);
    if (contextOrganisationId) formData.set('contextOrganisationId', contextOrganisationId);
    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <Box
      component="form"
      noValidate
      onSubmit={(event) => {
        void handleSubmit(onValid)(event);
      }}
      sx={{ p: 4.5, maxWidth: 640, display: 'grid', gap: 4 }}
    >
      {failure ? (
        <Alert severity="error">
          {failure.formError}
          {failure.requestId && ` Reference: ${failure.requestId}`}
        </Alert>
      ) : (
        invalid.length > 0 && (
          // Spec §9: errors on the fields plus a summary (08's fix wave V2 adds the same there).
          <Alert severity="error">Check {invalid.map((name) => LABELS[name]).join(', ')}.</Alert>
        )
      )}
      <TextField
        label="Role code"
        required={!role}
        {...register('roleCode')}
        error={Boolean(errors.roleCode)}
        helperText={
          errors.roleCode?.message ??
          (role
            ? "A role's code can't change."
            : '2–20 capital letters, digits, underscores or hyphens, e.g. TELLER.')
        }
        slotProps={{
          htmlInput: {
            maxLength: 20,
            autoCapitalize: 'characters',
            spellCheck: false,
            readOnly: Boolean(role),
          },
        }}
      />
      <TextField
        label="Role name"
        required
        {...register('roleName')}
        error={Boolean(errors.roleName)}
        helperText={errors.roleName?.message}
        slotProps={{ htmlInput: { maxLength: 100 } }}
      />
      <TextField
        label="Description"
        multiline
        minRows={2}
        {...register('description')}
        error={Boolean(errors.description)}
        helperText={
          errors.description?.message ??
          (role ? 'Optional. A description can be replaced but not removed.' : 'Optional.')
        }
        slotProps={{ htmlInput: { maxLength: 500 } }}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 2 }}>
        <Button
          component={NextLink}
          href={role ? `/admin/roles/${role.id}` : '/admin/roles'}
          variant="outlined"
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" variant="contained" loading={pending}>
          {role ? 'Save changes' : 'Create role'}
        </Button>
      </Box>
    </Box>
  );
}
```

Run (form T): `modules/administration/roles/components`. Expected: PASS.

- [ ] **Step 5: Write the directory and create pages**

`app/(authenticated)/admin/roles/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import AddOutlined from '@mui/icons-material/AddOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { ListNavigationProvider } from '@/components/data-display/list-navigation-context';
import {
  ListBusyRegion,
  ListNavigationProgress,
} from '@/components/data-display/list-pending-indicator';
import { ListToolbar } from '@/components/data-display/list-toolbar';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { lastPageIfPastEnd } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import { ROLE_STATUSES } from '@/modules/administration/roles/role-contract';
import { parseRoleListQuery } from '@/modules/administration/roles/role-query';
import { canCreateRole } from '@/modules/administration/roles/role-rules';
import { listRoles } from '@/modules/administration/roles/role-service';
import { RoleDirectoryTable } from '@/modules/administration/roles/components/role-directory-table';

export const metadata: Metadata = { title: 'Roles & permissions' };

const PATH = '/admin/roles';

interface RolesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RolesPage({ searchParams }: RolesPageProps) {
  const params = toSearchParams(await searchParams);
  const query = parseRoleListQuery(params);
  const [roles, selected] = await Promise.all([load(listRoles(query)), getCurrentContextProfile()]);
  const permissions = selected.kind === 'resolved' ? selected.profile.permissions : [];

  const header = (
    <PageHeader
      eyebrow="Administration"
      title="Roles & permissions"
      description="Reusable permission bundles, and who holds them institution-wide or at one branch."
      actions={
        canCreateRole({ permissions }) ? (
          <Button
            component={NextLink}
            href={`${PATH}/new`}
            variant="contained"
            startIcon={<AddOutlined />}
          >
            Create role
          </Button>
        ) : undefined
      }
    />
  );

  if (!roles.ok) {
    return (
      <>
        {header}
        <Paper>
          {roles.problem.code === 'forbidden' ? (
            <ForbiddenState />
          ) : (
            <ErrorState problem={roles.problem} />
          )}
        </Paper>
      </>
    );
  }

  const redirectPage = lastPageIfPastEnd(roles.value.page);
  if (redirectPage !== null) {
    redirect(hrefWith(PATH, params, { page: redirectPage === 0 ? null : String(redirectPage) }));
  }

  const total = roles.value.page.totalItems;
  const hasFilters = Boolean(query.q ?? query.status ?? query.type);

  return (
    <>
      {header}
      <ListNavigationProvider>
        <Paper sx={{ overflow: 'hidden', position: 'relative' }}>
          <ListToolbar
            // No datetime field here, so the zone is unused: no `GET /tenant` read for it.
            timeZone="UTC"
            resultLabel={`${total} ${total === 1 ? 'role' : 'roles'}`}
            fields={[
              { kind: 'search', name: 'q', label: 'Search', placeholder: 'Code or name' },
              {
                kind: 'select',
                name: 'status',
                label: 'Status',
                allLabel: 'All statuses',
                options: ROLE_STATUSES.map((status) => ({
                  value: status,
                  label: humanizeEnum(status),
                })),
              },
              {
                kind: 'select',
                name: 'type',
                label: 'Type',
                allLabel: 'All types',
                options: [
                  { value: 'system', label: 'System role' },
                  { value: 'custom', label: 'Custom role' },
                ],
              },
            ]}
          />
          <ListNavigationProgress />
          <ListBusyRegion>
            {roles.value.items.length === 0 ? (
              <EmptyState
                title="No roles"
                description={hasFilters ? 'No roles match these filters.' : 'No roles exist yet.'}
              />
            ) : (
              <RoleDirectoryTable
                roles={roles.value.items}
                sort={query.sort}
                sortHref={(field) =>
                  hrefWith(PATH, params, {
                    sortBy: field,
                    sortDir: query.sort.by === field && query.sort.dir === 'ASC' ? 'DESC' : 'ASC',
                    page: null,
                  })
                }
              />
            )}
            <TablePaginationBar page={roles.value.page} />
          </ListBusyRegion>
        </Paper>
      </ListNavigationProvider>
    </>
  );
}
```

`app/(authenticated)/admin/roles/new/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { PageHeader } from '@/components/shell/page-header';
import { canCreateRole } from '@/modules/administration/roles/role-rules';
import { RoleForm } from '@/modules/administration/roles/components/role-form';

export const metadata: Metadata = { title: 'Create role' };

export default async function NewRolePage() {
  const selected = await getCurrentContextProfile();
  const resolved = selected.kind === 'resolved' ? selected : null;
  const header = (
    <PageHeader
      eyebrow="Administration · Roles & permissions"
      title="Create role"
      description="A new custom role starts active with no permissions. You grant them next."
    />
  );

  if (!canCreateRole({ permissions: resolved?.profile.permissions ?? [] })) {
    return (
      <>
        {header}
        <Paper>
          <ForbiddenState />
        </Paper>
      </>
    );
  }

  return (
    <>
      {header}
      <Paper>
        <RoleForm contextOrganisationId={resolved?.context.organization.id} />
      </Paper>
    </>
  );
}
```

- [ ] **Step 6: Commit the directory and form** (form C)

`git add modules/administration/roles/components/role-directory-table.tsx modules/administration/roles/components/role-directory-table.test.tsx modules/administration/roles/components/role-form.tsx modules/administration/roles/components/role-form.test.tsx 'app/(authenticated)/admin/roles/page.tsx' 'app/(authenticated)/admin/roles/new/page.tsx'`

```
feat(roles): add the role directory and the create role form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

- [ ] **Step 7: Register the navigation entry** (its own commit; spec §8 order)

In `modules/administration/administration-navigation.ts`, add
`import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';` beside the other
icon imports. Then insert this entry **directly after the Branches entry**, before any Settings
entry 13 may have added and before Business date:

```ts
  {
    href: '/admin/roles',
    label: 'Roles & permissions',
    icon: VerifiedUserOutlined,
    requiresAny: ['role.view'],
  },
```

Run (form E): `e2e/shell.spec.ts`. The rail gains an entry. `/admin/roles` renders a "Not found"
`ErrorState` until Task 7's fake routes land, and no spec visits it yet. Expected: PASS.

`git add modules/administration/administration-navigation.ts` (form C):

```
feat(nav): add Roles & permissions to the administration rail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 4: The role record — layout, lifecycle actions, Overview, edit, and Audit

**Files:**

- Create: `components/data-display/focus-record-title.ts` (import-free, client-safe)
- Create: `modules/administration/roles/components/role-lifecycle-actions.tsx` (client),
  `role-lifecycle-actions.test.tsx`
- Create: `app/(authenticated)/admin/roles/[roleId]/layout.tsx`,
  `app/(authenticated)/admin/roles/[roleId]/page.tsx` (Overview),
  `app/(authenticated)/admin/roles/[roleId]/edit/page.tsx`,
  `app/(authenticated)/admin/roles/[roleId]/audit/page.tsx`

**Interfaces:**

- Consumes:
  - Tasks 1–3: `getRole`, `countRolePermissions`, `countActiveRoleAssignments`,
    `roleStatusAction`, `canEditRole`, `roleTypeLabel`, `SYSTEM_ROLE_NOTE`,
    `type RoleLifecycleAction`, `activateRole`, `deactivateRole`, `RoleForm`;
  - 07b: `RecordHero`, `RecordTabs`, `RecordAuditTab` with `type RecordAuditView`,
    `ConfirmDialog`, `CopyIdButton`, `ForbiddenState`;
  - 07: `SectionCard`; 06: `DescriptionList`, `type DescriptionItem`, `StatusChip`, `ErrorState`,
    `load`, `getOrganisationTimeZone`, `formatInstant`, `UUID_PATTERN`;
  - `useToast()` (`components/providers/toast-provider.tsx`), `NextLink`, `PageHeader`,
    `getCurrentContextProfile`, `can`.
- Produces:
  - `focusRecordTitle(): void` (`components/data-display/focus-record-title.ts`), used by Tasks 4–6.
    It is a candidate for 08 to adopt at a boundary (Ruling 15).
  - `RoleLifecycleActions({ roleId, roleName, editHref?, action: RoleLifecycleAction | null, heldByMe: boolean, contextOrganisationId? })`;
  - routes `/admin/roles/[roleId]` (Overview), `/edit` and `/audit`, plus the layout that later
    tabs (Tasks 5–6) render under.

- [ ] **Step 1: Write the failing test**

`modules/administration/roles/components/role-lifecycle-actions.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { RoleLifecycleActions } from './role-lifecycle-actions';

const { activateRole, deactivateRole } = vi.hoisted(() => ({
  activateRole: vi.fn(),
  deactivateRole: vi.fn(),
}));
vi.mock('../role-actions', () => ({
  activateRole: (...args: unknown[]) => activateRole(...args) as unknown,
  deactivateRole: (...args: unknown[]) => deactivateRole(...args) as unknown,
}));

const ROLE = '09000000-0000-4000-8000-000000000007';
const ORG = '11111111-1111-4111-8111-111111111111';

describe('RoleLifecycleActions', () => {
  it(
    'warns a holder before deactivating, sends the role and organisation (I2), ' +
      'then focuses Activate (I3)',
    async () => {
      const user = userEvent.setup();
      deactivateRole.mockResolvedValueOnce({ ok: true });
      const actions = (action: 'activate' | 'deactivate') => (
        <main>
          <h1>Teller</h1>
          <RoleLifecycleActions
            roleId={ROLE}
            roleName="Teller"
            editHref={`/admin/roles/${ROLE}/edit`}
            action={action}
            heldByMe
            contextOrganisationId={ORG}
          />
        </main>
      );
      const { rerender } = renderWithProviders(actions('deactivate'));

      expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
        'href',
        `/admin/roles/${ROLE}/edit`,
      );
      await user.click(screen.getByRole('button', { name: 'Deactivate' }));
      const dialog = screen.getByRole('alertdialog', { name: 'Deactivate Teller?' });
      expect(dialog).toHaveTextContent('You hold this role yourself');
      await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));

      await waitFor(() => {
        expect(deactivateRole).toHaveBeenCalledTimes(1);
      });
      const formData = deactivateRole.mock.calls[0]?.[1] as FormData;
      expect(formData.get('roleId')).toBe(ROLE);
      expect(formData.get('contextOrganisationId')).toBe(ORG);
      expect(await screen.findByRole('alert')).toHaveTextContent('Role deactivated');

      // The server swaps the toggle after `refresh()`; simulate that next render.
      rerender(actions('activate'));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Activate' })).toHaveFocus();
      });
    },
  );

  it('falls back to the record title when no toggle remains (I3)', async () => {
    const user = userEvent.setup();
    activateRole.mockResolvedValueOnce({ ok: true });
    const actions = (action: 'activate' | null) => (
      <main>
        <h1>Loans officer</h1>
        <RoleLifecycleActions
          roleId={ROLE}
          roleName="Loans officer"
          editHref="/admin/roles/x/edit"
          action={action}
          heldByMe={false}
        />
      </main>
    );
    const { rerender } = renderWithProviders(actions('activate'));

    await user.click(screen.getByRole('button', { name: 'Activate' }));
    const dialog = screen.getByRole('dialog', { name: 'Activate Loans officer?' });
    expect(dialog).not.toHaveTextContent('You hold this role');
    await user.click(within(dialog).getByRole('button', { name: 'Activate' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Role activated');

    // A user without role.deactivate: the refreshed hero offers no toggle, only Edit.
    rerender(actions(null));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Loans officer' })).toHaveFocus();
    });
  });
});
```

Run (form T): `modules/administration/roles/components/role-lifecycle-actions.test.tsx`. Expected:
FAIL (no component).

- [ ] **Step 2: Write the focus helper and the lifecycle actions**

`components/data-display/focus-record-title.ts`:

```ts
/**
 * I3's last-resort focus target (07's business-date actions, 08's PF6): the record page's `h1`,
 * for when an action leaves no trigger to return focus to. `RecordHero` (frozen kit) exposes no
 * ref, so this finds the heading by DOM query and makes it focusable. Client-only.
 * ponytail: DOM-query ceiling — a RecordHero focus-target prop (refactor(kit)) replaces it if
 * the query ever finds the wrong heading.
 */
export function focusRecordTitle(): void {
  const heading = document.querySelector<HTMLElement>('main h1');
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus();
}
```

`modules/administration/roles/components/role-lifecycle-actions.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import EditOutlined from '@mui/icons-material/EditOutlined';
import { ConfirmDialog } from '@/components/data-display/confirm-dialog';
import { focusRecordTitle } from '@/components/data-display/focus-record-title';
import NextLink from '@/components/navigation/next-link';
import { useToast } from '@/components/providers/toast-provider';
import { activateRole, deactivateRole } from '../role-actions';
import type { RoleLifecycleAction } from '../role-rules';

interface RoleLifecycleActionsProps {
  roleId: string;
  roleName: string;
  /** The edit page, when the user may edit this custom role. */
  editHref?: string;
  /** `roleStatusAction`'s result: the one status toggle on offer, if any. */
  action: RoleLifecycleAction | null;
  /** The signed-in user holds this role (`/auth/me` roles), so deactivating it affects them. */
  heldByMe: boolean;
  /** I2: the organisation the page rendered for; forwarded to `ConfirmDialog` as a hidden field. */
  contextOrganisationId?: string;
}

/** Record hero actions (spec §10.4): Edit, plus Activate or Deactivate, custom roles only. */
export function RoleLifecycleActions({
  roleId,
  roleName,
  editHref,
  action,
  heldByMe,
  contextOrganisationId,
}: RoleLifecycleActionsProps) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // I3: a successful toggle swaps the action after `refresh()`. The toggle keeps its DOM node when
  // its replacement is on offer (Deactivate ↔ Activate); otherwise focus falls back to the title.
  // `succeededRef` is set only by a real success, so an unrelated re-render never moves focus.
  const succeededRef = useRef(false);
  useEffect(() => {
    if (!succeededRef.current) return;
    succeededRef.current = false;
    if (toggleRef.current?.isConnected) toggleRef.current.focus();
    else focusRecordTitle();
  }, [action]);
  // When the success leaves nothing to render, the layout unmounts this component, so the same
  // fallback runs from an unmount cleanup. Aliasing the ref object lets the cleanup read the live
  // value (react-hooks/exhaustive-deps' documented fix, as in 08's BranchLifecycleActions).
  useEffect(() => {
    const successRef = succeededRef;
    return () => {
      if (successRef.current) focusRecordTitle();
    };
  }, []);

  const deactivate = action === 'deactivate';
  const label = deactivate ? 'Deactivate' : 'Activate';

  return (
    <>
      {editHref && (
        <Button
          component={NextLink}
          href={editHref}
          variant="outlined"
          startIcon={<EditOutlined />}
        >
          Edit
        </Button>
      )}
      {action && (
        <>
          <Button
            ref={toggleRef}
            variant={deactivate ? 'outlined' : 'contained'}
            color={deactivate ? 'error' : 'primary'}
            onClick={() => {
              setOpen(true);
            }}
          >
            {label}
          </Button>
          <ConfirmDialog
            open={open}
            tone={deactivate ? 'error' : 'primary'}
            title={`${label} ${roleName}?`}
            description={
              deactivate
                ? `Everyone holding this role loses its permissions until it is activated again. Their assignments stay.${
                    heldByMe ? ' You hold this role yourself, so you lose them too.' : ''
                  }`
                : 'Everyone assigned this role gets its permissions again.'
            }
            confirmLabel={label}
            action={deactivate ? deactivateRole : activateRole}
            contextOrganisationId={contextOrganisationId}
            onClose={() => {
              setOpen(false);
            }}
            onSuccess={() => {
              succeededRef.current = true;
              setOpen(false);
              notify(deactivate ? 'Role deactivated' : 'Role activated');
            }}
          >
            <input type="hidden" name="roleId" value={roleId} />
          </ConfirmDialog>
        </>
      )}
    </>
  );
}
```

Run (form T): `modules/administration/roles/components/role-lifecycle-actions.test.tsx`. Expected:
PASS.

- [ ] **Step 3: Write the record layout and its pages**

`app/(authenticated)/admin/roles/[roleId]/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Paper from '@mui/material/Paper';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can } from '@/auth/permissions';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { RecordHero } from '@/components/data-display/record-hero';
import { RecordTabs } from '@/components/data-display/record-tabs';
import { StatusChip } from '@/components/data-display/status-chip';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { UUID_PATTERN } from '@/lib/api/wire';
import {
  canEditRole,
  roleStatusAction,
  roleTypeLabel,
} from '@/modules/administration/roles/role-rules';
import { getRole } from '@/modules/administration/roles/role-service';
import { RoleLifecycleActions } from '@/modules/administration/roles/components/role-lifecycle-actions';

export const metadata: Metadata = { title: 'Role record' };

interface RoleRecordLayoutProps {
  children: ReactNode;
  params: Promise<{ roleId: string }>;
}

/** Record shell (spec §9): the hero role is read once here; each tab fetches its own data. Roles
 * are never branch-restricted (contract §E.4), so there is no guided state. */
export default async function RoleRecordLayout({ children, params }: RoleRecordLayoutProps) {
  const { roleId } = await params;
  if (!UUID_PATTERN.test(roleId)) notFound();

  const [role, selected] = await Promise.all([load(getRole(roleId)), getCurrentContextProfile()]);
  const resolved = selected.kind === 'resolved' ? selected : null;

  if (!role.ok) {
    if (role.problem.code === 'resource_not_found') notFound();
    return (
      <>
        <PageHeader eyebrow="Administration · Role record" title="Role record" />
        <Paper>
          {/* Review Focus 3: a user who revoked their own role.view lands here, never on an
              error page. */}
          {role.problem.code === 'forbidden' ? (
            <ForbiddenState />
          ) : (
            <ErrorState problem={role.problem} />
          )}
        </Paper>
      </>
    );
  }

  const record = role.value;
  const holder = { permissions: resolved?.profile.permissions ?? [] };
  const action = roleStatusAction(record, holder);
  const editable = canEditRole(record, holder);
  const base = `/admin/roles/${roleId}`;

  return (
    <>
      <RecordHero
        back={{ href: '/admin/roles', label: 'Back to roles' }}
        avatar={{ kind: 'icon', icon: <VerifiedUserOutlined /> }}
        eyebrow="Administration · Role record"
        title={record.roleName}
        subtitle={`${record.roleCode} · ${roleTypeLabel(record.systemRole)}`}
        status={<StatusChip value={record.status} />}
        actions={
          // Undefined, not an empty component: RecordHero (frozen kit) renders its actions box
          // whenever this is truthy, which would leave an empty band at 375 px (08's layout).
          editable || action ? (
            <RoleLifecycleActions
              roleId={roleId}
              roleName={record.roleName}
              editHref={editable ? `${base}/edit` : undefined}
              action={action}
              heldByMe={resolved?.profile.roles.some((held) => held.id === roleId) ?? false}
              contextOrganisationId={resolved?.context.organization.id}
            />
          ) : undefined
        }
      />
      <RecordTabs
        label={`${record.roleName} sections`}
        tabs={[
          { href: base, label: 'Overview' },
          { href: `${base}/permissions`, label: 'Permissions' },
          ...(can(holder, 'role_assignment.view')
            ? [{ href: `${base}/assignments`, label: 'Assignments' }]
            : []),
          ...(can(holder, 'audit.view') ? [{ href: `${base}/audit`, label: 'Audit' }] : []),
        ]}
      />
      {children}
    </>
  );
}
```

`app/(authenticated)/admin/roles/[roleId]/page.tsx` (Overview):

```tsx
import { getCurrentContextProfile } from '@/auth/context-service';
import { can } from '@/auth/permissions';
import { CopyIdButton } from '@/components/data-display/copy-id-button';
import { DescriptionList, type DescriptionItem } from '@/components/data-display/description-list';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import { load } from '@/lib/api/load';
import { getOrganisationTimeZone } from '@/lib/api/lookups';
import { formatInstant } from '@/lib/format';
import { SYSTEM_ROLE_NOTE, roleTypeLabel } from '@/modules/administration/roles/role-rules';
import {
  countActiveRoleAssignments,
  countRolePermissions,
  getRole,
} from '@/modules/administration/roles/role-service';

interface RoleOverviewPageProps {
  params: Promise<{ roleId: string }>;
}

export default async function RoleOverviewPage({ params }: RoleOverviewPageProps) {
  const { roleId } = await params;
  const [role, selected, timeZone] = await Promise.all([
    load(getRole(roleId)), // cached: the layout's read
    getCurrentContextProfile(),
    getOrganisationTimeZone(),
  ]);
  if (!role.ok) return null; // the layout renders the failure

  const record = role.value;
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };
  const [permissions, assignments] = await Promise.all([
    countRolePermissions(roleId),
    can(holder, 'role_assignment.view')
      ? countActiveRoleAssignments(roleId)
      : Promise.resolve(null),
  ]);
  const at = (iso: string) => {
    const when = formatInstant(iso, timeZone);
    return `${when.date} · ${when.time}`;
  };

  const items: DescriptionItem[] = [
    { label: 'Role name', value: record.roleName },
    { label: 'Role code', value: record.roleCode },
    { label: 'Description', value: record.description ?? '—' },
    { label: 'Type', value: roleTypeLabel(record.systemRole) },
    { label: 'Status', value: <StatusChip value={record.status} /> },
    ...(permissions === null ? [] : [{ label: 'Permissions', value: String(permissions) }]),
    // Assignments, not distinct users: one user can hold the role at several scopes (Ruling 11).
    ...(assignments === null ? [] : [{ label: 'Active assignments', value: String(assignments) }]),
    { label: `Created (${timeZone})`, value: at(record.createdAt) },
    { label: `Updated (${timeZone})`, value: at(record.updatedAt) },
    { label: 'Role ID', value: <CopyIdButton value={record.id} label="Role ID" /> },
  ];

  return (
    <SectionCard
      title="Role definition"
      description={record.systemRole ? SYSTEM_ROLE_NOTE : undefined}
    >
      <DescriptionList items={items} />
    </SectionCard>
  );
}
```

`app/(authenticated)/admin/roles/[roleId]/edit/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { getCurrentContextProfile } from '@/auth/context-service';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { SectionCard } from '@/components/data-display/section-card';
import { load } from '@/lib/api/load';
import { SYSTEM_ROLE_NOTE, canEditRole } from '@/modules/administration/roles/role-rules';
import { getRole } from '@/modules/administration/roles/role-service';
import { RoleForm } from '@/modules/administration/roles/components/role-form';

export const metadata: Metadata = { title: 'Edit role' };

interface EditRolePageProps {
  params: Promise<{ roleId: string }>;
}

/** Edit as a page, not a dialog (Ruling 8): the layout's hero stays above it. */
export default async function EditRolePage({ params }: EditRolePageProps) {
  const { roleId } = await params;
  const [role, selected] = await Promise.all([load(getRole(roleId)), getCurrentContextProfile()]);
  if (!role.ok) return null; // the layout renders the failure

  const record = role.value;
  const resolved = selected.kind === 'resolved' ? selected : null;
  if (!canEditRole(record, { permissions: resolved?.profile.permissions ?? [] })) {
    return (
      <SectionCard title="Edit role">
        <ForbiddenState description={record.systemRole ? SYSTEM_ROLE_NOTE : undefined} />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Edit role" description="Change the name or replace the description.">
      <RoleForm
        role={{
          id: record.id,
          roleCode: record.roleCode,
          roleName: record.roleName,
          description: record.description,
        }}
        contextOrganisationId={resolved?.context.organization.id}
      />
    </SectionCard>
  );
}
```

`app/(authenticated)/admin/roles/[roleId]/audit/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { toSearchParams } from '@/lib/api/query-string';
import { RecordAuditTab } from '@/modules/administration/audit/components/record-audit-tab';

export const metadata: Metadata = { title: 'Role audit trail' };

interface RoleAuditPageProps {
  params: Promise<{ roleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** One view (Ruling 13): role assignments are audited per assignment id, which the audit API
 * can't filter by role (contract §G, BG-16). */
export default async function RoleAuditPage({ params, searchParams }: RoleAuditPageProps) {
  const { roleId } = await params;
  return (
    <RecordAuditTab
      views={[
        { value: 'role', label: 'Role record', filter: { entityType: 'ROLE', entityId: roleId } },
      ]}
      params={toSearchParams(await searchParams)}
      path={`/admin/roles/${roleId}/audit`}
      description="Changes to this role's definition, status, and permissions. Assignment changes are recorded on each assignment, not here."
    />
  );
}
```

Run (form T): `modules/administration/roles components/data-display`. Expected: PASS. The pages
have no unit tests (coverage excludes `app/**/page.tsx` and `layout.tsx`). Task 8's E2E covers
them.

- [ ] **Step 4: Commit** (form C)

`git add components/data-display/focus-record-title.ts modules/administration/roles/components/role-lifecycle-actions.tsx modules/administration/roles/components/role-lifecycle-actions.test.tsx 'app/(authenticated)/admin/roles/[roleId]/layout.tsx' 'app/(authenticated)/admin/roles/[roleId]/page.tsx' 'app/(authenticated)/admin/roles/[roleId]/edit/page.tsx' 'app/(authenticated)/admin/roles/[roleId]/audit/page.tsx'`

```
feat(roles): add the role record with hero lifecycle, Overview, edit, and Audit

focusRecordTitle moves to components/data-display/ as an import-free helper for every record
page; 08 keeps its own copy until a boundary switches it over.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 5: The Permissions tab — grants, the grant drawer, and confirmed removal

**Files:**

- Create: `modules/administration/roles/components/role-permission-actions.tsx` (client):
  `GrantPermissionsButton`, `PermissionChecklist`, `RemovePermissionButton`
- Create: `modules/administration/roles/components/role-permission-actions.test.tsx`
- Create: `modules/administration/roles/components/role-permissions-table.tsx` (server)
- Create: `app/(authenticated)/admin/roles/[roleId]/permissions/page.tsx`

**Interfaces:**

- Consumes:
  - Tasks 1–4: `getRole`, `listRolePermissions`, `listGrantedCodes`, `getPermissionCatalogue`,
    `canGrantPermissions`, `canRemovePermissions`, `groupByModule`, `moduleLabel`,
    `MAX_GRANTS_PER_SUBMIT`, `PERMISSION_RISK_LEVELS`, `type Permission`,
    `type PermissionRiskLevel`, `grantPermissions`, `removePermission`, `focusRecordTitle`;
  - 08: `AssignmentDrawer({ open, title, description?, submitLabel, action, onClose, onSuccess, children: (fieldErrors) => ReactNode, contextOrganisationId? })`;
  - 07b: `ConfirmDialog` (`tone="error"` gives role `alertdialog`); 07: `SectionCard`;
  - 06: `TablePaginationBar`, `EmptyState`, `ErrorState`, `ForbiddenState`, `StatusChip`,
    `humanizeEnum`, `TruncatedText`, `load`, `parsePaging`, `lastPageIfPastEnd`, `hrefWith`,
    `toSearchParams`, `getOrganisationTimeZone`, `formatInstant`; `useToast()`.
- Produces:
  - `GrantPermissionsButton({ roleId, roleName, available: readonly Permission[], truncated: boolean, contextOrganisationId? })`;
  - `PermissionChecklist({ permissions, truncated, error? })`, which renders the hidden
    `permissionCodes` field;
  - `RemovePermissionButton({ roleId, grantId, label, critical, contextOrganisationId? })`;
  - `RolePermissionsTable({ rows: readonly RolePermissionRow[], roleId, canRemove, timeZone, contextOrganisationId? })`
    and `interface RolePermissionRow`;
  - the route `/admin/roles/[roleId]/permissions`.

- [ ] **Step 1: Write the failing test**

`modules/administration/roles/components/role-permission-actions.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { Permission } from '../role-contract';
import { MAX_GRANTS_PER_SUBMIT } from '../role-rules';
import {
  GrantPermissionsButton,
  PermissionChecklist,
  RemovePermissionButton,
} from './role-permission-actions';

const { grantPermissions, removePermission } = vi.hoisted(() => ({
  grantPermissions: vi.fn(),
  removePermission: vi.fn(),
}));
vi.mock('../role-actions', () => ({
  grantPermissions: (...args: unknown[]) => grantPermissions(...args) as unknown,
  removePermission: (...args: unknown[]) => removePermission(...args) as unknown,
}));

const ROLE = '09000000-0000-4000-8000-000000000008';
const GRANT = '09000000-0000-4000-8000-0000000000f1';
const ORG = '11111111-1111-4111-8111-111111111111';
const permission = (
  code: string,
  name: string,
  module: string,
  risk: Permission['risk'],
): Permission => ({ id: code, code, name, module, risk, status: 'ACTIVE' });
const CATALOGUE = [
  permission('business_date.view', 'View business date', 'settings', 'LOW'),
  permission('business_date.advance', 'Advance business date', 'settings', 'CRITICAL'),
  permission('cob.start', 'Start close of business', 'settings', 'HIGH'),
  permission('role.view', 'View roles', 'iam', 'LOW'),
];
const codesField = () => document.querySelector<HTMLInputElement>('input[name="permissionCodes"]');
const keyField = () => document.querySelector<HTMLInputElement>('input[name="idempotencyKey"]');

describe('PermissionChecklist', () => {
  it('groups by module, filters by search and risk, and carries the joined codes', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <form>
        <PermissionChecklist permissions={CATALOGUE} truncated={false} />
      </form>,
    );

    expect(screen.getByRole('group', { name: 'IAM' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Settings' })).toBeInTheDocument();

    const search = screen.getByRole('searchbox', { name: 'Search permissions' });
    await user.type(search, 'business date');
    expect(screen.queryByRole('checkbox', { name: /^View roles/ })).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: /^Advance business date/ }));
    await user.clear(search);
    await user.click(screen.getByRole('checkbox', { name: /^View roles/ }));
    expect(codesField()?.value).toBe('business_date.advance,role.view');
    expect(screen.getByRole('status')).toHaveTextContent('2 selected');

    await user.click(screen.getByRole('combobox', { name: 'Risk' }));
    await user.click(screen.getByRole('option', { name: 'High' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: /^Start close of business/ })).not.toBeChecked();
    // Filtered-out rows keep their selection.
    expect(codesField()?.value).toBe('business_date.advance,role.view');
  });

  it('caps the selection at 25 and says when the catalogue was truncated', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: MAX_GRANTS_PER_SUBMIT + 1 }, (_, index) => {
      const n = String(index).padStart(2, '0');
      return permission(`code.n${n}`, `Permission ${n}`, 'iam', 'LOW');
    });
    renderWithProviders(
      <form>
        <PermissionChecklist permissions={many} truncated />
      </form>,
    );

    for (const entry of many.slice(0, MAX_GRANTS_PER_SUBMIT)) {
      await user.click(screen.getByRole('checkbox', { name: new RegExp(`^${entry.name}`) }));
    }
    expect(screen.getByRole('checkbox', { name: /^Permission 25/ })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('25 selected — up to 25 at a time');
    expect(screen.getByText('Only the first 100 catalogue permissions are listed.')).toBeVisible();
  });
});

describe('GrantPermissionsButton', () => {
  it('submits the role, the checked codes and the rendered organisation (I2)', async () => {
    const user = userEvent.setup();
    grantPermissions.mockResolvedValueOnce({ ok: true });
    renderWithProviders(
      <GrantPermissionsButton
        roleId={ROLE}
        roleName="Operations supervisor"
        available={CATALOGUE}
        truncated={false}
        contextOrganisationId={ORG}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Grant permissions' }));
    const drawer = screen.getByRole('dialog', { name: 'Grant permissions' });
    await user.click(within(drawer).getByRole('checkbox', { name: /^Start close of business/ }));
    await user.click(within(drawer).getByRole('button', { name: 'Grant permissions' }));

    await waitFor(() => {
      expect(grantPermissions).toHaveBeenCalledTimes(1);
    });
    const formData = grantPermissions.mock.calls[0]?.[1] as FormData;
    expect(formData.get('roleId')).toBe(ROLE);
    expect(formData.get('permissionCodes')).toBe('cob.start');
    expect(formData.get('contextOrganisationId')).toBe(ORG);
    expect(await screen.findByRole('alert')).toHaveTextContent('Permissions granted');
  });

  it('clears the search on Escape without closing the drawer or dropping the selection', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <GrantPermissionsButton
        roleId={ROLE}
        roleName="Operations supervisor"
        available={CATALOGUE}
        truncated={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Grant permissions' }));
    const drawer = screen.getByRole('dialog', { name: 'Grant permissions' });
    await user.click(within(drawer).getByRole('checkbox', { name: /^View roles/ }));
    const search = within(drawer).getByRole('searchbox', { name: 'Search permissions' });
    await user.type(search, 'cob');
    await user.keyboard('{Escape}');

    expect(search).toHaveValue('');
    expect(screen.getByRole('dialog', { name: 'Grant permissions' })).toBeInTheDocument();
    expect(codesField()?.value).toBe('role.view');
  });

  it('keeps the selection and the key after a partial failure, so the retry replays (Ruling 5)', async () => {
    const user = userEvent.setup();
    grantPermissions
      .mockResolvedValueOnce({
        ok: false,
        formError: '1 of 2 permissions were granted before this failed. Retrying is safe.',
        fieldErrors: {},
        code: 'internal_error',
        requestId: 'req-9',
      })
      .mockResolvedValueOnce({ ok: true });
    renderWithProviders(
      <GrantPermissionsButton
        roleId={ROLE}
        roleName="Operations supervisor"
        available={CATALOGUE}
        truncated={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Grant permissions' }));
    const drawer = screen.getByRole('dialog', { name: 'Grant permissions' });
    await user.click(within(drawer).getByRole('checkbox', { name: /^Start close of business/ }));
    await user.click(within(drawer).getByRole('checkbox', { name: /^View roles/ }));
    const key = keyField()?.value;
    await user.click(within(drawer).getByRole('button', { name: 'Grant permissions' }));

    expect(await within(drawer).findByRole('alert')).toHaveTextContent('1 of 2 permissions');
    expect(within(drawer).getByRole('checkbox', { name: /^View roles/ })).toBeChecked();
    await user.click(within(drawer).getByRole('button', { name: 'Grant permissions' }));
    await waitFor(() => {
      expect(grantPermissions).toHaveBeenCalledTimes(2);
    });
    const retry = grantPermissions.mock.calls[1]?.[1] as FormData;
    expect(retry.get('permissionCodes')).toBe('cob.start,role.view');
    expect(retry.get('idempotencyKey')).toBe(key);
  });
});

describe('RemovePermissionButton', () => {
  it('confirms a critical removal as an alert dialog, sends the ids, then focuses the title (I3)', async () => {
    const user = userEvent.setup();
    removePermission.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderWithProviders(
      <main>
        <h1>Operations supervisor</h1>
        <RemovePermissionButton
          roleId={ROLE}
          grantId={GRANT}
          label="Advance business date"
          critical
          contextOrganisationId={ORG}
        />
      </main>,
    );

    await user.click(screen.getByRole('button', { name: 'Remove Advance business date' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Remove Advance business date?' });
    expect(dialog).toHaveTextContent('is a critical permission');
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(removePermission).toHaveBeenCalledTimes(1);
    });
    const formData = removePermission.mock.calls[0]?.[1] as FormData;
    expect([
      formData.get('roleId'),
      formData.get('grantId'),
      formData.get('contextOrganisationId'),
    ]).toEqual([ROLE, GRANT, ORG]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission removed');

    // The refreshed table no longer has this row, so the button unmounts.
    rerender(
      <main>
        <h1>Operations supervisor</h1>
      </main>,
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Operations supervisor' })).toHaveFocus();
    });
  });

  it('confirms a non-critical removal as a plain dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <RemovePermissionButton
        roleId={ROLE}
        grantId={GRANT}
        label="View business date"
        critical={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Remove View business date' }));
    expect(
      screen.getByRole('dialog', { name: 'Remove View business date?' }),
    ).not.toHaveTextContent('critical');
  });
});
```

Run (form T): `modules/administration/roles/components/role-permission-actions.test.tsx`.
Expected: FAIL (no module).

- [ ] **Step 2: Write the permission actions**

`modules/administration/roles/components/role-permission-actions.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddModeratorOutlined from '@mui/icons-material/AddModeratorOutlined';
import { AssignmentDrawer } from '@/components/data-display/assignment-drawer';
import { ConfirmDialog } from '@/components/data-display/confirm-dialog';
import { focusRecordTitle } from '@/components/data-display/focus-record-title';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { useToast } from '@/components/providers/toast-provider';
import { grantPermissions, removePermission } from '../role-actions';
import {
  PERMISSION_RISK_LEVELS,
  type Permission,
  type PermissionRiskLevel,
} from '../role-contract';
import { MAX_GRANTS_PER_SUBMIT, groupByModule } from '../role-rules';

const riskColor = (risk: PermissionRiskLevel) =>
  risk === 'CRITICAL' || risk === 'HIGH' ? 'error' : 'text.secondary';

interface PermissionChecklistProps {
  /** Grantable entries: the ACTIVE catalogue codes the role doesn't hold yet. */
  permissions: readonly Permission[];
  /** The catalogue read stopped at its ceiling (Ruling 6). */
  truncated: boolean;
  error?: string;
}

/**
 * The grant drawer's body (spec §10.4): search and a risk filter over the catalogue, grouped by
 * module, with one hidden comma-joined `permissionCodes` field (Ruling 5). The option list is
 * captured once per opening, so a partial-failure `refresh()` never drops a checked row before
 * the retry (Ruling 6).
 */
export function PermissionChecklist({ permissions, truncated, error }: PermissionChecklistProps) {
  const [options] = useState(permissions);
  const [search, setSearch] = useState('');
  const [risk, setRisk] = useState<PermissionRiskLevel | ''>('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const needle = search.trim().toLowerCase();
  const groups = groupByModule(
    options.filter(
      (permission) =>
        (risk === '' || permission.risk === risk) &&
        (needle === '' ||
          permission.code.includes(needle) ||
          permission.name.toLowerCase().includes(needle)),
    ),
  );
  const full = selected.size >= MAX_GRANTS_PER_SUBMIT;
  const toggle = (code: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(code)) next.add(code);
      return next;
    });
  };

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <input type="hidden" name="permissionCodes" value={[...selected].join(',')} />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        <TextField
          type="search"
          label="Search permissions"
          value={search}
          sx={{ flex: '1 1 200px' }}
          slotProps={{ htmlInput: { maxLength: 100 } }}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          onKeyDown={(event) => {
            // The list filters as you type, so Enter must never submit the drawer. Escape in a
            // non-empty box only clears it: the drawer, and its selection, stay open.
            if (event.key === 'Enter') event.preventDefault();
            if (event.key === 'Escape' && search !== '') {
              event.stopPropagation();
              setSearch('');
            }
          }}
        />
        <TextField
          select
          label="Risk"
          value={risk}
          sx={{ minWidth: 150 }}
          slotProps={{ select: { displayEmpty: true } }}
          onChange={(event) => {
            setRisk(PERMISSION_RISK_LEVELS.find((level) => level === event.target.value) ?? '');
          }}
        >
          <MenuItem value="">All risks</MenuItem>
          {PERMISSION_RISK_LEVELS.map((level) => (
            <MenuItem key={level} value={level}>
              {humanizeEnum(level)}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Typography variant="caption" color="text.secondary" role="status">
        {selected.size} selected
        {full ? ` — up to ${MAX_GRANTS_PER_SUBMIT} at a time` : ''}
      </Typography>
      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}
      {truncated && (
        <Alert severity="info">Only the first 100 catalogue permissions are listed.</Alert>
      )}
      {groups.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {options.length === 0
            ? 'Every catalogue permission is already granted.'
            : 'No permissions match these filters.'}
        </Typography>
      ) : (
        groups.map((group) => (
          <FormControl key={group.module} component="fieldset" variant="standard">
            <FormLabel component="legend">{group.label}</FormLabel>
            <FormGroup>
              {group.permissions.map((permission) => {
                const checked = selected.has(permission.code);
                return (
                  <FormControlLabel
                    key={permission.code}
                    control={
                      <Checkbox
                        checked={checked}
                        disabled={!checked && full}
                        onChange={() => {
                          toggle(permission.code);
                        }}
                      />
                    }
                    label={
                      // The spaces keep the accessible name readable: "View roles role.view Low".
                      <Box
                        component="span"
                        sx={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'baseline',
                          columnGap: 1.5,
                        }}
                      >
                        <span>{permission.name}</span>{' '}
                        <Typography
                          component="span"
                          variant="caption"
                          sx={{ fontFamily: 'monospace' }}
                        >
                          {permission.code}
                        </Typography>{' '}
                        <Typography
                          component="span"
                          variant="caption"
                          color={riskColor(permission.risk)}
                        >
                          {humanizeEnum(permission.risk)}
                        </Typography>
                      </Box>
                    }
                  />
                );
              })}
            </FormGroup>
          </FormControl>
        ))
      )}
    </Box>
  );
}

interface GrantPermissionsButtonProps {
  roleId: string;
  roleName: string;
  /** ACTIVE catalogue codes the role doesn't hold (Ruling 6). */
  available: readonly Permission[];
  truncated: boolean;
  /** I2: forwarded to the drawer as a hidden field. */
  contextOrganisationId?: string;
}

export function GrantPermissionsButton({
  roleId,
  roleName,
  available,
  truncated,
  contextOrganisationId,
}: GrantPermissionsButtonProps) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="contained"
        startIcon={<AddModeratorOutlined />}
        onClick={() => {
          setOpen(true);
        }}
      >
        Grant permissions
      </Button>
      <AssignmentDrawer
        open={open}
        title="Grant permissions"
        description={`Permissions granted to ${roleName} take effect immediately for everyone holding it.`}
        submitLabel="Grant permissions"
        action={grantPermissions}
        contextOrganisationId={contextOrganisationId}
        onClose={() => {
          setOpen(false);
        }}
        onSuccess={() => {
          setOpen(false);
          notify('Permissions granted');
        }}
      >
        {(fieldErrors) => (
          <>
            <input type="hidden" name="roleId" value={roleId} />
            <PermissionChecklist
              permissions={available}
              truncated={truncated}
              error={fieldErrors.permissionCodes}
            />
          </>
        )}
      </AssignmentDrawer>
    </>
  );
}

interface RemovePermissionButtonProps {
  roleId: string;
  grantId: string;
  /** The catalogue name, or the code when the catalogue isn't readable. */
  label: string;
  /** CRITICAL, or unknown (treated as critical, Ruling 7). */
  critical: boolean;
  /** I2: forwarded to `ConfirmDialog` as a hidden field. */
  contextOrganisationId?: string;
}

export function RemovePermissionButton({
  roleId,
  grantId,
  label,
  critical,
  contextOrganisationId,
}: RemovePermissionButtonProps) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  // I3: a successful removal drops this row — and this button — so focus falls back to the
  // record title from the unmount cleanup (08's RevokeAssignmentButton pattern).
  const succeededRef = useRef(false);
  useEffect(() => {
    const successRef = succeededRef;
    return () => {
      if (successRef.current) focusRecordTitle();
    };
  }, []);

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        color="error"
        aria-label={`Remove ${label}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        Remove
      </Button>
      <ConfirmDialog
        open={open}
        tone={critical ? 'error' : 'primary'}
        title={`Remove ${label}?`}
        description={
          critical
            ? `${label} is a critical permission. Everyone holding this role loses it immediately.`
            : `Everyone holding this role loses ${label} immediately.`
        }
        confirmLabel="Remove"
        action={removePermission}
        contextOrganisationId={contextOrganisationId}
        onClose={() => {
          setOpen(false);
        }}
        onSuccess={() => {
          succeededRef.current = true;
          setOpen(false);
          notify('Permission removed');
        }}
      >
        <input type="hidden" name="roleId" value={roleId} />
        <input type="hidden" name="grantId" value={grantId} />
      </ConfirmDialog>
    </>
  );
}
```

Run (form T): `modules/administration/roles/components/role-permission-actions.test.tsx`.
Expected: PASS.

- [ ] **Step 3: Write the table and the tab**

`modules/administration/roles/components/role-permissions-table.tsx`:

```tsx
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { StatusChip } from '@/components/data-display/status-chip';
import { TruncatedText } from '@/components/data-display/truncated-text';
import type { PermissionRiskLevel } from '../role-contract';
import { moduleLabel } from '../role-rules';
import { RemovePermissionButton } from './role-permission-actions';

export interface RolePermissionRow {
  grantId: string;
  code: string;
  /** null when the catalogue isn't readable (no `permission.view`) or lacks the code. */
  name: string | null;
  module: string | null;
  risk: PermissionRiskLevel | null;
  /** Already formatted in the organisation's timezone. */
  grantedAt: string;
}

interface RolePermissionsTableProps {
  rows: readonly RolePermissionRow[];
  roleId: string;
  canRemove: boolean;
  timeZone: string;
  /** I2: forwarded to each row's removal confirmation. */
  contextOrganisationId?: string;
}

export function RolePermissionsTable({
  rows,
  roleId,
  canRemove,
  timeZone,
  contextOrganisationId,
}: RolePermissionsTableProps) {
  return (
    // Keyboard-scrollable at 375 px even when no row holds a button (07's history-table rule).
    <TableContainer tabIndex={0} role="region" aria-label="Granted permissions">
      <Table aria-label="Granted permissions" sx={{ minWidth: 680 }}>
        <TableHead>
          <TableRow>
            <TableCell>Permission</TableCell>
            <TableCell>Module</TableCell>
            <TableCell>Risk</TableCell>
            <TableCell>Granted ({timeZone})</TableCell>
            {canRemove && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.grantId}>
              <TableCell>
                <TruncatedText value={row.name ?? row.code} maxWidth={300} />
                {row.name && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontFamily: 'monospace' }}
                  >
                    {row.code}
                  </Typography>
                )}
              </TableCell>
              <TableCell>{row.module ? moduleLabel(row.module) : '—'}</TableCell>
              <TableCell>{row.risk ? <StatusChip value={row.risk} /> : '—'}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.grantedAt}</TableCell>
              {canRemove && (
                <TableCell align="right">
                  <RemovePermissionButton
                    roleId={roleId}
                    grantId={row.grantId}
                    label={row.name ?? row.code}
                    // An unknown risk (catalogue unreadable) confirms as critical (Ruling 7).
                    critical={row.risk === 'CRITICAL' || row.risk === null}
                    contextOrganisationId={contextOrganisationId}
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
```

`app/(authenticated)/admin/roles/[roleId]/permissions/page.tsx`:

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentContextProfile } from '@/auth/context-service';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { SectionCard } from '@/components/data-display/section-card';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { load } from '@/lib/api/load';
import { getOrganisationTimeZone } from '@/lib/api/lookups';
import { lastPageIfPastEnd, parsePaging } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import { formatInstant } from '@/lib/format';
import {
  canGrantPermissions,
  canRemovePermissions,
} from '@/modules/administration/roles/role-rules';
import {
  getPermissionCatalogue,
  getRole,
  listGrantedCodes,
  listRolePermissions,
} from '@/modules/administration/roles/role-service';
import { GrantPermissionsButton } from '@/modules/administration/roles/components/role-permission-actions';
import { RolePermissionsTable } from '@/modules/administration/roles/components/role-permissions-table';

export const metadata: Metadata = { title: 'Role permissions' };

interface RolePermissionsPageProps {
  params: Promise<{ roleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RolePermissionsPage({
  params,
  searchParams,
}: RolePermissionsPageProps) {
  const { roleId } = await params;
  const query = toSearchParams(await searchParams);
  const [role, selected, grants, catalogue, timeZone] = await Promise.all([
    load(getRole(roleId)), // cached: the layout's read
    getCurrentContextProfile(),
    load(listRolePermissions(roleId, parsePaging(query, 10))),
    // Cached and failure-tolerant: null without permission.view, so names fall back to codes.
    getPermissionCatalogue(),
    getOrganisationTimeZone(),
  ]);
  if (!role.ok) return null; // the layout renders the failure

  const record = role.value;
  const resolved = selected.kind === 'resolved' ? selected : null;
  const holder = { permissions: resolved?.profile.permissions ?? [] };
  // I2: the organisation this page rendered with, carried by every mutation surface below.
  const contextOrganisationId = resolved?.context.organization.id;
  // One bounded read, only when the drawer is on offer (Ruling 6).
  const granted =
    catalogue && canGrantPermissions(record, holder) ? await listGrantedCodes(roleId) : null;

  const card = (content: ReactNode) => (
    <SectionCard
      title="Permissions"
      description={
        record.systemRole
          ? "System roles are immutable: their permissions can't be changed."
          : 'Granted permissions take effect immediately for everyone holding this role.'
      }
      actions={
        catalogue && granted ? (
          <GrantPermissionsButton
            roleId={roleId}
            roleName={record.roleName}
            available={catalogue.items.filter(
              (permission) => permission.status === 'ACTIVE' && !granted.has(permission.code),
            )}
            truncated={catalogue.page.hasNext}
            contextOrganisationId={contextOrganisationId}
          />
        ) : undefined
      }
    >
      {content}
    </SectionCard>
  );

  if (!grants.ok) {
    return card(
      grants.problem.code === 'forbidden' ? (
        <ForbiddenState />
      ) : (
        <ErrorState problem={grants.problem} />
      ),
    );
  }
  const redirectPage = lastPageIfPastEnd(grants.value.page);
  if (redirectPage !== null) {
    redirect(
      hrefWith(`/admin/roles/${roleId}/permissions`, query, {
        page: redirectPage === 0 ? null : String(redirectPage),
      }),
    );
  }

  const byCode = new Map(
    catalogue?.items.map((permission) => [permission.code, permission] as const),
  );
  const rows = grants.value.items.map((grant) => {
    const permission = byCode.get(grant.permissionCode);
    const when = formatInstant(grant.grantedAt, timeZone);
    return {
      grantId: grant.id,
      code: grant.permissionCode,
      name: permission?.name ?? null,
      module: permission?.module ?? null,
      risk: permission?.risk ?? null,
      grantedAt: `${when.date} · ${when.time}`,
    };
  });

  return card(
    rows.length === 0 ? (
      <EmptyState
        title="No permissions granted"
        description={
          record.systemRole
            ? 'This system role grants no permissions.'
            : 'Holders of this role can do nothing yet. Grant permissions to give them access.'
        }
      />
    ) : (
      <>
        <RolePermissionsTable
          rows={rows}
          roleId={roleId}
          canRemove={canRemovePermissions(record, holder)}
          timeZone={timeZone}
          contextOrganisationId={contextOrganisationId}
        />
        <TablePaginationBar page={grants.value.page} />
      </>
    ),
  );
}
```

Run (form T): `modules/administration/roles`. Expected: PASS.

- [ ] **Step 4: Commit** (form C)

`git add modules/administration/roles/components/role-permission-actions.tsx modules/administration/roles/components/role-permission-actions.test.tsx modules/administration/roles/components/role-permissions-table.tsx 'app/(authenticated)/admin/roles/[roleId]/permissions/page.tsx'`

```
feat(roles): add the Permissions tab with the grouped grant drawer and confirmed removal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 6: The Assignments tab — scoped assign and revoke

**Files:**

- Create: `modules/administration/roles/components/role-assignment-actions.tsx` (client):
  `RoleScopeFields`, `AssignRoleButton`, `RevokeRoleAssignmentButton`
- Create: `modules/administration/roles/components/role-assignment-actions.test.tsx`
- Create: `modules/administration/roles/components/role-assignments-table.tsx` (server)
- Create: `app/(authenticated)/admin/roles/[roleId]/assignments/page.tsx`

**Interfaces:**

- Consumes:
  - Tasks 1–4: `getRole`, `listRoleAssignments`, `canAssignRole`, `canRevokeRoleAssignments`,
    `scopeLabel`, `type RoleScopeType`, `assignRole`, `revokeRoleAssignment`,
    `focusRecordTitle`;
  - 08: `AssignmentDrawer`, `UserPicker({ name, label, required?, error? })`;
  - 07b: `ConfirmDialog`; 07: `SectionCard`;
  - 06: `getBranchIndex()`, `getTenantUser(id)`, `shortId`, `TruncatedText`, `StatusChip`,
    `TablePaginationBar`, `EmptyState`, `ErrorState`, `ForbiddenState`, `load`, `parsePaging`,
    `lastPageIfPastEnd`, `hrefWith`, `toSearchParams`; `useToast()`.
- Produces (★ = consumed by 10 and 11):
  - ★ `interface BranchOption { id: string; label: string }`;
  - ★ `RoleScopeFields({ branches: readonly BranchOption[]; fieldErrors: Partial<Record<string, string>> })`,
    which renders the `scopeType` and `branchId` fields `assignRole` reads;
  - ★ `RevokeRoleAssignmentButton({ assignmentId, userLabel, roleLabel, scopeLabel, self, contextOrganisationId? })`;
  - `AssignRoleButton({ roleId, roleName, branches, contextOrganisationId? })`;
  - `RoleAssignmentsTable({ rows: readonly RoleAssignmentRow[], roleName, canRevoke, contextOrganisationId? })`
    and `interface RoleAssignmentRow`;
  - the route `/admin/roles/[roleId]/assignments`.

- [ ] **Step 1: Write the failing test**

`modules/administration/roles/components/role-assignment-actions.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import {
  AssignRoleButton,
  RevokeRoleAssignmentButton,
  RoleScopeFields,
} from './role-assignment-actions';

const { revokeRoleAssignment } = vi.hoisted(() => ({ revokeRoleAssignment: vi.fn() }));
vi.mock('../role-actions', () => ({
  assignRole: vi.fn(),
  revokeRoleAssignment: (...args: unknown[]) => revokeRoleAssignment(...args) as unknown,
}));

const WESTLANDS = '44444444-4444-4444-8444-444444444444';
const ROLE = '09000000-0000-4000-8000-000000000007';
const ASSIGNMENT = '09000000-0000-4000-8000-00000000000e';
const ORG = '11111111-1111-4111-8111-111111111111';
const hidden = (name: string, root: ParentNode = document) =>
  root.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;

describe('RoleScopeFields', () => {
  it('reveals a branch choice for one-branch scope, defaulting a lone branch', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <form>
        <RoleScopeFields
          branches={[{ id: WESTLANDS, label: 'Westlands Branch (WESTLANDS)' }]}
          fieldErrors={{}}
        />
      </form>,
    );

    expect(hidden('scopeType')).toBe('TENANT');
    expect(screen.queryByRole('combobox', { name: 'Branch' })).toBeNull();
    await user.click(screen.getByRole('combobox', { name: 'Scope' }));
    await user.click(screen.getByRole('option', { name: 'One branch' }));

    expect(hidden('scopeType')).toBe('BRANCH');
    expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveTextContent(
      'Westlands Branch (WESTLANDS)',
    );
    expect(hidden('branchId')).toBe(WESTLANDS);
  });

  it('disables one-branch scope with no reachable branch and shows server field errors', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <form>
        <RoleScopeFields branches={[]} fieldErrors={{ scopeType: 'Choose a scope.' }} />
      </form>,
    );

    expect(screen.getByText('Choose a scope.')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Scope' }));
    expect(screen.getByRole('option', { name: 'One branch' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

describe('AssignRoleButton', () => {
  it('opens a drawer that carries the role and the rendered organisation (I2)', async () => {
    const user = userEvent.setup();
    // UserPicker fetches only once its list opens, so this needs no fetch mock.
    renderWithProviders(
      <AssignRoleButton
        roleId={ROLE}
        roleName="Teller"
        branches={[]}
        contextOrganisationId={ORG}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Assign role' }));
    const drawer = screen.getByRole('dialog', { name: 'Assign this role' });
    expect(hidden('contextOrganisationId', drawer)).toBe(ORG);
    expect(hidden('roleId', drawer)).toBe(ROLE);
  });
});

describe('RevokeRoleAssignmentButton', () => {
  it('warns before revoking your own assignment, sends the id (I2), then focuses the title (I3)', async () => {
    const user = userEvent.setup();
    revokeRoleAssignment.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderWithProviders(
      <main>
        <h1>Compliance</h1>
        <RevokeRoleAssignmentButton
          assignmentId={ASSIGNMENT}
          userLabel="Backend Jane Manager"
          roleLabel="Compliance"
          scopeLabel="institution-wide"
          self
          contextOrganisationId={ORG}
        />
      </main>,
    );

    await user.click(
      screen.getByRole('button', {
        name: "Revoke Backend Jane Manager's institution-wide assignment",
      }),
    );
    const dialog = screen.getByRole('alertdialog', {
      name: "Revoke Backend Jane Manager's Compliance assignment?",
    });
    expect(dialog).toHaveTextContent('This is your own assignment');
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(revokeRoleAssignment).toHaveBeenCalledTimes(1);
    });
    const formData = revokeRoleAssignment.mock.calls[0]?.[1] as FormData;
    expect(formData.get('assignmentId')).toBe(ASSIGNMENT);
    expect(formData.get('contextOrganisationId')).toBe(ORG);
    expect(await screen.findByRole('alert')).toHaveTextContent('Assignment revoked');

    rerender(
      <main>
        <h1>Compliance</h1>
      </main>,
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Compliance' })).toHaveFocus();
    });
  });

  it("doesn't warn about someone else's assignment", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <RevokeRoleAssignmentButton
        assignmentId={ASSIGNMENT}
        userLabel="Grace Achieng"
        roleLabel="Teller"
        scopeLabel="Westlands Branch"
        self={false}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: "Revoke Grace Achieng's Westlands Branch assignment" }),
    );
    expect(screen.getByRole('alertdialog')).not.toHaveTextContent('your own assignment');
  });
});
```

Run (form T): `modules/administration/roles/components/role-assignment-actions.test.tsx`.
Expected: FAIL (no module).

- [ ] **Step 2: Write the assignment actions**

`modules/administration/roles/components/role-assignment-actions.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import PersonAddAltOutlined from '@mui/icons-material/PersonAddAltOutlined';
import { AssignmentDrawer } from '@/components/data-display/assignment-drawer';
import { ConfirmDialog } from '@/components/data-display/confirm-dialog';
import { focusRecordTitle } from '@/components/data-display/focus-record-title';
import { useToast } from '@/components/providers/toast-provider';
import { UserPicker } from '@/modules/administration/users/components/user-picker';
import { assignRole, revokeRoleAssignment } from '../role-actions';
import type { RoleScopeType } from '../role-contract';

export interface BranchOption {
  id: string;
  label: string;
}

interface RoleScopeFieldsProps {
  /** Branches a BRANCH-scope assignment may name: every branch at institution level, only the
   * selected one in a branch context (contract §E.4: another branch is a 404). Empty disables
   * branch scope (Ruling 10). */
  branches: readonly BranchOption[];
  fieldErrors: Partial<Record<string, string>>;
}

/**
 * The `scopeType` and `branchId` fields of a role-assignment form. This layer composes them with
 * `UserPicker`; layer 10 composes them with a role picker on the user record. The branch field
 * renders only for BRANCH scope, so TENANT never carries one.
 */
export function RoleScopeFields({ branches, fieldErrors }: RoleScopeFieldsProps) {
  const [scope, setScope] = useState<RoleScopeType>('TENANT');
  return (
    <>
      <TextField
        select
        name="scopeType"
        label="Scope"
        required
        value={scope}
        onChange={(event) => {
          setScope(event.target.value === 'BRANCH' ? 'BRANCH' : 'TENANT');
        }}
        error={Boolean(fieldErrors.scopeType)}
        helperText={
          fieldErrors.scopeType ??
          (scope === 'TENANT'
            ? 'Applies at every branch and at institution level.'
            : 'Applies only while that branch is selected. The user must already be assigned to it.')
        }
      >
        <MenuItem value="TENANT">Institution (all branches)</MenuItem>
        <MenuItem value="BRANCH" disabled={branches.length === 0}>
          One branch
        </MenuItem>
      </TextField>
      {scope === 'BRANCH' && (
        <TextField
          select
          name="branchId"
          label="Branch"
          required
          defaultValue={branches.length === 1 ? (branches[0]?.id ?? '') : ''}
          error={Boolean(fieldErrors.branchId)}
          helperText={fieldErrors.branchId}
        >
          {branches.map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>
              {branch.label}
            </MenuItem>
          ))}
        </TextField>
      )}
    </>
  );
}

interface AssignRoleButtonProps {
  roleId: string;
  roleName: string;
  branches: readonly BranchOption[];
  /** I2: forwarded to the drawer as a hidden field. */
  contextOrganisationId?: string;
}

export function AssignRoleButton({
  roleId,
  roleName,
  branches,
  contextOrganisationId,
}: AssignRoleButtonProps) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="contained"
        startIcon={<PersonAddAltOutlined />}
        onClick={() => {
          setOpen(true);
        }}
      >
        Assign role
      </Button>
      <AssignmentDrawer
        open={open}
        title="Assign this role"
        description={`Give a user ${roleName}. It takes effect immediately.`}
        submitLabel="Assign role"
        action={assignRole}
        contextOrganisationId={contextOrganisationId}
        onClose={() => {
          setOpen(false);
        }}
        onSuccess={() => {
          setOpen(false);
          notify('Role assigned');
        }}
      >
        {(fieldErrors) => (
          <>
            <input type="hidden" name="roleId" value={roleId} />
            <UserPicker name="userId" label="User" required error={fieldErrors.userId} />
            <RoleScopeFields branches={branches} fieldErrors={fieldErrors} />
          </>
        )}
      </AssignmentDrawer>
    </>
  );
}

interface RevokeRoleAssignmentButtonProps {
  assignmentId: string;
  userLabel: string;
  roleLabel: string;
  /** `institution-wide`, or the branch name of a BRANCH-scope assignment. */
  scopeLabel: string;
  /** The signed-in user's own assignment (Ruling 12). */
  self: boolean;
  /** I2: forwarded to `ConfirmDialog` as a hidden field. */
  contextOrganisationId?: string;
}

/** Revokes one role assignment. 10 reuses it on the user record's Roles & access tab. */
export function RevokeRoleAssignmentButton({
  assignmentId,
  userLabel,
  roleLabel,
  scopeLabel,
  self,
  contextOrganisationId,
}: RevokeRoleAssignmentButtonProps) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  // I3: a successful revoke removes this row — and this button — so focus falls back to the
  // record title from the unmount cleanup (08's RevokeAssignmentButton pattern).
  const succeededRef = useRef(false);
  useEffect(() => {
    const successRef = succeededRef;
    return () => {
      if (successRef.current) focusRecordTitle();
    };
  }, []);

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        color="error"
        aria-label={`Revoke ${userLabel}'s ${scopeLabel} assignment`}
        onClick={() => {
          setOpen(true);
        }}
      >
        Revoke
      </Button>
      <ConfirmDialog
        open={open}
        tone="error"
        title={`Revoke ${userLabel}'s ${roleLabel} assignment?`}
        description={`${userLabel} loses ${roleLabel} (${scopeLabel}) immediately.${
          self
            ? ' This is your own assignment: you lose these permissions too, and possibly your access to this page.'
            : ''
        }`}
        confirmLabel="Revoke"
        action={revokeRoleAssignment}
        contextOrganisationId={contextOrganisationId}
        onClose={() => {
          setOpen(false);
        }}
        onSuccess={() => {
          succeededRef.current = true;
          setOpen(false);
          notify('Assignment revoked');
        }}
      >
        <input type="hidden" name="assignmentId" value={assignmentId} />
      </ConfirmDialog>
    </>
  );
}
```

Run (form T): `modules/administration/roles/components/role-assignment-actions.test.tsx`.
Expected: PASS.

- [ ] **Step 3: Write the table and the tab**

`modules/administration/roles/components/role-assignments-table.tsx`:

```tsx
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { StatusChip } from '@/components/data-display/status-chip';
import { TruncatedText } from '@/components/data-display/truncated-text';
import type { RoleScopeType } from '../role-contract';
import { scopeLabel } from '../role-rules';
import { RevokeRoleAssignmentButton } from './role-assignment-actions';

export interface RoleAssignmentRow {
  assignmentId: string;
  name: string;
  email: string | null;
  scopeType: RoleScopeType;
  /** The branch name for BRANCH scope; `All branches` for TENANT. */
  branchLabel: string;
  /** The signed-in user's own assignment. */
  self: boolean;
}

interface RoleAssignmentsTableProps {
  rows: readonly RoleAssignmentRow[];
  roleName: string;
  canRevoke: boolean;
  /** I2: forwarded to each row's revoke confirmation. */
  contextOrganisationId?: string;
}

export function RoleAssignmentsTable({
  rows,
  roleName,
  canRevoke,
  contextOrganisationId,
}: RoleAssignmentsTableProps) {
  return (
    // Keyboard-scrollable at 375 px even when no row holds a button (07's history-table rule).
    <TableContainer tabIndex={0} role="region" aria-label="Role assignments">
      <Table aria-label="Role assignments" sx={{ minWidth: 600 }}>
        <TableHead>
          <TableRow>
            <TableCell>User</TableCell>
            <TableCell>Scope</TableCell>
            <TableCell>Branch</TableCell>
            {canRevoke && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.assignmentId}>
              <TableCell>
                <TruncatedText value={row.name} maxWidth={280} />
                {row.email && (
                  <TruncatedText
                    value={row.email}
                    maxWidth={280}
                    variant="caption"
                    color="text.secondary"
                  />
                )}
              </TableCell>
              <TableCell>
                <StatusChip value={row.scopeType} label={scopeLabel(row.scopeType)} />
              </TableCell>
              <TableCell>
                <TruncatedText value={row.branchLabel} maxWidth={220} />
              </TableCell>
              {canRevoke && (
                <TableCell align="right">
                  <RevokeRoleAssignmentButton
                    assignmentId={row.assignmentId}
                    userLabel={row.name}
                    roleLabel={roleName}
                    scopeLabel={row.scopeType === 'TENANT' ? 'institution-wide' : row.branchLabel}
                    self={row.self}
                    contextOrganisationId={contextOrganisationId}
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
```

`app/(authenticated)/admin/roles/[roleId]/assignments/page.tsx`:

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentContextProfile } from '@/auth/context-service';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { SectionCard } from '@/components/data-display/section-card';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { load } from '@/lib/api/load';
import { getBranchIndex, getTenantUser } from '@/lib/api/lookups';
import { lastPageIfPastEnd, parsePaging } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import { shortId } from '@/lib/format';
import { canAssignRole, canRevokeRoleAssignments } from '@/modules/administration/roles/role-rules';
import { getRole, listRoleAssignments } from '@/modules/administration/roles/role-service';
import { AssignRoleButton } from '@/modules/administration/roles/components/role-assignment-actions';
import { RoleAssignmentsTable } from '@/modules/administration/roles/components/role-assignments-table';

export const metadata: Metadata = { title: 'Role assignments' };

interface RoleAssignmentsPageProps {
  params: Promise<{ roleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RoleAssignmentsPage({
  params,
  searchParams,
}: RoleAssignmentsPageProps) {
  const { roleId } = await params;
  const query = toSearchParams(await searchParams);
  const [role, selected, assignments, branches] = await Promise.all([
    load(getRole(roleId)), // cached: the layout's read
    getCurrentContextProfile(),
    load(listRoleAssignments({ roleId, status: 'ACTIVE' }, parsePaging(query, 10))),
    getBranchIndex(), // empty without branch.view: branch names fall back to short IDs
  ]);
  if (!role.ok) return null; // the layout renders the failure

  const record = role.value;
  const resolved = selected.kind === 'resolved' ? selected : null;
  const holder = { permissions: resolved?.profile.permissions ?? [] };
  // I2: the organisation this page rendered with, carried by every mutation surface below.
  const contextOrganisationId = resolved?.context.organization.id;
  const branchLabel = (id: string, name: string) => {
    const code = branches.get(id)?.code;
    return code ? `${name} (${code})` : name;
  };
  // Ruling 10: with a branch selected, a BRANCH assignment elsewhere is a 404 (contract §E.4).
  const selectedBranch = resolved?.context.branch ?? null;
  const branchOptions = selectedBranch
    ? [{ id: selectedBranch.id, label: branchLabel(selectedBranch.id, selectedBranch.name) }]
    : [...branches].map(([id, branch]) => ({ id, label: branchLabel(id, branch.name) }));
  const assignable = canAssignRole(record, holder);

  const card = (content: ReactNode) => (
    <SectionCard
      title="Assignments"
      description="Who holds this role. Institution scope applies everywhere; branch scope only while that branch is selected."
      actions={
        assignable ? (
          <AssignRoleButton
            roleId={roleId}
            roleName={record.roleName}
            branches={branchOptions}
            contextOrganisationId={contextOrganisationId}
          />
        ) : undefined
      }
    >
      {content}
    </SectionCard>
  );

  if (!assignments.ok) {
    return card(
      assignments.problem.code === 'forbidden' ? (
        <ForbiddenState />
      ) : (
        <ErrorState problem={assignments.problem} />
      ),
    );
  }
  const redirectPage = lastPageIfPastEnd(assignments.value.page);
  if (redirectPage !== null) {
    redirect(
      hrefWith(`/admin/roles/${roleId}/assignments`, query, {
        page: redirectPage === 0 ? null : String(redirectPage),
      }),
    );
  }

  // ponytail: one cached read per distinct visible user (≤ page size). Assignment rows carry no
  // names (BG-09), as on 08's Users tab.
  const users = await Promise.all(
    [...new Set(assignments.value.items.map((row) => row.userId))].map((id) => getTenantUser(id)),
  );
  const byId = new Map(users.flatMap((user) => (user ? [[user.id, user] as const] : [])));
  const myUserId = resolved?.profile.user_id ?? null;

  return card(
    assignments.value.items.length === 0 ? (
      <EmptyState
        title="Nobody holds this role"
        description={
          assignable ? 'Assign it to give a user its permissions.' : 'No one is assigned this role.'
        }
      />
    ) : (
      <>
        <RoleAssignmentsTable
          roleName={record.roleName}
          canRevoke={canRevokeRoleAssignments(holder)}
          contextOrganisationId={contextOrganisationId}
          rows={assignments.value.items.map((row) => ({
            assignmentId: row.id,
            name: byId.get(row.userId)?.displayName ?? shortId(row.userId),
            email: byId.get(row.userId)?.email ?? null,
            scopeType: row.scopeType,
            branchLabel: row.branchId
              ? (branches.get(row.branchId)?.name ?? shortId(row.branchId))
              : 'All branches',
            self: row.userId === myUserId,
          }))}
        />
        <TablePaginationBar page={assignments.value.page} />
      </>
    ),
  );
}
```

Run (form T): `modules/administration/roles`. Expected: PASS.

- [ ] **Step 4: Commit** (form C)

`git add modules/administration/roles/components/role-assignment-actions.tsx modules/administration/roles/components/role-assignment-actions.test.tsx modules/administration/roles/components/role-assignments-table.tsx 'app/(authenticated)/admin/roles/[roleId]/assignments/page.tsx'`

```
feat(roles): add the Assignments tab with scoped assign and revoke

RoleScopeFields and RevokeRoleAssignmentButton are shared with the user record (layer 10).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 7: Fake API roles, the permission catalogue, role assignments, and the `roles` scenario

**Files:**

- Modify: `e2e/fake-api/state.mts` (`FakeRole.grantedAt?`, optional)
- Create: `e2e/fake-api/routes/roles.mts`
- Modify: `e2e/fake-api/scenarios.mts` (`ROLE_SCENARIO_IDS`, the `roles` builder, one `BUILDERS`
  entry)
- Modify: `e2e/fake-api/server.mts` (register `roleRoutes`, in its own commit)
- Create: `e2e/fake-api-roles.spec.ts`

**Interfaces:**

- Consumes:
  - 07: `sendIdempotent(context, body, produce, status = 200)` (A2) and
    `recordAuditEvent(state, access, { entityType, entityId, action, reason })` (R);
  - 07b: `requirePermission(access, code, scope = 'tenant')`;
  - 03/06: `requireContext`, `requireTenantContext`, `type AccessContext`, `objectBody`,
    `readBody`, `stringField`, `pageOf`, `problem`, `sendJson`, `type Violation`, `route`,
    `type Route`, `type RouteContext`;
  - `scenarios.mts`' module-private helpers `role`, `membership`, `assignment`,
    `tenantRoleAssignment`, `greenfieldTenant`, and the exported `IDS`.
- Produces:
  - Fake routes, mirroring contract §E.3 and the source f74e44b behaviours noted inline:
    - `GET`/`POST /api/v1/tenant/roles`;
    - `GET`/`PATCH /tenant/roles/:role_id`;
    - `POST /tenant/roles/:role_id/{activate,deactivate}`;
    - `GET`/`POST /tenant/roles/:role_id/permissions`;
    - `DELETE /tenant/roles/:role_id/permissions/:grant_id`;
    - `GET /tenant/permissions`;
    - `GET`/`POST /tenant/role-assignments`;
    - `DELETE /tenant/role-assignments/:assignment_id`.
  - They mirror these backend behaviours: the system-role 409; an unknown permission code is a
    404; an idempotent repeat grant; the remaining-grants page from DELETE; the
    BRANCH-without-branch 500 (BG-07); the branch-context 404; the not-assigned-there 409; the
    TENANT-with-branch 422; an off-list sort is a 500; `invalid_json` for unknown properties.
  - The scenario `roles` and `ROLE_SCENARIO_IDS`.

- [ ] **Step 1: Write the failing fake spec**

`e2e/fake-api-roles.spec.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { IDS, ROLE_SCENARIO_IDS } from './fake-api/scenarios.mts';

const FAKE_API_URL = `http://127.0.0.1:${process.env.FAKE_API_PORT ?? '3199'}`;
const api = (path: string) => `${FAKE_API_URL}/api/v1${path}`;

/** Headers for a fresh run: at one branch, or at institution level (`null`). */
async function contextFor(
  request: APIRequestContext,
  scenario: string,
  branchId: string | null,
): Promise<Record<string, string>> {
  const bearer = { Authorization: `Bearer e2e.${scenario}.${randomUUID()}` };
  const organisation = await request.post(api('/auth/select-organisation'), {
    headers: bearer,
    data: { organisation_id: IDS.greenfield },
  });
  const { context_token: institution } = (await organisation.json()) as { context_token: string };
  if (branchId === null) return { ...bearer, 'X-Active-Organisation-Context': institution };
  const branch = await request.post(api('/auth/select-branch'), {
    headers: { ...bearer, 'X-Active-Organisation-Context': institution },
    data: { branch_id: branchId },
  });
  const { context_token: pinned } = (await branch.json()) as { context_token: string };
  return { ...bearer, 'X-Active-Organisation-Context': pinned };
}

test.describe('fake API roles (contract §E.3)', () => {
  test('lists, filters, and sorts roles; an off-list sort is a 500', async ({ request }) => {
    const headers = await contextFor(request, 'roles', null);
    const all = (await (await request.get(api('/tenant/roles'), { headers })).json()) as {
      items: { role_code: string }[];
      page: { total_items: number };
    };
    expect(all.page.total_items).toBe(6);
    // Newest first by default (createdAt DESC, contract §E.3).
    expect(all.items[0]?.role_code).toBe('COMPLIANCE');
    // toMatchObject matches arrays by length too, so this asserts exactly the two system roles.
    const system = await request.get(
      api('/tenant/roles?system_role=true&sort_by=roleName&sort_dir=ASC'),
      { headers },
    );
    expect(await system.json()).toMatchObject({
      items: [{ role_code: 'BRANCH_MANAGER' }, { role_code: 'TENANT_ADMIN' }],
      page: { total_items: 2 },
    });
    expect((await request.get(api('/tenant/roles?sort_by=role_name'), { headers })).status()).toBe(
      500,
    );
  });

  test('keeps system roles immutable and edits a custom one', async ({ request }) => {
    const headers = await contextFor(request, 'roles', null);
    const system = await request.patch(api(`/tenant/roles/${IDS.tenantAdminRole}`), {
      headers,
      data: { role_name: 'Admin', description: null },
    });
    expect(system.status()).toBe(409);
    const edited = await request.patch(api(`/tenant/roles/${ROLE_SCENARIO_IDS.teller}`), {
      headers,
      data: { role_name: 'Senior teller', description: null },
    });
    expect(await edited.json()).toMatchObject({
      role_name: 'Senior teller',
      description: 'Front-desk cash and member service.',
    });
    const disabled = await request.post(
      api(`/tenant/roles/${ROLE_SCENARIO_IDS.teller}/deactivate`),
      { headers, data: {} },
    );
    expect(await disabled.json()).toMatchObject({ status: 'DISABLED' });
  });

  test('grants idempotently, lists newest first, and removes by grant id', async ({ request }) => {
    const headers = await contextFor(request, 'roles', null);
    const path = `/tenant/roles/${ROLE_SCENARIO_IDS.teller}/permissions`;
    const keyed = { ...headers, 'Idempotency-Key': randomUUID() };
    const first = await request.post(api(path), {
      headers: keyed,
      data: { permission_code: 'cob.start' },
    });
    expect(first.status()).toBe(201);
    const replay = await request.post(api(path), {
      headers: keyed,
      data: { permission_code: 'cob.start' },
    });
    expect(replay.headers()['idempotency-replayed']).toBe('true');

    const grants = (await (await request.get(api(path), { headers })).json()) as {
      items: { id: string; permission_code: string }[];
    };
    expect(grants.items.map((grant) => grant.permission_code)).toEqual([
      'cob.start',
      'branch.view',
      'business_date.view',
    ]);
    expect(
      (await request.post(api(path), { headers, data: { permission_code: 'nope.view' } })).status(),
    ).toBe(404);
    const removed = await request.delete(api(`${path}/${grants.items[0]?.id ?? ''}`), { headers });
    expect(await removed.json()).toMatchObject({ page: { total_items: 2 } });
  });

  test('scopes role assignments like the backend', async ({ request }) => {
    const institution = await contextFor(request, 'roles', null);
    const assign = (headers: Record<string, string>, data: Record<string, unknown>) =>
      request.post(api('/tenant/role-assignments'), { headers, data });
    const tom = { user_id: ROLE_SCENARIO_IDS.tom, role_id: ROLE_SCENARIO_IDS.opsSupervisor };

    // Tom is assigned at Head Office only: Westlands is the guard's 409.
    expect(
      (
        await assign(institution, { ...tom, scope_type: 'BRANCH', branch_id: IDS.westlands })
      ).status(),
    ).toBe(409);
    expect(
      (
        await assign(institution, { ...tom, scope_type: 'BRANCH', branch_id: IDS.headOffice })
      ).status(),
    ).toBe(201);
    expect(
      (
        await assign(institution, { ...tom, scope_type: 'TENANT', branch_id: IDS.headOffice })
      ).status(),
    ).toBe(422);
    // Source f74e44b: requireNotNull before the service's check — BG-07's 500.
    expect(
      (await assign(institution, { ...tom, scope_type: 'BRANCH', branch_id: null })).status(),
    ).toBe(500);

    const atHeadOffice = await contextFor(request, 'roles', IDS.headOffice);
    expect(
      (
        await assign(atHeadOffice, {
          user_id: ROLE_SCENARIO_IDS.grace,
          role_id: ROLE_SCENARIO_IDS.opsSupervisor,
          scope_type: 'BRANCH',
          branch_id: IDS.westlands,
        })
      ).status(),
    ).toBe(404);

    const holders = await request.get(
      api(`/tenant/role-assignments?role_id=${ROLE_SCENARIO_IDS.teller}&status=ACTIVE`),
      { headers: institution },
    );
    expect(await holders.json()).toMatchObject({ page: { total_items: 2 } });
    const revoked = await request.delete(
      api(`/tenant/role-assignments/${ROLE_SCENARIO_IDS.tomTeller}`),
      { headers: institution },
    );
    expect(await revoked.json()).toMatchObject({ status: 'REVOKED' });
  });

  test('rejects unknown properties and lists the catalogue', async ({ request }) => {
    const headers = await contextFor(request, 'roles', null);
    const camel = await request.post(api('/tenant/roles'), { headers, data: { roleCode: 'X1' } });
    expect(await camel.json()).toMatchObject({ code: 'invalid_json' });
    const critical = await request.get(api('/tenant/permissions?risk_level=CRITICAL&size=100'), {
      headers,
    });
    expect(await critical.json()).toMatchObject({ page: { total_items: 9 } });
  });
});
```

Run (form E): `e2e/fake-api-roles.spec.ts`. Expected: FAIL. The `roles` scenario is unknown, so
every call is the empty 401.

- [ ] **Step 2: Add the optional grant times**

In `e2e/fake-api/state.mts`, add this as the last member of `interface FakeRole`:

```ts
  /** Layer 09: when each code was granted at runtime; a seeded code reads as granted at
   * `createdAt`. Optional, so existing `FakeRole` literals (07b's access spec) stay valid. */
  grantedAt?: Record<string, string>;
```

- [ ] **Step 3: Write the routes**

`e2e/fake-api/routes/roles.mts`:

```ts
import { createHash, randomUUID } from 'node:crypto';
import { requireContext, requirePermission, requireTenantContext } from '../access.mts';
import type { AccessContext } from '../access.mts';
import { recordAuditEvent } from '../audit-log.mts';
import { objectBody, pageOf, problem, readBody, sendJson, stringField } from '../http.mts';
import type { Violation } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { route } from '../router.mts';
import type { Route, RouteContext } from '../router.mts';
import type { FakeRole, FakeRoleAssignment } from '../state.mts';

type CatalogueRow = readonly [code: string, name: string, module: string, risk: string];

/**
 * The 54 foundation codes (contract §J), with the backend's V2 seed names, modules and risks
 * (source f74e44b). The 26 accounting codes aren't surfaced yet.
 */
const CATALOGUE: readonly CatalogueRow[] = [
  ['tenant.create', 'Create organisation', 'tenant', 'HIGH'],
  ['tenant.submit_for_approval', 'Submit organisation for approval', 'tenant', 'HIGH'],
  ['tenant.approve', 'Approve organisation', 'tenant', 'CRITICAL'],
  ['tenant.activate', 'Activate organisation', 'tenant', 'CRITICAL'],
  ['tenant.suspend', 'Suspend organisation', 'tenant', 'CRITICAL'],
  ['tenant.deprovision', 'Deprovision organisation', 'tenant', 'CRITICAL'],
  ['tenant.view', 'View organisation', 'tenant', 'MEDIUM'],
  ['tenant.update_draft', 'Update organisation draft', 'tenant', 'HIGH'],
  ['tenant.reject', 'Reject organisation draft', 'tenant', 'HIGH'],
  ['tenant.reactivate', 'Reactivate organisation', 'tenant', 'CRITICAL'],
  ['tenant.bootstrap_retry', 'Retry administrator bootstrap', 'tenant', 'HIGH'],
  ['branch.create', 'Create branch', 'branch', 'HIGH'],
  ['branch.approve', 'Approve branch', 'branch', 'HIGH'],
  ['branch.activate', 'Activate branch', 'branch', 'HIGH'],
  ['branch.suspend', 'Suspend branch', 'branch', 'HIGH'],
  ['branch.close', 'Close branch', 'branch', 'HIGH'],
  ['branch.view', 'View branch', 'branch', 'LOW'],
  ['branch.reactivate', 'Reactivate branch', 'branch', 'HIGH'],
  ['user.invite', 'Invite user', 'iam', 'HIGH'],
  ['user.approve', 'Approve user', 'iam', 'HIGH'],
  ['user.activate', 'Activate user', 'iam', 'HIGH'],
  ['user.suspend', 'Suspend user', 'iam', 'HIGH'],
  ['user.deactivate', 'Deactivate user', 'iam', 'HIGH'],
  ['user.assign_branch', 'Assign user branch', 'iam', 'HIGH'],
  ['user.assign_role', 'Assign user role', 'iam', 'HIGH'],
  ['user.revoke_branch', 'Revoke branch assignment', 'iam', 'HIGH'],
  ['user.revoke_role', 'Revoke role assignment', 'iam', 'HIGH'],
  ['user.view', 'View users', 'iam', 'LOW'],
  ['role.create', 'Create role', 'iam', 'HIGH'],
  ['role.update', 'Update role', 'iam', 'HIGH'],
  ['role.activate', 'Activate role', 'iam', 'HIGH'],
  ['role.deactivate', 'Deactivate role', 'iam', 'HIGH'],
  ['role.assign_permission', 'Assign permission to role', 'iam', 'CRITICAL'],
  ['role.remove_permission', 'Remove role permission', 'iam', 'CRITICAL'],
  ['role.view', 'View roles', 'iam', 'LOW'],
  ['membership.view', 'View memberships', 'iam', 'LOW'],
  ['membership.suspend', 'Suspend membership', 'iam', 'HIGH'],
  ['membership.reactivate', 'Reactivate membership', 'iam', 'HIGH'],
  ['membership.revoke', 'Revoke membership', 'iam', 'HIGH'],
  ['iam.profile.read', 'View own profile', 'iam', 'LOW'],
  ['auth.select_organisation', 'Select organisation', 'iam', 'LOW'],
  ['auth.select_branch', 'Select branch', 'iam', 'LOW'],
  ['branch_assignment.view', 'View branch assignments', 'iam', 'LOW'],
  ['role_assignment.view', 'View role assignments', 'iam', 'LOW'],
  ['permission.view', 'View permissions', 'iam', 'LOW'],
  ['audit.view', 'View audit log', 'audit', 'MEDIUM'],
  ['settings.view', 'View settings', 'settings', 'LOW'],
  ['settings.update', 'Update settings', 'settings', 'HIGH'],
  ['tenant_setting.manage_platform', 'Manage platform-only settings', 'settings', 'HIGH'],
  ['business_date.view', 'View business date', 'settings', 'LOW'],
  ['business_date.advance', 'Advance business date', 'settings', 'CRITICAL'],
  ['business_date.reopen', 'Reopen business date', 'settings', 'CRITICAL'],
  ['cob.start', 'Start close of business', 'settings', 'HIGH'],
  ['cob.complete', 'Complete close of business', 'settings', 'HIGH'],
];

interface CatalogueEntry {
  id: string;
  code: string;
  name: string;
  module: string;
  risk: string;
}

// Layer 09 seed ids (lane rules §5), numbered from …0100 so they never meet the scenario counter.
const PERMISSIONS: readonly CatalogueEntry[] = CATALOGUE.map(
  ([code, name, module, risk], index) => ({
    id: `09000000-0000-4000-8000-${(0x100 + index).toString(16).padStart(12, '0')}`,
    code,
    name,
    module,
    risk,
  }),
);

const ROLE_CODE = /^[A-Z0-9_-]{2,20}$/;

/** A stable UUID for something the fake keeps no row for: one role's grant of one code. It is
 * derived at runtime like a `randomUUID()` id, not a seed id (Ruling 18). */
function derivedId(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

const roleNotFound = () => problem(404, 'resource_not_found', 'Role not found.');
const assignmentNotFound = () => problem(404, 'resource_not_found', 'Role assignment not found');
const immutable = () => problem(409, 'conflict', 'System roles cannot be modified.');

function tenantAccess(context: RouteContext): AccessContext {
  const access = requireContext(context);
  requireTenantContext(access);
  return access;
}

function findRole(access: AccessContext, roleId: string): FakeRole {
  const role = access.state.roles.find(
    (candidate) => candidate.id === roleId && candidate.organisationId === access.organisation.id,
  );
  if (!role) throw roleNotFound();
  return role;
}

const summaryWire = (role: FakeRole) => ({
  id: role.id,
  role_code: role.code,
  role_name: role.name,
  system_role: role.systemRole,
  status: role.status,
});

const detailWire = (role: FakeRole) => ({
  id: role.id,
  organisation_id: role.organisationId,
  role_code: role.code,
  role_name: role.name,
  description: role.description,
  system_role: role.systemRole,
  status: role.status,
  created_at: role.createdAt,
  updated_at: role.updatedAt,
});

const permissionWire = (entry: CatalogueEntry) => ({
  id: entry.id,
  permission_code: entry.code,
  permission_name: entry.name,
  module_code: entry.module,
  risk_level: entry.risk,
  status: 'ACTIVE',
});

const assignmentWire = (row: FakeRoleAssignment) => ({
  id: row.id,
  user_id: row.userId,
  role_id: row.roleId,
  branch_id: row.branchId,
  scope_type: row.scopeType,
  status: row.status,
});

/** A role's grants, newest first (contract §E.3); a seeded code reads as granted at creation. */
function grantsOf(role: FakeRole) {
  return role.permissions
    .map((code) => ({
      id: derivedId(`${role.id}:${code}`),
      role_id: role.id,
      permission_id:
        PERMISSIONS.find((entry) => entry.code === code)?.id ?? derivedId(`permission:${code}`),
      permission_code: code,
      granted_at: role.grantedAt?.[code] ?? role.createdAt,
    }))
    .sort(
      (a, b) =>
        b.granted_at.localeCompare(a.granted_at) ||
        a.permission_code.localeCompare(b.permission_code),
    );
}

/** Mirrors the backend's sort parsing: an off-list `sort_by` or `sort_dir` is a 500 (BG-07). */
function orderBy<T>(
  rows: T[],
  keys: Partial<Record<string, (row: T) => string>>,
  query: URLSearchParams,
  fallback: { by: string; dir: string },
): T[] {
  const key = keys[query.get('sort_by') ?? fallback.by];
  const direction = (query.get('sort_dir') ?? fallback.dir).toUpperCase();
  if (!key || (direction !== 'ASC' && direction !== 'DESC')) {
    throw problem(500, 'internal_error', 'An unexpected error occurred.');
  }
  const ordered = rows.sort((a, b) => key(a).localeCompare(key(b)));
  return direction === 'DESC' ? ordered.reverse() : ordered;
}

const ROLE_SORTS: Partial<Record<string, (role: FakeRole) => string>> = {
  roleCode: (role) => role.code,
  roleName: (role) => role.name,
  status: (role) => role.status,
  createdAt: (role) => role.createdAt,
};

const PERMISSION_SORTS: Partial<Record<string, (entry: CatalogueEntry) => string>> = {
  permissionCode: (entry) => entry.code,
  permissionName: (entry) => entry.name,
  riskLevel: (entry) => entry.risk,
  // Every fake entry is ACTIVE and has no creation time, so these sort as ties.
  status: () => '',
  createdAt: () => '',
};

const ASSIGNMENT_FILTERS: Record<string, (row: FakeRoleAssignment) => string | null> = {
  user_id: (row) => row.userId,
  role_id: (row) => row.roleId,
  branch_id: (row) => row.branchId,
  scope_type: (row) => row.scopeType,
  status: (row) => row.status,
};

/** Activate / deactivate: any state → ACTIVE / DISABLED, custom roles only (contract §E.3). */
function statusRoute(path: 'activate' | 'deactivate', status: 'ACTIVE' | 'DISABLED'): Route {
  return route('POST', `/api/v1/tenant/roles/:role_id/${path}`, (context) => {
    const access = tenantAccess(context);
    requirePermission(access, `role.${path}`);
    requirePermission(access, 'role.view'); // read-back (BG-31)
    const role = findRole(access, context.params.role_id ?? '');
    // The endpoint takes no input (contract §E.3), so every request fingerprints as `{}`.
    sendIdempotent(context, {}, () => {
      if (role.systemRole) throw immutable();
      role.status = status;
      role.updatedAt = new Date().toISOString();
      recordAuditEvent(context.state, access, {
        entityType: 'ROLE',
        entityId: role.id,
        action: `role.${path}`,
        reason: null,
      });
      return detailWire(role);
    });
  });
}

export const roleRoutes: Route[] = [
  route('GET', '/api/v1/tenant/roles', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'role.view');
    const { query } = context;
    const q = query.get('q')?.toLowerCase();
    const status = query.get('status');
    const systemRole = query.get('system_role');
    const roles = context.state.roles.filter(
      (role) =>
        role.organisationId === access.organisation.id &&
        (!q || role.code.toLowerCase().includes(q) || role.name.toLowerCase().includes(q)) &&
        (!status || role.status === status) &&
        (systemRole === null || String(role.systemRole) === systemRole),
    );
    const ordered = orderBy(roles, ROLE_SORTS, query, { by: 'createdAt', dir: 'DESC' });
    sendJson(context.res, 200, pageOf(ordered.map(summaryWire), query));
  }),

  route('POST', '/api/v1/tenant/roles', async (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'role.create');
    requirePermission(access, 'role.view'); // read-back (BG-31)
    const body = objectBody(await readBody(context.req), ['role_code', 'role_name', 'description']);
    const code = stringField(body, 'role_code', { required: true }) ?? '';
    const name = stringField(body, 'role_name', { required: true }) ?? '';
    const description = stringField(body, 'description', { required: false });
    const violations: Violation[] = [];
    if (!ROLE_CODE.test(code)) {
      violations.push({
        field: 'role_code',
        code: 'Pattern',
        message: 'Role code must be 2-20 uppercase letters, numbers, hyphens, or underscores.',
      });
    }
    if (name.trim() === '') {
      violations.push({ field: 'role_name', code: 'NotBlank', message: 'must not be blank' });
    }
    if (violations.length > 0) {
      throw problem(400, 'validation_failed', 'Validation failed.', violations);
    }
    sendIdempotent(
      context,
      body,
      () => {
        const { roles } = context.state;
        if (roles.some((c) => c.organisationId === access.organisation.id && c.code === code)) {
          throw problem(409, 'conflict', 'A role with this code already exists.');
        }
        const now = new Date().toISOString();
        const created: FakeRole = {
          id: randomUUID(),
          organisationId: access.organisation.id,
          code,
          name,
          description,
          systemRole: false,
          status: 'ACTIVE',
          permissions: [],
          createdAt: now,
          updatedAt: now,
        };
        roles.push(created);
        recordAuditEvent(context.state, access, {
          entityType: 'ROLE',
          entityId: created.id,
          action: 'role.create',
          reason: null,
        });
        return detailWire(created);
      },
      201,
    );
  }),

  route('GET', '/api/v1/tenant/roles/:role_id', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'role.view');
    sendJson(context.res, 200, detailWire(findRole(access, context.params.role_id ?? '')));
  }),

  route('PATCH', '/api/v1/tenant/roles/:role_id', async (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'role.update');
    requirePermission(access, 'role.view');
    const role = findRole(access, context.params.role_id ?? '');
    // The body is required (contract §D). As in the backend (BG-09a), a non-null field replaces
    // the stored one, blank included; the UI pre-validates the name.
    const body = objectBody(await readBody(context.req), ['role_name', 'description']);
    const name = stringField(body, 'role_name', { required: false });
    const description = stringField(body, 'description', { required: false });
    sendIdempotent(context, body, () => {
      if (role.systemRole) throw immutable();
      if (name !== null) role.name = name;
      if (description !== null) role.description = description;
      role.updatedAt = new Date().toISOString();
      recordAuditEvent(context.state, access, {
        entityType: 'ROLE',
        entityId: role.id,
        action: 'role.update',
        reason: null,
      });
      return detailWire(role);
    });
  }),

  statusRoute('activate', 'ACTIVE'),
  statusRoute('deactivate', 'DISABLED'),

  route('GET', '/api/v1/tenant/roles/:role_id/permissions', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'role.view');
    const role = findRole(access, context.params.role_id ?? '');
    sendJson(context.res, 200, pageOf(grantsOf(role), context.query));
  }),

  route('POST', '/api/v1/tenant/roles/:role_id/permissions', async (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'role.assign_permission');
    requirePermission(access, 'role.view');
    const role = findRole(access, context.params.role_id ?? '');
    const body = objectBody(await readBody(context.req), ['permission_code']);
    const code = stringField(body, 'permission_code', { required: true }) ?? '';
    sendIdempotent(
      context,
      body,
      () => {
        if (role.systemRole) throw immutable();
        if (!PERMISSIONS.some((entry) => entry.code === code)) {
          throw problem(404, 'resource_not_found', 'Permission not found.');
        }
        // Idempotent like the backend's grantPermission: a repeat returns the existing grant.
        if (!role.permissions.includes(code)) {
          role.permissions.push(code);
          role.grantedAt = { ...role.grantedAt, [code]: new Date().toISOString() };
          recordAuditEvent(context.state, access, {
            entityType: 'ROLE',
            entityId: role.id,
            action: 'role.assign_permission',
            reason: null,
          });
        }
        return grantsOf(role).find((grant) => grant.permission_code === code);
      },
      201,
    );
  }),

  route('DELETE', '/api/v1/tenant/roles/:role_id/permissions/:grant_id', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'role.remove_permission');
    requirePermission(access, 'role.view');
    const role = findRole(access, context.params.role_id ?? '');
    // The lookup runs inside `produce`, so a replay of a landed removal answers from the store
    // instead of missing the grant it already removed.
    sendIdempotent(context, {}, () => {
      const grant = grantsOf(role).find((candidate) => candidate.id === context.params.grant_id);
      if (!grant) throw problem(404, 'resource_not_found', 'Role permission not found');
      if (role.systemRole) throw immutable();
      role.permissions = role.permissions.filter((code) => code !== grant.permission_code);
      recordAuditEvent(context.state, access, {
        entityType: 'ROLE',
        entityId: role.id,
        action: 'role.remove_permission',
        reason: null,
      });
      // Contract §E.3: the remaining grants, page 0, size 100.
      return pageOf(grantsOf(role), new URLSearchParams({ page: '0', size: '100' }));
    });
  }),

  route('GET', '/api/v1/tenant/permissions', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'permission.view');
    const { query } = context;
    const q = query.get('q')?.toLowerCase();
    const risk = query.get('risk_level');
    const status = query.get('status');
    const rows = PERMISSIONS.filter(
      (entry) =>
        (!q || entry.code.includes(q) || entry.name.toLowerCase().includes(q)) &&
        (!risk || entry.risk === risk) &&
        (!status || status === 'ACTIVE'),
    );
    const ordered = orderBy(rows, PERMISSION_SORTS, query, { by: 'permissionCode', dir: 'ASC' });
    sendJson(context.res, 200, pageOf(ordered.map(permissionWire), query));
  }),

  route('GET', '/api/v1/tenant/role-assignments', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'role_assignment.view');
    const { query } = context;
    const rows = context.state.roleAssignments.filter(
      (row) =>
        row.organisationId === access.organisation.id &&
        Object.entries(ASSIGNMENT_FILTERS).every(([name, value]) => {
          const wanted = query.get(name);
          return wanted === null || value(row) === wanted;
        }),
    );
    // Newest first (contract §E.3); the fake keeps no assignment time, so reverse insert order.
    sendJson(context.res, 200, pageOf(rows.reverse().map(assignmentWire), query));
  }),

  route('POST', '/api/v1/tenant/role-assignments', async (context) => {
    const access = tenantAccess(context);
    const body = objectBody(await readBody(context.req), [
      'user_id',
      'role_id',
      'scope_type',
      'branch_id',
    ]);
    const userId = stringField(body, 'user_id', { required: true }) ?? '';
    const roleId = stringField(body, 'role_id', { required: true }) ?? '';
    const scope = stringField(body, 'scope_type', { required: true }) ?? '';
    const branchId = stringField(body, 'branch_id', { required: false });
    if (scope !== 'TENANT' && scope !== 'BRANCH') {
      throw problem(400, 'invalid_json', 'Malformed request body.');
    }
    if (scope === 'BRANCH') {
      // Source f74e44b: `requireNotNull(branchId)` runs before the service's 409 (BG-07).
      if (branchId === null) throw problem(500, 'internal_error', 'An unexpected error occurred.');
      // Contract §E.4: another branch while a branch is selected is a 404.
      if (access.claims.branchId !== null && access.claims.branchId !== branchId) {
        throw assignmentNotFound();
      }
    }
    requirePermission(access, 'user.assign_role', scope === 'BRANCH' ? 'branch' : 'tenant');
    sendIdempotent(
      context,
      body,
      () => {
        const { state } = context;
        const organisationId = access.organisation.id;
        const member = state.memberships.find(
          (candidate) => candidate.userId === userId && candidate.organisationId === organisationId,
        );
        if (!member) throw problem(404, 'resource_not_found', 'Membership not found.');
        if (member.status === 'REVOKED') {
          throw problem(409, 'conflict', 'The membership does not allow assignments.');
        }
        if (!state.roles.some((r) => r.id === roleId && r.organisationId === organisationId)) {
          throw roleNotFound();
        }
        if (scope === 'TENANT' && branchId !== null) {
          throw problem(422, 'invalid_operation', 'Invalid operation.');
        }
        const assignedThere = state.branchAssignments.some(
          (row) =>
            row.userId === userId &&
            row.branchId === branchId &&
            row.organisationId === organisationId &&
            row.status === 'ACTIVE',
        );
        if (scope === 'BRANCH' && !assignedThere) {
          throw problem(409, 'conflict', 'The user has no active assignment at this branch.');
        }
        // A repeat returns the existing row (source f74e44b: `activeRoleAssignment`).
        const existing = state.roleAssignments.find(
          (row) =>
            row.userId === userId &&
            row.roleId === roleId &&
            row.scopeType === scope &&
            row.branchId === branchId &&
            row.status === 'ACTIVE',
        );
        if (existing) return assignmentWire(existing);
        const created: FakeRoleAssignment = {
          id: randomUUID(),
          organisationId,
          userId,
          roleId,
          scopeType: scope,
          branchId,
          status: 'ACTIVE',
        };
        state.roleAssignments.push(created);
        recordAuditEvent(state, access, {
          entityType: 'USER_ROLE_ASSIGNMENT',
          entityId: created.id,
          action: 'user.assign_role',
          reason: null,
        });
        return assignmentWire(created);
      },
      201,
    );
  }),

  route('DELETE', '/api/v1/tenant/role-assignments/:assignment_id', (context) => {
    const access = tenantAccess(context);
    const row = context.state.roleAssignments.find(
      (candidate) =>
        candidate.id === context.params.assignment_id &&
        candidate.organisationId === access.organisation.id,
    );
    if (!row) throw assignmentNotFound();
    const branchScoped = row.scopeType === 'BRANCH';
    if (
      branchScoped &&
      access.claims.branchId !== null &&
      access.claims.branchId !== row.branchId
    ) {
      throw assignmentNotFound();
    }
    requirePermission(access, 'user.revoke_role', branchScoped ? 'branch' : 'tenant');
    requirePermission(access, 'role_assignment.view'); // read-back (BG-31)
    sendIdempotent(context, {}, () => {
      // Source f74e44b: revoking a REVOKED assignment is a no-op that still returns it.
      if (row.status === 'ACTIVE') {
        row.status = 'REVOKED';
        recordAuditEvent(context.state, access, {
          entityType: 'USER_ROLE_ASSIGNMENT',
          entityId: row.id,
          action: 'user.revoke_role',
          reason: null,
        });
      }
      // ponytail: summary fields only; the real API returns RoleAssignmentDetail and the UI
      // ignores the body (08's Ruling 14).
      return assignmentWire(row);
    });
  }),
];
```

- [ ] **Step 4: Add the `roles` scenario**

In `e2e/fake-api/scenarios.mts`, insert this block directly **above** the
`// \`satisfies\` (not a …`comment that precedes`const BUILDERS`, so that comment stays attached:

```ts
/** Layer 09 seed IDs (lane rules §5). The fake permission catalogue (routes/roles.mts) numbers
 * its own ids from …0100 in the same prefix. */
export const ROLE_SCENARIO_IDS = {
  grace: '09000000-0000-4000-8000-000000000001',
  graceMembership: '09000000-0000-4000-8000-000000000002',
  graceAtWestlands: '09000000-0000-4000-8000-000000000003',
  tom: '09000000-0000-4000-8000-000000000004',
  tomMembership: '09000000-0000-4000-8000-000000000005',
  tomAtHeadOffice: '09000000-0000-4000-8000-000000000006',
  teller: '09000000-0000-4000-8000-000000000007',
  opsSupervisor: '09000000-0000-4000-8000-000000000008',
  loansOfficer: '09000000-0000-4000-8000-000000000009',
  branchManager: '09000000-0000-4000-8000-00000000000a',
  compliance: '09000000-0000-4000-8000-00000000000b',
  graceTellerAtWestlands: '09000000-0000-4000-8000-00000000000c',
  tomTeller: '09000000-0000-4000-8000-00000000000d',
  janeCompliance: '09000000-0000-4000-8000-00000000000e',
} as const;

/** Real TENANT_ADMIN codes (contract §J), granted only in this scenario so `default` stays the
 * read-only gating scenario (e2e/roles.spec.ts "offers no mutations without the permissions"). */
const ROLE_ADMIN_CODES = [
  'role.create',
  'role.update',
  'role.activate',
  'role.deactivate',
  'role.assign_permission',
  'role.remove_permission',
  'user.assign_role',
  'user.revoke_role',
];

/**
 * Layer 09: a copy of `default` plus two staff members (Grace HOME at Westlands, Tom HOME at Head
 * Office), a second system role, and four custom roles (one DISABLED, one long-named). Grace holds
 * Teller at Westlands only and Tom holds it institution-wide. Jane holds the long-named role, so
 * she can revoke her own assignment and keep her access through TENANT_ADMIN.
 */
function rolesScenario(): RunState {
  const state = greenfieldTenant();
  const ids = ROLE_SCENARIO_IDS;
  const person = (id: string, username: string, displayName: string): FakeUser => ({
    id,
    username,
    email: `${username}@greenfield.example`,
    displayName,
    status: 'ACTIVE',
    keycloakSubject: `e2e-${username}`,
  });
  const staff = (id: string, userId: string): FakeMembership => ({
    ...membership(id, IDS.greenfield, userId),
    type: 'STAFF',
  });
  const custom = (
    id: string,
    code: string,
    name: string,
    permissions: string[],
    createdAt: string,
    overrides: Partial<FakeRole> = {},
  ): FakeRole => ({
    ...role(id, IDS.greenfield, code, name, permissions),
    systemRole: false,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  });
  return {
    ...state,
    users: [
      ...state.users,
      person(ids.grace, 'grace.achieng', 'Grace Achieng'),
      person(ids.tom, 'tom.kiprop', 'Tom Kiprop'),
    ],
    memberships: [
      ...state.memberships,
      staff(ids.graceMembership, ids.grace),
      staff(ids.tomMembership, ids.tom),
    ],
    branchAssignments: [
      ...state.branchAssignments,
      assignment(ids.graceAtWestlands, IDS.greenfield, ids.grace, IDS.westlands, 'HOME'),
      assignment(ids.tomAtHeadOffice, IDS.greenfield, ids.tom, IDS.headOffice, 'HOME'),
    ],
    roles: [
      ...state.roles.map((candidate) => ({
        ...candidate,
        permissions: [...candidate.permissions, ...ROLE_ADMIN_CODES],
      })),
      {
        ...role(ids.branchManager, IDS.greenfield, 'BRANCH_MANAGER', 'Branch manager', [
          'branch.view',
          'branch.suspend',
          'user.assign_branch',
          'business_date.view',
        ]),
        createdAt: '2026-07-01T08:05:00Z',
      },
      custom(
        ids.loansOfficer,
        'LOANS_OFFICER',
        'Loans officer',
        ['user.view'],
        '2026-07-20T08:00:00Z',
        {
          status: 'DISABLED',
          description: 'Retired with the old loans desk.',
        },
      ),
      custom(
        ids.teller,
        'TELLER',
        'Teller',
        ['business_date.view', 'branch.view'],
        '2026-08-01T08:00:00Z',
        {
          description: 'Front-desk cash and member service.',
        },
      ),
      custom(
        ids.opsSupervisor,
        'OPS_SUPERVISOR',
        'Operations supervisor',
        ['business_date.view', 'cob.start', 'business_date.advance'],
        '2026-08-10T08:00:00Z',
      ),
      // A long name: the 375 px a11y cases prove it never scrolls the page (index item 4).
      custom(
        ids.compliance,
        'COMPLIANCE',
        'Compliance, risk and internal audit reviewer for member savings and credit operations',
        ['audit.view'],
        '2026-08-20T08:00:00Z',
      ),
    ],
    roleAssignments: [
      ...state.roleAssignments,
      {
        ...tenantRoleAssignment(ids.graceTellerAtWestlands, IDS.greenfield, ids.grace, ids.teller),
        scopeType: 'BRANCH',
        branchId: IDS.westlands,
      },
      tenantRoleAssignment(ids.tomTeller, IDS.greenfield, ids.tom, ids.teller),
      tenantRoleAssignment(ids.janeCompliance, IDS.greenfield, IDS.jane, ids.compliance),
    ],
  };
}
```

Then append one entry as the **last** member of `BUILDERS`, after `branches: branchesScenario,`:

```ts
  // Layer 09 (roles).
  roles: rolesScenario,
```

The default order is `createdAt` DESC: Compliance, Operations supervisor, Teller, Loans officer,
Branch manager, then Tenant admin, which has `CREATED` `2026-07-01T08:00:00Z`. The name order is
Branch manager, Compliance…, Loans officer, Operations supervisor, Teller, Tenant admin. Task 8's
counts rely on both.

Run (form P) on `e2e/fake-api/routes/roles.mts e2e/fake-api/scenarios.mts e2e/fake-api/state.mts`:
`prettier --write`, then `eslint --max-warnings=0`. lint-staged skips `.mts`, but `pnpm check`
doesn't.

- [ ] **Step 5: Commit the routes and scenario** (form C)

`git add e2e/fake-api/state.mts e2e/fake-api/routes/roles.mts e2e/fake-api/scenarios.mts e2e/fake-api-roles.spec.ts`

```
test(fake-api): add role, permission catalogue, and role-assignment routes with a roles scenario

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

- [ ] **Step 6: Register the routes** (its own commit; the registry rule)

In `e2e/fake-api/server.mts`, add `import { roleRoutes } from './routes/roles.mts';` after the
`branchRoutes` import, and `...roleRoutes,` as the **last** entry of `routes`. Run form P on
`server.mts`.

Run (form E):
`e2e/fake-api-roles.spec.ts e2e/fake-api.spec.ts e2e/fake-api-access.spec.ts e2e/fake-api-profile.spec.ts`.
Expected: PASS. `fake-api.spec.ts`' "seeds independent, unshared fixtures" still holds, because
every `roles` row is built fresh per call.

`git add e2e/fake-api/server.mts` (form C):

```
test(fake-api): register the role routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 8: E2E, the accessibility matrix, and docs

**Files:**

- Create: `e2e/roles.spec.ts`
- Modify: `README.md`, `AGENTS.md`, `docs/backend-gaps.md`,
  `docs/superpowers/specs/2026-09-25-admin-prototype-parity-api-contract.md` (notes below the §E.3
  table only)

**Interfaces:**

- Consumes:
  - `enterAdmin(page, pathname, { heading, organisation?, branch? })`, `A11Y_CASES`,
    `applyA11yCase`, `expectA11yCaseApplied`, `expectNoSeriousOrCriticalViolations`
    (`e2e/support/admin.ts`, 07b);
  - `authenticate(context, testInfo, scenario?)`, `selectMuiOption(page, label, option)`
    (`e2e/support/auth.ts`);
  - `ROLE_SCENARIO_IDS` (Task 7) and the Tasks 3–6 DOM contract. That contract is:
    - the table "Roles", with header links Role/Code/Status, the searchbox "Search" and the
      selects "Status"/"Type";
    - the link "Create role", the fields "Role code"/"Role name", and the buttons "Create role" and
      "Save changes";
    - the tabs Permissions/Assignments/Audit, and the tables "Granted permissions" and
      "Role assignments";
    - the dialogs "Grant permissions" and "Assign this role", with "Search permissions", "Risk",
      "User", "Scope" and "Branch";
    - the aria-labels "Remove <name>" and "Revoke <user>'s <scope> assignment";
    - the toasts "Permissions granted", "Role assigned" and "Role deactivated".
- Produces: `e2e/roles.spec.ts`, and the layer's docs.

- [ ] **Step 1: Write `e2e/roles.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test';
import {
  A11Y_CASES,
  applyA11yCase,
  enterAdmin,
  expectA11yCaseApplied,
  expectNoSeriousOrCriticalViolations,
} from './support/admin';
import { authenticate, selectMuiOption } from './support/auth';
import { ROLE_SCENARIO_IDS } from './fake-api/scenarios.mts';

const ALL_BRANCHES = /All branches \(institution level\)/;
const COMPLIANCE =
  'Compliance, risk and internal audit reviewer for member savings and credit operations';

async function openDirectory(page: Page, branch: RegExp | null = ALL_BRANCHES) {
  await enterAdmin(page, '/admin/roles', { heading: 'Roles & permissions', branch });
}

async function openRecord(page: Page, name: string) {
  await page.getByRole('table', { name: 'Roles' }).getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15000 });
}

async function openTab(page: Page, tab: 'Permissions' | 'Assignments' | 'Audit') {
  await page.getByRole('tab', { name: tab }).click();
  await expect(page).toHaveURL(new RegExp(`/${tab.toLowerCase()}$`), { timeout: 15000 });
}

// Scoped to `main`, as in branches.spec.ts: a streamed route can briefly leave a hidden duplicate
// segment, and `getByRole('main')` only resolves the rendered, visible landmark.
const mainText = (page: Page, value: string | RegExp, options?: { exact?: boolean }) =>
  page.getByRole('main').getByText(value, options);
const rowsOf = (page: Page, table: string) =>
  page.getByRole('table', { name: table }).getByRole('row');

test.describe('roles', () => {
  // A roles route can be the first hit of its tree under a cold `next dev` compile.
  test.describe.configure({ timeout: 90000 });

  test('searches, filters, and sorts the directory through the URL', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'roles');
    await openDirectory(page);

    await expect(mainText(page, '6 roles')).toBeVisible();
    await expect(rowsOf(page, 'Roles')).toHaveCount(7);
    // Newest first by default (Ruling 2).
    await expect(rowsOf(page, 'Roles').nth(1)).toContainText(COMPLIANCE);

    await page.getByRole('searchbox', { name: 'Search' }).fill('tell');
    await page.getByRole('searchbox', { name: 'Search' }).press('Enter');
    await expect(page).toHaveURL(/q=tell/, { timeout: 15000 });
    await expect(rowsOf(page, 'Roles')).toHaveCount(2);

    // Wait for each cleared render (as branches.spec does): the next push builds on the rendered
    // query, and the sort headers' hrefs are server-built from it.
    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(mainText(page, '6 roles')).toBeVisible({ timeout: 15000 });
    await selectMuiOption(page, 'Type', /^System role$/);
    await expect(page).toHaveURL(/type=system/, { timeout: 15000 });
    await expect(rowsOf(page, 'Roles')).toHaveCount(3);

    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(mainText(page, '6 roles')).toBeVisible({ timeout: 15000 });
    await selectMuiOption(page, 'Status', /^Disabled$/);
    await expect(page).toHaveURL(/status=DISABLED/, { timeout: 15000 });
    await expect(rowsOf(page, 'Roles').nth(1)).toContainText('Loans officer');

    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(mainText(page, '6 roles')).toBeVisible({ timeout: 15000 });
    const byName = page.getByRole('columnheader', { name: 'Role', exact: true });
    await byName.getByRole('link').click();
    await expect(page).toHaveURL(/sortBy=roleName&sortDir=ASC/, { timeout: 15000 });
    await expect(byName).toHaveAttribute('aria-sort', 'ascending');
    await expect(rowsOf(page, 'Roles').nth(1)).toContainText('Branch manager');
    await byName.getByRole('link').click();
    await expect(page).toHaveURL(/sortDir=DESC/, { timeout: 15000 });
    await expect(rowsOf(page, 'Roles').nth(1)).toContainText('Tenant admin');
  });

  test('creates a role, grants from the grouped catalogue, and confirms a critical removal', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'roles');
    await openDirectory(page);

    await page.getByRole('link', { name: 'Create role' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Create role' })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('textbox', { name: 'Role code' }).fill('credit clerk');
    await page.getByRole('button', { name: 'Create role' }).click();
    await expect(
      mainText(page, 'Use 2–20 capital letters, digits, underscores or hyphens.'),
    ).toBeVisible();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Check Role code, Role name.',
    );

    await page.getByRole('textbox', { name: 'Role code' }).fill('CREDIT_CLERK');
    await page.getByRole('textbox', { name: 'Role name' }).fill('Credit clerk');
    await page.getByRole('button', { name: 'Create role' }).click();
    await expect(page).toHaveURL(/\/admin\/roles\/[0-9a-f-]{36}\/permissions$/, {
      timeout: 15000,
    });
    await expect(page.getByRole('heading', { level: 1, name: 'Credit clerk' })).toBeVisible();
    await expect(mainText(page, 'No permissions granted')).toBeVisible();

    await page.getByRole('button', { name: 'Grant permissions' }).click();
    const drawer = page.getByRole('dialog', { name: 'Grant permissions' });
    const search = drawer.getByRole('searchbox', { name: 'Search permissions' });
    await search.fill('business date');
    // Enter filters; it never submits the drawer.
    await search.press('Enter');
    await expect(drawer).toBeVisible();
    await drawer.getByRole('checkbox', { name: /^View business date/ }).check();
    await drawer.getByRole('checkbox', { name: /^Advance business date/ }).check();
    await search.fill('');
    await selectMuiOption(page, 'Risk', /^High$/);
    await drawer.getByRole('checkbox', { name: /^Start close of business/ }).check();
    await expect(drawer.getByRole('status')).toHaveText('3 selected');
    await drawer.getByRole('button', { name: 'Grant permissions' }).click();
    await expect(drawer).toBeHidden({ timeout: 15000 });
    await expect(page.getByRole('alert').filter({ hasText: 'Permissions granted' })).toBeVisible();
    await expect(rowsOf(page, 'Granted permissions')).toHaveCount(4); // header + 3

    await page.getByRole('button', { name: 'Remove Advance business date' }).click();
    const critical = page.getByRole('alertdialog');
    await expect(critical).toContainText('is a critical permission');
    await critical.getByRole('button', { name: 'Remove' }).click();
    await expect(critical).toBeHidden();
    // I3: the removed row's button unmounts, so focus falls back to the record title.
    await expect(page.getByRole('heading', { level: 1, name: 'Credit clerk' })).toBeFocused();
    await expect(rowsOf(page, 'Granted permissions')).toHaveCount(3);
  });

  test('edits a custom role, toggles its status, and keeps a system role read-only', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'roles');
    await openDirectory(page);
    await openRecord(page, 'Teller');

    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(page).toHaveURL(/\/edit$/, { timeout: 15000 });
    await expect(page.getByRole('textbox', { name: 'Role code' })).toHaveAttribute('readonly');
    await page.getByRole('textbox', { name: 'Role name' }).fill('Senior teller');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Senior teller' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page).toHaveURL(new RegExp(`/admin/roles/${ROLE_SCENARIO_IDS.teller}$`));

    await page.getByRole('button', { name: 'Deactivate', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: 'Deactivate', exact: true }).click();
    await expect(dialog).toBeHidden();
    // I3: the toggle's replacement takes focus.
    await expect(page.getByRole('button', { name: 'Activate', exact: true })).toBeFocused();
    await expect(page.getByRole('alert').filter({ hasText: 'Role deactivated' })).toBeVisible();
    // The hero chip and the Overview's Status row both say so.
    await expect(mainText(page, 'Disabled', { exact: true }).first()).toBeVisible();

    await page.getByRole('link', { name: 'Back to roles' }).click();
    await openRecord(page, 'Tenant admin');
    await expect(mainText(page, 'TENANT_ADMIN · System role')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Deactivate|Activate)$/ })).toHaveCount(0);
    await openTab(page, 'Permissions');
    await expect(mainText(page, /System roles are immutable/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Grant permissions' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
  });

  test('explains a missing branch assignment, assigns at the right branch, and revokes', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'roles');
    await openDirectory(page);
    await openRecord(page, 'Teller');
    await openTab(page, 'Assignments');
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(3, { timeout: 15000 }); // header + 2

    await page.getByRole('button', { name: 'Assign role' }).click();
    const drawer = page.getByRole('dialog', { name: 'Assign this role' });
    await drawer.getByRole('combobox', { name: /^User/ }).fill('tom');
    await page.getByRole('option', { name: /Tom Kiprop/ }).click();
    await selectMuiOption(page, 'Scope', /^One branch$/);
    // Tom is assigned at Head Office only (the `roles` scenario).
    await selectMuiOption(page, 'Branch', /^Westlands Branch/);
    await drawer.getByRole('button', { name: 'Assign role' }).click();
    await expect(drawer.getByRole('alert')).toContainText(
      'must already be assigned to that branch',
    );

    // The drawer kept the user, the scope and the key; only the branch changes for the retry.
    await selectMuiOption(page, 'Branch', /^Head Office/);
    await drawer.getByRole('button', { name: 'Assign role' }).click();
    await expect(drawer).toBeHidden({ timeout: 15000 });
    await expect(page.getByRole('alert').filter({ hasText: 'Role assigned' })).toBeVisible();
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(4);

    await page
      .getByRole('button', { name: "Revoke Tom Kiprop's institution-wide assignment" })
      .click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    // I3: the revoked row's button unmounts, so focus falls back to the record title.
    await expect(page.getByRole('heading', { level: 1, name: 'Teller' })).toBeFocused();
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(3);
  });

  test('warns before you revoke your own assignment (Review Focus 3)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'roles');
    await openDirectory(page);
    await openRecord(page, COMPLIANCE);
    await openTab(page, 'Assignments');

    await page
      .getByRole('button', { name: "Revoke Backend Jane Manager's institution-wide assignment" })
      .click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('This is your own assignment');
    await dialog.getByRole('button', { name: 'Revoke' }).click();
    await expect(dialog).toBeHidden();
    // Jane keeps TENANT_ADMIN, so the page survives her own revoke.
    await expect(mainText(page, 'Nobody holds this role')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { level: 1, name: COMPLIANCE })).toBeVisible();
  });

  test('offers only the selected branch for a branch-scoped assignment in a branch context', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'roles');
    await openDirectory(page, /Westlands/);
    await openRecord(page, 'Teller');
    await openTab(page, 'Assignments');

    await page.getByRole('button', { name: 'Assign role' }).click();
    await selectMuiOption(page, 'Scope', /^One branch$/);
    await page.getByRole('combobox', { name: 'Branch' }).click();
    // Contract §E.4: a BRANCH assignment at another branch would be a 404 here.
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option')).toHaveText('Westlands Branch (WESTLANDS)');
  });

  test('offers no mutations without the permissions', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo); // default: role reads only
    await openDirectory(page);

    await expect(
      page.getByRole('link', { name: 'Roles & permissions', exact: true }),
    ).toBeVisible(); // rail
    await expect(page.getByRole('link', { name: 'Create role' })).toHaveCount(0);
    await openRecord(page, 'Tenant admin');
    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
    await openTab(page, 'Permissions');
    // Default TENANT_ADMIN holds 18 codes: page 1 of 2 at the default size of 10.
    await expect(rowsOf(page, 'Granted permissions')).toHaveCount(11, { timeout: 15000 });
    await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
    await openTab(page, 'Assignments');
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(2, { timeout: 15000 }); // Jane
    await expect(page.getByRole('button', { name: 'Assign role' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Revoke/ })).toHaveCount(0);

    await page.goto('/admin/roles/new');
    await expect(page.getByRole('main').getByText("You don't have permission")).toBeVisible({
      timeout: 15000,
    });
  });

  test.describe('accessibility', () => {
    // Each case scans six pages and two drawers after /select-context (carried 90–120 s rule).
    test.describe.configure({ timeout: 120000 });

    for (const a11yCase of A11Y_CASES) {
      test(`has no serious or critical accessibility violations (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
        context,
        page,
      }, testInfo) => {
        await applyA11yCase(page, a11yCase);
        await authenticate(context, testInfo, 'roles');
        await openDirectory(page);
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);

        for (const [path, heading] of [
          ['/admin/roles/new', 'Create role'],
          // The edit form's read-only code field is its own surface.
          [`/admin/roles/${ROLE_SCENARIO_IDS.teller}/edit`, 'Teller'],
          [`/admin/roles/${ROLE_SCENARIO_IDS.compliance}`, /^Compliance, risk/],
          [`/admin/roles/${ROLE_SCENARIO_IDS.opsSupervisor}/permissions`, 'Operations supervisor'],
        ] as const) {
          await page.goto(path);
          await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
            timeout: 15000,
          });
          await expectA11yCaseApplied(page, a11yCase);
          await expectNoSeriousOrCriticalViolations(page);
        }

        await page.getByRole('button', { name: 'Grant permissions' }).click();
        await expect(page.getByRole('dialog', { name: 'Grant permissions' })).toBeVisible();
        await expectNoSeriousOrCriticalViolations(page);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'Grant permissions' })).toBeHidden();

        await page.goto(`/admin/roles/${ROLE_SCENARIO_IDS.teller}/assignments`);
        await expect(page.getByRole('heading', { level: 1, name: 'Teller' })).toBeVisible({
          timeout: 15000,
        });
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);
        await page.getByRole('button', { name: 'Assign role' }).click();
        await expect(page.getByRole('dialog', { name: 'Assign this role' })).toBeVisible();
        await expectNoSeriousOrCriticalViolations(page);
      });
    }
  });
});
```

Run (form E): `e2e/roles.spec.ts e2e/fake-api-roles.spec.ts`. Expected: PASS. Fix any failure at
its root, and never weaken an assertion or a scan. A serious or critical axe violation that a
frozen kit file causes is fixed by one additive, announced `refactor(kit):` commit, or escalated
when no additive fix exists (08's PF11).

- [ ] **Step 2: Document the layer**

`README.md`, in "Directory structure":

- Replace the three `admin/` lines that start
  `│   ├── admin/                 # Overview, Business date, Audit trail, and Branches pages; later`
  with:

  ```
  │   ├── admin/                 # Overview, Business date, Audit trail, Branches, and Roles &
  │   │                            # permissions pages; later layers add Approval queue, Users &
  │   │                            # access, and Settings as their own nav items (spec §8)
  ```

- Replace the `branches/` block (its three lines) with the same block, now a middle child, plus the
  new `roles/` entry:

  ```
  │   │   ├── branches/            # Branch directory (search, status/type filters, sortable headers),
  │   │   │                          # create draft (new/), and the record ([branchId]/: layout hero +
  │   │   │                          # lifecycle actions; Overview, Users, and Audit tabs)
  │   │   └── roles/               # Role directory (search, status/type filters, sortable headers),
  │   │                              # create (new/), and the record ([roleId]/: hero + Edit and
  │   │                              # Activate/Deactivate; Overview, Permissions, Assignments, and
  │   │                              # Audit tabs; edit/)
  ```

- In the `lib/` `api/` entry, change `bounded name/branch lookups` to
  `bounded name/branch/role lookups`.
- In the `modules/` `administration/` entry, replace its last two lines (`users/ holds tenant user
search for pickers` / `(modules/administration/users/)`) with:

  ```
  │                                # roles/ holds the role, permission-catalogue and role-assignment
  │                                # contract, list query, rules, service, Server Actions, and
  │                                # components (modules/administration/roles/); users/ holds tenant
  │                                # user search for pickers (modules/administration/users/)
  ```

- In the `components/` `data-display/` entry, change `ReasonDialog (07); AssignmentDrawer (08)` to
  `ReasonDialog (07); AssignmentDrawer (08); focusRecordTitle (09)`.

`README.md`, in the feature notes:

- Change "Administration currently ships the Overview, Business date, Audit trail, and Branches
  pages; Approval queue, Users & access, Roles & permissions, and Settings are built out" to
  "Administration currently ships the Overview, Business date, Audit trail, Branches, and Roles &
  permissions pages; Approval queue, Users & access, and Settings are built out". Keep the rest of
  that bullet.
- Insert this bullet directly after the Branches bullet (before "- The Platform Administration
  workspace"):

  ```md
  - Roles & permissions (`/admin/roles`, `modules/administration/roles/`) lists roles from
    `GET /tenant/roles`: code/name search, status and system/custom filters, and sortable
    Role/Code/Status headers. It creates and edits custom roles and activates or deactivates them.
    It grants permissions from the catalogue (search, risk filter, grouped by module, several per
    submit) and removes them after a confirmation. It also assigns or revokes the role institution-
    wide or at one branch. The record page renders Overview, Permissions, Assignments, and Audit
    tabs. Known limits:
    - The directory shows only what role summaries carry: no description, created date, or counts
      (`docs/backend-gaps.md` BG-09, BG-15). Its default order is newest first.
    - System roles are immutable (the backend answers 409), so their edit, status, and permission
      controls are hidden. They can still be assigned.
    - A grant submit carries up to 25 permissions. Each is its own write, with an idempotency key
      derived from the drawer's key, so a partial failure shows what landed and a retry replays
      it.
    - The catalogue (80 codes) and a role's granted set are each one bounded read of 100.
    - "Active assignments" counts assignments, not distinct users (BG-15).
    - A branch-scoped assignment needs the user's existing assignment at that branch, and a branch
      context offers only its own branch.
    - Assigning is offered only for ACTIVE roles. There is no role delete or archive (BG-27).
    - A description can be replaced but not removed (BG-09a).
    - The Audit tab shows the role's own changes. Assignment changes are audited per assignment
      (BG-16).
  ```

- Change "Administration's Branches above, other domain API modules (e.g. Users & access, Roles &
  permissions) are not connected yet." to "Administration's Branches and Roles & permissions
  above, other domain API modules (e.g. Users & access) are not connected yet."
- In "Next recommended implementation steps", item 2, change "(Approval queue, Users & access,
  Branches, Roles & permissions, Settings)" to "(Approval queue, Users & access, Settings)".

`AGENTS.md`, directly after the mutation bullet that ends "…loses the dialog's typed input and
idempotency key.", add:

```md
- When one submit fans out to several backend writes (granting several permissions), derive each
  write's `Idempotency-Key` from the form's minted key and the item (`grantKey` in
  `modules/administration/roles/role-actions.ts`), never a fresh random key, so a retry replays the
  writes that already landed.
```

`docs/backend-gaps.md`:

- Leave the Summary table as it is. A `BG-09a` row would widen the five-character ID column and
  re-pad the whole table (R4), and "; role update quirks (BG-09a)" would overflow the BG-09 row's
  98-character Gap cell. The controller adds the row at registration, under BG-09a's renumbered
  five-character ID (BG-33, unless another layer takes it first).
- In BG-07's Gap bullet, change "tenant codes; any invalid `sort_by`/`sort_dir`." to "tenant codes;
  any invalid `sort_by`/`sort_dir`; a BRANCH-scoped role assignment with no `branch_id`
  (`RoleAssignmentController`'s `requireNotNull`, source f74e44b; the contract's 409 is from
  7a7f4c3).", keeping the 100-column wrap.
- In BG-09's Gap bullet, after "tenant items lack currency, timezone, and bootstrap status.", add
  "Role items lack description and dates." In its Frontend handling bullet, after "lists show only
  what items carry", add "(the role directory shows role, code, type, and status only)".
- After BG-09's section, add:

  ```md
  ### BG-09a — Role update accepts a blank name; an empty description clears it · P2

  - **Gap:** `UpdateRoleRequest` has no `@NotBlank` (`iam/adapter/inbound/web/dto/RoleApiDtos.kt`),
    and `updateRole` sets every non-null field (`JooqIamAdministrationPersistence.kt`). So a blank
    `role_name` is stored and `""` replaces the description, while `null` keeps either field.
    Found by source reading at f74e44b; the contract (7a7f4c3) said the description can't be
    cleared. To be confirmed live.
  - **Frontend handling:** the edit form requires a name (1–100 characters) and sends `null` for a
    blank description, so a description can be replaced but not removed.
  - **Suggested change:** validate `role_name` as `CreateRoleRequest` does, and document whether
    `""` clears the description.
  ```

- In BG-27, insert "The roles page offers assignment only for ACTIVE roles and has no delete."
  before "Suggested:".

The contract doc, directly **below** the §E.3 table and above "### E.4". Add these lines only, so
the table isn't re-padded and lane Y's §E.3 edits union cleanly:

```md
Role endpoint notes (layer 09, from backend source at f74e44b; verify live at L2):

- `PATCH /tenant/roles/{id}`: `role_name` isn't validated, so a blank value is stored (BG-09a). A
  non-null `description`, `""` included, replaces the stored one; `null` keeps it.
- `DELETE /tenant/roles/{id}/permissions/{rpid}`: a system role is a 409. The grant lookup runs
  first, so a grant on another role is still a 404.
- `POST /tenant/roles/{id}/permissions`: repeating a grant returns the existing grant (no 409).
- `POST /tenant/role-assignments`: BRANCH scope with no `branch_id` reaches `requireNotNull`
  before the 409 guard, so it is a 500 (BG-07). A repeat returns the existing ACTIVE row as a 201.
- `DELETE /tenant/role-assignments/{id}`: revoking a REVOKED assignment is a no-op that returns
  it (200).
- Audit: role status changes write `role.activate`/`role.deactivate` on ROLE. Assignments write
  `user.assign_role`/`user.revoke_role` on `USER_ROLE_ASSIGNMENT`, keyed by the assignment id, so
  a role's own history doesn't include who was assigned it.
```

Run `pnpm exec prettier --write README.md AGENTS.md docs/backend-gaps.md docs/superpowers/specs/2026-09-25-admin-prototype-parity-api-contract.md e2e/roles.spec.ts`
under form T's flock prefix.

- [ ] **Step 3: Commit the spec** (form C)

`git add e2e/roles.spec.ts`

```
test(e2e): cover the role directory, create and grant, lifecycle, scoped assignments, and a11y

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

- [ ] **Step 4: Commit the docs** (form C)

`git add README.md AGENTS.md docs/backend-gaps.md docs/superpowers/specs/2026-09-25-admin-prototype-parity-api-contract.md`

```
docs(roles): document roles and permissions, derived grant keys, and the role source findings

BG-09a and the contract notes are from backend source reading (f74e44b); the L2 live check
confirms or corrects them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

This task ends at this commit. The gates, the visual and keyboard pass (the Gate checklist), the
ledger and integration belong to the workflow.

---

> **Stop here.** Task 8 ends at its Step 4 commit. Everything below this line is controller-only,
> and is not a requirement for any implementer or task reviewer. The task-brief extractor copies
> every line after the last task heading into Task 8's brief, which is why this fence exists.

## Controller live check (controller only; batch L2; not a task)

Only the controller in lane X runs this. It runs at live batch L2 (runbook §10: "the tip
containing 09 and 16"), on the `ap-integration` SHA that contains F_09. 09 is publishable only
after this check.

The signed-in identity must hold TENANT_ADMIN on the dev tenant the user names. local.admin lacks
`audit.view` (L0), so the Audit tab would be hidden for it. The user signs in on the remote
Keycloak **themselves**; the agent never types credentials.

**Set up** (runbook §10 procedure; it wins over lane rules §9's fd-lock line):

- `git status --short` is empty. Run `git rev-parse refs/heads/ap-integration`, then
  `git switch --detach <that SHA>`, so the evidence is tied to an integrated SHA.
- `ss -ltn` shows 3100 free. Start plain `pnpm dev` in the background: non-E2E mode, no fake-API or
  E2E env vars, the dev API through `.env.local`, with
  `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000` (L0's slow-network note).
- Don't hold the heavy lock for the batch. No X Playwright run while the server is up.
- Afterwards, stop the dev server, confirm 3100 is free, and `git switch` back.

**Reads** (no approval needed beyond the batch):

| Page / endpoint                                                                                                                      | Check                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/roles` (`GET /tenant/roles`)                                                                                                 | Dev's seeded system roles list. Expect TENANT_ADMIN, TENANT_AUDITOR, IAM_ADMIN, BRANCH_MANAGER, BRANCH_OPERATOR, ACCOUNTING_OPERATOR and ACCOUNTING_APPROVER per contract §J, plus any custom ones. Search by code and by name. Try each status and each type. Sort by **each** of Role, Code and Status in both directions: any 500 means allow-list drift, so record it in the contract. Paging works. The unsorted order is newest first. |
| A system role's Overview (`GET /tenant/roles/{id}`, `…/permissions?size=1`, `/tenant/role-assignments?role_id&status=ACTIVE&size=1`) | The description, the type "System role", and the immutable note. Check the permission and active-assignment counts against the tabs. No Edit or status control.                                                                                                                                                                                                                                                                              |
| Permissions (`…/permissions?page&size`, `GET /tenant/permissions?size=100&sort_by=permissionCode`)                                   | Grants show with catalogue names, modules and risks. The catalogue read returns all 80 codes (`has_next` false), so the drawer shows no truncation notice. Record each `module_code` value, including `accounting`, and note any that humanizes badly. The tab is newest grant first.                                                                                                                                                        |
| Assignments (`GET /tenant/role-assignments?role_id=…&status=ACTIVE`)                                                                 | Holders show with resolved names, scope, and branch (or "All branches").                                                                                                                                                                                                                                                                                                                                                                     |
| Audit (`GET /tenant/audit-events?entity_type=ROLE&entity_id=…`)                                                                      | The role's own events.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Grant drawer (a **custom** role only; skip if dev has none until mutation 1)                                                         | Open it. Search, the risk filter and the module groups work, and Enter in the search box doesn't submit. **Cancel** without submitting.                                                                                                                                                                                                                                                                                                      |
| Assign drawer                                                                                                                        | Open it, type in the user search, check that results appear, then **Cancel**. Switch the context to a single branch: "One branch" offers only that branch. Cancel.                                                                                                                                                                                                                                                                           |

**Mutations.** Ask before **each** one, and name what it permanently leaves on dev.

- Run every mutation at **All branches**, and only on a throwaway custom role. Never touch a system
  role's permissions or status (immutable; any attempt is a 409 at best).
- **Never revoke the signed-in user's own TENANT_ADMIN** assignment, or any assignment that is
  their only source of `iam.profile.read`, `auth.select_*` or `role.*`: that locks them out of dev.
- Grant only LOW-risk codes.

1. **Create the role** `ZZ09TEST`, "ZZ Test Role (09)", with a description. This is permanent:
   there is no role delete (BG-27). It lands on the Permissions tab.
2. **Grant two LOW codes in one submit** (`business_date.view`, `branch.view`).
   - Both grants appear, and the Audit tab shows two "Granted permission" events. That proves the
     derived per-code idempotency keys are accepted (canonical UUIDs).
   - Record each request ID.
3. **Remove one**, through its confirmation.
4. **Edit** the name to "ZZ Test Role (09) edited" and replace the description. A blank
   description is never sent as `""`.
5. **Assign** `ZZ09TEST`, institution-wide, to the signed-in user or the second administrator. It
   grants only the LOW code left. Then **revoke that same assignment**. Optionally repeat at one
   branch where that user holds a branch assignment, then revoke it.
6. **Deactivate** `ZZ09TEST` as cleanup. It stays on dev as DISABLED; record that.

The BG-07 claim (BRANCH without `branch_id` → 500) and the BG-09a claim (a blank name is stored,
`""` clears the description) have no UI path: the UI pre-validates them. Record them as "source
reading, not probed live". Never craft raw API calls with the user's session.

**Record:**

- Write one line per check in the runbook's form:
  `Live check (L2, <sha>): <endpoint/action> — <status/evidence> — passed|failed`. Include the
  request IDs of every mutation.
- **Never commit on `lane/09-roles` after F_09.** Park contract surprises (for the contract doc),
  backend defects (as layer-scoped `BG-09b…` for `docs/backend-gaps.md`) and code fixes in
  `RUN-STATE.md` for the next boundary.
- The controller lands them on `admin-parity/09-roles` through the runbook's cascade procedure,
  registering first (lane rules §7).

## Self-review

- **Spec §10.4 coverage.**
  - List: search (code, name), status, system/custom, and sorts by code, name and status (Tasks 1
    and 3). Created is the default order. Columns are role, code, type and status: description
    and created can't render (Ruling 2).
  - Create (`role.create`): the code pattern, name and description, then a redirect to the
    Permissions tab (Tasks 1–3).
  - Overview: the definition, plus permission and active-assignment counts (Task 4, Ruling 11).
  - Permissions: code, name, module, risk and granted at. The Grant drawer has search, a risk
    filter and module groups (`role.assign_permission`). Removal confirms CRITICAL grants
    (`role.remove_permission`) (Tasks 2 and 5, Rulings 5–7).
  - Assignments: holders with scope and branch. Assign through the user search plus TENANT/BRANCH
    (`user.assign_role`); revoke (`user.revoke_role`) (Tasks 2 and 6, Ruling 10).
  - Audit (Task 4). Edit and Activate/Deactivate are custom-only; system roles are labelled
    immutable with their controls hidden (Tasks 1 and 4, Rulings 8–9).
- **Ownership (lane rules §3).**
  - `getRoleIndex` (Task 1) and the role-assignment contract (Tasks 1, 2 and 6) are pinned under
    Produces with ★.
  - No 07, 07b or 08 file is modified. The kit plans no `refactor(kit):` commit. 08's
    `focusRecordTitle` copy is left to a boundary (Ruling 15).
- **Shared registries.** Navigation (Task 3, Step 7) and `server.mts` (Task 7, Step 6) each get one
  commit. `TENANT_ADMIN_PERMISSIONS`, StatusChip `TONES` and the audit vocabulary are untouched: the
  role actions are already in `AUDIT_ACTIONS`, and LOW, TENANT and BRANCH fall back to the neutral
  tone.
- **Later layers.**
  - 10 reuses `listRoleAssignments({ userId })`, `assignRole`/`revokeRoleAssignment` with
    `roleId` as the visible field, `RoleScopeFields`, `RevokeRoleAssignmentButton` and
    `getRoleIndex` (names, ACTIVE-role pickers).
  - 11 reuses `getRoleIndex` (ACTIVE roles) and `ROLE_SCOPE_TYPES`.
  - 12 reuses `listRoleAssignments({ userId })` and `getRoleIndex`.
  - 16/17 run in the platform context, which the tenant role routes reject, so they can consume
    only the contract's types and enums (open question).
- **Standing rulings.**
  - I2: every `ConfirmDialog`, `AssignmentDrawer` and `RoleForm` carries `contextOrganisationId`,
    pinned in each surface's component test: `RoleForm` (Task 3), `RoleLifecycleActions` (Task 4),
    `GrantPermissionsButton` and `RemovePermissionButton` (Task 5), and `AssignRoleButton` and
    `RevokeRoleAssignmentButton` (Task 6).
  - I3: Task 4's toggle and Tasks 5–6's unmount fallbacks, pinned in unit tests and E2E.
  - The Chip-icon rule: label-only server chips, and `FormControlLabel` built client-side.
  - Seed prefix 09, pagination, one h1, the axe matrix, erasable `.mts`, no packages.
- **Placeholders.** Every code step holds complete code. Every command has its form. Every commit
  has its message.
- **Type consistency.**
  - `RoleDraftValues` is shared by `roleDraftSchema` and `roleEditFormSchema`.
  - `RolePermissionRow.risk` is `PermissionRiskLevel | null`.
  - `RoleAssignmentRow.scopeType` is `RoleScopeType`.
  - `getPermissionCatalogue()` resolves to `Page<Permission> | null`, used with `.items` and
    `.page.hasNext`.
  - `BranchOption` feeds both `RoleScopeFields` and `AssignRoleButton`.
  - The fake's `grantedAt?` is optional everywhere.
- **Risks the gate should watch.**
  - Sequential grant writes make the drawer pending for about 25 × the backend latency at the cap.
  - The zod 4 `.refine` on `assignInput` reports the branch error only once the other fields
    parse.
  - The Permissions tab issues about 6 reads: the role (cached), `/auth/me`, the grants, the
    catalogue, `GET /tenant`, and the granted set.
