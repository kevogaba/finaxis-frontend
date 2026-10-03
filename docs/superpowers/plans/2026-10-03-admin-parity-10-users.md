# PR 10: Users & access — directory and record — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [plan index](./2026-09-25-admin-parity-00-index.md),
> the layer-10 section of the [handoff](./2026-10-02-admin-parity-handoff.md), and the
> [09 roles plan](./2026-10-01-admin-parity-09-roles.md) first: 10 copies 09's record pattern and
> consumes 09's role-assignment pieces and 08's branch-assignment pieces.

**Goal:** Ship `/admin/users` (spec §10.5):

- a searchable, filterable directory (search, user status, membership status; newest first, no sort);
- the user record `/admin/users/[userId]`, with the membership lifecycle in its hero (Approve,
  Reject & revoke, Suspend, Reactivate, Revoke) and four tabs:
  - **Overview:** identity, membership facts, the onboarding timeline, role and branch counts;
  - **Roles & access:** the user's ACTIVE role assignments, assign (TENANT or BRANCH scope) and revoke;
  - **Branch assignments:** the user's ACTIVE branch assignments from a bounded scan (marked partial),
    assign and revoke;
  - **Audit:** four views (User record, Account, Membership, Performed by);
- the `/admin/audit` actor picker (user search → `actorId`).

