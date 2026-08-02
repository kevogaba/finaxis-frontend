# Platform Administration Design

**Date:** 2026-07-26  
**Status:** Approved  
**Scope:** Platform-level administration, read stage first; profile UI refresh

## Objective

Introduce a platform administration module before tenant-level administration. The module must allow an authorized platform operator to inspect tenants, tenant users, tenant branches, and audit events through the existing authenticated frontend without exposing Keycloak tokens to the browser.

The delivery is deliberately staged:

1. Stage 1 is read-only and establishes the platform operations console.
2. Later stages add write workflows only after the read contracts and navigation are proven.

## Decisions

### Platform access model

Platform Administration is available only when the selected application context uses the reserved platform organisation. The selected context and context token remain authoritative; a cookie-presence check or client-side navigation visibility is not an authorization mechanism.

Every `/platform-admin/*` route will perform a server-side platform-context check. A request made under a tenant context will receive a safe redirect or forbidden result. The platform module will be omitted from shell navigation when the active context is not the reserved platform organisation.

The reserved organisation identifier will be represented by typed configuration, not repeated as an unannotated string in page components.

### Information architecture

Use a separate `Platform Administration` module rather than extending the existing tenant administration module. The route namespace is `/platform-admin`.

Stage 1 routes:

- `/platform-admin` — platform operations overview
- `/platform-admin/tenants` — paginated tenant directory
- `/platform-admin/tenants/[tenantId]` — tenant detail
- `/platform-admin/tenants/[tenantId]/users` — paginated tenant users
- `/platform-admin/tenants/[tenantId]/users/[userId]` — tenant user detail
- `/platform-admin/tenants/[tenantId]/branches` — paginated tenant branches
- `/platform-admin/tenants/[tenantId]/branches/[branchId]` — branch detail
- `/platform-admin/audit` — paginated audit event directory
- `/platform-admin/audit/[eventId]` — audit event detail

The API currently has no global platform-user read endpoint. A global `/platform-admin/users` directory will not be fabricated. User visibility in Stage 1 is tenant-scoped through the supported tenant-user endpoints. Platform-user lifecycle controls are reserved for a later write stage.

### Stage 1 read contract

Use the live OpenAPI contract at `/v3/api-docs` as the source for DTOs and query parameters:

- `GET /api/v1/platform/tenants`
- `GET /api/v1/platform/tenants/{tenant_id}`
- `GET /api/v1/platform/tenants/{tenant_id}/users`
- `GET /api/v1/platform/tenants/{tenant_id}/users/{user_id}`
- `GET /api/v1/platform/tenants/{tenant_id}/branches`
- `GET /api/v1/platform/tenants/{tenant_id}/branches/{branch_id}`
- `GET /api/v1/tenant/audit-events`
- `GET /api/v1/tenant/audit-events/{event_id}`

All list views preserve backend pagination. No page will load an unbounded list or calculate a supposedly global count from a partial page. Where an aggregate endpoint is not available, the overview will show live resource links and current page information instead of invented metrics.

The API adapter will use server-only code and the existing backend request path. It will expose typed DTOs, validated route identifiers, encoded filter parameters, safe error mapping, and consistent pagination metadata. Raw Better Auth sessions, Keycloak claims, and access/refresh tokens remain server-only.

### Platform overview

The overview is an operations landing page, not a dashboard of fabricated KPIs. It will provide:

- a clear active-platform-context confirmation
- entry points for tenant operations and audit review
- live status/resource summaries only when they are supported by complete API data
- recently relevant navigation context where available from the existing response set
- explicit loading, empty, unavailable, and permission-denied states

### Tenant and related resource pages

Tenant detail presents identity, lifecycle status, bootstrap state, failure information, country, currency, timezone, and timestamps. Users and branches are separate paginated workspaces linked from the tenant detail rather than hidden unbounded fetches.

Tenant user pages present identity, user status, and membership status. Branch pages present code, name, type, lifecycle status, timezone, address, parent relationship, and lifecycle timestamps.

Audit list filtering follows the supported API parameters: entity type/id, actor id, action, occurred-from, occurred-to, page, and size. Audit detail presents actor/entity references, outcome, severity, request/correlation identifiers, reason, and safely formatted before/after/metadata JSON.

### Profile refresh

The profile page remains based exclusively on the sanitized `FinaxisUser` DTO. Its layout will be reorganized into:

- identity and authentication summary
- active organisation and selected branch
- available branches/context assignments
- roles and permissions
- expandable technical details

The active context is the primary visual anchor. The page will use stronger hierarchy and responsive grouping rather than repeating several visually identical full-width cards.

