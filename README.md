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
| `pnpm test:e2e`                | Build the e2e flavour, then run Playwright (Keycloak-independent) |
| `pnpm test:e2e:ui`             | Build the e2e flavour, then Playwright UI mode                    |
| `pnpm build:e2e`               | Production build with the e2e switch, into `.next-e2e/`           |
| `pnpm test:e2e:guard`          | Check the normal production build ignores the e2e bypass          |
| `pnpm test:e2e:keycloak`       | Real-Keycloak smoke test (manual; requires a live local Keycloak) |
| `pnpm fake-api`                | Run the E2E fake backend alone (port 3199)                        |
| `pnpm check`                   | format:check + lint + typecheck + unit tests                      |
| `pnpm verify`                  | `check` + coverage + build (full pre-merge gate)                  |

## Git hooks and linting

[Husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged)
run automatically (installed via `pnpm install`'s `prepare` script — no manual setup needed):

- **pre-commit**: lints and formats the staged files (`eslint --fix --max-warnings=0` +
  `prettier --write`; JSON, Markdown and CSS get Prettier only), then runs `pnpm check` (format,
  lint, typecheck and the unit tests) on the whole tree.
- **pre-push**: `pnpm typecheck && pnpm verify`: `pnpm check`, the unit tests with coverage and
  the production build, which needs the environment `config/env.server.ts` validates.
  `pnpm test:e2e` is left to CI since it's slower.

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
- **End-to-end**: `pnpm test:e2e` builds the e2e flavour of the production build
  (`pnpm build:e2e`: `FINAXIS_E2E_BUILD=1`, written to `.next-e2e/`), then runs Playwright, which
  starts two servers: the standalone fake platform API (`e2e/fake-api/`, plain `node` with type
  stripping, zero dependencies) and that build's standalone `server.js` pointed at it, bound to
  `127.0.0.1:3100`. The suite therefore tests what ships: production React, minified bundles, the
  production CSP. The app server is never reused: if port 3100 is taken (a forgotten `pnpm dev`),
  the run refuses to start; locally a fake API already on 3199 is reused. After an app change,
  `pnpm test:e2e` rebuilds; `pnpm exec playwright test` alone runs against the existing
  `.next-e2e/` (and says to run `pnpm build:e2e` when there is none). To write a spec against
  `next dev` without rebuilding after each edit, run `E2E_DEV_SERVER=1 pnpm exec playwright test`
  with the spec's path; CI never does. That mode runs one worker with longer waits
  (120 s per test, 45 s per assertion), as `next dev` compiles each route on its first visit. Never set `FINAXIS_E2E_BUILD` in a `.env*` file: every
  `pnpm build` would become an e2e build. The session bypass the specs sign in through, and the guard that keeps
  it out of every normal build (`pnpm test:e2e:guard`), are described in
  `docs/authentication/security.md`. Tests that need
  a signed-in session call `authenticate(context, testInfo, scenario)` from
  `e2e/support/auth.ts`, which gives each test its own scenario-seeded fake backend; unauthenticated and fake-API smoke specs don't.
  Waits use Playwright's defaults (5 s per assertion, 30 s per test); the few longer ones (three
  accessibility matrices that scan many pages) state their measured reason beside them.
  `e2e/click-helpers.spec.ts` uses neither the app nor the fake API (it checks the click helpers
  on a static page, `page.setContent`), but Playwright still starts both servers for it, so an
  app start-up failure blocks it too.
  The fake mirrors the real API's wire behaviour (snake_case, problem+json, context tokens, permissions — see
  `docs/superpowers/specs/2026-09-25-admin-prototype-parity-api-contract.md`). Run it alone with
  `pnpm fake-api`. Chromium is the required project; install it once with
  `pnpm exec playwright install chromium`. This suite never talks to a real Keycloak or backend.
  The e2e helper `clickMuiOption` (`e2e/support/auth.ts`) clicks an option in a single-choice MUI
  menu once the menu has finished growing in, then waits for it to close; `clickInMuiPopover`
  clicks inside a MUI popover (the bell, the app switcher) once it has finished growing in.
