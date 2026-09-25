# Administration Prototype Parity — Design

**Date:** 2026-09-25
**Status:** Approved (2026-09-25)
**Scope:** Take the Finaxis frontend from the current authenticated shell to the functional level of
the Administration prototype, for both the tenant **Administration** and the **Platform
Administration** workspaces, against the deployed dev API.
**Companion documents:**

- [`docs/backend-gaps.md`](../../backend-gaps.md) — every backend gap found, tackled separately.
- [`2026-09-25-admin-prototype-parity-api-contract.md`](./2026-09-25-admin-prototype-parity-api-contract.md)
  — the wire contract (snake_case request/response shapes) the implementation codes against.

---

## 1. Goal

Deliver every prototype screen and interaction that the published API can back, as real,
server-authorized functionality, in dependency-ordered vertical slices (one domain end-to-end at a
time) shipped as a linear stack of pull requests. Where the API cannot back a prototype feature,
the feature is derived from real data, scoped down, or visibly deferred — never rendered with mock
data — and the gap is recorded in `docs/backend-gaps.md`.

Success means:

- Both workspaces match the prototype's information architecture, layout language, and density,
  built from Material UI components styled through the theme.
- Every list is server-paginated with URL-persisted filters; every mutation is authorized
  server-side, idempotent, and reports backend errors precisely.
- `pnpm check`, `pnpm test:e2e`, and `pnpm build` are green on every PR in the stack.

## 2. Sources and evidence

| Source                     | Location                                                                | Notes                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Prototype (deployed)       | https://finaxis-admin-prototype.kevin112297.chatgpt.site/               | Matches the v5 source (checked 2026-09-25).                                                                                          |
| Prototype (source)         | `~/Downloads/finaxis-admin-prototype-source-v5/finaxis-admin-prototype` | `src/App.jsx`, `src/UserLifecycle.jsx`, `src/prototype-model.js`, `src/styles.css`, `DESIGN_SYSTEM.md`, `AGENTS.md`. Mock data only. |
| API contract (published)   | https://finaxis-dev.api.ogaba.dev/scalar (`/v3/api-docs`)               | 73 operations, 17 tags. Property casing and list-item shapes are **not** reliable — see §6.2.                                        |
| Backend source (read-only) | `/home/ogaba/finaxis/platform` @ `7a7f4c3`                              | Used only to confirm enums, rules, permissions and wire shapes. No backend changes; not run locally.                                 |
| Current frontend           | this repo @ `prod-app`                                                  | Auth, context selection, shell, placeholder tenant pages, read-only platform tenants/audit.                                          |

## 3. Constraints

From the request:

- Material UI is mandatory. Prefer MUI components over from-scratch components; push
  customization through the theme (tokens, `components` overrides, custom variants).
- No new packages unless absolutely necessary and explicitly approved. This design needs none.
- Information density is a priority.
- Vertical slices ordered by dependency; later slices change earlier code minimally.
- Stacked PRs via `gh stack`.
- No backend changes; build against the deployed dev API; backend gaps documented separately.

From `AGENTS.md` (unchanged and binding): server-side session validation on every authenticated
route and Server Action; no Keycloak tokens in client-visible state; no function props from Server
to Client Components; MUI owns visuals and Tailwind is layout-only; one `h1` per page, visible
focus, labelled fields, reduced motion respected, no serious/critical axe violations; paginate every
list; typed `ApplicationContext`; sanitized `FinaxisUser` only in UI; `pnpm check` after every change
and `pnpm test:e2e` for rendered UI.

## 4. Decisions

| #   | Decision                | Outcome                                                                                                                                                                       |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Brand mark              | Recreate the prototype's blue/teal interlocking mark as an inline SVG component; regenerate the favicon from it. The 54 px PNG is not used.                                   |
| D2  | E2E backend             | Standalone zero-dependency fake API server started by Playwright; per-test isolated state; exercises the real fetch path. The in-app `getE2eBackendResult` router is removed. |
| D3  | PR granularity          | One PR per vertical slice (~16), linear stack.                                                                                                                                |
| D4  | App switcher            | The prototype's two workspace tiles only; the platform tile appears only for platform-organisation members.                                                                   |
| D5  | Branch scope            | Add an **All branches** (institution-level) context for multi-branch users; `ApplicationContext.branch` becomes nullable.                                                     |
| D6  | Approval queue          | Typed inbox with **User onboarding** and **Branch activation** tabs; decisions limited to what the API supports.                                                              |
| D7  | Unbacked prototype data | Omit and replace with real fields; each omission is listed in the backend-gaps document.                                                                                      |
| D8  | Per-row counts          | Detail pages only; lists never fan out per row.                                                                                                                               |
| D9  | Global search           | Deferred; the header ships without a search box.                                                                                                                              |
| D10 | Unenforced settings     | The two maker-checker toggles and auto-advance are shown read-only with clear labels; timezone and base currency stay editable as stored configuration.                       |
| D11 | Overview readiness      | Derived from live data with explicit rules (§10.8).                                                                                                                           |
| D12 | Reject a pending user   | Offered as **Reject & revoke** with a strong permanence warning and a required reason.                                                                                        |
| D13 | Platform audit page     | Removed — the API rejects tenant routes in the platform context and has no platform audit endpoint.                                                                           |
| D14 | Data architecture       | Server-first: Server Component reads, Server Action mutations, URL-driven list state.                                                                                         |

## 5. Current state, prototype, and API — comparison

Legend — **Supported**: the API backs it directly. **Derived**: composed from real reads, or scoped
down. **Gap**: not possible against the current API; deferred (see `docs/backend-gaps.md`).

### 5.1 Shell

| Prototype element                                                              | Current repo                                                | API                             | Plan                                                            |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| Full-height navy collapsible rail (232/76 px), tooltips when collapsed, footer | Light drawer under a full-width app bar, per-module layouts | —                               | Rebuild in the global shell (§8).                               |
| Workspace button + Fiori-style app switcher                                    | Icon menu listing 10 modules (1 enabled)                    | Context switching               | Two tiles; platform tile gated by membership (D4).              |
| Organisation/branch context button + switch dialog                             | Text only; full-page `/select-context`                      | Supported                       | Dialog sharing `/select-context` logic; adds All branches (D5). |
| Global search (placeholder in prototype)                                       | —                                                           | Gap                             | Deferred (D9).                                                  |
| Business date in top bar                                                       | —                                                           | Supported (tenant context only) | Live chip; hidden in the platform context.                      |
| Notifications badge (pending approvals)                                        | Static sample count                                         | Derived                         | Count of approvals the user can act on.                         |
| Theme toggle, account menu with identity (not role)                            | Present (menu-based)                                        | —                               | Restyled; account shows name + email.                           |
| Toasts, footer                                                                 | —                                                           | —                               | Snackbar provider; footer.                                      |

