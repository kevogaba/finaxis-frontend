# bg-adopt 22 — An institution Settings tab for audit retention — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** Platform administrators manage an institution's platform-only settings (today only
`audit_retention_days`) from a Settings tab on its record (BG-12, platform part). No tenant
membership is needed.

**Architecture:**

- **Tab:** a new `(record)/settings/page.tsx` under
  `app/(authenticated)/platform-admin/tenants/[tenantId]/`, registered in `(record)/layout.tsx`.
- **Reuse:** the PR 07 settings components where they fit, in a platform variant (one group,
  "Audit").
- **Server Actions:** `updatePlatformSetting` and `resetPlatformSetting`, in
  `modules/platform-administration/tenants/`.

**Spec:** [§8 entry 22](../specs/2026-11-24-backend-gap-adoption-design.md#22--institution-settings-tab)
· designs `#d-retention` · register BG-12.

## Wire facts (platform `6a8ea28`)

- **Routes**, all with class-level `tenant_setting.manage_platform` in the platform organisation:
  - `GET /platform/tenants/{tenant_id}/settings` (paged; platform-only keys only);
  - `GET`, `PUT` (`{ value, reason? }`) and `DELETE` on `/settings/{key}`.
- **Values:** raw, not masked. `is_default` is true when unset.
- **Refusals**
  - An unknown tenant is 404.
  - A key that isn't platform-only is 422.
  - `PUT` or `DELETE` on a non-ACTIVE tenant is 409.
  - The platform organisation's own id is 409 `lifecycle.platform_organisation_protected`.
  - Retention must be 2555–36500 (422 otherwise).
- **Audit:** writes are idempotent at platform scope and audited as `settings.update`.

## Tasks

### Task 1: Service, actions, tab

- **Service:** `listPlatformSettings(tenantId)`, using the PR 07 settings contract item schema.
- **Actions:** `updatePlatformSetting` (value 2555–36500, an optional reason) and
  `resetPlatformSetting`. They explain:
  - 409: "Settings can be changed only for an active institution."
  - 422: "Enter 2555 to 36500 days."
- **Tab:** "Settings", shown only with `tenant_setting.manage_platform`.
  - The card "Audit" shows "Audit retention (days)": the value, or "Not set".
  - Description: "Routine records older than this are deleted, never sooner than 2555 days (7
    years). Runs only where the platform has turned it on."
  - Edit (dialog with Days and an optional Reason) and Reset to default (when `!isDefault`).
- **Tests:** action tests (bounds, key reuse), page tests, and e2e (set retention to 3000, then
  reset).

### Task 2: Fake API

- **`routes/settings.mts`** or `platform-tenants.mts`: the platform settings routes with the rules
  above.
- **Scenarios:** `PLATFORM_ADMIN_PERMISSIONS` gains `tenant_setting.manage_platform`.
- **Specs:** the matching fake spec.

### Task 3: Gates, docs, commit

- [ ] Run `pnpm check` and the full e2e suite: green.
- [ ] Register: BG-12 → **Closed** (frontend #NN), keeping Still open (jobs off by default; tenant
      read needs the platform permission).
- [ ] Contract: the platform settings routes.
- [ ] Commit `feat(platform): an institution Settings tab for audit retention`.
