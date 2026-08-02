# Platform Administration Read Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a server-authorized, read-only platform administration console and refresh the profile page while preserving the documented Stage 2 write scope.

**Architecture:** Add a server-only platform administration service over the existing `backendApi`, typed platform-context guards, and a separate `/platform-admin` route tree. Server pages fetch and sanitize DTOs; client components are limited to interactive filters, navigation, tables, and responsive presentation. The existing tenant administration module remains separate.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, MUI v9, Vitest, Testing Library, existing Better Auth/backend API adapter, URL query parameters for pagination and filters.

## Global Constraints

- Stage 1 is read-only; no mutation endpoint may be invoked by Stage 1 pages.
- All authenticated pages validate the session server-side with `getAuthenticatedUser` / the authenticated layout.
- Platform access is allowed only under the reserved platform organisation context; navigation visibility is not the authorization boundary.
- Never expose Keycloak access, refresh, or ID tokens to Client Components or browser-visible state.
- The application context stays a typed value; profile and shell UI use only sanitized `FinaxisUser` data.
- MUI owns component visuals; Tailwind is layout-only and no additional UI framework or global state library is allowed.
- Paginate every list endpoint and preserve filters/page state in the URL.
- Do not use `any`, TypeScript suppressions, wildcard origins, or fabricated aggregate metrics.
- Use existing Finaxis theme tokens, accessible focus states, labelled controls, reduced-motion-safe interactions, and responsive layouts.
- Run `pnpm check` after implementation changes, `pnpm test:e2e` for rendered UI changes, and `pnpm build` before handoff.

---

## File Map

### Configuration and authorization

- Modify: `config/env.server.ts` — validate the reserved platform organisation configuration.
- Modify: `.env.example` and relevant local environment documentation — document the non-secret platform organisation ID.
- Modify: `config/application-context.ts` — add typed module/context helpers without using the old fixture as authorization.
- Modify: `auth/context-service.ts` — derive the selected module from the resolved organisation and expose a platform-context predicate.
- Test: `auth/context-service.test.ts` and `config/env.server.test.ts` — platform/tenant context behavior and configuration validation.

### Platform API boundary

- Create: `modules/platform-administration/platform-administration.types.ts` — frontend DTOs and query/filter types for the OpenAPI read responses.
- Create: `modules/platform-administration/platform-administration-service.ts` — server-only paginated read functions over `backendApi`.
- Create: `modules/platform-administration/platform-administration-queries.ts` — validated URL query parsing and encoded query construction.
- Test: `modules/platform-administration/platform-administration-service.test.ts` and `modules/platform-administration/platform-administration-queries.test.ts`.

### Shared platform UI

- Create: `modules/platform-administration/platform-administration-module.ts` — module metadata.
- Create: `modules/platform-administration/platform-administration-navigation.ts` — platform navigation items.
- Create: `modules/platform-administration/components/platform-page-shell.tsx` — shared heading/context shell.
- Create: `modules/platform-administration/components/platform-status-chip.tsx` — accessible status presentation.
- Create: `modules/platform-administration/components/platform-data-table.tsx` — responsive read-only table surface.
- Create: `modules/platform-administration/components/platform-pagination.tsx` — URL-preserving pagination.
- Create: `modules/platform-administration/components/platform-filter-bar.tsx` — labelled resource filters.
- Test: component tests beside each shared component.

### Routes

- Create: `app/(authenticated)/platform-admin/layout.tsx` — platform route guard and platform workspace navigation.
- Create: `app/(authenticated)/platform-admin/page.tsx` — operations overview.
- Create: `app/(authenticated)/platform-admin/tenants/page.tsx` — tenant directory.
- Create: `app/(authenticated)/platform-admin/tenants/[tenantId]/page.tsx` — tenant detail.
- Create: `app/(authenticated)/platform-admin/tenants/[tenantId]/users/page.tsx` — tenant users.
- Create: `app/(authenticated)/platform-admin/tenants/[tenantId]/users/[userId]/page.tsx` — tenant user detail.
- Create: `app/(authenticated)/platform-admin/tenants/[tenantId]/branches/page.tsx` — tenant branches.
- Create: `app/(authenticated)/platform-admin/tenants/[tenantId]/branches/[branchId]/page.tsx` — branch detail.
- Create: `app/(authenticated)/platform-admin/audit/page.tsx` — audit event directory.
- Create: `app/(authenticated)/platform-admin/audit/[eventId]/page.tsx` — audit event detail.
- Test: route/page tests for guards, URL filters, pagination, and backend error states.

