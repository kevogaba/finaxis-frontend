# bg-adopt 05 — Guard adding to your own access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** A non-administrator no longer gets the generic 403 for adding to their own access. Platform
#342 (ADR 0044, V39) refuses these unless the caller holds `user.assign_self` tenant-wide:

- assigning yourself a role or a branch;
- adding a permission to a role you hold;
- re-enabling a DISABLED role you hold.

Only the seeded administrators hold it, and the grant drawer must never offer it.

**Architecture:**

- Pure rules take a `self` flag and the permission holder (from PR 04, with `tenantPermissions`).
- Pages compute `self`:
  - On the user record, it is the record's user id against the profile's `user_id`.
  - On the role page, it is one role-assignment read, because `/auth/me` lists ACTIVE roles only.
- The fake API refuses exactly as the platform does.

**Spec:** [§8 entry 05](../specs/2026-11-24-backend-gap-adoption-design.md#05--your-own-access-userassign_self)
· designs `#d-access` · register item 13.

## Wire facts (platform `6a8ea28`)

- **Role and branch assignment.** `POST /tenant/role-assignments` and
  `POST /tenant/branch-assignments`, when `user_id` is the caller, also need `user.assign_self`
  tenant-wide. The check comes right after the route's own permission, before any other lookup.
  Refusal: 403 `forbidden` (detail `Missing permission: user.assign_self.`). `user.assign_self`
  itself needs `user.view`.
- **Grant** (`POST /tenant/roles/{role_id}/permissions`), in this order:
  1. 403 `role.assign_permission` (+ `role.view`).
  2. 404 role.
  3. 409 for a system or archived role.
  4. **422 `invalid_operation`** when the code is `user.assign_self`, for every role.
  5. **403 `forbidden`** when the caller holds the role: an ACTIVE assignment at any scope, re-grants
     included.
  6. 404 permission.
  7. 400 composition.
- **Activate** (`POST /tenant/roles/{role_id}/activate`): the same holder 403, only for DISABLED →
  ACTIVE. Deactivate, remove permission and archive have no self check.
- **Who holds it:** `TENANT_ADMIN`, the bootstrap `local-admin` and `PLATFORM_SUPER_ADMIN`.

## Interfaces

- `modules/administration/users/user-rules.ts`:
  - `canAssignUserRole(status, holder, self: boolean)` and `canAssignUserBranch(status, holder, self: boolean)`
    return the same as today when `!self`.
  - When `self`, both also require `canTenantWide(holder, 'user.assign_self')`.
  - `export function ownAccessBlocked(self: boolean, holder: PermissionHolder): boolean`.
  - `export const OWN_ACCESS = "You can't add to your own access. A tenant administrator can."`
- `modules/administration/roles/role-rules.ts`:
  - `canGrantPermissions(role, holder, heldByMe: boolean)`.
  - `roleStatusAction(role, holder, heldByMe: boolean)`: Activate is blocked when `heldByMe` without
    tenant-wide `user.assign_self`.
  - `export const HELD_ROLE = "You hold this role, so adding to it or re-enabling it needs a tenant administrator."`
- `modules/administration/roles/role-service.ts`:
  - `export async function holdsRole(roleId: string, userId: string): Promise<boolean>` makes one
    read, `GET /tenant/role-assignments?user_id=&role_id=&status=ACTIVE&size=1` (needs
    `role_assignment.view`), and answers `totalItems > 0`.
  - Without `role_assignment.view`, fall back to `profile.roles` (ACTIVE roles only).

---

### Task 1: The rules

- [ ] **Failing tests**
  - `canAssignUserRole('ACTIVE', holder, true)` is false for an `IAM_ADMIN`-shaped holder (has the
    assign codes, no `user.assign_self`).
  - It is true when `tenantPermissions` includes `user.assign_self`.
  - It is unchanged for `self: false`. The same holds for branch.
  - `canGrantPermissions(role, holder, true)` and `roleStatusAction` on a DISABLED role follow the
    same rule.
- [ ] Implement; PASS.

### Task 2: The pages show the reason

- **User record**: `app/(authenticated)/admin/users/[userId]/access/page.tsx` and `…/branches/page.tsx`
  - Pass `self`, which `access/page.tsx` already computes. `branches/page.tsx` computes it the same
    way.
  - When `ownAccessBlocked`, render Assign role and Assign branch disabled with the `OWN_ACCESS`
    caption, the way the record's other blocked actions show their reason.
- **Role record**: `app/(authenticated)/admin/roles/[roleId]/layout.tsx` and `…/permissions/page.tsx`
  - Compute `heldByMe` with `holdsRole`.
  - Grant permissions and Activate are disabled with the `HELD_ROLE` caption.
- **Pickers:** the Assignments tab's Assign role `UserPicker`
  (`modules/administration/roles/components/role-assignment-actions.tsx`) excludes the signed-in
  user when they lack tenant-wide `user.assign_self`. Add an `excludeUserId?: string` prop to
  `UserPicker`.
- **Grant drawer:** never lists `user.assign_self`. Filter it by code in
  `[roleId]/permissions/page.tsx`, next to PR 04's platform-scope filter.
- **Tests:** RTL and page tests for each surface, plus `e2e/users.spec.ts` and `e2e/roles.spec.ts`.
  The new scenario signs in as an `IAM_ADMIN`-shaped member who:
  - opens their own record and sees Assign role disabled with the reason;
  - opens a role they hold and sees Grant permissions disabled.

### Task 3: The fake API refuses as the platform does

- `e2e/fake-api/routes/roles.mts`:
  - Grant: 422 `invalid_operation` for `user.assign_self` (after the 409 checks), then the holder
    403 when the caller holds the role without tenant-wide `user.assign_self`.
  - Activate: the holder 403 for DISABLED → ACTIVE.
  - Role assignment POST: the self 403 when `user_id` is the caller.
- `e2e/fake-api/routes/branches.mts`: branch assignment POST, the self 403.
- `e2e/fake-api/scenarios.mts`: `TENANT_ADMIN_PERMISSIONS` gains `user.assign_self`, plus a scenario
  (or a variant) with an `IAM_ADMIN`-shaped signed-in member who holds a role.
- Spec: `e2e/fake-api-roles.spec.ts` covers the order 422 → 403 and the holder 403 on activate.

### Task 4: Gates, docs, commit

- [ ] Run `pnpm check` and the full e2e suite: green.
- [ ] Register: item 13 adopted (frontend #NN).
- [ ] Contract: role-assignment, branch-assignment, grant and activate rows name the
      `user.assign_self` rule.
- [ ] Commit `fix(access): guard adding to your own access`.
