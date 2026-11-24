# bg-adopt 06 — Archive roles and allow clearing a description — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** Adopt the role state machine.

- ACTIVE ⇄ DISABLED.
- Either can move to ARCHIVED, which is terminal and keeps the code.
- Archive is a new action for administrators. An archived role offers nothing.
- Old assignments name archived roles.
- The assign pre-read is replaced by mapping the platform's 422.
- A blank description now clears it, so the edit form's help text stops saying it can't.

**Architecture:** the change sits in four places.

- **Rules** in `modules/administration/roles/role-rules.ts`.
- **One Server Action** in `role-actions.ts`.
- **A confirm-dialog button** in `role-lifecycle-actions.tsx`, the kit `ConfirmDialog` with error
  tone.
- **A bounded archived read** in `lib/api/lookups.ts`'s role index.

**Spec:** [§8 entry 06](../specs/2026-11-24-backend-gap-adoption-design.md#06--role-archive-and-description)
· designs `#d-roles` · register BG-27, BG-34, and items 9 and 14.

## Wire facts (platform `6a8ea28`)

- **`POST /tenant/roles/{role_id}/archive`**
  - Needs `role.archive` + `role.view`. Only `TENANT_ADMIN`, `local-admin` and `PLATFORM_SUPER_ADMIN`
    hold `role.archive`.
  - No body; idempotent mutation. Answers the role detail.
  - 409 `conflict` while the role has an ACTIVE assignment. Only this case's detail names the
    count, and it must not be echoed.
  - 409 for a system role or one already archived.
- **Status transitions**
  - Activate only from DISABLED; deactivate only from ACTIVE. Anything else, a repeat included, is 409.
  - Edit, grant or remove on an archived role is 409.
  - Assigning a non-ACTIVE role is 422 `invalid_operation` (generic detail).
- **Listing:** the default list excludes ARCHIVED; `status=ARCHIVED` lists them.
- **`PATCH /tenant/roles/{id}` description**
  - absent keeps it;
  - `null` clears it;
  - a string sets it;
  - a blank string is 400 `validation_failed`.
- **`PATCH` role name:** absent or `null` keeps it; blank is 400.

## Interfaces

- `role-rules.ts`:
  - `roleStatusAction(role, holder, heldByMe)`: `'activate'` only from DISABLED, `'deactivate'` only
    from ACTIVE, `null` for ARCHIVED.
  - `export function canArchiveRole(role: RoleShape, holder: PermissionHolder): boolean`: custom
    (not system), not ARCHIVED, `withViews(['role.archive'])`.
  - `canEditRole`, `canGrantPermissions` and `canRemovePermissions` are false for ARCHIVED.
  - `assignmentsDescription` for ARCHIVED reads "This role is archived, so it can't be assigned."
- `role-actions.ts`:
  - `export async function archiveRole(previous, formData): Promise<ActionResult>` takes
    `{ idempotencyKey, roleId }` and POSTs `/archive`. It explains 409 `conflict` as "This role still
    has active assignments, or it can't be archived. Refresh and check."
  - `assignRole` loses its pre-read and explains 422 `invalid_operation` as "This role is no longer
    active, so it can't be assigned."
- `lib/api/lookups.ts`: the role index also reads one page of 100 `status=ARCHIVED` roles, so their
  names resolve. Archived roles beyond that page fall back to the short id (a `ponytail:` ceiling).
  **Dropped while building:** every screen that lists role assignments reads ACTIVE ones only, and
  the platform never leaves an ACTIVE assignment on an archived role (archive is refused while one
  exists; assigning one is 422), so no screen could show the name this read resolves.

---

### Task 1: Rules and the archive action

- [ ] **Failing tests** in `role-rules.test.ts`:
  - the status action table: ACTIVE → deactivate, DISABLED → activate, ARCHIVED → null;
  - `canArchiveRole` for system, custom and archived roles, with and without `role.view`;
  - archived roles block edit, grant and remove.
- [ ] **Failing tests** in `role-actions.test.ts`:
  - archive posts with the minted key, refreshes, and maps the 409;
  - assign maps the 422, with no pre-read.
- [ ] Implement; PASS.

### Task 2: The UI

- **Role record hero** (`modules/administration/roles/components/role-lifecycle-actions.tsx`):
  Archive button, outlined error tone, after the status toggle.
- **Archive dialog** (`ConfirmDialog`, error tone):
  - Title: "Archive <role name>?"
  - Body: "Archiving is final. The role can't be edited, activated or assigned again, and its code
    <CODE> stays reserved."
  - When the page knows the role's active assignment count (`role_assignment.view` held; the
    Overview already reads it), a non-zero count shows a warning Alert: "<n> people still hold this
    role. Revoke their assignments first." A "View assignments" link goes to the Assignments tab,
    and the confirm is disabled. **As built:** "This role still has <n> active assignment(s).
    Revoke them (it) first.", because the count is assignments, not people (Ruling 11), and only
    when `role_assignment.view` is held tenant-wide (a branch-scoped one reads a partial count).
- **Archived record:** an info Alert, "This role is archived. It's kept for history and can't be
  changed.", with no Edit or status actions.
- **Roles directory** (`app/(authenticated)/admin/roles/page.tsx`): the status filter's empty option
  is labelled "Active and disabled", and its options include Archived.
- **Edit form** (`role-form.tsx`): drop the "can be replaced but not removed" help text. In
  `role-actions.ts`, drop `updateRole`'s comment saying the same.
- **Tests:** RTL for the button, the dialog with and without assignments, and the archived state.
  `e2e/roles.spec.ts`:
  - archive a role without assignments, then see it only under the Archived filter;
  - a role with assignments shows the warning and a disabled confirm;
  - an archived role's name shows on an old assignment (user record Roles & access). **Dropped**
    with the lookups read above: no screen lists such an assignment.

### Task 3: The fake API

`e2e/fake-api/routes/roles.mts`:

- **Status changes:** `statusRoute` allows only the named source state.
- **Archive:** a new route enforcing the platform's rules, writing a `role.archive` audit row on
  the role.
- **List:** excludes ARCHIVED unless `status=ARCHIVED`.
- **Archived roles:** PATCH, grant and remove answer 409 on an archived role.
- **Assignment:** POST answers 422 `invalid_operation` for a non-ACTIVE role.
- **PATCH description:** absent keeps it, `null` clears it, blank is 400. (`stringField` can't tell
  absent from null; read the raw body key.)
- **Catalogue:** includes `role.archive` (PR 04).
- **Scenarios:** add an ARCHIVED role with an old REVOKED assignment.

Spec: `e2e/fake-api-roles.spec.ts` covers the transitions, archive and the PATCH description cases.

### Task 4: Gates, docs, commit

- [ ] Run `pnpm check` and the full e2e suite: green.
- [ ] Register:
  - BG-27 and BG-34 → **Closed** (frontend #NN).
  - Items 9 and 14 adopted.
  - The contract's UpdateRole row says a `null` description clears it.
  - Add rows for archive and the 422.
  - README: drop the "can be replaced but not removed" note, if present.
- [ ] Commit `fix(roles): archive roles and allow clearing a description`.
