# bg-adopt 04 — Pair each mutation with its views and read permission scopes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** Stop showing actions the platform refuses for a missing paired view (BG-31, item 7) or a
branch-scoped grant on a tenant-scope route (BG-33). The grant drawer composes roles the way the
platform's composition rule requires. Drop the client de-duplication the platform made unnecessary
(BG-23, item 11).

**Architecture:**

- **View map:** one checked-in map of the platform's `permission_view_requirement` pairs,
  `auth/permission-views.ts`, mirrors V22, V32, V33, V34 and V39. A unit test pins it against the
  fake API's catalogue, which mirrors the platform's 86 codes.
- **Gates:** gates that guard a mutation derive their codes with `withViews`.
- **Scopes:** `/auth/me`'s `permission_scopes` becomes `tenantPermissions` on the permission
  holder. `canTenantWide` gates the routes the platform checks tenant-wide.
- **Fake API:** pairs views at the same scope, refuses role composition that breaks the rule, and
  emits scopes and de-duplicated ACTIVE rows.

**Spec:** [§8 entry 04](../specs/2026-11-24-backend-gap-adoption-design.md#04--view-pairs-and-permission-scopes)
· designs `#d-access` · register BG-23, BG-31, BG-33, and items 7 and 11.

## Wire facts (platform `6a8ea28`)

- **`GET /auth/me`**
  - Adds `permission_scopes: [{ code, scope: 'TENANT' | 'BRANCH', branch_ids?: string[] }]`, sorted
    by code.
  - `branch_ids` is **absent** on TENANT entries. A code held at both scopes appears once, as TENANT.
  - BRANCH `branch_ids` covers every ACTIVE branch, not only the selected one.
  - A non-ACTIVE membership gets `[]`.
  - `branches` and `roles` are distinct and ACTIVE-only.
- **`/auth/branches`** rows and `total_items` are distinct. `select-organisation`'s
  `assigned_branch_ids` are distinct and ACTIVE-only, so a user with HOME and OPERATE at one branch
  is auto-selected.
- **Catalogue** (`GET /tenant/permissions`): each item adds `kind`
  (`VIEW` | `MUTATION` | `CONTEXT`), `grant_scope` (`TENANT` | `PLATFORM`) and
  `required_view_permissions: string[]` (always present, sorted, empty for VIEW and CONTEXT).
  - 86 codes: the 54 foundation codes, `branch.update`, `user.update`, `membership.update`,
    `role.archive`, `audit.export` and `user.assign_self`, plus the 26 accounting codes.
  - 85 are ACTIVE; `branch.activate` is `DEPRECATED`.
  - Source: platform migrations V2, V5, V19, V21, V22, V32, V33, V34 and V39. Read them from
    `/home/user/finaxis-platform/src/main/resources/db/migration/`, or ask the session for the
    excerpt.
- **Role summary and detail** add `missing_view_permissions: string[]`.
- **Every mutation guard** requires the mutation code and each paired view at the same scope,
  before any lookup or write. The refusal is 403 `forbidden` (detail `Missing permission: <code>.`;
  never shown).
- **Role composition**
  - `POST /tenant/roles/{id}/permissions` (grant) answers 400 `validation_failed` with no
    `violations` when a MUTATION is granted without each of its ACTIVE views already on the role.
  - `DELETE …/permissions/{code}` answers the same when removing a view a held ACTIVE mutation
    needs.
  - Re-granting is a no-op.
- **`GET /tenant/users`** needs `user.view` tenant-wide.

## Interfaces

- `auth/permission-views.ts` (new, client-safe):
  - `export const PERMISSION_VIEWS: Readonly<Record<string, readonly string[]>>` lists each
    mutation's views, exactly the platform pairs.
  - `export function requiredViews(code: string): readonly string[]` returns `[]` for an unknown or
    view code.
  - `export function withViews(codes: readonly string[]): string[]` returns the codes in order,
    then each one's views not already listed, de-duplicated.
- `auth/permissions.ts`:
  - `PermissionHolder` gains `tenantPermissions?: readonly string[]`.
  - `export function canTenantWide(holder: PermissionHolder, code: string): boolean` is
    `holder.tenantPermissions?.includes(code) ?? false`.
  - `export function canAllTenantWide(holder: PermissionHolder, codes: readonly string[]): boolean`.
- `auth/context.types.ts` / `auth/context-contract.ts`:
  - `BackendProfile` gains
    `permission_scopes: { code: string; scope: 'TENANT' | 'BRANCH'; branch_ids?: string[] }[]`.
  - `export function permissionHolder(profile: Pick<BackendProfile, 'permissions' | 'permission_scopes'>): Required<PermissionHolder>`
    sets `tenantPermissions` to the TENANT codes.
- `modules/administration/roles/role-contract.ts`:
  - `permissionSchema` outputs `kind`, `grantScope` and `requiredViewPermissions: string[]`.
  - The role summary and detail output `missingViewPermissions: string[]`.

---

### Task 1: The view map and the fake catalogue

**Files:**

- Create: `auth/permission-views.ts`, `auth/permission-views.test.ts`.
- Modify: `e2e/fake-api/routes/roles.mts` (`CATALOGUE` becomes the 86 platform codes, each with
  name, module, risk, status, kind, grant_scope and required views; the list items publish `kind`,
  `grant_scope` and `required_view_permissions`).
- Spec: `e2e/fake-api-roles.spec.ts` (the risk totals change with the new codes; assert 86 codes,
  85 ACTIVE, and the published fields).

- [ ] **Failing unit tests**
  - `requiredViews('user.invite')` equals `['membership.view', 'user.view']`.
  - `requiredViews('user.view')` is `[]`.
  - `withViews(['user.invite'])` equals `['user.invite', 'membership.view', 'user.view']`.
  - `withViews(['user.assign_role', 'role_assignment.view'])` has no duplicates.
  - Every value in `PERMISSION_VIEWS` ends in `.view`.
- [ ] Implement the map from the platform migrations (V22's pairs, plus V32 `user.update` →
      `user.view`, `membership.update` → `membership.view`, V33 `role.archive` → `role.view`, V34
      `audit.export` → `audit.view`, V39 `user.assign_self` → `user.view`).
- [ ] Rebuild the fake catalogue and update the fake-roles spec. Run them: PASS.
- [ ] **Pin test:** add a fake-API spec test that reads `GET /api/v1/tenant/permissions?size=100`.
      For every MUTATION item, `required_view_permissions` must equal `requiredViews(code)`. Import
      the map from `../auth/permission-views.ts`; if the e2e tsconfig blocks the import, copy the
      expectation inline for a sample of five codes.

### Task 2: Permission scopes on `/auth/me`, no client de-duplication

**Files:**

- Modify: `auth/context.types.ts`, `auth/context-contract.ts` (parse `permission_scopes`, with
  `branch_ids` optional; delete `uniqueBy` and the `Set` de-duplication), `auth/permissions.ts`,
  `auth/context-service.ts` (expose the holder on the resolved profile where pages read
  `profile.permissions`).
- Modify: `modules/profile/profile-service.ts` and `modules/profile/profile-rules.ts` (the comments
  about duplicates and DISABLED roles).
- Fake API:
  - `e2e/fake-api/routes/auth.mts`: `/auth/me` emits distinct ACTIVE branches and roles and
    `permission_scopes` computed over all ACTIVE branches (`access.mts` gains a helper).
  - `/auth/branches` and `select-organisation` are distinct and ACTIVE-only.
  - Retire or adjust the `duplicateAssignments` and `suspended-branch` scenarios' expectations.
- Specs and tests that assert the old behaviour: `auth/context-contract.test.ts`,
  `modules/profile/profile-service.test.ts`, `e2e/context.spec.ts` (duplicate auto-select),
  `e2e/profile.spec.ts` (duplicates, suspended branch, disabled role), `e2e/fake-api-profile.spec.ts`.

- [ ] **Failing tests**
  - `profileSchema` parses a TENANT entry without `branch_ids` and a BRANCH entry with them.
  - `permissionHolder` returns only the TENANT codes as `tenantPermissions`.
  - `canTenantWide` is false for a BRANCH-only code.
- [ ] Implement; update the fake and the specs; PASS.

### Task 3: Gate on paired views and tenant-wide grants

**Files and gates:**

- `modules/administration/users/invite-rules.ts`: `INVITE_CODES = withViews(['user.invite'])`. Drop
  `user.assign_branch`. `canInviteUsers` also requires `canTenantWide(holder, 'user.view')`.
  _(Corrected in review: the invite still checks `user.assign_branch` with `branch_assignment.view`
  at each invited branch, so `INVITE_CODES` is
  `[...withViews(['user.invite', 'user.assign_branch']), 'role.view', 'branch.view']`, with
  `user.invite` and its views tenant-wide.)_
- `modules/administration/roles/role-rules.ts`: `canAssignRole` uses
  `withViews(['user.assign_role'])` plus `role.view`. Revoke uses `withViews(['user.revoke_role'])`.
- `modules/administration/users/user-rules.ts`: `canAssignUserRole` uses
  `withViews(['user.assign_role'])`, and `canAssignUserBranch` uses
  `withViews(['user.assign_branch'])`.
- `modules/administration/administration-navigation.ts`: the Users item requires `user.view`
  tenant-wide. Navigation filtering takes the holder; extend `requiresAny` with an optional
  `tenantWide: true`.
- The users directory page and the user pickers (`/api/tenant/users`) show their access-denied or
  empty state unless `canTenantWide(holder, 'user.view')`.
- Callers construct the holder with `permissionHolder(profile)`.
- Tests: each rule's `*.test.ts` gets a table:
  - "mutation held without its view → false"
  - "view held only at branch scope → false"
  - "both tenant-wide → true"
- Fake API: `access.mts` `requirePermission(access, code)` also requires each `requiredViews(code)`
  at the same scope, and refuses with 403 `forbidden` naming the first missing code in `detail`.
  The fake can import the map, or keep its own copy built from the catalogue.

- [ ] Failing tests → implement → PASS. The **Review Focus 3** pins live here.

### Task 4: The grant drawer composes roles the platform's way

**Files:**

- `app/(authenticated)/admin/roles/[roleId]/permissions/page.tsx`: the options leave out
  `grantScope === 'PLATFORM'` codes and non-ACTIVE codes, as today. Pass each option's
  `requiredViewPermissions` to the checklist.
- `modules/administration/roles/components/role-permission-actions.tsx`:
  - Selecting a mutation also selects its views that aren't granted yet, and shows the note "Also
    grants <view names>, which <mutation name> needs."
  - Unticking a view another selected mutation needs is disabled, with a tooltip.
  - `RemovePermissionButton` is disabled, with "Needed by <mutation names>", for a granted view a
    granted ACTIVE mutation needs.
- `modules/administration/roles/role-actions.ts`:
  - `grantPermissions` posts VIEW codes before the others.
  - A backend 400 `validation_failed` (status 400 from the platform, told apart from the local zod
    failure by `requestId !== null` or by the action catching `BackendApiError`) reads: "These
    permissions need their view permissions granted first. Refresh and try again."
  - `removePermission` maps the 400 to "Another permission on this role needs this one. Remove that
    one first."
- `modules/administration/roles/role-contract.ts`: catalogue and role fields as in Interfaces.
- Fake API: `roles.mts` grant and remove apply the composition rule with 400 `validation_failed`;
  role summary and detail publish `missing_view_permissions`.
- Tests: the drawer RTL test (auto-adding a view, the note, the disabled untick), action tests (post
  order, both 400 mappings), `e2e/roles.spec.ts` (grant a mutation without its view: the view is
  added and the grant succeeds).

- [ ] Failing tests → implement → PASS.

### Task 5: Gates, docs, commit

- [ ] Run `pnpm check` and the full e2e suite: green.
- [ ] Register:
  - BG-23, BG-31 and BG-33 → **Closed** (frontend #NN).
  - Items 7 and 11 marked adopted.
  - BG-31's "To adopt" note: the gates come from `auth/permission-views.ts`, kept in step with the
    platform migrations.
- [ ] Contract: §C `/auth/me` adds `permission_scopes`; the catalogue row adds `kind`,
      `grant_scope` and `required_view_permissions`; the role rows add `missing_view_permissions`.
      Mark §J's "80 codes" as 86.
- [ ] Commit `fix(access): pair each mutation with its views and read permission scopes`.