- **Real-Keycloak smoke test**: `pnpm test:e2e:keycloak` (`e2e/keycloak-smoke.spec.ts`,
  `playwright.keycloak.config.ts`). A separate, manually invoked test that requires a live local
  Keycloak + Postgres (e.g. `docker compose up -d postgres keycloak` in the platform repo) and
  the local `finaxis` realm's `local.admin` user. It exercises one genuine browser round trip —
  login redirect, Keycloak's hosted login form, the authenticated shell, sign-out through
  Keycloak's logout confirmation page, and a truly cleared session — and skips (rather than
  fails) with an actionable message if Keycloak isn't reachable on `:8080`. See
  `docs/authentication/security.md` for what running it for real uncovered.
- **Running the end-to-end suite as CI does**: after `pnpm build`, CI installs the Chromium build
  `@playwright/test` pins (`pnpm exec playwright install --with-deps chromium`), runs the guard
  (`pnpm test:e2e:guard`), builds the e2e flavour (`pnpm build:e2e`) and runs
  `pnpm exec playwright test` headless, which is Playwright's `chromium-headless-shell`, with
  `CI=true`: servers never reused, and one retry — it tells a flaky test from a hard failure and
  records a trace and a video (the only video recorded), and a test that needed it fails the run
  (`failOnFlakyTests`). A flaky test's recorded retry is the run that passed; its failed first
  attempt keeps the error, a screenshot and an ARIA snapshot. Locally there is no retry, so a
  failure keeps those three; add `--trace retain-on-failure` for a trace with a screencast. Locally and on CI the suite runs one worker per CPU against the production
  build (`--workers=N` lowers it on a machine with many CPUs); with `E2E_DEV_SERVER=1` it runs one
  worker, as `next dev` compiles on demand.
  Another Chromium (an older installed build, or a full Chrome through `channel` or
  `executablePath`) lays out buttons and text a few pixels differently, so a layout-sensitive test
  can pass there and fail on CI. To see what CI sees, install the pinned build and run
  `CI=true pnpm test:e2e <spec> --retries=0` with ports 3100 and 3199 free. With
  `E2E_DEV_SERVER=1`, `next dev` refuses to start while another dev server of the same checkout runs, and names its PID: stop that process
  (stopping `pnpm` alone can leave its `next-server` child running). A `.next/dev/lock` left by a
  server that has exited is ignored on Linux and macOS.

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
│   ├── admin/                 # Overview, Approval queue, Users & access, Branches, Roles &
│   │                            # permissions, Settings, Business date, and Audit trail pages
│   │   ├── layout.tsx           # Redirects a platform context to /platform-admin
│   │   ├── page.tsx             # Overview: business date, pending approvals, operational readiness
│   │   │                          # and recent activity, each card in its own Suspense boundary
│   │   ├── approvals/           # Approval queue: User onboarding and Branch activation tabs
│   │   │                          # ((queue)/), and the user and branch approval pages with the
│   │   │                          # decision bar (users/[userId]/, branches/[branchId]/)
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
│   │                              # filters), the Invite user wizard (new/), and the record
│   │                              # ([userId]/: hero membership lifecycle; Overview, Roles &
│   │                              # access, Branch assignments and Audit tabs)
│   ├── platform-admin/         # Platform workspace, gated to the platform organisation's context
│   │   ├── layout.tsx           # Redirects tenant contexts away; requires platform-admin module
│   │   ├── tenants/             # SACCO institutions: directory (search, status/country/created
│   │   │                          # filters, sortable headers), create wizard (new/), the record
│   │   │                          # ([tenantId]/(record)/: hero lifecycle; Overview, Provisioning,
│   │   │                          # Branches and Users tabs), amend ([tenantId]/amend/), and the
│   │   │                          # branch record, branch draft and user record (branches/
│   │   │                          # [branchId]/, branches/new/, users/[userId]/ under [tenantId]/)
│   │   └── users/               # Platform users: the platform organisation's members, and their
│   │                              # record ([userId]/)
│   └── profile/                # Account profile: layout.tsx (hero + tabs) and the Overview,
│                                # Contexts, Roles & permissions, Security and Activity tabs
├── api/auth/                 # Better Auth route handlers (`[...all]`, `logout`)
├── api/context/               # Same-origin context discovery/selection routes
├── api/tenant/users/          # Same-origin user search for UserPicker (first page only), and the
│                                # Invite user wizard's email check (invite-check/)
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
│                                # for pickers, the Invite user wizard's rules, schema, email
│                                # check and Server Action, and components
│                                # (modules/administration/users/);
│                                # settings/ holds the settings catalogue's contract, rules,
│                                # service and Server Actions (modules/administration/settings/);
│                                # approvals/ holds the approval queue's contract, rules, copy,
│                                # control checks, bell arithmetic, service, guards, decision
│                                # actions and components (modules/administration/approvals/);
│                                # overview/ holds the overview's readiness rules, card rules, reads
│                                # and cards (modules/administration/overview/)
├── platform-administration/   # Platform module + navigation; tenants/ holds the institution
│                                # contract, directory query, lifecycle rules, service, Server
│                                # Actions, and components (modules/platform-administration/tenants/);
│                                # branches/, users/ and overview/ hold an institution's branch and
│                                # user reads, the global account actions and rules, and the
│                                # overview's counts (layer 17)
└── profile/                   # Account profile: profile-rules, the cached profile-service, and
                                 # the tab components (modules/profile/components/)
