# bg-adopt 07 — Edit settings from the platform's catalogue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** Settings can be edited again: `PUT /tenant/settings/{key}` works (BG-04). The page renders
the platform's own catalogue metadata, and the maker-checker and auto-advance switches become real
switches (BG-12 tenant part, item 6). Base currency is read-only and offers no Reset (item 5). The
institution draft wizard and the time-zone fields accept only what the platform accepts (item 12).

**Architecture:**

- **Contract:** `modules/administration/settings/settings-contract.ts` parses the new fields.
- **Rules:** `settings-rules.ts` derives groups, controls and actions from them:
  - `SETTING_GROUPS` and `EDIT_UNAVAILABLE` are deleted;
  - read-only is decided by key for `base_currency` and `audit_retention_days`.
- **Dialogs:** editing uses the kit `ReasonDialog`, which forwards the minted idempotency key. The
  time zone is a searchable select of `Intl.supportedValuesOf('timeZone')`. A switch opens a
  confirmation.

**Spec:** [§8 entry 07](../specs/2026-11-24-backend-gap-adoption-design.md#07--settings)
· designs `#d-settings` · register BG-04, BG-12, and items 5, 6 and 12.

## Wire facts (platform `6a8ea28`)

- **Setting item** (list and detail):
  - `key`, `value: string | null`, `value_type`, `sensitive`, `platform_admin_only`, `is_default`;
  - `label`, `description` and `group`, which are null only for keys outside the catalogue.
  - The list is **sorted by key**; `GET /tenant/settings?size=100`.
- **Catalogue:**

  | key                                         | label                                        | group         | default                                                                             | value type                     |
  | ------------------------------------------- | -------------------------------------------- | ------------- | ----------------------------------------------------------------------------------- | ------------------------------ |
  | `default_timezone`                          | "Default time zone"                          | General       | null                                                                                | TIMEZONE                       |
  | `base_currency`                             | "Base currency"                              | General       | null; a read-only mirror of the organisation's currency, always `is_default: false` | CURRENCY                       |
  | `require_maker_checker_for_user_invites`    | "Require maker-checker for user invitations" | Approvals     | "true"                                                                              | BOOLEAN                        |
  | `require_maker_checker_for_branch_creation` | "Require maker-checker for branch creation"  | Approvals     | "true"                                                                              | BOOLEAN                        |
  | `business_date_auto_advance_enabled`        | "Advance the business date automatically"    | Business date | "false"                                                                             | BOOLEAN                        |
  | `audit_retention_days`                      | "Audit retention (days)"                     | Audit         | null                                                                                | INT; platform-only, 2555–36500 |

  The `value_type` strings are checked against
  `/home/user/finaxis-platform/src/main/kotlin/com/finaxis/platform/lifecycle/domain/TenantSettingCatalog.kt`
  (`TenantSettingValueType`: STRING, BOOLEAN, INT, TIMEZONE, CURRENCY).

- **A platform-only value**
  - lists as `null` when unset;
  - is masked as `***REDACTED***` when set and the caller lacks `tenant_setting.manage_platform` in
    the platform organisation.
- **`PUT /tenant/settings/{key}`**
  - Body: `{ value (not blank), reason? }`. Answers 200 with the setting; a replay with the same key
    returns the same body.
  - Check order:
    1. tenant not ACTIVE → 409;
    2. unknown key → 422;
    3. per-key permission (`settings.update` + `settings.view`) → 403;
    4. `base_currency` → 422 `invalid_operation`;
    5. a bad value → 422 `invalid_operation` (time zone: IANA only; raw offsets are 422);
    6. storing `true` in auto-advance without `business_date.advance` → 403.
  - Changing a maker-checker switch is audited HIGH.
- **`DELETE /tenant/settings/{key}`:** 204 (reset to default). `base_currency` → 422.
- **What the switches do:** `require_maker_checker_*`'s stored `"false"` lets the tenant's maker,
  the invited person (memberships) and amenders (branches) approve, each audited HIGH. It never
  relaxes the platform checker.
- **Institution create (`POST /platform/tenants`)**
  - An initial `base_currency` setting must equal `base_currency_code` (422 otherwise).
  - `audit_retention_days` must be 2555–36500.
  - The time zone must be IANA.

## Interfaces

- `settings-contract.ts`: each setting outputs
  `{ key, value, valueType, sensitive, platformAdminOnly, isDefault, label, description, group }`.
- `settings-rules.ts`:
  - `export const SETTING_GROUP_ORDER = ['General', 'Approvals', 'Business date', 'Audit'] as const`.
  - `export function groupSettings(settings: Setting[]): { group: string; settings: Setting[] }[]`
    orders groups by `SETTING_GROUP_ORDER` and keeps keys outside the catalogue (`group === null`)
    out, for the "Other stored settings" accordion.
  - `export const EDITABLE_KEYS = ['default_timezone', 'require_maker_checker_for_user_invites', 'require_maker_checker_for_branch_creation', 'business_date_auto_advance_enabled'] as const`.
  - `settingActions(setting, holder)` offers Edit for an editable key with `settings.update` +
    `settings.view`, and Reset only when `!isDefault` on an editable key.
  - `export const BASE_CURRENCY_NOTE = "Set from the institution's currency. It can't be changed here."`
  - `export const RETENTION_NOTE = 'Managed by the platform'`.
- `settings-actions.ts`:
  - `updateSetting` keeps its signature and loses the `SETTINGS_EDIT_ENABLED` guard.
  - For a maker-checker switch turned off, the reason is required (3–500 characters) in the action's
    zod schema.
  - It explains 403 `forbidden` for auto-advance as "Turning on automatic advance needs permission
    to advance the business date."
- `modules/administration/branches/branch-rules.ts`: `isTimeZone(value)` accepts only IANA ids from
  `Intl.supportedValuesOf('timeZone')`, plus `UTC`. Raw offsets are rejected.
- Delete `settings-flags.ts`.

---

### Task 1: Contract, rules and grouping

- [ ] **Failing tests**
  - `settings-contract.test.ts` parses the new fields and a key outside the catalogue with
    `null`s.
  - `settings-rules.test.ts`:
    - `groupSettings` orders General, Approvals, Business date, Audit from a key-sorted list;
    - `base_currency` gets no actions even with `isDefault: false`;
    - Reset is offered only when `!isDefault`;
    - Edit is offered for the four editable keys.
  - `branch-rules.test.ts`: `isTimeZone('+03:00') === false`, `isTimeZone('Africa/Nairobi') === true`.
- [ ] Implement; PASS.

### Task 2: The settings page

- **Page:** `app/(authenticated)/admin/settings/page.tsx` drops `editBlocked`, and passes
  `can('business_date.advance')` for the auto-advance row's explanation.
- **Catalogue:** `components/settings-catalogue.tsx` renders one card per group:
  - the API's label and description;
  - a value line for STRING keys, and a labelled `Switch` showing On or Off for BOOLEAN keys;
  - `BASE_CURRENCY_NOTE` with a "Read-only" chip for base currency, and `RETENTION_NOTE` for
    retention.
- **`components/setting-actions.tsx`**
  - The time zone's Edit opens a `ReasonDialog` with a searchable time-zone select and an optional
    reason.
  - Toggling a switch opens a `ConfirmDialog`-style `ReasonDialog`:
    - turning a maker-checker switch **off** requires a reason, and shows the approved copy;
    - turning one on, or changing auto-advance, has an optional reason.
  - Reset keeps its dialog (drop the `RESET_IS_ONE_WAY` copy).
- **Overview:** `modules/administration/overview/readiness-rules.ts` drops `UNSAVABLE` ("Settings
  can't be saved yet"). In `PROFILE_KEYS`, an unset `default_timezone` stops counting as missing
  (branches fall back to the organisation's zone), and so does `base_currency` (always set).
- **Tests:** RTL for each control and dialog; `e2e/settings.spec.ts`:
  - edit the time zone and reset it;
  - turn the user-invitation switch off with a reason and on again;
  - base currency has no actions;
  - the new labels.
  - Retire the frozen-currency and edit-disabled cases.
- **Approved copy for turning a switch off**
  - "Turn off maker-checker for user invitations?"
  - "The person who invites someone will be able to approve them, and the invited person will be
    able to approve their own membership. Each such approval is recorded as a high-severity event.
    The platform's own checks still apply."
  - The branch-creation variant: "…the person who drafts or edits a branch will be able to activate
    it…".

### Task 3: The institution draft wizard (item 12)

- **Retention:** `modules/platform-administration/tenants/tenant-rules.ts`'s `tenantDraftSchema`
  bounds it to 2555–36500 with "Enter 2555 to 36500 days."
- **Base currency setting:** `initialSettings` sends a `base_currency` setting only equal to
  `base_currency_code`. Better: remove the separate "Base currency setting" select from
  `tenant-draft-wizard.tsx` and never send that setting, since the platform mirrors it.
- **Time zone:** the wizard's time-zone field uses the shared IANA list.
- **Tests:** the schema bounds, and the wizard has no Base currency setting field.

### Task 4: The fake API

- **`e2e/fake-api/routes/settings.mts`**
  - Item fields as above; maker-checker defaults are `"true"`.
  - An unset platform-only value lists `null`.
  - Writes: 409 for a non-ACTIVE tenant; 422 for `base_currency` PUT/DELETE; 422 for a non-IANA
    time zone; 403 for auto-advance `true` without `business_date.advance`.
  - An audit row per write (HIGH for the maker-checker switches).
- **`e2e/fake-api/scenarios.mts`:** drop the retired `business-date.timezone` seed and the listed
  `settings.operational` (it is never listed). Delete the `settings-currency-frozen` scenario, and
  `baseCurrencyFrozen` in `state.mts`.
- **`e2e/fake-api/routes/platform-tenants.mts`:** create validates retention 2555–36500, the
  `base_currency` setting, and IANA zones.
- **Specs:** `e2e/fake-api-settings.spec.ts` and `e2e/fake-api-platform-tenants.spec.ts`.

### Task 5: Gates, docs, commit

- [ ] Run `pnpm check` and the full e2e suite: green.
- [ ] Register:
  - BG-04 → **Closed** (frontend #NN).
  - BG-12 stays Backend fixed until PR 22 (platform tab). Note that the tenant part was adopted in
    #NN.
  - Items 5, 6 (the Settings part) and 12 adopted.
- [ ] Contract: the settings rows (item fields, PUT status codes, `base_currency` read-only, bounds).
- [ ] Commit `feat(settings): edit settings from the platform's catalogue`.