It also produces what later layers consume: `user-contract.ts` (17 reuses the summary schema),
`user-rules.ts` (`onboardingState`, `availableMembershipActions`; 12 reuses both), `user-service.ts`
(`findUserMembership`, `listUserBranchAssignments`, `getUserInviter`; 12 reuses all three) and
`membership-actions.ts` (`approveMembership`, `revokeMembership`; 12's decision bar reuses both).

**Architecture:**

- Server Components read through `modules/administration/users/user-service.ts`, which parses with the
  zod snake_case schemas in `user-contract.ts`; pages settle reads with `load()`. Pure rules live in
  the client-safe `user-rules.ts`. This mirrors 09's roles module file for file.
- The record is a nested-route layout (`app/(authenticated)/admin/users/[userId]/layout.tsx`): it
  validates the id **before any read**, reads the user once (a `cache()`d `getUser`), resolves the
  membership (`GET /tenant/memberships?q=<email>` matched on `user_id`, BG-09) only with
  `membership.view`, and renders `RecordHero` + `RecordTabs`. Each tab validates the id again
  (`notFound()`) and fetches its own data.
- Mutations are Server Actions on `runServerAction`: the four membership transitions are new
  (`membership-actions.ts`); role and branch assignment reuse 09's `assignRole`/`revokeRoleAssignment`
  and 08's `assignBranchUser`/`revokeBranchAssignment`. Every dialog and drawer forwards the form's
  minted idempotency key and `contextOrganisationId`.
- Dialogs: `ConfirmDialog` for Approve (the activate endpoint reads no body); `ReasonDialog` for
  Reject & revoke, Suspend, Revoke (reason 3–500) and Reactivate (optional). Assignment uses 08's
  `AssignmentDrawer`.
- One additive kit change: `ListToolbar` gains a `children` slot so `AuditFilters` can host the actor
  picker (one announced `refactor(kit):` commit).

**Tech Stack:** Next.js 16.3 (nested layouts, Server Actions, `notFound`, `redirect`), React 19.3
(`useActionState`, `cache`), MUI 9.4 (`Avatar`, `Table`, `Alert`, `ToggleButtonGroup` through the kit,
`Drawer` through `AssignmentDrawer`), zod 4.6, Vitest + RTL, Playwright + axe. No new packages.

**Spec:** [`…-design.md`](../specs/2026-09-25-admin-prototype-parity-design.md):

- §10.5 (users and access: directory, onboarding table, record tabs, hero actions, omissions);
- §10.1 (record Audit views, the actor filter by user search);
- §6.2 (wire, D8), §6.3 (lookups, ceilings), §6.4 (mutations), §6.5 (branch context), §6.6
  (permissions, read-back `.view`), §6.7 (errors), §6.8 (route ids validated);
- §8 (navigation: Users & access sits after Overview, gated by `user.view`), §9 (list and record
  patterns, assignment drawer).

Contract (`…-api-contract.md`): §A (q is a substring with `%`/`_` wildcards; enums; idempotency),
§B, §C (`UserInTenantSummary`, `MembershipSummary`, `MembershipDetail`, `BranchAssignmentSummary`,
`RoleAssignmentSummary`), §D (`SuspendMembership`, `RevokeMembership`, `ReactivateMembership`,
`AssignRole`, `AssignBranch`), §E.3 (the users, memberships, branch-assignment and role-assignment
rows), §E.4, §F (user and membership states, onboarding), §G (a user's history spans several queries;
the `user.invite` maker lookup), §I. Gaps: BG-02, BG-03, BG-07, BG-08, BG-09, BG-11, BG-15, BG-16,
BG-17, BG-28, BG-31, BG-33, and a new BG-35 (Task 11).

**Base:** `claude/friendly-albattani-9frko4` at `09b5da9` (the dotted-colour guard covers
Box/Stack/Grid/DialogContentText); layers 08, 09, 13, 15 and 16 are in. The controller keeps the
ledger at `.superpowers/sdd/2026-10-03-admin-parity-10-users/progress.md`. The **Pre-flight notes**,
**Layer gate**, **Controller live check** and **Self-review** sections are not tasks.

## Global Constraints

Sources: **A** = `AGENTS.md`; **H3.n** = handoff §3 standing rule n; **L09-Rn** / **L16-Rn** = the 09 /
16 SDD ledger rulings; **C** = the controller's rulings for this layer. Every task's requirements
include this section.

**Command forms.** Every command runs from `/home/user/finaxis-frontend` with Node 24:

```bash
export S=/tmp/claude-0/-home-user-finaxis-frontend/9b8e6e97-684d-531d-bf9a-4bb3d8175dbb/scratchpad
export PATH=$S/node-v24.19.0-linux-x64/bin:$PATH
# U — focused unit tests (foreground)
pnpm exec vitest run <test files>
# P — prettier on .mts files (lint-staged skips them; the hook's format:check doesn't)
pnpm exec prettier --write <.mts paths>
# E — E2E only through the wrapper, in the foreground, chunks of at most 8 minutes (--grep)
bash $S/e2e/run-e2e.sh <spec files> [--grep <pattern>]
# C — commit: write the message to $S/commit-msgs/<name>.txt first; stage whole files only.
#     The husky hook (lint-staged + the full pnpm check) is the check. Never --no-verify.
set -a; . $S/ci.env; set +a
git add <whole files>
git commit -F $S/commit-msgs/<name>.txt
```

If `tsc` reports TS2307 for a route after a branch switch, run `rm -rf .next/types .next/dev/types`
with no `next` process running (handoff §9). The gates (`pnpm check`, `pnpm build`, the full E2E)
belong to the layer gate, never to a task.

**Binding rules** (one line each; the source in brackets):

1. Run `pnpm check` after any implementation change and the affected E2E specs (form E) when rendered
   UI changes; no task is done until both are clean. [A]
2. No `@ts-ignore`, `@ts-nocheck`, unsafe `any`, or rule disables; fix the cause. [A]
3. MUI + Tailwind (layout only) is the whole stack; no new packages; `package.json` and
   `pnpm-lock.yaml` don't change. [A, index]
4. Colours come from theme tokens; no hex/rgba in components. Muted text is
   `sx={{ color: 'text.secondary' }}`, **never** `color="text.secondary"`: MUI v9 drops a dotted
   `color` on Typography, Box, Stack, Grid and DialogContentText (`TruncatedText` takes
   `color="textSecondary"`). The ESLint guard in `eslint.config.mjs` enforces it. [A, L16-R24, L16-R38, C]
5. Server Components by default; `'use client'` only for interaction; no function prop (no `sx`
   callback, no `component={Link}`) from a Server to a Client Component (use
   `@/components/navigation/next-link`); no pre-built element into an MUI prop gated by
   `isValidElement`/`cloneElement` (Chip `icon`/`avatar`/`deleteIcon`). [A, H3.3]
6. Every Server Action runs through `runServerAction`, forwards the idempotency key the form minted
   when it opened (never a new one per request) and the cross-tab guard field `contextOrganisationId`
   from the page's resolved context. Fan-out writes derive per-item keys from the form key (`grantKey`);
   layer 10 has no fan-out. Every dialog and drawer component test asserts the hidden
   `contextOrganisationId` and `idempotencyKey`. [A, H3.1, L16-R15, C]
7. A record route validates its id **before any read**: the layout and every tab page call
   `notFound()` when `parseUserId` (Task 1) rejects it (16's pattern; pinned by Task 8's
   `user-id-guard.test.tsx`), then use its lower-cased form (contract §A); Server Actions check ids
   with zod before any backend call. [A, L16-R26, L16-R32, C]
8. Every list is server-paginated with its state in the URL (`PAGE_SIZES`, `TablePaginationBar`,
   `ListToolbar`, `useListNavigation()`); the Branch assignments tab pages the scan's rows on the
   server with URL `page`/`size` (Task 7). [A, H3.7, C]
9. Reads go through `apiGet(path, schema)` with a snake_case zod schema from the domain's
   `user-contract.ts`; pages settle reads with `load()` and render `ErrorState` (or `ForbiddenState`
   on a 403) on the failure branch; `describeProblem` never echoes backend text, and named guard
   copy comes from `lib/api/explain-action-result.ts`'s `explain`. [A, C]
10. Request bodies are built field by field in snake_case (an unknown property is `400 invalid_json`). [index, contract §A]
11. Status changes move focus to the replacement action, else the first enabled one, else the record
    title via `components/data-display/focus-record-title.ts`. [H3.4]
12. One `h1` per page, visible focus, labelled fields, errors tied to fields, reduced motion
    respected; no serious or critical axe violation in light and dark at 1280 and 375 px. [A, index]
13. The 06/07b/07/08 kit and the theme take only additive, announced `refactor(kit):`/`fix(kit):`
    commits; 08's and 09's modules take only additive props and messages. [H3.2]
14. Fake-API files run under plain `node`: relative `.mts` imports, `import type`, erasable TypeScript
    only; seeds use the `10000000-0000-4000-8000-…` prefix; never mutate `greenfieldTenant()`'s
    collections; new `BUILDERS` entries go last with a `// Layer 10 (users).` comment; `server.mts`
    registers new routes last; user-controlled lookups use `Object.hasOwn`. [A, H3.5, H3.6, L09-R9, L16-R7]
15. E2E: every test signs in to its own fake-API run (`authenticate()`); not-found is asserted by page
    content (the layout's `notFound()` answers HTTP 200); URL assertions read
    `new URL(page.url()).searchParams.get(…)`, never an order-dependent regex; no `waitForTimeout`;
    an open dialog is scanned only once its opacity is 1; instants are asserted from fixed seed
    values. [L16-R27, L16-R31, C]
16. Unknown-property fake tests send a body that is valid apart from the extra key, with a control
    request proving the same body otherwise succeeds. [L16 Task 3 Important]
17. New backend gaps take the next free id (BG-35); a summary row's Gap column stays ≤ 98 characters. [L16-R12]
18. Every commit ends with exactly these two trailer lines, and no model name appears in code, docs,
    commit messages or trailers: [L09-R10, L16-R8, C]

    ```
    Co-Authored-By: Claude <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
    ```

19. Update `README.md` (and `AGENTS.md`) where the architecture or a documented limit changes; the
    plan's trailing gate, live-check and self-review sections are the controller's. [A, H3.10]

**Wire contract** (contract §E.3; every mutation also needs the matching `.view` for its read-back,
BG-31):

| Endpoint                                                                | Permission                                                                   | Body                       | Success                                | 10's handling                                                                                                                       |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `GET /tenant/users?q&user_status&membership_status&page&size`           | `user.view` (T)                                                              | —                          | `ApiPage<UserInTenantSummary>`         | Newest first; no sort is ever sent. 403 → `ForbiddenState`                                                                          |
| `GET /tenant/users/{id}`                                                | `user.view`                                                                  | —                          | `UserInTenantSummary`                  | 404 → `notFound()`; 403 → `ForbiddenState`; drift → `ErrorState`                                                                    |
| `GET /tenant/memberships?q&membership_status&membership_type&page&size` | `membership.view`                                                            | —                          | `ApiPage<MembershipSummary>`           | `q=<email>`, ≤ 5 pages × 100, matched on `user_id` exactly (BG-09); `sort_*` ignored, never sent                                    |
| `GET /tenant/memberships/{id}`                                          | `membership.view`                                                            | —                          | `MembershipDetail`                     | Overview's type, primary branch and dates                                                                                           |
| `POST /tenant/memberships/{id}/activate`                                | `user.approve` + `membership.view`                                           | none read; `{}` sent       | 200 (ACTIVE) or **202** (provisioning) | Approver ≠ inviter is a 403 (BG-08): explained. Not pending, re-approve, unknown, missing prerequisites: 500 (BG-07): explained     |
| `POST …/suspend`                                                        | `membership.suspend` + `membership.view`                                     | `{ reason }` 3–500         | `MembershipDetail`                     | ACTIVE → SUSPENDED; 409 generic                                                                                                     |
| `POST …/reactivate`                                                     | `membership.reactivate` + `membership.view`                                  | `{}` or `{ reason }` ≤ 500 | `MembershipDetail`                     | SUSPENDED → ACTIVE; 409 generic                                                                                                     |
| `POST …/revoke`                                                         | `membership.revoke` + `membership.view`                                      | `{ reason }` 3–500         | `MembershipDetail`                     | Terminal; revokes every assignment; the email can never be re-invited (BG-28); a second revoke is a 500: explained                  |
| `GET /tenant/branch-assignments?status=ACTIVE&page&size`                | `branch_assignment.view`                                                     | —                          | `ApiPage<BranchAssignmentSummary>`     | No `user_id` filter: ≤ 5 pages × 100 scanned, flagged truncated; forced to the selected branch in a branch context (§E.4)           |
| `POST`, `DELETE /tenant/branch-assignments[/{id}]`                      | `user.assign_branch`, `user.revoke_branch` (T, B) + `branch_assignment.view` | as 08                      | as 08                                  | 08's actions; a STAFF/ADMIN member's last assignment is a 409 (explained by 08)                                                     |
| `GET /tenant/role-assignments?user_id&status=ACTIVE`                    | `role_assignment.view`                                                       | —                          | `ApiPage<RoleAssignmentSummary>`       | 09's `listRoleAssignments`; never branch-restricted                                                                                 |
| `POST`, `DELETE /tenant/role-assignments[/{id}]`                        | `user.assign_role`, `user.revoke_role` (+ `role_assignment.view`)            | as 09                      | as 09                                  | 09's actions; BRANCH needs an existing ACTIVE assignment at that branch (409); BRANCH without a branch is a 500 (BG-07), never sent |
| `GET /tenant/audit-events?entity_type&entity_id&actor_id&action`        | `audit.view`                                                                 | —                          | `ApiPage<AuditEventSummary>`           | The four views; the maker lookup `USER` + `user.invite`                                                                             |

**Files 10 never touches:** `components/shell/*`, `app/(authenticated)/layout.tsx`,
`app/(authenticated)/admin/layout.tsx`, `lib/api/*`, `auth/*`, `config/*`, `theme/*` (apart from
Task 5's two comment-only pointer updates), every kit file except `list-toolbar.tsx` (Task 8),
`modules/platform-administration/**`, `modules/administration/settings/**`, the fake API's `access`,
`audit-log`, `context-token`, `idempotency` and `router` `.mts` files, the plan index and other layers'
plans.

**Rulings for this layer** (decisions the implementer can't make; the questions file lists the open
ones with their defaults):

1. **Routes.** `/admin/users` (directory), `/admin/users/[userId]` (Overview), `…/access` (Roles &
   access), `…/branches` (Branch assignments), `…/audit`. No route group: layer 11's
   `/admin/users/new` is a sibling static segment, and until it lands the layout's id check answers
   `new` with the not-found page.
2. **Navigation.** "Users & access" (`GroupOutlined`, `requiresAny: ['user.view']`) goes right after
   Overview (spec §8; the Approval queue will insert before it).
3. **Directory** (spec §10.5, D8): columns User (initials avatar, name link, email), Username,
   Onboarding, Membership, User status; filters `q`, `userStatus`, `membershipStatus`; 10 per page;
   newest first with no sort headers (the endpoint has no sort; nothing is sent).
4. **Onboarding state** is total over all 4 × 10 status pairs (Task 1's table): the spec's six rows,
   plus "Account <status>" for a SUSPENDED/LOCKED/DEACTIVATING/DEACTIVATED/ARCHIVED account under a
   pending or active membership, "Awaiting approval" for any other pending account, and "Account not
   ready" for an ACTIVE membership whose account isn't yet INVITED or ACTIVE.
5. **Hero actions** (`availableMembershipActions`): the `membership.view` gate first, then the status
   (PENDING_APPROVAL → Approve, Reject & revoke; ACTIVE → Suspend, Revoke; SUSPENDED → Reactivate,
   Revoke; REVOKED → none), then each action's own code; Approve is withheld for a PROVISIONING_IDP
   user (re-approval is a 500). A contextually blocked action is **shown disabled with a caption**
   (spec §6.6; `blockedMembershipActions`): Approve for its inviter (the `user.invite` actor, read
   only with `audit.view`; unknown → enabled, a 403 is explained) and for a blocked account (contract
   §F needs ACTIVE/INVITED; else a 500).
6. **Your own record** (question Q1, default A): Suspend and Revoke are shown **disabled** with the
   `OWN_MEMBERSHIP` caption, like the inviter's Approve; BG-35 records that the contract documents no
   backend guard.
7. **Membership resolution** (BG-09): `findUserMembership(userId, email)` reads
   `GET /tenant/memberships?q=<email>&page=N&size=100` for N = 0..4 and returns the item whose
   `user_id` equals the user id, never the first hit; `null` when not found within the ceiling or for
   a blank email. Without actions the hero says why: not found (`MEMBERSHIP_MISSING`) or failed
   (`MEMBERSHIP_UNAVAILABLE`, refresh); the Overview shows a failure with its reference.
8. **Branch scan** (BG-09): `listUserBranchAssignments(userId)` reads
   `GET /tenant/branch-assignments?status=ACTIVE&page=N&size=100` for N = 0..4 and keeps the user's
   rows, de-duplicated by id (the order is unspecified); `truncated` is true when page 4 still has
   more, and the tab and the Overview say "partial" (the Overview's count in a branch context reads
   `At least N at <branch> (partial)`, never a bare `0 at <branch>`). In a branch context the backend
   forces the selected branch, so the tab says only that branch is visible and offers Switch to All
   branches when the user has more than one ACTIVE branch.
9. **Approve outcome** (question Q2, default): no kit change. The toast says "Approval recorded"; the
   refreshed record tells 200 from 202 by state ("Active" vs "Provisioning identity", plus the
   Overview's provisioning note).
10. **Named failures** (`explain`): approve 403 → permission or maker-checker; approve 500 → the
    likely causes (no active role, no branch for staff/admin, approval already ran); revoke 500 →
    possibly already revoked. Each keeps the request reference.
11. **Assignment drawers.** Roles & access offers ACTIVE roles from `getRoleIndex()` as a visible
    `roleId` select and passes `RoleScopeFields` only the branches the user holds an ACTIVE
    assignment at (narrowed to the selected branch in a branch context), with a new `branchHint`
    prop explaining a disabled "One branch". Branch assignments offers ACTIVE branches from one
    bounded read (`GET /branches?status=ACTIVE&size=100`, name order, a `ponytail:` ceiling with the
    helper "Only the first 100 active branches are listed." when it has more; only the selected
    branch, labelled with its code, in a branch context). The user is a hidden field; no read-only
    field is rendered (carry-in f).
12. **Audit tab:** views `user` (USER / user id), `account` (USER_ACCOUNT / user id), `membership`
    (MEMBERSHIP / membership id, only when the membership resolved) and `actor` (`actorId`).
13. **Actor picker:** `ListToolbar` gains an optional `children` slot (rendered after the fields,
    before the chips), and `AuditFilters` renders `AuditActorPicker` there when the holder has
    `user.view`.
14. **Fake API:** `routes/memberships.mts` (list, detail, activate, suspend, reactivate, revoke);
    `FakeUser.identityLinked?` (absent = linked: 200; `false`: 202 and the user becomes
    PROVISIONING_IDP) and `FakeMembership.invitedBy?` (maker-checker). Scenarios `users`,
    `users-limited` (no `membership.view`, `audit.view`), `users-read-only` (no lifecycle or
    assignment codes) and `users-many-assignments` (500 filler assignments, for the partial marker);
    `default` stays read-only for users.
15. **Carry-ins** (preflight §6): 08's `focusRecordTitle` copy is retired (Task 5); `assignRole`'s
    `roleId` and `assignBranchUser`'s `branchId` get named messages (Task 2); `RoleScopeFields` gets
    `branchHint` and a JSDoc note on its fixed names (Task 6); 08's `RevokeAssignmentButton` gets an
    optional `branchLabel` so each row's name is unique on the user record (Task 7, WCAG 2.4.6); the
    e2e helpers are shared (Tasks 3, 9, 10); README gains the Settings page (Task 11). Carry-ins d
    (16's username and E.164 validators) and f (the read-only field look) move to layer 11,
    overriding the 16 triage (questions Q5, Q6): no layer-10 form has those fields.
16. **Mixed-case ids** (question Q10, default): `parseUserId` lower-cases the route id, so the reads,
    the audit filters and the self check all use the backend's canonical form, and the tabs link to
    the lower-case URL. A hand-typed upper-case URL renders the record with no tab selected until a
    tab is chosen (a layout can't see the sub-path to redirect it); accepted.
17. **Branch context on the Branch assignments tab:** an info `Alert` with Switch to All branches
    above the selected branch's rows, not the full-page `BranchContextState` the handoff proposed:
    the tab can still show (and revoke) the rows at the selected branch.

## Review Focus

The five input classes most likely to bite a person using this layer, each pinned by a named test:

1. **An email search that returns the wrong membership.** `q` is a substring (and `%`/`_` are
   wildcards), so `ann.mwangi@…` also matches `joann.mwangi@…`, and a popular domain can return more
   than a page. The record must show Ann's own membership, never the first hit, and must degrade (no
   actions, a note) when the membership isn't found within the ceiling.
   [Task 2 `user-service.test.ts` "matches the membership by user id, never the first hit" and "scans
   at most five pages of 100, then gives up with null"; Task 3 fake spec "lists memberships by a substring search" (Joann first);
   Task 11 `users.spec.ts` "shows each user's own membership facts, even when emails nest".]
2. **Permission before lifecycle, hidden read-backs, maker-checker and self.** A holder without
   `membership.view` sees no membership action whatever their other codes; each action needs its own
   code; the inviter's Approve and your own Suspend and Revoke are disabled with the reason.
   [Task 1 `user-rules.test.ts` action and blocked matrices; Task 3 fake "checks permission before
   state"; Task 5 `user-lifecycle-actions.test.tsx`; Task 11 "offers no membership actions without
   membership.view", "offers no mutations without the permissions", "disables Approve for the user's
   inviter", "disables Suspend and Revoke on your own record".]
3. **Retry, double submit and a stale tab.** A refused reason (only spaces and one letter) keeps the
   typed text and the key; a replayed approval returns the stored 202 and never transitions twice; a
   submit after an organisation switch is refused by the cross-tab guard.
   [Task 2 `membership-actions.test.ts` "refuses a suspend reason under 3 characters after trimming, before any call"; Task 3
   fake "approves: 202 … a replay returns the stored 202"; Task 5 "keeps the typed reason and the key
   after a refused suspend"; every dialog, drawer and revoke test (Tasks 5–7) asserts
   `contextOrganisationId`; Task 11 "rejects and revokes a provisioning user permanently".]
4. **Branch context and branch cardinality.** With a branch selected the assignment search is forced
   to it and other branches 404; a user holding HOME and OPERATE at one branch must be offered that
   branch once; a scan that hits its ceiling must say it is partial.
   [Task 1 "offers a branch held twice (HOME and OPERATE) once, sorted by label"; Task 2 "marks the
   scan truncated when the fifth page still has more"; Task 11 "marks a scan that hit its ceiling as
   partial" (`users-many-assignments`) and "narrows a branch context to its branch".]
5. **Malformed, mixed-case and drifted input.** `not-a-uuid`, `../x` and an unknown id show the
   not-found page without a backend read; an upper-case id renders the same record and the same audit
   rows; an unknown status or type renders `ErrorState` with a reference.
   [Task 1 `parseUserId` and contract drift tests; Task 2 "rejects a malformed id before any call";
   Task 8 `user-id-guard.test.tsx` (layout and four tabs: no read, upper case read lower-cased);
   Task 11 "answers an unknown or malformed user id with the not-found page" and "canonicalises a
   mixed-case user id".]

Also pinned: 100-character names and emails at 375 px never scroll the page (Task 11's axe matrix);
the four audit views each filter by their subject (Task 11 "shows a user's history in four audit
views", an exact row count per view, so a dropped `entityId` fails).

---

## Pre-flight notes (the workflow's pre-flight phase; not a task)

Implementers never execute this section. The controller checks it against the tip before Task 1.

1. **Base.** `git log --oneline -3` shows `09b5da9` (or a later controller commit);
   `grep -n "Box|Stack|Grid|DialogContentText" eslint.config.mjs` finds the widened guard.
2. **Consumed names exist** (one grep each): `focusRecordTitle` in
   `components/data-display/focus-record-title.ts`; `explain` in `lib/api/explain-action-result.ts`;
   `getRoleIndex`, `getBranchIndex`, `getOrganisationTimeZone` in `lib/api/lookups.ts`;
   `listRoleAssignments`, `RoleAssignmentFilter` in `roles/role-service.ts`; `RoleScopeFields`,
   `RevokeRoleAssignmentButton`, `BranchOption` in `roles/components/role-assignment-actions.tsx`;
   `canRevokeRoleAssignments`, `isAssignmentRevocable`, `scopeLabel` in `roles/role-rules.ts`;
   `assignBranchUser`, `revokeBranchAssignment` in `branches/branch-actions.ts`; `RevokeAssignmentButton`
   in `branches/components/branch-user-actions.tsx`; `canRevokeAssignments`, `activateBlocked` in
   `branches/branch-rules.ts`; `listBranches` in `branches/branch-service.ts`; `BranchAssignment`,
   `BRANCH_ASSIGNMENT_TYPES` in `branches/branch-contract.ts`; `RecordAuditTab` (views tuple),
   `AuditFilters`, `listAuditEvents`; `activeAssignmentRows` in `e2e/fake-api/access.mts`.
3. **Users module is search-only:** `modules/administration/users/` holds `user-option.ts`,
   `user-search-service.ts(+test)` and `components/user-picker.tsx(+test)` only.
4. **Seeds free:** `grep -rn "10000000-" e2e` prints nothing; `BUILDERS` ends with
   `'platform-tenants'`; `FakeUser` has no `identityLinked`, `FakeMembership` no `invitedBy`.
5. **Kit shape:** `ListToolbar`'s props have no `children`; `ConfirmDialog`'s `onSuccess` is
   `() => void`; `ActionResult`'s success variant is `{ ok: true }` (confirms Ruling 9's premise).
6. **Docs anchors** for Task 11: README lines naming the shipped admin pages (the `admin/` tree
   comment, "Administration currently ships…", "Beyond context discovery…", step 2 of "Next
   recommended implementation steps"), the audit limitation "An actor is filtered by clicking…",
   the `modules/` `users/` sentence and the `data-display/` entry; AGENTS.md's four named paging
   exceptions (the last says "a fourth, named exception"); `docs/backend-gaps.md`'s last id (BG-34).
7. **Next.js guides** to read before Tasks 4–8 (`node_modules/next/dist/docs/01-app/`):
   `03-api-reference/03-file-conventions/layout.md`, `not-found.md`, `dynamic-routes.md`, and
   `02-guides/server-actions.md`.
8. **Affected E2E per task** (form E): Task 3 `e2e/fake-api-users.spec.ts e2e/fake-api.spec.ts`;
   Task 4 `e2e/shell.spec.ts`; Task 5 `e2e/branches.spec.ts`; Task 6 `e2e/roles.spec.ts`; Task 7
   `e2e/branches.spec.ts`; Task 8 `e2e/audit.spec.ts`; Task 9 `e2e/shell.spec.ts e2e/roles.spec.ts`;
   Task 10 the six migrated specs; Task 11 `e2e/users.spec.ts` in three chunks.

---

### Task 1: Users contract, directory query and rules

**Files:**

- Create: `modules/administration/users/user-contract.ts`, `user-contract.test.ts`
- Create: `modules/administration/users/user-query.ts`, `user-query.test.ts`
- Create: `modules/administration/users/user-rules.ts`, `user-rules.test.ts`
- Modify: `modules/administration/users/user-search-service.ts` (re-point at `userPageSchema`; its
  test stays as it is and must stay green)

**Interfaces:**

- Consumes: `uuidSchema`, `UUID_PATTERN`, `instantSchema`, `pageSchema`, `type Page`
  (`lib/api/wire.ts`); `parsePaging` (`lib/api/paging.ts`); `toQueryString`
  (`lib/api/query-string.ts`); `can`, `canAll`, `canAny`, `type PermissionHolder`
  (`auth/permissions.ts`); `humanizeEnum`, `type StatusTone` (`components/data-display/status-chip.tsx`).
- Produces (★ = consumed by 11, 12 or 17):
  - ★ `USER_STATUSES`, `MEMBERSHIP_STATUSES`, `MEMBERSHIP_TYPES` and their types `UserStatus`,
    `MembershipStatus`, `MembershipType`;
  - ★ `userSummarySchema`, `userPageSchema`, `type UserSummary`
    `{ id, username, email, displayName, userStatus, membershipStatus }`;
  - `membershipPageSchema`, `type MembershipSummary` `{ id, userId, status, type, primaryBranchId }`;
    `membershipDetailSchema`, `type MembershipDetail` (summary + `createdAt`, `updatedAt`);
  - `DEFAULT_USER_PAGE_SIZE = 10`, `interface UserListQuery`, `parseUserListQuery(params)`,
    `hasUserFilters(query)`, `userListApiPath(query)`;
  - ★ `onboardingState(membership, user): OnboardingState` and `type OnboardingKey`;
  - ★ `userStatusLabel(status): string` (a user status in words: `humanizeEnum` would print
    "Provisioning idp" for PROVISIONING_IDP; the directory, its filter and the record's Profile use it);
  - `onboardingProgress(membership, user): OnboardingProgress`, `type OnboardingStep`,
    `PROVISIONING_NOTE`;
  - ★ `type MembershipAction`, `interface MembershipSubject`, `availableMembershipActions(status, holder)`, `blockedMembershipActions(actions, subject)`, `type MembershipLookup`,
    `membershipActionsNote(holder, lookup)`;
  - copy constants `NO_MEMBERSHIP_VIEW`, `MEMBERSHIP_MISSING`, `MEMBERSHIP_UNAVAILABLE`,
    `OWN_MEMBERSHIP`, `USER_MAKER_CHECKER_BLOCKED`, `ACCESS_DESCRIPTION`, `NO_ACTIVE_ROLES`,
    `PARTIAL_SCAN_NOTE`, `accountBlockedNote(status)`, `branchContextNote(name, canSwitch)`;
  - `canAssignUserRole(status, holder)`, `canAssignUserBranch(status, holder)`;
  - `interface SelectOption { id: string; label: string }` (structurally 09's `BranchOption`),
    `roleScopeBranches(rows, selectedBranchId, label)`, `roleScopeHint(input)`,
    `branchAssignmentCount(count, truncated, selectedBranchName)`;
  - `pageOfItems(items, paging): Page<T>`; ★ `parseUserId(param): string | null`.

- [ ] **Step 1: Write the failing contract test**

`modules/administration/users/user-contract.test.ts` (fixtures inline; `USER` is
`10000000-0000-4000-8000-00000000000d`):

```ts
const wireUser = {
  id: USER,
  username: 'felix.omondi',
  email: 'felix.omondi@greenfield.example',
  display_name: 'Felix Omondi',
  user_status: 'ACTIVE',
  membership_status: 'ACTIVE',
};

it('maps a user summary to camelCase and ignores extra fields', () => {
  expect(userSummarySchema.parse({ ...wireUser, last_login_at: null })).toEqual({
    id: USER,
    username: 'felix.omondi',
    email: 'felix.omondi@greenfield.example',
    displayName: 'Felix Omondi',
    userStatus: 'ACTIVE',
    membershipStatus: 'ACTIVE',
  });
});

it.each([
  ['an unknown user status', { ...wireUser, user_status: 'BLOCKED' }],
  ['an unknown membership status', { ...wireUser, membership_status: 'INVITED' }],
  ['a missing field', { ...wireUser, display_name: undefined }],
  ['a malformed id', { ...wireUser, id: 'not-a-uuid' }],
])('rejects %s', (_case, wire) => {
  expect(userSummarySchema.safeParse(wire).success).toBe(false);
});
```

Plus: "maps a membership summary, keeping a null primary branch" (`primaryBranchId: null`);
"rejects an unknown membership type" (`membership_type: 'GUEST'`); "maps a membership detail with
its instants" (`createdAt: '2026-07-01T08:00:00Z'`); "rejects a date-only instant on the detail"
(`created_at: '2026-07-01'`).

- [ ] **Step 2: Run it to verify it fails** — form U on the test file. Expected: FAIL (module not
      found).

- [ ] **Step 3: Implement `user-contract.ts`**

```ts
import { z } from 'zod';
import { instantSchema, pageSchema, uuidSchema } from '@/lib/api/wire';

/** Contract §F. Seen at rest: DRAFT, PROVISIONING_IDP, INVITED, ACTIVE, SUSPENDED, DEACTIVATED. */
export const USER_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'PROVISIONING_IDP',
  'INVITED',
  'ACTIVE',
  'SUSPENDED',
  'LOCKED',
  'DEACTIVATING',
  'DEACTIVATED',
  'ARCHIVED',
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const MEMBERSHIP_STATUSES = ['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REVOKED'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** AUDITOR and SYSTEM are branch-exempt (contract §F). */
export const MEMBERSHIP_TYPES = ['STAFF', 'ADMIN', 'AUDITOR', 'SYSTEM'] as const;
export type MembershipType = (typeof MEMBERSHIP_TYPES)[number];

/** UserInTenantSummary (contract §C): the list item and `GET /tenant/users/{id}` share it. No
 * membership id, type or dates (BG-09). Spec §6.1: the platform module reuses it (layer 17). */
export const userSummarySchema = z
  .object({
    id: uuidSchema,
    username: z.string(),
    email: z.string(),
    display_name: z.string(),
    user_status: z.enum(USER_STATUSES),
    membership_status: z.enum(MEMBERSHIP_STATUSES),
  })
  .transform((user) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.display_name,
    userStatus: user.user_status,
    membershipStatus: user.membership_status,
  }));

export type UserSummary = z.output<typeof userSummarySchema>;

export const userPageSchema = pageSchema(userSummarySchema);

/** MembershipSummary: no names (BG-09). */
const membershipSummarySchema = z
  .object({
    id: uuidSchema,
    user_id: uuidSchema,
    membership_status: z.enum(MEMBERSHIP_STATUSES),
    membership_type: z.enum(MEMBERSHIP_TYPES),
    primary_branch_id: uuidSchema.nullable(),
  })
  .transform((membership) => ({
    id: membership.id,
    userId: membership.user_id,
    status: membership.membership_status,
    type: membership.membership_type,
    primaryBranchId: membership.primary_branch_id,
  }));

export type MembershipSummary = z.output<typeof membershipSummarySchema>;

export const membershipPageSchema = pageSchema(membershipSummarySchema);

/** MembershipDetail: the identity fields repeat the user read and aren't mapped. */
export const membershipDetailSchema = z
  .object({
    id: uuidSchema,
    organisation_id: uuidSchema,
    user_id: uuidSchema,
    username: z.string(),
    email: z.string(),
    display_name: z.string(),
    user_status: z.enum(USER_STATUSES),
    membership_status: z.enum(MEMBERSHIP_STATUSES),
    membership_type: z.enum(MEMBERSHIP_TYPES),
    primary_branch_id: uuidSchema.nullable(),
    created_at: instantSchema,
    updated_at: instantSchema,
  })
  .transform((membership) => ({
    id: membership.id,
    userId: membership.user_id,
    status: membership.membership_status,
    type: membership.membership_type,
    primaryBranchId: membership.primary_branch_id,
    createdAt: membership.created_at,
    updatedAt: membership.updated_at,
  }));

export type MembershipDetail = z.output<typeof membershipDetailSchema>;
```

- [ ] **Step 4: Write the failing query test** — `user-query.test.ts`:

```ts
it('defaults to the first page of 10, with no filters', () => {
  const query = parseUserListQuery(new URLSearchParams());
  expect(query).toEqual({ page: 0, size: 10 });
  expect(userListApiPath(query)).toBe('/api/v1/tenant/users?page=0&size=10');
  expect(hasUserFilters(query)).toBe(false);
});

it('keeps a trimmed search capped at 100 characters', () => {
  expect(parseUserListQuery(new URLSearchParams({ q: '  ann  ' })).q).toBe('ann');
  expect(parseUserListQuery(new URLSearchParams({ q: 'x'.repeat(150) })).q).toHaveLength(100);
});

it('keeps known statuses and drops anything else, never sending it', () => {
  const query = parseUserListQuery(
    new URLSearchParams({ userStatus: 'SUSPENDED', membershipStatus: 'BOGUS' }),
  );
  expect(query).toEqual({ page: 0, size: 10, userStatus: 'SUSPENDED' });
  expect(
    parseUserListQuery(new URLSearchParams({ userStatus: 'active' })).userStatus,
  ).toBeUndefined();
});

it('sends snake_case filters, encodes the search, and never sends a sort', () => {
  const path = userListApiPath({
    q: 'ann.mwangi@greenfield.example',
    userStatus: 'ACTIVE',
    membershipStatus: 'PENDING_APPROVAL',
    page: 1,
    size: 20,
  });
  expect(path).toBe(
    '/api/v1/tenant/users?q=ann.mwangi%40greenfield.example&user_status=ACTIVE&membership_status=PENDING_APPROVAL&page=1&size=20',
  );
  expect(path).not.toContain('sort');
});

it('falls back for an unlisted page size or a negative page', () => {
  expect(parseUserListQuery(new URLSearchParams({ size: '25', page: '-1' }))).toEqual({
    page: 0,
    size: 10,
  });
});
```

- [ ] **Step 5: Implement `user-query.ts`**

```ts
import { parsePaging } from '@/lib/api/paging';
import { toQueryString } from '@/lib/api/query-string';
import {
  MEMBERSHIP_STATUSES,
  USER_STATUSES,
  type MembershipStatus,
  type UserStatus,
} from './user-contract';

export const DEFAULT_USER_PAGE_SIZE = 10;

export interface UserListQuery {
  q?: string;
  userStatus?: UserStatus;
  membershipStatus?: MembershipStatus;
  page: number;
  size: number;
}

/** URL → validated directory query. Unknown statuses are dropped, never sent; the endpoint has no
 * sort (contract §E.3), so none is parsed or sent. */
export function parseUserListQuery(params: URLSearchParams): UserListQuery {
  const query: UserListQuery = parsePaging(params, DEFAULT_USER_PAGE_SIZE);
  const q = params.get('q')?.trim().slice(0, 100);
  if (q) query.q = q;
  const userStatus = USER_STATUSES.find((value) => value === params.get('userStatus'));
  if (userStatus) query.userStatus = userStatus;
  const membershipStatus = MEMBERSHIP_STATUSES.find(
    (value) => value === params.get('membershipStatus'),
  );
  if (membershipStatus) query.membershipStatus = membershipStatus;
  return query;
}

export function hasUserFilters(query: UserListQuery): boolean {
  return Boolean(query.q ?? query.userStatus ?? query.membershipStatus);
}

export function userListApiPath(query: UserListQuery): string {
  return `/api/v1/tenant/users${toQueryString({
    q: query.q,
    user_status: query.userStatus,
    membership_status: query.membershipStatus,
    page: query.page,
    size: query.size,
  })}`;
}
```

- [ ] **Step 6: Write the failing rules test** — `user-rules.test.ts`. Holders are
      `{ permissions: [...] }`; `ALL` is every lifecycle and view code.

```ts
const FULL = ['Done', 'Done', 'Done', 'Done'];

describe('onboardingState', () => {
  it.each([
    // The spec §10.5 table.
    ['PENDING_APPROVAL', 'DRAFT', 'AWAITING_APPROVAL', 'Awaiting approval', 'warning'],
    [
      'PENDING_APPROVAL',
      'PROVISIONING_IDP',
      'PROVISIONING_IDENTITY',
      'Provisioning identity',
      'warning',
    ],
    ['ACTIVE', 'INVITED', 'AWAITING_FIRST_SIGN_IN', 'Awaiting first sign-in', 'info'],
    ['ACTIVE', 'ACTIVE', 'ACTIVE', 'Active', 'success'],
    ['SUSPENDED', 'ACTIVE', 'SUSPENDED', 'Suspended', 'error'],
    ['REVOKED', 'DRAFT', 'REVOKED', 'Revoked', 'error'],
    // Beyond the table: an existing global account awaiting approval, and blocked accounts.
    ['PENDING_APPROVAL', 'ACTIVE', 'AWAITING_APPROVAL', 'Awaiting approval', 'warning'],
    ['ACTIVE', 'SUSPENDED', 'ACCOUNT_BLOCKED', 'Account suspended', 'error'],
    ['ACTIVE', 'DEACTIVATED', 'ACCOUNT_BLOCKED', 'Account deactivated', 'error'],
    ['ACTIVE', 'DRAFT', 'ACCOUNT_NOT_READY', 'Account not ready', 'warning'],
    ['PENDING_APPROVAL', 'LOCKED', 'ACCOUNT_BLOCKED', 'Account locked', 'error'],
  ] as const)('%s + %s → %s', (membership, user, key, label, tone) => {
    expect(onboardingState(membership, user)).toEqual({ key, label, tone });
  });

  it('reads "Account <status>" exactly for a live membership with a blocked account', () => {
    const blocked = ['SUSPENDED', 'LOCKED', 'DEACTIVATING', 'DEACTIVATED', 'ARCHIVED'];
    for (const membership of MEMBERSHIP_STATUSES) {
      for (const user of USER_STATUSES) {
        const live = membership === 'PENDING_APPROVAL' || membership === 'ACTIVE';
        expect(
          onboardingState(membership, user).key === 'ACCOUNT_BLOCKED',
          `${membership} ${user}`,
        ).toBe(live && blocked.includes(user));
      }
    }
  });
});

describe('onboardingProgress', () => {
  const states = (membership: MembershipStatus, user: UserStatus) => {
    const progress = onboardingProgress(membership, user);
    return progress.kind === 'steps'
      ? progress.steps.map((step) => step.state.label)
      : progress.note;
  };

  it('walks the four onboarding steps', () => {
    expect(states('PENDING_APPROVAL', 'DRAFT')).toEqual([
      'Done',
      'Waiting',
      'Not started',
      'Not started',
    ]);
    expect(states('PENDING_APPROVAL', 'PROVISIONING_IDP')).toEqual([
      'Done',
      'Done',
      'In progress',
      'Not started',
    ]);
    expect(states('ACTIVE', 'INVITED')).toEqual(['Done', 'Done', 'Done', 'Waiting']);
    expect(states('ACTIVE', 'ACTIVE')).toEqual(FULL);
  });

  it('explains a provisioning identity under the steps (BG-11)', () => {
    expect(onboardingProgress('PENDING_APPROVAL', 'PROVISIONING_IDP')).toMatchObject({
      kind: 'steps',
      note: PROVISIONING_NOTE,
    });
    expect(onboardingProgress('ACTIVE', 'ACTIVE')).toMatchObject({ kind: 'steps', note: null });
  });

  it('replaces the steps with a sentence once onboarding has stopped', () => {
    expect(states('SUSPENDED', 'ACTIVE')).toMatch(/suspended/);
    expect(states('REVOKED', 'ACTIVE')).toMatch(/permanent/);
    expect(states('ACTIVE', 'LOCKED')).toBe(
      "Their account is locked on the platform, so they can't sign in to any institution.",
    );
  });
});

describe('availableMembershipActions', () => {
  const pending = { membershipStatus: 'PENDING_APPROVAL', userStatus: 'DRAFT' } as const;

  it('offers nothing without membership.view, whatever the status and other codes', () => {
    const holder = { permissions: ALL.filter((code) => code !== 'membership.view') };
    expect(availableMembershipActions(pending, holder)).toEqual([]);
  });

  it.each([
    ['PENDING_APPROVAL', 'DRAFT', ['approve', 'reject']],
    ['PENDING_APPROVAL', 'PROVISIONING_IDP', ['reject']],
    ['ACTIVE', 'ACTIVE', ['suspend', 'revoke']],
    ['SUSPENDED', 'ACTIVE', ['reactivate', 'revoke']],
    ['REVOKED', 'ACTIVE', []],
  ] as const)('%s + %s offers %j', (membershipStatus, userStatus, actions) => {
    expect(
      availableMembershipActions({ membershipStatus, userStatus }, { permissions: ALL }),
    ).toEqual(actions);
  });

  it("needs each action's own code; Reject & revoke needs membership.revoke", () => {
    const only = (...codes: string[]) => ({ permissions: ['membership.view', ...codes] });
    expect(availableMembershipActions(pending, only('membership.revoke'))).toEqual(['reject']);
    expect(availableMembershipActions(pending, only('user.approve'))).toEqual(['approve']);
  });
});
```

Plus, each as its own `it`:

- `blockedMembershipActions` "disables Suspend and Revoke on your own record, with the reason"
  (`self: true` → `{ suspend: OWN_MEMBERSHIP, revoke: OWN_MEMBERSHIP }`; `self: false` → `{}`) and
  "disables only Approve for the user's inviter and for a blocked account" (`['approve', 'reject']`
  with `invitedByMe` → `{ approve: USER_MAKER_CHECKER_BLOCKED }`; with `userStatus: 'LOCKED'` →
  `{ approve: "Their account is locked on the platform, so this membership can't be approved." }`).
- `membershipActionsNote`: no lifecycle code → `null`; lifecycle codes without `membership.view`
  → `NO_MEMBERSHIP_VIEW`; with the view, `'missing'` → `MEMBERSHIP_MISSING`, `'failed'` →
  `MEMBERSHIP_UNAVAILABLE`, `'found'` → `null`.
- `branchContextNote('Westlands Branch', true)` ends "Switch to All branches to see this user's other
  branch assignments."; with `false` it names the single-branch account and never says "Switch".
- `canAssignUserRole`: `REVOKED` → false; without `role.view` → false;
  `['user.assign_role', 'role.view']` on `SUSPENDED` → true.
- `canAssignUserBranch`: `REVOKED` → false; without `branch.view` → false;
  `['user.assign_branch', 'branch_assignment.view', 'branch.view']` on `PENDING_APPROVAL` → true.
- `roleScopeBranches` "offers a branch held twice (HOME and OPERATE) once, sorted by label";
  "narrows to the selected branch in a branch context" (`[]` when the user isn't assigned there).
- `roleScopeHint` (input `{ readable, offered, truncated, selectedBranchName }`): offered > 0 → `undefined`
  (also when `truncated`); unreadable →
  `"Their branch assignments can't be read here, so only institution scope is available."` (also when
  `truncated`); a capped scan (`truncated`) that offered nothing, with or without a selected branch →
  `"Only the first 500 branch assignments were checked and none of theirs was among them, so only institution scope is offered here."`
  (Ruling 8: a capped scan says it is partial); otherwise selected
  branch "Westlands Branch" → `"They aren't assigned to Westlands Branch. Assign them there first to give a branch-scoped role."`; otherwise `"Assign them to a branch first to give a branch-scoped role."`.
- `branchAssignmentCount`: `(2, false, null)` → `'2'`; `(500, true, null)` →
  `'At least 500 (partial)'`; `(1, false, 'Westlands Branch')` → `'1 at Westlands Branch'`;
  `(3, true, 'Westlands Branch')` → `'At least 3 at Westlands Branch (partial)'` (a capped scan stays
  partial in a branch context: the selected branch can hold more than 500 ACTIVE assignments).
- `pageOfItems` over 23 items: page 2 of size 10 → 3 items, `{ number: 2, size: 10, totalItems: 23, totalPages: 3, hasNext: false, hasPrevious: true }`; page 3 → no items and
  `lastPageIfPastEnd(page)` is 2; no items → `totalPages: 0`.
- `parseUserId`: lower-cases `10000000-0000-4000-8000-00000000000D`; `null` for `'not-a-uuid'`,
  `'../x'`, `''` and a UUID followed by `x`.

- [ ] **Step 7: Run it to verify it fails** — form U. Expected: FAIL (module not found).

- [ ] **Step 8: Implement `user-rules.ts`**

```ts
import { can, canAll, canAny, type PermissionHolder } from '@/auth/permissions';
import { humanizeEnum, type StatusTone } from '@/components/data-display/status-chip';
import { UUID_PATTERN, type Page } from '@/lib/api/wire';
import type { MembershipStatus, UserStatus } from './user-contract';

export type OnboardingKey =
  | 'AWAITING_APPROVAL'
  | 'PROVISIONING_IDENTITY'
  | 'AWAITING_FIRST_SIGN_IN'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'ACCOUNT_BLOCKED'
  | 'ACCOUNT_NOT_READY';

export interface OnboardingState {
  key: OnboardingKey;
  label: string;
  tone: StatusTone;
}

const NOT_READY: readonly UserStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'PROVISIONING_IDP'];
// Contract §F: approval and sign-in need the account ACTIVE or INVITED.
const BLOCKED: readonly UserStatus[] = [
  'SUSPENDED',
  'LOCKED',
  'DEACTIVATING',
  'DEACTIVATED',
  'ARCHIVED',
];

function accountBlocked(user: UserStatus): OnboardingState {
  return {
    key: 'ACCOUNT_BLOCKED',
    label: `Account ${humanizeEnum(user).toLowerCase()}`,
    tone: 'error',
  };
}

/** A user status in words: `humanizeEnum` would print "Provisioning idp". */
export function userStatusLabel(status: UserStatus): string {
  return status === 'PROVISIONING_IDP' ? 'Provisioning identity' : humanizeEnum(status);
}

/** Spec §10.5's onboarding table (contract §F), made total over every status pair. */
export function onboardingState(membership: MembershipStatus, user: UserStatus): OnboardingState {
  switch (membership) {
    case 'REVOKED':
      return { key: 'REVOKED', label: 'Revoked', tone: 'error' };
    case 'SUSPENDED':
      return { key: 'SUSPENDED', label: 'Suspended', tone: 'error' };
    case 'PENDING_APPROVAL':
      // Approval already ran for a PROVISIONING_IDP user (BG-11); a blocked account can't be
      // approved (a 500); any other account waits.
      if (user === 'PROVISIONING_IDP') {
        return { key: 'PROVISIONING_IDENTITY', label: 'Provisioning identity', tone: 'warning' };
      }
      return BLOCKED.includes(user)
        ? accountBlocked(user)
        : { key: 'AWAITING_APPROVAL', label: 'Awaiting approval', tone: 'warning' };
    case 'ACTIVE':
      if (user === 'ACTIVE') return { key: 'ACTIVE', label: 'Active', tone: 'success' };
      if (user === 'INVITED') {
        return { key: 'AWAITING_FIRST_SIGN_IN', label: 'Awaiting first sign-in', tone: 'info' };
      }
      return NOT_READY.includes(user)
        ? { key: 'ACCOUNT_NOT_READY', label: 'Account not ready', tone: 'warning' }
        : accountBlocked(user);
  }
}

export interface OnboardingStep {
  label: string;
  detail: string;
  /** Always a word, never colour alone (WCAG 1.4.1). */
  state: { label: string; tone: StatusTone };
}

export type OnboardingProgress =
  { kind: 'steps'; steps: OnboardingStep[]; note: string | null } | { kind: 'note'; note: string };

const STEPS = [
  { label: 'Invited', detail: 'The membership is created and waits for approval.' },
  { label: 'Approved', detail: 'A different administrator approves it.' },
  {
    label: 'Identity provisioned',
    detail: 'Their sign-in identity is created and the invitation is sent.',
  },
  { label: 'First sign-in', detail: 'They sign in to this institution for the first time.' },
] as const;

const DONE = { label: 'Done', tone: 'success' } as const;
const WAITING = { label: 'Waiting', tone: 'warning' } as const;
const IN_PROGRESS = { label: 'In progress', tone: 'warning' } as const;
const NOT_STARTED = { label: 'Not started', tone: 'default' } as const;

const PROGRESS: Partial<Record<OnboardingKey, { done: number; next: OnboardingStep['state'] }>> = {
  AWAITING_APPROVAL: { done: 1, next: WAITING },
  PROVISIONING_IDENTITY: { done: 2, next: IN_PROGRESS },
  AWAITING_FIRST_SIGN_IN: { done: 3, next: WAITING },
  ACTIVE: { done: 4, next: WAITING },
};

export const PROVISIONING_NOTE =
  "Approval ran, and their sign-in identity is being created. The invitation is sent when it completes. If it stays here, identity provisioning may be switched off on the platform, and it can't be retried from here.";

/** The Overview's onboarding card. Derived from the two statuses only: the API exposes no
 * invitation record or timestamps (BG-11). Once onboarding has stopped, a sentence replaces the
 * steps rather than guessing which ones happened. */
export function onboardingProgress(
  membership: MembershipStatus,
  user: UserStatus,
): OnboardingProgress {
  const state = onboardingState(membership, user);
  const progress = PROGRESS[state.key];
  if (progress) {
    return {
      kind: 'steps',
      steps: STEPS.map((step, index) => ({
        ...step,
        state: index < progress.done ? DONE : index === progress.done ? progress.next : NOT_STARTED,
      })),
      note: state.key === 'PROVISIONING_IDENTITY' ? PROVISIONING_NOTE : null,
    };
  }
  switch (state.key) {
    case 'SUSPENDED':
      return {
        kind: 'note',
        note: "The membership is suspended, so they can't sign in to this institution until it's reactivated.",
      };
    case 'REVOKED':
      return {
        kind: 'note',
        note: "The membership is revoked. This is permanent: this email can't be invited to this institution again.",
      };
    case 'ACCOUNT_BLOCKED':
      return {
        kind: 'note',
        note: `Their account is ${humanizeEnum(user).toLowerCase()} on the platform, so they can't sign in to any institution.`,
      };
    default:
      return {
        kind: 'note',
        note: "The membership is active, but their account isn't ready to sign in yet.",
      };
  }
}

export type MembershipAction = 'approve' | 'reject' | 'suspend' | 'reactivate' | 'revoke';

const ACTIONS_BY_STATUS: Record<MembershipStatus, readonly MembershipAction[]> = {
  PENDING_APPROVAL: ['approve', 'reject'],
  ACTIVE: ['suspend', 'revoke'],
  SUSPENDED: ['reactivate', 'revoke'],
  REVOKED: [],
};

// Reject & revoke is the revoke endpoint (D12, contract §E.3).
const PERMISSION: Record<MembershipAction, string> = {
  approve: 'user.approve',
  reject: 'membership.revoke',
  suspend: 'membership.suspend',
  reactivate: 'membership.reactivate',
  revoke: 'membership.revoke',
};

const LIFECYCLE_CODES = [...new Set(Object.values(PERMISSION))];

export interface MembershipSubject {
  membershipStatus: MembershipStatus;
  userStatus: UserStatus;
  /** The signed-in user's own record (the backend's id, Ruling 6). */
  self: boolean;
  /** The signed-in user is the `user.invite` actor; false when unknown (BG-08). */
  invitedByMe: boolean;
}

/** The hero's actions, in display order. Every transition reads the membership back, so the
 * `membership.view` gate runs first (BG-31); then the status; then each action's own code. Approve
 * is withheld once approval ran (re-approving a PROVISIONING_IDP user is a 500, BG-07). */
export function availableMembershipActions(
  status: Pick<MembershipSubject, 'membershipStatus' | 'userStatus'>,
  holder: PermissionHolder,
): MembershipAction[] {
  if (!can(holder, 'membership.view')) return [];
  return ACTIONS_BY_STATUS[status.membershipStatus].filter(
    (action) =>
      can(holder, PERMISSION[action]) &&
      !(action === 'approve' && status.userStatus === 'PROVISIONING_IDP'),
  );
}

export const NO_MEMBERSHIP_VIEW =
  "Membership actions need permission to view memberships, which your role doesn't include.";
export const MEMBERSHIP_MISSING =
  "This user's membership couldn't be found, so its actions aren't available.";
export const MEMBERSHIP_UNAVAILABLE =
  "This user's membership couldn't be loaded, so its actions aren't available. Refresh to try again.";
export const OWN_MEMBERSHIP =
  "You can't suspend or revoke your own membership. Ask another administrator.";
export const USER_MAKER_CHECKER_BLOCKED =
  'You invited this user, so another administrator must approve them.';

export function accountBlockedNote(user: UserStatus): string {
  return `Their account is ${humanizeEnum(user).toLowerCase()} on the platform, so this membership can't be approved.`;
}

/** The offered actions that are contextually blocked, each with the caption that says why: shown
 * disabled, not hidden (spec §6.6), like the inviter's Approve (spec §10.5). */
export function blockedMembershipActions(
  actions: readonly MembershipAction[],
  subject: MembershipSubject,
): Partial<Record<MembershipAction, string>> {
  const blocked: Partial<Record<MembershipAction, string>> = {};
  for (const action of actions) {
    if (action === 'approve' && BLOCKED.includes(subject.userStatus)) {
      blocked.approve = accountBlockedNote(subject.userStatus); // contract §F, else a 500
    } else if (action === 'approve' && subject.invitedByMe) {
      blocked.approve = USER_MAKER_CHECKER_BLOCKED; // maker-checker (BG-08)
    } else if ((action === 'suspend' || action === 'revoke') && subject.self) {
      blocked[action] = OWN_MEMBERSHIP; // Ruling 6, BG-35
    }
  }
  return blocked;
}

/** The email lookup's outcome (Ruling 7): a miss within the ceiling isn't a failure. */
export type MembershipLookup = 'found' | 'missing' | 'failed';

/** Why the hero has no actions the holder's codes suggest; null when nothing needs saying
 * (including for a holder with no lifecycle code at all). */
export function membershipActionsNote(
  holder: PermissionHolder,
  lookup: MembershipLookup,
): string | null {
  if (!canAny(holder, LIFECYCLE_CODES)) return null;
  if (!can(holder, 'membership.view')) return NO_MEMBERSHIP_VIEW;
  if (lookup === 'missing') return MEMBERSHIP_MISSING;
  return lookup === 'failed' ? MEMBERSHIP_UNAVAILABLE : null;
}

/** A REVOKED membership takes no assignment (409). The role select reads `getRoleIndex`, which
 * needs `role.view`. */
export function canAssignUserRole(status: MembershipStatus, holder: PermissionHolder): boolean {
  return status !== 'REVOKED' && canAll(holder, ['user.assign_role', 'role.view']);
}

/** The write reads back `branch_assignment.view` (BG-31); the branch select needs `branch.view`. */
export function canAssignUserBranch(status: MembershipStatus, holder: PermissionHolder): boolean {
  return (
    status !== 'REVOKED' &&
    canAll(holder, ['user.assign_branch', 'branch_assignment.view', 'branch.view'])
  );
}

export const ACCESS_DESCRIPTION =
  'Roles this user holds. Institution scope applies everywhere; branch scope only while that branch is selected.';
export const NO_ACTIVE_ROLES =
  'There are no active roles to assign. Create or activate one under Roles & permissions.';
export const PARTIAL_SCAN_NOTE =
  "This list may be incomplete: the platform can't filter branch assignments by user, so only the first 500 branch assignments were checked.";

/** `canSwitch`: the signed-in user has more than one ACTIVE branch, so All branches is open. */
export function branchContextNote(branchName: string, canSwitch: boolean): string {
  return canSwitch
    ? `Only ${branchName} is visible with a branch selected. Switch to All branches to see this user's other branch assignments.`
    : `Only ${branchName} is visible: your account is assigned to this branch only, so this user's other branch assignments can't be shown.`;
}

/** A select's option (structurally 09's `BranchOption`). */
export interface SelectOption {
  id: string;
  label: string;
}

/** BRANCH scope needs an existing ACTIVE assignment at that branch (else 409), and in a branch
 * context only the selected branch is reachable (§E.4). A branch held twice is offered once. */
export function roleScopeBranches(
  rows: readonly { branchId: string }[],
  selectedBranchId: string | null,
  label: (branchId: string) => string,
): SelectOption[] {
  return [...new Set(rows.map((row) => row.branchId))]
    .filter((id) => selectedBranchId === null || id === selectedBranchId)
    .map((id) => ({ id, label: label(id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Why "One branch" is disabled, or undefined while a branch is on offer. `truncated` is the scan's
 * ceiling flag: a user held outside the window looks unassigned, so the hint says the scan was
 * partial instead of claiming they have no branch (Ruling 8). */
export function roleScopeHint(input: {
  readable: boolean;
  offered: number;
  truncated: boolean;
  selectedBranchName: string | null;
}): string | undefined {
  if (input.offered > 0) return undefined;
  if (!input.readable) {
    return "Their branch assignments can't be read here, so only institution scope is available.";
  }
  if (input.truncated) {
    return 'Only the first 500 branch assignments were checked and none of theirs was among them, so only institution scope is offered here.';
  }
  if (input.selectedBranchName) {
    return `They aren't assigned to ${input.selectedBranchName}. Assign them there first to give a branch-scoped role.`;
  }
  return 'Assign them to a branch first to give a branch-scoped role.';
}

export function branchAssignmentCount(
  count: number,
  truncated: boolean,
  selectedBranchName: string | null,
): string {
  // A capped scan is partial in a branch context too: the backend forces the search to the selected
  // branch (§E.4), and a branch with more than 500 ACTIVE assignments can hide the user's row.
  if (selectedBranchName) {
    return truncated
      ? `At least ${count} at ${selectedBranchName} (partial)`
      : `${count} at ${selectedBranchName}`;
  }
  return truncated ? `At least ${count} (partial)` : String(count);
}

/** Server-side paging of a bounded, already filtered list (the scan's rows for one user), so the
 * URL holds page and size like every other list (AGENTS.md). */
export function pageOfItems<T>(
  items: readonly T[],
  paging: { page: number; size: number },
): Page<T> {
  const start = paging.page * paging.size;
  return {
    items: items.slice(start, start + paging.size),
    page: {
      number: paging.page,
      size: paging.size,
      totalItems: items.length,
      totalPages: Math.ceil(items.length / paging.size),
      hasNext: start + paging.size < items.length,
      hasPrevious: paging.page > 0,
    },
  };
}

/** The record route's id (spec §6.8), canonicalised to lower case (contract §A) so the reads, the
 * audit filters and the self check all see the backend's form. null → not found, before any read. */
export function parseUserId(param: string): string | null {
  return UUID_PATTERN.test(param) ? param.toLowerCase() : null;
}
```

- [ ] **Step 9: Re-point `user-search-service.ts`.** Delete its local `tenantUserSchema` and the
      `ponytail:` comment; parse with `userPageSchema` from `./user-contract` and map each
      `UserSummary` to `TenantUserOption` (`id`, `displayName`, `email`, `username`,
      `membershipStatus`). Its test passes unchanged.

- [ ] **Step 10: Run the tests** — form U on the four test files. Expected: PASS.

- [ ] **Step 11: Commit** (form C)

`git add modules/administration/users`

```
feat(users): add the users contract, directory query and onboarding rules

The contract parses user and membership summaries and the membership detail with strict enums.
The rules derive the onboarding state for every status pair, the onboarding timeline, the hero's
membership actions (the membership.view gate first, then status, then each code), the captions of
disabled ones and the notes for missing ones, and the record's id check. User search now parses the same schema.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

---

### Task 2: Users service, membership Server Actions, and named assign messages

**Files:**

- Create: `modules/administration/users/user-service.ts`, `user-service.test.ts`
- Create: `modules/administration/users/membership-actions.ts`, `membership-actions.test.ts`
- Modify: `modules/administration/roles/role-actions.ts` (the `assignInput` `roleId` only) and
  `role-actions.test.ts`
- Modify: `modules/administration/branches/branch-actions.ts` (the `assignInput` `branchId` only) and
  `branch-actions.test.ts`

**Interfaces:**

- Consumes: Task 1's schemas and `userListApiPath`; `apiGet`, `apiPost`; `toQueryString`;
  `uuidSchema`, `UUID_PATTERN`; `runServerAction`, `type ActionResult`; `explain`;
  `listAuditEvents(query)`; 09's `listRoleAssignments(filter, paging)`; 08's
  `branchAssignmentPageSchema`, `type BranchAssignment`.
- Produces (★ = consumed by 12):
  - `listUsers(query: UserListQuery): Promise<Page<UserSummary>>`;
  - `getUser = cache((userId: string) => Promise<UserSummary>)` (rejects a malformed id before any
    call);
  - ★ `findUserMembership = cache((userId: string, email: string) => Promise<MembershipSummary | null>)`;
  - `getMembership = cache((membershipId: string) => Promise<MembershipDetail>)`;
  - ★ `listUserBranchAssignments = cache((userId: string) => Promise<UserBranchScan>)` with
    `interface UserBranchScan { items: BranchAssignment[]; truncated: boolean }`;
  - ★ `getUserInviter(userId: string): Promise<string | null>`;
  - `countUserRoleAssignments(userId: string): Promise<number | null>`;
  - ★ Server Actions `approveMembership`, `suspendMembership`, `reactivateMembership`,
    `revokeMembership`, each `(previous: ActionResult | null, formData: FormData) => Promise<ActionResult>`, reading `idempotencyKey`, `membershipId` and (except approve) `reason`;
  - copy `APPROVE_FORBIDDEN`, `APPROVE_FAILED`, `REVOKE_FAILED` (local to the actions file; tests
    assert the literal text).

- [ ] **Step 1: Write the failing service test** — `user-service.test.ts`. Mock
      `@/lib/api/tenant-api` (`apiGet: (path, schema) => schema.parse(next wire)` with
      `mockImplementationOnce` per page), `@/modules/administration/audit/audit-service`
      (`listAuditEvents`) and `@/modules/administration/roles/role-service` (`listRoleAssignments`).
      Key cases:

```ts
it('matches the membership by user id, never the first hit', async () => {
  // q=ann.mwangi@… also matches joann.mwangi@… (a substring), and Joann comes first.
  apiGet.mockImplementationOnce(page([membershipWire(JOANN), membershipWire(ANN)], false));
  expect((await findUserMembership(ANN, 'ann.mwangi@greenfield.example'))?.userId).toBe(ANN);
  expect(apiGet).toHaveBeenCalledWith(
    '/api/v1/tenant/memberships?q=ann.mwangi%40greenfield.example&page=0&size=100',
    membershipPageSchema,
  );
});

it('scans at most five pages of 100, then gives up with null', async () => {
  apiGet.mockImplementation(page([membershipWire(JOANN)], true));
  expect(await findUserMembership(ANN, 'ann.mwangi@greenfield.example')).toBeNull();
  expect(apiGet).toHaveBeenCalledTimes(5);
  expect(apiGet.mock.lastCall?.[0]).toContain('page=4&size=100');
});
```

Also: "stops at the last page" (one call, `null`); "matches an upper-case user id against the
backend's lower-case one"; "skips the read for a blank email" (`null`, no call); "rejects when a page
fails" (the rejection reaches the caller's `load()`); `listUsers` "reads the directory path with the
user page schema" (`toHaveBeenCalledWith(userListApiPath(query), userPageSchema)`, schema identity,
not `expect.anything()`); `getUser`/`getMembership` "reject a malformed id before any call" (`'../x'`;
`apiGet` not called); `listUserBranchAssignments` "keeps only the user's rows across pages"
(path `/api/v1/tenant/branch-assignments?status=ACTIVE&page=0&size=100`, never a `branch_id`),
"keeps a row repeated across pages once" (the same id on pages 0 and 1 → one item), "marks the scan truncated when the fifth page still has more" (5 calls, `truncated: true`) and "is
complete when a page ends the scan" (`truncated: false`); `getUserInviter` "reads the user.invite
event's actor" (`listAuditEvents` called with `{ entityType: 'USER', entityId: USER, action: 'user.invite', page: 0, size: 1 }`) and "is null when the audit read fails";
`countUserRoleAssignments` "counts ACTIVE assignments with one size-1 read"
(`listRoleAssignments({ userId: USER, status: 'ACTIVE' }, { page: 0, size: 1 })`) and "is null when
unreadable".

- [ ] **Step 2: Run it to verify it fails** — form U. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `user-service.ts`**

```ts
import 'server-only';
import { cache } from 'react';
import { toQueryString } from '@/lib/api/query-string';
import { apiGet } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import { listAuditEvents } from '@/modules/administration/audit/audit-service';
import {
  branchAssignmentPageSchema,
  type BranchAssignment,
} from '@/modules/administration/branches/branch-contract';
import { listRoleAssignments } from '@/modules/administration/roles/role-service';
import {
  membershipDetailSchema,
  membershipPageSchema,
  userPageSchema,
  userSummarySchema,
  type MembershipSummary,
} from './user-contract';
import { userListApiPath, type UserListQuery } from './user-query';

export function listUsers(query: UserListQuery) {
  return apiGet(userListApiPath(query), userPageSchema);
}

/** One read per request: the record layout and its tabs share it. `async`, so a malformed id
 * rejects (a `load()` failure) instead of throwing synchronously past `load()`. */
export const getUser = cache(async (userId: string) => {
  const id = uuidSchema.parse(userId);
  return await apiGet(`/api/v1/tenant/users/${id}`, userSummarySchema);
});

const SCAN_PAGE_SIZE = 100;
// ponytail: at most 5 pages of 100 per scan, like the lookup indexes (spec §6.3). The backend has
// no user_id filter on memberships or branch assignments (BG-09).
const SCAN_PAGES = 5;

/** BG-09: memberships can't be filtered by user. `q` is a case-insensitive substring over username,
 * email and name, with `%` and `_` as wildcards (contract §A), so the hits are a superset: match
 * the user id exactly, never the first hit. null when not found within the ceiling. */
export const findUserMembership = cache(
  async (userId: string, email: string): Promise<MembershipSummary | null> => {
    const id = uuidSchema.parse(userId).toLowerCase();
    const q = email.trim();
    if (!q) return null;
    for (let page = 0; page < SCAN_PAGES; page += 1) {
      const result = await apiGet(
        `/api/v1/tenant/memberships${toQueryString({ q, page, size: SCAN_PAGE_SIZE })}`,
        membershipPageSchema,
      );
      const match = result.items.find((membership) => membership.userId.toLowerCase() === id);
      if (match) return match;
      if (!result.page.hasNext) return null;
    }
    return null;
  },
);

export const getMembership = cache(async (membershipId: string) => {
  const id = uuidSchema.parse(membershipId);
  return await apiGet(`/api/v1/tenant/memberships/${id}`, membershipDetailSchema);
});

export interface UserBranchScan {
  items: BranchAssignment[];
  /** The ceiling was reached with more rows unread: the list may be incomplete. */
  truncated: boolean;
}

/** BG-09: branch assignments have no user_id filter. With a branch selected the backend forces the
 * search to that branch (§E.4), so the result is that branch's rows only. 12 reuses it. */
export const listUserBranchAssignments = cache(async (userId: string): Promise<UserBranchScan> => {
  const id = uuidSchema.parse(userId).toLowerCase();
  // By id: the order is unspecified (`sort_*` is ignored), so a row can repeat across pages.
  const rows = new Map<string, BranchAssignment>();
  for (let page = 0; page < SCAN_PAGES; page += 1) {
    const result = await apiGet(
      `/api/v1/tenant/branch-assignments${toQueryString({ status: 'ACTIVE', page, size: SCAN_PAGE_SIZE })}`,
      branchAssignmentPageSchema,
    );
    for (const row of result.items) if (row.userId.toLowerCase() === id) rows.set(row.id, row);
    if (!result.page.hasNext) return { items: [...rows.values()], truncated: false };
  }
  return { items: [...rows.values()], truncated: true };
});

/** BG-08: the inviter is only in the audit log (`user.invite`, contract §G maker lookups); null
 * without `audit.view` or when no event is readable (08's getBranchMaker). */
export async function getUserInviter(userId: string): Promise<string | null> {
  try {
    const events = await listAuditEvents({
      entityType: 'USER',
      entityId: userId,
      action: 'user.invite',
      page: 0,
      size: 1,
    });
    return events.items[0]?.actorUserId ?? null;
  } catch {
    return null;
  }
}

/** BG-15: one `size=1` read; null when unreadable. */
export async function countUserRoleAssignments(userId: string): Promise<number | null> {
  try {
    const page = await listRoleAssignments({ userId, status: 'ACTIVE' }, { page: 0, size: 1 });
    return page.page.totalItems;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Write the failing actions test** — `membership-actions.test.ts`. Mock
      `@/lib/api/tenant-api` (`apiPost`) and `@/lib/api/action-result` as
      `role-actions.test.ts` does, but with a validating pass-through, so a schema failure returns a
      result instead of throwing:

```ts
runServerAction.mockImplementation(async (schema: z.ZodType, formData: FormData, run: Run) => {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      formError: 'invalid',
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
      ),
      code: 'validation_failed',
      requestId: null,
    };
  }
  await run(parsed.data);
  return { ok: true };
});

it('approves with an empty body on the activate path, forwarding the form key', async () => {
  await actions.approveMembership(null, form({ idempotencyKey: KEY, membershipId: MEMBERSHIP }));
  expect(apiPost).toHaveBeenCalledWith(
    `/api/v1/tenant/memberships/${MEMBERSHIP}/activate`,
    {},
    KEY,
  );
});

it('explains an approve 403 as permission or maker-checker, keeping the reference', async () => {
  runServerAction.mockResolvedValueOnce(failure('forbidden'));
  expect(await actions.approveMembership(null, form({}))).toEqual({
    ...failure('forbidden'),
    formError:
      "You can't approve this user. Your role may not allow it, or you invited them — a different administrator must approve them.",
  });
});

it('refuses a suspend reason under 3 characters after trimming, before any call', async () => {
  const result = await actions.suspendMembership(
    null,
    form({ idempotencyKey: KEY, membershipId: MEMBERSHIP, reason: '  a  ' }),
  );
  expect(result).toMatchObject({
    ok: false,
    fieldErrors: { reason: 'Give a reason of at least 3 characters.' },
  });
  expect(apiPost).not.toHaveBeenCalled();
});
```

Plus: "explains an approve 500 with the likely causes" (exact `APPROVE_FAILED` text below,
`requestId: 'req-1'` kept); "suspends with the trimmed reason" (body `{ reason: 'Cash audit' }` for
`'  Cash audit  '`); "reactivates with {} for a blank reason and { reason } otherwise"; "revokes
with the reason" (path `/revoke`, body `{ reason: 'Left the SACCO' }`); "explains a revoke 500 as
possibly already revoked" (exact `REVOKE_FAILED`); "refuses a malformed membership id with no backend
call" (`membershipId: '../x'` → `fieldErrors.membershipId` set, `apiPost` not called); "refuses a
reason over 500 characters" (`'x'.repeat(501)` → `'Keep the reason under 500 characters.'`);
"leaves other failure codes alone" (`failure('conflict')` from suspend is returned unchanged).

- [ ] **Step 5: Implement `membership-actions.ts`**

```ts
'use server';

import { z } from 'zod';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiPost } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';

const idempotencyKey = z.uuid();
const membershipInput = z.object({ idempotencyKey, membershipId: uuidSchema });

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

// BG-08: a maker-checker refusal is the same 403 as a missing permission — never assert which.
const APPROVE_FORBIDDEN =
  "You can't approve this user. Your role may not allow it, or you invited them — a different administrator must approve them.";
// BG-07: missing prerequisites, a membership that is no longer pending and a re-approval are 500s.
const APPROVE_FAILED =
  "The approval couldn't complete. They may still need an active role and, for staff and admin members, an active branch assignment, or approval may already have run. Refresh and check.";
const REVOKE_FAILED =
  "This membership couldn't be revoked. It may already be revoked — refresh and check.";

function transition(
  path: 'activate' | 'suspend' | 'reactivate' | 'revoke',
  schema: z.ZodType<{ idempotencyKey: string; membershipId: string; reason?: string }>,
  formData: FormData,
): Promise<ActionResult> {
  return runServerAction(schema, formData, (input) =>
    apiPost(
      `/api/v1/tenant/memberships/${input.membershipId}/${path}`,
      input.reason ? { reason: input.reason } : {},
      input.idempotencyKey,
    ),
  );
}

/** The activate endpoint reads no body (contract §E.3): `{}` is sent. 200 = ACTIVE, 202 =
 * identity provisioning queued; the refreshed record shows which (Ruling 9). 12 reuses it. */
export async function approveMembership(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await transition('activate', membershipInput, formData);
  return explain(explain(result, 'forbidden', APPROVE_FORBIDDEN), 'internal_error', APPROVE_FAILED);
}

export async function suspendMembership(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transition('suspend', membershipInput.extend({ reason: requiredReason }), formData);
}

export async function reactivateMembership(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transition('reactivate', membershipInput.extend({ reason: optionalReason }), formData);
}

/** Revoke and Reject & revoke (D12): terminal; every assignment goes with it (BG-28). 12 reuses it. */
export async function revokeMembership(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await transition(
    'revoke',
    membershipInput.extend({ reason: requiredReason }),
    formData,
  );
  return explain(result, 'internal_error', REVOKE_FAILED);
}
```

If the `z.ZodType<…>` parameter fights zod's input/output typing, type `schema` as
`typeof membershipInput | typeof suspendInput | typeof reactivateInput` with named consts, as
`branch-actions.ts`'s `transition` does; the bodies and messages above are what the tests pin.

- [ ] **Step 6: Name a missing role and a missing branch in the assign actions** (carry-in c; 09
      final review Minor 2). In `role-actions.ts`'s `assignInput`, `roleId: uuidSchema` becomes
      `roleId: z.string().regex(UUID_PATTERN, 'Choose a role.')` (layer 10 shows it as a visible
      select). In `branch-actions.ts`'s `assignInput`, `branchId: uuidSchema` becomes
      `branchId: z.string().regex(UUID_PATTERN, 'Choose a branch.')` (layer 10 shows it as a
      visible select). Nothing else changes. Tests, one per file, capture the schema the action hands
      to `runServerAction`:

```ts
it("names a missing role, for the user record's visible role select", async () => {
  let schema: z.ZodType | undefined;
  runServerAction.mockImplementationOnce((given: z.ZodType) => {
    schema = given;
    return Promise.resolve({ ok: true });
  });
  await actions.assignRole(null, form({}));
  const parsed = schema?.safeParse({
    idempotencyKey: KEY,
    roleId: '',
    userId: USER,
    scopeType: 'TENANT',
  });
  expect(parsed?.error?.issues).toContainEqual(
    expect.objectContaining({ path: ['roleId'], message: 'Choose a role.' }),
  );
});
```

and the same for `assignBranchUser` (`{ idempotencyKey, branchId: '', userId, assignmentType: 'OPERATE' }` → `path: ['branchId'], message: 'Choose a branch.'`).

- [ ] **Step 7: Run the tests** — form U on `modules/administration/users`,
      `modules/administration/roles/role-actions.test.ts` and
      `modules/administration/branches/branch-actions.test.ts`. Expected: PASS.

- [ ] **Step 8: Commit** (form C) — two commits:

`git add modules/administration/roles/role-actions.ts modules/administration/roles/role-actions.test.ts modules/administration/branches/branch-actions.ts modules/administration/branches/branch-actions.test.ts`

```
fix(admin): name a missing role or branch in the assign actions

The user record shows the role and the branch as visible selects, so a missing choice now reads
"Choose a role." or "Choose a branch." instead of zod's pattern message.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

`git add modules/administration/users`

```
feat(users): add the users service and the membership Server Actions

The service lists and reads users, resolves a user's membership by an email search matched on the
user id, scans branch assignments within a bounded ceiling (flagged truncated), and looks up the
inviter. The actions approve, suspend, reactivate and revoke a membership with the form's key,
and name the maker-checker refusal and the known 500s.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

---

### Task 3: Fake API memberships, the users scenarios, and the fake spec

**Files:**

- Modify: `e2e/fake-api/state.mts` (two optional fields)
- Modify: `e2e/fake-api/http.mts` (export `reasonField`, moved from `routes/branches.mts`) and
  `e2e/fake-api/routes/branches.mts` (import it; behaviour unchanged)
- Create: `e2e/fake-api/routes/memberships.mts`
- Modify: `e2e/fake-api/server.mts` (register `...membershipRoutes` last)
- Modify: `e2e/fake-api/scenarios.mts` (`USER_SCENARIO_IDS`, `usersScenario()`, four `BUILDERS`
  entries last)
- Create: `e2e/support/fake-api.ts` (`api`, `contextFor`, lifted from `fake-api-roles.spec.ts`)
- Create: `e2e/fake-api-users.spec.ts`

**Interfaces:**

- Consumes: `requireContext`, `requirePermission`, `requireTenantContext`, `activeAssignmentRows`
  (`access.mts`); `recordAuditEvent`; `objectBody`, `pageOf`, `problem`, `readBody`, `sendJson`,
  `stringField`; `sendIdempotent(context, body, produce, status)`; `route`; the private
  `greenfieldTenant()`, `membership()`, `assignment()`, `role()`, `tenantRoleAssignment()`,
  `withoutPermission()`, `CREATED`, `UPDATED`, `IDS` in `scenarios.mts`.
- Produces:
  - `FakeUser.identityLinked?: boolean` (absent = linked) and `FakeMembership.invitedBy?: string`;
  - `export function reasonField(body, required): string | null` (`http.mts`);
  - `membershipRoutes: Route[]`;
  - `USER_SCENARIO_IDS` (below), scenarios `'users'`, `'users-limited'`, `'users-read-only'`,
    `'users-many-assignments'`;
  - `e2e/support/fake-api.ts`: `FAKE_API_URL`, `api(path: string): string`,
    `contextFor(request: APIRequestContext, scenario: string, branchId: string | null): Promise<Record<string, string>>`.

- [ ] **Step 1: Write the failing fake spec** — `e2e/fake-api-users.spec.ts`, using
      `contextFor(request, 'users', null)` from `./support/fake-api` (each test its own run). Test
      names and key assertions:
  1. "lists memberships by a substring search, newest first, with no names" —
     `GET /tenant/memberships?q=ann.mwangi@greenfield.example` → 2 items, `items[0].user_id === USERS.joann`, `items[1].user_id === USERS.ann`; `Object.keys(items[0])` equals
     `['id', 'user_id', 'membership_status', 'membership_type', 'primary_branch_id']`;
     `membership_status=SUSPENDED` → only Gladys; `membership_type=AUDITOR` → only Wanjiru;
     `sort_by=bogus` → 200 (ignored).
  2. "treats % and _ in q as wildcards (contract §A)" — `q=a_n.mwangi` → 2 items.
  3. "reads one membership with its identity and dates; an unknown id is a 404" — Felix's detail has
     `membership_type: 'STAFF'`, `created_at: '2026-07-01T08:00:00Z'`; a fresh UUID → 404
     `resource_not_found`.
  4. "approves: 202 queues identity provisioning, a replay returns the stored 202, and a new key's
     re-approval is a 500" — Amina's activate with key K → 202, body `membership_status: 'PENDING_APPROVAL'`, `user_status: 'PROVISIONING_IDP'`; the same K → 202 with
     `Idempotency-Replayed: true`; a new key → 500 `internal_error`.
  5. "approves an account with an identity link straight to ACTIVE (200)" — Brian → 200,
     `membership_status: 'ACTIVE'`, `user_status: 'ACTIVE'`.
  6. "refuses the inviter (403) and rolls the key back" — Carol with key K → 403 `forbidden`; K again
     → 403 again (nothing stored).
  7. "answers a non-pending or unknown membership, or missing prerequisites, with a 500 (BG-07)" —
     Esther (ACTIVE) → 500; a fresh UUID → 500; Amina after
     `DELETE /tenant/role-assignments/<Amina's TENANT Teller>` (`USERS.aminaTeller`) → 500 (the
     control: test 4 proves Amina otherwise approves).
  8. "checks permission before state" — `contextFor(request, 'users-read-only', null)`; activate on
     Esther (not pending) → 403, not 500.
  9. "suspends and reactivates, refusing the wrong state with a 409" — Esther suspend
     `{ reason: 'Cash audit' }` → 200 `SUSPENDED`; again with a new key → 409 `conflict`; reactivate
     with **no body** → 200 `ACTIVE`; reactivate again → 409.
  10. "validates reasons and refuses unknown properties" — suspend Esther `{}` → 400 `invalid_json`;
      `{ reason: 'ab' }` → 400 `validation_failed` with `violations[0].field === 'reason'`;
      `{ reason: 'Cash audit', reasonText: 'x' }` → 400 `invalid_json`; then the control
      `{ reason: 'Cash audit' }` with a new key → 200 (rule 16).
  11. "revokes for good, cascading to every assignment; a second revoke is a 500" — Felix revoke
      `{ reason: 'Left the SACCO' }` → 200 `REVOKED`; `GET /tenant/role-assignments?user_id=<felix>&status=ACTIVE` → 0 items; `GET /tenant/branch-assignments?status=ACTIVE` has no Felix row;
      a second revoke with a new key → 500.
  12. "writes the audit rows the record's views read" — the test suspends Esther and revokes Felix
      itself (each test is its own run), then
      `GET /tenant/audit-events?entity_type=USER&entity_id=<esther>&action=membership.suspend` → 1
      item and `entity_type=MEMBERSHIP&entity_id=<felixMembership>&action=membership.revoke` → 1; the seed `entity_type=USER&entity_id=<amina>&action=user.invite` →
      `actor_id === USERS.victor`.
  13. "gates the routes on membership.view" — `contextFor(request, 'users-limited', null)`:
      `GET /tenant/memberships` → 403.
  14. "seeds a 100-character display name" — `GET /tenant/users/<wanjiru>` →
      `display_name.length === 100`.
  15. "pads users-many-assignments past the scan ceiling" — `GET /tenant/branch-assignments?status=ACTIVE&page=4&size=100` → `has_next: true`; page 0 holds Felix's 207.

- [ ] **Step 2: Run it to verify it fails** — form E on the spec. Expected: FAIL (the import of
      `USER_SCENARIO_IDS` fails first).

- [ ] **Step 3: Add the state fields** (`state.mts`):

```ts
export interface FakeUser {
  // …existing fields…
  /** Layer 10: approval answers 200 when the user already has an identity link, else 202 and the
   * user becomes PROVISIONING_IDP (contract §E.3). Absent = linked: existing literals stay valid. */
  identityLinked?: boolean;
}

export interface FakeMembership {
  // …existing fields…
  /** Layer 10 maker-checker (approver ≠ inviter); the real API keeps the inviter in the audit log. */
  invitedBy?: string;
}
```

- [ ] **Step 4: Move `reasonField`** from `routes/branches.mts` to `http.mts` (exported, body
      unchanged) and import it in `branches.mts`.

- [ ] **Step 5: Write `routes/memberships.mts`**

```ts
import {
  activeAssignmentRows,
  requireContext,
  requirePermission,
  requireTenantContext,
} from '../access.mts';
import type { AccessContext } from '../access.mts';
import { recordAuditEvent } from '../audit-log.mts';
import { objectBody, pageOf, problem, readBody, reasonField, sendJson } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { route } from '../router.mts';
import type { Route, RouteContext } from '../router.mts';
import type { FakeMembership, FakeUser } from '../state.mts';

const NEED_A_BRANCH = ['STAFF', 'ADMIN'];
const internalError = () => problem(500, 'internal_error', 'An unexpected error occurred.');

interface Member {
  membership: FakeMembership;
  user: FakeUser;
}

function tenantAccess(context: RouteContext): AccessContext {
  const access = requireContext(context);
  requireTenantContext(access);
  return access;
}

/** Contract §A: `q` is a case-insensitive substring in which `%` and `_` stay LIKE wildcards. */
function likeMatcher(q: string): RegExp {
  const pattern = [...q]
    .map((char) =>
      char === '%' ? '.*' : char === '_' ? '.' : char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');
  return new RegExp(pattern, 'i');
}

const summaryWire = (membership: FakeMembership) => ({
  id: membership.id,
  user_id: membership.userId,
  membership_status: membership.status,
  membership_type: membership.type,
  primary_branch_id: membership.primaryBranchId,
});

const detailWire = ({ membership, user }: Member) => ({
  id: membership.id,
  organisation_id: membership.organisationId,
  user_id: membership.userId,
  username: user.username,
  email: user.email,
  display_name: user.displayName,
  user_status: user.status,
  membership_status: membership.status,
  membership_type: membership.type,
  primary_branch_id: membership.primaryBranchId,
  created_at: membership.createdAt,
  updated_at: membership.updatedAt,
});

function memberOf(context: RouteContext, access: AccessContext): Member | null {
  const membership = context.state.memberships.find(
    (candidate) =>
      candidate.id === context.params.membership_id &&
      candidate.organisationId === access.organisation.id,
  );
  const user =
    membership && context.state.users.find((candidate) => candidate.id === membership.userId);
  return membership && user ? { membership, user } : null;
}

/** Suspend, reactivate and revoke: permission (and the BG-31 read-back) before any state check;
 * every state check inside `produce`, so a refusal stores nothing and a replay answers as before. */
function transition(
  path: 'suspend' | 'reactivate' | 'revoke',
  permission: string,
  reasonRequired: boolean,
  apply: (access: AccessContext, member: Member, reason: string | null) => void,
): Route {
  return route('POST', `/api/v1/tenant/memberships/:membership_id/${path}`, async (context) => {
    const access = tenantAccess(context);
    requirePermission(access, permission);
    requirePermission(access, 'membership.view'); // read-back (BG-31)
    const raw = await readBody(context.req);
    // Reactivate's body is optional; suspend and revoke need a reason (contract §D).
    const body = raw === undefined && !reasonRequired ? {} : objectBody(raw, ['reason']);
    const reason = reasonField(body, reasonRequired);
    if (reason !== null && reason.length > 500) {
      throw problem(400, 'validation_failed', 'Validation failed.', [
        { field: 'reason', code: 'Size', message: 'size must be between 0 and 500' },
      ]);
    }
    sendIdempotent(context, body, () => {
      const member = memberOf(context, access);
      if (!member) throw internalError(); // an unknown membership is a 500 (BG-07)
      apply(access, member, reason);
      member.membership.updatedAt = new Date().toISOString();
      return detailWire(member);
    });
  });
}

export const membershipRoutes: Route[] = [
  route('GET', '/api/v1/tenant/memberships', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'membership.view');
    const { query, state } = context;
    const q = query.get('q');
    const matcher = q ? likeMatcher(q) : null;
    const status = query.get('membership_status');
    const type = query.get('membership_type');
    const rows = state.memberships
      .filter((membership) => membership.organisationId === access.organisation.id)
      .flatMap((membership) => {
        const user = state.users.find((candidate) => candidate.id === membership.userId);
        return user ? [{ membership, user }] : [];
      })
      .filter(
        ({ membership, user }) =>
          (!matcher ||
            [user.username, user.email, user.displayName].some((value) => matcher.test(value))) &&
          (!status || membership.status === status) &&
          (!type || membership.type === type),
      )
      // `sort_*` is accepted and ignored (contract §E.3); newest first = reverse seed order, as the
      // fake's /tenant/users does.
      .reverse()
      .map(({ membership }) => summaryWire(membership));
    sendJson(context.res, 200, pageOf(rows, query));
  }),

  route('GET', '/api/v1/tenant/memberships/:membership_id', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'membership.view');
    const member = memberOf(context, access);
    if (!member) throw problem(404, 'resource_not_found', 'Membership not found.');
    sendJson(context.res, 200, detailWire(member));
  }),

  route('POST', '/api/v1/tenant/memberships/:membership_id/activate', async (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'user.approve');
    requirePermission(access, 'membership.view'); // read-back (BG-31)
    const raw = await readBody(context.req);
    // The endpoint reads no body: none or `{}`, and any property is refused (ApiJsonCodec).
    const body = raw === undefined ? {} : objectBody(raw, []);
    const target = memberOf(context, access);
    // Decided from the state before the change, so a replay answers with the stored status.
    const status = target?.user.identityLinked === false ? 202 : 200;
    sendIdempotent(
      context,
      body,
      () => {
        if (!target) throw internalError();
        const { membership, user } = target;
        // Not pending, or a re-approval of a provisioning user: 500 (BG-07, BG-11).
        if (membership.status !== 'PENDING_APPROVAL' || user.status === 'PROVISIONING_IDP') {
          throw internalError();
        }
        // Maker-checker (BG-08): inside `produce`, so the key rolls back.
        if (membership.invitedBy === access.claims.userId) {
          throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
        }
        const organisationId = access.organisation.id;
        const hasRole = context.state.roleAssignments.some(
          (row) =>
            row.userId === user.id &&
            row.organisationId === organisationId &&
            row.status === 'ACTIVE',
        );
        const hasBranch = activeAssignmentRows(context.state, user.id, organisationId).length > 0;
        // Missing prerequisites are a 500 too (contract §F, BG-07).
        if (!hasRole || (NEED_A_BRANCH.includes(membership.type) && !hasBranch)) {
          throw internalError();
        }
        if (user.identityLinked === false) {
          user.status = 'PROVISIONING_IDP'; // the membership stays PENDING_APPROVAL (202)
        } else {
          membership.status = 'ACTIVE';
          if (user.status === 'DRAFT') user.status = 'INVITED';
        }
        membership.updatedAt = new Date().toISOString();
        recordAuditEvent(context.state, access, {
          entityType: 'USER',
          entityId: user.id,
          action: 'user.approve',
          reason: null,
        });
        return detailWire(target);
      },
      status,
    );
  }),

  transition('suspend', 'membership.suspend', true, (access, { membership, user }, reason) => {
    if (membership.status !== 'ACTIVE') {
      throw problem(409, 'conflict', 'The membership must be ACTIVE.');
    }
    membership.status = 'SUSPENDED';
    // Suspend and reactivate are keyed by the user id, revoke by the membership id (BG-16).
    recordAuditEvent(access.state, access, {
      entityType: 'USER',
      entityId: user.id,
      action: 'membership.suspend',
      reason,
    });
  }),

  transition(
    'reactivate',
    'membership.reactivate',
    false,
    (access, { membership, user }, reason) => {
      if (membership.status !== 'SUSPENDED') {
        throw problem(409, 'conflict', 'The membership must be SUSPENDED.');
      }
      membership.status = 'ACTIVE';
      recordAuditEvent(access.state, access, {
        entityType: 'USER',
        entityId: user.id,
        action: 'membership.reactivate',
        reason,
      });
    },
  ),

  transition('revoke', 'membership.revoke', true, (access, { membership, user }, reason) => {
    if (membership.status === 'REVOKED') throw internalError(); // already revoked (BG-07)
    membership.status = 'REVOKED';
    // Terminal, and every assignment goes with it (contract §E.3).
    const mine = (row: { userId: string; organisationId: string; status: string }) =>
      row.userId === user.id &&
      row.organisationId === membership.organisationId &&
      row.status === 'ACTIVE';
    for (const row of access.state.branchAssignments.filter(mine)) row.status = 'REVOKED';
    for (const row of access.state.roleAssignments.filter(mine)) row.status = 'REVOKED';
    recordAuditEvent(access.state, access, {
      entityType: 'MEMBERSHIP',
      entityId: membership.id,
      action: 'membership.revoke',
      reason,
    });
  }),
];
```

Register `...membershipRoutes` as the last entry of `routes` in `server.mts`.

- [ ] **Step 6: Seed the scenarios** (`scenarios.mts`, the block above the `satisfies` comment;
      `BUILDERS` entries last, after `'platform-tenants'`, with `// Layer 10 (users).`):

```ts
/** Layer 10 seed IDs (lane rules §5). Assignments use …0002nn, role assignments …0003nn, audit
 * events …0004nn. */
export const USER_SCENARIO_IDS = {
  victor: '10000000-0000-4000-8000-000000000001',
  victorMembership: '10000000-0000-4000-8000-000000000002',
  amina: '10000000-0000-4000-8000-000000000003',
  aminaMembership: '10000000-0000-4000-8000-000000000004',
  brian: '10000000-0000-4000-8000-000000000005',
  brianMembership: '10000000-0000-4000-8000-000000000006',
  carol: '10000000-0000-4000-8000-000000000007',
  carolMembership: '10000000-0000-4000-8000-000000000008',
  daniel: '10000000-0000-4000-8000-000000000009',
  danielMembership: '10000000-0000-4000-8000-00000000000a',
  esther: '10000000-0000-4000-8000-00000000000b',
  estherMembership: '10000000-0000-4000-8000-00000000000c',
  felix: '10000000-0000-4000-8000-00000000000d',
  felixMembership: '10000000-0000-4000-8000-00000000000e',
  gladys: '10000000-0000-4000-8000-00000000000f',
  gladysMembership: '10000000-0000-4000-8000-000000000010',
  hassan: '10000000-0000-4000-8000-000000000011',
  hassanMembership: '10000000-0000-4000-8000-000000000012',
  wanjiru: '10000000-0000-4000-8000-000000000013',
  wanjiruMembership: '10000000-0000-4000-8000-000000000014',
  ann: '10000000-0000-4000-8000-000000000015',
  annMembership: '10000000-0000-4000-8000-000000000016',
  joann: '10000000-0000-4000-8000-000000000017',
  joannMembership: '10000000-0000-4000-8000-000000000018',
  teller: '10000000-0000-4000-8000-000000000019',
  supervisor: '10000000-0000-4000-8000-00000000001a',
  loansOfficer: '10000000-0000-4000-8000-00000000001b',
  aminaTeller: '10000000-0000-4000-8000-000000000301',
  felixBranchTeller: '10000000-0000-4000-8000-000000000307',
} as const;

/** Real TENANT_ADMIN codes (contract §J), granted only in `users` so `default` stays the read-only
 * gating scenario for the users record. */
const USER_ADMIN_CODES = [
  'user.approve',
  'membership.suspend',
  'membership.reactivate',
  'membership.revoke',
  'user.assign_role',
  'user.revoke_role',
  'user.assign_branch',
  'user.revoke_branch',
];

/** 100 characters: the backend's display-name maximum (contract §D). */
const LONG_USER_NAME =
  'Wanjiru Njeri Kamau-Otieno Achieng Muthoni Wambui Chebet Jepkoech Nyambura Akinyi Atieno Wairimu Ayo';
```

`usersScenario()` copies `greenfieldTenant()` (Jane: TENANT_ADMIN, HOME at Head Office, OPERATE at
Westlands) and appends, in this insertion order (the fake lists newest first, so the directory shows
them reversed: Joann first):

| User (username `first.last`, email `<username>@greenfield.example` unless noted)                                                                   | User status, `identityLinked` | Membership (type, status, extras)                              | Branch assignments (id …0002nn)   | Role assignments (id …0003nn)                                                                     | Audit seed (id …0004nn)                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Victor Otieno (the other administrator, an inviter)                                                                                                | ACTIVE                        | ADMIN, ACTIVE, primary Head Office                             | 201 Head Office HOME              | —                                                                                                 | —                                                                                                                                                                                              |
| Amina Odhiambo                                                                                                                                     | DRAFT, `false`                | STAFF, PENDING_APPROVAL, `invitedBy` Victor, primary Westlands | 202 Westlands HOME                | 301 Teller TENANT (`aminaTeller`)                                                                 | 401 USER `user.invite` by Victor, 2026-09-20T08:00:00Z                                                                                                                                         |
| Brian Kiprono                                                                                                                                      | ACTIVE                        | STAFF, PENDING_APPROVAL, `invitedBy` Victor                    | 203 Head Office HOME              | 302 Teller TENANT                                                                                 | 402 invite by Victor, 2026-09-21T08:00:00Z                                                                                                                                                     |
| Carol Wambui                                                                                                                                       | DRAFT, `false`                | STAFF, PENDING_APPROVAL, `invitedBy` Jane                      | 204 Westlands HOME                | 303 Teller TENANT                                                                                 | 403 invite by Jane, 2026-09-22T08:00:00Z                                                                                                                                                       |
| Daniel Mutua                                                                                                                                       | PROVISIONING_IDP, `false`     | STAFF, PENDING_APPROVAL, `invitedBy` Victor                    | 205 Westlands HOME                | 304 Teller TENANT                                                                                 | 404 invite by Victor, 2026-09-23T08:00:00Z                                                                                                                                                     |
| Esther Njoki                                                                                                                                       | INVITED                       | STAFF, ACTIVE, primary Head Office                             | 206 Head Office HOME              | 305 Teller TENANT                                                                                 | —                                                                                                                                                                                              |
| Felix Omondi                                                                                                                                       | ACTIVE                        | STAFF, ACTIVE, primary Westlands (`created_at` = `CREATED`)    | 207 Westlands HOME (his only one) | 306 Teller TENANT; 307 Teller BRANCH at Westlands (`felixBranchTeller`); 308 Loans officer TENANT | 405 invite by Victor (2026-08-01T08:00:00Z); 406 MEMBERSHIP `membership.activate` on his membership by Jane (2026-08-02); 407 USER_ACCOUNT `user.first_login_activation` by Felix (2026-08-03) |
| Gladys Chebet                                                                                                                                      | ACTIVE                        | STAFF, SUSPENDED                                               | 208 Head Office HOME              | 309 Teller TENANT                                                                                 | —                                                                                                                                                                                              |
| Hassan Ali                                                                                                                                         | ACTIVE                        | STAFF, REVOKED                                                 | 209 Head Office HOME, REVOKED     | 310 Teller TENANT, REVOKED                                                                        | —                                                                                                                                                                                              |
| `LONG_USER_NAME`, username `wanjiru.long`, email `wanjiru.njeri.kamau-otieno.achieng.muthoni@greenfield-teachers-and-public-service-sacco.example` | ACTIVE                        | AUDITOR, ACTIVE, no primary branch                             | — (branch-exempt)                 | —                                                                                                 | —                                                                                                                                                                                              |
| Ann Mwangi (`ann.mwangi`)                                                                                                                          | ACTIVE                        | **ADMIN**, ACTIVE                                              | —                                 | —                                                                                                 | —                                                                                                                                                                                              |
| Joann Mwangi (`joann.mwangi`)                                                                                                                      | ACTIVE                        | **STAFF**, ACTIVE                                              | 210 Head Office HOME              | —                                                                                                 | —                                                                                                                                                                                              |

Roles: the TENANT_ADMIN role gains `USER_ADMIN_CODES`; add the custom roles Teller (`TELLER`, ACTIVE,
`['business_date.view', 'branch.view']`, created 2026-08-01), Branch supervisor (`SUPERVISOR`, ACTIVE,
`['business_date.view']`, created 2026-08-05) and Loans officer (`LOANS_OFFICER`, **DISABLED**,
`['user.view']`, created 2026-07-20), built like `rolesScenario()`'s `custom()` helper. Every new
membership and user is a fresh object (never a shared fixture), `createdAt`/`updatedAt` `CREATED` /
`UPDATED` unless stated. Audit rows use `branchDraftEvent()`'s shape (`actorType: 'USER'`,
`branchId: null`, `outcome: 'SUCCESS'`, `severity: 'INFO'`, `metadataJson: '{}'`).

```ts
  // Layer 10 (users). `users-limited` lacks the membership read and audit; `users-read-only` lacks
  // every lifecycle and assignment code, for the gated-control cases.
  users: usersScenario,
  'users-limited': () => withoutPermission(usersScenario(), 'membership.view', 'audit.view'),
  'users-read-only': () => withoutPermission(usersScenario(), ...USER_ADMIN_CODES),
  // 500 ACTIVE filler rows appended after the seeds (the fake pages in insertion order): Felix's row
  // is on page 0 and page 4 still has more, so the scan is truncated (Ruling 8's partial marker).
  'users-many-assignments': () => {
    const state = usersScenario();
    const filler = '10000000-0000-4000-8000-000000000099'; // no user row needed
    state.branchAssignments.push(
      ...Array.from({ length: 500 }, (_, n) =>
        assignment(`10000000-0000-4000-8000-${String(100000 + n).padStart(12, '0')}`, IDS.greenfield, filler, IDS.headOffice, 'OPERATE'),
      ),
    );
    return state;
  },
```

- [ ] **Step 7: Lift the fake-spec helpers** into `e2e/support/fake-api.ts`: `FAKE_API_URL`,
      `api(path)` and `contextFor(request, scenario, branchId)`, copied verbatim from
      `e2e/fake-api-roles.spec.ts` (Task 10 switches the two older specs to it).

- [ ] **Step 8: Format and run** — form P on the four `.mts` files; form E on
      `e2e/fake-api-users.spec.ts e2e/fake-api.spec.ts e2e/fake-api-branches.spec.ts`. Expected:
      PASS (the branches spec proves the `reasonField` move changed nothing). Prove test 10's guard:
      temporarily make `objectBody` ignore unknown keys in a scratch copy, see test 10 fail, revert.

- [ ] **Step 9: Commit** (form C)

`git add e2e/fake-api e2e/support/fake-api.ts e2e/fake-api-users.spec.ts`

```
test(fake-api): add membership routes and the users scenarios

The fake lists and reads memberships (q stays a substring with LIKE wildcards), and approves (200,
or 202 for a user with no identity link), suspends, reactivates and revokes them with the
backend's 500s, the maker-checker 403 and the revoke cascade. The users scenarios seed every
onboarding state, nested emails, a 100-character name, and limited and read-only variants.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

---

### Task 4: The users directory and its navigation item

**Files:**

- Create: `modules/administration/users/components/user-directory-table.tsx` (server) and
  `user-directory-table.test.tsx`
- Create: `app/(authenticated)/admin/users/page.tsx`
- Modify: `modules/administration/administration-navigation.ts`

**Interfaces:**

- Consumes: Task 1's `parseUserListQuery`, `hasUserFilters`, `USER_STATUSES`,
  `MEMBERSHIP_STATUSES`, `onboardingState`, `userStatusLabel`, `type UserSummary`; Task 2's `listUsers`; the list kit
  (`ListNavigationProvider`, `ListNavigationProgress`, `ListBusyRegion`, `ListToolbar`,
  `TablePaginationBar`, `EmptyState`, `ErrorState`, `ForbiddenState`, `StatusChip`, `humanizeEnum`,
  `TruncatedText`), `PageHeader`, `NextLink`, `LinkPendingIndicator`, `initialsOf`
  (`components/shell/initials.ts`), `load`, `lastPageIfPastEnd`, `hrefWith`, `toSearchParams`.
- Produces: `UserDirectoryTable({ users: readonly UserSummary[] })`; the route `/admin/users`; the
  "Users & access" navigation item.

Mirror `app/(authenticated)/admin/roles/page.tsx` and
`modules/administration/roles/components/role-directory-table.tsx`, minus the sort headers and the
create button (the "Invite user" button is layer 11's).

- [ ] **Step 1: Write the failing table test** — `user-directory-table.test.tsx`
      (`renderWithProviders`):
  - "links each name to the user's record and shows the email under it" — link `Felix Omondi` has
    `href` `/admin/users/<FELIX>` and `title` `Felix Omondi`; the email text is in the same cell, with the
    full value in its `title` (`TruncatedText`).
  - "derives the onboarding chip from both statuses" — the Onboarding cell (the third; "Provisioning
    identity" is also the user status, so a row-wide `getByText` would match twice) of rows
    (PENDING_APPROVAL, PROVISIONING_IDP) and (ACTIVE, INVITED) reads `Provisioning identity` and
    `Awaiting first sign-in`.
  - "humanizes the membership and user statuses, each in its own column" — the Membership cell
    (the fourth) reads `Pending approval` and the User status cell (the fifth) `Draft`: PENDING_APPROVAL
    is valid in both enums, so the columns are pinned by position.
  - "words the provisioning user status as an identity, not an acronym" — the PROVISIONING_IDP row's
    User status cell reads `Provisioning identity`; no text matches `/idp/i`.
  - "hides the initials avatar from assistive technology" — the `FO` text sits inside an
    `aria-hidden="true"` element, and the row's link name is exactly `Felix Omondi`.
  - "is a table named Users with the five headers" — `getByRole('table', { name: 'Users' })` and
    column headers `User`, `Username`, `Onboarding`, `Membership`, `User status`.

- [ ] **Step 2: Run it to verify it fails** — form U. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `UserDirectoryTable`** (Server Component; mirror `RoleDirectoryTable`):
  - `TableContainer sx={{ maxHeight: { md: 'calc(100dvh - 300px)' }, minHeight: 240 }}`;
    `Table stickyHeader aria-label="Users" sx={{ minWidth: 760 }}`; no row hover (only the name
    link navigates).
  - User cell: a flex row (`gap: 2`, `alignItems: 'center'`, `minWidth: 0`) of an
    `Avatar aria-hidden sx={{ width: 32, height: 32, fontSize: '0.75rem', fontWeight: 800, bgcolor: 'avatar.bg', color: 'avatar.fg' }}` with `initialsOf(user.displayName)`, and a `Box` holding
    the name link above the email:

    ```tsx
    <Link
      component={NextLink}
      href={`/admin/users/${user.id}`}
      variant="body2"
      noWrap
      title={user.displayName}
      sx={{ display: 'block', maxWidth: 320, fontWeight: 700 }}
    >
      {user.displayName}
      <LinkPendingIndicator />
    </Link>
    <TruncatedText value={user.email} maxWidth={320} variant="caption" color="textSecondary" />
    ```

  - Username: `Typography variant="body2" sx={{ fontFamily: 'monospace' }}`.
  - Onboarding: `const state = onboardingState(user.membershipStatus, user.userStatus)` →
    `<StatusChip value={state.key} label={state.label} tone={state.tone} />`.
  - Membership: `<StatusChip value={user.membershipStatus} />` (humanized by the kit). User status:
    `<StatusChip value={user.userStatus} label={userStatusLabel(user.userStatus)} />`: the tone still comes
    from the value, and `userStatusLabel` words PROVISIONING_IDP as "Provisioning identity".

- [ ] **Step 4: Write the page** `app/(authenticated)/admin/users/page.tsx` (mirror the roles page's
      structure: `load(listUsers(query))`, `ForbiddenState` on a 403, `ErrorState` otherwise, the
      past-the-end redirect through `hrefWith('/admin/users', params, { page })`,
      `ListNavigationProvider` → `ListToolbar` → `ListNavigationProgress` → `ListBusyRegion` →
      table or `EmptyState` → `TablePaginationBar`). `metadata.title` is `'Users & access'`. Exact
      copy and fields:

```tsx
<PageHeader
  eyebrow="Administration"
  title="Users & access"
  description="Everyone with a membership in this institution: their onboarding, status and access."
/>
```

```ts
const fields: ToolbarField[] = [
  { kind: 'search', name: 'q', label: 'Search', placeholder: 'Name, username or email' },
  {
    kind: 'select',
    name: 'userStatus',
    label: 'User status',
    allLabel: 'All user statuses',
    options: USER_STATUSES.map((value) => ({ value, label: userStatusLabel(value) })),
  },
  {
    kind: 'select',
    name: 'membershipStatus',
    label: 'Membership',
    allLabel: 'All memberships',
    options: MEMBERSHIP_STATUSES.map((value) => ({ value, label: humanizeEnum(value) })),
  },
];
```

`timeZone="UTC"` (no datetime field, so no `GET /tenant` read for it); `resultLabel` is
`` `${total} ${total === 1 ? 'user' : 'users'}` ``; the empty state is
`<EmptyState title="No users" description={hasUserFilters(query) ? 'No users match these filters.' : 'No one has been invited yet.'} />`.

- [ ] **Step 5: Register the navigation item** — in `administration-navigation.ts`, import
      `GroupOutlined` and insert after Overview:
      `{ href: '/admin/users', label: 'Users & access', icon: GroupOutlined, requiresAny: ['user.view'] }`.
      Update the comment's list to the spec §8 order it already names.

- [ ] **Step 6: Run** — form U on the table test; form E on `e2e/shell.spec.ts` (the rail gains an
      item). Expected: PASS.

- [ ] **Step 7: Commit** (form C)

`git add modules/administration/users/components/user-directory-table.tsx modules/administration/users/components/user-directory-table.test.tsx 'app/(authenticated)/admin/users/page.tsx' modules/administration/administration-navigation.ts`

```
feat(users): add the users directory and its navigation item

Users & access lists the tenant's users newest first, with search, user status and membership
status filters in the URL, the derived onboarding state, and server pagination.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

---

### Task 5: The user record — hero lifecycle, Overview and the onboarding timeline

**Files:**

- Modify: `modules/administration/branches/components/branch-lifecycle-actions.tsx` and
  `branch-user-actions.tsx` (use the shared `focusRecordTitle`, carry-in a); comment-only pointer
  updates in `theme/create-finaxis-theme.ts` (the `focusRecordTitle` mention near line 439) and
  `theme/create-finaxis-theme.render.test.tsx` (near line 385)
- Create: `modules/administration/users/components/user-lifecycle-actions.tsx` (client) and
  `user-lifecycle-actions.test.tsx`
- Create: `modules/administration/users/components/onboarding-timeline.tsx` (server) and
  `onboarding-timeline.test.tsx`
- Create: `app/(authenticated)/admin/users/[userId]/layout.tsx` and `page.tsx` (Overview)

**Interfaces:**

- Consumes: Task 1's `parseUserId`, `onboardingState`, `onboardingProgress`,
  `availableMembershipActions`, `blockedMembershipActions`, `membershipActionsNote`,
  `branchAssignmentCount`, `type MembershipAction`, `type OnboardingProgress`; Task 2's
  `getUser`, `findUserMembership`, `getMembership`, `getUserInviter`, `countUserRoleAssignments`,
  `listUserBranchAssignments`, the four membership actions; 08's `activateBlocked(makerId, userId)`;
  `focusRecordTitle`; `ConfirmDialog`, `ReasonDialog`, `RecordHero` (`{ kind: 'person' }`),
  `RecordTabs`, `SectionCard`, `DescriptionList`, `CopyIdButton`, `StatusChip`, `humanizeEnum`,
  `ErrorState`, `ForbiddenState`, `PageHeader`, `useToast`; `getCurrentContextProfile`, `can`;
  `getOrganisationTimeZone`, `getBranchIndex`; `formatInstant`, `shortId`.
- Produces:
  - `UserLifecycleActions({ membershipId: string | null; userName: string; actions: readonly MembershipAction[]; blocked: Partial<Record<MembershipAction, string>>; note: string | null; contextOrganisationId?: string })`;
  - `OnboardingTimeline({ progress: OnboardingProgress })`;
  - the routes `/admin/users/[userId]` (layout + Overview).

- [ ] **Step 1: Retire 08's `focusRecordTitle` copy** (its own commit). Delete the exported function
      and its docblock from `branch-lifecycle-actions.tsx` and import it from
      `@/components/data-display/focus-record-title` there and in `branch-user-actions.tsx`; point the
      two theme comments at `components/data-display/focus-record-title.ts`. Run form U on
      `modules/administration/branches` and form E on `e2e/branches.spec.ts`; both stay green.
      Commit (form C) after
      `git add modules/administration/branches/components theme/create-finaxis-theme.ts theme/create-finaxis-theme.render.test.tsx`:

```
refactor(branches): use the shared focusRecordTitle

The branch record kept its own copy of the record-title focus fallback after layer 09 moved it
into the kit; both branch components now import the kit file.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

- [ ] **Step 2: Write the failing component tests.**

`onboarding-timeline.test.tsx`: "lists the steps in order with worded chips" (`getByRole('list', { name: 'Onboarding steps' })` has 4 `listitem`s; the second reads `2. Approved` and `Waiting` for
(PENDING_APPROVAL, DRAFT)); "adds the provisioning note under the steps" (`PROVISIONING_NOTE` text);
"shows only the sentence once onboarding has stopped" (no list for (SUSPENDED, ACTIVE)).

`user-lifecycle-actions.test.tsx` — mock `../membership-actions` (each export a `vi.fn`), render
inside `<main><h1>Amina Odhiambo</h1>…</main>`, and assert the hidden `contextOrganisationId` in
**every** dialog test (rule 6):

```tsx
it('approves through a confirmation that carries the membership, key and organisation (I2)', async () => {
  approveMembership.mockResolvedValueOnce({ ok: true });
  renderActions({ actions: ['approve', 'reject'] });
  await user.click(screen.getByRole('button', { name: 'Approve' }));
  const dialog = screen.getByRole('dialog', { name: 'Approve Amina Odhiambo?' });
  await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
  const sent = approveMembership.mock.calls[0]?.[1] as FormData;
  expect(sent.get('membershipId')).toBe(MEMBERSHIP);
  expect(sent.get('contextOrganisationId')).toBe(ORG);
  expect(sent.get('idempotencyKey')).toMatch(UUID);
});

it('makes Reject & revoke an alertdialog with the permanence warning and a required reason', async () => {
  renderActions({ actions: ['approve', 'reject'] });
  await user.click(screen.getByRole('button', { name: 'Reject & revoke' }));
  const dialog = screen.getByRole('alertdialog', { name: 'Reject and revoke Amina Odhiambo?' });
  expect(dialog).toHaveTextContent('can never be invited to this institution again');
  expect(within(dialog).getByRole('textbox', { name: /^Reason/ })).toBeRequired();
});
```

Plus: "disables Approve for its inviter and says why" (`blocked={{ approve: USER_MAKER_CHECKER_BLOCKED }}`
→ `Approve` disabled with that accessible description; Reject & revoke stays enabled); "disables
Suspend and Revoke on your own record with one caption" (`blocked` maps both to `OWN_MEMBERSHIP` →
both disabled and described by it; the caption renders once); "keeps the typed
reason and the key after a refused suspend" (first `suspendMembership` call resolves
`{ ok: false, formError: 'Refused', fieldErrors: {}, code: 'conflict', requestId: 'req-1' }`, the
second `{ ok: true }`; after the first the textbox still holds `Cash audit` and `Refused Reference: req-1` shows; both calls carry the same `idempotencyKey`); "asks Reactivate for an optional reason"
(label `Reason (optional)`, not required); "moves focus to the replacement action" (after a
successful suspend, rerender with `actions={['reactivate', 'revoke']}` → `Reactivate` is focused);
"falls back to the record title when no action remains" (after a successful revoke, unmount → the
`h1` is focused); "shows the note on its own" (`actions={[]}`, `note={MEMBERSHIP_MISSING}` → the
note text and no button). `renderActions` defaults `blocked` to `{}`.

- [ ] **Step 3: Run them to verify they fail** — form U. Expected: FAIL (modules not found).

- [ ] **Step 4: Implement `OnboardingTimeline`** — mirror
      `modules/platform-administration/tenants/components/provisioning-timeline.tsx` (each step a
      row with `` `${index + 1}. ${step.label}` ``, its detail muted, and a `StatusChip` with the
      state's label and tone), but give the `ol` `role="list"` (its `listStyle: 'none'` drops list
      semantics in WebKit) and `aria-label="Onboarding steps"`. A `note` renders below the list, or
      alone for `kind: 'note'`, as `Typography variant="body2" sx={{ color: 'text.secondary', px: 4.5, py: 3.5 }}`.

- [ ] **Step 5: Implement `UserLifecycleActions`** — mirror
      `branch-lifecycle-actions.tsx`: the same flex `Box` and `'& > *'` rule, `buttonRefs`, the
      `succeededRef` + `actionKey` focus effect and the unmount cleanup (both calling the kit's
      `focusRecordTitle`); the first action `contained`, the rest `outlined`; `reject` and `revoke`
      `color="error"`; an action in `blocked` is `disabled` with `aria-describedby` naming its
      caption: one caption per distinct reason
      (``Typography variant="caption" id={`user-action-blocked-${index}`} sx={{ color: 'text.secondary', flexBasis: '100%', textAlign: 'right' }}``); the `note` as one more caption the same way. Each
      dialog is keyed by its action. Approve uses `ConfirmDialog` (children: the hidden
      `membershipId` input); every other action uses `ReasonDialog` with
      `fields={() => <input type="hidden" name="membershipId" value={membershipId} />}`,
      `tone={copy.destructive ? 'error' : 'default'}`. Both pass `contextOrganisationId`. On success:
      set `succeededRef`, close, and `notify(copy.success)`. The copy is fixed:

```ts
function copyFor(id: MembershipAction, name: string): ActionCopy {
  switch (id) {
    case 'approve':
      return {
        label: 'Approve',
        title: `Approve ${name}?`,
        description:
          "Their membership becomes active once their sign-in identity is ready. If they don't have one yet, it is created first and the invitation is sent when it completes.",
        reason: null,
        destructive: false,
        success: 'Approval recorded',
        action: approveMembership,
      };
    case 'reject':
      return {
        label: 'Reject & revoke',
        title: `Reject and revoke ${name}?`,
        description:
          'This is permanent. The membership is revoked, and this email can never be invited to this institution again.',
        reason: 'required',
        destructive: true,
        success: 'Membership revoked',
        action: revokeMembership,
      };
    case 'suspend':
      return {
        label: 'Suspend',
        title: `Suspend ${name}?`,
        description: "They can't sign in to this institution until the membership is reactivated.",
        reason: 'required',
        destructive: false,
        success: 'Membership suspended',
        action: suspendMembership,
      };
    case 'reactivate':
      return {
        label: 'Reactivate',
        title: `Reactivate ${name}?`,
        description: 'They can sign in to this institution again.',
        reason: 'optional',
        destructive: false,
        success: 'Membership reactivated',
        action: reactivateMembership,
      };
    case 'revoke':
      return {
        label: 'Revoke',
        title: `Revoke ${name}'s membership?`,
        description:
          'This is permanent. Every role and branch assignment here is revoked with it, and this email can never be invited to this institution again.',
        reason: 'required',
        destructive: true,
        success: 'Membership revoked',
        action: revokeMembership,
      };
  }
}
```

- [ ] **Step 6: Write the layout** `app/(authenticated)/admin/users/[userId]/layout.tsx` (mirror the
      roles layout; the decisions are in the code):

```tsx
export const metadata: Metadata = { title: 'User record' };

/** Record shell (spec §9): the user is read once here; each tab fetches its own data. Users are
 * never branch-restricted (contract §E.4). */
export default async function UserRecordLayout({ children, params }: UserRecordLayoutProps) {
  // Rule 7: the id is checked, and canonicalised, before any read.
  const userId = parseUserId((await params).userId);
  if (!userId) notFound();

  const [user, selected] = await Promise.all([load(getUser(userId)), getCurrentContextProfile()]);
  const resolved = selected.kind === 'resolved' ? selected : null;
  if (!user.ok) {
    if (user.problem.code === 'resource_not_found') notFound();
    return (
      <>
        <PageHeader eyebrow="Administration · User record" title="User record" />
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

  const record = user.value;
  const holder = { permissions: resolved?.profile.permissions ?? [] };
  const status = { membershipStatus: record.membershipStatus, userStatus: record.userStatus };
  // Only with membership.view (every transition needs it, BG-31); a failure degrades the hero.
  const membership = can(holder, 'membership.view')
    ? await load(findUserMembership(record.id, record.email))
    : null;
  const membershipId = membership?.ok ? (membership.value?.id ?? null) : null;
  const actions = membershipId ? availableMembershipActions(status, holder) : [];
  // BG-08: the inviter is only in the audit log; look it up only when Approve is on offer.
  const inviter =
    actions.includes('approve') && can(holder, 'audit.view')
      ? await getUserInviter(record.id)
      : null;
  const blocked = blockedMembershipActions(actions, {
    ...status,
    self: record.id === resolved?.profile.user_id, // the backend's id, not the URL's (Ruling 6)
    invitedByMe: activateBlocked(inviter, resolved?.profile.user_id ?? null),
  });
  const note = membershipActionsNote(
    holder,
    membership?.ok === false ? 'failed' : membershipId ? 'found' : 'missing',
  );
  const onboarding = onboardingState(record.membershipStatus, record.userStatus);
  const base = `/admin/users/${userId}`;

  return (
    <>
      <RecordHero
        back={{ href: '/admin/users', label: 'Back to users' }}
        avatar={{ kind: 'person', name: record.displayName }}
        eyebrow="Administration · User record"
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
          // Undefined, not an empty component: RecordHero renders its actions box whenever this is
          // truthy (08's layout).
          actions.length > 0 || note ? (
            <UserLifecycleActions
              membershipId={membershipId}
              userName={record.displayName}
              actions={actions}
              blocked={blocked}
              note={note}
              contextOrganisationId={resolved?.context.organization.id}
            />
          ) : undefined
        }
      />
      <RecordTabs
        label={`${record.displayName} sections`}
        tabs={[
          { href: base, label: 'Overview' },
          ...(can(holder, 'role_assignment.view')
            ? [{ href: `${base}/access`, label: 'Roles & access' }]
            : []),
          ...(can(holder, 'branch_assignment.view')
            ? [{ href: `${base}/branches`, label: 'Branch assignments' }]
            : []),
          ...(can(holder, 'audit.view') ? [{ href: `${base}/audit`, label: 'Audit' }] : []),
        ]}
      />
      {children}
    </>
  );
}
```

- [ ] **Step 7: Write the Overview** `app/(authenticated)/admin/users/[userId]/page.tsx`. Data:

```tsx
const userId = parseUserId((await params).userId);
if (!userId) notFound(); // rule 7: before any read, like the layout (16's tab pages)
const [user, selected, timeZone, branches] = await Promise.all([
  load(getUser(userId)), // cached: the layout's read
  getCurrentContextProfile(),
  getOrganisationTimeZone(),
  getBranchIndex(),
]);
if (!user.ok) return null; // the layout renders the failure
const record = user.value;
const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };
const selectedBranch = selected.kind === 'resolved' ? selected.context.branch : null;
const [membership, roleCount, scan] = await Promise.all([
  can(holder, 'membership.view') ? load(findUserMembership(record.id, record.email)) : null,
  can(holder, 'role_assignment.view') ? countUserRoleAssignments(record.id) : null,
  can(holder, 'branch_assignment.view') ? load(listUserBranchAssignments(record.id)) : null,
]);
const detail =
  membership?.ok && membership.value ? await load(getMembership(membership.value.id)) : null;
const at = (iso: string) => {
  const when = formatInstant(iso, timeZone);
  return `${when.date} · ${when.time}`;
};
```

Render a `Box sx={{ display: 'grid', gap: 3 }}` of three `SectionCard`s:

1. **Profile** — `DescriptionList` items: `Display name`, `Username`, `Email`, `User status`
   (`StatusChip` with `label={userStatusLabel(record.userStatus)}`), `Role assignments` (only when `roleCount !== null`), `Branch assignments` (only
   when `scan?.ok`: `branchAssignmentCount(scan.value.items.length, scan.value.truncated, selectedBranch?.name ?? null)`), `User ID` (`<CopyIdButton value={record.id} label="User ID" />`).
2. **Membership** — without `membership.view`: the muted paragraph "You can't view membership
   details in your current role."; a failed `membership` or `detail` load: `<ErrorState problem={…} />`; not found: "This user's membership couldn't be found."; otherwise
   `DescriptionList` items `Membership type` (`humanizeEnum(type)`), `Membership status`
   (`StatusChip`), `Primary branch` (`branches.get(id)` → `` `${name} (${code})` ``, else
   `shortId(id)`, else `None`), `` `Created (${timeZone})` `` and `` `Updated (${timeZone})` ``
   (`at(…)`), `Membership ID` (`CopyIdButton`, label `Membership ID`). The paragraphs use
   `Typography variant="body2" sx={{ color: 'text.secondary', px: 4.5, py: 3.5 }}`.
3. **Onboarding** — `<OnboardingTimeline progress={onboardingProgress(record.membershipStatus, record.userStatus)} />`.

- [ ] **Step 8: Run** — form U on `modules/administration/users`. Expected: PASS.

- [ ] **Step 9: Commit** (form C)

`git add modules/administration/users/components/user-lifecycle-actions.tsx modules/administration/users/components/user-lifecycle-actions.test.tsx modules/administration/users/components/onboarding-timeline.tsx modules/administration/users/components/onboarding-timeline.test.tsx 'app/(authenticated)/admin/users/[userId]/layout.tsx' 'app/(authenticated)/admin/users/[userId]/page.tsx'`

```
feat(users): add the user record with the membership lifecycle and Overview

The record validates its id before any read, shows the onboarding and membership chips, and offers
Approve, Reject & revoke, Suspend, Reactivate and Revoke by status and permission. A blocked action
is disabled with its reason: Approve for the user's inviter or a blocked account, and your own
Suspend and Revoke. The Overview shows identity, membership facts, counts and the onboarding timeline.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

---

### Task 6: The Roles & access tab

**Files:**

- Modify: `modules/administration/roles/components/role-assignment-actions.tsx` (`RoleScopeFields`
  gains `branchHint?: string` and a JSDoc note) and `role-assignment-actions.test.tsx`
- Create: `modules/administration/users/components/user-role-actions.tsx` (client:
  `AssignUserRoleButton`) and `user-role-actions.test.tsx`
- Create: `modules/administration/users/components/user-role-assignments-table.tsx` (server) and
  `user-role-assignments-table.test.tsx`
- Create: `app/(authenticated)/admin/users/[userId]/access/page.tsx`

**Interfaces:**

- Consumes: Task 1's `parseUserId`, `canAssignUserRole`, `roleScopeBranches`, `roleScopeHint`,
  `ACCESS_DESCRIPTION`, `NO_ACTIVE_ROLES`, `type SelectOption`; Task 2's `getUser`,
  `listUserBranchAssignments`; 09's `listRoleAssignments`, `assignRole`, `RoleScopeFields`,
  `RevokeRoleAssignmentButton`, `canRevokeRoleAssignments`, `isAssignmentRevocable`, `scopeLabel`,
  `type RoleScopeType`; `getRoleIndex`, `getBranchIndex`; `AssignmentDrawer`, `SectionCard`,
  `TablePaginationBar`, `EmptyState`, `ErrorState`, `ForbiddenState`, `StatusChip`, `TruncatedText`;
  `useToast`; `load`, `parsePaging`, `lastPageIfPastEnd`, `hrefWith`, `toSearchParams`, `shortId`.
- Produces:
  - `RoleScopeFields({ branches, fieldErrors, branchHint? })` (additive);
  - `AssignUserRoleButton({ userId, userName, roles: readonly SelectOption[], branches: readonly SelectOption[], branchHint?: string, contextOrganisationId?: string })`;
  - `UserRoleAssignmentsTable({ rows: readonly UserRoleAssignmentRow[]; userName: string; self: boolean; canRevoke: boolean; contextOrganisationId?: string })` with
    `interface UserRoleAssignmentRow { assignmentId; roleName; roleCode: string | null; roleStatus: string | null; scopeType: RoleScopeType; branchLabel: string; revocable: boolean }`;
  - the route `/admin/users/[userId]/access`.

- [ ] **Step 1: Add `branchHint` to `RoleScopeFields`** (its own commit). Extract today's two
      inline helper strings (`role-assignment-actions.tsx:50-52`) into the constants `TENANT_HELP`
      and `BRANCH_HELP`; the Scope helper text becomes:

```ts
const tenantHelp =
  branches.length === 0 && branchHint ? `${TENANT_HELP} ${branchHint}` : TENANT_HELP;
const helperText = fieldErrors.scopeType ?? (scope === 'TENANT' ? tenantHelp : BRANCH_HELP);
```

Extend the JSDoc: "Uncontrolled, with fixed field names (`scopeType`, `branchId`): it fits a
FormData drawer; a React Hook Form wizard (layer 11) needs added props." Tests in
`role-assignment-actions.test.tsx`: "explains a disabled one-branch scope with the hint"
(`branches={[]}` and the hint `Assign them to a branch first to give a branch-scoped role.` → the
Scope field's description contains it and `One branch` is `aria-disabled`); "shows no hint while a
branch is offered". Run form U on the file; form E on `e2e/roles.spec.ts`. Commit (form C) after
`git add modules/administration/roles/components/role-assignment-actions.tsx modules/administration/roles/components/role-assignment-actions.test.tsx`:

```
feat(roles): let RoleScopeFields explain an unavailable branch scope

The user record often has no branch to offer for a branch-scoped role, so the disabled
"One branch" choice now comes with the reason under the Scope field.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

- [ ] **Step 2: Write the failing component tests.**

`user-role-actions.test.tsx` (mock `@/modules/administration/roles/role-actions`):

- "opens a drawer that carries the user, the key and the organisation (I2)" — `Assign role` →
  `getByRole('dialog', { name: 'Assign a role' })` holds hidden `userId` = `FELIX`,
  `contextOrganisationId` = `ORG` and a UUID `idempotencyKey`.
- "offers the roles it is given and preselects a lone one" — two roles → the `Role` select lists
  both labels; one role → the hidden `roleId` is its id.
- "passes the branch hint to the scope field" — `branches={[]}` with a hint → the hint is in the
  Scope field's description.
- "shows the server's role error under the select" — `assignRole` resolves `{ ok: false, formError: 'Check the highlighted fields and try again.', fieldErrors: { roleId: 'Choose a role.' }, code: 'validation_failed', requestId: null }` → `Choose a role.` is visible.

`user-role-assignments-table.test.tsx`:

- "names each revoke by role and scope" — rows Teller TENANT and Teller BRANCH (`Westlands Branch`)
  → buttons `Revoke Felix Omondi's Teller assignment (institution-wide)` and `Revoke Felix Omondi's Teller assignment (Westlands Branch)`.
- "marks a role that grants nothing" — `roleStatus: 'DISABLED'` renders a `Disabled` chip next to
  the name; `ACTIVE` renders none.
- "forwards the organisation and the assignment to the revoke (I2)" — mock
  `@/modules/administration/roles/role-actions`; open the Westlands row's Revoke, confirm in the
  `alertdialog` → `revokeRoleAssignment`'s FormData has that row's `assignmentId` and
  `contextOrganisationId` = `ORG` (09's `role-assignments-table.test.tsx` shape).
- "renders no revoke for a row the context can't revoke" and "has no Actions column without
  canRevoke".

- [ ] **Step 3: Run them to verify they fail** — form U. Expected: FAIL.

- [ ] **Step 4: Implement `AssignUserRoleButton`** — mirror 09's `AssignRoleButton`: a contained
      `Assign role` button (`AddOutlined`), an `AssignmentDrawer` titled `Assign a role` with the
      description `` `Give ${userName} a role. It takes effect immediately.` ``, submit label
      `Assign role`, `action={assignRole}`, `contextOrganisationId`, and on success close +
      `notify('Role assigned')`. Fields: `<input type="hidden" name="userId" value={userId} />`; a
      `TextField select name="roleId" label="Role" required` (default the lone role's id, else `''`,
      `error`/`helperText` from `fieldErrors.roleId`) with one `MenuItem` per role; then
      `<RoleScopeFields branches={branches} branchHint={branchHint} fieldErrors={fieldErrors} />`.

- [ ] **Step 5: Implement `UserRoleAssignmentsTable`** — mirror 09's `RoleAssignmentsTable`
      (`TableContainer tabIndex={0} role="region" aria-label="Role assignments"`, `Table aria-label="Role assignments" sx={{ minWidth: 600 }}`): columns `Role` (`TruncatedText` name,
      then the code as `variant="caption" color="textSecondary"`, and a `StatusChip value={roleStatus}` beside the name when `roleStatus` is set and not `ACTIVE`), `Scope`
      (`<StatusChip value={scopeType} label={scopeLabel(scopeType)} />`), `Branch`, and `Actions`
      when `canRevoke`: `RevokeRoleAssignmentButton` (`userLabel={userName}`, `roleLabel={roleName}`,
      `scopeLabel={scopeType === 'TENANT' ? 'institution-wide' : branchLabel}`, `self`,
      `contextOrganisationId`) only when `revocable`.

- [ ] **Step 6: Write the page** `…/[userId]/access/page.tsx` (`metadata.title` `'User roles & access'`; mirror `app/(authenticated)/admin/roles/[roleId]/assignments/page.tsx`). Data:

```tsx
const userId = parseUserId((await params).userId);
if (!userId) notFound();
const query = toSearchParams(await searchParams);
const [user, selected, assignments, roles, branches] = await Promise.all([
  load(getUser(userId)),
  getCurrentContextProfile(),
  load(listRoleAssignments({ userId, status: 'ACTIVE' }, parsePaging(query, 10))),
  getRoleIndex(), // empty without role.view: names fall back to short ids
  getBranchIndex(),
]);
if (!user.ok) return null; // the layout renders the failure
const record = user.value;
const resolved = selected.kind === 'resolved' ? selected : null;
const holder = { permissions: resolved?.profile.permissions ?? [] };
const selectedBranch = resolved?.context.branch ?? null;
const branchLabel = (id: string) => {
  const branch = branches.get(id);
  return branch ? `${branch.name} (${branch.code})` : shortId(id);
};
// A DISABLED role grants nothing (BG-27): only ACTIVE roles are offered.
const roleOptions = [...roles]
  .filter(([, role]) => role.status === 'ACTIVE')
  .map(([id, role]) => ({ id, label: `${role.name} (${role.code})` }));
const canAssign = canAssignUserRole(record.membershipStatus, holder);
// Branch scope needs the user's own ACTIVE assignment at that branch, else a 409.
const scan =
  canAssign && can(holder, 'branch_assignment.view')
    ? await load(listUserBranchAssignments(userId))
    : null;
const scopeBranches = scan?.ok
  ? roleScopeBranches(scan.value.items, selectedBranch?.id ?? null, branchLabel)
  : [];
const branchHint = roleScopeHint({
  readable: scan?.ok ?? false,
  offered: scopeBranches.length,
  truncated: scan?.ok === true && scan.value.truncated,
  selectedBranchName: selectedBranch?.name ?? null,
});
```

The `SectionCard` is titled `Roles & access`, with the description `NO_ACTIVE_ROLES` when `canAssign && roleOptions.length === 0`, else `ACCESS_DESCRIPTION`, and the `AssignUserRoleButton` action when
`canAssign && roleOptions.length > 0`. A failed list renders `ForbiddenState` (403) or `ErrorState`
in the card; a page past the end redirects through
``hrefWith(`/admin/users/${userId}/access`, query, { page })``. Rows map each assignment to
`{ assignmentId: row.id, roleName: roles.get(row.roleId)?.name ?? shortId(row.roleId), roleCode: roles.get(row.roleId)?.code ?? null, roleStatus: roles.get(row.roleId)?.status ?? null, scopeType: row.scopeType, branchLabel: row.branchId ? (branches.get(row.branchId)?.name ?? shortId(row.branchId)) : 'All branches', revocable: isAssignmentRevocable(row, selectedBranch?.id ?? null) }`; the table gets `self={record.id === resolved?.profile.user_id}` and
`canRevoke={canRevokeRoleAssignments(holder)}`, then `<TablePaginationBar page={assignments.value.page} />`. The empty state is `No roles assigned` with
`Assign a role to give them permissions.` when Assign is offered, else `This user holds no roles.`.

- [ ] **Step 7: Run** — form U on `modules/administration/users`. Expected: PASS.

- [ ] **Step 8: Commit** (form C)

`git add modules/administration/users/components/user-role-actions.tsx modules/administration/users/components/user-role-actions.test.tsx modules/administration/users/components/user-role-assignments-table.tsx modules/administration/users/components/user-role-assignments-table.test.tsx 'app/(authenticated)/admin/users/[userId]/access/page.tsx'`

```
feat(users): add the Roles & access tab

The tab lists the user's active role assignments with names from the role index, assigns an
active role institution-wide or at a branch the user is already assigned to (with the reason when
no branch can be offered), and revokes with 09's confirmation.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

---

### Task 7: The Branch assignments tab

**Files:**

- Modify: `modules/administration/branches/components/branch-user-actions.tsx`
  (`RevokeAssignmentButton` gains `branchLabel?: string`)
- Create: `modules/administration/users/components/user-branch-actions.tsx` (client:
  `AssignUserBranchButton`) and `user-branch-actions.test.tsx`
- Create: `modules/administration/users/components/user-branch-assignments-table.tsx` (server) and
  `user-branch-assignments-table.test.tsx`
- Create: `app/(authenticated)/admin/users/[userId]/branches/page.tsx`

**Interfaces:**

- Consumes: Task 1's `parseUserId`, `canAssignUserBranch`, `pageOfItems`, `PARTIAL_SCAN_NOTE`,
  `branchContextNote`, `type SelectOption`; Task 2's `getUser`, `listUserBranchAssignments`; 08's
  `assignBranchUser`, `RevokeAssignmentButton`, `canRevokeAssignments`, `listBranches`,
  `BRANCH_ASSIGNMENT_TYPES`; `SwitchToAllBranchesButton`; `getBranchIndex`; the kit as in Task 6;
  MUI `Alert`.
- Produces:
  - `RevokeAssignmentButton({ …, branchLabel?: string })` (additive);
  - `AssignUserBranchButton({ userId, userName, branches: readonly SelectOption[], truncated?: boolean, contextOrganisationId?: string })`;
  - `UserBranchAssignmentsTable({ rows: readonly UserBranchAssignmentRow[]; userName: string; canRevoke: boolean; contextOrganisationId?: string })` with `interface UserBranchAssignmentRow { assignmentId; branchName; branchCode: string | null; assignmentType: string }`;
  - the route `/admin/users/[userId]/branches`.

- [ ] **Step 1: Write the failing component tests.**

`user-branch-assignments-table.test.tsx`: "names each revoke by type and branch" (rows Westlands
HOME and Head Office OPERATE → buttons `Revoke Felix Omondi's Home assignment at Westlands Branch`
and `Revoke Felix Omondi's Operate assignment at Head Office`; the Westlands dialog, once opened, is
an `alertdialog` titled `Revoke Felix Omondi's assignment at Westlands Branch?`); "forwards the
organisation and the assignment to the revoke (I2)" (mock
`@/modules/administration/branches/branch-actions`; confirm the Westlands revoke →
`revokeBranchAssignment`'s FormData has that row's `assignmentId` and `contextOrganisationId` =
`ORG`); "has no Actions column without canRevoke". `branch-users-table.test.tsx` keeps asserting the branch-less names, so
08's call sites are unchanged.

`user-branch-actions.test.tsx` (mock `@/modules/administration/branches/branch-actions`): "opens a
drawer that carries the user, the key and the organisation (I2)" (`Assign branch` → dialog `Assign to a branch` with hidden `userId`, `contextOrganisationId`, `idempotencyKey`); "preselects a lone
branch and the Operate type"; "shows the server's branch error" (`fieldErrors: { branchId: 'Choose a branch.' }`); "says when the branch list stops at 100" (`truncated` → the Branch select's
description is `Only the first 100 active branches are listed.`; absent without it).

- [ ] **Step 2: Run them to verify they fail** — form U. Expected: FAIL.

- [ ] **Step 3: Add `branchLabel` to 08's `RevokeAssignmentButton`** (additive; WCAG 2.4.6: a user's
      rows differ by branch). Without the prop every string is exactly today's:

```
const at = branchLabel ? ` at ${branchLabel}` : '';
// …
aria-label={`Revoke ${userLabel}'s ${typeLabel} assignment${at}`}
// …ConfirmDialog
title={`Revoke ${userLabel}'s assignment${at}?`}
description={`${userLabel} loses the ${typeLabel} assignment at ${branchLabel ?? 'this branch'} immediately.`}
```

- [ ] **Step 4: Implement `AssignUserBranchButton`** — mirror 08's `AssignBranchUserButton` with the
      user fixed and the branch chosen: a contained `Assign branch` button (`AddOutlined`), drawer
      title `Assign to a branch`, description `` `Give ${userName} access to a branch. It takes effect immediately.` ``, submit `Assign branch`, `action={assignBranchUser}`, toast `Branch assigned`. Fields: hidden `userId`; `TextField select name="branchId" label="Branch" required`
      (default the lone branch, `fieldErrors.branchId`, else the helper
      `Only the first 100 active branches are listed.` when `truncated`); `TextField select name="assignmentType" label="Assignment type" required defaultValue="OPERATE"` with `BRANCH_ASSIGNMENT_TYPES`
      humanized and the helper `A label only — it grants no permissions.`.

- [ ] **Step 5: Implement `UserBranchAssignmentsTable`** — mirror 08's `BranchUsersTable`
      (`Table aria-label="Branch assignments" sx={{ minWidth: 560 }}`): `Branch` (`TruncatedText`
      name, code as a `textSecondary` caption), `Assignment type` (`StatusChip`), and `Actions` when
      `canRevoke`: `RevokeAssignmentButton` with `userLabel={userName}`,
      `typeLabel={humanizeEnum(assignmentType)}`, `branchLabel={branchName}`.

- [ ] **Step 6: Write the page** `…/[userId]/branches/page.tsx` (`metadata.title` `'User branch assignments'`). Data:

```tsx
const userId = parseUserId((await params).userId);
if (!userId) notFound();
const query = toSearchParams(await searchParams);
const [user, selected, scan, branches] = await Promise.all([
  load(getUser(userId)),
  getCurrentContextProfile(),
  load(listUserBranchAssignments(userId)),
  getBranchIndex(),
]);
if (!user.ok) return null; // the layout renders the failure
const record = user.value;
const resolved = selected.kind === 'resolved' ? selected : null;
const holder = { permissions: resolved?.profile.permissions ?? [] };
const selectedBranch = resolved?.context.branch ?? null;
const canAssign = canAssignUserBranch(record.membershipStatus, holder);
// ACTIVE branches only (an inactive one is a 409); with a branch selected, only that branch is
// reachable (§E.4).
// ponytail: one page of 100 ACTIVE branches; past it the rest aren't offered and the drawer says
// so (AGENTS.md's fifth exception; Ruling 11).
const active =
  canAssign && !selectedBranch
    ? await load(
        listBranches({
          status: 'ACTIVE',
          sort: { by: 'branchName', dir: 'ASC' },
          page: 0,
          size: 100,
        }),
      )
    : null;
const selectedCode = selectedBranch ? branches.get(selectedBranch.id)?.code : undefined;
const options: SelectOption[] = selectedBranch
  ? [
      {
        id: selectedBranch.id,
        label: selectedCode ? `${selectedBranch.name} (${selectedCode})` : selectedBranch.name,
      },
    ]
  : active?.ok
    ? active.value.items.map((branch) => ({
        id: branch.id,
        label: `${branch.branchName} (${branch.branchCode})`,
      }))
    : [];
```

Render a `SectionCard` titled `Branch assignments` with the description `Branches this user can work in. Assignment types are labels; roles grant permissions.` and the `AssignUserBranchButton` action
(`truncated={active?.ok === true && active.value.page.hasNext}`) when `canAssign && options.length > 0`. A failed scan renders `ForbiddenState` (403) or `ErrorState`
in the card. Otherwise:

- Sort the scan's rows by branch name, then assignment type (names from `getBranchIndex`, else
  `shortId`), page them with `pageOfItems(rows, parsePaging(query, 10))`, and redirect a page past
  the end through ``hrefWith(`/admin/users/${userId}/branches`, query, { page })``.
- Above the table, inside `Box sx={{ px: 4, pt: 3 }}`: with a branch selected,
  `<Alert severity="info">` holding `branchContextNote(selectedBranch.name, canSwitch)`, where
  `canSwitch` is the profile having more than one ACTIVE branch (the branch layout's PF1 check), and
  then a `SwitchToAllBranchesButton` below the text (inside the Alert's children, never its
  `action` prop); and, whenever `scan.value.truncated` (with or without a branch selected: Ruling 8,
  the backend forces a scan to the selected branch, and a branch with more than 500 ACTIVE
  assignments is capped there too), a second `<Alert severity="info">{PARTIAL_SCAN_NOTE}</Alert>`
  below it.
- The table, or `<EmptyState title="No branch assignments" description={canAssign ? 'Assign a branch so they can work there.' : 'This user has no branch assignments.'} />`, then
  `<TablePaginationBar page={paged.page} />`.

- [ ] **Step 7: Run** — form U on `modules/administration/users` and
      `modules/administration/branches`; form E on `e2e/branches.spec.ts`. Expected: PASS.

- [ ] **Step 8: Commit** (form C)

`git add modules/administration/branches/components/branch-user-actions.tsx modules/administration/users/components/user-branch-actions.tsx modules/administration/users/components/user-branch-actions.test.tsx modules/administration/users/components/user-branch-assignments-table.tsx modules/administration/users/components/user-branch-assignments-table.test.tsx 'app/(authenticated)/admin/users/[userId]/branches/page.tsx'`

```
feat(users): add the Branch assignments tab

The tab finds the user's active branch assignments with a bounded scan, says when the list may be
partial or is narrowed to the selected branch, pages them through the URL, assigns an active
branch and revokes with 08's confirmation, whose name now includes the branch.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

---

### Task 8: The Audit tab and the audit trail's actor picker

**Files:**

- Modify: `components/data-display/list-toolbar.tsx` (optional `children` slot) and
  `list-toolbar.test.tsx` — the layer's one kit change
- Create: `modules/administration/audit/components/audit-actor-picker.tsx` (client) and
  `audit-actor-picker.test.tsx`
- Modify: `modules/administration/audit/components/audit-filters.tsx` and `audit-filters.test.tsx`
- Modify: `app/(authenticated)/admin/audit/page.tsx` (one profile read, two props)
- Create: `app/(authenticated)/admin/users/[userId]/audit/page.tsx`
- Create: `app/(authenticated)/admin/users/[userId]/user-id-guard.test.tsx` (the route-level id pin)
- Modify: `README.md` (the audit-trail limitation sentence only)

**Interfaces:**

- Consumes: Task 1's `parseUserId`; Task 2's `getUser`, `findUserMembership`; `RecordAuditTab({ views, params, path, description })` with `views: readonly [RecordAuditView, ...RecordAuditView[]]`; `UserPicker({ name, label, onChange })`; `useListNavigation()`;
  `getCurrentContextProfile`, `can`; `toSearchParams`, `load`.
- Produces:
  - `ListToolbar({ …, children?: ReactNode })` (additive);
  - `AuditActorPicker()` (no props);
  - `AuditFilters({ …, actorSearch?: boolean, actorId?: string })` (additive);
  - the route `/admin/users/[userId]/audit`.

Kept here (review 1 §6): spec §10.1's actor filter is layer 10's, `AuditFilters` (a Server
Component) can only configure the toolbar, and the slot is two additive lines.

- [ ] **Step 1: Give `ListToolbar` a `children` slot** (its own `refactor(kit):` commit). Add
      `/** Extra controls after the fields, before the chips (e.g. the audit trail's actor search). */ children?: ReactNode;` to `ListToolbarProps` and render `{children}` right after
      `fields.map(…)`. Test in `list-toolbar.test.tsx`: "renders extra controls after the fields and
      before the chips" (render with `<button type="button">Extra</button>`, one search field and
      one active filter, so one chip shows; `search.compareDocumentPosition(extra) & Node.DOCUMENT_POSITION_FOLLOWING`, and the same for `extra` → the chip and the chip →
      the `Clear filters` link). Run form U on the file. Commit (form C) after
      `git add components/data-display/list-toolbar.tsx components/data-display/list-toolbar.test.tsx`:

```
refactor(kit): let ListToolbar host extra controls

An optional children slot renders after the fields and before the chips, so the audit trail can
add its actor search without a toolbar field kind that knows about users. Additive: no existing
call site changes.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

- [ ] **Step 2: Write the failing tests.**

`audit-actor-picker.test.tsx` (mock `next/navigation` as `audit-view-toggle.test.tsx` does, with
`usePathname: () => '/admin/audit'` and `useSearchParams: () => new URLSearchParams('entityType=USER&page=2&event=e1')`; stub `fetch` as
`user-picker.test.tsx` does, answering `{ items: [VICTOR_OPTION] }`):

```tsx
it('filters by the chosen user and returns to the first page', async () => {
  renderWithProviders(<AuditActorPicker />);
  await user.type(screen.getByRole('combobox', { name: 'Actor' }), 'vic');
  await user.click(await screen.findByRole('option', { name: /Victor Otieno/ }));
  const [href] = router.push.mock.lastCall ?? [];
  const url = new URL(String(href), 'http://localhost');
  expect(url.pathname).toBe('/admin/audit');
  expect(url.searchParams.get('actorId')).toBe(VICTOR);
  expect(url.searchParams.get('entityType')).toBe('USER');
  expect(url.searchParams.has('page')).toBe(false);
  expect(url.searchParams.has('event')).toBe(false);
});
```

`audit-filters.test.tsx`: "offers the actor search only when users can be searched" (`actorSearch`
→ a combobox named `Actor`; without it, none).

- [ ] **Step 3: Run them to verify they fail** — form U. Expected: FAIL.

- [ ] **Step 4: Implement**

```tsx
'use client';

import Box from '@mui/material/Box';
import { useListNavigation } from '@/components/data-display/use-list-navigation';
import { UserPicker } from '@/modules/administration/users/components/user-picker';

/** Spec §10.1: the actor filter by user search (the first 10 matches). Choosing a user filters by
 * `actorId` and returns to the first page; the toolbar's chip shows and removes the filter. */
export function AuditActorPicker() {
  const navigate = useListNavigation();
  return (
    <Box sx={{ width: { xs: '100%', sm: 260 } }}>
      <UserPicker
        name="actorSearch"
        label="Actor"
        onChange={(chosen) => {
          if (!chosen) return;
          navigate((params) => {
            params.set('actorId', chosen.id);
            params.delete('page');
            params.delete('event');
          });
        }}
      />
    </Box>
  );
}
```

`AuditFilters` gains `actorSearch?: boolean` and `actorId?: string` and renders
`{actorSearch && <AuditActorPicker key={actorId ?? 'none'} />}` as `ListToolbar`'s children (the
key clears the picker after each navigation). The audit page adds `getCurrentContextProfile()` to
its `Promise.all` and passes `actorSearch={can(holder, 'user.view')}` (the search reads
`/tenant/users`) and `actorId={query.actorId}`.

- [ ] **Step 5: Write the user Audit tab** `…/[userId]/audit/page.tsx` (`metadata.title` `'User audit trail'`):

```tsx
/** Four views (spec §10.1): one user's history spans several entity types (contract §G). */
export default async function UserAuditPage({ params, searchParams }: UserAuditPageProps) {
  const userId = parseUserId((await params).userId);
  if (!userId) notFound();
  const [user, selected] = await Promise.all([load(getUser(userId)), getCurrentContextProfile()]);
  if (!user.ok) return null; // the layout renders the failure
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };
  // The layout's arguments, so `cache()` serves its read.
  const membership = can(holder, 'membership.view')
    ? await load(findUserMembership(user.value.id, user.value.email))
    : null;
  const membershipId = membership?.ok ? (membership.value?.id ?? null) : null;
  return (
    <RecordAuditTab
      views={[
        { value: 'user', label: 'User record', filter: { entityType: 'USER', entityId: userId } },
        {
          value: 'account',
          label: 'Account',
          filter: { entityType: 'USER_ACCOUNT', entityId: userId },
        },
        ...(membershipId
          ? [
              {
                value: 'membership',
                label: 'Membership',
                filter: { entityType: 'MEMBERSHIP' as const, entityId: membershipId },
              },
            ]
          : []),
        { value: 'actor', label: 'Performed by', filter: { actorId: userId } },
      ]}
      params={toSearchParams(await searchParams)}
      path={`/admin/users/${userId}/audit`}
      description="This user's history across their record, account and membership, and what they did. Role and branch assignment changes are recorded on each assignment and branch, so they don't appear here."
    />
  );
}
```

If TypeScript widens the literal past the non-empty tuple, declare it as
`const views: [RecordAuditView, ...RecordAuditView[]] = […]` first.

- [ ] **Step 6: Pin the id guard at route level** — `…/[userId]/user-id-guard.test.tsx`, built like
      16's `institution-id-guard.test.tsx` (a `vi.hoisted` `reads` object of every mocked read; `next/headers`; `next/navigation`
      with `notFound` throwing `NEXT_NOT_FOUND`; `getCurrentContextProfile` → `{ kind: 'unresolved' }`;
      every read rejecting `unreachable backend`). Mock the modules the five routes read through:
      `user-service` (all six reads), `role-service` (`listRoleAssignments`), `branch-service`
      (`listBranches`), `audit-service` (`listAuditEvents`) and `@/lib/api/lookups`. Routes: the
      layout and the four tab pages, each with `params: Promise.resolve({ userId })` (tabs also
      `searchParams: Promise.resolve({})`).

```tsx
describe.each(Object.entries(routes))('%s', (_name, render) => {
  it.each(['not-a-uuid', '../x', '', `${FELIX}x`])('answers %j with not-found', async (id) => {
    await expect(render(id)).rejects.toThrow('NEXT_NOT_FOUND');
    for (const read of Object.values(reads)) expect(read).not.toHaveBeenCalled();
  });

  it('reads an upper-case id lower-cased (Ruling 16)', async () => {
    await Promise.resolve(render(FELIX.toUpperCase())).catch(() => undefined);
    expect(reads.getUser).toHaveBeenCalledWith(FELIX); // FELIX ends in a letter (…00d)
  });
});
```

Prove it: make one tab page `return null` on a bad id instead of `notFound()` → its rows fail.

- [ ] **Step 7: Rewrite the README limitation** under the Audit trail bullet: "An actor is filtered
      by clicking their name on a visible row, not by a search box, until a users directory ships a
      picker." becomes "An actor is filtered by picking a user in the Actor search (the first 10
      matches; it needs `user.view`) or by clicking their name on a visible row."

- [ ] **Step 8: Run** — form U on `modules/administration/audit components/data-display` and
      `'app/(authenticated)/admin/users'`; form E on `e2e/audit.spec.ts`. Expected: PASS. Check
      `AuditViewToggle` with four views at 375 px in the dev server only if Task 11's axe case fails on it; the kit file is frozen, so a defect is a
      reported `fix(kit):` commit.

- [ ] **Step 9: Commit** (form C)

`git add modules/administration/audit 'app/(authenticated)/admin/audit/page.tsx' 'app/(authenticated)/admin/users/[userId]/audit/page.tsx' 'app/(authenticated)/admin/users/[userId]/user-id-guard.test.tsx' README.md`

```
feat(audit): add the user Audit tab and the audit trail's actor picker

The user record's Audit tab offers four views: the user record, the account, the membership and
what the user did. The audit trail gains an Actor search, so an actor no longer has to be on a
visible row to be filtered by. A route test pins that the layout and every tab answer a bad id
with not-found before any read.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

---

### Task 9: Shared E2E helpers for the users spec

Carry-in e, first half (16's Task 8 minor 4; split per review 1 §6): the helpers `users.spec.ts`
needs. The older specs keep their copies until Task 10.

**Files:**

- Modify: `e2e/support/auth.ts` (export `expectHydrated`; `selectMuiOption` uses it)
- Modify: `e2e/support/admin.ts` (export `mainText`, `statusChip`, `rowsOf`, `notFoundHeading`)

**Interfaces:**

- Produces (`e2e/support`):
  - `expectHydrated(locator: Locator): Promise<void>` — `selectMuiOption`'s 20 s poll and comment;
  - `mainText(page, value: string | RegExp, options?: { exact?: boolean }): Locator` — scoped to
    `getByRole('main')` (keep the long explanation comment from `branches.spec.ts` here, once);
  - `statusChip(page, value: string): Locator` — `mainText(page, value, { exact: true }).first()`;
  - `rowsOf(page, table: string): Locator` — every `row` of the named table, **the header row
    included** (N data rows → N + 1);
  - `notFoundHeading(page): Locator` — `heading level 1 "We couldn't find that page"`, with the
    "assert content, never `response.status()`" comment.

- [ ] **Step 1: Add the helpers**, copied from `branches.spec.ts` (`mainText`, `statusChip`,
      `rowsOf`) and `platform-tenants.spec.ts` (`hydrated`, `notFoundHeading`); `selectMuiOption`
      calls `expectHydrated(combobox)`. Run form E on `e2e/shell.spec.ts e2e/roles.spec.ts` (both
      use `selectMuiOption`): PASS. Commit (form C) after `git add e2e/support`:

```
test(e2e): add shared hydration, main-text, row and not-found helpers

The users spec needs the hydration poll, main-scoped text and chip locators, table rows and the
not-found heading; they now live in e2e/support, and selectMuiOption uses the shared poll.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

---

### Task 10: Migrate the older specs onto the shared helpers (droppable)

Carry-in e, second half; last before Task 11 and **droppable** (`users.spec.ts` uses only Task 9's
helpers): if it isn't clean within two attempts, `git restore e2e` and report it deferred. Partial by
design: `fake-api-{platform-tenants,profile,settings}.spec.ts` keep their own `FAKE_API_URL`.

**Files:**

- Modify: `e2e/support/admin.ts` (add `openRecord(page, table: string, name: string): Promise<void>`
  — clicks the exact link in the named table and waits 15 s for the `h1`)
- Modify: `e2e/branches.spec.ts`, `e2e/roles.spec.ts`, `e2e/platform-tenants.spec.ts`,
  `e2e/context.spec.ts` (the inline hydration poll), `e2e/fake-api-branches.spec.ts`,
  `e2e/fake-api-roles.spec.ts` (use Task 3's `e2e/support/fake-api.ts`)

- [ ] **Step 1: Take the baseline before any edit** — form E in two chunks:
      `bash $S/e2e/run-e2e.sh e2e/branches.spec.ts e2e/roles.spec.ts e2e/fake-api-branches.spec.ts e2e/fake-api-roles.spec.ts`
      then `bash $S/e2e/run-e2e.sh e2e/platform-tenants.spec.ts e2e/context.spec.ts`. Record each
      chunk's passed count in the task report.
- [ ] **Step 2: Migrate** — delete each spec's local copy and import the shared one. Call-site
      changes: `openRecord(page, name)` → `openRecord(page, '<Branches|Roles|Institutions>', name)`;
      platform-tenants' one-argument `rowsOf(page)` → `rowsOf(page, 'Institutions')`; its
      `hydrated(…)` and context.spec's inline poll → `expectHydrated(…)`; the two fake specs'
      `FAKE_API_URL`/`api`/`contextFor` → `./support/fake-api`. Spec-specific helpers (`act`,
      `lifecycle`, `dialogOf`, `pick`, `next`, `openTab`, `openDirectory`) stay where they are.
- [ ] **Step 3: Prove behaviour is unchanged** — the same two chunks: the baseline's counts, all
      passing; `grep -rn "__reactProps" e2e` finds only `e2e/support/auth.ts`. Commit (form C) after
      `git add e2e/support e2e/branches.spec.ts e2e/roles.spec.ts e2e/platform-tenants.spec.ts e2e/context.spec.ts e2e/fake-api-branches.spec.ts e2e/fake-api-roles.spec.ts`:

```
test(e2e): move the older specs onto the shared helpers

Four specs and two fake specs drop their copies of the hydration poll, the main-text, row,
record-opener and not-found helpers and the fake-API context helper, and import e2e/support's.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

---

### Task 11: End-to-end coverage with the accessibility matrix, and the docs

**Files:**

- Create: `e2e/users.spec.ts`
- Modify: `README.md`, `AGENTS.md`, `docs/backend-gaps.md`

**Interfaces:**

- Consumes: Task 3's scenarios and `USER_SCENARIO_IDS`; `IDS`; Task 9's helpers; `enterAdmin`,
  `A11Y_CASES`, `applyA11yCase`, `expectA11yCaseApplied`, `expectNoSeriousOrCriticalViolations`;
  `authenticate`, `selectMuiOption`, `expectHydrated`.
- Produces: `e2e/users.spec.ts`; the layer's docs.

The spec copies the copy strings it asserts (`PROVISIONING_NOTE`, `NO_MEMBERSHIP_VIEW`,
`OWN_MEMBERSHIP`, `USER_MAKER_CHECKER_BLOCKED`, `PARTIAL_SCAN_NOTE`) as local constants: Playwright
can't resolve the app's `@/` imports, and an E2E only imports import-free app modules (as
`settings.spec.ts` does). **Every row count below is a `rowsOf` count: the header row is included.**

Seeded directory (`users`, newest first, 13 users): Joann Mwangi, Ann Mwangi, the 100-character
Wanjiru, Hassan Ali, Gladys Chebet, Felix Omondi, Esther Njoki, Daniel Mutua, Carol Wambui, Brian
Kiprono | Amina Odhiambo, Victor Otieno, Backend Jane Manager.

- [ ] **Step 1: Write the spec** — three `describe` blocks (so it runs in chunks), each
      `test.describe.configure({ timeout: 90000 })` (the accessibility block 180000). Local helpers:
      `openDirectory(page, branch = ALL_BRANCHES)` (`enterAdmin(page, '/admin/users', { heading: 'Users & access', branch })`), `openUser(page, id, name)` (`page.goto`, then the `h1`),
      `openTab(page, label)` (click the tab, poll the pathname's last segment), and `act(page, label, reason?)` (as `platform-tenants.spec.ts`'s, scoped to `alertdialog` or `dialog`). Every test
      starts with `authenticate(context, testInfo, <scenario>)`. Tests and key assertions:

**`describe('users: directory and lifecycle')`** (scenario `users`):

1. "lists users newest first and filters them through the URL" — `13 users`; the `Users` table
   has 11 rows (10 users) and the first data row is Joann Mwangi; the rail link `Users & access` has
   `aria-current="page"`; search `mwangi` + Enter → `searchParams.get('q') === 'mwangi'` and 3 rows,
   Joann and Ann; Clear filters, then Membership = Pending approval → `searchParams.get('membershipStatus') === 'PENDING_APPROVAL'`, 5 rows (four users), Daniel's Onboarding cell showing `Provisioning identity` (his User status cell reads the same, so check the cell, never a row-wide exact `getByText`) and Amina's `Awaiting approval`; Clear filters, then `Go to next page` → `searchParams.get('page') === '1'` and
   4 rows: Amina, Victor and Backend Jane Manager.
2. "approves a user with no sign-in identity: provisioning starts (202)" — Amina → `act('Approve')`
   → toast `Approval recorded`; `statusChip('Provisioning identity')` (the hero's onboarding chip; the
   Overview's User status chip reads the same, so the helper's `.first()` is deliberate); no `Approve` button;
   `Reject & revoke` is focused; the Overview shows `PROVISIONING_NOTE`.
3. "approves an existing account straight to active (200)" — Brian → `statusChip('Active')`;
   `Suspend` and `Revoke` offered; `Suspend` is focused.
4. "disables Approve for the user's inviter and explains why" — Carol → `Approve` is disabled with
   the accessible description `USER_MAKER_CHECKER_BLOCKED`; `Reject & revoke` is enabled.
5. "rejects and revokes a provisioning user permanently, checking the reason on the server" —
   Daniel: no `Approve`; `Reject & revoke` opens the `alertdialog` `Reject and revoke Daniel Mutua?`
   containing `can never be invited to this institution again`; the reason `  a  ` (passes the
   browser's `minLength`) → `Give a reason of at least 3 characters.` in the dialog and the textbox
   still holds `  a  `; then `Duplicate invitation` → `statusChip('Revoked')`, no lifecycle button,
   and the `h1` `Daniel Mutua` is focused.
6. "suspends and reactivates a member, and audits both" — Esther: Suspend (reason `Cash audit`) →
   `Suspended`, `Reactivate` focused; Reactivate with no reason → `Awaiting first sign-in`,
   `Suspend` focused; the Audit tab's default view (region `Audit trail`) shows `Suspended membership`
   and `Reactivated membership`.
7. "revokes a suspended membership and every assignment" — Gladys: Revoke (reason `Left the SACCO`,
   an `alertdialog`) → `Revoked`, no lifecycle button, the `h1` focused; Roles & access shows `No roles assigned`; Branch assignments shows `No branch assignments`.
8. "disables Suspend and Revoke on your own record" — `IDS.jane`: `Suspend` and `Revoke` are both
   disabled, each with the accessible description `OWN_MEMBERSHIP`.
9. "shows each user's own membership facts, even when emails nest" — Ann's
   `getByRole('region', { name: 'Membership', exact: true })` has the text `Admin` (exact) and no
   `Staff`; Joann's has `Staff` and no `Admin` (the fake lists Joann first for Ann's email, so a
   first-hit resolver fails here); Felix's shows
   `Created (Africa/Nairobi)` with `01 Jul 2026 · 11:00` (the seed's `2026-07-01T08:00:00Z` in the
   organisation's zone).

**`describe('users: access and audit')`** (scenario `users` unless named):

10. "assigns and revokes roles, offering branch scope only where the user is assigned" — Felix's
    Roles & access: the `Role assignments` table has 4 rows (three assignments), one with `Disabled`; Assign role → the
    `Role` options don't include `Loans officer`; choose `Branch supervisor (SUPERVISOR)`, Scope `One branch` → the `Branch` listbox has exactly one option, `Westlands Branch (WESTLANDS)`; submit →
    toast `Role assigned`, 5 rows; revoke
    `Revoke Felix Omondi's Branch supervisor assignment (Westlands Branch)` → 4 rows, the `h1`
    focused. Then Wanjiru: Assign role → the Scope field's description contains `Assign them to a branch first to give a branch-scoped role.` and `One branch` is `aria-disabled`.
11. "assigns a branch and explains the last-assignment refusal" — Felix's Branch assignments: 2
    rows (Westlands, Home); Assign branch → `Head Office (HEAD_OFFICE)`, type `Operate` → toast
    `Branch assigned`, 3 rows; revoke `Revoke Felix Omondi's Operate assignment at Head Office` →
    2 rows; revoke `Revoke Felix Omondi's Home assignment at Westlands Branch` → the dialog stays
    open with `may be the user's last branch assignment`.
12. "narrows a branch context to its branch" — `openDirectory(page, /Westlands/)`; Felix's Branch
    assignments shows `Only Westlands Branch is visible with a branch selected.` and a `Switch to All branches` button; his Roles & access still offers the Revoke for the Westlands BRANCH row;
    Esther's Assign role drawer says `They aren't assigned to Westlands Branch. Assign them there first to give a branch-scoped role.`
13. "shows a user's history in four audit views" — Felix's Audit tab: the `Audit view` group has
    `User record` (pressed), `Account`, `Membership`, `Performed by`. In **each** view
    `rowsOf(page, 'Audit events')` has exactly 2 rows (one event), so a dropped `entityId` fails (the
    seeds hold 4 other USER invites and greenfield's MEMBERSHIP revokes): User record shows
    `Invited user`; Account (`searchParams.get('view') === 'account'`) and Performed by show
    `Activated on first sign-in`; Membership shows `Activated membership`.
14. "filters the audit trail by an actor picked from the user search" — `enterAdmin(page, '/admin/audit', { heading: 'Audit trail', branch: ALL_BRANCHES })`; `expectHydrated` on the
    `Actor` combobox; type `Victor`, pick `Victor Otieno` → `searchParams.get('actorId') === USERS.victor`, the chip `Actor: Victor Otieno`, and `4 events` (his four invites; 406 is Jane's).

**`describe('users: gating and ids')`:**

15. "offers no membership actions without membership.view, and says why" (`users-limited`) —
    Amina: no `Approve`/`Reject & revoke`; `NO_MEMBERSHIP_VIEW` shown; the `Roles & access` tab
    exists (the positive control) and the `Audit` tab doesn't; the Overview's Membership card says
    `You can't view membership details in your current role.`
16. "offers no mutations without the permissions" (`users-read-only`) — Amina: no lifecycle button
    and no note, while the `Membership pending approval` chip shows; Roles & access: the `Teller`
    row shows but no `Assign role` or `Revoke`; Branch assignments: the `Westlands Branch` row shows
    but no `Assign branch` or `Revoke`.
17. "answers an unknown or malformed user id with the not-found page" — `/admin/users/<a fresh 10000000-… id>`, `/admin/users/not-a-uuid` and `/admin/users/not-a-uuid/access` each show
    `notFoundHeading` (content, never the status).
18. "canonicalises a mixed-case user id" — `/admin/users/${USERS.felix.toUpperCase()}` shows the
    `h1` `Felix Omondi`, and its Audit tab shows `Invited user` (the fake compares ids exactly, so
    only the lower-casing makes this pass).
19. "marks a scan that hit its ceiling as partial" (`users-many-assignments`) — Felix's Overview
    reads `Branch assignments` `At least 1 (partial)`; his Branch assignments tab shows
    `PARTIAL_SCAN_NOTE` and 2 rows (Westlands, Home). A second leg selects the branch that holds the
    511 filler assignments (Head Office; check the seed in `scenarios.mts` and the fake's branch
    filter before pinning anything) and asserts the tab shows BOTH `branchContextNote` and
    `PARTIAL_SCAN_NOTE` (Ruling 6: a capped scan is partial in a branch context too) and the
    Overview count carries the hedge (`At least N at <branch> (partial)`); pin the exact N from the
    fake, never guess it.

**`describe('users: accessibility')`** — one test per `A11Y_CASES` entry (scenario `users`):
`applyA11yCase` before navigating; after each surface settles, `expectA11yCaseApplied` and
`expectNoSeriousOrCriticalViolations`. Surfaces: the directory; Wanjiru's Overview (100-character
name and email); Wanjiru's Roles & access with the Assign role drawer open (at 375 px also assert
the drawer paper's `scrollWidth <= clientWidth`, as `roles.spec.ts`'s `expectDrawerFits`); Felix's
Branch assignments with the Assign branch drawer open; Carol's Overview (the disabled Approve and
its caption); Felix's Audit tab on the Account view (the
four-view toggle at 375 px); Daniel's Reject & revoke `alertdialog` (wait until its opacity is `1`,
as `platform-tenants.spec.ts` does); `/admin/audit` with the Actor listbox open (type `a`).

- [ ] **Step 2: Run the spec** in three foreground chunks:
      `bash $S/e2e/run-e2e.sh e2e/users.spec.ts --grep "users: directory and lifecycle"`, then
      `--grep "users: access and audit|users: gating and ids"`, then
      `--grep "users: accessibility"`. Expected: all pass. Prove four guards by a temporary break,
      reverted before the commit: make `findUserMembership` return the first hit (test 9 fails);
      drop `.toLowerCase()` from `parseUserId` (test 18 fails); drop the PROVISIONING_IDP clause in
      `availableMembershipActions` (test 5 fails: Approve shows for Daniel); drop the `subject.self`
      clause in `blockedMembershipActions` (test 8 fails: Suspend is enabled). Not the
      `membership.view` gate: without the view the layout never resolves a membership, so test 15
      can't see that gate; Task 1's matrix pins it. Delete any scratch spec. If an axe case fails on
      a kit component, rule 13 applies: one reported `fix(kit):` commit or an escalation.

- [ ] **Step 3: Commit the spec** (form C) — `git add e2e/users.spec.ts`

```
test(e2e): cover users and access end to end, with the accessibility matrix

The spec covers the directory's URL filters and paging, approval with 202 and 200, maker-checker,
reject and revoke, suspend and reactivate, your own record, nested-email membership resolution,
role and branch assignment with their branch-context limits, the four audit views, the actor
picker, gating without membership.view or mutation codes, id checks and the partial scan, plus axe
in light and dark at desktop and 375 px.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

- [ ] **Step 4: Update `README.md`** (pre-flight note 6's anchors; rewrap to ~100 columns):
  1. The `admin/` tree comment becomes "Overview, Users & access, Branches, Roles & permissions,
     Settings, Business date, and Audit trail pages; a later layer adds the Approval queue as its own
     nav item (spec §8)". The `roles/` entry becomes `├──`, followed by
     `settings/page.tsx` ("Settings catalogue: read-only controls, reset to default") and a `users/`
     entry: "Users & access: directory (search, user and membership status filters), and the record
     ([userId]/: hero membership lifecycle; Overview, Roles & access, Branch assignments and Audit
     tabs)".
  2. The `modules/` sentence "users/ holds tenant user search for pickers" becomes "users/ holds the
     users and membership contract, directory query, onboarding and action rules, service,
     membership Server Actions, user search for pickers, and components; settings/ holds the
     settings catalogue's contract, rules, service and Server Actions".
  3. The `data-display/` entry's "ListToolbar (search/select/datetime)" becomes "ListToolbar
     (search/select/datetime, plus extra controls as children)".
  4. "Administration currently ships the Overview, Business date, Audit trail, Branches, and Roles &
     permissions pages; Approval queue and Users & access are built out …" becomes "Administration
     currently ships the Overview, Users & access, Branches, Roles & permissions, Settings, Business
     date, and Audit trail pages; the Approval queue is built out (with real data, not placeholders)
     when its layer lands, registering its own item in
     `modules/administration/administration-navigation.ts`."
  5. After the Roles & permissions bullet, add a Settings bullet (carry-in b; check every clause
     against `modules/administration/settings/settings-flags.ts` and `settings-rules.ts`): "Settings
     (`/admin/settings`, `modules/administration/settings/`) reads the catalogue and the tenant's
     stored keys in one bounded read. Editing ships disabled behind `SETTINGS_EDIT_ENABLED` because
     the platform can't save changes yet (`docs/backend-gaps.md` BG-04); reset to default works. The
     two maker-checker switches and automatic advance are shown read-only with honest labels
     (BG-12)."
  6. Then a Users & access bullet:

     ```
     - Users & access (`/admin/users`, `modules/administration/users/`) lists the tenant's users
       from `GET /tenant/users` (search, user status and membership status filters; newest first,
       no sort) and opens a record with the membership lifecycle (approve, reject and revoke,
       suspend, reactivate, revoke) and Overview, Roles & access, Branch assignments and Audit tabs.
       Known limits:
       - The directory shows only what user summaries carry, and the onboarding state is derived
         from the membership and user statuses (`docs/backend-gaps.md` BG-09, BG-11).
       - A user's membership is found by searching memberships for their email (at most 5 pages of
         100 matches) and matching the user id exactly; their branch assignments come from a scan of
         at most 500 active assignments, marked partial when it stops early, and only the selected
         branch shows while one is selected (BG-09, BG-03). Assign branch offers the first 100
         active branches.
       - Approve is disabled, with the reason, for the user's inviter (when `audit.view` can show
         who that was) and for a blocked account, and withheld once approval ran; other refusals
         are explained as permission or maker-checker (BG-08, BG-07). "Provisioning identity" can
         stay put with no resend (BG-11).
       - Reject & revoke and Revoke are permanent: the email can't be invited again (BG-28).
         Suspend and Revoke are disabled on your own record (BG-35).
       - A branch-scoped role offers only branches the user is assigned to. Branch assignment
         changes are audited on the branch, so the Audit tab can't show them (BG-16).
       - No phone, member number, last activity, MFA or profile edit (BG-17).
       - The toolbar search commits on Enter or blur, and backend `validation_failed` violations
         aren't mapped onto form fields (BG-09).
     ```

  7. "Beyond context discovery/selection, profile retrieval, Platform Administration's institutions,
     and Administration's Branches and Roles & permissions above, other domain API modules (e.g.
     Users & access) are not connected yet." becomes "… and Administration's Users & access,
     Branches, Roles & permissions and Settings above, the Approval queue is not connected yet."
  8. Step 2 of "Next recommended implementation steps" becomes "Build out the Approval queue and the
     Invite user wizard (layers 12 and 11) against real data, each registering what it needs."

- [ ] **Step 5: Update `AGENTS.md`** — after the sentence that ends the fourth named paging exception
      ("… (plan `docs/superpowers/plans/2026-10-01-admin-parity-09-roles.md`, Ruling 6)."), add:

```
  The user record's Branch assignments tab (`modules/administration/users`'s
  `listUserBranchAssignments`: a bounded scan of at most 5 × 100 ACTIVE assignments, because the
  backend can't filter branch assignments by user, BG-09) and its Assign-branch drawer's options
  (one page of 100 ACTIVE branches, saying so when there are more) are a fifth, named exception: the
  tab pages what the scan found with the URL holding page and size and says when it may be
  partial, and the options are a picker's option set, not a data-listing directory — no licence
  for an unbounded list (plan `docs/superpowers/plans/2026-10-03-admin-parity-10-users.md`,
  Rulings 8 and 11).
