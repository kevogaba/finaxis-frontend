# bg-adopt 24 — Export the audit trail as CSV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** Administrators can export the audit trail's current filters as a CSV file (BG-20).

**Architecture:**

- **Route handler:** `app/api/tenant/audit-events/export/route.ts` validates the session
  server-side and streams the platform's CSV through. The token never reaches the client.
- **Raw helper:** `auth/backend-api.ts` gains a raw streaming helper, because `backendApi` parses
  JSON.
- **UI:** the audit trail page gets an "Export CSV" button opening a dialog. The dialog submits a
  plain GET to the route handler (a link with the query), so the browser downloads the file. A
  failure answers a small HTML-free problem the dialog reads first: the dialog calls the handler
  with `fetch`, and on 200 triggers the download from a blob URL.

**Spec:** [§8 entry 24](../specs/2026-11-24-backend-gap-adoption-design.md#24--audit-export)
· designs `#d-export` · register BG-20.

## Wire facts (platform `6a8ea28`)

- **`GET /tenant/audit-events/export`** takes the audit search's filters.
  - It checks `audit.export`, then `audit.view` (a named 403) before validating anything.
  - `occurred_from` is required; the window is at most 31 days (400 `invalid_parameter`).
  - More than 10,000 rows is 400 `audit.export_too_large`.
  - Rate limit: 5 a minute per user and tenant (429).
- **Response:** `text/csv; charset=UTF-8`,
  `Content-Disposition: attachment; filename="audit-events-<dd-MM-yyyy>.csv"`,
  `Cache-Control: no-store`.
  - Columns: `occurred_at, action, outcome, severity, actor_type, actor_user_id, branch_id,
subject_user_id, entity_type, entity_id, request_id`.
  - A failure mid-stream aborts the transfer.
- **Audit:** each export writes one `audit.export` audit row.

## Tasks

### Task 1: Server side

- **Raw helper:** `backendFetchRaw(path, init)` in `auth/backend-api.ts` returns the `Response`
  after the auth and context headers. It shares the 401 and context handling with `backendApi`.
- **Route handler**
  - Session check (`getAuthenticatedUser`), then `can(audit.export)` and `can(audit.view)`; 403
    otherwise.
  - Forwards the whitelisted query keys and streams the body with the platform's headers (`no-store`
    kept).
  - On a non-2xx it returns `{ code, requestId }` JSON with the same status, never the backend's
    `detail`.
- **Tests:** handler unit tests (forwards only whitelisted keys; streams; maps errors; refuses
  without the codes).

### Task 2: UI

- **Button:** "Export CSV" on `admin/audit/page.tsx` beside the title, shown with
  `withViews(['audit.export'])`.
- **Dialog** (client)
  - Shows the active filters as text.
  - From and To fields, pre-filled from the current filters (or the last 7 days when From is
    unset). Validated: From required, window of 31 days or less.
  - Help: "Up to 31 days and 10,000 events per file. Names, addresses and before-and-after values
    aren't included."
  - "Download CSV" fetches the handler. On 200 it saves the blob with the response's filename.
- **Errors**
  - `audit.export_too_large`: "More than 10,000 events match. Narrow the dates or filters and try
    again."
  - 429: "You've exported 5 files in the last minute. Wait a minute, then try again."
  - 400 `invalid_parameter`: "Set From, and keep the window to 31 days or less."
- **Tests:** RTL; e2e (export downloads a CSV whose header row matches the columns; too large shows
  the message).

### Task 3: Fake API

- **`routes/audit.mts`:** `GET /api/v1/tenant/audit-events/export` with the rules above, a 10,000
  cap, 5 a minute per user (per run), the CSV columns and an audit row.
- **Scenarios:** admin scenarios gain `audit.export`.
- **Spec:** the fake spec.

### Task 4: Gates, docs, commit

- [ ] Run `pnpm check` and the full e2e suite: green.
- [ ] Register: BG-20 → **Adopted** (frontend #NN), keeping the declined directory exports.
- [ ] Contract: the export route.
- [ ] Commit `feat(audit): export the audit trail as CSV`.
