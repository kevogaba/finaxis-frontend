# PR 16: Platform — SACCO institutions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [plan index](./2026-09-25-admin-parity-00-index.md),
> the [parallel lane rules](./2026-09-27-admin-parity-parallel-lanes.md) and the
> [08 branches plan](./2026-09-27-admin-parity-08-branches.md) first: 16 copies 08's record pattern.

**Goal:** Ship the platform workspace's SACCO institutions (spec §11.1–11.2):

- **Directory** `/platform-admin/tenants`, rebuilt on the list kit: search (code, name), status,
  country and created from/to filters, four sortable columns, and server pagination with its state in
  the URL. The reserved platform organisation is hidden (BG-29).
- **Create tenant draft** `/platform-admin/tenants/new` (`tenant.create`): Institution → First
  administrator → Initial settings → Review. The tenant code is checked for uniqueness before the
  create call, because a duplicate is a backend 500 (BG-07).
- **Institution record** `/platform-admin/tenants/[tenantId]`:
  - hero lifecycle by status and permission: DRAFT → Amend, Submit · PENDING_APPROVAL → Approve,
    Reject · ACTIVE → Suspend, Deprovision · SUSPENDED → Reactivate, Deprovision;
  - two tabs: **Overview**, and **Provisioning** (the bootstrap timeline, its failure code, and
    **Retry bootstrap** when FAILED).
- **Amend draft** `/platform-admin/tenants/[tenantId]/amend` (`tenant.update_draft`): a full
  replacement that re-enters what the platform can't return (legal name, registration number, the
  first administrator).

It also produces what later layers build on:

- the Stepper theme (spec §7.3) and the `WizardForm` scaffold, moved here from 11, whose invite wizard
  builds on them;
- the platform tenant contract and rules: 17 adds the record's Branches and Users tabs and the
  overview.

It migrates **only the tenant mappers** of the existing read-only platform module onto the contract
pattern. The tenant user and branch mappers stay for 17.

**Architecture:**

- Server Components read through `modules/platform-administration/tenants/tenant-service.ts`
  (`apiGet` with the zod snake_case schemas in `tenant-contract.ts`), settled by `load()`. Pure rules
  live in the client-safe `tenant-rules.ts`: action availability, the provisioning timeline, the form
  schemas and the request body builders.
- The record is a nested-route layout inside a route group. `[tenantId]/(record)/layout.tsx` reads
  the tenant once (a `cache()`d `getTenant`) and renders `RecordHero` and `RecordTabs`. The Overview
  (`page.tsx`) and Provisioning (`provisioning/page.tsx`) tabs fetch their own data.
  `[tenantId]/amend/page.tsx` sits outside the group, so the amend form renders without the hero.
- Mutations are Server Actions on 07's `runServerAction`. Each forwards the dialog's or wizard's
  idempotency key and the rendered organisation id (I2). Known 403/409/422 causes get named, hedged
  messages; nothing echoes backend text.
- Dialogs: `ConfirmDialog` for the bodiless endpoints (submit, approve, bootstrap retry);
  `ReasonDialog` for reject, suspend, reactivate and deprovision (which also asks for the tenant code
  typed back). The wizard is one React Hook Form across `WizardForm`'s steps.
