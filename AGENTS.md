<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Finaxis frontend rules

- Run `pnpm check` after any implementation change; run `pnpm test:e2e` when the change touches
  rendered UI. Do not consider a change done until both are clean.
- Do not bypass TypeScript or ESLint errors (no `@ts-ignore`, `@ts-nocheck`, unsafe `any`, or
  disabling rules to silence a warning). Fix the underlying issue.
- Do not add another UI/component framework (Chakra, Ant Design, shadcn/ui, styled-components,
  Bootstrap, etc.) or a global state library. MUI + Tailwind (layout only) is the whole stack.
- Use MUI theme tokens instead of raw colors — add values to `theme/tokens.ts` (and their types to
  `theme/theme.types.ts`, wiring them in `theme/create-finaxis-theme.ts`) rather than hardcoding
  hex/rgba values in components; the contrast gate in `theme/tokens.test.ts` covers new pairs.
- Tailwind is for layout composition only (flex, grid, gap, width/height, positioning,
  visibility). It must never override MUI component internals; MUI owns component visuals,
  typography, and semantic color.
- Server Components are the default. Add `'use client'` only where interaction, browser APIs, or
  MUI hooks (e.g. `useColorScheme`) require it — keep client boundaries as narrow as possible.
- Never pass a function prop (including `sx={(theme) => ...}` callbacks or `component={Link}`)
  from a Server Component into a Client Component — Next.js 16 rejects it. Use plain-object `sx`
  with dotted palette-path strings (e.g. `sx={{ color: 'brand.onNavy' }}`), and route `next/link`
  through `components/navigation/next-link.tsx` when a Server Component needs to pass it as a
  `component` prop.
- Never pass a pre-built React element from a Server Component into an MUI prop that MUI gates
  with `isValidElement`/`cloneElement` (e.g. Chip `icon`/`avatar`/`deleteIcon`). React's Flight
  client can deliver it to SSR as a lazy wrapper, MUI drops it, and hydration fails. Render that
  component in a small `'use client'` file that builds the element itself and takes only primitive
  props (see `modules/administration/business-date/components/business-date-chip.tsx`).
- This is Material UI v9: some props renamed since earlier majors (e.g. `Stack`'s
  `alignItems`/`justifyContent`/`flexWrap` and `Checkbox`/`Radio`'s `inputRef`/`inputProps` moved
  to `sx` / `slotProps.input`). Check `node_modules/@mui/material/package.json` version and the
  installed major's migration guide before assuming an older API shape.
- Mutations are Server Actions built on `runServerAction` (`lib/api/action-result.ts`), which calls
  through `apiPost`/`apiPut`/`apiPatch`/`apiDelete` (`lib/api/tenant-api.ts`). Forward the
  idempotency key the form minted when it opened (`ReasonDialog` does this) — never generate one
  per request — so a retry after a failure replays instead of repeating the change. When
  uncontrolled fields (a reason, a date) must survive a failed submit, dispatch the
  `useActionState` action yourself from `onSubmit` inside `startTransition`, never through
  `<form action={fn}>` — React resets every uncontrolled field on every submit outcome via
  `requestFormReset` when the DOM `action` prop drives it (`ReasonDialog`/`ConfirmDialog`). That
  reducer must wrap its call in `try/catch`, call `unstable_rethrow(error)` first so a
  redirect/`notFound()` keeps propagating, and only then return a safe synthesized failure — an
  escaped rejection reaches `app/error.tsx` and loses the dialog's typed input and idempotency key.
- Every tenant-workspace data-listing UI (new lists especially) is server-paginated with state in
  the URL: page sizes come from `lib/api/paging.ts`'s `PAGE_SIZES`, and lists render
  `TablePaginationBar` (`components/data-display/table-pagination-bar.tsx`) plus, where the list
  has filters, `ListToolbar`. Both route every client-side rewrite of a list's URL query params
  through `components/data-display/use-list-navigation.ts`'s `useListNavigation()` — never an
  ad-hoc `new URLSearchParams(...)` plus `router.push`. Never introduce an unpaginated list
  endpoint or view. Two exceptions predate this pattern:
  `components/context/pagination-controls.tsx` (the pre-shell organisation/branch selection
  lists in `/select-context`, which have no URL to hold state) and the platform tenant
  directory's own `modules/platform-administration/components/platform-pagination.tsx`.
- A context-scoped read goes through `lib/api/tenant-api.ts`'s `apiGet(path, schema)`, where
  `schema` is a snake_case zod schema defined in the domain's own `<domain>-contract.ts` (e.g.
  `modules/administration/audit/audit-contract.ts`) that transforms the wire shape to camelCase.
  A page settles the result with `lib/api/load.ts`'s `load()`, which redirects on a 401 (to
  `/login`) and on a stale or missing context (to `/select-context`) and otherwise never throws;
  render its `ErrorState` on the failure branch instead of swallowing it. `lib/api/problem.ts`'s
  `describeProblem` never echoes backend response text back to the UI.
- Maintain accessibility: one `h1` per page, visible focus rings, labelled form fields, errors
  associated with their fields, `prefers-reduced-motion` respected, no serious/critical axe
  violations.
- Update `README.md` (and this file) when the architecture changes — e.g. swapping the mock auth
  module for a real identity provider, or changing the MUI/Tailwind boundary.
- E2E tests run against the standalone fake API in `e2e/fake-api/` — never add backend fixtures to
  app code. Fake-API files run under plain `node`: relative `.mts` imports, `import type` for types,
  erasable TypeScript only (no enums, namespaces, parameter properties). Add only endpoints a layer
  uses, mirroring the contract document exactly (including backend quirks).
- The backend's wire format is snake_case and differs from the published OpenAPI casing; never
  generate a client from the OpenAPI as-is. Follow
  `docs/superpowers/specs/2026-09-25-admin-prototype-parity-api-contract.md`.
- `/auth/*` responses are parsed by the zod schemas in `auth/context-contract.ts` — never trust an
  unparsed backend body.
- `ApplicationContext.branch` is nullable: `null` means All branches (institution level), not "no
  branch selected yet." Render it as `branch?.name ?? 'All branches'`, never assume a branch exists.

## Authentication rules

- All authenticated pages/routes validate the session server-side (`auth.api.getSession` via
  `auth/get-authenticated-user.ts`) — never rely solely on `proxy.ts`'s cookie-presence check.
- Never expose Keycloak access/refresh/ID tokens to Client Components or client-visible state.
- Never disable Better Auth's CSRF or origin checks (`disableCSRFCheck`/`disableOriginCheck`).
- Never use a wildcard trusted origin.
- Never persist auth tokens in local storage or session storage.
- Never accept an arbitrary, unvalidated callback or logout redirect — validate against an
  allowlist (see `auth/build-keycloak-logout-url.ts` and `config/env.server.ts`).
- All new shell/workspace routes use MUI components, per the existing MUI/Tailwind boundary
  rule above.
- The application context (module/organization/branch) stays a typed value
  (`config/application-context.ts`) — never an untyped/`any` blob.
- Profile and shell UI render only the sanitized `FinaxisUser` DTO
  (`auth/map-authenticated-user.ts`), never a raw Better Auth session or Keycloak claims object.
