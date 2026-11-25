# bg-adopt 11 — Branch address and edit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** Branches show and take an address, and draft and active branches can be edited (BG-13).

**Architecture:**

- **Address:** one address shape with the fixed keys of decision Q9, in `branch-contract.ts`. Unknown
  stored keys are kept and shown read-only.
- **Edit page:** `admin/branches/[branchId]/edit`, following `admin/roles/[roleId]/edit`. It reuses
  the create form's fields through React Hook Form with the zod resolver, and `applyFieldErrors`.
- **Server Action:** `updateBranch`, a PATCH that sends only changed fields.

**Spec:** [§8 entry 11](../specs/2026-11-24-backend-gap-adoption-design.md#11--branch-address-and-edit)
· designs `#d-branch-edit` · register BG-13 · decision Q9.

## Wire facts (platform `6a8ea28`)

- **Address in reads.** Branch detail (tenant and platform) has `address: Record<string, string>`,
  echoing exactly the stored keys. `{}` means none. List items carry no address.
- **Address on create.** Create accepts `address` (a flat map of strings).
- **`PATCH /branches/{branch_id}`**
  - Gate: the route's `@PreAuthorize("hasAuthority('branch.update')")` in the selected context,
    then `branch.update` (+ `branch.view`) checked on the target branch (BG-03). DRAFT or ACTIVE
    only; otherwise 409.
  - Order: the `@Valid` body resolves first (its 400s), then the route gate, then the controller's
    `{}` check, then the service's target check, 404 and state.
  - Fields:
    - `branch_name`
    - `parent_branch_id`: explicit `null` detaches, absent keeps
    - `timezone` (IANA)
    - `address`: replaced whole; `{}` clears it
  - Every field is optional, but `{}` is 400 `validation_failed`. `branch_code`, `branch_type` or
    any unknown field is 400 `invalid_json`.
  - Refusals: a bad zone or a parent cycle is 422 `invalid_operation`, an unknown parent 404, a
    CLOSED parent 409.
  - Answers the detail.
- **No platform PATCH route.** The platform branch page shows the address read-only.
- **Dates.** `opened_on` is the business date of first activation and `closed_on` that of closure,
  as `dd-MM-yyyy`.

## Interfaces

- `branch-contract.ts`:
  - `export const ADDRESS_KEYS = ['line_1', 'line_2', 'city', 'region', 'postal_code'] as const`.
  - The detail outputs `address: Record<string, string>`.
  - `export function formatAddress(address: Record<string, string>): string | null` joins the known
    keys in order, then the others, with ", ". It returns `null` when the address is empty.
- `branch-rules.ts`:
  - `export const EDITABLE_BRANCH_STATES = ['DRAFT', 'ACTIVE']`.
  - `export function canEditBranch(branch: { id: string; status: BranchStatus }, holder: PermissionHolder): boolean`:
    one of `EDITABLE_BRANCH_STATES`, and `canActOnBranch(holder, 'branch.update', branch)` (entry
    09's two checks), so a draft is edited tenant-wide only.
  - `branchDraftSchema` gains the optional address fields (each at most 120 characters, trimmed).
    The edit schema applies the cap only to a value the user changed (the platform caps none).
  - `export const EDIT_DRAFT_WARNING = "If you edit this draft, you won't be able to activate it yourself."`.
- `branch-actions.ts`:
  - `export async function updateBranch(previous, formData)`.
  - It builds the body from the changed fields only: name; parent as `''` → `null`; timezone;
    address as all five keys, sending `{}` when all are blank and merging back unknown stored keys.

## Tasks

### Task 1: Address read and write

- **Contract:** parse the address, with `formatAddress` tests (order, unknown keys, empty → `null`).
- **Display:** the tenant branch Overview (`admin/branches/[branchId]/page.tsx`) and the platform
  branch page show an Address row. It also gains "Drafted by" and "Submitted by" (entry 08's `makerLabel`). The latter's description drops "the platform doesn't return the
  address".
- **Create forms:** the tenant and platform create forms (`branch-draft-form.tsx`,
  `institution-branch-draft-form.tsx`) gain the address fields. The create actions send `address`
  only when a field is non-blank.
- **Fake API:** store and return the address, plus `opened_on` (the business date at first
  activation) and `closed_on`. `routes/branches.mts`'s `BRANCH_DRAFT_KEYS` already accepts address
  but drops it. The platform branch create and read in `routes/platform-records.mts` do the same.

### Task 2: The edit page

- **Page:** `app/(authenticated)/admin/branches/[branchId]/edit/page.tsx`. Server Component; it
  loads the branch, 404s for unknown, and 403s via `ForbiddenState` without `canEditBranch`. It
  renders a client form.
  - Fields: name, parent (a select of the institution's branches other than itself and its
    descendants, or None), time zone (the shared IANA select from PR 07), and the address.
  - Code and type are shown read-only.
- **Draft warning:** the edit page shows `EDIT_DRAFT_WARNING` as a warning Alert on a DRAFT branch.
- **Branch record hero:** an "Edit" link-button when `canEditBranch`.
- **Refusals**
  - 409: "This branch can no longer be edited in its current state. Refresh and check."
  - 422: "The time zone or parent branch isn't accepted. A branch can't be its own ancestor."
  - 404: "The parent branch no longer exists."
- **Tests:** action tests (only changed fields; the parent `null`; the address `{}`; key reuse),
  page tests, and e2e: edit an active branch's name and address, then see them on the Overview.

### Task 3: Fake API PATCH

- **`routes/branches.mts`:** the PATCH route with the rules above, in the platform's order, an audit
  row `branch.update`, and only `changedFields` names in metadata. Also record the editor, so that
  PR 08's `approver_is_branch_modifier` refusal can fire in the fake: anyone with a successful
  `branch.update` on a branch is refused activation unless the switch is off, with the platform's
  `DENIED` `branch.activate` audit row.
- **Spec:** `e2e/fake-api-branches.spec.ts`.

### Task 4: Gates, docs, commit

- [ ] Run `pnpm check` and the full e2e suite (including a 375 px check of a 100-character address
      on the Overview: Review Focus 5): green.
- [ ] Register: BG-13 → **Closed** (frontend #NN), keeping its "Still open" (no platform PATCH; no
      address on list items).
- [ ] Contract: branch detail `address` and the PATCH row.
- [ ] Commit `feat(branches): branch address and edit`.