- The platform workspace shows times in UTC (spec §9). Every list is server-paginated, with its state
  in the URL through `useListNavigation()` (the kit's `ListToolbar` and `TablePaginationBar`).

**Tech Stack:** Next.js 16.3 (nested layouts, route groups, Server Actions, `redirect`, `notFound`),
React 19.3 (`useActionState`, `cache`), MUI 9.4 (`Stepper`, `Autocomplete`, `TableSortLabel`, `Tabs`
through the kit), React Hook Form 7.88 with `@hookform/resolvers` 5 (zod 4.6), `Intl.DisplayNames`
and `Intl.supportedValuesOf`, Vitest + RTL, Playwright + axe.

**Spec:** [`…-design.md`](../specs/2026-09-25-admin-prototype-parity-design.md):

- §11.1 (directory, create wizard), §11.2 (record: Overview and Provisioning tabs, hero lifecycle;
  its Branches and Users tabs are 17's), the §11 intro (no tenant routes in the platform context);
- §6.2 (wire), §6.4 (mutations, RHF), §6.6 (permissions, the read-back `.view`), §6.7 (errors),
  §7.3 (Stepper overrides), §8 (the platform navigation already lists SACCO institutions), §9 (list
  and record patterns, forms and wizards, UTC in the platform workspace).

Contract: §A, §B, §C (`TenantSummary`, `TenantDetail`, `TenantDraftResult`), §D (`CreateTenantDraft`,
`InitialAdmin`, `AmendTenantDraft`, `RejectTenant`, `SuspendTenant`, `ReactivateTenant`,
`DeprovisionTenant`), §E.2 (the eleven `/platform/tenants` rows 16 uses), §F (organisation and
bootstrap states), §H (initial settings catalogue), §I, §J. Gaps: BG-06, BG-07, BG-08, BG-12, BG-14,
BG-24, BG-28, BG-29, BG-31.

**Base:** the `ap-integration` tip when lane Y forks 16, recorded in
`refs/lane-base/16-platform-tenants`. It must contain F_08 (08 with its slot fix wave). It also holds
07b, 15, 07 and 13, and possibly 09. Pre-flight note 1 checks it.
**Branch:** `lane/16-platform-tenants` in lane Y (ports 3200/3299). The controller registers it as
`admin-parity/16-platform-tenants` (stack order …, 08, 09, 16, 10, 17, …).
**Launch:** there is no plan-commit task. Runbook §7 step 3 copies this file to
`docs/superpowers/plans/2026-10-01-admin-parity-16-platform-tenants.md` and commits it
(`docs(plans): add plan 16`) before the run. Then v3 `all` mode with `tasks: 8` builds Tasks 1–8.
The **Pre-flight notes**, **Layer gate**, **Controller live check** and **Self-review** sections are
not tasks. Pass the Layer gate's keyboard and visual pass as the run's `visual` arg.

## Global Constraints

See the index and the lane rules. Additionally:

**Command forms (lane Y).** Every command below shows only the command part. context.md's
shared-machine rules, written by the pre-flight, win wherever they differ. Single-quote every path
that holds `(…)` or `[…]`, or zsh globbing breaks it.

```
# T — focused unit tests (foreground)
flock -o -E 75 -w 240 /tmp/finaxis-e2e.lock env VITEST_MAX_WORKERS=3 pnpm exec vitest run <test files or dirs>

# P — prettier on .mts files (lint-staged skips them; the hook's format:check doesn't). Foreground.
flock -o -E 75 -w 240 /tmp/finaxis-e2e.lock pnpm exec prettier --write <.mts paths>

# E — scoped E2E (run_in_background + log + Monitor). First, `ss -ltn '( sport = :3200 or sport = :3299 )'`
#     must show no listener you didn't start.
flock -o -E 75 -w 1800 /tmp/finaxis-e2e.lock env VITEST_MAX_WORKERS=3 PORT=3200 FAKE_API_PORT=3299 pnpm test:e2e <specs>

# C — commit (run_in_background + Monitor). Write the message to the lane's
#     …/scratchpad/commit-msgs/<name>.txt with the Write tool first, and stage whole files only.
#     The husky wrapper locks the hook, so git never goes inside flock. The hook (lint-staged + the
#     full pnpm check) is the check.
git add <whole files>
VITEST_MAX_WORKERS=3 git commit -F <…/scratchpad/commit-msgs/<name>.txt>
```

Exit 75 means the lock wait timed out: retry, don't skip. The gates (`pnpm check`, `pnpm build` and
the full `pnpm test:e2e`) belong to the workflow's gate phase, never to a task. A subagent's commit
trailer names its own model (carried rule). If the layer moves to X (lane rules §7, "Y failure
path"), use the same forms with ports 3100/3199.

**Standing rulings this layer honours:**

1. **Cross-tab guard (07's I2).** Every `ReasonDialog` and `ConfirmDialog` gets
   `contextOrganisationId={resolved.context.organization.id}` from the page's resolved context, and
   the wizard appends the same field to its `FormData`. `runServerAction` refuses a mismatch with
   `code: 'context_changed'` before any backend call.
2. **Kit freeze (lane rules §6).** 07b's kit and 07's `runServerAction`, `ReasonDialog` and
   `SectionCard` change only additively, one announced `refactor(kit):` commit each. **16 plans no
   kit change.** A kit defect found by the axe matrix gets one additive `refactor(kit):` commit
   (reported, so the controller announces it) or an escalation; never a reshaped prop.
3. **No pre-built element from a Server Component into an MUI prop gated by
   `isValidElement`/`cloneElement`** (Chip `icon`/`avatar`/`deleteIcon`, Tab `icon`; AGENTS.md).
   Every Chip a 16 Server Component renders is a label-only `StatusChip`. Button `startIcon` (the
   directory's Create button) isn't gated, and `RecordHero`'s avatar icon is an Avatar child, as in 08.
4. **Focus after a status change** follows 07's business-date-actions pattern, as 08 refined it in
   `branch-lifecycle-actions.tsx`. After a successful transition, focus the same action if it is
   still offered, else the first offered action, else the record title (08's `focusRecordTitle`).
   The title fallback also runs from an unmount cleanup when the action set empties (Reject,
   Deprovision) or a one-off button disappears (Retry bootstrap).
5. **Seed IDs** use `16000000-0000-4000-8000-00000000000n` (lane rules §5). 16 copies
   `platformOperator()` into its own `platform-tenants` builder. It never edits the collections of
   `greenfieldTenant()` or `platformOperator()`. `platform-operator` stays the read-only gating
   scenario: the `tenant.*` mutation codes live only in `platform-tenants`.
6. **Every list is server-paginated with URL state via `useListNavigation()`**: `ListToolbar`,
   `TablePaginationBar`, page sizes from `PAGE_SIZES`, default 10. With this layer the platform
   directory leaves AGENTS.md's exception list.
7. **One `h1` per page.** The axe matrix (light and dark × 1280 and 375 px) has no serious or
   critical violation (Task 8).
8. **Fake-API files** are erasable TypeScript with relative `.mts` imports and `import type`. They
   are linted with the full strict type-checked rules, because the no-unsafe relaxation for tests
   covers `e2e/**/*.ts`, not `.mts`. They are formatted by hand (form P).
9. **No new packages.** `package.json` and `pnpm-lock.yaml` don't change.

**Wire contract** (contract §E.2). All permissions are held in the platform organisation, and every
mutation also needs `tenant.view` for its read-back (BG-31):

| Endpoint                                                                                           | Permission                   | Body (snake_case, built field by field)                                      | Success                  | 16's handling                                                                                                          |
| -------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/platform/tenants?q&status&country&created_from&created_to&page&size&sort_by&sort_dir` | `tenant.view`                | —                                                                            | `ApiPage<TenantSummary>` | Includes the platform organisation (BG-29): hidden. An unknown `sort_by` (a 500) is never sent. Failure → `ErrorState` |
| `GET /api/v1/platform/tenants/{id}`                                                                | `tenant.view`                | —                                                                            | `TenantDetail`           | 404 → `notFound()`; 403 → `ForbiddenState`; drift → `ErrorState` with a reference                                      |
| `POST /api/v1/platform/tenants`                                                                    | `tenant.create`              | CreateTenantDraft: institution, `admin`, `initial_settings`, `business_date` | 201 `TenantDraftResult`  | A duplicate code is a 500 (BG-07): pre-checked. 422 `accounting.currency_invalid` / `invalid_operation` named          |
| `PATCH /api/v1/platform/tenants/{id}`                                                              | `tenant.update_draft`        | AmendTenantDraft: institution + `admin` (settings and date are ignored)      | `TenantDetail`           | DRAFT only: 409 named                                                                                                  |
| `POST …/{id}/submit`                                                                               | `tenant.submit_for_approval` | none read; `{}` sent                                                         | `TenantDetail`           | 409 named (missing metadata or a race)                                                                                 |
| `POST …/{id}/approve`                                                                              | `tenant.approve`             | none read; `{}` sent                                                         | **202** `TenantDetail`   | 403 = permission or maker-checker (creator or submitter, BG-08): explained                                             |
| `POST …/{id}/reject`                                                                               | `tenant.reject`              | `{ reason }`, 3–500                                                          | `TenantDetail`           | Terminal; the code stays taken (BG-28). 409 named. An unknown id is a 500 (never sent)                                 |
| `POST …/{id}/suspend`                                                                              | `tenant.suspend`             | `{ reason }`, 3–500                                                          | `TenantDetail`           | Generic 409. An unknown id is a 500 (never sent)                                                                       |
| `POST …/{id}/reactivate`                                                                           | `tenant.reactivate`          | `{}` or `{ reason }`                                                         | `TenantDetail`           | 409 named (setup incomplete, or a race)                                                                                |
| `POST …/{id}/deprovision`                                                                          | `tenant.deprovision`         | `{ reason }`, 3–500, after the tenant code is typed back                     | `TenantDetail`           | Irreversible: the typed code is checked client- and server-side                                                        |
| `POST …/{id}/bootstrap/retry`                                                                      | `tenant.bootstrap_retry`     | none read; `{}` sent                                                         | **202** `TenantDetail`   | FAILED only: 409 named                                                                                                 |

Every read and mutation sends a 401 to `/login?reason=session_expired` and a
`403 invalid_active_tenant_context` to `/select-context?next=…` (`load()`, `runServerAction`). 17's
endpoints (`/tenants/{id}/branches`, `/tenants/{id}/users` and `/platform/users/*`) are out of scope.

**Files 16 never touches:**

- `components/shell/*`: the platform notifications badge (`platform-notifications.tsx`) is 17's.
- `app/(authenticated)/layout.tsx`, and `app/(authenticated)/platform-admin/layout.tsx` (+ test),
  whose redirect rules stay as they are.
- `modules/platform-administration/platform-administration-navigation.ts` (SACCO institutions is
  already registered, gated by `tenant.view`), `platform-administration-module.ts`, and
  `components/platform-page-shell.tsx` (+ test), which the overview keeps until 17.
- The kit and 07's primitives (rule 2), `lib/api/*`, `lib/format.ts`, `lib/business-date.ts`,
  `lib/apply-field-errors.ts`, `auth/*`, `config/*`, `e2e/support/*`, `e2e/fake-api.spec.ts`, and the
  fake API's `access`, `http`, `idempotency`, `router`, `server`, `audit-log` and `context-token`
  `.mts` files.
- 08's and 13's modules, which 16 only consumes (08's `isTimeZone` and `focusRecordTitle`).
- The controller-owned files (lane rules §4), the plan index and other layers' plans.

**Concurrency.** Lane X builds 09 and 10 meanwhile; 17 and 11 follow in this lane.

| 16 touches                                                                                                        | Also touched by                                           | Resolution            |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------- |
| `theme/create-finaxis-theme.ts` (four new `MuiStep*` keys after `MuiTab`)                                         | 08's fix wave V4 (`MuiAutocomplete`, already in the base) | additive keys         |
| `e2e/fake-api/state.mts` (two optional fields), `scenarios.mts` (one builder, IDs), `routes/platform-tenants.mts` | 09 and 10 add builders and routes; 17 extends the routes  | R3: stack-order union |
| `README.md`, `AGENTS.md`, `docs/backend-gaps.md`                                                                  | 09, 10                                                    | R4: union             |
| `modules/platform-administration/**`, `app/(authenticated)/platform-admin/**`                                     | 17, after 16                                              | sequential            |
| `components/data-display/wizard-form.tsx` (new)                                                                   | 11 consumes it                                            | —                     |
| `e2e/platform-administration.spec.ts` (two assertions and a comment)                                              | none                                                      | —                     |

**Rulings to record in the ledger.** The pre-flight writes these as `Ruling:` lines; implementers
don't.

1. **Base F_08.** 16 consumes 08's `ListToolbar` `search` kind, `hrefWith`, `applyFieldErrors`,
   `isTimeZone` and `focusRecordTitle`, and 08's fix-wave V3 `ReasonDialog` `tone` when it is present.
   A missing item is a controller blocker, never a local copy.
2. **Migration scope** (lane rules §3: 16 "migrates only the tenant mappers"). The tenant types,
   mappers, service reads and query parsers of `modules/platform-administration/` move to `tenants/`
   on the contract pattern (Tasks 5–6). The tenant user and branch mappers, types, reads and parsers
   stay for 17. `TenantTable`, `PlatformPagination` and `PlatformStatusChip` lose their last consumer
   and are deleted. `PlatformPageShell` stays for the overview.
3. **The overview (17's page) changes only its data call:** one `size=1` `listTenants` through
   `load()`. Its count leaves out the platform organisation, and a failure renders `ErrorState` (the
   old page echoed `error.message`, which AGENTS.md forbids). Its h1 "Platform overview", which
   `e2e/shell.spec.ts` asserts, stays.
4. **BG-29.**
   - The directory filters out the platform organisation's row.
   - The result label uses `visibleTenantTotal`: exact unfiltered, and exact filtered when the row is
     on the page in view.
   - The pagination footer keeps the backend's metadata, so no page is ever stranded.
   - The platform organisation's record and amend URLs are a 404, so no lifecycle action can target
     it from this workspace.
5. **Columns and sorts** (spec §11.1):
   - Institution (the name; sorts `displayName`), Code (`tenantCode`), Country (`countryCode`),
     Lifecycle (not sortable: status isn't in the allow-list) and Created (`createdAt`).
   - Code gets its own column, so each sort field has a header (08's Ruling 3).
   - Default: `createdAt` DESC, ten per page. No row `hover`, and a `nowrap` date cell (08's V5/V8).
6. **Filters:** the `search` kind (`q`); Status (all nine states); Country (every region `Intl` can
   name, plus a URL value outside that list, so it stays selectable); Created from / Created to
   (datetime, in a UTC page; To stores the minute's last millisecond).
7. **Route group.** The record lives in `[tenantId]/(record)/`, so `amend/` renders without the hero.
   The tabs are Overview and Provisioning; 17 adds Branches and Users under `(record)/`. There is no
   Settings or Audit tab (BG-12, BG-06).
8. **Dialogs.**
   - Submit, Approve and Retry bootstrap use `ConfirmDialog`. The backend reads no body: `{}` is sent,
     and a reason is never forwarded.
   - Reject, Suspend and Deprovision use `ReasonDialog` with a required 3–500 reason; Reactivate takes
     an optional one.
   - Deprovision is CRITICAL: the tenant code is typed back. It is a UX guard; the permission is the
     gate.
   - Reject and Deprovision pass `tone="error"` when the base's `ReasonDialog` has 08's V3 prop. Every
     test and spec locator accepts either `dialog` or `alertdialog`.
9. **Approve stays on offer for its maker**, because the platform context can't read the creator or
   submitter (BG-08). A 403 is explained inside the dialog as "permission or maker-checker".
10. **The tenant code pre-check** (BG-07):
    - The create action searches `q=<code>` (one page of 100) and compares codes exactly, ignoring
      case, before the POST.
    - A hit becomes the frontend-only problem code `tenant_code_taken`. It is thrown as a synthesized
      `BackendApiError(409)`, as `tenant-api.ts` synthesizes a 403 for a missing context token.
    - It is mapped to the code field, and the wizard returns to that field's step.
11. **Amend** is a full replacement (contract §D):
    - The tenant code is shown read-only and sent unchanged; a changed code could collide, which is a 500.
    - The legal name, registration number and first administrator are re-entered, because the
      platform never returns them (BG-14).
    - Initial settings and the business date aren't sent; the backend ignores them on amend.
12. **The Initial settings step** offers `default_timezone` and `base_currency` (both optional, unset
    by default) and `audit_retention_days` (the only way to set it). The two maker-checker switches
    and automatic advance aren't offered, because they're unenforced (D10, BG-12); the step says so.
13. **Backend `validation_failed` violations stay unmapped** (07's and 08's ruling). The wizard and
    the actions apply the same rules (RHF and zod), and known guard codes get named messages.
14. **UTC** for every instant in this workspace, labelled (spec §9).
15. **Fake API.** `platform-tenants` carries the `tenant.*` codes. `FakeOrganisation` gains optional
    `createdBy` and `submittedBy` for maker-checker, like `FakeBranch.draftedBy`. The fake writes no
    audit rows: nothing in this workspace reads them (BG-06), marked `ponytail:`.
16. **The Stepper theme and `WizardForm` are 16's** (moved from 11, lane rules §3). 11 consumes them,
    and their Produces are fixed from this layer on.
17. **Existing specs.** `e2e/platform-administration.spec.ts` keeps both tests and their flows. Only
    two assertions change, because the page they pin changed: the directory's h1 ("Tenant directory"
    → "SACCO institutions", the prototype's and the rail's name), and its pagination check (MUI
    `Pagination` → the kit's `TablePaginationBar`). One comment changes with them.
    `e2e/shell.spec.ts` and `e2e/context.spec.ts` don't change.
18. **Obsolete page tests are deleted, not rewritten.** `tenants/page.test.tsx` and
    `[tenantId]/page.test.tsx` pin removed behaviour: the always-empty currency, timezone and
    bootstrap columns, MUI Pagination hrefs, a ZodError-as-404 shortcut, and echoed backend messages.
    The new behaviour is pinned by Tasks 1–7's unit and component tests and by Task 8's E2E. The
    overview's test is rewritten (Task 6).
19. **Gating includes the read-back** (BG-31), wider than the brief's `tenant.create` alone:
    - the directory renders `ForbiddenState` without `tenant.view`;
    - the Create button and `/new` need `tenant.create` and `tenant.view`, because the code
      pre-check and the redirect after create both read the directory;
    - amend needs `tenant.update_draft` and `tenant.view`;
    - every lifecycle action already needs `tenant.view` (Task 1's `availableTenantActions`).

## Review Focus

Five input classes, each with its pinned tests:

1. **A stale or switched context mid-flow** (index item 1, and 07's I2).
   - A stale context token on a record tab lands on `/select-context?next=<that tab>` and comes back
     to it: Task 8, `platform-tenants.spec.ts` "sends a stale platform context…".
   - A submit made after the user switched organisation in another tab is refused before the backend,
     because every dialog and the wizard send `contextOrganisationId`: Task 5
     `tenant-lifecycle-actions.test.tsx` and `retry-bootstrap-button.test.tsx`, Task 7
     `tenant-draft-wizard.test.tsx`.
2. **Double submit and retry** (index item 2).
   - The wizard keeps one key across a failed create and retries with it: Task 7, "…returns to a
     taken code, and retries the create with the same key".
   - `ReasonDialog` keeps the typed values and its key across a refused deprovision: Task 5,
     "deprovisions only with the typed tenant code".
   - A replayed approval returns the stored 202 with `Idempotency-Replayed: true` and never
     transitions twice: Task 3, `fake-api-platform-tenants.spec.ts`.
3. **Maker-checker and hidden permissions** (BG-08, BG-31).
   - Nothing is offered without `tenant.view`, and each action needs its own code: Task 1,
     `tenant-rules.test.ts`.
   - An approve 403 is explained as permission or maker-checker: Task 2 `tenant-actions.test.ts`;
     Task 5, inside the dialog; Task 8, "creates a draft… then explains the maker-checker refusal".
   - The fake refuses a submitter who didn't draft the request (Mwangaza) and a maker who drafted
     and submitted it (Umoja): Task 3. The read-only operator sees no mutation (Task 8, "offers no
     tenant mutations without the permissions").
4. **Long values at 375 px** (index item 4).
   - The 100-character institution name (the backend's maximum) in the directory, the hero and the
     Overview never scrolls the page: Task 8's axe matrix (`expectA11yCaseApplied`).
   - Table cells truncate, with the full value in `title`: Task 6, `tenant-directory-table.test.tsx`.
5. **Drift in responses and URLs** (index item 5).
   - An unknown lifecycle or bootstrap status, a missing field or a date-only instant fails the parse:
     Task 1, `tenant-contract.test.ts`. The layout and pages then render `ErrorState` with a
     reference through `load()` (the path layers 06–08 pin). A malformed id rejects before any call:
     Task 2, `tenant-service.test.ts`.
   - An unknown `sortBy`, status, country, date or page size never reaches the backend (an unknown
     `sort_by` is a 500): Task 1, `tenant-query.test.ts`.

Also pinned:

- **BG-29:** the platform organisation's row never shows, the counts leave it out, and its record URL
  is a 404: Task 1 (`visibleTenantTotal`), Task 6 (the overview count), Task 8 (the directory test).
- **BG-07:** a taken tenant code is refused before the POST: Tasks 2, 7 and 8.
- **CRITICAL deprovision:** it needs the tenant code typed back: Tasks 2, 5 and 8.

---

## Pre-flight notes (the workflow's pre-flight phase; not a task)

Implementers never execute this section. The pre-flight agent runs it before Task 1, records the
Rulings above in the ledger, and turns any drift into per-task notes.

1. **The base holds F_08.** Read each file with `git show HEAD:<path>` (single-quoted):

   ```bash
   grep -n "kind: 'search'" components/data-display/list-toolbar.tsx
   grep -n "endOfMinute" components/data-display/list-toolbar.tsx
   grep -n "export function hrefWith" lib/api/query-string.ts
   grep -n "export function applyFieldErrors" lib/apply-field-errors.ts
   grep -n "export function isTimeZone" modules/administration/branches/branch-rules.ts
   grep -n "export function focusRecordTitle" modules/administration/branches/components/branch-lifecycle-actions.tsx
   grep -n "contextOrganisationId" components/data-display/reason-dialog.tsx components/data-display/confirm-dialog.tsx lib/api/action-result.ts
   grep -n "tone" components/data-display/reason-dialog.tsx
   ```

   - If any of the first seven is missing, that is a blocker for the controller: 16 needs F_08 and
     never builds a local copy.
   - The last grep checks 08's fix wave V3 (`tone?: 'default' | 'error'`). If `ReasonDialog` has no
     `tone`, Task 5 deletes its one `tone={…}` line; its tests and Task 8's spec accept either role.
     Record a Ruling.
   - Also note whether 08's fix wave V7 changed `focusRecordTitle` or the `RecordHero` title. 16 only
     calls the function either way.

2. **Consumed signatures.** Diff each task's Interfaces → Consumes against the base. On a mismatch,
   adapt 16's call sites only, and record a Ruling.
3. **The platform module is still the snapshot's** (c6411f2):
   `git log --oneline c6411f2e2e37c34b70f5090f79a06f354fd52fad..HEAD -- modules/platform-administration 'app/(authenticated)/platform-admin' e2e/platform-administration.spec.ts e2e/fake-api/routes/platform-tenants.mts`
   prints nothing, because 17 hasn't started. The routes file still has only its two GET routes.
4. **Seeds.** `grep -rn "16000000-" e2e` prints nothing, `BUILDERS` has no `'platform-tenants'`, and
   `FakeOrganisation` has no `createdBy` or `submittedBy`. Note `BUILDERS`' last entry; Task 3 appends
   after it.
5. **Theme.** `grep -n "MuiStep" theme/create-finaxis-theme.ts` prints nothing. Note where 08's V4
   `MuiAutocomplete` entry landed; Task 4 inserts after `MuiTab` either way.
6. **StatusChip `TONES`** already map all nine tenant states and all six bootstrap states, and the
   timeline passes an explicit `tone` for its own labels. So 16 adds no tone.
7. **Docs anchors.** In README: the `platform-admin/` tree lines, the `platform-administration/`
   module line, the `data-display/` entry, the bullet that starts "The Platform Administration
   workspace", the phrase "the platform read endpoints", and step 3 of "Next recommended
   implementation steps". In AGENTS.md: the sentence that starts "Two exceptions predate this
   pattern". In docs/backend-gaps.md: BG-14 and BG-29. If another layer reworded one, Task 8 adapts
   its anchor (R4).
8. **Next.js guides** to read before Tasks 5–7, under `node_modules/next/dist/docs/01-app/`:
   `03-api-reference/03-file-conventions/route-groups.md`, `layout.md`, `not-found.md` and
   `dynamic-routes.md`, and `02-guides/server-actions.md` (`redirect` in an action).
9. **Affected E2E per task:**
   - Tasks 1, 2, 4 and 7: none. Task 7's pages are covered by Task 8's spec.
   - Task 3: `e2e/fake-api-platform-tenants.spec.ts e2e/fake-api.spec.ts`.
   - Task 5: `e2e/platform-administration.spec.ts e2e/context.spec.ts`.
   - Task 6: `e2e/platform-administration.spec.ts e2e/shell.spec.ts`.
   - Task 8: `e2e/platform-tenants.spec.ts e2e/platform-administration.spec.ts e2e/fake-api-platform-tenants.spec.ts`.
10. **Deferred minors to record** (`Layer 16: minor (deferred): …`):
    - fold 16's currency and timezone option helpers into 13's `settings-rules.ts` after integration
      (controller);
    - BG-29: a filtered count can read one high on pages without the platform row;
    - the country list includes `Intl`'s few non-country regions (EU, UN, …);
    - the tenant code pre-check scans one page of 100 matches.

---

### Task 1: Tenant contract, directory query and lifecycle rules

**Files (under `modules/platform-administration/tenants/`):**

- Create: `tenant-contract.ts`, `tenant-contract.test.ts`
- Create: `tenant-query.ts`, `tenant-query.test.ts`
- Create: `tenant-rules.ts`, `tenant-rules.test.ts`

**Interfaces:**

- Consumes:
  - `uuidSchema`, `instantSchema`, `pageSchema(item)` (`lib/api/wire.ts`);
  - `parseListSort<Field>(params, allowed, fallback): ListSort<Field>`,
    `sortQuery(sort): { sort_by; sort_dir }`, `type ListSort<Field>` (`lib/api/list-sort.ts`);
  - `parsePaging(params, defaultSize): { page: number; size: number }` (`lib/api/paging.ts`);
  - `toQueryString(query: Record<string, string | number | undefined>): string`
    (`lib/api/query-string.ts`);
  - `can(holder, code): boolean`, `type PermissionHolder` (`auth/permissions.ts`);
  - `type StatusTone` (`components/data-display/status-chip.tsx`);
  - `isoToBusinessDate(iso: string): string | null` (`lib/business-date.ts`);
  - 08: `isTimeZone(value: string): boolean` (`modules/administration/branches/branch-rules.ts`).
- Produces (consumed by Tasks 2 and 5–7, and by 17):
  - `tenant-contract.ts`: `TENANT_STATUSES`, `type TenantStatus`, `BOOTSTRAP_STATUSES`,
    `type BootstrapStatus`, `TENANT_SORT_FIELDS`, `type TenantSortField`, `type TenantSummary`
    (`{ id, tenantCode, displayName, countryCode, status, createdAt }`), `tenantPageSchema`,
    `tenantDetailSchema`, `type TenantDetail` (adds `baseCurrencyCode`, `timezone`,
    `bootstrapStatus: BootstrapStatus | null`, `bootstrapFailureCode: string | null`, `updatedAt`),
    `tenantDraftResultSchema` (→ `{ tenantId }`).
  - `tenant-query.ts`: `DEFAULT_TENANT_PAGE_SIZE` (10), `DEFAULT_TENANT_SORT`
    (`{ by: 'createdAt', dir: 'DESC' }`), `interface TenantListQuery`,
    `parseTenantListQuery(params: URLSearchParams): TenantListQuery`,
    `hasTenantFilters(query): boolean`, `tenantListApiPath(query): string`.
  - `tenant-rules.ts`:
    - `type TenantLifecycleAction` (`'amend' | 'submit' | 'approve' | 'reject' | 'suspend' |
'reactivate' | 'deprovision'`), `availableTenantActions(status, holder): TenantLifecycleAction[]`,
      `canRetryBootstrap(bootstrapStatus, holder): boolean`;
    - `interface ProvisioningStep` (`{ label; detail; state: { label; tone: StatusTone } }`),
      `provisioningTimeline(status, bootstrap): ProvisioningStep[] | null`;
    - `visibleTenantTotal(totalItems, filtered, platformOnPage): number`;
    - `interface TenantOption` (`{ value; label }`), `interface TenantFormOptions`
      (`{ countries; currencies; timeZones }`, each `readonly TenantOption[]`),
      `countryName(code): string`, `currencyLabel(code): string`, `countryOptions(): TenantOption[]`,
      `tenantFormOptions(current?): TenantFormOptions`;
    - `tenantAmendSchema`, `tenantDraftSchema`, `type TenantAmendValues`, `type TenantDraftValues`
      (sixteen string fields), `EMPTY_TENANT_DRAFT`, `tenantDraftBody(values): Record<string, unknown>`,
      `initialSettings(values): Record<string, string>`.

- [ ] **Step 1: Write the failing tests**

`modules/platform-administration/tenants/tenant-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { tenantDetailSchema, tenantDraftResultSchema, tenantPageSchema } from './tenant-contract';

const ACME = '99999999-9999-4999-8999-999999999999';
const PAGE = {
  number: 0,
  size: 10,
  total_items: 1,
  total_pages: 1,
  has_next: false,
  has_previous: false,
};
const DETAIL = {
  id: ACME,
  tenant_code: 'acme',
  display_name: 'Acme SACCO',
  country_code: 'KE',
  base_currency_code: 'KES',
  timezone: 'Africa/Nairobi',
  status: 'ACTIVE',
  bootstrap_status: 'FAILED',
  bootstrap_failure_code: 'KEYCLOAK_UNAVAILABLE',
  created_at: '2026-07-01T08:00:00Z',
  updated_at: '2026-07-24T08:00:00Z',
};

describe('tenant contract', () => {
  it('maps a summary page to camelCase and ignores unknown fields', () => {
    expect(
      tenantPageSchema.parse({
        items: [
          {
            id: ACME,
            tenant_code: 'acme',
            display_name: 'Acme SACCO',
            country_code: 'KE',
            status: 'ACTIVE',
            created_at: '2026-07-01T08:00:00Z',
            legal_name: 'never read',
          },
        ],
        page: PAGE,
      }),
    ).toEqual({
      items: [
        {
          id: ACME,
          tenantCode: 'acme',
          displayName: 'Acme SACCO',
          countryCode: 'KE',
          status: 'ACTIVE',
          createdAt: '2026-07-01T08:00:00Z',
        },
      ],
      page: {
        number: 0,
        size: 10,
        totalItems: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    });
  });

  it('maps a detail and keeps a null bootstrap (the platform organisation, SQL-seeded tenants)', () => {
    expect(tenantDetailSchema.parse(DETAIL)).toEqual({
      id: ACME,
      tenantCode: 'acme',
      displayName: 'Acme SACCO',
      countryCode: 'KE',
      baseCurrencyCode: 'KES',
      timezone: 'Africa/Nairobi',
      status: 'ACTIVE',
      bootstrapStatus: 'FAILED',
      bootstrapFailureCode: 'KEYCLOAK_UNAVAILABLE',
      createdAt: '2026-07-01T08:00:00Z',
      updatedAt: '2026-07-24T08:00:00Z',
    });
    expect(
      tenantDetailSchema.parse({ ...DETAIL, bootstrap_status: null, bootstrap_failure_code: null }),
    ).toMatchObject({ bootstrapStatus: null, bootstrapFailureCode: null });
  });

  it('rejects an unknown state, a missing field or a date-only instant (drift → the error state)', () => {
    expect(tenantDetailSchema.safeParse({ ...DETAIL, status: 'PAUSED' }).success).toBe(false);
    expect(tenantDetailSchema.safeParse({ ...DETAIL, bootstrap_status: 'RETRYING' }).success).toBe(
      false,
    );
    const { timezone: _timezone, ...missing } = DETAIL;
    expect(tenantDetailSchema.safeParse(missing).success).toBe(false);
    expect(tenantDetailSchema.safeParse({ ...DETAIL, created_at: '2026-07-01' }).success).toBe(
      false,
    );
  });

  it('reads only the new id from a draft result, whatever its status echo says', () => {
    expect(tenantDraftResultSchema.parse({ organisation_id: ACME, status: 'DRAFT' })).toEqual({
      tenantId: ACME,
    });
  });
});
```

`modules/platform-administration/tenants/tenant-query.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hasTenantFilters, parseTenantListQuery, tenantListApiPath } from './tenant-query';

const parse = (query: string) => parseTenantListQuery(new URLSearchParams(query));

describe('tenant directory query', () => {
  it('defaults to the newest first, ten per page', () => {
    expect(parse('')).toEqual({ sort: { by: 'createdAt', dir: 'DESC' }, page: 0, size: 10 });
  });

  it('keeps every known filter, trimmed', () => {
    expect(
      parse(
        'q=%20acme%20&status=SUSPENDED&country=KE&createdFrom=2026-07-01T00%3A00%3A00.000Z' +
          '&createdTo=2026-07-31T23%3A59%3A59.999Z&sortBy=tenantCode&sortDir=desc&page=2&size=20',
      ),
    ).toEqual({
      q: 'acme',
      status: 'SUSPENDED',
      country: 'KE',
      createdFrom: '2026-07-01T00:00:00.000Z',
      createdTo: '2026-07-31T23:59:59.999Z',
      sort: { by: 'tenantCode', dir: 'DESC' },
      page: 2,
      size: 20,
    });
  });

  it('drops what the backend would answer with a 500 or an empty page (review focus 5)', () => {
    expect(
      parse(
        'status=PAUSED&country=Kenya&createdFrom=2026-07-01&createdTo=yesterday' +
          '&sortBy=status&size=25&page=-1',
      ),
    ).toEqual({ sort: { by: 'createdAt', dir: 'DESC' }, page: 0, size: 10 });
  });

  it('builds the snake_case path with the camelCase sort, leaving out what is unset', () => {
    expect(
      tenantListApiPath(
        parse(
          'q=acme&country=KE&createdTo=2026-07-31T23%3A59%3A59.999Z&sortBy=displayName&sortDir=ASC',
        ),
      ),
    ).toBe(
      '/api/v1/platform/tenants?q=acme&country=KE&created_to=2026-07-31T23%3A59%3A59.999Z' +
        '&sort_by=displayName&sort_dir=ASC&page=0&size=10',
    );
  });

  it('knows when a filter narrows the list', () => {
    expect(hasTenantFilters(parse(''))).toBe(false);
    expect(hasTenantFilters(parse('sortBy=displayName&page=1'))).toBe(false);
    expect(hasTenantFilters(parse('createdFrom=2026-07-01T00%3A00%3A00.000Z'))).toBe(true);
  });
});
```

`modules/platform-administration/tenants/tenant-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  availableTenantActions,
  canRetryBootstrap,
  countryName,
  currencyLabel,
  EMPTY_TENANT_DRAFT,
  initialSettings,
  provisioningTimeline,
  tenantDraftBody,
  tenantDraftSchema,
  tenantFormOptions,
  visibleTenantTotal,
  type TenantDraftValues,
} from './tenant-rules';

const EVERY_CODE = {
  permissions: [
    'tenant.view',
    'tenant.update_draft',
    'tenant.submit_for_approval',
    'tenant.approve',
    'tenant.reject',
    'tenant.suspend',
    'tenant.reactivate',
    'tenant.deprovision',
    'tenant.bootstrap_retry',
  ],
};

const VALID: TenantDraftValues = {
  ...EMPTY_TENANT_DRAFT,
  tenantCode: 'tujenge-traders',
  displayName: 'Tujenge Traders SACCO',
  countryCode: 'KE',
  baseCurrencyCode: 'KES',
  timezone: 'Africa/Nairobi',
  adminEmail: 'amina@tujenge.example',
  adminUsername: 'amina.otieno',
  adminDisplayName: 'Amina Otieno',
  adminPhone: '+254712000140',
};

describe('tenant lifecycle availability', () => {
  it.each([
    ['DRAFT', ['amend', 'submit']],
    ['PENDING_APPROVAL', ['approve', 'reject']],
    ['ACTIVE', ['suspend', 'deprovision']],
    ['SUSPENDED', ['reactivate', 'deprovision']],
    ['PROVISIONING', []],
    ['DEPROVISIONING', []],
    ['DEPROVISIONED', []],
    ['REJECTED', []],
    ['ARCHIVED', []],
  ] as const)('offers %s → %j with every code', (status, expected) => {
    expect(availableTenantActions(status, EVERY_CODE)).toEqual(expected);
  });

  it("needs each action's own code, and offers nothing without the tenant.view read-back (BG-31)", () => {
    expect(
      availableTenantActions('ACTIVE', { permissions: ['tenant.view', 'tenant.suspend'] }),
    ).toEqual(['suspend']);
    expect(
      availableTenantActions('PENDING_APPROVAL', {
        permissions: ['tenant.approve', 'tenant.reject'],
      }),
    ).toEqual([]);
  });

  it('offers a bootstrap retry only for a FAILED bootstrap, with both codes', () => {
    expect(canRetryBootstrap('FAILED', EVERY_CODE)).toBe(true);
    expect(canRetryBootstrap('QUEUED', EVERY_CODE)).toBe(false);
    expect(canRetryBootstrap(null, EVERY_CODE)).toBe(false);
    expect(canRetryBootstrap('FAILED', { permissions: ['tenant.bootstrap_retry'] })).toBe(false);
  });
});

describe('provisioningTimeline', () => {
  const chips = (...args: Parameters<typeof provisioningTimeline>) =>
    provisioningTimeline(...args)?.map((step) => step.state.label);

  it("isn't tracked without a bootstrap record", () => {
    expect(provisioningTimeline('ACTIVE', null)).toBeNull();
  });

  it.each([
    ['DRAFT', 'DRAFT', ['Done', 'Waiting', 'Not started', 'Not started']],
    ['PENDING_APPROVAL', 'PENDING_ACTIVATION', ['Done', 'Done', 'Waiting', 'Not started']],
    ['ACTIVE', 'QUEUED', ['Done', 'Done', 'Done', 'In progress']],
    ['ACTIVE', 'PROVISIONING_IDENTITY', ['Done', 'Done', 'Done', 'In progress']],
    ['ACTIVE', 'COMPLETED', ['Done', 'Done', 'Done', 'Done']],
    // BG-24: a later invitee's failure can turn COMPLETED into FAILED; the timeline shows it as is.
    ['ACTIVE', 'FAILED', ['Done', 'Done', 'Done', 'Failed']],
    ['REJECTED', 'DRAFT', ['Done', 'Done', 'Rejected', 'Not started']],
  ] as const)('%s with a %s bootstrap reads %j', (status, bootstrap, expected) => {
    expect(chips(status, bootstrap)).toEqual(expected);
  });

  it('tones each state, and says why a rejected request stopped', () => {
    const rejected = provisioningTimeline('REJECTED', 'DRAFT') ?? [];
    expect(rejected[2]).toEqual({
      label: 'Approved',
      detail: 'Rejected. A rejected request is final, and its tenant code stays taken.',
      state: { label: 'Rejected', tone: 'error' },
    });
    expect(provisioningTimeline('ACTIVE', 'COMPLETED')?.[0]?.state.tone).toBe('success');
    expect(provisioningTimeline('DRAFT', 'DRAFT')?.[3]?.state.tone).toBe('default');
  });
});

describe('visibleTenantTotal (BG-29)', () => {
  it('always leaves the platform organisation out of an unfiltered count', () => {
    expect(visibleTenantTotal(8, false, false)).toBe(7);
    expect(visibleTenantTotal(8, false, true)).toBe(7);
  });

  it('leaves it out of a filtered count only when its row is on the page in view', () => {
    expect(visibleTenantTotal(3, true, true)).toBe(2);
    expect(visibleTenantTotal(3, true, false)).toBe(3);
    expect(visibleTenantTotal(0, false, false)).toBe(0);
  });
});

describe('country, currency and timezone choices', () => {
  it('names a country and a currency in English, falling back to the code', () => {
    expect(countryName('KE')).toBe('Kenya');
    // Not a region subtag: Intl throws, and the code stays.
    expect(countryName('KEN')).toBe('KEN');
    expect(currencyLabel('KES')).toBe('KES · Kenyan Shilling');
    expect(currencyLabel('K')).toBe('K');
  });

  it('lists every nameable country by name, every currency and every zone', () => {
    const options = tenantFormOptions();
    const labels = options.countries.map((option) => option.label);
    expect(options.countries).toContainEqual({ value: 'KE', label: 'Kenya' });
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    expect(options.currencies).toContainEqual({ value: 'KES', label: 'KES · Kenyan Shilling' });
    expect(options.timeZones).toContainEqual({ value: 'Africa/Nairobi', label: 'Africa/Nairobi' });
  });

  it('puts a stored value the runtime does not list first, so amend still shows it', () => {
    const options = tenantFormOptions({
      countryCode: 'KEN',
      baseCurrencyCode: 'KES',
      timezone: 'Mars/Olympus',
    });
    expect(options.countries[0]).toEqual({ value: 'KEN', label: 'KEN' });
    expect(options.currencies.filter((option) => option.value === 'KES')).toHaveLength(1);
    expect(options.timeZones[0]).toEqual({ value: 'Mars/Olympus', label: 'Mars/Olympus' });
  });
});

describe('tenantDraftSchema', () => {
  it('accepts a complete draft with every optional field left empty', () => {
    expect(tenantDraftSchema.safeParse(VALID).success).toBe(true);
  });

  it.each([
    ['tenantCode', 'Tujenge Traders', 'Use 3–32 lowercase letters, digits or hyphens.'],
    ['displayName', 'T', 'Enter a name of at least 2 characters.'],
    ['countryCode', '', 'Choose a country.'],
    ['baseCurrencyCode', 'KE', 'Choose a currency.'],
    ['timezone', 'Mars/Olympus', 'Choose a timezone.'],
    ['adminEmail', 'amina', 'Enter a valid email address.'],
    ['adminUsername', 'am', 'Use 3–50 letters, digits, dots, underscores or hyphens.'],
    // Required by the backend although it is typed nullable (spec §11.1).
    ['adminPhone', '', 'Use the international format, e.g. +254712000140.'],
    ['businessDate', '2026-02-30', 'Choose a valid date.'],
    ['defaultTimezoneSetting', 'Mars/Olympus', 'Choose a timezone.'],
    ['auditRetentionDays', '-1', 'Enter a whole number of days.'],
  ] as const)('rejects %s = %j with its own message', (field, value, message) => {
    const result = tenantDraftSchema.safeParse({ ...VALID, [field]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: [field], message });
  });
});

describe('the draft body', () => {
  it('builds the snake_case institution and administrator field by field, nulling blank optionals', () => {
    expect(
      tenantDraftBody({
        ...VALID,
        legalName: 'Tujenge Traders Co-operative Society Ltd',
        adminSendApplicationInvite: 'true',
      }),
    ).toEqual({
      tenant_code: 'tujenge-traders',
      display_name: 'Tujenge Traders SACCO',
      legal_name: 'Tujenge Traders Co-operative Society Ltd',
      registration_number: null,
      country_code: 'KE',
      base_currency_code: 'KES',
      timezone: 'Africa/Nairobi',
      admin: {
        email: 'amina@tujenge.example',
        username: 'amina.otieno',
        display_name: 'Amina Otieno',
        phone_e164: '+254712000140',
        send_application_invite: true,
      },
    });
  });

  it('sends only the catalogue settings that were filled in, as strings', () => {
    expect(initialSettings(VALID)).toEqual({});
    expect(
      initialSettings({
        ...VALID,
        defaultTimezoneSetting: 'Africa/Nairobi',
        baseCurrencySetting: 'KES',
        auditRetentionDays: '0365',
      }),
    ).toEqual({
      default_timezone: 'Africa/Nairobi',
      base_currency: 'KES',
      audit_retention_days: '365',
    });
  });
});
```

- [ ] **Step 2: Run them**

Run (form T) on `modules/platform-administration/tenants`. Expected: FAIL, because the three modules
don't exist yet.

- [ ] **Step 3: Implement `tenant-contract.ts`**

```ts
import { z } from 'zod';
import { instantSchema, pageSchema, uuidSchema } from '@/lib/api/wire';

/** Organisation lifecycle (contract §F). */
export const TENANT_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'PROVISIONING',
  'ACTIVE',
  'SUSPENDED',
  'DEPROVISIONING',
  'DEPROVISIONED',
  'REJECTED',
  'ARCHIVED',
] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

/** The first administrator's bootstrap (contract §F). `null` for the platform organisation and for
 * SQL-seeded tenants. */
export const BOOTSTRAP_STATUSES = [
  'DRAFT',
  'PENDING_ACTIVATION',
  'QUEUED',
  'PROVISIONING_IDENTITY',
  'COMPLETED',
  'FAILED',
] as const;
export type BootstrapStatus = (typeof BOOTSTRAP_STATUSES)[number];

/** `sort_by` allow-list for `GET /platform/tenants` (contract §E.2); anything else is a 500. */
export const TENANT_SORT_FIELDS = [
  'displayName',
  'tenantCode',
  'countryCode',
  'createdAt',
] as const;
export type TenantSortField = (typeof TENANT_SORT_FIELDS)[number];

/** List items carry only these six fields (contract §C, spec §11.1). */
const tenantSummarySchema = z
  .object({
    id: uuidSchema,
    tenant_code: z.string(),
    display_name: z.string(),
    country_code: z.string(),
    status: z.enum(TENANT_STATUSES),
    created_at: instantSchema,
  })
  .transform((tenant) => ({
    id: tenant.id,
    tenantCode: tenant.tenant_code,
    displayName: tenant.display_name,
    countryCode: tenant.country_code,
    status: tenant.status,
    createdAt: tenant.created_at,
  }));

export type TenantSummary = z.output<typeof tenantSummarySchema>;

export const tenantPageSchema = pageSchema(tenantSummarySchema);

/** No legal name, registration number, first administrator or status reason: they are write-only
 * (BG-14). */
export const tenantDetailSchema = z
  .object({
    id: uuidSchema,
    tenant_code: z.string(),
    display_name: z.string(),
    country_code: z.string(),
    base_currency_code: z.string(),
    timezone: z.string(),
    status: z.enum(TENANT_STATUSES),
    bootstrap_status: z.enum(BOOTSTRAP_STATUSES).nullable(),
    bootstrap_failure_code: z.string().nullable(),
    created_at: instantSchema,
    updated_at: instantSchema,
  })
  .transform((tenant) => ({
    id: tenant.id,
    tenantCode: tenant.tenant_code,
    displayName: tenant.display_name,
    countryCode: tenant.country_code,
    baseCurrencyCode: tenant.base_currency_code,
    timezone: tenant.timezone,
    status: tenant.status,
    bootstrapStatus: tenant.bootstrap_status,
    bootstrapFailureCode: tenant.bootstrap_failure_code,
    createdAt: tenant.created_at,
    updatedAt: tenant.updated_at,
  }));

export type TenantDetail = z.output<typeof tenantDetailSchema>;

// `status` stays a plain string: a create that succeeded must never fail on its echo.
export const tenantDraftResultSchema = z
  .object({ organisation_id: uuidSchema, status: z.string() })
  .transform((result) => ({ tenantId: result.organisation_id }));
```

- [ ] **Step 4: Implement `tenant-query.ts`**

```ts
import { parseListSort, sortQuery, type ListSort } from '@/lib/api/list-sort';
import { parsePaging } from '@/lib/api/paging';
import { toQueryString } from '@/lib/api/query-string';
import { instantSchema } from '@/lib/api/wire';
import {
  TENANT_SORT_FIELDS,
  TENANT_STATUSES,
  type TenantSortField,
  type TenantStatus,
} from './tenant-contract';

export const DEFAULT_TENANT_PAGE_SIZE = 10;
export const DEFAULT_TENANT_SORT: ListSort<TenantSortField> = { by: 'createdAt', dir: 'DESC' };

export interface TenantListQuery {
  q?: string;
  status?: TenantStatus;
  country?: string;
  createdFrom?: string;
  createdTo?: string;
  sort: ListSort<TenantSortField>;
  page: number;
  size: number;
}

/** An ISO instant from the toolbar's datetime field (contract §A); anything else is dropped. */
function instantParam(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name);
  return value && instantSchema.safeParse(value).success ? value : undefined;
}

/** URL → validated directory query. Unknown statuses, countries, dates and sort fields are dropped,
 * never sent: an unknown `sort_by` is a backend 500, and an unknown filter value an empty page. */
export function parseTenantListQuery(params: URLSearchParams): TenantListQuery {
  const query: TenantListQuery = {
    ...parsePaging(params, DEFAULT_TENANT_PAGE_SIZE),
    sort: parseListSort(params, TENANT_SORT_FIELDS, DEFAULT_TENANT_SORT),
  };
  const q = params.get('q')?.trim().slice(0, 100);
  if (q) query.q = q;
  const status = TENANT_STATUSES.find((value) => value === params.get('status'));
  if (status) query.status = status;
  const country = params.get('country');
  if (country && /^[A-Z]{2}$/.test(country)) query.country = country;
  const createdFrom = instantParam(params, 'createdFrom');
  if (createdFrom) query.createdFrom = createdFrom;
  const createdTo = instantParam(params, 'createdTo');
  if (createdTo) query.createdTo = createdTo;
  return query;
}

export function hasTenantFilters(query: TenantListQuery): boolean {
  return Boolean(query.q ?? query.status ?? query.country ?? query.createdFrom ?? query.createdTo);
}

export function tenantListApiPath(query: TenantListQuery): string {
  return `/api/v1/platform/tenants${toQueryString({
    q: query.q,
    status: query.status,
    country: query.country,
    created_from: query.createdFrom,
    created_to: query.createdTo,
    ...sortQuery(query.sort),
    page: query.page,
    size: query.size,
  })}`;
}
```

- [ ] **Step 5: Implement `tenant-rules.ts`**

```ts
import { z } from 'zod';
import { can, type PermissionHolder } from '@/auth/permissions';
import type { StatusTone } from '@/components/data-display/status-chip';
import { isoToBusinessDate } from '@/lib/business-date';
import { isTimeZone } from '@/modules/administration/branches/branch-rules';
import type { BootstrapStatus, TenantDetail, TenantStatus } from './tenant-contract';

export type TenantLifecycleAction =
  'amend' | 'submit' | 'approve' | 'reject' | 'suspend' | 'reactivate' | 'deprovision';

const ACTIONS_BY_STATUS: Record<TenantStatus, readonly TenantLifecycleAction[]> = {
  DRAFT: ['amend', 'submit'],
  PENDING_APPROVAL: ['approve', 'reject'],
  PROVISIONING: [],
  ACTIVE: ['suspend', 'deprovision'],
  SUSPENDED: ['reactivate', 'deprovision'],
  DEPROVISIONING: [],
  DEPROVISIONED: [],
  REJECTED: [],
  ARCHIVED: [],
};

const PERMISSION: Record<TenantLifecycleAction, string> = {
  amend: 'tenant.update_draft',
  submit: 'tenant.submit_for_approval',
  approve: 'tenant.approve',
  reject: 'tenant.reject',
  suspend: 'tenant.suspend',
  reactivate: 'tenant.reactivate',
  deprovision: 'tenant.deprovision',
};

/**
 * Spec §11.2's hero lifecycle. Every tenant mutation reads the record back, so it also needs
 * `tenant.view` (BG-31). Approve stays on offer for its maker: the platform context can't read who
 * created or submitted a request (BG-08), so a refusal is explained when it comes.
 */
export function availableTenantActions(
  status: TenantStatus,
  holder: PermissionHolder,
): TenantLifecycleAction[] {
  if (!can(holder, 'tenant.view')) return [];
  return ACTIONS_BY_STATUS[status].filter((action) => can(holder, PERMISSION[action]));
}

/** Contract §E.2: a retry needs a FAILED bootstrap (else 409), and it reads the tenant back. */
export function canRetryBootstrap(
  bootstrapStatus: BootstrapStatus | null,
  holder: PermissionHolder,
): boolean {
  return (
    bootstrapStatus === 'FAILED' &&
    can(holder, 'tenant.bootstrap_retry') &&
    can(holder, 'tenant.view')
  );
}

export interface ProvisioningStep {
  label: string;
  detail: string;
  /** The step's chip: always a word, never colour alone (WCAG 1.4.1). */
  state: { label: string; tone: StatusTone };
}

const PROVISIONING_STEPS = [
  { label: 'Draft created', detail: 'The request and its first administrator are recorded.' },
  { label: 'Submitted for approval', detail: 'Sent to a different platform administrator.' },
  {
    label: 'Approved',
    detail: 'Activates the institution with its head office and default roles.',
  },
  {
    label: 'First administrator provisioned',
    detail: "Creates the administrator's identity and sends the invitation.",
  },
] as const;

const SUBMITTED: readonly BootstrapStatus[] = [
  'PENDING_ACTIVATION',
  'QUEUED',
  'PROVISIONING_IDENTITY',
  'COMPLETED',
  'FAILED',
];
const APPROVED: readonly BootstrapStatus[] = [
  'QUEUED',
  'PROVISIONING_IDENTITY',
  'COMPLETED',
  'FAILED',
];

const DONE = { label: 'Done', tone: 'success' } as const;
const WAITING = { label: 'Waiting', tone: 'warning' } as const;
const IN_PROGRESS = { label: 'In progress', tone: 'warning' } as const;
const NOT_STARTED = { label: 'Not started', tone: 'default' } as const;

/**
 * The Provisioning tab's timeline (spec §11.2), derived from the lifecycle and bootstrap status.
 * `null` when the bootstrap isn't tracked (the platform organisation, SQL-seeded tenants). A rejected
 * request stops at approval; a failed bootstrap stops at the administrator's provisioning, which a
 * retry restarts (backend: submit → PENDING_ACTIVATION, approve → QUEUED, then the async job).
 */
export function provisioningTimeline(
  status: TenantStatus,
  bootstrap: BootstrapStatus | null,
): ProvisioningStep[] | null {
  if (bootstrap === null) return null;
  const rejected = status === 'REJECTED';
  const done = [
    true,
    rejected || SUBMITTED.includes(bootstrap),
    APPROVED.includes(bootstrap),
    bootstrap === 'COMPLETED',
  ];
  const stopped = rejected ? 2 : bootstrap === 'FAILED' ? 3 : -1;
  const next = stopped === -1 ? done.indexOf(false) : -1;
  return PROVISIONING_STEPS.map((step, index): ProvisioningStep => {
    if (index === stopped) {
      return rejected
        ? {
            label: step.label,
            detail: 'Rejected. A rejected request is final, and its tenant code stays taken.',
            state: { label: 'Rejected', tone: 'error' },
          }
        : { ...step, state: { label: 'Failed', tone: 'error' } };
    }
    if (done[index]) return { ...step, state: DONE };
    if (index === next) return { ...step, state: index === 3 ? IN_PROGRESS : WAITING };
    return { ...step, state: NOT_STARTED };
  });
}

/**
 * BG-29: `GET /platform/tenants` includes the reserved platform organisation, which the directory
 * hides. An unfiltered result always holds it; a filtered one is known to only when its row is on
 * the page in view. ponytail: a filtered count can read one high on pages without that row, and the
 * pagination footer keeps the backend's rows so that no page is stranded — exact once BG-29 closes.
 */
export function visibleTenantTotal(
  totalItems: number,
  filtered: boolean,
  platformOnPage: boolean,
): number {
  return Math.max(0, totalItems - (!filtered || platformOnPage ? 1 : 0));
}

export interface TenantOption {
  value: string;
  label: string;
}

/** The wizard's choices, built once on the server so that SSR and hydration list the same values. */
export interface TenantFormOptions {
  countries: readonly TenantOption[];
  currencies: readonly TenantOption[];
  timeZones: readonly TenantOption[];
}

const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
const CURRENCY_NAMES = new Intl.DisplayNames(['en'], { type: 'currency' });
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** `Kenya`; the bare code when the runtime has no English name for it, or it isn't a region. */
export function countryName(code: string): string {
  try {
    return REGION_NAMES.of(code) ?? code;
  } catch {
    return code;
  }
}

/** `KES · Kenyan Shilling`; the bare code when the runtime has no name for it. */
export function currencyLabel(code: string): string {
  try {
    const name = CURRENCY_NAMES.of(code);
    return name && name !== code ? `${code} · ${name}` : code;
  } catch {
    return code;
  }
}

/**
 * Every two-letter region the runtime can name, sorted by name (contract §D: `^[A-Z]{2}$`; Intl has
 * no region list). ponytail: this also lists Intl's few non-country regions (EU, UN, …); add a
 * deny-list if one confuses users.
 */
export function countryOptions(): TenantOption[] {
  const options: TenantOption[] = [];
  for (const first of LETTERS) {
    for (const second of LETTERS) {
      const code = `${first}${second}`;
      const name = REGION_NAMES.of(code);
      if (name && name !== code) options.push({ value: code, label: name });
    }
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

/** A stored value the runtime doesn't list (a retired code, an alias) goes first, so that amend
 * still shows it. */
function withCurrent(options: TenantOption[], value: string | undefined): TenantOption[] {
  return value && !options.some((option) => option.value === value)
    ? [{ value, label: value }, ...options]
    : options;
}

export function tenantFormOptions(
  current?: Pick<TenantDetail, 'countryCode' | 'baseCurrencyCode' | 'timezone'>,
): TenantFormOptions {
  const currencies = Intl.supportedValuesOf('currency').map((code) => ({
    value: code,
    label: currencyLabel(code),
  }));
  const timeZones = Intl.supportedValuesOf('timeZone').map((zone) => ({
    value: zone,
    label: zone,
  }));
  return {
    countries: withCurrent(countryOptions(), current?.countryCode),
    currencies: withCurrent(currencies, current?.baseCurrencyCode),
    timeZones: withCurrent(timeZones, current?.timezone),
  };
}

const TENANT_CODE = /^[a-z0-9-]{3,32}$/;

/** CreateTenantDraft's institution and first administrator (contract §D), shared by the wizard
 * (React Hook Form) and the Server Actions. Amend sends exactly these: it replaces every field. */
export const tenantAmendSchema = z.object({
  tenantCode: z
    .string()
    .trim()
    .regex(TENANT_CODE, 'Use 3–32 lowercase letters, digits or hyphens.'),
  displayName: z
    .string()
    .trim()
    .min(2, 'Enter a name of at least 2 characters.')
    .max(100, 'Use at most 100 characters.'),
  legalName: z.string().trim().max(100, 'Use at most 100 characters.'),
  registrationNumber: z.string().trim().max(50, 'Use at most 50 characters.'),
  countryCode: z.string().regex(/^[A-Z]{2}$/, 'Choose a country.'),
  baseCurrencyCode: z.string().regex(/^[A-Z]{3}$/, 'Choose a currency.'),
  timezone: z.string().refine(isTimeZone, 'Choose a timezone.'),
  adminEmail: z.email('Enter a valid email address.'),
  adminUsername: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9._-]{3,50}$/, 'Use 3–50 letters, digits, dots, underscores or hyphens.'),
  adminDisplayName: z
    .string()
    .trim()
    .min(2, 'Enter a name of at least 2 characters.')
    .max(100, 'Use at most 100 characters.'),
  // Required by the backend although it is typed nullable (spec §11.1).
  adminPhone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{1,14}$/, 'Use the international format, e.g. +254712000140.'),
  adminSendApplicationInvite: z.enum(['true', 'false']),
});

/**
 * Create also seeds the first business date and catalogue settings (contract §D, §H); amend ignores
 * both. Empty means "not set". Each is one string schema whose check allows `''`, never a union, so
 * the message is the field's own.
 */
export const tenantDraftSchema = tenantAmendSchema.extend({
  businessDate: z
    .string()
    .refine((value) => value === '' || isoToBusinessDate(value) !== null, 'Choose a valid date.'),
  defaultTimezoneSetting: z
    .string()
    .refine((value) => value === '' || isTimeZone(value), 'Choose a timezone.'),
  baseCurrencySetting: z.string().regex(/^([A-Z]{3})?$/, 'Choose a currency.'),
  auditRetentionDays: z
    .string()
    .trim()
    .regex(/^(\d{1,5})?$/, 'Enter a whole number of days.'),
});

export type TenantAmendValues = z.infer<typeof tenantAmendSchema>;
export type TenantDraftValues = z.infer<typeof tenantDraftSchema>;

export const EMPTY_TENANT_DRAFT: TenantDraftValues = {
  tenantCode: '',
  displayName: '',
  legalName: '',
  registrationNumber: '',
  countryCode: '',
  baseCurrencyCode: '',
  timezone: '',
  businessDate: '',
  adminEmail: '',
  adminUsername: '',
  adminDisplayName: '',
  adminPhone: '',
  adminSendApplicationInvite: 'false',
  defaultTimezoneSetting: '',
  baseCurrencySetting: '',
  auditRetentionDays: '',
};

/** CreateTenantDraft / AmendTenantDraft, built field by field (spec §6.2: never spread form
 * values). */
export function tenantDraftBody(values: TenantAmendValues): Record<string, unknown> {
  return {
    tenant_code: values.tenantCode,
    display_name: values.displayName,
    legal_name: values.legalName || null,
    registration_number: values.registrationNumber || null,
    country_code: values.countryCode,
    base_currency_code: values.baseCurrencyCode,
    timezone: values.timezone,
    admin: {
      email: values.adminEmail,
      username: values.adminUsername,
      display_name: values.adminDisplayName,
      phone_e164: values.adminPhone,
      send_application_invite: values.adminSendApplicationInvite === 'true',
    },
  };
}

/** Catalogue keys only (contract §H), and only those filled in. The map is never re-keyed. */
export function initialSettings(values: TenantDraftValues): Record<string, string> {
  const settings: Record<string, string> = {};
  if (values.defaultTimezoneSetting) settings.default_timezone = values.defaultTimezoneSetting;
  if (values.baseCurrencySetting) settings.base_currency = values.baseCurrencySetting;
  if (values.auditRetentionDays) {
    settings.audit_retention_days = String(Number(values.auditRetentionDays));
  }
  return settings;
}
```

- [ ] **Step 6: Run them again**

Run (form T) on `modules/platform-administration/tenants`. Expected: PASS (three files).

- [ ] **Step 7: Commit** (form C)

`git add modules/platform-administration/tenants`

```
feat(platform): add the tenant contract, directory query and lifecycle rules

The contract parses the snake_case tenant summary, detail and draft result. The query keeps only
the allow-listed sort and known filters. The rules cover the lifecycle by status and permission,
the provisioning timeline, the BG-29 count, the form choices, and the draft schemas and body.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 2: Tenant service and lifecycle Server Actions

**Files (under `modules/platform-administration/tenants/`):**

- Create: `tenant-service.ts`, `tenant-service.test.ts`
- Create: `tenant-actions.ts`, `tenant-actions.test.ts`

**Interfaces:**

- Consumes:
  - `apiGet<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>>`,
    `apiPost(path: string, body: Record<string, unknown>, idempotencyKey: string): Promise<unknown>`,
    `apiPatch(path: string, body: Record<string, unknown>, idempotencyKey: string): Promise<unknown>`
    (`lib/api/tenant-api.ts`);
  - `runServerAction<S extends z.ZodType>(schema: S, formData: FormData, run: (input: z.output<S>) =>
Promise<unknown>): Promise<ActionResult>`, `type ActionResult` (`lib/api/action-result.ts`). It
    validates the session, parses `Object.fromEntries(formData)`, applies the I2 check, maps a thrown
    `BackendApiError` through `describeProblem`, rethrows `redirect()`, and calls `refresh()` on
    success;
  - `new BackendApiError(status, { code?, requestId? })` (`auth/backend-api.ts`);
  - `uuidSchema` (`lib/api/wire.ts`), `toQueryString` (`lib/api/query-string.ts`),
    `isoToBusinessDate` (`lib/business-date.ts`);
  - Task 1: `tenantDetailSchema`, `tenantPageSchema`, `tenantDraftResultSchema`, `tenantListApiPath`,
    `type TenantListQuery`, `tenantAmendSchema`, `tenantDraftSchema`, `tenantDraftBody`,
    `initialSettings`.
- Produces (consumed by Tasks 5–7, and by 17):
  - `tenant-service.ts` (server-only): `listTenants(query: TenantListQuery)`,
    `getTenant(tenantId: string)` (`cache()`d; a malformed id rejects), and
    `tenantCodeTaken(code: string): Promise<boolean>`;
  - `tenant-actions.ts` (`'use server'`), each
    `(previous: ActionResult | null, formData: FormData) => Promise<ActionResult>`:
    - `createTenantDraft` reads every `TenantDraftValues` field plus `idempotencyKey`, and redirects
      to the new record;
    - `amendTenantDraft` reads the `TenantAmendValues` fields plus `tenantId` and `idempotencyKey`,
      and redirects to the record;
    - `submitTenant`, `approveTenant` and `retryTenantBootstrap` read `tenantId` and
      `idempotencyKey`;
    - `rejectTenant` and `suspendTenant` read those plus a required `reason`;
    - `reactivateTenant` reads those plus an optional `reason`;
    - `deprovisionTenant` reads those plus a required `reason`, `tenantCode` and `confirmCode`.

- [ ] **Step 1: Write the failing tests**

`modules/platform-administration/tenants/tenant-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args) as unknown,
}));

const service = await import('./tenant-service');

const ACME = '99999999-9999-4999-8999-999999999999';

describe('tenant service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists tenants through the allow-listed path', async () => {
    apiGet.mockResolvedValueOnce({ items: [], page: {} });
    await service.listTenants({
      q: 'acme',
      sort: { by: 'displayName', dir: 'ASC' },
      page: 1,
      size: 20,
    });
    expect(apiGet).toHaveBeenCalledWith(
      '/api/v1/platform/tenants?q=acme&sort_by=displayName&sort_dir=ASC&page=1&size=20',
      expect.anything(),
    );
  });

  it('reads a tenant by a validated id only; a malformed id rejects (a load() failure)', async () => {
    apiGet.mockResolvedValueOnce({});
    await service.getTenant(ACME);
    expect(apiGet).toHaveBeenCalledWith(`/api/v1/platform/tenants/${ACME}`, expect.anything());
    await expect(service.getTenant('../../tenant')).rejects.toThrow();
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('finds a taken tenant code among up to 100 substring matches, ignoring case (BG-07)', async () => {
    apiGet.mockResolvedValueOnce({
      items: [{ tenantCode: 'acme-2' }, { tenantCode: 'ACME' }],
      page: {},
    });
    await expect(service.tenantCodeTaken('acme')).resolves.toBe(true);
    expect(apiGet).toHaveBeenCalledWith(
      '/api/v1/platform/tenants?q=acme&page=0&size=100',
      expect.anything(),
    );
    apiGet.mockResolvedValueOnce({ items: [{ tenantCode: 'acme-2' }], page: {} });
    await expect(service.tenantCodeTaken('acme')).resolves.toBe(false);
  });
});
```

`modules/platform-administration/tenants/tenant-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';

const { apiPatch, apiPost, redirect, runServerAction, tenantCodeTaken } = vi.hoisted(() => ({
  apiPost: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
    Promise.resolve<unknown>({}),
  ),
  apiPatch: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
    Promise.resolve<unknown>({}),
  ),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  runServerAction: vi.fn(),
  tenantCodeTaken: vi.fn((_code: string) => Promise.resolve(false)),
}));
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) as unknown }));
vi.mock('@/lib/api/tenant-api', () => ({
  apiPost: (path: string, body: Record<string, unknown>, key: string) => apiPost(path, body, key),
  apiPatch: (path: string, body: Record<string, unknown>, key: string) => apiPatch(path, body, key),
}));
vi.mock('@/lib/api/action-result', () => ({
  runServerAction: (...args: unknown[]) => runServerAction(...args) as unknown,
}));
vi.mock('./tenant-service', () => ({
  tenantCodeTaken: (code: string) => tenantCodeTaken(code),
}));

const actions = await import('./tenant-actions');

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const TENANT = '16000000-0000-4000-8000-000000000001';
const FIELDS = {
  tenantCode: 'tujenge-traders',
  displayName: 'Tujenge Traders SACCO',
  legalName: '',
  registrationNumber: '',
  countryCode: 'KE',
  baseCurrencyCode: 'KES',
  timezone: 'Africa/Nairobi',
  businessDate: '',
  adminEmail: 'amina@tujenge.example',
  adminUsername: 'amina.otieno',
  adminDisplayName: 'Amina Otieno',
  adminPhone: '+254712000140',
  adminSendApplicationInvite: 'false',
  defaultTimezoneSetting: '',
  baseCurrencySetting: '',
  auditRetentionDays: '',
};
const INSTITUTION = {
  tenant_code: 'tujenge-traders',
  display_name: 'Tujenge Traders SACCO',
  legal_name: null,
  registration_number: null,
  country_code: 'KE',
  base_currency_code: 'KES',
  timezone: 'Africa/Nairobi',
  admin: {
    email: 'amina@tujenge.example',
    username: 'amina.otieno',
    display_name: 'Amina Otieno',
    phone_e164: '+254712000140',
    send_application_invite: false,
  },
};

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

describe('tenant actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mirrors runServerAction's contract (lib/api/action-result.ts): its own zod failures become
    // fieldErrors, a thrown BackendApiError becomes a failure carrying its code, and a redirect
    // keeps propagating. runServerAction has its own test.
    runServerAction.mockImplementation(
      async (schema: z.ZodType, formData: FormData, run: (input: unknown) => Promise<unknown>) => {
        const parsed = schema.safeParse(Object.fromEntries(formData));
        if (!parsed.success) {
          return {
            ok: false,
            formError: 'Check the highlighted fields and try again.',
            fieldErrors: Object.fromEntries(
              parsed.error.issues.map((issue) => [issue.path.map(String).join('.'), issue.message]),
            ),
            code: 'validation_failed',
            requestId: null,
          };
        }
        try {
          await run(parsed.data);
        } catch (error) {
          if (!(error instanceof BackendApiError)) throw error;
          return {
            ok: false,
            formError: 'generic',
            fieldErrors: {},
            code: error.code,
            requestId: error.requestId,
          };
        }
        return { ok: true };
      },
    );
  });

  it('creates a draft from an explicit snake_case body and redirects to the record', async () => {
    apiPost.mockResolvedValueOnce({ organisation_id: TENANT, status: 'DRAFT' });

    await expect(
      actions.createTenantDraft(
        null,
        form({
          ...FIELDS,
          idempotencyKey: KEY,
          businessDate: '2026-10-05',
          auditRetentionDays: '365',
        }),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/platform-admin/tenants/${TENANT}`);
    expect(tenantCodeTaken).toHaveBeenCalledWith('tujenge-traders');
    expect(apiPost).toHaveBeenCalledWith(
      '/api/v1/platform/tenants',
      {
        ...INSTITUTION,
        initial_settings: { audit_retention_days: '365' },
        business_date: '05-10-2026',
      },
      KEY,
    );
  });

  it('refuses a taken tenant code before the create call, on the code field (BG-07)', async () => {
    tenantCodeTaken.mockResolvedValueOnce(true);

    const result = await actions.createTenantDraft(null, form({ ...FIELDS, idempotencyKey: KEY }));

    expect(result).toMatchObject({
      ok: false,
      code: 'tenant_code_taken',
      formError: 'This tenant code is already in use. Choose another.',
      fieldErrors: { tenantCode: 'This code is already in use.' },
    });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('names the currency and value 422s without echoing the backend', async () => {
    apiPost.mockRejectedValueOnce(
      new BackendApiError(422, { code: 'accounting.currency_invalid', requestId: 'req-2' }),
    );
    expect(
      await actions.createTenantDraft(null, form({ ...FIELDS, idempotencyKey: KEY })),
    ).toMatchObject({
      code: 'accounting.currency_invalid',
      requestId: 'req-2',
      fieldErrors: { baseCurrencyCode: "The platform can't settle in this currency." },
    });

    apiPost.mockRejectedValueOnce(new BackendApiError(422, { code: 'invalid_operation' }));
    expect(
      await actions.createTenantDraft(null, form({ ...FIELDS, idempotencyKey: KEY })),
    ).toMatchObject({
      formError: 'The platform refused a value. Check the timezone and the initial settings.',
    });
  });

  it('validates on the server too: a bad phone never reaches the pre-check or the backend', async () => {
    const result = await actions.createTenantDraft(
      null,
      form({ ...FIELDS, idempotencyKey: KEY, adminPhone: '0712000140' }),
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { adminPhone: 'Use the international format, e.g. +254712000140.' },
    });
    expect(tenantCodeTaken).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('amends with a PATCH that replaces the institution and administrator, and nothing else', async () => {
    await expect(
      actions.amendTenantDraft(
        null,
        form({
          ...FIELDS,
          idempotencyKey: KEY,
          tenantId: TENANT,
          legalName: 'Tujenge Traders Co-operative Society Ltd',
          auditRetentionDays: '365',
        }),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/platform-admin/tenants/${TENANT}`);
    expect(apiPatch).toHaveBeenCalledWith(
      `/api/v1/platform/tenants/${TENANT}`,
      { ...INSTITUTION, legal_name: 'Tujenge Traders Co-operative Society Ltd' },
      KEY,
    );
    expect(tenantCodeTaken).not.toHaveBeenCalled();

    runServerAction.mockResolvedValueOnce(failure('conflict'));
    expect(await actions.amendTenantDraft(null, form({}))).toMatchObject({
      code: 'conflict',
      formError:
        'Only a draft can be amended. It may already have been submitted. Refresh and check.',
    });
  });

  it.each([
    ['submitTenant', 'submit'],
    ['approveTenant', 'approve'],
    ['retryTenantBootstrap', 'bootstrap/retry'],
  ] as const)('%s posts an empty body to …/%s, never a reason', async (name, path) => {
    await actions[name](null, form({ idempotencyKey: KEY, tenantId: TENANT, reason: 'ignored' }));
    expect(apiPost).toHaveBeenCalledWith(`/api/v1/platform/tenants/${TENANT}/${path}`, {}, KEY);
  });

  it('explains an approve 403 as permission or maker-checker (BG-08)', async () => {
    runServerAction.mockResolvedValueOnce(failure('forbidden'));
    expect(await actions.approveTenant(null, form({}))).toMatchObject({
      code: 'forbidden',
      requestId: 'req-1',
      formError: expect.stringContaining(
        'a different platform administrator must approve it',
      ) as unknown,
    });
  });

  it.each([
    ['submitTenant', "This draft couldn't be submitted."],
    ['rejectTenant', "This request can't be rejected any more."],
    ['reactivateTenant', "This institution couldn't be reactivated."],
    ['retryTenantBootstrap', "The bootstrap isn't in a failed state any more."],
  ] as const)('names the %s 409 and hedges it', async (name, message) => {
    runServerAction.mockResolvedValueOnce(failure('conflict'));
    expect(await actions[name](null, form({}))).toMatchObject({
      code: 'conflict',
      formError: expect.stringContaining(message) as unknown,
    });
  });

  it.each(['rejectTenant', 'suspendTenant'] as const)(
    '%s requires a reason of 3–500 characters before calling the backend',
    async (name) => {
      expect(
        await actions[name](null, form({ idempotencyKey: KEY, tenantId: TENANT, reason: 'ab' })),
      ).toMatchObject({
        ok: false,
        fieldErrors: { reason: 'Give a reason of at least 3 characters.' },
      });
      expect(apiPost).not.toHaveBeenCalled();

      await actions[name](
        null,
        form({ idempotencyKey: KEY, tenantId: TENANT, reason: ' Compliance review ' }),
      );
      expect(apiPost).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`/tenants/${TENANT}/(reject|suspend)$`)),
        { reason: 'Compliance review' },
        KEY,
      );
    },
  );

  it('reactivates with {} or {reason}', async () => {
    await actions.reactivateTenant(
      null,
      form({ idempotencyKey: KEY, tenantId: TENANT, reason: ' ' }),
    );
    expect(apiPost).toHaveBeenLastCalledWith(
      `/api/v1/platform/tenants/${TENANT}/reactivate`,
      {},
      KEY,
    );
    await actions.reactivateTenant(
      null,
      form({ idempotencyKey: KEY, tenantId: TENANT, reason: 'Review closed' }),
    );
    expect(apiPost).toHaveBeenLastCalledWith(
      `/api/v1/platform/tenants/${TENANT}/reactivate`,
      { reason: 'Review closed' },
      KEY,
    );
  });

  it('deprovisions only when the typed code matches the tenant code (CRITICAL)', async () => {
    const base = {
      idempotencyKey: KEY,
      tenantId: TENANT,
      tenantCode: 'kilimo-bora',
      reason: 'Merged into Harambee',
    };
    expect(
      await actions.deprovisionTenant(null, form({ ...base, confirmCode: 'kilimo' })),
    ).toMatchObject({
      ok: false,
      fieldErrors: { confirmCode: 'Type the tenant code exactly as shown.' },
    });
    expect(apiPost).not.toHaveBeenCalled();

    await actions.deprovisionTenant(null, form({ ...base, confirmCode: ' kilimo-bora ' }));
    expect(apiPost).toHaveBeenCalledWith(
      `/api/v1/platform/tenants/${TENANT}/deprovision`,
      { reason: 'Merged into Harambee' },
      KEY,
    );
  });
});
```

- [ ] **Step 2: Run them**

Run (form T) on `modules/platform-administration/tenants/tenant-service.test.ts
modules/platform-administration/tenants/tenant-actions.test.ts`. Expected: FAIL (modules missing).

- [ ] **Step 3: Implement `tenant-service.ts`**

```ts
import 'server-only';
import { cache } from 'react';
import { toQueryString } from '@/lib/api/query-string';
import { apiGet } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import { tenantDetailSchema, tenantPageSchema } from './tenant-contract';
import { tenantListApiPath, type TenantListQuery } from './tenant-query';

export function listTenants(query: TenantListQuery) {
  return apiGet(tenantListApiPath(query), tenantPageSchema);
}

/** One read per request: the record layout (hero) and its tabs share it. `async`, so a malformed id
 * rejects (a `load()` failure) instead of throwing synchronously past `load()`. */
export const getTenant = cache(async (tenantId: string) => {
  const id = uuidSchema.parse(tenantId);
  return await apiGet(`/api/v1/platform/tenants/${id}`, tenantDetailSchema);
});

/**
 * BG-07: a duplicate `tenant_code` fails with a 500, so create checks first. `q` is a
 * case-insensitive substring match on code or name (contract §A; codes hold no `%` or `_`), so the
 * codes are compared exactly here, ignoring case. ponytail: one page of 100 matches — a code buried
 * deeper still reaches the 500.
 */
export async function tenantCodeTaken(code: string): Promise<boolean> {
  const matches = await apiGet(
    `/api/v1/platform/tenants${toQueryString({ q: code, page: 0, size: 100 })}`,
    tenantPageSchema,
  );
  const wanted = code.toLowerCase();
  return matches.items.some((tenant) => tenant.tenantCode.toLowerCase() === wanted);
}
```

- [ ] **Step 4: Implement `tenant-actions.ts`**

```ts
'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { apiPatch, apiPost } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import { isoToBusinessDate } from '@/lib/business-date';
import { tenantDraftResultSchema } from './tenant-contract';
import {
  initialSettings,
  tenantAmendSchema,
  tenantDraftBody,
  tenantDraftSchema,
} from './tenant-rules';
import { tenantCodeTaken } from './tenant-service';

const BASE = '/api/v1/platform/tenants';
const idempotencyKey = z.uuid();
/** A frontend-only problem code for create's pre-check (BG-07: the backend's answer is a 500). */
const TENANT_CODE_TAKEN = 'tenant_code_taken';

// No `|| null` transform: `reasoned()` tests the value, and a trimmed '' is falsy, so a blank
// optional reason still sends `{}`.
const optionalReason = z
  .string()
  .trim()
  .max(500, 'Keep the reason under 500 characters.')
  .optional();

const requiredReason = z
  .string()
  .trim()
  .min(3, 'Give a reason of at least 3 characters.')
  .max(500, 'Keep the reason under 500 characters.');

/** Swaps the generic status message for one that names the guard behind a known code (spec §6.7),
 * never the backend's text. */
function explain(
  result: ActionResult,
  code: string,
  formError: string,
  fieldErrors: Partial<Record<string, string>> = {},
): ActionResult {
  if (result.ok || result.code !== code) return result;
  return { ...result, formError, fieldErrors: { ...result.fieldErrors, ...fieldErrors } };
}

/** Create and amend share these causes (contract §D, §I). Each 422 names its likely field and
 * hedges: the currency check also covers the base currency setting, the value check the settings. */
function explainDraft(result: ActionResult): ActionResult {
  const taken = explain(
    result,
    TENANT_CODE_TAKEN,
    'This tenant code is already in use. Choose another.',
    { tenantCode: 'This code is already in use.' },
  );
  const currency = explain(
    taken,
    'accounting.currency_invalid',
    "The platform can't settle in this currency. Choose another base currency, or clear the base currency setting.",
    { baseCurrencyCode: "The platform can't settle in this currency." },
  );
  return explain(
    currency,
    'invalid_operation',
    'The platform refused a value. Check the timezone and the initial settings.',
  );
}

export async function createTenantDraft(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(
    tenantDraftSchema.extend({ idempotencyKey }),
    formData,
    async (input) => {
      if (await tenantCodeTaken(input.tenantCode)) {
        // A frontend-detected condition travels as a typed problem, so runServerAction maps it like
        // any other (precedent: tenant-api.ts's synthesized 403 for a missing context token).
        throw new BackendApiError(409, { code: TENANT_CODE_TAKEN });
      }
      const draft = tenantDraftResultSchema.parse(
        await apiPost(
          BASE,
          {
            ...tenantDraftBody(input),
            initial_settings: initialSettings(input),
            business_date: isoToBusinessDate(input.businessDate),
          },
          input.idempotencyKey,
        ),
      );
      // Rethrown by runServerAction (unstable_rethrow): the client navigates to the new record.
      redirect(`/platform-admin/tenants/${draft.tenantId}`);
    },
  );
  return explainDraft(result);
}

export async function amendTenantDraft(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(
    tenantAmendSchema.extend({ idempotencyKey, tenantId: uuidSchema }),
    formData,
    async (input) => {
      // A full replacement (contract §D). Settings and the business date are ignored, so not sent.
      await apiPatch(`${BASE}/${input.tenantId}`, tenantDraftBody(input), input.idempotencyKey);
      redirect(`/platform-admin/tenants/${input.tenantId}`);
    },
  );
  return explain(
    explainDraft(result),
    'conflict',
    'Only a draft can be amended. It may already have been submitted. Refresh and check.',
  );
}

const tenantInput = z.object({ idempotencyKey, tenantId: uuidSchema });

/** Submit, approve and bootstrap retry take no body (contract §E.2). `apiPost` always sends JSON,
 * so the body is `{}`, which the backend never reads; a reason is never forwarded. */
function command(path: string, formData: FormData): Promise<ActionResult> {
  return runServerAction(tenantInput, formData, (input) =>
    apiPost(`${BASE}/${input.tenantId}/${path}`, {}, input.idempotencyKey),
  );
}

const optionalReasonInput = tenantInput.extend({ reason: optionalReason });
const requiredReasonInput = tenantInput.extend({ reason: requiredReason });
// CRITICAL (spec §11.2): the tenant code typed back. A UX guard; the permission is the gate.
const deprovisionInput = requiredReasonInput
  .extend({ tenantCode: z.string(), confirmCode: z.string().trim() })
  .refine((input) => input.confirmCode === input.tenantCode, {
    path: ['confirmCode'],
    error: 'Type the tenant code exactly as shown.',
  });

/** The body is `{}` when there's no reason (contract §D). */
function reasoned(
  path: string,
  schema: typeof optionalReasonInput | typeof requiredReasonInput | typeof deprovisionInput,
  formData: FormData,
): Promise<ActionResult> {
  return runServerAction(schema, formData, (input) =>
    apiPost(
      `${BASE}/${input.tenantId}/${path}`,
      input.reason ? { reason: input.reason } : {},
      input.idempotencyKey,
    ),
  );
}

export async function submitTenant(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // 409 = missing metadata OR a race (contract §I): never assert which.
  return explain(
    await command('submit', formData),
    'conflict',
    "This draft couldn't be submitted. A required detail may be missing, or it changed. Amend it, or refresh and check.",
  );
}

export async function approveTenant(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // BG-08: a maker-checker refusal is the same 403 as a missing permission.
  return explain(
    await command('approve', formData),
    'forbidden',
    "You can't approve this institution. Your role may not allow it, or you created or submitted the request: a different platform administrator must approve it.",
  );
}

export async function rejectTenant(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explain(
    await reasoned('reject', requiredReasonInput, formData),
    'conflict',
    "This request can't be rejected any more. It may already have been decided. Refresh and check.",
  );
}

export async function suspendTenant(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return reasoned('suspend', requiredReasonInput, formData);
}

export async function reactivateTenant(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // 409 = incomplete setup (requireCompleteSetup) OR a race: hedged.
  return explain(
    await reasoned('reactivate', optionalReasonInput, formData),
    'conflict',
    "This institution couldn't be reactivated. Its setup may be incomplete, or it changed. Refresh and check.",
  );
}

export async function deprovisionTenant(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return reasoned('deprovision', deprovisionInput, formData);
}

export async function retryTenantBootstrap(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explain(
    await command('bootstrap/retry', formData),
    'conflict',
    "The bootstrap isn't in a failed state any more. Refresh and check.",
  );
}
```

`'use server'` modules may export only async functions: every constant and helper above stays
unexported.

- [ ] **Step 5: Run them again**

Run (form T) on the two test files. Expected: PASS.

- [ ] **Step 6: Commit** (form C)

`git add modules/platform-administration/tenants/tenant-service.ts modules/platform-administration/tenants/tenant-service.test.ts modules/platform-administration/tenants/tenant-actions.ts modules/platform-administration/tenants/tenant-actions.test.ts`

```
feat(platform): add the tenant service and lifecycle Server Actions

Create checks the tenant code before the POST, because a duplicate is a backend 500 (BG-07).
Amend is a full replacement. Submit, approve and bootstrap retry send no reason. Reject, suspend
and deprovision require one, and deprovision also needs the tenant code typed back. Known 403, 409
and 422 causes get named, hedged messages.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 3: Fake API tenant lifecycle routes and the `platform-tenants` scenario

**Files:**

- Modify: `e2e/fake-api/state.mts` (two optional `FakeOrganisation` fields)
- Modify (full replacement): `e2e/fake-api/routes/platform-tenants.mts`
- Modify: `e2e/fake-api/scenarios.mts` (seed IDs, the builder, one `BUILDERS` entry)
- Create: `e2e/fake-api-platform-tenants.spec.ts`

`e2e/fake-api/server.mts` already registers `platformTenantRoutes`, so its route list doesn't change.

**Interfaces:**

- Consumes (`e2e/fake-api/`):
  - `requireContext(context): AccessContext`, `requirePlatformContext(access): void`,
    `requirePermission(access, code, scope = 'tenant'): void`, `type AccessContext`
    (`access.mts`; `access.claims.userId` is the caller);
  - `objectBody(body, allowedKeys): Record<string, unknown>`,
    `stringField(body, key, { required }): string | null`, `readBody(req): Promise<unknown>`,
    `problem(status, code, detail, violations?)`, `sendJson(res, status, body)`,
    `pageOf(items, query)`, `parseInstantParam(query, name)`, `type Violation` (`http.mts`);
  - `sendIdempotent(context, body, produce, status = 200): void` (`idempotency.mts`);
  - `route(method, path, handler)`, `type Route`, `type RouteContext` (`router.mts`);
  - `organisation(id, code, displayName, overrides)`, `platformOperator()`, `IDS`,
    `type RunState` (`scenarios.mts`).
- Produces (consumed by Task 8, and by 17):
  - scenario `'platform-tenants'` and `TENANT_SCENARIO_IDS` (`umoja`, `harambee`, `mwangaza`, `pwani`,
    `kilimo`, `nairobiMetro`, `otherOperator`);
  - `FakeOrganisation.createdBy?: string` and `submittedBy?: string`;
  - the routes `POST /api/v1/platform/tenants`, `PATCH /api/v1/platform/tenants/:tenant_id`, and
    `POST /api/v1/platform/tenants/:tenant_id/{submit, approve, reject, suspend, reactivate,
deprovision, bootstrap/retry}`.

- [ ] **Step 1: Write the failing smoke spec**

`e2e/fake-api-platform-tenants.spec.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { IDS, TENANT_SCENARIO_IDS } from './fake-api/scenarios.mts';

const FAKE_API_URL = `http://127.0.0.1:${process.env.FAKE_API_PORT ?? '3199'}`;
const api = (path: string) => `${FAKE_API_URL}/api/v1${path}`;

/** A fresh run of `scenario`, with a context token for `organisationId`. */
async function signIn(request: APIRequestContext, scenario: string, organisationId: string) {
  const authorization = { Authorization: `Bearer e2e.${scenario}.${randomUUID()}` };
  const selection = await request.post(api('/auth/select-organisation'), {
    headers: authorization,
    data: { organisation_id: organisationId },
  });
  const { context_token: contextToken } = (await selection.json()) as { context_token: string };
  return { ...authorization, 'X-Active-Organisation-Context': contextToken };
}

const ADMIN = {
  email: 'amina@tujenge.example',
  username: 'amina.otieno',
  display_name: 'Amina Otieno',
  phone_e164: '+254712000140',
  send_application_invite: false,
};
const DRAFT = {
  tenant_code: 'tujenge-traders',
  display_name: 'Tujenge Traders SACCO',
  legal_name: 'Tujenge Traders Co-operative Society Ltd',
  registration_number: null,
  country_code: 'KE',
  base_currency_code: 'KES',
  timezone: 'Africa/Nairobi',
  admin: ADMIN,
  initial_settings: { audit_retention_days: '365' },
  business_date: null,
};

test.describe('fake API platform tenants (contract §E.2, layer 16)', () => {
  test('creates a draft from a snake_case body, and refuses camelCase, a missing phone and a taken code', async ({
    request,
  }) => {
    const headers = await signIn(request, 'platform-tenants', IDS.platformOrganisation);

    const created = await request.post(api('/platform/tenants'), { headers, data: DRAFT });
    expect(created.status()).toBe(201);
    const { organisation_id: id } = (await created.json()) as { organisation_id: string };
    const detail = (await (
      await request.get(api(`/platform/tenants/${id}`), { headers })
    ).json()) as Record<string, unknown>;
    expect(detail).toMatchObject({
      tenant_code: 'tujenge-traders',
      status: 'DRAFT',
      bootstrap_status: 'DRAFT',
    });
    // Write-only (BG-14): never returned.
    expect(Object.keys(detail)).not.toContain('legal_name');

    const camel = await request.post(api('/platform/tenants'), {
      headers,
      data: { tenantCode: 'camel-case' },
    });
    expect(camel.status()).toBe(400);
    expect(await camel.json()).toMatchObject({ code: 'invalid_json' });

    const noPhone = await request.post(api('/platform/tenants'), {
      headers,
      data: { ...DRAFT, tenant_code: 'no-phone', admin: { ...ADMIN, phone_e164: null } },
    });
    expect(noPhone.status()).toBe(400);
    expect(await noPhone.json()).toMatchObject({
      code: 'validation_failed',
      violations: [{ field: 'admin.phone_e164', code: 'NotBlank' }],
    });

    // BG-07: the backend answers a taken code with a 500, so the app checks first.
    const taken = await request.post(api('/platform/tenants'), {
      headers,
      data: { ...DRAFT, tenant_code: 'acme' },
    });
    expect(taken.status()).toBe(500);
  });

  test('refuses the approval to its maker and to its submitter, and approves a request another operator submitted with a replayable 202', async ({
    request,
  }) => {
    const headers = await signIn(request, 'platform-tenants', IDS.platformOrganisation);
    const umoja = `/platform/tenants/${TENANT_SCENARIO_IDS.umoja}`;

    const submitted = await request.post(api(`${umoja}/submit`), { headers, data: {} });
    expect(await submitted.json()).toMatchObject({
      status: 'PENDING_APPROVAL',
      bootstrap_status: 'PENDING_ACTIVATION',
    });
    // Jane drafted and submitted Umoja, so she can't approve it (maker-checker; the same 403 as a
    // missing permission, BG-08).
    const own = await request.post(api(`${umoja}/approve`), { headers, data: {} });
    expect(own.status()).toBe(403);
    expect(await own.json()).toMatchObject({ code: 'forbidden' });
    // Another operator drafted Mwangaza, but Jane submitted it: the submitter alone is refused too.
    const submittedOnly = await request.post(
      api(`/platform/tenants/${TENANT_SCENARIO_IDS.mwangaza}/approve`),
      { headers, data: {} },
    );
    expect(submittedOnly.status()).toBe(403);
    expect(await submittedOnly.json()).toMatchObject({ code: 'forbidden' });

    const once = { ...headers, 'Idempotency-Key': randomUUID() };
    const harambee = api(`/platform/tenants/${TENANT_SCENARIO_IDS.harambee}/approve`);
    const approved = await request.post(harambee, { headers: once, data: {} });
    expect(approved.status()).toBe(202);
    expect(await approved.json()).toMatchObject({ status: 'ACTIVE', bootstrap_status: 'QUEUED' });
    // The same key replays the stored 202 instead of failing a second transition (index item 2).
    const replay = await request.post(harambee, { headers: once, data: {} });
    expect(replay.status()).toBe(202);
    expect(replay.headers()['idempotency-replayed']).toBe('true');
  });

  test('requires reasons, guards transitions, amends only a draft, and retries only a failed bootstrap', async ({
    request,
  }) => {
    const headers = await signIn(request, 'platform-tenants', IDS.platformOrganisation);
    const acme = `/platform/tenants/${IDS.acme}`;

    const short = await request.post(api(`${acme}/suspend`), { headers, data: { reason: 'ab' } });
    expect(short.status()).toBe(400);
    expect(await short.json()).toMatchObject({
      code: 'validation_failed',
      violations: [{ field: 'reason' }],
    });
    const notPending = await request.post(api(`${acme}/reject`), {
      headers,
      data: { reason: 'Not pending' },
    });
    expect(notPending.status()).toBe(409);
    // BG-07: an unknown tenant on reject is a 500, not a 404.
    const unknown = await request.post(api(`/platform/tenants/${randomUUID()}/reject`), {
      headers,
      data: { reason: 'Unknown tenant' },
    });
    expect(unknown.status()).toBe(500);

    const notDraft = await request.patch(api(acme), {
      headers,
      data: { ...DRAFT, tenant_code: 'acme' },
    });
    expect(notDraft.status()).toBe(409);
    const amended = await request.patch(api(`/platform/tenants/${TENANT_SCENARIO_IDS.umoja}`), {
      headers,
      data: {
        ...DRAFT,
        tenant_code: 'umoja-teachers',
        display_name: 'Umoja Teachers Co-operative SACCO',
      },
    });
    expect(await amended.json()).toMatchObject({
      tenant_code: 'umoja-teachers',
      display_name: 'Umoja Teachers Co-operative SACCO',
      status: 'DRAFT',
    });

    const notFailed = await request.post(api(`${acme}/bootstrap/retry`), { headers, data: {} });
    expect(notFailed.status()).toBe(409);
    const retried = await request.post(
      api(`/platform/tenants/${TENANT_SCENARIO_IDS.pwani}/bootstrap/retry`),
      { headers, data: {} },
    );
    expect(retried.status()).toBe(202);
    expect(await retried.json()).toMatchObject({
      bootstrap_status: 'PROVISIONING_IDENTITY',
      bootstrap_failure_code: null,
    });
  });

  test('needs the platform context and the tenant permissions', async ({ request }) => {
    const tenantHeaders = await signIn(request, 'default', IDS.greenfield);
    const wrongContext = await request.post(api('/platform/tenants'), {
      headers: tenantHeaders,
      data: DRAFT,
    });
    expect(wrongContext.status()).toBe(403);
    expect(await wrongContext.json()).toMatchObject({
      code: 'Reserved platform organisation context is required for this route.',
    });

    // `platform-operator` holds tenant.view only: the read-only gating scenario.
    const readOnly = await signIn(request, 'platform-operator', IDS.platformOrganisation);
    const refused = await request.post(api(`/platform/tenants/${IDS.acme}/suspend`), {
      headers: readOnly,
      data: { reason: 'Compliance review' },
    });
    expect(refused.status()).toBe(403);
    expect(await refused.json()).toMatchObject({ code: 'forbidden' });
  });
});
```

- [ ] **Step 2: Run it**

Run (form E) on `e2e/fake-api-platform-tenants.spec.ts`. Expected: FAIL. The `platform-tenants`
scenario doesn't exist yet, so the bearer token is a 401, and `TENANT_SCENARIO_IDS` doesn't resolve.

- [ ] **Step 3: Add the maker-checker fields to `e2e/fake-api/state.mts`**

In `interface FakeOrganisation`, after `updatedAt: string;`, add:

```ts
  /** Maker-checker only (approve ≠ creator and submitter, contract §E.2); the real API keeps both
   * on its bootstrap record. */
  createdBy?: string;
  submittedBy?: string;
```

- [ ] **Step 4: Replace `e2e/fake-api/routes/platform-tenants.mts`**

The two GET routes keep their behaviour: they now share `platformAccess` and `findTenant`.

```ts
import { randomUUID } from 'node:crypto';
import { requireContext, requirePermission, requirePlatformContext } from '../access.mts';
import type { AccessContext } from '../access.mts';
import {
  objectBody,
  pageOf,
  parseInstantParam,
  problem,
  readBody,
  sendJson,
  stringField,
} from '../http.mts';
import type { Violation } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { route } from '../router.mts';
import type { Route, RouteContext } from '../router.mts';
import type { FakeOrganisation } from '../state.mts';

const SORTS: Record<string, (tenant: FakeOrganisation) => string> = {
  tenantCode: (tenant) => tenant.code,
  displayName: (tenant) => tenant.displayName,
  countryCode: (tenant) => tenant.countryCode,
  createdAt: (tenant) => tenant.createdAt,
};

/** Contract §D: CreateTenantDraft, whose shape AmendTenantDraft repeats. */
const DRAFT_KEYS = [
  'tenant_code',
  'display_name',
  'legal_name',
  'registration_number',
  'country_code',
  'base_currency_code',
  'timezone',
  'admin',
  'initial_settings',
  'business_date',
];
/** Contract §D: InitialAdmin. */
const ADMIN_KEYS = ['email', 'username', 'display_name', 'phone_e164', 'send_application_invite'];
/** Contract §H: initial settings take catalogue keys only. */
const CATALOGUE_KEYS = [
  'default_timezone',
  'base_currency',
  'require_maker_checker_for_user_invites',
  'require_maker_checker_for_branch_creation',
  'business_date_auto_advance_enabled',
  'audit_retention_days',
];
const TENANT_CODE = /^[a-z0-9-]{3,32}$/;
const USERNAME = /^[a-zA-Z0-9._-]{3,50}$/;
const E164 = /^\+[1-9]\d{1,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BUSINESS_DATE = /^\d{2}-\d{2}-\d{4}$/;

const invalidJson = () => problem(400, 'invalid_json', 'Malformed request body.');
const invalidOperation = () => problem(422, 'invalid_operation', 'The operation is not valid.');
// BG-07: a duplicate tenant code, an unknown sort, and an unknown tenant on reject or suspend all
// surface as a 500.
const internalError = () => problem(500, 'internal_error', 'An unexpected error occurred.');
const tenantNotFound = () => problem(404, 'resource_not_found', 'Tenant not found.');

/** Mirrors FoundationQueryService.validateSort: unknown sort → 500 internal_error. */
function sortTenants(tenants: FakeOrganisation[], query: URLSearchParams): FakeOrganisation[] {
  const sortBy = query.get('sort_by') ?? 'createdAt';
  const direction = (query.get('sort_dir') ?? 'DESC').toUpperCase();
  const key = SORTS[sortBy];
  if (!key || (direction !== 'ASC' && direction !== 'DESC')) {
    throw internalError();
  }
  const sorted = [...tenants].sort((a, b) => key(a).localeCompare(key(b)));
  return direction === 'DESC' ? sorted.reverse() : sorted;
}

function summary(tenant: FakeOrganisation) {
  return {
    id: tenant.id,
    tenant_code: tenant.code,
    display_name: tenant.displayName,
    country_code: tenant.countryCode,
    status: tenant.status,
    created_at: tenant.createdAt,
  };
}

function detail(tenant: FakeOrganisation) {
  return {
    ...summary(tenant),
    base_currency_code: tenant.baseCurrencyCode,
    timezone: tenant.timezone,
    bootstrap_status: tenant.bootstrapStatus,
    bootstrap_failure_code: tenant.bootstrapFailureCode,
    updated_at: tenant.updatedAt,
  };
}

function platformAccess(context: RouteContext): AccessContext {
  const access = requireContext(context);
  requirePlatformContext(access);
  return access;
}

function findTenant(context: RouteContext): FakeOrganisation {
  const tenant = context.state.organisations.find(
    (candidate) => candidate.id === context.params.tenant_id,
  );
  if (!tenant) throw tenantNotFound();
  return tenant;
}

function isZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function checkInitialSettings(value: unknown): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'object' || Array.isArray(value)) throw invalidJson();
  for (const [key, setting] of Object.entries(value as Record<string, unknown>)) {
    if (typeof setting !== 'string') throw invalidJson();
    // Catalogue keys only, with typed values (contract §D, §H): anything else is a 422.
    if (!CATALOGUE_KEYS.includes(key)) throw invalidOperation();
    if (key === 'audit_retention_days' && !/^\d+$/.test(setting)) throw invalidOperation();
  }
}

function checkBusinessDate(value: unknown): void {
  if (value === undefined || value === null) return;
  // Strict dd-MM-yyyy (contract §A); anything else fails to bind.
  if (typeof value !== 'string' || !BUSINESS_DATE.test(value)) throw invalidJson();
}

interface DraftFields {
  code: string;
  displayName: string;
  countryCode: string;
  baseCurrencyCode: string;
  timezone: string;
}

/**
 * Mirrors the draft DTOs' bean validation (contract §D): an absent non-null field is `invalid_json`;
 * a blank or malformed value, and the admin's phone (typed nullable but `@NotBlank`), is a
 * `validation_failed` violation. The service's 422s come next: an unknown ZoneId, an unsettleable
 * currency and, on create only, a non-catalogue or mistyped initial setting (amend ignores
 * `initial_settings` and `business_date`).
 */
function draftFields(body: Record<string, unknown>, options: { amend: boolean }): DraftFields {
  const admin = objectBody(body.admin, ADMIN_KEYS);
  const code = stringField(body, 'tenant_code', { required: true }) ?? '';
  const displayName = stringField(body, 'display_name', { required: true }) ?? '';
  const legalName = stringField(body, 'legal_name', { required: false }) ?? '';
  const registration = stringField(body, 'registration_number', { required: false }) ?? '';
  const countryCode = stringField(body, 'country_code', { required: true }) ?? '';
  const baseCurrencyCode = stringField(body, 'base_currency_code', { required: true }) ?? '';
  const timezone = stringField(body, 'timezone', { required: true }) ?? '';
  const email = stringField(admin, 'email', { required: true }) ?? '';
  const username = stringField(admin, 'username', { required: true }) ?? '';
  const adminName = stringField(admin, 'display_name', { required: true }) ?? '';
  const phone = stringField(admin, 'phone_e164', { required: false });
  const invite = admin.send_application_invite;
  if (invite !== undefined && typeof invite !== 'boolean') throw invalidJson();

  const violations: Violation[] = [];
  const check = (valid: boolean, field: string, rule: string, message: string) => {
    if (!valid) violations.push({ field, code: rule, message });
  };
  check(
    TENANT_CODE.test(code),
    'tenant_code',
    'Pattern',
    'Tenant code must be 3-32 lowercase alphanumeric characters or hyphens.',
  );
  check(
    displayName.trim().length >= 2 && displayName.length <= 100,
    'display_name',
    'Size',
    'size must be between 2 and 100',
  );
  check(legalName.length <= 100, 'legal_name', 'Size', 'size must be between 0 and 100');
  check(registration.length <= 50, 'registration_number', 'Size', 'size must be between 0 and 50');
  check(
    /^[A-Z]{2}$/.test(countryCode),
    'country_code',
    'Pattern',
    'Country code must be 2 uppercase ISO letters.',
  );
  check(
    /^[A-Z]{3}$/.test(baseCurrencyCode),
    'base_currency_code',
    'Pattern',
    'Currency code must be 3 uppercase ISO letters.',
  );
  check(timezone.trim().length > 0, 'timezone', 'NotBlank', 'must not be blank');
  check(EMAIL.test(email), 'admin.email', 'Email', 'must be a well-formed email address');
  check(
    USERNAME.test(username),
    'admin.username',
    'Pattern',
    'must match "^[a-zA-Z0-9._-]{3,50}$"',
  );
  check(
    adminName.trim().length >= 2 && adminName.length <= 100,
    'admin.display_name',
    'Size',
    'size must be between 2 and 100',
  );
  check(
    phone !== null && E164.test(phone),
    'admin.phone_e164',
    phone === null ? 'NotBlank' : 'Pattern',
    phone === null ? 'must not be blank' : 'Phone must be in E.164 format.',
  );
  if (violations.length > 0) {
    throw problem(400, 'validation_failed', 'Validation failed.', violations);
  }
  if (!isZone(timezone)) throw invalidOperation();
  const currencies = Intl.supportedValuesOf('currency');
  if (baseCurrencyCode === 'XXX' || !currencies.includes(baseCurrencyCode)) {
    throw problem(422, 'accounting.currency_invalid', 'The currency is not valid.');
  }
  if (!options.amend) {
    checkInitialSettings(body.initial_settings);
    checkBusinessDate(body.business_date);
  }
  return { code, displayName, countryCode, baseCurrencyCode, timezone };
}

interface TransitionOptions {
  /** `none`: the endpoint has no body, and never reads one (contract §E.2). */
  reason: 'none' | 'optional' | 'required';
  status?: number;
  /** BG-07: reject and suspend answer an unknown tenant with a 500, not a 404. */
  unknownIs500?: boolean;
}

function transition(
  path: string,
  permission: string,
  allowed: (tenant: FakeOrganisation) => boolean,
  apply: (tenant: FakeOrganisation, access: AccessContext) => void,
  options: TransitionOptions,
): Route {
  return route('POST', `/api/v1/platform/tenants/:tenant_id/${path}`, async (context) => {
    const access = platformAccess(context);
    requirePermission(access, permission);
    requirePermission(access, 'tenant.view'); // read-back (BG-31)
    const tenant = context.state.organisations.find(
      (candidate) => candidate.id === context.params.tenant_id,
    );
    if (!tenant) {
      throw options.unknownIs500 ? internalError() : tenantNotFound();
    }
    let body: Record<string, unknown> = {};
    if (options.reason !== 'none') {
      const raw = await readBody(context.req);
      if (raw !== undefined || options.reason === 'required') body = objectBody(raw, ['reason']);
    }
    const reason = stringField(body, 'reason', { required: options.reason === 'required' });
    if (
      options.reason === 'required' &&
      (reason === null || reason.trim().length < 3 || reason.length > 500)
    ) {
      throw problem(400, 'validation_failed', 'Validation failed.', [
        { field: 'reason', code: 'Size', message: 'size must be between 3 and 500' },
      ]);
    }
    sendIdempotent(
      context,
      body,
      () => {
        if (!allowed(tenant)) {
          throw problem(409, 'conflict', `This transition isn't allowed from ${tenant.status}.`);
        }
        apply(tenant, access);
        tenant.updatedAt = new Date().toISOString();
        // ponytail: no audit row — platform actions land in the tenant's log, which nothing in the
        // platform workspace reads (BG-06). Add one when a platform audit view exists.
        return detail(tenant);
      },
      options.status,
    );
  });
}

export const platformTenantRoutes: Route[] = [
  route('GET', '/api/v1/platform/tenants', (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'tenant.view');
    const { query } = context;
    const q = query.get('q')?.toLowerCase();
    const status = query.get('status');
    const country = query.get('country');
    const createdFrom = parseInstantParam(query, 'created_from');
    const createdTo = parseInstantParam(query, 'created_to');
    const tenants = context.state.organisations.filter(
      (tenant) =>
        (!q ||
          tenant.code.toLowerCase().includes(q) ||
          tenant.displayName.toLowerCase().includes(q)) &&
        (!status || tenant.status === status) &&
        (!country || tenant.countryCode === country) &&
        (createdFrom === undefined || Date.parse(tenant.createdAt) >= createdFrom) &&
        (createdTo === undefined || Date.parse(tenant.createdAt) <= createdTo),
    );
    sendJson(context.res, 200, pageOf(sortTenants(tenants, query).map(summary), query));
  }),

  route('GET', '/api/v1/platform/tenants/:tenant_id', (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'tenant.view');
    sendJson(context.res, 200, detail(findTenant(context)));
  }),

  route('POST', '/api/v1/platform/tenants', async (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'tenant.create');
    const body = objectBody(await readBody(context.req), DRAFT_KEYS);
    const draft = draftFields(body, { amend: false });
    sendIdempotent(
      context,
      body,
      () => {
        const { organisations } = context.state;
        if (organisations.some((candidate) => candidate.code === draft.code)) {
          throw internalError();
        }
        const now = new Date().toISOString();
        const created: FakeOrganisation = {
          id: randomUUID(),
          code: draft.code,
          displayName: draft.displayName,
          countryCode: draft.countryCode,
          baseCurrencyCode: draft.baseCurrencyCode,
          timezone: draft.timezone,
          status: 'DRAFT',
          bootstrapStatus: 'DRAFT',
          bootstrapFailureCode: null,
          createdAt: now,
          updatedAt: now,
          createdBy: access.claims.userId,
        };
        organisations.push(created);
        return { organisation_id: created.id, status: 'DRAFT' };
      },
      201,
    );
  }),

  route('PATCH', '/api/v1/platform/tenants/:tenant_id', async (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'tenant.update_draft');
    requirePermission(access, 'tenant.view'); // read-back (BG-31)
    const tenant = findTenant(context);
    const body = objectBody(await readBody(context.req), DRAFT_KEYS);
    const draft = draftFields(body, { amend: true });
    sendIdempotent(context, body, () => {
      if (tenant.status !== 'DRAFT') {
        throw problem(409, 'conflict', 'Only a draft can be amended.');
      }
      const { organisations } = context.state;
      if (
        draft.code !== tenant.code &&
        organisations.some((candidate) => candidate.code === draft.code)
      ) {
        throw internalError();
      }
      // Replaces every field (contract §D); the legal name, registration and admin stay write-only.
      tenant.code = draft.code;
      tenant.displayName = draft.displayName;
      tenant.countryCode = draft.countryCode;
      tenant.baseCurrencyCode = draft.baseCurrencyCode;
      tenant.timezone = draft.timezone;
      tenant.updatedAt = new Date().toISOString();
      return detail(tenant);
    });
  }),

  transition(
    'submit',
    'tenant.submit_for_approval',
    (tenant) => tenant.status === 'DRAFT',
    (tenant, access) => {
      tenant.status = 'PENDING_APPROVAL';
      tenant.bootstrapStatus = 'PENDING_ACTIVATION';
      tenant.submittedBy = access.claims.userId;
    },
    { reason: 'none' },
  ),
  transition(
    'approve',
    'tenant.approve',
    (tenant) => tenant.status === 'PENDING_APPROVAL',
    (tenant, access) => {
      // Maker-checker (contract §E.2): never the creator or the submitter, with the same 403 as a
      // missing permission (BG-08).
      const actor = access.claims.userId;
      if (tenant.createdBy === actor || tenant.submittedBy === actor) {
        throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
      }
      // ACTIVE in the same transaction (via PROVISIONING); the first administrator is queued.
      tenant.status = 'ACTIVE';
      tenant.bootstrapStatus = 'QUEUED';
    },
    { reason: 'none', status: 202 },
  ),
  transition(
    'reject',
    'tenant.reject',
    (tenant) => tenant.status === 'PENDING_APPROVAL',
    (tenant) => {
      tenant.status = 'REJECTED';
      tenant.bootstrapStatus = 'DRAFT';
    },
    { reason: 'required', unknownIs500: true },
  ),
  transition(
    'suspend',
    'tenant.suspend',
    (tenant) => tenant.status === 'ACTIVE',
    (tenant) => {
      tenant.status = 'SUSPENDED';
    },
    { reason: 'required', unknownIs500: true },
  ),
  transition(
    'reactivate',
    'tenant.reactivate',
    (tenant) => tenant.status === 'SUSPENDED',
    (tenant) => {
      tenant.status = 'ACTIVE';
    },
    { reason: 'optional' },
  ),
  transition(
    'deprovision',
    'tenant.deprovision',
    (tenant) => tenant.status === 'ACTIVE' || tenant.status === 'SUSPENDED',
    (tenant) => {
      tenant.status = 'DEPROVISIONED';
    },
    { reason: 'required' },
  ),
  transition(
    'bootstrap/retry',
    'tenant.bootstrap_retry',
    (tenant) => tenant.bootstrapStatus === 'FAILED',
    (tenant) => {
      // The backend reruns the bootstrap at once; the identity provisioning then proceeds async.
      tenant.bootstrapStatus = 'PROVISIONING_IDENTITY';
      tenant.bootstrapFailureCode = null;
    },
    { reason: 'none', status: 202 },
  ),
];
```

- [ ] **Step 5: Add the scenario to `e2e/fake-api/scenarios.mts`**

Insert this block directly above the ``// `satisfies` …`` comment that precedes
`const BUILDERS = {`, so the comment stays attached to `BUILDERS`:

```ts
/** Layer 16 seed IDs (lane rules §5). `otherOperator` is only a maker id: no user row needs it. */
export const TENANT_SCENARIO_IDS = {
  umoja: '16000000-0000-4000-8000-000000000001',
  harambee: '16000000-0000-4000-8000-000000000002',
  mwangaza: '16000000-0000-4000-8000-000000000003',
  pwani: '16000000-0000-4000-8000-000000000004',
  kilimo: '16000000-0000-4000-8000-000000000005',
  nairobiMetro: '16000000-0000-4000-8000-000000000006',
  otherOperator: '16000000-0000-4000-8000-000000000007',
} as const;

/** Real platform codes (PLATFORM_SUPER_ADMIN holds all 80, contract §J), granted only here, so that
 * `platform-operator` stays the read-only gating scenario (e2e/platform-tenants.spec.ts). */
const PLATFORM_TENANT_CODES = [
  'tenant.create',
  'tenant.update_draft',
  'tenant.submit_for_approval',
  'tenant.approve',
  'tenant.reject',
  'tenant.suspend',
  'tenant.reactivate',
  'tenant.deprovision',
  'tenant.bootstrap_retry',
];

/**
 * Layer 16: a copy of `platform-operator` plus one institution per lifecycle state. Jane drafted
 * Umoja. Another operator drafted Mwangaza and Jane submitted it, so she can't approve it; another
 * operator drafted and submitted Harambee, so she can. Pwani's bootstrap failed, and the long-named
 * one was rejected.
 */
function platformTenantsScenario(): RunState {
  const state = platformOperator();
  const ids = TENANT_SCENARIO_IDS;
  const on = (date: string) => ({ createdAt: date, updatedAt: date });
  return {
    ...state,
    organisations: [
      ...state.organisations,
      organisation(ids.umoja, 'umoja-teachers', 'Umoja Teachers SACCO', {
        ...on('2026-09-05T08:00:00Z'),
        status: 'DRAFT',
        bootstrapStatus: 'DRAFT',
        createdBy: IDS.jane,
      }),
      organisation(ids.harambee, 'harambee-farmers', 'Harambee Farmers SACCO', {
        ...on('2026-09-04T08:00:00Z'),
        status: 'PENDING_APPROVAL',
        bootstrapStatus: 'PENDING_ACTIVATION',
        countryCode: 'UG',
        baseCurrencyCode: 'UGX',
        timezone: 'Africa/Kampala',
        createdBy: ids.otherOperator,
        submittedBy: ids.otherOperator,
      }),
      organisation(ids.mwangaza, 'mwangaza-savings', 'Mwangaza Savings SACCO', {
        ...on('2026-09-03T08:00:00Z'),
        status: 'PENDING_APPROVAL',
        bootstrapStatus: 'PENDING_ACTIVATION',
        createdBy: ids.otherOperator,
        submittedBy: IDS.jane,
      }),
      organisation(ids.pwani, 'pwani-fishermen', 'Pwani Fishermen SACCO', {
        ...on('2026-08-20T08:00:00Z'),
        bootstrapStatus: 'FAILED',
        bootstrapFailureCode: 'KEYCLOAK_UNAVAILABLE',
      }),
      organisation(ids.kilimo, 'kilimo-bora', 'Kilimo Bora SACCO', {
        ...on('2026-08-10T08:00:00Z'),
        status: 'SUSPENDED',
      }),
      // A 100-character name, the backend's maximum: the 375 px a11y cases prove it never scrolls
      // the page (index item 4).
      organisation(
        ids.nairobiMetro,
        'nairobi-metro-teachers',
        'Nairobi Metropolitan Public Service Teachers and Allied Workers Savings and Credit Co-op Society Ltd',
        {
          ...on('2026-08-01T08:00:00Z'),
          status: 'REJECTED',
          bootstrapStatus: 'DRAFT',
          countryCode: 'TZ',
          baseCurrencyCode: 'TZS',
          timezone: 'Africa/Dar_es_Salaam',
        },
      ),
    ],
    roles: state.roles.map((candidate) => ({
      ...candidate,
      permissions: [...candidate.permissions, ...PLATFORM_TENANT_CODES],
    })),
  };
}
```

Then append one entry at the end of `BUILDERS`, after its last entry at the base (`branches:
branchesScenario,` in the snapshot; 13 or 09 may have appended after it):

```ts
  // Layer 16 (platform tenants).
  'platform-tenants': platformTenantsScenario,
```

- [ ] **Step 6: Format the `.mts` files** (form P)

`e2e/fake-api/state.mts e2e/fake-api/routes/platform-tenants.mts e2e/fake-api/scenarios.mts`

- [ ] **Step 7: Run the fake specs**

Run (form E) on `e2e/fake-api-platform-tenants.spec.ts e2e/fake-api.spec.ts`. Expected: PASS. The
fake boots under plain `node` (Playwright's `webServer`), so a non-erasable construct fails here
first. The two existing `/platform/tenants` tests in `e2e/fake-api.spec.ts` still pass unchanged.

- [ ] **Step 8: Commit** (form C)

`git add e2e/fake-api/state.mts e2e/fake-api/routes/platform-tenants.mts e2e/fake-api/scenarios.mts e2e/fake-api-platform-tenants.spec.ts`

```
test(fake-api): add platform tenant lifecycle routes and the platform-tenants scenario

The fake mirrors contract §D/§E.2: bean-validation 400s, the duplicate-code and unknown-tenant
500s (BG-07), maker-checker on approve (BG-08), the 202s, and idempotent replay. platform-operator
stays read-only, and the tenant codes live only in the new scenario.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 4: The Stepper theme and `WizardForm`

Skills: `frontend-design`, `ui-ux-pro-max`, `material-ui-theming`, `material-ui-styling`.

**Files:**

- Modify: `theme/create-finaxis-theme.ts` (four keys after `MuiTab`)
- Create: `components/data-display/wizard-form.tsx`, `components/data-display/wizard-form.test.tsx`

**Interfaces:**

- Consumes: MUI 9 `Stepper` (an `ol`), `Step` (an `li`; `ownerState.active`), `StepLabel`
  (`optional`), `StepIcon`; `theme.vars.palette.{divider, background.paper, status.infoBg,
primary.main, primary.contrastText, success.main, surfaces.tertiary, text.primary,
text.secondary}`, `theme.breakpoints.up`; `NextLink` (`components/navigation/next-link.tsx`).
- Produces (fixed from this layer on; 11's invite wizard consumes them):
  - the `MuiStepper`, `MuiStep`, `MuiStepLabel` and `MuiStepIcon` overrides: bordered cells, two
    columns below `md` and one row from `md`, with the active cell tinted and underlined;
  - `interface WizardStep { label: string; helper: string }`;
  - `WizardForm({ label, steps, active, onSubmit, onBack, cancelHref, submitLabel, pending, alerts?,
children })`, a client component. It owns no form state: the caller validates in `onSubmit`
    (Continue on every step but the last, the submit on the last) and moves `active`. A step change
    focuses the new step's heading, never on mount.

- [ ] **Step 1: Write the failing test**

`components/data-display/wizard-form.test.tsx`:

```tsx
import type { ComponentProps, SyntheticEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { WizardForm, type WizardStep } from './wizard-form';

const STEPS: WizardStep[] = [
  { label: 'Institution', helper: 'Identity and locale' },
  { label: 'Administrator', helper: 'The first user' },
  { label: 'Review', helper: 'Check everything' },
];

function wizard(active: number, props: Partial<ComponentProps<typeof WizardForm>> = {}) {
  return (
    <WizardForm
      label="Create tenant draft"
      steps={STEPS}
      active={active}
      onSubmit={(event) => {
        event.preventDefault();
      }}
      onBack={vi.fn()}
      cancelHref="/platform-admin/tenants"
      submitLabel="Create draft"
      pending={false}
      {...props}
    >
      <input aria-label="Field" />
    </WizardForm>
  );
}

describe('WizardForm', () => {
  it('renders the themed stepper, marking the current step and the completed ones', () => {
    renderWithProviders(wizard(1));

    const list = screen.getByRole('list');
    // The theme's cell grid (jsdom resolves emotion's base rules; the md row is a media query).
    expect(getComputedStyle(list).display).toBe('grid');
    const items = within(list).getAllByRole('listitem');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).toHaveTextContent('Institution (completed)');
    expect(items[2]).not.toHaveTextContent('(completed)');
    expect(screen.getByRole('form', { name: 'Create tenant draft' })).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Administrator' })).toBeInTheDocument();
  });

  it('offers Back after the first step, Continue until the last, and Cancel back to the list', () => {
    const { rerender } = renderWithProviders(wizard(0));

    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveAttribute('type', 'submit');
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants',
    );

    rerender(wizard(2));
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Create draft' })).toHaveAttribute('type', 'submit');
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });

  it('moves focus to the new step heading on a step change, never on mount', () => {
    const { rerender } = renderWithProviders(wizard(0));
    expect(screen.getByRole('heading', { level: 2, name: 'Institution' })).not.toHaveFocus();

    rerender(wizard(1));
    expect(screen.getByRole('heading', { level: 2, name: 'Administrator' })).toHaveFocus();
  });

  it('submits and goes back through its callbacks, and locks navigation while pending', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    const onBack = vi.fn();
    const { rerender } = renderWithProviders(wizard(1, { onSubmit, onBack }));

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);

    rerender(wizard(1, { onSubmit, onBack, pending: true }));
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('aria-disabled', 'true');
  });
});
```

- [ ] **Step 2: Run it**

Run (form T) on `components/data-display/wizard-form.test.tsx`. Expected: FAIL, because
`./wizard-form` doesn't exist yet.

- [ ] **Step 3: Add the Stepper overrides to `theme/create-finaxis-theme.ts`**

Insert directly after the `MuiTab` entry (before `MuiDialog`):

```ts
      MuiStepper: {
        // Cells, not connectors (spec §7.3): the prototype's bordered wizard header.
        defaultProps: { connector: null },
        styleOverrides: {
          root: ({ theme }) => ({
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            alignItems: 'stretch',
            // The 1px gaps over the divider-coloured root draw every cell border, for any number
            // of steps.
            gap: '1px',
            overflow: 'hidden',
            border: `1px solid ${theme.vars.palette.divider}`,
            borderRadius: 6,
            backgroundColor: theme.vars.palette.divider,
            [theme.breakpoints.up('md')]: {
              gridTemplateColumns: 'none',
              gridAutoFlow: 'column',
              gridAutoColumns: 'minmax(0, 1fr)',
            },
          }),
        },
      },
      MuiStep: {
        styleOverrides: {
          root: ({ theme }) => ({
            minHeight: 72,
            padding: '13px 16px',
            display: 'flex',
            alignItems: 'center',
            backgroundColor: theme.vars.palette.background.paper,
            // Below md, an odd last step spans the two-column grid's last row.
            '&:nth-of-type(odd):last-of-type': { gridColumn: '1 / -1' },
            [theme.breakpoints.up('md')]: {
              '&:nth-of-type(odd):last-of-type': { gridColumn: 'auto' },
            },
          }),
        },
        variants: [
          {
            // Step has no active class; its ownerState carries `active`.
            props: { active: true },
            style: ({ theme }) => ({
              backgroundColor: theme.vars.palette.status.infoBg,
              boxShadow: `inset 0 -3px 0 ${theme.vars.palette.primary.main}`,
            }),
          },
        ],
      },
      MuiStepLabel: {
        styleOverrides: {
          iconContainer: { paddingRight: 11 },
          label: ({ theme }) => ({
            fontSize: '0.8125rem',
            fontWeight: 700,
            color: theme.vars.palette.text.secondary,
            '&.Mui-active, &.Mui-completed': {
              color: theme.vars.palette.text.primary,
              fontWeight: 700,
            },
          }),
        },
      },
      MuiStepIcon: {
        styleOverrides: {
          root: ({ theme }) => ({
            width: 29,
            height: 29,
            color: theme.vars.palette.surfaces.tertiary,
            '&.Mui-active': { color: theme.vars.palette.primary.main },
            '&.Mui-completed': { color: theme.vars.palette.success.main },
            '&.Mui-active .MuiStepIcon-text': { fill: theme.vars.palette.primary.contrastText },
          }),
          text: ({ theme }) => ({ fill: theme.vars.palette.text.secondary, fontWeight: 800 }),
        },
      },
```

- [ ] **Step 4: Implement `components/data-display/wizard-form.tsx`**

```tsx
'use client';

import { useEffect, useRef, type ReactNode, type SyntheticEvent } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';

export interface WizardStep {
  label: string;
  /** One line under the step's label (from `sm`) and under its heading. */
  helper: string;
}

interface WizardFormProps {
  /** Names the form landmark, e.g. `Create tenant draft`. */
  label: string;
  steps: readonly WizardStep[];
  active: number;
  /** Continue on every step but the last, the submit on the last: the caller validates and moves
   * `active`. */
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onBack: () => void;
  cancelHref: string;
  submitLabel: string;
  pending: boolean;
  /** Error summaries, between the step heading and its fields. */
  alerts?: ReactNode;
  children: ReactNode;
}

/**
 * A multi-step form (spec §9): the themed Stepper, the current step in a surface, and a sticky
 * action bar. It holds no form state: one React Hook Form spans the steps in the caller.
 */
export function WizardForm({
  label,
  steps,
  active,
  onSubmit,
  onBack,
  cancelHref,
  submitLabel,
  pending,
  alerts,
  children,
}: WizardFormProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(active);

  // A step change starts keyboard and screen-reader users at the new step's top; the first render
  // leaves focus where the page put it.
  useEffect(() => {
    if (shownStep.current === active) return;
    shownStep.current = active;
    headingRef.current?.focus();
  }, [active]);

  const current = steps[active];
  const last = active === steps.length - 1;

  return (
    <Box
      component="form"
      noValidate
      aria-label={label}
      onSubmit={onSubmit}
      sx={{ display: 'grid', gap: 4.5 }}
    >
      <Stepper activeStep={active}>
        {steps.map((step, index) => (
          <Step key={step.label} aria-current={index === active ? 'step' : undefined}>
            <StepLabel
              optional={
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: { xs: 'none', sm: 'block' } }}
                >
                  {step.helper}
                </Typography>
              }
            >
              {step.label}
              {/* The completed check is an unlabelled icon. */}
              {index < active && <span className="sr-only"> (completed)</span>}
            </StepLabel>
          </Step>
        ))}
      </Stepper>
      <Paper sx={{ overflow: 'visible' }}>
        <Box sx={{ px: 6, pt: 5, pb: 4, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="overline" component="p" color="text.secondary">
            {`Step ${active + 1} of ${steps.length}`}
          </Typography>
          {/* A focus target only (tabIndex -1), with the browser's ring, as 08's record title. */}
          <Typography ref={headingRef} tabIndex={-1} component="h2" variant="h4" sx={{ my: 1 }}>
            {current?.label}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {current?.helper}
          </Typography>
        </Box>
        {alerts && <Box sx={{ px: 6, pt: 4.5, display: 'grid', gap: 3 }}>{alerts}</Box>}
        <Box sx={{ p: 6, display: 'grid', gap: 4.5 }}>{children}</Box>
        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            zIndex: 5,
            minHeight: 70,
            px: 5,
            py: 3,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 2.25,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Button component={NextLink} href={cancelHref} variant="outlined" disabled={pending}>
            Cancel
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button variant="outlined" onClick={onBack} disabled={active === 0 || pending}>
            Back
          </Button>
          <Button type="submit" variant="contained" loading={pending}>
            {last ? submitLabel : 'Continue'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
```

`sr-only` is Tailwind's visibility utility (AGENTS.md allows visibility).

- [ ] **Step 5: Run it again**

Run (form T) on `components/data-display/wizard-form.test.tsx theme`. Expected: PASS, and the theme's
own tests stay green.

- [ ] **Step 6: Commit** (form C)

`git add theme/create-finaxis-theme.ts components/data-display/wizard-form.tsx components/data-display/wizard-form.test.tsx`

```
feat(data-display): add WizardForm and the Stepper theme it uses

The Stepper renders bordered cells (two columns below md, one row from md) with the active cell
tinted. WizardForm wraps the steps in a form landmark with a sticky Cancel, Back and Continue bar,
and moves focus to the new step's heading on every step change.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 5: The institution record (hero lifecycle, Overview and Provisioning tabs)

Skills: `frontend-design`, `ui-ux-pro-max`. Read pre-flight note 8's Next.js guides first.

**Files** (`R` = `app/(authenticated)/platform-admin/tenants/[tenantId]`,
`C` = `modules/platform-administration/tenants/components`):

- Create: `R/(record)/layout.tsx`, `R/(record)/page.tsx`, `R/(record)/provisioning/page.tsx`
- Create: `C/tenant-lifecycle-actions.tsx`, `C/tenant-lifecycle-actions.test.tsx`
- Create: `C/retry-bootstrap-button.tsx`, `C/retry-bootstrap-button.test.tsx`
- Create: `C/provisioning-timeline.tsx`, `C/provisioning-timeline.test.tsx`
- Delete: `R/page.tsx`, `R/page.test.tsx` (Ruling 18; `(record)/page.tsx` now serves the same URL,
  and two pages on one path don't build)

**Interfaces:**

- Consumes:
  - Task 1: `availableTenantActions`, `canRetryBootstrap`, `provisioningTimeline`,
    `type ProvisioningStep`, `type TenantLifecycleAction`, `countryName`, `currencyLabel`;
  - Task 2: `getTenant`, `submitTenant`, `approveTenant`, `rejectTenant`, `suspendTenant`,
    `reactivateTenant`, `deprovisionTenant`, `retryTenantBootstrap`;
  - the kit: `RecordHero({ back?, avatar, eyebrow, title, subtitle?, status?, actions? })`,
    `RecordTabs({ label, tabs })`, `StatusChip({ value, label?, tone? })`,
    `DescriptionList({ items, columns? })`, `SectionCard({ title, description?, actions?,
headingLevel?, children })`, `CopyIdButton({ value, label? })`, `EmptyState({ title,
description? })`, `ErrorState({ problem })`, `ForbiddenState({ title?, description?, action? })`,
    `PageHeader({ eyebrow?, title, description?, actions? })`;
  - `ConfirmDialog({ open, title, description, confirmLabel, tone?, action, onClose, onSuccess,
children?, contextOrganisationId? })`; `ReasonDialog({ open, title, description, confirmLabel,
reason, action, onClose, onSuccess, fields?, contextOrganisationId? })`, plus 08's V3
    `tone?: 'default' | 'error'` (pre-flight note 1); `type FormAction`
    (`lib/api/action-result.ts`); `useToast(): (message, severity?) => void`;
  - `load()`, `UUID_PATTERN` (`lib/api/wire.ts`), `formatInstant(iso, timeZone): { date; time }`,
    `getCurrentContextProfile()`, `can`, `isPlatformOrganisation(id)` (`config/application-context.ts`,
    server-only);
  - 08: `focusRecordTitle(): void` (`modules/administration/branches/components/branch-lifecycle-actions.tsx`).
- Produces (17 adds its Branches and Users tabs under `(record)/`):
  - the record route `/platform-admin/tenants/[tenantId]` and its `/provisioning` tab;
  - `TenantLifecycleActions({ tenantId, tenantName, tenantCode, actions, contextOrganisationId? })`;
  - `RetryBootstrapButton({ tenantId, tenantName, contextOrganisationId? })`;
  - `ProvisioningTimeline({ steps, failureCode })`.

- [ ] **Step 1: Write the failing component tests**

`C/tenant-lifecycle-actions.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { TenantLifecycleAction } from '../tenant-rules';
import { TenantLifecycleActions } from './tenant-lifecycle-actions';

const { approveTenant, deprovisionTenant, rejectTenant, submitTenant } = vi.hoisted(() => ({
  approveTenant: vi.fn(),
  deprovisionTenant: vi.fn(),
  rejectTenant: vi.fn(),
  submitTenant: vi.fn(),
}));
vi.mock('../tenant-actions', () => ({
  submitTenant: (...args: unknown[]) => submitTenant(...args) as unknown,
  approveTenant: (...args: unknown[]) => approveTenant(...args) as unknown,
  rejectTenant: (...args: unknown[]) => rejectTenant(...args) as unknown,
  suspendTenant: vi.fn(),
  reactivateTenant: vi.fn(),
  deprovisionTenant: (...args: unknown[]) => deprovisionTenant(...args) as unknown,
}));
// focusRecordTitle's module imports 08's 'use server' branch actions. Mock them, as 08's own
// component tests do, so their server chain (next/cache, the auth modules) never loads in jsdom.
vi.mock('@/modules/administration/branches/branch-actions', () => ({
  submitBranch: vi.fn(),
  activateBranch: vi.fn(),
  suspendBranch: vi.fn(),
  reactivateBranch: vi.fn(),
  closeBranch: vi.fn(),
}));

const ID = '16000000-0000-4000-8000-000000000001';
const ORG_ID = '00000000-0000-0000-0000-000000000000';
const NAME = 'Umoja Teachers SACCO';

/** Reject and Deprovision pass tone="error": an alertdialog once ReasonDialog has 08's V3 tone. */
const dialogNamed = (name: string) =>
  screen.queryByRole('alertdialog', { name }) ?? screen.getByRole('dialog', { name });

const record = (actions: readonly TenantLifecycleAction[]) => (
  <main>
    <h1>{NAME}</h1>
    <TenantLifecycleActions
      tenantId={ID}
      tenantName={NAME}
      tenantCode="umoja-teachers"
      actions={actions}
      contextOrganisationId={ORG_ID}
    />
  </main>
);

describe('TenantLifecycleActions', () => {
  it('links Amend, submits through a confirmation with no reason, then focuses Approve', async () => {
    const user = userEvent.setup();
    submitTenant.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderWithProviders(record(['amend', 'submit']));

    expect(screen.getByRole('link', { name: 'Amend draft' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${ID}/amend`,
    );
    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    const dialog = screen.getByRole('dialog', { name: `Submit ${NAME} for approval?` });
    // The endpoint reads no body (contract §E.2): nothing to type.
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Submit for approval' }));

    await waitFor(() => {
      expect(submitTenant).toHaveBeenCalledTimes(1);
    });
    const formData = submitTenant.mock.calls[0]?.[1] as FormData;
    expect(formData.get('tenantId')).toBe(ID);
    expect(formData.get('contextOrganisationId')).toBe(ORG_ID);
    expect(formData.has('reason')).toBe(false);
    expect(await screen.findByRole('alert')).toHaveTextContent('Submitted for approval');

    // The layout re-renders with PENDING_APPROVAL's actions after refresh().
    rerender(record(['approve', 'reject']));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Approve' })).toHaveFocus();
    });
  });

  it('rejects with a required reason, then focuses the title once no action is left', async () => {
    const user = userEvent.setup();
    rejectTenant.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderWithProviders(record(['approve', 'reject']));

    expect(screen.getByRole('button', { name: 'Reject' })).toHaveClass('MuiButton-colorError');
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    const dialog = dialogNamed(`Reject ${NAME}?`);
    const reason = within(dialog).getByRole('textbox', { name: 'Reason' });
    expect(reason).toBeRequired();
    await user.type(reason, 'Duplicate request');
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));

    await waitFor(() => {
      expect(rejectTenant).toHaveBeenCalledTimes(1);
    });
    expect((rejectTenant.mock.calls[0]?.[1] as FormData).get('reason')).toBe('Duplicate request');
    expect(await screen.findByRole('alert')).toHaveTextContent('Request rejected');

    // REJECTED offers nothing, so the layout drops the component: its unmount cleanup focuses the
    // record title (standing ruling 4).
    rerender(
      <main>
        <h1>{NAME}</h1>
      </main>,
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: NAME })).toHaveFocus();
    });
  });

  it('explains an approve refusal inside the dialog, with its reference (BG-08)', async () => {
    const user = userEvent.setup();
    approveTenant.mockResolvedValueOnce({
      ok: false,
      formError:
        "You can't approve this institution. Your role may not allow it, or you created or submitted the request: a different platform administrator must approve it.",
      fieldErrors: {},
      code: 'forbidden',
      requestId: 'req-7',
    });
    renderWithProviders(record(['approve', 'reject']));

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = screen.getByRole('dialog', { name: `Approve ${NAME}?` });
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /created or submitted the request.*Reference: req-7/,
    );
  });

  it('deprovisions only with the typed tenant code, keeping the reason and the key (CRITICAL)', async () => {
    const user = userEvent.setup();
    deprovisionTenant
      .mockResolvedValueOnce({
        ok: false,
        formError: 'Check the highlighted fields and try again.',
        fieldErrors: { confirmCode: 'Type the tenant code exactly as shown.' },
        code: 'validation_failed',
        requestId: null,
      })
      .mockResolvedValueOnce({ ok: true });
    renderWithProviders(record(['suspend', 'deprovision']));

    expect(screen.getByRole('button', { name: 'Deprovision' })).toHaveClass('MuiButton-colorError');
    await user.click(screen.getByRole('button', { name: 'Deprovision' }));
    const dialog = dialogNamed(`Deprovision ${NAME}?`);
    const confirm = within(dialog).getByRole('textbox', { name: 'Type umoja-teachers to confirm' });
    await user.type(confirm, 'umoja');
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Reason' }),
      'Merged into Harambee',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Deprovision' }));

    await waitFor(() => {
      expect(confirm).toHaveAccessibleDescription('Type the tenant code exactly as shown.');
    });
    expect(confirm).toHaveFocus();
    expect(within(dialog).getByRole('textbox', { name: 'Reason' })).toHaveValue(
      'Merged into Harambee',
    );

    await user.clear(confirm);
    await user.type(confirm, 'umoja-teachers');
    await user.click(within(dialog).getByRole('button', { name: 'Deprovision' }));
    await waitFor(() => {
      expect(deprovisionTenant).toHaveBeenCalledTimes(2);
    });
    const [first, second] = deprovisionTenant.mock.calls.map((call) => call[1] as FormData);
    // A refused attempt keeps its key: the retry replays safely (index item 2).
    expect(second?.get('idempotencyKey')).toBe(first?.get('idempotencyKey'));
    expect(second?.get('tenantCode')).toBe('umoja-teachers');
    expect(second?.get('confirmCode')).toBe('umoja-teachers');
  });
});
```

`C/retry-bootstrap-button.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { RetryBootstrapButton } from './retry-bootstrap-button';

const { retryTenantBootstrap } = vi.hoisted(() => ({ retryTenantBootstrap: vi.fn() }));
vi.mock('../tenant-actions', () => ({
  retryTenantBootstrap: (...args: unknown[]) => retryTenantBootstrap(...args) as unknown,
}));
// focusRecordTitle's module imports 08's 'use server' branch actions. Mock them, as 08's own
// component tests do, so their server chain (next/cache, the auth modules) never loads in jsdom.
vi.mock('@/modules/administration/branches/branch-actions', () => ({
  submitBranch: vi.fn(),
  activateBranch: vi.fn(),
  suspendBranch: vi.fn(),
  reactivateBranch: vi.fn(),
  closeBranch: vi.fn(),
}));

const ID = '16000000-0000-4000-8000-000000000004';
const ORG_ID = '00000000-0000-0000-0000-000000000000';
const NAME = 'Pwani Fishermen SACCO';

describe('RetryBootstrapButton', () => {
  it('retries with the tenant id and the rendered organisation, then focuses the title', async () => {
    const user = userEvent.setup();
    retryTenantBootstrap.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderWithProviders(
      <main>
        <h1>{NAME}</h1>
        <RetryBootstrapButton tenantId={ID} tenantName={NAME} contextOrganisationId={ORG_ID} />
      </main>,
    );

    await user.click(screen.getByRole('button', { name: 'Retry bootstrap' }));
    const dialog = screen.getByRole('dialog', { name: `Retry ${NAME}'s bootstrap?` });
    await user.click(within(dialog).getByRole('button', { name: 'Retry bootstrap' }));

    await waitFor(() => {
      expect(retryTenantBootstrap).toHaveBeenCalledTimes(1);
    });
    const formData = retryTenantBootstrap.mock.calls[0]?.[1] as FormData;
    expect(formData.get('tenantId')).toBe(ID);
    expect(formData.get('contextOrganisationId')).toBe(ORG_ID);
    expect(await screen.findByRole('alert')).toHaveTextContent('Bootstrap retry started');

    // The bootstrap left FAILED, so the page drops the button.
    rerender(
      <main>
        <h1>{NAME}</h1>
      </main>,
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: NAME })).toHaveFocus();
    });
  });
});
```

`C/provisioning-timeline.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { provisioningTimeline } from '../tenant-rules';
import { ProvisioningTimeline } from './provisioning-timeline';

describe('ProvisioningTimeline', () => {
  it('lists the steps in order, each with a worded chip, and shows the failure code', () => {
    renderWithProviders(
      <ProvisioningTimeline
        steps={provisioningTimeline('ACTIVE', 'FAILED') ?? []}
        failureCode="KEYCLOAK_UNAVAILABLE"
      />,
    );

    const steps = within(screen.getByRole('list', { name: 'Provisioning steps' })).getAllByRole(
      'listitem',
    );
    expect(steps).toHaveLength(4);
    expect(steps[0]).toHaveTextContent('1. Draft created');
    expect(steps[0]).toHaveTextContent('Done');
    expect(steps[3]).toHaveTextContent('4. First administrator provisioned');
    expect(steps[3]).toHaveTextContent('Failed');
    expect(screen.getByText('KEYCLOAK_UNAVAILABLE')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them**

Run (form T) on `modules/platform-administration/tenants/components`. Expected: FAIL (the three
components don't exist yet).

- [ ] **Step 3: Implement `C/provisioning-timeline.tsx`** (a Server Component)

```tsx
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DescriptionList } from '@/components/data-display/description-list';
import { StatusChip } from '@/components/data-display/status-chip';
import type { ProvisioningStep } from '../tenant-rules';

interface ProvisioningTimelineProps {
  steps: readonly ProvisioningStep[];
  failureCode: string | null;
}

/** Spec §11.2: the onboarding steps in order, each with a worded chip (never colour alone). */
export function ProvisioningTimeline({ steps, failureCode }: ProvisioningTimelineProps) {
  return (
    <>
      <Box component="ol" aria-label="Provisioning steps" sx={{ m: 0, p: 0, listStyle: 'none' }}>
        {steps.map((step, index) => (
          <Box
            component="li"
            key={step.label}
            sx={{
              px: 4.5,
              py: 3.5,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 3,
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Box sx={{ minWidth: 0, flex: '1 1 240px' }}>
              <Typography sx={{ fontWeight: 700 }}>{`${index + 1}. ${step.label}`}</Typography>
              <Typography variant="body2" color="text.secondary">
                {step.detail}
              </Typography>
            </Box>
            <StatusChip value={step.state.label} label={step.state.label} tone={step.state.tone} />
          </Box>
        ))}
      </Box>
      {failureCode && (
        <DescriptionList
          columns={1}
          items={[
            {
              label: 'Failure code',
              value: (
                <Box component="code" sx={{ fontFamily: 'monospace' }}>
                  {failureCode}
                </Box>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Implement `C/retry-bootstrap-button.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import ReplayOutlined from '@mui/icons-material/ReplayOutlined';
import { ConfirmDialog } from '@/components/data-display/confirm-dialog';
import { useToast } from '@/components/providers/toast-provider';
import { focusRecordTitle } from '@/modules/administration/branches/components/branch-lifecycle-actions';
import { retryTenantBootstrap } from '../tenant-actions';

interface RetryBootstrapButtonProps {
  tenantId: string;
  tenantName: string;
  /** I2: the organisation the page rendered for. */
  contextOrganisationId?: string;
}

/** The Provisioning tab's Retry bootstrap (spec §11.2), offered only for a FAILED bootstrap. */
export function RetryBootstrapButton({
  tenantId,
  tenantName,
  contextOrganisationId,
}: RetryBootstrapButtonProps) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const succeededRef = useRef(false);

  // A successful retry leaves FAILED, so the page drops this button while it holds focus: the
  // record title takes it instead (standing ruling 4; 08's unmount-cleanup pattern).
  useEffect(() => {
    const successRef = succeededRef;
    return () => {
      if (successRef.current) focusRecordTitle();
    };
  }, []);

  return (
    <>
      <Button
        variant="contained"
        startIcon={<ReplayOutlined />}
        onClick={() => {
          setOpen(true);
        }}
      >
        Retry bootstrap
      </Button>
      <ConfirmDialog
        open={open}
        title={`Retry ${tenantName}'s bootstrap?`}
        description="This runs the first administrator's provisioning again: the identity, its membership and the invitation."
        confirmLabel="Retry bootstrap"
        action={retryTenantBootstrap}
        contextOrganisationId={contextOrganisationId}
        onClose={() => {
          setOpen(false);
        }}
        onSuccess={() => {
          succeededRef.current = true;
          setOpen(false);
          notify('Bootstrap retry started');
        }}
      >
        <input type="hidden" name="tenantId" value={tenantId} />
      </ConfirmDialog>
    </>
  );
}
```

- [ ] **Step 5: Implement `C/tenant-lifecycle-actions.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { ConfirmDialog } from '@/components/data-display/confirm-dialog';
import { ReasonDialog } from '@/components/data-display/reason-dialog';
import NextLink from '@/components/navigation/next-link';
import { useToast } from '@/components/providers/toast-provider';
import type { FormAction } from '@/lib/api/action-result';
import { focusRecordTitle } from '@/modules/administration/branches/components/branch-lifecycle-actions';
import {
  approveTenant,
  deprovisionTenant,
  reactivateTenant,
  rejectTenant,
  submitTenant,
  suspendTenant,
} from '../tenant-actions';
import type { TenantLifecycleAction } from '../tenant-rules';

type DialogAction = Exclude<TenantLifecycleAction, 'amend'>;

interface ActionCopy {
  label: string;
  title: string;
  description: string;
  /** `null`: the endpoint reads no body (contract §E.2), so a ConfirmDialog without a reason. */
  reason: 'optional' | 'required' | null;
  /** Irreversible: an error-toned trigger and dialog. */
  destructive: boolean;
  success: string;
  action: FormAction;
}

function copyFor(id: DialogAction, name: string): ActionCopy {
  switch (id) {
    case 'submit':
      return {
        label: 'Submit for approval',
        title: `Submit ${name} for approval?`,
        description:
          'A different platform administrator must approve it. Approval provisions the institution and invites its first administrator.',
        reason: null,
        destructive: false,
        success: 'Submitted for approval',
        action: submitTenant,
      };
    case 'approve':
      return {
        label: 'Approve',
        title: `Approve ${name}?`,
        description:
          "Approval activates the institution, creates its head office and default roles, and queues its first administrator's account. Someone who created or submitted the request can't approve it.",
        reason: null,
        destructive: false,
        success: 'Approved. Provisioning is queued.',
        action: approveTenant,
      };
    case 'reject':
      return {
        label: 'Reject',
        title: `Reject ${name}?`,
        description:
          "Rejecting is permanent: the request can't be resubmitted, and its tenant code stays taken.",
        reason: 'required',
        destructive: true,
        success: 'Request rejected',
        action: rejectTenant,
      };
    case 'suspend':
      return {
        label: 'Suspend',
        title: `Suspend ${name}?`,
        description: 'Nobody can work in a suspended institution until it is reactivated.',
        reason: 'required',
        destructive: false,
        success: 'Institution suspended',
        action: suspendTenant,
      };
    case 'reactivate':
      return {
        label: 'Reactivate',
        title: `Reactivate ${name}?`,
        description: 'Members can work in the institution again.',
        reason: 'optional',
        destructive: false,
        success: 'Institution reactivated',
        action: reactivateTenant,
      };
    case 'deprovision':
      return {
        label: 'Deprovision',
        title: `Deprovision ${name}?`,
        description:
          'Deprovisioning is permanent. Nobody can work in the institution afterwards, and its assignments are revoked.',
        reason: 'required',
        destructive: true,
        success: 'Institution deprovisioned',
        action: deprovisionTenant,
      };
  }
}

interface TenantLifecycleActionsProps {
  tenantId: string;
  tenantName: string;
  /** Typed back before a deprovision (CRITICAL, spec §11.2). */
  tenantCode: string;
  actions: readonly TenantLifecycleAction[];
  /** I2: the organisation the page rendered for. */
  contextOrganisationId?: string;
}

/** The record hero's lifecycle (spec §11.2): availability comes from `availableTenantActions`. */
export function TenantLifecycleActions({
  tenantId,
  tenantName,
  tenantCode,
  actions,
  contextOrganisationId,
}: TenantLifecycleActionsProps) {
  const notify = useToast();
  const [open, setOpen] = useState<DialogAction | null>(null);
  const buttonRefs = useRef(new Map<string, HTMLElement | null>());
  // 08's I3: a success swaps the action set (refresh()). Focus the same action if it is still
  // offered, else the first one, else the title. `succeededRef` is set only by a real success;
  // the effect keys on the set's contents, not the array the server re-sends on every render.
  const succeededRef = useRef<string | null>(null);
  const actionKey = actions.join(',');

  useEffect(() => {
    const succeeded = succeededRef.current;
    if (succeeded === null) return;
    succeededRef.current = null;
    const current = actionKey === '' ? [] : actionKey.split(',');
    const target = [succeeded, ...current]
      .filter((id) => current.includes(id))
      .map((id) => buttonRefs.current.get(id))
      .find((node) => node?.isConnected);
    if (target) target.focus();
    else focusRecordTitle();
  }, [actionKey]);

  // Reject and Deprovision empty the set, so the layout unmounts this component: the same
  // fallback runs from the cleanup (aliasing the ref object reads its live value, as in 08).
  useEffect(() => {
    const successRef = succeededRef;
    return () => {
      if (successRef.current !== null) focusRecordTitle();
    };
  }, []);

  const dialogActions = actions.filter((id): id is DialogAction => id !== 'amend');

  return (
    <>
      {actions.map((id, index) => {
        const variant = index === 0 ? 'contained' : 'outlined';
        const register = (node: HTMLElement | null) => {
          buttonRefs.current.set(id, node);
        };
        if (id === 'amend') {
          return (
            <Button
              key={id}
              ref={register}
              component={NextLink}
              href={`/platform-admin/tenants/${tenantId}/amend`}
              variant={variant}
            >
              Amend draft
            </Button>
          );
        }
        const copy = copyFor(id, tenantName);
        return (
          <Button
            key={id}
            ref={register}
            variant={variant}
            color={copy.destructive ? 'error' : 'primary'}
            onClick={() => {
              setOpen(id);
            }}
          >
            {copy.label}
          </Button>
        );
      })}
      {dialogActions.map((id) => {
        const copy = copyFor(id, tenantName);
        const close = () => {
          setOpen(null);
        };
        const succeed = () => {
          succeededRef.current = id;
          setOpen(null);
          notify(copy.success);
        };
        if (copy.reason === null) {
          return (
            <ConfirmDialog
              key={id}
              open={open === id}
              title={copy.title}
              description={copy.description}
              confirmLabel={copy.label}
              action={copy.action}
              contextOrganisationId={contextOrganisationId}
              onClose={close}
              onSuccess={succeed}
            >
              <input type="hidden" name="tenantId" value={tenantId} />
            </ConfirmDialog>
          );
        }
        return (
          <ReasonDialog
            key={id}
            open={open === id}
            title={copy.title}
            description={copy.description}
            confirmLabel={copy.label}
            reason={copy.reason}
            tone={copy.destructive ? 'error' : undefined}
            action={copy.action}
            contextOrganisationId={contextOrganisationId}
            onClose={close}
            onSuccess={succeed}
            fields={(fieldErrors) => (
              <>
                <input type="hidden" name="tenantId" value={tenantId} />
                {id === 'deprovision' && (
                  <>
                    <input type="hidden" name="tenantCode" value={tenantCode} />
                    <TextField
                      name="confirmCode"
                      label={`Type ${tenantCode} to confirm`}
                      required
                      error={Boolean(fieldErrors.confirmCode)}
                      helperText={fieldErrors.confirmCode ?? 'The tenant code, exactly as shown.'}
                      slotProps={{ htmlInput: { autoComplete: 'off', spellCheck: false } }}
                    />
                  </>
                )}
              </>
            )}
          />
        );
      })}
    </>
  );
}
```

If pre-flight note 1 found no `tone` on `ReasonDialog`, delete the `tone={…}` line; nothing else
changes.

- [ ] **Step 6: Implement `R/(record)/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Paper from '@mui/material/Paper';
import DomainOutlined from '@mui/icons-material/DomainOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { RecordHero } from '@/components/data-display/record-hero';
import { RecordTabs } from '@/components/data-display/record-tabs';
import { StatusChip } from '@/components/data-display/status-chip';
import { PageHeader } from '@/components/shell/page-header';
import { isPlatformOrganisation } from '@/config/application-context';
import { load } from '@/lib/api/load';
import { UUID_PATTERN } from '@/lib/api/wire';
import { TenantLifecycleActions } from '@/modules/platform-administration/tenants/components/tenant-lifecycle-actions';
import {
  availableTenantActions,
  countryName,
} from '@/modules/platform-administration/tenants/tenant-rules';
import { getTenant } from '@/modules/platform-administration/tenants/tenant-service';

export const metadata: Metadata = { title: 'Institution record' };

const EYEBROW = 'Platform administration · Institution record';

interface TenantRecordLayoutProps {
  children: ReactNode;
  params: Promise<{ tenantId: string }>;
}

/** Record shell (spec §9, §11.2): the hero reads the tenant once (cached); each tab reads its own. */
export default async function TenantRecordLayout({ children, params }: TenantRecordLayoutProps) {
  const { tenantId } = await params;
  // BG-29: the reserved platform organisation is no institution, so nothing can target it here.
  if (!UUID_PATTERN.test(tenantId) || isPlatformOrganisation(tenantId)) notFound();

  const [tenant, selected] = await Promise.all([
    load(getTenant(tenantId)),
    getCurrentContextProfile(),
  ]);
  if (!tenant.ok) {
    if (tenant.problem.code === 'resource_not_found') notFound();
    return (
      <>
        <PageHeader eyebrow={EYEBROW} title="Institution record" />
        <Paper>
          {tenant.problem.code === 'forbidden' ? (
            <ForbiddenState />
          ) : (
            <ErrorState problem={tenant.problem} />
          )}
        </Paper>
      </>
    );
  }

  const record = tenant.value;
  const resolved = selected.kind === 'resolved' ? selected : null;
  const actions = availableTenantActions(record.status, {
    permissions: resolved?.profile.permissions ?? [],
  });
  const base = `/platform-admin/tenants/${tenantId}`;

  return (
    <>
      <RecordHero
        back={{ href: '/platform-admin/tenants', label: 'Back to institutions' }}
        avatar={{ kind: 'icon', icon: <DomainOutlined /> }}
        eyebrow={EYEBROW}
        title={record.displayName}
        subtitle={`${record.tenantCode} · ${countryName(record.countryCode)}`}
        status={<StatusChip value={record.status} />}
        actions={
          // Undefined, not an empty component: RecordHero renders its actions box whenever the
          // prop is truthy (08).
          actions.length > 0 ? (
            <TenantLifecycleActions
              tenantId={tenantId}
              tenantName={record.displayName}
              tenantCode={record.tenantCode}
              actions={actions}
              contextOrganisationId={resolved?.context.organization.id}
            />
          ) : undefined
        }
      />
      <RecordTabs
        label={`${record.displayName} sections`}
        tabs={[
          { href: base, label: 'Overview' },
          { href: `${base}/provisioning`, label: 'Provisioning' },
        ]}
      />
      {children}
    </>
  );
}
```

- [ ] **Step 7: Implement `R/(record)/page.tsx`** (Overview)

```tsx
import { CopyIdButton } from '@/components/data-display/copy-id-button';
import { DescriptionList, type DescriptionItem } from '@/components/data-display/description-list';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import { load } from '@/lib/api/load';
import { formatInstant } from '@/lib/format';
import { countryName, currencyLabel } from '@/modules/platform-administration/tenants/tenant-rules';
import { getTenant } from '@/modules/platform-administration/tenants/tenant-service';

interface TenantOverviewPageProps {
  params: Promise<{ tenantId: string }>;
}

/** The platform workspace shows instants in UTC, labelled (spec §9). */
function utc(iso: string): string {
  const when = formatInstant(iso, 'UTC');
  return `${when.date} · ${when.time}`;
}

export default async function TenantOverviewPage({ params }: TenantOverviewPageProps) {
  const { tenantId } = await params;
  const tenant = await load(getTenant(tenantId)); // cached: the layout's read
  if (!tenant.ok) return null; // the layout renders the failure

  const record = tenant.value;
  const items: DescriptionItem[] = [
    { label: 'Display name', value: record.displayName },
    { label: 'Tenant code', value: record.tenantCode },
    { label: 'Country', value: `${countryName(record.countryCode)} (${record.countryCode})` },
    { label: 'Base currency', value: currencyLabel(record.baseCurrencyCode) },
    { label: 'Timezone', value: record.timezone },
    { label: 'Lifecycle', value: <StatusChip value={record.status} /> },
    {
      label: 'Provisioning',
      value: record.bootstrapStatus ? <StatusChip value={record.bootstrapStatus} /> : 'Not tracked',
    },
    { label: 'Created (UTC)', value: utc(record.createdAt) },
    { label: 'Updated (UTC)', value: utc(record.updatedAt) },
    { label: 'Institution ID', value: <CopyIdButton value={record.id} label="Institution ID" /> },
  ];

  return (
    <SectionCard
      title="Institution details"
      description="The legal name, registration number and first administrator are stored with the request, but the platform doesn't return them."
    >
      <DescriptionList items={items} />
    </SectionCard>
  );
}
```

- [ ] **Step 8: Implement `R/(record)/provisioning/page.tsx`**

```tsx
import type { Metadata } from 'next';
import { getCurrentContextProfile } from '@/auth/context-service';
import { EmptyState } from '@/components/data-display/empty-state';
import { SectionCard } from '@/components/data-display/section-card';
import { load } from '@/lib/api/load';
import { ProvisioningTimeline } from '@/modules/platform-administration/tenants/components/provisioning-timeline';
import { RetryBootstrapButton } from '@/modules/platform-administration/tenants/components/retry-bootstrap-button';
import {
  canRetryBootstrap,
  provisioningTimeline,
} from '@/modules/platform-administration/tenants/tenant-rules';
import { getTenant } from '@/modules/platform-administration/tenants/tenant-service';

export const metadata: Metadata = { title: 'Provisioning' };

interface TenantProvisioningPageProps {
  params: Promise<{ tenantId: string }>;
}

export default async function TenantProvisioningPage({ params }: TenantProvisioningPageProps) {
  const { tenantId } = await params;
  const [tenant, selected] = await Promise.all([
    load(getTenant(tenantId)), // cached: the layout's read
    getCurrentContextProfile(),
  ]);
  if (!tenant.ok) return null; // the layout renders the failure

  const record = tenant.value;
  const resolved = selected.kind === 'resolved' ? selected : null;
  const steps = provisioningTimeline(record.status, record.bootstrapStatus);
  const retry = canRetryBootstrap(record.bootstrapStatus, {
    permissions: resolved?.profile.permissions ?? [],
  });

  return (
    <SectionCard
      title="Provisioning"
      description="Approval creates the head office and default roles; the first administrator's identity and invitation follow."
      actions={
        retry ? (
          <RetryBootstrapButton
            tenantId={tenantId}
            tenantName={record.displayName}
            contextOrganisationId={resolved?.context.organization.id}
          />
        ) : undefined
      }
    >
      {steps ? (
        <ProvisioningTimeline steps={steps} failureCode={record.bootstrapFailureCode} />
      ) : (
        <EmptyState
          title="Provisioning isn't tracked for this institution"
          description="It was set up before the platform recorded onboarding steps."
        />
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 9: Delete the old detail page and its test**

`git rm 'app/(authenticated)/platform-admin/tenants/[tenantId]/page.tsx' 'app/(authenticated)/platform-admin/tenants/[tenantId]/page.test.tsx'`

The directory (Task 6) and the overview still read through the old module service until Task 6, so
this commit builds as it stands.

- [ ] **Step 10: Run the tests and the affected E2E**

Run (form T) on `modules/platform-administration/tenants`. Expected: PASS.

Run (form E) on `e2e/platform-administration.spec.ts e2e/context.spec.ts`. Expected: PASS. Both open
Acme's record: the hero's h1 is "Acme SACCO", and `getByText('COMPLETED')` matches the Overview's
"Completed" provisioning chip, because Playwright's string match ignores case. Leave that assertion
as it is.

- [ ] **Step 11: Commit** (form C)

`git add 'app/(authenticated)/platform-admin/tenants/[tenantId]' modules/platform-administration/tenants/components`

```
feat(platform): add the institution record with lifecycle actions and provisioning

The record's hero offers each lifecycle action by status and permission: bodiless confirmations
for submit and approve, required reasons for reject, suspend and deprovision (which also needs the
tenant code typed back), and an optional one for reactivate. The Overview tab shows what the
platform returns. The Provisioning tab shows the bootstrap timeline, its failure code and Retry
bootstrap. The reserved platform organisation's record is a 404 (BG-29).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 6: The institution directory, the overview's count, and the old tenant code retired

Skills: `frontend-design`, `ui-ux-pro-max`.

**Files** (`P` = `app/(authenticated)/platform-admin`, `M` = `modules/platform-administration`):

- Modify (full replacement): `P/tenants/page.tsx`, `P/page.tsx`, `P/page.test.tsx`
- Create: `M/tenants/components/tenant-directory-table.tsx`,
  `M/tenants/components/tenant-directory-table.test.tsx`
- Modify (tenant parts removed): `M/platform-administration.types.ts`,
  `M/platform-administration-mappers.ts` (+ test), `M/platform-administration-queries.ts` (+ test),
  `M/platform-administration-service.ts` (+ test)
- Delete: `M/components/tenant-table.tsx`, `M/components/platform-pagination.tsx`,
  `M/components/platform-status-chip.tsx` (each with its test), `P/tenants/page.test.tsx`
- Modify: `e2e/platform-administration.spec.ts` (two assertions and a comment, Ruling 17)

**Interfaces:**

- Consumes: Task 1 `parseTenantListQuery`, `hasTenantFilters`, `DEFAULT_TENANT_SORT`,
  `TENANT_STATUSES`, `type TenantSummary`, `type TenantSortField`, `countryName`, `countryOptions`,
  `visibleTenantTotal`; Task 2 `listTenants`; 08's `ListToolbar({ fields, resultLabel, chips?,
timeZone })` with the `search`, `select` and `datetime` (`endOfMinute`) kinds; `TablePaginationBar({
page })`, `ListNavigationProvider`, `ListNavigationProgress`, `ListBusyRegion`, `humanizeEnum`,
  `TruncatedText({ value, maxWidth })`, `LinkPendingIndicator`, `lastPageIfPastEnd(page)`,
  `hrefWith(pathname, params, changes)`, `toSearchParams(record)`, `canAll(holder, codes)`.
- Produces: `TenantDirectoryTable({ tenants, sort, sortHref })` (a Server Component; `sortHref`
  never crosses to the client). The module root keeps only the tenant branch and user reads for 17:
  `platformAdministrationService` has `getTenantBranch`, `getTenantUser`, `listTenantBranches` and
  `listTenantUsers`.

- [ ] **Step 1: Write the failing table and overview tests**

`M/tenants/components/tenant-directory-table.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { TenantSummary } from '../tenant-contract';
import { TenantDirectoryTable } from './tenant-directory-table';

const LONG =
  'Nairobi Metropolitan Public Service Teachers and Allied Workers Savings and Credit Co-op Society Ltd';
const TENANTS: TenantSummary[] = [
  {
    id: '16000000-0000-4000-8000-000000000005',
    tenantCode: 'kilimo-bora',
    displayName: 'Kilimo Bora SACCO',
    countryCode: 'KE',
    status: 'SUSPENDED',
    createdAt: '2026-08-10T08:00:00Z',
  },
  {
    id: '16000000-0000-4000-8000-000000000006',
    tenantCode: 'nairobi-metro-teachers',
    displayName: LONG,
    countryCode: 'TZ',
    status: 'REJECTED',
    createdAt: '2026-08-01T08:00:00Z',
  },
];

describe('TenantDirectoryTable', () => {
  it('links each institution and every sortable header, and marks the sorted column', () => {
    renderWithProviders(
      <TenantDirectoryTable
        tenants={TENANTS}
        sort={{ by: 'displayName', dir: 'ASC' }}
        sortHref={(field) => `/sort/${field}`}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Institution' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    for (const [label, field] of [
      ['Institution', 'displayName'],
      ['Code', 'tenantCode'],
      ['Country', 'countryCode'],
      ['Created (UTC)', 'createdAt'],
    ] as const) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', `/sort/${field}`);
    }
    // Status isn't in the sort allow-list, and an unknown sort_by is a backend 500 (BG-07).
    expect(
      within(screen.getByRole('columnheader', { name: 'Lifecycle' })).queryByRole('link'),
    ).toBeNull();
    expect(screen.getByRole('link', { name: 'Kilimo Bora SACCO' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants/16000000-0000-4000-8000-000000000005',
    );
    expect(screen.getByText('Suspended')).toBeInTheDocument();
    expect(screen.getByText('10 Aug 2026')).toBeInTheDocument();
  });

  it('keeps a long name and the country on one line, with the full value in title (index item 4)', () => {
    renderWithProviders(
      <TenantDirectoryTable
        tenants={TENANTS}
        sort={{ by: 'createdAt', dir: 'DESC' }}
        sortHref={() => '/'}
      />,
    );

    expect(screen.getByRole('link', { name: LONG })).toHaveAttribute('title', LONG);
    expect(screen.getByText('TZ · Tanzania')).toHaveAttribute('title', 'TZ · Tanzania');
  });
});
```

`P/page.test.tsx`, in full (the old one pinned the echoed `error.message` and the URL query, both
gone; Step 5 replaces the page):

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendApiError } from '@/auth/backend-api';
import { renderWithProviders, screen } from '@/test/test-utils';

const { getCurrentContextProfile, listTenants } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  listTenants: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: (...args: unknown[]) => getCurrentContextProfile(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/tenants/tenant-service', () => ({
  listTenants: (...args: unknown[]) => listTenants(...args) as unknown,
}));

const { default: PlatformOverviewPage } = await import('./page');

const directory = (totalItems: number) => ({
  items: [],
  page: {
    number: 0,
    size: 1,
    totalItems,
    totalPages: totalItems,
    hasNext: totalItems > 1,
    hasPrevious: false,
  },
});

describe('PlatformOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentContextProfile.mockResolvedValue({
      context: {
        branch: { id: 'branch-1', name: 'Platform HQ' },
        module: { id: 'platform-administration', name: 'Platform Administration' },
        organization: { id: 'platform-org-1', name: 'Finaxis Platform' },
      },
      kind: 'resolved',
    });
  });

  it('counts the institutions from one size-1 read, leaving out the platform organisation (BG-29)', async () => {
    listTenants.mockResolvedValueOnce(directory(2));
    renderWithProviders(await PlatformOverviewPage());

    expect(
      screen.getByRole('heading', { level: 1, name: 'Platform overview' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Finaxis Platform')).toBeInTheDocument();
    expect(screen.getByText('Platform HQ')).toBeInTheDocument();
    expect(screen.getByText('1 tenant is available from the live directory.')).toBeInTheDocument();
    expect(listTenants).toHaveBeenCalledWith({
      sort: { by: 'createdAt', dir: 'DESC' },
      page: 0,
      size: 1,
    });
    expect(screen.getByRole('link', { name: 'Open tenant directory' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants',
    );
  });

  it('says the directory is empty when only the platform organisation exists', async () => {
    listTenants.mockResolvedValueOnce(directory(1));
    renderWithProviders(await PlatformOverviewPage());

    expect(
      screen.getByText('No tenants are available in the live directory yet.'),
    ).toBeInTheDocument();
  });

  it('renders the safe error state with its reference, keeping the directory link', async () => {
    listTenants.mockRejectedValueOnce(new BackendApiError(503, { requestId: 'req-9' }));
    renderWithProviders(await PlatformOverviewPage());

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Reference: req-9')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open tenant directory' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants',
    );
  });
});
```

- [ ] **Step 2: Run them**

Run (form T) on `modules/platform-administration/tenants/components/tenant-directory-table.test.tsx 'app/(authenticated)/platform-admin/page.test.tsx'`.
Expected: FAIL. The table module doesn't exist yet, and every overview test rejects with a
TypeError before any read: the old page still destructures `{ searchParams }` from its props, and
the new test calls it with none.

- [ ] **Step 3: Implement `M/tenants/components/tenant-directory-table.tsx`**

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
import { TruncatedText } from '@/components/data-display/truncated-text';
import type { ListSort } from '@/lib/api/list-sort';
import { formatInstant } from '@/lib/format';
import type { TenantSortField, TenantSummary } from '../tenant-contract';
import { countryName } from '../tenant-rules';

/** `null`: not sortable. Status isn't in the backend's allow-list (an unknown sort_by is a 500). */
const COLUMNS: readonly { field: TenantSortField | null; label: string }[] = [
  { field: 'displayName', label: 'Institution' },
  { field: 'tenantCode', label: 'Code' },
  { field: 'countryCode', label: 'Country' },
  { field: null, label: 'Lifecycle' },
  { field: 'createdAt', label: 'Created (UTC)' },
];

interface TenantDirectoryTableProps {
  tenants: readonly TenantSummary[];
  sort: ListSort<TenantSortField>;
  /** Server Component: this function prop never crosses to the client — keep it that way. */
  sortHref: (field: TenantSortField) => string;
}

/** The institution directory (spec §11.1): every sortable header is a server-built sort link. */
export function TenantDirectoryTable({ tenants, sort, sortHref }: TenantDirectoryTableProps) {
  return (
    <TableContainer sx={{ maxHeight: { md: 'calc(100dvh - 300px)' }, minHeight: 240 }}>
      <Table stickyHeader aria-label="Institutions" sx={{ minWidth: 760 }}>
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
          {tenants.map((tenant) => (
            // No row hover: only the name links (08's V5).
            <TableRow key={tenant.id}>
              <TableCell>
                <Link
                  component={NextLink}
                  href={`/platform-admin/tenants/${tenant.id}`}
                  variant="body2"
                  noWrap
                  title={tenant.displayName}
                  sx={{ display: 'block', maxWidth: 320, fontWeight: 700 }}
                >
                  {tenant.displayName}
                  <LinkPendingIndicator />
                </Link>
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {tenant.tenantCode}
                </Typography>
              </TableCell>
              <TableCell>
                <TruncatedText
                  value={`${tenant.countryCode} · ${countryName(tenant.countryCode)}`}
                  maxWidth={200}
                />
              </TableCell>
              <TableCell>
                <StatusChip value={tenant.status} />
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {formatInstant(tenant.createdAt, 'UTC').date}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
```

- [ ] **Step 4: Replace `P/tenants/page.tsx`**

```tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import AddOutlined from '@mui/icons-material/AddOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can, canAll } from '@/auth/permissions';
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
import { isPlatformOrganisation } from '@/config/application-context';
import { load } from '@/lib/api/load';
import { lastPageIfPastEnd } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import { TenantDirectoryTable } from '@/modules/platform-administration/tenants/components/tenant-directory-table';
import { TENANT_STATUSES } from '@/modules/platform-administration/tenants/tenant-contract';
import {
  hasTenantFilters,
  parseTenantListQuery,
} from '@/modules/platform-administration/tenants/tenant-query';
import {
  countryName,
  countryOptions,
  visibleTenantTotal,
} from '@/modules/platform-administration/tenants/tenant-rules';
import { listTenants } from '@/modules/platform-administration/tenants/tenant-service';

export const metadata: Metadata = { title: 'SACCO institutions' };

const PATH = '/platform-admin/tenants';

interface TenantDirectoryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TenantDirectoryPage({ searchParams }: TenantDirectoryPageProps) {
  const params = toSearchParams(await searchParams);
  const query = parseTenantListQuery(params);
  const selected = await getCurrentContextProfile();
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };

  const header = (
    <PageHeader
      eyebrow="Platform administration"
      title="SACCO institutions"
      description="Create, approve, monitor, suspend or deprovision tenant organisations."
      actions={
        // The code pre-check and the redirect after create both read the directory (BG-31).
        canAll(holder, ['tenant.create', 'tenant.view']) ? (
          <Button
            component={NextLink}
            href={`${PATH}/new`}
            variant="contained"
            startIcon={<AddOutlined />}
          >
            Create tenant draft
          </Button>
        ) : undefined
      }
    />
  );

  if (!can(holder, 'tenant.view')) {
    return (
      <>
        {header}
        <Paper>
          <ForbiddenState />
        </Paper>
      </>
    );
  }

  const tenants = await load(listTenants(query));
  if (!tenants.ok) {
    return (
      <>
        {header}
        <Paper>
          <ErrorState problem={tenants.problem} />
        </Paper>
      </>
    );
  }

  const redirectPage = lastPageIfPastEnd(tenants.value.page);
  if (redirectPage !== null) {
    redirect(hrefWith(PATH, params, { page: redirectPage === 0 ? null : String(redirectPage) }));
  }

  // BG-29: the list includes the reserved platform organisation, which is no institution.
  const rows = tenants.value.items.filter((tenant) => !isPlatformOrganisation(tenant.id));
  const filtered = hasTenantFilters(query);
  const total = visibleTenantTotal(
    tenants.value.page.totalItems,
    filtered,
    rows.length < tenants.value.items.length,
  );
  // A country from the URL is applied, so it must stay selectable (not render as "All").
  const countries = countryOptions();
  if (query.country && !countries.some((option) => option.value === query.country)) {
    countries.unshift({ value: query.country, label: countryName(query.country) });
  }

  return (
    <>
      {header}
      <ListNavigationProvider>
        <Paper sx={{ overflow: 'hidden', position: 'relative' }}>
          <ListToolbar
            timeZone="UTC"
            resultLabel={`${total} ${total === 1 ? 'institution' : 'institutions'}`}
            fields={[
              { kind: 'search', name: 'q', label: 'Search', placeholder: 'Code or name' },
              {
                kind: 'select',
                name: 'status',
                label: 'Status',
                allLabel: 'All statuses',
                options: TENANT_STATUSES.map((status) => ({
                  value: status,
                  label: humanizeEnum(status),
                })),
              },
              {
                kind: 'select',
                name: 'country',
                label: 'Country',
                allLabel: 'All countries',
                options: countries,
              },
              { kind: 'datetime', name: 'createdFrom', label: 'Created from' },
              { kind: 'datetime', name: 'createdTo', label: 'Created to', endOfMinute: true },
            ]}
          />
          <ListNavigationProgress />
          <ListBusyRegion>
            {rows.length === 0 ? (
              <EmptyState
                title="No institutions"
                description={
                  filtered
                    ? 'No institutions match these filters.'
                    : 'No institutions have been created yet.'
                }
              />
            ) : (
              <TenantDirectoryTable
                tenants={rows}
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
            <TablePaginationBar page={tenants.value.page} />
          </ListBusyRegion>
        </Paper>
      </ListNavigationProvider>
    </>
  );
}
```

- [ ] **Step 5: Replace the overview's data call** (Ruling 3)

`P/page.tsx`, in full. The layout, both cards and the h1 are unchanged. Only the read (one `size=1`
`listTenants` through `load()`), the BG-29 count and the error branch change:

```tsx
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';
import { getCurrentContextProfile } from '@/auth/context-service';
import { ErrorState } from '@/components/data-display/error-state';
import { load } from '@/lib/api/load';
import { PlatformPageShell } from '@/modules/platform-administration/components/platform-page-shell';
import { platformAdministrationModule } from '@/modules/platform-administration/platform-administration-module';
import { DEFAULT_TENANT_SORT } from '@/modules/platform-administration/tenants/tenant-query';
import { visibleTenantTotal } from '@/modules/platform-administration/tenants/tenant-rules';
import { listTenants } from '@/modules/platform-administration/tenants/tenant-service';

export const metadata: Metadata = { title: 'Platform Overview' };

function describeTenantDirectoryState(totalItems: number): string {
  if (totalItems === 0) {
    return 'No tenants are available in the live directory yet.';
  }

  return `${totalItems} tenant${totalItems === 1 ? ' is' : 's are'} available from the live directory.`;
}

export default async function PlatformOverviewPage() {
  const selectedContext = await getCurrentContextProfile();

  if (selectedContext.kind !== 'resolved') {
    redirect('/select-context');
  }

  if (selectedContext.context.module.id !== platformAdministrationModule.id) {
    redirect('/admin');
  }

  // Only the count is shown, so one row is enough (BG-15: no aggregate counts).
  const directory = await load(listTenants({ sort: DEFAULT_TENANT_SORT, page: 0, size: 1 }));

  return (
    <PlatformPageShell
      title="Platform overview"
      description="Confirm the active platform context and move into the live read-only workspaces."
    >
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="overline" color="text.secondary">
                  Active platform context
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {selectedContext.context.organization.name}
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Typography color="text.secondary" variant="body2">
                    Branch:
                  </Typography>
                  <Typography variant="body2">
                    {selectedContext.context.branch?.name ?? 'All branches'}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Typography color="text.secondary" variant="body2">
                    Module:
                  </Typography>
                  <Typography variant="body2">{selectedContext.context.module.name}</Typography>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="overline" color="text.secondary">
                  Tenant operations
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Live tenant directory
                </Typography>
                {directory.ok ? (
                  <Typography color="text.secondary" variant="body2">
                    {describeTenantDirectoryState(
                      // BG-29: the total includes the reserved platform organisation.
                      visibleTenantTotal(directory.value.page.totalItems, false, false),
                    )}
                  </Typography>
                ) : (
                  <ErrorState problem={directory.problem} />
                )}
              </Stack>
            </CardContent>
            <CardActions>
              <Button component={NextLink} href="/platform-admin/tenants" size="small">
                Open tenant directory
              </Button>
            </CardActions>
          </Card>
        </Grid>
      </Grid>
    </PlatformPageShell>
  );
}
```

Step 1 already replaced `P/page.test.tsx`; Step 9 runs it green.

- [ ] **Step 6: Remove the tenant parts from the module root** (Ruling 2)

Each change below only deletes tenant code; the user and branch code stays byte-identical.

- `M/platform-administration.types.ts`: delete `TenantSummary`, `TenantDetail` and
  `TenantListQuery`.
- `M/platform-administration-mappers.ts`: delete `RawTenant`, `mapTenant`, `mapTenantPage` and
  `mapTenantDetail`, and drop `TenantDetail` and `TenantSummary` from the type import.
- `M/platform-administration-mappers.test.ts`: drop `mapTenantDetail` and `mapTenantPage` from the
  import; in the second test, delete the `expect(mapTenantDetail({…}).bootstrapFailureCode)
.toBeNull();` statement; replace the first test with:

  ```ts
  it('maps snake_case page metadata and user fields to camelCase DTOs', () => {
    expect(
      mapTenantUserPage({
        items: [
          {
            id: 'user-id',
            username: 'user',
            email: 'user@example.test',
            display_name: 'User',
            user_status: 'ACTIVE',
            membership_status: 'ACTIVE',
          },
        ],
        page: {
          number: 0,
          size: 25,
          total_items: 1,
          total_pages: 1,
          has_next: false,
          has_previous: false,
        },
      }),
    ).toEqual({
      items: [
        {
          id: 'user-id',
          username: 'user',
          email: 'user@example.test',
          displayName: 'User',
          userStatus: 'ACTIVE',
          membershipStatus: 'ACTIVE',
        },
      ],
      page: {
        number: 0,
        size: 25,
        totalItems: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    });
  });
  ```

- `M/platform-administration-queries.ts`: delete `parseTenantListQuery` and
  `safeParseTenantListQuery`, and drop `TenantListQuery` from the type import.
- `M/platform-administration-queries.test.ts`: drop `parseTenantListQuery` from the import; delete
  the first test ("applies safe pagination defaults and preserves supported tenant filters"); in
  "bounds pagination and rejects malformed pagination values", replace each `parseTenantListQuery`
  with `parseBranchListQuery` (the same `parsePage`/`parseSize` bounds).
- `M/platform-administration-service.ts`: delete `listTenants` and `getTenant`, and drop
  `TenantDetail`, `TenantListQuery`, `TenantSummary`, `mapTenantDetail` and `mapTenantPage` from the
  imports.
- `M/platform-administration-service.test.ts`:
  - delete the first test ("reads tenants through the platform endpoint…");
  - replace "reads related tenant resources with the context token" with:

    ```ts
    it('reads tenant users with the context token', async () => {
      await platformAdministrationService.listTenantUsers(
        headers,
        '11111111-1111-1111-1111-111111111111',
        { q: 'smith', userStatus: 'ACTIVE', page: 1, size: 10, membershipStatus: 'ACTIVE' },
      );

      expect(backendApi.get).toHaveBeenCalledWith(
        '/api/v1/platform/tenants/11111111-1111-1111-1111-111111111111/users?q=smith&user_status=ACTIVE&membership_status=ACTIVE&page=1&size=10',
        headers,
        'signed-context',
      );
    });
    ```

  - replace "rejects invalid identifiers and missing context before a backend call" with:

    ```ts
    it('rejects a missing context before a backend call', async () => {
      readContextToken.mockResolvedValueOnce(null);
      await expect(
        platformAdministrationService.getTenantUser(
          headers,
          '11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222',
        ),
      ).rejects.toThrow('selected platform context');
      expect(backendApi.get).not.toHaveBeenCalled();
    });
    ```

  - in "exposes only read methods for Stage 1", expect
    `['getTenantBranch', 'getTenantUser', 'listTenantBranches', 'listTenantUsers']`.

- [ ] **Step 7: Delete the retired components and the obsolete page test** (Ruling 18)

`git rm modules/platform-administration/components/tenant-table.tsx modules/platform-administration/components/tenant-table.test.tsx modules/platform-administration/components/platform-pagination.tsx modules/platform-administration/components/platform-pagination.test.tsx modules/platform-administration/components/platform-status-chip.tsx modules/platform-administration/components/platform-status-chip.test.tsx 'app/(authenticated)/platform-admin/tenants/page.test.tsx'`

Then `grep -rn "platform-pagination\|platform-status-chip\|tenant-table\|safeParseTenantListQuery\|mapTenantPage" app modules components`
prints nothing. (AGENTS.md's mention of `platform-pagination.tsx` goes in Task 8.)

- [ ] **Step 8: Update `e2e/platform-administration.spec.ts`** (Ruling 17)

- In the first test's comment, replace "(and its imports — TenantTable,
  platformAdministrationService, …)" with "(and its imports — TenantDirectoryTable, the tenant
  service, …)".
- `name: 'Tenant directory'` becomes `name: 'SACCO institutions'` in the h1 assertion.
- Replace `await expect(page.getByRole('navigation', { name: 'pagination navigation' })).toBeVisible();`
  with `await expect(page.getByRole('button', { name: 'Go to next page' })).toBeVisible();` (the
  kit's `TablePaginationBar`; disabled on a single page, still visible).

Nothing else in the file changes.

- [ ] **Step 9: Run the tests and the affected E2E**

Run (form T) on `modules/platform-administration 'app/(authenticated)/platform-admin'`. Expected: PASS.

Run (form E) on `e2e/platform-administration.spec.ts e2e/shell.spec.ts`. Expected: PASS. The shell
spec's axe targets include `/platform-admin`, whose h1 "Platform overview" stays.

- [ ] **Step 10: Commit** (form C)

`git add 'app/(authenticated)/platform-admin/page.tsx' 'app/(authenticated)/platform-admin/page.test.tsx' 'app/(authenticated)/platform-admin/tenants/page.tsx' modules/platform-administration e2e/platform-administration.spec.ts`

```
feat(platform): rebuild the institution directory on the list kit

The directory searches, filters by status, country and creation time, and sorts four columns
through the URL, with server pagination. It hides the reserved platform organisation and leaves
it out of the counts (BG-29). The overview reads its count the same way and renders the safe error
state. The old tenant table, pagination, status chip and tenant mappers are removed; the tenant
user and branch reads stay for layer 17.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 7: The tenant draft wizard, and the create and amend pages

Skills: `frontend-design`, `ui-ux-pro-max`. Read the `server-actions.md` guide from pre-flight
note 8 first (`redirect` in an action).

**Files:**

- Create: `modules/platform-administration/tenants/components/tenant-draft-wizard.tsx`,
  `modules/platform-administration/tenants/components/tenant-draft-wizard.test.tsx`
- Create: `app/(authenticated)/platform-admin/tenants/new/page.tsx`
- Create: `app/(authenticated)/platform-admin/tenants/[tenantId]/amend/page.tsx` (outside `(record)`,
  so it renders without the hero)

**Interfaces:**

- Consumes: Task 1 `tenantDraftSchema`, `EMPTY_TENANT_DRAFT`, `tenantFormOptions(current?)`,
  `type TenantDraftValues`, `type TenantFormOptions`, `type TenantOption`; Task 2
  `createTenantDraft`, `amendTenantDraft`, `getTenant`; Task 4 `WizardForm`, `type WizardStep`;
  `applyFieldErrors(setError, fieldErrors, fields)`, `isoToBusinessDate`,
  `formatBusinessDate(value, 'long')`, `SectionCard`, `DescriptionList`, `ForbiddenState`,
  `ErrorState`, `PageHeader`, `canAll`, `isPlatformOrganisation`, `UUID_PATTERN`; React Hook Form
  7.88 (`useForm`, `Controller`, `trigger(names, { shouldFocus })`, `getValues`, `setError`) with
  `zodResolver` (`@hookform/resolvers` 5).
- Produces: `TenantDraftWizard({ tenantId?, defaults, options, contextOrganisationId? })`, a client
  component. Create mode has four steps; amend mode (`tenantId` set) has three, with the code
  read-only and no business date or settings. The routes `/platform-admin/tenants/new` and
  `/platform-admin/tenants/[tenantId]/amend`.

- [ ] **Step 1: Write the failing wizard test**

`modules/platform-administration/tenants/components/tenant-draft-wizard.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { UUID_PATTERN } from '@/lib/api/wire';
import { EMPTY_TENANT_DRAFT, type TenantFormOptions } from '../tenant-rules';
import { TenantDraftWizard } from './tenant-draft-wizard';

const { amendTenantDraft, createTenantDraft } = vi.hoisted(() => ({
  amendTenantDraft: vi.fn(),
  createTenantDraft: vi.fn(),
}));
vi.mock('../tenant-actions', () => ({
  amendTenantDraft: (...args: unknown[]) => amendTenantDraft(...args) as unknown,
  createTenantDraft: (...args: unknown[]) => createTenantDraft(...args) as unknown,
}));

type User = ReturnType<typeof userEvent.setup>;

const ORG_ID = '00000000-0000-0000-0000-000000000000';
const TENANT = '16000000-0000-4000-8000-000000000001';
const OPTIONS: TenantFormOptions = {
  countries: [
    { value: 'KE', label: 'Kenya' },
    { value: 'UG', label: 'Uganda' },
  ],
  currencies: [{ value: 'KES', label: 'KES · Kenyan Shilling' }],
  timeZones: [{ value: 'Africa/Nairobi', label: 'Africa/Nairobi' }],
};

async function pick(user: User, label: string, option: string) {
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
}

async function next(user: User, step: string) {
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('heading', { level: 2, name: step });
}

async function fillAdministrator(user: User) {
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'amina@tujenge.example');
  await user.type(screen.getByRole('textbox', { name: 'Username' }), 'amina.otieno');
  await user.type(screen.getByRole('textbox', { name: 'Full name' }), 'Amina Otieno');
  await user.type(screen.getByRole('textbox', { name: 'Phone' }), '+254712000140');
}

describe('TenantDraftWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("summarises a step's invalid fields and focuses the first one", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TenantDraftWizard defaults={EMPTY_TENANT_DRAFT} options={OPTIONS} />);

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText(
        'Check these fields: Tenant code, Display name, Country, Base currency, Timezone.',
      ),
    ).toBeInTheDocument();
    const code = screen.getByRole('textbox', { name: 'Tenant code' });
    expect(code).toHaveFocus();
    expect(code).toHaveAccessibleDescription('Use 3–32 lowercase letters, digits or hyphens.');
    expect(createTenantDraft).not.toHaveBeenCalled();
  });

  it('walks every step, returns to a taken code, and retries the create with the same key', async () => {
    const user = userEvent.setup();
    createTenantDraft
      .mockResolvedValueOnce({
        ok: false,
        formError: 'This tenant code is already in use. Choose another.',
        fieldErrors: { tenantCode: 'This code is already in use.' },
        code: 'tenant_code_taken',
        requestId: null,
      })
      .mockResolvedValueOnce({
        ok: false,
        formError: "The platform didn't respond as expected. Try again in a moment.",
        fieldErrors: {},
        code: null,
        requestId: 'req-5',
      });
    renderWithProviders(
      <TenantDraftWizard
        defaults={EMPTY_TENANT_DRAFT}
        options={OPTIONS}
        contextOrganisationId={ORG_ID}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: 'Tenant code' }), 'acme');
    await user.type(screen.getByRole('textbox', { name: 'Display name' }), 'Tujenge Traders SACCO');
    await pick(user, 'Country', 'Kenya');
    await pick(user, 'Base currency', 'KES · Kenyan Shilling');
    await pick(user, 'Timezone', 'Africa/Nairobi');
    await next(user, 'First administrator');
    await fillAdministrator(user);
    await user.click(screen.getByRole('checkbox', { name: 'Send application invite' }));
    await next(user, 'Initial settings');
    await user.type(screen.getByRole('textbox', { name: 'Audit retention (days)' }), '365');
    await next(user, 'Review');
    expect(screen.getByRole('region', { name: 'Institution' })).toHaveTextContent('Kenya');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    // BG-07: the pre-check's refusal returns the wizard to the code, focused.
    const code = await screen.findByRole('textbox', { name: 'Tenant code' });
    await waitFor(() => {
      expect(code).toHaveFocus();
    });
    expect(code).toHaveAccessibleDescription('This code is already in use.');
    expect(Object.fromEntries(createTenantDraft.mock.calls[0]?.[1] as FormData)).toEqual({
      idempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown,
      contextOrganisationId: ORG_ID,
      tenantCode: 'acme',
      displayName: 'Tujenge Traders SACCO',
      legalName: '',
      registrationNumber: '',
      countryCode: 'KE',
      baseCurrencyCode: 'KES',
      timezone: 'Africa/Nairobi',
      businessDate: '',
      adminEmail: 'amina@tujenge.example',
      adminUsername: 'amina.otieno',
      adminDisplayName: 'Amina Otieno',
      adminPhone: '+254712000140',
      adminSendApplicationInvite: 'true',
      defaultTimezoneSetting: '',
      baseCurrencySetting: '',
      auditRetentionDays: '365',
    });

    await user.clear(code);
    await user.type(code, 'tujenge-traders');
    await next(user, 'First administrator');
    await next(user, 'Initial settings');
    await next(user, 'Review');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    // Nothing to return to: the failure's Alert takes focus, with its reference.
    const failed = (await screen.findByText(/Reference: req-5/)).closest('[role="alert"]');
    await waitFor(() => {
      expect(failed).toHaveFocus();
    });
    const [first, second] = createTenantDraft.mock.calls.map((call) => call[1] as FormData);
    // One key per wizard: the retry replays safely (index item 2).
    expect(second?.get('idempotencyKey')).toBe(first?.get('idempotencyKey'));
    expect(second?.get('tenantCode')).toBe('tujenge-traders');
  });

  it('amends in three steps, with the code read-only and no business date or settings', async () => {
    const user = userEvent.setup();
    amendTenantDraft.mockResolvedValueOnce({ ok: true });
    renderWithProviders(
      <TenantDraftWizard
        tenantId={TENANT}
        defaults={{
          ...EMPTY_TENANT_DRAFT,
          tenantCode: 'umoja-teachers',
          displayName: 'Umoja Teachers SACCO',
          countryCode: 'KE',
          baseCurrencyCode: 'KES',
          timezone: 'Africa/Nairobi',
        }}
        options={OPTIONS}
      />,
    );

    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('textbox', { name: 'Tenant code' })).toHaveAttribute('readonly');
    expect(screen.queryByLabelText('First business date')).toBeNull();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${TENANT}`,
    );

    await next(user, 'First administrator');
    await fillAdministrator(user);
    await next(user, 'Review');
    expect(screen.queryByRole('region', { name: 'Initial settings' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      expect(amendTenantDraft).toHaveBeenCalledTimes(1);
    });
    const sent = amendTenantDraft.mock.calls[0]?.[1] as FormData;
    expect(sent.get('tenantId')).toBe(TENANT);
    expect(sent.get('tenantCode')).toBe('umoja-teachers');
    expect(sent.has('businessDate')).toBe(false);
    expect(sent.has('auditRetentionDays')).toBe(false);
    expect(createTenantDraft).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it**

Run (form T) on `modules/platform-administration/tenants/components/tenant-draft-wizard.test.tsx`.
Expected: FAIL (the module doesn't exist yet).

- [ ] **Step 3: Implement `tenant-draft-wizard.tsx`**

```tsx
'use client';

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';
import { unstable_rethrow } from 'next/navigation';
import { Controller, useForm, type Control, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import { DescriptionList } from '@/components/data-display/description-list';
import { SectionCard } from '@/components/data-display/section-card';
import { WizardForm, type WizardStep } from '@/components/data-display/wizard-form';
import type { ActionResult } from '@/lib/api/action-result';
import { applyFieldErrors } from '@/lib/apply-field-errors';
import { isoToBusinessDate } from '@/lib/business-date';
import { formatBusinessDate } from '@/lib/format';
import { amendTenantDraft, createTenantDraft } from '../tenant-actions';
import {
  tenantDraftSchema,
  type TenantDraftValues,
  type TenantFormOptions,
  type TenantOption,
} from '../tenant-rules';

type FieldName = keyof TenantDraftValues;
type OptionName =
  | 'countryCode'
  | 'baseCurrencyCode'
  | 'timezone'
  | 'defaultTimezoneSetting'
  | 'baseCurrencySetting';

interface DraftStep extends WizardStep {
  fields: readonly FieldName[];
}

const INSTITUTION: DraftStep = {
  label: 'Institution',
  helper: 'Identity, locale and the first business date',
  fields: [
    'tenantCode',
    'displayName',
    'legalName',
    'registrationNumber',
    'countryCode',
    'baseCurrencyCode',
    'timezone',
    'businessDate',
  ],
};
const ADMINISTRATOR: DraftStep = {
  label: 'First administrator',
  helper: 'Invited when the institution is approved',
  fields: [
    'adminEmail',
    'adminUsername',
    'adminDisplayName',
    'adminPhone',
    'adminSendApplicationInvite',
  ],
};
const SETTINGS: DraftStep = {
  label: 'Initial settings',
  helper: 'Optional settings stored with the draft',
  fields: ['defaultTimezoneSetting', 'baseCurrencySetting', 'auditRetentionDays'],
};
const REVIEW: DraftStep = {
  label: 'Review',
  helper: 'Check everything before you save',
  fields: [],
};

const CREATE_STEPS: readonly DraftStep[] = [INSTITUTION, ADMINISTRATOR, SETTINGS, REVIEW];
// Amend ignores the business date and the settings (contract §D), so it never asks for them.
const AMEND_STEPS: readonly DraftStep[] = [
  {
    ...INSTITUTION,
    helper: 'Identity and locale',
    fields: INSTITUTION.fields.filter((name) => name !== 'businessDate'),
  },
  ADMINISTRATOR,
  REVIEW,
];
const CREATE_FIELDS = CREATE_STEPS.flatMap((step) => step.fields);
const AMEND_FIELDS = AMEND_STEPS.flatMap((step) => step.fields);

const LABELS: Record<FieldName, string> = {
  tenantCode: 'Tenant code',
  displayName: 'Display name',
  legalName: 'Legal name',
  registrationNumber: 'Registration number',
  countryCode: 'Country',
  baseCurrencyCode: 'Base currency',
  timezone: 'Timezone',
  businessDate: 'First business date',
  adminEmail: 'Email',
  adminUsername: 'Username',
  adminDisplayName: 'Full name',
  adminPhone: 'Phone',
  adminSendApplicationInvite: 'Send application invite',
  defaultTimezoneSetting: 'Default timezone setting',
  baseCurrencySetting: 'Base currency setting',
  auditRetentionDays: 'Audit retention (days)',
};

// Mirrors ReasonDialog's and 08's draft form: never `caught.message`.
const SUBMIT_FAILED =
  "We couldn't confirm this change. Try again; it's safe to retry. If it keeps failing, reload the page.";

const firstStepWith = (steps: readonly DraftStep[], invalid: (name: FieldName) => boolean) =>
  steps.findIndex((step) => step.fields.some(invalid));

interface OptionFieldProps {
  control: Control<TenantDraftValues>;
  name: OptionName;
  options: readonly TenantOption[];
  required?: boolean;
  hint?: string;
}

/** A choice from the server-built list, so SSR and hydration render the same options. */
function OptionField({ control, name, options, required = false, hint }: OptionFieldProps) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Autocomplete
          options={options}
          value={options.find((option) => option.value === field.value) ?? null}
          onChange={(_event, option) => {
            field.onChange(option?.value ?? '');
          }}
          getOptionLabel={(option) => option.label}
          isOptionEqualToValue={(option, selected) => option.value === selected.value}
          renderInput={(params) => (
            <TextField
              {...params}
              label={LABELS[name]}
              required={required}
              inputRef={field.ref}
              onBlur={field.onBlur}
              error={Boolean(fieldState.error)}
              helperText={fieldState.error?.message ?? hint}
            />
          )}
        />
      )}
    />
  );
}

const labelOf = (options: readonly TenantOption[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

interface TenantDraftReviewProps {
  values: TenantDraftValues;
  options: TenantFormOptions;
  steps: readonly DraftStep[];
  onEdit: (step: number) => void;
}

/** The review step: every answer by step, each step with a way back to it. */
function TenantDraftReview({ values, options, steps, onEdit }: TenantDraftReviewProps) {
  const businessDate = isoToBusinessDate(values.businessDate);
  const shown: Record<FieldName, string> = {
    tenantCode: values.tenantCode,
    displayName: values.displayName,
    legalName: values.legalName || 'Not set',
    registrationNumber: values.registrationNumber || 'Not set',
    countryCode: labelOf(options.countries, values.countryCode),
    baseCurrencyCode: labelOf(options.currencies, values.baseCurrencyCode),
    timezone: values.timezone,
    businessDate: businessDate
      ? formatBusinessDate(businessDate, 'long')
      : "Today in the institution's timezone",
    adminEmail: values.adminEmail,
    adminUsername: values.adminUsername,
    adminDisplayName: values.adminDisplayName,
    adminPhone: values.adminPhone,
    adminSendApplicationInvite: values.adminSendApplicationInvite === 'true' ? 'Yes' : 'No',
    defaultTimezoneSetting: values.defaultTimezoneSetting || 'Not set',
    baseCurrencySetting: values.baseCurrencySetting
      ? labelOf(options.currencies, values.baseCurrencySetting)
      : 'Not set',
    auditRetentionDays: values.auditRetentionDays
      ? String(Number(values.auditRetentionDays))
      : 'Not set',
  };
  return (
    <>
      {steps.slice(0, -1).map((step, index) => (
        <SectionCard
          key={step.label}
          title={step.label}
          headingLevel="h3"
          actions={
            <Button
              size="small"
              aria-label={`Edit ${step.label.toLowerCase()}`}
              onClick={() => {
                onEdit(index);
              }}
            >
              Edit
            </Button>
          }
        >
          <DescriptionList
            columns={1}
            items={step.fields.map((name) => ({ label: LABELS[name], value: shown[name] }))}
          />
        </SectionCard>
      ))}
    </>
  );
}

interface TenantDraftWizardProps {
  /** Amend when set: three steps, the code read-only. Create otherwise. */
  tenantId?: string;
  defaults: TenantDraftValues;
  options: TenantFormOptions;
  /** I2: the organisation the page rendered for, appended to the submit. */
  contextOrganisationId?: string;
}

/**
 * Create tenant draft (spec §11.1) and amend: one React Hook Form across `WizardForm`'s steps.
 * Continue validates the step's own fields; Review submits them all with the key minted on mount,
 * so a retry after a failure replays (spec §6.4). A server field error returns to its step.
 */
export function TenantDraftWizard({
  tenantId,
  defaults,
  options,
  contextOrganisationId,
}: TenantDraftWizardProps) {
  const amend = tenantId !== undefined;
  const steps = amend ? AMEND_STEPS : CREATE_STEPS;
  const fields = amend ? AMEND_FIELDS : CREATE_FIELDS;
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [active, setActive] = useState(0);
  // After a refused Continue: the step's error summary.
  const [attempted, setAttempted] = useState(false);
  // A failure's Alert stays until the user moves to another step.
  const [failureShown, setFailureShown] = useState(false);
  const failureRef = useRef<HTMLDivElement>(null);
  const {
    control,
    register,
    handleSubmit,
    trigger,
    getValues,
    setError,
    formState: { errors },
  } = useForm<TenantDraftValues>({
    resolver: zodResolver(tenantDraftSchema),
    defaultValues: defaults,
    mode: 'onTouched',
  });
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      try {
        return await (amend ? amendTenantDraft : createTenantDraft)(previous, formData);
      } catch (caught) {
        // Success is the action's redirect(), which must keep propagating (07's I1).
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

  // React's "previous value" pattern (as ListToolbar's search): a new failure moves the wizard to
  // the first step holding one of its field errors in the same render, never from an effect.
  const [seenFailure, setSeenFailure] = useState(failure);
  if (failure !== seenFailure) {
    setSeenFailure(failure);
    if (failure) {
      const target = firstStepWith(steps, (name) => failure.fieldErrors[name] !== undefined);
      if (target !== -1) setActive(target);
      setAttempted(false);
      setFailureShown(true);
    }
  }

  // From an effect, as in 08's draft form: RHF's setError commits outside the action's transition.
  // With no field to take focus, the Alert does, so the failure isn't lost.
  useEffect(() => {
    if (!failure) return;
    applyFieldErrors(setError, failure.fieldErrors, fields);
    if (!fields.some((name) => failure.fieldErrors[name] !== undefined)) {
      failureRef.current?.focus();
    }
  }, [failure, setError, fields]);

  const goTo = (step: number) => {
    setActive(step);
    setAttempted(false);
    setFailureShown(false);
  };
  const current = steps[active] ?? REVIEW;
  const onReview = active === steps.length - 1;

  const onValid = (values: TenantDraftValues) => {
    const formData = new FormData();
    formData.set('idempotencyKey', idempotencyKey);
    if (tenantId !== undefined) formData.set('tenantId', tenantId);
    for (const name of fields) formData.set(name, values[name]);
    if (contextOrganisationId) formData.set('contextOrganisationId', contextOrganisationId);
    startTransition(() => {
      formAction(formData);
    });
  };

  // Defensive: Continue validated every step, so this only catches a value changed since.
  const onInvalid = (invalid: FieldErrors<TenantDraftValues>) => {
    const target = firstStepWith(steps, (name) => invalid[name] !== undefined);
    goTo(target === -1 ? 0 : target);
    setAttempted(true);
  };

  const onSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    if (onReview) {
      void handleSubmit(onValid, onInvalid)(event);
      return;
    }
    event.preventDefault();
    void trigger([...current.fields], { shouldFocus: true }).then((valid) => {
      if (valid) goTo(active + 1);
      else setAttempted(true);
    });
  };

  const text = (name: FieldName, hint?: string) => ({
    ...register(name),
    label: LABELS[name],
    error: errors[name] !== undefined,
    helperText: errors[name]?.message ?? hint,
  });
  const stepErrors = attempted ? current.fields.filter((name) => errors[name] !== undefined) : [];
  const visibleFailure = failureShown && !pending ? failure : null;
  const values = onReview ? getValues() : null;

  return (
    <WizardForm
      label={amend ? 'Amend tenant draft' : 'Create tenant draft'}
      steps={steps}
      active={active}
      onSubmit={onSubmit}
      onBack={() => {
        goTo(active - 1);
      }}
      cancelHref={amend ? `/platform-admin/tenants/${tenantId}` : '/platform-admin/tenants'}
      submitLabel={amend ? 'Save draft' : 'Create draft'}
      pending={pending}
      alerts={
        visibleFailure || stepErrors.length > 0 ? (
          <>
            {visibleFailure && (
              <Alert ref={failureRef} tabIndex={-1} severity="error">
                {visibleFailure.formError}
                {visibleFailure.requestId && ` Reference: ${visibleFailure.requestId}`}
              </Alert>
            )}
            {stepErrors.length > 0 && (
              <Alert severity="error">
                {`Check these fields: ${stepErrors.map((name) => LABELS[name]).join(', ')}.`}
              </Alert>
            )}
          </>
        ) : undefined
      }
    >
      {current.label === INSTITUTION.label && (
        <>
          <TextField
            required
            {...text(
              'tenantCode',
              amend
                ? "The code can't be changed."
                : 'Lowercase letters, digits or hyphens, 3–32 characters.',
            )}
            slotProps={{
              htmlInput: {
                maxLength: 32,
                spellCheck: false,
                autoCapitalize: 'none',
                readOnly: amend,
              },
            }}
          />
          <TextField
            required
            {...text('displayName')}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            {...text('legalName', 'Optional.')}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            {...text('registrationNumber', 'Optional.')}
            slotProps={{ htmlInput: { maxLength: 50 } }}
          />
          <OptionField control={control} name="countryCode" options={options.countries} required />
          <OptionField
            control={control}
            name="baseCurrencyCode"
            options={options.currencies}
            required
          />
          <OptionField control={control} name="timezone" options={options.timeZones} required />
          {!amend && (
            <TextField
              type="date"
              {...text(
                'businessDate',
                "Optional. Defaults to today in the institution's timezone.",
              )}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          )}
        </>
      )}
      {current.label === ADMINISTRATOR.label && (
        <>
          <TextField required type="email" autoComplete="off" {...text('adminEmail')} />
          <TextField
            required
            autoComplete="off"
            {...text(
              'adminUsername',
              'Letters, digits, dots, underscores or hyphens, 3–50 characters.',
            )}
            slotProps={{ htmlInput: { maxLength: 50, spellCheck: false, autoCapitalize: 'none' } }}
          />
          <TextField
            required
            autoComplete="off"
            {...text('adminDisplayName')}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            required
            type="tel"
            autoComplete="off"
            {...text('adminPhone', 'International format, e.g. +254712000140.')}
          />
          <Controller
            name="adminSendApplicationInvite"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                label={LABELS.adminSendApplicationInvite}
                control={
                  <Checkbox
                    checked={field.value === 'true'}
                    onChange={(_event, checked) => {
                      field.onChange(checked ? 'true' : 'false');
                    }}
                    onBlur={field.onBlur}
                  />
                }
              />
            )}
          />
        </>
      )}
      {current.label === SETTINGS.label && (
        <>
          <Alert severity="info">
            These settings are stored with the institution, but the platform doesn&apos;t apply them
            yet. Maker-checker always applies, so its switches aren&apos;t offered here, and neither
            is automatic business date advance.
          </Alert>
          <OptionField
            control={control}
            name="defaultTimezoneSetting"
            options={options.timeZones}
            hint="Optional."
          />
          <OptionField
            control={control}
            name="baseCurrencySetting"
            options={options.currencies}
            hint="Optional."
          />
          <TextField
            {...text(
              'auditRetentionDays',
              'Optional. A whole number of days; only the platform can set it.',
            )}
            slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 5 } }}
          />
        </>
      )}
      {values && (
        <>
          <TenantDraftReview values={values} options={options} steps={steps} onEdit={goTo} />
          <Alert severity="info">
            {amend
              ? 'Saving replaces the whole draft.'
              : 'Saving creates a draft. Nothing is provisioned until a different platform administrator approves it.'}
          </Alert>
        </>
      )}
    </WizardForm>
  );
}
```

Notes for the implementer:

- `mode: 'onTouched'`: an error set by Continue clears once the field is fixed and blurred, and the
  step's summary (derived from `errors`) follows it.
- `getValues()` reads the review's values at render; never `watch` (react-hooks
  `incompatible-library`).
- The step jump after a failure is React's "adjust state during render" pattern (`seenFailure`), so
  no `setState` runs in an effect (react-hooks `set-state-in-effect`). The effect only applies the
  field errors and focus. WizardForm's own effect, a child's, runs first and focuses the heading;
  this one runs after it and wins.

- [ ] **Step 4: Run it again**

Run (form T) on the test file. Expected: PASS.

- [ ] **Step 5: Implement `app/(authenticated)/platform-admin/tenants/new/page.tsx`**

```tsx
import type { Metadata } from 'next';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { canAll } from '@/auth/permissions';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { PageHeader } from '@/components/shell/page-header';
import { TenantDraftWizard } from '@/modules/platform-administration/tenants/components/tenant-draft-wizard';
import {
  EMPTY_TENANT_DRAFT,
  tenantFormOptions,
} from '@/modules/platform-administration/tenants/tenant-rules';

export const metadata: Metadata = { title: 'Create tenant draft' };

export default async function NewTenantPage() {
  const selected = await getCurrentContextProfile();
  const resolved = selected.kind === 'resolved' ? selected : null;
  const header = (
    <PageHeader
      eyebrow="Platform administration · SACCO institutions"
      title="Create tenant draft"
      description="A new institution starts as a draft. Submitting sends it for approval by a different platform administrator, and approval provisions it."
    />
  );

  // The code pre-check and the redirect after create both read the directory (BG-31).
  if (
    !canAll({ permissions: resolved?.profile.permissions ?? [] }, ['tenant.create', 'tenant.view'])
  ) {
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
      <TenantDraftWizard
        defaults={EMPTY_TENANT_DRAFT}
        options={tenantFormOptions()}
        contextOrganisationId={resolved?.context.organization.id}
      />
    </>
  );
}
```

- [ ] **Step 6: Implement `app/(authenticated)/platform-admin/tenants/[tenantId]/amend/page.tsx`**

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { canAll } from '@/auth/permissions';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';
import { isPlatformOrganisation } from '@/config/application-context';
import { load } from '@/lib/api/load';
import { UUID_PATTERN } from '@/lib/api/wire';
import { TenantDraftWizard } from '@/modules/platform-administration/tenants/components/tenant-draft-wizard';
import {
  EMPTY_TENANT_DRAFT,
  tenantFormOptions,
} from '@/modules/platform-administration/tenants/tenant-rules';
import { getTenant } from '@/modules/platform-administration/tenants/tenant-service';

export const metadata: Metadata = { title: 'Amend tenant draft' };

const EYEBROW = 'Platform administration · SACCO institutions';

interface AmendTenantPageProps {
  params: Promise<{ tenantId: string }>;
}

export default async function AmendTenantPage({ params }: AmendTenantPageProps) {
  const { tenantId } = await params;
  if (!UUID_PATTERN.test(tenantId) || isPlatformOrganisation(tenantId)) notFound();

  const [tenant, selected] = await Promise.all([
    load(getTenant(tenantId)),
    getCurrentContextProfile(),
  ]);
  if (!tenant.ok) {
    if (tenant.problem.code === 'resource_not_found') notFound();
    return (
      <>
        <PageHeader eyebrow={EYEBROW} title="Amend tenant draft" />
        <Paper>
          <ErrorState problem={tenant.problem} />
        </Paper>
      </>
    );
  }

  const record = tenant.value;
  const resolved = selected.kind === 'resolved' ? selected : null;
  const header = (
    <PageHeader
      eyebrow={EYEBROW}
      title={`Amend ${record.displayName}`}
      description="Amending replaces the whole draft. The platform doesn't return the legal name, registration number or first administrator, so enter them again."
    />
  );

  if (
    !canAll({ permissions: resolved?.profile.permissions ?? [] }, [
      'tenant.update_draft',
      'tenant.view',
    ])
  ) {
    return (
      <>
        {header}
        <Paper>
          <ForbiddenState />
        </Paper>
      </>
    );
  }

  if (record.status !== 'DRAFT') {
    return (
      <>
        {header}
        <Paper>
          <ForbiddenState
            title="Only a draft can be amended"
            description="This institution has left the draft stage, so its details can't be changed here."
            action={
              <Button
                component={NextLink}
                href={`/platform-admin/tenants/${tenantId}`}
                variant="outlined"
              >
                Back to the record
              </Button>
            }
          />
        </Paper>
      </>
    );
  }

  return (
    <>
      {header}
      <TenantDraftWizard
        tenantId={tenantId}
        defaults={{
          ...EMPTY_TENANT_DRAFT,
          tenantCode: record.tenantCode,
          displayName: record.displayName,
          countryCode: record.countryCode,
          baseCurrencyCode: record.baseCurrencyCode,
          timezone: record.timezone,
        }}
        options={tenantFormOptions(record)}
        contextOrganisationId={resolved?.context.organization.id}
      />
    </>
  );
}
```

`ForbiddenState`'s `action` is a plain child, not an `isValidElement`-gated MUI prop (standing ruling 3).

- [ ] **Step 7: Run the module's tests**

Run (form T) on `modules/platform-administration/tenants`. Expected: PASS. The pages are covered by
Task 8's spec.

- [ ] **Step 8: Commit** (form C)

`git add modules/platform-administration/tenants/components/tenant-draft-wizard.tsx modules/platform-administration/tenants/components/tenant-draft-wizard.test.tsx 'app/(authenticated)/platform-admin/tenants/new/page.tsx' 'app/(authenticated)/platform-admin/tenants/[tenantId]/amend/page.tsx'`

```
feat(platform): add the tenant draft wizard and amend

Create walks Institution, First administrator, Initial settings and Review with per-step
validation and one idempotency key. A taken tenant code or a server field error returns the wizard
to that field's step. Amend reuses the wizard as a full replacement: the code is read-only, and the
legal name, registration number and first administrator are entered again (BG-14).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 8: End-to-end coverage with the accessibility matrix, and the docs

**Files:**

- Create: `e2e/platform-tenants.spec.ts`
- Modify: `README.md`, `AGENTS.md`, `docs/backend-gaps.md`

**Interfaces:**

- Consumes: Task 3's `platform-tenants` scenario and `TENANT_SCENARIO_IDS`; `IDS`; `enterAdmin(page,
pathname, { heading, organisation?, branch? })`, `A11Y_CASES`, `applyA11yCase`,
  `expectA11yCaseApplied`, `expectNoSeriousOrCriticalViolations` (`e2e/support/admin.ts`);
  `authenticate(context, testInfo, scenario)`, `addCookie`, `CONTEXT_COOKIE_NAME`,
  `selectMuiOption(page, label, option)` (`e2e/support/auth.ts`).
- Produces: `e2e/platform-tenants.spec.ts`, the layer's own spec.

Seeded directory (`platform-tenants`, newest first): Umoja (DRAFT), Harambee (PENDING_APPROVAL,
Uganda), Mwangaza (PENDING_APPROVAL, submitted by Jane), Pwani (ACTIVE, bootstrap FAILED), Kilimo
(SUSPENDED), the 100-character Nairobi Metropolitan name (REJECTED, Tanzania), Acme (ACTIVE), plus the
hidden platform organisation: eight organisations, seven institutions.

- [ ] **Step 1: Write the spec**

`e2e/platform-tenants.spec.ts`:

```ts
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  A11Y_CASES,
  applyA11yCase,
  enterAdmin,
  expectA11yCaseApplied,
  expectNoSeriousOrCriticalViolations,
} from './support/admin';
import { addCookie, authenticate, CONTEXT_COOKIE_NAME, selectMuiOption } from './support/auth';
import { IDS, TENANT_SCENARIO_IDS } from './fake-api/scenarios.mts';

async function openDirectory(page: Page) {
  // The platform operator has one branch, which selection picks by itself.
  await enterAdmin(page, '/platform-admin/tenants', {
    heading: 'SACCO institutions',
    organisation: /Platform/,
    branch: null,
  });
}

async function openRecord(page: Page, name: string) {
  await page
    .getByRole('table', { name: 'Institutions' })
    .getByRole('link', { name, exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15000 });
}

// Scoped to `main`, as in branches.spec.ts: a streamed route can briefly exist as a hidden
// duplicate segment, and `getByRole('main')` resolves only the rendered one.
const mainText = (page: Page, value: string | RegExp, options?: { exact?: boolean }) =>
  page.getByRole('main').getByText(value, options);
// The hero chip and the Overview's Lifecycle row both show the status: `.first()` is load-bearing.
const statusChip = (page: Page, value: string) => mainText(page, value, { exact: true }).first();
const rowsOf = (page: Page) => page.getByRole('table', { name: 'Institutions' }).getByRole('row');
// Reject and Deprovision are alertdialogs once ReasonDialog has 08's V3 tone; the rest are dialogs.
const dialogOf = (page: Page) => page.getByRole('alertdialog').or(page.getByRole('dialog'));

/** A hero lifecycle action through its dialog; the caller asserts the outcome. */
async function act(page: Page, label: string, reason?: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
  const dialog = dialogOf(page);
  if (reason) await dialog.getByRole('textbox', { name: /^Reason/ }).fill(reason);
  await dialog.getByRole('button', { name: label, exact: true }).click();
  return dialog;
}

/** A wizard Autocomplete: filter by the option's label, then choose it. */
async function pick(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label }).fill(option);
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Continue, then wait for the next step's heading. */
async function next(page: Page, step: string) {
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { level: 2, name: step })).toBeVisible();
}

async function fillAdministrator(page: Page) {
  await page.getByRole('textbox', { name: 'Email' }).fill('amina@tujenge.example');
  await page.getByRole('textbox', { name: 'Username' }).fill('amina.otieno');
  await page.getByRole('textbox', { name: 'Full name' }).fill('Amina Otieno');
  await page.getByRole('textbox', { name: 'Phone' }).fill('+254712000140');
}

/** After a `goto`, a client handler works only once React has hydrated the node (selectMuiOption's
 * poll, for a control that isn't a Select). */
async function hydrated(locator: Locator) {
  await expect
    .poll(
      () => locator.evaluate((el) => Object.keys(el).some((key) => key.startsWith('__reactProps'))),
      { timeout: 20000 },
    )
    .toBe(true);
}

test.describe('platform tenants', () => {
  // Every route here can be the first hit of its tree under a cold `next dev` compile.
  test.describe.configure({ timeout: 90000 });

  test('lists the institutions without the platform organisation, and filters and sorts them through the URL', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);

    // BG-29: eight organisations, seven institutions.
    await expect(mainText(page, '7 institutions')).toBeVisible();
    await expect(rowsOf(page)).toHaveCount(8); // header + 7
    await expect(rowsOf(page).nth(1)).toContainText('Umoja Teachers SACCO');
    await expect(rowsOf(page).filter({ hasText: 'PLATFORM' })).toHaveCount(0);

    await page.getByRole('searchbox', { name: 'Search' }).fill('pwani');
    await page.getByRole('searchbox', { name: 'Search' }).press('Enter');
    await expect(page).toHaveURL(/q=pwani/, { timeout: 15000 });
    await expect(rowsOf(page)).toHaveCount(2);
    await expect(mainText(page, '1 institution', { exact: true })).toBeVisible();

    // Wait for each cleared render (as branches.spec does): the next push builds on it.
    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(mainText(page, '7 institutions')).toBeVisible({ timeout: 15000 });
    await selectMuiOption(page, 'Country', /^Uganda$/);
    await expect(page).toHaveURL(/country=UG/, { timeout: 15000 });
    await expect(rowsOf(page)).toHaveCount(2);
    await expect(rowsOf(page).nth(1)).toContainText('Harambee Farmers SACCO');

    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(mainText(page, '7 institutions')).toBeVisible({ timeout: 15000 });
    await selectMuiOption(page, 'Status', /^Suspended$/);
    await expect(page).toHaveURL(/status=SUSPENDED/, { timeout: 15000 });
    await expect(rowsOf(page).nth(1)).toContainText('Kilimo Bora SACCO');

    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(mainText(page, '7 institutions')).toBeVisible({ timeout: 15000 });
    const byName = page.getByRole('columnheader', { name: 'Institution', exact: true });
    await byName.getByRole('link').click();
    await expect(page).toHaveURL(/sortBy=displayName&sortDir=ASC/, { timeout: 15000 });
    await expect(byName).toHaveAttribute('aria-sort', 'ascending');
    await expect(rowsOf(page).nth(1)).toContainText('Acme SACCO');

    // The reserved organisation is no institution: its record is a 404.
    await page.goto(`/platform-admin/tenants/${IDS.platformOrganisation}`);
    await expect(
      page.getByRole('heading', { level: 1, name: "We couldn't find that page" }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('creates a draft, refusing a taken code before the create call, then explains the maker-checker refusal', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    await page.getByRole('link', { name: 'Create tenant draft' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Create tenant draft' })).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      mainText(
        page,
        'Check these fields: Tenant code, Display name, Country, Base currency, Timezone.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Tenant code' })).toBeFocused();

    await page.getByRole('textbox', { name: 'Tenant code' }).fill('acme');
    await page.getByRole('textbox', { name: 'Display name' }).fill('Tujenge Traders SACCO');
    await pick(page, 'Country', 'Kenya');
    await pick(page, 'Base currency', 'KES · Kenyan Shilling');
    await pick(page, 'Timezone', 'Africa/Nairobi');
    await next(page, 'First administrator');
    await fillAdministrator(page);
    await next(page, 'Initial settings');
    await next(page, 'Review');
    await page.getByRole('button', { name: 'Create draft' }).click();

    // BG-07: the code is checked before the POST, and the wizard returns to its step.
    await expect(page.getByRole('heading', { level: 2, name: 'Institution' })).toBeVisible({
      timeout: 15000,
    });
    await expect(mainText(page, 'This code is already in use.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Tenant code' })).toBeFocused();

    await page.getByRole('textbox', { name: 'Tenant code' }).fill('tujenge-traders');
    await next(page, 'First administrator');
    await next(page, 'Initial settings');
    await next(page, 'Review');
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(page).toHaveURL(/\/platform-admin\/tenants\/[0-9a-f-]{36}$/, { timeout: 15000 });
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tujenge Traders SACCO' }),
    ).toBeVisible();
    await expect(statusChip(page, 'Draft')).toBeVisible();

    await expect(await act(page, 'Submit for approval')).toBeHidden();
    await expect(statusChip(page, 'Pending approval')).toBeVisible({ timeout: 15000 });
    // Jane created and submitted it, so the platform refuses her approval (BG-08).
    const refused = await act(page, 'Approve');
    await expect(refused.getByRole('alert')).toContainText('created or submitted the request');
  });

  test('approves a request another administrator submitted, and shows provisioning queued', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    await openRecord(page, 'Harambee Farmers SACCO');

    await expect(await act(page, 'Approve')).toBeHidden();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Approved. Provisioning is queued.' }),
    ).toBeVisible();
    await expect(statusChip(page, 'Active')).toBeVisible();
    // ACTIVE offers Suspend first, so focus lands there (standing ruling 4).
    await expect(page.getByRole('button', { name: 'Suspend', exact: true })).toBeFocused();

    await page.getByRole('tab', { name: 'Provisioning' }).click();
    await expect(page).toHaveURL(/\/provisioning$/, { timeout: 15000 });
    const steps = page.getByRole('list', { name: 'Provisioning steps' }).getByRole('listitem');
    await expect(steps.nth(2)).toContainText('Done');
    await expect(steps.nth(3)).toContainText('In progress');
  });

  test('rejects a pending request with a required reason, leaving no action', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    await openRecord(page, 'Mwangaza Savings SACCO');

    await expect(await act(page, 'Reject', 'Duplicate of another request')).toBeHidden();
    // REJECTED offers nothing, so the actions unmount and their cleanup focuses the title.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Mwangaza Savings SACCO' }),
    ).toBeFocused();
    await expect(statusChip(page, 'Rejected')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Approve|Reject)$/ })).toHaveCount(0);
  });

  test('suspends an institution with a reason and reactivates it', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    await openRecord(page, 'Acme SACCO');

    await expect(await act(page, 'Suspend', 'Compliance review')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Reactivate', exact: true })).toBeFocused();
    await expect(statusChip(page, 'Suspended')).toBeVisible();

    await expect(await act(page, 'Reactivate')).toBeHidden();
    await expect(statusChip(page, 'Active')).toBeVisible();
  });

  test('deprovisions only after the tenant code is typed back (CRITICAL)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    await openRecord(page, 'Kilimo Bora SACCO');

    await page.getByRole('button', { name: 'Deprovision', exact: true }).click();
    const dialog = dialogOf(page);
    const confirm = dialog.getByRole('textbox', { name: 'Type kilimo-bora to confirm' });
    await confirm.fill('kilimo');
    await dialog.getByRole('textbox', { name: /^Reason/ }).fill('Merged into Harambee');
    await dialog.getByRole('button', { name: 'Deprovision', exact: true }).click();
    await expect(dialog.getByText('Type the tenant code exactly as shown.')).toBeVisible();

    await confirm.fill('kilimo-bora');
    await dialog.getByRole('button', { name: 'Deprovision', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Kilimo Bora SACCO' })).toBeFocused();
    await expect(statusChip(page, 'Deprovisioned')).toBeVisible();
  });

  test('retries a failed bootstrap from the Provisioning tab', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    await openRecord(page, 'Pwani Fishermen SACCO');
    await page.getByRole('tab', { name: 'Provisioning' }).click();
    await expect(page).toHaveURL(/\/provisioning$/, { timeout: 15000 });
    await expect(mainText(page, 'KEYCLOAK_UNAVAILABLE')).toBeVisible();

    await expect(await act(page, 'Retry bootstrap')).toBeHidden();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Bootstrap retry started' }),
    ).toBeVisible();
    // The button leaves with the FAILED state, so its unmount cleanup focuses the title.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Pwani Fishermen SACCO' }),
    ).toBeFocused();
    await expect(page.getByRole('button', { name: 'Retry bootstrap' })).toHaveCount(0);
    await expect(
      page.getByRole('list', { name: 'Provisioning steps' }).getByRole('listitem').nth(3),
    ).toContainText('In progress');
  });

  test('amends a draft as a full replacement, re-entering what the platform cannot return (BG-14)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    await openRecord(page, 'Umoja Teachers SACCO');

    await page.getByRole('link', { name: 'Amend draft' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Amend Umoja Teachers SACCO' }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('textbox', { name: 'Tenant code' })).toHaveAttribute(
      'readonly',
      '',
    );
    await page
      .getByRole('textbox', { name: 'Display name' })
      .fill('Umoja Teachers Co-operative SACCO');
    await page
      .getByRole('textbox', { name: 'Legal name' })
      .fill('Umoja Teachers Co-operative Society Ltd');
    await next(page, 'First administrator');
    await fillAdministrator(page);
    await next(page, 'Review');
    await page.getByRole('button', { name: 'Save draft' }).click();

    await expect(page).toHaveURL(
      new RegExp(`/platform-admin/tenants/${TENANT_SCENARIO_IDS.umoja}$`),
      { timeout: 15000 },
    );
    await expect(
      page.getByRole('heading', { level: 1, name: 'Umoja Teachers Co-operative SACCO' }),
    ).toBeVisible();
    await expect(statusChip(page, 'Draft')).toBeVisible();
  });

  test('sends a stale platform context to context selection and back to the same tab (index item 1)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await addCookie(context, testInfo, CONTEXT_COOKIE_NAME, 'stale-context-token');
    const tab = `/platform-admin/tenants/${TENANT_SCENARIO_IDS.pwani}/provisioning`;

    await page.goto(tab);
    await expect(page).toHaveURL(/\/select-context\?next=/, { timeout: 20000 });
    await selectMuiOption(page, 'Organisation', /Platform/);
    await expect(page).toHaveURL((url) => url.pathname === tab, { timeout: 15000 });
    await expect(
      page.getByRole('heading', { level: 1, name: 'Pwani Fishermen SACCO' }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('tab', { name: 'Provisioning' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('offers no tenant mutations without the permissions', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-operator'); // tenant.view only
    await openDirectory(page);

    await expect(mainText(page, '1 institution', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create tenant draft' })).toHaveCount(0);
    await openRecord(page, 'Acme SACCO');
    await expect(page.getByRole('button', { name: /^(Suspend|Deprovision)$/ })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Provisioning' }).click();
    await expect(page).toHaveURL(/\/provisioning$/, { timeout: 15000 });
    await expect(page.getByRole('list', { name: 'Provisioning steps' })).toBeVisible();

    await page.goto('/platform-admin/tenants/new');
    await expect(page.getByRole('main').getByText("You don't have permission")).toBeVisible({
      timeout: 15000,
    });
  });

  for (const a11yCase of A11Y_CASES) {
    test(`has no serious or critical accessibility violations (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
      context,
      page,
    }, testInfo) => {
      test.setTimeout(120000);
      await applyA11yCase(page, a11yCase);
      await authenticate(context, testInfo, 'platform-tenants');
      await openDirectory(page);
      await expectA11yCaseApplied(page, a11yCase);
      await expectNoSeriousOrCriticalViolations(page);

      await page.goto('/platform-admin/tenants/new');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Create tenant draft' }),
      ).toBeVisible({ timeout: 15000 });
      await expectA11yCaseApplied(page, a11yCase);
      await expectNoSeriousOrCriticalViolations(page);
      // The error summary and the invalid fields; Continue is a client handler.
      const proceed = page.getByRole('button', { name: 'Continue' });
      await hydrated(proceed);
      await proceed.click();
      await expect(mainText(page, /^Check these fields/)).toBeVisible();
      await expectNoSeriousOrCriticalViolations(page);

      for (const [path, heading] of [
        // The 100-character name: hero, tabs and Overview never scroll the page (index item 4).
        [`/platform-admin/tenants/${TENANT_SCENARIO_IDS.nairobiMetro}`, /^Nairobi Metropolitan/],
        [
          `/platform-admin/tenants/${TENANT_SCENARIO_IDS.pwani}/provisioning`,
          'Pwani Fishermen SACCO',
        ],
        [
          `/platform-admin/tenants/${TENANT_SCENARIO_IDS.umoja}/amend`,
          'Amend Umoja Teachers SACCO',
        ],
        [`/platform-admin/tenants/${IDS.acme}`, 'Acme SACCO'],
      ] as const) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
          timeout: 15000,
        });
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);
      }

      // Acme is ACTIVE: the CRITICAL deprovision dialog, open.
      const deprovision = page.getByRole('button', { name: 'Deprovision', exact: true });
      await hydrated(deprovision);
      await deprovision.click();
      await expect(dialogOf(page)).toBeVisible();
      await expectNoSeriousOrCriticalViolations(page);
    });
  }
});
```

- [ ] **Step 2: Run it**

Run (form E) on
`e2e/platform-tenants.spec.ts e2e/platform-administration.spec.ts e2e/fake-api-platform-tenants.spec.ts`.
Expected: PASS. If an axe case fails on a kit component, standing ruling 2 applies: one additive
`refactor(kit):` commit (reported) or an escalation, never a local workaround.

- [ ] **Step 3: Update `README.md`** (pre-flight note 7's anchors)

1. Directory tree, the `platform-admin/` lines become:

   ```
   │   ├── platform-admin/         # Platform workspace, gated to the platform organisation's context
   │   │   ├── layout.tsx           # Redirects tenant contexts away; requires platform-admin module
   │   │   └── tenants/             # SACCO institutions: directory (search, status/country/created
   │   │                              # filters, sortable headers), create wizard (new/), the record
   │   │                              # ([tenantId]/(record)/: hero lifecycle; Overview and
   │   │                              # Provisioning tabs), and amend ([tenantId]/amend/)
   ```

2. The `platform-administration/` module line becomes:

   ```
   ├── platform-administration/   # Platform module + navigation; tenants/ holds the institution
   │                                # contract, directory query, lifecycle rules, service, Server
   │                                # Actions, and components (modules/platform-administration/tenants/);
   │                                # the root keeps the tenant branch and user reads for layer 17
   ```

3. In the `data-display/` entry, `ReasonDialog (07); AssignmentDrawer (08)` becomes
   `ReasonDialog (07); AssignmentDrawer (08); WizardForm and its Stepper theme (16)`.
4. The bullet that starts "The Platform Administration workspace" becomes:

   ```
   - The Platform Administration workspace (`/platform-admin`, reachable only when the selected
     context's organisation is the platform organisation) manages SACCO institutions through
     `modules/platform-administration/tenants/`: the directory, the create-draft wizard, amend, the
     record's lifecycle (submit, approve, reject, suspend, reactivate, deprovision) and bootstrap
     retry. Times show in UTC.
     - The reserved platform organisation is hidden from the directory and its record URL is a 404;
       a filtered count can read one high (`docs/backend-gaps.md` BG-29).
     - A tenant code is checked before the create call, because a duplicate is a backend 500
       (BG-07); the check reads one page of 100 matches.
     - Approve stays on offer for its maker: the platform context can't read who created or
       submitted a request, so a refusal is explained as permission or maker-checker (BG-08).
     - Amend re-asks the legal name, registration number and first administrator, which the
       platform never returns (BG-14). There are no Settings or Audit tabs (BG-12, BG-06).
     - The overview, and the tenant branch and user reads in `platform-administration-service.ts`,
       are layer 17's.
   ```

5. "the platform read endpoints" becomes "Platform Administration's institutions".
6. Step 3 of "Next recommended implementation steps" becomes:

   ```
   3. Extend Platform Administration with tenant branches and users, platform users, and the KPI
      overview (layer 17).
   ```

- [ ] **Step 4: Update `AGENTS.md`**

1. "Every tenant-workspace data-listing UI (new lists especially)" becomes "Every data-listing UI
   (both workspaces; new lists especially)".
2. The sentence that starts "Two exceptions predate this pattern" becomes: "One exception predates
   this pattern: `components/context/pagination-controls.tsx` (the pre-shell organisation/branch
   selection lists in `/select-context`, which have no URL to hold state)."
3. After the bullet that starts "Mutations are Server Actions built on `runServerAction`", add:

   ```
   - Multi-step forms use `components/data-display/wizard-form.tsx`'s `WizardForm` (the themed MUI
     `Stepper` and a sticky action bar) with one React Hook Form across the steps: Continue
     `trigger`s the step's own fields, the last step submits them all with one idempotency key, and
     a server field error returns to its step (see
     `modules/platform-administration/tenants/components/tenant-draft-wizard.tsx`).
   ```

Rewrap to the file's ~100 columns; nothing else changes.

- [ ] **Step 5: Update `docs/backend-gaps.md`**

1. BG-14, "**Frontend handling:** amend form asks for those fields to be re-entered and says why."
   becomes "**Frontend handling:** the amend wizard asks for those fields and the first administrator
   to be re-entered, says why, and sends no settings or business date."
2. BG-29, "The frontend filters it out (page sizes can then show one fewer row)." becomes "The
   frontend filters it out, so a page can show one fewer row. The result count subtracts it whenever
   it is known to be included (always when unfiltered, and when its row is on the page), so a
   filtered count can read one high; its record URL is a 404."

- [ ] **Step 6: Format the docs**

`pnpm exec prettier --check README.md AGENTS.md docs/backend-gaps.md` (inside form T's `flock`
prefix). Fix what it reports with `--write`.

- [ ] **Step 7: Commit** (form C)

`git add e2e/platform-tenants.spec.ts README.md AGENTS.md docs/backend-gaps.md`

```
test(e2e): cover platform tenants end to end, with the accessibility matrix

The spec covers the directory (filters, sort, the hidden platform organisation), the create wizard
with its code pre-check, approve, reject, suspend, reactivate, deprovision, bootstrap retry, amend,
a stale context, and read-only gating, plus axe in light and dark at desktop and 375 px. The docs
describe the institution workspace and the WizardForm pattern, and drop the retired pagination
exception.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

## Layer gate (workflow gate phase; not a task)

Implementers never execute this section.

- **Gates** (the workflow's gate phase, lane Y forms): `pnpm check`, `pnpm build` and the full
  `pnpm test:e2e`, all clean.
- **Visual and keyboard pass** (pass it as the run's `visual` arg). Light and dark, at 1440 and
  375 px, against the prototype:
  1. Directory: the toolbar wraps at 375; the table scrolls inside its container, never the page;
     the 100-character name truncates with its full value in `title`; "7 institutions"; no row
     hover; visible focus rings on the sort headers, the name links and Create tenant draft.
  2. Create wizard, every step: the Stepper is a 2×2 grid at 375 and one row at 1440; the active
     cell is tinted and underlined; completed steps show the teal check; the helper captions hide
     below `sm`; Continue and Back move focus to the step heading; the error summary and the field
     errors read together; the Autocomplete popups fit at 375; the sticky action bar stays in view
     on the longest step; Review's Edit buttons reach their step; dark-mode contrast of the step
     numbers and captions.
  3. Record: the hero (icon avatar, the long h1 wrapping, chips, actions sharing the row at 375),
     the tabs, the Overview list, and the Provisioning timeline, chips, failure code and Retry
     bootstrap.
  4. Amend: the read-only code and its helper, the re-entry guidance, and the non-DRAFT state's
     "Back to the record".
  5. All seven dialogs (submit, approve, reject, suspend, reactivate, deprovision, retry): the focus
     trap; Escape and the backdrop close only when nothing is pending; errors inside the dialog with
     their reference; the typed-back code; focus after success per standing ruling 4.
  6. Keyboard only: complete a create from the directory to the new record, and reach every action.
- Run the `ui-ux-pro-max` pre-delivery checklist on the directory, the wizard and the record.
- Ledger and integration as the workflow defines.

## Controller live check (controller only; not a task)

Implementers never execute this section. Lane X's controller runs it against the deployed dev API,
after the gate. The user signs in themselves; the agent never types credentials. Every mutation
below needs the user's explicit approval at the time, one at a time. Never act on a real tenant.

- **Reads:**
  - the directory, sorted by each field in both directions (a 500 means the allow-list drifted:
    record it);
  - the PLATFORM organisation absent from the rows, its record URL a 404, and the count against the
    pagination footer;
  - a real tenant's record and Provisioning tab;
  - the wizard's pre-check with an existing code: the network panel shows no POST;
  - a non-DRAFT tenant's amend URL shows "Only a draft can be amended".
- **Mutations**, on the throwaway code `zz16-live-check`, each approved on its own:
  1. create: permanent, because there is no delete, and the code stays taken;
  2. amend (DRAFT);
  3. submit;
  4. approve: only with a second platform identity and the user's explicit approval, because it
     really provisions (a Keycloak identity, possibly an email). Otherwise only confirm that the
     creator's own approve is refused with a 403;
  5. reject as the cleanup (terminal; the code stays taken);
  6. suspend, reactivate, deprovision and retry only on an approved throwaway tenant. Deprovision
     is irreversible, so skip it unless the user approves it explicitly.
- **Record:** ledger lines with each request ID. A finding goes to the contract document or to a new
  BG entry (BG-16a onwards).

## Self-review

- **Spec coverage:**
  - §11.1: the directory (Tasks 1, 3, 6, 8); the create wizard's four steps and fields (Tasks 1, 4,
    7, 8); the code pre-check (Tasks 2, 7, 8); the platform organisation excluded (Tasks 1, 6, 8).
  - §11.2: the Overview and Provisioning tabs, with the timeline, failure code and Retry bootstrap
    (Tasks 1, 5, 8); the hero lifecycle by status and permission (Tasks 1, 5, 8); amend as a full
    replacement with re-entry (Tasks 1, 2, 7, 8); approve's 202 and maker-checker explanation
    (Tasks 2, 3, 5, 8); reject's reason, and that it is terminal (Tasks 2, 5, 8); deprovision's
    reason and CRITICAL confirmation (Tasks 2, 5, 8). Branches and Users tabs, Settings and Audit:
    out of scope (17, BG-12, BG-06).
  - §7.3 Stepper (Task 4); §9 UTC, list, record, form and wizard patterns (Tasks 4–7); §11 intro,
    the platform context (Task 3's fake guard; the existing layout gate).
- **Ownership:** each task touches only its Files list. Nothing under "Files 16 never touches"
  changes; the kit is consumed as-is, and ReasonDialog's `tone` is conditional (pre-flight note 1).
- **Registries:** one `BUILDERS` entry (`'platform-tenants'`) and `TENANT_SCENARIO_IDS` on the
  `16000000-…` prefix; routes only in `routes/platform-tenants.mts`, which `server.mts` already
  registers; no package changes; one new theme block (four keys).
- **Review Focus pins:** every class names its tests: Tasks 3, 5, 7 and 8 for context and replay;
  Tasks 1, 2, 3, 5 and 8 for permissions and maker-checker; Tasks 6 and 8 for long values; Tasks 1
  and 2 for drift.
- **Rulings 1–19:** each maps to a task step: 1 and 2 (pre-flight, Task 6), 3 (Task 6), 4 (Tasks 1,
  6, 8), 5 and 6 (Task 6), 7 (Task 5), 8 and 9 (Task 5), 10 (Task 2), 11 (Tasks 2, 7), 12 (Tasks 1,
  7), 13 (Tasks 2, 7), 14 (Tasks 5, 6), 15 (Task 3), 16 (Task 4), 17 (Task 6), 18 (Tasks 5, 6),
  19 (Tasks 6, 7).
- **Placeholder scan:** no TODO, TBD or elided code; every code step is complete.
- **Name consistency:** `TenantLifecycleActions`, `RetryBootstrapButton`, `ProvisioningTimeline`,
  `TenantDirectoryTable`, `TenantDraftWizard`, `WizardForm`, `WizardStep`, `TENANT_SCENARIO_IDS`,
  `PLATFORM_TENANT_CODES`, `platformTenantsScenario` and the Task 1–2 exports are spelled the same
  in every task that uses them. The UI strings the tests assert are in the code that renders them.
- **Lint traps:** no `setState` in an effect (the wizard's step jump adjusts state during render);
  no RHF `watch`; `SyntheticEvent<HTMLFormElement>`, never `FormEvent`; the `'use server'` module
  exports only async functions; `.mts` files formatted by hand (form P); `noUncheckedIndexedAccess`
  handled (`steps[active] ?? REVIEW`, `mock.calls[0]?.[1]`, `as const` loops); `as unknown` on
  asymmetric matchers.