### 5.2 Tenant Administration

| Area                | Prototype                                                                   | Current             | API                                                                                                    | Plan  |
| ------------------- | --------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------ | ----- |
| Overview            | Pending approvals, business date card, readiness checklist, recent activity | Static sample cards | Derived                                                                                                | §10.8 |
| Approval queue      | Generic maker-checker requests; approve/reject/return; resubmit             | —                   | Derived (typed); return/resubmit are a Gap                                                             | §10.6 |
| Users & access      | Directory, 4-step create wizard, record with 5 tabs, assignment drawer      | Placeholder         | Supported, with gaps (no staff ID, phone, last active, MFA, user filter on branch assignments)         | §10.5 |
| Branches            | Directory, record with 5 tabs                                               | Placeholder         | Supported; Operations/Controls tabs, address, and edit are Gaps; branch pinning (§6.5)                 | §10.3 |
| Roles & permissions | Directory, record with 4 tabs                                               | Placeholder         | Supported; scope column is a Gap (scope lives on assignments)                                          | §10.4 |
| Settings            | 4 grouped setting cards                                                     | Placeholder         | 6-key catalogue; 3 keys unenforced; `PUT` fails with 500 per source reading (reset via `DELETE` works) | §10.7 |
| Business date       | Current date, COB readiness, start/reopen                                   | —                   | Supported; readiness checks are a Gap                                                                  | §10.2 |
| Audit trail         | Free-text search, outcome filter, export                                    | Placeholder         | Structured filters only; free text, outcome filter, export are Gaps                                    | §10.1 |
| Profile             | Record with 5 tabs                                                          | Single profile view | Supported; Security is Keycloak-owned                                                                  | §10.9 |

### 5.3 Platform Administration

| Area                   | Prototype                                   | Current                                                                                                   | API                                                                                                                                           | Plan          |
| ---------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Overview               | 4 metrics + onboarding attention table      | 3 link cards                                                                                              | Derived (size-1 counts); "global users" and "bootstrap failures" metrics are Gaps                                                             | §11.4         |
| Institutions (tenants) | Directory, create draft, record with 6 tabs | Read-only list + detail (the list renders currency/timezone/bootstrap fields that list items never carry) | Supported; list items carry only code, name, country, status, created; Settings and Audit tabs are Gaps; legal name/registration not readable | §11.1–11.2    |
| Platform users         | Global user directory                       | —                                                                                                         | Derived: platform-organisation members + global lifecycle; global directory is a Gap                                                          | §11.3         |
| Platform audit         | Audit table                                 | Page calling `/tenant/audit-events` (403 against the real API)                                            | Gap                                                                                                                                           | Removed (D13) |

## 6. Architecture and data flow

### 6.1 Layers and directories

```
lib/api/                      server-only infrastructure (new)
  wire.ts                     zod primitives: uuid, instant, business date (dd-MM-yyyy), page envelope
  problem.ts                  ApiProblem parsing + mapping to UI messages and field errors
  action-result.ts            ActionResult type and runServerAction() helper for Server Actions
  lookups.ts                  cache()-memoized user/role/branch lookups for name resolution
auth/backend-api.ts           extended in place: get/post/put/patch/delete, 204, idempotency passthrough,
                              typed BackendApiError(problem)
modules/administration/<domain>/
  <domain>-contract.ts        zod wire schemas (snake_case) with transforms → camelCase domain types
  <domain>-service.ts         server-only reads
  <domain>-actions.ts         'use server' mutations
  <domain>-rules.ts           pure derived rules (state labels, action availability) — unit tested
  components/                 domain UI (Server Components by default)
modules/platform-administration/  same shape; reuses branch/user contracts from administration
components/shell/             global shell (rail, app bar, dialogs)
components/data-display/      shared MUI compositions (list/record patterns, status chip, dialogs)
```

Domains: `audit`, `business-date`, `branches`, `roles` (includes the permission catalogue), `users`
(includes memberships and assignments), `approvals`, `settings`, `overview`. Existing
`modules/platform-administration` mappers migrate to the contract pattern when that slice is
extended (§13, PR 16).

### 6.2 Wire contract

- The API serializes **snake_case** and rejects unknown properties with `400 invalid_json`
  (`ApiJsonCodec`). The published OpenAPI shows camelCase and omits every `ApiPage` item schema, so
  no client is generated from it. Each domain declares zod schemas for the exact wire shapes
  (companion contract document) and transforms them to camelCase domain types at the service
  boundary. Map-valued properties (`address`, `initial_settings`, JSON strings) are never re-keyed.
- Request bodies are built from explicit snake_case objects — never by spreading form values — so
  an unexpected property can't trigger `invalid_json`.
- `sort_by` values are camelCase (`branchName`, `createdAt`, …) from a per-endpoint allow-list; any
  other value is dropped before the request (an invalid value returns 500).
- Page envelope: `{ items, page: { number, size, total_items, total_pages, has_next, has_previous } }`;
  `page` is 0-based and `size` ≤ 100. UI page sizes: 10, 20, 30, 40, 50 — default 10 for directories
  (as in the prototype), 20 for audit and history tables.
- Business dates are `dd-MM-yyyy` strings, parsed strictly in both directions; instants are ISO-8601
  UTC. Nulls are always serialized, never omitted.
- List items are thinner than details (e.g. branch summaries carry no timezone, parent, or opened
  date; tenant summaries carry no currency, timezone, or bootstrap status; membership summaries carry
  no names). Lists show only what their items carry (D8).
- The audit summary and detail name the same columns differently (`resource_type`/`resource_id`/
  `actor_id` versus `entity_type`/`entity_id`/`actor_user_id`); both map to one domain shape.
- `/auth/me` and `/auth/branches` can repeat branches and roles (one row per assignment); mappers
  de-duplicate by ID.