components/
├── auth/                     # Keycloak sign-in button, login status alert
├── branding/                  # FinaxisLogo, ProductFeature
├── context/                    # Shared organisation/branch selection: ContextSelectionPage,
│                                # ContextSelectionForm, useContextSelection, context-api,
│                                # PaginationControls
├── data-display/               # Reusable list and record building blocks: ListToolbar
│                                # (search/select/datetime, plus extra controls as children, e.g.
│                                # the audit trail's actor picker), TablePaginationBar,
│                                # StatusChip, DescriptionList, TruncatedText, EmptyState,
│                                # ErrorState, useListNavigation; the record kit (layer 07b)
│                                # RecordHero, RecordTabs (link tabs as nested routes),
│                                # CopyIdButton, ForbiddenState,
│                                # ConfirmDialog; SectionCard and ReasonDialog (07);
│                                # AssignmentDrawer (08); focusRecordTitle (09); WizardForm and
│                                # its Stepper theme (16); KpiTile (17)
├── navigation/                 # next/link client re-export (Next.js 16 RSC boundary workaround)
├── providers/                  # AppProviders (ThemeProvider/CssBaseline), ThemeModeToggle, ToastProvider
└── shell/                      # AppShell, header, drawer, context switcher dialog, app switcher,
                                 # user menu, workspace navigation, tenant-/platform-notifications
                                 # (app-bar slots, spec §8: each bell counts what its caller
                                 # could approve, from the platform's count routes, BG-22) and
                                 # NotificationsMenu
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
  sign-in still picks a single-branch member's one branch, and the context dialog then offers them
  All branches too (it clears the branch with `select-branch` `{"branch_id": null}`, BG-03);
  the header and app shell footer render `branch?.name ?? 'All branches'` for that nullable-branch
  context (AGENTS.md), and the profile page renders the same nullable selected branch as "All
  branches (institution level)".
- The app bar's context button (`components/shell/context-switcher-dialog.tsx`) re-runs the same
  organisation/branch selection in a dialog, so a signed-in user can switch organisation or branch,
  or drop to All branches, at any time. A same-organisation branch switch refreshes in place; an
  organisation change also navigates to that organisation's workspace (`/admin` or
  `/platform-admin`). Picking an organisation, the current one included, always re-POSTs
  select-organisation, because the context cookie is shared across tabs and may no longer match
  what this tab shows; that POST resets the branch, so closing the dialog at the branch step lands
  at All branches, or at the one branch it pinned. Choosing All branches always clears the branch.
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
- Administration ships the Overview, Approval queue, Users & access, Branches, Roles & permissions,
  Settings, Business date, and Audit trail pages.
