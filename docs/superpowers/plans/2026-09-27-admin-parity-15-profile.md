# PR 15: Profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [plan index](./2026-09-25-admin-parity-00-index.md),
> the [parallel lane rules](./2026-09-27-admin-parity-parallel-lanes.md) and the
> [07b record-kit plan](./2026-09-27-admin-parity-07b-record-kit.md) first.

**Goal:** Replace the single-card `/profile` with the prototype's tabbed account profile (spec
§10.9). It has five tabs, each a nested route:

- **Overview:** identity, active context, membership status and signed-in time.
- **Contexts:** your organisations, and your branches in the current organisation, with a switch
  action.
- **Roles & permissions:** your roles, and your effective permission codes grouped by code prefix.
- **Security:** a link to the Keycloak account console.
- **Activity:** your own audit events, when you hold `audit.view` in a tenant context.

**Architecture:**

- Server Components throughout. `app/(authenticated)/profile/layout.tsx` renders 07b's
  `RecordHero` and `RecordTabs`; each tab is its own `page.tsx`.
- One cached server helper, `requireProfile()` (`modules/profile/profile-service.ts`), checks the
  session and the resolved context, and maps `/auth/me` to `ProfileUser`. `ProfileUser` is the
  shell's sanitized `FinaxisUser` plus four display-only fields. The layout and every tab call it;
  `cache()` makes them share one session check and one `/auth/me` per request.
- Client leaves only where interaction needs one:
  - 07b's `RecordTabs` and `CopyIdButton`, and 06's `TablePaginationBar`;
  - `SwitchContextButton`, which opens its own instance of 05's `ContextSwitcherDialog`.
- No Server Actions and no mutations of 15's own. Switching context goes through the existing
  `/api/context/*` route handlers, via the shared dialog.
- Activity reuses 07b's `RecordAuditTab` with a single "Performed by me" actor view.

**Tech Stack:** Next.js 16 (nested layouts, `cache`, `redirect`), MUI 9.4 (`Card`, `Tabs` through
07b, `Table`, `Chip`), zod 4, Vitest + RTL, Playwright + axe.

**Spec:** [`…-design.md`](../specs/2026-09-25-admin-prototype-parity-design.md):