- An invalid or expired JWT returns 401 with an empty body (no problem JSON); a missing JWT returns
  problem JSON `authentication_required`. Both are treated as an expired session.

### 6.3 Reads

- Pages are Server Components that await domain services and pass sanitized domain objects to
  Client Components. Every backend read stays `cache: 'no-store'`.
- React `cache()` deduplicates per request: `getSelectedContextProfile` (today `/auth/me` runs more
  than once per navigation), and the lookups in `lib/api/lookups.ts`:
  - `getUser(id)` — `GET /tenant/users/{id}`, resolved only for the IDs on the visible page.
  - `getRoleIndex()` / `getBranchIndex()` — full role/branch lists for name resolution, fetched in
    pages of 100 up to 5 pages. `ponytail:` ceiling of 500 records; beyond that, unresolved IDs
    render as short IDs.
- Rate budget (per organisation and user): 600 reads/min, 120 writes/min, 20 context switches/min.
  A page issues at most ~10 reads; lists never fan out per row (D8).
- Header widgets (business date, notification count) render inside `Suspense` so they never block
  the page.

### 6.4 Mutations

- Each domain exposes Server Actions in `<domain>-actions.ts`. Every action:
  1. validates the session (`getAuthenticatedUser`) and reads the context token server-side;
  2. validates input with zod (IDs as UUIDs, reasons with the contract's min/max);
  3. forwards the **client-generated idempotency key** (a UUID created when the form or dialog
     mounts, sent as a hidden field; regenerated after a success — a failed mutation rolls back its
     key server-side, so a retry with the same key is safe, while a changed body with a used key
     returns 409 `IDEMPOTENCY_KEY_REUSED`);
  4. maps failures to `ActionResult` — `{ ok: false, formError, fieldErrors, code, requestId }` — and
     never returns raw backend payloads;
  5. on success calls `refresh()` (from `next/cache`) or `redirect()` to the created record.
- Client forms use React Hook Form with the zod resolver for immediate validation and merge server
  `fieldErrors` back with `setError`. `@hookform/resolvers` stays where it is (a devDependency): the
  Docker build stage installs all dependencies and client bundles inline it, so `package.json` is
  unchanged.
- Self-hosted multi-instance deployments must set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`
  (documented in `docs/deployment.md`).

### 6.5 Context model

- `ApplicationContext.branch` becomes `ApplicationContextBranch | null`; `null` means **All
  branches** (organisation selected, no branch). The authenticated layout accepts it; the header,
  rail footer, and context dialog render "All branches".
- `/select-context` and the header dialog offer **All branches (institution level)** after
  organisation selection when the user has more than one distinct assigned branch
  (`assigned_branch_ids` is de-duplicated — the backend can repeat an ID). Single-branch users are
  auto-pinned by the backend; zero-branch members (AUDITOR/SYSTEM) are always institution level.
- Why: with a branch selected, the backend returns 404 for any other branch (branch detail, branch
  lifecycle, branch-assignment get/assign/revoke; branch-assignment search is forced to the selected
  branch). Draft and pending branches can never be selected, so submitting and activating them only
  works at institution level. Branch-scoped role grants do not apply at institution level.
- Where a page needs a specific branch the current context can't reach, it shows a guided state
  ("Switch to All branches to manage this branch") instead of a raw 404.
- Switching organisation commits the organisation immediately (the backend issues a new token; branch
  lists can only be read with it). Single-branch users are then done (the backend auto-selects).
  A multi-branch user who closes the dialog, or leaves `/select-context`, at the branch step stays at
  **All branches** for the new organisation — stated in a toast ("Switched to Umoja SACCO · All
  branches") and visible in the header — rather than being redirected.
- `next` destinations for `/select-context` are validated against a prefix allow-list
  (`/admin`, `/platform-admin`, `/profile`) plus a strict same-origin path pattern, replacing the
  hard-coded list.

### 6.6 Permissions

`/auth/me` returns effective permission codes for the active context. A `can(user, code)` helper
gates navigation items and actions (hide when a whole page is unavailable; disable with a tooltip when
an action is contextually blocked). The backend remains the authority; UI gating only avoids dead
ends. The endpoint → permission map is in the contract document.

Many mutations read their result back inside the same transaction and therefore also need the
matching `.view` permission (e.g. role mutations need `role.view`, membership transitions need
`membership.view`, branch transitions need `branch.view`); without it the backend returns 403 and
rolls back. Action gating checks both codes. At institution level, branch-scoped grants don't
count; in a branch context they count only for branch-scoped checks.

### 6.7 Error handling

| Backend result                                     | UI behaviour                                                                                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401                                                | Redirect to `/login?reason=session_expired`.                                                                                                                   |
| 403 `invalid_active_tenant_context`                | Redirect to `/select-context?next=…`.                                                                                                                          |
| 403 `forbidden`                                    | Inline "You don't have permission" state; for approve/activate, add the maker-checker explanation (the backend uses the same code for both causes).            |
| 403 with any other code                            | Wrong-context responses carry a sentence as the code; shown as a generic permission/context error with the detail text (routing prevents these in normal use). |
| 404                                                | `notFound()`; for branches, the branch-context guided state (§6.5).                                                                                            |
| 409 (`conflict`, `lifecycle.*`, idempotency codes) | Specific message ("This record changed — refresh", "Branch still has active assignments", "Retry — another change is in progress").                            |
| 400/422 with `violations`                          | Field errors mapped from violation paths; unmatched violations go to the form summary.                                                                         |
| 429 `rate_limit_exceeded`                          | "Too many requests — try again in N s" from `Retry-After`.                                                                                                     |
| 5xx / network                                      | "Something went wrong. Reference: `<request_id>`."                                                                                                             |

Known 500 triggers (invite rule violations, unknown IDs, re-approving a provisioning user, invalid
sort) are pre-validated so users see a precise message instead.

### 6.8 Security

Unchanged guarantees: tokens stay server-side; every Server Action re-authenticates and
re-validates; Server Actions rely on Next's origin check plus Better Auth's checks (neither is
disabled); inputs are validated with zod; route IDs are UUID-validated; returned data is shaped to
what the UI renders.

## 7. Design system and theme

All of the following lives in `theme/create-finaxis-theme.ts` and `theme/theme.types.ts`
(module augmentation), consumed through palette paths and variants — never raw colours in
components.

### 7.1 Tokens (ported from the prototype)

| Token                                         | Light                                      | Dark                                       |
| --------------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| `background.default`                          | `#F5F8FC`                                  | `#081322`                                  |
| `background.paper`                            | `#FFFFFF`                                  | `#101E30`                                  |
| `surfaces.secondary` / `surfaces.tertiary`    | `#F0F4F9` / `#E8EEF6`                      | `#15263B` / `#1B3048`                      |
| `text.primary` / `text.secondary`             | `#0A1B3C` / `#526681`                      | `#F3F7FC` / `#A7B8CC`                      |
| `divider`                                     | `#D5DFEB`                                  | `#2A405A`                                  |
| `focus`                                       | `#2F6DF2`                                  | `#78A5FF`                                  |
| `primary.main` / `primary.dark`               | `#1F5FE5` / `#164BC5`                      | same                                       |
| `success` (teal 600/700)                      | `#009688` / `#007A6E`                      | lightened foreground (see below)           |
| `warning` (amber 700)                         | `#B95100`                                  | lightened foreground                       |
| `error` (red 700)                             | `#B4232E`                                  | lightened foreground                       |
| `info`                                        | primary                                    | lightened foreground                       |
| `status.*Bg` (success, warning, danger, info) | `#E8F7F3`, `#FFF4E8`, `#FFF0F1`, `#EDF4FF` | `#0D352F`, `#3E2917`, `#3C1D25`, `#172D4D` |
| `brand.950/900/800` (scheme-independent)      | `#071A36` / `#0A2347` / `#123663`          | same                                       |
| `avatar.bg` / `avatar.fg`                     | `#DDEBFF` / `#1456C9`                      | info bg / light primary                    |

Deviation from the prototype: the prototype reuses its light-scheme 700 tones as dark-scheme
status foregrounds, which fails WCAG AA on the dark soft backgrounds. Dark-scheme status foregrounds
are lightened until they reach 4.5:1 against both the dark soft background and `background.paper`,
enforced by a unit test that computes WCAG contrast for every token pair.

### 7.2 Typography and density

- Inter (already loaded via `next/font`), tabular numerals globally.
- Scale: page title (`h1`) 28/1.15/700 (25 on mobile); record title 25; section title 16–17/700;
  `body1` 13; dense cells `body2` 12.5; `caption` 11; eyebrow (`overline`) 12–13/650, no uppercase;
  `button` 13/700, no text transform.
- Metrics: app bar 68 px; rail 232/76 px; nav item 54 px (collapsed 56 px square); table head 39 px;
  rows 44 px single-line, ~56 px two-line; controls 40 px (small 36); icon buttons 42 px; tabs 48 px;
  pagination buttons 32 px. Spacing unit stays 4 px.
- Radii: 6 px controls and surfaces, 10 px menus/popovers, 14 px dialogs, pills fully rounded.
  Surfaces use borders, not shadows; shadows only on overlays.

### 7.3 Component overrides and variants

- `MuiChip` custom variant `soft` (augment `ChipPropsVariantOverrides`): 11 px/750 pill, soft
  background + semantic foreground per `color`. Used by `StatusChip`.
- `MuiButton`: 40 px, 700 weight; outlined "secondary" look on `surfaces.secondary`; error-outlined
  uses the danger soft background. Built-in `loading` prop for pending states.
- `MuiTextField` / `MuiInputLabel` / `MuiOutlinedInput`: `size="small"` default, labels always
  above the field (`shrink` + `notched: false`), 40 px height, surface background, error ring.
- `MuiTable*`: `size="small"` default, muted 12 px/700 header on `surfaces.secondary`, sticky header
  background, row hover on `surfaces.secondary`.
- `MuiTabs`/`MuiTab`: 48 px, 13 px/700, 3 px indicator, muted → primary.
- `MuiStepper`/`MuiStepIcon`/`MuiStepConnector`: bordered step cells with numbered circles
  (active primary fill, complete teal check), matching the prototype's wizard header.
- `MuiDrawer` (rail): navy gradient paper (`brand.950` → `brand.900`), on-navy text tokens;
  `MuiListItemButton` rail states (active gradient + 3 px `#75A2FF` marker; collapsed square).
- `MuiAppBar`: paper background, bottom border, no elevation. `MuiDialog`: 14 px radius, header/footer
  dividers, blurred backdrop. `MuiMenu`/`MuiPopover`: 10 px radius, border, overlay shadow.
  `MuiTooltip`: `brand.950` for rail tooltips. `MuiLinearProgress`: 8 px rounded, teal.
- Focus: 3 px outline at 35 % of `focus`, offset 2 px, on every focusable MUI component (replacing
  the current fixed-colour outline).

### 7.4 Brand

- `components/branding/finaxis-logo.tsx` renders the recreated interlocking mark as SVG (blue/teal,
  legible on the navy rail and on light/dark surfaces). `app/icon.tsx` renders the favicon from the
  same geometry. Wordmark "Finaxis" + tagline "People · Savings · Progress" beside it when expanded.
- `design-system/finaxis-platform-administration/MASTER.md` (gold/purple, Calistoga) is replaced by a
  master file derived from the prototype's `DESIGN_SYSTEM.md` and §7, so future design tooling does
  not regress the palette.

## 8. Shell

- **Rail** (global, in `AppShell`): full-height permanent MUI `Drawer` with a mini variant; collapsed
  state persisted in a cookie (`finaxis_nav`) so the server renders the correct width without layout
  shift; temporary drawer below `md` with scrim. Contents: logo + tagline; the active workspace's
  navigation (permission-filtered); collapse control; footer with organisation name and branch or
  "All branches". The per-module drawers in `app/(authenticated)/admin/layout.tsx` and
  `platform-workspace-shell.tsx` are replaced.
- **App bar** (68 px): mobile menu · workspace button (`Administration ▾`, opens the switcher) ·
  context button (organisation / branch, opens the context dialog) · flexible space · business date
  (`Mon, 7 Sep 2026 · Business date · Open`; tenant context with `business_date.view` only) · app
  switcher icon · notifications · theme menu (system/light/dark, existing `useColorScheme`) · account
  button (initials, name, email). Text collapses progressively at narrower widths.
- **App switcher**: popover with two tiles — Administration ("Institution controls") and Platform
  administration ("Tenant governance"). Opening it fetches the user's organisations (existing
  `/api/context/organisations` route) — no cost on ordinary navigation. The platform tile appears only
  when that list includes the platform organisation (`PLATFORM_ORGANISATION_ID`); choosing a tile runs
  the real context change.