### Shell and profile

- Modify: `components/shell/shell.constants.ts` and `components/shell/app-switcher.tsx` — show the platform module only for the active platform context.
- Modify: `components/shell/workspace-navigation.tsx` — support an explicit accessible navigation label for both workspaces.
- Modify: `components/profile/profile-view.tsx` — implement the approved identity/context/access hierarchy.
- Modify: `components/profile/profile-view.test.tsx` — update UI assertions and accessibility-relevant labels.

### Documentation

- Modify: `README.md` and `AGENTS.md` only if the final architecture changes project conventions or route ownership.
- Existing design/spec: `docs/superpowers/specs/2026-07-26-platform-administration-design.md`.
- Existing design system: `design-system/finaxis-platform-administration/MASTER.md`.

---

## Task 1: Establish typed platform-context authorization

**Files:**

- Modify: `config/env.server.ts`
- Modify: `.env.example`
- Modify: `config/application-context.ts`
- Modify: `auth/context-service.ts`
- Test: `config/env.server.test.ts`, `auth/context-service.test.ts`

**Interfaces:**

- Produces `isPlatformOrganisation(organisationId: string): boolean` and a typed platform module descriptor.
- Produces a resolved `ApplicationContext.module` of `{ id: 'platform-administration', name: 'Platform Administration' }` only for the configured reserved organisation; tenant contexts remain `{ id: 'administration', name: 'Administration' }`.

- [ ] **Step 1: Add the configuration test**

Assert that a valid UUID-shaped platform organisation ID is accepted and that a missing or malformed value fails with a configuration error. Keep the value non-secret and separate from Keycloak credentials.

- [ ] **Step 2: Implement the typed configuration and predicate**

Add `PLATFORM_ORGANISATION_ID` to the server environment schema and implement a single predicate in the context configuration module. Do not compare the identifier directly inside pages or client components.

- [ ] **Step 3: Add context-service tests**

Cover both resolved branches:

```ts
expect(result.context.module.id).toBe('platform-administration');
expect(result.context.module.name).toBe('Platform Administration');
```

and the existing tenant path. Confirm the context token remains passed only to `backendApi`.

- [ ] **Step 4: Run the focused tests**

