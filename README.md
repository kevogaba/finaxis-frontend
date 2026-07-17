# Finaxis Web

The production frontend foundation for **Finaxis**, a modern SACCO core banking and
enterprise financial platform.

This repository establishes the project's frontend foundation — tooling, theming, and one
representative login experience — so future feature work has a clean, consistent base to
build on. It intentionally does **not** implement authentication, dashboards, domain modules,
API integrations, or business workflows.

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

| Script                         | Purpose                                          |
| ------------------------------ | ------------------------------------------------ |
| `pnpm dev`                     | Start the Turbopack dev server                   |
| `pnpm build`                   | Production build                                 |
| `pnpm start`                   | Serve the production build                       |
| `pnpm lint` / `lint:fix`       | ESLint (flat config), zero warnings allowed      |
| `pnpm typecheck`               | `tsc --noEmit`                                   |
| `pnpm format` / `format:check` | Prettier                                         |
| `pnpm test` / `test:run`       | Vitest (watch / single run)                      |
| `pnpm test:coverage`           | Vitest with V8 coverage                          |
| `pnpm test:e2e`                | Playwright end-to-end tests                      |
| `pnpm test:e2e:ui`             | Playwright UI mode                               |
| `pnpm check`                   | format:check + lint + typecheck + unit tests     |
| `pnpm verify`                  | `check` + coverage + build (full pre-merge gate) |

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
  the code they cover (e.g. `components/auth/login-form.test.tsx`) and query the DOM by role and
  accessible name rather than implementation details.
- **End-to-end**: `pnpm test:e2e`. Playwright starts the dev server automatically, covers the
  redirect, form validation, password visibility, mock submission, keyboard navigation, both
  color schemes, both viewport classes, and an axe accessibility scan. Chromium is the required
  project; install the browser once with `pnpm exec playwright install chromium`.

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
├── (auth)/login/page.tsx   # Split-screen login page
├── globals.css             # CSS layers, Tailwind import, MUI/Tailwind bridge, restrained defaults
├── layout.tsx               # Root layout: fonts, AppRouterCacheProvider, AppProviders
├── loading.tsx / not-found.tsx
└── icon.tsx                 # Generated favicon (temporary Finaxis mark)
components/
├── auth/                    # Login form, its Zod schema, its test, mock auth
├── branding/                # FinaxisLogo, ProductFeature
├── navigation/               # next/link client re-export (Next.js 16 RSC boundary workaround)
└── providers/                # AppProviders (ThemeProvider/CssBaseline), ThemeModeToggle
theme/
├── create-finaxis-theme.ts  # Single theme, light/dark colorSchemes, component defaults
├── theme.types.ts            # Palette module augmentation (brand.* tokens)
└── index.ts                  # Public exports
test/                         # Vitest setup + renderWithProviders
e2e/                           # Playwright specs
.github/workflows/ci.yml
```

## Mock authentication

The login form does **not** call any real authentication service:

- Submission runs through `components/auth/mock-authenticate.ts`, a small isolated async
  function with a short artificial delay, so it can be swapped for a real identity provider
  (the plan is [Better Auth](https://better-auth.com) fronting Keycloak) without touching the
  form itself.
- A valid-looking submission shows a success alert stating the UI foundation is ready but
  authentication isn't connected yet.
- The demo identifier `locked@finaxis.test` returns a generic "couldn't sign you in" error, to
  exercise the failure path without implying real accounts exist.
- Passwords are never persisted, logged, or sent over the network.

## Current limitations

- No authentication, session, or identity-provider integration.
- No dashboard, organization selection, or domain modules.
- No API client or data layer.
- Legal/support links (`/legal/terms`, `/legal/privacy`, `mailto:support@finaxis.io`) and
  `/forgot-password` are placeholders; the first three routes resolve to the app's `not-found`
  page until real content exists.
- The Finaxis mark (`FinaxisLogo`, `app/icon.tsx`) is a temporary geometric placeholder pending
  the official logo asset.

## Next recommended implementation steps

1. Wire real authentication via Better Auth against Keycloak, replacing
   `mock-authenticate.ts` behind the same `LoginForm` interface.
2. Add session/middleware (`proxy.ts` in Next.js 16) once auth exists.
3. Introduce the dashboard shell and organization selection.
4. Replace the temporary `FinaxisLogo` mark with the official brand asset.
5. Expand the theme's component defaults only as real screens demand them.