- **Context dialog**: organisation list (paginated), then branch choice including All branches;
  shares its logic with `/select-context` (extracted from `components/context/context-selection-page.tsx`)
  and the existing `/api/context/*` route handlers.
- **Notifications**: in the tenant workspace, badge = actionable user-onboarding approvals (when
  `user.approve`; memberships PENDING_APPROVAL minus those whose user is PROVISIONING_IDP, which were
  already approved) + pending branch activations (when `branch.activate`), from three `size=1` reads; in
  the platform workspace, institutions pending approval (when `tenant.approve`). The popover links to
  the corresponding queue.
- **Account menu**: identity header, My profile, Sign out (existing POST form to `/api/auth/logout`).
- **Toasts**: a Snackbar provider (React context in `AppProviders`) shows Server Action outcomes.
- **Page header**: `PageHeader` (eyebrow, `h1`, description, actions) replaces `SectionHeading` and
  `PlatformPageShell`; footer with the prototype's copy.

Navigation:

| Tenant workspace    | Route                  | Gate                                |
| ------------------- | ---------------------- | ----------------------------------- |
| Overview            | `/admin`               | —                                   |
| Approval queue      | `/admin/approvals`     | `user.approve` or `branch.activate` |
| Users & access      | `/admin/users`         | `user.view`                         |
| Branches            | `/admin/branches`      | `branch.view`                       |
| Roles & permissions | `/admin/roles`         | `role.view`                         |
| Settings            | `/admin/settings`      | `settings.view`                     |
| Business date       | `/admin/business-date` | `business_date.view`                |
| Audit trail         | `/admin/audit`         | `audit.view`                        |