```

`findUserMembership` is not named: it is a bounded lookup (≤ 5 × 100, handoff §3.7), not a listing.

Check `git diff AGENTS.md` for a `next dev` header rewrite before staging (AGENTS.md's own note).

- [ ] **Step 6: Update `docs/backend-gaps.md`**
  1. BG-07's gap list: "approving an unknown, non-pending, or provisioning membership" becomes
     "approving an unknown, non-pending or provisioning membership, or one whose user lacks an active
     role (or, for a staff or admin member, an active branch assignment)"; its frontend handling gains
     "The user record withholds Approve once approval ran and names the likely causes of the other
     approval 500s."
  2. BG-08's frontend handling gains "The user record disables Approve for the user's inviter (the
     `user.invite` actor)."
  3. BG-09's frontend handling: "memberships resolved with `q=<email>`" becomes "memberships resolved
     with `q=<email>` (at most 5 pages of 100, matched on the user id)", and "a user's branch
     assignments found by a bounded scan and flagged "partial"" gains "(at most 500 active
     assignments)".
  4. A new summary row and section, after BG-34 (the Gap text is 75 characters; pad the cell to
     the column):

```
| BG-35 | P2       | No documented self-lockout guard: a member may suspend or revoke themselves |
```

```
### BG-35 — No documented self-lockout guard on memberships · P2

