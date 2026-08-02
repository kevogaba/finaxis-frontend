# Task 2 report: context discovery and selection routes

## Status

DONE

## Delivered

- Added the server-only context service with bounded paginated organisation/branch discovery and UUID validation for selection inputs.
- Added organisation and branch selection routes that store context tokens only in the HttpOnly cookie and exclude them from JSON responses.
- Added safe 401/403/409/502 route responses and stale-context cookie clearing.
- Added focused service and route tests for validation, discovery, selection, token exclusion, and safe error behavior.

## Verification

- `pnpm test:run auth/context-service.test.ts app/api/context/context-routes.test.ts` — 16 tests passed.
- `pnpm typecheck` — passed.
- Commit hook full gate — 29 test files and 100 tests passed; format, ESLint, and typecheck passed. Existing jsdom requestSubmit diagnostic remains present.

## Commit

`7195a03 feat: add context discovery and selection routes`

## Review fixes

- Added `auth/context-browser-dto.ts` as the explicit browser boundary. Its typed mappers whitelist each field from backend organisation and branch discovery pages, page metadata, and both selection responses while converting all browser-visible names to camelCase.
- All four successful context routes now return only browser DTOs. `context_token` remains consumed solely by the centralized HttpOnly cookie helper; the backend-only `context_header` and any unknown upstream fields cannot be serialized in route JSON.
- Extended successful route coverage with injected `context_token` and unknown fields across organisation discovery, branch discovery, organisation selection, and branch selection. Each response assertion now checks the exact camelCase browser contract, proving backend snake_case fields and injected fields are absent. Existing safe error and stale-cookie behavior remains covered.

## Review fix verification

- `pnpm test:run auth/context-service.test.ts app/api/context/context-routes.test.ts` - 2 files, 17 tests passed.
- `pnpm typecheck` - passed.
- `git diff --check` - passed.

## Final review follow-up fixes

- Added `auth/require-authenticated-user.ts`, a server-only guard that validates the incoming
  Better Auth session through `getAuthenticatedUser` and fails closed with a dedicated error.
- Each context discovery/selection handler now obtains the request headers once and invokes the
  guard before any context-service call, backend API request, or context-token lookup. A missing
  or invalid session returns the existing safe 401 message and does not clear or set a context
  cookie.
- Added parameterized route tests for unauthenticated organisation discovery/selection and branch
  discovery/selection. They assert a safe 401 and prove the corresponding discovery/selection
  service is never invoked.
- Added the missing branch-selection POST test for an absent `branch_id`, alongside the existing
  malformed identifier test; both return 400 without invoking selection.
- Updated the README to describe `/select-context` before the authenticated shell, the
  server-side HttpOnly-only context-token persistence boundary, and the remaining shell fixture
  replacement work.

## Final review follow-up verification

- `pnpm test:run auth/get-authenticated-user.test.ts auth/context-service.test.ts app/api/context/context-routes.test.ts` - 3 files, 22 tests passed.
- `pnpm typecheck` - passed.
- `pnpm check` - passed (format, lint, typecheck, and 29 Vitest files).
- `git diff --check` - passed.

## Documentation fix verification

- `pnpm format:check` - passed.