| Platform workspace | Route                     | Gate          |
| ------------------ | ------------------------- | ------------- |
| Overview           | `/platform-admin`         | —             |
| SACCO institutions | `/platform-admin/tenants` | `tenant.view` |
| Platform users     | `/platform-admin/users`   | `user.view`   |

`proxy.ts` protects `/profile/:path*` (profile gains nested tab routes).

Navigation entries appear only when their page is implemented: the shell PR ships the registry with
the pages that exist and real data (the overviews and platform institutions); each slice adds its own
route and nav entry. The current placeholder pages and the tenant overview's sample-data cards are
removed in the shell PR.

## 9. Shared UI patterns

All are thin compositions of MUI components (`components/data-display/`):

- **List page**: `Paper` → toolbar (search `TextField`, filter `Select`s, "Clear filters", result
  count) → `TableContainer` with sticky head and viewport-bounded height → `TablePagination`
  (10–50 rows per page). Filters, page, size, and sort live in the URL; search is debounced and
  applied with `router.replace`. The primary cell is a link, so rows are keyboard- and
  screen-reader-navigable.
- **Record page**: back link → hero `Paper` (avatar or icon, eyebrow, `h1`, subtitle, `StatusChip`,
  action buttons + overflow `Menu`) → link `Tabs` implemented as nested routes (each tab is
  deep-linkable and fetches its own data; the shared layout fetches the hero record) → two-column
  grid on large screens.
- **Building blocks**: `DescriptionList` (`dl` grid), `SectionCard` (`Paper` + header + actions),
  `StatusChip` (one tone/label map for every backend enum), `ActivityList` (compact audit events),
  `EmptyState`, `ErrorState` (with request reference), `ForbiddenState`, `ConfirmDialog`,
  `ReasonDialog` (contract min/max; required or optional per endpoint), right-anchored assignment
  `Drawer`, `KpiTile`.
- **Forms**: labels above fields, helper text, errors on the field plus an error summary `Alert`;
  wizards use `Stepper`, per-step validation, a review step, and a sticky action bar.
- **Formatting**: instants with `Intl.DateTimeFormat` in the organisation's timezone (from
  `GET /tenant`, cached per request, when `tenant.view` is held), otherwise in UTC with a "UTC" label;
  the platform workspace uses UTC. Business dates render from their `dd-MM-yyyy` value without
  timezone conversion. Enum labels are humanized (`PENDING_APPROVAL` → "Pending approval"); IDs are
  shortened with a copy affordance.

## 10. Tenant workspace

### 10.1 Audit trail — `/admin/audit` (`audit.view`)

- Filters: entity type (known set), action (known set, narrowed by entity type), actor (user
  search → `actor_id`), occurred from/to (native `datetime-local`). No free text, outcome, severity,
  or branch filters (Gap).
- Columns: date & time, actor (resolved name, or "System"), action (humanized + code caption; reason
  as a second line when present), entity (type + resolved label or short ID), branch (resolved),
  outcome, severity.
- Row opens a detail `Drawer` (`GET /tenant/audit-events/{id}`): reason, before/after JSON side by
  side, metadata, request and correlation IDs, user agent (IP address is never populated).
- Record "Audit" tabs reuse the same table with entity filters. Because one subject's history spans
  several entity types, record tabs offer a `ToggleButtonGroup` of paginated views — for a user:
  _User record_ (`USER`), _Account_ (`USER_ACCOUNT`), _Membership_ (`MEMBERSHIP`), _Performed by_
  (`actor_id`). Branch assignment changes are logged against the branch, not the user (Gap).

### 10.2 Business date — `/admin/business-date` (`business_date.view`)

- Hero: current business date, status (OPEN, CLOSING, CLOSED).
- Actions by status: OPEN → **Start close of business** (`cob.start`), **Advance date**
  (`business_date.advance`; new date later than current; optional reason); CLOSING → **Complete close
  of business** (`cob.complete`); CLOSED → **Reopen** (`business_date.reopen`). Requests send `{}` plus
  the optional reason. 409 lock timeouts invite a retry.
- History table (paginated, newest first): occurred at, event (advanced, COB started, COB completed,
  reopened), status change, business date change (from → to), actor (resolved), reason. A new tenant's
  history starts empty.
- Close-of-business readiness checks are not available (Gap).

### 10.3 Branches — `/admin/branches` (`branch.view`)

- List: search (code, name), status, type; sort by name, code, type, status, created. Columns:
  branch (name + code), type, status, created. (List items carry nothing else.)