- **Gap:** The contract documents no guard against a caller suspending or revoking their own
  membership, or revoking their own role assignments (§E.3 names none; source 7a7f4c3). Without
  one, a self-suspend ends the session's context at once, because every request re-validates an
  ACTIVE membership (§A), and a self-revoke is permanent (BG-28). Not probed live: the probe
  itself would be irreversible.
- **Frontend handling:** the user record shows Suspend and Revoke disabled on the signed-in user's
  own record, with the reason; revoking your own role assignment warns in its confirmation
  (layer 09).
- **Suggested change:** document the guard if one exists; otherwise refuse a self-suspend and a
  self-revoke with a 409 and a specific code.
```

- [ ] **Step 7: Format the docs** — `pnpm exec prettier --check README.md AGENTS.md docs/backend-gaps.md`; fix what it reports with `--write`.

- [ ] **Step 8: Commit the docs** (form C) — `git add README.md AGENTS.md docs/backend-gaps.md`

```
docs(users): describe users and access, the bounded scans, and the self-lockout gap

README documents the Users & access pages and their limits, the Settings page that layer 13
shipped, and the toolbar's children slot. AGENTS.md names the Branch assignments scan and the
Assign-branch options as a paging exception. The backend gaps gain BG-35 and the user record's handling under BG-07, BG-08
and BG-09.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

