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

- Node.js `>=24.9.0` (see `.nvmrc` / `.node-version` — 24 is the current LTS line)
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
configs, not hand-rolled rules, chosen for a multi-contributor codebase where the type checker
catching a bug beats a reviewer catching it.

## Testing

- **Unit/component**: `pnpm test:run` (or `pnpm test:coverage` for coverage). Tests live next to
  the code they cover (e.g. `components/auth/continue-with-keycloak-button.test.tsx`) and query
  the DOM by role and accessible name rather than implementation details.
- **End-to-end**: `pnpm test:e2e`. Playwright starts the dev server automatically, covers the
  root redirect, the Keycloak sign-in action, error/expired-session/logged-out status messages,
  keyboard navigation, both color schemes, both viewport classes, and an axe accessibility scan.
  Chromium is the required project; install the browser once with
  `pnpm exec playwright install chromium`. This suite never talks to a real Keycloak.
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

Brand-specific tokens that sit outside MUI's standard palette (the fixed navy brand-panel
background and its on-navy text/border/surface tones) are added via TypeScript module
augmentation in `theme/theme.types.ts` and consumed as ordinary palette paths, e.g.
`sx={{ color: 'brand.onNavy' }}`.

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
│   ├── admin/                 # Users, Branches, Roles & Permissions, Settings, Audit Logs
│   ├── platform-admin/         # Read-only workspace, gated to the platform organisation's context
│   │   ├── layout.tsx           # Redirects tenant contexts away; requires platform-admin module
│   │   ├── tenants/             # Live tenant directory + tenant detail (dynamic route)
│   │   └── audit/               # Live audit event directory
│   └── profile/page.tsx
├── api/auth/                 # Better Auth route handlers (`[...all]`, `logout`)
├── api/context/               # Same-origin context discovery/selection routes
├── globals.css               # CSS layers, Tailwind import, MUI/Tailwind bridge, restrained defaults
├── layout.tsx                 # Root layout: fonts, AppRouterCacheProvider, AppProviders
├── loading.tsx / not-found.tsx
└── icon.tsx                   # Generated favicon (temporary Finaxis mark)
auth/
├── auth.ts / auth-client.ts  # Better Auth server instance + browser client (keycloak() plugin)
├── auth.types.ts
├── get-authenticated-user.ts  # Server-side session validation used by route guards
├── map-authenticated-user.ts  # Raw session/claims -> sanitized `FinaxisUser` DTO
├── context-service.ts        # Server-only backend discovery/selection/profile calls
├── context-cookie.ts          # HttpOnly context token cookie (never sent to the browser)
├── context-browser-dto.ts     # Whitelisted/camelCased context shapes exposed to the browser
├── context-selection-redirect.ts # Builds the `/select-context?next=` redirect from proxy.ts's header
└── build-keycloak-logout-url.ts
config/
├── application-context.ts    # Typed module/organisation/branch context value
└── env.server.ts              # Validated server environment variables
modules/
├── administration/            # Administration module + navigation registration
└── platform-administration/   # Platform module: read-only tenant/audit backend integration
components/
├── auth/                     # Keycloak sign-in button, login status alert
├── branding/                  # FinaxisLogo, ProductFeature
├── context/                    # ContextSelectionPage (organisation/branch picker)
├── navigation/                 # next/link client re-export (Next.js 16 RSC boundary workaround)
├── profile/                   # Profile view
├── providers/                  # AppProviders (ThemeProvider/CssBaseline), ThemeModeToggle
└── shell/                      # AppShell, header, drawer, user menu, workspace navigation
theme/
├── create-finaxis-theme.ts   # Single theme, light/dark colorSchemes, component defaults
├── theme.types.ts              # Palette module augmentation (brand.* tokens)
└── index.ts                    # Public exports
proxy.ts                        # Optimistic cookie-presence redirect (not a trust boundary);
                                 # forwards the requested pathname so context selection can return
                                 # the user to it afterwards
test/                           # Vitest setup + renderWithProviders
e2e/                             # Playwright specs
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
- The profile page renders the backend `/api/v1/auth/me` result for the selected context, including
  organisation, selected branch, assigned branches, roles, and permissions.
- Authorization/permission enforcement remains a backend concern; UI-displayed roles and
  permissions are informational and are not a trust boundary.
- Administration's Users/Branches/Roles & Permissions/Settings/Audit Logs pages are polished
  placeholders, not connected to real data.
- The Platform Administration workspace (`/platform-admin`, reachable only when the selected
  context's organisation is the platform organisation) reads live, paginated data from the
  backend — tenant directory, tenant detail, and audit events — through
  `modules/platform-administration/platform-administration-service.ts`. It is read-only: no
  create/update/delete actions are exposed in this stage.
- Beyond context discovery/selection, profile retrieval, and the platform read endpoints above,
  other domain API modules (e.g. Administration's branches/users/roles) are not connected yet.
- Legal/support links (`/legal/terms`, `/legal/privacy`, `mailto:support@finaxis.io`) and
  `/forgot-password` are placeholders; the first three routes resolve to the app's `not-found`
  page until real content exists.
- The Finaxis mark (`FinaxisLogo`, `app/icon.tsx`) is a temporary geometric placeholder pending
  the official logo asset.

## Next recommended implementation steps

1. Add Keycloak claim mappers and enforce authorization/permissions server-side, instead of
   treating UI-shown roles as informational only.
2. Connect Administration's Users/Branches/Roles & Permissions/Settings/Audit Logs pages to
   real data.
3. Extend Platform Administration's live reads to branches and users, and design a write-action
   model (with audit logging) before enabling any mutations there.
4. Replace the temporary `FinaxisLogo` mark with the official brand asset.
5. Expand the theme's component defaults only as real screens demand them.