- §10.9 (the tabs); §8 (`proxy.ts` protects `/profile/:path*`); §6.5 (context switching, All
  branches); §6.6 (`can()`); §6.7 (error states); §9 (record page, ID copy, formatting in the
  organisation's timezone, UTC in the platform workspace);
- contract §C (`UserProfile`, `AvailableOrganisation`), §E.1 (`/auth/*`: bare JWT versus context),
  §E.3 (`/tenant/audit-events` `actor_id`), §J (permission codes);
- gaps BG-06 (no platform audit), BG-17 (no profile fields, MFA or session state), BG-23
  (organisation overcount, repeated branches and roles).

**Base:** `F_07b`, the `ap-integration` tip once 07b has integrated, recorded in
`refs/lane-base/15-profile`. **Branch:** `lane/15-profile` in lane Y. The controller registers it as
`admin-parity/15-profile`, between 07b and 07. (If the layer moves to X, see **Fallback to X** in
Global Constraints.)

**Launch.** There is no plan-commit task: runbook §7 step 3 commits this file by hand
(`docs(plans): add plan 15`) before the run. Then launch v3 `all` mode with `tasks: 5` (runbook §4),
which builds Tasks 1–5. The **Layer completion** and **Controller live check** sections below are
not tasks: the workflow's pre-flight, gate and integrate phases and the controller run them, and they
sit above Task 1 so no task brief contains them. Pass the Layer completion keyboard and visual pass
as the run's `visual` arg.

## Global Constraints

See the index and the lane rules. Additionally:

**Command forms.** Every command below shows only the command part. Run it through the lane rules'
§2 form for your lane (the runbook's §0): literal absolute paths, the heavy lock,
`VITEST_MAX_WORKERS=3`, and your own ports. Lock package scripts only, never
`pnpm exec playwright test` (the guard refuses it). For lane Y:

```
# T — focused unit tests (foreground)
flock -E 75 -w 240 /tmp/finaxis-e2e.lock env VITEST_MAX_WORKERS=3 pnpm test:run <paths>

# E — scoped E2E (run_in_background + log + Monitor). First, `ss -ltn '( sport = :3200 or sport = :3299 )'`
#     must show no listener you didn't start.
flock -E 75 -w 1800 /tmp/finaxis-e2e.lock env VITEST_MAX_WORKERS=3 PORT=3200 FAKE_API_PORT=3299 pnpm test:e2e <specs>

# C — commit (run_in_background + Monitor). Write the message to <your scratchpad>/commit-msg.txt
#     with the Write tool first. The husky wrapper locks the hook, so never put git inside flock,
#     and never commit before RUN-STATE records the wrapper as installed and self-tested.
git add <whole files>
VITEST_MAX_WORKERS=3 git commit -F <your scratchpad>/commit-msg.txt

# G — gates: pnpm check, pnpm build, pnpm test:e2e (each run_in_background + Monitor)
flock -E 75 -w 1800 /tmp/finaxis-e2e.lock env VITEST_MAX_WORKERS=3 PORT=3200 FAKE_API_PORT=3299 <gate command>
```

Exit 75 means the lock wait timed out: retry, don't skip. A subagent's commit trailer names its own
model, per the carried ledger rule.

**Fallback to X** (lane rules §10: pure pipeline, 07 → 08 → 13 → 09 → 15). The same forms apply,
with ports 3100/3199. Also:

- Re-derive Base from the `ap-integration` tip at the fork. 'Base F_07b' and "Nothing from 07
  exists" below no longer hold, because 07, 08, 13 and 09 are already below 15.
- If `components/data-display/section-card.tsx` is present, use `SectionCard` directly. Keeping
  `ProfileSection` would be the duplicate copy that lane rules §3 forbids. Drop `ProfileSection`
  and its test, and drop Ruling 1 and its deferred minor. `SectionCard`'s default `headingLevel`
  (`h2`) fits every profile section, so no call passes it.
- Under "Y isn't ready at t0", the kit comes from 08's Task 0, not 07b. Its files keep the paths
  named here.

**Nothing from 07 exists at this base.** 15 builds from F_07b, and 07 integrates after it (stack
order 07b, 15, 07). So there is no `SectionCard`, `ReasonDialog`, `runServerAction`, or A1/A2/N/R
here, and 15 needs none of them. The section surface is a local `ProfileSection` whose props are
exactly `SectionCard`'s minus `headingLevel`, so adopting `SectionCard` later is an import swap.

**Wire contract** (contract §C, §E.1, §E.3, §I). 15 sends no request bodies of its own. The only
POSTs are the existing context switches, sent through 05's `/api/context/*` handlers by the shared
dialog.

| Endpoint                                                   | Permission and scope                                            | Context header       | Used for                                 | Failure handling                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------- | -------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/auth/me`                                      | `iam.profile.read`                                              | yes                  | every tab (`requireProfile`, cached)     | 401/403 → `/select-context?next=` (05's `getSelectedContextProfile`); schema drift → the error boundary, as today                                                                                                                                                                               |
| `GET /api/v1/auth/organisations?page&size`                 | bare JWT; rows filtered by `auth.select_organisation`           | **no**               | Contexts: organisations                  | 401 → `/login`; any other 4xx/5xx or a malformed item (05's `organisationPageSchema`) → `ErrorState` with a reference (`load()`); BG-23: `total_items` can overcount, so an in-range page can be empty; bad paging is `validation_failed` with no violations (never sent: `parsePaging` clamps) |
| `POST /api/v1/auth/select-organisation`, `…/select-branch` | `auth.select_organisation` / `auth.select_branch`, tenant scope | via `/api/context/*` | Contexts: "Switch context" (05's dialog) | handled by 05's dialog: 401 → login, 403/409 → context lost; `429 rate_limit_exceeded` (`auth-selection`, 20/min) shows the dialog's retry message                                                                                                                                              |
| `GET /api/v1/tenant`                                       | `tenant.view` (T)                                               | yes                  | Overview: the organisation's timezone    | any failure → UTC (`getOrganisationTimeZone`); never called in the platform context                                                                                                                                                                                                             |
| `GET /api/v1/tenant/audit-events?actor_id&page&size`       | `audit.view`; tenant context only                               | yes                  | Activity (`RecordAuditTab`)              | platform context → 403 with a sentence code, which `canViewActivity` prevents; other failures → `ErrorState` inside the section (07b)                                                                                                                                                           |
| `GET /api/v1/branches`, `GET /api/v1/tenant/users/{id}`    | `branch.view`, `user.view`                                      | yes                  | Activity: the kit's name lookups (06)    | any failure → short IDs                                                                                                                                                                                                                                                                         |

Every page redirects 401 → `/login?reason=session_expired` and
`403 invalid_active_tenant_context` → `/select-context?next=<tab>` (index Review Focus 1).

**Disjointness.** 15 edits no file that plan 07 (+A1/A2/N/R) edits, except the append-only
`BUILDERS` registry and `README.md`'s directory tree (docs, resolved by R4 union).

| 15 touches                                                                                                                                                | Plan 07 (+A1/A2/N/R), 07b                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `docs/superpowers/plans/2026-09-27-admin-parity-15-profile.md` (new; runbook §7.3's plan commit)                                                          | —                                                                                                                 |
| `modules/profile/**` (new)                                                                                                                                | —                                                                                                                 |
| `app/(authenticated)/profile/**` (layout and tab pages new; `page.tsx` and `page.test.tsx` rewritten)                                                     | 07 edits `app/(authenticated)/layout.tsx` (+ test) — **15 never touches it**                                      |
| `components/profile/profile-view.tsx` + test (**deleted**)                                                                                                | —                                                                                                                 |
| `proxy.ts`, `proxy.test.ts` (matcher only)                                                                                                                | —                                                                                                                 |
| `e2e/fake-api/scenarios.mts` (two `BUILDERS` entries appended, plus one ID constant)                                                                      | 07 adds `businessDates`, `TENANT_ADMIN` codes and two `BUILDERS` entries → R3 union when 07 rebases onto 15       |
| `e2e/fake-api-profile.spec.ts`, `e2e/profile.spec.ts` (new)                                                                                               | 07 appends to `e2e/fake-api.spec.ts` — **15 never edits it**                                                      |
| `e2e/context-selection.spec.ts`, `e2e/keycloak-smoke.spec.ts` (the `/profile` assertions only)                                                            | —                                                                                                                 |
| `components/data-display/record-tabs.tsx` + test (one additive `refactor(kit):` commit, optional `RecordTab.exact`, Task 5)                               | 07b owns it (kit freeze, lane rules §6); 07 never touches it; 08 only consumes it                                 |
| `README.md` (the directory tree only, Task 5)                                                                                                             | 07 edits README → R4 union when 07 rebases onto 15                                                                |
| Consumes, never edits: `auth/context-service.ts`, `auth/context-contract.ts`, `components/shell/*`, `lib/api/*`, `lib/format.ts`, the rest of the 07b kit | 07 edits `app-shell.tsx`, `global-header.tsx`, `tenant-api.ts`, `backend-api.ts`, `format.ts`, `README`, `AGENTS` |

**Scope.**

- **15 is the kit's first real page consumer.** 07b assumed 08 would be. So this layer runs the
  first axe and keyboard pass of `RecordHero`, `RecordTabs` (scroll buttons at 375 px, the inset
  ring) and `CopyIdButton` in a real page.
  - A kit defect gets one additive `refactor(kit): …` commit, announced to X over SendMessage (lane
    rules §6), or an escalation. Never reshape a kit prop. Task 5 plans one such commit: an optional
    `RecordTab.exact`.
  - The kit's README entry stays with 08.
- **No new fake-API routes.** Every endpoint the profile reads is already faked: `/auth/*`
  (03/05), `GET /tenant`, `GET /branches`, `GET /tenant/users/{id}` and `/tenant/audit-events`
  (06). 15 adds two scenarios and a smoke spec.
- **README: the directory tree only** (Task 5). This layer deletes `components/profile/` and adds
  `modules/profile/` and the nested profile routes, so AGENTS.md's "update README when the
  architecture changes" applies. Lane rules §5 allow it in the layer that makes the change; 07's
  parallel README edits merge by R4 union. **No AGENTS or index edits**: the profile follows spec
  §6.1's module pattern, and the index is controller-owned.
- **Out of scope** (all Gaps or deferrals; see the Rulings):
  - profile edit, phone, member number and last activity (BG-17);
  - MFA and session status (BG-17);
  - per-row switch buttons;
  - a Keycloak "back to Finaxis" referrer;
  - `SectionCard` adoption.
- **No live check in lane Y.** The Controller live check below runs at L1, on X (runbook §10).

**Rulings to record in the ledger.** The workflow's pre-flight writes each of these as a `Ruling:`
line when it creates the 15 ledger; implementers don't. The integrate phase cross-checks them.

1. **Base F_07b.** 15 uses no 07 primitive. `ProfileSection` (an MUI `Card`) takes `SectionCard`'s
   props minus `headingLevel`. Swapping it for `SectionCard` after 07 integrates is a deferred minor
   for the controller.
2. **`ProfileUser extends FinaxisUser`.**
   - It is the same sanitized DTO plus four display-only fields: organisation code/status, branch
     code/status, membership status, role name/status.
   - One server-side mapper builds it, `toProfileUser`, on top of the unchanged
     `profileToFinaxisUser`. `keycloak_subject` and tokens never reach it.
   - AGENTS.md's "only the sanitized FinaxisUser DTO" still holds, so there is no AGENTS edit.
     `profileToFinaxisUser` stays untouched, because two `toEqual` tests in
     `auth/context-service.test.ts` pin its output.
3. **Permissions are grouped by code prefix**, the first dot-separated segment
   (`business_date.view` → `business_date`), not by `module_code`.
   - `/auth/me` returns codes only. The catalogue's `module_code` needs `permission.view` and
     `GET /tenant/permissions`, which the platform context can't read.
   - Labels are humanized, with two overrides: `iam` → "IAM", `cob` → "Close of business".
4. **Contexts.**
   - Organisations come from `GET /auth/organisations` with the bare session JWT (no context
     header). Page and size are in the URL (10–50, default 10).
   - Branches come from `/auth/me`: bounded by the user's own assignments, de-duplicated by
     `profileSchema`, and SUSPENDED branches included.
   - Switching uses the Contexts tab's own `ContextSwitcherDialog` instance. Lifting AppShell's
     dialog state would edit `app-shell.tsx`, which 07 edits.
   - A cross-organisation switch lands on that workspace's home, as the shared dialog always does.
     A same-organisation switch stays on the tab.
   - Per-row switch buttons are skipped: the dialog covers every case.
5. **Activity** is `RecordAuditTab` with one view, "Performed by me" (`actorId` = `/auth/me`
   `user_id`).
   - It is hidden, with a guided state on direct links, in the platform context (BG-06: the tenant
     audit API rejects that context even for an `audit.view` holder) and without `audit.view`.
   - Its links open `/admin/audit`, as the kit's Ruling 3 says.
   - On that direct link no tab is marked current. The Overview tab is `exact` (Task 5's additive
     kit prop), so it no longer claims `/profile/activity`.
6. **Security** links to `${KEYCLOAK_ISSUER}/account`, the account console root.
   - Deep links (signing-in, device activity) differ between Keycloak versions, so none are used.
   - It opens in a new tab with `rel="noopener noreferrer"`.
   - There's no MFA or session status (BG-17).
7. **The hero** follows the prototype.
   - Eyebrow `<workspace> · Account profile`, h1 "My profile", subtitle `name · email`, and the
     membership status chip.
   - "Back to overview" links to the workspace home.
   - There are no hero actions: there is no profile edit API (BG-17).
8. **Signed-in time** is Better Auth's `session.createdAt`, in the organisation's timezone. The
   platform context uses UTC and never reads `GET /tenant`.
9. **Existing specs.** `e2e/context-selection.spec.ts` and `e2e/keycloak-smoke.spec.ts` change only
   their `/profile` content assertions, because the page they assert changed. The empty-state copy
   "No branches assigned" and "No application roles assigned" is kept on purpose.

## Review Focus

Pins index item 1 (stale context: Task 4 `e2e/profile.spec.ts` "sends a stale context on a nested
tab…", and Task 1 `profile-service.test.ts` "sends an unresolved context…"). Pins item 3 (branch
cardinality: Task 4 "one row per branch…") and item 4 (long values at 375 px: Task 5's axe matrix
runs `long-names` on every tab). Pins item 5 (schema drift) in two halves: Task 1 "rejects a
malformed organisation…" proves the parse fails, and Task 4's contexts page test "shows the safe
error state…" proves the tab then renders `ErrorState` with its support reference. Adds:

1. **A DISABLED or repeated role never inflates access or the list.** `/auth/me` lists a role once
   per assignment, at any scope, DISABLED included. Pinned by Task 2's smoke spec (two
   `TENANT_ADMIN` rows, and a DISABLED role that grants nothing) and Task 4's roles E2E (one Tenant
   admin row). Task 1 pins only that a DISABLED role keeps its status.
2. **Activity is never requested where it can't work.** That means the platform context, even with
   `audit.view`, and any context without `audit.view`. Pinned by Task 1's `canViewActivity` test,
   Task 5's activity page test and Task 5's `platform-audit-viewer` E2E.
3. **The account-console link comes from configuration only and opens safely.** Pinned by Task 4's
   security page test (the href built from a mocked `serverEnv`) and its security E2E.
4. **A same-organisation branch switch from Contexts stays on the tab and moves the "Current"
   marker.** Pinned by Task 4's contexts E2E.
5. **The organisations list is URL-paginated and sent with a bare JWT**, never with a context header
   and never unbounded. Pinned by Task 1 "lists organisations…" and Task 4's contexts page test: the
   URL's paging reaches the read, a page past the end redirects to the last page, and an empty
   in-range page (BG-23) keeps the pagination bar.
6. **The kit's first page passes axe in light and dark at 1280 and 375 px, and the keyboard pass.**
   Task 5's axe matrix, plus the keyboard pass in Layer completion.
7. **A hidden tab's direct link marks no tab as the current page.** Pinned by Task 5's
   `record-tabs.test.tsx` case and the two direct-link Activity E2Es.

## Layer completion (run by the workflow's pre-flight, gate and integrate phases; not a task)

Implementers never execute this section. Each task ends at its commit.

- **Ledger** (pre-flight): the nine Rulings from Global Constraints, as `Ruling:` lines. Also these
  deferred minors, as `Layer 15: minor (deferred): <location> — <summary>` lines:
  - adopt `SectionCard` after 07 integrates (controller);
  - per-row switch buttons;
  - a Keycloak account-console `referrer` back link;
  - label overrides for any prefix L1 shows humanizing badly.

  Also record "no live read in lane Y: the Controller live check runs at L1 on X" (v3's `liveNote`
  default already tells implementers to skip live checks).

- **Gates** (`gateLoop('layer gate')`): `pnpm check`, `pnpm build` and the full `pnpm test:e2e`,
  under the lock on the lane's ports, with the gate evidence line (lane rules §2.8).
- **Keyboard and visual pass** (the run's `visual` arg; the kit's first real page). On every profile
  tab, in light and dark at 1280 and 375 px:
  - Tab through the back link, the copy button, the tabs (arrow keys move between them, and the
    375 px scroll buttons appear), "Switch context", the pagination arrows, "Open account console",
    and the Activity row links.
  - Every stop must show the 2 px focus-coloured ring, unclipped.
  - Nothing may scroll the page horizontally at 375 px with `long-names`.
  - The ui-ux-pro-max pre-delivery checklist (`references/pro-rules.md`) on the five tabs.
- **Integration** (the integrate phase, runbook §7 step 5): the rebase onto `ap-integration`, the
  ancestry check and the CAS.
- **Disjointness re-grep** (controller, when 07 rebases onto 15 in 07's slot; 07's final file list
  doesn't exist before then): check 15's files against 07's. Any overlap beyond the Disjointness
  table is an R5/R6 case.

## Controller live check (controller only, at L1; not a task)

Lane Y never runs this. X runs it in live batch L1 at B2, on the `ap-integration` SHA that contains
F_07 (runbook §10, lane rules §9). 15 is publishable only after this check.

**Files:** none. Evidence goes to the 15 ledger. Contract surprises go into the contract document,
and backend defects into `docs/backend-gaps.md`, as a lower-layer commit landed through a boundary.
A new gap is numbered `BG-15a`, `BG-15b`, … (lane rules §5); the controller renumbers it at
registration.

**Set up** (runbook §10 procedure):

1. Detach on the integrated SHA. Start the dev server in non-E2E mode on 3100.
2. The user signs in on dev Keycloak in the browser pane **themselves**. Never type credentials.
3. Change nothing in Keycloak: no password, MFA or session changes.

**Reads:**

| Tab / endpoint                                              | Check                                                                                                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Overview (`/auth/me`, `GET /tenant`)                        | Identity matches the signed-in dev user. Organisation, code, status and branch match the header. The signed-in time is in the tenant's timezone.                                     |
| Contexts (`GET /auth/organisations?page&size`, `/auth/me`)  | The organisations list, with one row per branch. A multi-branch or HOME+OPERATE user shows each branch once. Changing the page size works (BG-23: note any overcount or empty page). |
| Roles & permissions (`/auth/me`)                            | Roles are de-duplicated and any DISABLED role is labelled. Permission groups are listed. Note every real prefix, including the 19 accounting codes, that humanizes badly.            |
| Security                                                    | The link opens dev Keycloak's account console for the right realm at `/realms/<realm>/account`, in a new tab. Confirm the path on dev's Keycloak version. Change nothing there.      |
| Activity (`/tenant/audit-events?actor_id=`)                 | The rows equal `/admin/audit?actorId=<user_id>`. The `user_id` from `/auth/me` is the audit `actor_id` (contract §E.3: `actor_id` matches `actor_user_id`).                          |
| Platform context (only if the user has platform membership) | The Activity tab is hidden, the Overview is in UTC, and "Back to overview" goes to `/platform-admin`.                                                                                |

**Mutations** (each one only after its own approval in chat). These are context switches only
(`POST /auth/select-organisation`, `/auth/select-branch`). They change the session's working context,
never tenant data. Space them out: the auth-selection limit is 20/min.

1. From Contexts → "Switch context", pick another branch in the same organisation. It stays on
   `/profile/contexts`, and "Current" moves.
2. From the dialog, pick All branches (multi-branch users only). The header shows "All branches",
   and Contexts shows "You're working at All branches (institution level)".
3. Optional: another organisation. It lands on that workspace's home (Ruling 4).

**Record:** one ledger line per check, in the runbook's form:
`Live check (L1, <sha>): <endpoint/action> — <status/evidence> — passed|failed`. Then stop the dev
server and confirm 3100 is free.

---

### Task 1: Profile rules and service

**Files:**

- Create: `modules/profile/profile-rules.ts`, `modules/profile/profile-rules.test.ts`
- Create: `modules/profile/profile-service.ts`, `modules/profile/profile-service.test.ts`

**Interfaces:**

- Consumes:
  - `FinaxisUser`, `AssignedBranch`, `OrganizationSummary` (`auth/auth.types.ts`); `BackendProfile`
    (`auth/context.types.ts`);
  - `getCurrentContextProfile`, `profileToFinaxisUser` (`auth/context-service.ts`),
    `getAuthenticatedUser`, `contextSelectionRedirectPath`, `backendApi`;
  - `can` (`auth/permissions.ts`); `humanizeEnum` (`components/data-display/status-chip.tsx`);
  - `organisationPageSchema` (`auth/context-contract.ts`, 05's canonical `/auth/organisations`
    schema, consumed unchanged);
  - `pageMetadataSchema`, `Page` (`lib/api/wire.ts`); `toQueryString` (`lib/api/query-string.ts`);
  - `ApplicationContext`, `ApplicationContextModule` (types only, `config/application-context.ts`).
- Produces:
  - `profile-rules.ts` (client-safe):
    - `interface ProfileBranch extends AssignedBranch { code: string; status: string }`
    - `interface ProfileRole { id: string; code: string; name: string; status: string }`
    - `interface ProfileUser extends FinaxisUser { organization: OrganizationSummary & { code: string; status: string }; branches: readonly ProfileBranch[]; membershipStatus: string; assignedRoles: readonly ProfileRole[] }`
    - `interface PermissionGroup { prefix: string; label: string; codes: readonly string[] }`
    - `groupPermissions(codes: readonly string[]): PermissionGroup[]`, groups sorted by prefix and
      codes sorted and de-duplicated.
    - `canViewActivity(user: PermissionHolder, moduleId: ApplicationContextModule['id']): boolean`
    - `workspaceHome(moduleId: ApplicationContextModule['id']): '/admin' | '/platform-admin'`
  - `profile-service.ts` (server-only):
    - `toProfileUser(profile: BackendProfile, sessionUser: FinaxisUser): ProfileUser | null`, which
      is `null` without an organisation.
    - `requireProfile(): Promise<{ user: ProfileUser; context: ApplicationContext }>`, `cache()`d.
      With no session it redirects to `/login?reason=session_expired`. With an unresolved context
      it redirects to `/select-context?next=<path>`.
    - `interface MyOrganisation { id: string; code: string; name: string; membershipStatus: string }`
    - `listMyOrganisations(paging: { page: number; size: number }): Promise<Page<MyOrganisation>>`,
      a bare-JWT `GET /api/v1/auth/organisations`, parsed by `organisationPageSchema` (AGENTS.md:
      every `/auth/*` body goes through `auth/context-contract.ts`) and mapped to camelCase.

- [ ] **Step 1: Write the failing tests**

`modules/profile/profile-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { canViewActivity, groupPermissions, workspaceHome } from './profile-rules';

describe('profile rules', () => {
  it('groups permission codes by prefix, sorted and de-duplicated, with readable labels', () => {
    expect(
      groupPermissions([
        'user.view',
        'iam.profile.read',
        'cob.start',
        'business_date.view',
        'business_date.advance',
        'audit.view',
        'user.view',
        'legacy',
      ]),
    ).toEqual([
      { prefix: 'audit', label: 'Audit', codes: ['audit.view'] },
      {
        prefix: 'business_date',
        label: 'Business date',
        codes: ['business_date.advance', 'business_date.view'],
      },
      { prefix: 'cob', label: 'Close of business', codes: ['cob.start'] },
      { prefix: 'iam', label: 'IAM', codes: ['iam.profile.read'] },
      { prefix: 'legacy', label: 'Legacy', codes: ['legacy'] },
      { prefix: 'user', label: 'User', codes: ['user.view'] },
    ]);
    expect(groupPermissions([])).toEqual([]);
  });

  it('offers Activity only with audit.view in a tenant context (the platform context has no audit, BG-06)', () => {
    expect(canViewActivity({ permissions: ['audit.view'] }, 'administration')).toBe(true);
    expect(canViewActivity({ permissions: ['user.view'] }, 'administration')).toBe(false);
    expect(canViewActivity({ permissions: ['audit.view'] }, 'platform-administration')).toBe(false);
  });

  it('sends each workspace back to its own overview', () => {
    expect(workspaceHome('administration')).toBe('/admin');
    expect(workspaceHome('platform-administration')).toBe('/platform-admin');
  });
});
```

`modules/profile/profile-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REQUEST_PATHNAME_HEADER, type FinaxisUser } from '@/auth/auth.types';
import type { BackendProfile } from '@/auth/context.types';
import type { ApplicationContext } from '@/config/application-context';

const { get, getAuthenticatedUser, getCurrentContextProfile, requestHeaders } = vi.hoisted(() => ({
  get: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  getCurrentContextProfile: vi.fn(),
  requestHeaders: new Headers(),
}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(requestHeaders) }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock('@/auth/backend-api', () => ({
  backendApi: { get: (...args: unknown[]) => get(...args) as unknown },
}));
vi.mock('@/auth/get-authenticated-user', () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUser(...args) as unknown,
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
  // The shell's mapper, reduced to what toProfileUser builds on.
  profileToFinaxisUser: (profile: BackendProfile): FinaxisUser => ({
    id: profile.user_id,
    name: profile.full_name ?? '',
    email: profile.email ?? '',
    roles: profile.roles.map((role) => role.code),
    permissions: profile.permissions,
    branches: [],
  }),
}));

const { listMyOrganisations, requireProfile, toProfileUser } = await import('./profile-service');

const PROFILE: BackendProfile = {
  user_id: '55555555-5555-4555-8555-555555555555',
  keycloak_subject: 'kc-subject-never-rendered',
  email: 'jane@greenfield.example',
  full_name: 'Jane Manager',
  organisation: { id: 'org-1', code: 'greenfield', name: 'Greenfield SACCO', status: 'ACTIVE' },
  membership: { id: 'm-1', status: 'ACTIVE' },
  selected_branch: null,
  branches: [
    { id: 'b-1', code: 'HEAD_OFFICE', name: 'Head Office', status: 'ACTIVE' },
    { id: 'b-2', code: 'WESTLANDS', name: 'Westlands Branch', status: 'SUSPENDED' },
  ],
  roles: [{ id: 'r-1', code: 'LEGACY_TELLER', name: 'Legacy teller', status: 'DISABLED' }],
  permissions: ['audit.view'],
};
const SESSION_USER: FinaxisUser = {
  id: 'session-user',
  name: 'Session User',
  email: 'session@greenfield.example',
  roles: [],
  permissions: [],
  branches: [],
};
const CONTEXT: ApplicationContext = {
  module: { id: 'administration', name: 'Administration' },
  organization: { id: 'org-1', name: 'Greenfield SACCO' },
  branch: null,
};

describe('profile service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestHeaders.delete(REQUEST_PATHNAME_HEADER);
  });

  it('adds only display fields to the sanitized user, and never the Keycloak subject', () => {
    const user = toProfileUser(PROFILE, SESSION_USER);

    expect(user).toMatchObject({
      id: PROFILE.user_id,
      organization: { id: 'org-1', name: 'Greenfield SACCO', code: 'greenfield', status: 'ACTIVE' },
      branches: [
        { id: 'b-1', code: 'HEAD_OFFICE', name: 'Head Office', status: 'ACTIVE' },
        { id: 'b-2', code: 'WESTLANDS', name: 'Westlands Branch', status: 'SUSPENDED' },
      ],
      membershipStatus: 'ACTIVE',
      assignedRoles: [
        { id: 'r-1', code: 'LEGACY_TELLER', name: 'Legacy teller', status: 'DISABLED' },
      ],
      permissions: ['audit.view'],
    });
    expect(JSON.stringify(user)).not.toContain('kc-subject-never-rendered');
    expect(toProfileUser({ ...PROFILE, organisation: null }, SESSION_USER)).toBeNull();
  });

  it('sends a missing session to login before reading the context', async () => {
    getAuthenticatedUser.mockResolvedValueOnce(null);

    await expect(requireProfile()).rejects.toThrow('NEXT_REDIRECT:/login?reason=session_expired');
    expect(getCurrentContextProfile).not.toHaveBeenCalled();
  });

  it('sends an unresolved context to /select-context, keeping the tab it came from', async () => {
    requestHeaders.set(REQUEST_PATHNAME_HEADER, '/profile/roles');
    getAuthenticatedUser.mockResolvedValue(SESSION_USER);
    getCurrentContextProfile.mockResolvedValueOnce({
      kind: 'redirect-to-context-selection',
      reason: 'invalid-context',
    });

    await expect(requireProfile()).rejects.toThrow(
      'NEXT_REDIRECT:/select-context?next=%2Fprofile%2Froles',
    );

    getCurrentContextProfile.mockResolvedValueOnce({
      kind: 'resolved',
      profile: { ...PROFILE, organisation: null },
      context: CONTEXT,
    });
    await expect(requireProfile()).rejects.toThrow(
      'NEXT_REDIRECT:/select-context?next=%2Fprofile%2Froles',
    );
  });

  it('returns the profile user and the typed context once both check out', async () => {
    getAuthenticatedUser.mockResolvedValueOnce(SESSION_USER);
    getCurrentContextProfile.mockResolvedValueOnce({
      kind: 'resolved',
      profile: PROFILE,
      context: CONTEXT,
    });

    const { user, context } = await requireProfile();

    expect(user.membershipStatus).toBe('ACTIVE');
    expect(context).toBe(CONTEXT);
  });

  it('lists organisations from the URL page with the bare session JWT (no context header)', async () => {
    get.mockResolvedValueOnce({
      items: [
        {
          organisation_id: 'org-1',
          membership_id: 'm-1',
          tenant_code: 'greenfield',
          display_name: 'Greenfield SACCO',
          organisation_status: 'ACTIVE',
          membership_status: 'ACTIVE',
          ignored_extra: true,
        },
      ],
      page: {
        number: 1,
        size: 20,
        total_items: 21,
        total_pages: 2,
        has_next: false,
        has_previous: true,
      },
    });

    const result = await listMyOrganisations({ page: 1, size: 20 });

    // Exactly two arguments: no context token, so no X-Active-Organisation-Context header.
    expect(get).toHaveBeenCalledWith('/api/v1/auth/organisations?page=1&size=20', requestHeaders);
    expect(result).toEqual({
      items: [
        { id: 'org-1', code: 'greenfield', name: 'Greenfield SACCO', membershipStatus: 'ACTIVE' },
      ],
      page: {
        number: 1,
        size: 20,
        totalItems: 21,
        totalPages: 2,
        hasNext: false,
        hasPrevious: true,
      },
    });
  });

  it('rejects a malformed organisation so the tab shows the safe error state', async () => {
    get.mockResolvedValueOnce({
      items: [{ organisation_id: 'org-1', tenant_code: 'greenfield', membership_status: 'ACTIVE' }],
      page: {
        number: 0,
        size: 10,
        total_items: 1,
        total_pages: 1,
        has_next: false,
        has_previous: false,
      },
    });

    await expect(listMyOrganisations({ page: 0, size: 10 })).rejects.toThrow();
  });
});
```

Run (form T): `pnpm test:run modules/profile`. Expected: FAIL (the modules are missing).

- [ ] **Step 2: Implement `modules/profile/profile-rules.ts`**

```ts
import type { AssignedBranch, FinaxisUser, OrganizationSummary } from '@/auth/auth.types';
import { can, type PermissionHolder } from '@/auth/permissions';
import { humanizeEnum } from '@/components/data-display/status-chip';
import type { ApplicationContextModule } from '@/config/application-context';

export interface ProfileBranch extends AssignedBranch {
  code: string;
  status: string;
}

export interface ProfileRole {
  id: string;
  code: string;
  name: string;
  status: string;
}

/**
 * The shell's sanitized `FinaxisUser` plus the display-only `/auth/me` fields the profile tabs
 * render (AGENTS.md: profile UI renders only the sanitized DTO — never the raw backend profile,
 * its Keycloak subject, or tokens). Built server-side by `toProfileUser`.
 */
export interface ProfileUser extends FinaxisUser {
  organization: OrganizationSummary & { code: string; status: string };
  branches: readonly ProfileBranch[];
  membershipStatus: string;
  /** Per ACTIVE role assignment at any scope, de-duplicated; may include DISABLED roles. */
  assignedRoles: readonly ProfileRole[];
}

export interface PermissionGroup {
  prefix: string;
  label: string;
  codes: readonly string[];
}

// Prefixes that humanize badly; every other prefix reads fine through humanizeEnum.
const PREFIX_LABELS: Readonly<Record<string, string>> = {
  iam: 'IAM',
  cob: 'Close of business',
};

/**
 * Effective codes grouped by their first segment (`business_date.view` → `business_date`).
 * `/auth/me` returns codes only; the catalogue's `module_code` needs `permission.view`, which the
 * platform context can't read — so the profile groups by prefix (lane ownership: 15).
 */
export function groupPermissions(codes: readonly string[]): PermissionGroup[] {
  const byPrefix = new Map<string, Set<string>>();
  for (const code of codes) {
    const prefix = code.split('.')[0] ?? code;
    byPrefix.set(prefix, (byPrefix.get(prefix) ?? new Set<string>()).add(code));
  }
  return [...byPrefix.keys()].sort().map((prefix) => ({
    prefix,
    label: PREFIX_LABELS[prefix] ?? humanizeEnum(prefix),
    codes: [...(byPrefix.get(prefix) ?? [])].sort(),
  }));
}

/**
 * Spec §10.9: own audit events "when audit.view" — and only in a tenant context. The tenant audit
 * API rejects the platform context even for an `audit.view` holder (BG-06).
 */
export function canViewActivity(
  user: PermissionHolder,
  moduleId: ApplicationContextModule['id'],
): boolean {
  return moduleId !== 'platform-administration' && can(user, 'audit.view');
}

export function workspaceHome(
  moduleId: ApplicationContextModule['id'],
): '/admin' | '/platform-admin' {
  return moduleId === 'platform-administration' ? '/platform-admin' : '/admin';
}
```

- [ ] **Step 3: Implement `modules/profile/profile-service.ts`**

```ts
import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { FinaxisUser } from '@/auth/auth.types';
import { backendApi } from '@/auth/backend-api';
import { organisationPageSchema } from '@/auth/context-contract';
import type { BackendProfile } from '@/auth/context.types';
import { getCurrentContextProfile, profileToFinaxisUser } from '@/auth/context-service';
import { contextSelectionRedirectPath } from '@/auth/context-selection-redirect';
import { getAuthenticatedUser } from '@/auth/get-authenticated-user';
import type { ApplicationContext } from '@/config/application-context';
import { toQueryString } from '@/lib/api/query-string';
import { pageMetadataSchema, type Page } from '@/lib/api/wire';
import type { ProfileUser } from './profile-rules';

/**
 * The shell's user (unchanged `profileToFinaxisUser`) plus the profile's display fields.
 * `profileSchema` already de-duplicated the repeated branches and roles (contract §C, BG-23).
 */
export function toProfileUser(
  profile: BackendProfile,
  sessionUser: FinaxisUser,
): ProfileUser | null {
  const organisation = profile.organisation;
  if (!organisation) return null;
  return {
    ...profileToFinaxisUser(profile, sessionUser),
    organization: {
      id: organisation.id,
      name: organisation.name,
      code: organisation.code,
      status: organisation.status,
    },
    branches: profile.branches.map(({ id, code, name, status }) => ({ id, code, name, status })),
    membershipStatus: profile.membership.status,
    assignedRoles: profile.roles.map(({ id, code, name, status }) => ({ id, code, name, status })),
  };
}

/**
 * Session + resolved context for the profile layout and every tab page (a layout doesn't re-run
 * when a sibling tab navigates, so each page calls this too). `cache()` lets the layout and page of
 * one request share a single session check and a single `/auth/me`.
 */
export const requireProfile = cache(
  async (): Promise<{ user: ProfileUser; context: ApplicationContext }> => {
    const requestHeaders = await headers();
    const sessionUser = await getAuthenticatedUser(requestHeaders);
    if (!sessionUser) redirect('/login?reason=session_expired');
    const selected = await getCurrentContextProfile();
    if (selected.kind !== 'resolved') redirect(contextSelectionRedirectPath(requestHeaders));
    const user = toProfileUser(selected.profile, sessionUser);
    if (!user) redirect(contextSelectionRedirectPath(requestHeaders));
    return { user, context: selected.context };
  },
);

export interface MyOrganisation {
  id: string;
  code: string;
  name: string;
  membershipStatus: string;
}

/**
 * `GET /auth/organisations` (contract §E.1) with the bare session JWT — no context header. Parsed
 * by 05's `organisationPageSchema` (AGENTS.md: every `/auth/*` body goes through
 * `auth/context-contract.ts`), so a row missing any contract §C field fails to the safe
 * `ErrorState`. The backend filters after paging (BG-23), so a page can hold fewer rows than
 * `size`, or none.
 */
export async function listMyOrganisations(paging: {
  page: number;
  size: number;
}): Promise<Page<MyOrganisation>> {
  const raw = await backendApi.get<unknown>(
    `/api/v1/auth/organisations${toQueryString(paging)}`,
    await headers(),
  );
  const { items, page } = organisationPageSchema.parse(raw);
  return {
    items: items.map((organisation) => ({
      id: organisation.organisation_id,
      code: organisation.tenant_code,
      name: organisation.display_name,
      membershipStatus: organisation.membership_status,
    })),
    // Already validated above; this only renames the snake_case paging to `PageMetadata`.
    page: pageMetadataSchema.parse(page),
  };
}
```

Run (form T): `pnpm test:run modules/profile`. Expected: PASS.

- [ ] **Step 4: Commit** (form C)

`git add modules/profile/profile-rules.ts modules/profile/profile-rules.test.ts modules/profile/profile-service.ts modules/profile/profile-service.test.ts`

```
feat(profile): add the profile user, permission grouping, and the cached profile service

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

### Task 2: Fake profile scenarios and their smoke spec

**Files:**

- Modify: `e2e/fake-api/scenarios.mts`
- Create: `e2e/fake-api-profile.spec.ts`

**Interfaces:**

- Consumes: PR 03's `greenfieldTenant`, `platformOperator`, `role`, `tenantRoleAssignment`, `IDS`
  and `BUILDERS`, all in `scenarios.mts`; the fake `/auth/*` and audit routes.
- Produces two `BUILDERS` scenarios. `FakeApiScenario` derives from `BUILDERS`, so `auth.ts` stays
  untouched.
  - `'profile-roles'`: `greenfieldTenant()` plus a DISABLED `LEGACY_TELLER` role holding
    `user.suspend`, assigned to Jane, and a second, BRANCH-scope assignment of `TENANT_ADMIN` at
    Head Office.
  - `'platform-audit-viewer'`: `platformOperator()` whose role also holds `audit.view`, as the real
    `PLATFORM_SUPER_ADMIN` does (contract §J).

- [ ] **Step 1: Write the failing smoke spec**

`e2e/fake-api-profile.spec.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { IDS } from './fake-api/scenarios.mts';

const FAKE_API_URL = `http://127.0.0.1:${process.env.FAKE_API_PORT ?? '3199'}`;

/** A fresh run of `scenario`, with a context token for `organisationId`. */
async function signIn(request: APIRequestContext, scenario: string, organisationId: string) {
  const authorization = { Authorization: `Bearer e2e.${scenario}.${randomUUID()}` };
  const selection = await request.post(`${FAKE_API_URL}/api/v1/auth/select-organisation`, {
    headers: authorization,
    data: { organisation_id: organisationId },
  });
  const { context_token: contextToken } = (await selection.json()) as { context_token: string };
  return { ...authorization, 'X-Active-Organisation-Context': contextToken };
}

test.describe('fake API profile scenarios (layer 15)', () => {
  test('/auth/me lists a role per assignment, including a DISABLED role that grants nothing', async ({
    request,
  }) => {
    const headers = await signIn(request, 'profile-roles', IDS.greenfield);

    const me = await request.get(`${FAKE_API_URL}/api/v1/auth/me`, { headers });
    const body = (await me.json()) as {
      roles: { code: string; status: string }[];
      permissions: string[];
    };

    // Contract §C: one row per ACTIVE assignment at any scope — the frontend de-duplicates.
    expect(body.roles.filter((candidate) => candidate.code === 'TENANT_ADMIN')).toHaveLength(2);
    expect(body.roles).toContainEqual(
      expect.objectContaining({ code: 'LEGACY_TELLER', status: 'DISABLED' }),
    );
    expect(body.permissions).not.toContain('user.suspend');
  });

  test('a platform operator holding audit.view still cannot read the tenant audit trail', async ({
    request,
  }) => {
    const headers = await signIn(request, 'platform-audit-viewer', IDS.platformOrganisation);

    const me = await request.get(`${FAKE_API_URL}/api/v1/auth/me`, { headers });
    expect(((await me.json()) as { permissions: string[] }).permissions).toContain('audit.view');

    const audit = await request.get(`${FAKE_API_URL}/api/v1/tenant/audit-events`, { headers });
    expect(audit.status()).toBe(403);
  });
});
```

Run (form E): `e2e/fake-api-profile.spec.ts`. Expected: FAIL. Both tokens name an unknown scenario,
so they get an empty 401.

- [ ] **Step 2: Add the scenarios**

In `e2e/fake-api/scenarios.mts`, add above `const BUILDERS = {`:

```ts
// Layer 15 (profile) seed IDs — 15000000-… per the lane rules; never reused.
const PROFILE_IDS = {
  legacyRole: '15000000-0000-4000-8000-000000000001',
  legacyGrant: '15000000-0000-4000-8000-000000000002',
  branchAdminGrant: '15000000-0000-4000-8000-000000000003',
} as const;

/**
 * Contract §C: `/auth/me` lists roles per ACTIVE assignment at any scope — so a DISABLED role
 * (which grants nothing) and TENANT_ADMIN a second time, through a BRANCH grant. Spreads
 * `greenfieldTenant()` so collections later layers add still carry over.
 */
function profileRoles(): RunState {
  const state = greenfieldTenant();
  return {
    ...state,
    roles: [
      ...state.roles,
      {
        ...role(PROFILE_IDS.legacyRole, IDS.greenfield, 'LEGACY_TELLER', 'Legacy teller', [
          'user.suspend',
        ]),
        systemRole: false,
        status: 'DISABLED',
      },
    ],
    roleAssignments: [
      ...state.roleAssignments,
      tenantRoleAssignment(
        PROFILE_IDS.legacyGrant,
        IDS.greenfield,
        IDS.jane,
        PROFILE_IDS.legacyRole,
      ),
      {
        ...tenantRoleAssignment(
          PROFILE_IDS.branchAdminGrant,
          IDS.greenfield,
          IDS.jane,
          IDS.tenantAdminRole,
        ),
        scopeType: 'BRANCH',
        branchId: IDS.headOffice,
      },
    ],
  };
}
```

Append to `BUILDERS`, after `'no-audit-permission'`:

```ts
  // Layer 15 (profile).
  'profile-roles': profileRoles,
  // The real PLATFORM_SUPER_ADMIN holds audit.view (contract §J), yet the tenant audit API rejects
  // the platform context — proves Activity is gated on the workspace, not only the permission.
  'platform-audit-viewer': () => {
    const state = platformOperator();
    return {
      ...state,
      roles: state.roles.map((candidate) => ({
        ...candidate,
        permissions: [...candidate.permissions, 'audit.view'],
      })),
    };
  },
```

The file runs under plain `node`: keep erasable syntax only, relative imports only.

Run (form E): `e2e/fake-api-profile.spec.ts e2e/fake-api.spec.ts`. Expected: PASS. The existing
fake spec proves no default seed moved.

- [ ] **Step 3: Commit** (form C)

`git add e2e/fake-api/scenarios.mts e2e/fake-api-profile.spec.ts`

```
test(e2e): add fake profile scenarios for repeated and disabled roles and a platform auditor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

### Task 3: Profile layout, hero, Overview, and the nested-route matcher

**Files:**

- Create: `modules/profile/components/profile-section.tsx`, `profile-section.test.tsx`
- Create: `app/(authenticated)/profile/layout.tsx`
- Modify (rewrite): `app/(authenticated)/profile/page.tsx`, `app/(authenticated)/profile/page.test.tsx`
- Delete: `components/profile/profile-view.tsx`, `components/profile/profile-view.test.tsx`
- Modify: `proxy.ts`, `proxy.test.ts`
- Create: `e2e/profile.spec.ts`
- Modify: `e2e/context-selection.spec.ts`, `e2e/keycloak-smoke.spec.ts` (the `/profile` assertions
  only)

**Interfaces:**

- Consumes:
  - Task 1's `requireProfile`, `workspaceHome`, `ProfileUser`;
  - 07b's `RecordHero`, `RecordTabs`/`RecordTab`, `CopyIdButton`, `enterAdmin`
    (`e2e/support/admin.ts`);
  - `DescriptionList`, `StatusChip`, `getOrganisationTimeZone`, `formatInstant`, `auth.api.getSession`.
- Produces:
  - `ProfileSection({ title: string; description?: string; actions?: ReactNode; children: ReactNode })`:
    a `section` landmark (MUI `Card`) named by its h2. Its props are exactly `SectionCard`'s minus
    `headingLevel`.
  - `/profile` renders the hero, its only h1 "My profile", and a `Profile sections` tab nav; later
    tasks append the Contexts, Roles & permissions, Security and Activity tabs.
  - `proxy.ts` matcher: `/profile/:path*`, which also matches `/profile`.

- [ ] **Step 1: Load skills**

Invoke `frontend-design` and `ui-ux-pro-max`: the design-system command with
`"account profile record page tabs identity context"`, plus
`--domain ux "account profile tabs identity security settings"`. The prototype is the reference:

- `/home/ogaba/Downloads/finaxis-admin-prototype-source-v5/finaxis-admin-prototype/src/App.jsx:1530-1680`
  (`RecordDetail` with `type="profile"`) and `1872-1935` (`SecurityPanel`);
- `src/prototype-model.js:12-27` (the profile tabs).

- [ ] **Step 2: Write the failing tests**

`modules/profile/components/profile-section.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ProfileSection } from './profile-section';

describe('ProfileSection', () => {
  it('is a section landmark named by its h2, with a description and actions', () => {
    renderWithProviders(
      <ProfileSection title="Identity" description="Who you are" actions={<button>Do it</button>}>
        <p>Body</p>
      </ProfileSection>,
    );

    const region = screen.getByRole('region', { name: 'Identity' });
    expect(within(region).getByRole('heading', { level: 2, name: 'Identity' })).toBeInTheDocument();
    expect(region).toHaveTextContent('Who you are');
    expect(region).toHaveTextContent('Body');
    expect(within(region).getByRole('button', { name: 'Do it' })).toBeInTheDocument();
  });
});
```

Rewrite `app/(authenticated)/profile/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { ApplicationContext } from '@/config/application-context';
import type { ProfileUser } from '@/modules/profile/profile-rules';

const { getSession, getOrganisationTimeZone, redirect, requireProfile } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getOrganisationTimeZone: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  requireProfile: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) as unknown }));
vi.mock('@/auth/auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSession(...args) as unknown } },
}));
vi.mock('@/lib/api/lookups', () => ({
  getOrganisationTimeZone: () => getOrganisationTimeZone() as unknown,
}));
vi.mock('@/modules/profile/profile-service', () => ({
  requireProfile: () => requireProfile() as unknown,
}));

const { default: ProfileOverviewPage } = await import('./page');

const USER: ProfileUser = {
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Jane Manager',
  email: 'jane@greenfield.example',
  roles: ['TENANT_ADMIN'],
  permissions: ['audit.view'],
  branches: [{ id: 'b-1', code: 'HEAD_OFFICE', name: 'Head Office', status: 'ACTIVE' }],
  organization: { id: 'org-1', name: 'Greenfield SACCO', code: 'greenfield', status: 'ACTIVE' },
  membershipStatus: 'ACTIVE',
  assignedRoles: [{ id: 'r-1', code: 'TENANT_ADMIN', name: 'Tenant admin', status: 'ACTIVE' }],
};
const TENANT: ApplicationContext = {
  module: { id: 'administration', name: 'Administration' },
  organization: { id: 'org-1', name: 'Greenfield SACCO' },
  branch: { id: 'b-1', name: 'Head Office' },
};
const SIGNED_IN = { session: { createdAt: new Date('2026-07-26T00:00:00.000Z') } };

describe('ProfileOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue(SIGNED_IN);
    getOrganisationTimeZone.mockResolvedValue('Africa/Nairobi');
  });

  it('shows identity and the active context, signed in at organisation time', async () => {
    requireProfile.mockResolvedValueOnce({ user: USER, context: TENANT });

    renderWithProviders(await ProfileOverviewPage());

    const identity = screen.getByRole('region', { name: 'Identity' });
    expect(identity).toHaveTextContent('Jane Manager');
    expect(within(identity).getByText('55555555')).toHaveAttribute('title', USER.id);
    expect(identity).toHaveTextContent('26 Jul 2026 · 03:00 (Africa/Nairobi)');
    const active = screen.getByRole('region', { name: 'Active context' });
    expect(active).toHaveTextContent('Administration');
    expect(active).toHaveTextContent('greenfield');
    expect(active).toHaveTextContent('Head Office');
  });

  it('uses UTC in the platform workspace without reading the tenant, and names All branches', async () => {
    requireProfile.mockResolvedValueOnce({
      user: USER,
      context: {
        module: { id: 'platform-administration', name: 'Platform Administration' },
        organization: { id: 'platform', name: 'Platform' },
        branch: null,
      },
    });

    renderWithProviders(await ProfileOverviewPage());

    expect(getOrganisationTimeZone).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Identity' })).toHaveTextContent(
      '26 Jul 2026 · 00:00 (UTC)',
    );
    expect(screen.getByRole('region', { name: 'Active context' })).toHaveTextContent(
      'All branches (institution level)',
    );
  });

  it('sends a vanished session to login', async () => {
    requireProfile.mockResolvedValueOnce({ user: USER, context: TENANT });
    getSession.mockResolvedValueOnce(null);

    await expect(ProfileOverviewPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login?reason=session_expired');
  });
});
```

In `proxy.test.ts`, change the matcher assertion in `'does not match login requests'`:

```ts
expect(config.matcher).toEqual(['/admin/:path*', '/platform-admin/:path*', '/profile/:path*']);
```

Create `e2e/profile.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { IDS } from './fake-api/scenarios.mts';
import { enterAdmin } from './support/admin';
import { authenticate } from './support/auth';

const main = (page: Page) => page.getByRole('main');
const tab = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Profile sections' })
    .getByRole('tab', { name, exact: true });

test.describe('profile', () => {
  // /profile and its tabs can be the first hit of their route tree under a cold `next dev` compile.
  test.describe.configure({ timeout: 60000 });

  test('overview: identity, active context, membership, and sign-in time', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enterAdmin(page, '/profile', { heading: 'My profile' });

    await expect(
      main(page).getByText('Backend Jane Manager · backend.jane@greenfield.example'),
    ).toBeVisible();
    await expect(main(page).getByRole('link', { name: 'Back to overview' })).toHaveAttribute(
      'href',
      '/admin',
    );
    await expect(tab(page, 'Overview')).toHaveAttribute('aria-current', 'page');

    const identity = main(page).getByRole('region', { name: 'Identity' });
    await expect(identity.getByText('55555555')).toHaveAttribute('title', IDS.jane);
    // The E2E session was created at 2026-07-26T00:00Z; Greenfield is Africa/Nairobi (UTC+3).
    await expect(identity.getByText('26 Jul 2026 · 03:00 (Africa/Nairobi)')).toBeVisible();

    const active = main(page).getByRole('region', { name: 'Active context' });
    await expect(active.getByText('Greenfield SACCO')).toBeVisible();
    await expect(active.getByText('greenfield', { exact: true })).toBeVisible();
    await expect(active.getByText('Head Office')).toBeVisible();
  });
});
```

Run (form T): `pnpm test:run modules/profile 'app/(authenticated)/profile' proxy.test.ts`. Expected:
FAIL. `ProfileSection` is missing, the page still renders `ProfileView`, and the matcher is still
`/profile`.

Run (form E): `e2e/profile.spec.ts`. Expected: FAIL. The page still renders the old "Profile" h1,
so `enterAdmin` never sees "My profile".

- [ ] **Step 3: Implement `modules/profile/components/profile-section.tsx`**

```tsx
import { useId, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';

interface ProfileSectionProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * A profile tab's surface (prototype `.surface` + `.surface-head`): an MUI Card named by its h2.
 * ponytail: SectionCard's props minus `headingLevel` — PR 07's SectionCard isn't at this layer's
 * base (F_07b); once 07 integrates, swapping the import is the whole change.
 */
export function ProfileSection({ title, description, actions, children }: ProfileSectionProps) {
  const headingId = useId();
  return (
    <Card component="section" aria-labelledby={headingId}>
      <Box
        sx={{
          minHeight: 56,
          px: 4,
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
        <Box sx={{ minWidth: 0 }}>
          <Typography id={headingId} component="h2" variant="h5" sx={{ overflowWrap: 'anywhere' }}>
            {title}
          </Typography>
          {description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {description}
            </Typography>
          )}
        </Box>
        {actions && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{actions}</Box>}
      </Box>
      {children}
    </Card>
  );
}
```

(`useId` works in a synchronous Server Component, as in 07's `SectionCard`. MUI's `Paper` default
`elevation: 0` and its border apply to `Card` too.)

- [ ] **Step 4: Implement `app/(authenticated)/profile/layout.tsx`**

```tsx
import type { ReactNode } from 'react';
import { RecordHero } from '@/components/data-display/record-hero';
import { RecordTabs, type RecordTab } from '@/components/data-display/record-tabs';
import { StatusChip } from '@/components/data-display/status-chip';
import { workspaceHome } from '@/modules/profile/profile-rules';
import { requireProfile } from '@/modules/profile/profile-service';

/**
 * Spec §10.9: the account profile as a record page — the hero here, each tab a nested route that
 * validates the session again (`requireProfile` is request-cached, so this costs nothing extra).
 */
export default async function ProfileLayout({ children }: { children: ReactNode }) {
  const { user, context } = await requireProfile();
  const tabs: RecordTab[] = [{ href: '/profile', label: 'Overview' }];

  return (
    <>
      <RecordHero
        back={{ href: workspaceHome(context.module.id), label: 'Back to overview' }}
        avatar={{ kind: 'person', name: user.name }}
        eyebrow={`${context.module.name} · Account profile`}
        title="My profile"
        subtitle={[user.name, user.email].filter(Boolean).join(' · ')}
        status={<StatusChip value={user.membershipStatus} />}
      />
      <RecordTabs label="Profile sections" tabs={tabs} />
      {children}
    </>
  );
}
```

- [ ] **Step 5: Rewrite `app/(authenticated)/profile/page.tsx` (Overview)**

```tsx
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Grid from '@mui/material/Grid';
import { auth } from '@/auth/auth';
import { CopyIdButton } from '@/components/data-display/copy-id-button';
import { DescriptionList } from '@/components/data-display/description-list';
import { StatusChip } from '@/components/data-display/status-chip';
import { getOrganisationTimeZone } from '@/lib/api/lookups';
import { formatInstant } from '@/lib/format';
import { ProfileSection } from '@/modules/profile/components/profile-section';
import { requireProfile } from '@/modules/profile/profile-service';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfileOverviewPage() {
  const { user, context } = await requireProfile();
  // requireProfile validated the session; this read is only for its sign-in time.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login?reason=session_expired');
  // Spec §9: the platform workspace uses UTC — it can't read GET /tenant.
  const timeZone =
    context.module.id === 'platform-administration' ? 'UTC' : await getOrganisationTimeZone();
  // `new Date(…)`: a Date from a fresh read, but tolerate a serialized value from the cookie cache.
  const signedIn = formatInstant(new Date(session.session.createdAt).toISOString(), timeZone);

  return (
    <Grid container spacing={4}>
      <Grid size={{ xs: 12, lg: 6 }}>
        <ProfileSection title="Identity" description="Your account, from the identity provider.">
          <DescriptionList
            columns={1}
            items={[
              { label: 'Full name', value: user.name },
              { label: 'Email', value: user.email || '—' },
              { label: 'User ID', value: <CopyIdButton value={user.id} label="User ID" /> },
              { label: 'Signed in', value: `${signedIn.date} · ${signedIn.time} (${timeZone})` },
            ]}
          />
        </ProfileSection>
      </Grid>
      <Grid size={{ xs: 12, lg: 6 }}>
        <ProfileSection title="Active context" description="Where your actions apply right now.">
          <DescriptionList
            columns={1}
            items={[
              { label: 'Workspace', value: context.module.name },
              { label: 'Organisation', value: user.organization.name },
              { label: 'Organisation code', value: user.organization.code },
              {
                label: 'Organisation status',
                value: <StatusChip value={user.organization.status} />,
              },
              {
                label: 'Branch',
                value: context.branch?.name ?? 'All branches (institution level)',
              },
              { label: 'Membership', value: <StatusChip value={user.membershipStatus} /> },
            ]}
          />
        </ProfileSection>
      </Grid>
    </Grid>
  );
}
```

Then remove the old view, which nothing else imports:

```bash
git rm components/profile/profile-view.tsx components/profile/profile-view.test.tsx
```

In `proxy.ts`, change the matcher to:

```ts
export const config = {
  matcher: ['/admin/:path*', '/platform-admin/:path*', '/profile/:path*'],
};
```

Without this, nested tabs skip the cookie redirect and lose `REQUEST_PATHNAME_HEADER`, so a stale
context would return the user to `/profile` instead of their tab.

Run (form T): the same paths. Expected: PASS.

- [ ] **Step 6: Update the existing `/profile` assertions**

In `e2e/context-selection.spec.ts`, test "selects organisation and branch through same-origin route
boundaries before rendering profile", replace these lines:

```ts
await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
await expect(page.getByRole('heading', { name: 'Backend Jane Manager' })).toBeVisible();
// Scoped to `main`: the account trigger in the banner also shows the user's email now.
await expect(main.getByText('backend.jane@greenfield.example')).toBeVisible();
await expect(main.getByText('user.view')).toBeVisible();
```

with:

```ts
await expect(page.getByRole('heading', { level: 1, name: 'My profile' })).toBeVisible();
// Scoped to `main`: the account trigger in the banner also shows the user's name and email.
await expect(
  main.getByText('Backend Jane Manager · backend.jane@greenfield.example'),
).toBeVisible();
```

Leave the rest of the file as it is. Permissions now live on the Roles & permissions tab
(`e2e/profile.spec.ts`, Task 4).

In `e2e/keycloak-smoke.spec.ts` (manual, real Keycloak), replace:

```ts
await page.goto('/profile');
await expect(page.getByText('No branches assigned')).toBeVisible();
await expect(page.getByText('No application roles assigned')).toBeVisible();
```

with:

```ts
await page.goto('/profile/contexts');
await expect(page.getByText('No branches assigned')).toBeVisible();
await page.goto('/profile/roles');
await expect(page.getByText('No application roles assigned')).toBeVisible();
```

(The smoke is manual and needs a real Keycloak, so it isn't run here. Its copy comes from the Task 4
tabs.)

Run (form E): `e2e/profile.spec.ts e2e/context-selection.spec.ts e2e/protected-routes.spec.ts`.
Expected: PASS.

- [ ] **Step 7: Commit** (form C)

`git add modules/profile/components/profile-section.tsx modules/profile/components/profile-section.test.tsx 'app/(authenticated)/profile/layout.tsx' 'app/(authenticated)/profile/page.tsx' 'app/(authenticated)/profile/page.test.tsx' proxy.ts proxy.test.ts e2e/profile.spec.ts e2e/context-selection.spec.ts e2e/keycloak-smoke.spec.ts`

(The `git rm` in Step 5 already staged the two deletions.)

```
feat(profile): turn the profile into a record page with an Overview tab and protect nested tabs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

### Task 4: Contexts, Roles & permissions, and Security tabs

**Files:**

- Create: `modules/profile/components/name-cell.tsx`, `name-cell.test.tsx`
- Create: `modules/profile/components/permission-groups.tsx`, `permission-groups.test.tsx`
- Create: `modules/profile/components/switch-context-button.tsx` (client),
  `switch-context-button.test.tsx`
- Create: `app/(authenticated)/profile/contexts/page.tsx` + `page.test.tsx`,
  `app/(authenticated)/profile/roles/page.tsx`, `app/(authenticated)/profile/security/page.tsx` +
  `page.test.tsx`
- Modify: `app/(authenticated)/profile/layout.tsx` (three tabs), `e2e/profile.spec.ts`

**Interfaces:**

- Consumes:
  - Task 1's `requireProfile`, `listMyOrganisations`, `groupPermissions`, `PermissionGroup`;
  - Task 2's `profile-roles` scenario; the existing `multi-org`, `duplicate-assignments` and
    `suspended-branch` scenarios;
  - 05's `ContextSwitcherDialog`; 06's `load`, `parsePaging`, `lastPageIfPastEnd`, `toQueryString`,
    `toSearchParams`, `TablePaginationBar`, `ListNavigationProvider`, `ListNavigationProgress`,
    `ListBusyRegion`, `EmptyState`, `ErrorState`, `StatusChip`;
  - `serverEnv.PLATFORM_ORGANISATION_ID` and `serverEnv.KEYCLOAK_ISSUER`.
- Produces:
  - `NameCell({ name: string; code: string; current?: boolean })`: a table cell with a bold name,
    an optional "Current" chip and a code caption, which wraps at 375 px.
  - `PermissionGroups({ groups: readonly PermissionGroup[] })`: each group is an h3 plus a list
    named by it, with codes as chips.
  - `SwitchContextButton({ platformOrganisationId: string })`: the button "Switch context", which
    opens its own `ContextSwitcherDialog`.
  - The routes `/profile/contexts?page&size`, `/profile/roles` and `/profile/security`.

- [ ] **Step 1: Load skills**

Invoke `frontend-design` and `ui-ux-pro-max`
(`--domain ux "permission list grouping chips working context switcher external link security"`).

- [ ] **Step 2: Write the failing tests**

`modules/profile/components/name-cell.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { NameCell } from './name-cell';

const renderCell = (current?: boolean) =>
  renderWithProviders(
    <table>
      <tbody>
        <tr>
          <NameCell name="Westlands Branch" code="WESTLANDS" current={current} />
        </tr>
      </tbody>
    </table>,
  );

describe('NameCell', () => {
  it('shows the name and its code, and the Current marker only when current', () => {
    const { unmount } = renderCell(true);
    const cell = screen.getByRole('cell');
    expect(cell).toHaveTextContent('Westlands Branch');
    expect(cell).toHaveTextContent('WESTLANDS');
    expect(cell).toHaveTextContent('Current');
    unmount();

    renderCell();
    expect(screen.getByRole('cell')).toHaveTextContent('WESTLANDS');
    expect(screen.getByRole('cell')).not.toHaveTextContent('Current');
  });
});
```

`modules/profile/components/permission-groups.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { groupPermissions } from '../profile-rules';
import { PermissionGroups } from './permission-groups';

describe('PermissionGroups', () => {
  it('renders one list per prefix, named by its heading, with codes as items', () => {
    renderWithProviders(
      <PermissionGroups
        groups={groupPermissions(['audit.view', 'business_date.view', 'business_date.advance'])}
      />,
    );

    expect(screen.getByRole('heading', { level: 3, name: 'Audit' })).toBeInTheDocument();
    const dates = screen.getByRole('list', { name: 'Business date' });
    expect(
      within(dates)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['business_date.advance', 'business_date.view']);
  });
});
```

`modules/profile/components/switch-context-button.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { SwitchContextButton } from './switch-context-button';

vi.mock('@/components/shell/context-switcher-dialog', () => ({
  ContextSwitcherDialog: ({
    open,
    onClose,
    platformOrganisationId,
  }: {
    open: boolean;
    onClose: () => void;
    platformOrganisationId: string;
  }) =>
    open ? (
      <div role="dialog" aria-label="Switch working context">
        {platformOrganisationId}
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

describe('SwitchContextButton', () => {
  it('opens the shared context dialog and closes it again', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SwitchContextButton platformOrganisationId="platform-org" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Switch context' }));
    expect(screen.getByRole('dialog', { name: 'Switch working context' })).toHaveTextContent(
      'platform-org',
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
```

`app/(authenticated)/profile/contexts/page.test.tsx` covers the list page's own states. No E2E seeds
a failing or overcounting `/auth/organisations`, and coverage excludes `app/**/page.tsx`.

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import type { ApplicationContext } from '@/config/application-context';
import type { ProfileUser } from '@/modules/profile/profile-rules';
import { renderWithProviders } from '@/test/test-utils';

const { listMyOrganisations, redirect, requireProfile, router } = vi.hoisted(() => ({
  listMyOrganisations: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  requireProfile: vi.fn(),
  // One stable router object, as in table-pagination-bar.test.tsx.
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => {
  // The real `unstable_rethrow` for load(), plus the pagination bar's hooks outside an app router.
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    redirect: (to: string) => redirect(to) as unknown,
    usePathname: () => '/profile/contexts',
    useRouter: () => router,
    useSearchParams: () => new URLSearchParams(),
  };
});
vi.mock('@/config/env.server', () => ({
  serverEnv: { PLATFORM_ORGANISATION_ID: 'platform-org' },
}));
vi.mock('@/modules/profile/components/switch-context-button', () => ({
  SwitchContextButton: () => <button type="button">Switch context</button>,
}));
vi.mock('@/modules/profile/profile-service', () => ({
  listMyOrganisations: (...args: unknown[]) => listMyOrganisations(...args) as unknown,
  requireProfile: () => requireProfile() as unknown,
}));

const { default: ProfileContextsPage } = await import('./page');

const USER: ProfileUser = {
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Jane Manager',
  email: 'jane@greenfield.example',
  roles: [],
  permissions: [],
  branches: [
    { id: 'b-1', code: 'HEAD_OFFICE', name: 'Head Office', status: 'ACTIVE' },
    { id: 'b-2', code: 'WESTLANDS', name: 'Westlands Branch', status: 'SUSPENDED' },
  ],
  organization: { id: 'org-1', name: 'Greenfield SACCO', code: 'greenfield', status: 'ACTIVE' },
  membershipStatus: 'ACTIVE',
  assignedRoles: [],
};
const TENANT: ApplicationContext = {
  module: { id: 'administration', name: 'Administration' },
  organization: { id: 'org-1', name: 'Greenfield SACCO' },
  branch: { id: 'b-1', name: 'Head Office' },
};
const ORGANISATIONS = [
  { id: 'org-1', code: 'greenfield', name: 'Greenfield SACCO', membershipStatus: 'ACTIVE' },
  { id: 'org-2', code: 'lakeside', name: 'Lakeside SACCO', membershipStatus: 'ACTIVE' },
];
const FIRST_PAGE = {
  number: 0,
  size: 10,
  totalItems: 2,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
};
// BG-23: 21 memberships counted, then filtered after paging.
const OVERCOUNTED = { size: 20, totalItems: 21, totalPages: 2, hasNext: false, hasPrevious: true };
const render = async (query: Record<string, string> = {}) => {
  renderWithProviders(await ProfileContextsPage({ searchParams: Promise.resolve(query) }));
};

describe('ProfileContextsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireProfile.mockResolvedValue({ user: USER, context: TENANT });
  });

  it('reads the URL page and marks the current organisation and branch', async () => {
    listMyOrganisations.mockResolvedValueOnce({ items: ORGANISATIONS, page: FIRST_PAGE });

    await render();

    expect(listMyOrganisations).toHaveBeenCalledWith({ page: 0, size: 10 });
    const organisations = screen.getByRole('table', { name: 'Organisations' });
    expect(within(organisations).getByRole('row', { name: /Greenfield SACCO/ })).toHaveTextContent(
      'Current',
    );
    expect(
      within(organisations).getByRole('row', { name: /Lakeside SACCO/ }),
    ).not.toHaveTextContent('Current');
    const branches = screen.getByRole('table', { name: 'Branches in Greenfield SACCO' });
    expect(within(branches).getByRole('row', { name: /Head Office/ })).toHaveTextContent('Current');
    expect(within(branches).getByRole('row', { name: /Westlands Branch/ })).not.toHaveTextContent(
      'Current',
    );
  });

  it('shows the safe error state with its support reference when the read fails', async () => {
    listMyOrganisations.mockRejectedValueOnce(new BackendApiError(503, { requestId: 'req-1' }));

    await render();

    const organisations = screen.getByRole('region', { name: 'Organisations' });
    expect(within(organisations).getByRole('alert')).toHaveTextContent('req-1');
    // Branches come from /auth/me, not this read, so they still render.
    expect(screen.getByRole('table', { name: 'Branches in Greenfield SACCO' })).toBeInTheDocument();
  });

  it('sends a page past the end to the last page, keeping the size', async () => {
    listMyOrganisations.mockResolvedValueOnce({ items: [], page: { ...OVERCOUNTED, number: 5 } });

    await expect(render({ page: '5', size: '20' })).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/profile/contexts?size=20&page=1');
  });

  it('explains an empty in-range page and keeps the pagination bar (BG-23)', async () => {
    listMyOrganisations.mockResolvedValueOnce({ items: [], page: { ...OVERCOUNTED, number: 1 } });

    await render({ page: '1', size: '20' });

    expect(redirect).not.toHaveBeenCalled();
    const organisations = screen.getByRole('region', { name: 'Organisations' });
    expect(organisations).toHaveTextContent('No organisations on this page');
    expect(within(organisations).queryByRole('table')).not.toBeInTheDocument();
    expect(within(organisations).getByRole('button', { name: /previous page/i })).toBeEnabled();
  });
});
```

`app/(authenticated)/profile/security/page.test.tsx` proves the link comes from configuration only:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

vi.mock('@/config/env.server', () => ({
  // A trailing slash, to prove the path isn't doubled.
  serverEnv: { KEYCLOAK_ISSUER: 'https://id.example/realms/finaxis/' },
}));
vi.mock('@/modules/profile/profile-service', () => ({
  requireProfile: () => Promise.resolve({}),
}));

const { default: ProfileSecurityPage } = await import('./page');

describe('ProfileSecurityPage', () => {
  it("opens the configured realm's account console in a new tab", async () => {
    renderWithProviders(await ProfileSecurityPage());

    const link = screen.getByRole('link', { name: /Open account console/ });
    expect(link).toHaveAttribute('href', 'https://id.example/realms/finaxis/account');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
```

Append to `e2e/profile.spec.ts`. Add `addCookie`, `CONTEXT_COOKIE_NAME` and `selectMuiOption` to the
`./support/auth` import. Add these tests inside `test.describe('profile')`, after the overview test:

```ts
test('sends a stale context on a nested tab through context selection and back to that tab', async ({
  context,
  page,
}, testInfo) => {
  await authenticate(context, testInfo);
  await addCookie(context, testInfo, CONTEXT_COOKIE_NAME, 'stale-context-token');

  await page.goto('/profile/contexts');
  await expect(page).toHaveURL(/\/select-context\?next=%2Fprofile%2Fcontexts$/, {
    timeout: 20000,
  });
  await selectMuiOption(page, 'Organisation', /Greenfield/);
  await selectMuiOption(page, 'Branch', /Head Office/);

  await expect(page).toHaveURL((url) => url.pathname === '/profile/contexts', { timeout: 15000 });
  await expect(tab(page, 'Contexts')).toHaveAttribute('aria-current', 'page');
});

test('contexts: lists organisations and branches, and switches branch without leaving the tab', async ({
  context,
  page,
}, testInfo) => {
  await authenticate(context, testInfo, 'multi-org');
  await enterAdmin(page, '/profile/contexts', { heading: 'My profile' });

  const organisations = main(page).getByRole('table', { name: 'Organisations' });
  await expect(organisations.getByRole('row', { name: /Greenfield SACCO/ })).toContainText(
    'Current',
  );
  await expect(organisations.getByRole('row', { name: /Platform/ })).not.toContainText('Current');
  const branches = main(page).getByRole('table', { name: 'Branches in Greenfield SACCO' });
  await expect(branches.getByRole('row', { name: /Head Office/ })).toContainText('Current');

  await main(page).getByRole('button', { name: 'Switch context' }).click();
  const dialog = page.getByRole('dialog', { name: /switch working context/i });
  // First hit of the run's /api/context/organisations route handler (a cold `next dev` compile).
  await expect(dialog.getByRole('combobox', { name: 'Organisation' })).toBeVisible({
    timeout: 20000,
  });
  await dialog.getByRole('combobox', { name: 'Organisation' }).click();
  await page.getByRole('option', { name: /Greenfield/ }).click();
  await dialog.getByRole('combobox', { name: 'Branch' }).click();
  await page.getByRole('option', { name: /Westlands/ }).click();

  await expect(
    page.getByRole('alert').filter({ hasText: /Switched to Greenfield SACCO/ }),
  ).toBeVisible();
  await expect(page).toHaveURL((url) => url.pathname === '/profile/contexts');
  await expect(branches.getByRole('row', { name: /Westlands Branch/ })).toContainText('Current', {
    timeout: 15000,
  });
  await expect(branches.getByRole('row', { name: /Head Office/ })).not.toContainText('Current');
});

test('contexts: one row per branch even when the backend repeats it', async ({
  context,
  page,
}, testInfo) => {
  await authenticate(context, testInfo, 'duplicate-assignments');
  // One distinct branch: context selection auto-pins it, so there's no branch step.
  await enterAdmin(page, '/profile/contexts', { heading: 'My profile', branch: null });

  const branches = main(page).getByRole('table', { name: 'Branches in Greenfield SACCO' });
  await expect(branches.getByRole('row', { name: /Head Office/ })).toHaveCount(1);
});

test('contexts: a suspended branch assignment is listed as suspended', async ({
  context,
  page,
}, testInfo) => {
  await authenticate(context, testInfo, 'suspended-branch');
  // Westlands is SUSPENDED, so Head Office is the only selectable branch and gets auto-pinned.
  await enterAdmin(page, '/profile/contexts', { heading: 'My profile', branch: null });

  const branches = main(page).getByRole('table', { name: 'Branches in Greenfield SACCO' });
  await expect(branches.getByRole('row', { name: /Westlands Branch/ })).toContainText('Suspended');
});

test('roles & permissions: one row per role, a disabled role, and permissions grouped by prefix', async ({
  context,
  page,
}, testInfo) => {
  await authenticate(context, testInfo, 'profile-roles');
  await enterAdmin(page, '/profile/roles', { heading: 'My profile' });

  const roles = main(page).getByRole('table', { name: 'Roles' });
  await expect(roles.getByRole('row', { name: /Tenant admin/ })).toHaveCount(1);
  await expect(roles.getByRole('row', { name: /Legacy teller/ })).toContainText('Disabled');

  // Presence only: later layers grow TENANT_ADMIN_PERMISSIONS, so never count codes or groups.
  const permissions = main(page).getByRole('region', { name: 'Effective permissions' });
  await expect(
    permissions.getByRole('list', { name: 'Audit' }).getByText('audit.view', { exact: true }),
  ).toBeVisible();
  await expect(permissions.getByRole('heading', { level: 3, name: 'IAM' })).toBeVisible();
  await expect(permissions.getByText('user.suspend', { exact: true })).toHaveCount(0);
});

test('security: opens the Keycloak account console in a new tab', async ({
  context,
  page,
}, testInfo) => {
  await authenticate(context, testInfo);
  await enterAdmin(page, '/profile/security', { heading: 'My profile' });

  const accountLink = main(page).getByRole('link', { name: /Open account console/ });
  // CI's issuer is http://localhost:8080/realms/finaxis; .env.local's differs — match the suffix.
  await expect(accountLink).toHaveAttribute('href', /\/account$/);
  await expect(accountLink).toHaveAttribute('target', '_blank');
  await expect(accountLink).toHaveAttribute('rel', 'noopener noreferrer');
});
```

Run (form T): `pnpm test:run modules/profile/components 'app/(authenticated)/profile'`. Expected:
FAIL. `NameCell`, `PermissionGroups`, `SwitchContextButton` and the contexts and security pages are
missing. (Task 3's `profile-section` and overview tests still pass.)

Run (form E): `e2e/profile.spec.ts`. Expected: FAIL. The overview test passes, but the Contexts,
Roles & permissions and Security tabs and routes are missing.

- [ ] **Step 3: Implement the components**

`modules/profile/components/name-cell.tsx`:

```tsx
import Box from '@mui/material/Box';
import TableCell from '@mui/material/TableCell';
import Typography from '@mui/material/Typography';
import { StatusChip } from '@/components/data-display/status-chip';

/** A bold name with an optional "Current" marker, its code underneath; long values wrap. */
export function NameCell({
  name,
  code,
  current = false,
}: {
  name: string;
  code: string;
  current?: boolean;
}) {
  return (
    <TableCell>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
          {name}
        </Typography>
        {current && <StatusChip value="CURRENT" label="Current" tone="info" />}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
        {code}
      </Typography>
    </TableCell>
  );
}
```

`modules/profile/components/permission-groups.tsx`:

```tsx
import { useId } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type { PermissionGroup } from '../profile-rules';

/**
 * Effective permission codes grouped by prefix (lane ownership: 15). Bounded by the catalogue
 * (80 codes), so no paging; each group is a list named by its h3.
 */
export function PermissionGroups({ groups }: { groups: readonly PermissionGroup[] }) {
  const baseId = useId();
  return (
    <Box
      sx={{
        px: 4,
        py: 3.5,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        gap: 3.5,
      }}
    >
      {groups.map((group, index) => {
        const headingId = `${baseId}-${String(index)}`;
        return (
          <Box key={group.prefix} sx={{ minWidth: 0 }}>
            <Typography id={headingId} component="h3" variant="subtitle2" sx={{ mb: 1.5 }}>
              {group.label}
            </Typography>
            <Box
              component="ul"
              aria-labelledby={headingId}
              sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 1 }}
            >
              {group.codes.map((code) => (
                <Box component="li" key={code} sx={{ maxWidth: '100%' }}>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={code}
                    sx={{ maxWidth: '100%', fontFamily: 'monospace' }}
                  />
                </Box>
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
```

`modules/profile/components/switch-context-button.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import SwapHorizOutlined from '@mui/icons-material/SwapHorizOutlined';
import { ContextSwitcherDialog } from '@/components/shell/context-switcher-dialog';

/**
 * The Contexts tab's switch action (spec §10.9): the shared context dialog, as its own instance —
 * lifting AppShell's dialog state would edit the shell PR 07 edits in parallel. A same-organisation
 * switch refreshes this tab; another organisation lands on its workspace home (the dialog's rule).
 */
export function SwitchContextButton({
  platformOrganisationId,
}: {
  platformOrganisationId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outlined"
        startIcon={<SwapHorizOutlined />}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
        }}
      >
        Switch context
      </Button>
      <ContextSwitcherDialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        platformOrganisationId={platformOrganisationId}
      />
    </>
  );
}
```

Run (form T): `pnpm test:run modules/profile/components`. Expected: PASS.

- [ ] **Step 4: Implement the three pages**

`app/(authenticated)/profile/contexts/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ListNavigationProvider } from '@/components/data-display/list-navigation-context';
import {
  ListBusyRegion,
  ListNavigationProgress,
} from '@/components/data-display/list-pending-indicator';
import { StatusChip } from '@/components/data-display/status-chip';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { serverEnv } from '@/config/env.server';
import { load } from '@/lib/api/load';
import { lastPageIfPastEnd, parsePaging } from '@/lib/api/paging';
import { toQueryString, toSearchParams } from '@/lib/api/query-string';
import { NameCell } from '@/modules/profile/components/name-cell';
import { ProfileSection } from '@/modules/profile/components/profile-section';
import { SwitchContextButton } from '@/modules/profile/components/switch-context-button';
import { listMyOrganisations, requireProfile } from '@/modules/profile/profile-service';

export const metadata: Metadata = { title: 'Contexts · Profile' };

/** Directories default to 10 rows (spec §6.2). */
const DEFAULT_PAGE_SIZE = 10;

interface ProfileContextsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProfileContextsPage({ searchParams }: ProfileContextsPageProps) {
  const params = toSearchParams(await searchParams);
  const { user, context } = await requireProfile();
  const organisations = await load(listMyOrganisations(parsePaging(params, DEFAULT_PAGE_SIZE)));

  // Outside load(), like the audit page: a bookmarked page past the end goes to the last one.
  if (organisations.ok) {
    const lastPage = lastPageIfPastEnd(organisations.value.page);
    if (lastPage !== null) {
      redirect(
        `/profile/contexts${toQueryString({
          size: params.get('size') ?? undefined,
          page: lastPage === 0 ? undefined : lastPage,
        })}`,
      );
    }
  }

  const branchLabel = context.branch?.name ?? 'All branches (institution level)';
  const branchesTitle = `Branches in ${user.organization.name}`;

  return (
    <Stack spacing={4}>
      <ProfileSection
        title="Organisations"
        description="Where you hold an active membership. Switching re-checks your access and never grants more."
        actions={
          <SwitchContextButton platformOrganisationId={serverEnv.PLATFORM_ORGANISATION_ID} />
        }
      >
        {organisations.ok ? (
          <ListNavigationProvider>
            <Box sx={{ position: 'relative' }}>
              <ListNavigationProgress />
              <ListBusyRegion>
                {organisations.value.items.length === 0 ? (
                  // BG-23: the backend filters after paging, so an in-range page can be empty.
                  <EmptyState
                    title="No organisations on this page"
                    description="Go back a page to see your organisations."
                  />
                ) : (
                  <TableContainer>
                    <Table aria-label="Organisations">
                      <TableHead>
                        <TableRow>
                          <TableCell>Organisation</TableCell>
                          <TableCell>Membership</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {organisations.value.items.map((organisation) => (
                          <TableRow key={organisation.id}>
                            <NameCell
                              name={organisation.name}
                              code={organisation.code}
                              current={organisation.id === context.organization.id}
                            />
                            <TableCell>
                              <StatusChip value={organisation.membershipStatus} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
                <TablePaginationBar page={organisations.value.page} />
              </ListBusyRegion>
            </Box>
          </ListNavigationProvider>
        ) : (
          <ErrorState problem={organisations.problem} />
        )}
      </ProfileSection>

      <ProfileSection
        title={branchesTitle}
        description={`You're working at ${branchLabel}. Only active branches can be selected.`}
      >
        {user.branches.length === 0 ? (
          <EmptyState
            title="No branches assigned"
            description="You work at institution level (All branches)."
          />
        ) : (
          // Bounded by your own assignments (from /auth/me, de-duplicated), so no paging.
          <TableContainer>
            <Table aria-label={branchesTitle}>
              <TableHead>
                <TableRow>
                  <TableCell>Branch</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {user.branches.map((branch) => (
                  <TableRow key={branch.id}>
                    <NameCell
                      name={branch.name}
                      code={branch.code}
                      current={branch.id === context.branch?.id}
                    />
                    <TableCell>
                      <StatusChip value={branch.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </ProfileSection>
    </Stack>
  );
}
```

`app/(authenticated)/profile/roles/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { EmptyState } from '@/components/data-display/empty-state';
import { StatusChip } from '@/components/data-display/status-chip';
import { NameCell } from '@/modules/profile/components/name-cell';
import { PermissionGroups } from '@/modules/profile/components/permission-groups';
import { ProfileSection } from '@/modules/profile/components/profile-section';
import { groupPermissions } from '@/modules/profile/profile-rules';
import { requireProfile } from '@/modules/profile/profile-service';

export const metadata: Metadata = { title: 'Roles & permissions · Profile' };

export default async function ProfileRolesPage() {
  const { user, context } = await requireProfile();
  const groups = groupPermissions(user.permissions);
  const where = `${user.organization.name} · ${context.branch?.name ?? 'All branches'}`;

  return (
    <Stack spacing={4}>
      <ProfileSection
        title="Roles"
        description="Every role assigned to you in this organisation, at any scope. A disabled role grants nothing."
      >
        {user.assignedRoles.length === 0 ? (
          <EmptyState title="No application roles assigned" />
        ) : (
          <TableContainer>
            <Table aria-label="Roles">
              <TableHead>
                <TableRow>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {user.assignedRoles.map((role) => (
                  <TableRow key={role.id}>
                    <NameCell name={role.name} code={role.code} />
                    <TableCell>
                      <StatusChip value={role.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </ProfileSection>

      <ProfileSection
        title="Effective permissions"
        description={`What you can do in ${where}. Branch-scoped grants count only while their branch is selected.`}
      >
        {groups.length === 0 ? (
          <EmptyState title="No application permissions assigned" />
        ) : (
          <PermissionGroups groups={groups} />
        )}
      </ProfileSection>
    </Stack>
  );
}
```

`app/(authenticated)/profile/security/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import { DescriptionList } from '@/components/data-display/description-list';
import { serverEnv } from '@/config/env.server';
import { ProfileSection } from '@/modules/profile/components/profile-section';
import { requireProfile } from '@/modules/profile/profile-service';

export const metadata: Metadata = { title: 'Security · Profile' };

export default async function ProfileSecurityPage() {
  await requireProfile();
  // Keycloak's account console root for the configured realm. Deep links (signing-in, device
  // activity) differ between Keycloak versions, so none are used. Built from validated config only.
  const accountConsoleUrl = `${serverEnv.KEYCLOAK_ISSUER.replace(/\/$/, '')}/account`;

  return (
    <ProfileSection
      title="Sign-in and security"
      description="Your identity provider (Keycloak) manages how you sign in."
    >
      <DescriptionList
        columns={1}
        items={[
          { label: 'Password', value: 'Change it in your account console.' },
          {
            label: 'Multi-factor authentication',
            value: 'Set it up or replace it in your account console.',
          },
          {
            label: 'Active sessions',
            value: 'Review your devices and sign out of the others in your account console.',
          },
        ]}
      />
      <Box sx={{ px: 4.5, pb: 4.5, display: 'grid', justifyItems: 'start', gap: 3 }}>
        {/* BG-17: MFA and session state live only in Keycloak. */}
        <Alert severity="info">
          Finaxis doesn&apos;t show your password, MFA, or session status. Your account console is
          the source of truth.
        </Alert>
        <Button
          variant="contained"
          component="a"
          href={accountConsoleUrl}
          target="_blank"
          rel="noopener noreferrer"
          endIcon={<OpenInNewOutlined />}
          aria-label="Open account console (opens in a new tab)"
        >
          Open account console
        </Button>
      </Box>
    </ProfileSection>
  );
}
```

In `app/(authenticated)/profile/layout.tsx`, replace the `tabs` line with:

```ts
const tabs: RecordTab[] = [
  { href: '/profile', label: 'Overview' },
  { href: '/profile/contexts', label: 'Contexts' },
  { href: '/profile/roles', label: 'Roles & permissions' },
  { href: '/profile/security', label: 'Security' },
];
```

Run (form T): `pnpm test:run modules/profile 'app/(authenticated)/profile'`. Expected: PASS.

Run (form E): `e2e/profile.spec.ts`. Expected: PASS.

- [ ] **Step 5: Commit** (form C)

`git add modules/profile/components/name-cell.tsx modules/profile/components/name-cell.test.tsx modules/profile/components/permission-groups.tsx modules/profile/components/permission-groups.test.tsx modules/profile/components/switch-context-button.tsx modules/profile/components/switch-context-button.test.tsx 'app/(authenticated)/profile/contexts/page.tsx' 'app/(authenticated)/profile/contexts/page.test.tsx' 'app/(authenticated)/profile/roles/page.tsx' 'app/(authenticated)/profile/security/page.tsx' 'app/(authenticated)/profile/security/page.test.tsx' 'app/(authenticated)/profile/layout.tsx' e2e/profile.spec.ts`

```
feat(profile): add the contexts, roles and permissions, and security tabs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

### Task 5: Activity tab, the axe matrix, and the README tree

**Files:**

- Create: `app/(authenticated)/profile/activity/page.tsx`, `page.test.tsx`
- Modify: `app/(authenticated)/profile/layout.tsx` (the Activity tab), `e2e/profile.spec.ts`
- Modify (kit, one additive `refactor(kit):` commit): `components/data-display/record-tabs.tsx`,
  `components/data-display/record-tabs.test.tsx`
- Modify: `README.md` (the directory tree only)

**Interfaces:**

- Consumes:
  - Task 1's `canViewActivity`, `requireProfile`;
  - 07b's `RecordAuditTab`/`RecordAuditView`, `ForbiddenState`, and `A11Y_CASES`, `applyA11yCase`,
    `expectA11yCaseApplied`, `expectNoSeriousOrCriticalViolations` (`e2e/support/admin.ts`);
  - Task 2's `platform-audit-viewer`; the existing `no-audit-permission` and `long-names` scenarios.
- Produces:
  - the route `/profile/activity?page&size`, whose tab shows only when
    `canViewActivity(user, module)` holds;
  - `RecordTab.exact?: boolean` (kit, additive): an exact tab matches only its own `href`, never a
    sub-route. Existing callers are unchanged.

- [ ] **Step 1: Kit — let a record tab match only its own path**

Without this, a direct link to a hidden tab (`/profile/activity` without `audit.view`, or in the
platform context) marks Overview as `aria-current="page"`, because `RecordTabs` picks the deepest
ancestor tab. Assistive tech would then announce the wrong page.

Append to `components/data-display/record-tabs.test.tsx`, inside `describe('RecordTabs')`:

```tsx
it('lets an exact tab own only its own path, so a hidden sub-route marks no tab', () => {
  pathname = '/admin/branches/b1/hidden';
  renderWithProviders(
    <RecordTabs
      label="Sections"
      tabs={[{ href: '/admin/branches/b1', label: 'Overview', exact: true }, ...TABS.slice(1)]}
    />,
  );

  for (const tab of screen.getAllByRole('tab')) {
    expect(tab).toHaveAttribute('aria-selected', 'false');
    expect(tab).not.toHaveAttribute('aria-current');
  }
});
```

Run (form T): `pnpm test:run components/data-display/record-tabs.test.tsx`. Expected: FAIL (Overview
still claims the sub-route).

In `components/data-display/record-tabs.tsx`, add the optional field to `RecordTab`:

```ts
  /** Match only `href` itself, never a sub-route. For a record root whose sibling tabs can be
   * hidden, so a hidden tab's direct link marks no tab current. */
  exact?: boolean;
```

In `activeTab`, change the match to:

```ts
const matches = pathname === tab.href || (!tab.exact && pathname.startsWith(`${tab.href}/`));
```

Run (form T): the same file. Expected: PASS.

Commit (form C): `git add components/data-display/record-tabs.tsx components/data-display/record-tabs.test.tsx`

```
refactor(kit): let a record tab match only its own path

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Announce it to X (Scope; lane rules §6): an additive optional prop, with no change for existing
callers.

- [ ] **Step 2: Write the failing tests**

`app/(authenticated)/profile/activity/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { ApplicationContext } from '@/config/application-context';
import type { ProfileUser } from '@/modules/profile/profile-rules';

const { recordAuditTab, requireProfile } = vi.hoisted(() => ({
  recordAuditTab: vi.fn(),
  requireProfile: vi.fn(),
}));
vi.mock('@/modules/profile/profile-service', () => ({
  requireProfile: () => requireProfile() as unknown,
}));
vi.mock('@/modules/administration/audit/components/record-audit-tab', () => ({
  RecordAuditTab: (props: unknown) => {
    recordAuditTab(props);
    return <p>audit tab</p>;
  },
}));

const { default: ProfileActivityPage } = await import('./page');

const USER: ProfileUser = {
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Jane Manager',
  email: 'jane@greenfield.example',
  roles: [],
  permissions: ['audit.view'],
  branches: [],
  organization: { id: 'org-1', name: 'Greenfield SACCO', code: 'greenfield', status: 'ACTIVE' },
  membershipStatus: 'ACTIVE',
  assignedRoles: [],
};
const TENANT: ApplicationContext = {
  module: { id: 'administration', name: 'Administration' },
  organization: { id: 'org-1', name: 'Greenfield SACCO' },
  branch: null,
};
const PLATFORM: ApplicationContext = {
  module: { id: 'platform-administration', name: 'Platform Administration' },
  organization: { id: 'platform', name: 'Platform' },
  branch: null,
};
const render = async (query: Record<string, string> = {}) => {
  renderWithProviders(await ProfileActivityPage({ searchParams: Promise.resolve(query) }));
};

describe('ProfileActivityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists what the user performed, paged from the URL', async () => {
    requireProfile.mockResolvedValueOnce({ user: USER, context: TENANT });

    await render({ page: '2' });

    const props = recordAuditTab.mock.calls[0]?.[0] as { params: URLSearchParams };
    expect(props).toMatchObject({
      views: [{ value: 'performed', label: 'Performed by me', filter: { actorId: USER.id } }],
      path: '/profile/activity',
      title: 'Activity',
    });
    expect(props.params.get('page')).toBe('2');
  });

  it('never requests the tenant audit trail in the platform workspace, even with audit.view', async () => {
    requireProfile.mockResolvedValueOnce({ user: USER, context: PLATFORM });

    await render();

    expect(screen.getByText("Activity isn't available in the platform workspace")).toBeVisible();
    expect(recordAuditTab).not.toHaveBeenCalled();
  });

  it('explains a missing audit.view instead of requesting a 403', async () => {
    requireProfile.mockResolvedValueOnce({
      user: { ...USER, permissions: ['user.view'] },
      context: TENANT,
    });

    await render();

    expect(screen.getByText("You don't have permission")).toBeVisible();
    expect(recordAuditTab).not.toHaveBeenCalled();
  });
});
```

Append to `e2e/profile.spec.ts`. Add `A11Y_CASES`, `applyA11yCase`, `expectA11yCaseApplied` and
`expectNoSeriousOrCriticalViolations` to the `./support/admin` import. Add the three activity
tests inside `test.describe('profile')`:

```ts
test('activity: my own audit events, linking into the audit trail', async ({
  context,
  page,
}, testInfo) => {
  await authenticate(context, testInfo);
  await enterAdmin(page, '/profile/activity', { heading: 'My profile' });

  const activity = main(page).getByRole('region', { name: 'Activity' });
  // The frozen default seed: 25 of its 30 events are Jane's.
  await expect(activity.getByText(/1–20 of 25/)).toBeVisible();
  await expect(activity.getByRole('group', { name: 'Audit view' })).toHaveCount(0);
  await expect(activity.getByRole('link', { name: /^View event:/ }).first()).toHaveAttribute(
    'href',
    new RegExp(`^/admin/audit\\?actorId=${IDS.jane}&event=`),
  );
});

test('activity: hidden without audit.view, and a direct link explains why', async ({
  context,
  page,
}, testInfo) => {
  await authenticate(context, testInfo, 'no-audit-permission');
  await enterAdmin(page, '/profile', { heading: 'My profile' });
  await expect(tab(page, 'Security')).toBeVisible();
  await expect(tab(page, 'Activity')).toHaveCount(0);

  await page.goto('/profile/activity');
  await expect(main(page).getByText("You don't have permission")).toBeVisible({ timeout: 15000 });
  // Overview is an exact tab, so nothing claims the hidden tab's path.
  await expect(
    page.getByRole('navigation', { name: 'Profile sections' }).locator('[aria-current]'),
  ).toHaveCount(0);
});

test('activity: hidden in the platform workspace even with audit.view', async ({
  context,
  page,
}, testInfo) => {
  await authenticate(context, testInfo, 'platform-audit-viewer');
  await enterAdmin(page, '/profile', {
    heading: 'My profile',
    organisation: /Platform/,
    branch: null,
  });
  await expect(main(page).getByRole('link', { name: 'Back to overview' })).toHaveAttribute(
    'href',
    '/platform-admin',
  );
  await expect(tab(page, 'Security')).toBeVisible();
  await expect(tab(page, 'Activity')).toHaveCount(0);

  await page.goto('/profile/activity');
  await expect(
    main(page).getByText("Activity isn't available in the platform workspace"),
  ).toBeVisible({ timeout: 15000 });
  // No request was made: an ungated read would render the 403 ErrorState (an alert) instead.
  await expect(main(page).getByRole('alert')).toHaveCount(0);
  await expect(
    page.getByRole('navigation', { name: 'Profile sections' }).locator('[aria-current]'),
  ).toHaveCount(0);
});
```

and, after `test.describe('profile')`, the layer's axe matrix:

```ts
const TABS = [
  { name: 'Overview', path: '/profile', region: 'Identity' },
  { name: 'Contexts', path: '/profile/contexts', region: 'Organisations' },
  { name: 'Roles & permissions', path: '/profile/roles', region: 'Roles' },
  { name: 'Security', path: '/profile/security', region: 'Sign-in and security' },
  { name: 'Activity', path: '/profile/activity', region: 'Activity' },
] as const;

// Layer a11y gate: light and dark, desktop and 375 px (long values at 375 px), every tab.
test.describe('profile accessibility', () => {
  // Five tab navigations and five scans per case, each tab possibly a cold compile.
  test.describe.configure({ timeout: 120000 });

  for (const a11yCase of A11Y_CASES) {
    test(`every tab has no serious or critical violations (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
      context,
      page,
    }, testInfo) => {
      await applyA11yCase(page, a11yCase);
      await authenticate(context, testInfo, a11yCase.width < 768 ? 'long-names' : 'default');
      await enterAdmin(page, '/profile', { heading: 'My profile' });

      for (const profileTab of TABS) {
        if (profileTab.path !== '/profile') {
          await tab(page, profileTab.name).click();
          await expect(page).toHaveURL((url) => url.pathname === profileTab.path, {
            timeout: 15000,
          });
        }
        await expect(
          main(page).getByRole('region', { name: profileTab.region, exact: true }),
        ).toBeVisible({ timeout: 15000 });
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);
      }
    });
  }
});
```

Run (form T): `pnpm test:run 'app/(authenticated)/profile/activity'`. Expected: FAIL (the page is
missing).

Run (form E): `e2e/profile.spec.ts`. Expected: FAIL. The `/profile/activity` route is missing, so the
three activity tests and the axe matrix's Activity step fail.

- [ ] **Step 3: Implement `app/(authenticated)/profile/activity/page.tsx`**

```tsx
import type { Metadata } from 'next';
import Paper from '@mui/material/Paper';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { toSearchParams } from '@/lib/api/query-string';
import { RecordAuditTab } from '@/modules/administration/audit/components/record-audit-tab';
import { canViewActivity } from '@/modules/profile/profile-rules';
import { requireProfile } from '@/modules/profile/profile-service';

export const metadata: Metadata = { title: 'Activity · Profile' };

interface ProfileActivityPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Spec §10.9: own audit events (`actor_id` = your `/auth/me` user id), when audit.view. */
export default async function ProfileActivityPage({ searchParams }: ProfileActivityPageProps) {
  const { user, context } = await requireProfile();

  if (!canViewActivity(user, context.module.id)) {
    return (
      <Paper>
        {context.module.id === 'platform-administration' ? (
          // BG-06: the tenant audit API rejects the platform context; there is no platform audit.
          <ForbiddenState
            title="Activity isn't available in the platform workspace"
            description="Your actions are recorded in each institution's audit trail, which can only be read from inside that institution."
          />
        ) : (
          <ForbiddenState description="Seeing your activity needs the audit permission (audit.view) in this context. Ask an administrator if you need it." />
        )}
      </Paper>
    );
  }

  return (
    <RecordAuditTab
      views={[{ value: 'performed', label: 'Performed by me', filter: { actorId: user.id } }]}
      params={toSearchParams(await searchParams)}
      path="/profile/activity"
      title="Activity"
      description={`Administrative actions you performed in ${user.organization.name}.`}
    />
  );
}
```

In `app/(authenticated)/profile/layout.tsx`, change the rules import to
`import { canViewActivity, workspaceHome } from '@/modules/profile/profile-rules';` and replace the
`tabs` constant with:

```ts
const tabs: RecordTab[] = [
  // Exact: a direct link to the hidden Activity tab must not mark Overview as the current page.
  { href: '/profile', label: 'Overview', exact: true },
  { href: '/profile/contexts', label: 'Contexts' },
  { href: '/profile/roles', label: 'Roles & permissions' },
  { href: '/profile/security', label: 'Security' },
  ...(canViewActivity(user, context.module.id)
    ? [{ href: '/profile/activity', label: 'Activity' }]
    : []),
];
```

Run (form T): `pnpm test:run 'app/(authenticated)/profile' modules/profile`. Expected: PASS.

Run (form E): `e2e/profile.spec.ts e2e/fake-api-profile.spec.ts`. Expected: PASS.

If an axe case fails inside a kit component (`RecordHero`, `RecordTabs`, `CopyIdButton`,
`RecordAuditTab`), fix it with one additive `refactor(kit): …` commit and announce it to X (Scope).
Fix a profile component in this task's commit.

- [ ] **Step 4: Update the README directory tree**

AGENTS.md: update README when the architecture changes. This layer deleted `components/profile/`
and added `modules/profile/` and the nested tab routes. Touch only these tree lines in the
"Directory structure" block. 07's parallel README edits merge by R4 union when 07 rebases onto 15.

- In the `app/` tree, replace `│   └── profile/page.tsx` with:

  ```
  │   └── profile/                # Account profile: layout.tsx (hero + tabs) and the Overview,
  │                                # Contexts, Roles & permissions, Security and Activity tabs
  ```

- In the `modules/` tree, change `└── platform-administration/` to `├── platform-administration/`,
  and add after it:

  ```
  └── profile/                   # Account profile: profile-rules, the cached profile-service, and
                                   # the tab components (modules/profile/components/)
  ```

- In the `components/` tree, delete `├── profile/                   # Profile view`.

- [ ] **Step 5: Commit** (form C)

`git add 'app/(authenticated)/profile/activity/page.tsx' 'app/(authenticated)/profile/activity/page.test.tsx' 'app/(authenticated)/profile/layout.tsx' e2e/profile.spec.ts README.md`

```
feat(profile): add the Activity tab and the profile accessibility matrix

The README tree now shows the profile under modules/profile with its nested tab routes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

This task ends at this commit. Gates, the keyboard and visual pass, the ledger and integration
belong to the workflow (Layer completion).
