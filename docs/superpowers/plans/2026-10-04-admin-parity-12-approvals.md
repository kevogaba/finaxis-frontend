# PR 12: Approvals and the tenant notifications badge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [plan index](./2026-09-25-admin-parity-00-index.md),
> the layer-12 section of the [handoff](./2026-10-02-admin-parity-handoff.md), the
> [10 users plan](./2026-10-03-admin-parity-10-users.md) and the
> [17 platform records plan](./2026-10-03-admin-parity-17-platform-records.md) first: 12 reuses 10's
> users module, 08's branches module and 17's notifications menu.

**Goal:** Build the tenant approval queue and its badge (spec §10.6, §8, D6):

- `/admin/approvals`: a typed inbox with two link tabs, **User onboarding** (memberships pending
  approval, newest first) and **Branch activation** (branches pending activation, sortable), each
  server-paginated with its state in the URL and its count in the tab's label;
- `/admin/approvals/users/[userId]`: the request (who invited them, when), the person, the access
  they get once approved, the control checks, and a decision bar with **Approve** and
  **Reject & revoke**;
- `/admin/approvals/branches/[branchId]`: the request (who drafted it, when), the branch, the control
  checks, and **Activate**;
- the app-bar bell in the administration workspace: actionable user approvals plus pending branch
  activations, with a link to each tab.

It rests on per-resource transitions only (BG-01): no return for changes, resubmission, branch
rejection or remarks. It produces what layer 14 consumes: `countUserApprovals`,
`countBranchActivations`, `listUserApprovals` and `listBranchActivations`
(`modules/administration/approvals/approval-service.ts`) for the overview's pending-approvals card;
`listUserApprovals` includes provisioning rows, which that card must mark or skip, as the User
onboarding tab does.

**Architecture:**

- Pages are Server Components. Reads go through `approval-service.ts` (over 10's `listUsers`, 08's
  `listBranches`, 06's `listAuditEvents` and 09's `listRoleAssignments`) and are settled with
  `load()`; pure rules live in four client-safe modules: `approval-rules.ts` (who sees what, where
  a request stands, which decisions are offered), `approval-copy.ts` (the decisions' wording, the
  toasts, the refusal codes and every page's copy), `approval-notifications.ts` (the bell's
  arithmetic) and `approval-checks.ts` (the control checks).
- Routes: `/admin/approvals` redirects to the first tab the holder can see; the two tabs live in an
  `(queue)` route group whose layout holds the page's one h1 and the `RecordTabs`; the two detail
  pages live outside the group with their own `RecordHero` (Ruling 2). Every detail route validates
  and lower-cases its id **before any read**.
- Decisions are three thin Server Actions on `runServerAction` — `approveUser`, `rejectUser`
  (`approval-actions.ts`) and `activatePendingBranch` (`branch-activation-actions.ts`) — over shared
  server-only guards (`approval-guards.ts`). Each re-reads its subject by the backend's ids and
  refuses before any write wherever the page wouldn't offer the decision (a branch context before
  any read); the maker-checker comparison uses `/auth/me`'s id, without letter case; an unresolved
  profile fails closed in all three (Ruling 5). 10's and 08's actions are untouched for their own
  pages.
- The decision bar (`DecisionBar`, client) opens `ConfirmDialog` (Approve) or `ReasonDialog`
  (Reject & revoke, an alertdialog; Activate), forwarding the dialog's minted idempotency key and
  `contextOrganisationId`; the toast says whether an approval went live (200) or queued identity
  provisioning (202), read from the response's echo (Ruling 10).
- The bell is `components/shell/tenant-notifications.tsx` (own `Suspense`, `null` outside the
  administration workspace and without the codes **before any read**, three `size=1` reads cached
  per request and shared with the tab counts) over 17's `NotificationsMenu`.
- Cross-layer edits, each its own announced commit: 07's `ConfirmDialog` refocuses its confirm
  button after a failure (P-1); 10's Reject & revoke refuses a stale terminal revoke (P-3); the user
  menu's name and email give way below `xl` so the bell fits (Ruling 1).

**Tech Stack:** Next.js 16.3 (route groups, nested layouts, Server Actions, `notFound`, `redirect`),
React 19.3 (`useActionState`, `cache`, `Suspense`), MUI 9.4 (`Badge`, `Popover`, `Tabs`, `Table`,
`Alert`), zod 4.6, Vitest + RTL, Playwright + axe. No new packages.

**Spec:** [`…-design.md`](../specs/2026-09-25-admin-prototype-parity-design.md): §10.6 (queue and
detail pages), §8 (navigation table; the tenant badge), §9 (record pattern), §10.5 (10's users,
whose onboarding states 12 reuses), §6.2–§6.8, D6.

Contract (`…-api-contract.md`): §A (uuid case, context re-validation, idempotency), §C
(`UserInTenantSummary`, `MembershipDetail`, `BranchSummary`, `BranchDetail`), §D (revoke and
activate bodies), §E.3 (the four tenant rows below), §F (user and membership states; who needs a
branch), §G (`user.invite`, `branch.create_draft`), §J. Gaps: BG-01, BG-02, BG-03, BG-07, BG-08,
BG-09, BG-11, BG-15, BG-22, BG-28, BG-31, BG-33.

**Base:** `2dbfe16`, layer 17's final tree, with layers 08, 09, 10, 13, 15, 16 and 17 in. The layer
ships as one commit on `admin-parity/12-approvals`, stacked on `admin-parity/17-platform-records`
(PR #58). The controller keeps the layer's ledger. The **Pre-flight notes**, **Layer gate**,
**Controller live check** and **Self-review** sections are not tasks.

**Plan history:** drafted 2026-10-04 on `2dbfe16`; revised 2026-10-05 after an adversarial plan
review (0 Critical, 4 Important, 9 Minor, all applied, and six of its observations); the user
answered the fifteen questions (three blocking) on 2026-10-05, choosing the recommended option of
each.

## Global Constraints

Sources: **A** = `AGENTS.md`; **H3.n** = handoff §3 standing rule n; **L17-R21** = the layer-17
plan's rule 21 (layer 10's Codex lessons); **C** = the controller's rulings for this layer;
**L1–L6** = the lessons of layers 09, 16, 10 and 17 this layer is bound by: **L1** failed reads,
bounded scans and table regions (no blanket catch; never absence or zero; say partial; named,
counted regions); **L2** safety actions (backend ids, case-insensitive maker-checker, fail closed,
refuse before the write, cross-tab guard and minted key, `explain`, `expectScoped`, mutation
proofs); **L3** test discipline (default profile, `env.server` mock, distinct first blocks, a page
test per route, no real-timer races, e2e hydration, streamed bell, filtered toasts, exact names, one
scenario per test, chunkable `describe` titles); **L4** visual and focus (no wrapping decision
labels, focus after a form-level failure, accurate copy, the header ruled first); **L5** process
(split briefs, one commit per task on a clean tree, docs, prettier); **L6** Next 16 / MUI v9 rules
(AGENTS.md). Every task's requirements include this section.

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

If `tsc` reports TS2307 for a route after adding route files, run
`rm -rf .next/types .next/dev/types` with no `next` process running (handoff §9). The gates
(`pnpm check`, `pnpm build`, the full E2E) belong to the layer gate, never to a task. Every task
ends on a clean tree with its own commit; no task hands over uncommitted work.

**Binding rules** (one line each; the source in brackets):

1. Run `pnpm check` after any implementation change and the affected E2E specs (form E) when
   rendered UI changes; no task is done until both are clean. [A]
2. No `@ts-ignore`, `@ts-nocheck`, unsafe `any`, or rule disables; fix the cause. [A]
3. MUI + Tailwind (layout only) is the whole stack; no new packages; `package.json` and
   `pnpm-lock.yaml` don't change; **no new theme token** (the bell and the chips use pairs
   `theme/tokens.test.ts` already gates). Muted text is `sx={{ color: 'text.secondary' }}`, never
   `color="text.secondary"` on Typography, Box, Stack, Grid or DialogContentText. [A]
4. Server Components by default; `'use client'` only for interaction (`DecisionBar`); no function
   prop (no `sx` callback, no Server Action, no `component={Link}`) from a Server to a Client
   Component (use `@/components/navigation/next-link`); `BranchDirectoryTable`'s `sortHref` is a
   Server-Component-to-Server-Component prop and stays so; no pre-built element into an MUI prop
   gated by `isValidElement`/`cloneElement`. [A, H3.3]
5. **Safety actions** (Approve, Reject & revoke, Activate): the action re-reads its subject by the
   backend's ids and refuses **before any write** wherever the page wouldn't offer the decision (a
   branch context before any read); the maker-checker comparison uses `/auth/me`'s `user_id` and
   `isSameUser` (no letter case), never the URL's id; an unresolved profile fails closed in all
   three; a maker the page can't read leaves the decision on offer and the check reads "Checked on
   approval" with "Verified by the platform on approval." (Ruling 5). [L2, C]
6. Every Server Action runs through `runServerAction`, forwards the idempotency key the dialog
   minted when it opened (never a new one per request) and `contextOrganisationId`; never echoes
   backend text; names known failures with local copy (`explain`). **Every** dialog test asserts
   the subject id, `contextOrganisationId` and `idempotencyKey` (an `expectScoped` helper) and that
   a retry after a failure reuses the key. [A, H3.1, L2]
7. A detail route validates its id **before any read** (the profile included): `notFound()` when
   the repo's existing parser rejects it (10's `parseUserId`, 17's client-safe `parseBranchId`; 12
   adds none), then the lower-cased form (contract §A); pinned by
   `app/(authenticated)/admin/approvals/approvals-id-guard.test.tsx`. Server Actions check ids with
   zod before any read. [A, L3]
8. Every list is server-paginated with its state in the URL (`PAGE_SIZES`, `TablePaginationBar`,
   `useListNavigation()` through it); the detail page's requested roles are one bounded page of
   100, said so when capped (Ruling 8; AGENTS.md's seventh named exception, Task 11d). [A, H3.7]
9. Reads go through `apiGet(path, schema)` (the existing services); pages settle reads with
   `load()` and render `ErrorState` (or `ForbiddenState` on a 403) on the failure branch;
   `describeProblem` never echoes backend text. **A failed read is never shown as absence or as
   zero** ("Couldn't be loaded" with its reference; the bell reads "couldn't be loaded"; a tab count
   that fails leaves the label without a number); "not permitted" says so; a bounded scan or capped
   page says when it is partial. [A, L17-R21, L1]
10. **No blanket catch** in a service or a helper that backs a page or an action: it rejects, the
    caller settles it with `load()` (a 401 or a stale context redirects), and only then may an
    ordinary failure degrade, with a comment saying what it means. The one catch in this layer,
    `knownMaker`, rethrows everything but a `BackendApiError` that isn't a lost session or a stale
    context. [L17-R21a, L1]
11. Every horizontally scrolling table container is a keyboard-focusable region
    (`tabIndex={0} role="region"`) whose name differs from every other landmark on the page; every
    spec that shows one asserts its count (axe rates `landmark-unique` only moderate). 12 adds none
    of its own; it reuses "Users table", "Branches table", "Role assignments" and "Branch
    assignments table", and asserts them. [L17-R21c, L1]
12. Status changes move focus to the same decision if still offered, else the first enabled one,
    else the record title (`focusRecordTitle`); a form-level failure refocuses the dialog's submit
    (P-1); a focus assertion in a test sits in its **own** `waitFor`. [H3.4, L4]
13. One `h1` per page; visible focus; labelled fields; errors tied to fields; static notices are
    `Alert role="note"`; a decision label never wraps (`whiteSpace: 'nowrap'`); the hero's decision
    box is capped at `maxWidth: { md: 320 }`; 375 px shows no horizontal page scroll; no serious or
    critical axe violation in light and dark at 1280 and 375 px. [A, L4]
14. Cross-layer edits are additive and announced, each in its own commit: `ConfirmDialog` (P-1,
    `fix(data-display)`), 10's `revokeMembership` and `UserLifecycleActions` (P-3, `fix(users)`),
    the user menu (Ruling 1, `refactor(shell)`), the administration navigation (Task 6a). Nothing
    else outside `modules/administration/approvals/`, `app/(authenticated)/admin/approvals/`,
    `components/shell/tenant-notifications.tsx`, the fake API's `scenarios.mts`, the new specs and
    the docs changes. [H3.2, L4]
15. Fake-API files run under plain `node`: relative `.mts` imports, `import type`, erasable
    TypeScript only; seeds use the `12000000-0000-4000-8000-…` prefix and lettered tails (so an
    upper-cased id differs); never mutate another layer's builder's state; new `BUILDERS` entries go
    last with a `// Layer 12 (approvals).` comment; no route changes. [A, H3.5, H3.6]
16. E2E: every test signs in to its own fake-API run (`authenticate()`); one scenario per test; wait
    for hydration (`expectHydrated`) before a click and for the bell before reading or scanning it;
    toasts are found with `page.getByRole('alert').filter({ hasText })`; buttons and tabs by exact
    names; not-found is asserted by page content (`notFoundHeading`); an open dialog or popover is
    scanned only once its opacity is 1; `rowsOf` counts include the header row; text is matched
    `exact` inside its own region when it can appear twice (strict mode); each `describe` sets its
    own timeout with `test.describe.configure`; the accessibility matrix runs by surface inside one
    wrapping `describe('approvals: accessibility')`, each test's title ending in its scheme and
    viewport (`(light, 375px)`), so `--grep "approvals: accessibility.*\(light"` and
    `--grep "approvals: accessibility.*\(dark"` each select exactly sixteen. [L3]
17. Unit tests: a default resolved profile in every harness; `vi.mock('@/config/env.server', …)` in
    every action harness; ids distinct in their **first block** (so a short id proves which id was
    shortened) and lettered (so an upper-cased copy differs); `userEvent.setup({ delay: null })` in
    new tests; every new route has a page test (401 and stale-context redirects; 403 vs 5xx vs
    empty never confused; the id guard). [L3]
18. Every user-visible string is defined once, in `approval-copy.ts`, `approval-rules.ts` (the
    outcome notes), `approval-notifications.ts` or `approval-checks.ts` (or reused from 10's
    `user-rules.ts` / 08's `branch-rules.ts`), and quoted verbatim in the e2e. [C]
19. No new backend gap (BG-36 onwards stays free); BG-01, BG-08 and BG-22's frontend handling is
    updated in Task 11d. [C]
20. Every commit ends with exactly these two trailer lines, and no model name appears in code, docs,
    commit messages or trailers:

    ```
    Co-Authored-By: Claude <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
    ```

21. Update `README.md` and `AGENTS.md` where the architecture or a documented limit changes (Task
    11d); the plan's trailing gate, live-check and self-review sections are the controller's. [A]

**Wire contract** (contract §E.3; tenant scope **T**; branch scope **B**):

| Endpoint                                                                            | Permission                                    | Body                       | Success                        | 12's handling                                                                                                                  |
| ----------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET /tenant/users?membership_status=PENDING_APPROVAL&page&size`                    | `user.view` (T)                               | —                          | `ApiPage<UserInTenantSummary>` | the User onboarding tab (newest first, no sort); `size=1` for the pending count                                                |
| `GET /tenant/users?membership_status=PENDING_APPROVAL&user_status=PROVISIONING_IDP` | `user.view` (T)                               | —                          | `ApiPage<UserInTenantSummary>` | `size=1`: the already-approved count (actionable = pending − this, clamped at 0)                                               |
| `GET /branches?status=PENDING_APPROVAL&sort_by&sort_dir&page&size`                  | `branch.view`                                 | —                          | `ApiPage<BranchSummary>`       | the Branch activation tab (not branch-restricted, §E.4); `size=1` for the count                                                |
| `GET /tenant/audit-events?entity_type&entity_id&action&size=1`                      | `audit.view`                                  | —                          | `ApiPage<AuditEvent>`          | the maker: `USER` + `user.invite`, or `BRANCH` + `branch.create_draft` (BG-08)                                                 |
| `GET /tenant/role-assignments?user_id&status=ACTIVE&size=100`                       | `role_assignment.view`                        | —                          | `ApiPage<RoleAssignment>`      | requested roles: one page, capped and said so                                                                                  |
| `POST /tenant/memberships/{id}/activate`                                            | `user.approve` + `membership.view` (BG-31)    | `{}` (no body is read)     | 200 or 202 `MembershipDetail`  | Approve; refused first if not awaiting, provisioning, blocked or invited by me; 403 → hedged copy; 500 → likely causes (BG-07) |
| `POST /tenant/memberships/{id}/revoke`                                              | `membership.revoke` + `membership.view`       | `{ reason }` 3–500         | `MembershipDetail` (unread)    | Reject & revoke; terminal (BG-28); refused first unless still pending                                                          |
| `POST /branches/{id}/activate`                                                      | `branch.activate` (B) + `branch.view` (BG-31) | `{}` or `{ reason }` ≤ 500 | `BranchDetail` (unread)        | Activate; All branches only (BG-03); refused first if not pending or drafted by me; 403 → hedged copy                          |

**Files 12 never touches:** `app/(authenticated)/layout.tsx`; `components/shell/app-shell.tsx`,
`global-header.tsx` and every shell file except `tenant-notifications.tsx` (+ its new test) and
`user-menu.tsx` (one value, Ruling 1); `lib/*`; `auth/*`; `config/*`; `theme/*`; every kit file
except `confirm-dialog.tsx` (+ test, P-1); `modules/administration/**` except the new `approvals/`
directory, `administration-navigation.ts` (+ test), and for P-3 `users/membership-actions.ts`,
`users/user-rules.ts`, `users/components/user-lifecycle-actions.tsx` (+ test) and the new
`users/membership-revoke-guard.test.ts`; 08's and 10's routes; the fake API's routes and every
`.mts` file except `scenarios.mts`; existing e2e specs and `e2e/support/*`; the plan index and other
layers' plans.

## Rulings for this layer

Decisions the implementer can't make. Fifteen questions go to the user before the build (three
BLOCKING), each with a recommended option; the plan carries the recommendation. Each ruling names
its cost if wrong. The user answered each on 2026-10-05, interactively, choosing the recommended
option every time (the last column).

| Q   | Decision the plan carries                                                                                                            | Kind     | User's answer |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------- |
| Q1  | The user menu's name and email give way below `xl`; the bell fits at 1200–1535 px (Ruling 1)                                         | BLOCKING | confirmed     |
| Q2  | Nested routes: an index that redirects, two tabs in an `(queue)` group, detail pages outside it (Ruling 2)                           | BLOCKING | confirmed     |
| Q3  | New guarded actions; an unknown maker leaves the decision on offer, "Verified by the platform on approval" (Ruling 5)                | BLOCKING | confirmed     |
| Q4  | Bell = actionable users + pending branches; branches count in a branch context, with a switch hint; any failure → unknown (Ruling 9) | default  | confirmed     |
| Q5  | No decision in the queue rows (Ruling 6)                                                                                             | default  | confirmed     |
| Q6  | Four user checks and two branch checks, four state words; a "Not met" check doesn't disable Approve (Ruling 7)                       | default  | confirmed     |
| Q7  | 200 / 202 / unreadable echo toasts (Ruling 10)                                                                                       | default  | confirmed     |
| Q8  | Provisioning rows listed, uncounted, no decision on their page (Ruling 12)                                                           | default  | confirmed     |
| Q9  | History by a link to the record's Audit tab (Ruling 4)                                                                               | default  | confirmed     |
| Q10 | Branch context: a note on the tab, `BranchContextState` on a hidden branch, Activate never offered (Ruling 11)                       | default  | confirmed     |
| Q11 | Tab labels carry their counts; a failed count leaves the label bare (Ruling 3)                                                       | default  | confirmed     |
| Q12 | Reuse 17's `NotificationsMenu`; the tenant slot mirrors 17's bell (Ruling 9)                                                         | default  | confirmed     |
| Q13 | P-1: `ConfirmDialog` refocuses its confirm button after a failure (Task 3a)                                                          | default  | confirmed     |
| Q14 | P-3: 10's Reject & revoke refuses a stale terminal revoke (Task 3b, droppable)                                                       | default  | confirmed     |
| Q15 | Requested roles: one page of 100, capped and said so; AGENTS.md's seventh exception (Ruling 8)                                       | default  | confirmed     |

1. **The header (Q1).** The bell joins the right group of the app bar. To make room between 1200
   and 1535 px, `UserMenu`'s name-and-email box shows from `xl` instead of `lg`
   (`components/shell/user-menu.tsx:54`); the avatar and the trigger's accessible name
   (`aria-label={user.name}`) stay. Its own `refactor(shell)` commit (Task 9a). Task 11a pins
   1200/1280/1440 px: no app-bar overflow, the business-date status word unclipped, the user menu
   and the bell visible, and the organisation name **not truncated** at 1280 and 1440 px (its
   `scrollWidth` within its `clientWidth`). Its mutation proof is Task 9a reverted: the 1280 px case
   must then fail. **STOP rule:** if the test fails with 9a in place, or still passes with 9a
   reverted (then B isn't needed for this name), the build stops and Q1 returns to the user with
   the measurements. The gate's visual pass checks the same widths with `approvals-long-org` (an
   88-character organisation name, with the bell). Cost if wrong: one value.
2. **Routes and URL state (Q2).** `/admin/approvals` (`page.tsx`) redirects to the first of
   `approvalQueueTabs(holder)`; with neither tab it renders the page h1 "Approval queue" and
   `ForbiddenState` ("Your role can't approve users or activate branches…"). The tabs are
   `/admin/approvals/users` and `/admin/approvals/branches` in `admin/approvals/(queue)/`, whose
   layout renders the h1 and `RecordTabs` labelled "Approval queue sections". The User onboarding
   tab needs `user.approve` + `user.view`; Branch activation needs `branch.activate` +
   `branch.view`; a typed URL without them shows the tab's `ForbiddenState` and reads nothing. The
   detail pages live at `admin/approvals/users/[userId]` and `admin/approvals/branches/[branchId]`
   (outside the group: no tab bar on a decision page). The nav item "Approval queue" sits after
   Overview with `requiresAny: ['user.approve', 'branch.activate']` (spec §8). Cost if wrong: route
   moves (the bell's links, the nav item, the e2e).
3. **The queue's lists and counts (Q11).** The User onboarding tab reuses 10's `UserDirectoryTable`
   (`basePath="/admin/approvals/users"`; region "Users table"), newest first, no sort (BG-09); the
   Branch activation tab reuses 08's `BranchDirectoryTable` (`basePath`, `nameMaxWidth`
   `min(320px, 60vw)`, sort links within the tab; region "Branches table"). Both page with
   `TablePaginationBar`, redirect a page past the end to the last one, and say "No users are waiting
   for approval" / "No branches are waiting for activation" when empty. The tab labels read
   "User onboarding (8)" and "Branch activation (3)": actionable users and pending branches, from
   the bell's cached reads; a count that fails leaves the label bare. Cost if wrong: labels.
4. **What a detail page shows (Q9).** A user request: the hero (name, `username · email`, the
   onboarding chip and "Membership pending approval", the decision bar), an outcome note when it
   is no longer awaiting a decision, then the cards **Request** (the request in words, the
   institution, "Invited by" and "Invited (<zone>)"; "Open the audit trail" with `audit.view`),
   **Identity**, **Requested access** (Ruling 8) and **Control checks** (Ruling 7; only while it
   waits). A branch request: the hero (name, `code · type`, status chip, Activate), **Request**
   ("Drafted by", "Drafted (<zone>)"), **Branch** (name, code, type, parent, timezone, created, id)
   and **Control checks**. History is the record's Audit tab, linked. Cost if wrong: one more
   section.
5. **Safety (Q3).** `approveUser`, `rejectUser` and `activatePendingBranch` post only:
   - with a well-formed key and id (zod), after `runServerAction`'s cross-tab guard;
   - **Approve:** a resolved profile (else fail closed: `invalid_active_tenant_context` → context
     selection); the membership read by the form's id and its user by the membership's `user_id`;
     refused, before the write, `account_blocked` (409, in the disabled caption's words, e.g. "Their
     account is suspended on the platform…") for a blocked account, `approval_changed` (409) unless
     still awaiting (provisioning and decided included), `maker_checker` (403) when the
     `user.invite` actor is the signed-in user (only with `audit.view`); then `POST …/activate {}`
     by the backend's lower-case membership id;
   - **Reject & revoke:** a resolved profile (fail closed, as Approve) and the same reads; refused
     `approval_changed` unless awaiting or blocked; then `POST …/revoke { reason }` (3–500,
     trimmed);
   - **Activate:** a resolved profile; refused `branch_context` (409) with a branch selected,
     before any read; `approval_changed` unless `PENDING_APPROVAL` and `maker_checker` when the
     `branch.create_draft` actor is the signed-in user, before the write; then
     `POST /branches/{id}/activate` with `{}` or `{ reason }`;
   - **the maker read** (`knownMaker`) redirects on a lost session or a stale context; any other
     failed read (a `BackendApiError`) leaves the maker unknown and the backend's 403 is the guard
     ("Your role may not allow it, or you invited them…"). One deliberate asymmetry: an unreadable
     audit page (a `ZodError`) fails the action, with a reference, while the page still offers the
     decision — the action never guesses past a response it can't read.

   Cost if wrong: see Q3.

6. **Which decisions are offered (Q5).** A user request offers Approve (`user.approve`) and
   Reject & revoke (`membership.revoke`), both only with `membership.view` (BG-31) and a found
   membership, and only while awaiting or blocked. Approve shows disabled, with its caption, for a
   blocked account ("Their account is suspended on the platform…") and then for its inviter (10's
   `USER_MAKER_CHECKER_BLOCKED`). Without `membership.view`, or when the membership can't be found
   or read, the bar shows 10's note instead. A branch request offers Activate (`branch.activate` +
   `branch.view`) only while pending and only at All branches, disabled for its drafter (08's
   `MAKER_CHECKER_BLOCKED`). Queue rows carry no decision. Cost if wrong: one rule.
7. **Control checks (Q6).** User: "Invited by someone else", "Has an active role", "Has an active
   branch assignment" (AUDITOR and SYSTEM: "Not required"), "Institution is active". Branch:
   "Drafted by someone else", "Institution is active". States: Passed (success), Not met (error),
   Checked on approval (info; its detail opens "Verified by the platform on approval."), Not
   required (default). Not permitted, a failed read (with its reference), an unrecorded maker, an
   unread membership type, a capped scan or a selected branch → "Checked on approval": a check is
   never claimed from a read that couldn't prove it. A "Not met" check informs; it doesn't disable
   Approve (the platform decides; a 500 is explained). Cost if wrong: one caption rule.
8. **Requested access (Q15).** The membership's type and primary branch (or "Your role can't view
   memberships." / "Couldn't be loaded" / "Their membership couldn't be found"); the user's ACTIVE
   role assignments, one page of 100 (`REQUESTED_ROLES_CEILING`), with "Only the first 100 role
   assignments are shown. Their record lists them all." when `hasNext`; their branch assignments
   from 10's bounded scan with 10's partial and branch-context notes. Tables reuse 10's components
   with `canRevoke={false}`. AGENTS.md records a seventh named paging exception (Task 11d). Cost if
   wrong: one table's paging.
9. **The bell (Q4, Q12).** `PendingApprovalNotifications` returns `null` unless the context is
   resolved, in the administration module, and the holder has either pair of codes — before any
   read. It reads `countUserApprovals()` (two `size=1` reads) and/or `countBranchActivations()`
   (one), each `load()`-settled: a lost session or a stale context redirects; any other failure of
   a permitted read makes the whole bell "Notifications (couldn't be loaded)". The label is
   "Notifications: N approval(s) waiting" or "Notifications: nothing waiting"; the entries are
   "N users are / 1 user is waiting for approval." → "Review user onboarding" and "N branches are /
   1 branch is waiting for activation." (+ " Switch to All branches to activate them." with a
   branch selected) → "Review branch activation". Cost if wrong: one condition.
10. **200 vs 202 (Q7).** The approve action parses the activate response with a two-field schema
    (`membership_status`, `user_status`) through `safeParse`: ACTIVE → "Approved. Their membership
    is active."; PENDING_APPROVAL → "Approved. Identity provisioning is queued: the invitation is
    sent when it completes."; unreadable → "Approval recorded". `ApproveResult` carries the outcome;
    `DecisionBar` keeps it for the toast. Cost if wrong: copy.
11. **Branch context (Q10).** The Branch activation tab lists pending branches with a note: "With
    <branch> selected, these branches can be listed but not activated. Switch to All branches to
    review them." and 08's `SwitchToAllBranchesButton` (two ACTIVE branches), else "…and your
    account works at this branch only. Ask an administrator who works at institution level to
    review them." A branch page the backend hides in a branch context (404, BG-03) shows the h1
    "Branch not available here" and 08's `BranchContextState`; Activate is never offered with a
    branch selected, and the action refuses it. Cost if wrong: copy.
12. **Provisioning (Q8).** A pending membership whose user is `PROVISIONING_IDP` was already
    approved (BG-11): its row shows 10's "Provisioning identity", the counts leave it out, and its
    page offers no decision, shows 10's `PROVISIONING_NOTE` with "Open their user record", and no
    control checks. Cost if wrong: a filter.
13. **Carry-ins (Q13, Q14).** P-1 (Task 3a) and P-3 (Task 3b) as the pre-flight describes, each its
    own commit. If the user drops P-3, skip Task 3b and drop its e2e test ("refuses a stale
    Reject & revoke on the user record too (P-3)") from Task 11b. Cost if wrong: one revert each.
14. **Copy.** Every string is the plan's verbatim text, defined once (rule 18); 12 reuses 10's
    `PROVISIONING_NOTE`, `USER_MAKER_CHECKER_BLOCKED`, `accountBlockedNote`, `branchContextNote`,
    `PARTIAL_SCAN_NOTE` and the membership notes, and 08's `MAKER_CHECKER_BLOCKED`.
15. **Not built.** No inline row decisions, no embedded history, no notification entries for
    suspended or revoked records, no return for changes or remarks on Approve (BG-01), no change to
    10's or 08's own decision UIs (P-3 aside).
16. **Tones.** Approve and Activate keep the primary tone, as 10's Approve and 08's Activate do,
    although `ConfirmDialog`'s prop doc reserves `error` for destructive or irreversible actions:
    only Reject & revoke, the one destructive decision, is `error` and an alertdialog. One tone for
    the same decision across the record pages and the queue. Cost if wrong: a `tone` value on two
    dialogs (and on 10's and 08's, for consistency).

## Review Focus

Every reviewer (task and gate) checks these first; each names the tests that pin it.

1. **Safety of the three decisions.** The action refuses before any write wherever the page
   wouldn't offer the decision (a branch context before any read), from the backend's ids,
   comparing users without letter case; an unresolved profile fails closed in all three; an unknown
   maker leaves the backend's 403 as the guard. Pinned by `approval-actions.test.ts` and
   `branch-activation-actions.test.ts` (each refusal asserts `apiPost` not called; each action's
   no-profile case; the maker read's 401/stale redirect; the 403/5xx pass-through), and by the
   detail pages' tests (disabled with the caption; `ME.toUpperCase()` as the maker).
2. **A failed read is never absence or zero.** The bell (any failed part → "couldn't be loaded"),
   the tab counts (a failure leaves the label bare), the maker ("Couldn't be loaded" with its
   reference), requested access (each read: not permitted / failed / none), the control checks (a
   capped or narrowed scan never proves "none"). Pinned by `approval-notifications.test.ts`,
   `approval-checks.test.ts`, `request-facts.test.tsx`, `requested-access.test.tsx`,
   `tenant-notifications.test.tsx`,
   `(queue)/layout.test.tsx` and the page tests' 403/5xx/redirect cases.
3. **Rule 21 (no blanket catch).** `approval-service.ts` never catches; `knownMaker` catches one
   class and rethrows the rest; pages settle every read with `load()`. Pinned by the service test
   ("rejects … with the read's own error") and the redirect cases of every page test and the bell.
4. **Regions and names.** The pages reuse four named, focusable table regions; the user approval
   page has exactly six regions in `main`, the branch page three; the queue one table region per
   tab. Pinned by the page tests and the e2e matrix (`toHaveCount`).
5. **Counts agree with what is shown.** The user tab's count and the bell leave provisioning rows
   out (their rows stay, marked), and the card description says so; the branch count matches the
   tab's rows. Pinned by `(queue)/layout.test.tsx` ("User onboarding (8)" over nine rows in the
   e2e) and the bell's tests.
6. **Cross-layer edits stay additive.** `ConfirmDialog` (P-1), 10's revoke (P-3), the user menu
   (Ruling 1), the nav item: every existing test of those files stays green unchanged except the
   navigation test (index 1 is now the Approval queue), `confirm-dialog.test.tsx` (an `act` import
   and P-1's new test) and the two added assertions in `user-lifecycle-actions.test.tsx`.
7. **Focus and wrapping.** After a decision: the same decision, else the first enabled, else the
   record title (pinned by `decision-bar.test.tsx`'s "moves focus to the record title…" and the
   e2e's "focusing the title"); after a failed Approve, the confirm button (P-1; pinned by
   `confirm-dialog.test.tsx`, which fails with the fix reverted, and the e2e's "returns focus to
   the confirmation"); decision labels `nowrap` beside a 100-character name (pinned by
   `decision-bar.test.tsx`).

## Pre-flight notes (the workflow's pre-flight phase; not a task)

The controller's pre-flight (`2dbfe16`) found, and this plan already reflects:

- 10's `approveMembership`/`revokeMembership` and 08's `activateBranch` are generic transitions on
  the form's id with no pre-call refusal and no 200/202 outcome; 12 adds its own guarded actions
  (Ruling 5) and leaves those for their pages.
- `getUserInviter`/`getBranchMaker` return the actor only; 12's `getMakerEvent` adds the time and
  is cached per request.
- `getMembership`'s transform drops the user status; the actions read the user by the membership's
  `user_id`.
- The detail routes reuse the repo's id parsers (10's `parseUserId`, 17's client-safe
  `parseBranchId`); 12 adds none.
- For layer 14: `listUserApprovals` includes provisioning rows (the endpoint can't leave them out),
  so its pending-approvals card must mark or skip them, as the User onboarding tab does.
- The fake API needs no route change: activate answers 202 for a user with no identity, 500 for a
  provisioning, decided or prerequisite-less membership, 403 for the inviter or drafter. It does
  **not** answer 500 for a blocked account (the backend does, contract §F); 12 refuses that before
  the call, so the e2e never relies on it.
- `next build` accepts the route layout (`(queue)` group with `users`/`branches` pages, and the
  `users/[userId]`/`branches/[branchId]` detail pages outside it).
- The header guard behind Q1 must be able to fail: the organisation name is measured at 1280 and
  1440 px, and reverting Task 9a must fail the 1280 px case (Ruling 1); the gate's long-name header
  check uses `approvals-long-org`, which has the bell (the `long-names` scenario has neither code).
- Carry-ins: P-1 (`ConfirmDialog` strands focus after a failure) and P-3 (10's Reject & revoke
  can terminally revoke a member approved meanwhile), each its own commit. Noted, not carried in:
  08's branch layout uses the URL id as typed (`getBranchMaker`, `selectedHere`), and
  `getTenantUser` swallows failures (display names only).

## Task dependency table

Tasks run in this order; a test never imports what a later task creates.

| Task | Creates or changes                                                                    | Imports from earlier tasks | Commit subject                                                                                    |
| ---- | ------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| 1a   | `approval-rules.ts` (+ test)                                                          | —                          | `feat(approvals): add the approval queue's rules`                                                 |
| 1b   | `approval-contract.ts`, `approval-copy.ts` (+ tests)                                  | 1a                         | `feat(approvals): word the decisions and read the activate echo`                                  |
| 1c   | `approval-notifications.ts` (+ test)                                                  | 1a                         | `feat(approvals): count the actionable approvals for the bell`                                    |
| 1d   | `approval-checks.ts` (+ test)                                                         | 1a                         | `feat(approvals): word the control checks`                                                        |
| 2    | `approval-service.ts` (+ test)                                                        | 1b, 1c                     | `feat(approvals): read the queues, the counts and each request's maker`                           |
| 3a   | `confirm-dialog.tsx` (+ test)                                                         | —                          | `fix(data-display): return focus to the confirmation after a failed submit`                       |
| 3b   | 10's `membership-actions.ts`, `user-rules.ts`, `user-lifecycle-actions.tsx` (+ tests) | —                          | `fix(users): refuse a stale Reject & revoke once the membership moved on`                         |
| 4a   | `approval-guards.ts`, `approval-actions.ts` (+ test)                                  | 1a, 1b, 2                  | `feat(approvals): approve and reject a pending membership, refusing what the page wouldn't offer` |
| 4b   | `branch-activation-actions.ts` (+ test)                                               | 1a, 1b, 4a                 | `feat(approvals): activate a pending branch from the approval queue`                              |
| 5a   | `components/decision-bar.tsx` (+ test)                                                | 1a, 1b, 4a, 4b (3a's fix)  | `feat(approvals): add the decision bar with its dialogs, toasts and focus`                        |
| 5b   | `components/request-facts.tsx`, `control-checks.tsx` (+ tests)                        | 1a, 1b, 1d, 2              | `feat(approvals): show who asked and the control checks`                                          |
| 5c   | `components/requested-access.tsx` (+ test)                                            | 1b, 5b                     | `feat(approvals): show the access a pending user gets once approved`                              |
| 6a   | the nav item, `admin/approvals/page.tsx`, `(queue)/layout.tsx` (+ tests)              | 1a, 1b, 1c, 2              | `feat(approvals): add the Approval queue's navigation item, index and tabs`                       |
| 6b   | `(queue)/users/page.tsx` (+ test)                                                     | 1a, 1b, 2                  | `feat(approvals): list the memberships waiting for approval`                                      |
| 6c   | `(queue)/branches/page.tsx` (+ test)                                                  | 1a, 1b, 2                  | `feat(approvals): list the branches waiting for activation`                                       |
| 7a   | `users/[userId]/page.tsx` (+ test, part 1)                                            | 1a, 1b, 1d, 2, 5a–5c       | `feat(approvals): add the user approval page`                                                     |
| 7b   | the user page test, part 2                                                            | 7a                         | `test(approvals): pin the user approval page's maker-checker, outcomes and checks`                |
| 8a   | `branches/[branchId]/page.tsx` (+ test)                                               | 1a, 1b, 1d, 2, 5a, 5b      | `feat(approvals): add the branch approval page`                                                   |
| 8b   | `approvals-id-guard.test.tsx`                                                         | 7a, 8a                     | `test(approvals): check both approval routes' ids before any read`                                |
| 9a   | `user-menu.tsx` (Ruling 1)                                                            | —                          | `refactor(shell): show the user's name and email in the app bar from xl`                          |
| 9b   | `tenant-notifications.tsx` (+ test)                                                   | 1a, 1c, 2                  | `feat(shell): count pending approvals on the administration bell`                                 |
| 10   | `e2e/fake-api/scenarios.mts`, `e2e/fake-api-approvals.spec.ts`                        | —                          | `test(fake-api): seed the approvals scenarios`                                                    |
| 11a  | `e2e/approvals.spec.ts` (the queue, the ids, the bell)                                | all of the above           | `test(e2e): cover the approval queue, its ids and the bell end to end`                            |
| 11b  | `e2e/approvals.spec.ts` (the decisions)                                               | 11a                        | `test(e2e): cover the approval decisions end to end`                                              |
| 11c  | `e2e/approvals.spec.ts` (the accessibility matrix)                                    | 11b                        | `test(e2e): add the approvals accessibility matrix`                                               |
| 11d  | `README.md`, `AGENTS.md`, `docs/backend-gaps.md`                                      | —                          | `docs(approvals): describe the approval queue and the tenant bell`                                |

All paths under `modules/administration/approvals/` unless they start with `app/`, `components/`,
`e2e/` or name another module. 26 commits (25 if Q14 drops Task 3b).

---

### Task 1: The approval rules and copy

Four sub-tasks, each briefed, implemented, reviewed and committed on its own: **1a** (who sees
what, and where a request stands), **1b** (the activate echo's contract and the copy), **1c** (the
bell's arithmetic) and **1d** (the control checks). Every module here is client-safe (no
`server-only` import), so the decision bar and the pages share it.

#### Task 1a: Who sees what, and where a request stands

**Files:**

- Create: `modules/administration/approvals/approval-rules.ts`
- Create: `modules/administration/approvals/approval-rules.test.ts`

**Interfaces:**

- Consumes: `can`, `canAll`, `PermissionHolder` (`auth/permissions.ts`); `humanizeEnum`
  (`components/data-display/status-chip.tsx`); `BranchStatus`; 08's `MAKER_CHECKER_BLOCKED`;
  `MembershipStatus`, `UserStatus`; 10's `onboardingState`, `accountBlockedNote`,
  `PROVISIONING_NOTE`, `USER_MAKER_CHECKER_BLOCKED`.
- Produces (no id parser: the detail pages reuse 10's `parseUserId` and 17's `parseBranchId`):
  `USER_APPROVAL_CODES`, `BRANCH_ACTIVATION_CODES`, `APPROVALS_HREF`,
  `USER_QUEUE_HREF`, `BRANCH_QUEUE_HREF`, `userApprovalHref`, `branchApprovalHref`,
  `USER_QUEUE_LABEL`, `BRANCH_QUEUE_LABEL`, `ApprovalQueueTab`, `QueueCounts`,
  `approvalQueueTabs(holder, counts?)`, `isSameUser`; `UserApprovalState`,
  `userApprovalState`, `ApprovalDecision`, `availableUserDecisions`, `blockedUserDecisions`,
  `userOutcomeNote`, `availableBranchDecisions`, `blockedBranchDecisions`, `branchOutcomeNote`.

- [ ] **Step 1: Write the failing test** — `approval-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import {
  PROVISIONING_NOTE,
  USER_MAKER_CHECKER_BLOCKED,
} from '@/modules/administration/users/user-rules';
import {
  approvalQueueTabs,
  availableBranchDecisions,
  availableUserDecisions,
  blockedBranchDecisions,
  blockedUserDecisions,
  BRANCH_QUEUE_HREF,
  branchApprovalHref,
  branchOutcomeNote,
  isSameUser,
  USER_QUEUE_HREF,
  userApprovalHref,
  userApprovalState,
  userOutcomeNote,
} from './approval-rules';

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const ME = 'a1000000-0000-4000-8000-0000000000aa';
const VICTOR = 'b2000000-0000-4000-8000-0000000000bb';

const APPROVER = {
  permissions: ['user.approve', 'user.view', 'membership.view', 'membership.revoke'],
};

describe('the queue', () => {
  it.each([
    [
      ['user.approve', 'user.view', 'branch.activate', 'branch.view'],
      ['User onboarding', 'Branch activation'],
    ],
    [['user.approve', 'user.view'], ['User onboarding']],
    [['branch.activate', 'branch.view'], ['Branch activation']],
    // Each tab needs its read code too: a decision without its read-back lists nothing.
    [['user.approve', 'branch.activate'], []],
    [[], []],
  ])('offers the tabs %j allows: %j', (permissions, labels) => {
    expect(approvalQueueTabs({ permissions }).map((tab) => tab.label)).toEqual(labels);
  });

  it('counts a tab only when its count was read (spec §10.6), never a 0 it doesn’t know', () => {
    const both = { permissions: ['user.approve', 'user.view', 'branch.activate', 'branch.view'] };
    expect(approvalQueueTabs(both, { users: 8, branches: 0 }).map((tab) => tab.label)).toEqual([
      'User onboarding (8)',
      'Branch activation (0)',
    ]);
    expect(approvalQueueTabs(both, { users: null, branches: 3 }).map((tab) => tab.label)).toEqual([
      'User onboarding',
      'Branch activation (3)',
    ]);
  });

  it('builds every href from one root', () => {
    expect(approvalQueueTabs({ permissions: ['user.approve', 'user.view'] })[0]?.href).toBe(
      '/admin/approvals/users',
    );
    expect(USER_QUEUE_HREF).toBe('/admin/approvals/users');
    expect(BRANCH_QUEUE_HREF).toBe('/admin/approvals/branches');
    expect(userApprovalHref(VICTOR)).toBe(`/admin/approvals/users/${VICTOR}`);
    expect(branchApprovalHref(VICTOR)).toBe(`/admin/approvals/branches/${VICTOR}`);
  });

  it('compares user ids without letter case, and never matches an unknown one', () => {
    expect(isSameUser(ME.toUpperCase(), ME)).toBe(true);
    expect(isSameUser(VICTOR, ME)).toBe(false);
    expect(isSameUser(null, ME)).toBe(false);
    expect(isSameUser(null, null)).toBe(false);
  });
});

describe('where a user approval stands', () => {
  it.each([
    ['PENDING_APPROVAL', 'DRAFT', 'awaiting'],
    ['PENDING_APPROVAL', 'ACTIVE', 'awaiting'],
    ['PENDING_APPROVAL', 'PROVISIONING_IDP', 'provisioning'],
    ['PENDING_APPROVAL', 'SUSPENDED', 'blocked'],
    ['PENDING_APPROVAL', 'DEACTIVATED', 'blocked'],
    ['ACTIVE', 'ACTIVE', 'decided'],
    ['REVOKED', 'DRAFT', 'decided'],
  ] as const)('reads a %s membership of a %s account as %s', (membership, user, state) => {
    expect(userApprovalState(membership, user)).toBe(state);
  });

  it('offers Approve and Reject & revoke while it waits, each by its own code', () => {
    expect(availableUserDecisions('awaiting', APPROVER)).toEqual(['approve', 'reject']);
    expect(availableUserDecisions('blocked', APPROVER)).toEqual(['approve', 'reject']);
    expect(
      availableUserDecisions('awaiting', { permissions: ['user.approve', 'membership.view'] }),
    ).toEqual(['approve']);
    expect(
      availableUserDecisions('awaiting', { permissions: ['membership.revoke', 'membership.view'] }),
    ).toEqual(['reject']);
  });

  it('offers nothing without membership.view (BG-31), and nothing once decided or provisioning', () => {
    expect(
      availableUserDecisions('awaiting', {
        permissions: ['user.approve', 'user.view', 'membership.revoke'],
      }),
    ).toEqual([]);
    expect(availableUserDecisions('provisioning', APPROVER)).toEqual([]);
    expect(availableUserDecisions('decided', APPROVER)).toEqual([]);
  });

  it('disables Approve for a blocked account first, then for its inviter, never Reject', () => {
    expect(
      blockedUserDecisions(['approve', 'reject'], {
        state: 'blocked',
        userStatus: 'SUSPENDED',
        invitedByMe: true,
      }),
    ).toEqual({
      approve: "Their account is suspended on the platform, so this membership can't be approved.",
    });
    expect(
      blockedUserDecisions(['approve', 'reject'], {
        state: 'awaiting',
        userStatus: 'DRAFT',
        invitedByMe: true,
      }),
    ).toEqual({ approve: USER_MAKER_CHECKER_BLOCKED });
    expect(
      blockedUserDecisions(['approve', 'reject'], {
        state: 'awaiting',
        userStatus: 'DRAFT',
        invitedByMe: false,
      }),
    ).toEqual({});
    expect(
      blockedUserDecisions(['reject'], {
        state: 'awaiting',
        userStatus: 'DRAFT',
        invitedByMe: true,
      }),
    ).toEqual({});
  });

  it('says what happened instead of offering a decision', () => {
    expect(userOutcomeNote('awaiting', 'PENDING_APPROVAL')).toBeNull();
    expect(userOutcomeNote('blocked', 'PENDING_APPROVAL')).toBeNull();
    expect(userOutcomeNote('provisioning', 'PENDING_APPROVAL')).toBe(PROVISIONING_NOTE);
    expect(userOutcomeNote('decided', 'ACTIVE')).toBe('Approved: this membership is active.');
    expect(userOutcomeNote('decided', 'REVOKED')).toBe(
      "Rejected: this membership was revoked, and this email can't be invited to this institution again.",
    );
    expect(userOutcomeNote('decided', 'SUSPENDED')).toBe(
      "This membership isn't waiting for approval: it is suspended.",
    );
  });
});

describe('where a branch activation stands', () => {
  const ACTIVATOR = { permissions: ['branch.activate', 'branch.view'] };

  it('offers Activate only while pending, and only with both codes', () => {
    expect(availableBranchDecisions('PENDING_APPROVAL', ACTIVATOR)).toEqual(['activate']);
    expect(availableBranchDecisions('ACTIVE', ACTIVATOR)).toEqual([]);
    expect(
      availableBranchDecisions('PENDING_APPROVAL', { permissions: ['branch.activate'] }),
    ).toEqual([]);
  });

  it('disables Activate for its drafter', () => {
    expect(blockedBranchDecisions(['activate'], { draftedByMe: true })).toEqual({
      activate: MAKER_CHECKER_BLOCKED,
    });
    expect(blockedBranchDecisions(['activate'], { draftedByMe: false })).toEqual({});
    expect(blockedBranchDecisions([], { draftedByMe: true })).toEqual({});
  });

  it.each([
    ['PENDING_APPROVAL', null],
    ['ACTIVE', 'Activated: this branch is live.'],
    ['DRAFT', "This branch is still a draft: it hasn't been submitted for activation."],
    ['CLOSED', "This branch isn't waiting for activation: it is closed."],
  ] as const)('notes a %s branch: %j', (status, note) => {
    expect(branchOutcomeNote(status)).toBe(note);
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — form U. Expected: FAIL (the module doesn't exist).

- [ ] **Step 3: Implement** — `approval-rules.ts`:

```ts
import { can, canAll, type PermissionHolder } from '@/auth/permissions';
import { humanizeEnum } from '@/components/data-display/status-chip';
import type { BranchStatus } from '@/modules/administration/branches/branch-contract';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import type { MembershipStatus, UserStatus } from '@/modules/administration/users/user-contract';
import {
  accountBlockedNote,
  onboardingState,
  PROVISIONING_NOTE,
  USER_MAKER_CHECKER_BLOCKED,
} from '@/modules/administration/users/user-rules';

/**
 * Layer 12's rules, client-safe: who sees which queue, and where a request stands and what it
 * offers. The decisions' wording and the pages' copy are in `approval-copy.ts`, the bell's
 * arithmetic in `approval-notifications.ts`, the control checks in `approval-checks.ts`.
 */

// ── Who sees what (Ruling 2) ─────────────────────────────────────────────────────────────────────

/** The User onboarding tab and the bell's user count: `user.view` lists the users, `user.approve`
 * decides. The decision also reads the membership back (`membership.view`, BG-31): the detail page
 * says so when it is missing. */
export const USER_APPROVAL_CODES = ['user.approve', 'user.view'] as const;
/** The Branch activation tab and the bell's branch count: activate reads the branch back (BG-31). */
export const BRANCH_ACTIVATION_CODES = ['branch.activate', 'branch.view'] as const;

export const APPROVALS_HREF = '/admin/approvals';
export const USER_QUEUE_HREF = `${APPROVALS_HREF}/users`;
export const BRANCH_QUEUE_HREF = `${APPROVALS_HREF}/branches`;

export function userApprovalHref(userId: string): string {
  return `${USER_QUEUE_HREF}/${userId}`;
}

export function branchApprovalHref(branchId: string): string {
  return `${BRANCH_QUEUE_HREF}/${branchId}`;
}

export const USER_QUEUE_LABEL = 'User onboarding';
export const BRANCH_QUEUE_LABEL = 'Branch activation';

/** Structurally the kit's `RecordTab`. */
export interface ApprovalQueueTab {
  href: string;
  label: string;
}

/** Spec §10.6's tab counts: actionable users and pending branches; `null` when not read or the
 * read failed, so the label carries no number (never a 0 it doesn't know). */
export interface QueueCounts {
  users: number | null;
  branches: number | null;
}

const NO_COUNTS: QueueCounts = { users: null, branches: null };

/** The queue's tabs, in order, for what the holder can see; `/admin/approvals` opens the first. */
export function approvalQueueTabs(
  holder: PermissionHolder,
  counts: QueueCounts = NO_COUNTS,
): ApprovalQueueTab[] {
  const label = (text: string, count: number | null) =>
    count === null ? text : `${text} (${count})`;
  const tabs: ApprovalQueueTab[] = [];
  if (canAll(holder, USER_APPROVAL_CODES)) {
    tabs.push({ href: USER_QUEUE_HREF, label: label(USER_QUEUE_LABEL, counts.users) });
  }
  if (canAll(holder, BRANCH_ACTIVATION_CODES)) {
    tabs.push({ href: BRANCH_QUEUE_HREF, label: label(BRANCH_QUEUE_LABEL, counts.branches) });
  }
  return tabs;
}

/** The backend's and `/auth/me`'s ids are canonical lower case (contract §A); compared without case
 * anyway, so the maker-checker gate never rests on letter case (Ruling 5). */
export function isSameUser(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a.toLowerCase() === b.toLowerCase();
}

// ── Where a request stands, and what it offers (Rulings 5–7) ─────────────────────────────────────

/** `awaiting` takes Approve and Reject & revoke; `blocked` (a pending membership whose account is
 * suspended, locked or deactivated: approving it is a 500, contract §F) shows Approve disabled and
 * takes Reject & revoke; `provisioning` was already approved (BG-11) and takes no decision here. */
export type UserApprovalState = 'awaiting' | 'blocked' | 'provisioning' | 'decided';

export function userApprovalState(
  membership: MembershipStatus,
  user: UserStatus,
): UserApprovalState {
  if (membership !== 'PENDING_APPROVAL') return 'decided';
  switch (onboardingState(membership, user).key) {
    case 'PROVISIONING_IDENTITY':
      return 'provisioning';
    case 'ACCOUNT_BLOCKED':
      return 'blocked';
    default:
      return 'awaiting';
  }
}

export type ApprovalDecision = 'approve' | 'reject' | 'activate';

/** Every membership transition reads the membership back, so `membership.view` gates both (BG-31);
 * then each decision's own code: Approve `user.approve`, Reject & revoke `membership.revoke`. */
export function availableUserDecisions(
  state: UserApprovalState,
  holder: PermissionHolder,
): ApprovalDecision[] {
  if (!can(holder, 'membership.view') || (state !== 'awaiting' && state !== 'blocked')) return [];
  const decisions: ApprovalDecision[] = [];
  if (can(holder, 'user.approve')) decisions.push('approve');
  if (can(holder, 'membership.revoke')) decisions.push('reject');
  return decisions;
}

/** The offered decisions shown disabled, each with its caption (spec §6.6): a blocked account
 * first, then maker-checker (the inviter is known only with `audit.view`, BG-08). */
export function blockedUserDecisions(
  decisions: readonly ApprovalDecision[],
  subject: { state: UserApprovalState; userStatus: UserStatus; invitedByMe: boolean },
): Partial<Record<ApprovalDecision, string>> {
  if (!decisions.includes('approve')) return {};
  if (subject.state === 'blocked') return { approve: accountBlockedNote(subject.userStatus) };
  if (subject.invitedByMe) return { approve: USER_MAKER_CHECKER_BLOCKED };
  return {};
}

/** Why a user approval offers no decision, shown in place of the bar; null while it waits. */
export function userOutcomeNote(
  state: UserApprovalState,
  membership: MembershipStatus,
): string | null {
  if (state === 'provisioning') return PROVISIONING_NOTE;
  if (state !== 'decided') return null;
  switch (membership) {
    case 'ACTIVE':
      return 'Approved: this membership is active.';
    case 'REVOKED':
      return "Rejected: this membership was revoked, and this email can't be invited to this institution again.";
    default:
      return `This membership isn't waiting for approval: it is ${humanizeEnum(membership).toLowerCase()}.`;
  }
}

/** Activate reads the branch back (BG-31) and needs the All branches context (BG-03), which the
 * page checks before it offers the bar. */
export function availableBranchDecisions(
  status: BranchStatus,
  holder: PermissionHolder,
): ApprovalDecision[] {
  return status === 'PENDING_APPROVAL' && canAll(holder, BRANCH_ACTIVATION_CODES)
    ? ['activate']
    : [];
}

export function blockedBranchDecisions(
  decisions: readonly ApprovalDecision[],
  subject: { draftedByMe: boolean },
): Partial<Record<ApprovalDecision, string>> {
  return decisions.includes('activate') && subject.draftedByMe
    ? { activate: MAKER_CHECKER_BLOCKED }
    : {};
}

/** Why a branch activation offers no decision; null while it waits. */
export function branchOutcomeNote(status: BranchStatus): string | null {
  switch (status) {
    case 'PENDING_APPROVAL':
      return null;
    case 'ACTIVE':
      return 'Activated: this branch is live.';
    case 'DRAFT':
      return "This branch is still a draft: it hasn't been submitted for activation.";
    default:
      return `This branch isn't waiting for activation: it is ${humanizeEnum(status).toLowerCase()}.`;
  }
}
```

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs (each must fail the named test; revert after
      each): compare ids with `===` in `isSameUser` ("compares user ids without letter case…");
      drop `can(holder, 'membership.view')` from `availableUserDecisions` ("offers nothing without
      membership.view…"); return `'awaiting'` for `PROVISIONING_IDENTITY` ("reads a
      PENDING_APPROVAL membership of a PROVISIONING_IDP account as provisioning"); check
      `invitedByMe` before the blocked state in `blockedUserDecisions` ("disables Approve for a
      blocked account first…"); label a `null` count `(0)` ("counts a tab only when its count was
      read…").

- [ ] **Step 5: Commit** (form C):

```
feat(approvals): add the approval queue's rules

Who sees which queue tab (each needs its decision and its read code), where a pending membership or
branch stands (awaiting, blocked, provisioning, decided), and which decisions a page offers and
which it shows disabled with a reason. Ids are compared without letter case (Ruling 5).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** `approvalQueueTabs` without counts is what the
index page uses for its redirect.

#### Task 1b: The activate echo's contract and the copy

**Files:**

- Create: `modules/administration/approvals/approval-contract.ts`
- Create: `modules/administration/approvals/approval-contract.test.ts`
- Create: `modules/administration/approvals/approval-copy.ts`
- Create: `modules/administration/approvals/approval-copy.test.ts`

**Interfaces:**

- Consumes: `MEMBERSHIP_STATUSES`, `USER_STATUSES`; `ActionResult` (type,
  `lib/api/action-result.ts`); Task 1a's `ApprovalDecision`.
- Produces: `membershipDecisionSchema`, `MembershipDecision`; `DecisionCopy`, `decisionCopy`;
  `ApprovalOutcome`, `APPROVED_TOAST`, `REJECTED_TOAST`, `ACTIVATED_TOAST`, `approvalOutcome`,
  `ApproveResult`; the four frontend-only codes (`APPROVAL_CHANGED_CODE`, `ACCOUNT_BLOCKED_CODE`,
  `MAKER_CHECKER_CODE`, `BRANCH_CONTEXT_CODE`) and their copy (a blocked account's refusal reuses
  10's `accountBlockedNote`, the disabled caption's own words); every page's copy, including
  `REQUESTED_ROLES_CEILING` and `branchQueueContextNote`. The Request line is worded by kind only
  ("User onboarding: a new membership"), since it also shows on a decided request's page.

- [ ] **Step 1: Write the failing tests.** `approval-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { membershipDecisionSchema } from './approval-contract';

// The activate response is a whole MembershipDetail; only its two statuses are read.
const wire = {
  id: 'c3000000-0000-4000-8000-000000000001',
  organisation_id: 'd4000000-0000-4000-8000-000000000001',
  user_id: 'e5000000-0000-4000-8000-000000000001',
  username: 'amina.odhiambo',
  email: 'amina.odhiambo@greenfield.example',
  display_name: 'Amina Odhiambo',
  user_status: 'PROVISIONING_IDP',
  membership_status: 'PENDING_APPROVAL',
  membership_type: 'STAFF',
  primary_branch_id: null,
  created_at: '2026-09-20T08:00:00Z',
  updated_at: '2026-09-20T08:00:00Z',
};

describe('membershipDecisionSchema', () => {
  it('reads the two statuses that tell a 200 from a 202, and nothing else', () => {
    expect(membershipDecisionSchema.parse(wire)).toEqual({
      membershipStatus: 'PENDING_APPROVAL',
      userStatus: 'PROVISIONING_IDP',
    });
  });

  it.each([
    ['an unknown membership status', { ...wire, membership_status: 'APPROVED' }],
    ['a missing user status', { ...wire, user_status: undefined }],
    ['an empty body', {}],
  ])('rejects %s (the action then claims neither outcome)', (_case, body) => {
    expect(membershipDecisionSchema.safeParse(body).success).toBe(false);
  });
});
```

`approval-copy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  APPROVED_TOAST,
  approvalOutcome,
  branchQueueContextNote,
  decisionCopy,
  REQUESTED_ROLES_CEILING,
  ROLES_CAPPED,
} from './approval-copy';

describe('the decisions', () => {
  it('words each dialog, with Reject & revoke the only destructive one', () => {
    expect(decisionCopy('approve', 'Amina Odhiambo')).toMatchObject({
      label: 'Approve',
      title: 'Approve Amina Odhiambo?',
      reason: null,
      destructive: false,
    });
    expect(decisionCopy('approve', 'Amina').description).toContain("An approval can't be undone.");
    expect(decisionCopy('reject', 'Amina Odhiambo')).toMatchObject({
      label: 'Reject & revoke',
      title: 'Reject and revoke Amina Odhiambo?',
      reason: 'required',
      destructive: true,
    });
    expect(decisionCopy('activate', 'Kericho Branch')).toMatchObject({
      label: 'Activate',
      title: 'Activate Kericho Branch?',
      reason: 'optional',
      destructive: false,
    });
  });

  it('reads a 200 from an ACTIVE echo and a 202 from a pending one (Ruling 10)', () => {
    expect(approvalOutcome({ membershipStatus: 'ACTIVE', userStatus: 'INVITED' })).toBe('active');
    expect(
      approvalOutcome({ membershipStatus: 'PENDING_APPROVAL', userStatus: 'PROVISIONING_IDP' }),
    ).toBe('provisioning');
    expect(approvalOutcome(null)).toBe('recorded');
  });
});

describe('the pages’ copy', () => {
  it('words a 200, a 202 and an unreadable echo differently', () => {
    expect(new Set(Object.values(APPROVED_TOAST)).size).toBe(3);
  });

  it('tells a branch context how to activate, or whom to ask', () => {
    expect(branchQueueContextNote('Westlands Branch', true)).toBe(
      'With Westlands Branch selected, these branches can be listed but not activated. Switch to All branches to review them.',
    );
    expect(branchQueueContextNote('Westlands Branch', false)).toBe(
      'With Westlands Branch selected, these branches can be listed but not activated, and your account works at this branch only. Ask an administrator who works at institution level to review them.',
    );
  });

  it('names the roles ceiling in its note', () => {
    expect(REQUESTED_ROLES_CEILING).toBe(100);
    expect(ROLES_CAPPED).toBe(
      'Only the first 100 role assignments are shown. Their record lists them all.',
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail** — form U. Expected: FAIL.

- [ ] **Step 3: Implement the contract** — `approval-contract.ts`:

```ts
import { z } from 'zod';
import { MEMBERSHIP_STATUSES, USER_STATUSES } from '@/modules/administration/users/user-contract';

/** The activate response (`MembershipDetail`, contract §C): only the two statuses that tell a 200
 * (the membership is ACTIVE) from a 202 (it stays PENDING_APPROVAL while the identity is created)
 * are read. Parsed with `safeParse`: an approval that succeeded must never fail on its echo. */
export const membershipDecisionSchema = z
  .object({
    membership_status: z.enum(MEMBERSHIP_STATUSES),
    user_status: z.enum(USER_STATUSES),
  })
  .transform((detail) => ({
    membershipStatus: detail.membership_status,
    userStatus: detail.user_status,
  }));

export type MembershipDecision = z.output<typeof membershipDecisionSchema>;
```

- [ ] **Step 4: Implement the copy** — `approval-copy.ts`:

```ts
import type { ActionResult } from '@/lib/api/action-result';
import type { MembershipDecision } from './approval-contract';
import type { ApprovalDecision } from './approval-rules';

// ── The decisions' copy (Rulings 6, 10) ──────────────────────────────────────────────────────────

export interface DecisionCopy {
  label: string;
  title: string;
  description: string;
  /** `null`: the activate endpoint reads no body, so a confirmation without a reason. */
  reason: 'optional' | 'required' | null;
  /** Irreversible and destructive: an error-toned trigger and an alertdialog. */
  destructive: boolean;
}

export function decisionCopy(decision: ApprovalDecision, name: string): DecisionCopy {
  switch (decision) {
    case 'approve':
      return {
        label: 'Approve',
        title: `Approve ${name}?`,
        description:
          "Their membership becomes active once their sign-in identity is ready. If they don't have one yet, it is created first and the invitation is sent when it completes. An approval can't be undone.",
        reason: null,
        destructive: false,
      };
    case 'reject':
      return {
        label: 'Reject & revoke',
        title: `Reject and revoke ${name}?`,
        description:
          'This is permanent. The membership is revoked, and this email can never be invited to this institution again.',
        reason: 'required',
        destructive: true,
      };
    case 'activate':
      return {
        label: 'Activate',
        title: `Activate ${name}?`,
        description:
          "The branch goes live: it can take user assignments and become a working context. A live branch can be suspended or closed, but it can't return to a draft.",
        reason: 'optional',
        destructive: false,
      };
  }
}

/** 200 = the membership is ACTIVE; 202 = it stays PENDING_APPROVAL while the identity is created
 * (contract §E.3). `recorded`: the echo couldn't be read, so the toast claims neither. */
export type ApprovalOutcome = 'active' | 'provisioning' | 'recorded';

export const APPROVED_TOAST: Record<ApprovalOutcome, string> = {
  active: 'Approved. Their membership is active.',
  provisioning:
    'Approved. Identity provisioning is queued: the invitation is sent when it completes.',
  recorded: 'Approval recorded',
};
export const REJECTED_TOAST = 'Membership revoked';
export const ACTIVATED_TOAST = 'Branch activated';

export function approvalOutcome(echo: MembershipDecision | null): ApprovalOutcome {
  if (echo?.membershipStatus === 'ACTIVE') return 'active';
  if (echo?.membershipStatus === 'PENDING_APPROVAL') return 'provisioning';
  return 'recorded';
}

/** `approveUser`'s result: a success carries which way the approval went (Ruling 10). */
export type ApproveResult =
  { ok: true; outcome: ApprovalOutcome } | Extract<ActionResult, { ok: false }>;

/** Frontend-only problem codes: the actions refuse before any write (Ruling 5; precedent: 17's
 * `own_account`, 16's `tenant_code_taken`). */
export const APPROVAL_CHANGED_CODE = 'approval_changed';
export const ACCOUNT_BLOCKED_CODE = 'account_blocked';
export const MAKER_CHECKER_CODE = 'maker_checker';
export const BRANCH_CONTEXT_CODE = 'branch_context';

export const APPROVAL_CHANGED =
  'This approval changed since the page loaded. Refresh to see where it stands.';
export const BRANCH_CHANGED =
  'This branch changed since the page loaded. Refresh to see where it stands.';
export const BRANCH_CONTEXT_REFUSAL =
  'Branches are activated with All branches selected. Switch to All branches and try again.';
/** BG-08: a maker-checker refusal is the same 403 as a missing permission: never assert which. */
export const APPROVE_FORBIDDEN =
  "You can't approve this user. Your role may not allow it, or you invited them: a different administrator must approve them.";
/** BG-07: missing prerequisites are 500s. */
export const APPROVE_FAILED =
  "The approval couldn't complete. They may still need an active role and, for staff and admin members, an active branch assignment. Refresh and check.";
export const REJECT_FAILED =
  "This membership couldn't be revoked. It may already be revoked: refresh and check.";
export const ACTIVATE_FORBIDDEN =
  "You can't activate this branch. Your role may not allow it, or you drafted it: a different administrator must activate it.";

// ── Page copy ────────────────────────────────────────────────────────────────────────────────────

export const QUEUE_DESCRIPTION =
  'Memberships waiting for approval and branches waiting for activation. An administrator other than the one who asked must decide each.';
export const USER_QUEUE_DESCRIPTION =
  "Newest first. Someone marked Provisioning identity was already approved and needs no decision, so the tab's count leaves them out.";
export const BRANCH_QUEUE_DESCRIPTION = 'Branches submitted for activation.';
export const NO_USERS_WAITING = 'No users are waiting for approval';
export const NO_BRANCHES_WAITING = 'No branches are waiting for activation';
export const NO_APPROVAL_ACCESS =
  "Your role can't approve users or activate branches. Ask an administrator if you need access.";
export const USER_APPROVAL_FORBIDDEN =
  "Your role can't approve users. Ask an administrator if you need access.";
export const BRANCH_ACTIVATION_FORBIDDEN =
  "Your role can't activate branches. Ask an administrator if you need access.";

/** The Branch activation tab with a branch selected (Ruling 11): the list isn't branch-restricted,
 * but activation needs All branches (BG-03). */
export function branchQueueContextNote(branchName: string, canSwitch: boolean): string {
  return canSwitch
    ? `With ${branchName} selected, these branches can be listed but not activated. Switch to All branches to review them.`
    : `With ${branchName} selected, these branches can be listed but not activated, and your account works at this branch only. Ask an administrator who works at institution level to review them.`;
}

export const USER_APPROVAL_EYEBROW = 'Approval queue · User onboarding';
export const BRANCH_APPROVAL_EYEBROW = 'Approval queue · Branch activation';
// By kind only: the Request card also shows on a page whose request was already decided.
export const USER_REQUEST = 'User onboarding: a new membership';
export const BRANCH_REQUEST = 'Branch activation: a submitted branch';
export const REQUEST_DESCRIPTION = 'Who asked, and when. The full history is in the audit trail.';
export const CHECKS_DESCRIPTION =
  "What the platform requires before it approves or activates. A check this page can't read is left to the platform.";
export const MAKER_NOT_PERMITTED = "Your role can't view the audit trail";
export const MAKER_NOT_RECORDED = 'Not in the audit trail';
export const MEMBERSHIP_NOT_FOUND = "Their membership couldn't be found";
export const READ_FAILED = "Couldn't be loaded";

/** One page of role assignments: a pending user holds a handful (Ruling 8, AGENTS.md's seventh
 * paging exception). */
export const REQUESTED_ROLES_CEILING = 100;
export const REQUESTED_ACCESS_DESCRIPTION =
  'The access they get once approved: their roles and branches were assigned when they were invited.';
export const ROLES_NOT_PERMITTED = "Your role can't view role assignments.";
export const BRANCHES_NOT_PERMITTED = "Your role can't view branch assignments.";
export const MEMBERSHIP_NOT_PERMITTED = "Your role can't view memberships.";
export const NO_ACTIVE_ROLE = 'They hold no active role.';
export const NO_ACTIVE_BRANCH = 'They hold no active branch assignment.';
export const ROLES_CAPPED = `Only the first ${REQUESTED_ROLES_CEILING} role assignments are shown. Their record lists them all.`;
```

- [ ] **Step 5: Run** — form U: PASS. Mutation proofs: make `user_status` optional in the schema
      ("rejects a missing user status…"); return `'active'` for any readable echo ("reads a 200
      from an ACTIVE echo and a 202 from a pending one"); mark Activate destructive ("words each
      dialog, with Reject & revoke the only destructive one").

- [ ] **Step 6: Commit** (form C):

```
feat(approvals): word the decisions and read the activate echo

The dialogs' titles, warnings and labels; the toasts, including whether an approval went live (200)
or queued identity provisioning (202), read from the two statuses of the activate response (an
unreadable echo claims neither); the frontend-only refusal codes with their copy; and every page's
copy, defined once.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** every string a later task shows is in this
module, in 10's `user-rules.ts` or 08's `branch-rules.ts` (rule 18).

#### Task 1c: The bell's arithmetic

**Files:**

- Create: `modules/administration/approvals/approval-notifications.ts`
- Create: `modules/administration/approvals/approval-notifications.test.ts`

**Interfaces:**

- Consumes: `NotificationEntry`, `NotificationsMenuProps` (types, 17's
  `components/shell/notifications-menu.tsx`); Task 1a's `USER_QUEUE_HREF` and `BRANCH_QUEUE_HREF`.
- Produces: `UserApprovalCounts`, `actionableUserApprovals`, `CountRead`, `NOTHING_WAITING`,
  `APPROVALS_UNAVAILABLE`, `approvalNotifications(input): NotificationsMenuProps`.

- [ ] **Step 1: Write the failing test** — `approval-notifications.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BRANCH_QUEUE_HREF, USER_QUEUE_HREF } from './approval-rules';
import {
  actionableUserApprovals,
  approvalNotifications,
  APPROVALS_UNAVAILABLE,
  NOTHING_WAITING,
} from './approval-notifications';

describe('the bell (Ruling 9)', () => {
  it.each([
    [{ pending: 9, provisioning: 1 }, 8],
    [{ pending: 2, provisioning: 2 }, 0],
    // The two reads aren't atomic: a decision between them can't make the count negative.
    [{ pending: 1, provisioning: 3 }, 0],
  ])('counts %j as %i actionable', (counts, expected) => {
    expect(actionableUserApprovals(counts)).toBe(expected);
  });

  it('adds actionable users to pending branches, with an entry and a link each', () => {
    expect(
      approvalNotifications({
        users: { ok: true, value: { pending: 9, provisioning: 1 } },
        branches: { ok: true, value: 3 },
        branchSelected: false,
      }),
    ).toEqual({
      label: 'Notifications: 11 approvals waiting',
      total: 11,
      entries: [
        {
          id: 'user-onboarding',
          text: '8 users are waiting for approval.',
          href: USER_QUEUE_HREF,
          linkLabel: 'Review user onboarding',
        },
        {
          id: 'branch-activation',
          text: '3 branches are waiting for activation.',
          href: BRANCH_QUEUE_HREF,
          linkLabel: 'Review branch activation',
        },
      ],
      emptyText: NOTHING_WAITING,
      unavailableText: APPROVALS_UNAVAILABLE,
    });
  });

  it('counts only what the holder may read, in the singular when it is one', () => {
    const users = approvalNotifications({
      users: { ok: true, value: { pending: 1, provisioning: 0 } },
      branches: null,
      branchSelected: false,
    });
    expect(users.label).toBe('Notifications: 1 approval waiting');
    expect(users.entries.map((entry) => entry.text)).toEqual(['1 user is waiting for approval.']);
    const branches = approvalNotifications({
      users: null,
      branches: { ok: true, value: 1 },
      branchSelected: false,
    });
    expect(branches.entries.map((entry) => entry.text)).toEqual([
      '1 branch is waiting for activation.',
    ]);
  });

  it('tells a branch context that activation needs All branches (BG-03)', () => {
    const props = approvalNotifications({
      users: null,
      branches: { ok: true, value: 2 },
      branchSelected: true,
    });
    expect(props.entries[0]?.text).toBe(
      '2 branches are waiting for activation. Switch to All branches to activate them.',
    );
  });

  it('reads none at zero, with no entries', () => {
    expect(
      approvalNotifications({
        users: { ok: true, value: { pending: 1, provisioning: 1 } },
        branches: { ok: true, value: 0 },
        branchSelected: false,
      }),
    ).toMatchObject({ label: 'Notifications: nothing waiting', total: 0, entries: [] });
  });

  it.each([
    ['the user counts', { ok: false } as const, { ok: true, value: 2 } as const],
    [
      'the branch count',
      { ok: true, value: { pending: 4, provisioning: 0 } } as const,
      { ok: false } as const,
    ],
  ])('never reads as none when %s failed: the whole count is unknown', (_part, users, branches) => {
    expect(approvalNotifications({ users, branches, branchSelected: false })).toMatchObject({
      label: "Notifications (couldn't be loaded)",
      total: null,
      entries: [],
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — form U. Expected: FAIL.

- [ ] **Step 3: Implement** — `approval-notifications.ts`:

```ts
import type {
  NotificationEntry,
  NotificationsMenuProps,
} from '@/components/shell/notifications-menu';
import { BRANCH_QUEUE_HREF, USER_QUEUE_HREF } from './approval-rules';

// ── The bell's arithmetic (spec §8, Ruling 9) ────────────────────────────────────────────────────

export interface UserApprovalCounts {
  /** Memberships PENDING_APPROVAL. */
  pending: number;
  /** Of those, the ones whose user is PROVISIONING_IDP: approval already ran (BG-11). */
  provisioning: number;
}

/** The two reads aren't atomic (a decision can land between them), so the difference is clamped. */
export function actionableUserApprovals(counts: UserApprovalCounts): number {
  return Math.max(0, counts.pending - counts.provisioning);
}

/** A settled count, structurally `Loaded<T>` (lib/api/load.ts is server-only); `null`: the holder
 * isn't permitted, so nothing was read. */
export type CountRead<T> = { ok: true; value: T } | { ok: false } | null;

export const NOTHING_WAITING = 'Nothing is waiting for your approval.';
export const APPROVALS_UNAVAILABLE = "Pending approvals couldn't be loaded. Refresh to try again.";

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** The tenant bell (spec §8, BG-22). Any permitted read that failed makes the whole count unknown:
 * a part that failed must never read as none (Ruling 9). */
export function approvalNotifications(input: {
  users: CountRead<UserApprovalCounts>;
  branches: CountRead<number>;
  /** A branch is selected: pending branches can be listed but only activated at All branches. */
  branchSelected: boolean;
}): NotificationsMenuProps {
  const common = { emptyText: NOTHING_WAITING, unavailableText: APPROVALS_UNAVAILABLE };
  if (input.users?.ok === false || input.branches?.ok === false) {
    return { ...common, label: "Notifications (couldn't be loaded)", total: null, entries: [] };
  }
  const users = input.users ? actionableUserApprovals(input.users.value) : 0;
  const branches = input.branches ? input.branches.value : 0;
  const entries: NotificationEntry[] = [];
  if (users > 0) {
    entries.push({
      id: 'user-onboarding',
      text: `${users} ${plural(users, 'user is', 'users are')} waiting for approval.`,
      href: USER_QUEUE_HREF,
      linkLabel: 'Review user onboarding',
    });
  }
  if (branches > 0) {
    entries.push({
      id: 'branch-activation',
      text: `${branches} ${plural(branches, 'branch is', 'branches are')} waiting for activation.${
        input.branchSelected ? ' Switch to All branches to activate them.' : ''
      }`,
      href: BRANCH_QUEUE_HREF,
      linkLabel: 'Review branch activation',
    });
  }
  const total = users + branches;
  return {
    ...common,
    label:
      total === 0
        ? 'Notifications: nothing waiting'
        : `Notifications: ${total} ${plural(total, 'approval', 'approvals')} waiting`,
    total,
    entries,
  };
}
```

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs: drop the `Math.max(0, …)` clamp ("counts
      {"pending":1,"provisioning":3} as 0 actionable"); read a failed part as 0 instead of unknown
      ("never reads as none when … failed").

- [ ] **Step 5: Commit** (form C):

```
feat(approvals): count the actionable approvals for the bell

The bell counts pending users less those whose identity is already provisioning (clamped at zero:
the two reads aren't atomic) plus pending branches, and reads "couldn't be loaded" as soon as one
permitted count fails.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** a count the holder may not read is left out of
the entries, never shown as zero.

#### Task 1d: The control checks

**Files:**

- Create: `modules/administration/approvals/approval-checks.ts`
- Create: `modules/administration/approvals/approval-checks.test.ts`

**Interfaces:**

- Consumes: Task 1a's `isSameUser`; `StatusTone`; `shortId`; `MembershipType`; 08's
  `MAKER_CHECKER_BLOCKED`; 10's `USER_MAKER_CHECKER_BLOCKED`.
- Produces: `CheckState`, `CHECK_STATES`, `VERIFIED_ON_APPROVAL`, `ControlCheck`, `CheckRead`,
  `MakerFact`, `userControlChecks(input)`, `branchControlChecks(input)`.

- [ ] **Step 1: Write the failing test** — `approval-checks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import { USER_MAKER_CHECKER_BLOCKED } from '@/modules/administration/users/user-rules';
import { branchControlChecks, userControlChecks, VERIFIED_ON_APPROVAL } from './approval-checks';

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const ME = 'a1000000-0000-4000-8000-0000000000aa';
const VICTOR = 'b2000000-0000-4000-8000-0000000000bb';

describe('the control checks', () => {
  const checks = (overrides: Partial<Parameters<typeof userControlChecks>[0]> = {}) =>
    userControlChecks({
      maker: { ok: true, value: { actorUserId: VICTOR, name: 'Victor Otieno' } },
      me: ME,
      roles: { ok: true, value: 1 },
      branches: { ok: true, value: { count: 1, complete: true } },
      membershipType: 'STAFF',
      organisationName: 'Greenfield SACCO',
      ...overrides,
    });
  const byId = (id: string, list = checks()) => list.find((check) => check.id === id);

  it('passes every check for a complete request invited by someone else', () => {
    expect(checks().map((check) => [check.label, check.state])).toEqual([
      ['Invited by someone else', 'passed'],
      ['Has an active role', 'passed'],
      ['Has an active branch assignment', 'passed'],
      ['Institution is active', 'passed'],
    ]);
    expect(byId('maker')?.detail).toBe('Invited by Victor Otieno.');
    expect(byId('institution')?.detail).toBe(
      'Greenfield SACCO is active. The platform checks this on every request.',
    );
  });

  it("fails the maker check for the signed-in user's own invitation, whatever the case", () => {
    const own = checks({
      maker: { ok: true, value: { actorUserId: ME.toUpperCase(), name: null } },
    });
    expect(byId('maker', own)).toMatchObject({
      state: 'failed',
      detail: USER_MAKER_CHECKER_BLOCKED,
    });
  });

  it('names an unnamed maker by short id', () => {
    const unnamed = checks({ maker: { ok: true, value: { actorUserId: VICTOR, name: null } } });
    expect(byId('maker', unnamed)?.detail).toBe('Invited by b2000000.');
  });

  it.each([
    [
      'not permitted',
      null,
      "Your role can't view the audit trail, so this page can't tell who invited them.",
    ],
    [
      'a failed read',
      { ok: false, problem: { requestId: 'req-7' } } as const,
      "Who invited them couldn't be loaded. Reference: req-7",
    ],
    [
      'no invitation event',
      { ok: true, value: null } as const,
      "The audit trail doesn't say who invited them.",
    ],
  ])('leaves the maker check to the platform when %s', (_case, maker, why) => {
    expect(byId('maker', checks({ maker }))).toMatchObject({
      state: 'platform',
      detail: `${VERIFIED_ON_APPROVAL} ${why}`,
    });
  });

  it('fails the role check only on a read that found none', () => {
    expect(byId('role', checks({ roles: { ok: true, value: 0 } }))?.state).toBe('failed');
    expect(byId('role', checks({ roles: null }))?.state).toBe('platform');
    expect(
      byId('role', checks({ roles: { ok: false, problem: { requestId: null } } }))?.detail,
    ).toBe(`${VERIFIED_ON_APPROVAL} Their roles couldn't be loaded.`);
  });

  it.each([
    ['an auditor', { membershipType: 'AUDITOR' as const }, 'not-required'],
    ['a system member', { membershipType: 'SYSTEM' as const }, 'not-required'],
    [
      'a staff member with none, after a complete scan',
      { branches: { ok: true as const, value: { count: 0, complete: true } } },
      'failed',
    ],
    // A capped scan, or one a selected branch narrowed, can't prove "none" (rule 9).
    [
      'a staff member with none in a partial scan',
      { branches: { ok: true as const, value: { count: 0, complete: false } } },
      'platform',
    ],
    ['an unread membership type', { membershipType: null }, 'platform'],
    ['no branch_assignment.view', { branches: null }, 'platform'],
  ])('checks the branch assignment of %s: %s', (_case, overrides, state) => {
    expect(byId('branch', checks(overrides))?.state).toBe(state);
  });

  it('checks a branch for its drafter and the institution only', () => {
    const list = branchControlChecks({
      maker: { ok: true, value: { actorUserId: ME, name: 'Backend Jane Manager' } },
      me: ME,
      organisationName: 'Greenfield SACCO',
    });
    expect(list.map((check) => [check.label, check.state])).toEqual([
      ['Drafted by someone else', 'failed'],
      ['Institution is active', 'passed'],
    ]);
    expect(list[0]?.detail).toBe(MAKER_CHECKER_BLOCKED);
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — form U. Expected: FAIL.

- [ ] **Step 3: Implement** — `approval-checks.ts`:

```ts
import type { StatusTone } from '@/components/data-display/status-chip';
import { shortId } from '@/lib/format';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import type { MembershipType } from '@/modules/administration/users/user-contract';
import { USER_MAKER_CHECKER_BLOCKED } from '@/modules/administration/users/user-rules';
import { isSameUser } from './approval-rules';

// ── Control checks (spec §10.6, Rulings 5 and 7) ─────────────────────────────────────────────────

export type CheckState = 'passed' | 'failed' | 'platform' | 'not-required';

/** A word on every state, never colour alone (WCAG 1.4.1). Short, so a chip never truncates at
 * 375 px: a platform check's detail opens with `VERIFIED_ON_APPROVAL` instead (spec §10.6). */
export const CHECK_STATES: Record<CheckState, { label: string; tone: StatusTone }> = {
  passed: { label: 'Passed', tone: 'success' },
  failed: { label: 'Not met', tone: 'error' },
  platform: { label: 'Checked on approval', tone: 'info' },
  'not-required': { label: 'Not required', tone: 'default' },
};

export const VERIFIED_ON_APPROVAL = 'Verified by the platform on approval.';

export interface ControlCheck {
  id: 'maker' | 'role' | 'branch' | 'institution';
  label: string;
  state: CheckState;
  detail: string;
}

/** A page read's outcome, structurally `Loaded<T>`; `null`: not permitted, nothing was read. */
export type CheckRead<T> =
  { ok: true; value: T } | { ok: false; problem: { requestId: string | null } } | null;

/** The maker's audit event, as the page resolved it: `null` value = no such event. */
export interface MakerFact {
  actorUserId: string | null;
  /** From the user lookup; null falls back to the short id. */
  name: string | null;
}

const reference = (requestId: string | null) => (requestId ? ` Reference: ${requestId}` : '');

/** A check that can't be computed reads "Verified by the platform on approval", then says why. */
function checkOf(
  id: ControlCheck['id'],
  label: string,
  state: CheckState,
  detail: string,
): ControlCheck {
  return {
    id,
    label,
    state,
    detail: state === 'platform' ? `${VERIFIED_ON_APPROVAL} ${detail}` : detail,
  };
}

const MAKER_COPY = {
  user: {
    label: 'Invited by someone else',
    passed: (who: string) => `Invited by ${who}.`,
    failed: USER_MAKER_CHECKER_BLOCKED,
    notPermitted: "Your role can't view the audit trail, so this page can't tell who invited them.",
    failedRead: "Who invited them couldn't be loaded.",
    unrecorded: "The audit trail doesn't say who invited them.",
  },
  branch: {
    label: 'Drafted by someone else',
    passed: (who: string) => `Drafted by ${who}.`,
    failed: MAKER_CHECKER_BLOCKED,
    notPermitted: "Your role can't view the audit trail, so this page can't tell who drafted it.",
    failedRead: "Who drafted it couldn't be loaded.",
    unrecorded: "The audit trail doesn't say who drafted it.",
  },
} as const;

function makerCheck(
  kind: 'user' | 'branch',
  maker: CheckRead<MakerFact | null>,
  me: string,
): ControlCheck {
  const copy = MAKER_COPY[kind];
  const check = (state: CheckState, detail: string) => checkOf('maker', copy.label, state, detail);
  if (maker === null) return check('platform', copy.notPermitted);
  if (!maker.ok)
    return check('platform', `${copy.failedRead}${reference(maker.problem.requestId)}`);
  const actor = maker.value?.actorUserId ?? null;
  if (actor === null) return check('platform', copy.unrecorded);
  if (isSameUser(actor, me)) return check('failed', copy.failed);
  return check('passed', copy.passed(maker.value?.name ?? shortId(actor)));
}

/** Contract §A: every request re-validates the organisation ACTIVE, so a page that loaded knows. */
function institutionCheck(organisationName: string): ControlCheck {
  return checkOf(
    'institution',
    'Institution is active',
    'passed',
    `${organisationName} is active. The platform checks this on every request.`,
  );
}

function roleCheck(roles: CheckRead<number>): ControlCheck {
  const check = (state: CheckState, detail: string) =>
    checkOf('role', 'Has an active role', state, detail);
  if (roles === null) return check('platform', "Your role can't view role assignments.");
  if (!roles.ok) {
    return check(
      'platform',
      `Their roles couldn't be loaded.${reference(roles.problem.requestId)}`,
    );
  }
  return roles.value > 0
    ? check('passed', 'They hold an active role.')
    : check(
        'failed',
        'They hold no active role. The platform refuses approval until they hold one.',
      );
}

function branchCheck(
  branches: CheckRead<{ count: number; complete: boolean }>,
  membershipType: MembershipType | null,
): ControlCheck {
  const check = (state: CheckState, detail: string) =>
    checkOf('branch', 'Has an active branch assignment', state, detail);
  // Contract §F: AUDITOR and SYSTEM members are branch-exempt.
  if (membershipType === 'AUDITOR' || membershipType === 'SYSTEM') {
    return check('not-required', "Auditors and system members don't need one.");
  }
  if (membershipType === null) {
    return check(
      'platform',
      "Their membership type couldn't be read, so this page can't tell whether they need one.",
    );
  }
  if (branches === null) return check('platform', "Your role can't view branch assignments.");
  if (!branches.ok) {
    return check(
      'platform',
      `Their branch assignments couldn't be loaded.${reference(branches.problem.requestId)}`,
    );
  }
  if (branches.value.count > 0) return check('passed', 'They hold an active branch assignment.');
  // A capped scan, or one a selected branch narrowed (§E.4), can't prove "none" (rule 9).
  return branches.value.complete
    ? check(
        'failed',
        'Staff and admin members need an active branch assignment. The platform refuses approval until they hold one.',
      )
    : check('platform', 'None was found among the branch assignments this page could check.');
}

export function userControlChecks(input: {
  maker: CheckRead<MakerFact | null>;
  /** The signed-in user's id, from `/auth/me` (never the URL's). */
  me: string;
  /** ACTIVE role assignments found (one page). */
  roles: CheckRead<number>;
  /** ACTIVE branch assignments found; `complete`: the scan wasn't capped and no branch narrowed it. */
  branches: CheckRead<{ count: number; complete: boolean }>;
  /** null: the membership couldn't be read (no `membership.view`, not found, or failed). */
  membershipType: MembershipType | null;
  organisationName: string;
}): ControlCheck[] {
  return [
    makerCheck('user', input.maker, input.me),
    roleCheck(input.roles),
    branchCheck(input.branches, input.membershipType),
    institutionCheck(input.organisationName),
  ];
}

export function branchControlChecks(input: {
  maker: CheckRead<MakerFact | null>;
  me: string;
  organisationName: string;
}): ControlCheck[] {
  return [makerCheck('branch', input.maker, input.me), institutionCheck(input.organisationName)];
}
```

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs: treat `complete: false` as complete in
      `branchCheck` ("…a staff member with none in a partial scan: platform"); compare the maker
      with `===` ("fails the maker check for the signed-in user's own invitation, whatever the
      case").

- [ ] **Step 5: Commit** (form C):

```
feat(approvals): word the control checks

Each check names its state in a word; a check the page can't compute is left to the platform
("Verified by the platform on approval"), and a capped or narrowed scan never proves "none".

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** the chip labels stay short ("Checked on
approval") so a chip never truncates in a 375 px description list; the long sentence opens the
detail instead.

---

### Task 2: The approval service

**Files:**

- Create: `modules/administration/approvals/approval-service.ts`
- Create: `modules/administration/approvals/approval-service.test.ts`

**Interfaces:**

- Consumes: 10's `listUsers`; 08's `listBranches`, `DEFAULT_BRANCH_SORT`, `BranchSortField`; 06's
  `listAuditEvents`; 09's `listRoleAssignments`; `uuidSchema`; `ListSort`; Task 1b's
  `REQUESTED_ROLES_CEILING`; Task 1c's `UserApprovalCounts`.
- Produces (server-only; layer 14 reuses the first four): `listUserApprovals(paging)`,
  `BranchActivationQuery`, `listBranchActivations(query)`, cached `countUserApprovals()`, cached
  `countBranchActivations()`; `MakerEvent`, `ApprovalSubjectKind`, cached
  `getMakerEvent(kind, subjectId)`; `listRequestedRoles(userId)`.

- [ ] **Step 1: Write the failing test** — `approval-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendApiError } from '@/auth/backend-api';
import { REQUESTED_ROLES_CEILING } from './approval-copy';

const { listAuditEvents, listBranches, listRoleAssignments, listUsers } = vi.hoisted(() => ({
  listAuditEvents: vi.fn(),
  listBranches: vi.fn(),
  listRoleAssignments: vi.fn(),
  listUsers: vi.fn(),
}));
vi.mock('@/modules/administration/audit/audit-service', () => ({
  listAuditEvents: (...args: unknown[]) => listAuditEvents(...args) as unknown,
}));
vi.mock('@/modules/administration/branches/branch-service', () => ({
  listBranches: (...args: unknown[]) => listBranches(...args) as unknown,
}));
vi.mock('@/modules/administration/roles/role-service', () => ({
  listRoleAssignments: (...args: unknown[]) => listRoleAssignments(...args) as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  listUsers: (...args: unknown[]) => listUsers(...args) as unknown,
}));

const service = await import('./approval-service');

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const USER = 'f6000000-0000-4000-8000-0000000000ab';
const BRANCH = 'a7000000-0000-4000-8000-0000000000cd';
const VICTOR = 'b8000000-0000-4000-8000-0000000000ef';

const total = (totalItems: number) => ({
  items: [],
  page: {
    number: 0,
    size: 1,
    totalItems,
    totalPages: totalItems,
    hasNext: false,
    hasPrevious: false,
  },
});

describe('approval service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('lists pending memberships newest first, with no sort (the endpoint has none)', async () => {
    listUsers.mockResolvedValue(total(0));
    await service.listUserApprovals({ page: 2, size: 20 });
    expect(listUsers).toHaveBeenCalledExactlyOnceWith({
      membershipStatus: 'PENDING_APPROVAL',
      page: 2,
      size: 20,
    });
  });

  it('lists pending branches in the sort the tab asked for', async () => {
    listBranches.mockResolvedValue(total(0));
    await service.listBranchActivations({
      sort: { by: 'branchName', dir: 'ASC' },
      page: 0,
      size: 10,
    });
    expect(listBranches).toHaveBeenCalledExactlyOnceWith({
      status: 'PENDING_APPROVAL',
      sort: { by: 'branchName', dir: 'ASC' },
      page: 0,
      size: 10,
    });
  });

  it('counts pending and provisioning memberships with two size=1 reads (spec §8)', async () => {
    listUsers.mockResolvedValueOnce(total(9)).mockResolvedValueOnce(total(1));
    await expect(service.countUserApprovals()).resolves.toEqual({ pending: 9, provisioning: 1 });
    expect(listUsers.mock.calls).toEqual([
      [{ membershipStatus: 'PENDING_APPROVAL', page: 0, size: 1 }],
      [{ membershipStatus: 'PENDING_APPROVAL', userStatus: 'PROVISIONING_IDP', page: 0, size: 1 }],
    ]);
  });

  it('counts pending branches with one size=1 read', async () => {
    listBranches.mockResolvedValue(total(3));
    await expect(service.countBranchActivations()).resolves.toBe(3);
    expect(listBranches).toHaveBeenCalledExactlyOnceWith({
      status: 'PENDING_APPROVAL',
      sort: { by: 'createdAt', dir: 'DESC' },
      page: 0,
      size: 1,
    });
  });

  // Rule 21a: never a quiet zero. The caller's load() redirects or says it failed.
  it.each([
    ['a 401', new BackendApiError(401)],
    ['a stale context', new BackendApiError(403, { code: 'invalid_active_tenant_context' })],
    ['a 5xx', new BackendApiError(503)],
  ])('rejects the counts with the read’s own error on %s', async (_case, error) => {
    listUsers.mockResolvedValueOnce(total(9)).mockRejectedValueOnce(error);
    await expect(service.countUserApprovals()).rejects.toBe(error);
    listBranches.mockRejectedValueOnce(error);
    await expect(service.countBranchActivations()).rejects.toBe(error);
  });

  it.each([
    ['user', 'USER', 'user.invite'],
    ['branch', 'BRANCH', 'branch.create_draft'],
  ] as const)(
    'reads a %s request’s maker event by its lower-cased id (contract §G)',
    async (kind, entityType, action) => {
      listAuditEvents.mockResolvedValue({
        items: [{ actorUserId: VICTOR, occurredAt: '2026-09-20T08:00:00Z' }],
        page: total(1).page,
      });
      const id = kind === 'user' ? USER : BRANCH;
      await expect(service.getMakerEvent(kind, id.toUpperCase())).resolves.toEqual({
        actorUserId: VICTOR,
        occurredAt: '2026-09-20T08:00:00Z',
      });
      expect(listAuditEvents).toHaveBeenCalledExactlyOnceWith({
        entityType,
        action,
        entityId: id,
        page: 0,
        size: 1,
      });
    },
  );

  it('answers null when the log holds no maker event, and rejects a malformed id before any read', async () => {
    listAuditEvents.mockResolvedValue({ items: [], page: total(0).page });
    await expect(service.getMakerEvent('user', USER)).resolves.toBeNull();
    await expect(service.getMakerEvent('user', '../x')).rejects.toThrow();
    expect(listAuditEvents).toHaveBeenCalledTimes(1);
  });

  it('rejects the maker read with its own error (the page decides what it means)', async () => {
    const error = new BackendApiError(403, { code: 'forbidden' });
    listAuditEvents.mockRejectedValue(error);
    await expect(service.getMakerEvent('branch', BRANCH)).rejects.toBe(error);
  });

  it('reads one bounded page of the user’s ACTIVE role assignments', async () => {
    listRoleAssignments.mockResolvedValue(total(0));
    await service.listRequestedRoles(USER);
    expect(listRoleAssignments).toHaveBeenCalledExactlyOnceWith(
      { userId: USER, status: 'ACTIVE' },
      { page: 0, size: REQUESTED_ROLES_CEILING },
    );
    expect(REQUESTED_ROLES_CEILING).toBe(100);
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — form U. Expected: FAIL.

- [ ] **Step 3: Implement** — `approval-service.ts`:

```ts
import 'server-only';
import { cache } from 'react';
import type { ListSort } from '@/lib/api/list-sort';
import { uuidSchema } from '@/lib/api/wire';
import { listAuditEvents } from '@/modules/administration/audit/audit-service';
import type { BranchSortField } from '@/modules/administration/branches/branch-contract';
import { DEFAULT_BRANCH_SORT } from '@/modules/administration/branches/branch-query';
import { listBranches } from '@/modules/administration/branches/branch-service';
import { listRoleAssignments } from '@/modules/administration/roles/role-service';
import { listUsers } from '@/modules/administration/users/user-service';
import { REQUESTED_ROLES_CEILING } from './approval-copy';
import type { UserApprovalCounts } from './approval-notifications';

/**
 * Layer 12's reads, shared with layer 14's pending-approvals card. Every function REJECTS on a
 * failed read, so the caller settles it with `load()`: a lost session or a stale context redirects,
 * and any other failure says so (rule 9). Nothing here blanket-catches.
 */

interface Paging {
  page: number;
  size: number;
}

/** The User onboarding tab (spec §10.6): newest first; the endpoint has no sort (contract §E.3).
 * It includes memberships whose user is already provisioning (the endpoint can't leave them out):
 * a consumer marks them, as the tab does, or skips them (layer 14's pending-approvals card). */
export function listUserApprovals(paging: Paging) {
  return listUsers({ membershipStatus: 'PENDING_APPROVAL', page: paging.page, size: paging.size });
}

export interface BranchActivationQuery extends Paging {
  sort: ListSort<BranchSortField>;
}

/** The Branch activation tab: the `/branches` list is never branch-restricted (contract §E.4). */
export function listBranchActivations(query: BranchActivationQuery) {
  return listBranches({
    status: 'PENDING_APPROVAL',
    sort: query.sort,
    page: query.page,
    size: query.size,
  });
}

/** Spec §8: two `size=1` reads (BG-15, BG-22). One pair per request: the bell, the queue and
 * layer 14's card share it. */
export const countUserApprovals = cache(async (): Promise<UserApprovalCounts> => {
  const [pending, provisioning] = await Promise.all([
    listUsers({ membershipStatus: 'PENDING_APPROVAL', page: 0, size: 1 }),
    listUsers({
      membershipStatus: 'PENDING_APPROVAL',
      userStatus: 'PROVISIONING_IDP',
      page: 0,
      size: 1,
    }),
  ]);
  return { pending: pending.page.totalItems, provisioning: provisioning.page.totalItems };
});

/** The third `size=1` read (spec §8). */
export const countBranchActivations = cache(async (): Promise<number> => {
  const page = await listBranchActivations({ sort: DEFAULT_BRANCH_SORT, page: 0, size: 1 });
  return page.page.totalItems;
});

export interface MakerEvent {
  actorUserId: string | null;
  occurredAt: string;
}

export type ApprovalSubjectKind = 'user' | 'branch';

/** Contract §G's maker lookups: who asked, and when (BG-08). */
const MAKER_LOOKUP = {
  user: { entityType: 'USER', action: 'user.invite' },
  branch: { entityType: 'BRANCH', action: 'branch.create_draft' },
} as const;

/** The request's own audit event; null when the log holds none. Needs `audit.view`. `async`, so a
 * malformed id rejects (a `load()` failure) instead of throwing past `load()`. */
export const getMakerEvent = cache(
  async (kind: ApprovalSubjectKind, subjectId: string): Promise<MakerEvent | null> => {
    const id = uuidSchema.parse(subjectId).toLowerCase();
    const events = await listAuditEvents({ ...MAKER_LOOKUP[kind], entityId: id, page: 0, size: 1 });
    const event = events.items[0];
    return event ? { actorUserId: event.actorUserId, occurredAt: event.occurredAt } : null;
  },
);

/** Requested access (spec §10.6): the user's ACTIVE role assignments, one bounded page (Ruling 8;
 * `hasNext` says when there are more). */
export function listRequestedRoles(userId: string) {
  return listRoleAssignments(
    { userId, status: 'ACTIVE' },
    { page: 0, size: REQUESTED_ROLES_CEILING },
  );
}
```

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs: wrap `countUserApprovals`' body in
      `try { … } catch { return { pending: 0, provisioning: 0 }; }` ("rejects the counts with the
      read's own error on a 401" fails — L17-R21a); drop `.toLowerCase()` in `getMakerEvent` ("reads
      a user request's maker event by its lower-cased id" fails).

- [ ] **Step 5: Commit** (form C):

```
feat(approvals): read the queues, the counts and each request's maker

The User onboarding and Branch activation lists, the three size=1 counts (cached per request, so the
bell and the queue's tabs share them, and layer 14 can reuse them), each request's maker event from
the audit log (BG-08), and one bounded page of a pending user's role assignments. Nothing here
catches: a failed read rejects, and the page settles it with load().

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** React's `cache` is a pass-through in the Vitest
(client) build of React, so repeated calls in one test file read again, as the assertions expect.
For layer 14: `listUserApprovals` includes provisioning rows (the endpoint can't leave them out), so
its pending-approvals card must mark or skip them as the tab does; the function's comment says so.

---

### Task 3: Carry-ins from earlier layers

Two sub-tasks, each its own commit: **3a** (P-1, Q13) and **3b** (P-3, Q14; droppable). Neither
depends on 1–2; both come before the decision bar and the e2e that rely on them.

#### Task 3a: `ConfirmDialog` returns focus to its confirm button after a failure (P-1)

**Files:**

- Modify: `components/data-display/confirm-dialog.tsx`
- Modify: `components/data-display/confirm-dialog.test.tsx`

**Interfaces:**

- Consumes: nothing new. Produces: no API change (every `ConfirmDialog` caller benefits).

- [ ] **Step 1: Write the failing test.** In `confirm-dialog.test.tsx`, import `act`:

```tsx
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
```

      and insert this test immediately **before** the comment
      `// Last: its action never settles, so it leaves a permanently pending promise behind — harmless`
      (it must stay ahead of the never-settling test):

```tsx
it('returns focus to the confirm button once a failed submit settles (layer 12, P-1)', async () => {
  const user = userEvent.setup({ delay: null });
  let settle: (result: FullResult) => void = () => undefined;
  const action = vi.fn(
    (_previous: FullResult | null, _formData: FormData) =>
      new Promise<FullResult>((resolve) => {
        settle = resolve;
      }),
  );
  setup(action);

  const confirm = screen.getByRole('button', { name: 'Submit for approval' });
  await user.click(confirm);
  await waitFor(() => {
    expect(confirm).toBeDisabled();
  });
  // A browser blurs a button as it goes disabled and MUI's FocusTrap then parks focus on the
  // dialog's container; jsdom does neither (blur() is a no-op on a disabled button), so the test
  // moves focus there itself.
  act(() => {
    document.querySelector<HTMLElement>('.MuiDialog-container')?.focus();
  });
  expect(confirm).not.toHaveFocus();

  await act(async () => {
    settle(CHANGED);
    await Promise.resolve();
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('This record changed');
  await waitFor(() => {
    expect(confirm).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — form U on the file. Expected: the new test FAILS on
      its last assertion (focus stays on the dialog's container); the others pass.

- [ ] **Step 3: Implement.** In `ConfirmForm`, after the `idempotencyKey` state:

```tsx
const submitRef = useRef<HTMLButtonElement>(null);
```

      after `const failure = state && !state.ok ? state : null;`:

```tsx
// A failed submit strands focus: the confirm button went disabled while pending, which blurs it,
// and MUI's FocusTrap parks focus on the dialog itself. Once the request settled, send it back to
// the button the person pressed, as ReasonDialog does (layer 12, P-1).
useEffect(() => {
  if (failure && !pending) submitRef.current?.focus();
}, [failure, pending]);
```

      and give the confirm button the ref:

```tsx
<Button type="submit" variant="contained" color={tone} loading={pending} ref={submitRef}>
  {confirmLabel}
</Button>
```

      (`useRef` and `useEffect` are already imported from `react` in this file.)

- [ ] **Step 4: Run** — form U on `confirm-dialog.test.tsx`: PASS (all). Form E on
      `e2e/branches.spec.ts e2e/users.spec.ts e2e/roles.spec.ts e2e/platform-tenants.spec.ts`
      (every `ConfirmDialog` flow: 08's branch users, 10's lifecycle, 09's role lifecycle,
      permissions and assignments, 16's tenants): PASS. Mutation proof: drop `ref={submitRef}`
      (the new test fails on its last assertion; restore it).

- [ ] **Step 5: Commit** (form C):

```
fix(data-display): return focus to the confirmation after a failed submit

A confirmation whose request failed left keyboard focus on the dialog itself: the confirm button
went disabled while the request ran, and the dialog's focus trap took focus. Once the failure
settles, focus returns to the confirm button, as the reason dialog already does. Layer 12's Approve
is a confirmation whose likeliest failure (a missing prerequisite) names no field.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** `[failure, pending]` (not `[failure]`) keeps a
retry's stale failure from stealing focus while the retry runs.

#### Task 3b: 10's Reject & revoke refuses a stale terminal revoke (P-3; droppable)

**Files:**

- Modify: `modules/administration/users/user-rules.ts`
- Modify: `modules/administration/users/membership-actions.ts`
- Create: `modules/administration/users/membership-revoke-guard.test.ts`
- Modify: `modules/administration/users/components/user-lifecycle-actions.tsx`
- Modify: `modules/administration/users/components/user-lifecycle-actions.test.tsx`

**Interfaces:**

- Consumes: `getMembership` (10's service), `MEMBERSHIP_STATUSES`, `BackendApiError`.
- Produces: `MEMBERSHIP_CHANGED_CODE`, `MEMBERSHIP_CHANGED` (`user-rules.ts`); `revokeMembership`
  accepts an optional `expectedStatus` field.

- [ ] **Step 1: Write the failing tests.** `membership-revoke-guard.test.ts` (the real
      `runServerAction`; 10's existing `membership-actions.test.ts` stays unchanged and green):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMBERSHIP_CHANGED } from './user-rules';

const { apiPost, getAuthenticatedUser, getMembership } = vi.hoisted(() => ({
  apiPost: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
    Promise.resolve<unknown>({}),
  ),
  getAuthenticatedUser: vi.fn(),
  getMembership: vi.fn(),
}));
vi.mock('@/config/env.server', () => ({ serverEnv: {} }));
vi.mock('@/lib/api/tenant-api', () => ({
  apiPost: (path: string, body: Record<string, unknown>, key: string) => apiPost(path, body, key),
}));
vi.mock('./user-service', () => ({
  getMembership: (id: string) => getMembership(id) as unknown,
}));
// The real runServerAction runs here, so its own reads are mocked.
vi.mock('next/cache', () => ({ refresh: vi.fn() }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  unstable_rethrow: vi.fn(),
}));
vi.mock('@/auth/get-authenticated-user', () => ({
  getAuthenticatedUser: () => getAuthenticatedUser() as unknown,
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: vi.fn(),
}));

const { revokeMembership } = await import('./membership-actions');

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const MEMBERSHIP = '20000000-0000-4000-8000-000000000001';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(fields).forEach(([name, value]) => {
    data.set(name, value);
  });
  return data;
}

const reject = (extra: Record<string, string> = {}) =>
  form({ idempotencyKey: KEY, membershipId: MEMBERSHIP, reason: 'Not our member', ...extra });

/** Layer 12, P-3: the user record's Reject & revoke names the status it was offered for, so a stale
 * tab never revokes (terminally, BG-28) a member another administrator approved meanwhile. */
describe('revokeMembership with an expected status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ id: 'session-user' });
  });

  it.each(['ACTIVE', 'SUSPENDED', 'REVOKED'])(
    'refuses a Reject & revoke once the membership is %s, before the terminal call',
    async (status) => {
      getMembership.mockResolvedValue({ id: MEMBERSHIP, status });
      await expect(
        revokeMembership(null, reject({ expectedStatus: 'PENDING_APPROVAL' })),
      ).resolves.toMatchObject({
        ok: false,
        code: 'membership_changed',
        formError: MEMBERSHIP_CHANGED,
      });
      expect(getMembership).toHaveBeenCalledExactlyOnceWith(MEMBERSHIP);
      expect(apiPost).not.toHaveBeenCalled();
    },
  );

  it('revokes while the membership is still in the expected status', async () => {
    getMembership.mockResolvedValue({ id: MEMBERSHIP, status: 'PENDING_APPROVAL' });
    await expect(
      revokeMembership(null, reject({ expectedStatus: 'PENDING_APPROVAL' })),
    ).resolves.toEqual({ ok: true });
    expect(apiPost).toHaveBeenCalledExactlyOnceWith(
      `/api/v1/tenant/memberships/${MEMBERSHIP}/revoke`,
      { reason: 'Not our member' },
      KEY,
    );
  });

  it('reads nothing first for a plain Revoke (no expected status)', async () => {
    await expect(revokeMembership(null, reject())).resolves.toEqual({ ok: true });
    expect(getMembership).not.toHaveBeenCalled();
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it('refuses an unknown expected status before any read', async () => {
    const result = await revokeMembership(null, reject({ expectedStatus: 'APPROVED' }));
    expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(getMembership).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });
});
```

      In `user-lifecycle-actions.test.tsx`, test "makes Reject & revoke an alertdialog with the
      permanence warning and a required reason", after
      `expect(sent.get('reason')).toBe('Not our member');` add:

```tsx
// Layer 12, P-3: the action refuses it unless the membership is still pending.
expect(sent.get('expectedStatus')).toBe('PENDING_APPROVAL');
```

      and in "falls back to the record title when no action remains", after
      `expectScoped(revokeMembership.mock.calls[0]?.[1] as FormData);` add:

```tsx
// A plain Revoke names no expected status: any non-terminal membership may be revoked.
expect((revokeMembership.mock.calls[0]?.[1] as FormData).get('expectedStatus')).toBeNull();
```

- [ ] **Step 2: Run them to verify they fail** — form U on both files. Expected: FAIL (no
      `MEMBERSHIP_CHANGED`; no `expectedStatus` field).

- [ ] **Step 3: Implement.** In `user-rules.ts`, after `USER_MAKER_CHECKER_BLOCKED`:

```ts
/** Layer 12, P-3: a frontend-only code; `revokeMembership` refuses a stale Reject & revoke. */
export const MEMBERSHIP_CHANGED_CODE = 'membership_changed';
export const MEMBERSHIP_CHANGED =
  'This membership changed since the page loaded. Refresh to see its status.';
```

      In `membership-actions.ts`, the imports under `'use server';` become:

```ts
import { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiPost } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import { MEMBERSHIP_STATUSES } from './user-contract';
import { MEMBERSHIP_CHANGED, MEMBERSHIP_CHANGED_CODE } from './user-rules';
import { getMembership } from './user-service';
```

      narrow `transition`'s `path` parameter to `'activate' | 'suspend' | 'reactivate'`, and
      replace `revokeMembership` (and its doc comment) with:

```ts
const revokeInput = membershipInput.extend({
  reason: requiredReason,
  // Layer 12, P-3: Reject & revoke names the status it was offered for (PENDING_APPROVAL).
  expectedStatus: z.enum(MEMBERSHIP_STATUSES).optional(),
});

/** Revoke and Reject & revoke (D12): terminal; every assignment goes with it (BG-28). With an
 * `expectedStatus`, a membership that moved on since the page loaded (approved in another tab) is
 * refused before the terminal call: a stale Reject never revokes an approved member. */
export async function revokeMembership(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(revokeInput, formData, async (input) => {
    if (input.expectedStatus) {
      const current = await getMembership(input.membershipId);
      if (current.status !== input.expectedStatus) {
        throw new BackendApiError(409, { code: MEMBERSHIP_CHANGED_CODE });
      }
    }
    await apiPost(
      `/api/v1/tenant/memberships/${input.membershipId}/revoke`,
      { reason: input.reason },
      input.idempotencyKey,
    );
  });
  return explain(
    explain(result, MEMBERSHIP_CHANGED_CODE, MEMBERSHIP_CHANGED),
    'internal_error',
    REVOKE_FAILED,
  );
}
```

      In `user-lifecycle-actions.tsx`, the `ReasonDialog`'s `fields` becomes:

```tsx
fields={() => (
  <>
    <input type="hidden" name="membershipId" value={membershipId} />
    {id === 'reject' && (
      // Layer 12, P-3: refused unless still pending, so a stale tab never revokes
      // someone another administrator approved meanwhile.
      <input type="hidden" name="expectedStatus" value="PENDING_APPROVAL" />
    )}
  </>
)}
```

- [ ] **Step 4: Run** — form U on `membership-revoke-guard.test.ts`, `membership-actions.test.ts`
      and `user-lifecycle-actions.test.tsx`: PASS. Form E on `e2e/users.spec.ts`: PASS. Mutation
      proof: drop the `expectedStatus` check (the "refuses a Reject & revoke once the membership is
      ACTIVE" cases fail).

- [ ] **Step 5: Commit** (form C):

```
fix(users): refuse a stale Reject & revoke once the membership moved on

Reject & revoke on a user's record now names the status it was offered for, and the action reads
the membership again before the terminal revoke: if another administrator approved it meanwhile
(in another tab, or from the approval queue), the revoke is refused with "This membership changed
since the page loaded." Plain Revoke is unchanged (BG-28).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** droppable as a unit if Q14 says no (then drop
Task 11a's "(P-3)" test too).

---

### Task 4: The decision actions

Two sub-tasks, each its own commit: **4a** (the shared guards, Approve and Reject & revoke) and
**4b** (Activate). Both test files run the **real** `runServerAction`, because its cross-tab guard
and its redirect on a lost session or a stale context are part of what is pinned.

#### Task 4a: Approve and Reject & revoke

**Files:**

- Create: `modules/administration/approvals/approval-guards.ts`
- Create: `modules/administration/approvals/approval-actions.ts`
- Create: `modules/administration/approvals/approval-actions.test.ts`

**Interfaces:**

- Consumes: `runServerAction`, `explain`, `apiPost`, `uuidSchema`, `BackendApiError`,
  `getCurrentContextProfile`, `can`; 10's `getMembership`, `getUser`, `accountBlockedNote`,
  `USER_MAKER_CHECKER_BLOCKED`, `UserStatus`; Task 1a's `isSameUser`, `userApprovalState`; Task 1b's
  contract, codes, copy, `approvalOutcome`, `ApproveResult`; Task 2's `getMakerEvent`.
- Produces: `refuse(status, code)`, `decider()`, `knownMaker(kind, id, holder)` (server-only);
  `approveUser(previous, formData): Promise<ApproveResult>`,
  `rejectUser(previous, formData): Promise<ActionResult>` (`'use server'`). Form fields:
  `idempotencyKey`, `membershipId`, `contextOrganisationId`, and `reason` for Reject & revoke.

- [ ] **Step 1: Write the failing test** — `approval-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendApiError } from '@/auth/backend-api';
import {
  accountBlockedNote,
  USER_MAKER_CHECKER_BLOCKED,
} from '@/modules/administration/users/user-rules';
import {
  APPROVAL_CHANGED,
  APPROVE_FAILED,
  APPROVE_FORBIDDEN,
  REJECT_FAILED,
} from './approval-copy';

const {
  apiPost,
  getAuthenticatedUser,
  getCurrentContextProfile,
  getMakerEvent,
  getMembership,
  getUser,
  refresh,
} = vi.hoisted(() => ({
  apiPost: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
    Promise.resolve<unknown>({}),
  ),
  getAuthenticatedUser: vi.fn(),
  getCurrentContextProfile: vi.fn(),
  getMakerEvent: vi.fn(),
  getMembership: vi.fn(),
  getUser: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@/config/env.server', () => ({ serverEnv: {} }));
vi.mock('@/lib/api/tenant-api', () => ({
  apiPost: (path: string, body: Record<string, unknown>, key: string) => apiPost(path, body, key),
}));
// The real runServerAction runs here (the guards are the point), so its own reads are mocked.
vi.mock('next/cache', () => ({ refresh: () => refresh() as unknown }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  unstable_rethrow: vi.fn(),
}));
vi.mock('@/auth/get-authenticated-user', () => ({
  getAuthenticatedUser: () => getAuthenticatedUser() as unknown,
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  getMembership: (id: string) => getMembership(id) as unknown,
  getUser: (id: string) => getUser(id) as unknown,
}));
vi.mock('./approval-service', () => ({
  getMakerEvent: (kind: string, id: string) => getMakerEvent(kind, id) as unknown,
}));

const actions = await import('./approval-actions');

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const ME = 'a1000000-0000-4000-8000-0000000000aa';
const VICTOR = 'b2000000-0000-4000-8000-0000000000bb';
const USER = 'c3000000-0000-4000-8000-0000000000cc';
const MEMBERSHIP = 'd4000000-0000-4000-8000-0000000000dd';
const ORGANISATION = 'f6000000-0000-4000-8000-0000000000ff';
const OTHER_ORGANISATION = '17000000-0000-4000-8000-000000000011';
const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const ALL_CODES = [
  'user.approve',
  'user.view',
  'membership.view',
  'membership.revoke',
  'audit.view',
];

function resolved(permissions: string[] = ALL_CODES) {
  return {
    kind: 'resolved',
    profile: { user_id: ME, permissions },
    context: {
      organization: { id: ORGANISATION, name: 'Greenfield Teachers SACCO' },
      branch: null,
    },
  };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(fields).forEach(([name, value]) => {
    data.set(name, value);
  });
  return data;
}

// The URL id may be upper-case; every write uses the backend's lower-case id.
const membershipForm = (extra: Record<string, string> = {}) =>
  form({
    idempotencyKey: KEY,
    membershipId: MEMBERSHIP.toUpperCase(),
    contextOrganisationId: ORGANISATION,
    ...extra,
  });

function pending(membershipStatus = 'PENDING_APPROVAL', userStatus = 'ACTIVE') {
  getMembership.mockResolvedValue({ id: MEMBERSHIP, userId: USER, status: membershipStatus });
  getUser.mockResolvedValue({ id: USER, userStatus, membershipStatus });
}

describe('the user decisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ id: 'session-user' });
    getCurrentContextProfile.mockResolvedValue(resolved());
    getMakerEvent.mockResolvedValue({ actorUserId: VICTOR, occurredAt: '2026-09-24T08:00:00Z' });
    pending();
  });

  describe('approveUser', () => {
    it('approves the membership the backend names, by its lower-cased id, with {} and the form key', async () => {
      await actions.approveUser(null, membershipForm());
      expect(getMembership).toHaveBeenCalledExactlyOnceWith(MEMBERSHIP);
      expect(getUser).toHaveBeenCalledExactlyOnceWith(USER);
      expect(getMakerEvent).toHaveBeenCalledExactlyOnceWith('user', USER);
      expect(apiPost).toHaveBeenCalledExactlyOnceWith(
        `/api/v1/tenant/memberships/${MEMBERSHIP}/activate`,
        {},
        KEY,
      );
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['a 200 (ACTIVE)', { membership_status: 'ACTIVE', user_status: 'ACTIVE' }, 'active'],
      [
        'a 202 (identity provisioning)',
        { membership_status: 'PENDING_APPROVAL', user_status: 'PROVISIONING_IDP' },
        'provisioning',
      ],
      ['an unreadable echo', { status: 'ok' }, 'recorded'],
      ['no echo', undefined, 'recorded'],
    ])('reads which way it went from %s', async (_case, echo, outcome) => {
      apiPost.mockResolvedValueOnce(echo);
      await expect(actions.approveUser(null, membershipForm())).resolves.toEqual({
        ok: true,
        outcome,
      });
    });

    it.each([
      [
        'a blocked account',
        'PENDING_APPROVAL',
        'SUSPENDED',
        'account_blocked',
        // The same words as the disabled caption: one name for the account's state.
        accountBlockedNote('SUSPENDED'),
      ],
      [
        'an approval provisioning',
        'PENDING_APPROVAL',
        'PROVISIONING_IDP',
        'approval_changed',
        APPROVAL_CHANGED,
      ],
      ['an approved membership', 'ACTIVE', 'ACTIVE', 'approval_changed', APPROVAL_CHANGED],
      ['a revoked membership', 'REVOKED', 'ACTIVE', 'approval_changed', APPROVAL_CHANGED],
    ])('refuses %s before any write', async (_case, membership, user, code, formError) => {
      pending(membership, user);
      await expect(actions.approveUser(null, membershipForm())).resolves.toMatchObject({
        ok: false,
        code,
        formError,
      });
      expect(apiPost).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('refuses the inviter, matched case-insensitively, before any write', async () => {
      getMakerEvent.mockResolvedValue({
        actorUserId: ME.toUpperCase(),
        occurredAt: '2026-09-24T08:00:00Z',
      });
      await expect(actions.approveUser(null, membershipForm())).resolves.toMatchObject({
        ok: false,
        code: 'maker_checker',
        formError: USER_MAKER_CHECKER_BLOCKED,
      });
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('leaves maker-checker to the backend without audit.view (no maker read)', async () => {
      getCurrentContextProfile.mockResolvedValue(
        resolved(ALL_CODES.filter((code) => code !== 'audit.view')),
      );
      await actions.approveUser(null, membershipForm());
      expect(getMakerEvent).not.toHaveBeenCalled();
      expect(apiPost).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['a 403', new BackendApiError(403, { code: 'forbidden' })],
      ['a 5xx', new BackendApiError(503, { requestId: 'req-maker' })],
    ])(
      'leaves maker-checker to the backend when the maker read fails with %s',
      async (_case, error) => {
        getMakerEvent.mockRejectedValue(error);
        apiPost.mockRejectedValueOnce(
          new BackendApiError(403, { code: 'forbidden', requestId: 'req-2' }),
        );
        await expect(actions.approveUser(null, membershipForm())).resolves.toMatchObject({
          ok: false,
          code: 'forbidden',
          formError: APPROVE_FORBIDDEN,
          requestId: 'req-2',
        });
        expect(apiPost).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      ['a lost session', new BackendApiError(401), 'NEXT_REDIRECT:/login?reason=session_expired'],
      [
        'a stale context',
        new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
        'NEXT_REDIRECT:/select-context',
      ],
    ])('redirects when the maker read finds %s, before any write', async (_case, error, to) => {
      getMakerEvent.mockRejectedValue(error);
      await expect(actions.approveUser(null, membershipForm())).rejects.toThrow(to);
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('fails closed when nobody can say who is deciding (no resolved profile)', async () => {
      getCurrentContextProfile.mockResolvedValue({
        kind: 'redirect-to-context-selection',
        reason: 'invalid-context',
      });
      // No cross-tab field, so the action's own check is the one that runs.
      const submitted = form({ idempotencyKey: KEY, membershipId: MEMBERSHIP });
      await expect(actions.approveUser(null, submitted)).rejects.toThrow(
        'NEXT_REDIRECT:/select-context',
      );
      expect(getMembership).not.toHaveBeenCalled();
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('explains a 500 with the likely causes, keeping the reference', async () => {
      apiPost.mockRejectedValueOnce(
        new BackendApiError(500, { code: 'internal_error', requestId: 'req-3' }),
      );
      await expect(actions.approveUser(null, membershipForm())).resolves.toMatchObject({
        ok: false,
        formError: APPROVE_FAILED,
        requestId: 'req-3',
      });
    });

    it('refuses a submit after an organisation switch, before any read', async () => {
      getCurrentContextProfile.mockResolvedValue({
        ...resolved(),
        context: { organization: { id: OTHER_ORGANISATION }, branch: null },
      });
      await expect(actions.approveUser(null, membershipForm())).resolves.toMatchObject({
        ok: false,
        code: 'context_changed',
      });
      expect(getMembership).not.toHaveBeenCalled();
      expect(apiPost).not.toHaveBeenCalled();
    });

    it.each(['../x', '', `${MEMBERSHIP}/../revoke`])(
      'refuses the membership id %j with no read',
      async (membershipId) => {
        const result = await actions.approveUser(null, membershipForm({ membershipId }));
        expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
        expect(getMembership).not.toHaveBeenCalled();
      },
    );
  });

  describe('rejectUser', () => {
    it('fails closed when nobody can say who is deciding (no resolved profile)', async () => {
      getCurrentContextProfile.mockResolvedValue({
        kind: 'redirect-to-context-selection',
        reason: 'invalid-context',
      });
      const submitted = form({
        idempotencyKey: KEY,
        membershipId: MEMBERSHIP,
        reason: 'Duplicate invitation',
      });
      await expect(actions.rejectUser(null, submitted)).rejects.toThrow(
        'NEXT_REDIRECT:/select-context',
      );
      expect(getMembership).not.toHaveBeenCalled();
      expect(apiPost).not.toHaveBeenCalled();
    });

    it.each([
      ['awaiting', 'ACTIVE'],
      ['blocked', 'LOCKED'],
    ])(
      'revokes a membership %s with the trimmed reason and the form key',
      async (_case, userStatus) => {
        pending('PENDING_APPROVAL', userStatus);
        await expect(
          actions.rejectUser(null, membershipForm({ reason: '  Duplicate invitation  ' })),
        ).resolves.toEqual({ ok: true });
        expect(apiPost).toHaveBeenCalledExactlyOnceWith(
          `/api/v1/tenant/memberships/${MEMBERSHIP}/revoke`,
          { reason: 'Duplicate invitation' },
          KEY,
        );
      },
    );

    it.each([
      ['provisioning', 'PENDING_APPROVAL', 'PROVISIONING_IDP'],
      ['approved meanwhile', 'ACTIVE', 'ACTIVE'],
    ])(
      'never revokes a membership %s (refused before any write)',
      async (_case, membership, user) => {
        pending(membership, user);
        await expect(
          actions.rejectUser(null, membershipForm({ reason: 'Duplicate invitation' })),
        ).resolves.toMatchObject({
          ok: false,
          code: 'approval_changed',
          formError: APPROVAL_CHANGED,
        });
        expect(apiPost).not.toHaveBeenCalled();
      },
    );

    it('refuses a reason under 3 characters after trimming, before any read', async () => {
      const result = await actions.rejectUser(null, membershipForm({ reason: '  ab ' }));
      expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
      expect(result.ok ? null : result.fieldErrors.reason).toBe(
        'Give a reason of at least 3 characters.',
      );
      expect(getMembership).not.toHaveBeenCalled();
    });

    it('explains a 500 as possibly already revoked, keeping the reference', async () => {
      apiPost.mockRejectedValueOnce(
        new BackendApiError(500, { code: 'internal_error', requestId: 'req-4' }),
      );
      await expect(
        actions.rejectUser(null, membershipForm({ reason: 'Duplicate invitation' })),
      ).resolves.toMatchObject({ ok: false, formError: REJECT_FAILED, requestId: 'req-4' });
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — form U. Expected: FAIL.

- [ ] **Step 3: Implement the guards** — `approval-guards.ts`:

```ts
import 'server-only';
import { BackendApiError } from '@/auth/backend-api';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can, type PermissionHolder } from '@/auth/permissions';
import { getMakerEvent, type ApprovalSubjectKind } from './approval-service';

/**
 * The decision actions' shared guards (Ruling 5). Each refusal is a frontend-only problem code
 * thrown inside `runServerAction`, so it reaches the dialog as a named failure before any backend
 * call (precedent: 17's `own_account`).
 */
export function refuse(status: number, code: string): BackendApiError {
  return new BackendApiError(status, { code });
}

/** Fail closed: without a resolved profile nobody can tell who is deciding, so a lost session or a
 * stale context reaches the redirect before any call (17's `refuseOwnAccount`). */
export async function decider() {
  const selected = await getCurrentContextProfile();
  if (selected.kind !== 'resolved') throw refuse(403, 'invalid_active_tenant_context');
  return selected;
}

/** BG-08: the maker, read again here only with `audit.view`. A lost session or a stale context
 * still redirects (rethrown to `runServerAction`); any other failed read leaves the maker unknown,
 * and the backend's maker-checker 403 is then the guard. Never a blanket catch (rule 10). */
export async function knownMaker(
  kind: ApprovalSubjectKind,
  subjectId: string,
  holder: PermissionHolder,
): Promise<string | null> {
  if (!can(holder, 'audit.view')) return null;
  try {
    return (await getMakerEvent(kind, subjectId))?.actorUserId ?? null;
  } catch (error) {
    const sessionLost =
      error instanceof BackendApiError &&
      (error.status === 401 || error.code === 'invalid_active_tenant_context');
    if (error instanceof BackendApiError && !sessionLost) return null;
    throw error;
  }
}
```

- [ ] **Step 4: Implement the actions** — `approval-actions.ts`:

```ts
'use server';

import { z } from 'zod';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiPost } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import type { UserStatus } from '@/modules/administration/users/user-contract';
import {
  accountBlockedNote,
  USER_MAKER_CHECKER_BLOCKED,
} from '@/modules/administration/users/user-rules';
import { getMembership, getUser } from '@/modules/administration/users/user-service';
import { membershipDecisionSchema } from './approval-contract';
import {
  ACCOUNT_BLOCKED_CODE,
  APPROVAL_CHANGED,
  APPROVAL_CHANGED_CODE,
  approvalOutcome,
  APPROVE_FAILED,
  APPROVE_FORBIDDEN,
  MAKER_CHECKER_CODE,
  REJECT_FAILED,
  type ApprovalOutcome,
  type ApproveResult,
} from './approval-copy';
import { decider, knownMaker, refuse } from './approval-guards';
import { isSameUser, userApprovalState } from './approval-rules';

const membershipDecisionInput = z.object({ idempotencyKey: z.uuid(), membershipId: uuidSchema });
const requiredReason = z
  .string()
  .trim()
  .min(3, 'Give a reason of at least 3 characters.')
  .max(500, 'Keep the reason under 500 characters.');

/** Ruling 5: the membership the request writes, read back by its own id, and its user by the
 * membership's `user_id` (the backend's ids, never the form's): its state decides what may run. */
async function membershipState(membershipId: string) {
  const membership = await getMembership(membershipId.toLowerCase());
  const user = await getUser(membership.userId);
  return {
    membership,
    userStatus: user.userStatus,
    state: userApprovalState(membership.status, user.userStatus),
  };
}

/** `blocked`: the account status a refusal named, so it reads as the disabled caption does. */
function explainApproval(result: ActionResult, blocked: UserStatus | null): ActionResult {
  let explained = explain(result, APPROVAL_CHANGED_CODE, APPROVAL_CHANGED);
  if (blocked) explained = explain(explained, ACCOUNT_BLOCKED_CODE, accountBlockedNote(blocked));
  explained = explain(explained, MAKER_CHECKER_CODE, USER_MAKER_CHECKER_BLOCKED);
  explained = explain(explained, 'forbidden', APPROVE_FORBIDDEN);
  return explain(explained, 'internal_error', APPROVE_FAILED);
}

/** Ruling 5: Approve is refused before any write wherever the page wouldn't offer it: a membership
 * no longer pending, a provisioning one (re-approval is a 500, BG-07), a blocked account, or the
 * signed-in user's own invitation. 200 or 202 is read from the echo (Ruling 10). */
export async function approveUser(
  _previous: ApproveResult | null,
  formData: FormData,
): Promise<ApproveResult> {
  const seen: { outcome: ApprovalOutcome; blocked: UserStatus | null } = {
    outcome: 'recorded',
    blocked: null,
  };
  const result = await runServerAction(membershipDecisionInput, formData, async (input) => {
    const selected = await decider();
    const { membership, userStatus, state } = await membershipState(input.membershipId);
    if (state === 'blocked') {
      seen.blocked = userStatus;
      throw refuse(409, ACCOUNT_BLOCKED_CODE);
    }
    if (state !== 'awaiting') throw refuse(409, APPROVAL_CHANGED_CODE);
    const holder = { permissions: selected.profile.permissions };
    if (isSameUser(await knownMaker('user', membership.userId, holder), selected.profile.user_id)) {
      throw refuse(403, MAKER_CHECKER_CODE);
    }
    const echo = membershipDecisionSchema.safeParse(
      await apiPost(
        `/api/v1/tenant/memberships/${membership.id.toLowerCase()}/activate`,
        {},
        input.idempotencyKey,
      ),
    );
    seen.outcome = approvalOutcome(echo.success ? echo.data : null);
  });
  if (result.ok) return { ok: true, outcome: seen.outcome };
  const explained = explainApproval(result, seen.blocked);
  // `explain` never turns a failure into a success; this keeps the result's type exact.
  return explained.ok ? { ok: true, outcome: seen.outcome } : explained;
}

/** D12: Reject & revoke is the revoke endpoint: terminal (BG-28). Refused before any write unless
 * the membership is still pending, so a stale page never revokes someone another administrator
 * approved meanwhile (Ruling 5); a provisioning membership takes no decision here (Ruling 12). It
 * fails closed without a resolved profile, as Approve does. */
export async function rejectUser(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(
    membershipDecisionInput.extend({ reason: requiredReason }),
    formData,
    async (input) => {
      await decider();
      const { membership, state } = await membershipState(input.membershipId);
      if (state !== 'awaiting' && state !== 'blocked') throw refuse(409, APPROVAL_CHANGED_CODE);
      await apiPost(
        `/api/v1/tenant/memberships/${membership.id.toLowerCase()}/revoke`,
        { reason: input.reason },
        input.idempotencyKey,
      );
    },
  );
  return explain(
    explain(result, APPROVAL_CHANGED_CODE, APPROVAL_CHANGED),
    'internal_error',
    REJECT_FAILED,
  );
}
```

- [ ] **Step 5: Run** — form U: PASS. Mutation proofs (each fails the named test; revert): read
      the user by the form's id instead of `membership.userId` (the first test's
      `getUser` assertion); compare the maker with `===` ("refuses the inviter, matched
      case-insensitively…"); let `state === 'provisioning'` through ("refuses an approval
      provisioning before any write"); replace `knownMaker`'s catch body with `return null` ("redirects
      when the maker read finds a lost session…"); return `{ ok: true, outcome: 'recorded' }`
      without parsing the echo ("reads which way it went from a 200 (ACTIVE)"); drop `decider()`
      from `approveUser`, then from `rejectUser` (each describe's "fails closed when nobody can say
      who is deciding (no resolved profile)"); word the blocked refusal "blocked" again ("refuses a
      blocked account before any write").

- [ ] **Step 6: Commit** (form C):

```
feat(approvals): approve and reject a pending membership, refusing what the page wouldn't offer

Approve and Reject & revoke read the membership by its id and its user by the membership's own user
id, then refuse before any write when it is no longer pending, when approval already ran, when the
account is blocked (approve only, worded as the disabled caption: "Their account is locked on the
platform…"), or when the signed-in user invited them (compared without letter case, when the audit
log can say). Without a resolved profile both fail closed. Approve reads the response to say
whether the membership went live (200) or identity provisioning was queued (202). Every form
forwards its minted idempotency key and the rendered organisation.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** `knownMaker` is the layer's only `catch`; it
rethrows everything but an ordinary `BackendApiError` (rule 10). A `ZodError` from an unreadable
audit page fails the action with a reference rather than guessing, while the page still offers the
decision (Ruling 5's one deliberate asymmetry).

#### Task 4b: Activate a pending branch

**Files:**

- Create: `modules/administration/approvals/branch-activation-actions.ts`
- Create: `modules/administration/approvals/branch-activation-actions.test.ts`

**Interfaces:**

- Consumes: Task 4a's guards; 08's `getBranch`, `MAKER_CHECKER_BLOCKED`; Task 1a's `isSameUser`;
  Task 1b's codes and copy.
- Produces: `activatePendingBranch(previous, formData): Promise<ActionResult>` (`'use server'`).
  Form fields: `idempotencyKey`, `branchId`, `contextOrganisationId`, optional `reason`.

- [ ] **Step 1: Write the failing test** — `branch-activation-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendApiError } from '@/auth/backend-api';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import { ACTIVATE_FORBIDDEN, BRANCH_CHANGED, BRANCH_CONTEXT_REFUSAL } from './approval-copy';

const { apiPost, getAuthenticatedUser, getBranch, getCurrentContextProfile, getMakerEvent } =
  vi.hoisted(() => ({
    apiPost: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
      Promise.resolve<unknown>({}),
    ),
    getAuthenticatedUser: vi.fn(),
    getBranch: vi.fn(),
    getCurrentContextProfile: vi.fn(),
    getMakerEvent: vi.fn(),
  }));
vi.mock('@/config/env.server', () => ({ serverEnv: {} }));
vi.mock('@/lib/api/tenant-api', () => ({
  apiPost: (path: string, body: Record<string, unknown>, key: string) => apiPost(path, body, key),
}));
// The real runServerAction runs here (the guards are the point), so its own reads are mocked.
vi.mock('next/cache', () => ({ refresh: vi.fn() }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  unstable_rethrow: vi.fn(),
}));
vi.mock('@/auth/get-authenticated-user', () => ({
  getAuthenticatedUser: () => getAuthenticatedUser() as unknown,
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/modules/administration/branches/branch-service', () => ({
  getBranch: (id: string) => getBranch(id) as unknown,
}));
vi.mock('./approval-service', () => ({
  getMakerEvent: (kind: string, id: string) => getMakerEvent(kind, id) as unknown,
}));

const { activatePendingBranch } = await import('./branch-activation-actions');

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const ME = 'a1000000-0000-4000-8000-0000000000aa';
const VICTOR = 'b2000000-0000-4000-8000-0000000000bb';
const BRANCH = 'e5000000-0000-4000-8000-0000000000ee';
const ORGANISATION = 'f6000000-0000-4000-8000-0000000000ff';
const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

function resolved(branch: { id: string; name: string } | null = null) {
  return {
    kind: 'resolved',
    profile: { user_id: ME, permissions: ['branch.activate', 'branch.view', 'audit.view'] },
    context: { organization: { id: ORGANISATION, name: 'Greenfield Teachers SACCO' }, branch },
  };
}

function branchForm(extra: Record<string, string> = {}): FormData {
  const data = new FormData();
  // The URL id may be upper-case; the write uses the backend's lower-case id.
  const fields = {
    idempotencyKey: KEY,
    branchId: BRANCH.toUpperCase(),
    contextOrganisationId: ORGANISATION,
    ...extra,
  };
  Object.entries(fields).forEach(([name, value]) => {
    data.set(name, value);
  });
  return data;
}

describe('activatePendingBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ id: 'session-user' });
    getCurrentContextProfile.mockResolvedValue(resolved());
    getMakerEvent.mockResolvedValue({ actorUserId: VICTOR, occurredAt: '2026-09-10T08:00:00Z' });
    getBranch.mockResolvedValue({ id: BRANCH, status: 'PENDING_APPROVAL' });
  });

  it.each([
    ['a blank reason', '   ', {}],
    ['a reason', '  Licence received ', { reason: 'Licence received' }],
  ])('activates by the backend’s lower-cased id with %s', async (_case, reason, body) => {
    await expect(activatePendingBranch(null, branchForm({ reason }))).resolves.toEqual({
      ok: true,
    });
    expect(getBranch).toHaveBeenCalledExactlyOnceWith(BRANCH);
    expect(getMakerEvent).toHaveBeenCalledExactlyOnceWith('branch', BRANCH);
    expect(apiPost).toHaveBeenCalledExactlyOnceWith(
      `/api/v1/branches/${BRANCH}/activate`,
      body,
      KEY,
    );
  });

  it('refuses in a branch context before any read (BG-03)', async () => {
    getCurrentContextProfile.mockResolvedValue(resolved({ id: BRANCH, name: 'Westlands' }));
    await expect(activatePendingBranch(null, branchForm())).resolves.toMatchObject({
      ok: false,
      code: 'branch_context',
      formError: BRANCH_CONTEXT_REFUSAL,
    });
    expect(getBranch).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it.each(['ACTIVE', 'DRAFT', 'SUSPENDED'])(
    'refuses a %s branch before any write',
    async (status) => {
      getBranch.mockResolvedValue({ id: BRANCH, status });
      await expect(activatePendingBranch(null, branchForm())).resolves.toMatchObject({
        ok: false,
        code: 'approval_changed',
        formError: BRANCH_CHANGED,
      });
      expect(apiPost).not.toHaveBeenCalled();
    },
  );

  it('refuses its drafter, matched case-insensitively, before any write', async () => {
    getMakerEvent.mockResolvedValue({
      actorUserId: ME.toUpperCase(),
      occurredAt: '2026-09-10T08:00:00Z',
    });
    await expect(activatePendingBranch(null, branchForm())).resolves.toMatchObject({
      ok: false,
      code: 'maker_checker',
      formError: MAKER_CHECKER_BLOCKED,
    });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('explains the backend’s 403 without asserting which guard it was', async () => {
    apiPost.mockRejectedValueOnce(
      new BackendApiError(403, { code: 'forbidden', requestId: 'req-5' }),
    );
    await expect(activatePendingBranch(null, branchForm())).resolves.toMatchObject({
      ok: false,
      formError: ACTIVATE_FORBIDDEN,
      requestId: 'req-5',
    });
  });

  it('refuses a reason over 500 characters before any read', async () => {
    const result = await activatePendingBranch(null, branchForm({ reason: 'x'.repeat(501) }));
    expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(getBranch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — form U. Expected: FAIL.

- [ ] **Step 3: Implement** — `branch-activation-actions.ts`:

```ts
'use server';

import { z } from 'zod';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiPost } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import { getBranch } from '@/modules/administration/branches/branch-service';
import {
  ACTIVATE_FORBIDDEN,
  APPROVAL_CHANGED_CODE,
  BRANCH_CHANGED,
  BRANCH_CONTEXT_CODE,
  BRANCH_CONTEXT_REFUSAL,
  MAKER_CHECKER_CODE,
} from './approval-copy';
import { decider, knownMaker, refuse } from './approval-guards';
import { isSameUser } from './approval-rules';

// No `|| null` transform: a trimmed '' is falsy, so a blank reason still sends `{}`.
const activationInput = z.object({
  idempotencyKey: z.uuid(),
  branchId: uuidSchema,
  reason: z.string().trim().max(500, 'Keep the reason under 500 characters.').optional(),
});

/** Branch activation (contract §E.3): All branches only (BG-03, refused before any read), still
 * pending, and never by its drafter when the audit log names them (Ruling 5): each refused before
 * any write. The reason is optional. */
export async function activatePendingBranch(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(activationInput, formData, async (input) => {
    const selected = await decider();
    if (selected.context.branch !== null) throw refuse(409, BRANCH_CONTEXT_CODE);
    const branch = await getBranch(input.branchId.toLowerCase());
    if (branch.status !== 'PENDING_APPROVAL') throw refuse(409, APPROVAL_CHANGED_CODE);
    const holder = { permissions: selected.profile.permissions };
    if (isSameUser(await knownMaker('branch', branch.id, holder), selected.profile.user_id)) {
      throw refuse(403, MAKER_CHECKER_CODE);
    }
    await apiPost(
      `/api/v1/branches/${branch.id.toLowerCase()}/activate`,
      input.reason ? { reason: input.reason } : {},
      input.idempotencyKey,
    );
  });
  let explained = explain(result, BRANCH_CONTEXT_CODE, BRANCH_CONTEXT_REFUSAL);
  explained = explain(explained, APPROVAL_CHANGED_CODE, BRANCH_CHANGED);
  explained = explain(explained, MAKER_CHECKER_CODE, MAKER_CHECKER_BLOCKED);
  return explain(explained, 'forbidden', ACTIVATE_FORBIDDEN);
}
```

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs: move the branch-context check after
      `getBranch` ("refuses in a branch context before any read" fails on its `getBranch`
      assertion); post `input.branchId` instead of `branch.id.toLowerCase()` ("activates by the
      backend's lower-cased id…").

- [ ] **Step 5: Commit** (form C):

```
feat(approvals): activate a pending branch from the approval queue

Activate refuses before any read with a branch selected (activation needs All branches, BG-03), and
before any write when the branch is no longer pending or the signed-in user drafted it; otherwise
it posts the optional reason with the dialog's idempotency key. A 403 is explained as permission or
maker-checker (BG-08).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

---

### Task 5: The approval components

Three sub-tasks, each its own commit: **5a** (the client decision bar), **5b** (who asked and the
control checks) and **5c** (the requested access); 5b and 5c are Server-Component safe.

#### Task 5a: The decision bar

**Files:**

- Create: `modules/administration/approvals/components/decision-bar.tsx`
- Create: `modules/administration/approvals/components/decision-bar.test.tsx`

**Interfaces:**

- Consumes: `ConfirmDialog` (with Task 3a's refocus), `ReasonDialog`, `focusRecordTitle`,
  `useToast`; Task 4a's `approveUser`, `rejectUser`; Task 4b's `activatePendingBranch`; Task 1a's
  `ApprovalDecision`; Task 1b's `decisionCopy`, toasts, `ApprovalOutcome`, `ApproveResult`.
- Produces: `DecisionSubject` (`{ kind: 'membership'; membershipId: string | null }` or
  `{ kind: 'branch'; branchId: string }`) and `DecisionBar` (props `subject`, `name`, `decisions`,
  `blocked`, `note`, `contextOrganisationId`) — primitive props only, so the Server Component pages
  render it.

- [ ] **Step 1: Write the failing test** — `decision-bar.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import {
  MEMBERSHIP_UNAVAILABLE,
  USER_MAKER_CHECKER_BLOCKED,
} from '@/modules/administration/users/user-rules';
import { ACTIVATED_TOAST, APPROVED_TOAST, REJECTED_TOAST } from '../approval-copy';
import type { ApprovalDecision } from '../approval-rules';
import { DecisionBar, type DecisionSubject } from './decision-bar';

const { activatePendingBranch, approveUser, rejectUser } = vi.hoisted(() => ({
  activatePendingBranch: vi.fn(),
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
}));
vi.mock('../approval-actions', () => ({
  approveUser: (...args: unknown[]) => approveUser(...args) as unknown,
  rejectUser: (...args: unknown[]) => rejectUser(...args) as unknown,
}));
vi.mock('../branch-activation-actions', () => ({
  activatePendingBranch: (...args: unknown[]) => activatePendingBranch(...args) as unknown,
}));

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const MEMBERSHIP = 'a4000000-0000-4000-8000-000000000004';
const BRANCH = 'b5000000-0000-4000-8000-000000000005';
const ORG = 'c6000000-0000-4000-8000-000000000006';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NAME = 'Rose Atieno';
const BRANCH_NAME = 'Kericho Branch';

interface Overrides {
  subject?: DecisionSubject;
  decisions?: readonly ApprovalDecision[];
  blocked?: Partial<Record<ApprovalDecision, string>>;
  note?: string | null;
}

/** The hero's slot: the record title is the page's `h1`, the focus fallback's target. */
const record = ({
  subject = { kind: 'membership', membershipId: MEMBERSHIP },
  decisions = ['approve', 'reject'],
  blocked = {},
  note = null,
}: Overrides = {}) => (
  <main>
    <h1>{subject.kind === 'branch' ? BRANCH_NAME : NAME}</h1>
    <DecisionBar
      subject={subject}
      name={subject.kind === 'branch' ? BRANCH_NAME : NAME}
      decisions={decisions}
      blocked={blocked}
      note={note}
      contextOrganisationId={ORG}
    />
  </main>
);

/** Every dialog carries the subject's backend id, a minted key and the rendered organisation, or
 * the action's re-read, the replay and the cross-tab guard silently stop working. */
function expectScoped(sent: FormData | undefined, field: 'membershipId' | 'branchId') {
  expect(sent?.get(field)).toBe(field === 'membershipId' ? MEMBERSHIP : BRANCH);
  expect(sent?.get('contextOrganisationId')).toBe(ORG);
  expect(sent?.get('idempotencyKey')).toMatch(UUID);
}

describe('DecisionBar', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    ['a 200', 'active', APPROVED_TOAST.active],
    ['a 202', 'provisioning', APPROVED_TOAST.provisioning],
    ['an unreadable echo', 'recorded', APPROVED_TOAST.recorded],
  ] as const)(
    'approves through a bare confirmation and says what %s means',
    async (_case, outcome, toast) => {
      const user = userEvent.setup({ delay: null });
      approveUser.mockResolvedValueOnce({ ok: true, outcome });
      renderWithProviders(record());

      await user.click(screen.getByRole('button', { name: 'Approve' }));
      const dialog = screen.getByRole('dialog', { name: `Approve ${NAME}?` });
      // The activate endpoint reads no body: no reason field.
      expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
      expect(dialog).toHaveTextContent("An approval can't be undone.");
      await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(toast);
      expect(approveUser).toHaveBeenCalledTimes(1);
      const sent = approveUser.mock.calls[0]?.[1] as FormData;
      expectScoped(sent, 'membershipId');
      expect(sent.get('userId')).toBeNull();
    },
  );

  it('makes Reject & revoke an alertdialog with the permanence warning and a required reason', async () => {
    const user = userEvent.setup({ delay: null });
    rejectUser.mockResolvedValueOnce({ ok: true });
    renderWithProviders(record());

    const trigger = screen.getByRole('button', { name: 'Reject & revoke' });
    expect(trigger).toHaveClass('MuiButton-outlined', 'MuiButton-colorError');
    await user.click(trigger);
    const dialog = screen.getByRole('alertdialog', { name: `Reject and revoke ${NAME}?` });
    expect(dialog).toHaveTextContent('can never be invited to this institution again');
    const reason = within(dialog).getByRole('textbox', { name: /^Reason/ });
    expect(reason).toBeRequired();
    await user.type(reason, 'Duplicate invitation');
    await user.click(within(dialog).getByRole('button', { name: 'Reject & revoke' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(REJECTED_TOAST);
    const sent = rejectUser.mock.calls[0]?.[1] as FormData;
    expectScoped(sent, 'membershipId');
    expect(sent.get('reason')).toBe('Duplicate invitation');
  });

  it('activates a branch with an optional reason, carrying the branch', async () => {
    const user = userEvent.setup({ delay: null });
    activatePendingBranch.mockResolvedValueOnce({ ok: true });
    renderWithProviders(
      record({ subject: { kind: 'branch', branchId: BRANCH }, decisions: ['activate'] }),
    );

    await user.click(screen.getByRole('button', { name: 'Activate' }));
    const dialog = screen.getByRole('dialog', { name: `Activate ${BRANCH_NAME}?` });
    expect(within(dialog).getByRole('textbox', { name: 'Reason (optional)' })).not.toBeRequired();
    await user.click(within(dialog).getByRole('button', { name: 'Activate' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(ACTIVATED_TOAST);
    const sent = activatePendingBranch.mock.calls[0]?.[1] as FormData;
    expectScoped(sent, 'branchId');
    expect(sent.get('membershipId')).toBeNull();
  });

  it('disables Approve for its inviter and says why, leaving Reject & revoke enabled', () => {
    renderWithProviders(record({ blocked: { approve: USER_MAKER_CHECKER_BLOCKED } }));

    const approve = screen.getByRole('button', { name: 'Approve' });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAccessibleDescription(USER_MAKER_CHECKER_BLOCKED);
    expect(screen.getByRole('button', { name: 'Reject & revoke' })).toBeEnabled();
  });

  it('disables Activate for its drafter and says why', () => {
    renderWithProviders(
      record({
        subject: { kind: 'branch', branchId: BRANCH },
        decisions: ['activate'],
        blocked: { activate: MAKER_CHECKER_BLOCKED },
      }),
    );

    const activate = screen.getByRole('button', { name: 'Activate' });
    expect(activate).toBeDisabled();
    expect(activate).toHaveAccessibleDescription(MAKER_CHECKER_BLOCKED);
  });

  it('never wraps a decision label beside a long name', () => {
    renderWithProviders(record());

    for (const name of ['Approve', 'Reject & revoke']) {
      expect(screen.getByRole('button', { name })).toHaveStyle({ whiteSpace: 'nowrap' });
    }
  });

  it('offers no decision without a membership to act on, but shows the note', () => {
    renderWithProviders(
      record({
        subject: { kind: 'membership', membershipId: null },
        note: MEMBERSHIP_UNAVAILABLE,
      }),
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(MEMBERSHIP_UNAVAILABLE)).toBeInTheDocument();
  });

  it('keeps the key after a failed approval, and retries with it', async () => {
    const user = userEvent.setup({ delay: null });
    approveUser
      .mockResolvedValueOnce({
        ok: false,
        formError: 'The approval couldn’t complete.',
        fieldErrors: {},
        code: 'internal_error',
        requestId: 'req-1',
      })
      .mockResolvedValueOnce({ ok: true, outcome: 'active' });
    renderWithProviders(record());

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = screen.getByRole('dialog', { name: `Approve ${NAME}?` });
    const confirm = within(dialog).getByRole('button', { name: 'Approve' });
    await user.click(confirm);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Reference: req-1');

    await user.click(confirm);
    expect(await screen.findByRole('alert')).toHaveTextContent(APPROVED_TOAST.active);
    const [first, second] = approveUser.mock.calls.map((call) => call[1] as FormData);
    expect(second?.get('idempotencyKey')).toBe(first?.get('idempotencyKey'));
    expectScoped(first, 'membershipId');
    expectScoped(second, 'membershipId');
  });

  it.each([
    [
      'Reject & revoke',
      'alertdialog',
      `Reject and revoke ${NAME}?`,
      'membershipId',
      REJECTED_TOAST,
    ],
    ['Activate', 'dialog', `Activate ${BRANCH_NAME}?`, 'branchId', ACTIVATED_TOAST],
  ] as const)(
    'keeps the key after a failed %s, and retries with it',
    async (label, role, title, field, toast) => {
      const user = userEvent.setup({ delay: null });
      const action = field === 'membershipId' ? rejectUser : activatePendingBranch;
      action
        .mockResolvedValueOnce({
          ok: false,
          formError: 'Refused.',
          fieldErrors: {},
          code: 'conflict',
          requestId: 'req-2',
        })
        .mockResolvedValueOnce({ ok: true });
      renderWithProviders(
        field === 'membershipId'
          ? record()
          : record({ subject: { kind: 'branch', branchId: BRANCH }, decisions: ['activate'] }),
      );

      await user.click(screen.getByRole('button', { name: label }));
      const dialog = screen.getByRole(role, { name: title });
      if (field === 'membershipId') {
        await user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), 'Duplicate');
      }
      await user.click(within(dialog).getByRole('button', { name: label }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Reference: req-2');

      await user.click(within(dialog).getByRole('button', { name: label }));
      await waitFor(() => {
        expect(action).toHaveBeenCalledTimes(2);
      });
      // The reason dialog's failure alert can still be on screen as it closes, so the toast is
      // found by its words, not as the only alert.
      expect(await screen.findByText(toast)).toBeInTheDocument();
      const [first, second] = action.mock.calls.map((call) => call[1] as FormData);
      expect(second?.get('idempotencyKey')).toBe(first?.get('idempotencyKey'));
      expectScoped(first, field);
      expectScoped(second, field);
    },
  );

  it('moves focus to the record title when the decision empties the bar', async () => {
    const user = userEvent.setup({ delay: null });
    approveUser.mockResolvedValueOnce({ ok: true, outcome: 'provisioning' });
    const { rerender } = renderWithProviders(record());

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await user.click(
      within(screen.getByRole('dialog', { name: `Approve ${NAME}?` })).getByRole('button', {
        name: 'Approve',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(APPROVED_TOAST.provisioning);

    // `refresh()` re-renders the page: a decided request has no bar, so the component unmounts.
    rerender(
      <main>
        <h1>{NAME}</h1>
      </main>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: NAME })).toHaveFocus();
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — form U. Expected: FAIL.

- [ ] **Step 3: Implement** — `decision-bar.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { ConfirmDialog } from '@/components/data-display/confirm-dialog';
import { focusRecordTitle } from '@/components/data-display/focus-record-title';
import { ReasonDialog } from '@/components/data-display/reason-dialog';
import { useToast } from '@/components/providers/toast-provider';
import { approveUser, rejectUser } from '../approval-actions';
import {
  ACTIVATED_TOAST,
  APPROVED_TOAST,
  decisionCopy,
  REJECTED_TOAST,
  type ApprovalOutcome,
  type ApproveResult,
} from '../approval-copy';
import type { ApprovalDecision } from '../approval-rules';
import { activatePendingBranch } from '../branch-activation-actions';

/** What the dialogs post: the membership or the branch the decision writes; the action reads its
 * state again by that id. `membershipId` is null when the page's lookup found none (no decision). */
export type DecisionSubject =
  { kind: 'membership'; membershipId: string | null } | { kind: 'branch'; branchId: string };

interface DecisionBarProps {
  subject: DecisionSubject;
  /** The person's or the branch's name, for the dialog titles. */
  name: string;
  decisions: readonly ApprovalDecision[];
  /** The offered decisions shown disabled, each with the caption that says why. */
  blocked: Partial<Record<ApprovalDecision, string>>;
  /** Why the bar offers less than the holder's codes suggest (no `membership.view`, …). */
  note: string | null;
  /** I2: the organisation the page rendered for; forwarded to every dialog as a hidden field. */
  contextOrganisationId?: string;
}

function successToast(decision: ApprovalDecision, outcome: ApprovalOutcome): string {
  switch (decision) {
    case 'approve':
      return APPROVED_TOAST[outcome];
    case 'reject':
      return REJECTED_TOAST;
    case 'activate':
      return ACTIVATED_TOAST;
  }
}

/** The decision bar (spec §10.6) in the record hero: Approve and Reject & revoke for a user,
 * Activate for a branch. Primitive props only, so the Server Component page can render it. */
export function DecisionBar({
  subject,
  name,
  decisions,
  blocked,
  note,
  contextOrganisationId,
}: DecisionBarProps) {
  const notify = useToast();
  const [open, setOpen] = useState<ApprovalDecision | null>(null);
  const offered = subject.kind === 'membership' && subject.membershipId === null ? [] : decisions;
  // Ruling 10: the approval's echo says which way it went; the wrapper below keeps it for the toast.
  const outcomeRef = useRef<ApprovalOutcome>('recorded');
  const buttonRefs = useRef(new Map<string, HTMLButtonElement | null>());
  // As 10's UserLifecycleActions: a successful decision swaps the page's state (`refresh()`), so
  // focus goes to the same decision if still offered, else the first enabled one, else the record
  // title. `succeededRef` is set only by a real success, so this runs once per decision.
  const succeededRef = useRef<string | null>(null);
  const decisionKey = offered.join(',');

  useEffect(() => {
    const succeeded = succeededRef.current;
    if (succeeded === null) return;
    succeededRef.current = null;
    const focusable = (id: string): HTMLButtonElement | null => {
      const node = buttonRefs.current.get(id);
      return node && node.isConnected && !node.disabled ? node : null;
    };
    const current = decisionKey === '' ? [] : decisionKey.split(',');
    let target = current.includes(succeeded) ? focusable(succeeded) : null;
    for (const id of current) {
      if (target) break;
      target = focusable(id);
    }
    if (target) {
      target.focus();
    } else {
      focusRecordTitle();
    }
  }, [decisionKey]);

  // Every decision empties the bar, which unmounts this component before the effect above runs
  // again, so the record title takes focus from this cleanup instead (10's pattern).
  useEffect(() => {
    const successRef = succeededRef;
    return () => {
      if (successRef.current !== null) focusRecordTitle();
    };
  }, []);

  const approve = async (
    previous: ApproveResult | null,
    formData: FormData,
  ): Promise<ApproveResult> => {
    const result = await approveUser(previous, formData);
    if (result.ok) outcomeRef.current = result.outcome;
    return result;
  };

  // Visible text, not a tooltip: a disabled button can't take focus to reveal one.
  const captions = [
    ...new Set([...offered.flatMap((id) => blocked[id] ?? []), ...(note ? [note] : [])]),
  ];
  const captionId = (text: string) => `approval-decision-caption-${captions.indexOf(text)}`;
  const hiddenFields =
    subject.kind === 'membership' ? (
      <input type="hidden" name="membershipId" value={subject.membershipId ?? ''} />
    ) : (
      <input type="hidden" name="branchId" value={subject.branchId} />
    );

  return (
    <>
      <Box
        // 10's hero box: buttons at the right edge, the captions under them, and a cap from md so a
        // long caption wraps here instead of squeezing the title column.
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 2,
          maxWidth: { md: 320 },
          '& > *': { flexGrow: { xs: 1, md: 0 } },
        }}
      >
        {offered.map((id, index) => {
          const reason = blocked[id];
          const copy = decisionCopy(id, name);
          return (
            <Button
              key={id}
              ref={(node) => {
                buttonRefs.current.set(id, node);
              }}
              variant={index === 0 ? 'contained' : 'outlined'}
              color={copy.destructive ? 'error' : 'primary'}
              disabled={reason !== undefined}
              aria-describedby={reason === undefined ? undefined : captionId(reason)}
              onClick={() => {
                setOpen(id);
              }}
              // Never wraps: "Reject & revoke" stays one label beside a 100-character name.
              sx={{ whiteSpace: 'nowrap' }}
            >
              {copy.label}
            </Button>
          );
        })}
        {captions.map((text, index) => (
          <Typography
            key={text}
            variant="caption"
            id={`approval-decision-caption-${index}`}
            sx={{
              color: 'text.secondary',
              flexBasis: '100%',
              textAlign: 'right',
              textWrap: 'pretty',
            }}
          >
            {text}
          </Typography>
        ))}
      </Box>
      {offered.map((id) => {
        const copy = decisionCopy(id, name);
        const close = () => {
          setOpen(null);
        };
        const succeed = () => {
          succeededRef.current = id;
          setOpen(null);
          notify(successToast(id, outcomeRef.current));
        };
        if (id === 'approve') {
          return (
            <ConfirmDialog
              key={id}
              open={open === id}
              title={copy.title}
              description={copy.description}
              confirmLabel={copy.label}
              action={approve}
              contextOrganisationId={contextOrganisationId}
              onClose={close}
              onSuccess={succeed}
            >
              {hiddenFields}
            </ConfirmDialog>
          );
        }
        return (
          <ReasonDialog
            key={id}
            open={open === id}
            title={copy.title}
            description={copy.description}
            confirmLabel={copy.label}
            reason={copy.reason ?? 'optional'}
            tone={copy.destructive ? 'error' : 'default'}
            action={id === 'reject' ? rejectUser : activatePendingBranch}
            contextOrganisationId={contextOrganisationId}
            onClose={close}
            onSuccess={succeed}
            fields={() => hiddenFields}
          />
        );
      })}
    </>
  );
}
```

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs: post `userId` instead of `membershipId`
      ("…says what a 200 means" fails on `expectScoped`); drop `sx={{ whiteSpace: 'nowrap' }}`
      ("never wraps a decision label…"); drop the unmount cleanup effect ("moves focus to the record
      title when the decision empties the bar"); toast `APPROVED_TOAST.recorded` always ("…says what
      a 202 means").

- [ ] **Step 5: Commit** (form C):

```
feat(approvals): add the decision bar with its dialogs, toasts and focus

The hero's decisions: Approve as a confirmation, Reject & revoke as a reason dialog marked as an
alertdialog, and Activate with an optional reason. A decision the page can't offer shows disabled
with its reason as visible text; labels never wrap. The approval's toast says whether the
membership went live or provisioning was queued; after a decision, focus goes to the same decision,
the first enabled one, or the record title.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** the focus effect is 10's `UserLifecycleActions`
pattern (`succeededRef`, the unmount cleanup); the hero box's `maxWidth: { md: 320 }` is 10's. Rule
6's retry with the same key is pinned for each of the three decisions ("keeps the key after a
failed …"). Focus after a failed Approve is `ConfirmDialog`'s (Task 3a) and is pinned there and in
the e2e, not here: a mocked action settles at once and jsdom never blurs the button.

#### Task 5b: Who asked, and the control checks

**Files:**

- Create: `modules/administration/approvals/components/request-facts.tsx`
- Create: `modules/administration/approvals/components/request-facts.test.tsx`
- Create: `modules/administration/approvals/components/control-checks.tsx`
- Create: `modules/administration/approvals/components/control-checks.test.tsx`

**Interfaces:**

- Consumes: `DescriptionList`, `StatusChip`, `Loaded`, `ProblemView`, `shortId`; Task 1a's
  `isSameUser`; Task 1b's `MAKER_NOT_PERMITTED`, `MAKER_NOT_RECORDED`, `READ_FAILED`; Task 1d's
  `CHECK_STATES`, `ControlCheck`; Task 2's `MakerEvent` (type).
- Produces: `ReadFailed({ problem })`, `MakerValue({ maker, name, me })`,
  `ControlChecks({ checks })` — Server-Component safe (no `'use client'`).

- [ ] **Step 1: Write the failing tests.** `request-facts.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { MAKER_NOT_PERMITTED, MAKER_NOT_RECORDED, READ_FAILED } from '../approval-copy';
import { MakerValue, ReadFailed } from './request-facts';

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const ME = 'a1000000-0000-4000-8000-0000000000aa';
const VICTOR = 'b2000000-0000-4000-8000-0000000000bb';
const FAILED = {
  title: 'Something went wrong',
  message: 'Try again.',
  code: null,
  requestId: 'req-1',
};
const event = (actorUserId: string | null) => ({
  ok: true as const,
  value: { actorUserId, occurredAt: '2026-09-24T08:00:00Z' },
});

describe('MakerValue', () => {
  it.each([
    ['not permitted (nothing read)', null, null, MAKER_NOT_PERMITTED],
    ['an event with no actor', event(null), null, MAKER_NOT_RECORDED],
    ['no event at all', { ok: true as const, value: null }, null, MAKER_NOT_RECORDED],
    ['someone else, by name', event(VICTOR), 'Victor Kamau', 'Victor Kamau'],
    ['someone the lookup can’t name, by short id', event(VICTOR), null, 'b2000000'],
    ['the signed-in user, in any case', event(ME.toUpperCase()), 'Ann Admin', 'Ann Admin (you)'],
  ])('says %s', (_case, maker, name, text) => {
    renderWithProviders(
      <p data-testid="value">
        <MakerValue maker={maker} name={name} me={ME} />
      </p>,
    );
    expect(screen.getByTestId('value').textContent).toBe(text);
  });

  it('says a failed read failed, with its reference, never as "not recorded"', () => {
    renderWithProviders(
      <p data-testid="value">
        <MakerValue maker={{ ok: false, problem: FAILED }} name={null} me={ME} />
      </p>,
    );
    const value = screen.getByTestId('value');
    expect(value).toHaveTextContent(READ_FAILED);
    expect(value).toHaveTextContent('Reference: req-1');
    expect(value).not.toHaveTextContent(MAKER_NOT_RECORDED);
  });

  it('leaves the reference out when the failure has none', () => {
    renderWithProviders(
      <p data-testid="value">
        <ReadFailed problem={{ ...FAILED, requestId: null }} />
      </p>,
    );
    expect(screen.getByTestId('value').textContent).toBe(READ_FAILED);
  });
});
```

`control-checks.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { CHECK_STATES, VERIFIED_ON_APPROVAL, type ControlCheck } from '../approval-checks';
import { ControlChecks } from './control-checks';

describe('ControlChecks', () => {
  it('names every check’s state in a word, then why', () => {
    const checks: ControlCheck[] = [
      {
        id: 'maker',
        label: 'Invited by someone else',
        state: 'passed',
        detail: 'Invited by Victor Kamau.',
      },
      {
        id: 'role',
        label: 'Has an active role',
        state: 'failed',
        detail: 'They hold no active role.',
      },
      {
        id: 'branch',
        label: 'Has an active branch assignment',
        state: 'platform',
        detail: `${VERIFIED_ON_APPROVAL} Your role can't view branch assignments.`,
      },
      { id: 'institution', label: 'Institution is active', state: 'not-required', detail: 'n/a' },
    ];
    renderWithProviders(<ControlChecks checks={checks} />);

    for (const check of checks) {
      const value = screen.getByText(check.label, { selector: 'dt' }).nextElementSibling;
      if (!(value instanceof HTMLElement)) throw new Error(`"${check.label}" has no value cell`);
      expect(within(value).getByText(CHECK_STATES[check.state].label)).toBeInTheDocument();
      expect(value).toHaveTextContent(check.detail);
    }
  });
});
```

- [ ] **Step 2: Run them to verify they fail** — form U. Expected: FAIL.

- [ ] **Step 3: Implement** `request-facts.tsx`:

```tsx
import Typography from '@mui/material/Typography';
import type { Loaded } from '@/lib/api/load';
import type { ProblemView } from '@/lib/api/problem';
import { shortId } from '@/lib/format';
import { MAKER_NOT_PERMITTED, MAKER_NOT_RECORDED, READ_FAILED } from '../approval-copy';
import { isSameUser } from '../approval-rules';
import type { MakerEvent } from '../approval-service';

/** A fact whose read failed: said so, with its reference, never backend text (rule 9). */
export function ReadFailed({ problem }: { problem: ProblemView }) {
  return (
    <>
      {READ_FAILED}
      {problem.requestId && (
        <Typography
          variant="caption"
          component="span"
          sx={{ display: 'block', color: 'text.secondary', fontWeight: 400 }}
        >
          Reference: {problem.requestId}
        </Typography>
      )}
    </>
  );
}

/** Who asked (BG-08): not permitted, failed, not recorded, or the name (the short id when the user
 * lookup can't name them), marked "(you)" for the signed-in user. Server-Component safe. */
export function MakerValue({
  maker,
  name,
  me,
}: {
  /** `null`: no `audit.view`, so nothing was read. */
  maker: Loaded<MakerEvent | null> | null;
  name: string | null;
  me: string;
}) {
  if (maker === null) return MAKER_NOT_PERMITTED;
  if (!maker.ok) return <ReadFailed problem={maker.problem} />;
  const actor = maker.value?.actorUserId ?? null;
  if (actor === null) return MAKER_NOT_RECORDED;
  return `${name ?? shortId(actor)}${isSameUser(actor, me) ? ' (you)' : ''}`;
}
```

`control-checks.tsx`:

```tsx
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DescriptionList } from '@/components/data-display/description-list';
import { StatusChip } from '@/components/data-display/status-chip';
import { CHECK_STATES, type ControlCheck } from '../approval-checks';

/** The control checks (spec §10.6): each one's state in a word, then why. Server-Component safe. */
export function ControlChecks({ checks }: { checks: readonly ControlCheck[] }) {
  return (
    <DescriptionList
      columns={1}
      items={checks.map((check) => ({
        label: check.label,
        value: (
          <Box sx={{ display: 'grid', justifyItems: 'start', gap: 1 }}>
            <StatusChip
              value={check.state}
              label={CHECK_STATES[check.state].label}
              tone={CHECK_STATES[check.state].tone}
            />
            <Typography
              component="span"
              variant="body2"
              sx={{ color: 'text.secondary', fontWeight: 400 }}
            >
              {check.detail}
            </Typography>
          </Box>
        ),
      }))}
    />
  );
}
```

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs: render `MAKER_NOT_RECORDED` for a failed
      maker read ("says a failed read failed, with its reference, never as 'not recorded'"); drop
      `isSameUser` for a plain `===` ("says the signed-in user, in any case").

- [ ] **Step 5: Commit** (form C):

```
feat(approvals): show who asked and the control checks

Who made a request: by name, by short id when the name can't be read, marked "(you)" for the
signed-in user, or why it can't be shown; a read that failed says so with its reference. Each
control check shows its state in a word with its reason.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

#### Task 5c: The requested access

**Files:**

- Create: `modules/administration/approvals/components/requested-access.tsx`
- Create: `modules/administration/approvals/components/requested-access.test.tsx`

**Interfaces:**

- Consumes: `DescriptionList`, `ErrorState`, `SectionCard`, `humanizeEnum`, `Loaded`, `Page`,
  `RoleIndexEntry`, `shortId`; 10's `UserRoleAssignmentsTable`, `UserBranchAssignmentsTable`,
  `MembershipSummary`, `UserBranchScan`, `branchContextNote`, `PARTIAL_SCAN_NOTE`; 09's
  `RoleAssignment`; Task 1b's copy; Task 5b's `ReadFailed`.
- Produces: `RequestedAccess` (props `userName`, `membership`, `roles`, `scan`, `roleIndex`,
  `branchIndex`, `selectedBranch`, `canSwitch`) — Server-Component safe.

- [ ] **Step 1: Write the failing test** — `requested-access.test.tsx`:

```tsx
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { branchContextNote, PARTIAL_SCAN_NOTE } from '@/modules/administration/users/user-rules';
import { renderWithProviders } from '@/test/test-utils';
import {
  BRANCHES_NOT_PERMITTED,
  MEMBERSHIP_NOT_FOUND,
  MEMBERSHIP_NOT_PERMITTED,
  NO_ACTIVE_BRANCH,
  NO_ACTIVE_ROLE,
  READ_FAILED,
  ROLES_CAPPED,
  ROLES_NOT_PERMITTED,
} from '../approval-copy';
import { RequestedAccess } from './requested-access';

// The assignment tables import their revoke buttons' Server Actions; nothing here submits one.
vi.mock('@/modules/administration/roles/role-actions', () => ({
  assignRole: vi.fn(),
  revokeRoleAssignment: vi.fn(),
}));
vi.mock('@/modules/administration/branches/branch-actions', () => ({
  assignBranchUser: vi.fn(),
  revokeBranchAssignment: vi.fn(),
}));

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const MEMBERSHIP = 'a1000000-0000-4000-8000-0000000000aa';
const ROSE = 'b2000000-0000-4000-8000-0000000000bb';
const WESTLANDS = 'c3000000-0000-4000-8000-0000000000cc';
const UNKNOWN_BRANCH = 'd4000000-0000-4000-8000-0000000000dd';
const TELLER = 'e5000000-0000-4000-8000-0000000000ee';
const FAILED = {
  title: 'Something went wrong',
  message: 'Try again.',
  code: null,
  requestId: 'req-9',
};

const page = (count: number, hasNext = false) => ({
  number: 0,
  size: 100,
  totalItems: count,
  totalPages: 1,
  hasNext,
  hasPrevious: false,
});

type Props = ComponentProps<typeof RequestedAccess>;

const PROPS: Props = {
  userName: 'Rose Atieno',
  membership: {
    ok: true,
    value: {
      id: MEMBERSHIP,
      userId: ROSE,
      status: 'PENDING_APPROVAL',
      type: 'STAFF',
      primaryBranchId: WESTLANDS,
    },
  },
  roles: {
    ok: true,
    value: {
      items: [
        {
          id: 'f6000000-0000-4000-8000-0000000000f1',
          userId: ROSE,
          roleId: TELLER,
          scopeType: 'BRANCH',
          branchId: WESTLANDS,
          status: 'ACTIVE',
        },
      ],
      page: page(1),
    },
  },
  scan: {
    ok: true,
    value: {
      items: [
        {
          id: 'f6000000-0000-4000-8000-0000000000f2',
          userId: ROSE,
          branchId: WESTLANDS,
          assignmentType: 'HOME',
          status: 'ACTIVE',
        },
      ],
      truncated: false,
    },
  },
  roleIndex: new Map([
    [TELLER, { name: 'Teller', code: 'TELLER', status: 'ACTIVE', systemRole: false }],
  ]),
  branchIndex: new Map([[WESTLANDS, { name: 'Westlands Branch', code: 'WESTLANDS' }]]),
  selectedBranch: null,
  canSwitch: true,
};

const show = (overrides: Partial<Props> = {}) =>
  renderWithProviders(<RequestedAccess {...PROPS} {...overrides} />);
const card = () => screen.getByRole('region', { name: 'Requested access' });
function fact(label: string): HTMLElement {
  const value = within(card()).getByText(label, { selector: 'dt' }).nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`"${label}" has no value cell`);
  return value;
}

describe('RequestedAccess', () => {
  it('shows the membership, then the roles and branches in keyboard-scrollable regions', () => {
    show();

    expect(fact('Membership type')).toHaveTextContent('Staff');
    expect(fact('Primary branch')).toHaveTextContent('Westlands Branch (WESTLANDS)');
    expect(within(card()).getByRole('heading', { level: 3, name: 'Roles' })).toBeInTheDocument();
    const roles = screen.getByRole('region', { name: 'Role assignments' });
    expect(roles).toHaveAttribute('tabindex', '0');
    expect(within(roles).getByText('Teller')).toBeInTheDocument();
    const branches = screen.getByRole('region', { name: 'Branch assignments table' });
    expect(branches).toHaveAttribute('tabindex', '0');
    expect(within(branches).getByText('Westlands Branch')).toBeInTheDocument();
    // Nothing here can be revoked: this page decides the request, it doesn't edit access.
    expect(screen.queryByRole('button', { name: /Revoke/ })).toBeNull();
  });

  it("says what the holder can't read, never none", () => {
    show({ membership: null, roles: null, scan: null });

    expect(fact('Membership type')).toHaveTextContent(MEMBERSHIP_NOT_PERMITTED);
    expect(fact('Primary branch')).toHaveTextContent(MEMBERSHIP_NOT_PERMITTED);
    expect(screen.getByText(ROLES_NOT_PERMITTED)).toBeInTheDocument();
    expect(screen.getByText(BRANCHES_NOT_PERMITTED)).toBeInTheDocument();
    expect(screen.queryByText(NO_ACTIVE_ROLE)).toBeNull();
    expect(screen.queryByText(NO_ACTIVE_BRANCH)).toBeNull();
  });

  it('says a failed read failed, with its reference, never none (rule 9)', () => {
    show({
      membership: { ok: false, problem: FAILED },
      roles: { ok: false, problem: { ...FAILED, requestId: 'req-10' } },
      scan: { ok: false, problem: { ...FAILED, requestId: 'req-11' } },
    });

    expect(fact('Membership type')).toHaveTextContent(READ_FAILED);
    expect(fact('Membership type')).toHaveTextContent('Reference: req-9');
    expect(screen.getByText('Reference: req-10')).toBeInTheDocument();
    expect(screen.getByText('Reference: req-11')).toBeInTheDocument();
    expect(screen.queryByText(NO_ACTIVE_ROLE)).toBeNull();
    expect(screen.queryByText(NO_ACTIVE_BRANCH)).toBeNull();
  });

  it('says the roles are capped when one page doesn’t hold them all (rule 9)', () => {
    const roles = PROPS.roles?.ok ? PROPS.roles.value : null;
    if (!roles) throw new Error('the fixture has roles');
    show({ roles: { ok: true, value: { ...roles, page: page(101, true) } } });

    expect(screen.getByRole('note')).toHaveTextContent(ROLES_CAPPED);
  });

  it('says when the branch scan is partial, and when a selected branch narrows it', () => {
    const scan = PROPS.scan?.ok ? PROPS.scan.value : null;
    if (!scan) throw new Error('the fixture has a scan');
    show({
      scan: { ok: true, value: { ...scan, truncated: true } },
      selectedBranch: { name: 'Westlands Branch' },
      canSwitch: false,
    });

    const notes = screen.getAllByRole('note').map((note) => note.textContent);
    expect(notes).toEqual([branchContextNote('Westlands Branch', false), PARTIAL_SCAN_NOTE]);
  });

  it('says none when there are none, and a membership it couldn’t find', () => {
    show({
      membership: { ok: true, value: null },
      roles: { ok: true, value: { items: [], page: page(0) } },
      scan: { ok: true, value: { items: [], truncated: false } },
    });

    expect(fact('Membership type')).toHaveTextContent(MEMBERSHIP_NOT_FOUND);
    expect(screen.getByText(NO_ACTIVE_ROLE)).toBeInTheDocument();
    expect(screen.getByText(NO_ACTIVE_BRANCH)).toBeInTheDocument();
  });

  it('names a branch the index doesn’t know by its short id, and no primary branch as None', () => {
    const membership = PROPS.membership?.ok ? PROPS.membership.value : null;
    if (!membership) throw new Error('the fixture has a membership');
    const { unmount } = show({
      membership: { ok: true, value: { ...membership, primaryBranchId: UNKNOWN_BRANCH } },
    });
    expect(fact('Primary branch')).toHaveTextContent('d4000000');
    unmount();

    show({ membership: { ok: true, value: { ...membership, primaryBranchId: null } } });
    expect(fact('Primary branch')).toHaveTextContent('None');
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — form U. Expected: FAIL.

- [ ] **Step 3: Implement** — `requested-access.tsx`:

```tsx
import type { ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DescriptionList } from '@/components/data-display/description-list';
import { ErrorState } from '@/components/data-display/error-state';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { SectionCard } from '@/components/data-display/section-card';
import type { Loaded } from '@/lib/api/load';
import type { RoleIndexEntry } from '@/lib/api/lookups';
import type { Page } from '@/lib/api/wire';
import { shortId } from '@/lib/format';
import type { RoleAssignment } from '@/modules/administration/roles/role-contract';
import { UserBranchAssignmentsTable } from '@/modules/administration/users/components/user-branch-assignments-table';
import { UserRoleAssignmentsTable } from '@/modules/administration/users/components/user-role-assignments-table';
import type { MembershipSummary } from '@/modules/administration/users/user-contract';
import { branchContextNote, PARTIAL_SCAN_NOTE } from '@/modules/administration/users/user-rules';
import type { UserBranchScan } from '@/modules/administration/users/user-service';
import {
  BRANCHES_NOT_PERMITTED,
  MEMBERSHIP_NOT_FOUND,
  MEMBERSHIP_NOT_PERMITTED,
  NO_ACTIVE_BRANCH,
  NO_ACTIVE_ROLE,
  REQUESTED_ACCESS_DESCRIPTION,
  ROLES_CAPPED,
  ROLES_NOT_PERMITTED,
} from '../approval-copy';
import { ReadFailed } from './request-facts';

/** Each read as the page settled it; `null`: the holder lacks its code, so nothing was read. */
interface RequestedAccessProps {
  userName: string;
  membership: Loaded<MembershipSummary | null> | null;
  /** One page of the user's ACTIVE role assignments (Ruling 8). */
  roles: Loaded<Page<RoleAssignment>> | null;
  /** 10's bounded scan of their ACTIVE branch assignments. */
  scan: Loaded<UserBranchScan> | null;
  roleIndex: ReadonlyMap<string, RoleIndexEntry>;
  branchIndex: ReadonlyMap<string, { name: string; code: string }>;
  /** A selected branch narrows the scan to itself (BG-03). */
  selectedBranch: { name: string } | null;
  /** The signed-in user can switch to All branches (two ACTIVE branches, 08's PF1). */
  canSwitch: boolean;
}

const MUTED_SX = { color: 'text.secondary', px: 4.5, py: 2 } as const;

function subheading(text: string): ReactNode {
  return (
    <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700, px: 4.5, pt: 3 }}>
      {text}
    </Typography>
  );
}

function membershipFact(
  membership: Loaded<MembershipSummary | null> | null,
  show: (found: MembershipSummary) => string,
): ReactNode {
  if (membership === null) return MEMBERSHIP_NOT_PERMITTED;
  if (!membership.ok) return <ReadFailed problem={membership.problem} />;
  return membership.value ? show(membership.value) : MEMBERSHIP_NOT_FOUND;
}

/** The access a pending user gets once approved (spec §10.6): the membership's type and primary
 * branch, their roles (one page, capped and said so) and their branches (10's bounded scan, said
 * partial when it is). A read that failed says so, never "none" (rule 9). Server-Component safe. */
export function RequestedAccess({
  userName,
  membership,
  roles,
  scan,
  roleIndex,
  branchIndex,
  selectedBranch,
  canSwitch,
}: RequestedAccessProps) {
  const branchName = (id: string) => {
    const branch = branchIndex.get(id);
    return branch ? `${branch.name} (${branch.code})` : shortId(id);
  };
  return (
    <SectionCard title="Requested access" description={REQUESTED_ACCESS_DESCRIPTION}>
      <DescriptionList
        items={[
          {
            label: 'Membership type',
            value: membershipFact(membership, (found) => humanizeEnum(found.type)),
          },
          {
            label: 'Primary branch',
            value: membershipFact(membership, (found) =>
              found.primaryBranchId ? branchName(found.primaryBranchId) : 'None',
            ),
          },
        ]}
      />
      {subheading('Roles')}
      {roles === null ? (
        <Typography variant="body2" sx={MUTED_SX}>
          {ROLES_NOT_PERMITTED}
        </Typography>
      ) : !roles.ok ? (
        <ErrorState problem={roles.problem} />
      ) : roles.value.items.length === 0 ? (
        <Typography variant="body2" sx={MUTED_SX}>
          {NO_ACTIVE_ROLE}
        </Typography>
      ) : (
        <>
          {roles.value.page.hasNext && (
            <Box sx={{ px: 4, py: 2 }}>
              <Alert severity="info" role="note">
                {ROLES_CAPPED}
              </Alert>
            </Box>
          )}
          <UserRoleAssignmentsTable
            userName={userName}
            self={false}
            canRevoke={false}
            rows={roles.value.items.map((row) => {
              const role = roleIndex.get(row.roleId);
              return {
                assignmentId: row.id,
                roleName: role?.name ?? shortId(row.roleId),
                roleCode: role?.code ?? null,
                roleStatus: role?.status ?? null,
                scopeType: row.scopeType,
                branchLabel: row.branchId
                  ? (branchIndex.get(row.branchId)?.name ?? shortId(row.branchId))
                  : 'All branches',
                revocable: false,
              };
            })}
          />
        </>
      )}
      {subheading('Branch assignments')}
      {scan === null ? (
        <Typography variant="body2" sx={MUTED_SX}>
          {BRANCHES_NOT_PERMITTED}
        </Typography>
      ) : !scan.ok ? (
        <ErrorState problem={scan.problem} />
      ) : (
        <>
          {(selectedBranch !== null || scan.value.truncated) && (
            <Box sx={{ px: 4, py: 2, display: 'grid', gap: 2 }}>
              {selectedBranch && (
                <Alert severity="info" role="note">
                  {branchContextNote(selectedBranch.name, canSwitch)}
                </Alert>
              )}
              {scan.value.truncated && (
                <Alert severity="info" role="note">
                  {PARTIAL_SCAN_NOTE}
                </Alert>
              )}
            </Box>
          )}
          {scan.value.items.length === 0 ? (
            <Typography variant="body2" sx={MUTED_SX}>
              {NO_ACTIVE_BRANCH}
            </Typography>
          ) : (
            <UserBranchAssignmentsTable
              userName={userName}
              canRevoke={false}
              rows={scan.value.items.map((row) => {
                const branch = branchIndex.get(row.branchId);
                return {
                  assignmentId: row.id,
                  branchName: branch?.name ?? shortId(row.branchId),
                  branchCode: branch?.code ?? null,
                  assignmentType: row.assignmentType,
                };
              })}
            />
          )}
        </>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs: show `NO_ACTIVE_ROLE` when the role read
      failed ("says a failed read failed, with its reference, never none"); drop the `hasNext`
      note ("says the roles are capped…"); drop the selected-branch note ("says when the branch scan
      is partial, and when a selected branch narrows it").

- [ ] **Step 5: Commit** (form C):

```
feat(approvals): show the access a pending user gets once approved

The membership's type and primary branch, one bounded page of their active roles (said so when
there are more) and their branch assignments from the bounded scan (said partial when it is, and
narrowed when a branch is selected). Each read that can't be made or failed says so, never "none".

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** `RequestedAccess` reuses 10's tables with
`canRevoke={false}`, so the regions "Role assignments" and "Branch assignments table" are 10's.

---

### Task 6: The queue

Three sub-tasks, each its own commit: **6a** (the navigation item, the index and the tabs'
layout), **6b** (User onboarding) and **6c** (Branch activation).

#### Task 6a: The navigation item, the index and the tabs

**Files:**

- Modify: `modules/administration/administration-navigation.ts`
- Modify: `modules/administration/administration-navigation.test.ts`
- Create: `app/(authenticated)/admin/approvals/page.tsx`
- Create: `app/(authenticated)/admin/approvals/page.test.tsx`
- Create: `app/(authenticated)/admin/approvals/(queue)/layout.tsx`
- Create: `app/(authenticated)/admin/approvals/(queue)/layout.test.tsx`

**Interfaces:**

- Consumes: `FactCheckOutlined` (`@mui/icons-material`); `RecordTabs`, `PageHeader`,
  `ForbiddenState`, `load`; Task 1a's `approvalQueueTabs` and codes; Task 1b's copy; Task 1c's
  `actionableUserApprovals`; Task 2's counts.
- Produces: the nav item; the routes `/admin/approvals` (redirect or forbidden) and the `(queue)`
  layout (h1 + counted tabs).

- [ ] **Step 1: Write the failing tests.** Replace `administration-navigation.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { visibleNavigationItems } from '@/components/shell/workspace-navigation';
import { administrationNavigationItems } from './administration-navigation';

const labels = (permissions: string[]) =>
  visibleNavigationItems(administrationNavigationItems, permissions).map((item) => item.label);

describe('administrationNavigationItems', () => {
  it('lists the Approval queue right after Overview, then Users & access (spec §8)', () => {
    expect(administrationNavigationItems.slice(0, 4).map((item) => item.href)).toEqual([
      '/admin',
      '/admin/approvals',
      '/admin/users',
      '/admin/branches',
    ]);
    const queue = administrationNavigationItems[1];
    expect(queue?.label).toBe('Approval queue');
    expect(queue?.requiresAny).toEqual(['user.approve', 'branch.activate']);
    const users = administrationNavigationItems[2];
    expect(users?.label).toBe('Users & access');
    expect(users?.requiresAny).toEqual(['user.view']);
  });

  it('shows the Approval queue to a holder of either decision, and only then', () => {
    expect(labels(['user.approve'])).toEqual(['Overview', 'Approval queue']);
    expect(labels(['branch.activate', 'branch.view'])).toEqual([
      'Overview',
      'Approval queue',
      'Branches',
    ]);
    expect(labels(['user.view'])).toEqual(['Overview', 'Users & access']);
    expect(labels(['branch.view'])).toEqual(['Overview', 'Branches']);
  });
});
```

`app/(authenticated)/admin/approvals/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { SelectedContextProfile } from '@/auth/context-service';
import { NO_APPROVAL_ACCESS } from '@/modules/administration/approvals/approval-copy';
import {
  BRANCH_QUEUE_HREF,
  USER_QUEUE_HREF,
} from '@/modules/administration/approvals/approval-rules';
import { renderWithProviders } from '@/test/test-utils';

const CONTEXT_NOT_SELECTED = {
  kind: 'redirect-to-context-selection',
  reason: 'invalid-context',
} satisfies SelectedContextProfile;

const { getCurrentContextProfile, redirect } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (to: string) => redirect(to) as unknown,
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));

const { default: ApprovalQueuePage } = await import('./page');

const resolved = (permissions: string[]) => ({
  kind: 'resolved',
  profile: { permissions },
  context: { organization: { id: 'org-1', name: 'Greenfield' }, branch: null },
});

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('ApprovalQueuePage', () => {
  it.each([
    [
      'both queues',
      ['user.approve', 'user.view', 'branch.activate', 'branch.view'],
      USER_QUEUE_HREF,
    ],
    ['branch activation only', ['branch.activate', 'branch.view'], BRANCH_QUEUE_HREF],
    ['user onboarding only', ['user.approve', 'user.view'], USER_QUEUE_HREF],
  ])('opens the first tab the holder can see (%s)', async (_case, permissions, to) => {
    getCurrentContextProfile.mockResolvedValue(resolved(permissions));
    await expect(ApprovalQueuePage()).rejects.toThrow(`NEXT_REDIRECT:${to}`);
  });

  it.each([
    ['a holder who can approve nothing', resolved(['user.approve', 'branch.view'])],
    ['an unresolved context', CONTEXT_NOT_SELECTED],
  ])('says so under the page h1 for %s', async (_case, profile) => {
    getCurrentContextProfile.mockResolvedValue(profile);
    renderWithProviders(await ApprovalQueuePage());

    expect(screen.getByRole('heading', { level: 1, name: 'Approval queue' })).toBeInTheDocument();
    expect(screen.getByText(NO_APPROVAL_ACCESS)).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });
});
```

`app/(authenticated)/admin/approvals/(queue)/layout.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import { renderWithProviders } from '@/test/test-utils';

const { countBranchActivations, countUserApprovals, getCurrentContextProfile, redirect } =
  vi.hoisted(() => ({
    countBranchActivations: vi.fn(),
    countUserApprovals: vi.fn(),
    getCurrentContextProfile: vi.fn(),
    redirect: vi.fn(),
  }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (to: string) => redirect(to) as unknown,
  usePathname: () => '/admin/approvals/branches',
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/modules/administration/approvals/approval-service', () => ({
  countBranchActivations: () => countBranchActivations() as unknown,
  countUserApprovals: () => countUserApprovals() as unknown,
}));

const { default: ApprovalQueueLayout } = await import('./layout');

const BOTH = ['user.approve', 'user.view', 'branch.activate', 'branch.view'];
const resolved = (permissions: string[]) => ({
  kind: 'resolved',
  profile: { permissions },
  context: { organization: { id: 'org-1', name: 'Greenfield' }, branch: null },
});
const show = async (children: ReactNode = null) =>
  renderWithProviders(await ApprovalQueueLayout({ children }));
const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.textContent);

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
  countUserApprovals.mockResolvedValue({ pending: 9, provisioning: 1 });
  countBranchActivations.mockResolvedValue(3);
});

describe('ApprovalQueueLayout', () => {
  it('is the queue’s one h1, with a counted tab per queue, the current one selected', async () => {
    getCurrentContextProfile.mockResolvedValue(resolved(BOTH));
    await show(<p>Tab body</p>);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Approval queue' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Approval queue sections' });
    // Spec §10.6: the actionable users (pending less provisioning) and the pending branches.
    expect(tabNames()).toEqual(['User onboarding (8)', 'Branch activation (3)']);
    expect(within(nav).getByRole('tab', { name: 'Branch activation (3)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Tab body')).toBeInTheDocument();
  });

  it('reads and offers only what the holder’s codes allow, and nothing without either pair', async () => {
    getCurrentContextProfile.mockResolvedValue(resolved(['branch.activate', 'branch.view']));
    const { unmount } = await show();
    expect(tabNames()).toEqual(['Branch activation (3)']);
    expect(countUserApprovals).not.toHaveBeenCalled();
    unmount();

    getCurrentContextProfile.mockResolvedValue(resolved(['user.approve', 'branch.activate']));
    await show();
    expect(screen.queryByRole('navigation', { name: 'Approval queue sections' })).toBeNull();
    // Only the first render's branch count: the second read nothing.
    expect(countBranchActivations).toHaveBeenCalledTimes(1);
  });

  it('leaves a tab’s label without a number when its count fails, never a 0', async () => {
    getCurrentContextProfile.mockResolvedValue(resolved(BOTH));
    countUserApprovals.mockRejectedValue(new BackendApiError(503));
    await show();

    expect(tabNames()).toEqual(['User onboarding', 'Branch activation (3)']);
  });

  it.each([
    ['a 401', new BackendApiError(401), '/login?reason=session_expired'],
    [
      'a stale context',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      '/select-context',
    ],
  ])('redirects when a count finds %s', async (_case, error, to) => {
    getCurrentContextProfile.mockResolvedValue(resolved(BOTH));
    countBranchActivations.mockRejectedValue(error);
    await expect(show()).rejects.toThrow(`NEXT_REDIRECT:${to}`);
  });
});
```

- [ ] **Step 2: Run them to verify they fail** — form U. Expected: FAIL.

- [ ] **Step 3: Add the navigation item.** In `administration-navigation.ts`, import the icon (keep
      the imports sorted):

```ts
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
```

      replace the doc comment's first sentence so it reads:

```ts
/**
 * Tenant Administration navigation, in spec §8's order: Overview, Approval queue, Users & access,
 * Branches, Roles & permissions, Settings, Business date, Audit trail. Each stack layer inserts its
 * page at its place when it ships, with `requiresAny` set to the page's read permission.
 */
```

      and insert after the Overview item:

```ts
  // Spec §8: either decision opens the queue; each tab needs its own codes (layer 12, Ruling 2).
  {
    href: '/admin/approvals',
    label: 'Approval queue',
    icon: FactCheckOutlined,
    requiresAny: ['user.approve', 'branch.activate'],
  },
```

- [ ] **Step 4: Implement the index** — `app/(authenticated)/admin/approvals/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { PageHeader } from '@/components/shell/page-header';
import {
  NO_APPROVAL_ACCESS,
  QUEUE_DESCRIPTION,
} from '@/modules/administration/approvals/approval-copy';
import { approvalQueueTabs } from '@/modules/administration/approvals/approval-rules';

export const metadata: Metadata = { title: 'Approval queue' };

/** The navigation entry (spec §8): opens the first tab the holder can see (Ruling 2). */
export default async function ApprovalQueuePage() {
  const selected = await getCurrentContextProfile();
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };
  const [first] = approvalQueueTabs(holder);
  if (first) redirect(first.href);
  return (
    <>
      <PageHeader eyebrow="Administration" title="Approval queue" description={QUEUE_DESCRIPTION} />
      <Paper>
        <ForbiddenState description={NO_APPROVAL_ACCESS} />
      </Paper>
    </>
  );
}
```

- [ ] **Step 5: Implement the tabs' layout** — `app/(authenticated)/admin/approvals/(queue)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { getCurrentContextProfile } from '@/auth/context-service';
import { canAll } from '@/auth/permissions';
import { RecordTabs } from '@/components/data-display/record-tabs';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { QUEUE_DESCRIPTION } from '@/modules/administration/approvals/approval-copy';
import { actionableUserApprovals } from '@/modules/administration/approvals/approval-notifications';
import {
  approvalQueueTabs,
  BRANCH_ACTIVATION_CODES,
  USER_APPROVAL_CODES,
} from '@/modules/administration/approvals/approval-rules';
import {
  countBranchActivations,
  countUserApprovals,
} from '@/modules/administration/approvals/approval-service';

/** The queue's shell (Ruling 2): the page's only h1 and the tabs the holder can see, as link tabs
 * (each tab is its own route, so its paging lives in its own URL). The detail pages live outside
 * this group, with their own hero. */
export default async function ApprovalQueueLayout({ children }: { children: ReactNode }) {
  const selected = await getCurrentContextProfile();
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };
  const users = canAll(holder, USER_APPROVAL_CODES);
  const branches = canAll(holder, BRANCH_ACTIVATION_CODES);
  // Spec §10.6's tab counts are the bell's reads, cached per request, so the pair is read once.
  // load() redirects on a lost session or a stale context; any other failure leaves the label
  // without a number (the tab's own list says when it can't load).
  const [userCounts, branchCount] = await Promise.all([
    users ? load(countUserApprovals()) : null,
    branches ? load(countBranchActivations()) : null,
  ]);
  const tabs = approvalQueueTabs(holder, {
    users: userCounts?.ok ? actionableUserApprovals(userCounts.value) : null,
    branches: branchCount?.ok ? branchCount.value : null,
  });
  return (
    <>
      <PageHeader eyebrow="Administration" title="Approval queue" description={QUEUE_DESCRIPTION} />
      {tabs.length > 0 && <RecordTabs label="Approval queue sections" tabs={tabs} />}
      {children}
    </>
  );
}
```

- [ ] **Step 6: Run** — form U: PASS. Form E on `e2e/shell.spec.ts e2e/users.spec.ts` (the rail):
      PASS. Mutation proofs: read a failed count as `0` (`userCounts?.ok ? … : 0`) ("leaves a tab's
      label without a number when its count fails"); settle the counts with `.catch(() => null)`
      instead of `load()` ("redirects when a count finds a 401").

- [ ] **Step 7: Commit** (form C):

```
feat(approvals): add the Approval queue's navigation item, index and tabs

The Approval queue sits after Overview for holders of user.approve or branch.activate. Its index
opens the first tab the holder can see, or says their role can't approve anything. The tabs, User
onboarding and Branch activation, are link tabs under the page's one heading, each labelled with its
count: actionable users (pending less those already provisioning) and pending branches. A count that
can't be read leaves its label without a number.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** the tab pages don't exist yet; the routes they
link to answer 404 until 6b and 6c (no test follows those links before then).

#### Task 6b: User onboarding

**Files:**

- Create: `app/(authenticated)/admin/approvals/(queue)/users/page.tsx`
- Create: `app/(authenticated)/admin/approvals/(queue)/users/page.test.tsx`

**Interfaces:**

- Consumes: 10's `UserDirectoryTable` (`basePath`), `DEFAULT_USER_PAGE_SIZE`; `SectionCard`,
  `EmptyState`, `ErrorState`, `ForbiddenState`, `TablePaginationBar`, `load`, `parsePaging`,
  `lastPageIfPastEnd`, `hrefWith`, `toSearchParams`; Task 1a's codes; Task 1b's copy; Task 2's
  `listUserApprovals`.
- Produces: the route `/admin/approvals/users`.

- [ ] **Step 1: Write the failing test** — `(queue)/users/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import {
  NO_USERS_WAITING,
  USER_APPROVAL_FORBIDDEN,
} from '@/modules/administration/approvals/approval-copy';
import { USER_QUEUE_LABEL } from '@/modules/administration/approvals/approval-rules';
import { renderWithProviders } from '@/test/test-utils';

const { getCurrentContextProfile, listUserApprovals, redirect } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  listUserApprovals: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (to: string) => redirect(to) as unknown,
  usePathname: () => '/admin/approvals/users',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/modules/administration/approvals/approval-service', () => ({
  listUserApprovals: (...args: unknown[]) => listUserApprovals(...args) as unknown,
}));

const { default: UserOnboardingPage } = await import('./page');

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const ROSE = 'a1000000-0000-4000-8000-0000000000a1';
const USHA = 'a5000000-0000-4000-8000-0000000000a5';
const CODES = ['user.approve', 'user.view'];

function users(totalItems: number, number = 0) {
  return {
    items:
      totalItems === 0
        ? []
        : [
            {
              id: USHA,
              username: 'usha.patel',
              email: 'usha.patel@greenfield.example',
              displayName: 'Usha Patel',
              userStatus: 'SUSPENDED',
              membershipStatus: 'PENDING_APPROVAL',
            },
            {
              id: ROSE,
              username: 'rose.atieno',
              email: 'rose.atieno@greenfield.example',
              displayName: 'Rose Atieno',
              userStatus: 'DRAFT',
              membershipStatus: 'PENDING_APPROVAL',
            },
          ],
    page: {
      number,
      size: 10,
      totalItems,
      totalPages: Math.ceil(totalItems / 10),
      hasNext: false,
      hasPrevious: number > 0,
    },
  };
}

function setup(permissions = CODES) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { permissions },
    context: { organization: { id: 'org-1', name: 'Greenfield' }, branch: null },
  });
}

const show = async (searchParams: Record<string, string> = {}) =>
  renderWithProviders(await UserOnboardingPage({ searchParams: Promise.resolve(searchParams) }));

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('UserOnboardingPage', () => {
  it('lists pending memberships, each linking to its approval page, in a named scroll region', async () => {
    setup();
    listUserApprovals.mockResolvedValue(users(2));
    await show({ page: '0', size: '20' });

    expect(listUserApprovals).toHaveBeenCalledExactlyOnceWith({ page: 0, size: 20 });
    const card = screen.getByRole('region', { name: USER_QUEUE_LABEL });
    const table = within(card).getByRole('region', { name: 'Users table' });
    expect(table).toHaveAttribute('tabindex', '0');
    expect(within(table).getByRole('link', { name: 'Rose Atieno' })).toHaveAttribute(
      'href',
      `/admin/approvals/users/${ROSE}`,
    );
    expect(within(table).getByText('Account suspended')).toBeInTheDocument();
  });

  it('says nothing is waiting, never an empty table', async () => {
    setup();
    listUserApprovals.mockResolvedValue(users(0));
    await show();

    expect(screen.getByText(NO_USERS_WAITING)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Users table' })).toBeNull();
  });

  it('reads nothing without both codes, and says why', async () => {
    setup(['user.approve']);
    await show();

    expect(screen.getByText(USER_APPROVAL_FORBIDDEN)).toBeInTheDocument();
    expect(listUserApprovals).not.toHaveBeenCalled();
  });

  it('tells a 403 from a failure, keeping the reference (never an empty queue)', async () => {
    setup();
    listUserApprovals.mockRejectedValueOnce(new BackendApiError(403, { code: 'forbidden' }));
    const { unmount } = await show();
    expect(screen.getByText("You don't have permission")).toBeInTheDocument();
    expect(screen.queryByText(NO_USERS_WAITING)).toBeNull();
    unmount();

    listUserApprovals.mockRejectedValueOnce(new BackendApiError(503, { requestId: 'req-7' }));
    await show();
    expect(screen.getByText('Reference: req-7')).toBeInTheDocument();
    expect(screen.queryByText(NO_USERS_WAITING)).toBeNull();
  });

  it.each([
    ['a 401', new BackendApiError(401), '/login?reason=session_expired'],
    [
      'a stale context',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      '/select-context',
    ],
  ])('redirects on %s', async (_case, error, to) => {
    setup();
    listUserApprovals.mockRejectedValue(error);
    await expect(show()).rejects.toThrow(`NEXT_REDIRECT:${to}`);
  });

  it('sends a page past the end to the last page, keeping the size', async () => {
    setup();
    listUserApprovals.mockResolvedValue({ ...users(12, 4), items: [] });
    await expect(show({ page: '4', size: '10' })).rejects.toThrow(
      'NEXT_REDIRECT:/admin/approvals/users?page=1&size=10',
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — form U. Expected: FAIL.

- [ ] **Step 3: Implement** — `(queue)/users/page.tsx`:

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentContextProfile } from '@/auth/context-service';
import { canAll } from '@/auth/permissions';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { SectionCard } from '@/components/data-display/section-card';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { load } from '@/lib/api/load';
import { lastPageIfPastEnd, parsePaging } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import {
  NO_USERS_WAITING,
  USER_APPROVAL_FORBIDDEN,
  USER_QUEUE_DESCRIPTION,
} from '@/modules/administration/approvals/approval-copy';
import {
  USER_APPROVAL_CODES,
  USER_QUEUE_HREF,
  USER_QUEUE_LABEL,
} from '@/modules/administration/approvals/approval-rules';
import { listUserApprovals } from '@/modules/administration/approvals/approval-service';
import { UserDirectoryTable } from '@/modules/administration/users/components/user-directory-table';
import { DEFAULT_USER_PAGE_SIZE } from '@/modules/administration/users/user-query';

export const metadata: Metadata = { title: 'User onboarding' };

interface UserOnboardingPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The User onboarding tab (spec §10.6): memberships PENDING_APPROVAL, newest first, paged in the
 * URL. A row whose user is provisioning reads "Provisioning identity" and opens a page with no
 * decision (Ruling 12). */
export default async function UserOnboardingPage({ searchParams }: UserOnboardingPageProps) {
  const params = toSearchParams(await searchParams);
  const selected = await getCurrentContextProfile();
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };
  const card = (content: ReactNode) => (
    <SectionCard title={USER_QUEUE_LABEL} description={USER_QUEUE_DESCRIPTION}>
      {content}
    </SectionCard>
  );
  // A typed URL without the codes: the tab isn't offered, and nothing is read.
  if (!canAll(holder, USER_APPROVAL_CODES)) {
    return card(<ForbiddenState description={USER_APPROVAL_FORBIDDEN} />);
  }

  const users = await load(listUserApprovals(parsePaging(params, DEFAULT_USER_PAGE_SIZE)));
  if (!users.ok) {
    return card(
      users.problem.code === 'forbidden' ? (
        <ForbiddenState />
      ) : (
        <ErrorState problem={users.problem} />
      ),
    );
  }
  const redirectPage = lastPageIfPastEnd(users.value.page);
  if (redirectPage !== null) {
    redirect(
      hrefWith(USER_QUEUE_HREF, params, { page: redirectPage === 0 ? null : String(redirectPage) }),
    );
  }

  return card(
    <>
      {users.value.items.length === 0 ? (
        <EmptyState title={NO_USERS_WAITING} />
      ) : (
        <UserDirectoryTable users={users.value.items} basePath={USER_QUEUE_HREF} />
      )}
      <TablePaginationBar page={users.value.page} />
    </>,
  );
}
```

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs: read before the code check ("reads nothing
      without both codes"); render `EmptyState` on any failure ("tells a 403 from a failure…").

- [ ] **Step 5: Commit** (form C):

```
feat(approvals): list the memberships waiting for approval

The User onboarding tab lists pending memberships newest first, paged in the URL, each opening its
approval page. Someone whose identity is already provisioning is marked so and needs no decision.
A 403, a failed read and an empty queue each say what they are.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

#### Task 6c: Branch activation

**Files:**

- Create: `app/(authenticated)/admin/approvals/(queue)/branches/page.tsx`
- Create: `app/(authenticated)/admin/approvals/(queue)/branches/page.test.tsx`

**Interfaces:**

- Consumes: 08's `BranchDirectoryTable` (`basePath`, `nameMaxWidth`, `sortHref`),
  `BRANCH_SORT_FIELDS`, `DEFAULT_BRANCH_PAGE_SIZE`, `DEFAULT_BRANCH_SORT`;
  `SwitchToAllBranchesButton`; `parseListSort`; `getOrganisationTimeZone`; Task 1a's
  codes; Task 1b's `branchQueueContextNote` and copy; Task 2's `listBranchActivations`.
- Produces: the route `/admin/approvals/branches`.

- [ ] **Step 1: Write the failing test** — `(queue)/branches/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import {
  BRANCH_ACTIVATION_FORBIDDEN,
  branchQueueContextNote,
  NO_BRANCHES_WAITING,
} from '@/modules/administration/approvals/approval-copy';
import { BRANCH_QUEUE_LABEL } from '@/modules/administration/approvals/approval-rules';
import { renderWithProviders } from '@/test/test-utils';

const { getCurrentContextProfile, listBranchActivations, redirect } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  listBranchActivations: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (to: string) => redirect(to) as unknown,
  usePathname: () => '/admin/approvals/branches',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/lib/api/lookups', () => ({
  getOrganisationTimeZone: () => Promise.resolve('Asia/Kolkata'),
}));
vi.mock('@/modules/administration/approvals/approval-service', () => ({
  listBranchActivations: (...args: unknown[]) => listBranchActivations(...args) as unknown,
}));
// The switch reads the shell's application context; its own test covers it.
vi.mock('@/components/context/switch-to-all-branches-button', () => ({
  SwitchToAllBranchesButton: () => <button type="button">Switch to All branches</button>,
}));

const { default: BranchActivationPage } = await import('./page');

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const KERICHO = 'c1000000-0000-4000-8000-0000000000c1';
const WESTLANDS = 'd2000000-0000-4000-8000-0000000000d2';
const HEAD_OFFICE = 'e3000000-0000-4000-8000-0000000000e3';
const CODES = ['branch.activate', 'branch.view'];

function branches(totalItems: number, number = 0) {
  return {
    items:
      totalItems === 0
        ? []
        : [
            {
              id: KERICHO,
              branchCode: 'KERICHO',
              branchName: 'Kericho Branch',
              branchType: 'BRANCH',
              status: 'PENDING_APPROVAL',
              createdAt: '2026-09-10T20:00:00Z',
            },
          ],
    page: {
      number,
      size: 10,
      totalItems,
      totalPages: Math.ceil(totalItems / 10),
      hasNext: false,
      hasPrevious: number > 0,
    },
  };
}

interface Setup {
  permissions?: string[];
  selectedBranch?: { id: string; name: string } | null;
  /** How many ACTIVE branches `/auth/me` lists: All branches needs two. */
  activeBranches?: number;
}

function setup({ permissions = CODES, selectedBranch = null, activeBranches = 2 }: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: {
      permissions,
      branches: [
        { id: WESTLANDS, status: 'ACTIVE' },
        { id: HEAD_OFFICE, status: activeBranches > 1 ? 'ACTIVE' : 'SUSPENDED' },
      ],
    },
    context: { organization: { id: 'org-1', name: 'Greenfield' }, branch: selectedBranch },
  });
}

const show = async (searchParams: Record<string, string> = {}) =>
  renderWithProviders(await BranchActivationPage({ searchParams: Promise.resolve(searchParams) }));

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('BranchActivationPage', () => {
  it('lists pending branches newest first, linking each to its approval page', async () => {
    setup();
    listBranchActivations.mockResolvedValue(branches(1));
    await show();

    expect(listBranchActivations).toHaveBeenCalledExactlyOnceWith({
      page: 0,
      size: 10,
      sort: { by: 'createdAt', dir: 'DESC' },
    });
    const card = screen.getByRole('region', { name: BRANCH_QUEUE_LABEL });
    const table = within(card).getByRole('region', { name: 'Branches table' });
    expect(table).toHaveAttribute('tabindex', '0');
    expect(within(table).getByRole('link', { name: 'Kericho Branch' })).toHaveAttribute(
      'href',
      `/admin/approvals/branches/${KERICHO}`,
    );
    // The organisation's zone, not the runner's: 20:00Z is the next day in Kolkata.
    expect(within(table).getByText('11 Sep 2026')).toBeInTheDocument();
  });

  it('sorts by the URL’s allowed field, and its header links flip the direction within the tab', async () => {
    setup();
    listBranchActivations.mockResolvedValue(branches(1));
    await show({ sortBy: 'branchName', sortDir: 'ASC', page: '0' });

    expect(listBranchActivations).toHaveBeenCalledWith(
      expect.objectContaining({ sort: { by: 'branchName', dir: 'ASC' } }),
    );
    const header = screen.getByRole('link', { name: 'Branch' });
    expect(header).toHaveAttribute(
      'href',
      '/admin/approvals/branches?sortBy=branchName&sortDir=DESC',
    );
  });

  it('names the selected branch and offers All branches when the holder can switch', async () => {
    setup({ selectedBranch: { id: WESTLANDS, name: 'Westlands Branch' } });
    listBranchActivations.mockResolvedValue(branches(1));
    await show();

    expect(screen.getByRole('note')).toHaveTextContent(
      branchQueueContextNote('Westlands Branch', true),
    );
    expect(screen.getByRole('button', { name: 'Switch to All branches' })).toBeInTheDocument();
  });

  it('says to ask an institution-level administrator when the holder can’t switch', async () => {
    setup({ selectedBranch: { id: WESTLANDS, name: 'Westlands Branch' }, activeBranches: 1 });
    listBranchActivations.mockResolvedValue(branches(1));
    await show();

    expect(screen.getByRole('note')).toHaveTextContent(
      branchQueueContextNote('Westlands Branch', false),
    );
    expect(screen.queryByRole('button', { name: 'Switch to All branches' })).toBeNull();
  });

  it('says nothing is waiting, never an empty table', async () => {
    setup();
    listBranchActivations.mockResolvedValue(branches(0));
    await show();

    expect(screen.getByText(NO_BRANCHES_WAITING)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Branches table' })).toBeNull();
  });

  it('reads nothing without both codes, and says why', async () => {
    setup({ permissions: ['branch.activate'] });
    await show();

    expect(screen.getByText(BRANCH_ACTIVATION_FORBIDDEN)).toBeInTheDocument();
    expect(listBranchActivations).not.toHaveBeenCalled();
  });

  it('tells a 403 from a failure, keeping the reference (never an empty queue)', async () => {
    setup();
    listBranchActivations.mockRejectedValueOnce(new BackendApiError(403, { code: 'forbidden' }));
    const { unmount } = await show();
    expect(screen.getByText("You don't have permission")).toBeInTheDocument();
    unmount();

    listBranchActivations.mockRejectedValueOnce(new BackendApiError(500, { requestId: 'req-8' }));
    await show();
    expect(screen.getByText('Reference: req-8')).toBeInTheDocument();
    expect(screen.queryByText(NO_BRANCHES_WAITING)).toBeNull();
  });

  it.each([
    ['a 401', new BackendApiError(401), '/login?reason=session_expired'],
    [
      'a stale context',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      '/select-context',
    ],
  ])('redirects on %s', async (_case, error, to) => {
    setup();
    listBranchActivations.mockRejectedValue(error);
    await expect(show()).rejects.toThrow(`NEXT_REDIRECT:${to}`);
  });

  it.each([
    ['the size', { page: '4', size: '10' }, '?page=1&size=10'],
    [
      'the sort and the size',
      { sortBy: 'branchName', sortDir: 'ASC', page: '4', size: '10' },
      '?sortBy=branchName&sortDir=ASC&page=1&size=10',
    ],
  ])('sends a page past the end to the last page, keeping %s', async (_case, params, query) => {
    setup();
    listBranchActivations.mockResolvedValue({ ...branches(12, 4), items: [] });
    await expect(show(params)).rejects.toThrow(`NEXT_REDIRECT:/admin/approvals/branches${query}`);
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — form U. Expected: FAIL.

- [ ] **Step 3: Implement** — `(queue)/branches/page.tsx`:

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import { getCurrentContextProfile } from '@/auth/context-service';
import { canAll } from '@/auth/permissions';
import { SwitchToAllBranchesButton } from '@/components/context/switch-to-all-branches-button';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { SectionCard } from '@/components/data-display/section-card';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { parseListSort } from '@/lib/api/list-sort';
import { load } from '@/lib/api/load';
import { getOrganisationTimeZone } from '@/lib/api/lookups';
import { lastPageIfPastEnd, parsePaging } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import {
  BRANCH_ACTIVATION_FORBIDDEN,
  BRANCH_QUEUE_DESCRIPTION,
  branchQueueContextNote,
  NO_BRANCHES_WAITING,
} from '@/modules/administration/approvals/approval-copy';
import {
  BRANCH_ACTIVATION_CODES,
  BRANCH_QUEUE_HREF,
  BRANCH_QUEUE_LABEL,
} from '@/modules/administration/approvals/approval-rules';
import { listBranchActivations } from '@/modules/administration/approvals/approval-service';
import { BRANCH_SORT_FIELDS } from '@/modules/administration/branches/branch-contract';
import {
  DEFAULT_BRANCH_PAGE_SIZE,
  DEFAULT_BRANCH_SORT,
} from '@/modules/administration/branches/branch-query';
import { BranchDirectoryTable } from '@/modules/administration/branches/components/branch-directory-table';

export const metadata: Metadata = { title: 'Branch activation' };

/** 10's `NAME_MAX_WIDTH`: a long name's ellipsis stays inside a 375 px card. */
const NAME_MAX_WIDTH = 'min(320px, 60vw)';

interface BranchActivationPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The Branch activation tab (spec §10.6): branches PENDING_APPROVAL, sortable, paged in the URL.
 * The list isn't branch-restricted, but activating needs All branches (BG-03, Ruling 11). */
export default async function BranchActivationPage({ searchParams }: BranchActivationPageProps) {
  const params = toSearchParams(await searchParams);
  const selected = await getCurrentContextProfile();
  const resolved = selected.kind === 'resolved' ? selected : null;
  const holder = { permissions: resolved?.profile.permissions ?? [] };
  const card = (content: ReactNode) => (
    <SectionCard title={BRANCH_QUEUE_LABEL} description={BRANCH_QUEUE_DESCRIPTION}>
      {content}
    </SectionCard>
  );
  if (!canAll(holder, BRANCH_ACTIVATION_CODES)) {
    return card(<ForbiddenState description={BRANCH_ACTIVATION_FORBIDDEN} />);
  }

  const query = {
    ...parsePaging(params, DEFAULT_BRANCH_PAGE_SIZE),
    sort: parseListSort(params, BRANCH_SORT_FIELDS, DEFAULT_BRANCH_SORT),
  };
  const [branches, timeZone] = await Promise.all([
    load(listBranchActivations(query)),
    getOrganisationTimeZone(),
  ]);
  if (!branches.ok) {
    return card(
      branches.problem.code === 'forbidden' ? (
        <ForbiddenState />
      ) : (
        <ErrorState problem={branches.problem} />
      ),
    );
  }
  const redirectPage = lastPageIfPastEnd(branches.value.page);
  if (redirectPage !== null) {
    redirect(
      hrefWith(BRANCH_QUEUE_HREF, params, {
        page: redirectPage === 0 ? null : String(redirectPage),
      }),
    );
  }

  const selectedBranch = resolved?.context.branch ?? null;
  // PF1 (08): /auth/me branches[] can include SUSPENDED ones; All branches needs two ACTIVE.
  const canSwitch =
    (resolved?.profile.branches.filter((entry) => entry.status === 'ACTIVE').length ?? 0) > 1;

  return card(
    <>
      {selectedBranch && (
        <Box sx={{ px: 4, py: 3 }}>
          {/* role="note": a static notice, not an alert announced on every visit. */}
          <Alert severity="info" role="note">
            {branchQueueContextNote(selectedBranch.name, canSwitch)}
            {canSwitch && (
              <Box sx={{ mt: 2, width: 'fit-content' }}>
                <SwitchToAllBranchesButton />
              </Box>
            )}
          </Alert>
        </Box>
      )}
      {branches.value.items.length === 0 ? (
        <EmptyState title={NO_BRANCHES_WAITING} />
      ) : (
        <BranchDirectoryTable
          branches={branches.value.items}
          sort={query.sort}
          timeZone={timeZone}
          basePath={BRANCH_QUEUE_HREF}
          nameMaxWidth={NAME_MAX_WIDTH}
          sortHref={(field) =>
            hrefWith(BRANCH_QUEUE_HREF, params, {
              sortBy: field,
              sortDir: query.sort.by === field && query.sort.dir === 'ASC' ? 'DESC' : 'ASC',
              page: null,
            })
          }
        />
      )}
      <TablePaginationBar page={branches.value.page} />
    </>,
  );
}
```

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs: offer the Switch button without checking
      two ACTIVE branches ("says to ask an institution-level administrator…"); format in the
      runner's zone (`'Africa/Nairobi'`) ("lists pending branches newest first…" fails on
      `11 Sep 2026`); drop the `lastPageIfPastEnd` redirect ("sends a page past the end to the last
      page, keeping the size" and "… the sort and the size").

- [ ] **Step 5: Commit** (form C):

```
feat(approvals): list the branches waiting for activation

The Branch activation tab lists pending branches, sortable by its headers and paged in the URL, each
opening its approval page. With a branch selected it says activation needs All branches and offers
the switch when the signed-in user can make it (BG-03).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

---

### Task 7: The user approval page

Two sub-tasks, each its own commit: **7a** (the page, test-driven on the request, the gating and
the read failures) and **7b** (pinning tests for maker-checker, the outcomes and the checks'
wiring, each with a mutation proof). The page is complete after 7a.

#### Task 7a: The page

**Files:**

- Create: `app/(authenticated)/admin/approvals/users/[userId]/page.tsx`
- Create: `app/(authenticated)/admin/approvals/users/[userId]/page.test.tsx`

**Interfaces:**

- Consumes: `RecordHero`, `SectionCard`, `DescriptionList`, `StatusChip`, `humanizeEnum`,
  `CopyIdButton`, `ErrorState`, `ForbiddenState`, `PageHeader`, `NextLink`, `load`, `Loaded`, the
  lookups, `formatInstant`; 10's `parseUserId`, `findUserMembership`, `getUser`,
  `listUserBranchAssignments`,
  `membershipActionsNote`, `onboardingState`, `userStatusLabel`, `MembershipSummary`; Tasks 1a
  and 1b; Task 1d's `userControlChecks`; Task 2's `getMakerEvent`, `listRequestedRoles`; Task 5a's
  `DecisionBar`; Tasks 5b and 5c's components.
- Produces: the route `/admin/approvals/users/[userId]`.

- [ ] **Step 1: Write the failing test** — `users/[userId]/page.test.tsx` (part 1; 7b appends):

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import { USER_APPROVAL_FORBIDDEN } from '@/modules/administration/approvals/approval-copy';
import { renderWithProviders } from '@/test/test-utils';

const {
  findUserMembership,
  getCurrentContextProfile,
  getMakerEvent,
  getTenantUser,
  getUser,
  listRequestedRoles,
  listUserBranchAssignments,
  redirect,
} = vi.hoisted(() => ({
  findUserMembership: vi.fn(),
  getCurrentContextProfile: vi.fn(),
  getMakerEvent: vi.fn(),
  getTenantUser: vi.fn(),
  getUser: vi.fn(),
  listRequestedRoles: vi.fn(),
  listUserBranchAssignments: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => redirect(to) as unknown,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/lib/api/lookups', () => ({
  // Not the runner's zone (Africa/Nairobi), so only the organisation's can produce these times.
  getOrganisationTimeZone: () => Promise.resolve('Asia/Kolkata'),
  getBranchIndex: () =>
    Promise.resolve(new Map([[WESTLANDS, { name: 'Westlands Branch', code: 'WESTLANDS' }]])),
  getRoleIndex: () =>
    Promise.resolve(new Map([[TELLER, { name: 'Teller', code: 'TELLER', status: 'ACTIVE' }]])),
  getTenantUser: (...args: unknown[]) => getTenantUser(...args) as unknown,
}));
vi.mock('@/modules/administration/approvals/approval-service', () => ({
  getMakerEvent: (...args: unknown[]) => getMakerEvent(...args) as unknown,
  listRequestedRoles: (...args: unknown[]) => listRequestedRoles(...args) as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  findUserMembership: (...args: unknown[]) => findUserMembership(...args) as unknown,
  getUser: (...args: unknown[]) => getUser(...args) as unknown,
  listUserBranchAssignments: (...args: unknown[]) => listUserBranchAssignments(...args) as unknown,
}));
// The decision bar and the assignment tables import Server Actions; nothing here submits one.
vi.mock('@/modules/administration/approvals/approval-actions', () => ({
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
}));
vi.mock('@/modules/administration/approvals/branch-activation-actions', () => ({
  activatePendingBranch: vi.fn(),
}));
vi.mock('@/modules/administration/roles/role-actions', () => ({
  assignRole: vi.fn(),
  revokeRoleAssignment: vi.fn(),
}));
vi.mock('@/modules/administration/branches/branch-actions', () => ({
  assignBranchUser: vi.fn(),
  revokeBranchAssignment: vi.fn(),
}));

const { default: UserApprovalPage } = await import('./page');

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const ME = 'a1000000-0000-4000-8000-0000000000aa';
const ROSE = 'b2000000-0000-4000-8000-0000000000bb';
const VICTOR = 'c3000000-0000-4000-8000-0000000000cc';
const MEMBERSHIP = 'd4000000-0000-4000-8000-0000000000dd';
const WESTLANDS = 'e5000000-0000-4000-8000-0000000000ee';
const TELLER = 'f6000000-0000-4000-8000-0000000000ff';
const ALL_CODES = [
  'user.approve',
  'user.view',
  'membership.view',
  'membership.revoke',
  'audit.view',
  'role_assignment.view',
  'branch_assignment.view',
];

interface Setup {
  permissions?: string[];
  membershipStatus?: string;
  userStatus?: string;
  /** The membership lookup: found, null (missed), or an Error that rejects it. */
  membership?: Record<string, unknown> | null | Error;
  /** The maker read: its actor, null (no event), or an Error that rejects it. */
  maker?: string | null | Error;
  roles?: number | Error;
  rolesHasNext?: boolean;
  branches?: number | Error;
  truncated?: boolean;
  selectedBranch?: { id: string; name: string } | null;
}

function setup({
  permissions = ALL_CODES,
  membershipStatus = 'PENDING_APPROVAL',
  userStatus = 'DRAFT',
  membership = {
    id: MEMBERSHIP,
    userId: ROSE,
    status: 'PENDING_APPROVAL',
    type: 'STAFF',
    primaryBranchId: WESTLANDS,
  },
  maker = VICTOR,
  roles = 1,
  rolesHasNext = false,
  branches = 1,
  truncated = false,
  selectedBranch = null,
}: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { user_id: ME, permissions, branches: [] },
    context: {
      organization: { id: 'org-1', name: 'Greenfield Teachers SACCO' },
      branch: selectedBranch,
    },
  });
  getUser.mockResolvedValue({
    id: ROSE,
    username: 'rose.atieno',
    email: 'rose.atieno@greenfield.example',
    displayName: 'Rose Atieno',
    membershipStatus,
    userStatus,
  });
  if (membership instanceof Error) findUserMembership.mockRejectedValue(membership);
  else findUserMembership.mockResolvedValue(membership);
  if (maker instanceof Error) getMakerEvent.mockRejectedValue(maker);
  else {
    getMakerEvent.mockResolvedValue(
      maker === null ? null : { actorUserId: maker, occurredAt: '2026-09-24T08:00:00Z' },
    );
  }
  getTenantUser.mockImplementation((id: string) =>
    Promise.resolve(
      id.toLowerCase() === ME
        ? { id: ME, displayName: 'Ann Admin', email: 'ann@x.example' }
        : { id: VICTOR, displayName: 'Victor Kamau', email: 'victor@x.example' },
    ),
  );
  if (roles instanceof Error) listRequestedRoles.mockRejectedValue(roles);
  else {
    listRequestedRoles.mockResolvedValue({
      items: Array.from({ length: roles }, (_, n) => ({
        id: `9${n}000000-0000-4000-8000-000000000000`,
        roleId: TELLER,
        scopeType: 'BRANCH',
        branchId: WESTLANDS,
      })),
      page: {
        number: 0,
        size: 100,
        totalItems: roles,
        totalPages: 1,
        hasNext: rolesHasNext,
        hasPrevious: false,
      },
    });
  }
  if (branches instanceof Error) listUserBranchAssignments.mockRejectedValue(branches);
  else {
    listUserBranchAssignments.mockResolvedValue({
      items: Array.from({ length: branches }, (_, n) => ({
        id: `8${n}000000-0000-4000-8000-000000000000`,
        branchId: WESTLANDS,
        assignmentType: 'HOME',
      })),
      truncated,
    });
  }
}

async function show(userId = ROSE) {
  return renderWithProviders(await UserApprovalPage({ params: Promise.resolve({ userId }) }));
}

const card = (name: string) => screen.getByRole('region', { name });
/** The value cell of a description-list row in one card, found by its label. */
function fact(region: HTMLElement, label: string): HTMLElement {
  const value = within(region).getByText(label, { selector: 'dt' }).nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`"${label}" has no value cell`);
  return value;
}
const button = (name: string) => screen.queryByRole('button', { name });

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('UserApprovalPage: the request', () => {
  it('shows who asked and when, in the organisation’s zone, under the page’s one h1', async () => {
    setup();
    await show(ROSE.toUpperCase());

    expect(getUser).toHaveBeenCalledExactlyOnceWith(ROSE);
    expect(getMakerEvent).toHaveBeenCalledExactlyOnceWith('user', ROSE);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Rose Atieno' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to user onboarding' })).toHaveAttribute(
      'href',
      '/admin/approvals/users',
    );
    const request = card('Request');
    expect(fact(request, 'Invited by')).toHaveTextContent('Victor Kamau');
    expect(fact(request, 'Invited (Asia/Kolkata)')).toHaveTextContent('24 Sep 2026 · 13:30');
    expect(within(request).getByRole('link', { name: 'Open the audit trail' })).toHaveAttribute(
      'href',
      `/admin/users/${ROSE}/audit`,
    );
  });

  it('names each section once, and makes both assignment tables keyboard-scrollable regions', async () => {
    setup();
    await show();

    // getByRole throws on a second match, so each name is also checked unique (rule 11).
    expect(screen.getAllByRole('region')).toHaveLength(6);
    for (const name of ['Request', 'Identity', 'Requested access', 'Control checks']) {
      expect(card(name)).toBeInTheDocument();
    }
    for (const name of ['Role assignments', 'Branch assignments table']) {
      expect(screen.getByRole('region', { name })).toHaveAttribute('tabindex', '0');
    }
  });

  it('offers Approve and Reject & revoke while it waits, with every check computed', async () => {
    setup();
    await show();

    expect(button('Approve')).toBeEnabled();
    expect(button('Reject & revoke')).toBeEnabled();
    const checks = card('Control checks');
    expect(fact(checks, 'Invited by someone else')).toHaveTextContent('Passed');
    expect(fact(checks, 'Invited by someone else')).toHaveTextContent('Invited by Victor Kamau.');
    expect(fact(checks, 'Has an active role')).toHaveTextContent('Passed');
    expect(fact(checks, 'Has an active branch assignment')).toHaveTextContent('Passed');
    expect(fact(checks, 'Institution is active')).toHaveTextContent(
      'Greenfield Teachers SACCO is active.',
    );
  });

  it('reads nothing past the profile without both codes, and says why', async () => {
    setup({ permissions: ['user.approve'] });
    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'User approval' })).toBeInTheDocument();
    expect(screen.getByText(USER_APPROVAL_FORBIDDEN)).toBeInTheDocument();
    expect(getUser).not.toHaveBeenCalled();
  });

  it.each([
    ['a 403', new BackendApiError(403, { code: 'forbidden' }), "You don't have permission"],
    ['a 5xx', new BackendApiError(503, { requestId: 'req-6' }), 'Reference: req-6'],
  ])('tells %s on the user read apart, under the page h1', async (_case, error, text) => {
    setup();
    getUser.mockRejectedValue(error);
    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'User approval' })).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(button('Approve')).toBeNull();
  });

  it('answers a user the backend can’t find with not-found', async () => {
    setup();
    getUser.mockRejectedValue(new BackendApiError(404, { code: 'resource_not_found' }));
    await expect(show()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — form U. Expected: FAIL.

- [ ] **Step 3: Implement** — `users/[userId]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can, canAll } from '@/auth/permissions';
import { CopyIdButton } from '@/components/data-display/copy-id-button';
import { DescriptionList } from '@/components/data-display/description-list';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { RecordHero } from '@/components/data-display/record-hero';
import { SectionCard } from '@/components/data-display/section-card';
import { humanizeEnum, StatusChip } from '@/components/data-display/status-chip';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';
import { load, type Loaded } from '@/lib/api/load';
import {
  getBranchIndex,
  getOrganisationTimeZone,
  getRoleIndex,
  getTenantUser,
} from '@/lib/api/lookups';
import { formatInstant } from '@/lib/format';
import {
  userControlChecks,
  type CheckRead,
  type MakerFact,
} from '@/modules/administration/approvals/approval-checks';
import {
  CHECKS_DESCRIPTION,
  REQUEST_DESCRIPTION,
  USER_APPROVAL_EYEBROW,
  USER_APPROVAL_FORBIDDEN,
  USER_REQUEST,
} from '@/modules/administration/approvals/approval-copy';
import {
  availableUserDecisions,
  blockedUserDecisions,
  isSameUser,
  USER_APPROVAL_CODES,
  USER_QUEUE_HREF,
  userApprovalState,
  userOutcomeNote,
} from '@/modules/administration/approvals/approval-rules';
import {
  getMakerEvent,
  listRequestedRoles,
} from '@/modules/administration/approvals/approval-service';
import { ControlChecks } from '@/modules/administration/approvals/components/control-checks';
import { DecisionBar } from '@/modules/administration/approvals/components/decision-bar';
import { MakerValue } from '@/modules/administration/approvals/components/request-facts';
import { RequestedAccess } from '@/modules/administration/approvals/components/requested-access';
import type { MembershipSummary } from '@/modules/administration/users/user-contract';
import {
  membershipActionsNote,
  onboardingState,
  parseUserId,
  userStatusLabel,
} from '@/modules/administration/users/user-rules';
import {
  findUserMembership,
  getUser,
  listUserBranchAssignments,
} from '@/modules/administration/users/user-service';

export const metadata: Metadata = { title: 'User approval' };

interface UserApprovalPageProps {
  params: Promise<{ userId: string }>;
}

/** 10's membership lookup outcome (its Ruling 7): a miss within the ceiling isn't a failure. */
function lookupOutcome(
  membership: Loaded<MembershipSummary | null> | null,
): 'found' | 'missing' | 'failed' {
  if (membership?.ok === false) return 'failed';
  return membership?.value ? 'found' : 'missing';
}

/** A user's onboarding approval (spec §10.6): the request, the person, the access they get, the
 * control checks, and the decision bar (Rulings 5–8, 10, 12). */
export default async function UserApprovalPage({ params }: UserApprovalPageProps) {
  // Rule 7: the id is checked, and canonicalised, before any read (10's parser).
  const userId = parseUserId((await params).userId);
  if (!userId) notFound();

  const selected = await getCurrentContextProfile();
  const resolved = selected.kind === 'resolved' ? selected : null;
  const holder = { permissions: resolved?.profile.permissions ?? [] };
  const failure = (content: ReactNode) => (
    <>
      <PageHeader eyebrow={USER_APPROVAL_EYEBROW} title="User approval" />
      <Paper>{content}</Paper>
    </>
  );
  if (!resolved || !canAll(holder, USER_APPROVAL_CODES)) {
    return failure(<ForbiddenState description={USER_APPROVAL_FORBIDDEN} />);
  }

  const user = await load(getUser(userId));
  if (!user.ok) {
    if (user.problem.code === 'resource_not_found') notFound();
    return failure(
      user.problem.code === 'forbidden' ? (
        <ForbiddenState />
      ) : (
        <ErrorState problem={user.problem} />
      ),
    );
  }

  const record = user.value;
  // The backend's ids, never the URL's (Ruling 5): `record.id` for every read, `/auth/me`'s for me.
  const me = resolved.profile.user_id;
  const selectedBranch = resolved.context.branch;
  const state = userApprovalState(record.membershipStatus, record.userStatus);
  // Each read only with its own code; load() redirects on a lost session or a stale context, and
  // any other failure is shown where its fact would be (rule 9).
  const [membership, maker, roles, scan, roleIndex, branchIndex, timeZone] = await Promise.all([
    can(holder, 'membership.view') ? load(findUserMembership(record.id, record.email)) : null,
    can(holder, 'audit.view') ? load(getMakerEvent('user', record.id)) : null,
    can(holder, 'role_assignment.view') ? load(listRequestedRoles(record.id)) : null,
    can(holder, 'branch_assignment.view') ? load(listUserBranchAssignments(record.id)) : null,
    getRoleIndex(), // empty without role.view: names fall back to short ids
    getBranchIndex(), // empty without branch.view: names fall back to short ids
    getOrganisationTimeZone(),
  ]);
  const actor = maker?.ok ? (maker.value?.actorUserId ?? null) : null;
  // One cached lookup; an unreadable user falls back to the short id.
  const makerName = actor ? ((await getTenantUser(actor))?.displayName ?? null) : null;

  const membershipId = membership?.ok ? (membership.value?.id ?? null) : null;
  const decisions = membershipId ? availableUserDecisions(state, holder) : [];
  const blocked = blockedUserDecisions(decisions, {
    state,
    userStatus: record.userStatus,
    invitedByMe: isSameUser(actor, me),
  });
  const outcome = userOutcomeNote(state, record.membershipStatus);
  const note = outcome === null ? membershipActionsNote(holder, lookupOutcome(membership)) : null;
  const onboarding = onboardingState(record.membershipStatus, record.userStatus);
  const invitedAt =
    maker?.ok && maker.value ? formatInstant(maker.value.occurredAt, timeZone) : null;
  const makerFact: CheckRead<MakerFact | null> =
    maker === null
      ? null
      : maker.ok
        ? { ok: true, value: maker.value ? { actorUserId: actor, name: makerName } : null }
        : maker;

  return (
    <>
      <RecordHero
        back={{ href: USER_QUEUE_HREF, label: 'Back to user onboarding' }}
        avatar={{ kind: 'person', name: record.displayName }}
        eyebrow={USER_APPROVAL_EYEBROW}
        title={record.displayName}
        subtitle={`${record.username} · ${record.email}`}
        status={
          <>
            <StatusChip value={onboarding.key} label={onboarding.label} tone={onboarding.tone} />
            <StatusChip
              value={record.membershipStatus}
              label={`Membership ${humanizeEnum(record.membershipStatus).toLowerCase()}`}
            />
          </>
        }
        actions={
          // Undefined, not an empty component: RecordHero renders its actions box when truthy.
          decisions.length > 0 || note ? (
            <DecisionBar
              subject={{ kind: 'membership', membershipId }}
              name={record.displayName}
              decisions={decisions}
              blocked={blocked}
              note={note}
              contextOrganisationId={resolved.context.organization.id}
            />
          ) : undefined
        }
      />
      <Box sx={{ display: 'grid', gap: 3, mt: 4 }}>
        {outcome && (
          <Alert severity="info" role="note">
            {outcome}{' '}
            <Link component={NextLink} href={`/admin/users/${record.id}`}>
              Open their user record
            </Link>
          </Alert>
        )}
        <SectionCard
          title="Request"
          description={REQUEST_DESCRIPTION}
          actions={
            can(holder, 'audit.view') ? (
              <Link component={NextLink} href={`/admin/users/${record.id}/audit`}>
                Open the audit trail
              </Link>
            ) : undefined
          }
        >
          <DescriptionList
            items={[
              { label: 'Request', value: USER_REQUEST },
              { label: 'Institution', value: resolved.context.organization.name },
              { label: 'Invited by', value: <MakerValue maker={maker} name={makerName} me={me} /> },
              {
                label: `Invited (${timeZone})`,
                value: invitedAt ? `${invitedAt.date} · ${invitedAt.time}` : '—',
              },
            ]}
          />
        </SectionCard>
        <SectionCard title="Identity">
          <DescriptionList
            items={[
              { label: 'Display name', value: record.displayName },
              { label: 'Username', value: record.username },
              { label: 'Email', value: record.email },
              {
                label: 'Account status',
                value: (
                  <StatusChip
                    value={record.userStatus}
                    label={userStatusLabel(record.userStatus)}
                  />
                ),
              },
              { label: 'User ID', value: <CopyIdButton value={record.id} label="User ID" /> },
            ]}
          />
        </SectionCard>
        <RequestedAccess
          userName={record.displayName}
          membership={membership}
          roles={roles}
          scan={scan}
          roleIndex={roleIndex}
          branchIndex={branchIndex}
          selectedBranch={selectedBranch}
          canSwitch={
            resolved.profile.branches.filter((entry) => entry.status === 'ACTIVE').length > 1
          }
        />
        {(state === 'awaiting' || state === 'blocked') && (
          <SectionCard title="Control checks" description={CHECKS_DESCRIPTION}>
            <ControlChecks
              checks={userControlChecks({
                maker: makerFact,
                me,
                roles:
                  roles === null
                    ? null
                    : roles.ok
                      ? { ok: true, value: roles.value.items.length }
                      : roles,
                // A capped scan, or one a selected branch narrowed, can't prove "none" (rule 9).
                branches:
                  scan === null
                    ? null
                    : scan.ok
                      ? {
                          ok: true,
                          value: {
                            count: scan.value.items.length,
                            complete: !scan.value.truncated && selectedBranch === null,
                          },
                        }
                      : scan,
                membershipType: membership?.ok ? (membership.value?.type ?? null) : null,
                organisationName: resolved.context.organization.name,
              })}
            />
          </SectionCard>
        )}
      </Box>
    </>
  );
}
```

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs (each fails the named test; revert): read
      with the URL's id as typed (`getUser((await params).userId)`) ("shows who asked and when…"
      fails on the lower-cased id); drop the `canAll(holder, USER_APPROVAL_CODES)` gate ("reads
      nothing past the profile without both codes"); render `ErrorState` for a 404 instead of
      `notFound()` ("answers a user the backend can't find with not-found").

- [ ] **Step 5: Commit** (form C):

```
feat(approvals): add the user approval page

A pending membership's approval page: who invited them and when (in the organisation's time zone),
the person, the access they get once approved, the control checks, and the decision bar. Every
read is gated on its own permission and settled so that a lost session or a stale context
redirects and any other failure is shown where its fact would be. The id is checked and lower-cased
before any read.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

#### Task 7b: Maker-checker, outcomes and the checks' wiring

**Files:**

- Modify: `app/(authenticated)/admin/approvals/users/[userId]/page.test.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Add the imports** — 7a's single `USER_APPROVAL_FORBIDDEN` import (after the
      `BackendApiError` import) becomes:

```tsx
import { VERIFIED_ON_APPROVAL } from '@/modules/administration/approvals/approval-checks';
import {
  MAKER_NOT_PERMITTED,
  READ_FAILED,
  USER_APPROVAL_FORBIDDEN,
} from '@/modules/administration/approvals/approval-copy';
import {
  accountBlockedNote,
  NO_MEMBERSHIP_VIEW,
  PROVISIONING_NOTE,
  USER_MAKER_CHECKER_BLOCKED,
} from '@/modules/administration/users/user-rules';
```

- [ ] **Step 2: Append the tests** at the end of the file:

```tsx
const without = (...codes: string[]) => ALL_CODES.filter((code) => !codes.includes(code));

describe('UserApprovalPage: maker-checker (Ruling 5)', () => {
  it('disables Approve for its inviter, matched case-insensitively, and marks them as you', async () => {
    setup({ maker: ME.toUpperCase() });
    await show();

    expect(button('Approve')).toBeDisabled();
    expect(button('Approve')).toHaveAccessibleDescription(USER_MAKER_CHECKER_BLOCKED);
    expect(button('Reject & revoke')).toBeEnabled();
    expect(fact(card('Request'), 'Invited by')).toHaveTextContent('Ann Admin (you)');
    expect(fact(card('Control checks'), 'Invited by someone else')).toHaveTextContent('Not met');
  });

  it.each([
    ['a 401', new BackendApiError(401), '/login?reason=session_expired'],
    [
      'a stale context',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      '/select-context',
    ],
  ])('redirects, rendering nothing, when the maker read finds %s', async (_case, error, to) => {
    setup({ maker: error });
    await expect(show()).rejects.toThrow(`NEXT_REDIRECT:${to}`);
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a 403', new BackendApiError(403, { code: 'forbidden', requestId: 'req-4' })],
    ['a 5xx', new BackendApiError(500, { requestId: 'req-4' })],
  ])(
    'leaves Approve on offer, verified by the platform, when the maker read fails with %s',
    async (_case, error) => {
      setup({ maker: error });
      await show();

      expect(button('Approve')).toBeEnabled();
      expect(fact(card('Request'), 'Invited by')).toHaveTextContent(READ_FAILED);
      expect(fact(card('Request'), 'Invited by')).toHaveTextContent('Reference: req-4');
      const check = fact(card('Control checks'), 'Invited by someone else');
      expect(check).toHaveTextContent('Checked on approval');
      expect(check).toHaveTextContent(VERIFIED_ON_APPROVAL);
      expect(check).toHaveTextContent('Reference: req-4');
    },
  );

  it('reads no maker without audit.view, and says the platform verifies it', async () => {
    setup({ permissions: without('audit.view') });
    await show();

    expect(getMakerEvent).not.toHaveBeenCalled();
    expect(button('Approve')).toBeEnabled();
    expect(fact(card('Request'), 'Invited by')).toHaveTextContent(MAKER_NOT_PERMITTED);
    expect(screen.queryByRole('link', { name: 'Open the audit trail' })).toBeNull();
    expect(fact(card('Control checks'), 'Invited by someone else')).toHaveTextContent(
      VERIFIED_ON_APPROVAL,
    );
  });
});

describe('UserApprovalPage: where the request stands (Rulings 7, 12)', () => {
  it('offers no decision while their identity is provisioning, and says why', async () => {
    setup({ userStatus: 'PROVISIONING_IDP' });
    await show();

    expect(button('Approve')).toBeNull();
    expect(button('Reject & revoke')).toBeNull();
    expect(screen.getByRole('note')).toHaveTextContent(PROVISIONING_NOTE);
    expect(screen.getByRole('link', { name: 'Open their user record' })).toHaveAttribute(
      'href',
      `/admin/users/${ROSE}`,
    );
    expect(screen.queryByRole('region', { name: 'Control checks' })).toBeNull();
  });

  it('offers no decision once decided', async () => {
    setup({ membershipStatus: 'ACTIVE', userStatus: 'ACTIVE' });
    await show();

    expect(button('Approve')).toBeNull();
    expect(screen.getByRole('note')).toHaveTextContent('Approved: this membership is active.');
  });

  it('disables Approve for a blocked account, keeping Reject & revoke', async () => {
    setup({ userStatus: 'SUSPENDED' });
    await show();

    expect(button('Approve')).toBeDisabled();
    expect(button('Approve')).toHaveAccessibleDescription(accountBlockedNote('SUSPENDED'));
    expect(button('Reject & revoke')).toBeEnabled();
  });

  it('offers no decision without membership.view, and says so', async () => {
    setup({ permissions: without('membership.view') });
    await show();

    expect(findUserMembership).not.toHaveBeenCalled();
    expect(button('Approve')).toBeNull();
    expect(screen.getByText(NO_MEMBERSHIP_VIEW)).toBeInTheDocument();
    expect(fact(card('Control checks'), 'Has an active branch assignment')).toHaveTextContent(
      'Checked on approval',
    );
  });
});

describe('UserApprovalPage: the control checks read the page’s reads (Ruling 7)', () => {
  it('fails the role check when they hold none', async () => {
    setup({ roles: 0 });
    await show();

    expect(fact(card('Control checks'), 'Has an active role')).toHaveTextContent('Not met');
  });

  it('leaves the role check to the platform when the read failed, with Approve on offer', async () => {
    setup({ roles: new BackendApiError(503, { requestId: 'req-5' }) });
    await show();

    const check = fact(card('Control checks'), 'Has an active role');
    expect(check).toHaveTextContent('Checked on approval');
    expect(check).toHaveTextContent('Reference: req-5');
    expect(button('Approve')).toBeEnabled();
  });

  it('fails the branch check for a staff member only when a complete scan found none', async () => {
    setup({ branches: 0 });
    await show();

    expect(fact(card('Control checks'), 'Has an active branch assignment')).toHaveTextContent(
      'Not met',
    );
  });

  it.each([
    ['a capped scan', { truncated: true }],
    ['a selected branch', { selectedBranch: { id: WESTLANDS, name: 'Westlands Branch' } }],
  ])('never proves "none" from %s (rule 9)', async (_case, overrides) => {
    setup({ branches: 0, ...overrides });
    await show();

    expect(fact(card('Control checks'), 'Has an active branch assignment')).toHaveTextContent(
      'Checked on approval',
    );
  });

  it('marks the branch check not required for an auditor', async () => {
    setup({
      branches: 0,
      membership: {
        id: MEMBERSHIP,
        userId: ROSE,
        status: 'PENDING_APPROVAL',
        type: 'AUDITOR',
        primaryBranchId: null,
      },
    });
    await show();

    expect(fact(card('Control checks'), 'Has an active branch assignment')).toHaveTextContent(
      'Not required',
    );
  });
});
```

- [ ] **Step 3: Run** — form U: PASS (they pin 7a's page). Mutation proofs (each must fail the
      named test; revert): compare `actor === me` instead of `isSameUser` ("disables Approve for its
      inviter, matched case-insensitively…"); settle the maker read with
      `getMakerEvent(…).catch(() => null)` instead of `load()` ("redirects, rendering nothing, when
      the maker read finds a 401"); drop `&& selectedBranch === null` from `complete` ("never proves
      'none' from a selected branch"); offer decisions for `state === 'provisioning'` ("offers no
      decision while their identity is provisioning").

- [ ] **Step 4: Commit** (form C):

```
test(approvals): pin the user approval page's maker-checker, outcomes and checks

Approve is disabled for its inviter whatever the id's letter case, and for a blocked account;
a lost session or a stale context on the maker read redirects, while a 403 or 5xx leaves Approve
on offer with the check left to the platform. A provisioning or decided request offers no decision
and says why, and the control checks never prove "none" from a capped scan or a selected branch.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

---

### Task 8: The branch approval page and the id guard

Two sub-tasks, each its own commit: **8a** (the page) and **8b** (the id guard over both detail
routes, which needs both pages).

#### Task 8a: The branch approval page

**Files:**

- Create: `app/(authenticated)/admin/approvals/branches/[branchId]/page.tsx`
- Create: `app/(authenticated)/admin/approvals/branches/[branchId]/page.test.tsx`

**Interfaces:**

- Consumes: as Task 7a, plus 08's `getBranch`, `branchTypeLabel`, `BranchContextState`; 17's
  client-safe `parseBranchId` (`institution-branch-rules.ts`), in place of 10's `parseUserId`;
  Task 1d's `branchControlChecks`.
- Produces: the route `/admin/approvals/branches/[branchId]`.

- [ ] **Step 1: Write the failing test** — `branches/[branchId]/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import { ALL_BRANCHES_UNAVAILABLE } from '@/components/context/all-branches-copy';
import { VERIFIED_ON_APPROVAL } from '@/modules/administration/approvals/approval-checks';
import {
  BRANCH_ACTIVATION_FORBIDDEN,
  MAKER_NOT_PERMITTED,
} from '@/modules/administration/approvals/approval-copy';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import { renderWithProviders } from '@/test/test-utils';

const { getBranch, getCurrentContextProfile, getMakerEvent, redirect } = vi.hoisted(() => ({
  getBranch: vi.fn(),
  getCurrentContextProfile: vi.fn(),
  getMakerEvent: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => redirect(to) as unknown,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/lib/api/lookups', () => ({
  getOrganisationTimeZone: () => Promise.resolve('Asia/Kolkata'),
  getBranchIndex: () =>
    Promise.resolve(new Map([[HEAD_OFFICE, { name: 'Head Office', code: 'HQ' }]])),
  getTenantUser: (id: string) =>
    Promise.resolve(
      id.toLowerCase() === ME
        ? { id: ME, displayName: 'Ann Admin', email: 'ann@x.example' }
        : { id: VICTOR, displayName: 'Victor Kamau', email: 'victor@x.example' },
    ),
}));
vi.mock('@/modules/administration/approvals/approval-service', () => ({
  getMakerEvent: (...args: unknown[]) => getMakerEvent(...args) as unknown,
}));
vi.mock('@/modules/administration/branches/branch-service', () => ({
  getBranch: (...args: unknown[]) => getBranch(...args) as unknown,
}));
vi.mock('@/modules/administration/approvals/approval-actions', () => ({
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
}));
vi.mock('@/modules/administration/approvals/branch-activation-actions', () => ({
  activatePendingBranch: vi.fn(),
}));
// The switch reads the shell's application context; its own test covers it.
vi.mock('@/components/context/switch-to-all-branches-button', () => ({
  SwitchToAllBranchesButton: () => <button type="button">Switch to All branches</button>,
}));

const { default: BranchApprovalPage } = await import('./page');

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const ME = 'a1000000-0000-4000-8000-0000000000aa';
const KERICHO = 'b2000000-0000-4000-8000-0000000000bb';
const VICTOR = 'c3000000-0000-4000-8000-0000000000cc';
const HEAD_OFFICE = 'd4000000-0000-4000-8000-0000000000dd';
const WESTLANDS = 'e5000000-0000-4000-8000-0000000000ee';
const ALL_CODES = ['branch.activate', 'branch.view', 'audit.view'];

interface Setup {
  permissions?: string[];
  status?: string;
  maker?: string | null | Error;
  selectedBranch?: { id: string; name: string } | null;
  activeBranches?: number;
}

function setup({
  permissions = ALL_CODES,
  status = 'PENDING_APPROVAL',
  maker = VICTOR,
  selectedBranch = null,
  activeBranches = 2,
}: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: {
      user_id: ME,
      permissions,
      branches: [
        { id: WESTLANDS, status: 'ACTIVE' },
        { id: HEAD_OFFICE, status: activeBranches > 1 ? 'ACTIVE' : 'SUSPENDED' },
      ],
    },
    context: {
      organization: { id: 'org-1', name: 'Greenfield Teachers SACCO' },
      branch: selectedBranch,
    },
  });
  getBranch.mockResolvedValue({
    id: KERICHO,
    branchCode: 'KERICHO',
    branchName: 'Kericho Branch',
    branchType: 'BRANCH',
    parentBranchId: HEAD_OFFICE,
    status,
    timezone: 'Africa/Nairobi',
    openedOn: null,
    closedOn: null,
    statusReason: null,
    createdAt: '2026-09-10T08:00:00Z',
    updatedAt: '2026-09-10T08:00:00Z',
  });
  if (maker instanceof Error) getMakerEvent.mockRejectedValue(maker);
  else {
    getMakerEvent.mockResolvedValue(
      maker === null ? null : { actorUserId: maker, occurredAt: '2026-09-10T08:00:00Z' },
    );
  }
}

async function show(branchId = KERICHO) {
  return renderWithProviders(await BranchApprovalPage({ params: Promise.resolve({ branchId }) }));
}

const card = (name: string) => screen.getByRole('region', { name });
function fact(region: HTMLElement, label: string): HTMLElement {
  const value = within(region).getByText(label, { selector: 'dt' }).nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`"${label}" has no value cell`);
  return value;
}
const activate = () => screen.queryByRole('button', { name: 'Activate' });

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('BranchApprovalPage', () => {
  it('shows the request and the branch under one h1, with Activate on offer at All branches', async () => {
    setup();
    await show(KERICHO.toUpperCase());

    expect(getBranch).toHaveBeenCalledExactlyOnceWith(KERICHO);
    expect(getMakerEvent).toHaveBeenCalledExactlyOnceWith('branch', KERICHO);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Kericho Branch' })).toBeInTheDocument();
    expect(screen.getAllByRole('region')).toHaveLength(3);
    expect(fact(card('Request'), 'Drafted by')).toHaveTextContent('Victor Kamau');
    expect(fact(card('Request'), 'Drafted (Asia/Kolkata)')).toHaveTextContent(
      '10 Sep 2026 · 13:30',
    );
    expect(fact(card('Branch'), 'Parent branch')).toHaveTextContent('Head Office');
    expect(activate()).toBeEnabled();
    expect(fact(card('Control checks'), 'Drafted by someone else')).toHaveTextContent('Passed');
  });

  it('disables Activate for its drafter, matched case-insensitively', async () => {
    setup({ maker: ME.toUpperCase() });
    await show();

    expect(activate()).toBeDisabled();
    expect(activate()).toHaveAccessibleDescription(MAKER_CHECKER_BLOCKED);
    expect(fact(card('Request'), 'Drafted by')).toHaveTextContent('Ann Admin (you)');
  });

  it.each([
    ['a 401', new BackendApiError(401), '/login?reason=session_expired'],
    [
      'a stale context',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      '/select-context',
    ],
  ])('redirects, rendering nothing, when the maker read finds %s', async (_case, error, to) => {
    setup({ maker: error });
    await expect(show()).rejects.toThrow(`NEXT_REDIRECT:${to}`);
  });

  it.each([
    ['a 403', new BackendApiError(403, { code: 'forbidden', requestId: 'req-2' })],
    ['a 5xx', new BackendApiError(502, { requestId: 'req-2' })],
  ])(
    'leaves Activate on offer, verified by the platform, when the maker read fails with %s',
    async (_case, error) => {
      setup({ maker: error });
      await show();

      expect(activate()).toBeEnabled();
      const check = fact(card('Control checks'), 'Drafted by someone else');
      expect(check).toHaveTextContent(VERIFIED_ON_APPROVAL);
      expect(check).toHaveTextContent('Reference: req-2');
    },
  );

  it('reads no maker without audit.view', async () => {
    setup({ permissions: ['branch.activate', 'branch.view'] });
    await show();

    expect(getMakerEvent).not.toHaveBeenCalled();
    expect(fact(card('Request'), 'Drafted by')).toHaveTextContent(MAKER_NOT_PERMITTED);
    expect(activate()).toBeEnabled();
  });

  it('offers no decision once decided, and links to the branch record', async () => {
    setup({ status: 'ACTIVE' });
    await show();

    expect(activate()).toBeNull();
    expect(screen.getByRole('note')).toHaveTextContent('Activated: this branch is live.');
    expect(screen.getByRole('link', { name: 'Open the branch record' })).toHaveAttribute(
      'href',
      `/admin/branches/${KERICHO}`,
    );
    expect(screen.queryByRole('region', { name: 'Control checks' })).toBeNull();
  });

  it('never offers Activate with a branch selected (BG-03)', async () => {
    setup({ selectedBranch: { id: WESTLANDS, name: 'Westlands Branch' } });
    await show();

    expect(activate()).toBeNull();
  });

  it.each([
    [2, 'Switch to All branches to manage this branch'],
    [1, ALL_BRANCHES_UNAVAILABLE],
  ])(
    'guides a branch context the backend hides it from (%i active branches)',
    async (activeBranches, text) => {
      setup({ selectedBranch: { id: WESTLANDS, name: 'Westlands Branch' }, activeBranches });
      getBranch.mockRejectedValue(new BackendApiError(404, { code: 'resource_not_found' }));
      await show();

      expect(
        screen.getByRole('heading', { level: 1, name: 'Branch not available here' }),
      ).toBeInTheDocument();
      expect(screen.getByText(text)).toBeInTheDocument();
    },
  );

  it('answers a branch the backend can’t find at All branches with not-found', async () => {
    setup();
    getBranch.mockRejectedValue(new BackendApiError(404, { code: 'resource_not_found' }));
    await expect(show()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it.each([
    ['a 403', new BackendApiError(403, { code: 'forbidden' }), "You don't have permission"],
    ['a 5xx', new BackendApiError(500, { requestId: 'req-3' }), 'Reference: req-3'],
  ])('tells %s on the branch read apart, under the page h1', async (_case, error, text) => {
    setup();
    getBranch.mockRejectedValue(error);
    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Branch approval' })).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('reads nothing past the profile without both codes, and says why', async () => {
    setup({ permissions: ['branch.activate'] });
    await show();

    expect(screen.getByText(BRANCH_ACTIVATION_FORBIDDEN)).toBeInTheDocument();
    expect(getBranch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — form U. Expected: FAIL.

- [ ] **Step 3: Implement** — `branches/[branchId]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can, canAll } from '@/auth/permissions';
import { CopyIdButton } from '@/components/data-display/copy-id-button';
import { DescriptionList } from '@/components/data-display/description-list';
import { ErrorState } from '@/components/data-display/error-state';
import { BranchContextState, ForbiddenState } from '@/components/data-display/forbidden-state';
import { RecordHero } from '@/components/data-display/record-hero';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { getBranchIndex, getOrganisationTimeZone, getTenantUser } from '@/lib/api/lookups';
import { formatInstant, shortId } from '@/lib/format';
import {
  branchControlChecks,
  type CheckRead,
  type MakerFact,
} from '@/modules/administration/approvals/approval-checks';
import {
  BRANCH_ACTIVATION_FORBIDDEN,
  BRANCH_APPROVAL_EYEBROW,
  BRANCH_REQUEST,
  CHECKS_DESCRIPTION,
  REQUEST_DESCRIPTION,
} from '@/modules/administration/approvals/approval-copy';
import {
  availableBranchDecisions,
  blockedBranchDecisions,
  BRANCH_ACTIVATION_CODES,
  BRANCH_QUEUE_HREF,
  branchOutcomeNote,
  isSameUser,
} from '@/modules/administration/approvals/approval-rules';
import { getMakerEvent } from '@/modules/administration/approvals/approval-service';
import { ControlChecks } from '@/modules/administration/approvals/components/control-checks';
import { DecisionBar } from '@/modules/administration/approvals/components/decision-bar';
import { MakerValue } from '@/modules/administration/approvals/components/request-facts';
import { branchTypeLabel } from '@/modules/administration/branches/branch-rules';
import { getBranch } from '@/modules/administration/branches/branch-service';
import { parseBranchId } from '@/modules/platform-administration/branches/institution-branch-rules';

export const metadata: Metadata = { title: 'Branch approval' };

interface BranchApprovalPageProps {
  params: Promise<{ branchId: string }>;
}

/** A branch activation request (spec §10.6): the request, the branch, the control checks and the
 * decision bar (Activate). A branch context can't reach a pending branch (BG-03, Ruling 11). */
export default async function BranchApprovalPage({ params }: BranchApprovalPageProps) {
  // Rule 7: the id is checked, and canonicalised, before any read (17's parser, client-safe).
  const branchId = parseBranchId((await params).branchId);
  if (!branchId) notFound();

  const selected = await getCurrentContextProfile();
  const resolved = selected.kind === 'resolved' ? selected : null;
  const holder = { permissions: resolved?.profile.permissions ?? [] };
  const failure = (title: string, content: ReactNode) => (
    <>
      <PageHeader eyebrow={BRANCH_APPROVAL_EYEBROW} title={title} />
      <Paper>{content}</Paper>
    </>
  );
  if (!resolved || !canAll(holder, BRANCH_ACTIVATION_CODES)) {
    return failure('Branch approval', <ForbiddenState description={BRANCH_ACTIVATION_FORBIDDEN} />);
  }

  const branch = await load(getBranch(branchId));
  if (!branch.ok) {
    const missing = branch.problem.code === 'resource_not_found';
    // Spec §6.5 / BG-03: with a branch selected every other branch is a 404, so guide instead.
    if (missing && resolved.context.branch) {
      return failure(
        'Branch not available here',
        <BranchContextState
          // PF1 (08): /auth/me branches[] can include SUSPENDED ones; All branches needs two ACTIVE.
          allBranchesAvailable={
            resolved.profile.branches.filter((entry) => entry.status === 'ACTIVE').length > 1
          }
        />,
      );
    }
    if (missing) notFound();
    return failure(
      'Branch approval',
      branch.problem.code === 'forbidden' ? (
        <ForbiddenState />
      ) : (
        <ErrorState problem={branch.problem} />
      ),
    );
  }

  const record = branch.value;
  // The backend's ids, never the URL's (Ruling 5).
  const me = resolved.profile.user_id;
  const [maker, branchIndex, timeZone] = await Promise.all([
    can(holder, 'audit.view') ? load(getMakerEvent('branch', record.id)) : null,
    getBranchIndex(), // empty without branch.view: the parent falls back to its short id
    getOrganisationTimeZone(),
  ]);
  const actor = maker?.ok ? (maker.value?.actorUserId ?? null) : null;
  const makerName = actor ? ((await getTenantUser(actor))?.displayName ?? null) : null;
  // A selected branch can only be the record itself here, and it is never pending (§E.4).
  const decisions =
    resolved.context.branch === null ? availableBranchDecisions(record.status, holder) : [];
  const blocked = blockedBranchDecisions(decisions, { draftedByMe: isSameUser(actor, me) });
  const outcome = branchOutcomeNote(record.status);
  const at = (iso: string) => {
    const when = formatInstant(iso, timeZone);
    return `${when.date} · ${when.time}`;
  };
  const makerFact: CheckRead<MakerFact | null> =
    maker === null
      ? null
      : maker.ok
        ? { ok: true, value: maker.value ? { actorUserId: actor, name: makerName } : null }
        : maker;

  return (
    <>
      <RecordHero
        back={{ href: BRANCH_QUEUE_HREF, label: 'Back to branch activation' }}
        avatar={{ kind: 'icon', icon: <AccountTreeOutlined /> }}
        eyebrow={BRANCH_APPROVAL_EYEBROW}
        title={record.branchName}
        subtitle={`${record.branchCode} · ${branchTypeLabel(record.branchType)}`}
        status={<StatusChip value={record.status} />}
        actions={
          decisions.length > 0 ? (
            <DecisionBar
              subject={{ kind: 'branch', branchId: record.id }}
              name={record.branchName}
              decisions={decisions}
              blocked={blocked}
              note={null}
              contextOrganisationId={resolved.context.organization.id}
            />
          ) : undefined
        }
      />
      <Box sx={{ display: 'grid', gap: 3, mt: 4 }}>
        {outcome && (
          <Alert severity="info" role="note">
            {outcome}{' '}
            <Link component={NextLink} href={`/admin/branches/${record.id}`}>
              Open the branch record
            </Link>
          </Alert>
        )}
        <SectionCard
          title="Request"
          description={REQUEST_DESCRIPTION}
          actions={
            can(holder, 'audit.view') ? (
              <Link component={NextLink} href={`/admin/branches/${record.id}/audit`}>
                Open the audit trail
              </Link>
            ) : undefined
          }
        >
          <DescriptionList
            items={[
              { label: 'Request', value: BRANCH_REQUEST },
              { label: 'Institution', value: resolved.context.organization.name },
              { label: 'Drafted by', value: <MakerValue maker={maker} name={makerName} me={me} /> },
              {
                label: `Drafted (${timeZone})`,
                value: maker?.ok && maker.value ? at(maker.value.occurredAt) : '—',
              },
            ]}
          />
        </SectionCard>
        <SectionCard title="Branch">
          <DescriptionList
            items={[
              { label: 'Branch name', value: record.branchName },
              { label: 'Branch code', value: record.branchCode },
              { label: 'Type', value: branchTypeLabel(record.branchType) },
              {
                label: 'Parent branch',
                value: record.parentBranchId
                  ? (branchIndex.get(record.parentBranchId)?.name ?? shortId(record.parentBranchId))
                  : '—',
              },
              { label: 'Timezone', value: record.timezone },
              { label: `Created (${timeZone})`, value: at(record.createdAt) },
              { label: 'Branch ID', value: <CopyIdButton value={record.id} label="Branch ID" /> },
            ]}
          />
        </SectionCard>
        {record.status === 'PENDING_APPROVAL' && (
          <SectionCard title="Control checks" description={CHECKS_DESCRIPTION}>
            <ControlChecks
              checks={branchControlChecks({
                maker: makerFact,
                me,
                organisationName: resolved.context.organization.name,
              })}
            />
          </SectionCard>
        )}
      </Box>
    </>
  );
}
```

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs: offer decisions whatever the context
      (`availableBranchDecisions(…)` without the `context.branch === null` check) ("never offers
      Activate with a branch selected (BG-03)"); `notFound()` for a 404 in a branch context too
      ("guides a branch context the backend hides it from…").

- [ ] **Step 5: Commit** (form C):

```
feat(approvals): add the branch approval page

A pending branch's activation page: who drafted it and when, the branch's facts, the control checks
and Activate, offered only at All branches and disabled for its drafter. With a branch selected the
backend hides other branches (BG-03), so the page guides the switch instead.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

#### Task 8b: The id guard over both detail routes

**Files:**

- Create: `app/(authenticated)/admin/approvals/approvals-id-guard.test.tsx`

**Interfaces:** none new (it imports Task 7a's and Task 8a's pages).

- [ ] **Step 1: Write the test** — `approvals-id-guard.test.tsx` (every read either route can make
      is listed, so a read added later and left unguarded fails here):

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Every read either detail route can make, so "before any read" is checked against all of them: a
// read someone adds later and forgets to guard still has to be listed here.
const reads = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  getUser: vi.fn(),
  findUserMembership: vi.fn(),
  listUserBranchAssignments: vi.fn(),
  getBranch: vi.fn(),
  getMakerEvent: vi.fn(),
  listRequestedRoles: vi.fn(),
  getBranchIndex: vi.fn(),
  getRoleIndex: vi.fn(),
  getOrganisationTimeZone: vi.fn(),
  getTenantUser: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: (...args: unknown[]) =>
    reads.getCurrentContextProfile(...args) as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  getUser: (...args: unknown[]) => reads.getUser(...args) as unknown,
  findUserMembership: (...args: unknown[]) => reads.findUserMembership(...args) as unknown,
  listUserBranchAssignments: (...args: unknown[]) =>
    reads.listUserBranchAssignments(...args) as unknown,
}));
vi.mock('@/modules/administration/branches/branch-service', () => ({
  getBranch: (...args: unknown[]) => reads.getBranch(...args) as unknown,
}));
vi.mock('@/modules/administration/approvals/approval-service', () => ({
  getMakerEvent: (...args: unknown[]) => reads.getMakerEvent(...args) as unknown,
  listRequestedRoles: (...args: unknown[]) => reads.listRequestedRoles(...args) as unknown,
}));
vi.mock('@/lib/api/lookups', () => ({
  getBranchIndex: (...args: unknown[]) => reads.getBranchIndex(...args) as unknown,
  getRoleIndex: (...args: unknown[]) => reads.getRoleIndex(...args) as unknown,
  getOrganisationTimeZone: (...args: unknown[]) =>
    reads.getOrganisationTimeZone(...args) as unknown,
  getTenantUser: (...args: unknown[]) => reads.getTenantUser(...args) as unknown,
}));
vi.mock('@/modules/administration/approvals/approval-actions', () => ({
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
}));
vi.mock('@/modules/administration/approvals/branch-activation-actions', () => ({
  activatePendingBranch: vi.fn(),
}));
vi.mock('@/modules/administration/roles/role-actions', () => ({
  assignRole: vi.fn(),
  revokeRoleAssignment: vi.fn(),
}));
vi.mock('@/modules/administration/branches/branch-actions', () => ({
  assignBranchUser: vi.fn(),
  revokeBranchAssignment: vi.fn(),
}));

const { default: UserApprovalPage } = await import('./users/[userId]/page');
const { default: BranchApprovalPage } = await import('./branches/[branchId]/page');

// Lettered at its end, so its upper-case form differs from it.
const ID = 'a1000000-0000-4000-8000-00000000000d';

const routes: Record<
  string,
  { render: (id: string) => Promise<unknown>; read: keyof typeof reads }
> = {
  'the user approval page': {
    render: (userId) => UserApprovalPage({ params: Promise.resolve({ userId }) }),
    read: 'getUser',
  },
  'the branch approval page': {
    render: (branchId) => BranchApprovalPage({ params: Promise.resolve({ branchId }) }),
    read: 'getBranch',
  },
};

describe.each(Object.entries(routes))('%s', (_name, route) => {
  beforeEach(() => {
    vi.resetAllMocks();
    for (const read of Object.values(reads))
      read.mockRejectedValue(new Error('unreachable backend'));
    reads.getCurrentContextProfile.mockResolvedValue({
      kind: 'resolved',
      profile: {
        user_id: 'b2000000-0000-4000-8000-0000000000bb',
        permissions: ['user.approve', 'user.view', 'branch.activate', 'branch.view'],
        branches: [],
      },
      context: { organization: { id: 'org-1', name: 'Greenfield' }, branch: null },
    });
  });

  it.each(['not-a-uuid', '../x', 'new', '', `${ID}x`, `${ID}/../activate`])(
    'answers %j with not-found, without reading anything (the profile included)',
    async (id) => {
      await expect(route.render(id)).rejects.toThrow('NEXT_NOT_FOUND');
      for (const [name, read] of Object.entries(reads)) {
        expect(read, name).not.toHaveBeenCalled();
      }
    },
  );

  it('reads an upper-case id in its lower-case form, and in no other', async () => {
    // Positive control: a valid id does read. The backend is unreachable, so the route settles on
    // its failure branch; only what it asked for matters.
    await Promise.resolve(route.render(ID.toUpperCase())).catch(() => undefined);

    expect(reads[route.read]).toHaveBeenCalledWith(ID);
    for (const [name, read] of Object.entries(reads)) {
      for (const call of read.mock.calls) {
        expect(JSON.stringify(call), name).not.toContain(ID.toUpperCase());
      }
    }
  });
});
```

- [ ] **Step 2: Run** — form U: PASS (it pins 7a's and 8a's guards). Mutation proofs: read the
      profile before the id parser (`parseUserId` or `parseBranchId`) in either page ("…without
      reading anything (the profile included)" fails for that route); pass the raw param to
      `getBranch` ("reads an upper-case id in its lower-case form…" fails for the branch route).

- [ ] **Step 3: Commit** (form C):

```
test(approvals): check both approval routes' ids before any read

A malformed id answers not-found on both detail routes without a single read, the profile
included; an upper-case id is read in its lower-case form and in no other.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

---

### Task 9: The header ruling and the tenant bell

Two sub-tasks, each its own commit: **9a** (Ruling 1, the only shell layout change, announced) and
**9b** (the bell). 9a lands first so the bell never ships into a header without room for it.

#### Task 9a: The user menu's name and email give way below `xl` (Ruling 1)

**Files:**

- Modify: `components/shell/user-menu.tsx`

**Interfaces:** none. The trigger keeps `aria-label={user.name}`.

- [ ] **Step 1: Change the breakpoint.** In `UserMenu`, the name-and-email box's `display` becomes:

```tsx
            // Layer 12, Ruling 1: the name and email give way below `xl`, so the bell, the
            // business date and the organisation fit between 1200 and 1535 px. The avatar and the
            // button's accessible name (the user's name) stay at every width.
            display: { xs: 'none', xl: 'flex' },
```

- [ ] **Step 2: Run** — form U on `components/shell/user-menu.test.tsx`: PASS (it finds the trigger
      by its accessible name). Form E on `e2e/shell.spec.ts`, `e2e/business-date.spec.ts`,
      `e2e/context.spec.ts`, `e2e/context-selection.spec.ts` and `e2e/profile.spec.ts`: PASS. (No
      test here pins the breakpoint; Task 11a's header-fit test does, with the bell: the
      organisation name must not be truncated at 1280 and 1440 px, and its mutation proof is this
      sub-task reverted, Ruling 1.)

- [ ] **Step 3: Commit** (form C):

```
refactor(shell): show the user's name and email in the app bar from xl

Between 1200 and 1535 px the app bar now shows the user's avatar without their name and email, so
the administration bell (layer 12), the business date and the organisation's name fit. The menu
still names the user, and the button keeps their name as its accessible name.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** `global-header.tsx`, `app-shell.tsx` and the
authenticated layout are untouched (Ruling 1).

#### Task 9b: The administration bell

**Files:**

- Modify: `components/shell/tenant-notifications.tsx`
- Create: `components/shell/tenant-notifications.test.tsx`

**Interfaces:**

- Consumes: `getCurrentContextProfile`, `canAll`, `load`, `administrationModule`; 17's
  `NotificationsMenu`; Task 1a's codes; Task 1c's `approvalNotifications`; Task 2's counts.
- Produces: `PendingApprovalNotifications()` (exported for its test), `TenantNotifications()`
  (unchanged name; the layout already renders it).

- [ ] **Step 1: Write the failing test** — `components/shell/tenant-notifications.test.tsx` (17's
      `platform-notifications.test.tsx` is the model: real `next/navigation`, digest assertions):

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import type { SelectedContextProfile } from '@/auth/context-service';
import type { BackendProfile } from '@/auth/context.types';
import type { ApplicationContext } from '@/config/application-context';
import {
  APPROVALS_UNAVAILABLE,
  NOTHING_WAITING,
  type UserApprovalCounts,
} from '@/modules/administration/approvals/approval-notifications';
import { renderWithProviders } from '@/test/test-utils';

const { countBranchActivations, countUserApprovals, getCurrentContextProfile } = vi.hoisted(() => ({
  countBranchActivations: vi.fn<() => Promise<number>>(),
  countUserApprovals: vi.fn<() => Promise<UserApprovalCounts>>(),
  getCurrentContextProfile: vi.fn<() => Promise<SelectedContextProfile>>(),
}));

// `load()`'s catch reads the request headers; `next/navigation` stays real, so `redirect()` and
// `unstable_rethrow` behave as in production (as platform-notifications.test.tsx).
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile(),
}));
vi.mock('@/modules/administration/approvals/approval-service', () => ({
  countBranchActivations: () => countBranchActivations(),
  countUserApprovals: () => countUserApprovals(),
}));

const { PendingApprovalNotifications } = await import('./tenant-notifications');

const ORGANISATION = '17000000-0000-4000-8000-0000000000cc';
const WESTLANDS = '28000000-0000-4000-8000-0000000000dd';
const BOTH = ['user.approve', 'user.view', 'branch.activate', 'branch.view'];

const PROFILE: BackendProfile = {
  user_id: '39000000-0000-4000-8000-0000000000aa',
  keycloak_subject: 'kc-admin',
  email: null,
  full_name: null,
  organisation: null,
  membership: { id: '4a000000-0000-4000-8000-0000000000bb', status: 'ACTIVE' },
  selected_branch: null,
  branches: [],
  roles: [],
  permissions: [],
};

const MODULES = {
  platform: { id: 'platform-administration', name: 'Platform Administration' },
  tenant: { id: 'administration', name: 'Administration' },
} as const satisfies Record<string, ApplicationContext['module']>;

function resolved(
  permissions: string[],
  options: { module?: ApplicationContext['module']; branch?: ApplicationContext['branch'] } = {},
) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { ...PROFILE, permissions },
    context: {
      module: options.module ?? MODULES.tenant,
      organization: { id: ORGANISATION, name: 'Greenfield Teachers SACCO' },
      branch: options.branch ?? null,
    },
  });
}

async function show() {
  return renderWithProviders(<>{await PendingApprovalNotifications()}</>);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('PendingApprovalNotifications', () => {
  it('counts what can be decided: pending users less those provisioning, plus pending branches', async () => {
    const user = userEvent.setup({ delay: null });
    resolved(BOTH);
    countUserApprovals.mockResolvedValue({ pending: 9, provisioning: 1 });
    countBranchActivations.mockResolvedValue(3);
    await show();

    const bell = screen.getByRole('button', { name: 'Notifications: 11 approvals waiting' });
    expect(within(bell).getByText('11')).toBeInTheDocument();
    await user.click(bell);
    const dialog = screen.getByRole('dialog', { name: 'Notifications' });
    expect(dialog).toHaveTextContent('8 users are waiting for approval.');
    expect(dialog).toHaveTextContent('3 branches are waiting for activation.');
    expect(within(dialog).getByRole('link', { name: 'Review user onboarding' })).toHaveAttribute(
      'href',
      '/admin/approvals/users',
    );
    expect(within(dialog).getByRole('link', { name: 'Review branch activation' })).toHaveAttribute(
      'href',
      '/admin/approvals/branches',
    );
  });

  it('reads only what the holder can decide', async () => {
    resolved(['user.approve', 'user.view']);
    countUserApprovals.mockResolvedValue({ pending: 1, provisioning: 0 });
    await show();

    expect(
      screen.getByRole('button', { name: 'Notifications: 1 approval waiting' }),
    ).toBeInTheDocument();
    expect(countBranchActivations).not.toHaveBeenCalled();
  });

  it('says to switch to All branches with a branch selected', async () => {
    const user = userEvent.setup({ delay: null });
    resolved(['branch.activate', 'branch.view'], {
      branch: { id: WESTLANDS, name: 'Westlands Branch' },
    });
    countBranchActivations.mockResolvedValue(1);
    await show();

    await user.click(screen.getByRole('button', { name: 'Notifications: 1 approval waiting' }));
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toHaveTextContent(
      '1 branch is waiting for activation. Switch to All branches to activate them.',
    );
    expect(countUserApprovals).not.toHaveBeenCalled();
  });

  it('says nothing is waiting when nothing is', async () => {
    const user = userEvent.setup({ delay: null });
    resolved(BOTH);
    countUserApprovals.mockResolvedValue({ pending: 1, provisioning: 1 });
    countBranchActivations.mockResolvedValue(0);
    await show();

    const bell = screen.getByRole('button', { name: 'Notifications: nothing waiting' });
    expect(bell).not.toHaveTextContent(/\d/);
    await user.click(bell);
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toHaveTextContent(
      NOTHING_WAITING,
    );
  });

  it.each([
    ['the user counts', () => countUserApprovals.mockRejectedValue(new BackendApiError(503))],
    [
      'the branch count',
      () =>
        countBranchActivations.mockRejectedValue(new BackendApiError(403, { code: 'forbidden' })),
    ],
  ])(
    "says the count couldn't be loaded when %s fail, never a partial number",
    async (_case, fail) => {
      const user = userEvent.setup({ delay: null });
      resolved(BOTH);
      countUserApprovals.mockResolvedValue({ pending: 9, provisioning: 1 });
      countBranchActivations.mockResolvedValue(3);
      fail();
      await show();

      const bell = screen.getByRole('button', { name: "Notifications (couldn't be loaded)" });
      expect(bell).not.toHaveTextContent(/\d/);
      await user.click(bell);
      expect(screen.getByRole('dialog', { name: 'Notifications' })).toHaveTextContent(
        APPROVALS_UNAVAILABLE,
      );
    },
  );

  it.each([
    ['outside the administration workspace', BOTH, MODULES.platform],
    ['without either pair of codes', ['user.approve', 'branch.activate'], MODULES.tenant],
  ])('reads nothing %s', async (_case, permissions, module) => {
    resolved(permissions, { module });
    const { container } = await show();

    expect(container).toBeEmptyDOMElement();
    expect(countUserApprovals).not.toHaveBeenCalled();
    expect(countBranchActivations).not.toHaveBeenCalled();
  });

  it('reads nothing while the context is not resolved', async () => {
    getCurrentContextProfile.mockResolvedValue({
      kind: 'redirect-to-context-selection',
      reason: 'invalid-context',
    });
    const { container } = await show();

    expect(container).toBeEmptyDOMElement();
    expect(countUserApprovals).not.toHaveBeenCalled();
  });

  it.each([
    ['a lost session to sign-in', new BackendApiError(401), ';/login?reason=session_expired;'],
    [
      'a stale context to context selection',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      ';/select-context;',
    ],
  ])('sends %s instead of reading it as unavailable', async (_case, error, digest) => {
    resolved(BOTH);
    countUserApprovals.mockRejectedValue(error);
    countBranchActivations.mockResolvedValue(0);

    await expect(PendingApprovalNotifications()).rejects.toMatchObject({
      digest: expect.stringContaining(digest) as unknown,
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — form U. Expected: FAIL.

- [ ] **Step 3: Implement** — replace `components/shell/tenant-notifications.tsx` with:

```tsx
import { Suspense } from 'react';
import { getCurrentContextProfile } from '@/auth/context-service';
import { canAll } from '@/auth/permissions';
import { load } from '@/lib/api/load';
import { administrationModule } from '@/modules/administration/administration-module';
import { approvalNotifications } from '@/modules/administration/approvals/approval-notifications';
import {
  BRANCH_ACTIVATION_CODES,
  USER_APPROVAL_CODES,
} from '@/modules/administration/approvals/approval-rules';
import {
  countBranchActivations,
  countUserApprovals,
} from '@/modules/administration/approvals/approval-service';
import { NotificationsMenu } from './notifications-menu';

/** Exported for its test. The authenticated layout builds every workspace's slot, so this renders in
 * the platform context too: it reads nothing outside the administration workspace, and nothing a
 * holder can't act on (Ruling 9). */
export async function PendingApprovalNotifications() {
  const selected = await getCurrentContextProfile();
  if (selected.kind !== 'resolved') return null;
  if (selected.context.module.id !== administrationModule.id) return null;
  const holder = { permissions: selected.profile.permissions };
  const users = canAll(holder, USER_APPROVAL_CODES);
  const branches = canAll(holder, BRANCH_ACTIVATION_CODES);
  if (!users && !branches) return null;
  // BG-22: no feed; three `size=1` reads, each settled by load() as the platform bell's is (rule
  // 21): a lost session or a stale context redirects; any other failure reads as unknown, never
  // as none (Ruling 9).
  const [userCounts, branchCount] = await Promise.all([
    users ? load(countUserApprovals()) : null,
    branches ? load(countBranchActivations()) : null,
  ]);
  return (
    <NotificationsMenu
      {...approvalNotifications({
        users: userCounts,
        branches: branchCount,
        branchSelected: selected.context.branch !== null,
      })}
    />
  );
}

/** Tenant workspace notifications slot (spec §8): its own boundary, so the shell never waits. */
export function TenantNotifications() {
  return (
    <Suspense fallback={null}>
      <PendingApprovalNotifications />
    </Suspense>
  );
}
```

- [ ] **Step 4: Run** — form U: PASS. Form E on `e2e/shell.spec.ts`, `e2e/users.spec.ts`,
      `e2e/branches.spec.ts` and `e2e/platform-records.spec.ts` (the bell now shows in the `users`
      and `branches` scenarios; the platform bell is unchanged): PASS. If a header case overflows,
      STOP and report (Ruling 1). Mutation proofs: drop the module check ("reads nothing outside
      the administration workspace"); read a failed part as `0`
      (`userCounts?.ok ? … : { ok: true, value: { pending: 0, provisioning: 0 } }`) ("says the
      count couldn't be loaded when the user counts fail…"); settle with `.catch(() => null)`
      instead of `load()` ("sends a lost session to sign-in…").

- [ ] **Step 5: Commit** (form C):

```
feat(shell): count pending approvals on the administration bell

The administration workspace's app bar shows a bell to holders of user.approve and user.view or of
branch.activate and branch.view: the users waiting for approval (less those whose identity is
already provisioning) plus the branches waiting for activation, with a link to each queue tab. In a
branch context it says activation needs All branches. A failed count reads "couldn't be loaded",
never "nothing waiting", and nothing is read in any other workspace (BG-22).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

---

### Task 10: The fake API's approvals scenarios

**Files:**

- Modify: `e2e/fake-api/scenarios.mts`
- Create: `e2e/fake-api-approvals.spec.ts`

**Interfaces:**

- Consumes: `usersScenario`, `USER_SCENARIO_IDS`, `IDS`, `membership`, `branch`, `assignment`,
  `tenantRoleAssignment`, `userAuditEvent`, `branchDraftEvent`, `withoutPermission`, `FakeUser`,
  `FakeMembership`, `FakeBranch` (all in `scenarios.mts`/`state.mts`); `api`, `contextFor`.
- Produces: `APPROVAL_SCENARIO_IDS`, `APPROVAL_SCENARIO_TEXT`; the scenarios `approvals`,
  `approvals-limited`, and for the gate's visual pass `approvals-long-org` (the long-names
  scenario's 88-character organisation name, with the bell) and `approvals-empty` (nothing pending
  in either queue). **No route change.**

- [ ] **Step 1: Write the failing spec** — `e2e/fake-api-approvals.spec.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import {
  APPROVAL_SCENARIO_IDS as APPROVALS,
  APPROVAL_SCENARIO_TEXT as TEXT,
  IDS,
  USER_SCENARIO_IDS as USERS,
  type ScenarioName,
} from './fake-api/scenarios.mts';
import { api, contextFor } from './support/fake-api';

interface Paged<T> {
  items: T[];
  page: { total_items: number; has_next: boolean };
}

interface UserRow {
  id: string;
  display_name: string;
  email: string;
  user_status: string;
  membership_status: string;
}

interface BranchRow {
  id: string;
  branch_name: string;
  status: string;
}

interface AuditRow {
  actor_id: string | null;
  occurred_at: string;
}

interface MembershipEcho {
  membership_status: string;
  user_status: string;
}

const read = async <T>(response: APIResponse): Promise<T> => (await response.json()) as T;

/** A fresh run of `scenario`, at institution level unless a branch is named. */
async function signIn(
  request: APIRequestContext,
  scenario: ScenarioName = 'approvals',
  branchId: string | null = null,
) {
  const headers = await contextFor(request, scenario, branchId);
  return {
    get: (path: string) => request.get(api(path), { headers }),
    post: (path: string, data: Record<string, unknown> = {}) =>
      request.post(api(path), { headers: { ...headers, 'Idempotency-Key': randomUUID() }, data }),
  };
}

test.describe('fake API: the approvals scenarios (layer 12)', () => {
  test('lists nine pending memberships newest first, one of them provisioning', async ({
    request,
  }) => {
    const { get } = await signIn(request);
    const pending = await read<Paged<UserRow>>(
      await get('/tenant/users?membership_status=PENDING_APPROVAL&page=0&size=10'),
    );
    expect(pending.items.map((row) => row.id)).toEqual([
      APPROVALS.usha,
      APPROVALS.zawadi,
      APPROVALS.tabitha,
      APPROVALS.samuel,
      APPROVALS.rose,
      USERS.daniel,
      USERS.carol,
      USERS.brian,
      USERS.amina,
    ]);
    const zawadi = pending.items[1];
    expect(zawadi?.display_name).toBe(TEXT.longName);
    expect(zawadi?.display_name).toHaveLength(100);
    expect(zawadi?.email).toBe(TEXT.longEmail);
    // One unbreakable token: no hyphen, space or slash a browser could wrap at.
    expect(TEXT.longEmail).toMatch(/^[a-z.@]{79}$/);

    const provisioning = await read<Paged<UserRow>>(
      await get(
        '/tenant/users?membership_status=PENDING_APPROVAL&user_status=PROVISIONING_IDP&page=0&size=1',
      ),
    );
    expect(provisioning.page.total_items).toBe(1);
  });

  test('lists three pending branches newest first, never the draft', async ({ request }) => {
    const { get } = await signIn(request);
    const pending = await read<Paged<BranchRow>>(
      await get('/branches?status=PENDING_APPROVAL&sort_by=createdAt&sort_dir=DESC&page=0&size=10'),
    );
    expect(pending.items.map((row) => row.id)).toEqual([
      APPROVALS.lamu,
      APPROVALS.naivasha,
      APPROVALS.kericho,
    ]);
    expect(pending.items[0]?.branch_name).toBe(TEXT.longBranch);
    expect(TEXT.longBranch).toHaveLength(100);
  });

  test('names each request’s maker in the audit trail', async ({ request }) => {
    const { get } = await signIn(request);
    const maker = async (entityType: string, entityId: string, action: string) =>
      read<Paged<AuditRow>>(
        await get(
          `/tenant/audit-events?entity_type=${entityType}&entity_id=${entityId}&action=${action}&page=0&size=1`,
        ),
      );
    expect((await maker('USER', APPROVALS.rose, 'user.invite')).items[0]).toMatchObject({
      actor_id: USERS.victor,
      occurred_at: '2026-09-24T08:00:00Z',
    });
    expect((await maker('USER', USERS.carol, 'user.invite')).items[0]?.actor_id).toBe(IDS.jane);
    expect(
      (await maker('BRANCH', APPROVALS.naivasha, 'branch.create_draft')).items[0]?.actor_id,
    ).toBe(IDS.jane);
    expect(
      (await maker('BRANCH', APPROVALS.kericho, 'branch.create_draft')).items[0]?.actor_id,
    ).toBe(USERS.victor);
  });

  test.describe('approves by the contract (§E.3, §F)', () => {
    test('an auditor with an identity: 200, ACTIVE', async ({ request }) => {
      const { post } = await signIn(request);
      const response = await post(`/tenant/memberships/${APPROVALS.tabithaMembership}/activate`);
      expect(response.status()).toBe(200);
      expect(await read<MembershipEcho>(response)).toMatchObject({
        membership_status: 'ACTIVE',
      });
    });

    test('a member with no identity yet: 202, still PENDING_APPROVAL, provisioning', async ({
      request,
    }) => {
      const { post } = await signIn(request);
      const response = await post(`/tenant/memberships/${APPROVALS.zawadiMembership}/activate`);
      expect(response.status()).toBe(202);
      expect(await read<MembershipEcho>(response)).toEqual(
        expect.objectContaining({
          membership_status: 'PENDING_APPROVAL',
          user_status: 'PROVISIONING_IDP',
        }),
      );
    });

    test('a member with no role, or a staff member with no branch: 500 (BG-07)', async ({
      request,
    }) => {
      const { post } = await signIn(request);
      for (const membership of [APPROVALS.roseMembership, APPROVALS.samuelMembership]) {
        expect((await post(`/tenant/memberships/${membership}/activate`)).status()).toBe(500);
      }
    });

    test('the inviter: 403 (BG-08)', async ({ request }) => {
      const { post } = await signIn(request);
      expect((await post(`/tenant/memberships/${USERS.carolMembership}/activate`)).status()).toBe(
        403,
      );
    });
  });

  test.describe('activates a branch by the contract (§E.3)', () => {
    test('someone else’s draft: 200, ACTIVE', async ({ request }) => {
      const { post } = await signIn(request);
      const response = await post(`/branches/${APPROVALS.kericho}/activate`, {
        reason: 'Licence received',
      });
      expect(response.status()).toBe(200);
      expect(await read<{ status: string }>(response)).toMatchObject({ status: 'ACTIVE' });
    });

    test('its drafter: 403 (BG-08)', async ({ request }) => {
      const { post } = await signIn(request);
      expect((await post(`/branches/${APPROVALS.naivasha}/activate`)).status()).toBe(403);
    });

    test('a branch context can’t reach a pending branch: 404 (BG-03)', async ({ request }) => {
      const { get } = await signIn(request, 'approvals', IDS.headOffice);
      expect((await get(`/branches/${APPROVALS.kericho}`)).status()).toBe(404);
    });
  });

  test('approvals-limited reads no audit trail and no assignments, and can’t revoke', async ({
    request,
  }) => {
    const { get, post } = await signIn(request, 'approvals-limited');
    expect((await get('/tenant/audit-events?page=0&size=1')).status()).toBe(403);
    expect(
      (await get(`/tenant/role-assignments?user_id=${APPROVALS.zawadi}&page=0&size=1`)).status(),
    ).toBe(403);
    expect(
      (
        await post(`/tenant/memberships/${APPROVALS.zawadiMembership}/revoke`, {
          reason: 'Not ours',
        })
      ).status(),
    ).toBe(403);
    // Still approvable: user.approve and membership.view stay.
    expect(
      (await post(`/tenant/memberships/${APPROVALS.zawadiMembership}/activate`)).status(),
    ).toBe(202);
  });

  test('approvals-long-org keeps the data under an 88-character organisation name', async ({
    request,
  }) => {
    const { get } = await signIn(request, 'approvals-long-org');
    const tenant = await read<{ display_name: string }>(await get('/tenant'));
    expect(tenant.display_name).toHaveLength(88);
    const pending = await read<Paged<UserRow>>(
      await get('/tenant/users?membership_status=PENDING_APPROVAL&page=0&size=1'),
    );
    expect(pending.page.total_items).toBe(9);
  });

  test('approvals-empty has nothing pending in either queue', async ({ request }) => {
    const { get } = await signIn(request, 'approvals-empty');
    const users = await read<Paged<UserRow>>(
      await get('/tenant/users?membership_status=PENDING_APPROVAL&page=0&size=1'),
    );
    const branches = await read<Paged<BranchRow>>(
      await get('/branches?status=PENDING_APPROVAL&page=0&size=1'),
    );
    expect([users.page.total_items, branches.page.total_items]).toEqual([0, 0]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — form E on the spec. Expected: FAIL (no scenario).

- [ ] **Step 3: Seed the scenarios.** In `scenarios.mts`, insert immediately **before** the comment
      ``// `satisfies` (not a `: Record<...>` annotation) keeps the literal key set…`` (that is,
      after `platformRecordsScenario()`):

```ts
/** Layer 12 seed IDs (lane rules §5): users …a*, memberships …b*, branches …c*; role assignments
 * …d*, branch assignments …e* and audit events …f* are internal. Every tail holds a letter, so an
 * upper-cased id differs from the seed. */
export const APPROVAL_SCENARIO_IDS = {
  rose: '12000000-0000-4000-8000-0000000000a1',
  samuel: '12000000-0000-4000-8000-0000000000a2',
  tabitha: '12000000-0000-4000-8000-0000000000a3',
  zawadi: '12000000-0000-4000-8000-0000000000a4',
  usha: '12000000-0000-4000-8000-0000000000a5',
  roseMembership: '12000000-0000-4000-8000-0000000000b1',
  samuelMembership: '12000000-0000-4000-8000-0000000000b2',
  tabithaMembership: '12000000-0000-4000-8000-0000000000b3',
  zawadiMembership: '12000000-0000-4000-8000-0000000000b4',
  ushaMembership: '12000000-0000-4000-8000-0000000000b5',
  kericho: '12000000-0000-4000-8000-0000000000c1',
  naivasha: '12000000-0000-4000-8000-0000000000c2',
  lamu: '12000000-0000-4000-8000-0000000000c3',
  voi: '12000000-0000-4000-8000-0000000000c4',
} as const;

/** The overflow seeds (rule 13): 100 characters each (contract §D maxima), and one email that is a
 * single unbreakable 79-character token. */
export const APPROVAL_SCENARIO_TEXT = {
  longName:
    'Zawadi Wanjiru Kamau-Achieng Muthoni Njeri Chebet Jepkoech Nyambura Akinyi Atieno Wairimu Mwangi Ayo',
  longEmail: 'zawadi.wanjiru.kamau.achieng.muthoni.njeri.chebet@greenfieldteachersacc.example',
  longBranch:
    'Lamu Old Town Waterfront and Shela Village Customer Service Centres for the Fishers and Allied Staff',
} as const;

/**
 * Layer 12: a copy of `users` (Amina's approval is a 202, Brian's a 200, Jane invited Carol, and
 * Daniel's identity is still provisioning) plus five more pending members, all invited by Victor:
 * Rose holds no role and Samuel no branch (each approval is a 500, BG-07), Tabitha is an auditor
 * (branch-exempt, a 200), Zawadi carries the 100-character name and the unbreakable email (a 202),
 * and Usha's account is suspended. Three branches wait for activation (Victor drafted Kericho and
 * Lamu, Jane drafted Naivasha) and Voi is still a draft. Jane gains `branch.activate`.
 */
function approvalsScenario(): RunState {
  const state = usersScenario();
  const ids = APPROVAL_SCENARIO_IDS;
  const victor = USER_SCENARIO_IDS.victor;
  const teller = USER_SCENARIO_IDS.teller;
  const seed = (tail: string) => `12000000-0000-4000-8000-0000000000${tail}`;
  const person = (
    id: string,
    username: string,
    displayName: string,
    status: string,
    overrides: Partial<FakeUser> = {},
  ): FakeUser => ({
    id,
    username,
    email: `${username}@greenfield.example`,
    displayName,
    status,
    keycloakSubject: `e2e-${username}`,
    ...overrides,
  });
  const pending = (
    id: string,
    userId: string,
    type: string,
    primaryBranchId: string | null = null,
  ): FakeMembership => ({
    ...membership(id, IDS.greenfield, userId),
    type,
    status: 'PENDING_APPROVAL',
    primaryBranchId,
    invitedBy: victor,
  });
  const submitted = (
    id: string,
    code: string,
    name: string,
    draftedBy: string,
    createdAt: string,
    status = 'PENDING_APPROVAL',
  ): FakeBranch => ({
    ...branch(id, IDS.greenfield, code, name, 'OPERATIONS'),
    status,
    draftedBy,
    parentBranchId: IDS.headOffice,
    createdAt,
    updatedAt: createdAt,
  });
  const invite = (tail: string, userId: string, occurredAt: string) =>
    userAuditEvent(seed(tail), 'USER', userId, 'user.invite', victor, occurredAt);
  return {
    ...state,
    users: [
      ...state.users,
      person(ids.rose, 'rose.atieno', 'Rose Atieno', 'DRAFT', { identityLinked: false }),
      person(ids.samuel, 'samuel.kiptoo', 'Samuel Kiptoo', 'ACTIVE'),
      person(ids.tabitha, 'tabitha.wekesa', 'Tabitha Wekesa', 'ACTIVE'),
      person(ids.zawadi, 'zawadi.long', APPROVAL_SCENARIO_TEXT.longName, 'DRAFT', {
        identityLinked: false,
        email: APPROVAL_SCENARIO_TEXT.longEmail,
      }),
      person(ids.usha, 'usha.patel', 'Usha Patel', 'SUSPENDED'),
    ],
    // Newest first is reverse seed order: the queue reads Usha, Zawadi, Tabitha, Samuel, Rose, then
    // 10's Daniel, Carol, Brian and Amina.
    memberships: [
      ...state.memberships,
      pending(ids.roseMembership, ids.rose, 'STAFF', IDS.westlands),
      pending(ids.samuelMembership, ids.samuel, 'STAFF'),
      pending(ids.tabithaMembership, ids.tabitha, 'AUDITOR'),
      pending(ids.zawadiMembership, ids.zawadi, 'STAFF', IDS.westlands),
      pending(ids.ushaMembership, ids.usha, 'STAFF', IDS.headOffice),
    ],
    branches: [
      ...state.branches,
      submitted(ids.kericho, 'KERICHO', 'Kericho Branch', victor, '2026-09-10T08:00:00Z'),
      submitted(ids.naivasha, 'NAIVASHA', 'Naivasha Branch', IDS.jane, '2026-09-11T08:00:00Z'),
      submitted(
        ids.lamu,
        'LAMU',
        APPROVAL_SCENARIO_TEXT.longBranch,
        victor,
        '2026-09-12T08:00:00Z',
      ),
      submitted(ids.voi, 'VOI', 'Voi Branch', victor, '2026-09-13T08:00:00Z', 'DRAFT'),
    ],
    branchAssignments: [
      ...state.branchAssignments,
      assignment(seed('e1'), IDS.greenfield, ids.rose, IDS.westlands, 'HOME'),
      assignment(seed('e2'), IDS.greenfield, ids.zawadi, IDS.westlands, 'HOME'),
      assignment(seed('e3'), IDS.greenfield, ids.usha, IDS.headOffice, 'HOME'),
    ],
    roles: state.roles.map((candidate) =>
      candidate.id === IDS.tenantAdminRole
        ? { ...candidate, permissions: [...candidate.permissions, 'branch.activate'] }
        : candidate,
    ),
    roleAssignments: [
      ...state.roleAssignments,
      tenantRoleAssignment(seed('d1'), IDS.greenfield, ids.samuel, teller),
      tenantRoleAssignment(seed('d2'), IDS.greenfield, ids.tabitha, teller),
      tenantRoleAssignment(seed('d3'), IDS.greenfield, ids.zawadi, teller),
      tenantRoleAssignment(seed('d4'), IDS.greenfield, ids.usha, teller),
    ],
    auditEvents: [
      ...state.auditEvents,
      invite('f1', ids.rose, '2026-09-24T08:00:00Z'),
      invite('f2', ids.samuel, '2026-09-25T08:00:00Z'),
      invite('f3', ids.tabitha, '2026-09-26T08:00:00Z'),
      invite('f4', ids.zawadi, '2026-09-27T08:00:00Z'),
      invite('f5', ids.usha, '2026-09-28T08:00:00Z'),
      branchDraftEvent(seed('f6'), ids.kericho, victor, '2026-09-10T08:00:00Z'),
      branchDraftEvent(seed('f7'), ids.naivasha, IDS.jane, '2026-09-11T08:00:00Z'),
      branchDraftEvent(seed('f8'), ids.lamu, victor, '2026-09-12T08:00:00Z'),
      branchDraftEvent(seed('f9'), ids.voi, victor, '2026-09-13T08:00:00Z'),
    ],
  };
}
```

      and append to `BUILDERS`, last (after the layer-17 entries):

```ts
  // Layer 12 (approvals). `approvals-limited` has the same data without the audit read, the two
  // assignment reads and membership.revoke: the maker check is the platform's, requested access
  // can't be read, and Reject & revoke isn't offered.
  approvals: approvalsScenario,
  'approvals-limited': () =>
    withoutPermission(
      approvalsScenario(),
      'audit.view',
      'role_assignment.view',
      'branch_assignment.view',
      'membership.revoke',
    ),
  // The layer gate's visual pass: the same data under the long-names scenario's organisation name
  // (the header at its crowded widths, with the bell), and with nothing pending (both empty tabs).
  'approvals-long-org': () => {
    const state = approvalsScenario();
    return {
      ...state,
      organisations: state.organisations.map((candidate) => ({
        ...candidate,
        displayName:
          'Greenfield Teachers and Public Service Employees Savings and Credit Co-operative Society',
      })),
    };
  },
  'approvals-empty': () => {
    const state = approvalsScenario();
    return {
      ...state,
      memberships: state.memberships.filter((row) => row.status !== 'PENDING_APPROVAL'),
      branches: state.branches.filter((row) => row.status !== 'PENDING_APPROVAL'),
    };
  },
```

      Then form P on `e2e/fake-api/scenarios.mts`.

- [ ] **Step 4: Run** — form E on `e2e/fake-api-approvals.spec.ts`, `e2e/fake-api-users.spec.ts`
      and `e2e/fake-api.spec.ts`: PASS. Mutation proofs: give Zawadi `identityLinked: true` ("a
      member with no identity yet: 202…" fails with 200); keep the pending branches in
      `approvals-empty` ("approvals-empty has nothing pending in either queue").

- [ ] **Step 5: Commit** (form C):

```
test(fake-api): seed the approvals scenarios

Layer 12's scenarios copy the users scenario and add five pending members invited by someone else
(no role; no branch; an auditor; a 100-character name with an unbreakable 79-character email and no
sign-in identity yet; a suspended account), three branches pending activation (two drafted by
someone else, one by the signed-in administrator) and a draft. approvals-limited drops the audit and
assignment reads and membership.revoke; approvals-long-org renames the organisation to 88
characters and approvals-empty has nothing pending, for the layer's visual pass. No route changes.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check` (format:check covers the `.mts`).

---

### Task 11: End to end, the accessibility matrix and the docs

Four sub-tasks, each its own commit, along the spec's own `--grep` chunks: **11a** (the queue, the
ids and the bell), **11b** (the decisions, inserted into the same spec), **11c** (the accessibility
matrix, appended) and **11d** (the docs).

**Interfaces (11a–11c):**

- Consumes: Task 10's scenarios and ids; `e2e/support/admin.ts` (`enterAdmin`, `mainText`,
  `rowsOf`, `notFoundHeading`, the a11y helpers) and `e2e/support/auth.ts` (`authenticate`,
  `expectHydrated`).

Every `describe` sets its own budget with `test.describe.configure`: 90 s for a behaviour test
(each signs in, selects a context and can be the first hit of a route tree under a cold `next dev`
compile, as in `users.spec.ts`), 60 s for one accessibility case (as in
`platform-records.spec.ts`). Playwright's default of 30 s isn't enough for either.

#### Task 11a: The queue, the ids and the bell

**Files:**

- Create: `e2e/approvals.spec.ts`

- [ ] **Step 1: Write the spec** — `e2e/approvals.spec.ts` (the strings at the top are the app's
      copy, quoted verbatim; rule 18):

```ts
import { expect, test, type Locator, type Page } from '@playwright/test';
import { enterAdmin, mainText, notFoundHeading, rowsOf } from './support/admin';
import { authenticate, expectHydrated } from './support/auth';
import {
  APPROVAL_SCENARIO_IDS as APPROVALS,
  APPROVAL_SCENARIO_TEXT as TEXT,
} from './fake-api/scenarios.mts';

const ALL_BRANCHES = /All branches \(institution level\)/;

// The app's copy, repeated here: Playwright can't resolve the app's `@/` imports. Each string is
// asserted verbatim, so a reworded message fails here (rule 18).
const BRANCH_ACTIVATED = 'Branch activated';
const NO_APPROVAL_ACCESS =
  "Your role can't approve users or activate branches. Ask an administrator if you need access.";
const BRANCH_QUEUE_CONTEXT =
  'With Head Office selected, these branches can be listed but not activated. Switch to All branches to review them.';
const UNKNOWN_ID = '12000000-0000-4000-8000-0000000000ff';

/** The queue's first tab, through context selection, as the first navigation of a test. */
async function enterQueue(page: Page, branch: RegExp = ALL_BRANCHES) {
  await enterAdmin(page, '/admin/approvals/users', { heading: 'Approval queue', branch });
}

/** A request page once the context is selected. Bounded: the first hit of its tree compiles. */
async function openRequest(page: Page, path: string, name: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15000 });
}

const userPath = (id: string) => `/admin/approvals/users/${id}`;
const branchPath = (id: string) => `/admin/approvals/branches/${id}`;

/** A click on a client control, once React owns it (a click on the SSR markup is dropped). */
async function press(locator: Locator) {
  await expectHydrated(locator);
  await locator.click();
}

/** The record hero: the innermost surface holding the page's h1, with its chips and decisions (as
 * users.spec.ts). A dialog's confirmation repeats a decision's name, so decisions are found here. */
const hero = (page: Page) =>
  page
    .locator('.MuiPaper-root')
    .filter({ has: page.getByRole('heading', { level: 1 }) })
    .last();
const decision = (page: Page, name: string) =>
  hero(page).getByRole('button', { name, exact: true });
const dialogOf = (page: Page) => page.getByRole('alertdialog').or(page.getByRole('dialog'));
const toast = (page: Page, text: string) => page.getByRole('alert').filter({ hasText: text });

/** A decision through its dialog; the caller asserts the outcome. */
async function decide(page: Page, label: string, reason?: string) {
  await press(decision(page, label));
  const dialog = dialogOf(page);
  if (reason !== undefined) await dialog.getByRole('textbox', { name: /^Reason/ }).fill(reason);
  await dialog.getByRole('button', { name: label, exact: true }).click();
  return dialog;
}

/** The tenant bell, once its count streamed in (its own Suspense boundary). */
async function bell(page: Page, name: string) {
  const button = page.getByRole('banner').getByRole('button', { name, exact: true });
  await expect(button).toBeVisible({ timeout: 15000 });
  return button;
}

test.describe('approvals: the queue', () => {
  // Each test signs in, selects a context and can be the first hit of a route tree under a cold
  // `next dev` compile (users.spec.ts uses the same budget).
  test.describe.configure({ timeout: 90000 });

  test('opens the first tab from the rail, listing who waits newest first', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);

    const rail = page.getByRole('navigation', { name: 'Administration' });
    await expect(rail.getByRole('link', { name: 'Approval queue' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Spec §10.6: the tab counts the actionable users (Daniel's approval already ran).
    await expect(page.getByRole('tab', { name: 'User onboarding (8)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(rowsOf(page, 'Users')).toHaveCount(10); // header + 9
    const names = page.getByRole('table', { name: 'Users' }).locator('tbody').getByRole('link');
    await expect(names).toHaveText([
      'Usha Patel',
      TEXT.longName,
      'Tabitha Wekesa',
      'Samuel Kiptoo',
      'Rose Atieno',
      'Daniel Mutua',
      'Carol Wambui',
      'Brian Kiprono',
      'Amina Odhiambo',
    ]);
    // Approval already ran for Daniel: his row says so (Ruling 12).
    await expect(
      page
        .getByRole('row')
        .filter({ hasText: 'Daniel Mutua' })
        .getByText('Provisioning identity', { exact: true })
        .first(),
    ).toBeVisible();

    // The rail opens /admin/approvals, which opens the first tab the holder can see.
    await page.goto('/admin/approvals');
    await expect(page).toHaveURL(/\/admin\/approvals\/users$/, { timeout: 15000 });
  });

  test('lists pending branches newest first, sorts them by name, and never lists a draft', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);

    await press(page.getByRole('tab', { name: 'Branch activation (3)' }));
    await expect(page).toHaveURL(/\/admin\/approvals\/branches$/, { timeout: 15000 });
    const table = page.getByRole('table', { name: 'Branches' });
    const names = table.locator('tbody').getByRole('link');
    await expect(rowsOf(page, 'Branches')).toHaveCount(4); // header + 3
    await expect(table).not.toContainText('Voi Branch');
    await expect(names).toHaveText([TEXT.longBranch, 'Naivasha Branch', 'Kericho Branch']);

    await table.getByRole('link', { name: 'Branch', exact: true }).click();
    // Read the params, never an order-dependent regex.
    await expect
      .poll(() => new URL(page.url()).searchParams.get('sortBy'), { timeout: 15000 })
      .toBe('branchName');
    expect(new URL(page.url()).searchParams.get('sortDir')).toBe('ASC');
    await expect(names).toHaveText(['Kericho Branch', TEXT.longBranch, 'Naivasha Branch']);
  });

  test('tells a branch context that activation needs All branches', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterAdmin(page, '/admin/approvals/branches', {
      heading: 'Approval queue',
      branch: /Head Office/,
    });

    await expect(page.getByRole('main').getByRole('note')).toContainText(BRANCH_QUEUE_CONTEXT);
    await expect(page.getByRole('button', { name: 'Switch to All branches' })).toBeVisible();

    await page.goto(branchPath(APPROVALS.kericho));
    await expect(
      page.getByRole('heading', { level: 1, name: 'Branch not available here' }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('hides the queue and the bell from a holder who can decide nothing', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'default');
    await enterAdmin(page, '/admin', { heading: 'Administration Overview' });

    await expect(
      page.getByRole('navigation', { name: 'Administration' }).getByRole('link', {
        name: 'Approval queue',
      }),
    ).toHaveCount(0);
    // A full load streams the header's Suspense boundaries with the document, and the business
    // date chip (streamed beside the bell) has arrived, so no bell is no bell, not a late one.
    await page.goto('/admin');
    const banner = page.getByRole('banner');
    await expect(banner.getByRole('link', { name: /Business date · Open$/ })).toBeVisible({
      timeout: 15000,
    });
    await expect(banner.getByRole('button', { name: /^Notifications/ })).toHaveCount(0);

    await page.goto('/admin/approvals');
    await expect(page.getByRole('heading', { level: 1, name: 'Approval queue' })).toBeVisible({
      timeout: 15000,
    });
    await expect(mainText(page, NO_APPROVAL_ACCESS)).toBeVisible();
  });
});

test.describe('approvals: ids', () => {
  // Each test signs in, selects a context and can be the first hit of a route tree under a cold
  // `next dev` compile (users.spec.ts uses the same budget).
  test.describe.configure({ timeout: 90000 });

  test('answers a malformed or unknown id with not-found, and reads a mixed-case one', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);

    for (const path of [
      userPath('not-a-uuid'),
      branchPath('new'),
      userPath(UNKNOWN_ID),
      branchPath(UNKNOWN_ID),
    ]) {
      await page.goto(path);
      await expect(notFoundHeading(page)).toBeVisible({ timeout: 15000 });
    }
    await openRequest(page, userPath(APPROVALS.rose.toUpperCase()), 'Rose Atieno');
    await openRequest(page, branchPath(APPROVALS.kericho.toUpperCase()), 'Kericho Branch');
  });
});

test.describe('approvals: the notifications bell', () => {
  // Each test signs in, selects a context and can be the first hit of a route tree under a cold
  // `next dev` compile (users.spec.ts uses the same budget).
  test.describe.configure({ timeout: 90000 });

  test('counts what can be decided, and opens each queue', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);

    const button = await bell(page, 'Notifications: 11 approvals waiting');
    await expect(button).toContainText('11');
    await press(button);
    const dialog = page.getByRole('dialog', { name: 'Notifications' });
    await expect(dialog).toContainText('8 users are waiting for approval.');
    await expect(dialog).toContainText('3 branches are waiting for activation.');
    await dialog.getByRole('link', { name: 'Review branch activation' }).click();
    await expect(page).toHaveURL(/\/admin\/approvals\/branches$/, { timeout: 15000 });
  });

  test('counts one fewer after a decision', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, branchPath(APPROVALS.kericho), 'Kericho Branch');
    await bell(page, 'Notifications: 11 approvals waiting');

    await decide(page, 'Activate');
    await expect(toast(page, BRANCH_ACTIVATED)).toBeVisible();
    await bell(page, 'Notifications: 10 approvals waiting');
  });

  test('tells a branch context to switch to activate', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page, /Head Office/);

    await press(await bell(page, 'Notifications: 11 approvals waiting'));
    await expect(page.getByRole('dialog', { name: 'Notifications' })).toContainText(
      '3 branches are waiting for activation. Switch to All branches to activate them.',
    );
  });

  // Ruling 1: the bell joins the header, and the user's name and email give way below `xl`. STOP
  // rule: if this fails, the header ruling is wrong, not the test. Its mutation proof is Task 9a
  // reverted (`lg` again): the organisation name then truncates at 1280 px.
  for (const width of [1200, 1280, 1440]) {
    test(`fits the header with the bell at ${width}px`, async ({ context, page }, testInfo) => {
      await page.setViewportSize({ width, height: 800 });
      await authenticate(context, testInfo, 'approvals');
      await enterQueue(page);

      const banner = page.getByRole('banner');
      const button = await bell(page, 'Notifications: 11 approvals waiting');
      const chip = banner.getByRole('link', { name: /Business date · Open$/ });
      const status = chip.getByText('Open', { exact: true });
      const organisation = banner.getByText('Greenfield SACCO', { exact: true });
      await expect(organisation).toBeVisible();
      await expect(status).toBeVisible();
      await expect(banner.getByRole('button', { name: 'Backend Jane Manager' })).toBeVisible();

      const [chipBox, statusBox, bellBox] = await Promise.all([
        chip.boundingBox(),
        status.boundingBox(),
        button.boundingBox(),
      ]);
      if (!chipBox || !statusBox || !bellBox) throw new Error('expected header boxes');
      // The status word is never clipped, and the bell never overlaps the chip.
      expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(chipBox.x + chipBox.width + 1);
      expect(bellBox.x >= chipBox.x + chipBox.width || bellBox.x + bellBox.width <= chipBox.x).toBe(
        true,
      );
      // Nothing in the app bar overflows it.
      expect(await banner.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      // Ruling 1's point: the institution you decide for stays readable with the bell in the bar
      // (from 1280 px; at 1200 the organisation's box is at its narrowest).
      if (width >= 1280) {
        expect(
          await organisation.evaluate((element) => element.scrollWidth <= element.clientWidth),
        ).toBe(true);
      }
    });
  }
});
```

- [ ] **Step 2: Run** — form E on the spec, in chunks of at most 8 minutes
      (`--grep "approvals: the queue|approvals: ids"`, then
      `--grep "approvals: the notifications bell"`): PASS. Mutation proofs (each run as one
      `--grep` of the named test; revert): skip the `apiPost` in `activatePendingBranch` (the toast
      still shows; "counts one fewer after a decision" fails on the bell's label); revert Task 9a
      (`xl` back to `lg` in `user-menu.tsx`): "fits the header with the bell at 1280px" must fail on
      the organisation name's truncation.

      **STOP rule (Ruling 1):** if a header-fit test fails with Task 9a in place, or the 1280 px
      case still passes with Task 9a reverted, stop and report the measurements (the organisation
      name's `scrollWidth` and `clientWidth` at 1200, 1280 and 1440 px); Q1 returns to the user.

- [ ] **Step 3: Commit** (form C):

```
test(e2e): cover the approval queue, its ids and the bell end to end

Both tabs with their counts and order, the provisioning row, the branch tab's sort and its
branch-context note, and a holder who can decide nothing; malformed, unknown and mixed-case ids;
the bell, its links, its branch-context hint, its count after a decision, and the header at 1200,
1280 and 1440 px, where the organisation's name must stay whole from 1280 px.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** one scenario per test; the bell is awaited
(`bell()`) before it is read, and its absence is asserted only once the business-date chip that
streams beside it has arrived; toasts are filtered alerts.

#### Task 11b: The decisions

**Files:**

- Modify: `e2e/approvals.spec.ts`

- [ ] **Step 1: Extend the scenarios import** — after `APPROVAL_SCENARIO_TEXT as TEXT,` add:

```ts
  USER_SCENARIO_IDS as USERS,
```

- [ ] **Step 2: Add the decisions' copy** immediately after
      `const UNKNOWN_ID = '12000000-0000-4000-8000-0000000000ff';`:

```ts
const APPROVED_ACTIVE = 'Approved. Their membership is active.';
const APPROVED_PROVISIONING =
  'Approved. Identity provisioning is queued: the invitation is sent when it completes.';
const MEMBERSHIP_REVOKED = 'Membership revoked';
const PROVISIONING_NOTE =
  "Approval ran, and their sign-in identity is being created. The invitation is sent when it completes. If it stays here, identity provisioning may be switched off on the platform, and it can't be retried from here.";
const APPROVED_NOTE = 'Approved: this membership is active.';
const REJECTED_NOTE =
  "Rejected: this membership was revoked, and this email can't be invited to this institution again.";
const ACTIVATED_NOTE = 'Activated: this branch is live.';
const USER_MAKER_CHECKER_BLOCKED =
  'You invited this user, so another administrator must approve them.';
const MAKER_CHECKER_BLOCKED = 'You drafted this branch, so another administrator must activate it.';
const ACCOUNT_SUSPENDED =
  "Their account is suspended on the platform, so this membership can't be approved.";
const APPROVE_FAILED =
  "The approval couldn't complete. They may still need an active role and, for staff and admin members, an active branch assignment. Refresh and check.";
const APPROVAL_CHANGED =
  'This approval changed since the page loaded. Refresh to see where it stands.';
const MEMBERSHIP_CHANGED =
  'This membership changed since the page loaded. Refresh to see its status.';
const VERIFIED_ON_APPROVAL = 'Verified by the platform on approval.';
const MAKER_NOT_PERMITTED = "Your role can't view the audit trail";
const ROLES_NOT_PERMITTED = "Your role can't view role assignments.";
const BRANCHES_NOT_PERMITTED = "Your role can't view branch assignments.";
```

- [ ] **Step 3: Add two helpers**, followed by a blank line, immediately before
      `test.describe('approvals: the queue', () => {`:

```ts
const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

/** The value of a description-list row in one region, found by its label. */
const fact = (scope: Locator, label: string) =>
  scope.locator('dt').filter({ hasText: label }).locator('xpath=following-sibling::dd[1]');
```

- [ ] **Step 4: Append the decisions** at the end of the file:

```ts
test.describe('approvals: user onboarding decisions', () => {
  // Each test signs in, selects a context and can be the first hit of a route tree under a cold
  // `next dev` compile (users.spec.ts uses the same budget).
  test.describe.configure({ timeout: 90000 });

  test('approves a member whose identity must be created (202), focusing the title', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, userPath(APPROVALS.zawadi), TEXT.longName);

    const dialog = await decide(page, 'Approve');
    await expect(toast(page, APPROVED_PROVISIONING)).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(mainText(page, PROVISIONING_NOTE)).toBeVisible();
    await expect(decision(page, 'Approve')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: TEXT.longName })).toBeFocused();
  });

  test('approves an auditor with a sign-in identity (200)', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, userPath(APPROVALS.tabitha), 'Tabitha Wekesa');

    await expect(
      fact(region(page, 'Control checks'), 'Has an active branch assignment'),
    ).toContainText('Not required');
    await decide(page, 'Approve');
    await expect(toast(page, APPROVED_ACTIVE)).toBeVisible();
    await expect(mainText(page, APPROVED_NOTE)).toBeVisible();
  });

  test('disables Approve for the signed-in user’s own invitation', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, userPath(USERS.carol), 'Carol Wambui');

    await expect(decision(page, 'Approve')).toBeDisabled();
    await expect(decision(page, 'Approve')).toHaveAccessibleDescription(USER_MAKER_CHECKER_BLOCKED);
    await expect(decision(page, 'Reject & revoke')).toBeEnabled();
    await expect(fact(region(page, 'Request'), 'Invited by')).toHaveText(
      'Backend Jane Manager (you)',
    );
    await expect(fact(region(page, 'Control checks'), 'Invited by someone else')).toContainText(
      'Not met',
    );
  });

  test('explains a missing prerequisite and returns focus to the confirmation', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, userPath(APPROVALS.rose), 'Rose Atieno');

    await expect(fact(region(page, 'Control checks'), 'Has an active role')).toContainText(
      'Not met',
    );
    const dialog = await decide(page, 'Approve');
    await expect(dialog.getByRole('alert')).toContainText(APPROVE_FAILED);
    await expect(dialog.getByRole('alert')).toContainText('Reference:');
    await expect(dialog.getByRole('button', { name: 'Approve', exact: true })).toBeFocused();
  });

  test('rejects and revokes with a reason, the server checking it', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, userPath(APPROVALS.samuel), 'Samuel Kiptoo');

    await press(decision(page, 'Reject & revoke'));
    const dialog = page.getByRole('alertdialog', { name: 'Reject and revoke Samuel Kiptoo?' });
    await expect(dialog).toContainText('can never be invited to this institution again');
    // Three spaces pass the native minLength; the server trims and refuses them.
    await dialog.getByRole('textbox', { name: /^Reason/ }).fill('   ');
    await dialog.getByRole('button', { name: 'Reject & revoke', exact: true }).click();
    await expect(dialog.getByText('Give a reason of at least 3 characters.')).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: /^Reason/ })).toBeFocused();

    await dialog.getByRole('textbox', { name: /^Reason/ }).fill('Duplicate invitation');
    await dialog.getByRole('button', { name: 'Reject & revoke', exact: true }).click();
    await expect(toast(page, MEMBERSHIP_REVOKED)).toBeVisible();
    await expect(mainText(page, REJECTED_NOTE)).toBeVisible();
  });

  test('refuses a stale Reject & revoke after another tab approved (Ruling 5)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, userPath(APPROVALS.tabitha), 'Tabitha Wekesa');
    const stale = await context.newPage();
    await openRequest(stale, userPath(APPROVALS.tabitha), 'Tabitha Wekesa');

    await decide(page, 'Approve');
    await expect(toast(page, APPROVED_ACTIVE)).toBeVisible();

    const dialog = await decide(stale, 'Reject & revoke', 'Duplicate invitation');
    await expect(dialog.getByRole('alert')).toContainText(APPROVAL_CHANGED);
    await stale.reload();
    await expect(mainText(stale, APPROVED_NOTE)).toBeVisible({ timeout: 15000 });
  });

  test('refuses a stale Reject & revoke on the user record too (P-3)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    const stale = await context.newPage();
    await openRequest(stale, `/admin/users/${APPROVALS.tabitha}`, 'Tabitha Wekesa');
    await openRequest(page, userPath(APPROVALS.tabitha), 'Tabitha Wekesa');

    await decide(page, 'Approve');
    await expect(toast(page, APPROVED_ACTIVE)).toBeVisible();

    const dialog = await decide(stale, 'Reject & revoke', 'Duplicate invitation');
    await expect(dialog.getByRole('alert')).toContainText(MEMBERSHIP_CHANGED);
  });

  test('offers no decision while an identity is provisioning', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, userPath(USERS.daniel), 'Daniel Mutua');

    await expect(mainText(page, PROVISIONING_NOTE)).toBeVisible();
    await expect(decision(page, 'Approve')).toHaveCount(0);
    await expect(decision(page, 'Reject & revoke')).toHaveCount(0);
    await expect(region(page, 'Control checks')).toHaveCount(0);
  });

  test('disables Approve for a suspended account, keeping Reject & revoke', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, userPath(APPROVALS.usha), 'Usha Patel');

    await expect(decision(page, 'Approve')).toBeDisabled();
    await expect(decision(page, 'Approve')).toHaveAccessibleDescription(ACCOUNT_SUSPENDED);
    await expect(decision(page, 'Reject & revoke')).toBeEnabled();
  });

  test('leaves the checks to the platform when the audit trail and assignments can’t be read', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals-limited');
    await enterQueue(page);
    await openRequest(page, userPath(APPROVALS.zawadi), TEXT.longName);

    await expect(fact(region(page, 'Request'), 'Invited by')).toHaveText(MAKER_NOT_PERMITTED);
    // Scoped and exact: the same words also open two control checks' details.
    const access = region(page, 'Requested access');
    await expect(access.getByText(ROLES_NOT_PERMITTED, { exact: true })).toBeVisible();
    await expect(access.getByText(BRANCHES_NOT_PERMITTED, { exact: true })).toBeVisible();
    const checks = region(page, 'Control checks');
    for (const label of [
      'Invited by someone else',
      'Has an active role',
      'Has an active branch assignment',
    ]) {
      await expect(fact(checks, label)).toContainText('Checked on approval');
      await expect(fact(checks, label)).toContainText(VERIFIED_ON_APPROVAL);
    }
    await expect(decision(page, 'Approve')).toBeEnabled();
    await expect(decision(page, 'Reject & revoke')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open the audit trail' })).toHaveCount(0);
  });
});

test.describe('approvals: branch activation decisions', () => {
  // Each test signs in, selects a context and can be the first hit of a route tree under a cold
  // `next dev` compile (users.spec.ts uses the same budget).
  test.describe.configure({ timeout: 90000 });

  test('activates a branch someone else drafted, focusing the title', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, branchPath(APPROVALS.kericho), 'Kericho Branch');

    await expect(fact(region(page, 'Request'), 'Drafted by')).toHaveText('Victor Otieno');
    await press(decision(page, 'Activate'));
    const dialog = page.getByRole('dialog', { name: 'Activate Kericho Branch?' });
    await dialog.getByRole('textbox', { name: 'Reason (optional)' }).fill('Licence received');
    await dialog.getByRole('button', { name: 'Activate', exact: true }).click();
    await expect(toast(page, BRANCH_ACTIVATED)).toBeVisible();
    await expect(mainText(page, ACTIVATED_NOTE)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Kericho Branch' })).toBeFocused();
  });

  test('disables Activate for its drafter', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, branchPath(APPROVALS.naivasha), 'Naivasha Branch');

    await expect(decision(page, 'Activate')).toBeDisabled();
    await expect(decision(page, 'Activate')).toHaveAccessibleDescription(MAKER_CHECKER_BLOCKED);
  });
});
```

      Then form P on the spec.

- [ ] **Step 5: Run** — form E on the spec, in chunks (`--grep "approvals: user onboarding"`, then
      `--grep "approvals: branch activation"`): PASS. If Q14 dropped Task 3b, delete "refuses a
      stale Reject & revoke on the user record too (P-3)" first. Mutation proofs (each run as one
      `--grep` of the named test; revert): in `rejectUser`, allow `state === 'decided'` ("refuses a
      stale Reject & revoke after another tab approved" fails); remove Task 3a's effect ("explains
      a missing prerequisite and returns focus to the confirmation" fails).

- [ ] **Step 6: Commit** (form C):

```
test(e2e): cover the approval decisions end to end

Approve with a 202 and a 200, the disabled Approve for the inviter and for a suspended account, a
missing prerequisite explained with focus back on the confirmation, Reject & revoke with a
server-checked reason, a stale reject refused on both pages, a provisioning request with no
decision; Activate and its drafter; and the limited role's checks left to the platform.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** text that also appears in a control check's
detail is matched `exact` inside its own region (strict mode: "Your role can't view role
assignments." is both Requested access's line and the check's second sentence).

#### Task 11c: The accessibility matrix

**Files:**

- Modify: `e2e/approvals.spec.ts`

- [ ] **Step 1: Extend the support import** — the `./support/admin` import becomes:

```ts
import {
  A11Y_CASES,
  applyA11yCase,
  enterAdmin,
  expectA11yCaseApplied,
  expectNoSeriousOrCriticalViolations,
  mainText,
  notFoundHeading,
  rowsOf,
} from './support/admin';
```

- [ ] **Step 2: Append the matrix** at the end of the file (by surface, as layer 17's: eight
      surfaces times `A11Y_CASES`' four cases, sixteen a scheme, so one failing scan hides nothing
      after it):

```ts
/** The accessibility matrix by surface (rule 13), so a failing scan hides nothing after it.
 * `regions`: each landmark name's expected count (axe rates landmark-unique moderate, so the
 * serious/critical scan can't see two landmarks sharing a name; rule 11). */
const SURFACES = [
  {
    label: 'user onboarding tab',
    path: '/admin/approvals/users',
    heading: 'Approval queue',
    regions: { 'User onboarding': 1, 'Users table': 1, Users: 0 },
  },
  {
    label: 'branch activation tab',
    path: '/admin/approvals/branches',
    heading: 'Approval queue',
    regions: { 'Branch activation': 1, 'Branches table': 1, Branches: 0 },
  },
  {
    label: 'user approval (100 characters, unbreakable email)',
    path: userPath(APPROVALS.zawadi),
    heading: TEXT.longName,
    regions: {
      Request: 1,
      Identity: 1,
      'Requested access': 1,
      'Role assignments': 1,
      'Branch assignments table': 1,
      'Control checks': 1,
    },
  },
  {
    label: 'user approval, Approve disabled',
    path: userPath(USERS.carol),
    heading: 'Carol Wambui',
  },
  {
    label: 'reject and revoke dialog',
    path: userPath(USERS.carol),
    heading: 'Carol Wambui',
    open: async (page: Page) => {
      await press(decision(page, 'Reject & revoke'));
      await expect(
        page.getByRole('alertdialog', { name: 'Reject and revoke Carol Wambui?' }),
      ).toBeVisible();
      // Scan once the fade has finished: axe blends ancestor opacity into colour contrast.
      await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
    },
  },
  {
    label: 'failed approval',
    path: userPath(APPROVALS.rose),
    heading: 'Rose Atieno',
    open: async (page: Page) => {
      const dialog = await decide(page, 'Approve');
      await expect(dialog.getByRole('alert')).toContainText(APPROVE_FAILED);
      await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
    },
  },
  {
    label: 'branch approval (100 characters)',
    path: branchPath(APPROVALS.lamu),
    heading: TEXT.longBranch,
    regions: { Request: 1, Branch: 1, 'Control checks': 1 },
  },
  {
    label: 'notifications popover',
    path: '/admin/approvals/users',
    heading: 'Approval queue',
    open: async (page: Page) => {
      await press(await bell(page, 'Notifications: 11 approvals waiting'));
      await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
      await expect(page.locator('.MuiPopover-paper')).toHaveCSS('opacity', '1');
    },
  },
] as const;

// The describe's title is what the two --grep chunks select on ("approvals: accessibility .*\(light"
// and "…\(dark"): the grep text is the project, file, describe and test titles joined by spaces.
test.describe('approvals: accessibility', () => {
  test.describe.configure({ timeout: 60000 });

  for (const surface of SURFACES) {
    for (const a11yCase of A11Y_CASES) {
      test(`has no serious or critical violations: ${surface.label} (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
        context,
        page,
      }, testInfo) => {
        await applyA11yCase(page, a11yCase);
        await authenticate(context, testInfo, 'approvals');
        await enterAdmin(page, surface.path, { heading: surface.heading, branch: ALL_BRANCHES });
        // The bell streams behind its own Suspense boundary: every scan and the 375 px page-width
        // check include the finished header.
        await bell(page, 'Notifications: 11 approvals waiting');
        if ('open' in surface) await surface.open(page);
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);
        if ('regions' in surface) {
          for (const [name, count] of Object.entries(surface.regions)) {
            await expect(page.getByRole('region', { name, exact: true })).toHaveCount(count);
          }
        }
      });
    }
  }
});
```

- [ ] **Step 3: Run** — form E with `--grep "approvals: accessibility.*\(light"`, then
      `--grep "approvals: accessibility.*\(dark"`: PASS, each selecting exactly 16 tests (check
      with `--list`). Mutation proof: rename `UserBranchAssignmentsTable`'s region to "Role
      assignments" in a scratch edit (the user approval page's region counts fail; revert — 10's
      file is not 12's to change).

- [ ] **Step 4: Commit** (form C):

```
test(e2e): add the approvals accessibility matrix

Light and dark, at 1280 and 375 px, one test per surface: both queue tabs, the user approval page
with the 100-character name and the unbreakable email, the disabled Approve, the Reject & revoke
alertdialog, a failed approval, the branch page with its 100-character name, and the bell's
popover, each scanned once its transition settled, with every table region's count asserted.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

#### Task 11d: The docs

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/backend-gaps.md`

- [ ] **Step 1: README.** In the directory tree, the `admin/` entry's comment becomes:

```
│   ├── admin/                 # Overview, Approval queue, Users & access, Branches, Roles &
│   │                            # permissions, Settings, Business date, and Audit trail pages
```

      and after `│   │   ├── layout.tsx           # Redirects a platform context to /platform-admin`
      insert:

```
│   │   ├── approvals/           # Approval queue: User onboarding and Branch activation tabs
│   │   │                          # ((queue)/), and the user and branch approval pages with the
│   │   │                          # decision bar (users/[userId]/, branches/[branchId]/)
```

      In the `modules/` tree, after `…settings/ holds the settings catalogue's contract, rules,
      # service and Server Actions (modules/administration/settings/)` add the line:

```
│                                # approvals/ holds the approval queue's rules, control checks,
│                                # bell arithmetic, service, decision actions and components
```

      In the `components/` tree, the shell entry's comment becomes:

```
└── shell/                      # AppShell, header, drawer, context switcher dialog, app switcher,
                                 # user menu, workspace navigation, tenant-/platform-notifications
                                 # (app-bar slots, spec §8: the tenant bell counts approvals
                                 # waiting; the platform bell counts institutions pending
                                 # approval) and NotificationsMenu
```

      Replace the bullet that begins "Administration currently ships the Overview, Users &
      access, …" (four lines, ending "`modules/administration/administration-navigation.ts`.")
      with:

```markdown
- Administration ships the Overview, Approval queue, Users & access, Branches, Roles &
  permissions, Settings, Business date, and Audit trail pages.
- The Approval queue (`/admin/approvals`, `modules/administration/approvals/`) lists memberships
  pending approval (User onboarding) and branches pending activation (Branch activation), each
  tab paged in the URL and counted in its label, and opens a page per request with who asked and
  when, the requested access, control checks and a decision bar. The app bar's bell counts the
  same approvals. Known limits:
  - There is no approval-request model: no return for changes, resubmission, branch rejection or
    remarks on Approve (`docs/backend-gaps.md` BG-01).
  - The maker comes from the audit log, so without `audit.view` (or when that read fails) Approve
    and Activate stay on offer, the check reads "Verified by the platform on approval", and a
    refusal is explained as permission or maker-checker (BG-08).
  - Approve, Reject & revoke and Activate re-read their subject and refuse before any write when it
    changed since the page loaded, the account is blocked (suspended, locked or being
    deactivated), or you made the request.
  - An institution with a single administrator can't decide its own requests: another
    administrator must approve their invitees and activate their drafts (BG-02).
  - A user whose identity is still provisioning was already approved: the queue marks them and
    offers no decision (BG-11). Missing prerequisites (a role, a branch) are explained after the
    platform refuses (BG-07).
  - Activation needs All branches; with a branch selected the queue says so (BG-03). Permission
    codes carry no scope, so a holder of `branch.activate` at branch scope only is told to switch
    to All branches, where they don't hold it (BG-33).
  - The requested roles show one page of 100 and say so when there are more; branch assignments
    come from the bounded scan (BG-09). The bell has no push updates (BG-22).
```

      Replace the bullet that begins "Beyond context discovery/selection, …" (five lines) with:

```markdown
- Beyond context discovery/selection, profile retrieval, Platform Administration's institutions,
  overview, institution branches and users, and platform users, and Administration's Approval
  queue, Users & access, Branches, Roles & permissions and Settings above, these are not connected
  yet: the Invite user wizard (layer 11) and the Administration overview's operational sections
  (layer 14).
```

      and in "Next recommended implementation steps", item 2 becomes:

```markdown
2. Build out the Invite user wizard (layer 11) against real data, registering what it needs.
```

- [ ] **Step 2: AGENTS.md.** After the sixth exception's paragraph (ending
      "`docs/superpowers/plans/2026-10-03-admin-parity-17-platform-records.md`, Ruling 10)."), add
      these lines as they are, indented two spaces like the exceptions before them:

```text
  The user approval page's Requested access (`modules/administration/approvals`'s
  `listRequestedRoles`: one page of 100 ACTIVE role assignments, saying so when there are more,
  beside 10's bounded branch-assignment scan) is a seventh, named exception: one pending member's
  access shown before a decision, not a data-listing directory, with their record holding the
  rest — no licence for an unbounded list (plan
  `docs/superpowers/plans/2026-10-04-admin-parity-12-approvals.md`, Ruling 8).
```

- [ ] **Step 3: `docs/backend-gaps.md`.** BG-01's **Frontend handling** becomes:

```markdown
- **Frontend handling:** a typed approval inbox (User onboarding, Branch activation) built from
  `membership_status=PENDING_APPROVAL` and `status=PENDING_APPROVAL` reads, with a page per request
  (requested access, control checks); decisions limited to approve and reject-and-revoke for users
  and activate for branches; assignments presented as immediately effective.
```

      BG-08's **Frontend handling** becomes:

```markdown
- **Frontend handling:** maker looked up from audit when `audit.view` is held; otherwise the approve
  action stays enabled and a 403 is explained as "permission or maker-checker". The user record
  disables Approve for the user's inviter (the `user.invite` actor). The approval queue's pages
  disable Approve for the inviter and Activate for the drafter the same way, and their actions
  refuse before any write; when the maker can't be read, the control check reads "Verified by the
  platform on approval".
```

      BG-22's text becomes:

```markdown
No notification feed. The platform bell counts institutions pending approval with one `size=1`
read, for holders of `tenant.approve` and `tenant.view` (layer 17); the administration bell counts
users waiting for approval (pending less provisioning: two `size=1` reads) and branches waiting
for activation (one), for holders of the matching codes (layer 12). Suggested: a
notifications/inbox endpoint.
```

- [ ] **Step 4: Settle the formatting** — `pnpm exec prettier --write` on `README.md`,
      `AGENTS.md` and `docs/backend-gaps.md`, repeated until it changes nothing; then
      `pnpm exec prettier --check` on the three.

- [ ] **Step 5: Commit** (form C):

```
docs(approvals): describe the approval queue and the tenant bell

README describes the Approval queue, its decision rules and limits (BG-02 and BG-33 among them),
and the administration bell; AGENTS.md names the requested-access page of roles as the seventh
bounded-list exception; BG-01, BG-08 and BG-22 record how the queue and the bell handle the gaps.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

---

## Layer gate (the controller's; not a task)

1. **Static and unit:** `pnpm check` (format, lint, `tsc`, the full Vitest run) and `pnpm build` on
   the layer's last commit; both clean. `git status` clean.
2. **E2E:** the full Playwright suite through the wrapper in chunks of at most 8 minutes (every
   spec, not only 12's: the bell now renders in the `users`, `branches` and `approvals` scenarios,
   and the user menu changed at 1200–1535 px). All green; no retries needed on a second run.
3. **Visual and keyboard pass** (a person or the controller with a real browser), separately at
   **1440 px** and **375 px**, light and dark, in the `approvals` scenario unless named:
   - the queue: both tabs with rows, both empty states (`approvals-empty`), the 403 state
     (`approvals-limited` has the codes, so use a typed URL in `default`), the branch-context note
     with and without the Switch button, the tab labels' counts;
   - the user page for Zawadi (the 100-character name and the unbreakable email: the h1 and the
     subtitle wrap inside the hero; the decision labels stay on one line), Carol (Approve disabled
     with its caption under the buttons), Usha (the blocked caption), Daniel (the provisioning
     note, no bar), Rose after a failed Approve (the dialog's alert has vertical margin; focus on
     the confirm button), Samuel's Reject & revoke (an alertdialog; the field error tied to the
     field), and `approvals-limited` (four "Checked on approval" chips, none truncated at 375 px);
   - the branch page for Lamu (the 100-character name), Naivasha (Activate disabled), Kericho
     after Activate (focus on the h1), and a branch-context visit ("Branch not available here");
   - the bell: the badge, the popover with both entries, the branch-context hint, Escape returns
     focus to the bell; the header at 1200, 1280 and 1440 px in `approvals-long-org` (the
     88-character organisation name, with the bell: nothing overlaps, the status word whole, the
     name ellipsized without pushing the bell or the user menu out);
   - keyboard only: Tab reaches each table region (the theme's inset focus ring shows), the tabs
     move with the arrow keys, every dialog opens with focus on the dialog and closes back to its
     trigger, and no focus is ever lost to `body` after a decision or a failure.
4. **Extra axe scans** (beyond 11c's matrix) on every dialog and every failed, forbidden and empty
   state named in step 3, light and dark: no serious or critical violation.
5. **Docs:** README, AGENTS.md and `docs/backend-gaps.md` match what shipped; the plan's ruling
   table records the user's answers.
6. **Squash** the layer's commits into one on `admin-parity/12-approvals` with a summary message
   and the two trailers; open the stacked PR against `admin-parity/17-platform-records`.

## Controller live check (against the real backend; not a task)

Only a person signs in; the controller never enters credentials. Reads first; then each
irreversible write only after the person explicitly approves **that** action, named, in the
conversation.

1. **Reads (no approval needed):** sign in as a tenant administrator with `user.approve`,
   `branch.activate`, `membership.revoke`, `audit.view` and the `.view` codes, at All branches.
   Open the Approval queue: both tabs and their counts match the bell. The bell's three reads run
   on a full load and after a decision's refresh, not on a client navigation (the authenticated
   layout doesn't re-render), so between those it can be stale; watch the request log against the
   600/min budget. Open one user
   request and one branch request: the maker and time match the audit trail; the requested roles
   and branches match the user's record; every control check's state is right. Switch to a
   branch: the tab's note and the hidden-branch guidance show; the bell adds the switch hint.
   Record the activate response body shape from the API docs (no write; an audit event carries
   no response body); the first approved write (step 2) confirms `membership_status` and
   `user_status` are present.
2. **Approve (irreversible; needs explicit approval for the named membership):** with a second
   identity's pending invitation (approver ≠ inviter), Approve. A 202 starts real Keycloak
   provisioning and may send an invitation email; a 200 activates the membership. Confirm the
   toast matches the outcome and the page shows the provisioning or approved note.
3. **Reject & revoke (terminal, BG-28; needs explicit approval for the named membership):** on a
   throwaway pending invitation, with a reason. The email can never be invited to the institution
   again. Confirm the revoked note, and that a second tab's stale Reject is refused.
4. **Activate (permanent, BG-01; needs explicit approval for the named branch):** a pending branch
   drafted by someone else, at All branches. A live branch can be suspended or closed but never
   returns to a draft. Confirm the activated note and the bell's count.
5. **Maker-checker:** open a request the signed-in person made: Approve or Activate is disabled
   with its caption (no write). If a role without `audit.view` is available, confirm the check
   reads "Verified by the platform on approval" (no write).

## Self-review

- **Spec coverage.** §10.6: both tabs, server-paginated, with their counts (Task 6); provisioning
  rows (Ruling 12); the detail pages' requested change, facts, requested access with the partial
  flag, maker and time, control checks, and history by link (Tasks 5b, 5c, 7, 8); the decision bar
  with 200/202 copy and the maker disable (Tasks 4, 5a). §8: the nav item (6a) and the badge (9b). The
  "not available" list (BG-01), BG-02 and BG-33 are stated in the README (11d).
- **L1 (L17-R21).** No service catches (Task 2's test); `knownMaker` is the one selective catch
  (4a); failed reads say so with references (5b, 7a, 8, 9b); the bounded roles page and scan say
  when partial (5b); every table region is named, focusable and counted (7a, 8, 11c).
- **L2 (safety).** Backend ids, case-insensitive comparisons, a fail-closed profile in all three
  actions, refusals before any write (a branch context before any read), "Verified by the platform
  on approval", `contextOrganisationId` and the minted key, `runServerAction` + `explain`,
  `expectScoped` and a same-key retry for every decision (5a), mutation proofs per guard (Tasks 4a,
  4b, 5a, 7b, 8); the id parsers are 10's and 17's, not new ones.
- **L3 (test discipline).** Default resolved profiles and `env.server` mocks in the action
  harnesses; distinct, lettered first blocks; a page test per route with redirects, 403/5xx/empty,
  the past-the-end redirect and the id guard; `delay: null` and focus in its own `waitFor`; a P-1
  test that fails with the fix reverted (3a); e2e `expectHydrated`, the awaited bell (and the
  streamed chip before asserting no bell), filtered toasts, exact names and region-scoped exact
  text, one scenario per test, the 79-character email, `describe.configure` budgets, and the matrix
  by surface whose two `--grep` patterns select sixteen tests each.
- **L4 (visual).** `nowrap` decision labels beside the 100-character name; focus after a
  form-level failure (3a); the decision bar's focus rule (5a); dialog alerts keep the kit's margin;
  copy says what the screen shows (the tab count vs its rows, the Request line by kind, one word
  for a blocked account, "approves or activates"); the header ruled first (Q1, 9a), guarded by a
  test that can fail (11a, with Task 9a reverted as its mutation proof).
- **L5 (process).** Large tasks are split into sub-tasks along natural seams; the largest briefs
  (4a, 5a, 7a, 8a) are 530–623 lines, almost all of it complete code; 26 commits, each ending on a
  clean tree; docs in 11d; prettier settled; no model names, no scratch paths; the trailers exact.
- **L6 (Next 16 / MUI v9).** No dotted `color` on Typography/Box; no function prop crosses
  to a client component (`sortHref` stays server-side; `DecisionBar` takes primitives and a
  discriminated `subject`); reads through the services' `apiGet` and `load()`; lists through
  `TablePaginationBar`; one new named paging exception, recorded in AGENTS.md.
- **Placeholders.** None: every code block is the complete file, or an exact edit with its anchor.
- **Type consistency.** Every file the plan creates or changes was type-checked together with
  `next build` on `2dbfe16` (exit 0); after the revision, `tsc`, ESLint, Prettier and the full
  Vitest suite ran clean on the revised code, and the P-1 test was seen to fail with its fix
  reverted. Playwright was not run while planning, so each task's gate runs it.
