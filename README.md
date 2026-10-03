# Finaxis Web

The production frontend foundation for **Finaxis**, a modern SACCO core banking and
enterprise financial platform.

This repository establishes the project's frontend foundation — tooling, theming, real Keycloak
authentication, server-side organisation/branch context selection, and an authenticated shell
(Administration, Profile) — so future feature work has a clean, consistent base to build on. It
does not yet implement domain modules or business workflows beyond the authentication, context,
and shell flows described below.

## Technology stack

- [Next.js](https://nextjs.org) (App Router, Turbopack, React 19, TypeScript, strict mode)
- [Material UI](https://mui.com) for components, theming, and design tokens
- [Tailwind CSS v4](https://tailwindcss.com) for layout composition only (grid/flex/spacing)
- [React Hook Form](https://react-hook-form.com) + [Zod](https://zod.dev) for form state and validation
- [Vitest](https://vitest.dev) + [React Testing Library](https://testing-library.com/react) for unit/component tests
- [Playwright](https://playwright.dev) + [axe-core](https://github.com/dequelabs/axe-core) for end-to-end and accessibility tests
- ESLint (flat config) + Prettier

## Prerequisites

- Node.js `>=24.15.0` (see `.nvmrc` / `.node-version` — 24 is the current LTS line)
- pnpm `11.13.1` (pinned via `packageManager` in `package.json`; enable with `corepack enable`)

## Installation

```bash
pnpm install
```

## Local development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — the root route redirects to `/login`.

## Available scripts

| Script                         | Purpose                                                           |
| ------------------------------ | ----------------------------------------------------------------- |
| `pnpm dev`                     | Start the Turbopack dev server                                    |
| `pnpm build`                   | Production build                                                  |
| `pnpm start`                   | Serve the production build                                        |
| `pnpm lint` / `lint:fix`       | ESLint (flat config), zero warnings allowed                       |
| `pnpm typecheck`               | `tsc --noEmit`                                                    |
| `pnpm format` / `format:check` | Prettier                                                          |
| `pnpm test` / `test:run`       | Vitest (watch / single run)                                       |
| `pnpm test:coverage`           | Vitest with V8 coverage                                           |
| `pnpm test:e2e`                | Playwright end-to-end tests (Keycloak-independent)                |
| `pnpm test:e2e:ui`             | Playwright UI mode                                                |
| `pnpm test:e2e:keycloak`       | Real-Keycloak smoke test (manual; requires a live local Keycloak) |
| `pnpm fake-api`                | Run the E2E fake backend alone (port 3199)                        |
| `pnpm check`                   | format:check + lint + typecheck + unit tests                      |
| `pnpm verify`                  | `check` + coverage + build (full pre-merge gate)                  |

## Git hooks and linting

[Husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged)
run automatically (installed via `pnpm install`'s `prepare` script — no manual setup needed):

- **pre-commit**: lints and formats staged files only (`eslint --fix --max-warnings=0` +
  `prettier --write`).
- **pre-push**: `pnpm typecheck && pnpm test:run` — a fast correctness gate before code leaves
  your machine. `pnpm test:e2e` and the build are intentionally left to CI since they're slower.

ESLint layers `typescript-eslint`'s `strictTypeChecked` + `stylisticTypeChecked` presets and
`eslint-plugin-jsx-a11y`'s `strict` rules on top of `eslint-config-next` — all official preset
configs, chosen for a multi-contributor codebase where the type checker catching a bug beats a
reviewer catching it. The one hand-written rule is a `no-restricted-syntax` guard against a dotted
palette path in `color` (`color="text.secondary"`) on `Typography`, `Box`, `Stack`, `Grid`,
`DialogContentText` and `TruncatedText`, which MUI v9 silently ignores; write
`sx={{ color: 'text.secondary' }}` (`TruncatedText`: `color="textSecondary"`). MUI `Link` still
honours a dotted `color`.

## Testing

- **Unit/component**: `pnpm test:run` (or `pnpm test:coverage` for coverage). Tests live next to
  the code they cover (e.g. `components/auth/continue-with-keycloak-button.test.tsx`) and query
  the DOM by role and accessible name rather than implementation details.
- **End-to-end**: `pnpm test:e2e`. Playwright starts two servers: the standalone fake platform API
  (`e2e/fake-api/`, plain `node` with type stripping, zero dependencies) and the Next dev server
  pointed at it. Locally it reuses servers already listening on ports 3100/3199
  (`reuseExistingServer`) instead of starting its own, so stop any `pnpm dev`/`pnpm fake-api` you
  have running first — otherwise the suite runs against whatever is already there. Tests that need
  a signed-in session call `authenticate(context, testInfo, scenario)` from
  `e2e/support/auth.ts`, which gives each test its own scenario-seeded fake backend; unauthenticated and fake-API smoke specs don't.
  The fake mirrors the real API's wire behaviour (snake_case, problem+json, context tokens, permissions — see
  `docs/superpowers/specs/2026-09-25-admin-prototype-parity-api-contract.md`). Run it alone with
  `pnpm fake-api`. Chromium is the required project; install it once with
  `pnpm exec playwright install chromium`. This suite never talks to a real Keycloak or backend.
- **Real-Keycloak smoke test**: `pnpm test:e2e:keycloak` (`e2e/keycloak-smoke.spec.ts`,
  `playwright.keycloak.config.ts`). A separate, manually invoked test that requires a live local
  Keycloak + Postgres (e.g. `docker compose up -d postgres keycloak` in the platform repo) and
  the local `finaxis` realm's `local.admin` user. It exercises one genuine browser round trip —
  login redirect, Keycloak's hosted login form, the authenticated shell, sign-out through
  Keycloak's logout confirmation page, and a truly cleared session — and skips (rather than
  fails) with an actionable message if Keycloak isn't reachable on `:8080`. See
  `docs/authentication/security.md` for what running it for real uncovered.

## Theme architecture

A single Material UI theme (`theme/create-finaxis-theme.ts`) defines both the light and dark
Finaxis color schemes via `colorSchemes` + `cssVariables` (prefix `finaxis`, selector `class`).
`InitColorSchemeScript` (in `app/layout.tsx`) applies the persisted scheme class before hydration
to avoid an SSR flash, and the `ThemeModeToggle` component reads/writes it through MUI's
`useColorScheme` hook — no custom theme context or storage was written.

`theme/tokens.ts` is the single source of raw token values (`LIGHT`, `DARK`, the scheme-independent
`BRAND` navy tones, `MARK_GRADIENT`); `create-finaxis-theme.ts` maps them into the palette and
component overrides. Tokens outside MUI's standard palette (brand, surfaces, status, avatar,
focus) are typed via module augmentation in `theme/theme.types.ts` and consumed as ordinary
palette paths, e.g. `sx={{ color: 'brand.onNavy' }}`. `theme/tokens.test.ts` (with
`theme/contrast.ts`) gates every text pair at WCAG AA 4.5:1 and non-text pairs at 3:1.

## MUI and Tailwind responsibility boundary

- **MUI owns**: component visuals, semantic color, typography, form styling, focus states,
  border radii, status/alert presentation, interactive states.
- **Tailwind owns**: responsive layout, flex/grid, gap, width/height, visibility, positioning,
  page-level composition. Tailwind utilities never override MUI component internals.
- CSS cascade layers (`@layer theme, base, mui, components, utilities`) plus
  `enableCssLayer: true` on `AppRouterCacheProvider` keep the two systems from fighting over
  specificity.
- `app/globals.css` also bridges MUI's generated `--finaxis-*` CSS variables into Tailwind's
  `@theme` (e.g. `--color-primary: var(--finaxis-palette-primary-main)`), so layout-only utility
  classes like `bg-primary` stay in sync with the Finaxis theme instead of duplicating raw colors.

## Directory structure

```
app/
├── (public)/login/page.tsx  # Split-screen login page (Better Auth Keycloak sign-in)
├── (authenticated)/          # Server-guarded routes: layout.tsx validates session + context
│   ├── layout.tsx             # Authoritative auth guard for /admin, /profile, /platform-admin
│   ├── admin/                 # Overview, Users & access, Branches, Roles & permissions,
│   │                            # Settings, Business date, and Audit trail pages; a later layer
│   │                            # adds the Approval queue as its own nav item (spec §8)
│   │   ├── layout.tsx           # Redirects a platform context to /platform-admin
│   │   ├── business-date/page.tsx # Current date/status hero, close-of-business actions, history
│   │   ├── audit/page.tsx       # Audit trail: entity/action/date filters, pagination, an event
│   │   │                          # detail drawer with before/after JSON
│   │   ├── branches/            # Branch directory (search, status/type filters, sortable headers),
│   │   │                          # create draft (new/), and the record ([branchId]/: layout hero +
│   │   │                          # lifecycle actions; Overview, Users, and Audit tabs)
│   │   ├── roles/               # Role directory (search, status/type filters, sortable headers),
│   │   │                          # create (new/), and the record ([roleId]/: hero + Edit and
│   │   │                          # Activate/Deactivate; Overview, Permissions, Assignments, and
│   │   │                          # Audit tabs; edit/)
│   │   ├── settings/page.tsx    # Settings catalogue: read-only controls, reset to default
│   │   └── users/               # Users & access: directory (search, user and membership status
│   │                              # filters), and the record ([userId]/: hero membership
│   │                              # lifecycle; Overview, Roles & access, Branch assignments and
│   │                              # Audit tabs)
│   ├── platform-admin/         # Platform workspace, gated to the platform organisation's context
│   │   ├── layout.tsx           # Redirects tenant contexts away; requires platform-admin module
│   │   └── tenants/             # SACCO institutions: directory (search, status/country/created
│   │                              # filters, sortable headers), create wizard (new/), the record
│   │                              # ([tenantId]/(record)/: hero lifecycle; Overview and
│   │                              # Provisioning tabs), and amend ([tenantId]/amend/)
│   └── profile/                # Account profile: layout.tsx (hero + tabs) and the Overview,
│                                # Contexts, Roles & permissions, Security and Activity tabs
├── api/auth/                 # Better Auth route handlers (`[...all]`, `logout`)
├── api/context/               # Same-origin context discovery/selection routes
├── api/tenant/users/          # Same-origin user search for UserPicker (first page only)
├── globals.css               # CSS layers, Tailwind import, MUI/Tailwind bridge, restrained defaults
├── layout.tsx                 # Root layout: fonts, AppRouterCacheProvider, AppProviders
├── loading.tsx / not-found.tsx
├── error.tsx                  # Root error boundary: shows only the digest, never a server message
└── icon.tsx                   # Generated favicon (temporary Finaxis mark)
auth/
├── auth.ts / auth-client.ts  # Better Auth server instance + browser client (keycloak() plugin)
├── auth.types.ts
├── get-authenticated-user.ts  # Server-side session validation used by route guards
├── map-authenticated-user.ts  # Raw session/claims -> sanitized `FinaxisUser` DTO
├── context-service.ts        # Server-only backend discovery/selection/profile calls
├── context-cookie.ts          # HttpOnly context token cookie (never sent to the browser)
├── context-browser-dto.ts     # Whitelisted/camelCased context shapes exposed to the browser
├── context-contract.ts        # Zod schemas parsing every `/auth/*` response (wire shapes)
├── context-destination.ts     # Prefix-allow-listed post-selection `next` destination
├── context-selection-redirect.ts # Builds the `/select-context?next=` redirect from proxy.ts's header
└── build-keycloak-logout-url.ts
config/
├── application-context.ts    # Typed module/organisation/branch context value
└── env.server.ts              # Validated server environment variables
lib/
├── api/                        # Context-scoped backend reads and mutations: tenant-api.ts's
│                                # `apiGet`/`apiPost`/`apiPut`/`apiPatch`/`apiDelete`, the Server
│                                # Action pipeline (action-result.ts's `runServerAction`), paging
│                                # (paging.ts), wire schemas (wire.ts), problem mapping and
│                                # `load()` (problem.ts, load.ts), named guard copy
│                                # (explain-action-result.ts's `explain`), bounded
│                                # name/branch/role lookups (lookups.ts), URL query-string
│                                # helpers (query-string.ts's `toQueryString`/`toSearchParams`/
│                                # `hrefWith`), and the URL sort allow-list (list-sort.ts's
│                                # `parseListSort`/`sortQuery`)
├── apply-field-errors.ts        # Server Action `fieldErrors` → React Hook Form field errors
├── business-date.ts             # `dd-MM-yyyy` business date parsing/compare/convert
                                   # (`businessDateDay`, `isoToBusinessDate`, `nextBusinessDateIso`)
└── format.ts                    # Shared display formatting: `formatInstant` (organisation
                                   # timezone, else UTC with a label), `shortId`,
                                   # `formatBusinessDate` (short/long, no timezone shift)
modules/
├── administration/            # Administration module + navigation registration; business-date/
│                                # holds the business date contract, service, rules, and Server
│                                # Actions (modules/administration/business-date/); audit/ holds
│                                # the audit trail's contract, query parsing, service, vocabulary,
│                                # and the record kit's RecordAuditTab/AuditViewToggle/
│                                # audit-rows.ts (modules/administration/audit/); branches/ holds
│                                # the branch contract, list query, lifecycle rules, service,
│                                # Server Actions, and components (modules/administration/branches/);
│                                # roles/ holds the role, permission-catalogue and role-assignment
│                                # contract, list query, rules, service, Server Actions, and
│                                # components (modules/administration/roles/); users/ holds the
│                                # users and membership contract, directory query, onboarding and
│                                # action rules, service, membership Server Actions, user search
│                                # for pickers, and components (modules/administration/users/);
│                                # settings/ holds the settings catalogue's contract, rules,
│                                # service and Server Actions (modules/administration/settings/)
├── platform-administration/   # Platform module + navigation; tenants/ holds the institution
│                                # contract, directory query, lifecycle rules, service, Server
│                                # Actions, and components (modules/platform-administration/tenants/);
│                                # the root keeps the tenant branch and user reads for layer 17
└── profile/                   # Account profile: profile-rules, the cached profile-service, and
                                 # the tab components (modules/profile/components/)
components/
├── auth/                     # Keycloak sign-in button, login status alert
├── branding/                  # FinaxisLogo, ProductFeature
├── context/                    # Shared organisation/branch selection: ContextSelectionPage,
│                                # ContextSelectionForm, useContextSelection, context-api,
│                                # PaginationControls, SwitchToAllBranchesButton
├── data-display/               # Reusable list and record building blocks: ListToolbar
│                                # (search/select/datetime, plus extra controls as children, e.g.
│                                # the audit trail's actor picker), TablePaginationBar,
│                                # StatusChip, DescriptionList, TruncatedText, EmptyState,
│                                # ErrorState, useListNavigation; the record kit (layer 07b)
│                                # RecordHero, RecordTabs (link tabs as nested routes),
│                                # CopyIdButton, ForbiddenState/BranchContextState,
│                                # ConfirmDialog; SectionCard and ReasonDialog (07);
│                                # AssignmentDrawer (08); focusRecordTitle (09); WizardForm and
│                                # its Stepper theme (16)
├── navigation/                 # next/link client re-export (Next.js 16 RSC boundary workaround)
├── providers/                  # AppProviders (ThemeProvider/CssBaseline), ThemeModeToggle, ToastProvider
└── shell/                      # AppShell, header, drawer, context switcher dialog, app switcher,
                                 # user menu, workspace navigation, tenant-/platform-notifications
                                 # (app-bar notification slot stubs, spec §8; both render null until
                                 # a later PR populates them)
theme/
├── tokens.ts                   # Raw token values (LIGHT/DARK/BRAND) — the source of truth
├── create-finaxis-theme.ts   # Single theme, light/dark colorSchemes, component defaults
├── theme.types.ts              # Palette module augmentation (brand.*, status.*, … tokens)
├── contrast.ts                 # WCAG contrast ratio, used by the tokens.test.ts gate
└── index.ts                    # Public exports
proxy.ts                        # Optimistic cookie-presence redirect (not a trust boundary);
                                 # forwards the requested pathname so context selection can return
                                 # the user to it afterwards
test/                           # Vitest setup, renderWithProviders, ownStyle (an element's own CSS)
e2e/
├── fake-api/                   # Standalone fake backend (plain Node, `.mts`; `routes/` handlers,
│                                # `scenarios.mts` seed data, `state.mts` run state,
│                                # `idempotency.mts`'s `sendIdempotent` (Idempotency-Key replay/
│                                # reuse), `audit-log.mts`'s `recordAuditEvent`)
├── support/                     # Shared spec helpers (`auth.ts`, `admin.ts`, `fake-api.ts`)
└── *.spec.ts                    # Playwright specs
docs/authentication/            # Architecture, Keycloak setup, security, session-model docs
docs/deployment.md               # VPS/Coolify deployment
Dockerfile                      # Multi-stage build for the standalone Next.js output
.github/workflows/ci.yml
```

## Authentication

Real Keycloak OIDC authentication via [Better Auth](https://better-auth.com), running
stateless (no application auth database) — see `docs/authentication/architecture.md` for the
full sequence and `docs/authentication/stateless-sessions.md` for the session model and its
trade-offs.

- The login page's single action starts a Better Auth Generic OAuth (`keycloak()` provider)
  Authorization Code + PKCE flow through same-origin `/api/auth/*` routes — the browser never
  calls Keycloak directly.
- `app/(authenticated)/layout.tsx` is the authoritative, server-validated guard for `/admin` and
  `/profile`; `proxy.ts` only does an optimistic, cookie-presence redirect.
- Logout (`components/shell/user-menu.tsx`) is a real `<form method="POST">` submit to
  `/api/auth/logout`, which clears the local session and redirects the browser to Keycloak's
  RP-initiated logout endpoint — see `docs/authentication/security.md` for why it can't include
  `id_token_hint` in this Better Auth version.
- `docs/authentication/keycloak.md` documents the required Keycloak client settings.

## Deployment

Server-rendered only — no static export (see `docs/deployment.md` for why and how). The
`Dockerfile` builds a `next.config.ts`-standalone-output image for deployment to a VPS via
[Coolify](https://coolify.io); `docs/deployment.md` covers the full setup, required environment
variables, and the Redis-backed rate limiter needed once more than one instance runs.

## Current limitations

- Server-side organisation and branch discovery and selection are wired through `/select-context`
  before the authenticated shell renders. The selected backend context token is persisted only in
  an HttpOnly cookie; browser route responses contain status-safe data and never expose the token.
- A multi-branch member can choose "All branches (institution level)" instead of a single branch;
  the header, app shell footer, and platform-admin page render `branch?.name ?? 'All branches'` for
  that nullable-branch context (AGENTS.md), and the profile page renders the same nullable selected
  branch as "All branches (institution level)".
- The app bar's context button (`components/shell/context-switcher-dialog.tsx`) re-runs the same
  organisation/branch selection in a dialog, so a signed-in user can switch organisation or branch,
  or drop to All branches, at any time. A same-organisation branch switch refreshes in place; an
  organisation change also navigates to that organisation's workspace (`/admin` or
  `/platform-admin`). Picking an organisation, the current one included, always re-POSTs
  select-organisation, because the context cookie is shared across tabs and may no longer match
  what this tab shows; that POST drops any pinned branch, so closing the dialog at the branch step
  lands at All branches.
- The two-tile app switcher (`components/shell/app-switcher.tsx`) moves a platform member between
  the Administration and Platform Administration workspaces. Multi-branch platform members land at
  All branches from the switcher; they pin a specific branch afterwards with the context button. A
  failed auto-pin (server error) also lands at All branches; one that fails because the context was
  rejected or already gone (403/409) instead sends the user to `/select-context` with no toast. A
  rejected organisation POST from the switcher opens the context dialog with no further explanation.
- Deep links into a protected route survive `/select-context` by path only: the redirect's `next`
  query param is validated against a prefix allow-list (`auth/context-destination.ts`) before the
  post-selection redirect uses it, so an unrecognized or external value falls back to `/profile`;
  `SAFE_PATH` rejects a `?`, so a deep link's own query string (e.g. tenant-directory paging) is
  dropped, not preserved.
- `app/error.tsx` is the root error boundary for anything thrown below the root layout, including a
  backend outage or a response that no longer matches the contract. It shows only Next's error
  digest as a support reference; server error messages are never rendered.
- The profile page renders the backend `/api/v1/auth/me` result for the selected context, including
  organisation, selected branch, assigned branches, roles, and permissions.
- Authorization/permission enforcement remains a backend concern; UI-displayed roles and
  permissions are informational and are not a trust boundary.
- The global shell (`components/shell/app-shell.tsx`) mirrors that same boundary: each module's
  rail navigation is filtered to the items the signed-in user's permissions satisfy
  (`workspace-navigation.tsx`'s `visibleNavigationItems`) — UI gating only, not authorization; the
  backend stays the authority. The rail's collapsed/expanded preference persists in a
  `finaxis_nav` cookie read server-side (`app/(authenticated)/layout.tsx`) so first paint already
  renders the right rail width.
- Administration currently ships the Overview, Users & access, Branches, Roles & permissions,
  Settings, Business date, and Audit trail pages; the Approval queue is built out (with real
  data, not placeholders) when its layer lands, registering its own item in
  `modules/administration/administration-navigation.ts`.
- Business date (`/admin/business-date`, `modules/administration/business-date/`) reads
  `GET /tenant/business-date` and `GET /tenant/business-date/history` and renders the current date,
  status, and a paginated history table, plus an app-bar chip (spec §8) linking back to the page.
  Every mutation (start/complete close of business, reopen, advance) is a Server Action behind a
  shared `ReasonDialog`, gated on its own permission code and `business_date.view`
  (`docs/backend-gaps.md` BG-31), and a 409 lock-timeout response surfaces as a retryable "another
  change is in progress" error without losing the request's idempotency key. Known limits:
  - No close-of-business readiness checks (the prototype's checklist) — the backend doesn't expose
    one yet (`docs/backend-gaps.md` BG-21).
  - Advancing the date has no upper bound beyond the new date being later than the current
    business date (days can be skipped); the prototype's calendar picker and reason-length
    affordances are a later visual pass.
- The Audit trail (`/admin/audit`, `modules/administration/audit/`) reads
  `GET /tenant/audit-events` and `GET /tenant/audit-events/{id}` and renders them with pagination,
  a detail drawer (before/after JSON, actor/entity/branch facts), and removable actor/entity chips
  (`?actorId=`/`?entityId=`, the latter reachable only via a hand-edited or shared link today).
  Known limits:
  - Only structured filters exist (entity type, entity, action, actor, date range) — no
    free-text, outcome, severity, branch, or event-type filter, because the backend doesn't
    expose one yet (`docs/backend-gaps.md` BG-16).
  - An actor is filtered by picking a user in the Actor search (the first 10 matches; it needs
    `user.view`) or by clicking their name on a visible row. The picker (`AuditActorPicker`) takes
    the applied `actorId`, so its search starts over, empty, when the filter changes, and it
    refocuses its input after its own pick.
  - Actor and entity names are resolved only for the IDs on the current page (deduplicated,
    bounded lookups); an actor or entity not resolvable falls back to their id.
  - The branch lookup used to label rows is bounded to the first 500 branches in the tenant.
  - The Branch column shows the branch stamped on the _request's_ selected context, not
    necessarily the branch the action was performed on (wire contract §E.4, `docs/backend-gaps.md`
    BG-16); relabelling this in the UI is left to a later visual pass.
  - The table shows short IDs. The drawer's Actor fact shows the resolved name when one is
    available, else the full actor user ID (with the actor's external subject in parentheses when
    it has one); the drawer's entity, request, and correlation IDs always render as full IDs — all
    selectable text (no copy affordance yet).
  - Times render in the organisation's timezone (labelled, e.g. `Africa/Nairobi`), falling back to
    UTC — and branches to short IDs — whenever `/tenant` or `/branches` isn't readable in the
    current context, which is the more common fallback case (e.g. the backend seed's IAM_ADMIN
    role, which holds `audit.view` without `tenant.view` or `branch.view`); a timezone value
    `Intl` itself rejects falls back the same way, but that is rarer.
- Branches (`/admin/branches`, `modules/administration/branches/`) lists and searches branches
  (code/name search, status and type filters, five sortable columns) from `GET /branches`,
  creates a draft, and drives the lifecycle (submit, activate, suspend, reactivate, close) and user
  assignments (assign/revoke) as Server Actions behind `ReasonDialog`/`ConfirmDialog`/
  `AssignmentDrawer`. The record page (`RecordHero` + `RecordTabs`) renders Overview, Users, and
  Audit tabs. Known limits:
  - No address, edit, or opened/closed-date fields (`docs/backend-gaps.md` BG-13).
  - The maker-checker lookup (who drafted a pending branch) needs `audit.view`
    (`docs/backend-gaps.md` BG-08); Activate is never disabled for an unknown maker.
  - A branch the selected branch context can't reach shows a guided "Switch to All branches"
    state instead of a raw 404 (`docs/backend-gaps.md` BG-03).
  - No draft delete or reject — a live-created draft is permanent (`docs/backend-gaps.md` BG-01).
  - The directory's Type filter offers only the two platform types (`HEAD_OFFICE`, `OPERATIONS`);
    a tenant-defined type filters only through a hand-edited `?type=` URL.
  - The toolbar search commits on Enter or blur, not as you type.
  - The Users tab resolves each visible assignment's user name with its own read, since assignment
    rows carry no name (`docs/backend-gaps.md` BG-09).
- Roles & permissions (`/admin/roles`, `modules/administration/roles/`) lists roles from
  `GET /tenant/roles`: code/name search, status and system/custom filters, and sortable
  Role/Code/Status headers. It creates and edits custom roles and activates or deactivates them.
  It grants permissions from the catalogue (search, risk filter, grouped by module, several per
  submit) and removes them after a confirmation. It also assigns or revokes the role
  institution-wide or at one branch. The record page renders Overview, Permissions, Assignments,
  and Audit tabs. Known limits:
  - The directory shows only what role summaries carry: no description, created date, or counts
    (`docs/backend-gaps.md` BG-09, BG-15). Its default order is newest first.
  - The toolbar search commits on Enter or blur, not as you type.
  - Backend `validation_failed` violations aren't mapped onto form fields; the forms apply the same
    rules client-side (`docs/backend-gaps.md` BG-09).
  - System roles are immutable (the backend answers 409), so their edit, status, and permission
    controls are hidden. They can still be assigned.
  - A grant submit carries up to 25 permissions. Each is its own write, with an idempotency key
    derived from the drawer's key, so a partial failure shows what landed and a retry replays
    it.
  - The catalogue (80 codes) and a role's granted set are each one bounded read of 100.
  - "Active assignments" counts assignments, not distinct users (BG-15).
  - A branch-scoped assignment needs the user's existing assignment at that branch, and a branch
    context offers only its own branch.
  - Assigning is offered only for ACTIVE roles. There is no role delete or archive (BG-27).
  - A description can be replaced but not removed (BG-34).
  - The Audit tab shows the role's own changes. Assignment changes are audited per assignment
    (BG-16).
- Settings (`/admin/settings`, `modules/administration/settings/`) reads the catalogue and the
  tenant's stored keys in one bounded read. Editing ships disabled behind `SETTINGS_EDIT_ENABLED`
  because the platform can't save changes yet (`docs/backend-gaps.md` BG-04); reset to default
  works. The two maker-checker switches and automatic advance are shown read-only with honest
  labels (BG-12).
- Users & access (`/admin/users`, `modules/administration/users/`) lists the tenant's users
  from `GET /tenant/users` (search, user status and membership status filters; newest first,
  no sort) and opens a record with the membership lifecycle (approve, reject and revoke,
  suspend, reactivate, revoke) and Overview, Roles & access, Branch assignments and Audit tabs.
  The Audit tab offers up to four views: User record, Account, Membership (once the membership
  is found) and Performed by. Known limits:
  - The directory shows only what user summaries carry, and the onboarding state is derived
    from the membership and user statuses (`docs/backend-gaps.md` BG-09, BG-11).
  - A user's membership is found by searching memberships for their email (at most 5 pages of
    100 matches) and matching the user id exactly; their branch assignments come from a scan of
    at most 500 active assignments, marked partial when it stops early (with or without a
    selected branch), and only the selected branch shows while one is selected (BG-09, BG-03).
    Assign branch offers the first 100 active branches (only the selected one while a branch is
    selected).
  - Approve is disabled, with the reason, for the user's inviter (when `audit.view` can show
    who that was) and for a blocked account, and withheld once approval ran. Other refusals are
    explained: a 403 as permission or maker-checker (BG-08), a 500 by its likely causes, such as
    a missing active role (BG-07). "Provisioning identity" can stay put with no resend (BG-11).
  - Reject & revoke and Revoke are permanent: the email can't be invited again (BG-28).
    Suspend and Revoke are disabled on your own record (BG-35).
  - A branch-scoped role offers only branches the user is assigned to; a partial scan says so
    instead of claiming none. Role assignment changes are audited per assignment and branch
    assignment changes on the branch, so the Audit tab can't show them (BG-16).
  - No phone, member number, last activity, MFA or profile edit (BG-17).
  - The toolbar search commits on Enter or blur, and backend `validation_failed` violations
    aren't mapped onto form fields (BG-09).
- The Platform Administration workspace (`/platform-admin`, reachable only when the selected
  context's organisation is the platform organisation) manages SACCO institutions through
  `modules/platform-administration/tenants/`: the directory, the create-draft wizard, amend, the
  record's lifecycle (submit, approve, reject, suspend, reactivate, deprovision) and bootstrap
  retry. Times show in UTC.
  - The reserved platform organisation is hidden from the directory and its record URL shows the
    not-found page (the layout's `notFound()` answers HTTP 200); a filtered count can read one
    high (`docs/backend-gaps.md` BG-29). One check, `isInstitutionId` (a UUID that is not the
    platform organisation, in any letter case), guards the record, both tabs, amend and every
    tenant Server Action.
  - The create is posted first; a duplicate tenant code is a backend 500 (BG-07), so only after
    that failure one lookup (one page of 100 matches) names the cause. A retry with the same
    idempotency key replays.
  - Approve stays on offer for its maker: the platform context can't read who created or
    submitted a request, so a refusal is explained as permission or maker-checker (BG-08).
  - Amend re-asks the legal name, registration number and first administrator, which the
    platform never returns (BG-14). There are no Settings or Audit tabs (BG-12, BG-06).
  - The toolbar search commits on Enter or blur, not as you type.
  - The overview, and the tenant branch and user reads in `platform-administration-service.ts`,
    are layer 17's.
- Beyond context discovery/selection, profile retrieval, Platform Administration's institutions, and
  Administration's Users & access, Branches, Roles & permissions and Settings above, the Approval
  queue is not connected yet.
- Legal/support links (`/legal/terms`, `/legal/privacy`, `mailto:support@finaxis.io`) and
  `/forgot-password` are placeholders; the first three routes resolve to the app's `not-found`
  page until real content exists.
- The Finaxis mark (`FinaxisLogo`, `app/icon.tsx`) is a temporary geometric placeholder pending
  the official logo asset.

## Next recommended implementation steps

1. Add Keycloak claim mappers and enforce authorization/permissions server-side, instead of
   treating UI-shown roles as informational only.
2. Build out the Approval queue and the Invite user wizard (layers 12 and 11) against real data,
   each registering what it needs.
3. Extend Platform Administration with tenant branches and users, platform users, and the KPI
   overview (layer 17).
4. Replace the temporary `FinaxisLogo` mark with the official brand asset.
5. Expand the theme's component defaults only as real screens demand them.