Run `pnpm vitest run config/env.server.test.ts auth/context-service.test.ts` and expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add config .env.example auth/context-service.ts
git commit -m "feat: identify the platform application context"
```

## Task 2: Build the typed, server-only platform read service

**Files:**

- Create: `modules/platform-administration/platform-administration.types.ts`
- Create: `modules/platform-administration/platform-administration-queries.ts`
- Create: `modules/platform-administration/platform-administration-service.ts`
- Test: `modules/platform-administration/platform-administration-queries.test.ts`
- Test: `modules/platform-administration/platform-administration-service.test.ts`

**Interfaces:**

- `listTenants(headers: Headers, query: TenantListQuery): Promise<ApiPage<TenantSummary>>`
- `getTenant(headers: Headers, tenantId: string): Promise<TenantDetail>`
- `listTenantUsers(headers: Headers, tenantId: string, query: UserListQuery): Promise<ApiPage<TenantUserSummary>>`
- `getTenantUser(headers: Headers, tenantId: string, userId: string): Promise<TenantUserDetail>`
- `listTenantBranches(headers: Headers, tenantId: string, query: BranchListQuery): Promise<ApiPage<BranchDetail>>`
- `getTenantBranch(headers: Headers, tenantId: string, branchId: string): Promise<BranchDetail>`
- `listAuditEvents(headers: Headers, query: AuditListQuery): Promise<ApiPage<AuditEvent>>`
- `getAuditEvent(headers: Headers, eventId: string): Promise<AuditEventDetail>`

- [ ] **Step 1: Write query parser tests**

Test default page/size, bounded size, valid filters, invalid numeric values, and encoded values. A malformed page must be rejected or normalized before a backend call; arbitrary query strings must not be concatenated into URLs.

- [ ] **Step 2: Write service tests against `backendApi.get`**

For each function, assert the exact path and query string, including page, size, sort, and supported filters. Assert UUID syntax validation for route identifiers and that no `post`, `patch`, or mutation method is reachable from this module.

- [ ] **Step 3: Implement DTOs and query construction**

Mirror the live OpenAPI JSON boundary using frontend-safe camelCase DTOs. Keep nullable fields explicit, retain pagination metadata, and use `URLSearchParams` for query encoding.

- [ ] **Step 4: Implement the server-only service**

Add `import 'server-only'`. Route all reads through the existing `backendApi.get` with request headers and the HttpOnly context token obtained through the existing cookie helper. Map backend errors to the existing safe error boundary without returning token data.

- [ ] **Step 5: Run focused service tests**

Run `pnpm vitest run modules/platform-administration/platform-administration-queries.test.ts modules/platform-administration/platform-administration-service.test.ts` and expect all tests to pass.

- [ ] **Step 6: Commit**

```bash
git add modules/platform-administration
git commit -m "feat: add platform administration read service"
```

## Task 3: Add the platform workspace shell and route guard

**Files:**

- Create: `modules/platform-administration/platform-administration-module.ts`
- Create: `modules/platform-administration/platform-administration-navigation.ts`
- Create: `modules/platform-administration/components/platform-page-shell.tsx`
- Create: `modules/platform-administration/components/platform-status-chip.tsx`
- Create: `modules/platform-administration/components/platform-pagination.tsx`
- Modify: `components/shell/workspace-navigation.tsx`
- Create: `app/(authenticated)/platform-admin/layout.tsx`
- Test: shared component tests and `app/(authenticated)/platform-admin/layout.test.tsx`

**Interfaces:**

- `platformAdministrationNavigationItems` contains Overview, Tenants, and Audit Events only for Stage 1.
- `PlatformPageShell` receives a title, description, optional breadcrumbs, and server-safe children.
- The layout checks the resolved context module ID and redirects non-platform contexts to `/admin` or a safe forbidden page.

- [ ] **Step 1: Write navigation and guard tests**

Assert navigation labels, active-link semantics, and that the platform layout does not render platform children for a tenant context. Assert the status component includes text labels in addition to color.

- [ ] **Step 2: Implement module metadata and navigation**

Keep the module separate from `modules/administration`. Do not add Stage 2 write items to the navigation.

- [ ] **Step 3: Implement the guarded layout**

Read the selected server-side context, reject non-platform contexts, and reuse the existing `WorkspaceDrawer`, `MobileNavigationButton`, and MUI layout conventions. Set the navigation aria-label to `Platform Administration`.

- [ ] **Step 4: Implement shared presentation components**

Use theme tokens, accessible status text, responsive layout, and URL-preserving pagination links. Do not create a global client state store.

- [ ] **Step 5: Run focused component tests**

Run the relevant Vitest files and expect all tests to pass.

- [ ] **Step 6: Commit**

```bash
git add app/'(authenticated)'/platform-admin modules/platform-administration/components components/shell/workspace-navigation.tsx
git commit -m "feat: add guarded platform administration workspace"
```

## Task 4: Implement the platform overview and tenant directory

**Files:**

- Create: `app/(authenticated)/platform-admin/page.tsx`
- Create: `app/(authenticated)/platform-admin/tenants/page.tsx`
- Create: `modules/platform-administration/components/tenant-table.tsx`
- Test: `app/(authenticated)/platform-admin/page.test.tsx`
- Test: `app/(authenticated)/platform-admin/tenants/page.test.tsx`

**Interfaces:**

- Pages receive `searchParams: Promise<Record<string, string | string[] | undefined>>` and pass validated query objects to the service.
- The overview must not report complete counts from a partial page; it links to live resources and displays only complete metadata returned by the backend.

- [ ] **Step 1: Write page tests**

Mock the server-only service and assert the overview heading, active platform context, tenant/audit links, tenant table headers, filters, empty state, backend-error state, and pagination links.

- [ ] **Step 2: Implement overview**

Use `PlatformPageShell`, context metadata, live resource links, and explicit “read-only” labeling. Keep the page useful when a list is empty or temporarily unavailable.

- [ ] **Step 3: Implement tenant directory**

Render search/status/country filters through URL parameters, tenant status chips, tenant identity fields, and links to detail pages. Show `totalItems` only when it is supplied by the current complete API page metadata, and never infer a global status distribution from one page.

- [ ] **Step 4: Run focused route tests**

Run `pnpm vitest run 'app/(authenticated)/platform-admin/page.test.tsx' 'app/(authenticated)/platform-admin/tenants/page.test.tsx'` and expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add app/'(authenticated)'/platform-admin/page.tsx app/'(authenticated)'/platform-admin/tenants modules/platform-administration/components/tenant-table.tsx
git commit -m "feat: add platform overview and tenant directory"
```