- Create draft (`branch.create`), `/admin/branches/new`: code (`^[A-Z0-9_-]{2,20}$`), name, type
  (free text with suggestions `HEAD_OFFICE`, `OPERATIONS`), parent branch, timezone (IANA list via
  `Intl.supportedValuesOf('timeZone')`). Address is omitted — it is stored but never returned (Gap).
- Record tabs: **Overview** (code, name, type, status, parent, timezone, last status reason,
  created/updated, opened/closed on when present — the API never sets them; assignment count);
  **Users** (active assignments at this branch with
  assignment type; assign a user and type with `user.assign_branch`; revoke with
  `user.revoke_branch`); **Audit**.
- Lifecycle (hero, availability by status and context): Submit (DRAFT) · Activate (PENDING_APPROVAL;
  maker ≠ drafter) · Suspend (ACTIVE; reason 3–500) · Reactivate (SUSPENDED) · Close (ACTIVE or
  SUSPENDED; reason; warns that active assignments or child branches block it). Submit and Activate
  require the All branches context (§6.5).
- Omitted: Operations and Controls tabs, edit, address/contact block (Gaps).

### 10.4 Roles & permissions — `/admin/roles` (`role.view`)

- List: search (code, name), status, system/custom; sort by code, name, status, created. Columns:
  role (name + code), description, type, status, created.
- Create (`role.create`): code (`^[A-Z0-9_-]{2,20}$`), name, description → redirect to the
  Permissions tab.
- Record tabs: **Overview** (definition; assigned-user and permission counts); **Permissions**
  (granted permissions with code, name, module, risk, granted at; **Grant permissions** drawer over the
  catalogue — search, risk filter, grouped by module — with `role.assign_permission`; remove with
  `role.remove_permission`, confirming CRITICAL grants); **Assignments** (users holding the role, with
  scope and branch; assign via user search + TENANT/BRANCH scope with `user.assign_role`; revoke with
  `user.revoke_role`); **Audit**.
- Edit (`role.update`), Activate/Deactivate (`role.activate`/`role.deactivate`) apply to custom roles
  only; system roles are labelled immutable and their mutation controls are hidden.

### 10.5 Users & access — `/admin/users` (`user.view`)

- List: search (username, email, name), user status, membership status (newest first; no sort).
  Columns: user (initials avatar, name, email), username, onboarding state, membership status, user
  status. Onboarding state is derived:

  | Membership       | User             | Onboarding state       |
  | ---------------- | ---------------- | ---------------------- |
  | PENDING_APPROVAL | DRAFT            | Awaiting approval      |
  | PENDING_APPROVAL | PROVISIONING_IDP | Provisioning identity  |
  | ACTIVE           | INVITED          | Awaiting first sign-in |
  | ACTIVE           | ACTIVE           | Active                 |
  | SUSPENDED        | any              | Suspended              |
  | REVOKED          | any              | Revoked                |

- **Invite user** wizard, `/admin/users/new` (`user.invite`):
  1. Identity — display name, email, username (`^[a-zA-Z0-9._-]{3,50}$`), phone (E.164, optional),
     membership type (STAFF, ADMIN, AUDITOR, SYSTEM).
  2. Access — role assignments (active roles; TENANT or BRANCH scope with branch), branch assignments
     (active branches; HOME, OPERATE, APPROVE, VIEW), primary branch.
  3. Invitation — send identity-provider invite (default on), send application invite (default off).
  4. Review — summary with edit links; submit.
- Invite pre-validation mirrors the backend rules that otherwise return 500: at least one role;
  STAFF/ADMIN need at least one branch assignment; a BRANCH-scoped role's branch must be among the
  branch assignments; roles and branches must be ACTIVE; the email must not already have a membership
  in this tenant (checked with `GET /tenant/memberships?q=<email>`). Submit redirects to the new
  user's record ("Submitted for approval"). Inviting an email that already has a global account reuses
  that account (the backend then ignores the entered name, username, and phone) — the review step says
  so when the membership lookup finds the email in another context.
- Record, `/admin/users/[userId]`: the membership is resolved with `memberships?q=<email>` matched on
  `user_id`. Tabs: **Overview** (identity; membership type, status, primary branch, created/updated;
  onboarding timeline; role and branch counts); **Roles & access** (role assignments; assign/revoke);
  **Branch assignments** (the user's assignments found by a bounded scan within the current context —
  marked "partial" when the ceiling is reached; assign/revoke); **Audit**.
- Hero actions by membership status and permission: Approve (PENDING_APPROVAL, `user.approve`;
  unavailable when the user is PROVISIONING_IDP — approval already ran and re-approving returns 500 —
  and disabled with an explanation when the current user invited them) · Reject & revoke
  (PENDING_APPROVAL, `membership.revoke`,
  permanence warning, reason) · Suspend (ACTIVE, `membership.suspend`, reason) · Reactivate
  (SUSPENDED, `membership.reactivate`) · Revoke (ACTIVE or SUSPENDED, `membership.revoke`, permanence
  warning, reason).
- Omitted: staff/member ID, phone display, last active, MFA/security tab, invitation expiry, edit,
  export, resend invite (Gaps).

### 10.6 Approval queue — `/admin/approvals` (`user.approve` or `branch.activate`)

- Tabs, each server-paginated: **User onboarding** (`GET /tenant/users?membership_status=PENDING_APPROVAL`;
  name, email, onboarding state) and **Branch activation** (`GET /branches?status=PENDING_APPROVAL`;
  name, code, type, created). Onboarding rows whose user is PROVISIONING_IDP were already approved:
  they show "Provisioning identity" with a View action and no decision, and are excluded from the
  actionable count (`total_items` of the pending query minus that of the pending + PROVISIONING_IDP
  query). Branch tab counts come from `total_items`.
- Detail pages `/admin/approvals/users/[userId]` and `/admin/approvals/branches/[branchId]`:
  requested change (subject, type, organisation), identity or branch facts, requested access (roles
  from `role-assignments?user_id=`; branch scope from the membership's primary branch plus the bounded
  assignment scan, flagged "partial" when incomplete), maker and submitted time (from the audit event
  `user.invite` / `branch.create_draft`, when `audit.view` is held), control checks (maker is not
  you; role present; branch present where required; organisation active — a check that can't be
  computed reads "Verified by the platform on approval"), and history (audit events for the subject).