## UI and accessibility principles

- MUI remains responsible for component visuals; Tailwind, if used, is limited to layout composition.
- Use existing Finaxis theme tokens; do not paste generated palette hex values into components.
- Use a consistent SVG icon set and never use emoji as structural icons.
- Tables must have meaningful headings, responsive narrow-screen behavior, and accessible row/link labels.
- Status must not be communicated by color alone.
- Inputs and filters require labels, associated errors, visible focus states, and keyboard operation.
- Provide intentional loading, empty, error, and forbidden states.
- Respect `prefers-reduced-motion` and avoid layout-shifting hover effects.
- Maintain one page `h1` and avoid horizontal scrolling at 375px, 768px, 1024px, and 1440px widths.

## Stage 2 write scope

Stage 1 must not enable mutations. Stage 2 is the first write delivery and is intentionally limited to platform-operator administration of tenants and their operating branches. It must preserve the platform-context guard and must not be implemented through client-visible tokens.

### Tenant administration

Stage 2 will cover the following currently documented platform endpoints:

- `POST /api/v1/platform/tenants` — create a tenant draft
- `PATCH /api/v1/platform/tenants/{tenant_id}` — amend a tenant draft
- `POST /api/v1/platform/tenants/{tenant_id}/submit` — submit a tenant for approval
- `POST /api/v1/platform/tenants/{tenant_id}/approve` — approve a tenant
- `POST /api/v1/platform/tenants/{tenant_id}/reject` — reject a tenant with a required reason
- `POST /api/v1/platform/tenants/{tenant_id}/suspend` — suspend a tenant with a required reason
- `POST /api/v1/platform/tenants/{tenant_id}/reactivate` — reactivate a tenant
- `POST /api/v1/platform/tenants/{tenant_id}/deprovision` — deprovision a tenant with a required reason
- `POST /api/v1/platform/tenants/{tenant_id}/bootstrap/retry` — retry failed tenant bootstrap

Tenant creation and amendment will use a review step before submission. Lifecycle controls will be derived from the current backend status and will not be rendered as a generic action menu. Invalid transitions will be disabled or explained, while the backend remains the final authority.

### Branch administration

Stage 2 will also cover:

- `POST /api/v1/platform/tenants/{tenant_id}/branches` — create a branch

Branch lifecycle writes such as submit, approve, suspend, reactivate, close, or assignment changes will be included only where the live platform-scoped API contract confirms the corresponding route and permission boundary. The existing tenant branch APIs must not be assumed to be platform-admin APIs.

### Write interaction rules

All Stage 2 mutations will:

- use the existing server-side backend adapter and context token
- send an idempotency key for each mutation
- centralize request construction and error mapping in a platform administration service
- validate route IDs and request fields before sending them
- require confirmation for lifecycle, suspension, rejection, and deprovisioning actions
- require a reason where the OpenAPI contract requires one
- show the resulting pending/accepted state returned by the backend
- refresh or revalidate the affected read view after success
- preserve safe error messages without exposing backend internals or tokens

### Explicitly deferred from Stage 2

- a global platform-user directory, until a platform-scoped read endpoint exists
- platform-user suspend/reactivate/deactivate controls, which require a separate user-write stage after the read model is established
- audit-event mutation, unless the backend adds an explicit supported write contract
- branch lifecycle or assignment writes whose platform-scoped routes are not present in the current OpenAPI document

The planned follow-up sequence after Stage 2 is:

1. platform user lifecycle administration
2. additional branch lifecycle and assignment administration once the platform contract is available
3. additional audit actions only if a backend write contract is introduced

## Verification criteria

The Stage 1 implementation is complete only when:

- platform routes are inaccessible under a tenant context
- platform navigation appears only under the reserved platform context
- every list endpoint is paginated and filters round-trip through the URL
- tenant, user, branch, and audit detail pages handle valid, missing, forbidden, and backend-error states
- no access or refresh token reaches a Client Component or browser-visible state
- profile and platform pages render only typed/sanitized DTOs
- `pnpm check` passes
- rendered UI changes pass `pnpm test:e2e` or have an explicitly documented environment blocker plus equivalent browser verification
- `pnpm build` passes
- the read-only Stage 1 boundary is visible in the UI and code; no write endpoint is invoked by Stage 1 pages

## Out of scope for this specification

- tenant-level write administration
- global platform-user listing, because no read endpoint is currently exposed
- changes to Keycloak authentication flows
- replacement of the existing MUI/Tailwind stack
- arbitrary client-side state management or token persistence