- The Overview (`/admin`, `modules/administration/overview/`) shows four cards, each reading on its
  own behind its own Suspense boundary and each only to a holder who can read or decide it:
  Business date (the date and its status), Pending approvals (the queue's tab counts with a link to
  each tab, then up to five requests, users before branches, each newest first with Review), Operational
  readiness (five items, each Ready, Needs attention, Can't be checked or Couldn't be checked, each
  linking to the page where it is dealt with when the holder can open that page, under one teal
  bar for the share ready) and Recent activity (the latest audit events, up to five, each opening
  in the audit trail). A failed read shows in its own card, with its reference; when no card
  applies, one note under the heading says so. Known limits:
  - Readiness is five fixed rules over live reads (spec §10.8), not the platform's
    close-of-business readiness check, which the UI doesn't read yet (`docs/backend-gaps.md`
    BG-21); its counts are `size=1` reads (BG-15).
  - Institution profile is ready while the institution is active and its settings read: an unset
    `default_timezone` isn't missing (a new branch takes the institution's zone) and
    `base_currency` always reads the institution's currency (BG-04, BG-12).
  - People needs two active members, so someone other than the requester can approve. It doesn't
    count the platform's onboarding checker or the institution's maker-checker switches (BG-02).
  - Identities still provisioning are noted apart and never listed as waiting (BG-11): the users
    preview reads past them (one read of at most 100), so it lists up to five requests waiting for
    a decision, and the queue holds the rest.
