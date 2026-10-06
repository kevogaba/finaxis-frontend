# PR 17: Platform — institution records, users and overview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [plan index](./2026-09-25-admin-parity-00-index.md),
> the layer-17 section of the [handoff](./2026-10-02-admin-parity-handoff.md), the
> [16 platform tenants plan](./2026-10-01-admin-parity-16-platform-tenants.md) and the
> [10 users plan](./2026-10-03-admin-parity-10-users.md) first: 17 extends 16's record and reuses 10's
> and 08's contracts, rules and components.

**Goal:** Finish the platform workspace (spec §11.2–§11.4, §8, §9):

- the institution record gains two tabs: **Branches** (search, status and type filters, sortable;
  a read-only branch record; "Create branch draft" with the BG-18 warning) and **Users** (search,
  user and membership status filters; a user record with the **global account lifecycle**:
  Suspend account, Reactivate account, Deactivate account);
- `/platform-admin/users`: the platform organisation's members, with the same record;
- `/platform-admin`: five KPI tiles (active, pending approval, draft and suspended institutions;
  platform operators) and a **Needs attention** table, replacing the two link cards and
  `PlatformPageShell`;
- the app-bar notifications badge in the platform workspace (institutions pending approval);
- `KpiTile` in the kit (spec §9).

It retires the old read-only platform branch and user code (seven root files, no consumers) in favour
of 08's and 10's contracts (spec §6.1), and produces what later layers consume: `KpiTile` (14's
overview), `NotificationsMenu` (12's tenant badge), and `parseInstitutionId`.

**Architecture:**

- Pages are Server Components reading through the platform services
  (`modules/platform-administration/{branches,users,overview}/*-service.ts`), which call
  `apiGet(path, schema)` with **08's and 10's zod schemas** (the wire shapes are identical; only the
  paths differ). Pages settle reads with `load()`. Pure rules live in client-safe `*-rules.ts`.
- The two list tabs join 16's `[tenantId]/(record)/` group. The branch record, the branch draft form
  and the institution user record live **outside** the group, each with its own hero or header, so
  a person's account actions never share a page with the institution's own Suspend and Deprovision
  (Ruling 1). One `AccountRecord` component renders both user records (institution and platform).
- Every route validates and lower-cases its ids **before any read** (`parseInstitutionId`,
  `parseBranchId`, 10's `parseUserId`) and calls `notFound()` otherwise; the reserved platform
  organisation is never an institution (`isInstitutionId`).
- Mutations are Server Actions on `runServerAction`: `createInstitutionBranchDraft` (redirects to
  the new draft) and the three account actions. Every dialog and the form forward the form's minted
  idempotency key and `contextOrganisationId`. Deactivate asks for the username typed back
  (client-required, server-checked); your own account can't be suspended or deactivated (disabled
  with a caption, and refused by the action before any call).
- The overview issues five reads in parallel; each tile and each half of the Needs attention table
  degrades on its own. The badge is `components/shell/platform-notifications.tsx` (own `Suspense`,
  `null` outside the platform workspace, one `size=1` read settled by `load()`) over a client
  `NotificationsMenu`.
- Additive cross-layer edits, each its own announced commit: 08's `BranchDirectoryTable`
  (`basePath`, `createdLabel`, `nameMaxWidth`) and `BranchDraftForm` (`action`, `cancelHref`,
  `hiddenFields`, `parentsNote`); 10's `UserDirectoryTable` (`basePath`). Defaults keep 08's and
  10's output byte-identical.

**Tech Stack:** Next.js 16.3 (nested layouts, route groups, Server Actions, `notFound`, `redirect`),
React 19.3 (`useActionState`, `cache`, `Suspense`), MUI 9.4 (`Badge`, `Popover`, `Table`, `Alert`),
zod 4.6, Vitest + RTL, Playwright + axe. No new packages.

**Spec:** [`…-design.md`](../specs/2026-09-25-admin-prototype-parity-design.md): §11.2 (Branches and
Users tabs), §11.3 (platform users), §11.4 (overview), §8 (navigation table; the platform badge),
§9 (record and list patterns; `KpiTile`; UTC in the platform workspace), §6.1 (the platform module
reuses the administration contracts), §6.2–§6.8.

Contract (`…-api-contract.md`): §A (uuid case, context re-validation of user and organisation, enums,
idempotency), §B, §C (`UserInTenantSummary`, `UserLifecycleResult`, `BranchSummary`, `BranchDetail`,
`BranchDraftResult`), §D (`SuspendUser`, `ReactivateUser`, `DeactivateUser`, `CreateBranch`), §E.2
(every platform row), §E.3 (`POST /branches`' 409s), §F (user and organisation states), §G
(`user.deactivation_assignment_revoked`), §I, §J. Gaps: BG-01, BG-06, BG-09, BG-10, BG-12, BG-13,
BG-15, BG-18, BG-22, BG-29, BG-30, BG-31, BG-35.

**Base:** `3320518`, layer 10's final tree (PR #57, its Codex round 1 fixes included), with layers
08, 09, 13, 15, 16 and 10 in. The layer ships as one commit on `admin-parity/17-platform-records`,
stacked on `admin-parity/10-users`. The controller keeps the layer's ledger. The **Pre-flight
notes**, **Layer gate**, **Controller live check** and **Self-review** sections are not tasks.

**Plan history:** drafted 2026-10-03 on `334efd2`; revised 2026-10-04 after an adversarial plan
review (0 Critical, 4 Important, 14 Minor, all applied) and the user's answers to the plan's eleven
questions; re-based on `3320518` the same day.

## Global Constraints

Sources: **A** = `AGENTS.md`; **H3.n** = handoff §3 standing rule n; **L16-Rn** / **L10-Rn** = the 16
/ 10 SDD ledger rulings; **L10-P** = the layer-10 plan's own rulings; **C** = the controller's rulings
for this layer. Every task's requirements include this section.

**Command forms.** Every command runs from the repository root with Node 24 (`package.json`
`engines`) and the environment `config/env.server.ts` validates; the controller's brief gives the
Node path, the env file and the E2E wrapper for each task:

```bash
# U — focused unit tests (foreground)
pnpm exec vitest run <test files>
# P — prettier on .mts files (lint-staged skips them; the hook's format:check doesn't)
pnpm exec prettier --write <.mts paths>
# E — E2E only through the controller's wrapper (the repo's Playwright config; it forwards
#     Playwright's arguments), in the foreground, chunks of at most 8 minutes (--grep)
<e2e wrapper> <spec files> [--grep <pattern>]
# C — commit: write the message to a file outside the repo first; stage whole files only.
#     The husky hook (lint-staged + the full pnpm check) is the check. Never --no-verify.
git add <whole files>
git commit -F <message file>
```

If `tsc` reports TS2307 for a route after adding or deleting route files, run
`rm -rf .next/types .next/dev/types` with no `next` process running (handoff §9). The gates
(`pnpm check`, `pnpm build`, the full E2E) belong to the layer gate, never to a task.

**Binding rules** (one line each; the source in brackets):

1. Run `pnpm check` after any implementation change and the affected E2E specs (form E) when rendered
   UI changes; no task is done until both are clean. [A]
2. No `@ts-ignore`, `@ts-nocheck`, unsafe `any`, or rule disables; fix the cause. [A]
3. MUI + Tailwind (layout only) is the whole stack; no new packages; `package.json` and
   `pnpm-lock.yaml` don't change. [A, index]
4. Colours come from theme tokens; no hex/rgba in components; **no new token** in this layer (every
   pair `KpiTile` and the badge use is already gated by `theme/tokens.test.ts`). Muted text is
   `sx={{ color: 'text.secondary' }}`, **never** `color="text.secondary"`: MUI v9 drops a dotted
   `color` on Typography, Box, Stack, Grid and DialogContentText (`TruncatedText` takes
   `color="textSecondary"`); the ESLint guard in `eslint.config.mjs` enforces it. [A, L16-R24, L16-R38]
5. Server Components by default; `'use client'` only for interaction; no function prop (no `sx`
   callback, no Server Action, no `component={Link}`) from a Server to a Client Component (use
   `@/components/navigation/next-link`; a client wrapper passes a Server Action); no pre-built
   element into an MUI prop gated by `isValidElement`/`cloneElement` (Chip `icon`/`avatar`/
   `deleteIcon`). [A, H3.3]
6. Every Server Action runs through `runServerAction`, forwards the idempotency key the form or
   dialog minted when it opened (never a new one per request) and the cross-tab guard field
   `contextOrganisationId`; never echoes backend text; names known guard failures with local copy
   (`explain`). **Every** dialog and form test asserts the hidden `contextOrganisationId` and
   `idempotencyKey` (an `expectScoped` helper) and that a retry after a failure reuses the key. [A,
   H3.1, L16-R15, L10-R7]
7. A route validates every id **before any read**: `notFound()` when `parseInstitutionId`,
   `parseBranchId` or `parseUserId` rejects it, then the lower-cased form (contract §A); pinned by
   `app/(authenticated)/platform-admin/records-id-guard.test.tsx` (Tasks 4b–6). Server Actions check
   ids with zod before any backend call. [A, L16-R26, L16-R32, L10-P16]
8. Every list is server-paginated with its state in the URL (`PAGE_SIZES`, `TablePaginationBar`,
   `ListToolbar`, `useListNavigation()`); the Needs attention table is a bounded preview (at most 5
   rows per status, with links to the paginated directory; Ruling 10, AGENTS.md's sixth exception).
   [A, H3.7]
9. Reads go through `apiGet(path, schema)` with 08's or 10's or 16's snake_case zod schemas; pages
   settle reads with `load()` and render `ErrorState` (or `ForbiddenState` on a 403) on the failure
   branch; `describeProblem` never echoes backend text. **A failed secondary read is never shown as
   absence or as a fact** (a count reads "Couldn't be loaded" with its reference; a list says it
   couldn't load; "not permitted" hides, "failed" says so). [A, L10-P18, C]
10. Request bodies are built field by field in snake_case (an unknown property is `400 invalid_json`).
    [contract §A]
11. Status changes move focus to the same action if still offered, else the first enabled one, else
    the record title via `components/data-display/focus-record-title.ts`; a focus assertion in a
    test always sits in its **own** `waitFor`. [H3.4, L10 flake fix `c64892b`]
12. One `h1` per page, visible focus, labelled fields, errors tied to fields, reduced motion
    respected; static notices are `Alert role="note"`; a repeated control's accessible name is
    unique; a section and a table never share an accessible landmark name; 375 px shows no
    horizontal page scroll and names truncate inside the visible width (`min(320px, 60vw)`: 10's
    `UserDirectoryTable`, the Needs attention links, and 08's `BranchDirectoryTable` through its
    new `nameMaxWidth` prop on the Branches tab); a hero action box is capped at
    `maxWidth: { md: 320 }`; no serious or critical axe violation in light and dark at 1280 and
    375 px. [A, index, L10 gate]
13. The kit and the theme take only additive, announced `refactor(kit):`/`feat(data-display):`
    commits; 08's and 10's modules take only additive props with defaults that keep their output
    identical, each in its own `refactor(branches|users):` commit. [H3.2]
14. Fake-API files run under plain `node`: relative `.mts` imports, `import type`, erasable TypeScript
    only; seeds use the `17000000-0000-4000-8000-…` prefix and lettered tails (so an upper-cased id
    differs); never mutate another layer's builder's state; new `BUILDERS` entries go last with a
    `// Layer 17 (platform records).` comment; `server.mts` registers new routes last;
    user-controlled lookups use `Object.hasOwn`; mutation codes only in 17's own scenario. [A,
    H3.5, H3.6, L09-R9, L16-R7]
15. E2E: every test signs in to its own fake-API run (`authenticate()`); not-found is asserted by page
    content (`notFoundHeading`; the layout's `notFound()` answers HTTP 200); URL assertions read
    `new URL(page.url()).searchParams.get(…)`, never an order-dependent regex; no `waitForTimeout`;
    an open dialog is scanned only once its opacity is 1; instants are asserted from fixed seed
    values; shared helpers come from `e2e/support` (never copied); `rowsOf` counts include the
    header row. [L16-R27, L16-R31, L10-P15, L10-R(9/10)]
16. Unknown-property fake tests send a body that is valid apart from the extra key, with a control
    request proving the same body otherwise succeeds. [L16 Task 3 Important]
17. Every user-visible string is the plan's verbatim text; an enum shown to people goes through a
    word helper (`userStatusLabel`, `bootstrapStatusLabel`, `branchTypeLabel`, `humanizeEnum` only
    where its output reads right). [C, L10-R4]
18. New backend gaps would take BG-36 onwards (this layer registers none); a summary row's Gap column
    stays ≤ 98 characters. [L16-R12]
19. Every commit ends with exactly these two trailer lines, and no model name appears in code, docs,
    commit messages or trailers: [L09-R10, L16-R8]

    ```
    Co-Authored-By: Claude <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
    ```

20. Update `README.md` (and `AGENTS.md`) where the architecture or a documented limit changes; the
    plan's trailing gate, live-check and self-review sections are the controller's. [A, H3.10]
21. **Layer 10's Codex round 1 lessons** (PR #57, now code on the base to mirror).
    (a) A service helper that backs a page never blanket-catches: it rejects, and the caller
    settles it with `load()`, so a 401 or a stale context still redirects; only then may an
    ordinary failure degrade, with a comment saying what it means. The model: `getUserInviter`
    (`modules/administration/users/user-service.ts:90-107`, it rejects) and
    `app/(authenticated)/admin/users/[userId]/layout.tsx:70-77` (`load(getUserInviter(…))`; any
    other failure leaves the inviter unknown and Approve on offer, the backend's 403 being the
    guard). (b) A bounded scan or a capped index that feeds a picker or a count says so when it
    stopped early, never presented as the whole set. The model: `getRoleIndexScan()` reports
    `truncated` (`lib/api/lookups.ts:101-132`), and the Assign-role picker then shows
    `rolesCappedHint(ROLE_INDEX_CEILING)`, or `rolesCappedNoneActive(…)` when the capped part held
    no active role (`modules/administration/users/user-rules.ts:270-279`). (c) A horizontally
    scrolling table container is a keyboard-focusable region (`tabIndex={0} role="region"`) whose
    name differs from every other landmark on the page: `UserDirectoryTable`'s "Users table"
    (`modules/administration/users/components/user-directory-table.tsx:33-41`), 07's history
    table, 10's branch assignments table. axe rates `landmark-unique` moderate, so the
    serious/critical gate misses a clash: a spec asserts each such region's count, as
    `e2e/users.spec.ts:1292-1294` does. Review Focus checks this plan's own code against all
    three. [L10-Codex]

**Wire contract** (contract §E.2; scope **P** = the PLATFORM organisation; all reads in the platform
context):

| Endpoint                                                                       | Permission                                        | Body                                       | Success                        | 17's handling                                                                                                                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /platform/tenants?status=S&size=n`                                        | `tenant.view` (P)                                 | —                                          | `ApiPage<TenantSummary>`       | KPI totals (`size=1`) and the attention preview (`size=5`, `createdAt ASC`); the ACTIVE total holds the platform organisation exactly once (Ruling 9) |
| `GET /platform/tenants/{id}/branches?q&status&type&page&size&sort_by&sort_dir` | `branch.view` (P)                                 | —                                          | `ApiPage<BranchSummary>`       | 08's `branchPageSchema`; sort allow-list as `/branches` (an off-list value is dropped before the request: a 500 otherwise)                            |
| `GET /platform/tenants/{id}/branches/{bid}`                                    | `branch.view` (P)                                 | —                                          | `BranchDetail`                 | 08's `branchDetailSchema`; `address` is `{}` (not mapped), `opened_on`/`closed_on` shown only when present (BG-13); 404 → not-found                   |
| `POST /platform/tenants/{id}/branches`                                         | `branch.create` (P) **and** in the tenant (BG-18) | `CreateBranch` (no `address`)              | 201 `BranchDraftResult`        | 403 → `BRANCH_CREATE_REFUSED`; 409 → `BRANCH_CREATE_CONFLICT`; offered only for ACTIVE institutions; redirects to the draft                           |
| `GET /platform/tenants/{id}/users?q&user_status&membership_status&page&size`   | `user.view` (P)                                   | —                                          | `ApiPage<UserInTenantSummary>` | 10's `userPageSchema`; newest first, no sort; `{PLATFORM}` lists platform members (BG-10)                                                             |
| `GET /platform/tenants/{id}/users/{uid}`                                       | `user.view` (P)                                   | —                                          | `UserInTenantSummary`          | 10's `userSummarySchema`; 404 → not-found                                                                                                             |
| `POST /platform/users/{uid}/suspend`                                           | `user.suspend` (P)                                | `{ reason }` 3–500                         | `UserLifecycleResult`          | ACTIVE only (409 → `ACCOUNT_CHANGED`); own account refused locally first                                                                              |
| `POST /platform/users/{uid}/reactivate`                                        | `user.activate` (P)                               | `{}` or `{ reason }` ≤ 500 (body required) | `UserLifecycleResult`          | SUSPENDED only (409 → `ACCOUNT_CHANGED`)                                                                                                              |
| `POST /platform/users/{uid}/deactivate`                                        | `user.deactivate` (P)                             | `{ reason }` 3–500                         | `UserLifecycleResult`          | ACTIVE only; irreversible; username typed back; own account refused locally first                                                                     |

The responses of the three account actions are not parsed (the page refreshes). Wrong-context 403s
carry a sentence code (BG-30) and show the generic permission copy.

**Files 17 never touches:** `app/(authenticated)/layout.tsx`; `components/shell/app-shell.tsx`,
`global-header.tsx` and every shell file except `platform-notifications.tsx` and the new
`notifications-menu.tsx`; `lib/api/*`; `auth/*`; `config/*`; `theme/*`; every kit file except the new
`components/data-display/kpi-tile.tsx`; `modules/administration/**` except the three component files
named in rule 13 and their tests, and `branches/branch-service.ts` (+ test) for P-1 (Task 4c Step 3); `modules/platform-administration/tenants/**` except
`institution-id.ts`, `tenant-rules.ts`, `components/tenant-directory-table.tsx`,
`components/provisioning-timeline.tsx` and their tests; 16's route files except
`[tenantId]/(record)/layout.tsx` (and its new `layout.test.tsx`, Task 4b) and
`[tenantId]/(record)/page.tsx`; 08's `app/(authenticated)/admin/branches/[branchId]/layout.tsx` (+ its new
test) for P-1 only; the fake API's `access`,
`audit-log`, `context-token`, `http`, `idempotency`, `router` and `state` `.mts` files; existing e2e
specs except `e2e/support/fake-api.ts` (one optional parameter) and, in Task 3's droppable commit
only, `e2e/fake-api-platform-tenants.spec.ts`; the plan index and other layers' plans.

## Rulings for this layer

Decisions the implementer can't make. Eleven questions went to the user before the build, each
with a recommended option; the user chose it every time, so every ruling below is confirmed. Each
ruling names its cost if wrong.

| Q   | Decision                                                                                                                                          | Status                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Q1  | Outside the record, own hero: the two list tabs join `(record)`; the branch record, the draft form and the user record live outside it (Ruling 1) | confirmed by the user 2026-10-04 (answered interactively) |
| Q2  | Every-institution wording + type the username: Deactivate is an `alertdialog` with the username typed back (Ruling 5)                             | confirmed by the user 2026-10-04 (answered interactively) |
| Q3  | Disabled + refused server-side: your own account's Suspend and Deactivate (Ruling 6)                                                              | confirmed by the user 2026-10-04 (answered interactively) |
| Q4  | Reuse with additive props: 08's and 10's contracts, rules and components (Ruling 3)                                                               | confirmed by the user 2026-10-04 (answered interactively) |
| Q5  | Five tiles, operators = active: an ACTIVE account with an ACTIVE platform membership (Ruling 9)                                                   | confirmed by the user 2026-10-04 (answered interactively) |
| Q6  | Pending first, oldest first, max 5 each, with AGENTS.md's sixth paging exception (Ruling 10)                                                      | confirmed by the user 2026-10-04 (answered interactively) |
| Q7  | Bell stays, failure says so: a failed count never reads as "none" (Ruling 11)                                                                     | confirmed by the user 2026-10-04 (answered interactively) |
| Q8  | Offer it + explain the 403: "Create branch draft" for an ACTIVE institution, with the BG-18 warning (Ruling 8)                                    | confirmed by the user 2026-10-04 (answered interactively) |
| Q9  | Fix M-2 + M10, two fake gaps droppable (Ruling 15)                                                                                                | confirmed by the user 2026-10-04 (answered interactively) |
| Q10 | Leave 16's routes: 17's new routes use `parseInstitutionId` (Ruling 4)                                                                            | confirmed by the user 2026-10-04 (answered interactively) |
| Q11 | `platform-records` on top of `platform-tenants`, plus `platform-records-read-only` (Ruling 14)                                                    | confirmed by the user 2026-10-04 (answered interactively) |

1. **Routes** (Q1, A, confirmed). Tabs inside `app/(authenticated)/platform-admin/tenants/[tenantId]/(record)/`:
   `branches/page.tsx`, `users/page.tsx`. Outside the group, under `[tenantId]/`:
   `branches/new/page.tsx` (form, `PageHeader`), `branches/[branchId]/page.tsx` (own `RecordHero`),
   `users/[userId]/page.tsx` (own `RecordHero` via `AccountRecord`). New:
   `app/(authenticated)/platform-admin/users/page.tsx` and `users/[userId]/page.tsx`. The
   `(record)` layout adds the Branches tab (with `branch.view`) and the Users tab (with `user.view`)
   after Provisioning. Cost if wrong: moving three route files (about half a day).
2. **Navigation.** "Platform users" (`ManageAccountsOutlined`, `requiresAny: ['user.view']`) after
   "SACCO institutions" (spec §8). Cost: one registry entry.
3. **Reuse** (Q4, A, confirmed; spec §6.1). 10: `userSummarySchema`, `userPageSchema`, `USER_STATUSES`,
   `MEMBERSHIP_STATUSES`, `UserListQuery`, `parseUserListQuery`, `hasUserFilters`,
   `onboardingState`, `userStatusLabel`, `parseUserId`, `UserDirectoryTable` (+ `basePath`). 08:
   `branchPageSchema`, `branchDetailSchema`, `branchDraftResultSchema`, `BRANCH_STATUSES`,
   `BRANCH_TYPE_SUGGESTIONS`, `BranchListQuery`, `parseBranchListQuery`, `branchTypeLabel`,
   `isTimeZone`, `branchDraftSchema`, `BranchDirectoryTable` (+ `basePath`, `createdLabel`,
   `nameMaxWidth`),
   `BranchDraftForm` (+ `action`, `cancelHref`, `hiddenFields`, `parentsNote`). Deleted (no
   consumer): `modules/platform-administration/platform-administration.types.ts`,
   `platform-administration-mappers.ts(+test)`, `platform-administration-queries.ts(+test)`,
   `platform-administration-service.ts(+test)` (Task 2) and
   `components/platform-page-shell.tsx(+test)` (Task 7). Kept: `platform-administration-module.ts`,
   `platform-administration-navigation.ts`. Cost: copying ~500 lines into the platform module.
4. **Ids** (Q10, A, confirmed). `parseInstitutionId` (validated by `isInstitutionId`, lower-cased) for
   every new route's tenant id; `parseBranchId` and 10's `parseUserId` for the second id. Links are
   built from the lower-cased ids. 16's four routes keep `isInstitutionId` as they are. Cost: four
   one-line edits if B.
5. **Account lifecycle** (Q2, A, confirmed). `availableAccountActions(userStatus, holder)`: ACTIVE →
   Suspend account, Deactivate account; SUSPENDED → Reactivate account; any other status → none;
   each needs its own code (`user.suspend`, `user.activate`, `user.deactivate`; no `.view` read-back,
   contract §E.2). Suspend and Deactivate take a required reason (3–500, trimmed); Reactivate an
   optional one (≤ 500; `{}` when blank). Deactivate is an `alertdialog` (`tone="error"`) with the
   username typed back: a required field in the dialog, compared exactly in the Server Action
   (`CONFIRM_USERNAME_MISMATCH` on `confirmUsername`). The typed-back username is a UX guard and
   the permission is the gate: the action compares the typed value with the hidden `username` the
   form itself sends, so a crafted form defeats it, as with 16's Deprovision. The copy says each
   action applies to every institution the person belongs to. Cost: removing one field (B) or one
   action (C).
6. **Your own account** (Q3, A, confirmed). Suspend account and Deactivate account are shown disabled
   with the `OWN_ACCOUNT` caption when the record's id (the backend's) equals `profile.user_id`
   (both lower-cased); `suspendAccount` and `deactivateAccount` also refuse it inside
   `runServerAction`, before the POST, with the frontend-only code `own_account` (precedent: 16's
   `tenant_code_taken`). BG-35 is widened to accounts. Cost: ~10 lines.
7. **Scope note.** Every user record shows an `Alert role="note"` with `accountScopeNote(scope)`
   above its facts: the account is platform-wide; an institution membership is the institution's
   own administrators' to manage. Cost: one sentence.
8. **Branch creation** (Q8, A, confirmed). "Create branch draft" appears on the Branches tab when
   `canCreateInstitutionBranch(status, holder)`: the institution is ACTIVE and the holder has
   `branch.create` and `branch.view` (the redirect reads the draft back). The form page refuses
   without those codes (`ForbiddenState`) and for a non-ACTIVE institution (`BRANCH_CREATE_INACTIVE`),
   shows `branchCreateWarning(name)` as a warning note, offers parents from
   `getInstitutionBranchIndex` (≤ 5 × 100, sorted by name) with `parentsNote` when it failed or
   was capped, defaults the timezone to the institution's (UTC when `Intl` rejects it), and sends
   no address (BG-13). A 403 reads `BRANCH_CREATE_REFUSED`; a 409 reads `BRANCH_CREATE_CONFLICT` with
   `BRANCH_CODE_MAY_BE_TAKEN` on the code field. Success redirects to the draft's record. Cost: half a
   day for B.
9. **KPI arithmetic and reads** (Q5, A, confirmed). Five reads in parallel: `status=ACTIVE&size=1`,
   `status=PENDING_APPROVAL&size=5` (`createdAt ASC`), `status=DRAFT&size=5` (`createdAt ASC`),
   `status=SUSPENDED&size=1` (all with `tenant.view`), and the platform organisation's users with
   `user_status=ACTIVE&membership_status=ACTIVE&size=1` (with `user.view`). Active institutions =
   `activeInstitutionCount(total)` = `max(0, total − 1)` (the platform organisation is always ACTIVE
   in a working platform context, contract §A, so it is in that count exactly once and in no other).
   Pending approval and Drafts read the preview reads' `totalItems`. A tile is hidden only without
   its view code; a failed read shows `KPI_UNAVAILABLE` with its reference; neither code → the page
   shows `ForbiddenState`. Cost: one filter.
10. **Needs attention** (Q6, A, confirmed). `attentionView(pending, drafts, isPlatformOrganisation)`:
    pending rows, then draft rows (oldest first, ≤ 5 each; the platform organisation filtered out);
    a named failure per failed read (with its reference); "View all N …" links when a total exceeds
    what is shown; an empty state only for what is known (truth table in Task 1). AGENTS.md names
    the preview as a sixth paging exception (Task 9c). Cost: one sort value (B).
11. **Notifications badge** (Q7, A, confirmed). `PlatformNotifications` = `Suspense` around
    `PendingInstitutionsNotifications`, which returns `null` unless the context is resolved in the
    platform workspace and the holder has `tenant.approve` and `tenant.view` — before any read — then
    reads `countTenantsInStatus('PENDING_APPROVAL')` through `load()` (a lost session or a stale
    context redirects, rule 21; any other failure → `null` count, never 0) and renders
    `NotificationsMenu` with `pendingApprovalNotifications(count)`. The bell shows a `primary` badge
    above 0; its accessible name carries the count or the failure; its entry links to
    `PENDING_HREF`, the same oldest-first list as the Pending approval tile. Cost: one branch (B, C).
12. **`KpiTile`** (spec §9) is a Server-Component-safe kit file: `role="group"` named by its label;
    the value (`Intl.NumberFormat('en-GB')`, tabular numerals) or `KPI_UNAVAILABLE` + reference; a
    caption; an optional link with a unique name; an icon in a soft-tone square built from existing
    tokens (`status.<tone>Bg` + `<tone>.main`). Cost: none (new file).
13. **UTC** everywhere in the platform workspace: list headers "Created (UTC)", record facts
    "Created (UTC)"/"Updated (UTC)" as `formatInstant(iso, 'UTC')` → `date · time`. Cost: none.
14. **Fake API** (Q11, A, confirmed). `routes/platform-records.mts` (the eight endpoints above); the
    `/branches` list, `/tenant/users` list and branch detail/create logic are **extracted** from
    `tenant-reads.mts` and `branches.mts` into exported helpers (behaviour unchanged) and reused;
    scenarios `platform-records` (16's `platformTenantsScenario()` + 17's seeds + four mutation
    codes) and `platform-records-read-only`; `contextFor` gains an optional `organisationId`. The
    BG-18 check runs inside `sendIdempotent`'s producer, so a refused key stores nothing. Cost: a
    scenario rewrite (B).
15. **Carry-ins from 16's triage** (Q9, A, confirmed). Task 1 adds `countryLabel` ("KE · Kenya"; Task 7
    uses it regardless); Task 4c's `fix(platform)` commit puts it on the Overview, the record hero's
    subtitle (`acme · KE · Kenya`: the tenant code, then the country as the Overview writes it) and
    the directory, and adds `bootstrapStatusLabel` and one line under the failure code; Task 3's
    last commit (droppable) pins two of 16's fake-API quirks (the creator-only arm stays deferred).
    `checkInitialSettings` typing (16's final review: it types only `audit_retention_days`) stays
    deferred: it is unreachable, because the wizard sends only picker-validated values. Cost:
    dropping a commit.
16. **Docs** (Task 9c): README (tree, modules, kit, shell, the platform bullet and its limits,
    "Beyond", next steps); AGENTS.md's sixth named paging exception; `docs/backend-gaps.md` BG-10,
    BG-15, BG-18, BG-22, BG-29 handling and BG-35 widened.
17. **Copy is the plan's.** Every user-visible string below is final; an implementer who finds one
    missing reports NEEDS_CONTEXT instead of inventing it.

## Approved additions (the user said yes on 2026-10-04)

Two changes outside 17's own scope that rule 21 points at. The user approved both with the plan;
both are in the task list, each at the place it names.

**P-1. 08's `getBranchMaker` swallows a lost session.** `getBranchMaker`
(`modules/administration/branches/branch-service.ts:47-62` at `3320518`) still wraps its audit
read in `try { … } catch { return null }`: the blanket catch layer 10's Codex round 1 found in
`getUserInviter` (PR #57) and layer 10 has since removed. A 401 or an
`invalid_active_tenant_context` during the drafter lookup becomes `null`, so `load()` never
redirects, and 08's branch record (`app/(authenticated)/admin/branches/[branchId]/layout.tsx:75-79`)
renders a stale page with Activate on offer.

- Rationale: rule 21(a). 17 already edits 08's branch module (Task 4a) and its platform branch
  record mirrors 08's record. The model is in the repo: `getUserInviter` rejects on every read
  failure (`modules/administration/users/user-service.ts:90-107`), and 10's user record settles it
  with `load()` and says in a comment what an ordinary failure means
  (`app/(authenticated)/admin/users/[userId]/layout.tsx:70-77`).
- The change: `getBranchMaker` stops catching (every read failure rejects; its doc comment says
  so), and the layout settles it with `load()`:
  `const makerRead = <today's gate> ? await load(getBranchMaker(branchId)) : null;`
  `const maker = makerRead?.ok ? makerRead.value : null;`, with a one-line comment: any other
  failure leaves the drafter unknown and Activate on offer, and the backend's maker-checker 403 is
  the guard. Tests, mirroring 10's: `branch-service.test.ts`'s "reads the drafter from the
  branch.create_draft audit event, or null (BG-08)" turns its failure row into an `it.each` that
  rejects with the read's own error on a 401, a stale context and a 5xx (as
  `user-service.test.ts`'s "rejects with the audit read's own error on %s"); a new
  `app/(authenticated)/admin/branches/[branchId]/layout.test.tsx` (08's record layout has none),
  on the harness of 10's `admin/users/[userId]/layout.test.tsx` (its mocked `redirect`): a 401
  redirects to `/login?reason=session_expired` and a stale context to `/select-context`, rendering
  nothing, and a 403 or a 5xx renders the record with Activate enabled (as its "redirects,
  rendering nothing, when the inviter read fails with %s" and "renders the record, with Approve on
  offer, when the inviter read fails with %s"). Mutation
  proof: put the catch back (the 401 row fails).
- Cost if wrong: left alone, a session that expires between the branch read and the drafter read
  shows a stale record whose Activate the backend then refuses (no data harm). Doing it costs about
  an hour (two files changed, one test changed, one test file new).
- Decision: yes (approved).
- Where: Task 4c Step 3, as its own commit D after commit C,
  `fix(branches): let a lost session reach load() from the drafter lookup` (a sixteenth commit
  block; not droppable, unlike C); "Files 17 never touches" gains these exceptions:
  `modules/administration/branches/branch-service.ts(+test)` and
  `app/(authenticated)/admin/branches/[branchId]/layout.tsx` (+ its new test).

**P-2. Directory tables whose scroll container isn't a keyboard region.** Layer 10 made
`UserDirectoryTable`'s container a region after Codex flagged it (PR #57). Read at `3320518`,
each of these overflows horizontally at 375 px (a `minWidth` on its `Table`) and has no region:

- `modules/administration/branches/components/branch-directory-table.tsx`: `minWidth: 760`;
  every header is a sort link, so Tab reaches every column today, unannounced.
- `modules/administration/audit/components/audit-event-table.tsx`: `minWidth: 900`; only the first
  two columns hold links (the time, the actor), so Action to Severity are pointer-only at 375 px.
- `modules/administration/roles/components/role-directory-table.tsx`: `minWidth: 640`; sort links
  on Role, Code and Status (Type is plain), so Tab reaches the last column.
- `modules/platform-administration/tenants/components/tenant-directory-table.tsx`:
  `minWidth: 760`; sort links on all but Lifecycle, the last being Created (UTC).
- Not in the four above, read too: 08's `branch-users-table.tsx`, `minWidth: 560`, no region;
  without `canRevoke` it holds no focusable element at all, which axe's
  `scrollable-region-focusable` flags at 375 px.

- Rationale: rule 21(c). Of these, 17 renders only `BranchDirectoryTable` (the Branches tab).
- The change: in Task 4a's commit A,
  `<TableContainer tabIndex={0} role="region" aria-label="Branches table" sx={…}>` with the comment
  of 10's `UserDirectoryTable` (`user-directory-table.tsx:33-35`, "Not 'Users': the table keeps
  that name…"). The name is unique on both pages that render the table: `/admin/branches` (the
  `h1` "Branches", no section landmark) and the platform Branches tab (the section "Branches", the
  navigation "<institution> sections"). Tests: `branch-directory-table.test.tsx` mirrors
  `user-directory-table.test.tsx`'s "holds the table in a named, keyboard-focusable region…" (the
  region "Branches table" with `tabindex="0"`, the table "Branches" inside it, no region named
  "Branches" from the table); Task 9b's matrix then asserts one region "Branches table" on the tab;
  mutation proof: drop `tabIndex`. 08's markup changes (one wrapper's attributes), so
  `e2e/branches.spec.ts` and its axe cases run again in 4a; commit A's body then also names "the
  table's keyboard region".
- Cost if wrong: left alone, a keyboard user at 375 px scrolls the Branches tab only by focusing
  header links; done with a clashing name, axe would not fail (it rates `landmark-unique`
  moderate), so the region-count assertion is what catches it. Doing it costs about 15 minutes.
- Decision: yes (approved), for `BranchDirectoryTable` only. The audit, roles and tenant tables (and the branch
  users table) stay with their own layers; the layer-17 PR description lists them.
- Where: Task 4a Step 1, commit A.

## Review Focus

The five input classes most likely to hurt an operator using this layer, each pinned by named tests:

1. **An account action with a bigger blast radius than it looks.** Suspend and Deactivate act on the
   person in every institution; Deactivate can't be undone; your own account must be out of reach.
   [Task 1 `account-rules.test.ts` "offers each status its actions" (all ten statuses) and "blocks
   Suspend and Deactivate on your own account only"; Task 2 `account-actions.test.ts` "refuses your
   own account before any call" and "refuses a username that doesn't match, before any call";
   Task 5 `account-lifecycle-actions.test.tsx` (every-institution copy, the `alertdialog`, the
   typed-back field, `expectScoped`, the key reused on retry); Task 9a e2e "suspends an account in
   every institution, then reactivates it", "deactivates an account only with its username typed
   back", "disables Suspend and Deactivate on your own account".]
2. **Counts that lie.** The active count holds the platform organisation exactly once; a failed
   read is never 0 or "nothing needs attention"; the badge never reads "none" after a failure.
   [Task 1 `overview-rules.test.ts` "subtracts the platform organisation exactly once" and the
   `attentionView` truth table; Task 7 `page.test.tsx` "shows each tile's failure on its own";
   Task 8 `platform-notifications.test.tsx` "says the count couldn't be loaded instead of none";
   Task 9a e2e "counts institutions by lifecycle, leaving out the platform organisation".]
3. **Ids, cases and the platform organisation.** Malformed, unknown, other-institution and
   platform-organisation ids show the not-found page without a backend read; upper-case ids read
   lower-cased; the platform organisation's members are reachable only as platform users.
   [Tasks 4b–6 `records-id-guard.test.tsx`; Task 9a e2e "answers unknown, malformed and
   platform-organisation ids with the not-found page" and "canonicalises mixed-case ids".]
4. **Permission, context and BG-18 gating.** Tabs only with their view code; create only for an
   ACTIVE institution with both codes, with the warning, and the 403 explained; no account action
   without its code; the badge only with `tenant.approve` and `tenant.view`; nothing read outside the
   platform workspace. [Task 1 `institution-branch-rules.test.ts`; Task 2
   `institution-branch-actions.test.ts` "explains the BG-18 refusal"; Task 4a `new/page.test.tsx`;
   Task 4b `(record)/layout.test.tsx` (the tabs by code) and `(record)/branches/page.test.tsx`;
   Task 8 "reads nothing outside the platform workspace"; Task 9a e2e "explains the platform's
   refusal where you aren't a member", "offers no branch draft for an institution that isn't
   active", "hides what a read-only role can't do".]
5. **Retry, double submit and a stale tab.** Every dialog and the create form send the minted key
   and `contextOrganisationId`; a refused submit keeps the typed values and the key. [Task 2 "refuses
   a submit after an organisation switch" (real `runServerAction`); Task 4a `branch-draft-form.test.tsx`
   "submits through a passed action with its hidden fields, the key and the organisation"; Task 5
   "keeps the typed reason and the key after a refused suspend".]

Also pinned: 100-character names (an account, a branch) at 375 px never scroll the page (Task 9b's
axe matrix), and the Branches tab cuts the 100-character Likoni name inside the card (Task 4a's
`nameMaxWidth` test, Task 9a test 1's 375 px width check); the hero's actions box stays capped at
320 px at 1280 px (Task 9a test 9); UTC labels and values (Task 4b `[branchId]/page.test.tsx`,
Task 9a "opens a branch read-only, in UTC").

**Layer 10's Codex round 1 lessons (rule 21), checked against this plan's code:**

- (a) No blanket catch. Every read helper rejects: `getInstitutionBranch`,
  `getInstitutionBranchIndex` (it rejects on any failed page), `listInstitutionBranches`,
  `listInstitutionUsers`, `getInstitutionUser`, `listTenantsInStatus`, `countTenantsInStatus`,
  `countPlatformOperators`. Every page settles them with `load()` (the overview's five reads, both
  tabs, both records, the draft page, Platform users). The bell settles its count through `load()`
  too, as 10's user record settles `getUserInviter`: a 401 or a stale context redirects, and any
  other failure reads "couldn't be loaded" (Task 8, tests 4 and 6). `refuseOwnAccount`'s profile
  read runs inside `runServerAction`'s `try`, so a lost session still redirects there. 08's
  `getBranchMaker` still blanket-catches: P-1 above.
- (b) Capped sets say so. 17's one picker is the draft form's parent picker: its index stops at
  500 and says so (`PARENTS_PARTIAL`, as `rolesCappedHint` does for 10's role picker), and a
  parent missing from a capped or failed index shows its short id, never a wrong name. Tasks 5 and
  6 add no picker (their filters are fixed enums) and read no capped index; nothing in 17 reuses
  the role index. The overview counts come from `totalItems` (no scan), and the Needs attention
  preview links to "View all N" when a status holds more than five.
- (c) Scroll containers. `AttentionCard`'s table (`minWidth: 640`) gets the region "Needs attention
  table" (the section is "Needs attention", Task 7). The Users tab and Platform users render 10's
  `UserDirectoryTable`, whose container is the region "Users table" on the base (Task 5 Step 1
  keeps it; the tab's section is "Users", so the landmark names differ). The Branches tab renders
  08's `BranchDirectoryTable` (`minWidth: 760`), which has no region: every one of its headers is
  a sort link, so the keyboard reaches each column today, but the region itself is P-2 above
  (approved). Because axe rates `landmark-unique` moderate, Task 9b's matrix asserts
  each region's count on the overview, the Users tab and the Branches tab. The branch and user
  records hold description lists, not tables.

---

## Pre-flight notes (the workflow's pre-flight phase; not a task)

Implementers never execute this section. The controller checks it against the tip before Task 1;
every line number below was checked at `3320518`.

1. **Base.** `git log --oneline -1` shows `3320518` (or a later controller commit); `git status --short`
   is empty (it is at `3320518`). That tip carries layer 10's Codex round 1 fixes (rule 21's
   models): `getUserInviter` rejects and its layout settles it with `load()`, `getRoleIndexScan`
   and `rolesCappedHint`, and `UserDirectoryTable`'s region "Users table".
2. **Consumed names exist** (one grep each): `isInstitutionId` `tenants/institution-id.ts:12`;
   `getTenant`, `listTenants` `tenants/tenant-service.ts:15,9`; `countryName` `tenants/tenant-rules.ts:168`;
   `BOOTSTRAP_STATUSES` `tenants/tenant-contract.ts:20`; `userSummarySchema`, `userPageSchema`
   `administration/users/user-contract.ts:28,48`; `parseUserListQuery`, `hasUserFilters`
   `user-query.ts:22,35`; `userStatusLabel`, `onboardingState`, `parseUserId` `user-rules.ts:41,46,409`;
   `branchPageSchema`, `branchDetailSchema`, `branchDraftResultSchema` `branches/branch-contract.ts:51,55,88`;
   `parseBranchListQuery` `branch-query.ts:24`; `branchTypeLabel`, `isTimeZone`, `branchDraftSchema`
   `branch-rules.ts:67,71,82`; `focusRecordTitle`; `explain`; `runServerAction`; `BackendApiError`.
3. **The old platform code is unused:** `grep -rn "platform-administration-service\|platform-administration-mappers\|platform-administration-queries\|platform-administration.types" app components modules lib`
   prints only the four root files and their tests; `PlatformPageShell` is imported only by
   `app/(authenticated)/platform-admin/page.tsx`.
4. **Seeds free:** `grep -rn "17000000-" e2e` prints nothing; `BUILDERS` ends with
   `'users-many-assignments'`.
5. **Kit and shell shape:** no `KpiTile` anywhere; `platform-notifications.tsx` is the four-line
   stub; `RecordTabs`' `activeTab` keeps a sub-route's tab (`record-tabs.tsx:25-33`).
6. **Next.js guides** to read before Tasks 4–8 (`node_modules/next/dist/docs/01-app/`):
   `03-api-reference/03-file-conventions/route-groups.md`, `layout.md`, `not-found.md`,
   `dynamic-routes.md`, and `02-guides/server-actions.md`.
7. **Docs anchors** for Task 9c: README `:158-162` (platform-admin tree), `:223-226` (modules),
   `:237-244` (data-display), `:247-250` (shell), `:469-488` (the platform bullet), `:489-493`
   ("Beyond"), `:506-507` (next step 3); AGENTS.md's fifth exception ends at `:105` (it now also
   names the Assign-role drawer's options); gaps BG-10 `:202`, BG-15 `:256`, BG-18 `:289`, BG-22
   `:313`, BG-29 `:362`, BG-35 `:56` (summary row) and `:422`.
8. **Affected E2E per task** (form E): Task 3 `e2e/fake-api-platform-records.spec.ts
e2e/fake-api.spec.ts e2e/fake-api-branches.spec.ts e2e/fake-api-users.spec.ts` (and
   `e2e/fake-api-platform-tenants.spec.ts` for its droppable commit); Task 4a `e2e/branches.spec.ts`;
   Task 4b `e2e/platform-tenants.spec.ts e2e/platform-administration.spec.ts`; Task 4c
   `e2e/platform-tenants.spec.ts e2e/platform-administration.spec.ts`; Task 5 `e2e/users.spec.ts
--grep "users: directory and lifecycle"` and `e2e/platform-tenants.spec.ts`; Task 6
   `e2e/shell.spec.ts`; Task 7 `e2e/shell.spec.ts e2e/context.spec.ts
e2e/platform-administration.spec.ts`; Task 8 `e2e/shell.spec.ts e2e/platform-tenants.spec.ts
e2e/context.spec.ts`; Task 9a `e2e/platform-records.spec.ts` in three chunks; Task 9b the same
   spec in two chunks (light, dark).
9. **Route-group segment sharing: resolved.** Rule 1 puts `branches`/`users` folders both inside
   `(record)` and under `[tenantId]/`; they resolve to different URLs (route-groups.md,
   "Conflicting paths"). Placeholder pages for all seven new routes, built in a throwaway worktree
   at `334efd2` (layer 10's fixes since touch no route here): `next build` (16.3.7, Turbopack)
   exited 0 and its `app-paths-manifest.json` puts the two tabs inside `(record)` and the three
   records/forms outside it. A route conflict in Task 4b's run would now be a regression: STOP and
   report. Two MUI 9.4.0 claims the plan relies on are verified: `Popover`'s `slotProps.paper`
   takes `role` and `aria-labelledby` (`Popover.d.ts:45-48`; `app-switcher.tsx:257-259` already
   type-checks it), and an Autocomplete's helper text is its combobox's accessible description
   (`TextField` → `aria-describedby` on the native input, which is the `role="combobox"` element).

---

### Task 1: Ids, queries, account rules and the overview arithmetic

Pure, client-safe modules (except `institution-id.ts`, server-only as today) and their tests. No UI,
no backend call.

**Files:**

- Modify: `modules/platform-administration/tenants/institution-id.ts` (+ `parseInstitutionId`) and
  `institution-id.test.ts`
- Modify: `modules/platform-administration/tenants/tenant-rules.ts` (+ `countryLabel`) and
  `tenant-rules.test.ts`
- Create: `modules/platform-administration/branches/institution-branch-query.ts`, `…-query.test.ts`
- Create: `modules/platform-administration/branches/institution-branch-rules.ts`, `…-rules.test.ts`
- Create: `modules/platform-administration/users/institution-user-query.ts`, `…-query.test.ts`
- Create: `modules/platform-administration/users/account-rules.ts`, `account-rules.test.ts`
- Create: `modules/platform-administration/overview/overview-rules.ts`, `overview-rules.test.ts`
- Create: `components/shell/notifications-menu.tsx` (the exported types only; Task 8 fills in the
  component)

**Interfaces:**

- Consumes: `isInstitutionId`; `countryName`; `TenantStatus`, `TenantSummary`; `BranchListQuery`;
  `UserListQuery`; `USER_STATUSES`, `UserStatus`, `MembershipStatus`; `userStatusLabel`;
  `sortQuery`; `toQueryString`; `UUID_PATTERN`, `type Page`; `can`, `canAll`, `canAny`,
  `type PermissionHolder`; `humanizeEnum`.
- Produces (★ = consumed by a later layer):
  - ★ `parseInstitutionId(param: string): string | null`; ★ `countryLabel(code: string): string`;
  - `institutionBranchListApiPath(tenantId, query: BranchListQuery): string`,
    `institutionBranchesHref(tenantId): string`;
  - `parseBranchId(param): string | null`, `BRANCH_CREATE_CODES`, `BRANCH_INDEX_CEILING = 500`,
    `canCreateInstitutionBranch(status, holder): boolean`, `parentsNote(index): string | undefined`,
    copy `BRANCHES_DESCRIPTION`, `BRANCH_DETAIL_DESCRIPTION`, `branchCreateDescription(name)`,
    `branchCreateWarning(name)`, `BRANCH_CREATE_REFUSED`, `BRANCH_CREATE_CONFLICT`,
    `BRANCH_CODE_MAY_BE_TAKEN`, `BRANCH_CREATE_INACTIVE`, `PARENTS_UNAVAILABLE`, `PARENTS_PARTIAL`;
  - `institutionUserListApiPath(tenantId, query: UserListQuery): string`,
    `institutionUsersHref(tenantId): string`, `PLATFORM_USERS_HREF`;
  - `type AccountAction`, `availableAccountActions(status, holder)`,
    `blockedAccountActions(actions, { self })`, `accountActionsNote(status, holder)`,
    `type AccountScope`, `accountScopeNote(scope)`, `accountChipLabel(status)`,
    `membershipChipLabel(status)`, copy `OWN_ACCOUNT`, `OWN_ACCOUNT_CODE`, `ACCOUNT_CHANGED`,
    `ACCOUNT_DEACTIVATED_NOTE`, `ACCOUNT_NOT_ACTIONABLE_NOTE`, `CONFIRM_USERNAME_MISMATCH`,
    `INSTITUTION_USERS_DESCRIPTION`, `PLATFORM_USERS_DESCRIPTION`;
  - `ATTENTION_PREVIEW_SIZE = 5`, `activeInstitutionCount(total)`, `type AttentionRead`,
    `interface AttentionView`, `attentionView(pending, drafts, isPlatform)`, `PENDING_HREF`,
    `DRAFTS_HREF`, `KPI`, `OVERVIEW_DESCRIPTION`, `ATTENTION_DESCRIPTION`,
    `pendingApprovalNotifications(count)`.

- [ ] **Step 1: Write the failing tests.**

`institution-id.test.ts` — append (the file's lettered `PLATFORM` and `INSTITUTION` constants stay):

```ts
const { parseInstitutionId } = await import('./institution-id');

describe('parseInstitutionId', () => {
  it('answers an institution id in lower case', () => {
    expect(parseInstitutionId(INSTITUTION.toUpperCase())).toBe(INSTITUTION);
    expect(parseInstitutionId(INSTITUTION)).toBe(INSTITUTION);
  });

  it.each([
    ['the platform organisation', PLATFORM],
    ['the platform organisation in upper case', PLATFORM.toUpperCase()],
    ['a malformed id', 'pwani-fishermen'],
    ['a path-like id', '../x'],
    ['an empty id', ''],
  ])('answers null for %s', (_case, id) => {
    expect(parseInstitutionId(id)).toBeNull();
  });
});
```

(Merge the two `await import` lines into one destructuring:
`const { isInstitutionId, parseInstitutionId } = await import('./institution-id');`.)

`tenant-rules.test.ts` — add:

```ts
it('writes a country as its code, then its name, like a currency', () => {
  expect(countryLabel('KE')).toBe('KE · Kenya');
  expect(countryLabel('UG')).toBe('UG · Uganda');
});
```

`institution-branch-query.test.ts` (`ID = '17000000-0000-4000-8000-0000000000ac'`):

```ts
it("lists an institution's branches with the /branches filters and sort, scoped by the path", () => {
  const query = parseBranchListQuery(
    new URLSearchParams(
      'q=  road  &status=SUSPENDED&type=OPERATIONS&sortBy=branchCode&sortDir=asc&page=2&size=20',
    ),
  );
  expect(institutionBranchListApiPath(ID, query)).toBe(
    `/api/v1/platform/tenants/${ID}/branches?q=road&status=SUSPENDED&type=OPERATIONS&sort_by=branchCode&sort_dir=ASC&page=2&size=20`,
  );
});

it('never sends an off-list sort or an unknown status (an unknown sort_by is a backend 500)', () => {
  const query = parseBranchListQuery(new URLSearchParams('sortBy=toString&status=BOGUS'));
  expect(institutionBranchListApiPath(ID, query)).toBe(
    `/api/v1/platform/tenants/${ID}/branches?sort_by=createdAt&sort_dir=DESC&page=0&size=10`,
  );
});

it("builds the tab's path", () => {
  expect(institutionBranchesHref(ID)).toBe(`/platform-admin/tenants/${ID}/branches`);
});
```

`institution-user-query.test.ts`:

```ts
it("lists an institution's users with the user filters and no sort (newest first)", () => {
  const query = parseUserListQuery(
    new URLSearchParams(
      'q=mensah&userStatus=SUSPENDED&membershipStatus=ACTIVE&sortBy=username&page=1',
    ),
  );
  expect(institutionUserListApiPath(ID, query)).toBe(
    `/api/v1/platform/tenants/${ID}/users?q=mensah&user_status=SUSPENDED&membership_status=ACTIVE&page=1&size=10`,
  );
});

it('builds the paths of the Users tab and the platform users page', () => {
  expect(institutionUsersHref(ID)).toBe(`/platform-admin/tenants/${ID}/users`);
  expect(PLATFORM_USERS_HREF).toBe('/platform-admin/users');
});
```

`institution-branch-rules.test.ts`:

```ts
const BOTH = { permissions: ['branch.create', 'branch.view'] };

it('lower-cases a branch id and refuses anything else', () => {
  expect(parseBranchId('17000000-0000-4000-8000-0000000000B2')).toBe(
    '17000000-0000-4000-8000-0000000000b2',
  );
  for (const param of ['not-a-uuid', '../x', '', '17000000-0000-4000-8000-0000000000b2x']) {
    expect(parseBranchId(param)).toBeNull();
  }
});

it.each(TENANT_STATUSES.map((status) => [status, status === 'ACTIVE'] as const))(
  'offers a branch draft for a %s institution: %s',
  (status, offered) => {
    expect(canCreateInstitutionBranch(status, BOTH)).toBe(offered);
  },
);

it('needs both branch.create and branch.view (the redirect reads the draft back)', () => {
  expect(canCreateInstitutionBranch('ACTIVE', { permissions: ['branch.create'] })).toBe(false);
  expect(canCreateInstitutionBranch('ACTIVE', { permissions: ['branch.view'] })).toBe(false);
});

it('says why the parent picker is incomplete, never that there are no branches', () => {
  expect(parentsNote({ ok: false })).toBe(PARENTS_UNAVAILABLE);
  expect(parentsNote({ ok: true, truncated: true })).toBe(PARENTS_PARTIAL);
  expect(parentsNote({ ok: true, truncated: false })).toBeUndefined();
  expect(PARENTS_PARTIAL).toBe('Optional. Only the first 500 branches are listed.');
});

it('names the institution in the BG-18 warning and the create description', () => {
  expect(branchCreateWarning('Acme SACCO')).toBe(
    "You can create a branch here only if you're also an active member of Acme SACCO, with a role there that allows creating branches. Otherwise the platform refuses it.",
  );
  expect(branchCreateDescription('Acme SACCO')).toBe(
    'The draft is created in Acme SACCO. Its own administrators then submit it and activate it.',
  );
});
```

`account-rules.test.ts`:

```ts
const ALL = { permissions: ['user.view', 'user.suspend', 'user.activate', 'user.deactivate'] };
const EXPECTED: Record<UserStatus, AccountAction[]> = {
  DRAFT: [],
  PENDING_APPROVAL: [],
  PROVISIONING_IDP: [],
  INVITED: [],
  ACTIVE: ['suspend', 'deactivate'],
  SUSPENDED: ['reactivate'],
  LOCKED: [],
  DEACTIVATING: [],
  DEACTIVATED: [],
  ARCHIVED: [],
};

it.each(USER_STATUSES.map((status) => [status, EXPECTED[status]] as const))(
  'offers each status its actions: %s → %j',
  (status, expected) => {
    expect(availableAccountActions(status, ALL)).toEqual(expected);
  },
);

it("needs each action's own code", () => {
  expect(availableAccountActions('ACTIVE', { permissions: ['user.suspend'] })).toEqual(['suspend']);
  expect(availableAccountActions('ACTIVE', { permissions: ['user.deactivate'] })).toEqual([
    'deactivate',
  ]);
  expect(availableAccountActions('ACTIVE', { permissions: ['user.activate'] })).toEqual([]);
  expect(
    availableAccountActions('SUSPENDED', { permissions: ['user.suspend', 'user.deactivate'] }),
  ).toEqual([]);
  expect(availableAccountActions('SUSPENDED', { permissions: ['user.activate'] })).toEqual([
    'reactivate',
  ]);
  expect(availableAccountActions('ACTIVE', { permissions: ['user.view'] })).toEqual([]);
});

it('blocks Suspend and Deactivate on your own account only', () => {
  expect(blockedAccountActions(['suspend', 'deactivate'], { self: true })).toEqual({
    suspend: OWN_ACCOUNT,
    deactivate: OWN_ACCOUNT,
  });
  expect(blockedAccountActions(['suspend', 'deactivate'], { self: false })).toEqual({});
  // Reactivate never needs it (a suspended account can't be signed in), and only offered actions
  // get a caption.
  expect(blockedAccountActions(['reactivate'], { self: true })).toEqual({});
  expect(blockedAccountActions(['deactivate'], { self: true })).toEqual({
    deactivate: OWN_ACCOUNT,
  });
});

it.each([
  ['DEACTIVATED', ACCOUNT_DEACTIVATED_NOTE],
  ['INVITED', ACCOUNT_NOT_ACTIONABLE_NOTE],
  ['PROVISIONING_IDP', ACCOUNT_NOT_ACTIONABLE_NOTE],
  ['LOCKED', ACCOUNT_NOT_ACTIONABLE_NOTE],
  ['ACTIVE', null],
  ['SUSPENDED', null],
] as const)('explains a %s account with no action: %j', (status, note) => {
  expect(accountActionsNote(status, ALL)).toBe(note);
});

it('says nothing to a holder without any account code', () => {
  expect(accountActionsNote('DEACTIVATED', { permissions: ['user.view'] })).toBeNull();
});

it('words the hero chips and the scope notes', () => {
  expect(accountChipLabel('PROVISIONING_IDP')).toBe('Account provisioning identity');
  expect(accountChipLabel('SUSPENDED')).toBe('Account suspended');
  expect(membershipChipLabel('PENDING_APPROVAL')).toBe('Membership pending approval');
  expect(accountScopeNote('institution')).toContain('in every institution they belong to');
  expect(accountScopeNote('institution')).toContain("this institution's own administrators");
  expect(accountScopeNote('platform')).toContain('in every institution they belong to');
});
```

`overview-rules.test.ts`:

```ts
const PLATFORM = '00000000-0000-0000-0000-000000000000';
const isPlatform = (id: string) => id === PLATFORM;
const tenant = (
  id: string,
  displayName: string,
  status: TenantSummary['status'],
): TenantSummary => ({
  id,
  tenantCode: displayName.toLowerCase().replace(/\s+/g, '-'),
  displayName,
  countryCode: 'KE',
  status,
  createdAt: '2026-09-03T08:00:00Z',
});
const page = (items: TenantSummary[], totalItems = items.length): AttentionRead => ({
  ok: true,
  value: {
    items,
    page: {
      number: 0,
      size: 5,
      totalItems,
      totalPages: Math.ceil(totalItems / 5),
      hasNext: totalItems > 5,
      hasPrevious: false,
    },
  },
});
const failed = (requestId: string | null): AttentionRead => ({ ok: false, problem: { requestId } });
const MWANGAZA = tenant(
  '16000000-0000-4000-8000-000000000003',
  'Mwangaza Savings SACCO',
  'PENDING_APPROVAL',
);
const UMOJA = tenant('16000000-0000-4000-8000-000000000001', 'Umoja Teachers SACCO', 'DRAFT');

describe('activeInstitutionCount', () => {
  it.each([
    [3, 2],
    [1, 0],
    [0, 0],
  ])('subtracts the platform organisation exactly once: %i → %i', (total, expected) => {
    expect(activeInstitutionCount(total)).toBe(expected);
  });
});

describe('attentionView', () => {
  it('lists pending rows, then drafts, with no failure and no empty state', () => {
    const view = attentionView(page([MWANGAZA]), page([UMOJA]), isPlatform);
    expect(view.rows.map((row) => row.displayName)).toEqual([
      'Mwangaza Savings SACCO',
      'Umoja Teachers SACCO',
    ]);
    expect(view).toMatchObject({ failures: [], more: [], empty: null });
  });

  it('never lists the platform organisation', () => {
    const platformRow = tenant(PLATFORM, 'Platform', 'PENDING_APPROVAL');
    expect(attentionView(page([platformRow, MWANGAZA]), page([]), isPlatform).rows).toEqual([
      MWANGAZA,
    ]);
  });

  it('links to the rest of each list when it holds more than the preview', () => {
    const view = attentionView(page([MWANGAZA], 7), page([UMOJA], 6), isPlatform);
    expect(view.more).toEqual([
      { href: PENDING_HREF, label: 'View all 7 institutions pending approval' },
      { href: DRAFTS_HREF, label: 'View all 6 drafts' },
    ]);
  });

  it('names each failed read with its reference, and keeps the other half', () => {
    const view = attentionView(failed('req-1'), page([UMOJA]), isPlatform);
    expect(view.failures).toEqual([
      "Institutions pending approval couldn't be loaded. Reference: req-1",
    ]);
    expect(view.rows).toEqual([UMOJA]);
    expect(view.empty).toBeNull();
    expect(attentionView(page([]), failed(null), isPlatform).failures).toEqual([
      "Drafts couldn't be loaded.",
    ]);
  });

  it.each([
    [
      'both empty',
      page([]),
      page([]),
      {
        title: 'Nothing needs attention',
        description: 'No institution is waiting for approval, and there are no drafts.',
      },
    ],
    [
      'no pending, drafts failed',
      page([]),
      failed('req-2'),
      { title: 'No institution is waiting for approval' },
    ],
    ['pending failed, no drafts', failed('req-3'), page([]), { title: 'There are no drafts' }],
    ['both failed', failed('req-4'), failed('req-5'), null],
  ] as const)(
    'claims only what it knows when nothing is listed (%s)',
    (_case, pending, drafts, empty) => {
      expect(attentionView(pending, drafts, isPlatform).empty).toEqual(empty);
    },
  );

  it('points the links at the filtered directory, oldest first', () => {
    const pending = new URL(PENDING_HREF, 'http://x').searchParams;
    expect([pending.get('status'), pending.get('sortBy'), pending.get('sortDir')]).toEqual([
      'PENDING_APPROVAL',
      'createdAt',
      'ASC',
    ]);
    expect(new URL(DRAFTS_HREF, 'http://x').searchParams.get('status')).toBe('DRAFT');
  });
});

describe('pendingApprovalNotifications', () => {
  it('counts institutions waiting for approval, with a link to them', () => {
    expect(pendingApprovalNotifications(2)).toEqual({
      label: 'Notifications: 2 institutions waiting for approval',
      total: 2,
      entries: [
        {
          id: 'pending-institutions',
          text: '2 institutions are waiting for approval.',
          href: PENDING_HREF,
          linkLabel: 'Review pending institutions',
        },
      ],
      emptyText: 'No institutions are waiting for approval.',
      unavailableText: "Pending approvals couldn't be loaded. Refresh to try again.",
    });
    expect(pendingApprovalNotifications(1).entries[0]?.text).toBe(
      '1 institution is waiting for approval.',
    );
    expect(pendingApprovalNotifications(1).label).toBe(
      'Notifications: 1 institution waiting for approval',
    );
  });

  it('reads none at zero, and never none after a failed read', () => {
    expect(pendingApprovalNotifications(0)).toMatchObject({
      label: 'Notifications: nothing waiting',
      total: 0,
      entries: [],
    });
    expect(pendingApprovalNotifications(null)).toMatchObject({
      label: "Notifications (couldn't be loaded)",
      total: null,
      entries: [],
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail** — form U on the seven test files. Expected: FAIL (the
      new modules and exports don't exist).

- [ ] **Step 3: Implement.**

`institution-id.ts` — append:

```ts
/** A route's institution id, lower-cased (contract §A uuid), or null: the page shows not-found
 * before any read (rule 7). The new layer-17 routes use it; 16's four routes keep isInstitutionId. */
export function parseInstitutionId(param: string): string | null {
  return isInstitutionId(param) ? param.toLowerCase() : null;
}
```

`tenant-rules.ts` — after `countryName`:

```ts
/** `KE · Kenya`: the code first, like a currency (`KES · Kenyan Shilling`). */
export function countryLabel(code: string): string {
  return `${code} · ${countryName(code)}`;
}
```

`branches/institution-branch-query.ts`:

```ts
import { sortQuery } from '@/lib/api/list-sort';
import { toQueryString } from '@/lib/api/query-string';
import type { BranchListQuery } from '@/modules/administration/branches/branch-query';

/** An institution's branches from the platform context (contract §E.2): the `/branches` filters and
 * sort allow-list, scoped by the path. The caller passes a validated, lower-cased id. */
export function institutionBranchListApiPath(tenantId: string, query: BranchListQuery): string {
  return `/api/v1/platform/tenants/${tenantId}/branches${toQueryString({
    q: query.q,
    status: query.status,
    type: query.type,
    ...sortQuery(query.sort),
    page: query.page,
    size: query.size,
  })}`;
}

/** The record's Branches tab; the branch record and the draft form live below it. */
export function institutionBranchesHref(tenantId: string): string {
  return `/platform-admin/tenants/${tenantId}/branches`;
}
```

`users/institution-user-query.ts`:

```ts
import { toQueryString } from '@/lib/api/query-string';
import type { UserListQuery } from '@/modules/administration/users/user-query';

/** An institution's users from the platform context (contract §E.2): newest first, no sort. The
 * platform organisation's id lists the platform's own members (BG-10). */
export function institutionUserListApiPath(tenantId: string, query: UserListQuery): string {
  return `/api/v1/platform/tenants/${tenantId}/users${toQueryString({
    q: query.q,
    user_status: query.userStatus,
    membership_status: query.membershipStatus,
    page: query.page,
    size: query.size,
  })}`;
}

export function institutionUsersHref(tenantId: string): string {
  return `/platform-admin/tenants/${tenantId}/users`;
}

export const PLATFORM_USERS_HREF = '/platform-admin/users';
```

`branches/institution-branch-rules.ts`:

```ts
import { canAll, type PermissionHolder } from '@/auth/permissions';
import { UUID_PATTERN } from '@/lib/api/wire';
import type { TenantStatus } from '../tenants/tenant-contract';

/** A route's branch id, lower-cased (contract §A), or null: not found, before any read. */
export function parseBranchId(param: string): string | null {
  return UUID_PATTERN.test(param) ? param.toLowerCase() : null;
}

/** The platform create needs `branch.create`; the redirect after it reads the draft back. */
export const BRANCH_CREATE_CODES = ['branch.create', 'branch.view'] as const;

/** The most branches the parent picker and the parent-name lookup read (5 pages of 100). */
export const BRANCH_INDEX_CEILING = 500;

/**
 * Ruling 8. The shared branch service refuses an institution that isn't ACTIVE (or the transient
 * PROVISIONING) with a 409 (contract §E.3), so only an ACTIVE one is offered. BG-18's second
 * condition, a membership with `branch.create` inside the institution, can't be seen from the
 * platform: the form warns, and a 403 is explained.
 */
export function canCreateInstitutionBranch(
  status: TenantStatus,
  holder: PermissionHolder,
): boolean {
  return status === 'ACTIVE' && canAll(holder, BRANCH_CREATE_CODES);
}

export const BRANCHES_DESCRIPTION =
  "The institution's own administrators submit, activate and change its branches.";
export const BRANCH_DETAIL_DESCRIPTION =
  "Read-only here: the institution's own administrators run its branches. The platform doesn't return a branch's address.";
export const BRANCH_CREATE_REFUSED =
  'The platform refused this branch. You must also be an active member of this institution, with a role there that allows creating branches. Ask one of its administrators to create it, or to give you that access.';
export const BRANCH_CREATE_CONFLICT =
  "The branch couldn't be created. Its code may already be in use, or the institution can't add branches right now.";
export const BRANCH_CODE_MAY_BE_TAKEN = 'This code may already be in use.';
export const BRANCH_CREATE_INACTIVE = {
  title: 'Only an active institution can take new branches',
  description: "This institution isn't active, so the platform would refuse a new branch.",
} as const;
export const PARENTS_UNAVAILABLE =
  "Optional. This institution's branches couldn't be loaded, so no parent can be chosen right now. Refresh to try again.";
export const PARENTS_PARTIAL = `Optional. Only the first ${BRANCH_INDEX_CEILING} branches are listed.`;

export function branchCreateDescription(institutionName: string): string {
  return `The draft is created in ${institutionName}. Its own administrators then submit it and activate it.`;
}

/** BG-18, shown on the form as a warning note. */
export function branchCreateWarning(institutionName: string): string {
  return `You can create a branch here only if you're also an active member of ${institutionName}, with a role there that allows creating branches. Otherwise the platform refuses it.`;
}

/** The parent picker's helper (rule 9): a failed or capped index never reads as "no branches". */
export function parentsNote(
  index: { ok: false } | { ok: true; truncated: boolean },
): string | undefined {
  if (!index.ok) return PARENTS_UNAVAILABLE;
  return index.truncated ? PARENTS_PARTIAL : undefined;
}
```

`users/account-rules.ts`:

```ts
import { can, canAny, type PermissionHolder } from '@/auth/permissions';
import { humanizeEnum } from '@/components/data-display/status-chip';
import type { MembershipStatus, UserStatus } from '@/modules/administration/users/user-contract';
import { userStatusLabel } from '@/modules/administration/users/user-rules';

export type AccountAction = 'suspend' | 'reactivate' | 'deactivate';

/** Contract §E.2, §F: suspend and deactivate need an ACTIVE account, reactivate a SUSPENDED one.
 * The first action is the hero's contained one, so the reversible action leads. */
const ACTIONS_BY_STATUS: Partial<Record<UserStatus, readonly AccountAction[]>> = {
  ACTIVE: ['suspend', 'deactivate'],
  SUSPENDED: ['reactivate'],
};

const PERMISSION: Record<AccountAction, string> = {
  suspend: 'user.suspend',
  reactivate: 'user.activate',
  deactivate: 'user.deactivate',
};

const ACCOUNT_CODES = Object.values(PERMISSION);

/** No `.view` read-back is documented for the platform's user actions (contract §E.2), so each
 * action needs only its own code; the record itself needs `user.view` to render. */
export function availableAccountActions(
  status: UserStatus,
  holder: PermissionHolder,
): AccountAction[] {
  return (ACTIONS_BY_STATUS[status] ?? []).filter((action) => can(holder, PERMISSION[action]));
}

export const OWN_ACCOUNT =
  "You can't suspend or deactivate your own account. Ask another platform administrator.";
/** A frontend-only problem code: the actions refuse your own account before any call (Ruling 6). */
export const OWN_ACCOUNT_CODE = 'own_account';
export const ACCOUNT_CHANGED =
  'This account changed since the page loaded. Refresh to see its status.';
export const ACCOUNT_DEACTIVATED_NOTE =
  "This account is deactivated. The platform can't reactivate it.";
export const ACCOUNT_NOT_ACTIONABLE_NOTE =
  'Only an active account can be suspended or deactivated, and only a suspended one reactivated.';
export const CONFIRM_USERNAME_MISMATCH = 'Type the username exactly as shown.';
export const INSTITUTION_USERS_DESCRIPTION =
  "Everyone with a membership in this institution. Account actions on a user's record apply across the whole platform.";
export const PLATFORM_USERS_DESCRIPTION =
  "Members of the platform organisation, the people who run the platform. An institution's users are listed on its record.";

/** Your own account: Suspend and Deactivate are shown disabled with the reason (spec §6.6; BG-35). */
export function blockedAccountActions(
  actions: readonly AccountAction[],
  subject: { self: boolean },
): Partial<Record<AccountAction, string>> {
  const blocked: Partial<Record<AccountAction, string>> = {};
  if (!subject.self) return blocked;
  for (const action of actions) {
    if (action === 'suspend' || action === 'deactivate') blocked[action] = OWN_ACCOUNT;
  }
  return blocked;
}

/** Why the hero offers no account action to a holder who has an account code; null otherwise. */
export function accountActionsNote(status: UserStatus, holder: PermissionHolder): string | null {
  if (!canAny(holder, ACCOUNT_CODES)) return null;
  if (status === 'DEACTIVATED') return ACCOUNT_DEACTIVATED_NOTE;
  if (status === 'ACTIVE' || status === 'SUSPENDED') return null;
  return ACCOUNT_NOT_ACTIONABLE_NOTE;
}

export type AccountScope = 'institution' | 'platform';

export function accountScopeNote(scope: AccountScope): string {
  return scope === 'institution'
    ? "Account actions apply to this person's sign-in account on the whole platform, in every institution they belong to. Their membership here is managed by this institution's own administrators."
    : "Account actions apply to this person's sign-in account on the whole platform, in every institution they belong to.";
}

export function accountChipLabel(status: UserStatus): string {
  return `Account ${userStatusLabel(status).toLowerCase()}`;
}

export function membershipChipLabel(status: MembershipStatus): string {
  return `Membership ${humanizeEnum(status).toLowerCase()}`;
}
```

`overview/overview-rules.ts`:

```ts
import type { NotificationsMenuProps } from '@/components/shell/notifications-menu';
import type { Page } from '@/lib/api/wire';
import type { TenantSummary } from '../tenants/tenant-contract';

/** The Needs attention table shows at most this many institutions per status (Ruling 10). */
export const ATTENTION_PREVIEW_SIZE = 5;

/**
 * BG-29: `status=ACTIVE` counts the reserved platform organisation. It is always ACTIVE while anyone
 * works in the platform context (contract §A re-validates the organisation on every request), so
 * that count holds it exactly once, and no other status ever holds it.
 */
export function activeInstitutionCount(activeTotal: number): number {
  return Math.max(0, activeTotal - 1);
}

/** A settled read, structurally `Loaded<Page<TenantSummary>>` (lib/api/load.ts is server-only). */
export type AttentionRead =
  { ok: true; value: Page<TenantSummary> } | { ok: false; problem: { requestId: string | null } };

export interface AttentionView {
  /** Pending approval first, then drafts, each oldest first as read. */
  rows: TenantSummary[];
  /** One sentence per failed read, with its reference. */
  failures: string[];
  /** Links to the full, filtered directory when a list holds more than the preview. */
  more: { href: string; label: string }[];
  /** Only when nothing is listed, and only what is known (rule 9). */
  empty: { title: string; description?: string } | null;
}

const DIRECTORY = '/platform-admin/tenants';
export const PENDING_HREF = `${DIRECTORY}?status=PENDING_APPROVAL&sortBy=createdAt&sortDir=ASC`;
export const DRAFTS_HREF = `${DIRECTORY}?status=DRAFT&sortBy=createdAt&sortDir=ASC`;

const reference = (requestId: string | null) => (requestId ? ` Reference: ${requestId}` : '');
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

export function attentionView(
  pending: AttentionRead,
  drafts: AttentionRead,
  isPlatform: (id: string) => boolean,
): AttentionView {
  const visible = (read: AttentionRead) =>
    read.ok ? read.value.items.filter((tenant) => !isPlatform(tenant.id)) : [];
  const pendingRows = visible(pending);
  const draftRows = visible(drafts);
  const failures = [
    ...(pending.ok
      ? []
      : [
          `Institutions pending approval couldn't be loaded.${reference(pending.problem.requestId)}`,
        ]),
    ...(drafts.ok ? [] : [`Drafts couldn't be loaded.${reference(drafts.problem.requestId)}`]),
  ];
  const more: AttentionView['more'] = [];
  if (pending.ok && pending.value.page.totalItems > pendingRows.length) {
    const total = pending.value.page.totalItems;
    more.push({
      href: PENDING_HREF,
      label: `View all ${total} ${plural(total, 'institution', 'institutions')} pending approval`,
    });
  }
  if (drafts.ok && drafts.value.page.totalItems > draftRows.length) {
    const total = drafts.value.page.totalItems;
    more.push({
      href: DRAFTS_HREF,
      label: `View all ${total} ${plural(total, 'draft', 'drafts')}`,
    });
  }
  const rows = [...pendingRows, ...draftRows];
  let empty: AttentionView['empty'] = null;
  if (rows.length === 0) {
    if (pending.ok && drafts.ok) {
      empty = {
        title: 'Nothing needs attention',
        description: 'No institution is waiting for approval, and there are no drafts.',
      };
    } else if (pending.ok) {
      empty = { title: 'No institution is waiting for approval' };
    } else if (drafts.ok) {
      empty = { title: 'There are no drafts' };
    }
  }
  return { rows, failures, more, empty };
}

export const OVERVIEW_DESCRIPTION =
  "Institutions by lifecycle, the platform's operators, and the requests waiting for someone.";
export const ATTENTION_DESCRIPTION =
  'Institutions waiting for approval, then drafts, oldest first.';

/** The five tiles' copy (Ruling 9); every link name is unique on the page (rule 12). */
export const KPI = {
  active: {
    label: 'Active institutions',
    caption: 'Leaves out the platform organisation itself',
    href: `${DIRECTORY}?status=ACTIVE`,
    link: 'View active institutions',
  },
  pending: {
    label: 'Pending approval',
    caption: 'Waiting for a second platform administrator',
    href: PENDING_HREF,
    link: 'Review pending institutions',
  },
  drafts: {
    label: 'Drafts',
    caption: 'Not yet submitted for approval',
    href: DRAFTS_HREF,
    link: 'View drafts',
  },
  suspended: {
    label: 'Suspended',
    caption: 'Nobody can work in them until they are reactivated',
    href: `${DIRECTORY}?status=SUSPENDED`,
    link: 'View suspended institutions',
  },
  operators: {
    label: 'Platform operators',
    caption: 'Active accounts with an active platform membership',
    href: '/platform-admin/users?userStatus=ACTIVE&membershipStatus=ACTIVE',
    link: 'View platform operators',
  },
} as const;

/** The platform badge (spec §8, BG-22). `null`: the read failed, which never reads as "none". */
export function pendingApprovalNotifications(count: number | null): NotificationsMenuProps {
  const common = {
    emptyText: 'No institutions are waiting for approval.',
    unavailableText: "Pending approvals couldn't be loaded. Refresh to try again.",
  };
  if (count === null) {
    return { ...common, label: "Notifications (couldn't be loaded)", total: null, entries: [] };
  }
  if (count === 0)
    return { ...common, label: 'Notifications: nothing waiting', total: 0, entries: [] };
  return {
    ...common,
    label: `Notifications: ${count} ${plural(count, 'institution', 'institutions')} waiting for approval`,
    total: count,
    entries: [
      {
        id: 'pending-institutions',
        text: `${count} ${plural(count, 'institution is', 'institutions are')} waiting for approval.`,
        // The Pending approval tile's list, oldest first: one name, one destination (rule 12).
        href: PENDING_HREF,
        linkLabel: 'Review pending institutions',
      },
    ],
  };
}
```

`overview-rules.ts` imports a **type** from `components/shell/notifications-menu.tsx`. Write that
file now with only the exported types; Task 8 adds the component to the same file:

```ts
'use client';

/** One line in the notifications popover, with its link (spec §8). */
export interface NotificationEntry {
  id: string;
  text: string;
  href: string;
  linkLabel: string;
}

export interface NotificationsMenuProps {
  /** The bell's accessible name: it carries the count, or says the count couldn't be read. */
  label: string;
  /** `null` when the count couldn't be read: the menu says so, never "none". */
  total: number | null;
  entries: readonly NotificationEntry[];
  emptyText: string;
  unavailableText: string;
}
```

- [ ] **Step 4: Run the tests** — form U on the seven files. Expected: PASS.

- [ ] **Step 5: Mutation proofs** (on scratch copies, reverted): drop `- 1` in
      `activeInstitutionCount` (the 3 → 2 row fails); return `{ ...common, label: 'Notifications: nothing waiting', total: 0, entries: [] }` for `null` (the failure row fails); drop the `self` check in
      `blockedAccountActions` (the `self: false` row fails); move `deactivate` before `suspend` in
      `ACTIONS_BY_STATUS.ACTIVE` (the ACTIVE row fails); let `canCreateInstitutionBranch` accept
      SUSPENDED (its row fails); drop `.toLowerCase()` in `parseInstitutionId` (its first test fails).

- [ ] **Step 6: Commit** (form C) — the fourteen files of this task plus
      `components/shell/notifications-menu.tsx` (types only)

```
feat(platform): add the institution branch and user queries, account rules and overview arithmetic

The platform workspace reuses the administration contracts for an institution's branches and
users and adds its own paths, the global account rules (by status, by code, never on your own
account), the overview's exact active count and Needs attention view, and the badge's wording.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

---

### Task 2: Services and Server Actions; retire the old read-only platform code

**Files:**

- Create: `modules/platform-administration/branches/institution-branch-service.ts`, `…-service.test.ts`
- Create: `modules/platform-administration/branches/institution-branch-actions.ts`, `…-actions.test.ts`
- Create: `modules/platform-administration/users/institution-user-service.ts`, `…-service.test.ts`
- Create: `modules/platform-administration/users/account-actions.ts`, `account-actions.test.ts`
- Create: `modules/platform-administration/overview/overview-service.ts`, `overview-service.test.ts`
- Delete: `modules/platform-administration/platform-administration.types.ts`,
  `platform-administration-mappers.ts`, `platform-administration-mappers.test.ts`,
  `platform-administration-queries.ts`, `platform-administration-queries.test.ts`,
  `platform-administration-service.ts`, `platform-administration-service.test.ts`

**Interfaces:**

- Consumes: Task 1's paths, rules and copy; `apiGet`, `apiPost`; `runServerAction`, `ActionResult`;
  `explain`; `BackendApiError`; `getCurrentContextProfile`; `serverEnv`; `uuidSchema`; 08's
  `branchPageSchema`, `branchDetailSchema`, `branchDraftResultSchema`, `branchDraftSchema`; 10's
  `userPageSchema`, `userSummarySchema`; 16's `listTenants`, `isInstitutionId`, `TenantStatus`.
- Produces:
  - `listInstitutionBranches(tenantId, query): Promise<Page<BranchSummary>>`;
    `getInstitutionBranch(tenantId, branchId): Promise<BranchDetail>` (cached);
    `interface InstitutionBranchIndex { names: ReadonlyMap<string, { name: string; code: string }>; truncated: boolean }`;
    `getInstitutionBranchIndex(tenantId): Promise<InstitutionBranchIndex>` (cached; **rejects** on any
    failure, so the caller tells failed from empty);
  - `createInstitutionBranchDraft(previous, formData): Promise<ActionResult>` (fields: 08's five +
    `tenantId`, `idempotencyKey`; redirects on success);
  - `listInstitutionUsers(tenantId, query)`, `getInstitutionUser(tenantId, userId)` (cached),
    `listPlatformUsers(query)`, `getPlatformUser(userId)`;
  - `suspendAccount`, `reactivateAccount`, `deactivateAccount` (fields `userId`, `idempotencyKey`,
    `reason`; Deactivate also `username`, `confirmUsername`);
  - `listTenantsInStatus(status, size)`, `countTenantsInStatus(status)`, `countPlatformOperators()`.

- [ ] **Step 1: Write the failing service tests.** Mock `@/lib/api/tenant-api` (`apiGet`) and, for the
      users service, `@/config/env.server` (`PLATFORM_ORGANISATION_ID: '00000000-0000-0000-0000-000000000000'`).
      Assert paths **and schema identity** (`toBe(branchPageSchema)`, never `expect.anything()`).
      Test names and key assertions:
  1. `institution-branch-service.test.ts`:
     - "lists an institution's branches by a validated, lower-cased id" — `listInstitutionBranches(UPPER_ID, query)` → `apiGet` called with `institutionBranchListApiPath(lower, query)` and `branchPageSchema`.
     - "reads one branch by both ids, with 08's detail schema" — path
       `/api/v1/platform/tenants/${T}/branches/${B}`, schema `toBe(branchDetailSchema)`.
     - "rejects a malformed id before any call" — `listInstitutionBranches('../x', query)`,
       `getInstitutionBranch(T, 'not-a-uuid')` and `getInstitutionBranchIndex('x')` all reject; `apiGet`
       never called.
     - "indexes up to five pages of 100 by name, and says when it stopped early" — pages 0–4 each
       `hasNext: true` → 5 calls with `?page=N&size=100&sort_by=branchName&sort_dir=ASC`, `truncated: true`;
       a second run whose page 1 has `hasNext: false` → 2 calls, `truncated: false`; names map
       `id → { name, code }` in read order.
     - "rejects when any index page fails (never a partial or empty index)" — page 1 rejects → the
       call rejects.
  2. `institution-user-service.test.ts`:
     - "lists an institution's users" (path from `institutionUserListApiPath`, schema `toBe(userPageSchema)`);
     - "reads one user through the institution" (path `/api/v1/platform/tenants/${T}/users/${U}`, schema
       `toBe(userSummarySchema)`);
     - "lists and reads platform users through the platform organisation (BG-10)" — paths under
       `/api/v1/platform/tenants/00000000-0000-0000-0000-000000000000/users`;
     - "rejects a malformed id before any call".
  3. `overview-service.test.ts` (mock `../tenants/tenant-service`'s `listTenants` and
     `../users/institution-user-service`'s `listPlatformUsers`):
     - "previews a status oldest first" — `listTenantsInStatus('PENDING_APPROVAL', 5)` →
       `listTenants({ status: 'PENDING_APPROVAL', sort: { by: 'createdAt', dir: 'ASC' }, page: 0, size: 5 })`;
     - "counts a status from one size=1 read" — `countTenantsInStatus('ACTIVE')` resolves the read's
       `totalItems` and called `listTenants` with `size: 1`;
     - "counts platform operators with an active account and membership" — `listPlatformUsers({ userStatus: 'ACTIVE', membershipStatus: 'ACTIVE', page: 0, size: 1 })`;
     - "rejects when the read fails (the page shows the failure)".

- [ ] **Step 2: Write the failing action tests**, mirroring
      `modules/administration/users/membership-actions.test.ts` (the same hoisted mocks, the validating
      pass-through `runServerAction`, and `realRunServerAction` loaded with `vi.importActual` for the
      guard tests; also mock `next/navigation`'s `redirect` to throw `NEXT_REDIRECT:<to>`).
      `KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b'`, `USER = '17000000-0000-4000-8000-0000000000a5'`,
      `SELF = '17000000-0000-4000-8000-0000000000ef'` (lettered, so its upper case differs), `TENANT = '99999999-9999-4999-8999-999999999999'`,
      `ORGANISATION = '00000000-0000-0000-0000-000000000000'`, `OTHER = '11111111-1111-4111-8111-111111111111'`.
      `account-actions.test.ts`: suspend and deactivate read who you are inside `run`
      (`refuseOwnAccount`), and the pass-through runs `run`, so the top-level `beforeEach` also
      gives every test a resolved profile, after the pass-through (without it, `selected.kind` on
      `undefined` throws before any assertion; the reactivate test's `not.toHaveBeenCalled()` still
      holds, because reactivate never reads it):

```ts
getCurrentContextProfile.mockResolvedValue({
  kind: 'resolved',
  profile: { user_id: SELF, permissions: [] },
  context: { organization: { id: ORGANISATION, name: 'Platform' } },
});
```

      The tests:

```ts
describe('suspendAccount', () => {
  it('suspends with the trimmed reason, forwarding the form key', async () => {
    await actions.suspendAccount(
      null,
      form({ idempotencyKey: KEY, userId: USER.toUpperCase(), reason: '  Fraud review  ' }),
    );
    expect(apiPost).toHaveBeenCalledWith(
      `/api/v1/platform/users/${USER}/suspend`,
      { reason: 'Fraud review' },
      KEY,
    );
  });

  it('refuses a reason under 3 characters after trimming, before any call', async () => {
    const result = await actions.suspendAccount(
      null,
      form({ idempotencyKey: KEY, userId: USER, reason: '  a  ' }),
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { reason: 'Give a reason of at least 3 characters.' },
    });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('explains a 409 as a changed account, keeping the reference', async () => {
    runServerAction.mockResolvedValueOnce(failure('conflict'));
    expect(await actions.suspendAccount(null, form({}))).toEqual({
      ...failure('conflict'),
      formError: ACCOUNT_CHANGED,
    });
  });
});

describe('reactivateAccount', () => {
  it('sends {} for a blank reason and { reason } otherwise (the body is required)', async () => {
    const path = `/api/v1/platform/users/${USER}/reactivate`;
    await actions.reactivateAccount(
      null,
      form({ idempotencyKey: KEY, userId: USER, reason: '   ' }),
    );
    expect(apiPost).toHaveBeenLastCalledWith(path, {}, KEY);
    await actions.reactivateAccount(null, form({ idempotencyKey: KEY, userId: USER }));
    expect(apiPost).toHaveBeenLastCalledWith(path, {}, KEY);
    await actions.reactivateAccount(
      null,
      form({ idempotencyKey: KEY, userId: USER, reason: ' Review closed ' }),
    );
    expect(apiPost).toHaveBeenLastCalledWith(path, { reason: 'Review closed' }, KEY);
  });

  it('allows reactivating without consulting who you are', async () => {
    await actions.reactivateAccount(null, form({ idempotencyKey: KEY, userId: SELF }));
    expect(getCurrentContextProfile).not.toHaveBeenCalled();
  });
});

describe('deactivateAccount', () => {
  const base = {
    idempotencyKey: KEY,
    userId: USER,
    reason: 'Left the platform',
    username: 'achieng.odera',
  };

  it('deactivates once the username is typed back exactly', async () => {
    await actions.deactivateAccount(null, form({ ...base, confirmUsername: ' achieng.odera ' }));
    expect(apiPost).toHaveBeenCalledWith(
      `/api/v1/platform/users/${USER}/deactivate`,
      { reason: 'Left the platform' },
      KEY,
    );
  });

  it("refuses a username that doesn't match, before any call", async () => {
    for (const confirmUsername of ['achieng', 'Achieng.Odera', '']) {
      const result = await actions.deactivateAccount(null, form({ ...base, confirmUsername }));
      expect(result).toMatchObject({
        ok: false,
        fieldErrors: { confirmUsername: CONFIRM_USERNAME_MISMATCH },
      });
    }
    expect(apiPost).not.toHaveBeenCalled();
  });
});

describe('the guards (the real runServerAction)', () => {
  beforeEach(() => {
    runServerAction.mockImplementation(realRunServerAction);
    getAuthenticatedUser.mockResolvedValue({ id: 'session-user' });
    getCurrentContextProfile.mockResolvedValue({
      kind: 'resolved',
      profile: { user_id: SELF, permissions: [] },
      context: { organization: { id: ORGANISATION, name: 'Platform' } },
    });
  });

  it.each(['suspendAccount', 'deactivateAccount'] as const)(
    '%s refuses your own account before any call',
    async (name) => {
      const result = await actions[name](
        null,
        form({
          idempotencyKey: KEY,
          userId: SELF.toUpperCase(),
          reason: 'Testing myself',
          username: 'jane.manager',
          confirmUsername: 'jane.manager',
          contextOrganisationId: ORGANISATION,
        }),
      );
      expect(result).toMatchObject({ ok: false, code: OWN_ACCOUNT_CODE, formError: OWN_ACCOUNT });
      expect(apiPost).not.toHaveBeenCalled();
    },
  );

  it('refuses a submit after an organisation switch in another tab', async () => {
    const result = await actions.suspendAccount(
      null,
      form({
        idempotencyKey: KEY,
        userId: USER,
        reason: 'Fraud review',
        contextOrganisationId: OTHER,
      }),
    );
    expect(result).toMatchObject({ ok: false, code: 'context_changed' });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('rejects a malformed user id before any call', async () => {
    for (const userId of ['../x', 'not-a-uuid', '']) {
      const result = await actions.suspendAccount(
        null,
        form({ idempotencyKey: KEY, userId, reason: 'Fraud review' }),
      );
      expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
    }
    expect(apiPost).not.toHaveBeenCalled();
  });
});
```

      `institution-branch-actions.test.ts` (same harness, plus the platform organisation's id, as
      `tenants/tenant-actions.test.ts:31` does: the schema's `isInstitutionId` refinement reads
      `serverEnv.PLATFORM_ORGANISATION_ID`, and zod lets a throwing refinement escape `safeParse`.
      A literal, because `vi.mock` is hoisted above the constants:
      `vi.mock('@/config/env.server', () => ({ serverEnv: { PLATFORM_ORGANISATION_ID: '00000000-0000-0000-0000-000000000000' } }));`
      — the same id as `ORGANISATION`. Its `run` reads no profile, so the pass-through needs no
      default one; `BRANCH = '17000000-0000-4000-8000-0000000000b7'`, and `apiPost` resolves
      `{ branch_id: BRANCH.toUpperCase(), status: 'DRAFT' }` for the redirect test):

- "posts the draft field by field to the institution, with the form key, and opens it" — form
  `{ idempotencyKey: KEY, tenantId: TENANT, branchCode: ' THIKA ', branchName: 'Thika Road Branch', branchType: 'OPERATIONS', parentBranchId: '', timezone: 'Africa/Nairobi' }`
  → `apiPost(\`/api/v1/platform/tenants/${TENANT}/branches\`, { branch_code: 'THIKA', branch_name: 'Thika Road Branch', branch_type: 'OPERATIONS', parent_branch_id: null, timezone: 'Africa/Nairobi' }, KEY)`(no`address`key:`Object.keys(body)`equals the five) and the action throws`NEXT_REDIRECT:/platform-admin/tenants/${TENANT}/branches/${BRANCH}` (lower-cased).
- "refuses the platform organisation and a malformed institution id before any call" (`ORGANISATION`,
  its upper case is moot for the nil id: also `'../x'`): `fieldErrors.tenantId === 'Choose an institution.'`.
- "explains the BG-18 refusal" — `failure('forbidden')` → `formError: BRANCH_CREATE_REFUSED`, no field.
- "explains a 409 with the code field" — `failure('conflict')` → `formError: BRANCH_CREATE_CONFLICT`,
  `fieldErrors: { branchCode: BRANCH_CODE_MAY_BE_TAKEN }`.
- "leaves other failure codes alone" (`internal_error`, `context_changed`).
- "refuses a submit after an organisation switch" (real `runServerAction`, as above).

- [ ] **Step 3: Run them to verify they fail** — form U. Expected: FAIL (modules not found).

- [ ] **Step 4: Implement.**

`branches/institution-branch-service.ts`:

```ts
import 'server-only';
import { cache } from 'react';
import { toQueryString } from '@/lib/api/query-string';
import { apiGet } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import {
  branchDetailSchema,
  branchPageSchema,
} from '@/modules/administration/branches/branch-contract';
import type { BranchListQuery } from '@/modules/administration/branches/branch-query';
import { institutionBranchListApiPath } from './institution-branch-query';
import { BRANCH_INDEX_CEILING } from './institution-branch-rules';

const id = (value: string) => uuidSchema.parse(value).toLowerCase();

/** `async`, so a malformed id rejects (a `load()` failure) instead of throwing past `load()`. */
export async function listInstitutionBranches(tenantId: string, query: BranchListQuery) {
  return await apiGet(institutionBranchListApiPath(id(tenantId), query), branchPageSchema);
}

/** One read per request. 08's detail schema: `address` (always `{}`, BG-13) isn't mapped. */
export const getInstitutionBranch = cache(async (tenantId: string, branchId: string) => {
  return await apiGet(
    `/api/v1/platform/tenants/${id(tenantId)}/branches/${id(branchId)}`,
    branchDetailSchema,
  );
});

export interface InstitutionBranchIndex {
  names: ReadonlyMap<string, { name: string; code: string }>;
  /** The ceiling was reached with more branches unread. */
  truncated: boolean;
}

const INDEX_PAGE_SIZE = 100;
// ponytail: at most BRANCH_INDEX_CEILING branches (5 pages of 100, spec §6.3's lookup ceiling) for
// the parent picker and parent names; `truncated` says when there were more.
const INDEX_PAGES = BRANCH_INDEX_CEILING / INDEX_PAGE_SIZE;

/** An institution's branches by id, sorted by name. Rejects on any failure, never answers a
 * partial or empty index for a failed read, so a caller can say it couldn't load (rule 9). */
export const getInstitutionBranchIndex = cache(
  async (tenantId: string): Promise<InstitutionBranchIndex> => {
    const institution = id(tenantId);
    const names = new Map<string, { name: string; code: string }>();
    for (let page = 0; page < INDEX_PAGES; page += 1) {
      const result = await apiGet(
        `/api/v1/platform/tenants/${institution}/branches${toQueryString({
          page,
          size: INDEX_PAGE_SIZE,
          sort_by: 'branchName',
          sort_dir: 'ASC',
        })}`,
        branchPageSchema,
      );
      for (const branch of result.items) {
        names.set(branch.id, { name: branch.branchName, code: branch.branchCode });
      }
      if (!result.page.hasNext) return { names, truncated: false };
    }
    return { names, truncated: true };
  },
);
```

`users/institution-user-service.ts`:

```ts
import 'server-only';
import { cache } from 'react';
import { serverEnv } from '@/config/env.server';
import { apiGet } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import { userPageSchema, userSummarySchema } from '@/modules/administration/users/user-contract';
import type { UserListQuery } from '@/modules/administration/users/user-query';
import { institutionUserListApiPath } from './institution-user-query';

const id = (value: string) => uuidSchema.parse(value).toLowerCase();

export async function listInstitutionUsers(tenantId: string, query: UserListQuery) {
  return await apiGet(institutionUserListApiPath(id(tenantId), query), userPageSchema);
}

/** One read per request: `UserInTenantSummary` (contract §E.2), 10's schema. */
export const getInstitutionUser = cache(async (tenantId: string, userId: string) => {
  return await apiGet(
    `/api/v1/platform/tenants/${id(tenantId)}/users/${id(userId)}`,
    userSummarySchema,
  );
});

/** BG-10: no global directory; platform users are the platform organisation's members. */
export function listPlatformUsers(query: UserListQuery) {
  return listInstitutionUsers(serverEnv.PLATFORM_ORGANISATION_ID, query);
}

export function getPlatformUser(userId: string) {
  return getInstitutionUser(serverEnv.PLATFORM_ORGANISATION_ID, userId);
}
```

`overview/overview-service.ts`:

```ts
import 'server-only';
import type { TenantStatus } from '../tenants/tenant-contract';
import { listTenants } from '../tenants/tenant-service';
import { listPlatformUsers } from '../users/institution-user-service';

/** The Needs attention preview: the oldest first, at most `size`. Its `totalItems` is the tile's
 * count too, so pending approval and drafts cost no extra read. */
export function listTenantsInStatus(status: TenantStatus, size: number) {
  return listTenants({ status, sort: { by: 'createdAt', dir: 'ASC' }, page: 0, size });
}

/** BG-15: no count endpoint, one `size=1` read. Rejects on failure, for the page's `load()`. */
export async function countTenantsInStatus(status: TenantStatus): Promise<number> {
  const result = await listTenants({
    status,
    sort: { by: 'createdAt', dir: 'DESC' },
    page: 0,
    size: 1,
  });
  return result.page.totalItems;
}

/** The people who can work in the platform now: an ACTIVE account with an ACTIVE membership. */
export async function countPlatformOperators(): Promise<number> {
  const result = await listPlatformUsers({
    userStatus: 'ACTIVE',
    membershipStatus: 'ACTIVE',
    page: 0,
    size: 1,
  });
  return result.page.totalItems;
}
```

`users/account-actions.ts`:

```ts
'use server';

import { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { getCurrentContextProfile } from '@/auth/context-service';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiPost } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import {
  ACCOUNT_CHANGED,
  CONFIRM_USERNAME_MISMATCH,
  OWN_ACCOUNT,
  OWN_ACCOUNT_CODE,
} from './account-rules';

const idempotencyKey = z.uuid();
const accountInput = z.object({ idempotencyKey, userId: uuidSchema });
const requiredReason = z
  .string()
  .trim()
  .min(3, 'Give a reason of at least 3 characters.')
  .max(500, 'Keep the reason under 500 characters.');
// No `|| null` transform: a trimmed '' is falsy, so a blank reason still sends `{}`.
const optionalReason = z
  .string()
  .trim()
  .max(500, 'Keep the reason under 500 characters.')
  .optional();
// CRITICAL (Ruling 5): the username typed back. A UX guard; the permission is the gate.
const deactivateInput = accountInput
  .extend({
    reason: requiredReason,
    username: z.string().min(1),
    confirmUsername: z.string().trim(),
  })
  .refine((input) => input.confirmUsername === input.username, {
    path: ['confirmUsername'],
    error: CONFIRM_USERNAME_MISMATCH,
  });

/** Ruling 6, BG-35: suspending or deactivating your own account would end every session, and
 * deactivating it can't be undone. A hand-crafted request is refused too, before any call. */
async function refuseOwnAccount(userId: string): Promise<void> {
  const selected = await getCurrentContextProfile();
  // Fail closed: without a resolved profile we can't tell whose account this is, so a lost session
  // or a stale context reaches the redirect before any call.
  if (selected.kind !== 'resolved') {
    throw new BackendApiError(403, { code: 'invalid_active_tenant_context' });
  }
  if (selected.profile.user_id.toLowerCase() === userId) {
    throw new BackendApiError(409, { code: OWN_ACCOUNT_CODE });
  }
}

function transition(
  path: 'suspend' | 'reactivate' | 'deactivate',
  schema: z.ZodType<{ idempotencyKey: string; userId: string; reason?: string }>,
  formData: FormData,
): Promise<ActionResult> {
  return runServerAction(schema, formData, async (input) => {
    const userId = input.userId.toLowerCase();
    if (path !== 'reactivate') await refuseOwnAccount(userId);
    return apiPost(
      `/api/v1/platform/users/${userId}/${path}`,
      input.reason ? { reason: input.reason } : {},
      input.idempotencyKey,
    );
  });
}

function explainAccount(result: ActionResult): ActionResult {
  return explain(explain(result, OWN_ACCOUNT_CODE, OWN_ACCOUNT), 'conflict', ACCOUNT_CHANGED);
}

/** ACTIVE only (contract §E.2): the account is suspended in every institution. */
export async function suspendAccount(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explainAccount(
    await transition('suspend', accountInput.extend({ reason: requiredReason }), formData),
  );
}

/** SUSPENDED only. The body is required, so a blank reason sends `{}` (contract §D). */
export async function reactivateAccount(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explainAccount(
    await transition('reactivate', accountInput.extend({ reason: optionalReason }), formData),
  );
}

/** ACTIVE only; permanent (§F) and the role assignments go with it (§G). */
export async function deactivateAccount(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explainAccount(await transition('deactivate', deactivateInput, formData));
}
```

The `deactivateInput` refinement passes the `transition` schema type (it outputs
`{ idempotencyKey, userId, reason, username, confirmUsername }`); if `tsc` rejects the assignment,
widen `transition`'s schema parameter to `z.ZodType<{ idempotencyKey: string; userId: string; reason?: string | undefined }>`
— never cast.

`branches/institution-branch-actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiPost } from '@/lib/api/tenant-api';
import { branchDraftResultSchema } from '@/modules/administration/branches/branch-contract';
import { branchDraftSchema } from '@/modules/administration/branches/branch-rules';
import { isInstitutionId } from '../tenants/institution-id';
import { institutionBranchesHref } from './institution-branch-query';
import {
  BRANCH_CODE_MAY_BE_TAKEN,
  BRANCH_CREATE_CONFLICT,
  BRANCH_CREATE_REFUSED,
} from './institution-branch-rules';

const idempotencyKey = z.uuid();
/** BG-29: never the reserved platform organisation, in any letter case. */
const tenantId = z.string().refine(isInstitutionId, 'Choose an institution.');

/** 08's draft fields, posted to the platform route (contract §E.2). No address: it is stored but
 * never returned (BG-13). */
export async function createInstitutionBranchDraft(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(
    branchDraftSchema.extend({ idempotencyKey, tenantId }),
    formData,
    async (input) => {
      const institution = input.tenantId.toLowerCase();
      const draft = branchDraftResultSchema.parse(
        await apiPost(
          `/api/v1/platform/tenants/${institution}/branches`,
          {
            branch_code: input.branchCode,
            branch_name: input.branchName,
            branch_type: input.branchType,
            parent_branch_id: input.parentBranchId || null,
            timezone: input.timezone,
          },
          input.idempotencyKey,
        ),
      );
      // Rethrown by runServerAction (unstable_rethrow): the client navigates to the draft.
      redirect(`${institutionBranchesHref(institution)}/${draft.branchId.toLowerCase()}`);
    },
  );
  // BG-18: a 403 here is almost always the missing membership inside the institution (the button
  // needs the platform code). 409: a duplicate code or an institution that can't take branches.
  return explain(
    explain(result, 'forbidden', BRANCH_CREATE_REFUSED),
    'conflict',
    BRANCH_CREATE_CONFLICT,
    { branchCode: BRANCH_CODE_MAY_BE_TAKEN },
  );
}
```

- [ ] **Step 5: Run the tests** — form U on the five new test files. Expected: PASS.

- [ ] **Step 6: Mutation proofs** (scratch copies): skip `refuseOwnAccount` (both own-account rows
      fail); compare `confirmUsername` case-insensitively (the `Achieng.Odera` row fails); return the
      index on a failed page instead of rejecting (its test fails); `INDEX_PAGES = 6` (the five-page
      test fails); drop the BG-18 `explain` (its test fails).

- [ ] **Step 7: Commit the services and actions** (form C) — the ten new files

```
feat(platform): add the institution branch and user services and the account Server Actions

An institution's branches and users are read through the platform routes with the administration
contracts. A branch draft is posted for an institution and opens on success, with BG-18's refusal
explained. Suspend, reactivate and deactivate act on the person's account everywhere; deactivate
needs the username typed back, and your own account is refused before any call.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

- [ ] **Step 8: Delete the old read-only code** — `git rm` the seven files listed under Delete; run
      the pre-flight note 3 grep (it must print nothing); form U on
      `modules/platform-administration`. Commit (form C):

```
refactor(platform): retire the read-only tenant branch and user mappers

The platform workspace now reads institution branches and users through the administration
contracts, so the unvalidated mappers, their types, queries and service have no consumer left.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

---

### Task 3: Fake API — platform branch, user and account routes, and the scenarios

**Files:**

- Modify: `e2e/fake-api/routes/tenant-reads.mts` (extract and export `branchPage`, `userSummaryWire`,
  `institutionUserPage`; the routes call them; behaviour unchanged)
- Modify: `e2e/fake-api/routes/branches.mts` (export `BRANCH_DRAFT_KEYS`, `draftBranchFields`,
  `branchDetailWire`; `POST /branches` uses them; behaviour unchanged)
- Create: `e2e/fake-api/routes/platform-records.mts`
- Modify: `e2e/fake-api/server.mts` (register `...platformRecordRoutes` last)
- Modify: `e2e/fake-api/scenarios.mts` (`RECORD_SCENARIO_IDS`, `PLATFORM_RECORD_CODES`,
  `platformRecordsScenario()`, two `BUILDERS` entries last)
- Modify: `e2e/support/fake-api.ts` (`contextFor` gains `organisationId = IDS.greenfield`)
- Create: `e2e/fake-api-platform-records.spec.ts`

**Interfaces:**

- Consumes: `requireContext`, `requirePermission`, `requirePlatformContext`; `objectBody`,
  `readBody`, `reasonField`, `stringField`, `pageOf`, `problem`, `sendJson`, `Violation`;
  `sendIdempotent`; `route`; `platformTenantsScenario()`, `organisation`, `branch`, `membership`,
  `role`, `tenantRoleAssignment`, `withoutPermission`, `IDS`, `TENANT_SCENARIO_IDS`, `CREATED`,
  `UPDATED`.
- Produces: `platformRecordRoutes: Route[]`; `RECORD_SCENARIO_IDS` (below); scenarios
  `'platform-records'`, `'platform-records-read-only'`;
  `contextFor(request, scenario, branchId, organisationId = IDS.greenfield)`.

- [ ] **Step 1: Write the failing fake spec** — `e2e/fake-api-platform-records.spec.ts`, every test
      its own run through `contextFor(request, 'platform-records', null, IDS.platformOrganisation)`
      (the platform operator has one branch, which selection pins). `R = RECORD_SCENARIO_IDS`,
      `T = TENANT_SCENARIO_IDS`. Tests and key assertions:
  1. "lists an institution's branches with the /branches filters and sort; an unknown sort is a 500"
     — `GET /platform/tenants/${IDS.acme}/branches` → `total_items: 5`, `items[0].id === R.acmeLikoni`
     (newest first), `Object.keys(items[0])` equals `['id', 'organisation_id', 'branch_code',
'branch_name', 'branch_type', 'status', 'created_at']`; `status=SUSPENDED` → only Nakuru;
     `q=road` → only Mombasa Road; `sort_by=branchCode&sort_dir=ASC` → `items[0].branch_code ===
'HEAD_OFFICE'`; `sort_by=toString` → 500 `internal_error`; `GET /platform/tenants/${T.pwani}/branches`
     → 1 item.
  2. "reads a branch of that institution only, its address never returned (BG-13)" — Nakuru's detail
     has `status: 'SUSPENDED'`, `status_reason: 'Premises under renovation'`, `address: {}`,
     `opened_on: null`; `GET …/${IDS.acme}/branches/${R.pwaniHeadOffice}` → 404 `resource_not_found`.
  3. "creates a draft only where the operator is a member with branch.create (BG-18)" — `POST
/platform/tenants/${IDS.acme}/branches` with `DRAFT = { branch_code: 'THIKA', branch_name:
'Thika Road Branch', branch_type: 'OPERATIONS', parent_branch_id: R.acmeHeadOffice, timezone:
'Africa/Nairobi' }` and key K1 → 201 `{ branch_id, status: 'DRAFT' }`; its detail reads `status:
'DRAFT'`; the same body to `T.pwani` with key K2 → 403 `forbidden`; K2 again → 403 (nothing
     stored); `THIKA` again at Acme with a new key → 409 `conflict`; `{ ...DRAFT, branch_code:
'MERU', parent_branch_id: R.pwaniHeadOffice }` (a parent from Pwani, under a code Acme doesn't
     have yet: the fake checks the code before the parent) with a new key → 404 `resource_not_found`.
  4. "refuses unknown properties and validates the draft" — `{ ...DRAFT, branch_code: 'NYERI',
branchCode: 'NYERI' }` → 400 `invalid_json`; the control `{ ...DRAFT, branch_code: 'NYERI' }` → 201
     (rule 16); `branch_code: 'ab'` → 400 `validation_failed` with `violations[0].field ===
'branch_code'`.
  5. "lists users per institution, newest first, and the platform's own members" — Acme → 8 items,
     `items[0].id === R.nyokabi`, `items[7].id === IDS.jane`; `user_status=SUSPENDED` → only Baraka;
     `q=mensah` → only Esi; `GET /platform/tenants/${IDS.platformOrganisation}/users` → 3 items: Sara,
     Peter, Jane; Esi's detail under Pwani reads `membership_status: 'ACTIVE'`; Esi under `T.kilimo` → 404.
  6. "suspends and reactivates an account everywhere, refusing the wrong state" — suspend Esi `{
reason: 'Fraud review' }` → 200 `{ user_id: R.esi, status: 'SUSPENDED' }`; Esi under Pwani now
     reads `user_status: 'SUSPENDED'`; suspend again (new key) → 409 `conflict`; reactivate with **no
     body** → 400 `invalid_json`; reactivate `{}` → 200 `ACTIVE`; reactivate again → 409.
  7. "deactivates for good" — deactivate Achieng `{ reason: 'Left the platform' }` → 200
     `DEACTIVATED`; reactivate `{}` → 409; suspend → 409.
  8. "validates reasons, refuses unknown properties, and replays by key" — suspend Achieng `{}` → 400
     `invalid_json`; `{ reason: 'ab' }` → 400 `validation_failed`; `{ reason: 'Fraud review',
reasonText: 'x' }` → 400 `invalid_json`; the control with key K3 → 200; K3 again → 200 with
     `Idempotency-Replayed: true`; an unknown user id → 404.
  9. "gates every route on its platform code, and on the platform context" — with
     `contextFor(request, 'platform-records-read-only', null, IDS.platformOrganisation)`: suspend Esi →
     403; `POST …/branches` → 403; `GET …/users` → 200 (the control). With `contextFor(request,
'platform-records', null, IDS.acme)` (Jane's Acme membership): `GET
/platform/tenants/${IDS.acme}/users` → 403 whose `code` is the platform-context sentence (BG-30).
  10. "seeds 100-character names" — Nyokabi's `display_name.length === 100`; Likoni's `branch_name.length === 100`.

- [ ] **Step 2: Run it to verify it fails** — form E on the spec. Expected: FAIL (the import of
      `RECORD_SCENARIO_IDS` fails first).

- [ ] **Step 3: Extract the shared logic.** In `routes/tenant-reads.mts`, move the bodies of the
      `/branches` list and the `/tenant/users` list into exported functions and call them from the two
      routes; the user detail route uses `userSummaryWire`:

```ts
/** `/branches` and its platform twin (contract §E.2 "sort as /branches"): filter, sort, page. An
 * off-list `sort_by` is a 500 (BG-07); `Object.hasOwn` keeps `toString` out of the allow-list. */
export function branchPage(state: RunState, organisationId: string, query: URLSearchParams) {
  // …the existing filter/sort lines, with `access.organisation.id` replaced by `organisationId`…
  return pageOf(ordered.map(/* …the existing summary mapping… */), query);
}

export function userSummaryWire(user: FakeUser, membership: FakeMembership) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.displayName,
    user_status: user.status,
    membership_status: membership.status,
  };
}

/** `/tenant/users` and `/platform/tenants/{id}/users`: newest first (reverse seed order). */
export function institutionUserPage(
  state: RunState,
  organisationId: string,
  query: URLSearchParams,
) {
  // …the existing filter lines, with `access.organisation.id` replaced by `organisationId`…
  return pageOf(
    rows.map(({ user, membership }) => userSummaryWire(user, membership)),
    query,
  );
}
```

      In `routes/branches.mts`, rename `detailWire` to the exported `branchDetailWire`, and lift the
      `POST /branches` body checks into:

```ts
export const BRANCH_DRAFT_KEYS = [
  'branch_code',
  'branch_name',
  'branch_type',
  'parent_branch_id',
  'timezone',
  'address',
];

/** CreateBranch (contract §D): required strings are `invalid_json` when missing, the code pattern
 * and name size are `validation_failed`. Shared with the platform route. */
export function draftBranchFields(body: Record<string, unknown>) {
  // …the existing stringField and violations lines, unchanged…
  return { code, name, type, timezone, parentId };
}
```

      Run `e2e/fake-api.spec.ts e2e/fake-api-branches.spec.ts e2e/fake-api-users.spec.ts` (form E):
      all pass unchanged before going on.

- [ ] **Step 4: Write `routes/platform-records.mts`**

```ts
import { randomUUID } from 'node:crypto';
import { requireContext, requirePermission, requirePlatformContext } from '../access.mts';
import type { AccessContext } from '../access.mts';
import { objectBody, problem, readBody, reasonField, sendJson } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { route } from '../router.mts';
import type { Route, RouteContext } from '../router.mts';
import type { FakeBranch, FakeOrganisation, FakeUser, RunState } from '../state.mts';
import { BRANCH_DRAFT_KEYS, branchDetailWire, draftBranchFields } from './branches.mts';
import { branchPage, institutionUserPage, userSummaryWire } from './tenant-reads.mts';

const forbidden = () => problem(403, 'forbidden', 'You are not permitted to perform this action.');

function platformAccess(context: RouteContext): AccessContext {
  const access = requireContext(context);
  requirePlatformContext(access);
  return access;
}

/** Any organisation, the platform's own included: `/tenants/{PLATFORM}/users` lists its members. */
function findTenant(context: RouteContext): FakeOrganisation {
  const tenant = context.state.organisations.find(
    (candidate) => candidate.id === context.params.tenant_id,
  );
  if (!tenant) throw problem(404, 'resource_not_found', 'Tenant not found.');
  return tenant;
}

function findUser(state: RunState, userId: string): FakeUser {
  const user = state.users.find((candidate) => candidate.id === userId);
  if (!user) throw problem(404, 'resource_not_found', 'User not found.');
  return user;
}

/** BG-18 (BranchProvisioningService): `branch.create` must hold inside the tenant too: an ACTIVE
 * membership there and an ACTIVE TENANT-scope role that grants it. */
function canCreateIn(state: RunState, userId: string, organisationId: string): boolean {
  const member = state.memberships.some(
    (row) =>
      row.userId === userId && row.organisationId === organisationId && row.status === 'ACTIVE',
  );
  return (
    member &&
    state.roleAssignments.some(
      (grant) =>
        grant.userId === userId &&
        grant.organisationId === organisationId &&
        grant.status === 'ACTIVE' &&
        grant.scopeType === 'TENANT' &&
        state.roles.some(
          (role) =>
            role.id === grant.roleId &&
            role.status === 'ACTIVE' &&
            role.permissions.includes('branch.create'),
        ),
    )
  );
}

/** Contract §D: every account body is required (`{}` minimum for reactivate); the account status
 * lives on the user, so a change shows in every institution. */
function accountTransition(
  path: 'suspend' | 'reactivate' | 'deactivate',
  permission: string,
  from: string,
  to: string,
  reasonRequired: boolean,
): Route {
  return route('POST', `/api/v1/platform/users/:user_id/${path}`, async (context) => {
    const access = platformAccess(context);
    requirePermission(access, permission);
    const user = findUser(context.state, context.params.user_id ?? '');
    const body = objectBody(await readBody(context.req), ['reason']);
    const reason = reasonField(body, reasonRequired);
    if (!reasonRequired && reason !== null && reason.length > 500) {
      throw problem(400, 'validation_failed', 'Validation failed.', [
        { field: 'reason', code: 'Size', message: 'size must be between 0 and 500' },
      ]);
    }
    sendIdempotent(context, body, () => {
      if (user.status !== from) throw problem(409, 'conflict', `The account must be ${from}.`);
      // ponytail: deactivation also revokes the user's role assignments (contract §G); nothing in
      // the platform workspace reads them, so the fake leaves them.
      user.status = to;
      return { user_id: user.id, status: to };
    });
  });
}

export const platformRecordRoutes: Route[] = [
  route('GET', '/api/v1/platform/tenants/:tenant_id/branches', (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'branch.view');
    sendJson(context.res, 200, branchPage(context.state, findTenant(context).id, context.query));
  }),

  route('GET', '/api/v1/platform/tenants/:tenant_id/branches/:branch_id', (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'branch.view');
    const tenant = findTenant(context);
    const found = context.state.branches.find(
      (candidate) =>
        candidate.id === context.params.branch_id && candidate.organisationId === tenant.id,
    );
    if (!found) throw problem(404, 'resource_not_found', 'Branch not found.');
    sendJson(context.res, 200, branchDetailWire(found));
  }),

  route('POST', '/api/v1/platform/tenants/:tenant_id/branches', async (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'branch.create');
    const tenant = findTenant(context);
    const body = objectBody(await readBody(context.req), BRANCH_DRAFT_KEYS);
    const draft = draftBranchFields(body);
    sendIdempotent(
      context,
      body,
      () => {
        // Inside the producer, so a refusal stores nothing and a retry re-executes.
        if (!canCreateIn(context.state, access.claims.userId, tenant.id)) throw forbidden();
        // Contract §E.3 `POST /branches`: 409 unless the organisation is ACTIVE or PROVISIONING.
        if (tenant.status !== 'ACTIVE' && tenant.status !== 'PROVISIONING') {
          throw problem(409, 'conflict', 'The organisation must be ACTIVE or PROVISIONING.');
        }
        const { branches } = context.state;
        if (branches.some((row) => row.organisationId === tenant.id && row.code === draft.code)) {
          throw problem(409, 'conflict', 'A branch with this code already exists.');
        }
        if (
          draft.parentId !== null &&
          !branches.some((row) => row.id === draft.parentId && row.organisationId === tenant.id)
        ) {
          throw problem(404, 'resource_not_found', 'Parent branch not found.');
        }
        const now = new Date().toISOString();
        const created: FakeBranch = {
          id: randomUUID(),
          organisationId: tenant.id,
          code: draft.code,
          name: draft.name,
          type: draft.type,
          status: 'DRAFT',
          timezone: draft.timezone,
          parentBranchId: draft.parentId,
          statusReason: null,
          createdAt: now,
          updatedAt: now,
          draftedBy: access.claims.userId,
        };
        branches.push(created);
        // ponytail: no audit row; it lands in the tenant's log, which the platform can't read (BG-06).
        return { branch_id: created.id, status: 'DRAFT' };
      },
      201,
    );
  }),

  route('GET', '/api/v1/platform/tenants/:tenant_id/users', (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'user.view');
    sendJson(
      context.res,
      200,
      institutionUserPage(context.state, findTenant(context).id, context.query),
    );
  }),

  route('GET', '/api/v1/platform/tenants/:tenant_id/users/:user_id', (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'user.view');
    const tenant = findTenant(context);
    const membership = context.state.memberships.find(
      (row) => row.userId === context.params.user_id && row.organisationId === tenant.id,
    );
    const user = context.state.users.find((row) => row.id === context.params.user_id);
    if (!membership || !user) throw problem(404, 'resource_not_found', 'User not found.');
    sendJson(context.res, 200, userSummaryWire(user, membership));
  }),

  accountTransition('suspend', 'user.suspend', 'ACTIVE', 'SUSPENDED', true),
  accountTransition('reactivate', 'user.activate', 'SUSPENDED', 'ACTIVE', false),
  accountTransition('deactivate', 'user.deactivate', 'ACTIVE', 'DEACTIVATED', true),
];
```

      Register it last in `server.mts`: `import { platformRecordRoutes } from
      './routes/platform-records.mts';` and `...platformRecordRoutes,` after `...membershipRoutes,`.

- [ ] **Step 5: Seed the scenarios** (`scenarios.mts`, after the layer-10 block; every id ends in
      letters, rule 14):

```ts
/** Layer 17 seed IDs (lane rules §5): users …a*, branches …b*, memberships …c*, roles …d*. */
export const RECORD_SCENARIO_IDS = {
  peter: '17000000-0000-4000-8000-0000000000a1',
  sara: '17000000-0000-4000-8000-0000000000a2',
  achieng: '17000000-0000-4000-8000-0000000000a3',
  baraka: '17000000-0000-4000-8000-0000000000a4',
  chebet: '17000000-0000-4000-8000-0000000000a5',
  daudi: '17000000-0000-4000-8000-0000000000a6',
  esi: '17000000-0000-4000-8000-0000000000a7',
  faraji: '17000000-0000-4000-8000-0000000000a8',
  nyokabi: '17000000-0000-4000-8000-0000000000a9',
  acmeHeadOffice: '17000000-0000-4000-8000-0000000000b1',
  acmeMombasaRoad: '17000000-0000-4000-8000-0000000000b2',
  acmeNakuru: '17000000-0000-4000-8000-0000000000b3',
  acmeKisumu: '17000000-0000-4000-8000-0000000000b4',
  acmeLikoni: '17000000-0000-4000-8000-0000000000b5',
  pwaniHeadOffice: '17000000-0000-4000-8000-0000000000b6',
  acmeAdminRole: '17000000-0000-4000-8000-0000000000d1',
  janeAcmeRoleAssignment: '17000000-0000-4000-8000-0000000000d2',
} as const;

/** Real platform codes (PLATFORM_SUPER_ADMIN holds all 80, contract §J), granted only in
 * `platform-records`, so that `platform-operator` and `platform-tenants` don't change. */
const PLATFORM_RECORD_CODES = ['branch.create', 'user.suspend', 'user.activate', 'user.deactivate'];

/** 100 characters: the backend's display-name and branch-name maxima (contract §D). */
const LONG_ACCOUNT_NAME =
  'Nyokabi Wairimu Kamau-Achieng Muthoni Njeri Chebet Jepkoech Nyambura Akinyi Atieno Wanjiku Mwangi Ay';
const LONG_BRANCH_NAME =
  'Likoni Ferry Crossing and Mombasa Old Town Customer Service Centre for the Teachers and Allied Staff';

/**
 * Layer 17: a copy of `platform-tenants` (an institution in every lifecycle state, and
 * `tenant.approve`) plus Acme's branches and users, Pwani's head office, two more platform
 * members, and Jane as an active ADMIN of Acme only, with `branch.create` there: a platform branch
 * draft succeeds at Acme and is refused at Pwani (BG-18). Esi belongs to Acme and Pwani, so an
 * account change shows in both.
 */
function platformRecordsScenario(): RunState {
  const state = platformTenantsScenario();
  const ids = RECORD_SCENARIO_IDS;
  const person = (
    id: string,
    username: string,
    displayName: string,
    status: string,
    domain: string,
    overrides: Partial<FakeUser> = {},
  ): FakeUser => ({
    id,
    username,
    email: `${username}@${domain}`,
    displayName,
    status,
    keycloakSubject: `e2e-${username}`,
    ...overrides,
  });
  const member = (
    n: number,
    organisationId: string,
    userId: string,
    type: string,
    status = 'ACTIVE',
  ): FakeMembership => ({
    ...membership(`17000000-0000-4000-8000-0000000000c${n.toString(16)}`, organisationId, userId),
    type,
    status,
  });
  const at = (date: string, overrides: Partial<FakeBranch> = {}) => ({
    createdAt: date,
    updatedAt: date,
    ...overrides,
  });
  return {
    ...state,
    users: [
      ...state.users,
      person(ids.peter, 'peter.kamau', 'Peter Kamau', 'ACTIVE', 'finaxis.example'),
      person(ids.sara, 'sara.wanjiku', 'Sara Wanjiku', 'SUSPENDED', 'finaxis.example'),
      person(ids.achieng, 'achieng.odera', 'Achieng Odera', 'ACTIVE', 'acme.example'),
      person(ids.baraka, 'baraka.mwita', 'Baraka Mwita', 'SUSPENDED', 'acme.example'),
      person(ids.chebet, 'chebet.kiprop', 'Chebet Kiprop', 'INVITED', 'acme.example'),
      person(ids.daudi, 'daudi.hamisi', 'Daudi Hamisi', 'DRAFT', 'acme.example'),
      person(ids.esi, 'esi.mensah', 'Esi Mensah', 'ACTIVE', 'acme.example'),
      person(ids.faraji, 'faraji.juma', 'Faraji Juma', 'DEACTIVATED', 'acme.example'),
      person(ids.nyokabi, 'nyokabi.wairimu', LONG_ACCOUNT_NAME, 'ACTIVE', 'acme.example', {
        email: 'nyokabi.wairimu.kamau.achieng.muthoni.njeri.chebet@acmeteacherssavings.example',
      }),
    ],
    // Newest first is reverse seed order: Acme lists Nyokabi … Achieng, then Jane; the platform
    // lists Sara, Peter, then Jane.
    memberships: [
      ...state.memberships,
      member(1, IDS.platformOrganisation, ids.peter, 'ADMIN'),
      member(2, IDS.platformOrganisation, ids.sara, 'ADMIN'),
      member(3, IDS.acme, IDS.jane, 'ADMIN'),
      member(4, IDS.acme, ids.achieng, 'STAFF'),
      member(5, IDS.acme, ids.baraka, 'STAFF'),
      member(6, IDS.acme, ids.chebet, 'STAFF'),
      member(7, IDS.acme, ids.daudi, 'STAFF', 'PENDING_APPROVAL'),
      member(8, IDS.acme, ids.esi, 'STAFF'),
      member(9, TENANT_SCENARIO_IDS.pwani, ids.esi, 'STAFF'),
      member(10, IDS.acme, ids.faraji, 'STAFF'),
      member(11, IDS.acme, ids.nyokabi, 'STAFF'),
    ],
    branches: [
      ...state.branches,
      { ...branch(ids.acmeHeadOffice, IDS.acme, 'HEAD_OFFICE', 'Head Office', 'HEAD_OFFICE') },
      {
        ...branch(ids.acmeMombasaRoad, IDS.acme, 'MOMBASA_RD', 'Mombasa Road Branch', 'OPERATIONS'),
        ...at('2026-07-10T08:00:00Z', { parentBranchId: ids.acmeHeadOffice }),
      },
      {
        ...branch(ids.acmeNakuru, IDS.acme, 'NAKURU', 'Nakuru Branch', 'OPERATIONS'),
        createdAt: '2026-07-20T08:00:00Z',
        updatedAt: '2026-08-01T09:30:00Z',
        status: 'SUSPENDED',
        statusReason: 'Premises under renovation',
      },
      {
        ...branch(ids.acmeKisumu, IDS.acme, 'KISUMU', 'Kisumu Branch', 'OPERATIONS'),
        ...at('2026-08-15T08:00:00Z', { status: 'DRAFT' }),
      },
      {
        ...branch(ids.acmeLikoni, IDS.acme, 'LIKONI', LONG_BRANCH_NAME, 'OPERATIONS'),
        ...at('2026-08-20T08:00:00Z', { parentBranchId: ids.acmeMombasaRoad }),
      },
      {
        ...branch(
          ids.pwaniHeadOffice,
          TENANT_SCENARIO_IDS.pwani,
          'HEAD_OFFICE',
          'Head Office',
          'HEAD_OFFICE',
        ),
        ...at('2026-08-20T08:00:00Z'),
      },
    ],
    roles: [
      ...state.roles.map((candidate) =>
        candidate.id === IDS.platformAdminRole
          ? { ...candidate, permissions: [...candidate.permissions, ...PLATFORM_RECORD_CODES] }
          : candidate,
      ),
      role(ids.acmeAdminRole, IDS.acme, 'TENANT_ADMIN', 'Tenant admin', [
        'auth.select_organisation',
        'branch.view',
        'branch.create',
      ]),
    ],
    roleAssignments: [
      ...state.roleAssignments,
      tenantRoleAssignment(ids.janeAcmeRoleAssignment, IDS.acme, IDS.jane, ids.acmeAdminRole),
    ],
  };
}
```

      The `member` id helper gives `…c1` … `…cb` (`n.toString(16)` for 10 and 11 is `a`, `b`). Add
      `FakeBranch`, `FakeMembership`, `FakeUser` to the existing type import if missing. Then the two
      `BUILDERS` entries, last:

```ts
  // Layer 17 (platform records). `platform-records-read-only` has the same data without the four
  // mutation codes and without tenant.approve (no badge), for the gated-control cases.
  'platform-records': platformRecordsScenario,
  'platform-records-read-only': () =>
    withoutPermission(platformRecordsScenario(), ...PLATFORM_RECORD_CODES, 'tenant.approve'),
```

- [ ] **Step 6: Extend `contextFor`** (`e2e/support/fake-api.ts`): a fourth parameter
      `organisationId: string = IDS.greenfield`, sent as `organisation_id`; the doc comment gains
      "`organisationId` defaults to Greenfield; pass `IDS.platformOrganisation` for the platform
      context". No caller changes.

- [ ] **Step 7: Run** — form P on the three changed `.mts` files and the new one; form E on
      `e2e/fake-api-platform-records.spec.ts e2e/fake-api.spec.ts e2e/fake-api-branches.spec.ts
e2e/fake-api-users.spec.ts`. Expected: all pass. Mutation proofs (scratch, reverted): make
      `canCreateIn` return `true` (test 3's Pwani 403 fails); drop the `.reverse()` in
      `institutionUserPage` (test 5's order fails); make `objectBody` permissive (tests 4 and 8 fail);
      set `user.status` on a membership instead of the user (test 6's Pwani read fails).

- [ ] **Step 8: Commit** (form C) — the seven files

```
test(fake-api): add platform branch, user and account routes and the platform-records scenarios

The fake serves an institution's branches and users, the platform branch draft (refused unless
the operator is a member with branch.create there, BG-18) and the global account suspend,
reactivate and deactivate, sharing the tenant routes' list and wire helpers. Two scenarios build
on platform-tenants: one with the mutation codes, one without.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

- [ ] **Step 9 (droppable, Q9): pin two of 16's remaining fake quirks.** In
      `e2e/fake-api-platform-tenants.spec.ts`, add one test, "answers an unknown tenant's suspend and
      a rejected tenant's code with a 500 (BG-07, BG-28)", in its own run of `platform-tenants`
      (reads only its seeds; nothing else in that file moves): suspend
      `00000000-0000-4000-8000-0000000000ff` (unknown) with `{ reason: 'Compliance review' }` → 500
      `internal_error`; create the file's `DRAFT` with `tenant_code: 'nairobi-metro-teachers'` (the
      rejected tenant's code) → 500 `internal_error`. The third item, the creator-only maker-checker
      arm, needs a second operator acting in the same run (the fake has one actor per run) or a new
      seed that would move 16's or 17's counts: it stays deferred, and the report says so. Commit
      (form C) as `test(fake-api): pin the platform tenant routes' unknown-id and taken-code 500s`
      (two trailers). If anything here fails for a reason outside these two rows, `git restore` and
      report it deferred.

---

### Task 4: The Branches tab, the branch record and the branch draft

Three sub-tasks, each briefed, implemented and reviewed on its own: **4a** (08's additive props, the
client wrapper and the draft page), **4b** (the record's tabs, the Branches tab and the branch
record) and **4c** (16's carry-ins, droppable). Commit A lands in 4a; 4a leaves its wrapper and
draft page uncommitted for its review, and 4b commits them with its own files as commit B; commit C
lands in 4c. The layer ships as one squashed commit; these commits are working-branch history.

**Interfaces (all three sub-tasks):**

- Consumes: Tasks 1–2; `ListToolbar`, `ListNavigationProvider`, `ListNavigationProgress`,
  `ListBusyRegion`, `TablePaginationBar`, `SectionCard`, `RecordHero`, `DescriptionList`,
  `StatusChip`, `CopyIdButton`, `EmptyState`, `ErrorState`, `ForbiddenState`, `PageHeader`;
  `load`, `lastPageIfPastEnd`, `hrefWith`, `toSearchParams`, `formatInstant`, `formatBusinessDate`,
  `shortId`; `can`, `canAll`; 08's `BRANCH_STATUSES`, `BRANCH_TYPE_SUGGESTIONS`,
  `parseBranchListQuery`, `branchTypeLabel`, `isTimeZone`; 16's `getTenant`, `TenantStatus`.
- Produces: `BranchDirectoryTable`'s optional `basePath` (default `'/admin/branches'`),
  `createdLabel` (default `'Created'`) and `nameMaxWidth` (default `320`); `BranchDraftForm`'s
  optional `action` (default `createBranchDraft`), `cancelHref` (default `'/admin/branches'`),
  `hiddenFields`, `parentsNote`;
  `InstitutionBranchDraftForm({ tenantId, parents, parentsNote?, defaultTimeZone, contextOrganisationId? })`;
  the three routes; the record's Branches and Users tabs; 16's `bootstrapStatusLabel(status)`.

#### Task 4a: 08's additive props, the client wrapper and the draft page

**Files:**

- Modify: `modules/administration/branches/components/branch-directory-table.tsx` and its test
  (commit A, additive)
- Modify: `modules/administration/branches/components/branch-draft-form.tsx` and its test (commit A,
  additive)
- Create: `modules/platform-administration/branches/components/institution-branch-draft-form.tsx`,
  `…-draft-form.test.tsx` (uncommitted; 4b's commit B)
- Create: `app/(authenticated)/platform-admin/tenants/[tenantId]/branches/new/page.tsx`,
  `page.test.tsx` (uncommitted; 4b's commit B)

- [ ] **Step 1: 08's components, failing tests first** (commit A). In
      `branch-directory-table.test.tsx` add "links into another workspace and labels its times when
      asked": render with `basePath="/platform-admin/tenants/T/branches"`, `createdLabel="Created (UTC)"`,
      `timeZone="UTC"` → the first name link's `href` is `/platform-admin/tenants/T/branches/<id>` and
      `getByRole('columnheader', { name: /Created \(UTC\)/ })` exists. Add too (the file's `LONG` and
      `BRANCHES` fixtures):

```tsx
it.each([
  [undefined, '320px'],
  [200, '200px'],
] as const)(
  'caps the name link at the width it is given, 320 px by default (%s)',
  (nameMaxWidth, expected) => {
    renderWithProviders(
      <BranchDirectoryTable
        branches={BRANCHES}
        sort={{ by: 'branchName', dir: 'ASC' }}
        sortHref={(field) => `/sort/${field}`}
        timeZone="Africa/Nairobi"
        nameMaxWidth={nameMaxWidth}
      />,
    );
    expect(screen.getByRole('link', { name: LONG })).toHaveStyle({ maxWidth: expected });
  },
);
```

      (jsdom can't compute `min(320px, 60vw)`, so the unit test pins the prop with a plain width and
      Task 9a test 1 pins the Branches tab's `min()` at 375 px.) In `branch-draft-form.test.tsx`
      add (constants `TENANT = '99999999-9999-4999-8999-999999999999'`, `ORG = '00000000-0000-0000-0000-000000000000'`):

```ts
it('submits through a passed action with its hidden fields, the key and the organisation', async () => {
  const user = userEvent.setup();
  const action = vi.fn().mockResolvedValueOnce(CONFLICT).mockResolvedValueOnce({ ok: true });
  const { code, name, create } = renderForm({
    action,
    hiddenFields: { tenantId: TENANT },
    contextOrganisationId: ORG,
    cancelHref: `/platform-admin/tenants/${TENANT}/branches`,
  });

  await user.type(code, 'THIKA');
  await user.type(name, 'Thika Road Branch');
  await user.click(create);
  expect(await screen.findByText('This code may already be in use.')).toBeInTheDocument();
  expect(code).toHaveValue('THIKA');
  await user.click(create);

  await waitFor(() => {
    expect(action).toHaveBeenCalledTimes(2);
  });
  const [first, second] = action.mock.calls.map((call) => call[1] as FormData);
  for (const sent of [first, second]) {
    expect(sent?.get('tenantId')).toBe(TENANT);
    expect(sent?.get('contextOrganisationId')).toBe(ORG);
    expect(sent?.get('idempotencyKey')).toMatch(UUID_PATTERN);
  }
  expect(second?.get('idempotencyKey')).toBe(first?.get('idempotencyKey'));
  expect(createBranchDraft).not.toHaveBeenCalled();
  expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
    'href',
    `/platform-admin/tenants/${TENANT}/branches`,
  );
});

it('says why the parent list is incomplete, in place of "Optional."', () => {
  renderForm({ parentsNote: 'Optional. Only the first 500 branches are listed.' });
  expect(screen.getByRole('combobox', { name: 'Parent branch' })).toHaveAccessibleDescription(
    'Optional. Only the first 500 branches are listed.',
  );
});
```

      Run form U on both: FAIL. Implement (additive; every default keeps 08's output):

```tsx
// branch-directory-table.tsx
interface BranchDirectoryTableProps {
  branches: readonly BranchSummary[];
  sort: ListSort<BranchSortField>;
  /** Server Component: this function prop never crosses to the client — keep it that way. */
  sortHref: (field: BranchSortField) => string;
  timeZone: string;
  /** Where a branch's record lives: 08's own by default; layer 17 passes an institution's. */
  basePath?: string;
  /** The Created column's header: the platform labels its UTC times (spec §9). */
  createdLabel?: string;
  /** The name link's cap: 320 px by default. Layer 17's tab passes `min(320px, 60vw)`, so a long
   * name's ellipsis stays inside a 375 px card (10's `NAME_MAX_WIDTH`). */
  nameMaxWidth?: number | string;
}
// signature: { branches, sort, sortHref, timeZone, basePath = '/admin/branches', createdLabel = 'Created', nameMaxWidth = 320 }
// header cell text: {field === 'createdAt' ? createdLabel : label}
// link: href={`${basePath}/${branch.id}`}
// link sx: { display: 'block', maxWidth: nameMaxWidth, fontWeight: 700 } (was maxWidth: 320)
```

```tsx
// branch-draft-form.tsx (props; the rest is unchanged)
interface BranchDraftFormProps {
  parents: readonly { id: string; label: string }[];
  defaultTimeZone: string;
  contextOrganisationId?: string;
  /** The Server Action submitted: 08's tenant create by default. Layer 17's client wrapper passes
   * the platform one (a Server Component never passes a function, AGENTS.md). */
  action?: FormAction;
  /** Where Cancel goes. */
  cancelHref?: string;
  /** Extra hidden fields the action needs, e.g. layer 17's `tenantId`. */
  hiddenFields?: Readonly<Record<string, string>>;
  /** Replaces the Parent branch helper "Optional." when the options couldn't load or were capped. */
  parentsNote?: string;
}
// signature adds: action = createBranchDraft, cancelHref = '/admin/branches', hiddenFields, parentsNote
// the reducer calls `await action(previous, formData)` (was createBranchDraft)
// onValid adds, after the FIELDS loop:
//   for (const [name, value] of Object.entries(hiddenFields ?? {})) formData.set(name, value);
// Parent branch helperText: errors.parentBranchId?.message ?? parentsNote ?? 'Optional.'
// Cancel: href={cancelHref}
```

      (`FormAction` comes from `@/lib/api/action-result` as a type import.) The same commit also
      makes the table's container the region "Branches table" (P-2, approved). Form U on both files, then form E on
      `e2e/branches.spec.ts`: PASS. Mutation proof (scratch, reverted): hard-code `maxWidth: 320`
      again (the `200px` row fails). Commit A (form C):

```
refactor(branches): let the directory table and the draft form serve the platform workspace

Optional props, each defaulting to today's behaviour: the table's record path, Created header
and name width, and the draft form's Server Action, Cancel target, extra hidden fields and
parent helper. The platform workspace (layer 17) reuses both for an institution's branches.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

- [ ] **Step 2: The client wrapper** — test first
      (`institution-branch-draft-form.test.tsx`: mock `../institution-branch-actions`; render with
      `tenantId`, one parent, `contextOrganisationId`; type a code and name, submit; assert the mocked
      `createInstitutionBranchDraft` received `tenantId`, `contextOrganisationId` and a UUID key, and
      Cancel links to `institutionBranchesHref(tenantId)`). Then:

```tsx
'use client';

import { BranchDraftForm } from '@/modules/administration/branches/components/branch-draft-form';
import { createInstitutionBranchDraft } from '../institution-branch-actions';
import { institutionBranchesHref } from '../institution-branch-query';

interface InstitutionBranchDraftFormProps {
  tenantId: string;
  parents: readonly { id: string; label: string }[];
  parentsNote?: string;
  defaultTimeZone: string;
  contextOrganisationId?: string;
}

/** 08's draft form bound to the platform route. The Server Action is passed here, in a Client
 * Component: a Server Component can't pass a function prop (AGENTS.md). */
export function InstitutionBranchDraftForm({ tenantId, ...form }: InstitutionBranchDraftFormProps) {
  return (
    <BranchDraftForm
      {...form}
      action={createInstitutionBranchDraft}
      cancelHref={institutionBranchesHref(tenantId)}
      hiddenFields={{ tenantId }}
    />
  );
}
```

- [ ] **Step 3: Write the draft page's failing test.** `branches/new/page.test.tsx` — the harness of
      `admin/users/[userId]/page.test.tsx` (hoisted mocks, `next/headers`, `notFound` throwing
      `NEXT_NOT_FOUND`), mocking `@/modules/platform-administration/branches/institution-branch-service`
      (`getInstitutionBranchIndex`), `…/tenants/tenant-service` (`getTenant`), `@/config/env.server`
      (`PLATFORM_ORGANISATION_ID: '00000000-0000-0000-0000-000000000000'`: `parseInstitutionId`
      reads it), `@/auth/context-service` and `…/branches/institution-branch-actions`. The default
      profile is resolved with `['branch.view', 'branch.create']` and the organisation
      `00000000-0000-0000-0000-000000000000`; `getTenant` resolves Acme SACCO, ACTIVE, timezone
      `Africa/Nairobi`; the index resolves Head Office. Tests:
  1. "shows the form with the BG-18 warning for an active institution" — `h1` "Create branch draft";
     the description `branchCreateDescription('Acme SACCO')`; a `note` with `branchCreateWarning('Acme SACCO')`;
     the Parent branch options come from the index as "Head Office (HEAD_OFFICE)"; the Timezone field
     holds `Africa/Nairobi`.
  2. "falls back to UTC for a zone the browser can't format" — tenant timezone `UTC+3` → the field
     holds `UTC`.
  3. "says when the branch names couldn't be read, instead of offering none silently" — the index
     rejects → the Parent branch description is `PARENTS_UNAVAILABLE`.
  4. "refuses without branch.create and branch.view" — permissions `['branch.view']` → "You don't have
     permission" and a "Back to branches" link; no form.
  5. "refuses an institution that isn't active" — status `SUSPENDED` → `BRANCH_CREATE_INACTIVE.title` and
     `.description`; no form; the index is never read.
  6. "answers an unknown institution with the not-found page" — `getTenant` 404 → `NEXT_NOT_FOUND`.

     Run it (form U): FAIL (the route is missing).

- [ ] **Step 4: The draft page** — `[tenantId]/branches/new/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { canAll } from '@/auth/permissions';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { isTimeZone } from '@/modules/administration/branches/branch-rules';
import { InstitutionBranchDraftForm } from '@/modules/platform-administration/branches/components/institution-branch-draft-form';
import { institutionBranchesHref } from '@/modules/platform-administration/branches/institution-branch-query';
import {
  BRANCH_CREATE_CODES,
  BRANCH_CREATE_INACTIVE,
  branchCreateDescription,
  branchCreateWarning,
  parentsNote,
} from '@/modules/platform-administration/branches/institution-branch-rules';
import { getInstitutionBranchIndex } from '@/modules/platform-administration/branches/institution-branch-service';
import { parseInstitutionId } from '@/modules/platform-administration/tenants/institution-id';
import { getTenant } from '@/modules/platform-administration/tenants/tenant-service';

export const metadata: Metadata = { title: 'Create branch draft' };

const EYEBROW = 'Platform administration · Branches';

interface NewInstitutionBranchPageProps {
  params: Promise<{ tenantId: string }>;
}

/** Spec §11.2's create draft, with BG-18's warning (Ruling 8). Outside `(record)`: no hero. */
export default async function NewInstitutionBranchPage({ params }: NewInstitutionBranchPageProps) {
  const tenantId = parseInstitutionId((await params).tenantId);
  if (!tenantId) notFound();

  const [tenant, selected] = await Promise.all([
    load(getTenant(tenantId)),
    getCurrentContextProfile(),
  ]);
  const header = (description?: string) => (
    <PageHeader eyebrow={EYEBROW} title="Create branch draft" description={description} />
  );
  if (!tenant.ok) {
    if (tenant.problem.code === 'resource_not_found') notFound();
    return (
      <>
        {header()}
        <Paper>
          {tenant.problem.code === 'forbidden' ? (
            <ForbiddenState />
          ) : (
            <ErrorState problem={tenant.problem} />
          )}
        </Paper>
      </>
    );
  }

  const record = tenant.value;
  const resolved = selected.kind === 'resolved' ? selected : null;
  const branchesHref = institutionBranchesHref(tenantId);
  const back = (
    <Button component={NextLink} href={branchesHref} variant="outlined">
      Back to branches
    </Button>
  );
  if (!canAll({ permissions: resolved?.profile.permissions ?? [] }, BRANCH_CREATE_CODES)) {
    return (
      <>
        {header()}
        <Paper>
          <ForbiddenState action={back} />
        </Paper>
      </>
    );
  }
  if (record.status !== 'ACTIVE') {
    return (
      <>
        {header()}
        <Paper>
          <ForbiddenState
            title={BRANCH_CREATE_INACTIVE.title}
            description={BRANCH_CREATE_INACTIVE.description}
            action={back}
          />
        </Paper>
      </>
    );
  }

  // Parents: a bounded index (≤ 500, Ruling 8). A failed read says so in the picker (rule 9).
  const index = await load(getInstitutionBranchIndex(tenantId));
  const parents = index.ok
    ? [...index.value.names].map(([id, branch]) => ({
        id,
        label: `${branch.name} (${branch.code})`,
      }))
    : [];

  return (
    <>
      {header(branchCreateDescription(record.displayName))}
      <Paper>
        <Alert severity="warning" role="note" sx={{ m: 4.5, mb: 0 }}>
          {branchCreateWarning(record.displayName)}
        </Alert>
        <InstitutionBranchDraftForm
          tenantId={tenantId}
          parents={parents}
          parentsNote={parentsNote(
            index.ok ? { ok: true, truncated: index.value.truncated } : { ok: false },
          )}
          // Java ZoneIds Intl can't format (e.g. `UTC+3`) would fail the form's own check.
          defaultTimeZone={isTimeZone(record.timezone) ? record.timezone : 'UTC'}
          contextOrganisationId={resolved?.context.organization.id}
        />
      </Paper>
    </>
  );
}
```

- [ ] **Step 5: Run** — form U on `branch-directory-table.test.tsx`, `branch-draft-form.test.tsx`,
      `institution-branch-draft-form.test.tsx` and `branches/new/page.test.tsx`: PASS. Mutation
      proof (scratch, reverted): render the form for a SUSPENDED institution (test 5 fails).

**Gate (4a):** commit A is in, with the two trailers; the four tests above pass; form E on
`e2e/branches.spec.ts` passed after commit A; `git status --short` lists exactly the wrapper, its
test, the draft page and its test (untracked), which 4b commits.

**Review note (4a):** read commit A's diff and the four untracked files. Check first: every new
prop's default reproduces 08's markup (08's own tests unchanged and green); `nameMaxWidth` reaches
only the name link; the Server Action reaches `BranchDraftForm` only through the `'use client'`
wrapper (AGENTS.md: no function prop from a Server Component); the hidden `tenantId`, the
organisation and the minted key are sent, and the key is reused after a refused submit; the draft
page reads nothing before `parseInstitutionId`, refuses without both codes and for a non-ACTIVE
institution, and says so when the parent index failed or was capped.

#### Task 4b: The record's tabs, the Branches tab and the branch record

**Files:**

- Modify: `app/(authenticated)/platform-admin/tenants/[tenantId]/(record)/layout.tsx` (two tabs)
- Create: `app/(authenticated)/platform-admin/tenants/[tenantId]/(record)/layout.test.tsx` (16's
  layout has none; this one pins the tabs, and 4c adds the subtitle)
- Create: `app/(authenticated)/platform-admin/tenants/[tenantId]/(record)/branches/page.tsx`,
  `page.test.tsx`
- Create: `app/(authenticated)/platform-admin/tenants/[tenantId]/branches/[branchId]/page.tsx`,
  `page.test.tsx`
- Create: `app/(authenticated)/platform-admin/records-id-guard.test.tsx`
- Commit B also carries 4a's four uncommitted files.

- [ ] **Step 1: The record's tabs, test first.** `(record)/layout.test.tsx` (the harness of 10's
      `admin/users/[userId]/layout.test.tsx` and 16's `institution-id-guard.test.tsx`):

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

// Lettered, so its upper-case form differs from it.
const PLATFORM = 'abcdef01-2345-4678-89ab-cdef01234567';
const INSTITUTION = '17000000-0000-4000-8000-0000000000ac';

const { getCurrentContextProfile, getTenant } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  getTenant: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  usePathname: () => `/platform-admin/tenants/${INSTITUTION}`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/config/env.server', () => ({ serverEnv: { PLATFORM_ORGANISATION_ID: PLATFORM } }));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: (...args: unknown[]) => getCurrentContextProfile(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/tenants/tenant-service', () => ({
  getTenant: (...args: unknown[]) => getTenant(...args) as unknown,
}));
// The hero's dialogs import the Server Actions; nothing here submits one.
vi.mock('@/modules/platform-administration/tenants/tenant-actions', () => ({
  approveTenant: vi.fn(),
  deprovisionTenant: vi.fn(),
  reactivateTenant: vi.fn(),
  rejectTenant: vi.fn(),
  submitTenant: vi.fn(),
  suspendTenant: vi.fn(),
}));

const { default: TenantRecordLayout } = await import('./layout');

async function show(permissions: string[]) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { permissions, user_id: '17000000-0000-4000-8000-0000000000ef' },
    context: { organization: { id: PLATFORM, name: 'Platform' }, branch: null },
  });
  renderWithProviders(
    await TenantRecordLayout({
      children: <p>Tab body</p>,
      params: Promise.resolve({ tenantId: INSTITUTION }),
    }),
  );
}

const tabNames = () =>
  within(screen.getByRole('navigation', { name: 'Acme SACCO sections' }))
    .getAllByRole('tab')
    .map((tab) => tab.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  getTenant.mockResolvedValue({
    id: INSTITUTION,
    tenantCode: 'acme',
    displayName: 'Acme SACCO',
    countryCode: 'KE',
    status: 'ACTIVE',
  });
});

describe('TenantRecordLayout: the tabs', () => {
  it('adds Branches and Users after Provisioning, each linking to its route', async () => {
    await show(['tenant.view', 'branch.view', 'user.view']);

    expect(tabNames()).toEqual(['Overview', 'Provisioning', 'Branches', 'Users']);
    expect(screen.getByRole('tab', { name: 'Branches' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${INSTITUTION}/branches`,
    );
    expect(screen.getByRole('tab', { name: 'Users' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${INSTITUTION}/users`,
    );
  });

  it.each([
    [
      ['tenant.view', 'user.view'],
      ['Overview', 'Provisioning', 'Users'],
    ],
    [
      ['tenant.view', 'branch.view'],
      ['Overview', 'Provisioning', 'Branches'],
    ],
    [['tenant.view'], ['Overview', 'Provisioning']],
  ])('offers a tab only with its view code: %j', async (permissions, tabs) => {
    await show(permissions);

    expect(tabNames()).toEqual(tabs);
  });
});
```

      Run it (form U): FAIL (two tabs). Then, in `[tenantId]/(record)/layout.tsx`, name the holder
      once and add the two tabs (import `can` from `@/auth/permissions`):

```tsx
  const holder = { permissions: resolved?.profile.permissions ?? [] };
  const actions = availableTenantActions(record.status, holder);
  // …
        tabs={[
          { href: base, label: 'Overview' },
          { href: `${base}/provisioning`, label: 'Provisioning' },
          // Each tab reads its own list, which needs its view code (contract §E.2).
          ...(can(holder, 'branch.view') ? [{ href: `${base}/branches`, label: 'Branches' }] : []),
          ...(can(holder, 'user.view') ? [{ href: `${base}/users`, label: 'Users' }] : []),
        ]}
```

      The Users tab's page arrives in Task 5; until then its link answers the not-found page (both
      tasks land before the layer is cut). Form U: PASS.

- [ ] **Step 2: Write the failing page tests.**
      `branches/[branchId]/page.test.tsx` — the harness of `admin/users/[userId]/page.test.tsx`
      (hoisted mocks, `next/headers`, `notFound` throwing `NEXT_NOT_FOUND`), mocking
      `@/modules/platform-administration/branches/institution-branch-service`
      (`getInstitutionBranch`, `getInstitutionBranchIndex`), `…/tenants/tenant-service` (`getTenant`) and
      `@/config/env.server` (`PLATFORM_ORGANISATION_ID: '00000000-0000-0000-0000-000000000000'`). The
      runner's zone is Africa/Nairobi (`vitest.config.ts`), so a time printed in UTC proves the page
      used UTC. Fixture `MOMBASA` = `{ id: B, branchCode: 'MOMBASA_RD', branchName: 'Mombasa Road
Branch', branchType: 'OPERATIONS', parentBranchId: HEAD, status: 'ACTIVE', timezone:
'Africa/Nairobi', openedOn: null, closedOn: null, statusReason: null, createdAt:
'2026-07-10T08:00:00Z', updatedAt: '2026-07-24T08:00:00Z' }`. Tests:
  1. "shows the branch read-only, in UTC, with its institution and parent" — `h1` "Mombasa Road
     Branch"; subtitle "MOMBASA_RD · Acme SACCO"; the fact "Created (UTC)" reads "10 Jul 2026 · 08:00"
     and "Updated (UTC)" "24 Jul 2026 · 08:00"; "Parent branch" is a link "Head Office" to
     `/platform-admin/tenants/${T}/branches/${HEAD}`; "Institution" is a link "Acme SACCO" to
     `/platform-admin/tenants/${T}`; "Back to branches" links to the tab; the only button in `main` is
     "Copy Branch ID"; neither "Opened on" nor "Closed on" is listed; `BRANCH_DETAIL_DESCRIPTION` shows.
  2. "names the parent by its short id when the branch names couldn't be read" — the index rejects →
     the "Parent branch" link reads `shortId(HEAD)`.
  3. "leaves the institution name out when it couldn't be read" — `getTenant` rejects with a 503 → the
     subtitle is "MOMBASA_RD", the "Institution" link reads `shortId(T)`.
  4. "shows opened and closed dates only when present" — `openedOn: '01-08-2026'` → "Opened on" reads
     `formatBusinessDate('01-08-2026', 'short')`; "Last status reason" shows `—` when null and the
     reason when set.
  5. "answers a 404 with the not-found page and a 403 with the permission state" — `BackendApiError(404,
{ code: 'resource_not_found' })` → rejects `NEXT_NOT_FOUND`; `BackendApiError(403, { code: 'forbidden' })`
     → the `h1` "Branch record" and "You don't have permission".

     `(record)/branches/page.test.tsx` — the harness of `platform-admin/tenants/page.test.tsx`
     (hoisted mocks; `next/headers`; `next/navigation` with `notFound` throwing `NEXT_NOT_FOUND`,
     `usePathname`, `useRouter` and `useSearchParams`), mocking `@/config/env.server`
     (`PLATFORM_ORGANISATION_ID: '00000000-0000-0000-0000-000000000000'`), `@/auth/context-service`,
     `…/tenants/tenant-service` (`getTenant`) and `…/branches/institution-branch-service`
     (`listInstitutionBranches`). Defaults: a resolved profile with `['branch.view', 'branch.create']`;
     Acme SACCO, ACTIVE; one branch, `MOMBASA` (id `B`), of one. Render
     `await BranchesTab({ params: Promise.resolve({ tenantId: T }), searchParams: Promise.resolve({}) })`.
     Tests:
  - "offers Create branch draft for an active institution to a holder of both codes" — the link
    "Create branch draft" → `/platform-admin/tenants/${T}/branches/new`; the row link "Mombasa Road
    Branch" → `/platform-admin/tenants/${T}/branches/${B}`; the column header "Created (UTC)".
  - "offers no draft for an institution that isn't active, or without branch.create" — status
    `SUSPENDED` → no link "Create branch draft"; ACTIVE with `['branch.view']` → none either.
  - "shows the permission state on a 403 and the error state otherwise" — the list rejects
    `new BackendApiError(403, { code: 'forbidden' })` → "You don't have permission" inside the
    section "Branches"; it rejects `new BackendApiError(503, { requestId: 'req-b' })` → "Reference:
    req-b" and no "You don't have permission".
  - "words the empty state by its filters" — an empty page: with `searchParams` `{}` → "This
    institution has no branches yet."; with `{ status: 'SUSPENDED' }` → "No branches match these
    filters.".

    `app/(authenticated)/platform-admin/records-id-guard.test.tsx` — modelled on
    `admin/users/[userId]/user-id-guard.test.tsx` and 16's `institution-id-guard.test.tsx`: every read
    a route can make is a hoisted mock that rejects; `@/config/env.server` gives the lettered
    `PLATFORM = 'abcdef01-2345-4678-89ab-cdef01234567'`; the profile is a real kind:
    `{ kind: 'redirect-to-context-selection', reason: 'invalid-context' } satisfies SelectedContextProfile`;
    the action modules are mocked. `INSTITUTION = '17000000-0000-4000-8000-0000000000ac'`,
    `BRANCH = '17000000-0000-4000-8000-0000000000b2'`. Routes in this sub-task: the Branches tab
    (`{ params: { tenantId }, searchParams: {} }`), the branch record (`{ params: { tenantId, branchId } }`),
    the draft page from 4a (`{ params: { tenantId } }`). Cases:

```ts
it.each([
  ['a malformed institution id', 'pwani-fishermen', BRANCH],
  ['a path-like institution id', '../x', BRANCH],
  ['the platform organisation', PLATFORM, BRANCH],
  ['the platform organisation in upper case', PLATFORM.toUpperCase(), BRANCH],
  ['an empty institution id', '', BRANCH],
])('answers %s with not-found, without reading the backend', async (_case, tenantId, branchId) => {
  await expect(render(tenantId, branchId)).rejects.toThrow('NEXT_NOT_FOUND');
  for (const [name, read] of Object.entries(reads)) expect(read, name).not.toHaveBeenCalled();
});
```

      plus, for the branch record only, `['a malformed branch id', INSTITUTION, 'not-a-uuid']` and
      `['a branch id with a tail', INSTITUTION, `${BRANCH}x`]`; and the positive control "reads
      upper-case ids in lower case, and in no other" (render with both ids upper-cased; the first
      read the route makes is called with `INSTITUTION` and, for the record, `BRANCH`).

- [ ] **Step 3: Run them to verify they fail** — form U. Expected: FAIL (routes missing).

- [ ] **Step 4: The Branches tab** — `[tenantId]/(record)/branches/page.tsx` (metadata title
      "Branches"; props `params: Promise<{ tenantId: string }>` and `searchParams`). Copy
      `app/(authenticated)/admin/branches/page.tsx` (the toolbar's three fields, the type options, the
      past-the-end redirect, `ListNavigationProvider`/`ListNavigationProgress`/`ListBusyRegion`, the
      sort links) with exactly these differences:
  - First line: `const tenantId = parseInstitutionId((await params).tenantId); if (!tenantId)
notFound();` (rule 7: before any read). `PATH` becomes `const path = institutionBranchesHref(tenantId)`.
  - Reads: `Promise.all([load(getTenant(tenantId)), getCurrentContextProfile(),
load(listInstitutionBranches(tenantId, query))])` — `getTenant` is the layout's cached read;
    `if (!tenant.ok) return null;` (the layout renders that failure). No `getOrganisationTimeZone`:
    `timeZone="UTC"` on `ListToolbar` and `BranchDirectoryTable`.
  - No `PageHeader` (the hero is the layout's) and no outer `Paper`: everything sits in one
    `SectionCard title="Branches" description={BRANCHES_DESCRIPTION}` whose `actions` is the
    contained "Create branch draft" button (`AddOutlined`, `href={`${path}/new`}`) only when
    `canCreateInstitutionBranch(tenant.value.status, holder)`; inside it a
    `<Box sx={{ position: 'relative' }}>` takes the `Paper`'s place.
  - A failed list read renders, inside the same card, `ForbiddenState` when
    `branches.problem.code === 'forbidden'`, else `ErrorState`.
  - Empty state: title "No branches"; description `'No branches match these filters.'` when filtered,
    else `'This institution has no branches yet.'`.
  - `BranchDirectoryTable` gains `basePath={path}`, `createdLabel="Created (UTC)"` and
    `nameMaxWidth="min(320px, 60vw)"` (a comment: "10's `NAME_MAX_WIDTH`: at 375 px a 320 px name
    runs past the card's edge"); its `sortHref` and the redirect use `path`.

- [ ] **Step 5: The branch record** — `[tenantId]/branches/[branchId]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import { CopyIdButton } from '@/components/data-display/copy-id-button';
import { DescriptionList, type DescriptionItem } from '@/components/data-display/description-list';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { RecordHero } from '@/components/data-display/record-hero';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { formatBusinessDate, formatInstant, shortId } from '@/lib/format';
import { branchTypeLabel } from '@/modules/administration/branches/branch-rules';
import { institutionBranchesHref } from '@/modules/platform-administration/branches/institution-branch-query';
import {
  BRANCH_DETAIL_DESCRIPTION,
  parseBranchId,
} from '@/modules/platform-administration/branches/institution-branch-rules';
import {
  getInstitutionBranch,
  getInstitutionBranchIndex,
} from '@/modules/platform-administration/branches/institution-branch-service';
import { parseInstitutionId } from '@/modules/platform-administration/tenants/institution-id';
import { getTenant } from '@/modules/platform-administration/tenants/tenant-service';

export const metadata: Metadata = { title: 'Branch record' };

const EYEBROW = 'Platform administration · Branch record';

/** The platform workspace shows instants in UTC, labelled (spec §9). */
function utc(iso: string): string {
  const when = formatInstant(iso, 'UTC');
  return `${when.date} · ${when.time}`;
}

interface InstitutionBranchPageProps {
  params: Promise<{ tenantId: string; branchId: string }>;
}

/** A branch read-only (spec §11.2): the platform has no branch lifecycle, edit or address (BG-13). */
export default async function InstitutionBranchPage({ params }: InstitutionBranchPageProps) {
  const raw = await params;
  const tenantId = parseInstitutionId(raw.tenantId);
  const branchId = parseBranchId(raw.branchId);
  if (!tenantId || !branchId) notFound(); // rule 7: before any read

  const [branch, tenant] = await Promise.all([
    load(getInstitutionBranch(tenantId, branchId)),
    load(getTenant(tenantId)),
  ]);
  if (!branch.ok) {
    if (branch.problem.code === 'resource_not_found') notFound();
    return (
      <>
        <PageHeader eyebrow={EYEBROW} title="Branch record" />
        <Paper>
          {branch.problem.code === 'forbidden' ? (
            <ForbiddenState />
          ) : (
            <ErrorState problem={branch.problem} />
          )}
        </Paper>
      </>
    );
  }

  const record = branch.value;
  // A name only: a failed read degrades to the short id, never to a false name (rule 9).
  const institution = tenant.ok ? tenant.value.displayName : null;
  const parents = record.parentBranchId ? await load(getInstitutionBranchIndex(tenantId)) : null;
  const parentName =
    record.parentBranchId && parents?.ok
      ? parents.value.names.get(record.parentBranchId)?.name
      : undefined;
  const branchesHref = institutionBranchesHref(tenantId);

  const items: DescriptionItem[] = [
    { label: 'Branch name', value: record.branchName },
    { label: 'Branch code', value: record.branchCode },
    {
      label: 'Institution',
      value: (
        <Link component={NextLink} href={`/platform-admin/tenants/${tenantId}`}>
          {institution ?? shortId(tenantId)}
        </Link>
      ),
    },
    { label: 'Type', value: branchTypeLabel(record.branchType) },
    { label: 'Status', value: <StatusChip value={record.status} /> },
    {
      label: 'Parent branch',
      value: record.parentBranchId ? (
        <Link component={NextLink} href={`${branchesHref}/${record.parentBranchId.toLowerCase()}`}>
          {parentName ?? shortId(record.parentBranchId)}
        </Link>
      ) : (
        '—'
      ),
    },
    { label: 'Timezone', value: record.timezone },
    { label: 'Last status reason', value: record.statusReason ?? '—' },
    // Never set by the API today (BG-13): shown only when present.
    ...(record.openedOn
      ? [{ label: 'Opened on', value: formatBusinessDate(record.openedOn, 'short') }]
      : []),
    ...(record.closedOn
      ? [{ label: 'Closed on', value: formatBusinessDate(record.closedOn, 'short') }]
      : []),
    { label: 'Created (UTC)', value: utc(record.createdAt) },
    { label: 'Updated (UTC)', value: utc(record.updatedAt) },
    { label: 'Branch ID', value: <CopyIdButton value={record.id} label="Branch ID" /> },
  ];

  return (
    <>
      <RecordHero
        back={{ href: branchesHref, label: 'Back to branches' }}
        avatar={{ kind: 'icon', icon: <AccountTreeOutlined /> }}
        eyebrow={EYEBROW}
        title={record.branchName}
        subtitle={institution ? `${record.branchCode} · ${institution}` : record.branchCode}
        status={<StatusChip value={record.status} />}
      />
      <Box sx={{ mt: 4 }}>
        <SectionCard title="Branch details" description={BRANCH_DETAIL_DESCRIPTION}>
          <DescriptionList items={items} />
        </SectionCard>
      </Box>
    </>
  );
}
```

- [ ] **Step 6: Run** — form U on `(record)/layout.test.tsx`, `(record)/branches/page.test.tsx`,
      `branches/[branchId]/page.test.tsx`, `records-id-guard.test.tsx` and 4a's two tests: PASS;
      then form E on `e2e/platform-tenants.spec.ts e2e/platform-administration.spec.ts` (the tabs are
      new on 16's record; nothing there may change). Prove the tests can fail (scratch, reverted):
      drop the `notFound()` line from the branch record (its malformed-id guard rows fail); drop
      `.toLowerCase()` in `parseBranchId` (the positive control fails); drop the `user.view` check
      on the Users tab (the layout test's `['tenant.view', 'branch.view']` row fails); offer the
      draft button without `canCreateInstitutionBranch` (the tab test's SUSPENDED row fails).
      Pre-flight note 9 is resolved; a route conflict for the shared `branches` segment would be a
      regression: STOP and report.

- [ ] **Step 7: Commit B** (form C) — 4a's wrapper and its test and the draft page and its test, the
      layout and its new test, the Branches tab and its test, the branch record and its test, and
      the guard test (eleven files):

```
feat(platform): add an institution's Branches tab, branch record and branch draft

The institution record gains a Branches tab with the /branches filters and sort, a read-only
branch record in UTC, and a branch draft for active institutions that warns about BG-18 and
explains the platform's refusal. Every id is checked and lower-cased before any read.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate (4b):** commit B is in, with the two trailers; `git status --short` is empty; the six unit
test files above pass; form E on `e2e/platform-tenants.spec.ts e2e/platform-administration.spec.ts`
passed.

**Review note (4b):** read commit B's diff (4a's four files were reviewed in 4a; check only that
they are unchanged). Check first: every route rejects a malformed, path-like, platform-organisation
or empty id before any read and lower-cases the rest; each tab needs its own view code; the draft
button needs an ACTIVE institution and both codes; a failed list read is `ForbiddenState` on a 403
and `ErrorState` otherwise, never an empty list; the branch record shows UTC with "(UTC)" labels,
and a failed index or tenant read degrades to a short id, never to a wrong name; the tab passes
`nameMaxWidth`.

#### Task 4c: 16's carry-ins (Q9; droppable) and the drafter lookup (P-1)

**Files:**

- Modify: `modules/platform-administration/tenants/tenant-rules.ts` and its test
- Modify: `modules/platform-administration/tenants/components/tenant-directory-table.tsx`
- Modify: `modules/platform-administration/tenants/components/provisioning-timeline.tsx` and its test
- Modify: `app/(authenticated)/platform-admin/tenants/[tenantId]/(record)/page.tsx`
- Modify: `app/(authenticated)/platform-admin/tenants/[tenantId]/(record)/layout.tsx` (the hero's
  subtitle) and 4b's `layout.test.tsx`
- P-1 (Step 3, commit D): modify `modules/administration/branches/branch-service.ts` and its test
  and `app/(authenticated)/admin/branches/[branchId]/layout.tsx`; create
  `app/(authenticated)/admin/branches/[branchId]/layout.test.tsx`

- [ ] **Step 1: Tests first.** `tenant-rules.test.ts`
      gains "words every bootstrap status" (`BOOTSTRAP_STATUSES.map(bootstrapStatusLabel)` equals
      `['Not started', 'Waiting for approval', 'Queued', 'Setting up the first administrator',
'Completed', 'Failed']`); `provisioning-timeline.test.tsx` gains "explains the failure code in
      words" (`getByText(FAILURE_CODE_NOTE)` with the code still shown); `(record)/layout.test.tsx`
      gains:

```tsx
describe('TenantRecordLayout: the hero', () => {
  it('writes the subtitle as the tenant code, then the country as the Overview does', async () => {
    await show(['tenant.view']);

    expect(screen.getByText('acme · KE · Kenya')).toBeInTheDocument();
  });
});
```

      Run them (form U): FAIL. Then:

```ts
// tenant-rules.ts
const BOOTSTRAP_LABELS: Record<BootstrapStatus, string> = {
  DRAFT: 'Not started',
  PENDING_ACTIVATION: 'Waiting for approval',
  QUEUED: 'Queued',
  PROVISIONING_IDENTITY: 'Setting up the first administrator',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

/** The bootstrap in words: `humanizeEnum` reads "Draft" for a request that never
 * started provisioning, a rejected one included. */
export function bootstrapStatusLabel(status: BootstrapStatus): string {
  return BOOTSTRAP_LABELS[status];
}
```

      `provisioning-timeline.tsx` exports
      `FAILURE_CODE_NOTE = 'The platform stopped setting up this institution and reported this code. Keep it for support.'`
      and renders it under the code inside the same value (a `Typography variant="body2"
      component="span" sx={{ display: 'block', color: 'text.secondary', fontWeight: 400 }}`).
      `(record)/page.tsx`: the Country fact becomes `countryLabel(record.countryCode)` (was
      `` `${countryName(...)} (${code})` ``); the Provisioning fact's chip gets
      `label={bootstrapStatusLabel(record.bootstrapStatus)}`. `(record)/layout.tsx`: the hero's
      subtitle becomes `` `${record.tenantCode} · ${countryLabel(record.countryCode)}` `` (was
      `` `${record.tenantCode} · ${countryName(record.countryCode)}` ``; import `countryLabel` in
      place of `countryName`). `tenant-directory-table.tsx`: the Country cell uses
      `countryLabel(tenant.countryCode)` (same text as today).

- [ ] **Step 2: Run** — form U on `modules/platform-administration/tenants` and
      `(record)/layout.test.tsx`: PASS; form E on `e2e/platform-tenants.spec.ts
e2e/platform-administration.spec.ts` (`platform-tenants.spec.ts`'s `statusChip(page, 'Draft')`
      reads the hero chip first, and `platform-administration.spec.ts:54`'s case-insensitive
      `getByText('COMPLETED')` matches "Completed": both still pass). Commit (form C):

```
fix(platform): write countries and provisioning states the same way everywhere

The institution Overview and the record hero now write a country as "KE · Kenya", like the
directory and every currency, and the provisioning state in words ("Not started" rather than
"Draft" for a request that never began provisioning); a failure code gets one plain sentence.
Items handed over by layer 16's final review (M-2, M10).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

      If anything here fails for a reason outside these items, `git restore` the sub-task and report
      it deferred (it is droppable).

- [ ] **Step 3: P-1: let a lost session reach `load()` from the drafter lookup** (commit D; an
      approved addition, see Approved additions; unlike commit C it is not droppable). Tests first:
      in `modules/administration/branches/branch-service.test.ts`, keep the happy path and the
      "no event" rows of "reads the drafter from the branch.create_draft audit event, or null
      (BG-08)" and replace its `mockRejectedValueOnce(new Error('forbidden'))` row with an
      `it.each` over a 401, a stale context (`invalid_active_tenant_context`) and a 5xx that
      expects `getBranchMaker` to REJECT with the read's own error, the rows and assertion copied
      from `modules/administration/users/user-service.test.ts` ("rejects with the audit read's own
      error on %s"). Create `app/(authenticated)/admin/branches/[branchId]/layout.test.tsx` on the
      harness of `app/(authenticated)/admin/users/[userId]/layout.test.tsx` (hoisted `redirect`
      mock throwing `NEXT_REDIRECT:<to>`, real `unstable_rethrow`, `headers()` mocked, the module's
      services mocked) with four cases, copied from that file's inviter cases: a 401 from the
      drafter read redirects to `/login?reason=session_expired` and renders nothing; a stale
      context redirects to `/select-context`; a 403 and a 5xx each render the record with
      Activate enabled and no blocked-by-drafter note. Form U on both files: FAIL (the service
      still answers null; the layout never redirects). Then the change: `getBranchMaker` loses its
      `try`/`catch` (every read failure rejects; its doc comment says so, like `getUserInviter`'s),
      and the layout (`[branchId]/layout.tsx`, the `maker` lookup above `const base`) becomes:

```tsx
// load() redirects on a lost session or a stale context; any other failure leaves the drafter
// unknown and Activate on offer, where the backend's maker-checker 403 (BG-08) is the guard.
const makerRead =
  actions.includes('activate') && can(holder, 'audit.view')
    ? await load(getBranchMaker(branchId))
    : null;
const maker = makerRead?.ok ? makerRead.value : null;
```

      (import
      `load` from `@/lib/api/load` if the file doesn't yet). Nothing else in 08's files changes.
      Form U on both files: PASS; form E on `e2e/branches.spec.ts`: PASS. Mutation proof (scratch,
      reverted): put the catch back (the 401 and stale-context rows fail); call
      `getBranchMaker(branchId).catch(() => null)` in the layout instead of `load()` (the two
      redirect cases fail). Commit D (form C):

```
fix(branches): let a lost session reach load() from the drafter lookup

getBranchMaker no longer swallows every failure: a lost session or a stale context during the
drafter lookup now redirects through load(), as the user record's inviter lookup does. Any other
failure leaves the drafter unknown and Activate on offer, where the backend's maker-checker 403
(BG-08) is the guard.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate (4c):** commit C is in, with the two trailers, or its part is reported dropped with its
reason; commit D is in, with the two trailers; `git status --short` is empty.

**Review note (4c):** the country now reads `KE · Kenya` in all three places (directory, Overview,
hero subtitle `<code> · KE · Kenya`); every bootstrap status has a word; the failure-code sentence
sits under the code, muted, and the code stays visible; nothing else in 16's files changes. Commit D
changes only 08's `getBranchMaker`, its test, the branch record layout and that layout's new test.

---

### Task 5: The Users tab, the user record and the account lifecycle

**Files:**

- Modify: `modules/administration/users/components/user-directory-table.tsx` and its test (commit A,
  additive)
- Create: `modules/platform-administration/users/components/account-lifecycle-actions.tsx`, `…test.tsx`
- Create: `modules/platform-administration/users/components/account-record.tsx`, `…test.tsx`
- Create: `app/(authenticated)/platform-admin/tenants/[tenantId]/(record)/users/page.tsx`,
  `page.test.tsx`
- Create: `app/(authenticated)/platform-admin/tenants/[tenantId]/users/[userId]/page.tsx`
- Modify: `app/(authenticated)/platform-admin/records-id-guard.test.tsx` (two routes)

**Interfaces:**

- Consumes: Tasks 1–2 (`account-rules`, `account-actions`, `institution-user-service`,
  `institution-user-query`); 10's `parseUserListQuery`, `hasUserFilters`, `USER_STATUSES`,
  `MEMBERSHIP_STATUSES`, `userStatusLabel`, `onboardingState`, `parseUserId`, `UserSummary`;
  `ReasonDialog`, `focusRecordTitle`, `useToast`, `RecordHero`, `SectionCard`, `DescriptionList`,
  `StatusChip`, `CopyIdButton`.
- Produces: `UserDirectoryTable`'s optional `basePath` (default `'/admin/users'`);
  `AccountLifecycleActions({ userId, userName, username, actions, blocked, note, contextOrganisationId? })`;
  `AccountRecord({ user, scope, back, eyebrow, membershipLabel, holder, signedInUserId, contextOrganisationId? })`;
  the two routes.

- [ ] **Step 1: 10's table, test first** (commit A). In `user-directory-table.test.tsx` (its
      `USERS` and `FELIX` fixtures) add:

```tsx
it('links into another workspace when asked, keeping its region', () => {
  renderWithProviders(<UserDirectoryTable users={USERS} basePath="/platform-admin/users" />);

  expect(screen.getByRole('link', { name: 'Felix Omondi' })).toHaveAttribute(
    'href',
    `/platform-admin/users/${FELIX}`,
  );
  expect(screen.getByRole('region', { name: 'Users table' })).toHaveAttribute('tabindex', '0');
});
```

      Run form U: FAIL (no `basePath` prop). Implement, additively, in
      `user-directory-table.tsx` at `3320518` (the props interface at `:24-26`, the signature at
      `:31`, the link's `href` at `:73`); the region and its comment (`:33-41`) stay exactly as
      they are:

```tsx
interface UserDirectoryTableProps {
  users: readonly UserSummary[];
  /** Where a user's record lives: 10's own by default; layer 17 passes the platform's. */
  basePath?: string;
}
// signature: export function UserDirectoryTable({ users, basePath = '/admin/users' }: UserDirectoryTableProps)
// link: href={`${basePath}/${user.id}`} (was href={`/admin/users/${user.id}`})
```

      10's existing tests stay unchanged and green (the default keeps `/admin/users/<id>`; the
      region test still finds one "Users table" and no "Users" region). On the Users tab the
      region's name differs from the tab's section "Users", and on Platform users from every
      landmark (rule 21). Form U, then form E on
      `e2e/users.spec.ts --grep "users: directory and lifecycle"` (it includes 10's 375 px keyboard
      test of the region). Mutation proof (scratch, reverted): keep the hard-coded `/admin/users`
      (the new test fails). Commit A (form C):

```
refactor(users): let the directory table link into the platform workspace

An optional record path, defaulting to /admin/users: the platform workspace (layer 17) lists an
institution's users and its own members with the same table.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

- [ ] **Step 2: Write the failing component tests.** `account-lifecycle-actions.test.tsx` mirrors
      `modules/administration/users/components/user-lifecycle-actions.test.tsx` (the `<main><h1>` slot,
      `expectScoped`, focus tests each with its **own** `waitFor`). `USER = '17000000-0000-4000-8000-0000000000a7'`,
      `ORG = '00000000-0000-0000-0000-000000000000'`, `NAME = 'Esi Mensah'`, `USERNAME = 'esi.mensah'`.

```ts
function expectScoped(sent: FormData | undefined) {
  expect(sent?.get('userId')).toBe(USER);
  expect(sent?.get('contextOrganisationId')).toBe(ORG);
  expect(sent?.get('idempotencyKey')).toMatch(UUID);
}

it('suspends the account everywhere, with a required reason, the user, the key and the organisation', async () => {
  const user = userEvent.setup();
  suspendAccount.mockResolvedValueOnce({ ok: true });
  renderActions({ actions: ['suspend', 'deactivate'] });

  await user.click(screen.getByRole('button', { name: 'Suspend account' }));
  const dialog = screen.getByRole('dialog', { name: `Suspend ${NAME}'s account?` });
  expect(dialog).toHaveTextContent("can't sign in to any institution they belong to");
  const reason = within(dialog).getByRole('textbox', { name: /^Reason/ });
  expect(reason).toBeRequired();
  await user.type(reason, 'Fraud review');
  await user.click(within(dialog).getByRole('button', { name: 'Suspend account' }));

  await waitFor(() => {
    expect(suspendAccount).toHaveBeenCalledTimes(1);
  });
  const sent = suspendAccount.mock.calls[0]?.[1] as FormData;
  expectScoped(sent);
  expect(sent.get('reason')).toBe('Fraud review');
  expect(await screen.findByRole('alert')).toHaveTextContent('Account suspended');
});

it('makes Deactivate an alertdialog that asks for the username typed back', async () => {
  const user = userEvent.setup();
  deactivateAccount.mockResolvedValueOnce({ ok: true });
  renderActions({ actions: ['suspend', 'deactivate'] });

  expect(screen.getByRole('button', { name: 'Deactivate account' })).toHaveClass(
    'MuiButton-outlined',
    'MuiButton-colorError',
  );
  await user.click(screen.getByRole('button', { name: 'Deactivate account' }));
  const dialog = screen.getByRole('alertdialog', { name: `Deactivate ${NAME}'s account?` });
  expect(dialog).toHaveTextContent("the platform can't reactivate a deactivated account");
  expect(dialog).toHaveTextContent('every institution they belong to');
  const confirm = within(dialog).getByRole('textbox', { name: `Type ${USERNAME} to confirm` });
  expect(confirm).toBeRequired();
  await user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), 'Left the platform');
  await user.type(confirm, USERNAME);
  await user.click(within(dialog).getByRole('button', { name: 'Deactivate account' }));

  await waitFor(() => {
    expect(deactivateAccount).toHaveBeenCalledTimes(1);
  });
  const sent = deactivateAccount.mock.calls[0]?.[1] as FormData;
  expectScoped(sent);
  expect(sent.get('username')).toBe(USERNAME);
  expect(sent.get('confirmUsername')).toBe(USERNAME);
});

it('keeps the typed reason, the typed username and the key after a refused deactivate', async () => {
  const user = userEvent.setup();
  deactivateAccount
    .mockResolvedValueOnce({
      ok: false,
      formError: 'Check the highlighted fields and try again.',
      fieldErrors: { confirmUsername: CONFIRM_USERNAME_MISMATCH },
      code: 'validation_failed',
      requestId: null,
    })
    .mockResolvedValueOnce({ ok: true });
  renderActions({ actions: ['suspend', 'deactivate'] });

  await user.click(screen.getByRole('button', { name: 'Deactivate account' }));
  const dialog = screen.getByRole('alertdialog', { name: `Deactivate ${NAME}'s account?` });
  const confirm = within(dialog).getByRole('textbox', { name: `Type ${USERNAME} to confirm` });
  await user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), 'Left the platform');
  await user.type(confirm, 'esi');
  await user.click(within(dialog).getByRole('button', { name: 'Deactivate account' }));

  expect(await within(dialog).findByText(CONFIRM_USERNAME_MISMATCH)).toBeInTheDocument();
  expect(confirm).toHaveValue('esi');
  await user.clear(confirm);
  await user.type(confirm, USERNAME);
  await user.click(within(dialog).getByRole('button', { name: 'Deactivate account' }));
  await waitFor(() => {
    expect(deactivateAccount).toHaveBeenCalledTimes(2);
  });
  const [first, second] = deactivateAccount.mock.calls.map((call) => call[1] as FormData);
  expectScoped(first);
  expectScoped(second);
  expect(second?.get('idempotencyKey')).toBe(first?.get('idempotencyKey'));
  expect(second?.get('reason')).toBe('Left the platform');
});
```

      Plus: "asks Reactivate for an optional reason" (`Reason (optional)` not required; `expectScoped`;
      toast `Account reactivated`); "keeps the typed reason and the key after a refused suspend" (a
      `conflict` failure with `ACCOUNT_CHANGED`, then a retry: the same key, both scoped); "disables
      Suspend and Deactivate on your own account with one caption" (both disabled, each with the
      accessible description `OWN_ACCOUNT`, `getAllByText(OWN_ACCOUNT)` has length 1); "shows the note
      when no action is offered" (`actions: []`, `note: ACCOUNT_DEACTIVATED_NOTE`: no button, the text
      shows); "moves focus to Reactivate account after a suspend" (rerender with `['reactivate']`;
      `await waitFor(() => expect(…'Reactivate account').toHaveFocus())`); "falls back to the record
      title after a deactivate" (rerender without the component; the `h1` gets focus in its own
      `waitFor`).

      `account-record.test.tsx` (mock `../account-actions`): "names the person in the h1 and words both
      chips" (`h1` "Esi Mensah", "Account active", "Membership active", the subtitle
      "esi.mensah · esi.mensah@acme.example"); "shows the institution scope note and the membership
      label it is given" (`role="note"` with `accountScopeNote('institution')`; the fact `Membership in
      Acme SACCO`); "shows the platform scope note" (`scope="platform"`); "offers the actions by status
      and code, and none without a code" (ACTIVE + all codes → two buttons; `['user.view']` → no
      button and no note); "disables Suspend and Deactivate on your own record, comparing ids in one
      case" (`signedInUserId` = the upper-cased user id → both disabled); "words a provisioning account"
      (the Account fact reads "Provisioning identity").

- [ ] **Step 3: Run them to verify they fail** — form U. Expected: FAIL.

- [ ] **Step 4: Implement `AccountLifecycleActions`** — the structure, focus effects, caption ids and
      the `maxWidth: { md: 320 }` actions box of `user-lifecycle-actions.tsx` (copy them; ids prefixed
      `account-action-blocked-`), with this copy and the Deactivate field. Every dialog is a
      `ReasonDialog` (no endpoint here reads no body).

```tsx
function copyFor(id: AccountAction, name: string): ActionCopy {
  switch (id) {
    case 'suspend':
      return {
        label: 'Suspend account',
        title: `Suspend ${name}'s account?`,
        description:
          "This suspends their sign-in account on the whole platform: they can't sign in to any institution they belong to until a platform administrator reactivates it.",
        reason: 'required',
        destructive: false,
        success: 'Account suspended',
        action: suspendAccount,
      };
    case 'reactivate':
      return {
        label: 'Reactivate account',
        title: `Reactivate ${name}'s account?`,
        description:
          'They can sign in again to every institution where their membership is active.',
        reason: 'optional',
        destructive: false,
        success: 'Account reactivated',
        action: reactivateAccount,
      };
    case 'deactivate':
      return {
        label: 'Deactivate account',
        title: `Deactivate ${name}'s account?`,
        description:
          "This is permanent: the platform can't reactivate a deactivated account. They lose access to every institution they belong to, and their role assignments are revoked.",
        reason: 'required',
        destructive: true,
        success: 'Account deactivated',
        action: deactivateAccount,
      };
  }
}
```

      Each dialog: `ReasonDialog` with `tone={copy.destructive ? 'error' : 'default'}`, the hidden
      `userId`, and for `deactivate` the hidden `username` plus:

```tsx
<TextField
  name="confirmUsername"
  label={
    <>
      Type{' '}
      <Box component="code" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
        {username}
      </Box>{' '}
      to confirm
    </>
  }
  required
  error={Boolean(fieldErrors.confirmUsername)}
  helperText={fieldErrors.confirmUsername ?? 'Their username, exactly as shown.'}
  slotProps={{ htmlInput: { autoComplete: 'off', spellCheck: false } }}
/>
```

      (16's Deprovision field, `tenant-lifecycle-actions.tsx:233-252`, is the model.) Buttons: the
      first is `contained`, the rest `outlined`; `destructive` → `color="error"`.

- [ ] **Step 5: Implement `AccountRecord`** (a Server Component):

```tsx
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import type { PermissionHolder } from '@/auth/permissions';
import { CopyIdButton } from '@/components/data-display/copy-id-button';
import { DescriptionList, type DescriptionItem } from '@/components/data-display/description-list';
import { RecordHero } from '@/components/data-display/record-hero';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import type { UserSummary } from '@/modules/administration/users/user-contract';
import { onboardingState, userStatusLabel } from '@/modules/administration/users/user-rules';
import {
  accountActionsNote,
  accountChipLabel,
  accountScopeNote,
  availableAccountActions,
  blockedAccountActions,
  membershipChipLabel,
  type AccountScope,
} from '../account-rules';
import { AccountLifecycleActions } from './account-lifecycle-actions';

interface AccountRecordProps {
  user: UserSummary;
  scope: AccountScope;
  back: { href: string; label: string };
  eyebrow: string;
  /** "Membership in Acme SACCO", or the platform organisation's. */
  membershipLabel: string;
  holder: PermissionHolder;
  /** `profile.user_id`; null when the context couldn't be resolved. */
  signedInUserId: string | null;
  contextOrganisationId?: string;
}

/** A person's record in the platform workspace (spec §11.2, §11.3): the global account lifecycle in
 * the hero (Rulings 5–7); the membership is the one the route read it through. */
export function AccountRecord({
  user,
  scope,
  back,
  eyebrow,
  membershipLabel,
  holder,
  signedInUserId,
  contextOrganisationId,
}: AccountRecordProps) {
  const actions = availableAccountActions(user.userStatus, holder);
  // The backend's ids on both sides, compared in one case (Ruling 6).
  const self = signedInUserId !== null && user.id.toLowerCase() === signedInUserId.toLowerCase();
  const blocked = blockedAccountActions(actions, { self });
  const note = accountActionsNote(user.userStatus, holder);
  const onboarding = onboardingState(user.membershipStatus, user.userStatus);
  const items: DescriptionItem[] = [
    { label: 'Display name', value: user.displayName },
    { label: 'Username', value: user.username },
    { label: 'Email', value: user.email },
    {
      label: 'Account',
      value: <StatusChip value={user.userStatus} label={userStatusLabel(user.userStatus)} />,
    },
    { label: membershipLabel, value: <StatusChip value={user.membershipStatus} /> },
    {
      label: 'Onboarding',
      value: <StatusChip value={onboarding.key} label={onboarding.label} tone={onboarding.tone} />,
    },
    { label: 'User ID', value: <CopyIdButton value={user.id} label="User ID" /> },
  ];

  return (
    <>
      <RecordHero
        back={back}
        avatar={{ kind: 'person', name: user.displayName }}
        eyebrow={eyebrow}
        title={user.displayName}
        subtitle={`${user.username} · ${user.email}`}
        status={
          <>
            <StatusChip value={user.userStatus} label={accountChipLabel(user.userStatus)} />
            <StatusChip
              value={user.membershipStatus}
              label={membershipChipLabel(user.membershipStatus)}
            />
          </>
        }
        actions={
          // Undefined, not an empty component: RecordHero renders its actions box whenever truthy.
          actions.length > 0 || note ? (
            <AccountLifecycleActions
              userId={user.id}
              userName={user.displayName}
              username={user.username}
              actions={actions}
              blocked={blocked}
              note={note}
              contextOrganisationId={contextOrganisationId}
            />
          ) : undefined
        }
      />
      <Box sx={{ mt: 4 }}>
        <SectionCard title="Account and membership">
          <Alert severity="info" role="note" sx={{ mx: 4.5, mt: 3.5 }}>
            {accountScopeNote(scope)}
          </Alert>
          <DescriptionList items={items} />
        </SectionCard>
      </Box>
    </>
  );
}
```

- [ ] **Step 6: The Users tab, test first.** `(record)/users/page.test.tsx` — the harness of Task
      4b's `(record)/branches/page.test.tsx`, mocking `…/users/institution-user-service`
      (`listInstitutionUsers`) in place of the branch service; defaults: Acme SACCO; one user,
      `{ id: U, username: 'esi.mensah', email: 'esi.mensah@acme.example', displayName: 'Esi Mensah',
userStatus: 'ACTIVE', membershipStatus: 'ACTIVE' }`, of one. Render
      `await UsersTab({ params: Promise.resolve({ tenantId: T }), searchParams: Promise.resolve({}) })`.
      Tests:
  1. "lists the institution's users, each linking under the institution" — the row link "Esi
     Mensah" → `/platform-admin/tenants/${T}/users/${U}`; no button's name matches `/account/i`
     (account actions live on the record, never on the tab).
  2. "shows the permission state on a 403 and the error state otherwise" — the list rejects
     `new BackendApiError(403, { code: 'forbidden' })` → "You don't have permission" inside the
     section "Users"; it rejects `new BackendApiError(503, { requestId: 'req-u' })` → "Reference:
     req-u" and no "You don't have permission".
  3. "words the empty state by its filters" — an empty page: with `searchParams` `{}` → "This
     institution has no users yet."; with `{ userStatus: 'SUSPENDED' }` → "No users match these
     filters.".

     Run it (form U): FAIL. Then `[tenantId]/(record)/users/page.tsx`: mirror Task 4b's Step 4 (and
     `app/(authenticated)/admin/users/page.tsx`): `parseInstitutionId` → `notFound()`;
     `parseUserListQuery(query)`; reads `load(getTenant(tenantId))` (return `null` when it failed: the
     layout shows it) and `load(listInstitutionUsers(tenantId, list))`; `SectionCard` titled "Users"
     with `INSTITUTION_USERS_DESCRIPTION` and no actions; a 403 → `ForbiddenState`, else `ErrorState`;
     past-the-end → redirect (`hrefWith(institutionUsersHref(tenantId), query, …)`); `ListToolbar` with
     `timeZone="UTC"`, `resultLabel` `` `${total} ${total === 1 ? 'user' : 'users'}` `` and 10's three
     fields verbatim (Search "Name, username or email"; User status, "All user statuses",
     `userStatusLabel`; Membership, "All memberships", `humanizeEnum`); the empty state
     `title="No users"`, description `hasUserFilters(list) ? 'No users match these filters.' : 'This
 institution has no users yet.'`; `UserDirectoryTable users={…} basePath={institutionUsersHref(tenantId)}`;
     `TablePaginationBar`. Metadata title "Users".

- [ ] **Step 7: The institution user record** — `[tenantId]/users/[userId]/page.tsx`:

```tsx
export const metadata: Metadata = { title: 'User record' };

const FALLBACK_EYEBROW = 'Platform administration · Institution user';

export default async function InstitutionUserPage({ params }: InstitutionUserPageProps) {
  const raw = await params;
  const tenantId = parseInstitutionId(raw.tenantId);
  const userId = parseUserId(raw.userId);
  if (!tenantId || !userId) notFound(); // rule 7: before any read

  const [user, tenant, selected] = await Promise.all([
    load(getInstitutionUser(tenantId, userId)),
    load(getTenant(tenantId)),
    getCurrentContextProfile(),
  ]);
  if (!user.ok) {
    if (user.problem.code === 'resource_not_found') notFound();
    return (
      <>
        <PageHeader eyebrow={FALLBACK_EYEBROW} title="User record" />
        <Paper>
          {user.problem.code === 'forbidden' ? (
            <ForbiddenState />
          ) : (
            <ErrorState problem={user.problem} />
          )}
        </Paper>
      </>
    );
  }
  const resolved = selected.kind === 'resolved' ? selected : null;
  // The institution's name only labels the page: a failed read falls back to plain words (rule 9).
  const institution = tenant.ok ? tenant.value.displayName : null;
  return (
    <AccountRecord
      user={user.value}
      scope="institution"
      back={{ href: institutionUsersHref(tenantId), label: 'Back to users' }}
      eyebrow={institution ? `Platform administration · User in ${institution}` : FALLBACK_EYEBROW}
      membershipLabel={
        institution ? `Membership in ${institution}` : 'Membership in this institution'
      }
      holder={{ permissions: resolved?.profile.permissions ?? [] }}
      signedInUserId={resolved?.profile.user_id ?? null}
      contextOrganisationId={resolved?.context.organization.id}
    />
  );
}
```

      (Imports: `Metadata`, `notFound`, `Paper`, `getCurrentContextProfile`, `ErrorState`,
      `ForbiddenState`, `PageHeader`, `load`, `parseUserId`, `AccountRecord`, `institutionUsersHref`,
      `getInstitutionUser`, `parseInstitutionId`, `getTenant`; the props interface types `params` as
      `Promise<{ tenantId: string; userId: string }>`.)

- [ ] **Step 8: Extend the guard test** with the Users tab (`{ params: { tenantId }, searchParams: {} }`)
      and the institution user record (`{ params: { tenantId, userId } }`), the user rows
      `['a malformed user id', INSTITUTION, 'not-a-uuid']`, `['a user id with a tail', INSTITUTION,
`${USER}x`]`, and their positive control (both ids upper-cased → `getInstitutionUser` called with
      `(INSTITUTION, USER)`). Mock `…/users/institution-user-service` and `…/users/account-actions`.

- [ ] **Step 9: Run** — form U on the four test files (`account-lifecycle-actions.test.tsx`,
      `account-record.test.tsx`, `(record)/users/page.test.tsx`, `records-id-guard.test.tsx`): PASS;
      form E on `e2e/platform-tenants.spec.ts` (the record's new tab) and
      `e2e/users.spec.ts --grep "users: directory and lifecycle"`. Mutation proofs (scratch): compare
      `self` without lower-casing (the account-record case with the upper-cased id fails); drop the
      `confirmUsername` field (the alertdialog test fails); mint the key per submit (the refused
      deactivate test fails); word the empty state without `hasUserFilters` (the Users tab test's
      filtered row fails).

- [ ] **Step 10: Commit B** (form C):

```
feat(platform): add an institution's Users tab and the global account lifecycle

The institution record gains a Users tab, and each user opens a record whose hero suspends,
reactivates or deactivates their account across every institution. Deactivate needs the username
typed back, your own account can't be suspended or deactivated, and every dialog carries the
organisation guard and the form's key.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

---

### Task 6: Platform users and their navigation item

**Files:**

- Modify: `modules/platform-administration/platform-administration-navigation.ts`
- Create: `modules/platform-administration/platform-administration-navigation.test.ts`
- Create: `app/(authenticated)/platform-admin/users/page.tsx`
- Create: `app/(authenticated)/platform-admin/users/[userId]/page.tsx`
- Modify: `app/(authenticated)/platform-admin/records-id-guard.test.tsx` (one route)

**Interfaces:**

- Consumes: Task 5's `AccountRecord`; Task 2's `listPlatformUsers`, `getPlatformUser`; Task 1's
  `PLATFORM_USERS_HREF`, `PLATFORM_USERS_DESCRIPTION`; 10's directory pieces.
- Produces: the "Platform users" navigation item; the two routes.

- [ ] **Step 1: Failing navigation test** (mirror `administration-navigation.test.ts`):

```ts
it('lists Platform users after SACCO institutions, gated on user.view', () => {
  expect(platformAdministrationNavigationItems.map((item) => item.href)).toEqual([
    '/platform-admin',
    '/platform-admin/tenants',
    '/platform-admin/users',
  ]);
  expect(platformAdministrationNavigationItems[2]).toMatchObject({
    label: 'Platform users',
    requiresAny: ['user.view'],
  });
});

it('shows Platform users only to a holder of user.view', () => {
  const labels = (permissions: string[]) =>
    visibleNavigationItems(platformAdministrationNavigationItems, permissions).map(
      (item) => item.label,
    );
  expect(labels(['user.view'])).toEqual(['Overview', 'Platform users']);
  expect(labels(['tenant.view'])).toEqual(['Overview', 'SACCO institutions']);
});
```

      Add the import of `ManageAccountsOutlined` and the entry
      `{ href: '/platform-admin/users', label: 'Platform users', icon: ManageAccountsOutlined, requiresAny: ['user.view'] }`.

- [ ] **Step 2: Failing guard rows** for the platform user record (`{ params: { userId } }`): a
      malformed id, a path-like id, an empty id → `NEXT_NOT_FOUND` with no read; the positive control
      (upper case → `getPlatformUser(USER)`).

- [ ] **Step 3: The list** — `app/(authenticated)/platform-admin/users/page.tsx`: the
      `app/(authenticated)/admin/users/page.tsx` shape with `listPlatformUsers(query)`, `PATH =
PLATFORM_USERS_HREF`, the `PageHeader` `eyebrow="Platform administration"`, `title="Platform users"`,
      `description={PLATFORM_USERS_DESCRIPTION}`, `ListToolbar timeZone="UTC"`, the empty description
      `hasUserFilters(query) ? 'No users match these filters.' : 'The platform organisation has no members yet.'`,
      and `UserDirectoryTable … basePath={PLATFORM_USERS_HREF}`. Metadata title "Platform users".

- [ ] **Step 4: The record** — `app/(authenticated)/platform-admin/users/[userId]/page.tsx`:

```tsx
export const metadata: Metadata = { title: 'Platform user' };

const EYEBROW = 'Platform administration · Platform user';

export default async function PlatformUserPage({ params }: PlatformUserPageProps) {
  const userId = parseUserId((await params).userId);
  if (!userId) notFound(); // rule 7

  const [user, selected] = await Promise.all([
    load(getPlatformUser(userId)),
    getCurrentContextProfile(),
  ]);
  if (!user.ok) {
    if (user.problem.code === 'resource_not_found') notFound();
    return (
      <>
        <PageHeader eyebrow={EYEBROW} title="Platform user" />
        <Paper>
          {user.problem.code === 'forbidden' ? (
            <ForbiddenState />
          ) : (
            <ErrorState problem={user.problem} />
          )}
        </Paper>
      </>
    );
  }
  const resolved = selected.kind === 'resolved' ? selected : null;
  return (
    <AccountRecord
      user={user.value}
      scope="platform"
      back={{ href: PLATFORM_USERS_HREF, label: 'Back to platform users' }}
      eyebrow={EYEBROW}
      membershipLabel="Membership in the platform organisation"
      holder={{ permissions: resolved?.profile.permissions ?? [] }}
      signedInUserId={resolved?.profile.user_id ?? null}
      contextOrganisationId={resolved?.context.organization.id}
    />
  );
}
```

- [ ] **Step 5: Run** — form U on the navigation and guard tests: PASS; form E on `e2e/shell.spec.ts`
      (the rail gains an item for `platform-operator`, which holds `user.view`).

- [ ] **Step 6: Commit** (form C):

```
feat(platform): add the platform users page and its navigation item

Platform users lists the platform organisation's members (there is no cross-institution
directory, BG-10) and opens the same account record as an institution's user, with the global
account lifecycle.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

---

### Task 7: `KpiTile` and the platform overview

**Files:**

- Create: `components/data-display/kpi-tile.tsx`, `kpi-tile.test.tsx` (commit A, kit)
- Create: `modules/platform-administration/overview/components/attention-card.tsx`, `…test.tsx`
- Modify: `app/(authenticated)/platform-admin/page.tsx`; rewrite `page.test.tsx`
- Delete: `modules/platform-administration/components/platform-page-shell.tsx`, `…test.tsx`

**Interfaces:**

- Consumes: Task 1's `KPI`, `ATTENTION_PREVIEW_SIZE`, `activeInstitutionCount`, `attentionView`,
  `OVERVIEW_DESCRIPTION`, `ATTENTION_DESCRIPTION`, `countryLabel`; Task 2's overview service;
  `isPlatformOrganisation` (`config/application-context.ts:38`); `StatusTone`.
- Produces: `KpiTile({ id, label, value, reference?, caption, icon, tone?, link? })` and
  `KPI_UNAVAILABLE` (14 consumes both); `AttentionCard({ view })`.

- [ ] **Step 1: `KpiTile`, test first** (`kpi-tile.test.tsx`):

```tsx
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import { renderWithProviders } from '@/test/test-utils';
import { KPI_UNAVAILABLE, KpiTile } from './kpi-tile';

const tile = (props: Partial<Parameters<typeof KpiTile>[0]> = {}) =>
  renderWithProviders(
    <KpiTile
      id="kpi-active"
      label="Active institutions"
      value={1234}
      caption="Leaves out the platform organisation itself"
      icon={<CheckCircleOutlined />}
      tone="success"
      {...props}
    />,
  );

describe('KpiTile', () => {
  it('names its group by the label and formats the value', () => {
    tile();
    const group = screen.getByRole('group', { name: 'Active institutions' });
    expect(within(group).getByText('1,234')).toBeInTheDocument();
    expect(
      within(group).getByText('Leaves out the platform organisation itself'),
    ).toBeInTheDocument();
  });

  it("says the count couldn't be loaded, with its reference, and never shows 0", () => {
    tile({ value: null, reference: 'req-7' });
    const group = screen.getByRole('group', { name: 'Active institutions' });
    expect(within(group).getByText(KPI_UNAVAILABLE)).toBeInTheDocument();
    expect(within(group).getByText('Reference: req-7')).toBeInTheDocument();
    expect(within(group).queryByText('0')).toBeNull();
  });

  it('links with its own name, and hides the icon from assistive technology', () => {
    const { container } = tile({
      link: { href: '/platform-admin/tenants?status=ACTIVE', label: 'View active institutions' },
    });
    expect(screen.getByRole('link', { name: 'View active institutions' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants?status=ACTIVE',
    );
    // The square, not the svg: MUI's SvgIcon marks itself aria-hidden whatever its parent does.
    expect(container.querySelector('svg')?.parentElement).toHaveAttribute('aria-hidden', 'true');
  });
});
```

      Run form U: FAIL. Implement:

```tsx
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';
import type { StatusTone } from './status-chip';

/** A count that failed to load: never 0, never blank (index rule 9). */
export const KPI_UNAVAILABLE = "Couldn't be loaded";

/** The icon square's soft tint: each pair is already gated by `theme/tokens.test.ts`. */
const SQUARE: Record<StatusTone, { bgcolor: string; color: string }> = {
  success: { bgcolor: 'status.successBg', color: 'success.main' },
  warning: { bgcolor: 'status.warningBg', color: 'warning.main' },
  error: { bgcolor: 'status.dangerBg', color: 'error.main' },
  info: { bgcolor: 'status.infoBg', color: 'info.main' },
  default: { bgcolor: 'avatar.bg', color: 'avatar.fg' },
};

const NUMBER = new Intl.NumberFormat('en-GB');

interface KpiTileProps {
  /** Unique on the page: names the group (`${id}-label`). */
  id: string;
  label: string;
  /** `null` when the read failed. */
  value: number | null;
  /** The failed read's reference. */
  reference?: string | null;
  caption: string;
  /** Decorative. A Server Component builds it; no MUI prop clones it (AGENTS.md). */
  icon: ReactNode;
  tone?: StatusTone;
  /** A unique accessible name on the page (index rule 12). */
  link?: { href: string; label: string };
}

/** Spec §9's KPI tile, Server-Component safe: a labelled group with its value, caption and link. */
export function KpiTile({
  id,
  label,
  value,
  reference = null,
  caption,
  icon,
  tone = 'default',
  link,
}: KpiTileProps) {
  const labelId = `${id}-label`;
  return (
    <Paper
      role="group"
      aria-labelledby={labelId}
      sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
        <Box
          aria-hidden="true"
          sx={{
            ...SQUARE[tone],
            width: 40,
            height: 40,
            borderRadius: 2,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Typography id={labelId} variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
          {label}
        </Typography>
      </Box>
      {value === null ? (
        <Box>
          <Typography component="p" variant="body1" sx={{ fontWeight: 700 }}>
            {KPI_UNAVAILABLE}
          </Typography>
          {reference && (
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
              Reference: {reference}
            </Typography>
          )}
        </Box>
      ) : (
        <Typography
          component="p"
          variant="h3"
          sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}
        >
          {NUMBER.format(value)}
        </Typography>
      )}
      <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
        {caption}
      </Typography>
      {link && (
        <Link
          component={NextLink}
          href={link.href}
          variant="body2"
          sx={{ mt: 'auto', fontWeight: 600 }}
        >
          {link.label}
        </Link>
      )}
    </Paper>
  );
}
```

      Form U: PASS. Commit A (form C):

```
feat(data-display): add KpiTile

A labelled count with a caption, an optional link and a soft-tinted icon, built from existing
tokens and safe in a Server Component. A failed read shows "Couldn't be loaded" with its
reference, never 0. The platform overview (layer 17) and the administration overview (layer 14)
use it.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

- [ ] **Step 2: `AttentionCard`, test first** (`attention-card.test.tsx`; build `AttentionView`s by
      hand). Tests: "lists the rows in order with links, words and UTC dates" (two rows → `rowsOf`-style
      `getAllByRole('row')` length 3; the first link "Mwangaza Savings SACCO" →
      `/platform-admin/tenants/<id>`; the Country cell "KE · Kenya"; the Created (UTC) cell "03 Sep
      2026"; the Lifecycle chip "Pending approval"; the table's scroll container is the region "Needs
      attention table" with `tabindex="0"`, and the section is the region "Needs attention", so the
      two landmark names differ); "shows each failure as its own error with the rows that did load";
      "shows the View all links"; "shows the empty state only when given one" (`empty: null` and no
      rows → neither a table nor "Nothing needs attention"). Implement:

```tsx
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { EmptyState } from '@/components/data-display/empty-state';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import { TruncatedText } from '@/components/data-display/truncated-text';
import NextLink from '@/components/navigation/next-link';
import { formatInstant } from '@/lib/format';
import { countryLabel } from '../../tenants/tenant-rules';
import { ATTENTION_DESCRIPTION, type AttentionView } from '../overview-rules';

/** Spec §11.4's Needs attention: a bounded preview (≤ 5 per status) linking to the directory. */
export function AttentionCard({ view }: { view: AttentionView }) {
  return (
    <SectionCard title="Needs attention" description={ATTENTION_DESCRIPTION}>
      {view.failures.map((failure) => (
        <Alert key={failure} severity="error" sx={{ mx: 4, mt: 3 }}>
          {failure}
        </Alert>
      ))}
      {view.rows.length > 0 ? (
        // Keyboard-scrollable at 375 px, where the 640 px table overflows (07's history-table rule,
        // as in 10's branch assignments table). Not "Needs attention": this card's section is the
        // region of that name, and two landmarks with one name fail axe's landmark-unique.
        <TableContainer tabIndex={0} role="region" aria-label="Needs attention table">
          <Table aria-label="Institutions needing attention" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                <TableCell>Institution</TableCell>
                <TableCell>Lifecycle</TableCell>
                <TableCell>Country</TableCell>
                <TableCell>Created (UTC)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {view.rows.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell>
                    <Link
                      component={NextLink}
                      href={`/platform-admin/tenants/${tenant.id.toLowerCase()}`}
                      variant="body2"
                      noWrap
                      title={tenant.displayName}
                      sx={{ display: 'block', maxWidth: 'min(320px, 60vw)', fontWeight: 700 }}
                    >
                      {tenant.displayName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusChip value={tenant.status} />
                  </TableCell>
                  <TableCell>
                    <TruncatedText value={countryLabel(tenant.countryCode)} maxWidth={200} />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {formatInstant(tenant.createdAt, 'UTC').date}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        view.empty && <EmptyState title={view.empty.title} description={view.empty.description} />
      )}
      {view.more.length > 0 && (
        <Box
          component="ul"
          sx={{ listStyle: 'none', m: 0, px: 4, py: 3, display: 'flex', flexWrap: 'wrap', gap: 3 }}
        >
          {view.more.map((more) => (
            <li key={more.href}>
              <Link component={NextLink} href={more.href} variant="body2" sx={{ fontWeight: 600 }}>
                {more.label}
              </Link>
            </li>
          ))}
        </Box>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 3: Rewrite the page test** (`app/(authenticated)/platform-admin/page.test.tsx`), the
      harness of the current file plus `vi.mock('@/config/env.server', () => ({ serverEnv: {
PLATFORM_ORGANISATION_ID: PLATFORM } }))` and the overview service mocked
      (`countTenantsInStatus`, `listTenantsInStatus`, `countPlatformOperators`). `PLATFORM =
'00000000-0000-0000-0000-000000000000'`; `page(items, totalItems)` builds a `Page<TenantSummary>`;
      the profile holds `['tenant.view', 'user.view']` unless a test says otherwise. Tests:
  1. "counts institutions by lifecycle, leaving out the platform organisation" —
     `countTenantsInStatus` resolves 3 for ACTIVE and 1 for SUSPENDED; the pending preview has 2 of 2,
     the drafts preview 1 of 1; operators 2. The groups read: "Active institutions" `2`, "Pending
     approval" `2`, "Drafts" `1`, "Suspended" `1`, "Platform operators" `2`;
     `listTenantsInStatus` was called with `('PENDING_APPROVAL', 5)` and `('DRAFT', 5)`; one `h1`
     "Platform overview".
  2. "lists pending approval, then drafts, oldest first, without the platform organisation" — the
     drafts preview also carries a row with `id: PLATFORM` → the table "Institutions needing
     attention" has the pending rows then the draft rows, and no platform row.
  3. "links to the whole list when the preview holds less" — pending 5 shown of 7 → the link "View all
     7 institutions pending approval" to `PENDING_HREF`.
  4. "shows each tile's failure on its own" — SUSPENDED rejects `new BackendApiError(503, { requestId:
'req-9' })` → the "Suspended" group reads `KPI_UNAVAILABLE` and "Reference: req-9"; the other four
     tiles keep their numbers.
  5. "never reads a failed half of Needs attention as nothing" — the drafts preview rejects with
     `requestId: 'req-d'`, pending is empty → "Drafts couldn't be loaded. Reference: req-d", the empty
     title "No institution is waiting for approval", and no "Nothing needs attention"; the Drafts tile
     reads `KPI_UNAVAILABLE`.
  6. "shows only the operators tile to a holder of user.view alone" — permissions `['user.view']` →
     one group, no table, no tenant read.
  7. "shows the permission state without either view code" — permissions `[]` → "You don't have
     permission"; no read at all.

- [ ] **Step 4: Run them to verify they fail** — form U on the page and card tests. Expected: FAIL.

- [ ] **Step 5: Rewrite the page:**

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import AdminPanelSettingsOutlined from '@mui/icons-material/AdminPanelSettingsOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import EditNoteOutlined from '@mui/icons-material/EditNoteOutlined';
import HourglassEmptyOutlined from '@mui/icons-material/HourglassEmptyOutlined';
import PauseCircleOutlined from '@mui/icons-material/PauseCircleOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can } from '@/auth/permissions';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { KpiTile } from '@/components/data-display/kpi-tile';
import type { StatusTone } from '@/components/data-display/status-chip';
import { PageHeader } from '@/components/shell/page-header';
import { isPlatformOrganisation } from '@/config/application-context';
import { load, type Loaded } from '@/lib/api/load';
import { AttentionCard } from '@/modules/platform-administration/overview/components/attention-card';
import {
  activeInstitutionCount,
  ATTENTION_PREVIEW_SIZE,
  attentionView,
  KPI,
  OVERVIEW_DESCRIPTION,
} from '@/modules/platform-administration/overview/overview-rules';
import {
  countPlatformOperators,
  countTenantsInStatus,
  listTenantsInStatus,
} from '@/modules/platform-administration/overview/overview-service';

export const metadata: Metadata = { title: 'Platform overview' };

/** A tile's value: a failed read is `null` with its reference, never 0 (rule 9). */
function tileValue<T>(read: Loaded<T>, count: (value: T) => number) {
  return read.ok
    ? { value: count(read.value), reference: null }
    : { value: null, reference: read.problem.requestId };
}

/** Spec §11.4: five counts and the requests waiting for someone. The layout keeps every other
 * context out. */
export default async function PlatformOverviewPage() {
  const selected = await getCurrentContextProfile();
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };
  const tenants = can(holder, 'tenant.view');
  const users = can(holder, 'user.view');
  const header = (
    <PageHeader
      eyebrow="Platform administration"
      title="Platform overview"
      description={OVERVIEW_DESCRIPTION}
    />
  );
  if (!tenants && !users) {
    return (
      <>
        {header}
        <Paper>
          <ForbiddenState />
        </Paper>
      </>
    );
  }

  // Five reads in parallel (BG-15: `size=1` counts; the previews' totals are their tiles' counts).
  const [active, pending, drafts, suspended, operators] = await Promise.all([
    tenants ? load(countTenantsInStatus('ACTIVE')) : null,
    tenants ? load(listTenantsInStatus('PENDING_APPROVAL', ATTENTION_PREVIEW_SIZE)) : null,
    tenants ? load(listTenantsInStatus('DRAFT', ATTENTION_PREVIEW_SIZE)) : null,
    tenants ? load(countTenantsInStatus('SUSPENDED')) : null,
    users ? load(countPlatformOperators()) : null,
  ]);

  const tile = (
    key: keyof typeof KPI,
    read: { value: number | null; reference: string | null },
    tone: StatusTone,
    icon: ReactNode,
  ) => (
    <KpiTile
      key={key}
      id={`kpi-${key}`}
      label={KPI[key].label}
      value={read.value}
      reference={read.reference}
      caption={KPI[key].caption}
      icon={icon}
      tone={tone}
      link={{ href: KPI[key].href, label: KPI[key].link }}
    />
  );
  const total = (page: { page: { totalItems: number } }) => page.page.totalItems;

  return (
    <>
      {header}
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            sm: 'repeat(2, minmax(0, 1fr))',
            lg: 'repeat(5, minmax(0, 1fr))',
          },
          mb: 4,
        }}
      >
        {active &&
          tile(
            'active',
            tileValue(active, activeInstitutionCount),
            'success',
            <CheckCircleOutlined />,
          )}
        {pending &&
          tile('pending', tileValue(pending, total), 'warning', <HourglassEmptyOutlined />)}
        {drafts && tile('drafts', tileValue(drafts, total), 'info', <EditNoteOutlined />)}
        {suspended &&
          tile(
            'suspended',
            tileValue(suspended, (count) => count),
            'error',
            <PauseCircleOutlined />,
          )}
        {operators &&
          tile(
            'operators',
            tileValue(operators, (count) => count),
            'default',
            <AdminPanelSettingsOutlined />,
          )}
      </Box>
      {pending && drafts && (
        <AttentionCard view={attentionView(pending, drafts, isPlatformOrganisation)} />
      )}
    </>
  );
}
```

      Delete `modules/platform-administration/components/platform-page-shell.tsx` and its test (no other
      consumer: pre-flight note 3).

- [ ] **Step 6: Run** — form U on the kit, card and page tests: PASS. Form E on `e2e/shell.spec.ts
e2e/context.spec.ts e2e/platform-administration.spec.ts` (they wait for the `h1` "Platform
      overview", which stays; the shell's a11y matrix now scans the tiles for `platform-operator`, whose
      operators read Task 3's route serves). Mutation proofs: pass `(count) => count` for the active
      tile (test 1 fails); map a failed read to `{ value: 0 }` (test 4 fails); drop the
      `isPlatformOrganisation` filter argument for `() => false` (test 2 fails); drop the card's
      `tabIndex={0}` (the card's first test fails); put the KpiTile's `aria-hidden` on the svg instead
      of the square (the tile's icon assertion fails).

- [ ] **Step 7: Commit B** (form C):

```
feat(platform): replace the overview with lifecycle counts and Needs attention

The platform overview shows five counts (active, pending approval, draft and suspended
institutions, and platform operators) and the institutions waiting for approval, then drafts,
oldest first. A failed count says so with its reference, and the platform organisation is
counted nowhere. PlatformPageShell is retired.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

---

### Task 8: The platform notifications badge

**Files:**

- Modify: `components/shell/notifications-menu.tsx` (Task 1's types stub; the component joins it)
- Create: `components/shell/notifications-menu.test.tsx`
- Modify: `components/shell/platform-notifications.tsx`
- Create: `components/shell/platform-notifications.test.tsx`

**Interfaces:**

- Consumes: Task 1's `pendingApprovalNotifications` and `PENDING_HREF`; Task 2's
  `countTenantsInStatus`; `load`; `platformAdministrationModule`.
- Produces: `NotificationsMenu(props: NotificationsMenuProps)` (12's tenant badge reuses it);
  `PendingInstitutionsNotifications()` (exported for its test); `PlatformNotifications()`.

- [ ] **Step 1: Write the failing tests.** `notifications-menu.test.tsx` (imports `PENDING_HREF` and
      `pendingApprovalNotifications` from `@/modules/platform-administration/overview/overview-rules`):

```tsx
const PROPS = pendingApprovalNotifications(2);

it('names the bell with its count and shows a badge above zero', () => {
  renderWithProviders(<NotificationsMenu {...PROPS} />);
  const bell = screen.getByRole('button', {
    name: 'Notifications: 2 institutions waiting for approval',
  });
  expect(within(bell).getByText('2')).toBeInTheDocument();
});

it('opens a named dialog with its entries; Escape closes it and returns focus', async () => {
  const user = userEvent.setup();
  renderWithProviders(<NotificationsMenu {...PROPS} />);
  const bell = screen.getByRole('button', { name: /^Notifications/ });
  await user.click(bell);
  const dialog = screen.getByRole('dialog', { name: 'Notifications' });
  expect(within(dialog).getByText('2 institutions are waiting for approval.')).toBeInTheDocument();
  // The Pending approval tile's list: the same name goes to the same place (rule 12).
  expect(within(dialog).getByRole('link', { name: 'Review pending institutions' })).toHaveAttribute(
    'href',
    PENDING_HREF,
  );
  await user.keyboard('{Escape}');
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  await waitFor(() => {
    expect(bell).toHaveFocus();
  });
});
```

      plus "hides the badge at zero and says nothing is waiting" (`pendingApprovalNotifications(0)`: no
      `MuiBadge-badge` text `0` visible — `container.querySelector('.MuiBadge-invisible')` exists —
      and the open dialog reads "No institutions are waiting for approval.") and "says the count
      couldn't be loaded, never none" (`pendingApprovalNotifications(null)`: the bell "Notifications
      (couldn't be loaded)", the dialog reads "Pending approvals couldn't be loaded. Refresh to try
      again.", and not the empty text).

      `platform-notifications.test.tsx` (mock `@/auth/context-service`,
      `@/modules/platform-administration/overview/overview-service` and
      `vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }))` (`load()`'s
      catch reads them); `next/navigation` stays real, so `redirect()` and `unstable_rethrow` behave
      as in production; a resolved profile in the `platform-administration` module with
      `['tenant.view', 'tenant.approve']`; render
      `renderWithProviders(<>{await PendingInstitutionsNotifications()}</>)`, the
      `business-date-indicator.test.tsx` pattern):

1. "shows the pending count on the bell" — 2 → the bell's name.
2. "reads nothing outside the platform workspace" — module `administration` → renders nothing;
   `countTenantsInStatus` not called.
3. "reads nothing without tenant.approve and tenant.view" — `['tenant.view']` → nothing, no call.
4. "says the count couldn't be loaded instead of none" — rejects `new BackendApiError(503, {})` → the
   bell "Notifications (couldn't be loaded)".
5. "keeps a redirect propagating" — rejects with the error `redirect('/login')` throws (caught in
   the test) → `await expect(PendingInstitutionsNotifications()).rejects.toThrow('NEXT_REDIRECT')`.
6. "sends a lost session to sign-in instead of reading it as unavailable" (rule 21; 10's
   `admin/users/[userId]/layout.test.tsx` "redirects, rendering nothing, when the inviter read
   fails with %s" is the model) — rejects `new BackendApiError(401)` →
   `await expect(PendingInstitutionsNotifications()).rejects.toThrow('NEXT_REDIRECT')` (`load()`
   redirects to `/login?reason=session_expired`).

- [ ] **Step 2: Run them to verify they fail** — form U. Expected: FAIL.

- [ ] **Step 3: Implement `NotificationsMenu`** (append to Task 1's file; keep its two interfaces):

```tsx
'use client';

import { useId, useState } from 'react';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Popover from '@mui/material/Popover';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import NotificationsOutlined from '@mui/icons-material/NotificationsOutlined';
import NextLink from '@/components/navigation/next-link';

// … NotificationEntry and NotificationsMenuProps as in Task 1 …

/** The app-bar bell (spec §8): a count badge and a small dialog of entries. Primitive props only, so
 * a Server Component can render it (AGENTS.md). */
export function NotificationsMenu({
  label,
  total,
  entries,
  emptyText,
  unavailableText,
}: NotificationsMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const titleId = useId();
  const open = anchor !== null;
  const message = (text: string) => (
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
      {text}
    </Typography>
  );
  return (
    <>
      <Tooltip title={label}>
        <IconButton
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open ? 'true' : undefined}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          <Badge color="primary" badgeContent={total ?? 0} max={99} invisible={!total}>
            <NotificationsOutlined />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-labelledby': titleId,
            sx: { width: 320, maxWidth: 'calc(100vw - 32px)', p: 2.5 },
          },
        }}
      >
        <Typography
          id={titleId}
          component="h2"
          variant="subtitle1"
          sx={{ fontWeight: 700, mb: 1.5 }}
        >
          Notifications
        </Typography>
        {total === null ? (
          message(unavailableText)
        ) : entries.length === 0 ? (
          message(emptyText)
        ) : (
          <Box
            component="ul"
            role="list"
            sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2 }}
          >
            {entries.map((entry) => (
              <li key={entry.id}>
                <Typography variant="body2">{entry.text}</Typography>
                <Link
                  component={NextLink}
                  href={entry.href}
                  variant="body2"
                  onClick={() => setAnchor(null)}
                  sx={{ fontWeight: 600 }}
                >
                  {entry.linkLabel}
                </Link>
              </li>
            ))}
          </Box>
        )}
      </Popover>
    </>
  );
}
```

- [ ] **Step 4: Implement the slot** — `components/shell/platform-notifications.tsx`:

```tsx
import { Suspense } from 'react';
import { getCurrentContextProfile } from '@/auth/context-service';
import { canAll } from '@/auth/permissions';
import { load } from '@/lib/api/load';
import { pendingApprovalNotifications } from '@/modules/platform-administration/overview/overview-rules';
import { countTenantsInStatus } from '@/modules/platform-administration/overview/overview-service';
import { platformAdministrationModule } from '@/modules/platform-administration/platform-administration-module';
import { NotificationsMenu } from './notifications-menu';

/** The approver's codes: the badge counts what they can act on (Ruling 11). */
const BADGE_CODES = ['tenant.approve', 'tenant.view'] as const;

/** Exported for its test. The authenticated layout builds every workspace's slot, so this renders
 * in tenant contexts too: it reads nothing outside the platform workspace. */
export async function PendingInstitutionsNotifications() {
  const selected = await getCurrentContextProfile();
  if (selected.kind !== 'resolved') return null;
  if (selected.context.module.id !== platformAdministrationModule.id) return null;
  if (!canAll({ permissions: selected.profile.permissions }, BADGE_CODES)) return null;
  // BG-22: no feed; one `size=1` read, settled as 10's user record settles getUserInviter (rule 21):
  // load() keeps a redirect propagating and sends a lost session to sign-in and a stale context to
  // context selection; any other failure reads as unknown, never as none (rule 9).
  const read = await load(countTenantsInStatus('PENDING_APPROVAL'));
  return <NotificationsMenu {...pendingApprovalNotifications(read.ok ? read.value : null)} />;
}

/** Platform workspace notifications slot (spec §8): its own boundary, so the shell never waits. */
export function PlatformNotifications() {
  return (
    <Suspense fallback={null}>
      <PendingInstitutionsNotifications />
    </Suspense>
  );
}
```

- [ ] **Step 5: Run** — form U on both tests: PASS. Form E on `e2e/shell.spec.ts
e2e/platform-tenants.spec.ts e2e/context.spec.ts` (`platform-tenants` holds `tenant.approve`: the
      bell appears there; `platform-operator` doesn't: no bell). If a 375 px case overflows in the
      header, STOP and report: the bell joins the app bar's non-shrinking group
      (`global-header.tsx:109-119`), and app shell files are not 17's to edit. Mutation proofs: drop
      the module check (test 2 fails); read a failed count as 0 (`read.ok ? read.value : 0`, test 4
      fails); settle the read with `.catch(() => null)` in place of `load()` (test 6 fails: the 401
      shows the unavailable bell).

- [ ] **Step 6: Commit** (form C):

```
feat(shell): count institutions waiting for approval on the platform's notification bell

The platform workspace's app bar shows a bell to holders of tenant.approve and tenant.view, with
the number of institutions pending approval and a link to them. A failed count says so instead of
"none", and nothing is read in any other workspace (BG-22).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

---

### Task 9: End to end, the accessibility matrix, and the docs

Three sub-tasks, each briefed, implemented and reviewed on its own: **9a** (the behaviour e2e),
**9b** (the accessibility matrix, which commits the spec as commit A) and **9c** (the docs, commit
B). 9a leaves the spec uncommitted for its review; 9b adds the matrix to the same file and commits
it.

**Interfaces (all three sub-tasks):**

- Consumes: Task 3's scenarios and `RECORD_SCENARIO_IDS`; `e2e/support/admin.ts` (`enterAdmin`,
  `mainText`, `statusChip`, `rowsOf`, `notFoundHeading`, `openRecord`, the a11y helpers) and
  `e2e/support/auth.ts` (`authenticate`, `selectMuiOption`, `expectHydrated`).

#### Task 9a: The behaviour e2e

**Files:**

- Create: `e2e/platform-records.spec.ts` (the helpers and the seventeen behaviour tests;
  uncommitted, 9b commits it)

- [ ] **Step 1: The helpers** (top of the spec; local helpers like 16's and 10's: `dialogOf`, `act`
      and `toast` take the shapes of `e2e/platform-tenants.spec.ts:33-42` and
      `e2e/users.spec.ts:92-101,155`; shared ones come from `e2e/support`):

```ts
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  enterAdmin,
  mainText,
  notFoundHeading,
  openRecord,
  rowsOf,
  statusChip,
} from './support/admin';
import { authenticate, expectHydrated, selectMuiOption } from './support/auth';
import { IDS, RECORD_SCENARIO_IDS as R, TENANT_SCENARIO_IDS as T } from './fake-api/scenarios.mts';

const ACME = `/platform-admin/tenants/${IDS.acme}`;
const LONG_ACCOUNT_NAME =
  'Nyokabi Wairimu Kamau-Achieng Muthoni Njeri Chebet Jepkoech Nyambura Akinyi Atieno Wanjiku Mwangi Ay';
const LONG_BRANCH_NAME =
  'Likoni Ferry Crossing and Mombasa Old Town Customer Service Centre for the Teachers and Allied Staff';

/** A platform page through context selection (the operator's one branch is picked by itself). */
const enterPlatform = (page: Page, pathname: string, heading: string | RegExp) =>
  enterAdmin(page, pathname, { heading, organisation: /Platform/, branch: null });

const dialogOf = (page: Page) => page.getByRole('alertdialog').or(page.getByRole('dialog'));

/** A hero account action through its dialog; the caller asserts the outcome. */
async function act(page: Page, label: string, fill: { reason?: string; username?: string } = {}) {
  await page.getByRole('button', { name: label, exact: true }).click();
  const dialog = dialogOf(page);
  if (fill.reason) await dialog.getByRole('textbox', { name: /^Reason/ }).fill(fill.reason);
  if (fill.username !== undefined) {
    await dialog.getByRole('textbox', { name: /to confirm$/ }).fill(fill.username);
  }
  await dialog.getByRole('button', { name: label, exact: true }).click();
  return dialog;
}

/** A toast: MUI alerts in the toast region. "Account suspended" is also the hero chip's text, so
 * a plain getByText would match twice. */
const toast = (page: Page, text: string) => page.getByRole('alert').filter({ hasText: text });

const width = async (locator: Locator) => (await locator.boundingBox())?.width ?? 0;

const param = (page: Page, name: string) => new URL(page.url()).searchParams.get(name);
```

      (9b adds `A11Y_CASES`, `applyA11yCase`, `expectA11yCaseApplied` and
      `expectNoSeriousOrCriticalViolations` to the `./support/admin` import.)

- [ ] **Step 2: The behaviour tests.** One `test.describe` per group, each test `authenticate(context,
testInfo, '<scenario>')` first (its own run), `test.describe.configure({ timeout: 60000 })`.
      Toasts are asserted with `toast(page, …)`.

      `platform records: institution branches` (`platform-records`):
  1. "lists an institution's branches newest first, cuts a long name inside the card, then filters
     and sorts them in the URL" — `enterPlatform(page, `${ACME}/branches`, 'Acme SACCO')`;
     `rowsOf(page, 'Branches')` has count 6; the first data row contains `LONG_BRANCH_NAME`;
     `mainText(page, '5 branches')` visible. The name cap (rule 12; `e2e/users.spec.ts:250-273`'s
     check): `const name = rowsOf(page, 'Branches').nth(1).getByRole('link', { name: LONG_BRANCH_NAME })`;
     at `page.setViewportSize({ width: 1440, height: 900 })`,
     `expect(await width(name)).toBeGreaterThan(300)` (the positive control: a wide screen shows the
     full 320 px); at `{ width: 375, height: 812 }`,
     `await expect.poll(() => width(name)).toBeLessThanOrEqual(0.6 * 375 + 1)` and the link is
     visible; then back to `{ width: 1280, height: 800 }`, and
     `selectMuiOption(page, 'Status', /^Suspended$/)` → `param(page, 'status')` is `SUSPENDED` and the
     rows count 2 with "Nakuru Branch"; click the column header link "Code" → `param(page, 'sortBy')`
     `branchCode`, `param(page, 'sortDir')` `ASC`.
  2. "opens a branch read-only, in UTC, and follows its parent" — from the tab, `openRecord(page,
'Branches', 'Nakuru Branch')`; `mainText(page, 'NAKURU · Acme SACCO')`, `'20 Jul 2026 · 08:00'`,
     `'01 Aug 2026 · 09:30'`, `'Premises under renovation'` visible; `statusChip(page, 'Suspended')`;
     `page.getByRole('main').getByRole('button')` has count 1 ("Copy Branch ID"); back via "Back to
     branches"; `openRecord(page, 'Branches', 'Mombasa Road Branch')`; click the link "Head Office" → the
     `h1` "Head Office" and `new URL(page.url()).pathname` ends with `/branches/${R.acmeHeadOffice}`.
  3. "creates a branch draft where you're a member, and opens it" — the tab's "Create branch draft"
     link → `h1` "Create branch draft"; the note `You can create a branch here only if you're also an
active member of Acme SACCO` visible; fill "Branch code" `THIKA`, "Branch name" `Thika Road
Branch`; click "Create draft" → `h1` "Thika Road Branch" (timeout 15000);
     `statusChip(page, 'Draft')`; the pathname matches `/branches/[0-9a-f-]{36}$`.
  4. "explains the platform's refusal where you aren't a member" — `enterPlatform(page,
`/platform-admin/tenants/${T.pwani}/branches/new`, 'Create branch draft')`; fill `THIKA` /
     `Thika Road Branch`; "Create draft" → `mainText(page, /You must also be an active member of this
institution/)` visible; "Branch code" still holds `THIKA`.
  5. "offers no branch draft for an institution that isn't active" — Kilimo's Branches tab
     (`T.kilimo`, heading "Kilimo Bora SACCO"): no link "Create branch draft"; `page.goto` its
     `/branches/new` → `h1` "Create branch draft" and the text "Only an active institution can take new
     branches".

     `platform records: users and accounts` (`platform-records`):

  6. "lists an institution's users and filters them in the URL" — `${ACME}/users`: `rowsOf(page,
'Users')` count 9; `mainText(page, '8 users')`; `selectMuiOption(page, 'User status',
/^Suspended$/)` → `param(page, 'userStatus')` `SUSPENDED`, rows 2, "Baraka Mwita".
  7. "suspends an account in every institution, then reactivates it" — `openRecord(page, 'Users',
'Esi Mensah')`; the note "Account actions apply to this person's sign-in account on the whole
     platform" visible; `act(page, 'Suspend account', { reason: 'Fraud review' })` →
     `toast(page, 'Account suspended')` visible; `statusChip(page, 'Account suspended')`; `page.goto`
     Pwani's `/users/${R.esi}` → the `h1` "Esi Mensah" and `statusChip(page, 'Account suspended')`;
     `act(page, 'Reactivate account')` → `toast(page, 'Account reactivated')` and
     `statusChip(page, 'Account active')`.
  8. "deactivates an account only with its username typed back" — Achieng's record; `act(page,
'Deactivate account', { reason: 'Left the institution', username: 'achieng' })` → the dialog shows
     "Type the username exactly as shown." and stays open; fill the confirm field with
     `achieng.odera`, click "Deactivate account" → `toast(page, 'Account deactivated')`,
     `statusChip(page, 'Account deactivated')`, `mainText(page, "This account is deactivated. The
platform can't reactivate it.")`, and no button "Reactivate account".
  9. "disables Suspend and Deactivate on your own account" —
     `page.setViewportSize({ width: 1280, height: 800 })` first; "Backend Jane Manager"'s
     record: both buttons disabled, each with the accessible description `You can't suspend or
deactivate your own account. Ask another platform administrator.`; and the actions box stays
     capped (as layer 10's visual pass found, an uncapped caption sizes the box and squeezes the
     title column):

     ```ts
     const box = await page
       .getByRole('button', { name: 'Suspend account', exact: true })
       .locator('..')
       .boundingBox();
     expect(box?.width).toBeLessThanOrEqual(320);
     ```

  10. "hides what a read-only role can't do" (`platform-records-read-only`) — Acme's Branches tab has no
      "Create branch draft"; Esi's record has no "Suspend account" and no "Deactivate account"; the app
      bar has no button named `/^Notifications/` (no `tenant.approve`).

      `platform records: platform users, overview and notifications` (`platform-records`):

  11. "lists the platform's own members and opens one" — `enterPlatform(page, '/platform-admin',
'Platform overview')`; click the navigation link "Platform users" → `h1` "Platform users";
      `rowsOf(page, 'Users')` count 4 (Sara, Peter, Jane); `openRecord(page, 'Users', 'Sara Wanjiku')`
      → "Reactivate account" offered, the note "…in every institution they belong to." without "Their
      membership here", the fact "Membership in the platform organisation", and "Back to platform
      users" links to `/platform-admin/users`.
  12. "counts institutions by lifecycle, leaving out the platform organisation" — the groups "Active
      institutions", "Pending approval", "Drafts", "Suspended", "Platform operators" contain `2`, `2`,
      `1`, `1`, `2` (`page.getByRole('group', { name }).getByText(value, { exact: true })`).
  13. "lists what needs attention, oldest first, and links to the directory" — `rowsOf(page,
'Institutions needing attention')` count 4; rows 1–3 contain "Mwangaza Savings SACCO", "Harambee
      Farmers SACCO", "Umoja Teachers SACCO" in that order; click "Review pending institutions" (the
      tile's link) → `param(page, 'status')` `PENDING_APPROVAL`, `param(page, 'sortBy')` `createdAt`,
      `param(page, 'sortDir')` `ASC`.
  14. "shows the pending approvals on the bell and opens them" — the button "Notifications: 2
      institutions waiting for approval"; `expectHydrated(bell)`; click → the dialog "Notifications"
      reads "2 institutions are waiting for approval."; its link "Review pending institutions" →
      `h1` "SACCO institutions", `param(page, 'status')` `PENDING_APPROVAL`, `param(page, 'sortBy')`
      `createdAt` and `param(page, 'sortDir')` `ASC` (the tile's `PENDING_HREF`).
  15. "updates the counts after an approval" — `page.goto(`/platform-admin/tenants/${T.harambee}`)`
      (another operator created and submitted it, so the fake's maker-checker lets Jane approve;
      Mwangaza, which Jane submitted, would be refused); click "Approve", then the dialog's "Approve";
      wait for `toast(page, 'Approved. Provisioning is queued.')`; `page.goto('/platform-admin')` →
      "Pending approval" reads `1` and the bell is "Notifications: 1 institution waiting for
      approval".

      `platform records: ids` (`platform-records`):

  16. "answers unknown, malformed and platform-organisation ids with the not-found page" — for each of
      `${ACME}/branches/17000000-0000-4000-8000-0000000000ff`, `${ACME}/branches/${R.pwaniHeadOffice}`
      (another institution's branch), `/platform-admin/tenants/not-a-uuid/users`,
      `/platform-admin/tenants/${IDS.platformOrganisation}/branches`,
      `/platform-admin/tenants/${IDS.platformOrganisation}/users/${IDS.jane}`,
      `/platform-admin/users/not-a-uuid`: `page.goto(path)` then `expect(notFoundHeading(page))
.toBeVisible({ timeout: 15000 })` (enter the workspace once first).
  17. "canonicalises mixed-case ids" — `page.goto(`${ACME}/branches/${R.acmeMombasaRoad.toUpperCase()}`)`
      → `h1` "Mombasa Road Branch"; the "Parent branch" link's `href` ends with
      `/branches/${R.acmeHeadOffice}`; "Back to branches" → `${ACME}/branches`.

- [ ] **Step 3: Run** — form E on `e2e/platform-records.spec.ts` in three chunks: `--grep "institution
branches"`, `--grep "users and accounts"`, `--grep "platform users, overview|ids"`. Mutation
      proofs (scratch, reverted, one chunk each): `activeInstitutionCount` without `- 1` (test 12
      fails); `AccountRecord` without the `self` check (test 9 fails); the Branches tab's
      `canCreateInstitutionBranch` → `canAll` only (test 5 fails); remove `maxWidth: { md: 320 }`
      from the actions box (test 9's width assertion fails); drop `nameMaxWidth` from the Branches
      tab (test 1's 375 px width check fails).

**Gate (9a):** the three chunks pass; every mutation proof failed as stated and is reverted;
`git status --short` lists only `e2e/platform-records.spec.ts` (untracked).

**Review note (9a):** read the untracked spec. Check first: every test signs in to its own run; URL
assertions read `searchParams`, never a regex over the URL; no `waitForTimeout`; instants come from
seed values; toasts go through `toast()`; the mutation tests (7, 8, 15) each own their run, so no
count elsewhere moves; test 9 pins the 320 px cap at 1280 px; test 1 pins the name cap at 375 px.

#### Task 9b: The accessibility matrix

**Files:**

- Modify: `e2e/platform-records.spec.ts` (9a's file; commit A)

- [ ] **Step 1: The accessibility matrix** (`platform-records`). Add `A11Y_CASES`,
      `applyA11yCase`, `expectA11yCaseApplied` and `expectNoSeriousOrCriticalViolations` to the
      spec's `./support/admin` import, then the matrix below. axe rates `landmark-unique` moderate,
      so the serious/critical scan can't see two landmarks sharing a name: each surface that holds
      a named region asserts its counts, as `e2e/users.spec.ts:1292-1294` does (rule 21). The branches
      tab's entry gains `'Branches table': 1` (P-2).

```ts
const SURFACES = [
  // `regions`: each landmark name's expected count (rule 21: axe rates landmark-unique moderate).
  {
    label: 'branches tab',
    path: `${ACME}/branches`,
    heading: 'Acme SACCO',
    regions: { Branches: 1 },
  },
  {
    label: 'branch record (100 characters)',
    path: `${ACME}/branches/${R.acmeLikoni}`,
    heading: LONG_BRANCH_NAME,
  },
  { label: 'branch draft', path: `${ACME}/branches/new`, heading: 'Create branch draft' },
  {
    label: 'users tab',
    path: `${ACME}/users`,
    heading: 'Acme SACCO',
    regions: { Users: 1, 'Users table': 1 },
  },
  {
    label: 'user record (100 characters)',
    path: `${ACME}/users/${R.nyokabi}`,
    heading: LONG_ACCOUNT_NAME,
  },
  {
    label: 'deactivate dialog',
    path: `${ACME}/users/${R.esi}`,
    heading: 'Esi Mensah',
    open: async (page: Page) => {
      await page.getByRole('button', { name: 'Deactivate account', exact: true }).click();
      // Scan once the fade has finished: axe blends ancestor opacity into colour contrast.
      await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
    },
  },
  {
    label: 'platform users',
    path: '/platform-admin/users',
    heading: 'Platform users',
    regions: { Users: 0, 'Users table': 1 },
  },
  {
    label: 'overview and notifications',
    path: '/platform-admin',
    heading: 'Platform overview',
    regions: { 'Needs attention': 1, 'Needs attention table': 1 },
    // Two scans: the page, then the open popover.
    then: async (page: Page) => {
      await page.getByRole('button', { name: /^Notifications/ }).click();
      await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
      await expect(page.locator('.MuiPopover-paper')).toHaveCSS('opacity', '1');
    },
  },
] as const;

// The describe's title is what 9b's two --grep chunks select on ("accessibility …(light" / "(dark").
test.describe('platform records: accessibility', () => {
  test.describe.configure({ timeout: 60000 });

  for (const surface of SURFACES) {
    for (const a11yCase of A11Y_CASES) {
      test(`has no serious or critical violations: ${surface.label} (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
        context,
        page,
      }, testInfo) => {
        await applyA11yCase(page, a11yCase);
        await authenticate(context, testInfo, 'platform-records');
        await enterPlatform(page, surface.path, surface.heading);
        if ('open' in surface) await surface.open(page);
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);
        if ('regions' in surface) {
          for (const [name, count] of Object.entries(surface.regions)) {
            await expect(page.getByRole('region', { name, exact: true })).toHaveCount(count);
          }
        }
        if ('then' in surface) {
          await surface.then(page);
          await expectNoSeriousOrCriticalViolations(page);
        }
      });
    }
  }
});
```

- [ ] **Step 2: Run** — form E on `e2e/platform-records.spec.ts` in two chunks, light then dark, so
      each stays under the 8-minute cap (16 cases each: 8 surfaces × 2 widths):
      `--grep "accessibility.*\(light"` and `--grep "accessibility.*\(dark"`. Playwright greps the
      project, the file, the describe and the test title joined by spaces, so a case's grep title
      reads:

```text
chromium platform-records.spec.ts platform records: accessibility has no serious or critical violations: branch record (100 characters) (light, 375px)
```

      The first pattern matches only the `(light, …)` cases and the second only the `(dark, …)`
      ones; no behaviour test's title contains "accessibility" or "(light"/"(dark". Check the split
      once with `--list` (each prints 16 tests).

- [ ] **Step 3: Commit A** (form C) — `e2e/platform-records.spec.ts`:

```
test(e2e): cover platform records, users and the overview end to end, with the accessibility matrix

An institution's branches (list, record in UTC, the draft and BG-18's refusal), its users and the
global account lifecycle (suspend everywhere, reactivate, deactivate with the username typed back,
never on your own account), platform users, the overview's counts and Needs attention, the bell,
and every id case; eight surfaces scanned in light and dark at 1280 and 375 px.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate (9b):** both chunks pass; commit A is in, with the two trailers; `git status --short` is
empty.

**Review note (9b):** read commit A's diff against 9a's reviewed file (only the matrix is new).
Check first: each case applies the scheme and viewport before navigating; an open dialog and the
popover are scanned only at opacity 1; the 375 px cases run the no-horizontal-scroll check; the
eight surfaces include both 100-character records; the region counts cover every named region on
the overview, the two tabs and Platform users.

#### Task 9c: The docs

**Files:**

- Modify: `README.md`, `AGENTS.md`, `docs/backend-gaps.md` (commit B)

- [ ] **Step 1: The docs** (exact text; reflow only as `prettier` asks; the line numbers are at
      `3320518`; match the quoted text).

      `README.md`:
  - The platform-admin tree (`:158-163`): replace the `tenants/` entry (`:160-163`, four lines)
    with exactly these eight (`tenants/` is no longer the last child, so its continuation lines
    gain a `│`, as `admin/branches/` has; the layout line stays):

```
│   │   ├── tenants/             # SACCO institutions: directory (search, status/country/created
│   │   │                          # filters, sortable headers), create wizard (new/), the record
│   │   │                          # ([tenantId]/(record)/: hero lifecycle; Overview, Provisioning,
│   │   │                          # Branches and Users tabs), amend ([tenantId]/amend/), and the
│   │   │                          # branch record, branch draft and user record (branches/
│   │   │                          # [branchId]/, branches/new/, users/[userId]/ under [tenantId]/)
│   │   └── users/               # Platform users: the platform organisation's members, and their
│   │                              # record ([userId]/)
```

- Modules (`:223-226`): replace "the root keeps the tenant branch and user reads for layer 17" with
  "branches/, users/ and overview/ hold an institution's branch and user reads, the global
  account actions and rules, and the overview's counts (layer 17)".
- Data-display (`:237-244`): after "WizardForm and its Stepper theme (16)" add "; KpiTile (17)".
- Shell (`:247-250`): replace "tenant-/platform-notifications (app-bar notification slot stubs,
  spec §8; both render null until a later PR populates them)" with "tenant-/platform-notifications
  (app-bar slots, spec §8: the platform bell counts institutions pending approval; the tenant slot
  renders null until layer 12) and NotificationsMenu".
- The platform bullet (`:469-488`): in its first sub-bullet (`:474-478`) replace "guards the
  record, both tabs, amend and every tenant Server Action" with "guards the record and every
  route under it (its four tabs, amend, and the branch and user records and the branch draft),
  and every Server Action that takes an institution id"; then replace the last sub-bullet ("The
  overview, and the tenant branch and user reads …", `:487-488`) with:

```markdown
- The record's Branches and Users tabs list an institution's branches and users; a branch record
  is read-only (no address, BG-13), and "Create branch draft" is offered for an active institution
  with a warning: the platform refuses it unless you are also a member there with a role that
  allows it (BG-18).
- A user's record (an institution's, or a platform user's) suspends, reactivates or deactivates
  their sign-in account on the whole platform. Deactivate asks for the username typed back and
  can't be undone; your own account can't be suspended or deactivated (BG-35).
- Platform users are the platform organisation's members: there is no cross-institution user
  directory (BG-10).
- The overview counts institutions by lifecycle (leaving out the platform organisation, BG-29)
  and platform operators, one read each (`size=1`, or the total of a five-row preview, BG-15),
  and lists up to five institutions pending approval and five drafts. The bell counts
  institutions pending approval (BG-22).
```

- "Beyond" (`:489-493`): replace the whole bullet's sentence with exactly:

```markdown
- Beyond context discovery/selection, profile retrieval, Platform Administration's institutions,
  overview, institution branches and users, and platform users, and Administration's Users &
  access, Branches, Roles & permissions and Settings above, these are not connected yet: the
  Approval queue (layer 12), the Invite user wizard (layer 11), and the Administration overview's
  operational sections (layer 14).
```

- Next steps (`:506-507`): delete item 3 and renumber.

  `AGENTS.md`: after the fifth exception (its last line, `:105`, ends "…Rulings 8 and 11).")
  add:

```markdown
The platform overview's Needs attention table
(`modules/platform-administration/overview`'s `attentionView`) is a sixth, named exception: a
bounded preview of at most 5 institutions pending approval and 5 drafts, oldest first, each
with a link to the paginated, filtered institution directory when there are more — no licence
for an unbounded list (plan `docs/superpowers/plans/2026-10-03-admin-parity-17-platform-records.md`,
Ruling 10).
```

      `docs/backend-gaps.md`:

- Summary row BG-35 → `| BG-35 | P2       | No documented self-lockout guard: a user may suspend, revoke or deactivate themselves |`
  (padded to the table's width; Gap ≤ 98 characters).
- BG-10 handling → "**Frontend handling:** "Platform users" lists the platform organisation's
  members (`/platform/tenants/{PLATFORM}/users`) and opens the same account record as an
  institution's user; an institution's users are on its record's Users tab. Nobody can be found
  across institutions (layer 17)."
- BG-15 handling → append "The platform overview reads five counts the same way (`size=1`, or the
  total of a five-row preview) (layer 17)."
- BG-18 handling → "**Frontend handling:** "Create branch draft" appears only for an ACTIVE
  institution and a holder of `branch.create` and `branch.view`; the form warns that the platform
  also needs you to be a member there, and a 403 is explained in those words (layer 17)."
- BG-22 → replace "The header badge counts actionable approvals from two list reads." with "The
  platform bell counts institutions pending approval with one `size=1` read, for holders of
  `tenant.approve` and `tenant.view` (layer 17); the tenant badge is layer 12's."
- BG-29 → append "The overview's active count subtracts it exactly once: it is always ACTIVE while
  anyone works in the platform context (layer 17)."
- BG-35 → title "No documented self-lockout guard on memberships and accounts"; Gap gains "Nor is
  one documented for `POST /platform/users/{id}/suspend` or `/deactivate` (§E.2), where a
  self-deactivate would be permanent."; handling gains "The platform user record shows Suspend
  account and Deactivate account disabled on your own account, and their Server Actions refuse it
  before any call (layer 17)."

  Then `pnpm exec prettier --check README.md AGENTS.md docs/backend-gaps.md`. Commit B (form C):

```
docs(platform): describe institution branches and users, platform users and the overview

README's platform section, tree, modules, kit and shell now cover layer 17; AGENTS.md names the
Needs attention preview as the sixth paging exception; backend gaps BG-10, BG-15, BG-18, BG-22 and
BG-29 record the handling, and BG-35 now covers platform accounts.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate (9c):** `pnpm exec prettier --check README.md AGENTS.md docs/backend-gaps.md` passes;
commit B is in, with the two trailers; `git status --short` is empty.

**Review note (9c):** every anchor still names the text it replaces on the current tip (pre-flight
note 1's re-scan); the "Beyond" sentence reads as given; the BG-35 summary row's Gap is at most
98 characters; nothing claims more than the code does (the bell's link, the five reads, the
sixth paging exception).

---

## Layer gate (the controller's; not a task)

1. `git status --short` empty; `git log --oneline 3320518..` lists only this layer's commits, each
   with rule 19's two trailers and no model name (`git log --format=%B 3320518.. | grep
"^Co-Authored-By"` prints only rule 19's line).
2. `pnpm check` clean; `pnpm build` clean (no route conflict for the shared `branches`/`users`
   segments); `grep -rn "PlatformPageShell\|platform-administration-service\|platform-administration-mappers\|platform-administration-queries\|platform-administration.types" app components modules lib`
   prints nothing.
3. The full E2E through the wrapper, in chunks of at most 8 minutes, all green; then
   `e2e/platform-records.spec.ts` twice more (flake check).
4. axe: the matrix (Task 9b) and `e2e/shell.spec.ts`'s platform targets green in light and dark at
   1280 and 375 px.

   4b. **A visual and accessibility pass** by a separate reviewing agent at 1440 and 375 px, light
   and dark, on the visual harness the controller kept for layer 10 (the fake API and `next dev`,
   a visual Playwright config and `*.vspec.ts` files, all outside the repo): a keyboard pass
   (visible focus everywhere; the account dialogs' and the bell popover's focus trap, Escape and
   focus return; focus after each account action; the bell opened and followed by keyboard; the
   draft form's error focus; the Branches, Users and Needs attention tables reached and scrolled
   by keyboard at 375 px, as `e2e/users.spec.ts`'s "makes the users table keyboard-scrollable"
   checks with `tabTo` and the focus ring); extra axe scans on the open Suspend,
   Reactivate and Deactivate dialogs, the draft form with its errors, the forbidden, empty and
   failed states (the read-only scenario; an empty filter; a refused draft) and the open popover;
   and candidate PR screenshots. Then one fix wave (its own commits, reviewed like a task) for
   what it finds.

5. One squashed commit per layer on `admin-parity/17-platform-records` (conventional subject
   `feat(platform): institution records, users and the overview`, body listing the task commits, the
   two trailers).

## Controller live check (against the real backend; not a task)

Only a person signs in; automation never types credentials; reads first (handoff §3.9). The reads,
in the platform context: the overview's five counts against `GET
/platform/tenants?status=…&size=1` by hand (the active count is the raw total minus one); an
institution's Branches and Users tabs, one branch and one user record; Platform users; and the
cross-institution reads: open institution A's branch URL with institution B's branch id, and A's
user URL with B's user id, and expect the not-found page both times (the pages rely on the backend
scoping the read to the institution in the URL, which only the fake API proves). Then the writes,
**only with the person's explicit approval each time** (creating a branch draft and Deactivate are
PERMANENT, so approval is asked again for every one, never once for the whole check):

- **Branch draft** at an institution where the operator is an active member with `branch.create`: it
  is permanent (no delete, BG-01); use code `LIVECHK17` and name it as a test. Elsewhere, expect the
  403 and `BRANCH_CREATE_REFUSED` (BG-18).
- **Suspend then reactivate** a throwaway user created for the check, never a real operator or an
  institution's real user: the change is global (every institution).
- **Deactivate is irreversible**: never on a real operator or institution user; only on a throwaway
  account, and only with the person's explicit approval.
- Your own account: the buttons are disabled; do not probe the backend's own guard (BG-35).

Record each request id and outcome in the ledger.

## Self-review

- **Spec coverage:** §11.2 Branches tab (Task 4b), branch record (Task 4b), create draft with
  BG-18 (Tasks 2, 4a), Users tab and the account lifecycle (Tasks 2, 5); §11.3 platform users
  (Task 6); §11.4 KPIs and Needs attention (Tasks 1, 7); §8 navigation item (Task 6) and badge
  (Task 8); §9 `KpiTile` (Task 7) and UTC (Tasks 4–7); §6.1 reuse (Tasks 2, 4a, 5); 16's carry-ins
  M-2 and M10 (Task 4c), with `checkInitialSettings` typing deferred (Ruling 15).
- **Placeholders:** none in the copy (every string is in Task 1's rules or verbatim in a step).
  Task 3's extraction code names the existing lines it moves ("…the existing filter/sort lines…")
  instead of repeating them; the moved code is behaviour-identical, and the three tenant fake
  specs prove it.
- **Layer gate:** besides the checks, axe and E2E, step 4b's separate visual and keyboard pass at
  1440 and 375 px, with one fix wave.
- **Lessons:** rule 21 names layer 10's in-repo models (`getUserInviter` and its `load()`,
  `getRoleIndexScan` and `rolesCappedHint`, the "Users table" region), and Review Focus checks
  17's code against each.
- **Name consistency:** `parseInstitutionId`, `parseBranchId`, `institutionBranchesHref`,
  `institutionUsersHref`, `PLATFORM_USERS_HREF`, `canCreateInstitutionBranch`,
  `availableAccountActions`, `blockedAccountActions`, `accountActionsNote`, `accountScopeNote`,
  `attentionView`, `activeInstitutionCount`, `pendingApprovalNotifications`, `KpiTile`,
  `KPI_UNAVAILABLE`, `NotificationsMenu`, `PendingInstitutionsNotifications` are defined once and
  used with the same signatures in every later task.
- **Out of scope, on purpose:** branch lifecycle and edit from the platform (the API has none),
  memberships from the platform (the institution's own administrators', 10), a cross-institution
  user search (BG-10), audit and settings tabs (BG-06, BG-12), the tenant badge (12), 14's overview.