---

## Layer gate (workflow gate phase; not a task)

Implementers never execute this section.

- **Gates:** `pnpm check`, `pnpm build`, and the full `pnpm test:e2e` through the wrapper in chunks
  of at most 8 minutes (sharded), all clean; CI Verify green on the pushed head.
- **Visual and keyboard pass** (light and dark, 1440 and 375 px; ui-ux-pro-max pre-delivery
  checklist):
  1. Directory: the toolbar wraps at 375; the table scrolls in its container, never the page; the
     100-character name ends in an ellipsis with its full value in `title`; the avatar is decorative;
     visible focus on the search, selects, name links and pagination.
  2. Record hero: the person avatar, the long `h1` wrapping, the two chips, the actions sharing the
     row at 375; the disabled Approve's and your own Suspend/Revoke captions; the note captions.
  3. All five dialogs: focus trap; Escape and the backdrop close only when idle; the permanence
     warning in both destructive `alertdialog`s; errors inside the dialog with their reference; focus
     after success per rule 11 (the replacement action, else the first, else the title).
  4. Overview: the three cards, the onboarding list's `role="list"` read as a list, the provisioning
     note.
  5. Both drawers at 375 (fit, sticky footer never hides the focused control, the scope hint
     readable); the Branch assignments Alerts and the Switch to All branches button.
  6. The four-view `AuditViewToggle` at 375 (wrap, focus ring) — the handoff's open check; the
     `/admin/audit` Actor search beside the other filters at 1440 and stacked at 375.
  7. Keyboard only: from the directory, approve a pending user, assign a role and a branch, and
     reach every tab.