- Decision bar: **Approve** (`membership activate` → 200 "Active" or 202 "Identity provisioning
  queued — the invitation is sent when it completes"; `branch activate`) and, for users only, **Reject &
  revoke**. Disabled with an explanation when the current user is the maker.
- Not available: return for changes, resubmission, rejecting a branch, remarks on approvals that
  carry no reason field (Gaps).

### 10.7 Settings — `/admin/settings` (`settings.view`; edits `settings.update`)

- **Locale & currency** (editable): `default_timezone` (IANA select), `base_currency` (ISO select via
  `Intl.supportedValuesOf('currency')`; 409 `accounting.functional_currency_frozen` explained).
- **Controls** (read-only, labelled): `require_maker_checker_for_user_invites` and
  `require_maker_checker_for_branch_creation` ("Maker-checker always applies"),
  `business_date_auto_advance_enabled` ("Automatic advance is not available yet").
- **Retention**: `audit_retention_days` ("Managed by the platform").
- Edit dialog with an optional reason (`PUT`); **Reset to default** (`DELETE`, optional reason).
  Other stored keys appear read-only in a collapsed section. Writes require an ACTIVE organisation.
- Source reading shows `PUT /tenant/settings/{key}` always fails with 500 and rolls back (the
  idempotency replay check rejects the response's `key` property). The slice verifies this live; if
  confirmed, editing ships disabled with an explanatory tooltip and stays listed in
  `docs/backend-gaps.md`, while reset (`DELETE`, 204) remains available.

### 10.8 Overview — `/admin`

- Business date card (status + date).
- Pending approvals: up to five rows — pending users first (newest first), then pending branches
  (newest first) — with **Review** actions and a link to the full queue.
- Operational readiness — each item computed from live reads:

  | Item                | Complete when                                                                         |
  | ------------------- | ------------------------------------------------------------------------------------- |
  | Institution profile | organisation ACTIVE and `default_timezone` and `base_currency` set                    |
  | Branches            | at least one ACTIVE branch and none PENDING_APPROVAL                                  |
  | People              | at least two ACTIVE memberships (maker-checker possible)                              |
  | Onboarding          | no approvals awaiting a decision (identities still provisioning are noted separately) |
  | Business date       | status OPEN                                                                           |

- Recent activity: the five latest audit events (when `audit.view`).

### 10.9 Profile — `/profile/*`

Tabs: **Overview** (identity, active context, membership status, signed-in time); **Contexts**
(organisations and, for the current organisation, branches — with switch actions); **Roles &
permissions** (roles; permission codes grouped by module); **Security** (link to the Keycloak account
console for password, MFA, and sessions); **Activity** (own audit events, when `audit.view`).

## 11. Platform workspace

The platform context cannot call tenant routes (roles, permissions, settings, business date, audit);
the header hides the business date there.

### 11.1 Institutions — `/platform-admin/tenants` (`tenant.view`)

- List: search (code, name), status, country, created from/to; sort by code, name, country, created.
  Columns: institution (name + code), country, lifecycle status, created — the only fields list items
  carry; provisioning, currency, and timezone appear on the record. The reserved platform organisation
  is excluded. (The current table's currency/timezone/bootstrap columns are always empty against the
  real API and are removed.)
- **Create tenant draft** wizard (`tenant.create`), `/platform-admin/tenants/new`: Institution (code
  `^[a-z0-9-]{3,32}$`, display name, legal name, registration number, country, base currency, timezone,
  first business date) → First administrator (email, username, display name, phone E.164 — required by
  the backend despite being typed nullable, send application invite) → Initial settings (catalogue
  keys, including audit retention — the only way to set it) → Review. The tenant code is checked for
  uniqueness first (a duplicate fails with 500).

### 11.2 Institution record — `/platform-admin/tenants/[tenantId]`

- Tabs: **Overview**; **Provisioning** (timeline derived from status and bootstrap status, failure
  code, **Retry bootstrap** when FAILED); **Branches** (tenant branches list and detail; create draft,
  which the backend only allows when the platform administrator is also a member of the tenant);
  **Users** (tenant users list and detail; global Suspend, Reactivate, Deactivate).
- Hero lifecycle by status and permission: DRAFT → Amend (full replacement; legal name and
  registration number must be re-entered because they can't be read back), Submit ·
  PENDING_APPROVAL → Approve (maker ≠ creator and submitter; 202; the maker can't be looked up from the
  platform context, so a 403 is explained as permission or maker-checker), Reject (terminal; reason) ·
  ACTIVE →
  Suspend (reason), Deprovision (reason, CRITICAL confirmation) · SUSPENDED → Reactivate, Deprovision.
- Omitted: Settings and Audit tabs (Gaps).

### 11.3 Platform users — `/platform-admin/users` (`user.view`)

Members of the platform organisation (`GET /platform/tenants/{PLATFORM_ORGANISATION_ID}/users`), with
detail and global lifecycle actions (Suspend when ACTIVE, Reactivate when SUSPENDED, Deactivate when
ACTIVE; reasons as the contract requires). A cross-tenant global user directory is a Gap.

### 11.4 Platform overview — `/platform-admin`

KPI tiles from `size=1` counts (active, pending approval, draft, and suspended institutions — the
platform organisation excluded from the active count; platform operators) and a "Needs attention"
table (institutions pending approval and drafts).

## 12. Testing

- **Unit (Vitest)**: wire schemas (snake_case fixtures ↔ domain objects, rejection of malformed
  shapes); problem mapping; query parsing; derived rules (onboarding state, readiness, lifecycle
  action availability, WCAG contrast of theme tokens); Server Action helpers with a mocked
  `backendApi`.
- **Component (RTL)**: toolbar ↔ URL synchronization, reason/confirm dialogs, wizard step validation,
  permission gating, status chips, context dialog branching (All branches).
- **End-to-end (Playwright)** against the standalone fake API:
  - `e2e/fake-api/` — `node:http` server run with Node 24 type stripping (no dependencies), started
    by Playwright's `webServer` list; the Next dev server gets `FINAXIS_API_URL` pointing at it.
    Because it runs under plain `node`, it is self-contained: relative imports only (no `@/`
    aliases), erasable TypeScript syntax only (no enums, namespaces, or parameter properties), and no
    `server-only` or app-code imports. Its first task in PR 3 is proving it boots under plain `node`
    in CI.
  - It grows per slice — each slice adds only the endpoints it uses. The fake and the zod schemas come
    from the same source reading and can agree while both being wrong, so each slice's **live read
    check against dev is a gate**, not an extra.
  - Per-test isolation: the e2e session cookie carries a scenario and test ID; `getE2eAccessToken`
    returns a bearer token derived from it; the fake API keys in-memory state by token and seeds it
    from the named scenario.
  - Mirrors backend behaviour the UI depends on: snake_case, 400 on unknown properties, idempotency
    replay and key reuse, maker-checker 403, branch-context 404, 202 provisioning on approval, status
    transitions, pagination envelopes, `problem+json` errors.
  - Each slice adds happy paths, key edge cases, and axe scans (light and dark, desktop and mobile).
  - The existing specs migrate to the new fixture helpers in PR 3.
- **Live-API verification** per slice: the user signs in once in the browser pane (credentials are
  never entered by the agent); reads are verified first; mutations run only on a dev tenant the user
  designates.
- Coverage thresholds stay at 80/75/80/80.

## 13. Delivery plan

Linear `gh stack`; every PR is independently green (`pnpm check`, `pnpm test:e2e`, `pnpm build`) and
updates `README.md`/`AGENTS.md` where the architecture changes.

| #   | PR                                  | Depends on | Contents                                                                                                                                            |
| --- | ----------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Dependency bump                     | —          | The existing `prod-app` commit (minor/patch dependency updates), reviewed and merged first.                                                         |
| 1   | Docs                                | 0          | This spec, API contract reference, backend-gaps document, implementation plans.                                                                     |
| 2   | Theme & brand                       | 1          | Tokens, typography, density, overrides/variants, contrast test, SVG mark + favicon, MASTER.md replacement.                                          |
| 3   | Fake API                            | 1          | Standalone fake API + scenarios, e2e helpers and migration, removal of the in-app backend fake and the platform audit page.                         |
| 4   | Shell                               | 2, 3       | Rail, app bar, account menu, `PageHeader`, nav registry + `can()`, removal of placeholder pages and sample-data overview cards.                     |
| 5   | Context                             | 4          | Problem-aware `BackendApiError`, `cache()` profile dedupe, All branches (nullable branch), context dialog, app switcher, toasts, `next` allow-list. |
| 6   | Audit trail                         | 5          | `lib/api` wire/problem/loaders/lookups, list primitives (`components/data-display`), `/admin/audit` + detail drawer.                                |
| 7   | Business date                       | 6          | `runServerAction` + client idempotency keys, `ReasonDialog`, `SectionCard`, business date page, live header chip.                                   |
| 8   | Branches                            | 7          | Branch directory, create draft, record tabs, lifecycle, branch users/assignments, branch-context guided states.                                     |
| 9   | Roles & permissions                 | 8          | Roles directory, create/edit, permissions grant/remove, role assignments, lifecycle.                                                                |
| 10  | Users — directory & record          | 9          | Users list, record tabs, membership lifecycle, role/branch assignment management.                                                                   |
| 11  | Users — invite wizard               | 10         | Four-step invite with pre-validation.                                                                                                               |
| 12  | Approvals                           | 11         | Typed inbox, approval detail pages, decision flows, notifications badge.                                                                            |
| 13  | Settings                            | 7          | Catalogue editor, read-only controls, reset.                                                                                                        |
| 14  | Overview                            | 12, 13     | Readiness rules, pending approvals, recent activity, business date card.                                                                            |
| 15  | Profile                             | 6          | Tabbed profile, contexts, Keycloak account link.                                                                                                    |
| 16  | Platform — institutions             | 7, 10      | Contract migration of the platform module, directory, create wizard, lifecycle actions, provisioning tab.                                           |
| 17  | Platform — records, users, overview | 16         | Tenant branches/users tabs, global user lifecycle, platform users, platform overview.                                                               |

## 14. Documentation updates

- `README.md`: architecture (lib/api, contract pattern, Server Actions, fake API), current
  limitations (point to `docs/backend-gaps.md`), directory structure, testing.
- `AGENTS.md`: wire-contract rule (snake_case zod schemas; never generate from the OpenAPI as-is),
  idempotency-key rule, nullable-branch context rule, fake-API rule for E2E.
- `docs/deployment.md`: `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
- `docs/backend-gaps.md`: kept current as slices land.

## 15. Out of scope

Backend changes; global search; export; notifications beyond the approval count; any feature listed
as a Gap in `docs/backend-gaps.md`; MUI X or any new package; changes to the Keycloak/Better Auth
login flow.

## 16. Environment decisions and open items

Resolved at spec review (2026-09-25):

1. **Platform organisation ID.** Dev uses the backend seed, `00000000-0000-0000-0000-000000000000`;
   local `.env.local` values must match (the previous local value was stale).
2. **Dev data.** Dev has two active administrators in one tenant (one assigned to more than one
   branch) with Keycloak provisioning and email enabled, so every slice's mutation flows are verified
   live against dev (the user signs in; the agent drives).
3. **Stack base.** The stack builds on `main`; the existing `prod-app` dependency-bump commit becomes
   PR 0 at the bottom of the stack.
4. **Plan granularity.** The implementation plans detail PRs 0–7 (the shell layer is split into
   PR 4 shell and PR 5 context); each later slice gets a just-in-time plan written from this spec
   before it starts.

Still open (verified during the relevant slice):

5. **Settings writes.** Confirm live that `PUT /tenant/settings/{key}` returns 500 (§10.7).

## 17. Acceptance criteria

- Every tenant and platform screen in §10–§11 is reachable from the new shell, renders live data,
  and performs its listed actions against the dev API (subject to the backend rules documented in
  `docs/backend-gaps.md`).
- No mock or fabricated data is rendered anywhere; unavailable features are absent, not faked.
- All lists are paginated with URL-persisted state; no unbounded list is requested except the bounded
  lookup indexes (§6.3).
- No access, refresh, or ID token and no raw backend payload reaches a Client Component.
- The theme reproduces the prototype's tokens, typography, and density; dark mode meets AA; no
  serious/critical axe violations in either theme at desktop and mobile widths.
- `pnpm check`, `pnpm test:e2e`, and `pnpm build` pass on every PR in the stack.