## Task 5: Implement tenant detail, users, and branches

**Files:**

- Create: `app/(authenticated)/platform-admin/tenants/[tenantId]/page.tsx`
- Create: `app/(authenticated)/platform-admin/tenants/[tenantId]/users/page.tsx`
- Create: `app/(authenticated)/platform-admin/tenants/[tenantId]/users/[userId]/page.tsx`
- Create: `app/(authenticated)/platform-admin/tenants/[tenantId]/branches/page.tsx`
- Create: `app/(authenticated)/platform-admin/tenants/[tenantId]/branches/[branchId]/page.tsx`
- Create: `modules/platform-administration/components/resource-detail-card.tsx`
- Test: corresponding page tests

**Interfaces:**

- Each dynamic route validates UUID syntax before calling the service.
- Related user and branch lists use independent `page` and `size` query values and never fetch all records on the tenant detail page.

- [ ] **Step 1: Write detail/list tests**

Cover valid data, missing identifiers, backend 404/403/error mapping, pagination, filter preservation, and links between tenant, user, and branch pages.

- [ ] **Step 2: Implement tenant detail**

Show tenant identity, lifecycle/bootstrap data, locale settings, timestamps, and read-only links to related resources. Do not render active mutation buttons.

- [ ] **Step 3: Implement tenant users**

Render supported search, user-status, and membership-status filters with paginated rows and detail links.

- [ ] **Step 4: Implement tenant user detail**

Render identity, user status, and membership status without exposing claims or tokens.

- [ ] **Step 5: Implement tenant branches and branch detail**

Render supported branch filters, branch lifecycle metadata, address key/value pairs, parent relationship, and timestamps. Preserve null values as intentional “Not available” states.

- [ ] **Step 6: Run focused tests**

Run the complete platform route test subset and expect all tests to pass.

- [ ] **Step 7: Commit**

```bash
git add app/'(authenticated)'/platform-admin/tenants modules/platform-administration/components/resource-detail-card.tsx
git commit -m "feat: add platform tenant users and branches read views"
```

## Task 6: Implement audit event list and detail

**Files:**

- Create: `app/(authenticated)/platform-admin/audit/page.tsx`
- Create: `app/(authenticated)/platform-admin/audit/[eventId]/page.tsx`
- Create: `modules/platform-administration/components/audit-event-table.tsx`
- Create: `modules/platform-administration/components/json-value-viewer.tsx`
- Test: audit page and component tests

**Interfaces:**

- Audit filters map only to `entity_type`, `entity_id`, `actor_id`, `action`, `occurred_from`, `occurred_to`, `page`, and `size`.
- JSON viewer accepts `string | null` and shows invalid JSON safely as escaped text.

- [ ] **Step 1: Write audit tests**

Assert filter URL construction, pagination, severity/outcome text, actor/entity references, detail links, null handling, and safe rendering for malformed JSON.