- The Approval queue (`/admin/approvals`, `modules/administration/approvals/`) lists memberships
  pending approval (User onboarding) and branches pending activation (Branch activation), each
  tab paged in the URL and counted in its label, and opens a page per request with who asked and
  when, the requested access (a user's) or the branch, control checks and a decision bar. The app
  bar's bell counts the approvals the caller could decide, from the platform's count route
  (`GET /tenant/approvals/pending-count`, BG-22): it leaves out the caller's own requests while
  maker-checker is on, and a kind they can't approve tenant-wide; its user count is capped by the
  User onboarding tab's, so it never counts an identity still provisioning unless the caller has a
  request of their own pending. Known limits:
  - A pending branch can be returned for changes (or withdrawn by its maker) beside Activate; a
    returned draft is resubmitted from its record. Approve takes an optional remark. There is no
    branch rejection, and still no approval-request model (`docs/backend-gaps.md` BG-01).
  - User onboarding's "Newest first" is the users endpoint's own order, by when each account was
    created (BG-09): an invitation that reused an existing account sorts by that account's age.
  - The maker comes from the record (`created_by`, `submitted_by`), so naming it needs no
    `audit.view` (BG-08). Approve or Activate is disabled for its maker only while the institution's
    maker-checker switch is known to be on: with it off they stay enabled under a warning that the
    approval is recorded as a high-severity event, and without `settings.view` (or when the read
    fails) they stay enabled and the platform's named refusal explains a refusal (`makerGate`,
    `readMakerCheckerSwitch`). Who edited a branch isn't exposed, so that refusal is explained only
    after it comes.
  - Each decision re-reads its subject and refuses before any write when it is no longer waiting
    (decided, or approved into identity provisioning), except that each lets its own end state
    through (an active or provisioning membership for Approve, an active branch for Activate, a
    revoked membership for Reject & revoke): the backend replays a same-key retry whose first
    response was lost, and refuses anyone else's, which reads as 'changed' for Approve and
    Activate and as Reject & revoke's own failure ('It may already be revoked') for Reject &
    revoke. Approve also refuses a
    blocked account (suspended, locked, deactivating, deactivated or archived). Neither refuses its
    maker before the write: the platform
    decides that. Reject & revoke has no maker check and doesn't refuse a blocked account, so a
    blocked account can still be rejected, and so can your own invitation.
  - An institution with a single administrator can't approve its own invitees or activate the
    branches it drafted while maker-checker is on: another administrator must, or the institution
    switches maker-checker off in Settings. The platform also lets a platform checker act during
    onboarding, which the UI doesn't offer yet (BG-02).
  - A user whose identity is still provisioning was already approved: the queue marks them and
    offers no decision (BG-11). Missing prerequisites (a role, a branch) are explained after the
    platform refuses (BG-07).
  - A tenant-wide `branch.approve` activates whichever branch is selected (BG-03). A pending
    branch grants no branch-scoped permission (platform #242), so the queue, the bell and the
    approval page are for tenant-wide holders only. The queue gates on `branch.approve`, which
    replaced the deprecated `branch.activate` (V21).
  - The requested roles show one page of 100 and say so when there are more; branch assignments
    come from the bounded scan (BG-09). The bell has no push updates (BG-22).
- Business date (`/admin/business-date`, `modules/administration/business-date/`) reads
  `GET /tenant/business-date` and `GET /tenant/business-date/history` and renders the current date,
  status, and a paginated history table, plus an app-bar chip (spec §8) linking back to the page.
  Every mutation (start/complete close of business, reopen, advance) is a Server Action behind a
  shared `ReasonDialog`, gated on its own permission code and `business_date.view`
  (`docs/backend-gaps.md` BG-31), and a 409 lock-timeout response surfaces as a retryable "another
  change is in progress" error without losing the request's idempotency key. Known limits:
  - No close-of-business readiness checks (the prototype's checklist) — the platform exposes them
    now, but the page doesn't read them yet (`docs/backend-gaps.md` BG-21).
  - Advancing the date has no upper bound beyond the new date being later than the current
    business date (days can be skipped); the prototype's calendar picker and reason-length
    affordances are a later visual pass.
- The Audit trail (`/admin/audit`, `modules/administration/audit/`) reads
  `GET /tenant/audit-events` and `GET /tenant/audit-events/{id}` and renders them with pagination,
  a detail drawer (before/after JSON, actor/entity/branch facts), and removable actor/entity chips
  (`?actorId=`/`?entityId=`, the latter reachable only via a hand-edited or shared link today).
  Known limits:
  - Only structured filters exist (entity type, entity, action, actor, date range) — no
    free-text, outcome, severity, branch, or subject filter yet, although the platform now has
    them (`docs/backend-gaps.md` BG-16).
  - An actor is filtered by picking a user in the Actor search (the first 10 matches; it needs
    `user.view`) or by clicking their name on a visible row. The picker (`AuditActorPicker`) takes
    the applied `actorId`, so its search starts over, empty, when the filter changes, and it
    refocuses its input after its own pick lands (never for a filter change it did not make).
  - Actor and entity names are resolved only for the IDs on the current page (deduplicated,
    bounded lookups); an actor or entity not resolvable falls back to their id.
  - The branch lookup used to label rows is bounded to the first 500 branches in the tenant.
  - The Branch column shows each row's branch: on rows recorded before the platform's fix, the
    _request's_ selected context, not necessarily the branch the action was performed on; newer
    rows carry the branch acted on (wire contract §E.4, `docs/backend-gaps.md` BG-16).
    Relabelling this in the UI is left to a later visual pass.
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
  creates a draft, and drives the lifecycle (submit, discard, activate, withdraw or return,
  suspend, reactivate, close) and user assignments (assign/revoke) as Server Actions behind
  `ReasonDialog`/`ConfirmDialog`/`AssignmentDrawer`. The record page (`RecordHero` + `RecordTabs`) renders Overview, Users, and
  Audit tabs. A draft or active branch is edited on `/admin/branches/{id}/edit` (the create form's
  fields with the code and type fixed; only changed fields are sent), and both create forms take
  an optional address (`docs/backend-gaps.md` BG-13). Known limits:
  - The platform has no branch edit route, so the platform workspace shows the address read-only,
    and list items carry no address (BG-13).
  - Activate is disabled for the branch's creator (`created_by`) only while maker-checker for
    branch creation is known to be on (`docs/backend-gaps.md` BG-08); the tenant route doesn't
    refuse its submitter, and an editor's refusal is explained after it comes.
  - A selected branch pins nothing (`docs/backend-gaps.md` BG-03): a tenant-wide holder reads and
    acts on any branch, and a branch-scoped one gets the Forbidden state for a branch its grant
    doesn't cover. An action passes the route's own gate in the selected context and the target
    check at the branch: a role held at two ACTIVE branches acts on either while one of them is
    selected, and on neither at All branches. The directory lists only the branches a
    branch-scoped `branch.view` covers, and says so.
  - Withdraw (the branch's creator or latest submitter) and Return for changes (anyone else) are
    one platform route, told apart by the caller; a draft with a reason shows "Sent back:
    <reason>", since the record can't tell a withdrawal from a return. Like Submit and Activate,
    they and Discard act on a pending or draft branch only through a tenant-wide grant; Discard is
    never offered for the head office, and a discarded draft's code stays taken
    (`docs/backend-gaps.md` BG-01).
  - The directory's Type filter offers only the two platform types (`HEAD_OFFICE`, `OPERATIONS`);
    a tenant-defined type filters only through a hand-edited `?type=` URL.
  - The toolbar search commits on Enter or blur, not as you type.
  - The Users tab resolves each visible assignment's user name with its own read, since the
    contract's assignment rows carry no name; the platform's rows now do (`docs/backend-gaps.md`
    BG-09).
- Roles & permissions (`/admin/roles`, `modules/administration/roles/`) lists roles from
  `GET /tenant/roles`: code/name search, status and system/custom filters, and sortable
  Role/Code/Status headers. It creates and edits custom roles and activates or deactivates them.
  It grants permissions from the catalogue (search, risk filter, grouped by module, several per
  submit) and removes them after a confirmation. It also assigns or revokes the role
  institution-wide or at one branch. The record page renders Overview, Permissions, Assignments,
  and Audit tabs. Known limits:
  - The directory shows no description or created date, which role summaries don't carry
    (`docs/backend-gaps.md` BG-09), and no counts, which they now do (BG-15). Its default order
    is newest first.
  - The toolbar search commits on Enter or blur, not as you type.
  - Backend `validation_failed` violations aren't mapped onto form fields; the forms apply the same
    rules client-side (`docs/backend-gaps.md` BG-09).
  - System roles are immutable (the backend answers 409), so their edit, status, and permission
    controls are hidden. They can still be assigned.
  - A grant submit carries up to 25 permissions. Each is its own write, with an idempotency key
    derived from the drawer's key, so a partial failure shows what landed and a retry replays
    it.
  - The catalogue (86 codes) and a role's granted set are each one bounded read of 100.
  - A mutation needs the views the platform pairs with it (`auth/permission-views.ts`, BG-31). The
    grant drawer adds them ("Also grants …") and posts them first, Remove is disabled on a view a
    granted mutation needs ("Needed by …"), and platform-scope codes aren't offered.
  - Below the tenant administrator, nobody adds to their own access (platform #342): on a role you
    hold, Grant permissions and Activate show disabled with the reason, the Assign role search and
    a branch's Assign user search leave you out, and the grant drawer never offers
    `user.assign_self`. The user record does the
    same for Assign role and Assign branch on your own record.
  - "Active assignments" counts assignments, not distinct users (BG-15).
  - A branch-scoped assignment needs the user's existing assignment at that branch, and a branch
    context offers only its own branch.
  - Assigning is offered only for ACTIVE roles. Administrators can archive a custom role once it
    has no active assignments; archiving is final, keeps the code, and leaves the role out of the
    directory unless Status is Archived. An archived role offers no Edit, status or permission
    changes. There is no delete (BG-27).
  - Clearing the description removes it (BG-34).
  - The Audit tab shows the role's own changes. Assignment changes are audited per assignment
    (BG-16).
- Settings (`/admin/settings`, `modules/administration/settings/`) reads the catalogue and the
  tenant's stored keys in one bounded read, and files them under the platform's own groups
  (General, Approvals, Business date, Audit) with its labels and descriptions; keys outside the
  catalogue stay in a collapsed "Other stored settings". A holder of `settings.update` (and its
  view) tenant-wide edits the default time zone (an IANA zone) and flips the two maker-checker
  switches and automatic advance, each after a confirmation; turning a maker-checker switch off
  needs a reason, and turning automatic advance on also needs `business_date.advance`, so the
  switch says so instead. Reset to default is offered once a value is stored (`is_default`).
  Base currency (the institution's own currency) and audit retention (the platform's) are
  read-only (`docs/backend-gaps.md` BG-04, BG-12).
- Users & access (`/admin/users`, `modules/administration/users/`) lists the tenant's users
  from `GET /tenant/users` (search, user status and membership status filters; newest first,
  no sort) and opens a record with the membership lifecycle (approve, reject and revoke,
  suspend, reactivate, revoke) and Overview, Roles & access, Branch assignments and Audit tabs.
  The Audit tab offers up to four views: User record, Account, Membership (once the membership
  is found) and Performed by. "Invite user" (`/admin/users/new`) is a four-step wizard
  (Identity, Access, Invitation, Review), open to a holder of `user.invite`, `membership.view` and
  `user.view` institution-wide, and of `user.assign_branch`, `branch_assignment.view`, `role.view`
  and `branch.view`; it posts one invitation, which a different
  administrator must approve, and opens the new user's record (or the directory when the reply has
  no readable id). Known limits:
  - The directory shows only what user summaries carry, and the onboarding state is derived
    from the membership and user statuses (`docs/backend-gaps.md` BG-09, BG-11).
  - A user's membership is found by searching memberships for their email (at most 5 pages of
    100 matches) and matching the user id exactly; their branch assignments come from a scan of
    at most 500 active assignments, marked partial when it stops early (with or without a
    selected branch), and only the selected branch shows while one is selected (BG-09, BG-03).
    Assign branch offers the first 100 active branches (only the selected one while a branch is
    selected). Assign role offers the active roles among the first 500 by name (the role index's
    ceiling) and says so under the Role field when there are more (BG-09).
  - Approve is disabled, with the reason, for the user's inviter (the record's `created_by`)
    while maker-checker for user invitations is known to be on, and for a blocked account, and
    withheld once approval ran; with the switch off it stays enabled under a warning (BG-08).
    Other refusals are explained by their codes (BG-07, BG-08).
    "Provisioning identity" offers no retry or resend, which the platform now has (BG-11).
  - Reject & revoke and Revoke are presented as permanent, and the invite wizard refuses the
    email, though the platform now re-invites a revoked member (BG-28).
    Suspend and Revoke are disabled on your own record (BG-35). Revoking your own branch
    assignment from the Branch assignments tab shows no self warning (layer 08's
    `RevokeAssignmentButton` has no `self` prop, unlike the Roles & access revoke); at the
    selected branch it invalidates your context, and the next request goes to context selection.
  - A branch-scoped role offers only branches the user is assigned to; a partial scan that found
    none says so instead of claiming none. When a capped scan did find one of their branches, the
    One branch choice lists only the branches it found, so others beyond the first 500 may be
    missing and nothing says so (`RoleScopeFields` shows its hint only while no branch is
    offered). Role assignment changes are audited per assignment and branch assignment changes on
    the branch, so the Audit tab, which doesn't use the platform's `subject_user_id` filter yet,
    can't show them (BG-16).
  - A count or list that couldn't be read says so rather than vanishing or reading as none: the
    Overview's role and branch counts show `Couldn't be loaded` (with the request reference) and
    leave a row out only when you may not read it; a capped scan that found nothing reads
    `None found (partial)`; the Branch assignments empty state names what could not be seen (a
    selected branch, a capped scan); and an empty role index (a failed read) reads "Roles couldn't
    be loaded", not "no active roles".
  - No phone, member number, last activity, MFA or profile edit. The platform now has the member
    number, a membership edit and, in the platform context only, the phone and last sign-in
    (BG-17).
  - The toolbar search commits on Enter or blur, and backend `validation_failed` violations
    aren't mapped onto form fields (BG-09).
  - The invite wizard offers the first 100 active roles and the first 100 active branches by
    name, and says so when there are more. Its Identity step checks the email against this
    institution's users (at most 500 search matches are read; any membership, a revoked one
    included, although the platform now re-invites a revoked member, BG-28; past the ceiling the
    platform's own refusal is the backstop); a 403 from that check asks for a reload (a stale
    context, or a branch-scoped `user.view`, BG-33). The invitation itself is posted first, and a
    taken email, or a username a member here holds, is named only after that fails, so a retry
    with the same idempotency key replays; the naming keys on a 500, and the platform now answers
    409 `conflict`, so a generic error shows instead (BG-07). An account in another institution
    can't be seen: its email is reused with its own name, username and phone, which the Review
    step says, and a username it holds is refused (a 409 since the platform's fix).
  - The Invitation step starts from the contract's flag defaults (identity-provider invitation on,
    application invitation off), and either can be changed; whether the emails go out depends on
    the platform (BG-25). The phone can't be viewed afterwards in this workspace (BG-17).
    Nothing is kept across a reload.
- The Platform Administration workspace (`/platform-admin`, reachable only when the selected
  context's organisation is the platform organisation) manages SACCO institutions through
  `modules/platform-administration/tenants/`: the directory, the create-draft wizard, amend, the
  record's lifecycle (submit, approve, return for changes, reject, suspend, reactivate,
  deprovision) and bootstrap retry. Times show in UTC.
  - The reserved platform organisation is hidden from the directory and its record URL shows the
    not-found page (the layout's `notFound()` answers HTTP 200). The platform now leaves it out of
    the list itself, but the count still subtracts it, so an unfiltered count reads one low
    (`docs/backend-gaps.md` BG-29). One check, `isInstitutionId` (a UUID that is not the
    platform organisation, in any letter case), guards the record and every route under it (its
    four tabs, amend, and the branch and user records and the branch draft), and every Server
    Action that takes an institution id.
  - The create is posted first, and only after a 500 does one lookup (one page of 100 matches)
    name a duplicate tenant code; the platform now answers a duplicate with 409 `conflict`, so the
    code isn't named (BG-07). A retry with the same idempotency key replays.
  - Approve, Return for changes and Reject are disabled, with the reason, for the request's
    `requested_by` and `submitted_by`, which the Overview names; no institution switch relaxes the
    platform's own checker. Someone who amended the draft is refused an approval or a rejection by
    the platform, by name, but may return it (BG-08).
  - Return for changes sends a pending request back to draft with a required reason, which its
    Overview shows until it is submitted again (BG-01). Amend opens pre-filled from the draft (the
    legal name, registration number and first administrator, which the Overview also shows) and
    sends only what changed, plus an optional business date (BG-14). There are no Settings or
    Audit tabs, though the platform now has both routes (BG-12, BG-06).
  - The toolbar search commits on Enter or blur, not as you type.
  - The record's Branches and Users tabs list an institution's branches and users; a branch record
    is read-only (its address shown, no edit, BG-13), and "Create branch draft" is offered for an
    active institution with a warning that the platform refuses it unless you are also a member
    there, which it no longer does (BG-18).
  - A user's record (an institution's, or a platform user's) suspends, reactivates or deactivates
    their sign-in account on the whole platform. Deactivate asks for the username typed back and
    can't be undone; your own account can't be suspended or deactivated (BG-35).
  - Platform users are the platform organisation's members: the UI doesn't use the platform's
    cross-institution user directory yet (BG-10).
  - The overview counts institutions by lifecycle (subtracting the platform organisation, which
    the platform already leaves out, so the active count reads one low, BG-29)
    and platform operators, one read each (`size=1`, or the total of a five-row preview, BG-15),
    and lists up to five institutions pending approval and five drafts. The bell counts the
    institutions pending approval that the operator could approve, never one they requested or
    submitted (`GET /platform/approvals/pending-count`, BG-22).
- Legal/support links (`/legal/terms`, `/legal/privacy`, `mailto:support@finaxis.io`) and
  `/forgot-password` are placeholders; the first three routes resolve to the app's `not-found`
  page until real content exists.
- The Finaxis mark (`FinaxisLogo`, `app/icon.tsx`) is a temporary geometric placeholder pending
  the official logo asset.

## Next recommended implementation steps

1. Add Keycloak claim mappers and enforce authorization/permissions server-side, instead of
   treating UI-shown roles as informational only.
2. Replace the temporary `FinaxisLogo` mark with the official brand asset.
3. Expand the theme's component defaults only as real screens demand them.
