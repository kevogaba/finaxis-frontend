# Administration Prototype Parity — Handoff for the Remaining Layers

> **For the next session.** This document hands over the unfinished half of the administration prototype
> parity work. Read it with the spec and the API contract, which are published in
> [#39](https://github.com/kevogaba/finaxis-frontend/pull/39):
> `docs/superpowers/specs/2026-09-25-admin-prototype-parity-design.md` and
> `docs/superpowers/specs/2026-09-25-admin-prototype-parity-api-contract.md`. The backend gaps register
> ([`docs/backend-gaps.md`](../../backend-gaps.md)) sits next to this file. The ready plans for layers 09 and
> 16 sit in this folder.

**State date:** 2026-10-02. **Trunk:** `main`. **Published stack:** GitHub stack #49 (draft PRs).

## 1. Where things stand

### 1.1 Published and reviewed

| PR                                                          | Layer | Branch                          | Title                                                                   |
| ----------------------------------------------------------- | ----- | ------------------------------- | ----------------------------------------------------------------------- |
| [#38](https://github.com/kevogaba/finaxis-frontend/pull/38) | 00    | `admin-parity/00-deps`          | chore(deps): bump up minor and patch dependencies across the project    |
| [#39](https://github.com/kevogaba/finaxis-frontend/pull/39) | 01    | `admin-parity/01-docs`          | docs: add the admin prototype parity spec, contract, gaps, and plans    |
| [#40](https://github.com/kevogaba/finaxis-frontend/pull/40) | 02    | `admin-parity/02-theme`         | feat(theme): port the prototype's tokens, type scale, and density       |
| [#41](https://github.com/kevogaba/finaxis-frontend/pull/41) | 03    | `admin-parity/03-fake-api`      | test(e2e): replace the in-app backend fake with a standalone fake API   |
| [#42](https://github.com/kevogaba/finaxis-frontend/pull/42) | 04    | `admin-parity/04-shell`         | feat(shell): rebuild the app shell to match the prototype               |
| [#43](https://github.com/kevogaba/finaxis-frontend/pull/43) | 05    | `admin-parity/05-context`       | feat(context): support All branches and switch context from the app bar |
| [#44](https://github.com/kevogaba/finaxis-frontend/pull/44) | 06    | `admin-parity/06-audit`         | feat(audit): add the audit trail with filters and an event drawer       |
| [#45](https://github.com/kevogaba/finaxis-frontend/pull/45) | 07b   | `admin-parity/07b-record-kit`   | feat(kit): add the shared record-page kit                               |
| [#46](https://github.com/kevogaba/finaxis-frontend/pull/46) | 07    | `admin-parity/07-business-date` | feat(business-date): add the business date page and Server Actions      |
| [#47](https://github.com/kevogaba/finaxis-frontend/pull/47) | 15    | `admin-parity/15-profile`       | feat(profile): replace the profile card with a tabbed account profile   |
| [#48](https://github.com/kevogaba/finaxis-frontend/pull/48) | 08    | `admin-parity/08-branches`      | feat(branches): add the branch directory, record, and assignments       |
| [#50](https://github.com/kevogaba/finaxis-frontend/pull/50) | 13    | `admin-parity/13-settings`      | feat(settings): add tenant settings with read-only controls and reset   |

- **One commit per PR.** Each PR is one conventional, GPG-signed commit, and GitHub shows each as Verified. The stack
  is in integration order, because two build lanes ran in parallel: 00–06, 07b, 07, 15, 08, 13.
- **Gates.** Each layer was integrated only after `pnpm check`, `pnpm build`, the full Playwright suite against the
  fake API, and a visual and accessibility pass: light and dark, 1440 and 375 px, with no serious or critical axe
  violations. CI ("Verify") is green on all twelve.
- **Codex review.** The connector reviewed every PR, and all 48 comments are answered in their own threads and
  resolved:
  - **20 fixed** in the layer that owns the code;
  - **28 explained:** by-design, already handled, documentation only, or deferred to a named layer or backend gap.

  Two of the fixes changed visible design and the toolchain:
  - outlined fields and secondary buttons gained a 3:1 control-border token;
  - Node is pinned to 24.19.0 (`engines` >=24.15.0) for jsdom 30.

- **Screenshots.** Captured against the fake API, they live on the orphan branch `pr-assets/admin-parity`. The PR
  bodies pin them by commit SHA.

## 2. The remaining layers at a glance

| Layer                                  | Spec        | Depends on                               | Plan                                                                                                            | Gaps that shape it most                  |
| -------------------------------------- | ----------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 09 Roles & permissions                 | §10.4       | 08                                       | **in progress** (Tasks 1–4 done, Task 5 in review)                                                              | BG-27, BG-15, BG-07                      |
| 16 Platform — institutions             | §11.1–§11.2 | 08 (its plan consumes nothing from 10)   | **ready**: [`2026-10-01-admin-parity-16-platform-tenants.md`](./2026-10-01-admin-parity-16-platform-tenants.md) | BG-29, BG-14, BG-18, BG-24, BG-28, BG-06 |
| 10 Users — directory & record          | §10.5       | 09                                       | to write (JIT)                                                                                                  | BG-09, BG-08, BG-11, BG-17, BG-28        |
| 17 Platform — records, users, overview | §11.2–§11.4 | 16                                       | to write (JIT)                                                                                                  | BG-10, BG-18, BG-15                      |
| 12 Approvals & notifications           | §10.6, §8   | 10, 08                                   | to write (JIT)                                                                                                  | BG-01, BG-08, BG-22, BG-15               |
| 11 Users — invite wizard               | §10.5       | 10, and 16's Stepper and wizard scaffold | to write (JIT)                                                                                                  | BG-07, BG-02, BG-11, BG-25               |
| 14 Overview                            | §10.8       | 12, 13                                   | to write (JIT)                                                                                                  | BG-15, BG-21                             |

**Order.** The table is in the integration order fixed by the parallel-lane rules: 09 → 16 → 10 → 17 → 12 → 11 → 14.
It differs from spec §13's table for two reasons:

- 16 owns the Stepper overrides and the wizard scaffold (moved from 11), so 11 follows 16;
- 17 owns `KpiTile` and the platform notifications badge (moved from 12).

With two lanes:

- lane A: finish 09, then 10 → 12 → 11 → 14;
- lane B: 16 → 17.

11 waits for 16 to integrate, and 14 comes last. Before 16 starts, its pre-flight must check its plan against the
then-current tip:

- 08's ReasonDialog `tone` is in;
- 09 adds `components/data-display/focus-record-title.ts`;
- 13's `settings-rules.ts` option helpers could be reused for 16's initial settings;
- if 10 has landed, reuse its username and E.164 validators.

## 3. Standing rules for every remaining layer

These are on top of `AGENTS.md`, which binds everything.

1. **Cross-tab guard.** Every `ReasonDialog`/`ConfirmDialog` passes `contextOrganisationId` from the page's resolved
   context. `runServerAction` rejects a submit with `context_changed` when another tab switched organisation.
2. **Frozen kit.** The 06/07b/07/08 kit and the theme take only additive `refactor(kit)`/`fix(kit)` changes, each
   announced in the layer's notes. No breaking prop changes.
3. **No pre-built elements from Server Components into MUI `isValidElement` props** (Chip
   `icon`/`avatar`/`deleteIcon`). Build them in a small client component that takes only primitives.
4. **Focus after a status change** follows 07's pattern. Focus goes to the toggled control, or to the record title via
   the shared focus helper.
5. **Fake-API seeds.** Each layer seeds IDs under its own prefix (`NN000000-0000-4000-8000-…`). Never mutate
   `greenfieldTenant()`'s existing collections. Extend `platformOperator()`; don't mutate it.
6. **Conflicts between layers** in `e2e/fake-api/scenarios.mts` (`BUILDERS`), the README module tree and features,
   and the navigation registry resolve by **union**.
7. **Lists are server-paginated**, with state in the URL. The only exceptions:
   - the bounded lookup indexes, at most 5 pages × 100 (for example `getRoleIndex`);
   - the exceptions named in `AGENTS.md`: context selection, the platform directory, the profile's assigned
     branches, and the settings catalogue.
8. **Settings editing stays disabled** (`SETTINGS_EDIT_ENABLED = false`) until a `settings.update` identity probes
   `PUT` live (BG-04). Reset stays available.
9. **Live checks.**
   - Only a person signs in. Automation never types credentials.
   - Reads come first, and every mutation is approved one at a time.
   - The dev business date is never advanced.
   - Branch close, tenant approve, invitations and membership revoke are irreversible: approve each one separately.
10. **A plan's trailing "Controller live check" and "Self-review" sections** belong to the controller and the gate
    phase, never to implementers.

## 4. The remaining layers in detail

> **Reading guide for the per-layer sections**
>
> - Sources, in order: the design spec (`docs/superpowers/specs/2026-09-25-admin-prototype-parity-design.md`), the API contract (same folder, `…-api-contract.md`), `docs/backend-gaps.md`, `README.md`, `AGENTS.md`. Plans exist for 09 and 16; the other layers are written just in time from the spec.
> - State tags: `[wip]` = built on the unpublished branch `lane/09-roles`, not in the published stack; `[plan]` = described in a plan file, not built; `(proposed)` = suggested by this handoff for a layer with no plan yet; untagged = exists in the published stack (checked against the code).
> - Sections follow layer number. The stack order recorded in the parallel-lane rules (`docs/superpowers/plans/2026-09-27-admin-parity-parallel-lanes.md`, published in [#45](https://github.com/kevogaba/finaxis-frontend/pull/45)) §1 is 09 → 16 → 10 → 17 → 12 → 11 → 14. Layer 11 consumes 16's `WizardForm` and Stepper theme, so building 09 → 10 → 11 literally stalls 11. Plan 16 needs only 08, the kit and 09's types, which supersedes spec §13's "16 depends on 10".
> - Live checks: reads first, a person signs in interactively on the dev identity provider (tooling never types credentials), every mutation needs its own approval, and the dev business date is never advanced. Spec §12 makes a live read check a gate for each layer.
> - Axe: `A11Y_CASES` in `e2e/support/admin.ts` is light and dark × 1280×800 and 375×812. The manual visual and keyboard pass uses 1440 and 375.
> - Layer-scoped gap IDs such as `BG-09a` get a plain number when they are added to the summary table of `docs/backend-gaps.md`. The next free ID there is BG-34.

### Layer 09 — Roles & permissions

#### Goal and scope

Spec §10.4 (with §6.3 `getRoleIndex`, §6.6 hidden `.view` requirements, §9 list and record patterns): the `/admin/roles` directory, a create form, and a four-tab record (Overview, Permissions, Assignments, Audit) with Edit and Activate/Deactivate for custom roles. System roles are read-only and labelled immutable.
The layer also owns what later layers consume: `getRoleIndex` `[wip]` and the role-assignment contract (schemas, `listRoleAssignments`, the `assignRole` and `revokeRoleAssignment` actions, `RoleScopeFields`, `RevokeRoleAssignmentButton`) for 10, 11 and 12. Roles are never branch-restricted (contract §E.4), so no guided branch state applies.
09's own new names in this section (the roles module, its routes, `getRoleIndex`, `focusRecordTitle`) are `[wip]` on `lane/09-roles`, except the Task 6–8 items (`RoleScopeFields`, `AssignRoleButton`, `RevokeRoleAssignmentButton`, `RoleAssignmentsTable`, the Assignments route, the roles fake routes and scenarios, `e2e/roles.spec.ts`), which are `[plan]`. Names from earlier layers are published.

#### Routes and permissions

| Route                               | Permission (UI gate)                                                                                                                                   | Notes                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `/admin/roles`                      | `role.view` (nav item). Create needs `role.create` + `role.view`                                                                                       | Directory. A 403 on the read renders `ForbiddenState`                                              |
| `/admin/roles/new`                  | `role.create` + `role.view`                                                                                                                            | RHF form; success redirects to the new role's Permissions tab                                      |
| `/admin/roles/[roleId]`             | `role.view`                                                                                                                                            | Overview. Permission count needs `role.view`; active-assignment count needs `role_assignment.view` |
| `/admin/roles/[roleId]/edit`        | `role.update` + `role.view`                                                                                                                            | Custom roles only; a system role shows `ForbiddenState` with the immutable note                    |
| `/admin/roles/[roleId]/permissions` | `role.view`. Grant adds `role.assign_permission` + `permission.view`; Remove needs `role.remove_permission`                                            | Always shown. Catalogue unreadable → names and risks fall back to the code and "—"                 |
| `/admin/roles/[roleId]/assignments` | Tab shown with `role_assignment.view`. Assign: `user.assign_role` + `user.view`, ACTIVE role only. Revoke: `user.revoke_role` + `role_assignment.view` | `[plan]` Task 6                                                                                    |
| `/admin/roles/[roleId]/audit`       | Tab shown with `audit.view`                                                                                                                            | One view: `ROLE` / role id                                                                         |

#### Screens and behaviour

- **Directory.** Columns Role (name link), Code, Type (System or Custom role), Status. Filters: search (code or name, committed on Enter or blur, 100-character cap), Status, Type (`system`/`custom`, sent as `system_role`). Sort: Role (`roleName`), Code (`roleCode`), Status (`status`) as server-built header links with pending indicators; Type is not sortable. Default `createdAt` DESC with no Created column, because `RoleSummary` carries no `created_at`. 10 rows per page, URL state through `useListNavigation`, no row hover. Empty: "No roles" or "No roles match these filters."
- **Create and edit** (`RoleForm`, React Hook Form + zod, shared): code `^[A-Z0-9_-]{2,20}$` (read-only on edit), name 1–100, description ≤ 500, an error summary `Alert` plus field errors. A failed submit keeps the typed values and the idempotency key. A blank description is sent as `null`, which keeps the stored one (source reading says `""` would clear it, BG-09a). Create redirects to `/admin/roles/{id}/permissions`; edit calls `refresh()` and then redirects to the record root.
- **Record.** `RecordHero` (icon avatar, role name as the only h1, subtitle `CODE · System role|Custom role`, status chip) with Edit and one status toggle. Activate/Deactivate use `ConfirmDialog` with a `{}` body; Deactivate has error tone and warns a holder (the role is listed in `/auth/me`). The dialog is keyed by the action, so it unmounts when the toggle flips. A system role hides every mutation control; Overview and Permissions say why, and assignment stays available.
- **Overview.** Role name, code, description, type, status, permission count, "Active assignments" (assignments, not distinct users: one user can hold a role at several scopes), created and updated in the organisation time zone, copyable role ID.
- **Permissions tab.** Table Code, Name, Module, Risk, Granted at: server-paginated, newest first, names and risks from the cached 80-code catalogue. **Grant drawer** (`AssignmentDrawer`): search, Risk filter, the ACTIVE codes the role lacks grouped by module as checkboxes, an "N selected" status, a 25-code cap, and a truncation note when the catalogue read hits its 100 ceiling. Enter in search never submits, and Escape in a non-empty search clears it without closing the drawer (Escape closes the drawer when idle, never while a submit is pending). One submit posts the codes sequentially with per-code derived idempotency keys; a partial failure refreshes and reports "N of M granted" and keeps the selection for the retry. **Remove** uses `ConfirmDialog` for every grant; a CRITICAL grant (or one of unknown risk) uses error tone, `alertdialog` and an explicit warning.
- **Assignments tab** `[plan]`. Table User (name via `getTenantUser`), Scope (Institution or Branch), Branch; ACTIVE only, server-paginated. **Assign drawer**: `UserPicker` + `RoleScopeFields` (Scope: "Institution (all branches)" or "One branch"; Branch select shown only for one-branch scope). BRANCH scope requires a branch (native `required` plus server zod) and is never sent with a null `branch_id`; TENANT always sends `branch_id: null`. In a branch-selected context only that branch is offered; with no readable branch, branch scope is disabled. A 409 names the "user must already hold an active assignment at that branch" guard first. **Revoke** uses `ConfirmDialog` and warns before you revoke your own assignment.
- **Focus.** After Deactivate focus lands on Activate (and the reverse). After a removal or revoke unmounts its row, focus moves to the record title through `focusRecordTitle` (`components/data-display/focus-record-title.ts` `[wip]`). Every dialog, drawer and form passes `contextOrganisationId`, so a submit after an organisation switch in another tab is refused with `context_changed`.
- **Maker-checker.** None for roles. The backend has no self-lockout guard, so the two risky actions (revoking your own assignment, deactivating a role you hold) warn in their confirmation copy instead of blocking.
- **States.** The record layout renders `ForbiddenState` or `ErrorState` through `load()` (a user who revoked their own `role.view` lands there, not on an error page). Empty tabs read "No permissions granted" and "Nobody holds this role".

#### Wire endpoints

| Method and path                                        | Permission / scope                                   | Quirks                                                                                                                                                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET `/tenant/roles`                                    | `role.view`                                          | `q` (code, name), `status`, `system_role`, `sort_by` ∈ roleCode, roleName, status, createdAt (anything else is a 500), default createdAt DESC                                                          |
| POST `/tenant/roles`                                   | `role.create` + `role.view`                          | 201 `RoleDetail`; 409 duplicate code; body `role_code`, `role_name`, `description?`                                                                                                                    |
| GET `/tenant/roles/{id}`                               | `role.view`                                          |                                                                                                                                                                                                        |
| PATCH `/tenant/roles/{id}`                             | `role.update` + `role.view`                          | System role → 409; `null` = unchanged. Source reading: `""` replaces the description and a blank name is stored (BG-09a)                                                                               |
| POST `/tenant/roles/{id}/activate`, `/deactivate`      | `role.activate` / `role.deactivate` + `role.view`    | Any state → ACTIVE / DISABLED; system role → 409; send `{}`                                                                                                                                            |
| GET `/tenant/roles/{id}/permissions`                   | `role.view`                                          | Newest grant first                                                                                                                                                                                     |
| POST `/tenant/roles/{id}/permissions`                  | `role.assign_permission` + `role.view`               | 201 grant; unknown code 404; system role 409; a repeat returns the existing grant                                                                                                                      |
| DELETE `/tenant/roles/{id}/permissions/{rpid}`         | `role.remove_permission` + `role.view`               | 200 with the remaining grants (page 0, size 100); 404 if the grant is on another role; system role 409                                                                                                 |
| GET `/tenant/permissions`                              | `permission.view`                                    | The 80-code catalogue; `risk_level`, `status`, sort fields; no `module_code` filter                                                                                                                    |
| GET `/tenant/role-assignments`                         | `role_assignment.view`                               | `user_id`, `role_id`, `branch_id`, `scope_type`, `status`; newest first; never branch-restricted                                                                                                       |
| POST `/tenant/role-assignments`                        | `user.assign_role` (T for TENANT, B for BRANCH)      | 201; TENANT with a `branch_id` → 422; BRANCH without one → 409 in the contract but a 500 at source (BG-07); the user needs an ACTIVE assignment at that branch; other branch in a branch context → 404 |
| DELETE `/tenant/role-assignments/{id}`                 | `user.revoke_role` (T or B) + `role_assignment.view` | Revoking a REVOKED row is a no-op 200                                                                                                                                                                  |
| GET `/tenant/audit-events?entity_type=ROLE&entity_id=` | `audit.view`                                         | Assignment events are keyed by assignment id (`USER_ROLE_ASSIGNMENT`), not by role (BG-16)                                                                                                             |

#### Reuse

- Consumes: the list kit (`ListToolbar` search and select kinds, `TablePaginationBar`, `useListNavigation`, `ListNavigationProvider`/`ListNavigationProgress`/`ListBusyRegion`, `LinkPendingIndicator`); the record kit (`RecordHero`, `RecordTabs`, `RecordAuditTab`, `CopyIdButton`, `ForbiddenState`); `ConfirmDialog` (never `ReasonDialog`: no role endpoint takes a reason); `AssignmentDrawer`, `UserPicker`, `SectionCard`, `DescriptionList`, `StatusChip`, `applyFieldErrors`; `lib/api` (`apiGet`, `apiPost`, `apiPatch`, `apiDelete`, `load`, `runServerAction`, `parseListSort`, `sortQuery`, `parsePaging`, `getBranchIndex`, `getTenantUser`, `getOrganisationTimeZone`); the fake API's `requirePermission`, `sendIdempotent`, `recordAuditEvent`, `BUILDERS`; `e2e/support/admin.ts`.
- Produces for later layers: `getRoleIndex` `[wip]` (`lib/api/lookups.ts`; up to 5 pages × 100 sorted by name, entries `{ name, code, status, systemRole }`, an empty map on any failure so callers fall back to short IDs); `ROLE_SCOPE_TYPES`, `ROLE_STATUSES`, `PERMISSION_RISK_LEVELS` and the schema types (`modules/administration/roles/role-contract.ts` `[wip]`); `listRoleAssignments` with `userId` or `roleId` filters, `assignRole` (fields `idempotencyKey`, `roleId`, `userId`, `scopeType`, `branchId`) and `revokeRoleAssignment` (`assignmentId`) `[wip]`; `RoleScopeFields` and `RevokeRoleAssignmentButton` `[plan]`; the shared `focusRecordTitle` `[wip]` (08's copy in `branch-lifecycle-actions.tsx` should switch to it); the derived per-write idempotency key (`grantKey`) for fan-out submits.
- Kit rule: shared kit and pipeline files change only additively (new optional props or exports, one `refactor(kit):` commit each). 09 plans no kit change.

#### Backend gaps that shape it

| Gap              | Impact                                                                                              | Frontend workaround                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| BG-07            | BRANCH-scoped assignment without `branch_id` is a 500 at source (the contract says 409)             | Branch required client- and server-side; BRANCH is never sent with a null branch                           |
| BG-09 and BG-09a | Role items lack description and dates; `PATCH` accepts a blank name and `""` clears the description | Directory shows Role, Code, Type, Status only; edit requires a name; a blank description is sent as `null` |
| BG-15            | No role counts                                                                                      | One `size=1` read per count, on the Overview only                                                          |
| BG-16            | Role assignment events are keyed per assignment; audit can't filter by role                         | Audit tab is ROLE / role id only, and its copy says so                                                     |
| BG-27            | No delete or archive; a DISABLED role can still be assigned (it grants nothing)                     | Assign offered for ACTIVE roles only; no delete control                                                    |
| BG-31, BG-33     | Hidden `.view` read-backs; `/auth/me` permissions carry no scope                                    | Every action gated on its code plus the matching `.view`; the assign drawer shows a 403 inline             |

#### Carried-in deferred items

- Switch 08's `focusRecordTitle` copy (`modules/administration/branches/components/branch-lifecycle-actions.tsx`) to the shared kit file in a follow-up change; 09 edits no 08 file.
- Add the BG-09a summary row to `docs/backend-gaps.md` under BG-34, the next free ID (Task 8 deliberately adds none, to avoid re-padding the table).
- No Created column or `createdAt` sort until `RoleSummary` carries `created_at` (BG-09). A whole-row click target for directory rows is deferred until the nested-interactive accessibility question is settled.
- Keep these spec deviations documented under BG-09: directory columns (no description, no created), the "Active assignments" count, search on Enter or blur, and no violation mapping.
- Test gaps: the `getRoleIndex` pagination test asserts only the `page=0` URL (the failure case was added); `role-rules.test.ts` pins only the 500-character description cap, not name 100 or code 20.

#### Plan status

In progress. Plan: `docs/superpowers/plans/2026-10-01-admin-parity-09-roles.md` on `lane/09-roles` (8 tasks). Tasks 1–4 are complete and reviewed; Task 5 is implemented and awaiting review; Tasks 6–8 are pending.

| Task | Scope                                                                                                                                                     | State                                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `role-contract`, `role-query`, `role-rules`, `role-service`, `getRoleIndex`                                                                               | Complete                                                                                                                           |
| 2    | `role-actions.ts`: create, update, activate/deactivate, `grantPermissions` (≤ 25, derived keys), `removePermission`, `assignRole`, `revokeRoleAssignment` | Complete                                                                                                                           |
| 3    | Directory table, `RoleForm`, `/admin/roles` and `/new`, navigation entry                                                                                  | Complete                                                                                                                           |
| 4    | Record layout and hero, lifecycle actions, Overview, edit, Audit, shared `focusRecordTitle`                                                               | Complete                                                                                                                           |
| 5    | Permissions tab: `PermissionChecklist`, `GrantPermissionsButton`, `RemovePermissionButton`, `RolePermissionsTable`                                        | Implemented, review pending. Open: the checklist error isn't tied to a control; drawer at 375 px and risk-label contrast unchecked |
| 6    | Assignments tab: `RoleScopeFields`, `AssignRoleButton`, `RevokeRoleAssignmentButton`, `RoleAssignmentsTable`                                              | Pending                                                                                                                            |
| 7    | Fake API: `routes/roles.mts`, 54-code catalogue, `ROLE_SCENARIO_IDS`, `roles` and `roles-limited` scenarios, `FakeRole.grantedAt?`                        | Pending                                                                                                                            |
| 8    | `e2e/roles.spec.ts` with the axe matrix; README, AGENTS (derived-key bullet), backend-gaps and contract notes below the §E.3 table                        | Pending                                                                                                                            |

Plan decisions worth keeping: the fake `default` scenario stays read-only for role mutations (09's codes live only in `roles`); layers 16 and 17 run in the platform context, which rejects tenant role routes, so they consume only 09's types and enums.

#### Tests

- Fake API (Task 7) `[plan]`: the routes in the table above except audit. It mirrors the system-role 409, unknown-permission 404, idempotent repeat grant, DELETE returning the remaining grants, BRANCH-without-branch 500, branch-context 404, not-assigned-there 409, TENANT-with-branch 422, off-list sort 500 and `invalid_json` on unknown properties. Scenarios: `roles` (six roles incl. a DISABLED one and an 85-character name; two staff users) and `roles-limited` (no `role.update`, `role.activate`, `role_assignment.view`, `audit.view`). Seed prefix `09000000-0000-4000-8000-…`; catalogue ids start at `…0100`.
- Unit (Vitest): contract drift (unknown status, scope or risk rejected); query parsing drops anything the backend would 500; rules (system role hides every mutation, `.view` pairing); actions with a mocked `runServerAction` (canonical derived keys, partial failure); components (hidden `contextOrganisationId`, same-key retry, focus fallbacks).
- E2E `e2e/roles.spec.ts` plus `e2e/fake-api-roles.spec.ts`: directory URL state; create then grant, including a critical removal; edit, toggle, system role read-only; scoped assign, missing branch assignment, revoke; own-assignment warning; branch-context branch list; read-only gating. Axe on the directory, the create form with errors, the long-named role's four tabs and both drawers; manual pass at 1440 and 375.

#### Live checks needed

- Reads: the roles list (search, each status and type, sort by each of Role, Code and Status in both directions; any 500 means allow-list drift), a system role's Overview counts against its tabs, Permissions (the catalogue should return all 80 codes with `has_next` false; record each `module_code`), Assignments, Audit, and both drawers opened then cancelled. In a single-branch context "One branch" offers only that branch.
- Mutations (ask before each; at All branches; throwaway custom role and LOW-risk codes only): create `ZZ09TEST` — **permanent, there is no role delete (BG-27)**; grant two LOW codes in one submit (proves the derived keys are accepted); remove one; edit name and description; assign institution-wide to a second admin and revoke it; deactivate as cleanup (the role stays on dev as DISABLED).
- Never: change a system role, or revoke the signed-in user's only source of `iam.profile.read`, `auth.select_*` or `role.*`. The BG-07 and BG-09a claims have no UI path; record them as "source reading, not probed live".

#### Risks and open questions

- BG-33 is already used in the published `docs/backend-gaps.md` (scope-less permissions), so 09's BG-09a must register as BG-34. The plan's Task 8 docs edits predate that entry and must be merged onto the published docs.
- The plan's "source f74e44b" backend facts (BRANCH-without-branch 500, blank name stored, `""` clears the description) come from reading backend source, not from live probes.
- Sequential grant writes keep the drawer pending for about 25 × latency at the cap; the write budget is 120/min. The Permissions tab costs about six reads per navigation.
- A zod 4 `.refine` on the assign input reports the branch error only after the other fields parse.
- Task 5 raised a few items for the visual and keyboard pass: the drawer at 375 px (name, code and risk wrap), the 680 px table's horizontal scroll, and `permissionCodes` error text not linked with `aria-describedby`.
- Open for 10: the Roles & access tab should pass `RoleScopeFields` only the branches where the user already holds an ACTIVE assignment, otherwise BRANCH scope returns 409.

### Layer 10 — Users: directory and record

#### Goal and scope

Spec §10.5 (directory, record, hero actions), §10.1 (record Audit views), §6.5–§6.7 (branch context, permissions, errors). Delivers `/admin/users` and `/admin/users/[userId]` with tabs Overview, Roles & access, Branch assignments and Audit; the membership lifecycle (Approve, Reject & revoke, Suspend, Reactivate, Revoke); role and branch assignment management; and the audit actor picker.
It owns the users contract, onboarding rules, membership actions and the `AuditFilters` actor picker (ownership table, §3 of `docs/superpowers/plans/2026-09-27-admin-parity-parallel-lanes.md`). The invite wizard is 11 and the approval queue is 12.

#### Routes and permissions

| Route                                       | Permission (UI gate)                                                                                                                                                | Notes                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `/admin/users`                              | `user.view` (nav item)                                                                                                                                              | Directory. The "Invite user" button arrives with 11                                             |
| `/admin/users/[userId]`                     | `user.view`; membership facts and hero actions need `membership.view`                                                                                               | Overview. The membership is found with `GET /tenant/memberships?q=<email>` matched on `user_id` |
| `/admin/users/[userId]/access` (proposed)   | `role_assignment.view` (+ `role.view` for names). Assign `user.assign_role`; revoke `user.revoke_role`                                                              | Roles & access tab                                                                              |
| `/admin/users/[userId]/branches` (proposed) | `branch_assignment.view`. Assign `user.assign_branch`; revoke `user.revoke_branch`                                                                                  | Branch assignments tab; bounded scan with a "partial" marker                                    |
| `/admin/users/[userId]/audit` (proposed)    | `audit.view`                                                                                                                                                        | Four views                                                                                      |
| Hero actions                                | Approve `user.approve`; Reject & revoke and Revoke `membership.revoke`; Suspend `membership.suspend`; Reactivate `membership.reactivate` — each + `membership.view` | By membership status (below)                                                                    |

#### Screens and behaviour

- **Directory.** Search (username, email, name), User status, Membership status; newest first, no sort headers (the endpoint has no sort). Columns: user (initials avatar, name, email), username, onboarding state, membership status, user status. List items carry no membership id or type, so nothing else is shown (D8). Onboarding state is derived: PENDING_APPROVAL + DRAFT "Awaiting approval"; PENDING_APPROVAL + PROVISIONING_IDP "Provisioning identity"; ACTIVE + INVITED "Awaiting first sign-in"; ACTIVE + ACTIVE "Active"; SUSPENDED "Suspended"; REVOKED "Revoked". Default 10 per page.
- **Hero.** Person avatar (`RecordHero` `{ kind: 'person' }`), name, onboarding-state and status chips. PENDING_APPROVAL → Approve and Reject & revoke; ACTIVE → Suspend and Revoke; SUSPENDED → Reactivate and Revoke. Approve is hidden when the user is PROVISIONING_IDP (approval already ran; re-approving is a 500) and disabled with an explanation when the signed-in user invited them. Suspend, Revoke and Reject need a reason (3–500); Revoke and Reject & revoke carry a permanence warning (the email can never be re-invited, BG-28); Reactivate takes an optional reason (the body is optional; sending `{}` is safe).
- **Overview.** Identity, membership type, status, primary branch (resolved name), created and updated, the onboarding timeline, and role and branch counts (`size=1` reads; the branch count is marked partial when the scan stops at its ceiling).
- **Roles & access.** ACTIVE role assignments with role name (via `getRoleIndex`), scope and branch. Assign reuses 09's `assignRole` with `roleId` as a visible role picker (ACTIVE roles) and `userId` hidden; `RoleScopeFields` is given only the branches where the user already holds an ACTIVE assignment (otherwise BRANCH scope is a 409). Revoke uses `RevokeRoleAssignmentButton`, warning when it is your own assignment.
- **Branch assignments.** There is no `user_id` filter, so scan `GET /tenant/branch-assignments` within a bounded ceiling and filter by user, labelled "partial" when the ceiling is reached; in a branch-selected context the list is forced to that branch, so it is partial by construction and other branches 404 (`BranchContextState`). Assign reuses 08's `assignBranchUser` (fields `branchId`, `userId`, `assignmentType`) with the user fixed and a branch select; revoke reuses `revokeBranchAssignment`. A 409 on a STAFF or ADMIN member's last assignment is explained.
- **Audit.** `RecordAuditTab` with `AuditViewToggle` over four paginated views: User record (`USER` / user id), Account (`USER_ACCOUNT` / user id), Membership (`MEMBERSHIP` / membership id), Performed by (`actorId`). Branch assignment changes are logged against the branch (BG-16) and don't appear. `AuditFilters` gains a user-search actor picker (`UserPicker` → `actor_id`).
- **Maker-checker.** The inviter is only in the audit log: `GET /tenant/audit-events?entity_type=USER&entity_id={user}&action=user.invite` (needs `audit.view`; the branch equivalent is `getBranchMaker`). Without it Approve stays enabled and a 403 is explained as "permission or maker-checker" (BG-08).
- **States and focus.** Unknown user or membership → `notFound()`; without `membership.view` the hero shows no membership actions and says why; 403 → `ForbiddenState`. After a lifecycle transition focus goes to the replacement action, else the first enabled one, else the record title (`focusRecordTitle`). Every dialog passes `contextOrganisationId`.

#### Wire endpoints

| Method and path                                  | Permission / scope                                                              | Quirks                                                                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET `/tenant/users`                              | `user.view` (T)                                                                 | `q`, `user_status`, `membership_status`; newest first, no sort; items `id`, `username`, `email`, `display_name`, `user_status`, `membership_status` only                       |
| GET `/tenant/users/{id}`                         | `user.view`                                                                     | Same summary shape                                                                                                                                                             |
| GET `/tenant/memberships`                        | `membership.view`                                                               | `q`, `membership_status`, `membership_type`; `sort_*` ignored; no `user_id` filter; items have no names                                                                        |
| GET `/tenant/memberships/{id}`                   | `membership.view`                                                               | `MembershipDetail`: identity, type, primary branch, timestamps                                                                                                                 |
| POST `/tenant/memberships/{id}/activate`         | `user.approve` + `membership.view`                                              | Approver ≠ inviter (403, same code as a missing permission); 200 = ACTIVE, 202 = identity provisioning queued; unknown, not pending, missing prerequisites or re-approve = 500 |
| POST `…/suspend`, `…/reactivate`                 | `membership.suspend`, `membership.reactivate` + `membership.view`               | Suspend reason 3–500; reactivate reason optional ≤ 500 and the body optional (sending `{}` is safe)                                                                            |
| POST `…/revoke`                                  | `membership.revoke` + `membership.view`                                         | Reason 3–500; terminal; revokes all assignments; already revoked = 500                                                                                                         |
| GET `/tenant/branch-assignments`                 | `branch_assignment.view`                                                        | `branch_id`, `assignment_type`, `status`; no `user_id`; forced to the selected branch; items are IDs only                                                                      |
| POST, DELETE `/tenant/branch-assignments[/{id}]` | `user.assign_branch`, `user.revoke_branch` (T and B) + `branch_assignment.view` | 201, a repeat returns the existing row; 409 if org or branch isn't ACTIVE or membership is REVOKED; DELETE 409 on a STAFF/ADMIN member's last assignment; branch-context 404   |
| GET, POST, DELETE `/tenant/role-assignments`     | As layer 09                                                                     | `user_id` filter available; BRANCH needs `branch_id` and an existing ACTIVE assignment there                                                                                   |
| GET `/tenant/audit-events`                       | `audit.view`                                                                    | `entity_type` + `entity_id`, or `actor_id`; newest first                                                                                                                       |

#### Reuse

- Consumes: 09's `getRoleIndex`, `listRoleAssignments`, `assignRole`, `revokeRoleAssignment`, `ROLE_SCOPE_TYPES` `[wip]` and `RoleScopeFields`, `RevokeRoleAssignmentButton` `[plan]`; 08's `assignBranchUser`, `revokeBranchAssignment`, `AssignBranchUserButton`, `RevokeAssignmentButton`, `listBranchAssignments`, `getBranchMaker` (the template for the user maker lookup), `BRANCH_ASSIGNMENT_TYPES`, `BranchContextState`, `SwitchToAllBranchesButton`; the kit (`RecordHero` person avatar, `RecordTabs`, `RecordAuditTab`, `AuditViewToggle`, `ReasonDialog`, `ConfirmDialog`, `AssignmentDrawer`, `UserPicker`, `StatusChip`, `DescriptionList`, `SectionCard`, `ListToolbar`, `TablePaginationBar`); `lib/api` helpers and lookups `getTenantUser`, `resolveUserNames`, `getBranchIndex`.
- Produces `(proposed)` for 11, 12, 14 and 17: `user-contract.ts` (summary and membership schemas; spec §6.1 says the platform module reuses it), `user-rules.ts` (`onboardingState`, hero action availability), `user-service.ts` (`listUsers`, `getUser`, membership resolution by user, `listUserBranchAssignments` returning `{ items, partial }`, a user maker lookup), and membership actions (approve, suspend, reactivate, revoke) that 12's decision bar reuses. Re-point `modules/administration/users/user-search-service.ts` if the new service replaces it.

#### Backend gaps that shape it

| Gap          | Impact                                                                            | Frontend workaround                                                                              |
| ------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| BG-07        | Re-approving a provisioning user, re-revoking, unknown ids → 500                  | Approve hidden for PROVISIONING_IDP; ids validated as UUIDs; generic error with a reference      |
| BG-08        | Maker not exposed; maker-checker 403 looks like a missing permission              | Audit lookup when `audit.view` is held; otherwise explain the 403 as permission or maker-checker |
| BG-09        | No `user_id` filter on memberships or branch assignments; thin list items         | `q=<email>` match; bounded scan flagged partial                                                  |
| BG-11        | No invitation state or resend; PROVISIONING_IDP can stick (Keycloak admin off)    | Derived onboarding state with a "Provisioning identity" explanation                              |
| BG-15, BG-16 | No counts; one user's history spans several audit queries                         | `size=1` counts on the record only; four audit views                                             |
| BG-17        | No phone, member number, last activity, MFA or edit                               | Omitted (D7)                                                                                     |
| BG-28        | Revoke is terminal                                                                | Permanence warning                                                                               |
| BG-02, BG-03 | A bootstrap admin can't approve their own invites; a selected branch hides others | Approve disabled with an explanation; guided "switch to All branches" state                      |
| BG-31, BG-33 | Hidden `.view` read-backs; scope-less permissions in `/auth/me`                   | Gate on both codes; the drawers report a 403 inline                                              |

#### Carried-in deferred items

- Audit actor search: `AuditFilters` filters an actor only by clicking a visible row or editing `actorId`. Add the user-search picker (`GET /tenant/users?q=` → `actor_id`, reusing `UserPicker`) and rewrite the README limitation that says an actor is filtered by clicking their name "until a users directory ships a picker".
- `AuditViewToggle` with the four user views renders for the first time here. Check its wrap and focus ring at 375 px in light and dark on the real page; the kit file is frozen, so any fix is a `fix(kit)` commit.
- The users module is search-only today (`user-option.ts`, `user-search-service.ts`); 10 owns the full contract and may re-point the service.
- Consume 09's `getRoleIndex` (up to 5 × 100 by role name; an empty map on any failure, so fall back to short IDs; names degrade past 500 roles) and its role-assignment contract (BRANCH without `branch_id` is a backend 500, BG-07; TENANT must send `branch_id: null`, else 422).
- Backend field violations are unmapped (`BackendApiError` carries none), so server-only field errors land in the form summary.

#### Plan status

To be written just in time from the spec. Suggested breakdown (8 tasks):

1. Contract, query, rules (onboarding table, hero action matrix) and service reads (list, get, membership resolution, branch-assignment scan, maker lookup).
2. Membership actions (approve, suspend, reactivate, revoke) and thin wrappers over 09's and 08's assignment actions.
3. Directory page, navigation item (`user.view`), and the `AuditFilters` actor picker with the README rewrite.
4. Record layout, hero, lifecycle dialogs, Overview and the onboarding timeline.
5. Roles & access and Branch assignments tabs (scan, partial marker, guided state).
6. Audit tab with the four views, and the `AuditViewToggle` check.
7. Fake API: memberships routes and lifecycle, `users` scenarios.
8. E2E, accessibility matrix and docs.

#### Tests

- Fake API `(proposed)`: add `GET /tenant/memberships`, `GET /tenant/memberships/:id` and `POST …/{activate,suspend,reactivate,revoke}`. Activate returns 200 when the user has an identity link, else 202 and the user becomes PROVISIONING_IDP; mirror the 500s (not pending, re-approve, re-revoke) and the approver ≠ inviter 403. Give `FakeMembership` or `FakeUser` optional fields (for example `invitedBy?`, `identityLinked?`; every new field optional because existing specs build literals) and write `user.invite` audit events so the maker lookup is exercised. Branch- and role-assignment routes come from 08 and 09. Scenarios `users` (every onboarding state, a long-named user, an inviter other than the signed-in user) and `users-limited` (no `membership.view`, no `audit.view`). Seed prefix `10000000-0000-4000-8000-…`.
- Unit: contract and drift; the `onboardingState` table; the action-availability matrix (status × permission × maker); actions with a mocked `runServerAction` (guard messages); dialogs (reason minimum 3, permanence warning, hidden `contextOrganisationId`, focus fallbacks).
- E2E `e2e/users.spec.ts` and `e2e/fake-api-users.spec.ts`: filters through the URL; each lifecycle transition; Approve's 200 and 202 outcomes; the maker-checker disabled state; no Approve for PROVISIONING_IDP; the partial marker; the branch-context guided state; the actor picker on `/admin/audit`. Axe (light and dark, 1280 and 375) on the directory, each tab, 100-character names and the four-view toggle; manual visual and keyboard pass at 1440 and 375.

#### Live checks needed

- Reads: users list filters and paging; a record per onboarding state if dev has them; memberships by `q=<email>` matched on `user_id`; role and branch assignment reads; the four audit views (needs `audit.view`); the reads-per-record fan-out against the 600/min budget.
- Mutations (each approved): suspend then reactivate a throwaway member; assign then revoke a role (never the signed-in user's own TENANT_ADMIN); assign then revoke a branch assignment (a STAFF or ADMIN member's last one is a 409).
- **Irreversible, run only on explicit approval:** Revoke and Reject & revoke (terminal; the email can never be re-invited, BG-28) and Approve (a 202 starts real Keycloak identity provisioning and possibly an email; it needs a second identity that is not the inviter). Use a throwaway invitee on a mailbox you control.

#### Risks and open questions

- `q=<email>` is a substring match, so resolve the membership by comparing `user_id` exactly. Decide what happens when an email matches more than one page of memberships.
- Choose the branch-scan ceiling (suggest 5 pages × 100, like the lookup indexes) and the "partial" copy; 12's detail page reuses the same scan.
- The 200 versus 202 approval outcome needs a different message, but `ActionResult`'s success variant carries no payload. Options: an additive optional field on `ActionResult` (kit changes are additive only), or deriving the message from the refreshed state.
- Ownership: 10 builds the membership actions and 12 reuses them for its decision bar.
- Without `membership.view` the record degrades instead of failing; decide how much of the hero to show.
- Server `validation_failed` violations are not mapped to fields yet; the forms rely on matching client and server rules.

### Layer 11 — Users: invite wizard

#### Goal and scope

Spec §10.5 (the Invite user wizard at `/admin/users/new`), §6.4 (React Hook Form and one idempotency key), §9 (wizards: `Stepper`, per-step validation, a review step, a sticky action bar), §7.3 (Stepper theme). Four steps (Identity, Access, Invitation, Review) with pre-validation that mirrors the backend rules that otherwise return 500 (BG-07); a successful submit redirects to the new user's record (layer 10).
It is built on 16's `WizardForm` and Stepper theme `[plan]`: ownership of both moved from 11 to 16 (ownership table §3 of the parallel-lanes plan doc; plan 16 Task 4).

#### Routes and permissions

| Route              | Permission (UI gate)                                                                                                                                   | Notes                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `/admin/users/new` | `user.invite` + `user.assign_branch` (per invited branch). The pickers need `role.view` and `branch.view`; the email pre-check needs `membership.view` | Entry button on `/admin/users`. Missing view permissions → `ForbiddenState` or guidance, not a half-working wizard |
| Submit             | `POST /tenant/users`                                                                                                                                   | Redirects to `/admin/users/{user_id}` on 201                                                                       |

#### Screens and behaviour

- **Step 1, Identity.** Display name (2–100), email, username `^[a-zA-Z0-9._-]{3,50}$`, phone E.164 (optional, `^\+[1-9]\d{1,14}$`), membership type STAFF, ADMIN, AUDITOR or SYSTEM (AUDITOR and SYSTEM are branch-exempt).
- **Step 2, Access.** Role assignments (ACTIVE roles; TENANT or BRANCH scope; a BRANCH role's branch must be among the branch assignments), branch assignments (ACTIVE branches; HOME, OPERATE, APPROVE, VIEW), and a primary branch (must be ACTIVE).
- **Step 3, Invitation.** Send the identity-provider invite (default on) and the application invite (default off).
- **Step 4, Review.** A summary with an Edit link per step, then submit.
- **Pre-validation** (the same rules client-side in RHF and server-side in zod): at least one role; STAFF and ADMIN need at least one branch assignment; roles and branches ACTIVE; no existing membership for the email in this tenant (`GET /tenant/memberships?q=<email>` is a substring match and its items carry no email, so confirm each hit by reading that user, `GET /tenant/users/{user_id}`, and comparing the email case-insensitively; any status counts, REVOKED included). Bodies are built field by field: an unknown property is `400 invalid_json`, and the two booleans are never sent as `null`.
- **Wizard mechanics.** One React Hook Form across the steps; Continue `trigger`s that step's own fields; the last step submits everything with one idempotency key minted at mount and reused on retry; a server field error returns to its step; a step change focuses the new step's heading; an error summary `Alert` sits with the field errors; sticky action bar with Back and Cancel; `contextOrganisationId` is appended to the form data.
- **Existing global account.** The backend reuses an account it finds by email and ignores the entered name, username and phone. The tenant context can't see other tenants' memberships, so the spec's "the review step says so when the lookup finds the email in another context" can't be driven by data; show a static note instead (open question).
- **States.** No ACTIVE roles or no ACTIVE branches → a blocking message that links to Roles or Branches. An empty `getRoleIndex` map (a read failure) → say roles couldn't be loaded, with a reference, rather than an empty picker. No toast crosses the redirect (a convention from 08), so the new record's "Awaiting approval" state is the confirmation.
- **Maker-checker.** The invite creates a PENDING_APPROVAL membership that the inviter can't approve (BG-02); the Review step says it needs a second administrator.

#### Wire endpoints

| Method and path                     | Permission / scope                                              | Quirks                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST `/tenant/users`                | `user.invite` (T) + `user.assign_branch` (B) per invited branch | 201 `UserInvitationResult` (`user_id`, `membership_id`, `user_status` DRAFT for a new user, `membership_status` PENDING_APPROVAL). Body: `email`, `username`, `display_name`, `phone_e164?`, `membership_type`, `primary_branch_id?`, `branch_assignments[{ branch_id, assignment_type }]`, `role_assignments[{ role_id, scope_type, branch_id? }]`, `send_keycloak_invite`, `send_application_invite`. Rule failures are 500s; an existing global account is reused by email |
| GET `/tenant/memberships?q=<email>` | `membership.view`                                               | Pre-check; a substring match on username, email and name, and the items carry no email, so read each hit (`GET /tenant/users/{user_id}`) to compare                                                                                                                                                                                                                                                                                                                           |
| GET `/tenant/roles`                 | `role.view`                                                     | Or `getRoleIndex` `[wip]`, whose entries carry `status`, so ACTIVE can be filtered                                                                                                                                                                                                                                                                                                                                                                                            |
| GET `/branches?status=ACTIVE`       | `branch.view` (T)                                               | `getBranchIndex` entries carry no status, so the wizard needs its own bounded ACTIVE read                                                                                                                                                                                                                                                                                                                                                                                     |

#### Reuse

- Consumes: 16's `WizardForm`, `WizardStep` and Stepper overrides `[plan]`; 09's `getRoleIndex` and `ROLE_SCOPE_TYPES` `[wip]`, and `RoleScopeFields` `[plan]` for scope and branch pairs; 10's membership lookup and record route `[plan]`; 08's `BRANCH_ASSIGNMENT_TYPES`; `applyFieldErrors`, `runServerAction`, `PageHeader`, `SectionCard`, `DescriptionList`, `ForbiddenState`, `ErrorState`, `StatusChip`.
- Produces `(proposed)`: an `inviteUser` Server Action and an invite-rules module (per-step zod schemas, pre-validation, the explicit body builder). No later layer depends on 11.
- Build-order dependency: if 16 is ahead, do not rebuild the Stepper theme or `WizardForm` here. If 11 has to go first, move 16's Task 4 into 11 and delete it from 16's plan.

#### Backend gaps that shape it

| Gap   | Impact                                                                                                                                                              | Frontend workaround                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| BG-07 | Invite rule failures are 500s: inactive role or branch, scope mismatch, STAFF/ADMIN without a branch, no role, existing membership, taken username with a new email | Pre-validate every known trigger; a generic error with a reference for the rest |
| BG-09 | Memberships can only be searched by `q`                                                                                                                             | Email pre-check through `q`, then one user read per hit to compare the email    |
| BG-11 | No invitation state or resend; approval can leave users PROVISIONING_IDP                                                                                            | Review copy says approval is a separate step                                    |
| BG-17 | Phone is stored but never readable                                                                                                                                  | Collected, never displayed afterwards                                           |
| BG-25 | Identity-provider provisioning and email are off by default                                                                                                         | The Invitation step explains the flags; delivery failures aren't visible        |
| BG-28 | A revoked membership blocks the email for good                                                                                                                      | The pre-check treats REVOKED as taken and says so                               |
| BG-02 | A single-admin tenant can't approve its own invites                                                                                                                 | Review note                                                                     |

#### Carried-in deferred items

- Stepper, StepIcon and StepConnector theme overrides (spec §7): earlier deferred-item notes list them under 11 as having no owner but this layer, but the ownership table (§3 of the parallel-lanes plan doc) and plan 16 Task 4 moved them to 16. Consume 16's output, and settle this before planning 11.
- Role choice: use `getRoleIndex`.

#### Plan status

To be written just in time from the spec. Suggested breakdown (6 tasks):

1. Invite rules: per-step zod schemas, cross-field pre-validation, the explicit snake_case body builder.
2. Services and action: ACTIVE roles and branches reads, the membership email pre-check, `inviteUser` (explain 403 and 409, redirect to the record).
3. Wizard shell on `WizardForm` with the Identity and Invitation steps.
4. Access step (role scope and branch pairs, branch assignments, primary branch) and Review step.
5. `/admin/users/new` page, gating and the "Invite user" entry on the directory; fake `POST /tenant/users` and its scenario.
6. E2E, accessibility matrix and docs.

#### Tests

- Fake API `(proposed)`: `POST /tenant/users` → 201 `UserInvitationResult`; creates a DRAFT user (or reuses one by email) and a PENDING_APPROVAL membership; 500 on each backend rule trigger, so tests prove pre-validation prevents them; `invalid_json` on unknown or camelCase properties; idempotent replay and key reuse through `sendIdempotent`; writes the `user.invite` audit event. Needs `GET /tenant/memberships` from 10. Scenario `users-invite` (ACTIVE and DISABLED roles, ACTIVE and PENDING_APPROVAL branches, an existing member to collide with, a REVOKED one). Seed prefix `11000000-0000-4000-8000-…`.
- Unit: step schemas (username pattern, E.164, name lengths); the pre-validation matrix; the body builder (explicit fields, `null` versus omitted); the action (explain, redirect); the wizard (Continue validates its step, a server field error returns to its step, a retry reuses the key, `contextOrganisationId` is sent).
- E2E `e2e/users-invite.spec.ts` (or inside `e2e/users.spec.ts`): happy path to the new record; a duplicate email blocked before the POST; STAFF without a branch blocked; a BRANCH role without the matching branch assignment blocked; a failed submit keeps the entries. Axe on every step, light and dark, 1280 and 375 (the Stepper is a 2×2 grid at 375); manual visual and keyboard pass at 1440 and 375.

#### Live checks needed

- Reads: roles and ACTIVE branches populate the pickers; the email pre-check with an existing member's email blocks and sends no POST.
- **Irreversible:** an invite creates a permanent membership (there is no delete, revoke is terminal and the email can never be re-invited, BG-28) and, with the identity-provider invite on, a real Keycloak user and email. Run it only with explicit approval, on a throwaway address you control. What each invite flag does on dev is not confirmed (both off may avoid external side effects); check before relying on it.
- The follow-up Approve needs a second identity that is not the inviter and starts real identity provisioning (202).

#### Risks and open questions

- 11 depends on 16's wizard scaffold (planned order 09 → 16 → 10 → 17 → 12 → 11 → 14).
- A taken username with a new email is a 500 that can't be pre-checked: usernames are global and the tenant context sees only its own users. Show the generic error with its reference.
- The tenant context can't detect an existing global account in another tenant, so the "account will be reused" note is static.
- `getBranchIndex` carries no status, so the wizard needs a separate ACTIVE read (ceiling 100 per page).
- Server `validation_failed` violations aren't mapped to fields (`BackendApiError` carries none). The wizard is the first layer where server-only field errors matter (paths such as `branch_assignments[0].branch_id`); consider an additive mapping in `runServerAction`.
- Wizard state is lost on reload; the spec doesn't call for persisted drafts.

### Layer 12 — Approvals and notifications

#### Goal and scope

Spec §10.6 (approval queue and details), §8 (notifications), D6. `/admin/approvals` is a typed inbox with tabs User onboarding and Branch activation, detail pages, a decision bar (Approve; Reject & revoke for users only) and the tenant notifications badge that fills `components/shell/tenant-notifications.tsx` (it returns `null` today).
It rests on per-resource transitions only. There is no approval-request model (BG-01), so no return for changes, resubmission, branch rejection or remarks.

#### Routes and permissions

| Route                                  | Permission (UI gate)                                                               | Notes                                                                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/approvals`                     | Nav `requiresAny: ['user.approve', 'branch.activate']` (OR semantics, `canAny`)    | Tabs: User onboarding (`user.approve` + `user.view`), Branch activation (`branch.activate` + `branch.view`); tab state in the URL (proposed) |
| `/admin/approvals/users/[userId]`      | `user.approve` + `user.view` + `membership.view`; reject needs `membership.revoke` | Maker and history need `audit.view`                                                                                                          |
| `/admin/approvals/branches/[branchId]` | `branch.activate` + `branch.view`                                                  | Activate needs the All branches context (BG-03)                                                                                              |
| Header badge                           | `user.approve` for users, `branch.activate` for branches                           | `TenantNotifications`                                                                                                                        |

#### Screens and behaviour

- **Queue, User onboarding.** `GET /tenant/users?membership_status=PENDING_APPROVAL`: name, email, onboarding state; server-paginated. Rows whose user is PROVISIONING_IDP were already approved: they show "Provisioning identity" with a View action and no decision, and are excluded from the actionable count.
- **Queue, Branch activation.** `GET /branches?status=PENDING_APPROVAL`: name, code, type, created; server-paginated. Counts on both tabs come from `total_items`.
- **Detail pages.** Requested change (subject, type, organisation); identity or branch facts; requested access (roles from `role-assignments?user_id=` with names from `getRoleIndex`; branch scope = the membership's primary branch plus the bounded assignment scan, flagged "partial" when incomplete); maker and submitted time (the audit event `user.invite` or `branch.create_draft`, needs `audit.view`); control checks (maker is not you; role present; branch present where required; organisation active — a check that can't be computed reads "Verified by the platform on approval"); history (audit events for the subject).
- **Decision bar.** **Approve** (membership activate: 200 "Active" or 202 "Identity provisioning queued — the invitation is sent when it completes"; or branch activate) and, for users only, **Reject & revoke** (reason 3–500, permanence warning). Disabled with an explanation when the signed-in user is the maker.
- **Maker-checker.** Approver ≠ inviter and activator ≠ drafter. The maker is only in the audit log; without `audit.view` the decision stays enabled and a 403 reads "permission or maker-checker" (BG-08).
- **Notifications badge.** Actionable user-onboarding approvals (when `user.approve`: `total_items` of the pending query minus that of the pending + PROVISIONING_IDP query) plus pending branch activations (when `branch.activate`): three `size=1` reads. The popover links to the queue. The component returns `null` outside the administration workspace (check the cached `getCurrentContextProfile()` itself, so tenant reads never fire in the platform context), keeps its own Suspense, and never edits `app/(authenticated)/layout.tsx` or `app-shell.tsx`. The stub sits between `AppSwitcher` and `ThemeModeMenu`.
- **States and focus.** Empty tabs, per-tab `ForbiddenState` and `ErrorState`; branch detail in a branch-selected context → `BranchContextState`. After a decision focus follows the standing rule (the replacement action, else the first enabled one, else the record title); dialogs pass `contextOrganisationId`.

#### Wire endpoints

| Method and path                                        | Permission / scope                      | Quirks                                                                                         |
| ------------------------------------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| GET `/tenant/users?membership_status=PENDING_APPROVAL` | `user.view` (T)                         | Add `&user_status=PROVISIONING_IDP&size=1` for the already-approved count                      |
| GET `/branches?status=PENDING_APPROVAL`                | `branch.view` (T)                       | `size=1` for counts; the list is not branch-restricted                                         |
| GET `/tenant/memberships?q=<email>`                    | `membership.view`                       | Resolve the membership id; match on `user_id`                                                  |
| GET `/tenant/role-assignments?user_id=`                | `role_assignment.view`                  | Requested roles                                                                                |
| GET `/tenant/branch-assignments`                       | `branch_assignment.view`                | Bounded scan; forced to the selected branch in a branch context                                |
| POST `/tenant/memberships/{id}/activate`               | `user.approve` + `membership.view`      | 200 or 202; approver ≠ inviter; re-approve is a 500                                            |
| POST `/tenant/memberships/{id}/revoke`                 | `membership.revoke` + `membership.view` | Reason 3–500; terminal                                                                         |
| POST `/branches/{id}/activate`                         | `branch.activate` (B) + `branch.view`   | Optional `{ reason }`; activator ≠ drafter (403); 404 in a branch context; unknown id is a 500 |
| GET `/tenant/audit-events`                             | `audit.view`                            | `entity_type=USER` + `action=user.invite`, or `BRANCH` + `branch.create_draft`, for the maker  |

#### Reuse

- Consumes: 10's membership actions, onboarding rules, membership resolution, branch-assignment scan and maker lookup `[plan]`; 08's `activateBranch`, `getBranch`, `getBranchMaker`, `activateBlocked`, `MAKER_CHECKER_BLOCKED`; 09's `getRoleIndex` and `listRoleAssignments` `[wip]`; `ConfirmDialog`, `ReasonDialog`, `ListToolbar`, `TablePaginationBar`, `StatusChip`, `DescriptionList`, `SectionCard`, `BranchContextState`, `PageHeader`; the notifications stub file.
- Produces `(proposed)`: an approvals service (queue lists, the actionable-user count, the pending-branch count) used by both the badge and 14's pending-approvals card, control-check rules, and the tenant notifications badge.

#### Backend gaps that shape it

| Gap                 | Impact                                                                             | Frontend workaround                                                            |
| ------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| BG-01               | No approval-request model: no return, resubmit, branch reject or remarks           | Typed inbox over two reads; decisions limited to approve and reject-and-revoke |
| BG-02               | A bootstrap admin can't approve their own invites; no way to add a second approver | Approve disabled for the maker, with an explanation                            |
| BG-03               | Branch activation only works at institution level                                  | Guided "switch to All branches" state                                          |
| BG-08               | Maker not exposed; maker-checker 403 looks like a missing permission               | Audit lookup when `audit.view` is held; hedged 403 copy otherwise              |
| BG-11, BG-07        | Provisioning can stick; re-approving a PROVISIONING_IDP user is a 500              | "Provisioning identity" rows with no decision                                  |
| BG-22               | No notifications feed                                                              | Badge derived from three `size=1` reads                                        |
| BG-09, BG-16, BG-31 | Thin items, no `user_id` filters, hidden `.view` read-backs                        | `q=<email>` match, bounded scan flagged partial, gate on both codes            |

#### Carried-in deferred items

- Fill the `components/shell/tenant-notifications.tsx` stub: return `null` outside the administration workspace by checking the cached `getCurrentContextProfile()` itself, keep any Suspense inside that file, and never edit `app/(authenticated)/layout.tsx` or `app-shell.tsx`.
- The bell joins an already crowded header (the organisation name ellipsizes at 1200–1280 px once the business-date chip shows). Rule the header collapse first.
- Role names: use `getRoleIndex`.

#### Plan status

To be written just in time from the spec. Suggested breakdown (8 tasks):

1. Approvals contract, rules (control checks, actionable-count arithmetic) and service (queue reads, counts).
2. Decision actions: reuse 10's approve and revoke, plus 08's `activateBranch`.
3. Queue page with two tabs and the navigation item.
4. User approval detail page and decision bar.
5. Branch approval detail page and decision bar (All-branches guidance).
6. Tenant notifications badge, and the header-collapse ruling.
7. Fake API: the 202 provisioning path, pending seeds with maker audit events, `approvals` scenarios.
8. E2E, accessibility matrix and docs.

#### Tests

- Fake API `(proposed)`: the pending list filters already exist (`GET /tenant/users`, `GET /branches`); add the membership activate and revoke routes (with 10), the 202 path (user without an identity link becomes PROVISIONING_IDP) and 500 on re-approve; seed pending users with and without a role or branch, plus `user.invite` and `branch.create_draft` audit events whose maker is not the signed-in user. Scenarios `approvals` and `approvals-limited` (no `audit.view`). Seed prefix `12000000-0000-4000-8000-…`.
- Unit: the actionable-count arithmetic (clamp at 0), control checks, decision availability by maker and permission, the badge (null outside the workspace, counts per permission), the decision dialogs.
- E2E `e2e/approvals.spec.ts`: both tabs and their counts; the PROVISIONING_IDP row; approve with 200 and with 202; reject & revoke; the maker-disabled state; branch activation at All branches versus the guided state; the badge in the header. Axe (light and dark, 1280 and 375) on the queue and both detail pages, with the header at its crowded widths; manual visual and keyboard pass at 1440 and 375.

#### Live checks needed

- Reads: both queues and their counts, a user detail and a branch detail, the badge's three reads against the read budget.
- Mutations need a second identity (maker ≠ checker) and per-action approval. **Irreversible:** Approve on a user (202 starts real Keycloak provisioning and possibly an email), Reject & revoke (terminal, BG-28), and branch Activate (a live branch can then only be suspended or closed; a created draft can't be deleted, BG-01).

#### Risks and open questions

- The header is crowded: rule the collapse before adding the bell.
- The 200 versus 202 messages need an `ActionResult` success payload or state-derived copy (see layer 10).
- The maker lookup needs `audit.view`; decide the copy when it is missing.
- The badge adds three reads to every tenant navigation: keep it inside Suspense, memoise per request with `cache()`, and accept that it has no push updates.
- The two count reads are not atomic, so the subtraction can briefly misread; clamp at 0.
- BG-33: a role that grants `branch.activate` only at branch scope passes the UI gate and then gets a 403 at institution level.

### Layer 14 — Overview

#### Goal and scope

Spec §10.8 (`/admin`), §6.3 (a page issues at most about ten reads; header widgets stay in Suspense), §7.3 (teal `LinearProgress`). The tenant overview shows a Business date card, Pending approvals (up to five rows), Operational readiness (five items computed from live reads) and Recent activity (the five latest audit events). Nothing is mocked.
Today `/admin` renders only a `PageHeader`. It must keep the h1 "Administration Overview", which `e2e/context.spec.ts`, `e2e/shell.spec.ts`, `e2e/audit.spec.ts` and `app/(authenticated)/admin/page.test.tsx` assert. It depends on 12 (queue reads) and 13 (settings, already published).

#### Routes and permissions

| Route    | Permission (UI gate)                     | Notes                                                                                                                                                                                                                                    |
| -------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin` | None for the page; each card has its own | Business date `business_date.view`; Pending approvals `user.approve` + `user.view` and `branch.activate` + `branch.view`; readiness reads `tenant.view`, `settings.view`, `branch.view`, `membership.view`; Recent activity `audit.view` |

#### Screens and behaviour

- **Page.** `PageHeader` plus a grid of cards. Each card reads through its own `load()` and its own Suspense boundary, so one failure or missing permission never blocks the rest. A readiness item that can't be read says "Can't be checked with your permissions" rather than failing; a card the user could never act on is omitted.
- **Business date card.** Current date and status (`StatusChip`), linking to `/admin/business-date`. Dates render from their `dd-MM-yyyy` value with no time-zone shift.
- **Pending approvals.** Up to five rows: pending users first (newest first), then pending branches (newest first). Each row has a Review action to `/admin/approvals/users/[userId]` or `/admin/approvals/branches/[branchId]`, and the card links to the full queue. PROVISIONING_IDP users are noted separately because they are not actionable. Empty: "Nothing awaiting approval".
- **Operational readiness.** Five rows, each with a state and a teal progress bar: Institution profile (organisation ACTIVE and `default_timezone` and `base_currency` set); Branches (at least one ACTIVE and none PENDING_APPROVAL); People (at least two ACTIVE memberships, so maker-checker is possible, BG-02); Onboarding (no approvals awaiting a decision, identities still provisioning noted separately); Business date (status OPEN).
- **Recent activity.** The five latest audit events (actor, action, time in the organisation time zone), when `audit.view` is held, with a link to `/admin/audit`.
- **Forms, dialogs, focus, maker-checker.** None: the page is read-only and its links are the only interactive elements.

#### Wire endpoints

| Method and path                                                  | Permission / scope   | Quirks                                                                                                                                               |
| ---------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/tenant/business-date`                                      | `business_date.view` | Card and the Business date item; 403 in the platform context                                                                                         |
| GET `/tenant/users?membership_status=PENDING_APPROVAL`           | `user.view` (T)      | `size=5` for the rows (its `total_items` is the pending count); one `size=1` read with `user_status=PROVISIONING_IDP` for the already-approved count |
| GET `/branches?status=PENDING_APPROVAL`, `?status=ACTIVE&size=1` | `branch.view` (T)    | Pending rows and the Branches item                                                                                                                   |
| GET `/tenant`                                                    | `tenant.view`        | Organisation status, timezone and currency columns                                                                                                   |
| GET `/tenant/settings?size=100`                                  | `settings.view`      | Stored `default_timezone` and `base_currency`; an unset key shows a null default                                                                     |
| GET `/tenant/memberships?membership_status=ACTIVE&size=1`        | `membership.view`    | `total_items` must be at least 2                                                                                                                     |
| GET `/tenant/audit-events?page=0&size=5`                         | `audit.view`         | Newest first; 403 in the platform context                                                                                                            |

#### Reuse

- Consumes: `getBusinessDate` and `listBusinessDateHistory` (business-date service), `listSettings`, `listBranches`, `listAuditEvents`, `toAuditRows`, `AuditEventTable`, `getOrganisationTimeZone`, `formatInstant`, `formatBusinessDate`, `StatusChip`, `SectionCard`, `DescriptionList`, `EmptyState`, `ErrorState`, `PageHeader`, `NextLink`; 12's approvals service and counts `[plan]`; 10's membership and onboarding helpers `[plan]`.
- Produces: nothing for later layers. `ActivityList` (spec §9, compact audit events) was never built; either build it here or reuse `AuditEventTable` with five rows.

#### Backend gaps that shape it

| Gap          | Impact                                                                                             | Frontend workaround                                 |
| ------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| BG-04, BG-12 | Settings `PUT` fails (editing is behind `SETTINGS_EDIT_ENABLED`, off), and the keys are unenforced | Readiness reads the stored keys; see the risk below |
| BG-02        | A tenant needs two ACTIVE members for maker-checker                                                | The People item                                     |
| BG-15        | No counts                                                                                          | `size=1` reads                                      |
| BG-21, BG-22 | No close-of-business readiness, no notifications feed                                              | Not shown; the approvals count is derived (12)      |
| BG-09, BG-16 | Thin items; audit branch and actor quirks                                                          | Names resolved per visible row                      |
| BG-31        | Hidden `.view` read-backs                                                                          | Cards gated on the codes their reads need           |

#### Carried-in deferred items

- The teal `LinearProgress` for the readiness bars has no owner but this layer (spec §7.3). The theme's `MuiLinearProgress` already sets the 8 px, rounded shape and a `surfaces.tertiary` track, but the bar colour is still the default primary, and `ListNavigationProgress` shares that component. Add the teal through the readiness bars' own `color` or a variant, not a global default.

#### Plan status

To be written just in time from the spec. Suggested breakdown (5 tasks):

1. Overview rules (pure readiness evaluation with an "unknown" state) and service reads.
2. Teal progress styling and the `ReadinessCard`.
3. Business date and Pending approvals cards.
4. Recent activity (a compact `ActivityList` or `AuditEventTable`) and the page assembly: independent `load()` and Suspense per card, h1 kept.
5. Fake scenarios, E2E with the axe matrix, README.

#### Tests

- Fake API: no new endpoints if 10 and 12 have landed (business date, branches, memberships, pending queues, settings and audit routes exist). Add scenarios `overview-ready` (all five complete) and `overview-attention` (pending approvals, fewer than two members, closed date, unset settings, a PROVISIONING_IDP user). Seed prefix `14000000-0000-4000-8000-…`.
- Unit: `overview-rules.test.ts` covering each readiness rule as complete, incomplete and unknown; card ordering (users first, newest first, five-row cap); a card's failure doesn't block the others.
- E2E `e2e/overview.spec.ts`: both scenarios, a user with partial permissions (cards omitted or "can't be checked"), links to the queue and audit. Axe on `/admin`, light and dark, 1280 and 375; manual visual pass at 1440 and 375, including the readiness bars' contrast in both schemes.

#### Live checks needed

- Reads only: business date, pending queues (if dev has any), the tenant record, the settings keys, the ACTIVE membership count, the five audit events. Count the reads per page against the 600/min budget. No mutations; the dev business date is not touched.

#### Risks and open questions

- BG-04 makes `PUT /tenant/settings/{key}` fail, so a tenant whose `default_timezone` and `base_currency` were not set through `initial_settings` at creation can never complete "Institution profile". The organisation record always carries a timezone and a currency (`GET /tenant`), so decide whether the rule reads the settings keys (spec §10.8 wording) or the organisation columns. The `PUT` live probe is still pending.
- The People rule needs `membership.view`; decide between "unknown" and hiding the item without it.
- Reads per page: about nine (business date; pending user rows plus the provisioning count; pending branch rows plus the ACTIVE count; tenant; settings; memberships; audit), because each rows read already returns `total_items`. Keep them parallel and independent.
- Depends on 12's queue contract; if 14 lands first it must build its own pending reads.
- The page keeps its existing h1; any copy change breaks four existing assertions.

### Layer 16 — Platform: SACCO institutions

#### Goal and scope

Spec §11.1 (directory and create wizard), §11.2 (record: Overview and Provisioning tabs and the hero lifecycle; the Branches and Users tabs are 17's), §7.3 (Stepper overrides), §9 (list, record, form and wizard patterns; UTC in the platform workspace). It rebuilds `/platform-admin/tenants` on the list kit, adds the four-step create wizard, amend and the record lifecycle, and migrates only the tenant mappers of the old read-only platform module to the contract pattern.
It also produces the Stepper theme and `WizardForm` that 11's invite wizard builds on. Plan: `docs/superpowers/plans/2026-10-01-admin-parity-16-platform-tenants.md` (intended path; ready, not started, and not yet committed to the repo).
Every new name in this section (the `tenants/` module, `WizardForm`, `TenantDraftWizard`, `visibleTenantTotal`, `tenant_code_taken`, the routes under `[tenantId]/`, the fake routes and scenario) is `[plan]`, from plan 16. Names from earlier layers are published.

#### Routes and permissions

| Route                                             | Permission (UI gate)                                                                                                                                                                                     | Notes                                                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `/platform-admin/tenants`                         | `tenant.view` (nav item). Create needs `tenant.create` + `tenant.view`                                                                                                                                   | Directory; the platform organisation is hidden (BG-29)                                            |
| `/platform-admin/tenants/new`                     | `tenant.create` + `tenant.view`                                                                                                                                                                          | Wizard; the code pre-check and the redirect both read the directory                               |
| `/platform-admin/tenants/[tenantId]`              | `tenant.view`                                                                                                                                                                                            | Overview tab and hero lifecycle (`[tenantId]/(record)/`); the platform organisation's id is a 404 |
| `/platform-admin/tenants/[tenantId]/provisioning` | `tenant.view`; Retry needs `tenant.bootstrap_retry` + `tenant.view`                                                                                                                                      | Timeline from status and bootstrap status, failure code                                           |
| `/platform-admin/tenants/[tenantId]/amend`        | `tenant.update_draft` + `tenant.view`                                                                                                                                                                    | DRAFT only; outside the `(record)` group, so no hero                                              |
| Hero actions                                      | Submit `tenant.submit_for_approval`; Approve `tenant.approve`; Reject `tenant.reject`; Suspend `tenant.suspend`; Reactivate `tenant.reactivate`; Deprovision `tenant.deprovision` (each + `tenant.view`) | By status (below)                                                                                 |
| `/platform-admin`                                 | None                                                                                                                                                                                                     | 16 changes only its data call (one `size=1` count); the page is 17's                              |

#### Screens and behaviour

- **Directory.** Columns Institution (name, sorts `displayName`), Code (`tenantCode`), Country (`countryCode`), Lifecycle (status, not sortable), Created (`createdAt`); default `createdAt` DESC, 10 per page; no row hover; a no-wrap date cell; long names truncate with the full value in `title`. Filters: search (`q`: code or name), Status (all nine states), Country (every `Intl` region plus any URL value, so it stays selectable), Created from and to (datetime in a UTC page; "to" stores the minute's last millisecond). The platform organisation's row is filtered out, and the result label uses `visibleTenantTotal` (exact unfiltered; a filtered count can read one high). The pagination footer keeps the backend's metadata.
- **Create wizard** (`TenantDraftWizard` on `WizardForm`): Institution (code `^[a-z0-9-]{3,32}$`, display name 2–100, legal name ≤ 100, registration number ≤ 50, country, base currency, time zone, first business date) → First administrator (email, username, display name, phone E.164 required, send application invite) → Initial settings (`default_timezone`, `base_currency`, `audit_retention_days`, the only way to set retention; the two maker-checker switches and auto-advance aren't offered because they're unenforced) → Review with Edit buttons. One idempotency key across the wizard; a server field error returns to its step; the error summary reads "Check these fields". The tenant code is checked first (`q=<code>`, one page of 100, exact case-insensitive match); a hit becomes the frontend-only problem code `tenant_code_taken`, mapped to the code field.
- **Amend.** Three steps; the code is shown read-only and sent unchanged; legal name, registration number and the first administrator are re-entered because the platform never returns them (BG-14); no settings or business date are sent. A non-DRAFT tenant shows "Only a draft can be amended" with a link back to the record.
- **Record.** `RecordHero` (icon avatar, display name as the h1, status chip). Actions by status: DRAFT → Amend, Submit; PENDING_APPROVAL → Approve, Reject; ACTIVE → Suspend, Deprovision; SUSPENDED → Reactivate, Deprovision. Overview lists code, name, country, currency, time zone, lifecycle, bootstrap status and UTC timestamps. Provisioning shows a timeline, the failure code and **Retry bootstrap** when FAILED. There are no Settings or Audit tabs (BG-12, BG-06).
- **Dialogs.** Submit, Approve and Retry bootstrap use `ConfirmDialog` and send `{}`. Reject, Suspend and Deprovision use `ReasonDialog` with a required 3–500 reason; Reactivate takes an optional one; Reject and Deprovision use error tone. Deprovision is CRITICAL: the tenant code is typed back, checked client- and server-side (a UX guard; the permission is the gate). Reject is terminal and the code stays taken (BG-28).
- **Maker-checker.** Approve needs a different person from the creator and the submitter, but the platform context can't read either (BG-08), so Approve stays on offer for its maker and a 403 is explained in the dialog as "permission or maker-checker".
- **Focus and states.** After a transition focus goes to the same action if it is still offered, else the first offered action, else the record title (also from an unmount cleanup when the action set empties). 404 → `notFound()`; 403 → `ForbiddenState`; schema drift → `ErrorState` with a reference; a stale context returns to `/select-context?next=<that tab>`. Every instant is UTC and labelled; every dialog and the wizard send `contextOrganisationId`.

#### Wire endpoints

| Method and path                | Permission / scope                           | Quirks                                                                                                                                                        |
| ------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/platform/tenants`        | `tenant.view` (P)                            | `q`, `status`, `country`, `created_from`, `created_to`; sort ∈ tenantCode, displayName, countryCode, createdAt (else 500); includes the PLATFORM organisation |
| POST `/platform/tenants`       | `tenant.create` (P)                          | 201 `TenantDraftResult`; a duplicate code is a 500 (pre-checked); 422 `accounting.currency_invalid`, `invalid_operation`; `admin.phone_e164` required         |
| GET `/platform/tenants/{id}`   | `tenant.view` (P)                            | No legal name, registration number, admin or status reason                                                                                                    |
| PATCH `/platform/tenants/{id}` | `tenant.update_draft` + `tenant.view`        | DRAFT only (409); replaces every field; settings and business date ignored                                                                                    |
| POST `…/{id}/submit`           | `tenant.submit_for_approval` + `tenant.view` | `{}` sent                                                                                                                                                     |
| POST `…/{id}/approve`          | `tenant.approve` + `tenant.view`             | **202**; 403 when the approver is the creator or the submitter                                                                                                |
| POST `…/{id}/reject`           | `tenant.reject` + `tenant.view`              | `{ reason }` 3–500; terminal; an unknown id is a 500 (never sent)                                                                                             |
| POST `…/{id}/suspend`          | `tenant.suspend` + `tenant.view`             | `{ reason }` 3–500; an unknown id is a 500                                                                                                                    |
| POST `…/{id}/reactivate`       | `tenant.reactivate` + `tenant.view`          | `{}` or `{ reason }`                                                                                                                                          |
| POST `…/{id}/deprovision`      | `tenant.deprovision` + `tenant.view`         | `{ reason }` 3–500; from ACTIVE or SUSPENDED                                                                                                                  |
| POST `…/{id}/bootstrap/retry`  | `tenant.bootstrap_retry` + `tenant.view`     | **202**; FAILED only (409)                                                                                                                                    |

#### Reuse

- Consumes: `ListToolbar` (search, select and datetime kinds with `endOfMinute`), `TablePaginationBar`, `ListNavigationProvider`/`ListNavigationProgress`/`ListBusyRegion`, `RecordHero`, `RecordTabs`, `StatusChip`, `DescriptionList`, `SectionCard`, `CopyIdButton`, `ConfirmDialog`, `ReasonDialog` (with `tone` and `fields`), `ForbiddenState`, `EmptyState`, `ErrorState`, `PageHeader`, `useToast`; `load`, `runServerAction`, `apiGet`, `apiPost`, `apiPatch`, `parseListSort`, `sortQuery`, `parsePaging`, `hrefWith`, `toSearchParams`, `toQueryString`, `isoToBusinessDate`, `formatBusinessDate`, `applyFieldErrors`; `isPlatformOrganisation` (`config/application-context.ts`); 08's `isTimeZone` (`branches/branch-rules.ts`); `focusRecordTitle` (08's copy today; the kit file `[wip]` once 09 is in the base).
- Produces for later layers `[plan]`: the Stepper overrides (`MuiStepper`, `MuiStep`, `MuiStepLabel`, `MuiStepIcon`) and `WizardForm`/`WizardStep` (`components/data-display/wizard-form.tsx`) for 11; the tenant contract, query, rules, service and actions (`modules/platform-administration/tenants/`) for 17; the `[tenantId]/(record)/` route group, to which 17 adds its Branches and Users tabs; `TenantLifecycleActions`, `RetryBootstrapButton`, `ProvisioningTimeline`, `TenantDirectoryTable`; the `platform-tenants` fake routes and scenario for 17 to extend.

#### Backend gaps that shape it

| Gap   | Impact                                                                        | Frontend workaround                                                             |
| ----- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| BG-06 | No platform audit                                                             | No Audit tab; the fake writes no audit rows                                     |
| BG-07 | A duplicate tenant code and unknown ids on reject or suspend are 500s         | Code pre-check; ids validated before any call                                   |
| BG-08 | Creator and submitter are unreadable from the platform context                | Approve stays on offer; the 403 is explained as permission or maker-checker     |
| BG-12 | The settings catalogue is unenforced; `audit_retention_days` is platform-only | The Initial settings step offers only the enforceable keys plus retention       |
| BG-14 | Legal name and registration number are write-only; `PATCH` wipes them         | Amend re-asks for them and the first administrator                              |
| BG-24 | Bootstrap can flip COMPLETED → FAILED from unrelated invitee failures         | Provisioning tab shows what the backend says; Retry is offered only when FAILED |
| BG-28 | Reject is terminal and the code stays taken                                   | Warning in the Reject dialog                                                    |
| BG-29 | The PLATFORM organisation appears in tenant search                            | Filtered out; the count subtracts it when known; its record URL is a 404        |
| BG-31 | Mutations also need `tenant.view`                                             | Every gate checks both codes                                                    |

#### Carried-in deferred items

- Consume `ListToolbar`'s `search` kind (`{ kind: 'search'; name; label; placeholder? }`: trimmed commit on Enter or blur, resets `page`, 100-character cap) and `lib/api/list-sort.ts` (`parseListSort`, `sortQuery`; an off-allow-list `sort_by` is a backend 500).
- The platform tenant directory keeps its pre-shell styling (outlined status pills, empty-looking filter selects), which the shell layer left for this migration; `AGENTS.md` also lists `platform-pagination.tsx` as a pre-pattern exception, and 16 removes it.
- The platform context cannot read tenant roles: use only 09's types and enums (`ROLE_SCOPE_TYPES`, `ROLE_STATUSES`, the contract types), never the tenant role routes.

#### Plan status

Ready, not started (8 tasks). The plan's base needs 08 and the kit; it consumes nothing from 10.

| Task | Scope                                                                                                                                                                                                          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `modules/platform-administration/tenants/`: `tenant-contract`, `tenant-query`, `tenant-rules` (action availability, provisioning timeline, `visibleTenantTotal`, form schemas, body builders)                  |
| 2    | `tenant-service` (`listTenants`, `getTenant`, `tenantCodeTaken`) and `tenant-actions` (create, amend, submit, approve, reject, suspend, reactivate, deprovision, retry bootstrap)                              |
| 3    | Fake API: lifecycle routes in `routes/platform-tenants.mts`, the `platform-tenants` scenario, `TENANT_SCENARIO_IDS`, `FakeOrganisation.createdBy?` and `submittedBy?`, `e2e/fake-api-platform-tenants.spec.ts` |
| 4    | Stepper theme (four `MuiStep*` keys) and `WizardForm`                                                                                                                                                          |
| 5    | The record under `[tenantId]/(record)/`: hero lifecycle, Overview, Provisioning, `RetryBootstrapButton`                                                                                                        |
| 6    | The directory (`TenantDirectoryTable`), the overview's one-count read, and retiring the old tenant table, pagination and chip code with their page tests                                                       |
| 7    | `TenantDraftWizard` with the `new` and `amend` pages                                                                                                                                                           |
| 8    | `e2e/platform-tenants.spec.ts` with the axe matrix; README, AGENTS and backend-gaps edits                                                                                                                      |

Plan rulings in short: the base must provide 08's `search` toolbar kind, `hrefWith`, `applyFieldErrors`, `isTimeZone` and `focusRecordTitle` (never copy them locally); only the tenant mappers migrate, the tenant user and branch mappers stay for 17, and `PlatformPageShell` stays for the overview whose h1 "Platform overview" (asserted by `e2e/shell.spec.ts`) is kept; the platform organisation is hidden and its record URL is a 404; Approve stays on offer for its maker; the code pre-check uses a synthesized `tenant_code_taken` 409; amend is a full replacement with the code read-only; violations stay unmapped; every instant is UTC; the gating includes the `.view` read-back; `e2e/platform-administration.spec.ts` keeps its flows and changes only two assertions (the h1 becomes "SACCO institutions", and pagination moves to `TablePaginationBar`); obsolete page tests are deleted, not rewritten.

#### Tests

- Fake API (Task 3): the lifecycle routes in the table above. It mirrors the maker-checker refusal (a submitter who didn't draft; a maker who drafted and submitted), the 202 on approve and retry, replayed approval returning the stored 202 with `Idempotency-Replayed`, and `invalid_json` on unknown properties. Scenario `platform-tenants` with `TENANT_SCENARIO_IDS` (`umoja`, `harambee`, `mwangaza`, `pwani`, `kilimo`, `nairobiMetro`, `otherOperator`): a DRAFT, two PENDING_APPROVAL (one in Uganda; one submitted by the signed-in user), an ACTIVE with bootstrap FAILED, a SUSPENDED, a REJECTED with a 100-character name (Tanzania), the existing ACTIVE tenant, and the hidden platform organisation (eight organisations, seven institutions). `platform-operator` stays the read-only gating scenario. Seed prefix `16000000-0000-4000-8000-…`.
- Unit: contract drift, query parsing (an off-list sort, status, country or date never reaches the backend), rules, service (a malformed id rejects), actions, `WizardForm`, lifecycle dialogs (typed-back code, `contextOrganisationId`), the timeline, the directory table, the wizard (retry with the same key, return to a taken code).
- E2E `e2e/platform-tenants.spec.ts`: directory filters, sort and the hidden platform organisation; the create wizard with the pre-check; approve, reject, suspend, reactivate, deprovision, bootstrap retry, amend; a stale context returning to the same tab; read-only gating. Axe on the directory, wizard (with errors), the 100-character record, Provisioning, Amend and the Deprovision dialog; manual pass at 1440 and 375.

#### Live checks needed

- Reads: the directory sorted by each field in both directions (a 500 means the allow-list drifted); the platform organisation absent and its record URL a 404, with the count checked against the footer; a real tenant's record and Provisioning tab; the wizard pre-check with an existing code (no POST in the network panel); a non-DRAFT tenant's amend URL showing "Only a draft can be amended".
- Mutations on a throwaway code such as `zz16-live-check`, each approved separately: create (**permanent**: there is no delete and the code stays taken); amend; submit; approve only with a second platform identity, because it **really provisions** (a Keycloak identity, possibly an email), otherwise confirm the creator's own approve is refused with a 403; reject as the cleanup (**terminal**). Suspend, reactivate, deprovision and retry only on an approved throwaway tenant; **deprovision is irreversible**, so skip it unless explicitly approved.

#### Risks and open questions

- The plan file isn't committed to the repo yet; commit it (with the docs-plan commit) before the build starts.
- `ReasonDialog` already has `tone?: 'default' | 'error'` in the published stack, so Ruling 8's conditional and Task 5's "delete the `tone` line" fallback no longer apply; keep `tone="error"` on Reject and Deprovision.
- The plan imports `focusRecordTitle` from 08's `branch-lifecycle-actions.tsx`, which forces tests to mock 08's branch actions. If 09 is in the base, import the kit file `components/data-display/focus-record-title.ts` instead (open).
- Stepper ownership: earlier deferred-item notes still list the overrides under 11, but the ownership table and this plan give them to 16 (see layer 11).
- BG-29: a filtered count can read one high on pages without the platform row; the code pre-check scans one page of 100 matches; the country list includes a few non-country `Intl` regions (EU, UN).
- Fold 16's currency and time-zone option helpers into 13's `settings-rules.ts` (`currencyLabel`, `settingOptions` exist) once both are in the stack, to avoid two copies.

### Layer 17 — Platform: records, users and overview

#### Goal and scope

Spec §11.2 (the record's Branches and Users tabs), §11.3 (platform users), §11.4 (platform overview), §8 (platform notifications). It adds to 16's record the Branches tab (list, detail, create draft) and Users tab (list, detail, global lifecycle), the `/platform-admin/users` page, the KPI overview with a Needs attention table, and the platform notifications badge that fills `components/shell/platform-notifications.tsx` (it returns `null` today).
The platform context can't call tenant routes (§11 intro): there is no Audit or Settings tab (BG-06, BG-12) and no tenant roles (only 09's types and enums are usable). 17 also migrates the remaining platform mappers (tenant users, branches) to the contract pattern and owns `KpiTile`.

#### Routes and permissions

| Route (all proposed except the first two)                         | Permission (UI gate)                                                                          | Notes                                                                       |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `/platform-admin`                                                 | KPI tiles need `tenant.view`; the operators tile needs `user.view`                            | Overview; keep the h1 "Platform overview" (asserted by `e2e/shell.spec.ts`) |
| `/platform-admin/users`                                           | `user.view` (nav item to add in `platform-administration-navigation.ts`)                      | Members of the platform organisation                                        |
| `/platform-admin/users/[userId]`                                  | `user.view`; Suspend `user.suspend`, Reactivate `user.activate`, Deactivate `user.deactivate` | Detail and global lifecycle                                                 |
| `/platform-admin/tenants/[tenantId]/branches`                     | `branch.view` (P)                                                                             | Tab under 16's `(record)/` group                                            |
| `/platform-admin/tenants/[tenantId]/branches/[branchId]`          | `branch.view` (P)                                                                             | Read-only detail                                                            |
| `/platform-admin/tenants/[tenantId]/branches/new`                 | `branch.create` (P) and active membership of that tenant (BG-18)                              | Create draft, with the BG-18 warning                                        |
| `/platform-admin/tenants/[tenantId]/users` and `…/users/[userId]` | `user.view` (P); lifecycle as above                                                           | Tab and detail                                                              |

#### Screens and behaviour

- **Branches tab.** Search (code, name), Status, Type; sort by branch code, name, type, status or created; columns branch (name and code), type, status, created (list items carry nothing else); default `createdAt` DESC; 10 per page. Detail shows code, name, type, parent, time zone, status, last status reason, timestamps, and opened or closed dates only when present; the address is never returned (BG-13). No lifecycle controls: the platform API has no submit or activate for tenant branches. **Create draft** reuses 08's draft fields (code `^[A-Z0-9_-]{2,20}$`, name 2–100, free-text type with suggestions, parent, time zone) and warns that the backend allows it only when the platform administrator is also an active member of that tenant (BG-18).
- **Users tab.** Search (username, email, name), User status, Membership status; fixed newest-first order, no sort. Detail: the summary plus global lifecycle: Suspend (ACTIVE; reason 3–500), Reactivate (SUSPENDED; `{}` with an optional reason), Deactivate (ACTIVE; reason 3–500). The copy says the action applies to the user's account in every institution; Deactivate has no way back through the API.
- **Platform users.** The same list and detail for `GET /platform/tenants/{PLATFORM_ORGANISATION_ID}/users` (the id comes from `serverEnv.PLATFORM_ORGANISATION_ID`). A cross-tenant global directory is a gap (BG-10).
- **Overview.** KPI tiles from `size=1` counts: active institutions (platform organisation excluded), pending approval, draft, suspended, and platform operators; a Needs attention table of institutions pending approval and drafts, each linking to its record. Replaces `PlatformPageShell`; each tile degrades independently.
- **Notifications badge.** Institutions pending approval (when `tenant.approve`), one `size=1` read; the popover links to the filtered directory. Returns `null` outside the platform workspace, keeps its own Suspense, and never edits `app/(authenticated)/layout.tsx` or `app-shell.tsx`; it sits between `AppSwitcher` and `ThemeModeMenu`.
- **Dialogs, focus, states.** Lifecycle uses `ReasonDialog` (Reactivate optional) with `contextOrganisationId` and the standard focus rule (replacement action, else first enabled, else record title). 404 → `notFound()`; 403 → `ForbiddenState`; drift → `ErrorState`. A 403 on branch create is explained as "you must also be a member of this institution". Times are UTC.
- **Maker-checker.** None in this layer.

#### Wire endpoints

| Method and path                             | Permission / scope                         | Quirks                                                                                                         |
| ------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| GET `/platform/tenants/{id}/branches`       | `branch.view` (P)                          | `q`, `status`, `type`, paging, sort as `/branches`; no branch restriction; items are `BranchSummary`           |
| GET `/platform/tenants/{id}/branches/{bid}` | `branch.view` (P)                          | `BranchDetail`; `address` is always `{}`; `opened_on` and `closed_on` are never set                            |
| POST `/platform/tenants/{id}/branches`      | `branch.create` (P) and (T in that tenant) | 201 `BranchDraftResult`; 403 unless the caller is an active member of the tenant (BG-18)                       |
| GET `/platform/tenants/{id}/users`          | `user.view` (P)                            | `q`, `user_status`, `membership_status`; newest user first; `/tenants/{PLATFORM}/users` lists platform members |
| GET `/platform/tenants/{id}/users/{uid}`    | `user.view` (P)                            | `UserInTenantSummary`                                                                                          |
| POST `/platform/users/{uid}/suspend`        | `user.suspend` (P)                         | `{ reason }` 3–500; ACTIVE only (409); `UserLifecycleResult`                                                   |
| POST `/platform/users/{uid}/reactivate`     | `user.activate` (P)                        | Body required (`{}` minimum); SUSPENDED only                                                                   |
| POST `/platform/users/{uid}/deactivate`     | `user.deactivate` (P)                      | `{ reason }` 3–500; ACTIVE only                                                                                |
| GET `/platform/tenants?status=…&size=1`     | `tenant.view` (P)                          | KPI counts and the badge; includes the PLATFORM organisation (BG-29), so subtract it from the active count     |

#### Reuse

- Consumes: 16's `(record)/` route group, tenant contract and service, `TenantLifecycleActions` patterns, `ForbiddenState`/`ErrorState` handling `[plan]`; 08's branch contract and rules (`branchPageSchema`, `branchDetailSchema`, `branchDraftSchema`), `BranchDirectoryTable` and `isTimeZone`, since the wire shapes match and only the paths differ; 10's users contract and onboarding labels `[plan]` (spec §6.1 says the platform module reuses the administration user and branch contracts); `ListToolbar`, `TablePaginationBar`, `RecordHero`, `RecordTabs`, `ReasonDialog`, `StatusChip`, `DescriptionList`, `SectionCard`, `PageHeader`, `parseListSort`, `sortQuery`, `isPlatformOrganisation`, `load`, `runServerAction`; the notifications stub file.
- Produces: `KpiTile` (spec §9; not built yet), the platform notifications badge, the contract-pattern replacements for the old tenant-user and branch mappers, types, queries and service in `modules/platform-administration/` (delete the old ones and `PlatformPageShell`), and the README and AGENTS updates for the finished platform workspace.

#### Backend gaps that shape it

| Gap          | Impact                                                                     | Frontend workaround                                                     |
| ------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| BG-06, BG-12 | No platform audit; settings not readable from the platform context         | No Audit or Settings tab                                                |
| BG-10        | No global user directory or global user read                               | Platform users = platform-organisation members; tenant users per tenant |
| BG-15        | No counts                                                                  | `size=1` reads for the KPIs                                             |
| BG-18        | Platform branch create needs tenant membership                             | Warning on the form; a 403 is explained                                 |
| BG-22        | No notifications feed                                                      | Badge derived from one `size=1` read                                    |
| BG-29        | The PLATFORM organisation appears in tenant search                         | Excluded from counts and rows                                           |
| BG-09, BG-13 | Thin list items; branch address never returned, no update, dates never set | Lists show only what items carry; no address or edit                    |
| BG-24, BG-30 | Bootstrap status flips; wrong-context 403s carry a sentence as the code    | Provisioning shown as reported; generic permission and context errors   |

#### Carried-in deferred items

- Fill the `components/shell/platform-notifications.tsx` stub (renders `null` today) under the same rules as 12, mirrored: `null` outside the platform workspace, its own Suspense, and no edits to `app/(authenticated)/layout.tsx` or `app-shell.tsx`.
- The same 09 constraint as 16: only 09's types and enums, never the tenant role routes.

#### Plan status

To be written just in time from the spec. Suggested breakdown (8 tasks):

1. Platform contracts for tenant users and branches (reuse 08's and 10's where the wire matches), query parsers, services; migrate off the old mappers.
2. Record Branches tab: list, detail, and create draft with the BG-18 warning.
3. Record Users tab: list and detail, plus the global lifecycle actions.
4. `/platform-admin/users` page, detail, and the navigation item.
5. `KpiTile`, the overview KPIs and Needs attention table, replacing `PlatformPageShell`.
6. Platform notifications badge.
7. Fake API: branches, users and user-lifecycle routes (with the BG-18 403) and a `platform-records` scenario or an extended `platform-tenants`.
8. E2E, accessibility matrix, docs (README, AGENTS, backend-gaps).

#### Tests

- Fake API `(proposed)`: `GET /platform/tenants/:id/branches`, `…/branches/:bid`, `POST …/branches` (403 unless the caller is an active member of that tenant), `GET …/users`, `GET …/users/:uid`, `POST /platform/users/:uid/{suspend,reactivate,deactivate}` (409 for the wrong state) and the platform organisation's own member list. Put the mutation codes (`branch.create`, `user.suspend`, `user.activate`, `user.deactivate`, `tenant.approve`) only in the layer's own scenario so `platform-operator` stays read-only. Seed prefix `17000000-0000-4000-8000-…`.
- Unit: contract and drift, query parsing, lifecycle availability by user status and permission, KPI arithmetic (platform organisation excluded), the badge (null outside the workspace), dialogs.
- E2E `e2e/platform-records.spec.ts` and `e2e/fake-api-platform-records.spec.ts`: branch list, detail, create-draft success and the 403 explanation; user list, detail and each lifecycle action; platform users page; overview tiles and table; the badge. Axe on each page, light and dark, 1280 and 375, including a 100-character name; manual visual and keyboard pass at 1440 and 375.

#### Live checks needed

- Reads: a real tenant's branches and users lists and details; the platform users list; each KPI count (check that the active count excludes the platform organisation); the badge count.
- Mutations (each approved): create a branch draft on a tenant the signed-in operator belongs to — **permanent** (no draft delete, BG-01) and a 403 otherwise (BG-18). Global user Suspend then Reactivate on a throwaway user only: it **applies across every institution** the user belongs to. **Global Deactivate is irreversible** through the API (reactivate accepts SUSPENDED only); never run it on a real operator or tenant user.

#### Risks and open questions

- Does 17 reuse 10's users contract (spec §6.1 says it should, and the stack order puts 10 first) or migrate the platform user mappers on their own? Settle it when writing the plan.
- The blast radius of the global lifecycle actions: the copy must say they apply to every institution.
- Platform users are the platform organisation's members only; a global directory isn't possible (BG-10).
- The active-institutions KPI must subtract the platform organisation (BG-29); a filtered count can read one high elsewhere.
- Route shapes for tenant user and branch details are proposed here; the spec fixes only the tab names.
- `KpiTile` and `ActivityList` (spec §9) don't exist yet; `KpiTile` is 17's, and 14 may need `ActivityList`.

## 5. Cross-layer backlog

### 5.1 Kit and theme (additive fixes only)

- **Cross-tab guard false positive.** `runServerAction`'s guard treats an unresolved profile (no context, or an expired
  one) as a mismatch, and reports "you switched organisation in another tab". It should tell the two apart.
- **Server field errors.** Backend `validation_failed` violations aren't mapped to fields, so server-only field errors
  land in the form summary. An additive `BackendApiError.violations`, plus mapping in `runServerAction`, is still
  open.
- **ReasonDialog limit.** It caps every reason at 500 characters, though the contract states no limit. It needs a
  per-dialog maximum.
- **Rate limits and 403 copy.** A 429 shows a generic "Please wait a moment" with no `Retry-After` countdown (spec
  §6.7), and 403 sentence codes stay generic.
- **Clipped focus rings, inside scroll containers** (WCAG 2.4.11 is still met):
  - the `TablePaginationBar` next-page ring;
  - actor links at 375 px;
  - `RecordTabs` focus moved by the arrow keys at the scroller's ends.
- **Narrow-width polish:**
  - `RecordHero` squeezes long names at 375 px;
  - modal widths differ from the prototype's 560 px (ConfirmDialog/ReasonDialog `xs`, the context dialog);
  - the toast width.
- **ListToolbar.** The datetime Enter commit drops focus to `<body>`. "Clear filters" drops `size` and is always shown.
  Search commits on Enter or blur rather than on a debounce (spec §9). Every search list is affected: branches,
  roles and 16.
- **UserPicker** (reused by 09 and 10). A failed search shows only in `noOptionsText`, with no live-region
  announcement. Native `required` passes on typed-but-unselected text; the server's zod rejects it.
- **Housekeeping.**
  - Adopt 07's `SectionCard` in the profile's `ProfileSection` and in `RecordAuditTab`'s header.
  - The contrast gate doesn't yet lock `palette.focus` against surfaces at 3:1.
  - The soft neutral chip and table-row hover share one surface token.
- **Flaky test.** `user-picker.test.tsx`'s "searches once per pause" can flake under a full parallel run: the 300 ms
  debounce fires before typing starts.

### 5.2 UI rulings still needed (theme-wide decisions)

- **Focus ring on outlined fields.** They show MUI's notched 2 px primary border, not the `palette.focus` outline ring.
  Spec §7.3 says "3 px at 35%".
- **Touch targets under 44 px:**
  - CopyIdButton and the pagination arrows, at 32 px;
  - small buttons, at 36 px.

  They pass WCAG 2.5.8 (24 px) but miss the 44 px guideline.

- **Dark tooltip.** Its background almost matches the paper surface.
- **Horizontal-scroll cue.** Wide tables at 375 px give no sign they scroll: audit, business-date history, branch
  directory, branch users and audit. Pick one affordance kit-wide.
- **Header at 1200–1280 px.** The business-date chip squeezes the organisation name. The prototype's icon-only chip
  step was deferred.
- **Context dialog.**
  - It opens with an empty Organisation select. The prototype preselects the current organisation and branch, as a
    display-only preselect.
  - Its content flashes "Loading organisations…" while it closes: `reset()` should move to `onExited`.
  - The context trigger shows MUI's focus ripple on top of the ring.
- **Business date.** A fresh load in dark mode showed a focus ring on "Start close of business" with no interaction,
  seen while capturing PR screenshots. Check that focus moves only after a status change.

## 6. Live checks still pending

Rules for every batch:

- A person signs in on the remote identity provider themselves.
- Reads come first, and each mutation is approved one at a time.
- The dev business date is never advanced.
- A local dev server talking to the dev API needs `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000`.
  Without it, Node 24's happy-eyeballs turns slow connects into fast 502s.

| Batch | Identity                                            | Covers                                                                                                                                                                                                                                                                                                 |
| ----- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| L1    | tenant admin (audit.view, business_date.*)          | 06 audit happy path; 07 business date reads, then start → complete → reopen close of business on the named tenant (never advance); 07b record audit tab reads; 15 profile reads plus the context-switch mutations, spaced for the 20/min selection limit; confirm the Keycloak account-console path    |
| L2    | tenant admin, plus a second admin for maker-checker | 08 branch reads and mutations (Activate needs a second identity; a live create is permanent, BG-01); 09 role reads and mutations (a created role stays as DISABLED, BG-27; never revoke your own tenant-admin assignment); 13 settings reads plus the `PUT` probe that decides `SETTINGS_EDIT_ENABLED` |
| L3    | platform operator; a second operator for approve    | 16 reads plus the creator's own 403 on approve. Create keeps the tenant code forever, and approve provisions the identity provider (possibly email): each only with explicit approval. Then 10, 11, 12, 14 and 17 as they land                                                                         |

The local Keycloak smoke spec, `e2e/keycloak-smoke.spec.ts` (`pnpm test:e2e:keycloak`), was edited but never run. It
lacks the context-selection step.

## 7. Backend gaps

The register is [`docs/backend-gaps.md`](../../backend-gaps.md): 33 gaps (BG-01…BG-33), each with evidence, impact
and the frontend's workaround. At its registration, layer 09 adds **BG-34**: a role description can be replaced but
not removed, from source reading.

The gaps that block or shape the remaining layers most:

- **BG-01, no approval-request model.** Approvals (12) can only approve, or reject and revoke. There is no
  return-for-changes, no resubmission and no branch rejection.
- **BG-07, business-rule failures return 500.** The invite wizard (11) must pre-validate every backend rule in spec
  §10.5.
- **BG-08, maker identity isn't exposed.** Maker-checker 403s look like missing permissions (10, 12, 16).
- **BG-09, no `user_id` filters.** The user record (10) and approvals (12) use bounded scans, marked "partial".
- **BG-10, no global user directory.** It limits platform users (17).
- **BG-15, no aggregate counts.** Overview (14) and the record heroes use `size=1` totals.
- **BG-22, no notifications endpoint.** The notifications badge (12) derives its count from the pending queues.
- **BG-29, the platform organisation appears in tenant search** (16).
- **BG-33, `/auth/me` permission codes carry no scope.** Tenant-scoped navigation and drawer gates can't be told apart
  from branch-scoped ones (08 onward).

## 8. How to execute a layer

1. **Plan just in time** from the spec, with superpowers:writing-plans. Use the format of the existing layer plans:
   Global Constraints, Review Focus, tasks with Interfaces, exact code and tests. Author it against a pinned snapshot of
   the stack top. Review it adversarially, apply one fix pass, and rule on the author's open questions before the
   build.
2. **Build task by task** (superpowers:subagent-driven-development). For each task:
   - implement it, with TDD;
   - review it for spec compliance and quality;
   - run fix rounds if needed;
   - record any ruling in the layer's notes.
3. **Run the layer gate.**
   - `pnpm check`, `pnpm build`, and the full `pnpm test:e2e` against the fake API, run in the foreground in chunks
     of at most 8 minutes, sharding when needed.
   - Then the visual and accessibility pass: light and dark, 1440 and 375 px, the keyboard pass, axe, and the
     ui-ux-pro-max pre-delivery checklist.
4. **Run the final review** (several lenses plus skeptics, on a pinned head), then one fix wave with a scoped
   re-review.
5. **Integrate** onto the current stack top: rebase, re-run the gate, and resolve conflicts by union where §3.6 says.
6. **Publish.**
   - **Squash.** Make one conventional commit per layer: `git commit-tree -S <layer tip>^{tree} -p <current stack
top>`. `commit-tree` ignores `commit.gpgsign`, so always pass `-S`.
   - **Push** with one `git push --atomic` with per-branch `--force-with-lease`, over **HTTPS**, from a worktree
     whose checked-out tree is the stack top. The pre-push hook verifies the working tree, not the pushed refs.
     Over SSH, the connection opened before the ten-minute hook gets dropped.
   - **Open the PR** with `gh pr create --draft --base <previous layer branch>`, then append it with
     `gh stack link 49 <PR number>`. Numeric arguments avoid another push.
   - **Write the PR body** with summary, changes, screenshots, verification and stack navigation. Capture screenshots
     against the fake API only; the repo is public.
7. **Handle review comments.** Triage each comment against the code. Fix it in the owner layer, rebase the layers
   above, verify the top, squash, sign and push. Then reply in each comment's own thread and resolve it.

## 9. Lessons learned

- **Gates in the foreground.** Long gates must run in the foreground. A background job whose agent ends its turn is
  treated as finished, and its results are lost.
- **Silent hangs.** Agents can hang silently. Treat 20 minutes without activity as stuck: stop, clean throwaway files,
  and resume.
- **Stale route types.** Stale `.next/types` after a branch switch break `tsc` with TS2307. Run
  `rm -rf .next/types .next/dev/types` after every switch or throwaway route.
- **Disk.** Turbopack's dev cache grows by about 1 GB per cold start. Clear `.next/dev/cache` between layers. A pending
  improvement: turn `experimental.turbopackFileSystemCacheForDev` off when E2E runs.
- **Reboots.** A reboot wipes temporary scratch space, so keep durable copies of workflow scripts and arguments.
- **Pacing.** Pace work to the usage windows: two parallel lanes plus a controller burn about 25–30% of the five-hour
  window per hour.
- **Commit signing.** `git commit-tree` and the GitHub API don't sign on their own. Verify every pushed head with
  `git verify-commit` and the GitHub API's `commit.verification`.
- **Permission classifiers.** A fresh agent session's permission classifier may block history-rewriting plumbing
  (`commit-tree`, `update-ref`). Plan for the controller to do the squash, or pre-approve those commands.