- [ ] **Step 2: Implement audit list**

Use a labelled filter bar and dense responsive table. Include a clear read-only/audit-inspection description and no mutation actions.

- [ ] **Step 3: Implement audit detail and JSON viewer**

Present metadata, request/correlation IDs, reason, before/after values, and metadata JSON without using unsafe HTML injection or unescaped raw output.

- [ ] **Step 4: Run focused tests and commit**

```bash
pnpm vitest run app/'(authenticated)'/platform-admin/audit modules/platform-administration/components
git add app/'(authenticated)'/platform-admin/audit modules/platform-administration/components
git commit -m "feat: add platform audit read views"
```

## Task 7: Connect platform module visibility and refresh profile UI

**Files:**

- Modify: `components/shell/shell.constants.ts`
- Modify: `components/shell/app-switcher.tsx`
- Modify: `components/profile/profile-view.tsx`
- Modify: `components/profile/profile-view.test.tsx`
- Test: `components/shell/app-switcher.test.tsx`, `components/shell/app-shell.test.tsx`

**Interfaces:**

- Platform module visibility is driven by the typed application context supplied by the authenticated server layout, not by a client cookie or token.
- `ProfileView` continues to accept only `{ user: FinaxisUser; signedInAt: Date }`.

- [ ] **Step 1: Write visibility/profile tests**

Assert the platform module is absent for tenant context and links to `/platform-admin` for platform context. Assert the profile has one main heading, an active-context summary, accessible branch/permission labels, and the existing sanitized fields.

- [ ] **Step 2: Implement context-aware module presentation**

Pass the context needed by the shell through the existing typed provider or server-derived props. Do not introduce global state or client-readable auth data.

- [ ] **Step 3: Implement the profile hierarchy**

Replace the repetitive card stack with identity, active context, assignments, access, and technical sections using existing theme tokens and responsive MUI layout.

- [ ] **Step 4: Run focused UI tests**

Run `pnpm vitest run components/profile components/shell/app-switcher.test.tsx components/shell/app-shell.test.tsx` and expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add components/profile components/shell
git commit -m "feat: surface platform module and refresh profile"
```

## Task 8: Full verification and documentation handoff

**Files:**

- Modify: `README.md` only if the final route/module architecture needs user-facing documentation.
- Modify: `AGENTS.md` only if project conventions changed.
- Test: all existing tests plus browser verification artifacts as needed.

- [ ] **Step 1: Run static and unit checks**

Run:

```bash
pnpm check
```

Expected: formatting, lint, typecheck, and all Vitest tests pass.

- [ ] **Step 2: Run the production build**

Run `pnpm build`. Expected: successful Next.js production build with all platform routes collected.

- [ ] **Step 3: Run rendered UI verification**

Run `pnpm test:e2e`. If the standard browser binary remains unavailable, record the exact environment blocker and verify the critical flow using the available full Chrome executable, covering platform-context access, tenant directory, tenant detail, audit detail, profile, responsive widths, and a tenant-context denial.

- [ ] **Step 4: Review security and scope boundaries**

Search Stage 1 code for `post`, `patch`, `put`, `delete`, access-token names, and raw session/claims usage. Confirm no Stage 2 mutation is reachable from Stage 1 pages and no token enters client props or rendered markup.

- [ ] **Step 5: Commit documentation and verification changes**

```bash
git add README.md AGENTS.md
git commit -m "docs: document platform administration read stage"
```

Only include those files if they changed; do not create an empty commit.

## Self-review checklist

- Spec coverage: platform guard (Task 1/3), read API contract (Task 2), overview/tenant/users/branches/audit (Tasks 4–6), profile and module visibility (Task 7), verification (Task 8), and Stage 2 preservation in the approved spec.
- Placeholder scan: no `TBD`, `TODO`, “similar to Task”, or unspecified edge-case instructions.
- Type consistency: service method names and query DTOs are defined in Task 2 and consumed by route tasks; `FinaxisUser` remains the profile contract.
- Known backend limitation preserved: no global platform-user read page is planned until the API exposes one.
