# PR 14: The Administration Overview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [plan index](./2026-09-25-admin-parity-00-index.md),
> the layer-14 section of the [handoff](./2026-10-02-admin-parity-handoff.md), the
> [12 approvals plan](./2026-10-04-admin-parity-12-approvals.md) (its bell and approval service
> are this layer's counts) and the [11 invite wizard plan](./2026-10-12-admin-parity-11-invite-wizard.md)
> with its errata (what broke in practice) first.

**Goal:** Build the tenant overview at `/admin` (spec §10.8, §6.3, §7.3, D11), the last planned
layer of the administration parity series:

- **Business date**: the current business date (from its `dd-MM-yyyy` value, no timezone shift)
  and its status, linking to the business date page;
- **Pending approvals**: the bell's counts with a link to each queue tab, then up to five requests
  (users waiting for approval first, then branches waiting for activation, each newest first),
  each with **Review**, and the identities still provisioning noted apart;
- **Operational readiness**: five items (Institution profile, Branches, People, Onboarding,
  Business date), each computed from live reads by the spec's rules and shown as Ready, Needs
  attention, Can't be checked or Couldn't be checked, each linking to the page where it is dealt
  with when the holder can open that page, under one teal progress bar for the share ready;
- **Recent activity**: the latest audit events, up to five (action, actor, time in the
  organisation's timezone), each opening in the audit trail.

The page keeps its one h1, "Administration Overview", which four existing e2e specs assert. Nothing
is mocked: every card reads the platform API, a card the holder could never read or act on is
omitted, and when none applies one note under the heading says so. No later layer depends on 14.

**Architecture:**

- `/admin` (`app/(authenticated)/admin/page.tsx`) stays a Server Component. It reads the cached
  profile, renders the heading alone outside the administration workspace (layouts and pages
  render in parallel, so `admin/layout.tsx`'s redirect of a platform context doesn't stop the page:
  it guards the workspace itself, as the bell does), decides from the permission codes which cards
  to show **before any read** (Ruling 2), and renders each card inside its own `Suspense` boundary
  with a skeleton fallback (spec §6.3), so the heading streams at once and a slow or failed card
  never holds up another.
- Each card is one file in `modules/administration/overview/components/` holding a presentational
  card (Server-Component safe: links through `components/navigation/next-link.tsx`, MUI
  `LinearProgress` and `Skeleton` given primitives only) and its async section, which makes the
  card's reads in parallel, each settled by `load()` (a lost session redirects to sign-in, a stale
  context to context selection, any other failure shows in that card alone, with its reference).
- Pure, client-safe rules: `readiness-rules.ts` (the five items, their states, their links and
  the bar) and `overview-rules.ts` (which cards a holder sees, the approvals preview, the activity
  rows, the copy). `overview-service.ts` adds the two counts no layer has yet (active branches,
  active memberships) and the five-event audit read; everything else is reused and shared per
  request with the app bar through `cache()`: 12's approval counts and queue pages (the bell's
  reads), 07's business date (the header chip's read), 13's settings, 06's audit reads and lookups.
- No new `'use client'` file, no new theme token, no new route in the fake API.
- Cross-layer edits, each in its own commit: the `/admin` page and its test (Task 8);
  `e2e/fake-api/scenarios.mts` (four scenarios, Task 9); README, AGENTS.md (a ninth named paging
  exception) and `docs/backend-gaps.md` (Task 11).

**Tech Stack:** Next.js 16.4 (Server Components, `Suspense` streaming), React 19.3 (`cache`,
`Suspense`), MUI 9.5 (`LinearProgress`, `Skeleton`, `Alert`, `Link`), zod 4.6, Vitest + RTL,
Playwright 1.64 + axe. No new packages.

**Spec:** [`…-design.md`](../specs/2026-09-25-admin-prototype-parity-design.md): §10.8 (the four
cards and the readiness table), §6.3 (at most about ten reads; widgets in `Suspense`), §7.3
(`MuiLinearProgress`: 8 px, rounded, teal), §9 (`SectionCard`, `StatusChip`, `ActivityList`,
`ErrorState`; formatting: instants in the organisation's timezone, business dates without a zone
shift), §8 (the bell, whose counts the approvals card shares), D11.

Contract (`…-api-contract.md`): §A (paging, context re-validation: organisation ACTIVE on every
request), §C (`UserProfile.organisation.status`, `UserInTenantSummary`, `MembershipSummary`,
`BranchSummary`, `BusinessDateResponse`, `TenantSetting`, `AuditEventSummary`), §E.3 (the reads in
the wire table below), §G (audit actions), §H (the settings catalogue's defaults). Gaps: BG-02,
BG-04, BG-09, BG-11, BG-15, BG-16, BG-21, BG-22, BG-31, BG-33.

**Base:** `e6f7e7e` (`origin/main`: layers 09, 16, 10, 17, 12 and 11 merged, with 11's dependency
upgrade). The layer ships as one commit on `admin-parity/14-overview` against `main`. The controller
keeps the layer's ledger. The **Pre-flight notes**, **Layer gate**, **Controller live check** and
**Self-review** sections are not tasks.

**Plan history:** drafted 2026-10-18 on `22a1d89`, then rebased the same day onto `e6f7e7e` (PR #67,
layer 11, merged): the shared files below are edited as they stand on `e6f7e7e`. Revised the same
day after two adversarial reviews and the maintainer's answers: all eleven questions answered (each
recorded in the Rulings table), Ruling 12 changed (each readiness item links to its page), and the
reviews' fixes applied (the workspace guard, the failed-read scenario, the users preview past
provisioning identities, the activity lookups' codes, the no-cards note, the organisation status's
wiring, more guards with failing tests). The plan was re-applied and checked again on `e6f7e7e`
(Self-review).

## Global Constraints

Sources: **A** = `AGENTS.md`; **H3.n** = handoff §3 standing rule n; **C** = the controller's
rulings for this layer; **L1–L8** = the lessons of layers 09, 16, 10, 17, 12 and 11 this layer is
bound by: **L1** failed reads, bounded scans and regions (no blanket catch; a failed read never
shown as absence or zero; a capped list says so; regions named and counted); **L2** safety actions
(none here: the overview mutates nothing); **L3** test discipline (a default profile and the
`next/headers` mock wherever `load()` runs, distinct lettered first blocks in ids, a page test per
route, e2e hydration before a click, exact names, one scenario per test, chunkable `describe`
titles with their own timeouts); **L4** visual and focus (accurate copy that says what the reads
proved); **L5** process (split briefs, one commit per task on a clean tree, docs, prettier); **L6**
Next 16 / MUI v9 rules (AGENTS.md); **L7** CI's browser: CI runs Playwright 1.64's
`chrome-headless-shell` 156 with `CI=true` and two retries, while the sandbox's default browser is
the full Chrome 141, whose layout differs by a few pixels, so layout-sensitive e2e is checked
through the controller's CI-browser wrapper with `--retries=0`, and a case that wraps in every
browser (a narrower viewport) is the portable pin; **L8** never kill a dev server with a pattern
that matches your own command line: kill by pid, and check ports 3100 and 3199 in
`/proc/net/tcp` (`lsof` is unreliable here). **11's first-hit lesson** (its errata): a route's first
hit compiles under a cold `next dev` for tens of seconds, so every first visit waits `FIRST_HIT`
(45 s), not 15 s. Every task's requirements include this section.

**Command forms.** Every command runs from the repository root with Node 24 (`package.json`
`engines`) and the environment `config/env.server.ts` validates; the controller's brief gives the
Node path, the env file and the E2E wrapper for each task:

```bash
# U — focused unit tests (foreground)
pnpm exec vitest run <test files>
# P — prettier on .mts files (lint-staged skips them; the hook's format:check doesn't)
pnpm exec prettier --write <.mts paths>
# E — E2E only through the controller's wrapper (the repo's Playwright config on CI's browser; it
#     forwards Playwright's arguments), in the foreground, chunks of at most 8 minutes (--grep),
#     with --retries=0
<e2e wrapper> <spec files> [--grep <pattern>] --retries=0
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
   `pnpm-lock.yaml` don't change; **no new theme token**: the teal bar is `LinearProgress`'s own
   `color="success"` on the theme's existing track, and every chip and alert reuses pairs
   `theme/tokens.test.ts` already gates (Ruling 4). Muted text is `sx={{ color: 'text.secondary' }}`,
   never `color="text.secondary"` on Typography, Box, Stack, Grid or DialogContentText. [A]
4. Server Components only: this layer adds **no** `'use client'` file. Links pass
   `@/components/navigation/next-link` as `component`; MUI client components (`LinearProgress`,
   `Skeleton`, `Link`, `Alert`) get primitives and plain-object `sx` only; no element goes into an
   MUI prop gated by `isValidElement`/`cloneElement`. [A, H3.3]
5. **Gate before any read (Ruling 2).** Outside the administration workspace the page renders its
   heading alone and reads nothing. Inside it, the page decides each card from `/auth/me`'s codes
   (`overviewCards`) and renders an omitted card's section not at all; when no card applies, one
   `role="note"` sentence says so (`NO_OVERVIEW_CARDS`). A section reads only what its holder's
   codes allow (`READINESS_CODES`, 12's `USER_APPROVAL_CODES` and `BRANCH_ACTIVATION_CODES`; the
   activity card's names with `user.view` and timezone with `tenant.view`). An item it can't read
   says "Can't be checked with your permissions.", never "Ready" and never absence; a link is
   offered only when the holder can open its page (`READINESS_LINKS`, Ruling 12). [C, L1]
6. Reads go through `apiGet` in services (the existing ones and `overview-service.ts`, whose
   functions **reject** on failure: no catch); every card settles each read with `load()` (a 401
   redirects to sign-in, a stale context to context selection) and shows any other failure in that
   card alone with its reference. **A failed read is never shown as absence or as zero.** [A, L1]
7. Each card sits in its own `Suspense` boundary whose fallback is `OverviewCardSkeleton` (the
   card's title at once, an `aria-busy` body); the page's h1 is outside every boundary. [C, spec
   §6.3]
8. One `h1` ("Administration Overview", unchanged: four existing specs assert it); each card is a
   named region (`SectionCard`, h2); readiness items are h3; every list has `role="list"` (and a
   name where a test or a screen reader needs one); the bar has an accessible name and
   `aria-valuetext`; static notices are `Alert role="note"`; long names and unbreakable emails
   wrap (`overflowWrap: 'anywhere'`); 375 px shows no horizontal page scroll; no serious or
   critical axe violation in light and dark at 1280 and 375 px. [A, L4]
9. **No overview link's accessible name contains "audit trail":** `e2e/audit.spec.ts` finds the
   navigation item with an unscoped `getByRole('link', { name: 'Audit trail' })`, a
   case-insensitive substring match (Rulings 6 and 12). [C]
10. Every user-visible string is defined once (`readiness-rules.ts`, `overview-rules.ts`, or 12's
    `approvalNotifications` and `NOTHING_WAITING`, reused, never copied) and quoted verbatim in the
    e2e. [C]
11. Lists stay bounded: the approvals preview reads one page of five branches and one bounded page
    of users (five plus the identities still provisioning, at most 100, BG-11), the activity card
    one page of five, each linking to its paginated list — AGENTS.md's **ninth** named exception
    (Task 11). [A, H3.7]
12. Fake-API files run under plain `node`: relative `.mts` imports, `import type`, erasable
    TypeScript only; seeds use the `14000000-0000-4000-8000-…` prefix with lettered tails; never
    mutate another layer's builder's state (new arrays and objects only); new `BUILDERS` entries go
    last with a `// Layer 14 (overview).` comment; **no route changes** (`server.mts` untouched);
    **the 35 existing scenarios serialise identically** (Task 9's check). [A, H3.5, H3.6]
13. E2E: every test signs in to its own fake-API run (`authenticate()`); one scenario per test;
    every first visit waits `FIRST_HIT` (45 s); the overview is "settled" when no `aria-busy`
    element is left in `main`; the bell is awaited before a scan; `expectHydrated` before a click;
    names matched `exact` inside their card's region; each `describe` sets its own timeout with
    `test.describe.configure` (90 s behaviour, 60 s accessibility); the matrix runs inside one
    `describe('overview: accessibility')`, each title ending `(scheme, viewport)`, so
    `--grep "overview: accessibility.*\(light"` and `…\(dark` each select eight; the behaviour
    `describe` (`overview: the cards`) shares no prefix with it. A state chip is asserted by its
    exact words (a detail can contain them). [L3, L7]
14. Unit tests: every section test mocks `next/headers` (load()'s catch reads the headers) and
    keeps `next/navigation` real, so a redirect is asserted by its digest; `vi.resetAllMocks()` in
    `beforeEach`; ids distinct in their first block and lettered; the page test stands each section
    in with a synchronous mock and walks the returned element tree for the Suspense fallbacks (RTL
    can't render an async Server Component). Test output stays pristine. [L3]
15. Cross-layer edits are additive and announced (**Shared changes**, below), each in its own
    commit. Nothing else outside `modules/administration/overview/`, the two new specs and the
    docs. [H3.2]
16. No new backend gap (BG-36 onwards stays free); BG-02, BG-04, BG-11, BG-15, BG-21, BG-22 and
    BG-33's frontend handling is updated in Task 11. [C]
17. Every commit ends with exactly these two trailer lines, and no model name appears in code, docs,
    commit messages or trailers:

    ```
    Co-Authored-By: Claude <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
    ```

18. Update `README.md` and `AGENTS.md` where the architecture or a documented limit changes (Task
    11); the plan's trailing gate, live-check and self-review sections are the controller's. [A]

**Wire contract** (contract §E.3, all tenant routes; **T** tenant scope). Every read is a `GET`;
the overview writes nothing.

| Read                                                                                           | Permission           | Card (who else reads it, shared per request)                   | 14's handling                                                                                      |
| ---------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `/auth/me`                                                                                     | `iam.profile.read`   | page (the shell)                                               | the codes that gate each card; `organisation.status` for Institution profile (Ruling 3)            |
| `/tenant/business-date`                                                                        | `business_date.view` | Business date, Readiness (the app bar's chip)                  | date and status; Business date item OPEN                                                           |
| `/tenant/users?membership_status=PENDING_APPROVAL&page=0&size=<5 + provisioning, at most 100>` | `user.view` (T)      | Pending approvals, after the count below                       | the user preview; provisioning rows left out, so five actionable rows show when they exist (BG-11) |
| `/tenant/users?membership_status=PENDING_APPROVAL[&user_status=PROVISIONING_IDP]&size=1`       | `user.view` (T)      | Pending approvals, Readiness (12's bell: `countUserApprovals`) | pending less provisioning, clamped (12's arithmetic)                                               |
| `/branches?status=PENDING_APPROVAL&sort_by=createdAt&sort_dir=DESC&page=0&size=5`              | `branch.view` (T)    | Pending approvals                                              | the branch preview; its total is the count                                                         |
| `/branches?status=PENDING_APPROVAL&sort_by=createdAt&sort_dir=DESC&page=0&size=1`              | `branch.view` (T)    | Readiness (12's bell: `countBranchActivations`)                | Branches item: none pending                                                                        |
| `/branches?status=ACTIVE&sort_by=createdAt&sort_dir=DESC&page=0&size=1`                        | `branch.view` (T)    | Readiness                                                      | Branches item: at least one active (BG-15)                                                         |
| `/tenant/memberships?membership_status=ACTIVE&page=0&size=1`                                   | `membership.view`    | Readiness                                                      | People item: at least two (BG-02)                                                                  |
| `/tenant/settings?size=100`                                                                    | `settings.view`      | Readiness (13's `listSettings`)                                | Institution profile: `default_timezone` and `base_currency` set; a masked value counts as set      |
| `/tenant/audit-events?page=0&size=5`                                                           | `audit.view`         | Recent activity                                                | newest first                                                                                       |
| `/tenant/users/{id}` per distinct actor                                                        | `user.view`          | Recent activity (06's `resolveUserNames`, cached per id)       | actor names, read only with `user.view`; else (or unreadable) a short id                           |
| `/tenant`                                                                                      | `tenant.view`        | Recent activity (06's `getOrganisationTimeZone`, cached)       | the timezone of the times, read only with `tenant.view`; else UTC                                  |

A tenant route refuses a code held only at branch scope (BG-33): `/branches` and `/tenant/users`
check theirs at tenant scope, so a role granting `branch.view` at Head Office alone passes the
page's gate and gets a 403, shown as that item's or card's failure (Ruling 8, the
`overview-branch-scoped` scenario).

**Files 14 never touches:** `app/(authenticated)/layout.tsx` and `admin/layout.tsx`; every shell
file (`tenant-notifications.tsx` included); `lib/*`; `auth/*`; `config/*`; `theme/*`; every kit
file (`components/data-display/*`, `components/navigation/*`); `modules/administration/**` except
the new `overview/` directory; the navigation registry; the fake API's routes, `server.mts`,
`state.mts` and every `.mts` file but `scenarios.mts`; existing e2e specs and `e2e/support/*`; other
layers' plans and the plan index.

## Rulings for this layer

Decisions the implementer can't make. The maintainer answered all eleven questions on 2026-10-18
(two were BLOCKING: Q1 and Q2), changed Ruling 12 and confirmed the failed-read coverage and the
empty approvals copy; the last column records each answer, and each ruling below carries it and
names its cost if wrong. Nothing is open.

| Q   | Decision the plan carries                                                                                                                                                                         | Kind     | Maintainer's answer                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| Q1  | The five readiness rules exactly as spec §10.8 words them; Institution profile reads the stored settings keys and, while they are unset, says settings can't be saved yet (BG-04) (Ruling 1)      | BLOCKING | Confirmed: A, the spec's rules literally, with the BG-04 sentence       |
| Q2  | A card the holder could never read or act on is omitted, decided before any read; an unreadable readiness item says "Can't be checked with your permissions"; no card at all: one note (Ruling 2) | BLOCKING | Confirmed: A, plus the one-line note when no card applies               |
| Q3  | The organisation's status comes from `/auth/me`, not `GET /tenant` (Ruling 3)                                                                                                                     | default  | Confirmed: A                                                            |
| Q4  | One teal bar for the share of items ready, each item's state in words; `color="success"`, no token (Ruling 4)                                                                                     | default  | Confirmed: A                                                            |
| Q5  | Pending approvals: the bell's counts and links, up to five rows users-then-branches, the users read past provisioning identities, provisioning noted apart, a failure per kind (Ruling 5)         | default  | Confirmed: A, the users read sized after the cached count               |
| Q6  | Recent activity is a compact list in the overview module, not `AuditEventTable`, not a kit `ActivityList` (Ruling 6)                                                                              | default  | Confirmed: A                                                            |
| Q7  | One column below `lg`, two at 1 : 2 from `lg`, in the spec's order; shared rows and re-flow accepted (Ruling 7)                                                                                   | default  | Confirmed: A, both consequences accepted                                |
| Q8  | Each card fails alone, with its reference; a lost session or a stale context redirects; the failed state is covered by a scenario (Ruling 8)                                                      | default  | Confirmed: A, with the `overview-branch-scoped` scenario                |
| Q9  | Nothing shared with 17's platform overview (Ruling 9)                                                                                                                                             | default  | Confirmed: A                                                            |
| Q10 | The two previews are AGENTS.md's ninth named paging exception (Ruling 10)                                                                                                                         | default  | Confirmed: A                                                            |
| Q11 | The no-cards note's words: "Nothing on this overview is available to your role here; the navigation lists the pages you can open." (Ruling 2)                                                     | default  | Confirmed: A, the plan's wording                                        |
| R12 | Each readiness item links to the page where it is dealt with, gated on that page's codes (Ruling 12)                                                                                              | changed  | Confirmed: the maintainer's change, per-item links (the draft had none) |
| R8  | Failed-read coverage: the `overview-branch-scoped` scenario, a fake check, a behaviour test and a matrix surface per scheme (Ruling 8)                                                            | coverage | Confirmed: A, add the scenario                                          |
| R5  | The empty approvals copy is the bell's "Nothing is waiting for your approval.", not the handoff's "Nothing awaiting approval" (Ruling 5)                                                          | copy     | Confirmed: the bell's words, recorded as a handoff deviation            |

1. **The readiness rules (Q1 = A, D11).** `readiness-rules.ts` evaluates the spec's table
   literally: Institution profile = the organisation ACTIVE and `default_timezone` and
   `base_currency` set (a masked value counts as set: it is hidden, not absent); Branches = at
   least one ACTIVE branch and none PENDING_APPROVAL; People = at least two ACTIVE memberships of
   any type (BG-02); Onboarding = no **user** approval awaiting a decision (pending less
   provisioning; the count and its words are 12's `approvalNotifications`, never a copy), with the
   identities still provisioning noted in the item's text without making it "Needs attention"
   (BG-11) — user onboarding only: branches waiting for activation are the Branches item's;
   Business date = status OPEN. Each item is `ready`, `attention`, `unknown` (not permitted) or
   `failed` (with its reference). While a key is unset the item reads "Not set: … Settings can't be
   saved yet." (BG-04: `SETTINGS_EDIT_ENABLED` is false, so nothing in the app can set them).
   Accepted cost: the state can be permanent, and not only for legacy tenants — layer 16's tenant
   wizard sends the two settings only when they are entered (`initialSettings`), so a tenant
   created through this app without them shows "Needs attention" until BG-04 closes. Cost if
   wrong: one rule function, its copy and its tests.
2. **What a holder sees (Q2 = A plus a note).** The page reads nothing outside the administration
   workspace: layouts and pages render in parallel (Next 16), so `admin/layout.tsx`'s redirect of
   a platform context doesn't stop the page, and it renders the heading alone there, as the bell
   returns nothing. Inside it, `overviewCards(holder)`: Business date with `business_date.view`;
   Pending approvals with either of 12's pairs (`user.approve` + `user.view` for users,
   `branch.activate` + `branch.view` for branches; the section reads only the kinds the holder can
   decide); Operational readiness while any one of its five read codes is held (the others say
   "Can't be checked with your permissions."); Recent activity with `audit.view`. Decided from
   `/auth/me` before any read; an omitted card renders nothing (no empty, forbidden or skeleton
   card). When no card applies, one `role="note"` sentence sits under the heading: "Nothing on this
   overview is available to your role here; the navigation lists the pages you can open." (Q11 =
   A). Accepted edge: a holder whose only code is `user.approve` sees "Approval queue" in the
   navigation, which then refuses (`NO_APPROVAL_ACCESS`), so "the pages you can open" says slightly
   more than holds for that holder. Cost if wrong: four conditions and a note on the page, and
   their tests.
3. **The organisation's status (Q3 = A).** From `/auth/me`'s `organisation.status`, read and cached
   for the shell: no `GET /tenant`, no `tenant.view`. Contract §A re-validates the organisation as
   ACTIVE on every request, so the value is ACTIVE whenever the page renders; the rule still checks
   it. So `READINESS_CODES.institution` is `settings.view` alone, and the page passes the profile's
   status through as a `string` after narrowing its organisation (a resolved tenant profile always
   has one), pinned by the page test "passes the profile's organisation status to the readiness
   card (Ruling 3)". Cost if wrong: one read and one code.
4. **The bar (Q4 = A).** One determinate `LinearProgress` per card: `value` = ready items ÷ 5 ×
   100, named "Operational readiness", `aria-valuetext` and a visible label "3 of 5 ready" (with
   " · N not checked" when some items can't be or couldn't be checked). An item that can't be
   checked never counts as ready. Teal is `color="success"` (`success.main`) on the theme's
   `surfaces.tertiary` track: 4.49:1 light and 7.56:1 dark against WCAG 1.4.11's 3:1, pinned in
   the card's test with the existing `theme/contrast.ts`; no token, no theme change, and
   `ListNavigationProgress` keeps its default (the handoff's carried-in item). Reduced motion:
   `app/globals.css` stills the bar's transition. Cost if wrong: the card's top block and its tests.
5. **The approvals preview (Q5 = A).** The bell's own entries from 12's `approvalNotifications`
   (text, tab link, and " Switch to All branches to activate them." with a branch selected), then
   up to `APPROVAL_PREVIEW_SIZE` (5) rows: users waiting for approval, then branches waiting for
   activation (12's `listBranchActivations`, one page of five, `createdAt DESC`). Each row reads
   "User onboarding · <email>" or "Branch activation · <code> · <type>" with a **Review** link
   named "Review <name>" to 12's request page. The card's description is "Requests waiting for a
   decision, newest first." and "Open the approval queue" heads it. "Nothing is waiting for your
   approval." (12's `NOTHING_WAITING`, the bell's words) shows only when every permitted read said
   so, **before** the provisioning note: "N identity is / identities are still being provisioned:
   approval already ran." A failed read adds "Users waiting for approval couldn't be loaded." or
   "Branches waiting for activation couldn't be loaded." with its reference, drops the counts
   (never a partial number), keeps the other kind's rows, and never says nothing waits.
   **The users read and BG-11.** With Keycloak administration disabled (the backend's default) an
   approved user stays PROVISIONING_IDP with a pending membership for good, so these rows only
   accumulate, and the endpoint lists the newest **user** first (contract §E.3), so approved
   newer users sort ahead of older undecided requests. The section therefore reads, after the
   bell's cached `countUserApprovals()`, one page of `min(100, 5 + provisioning)` users
   (`userPreviewSize`) and drops the provisioning rows: five actionable rows show whenever five
   exist and at most 95 identities are provisioning; beyond that the preview can come up short
   while the count and the queue still say how many wait. A failed count skips the users read. One
   bounded read of at most 100, within the ninth exception (Ruling 10). Cost if wrong:
   `pendingApprovalsView`, `userPreviewSize` and the section.
6. **The activity list (Q6 = A).** A compact list (`ACTIVITY_LABEL` "Latest events"): the action
   (06's `actionLabel`) as a link to `/admin/audit?event=<id>` (the audit trail with that event's
   drawer open), named "View event: <action>, <date> <time>" as the audit table's links are, then
   "<actor> · <date> · <time>". Each lookup reads only with its code (rule 5): the actors by name
   (06's `resolveUserNames`, one cached read per distinct actor) only with `user.view`, else a
   short id; the organisation's timezone (06's `getOrganisationTimeZone`) only with `tenant.view`,
   else UTC. The page passes both as booleans (`overviewCards(…).activity`). "System" for a system
   event; the description reads "The latest events. Times in <zone>." "View all activity" links to
   the audit trail; its name must never contain "audit trail" (rule 9). `AuditEventTable` isn't
   reused (900 px minimum, seven columns); no kit `ActivityList` (nothing else needs one). Cost if
   wrong: one component.
7. **The grid (Q7 = A).** `display: grid`, one `minmax(0, 1fr)` column below `lg`, and
   `minmax(0, 1fr) minmax(0, 2fr)` from `lg`, `alignItems: 'start'`, in the spec's order (Business
   date, Pending approvals, Operational readiness, Recent activity); the visual order is the
   reading and tab order. Both consequences are accepted: grid rows are shared across the two
   columns, so from `lg` Readiness starts below the taller of Business date and Pending approvals
   (a gap under the short Business date card); and an omitted card lets the others re-flow into
   the other column (the `default` administrator, without decision codes, gets Readiness in the
   wide column and Recent activity in the narrow one). Cost if wrong: four lines of `sx`.
8. **Failures (Q8 = A).** Each section settles its reads with `load()`: a 401 or a stale context
   redirects (the section rethrows Next's redirect, pinned by digest in each card's test); any
   other failure shows `ErrorState` (Business date, Recent activity), a sentence per kind (Pending
   approvals) or "Couldn't be checked" with "Couldn't be loaded. Reference: …" (a Readiness item).
   No card's failure touches another. A code held only at branch scope passes the gate and gets a
   403 from a tenant-scoped read (`/branches`, `/tenant/users`; BG-33): it shows as that card's or
   item's failure, with its reference. The `overview-branch-scoped` scenario (Task 9b) reaches it
   with no route change, and an e2e test and a matrix surface cover it (Task 10). Cost if wrong:
   four sections.
9. **Layer 17 (Q9 = A).** Nothing shared: 17's `KpiTile` shows counts and its `AttentionCard` is an
   institutions table. 14 reuses the kit (`SectionCard`, `StatusChip`, `ErrorState`), 12's bell
   arithmetic and words, 07's formatter and 06's lookups. Cost if wrong: a row of tiles.
10. **The ninth paging exception (Q10 = A).** The approvals preview (at most five requests, from
    one bounded users read of at most 100 and one five-row branch read) and the activity card
    (five events) are bounded previews linking to their paginated lists, as 17's platform overview
    preview is the sixth exception; their counts come from `totalItems`, with no scan. Task 11
    records the ninth in AGENTS.md. Cost if wrong: one paragraph.
11. **Reads per page (spec §6.3, assumption 9).** For a holder of every code one load of `/admin`
    issues **13 to 17** backend reads: `/auth/me` (1), the business date chip (1) and the bell's
    three counts (3), which every administration page issues; the cards' own seven (the users and
    branch previews, settings, the active-branch and active-membership counts, the audit page and
    the organisation timezone); and one name read per distinct actor among five events (1 to 5).
    Readiness and Pending approvals share the bell's counts and the chip's date through `cache()`,
    so those aren't read twice. Spec §6.3's "about ten" counts the page's own reads: the overview's
    are seven plus the names, the header's five are every page's, and the total is far inside the
    600-per-minute budget. Without the bell's codes Readiness reads the counts it needs itself.
    Cost if wrong: one card fewer, or a count from a preview's total.
12. **Readiness links (the maintainer's change).** Each item links to the page where it is dealt
    with, through the existing route constants and plain `NextLink`: Institution profile → "Open
    settings" (`/admin/settings`), Branches → "Open branches" (`/admin/branches`), People → "Open
    users & access" (`USERS_HREF`), Onboarding → "Open user onboarding" (`USER_QUEUE_HREF`, the
    queue's user tab), Business date → "Open business date" (`/admin/business-date`). Each link is
    gated on the codes its page needs (the navigation item's code; both of 12's user-onboarding
    codes for the tab) and is absent when the gate fails; it shows in every state of its item.
    No name contains "audit trail" (rule 9). The link sits under the item's detail, so the item
    stays compact at 375 px. Cost if wrong: `READINESS_LINKS`, one line of the card and their
    tests.
13. **Not built.** No history on the Business date card, no KPI tiles, no close-of-business
    readiness (BG-21), no decision on the overview (the queue decides), no change to 12's bell or
    queue, no theme token.

## Review Focus

Every reviewer (task and gate) checks these first; each names the tests that pin it.

1. **A failed or unpermitted read is never absence, zero or "Ready" (L1).** Pinned by
   `readiness-rules.test.ts` ("can't be checked without …", "never counts an item it could not
   check as ready"), `overview-rules.test.ts` ("says … failed, never that nothing waits, and gives
   no partial count", "never says nothing waits when the only read failed (L1)"),
   `readiness-card.test.tsx` ("reads nothing an item's code doesn't allow …", "marks a failed read
   on its own item …"), `pending-approvals-card.test.tsx` ("says a failed read failed …", "never
   says nothing is waiting when its only read failed (L1)", "doesn't read the users preview after
   its count failed"), `business-date-card.test.tsx` and `recent-activity-card.test.tsx` (their
   failure cases), and the e2e "marks a refused branch read on its own item and card, keeping the
   rest (BG-33)".
2. **The gate before any read (Ruling 2).** Pinned by `overview-rules.test.ts` ("which cards a
   holder sees", "knows when no card applies …"), the page test ("renders the heading alone,
   reading nothing, in the platform context", "omits a card the holder could never read or act
   on", "says once, under the heading, that no card applies …", "tells the activity card which
   lookups the holder may make"), the section tests ("reads only the kinds …", "reads no branches
   without both branch codes", "reads nothing an item's code doesn't allow …", "reads no branch
   count without branch.view", "names no actor without user.view …", "reads no timezone without
   tenant.view …") and the e2e limited test. The page's workspace guard is the bell's
   (`tenant-notifications.tsx`): layouts and pages render in parallel.
3. **One Suspense boundary and skeleton per card, the h1 outside (spec §6.3).** Pinned by the page
   test ("puts each card behind its own Suspense boundary and skeleton") and the e2e `settled()`
   wait.
4. **Redirects survive.** Each section's test sends a 401 to sign-in and a stale context to
   context selection by digest.
5. **The spec's rules and words.** Each readiness rule's ready, attention, unknown and failed case
   (`readiness-rules.test.ts`); the bell's words reused (`overview-rules.test.ts` "counts with the
   bell's words and links …", and the Onboarding item's text from `approvalNotifications`); the
   e2e quotes every string verbatim and each chip by its exact words.
6. **The existing specs keep passing.** The h1 is unchanged (shell, context, audit and approvals
   specs); no link name contains "audit trail" (`recent-activity-card.test.tsx` "never names its
   link after the audit trail …", `readiness-rules.test.ts` "gates the navigation's pages …", and
   `e2e/audit.spec.ts` "shows the rail link with audit.view …"); the 35 existing scenarios
   serialise identically (Task 9).
7. **Accessibility.** Named regions counted per scenario, the bar's name and value text, lists
   with roles, notes as notes, no page scroll at 375 px with the 100-character names and the
   unbreakable email (the e2e matrix, sixteen tests over four surfaces, the failed state among
   them).
8. **The readiness links (Ruling 12).** Each link's page and gate (`readiness-rules.test.ts` "links
   each item …", "offers no … link without …", "keeps a link while its item is …"), rendered under
   its item (`readiness-card.test.tsx` "links each item …", "offers no link to a page the holder
   can't open") and per scenario in the e2e (`expectLinks`).
9. **BG-11's preview.** `userPreviewSize` (five plus the provisioning count, at most 100), its use
   after the cached count (`pending-approvals-card.test.tsx` "reads both previews …", "never reads
   more than a page of 100 users"), and five actionable rows past five provisioning ones
   (`overview-rules.test.ts`).

## Pre-flight notes (the workflow's pre-flight phase; not a task)

The planner's pre-flight, first on `22a1d89` and re-verified on `e6f7e7e` (layer 11 merged), found,
and this plan already reflects:

- **Today's `/admin`** (`app/(authenticated)/admin/page.tsx`) renders only `PageHeader` (eyebrow
  `administrationModule.name`, h1 "Administration Overview", description "Manage your institution's
  operational setup, users, and controls.") with a static `metadata: { title: 'Overview' }`, which
  stays static (e2e/context.spec.ts relies on it). Its test renders it synchronously and asserts
  **no link** ("renders no sample or placeholder data"): Task 8 replaces both files.
- **The h1 is asserted by five places, not four:** `e2e/shell.spec.ts` (`enterGreenfield` and the
  first test), `e2e/context.spec.ts` (the overlays' matrix), `e2e/audit.spec.ts` (`enter('/admin')`),
  `e2e/approvals.spec.ts` ("hides the queue and the bell …", which the handoff's list missed) and
  the page test. The title is kept verbatim (`OVERVIEW_TITLE`).
- **The existing specs that open `/admin` now see the cards.** Their other queries are scoped to
  the banner or the navigation, except `e2e/audit.spec.ts`'s unscoped
  `getByRole('link', { name: 'Audit trail' })` (a substring match): an overview link containing
  "audit trail" would make it a strict-mode failure, hence rule 9. `e2e/shell.spec.ts` scans
  `/admin` with axe in `default` (light and dark; desktop, 375 px and the open drawer) and checks
  375 px for horizontal scroll in `long-names`, possibly while cards still stream: the skeleton is
  axe-clean and the cards wrap. No readiness link's name is a substring trap either: every other
  spec scopes its "Settings", "Branches", "Users & access" and "Business date" lookups to the
  navigation or the banner. The planner ran shell, audit, context and protected-routes (45 tests)
  and approvals' "hides the queue and the bell …" on the layer's tree through the CI-browser
  wrapper: all green (Self-review).
- **Layouts and pages render in parallel** (Next 16's
  `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`, "By default,
  layouts and pages are rendered in parallel"): `admin/layout.tsx`'s redirect of a platform
  context doesn't keep the page from rendering, so the page guards the workspace itself, as the
  bell (`components/shell/tenant-notifications.tsx`) does.
- **`default` holds** `tenant.view`, `user.view`, `membership.view`, `branch.view`, `audit.view`,
  `settings.view` and `business_date.view` but neither `user.approve` nor `branch.activate`
  (`TENANT_ADMIN_PERMISSIONS`): the overview there shows Business date, Readiness (4 of 5: People
  needs attention, Jane alone; no Onboarding link without `user.approve`) and Recent activity
  (names and the timezone read), and no Pending approvals.
- **Layer 12 is in** (the handoff's `[plan]` marks are now code): `approval-service.ts`
  (`listUserApprovals(paging)`, which includes provisioning rows;
  `listBranchActivations({ sort, page, size })`; `countUserApprovals()` and
  `countBranchActivations()`, both `cache()`d: the bell's three `size=1` reads), `approval-notifications.ts` (`actionableUserApprovals`, clamped;
  `approvalNotifications({ users, branches, branchSelected })`, the bell's entries, none after any
  failure; `NOTHING_WAITING`) and `approval-rules.ts` (`USER_APPROVAL_CODES`,
  `BRANCH_ACTIVATION_CODES`, `APPROVALS_HREF`, `userApprovalHref`, `branchApprovalHref`,
  `USER_QUEUE_LABEL`, `BRANCH_QUEUE_LABEL`). The bell (`components/shell/tenant-notifications.tsx`)
  shows for either pair, in its own Suspense.
- **Layer 10:** `membershipPageSchema` (`users/user-contract.ts`) reads `/tenant/memberships`;
  there is no membership count helper, so `overview-service.ts` adds `countActiveMemberships`. The
  handoff's "10's onboarding helpers" aren't needed: 12's arithmetic covers Onboarding.
- **Business date (07):** `getBusinessDate` is `cache()`d and shared with the app bar's
  `BusinessDateIndicator`; `formatBusinessDate(value, 'short' | 'long')` renders without a zone
  shift. `listBusinessDateHistory` isn't needed (the spec's card is status + date).
- **Settings (13):** `listSettings()` reads `GET /tenant/settings?size=100`; `settingsPageSchema`
  maps the mask to `value: null, redacted: true`; `SETTINGS_EDIT_ENABLED` is `false` (BG-04), so
  the Institution profile item adds "Settings can't be saved yet." while a key is unset. Layer 16's
  tenant wizard (`tenant-rules.ts` `initialSettings`) sends the two keys only when entered.
- **Branches (08):** `listBranches(query)` with a `status` filter and `DEFAULT_BRANCH_SORT`
  (`createdAt DESC`); a page's `totalItems` is the count (BG-15).
- **Audit (06):** `listAuditEvents`, `actionLabel`, `auditTrailHref({ event })` (the audit trail
  opens that event's drawer, a dialog named by the action), `resolveUserNames` and
  `getOrganisationTimeZone` (`lib/api/lookups.ts`, cached; the latter reads `GET /tenant` and falls
  back to UTC). `AuditEventTable` has a 900 px minimum width (Ruling 6).
- **Kit:** `SectionCard` is a `<section aria-labelledby>` (a named region, h2); `StatusChip` takes
  `value`, `label`, `tone`; `ErrorState` is an `Alert` with the reference; `EmptyState` is 240 px
  tall (not used inside cards); `PageHeader`; `next-link.tsx`. 17's `KpiTile` and `AttentionCard`
  aren't reused (Ruling 9).
- **Theme:** `MuiLinearProgress` (8 px, rounded, `surfaces.tertiary` track) has no colour of its
  own, so a bar is primary unless it says otherwise; `ListNavigationProgress` is the other user.
  Teal is `success.main` (`#007A6E` light, `#3DD9B8` dark); the pair with the track is 4.49:1 and
  7.56:1. No token is needed (rule 3).
- **Streaming precedents:** 12's bell (own `Suspense`, each read `load()`-settled, `cache()`
  shared) and 17's platform overview (one `Promise.all` of `load()`s, no per-card boundary). RTL
  can't render an async Server Component inside a tree: each card's test awaits its section and
  renders the result (as the bell's test does), and the page test mocks the sections.
- **Navigation:** "Overview" already points at `/admin` with no gate
  (`administration-navigation.ts`): unchanged.
- **Fake API:** every read exists (`/tenant/business-date`, `/tenant/users` with
  `membership_status` and `user_status`, `/branches` with `status` and the sort allow-list,
  `/tenant/memberships` with `membership_status`, `/tenant/settings`, `/tenant/audit-events`,
  `/tenant/users/{id}`, `/tenant`), so there is no route change. **35 scenarios** on `e6f7e7e` (33
  before 11, plus `users-invite` and `users-invite-limited`). BRANCH-scope grants count only with
  their branch selected (`access.mts` `effectivePermissions`) and `requirePermission` defaults to
  tenant scope, so a role granting `branch.view` and `branch.activate` at Head Office alone shows
  the codes in `/auth/me` and gets a 403 from `/branches`: BG-33's failure, with no route change.
- **E2E support:** `A11Y_CASES`, `applyA11yCase`, `expectA11yCaseApplied`,
  `expectNoSeriousOrCriticalViolations` (`e2e/support/admin.ts`); `authenticate`,
  `expectHydrated`, `selectMuiOption` (`e2e/support/auth.ts`, which since 11 clicks through
  `clickMuiOption`: it waits for the menu to stop growing in); `api`, `contextFor`
  (`e2e/support/fake-api.ts`). 11's spec bounds first hits with `FIRST_HIT` (45 s, its errata);
  12's and 11's matrices set 60 s per describe and end titles `(scheme, viewport)`.
- **Layer 11 on `e6f7e7e`:** `WizardForm` keeps 140 px of scroll clearance
  (`ACTION_BAR_CLEARANCE`); the overview has no sticky bar, so nothing changes. AGENTS.md carries
  the eighth named paging exception, and 14's is the ninth. The plan index already names 11's
  branch; 14's row (`admin-parity/14-overview`) is right as it stands.
- **Versions on `e6f7e7e`:** Next 16.4.0, React 19.3.0, MUI 9.5.0, zod 4.6.6, React Hook Form 7.90,
  Playwright 1.64.0, Vitest 4.1.11.
- **Handoff deviations** (each a ruling): `GET /tenant` replaced by the profile's status (Ruling 3);
  a compact activity list in the module (Ruling 6); one bar per card, not per item (Ruling 4); no
  10 onboarding helpers (12's arithmetic instead); the empty Pending approvals card says the bell's
  "Nothing is waiting for your approval." (12's `NOTHING_WAITING`, rule 10), not the handoff's
  "Nothing awaiting approval" — deliberate, so the card and the bell say the same (Ruling 5, Q5).
  And four changes the maintainer approved (each in the Rulings table): the users read sized past
  provisioning identities (the handoff's `size=5`, Ruling 5); the bell's `size=1` pair as the user
  count (the handoff: the preview's `total_items`); the per-item links (Ruling 12); the no-cards
  note (Ruling 2).

## Shared changes (announcement)

Every edit outside 14's new files:

- `app/(authenticated)/admin/page.tsx` and `page.test.tsx` (Task 8): the page gains its cards;
  its h1, eyebrow, description and metadata stay as they are. The test is replaced.
- `e2e/fake-api/scenarios.mts` (Task 9): `OVERVIEW_SCENARIO_IDS`, `OVERVIEW_SCENARIO_TEXT`, four
  builders and four `BUILDERS` entries, last; the 35 existing scenarios serialise identically.
- `README.md` (the page and the module in the trees, the Overview feature and its limits, and the
  last "not connected yet" item removed), `AGENTS.md` (the ninth named paging exception) and
  `docs/backend-gaps.md` (BG-02, BG-04, BG-11, BG-15, BG-21, BG-22, BG-33) (Task 11).

## Task dependency table

Tasks run in this order; a test never imports what a later task creates.

| Task | Creates or changes                                                                    | Imports from earlier tasks | Commit subject                                                                   |
| ---- | ------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| 1a   | `readiness-rules.ts` (+ test): Institution profile, Branches, People                  | —                          | `feat(overview): add the readiness rules for the profile, branches and people`   |
| 1b   | `readiness-rules.ts` (+ test): Onboarding, Business date, the links, the whole card   | 1a                         | `feat(overview): complete the readiness rules and link each item`                |
| 2a   | `overview-rules.ts` (+ test): the cards a holder sees, the no-cards note, the copy    | 1b                         | `feat(overview): decide which cards a holder sees`                               |
| 2b   | `overview-rules.ts` (+ test): the pending approvals preview                           | 2a                         | `feat(overview): shape the pending approvals preview`                            |
| 2c   | `overview-rules.ts` (+ test): the activity rows                                       | 2b                         | `feat(overview): shape the recent activity rows`                                 |
| 3    | `overview-service.ts` (+ test)                                                        | 2c                         | `feat(overview): count active branches and members and read the latest activity` |
| 4    | `components/overview-card-skeleton.tsx`, `components/business-date-card.tsx` (+ test) | 2a                         | `feat(overview): add the business date card and the card skeleton`               |
| 5    | `components/readiness-card.tsx` (+ test)                                              | 1b, 2a, 3                  | `feat(overview): add the operational readiness card with its teal bar`           |
| 6    | `components/pending-approvals-card.tsx` (+ test)                                      | 2b                         | `feat(overview): add the pending approvals card`                                 |
| 7    | `components/recent-activity-card.tsx` (+ test)                                        | 2c, 3                      | `feat(overview): add the recent activity card`                                   |
| 8    | `app/(authenticated)/admin/page.tsx` (+ its test, replaced)                           | 2a, 4–7                    | `feat(overview): show the four cards, each behind its own Suspense boundary`     |
| 9a   | `e2e/fake-api/scenarios.mts`, `e2e/fake-api-overview.spec.ts`: three scenarios        | —                          | `test(fake-api): seed the overview scenarios`                                    |
| 9b   | the same two files: `overview-branch-scoped`                                          | 9a                         | `test(fake-api): seed a branch-scoped overview scenario`                         |
| 10a  | `e2e/overview.spec.ts` (behaviour)                                                    | all of the above           | `test(e2e): cover the administration overview end to end`                        |
| 10b  | `e2e/overview.spec.ts` (the accessibility matrix)                                     | 10a                        | `test(e2e): add the overview's accessibility matrix`                             |
| 11   | `README.md`, `AGENTS.md`, `docs/backend-gaps.md`                                      | —                          | `docs(overview): describe the administration overview`                           |

All paths under `modules/administration/overview/` unless they start with `app/`, `e2e/` or name a
document. 16 commits.

---

### Task 1: The readiness rules

Two sub-tasks, each briefed, implemented, reviewed and committed on its own: **1a** (the shared
types and copy, and the first three items) and **1b** (the last two items, each item's link and
the whole card). `readiness-rules.ts` is client-safe and pure.

#### Task 1a: Institution profile, Branches and People

**Files:**

- Create: `modules/administration/overview/readiness-rules.ts`
- Create: `modules/administration/overview/readiness-rules.test.ts`

**Interfaces:**

- Consumes: `humanizeEnum`, `StatusTone` (`components/data-display/status-chip.tsx`); 13's
  `SETTINGS_EDIT_ENABLED` (`settings/settings-flags.ts`).
- Produces: `Settled<T>`, `ReadinessItemId`, `READINESS_CODES`, `READINESS_LABELS`,
  `ReadinessState`, `READINESS_STATES`, `READINESS_DESCRIPTION`, `NOT_PERMITTED`, `ReadinessCheck`,
  `SettingFact`, `institutionItem`, `branchesItem`, `peopleItem`.

- [ ] **Step 1: Write the failing test** — create `modules/administration/overview/readiness-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  branchesItem,
  institutionItem,
  NOT_PERMITTED,
  peopleItem,
  READINESS_CODES,
  READINESS_STATES,
  type SettingFact,
} from './readiness-rules';

const ok = <T>(value: T) => ({ ok: true as const, value });
const failed = (requestId: string | null = '14a00000-0000-4000-8000-0000000000aa') => ({
  ok: false as const,
  problem: { requestId },
});

const setting = (key: string, value: string | null, redacted = false): SettingFact => ({
  key,
  value,
  redacted,
});
const PROFILE_SET = {
  items: [
    setting('default_timezone', 'Africa/Nairobi'),
    setting('base_currency', 'KES'),
    setting('audit_retention_days', null, true),
  ],
};

describe('who can check what (Ruling 3)', () => {
  it('needs one read code per item, and none for the organisation status', () => {
    expect(READINESS_CODES).toEqual({
      institution: 'settings.view',
      branches: 'branch.view',
      people: 'membership.view',
      onboarding: 'user.view',
      businessDate: 'business_date.view',
    });
  });

  it('words every state for its chip', () => {
    expect(READINESS_STATES).toEqual({
      ready: { label: 'Ready', tone: 'success' },
      attention: { label: 'Needs attention', tone: 'warning' },
      unknown: { label: "Can't be checked", tone: 'default' },
      failed: { label: "Couldn't be checked", tone: 'error' },
    });
  });
});

describe('Institution profile', () => {
  it('is ready when the organisation is active and both keys are set', () => {
    expect(institutionItem('ACTIVE', ok(PROFILE_SET))).toEqual({
      id: 'institution',
      label: 'Institution profile',
      state: 'ready',
      detail: 'Active, with a default timezone and a base currency.',
    });
  });

  it.each([
    [[setting('base_currency', 'KES')], "Not set: default timezone. Settings can't be saved yet."],
    [
      [setting('default_timezone', 'Africa/Nairobi')],
      "Not set: base currency. Settings can't be saved yet.",
    ],
    [
      [setting('default_timezone', null), setting('base_currency', null)],
      "Not set: default timezone and base currency. Settings can't be saved yet.",
    ],
  ])(
    'needs attention while a key is unset, and says it cannot be saved yet (%#)',
    (items, detail) => {
      expect(institutionItem('ACTIVE', ok({ items }))).toMatchObject({
        state: 'attention',
        detail,
      });
    },
  );

  it('counts a masked value as set, never as absent', () => {
    const items = [setting('default_timezone', null, true), setting('base_currency', 'KES')];
    expect(institutionItem('ACTIVE', ok({ items })).state).toBe('ready');
  });

  it('names an organisation that is not active, whatever the settings', () => {
    expect(institutionItem('SUSPENDED', null)).toMatchObject({
      state: 'attention',
      detail: 'The institution is suspended.',
    });
  });

  it("can't be checked without the settings read, and says a failed read failed", () => {
    expect(institutionItem('ACTIVE', null)).toMatchObject({
      state: 'unknown',
      detail: NOT_PERMITTED,
    });
    expect(institutionItem('ACTIVE', failed())).toMatchObject({
      state: 'failed',
      detail: "Couldn't be loaded. Reference: 14a00000-0000-4000-8000-0000000000aa",
    });
    expect(institutionItem('ACTIVE', failed(null)).detail).toBe("Couldn't be loaded.");
  });
});

describe('Branches', () => {
  it('is ready with an active branch and none waiting', () => {
    expect(branchesItem(ok(1), ok(0))).toMatchObject({
      state: 'ready',
      detail: '1 branch is active, and none is waiting for activation.',
    });
  });

  it.each([
    [0, 0, 'No branch is active yet.'],
    [0, 2, 'No branch is active yet. 2 branches are waiting for activation.'],
    [2, 1, '2 branches are active. 1 branch is waiting for activation.'],
  ])('needs attention with %i active and %i waiting', (active, pending, detail) => {
    expect(branchesItem(ok(active), ok(pending))).toMatchObject({ state: 'attention', detail });
  });

  it("can't be checked without branch.view, and fails with either read", () => {
    expect(branchesItem(null, null).state).toBe('unknown');
    expect(branchesItem(failed('14a00000-0000-4000-8000-0000000000ab'), ok(0)).detail).toBe(
      "Couldn't be loaded. Reference: 14a00000-0000-4000-8000-0000000000ab",
    );
    expect(branchesItem(ok(2), failed('14a00000-0000-4000-8000-0000000000ac'))).toMatchObject({
      state: 'failed',
      detail: "Couldn't be loaded. Reference: 14a00000-0000-4000-8000-0000000000ac",
    });
  });
});

describe('People (BG-02)', () => {
  it('is ready with two active members', () => {
    expect(peopleItem(ok(2))).toMatchObject({ state: 'ready', detail: '2 members are active.' });
  });

  it.each([
    [
      1,
      'Only 1 member is active. Approvals need at least two, so someone other than the requester can decide (maker-checker).',
    ],
    [
      0,
      'No member is active. Approvals need at least two, so someone other than the requester can decide (maker-checker).',
    ],
  ])('needs attention with %i active', (count, detail) => {
    expect(peopleItem(ok(count))).toMatchObject({ state: 'attention', detail });
  });

  it("can't be checked without membership.view, and never reads a failure as zero", () => {
    expect(peopleItem(null).state).toBe('unknown');
    expect(peopleItem(failed()).state).toBe('failed');
  });
});
```

- [ ] **Step 2: Run** — form U on `modules/administration/overview/readiness-rules.test.ts`: FAIL
      (the import `./readiness-rules` doesn't resolve).

- [ ] **Step 3: Implement** — create `modules/administration/overview/readiness-rules.ts`:

```ts
import { humanizeEnum, type StatusTone } from '@/components/data-display/status-chip';
import { SETTINGS_EDIT_ENABLED } from '@/modules/administration/settings/settings-flags';

/**
 * Spec §10.8's Operational readiness (D11): five items, each computed from live reads by an
 * explicit rule (Ruling 1). Client-safe and pure: the section settles each read with `load()` and
 * hands it here. A read the holder can't make is `null` (never read, and said so); a failed read is
 * never shown as ready, as absent or as zero (rule 6).
 */

/** A settled read, structurally `Loaded<T>` (lib/api/load.ts is server-only); `null`: the holder
 * lacks the item's code, so nothing was read. */
export type Settled<T> =
  { ok: true; value: T } | { ok: false; problem: { requestId: string | null } } | null;

export type ReadinessItemId = 'institution' | 'branches' | 'people' | 'onboarding' | 'businessDate';

/** The one read code each item needs (Ruling 3). The organisation's status comes from the signed-in
 * profile (`/auth/me`), so the Institution profile item needs only the settings read. */
export const READINESS_CODES: Record<ReadinessItemId, string> = {
  institution: 'settings.view',
  branches: 'branch.view',
  people: 'membership.view',
  onboarding: 'user.view',
  businessDate: 'business_date.view',
};

export const READINESS_LABELS: Record<ReadinessItemId, string> = {
  institution: 'Institution profile',
  branches: 'Branches',
  people: 'People',
  onboarding: 'Onboarding',
  businessDate: 'Business date',
};

export type ReadinessState = 'ready' | 'attention' | 'unknown' | 'failed';

/** Each state's chip: the words always carry the meaning, the tone only repeats it. */
export const READINESS_STATES: Record<ReadinessState, { label: string; tone: StatusTone }> = {
  ready: { label: 'Ready', tone: 'success' },
  attention: { label: 'Needs attention', tone: 'warning' },
  unknown: { label: "Can't be checked", tone: 'default' },
  failed: { label: "Couldn't be checked", tone: 'error' },
};

export const READINESS_DESCRIPTION =
  "Each item is computed from live data. One your role can't read says so.";
export const NOT_PERMITTED = "Can't be checked with your permissions.";

/** One item's verdict, from its reads alone. */
export interface ReadinessCheck {
  id: ReadinessItemId;
  label: string;
  state: ReadinessState;
  /** One or two sentences: what was found, what is missing, or why it can't be said. */
  detail: string;
}

/** "Couldn't be loaded." with the failed read's reference (rule 6). */
function readFailed(problem: { requestId: string | null }): string {
  return problem.requestId
    ? `Couldn't be loaded. Reference: ${problem.requestId}`
    : "Couldn't be loaded.";
}

const counted = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

function item(id: ReadinessItemId, state: ReadinessState, detail: string): ReadinessCheck {
  return { id, label: READINESS_LABELS[id], state, detail };
}

/** A stored setting as the settings read maps it: a masked value is `null` but `redacted`. */
export interface SettingFact {
  key: string;
  value: string | null;
  redacted: boolean;
}

const PROFILE_KEYS = [
  ['default_timezone', 'default timezone'],
  ['base_currency', 'base currency'],
] as const;

/** BG-04: the platform can't save a setting yet, so an unset key can't be set from this app. */
const UNSAVABLE = SETTINGS_EDIT_ENABLED ? '' : " Settings can't be saved yet.";

/** Organisation ACTIVE, and `default_timezone` and `base_currency` set (spec §10.8). Every request
 * re-validates the organisation as ACTIVE (contract §A), so the status the profile carries is
 * checked but in practice always passes. */
export function institutionItem(
  organisationStatus: string,
  settings: Settled<{ items: readonly SettingFact[] }>,
): ReadinessCheck {
  if (organisationStatus !== 'ACTIVE') {
    return item(
      'institution',
      'attention',
      `The institution is ${humanizeEnum(organisationStatus).toLowerCase()}.`,
    );
  }
  if (settings === null) return item('institution', 'unknown', NOT_PERMITTED);
  if (!settings.ok) return item('institution', 'failed', readFailed(settings.problem));
  const isSet = (key: string) =>
    settings.value.items.some(
      (setting) => setting.key === key && (setting.value !== null || setting.redacted),
    );
  const missing = PROFILE_KEYS.filter(([key]) => !isSet(key)).map(([, label]) => label);
  if (missing.length > 0) {
    return item('institution', 'attention', `Not set: ${missing.join(' and ')}.${UNSAVABLE}`);
  }
  return item('institution', 'ready', 'Active, with a default timezone and a base currency.');
}

/** At least one ACTIVE branch and none PENDING_APPROVAL (spec §10.8). */
export function branchesItem(active: Settled<number>, pending: Settled<number>): ReadinessCheck {
  if (active === null || pending === null) return item('branches', 'unknown', NOT_PERMITTED);
  if (!active.ok) return item('branches', 'failed', readFailed(active.problem));
  if (!pending.ok) return item('branches', 'failed', readFailed(pending.problem));
  const waiting =
    pending.value > 0
      ? ` ${counted(pending.value, 'branch is', 'branches are')} waiting for activation.`
      : '';
  if (active.value < 1) return item('branches', 'attention', `No branch is active yet.${waiting}`);
  const live = counted(active.value, 'branch is', 'branches are');
  if (pending.value > 0) return item('branches', 'attention', `${live} active.${waiting}`);
  return item('branches', 'ready', `${live} active, and none is waiting for activation.`);
}

/** At least two ACTIVE memberships, so maker-checker is possible (spec §10.8, BG-02). */
export function peopleItem(active: Settled<number>): ReadinessCheck {
  if (active === null) return item('people', 'unknown', NOT_PERMITTED);
  if (!active.ok) return item('people', 'failed', readFailed(active.problem));
  if (active.value < 2) {
    return item(
      'people',
      'attention',
      `${active.value === 0 ? 'No member is' : 'Only 1 member is'} active. Approvals need at least two, so someone other than the requester can decide (maker-checker).`,
    );
  }
  return item('people', 'ready', `${counted(active.value, 'member is', 'members are')} active.`);
}
```

- [ ] **Step 4: Run** — form U: PASS (18 tests). Mutation proofs (each must fail the named test; revert after each): count a masked value as unset (`setting.value !== null` alone in `isSet`) — "counts a masked value as set, never as absent"; make `branchesItem` need two pending branches before attention (`pending.value > 1`) — "needs attention with 2 active and 1 waiting"; make `peopleItem` content with one member (`active.value < 1`) — "needs attention with 1 active"; drop the BG-04 sentence (`const UNSAVABLE = '';`) — "needs attention while a key is unset, and says it cannot be saved yet".

- [ ] **Step 5: Commit** (form C):

```text
feat(overview): add the readiness rules for the profile, branches and people

The first three of spec §10.8's Operational readiness items, pure and client-safe: Institution
profile (the organisation active, and default_timezone and base_currency set; a masked value is
set, not absent; while one is unset the item says settings can't be saved yet, BG-04), Branches
(one active, none pending) and People (two active members, BG-02). Each item is ready, needs
attention, can't be checked without its read code, or couldn't be checked with the failed read's
reference; never absent or zero (rule 6).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** the four state words are asserted;
`READINESS_CODES` has no `tenant.view` (Ruling 3).

#### Task 1b: Onboarding, Business date, the links and the whole card

**Files:**

- Modify: `modules/administration/overview/readiness-rules.ts` (one import edit; an append)
- Modify: `modules/administration/overview/readiness-rules.test.ts` (one import edit; an append)

**Interfaces:**

- Consumes: 1a; `canAll`, `PermissionHolder` (`auth/permissions.ts`); `formatBusinessDate`
  (`lib/format.ts`); 12's `approvalNotifications` and `UserApprovalCounts`
  (`approvals/approval-notifications.ts`), `USER_APPROVAL_CODES` and `USER_QUEUE_HREF`
  (`approvals/approval-rules.ts`); 07's `BusinessDateStatus`
  (`business-date/business-date-contract.ts`); 10's `USERS_HREF` (`users/invite-rules.ts`). The
  test also reads `administrationNavigationItems` (`administration/administration-navigation.ts`),
  so each link's gate is its page's.
- Produces: `provisioningNote`, `onboardingItem`, `businessDateItem`, `ReadinessLink`,
  `READINESS_LINKS`, `ReadinessItem`, `ReadinessReads`, `ReadinessView`,
  `operationalReadiness(reads, holder)`.

- [ ] **Step 1: Extend the test** — in `modules/administration/overview/readiness-rules.test.ts`:

Replace

```ts
import {
  branchesItem,
  institutionItem,
  NOT_PERMITTED,
  peopleItem,
  READINESS_CODES,
  READINESS_STATES,
```

with

```ts
import { administrationNavigationItems } from '@/modules/administration/administration-navigation';
import {
  USER_APPROVAL_CODES,
  USER_QUEUE_HREF,
} from '@/modules/administration/approvals/approval-rules';
import {
  branchesItem,
  businessDateItem,
  institutionItem,
  NOT_PERMITTED,
  onboardingItem,
  operationalReadiness,
  peopleItem,
  READINESS_CODES,
  READINESS_LINKS,
  READINESS_STATES,
  type ReadinessReads,
```

Then append, after a blank line at the end of the file:

```ts
describe('Onboarding', () => {
  it('is ready when no one waits, noting identities still provisioning apart', () => {
    expect(onboardingItem(ok({ pending: 0, provisioning: 0 }))).toMatchObject({
      state: 'ready',
      detail: 'No one is waiting for approval.',
    });
    expect(onboardingItem(ok({ pending: 2, provisioning: 2 }))).toMatchObject({
      state: 'ready',
      detail:
        'No one is waiting for approval. 2 identities are still being provisioned: approval already ran.',
    });
  });

  it('needs attention while approvals wait, and leaves provisioning ones out of the count', () => {
    expect(onboardingItem(ok({ pending: 4, provisioning: 1 }))).toMatchObject({
      state: 'attention',
      detail:
        '3 users are waiting for approval. 1 identity is still being provisioned: approval already ran.',
    });
    expect(onboardingItem(ok({ pending: 1, provisioning: 0 })).detail).toBe(
      '1 user is waiting for approval.',
    );
  });

  it("can't be checked without user.view, and fails with its read", () => {
    expect(onboardingItem(null).state).toBe('unknown');
    expect(onboardingItem(failed()).state).toBe('failed');
  });
});

describe('Business date', () => {
  it.each([
    ['OPEN', 'ready', 'Open for Mon, 7 Sep 2026.'],
    ['CLOSING', 'attention', 'Close of business is in progress for Mon, 7 Sep 2026.'],
    ['CLOSED', 'attention', 'Closed for Mon, 7 Sep 2026.'],
  ] as const)('reads %s as %s', (status, state, detail) => {
    expect(businessDateItem(ok({ date: '07-09-2026', status }))).toMatchObject({ state, detail });
  });

  it("can't be checked without business_date.view, and fails with its read", () => {
    expect(businessDateItem(null).state).toBe('unknown');
    expect(businessDateItem(failed()).state).toBe('failed');
  });
});

describe('the whole card', () => {
  const READY: ReadinessReads = {
    organisationStatus: 'ACTIVE',
    settings: ok(PROFILE_SET),
    activeBranches: ok(2),
    pendingBranches: ok(0),
    activeMembers: ok(2),
    userApprovals: ok({ pending: 0, provisioning: 0 }),
    businessDate: ok({ date: '07-09-2026', status: 'OPEN' as const }),
  };

  const EVERY_CODE = {
    permissions: [
      'settings.view',
      'branch.view',
      'membership.view',
      'user.view',
      'user.approve',
      'business_date.view',
    ],
  };
  const without = (code: string) => ({
    permissions: EVERY_CODE.permissions.filter((held) => held !== code),
  });

  it('lists the five items in spec order, all ready, with a full bar', () => {
    const view = operationalReadiness(READY, EVERY_CODE);
    expect(view.items.map((entry) => [entry.label, entry.state])).toEqual([
      ['Institution profile', 'ready'],
      ['Branches', 'ready'],
      ['People', 'ready'],
      ['Onboarding', 'ready'],
      ['Business date', 'ready'],
    ]);
    expect(view).toMatchObject({ ready: 5, progress: 100, summary: '5 of 5 ready' });
  });

  it('never counts an item it could not check as ready, and says how many it could not', () => {
    const view = operationalReadiness(
      {
        ...READY,
        settings: null,
        activeMembers: failed(),
        businessDate: ok({ date: '07-09-2026', status: 'CLOSED' as const }),
      },
      EVERY_CODE,
    );
    expect(view.items.map((entry) => entry.state)).toEqual([
      'unknown',
      'ready',
      'failed',
      'ready',
      'attention',
    ]);
    expect(view).toMatchObject({
      ready: 2,
      progress: 40,
      summary: '2 of 5 ready · 2 not checked',
    });
  });

  it('links each item to the page where it is dealt with (Ruling 12)', () => {
    expect(operationalReadiness(READY, EVERY_CODE).items.map((entry) => entry.link)).toEqual([
      { href: '/admin/settings', label: 'Open settings' },
      { href: '/admin/branches', label: 'Open branches' },
      { href: '/admin/users', label: 'Open users & access' },
      { href: '/admin/approvals/users', label: 'Open user onboarding' },
      { href: '/admin/business-date', label: 'Open business date' },
    ]);
  });

  it.each([
    ['Institution profile', 'settings.view'],
    ['Branches', 'branch.view'],
    ['People', 'user.view'],
    ['Onboarding', 'user.approve'],
    ['Onboarding', 'user.view'],
    ['Business date', 'business_date.view'],
  ])('offers no %s link without %s, the code its page needs', (label, code) => {
    const view = operationalReadiness(READY, without(code));
    expect(view.items.find((entry) => entry.label === label)?.link).toBeNull();
    expect(view.items.filter((entry) => entry.link === null)).toHaveLength(
      code === 'user.view' ? 2 : 1,
    );
  });

  it.each([
    ['ready', ok(2)],
    ['attention', ok(1)],
    ['unknown', null],
    ['failed', failed(null)],
  ] as const)('keeps a link while its item is %s', (state, activeMembers) => {
    const view = operationalReadiness({ ...READY, activeMembers }, EVERY_CODE);
    expect(view.items[2]).toMatchObject({
      state,
      link: { href: '/admin/users', label: 'Open users & access' },
    });
  });

  it("gates the navigation's pages on their navigation codes, and never names the audit trail", () => {
    for (const { href, codes, label } of Object.values(READINESS_LINKS)) {
      expect(label).not.toMatch(/audit trail/i);
      if (href === USER_QUEUE_HREF) {
        expect(codes).toEqual(USER_APPROVAL_CODES); // the tab's own gate: both of 12's codes
      } else {
        const page = administrationNavigationItems.find((entry) => entry.href === href);
        expect(page?.requiresAny).toEqual(codes);
      }
    }
  });
});
```

- [ ] **Step 2: Run** — form U: FAIL (the 21 new tests: "TypeError: onboardingItem is not a function", "… businessDateItem is not a function" or "… operationalReadiness is not a function", and "Cannot convert undefined or null to object" where `READINESS_LINKS` is read; 1a's 18 still pass).

- [ ] **Step 3: Implement** — in `modules/administration/overview/readiness-rules.ts`:

Replace

```ts
import { humanizeEnum, type StatusTone } from '@/components/data-display/status-chip';
import { SETTINGS_EDIT_ENABLED } from '@/modules/administration/settings/settings-flags';
```

with

```ts
import { canAll, type PermissionHolder } from '@/auth/permissions';
import { humanizeEnum, type StatusTone } from '@/components/data-display/status-chip';
import { formatBusinessDate } from '@/lib/format';
import {
  approvalNotifications,
  type UserApprovalCounts,
} from '@/modules/administration/approvals/approval-notifications';
import {
  USER_APPROVAL_CODES,
  USER_QUEUE_HREF,
} from '@/modules/administration/approvals/approval-rules';
import type { BusinessDateStatus } from '@/modules/administration/business-date/business-date-contract';
import { SETTINGS_EDIT_ENABLED } from '@/modules/administration/settings/settings-flags';
import { USERS_HREF } from '@/modules/administration/users/invite-rules';
```

Then append, after a blank line at the end of the file:

```ts
/** Approval already ran for these (BG-11): they wait for the identity provider, not for anyone
 * here. The Onboarding item and the Pending approvals card both note them, apart from the count. */
export function provisioningNote(count: number): string {
  return `${counted(count, 'identity is', 'identities are')} still being provisioned: approval already ran.`;
}

/** No user approval awaiting a decision; identities still provisioning are noted apart (spec
 * §10.8). User onboarding only: branches waiting for activation are the Branches item's. The count
 * and its words are the bell's (`approvalNotifications`), never a second copy. */
export function onboardingItem(counts: Settled<UserApprovalCounts>): ReadinessCheck {
  if (counts === null) return item('onboarding', 'unknown', NOT_PERMITTED);
  if (!counts.ok) return item('onboarding', 'failed', readFailed(counts.problem));
  const waiting = approvalNotifications({ users: counts, branches: null, branchSelected: false })
    .entries[0];
  const note =
    counts.value.provisioning > 0 ? ` ${provisioningNote(counts.value.provisioning)}` : '';
  if (waiting) return item('onboarding', 'attention', `${waiting.text}${note}`);
  return item('onboarding', 'ready', `No one is waiting for approval.${note}`);
}

/** Status OPEN (spec §10.8). The date renders from its `dd-MM-yyyy` value, with no zone shift. */
export function businessDateItem(
  current: Settled<{ date: string; status: BusinessDateStatus }>,
): ReadinessCheck {
  if (current === null) return item('businessDate', 'unknown', NOT_PERMITTED);
  if (!current.ok) return item('businessDate', 'failed', readFailed(current.problem));
  const day = formatBusinessDate(current.value.date, 'short');
  switch (current.value.status) {
    case 'OPEN':
      return item('businessDate', 'ready', `Open for ${day}.`);
    case 'CLOSING':
      return item('businessDate', 'attention', `Close of business is in progress for ${day}.`);
    case 'CLOSED':
      return item('businessDate', 'attention', `Closed for ${day}.`);
  }
}

export interface ReadinessLink {
  href: string;
  label: string;
}

/** Where each item is dealt with (Ruling 12), and the codes that page needs: the navigation item's
 * code for Settings, Branches, Users & access and Business date, both of 12's user-onboarding
 * codes for that tab. A link the holder couldn't open is never offered. No name holds "audit
 * trail" (rule 9). */
export const READINESS_LINKS: Record<
  ReadinessItemId,
  ReadinessLink & { codes: readonly string[] }
> = {
  institution: { href: '/admin/settings', label: 'Open settings', codes: ['settings.view'] },
  branches: { href: '/admin/branches', label: 'Open branches', codes: ['branch.view'] },
  people: { href: USERS_HREF, label: 'Open users & access', codes: ['user.view'] },
  onboarding: { href: USER_QUEUE_HREF, label: 'Open user onboarding', codes: USER_APPROVAL_CODES },
  businessDate: {
    href: '/admin/business-date',
    label: 'Open business date',
    codes: ['business_date.view'],
  },
};

/** An item with its link: shown in every state while the holder can open the page. */
export interface ReadinessItem extends ReadinessCheck {
  link: ReadinessLink | null;
}

/** What the section read: each `null` when the holder lacks that item's code (`READINESS_CODES`). */
export interface ReadinessReads {
  organisationStatus: string;
  settings: Settled<{ items: readonly SettingFact[] }>;
  activeBranches: Settled<number>;
  pendingBranches: Settled<number>;
  activeMembers: Settled<number>;
  userApprovals: Settled<UserApprovalCounts>;
  businessDate: Settled<{ date: string; status: BusinessDateStatus }>;
}

export interface ReadinessView {
  items: readonly ReadinessItem[];
  ready: number;
  /** 0–100: the share of all five items that are ready. An item that can't be checked never
   * counts, so the bar never claims more than the reads proved (Ruling 4). */
  progress: number;
  /** "3 of 5 ready", and how many weren't checked: the bar's value text and its visible label. */
  summary: string;
}

export function operationalReadiness(
  reads: ReadinessReads,
  holder: PermissionHolder,
): ReadinessView {
  const checks = [
    institutionItem(reads.organisationStatus, reads.settings),
    branchesItem(reads.activeBranches, reads.pendingBranches),
    peopleItem(reads.activeMembers),
    onboardingItem(reads.userApprovals),
    businessDateItem(reads.businessDate),
  ];
  const items = checks.map((check): ReadinessItem => {
    const { href, label, codes } = READINESS_LINKS[check.id];
    return { ...check, link: canAll(holder, codes) ? { href, label } : null };
  });
  const ready = items.filter((entry) => entry.state === 'ready').length;
  const unchecked = items.filter(
    (entry) => entry.state === 'unknown' || entry.state === 'failed',
  ).length;
  return {
    items,
    ready,
    progress: Math.round((ready / items.length) * 100),
    summary: `${ready} of ${items.length} ready${unchecked > 0 ? ` · ${unchecked} not checked` : ''}`,
  };
}
```

- [ ] **Step 4: Run** — form U: PASS (39 tests). Mutation proofs (each must fail the named test; revert after each): count every pending membership as waiting (pass `{ pending: counts.value.pending, provisioning: 0 }` to `approvalNotifications`) — "is ready when no one waits, noting identities still provisioning apart"; read CLOSING as ready — "reads CLOSING as attention"; count anything but attention as ready (`entry.state !== 'attention'`) — "never counts an item it could not check as ready, and says how many it could not"; offer every link whatever the codes (`link: { href, label }`) — "offers no Institution profile link without settings.view, the code its page needs"; gate the People link on `membership.view` (the item's read code, not the page's) — "gates the navigation's pages on their navigation codes, and never names the audit trail".

- [ ] **Step 5: Commit** (form C):

```text
feat(overview): complete the readiness rules and link each item

Onboarding (no user approval waiting, in the bell's words and by its arithmetic, with identities
still provisioning noted apart, BG-11) and Business date (OPEN; the date from its dd-MM-yyyy
value). Each item links to the page where it is dealt with (Settings, Branches, Users & access,
the queue's user tab, Business date), offered only when the holder holds the codes that page
needs, in every state of the item; no link is named after the audit trail (Ruling 12). The card
lists the five items in the spec's order, how many are ready, and a bar value that never counts an
item that couldn't be checked (Ruling 4).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** the Onboarding text is
`approvalNotifications`'s, never a copy (rule 10); the People link needs `user.view` (the Users &
access page's code), not the item's `membership.view`; the Onboarding link needs both of 12's
codes (the tab's own gate).

### Task 2: The overview's rules

Three sub-tasks: **2a** (which cards a holder sees, the no-cards note and the shared copy), **2b**
(the Pending approvals preview) and **2c** (the activity rows). `overview-rules.ts` is
client-safe and pure.

#### Task 2a: The cards a holder sees

**Files:**

- Create: `modules/administration/overview/overview-rules.ts`
- Create: `modules/administration/overview/overview-rules.test.ts`

**Interfaces:**

- Consumes: `can`, `canAll`, `canAny`, `PermissionHolder` (`auth/permissions.ts`); 12's
  `USER_APPROVAL_CODES`, `BRANCH_ACTIVATION_CODES`; 1's `READINESS_CODES`, `READINESS_LINKS`.
- Produces: `OVERVIEW_TITLE`, `OVERVIEW_DESCRIPTION`, `CARD_TITLES`, `OverviewCards`,
  `overviewCards`, `noOverviewCards`, `NO_OVERVIEW_CARDS`, `BUSINESS_DATE_HREF`,
  `BUSINESS_DATE_DESCRIPTION`, `BUSINESS_DATE_LINK`.

- [ ] **Step 1: Write the failing test** — create `modules/administration/overview/overview-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { noOverviewCards, overviewCards } from './overview-rules';

describe('which cards a holder sees (Ruling 2)', () => {
  const ALL = [
    'business_date.view',
    'user.approve',
    'user.view',
    'branch.activate',
    'branch.view',
    'settings.view',
    'membership.view',
    'audit.view',
    'tenant.view',
  ];

  it('shows every card to a holder of every code', () => {
    const cards = overviewCards({ permissions: ALL });
    expect(cards).toEqual({
      businessDate: true,
      approvals: { users: true, branches: true },
      readiness: true,
      activity: { names: true, timeZone: true },
    });
    expect(noOverviewCards(cards)).toBe(false);
  });

  it('reads the actors and the timezone only with their own codes (rule 5)', () => {
    expect(overviewCards({ permissions: ['audit.view'] }).activity).toEqual({
      names: false,
      timeZone: false,
    });
    expect(overviewCards({ permissions: ['audit.view', 'user.view'] }).activity).toEqual({
      names: true,
      timeZone: false,
    });
  });

  it('offers each kind of request only with both of its codes', () => {
    expect(overviewCards({ permissions: ['user.approve', 'branch.view'] }).approvals).toBeNull();
    expect(
      overviewCards({ permissions: ['branch.activate', 'branch.view', 'user.view'] }).approvals,
    ).toEqual({ users: false, branches: true });
  });

  it('keeps Readiness while any one item can be checked, and omits the rest', () => {
    expect(overviewCards({ permissions: ['membership.view'] })).toEqual({
      businessDate: false,
      approvals: null,
      readiness: true,
      activity: null,
    });
    expect(overviewCards({ permissions: ['iam.profile.read'] }).readiness).toBe(false);
  });

  it('knows when no card applies, so the page can say so once', () => {
    expect(noOverviewCards(overviewCards({ permissions: ['iam.profile.read'] }))).toBe(true);
    for (const code of ['business_date.view', 'settings.view', 'audit.view']) {
      expect(noOverviewCards(overviewCards({ permissions: [code] })), code).toBe(false);
    }
    expect(
      noOverviewCards(overviewCards({ permissions: ['branch.activate', 'branch.view'] })),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run** — form U on `modules/administration/overview/overview-rules.test.ts`: FAIL (the
      import `./overview-rules` doesn't resolve).

- [ ] **Step 3: Implement** — create `modules/administration/overview/overview-rules.ts`:

```ts
import { can, canAll, canAny, type PermissionHolder } from '@/auth/permissions';
import {
  BRANCH_ACTIVATION_CODES,
  USER_APPROVAL_CODES,
} from '@/modules/administration/approvals/approval-rules';
import { READINESS_CODES, READINESS_LINKS } from './readiness-rules';

/**
 * Layer 14's overview (spec §10.8), client-safe: which cards a holder sees, the Pending approvals
 * preview, the Recent activity rows, and every string the page and its cards share.
 */

export const OVERVIEW_TITLE = 'Administration Overview';
export const OVERVIEW_DESCRIPTION =
  "Manage your institution's operational setup, users, and controls.";

export const CARD_TITLES = {
  businessDate: 'Business date',
  approvals: 'Pending approvals',
  readiness: 'Operational readiness',
  activity: 'Recent activity',
} as const;

export interface OverviewCards {
  businessDate: boolean;
  /** The kinds of request the holder can decide; `null`: neither, so the card is omitted. */
  approvals: { users: boolean; branches: boolean } | null;
  readiness: boolean;
  /** `null` without `audit.view`; else whether the actors' names (`user.view`) and the
   * organisation's timezone (`tenant.view`) may be read: without them, short ids and UTC (rule 5). */
  activity: { names: boolean; timeZone: boolean } | null;
}

/** Ruling 2: a card the holder could never read or act on is omitted, decided before any read.
 * Readiness shows while at least one of its items can be checked. */
export function overviewCards(holder: PermissionHolder): OverviewCards {
  const users = canAll(holder, USER_APPROVAL_CODES);
  const branches = canAll(holder, BRANCH_ACTIVATION_CODES);
  return {
    businessDate: can(holder, 'business_date.view'),
    approvals: users || branches ? { users, branches } : null,
    readiness: canAny(holder, Object.values(READINESS_CODES)),
    activity: can(holder, 'audit.view')
      ? { names: can(holder, 'user.view'), timeZone: can(holder, 'tenant.view') }
      : null,
  };
}

/** True when no card applies: the page then says so once, under its heading (Ruling 2). */
export function noOverviewCards(cards: OverviewCards): boolean {
  return !cards.businessDate && !cards.approvals && !cards.readiness && !cards.activity;
}

export const NO_OVERVIEW_CARDS =
  'Nothing on this overview is available to your role here; the navigation lists the pages you can open.';

// ── Business date ────────────────────────────────────────────────────────────────────────────────

export const BUSINESS_DATE_HREF = READINESS_LINKS.businessDate.href;
export const BUSINESS_DATE_DESCRIPTION = 'The date this institution is working on.';
export const BUSINESS_DATE_LINK = READINESS_LINKS.businessDate.label;
```

- [ ] **Step 4: Run** — form U: PASS (5 tests). Mutation proofs (each must fail the named test; revert after each): offer users with either code (`canAny(holder, USER_APPROVAL_CODES)`) — "offers each kind of request only with both of its codes"; show Readiness only with all five codes (`canAll`) — "keeps Readiness while any one item can be checked, and omits the rest"; read the actors' names whatever the codes (`names: true`) — "reads the actors and the timezone only with their own codes (rule 5)"; never report that no card applies (`return false;`) — "knows when no card applies, so the page can say so once".

- [ ] **Step 5: Commit** (form C):

```text
feat(overview): decide which cards a holder sees

Which of spec §10.8's four cards a holder sees, decided from their codes before any read (Ruling
2): Business date with its read code, Pending approvals with either of layer 12's decision pairs,
Operational readiness while any item can be checked, Recent activity with audit.view, together
with whether its names and timezone may be read (rule 5). When no card applies the page says so
once.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

#### Task 2b: The Pending approvals preview

**Files:**

- Modify: `modules/administration/overview/overview-rules.ts` (one import edit; an append)
- Modify: `modules/administration/overview/overview-rules.test.ts` (one edit: imports and the
  fixtures; an append)

**Interfaces:**

- Consumes: 2a; `NotificationEntry` (type, `components/shell/notifications-menu.tsx`); `Page`
  (type, `lib/api/wire.ts`); 12's `approvalNotifications`, `UserApprovalCounts`,
  `userApprovalHref`, `branchApprovalHref`, `USER_QUEUE_LABEL`, `BRANCH_QUEUE_LABEL`; 08's
  `BranchSummary` (type) and `branchTypeLabel`; 10's `UserSummary` (type); 1's
  `provisioningNote`, `Settled`.
- Produces: `APPROVAL_PREVIEW_SIZE`, `USER_PREVIEW_CEILING`, `userPreviewSize`,
  `APPROVALS_DESCRIPTION`, `APPROVALS_LINK`, `REQUESTS_LABEL`, `REVIEW`, `ApprovalRow`,
  `PendingApprovalsView`, `PendingApprovalsReads`, `pendingApprovalsView`.

- [ ] **Step 1: Extend the test** — in `modules/administration/overview/overview-rules.test.ts`:

Replace

```ts
import { noOverviewCards, overviewCards } from './overview-rules';
```

with

```ts
import type { Page } from '@/lib/api/wire';
import type { BranchSummary } from '@/modules/administration/branches/branch-contract';
import type { UserSummary } from '@/modules/administration/users/user-contract';
import {
  APPROVAL_PREVIEW_SIZE,
  noOverviewCards,
  overviewCards,
  pendingApprovalsView,
  userPreviewSize,
  type PendingApprovalsReads,
} from './overview-rules';

const ok = <T>(value: T) => ({ ok: true as const, value });
const failed = (requestId: string | null) => ({ ok: false as const, problem: { requestId } });

function page<T>(items: T[], totalItems = items.length): Page<T> {
  return {
    items,
    page: {
      number: 0,
      size: APPROVAL_PREVIEW_SIZE,
      totalItems,
      totalPages: Math.ceil(totalItems / APPROVAL_PREVIEW_SIZE),
      hasNext: totalItems > items.length,
      hasPrevious: false,
    },
  };
}

const user = (tail: string, name: string, userStatus: UserSummary['userStatus']): UserSummary => ({
  id: `14b00000-0000-4000-8000-0000000000${tail}`,
  username: name.toLowerCase().replace(/\s+/g, '.'),
  email: `${name.toLowerCase().replace(/\s+/g, '.')}@greenfield.example`,
  displayName: name,
  userStatus,
  membershipStatus: 'PENDING_APPROVAL',
});

const branch = (tail: string, name: string, code: string): BranchSummary => ({
  id: `14c00000-0000-4000-8000-0000000000${tail}`,
  branchCode: code,
  branchName: name,
  branchType: 'OPERATIONS',
  status: 'PENDING_APPROVAL',
  createdAt: '2026-09-15T08:00:00Z',
});

const WANJIKU = user('a4', 'Wanjiku Kariuki', 'DRAFT');
const BARAKA = user('a3', 'Baraka Otieno', 'PROVISIONING_IDP');
const HALIMA = user('a1', 'Halima Odhiambo', 'DRAFT');
const MALINDI = branch('c3', 'Malindi Branch', 'MALINDI');
const NYERI = branch('c2', 'Nyeri Branch', 'NYERI');
const KAKAMEGA = branch('c1', 'Kakamega Branch', 'KAKAMEGA');

const READS: PendingApprovalsReads = {
  users: ok(page([WANJIKU, BARAKA, HALIMA])),
  userCounts: ok({ pending: 3, provisioning: 1 }),
  branches: ok(page([MALINDI, NYERI, KAKAMEGA])),
  branchSelected: false,
};
```

Then append, after a blank line at the end of the file:

```ts
describe('the Pending approvals preview (Ruling 5)', () => {
  it('lists users first, then branches, each newest first as read, leaving provisioning out', () => {
    const view = pendingApprovalsView(READS);
    expect(view.rows.map((row) => row.name)).toEqual([
      'Wanjiku Kariuki',
      'Halima Odhiambo',
      'Malindi Branch',
      'Nyeri Branch',
      'Kakamega Branch',
    ]);
    expect(view.rows[0]).toEqual({
      id: WANJIKU.id,
      kind: 'user',
      name: 'Wanjiku Kariuki',
      detail: 'User onboarding · wanjiku.kariuki@greenfield.example',
      href: `/admin/approvals/users/${WANJIKU.id}`,
      reviewLabel: 'Review Wanjiku Kariuki',
    });
    expect(view.rows[2]).toEqual({
      id: MALINDI.id,
      kind: 'branch',
      name: 'Malindi Branch',
      detail: 'Branch activation · MALINDI · Operations',
      href: `/admin/approvals/branches/${MALINDI.id}`,
      reviewLabel: 'Review Malindi Branch',
    });
  });

  it('stops at five rows', () => {
    const many = [1, 2, 3, 4].map((n) => user(`d${String(n)}`, `Member ${String(n)}`, 'DRAFT'));
    const view = pendingApprovalsView({ ...READS, users: ok(page(many)) });
    expect(view.rows.map((row) => row.name)).toEqual([
      'Member 1',
      'Member 2',
      'Member 3',
      'Member 4',
      'Malindi Branch',
    ]);
  });

  it("counts with the bell's words and links, and notes identities still provisioning", () => {
    const view = pendingApprovalsView(READS);
    expect(view.summary).toEqual([
      {
        id: 'user-onboarding',
        text: '2 users are waiting for approval.',
        href: '/admin/approvals/users',
        linkLabel: 'Review user onboarding',
      },
      {
        id: 'branch-activation',
        text: '3 branches are waiting for activation.',
        href: '/admin/approvals/branches',
        linkLabel: 'Review branch activation',
      },
    ]);
    expect(view.provisioning).toBe('1 identity is still being provisioned: approval already ran.');
    expect(view.empty).toBe(false);
    expect(view.failures).toEqual([]);
  });

  it('asks for All branches before activating, with a branch selected', () => {
    const view = pendingApprovalsView({ ...READS, branchSelected: true });
    expect(view.summary[1]?.text).toBe(
      '3 branches are waiting for activation. Switch to All branches to activate them.',
    );
  });

  it('reads only the kinds the holder can decide', () => {
    const view = pendingApprovalsView({ ...READS, users: null, userCounts: null });
    expect(view.rows.map((row) => row.kind)).toEqual(['branch', 'branch', 'branch']);
    expect(view.summary.map((entry) => entry.id)).toEqual(['branch-activation']);
    expect(view.provisioning).toBeNull();
  });

  it('says nothing waits only when every permitted read said so', () => {
    const none = pendingApprovalsView({
      users: ok(page([])),
      userCounts: ok({ pending: 0, provisioning: 0 }),
      branches: ok(page([])),
      branchSelected: false,
    });
    expect(none).toEqual({
      summary: [],
      rows: [],
      failures: [],
      provisioning: null,
      empty: true,
    });
  });

  it.each([
    [
      'the user rows',
      { users: failed('14e00000-0000-4000-8000-0000000000a1') },
      "Users waiting for approval couldn't be loaded. Reference: 14e00000-0000-4000-8000-0000000000a1",
    ],
    [
      'the user counts',
      { userCounts: failed('14e00000-0000-4000-8000-0000000000a2') },
      "Users waiting for approval couldn't be loaded. Reference: 14e00000-0000-4000-8000-0000000000a2",
    ],
    [
      'the branch rows',
      { branches: failed(null) },
      "Branches waiting for activation couldn't be loaded.",
    ],
  ])(
    'says %s failed, never that nothing waits, and gives no partial count',
    (_case, change, failure) => {
      const view = pendingApprovalsView({ ...READS, ...change });
      expect(view.failures).toEqual([failure]);
      expect(view.summary).toEqual([]);
      expect(view.empty).toBe(false);
    },
  );

  it('still lists what the other read found', () => {
    const view = pendingApprovalsView({ ...READS, branches: failed(null) });
    expect(view.rows.map((row) => row.name)).toEqual(['Wanjiku Kariuki', 'Halima Odhiambo']);
  });

  it('never says nothing waits when the only read failed (L1)', () => {
    expect(
      pendingApprovalsView({
        users: null,
        userCounts: null,
        branches: failed(null),
        branchSelected: false,
      }),
    ).toEqual({
      summary: [],
      rows: [],
      failures: ["Branches waiting for activation couldn't be loaded."],
      provisioning: null,
      empty: false,
    });
  });

  it('lists five users waiting for a decision when the first five rows are provisioning (BG-11)', () => {
    const approved = [1, 2, 3, 4, 5].map((n) =>
      user(`e${String(n)}`, `Approved ${String(n)}`, 'PROVISIONING_IDP'),
    );
    const waiting = [1, 2, 3, 4, 5, 6].map((n) =>
      user(`f${String(n)}`, `Waiting ${String(n)}`, 'DRAFT'),
    );
    const view = pendingApprovalsView({
      ...READS,
      users: ok(page([...approved, ...waiting], 11)),
      userCounts: ok({ pending: 11, provisioning: 5 }),
      branches: null,
    });
    expect(view.rows.map((row) => row.name)).toEqual([
      'Waiting 1',
      'Waiting 2',
      'Waiting 3',
      'Waiting 4',
      'Waiting 5',
    ]);
    expect(view.provisioning).toBe(
      '5 identities are still being provisioned: approval already ran.',
    );
  });

  it.each([
    [0, 5],
    [1, 6],
    [5, 10],
    [95, 100],
    [400, 100],
  ])('with %i provisioning, reads a page of %i (at most 100)', (provisioning, size) => {
    expect(userPreviewSize(provisioning)).toBe(size);
  });
});
```

- [ ] **Step 2: Run** — form U: FAIL (the seventeen new tests: "TypeError: pendingApprovalsView is not a function" and, for the users read's size, "… userPreviewSize is not a function"; 2a's five still pass).

- [ ] **Step 3: Implement** — in `modules/administration/overview/overview-rules.ts`:

Replace

```ts
import {
  BRANCH_ACTIVATION_CODES,
  USER_APPROVAL_CODES,
} from '@/modules/administration/approvals/approval-rules';
import { READINESS_CODES, READINESS_LINKS } from './readiness-rules';
```

with

```ts
import type { NotificationEntry } from '@/components/shell/notifications-menu';
import type { Page } from '@/lib/api/wire';
import {
  approvalNotifications,
  type UserApprovalCounts,
} from '@/modules/administration/approvals/approval-notifications';
import {
  BRANCH_ACTIVATION_CODES,
  BRANCH_QUEUE_LABEL,
  branchApprovalHref,
  USER_APPROVAL_CODES,
  USER_QUEUE_LABEL,
  userApprovalHref,
} from '@/modules/administration/approvals/approval-rules';
import type { BranchSummary } from '@/modules/administration/branches/branch-contract';
import { branchTypeLabel } from '@/modules/administration/branches/branch-rules';
import type { UserSummary } from '@/modules/administration/users/user-contract';
import {
  provisioningNote,
  READINESS_CODES,
  READINESS_LINKS,
  type Settled,
} from './readiness-rules';
```

Then append, after a blank line at the end of the file:

```ts
// ── Pending approvals (Ruling 5) ─────────────────────────────────────────────────────────────────

/** The preview's length, and the branch read's page size (spec §10.8: up to five rows). */
export const APPROVAL_PREVIEW_SIZE = 5;
/** The users read's ceiling: the backend's maximum page (contract §A). */
export const USER_PREVIEW_CEILING = 100;

/** BG-11: an approved user can stay PROVISIONING_IDP with a pending membership for good, and the
 * endpoint can't leave such rows out, so the users read is wide enough to skip every one of them
 * and still hold five requests waiting for a decision (Ruling 5). */
export function userPreviewSize(provisioning: number): number {
  return Math.min(USER_PREVIEW_CEILING, APPROVAL_PREVIEW_SIZE + Math.max(0, provisioning));
}

export const APPROVALS_DESCRIPTION = 'Requests waiting for a decision, newest first.';
export const APPROVALS_LINK = 'Open the approval queue';
export const REQUESTS_LABEL = 'Requests waiting for a decision';
export const REVIEW = 'Review';

export interface ApprovalRow {
  id: string;
  kind: 'user' | 'branch';
  name: string;
  /** The queue it sits in, then an email, or a code and a type. */
  detail: string;
  href: string;
  /** The Review link's accessible name: "Review <name>". */
  reviewLabel: string;
}

export interface PendingApprovalsView {
  /** The bell's own entries (spec §8): each count with its tab's link. Empty after any failure. */
  summary: readonly NotificationEntry[];
  /** Up to five: users waiting for approval first, then branches, each newest first. */
  rows: readonly ApprovalRow[];
  /** One sentence per kind whose read failed, with its reference (rule 6). */
  failures: readonly string[];
  /** Identities still provisioning: approval already ran, so they are not listed (BG-11). */
  provisioning: string | null;
  /** Nothing waits, and every permitted read said so. */
  empty: boolean;
}

/** What the section read: each `null` when the holder can't decide that kind of request. */
export interface PendingApprovalsReads {
  /** The first page of memberships pending approval (`userPreviewSize` rows), provisioning
   * identities included. */
  users: Settled<Page<UserSummary>>;
  /** The bell's two counts (pending, and of those provisioning), shared per request. */
  userCounts: Settled<UserApprovalCounts>;
  /** The first page of branches pending activation, newest first; its total is the count. */
  branches: Settled<Page<BranchSummary>>;
  branchSelected: boolean;
}

const reference = (requestId: string | null) => (requestId ? ` Reference: ${requestId}` : '');

function userRow(user: UserSummary): ApprovalRow {
  return {
    id: user.id,
    kind: 'user',
    name: user.displayName,
    detail: `${USER_QUEUE_LABEL} · ${user.email}`,
    href: userApprovalHref(user.id),
    reviewLabel: `${REVIEW} ${user.displayName}`,
  };
}

function branchRow(branch: BranchSummary): ApprovalRow {
  return {
    id: branch.id,
    kind: 'branch',
    name: branch.branchName,
    detail: `${BRANCH_QUEUE_LABEL} · ${branch.branchCode} · ${branchTypeLabel(branch.branchType)}`,
    href: branchApprovalHref(branch.id),
    reviewLabel: `${REVIEW} ${branch.branchName}`,
  };
}

export function pendingApprovalsView(reads: PendingApprovalsReads): PendingApprovalsView {
  const failures: string[] = [];
  const userFailure =
    reads.users?.ok === false
      ? reads.users.problem
      : reads.userCounts?.ok === false
        ? reads.userCounts.problem
        : null;
  if (userFailure) {
    failures.push(
      `Users waiting for approval couldn't be loaded.${reference(userFailure.requestId)}`,
    );
  }
  if (reads.branches?.ok === false) {
    failures.push(
      `Branches waiting for activation couldn't be loaded.${reference(reads.branches.problem.requestId)}`,
    );
  }
  const users = reads.users?.ok
    ? reads.users.value.items.filter((user) => user.userStatus !== 'PROVISIONING_IDP').map(userRow)
    : [];
  const branches = reads.branches?.ok ? reads.branches.value.items.map(branchRow) : [];
  const rows = [...users, ...branches].slice(0, APPROVAL_PREVIEW_SIZE);
  // The bell's arithmetic and words, from the same reads: a count that failed is never a number.
  const summary =
    failures.length > 0
      ? []
      : approvalNotifications({
          users: reads.userCounts,
          branches:
            reads.branches === null
              ? null
              : reads.branches.ok
                ? { ok: true, value: reads.branches.value.page.totalItems }
                : { ok: false },
          branchSelected: reads.branchSelected,
        }).entries;
  const provisioning =
    reads.userCounts?.ok && reads.userCounts.value.provisioning > 0
      ? provisioningNote(reads.userCounts.value.provisioning)
      : null;
  return {
    summary,
    rows,
    failures,
    provisioning,
    empty: failures.length === 0 && summary.length === 0 && rows.length === 0,
  };
}
```

- [ ] **Step 4: Run** — form U: PASS (22 tests). Mutation proofs (each must fail the named test; revert after each): filter out `ACTIVE` users instead of `PROVISIONING_IDP` ones — "lists users first, then branches, each newest first as read, leaving provisioning out"; put branches first (`[...branches, ...users]`) — "lists users first, then branches, each newest first as read, leaving provisioning out"; keep the summary after a failure (`false ? [] : …`) — "says the user rows failed, never that nothing waits, and gives no partial count"; drop the failure guard from `empty` (`empty: summary.length === 0 && rows.length === 0`) — "never says nothing waits when the only read failed (L1)"; read five users whatever is provisioning (`Math.min(USER_PREVIEW_CEILING, APPROVAL_PREVIEW_SIZE)`) — "with 1 provisioning, reads a page of 6 (at most 100)"; drop the ceiling (`return APPROVAL_PREVIEW_SIZE + Math.max(0, provisioning);`) — "with 400 provisioning, reads a page of 100 (at most 100)".

- [ ] **Step 5: Commit** (form C):

```text
feat(overview): shape the pending approvals preview

The bell's own counts and links (layer 12), then up to five requests, users before branches, each
newest first, with identities still provisioning left out of the rows and noted apart (BG-11).
The users read is sized past them: five plus the provisioning count, at most 100, so five
requests waiting for a decision show when they exist. A failed read is named per kind with its
reference and never reads as "nothing waiting" or a partial count (Ruling 5).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** the summary entries are 12's
`approvalNotifications` output, so the card and the bell can't drift (rule 10).

#### Task 2c: The Recent activity rows

**Files:**

- Modify: `modules/administration/overview/overview-rules.ts` (two import edits; an append)
- Modify: `modules/administration/overview/overview-rules.test.ts` (two import edits; an append)

**Interfaces:**

- Consumes: 2b; `formatInstant`, `shortId` (`lib/format.ts`); 06's `AuditEvent` (type),
  `auditTrailHref` (`audit/audit-rows.ts`), `actionLabel` (`audit/audit-vocabulary.ts`).
- Produces: `ACTIVITY_SIZE`, `ACTIVITY_HREF`, `ACTIVITY_LINK`, `ACTIVITY_LABEL`, `NO_ACTIVITY`,
  `activityDescription`, `ActivityRow`, `activityRows`.

- [ ] **Step 1: Extend the test** — in `modules/administration/overview/overview-rules.test.ts`:

Replace

```ts
import type { BranchSummary } from '@/modules/administration/branches/branch-contract';
```

with

```ts
import type { AuditEvent } from '@/modules/administration/audit/audit-contract';
import type { BranchSummary } from '@/modules/administration/branches/branch-contract';
```

Then replace

```text
  APPROVAL_PREVIEW_SIZE,
```

with

```text
  activityDescription,
  activityRows,
  APPROVAL_PREVIEW_SIZE,
```

Then append, after a blank line at the end of the file:

```ts
describe('the Recent activity rows', () => {
  const event = (tail: string, action: string, actorUserId: string | null): AuditEvent => ({
    id: `14f00000-0000-4000-8000-0000000000${tail}`,
    occurredAt: '2026-09-08T06:00:00Z',
    actorType: actorUserId ? 'USER' : 'SYSTEM',
    actorUserId,
    branchId: null,
    action,
    entityType: 'USER',
    entityId: null,
    outcome: 'SUCCESS',
    severity: 'INFO',
    reason: null,
  });
  const JANE = '14d00000-0000-4000-8000-0000000000aa';
  const UNKNOWN = '14d00000-0000-4000-8000-0000000000bb';

  it('names the action and the actor, in the organisation timezone, linking to the event', () => {
    const rows = activityRows(
      [
        event('a1', 'user.welcome_email', null),
        event('a2', 'user.invite', JANE),
        event('a3', 'branch.create_draft', UNKNOWN),
      ],
      new Map([[JANE, 'Backend Jane Manager']]),
      'Africa/Nairobi',
    );
    expect(rows[0]).toEqual({
      id: '14f00000-0000-4000-8000-0000000000a1',
      action: 'Sent welcome email',
      actor: 'System',
      when: '08 Sep 2026 · 09:00',
      href: '/admin/audit?event=14f00000-0000-4000-8000-0000000000a1',
      linkLabel: 'View event: Sent welcome email, 08 Sep 2026 09:00',
    });
    expect(rows.map((row) => row.actor)).toEqual(['System', 'Backend Jane Manager', '14d00000']);
  });

  it('says which timezone the times are in', () => {
    expect(activityDescription('UTC')).toBe('The latest events. Times in UTC.');
  });
});
```

- [ ] **Step 2: Run** — form U: FAIL (the two new tests: "TypeError: activityRows is not a function" and "… activityDescription is not a function"; 2b's 22 still pass).

- [ ] **Step 3: Implement** — in `modules/administration/overview/overview-rules.ts`:

Replace

```ts
import type { Page } from '@/lib/api/wire';
```

with

```ts
import { formatInstant, shortId } from '@/lib/format';
import type { Page } from '@/lib/api/wire';
```

Then replace

```ts
import type { BranchSummary } from '@/modules/administration/branches/branch-contract';
```

with

```ts
import type { AuditEvent } from '@/modules/administration/audit/audit-contract';
import { auditTrailHref } from '@/modules/administration/audit/audit-rows';
import { actionLabel } from '@/modules/administration/audit/audit-vocabulary';
import type { BranchSummary } from '@/modules/administration/branches/branch-contract';
```

Then append, after a blank line at the end of the file:

```ts
// ── Recent activity ──────────────────────────────────────────────────────────────────────────────

/** The five latest audit events (spec §10.8); the endpoint lists newest first. */
export const ACTIVITY_SIZE = 5;
export const ACTIVITY_HREF = auditTrailHref({});
/** Never "audit trail": that name belongs to the navigation item (e2e/audit.spec.ts finds it). */
export const ACTIVITY_LINK = 'View all activity';
export const ACTIVITY_LABEL = 'Latest events';
export const NO_ACTIVITY = 'Nothing has been recorded yet.';

export function activityDescription(timeZone: string): string {
  return `The latest events. Times in ${timeZone}.`;
}

export interface ActivityRow {
  id: string;
  action: string;
  actor: string;
  /** `07 Sep 2026 · 10:59`, in the organisation's timezone. */
  when: string;
  /** The audit trail with this event's drawer open. */
  href: string;
  linkLabel: string;
}

/** Actors by resolved name, else a short id; a system event reads "System" (as the audit trail). */
export function activityRows(
  events: readonly AuditEvent[],
  names: ReadonlyMap<string, string>,
  timeZone: string,
): ActivityRow[] {
  return events.map((event) => {
    const at = formatInstant(event.occurredAt, timeZone);
    const action = actionLabel(event.action);
    return {
      id: event.id,
      action,
      actor: event.actorUserId
        ? (names.get(event.actorUserId) ?? shortId(event.actorUserId))
        : 'System',
      when: `${at.date} · ${at.time}`,
      href: auditTrailHref({ event: event.id }),
      linkLabel: `View event: ${action}, ${at.date} ${at.time}`,
    };
  });
}
```

- [ ] **Step 4: Run** — form U: PASS (24 tests). Mutation proof (revert after it): show every actor by short id (`? shortId(event.actorUserId)`) — "names the action and the actor, in the organisation timezone, linking to the event".

- [ ] **Step 5: Commit** (form C):

```text
feat(overview): shape the recent activity rows

Spec §10.8's Recent activity rows: the action in words, the actor by name (a short id when the
name can't or may not be read, "System" for a system event), the time in the given timezone, and
a link to the audit trail with that event's drawer open. The card's link reads "View all
activity": "audit trail" is the navigation item's name (rule 9).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

### Task 3: The overview's reads

**Files:**

- Create: `modules/administration/overview/overview-service.ts`
- Create: `modules/administration/overview/overview-service.test.ts`

**Interfaces:**

- Consumes: `toQueryString` (`lib/api/query-string.ts`), `apiGet` (`lib/api/tenant-api.ts`),
  `Page` (type); 06's `listAuditEvents`, `AuditEvent` (type); 08's `listBranches`,
  `DEFAULT_BRANCH_SORT`; 10's `membershipPageSchema`; 2c's `ACTIVITY_SIZE`.
- Produces: `countActiveBranches`, `countActiveMemberships` (both `cache()`d) and
  `listRecentActivity`, each rejecting on a failed read.

- [ ] **Step 1: Write the failing test** — create `modules/administration/overview/overview-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendApiError } from '@/auth/backend-api';
import { membershipPageSchema } from '@/modules/administration/users/user-contract';

const { apiGet, listAuditEvents, listBranches } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  listAuditEvents: vi.fn(),
  listBranches: vi.fn(),
}));
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args) as unknown,
}));
vi.mock('@/modules/administration/audit/audit-service', () => ({
  listAuditEvents: (...args: unknown[]) => listAuditEvents(...args) as unknown,
}));
vi.mock('@/modules/administration/branches/branch-service', () => ({
  listBranches: (...args: unknown[]) => listBranches(...args) as unknown,
}));

const service = await import('./overview-service');

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

describe('overview service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('counts active branches with one size=1 read (BG-15)', async () => {
    listBranches.mockResolvedValue(total(2));
    await expect(service.countActiveBranches()).resolves.toBe(2);
    expect(listBranches).toHaveBeenCalledExactlyOnceWith({
      status: 'ACTIVE',
      sort: { by: 'createdAt', dir: 'DESC' },
      page: 0,
      size: 1,
    });
  });

  it('counts active memberships with one size=1 read, through the users contract', async () => {
    apiGet.mockResolvedValue(total(1));
    await expect(service.countActiveMemberships()).resolves.toBe(1);
    expect(apiGet).toHaveBeenCalledExactlyOnceWith(
      '/api/v1/tenant/memberships?membership_status=ACTIVE&page=0&size=1',
      membershipPageSchema,
    );
  });

  it('reads the five newest audit events', async () => {
    listAuditEvents.mockResolvedValue(total(30));
    await service.listRecentActivity();
    expect(listAuditEvents).toHaveBeenCalledExactlyOnceWith({ page: 0, size: 5 });
  });

  it("rejects with the read's own error, for the card's load() (rule 6)", async () => {
    const error = new BackendApiError(403, { code: 'forbidden' });
    listBranches.mockRejectedValue(error);
    apiGet.mockRejectedValue(error);
    listAuditEvents.mockRejectedValue(error);
    await expect(service.countActiveBranches()).rejects.toBe(error);
    await expect(service.countActiveMemberships()).rejects.toBe(error);
    await expect(service.listRecentActivity()).rejects.toBe(error);
  });
});
```

- [ ] **Step 2: Run** — form U on `modules/administration/overview/overview-service.test.ts`: FAIL
      (the import `./overview-service` doesn't resolve).

- [ ] **Step 3: Implement** — create `modules/administration/overview/overview-service.ts`:

```ts
import 'server-only';
import { cache } from 'react';
import { toQueryString } from '@/lib/api/query-string';
import { apiGet } from '@/lib/api/tenant-api';
import type { Page } from '@/lib/api/wire';
import type { AuditEvent } from '@/modules/administration/audit/audit-contract';
import { listAuditEvents } from '@/modules/administration/audit/audit-service';
import { DEFAULT_BRANCH_SORT } from '@/modules/administration/branches/branch-query';
import { listBranches } from '@/modules/administration/branches/branch-service';
import { membershipPageSchema } from '@/modules/administration/users/user-contract';
import { ACTIVITY_SIZE } from './overview-rules';

/**
 * The overview's own reads (spec §10.8). The rest are other layers' and shared per request: 12's
 * approval counts and queue pages, 07's business date, 13's settings. Every function here REJECTS on
 * a failed read, so the card settles it with `load()` (rule 6): nothing here catches.
 */

/** Branches: one `size=1` read (BG-15). Pending branches are 12's `countBranchActivations`. */
export const countActiveBranches = cache(async (): Promise<number> => {
  const result = await listBranches({
    status: 'ACTIVE',
    sort: DEFAULT_BRANCH_SORT,
    page: 0,
    size: 1,
  });
  return result.page.totalItems;
});

/** People: ACTIVE memberships, one `size=1` read (BG-15). The endpoint has `membership_status`
 * (contract §E.3); it needs `membership.view`. */
export const countActiveMemberships = cache(async (): Promise<number> => {
  const result = await apiGet(
    `/api/v1/tenant/memberships${toQueryString({ membership_status: 'ACTIVE', page: 0, size: 1 })}`,
    membershipPageSchema,
  );
  return result.page.totalItems;
});

/** Recent activity: the five newest events (the endpoint lists newest first, contract §E.3). */
export function listRecentActivity(): Promise<Page<AuditEvent>> {
  return listAuditEvents({ page: 0, size: ACTIVITY_SIZE });
}
```

- [ ] **Step 4: Run** — form U: PASS (4 tests). Mutation proofs (each must fail the named test; revert after each): drop `membership_status: 'ACTIVE'` from the memberships query — "counts active memberships with one size=1 read, through the users contract"; drop `status: 'ACTIVE'` from the branch count — "counts active branches with one size=1 read (BG-15)".

- [ ] **Step 5: Commit** (form C):

```text
feat(overview): count active branches and members and read the latest activity

The overview's own reads: active branches and active memberships, one size=1 read each (BG-15;
the memberships read uses the users contract), and the five newest audit events. Each rejects on
failure so its card settles it with load() (rule 6); everything else the overview shows is read by
layers 06, 07, 12 and 13 and shared per request.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

### Task 4: The Business date card and the card skeleton

**Files:**

- Create: `modules/administration/overview/components/overview-card-skeleton.tsx`
- Create: `modules/administration/overview/components/business-date-card.tsx`
- Create: `modules/administration/overview/components/business-date-card.test.tsx`

**Interfaces:**

- Consumes: `SectionCard`, `StatusChip`, `ErrorState`, `next-link`; `load`, `Loaded`
  (`lib/api/load.ts`); `formatBusinessDate`; 07's `getBusinessDate`, `CurrentBusinessDate` (type);
  2a's `CARD_TITLES`, `BUSINESS_DATE_DESCRIPTION`, `BUSINESS_DATE_HREF`, `BUSINESS_DATE_LINK`.
- Produces: `OverviewCardSkeleton({ title })`, `BusinessDateCard({ current })`,
  `BusinessDateSection()`.

- [ ] **Step 1: Write the failing test** — create `modules/administration/overview/components/business-date-card.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import type { CurrentBusinessDate } from '@/modules/administration/business-date/business-date-contract';
import { renderWithProviders } from '@/test/test-utils';

const { getBusinessDate } = vi.hoisted(() => ({
  getBusinessDate: vi.fn<() => Promise<CurrentBusinessDate>>(),
}));

// `load()`'s catch reads the request headers; `next/navigation` stays real, so `redirect()` throws
// its digest as in production (as the bell's test).
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/modules/administration/business-date/business-date-service', () => ({
  getBusinessDate: () => getBusinessDate(),
}));

const { BusinessDateSection } = await import('./business-date-card');
const { OverviewCardSkeleton } = await import('./overview-card-skeleton');

const REFERENCE = '14a10000-0000-4000-8000-0000000000aa';

async function show() {
  return renderWithProviders(<>{await BusinessDateSection()}</>);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('BusinessDateSection', () => {
  it('shows the date with no timezone shift, its status, and a link to the page', async () => {
    getBusinessDate.mockResolvedValue({ date: '07-09-2026', status: 'CLOSED' });
    await show();

    const card = screen.getByRole('region', { name: 'Business date' });
    expect(within(card).getByRole('heading', { level: 2, name: 'Business date' })).toBeVisible();
    expect(within(card).getByText('Monday, 7 September 2026')).toBeInTheDocument();
    expect(within(card).getByText('Closed')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Open business date' })).toHaveAttribute(
      'href',
      '/admin/business-date',
    );
  });

  it('shows a failed read with its reference, in place of the date', async () => {
    getBusinessDate.mockRejectedValue(new BackendApiError(503, { requestId: REFERENCE }));
    await show();

    const card = screen.getByRole('region', { name: 'Business date' });
    expect(within(card).getByRole('alert')).toHaveTextContent(`Reference: ${REFERENCE}`);
    expect(within(card).queryByText(/2026/)).not.toBeInTheDocument();
  });

  it.each([
    ['a lost session to sign-in', new BackendApiError(401), ';/login?reason=session_expired;'],
    [
      'a stale context to context selection',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      ';/select-context;',
    ],
  ])('sends %s instead of showing a failure', async (_case, error, digest) => {
    getBusinessDate.mockRejectedValue(error);
    await expect(BusinessDateSection()).rejects.toMatchObject({
      digest: expect.stringContaining(digest) as unknown,
    });
  });
});

describe('OverviewCardSkeleton', () => {
  it('names the card at once and marks its body busy', () => {
    renderWithProviders(<OverviewCardSkeleton title="Recent activity" />);

    const card = screen.getByRole('region', { name: 'Recent activity' });
    expect(within(card).getByRole('heading', { level: 2, name: 'Recent activity' })).toBeVisible();
    expect(card.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run** — form U on the test: FAIL (its imports `./overview-card-skeleton` and
      `./business-date-card` don't resolve).

- [ ] **Step 3: Implement** — create `modules/administration/overview/components/overview-card-skeleton.tsx`:

```tsx
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import { SectionCard } from '@/components/data-display/section-card';

/** A card's Suspense fallback (spec §6.3): its title at once, its body marked busy until the card's
 * own reads stream in. The theme's reduced-motion rule stills the pulse. */
export function OverviewCardSkeleton({ title }: { title: string }) {
  return (
    <SectionCard title={title}>
      <Box aria-busy="true" sx={{ px: 4, py: 3.5 }}>
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="85%" />
        <Skeleton variant="text" width="40%" />
      </Box>
    </SectionCard>
  );
}
```

and `modules/administration/overview/components/business-date-card.tsx`:

```tsx
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { ErrorState } from '@/components/data-display/error-state';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import NextLink from '@/components/navigation/next-link';
import { load, type Loaded } from '@/lib/api/load';
import { formatBusinessDate } from '@/lib/format';
import type { CurrentBusinessDate } from '@/modules/administration/business-date/business-date-contract';
import { getBusinessDate } from '@/modules/administration/business-date/business-date-service';
import {
  BUSINESS_DATE_DESCRIPTION,
  BUSINESS_DATE_HREF,
  BUSINESS_DATE_LINK,
  CARD_TITLES,
} from '../overview-rules';

/** Spec §10.8's Business date card: the date, from its `dd-MM-yyyy` value with no timezone shift,
 * and its status; a failed read shows its reference in place of the date. */
export function BusinessDateCard({ current }: { current: Loaded<CurrentBusinessDate> }) {
  return (
    <SectionCard
      title={CARD_TITLES.businessDate}
      description={BUSINESS_DATE_DESCRIPTION}
      actions={
        <Link
          component={NextLink}
          href={BUSINESS_DATE_HREF}
          variant="body2"
          sx={{ fontWeight: 600 }}
        >
          {BUSINESS_DATE_LINK}
        </Link>
      }
    >
      {current.ok ? (
        <Box
          sx={{ px: 4, py: 3.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}
        >
          <Typography component="p" variant="h4" sx={{ overflowWrap: 'anywhere' }}>
            {formatBusinessDate(current.value.date, 'long')}
          </Typography>
          <StatusChip value={current.value.status} />
        </Box>
      ) : (
        <ErrorState problem={current.problem} />
      )}
    </SectionCard>
  );
}

/** One read, settled by `load()`: a lost session or a stale context redirects, any other failure
 * shows in this card alone. The app bar's chip makes the same read, so it is shared (`cache()`). */
export async function BusinessDateSection() {
  return <BusinessDateCard current={await load(getBusinessDate())} />;
}
```

- [ ] **Step 4: Run** — form U: PASS (5 tests). Mutation proofs (each must fail the named test; revert after each): render the short date (`formatBusinessDate(current.value.date, 'short')`) — "shows the date with no timezone shift, its status, and a link to the page"; settle the read without `load()` (`getBusinessDate().then(ok, () => failure)`) — "sends a lost session to sign-in".

- [ ] **Step 5: Commit** (form C):

```text
feat(overview): add the business date card and the card skeleton

The Business date card shows the date from its dd-MM-yyyy value with no timezone shift, its
status and a link to the page; its one read is the app bar chip's, settled by load(), so a lost
session or a stale context redirects and any other failure shows here with its reference. Each
card's Suspense fallback names the card at once and marks its body busy (spec §6.3).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

**Erratum (ed2081e, `fix(overview): keep readiness chips beside their items and size the loading cards`; 9614d80, `fix(overview): size each loading card like its card and split the chip pin`):** the gate's visual pass found every skeleton 145 px whatever the card (page CLS 0.10 at 1440 px and 0.14 at 375 px with staggered reads) and a loading card silent to a screen reader. `OverviewCardSkeleton` is therefore `OverviewCardSkeleton({ title, description, action?, shape = 'rows', rows = 0 })`: the card's static description, a placeholder the size of its header link's words (a hidden `Skeleton`, never a link), then the card's body shape (`date`: one h4 line; `readiness`: the bar block with the theme's 8 px bar, then five items of three lines; `rows`: list rows with the card's divider rules), and a visually hidden `CARD_LOADING` ('Loading…', exported by `overview-rules.ts`) just before the busy box, because inside `aria-busy` a screen reader may hold it back. `overview-rules.ts` also exports `ACTIVITY_DESCRIPTION` ('The latest events.', the description before the zone is known; `activityDescription` composes it, with its output unchanged). The old `OverviewCardSkeleton` describe moved from `business-date-card.test.tsx` to `overview-card-skeleton.test.tsx`, which counts rows by the busy box's children and pins the bar block's place first and the span's place.

The heights approximate the cards': Business date matches at 1440 px, Readiness is 543 px against 581 to 744, and Pending approvals' five rows are a guess (the empty card is 121 or 151 px, a full one 548 or 765 px). Page CLS with the staggered `stag-` copy of the fake API (two loads each; not repeatable to the digit): `overview-attention` 0.0255 at 1440 px and 0.0204 and 0.0225 at 375 px; `overview-ready` 0.0471 and 0.0705 at 1440 px, and 0.0204 and **0.1055** at 375 px, where the empty approvals card fills under its 395 px skeleton and Readiness moves up 244 px. That one is not below 0.1 and was left as measured. Recent activity's skeleton is 365 px against the real 395 at 375 px; its cause was not investigated.

### Task 5: The Operational readiness card

**Files:**

- Create: `modules/administration/overview/components/readiness-card.tsx`
- Create: `modules/administration/overview/components/readiness-card.test.tsx`

**Interfaces:**

- Consumes: `can`; `SectionCard`, `StatusChip`, `next-link`; `load`; 12's
  `countBranchActivations`, `countUserApprovals`; 07's `getBusinessDate`; 13's `listSettings`;
  3's `countActiveBranches`, `countActiveMemberships`; 1's `operationalReadiness`,
  `READINESS_CODES`, `READINESS_DESCRIPTION`, `READINESS_STATES`, `ReadinessItemId`,
  `ReadinessView`; 2a's `CARD_TITLES`. The test also reads `theme/contrast.ts`'s `contrastRatio`
  and `theme/tokens.ts`.
- Produces: `ReadinessCard({ view })`, `ReadinessSection({ permissions, organisationStatus })`
  (`organisationStatus: string`).

- [ ] **Step 1: Write the failing test** — create `modules/administration/overview/components/readiness-card.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import type { Page } from '@/lib/api/wire';
import type { UserApprovalCounts } from '@/modules/administration/approvals/approval-notifications';
import type { CurrentBusinessDate } from '@/modules/administration/business-date/business-date-contract';
import type { TenantSetting } from '@/modules/administration/settings/settings-contract';
import { contrastRatio } from '@/theme/contrast';
import { DARK, LIGHT } from '@/theme/tokens';
import { renderWithProviders } from '@/test/test-utils';
import { NOT_PERMITTED } from '../readiness-rules';

const reads = vi.hoisted(() => ({
  countActiveBranches: vi.fn<() => Promise<number>>(),
  countActiveMemberships: vi.fn<() => Promise<number>>(),
  countBranchActivations: vi.fn<() => Promise<number>>(),
  countUserApprovals: vi.fn<() => Promise<UserApprovalCounts>>(),
  getBusinessDate: vi.fn<() => Promise<CurrentBusinessDate>>(),
  listSettings: vi.fn<() => Promise<Page<TenantSetting>>>(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/modules/administration/approvals/approval-service', () => ({
  countBranchActivations: () => reads.countBranchActivations(),
  countUserApprovals: () => reads.countUserApprovals(),
}));
vi.mock('@/modules/administration/business-date/business-date-service', () => ({
  getBusinessDate: () => reads.getBusinessDate(),
}));
vi.mock('@/modules/administration/settings/settings-service', () => ({
  listSettings: () => reads.listSettings(),
}));
vi.mock('../overview-service', () => ({
  countActiveBranches: () => reads.countActiveBranches(),
  countActiveMemberships: () => reads.countActiveMemberships(),
}));

const { ReadinessSection } = await import('./readiness-card');

const EVERY_CODE = [
  'settings.view',
  'branch.view',
  'membership.view',
  'user.view',
  'user.approve',
  'business_date.view',
];
const REFERENCE = '14a20000-0000-4000-8000-0000000000aa';

const setting = (key: string, value: string | null): TenantSetting => ({
  key,
  value,
  redacted: false,
  platformAdminOnly: false,
});

function settled() {
  reads.listSettings.mockResolvedValue({
    items: [setting('base_currency', 'KES'), setting('default_timezone', 'Africa/Nairobi')],
    page: {
      number: 0,
      size: 100,
      totalItems: 2,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    },
  });
  reads.countActiveBranches.mockResolvedValue(2);
  reads.countBranchActivations.mockResolvedValue(0);
  reads.countActiveMemberships.mockResolvedValue(2);
  reads.countUserApprovals.mockResolvedValue({ pending: 0, provisioning: 0 });
  reads.getBusinessDate.mockResolvedValue({ date: '07-09-2026', status: 'OPEN' });
}

async function show(permissions: string[] = EVERY_CODE, organisationStatus = 'ACTIVE') {
  return renderWithProviders(<>{await ReadinessSection({ permissions, organisationStatus })}</>);
}

/** The item whose h3 is `label`, as a list item. */
function itemOf(label: string) {
  const card = screen.getByRole('region', { name: 'Operational readiness' });
  const heading = within(card).getByRole('heading', { level: 3, name: label });
  const entry = heading.closest('li');
  if (!entry) throw new Error(`no list item holds ${label}`);
  return entry;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ReadinessSection', () => {
  it('shows five ready items under a full teal bar named for the card', async () => {
    settled();
    await show();

    const bar = screen.getByRole('progressbar', { name: 'Operational readiness' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuetext', '5 of 5 ready');
    expect(bar.className).toMatch(/colorSuccess/);
    const card = screen.getByRole('region', { name: 'Operational readiness' });
    expect(within(card).getByText('5 of 5 ready')).toBeInTheDocument();
    expect(
      within(card)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Institution profile', 'Branches', 'People', 'Onboarding', 'Business date']);
    expect(within(card).getAllByText('Ready')).toHaveLength(5);
    expect(itemOf('Business date')).toHaveTextContent('Open for Mon, 7 Sep 2026.');
  });

  it('links each item to the page where it is dealt with (Ruling 12)', async () => {
    settled();
    await show();

    for (const [label, name, href] of [
      ['Institution profile', 'Open settings', '/admin/settings'],
      ['Branches', 'Open branches', '/admin/branches'],
      ['People', 'Open users & access', '/admin/users'],
      ['Onboarding', 'Open user onboarding', '/admin/approvals/users'],
      ['Business date', 'Open business date', '/admin/business-date'],
    ] as const) {
      expect(within(itemOf(label)).getByRole('link', { name })).toHaveAttribute('href', href);
    }
  });

  it("offers no link to a page the holder can't open", async () => {
    settled();
    await show(['branch.view', 'membership.view']);

    expect(within(itemOf('Branches')).getByRole('link')).toHaveAccessibleName('Open branches');
    for (const label of ['Institution profile', 'People', 'Onboarding', 'Business date']) {
      expect(within(itemOf(label)).queryByRole('link')).not.toBeInTheDocument();
    }
  });

  it("reads nothing an item's code doesn't allow, and says it can't be checked", async () => {
    settled();
    await show(['branch.view']);

    expect(reads.countActiveBranches).toHaveBeenCalledOnce();
    expect(reads.countBranchActivations).toHaveBeenCalledOnce();
    for (const read of [
      reads.listSettings,
      reads.countActiveMemberships,
      reads.countUserApprovals,
      reads.getBusinessDate,
    ]) {
      expect(read).not.toHaveBeenCalled();
    }
    for (const label of ['Institution profile', 'People', 'Onboarding', 'Business date']) {
      expect(itemOf(label)).toHaveTextContent(NOT_PERMITTED);
      expect(within(itemOf(label)).getByText("Can't be checked", { exact: true })).toBeVisible();
    }
    expect(screen.getByRole('progressbar', { name: 'Operational readiness' })).toHaveAttribute(
      'aria-valuetext',
      '1 of 5 ready · 4 not checked',
    );
  });

  it('reads no branch count without branch.view', async () => {
    settled();
    await show(['membership.view']);

    expect(reads.countActiveMemberships).toHaveBeenCalledOnce();
    expect(reads.countActiveBranches).not.toHaveBeenCalled();
    expect(reads.countBranchActivations).not.toHaveBeenCalled();
    expect(within(itemOf('Branches')).getByText("Can't be checked", { exact: true })).toBeVisible();
  });

  it('marks a failed read on its own item, with its reference, and keeps the rest', async () => {
    settled();
    reads.countActiveMemberships.mockRejectedValue(
      new BackendApiError(503, { requestId: REFERENCE }),
    );
    await show();

    expect(itemOf('People')).toHaveTextContent(`Couldn't be loaded. Reference: ${REFERENCE}`);
    expect(
      within(itemOf('People')).getByText("Couldn't be checked", { exact: true }),
    ).toBeVisible();
    expect(itemOf('Branches')).toHaveTextContent('Ready');
    expect(screen.getByRole('progressbar', { name: 'Operational readiness' })).toHaveAttribute(
      'aria-valuenow',
      '80',
    );
  });

  it('names what needs attention', async () => {
    settled();
    reads.countActiveMemberships.mockResolvedValue(1);
    reads.getBusinessDate.mockResolvedValue({ date: '07-09-2026', status: 'CLOSED' });
    await show();

    expect(within(itemOf('People')).getByText('Needs attention', { exact: true })).toBeVisible();
    expect(itemOf('Business date')).toHaveTextContent('Closed for Mon, 7 Sep 2026.');
    expect(screen.getByText('3 of 5 ready')).toBeInTheDocument();
  });

  it.each([
    ['a lost session to sign-in', new BackendApiError(401), ';/login?reason=session_expired;'],
    [
      'a stale context to context selection',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      ';/select-context;',
    ],
  ])('sends %s instead of marking an item', async (_case, error, digest) => {
    settled();
    reads.listSettings.mockRejectedValue(error);
    await expect(
      ReadinessSection({ permissions: EVERY_CODE, organisationStatus: 'ACTIVE' }),
    ).rejects.toMatchObject({ digest: expect.stringContaining(digest) as unknown });
  });

  it.each([
    ['light', LIGHT],
    ['dark', DARK],
  ] as const)(
    'draws a teal bar that stands out from its track (%s, WCAG 1.4.11)',
    (_scheme, scheme) => {
      expect(contrastRatio(scheme.success.main, scheme.surfaces.tertiary)).toBeGreaterThanOrEqual(
        3,
      );
    },
  );
});
```

- [ ] **Step 2: Run** — form U on the test: FAIL (the import `./readiness-card` doesn't resolve).

- [ ] **Step 3: Implement** — create `modules/administration/overview/components/readiness-card.tsx`:

```tsx
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { can } from '@/auth/permissions';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import NextLink from '@/components/navigation/next-link';
import { load } from '@/lib/api/load';
import {
  countBranchActivations,
  countUserApprovals,
} from '@/modules/administration/approvals/approval-service';
import { getBusinessDate } from '@/modules/administration/business-date/business-date-service';
import { listSettings } from '@/modules/administration/settings/settings-service';
import { CARD_TITLES } from '../overview-rules';
import { countActiveBranches, countActiveMemberships } from '../overview-service';
import {
  operationalReadiness,
  READINESS_CODES,
  READINESS_DESCRIPTION,
  READINESS_STATES,
  type ReadinessItemId,
  type ReadinessView,
} from '../readiness-rules';

/** Spec §10.8's Operational readiness: one teal bar for the share of items ready (spec §7.3,
 * through the bar's own `color`, never a theme default: `ListNavigationProgress` shares the
 * component), then the five items, each with its state in words and, where the holder can open
 * it, a link to the page where it is dealt with (Ruling 12). */
export function ReadinessCard({ view }: { view: ReadinessView }) {
  return (
    <SectionCard title={CARD_TITLES.readiness} description={READINESS_DESCRIPTION}>
      <Box sx={{ px: 4, pt: 3.5, pb: 3 }}>
        <Typography component="p" variant="body2" sx={{ fontWeight: 700, mb: 1.5 }}>
          {view.summary}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={view.progress}
          color="success"
          aria-label={CARD_TITLES.readiness}
          aria-valuetext={view.summary}
        />
      </Box>
      <Box component="ul" role="list" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {view.items.map((entry) => (
          <Box
            component="li"
            key={entry.id}
            sx={{
              px: 4,
              py: 2.5,
              borderTop: 1,
              borderColor: 'divider',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            <Box sx={{ minWidth: 0, flex: '1 1 12rem' }}>
              <Typography component="h3" variant="body1" sx={{ fontWeight: 700 }}>
                {entry.label}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}
              >
                {entry.detail}
              </Typography>
              {entry.link ? (
                <Link
                  component={NextLink}
                  href={entry.link.href}
                  variant="body2"
                  sx={{ display: 'inline-block', mt: 0.5, fontWeight: 600 }}
                >
                  {entry.link.label}
                </Link>
              ) : null}
            </Box>
            <StatusChip
              value={entry.state}
              label={READINESS_STATES[entry.state].label}
              tone={READINESS_STATES[entry.state].tone}
            />
          </Box>
        ))}
      </Box>
    </SectionCard>
  );
}

/** Each item's reads only with its code, all in parallel and each settled by `load()`: a lost
 * session or a stale context redirects, any other failure marks that item alone. The approval
 * counts and the business date are shared with the app bar per request (`cache()`). */
export async function ReadinessSection({
  permissions,
  organisationStatus,
}: {
  permissions: readonly string[];
  organisationStatus: string;
}) {
  const may = (id: ReadinessItemId) => can({ permissions }, READINESS_CODES[id]);
  const [settings, activeBranches, pendingBranches, activeMembers, userApprovals, businessDate] =
    await Promise.all([
      may('institution') ? load(listSettings()) : null,
      may('branches') ? load(countActiveBranches()) : null,
      may('branches') ? load(countBranchActivations()) : null,
      may('people') ? load(countActiveMemberships()) : null,
      may('onboarding') ? load(countUserApprovals()) : null,
      may('businessDate') ? load(getBusinessDate()) : null,
    ]);
  return (
    <ReadinessCard
      view={operationalReadiness(
        {
          organisationStatus,
          settings,
          activeBranches,
          pendingBranches,
          activeMembers,
          userApprovals,
          businessDate,
        },
        { permissions },
      )}
    />
  );
}
```

- [ ] **Step 4: Run** — form U: PASS (11 tests). Mutation proofs (each must fail the named test; revert after each): read the membership count whatever the codes (`load(countActiveMemberships()),`) — "reads nothing an item's code doesn't allow, and says it can't be checked"; read the active-branch count whatever the codes (`load(countActiveBranches()),`) — "reads no branch count without branch.view"; draw the bar primary (`color="primary"`) — "shows five ready items under a full teal bar named for the card"; drop the bar's `aria-label` — "shows five ready items under a full teal bar named for the card"; point every item's link at `/admin` — "links each item to the page where it is dealt with (Ruling 12)".

- [ ] **Step 5: Commit** (form C):

```text
feat(overview): add the operational readiness card with its teal bar

The five items under one determinate bar for the share ready, teal through the bar's own colour
(success on the theme's track, 4.49:1 and 7.56:1, pinned in the test; no token, and the list
navigation bar keeps its default). Each item's reads run only with its code, in parallel, each
settled by load(): an item the holder can't read says so, and a failed read marks its item alone.
Each item links to its page under its detail when the holder can open that page (Ruling 12).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

**Erratum (ed2081e, `fix(overview): keep readiness chips beside their items and size the loading cards`; 9614d80, `fix(overview): size each loading card like its card and split the chip pin`):** each readiness item is a two-column grid (`display: 'grid'`, `gridTemplateColumns: 'minmax(0, 1fr) auto'`, `alignItems: 'start'`, `gap: 2`; the text box keeps `minWidth: 0`) instead of the wrapping flex row, so its state chip stays beside its heading. The flex row dropped the chip under the text at 1200 to 1280 px (all five items in `overview-attention`) and, for the Can't and Couldn't be checked chips, at 375 px in `overview-limited`, so the chips sat in two places in one list. Pinned by two e2e tests, one per scenario, which find each chip by its exact words and assert its top within 8 px of its h3's top at 1280 and 375 px; with the old row they fail at 87 px (`overview-attention`, 1280) and 48.4 px (`overview-limited`, 375).

### Task 6: The Pending approvals card

**Files:**

- Create: `modules/administration/overview/components/pending-approvals-card.tsx`
- Create: `modules/administration/overview/components/pending-approvals-card.test.tsx`

**Interfaces:**

- Consumes: `SectionCard`, `next-link`; `load`; 12's `NOTHING_WAITING`, `APPROVALS_HREF`,
  `countUserApprovals`, `listBranchActivations`, `listUserApprovals`; 08's `DEFAULT_BRANCH_SORT`;
  2b's `APPROVAL_PREVIEW_SIZE`, `APPROVALS_DESCRIPTION`, `APPROVALS_LINK`, `pendingApprovalsView`,
  `REQUESTS_LABEL`, `REVIEW`, `userPreviewSize`, `PendingApprovalsView`; 2a's `CARD_TITLES`.
- Produces: `PendingApprovalsCard({ view })`,
  `PendingApprovalsSection({ users, branches, branchSelected })`.

- [ ] **Step 1: Write the failing test** — create `modules/administration/overview/components/pending-approvals-card.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import type { Page } from '@/lib/api/wire';
import type { UserApprovalCounts } from '@/modules/administration/approvals/approval-notifications';
import type { BranchSummary } from '@/modules/administration/branches/branch-contract';
import type { UserSummary } from '@/modules/administration/users/user-contract';
import { renderWithProviders } from '@/test/test-utils';

const reads = vi.hoisted(() => ({
  countUserApprovals: vi.fn<() => Promise<UserApprovalCounts>>(),
  listBranchActivations: vi.fn<(query: unknown) => Promise<Page<BranchSummary>>>(),
  listUserApprovals: vi.fn<(paging: unknown) => Promise<Page<UserSummary>>>(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/modules/administration/approvals/approval-service', () => ({
  countUserApprovals: () => reads.countUserApprovals(),
  listBranchActivations: (query: unknown) => reads.listBranchActivations(query),
  listUserApprovals: (paging: unknown) => reads.listUserApprovals(paging),
}));

const { PendingApprovalsSection } = await import('./pending-approvals-card');

const REFERENCE = '14a30000-0000-4000-8000-0000000000aa';

function page<T>(items: T[], totalItems = items.length): Page<T> {
  return {
    items,
    page: { number: 0, size: 5, totalItems, totalPages: 1, hasNext: false, hasPrevious: false },
  };
}

const person = (tail: string, displayName: string, userStatus: UserSummary['userStatus']) => ({
  id: `14b10000-0000-4000-8000-0000000000${tail}`,
  username: tail,
  email: `${tail}@greenfield.example`,
  displayName,
  userStatus,
  membershipStatus: 'PENDING_APPROVAL' as const,
});

const WANJIKU = person('a4', 'Wanjiku Kariuki', 'DRAFT');
const BARAKA = person('a3', 'Baraka Otieno', 'PROVISIONING_IDP');
const NYERI: BranchSummary = {
  id: '14c10000-0000-4000-8000-0000000000c2',
  branchCode: 'NYERI',
  branchName: 'Nyeri Branch',
  branchType: 'OPERATIONS',
  status: 'PENDING_APPROVAL',
  createdAt: '2026-09-15T08:00:00Z',
};

function waiting() {
  reads.listUserApprovals.mockResolvedValue(page([WANJIKU, BARAKA]));
  reads.countUserApprovals.mockResolvedValue({ pending: 2, provisioning: 1 });
  reads.listBranchActivations.mockResolvedValue(page([NYERI], 3));
}

async function show(users = true, branches = true, branchSelected = false) {
  return renderWithProviders(
    <>{await PendingApprovalsSection({ users, branches, branchSelected })}</>,
  );
}

const card = () => screen.getByRole('region', { name: 'Pending approvals' });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('PendingApprovalsSection', () => {
  it('reads both previews newest first: five, and past each identity still provisioning', async () => {
    waiting();
    await show();

    expect(reads.listUserApprovals).toHaveBeenCalledExactlyOnceWith({ page: 0, size: 6 });
    expect(reads.listBranchActivations).toHaveBeenCalledExactlyOnceWith({
      sort: { by: 'createdAt', dir: 'DESC' },
      page: 0,
      size: 5,
    });
    expect(reads.countUserApprovals).toHaveBeenCalledOnce();
  });

  it('counts each kind with its tab, then lists users before branches, each with Review', async () => {
    waiting();
    await show();

    expect(card()).toHaveTextContent('1 user is waiting for approval.');
    expect(within(card()).getByRole('link', { name: 'Review user onboarding' })).toHaveAttribute(
      'href',
      '/admin/approvals/users',
    );
    expect(card()).toHaveTextContent('3 branches are waiting for activation.');
    expect(within(card()).getByRole('link', { name: 'Review branch activation' })).toHaveAttribute(
      'href',
      '/admin/approvals/branches',
    );
    const rows = within(
      within(card()).getByRole('list', { name: 'Requests waiting for a decision' }),
    ).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Wanjiku KariukiUser onboarding · a4@greenfield.exampleReview',
      'Nyeri BranchBranch activation · NYERI · OperationsReview',
    ]);
    expect(within(card()).getByRole('link', { name: 'Review Wanjiku Kariuki' })).toHaveAttribute(
      'href',
      `/admin/approvals/users/${WANJIKU.id}`,
    );
    expect(within(card()).getByRole('link', { name: 'Review Nyeri Branch' })).toHaveAttribute(
      'href',
      `/admin/approvals/branches/${NYERI.id}`,
    );
    expect(within(card()).getByRole('note')).toHaveTextContent(
      '1 identity is still being provisioned: approval already ran.',
    );
    expect(within(card()).getByRole('link', { name: 'Open the approval queue' })).toHaveAttribute(
      'href',
      '/admin/approvals',
    );
  });

  it('never reads more than a page of 100 users (BG-11)', async () => {
    waiting();
    reads.countUserApprovals.mockResolvedValue({ pending: 300, provisioning: 200 });
    await show();

    expect(reads.listUserApprovals).toHaveBeenCalledExactlyOnceWith({ page: 0, size: 100 });
  });

  it("doesn't read the users preview after its count failed", async () => {
    waiting();
    reads.countUserApprovals.mockRejectedValue(new BackendApiError(503, { requestId: REFERENCE }));
    await show();

    expect(reads.listUserApprovals).not.toHaveBeenCalled();
    expect(within(card()).getByRole('alert')).toHaveTextContent(
      `Users waiting for approval couldn't be loaded. Reference: ${REFERENCE}`,
    );
    expect(within(card()).getByRole('link', { name: 'Review Nyeri Branch' })).toBeVisible();
  });

  it('reads only the kinds the holder can decide', async () => {
    waiting();
    await show(false, true);

    expect(reads.listUserApprovals).not.toHaveBeenCalled();
    expect(reads.countUserApprovals).not.toHaveBeenCalled();
    expect(within(card()).queryByRole('link', { name: 'Review user onboarding' })).toBeNull();
    expect(within(card()).queryByRole('note')).toBeNull();
  });

  it('reads no branches without both branch codes', async () => {
    waiting();
    await show(true, false);

    expect(reads.listBranchActivations).not.toHaveBeenCalled();
    expect(within(card()).queryByRole('link', { name: 'Review branch activation' })).toBeNull();
    expect(within(card()).getByRole('link', { name: 'Review Wanjiku Kariuki' })).toBeVisible();
  });

  it('says nothing is waiting only when every read said so', async () => {
    reads.listUserApprovals.mockResolvedValue(page([]));
    reads.countUserApprovals.mockResolvedValue({ pending: 0, provisioning: 0 });
    reads.listBranchActivations.mockResolvedValue(page([]));
    await show();

    expect(card()).toHaveTextContent('Nothing is waiting for your approval.');
    expect(within(card()).queryByRole('list')).toBeNull();
  });

  it('says nothing is waiting before it notes the identities still provisioning', async () => {
    reads.countUserApprovals.mockResolvedValue({ pending: 1, provisioning: 1 });
    reads.listUserApprovals.mockResolvedValue(page([BARAKA]));
    reads.listBranchActivations.mockResolvedValue(page([]));
    await show();

    const empty = within(card()).getByText('Nothing is waiting for your approval.');
    const note = within(card()).getByRole('note');
    expect(empty.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('never says nothing is waiting when its only read failed (L1)', async () => {
    reads.listBranchActivations.mockRejectedValue(
      new BackendApiError(503, { requestId: REFERENCE }),
    );
    await show(false, true);

    expect(within(card()).getByRole('alert')).toHaveTextContent(
      `Branches waiting for activation couldn't be loaded. Reference: ${REFERENCE}`,
    );
    expect(card()).not.toHaveTextContent('Nothing is waiting');
  });

  it('says a failed read failed, with its reference, and still lists what the other found', async () => {
    waiting();
    reads.listBranchActivations.mockRejectedValue(
      new BackendApiError(503, { requestId: REFERENCE }),
    );
    await show();

    expect(within(card()).getByRole('alert')).toHaveTextContent(
      `Branches waiting for activation couldn't be loaded. Reference: ${REFERENCE}`,
    );
    expect(card()).not.toHaveTextContent('Nothing is waiting');
    expect(within(card()).queryByRole('link', { name: 'Review user onboarding' })).toBeNull();
    expect(within(card()).getByRole('link', { name: 'Review Wanjiku Kariuki' })).toBeVisible();
  });

  it.each([
    ['a lost session to sign-in', new BackendApiError(401), ';/login?reason=session_expired;'],
    [
      'a stale context to context selection',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      ';/select-context;',
    ],
  ])('sends %s instead of showing a failure', async (_case, error, digest) => {
    waiting();
    reads.countUserApprovals.mockRejectedValue(error);
    await expect(
      PendingApprovalsSection({ users: true, branches: true, branchSelected: false }),
    ).rejects.toMatchObject({ digest: expect.stringContaining(digest) as unknown });
  });
});
```

- [ ] **Step 2: Run** — form U on the test: FAIL (the import `./pending-approvals-card` doesn't
      resolve).

- [ ] **Step 3: Implement** — create `modules/administration/overview/components/pending-approvals-card.tsx`:

```tsx
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { SectionCard } from '@/components/data-display/section-card';
import NextLink from '@/components/navigation/next-link';
import { load } from '@/lib/api/load';
import { NOTHING_WAITING } from '@/modules/administration/approvals/approval-notifications';
import { APPROVALS_HREF } from '@/modules/administration/approvals/approval-rules';
import {
  countUserApprovals,
  listBranchActivations,
  listUserApprovals,
} from '@/modules/administration/approvals/approval-service';
import { DEFAULT_BRANCH_SORT } from '@/modules/administration/branches/branch-query';
import {
  APPROVAL_PREVIEW_SIZE,
  APPROVALS_DESCRIPTION,
  APPROVALS_LINK,
  CARD_TITLES,
  pendingApprovalsView,
  REQUESTS_LABEL,
  REVIEW,
  userPreviewSize,
  type PendingApprovalsView,
} from '../overview-rules';

/** Spec §10.8's Pending approvals: each count with its tab, up to five requests with Review, and
 * the identities still provisioning noted apart. A failed read says so, with its reference. */
export function PendingApprovalsCard({ view }: { view: PendingApprovalsView }) {
  return (
    <SectionCard
      title={CARD_TITLES.approvals}
      description={APPROVALS_DESCRIPTION}
      actions={
        <Link component={NextLink} href={APPROVALS_HREF} variant="body2" sx={{ fontWeight: 600 }}>
          {APPROVALS_LINK}
        </Link>
      }
    >
      {view.failures.map((failure) => (
        <Alert key={failure} severity="error" sx={{ mx: 4, mt: 3, overflowWrap: 'anywhere' }}>
          {failure}
        </Alert>
      ))}
      {view.summary.length > 0 && (
        <Box component="ul" role="list" sx={{ listStyle: 'none', m: 0, px: 4, pt: 3 }}>
          {view.summary.map((entry) => (
            <Box
              component="li"
              key={entry.id}
              sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, py: 0.5 }}
            >
              <Typography component="span" variant="body2">
                {entry.text}
              </Typography>
              <Link component={NextLink} href={entry.href} variant="body2" sx={{ fontWeight: 600 }}>
                {entry.linkLabel}
              </Link>
            </Box>
          ))}
        </Box>
      )}
      {view.rows.length > 0 && (
        <Box
          component="ul"
          role="list"
          aria-label={REQUESTS_LABEL}
          sx={{ listStyle: 'none', m: 0, mt: 3, p: 0 }}
        >
          {view.rows.map((row) => (
            <Box
              component="li"
              key={`${row.kind}-${row.id}`}
              sx={{
                px: 4,
                py: 2.5,
                borderTop: 1,
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 3,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body1" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                  {row.name}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}
                >
                  {row.detail}
                </Typography>
              </Box>
              <Link
                component={NextLink}
                href={row.href}
                aria-label={row.reviewLabel}
                variant="body2"
                sx={{ fontWeight: 700, flexShrink: 0 }}
              >
                {REVIEW}
              </Link>
            </Box>
          ))}
        </Box>
      )}
      {view.empty && (
        <Typography
          sx={{ px: 4, pt: 3.5, pb: view.provisioning ? 0 : 3.5, color: 'text.secondary' }}
        >
          {NOTHING_WAITING}
        </Typography>
      )}
      {view.provisioning && (
        <Alert severity="info" role="note" sx={{ mx: 4, my: 3 }}>
          {view.provisioning}
        </Alert>
      )}
    </SectionCard>
  );
}

/** BG-11: an approved identity can wait on provisioning for good, and the endpoint can't leave it
 * out, so the users preview follows the bell's counts (shared per request, `cache()`) and is wide
 * enough to skip each one: one bounded read of at most 100 (`userPreviewSize`). After a failed
 * count the preview isn't read; the card says the users couldn't be loaded. */
async function readUserPreview() {
  const counts = await load(countUserApprovals());
  if (!counts.ok) return { counts, page: counts };
  const page = await load(
    listUserApprovals({ page: 0, size: userPreviewSize(counts.value.provisioning) }),
  );
  return { counts, page };
}

/** The users preview after its count, the five-row branch preview beside it; each read only with
 * its kind's codes and settled by `load()`: a lost session or a stale context redirects. */
export async function PendingApprovalsSection({
  users,
  branches,
  branchSelected,
}: {
  users: boolean;
  branches: boolean;
  branchSelected: boolean;
}) {
  const [userReads, branchPage] = await Promise.all([
    users ? readUserPreview() : null,
    branches
      ? load(
          listBranchActivations({
            sort: DEFAULT_BRANCH_SORT,
            page: 0,
            size: APPROVAL_PREVIEW_SIZE,
          }),
        )
      : null,
  ]);
  return (
    <PendingApprovalsCard
      view={pendingApprovalsView({
        users: userReads?.page ?? null,
        userCounts: userReads?.counts ?? null,
        branches: branchPage,
        branchSelected,
      })}
    />
  );
}
```

- [ ] **Step 4: Run** — form U: PASS (12 tests). Mutation proofs (each must fail the named test; revert after each): read the users whatever the holder decides (`readUserPreview(),`) — "reads only the kinds the holder can decide"; read the branches whatever the holder decides (`true ? load(…) : null`) — "reads no branches without both branch codes"; read the branch preview oldest first (`sort: { by: 'createdAt', dir: 'ASC' }`) — "reads both previews newest first: five, and past each identity still provisioning"; read five users whatever is provisioning (`size: APPROVAL_PREVIEW_SIZE`) — "reads both previews newest first: five, and past each identity still provisioning"; read the preview after a failed count (`if (!counts.ok) return { counts, page: await load(listUserApprovals({ page: 0, size: APPROVAL_PREVIEW_SIZE })) };`) — "doesn't read the users preview after its count failed"; drop the Review link's `aria-label` — "counts each kind with its tab, then lists users before branches, each with Review"; render the provisioning note before the empty sentence — "says nothing is waiting before it notes the identities still provisioning"; 2b's `empty` mutation, against this card — "never says nothing is waiting when its only read failed (L1)".

- [ ] **Step 5: Commit** (form C):

```text
feat(overview): add the pending approvals card

The bell's counts with a link to each queue tab, then up to five requests, users before branches,
each newest first with a Review link named for the request; "Nothing is waiting for your
approval." before the note on identities still provisioning (BG-11). The users preview is read
after the bell's cached counts, wide enough to skip each provisioning identity (at most 100), and
not at all after a failed count; the branch preview is five rows. A failed read is named per
kind, with its reference, and the other kind's rows stay.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

### Task 7: The Recent activity card

**Files:**

- Create: `modules/administration/overview/components/recent-activity-card.tsx`
- Create: `modules/administration/overview/components/recent-activity-card.test.tsx`

**Interfaces:**

- Consumes: `SectionCard`, `ErrorState`, `next-link`; `load`, `Loaded`; 06's
  `getOrganisationTimeZone`, `resolveUserNames` (`lib/api/lookups.ts`); 2c's `ACTIVITY_HREF`,
  `ACTIVITY_LABEL`, `ACTIVITY_LINK`, `activityDescription`, `activityRows`, `NO_ACTIVITY`,
  `ActivityRow`; 2a's `CARD_TITLES`; 3's `listRecentActivity`.
- Produces: `RecentActivityCard({ timeZone, activity })`,
  `RecentActivitySection({ names, timeZone })` (two booleans: whether the names and the timezone
  may be read).

- [ ] **Step 1: Write the failing test** — create `modules/administration/overview/components/recent-activity-card.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import type { Page } from '@/lib/api/wire';
import type { AuditEvent } from '@/modules/administration/audit/audit-contract';
import { renderWithProviders } from '@/test/test-utils';

const reads = vi.hoisted(() => ({
  getOrganisationTimeZone: vi.fn<() => Promise<string>>(),
  listRecentActivity: vi.fn<() => Promise<Page<AuditEvent>>>(),
  resolveUserNames: vi.fn<(ids: readonly string[]) => Promise<ReadonlyMap<string, string>>>(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/lib/api/lookups', () => ({
  getOrganisationTimeZone: () => reads.getOrganisationTimeZone(),
  resolveUserNames: (ids: readonly string[]) => reads.resolveUserNames(ids),
}));
vi.mock('../overview-service', () => ({
  listRecentActivity: () => reads.listRecentActivity(),
}));

const { RecentActivitySection } = await import('./recent-activity-card');

const JANE = '14d10000-0000-4000-8000-0000000000aa';
const REFERENCE = '14a40000-0000-4000-8000-0000000000aa';

const event = (tail: string, action: string, actorUserId: string | null): AuditEvent => ({
  id: `14f10000-0000-4000-8000-0000000000${tail}`,
  occurredAt: '2026-09-07T07:59:00Z',
  actorType: actorUserId ? 'USER' : 'SYSTEM',
  actorUserId,
  branchId: null,
  action,
  entityType: 'USER',
  entityId: null,
  outcome: 'SUCCESS',
  severity: 'INFO',
  reason: null,
});

function page(items: AuditEvent[]): Page<AuditEvent> {
  return {
    items,
    page: { number: 0, size: 5, totalItems: 30, totalPages: 6, hasNext: true, hasPrevious: false },
  };
}

async function show(names = true, timeZone = true) {
  return renderWithProviders(<>{await RecentActivitySection({ names, timeZone })}</>);
}

const card = () => screen.getByRole('region', { name: 'Recent activity' });

beforeEach(() => {
  vi.resetAllMocks();
  reads.getOrganisationTimeZone.mockResolvedValue('Africa/Nairobi');
  reads.resolveUserNames.mockResolvedValue(new Map([[JANE, 'Backend Jane Manager']]));
});

describe('RecentActivitySection', () => {
  it('lists the latest events by action, actor and time, each opening in the audit trail', async () => {
    reads.listRecentActivity.mockResolvedValue(
      page([event('a1', 'user.invite', JANE), event('a2', 'cob.start', null)]),
    );
    await show();

    expect(reads.resolveUserNames).toHaveBeenCalledExactlyOnceWith([JANE]);
    expect(card()).toHaveTextContent('The latest events. Times in Africa/Nairobi.');
    const rows = within(within(card()).getByRole('list', { name: 'Latest events' })).getAllByRole(
      'listitem',
    );
    expect(rows.map((row) => row.textContent)).toEqual([
      'Invited userBackend Jane Manager · 07 Sep 2026 · 10:59',
      'Started close of businessSystem · 07 Sep 2026 · 10:59',
    ]);
    expect(
      within(card()).getByRole('link', { name: 'View event: Invited user, 07 Sep 2026 10:59' }),
    ).toHaveAttribute('href', '/admin/audit?event=14f10000-0000-4000-8000-0000000000a1');
    expect(within(card()).getByRole('link', { name: 'View all activity' })).toHaveAttribute(
      'href',
      '/admin/audit',
    );
  });

  it('names no actor without user.view: a short id, and no name read', async () => {
    reads.listRecentActivity.mockResolvedValue(page([event('a1', 'user.invite', JANE)]));
    await show(false, true);

    expect(reads.resolveUserNames).not.toHaveBeenCalled();
    expect(within(card()).getByRole('listitem')).toHaveTextContent(
      'Invited user14d10000 · 07 Sep 2026 · 10:59',
    );
  });

  it("reads no timezone without tenant.view: the times are UTC's", async () => {
    reads.listRecentActivity.mockResolvedValue(page([event('a1', 'user.invite', JANE)]));
    await show(true, false);

    expect(reads.getOrganisationTimeZone).not.toHaveBeenCalled();
    expect(card()).toHaveTextContent('The latest events. Times in UTC.');
    expect(within(card()).getByRole('listitem')).toHaveTextContent(
      'Invited userBackend Jane Manager · 07 Sep 2026 · 07:59',
    );
  });

  it('never names its link after the audit trail, which the navigation item owns', async () => {
    reads.listRecentActivity.mockResolvedValue(page([event('a1', 'user.invite', JANE)]));
    await show();

    expect(screen.queryByRole('link', { name: /audit trail/i })).toBeNull();
  });

  it('says when nothing has been recorded', async () => {
    reads.listRecentActivity.mockResolvedValue(page([]));
    await show();

    expect(card()).toHaveTextContent('Nothing has been recorded yet.');
    expect(within(card()).queryByRole('list')).toBeNull();
  });

  it('shows a failed read with its reference, and resolves no names', async () => {
    reads.listRecentActivity.mockRejectedValue(new BackendApiError(503, { requestId: REFERENCE }));
    await show();

    expect(within(card()).getByRole('alert')).toHaveTextContent(`Reference: ${REFERENCE}`);
    expect(reads.resolveUserNames).not.toHaveBeenCalled();
  });

  it.each([
    ['a lost session to sign-in', new BackendApiError(401), ';/login?reason=session_expired;'],
    [
      'a stale context to context selection',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      ';/select-context;',
    ],
  ])('sends %s instead of showing a failure', async (_case, error, digest) => {
    reads.listRecentActivity.mockRejectedValue(error);
    await expect(RecentActivitySection({ names: true, timeZone: true })).rejects.toMatchObject({
      digest: expect.stringContaining(digest) as unknown,
    });
  });
});
```

- [ ] **Step 2: Run** — form U on the test: FAIL (the import `./recent-activity-card` doesn't
      resolve).

- [ ] **Step 3: Implement** — create `modules/administration/overview/components/recent-activity-card.tsx`:

```tsx
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { ErrorState } from '@/components/data-display/error-state';
import { SectionCard } from '@/components/data-display/section-card';
import NextLink from '@/components/navigation/next-link';
import { load, type Loaded } from '@/lib/api/load';
import { getOrganisationTimeZone, resolveUserNames } from '@/lib/api/lookups';
import {
  ACTIVITY_HREF,
  ACTIVITY_LABEL,
  ACTIVITY_LINK,
  activityDescription,
  activityRows,
  CARD_TITLES,
  NO_ACTIVITY,
  type ActivityRow,
} from '../overview-rules';
import { listRecentActivity } from '../overview-service';

/** Spec §10.8's Recent activity, a compact list rather than the 900 px audit table (Ruling 6):
 * each event's action opens it in the audit trail's drawer. */
export function RecentActivityCard({
  timeZone,
  activity,
}: {
  timeZone: string;
  activity: Loaded<readonly ActivityRow[]>;
}) {
  return (
    <SectionCard
      title={CARD_TITLES.activity}
      description={activityDescription(timeZone)}
      actions={
        <Link component={NextLink} href={ACTIVITY_HREF} variant="body2" sx={{ fontWeight: 600 }}>
          {ACTIVITY_LINK}
        </Link>
      }
    >
      {!activity.ok ? (
        <ErrorState problem={activity.problem} />
      ) : activity.value.length === 0 ? (
        <Typography sx={{ px: 4, py: 3.5, color: 'text.secondary' }}>{NO_ACTIVITY}</Typography>
      ) : (
        <Box
          component="ul"
          role="list"
          aria-label={ACTIVITY_LABEL}
          sx={{ listStyle: 'none', m: 0, p: 0 }}
        >
          {activity.value.map((row, index) => (
            <Box
              component="li"
              key={row.id}
              sx={{ px: 4, py: 2.5, borderTop: index === 0 ? 0 : 1, borderColor: 'divider' }}
            >
              <Link
                component={NextLink}
                href={row.href}
                aria-label={row.linkLabel}
                variant="body2"
                sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}
              >
                {row.action}
              </Link>
              <Typography
                variant="body2"
                sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}
              >
                {`${row.actor} · ${row.when}`}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </SectionCard>
  );
}

const NO_NAMES: ReadonlyMap<string, string> = new Map();

/** One audit read, settled by `load()`. Each lookup only with its code (rule 5, spec §9): actors are
 * named one read per distinct actor on these rows with `user.view` (BG-09, BG-16), else a short id;
 * times use the organisation's timezone with `tenant.view`, else UTC. */
export async function RecentActivitySection({
  names: readNames,
  timeZone: readTimeZone,
}: {
  names: boolean;
  timeZone: boolean;
}) {
  const [events, timeZone] = await Promise.all([
    load(listRecentActivity()),
    readTimeZone ? getOrganisationTimeZone() : 'UTC',
  ]);
  if (!events.ok) return <RecentActivityCard timeZone={timeZone} activity={events} />;
  const names = readNames
    ? await resolveUserNames(
        events.value.items.flatMap((event) => (event.actorUserId ? [event.actorUserId] : [])),
      )
    : NO_NAMES;
  return (
    <RecentActivityCard
      timeZone={timeZone}
      activity={{ ok: true, value: activityRows(events.value.items, names, timeZone) }}
    />
  );
}
```

- [ ] **Step 4: Run** — form U: PASS (8 tests). Mutation proofs (each must fail the named test; revert after each): rename `ACTIVITY_LINK` (in `overview-rules.ts`) to `'Open the audit trail'` — "never names its link after the audit trail, which the navigation item owns"; show a failed read as an empty list (`activity={{ ok: true, value: [] }}` on the failure branch) — "shows a failed read with its reference, and resolves no names"; resolve names whatever the codes (`const names = true ? … : NO_NAMES`) — "names no actor without user.view: a short id, and no name read"; read the timezone whatever the codes (`getOrganisationTimeZone(),`) — "reads no timezone without tenant.view: the times are UTC's".

- [ ] **Step 5: Commit** (form C):

```text
feat(overview): add the recent activity card

The latest audit events, up to five, as a compact list (Ruling 6): each action opens its event in
the audit trail, then the actor and the time. One audit read, settled by load(); the actors'
names only with user.view (else short ids) and the organisation's timezone only with tenant.view
(else UTC), so the card reads only what its codes allow. "View all activity" leads to the audit
trail without taking the navigation item's name.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

### Task 8: The overview page

**Files:**

- Modify (replace): `app/(authenticated)/admin/page.tsx`
- Modify (replace): `app/(authenticated)/admin/page.test.tsx`

**Interfaces:**

- Consumes: `getCurrentContextProfile` (`auth/context-service.ts`); `PageHeader`;
  `administrationModule`; 4–7's sections and `OverviewCardSkeleton`; 2a's `CARD_TITLES`,
  `NO_OVERVIEW_CARDS`, `noOverviewCards`, `OVERVIEW_DESCRIPTION`, `OVERVIEW_TITLE`,
  `overviewCards`.
- Produces: the page (default export, `metadata` unchanged).

- [ ] **Step 1: Write the failing test** — replace `app/(authenticated)/admin/page.test.tsx` with:

```tsx
import { isValidElement, Suspense, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { SelectedContextProfile } from '@/auth/context-service';
import type { BackendProfile } from '@/auth/context.types';
import type { ApplicationContext } from '@/config/application-context';
import { OverviewCardSkeleton } from '@/modules/administration/overview/components/overview-card-skeleton';
import { renderWithProviders } from '@/test/test-utils';

const { getCurrentContextProfile } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn<() => Promise<SelectedContextProfile>>(),
}));

vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile(),
}));
// The cards read on their own (their tests pin the reads): here each stands in as its props.
vi.mock('@/modules/administration/overview/components/business-date-card', () => ({
  BusinessDateSection: () => <p>Business date card</p>,
}));
vi.mock('@/modules/administration/overview/components/pending-approvals-card', () => ({
  PendingApprovalsSection: (props: Record<string, unknown>) => (
    <p>{`Pending approvals card ${JSON.stringify(props)}`}</p>
  ),
}));
vi.mock('@/modules/administration/overview/components/readiness-card', () => ({
  ReadinessSection: (props: Record<string, unknown>) => (
    <p>{`Readiness card ${JSON.stringify(props)}`}</p>
  ),
}));
vi.mock('@/modules/administration/overview/components/recent-activity-card', () => ({
  RecentActivitySection: (props: Record<string, unknown>) => (
    <p>{`Recent activity card ${JSON.stringify(props)}`}</p>
  ),
}));

const { default: AdminOverviewPage } = await import('./page');

const EVERY_CODE = [
  'business_date.view',
  'user.approve',
  'user.view',
  'branch.activate',
  'branch.view',
  'settings.view',
  'membership.view',
  'audit.view',
  'tenant.view',
];

const PROFILE: BackendProfile = {
  user_id: '14e10000-0000-4000-8000-0000000000aa',
  keycloak_subject: 'kc-admin',
  email: null,
  full_name: null,
  organisation: {
    id: '14e10000-0000-4000-8000-0000000000bb',
    code: 'greenfield',
    name: 'Greenfield SACCO',
    status: 'ACTIVE',
  },
  membership: { id: '14e10000-0000-4000-8000-0000000000cc', status: 'ACTIVE' },
  selected_branch: null,
  branches: [],
  roles: [],
  permissions: [],
};

function resolved(
  permissions: string[],
  branch: ApplicationContext['branch'] = null,
  module: ApplicationContext['module'] = { id: 'administration', name: 'Administration' },
  organisation: BackendProfile['organisation'] = PROFILE.organisation,
) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { ...PROFILE, permissions, organisation },
    context: {
      module,
      organization: { id: '14e10000-0000-4000-8000-0000000000bb', name: 'Greenfield SACCO' },
      branch,
    },
  });
}

async function show() {
  return renderWithProviders(<>{await AdminOverviewPage()}</>);
}

/** Each Suspense boundary's fallback title, in order, walking the element tree the page returns. */
function fallbackTitles(node: ReactNode): string[] {
  if (Array.isArray(node)) return node.flatMap((child: ReactNode) => fallbackTitles(child));
  if (!isValidElement<{ children?: ReactNode; fallback?: ReactNode }>(node)) return [];
  if (node.type === Suspense) {
    const fallback = node.props.fallback;
    return [
      isValidElement<{ title: string }>(fallback) && fallback.type === OverviewCardSkeleton
        ? fallback.props.title
        : 'not a card skeleton',
    ];
  }
  return fallbackTitles(node.props.children);
}

const cards = () =>
  screen.getAllByText(/card/).map((paragraph) => paragraph.textContent.split(' {')[0]);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('AdminOverviewPage', () => {
  it('keeps its one h1 and shows every card, in order, to a holder of every code', async () => {
    resolved(EVERY_CODE);
    await show();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Administration Overview' }),
    ).toBeInTheDocument();
    expect(cards()).toEqual([
      'Business date card',
      'Pending approvals card',
      'Readiness card',
      'Recent activity card',
    ]);
    expect(
      screen.getByText(
        'Pending approvals card {"users":true,"branches":true,"branchSelected":false}',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `Readiness card ${JSON.stringify({ permissions: EVERY_CODE, organisationStatus: 'ACTIVE' })}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Recent activity card {"names":true,"timeZone":true}'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('puts each card behind its own Suspense boundary and skeleton (spec §6.3)', async () => {
    resolved(EVERY_CODE);
    expect(fallbackTitles(await AdminOverviewPage())).toEqual([
      'Business date',
      'Pending approvals',
      'Operational readiness',
      'Recent activity',
    ]);
  });

  it('omits a card the holder could never read or act on (Ruling 2)', async () => {
    resolved(['branch.activate', 'branch.view', 'user.view']);
    await show();

    expect(cards()).toEqual(['Pending approvals card', 'Readiness card']);
    expect(
      screen.getByText(
        'Pending approvals card {"users":false,"branches":true,"branchSelected":false}',
      ),
    ).toBeInTheDocument();
  });

  it("passes the profile's organisation status to the readiness card (Ruling 3)", async () => {
    resolved(EVERY_CODE, null, undefined, {
      id: '14e10000-0000-4000-8000-0000000000bb',
      code: 'greenfield',
      name: 'Greenfield SACCO',
      status: 'SUSPENDED',
    });
    await show();

    expect(
      screen.getByText(
        `Readiness card ${JSON.stringify({ permissions: EVERY_CODE, organisationStatus: 'SUSPENDED' })}`,
      ),
    ).toBeInTheDocument();
  });

  it('tells the approvals card a branch is selected', async () => {
    resolved(EVERY_CODE, { id: '14e10000-0000-4000-8000-0000000000dd', name: 'Head Office' });
    await show();

    expect(
      screen.getByText(
        'Pending approvals card {"users":true,"branches":true,"branchSelected":true}',
      ),
    ).toBeInTheDocument();
  });

  it('tells the activity card which lookups the holder may make (rule 5)', async () => {
    resolved(['audit.view']);
    await show();

    expect(
      screen.getByText('Recent activity card {"names":false,"timeZone":false}'),
    ).toBeInTheDocument();
  });

  it('says once, under the heading, that no card applies to a holder of none of the codes', async () => {
    resolved(['iam.profile.read']);
    await show();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Administration Overview' }),
    ).toBeVisible();
    expect(screen.getByRole('note')).toHaveTextContent(
      'Nothing on this overview is available to your role here; the navigation lists the pages you can open.',
    );
    expect(screen.queryByText(/card/)).toBeNull();
  });

  it('renders the heading alone, reading nothing, in the platform context', async () => {
    resolved(EVERY_CODE, null, { id: 'platform-administration', name: 'Platform Administration' });
    await show();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText(/card/)).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('renders the heading alone for a profile without an organisation', async () => {
    resolved(EVERY_CODE, null, undefined, null);
    await show();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText(/card/)).toBeNull();
  });

  it('renders the heading alone while the context is unresolved', async () => {
    getCurrentContextProfile.mockResolvedValue({
      kind: 'redirect-to-context-selection',
      reason: 'invalid-context',
    });
    await show();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText(/card/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — form U on `app/(authenticated)/admin/page.test.tsx`: FAIL (seven of 10, against the old page: all but the three that expect the heading alone — in the platform context, without an organisation, and while the context is unresolved — which the old page already satisfies).

- [ ] **Step 3: Implement** — replace `app/(authenticated)/admin/page.tsx` with:

```tsx
import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import { getCurrentContextProfile } from '@/auth/context-service';
import { PageHeader } from '@/components/shell/page-header';
import { administrationModule } from '@/modules/administration/administration-module';
import { BusinessDateSection } from '@/modules/administration/overview/components/business-date-card';
import { OverviewCardSkeleton } from '@/modules/administration/overview/components/overview-card-skeleton';
import { PendingApprovalsSection } from '@/modules/administration/overview/components/pending-approvals-card';
import { ReadinessSection } from '@/modules/administration/overview/components/readiness-card';
import { RecentActivitySection } from '@/modules/administration/overview/components/recent-activity-card';
import {
  CARD_TITLES,
  NO_OVERVIEW_CARDS,
  noOverviewCards,
  OVERVIEW_DESCRIPTION,
  OVERVIEW_TITLE,
  overviewCards,
} from '@/modules/administration/overview/overview-rules';

export const metadata: Metadata = { title: 'Overview' };

/** A card behind its own Suspense boundary and skeleton (spec §6.3): a slow or failed read never
 * holds up the heading or another card. */
function card(title: string, content: ReactNode) {
  return <Suspense fallback={<OverviewCardSkeleton title={title} />}>{content}</Suspense>;
}

/**
 * Tenant overview (spec §10.8): Business date, Pending approvals, Operational readiness and Recent
 * activity, each from live reads. Which cards show is decided from the profile before any read
 * (Ruling 2); each card reads, settles and fails on its own. When none applies, one note says so.
 */
export default async function AdminOverviewPage() {
  const selected = await getCurrentContextProfile();
  const header = (
    <PageHeader
      eyebrow={administrationModule.name}
      title={OVERVIEW_TITLE}
      description={OVERVIEW_DESCRIPTION}
    />
  );
  // The authenticated layout sends an unresolved context to context selection. Layouts and pages
  // render in parallel, so `admin/layout.tsx`'s redirect of the platform context doesn't stop this
  // page: like the bell, it reads nothing outside the administration workspace. A tenant context
  // always carries its organisation; without one there is nothing to read.
  if (
    selected.kind !== 'resolved' ||
    selected.context.module.id !== administrationModule.id ||
    !selected.profile.organisation
  ) {
    return header;
  }
  const { permissions, organisation } = selected.profile;
  const cards = overviewCards({ permissions });
  if (noOverviewCards(cards)) {
    return (
      <>
        {header}
        <Alert severity="info" role="note">
          {NO_OVERVIEW_CARDS}
        </Alert>
      </>
    );
  }
  return (
    <>
      {header}
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          alignItems: 'start',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(0, 2fr)' },
        }}
      >
        {cards.businessDate && card(CARD_TITLES.businessDate, <BusinessDateSection />)}
        {cards.approvals &&
          card(
            CARD_TITLES.approvals,
            <PendingApprovalsSection
              users={cards.approvals.users}
              branches={cards.approvals.branches}
              branchSelected={selected.context.branch !== null}
            />,
          )}
        {cards.readiness &&
          card(
            CARD_TITLES.readiness,
            <ReadinessSection permissions={permissions} organisationStatus={organisation.status} />,
          )}
        {cards.activity &&
          card(
            CARD_TITLES.activity,
            <RecentActivitySection
              names={cards.activity.names}
              timeZone={cards.activity.timeZone}
            />,
          )}
      </Box>
    </>
  );
}
```

- [ ] **Step 4: Run** — form U: PASS (10 tests); then form E on the specs that open `/admin`
      with the h1: `e2e/shell.spec.ts`, `e2e/audit.spec.ts`, `e2e/context.spec.ts` and
      `e2e/protected-routes.spec.ts` (about 4 minutes), and `e2e/approvals.spec.ts` with
      `--grep "hides the queue"`: PASS. Mutation proofs (each must fail the named test; revert after each): render the Business date section without its boundary (`{cards.businessDate && <BusinessDateSection />}`) — "puts each card behind its own Suspense boundary and skeleton (spec §6.3)"; pass `branchSelected={false}` — "tells the approvals card a branch is selected"; render Business date whatever the codes — "omits a card the holder could never read or act on (Ruling 2)"; drop the workspace condition from the guard — "renders the heading alone, reading nothing, in the platform context"; never show the note (`if (cards === null)`) — "says once, under the heading, that no card applies to a holder of none of the codes"; pass `names={true}` — "tells the activity card which lookups the holder may make (rule 5)"; hard-code the status (`organisationStatus="ACTIVE"`) — "passes the profile's organisation status to the readiness card (Ruling 3)".

- [ ] **Step 5: Commit** (form C):

```text
feat(overview): show the four cards, each behind its own Suspense boundary

/admin keeps its h1 and gains spec §10.8's cards: Business date, Pending approvals, Operational
readiness and Recent activity. Outside the administration workspace it renders the heading alone
and reads nothing (layouts and pages render in parallel). Which cards show is decided from the
profile before any read (Ruling 2), and when none applies one note says so. Each card streams
behind its own Suspense boundary and skeleton (spec §6.3), so the heading never waits and no card
waits for another. One column below lg, two at 1 : 2 from lg, in the spec's order (Ruling 7).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`, and form E on the five specs above.

**Erratum (ee4910a, `feat(overview): show the four cards, each behind its own Suspense boundary`):** the m5 mutation proof ('never show the note') names `if (cards === null)`, but the page's guard is `if (noOverviewCards(cards))`; making that guard never true fails the named test.

**Erratum (ed2081e, 9614d80):** the four Suspense fallbacks take their card's skeleton props through `card(skeleton, content)` instead of its title alone: the card's static description (`BUSINESS_DATE_DESCRIPTION`, `APPROVALS_DESCRIPTION`, `READINESS_DESCRIPTION`, `ACTIVITY_DESCRIPTION`), its header link's words (`BUSINESS_DATE_LINK`, `APPROVALS_LINK`, `ACTIVITY_LINK`; Readiness has none), a `shape` and a row count. `page.test.tsx` checks each fallback's full props.

### Task 9: The fake API's overview scenarios

Two sub-tasks: **9a** (the three scenarios the cards and the matrix read) and **9b** (the
branch-scoped scenario that reaches a failed read, BG-33). No route changes (`server.mts`
untouched); new arrays and objects only (rule 12).

#### Task 9a: Ready, attention and limited

**Files:**

- Modify: `e2e/fake-api/scenarios.mts` (two edits: the seeds and builders over `BUILDERS`, and
  three entries at its end)
- Create: `e2e/fake-api-overview.spec.ts`

**Interfaces:**

- Consumes: `greenfieldTenant`, `membership`, `branch`, `withoutPermission`, `IDS`, `FakeUser`,
  `FakeMembership`, `FakeBranch`, `RunState` (all in `scenarios.mts`/`state.mts`); `api`,
  `contextFor` (`e2e/support/fake-api.ts`).
- Produces: `OVERVIEW_SCENARIO_IDS`, `OVERVIEW_SCENARIO_TEXT`; the scenarios `overview-ready`
  (`default` plus `user.approve` and `branch.activate` on Jane's role, a newer system audit event,
  and Peter, a second active member), `overview-attention` (the same base with four pending
  members, Baraka's identity provisioning and Nyokabi's 100-character name and unbreakable email,
  three branches pending activation, Malindi's name 100 characters, no locale settings, and the
  business date closed) and `overview-limited` (the attention data without `business_date.view`,
  `audit.view`, `membership.view`, `settings.view` and `user.approve`).

- [ ] **Step 1: Write the failing spec** — create `e2e/fake-api-overview.spec.ts`:

```ts
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import {
  IDS,
  OVERVIEW_SCENARIO_IDS as OVERVIEW,
  OVERVIEW_SCENARIO_TEXT as TEXT,
  seedScenario,
  type ScenarioName,
} from './fake-api/scenarios.mts';
import { api, contextFor } from './support/fake-api';

interface Paged<T> {
  items: T[];
  page: { total_items: number };
}

const read = async <T>(response: APIResponse): Promise<T> => (await response.json()) as T;

/** A fresh run of `scenario` at institution level, reading through the fake's routes. */
async function signIn(request: APIRequestContext, scenario: ScenarioName) {
  const headers = await contextFor(request, scenario, null);
  return (path: string) => request.get(api(path), { headers });
}

const total = async (response: APIResponse) =>
  (await read<Paged<unknown>>(response)).page.total_items;

test.describe('fake API: the overview scenarios (layer 14)', () => {
  test('overview-attention: four pending members newest first, one of them provisioning', async ({
    request,
  }) => {
    const get = await signIn(request, 'overview-attention');
    const pending = await read<Paged<{ id: string; user_status: string; email: string }>>(
      await get('/tenant/users?membership_status=PENDING_APPROVAL&page=0&size=5'),
    );
    expect(pending.items.map((row) => row.id)).toEqual([
      OVERVIEW.wanjiku,
      OVERVIEW.baraka,
      OVERVIEW.nyokabi,
      OVERVIEW.halima,
    ]);
    expect(pending.items[1]?.user_status).toBe('PROVISIONING_IDP');
    expect(pending.items[2]?.email).toBe(TEXT.longEmail);
    expect(
      await total(
        await get(
          '/tenant/users?membership_status=PENDING_APPROVAL&user_status=PROVISIONING_IDP&page=0&size=1',
        ),
      ),
    ).toBe(1);
  });

  test('overview-attention: three branches waiting, newest first, beside two active ones', async ({
    request,
  }) => {
    const get = await signIn(request, 'overview-attention');
    const waiting = await read<Paged<{ id: string; branch_name: string }>>(
      await get('/branches?status=PENDING_APPROVAL&sort_by=createdAt&sort_dir=DESC&page=0&size=5'),
    );
    expect(waiting.items.map((row) => row.id)).toEqual([
      OVERVIEW.malindi,
      OVERVIEW.nyeri,
      OVERVIEW.kakamega,
    ]);
    expect(waiting.items[0]?.branch_name).toHaveLength(100);
    expect(
      await total(await get('/branches?status=ACTIVE&sort_by=createdAt&sort_dir=DESC&size=1')),
    ).toBe(2);
  });

  test('overview-attention: one active member, no locale settings, the date closed', async ({
    request,
  }) => {
    const get = await signIn(request, 'overview-attention');
    expect(await total(await get('/tenant/memberships?membership_status=ACTIVE&size=1'))).toBe(1);
    const settings = await read<Paged<{ key: string; value: string | null }>>(
      await get('/tenant/settings?size=100'),
    );
    expect(
      settings.items
        .filter((row) => row.key === 'default_timezone' || row.key === 'base_currency')
        .map((row) => row.value),
    ).toEqual([null, null]);
    expect(await read<{ status: string }>(await get('/tenant/business-date'))).toMatchObject({
      current_business_date: '07-09-2026',
      status: 'CLOSED',
    });
    const events = await read<Paged<{ id: string; actor_id: string | null }>>(
      await get('/tenant/audit-events?page=0&size=5'),
    );
    expect(events.items[0]).toMatchObject({ id: OVERVIEW.welcomeEvent, actor_id: null });
  });

  test('overview-ready: two active members, and nothing waits', async ({ request }) => {
    const get = await signIn(request, 'overview-ready');
    expect(await total(await get('/tenant/memberships?membership_status=ACTIVE&size=1'))).toBe(2);
    expect(await total(await get('/tenant/users?membership_status=PENDING_APPROVAL&size=1'))).toBe(
      0,
    );
    expect(await total(await get('/branches?status=PENDING_APPROVAL&size=1'))).toBe(0);
    expect(await read<{ status: string }>(await get('/tenant/business-date'))).toMatchObject({
      status: 'OPEN',
    });
  });

  test('overview-limited: the attention data without five codes, refusing those reads', async ({
    request,
  }) => {
    const codes = (scenario: ScenarioName) =>
      seedScenario(scenario).roles.find((role) => role.id === IDS.tenantAdminRole)?.permissions ??
      [];
    expect(codes('overview-attention')).toEqual(
      expect.arrayContaining(['user.approve', 'branch.activate', 'audit.view']),
    );
    expect(codes('default')).not.toContain('user.approve');
    expect(codes('default')).not.toContain('branch.activate');
    const limited = codes('overview-limited');
    for (const code of [
      'business_date.view',
      'audit.view',
      'membership.view',
      'settings.view',
      'user.approve',
    ]) {
      expect(limited).not.toContain(code);
    }
    expect(limited).toEqual(
      expect.arrayContaining(['branch.activate', 'branch.view', 'user.view']),
    );
    const get = await signIn(request, 'overview-limited');
    expect((await get('/tenant/business-date')).status()).toBe(403);
    expect((await get('/tenant/memberships?membership_status=ACTIVE&size=1')).status()).toBe(403);
  });
});
```

- [ ] **Step 2: Run** — form E on `e2e/fake-api-overview.spec.ts`: FAIL (all five: the scenarios don't exist yet, so the fake answers each sign-in with an empty 401 and `contextFor` fails with "SyntaxError: Unexpected end of JSON input").

- [ ] **Step 3: Implement** — in `e2e/fake-api/scenarios.mts` (the first edit puts the seeds and
      builders after layer 11's `usersInviteScenario`, over the comment above `BUILDERS`; the
      second adds the three entries last in `BUILDERS`):

Replace

```ts
// `satisfies` (not a `: Record<...>` annotation) keeps the literal key set so `ScenarioName` below
```

with

```ts
/** Layer 14 seed IDs (lane rules §5): users …a*, memberships …b*, branches …c*, the audit event
 * …f1. Every tail holds a letter, so an upper-cased id differs from the seed. */
export const OVERVIEW_SCENARIO_IDS = {
  halima: '14000000-0000-4000-8000-0000000000a1',
  nyokabi: '14000000-0000-4000-8000-0000000000a2',
  baraka: '14000000-0000-4000-8000-0000000000a3',
  wanjiku: '14000000-0000-4000-8000-0000000000a4',
  peter: '14000000-0000-4000-8000-0000000000a5',
  halimaMembership: '14000000-0000-4000-8000-0000000000b1',
  nyokabiMembership: '14000000-0000-4000-8000-0000000000b2',
  barakaMembership: '14000000-0000-4000-8000-0000000000b3',
  wanjikuMembership: '14000000-0000-4000-8000-0000000000b4',
  peterMembership: '14000000-0000-4000-8000-0000000000b5',
  kakamega: '14000000-0000-4000-8000-0000000000c1',
  nyeri: '14000000-0000-4000-8000-0000000000c2',
  malindi: '14000000-0000-4000-8000-0000000000c3',
  welcomeEvent: '14000000-0000-4000-8000-0000000000f1',
} as const;

/** The overflow seeds: a 100-character name (contract §D maximum), an unbreakable 78-character
 * email, and a 100-character branch name. */
export const OVERVIEW_SCENARIO_TEXT = {
  longName:
    'Nyokabi Wairimu Kamau-Achieng Muthoni Njeri Cheru Jepkoech Nyambura Akinyi Atieno Wanjiru Mwangi Ayo',
  longEmail: 'nyokabi.wairimu.kamau.achieng.muthoni.njeri.chebet@greenfieldsaccotell.example',
  longBranch:
    'Malindi, Watamu and Kilifi Creek Coastal Customer Service Centres for the Fishers and Allied Workers',
} as const;

/** `default` with both decision codes on Jane's role, and a system event newer than every seed, so
 * the activity card's first row reads "System". */
function overviewBase(): RunState {
  const state = greenfieldTenant();
  return {
    ...state,
    roles: state.roles.map((candidate) =>
      candidate.id === IDS.tenantAdminRole
        ? {
            ...candidate,
            permissions: [...candidate.permissions, 'user.approve', 'branch.activate'],
          }
        : candidate,
    ),
    auditEvents: [
      ...state.auditEvents,
      {
        id: OVERVIEW_SCENARIO_IDS.welcomeEvent,
        organisationId: IDS.greenfield,
        occurredAt: '2026-09-08T06:00:00Z',
        actorUserId: null,
        actorType: 'SYSTEM',
        branchId: null,
        entityType: 'USER',
        entityId: IDS.jane,
        action: 'user.welcome_email',
        outcome: 'SUCCESS',
        severity: 'INFO',
        reason: null,
        beforeJson: null,
        afterJson: null,
        metadataJson: '{}',
      },
    ],
  };
}

/** Layer 14, `overview-ready`: Peter is the second active member, so every readiness item is met
 * (settings set, two active branches and none pending, the date open) and nothing waits. */
function overviewReadyScenario(): RunState {
  const state = overviewBase();
  const ids = OVERVIEW_SCENARIO_IDS;
  return {
    ...state,
    users: [
      ...state.users,
      {
        id: ids.peter,
        username: 'peter.mwangi',
        email: 'peter.mwangi@greenfield.example',
        displayName: 'Peter Mwangi',
        status: 'ACTIVE',
        keycloakSubject: 'e2e-peter.mwangi',
      },
    ],
    memberships: [
      ...state.memberships,
      { ...membership(ids.peterMembership, IDS.greenfield, ids.peter), type: 'STAFF' },
    ],
  };
}

/**
 * Layer 14, `overview-attention`: every readiness item needs attention. Four memberships wait
 * (newest first: Wanjiku, Baraka, whose identity is provisioning, Nyokabi, with the long name and
 * email, then Halima), three branches wait for activation (newest first: Malindi, with the long
 * name, Nyeri, then Kakamega past the five-row preview), Jane is the only active member, neither
 * catalogue key is set, and the business date is closed.
 */
function overviewAttentionScenario(): RunState {
  const state = overviewBase();
  const ids = OVERVIEW_SCENARIO_IDS;
  const person = (
    id: string,
    username: string,
    displayName: string,
    status: string,
    email = `${username}@greenfield.example`,
  ): FakeUser => ({ id, username, email, displayName, status, keycloakSubject: `e2e-${username}` });
  const pending = (id: string, userId: string): FakeMembership => ({
    ...membership(id, IDS.greenfield, userId),
    type: 'STAFF',
    status: 'PENDING_APPROVAL',
  });
  const submitted = (id: string, code: string, name: string, createdAt: string): FakeBranch => ({
    ...branch(id, IDS.greenfield, code, name, 'OPERATIONS'),
    status: 'PENDING_APPROVAL',
    parentBranchId: IDS.headOffice,
    createdAt,
    updatedAt: createdAt,
  });
  return {
    ...state,
    // The fake lists users newest first as reverse seed order.
    users: [
      ...state.users,
      person(ids.halima, 'halima.odhiambo', 'Halima Odhiambo', 'DRAFT'),
      person(
        ids.nyokabi,
        'nyokabi.long',
        OVERVIEW_SCENARIO_TEXT.longName,
        'DRAFT',
        OVERVIEW_SCENARIO_TEXT.longEmail,
      ),
      person(ids.baraka, 'baraka.otieno', 'Baraka Otieno', 'PROVISIONING_IDP'),
      person(ids.wanjiku, 'wanjiku.kariuki', 'Wanjiku Kariuki', 'DRAFT'),
    ],
    memberships: [
      ...state.memberships,
      pending(ids.halimaMembership, ids.halima),
      pending(ids.nyokabiMembership, ids.nyokabi),
      pending(ids.barakaMembership, ids.baraka),
      pending(ids.wanjikuMembership, ids.wanjiku),
    ],
    branches: [
      ...state.branches,
      submitted(ids.kakamega, 'KAKAMEGA', 'Kakamega Branch', '2026-09-14T08:00:00Z'),
      submitted(ids.nyeri, 'NYERI', 'Nyeri Branch', '2026-09-15T08:00:00Z'),
      submitted(ids.malindi, 'MALINDI', OVERVIEW_SCENARIO_TEXT.longBranch, '2026-09-16T08:00:00Z'),
    ],
    tenantSettings: state.tenantSettings.filter(
      (row) => row.key !== 'default_timezone' && row.key !== 'base_currency',
    ),
    businessDates: state.businessDates.map((row) => ({ ...row, status: 'CLOSED' as const })),
  };
}

// `satisfies` (not a `: Record<...>` annotation) keeps the literal key set so `ScenarioName` below
```

Then replace

```ts
} satisfies Record<string, () => RunState>;
```

with

```text
  // Layer 14 (overview). `overview-limited` is the attention data without the business date, audit,
  // membership and settings reads and without user.approve: two cards are omitted, the approvals card
  // lists branches only, and three readiness items can't be checked.
  'overview-ready': overviewReadyScenario,
  'overview-attention': overviewAttentionScenario,
  'overview-limited': () =>
    withoutPermission(
      overviewAttentionScenario(),
      'business_date.view',
      'audit.view',
      'membership.view',
      'settings.view',
      'user.approve',
    ),
} satisfies Record<string, () => RunState>;
```

Run form P on `e2e/fake-api/scenarios.mts`.

- [ ] **Step 4: Run** — form E on `e2e/fake-api-overview.spec.ts`: PASS (5 tests). Then prove the
      35 existing scenarios serialise identically (rule 12). Write this script **outside the
      repository** (in the scratch directory the controller's brief names, as
      `<scratch>/serialise-check.mts`), copy the layer's base scenarios beside it (always
      `e6f7e7e`, the commit the layer starts from, never `HEAD`, which moves with each commit), and
      run it from the repository root:

```ts
// Seeds every scenario of the base tree and of the working tree, comparing them (Maps as entries).
const [baseFile, newFile] = process.argv.slice(2);
const base = await import(baseFile);
const next = await import(newFile);
const json = (state: unknown) =>
  JSON.stringify(state, (_key, value) => (value instanceof Map ? [...value.entries()] : value));
const names = base.SCENARIOS as string[];
let same = 0;
for (const name of names) {
  if (json(base.seedScenario(name)) === json(next.seedScenario(name))) same += 1;
  else console.log(`DIFFERS: ${name}`);
}
const added = (next.SCENARIOS as string[]).filter((name) => !names.includes(name));
console.log(
  `${same}/${names.length} existing scenarios serialise identically; new: ${added.join(', ')}`,
);
```

```bash
git show e6f7e7e:e2e/fake-api/scenarios.mts > <scratch>/base-scenarios.mts
node <scratch>/serialise-check.mts <scratch>/base-scenarios.mts "$PWD/e2e/fake-api/scenarios.mts"
```

Expected: `35/35 existing scenarios serialise identically; new: overview-ready, overview-attention,
overview-limited`. Mutation proofs (revert after each): append `'user.approve'` to the
module-level `TENANT_ADMIN_PERMISSIONS` array instead of mapping Jane's role in `overviewBase`:
the script must report `DIFFERS: default` and every scenario built on it (29 lines, then `6/35 existing scenarios serialise identically; …`); drop `'user.approve'` from `overview-limited`'s
`withoutPermission` list: form E must fail "overview-limited: the attention data without five
codes, refusing those reads".

- [ ] **Step 5: Commit** (form C):

```text
test(fake-api): seed the overview scenarios

overview-ready is default with both decision codes on Jane's role, a newer system audit event and
a second active member, so every readiness item is met and nothing waits. overview-attention has
four pending members (one provisioning, one with the 100-character name and an unbreakable
email), three branches pending activation, no locale settings and the business date closed.
overview-limited is the attention data without five read and decision codes. No route changes;
the 35 existing scenarios serialise identically.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check` and form E on the fake spec.

**Erratum (77ed202, `test(fake-api): seed the overview scenarios`):** the expected RED output of Step 2 is not what the fifth test shows: it fails inside its `codes()` helper (the scenario is unknown), before reaching the assertion the step names. The test is genuine; it passes once the scenarios exist.

#### Task 9b: A branch read refused (BG-33)

**Files:**

- Modify: `e2e/fake-api/scenarios.mts` (four edits: the seed comment, two ids, the builder, its
  `BUILDERS` entry)
- Modify: `e2e/fake-api-overview.spec.ts` (one test, last)

**Interfaces:**

- Consumes: 9a; `role`, `tenantRoleAssignment` (`scenarios.mts`).
- Produces: `OVERVIEW_SCENARIO_IDS.branchReviewerRole` and `.branchReviewerGrant`; the scenario
  `overview-branch-scoped`: the attention data with Jane's `branch.view` and `branch.activate`
  moved from her tenant role to a new `BRANCH_REVIEWER` role granted at Head Office only. With Head
  Office selected `/auth/me` lists both codes, and both branch reads answer 403 (they check tenant
  scope): Ruling 8's failed read, with no route change.

- [ ] **Step 1: Extend the spec** — in `e2e/fake-api-overview.spec.ts`:

Replace

```text
  });
});
```

with

```text
  });

  test('overview-branch-scoped: branch codes held at Head Office only, so the branch reads are refused', async ({
    request,
  }) => {
    const headers = await contextFor(request, 'overview-branch-scoped', IDS.headOffice);
    const get = (path: string) => request.get(api(path), { headers });
    const me = await read<{ permissions: string[] }>(await get('/auth/me'));
    expect(me.permissions).toEqual(expect.arrayContaining(['branch.view', 'branch.activate']));
    expect((await get('/branches?status=ACTIVE&size=1')).status()).toBe(403);
    expect(
      (
        await get('/branches?status=PENDING_APPROVAL&sort_by=createdAt&sort_dir=DESC&page=0&size=5')
      ).status(),
    ).toBe(403);
    expect(
      (await get('/tenant/users?membership_status=PENDING_APPROVAL&page=0&size=5')).status(),
    ).toBe(200);
  });
});
```

- [ ] **Step 2: Run** — form E on `e2e/fake-api-overview.spec.ts` with
      `--grep "overview-branch-scoped"`: FAIL (the new test: `overview-branch-scoped` doesn't exist yet, so the fake answers the sign-in with an empty 401 and `contextFor` fails with "SyntaxError: Unexpected end of JSON input").

- [ ] **Step 3: Implement** — in `e2e/fake-api/scenarios.mts`:

Replace

```ts
/** Layer 14 seed IDs (lane rules §5): users …a*, memberships …b*, branches …c*, the audit event
 * …f1. Every tail holds a letter, so an upper-cased id differs from the seed. */
```

with

```ts
/** Layer 14 seed IDs (lane rules §5): users …a*, memberships …b*, branches …c*, the branch
 * reviewer role …d1 and its grant …e1, the audit event …f1. Every tail holds a letter, so an
 * upper-cased id differs from the seed. */
```

Then replace

```text
  welcomeEvent: '14000000-0000-4000-8000-0000000000f1',
```

with

```text
  branchReviewerRole: '14000000-0000-4000-8000-0000000000d1',
  branchReviewerGrant: '14000000-0000-4000-8000-0000000000e1',
  welcomeEvent: '14000000-0000-4000-8000-0000000000f1',
```

Then replace

```ts
// `satisfies` (not a `: Record<...>` annotation) keeps the literal key set so `ScenarioName` below
```

with

```ts
/**
 * Layer 14, `overview-branch-scoped` (BG-33): the attention data, with Jane's branch codes on a
 * BRANCH grant at Head Office instead of her tenant role. With Head Office selected, `/auth/me`
 * lists `branch.view` and `branch.activate`, but the branch reads need them at tenant scope, so
 * each answers 403: the Branches item and the approvals card's branch read fail on their own.
 */
function overviewBranchScopedScenario(): RunState {
  const state = withoutPermission(overviewAttentionScenario(), 'branch.view', 'branch.activate');
  const ids = OVERVIEW_SCENARIO_IDS;
  return {
    ...state,
    roles: [
      ...state.roles,
      {
        ...role(ids.branchReviewerRole, IDS.greenfield, 'BRANCH_REVIEWER', 'Branch reviewer', [
          'branch.view',
          'branch.activate',
        ]),
        systemRole: false,
      },
    ],
    roleAssignments: [
      ...state.roleAssignments,
      {
        ...tenantRoleAssignment(
          ids.branchReviewerGrant,
          IDS.greenfield,
          IDS.jane,
          ids.branchReviewerRole,
        ),
        scopeType: 'BRANCH',
        branchId: IDS.headOffice,
      },
    ],
  };
}

// `satisfies` (not a `: Record<...>` annotation) keeps the literal key set so `ScenarioName` below
```

Then replace

```ts
} satisfies Record<string, () => RunState>;
```

with

```text
  'overview-branch-scoped': overviewBranchScopedScenario,
} satisfies Record<string, () => RunState>;
```

Run form P on `e2e/fake-api/scenarios.mts`.

- [ ] **Step 4: Run** — form E on `e2e/fake-api-overview.spec.ts`: PASS (6 tests). Then 9a's
      script again, against the same base (`e6f7e7e`, not `HEAD`, which is now 9a's commit):

```bash
git show e6f7e7e:e2e/fake-api/scenarios.mts > <scratch>/base-scenarios.mts
node <scratch>/serialise-check.mts <scratch>/base-scenarios.mts "$PWD/e2e/fake-api/scenarios.mts"
```

It must print:

```text
35/35 existing scenarios serialise identically; new: overview-ready, overview-attention, overview-limited, overview-branch-scoped
```

Mutation proof (revert after it): grant the branch reviewer role at tenant scope
(`scopeType: 'TENANT'`, `branchId: null` in `overviewBranchScopedScenario`): form E must fail
"overview-branch-scoped: branch codes held at Head Office only, so the branch reads are refused".

- [ ] **Step 5: Commit** (form C):

```text
test(fake-api): seed a branch-scoped overview scenario

overview-branch-scoped is the attention data with Jane's branch.view and branch.activate on a
branch reviewer role granted at Head Office only. With Head Office selected /auth/me lists both
codes while the branch reads, which check tenant scope, answer 403: the overview's failed-read
state (BG-33) with no route change. The 35 existing scenarios still serialise identically.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check` and form E on the fake spec.

### Task 10: End to end and the accessibility matrix

Two sub-tasks: **10a** (the behaviour, one `describe`) and **10b** (the accessibility matrix,
another). Every chunk runs in well under 8 minutes: on CI's browser, each run starting its own dev
server, the planner measured about 5 s for the fake spec (six tests), 29 to 31 s for the behaviour chunk (six), 42 to 45 s for each accessibility chunk (eight), and 3.3 to 3.5 minutes for the four specs that open `/admin` (45 tests).

#### Task 10a: The behaviour

**Files:**

- Create: `e2e/overview.spec.ts`

**Interfaces:**

- Consumes: `authenticate`, `expectHydrated`, `selectMuiOption` (`e2e/support/auth.ts`);
  `OVERVIEW_SCENARIO_IDS`, `OVERVIEW_SCENARIO_TEXT` (Task 9).
- Produces: the spec, with `enterOverview` (the context picker waited for with `FIRST_HIT`, then
  All branches or a given branch), `settled`, `card`, `item`, `bell`, `expectRequests`,
  `expectItems` (each chip by its exact words) and `expectLinks`, which 10b reuses.

- [ ] **Step 1: Write the spec** — create `e2e/overview.spec.ts`:

```ts
import { expect, test, type Locator, type Page } from '@playwright/test';
import { authenticate, expectHydrated, selectMuiOption } from './support/auth';
import {
  OVERVIEW_SCENARIO_IDS as OVERVIEW,
  OVERVIEW_SCENARIO_TEXT as TEXT,
} from './fake-api/scenarios.mts';

const ALL_BRANCHES = /All branches \(institution level\)/;
const HEAD_OFFICE = /Head Office/;

/** A route's first hit compiles under a cold `next dev`, which takes tens of seconds (layer 11's
 * lesson): every first visit here (the overview, a request page, the audit trail) is bounded by it.
 * Warm, these waits resolve in well under a second. */
const FIRST_HIT = 45000;

// The app's copy, repeated here: Playwright can't resolve the app's `@/` imports. Each string is
// asserted verbatim, so a reworded message fails here (rule 10).
const NOT_PERMITTED = "Can't be checked with your permissions.";
const NOTHING_WAITING = 'Nothing is waiting for your approval.';
const PROVISIONING = '1 identity is still being provisioned: approval already ran.';
const ONE_MEMBER =
  'Only 1 member is active. Approvals need at least two, so someone other than the requester can decide (maker-checker).';
const NOT_SET = "Not set: default timezone and base currency. Settings can't be saved yet.";

/** The overview through context selection (All branches unless told), once every card has
 * streamed in. `/admin` and `/select-context` are first hits: the picker waits for them. */
async function enterOverview(page: Page, branch: RegExp = ALL_BRANCHES) {
  await page.goto('/admin');
  await expect(page.getByRole('combobox', { name: 'Organisation' })).toBeVisible({
    timeout: FIRST_HIT,
  });
  await selectMuiOption(page, 'Organisation', /Greenfield/);
  await selectMuiOption(page, 'Branch', branch);
  await settled(page);
}

/** The heading, then no card skeleton left: each card streams behind its own Suspense boundary,
 * and a skeleton's body is `aria-busy` until its card arrives. */
async function settled(page: Page) {
  await expect(page).toHaveURL((url) => url.pathname === '/admin', { timeout: FIRST_HIT });
  await expect(
    page.getByRole('heading', { level: 1, name: 'Administration Overview' }),
  ).toBeVisible({ timeout: FIRST_HIT });
  await expect(page.getByRole('main').locator('[aria-busy="true"]')).toHaveCount(0, {
    timeout: FIRST_HIT,
  });
}

const card = (page: Page, name: string) =>
  page.getByRole('main').getByRole('region', { name, exact: true });

/** A readiness item: the list item under its h3. */
const item = (page: Page, label: string) =>
  card(page, 'Operational readiness')
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { level: 3, name: label, exact: true }) });

/** The bell streams in the header behind its own boundary: wait for it before a scan. */
async function bell(page: Page, label: string) {
  await expect(
    page.getByRole('banner').getByRole('button', { name: label, exact: true }),
  ).toBeVisible({ timeout: FIRST_HIT });
}

/** The Review links of the preview, in order, each by its exact name. */
async function expectRequests(approvals: Locator, names: readonly string[]) {
  const rows = approvals
    .getByRole('list', { name: 'Requests waiting for a decision', exact: true })
    .getByRole('listitem');
  await expect(rows).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(
      rows.nth(index).getByRole('link', { name: `Review ${name}`, exact: true }),
    ).toBeVisible();
  }
}

/** Each item's detail, and its chip by its exact words (a detail can hold the chip's words). */
async function expectItems(page: Page, state: string, items: readonly [string, string][]) {
  for (const [label, detail] of items) {
    await expect(item(page, label)).toContainText(detail);
    await expect(item(page, label).getByText(state, { exact: true })).toBeVisible();
  }
}

/** Each item's link by its exact name, or none: `null` where the holder can't open the page. */
async function expectLinks(page: Page, links: readonly [string, string | null, string?][]) {
  for (const [label, name, href] of links) {
    const found = item(page, label).getByRole('link');
    if (name === null) {
      await expect(found).toHaveCount(0);
    } else {
      await expect(found).toHaveAccessibleName(name);
      await expect(found).toHaveAttribute('href', href ?? '');
    }
  }
}

test.describe('overview: the cards', () => {
  test.describe.configure({ timeout: 90000 });

  test('shows every card ready, with nothing waiting', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'overview-ready');
    await enterOverview(page);

    await expect(page.getByRole('main').getByRole('region')).toHaveCount(4);
    const date = card(page, 'Business date');
    await expect(date).toContainText('Monday, 7 September 2026');
    await expect(date.getByText('Open', { exact: true })).toBeVisible();
    await expect(
      date.getByRole('link', { name: 'Open business date', exact: true }),
    ).toHaveAttribute('href', '/admin/business-date');

    const approvals = card(page, 'Pending approvals');
    await expect(approvals).toContainText(NOTHING_WAITING);
    await expect(
      approvals.getByRole('link', { name: 'Open the approval queue', exact: true }),
    ).toHaveAttribute('href', '/admin/approvals');

    const bar = card(page, 'Operational readiness').getByRole('progressbar', {
      name: 'Operational readiness',
    });
    await expect(bar).toHaveAttribute('aria-valuenow', '100');
    await expect(bar).toHaveAttribute('aria-valuetext', '5 of 5 ready');
    await expectItems(page, 'Ready', [
      ['Institution profile', 'Active, with a default timezone and a base currency.'],
      ['Branches', '2 branches are active, and none is waiting for activation.'],
      ['People', '2 members are active.'],
      ['Onboarding', 'No one is waiting for approval.'],
      ['Business date', 'Open for Mon, 7 Sep 2026.'],
    ]);
    await expectLinks(page, [
      ['Institution profile', 'Open settings', '/admin/settings'],
      ['Branches', 'Open branches', '/admin/branches'],
      ['People', 'Open users & access', '/admin/users'],
      ['Onboarding', 'Open user onboarding', '/admin/approvals/users'],
      ['Business date', 'Open business date', '/admin/business-date'],
    ]);

    const activity = card(page, 'Recent activity');
    await expect(activity).toContainText('The latest events. Times in Africa/Nairobi.');
    const events = activity
      .getByRole('list', { name: 'Latest events', exact: true })
      .getByRole('listitem');
    await expect(events).toHaveCount(5);
    await expect(events.first()).toHaveText('Sent welcome emailSystem · 08 Sep 2026 · 09:00');
    await expect(events.nth(1)).toHaveText(
      'Invited userBackend Jane Manager · 07 Sep 2026 · 10:59',
    );
    await expect(
      activity.getByRole('link', { name: 'View all activity', exact: true }),
    ).toHaveAttribute('href', '/admin/audit');
  });

  test('names what needs attention, users first, then branches', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'overview-attention');
    await enterOverview(page);
    await bell(page, 'Notifications: 6 approvals waiting');

    const date = card(page, 'Business date');
    await expect(date).toContainText('Monday, 7 September 2026');
    await expect(date.getByText('Closed', { exact: true })).toBeVisible();

    const approvals = card(page, 'Pending approvals');
    await expect(approvals).toContainText('3 users are waiting for approval.');
    await expect(
      approvals.getByRole('link', { name: 'Review user onboarding', exact: true }),
    ).toHaveAttribute('href', '/admin/approvals/users');
    await expect(approvals).toContainText('3 branches are waiting for activation.');
    await expect(
      approvals.getByRole('link', { name: 'Review branch activation', exact: true }),
    ).toHaveAttribute('href', '/admin/approvals/branches');
    await expectRequests(approvals, [
      'Wanjiku Kariuki',
      TEXT.longName,
      'Halima Odhiambo',
      TEXT.longBranch,
      'Nyeri Branch',
    ]);
    await expect(
      approvals.getByRole('link', { name: 'Review Halima Odhiambo', exact: true }),
    ).toHaveAttribute('href', `/admin/approvals/users/${OVERVIEW.halima}`);
    await expect(
      approvals.getByRole('link', { name: 'Review Nyeri Branch', exact: true }),
    ).toHaveAttribute('href', `/admin/approvals/branches/${OVERVIEW.nyeri}`);
    await expect(approvals.getByRole('note')).toHaveText(PROVISIONING);

    const bar = card(page, 'Operational readiness').getByRole('progressbar', {
      name: 'Operational readiness',
    });
    await expect(bar).toHaveAttribute('aria-valuenow', '0');
    await expect(bar).toHaveAttribute('aria-valuetext', '0 of 5 ready');
    await expectItems(page, 'Needs attention', [
      ['Institution profile', NOT_SET],
      ['Branches', '2 branches are active. 3 branches are waiting for activation.'],
      ['People', ONE_MEMBER],
      ['Onboarding', `3 users are waiting for approval. ${PROVISIONING}`],
      ['Business date', 'Closed for Mon, 7 Sep 2026.'],
    ]);
  });

  test("omits what the holder can't read, and says what it can't check", async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'overview-limited');
    await enterOverview(page);
    await bell(page, 'Notifications: 3 approvals waiting');

    await expect(page.getByRole('main').getByRole('region')).toHaveCount(2);
    await expect(card(page, 'Business date')).toHaveCount(0);
    await expect(card(page, 'Recent activity')).toHaveCount(0);

    const approvals = card(page, 'Pending approvals');
    await expect(approvals).toContainText('3 branches are waiting for activation.');
    await expect(
      approvals.getByRole('link', { name: 'Review user onboarding', exact: true }),
    ).toHaveCount(0);
    await expectRequests(approvals, [TEXT.longBranch, 'Nyeri Branch', 'Kakamega Branch']);
    await expect(approvals.getByRole('note')).toHaveCount(0);

    await expect(
      card(page, 'Operational readiness').getByRole('progressbar', {
        name: 'Operational readiness',
      }),
    ).toHaveAttribute('aria-valuetext', '0 of 5 ready · 3 not checked');
    await expectItems(page, "Can't be checked", [
      ['Institution profile', NOT_PERMITTED],
      ['People', NOT_PERMITTED],
      ['Business date', NOT_PERMITTED],
    ]);
    await expectItems(page, 'Needs attention', [
      ['Onboarding', `3 users are waiting for approval. ${PROVISIONING}`],
    ]);
    await expectLinks(page, [
      ['Institution profile', null],
      ['Branches', 'Open branches', '/admin/branches'],
      ['People', 'Open users & access', '/admin/users'],
      ['Onboarding', null],
      ['Business date', null],
    ]);
  });

  test('marks a refused branch read on its own item and card, keeping the rest (BG-33)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'overview-branch-scoped');
    await enterOverview(page, HEAD_OFFICE);
    await bell(page, "Notifications (couldn't be loaded)");

    await expect(page.getByRole('main').getByRole('region')).toHaveCount(4);
    await expectItems(page, "Couldn't be checked", [
      ['Branches', "Couldn't be loaded. Reference: "],
    ]);
    await expect(
      card(page, 'Operational readiness').getByRole('progressbar', {
        name: 'Operational readiness',
      }),
    ).toHaveAttribute('aria-valuetext', '0 of 5 ready · 1 not checked');
    await expectItems(page, 'Needs attention', [
      ['Institution profile', NOT_SET],
      ['People', ONE_MEMBER],
      ['Onboarding', `3 users are waiting for approval. ${PROVISIONING}`],
    ]);

    const approvals = card(page, 'Pending approvals');
    await expect(approvals.getByRole('alert')).toContainText(
      "Branches waiting for activation couldn't be loaded.",
    );
    await expect(approvals).not.toContainText(NOTHING_WAITING);
    await expectRequests(approvals, ['Wanjiku Kariuki', TEXT.longName, 'Halima Odhiambo']);

    await expect(card(page, 'Business date').getByText('Closed', { exact: true })).toBeVisible();
    await expect(
      card(page, 'Recent activity')
        .getByRole('list', { name: 'Latest events', exact: true })
        .getByRole('listitem'),
    ).toHaveCount(5);
  });

  test('opens a request from its Review link', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'overview-attention');
    await enterOverview(page);

    const review = card(page, 'Pending approvals').getByRole('link', {
      name: 'Review Halima Odhiambo',
      exact: true,
    });
    await expectHydrated(review);
    await review.click();
    await expect(page).toHaveURL(
      (url) => url.pathname === `/admin/approvals/users/${OVERVIEW.halima}`,
      { timeout: FIRST_HIT },
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Halima Odhiambo' })).toBeVisible({
      timeout: FIRST_HIT,
    });
  });

  test('opens an event from the activity', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'overview-attention');
    await enterOverview(page);

    const event = card(page, 'Recent activity').getByRole('link', {
      name: 'View event: Sent welcome email, 08 Sep 2026 09:00',
      exact: true,
    });
    await expectHydrated(event);
    await event.click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === '/admin/audit' && url.searchParams.get('event') === OVERVIEW.welcomeEvent,
      { timeout: FIRST_HIT },
    );
    await expect(page.getByRole('dialog', { name: 'Sent welcome email' })).toBeVisible({
      timeout: FIRST_HIT,
    });
  });
});
```

- [ ] **Step 2: Run** — form E with `--grep "overview: the cards"`: PASS (6 tests). Mutation
      proofs (revert after each): drop the provisioning filter in `pendingApprovalsView`
      (`.filter((user) => user.userStatus !== 'ACTIVE')`) — "names what needs attention, users
      first, then branches" must fail; rename `ACTIVITY_LINK` to `'Open the audit trail'` — form E
      on `e2e/audit.spec.ts` with `--grep "shows the rail link"` must fail (a strict-mode
      violation: two links match "Audit trail", rule 9); mark a failed Branches read as not
      permitted (`if (!active.ok) return item('branches', 'unknown', NOT_PERMITTED);` in
      `branchesItem`) — "marks a refused branch read on its own item and card, keeping the rest
      (BG-33)" must fail; word the not-permitted chip "Needs attention" in `READINESS_STATES` —
      "omits what the holder can't read, and says what it can't check" must fail (the chip is
      asserted by its exact words, not found inside the detail); gate the People link on
      `membership.view` in `READINESS_LINKS` — the same test must fail (no "Open users & access"
      link).

- [ ] **Step 3: Commit** (form C):

```text
test(e2e): cover the administration overview end to end

Every card ready with each item's link (overview-ready), everything needing attention with the
requests in order and the provisioning note (overview-attention), the cards, items and links a
narrower role can't read (overview-limited), a refused branch read at Head Office failing its
item and its card alone (overview-branch-scoped, BG-33), and a Review link and an activity row
opening their pages. Each first visit waits for its route's first compile, the context picker's
included, and the overview counts as settled once no card skeleton is busy.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check` and form E on the behaviour chunk.

**Erratum (53b5046, `test(e2e): cover the administration overview end to end`):** the brief's first mutation proof names `.filter((user) => user.userStatus !== 'ACTIVE')`, which is not in the code: `pendingApprovalsView` drops identities still provisioning with `.filter((user) => user.userStatus !== 'PROVISIONING_IDP')`, and removing that filter fails the named test.

**Erratum (ed2081e, 9614d80):** the gate's visual pass added a pin for the readiness chips (see Task 5's erratum): one generated test per scenario in this chunk, titled `keeps each readiness chip beside its heading at 1280 and 375 px: <scenario>`, so `--grep "overview: the cards"` runs 8 tests, not 6.

#### Task 10b: The accessibility matrix

**Files:**

- Modify: `e2e/overview.spec.ts` (one import edit; an append)

- [ ] **Step 1: Extend the spec** — in `e2e/overview.spec.ts`:

Replace

```ts
import { authenticate, expectHydrated, selectMuiOption } from './support/auth';
```

with

```ts
import {
  A11Y_CASES,
  applyA11yCase,
  expectA11yCaseApplied,
  expectNoSeriousOrCriticalViolations,
} from './support/admin';
import { authenticate, expectHydrated, selectMuiOption } from './support/auth';
```

Then append, after a blank line at the end of the file:

```ts
const SURFACES = [
  {
    label: 'every card ready',
    scenario: 'overview-ready',
    branch: ALL_BRANCHES,
    bell: 'Notifications: nothing waiting',
    regions: 4,
  },
  {
    label: 'needs attention',
    scenario: 'overview-attention',
    branch: ALL_BRANCHES,
    bell: 'Notifications: 6 approvals waiting',
    regions: 4,
  },
  {
    label: 'limited permissions',
    scenario: 'overview-limited',
    branch: ALL_BRANCHES,
    bell: 'Notifications: 3 approvals waiting',
    regions: 2,
  },
  {
    label: 'a refused branch read',
    scenario: 'overview-branch-scoped',
    branch: HEAD_OFFICE,
    bell: "Notifications (couldn't be loaded)",
    regions: 4,
  },
] as const;

test.describe('overview: accessibility', () => {
  test.describe.configure({ timeout: 60000 });

  for (const surface of SURFACES) {
    for (const a11yCase of A11Y_CASES) {
      test(`has no serious or critical violations: ${surface.label} (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
        context,
        page,
      }, testInfo) => {
        await applyA11yCase(page, a11yCase);
        await authenticate(context, testInfo, surface.scenario);
        await enterOverview(page, surface.branch);
        // The header streams too: every scan and the 375 px page-width check include the bell.
        await bell(page, surface.bell);
        await expectA11yCaseApplied(page, a11yCase);
        await expect(page.getByRole('main').getByRole('region')).toHaveCount(surface.regions);
        await expectNoSeriousOrCriticalViolations(page);
      });
    }
  }
});
```

- [ ] **Step 2: Run** — form E twice: `--grep "overview: accessibility.*\(light"` and
      `--grep "overview: accessibility.*\(dark"`: PASS (eight each). Then the behaviour chunk
      again: PASS. Mutation proof (revert after it): drop the bar's `aria-label` in
      `readiness-card.tsx` — every matrix test must fail (axe's `aria-progressbar-name`, serious).

- [ ] **Step 3: Commit** (form C):

```text
test(e2e): add the overview's accessibility matrix

Four surfaces in light and dark at 1280 and 375 px: every card ready, everything needing
attention (the 100-character names and the unbreakable email at 375 px), a role that sees two
cards, and a refused branch read at Head Office (an error chip, an alert and the bell's
couldn't-be-loaded state). Each scan waits for every card and for the bell, counts the page's
regions and checks that 375 px doesn't scroll sideways.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check` and form E on both accessibility chunks.

### Task 11: The docs

**Files:**

- Modify: `README.md` (four edits), `AGENTS.md` (one), `docs/backend-gaps.md` (seven)

Each edit replaces whole lines, matched exactly once in the file as it stands on `e6f7e7e`; if an
anchor doesn't match exactly once, stop and report it (never edit nearby text instead).

- [ ] **Edit 1** (`README.md`, the overview page in the app tree): replace the lines

```text
│   │   ├── layout.tsx           # Redirects a platform context to /platform-admin
```

with

```text
│   │   ├── layout.tsx           # Redirects a platform context to /platform-admin
│   │   ├── page.tsx             # Overview: business date, pending approvals, operational readiness
│   │   │                          # and recent activity, each card in its own Suspense boundary
```

- [ ] **Edit 2** (`README.md`, the overview module in the module tree): replace the lines

```text
│                                # control checks, bell arithmetic, service, guards, decision
│                                # actions and components (modules/administration/approvals/)
```

with

```text
│                                # control checks, bell arithmetic, service, guards, decision
│                                # actions and components (modules/administration/approvals/);
│                                # overview/ holds the overview's readiness rules, card rules, reads
│                                # and cards (modules/administration/overview/)
```

- [ ] **Edit 3** (`README.md`, the Overview feature and its limits): replace the lines

```text
- Administration ships the Overview, Approval queue, Users & access, Branches, Roles & permissions,
  Settings, Business date, and Audit trail pages.
```

with

```text
- Administration ships the Overview, Approval queue, Users & access, Branches, Roles & permissions,
  Settings, Business date, and Audit trail pages.
- The Overview (`/admin`, `modules/administration/overview/`) shows four cards, each reading on its
  own behind its own Suspense boundary and each only to a holder who can read or decide it:
  Business date (the date and its status), Pending approvals (the bell's counts with a link to each
  tab, then up to five requests, users before branches, each newest first with Review), Operational
  readiness (five items, each Ready, Needs attention, Can't be checked or Couldn't be checked, each
  linking to the page where it is dealt with when the holder can open that page, under one teal
  bar for the share ready) and Recent activity (the latest audit events, up to five, each opening
  in the audit trail). A failed read shows in its own card, with its reference; when no card
  applies, one note under the heading says so. Known limits:
  - Readiness is five fixed rules over live reads (spec §10.8), not a close-of-business check
    (`docs/backend-gaps.md` BG-21); its counts are `size=1` reads (BG-15).
  - Institution profile reads the stored `default_timezone` and `base_currency` settings: a tenant
    created without them shows Needs attention and says settings can't be saved yet (BG-04).
  - People needs two active members, so someone other than the requester can approve (BG-02).
  - Identities still provisioning are noted apart and never listed as waiting (BG-11): the users
    preview reads past them (one read of at most 100), so it lists up to five requests waiting for
    a decision, and the queue holds the rest.
```

- [ ] **Edit 4** (`README.md`, the last "not connected yet" item goes (nothing is left unconnected)): replace the lines

```text
- Beyond context discovery/selection, profile retrieval, Platform Administration's institutions,
  overview, institution branches and users, and platform users, and Administration's Approval
  queue, Users & access (with the Invite user wizard), Branches, Roles & permissions and Settings
  above, the Administration overview's operational sections (layer 14) are not connected yet.
```

with nothing (delete them).

- [ ] **Edit 5** (`AGENTS.md`, the ninth named paging exception (Ruling 10)): replace the lines

```text
  unbounded list (plan `docs/superpowers/plans/2026-10-12-admin-parity-11-invite-wizard.md`,
  Ruling 10).
```

with

```text
  unbounded list (plan `docs/superpowers/plans/2026-10-12-admin-parity-11-invite-wizard.md`,
  Ruling 10).
  The administration overview's Pending approvals and Recent activity cards
  (`modules/administration/overview`: at most five requests, users then branches, beside the
  bell's counts, from one bounded users read of at most 100 that reads past identities still
  provisioning (BG-11) and one five-row branch read; and the five latest audit events; each card
  links to its paginated list, and the counts come from `totalItems`, with no scan) are a ninth,
  named exception: bounded previews, not data-listing directories — no licence for an unbounded
  list (plan `docs/superpowers/plans/2026-10-18-admin-parity-14-overview.md`, Ruling 10).
```

- [ ] **Edit 6** (`docs/backend-gaps.md`, BG-02): replace the lines

```text
- **Frontend handling:** approve controls are disabled for the maker with an explanation; the overview
  readiness item "People" flags tenants with fewer than two active members.
```

with

```text
- **Frontend handling:** approve controls are disabled for the maker with an explanation; the overview
  readiness item "People" flags tenants with fewer than two active members (layer 14).
```

- [ ] **Edit 7** (`docs/backend-gaps.md`, BG-04): replace the lines

```text
  currency card. Reset to default (`DELETE`, 204) works. Flip the flag when this closes.
```

with

```text
  currency card. Reset to default (`DELETE`, 204) works. Flip the flag when this closes. The
  overview's Institution profile item reads the stored keys, so a tenant created without them (layer
  16's wizard sends them only when entered) shows Needs attention, saying settings can't be saved
  yet, until then (layer 14).
```

- [ ] **Edit 8** (`docs/backend-gaps.md`, BG-11): replace the lines

```text
  identity" shown as a distinct state with guidance; no resend or expiry.
```

with

```text
  identity" shown as a distinct state with guidance; no resend or expiry. The overview notes
  identities still provisioning apart from the approvals waiting, and its users preview reads past
  them (five plus their count, at most 100), so it still lists the requests waiting (layer 14).
```

- [ ] **Edit 9** (`docs/backend-gaps.md`, BG-15): replace the lines

```text
  platform overview reads five counts the same way (`size=1`, or the total of a five-row preview)
  (layer 17).
```

with

```text
  platform overview reads five counts the same way (`size=1`, or the total of a five-row preview)
  (layer 17). The administration overview counts active branches and active memberships the same
  way, and takes the approvals waiting from the bell's reads and its previews' totals (layer 14).
```

- [ ] **Edit 10** (`docs/backend-gaps.md`, BG-22): replace the lines

```text
for activation (one), for holders of the matching codes (layer 12). Suggested: a
notifications/inbox endpoint.
```

with

```text
for activation (one), for holders of the matching codes (layer 12). The administration overview's
Pending approvals card shows the same counts: the users' from the bell's reads, shared per request,
the branches' from its preview's total (layer 14). Suggested: a notifications/inbox endpoint.
```

- [ ] **Edit 11** (`docs/backend-gaps.md`, BG-21): replace the lines

```text
jobs, posting window) have no API; close-of-business is optional and unchecked. Suggested: a
readiness endpoint returning named checks and their status.
```

with

```text
jobs, posting window) have no API; close-of-business is optional and unchecked. The administration
overview's Operational readiness is not one: five fixed rules over live reads (spec §10.8, layer
14). Suggested: a readiness endpoint returning named checks and their status.
```

- [ ] **Edit 12** (`docs/backend-gaps.md`, BG-33): replace the lines

```text
as a branch-scoped `user.assign_branch` that doesn't cover an invited branch, is named `INVITE_REFUSED`.
Suggested: return each permission with its scope (tenant or the branch ids) on `/auth/me`.
```

with

```text
as a branch-scoped `user.assign_branch` that doesn't cover an invited branch, is named `INVITE_REFUSED`.
The administration overview marks such a refused read on its own: the Branches readiness item shows
Couldn't be checked and the Pending approvals card says the branches couldn't be loaded, each with
its reference, while the other cards stay (layer 14).
Suggested: return each permission with its scope (tenant or the branch ids) on `/auth/me`.
```

- [ ] **Run** — `pnpm exec prettier --check README.md AGENTS.md docs/backend-gaps.md`: clean.

- [ ] **Commit** (form C):

```text
docs(overview): describe the administration overview

README: the overview page and module in the trees, the four cards, the readiness links, the
no-cards note and their known limits (BG-02, BG-04, BG-11, BG-15, BG-21), and the last "not
connected yet" item removed: every planned page reads the platform API. AGENTS.md: the ninth named
paging exception, the overview's bounded previews (one users read of at most 100). Backend gaps:
the overview's handling of BG-02, BG-04, BG-11, BG-15, BG-21, BG-22 and BG-33.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

## Layer gate (the controller's; not a task)

1. **Static and unit:** `pnpm check` (format, lint, `tsc`, the full Vitest run),
   `pnpm test:coverage` (CI's own step, with its 80/75/80/80 thresholds) and `pnpm build` on the
   layer's last commit; all clean (`/admin` in the route table, dynamic). `git status` clean.
2. **E2E:** the full Playwright suite on CI's browser (L7): the controller's CI-browser wrapper,
   a copy of the layer-11 gate's with its two paths pointed at this layer's worktree, with
   `--retries=0`, in chunks of at most 8 minutes. Every spec, not only 14's: every spec that opens
   `/admin` now renders the cards (shell, context, audit, approvals, protected routes). Check
   ports 3100 and 3199 in `/proc/net/tcp` before each chunk and stop a leftover server by its pid
   (L8). All green; a second run needs no retries.
3. **Visual and keyboard pass** (a person or the controller with a real browser), separately at
   **1440 px** and **375 px**, light and dark:
   - `overview-ready`: the four cards, the full teal bar (visible against its track in both
     schemes), five Ready chips;
   - `overview-attention`: the 100-character name and the unbreakable email wrapping inside the
     Pending approvals rows at 375 px, the 100-character branch, the provisioning note, the
     Closed chip, the empty bar, five Needs attention chips; with Head Office selected, the
     branch count's "Switch to All branches to activate them.";
   - `overview-limited`: two cards, three Can't be checked items, only the Branches and People
     links;
   - `overview-branch-scoped` at Head Office: the Branches item Couldn't be checked and the
     approvals card's branch alert, each with its reference, the other cards intact;
   - `default` and `long-names`: the cards the shell specs now scan (no Pending approvals; People
     needs attention), the long actor name wrapping at 375 px;
   - the skeletons: throttle the network in the browser's tools and reload: each card shows its
     title and pulsing lines (still with `prefers-reduced-motion`), and the heading shows first;
   - a failed card other than the branch reads: point one read at a 500 in a local, uncommitted
     edit of the fake API (for example the audit route), and see that card alone show its
     reference (`overview-branch-scoped` covers the branch reads automatically);
   - keyboard only: Tab reaches each card's link, each readiness item's link, each Review link
     (named "Review <name>" by a screen reader) and each event link in reading order, with the
     focus ring visible; nothing else on the page takes focus;
   - a platform context: `/admin` redirects to `/platform-admin` with no tenant read in the dev
     server's log.
4. **Extra axe scans** (beyond 10b's matrix, which includes the failed branch reads) on the
   skeleton state, light and dark: no serious or critical violation.
5. **Docs:** README, AGENTS.md and `docs/backend-gaps.md` match what shipped; the plan's ruling
   table records the user's answers.
6. **Squash** the layer's commits into one on `admin-parity/14-overview` with a summary message and
   the two trailers; open the PR against `main`.

## Controller live check (against the real backend; not a task)

**Reads only.** The overview mutates nothing, so nothing here needs an approval beyond signing in.
Only a person signs in; the controller never enters credentials. Never advance the dev business
date, and approve, activate or change nothing from the pages the overview links to.

1. **The page:** sign in as a tenant administrator holding every code in the wire table, at All
   branches. Each card arrives; compare it with its source: Business date with the header chip and
   `/admin/business-date`; the approvals counts with the bell and the queue's tab labels (and the
   five rows with the tabs' first rows); each readiness item with Settings, Branches, Users &
   access and Business date, and each item's link to that page; the activity rows with the audit
   trail's first five.
2. **Institution profile (Ruling 1, the BLOCKING question's live risk):** read `default_timezone`
   and `base_currency` on Settings. If they are unset on dev, the item reads "Not set: … Settings
   can't be saved yet." and nothing in the app can set them (BG-04): report it to the maintainer
   with the tenant's creation path (layer 16's wizard sends them only when entered).
3. **The assumptions** (`questions.md`): 1, `/auth/me`'s `organisation.status` (the network panel's
   profile read); 2, the ACTIVE membership count against the Users & access directory filtered by
   membership status Active; 3, the two keys' `null` when unset; 4 and 5, the order of the users
   and the audit events.
4. **Reads per load (spec §6.3):** with the network panel (server-side reads in the dev server's
   log, or the platform's request log), count the reads one full load of `/admin` makes against
   Ruling 11 (13 to 17 for a holder of every code), and confirm the business date and the bell's
   counts are each read once, and the users preview's size is five plus the provisioning count.
5. **A narrower role, if dev has one** (for example without `audit.view` or `membership.view`): the
   omitted cards and the Can't be checked items match Ruling 2. **Not run:** anything that writes.

## Self-review

- **Spec coverage.** §10.8: the Business date card (Task 4); Pending approvals with up to five
  rows, users first, each newest first, Review actions, the queue link and the provisioning note
  (2b, 6); Operational readiness's five items by the spec's table, each linking to its page (1a,
  1b, 5); Recent activity's latest events with `audit.view` (2c, 7). §6.3: each card's own
  `load()` and Suspense boundary with a skeleton (4, 8), and the reads counted (Ruling 11). §7.3:
  the teal bar through `LinearProgress`'s own colour (5). §9: `SectionCard`, `StatusChip`,
  `ErrorState`; `ActivityList` as a compact list in the module (Ruling 6); the timezone and the
  actors' names read only with their codes. D11 (Ruling 1). The handoff's tests: the scenarios
  `overview-ready` and `overview-attention` it named, plus `overview-limited` (9a) and
  `overview-branch-scoped` (9b); each readiness rule complete, incomplete and unknown (1a, 1b);
  card ordering, users first, newest first, the five-row cap (2b); a card's failure not blocking
  the others (each card's failure test, the page's one boundary per card, 8, and the branch-scoped
  e2e test and matrix surface, 10a, 10b); partial permissions, the links to the queue, the audit
  trail and each readiness item's page, and the axe matrix (10a, 10b).
- **The reviews and the answers.** Every Important and Minor finding of both adversarial reviews is
  applied. Round 1: the workspace guard with its page test and mutation proof (Ruling 2); the
  single-kind-failure guard on `empty` with a rules test, a card test and two mutation proofs; the
  users preview sized past provisioning identities (Ruling 5); the `overview-branch-scoped`
  scenario with its fake check, behaviour test and matrix surface (Ruling 8); the handoff's empty
  copy recorded as a deviation; the grid's two consequences (Ruling 7); the whole-page read count
  (Ruling 11); the activity lookups gated on their codes; the two missing read-gate tests; chips
  asserted by their exact words; first hits bounded in `enterOverview` and the long test split;
  Task 8's e2e run widened; 2a split (now 2a, 2b, 2c); the Onboarding text taken from
  `approvalNotifications`; the organisation's status a `string`; the copy fixes; BG-22 and BG-33
  in the docs; the no-cards note; the empty sentence before the provisioning note. Round 2: the
  rule numbers in five code comments; `BUSINESS_DATE_LINK` taken from the readiness link's label;
  the README's and BG-22's count sentences; a page test (and mutation proof) for the organisation
  status's wiring; 9b's serialise base pinned to `e6f7e7e`; 10b's commit body; Task 6's last
  mutation proof given as code. Observations applied: "N not checked", `ACTIVITY_HREF` from
  `auditTrailHref({})`, `READINESS_ITEM_IDS` and `readFailed` unexported (round 1);
  `overflowWrap: 'anywhere'` on the approvals card's failure alerts, the measured chunk times, and
  the maintainer-approved changes in the deviation lists (round 2). Left as they are, each
  harmless: `activityRows` keeps its own actor label (the audit table's `toAuditRows` builds full
  table rows, and the overview needs two strings); the event link's name keeps the audit table's
  order ("View event: <action>, <date> <time>"), so both say the same; the approvals card's branch
  count is its preview's `totalItems` while the bell's and Readiness's is
  `countBranchActivations()`, read in the same request, so they can differ only by a race; a
  refused branch read shows as "Couldn't be checked" where the users directory shows its
  access-denied state (Q8's answer; one wording per cause is a later decision); the no-cards note
  isn't axe-scanned (no scenario renders it; it is the `Alert role="note"` pattern four scanned
  pages ship); "Open business date" on both the card and the item, and "Review user onboarding" and
  "Open user onboarding" for one tab (both fine under WCAG 2.4.4); the BG-04 test hard-codes
  "Settings can't be saved yet." (a deliberate signal when `SETTINGS_EDIT_ENABLED` flips); 2b's
  size helpers stay in 2b (moving them to 2a would still leave 2b over 400 lines).
- **Handoff deviations (each with its evidence in the pre-flight notes):** the organisation's
  status from `/auth/me` instead of `GET /tenant` (Ruling 3); one bar per card rather than per item
  (Ruling 4); a compact activity list in the module rather than `AuditEventTable` or a kit
  `ActivityList` (Ruling 6); 12's arithmetic instead of 10's onboarding helpers; the empty
  approvals copy is the bell's "Nothing is waiting for your approval." rather than "Nothing
  awaiting approval" (Ruling 5); the h1 list gains `e2e/approvals.spec.ts`; the scenarios build on
  `default`, not on 12's `approvals`, so their counts are the overview's own. Approved by the
  maintainer: the users read sized past provisioning identities (the handoff's `size=5`); the bell's
  `size=1` pair as the user count (the handoff: the preview's `total_items`); the per-item links;
  the no-cards note.
- **L1.** `overview-service.ts` rejects; every read is settled by `load()` in its card; a failed
  read is never absence, zero or "Ready" (Review Focus 1), and the branch-scoped scenario shows it
  end to end; the previews are bounded and the card says what it counts. **L2.** Nothing is
  mutated. **L3.** `next/headers` mocked wherever `load()` runs, `next/navigation` real (redirect
  digests pinned in every card), `vi.resetAllMocks()`, lettered ids distinct in their first block,
  a page test for the route, e2e hydration before each click, exact names inside each card's
  region, one scenario per test, chunkable `describe` titles with their own timeouts. **L4.** The
  copy says what the reads proved ("Can't be checked with your permissions.", "Couldn't be loaded.
  Reference: …", "Requests waiting for a decision, newest first.", "The latest events.", the
  bell's own words). **L5.** Sixteen sub-tasks along natural seams; the briefs run from
  105 to 466 lines (over 400: 2b 466, 5 408, 6 446 and 9a 417, each a single unit with its test and no seam left to split), almost all complete code; each ends on a clean tree with one commit; docs
  in 11; prettier settled; no model names or scratch paths in code, docs or commits; the trailers
  exact. **L6.** No dotted `color`; no function prop crosses to a client component; no new
  `'use client'` file. **L7.** Every e2e run below used CI's browser (`chrome-headless-shell` 156,
  `CI=true`) with `--retries=0`; the 375 px cases wrap in every browser (the unbreakable email and
  the 100-character names). **L8.** Ports 3100 and 3199 were checked in `/proc/net/tcp` before
  each run; no process was killed by pattern.
- **Placeholders.** None: every code block is a complete file, an exact append, or an exact
  replacement with its anchor.
- **Executability (what was run).** The plan was checked four times, and nothing from an earlier pass was reused unseen. First, every file was written and tested in a throwaway worktree of `22a1d89`, then moved to `e6f7e7e` (`pnpm install --frozen-lockfile` again) with the pre-flight re-verified. Then, after each of the two reviews and the maintainer's answers, the files were revised and the plan rebuilt, and the plan itself was replayed on `e6f7e7e`: a script reset the worktree to a clean tree and applied every block of this file, task by task in the dependency table's order, from the plan's own text as formatted by the repository's Prettier (102 fenced blocks; each code block is byte-identical to the file it was checked as, and the final tree equals the frozen files). For every task: its unit tests before the implementation (**RED** as each Step 2 says: 1a, 2a and 3–7 an unresolved import; 1b 21 of 39; 2b 17 of 22; 2c 2 of 24; 8 seven of 10), after it (**GREEN**: 18, 39, 5, 22, 24, 4, 5, 11, 12, 8 and 10 tests; 113 in the module and the page), `prettier --check` and ESLint (`--max-warnings=0`) on the task's files, and `tsc --noEmit` on the whole tree: all clean. On the last replayed tree: `pnpm check` (format, lint, `tsc`, the full Vitest run: 237 files, 2,545 tests) passed and `pnpm build` exited 0 with `/admin` dynamic; `pnpm test:coverage` passed on the tree before the second review's fixes (all files 96.22 / 93.77 / 95.46 / 96.35; the overview module 100 % of lines and functions, 98 % of branches), which add one test and change no branch. Task 9's script, against `e6f7e7e`, reported 35/35 with three new scenarios after 9a and four after 9b, and its mutant 6/35. Every unit mutation proof the plan names (48, Tasks 1a–8) was applied one at a time and reverted: each failed its named test. Playwright ran on CI's browser through a copy of the layer-11 gate's wrapper pointed at the worktree (`chrome-headless-shell` 156, `CI=true`, `--retries=0`, one worker, no listener on ports 3100 and 3199 before a run): 9a's spec red (five) and 9b's new test red (one), as their Step 2s say; then green: the fake spec (6), 10a's behaviour (6), 10b's light (8) and dark (8) chunks, `e2e/approvals.spec.ts` "hides the queue and the bell …", and `e2e/shell.spec.ts`, `e2e/audit.spec.ts`, `e2e/context.spec.ts` and `e2e/protected-routes.spec.ts` in full (45 tests); every e2e mutation proof of Tasks 9a, 9b, 10a (five) and 10b failed as named (10b's eight on axe's `aria-progressbar-name`, serious; 10a's audit one on a strict-mode violation). The green runs were repeated on the final tree after the last copy change (the no-cards note's words, which no e2e scenario renders), and the fake spec and all three overview chunks once more after the second review's fixes (a comment in the spec, and `overflowWrap` on the approvals card's alerts): all green.
- **Not run:** the full Playwright suite (the layer gate's), the manual visual and keyboard pass,
  the extra axe scan of the skeleton, and anything against the real backend (the controller's
  live check).
