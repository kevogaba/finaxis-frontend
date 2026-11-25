# bg-adopt 09 — Retire the branch-pinning workarounds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** A selected branch no longer pins administration (BG-03, platform #154/#242).

- Tenant-wide holders act on any branch whatever branch is selected.
- Branch-scoped holders get a Forbidden state, not a raw error.
- Single-branch users can choose All branches.
- Every "switch to All branches" detour goes.

**Architecture:**

- `selectBranch` accepts `null` and sends `{"branch_id": null}`.
- The context switcher offers All branches to anyone holding `auth.select_branch`.
- The guided states and the client-side refusals keyed on a selected branch are deleted.
- Assignment searches pass `branch_id` or `user_id` explicitly.
- The fake API checks the target branch the way the platform does.

**Spec:** [§8 entry 09](../specs/2026-11-24-backend-gap-adoption-design.md#09--branch-context)
· designs `#d-context` · register BG-03.

## Wire facts (platform `6a8ea28`)

- **Target-aware checks.** Every branch read, transition, assignment and BRANCH-scope role action
  checks the permission on the **target** branch: a tenant-wide grant, or a grant on that branch.
  - A branch-scoped caller gets 403 (never 404) for another branch. A tenant-wide holder gets 404
    for an unknown id.
  - A branch-scope grant counts only while its branch is ACTIVE.
  - DRAFT and PENDING_APPROVAL branches are reachable only by tenant-wide holders. They can't be
    selected.
- **`POST /auth/select-branch`**
  - `{}` or `{"branch_id": null}` clears the branch for any user holding `auth.select_branch` at
    tenant scope, with an ACTIVE membership in an ACTIVE organisation.
  - `""` is rejected (strict UUID).
  - The response mirrors `select-organisation` with `branch_id: null`. Check `AuthController.kt` and
    `SelectBranchResponse` in the platform for the exact shape.
- **Sign-in** still auto-selects a single branch.
- **`GET /tenant/branch-assignments`** honours an explicit `branch_id`. A `user_id` search ignores
  the selected branch. A search with neither defaults to the selected branch.

## Tasks

### Task 1: Clearing the branch

- **Selection:** `auth/context-service.ts` changes to `selectBranch(branchId: string | null)`.
  `auth/context-contract.ts`'s `selectBranchResponseSchema` gets a nullable `branch_id` if the
  platform answers null.
  - `app/api/context/branch/route.ts` and `components/context/context-api.ts` pass `null` for "All
    branches".
- **Switcher:** `components/context/*` (`context-selection-form.tsx`, `use-context-selection.ts`) and
  `components/shell/app-switcher.tsx` offer "All branches" to any user with `auth.select_branch`,
  single-branch users included.
- **Cleanup:** delete `ALL_BRANCHES_UNAVAILABLE` and the `switch-to-all-branches-button.tsx`
  re-select-organisation workaround (it now calls `selectBranch(null)`), or the button entirely if
  nothing still needs it.
- **Fake API:** `routes/auth.mts` `select-branch` accepts `null` or an absent `branch_id` (clears),
  and rejects `""` with 400 `invalid_json` as the platform does.
- **Tests:** unit tests, `e2e/context.spec.ts` (a single-branch user switches to All branches and
  back), `e2e/fake-api-*.spec.ts` for select-branch.

### Task 2: Branch pages and the approval queue stop refusing

- **Delete:**
  - `BRANCH_CONTEXT_CODE` and `BRANCH_CONTEXT_REFUSAL` (`approval-copy.ts`), and their use in
    `branch-activation-actions.ts`;
  - `branchQueueContextNote` and the note on `(queue)/branches/page.tsx`;
  - `branchContextHint` in `approval-notifications.ts`, and the bell's hint;
  - the overview pending-approvals card's `branchSelected`/`canSwitch` note;
  - `BranchContextState` in `components/.../forbidden-state.tsx`;
  - the guided state in `app/(authenticated)/admin/branches/[branchId]/layout.tsx` and
    `app/(authenticated)/admin/approvals/branches/[branchId]/page.tsx`.
- **403:** a branch record answering 403 renders `ForbiddenState` (not `ErrorState`).
- **Target-branch gates:** `canActOnBranch(holder, codes, branch, selectedHere)` in
  `branch-rules.ts` takes a tenant-wide grant, or one at the target when it is the selected, ACTIVE
  branch (a branch-scope grant counts only while its branch is ACTIVE, #242). Submit, Activate and
  the other transitions, assignment and revoke gates, and the approval page use it; the queue, the
  bell and the overview card gate tenant-wide.
  **As built:** that rule was too strict. The platform runs two independent checks: the route's
  own `@PreAuthorize` over `effectivePermissions(membership, selected branch)` (the route's code
  alone; tenant-wide only at All branches), then the service's target check of the code and every
  view it implies, through `branchIdsGranting`, which doesn't depend on the selection. So
  `PermissionHolder` keeps the BRANCH scopes' `branch_ids` (`branchPermissions`),
  `canAllAtBranch(holder, codes, branchId)` is the target check, `canActAtBranch(holder, code,
branchId, routeCodes?)` adds the route gate, and `canActOnBranch(holder, code, branch,
routeCodes?)` passes `null` for a branch that isn't ACTIVE. `selectedHere` stays only for the
  "choose a working context again" copy. A role held at A and B acts on B with A selected, and on
  neither at All branches. Institution-scope role assignment needs `user.assign_role` and its view
  tenant-wide, so `RoleScopeFields` disables it otherwise. `GET /branches` and
  `GET /tenant/role-assignments` are target-aware in the fake API as on the platform: the
  directory, the invite and assign-branch pickers and the parent picker say "Only branches you can
  view are shown." for a branch-scoped `branch.view`, the role lists and counts say theirs, and the
  overview reads branch counts only with `branch.view` tenant-wide (otherwise the item can't be
  checked), so a branch-scoped list is never shown as institution totals. The fake's route gate
  (`requireAuthority`) checks only the route's code in the selected context, as `@PreAuthorize`
  does, refusing with the generic `forbidden`; its target check names the first missing code.
  `/select-context` sends no select-branch for All branches when select-organisation already left
  `branch_id: null` (clearing needs `auth.select_branch` tenant-wide).
- **Tests:** RTL and page tests updated; e2e:
  - with a branch selected, a tenant-wide approver opens another branch and activates it;
  - a branch-scoped user gets the Forbidden state on another branch.

### Task 3: Explicit assignment searches

- **Tenant-wide searches:** every `GET /tenant/branch-assignments` call passes `branch_id` (branch
  record Users tab) or `user_id` (user record). The user record's scan
  (`modules/administration/users/user-service.ts` `listUserBranchAssignments`) passes `user_id`
  now. PR 16 replaces the scan itself.
- **Branch-context note:** remove the user record's `branchContextNote`, now true only for
  branch-scoped holders, for tenant-wide holders. Keep a short note when the caller's
  `branch_assignment.view` is branch-scoped only, using the `permission_scopes` from PR 04.

### Task 4: The fake API is target-aware

- **Branch routes** (`routes/branches.mts`): reads, transitions and assignment routes check the
  permission on the target branch.
  - `reachableBranch`'s 404-for-any-other-branch becomes 403 for a branch-scoped caller without that
    branch, and 404 only for an unknown id.
  - DRAFT and PENDING_APPROVAL branches are only for tenant-wide holders.
- **Assignment search** honours `branch_id` and `user_id`, as above.
- **Specs:** `e2e/fake-api-branches.spec.ts` and `e2e/fake-api-approvals.spec.ts` (the old 404s).

### Task 5: Gates, docs, commit

- [x] Run `pnpm check` and the full e2e suite: green.
- [x] Register: BG-03 → **Closed** (frontend #NN), with its "Still open" kept (sign-in auto-select,
      draft branches not selectable).
- [x] Contract: §C `select-branch` (null clears), §E.4 (target-aware, 403).
- [x] Commit `feat(context): retire the branch-pinning workarounds`.