- **Final review and fix wave** as the workflow defines (several lenses; triage every deferred minor
  with MUST-FIX / DEFER(layer) / DROP).

## Controller live check (controller only; not a task)

Implementers never execute this section. Batch L2 of the handoff: a person signs in on the dev
identity provider; reads come first; each mutation needs its own approval; never advance the business
date.

- **Reads:** the users list with each filter and paging; a record per onboarding state that dev
  has; `GET /tenant/memberships?q=<email>` matched on `user_id` (record whether any email returns
  more than one page); role and branch assignment reads; the four audit views; count the reads per
  record navigation against the 600/min budget.
- **Mutations** (each approved; throwaway member only): suspend then reactivate; assign then revoke
  a role (never the signed-in user's own TENANT_ADMIN); assign then revoke a branch assignment (a
  staff or admin member's last one should be a 409).
- **Irreversible, only on explicit approval:** Revoke and Reject & revoke (terminal, BG-28) and
  Approve (a 202 starts real identity provisioning and possibly an email; it needs a second identity
  that is not the inviter).
- **Record:** ledger lines with request IDs; a contract surprise goes to the contract document, a
  backend defect to BG-36 onwards.

## Self-review

- **Spec coverage** (§10.5): the directory, its filters and columns, newest first (Tasks 1, 2, 4,
  11); the onboarding table (Task 1, total over all pairs); the record's tabs (Tasks 5–8); the
  membership resolution by `q=<email>` matched on `user_id` (Tasks 2, 11); the hero actions by status
  and permission, Approve's PROVISIONING_IDP and inviter rules, the permanence warnings and reasons
  (Tasks 1, 2, 5, 11); the bounded branch scan marked partial (Tasks 2, 3, 7, 11); the omissions stay
  omitted (D7; README via Task 11). §10.1: the four views and the actor search (Task 8). §6.5:
  branch-context narrowing and the guided note (Tasks 6, 7, 11). §6.6: blocked actions shown
  disabled with the reason (Tasks 1, 5, 11). §6.8: ids validated before any read (Tasks 1, 5–8 and
  the guard test, 11). §8: the nav item (Task 4).
- **Carry-ins:** a → Task 5 Step 1; b → Task 11 Step 4; c → Task 2 Step 6 (`roleId`, plus
  `branchId`) and Task 6 Step 1 (`branchHint`, JSDoc); d → layer 11, overriding the 16 triage (no
  layer-10 form collects a username or phone; questions Q5); e → Task 3 Step 7, Task 9 (helpers)
  and Task 10 (droppable migration); f → layer 11, overriding the 16 triage (no read-only field;
  questions Q6); g → the handoff's layer-10 items: the actor picker and README sentence (Task 8),
  the `AuditViewToggle` 375 check (Task 11 axe and the gate), the user-search re-point (Task 1),
  `getRoleIndex` and the role-assignment contract (Task 6), unmapped server violations (README,
  Task 11).
- **Interfaces:** every name in a task's **Produces** list (Tasks 1–3, 5–9) is spelled the same in
  every task that consumes it, including `blockedMembershipActions`, `MembershipLookup` and
  `SelectOption`.
- **Review Focus:** each of the five classes names its tests in Tasks 1–3, 5–8 and 11.
- **Lint and type traps:** no dotted `color` prop anywhere (rule 4); `'use server'` exports only
  async functions; `.mts` formatted by hand (form P); `noUncheckedIndexedAccess` (`mock.lastCall?.[0]`,
  `branches[0]?.id ?? ''`); the record-audit views tuple; `SyntheticEvent`, never `FormEvent`; no
  `setState` in an effect.
