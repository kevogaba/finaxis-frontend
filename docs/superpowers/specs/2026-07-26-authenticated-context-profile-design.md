# Authenticated organisation context and profile design

## Goal

After successful Keycloak authentication, require the user to select an active
organisation and, when necessary, an assigned branch before the Finaxis
application shell is rendered. Once context is established, load the backend
profile and use it to render the existing profile page and shell context.

## Backend contract

The frontend integrates with the backend at the configured API origin:

- `GET /api/v1/auth/organisations?page=0&size=25` discovers active selectable
  organisations for the bearer identity.
- `POST /api/v1/auth/select-organisation` accepts `{ "organisation_id": id }`.
  The response returns a signed `context_token`, and may return an auto-selected
  `branch_id`, `requires_branch_selection`, and `assigned_branch_ids`.
- `GET /api/v1/auth/branches?page=0&size=25` discovers assigned active branches
  after organisation selection. It uses the organisation context token.
- `POST /api/v1/auth/select-branch` accepts `{ "branch_id": id }` and returns a
  branch-scoped context token.
- `GET /api/v1/auth/me` returns the authenticated profile, active organisation,
  selected branch, assigned branches, roles, and permissions.

Discovery remains paginated with a bounded page size. Selection mutations send
UUID `Idempotency-Key` values. Backend response and request field names are
translated at the server boundary; frontend types remain camelCase and typed.

## Architecture and data flow

All calls to the backend remain server-side. A server-only API client obtains the
Keycloak access token through the existing Better Auth server integration and
sends it as a bearer token. Keycloak access, refresh, and ID tokens never cross
into Client Components or browser-visible state.

The signed backend context token is stored in an HttpOnly, same-site context
cookie. It is not an authentication credential, but it authorizes the selected
application context and must not be exposed to client JavaScript. Route handlers
read and update this cookie while calling the backend.

The browser flow is:

1. The authenticated route guard validates the Better Auth session.
2. The pre-shell `/select-context` page discovers selectable organisations.
3. The user selects an organisation; the server route calls the selection API
   and stores the returned context token.
4. The server discovers assigned branches using that context.
5. If the backend did not auto-select a branch, the user selects one and the
   server replaces the cookie with the branch-scoped context token.
6. The authenticated layout calls `/auth/me` through the server client using the
   context cookie. Only a successful profile/context response renders `AppShell`.

## Routing behavior

`/select-context` is authenticated but outside the application shell. It must
redirect to `/login?reason=session_expired` when the Better Auth session is
absent. It must not render shell navigation or application content.

The authenticated layout must not use the current hardcoded application context
fixture as an authorization or display source. It resolves the active profile
and derives the typed `ApplicationContext` from the backend response. Missing,
expired, rejected, or otherwise invalid context redirects to `/select-context`.

The pre-shell page may redirect to the first applicable step after successful
selection. A single backend-selected branch skips the branch picker. Multiple
branches require an explicit branch choice. Zero available organisations or
zero available branches produce an actionable empty state rather than an empty
or misleading shell.

## UI behavior

Use the existing MUI theme and accessibility conventions. The selection page
has one `h1`, labelled controls, visible focus states, associated error text,
and loading/disabled states during mutations. Organisation and branch options
show stable backend identifiers only where useful; display names are the primary
labels.

The existing profile view remains the presentation surface for profile data,
but its source changes from the Better Auth identity fixture to the backend
`/auth/me` read model. Preserve explicit empty states for missing assignments,
roles, or organisation data.

## Error and security handling

- `401` or an absent Better Auth session redirects to login.
- `403` from discovery or selection shows a safe, non-membership-revealing
  message and allows retry where meaningful.
- A stale or invalid context cookie is deleted server-side and sends the user
  back through context selection.
- Backend problem details are not rendered verbatim when they could disclose
  tenant or membership state.
- Context cookie attributes follow the existing environment policy: HttpOnly,
  secure in production, same-site, path `/`, and a bounded expiry.
- No arbitrary redirect/callback values are accepted from query parameters.

## Testing and verification

Unit/component tests cover API response mapping, cookie handling, organisation
and branch step transitions, auto-selection, empty states, retryable errors,
stale context recovery, and layout redirection.

Playwright coverage exercises the authenticated pre-shell path with mocked or
local backend responses, verifies that the shell is not visible before context
selection, completes the organisation/branch flow, and confirms that profile
data and selected context appear afterward. Existing auth and protected-route
tests must remain green.

Verification gates for the implementation are `pnpm check`, `pnpm test:e2e`,
and `pnpm build`, with any environment-blocked result reported precisely.

## Scope limits

This slice does not add organisation switching from inside the shell, profile
editing, backend API generation, or new identity-provider behavior. It replaces
the hardcoded shell context only for the authenticated profile/context path and
keeps future module APIs behind the same server-side context boundary.
