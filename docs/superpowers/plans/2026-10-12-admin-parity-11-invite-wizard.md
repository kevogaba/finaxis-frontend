# PR 11: Users — the Invite user wizard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [plan index](./2026-09-25-admin-parity-00-index.md),
> the layer-11 section of the [handoff](./2026-10-02-admin-parity-handoff.md), the
> [10 users plan](./2026-10-03-admin-parity-10-users.md), the
> [16 platform tenants plan](./2026-10-01-admin-parity-16-platform-tenants.md) (its `WizardForm`
> and `TenantDraftWizard` are this wizard's model) and the
> [12 approvals plan](./2026-10-04-admin-parity-12-approvals.md) first.

**Goal:** Build the Invite user wizard (spec §10.5, §6.4, §9, §7.3):

- `/admin/users/new`: a four-step wizard on 16's `WizardForm` — **Identity** (full name, email,
  username, optional phone, membership type), **Access** (branch assignments, roles with their
  scope, an optional primary branch), **Invitation** (the two invitation flags) and **Review**
  (every answer by step, each with Edit) — that sends one `POST /tenant/users` and opens the new
  user's record, where the invitation waits for a different administrator's approval;
- an **Invite user** button on the `/admin/users` directory for a holder of every code the wizard
  needs;
- pre-validation of every backend rule the tenant context can check (BG-07): the email already
  having a membership here (checked on Identity's Continue), STAFF/ADMIN without a branch, no role,
  a branch-scoped role at a branch they aren't assigned to, inactive roles and branches (never
  offered), and duplicate rows.

No later layer depends on 11.

**Architecture:**

- `/admin/users/new` (`page.tsx`) is a Server Component: it gates on the five codes **before any
  read** (Ruling 4), then reads one page of 100 ACTIVE roles (09's `listRoles`) and one of 100
  ACTIVE branches (08's `listBranches`), each settled with `load()`; a 403 shows `ForbiddenState`,
  another failure `ErrorState` with its reference, an empty list a way to fix it (Ruling 10). It
  hands the client wizard plain `{ id, label }` options, two capped flags and
  `contextOrganisationId`.
- Client-safe modules in `modules/administration/users/`: `invite-rules.ts` (the gate, hrefs,
  choices and every string the wizard, the route and the action share) and `invite-schema.ts` (one
  zod schema for React Hook Form, the same rules for the Server Action's FormData, and the explicit
  snake_case body builder). Every Access rule is one object refinement, so all its refusals show in
  one pass at their row's field path (`roleAssignments.0.branchId`).
- The wizard (`InviteUserWizard`, client) is one React Hook Form across the steps with the zod
  resolver: Continue `trigger`s the step's own fields; on Identity it then checks the email
  through a new same-origin Route Handler, `GET /api/tenant/users/invite-check?email=`, which
  reads `GET /tenant/users?q=<email>` (`findMemberByEmail`, exact and case-insensitive; any
  membership status counts, BG-28) (Ruling 1). Review submits everything with the key minted on
  mount; a server field error returns to its step. The steps' fields are their own components
  (`InviteIdentityFields`, `InviteAccessFields` with `useFieldArray`, `InviteInvitationFields`,
  `InviteReview`) over a shared select (`InviteChoiceField`).
- `inviteUser` (`invite-actions.ts`, `'use server'`) runs through `runServerAction` with the
  minted key and `contextOrganisationId`, **posts first**, and only after a 500 looks the email up
  to name a taken one (`email_taken`, 409, mapped to the Email field), or else the username among
  this institution's users (`username_taken`, on Username; Ruling 15), each keeping the 500's
  reference; a replay of a lost 201 is never turned away (16's lesson), and a reused key's 409 says
  an earlier send may have landed (Ruling 16). It redirects to `/admin/users/{user_id}` (no toast,
  Ruling 8), or to the directory when the echo has no readable id.
- The fake API gains `POST /tenant/users` (`e2e/fake-api/routes/invitations.mts`, registered last)
  mirroring the contract's binding, validation and 500 rules (`checkInviteRules`), and the
  scenarios `users-invite` and `users-invite-limited`.
- Cross-layer edits, each in its own commit: the users directory page gains the entry button (its
  first page test); `server.mts` registers the route; `scenarios.mts` adds 11's builders last;
  README, AGENTS.md (an eighth named paging exception), `docs/backend-gaps.md` and the plan index's
  layer-11 branch name.

**Tech Stack:** Next.js 16.3 (Server Components, Server Actions, a Route Handler, `redirect`),
React 19.3 (`useActionState`, `startTransition`), React Hook Form 7.89 (`useFieldArray`,
`useWatch`) with `@hookform/resolvers` 5.9 (zod), zod 4.6, MUI 9.4 (`Stepper` through `WizardForm`,
`TextField` select, `Checkbox`), Vitest + RTL, Playwright + axe. No new packages.

**Spec:** [`…-design.md`](../specs/2026-09-25-admin-prototype-parity-design.md): §10.5 (the
wizard and its pre-validation), §6.4 (RHF, one idempotency key), §6.2 (explicit bodies), §6.7
(500 triggers pre-validated), §9 (wizards: Stepper, per-step validation, a review step, a sticky
action bar), §7.3 (the Stepper theme, 16's).

Contract (`…-api-contract.md`): §A (unknown properties, idempotency, `q` wildcards), §B
(violations), §C (`UserInvitationResult`, `UserInTenantSummary`), §D (InviteUser), §E.3
(`POST /tenant/users`, `GET /tenant/users`, `GET /tenant/roles`, `GET /branches`), §E.4 (invite is
never branch-restricted), §F (who needs a branch). Gaps: BG-02, BG-07, BG-09, BG-11, BG-17, BG-25,
BG-28, BG-33.

**Base:** `e60336d` (`origin/admin-parity/12-approvals`: main with layers 09, 16, 10 and 17, plus
layer 12, PR #62). The layer ships as one commit on `admin-parity/11-invite-wizard`, stacked on
`admin-parity/12-approvals`. The controller keeps the layer's ledger. The **Pre-flight notes**,
**Layer gate**, **Controller live check** and **Self-review** sections are not tasks.

**Plan history:** drafted 2026-10-12 on `e60336d`; revised the same day after adversarial review 1
("Ready after the fixes": its two Important and eight Minor findings and the controller's rulings
on its observations are applied, see Self-review). Each version was applied in a fresh throwaway
worktree in plan order and checked there. The sixteen questions (two blocking) are in the Rulings
table; the user's answers go in its last column.

## Global Constraints

Sources: **A** = `AGENTS.md`; **H3.n** = handoff §3 standing rule n; **L17-R21** = the layer-17
plan's rule 21 (layer 10's Codex lessons); **C** = the controller's rulings for this layer;
**L1–L6** = the lessons of layers 09, 16, 10, 17 and 12 this layer is bound by (layer 12's plan,
Global Constraints): **L1** failed reads, bounded scans and table regions (no blanket catch; a
failed read never shown as absence or zero; a capped list says so); **L2** safety actions (backend
ids, refuse before the write where the page wouldn't offer it, the cross-tab guard and the minted
key, `explain`, mutation proofs); **L3** test discipline (a default profile and the `env.server`
mock in action harnesses, distinct lettered first blocks in ids, a page test per route,
`userEvent.setup({ delay: null })`, focus asserted in its own `waitFor`, e2e hydration, exact
names, one scenario per test, chunkable `describe` titles); **L4** visual and focus (focus after a
form-level failure, accurate copy); **L5** process (split briefs, one commit per task on a clean
tree, docs, prettier); **L6** Next 16 / MUI v9 rules (AGENTS.md). Every task's requirements include
this section. **16's wizard lesson** (W16): a create is posted before any lookup that could turn it
away, so a retry with the same key replays a create whose response was lost
(`tenant-actions.test.ts`, "replays the create before looking at the directory").

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
   `pnpm-lock.yaml` don't change; **no new theme token** (every surface reuses gated pairs). Muted
   text is `sx={{ color: 'text.secondary' }}`, never `color="text.secondary"` on Typography, Box,
   Stack, Grid or DialogContentText. [A]
4. Server Components by default; `'use client'` only for the wizard and its step components; no
   function prop (no `sx` callback, no Server Action, no `component={Link}`) from a Server to a
   Client Component (the page passes plain options; the wizard imports its own action; the
   directory's button uses `@/components/navigation/next-link`). [A, H3.3]
5. **Post first (W16, Ruling 1).** `inviteUser` never reads anything before the POST that could
   refuse a replay; it looks the email (then the username, Ruling 15) up only after a 500
   `internal_error`, and a lookup failure leaves the original error. The early email check lives on
   the Identity step only. [C]
6. Every Server Action runs through `runServerAction`, forwards the idempotency key the wizard
   minted on mount (never a new one per request) and `contextOrganisationId`; never echoes backend
   text; names known failures with local copy (`explain`). The action test asserts the key and the
   guard field; the wizard test asserts both in the FormData and that a retry reuses the key.
   [A, H3.1, L2]
7. One zod schema per rule set: `inviteSchema` (RHF) and the action's input
   (`INVITE_FORM_SHAPE` + `checkInviteAccess`) share every rule and message; the lists travel as
   JSON fields, so a server issue path (`roleAssignments.0.branchId`) is the RHF field name. [A]
8. The wizard validates on Continue, never on blur; a choice validates its own field; an error
   clears as soon as its field is fixed; a step change focuses the new step's heading
   (`WizardForm`); a form-level failure focuses its Alert; a server field error returns to its
   step and focuses the field. [A]
9. Reads go through `apiGet` (the existing services: 09's `listRoles`, 08's `listBranches`, 10's
   `listUsers`); the page settles them with `load()` (a 401 or a stale context redirects) and
   renders `ForbiddenState` (403) or `ErrorState` on failure. **A failed read is never shown as
   absence:** a failed email check says so and stays on Identity; a capped option list says so.
   [A, L17-R21, L1]
10. **No blanket catch** in a service or a helper that backs a page: `findMemberByEmail` and
    `findMemberByUsername` reject; the route handler maps statuses without echoing text; the
    action's two `.catch(() => null)` only disambiguate a failure that already happened (as 16's
    `codeTaken`). [L17-R21a, L1]
11. Request bodies are built field by field in snake_case (`inviteBody`): `phone_e164` and
    `primary_branch_id` are `null` when empty; an institution-wide role sends `branch_id: null`;
    the two flags are booleans, never `null`. [contract §A, §D]
12. Lists stay server-paginated; the wizard's two option sets are one bounded page of 100 each,
    said so when capped — AGENTS.md's **eighth** named exception (Task 8). [A, H3.7]
13. One `h1` per page; labelled fields (every row is a named group: "Branch assignment 1",
    "Role 1"; each Remove names its row); errors tied to their fields; static notices are
    `Alert role="note"`; 375 px shows no horizontal page scroll; no serious or critical axe
    violation in light and dark at 1280 and 375 px. [A, L4]
14. Cross-layer edits are additive and announced (**Shared changes**, below), each in its own
    commit: the users directory page (Task 5b), `scenarios.mts` and `server.mts` (Tasks 6a, 6b),
    README, AGENTS.md, `docs/backend-gaps.md` and the plan index's layer-11 row (Task 8). Nothing
    else outside the new files. [H3.2]
15. Fake-API files run under plain `node`: relative `.mts` imports, `import type`, erasable
    TypeScript only; seeds use the `11000000-0000-4000-8000-…` prefix and lettered tails; never
    mutate another layer's builder's state; new `BUILDERS` entries go last with a
    `// Layer 11 (invite wizard).` comment; `server.mts` registers the new route list last; **the
    33 existing scenarios (29 + layer 12's 4) serialise identically** (Task 6a's check). [A, H3.5,
    H3.6]
16. E2E: every test signs in to its own fake-API run (`authenticate()`); one scenario per test;
    wait for hydration (`expectHydrated`) before a click on a client control; text matched exactly,
    inside `main` (`mainText`); each `describe` sets its own timeout with `test.describe.configure`
    (90 s behaviour, 60 s accessibility); the accessibility matrix runs inside one
    `describe('users invite: accessibility')`, each title ending `(scheme, viewport)`, so
    `--grep "users invite: accessibility.*\(light"` and `…\(dark` each select sixteen; the behaviour
    `describe` titles (`users invite: entry and identity`, `users invite: sending`) share no prefix
    with it. [L3]
17. Unit tests: `vi.mock('@/config/env.server', …)` in the action harness; ids distinct in their
    first block and lettered; `userEvent.setup({ delay: null })`; focus assertions in their own
    `waitFor`; every new route has a page test (the gate before any read, 403 vs 5xx, the 401 and
    stale-context redirects, the empty states). Test output stays pristine. [L3]
18. Every user-visible string is defined once (`invite-rules.ts`, or the one component that
    renders it) and quoted verbatim in the e2e. [C]
19. No new backend gap (BG-36 onwards stays free); BG-07, BG-17, BG-25 and BG-28's frontend
    handling is updated in Task 8. [C]
20. Every commit ends with exactly these two trailer lines, and no model name appears in code, docs,
    commit messages or trailers:

    ```
    Co-Authored-By: Claude <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
    ```

21. Update `README.md` and `AGENTS.md` where the architecture or a documented limit changes (Task
    8); the plan's trailing gate, live-check and self-review sections are the controller's. [A]

**Wire contract** (contract §E.3; tenant scope **T**; branch scope **B**):

| Endpoint                                                                        | Permission                                                      | Body              | Success                        | 11's handling                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /tenant/roles?status=ACTIVE&sort_by=roleName&sort_dir=ASC&page=0&size=100` | `role.view`                                                     | —                 | `ApiPage<RoleSummary>`         | the role picker; capped note when `has_next` (09's `listRoles`)                                                                                                                                                                                                                              |
| `GET /branches?status=ACTIVE&sort_by=branchName&sort_dir=ASC&page=0&size=100`   | `branch.view` (T)                                               | —                 | `ApiPage<BranchSummary>`       | the branch pickers; capped note when `has_next` (08's `listBranches`)                                                                                                                                                                                                                        |
| `GET /tenant/users?q=<email or username>&page&size=100`                         | `user.view` (T)                                                 | —                 | `ApiPage<UserInTenantSummary>` | the email check (≤ 5 pages): exact, case-insensitive email; the item's `membership_status` names the case. After a failed post only: the email, then the username                                                                                                                            |
| `POST /tenant/users`                                                            | `user.invite` (T) + `user.assign_branch` (B) per invited branch | `InviteUser` (§D) | 201 `UserInvitationResult`     | posted first; a 500 is looked up (email taken → 409 `email_taken` on Email; else a username held here → 409 `username_taken` on Username) or named by its likely causes; 403 → hedged copy; 409 `IDEMPOTENCY_KEY_REUSED` → "may already have been sent"; redirect to the record by `user_id` |

**Files 11 never touches:** `app/(authenticated)/layout.tsx`; every shell file; `lib/*`; `auth/*`;
`config/*`; `theme/*`; every kit file (`components/data-display/*`, `wizard-form.tsx` included);
`modules/administration/**` except the new `users/invite-*` files and `users/components/invite-*`
components; 09's `RoleScopeFields` (not reused, Ruling 2); 10's user record routes; the fake API's
`access`, `audit-log`, `context-token`, `http`, `idempotency`, `router` and `state` `.mts` files and
every existing route file; existing e2e specs and `e2e/support/*`; other layers' plans, and the
plan index except its layer-11 row's branch name (Task 8).

## Rulings for this layer

Decisions the implementer can't make. Sixteen questions go to the user before the build (two
BLOCKING: Q1 and Q7), each with a recommended option (`questions.md`); the plan carries the
recommendation. Q13–Q16 were added after adversarial review 1. Each ruling names its cost if
wrong. The user's answers go in the last column.

| Q   | Decision the plan carries                                                                                                                                              | Kind     | User's answer |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------- |
| Q1  | The email is checked on Identity's Continue through a Route Handler over `GET /tenant/users?q=`; the submit posts first and names a taken email after a 500 (Ruling 1) | BLOCKING | confirmed     |
| Q2  | Four steps; Access = branch assignments, then roles, then an optional primary branch; one empty row each (Ruling 2)                                                    | default  | confirmed     |
| Q3  | A static Review note for an account elsewhere; no username check before sending; a hedged 500 (Ruling 3)                                                               | default  | confirmed     |
| Q4  | The entry and the page need all five codes; the page reads nothing without them (Ruling 4)                                                                             | default  | confirmed     |
| Q5  | The contract's flag defaults (identity-provider on, application off), hedged copy (Ruling 5)                                                                           | default  | confirmed     |
| Q6  | The primary branch is optional and any ACTIVE branch (Ruling 6)                                                                                                        | default  | confirmed     |
| Q7  | Backend `validation_failed` violations stay unmapped in this layer (Ruling 7)                                                                                          | BLOCKING | confirmed     |
| Q8  | After sending: the new user's record, no toast (the spec's "Submitted for approval" is the record's state); an unreadable echo lands on the directory (Ruling 8)       | default  | confirmed     |
| Q9  | No draft survives a reload (Ruling 9)                                                                                                                                  | default  | confirmed     |
| Q10 | One page of 100 ACTIVE roles and branches, capped and said so; empty lists link to Roles or Branches; AGENTS.md's eighth exception (Ruling 10)                         | default  | confirmed     |
| Q11 | The username and phone rules are defined in `invite-schema.ts` with 16's messages; 16 is untouched (Ruling 11)                                                         | default  | confirmed     |
| Q12 | A failed email check stays on Identity and says so; a refused one (403) asks for a reload (Ruling 12)                                                                  | default  | confirmed     |
| Q13 | An auditor's or system member's untouched branch row reads "Choose a branch, or remove this row." (Ruling 13)                                                          | default  | confirmed     |
| Q14 | The optional phone is collected, though it can't be viewed afterwards (BG-17) (Ruling 14)                                                                              | default  | confirmed     |
| Q15 | After a failed post whose email is free here, a username a member here holds is named on Username (Ruling 15)                                                          | default  | confirmed     |
| Q16 | A reused key's 409 says "This invitation may already have been sent. Check the directory before sending it again." (Ruling 16)                                         | default  | confirmed     |

1. **The email check (Q1).** Identity's Continue first `trigger`s the step's fields, then calls
   `GET /api/tenant/users/invite-check?email=<trimmed>` (a Route Handler: a read, so not a Server
   Action — Next's own guidance in `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`
   — with UserPicker's `/api/tenant/users` as the precedent). It answers
   `{ membershipStatus: MembershipStatus | null }` from `findMemberByEmail`: `GET /tenant/users?q=`
   in pages of 100, at most 5 (`SCAN_CEILING`), matching the email exactly without letter case.
   A hit keeps the wizard on Identity with `memberEmailMessage(status)` under Email (focused) and
   "Check these fields: Email."; a miss within the ceiling continues (the platform's own check is the
   backstop past it: the invitation is posted first and refused with a 500, which the wizard shows
   with its reference, so a member the scan missed is never invited twice). The submit never
   pre-checks (rule 5). An email edited while its check is in flight is not continued with: the
   answer is ignored and the next Continue checks the new email (review O7). The handoff's
   `GET /tenant/memberships?q=` plus one user read per hit is replaced by the users endpoint: its
   items carry the email and the membership status, it needs `user.view` (the directory's code)
   rather than `membership.view`, and it fans out nothing. Cost if wrong: the route handler and the
   wizard's check; a live finding that `/tenant/users` omits revoked members swaps the service's one
   read (live check 1).
2. **The steps (Q2).** Identity → Access → Invitation → Review, the spec's four. Access shows
   **Branch assignments** (rows: Branch, Assignment type Home/Operate/Approve/View, Remove; Add
   branch), then **Roles** (rows: Role, Scope "Institution (all branches)"/"One branch" in 09's
   words, Branch for one-branch scope offering only their branches above, Remove; Add role), then
   **Primary branch** (optional). It starts with one empty row of each (a branch row defaults to
   Home, a role row to institution scope). "One branch" is disabled, with the reason in the Scope
   helper, until a branch is assigned. 09's `RoleScopeFields` isn't reused: it is uncontrolled with
   fixed field names (its own doc says a React Hook Form wizard needs added props). Cost if wrong:
   one component's layout.
3. **What the tenant can't see (Q3).** The Review note (`REVIEW_NOTE`) says a different
   administrator must approve, and that an existing Finaxis account with this email is reused with
   its own name, username and phone; it says they must be approved "before they can use this
   institution", not "before they can sign in" (an account active elsewhere already can; review M2)
   (contract §E.3). There is no username check before sending (the handoff: usernames are global;
   an in-tenant check would read as "free" when the name is taken elsewhere); after a failed post,
   Ruling 15 names one held here. A 500 neither lookup explains reads `INVITE_FAILED`, naming a
   username that may belong to another account, here or in another institution, and a changed role
   or branch, with the reference. Cost if wrong: copy.
4. **The gate (Q4).** `INVITE_CODES` = `user.invite`, `user.assign_branch`, `user.view` (the email
   check), `role.view`, `branch.view` (the pickers). Without all five the directory shows no button
   and `/admin/users/new` keeps its h1 and shows `ForbiddenState` with `INVITE_FORBIDDEN`, reading
   nothing. BG-33: a branch-scoped grant passes the gate and gets a 403 on the post, explained by
   `INVITE_REFUSED`, or on the email check (`user.view` is read at tenant scope), which asks for a
   reload (`EMAIL_CHECK_REFUSED`, Ruling 12). Cost if wrong: an administrator who may invite only
   auditors and system members (no branch, so no `user.assign_branch`) can't use the wizard.
5. **The flags (Q5).** "Send the identity-provider invitation" (on) and "Send the application
   invitation" (off), each with a one-line description, and `INVITATION_NOTE` (delivery depends on
   the platform; a failure isn't shown, BG-25). Cost if wrong: two defaults and copy.
6. **The primary branch (Q6).** Optional ("None" first), any ACTIVE branch: the contract's only rule
   (§D). Cost if wrong: one rule in `checkInviteAccess` and its message.
7. **Violations (Q7).** Not mapped in this layer: every rule the contract documents is mirrored by
   the shared schema, so a backend violation means a bug and shows as the generic form message, as
   on every form (README). The alternative (an additive `BackendApiError.violations` and a mapping
   option in `runServerAction`) touches `auth/backend-api.ts`, `lib/api/problem.ts` and
   `lib/api/action-result.ts` and adds about two sub-tasks. Cost if wrong: a backend-only rule shows
   in the summary, not under its field.
8. **After sending (Q8).** `redirect('/admin/users/{user_id}')`, no toast (08's and 16's
   convention): the record's "Awaiting approval" chip, its onboarding timeline and Approve disabled
   for the inviter confirm it. The spec says "Submit redirects to the new user's record ("Submitted
   for approval")" (§10.5): the plan reads the parenthesis as the record's state, which the chip
   shows in its own words. A toast raised by the wizard would survive the redirect onto the record
   (the planner's probe, `questions.md` Q8), but the redirect reaches the wizard only as a redirect
   error, and telling the record's redirect from `runServerAction`'s `/login` and `/select-context`
   redirects needs Next's private redirect helpers or its undocumented digest.
   `invitationResultSchema` reads only `user_id`, through `safeParse`; an echo without a readable id
   lands on the directory (the invitation exists either way). Cost if wrong: one redirect.
9. **No draft (Q9).** Nothing persists; Cancel goes to the directory. Cost if wrong: a storage
   layer.
10. **Options (Q10).** One page of 100 ACTIVE roles (`roleName` ASC) and one of 100 ACTIVE branches
    (`branchName` ASC), labelled `Name (CODE)`; past either, `ROLES_CAPPED` / `BRANCHES_CAPPED` under
    its section (L1). No ACTIVE role → `NO_ACTIVE_ROLES` (10's) with "Open Roles & permissions"; no
    ACTIVE branch → `NO_ACTIVE_BRANCHES` with "Open Branches" (the handoff's blocking states). 10's
    role index isn't used: it answers an empty map, with no reference, on any failure, a 401
    included (L1). AGENTS.md records the eighth exception (Task 8). Cost if wrong: a page size.
11. **Validators (Q11).** The handoff says to reuse 10's username and E.164 validators; there are
    none (16 keeps them inline in `tenantAmendSchema`). `invite-schema.ts` defines them with 16's
    exact messages; 16 is untouched. Cost if wrong: two regexes in two places.
12. **A failed check (Q12).** A non-200, an unreadable body or a network failure keeps the wizard
    on Identity with `EMAIL_CHECK_FAILED` ("Select Continue to try again") in the step's alerts; a
    401 reads `SESSION_EXPIRED`; a 403 (a context gone stale after its 8-hour token, which a reload
    sends through `load()` to context selection, or BG-33's branch-only `user.view`) reads
    `EMAIL_CHECK_REFUSED`, which asks for a reload and never for a retry that can't pass (review I1).
    Never read as "free" (L1). Cost if wrong: one branch in `checkEmail`.
13. **An auditor's empty branch row (Q13).** Access starts with one branch row for every membership
    type (Ruling 2); an untouched row is refused with `CHOOSE_ROW_BRANCH`, "Choose a branch, or
    remove this row.", so the words fit a section that is optional for auditors and system members
    (review M1). The primary branch keeps "Choose a branch.". Cost if wrong: one string, or a row
    that starts absent for those two types.
14. **The phone (Q14).** Collected, optional, E.164 (the spec lists it), with the hint that it can't
    be viewed afterwards (BG-17). Cost if wrong: one field and its hint.
15. **An in-tenant username collision (Q15).** After a 500 whose email no member here has,
    `findMemberByUsername` reads `GET /tenant/users?q=<username>` (the same bounded scan) and
    matches the username exactly without letter case; a hit returns 409 `username_taken` with the
    500's reference: `USERNAME_TAKEN` above, `USERNAME_IN_USE` ("This username belongs to someone in
    this institution.") on Username, back on Identity. It is certain, never "free", costs one more
    bounded read only after a failure, and a failed lookup leaves the original error. Cost if wrong:
    the lines `questions.md` Q15 lists.
16. **A reused key (Q16).** A 409 `IDEMPOTENCY_KEY_REUSED` means this wizard's key already sent
    different answers whose response was lost: `INVITE_MAY_BE_SENT`, "This invitation may already
    have been sent. Check the directory before sending it again.", replaces `describeProblem`'s
    "Close this and start again". Cost if wrong: one `explain` line.
17. **Copy.** Every string is the plan's verbatim text, defined once (rule 18). 11 reuses 10's
    `NO_ACTIVE_ROLES`, 16's field messages and wizard failure copy (`SUBMIT_FAILED`), and
    `WizardForm`'s "Check these fields" summary convention.
18. **Not built.** No username check before sending, no draft, no toast, no resend, no edit of an
    invitation, no violation mapping (Q7), no change to 10's record, to `WizardForm` or to the
    frozen kit (the stale `lib/api/lookups.ts` comment is announced, not edited: Shared changes).

## Review Focus

Every reviewer (task and gate) checks these first; each names the tests that pin it.

1. **Replay safety (rule 5).** The action posts before any lookup; a success never looks anything
   up; the lookups (email, then username) run only after a 500 `internal_error` and can't replace
   the original error with their own; a named failure keeps the 500's reference. Pinned by
   `invite-actions.test.ts` ("posts the explicit snake_case body…", "names a … member … after the
   invite failed (BG-07), and only then", "names a username a member here holds once the email is
   free…", "looks nothing up after a failure that is no rule failure", "keeps the original failure
   when the lookups themselves fail").
2. **One rule set, two places.** The browser and the action refuse the same things with the same
   words at the same paths. Pinned by `invite-schema.test.ts` ("the Server Action input"),
   `invite-actions.test.ts` ("refuses a broken rule before any call, naming the field by its row")
   and the wizard test ("returns to a server field error’s step").
3. **The key and the guard.** One key per wizard mount, reused on retry; `contextOrganisationId` in
   every submit. Pinned by `invite-user-wizard.test.tsx` ("sends every answer once…, retries with the
   same key") and `invite-actions.test.ts`.
4. **A failed read is never absence (L1).** The email check's failure stays on Identity and says
   so (a 403 asks for a reload); an email edited during its check is checked again, never continued
   with; capped option lists say so; a failed page read shows its state, never an empty wizard.
   Pinned by the wizard test ("says a failed check (%i) failed…" for 502, 401 and 403, "says the
   check failed after an unreadable answer / a network failure…", "checks an email edited during
   its check again…"), `invite-access-fields.test.tsx` ("says when either list stops at 100") and
   `new/page.test.tsx`.
5. **The gate before any read.** Pinned by `new/page.test.tsx` ("says why, and reads nothing,
   without %s") and the directory's `page.test.tsx`.
6. **The fake mirrors the contract.** Binding (`invalid_json` on unknown or camelCase keys, a `null`
   flag, a missing field; an absent or `null` list is `[]`), validation (`validation_failed` with
   violations), each 500 rule, the 201 shape, account reuse by email, replay and key reuse. Pinned
   by `e2e/fake-api-invite.spec.ts`; the 33 existing scenarios serialise identically (Task 6a).
7. **Accessibility.** Named row groups and Remove buttons, errors tied to fields, notes as notes,
   no page scroll at 375 px, keyboard focus clear of both sticky bars on Access and Review (WCAG
   2.4.11). Pinned by the component tests, the e2e matrix (eight surfaces, the email-in-use state
   and a refused send among them) and 7a's keyboard walk.

## Pre-flight notes (the workflow's pre-flight phase; not a task)

The planner's pre-flight on `e60336d` found, and this plan already reflects:

- **16's scaffold is in place.** `components/data-display/wizard-form.tsx` (`WizardForm`,
  `WizardStep`: label, steps, active, onSubmit, onBack, cancelHref, submitLabel, pending, alerts;
  it focuses the new step's `h2` on a step change, holds no form state and keeps 96 px of scroll
  padding) and the Stepper theme (`theme/create-finaxis-theme.ts`, `MuiStepper`: bordered cells, a
  two-column grid below `md`). The model is
  `modules/platform-administration/tenants/components/tenant-draft-wizard.tsx`: RHF + zod resolver,
  a key minted on mount, `useActionState` wrapped in `try`/`catch` with `unstable_rethrow`, the
  "previous value" pattern to return a failure to its step, `applyFieldErrors` in an effect, a
  `text()` helper that re-triggers a field on change, choices that validate their own field.
- **`runServerAction` reads `Object.fromEntries(formData)`** (`lib/api/action-result.ts`), so lists
  need encoding: 11 sends each list as one JSON field, and zod's issue path
  (`roleAssignments.0.branchId`) is the RHF field name. Zod 4.6 runs an object's `superRefine` after
  check-level failures (min, regex, email) but skips it after a failed `enum`: the Access rows are
  plain strings so all their refusals show in one pass (probed in the throwaway worktree).
- **RHF's field-array root error** lands on the list after `trigger` and on `list.root` after
  `handleSubmit` (`@hookform/resolvers`' `toNestErrors`); `InviteAccessFields` reads both.
- **`BackendApiError` carries no violations** (`auth/backend-api.ts`): Q7.
- **16 posts first** (`createTenantDraft`, pinned by "replays the create before looking at the
  directory"); the handoff's "the email pre-check" would contradict it inside the action, hence
  Ruling 1.
- **Layer 10:** `findUserMembership(userId, email)` needs a user id (no use for an email check);
  `listUsers` is reused. **There are no username or E.164 validators in 10** (the handoff's claim);
  16 has them inline (Ruling 11). The users directory (`app/(authenticated)/admin/users/page.tsx`)
  has **no Invite placeholder**, only the comment `// "Invite user" is layer 11's
(/admin/users/new).`; it reads no profile and has **no page test** (Task 5b adds both).
  `NO_ACTIVE_ROLES` and `SCAN_CEILING` (`user-rules.ts`) are reused.
- **Layer 09:** `ROLE_SCOPE_TYPES` (`role-contract.ts`), `listRoles` (`role-service.ts`, a
  rejecting read). `getRoleIndex`/`getRoleIndexScan` (`lib/api/lookups.ts`) swallow every failure
  into an empty map: not used (Ruling 10). `RoleScopeFields` (`role-assignment-actions.tsx`) is
  uncontrolled with fixed names: not used (Ruling 2).
- **Layer 08:** `BRANCH_ASSIGNMENT_TYPES` (`branch-contract.ts`), `listBranches` (a rejecting read,
  `status` filter). `getBranchIndex` carries no status: not used.
- **Route precedence:** `/admin/users/new` beside `[userId]` resolves to the static segment, as
  `/admin/branches/new` does; `next build` accepted it.
- **Fake API:** no `POST /tenant/users`; `/tenant/users` lists every membership's user with its
  `membership_status`, any status (`institutionUserPage`, `routes/tenant-reads.mts`); the `users`
  scenario has ACTIVE roles (Tenant admin, Teller, Branch supervisor), the DISABLED Loans officer,
  Head Office and Westlands, and members in every status (Esther ACTIVE, Gladys SUSPENDED, Hassan
  REVOKED, Amina pending); **no scenario holds `user.invite`**. `BUILDERS` has 33 entries (29 + layer
  12's four).
- **Gating helpers:** `can`/`canAll` (`auth/permissions.ts`); the Users nav item is unchanged.
- **Layer 12 overlap:** none of 12's code touches the users directory or the new paths. Union edits
  only: README (12 lists the wizard as not connected, and it is "Next steps" item 2), AGENTS.md
  (12's seventh exception; 11 adds the eighth after it) and `scenarios.mts` (11's builders after
  12's).
- **E2E support:** `e2e/support/admin.ts` (`enterAdmin`, `mainText`, `statusChip`, `A11Y_CASES`,
  `applyA11yCase`, `expectA11yCaseApplied`, `expectNoSeriousOrCriticalViolations`),
  `e2e/support/auth.ts` (`authenticate`, `expectHydrated`), `e2e/support/fake-api.ts` (`api`,
  `contextFor`). 12's spec sets `test.describe.configure({ timeout: 90000 })` per behaviour
  `describe` and 60 000 for its matrix, whose titles end `(scheme, viewport)`. 16's
  sticky-bar keyboard helpers (`focusClearance`, `expectFocusStopsClearTheBars`) live inside
  `e2e/platform-tenants.spec.ts`, not in support: 11 copies them into its own spec (Task 7a), as 16
  keeps them, and walks Access with three rows of each and Review at 1440 and 375 px.
- **Branch name.** The plan index names layer 11's branch `admin-parity/11-users-invite`
  (`docs/superpowers/plans/2026-09-25-admin-parity-00-index.md`, layer 11's row); this plan and the
  controller's brief name it `admin-parity/11-invite-wizard`, which Task 8 writes into the index.
  `2026-09-27-admin-parity-parallel-lanes.md` names a past lane branch `lane/11-users-invite`: a
  record of a lane, left as it is.

## Shared changes (announcement)

Every edit outside 11's new files, for the layers stacked beside it:

- `app/(authenticated)/admin/users/page.tsx` (Task 5b): the directory reads the profile beside its
  list and offers "Invite user" to a holder of the five codes; it gets its first page test.
- `e2e/fake-api/scenarios.mts` (Task 6a): `INVITE_SCENARIO_IDS`, `INVITE_SCENARIO_TEXT`,
  `usersInviteScenario` and two `BUILDERS` entries, last; the 33 existing scenarios serialise
  identically. `e2e/fake-api/server.mts` (Task 6b): `invitationRoutes`, registered last.
- `README.md`, `AGENTS.md` (the eighth named paging exception), `docs/backend-gaps.md` (BG-07,
  BG-17, BG-25, BG-28) and the plan index's layer-11 branch name (Task 8).
- **A stale kit comment, not edited:** `lib/api/lookups.ts` (lines 134–136 at `e60336d`) says "A
  picker that offers roles as options (10's, 11's) reads `getRoleIndexScan`". 11 deliberately
  doesn't (Ruling 10: the scan answers an empty map on any failure, L1). The kit is frozen, so 11
  leaves it; the next kit change should drop "11's" (a one-word `fix(kit)`).

## Task dependency table

Tasks run in this order; a test never imports what a later task creates.

| Task | Creates or changes                                                                                | Imports from earlier tasks | Commit subject                                                               |
| ---- | ------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| 1a   | `invite-rules.ts` (+ test)                                                                        | —                          | `feat(users): add the invite wizard's gate, choices and copy`                |
| 1b   | `invite-schema.ts` (+ test)                                                                       | 1a                         | `feat(users): validate an invitation and build its body`                     |
| 2    | `invite-contract.ts`, `invite-service.ts`, `app/api/tenant/users/invite-check/route.ts` (+ tests) | 1a                         | `feat(users): check an invitee's email against the institution's users`      |
| 3    | `invite-actions.ts` (+ test)                                                                      | 1a, 1b, 2                  | `feat(users): send an invitation, naming a taken email after a failed post`  |
| 4a   | `components/invite-choice-field.tsx`, `components/invite-access-fields.tsx` (+ test)              | 1a, 1b                     | `feat(users): add the invite wizard's Access step`                           |
| 4b   | `components/invite-identity-fields.tsx`, `components/invite-invitation-fields.tsx` (+ tests)      | 1a, 1b, 4a                 | `feat(users): add the invite wizard's Identity and Invitation steps`         |
| 4c   | `components/invite-review.tsx` (+ test)                                                           | 1a, 1b                     | `feat(users): add the invite wizard's Review step`                           |
| 4d   | `components/invite-user-wizard.tsx` (+ test, part 1)                                              | 1a, 1b, 3, 4a–4c           | `feat(users): add the Invite user wizard`                                    |
| 4e   | the wizard test, part 2                                                                           | 4d                         | `test(users): pin the invite wizard's submit, server field errors and retry` |
| 5a   | `app/(authenticated)/admin/users/new/page.tsx` (+ test)                                           | 1a, 4d                     | `feat(users): add the Invite user page`                                      |
| 5b   | `app/(authenticated)/admin/users/page.tsx` (+ its first test)                                     | 1a                         | `feat(users): offer Invite user on the directory`                            |
| 6a   | `e2e/fake-api/scenarios.mts`, `e2e/fake-api-invite.spec.ts` (the seeds)                           | —                          | `test(fake-api): seed the invite scenarios`                                  |
| 6b   | `e2e/fake-api/routes/invitations.mts`, `server.mts`, the fake spec (the route)                    | 6a                         | `test(fake-api): accept invitations as the backend binds and checks them`    |
| 6c   | `e2e/fake-api/routes/invitations.mts`, the fake spec (the 500 rules)                              | 6b                         | `test(fake-api): refuse invitations the backend answers with a 500`          |
| 7a   | `e2e/users-invite.spec.ts` (behaviour)                                                            | all of the above           | `test(e2e): cover the invite wizard end to end`                              |
| 7b   | `e2e/users-invite.spec.ts` (the accessibility matrix)                                             | 7a                         | `test(e2e): add the invite wizard's accessibility matrix`                    |
| 8    | `README.md`, `AGENTS.md`, `docs/backend-gaps.md`, the plan index                                  | —                          | `docs(users): describe the Invite user wizard`                               |

All paths under `modules/administration/users/` unless they start with `app/`, `e2e/` or name a
document. 17 commits.

---

### Task 1: The invite rules

Two sub-tasks, each briefed, implemented, reviewed and committed on its own: **1a** (the gate, the
choices and the copy) and **1b** (the values, their rules and the body). Both modules are
client-safe (no `server-only` import): the pages, the wizard, the route handler and the Server
Action share them.

#### Task 1a: The gate, the choices and the copy

**Files:**

- Create: `modules/administration/users/invite-rules.ts`
- Create: `modules/administration/users/invite-rules.test.ts`

**Interfaces:**

- Consumes: `canAll`, `PermissionHolder` (`auth/permissions.ts`); `humanizeEnum`
  (`components/data-display/status-chip.tsx`); 08's `BRANCH_ASSIGNMENT_TYPES`
  (`branches/branch-contract.ts`); 10's `MEMBERSHIP_STATUSES`, `MEMBERSHIP_TYPES`,
  `MembershipStatus` (`users/user-contract.ts`) and `SelectOption` (`users/user-rules.ts`).
- Produces: `INVITE_CODES`, `canInviteUsers`, `USERS_HREF`, `INVITE_HREF`, `userRecordHref`,
  `needsBranch`, `ChoiceOption`, `MEMBERSHIP_TYPE_OPTIONS`, `ASSIGNMENT_TYPE_OPTIONS`, `toChoices`,
  `SCOPE_OPTIONS`, `IDENTITY_FIELDS`, `IdentityField`, `IDENTITY_LABELS`, `INVITATION_FIELDS`,
  `INVITE_FORBIDDEN`, `NO_ACTIVE_BRANCHES`, `OPTION_CEILING`, `ROLES_CAPPED`, `BRANCHES_CAPPED`,
  the Access refusals (`CHOOSE_BRANCH`, `CHOOSE_ROW_BRANCH`, `CHOOSE_ASSIGNMENT_TYPE`,
  `DUPLICATE_BRANCH_ROW`, `NEEDS_A_BRANCH`, `NEEDS_A_ROLE`, `CHOOSE_ROLE`, `CHOOSE_SCOPE`,
  `CHOOSE_ROLE_BRANCH`, `ROLE_BRANCH_UNASSIGNED`, `DUPLICATE_ROLE_ROW`), `memberEmailMessage`,
  `emailCheckSchema`, `EmailCheck`, `EMAIL_CHECK_FAILED`, `SESSION_EXPIRED`,
  `EMAIL_CHECK_REFUSED`, `EMAIL_TAKEN_CODE`, `EMAIL_TAKEN`, `USERNAME_TAKEN_CODE`,
  `USERNAME_TAKEN`, `USERNAME_IN_USE`, `INVITE_REFUSED`, `INVITE_FAILED`, `INVITE_MAY_BE_SENT`,
  `REVIEW_NOTE`, `INVITATION_NOTE`.

- [ ] **Step 1: Write the failing test** — `invite-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ASSIGNMENT_TYPE_OPTIONS,
  canInviteUsers,
  EMAIL_CHECK_FAILED,
  EMAIL_CHECK_REFUSED,
  emailCheckSchema,
  INVITE_CODES,
  INVITE_FAILED,
  INVITE_HREF,
  memberEmailMessage,
  MEMBERSHIP_TYPE_OPTIONS,
  needsBranch,
  REVIEW_NOTE,
  SCOPE_OPTIONS,
  userRecordHref,
  USERS_HREF,
} from './invite-rules';

describe('who may invite (Ruling 4)', () => {
  it('needs every code the wizard uses, and only those', () => {
    expect(INVITE_CODES).toEqual([
      'user.invite',
      'user.assign_branch',
      'user.view',
      'role.view',
      'branch.view',
    ]);
    expect(canInviteUsers({ permissions: [...INVITE_CODES] })).toBe(true);
    for (const missing of INVITE_CODES) {
      expect(
        canInviteUsers({ permissions: INVITE_CODES.filter((code) => code !== missing) }),
        missing,
      ).toBe(false);
    }
  });

  it('builds every href from the directory', () => {
    expect(USERS_HREF).toBe('/admin/users');
    expect(INVITE_HREF).toBe('/admin/users/new');
    expect(userRecordHref('11000000-0000-4000-8000-0000000000e1')).toBe(
      '/admin/users/11000000-0000-4000-8000-0000000000e1',
    );
  });
});

describe('the choices', () => {
  it.each([
    ['STAFF', true],
    ['ADMIN', true],
    ['AUDITOR', false],
    ['SYSTEM', false],
    ['', false],
  ])('a %s member needs a branch: %s (contract §F)', (type, needed) => {
    expect(needsBranch(type)).toBe(needed);
  });

  it('words the membership types, assignment types and scopes', () => {
    expect(MEMBERSHIP_TYPE_OPTIONS.map((option) => option.label)).toEqual([
      'Staff',
      'Admin',
      'Auditor',
      'System',
    ]);
    expect(ASSIGNMENT_TYPE_OPTIONS.map((option) => option.label)).toEqual([
      'Home',
      'Operate',
      'Approve',
      'View',
    ]);
    expect(SCOPE_OPTIONS).toEqual([
      { value: 'TENANT', label: 'Institution (all branches)' },
      { value: 'BRANCH', label: 'One branch' },
    ]);
  });
});

describe('an email already in use here (BG-28)', () => {
  it.each([
    [
      'PENDING_APPROVAL',
      'This email already has an invitation to this institution waiting for approval.',
    ],
    ['ACTIVE', 'This email already belongs to a member of this institution.'],
    [
      'SUSPENDED',
      'This email belongs to a suspended member of this institution. Reactivate them from their record instead.',
    ],
    [
      'REVOKED',
      "This email's membership here was revoked, so it can't be invited to this institution again.",
    ],
  ] as const)('names a %s membership', (status, message) => {
    expect(memberEmailMessage(status)).toBe(message);
  });

  it("reads the route handler's answer, and nothing it doesn't know", () => {
    expect(emailCheckSchema.parse({ membershipStatus: 'REVOKED' })).toEqual({
      membershipStatus: 'REVOKED',
    });
    expect(emailCheckSchema.parse({ membershipStatus: null })).toEqual({ membershipStatus: null });
    expect(emailCheckSchema.safeParse({ membershipStatus: 'GONE' }).success).toBe(false);
    expect(emailCheckSchema.safeParse({}).success).toBe(false);
  });
});

describe('copy that promises no more than the platform does', () => {
  it('blames no one institution for a taken username, and says what approval decides (Ruling 3)', () => {
    expect(INVITE_FAILED).toContain(
      'may already belong to another account, here or in another institution',
    );
    expect(REVIEW_NOTE).toContain('must approve it before they can use this institution.');
  });

  it('asks for a reload, never a retry, when the email check is refused (Ruling 12)', () => {
    expect(EMAIL_CHECK_FAILED).toContain('Select Continue to try again.');
    expect(EMAIL_CHECK_REFUSED).toContain('Reload the page');
    expect(EMAIL_CHECK_REFUSED).not.toMatch(/try again/i);
  });
});
```

- [ ] **Step 2: Run** — form U on `modules/administration/users/invite-rules.test.ts`: FAIL (the
      import `./invite-rules` doesn't resolve).

- [ ] **Step 3: Implement** — `invite-rules.ts`:

```ts
import { z } from 'zod';
import { canAll, type PermissionHolder } from '@/auth/permissions';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { BRANCH_ASSIGNMENT_TYPES } from '@/modules/administration/branches/branch-contract';
import { MEMBERSHIP_STATUSES, MEMBERSHIP_TYPES, type MembershipStatus } from './user-contract';
import type { SelectOption } from './user-rules';

/**
 * The Invite user wizard's gate, routes, choices and copy (spec §10.5). Client-safe: the pages, the
 * wizard, the route handler and the Server Action share it, so every string is defined once.
 */

/** Inviting posts `user.invite` and assigns branches (`user.assign_branch` per branch, contract
 * §E.3); the email check reads the user directory, the pickers the roles and the branches. A holder
 * without any of them gets no half-working wizard (Ruling 4). */
export const INVITE_CODES = [
  'user.invite',
  'user.assign_branch',
  'user.view',
  'role.view',
  'branch.view',
] as const;

export function canInviteUsers(holder: PermissionHolder): boolean {
  return canAll(holder, INVITE_CODES);
}

export const USERS_HREF = '/admin/users';
export const INVITE_HREF = '/admin/users/new';
export const userRecordHref = (userId: string) => `${USERS_HREF}/${userId}`;

/** STAFF and ADMIN members need a branch assignment; AUDITOR and SYSTEM are branch-exempt
 * (contract §F). */
export function needsBranch(membershipType: string): boolean {
  return membershipType === 'STAFF' || membershipType === 'ADMIN';
}

export interface ChoiceOption {
  value: string;
  label: string;
}

export const MEMBERSHIP_TYPE_OPTIONS: readonly ChoiceOption[] = MEMBERSHIP_TYPES.map((value) => ({
  value,
  label: humanizeEnum(value),
}));
export const ASSIGNMENT_TYPE_OPTIONS: readonly ChoiceOption[] = BRANCH_ASSIGNMENT_TYPES.map(
  (value) => ({ value, label: humanizeEnum(value) }),
);
/** The page's `{ id, label }` options as a select's choices. */
export const toChoices = (options: readonly SelectOption[]): ChoiceOption[] =>
  options.map((option) => ({ value: option.id, label: option.label }));

/** The words 09's `RoleScopeFields` uses for the same two scopes. */
export const SCOPE_OPTIONS: readonly ChoiceOption[] = [
  { value: 'TENANT', label: 'Institution (all branches)' },
  { value: 'BRANCH', label: 'One branch' },
];

/** The Identity step's fields, in order, with their labels (the step's error summary names them). */
export const IDENTITY_FIELDS = [
  'displayName',
  'email',
  'username',
  'phone',
  'membershipType',
] as const;
export type IdentityField = (typeof IDENTITY_FIELDS)[number];
export const IDENTITY_LABELS: Record<IdentityField, string> = {
  displayName: 'Full name',
  email: 'Email',
  username: 'Username',
  phone: 'Phone',
  membershipType: 'Membership type',
};
export const INVITATION_FIELDS = ['sendIdentityInvite', 'sendApplicationInvite'] as const;

// The page's states.
export const INVITE_FORBIDDEN =
  'Inviting someone needs permission to invite users and assign branches, and to view users, roles and branches. Ask an administrator if you need access.';
export const NO_ACTIVE_BRANCHES =
  'There are no active branches to assign. Activate one under Branches first.';
/** The pickers read one page of 100 by name (AGENTS.md's eighth paging exception, Ruling 10): past
 * it they say so, never presenting a capped list as the whole set (L1). */
export const OPTION_CEILING = 100;
export const ROLES_CAPPED = `Only the first ${OPTION_CEILING} active roles by name are offered here.`;
export const BRANCHES_CAPPED = `Only the first ${OPTION_CEILING} active branches by name are offered here.`;

// The Access step's refusals (invite-schema.ts).
export const CHOOSE_BRANCH = 'Choose a branch.';
/** An unfinished branch row: the section is optional for auditors and system members, so the words
 * offer both ways out (Ruling 13). */
export const CHOOSE_ROW_BRANCH = 'Choose a branch, or remove this row.';
export const CHOOSE_ASSIGNMENT_TYPE = 'Choose an assignment type.';
export const DUPLICATE_BRANCH_ROW = 'This branch already has this assignment type above.';
export const NEEDS_A_BRANCH = 'Add a branch: staff and admin members need at least one.';
export const NEEDS_A_ROLE = 'Add at least one role.';
export const CHOOSE_ROLE = 'Choose a role.';
export const CHOOSE_SCOPE = 'Choose a scope.';
export const CHOOSE_ROLE_BRANCH = 'Choose the branch this role applies at.';
export const ROLE_BRANCH_UNASSIGNED = 'Assign them to this branch under Branch assignments first.';
export const DUPLICATE_ROLE_ROW = 'This role is already listed with the same scope.';

/** Why the email can't be invited, by the membership it already has here (BG-28: a revoked one
 * blocks the email for good). */
export function memberEmailMessage(status: MembershipStatus): string {
  switch (status) {
    case 'PENDING_APPROVAL':
      return 'This email already has an invitation to this institution waiting for approval.';
    case 'ACTIVE':
      return 'This email already belongs to a member of this institution.';
    case 'SUSPENDED':
      return 'This email belongs to a suspended member of this institution. Reactivate them from their record instead.';
    case 'REVOKED':
      return "This email's membership here was revoked, so it can't be invited to this institution again.";
  }
}

/** The route handler's answer to the email check (Ruling 1): the membership this email already has
 * here, or null. */
export const emailCheckSchema = z.object({
  membershipStatus: z.enum(MEMBERSHIP_STATUSES).nullable(),
});
export type EmailCheck = z.output<typeof emailCheckSchema>;

// The email check (the Identity step's Continue, Ruling 12) and the submit (Rulings 1, 3).
export const EMAIL_CHECK_FAILED =
  "We couldn't check whether this email is already in use. Select Continue to try again.";
export const SESSION_EXPIRED = 'Your session has expired. Sign in again.';
/** A 403 from the check: the context went stale (it then needs context selection, which a reload
 * runs through the page's load()), or `user.view` is held only at branch scope (BG-33). Retrying
 * can't help, so this never says "try again". */
export const EMAIL_CHECK_REFUSED =
  "This email can't be checked in your current context. Reload the page; if this keeps happening, ask an administrator for access.";
/** A frontend-only problem code: the email has a membership here (found after a failed invite). */
export const EMAIL_TAKEN_CODE = 'email_taken';
export const EMAIL_TAKEN = "This email can't be invited: it is already in use in this institution.";
/** A frontend-only problem code: the username belongs to a member here (found after a failed
 * invite whose email is free here, Ruling 15). */
export const USERNAME_TAKEN_CODE = 'username_taken';
export const USERNAME_TAKEN =
  "This username can't be used: it already belongs to someone in this institution.";
export const USERNAME_IN_USE = 'This username belongs to someone in this institution.';
export const INVITE_REFUSED =
  "You can't send this invitation. Your role may not allow inviting users, or assigning one of these branches.";
/** BG-07: every invite rule failure is a 500. The ones the wizard can't check are named here. */
export const INVITE_FAILED =
  "The platform couldn't create this invitation. The username may already belong to another account, here or in another institution, or a role or branch may have changed since this page loaded. Check them, then try again.";
/** A 409 IDEMPOTENCY_KEY_REUSED: this wizard's key already sent different answers, so an earlier
 * send may have succeeded with its response lost (Ruling 16). */
export const INVITE_MAY_BE_SENT =
  'This invitation may already have been sent. Check the directory before sending it again.';

/** What sending does, and what the tenant can't see (BG-02, BG-07, BG-11; Ruling 3). */
export const REVIEW_NOTE =
  'Sending creates the invitation now. A different administrator must approve it before they can use this institution. If this email already has a Finaxis account, that account is reused: its name, username and phone stay as they are.';
/** BG-25: delivery depends on the platform, and a failure isn't readable (Ruling 5). */
export const INVITATION_NOTE =
  "Whether these emails go out depends on the platform: identity provisioning and email can be switched off there, and a failed delivery isn't shown here.";
```

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs (each must fail the named test; revert after
      each): drop `'user.assign_branch'` from `INVITE_CODES` ("needs every code the wizard uses,
      and only those"); make `needsBranch` true for `AUDITOR` ("a AUDITOR member needs a branch:
      false (contract §F)"); return the ACTIVE message for `REVOKED` ("names a REVOKED
      membership"); put back `INVITE_FAILED`'s earlier "belong to an account in another
      institution" ("blames no one institution for a taken username, and says what approval
      decides (Ruling 3)"); end `EMAIL_CHECK_REFUSED` with "Select Continue to try again." ("asks
      for a reload, never a retry, when the email check is refused (Ruling 12)").

- [ ] **Step 5: Commit** (form C):

```
feat(users): add the invite wizard's gate, choices and copy

The Invite user wizard's client-safe rules: the five codes it needs (Ruling 4), its routes, who
needs a branch, the membership type, assignment type and scope choices, the words for an email
already in use here by its membership status (BG-28), the email check's answer, and every string
the pages, the route and the action share: a refused check asks for a reload, never a retry, and a
failed invitation blames no one institution for a taken username (Rulings 3, 12, 15, 16).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** `SCOPE_OPTIONS` repeats 09's two scope labels
on purpose (Ruling 2); `INVITE_CODES` order is asserted.

#### Task 1b: The values, their rules and the body

**Files:**

- Create: `modules/administration/users/invite-schema.ts`
- Create: `modules/administration/users/invite-schema.test.ts`

**Interfaces:**

- Consumes: 1a's Access refusals and `needsBranch`; `UUID_PATTERN` (`lib/api/wire.ts`); 08's
  `BRANCH_ASSIGNMENT_TYPES`; 09's `ROLE_SCOPE_TYPES` (`roles/role-contract.ts`); 10's
  `MEMBERSHIP_TYPES`.
- Produces: `BranchRow`, `RoleRow`, `checkInviteAccess(values, ctx)`, `inviteSchema`,
  `InviteValues`, `INVITE_FORM_SHAPE`, `EMPTY_BRANCH_ROW`, `EMPTY_ROLE_ROW`, `EMPTY_INVITE`,
  `inviteBody(values)`.

- [ ] **Step 1: Write the failing test** — `invite-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CHOOSE_ASSIGNMENT_TYPE,
  CHOOSE_BRANCH,
  CHOOSE_ROLE,
  CHOOSE_ROLE_BRANCH,
  CHOOSE_ROW_BRANCH,
  CHOOSE_SCOPE,
  DUPLICATE_BRANCH_ROW,
  DUPLICATE_ROLE_ROW,
  NEEDS_A_BRANCH,
  NEEDS_A_ROLE,
  ROLE_BRANCH_UNASSIGNED,
} from './invite-rules';
import {
  checkInviteAccess,
  EMPTY_INVITE,
  INVITE_FORM_SHAPE,
  inviteBody,
  inviteSchema,
  type InviteValues,
} from './invite-schema';

// Distinct first blocks, so a message names its row; lettered, so an upper-cased copy differs.
const WESTLANDS = 'a4000000-0000-4000-8000-0000000000aa';
const HEAD_OFFICE = 'b2000000-0000-4000-8000-0000000000bb';
const TELLER = 'c1000000-0000-4000-8000-0000000000cc';
const SUPERVISOR = 'd1000000-0000-4000-8000-0000000000dd';

const VALID: InviteValues = {
  displayName: 'Neema Wanjiku',
  email: 'neema.wanjiku@greenfield.example',
  username: 'neema.wanjiku',
  phone: '',
  membershipType: 'STAFF',
  primaryBranchId: '',
  branchAssignments: [{ branchId: WESTLANDS, assignmentType: 'HOME' }],
  roleAssignments: [{ roleId: TELLER, scopeType: 'TENANT', branchId: '' }],
  sendIdentityInvite: 'true',
  sendApplicationInvite: 'false',
};

/** Each refusal as `path: message`, in the order zod reports them. */
function refusals(values: InviteValues): string[] {
  const result = inviteSchema.safeParse(values);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`);
}

describe('the identity', () => {
  it('accepts a valid invitation', () => {
    expect(refusals(VALID)).toEqual([]);
  });

  it('refuses each identity field by its own rule, with the same words as 16', () => {
    expect(
      refusals({
        ...VALID,
        displayName: ' N ',
        email: 'neema@',
        username: 'ne',
        phone: '0712000140',
        membershipType: '',
      }),
    ).toEqual([
      'displayName: Enter a name of at least 2 characters.',
      'email: Enter a valid email address.',
      'username: Use 3–50 letters, digits, dots, underscores or hyphens.',
      'phone: Use the international format, e.g. +254712000140.',
      'membershipType: Choose a membership type.',
    ]);
  });

  it('caps the name at 100 characters and the username at 50', () => {
    expect(refusals({ ...VALID, displayName: 'N'.repeat(101), username: 'n'.repeat(51) })).toEqual([
      'displayName: Use at most 100 characters.',
      'username: Use 3–50 letters, digits, dots, underscores or hyphens.',
    ]);
    expect(refusals({ ...VALID, displayName: 'N'.repeat(100), username: 'n'.repeat(50) })).toEqual(
      [],
    );
  });

  it('caps the email at 254 characters, with that rule’s own words', () => {
    // 64 + 1 + 182 + 8 = 255 characters, otherwise a valid address.
    const long = `${'n'.repeat(64)}@${'g'.repeat(182)}.example`;
    expect(refusals({ ...VALID, email: long })).toEqual(['email: Use at most 254 characters.']);
    expect(refusals({ ...VALID, email: long.slice(1) })).toEqual([]);
  });

  it('takes an E.164 phone, or none', () => {
    expect(refusals({ ...VALID, phone: '+254712000140' })).toEqual([]);
    expect(refusals({ ...VALID, phone: '+0712000140' })).toEqual([
      'phone: Use the international format, e.g. +254712000140.',
    ]);
  });
});

describe('the access rules (BG-07)', () => {
  it.each(['STAFF', 'ADMIN'])('asks a %s member for a branch', (membershipType) => {
    expect(refusals({ ...VALID, membershipType, branchAssignments: [] })).toEqual([
      `branchAssignments: ${NEEDS_A_BRANCH}`,
    ]);
  });

  it.each(['AUDITOR', 'SYSTEM'])('lets a %s member have no branch', (membershipType) => {
    expect(refusals({ ...VALID, membershipType, branchAssignments: [] })).toEqual([]);
  });

  it('asks for at least one role', () => {
    expect(refusals({ ...VALID, roleAssignments: [] })).toEqual([
      `roleAssignments: ${NEEDS_A_ROLE}`,
    ]);
  });

  it('names an unfinished row by its own field', () => {
    expect(
      refusals({
        ...VALID,
        branchAssignments: [{ branchId: '', assignmentType: '' }],
        roleAssignments: [{ roleId: '', scopeType: '', branchId: '' }],
      }),
    ).toEqual([
      `branchAssignments.0.branchId: ${CHOOSE_ROW_BRANCH}`,
      `branchAssignments.0.assignmentType: ${CHOOSE_ASSIGNMENT_TYPE}`,
      `roleAssignments.0.roleId: ${CHOOSE_ROLE}`,
      `roleAssignments.0.scopeType: ${CHOOSE_SCOPE}`,
    ]);
  });

  it('refuses an assignment type the contract has no word for', () => {
    expect(
      refusals({ ...VALID, branchAssignments: [{ branchId: WESTLANDS, assignmentType: 'OWNER' }] }),
    ).toEqual([`branchAssignments.0.assignmentType: ${CHOOSE_ASSIGNMENT_TYPE}`]);
  });

  it('refuses the same branch and type twice, in any letter case', () => {
    expect(
      refusals({
        ...VALID,
        branchAssignments: [
          { branchId: WESTLANDS, assignmentType: 'HOME' },
          { branchId: WESTLANDS, assignmentType: 'OPERATE' },
          { branchId: WESTLANDS.toUpperCase(), assignmentType: 'HOME' },
        ],
      }),
    ).toEqual([`branchAssignments.2.assignmentType: ${DUPLICATE_BRANCH_ROW}`]);
  });

  it('gives a branch-scoped role only a branch they are assigned to', () => {
    expect(
      refusals({
        ...VALID,
        roleAssignments: [{ roleId: SUPERVISOR, scopeType: 'BRANCH', branchId: HEAD_OFFICE }],
      }),
    ).toEqual([`roleAssignments.0.branchId: ${ROLE_BRANCH_UNASSIGNED}`]);
    expect(
      refusals({
        ...VALID,
        roleAssignments: [
          { roleId: SUPERVISOR, scopeType: 'BRANCH', branchId: WESTLANDS.toUpperCase() },
        ],
      }),
    ).toEqual([]);
  });

  it('asks a branch-scoped role for its branch', () => {
    expect(
      refusals({
        ...VALID,
        roleAssignments: [{ roleId: SUPERVISOR, scopeType: 'BRANCH', branchId: '' }],
      }),
    ).toEqual([`roleAssignments.0.branchId: ${CHOOSE_ROLE_BRANCH}`]);
  });

  it('ignores a leftover branch on an institution-wide role', () => {
    expect(
      refusals({
        ...VALID,
        roleAssignments: [{ roleId: TELLER, scopeType: 'TENANT', branchId: HEAD_OFFICE }],
      }),
    ).toEqual([]);
  });

  it('refuses the same role with the same scope twice, but not at two branches', () => {
    const twoBranches = [
      { branchId: WESTLANDS, assignmentType: 'HOME' },
      { branchId: HEAD_OFFICE, assignmentType: 'OPERATE' },
    ];
    expect(
      refusals({
        ...VALID,
        branchAssignments: twoBranches,
        roleAssignments: [
          { roleId: SUPERVISOR, scopeType: 'BRANCH', branchId: WESTLANDS },
          { roleId: SUPERVISOR, scopeType: 'BRANCH', branchId: HEAD_OFFICE },
          { roleId: TELLER, scopeType: 'TENANT', branchId: '' },
          { roleId: TELLER.toUpperCase(), scopeType: 'TENANT', branchId: '' },
          { roleId: SUPERVISOR, scopeType: 'BRANCH', branchId: WESTLANDS },
        ],
      }),
    ).toEqual([
      `roleAssignments.3.roleId: ${DUPLICATE_ROLE_ROW}`,
      `roleAssignments.4.roleId: ${DUPLICATE_ROLE_ROW}`,
    ]);
  });

  it('takes any branch as primary, or none (Ruling 6)', () => {
    expect(refusals({ ...VALID, primaryBranchId: HEAD_OFFICE })).toEqual([]);
    expect(refusals({ ...VALID, primaryBranchId: 'head-office' })).toEqual([
      `primaryBranchId: ${CHOOSE_BRANCH}`,
    ]);
  });

  it('starts with one empty row of each, so the first Continue names what is missing', () => {
    expect(refusals({ ...EMPTY_INVITE, ...identityOf(VALID) })).toEqual([
      `branchAssignments.0.branchId: ${CHOOSE_ROW_BRANCH}`,
      `roleAssignments.0.roleId: ${CHOOSE_ROLE}`,
    ]);
  });
});

function identityOf(values: InviteValues) {
  const { displayName, email, username, phone, membershipType } = values;
  return { displayName, email, username, phone, membershipType };
}

describe('the Server Action input', () => {
  const action = z.object(INVITE_FORM_SHAPE).superRefine(checkInviteAccess);
  const fields = (values: InviteValues) => ({
    ...values,
    branchAssignments: JSON.stringify(values.branchAssignments),
    roleAssignments: JSON.stringify(values.roleAssignments),
  });

  it('reads the lists from JSON and applies the same rules at the same paths', () => {
    expect(action.safeParse(fields(VALID)).data?.roleAssignments).toEqual(VALID.roleAssignments);
    const refused = action.safeParse(
      fields({
        ...VALID,
        roleAssignments: [{ roleId: SUPERVISOR, scopeType: 'BRANCH', branchId: HEAD_OFFICE }],
      }),
    );
    expect(refused.error?.issues.map((issue) => issue.path.map(String).join('.'))).toEqual([
      'roleAssignments.0.branchId',
    ]);
  });

  it('refuses a list it cannot read', () => {
    const refused = action.safeParse({ ...fields(VALID), branchAssignments: '[{' });
    expect(refused.error?.issues.map((issue) => issue.path.map(String).join('.'))).toEqual([
      'branchAssignments',
    ]);
  });
});

describe('the InviteUser body (contract §D)', () => {
  it('is built field by field in snake_case, with nulls for the empty optionals', () => {
    expect(inviteBody(VALID)).toEqual({
      email: 'neema.wanjiku@greenfield.example',
      username: 'neema.wanjiku',
      display_name: 'Neema Wanjiku',
      phone_e164: null,
      membership_type: 'STAFF',
      primary_branch_id: null,
      branch_assignments: [{ branch_id: WESTLANDS, assignment_type: 'HOME' }],
      role_assignments: [{ role_id: TELLER, scope_type: 'TENANT', branch_id: null }],
      send_keycloak_invite: true,
      send_application_invite: false,
    });
  });

  it('sends a branch-scoped role with its branch, and the filled-in optionals', () => {
    expect(
      inviteBody({
        ...VALID,
        phone: '+254712000140',
        primaryBranchId: WESTLANDS,
        roleAssignments: [
          { roleId: SUPERVISOR, scopeType: 'BRANCH', branchId: WESTLANDS },
          { roleId: TELLER, scopeType: 'TENANT', branchId: HEAD_OFFICE },
        ],
        sendIdentityInvite: 'false',
        sendApplicationInvite: 'true',
      }),
    ).toMatchObject({
      phone_e164: '+254712000140',
      primary_branch_id: WESTLANDS,
      role_assignments: [
        { role_id: SUPERVISOR, scope_type: 'BRANCH', branch_id: WESTLANDS },
        // A branch left behind on an institution-wide role is never sent (else a 422/500).
        { role_id: TELLER, scope_type: 'TENANT', branch_id: null },
      ],
      send_keycloak_invite: false,
      send_application_invite: true,
    });
  });

  it('never sends a form-only key', () => {
    expect(Object.keys(inviteBody(VALID)).sort()).toEqual([
      'branch_assignments',
      'display_name',
      'email',
      'membership_type',
      'phone_e164',
      'primary_branch_id',
      'role_assignments',
      'send_application_invite',
      'send_keycloak_invite',
      'username',
    ]);
  });
});
```

- [ ] **Step 2: Run** — form U on `modules/administration/users/invite-schema.test.ts`: FAIL (the
      import `./invite-schema` doesn't resolve).

- [ ] **Step 3: Implement** — `invite-schema.ts`:

```ts
import { z } from 'zod';
import { UUID_PATTERN } from '@/lib/api/wire';
import { BRANCH_ASSIGNMENT_TYPES } from '@/modules/administration/branches/branch-contract';
import { ROLE_SCOPE_TYPES } from '@/modules/administration/roles/role-contract';
import {
  CHOOSE_ASSIGNMENT_TYPE,
  CHOOSE_BRANCH,
  CHOOSE_ROLE,
  CHOOSE_ROLE_BRANCH,
  CHOOSE_ROW_BRANCH,
  CHOOSE_SCOPE,
  DUPLICATE_BRANCH_ROW,
  DUPLICATE_ROLE_ROW,
  NEEDS_A_BRANCH,
  NEEDS_A_ROLE,
  needsBranch,
  ROLE_BRANCH_UNASSIGNED,
} from './invite-rules';
import { MEMBERSHIP_TYPES } from './user-contract';

/**
 * The Invite user wizard's values, their rules and the InviteUser body (spec §10.5, contract §D).
 * Client-safe: the wizard (React Hook Form) and the Server Action refuse the same things with the
 * same words (spec §6.4).
 */

const USERNAME = /^[a-zA-Z0-9._-]{3,50}$/;
const OPTIONAL_PHONE = /^(\+[1-9]\d{1,14})?$/;
const isMembershipType = (value: string) => (MEMBERSHIP_TYPES as readonly string[]).includes(value);
const isAssignmentType = (value: string) =>
  (BRANCH_ASSIGNMENT_TYPES as readonly string[]).includes(value);
const isScopeType = (value: string) => (ROLE_SCOPE_TYPES as readonly string[]).includes(value);
const isId = (value: string) => UUID_PATTERN.test(value);

/** InviteUser's identity (contract §D), with 16's messages for the same rules (Ruling 11). */
const IDENTITY_SHAPE = {
  displayName: z
    .string()
    .trim()
    .min(2, 'Enter a name of at least 2 characters.')
    .max(100, 'Use at most 100 characters.'),
  // RFC 5321's limit; the email check's route refuses a longer one (the contract states none).
  email: z.email('Enter a valid email address.').max(254, 'Use at most 254 characters.'),
  username: z
    .string()
    .trim()
    .regex(USERNAME, 'Use 3–50 letters, digits, dots, underscores or hyphens.'),
  phone: z
    .string()
    .trim()
    .regex(OPTIONAL_PHONE, 'Use the international format, e.g. +254712000140.'),
  membershipType: z.string().refine(isMembershipType, 'Choose a membership type.'),
};

// Rows stay plain strings, so every Access rule runs in one pass (a failed enum would skip the
// object's refinement) and each message is the rule's own.
const branchRowSchema = z.object({ branchId: z.string(), assignmentType: z.string() });
const roleRowSchema = z.object({ roleId: z.string(), scopeType: z.string(), branchId: z.string() });
export type BranchRow = z.output<typeof branchRowSchema>;
export type RoleRow = z.output<typeof roleRowSchema>;

const BOOLEAN_TEXT = z.enum(['true', 'false']);
const INVITATION_SHAPE = {
  sendIdentityInvite: BOOLEAN_TEXT,
  sendApplicationInvite: BOOLEAN_TEXT,
};

interface AccessValues {
  membershipType: string;
  primaryBranchId: string;
  branchAssignments: readonly BranchRow[];
  roleAssignments: readonly RoleRow[];
}

/** The rules the backend answers with a 500 (BG-07), checked before anything is sent: STAFF and
 * ADMIN need a branch; at least one role; a branch-scoped role's branch must be one they are
 * assigned to; no row twice. Roles and branches are ACTIVE because only ACTIVE ones are offered. */
export function checkInviteAccess(values: AccessValues, ctx: z.RefinementCtx): void {
  const issue = (path: (string | number)[], message: string) => {
    ctx.addIssue({ code: 'custom', path, message });
  };
  const assigned = new Set<string>();
  const branchPairs = new Set<string>();
  values.branchAssignments.forEach((row, index) => {
    const branch = isId(row.branchId);
    const type = isAssignmentType(row.assignmentType);
    if (!branch) issue(['branchAssignments', index, 'branchId'], CHOOSE_ROW_BRANCH);
    if (!type) issue(['branchAssignments', index, 'assignmentType'], CHOOSE_ASSIGNMENT_TYPE);
    if (!branch) return;
    const branchId = row.branchId.toLowerCase();
    assigned.add(branchId);
    const pair = `${branchId} ${row.assignmentType}`;
    if (type && branchPairs.has(pair)) {
      issue(['branchAssignments', index, 'assignmentType'], DUPLICATE_BRANCH_ROW);
    }
    branchPairs.add(pair);
  });
  if (values.branchAssignments.length === 0 && needsBranch(values.membershipType)) {
    issue(['branchAssignments'], NEEDS_A_BRANCH);
  }

  if (values.roleAssignments.length === 0) issue(['roleAssignments'], NEEDS_A_ROLE);
  const grants = new Set<string>();
  values.roleAssignments.forEach((row, index) => {
    const role = isId(row.roleId);
    const scope = isScopeType(row.scopeType);
    if (!role) issue(['roleAssignments', index, 'roleId'], CHOOSE_ROLE);
    if (!scope) issue(['roleAssignments', index, 'scopeType'], CHOOSE_SCOPE);
    if (row.scopeType !== 'BRANCH') {
      if (role && scope) {
        const grant = `${row.roleId.toLowerCase()} TENANT`;
        if (grants.has(grant)) issue(['roleAssignments', index, 'roleId'], DUPLICATE_ROLE_ROW);
        grants.add(grant);
      }
      return;
    }
    if (!isId(row.branchId)) {
      issue(['roleAssignments', index, 'branchId'], CHOOSE_ROLE_BRANCH);
      return;
    }
    const branchId = row.branchId.toLowerCase();
    if (!assigned.has(branchId)) {
      issue(['roleAssignments', index, 'branchId'], ROLE_BRANCH_UNASSIGNED);
    }
    if (!role) return;
    const grant = `${row.roleId.toLowerCase()} ${branchId}`;
    if (grants.has(grant)) issue(['roleAssignments', index, 'roleId'], DUPLICATE_ROLE_ROW);
    grants.add(grant);
  });

  // Any ACTIVE branch may be primary (contract §D; Ruling 6); the picker offers only ACTIVE ones.
  if (values.primaryBranchId !== '' && !isId(values.primaryBranchId)) {
    issue(['primaryBranchId'], CHOOSE_BRANCH);
  }
}

/** The wizard's React Hook Form values, validated in the browser. */
export const inviteSchema = z
  .object({
    ...IDENTITY_SHAPE,
    primaryBranchId: z.string(),
    branchAssignments: z.array(branchRowSchema),
    roleAssignments: z.array(roleRowSchema),
    ...INVITATION_SHAPE,
  })
  .superRefine(checkInviteAccess);

export type InviteValues = z.output<typeof inviteSchema>;

/** FormData carries each list as one JSON field; an unreadable one is refused like a bad field. */
function jsonList<S extends z.ZodType>(schema: S) {
  return z
    .string()
    .transform((raw, ctx): unknown => {
      try {
        return JSON.parse(raw);
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Check this list and try again.' });
        return z.NEVER;
      }
    })
    .pipe(schema);
}

/** The Server Action's FormData fields: the same values and rules, the lists as JSON. Not refined,
 * so the action can add its own fields (zod can't extend a refined object); the action refines it
 * with `checkInviteAccess`. */
export const INVITE_FORM_SHAPE = {
  ...IDENTITY_SHAPE,
  primaryBranchId: z.string(),
  branchAssignments: jsonList(z.array(branchRowSchema)),
  roleAssignments: jsonList(z.array(roleRowSchema)),
  ...INVITATION_SHAPE,
};

export const EMPTY_BRANCH_ROW: BranchRow = { branchId: '', assignmentType: 'HOME' };
export const EMPTY_ROLE_ROW: RoleRow = { roleId: '', scopeType: 'TENANT', branchId: '' };

/** One empty row of each to start (Ruling 2); the identity-provider invitation on, the application
 * invitation off (spec §10.5; Ruling 5). */
export const EMPTY_INVITE: InviteValues = {
  displayName: '',
  email: '',
  username: '',
  phone: '',
  membershipType: '',
  primaryBranchId: '',
  branchAssignments: [EMPTY_BRANCH_ROW],
  roleAssignments: [EMPTY_ROLE_ROW],
  sendIdentityInvite: 'true',
  sendApplicationInvite: 'false',
};

/** InviteUser (contract §D), built field by field (spec §6.2: never spread form values). An empty
 * phone and primary branch are `null`; an institution-wide role carries `branch_id: null` (contract
 * §D's AssignRole rule); the two flags are always booleans, never `null`. */
export function inviteBody(values: InviteValues): Record<string, unknown> {
  return {
    email: values.email,
    username: values.username,
    display_name: values.displayName,
    phone_e164: values.phone || null,
    membership_type: values.membershipType,
    primary_branch_id: values.primaryBranchId || null,
    branch_assignments: values.branchAssignments.map((row) => ({
      branch_id: row.branchId,
      assignment_type: row.assignmentType,
    })),
    role_assignments: values.roleAssignments.map((row) => ({
      role_id: row.roleId,
      scope_type: row.scopeType,
      branch_id: row.scopeType === 'BRANCH' ? row.branchId : null,
    })),
    send_keycloak_invite: values.sendIdentityInvite === 'true',
    send_application_invite: values.sendApplicationInvite === 'true',
  };
}
```

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs (each must fail the named test; revert after
      each): compare a role's branch as typed (in the role loop, `const branchId = row.branchId;`
      without `.toLowerCase()`) ("gives a branch-scoped role only a branch they are assigned to"); send
      `row.branchId` for every scope in `inviteBody` ("sends a branch-scoped role with its branch,
      and the filled-in optionals"); delete the `NEEDS_A_BRANCH` check ("asks a STAFF member for a
      branch"); send `values.phone` instead of `values.phone || null` ("is built field by field in
      snake_case, with nulls for the empty optionals"); drop `.max(254, …)` from the email ("caps
      the email at 254 characters, with that rule’s own words"); refuse an unfinished branch row with
      `CHOOSE_BRANCH` ("names an unfinished row by its own field").

- [ ] **Step 5: Commit** (form C):

```
feat(users): validate an invitation and build its body

One zod schema for the wizard's React Hook Form and the same rules for the Server Action's FormData
(the lists as JSON fields, so a server issue path is the form's field name): STAFF and ADMIN need a
branch, at least one role, a branch-scoped role only at one of their branches, no row twice (BG-07);
an unfinished branch row offers its removal (Ruling 13); the email has RFC 5321's 254-character cap.
The InviteUser body is built field by field, with nulls for the empty optionals and no null flags.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** the rows are plain strings on purpose: zod 4
skips an object's refinement after a failed `enum`, so every Access refusal shows in one pass only
this way (the pre-flight probe).

### Task 2: The email check

**Files:**

- Create: `modules/administration/users/invite-contract.ts`
- Create: `modules/administration/users/invite-contract.test.ts`
- Create: `modules/administration/users/invite-service.ts`
- Create: `modules/administration/users/invite-service.test.ts`
- Create: `app/api/tenant/users/invite-check/route.ts`
- Create: `app/api/tenant/users/invite-check/route.test.ts`

**Interfaces:**

- Consumes: `uuidSchema` (`lib/api/wire.ts`); 10's `listUsers`, `UserSummary`, `SCAN_CEILING`;
  1a's `EmailCheck`; `requireAuthenticatedUser`, `UnauthenticatedContextRequestError`
  (`auth/require-authenticated-user.ts`); `BackendApiError`.
- Produces: `invitationResultSchema`, `InvitationResult`; `findMemberByEmail(email)` and
  `findMemberByUsername(username)` (server-only, the same bounded scan, rejecting on any read
  failure; Task 3 reads the username after a failed post, Ruling 15);
  `GET /api/tenant/users/invite-check?email=` →
  `{ membershipStatus: MembershipStatus | null }` (400 for an email the Identity step's rule
  refuses, 401, 403, 502 with local words only).

- [ ] **Step 1: Write the failing tests** — `invite-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { invitationResultSchema } from './invite-contract';

const USER = '11000000-0000-4000-8000-0000000000e1';

describe('invitationResultSchema', () => {
  it('reads the new user id from UserInvitationResult (contract §C)', () => {
    expect(
      invitationResultSchema.parse({
        user_id: USER,
        membership_id: '11000000-0000-4000-8000-0000000000e2',
        user_status: 'DRAFT',
        membership_status: 'PENDING_APPROVAL',
      }),
    ).toEqual({ userId: USER });
  });

  it('needs nothing else: a reused account answers with its own status (Ruling 8)', () => {
    expect(invitationResultSchema.parse({ user_id: USER, user_status: 'ACTIVE' })).toEqual({
      userId: USER,
    });
  });

  it('refuses an echo without a well-formed id', () => {
    expect(invitationResultSchema.safeParse({ userId: USER }).success).toBe(false);
    expect(invitationResultSchema.safeParse({ user_id: '../x' }).success).toBe(false);
  });
});
```

`invite-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZodType } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { userPageSchema } from './user-contract';

const { apiGet } = vi.hoisted(() => ({
  apiGet: vi.fn<(path: string, schema: ZodType) => Promise<unknown>>(),
}));
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (path: string, schema: ZodType) => apiGet(path, schema),
}));

const { findMemberByEmail, findMemberByUsername } = await import('./invite-service');

const ANN = '10000000-0000-4000-8000-00000000000a';
const JOANN = '10000000-0000-4000-8000-00000000000b';

const userWire = (
  id: string,
  email: string,
  membershipStatus = 'ACTIVE',
  username = email.split('@')[0],
) => ({
  id,
  username,
  email,
  display_name: 'Someone',
  user_status: 'ACTIVE',
  membership_status: membershipStatus,
});

/** One backend page, run through the schema the service handed `apiGet` (so a wire drift fails). */
const page = (items: readonly unknown[], hasNext: boolean) => (_path: string, schema: ZodType) =>
  Promise.resolve(
    schema.parse({
      items,
      page: {
        number: 0,
        size: 100,
        total_items: items.length,
        total_pages: 1,
        has_next: hasNext,
        has_previous: false,
      },
    }),
  );

describe('findMemberByEmail', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('searches the user directory by the trimmed email, 100 at a time, with its schema', async () => {
    apiGet.mockImplementationOnce(page([], false));
    expect(await findMemberByEmail(' ann.mwangi@greenfield.example ')).toBeNull();
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith(
      '/api/v1/tenant/users?q=ann.mwangi%40greenfield.example&page=0&size=100',
      userPageSchema,
    );
  });

  it('matches the email exactly, without letter case, never the first hit', async () => {
    // q=ann.mwangi@… also matches joann.mwangi@… (a substring), and Joann comes first.
    apiGet.mockImplementationOnce(
      page(
        [
          userWire(JOANN, 'joann.mwangi@greenfield.example'),
          userWire(ANN, 'Ann.Mwangi@Greenfield.example', 'REVOKED'),
        ],
        false,
      ),
    );
    expect(await findMemberByEmail('ann.mwangi@greenfield.example')).toMatchObject({
      id: ANN,
      membershipStatus: 'REVOKED',
    });
  });

  it('pages on while there are more matches, and stops at the first exact one', async () => {
    apiGet
      .mockImplementationOnce(page([userWire(JOANN, 'joann.mwangi@greenfield.example')], true))
      .mockImplementationOnce(page([userWire(ANN, 'ann.mwangi@greenfield.example')], true));
    expect(await findMemberByEmail('ann.mwangi@greenfield.example')).toMatchObject({ id: ANN });
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(apiGet.mock.calls[1]?.[0]).toContain('page=1');
  });

  it('gives up after 5 pages of 100 (the ceiling) without a match', async () => {
    apiGet.mockImplementation(page([userWire(JOANN, 'joann.mwangi@greenfield.example')], true));
    expect(await findMemberByEmail('ann.mwangi@greenfield.example')).toBeNull();
    expect(apiGet).toHaveBeenCalledTimes(5);
  });

  it('reads nothing for a blank email', async () => {
    expect(await findMemberByEmail('   ')).toBeNull();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('rejects with the read’s own error, so the caller decides what it means (L1)', async () => {
    const lost = new BackendApiError(401);
    apiGet.mockRejectedValueOnce(lost);
    await expect(findMemberByEmail('ann.mwangi@greenfield.example')).rejects.toBe(lost);
  });
});

describe('findMemberByUsername (Ruling 15)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('searches by the trimmed username and matches it exactly, without letter case', async () => {
    // q=esther also matches esther.njoki (a substring), and she comes first.
    apiGet.mockImplementationOnce(
      page(
        [
          userWire(JOANN, 'esther.njoki@greenfield.example'),
          userWire(ANN, 'e.wanjiru@greenfield.example', 'SUSPENDED', 'Esther'),
        ],
        false,
      ),
    );
    expect(await findMemberByUsername(' esther ')).toMatchObject({ id: ANN });
    expect(apiGet).toHaveBeenCalledWith(
      '/api/v1/tenant/users?q=esther&page=0&size=100',
      userPageSchema,
    );
  });

  it('answers null without an exact match, and reads nothing for a blank username', async () => {
    apiGet.mockImplementationOnce(
      page([userWire(JOANN, 'esther.njoki@greenfield.example')], false),
    );
    expect(await findMemberByUsername('esther')).toBeNull();
    expect(await findMemberByUsername('   ')).toBeNull();
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('rejects with the read’s own error (L1)', async () => {
    const refused = new BackendApiError(403);
    apiGet.mockRejectedValueOnce(refused);
    await expect(findMemberByUsername('esther')).rejects.toBe(refused);
  });
});
```

`app/api/tenant/users/invite-check/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { headersMock, requireAuthenticatedUser, findMemberByEmail } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  requireAuthenticatedUser: vi.fn(),
  findMemberByEmail: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: headersMock }));
vi.mock('@/auth/require-authenticated-user', () => ({
  requireAuthenticatedUser,
  UnauthenticatedContextRequestError: class UnauthenticatedContextRequestError extends Error {},
}));
vi.mock('@/modules/administration/users/invite-service', () => ({ findMemberByEmail }));

const { GET } = await import('./route');
const { UnauthenticatedContextRequestError } = await import('@/auth/require-authenticated-user');
const { BackendApiError } = await import('@/auth/backend-api');

const check = (query: string) =>
  GET(new Request(`http://localhost/api/tenant/users/invite-check${query}`));

describe('GET /api/tenant/users/invite-check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    requireAuthenticatedUser.mockResolvedValue({});
  });

  it('answers the membership status the trimmed email already has here', async () => {
    findMemberByEmail.mockResolvedValueOnce({ membershipStatus: 'REVOKED' });
    const response = await check('?email=%20hassan.ali%40greenfield.example%20');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ membershipStatus: 'REVOKED' });
    expect(findMemberByEmail).toHaveBeenCalledWith('hassan.ali@greenfield.example');
  });

  it('answers null when no member has it', async () => {
    findMemberByEmail.mockResolvedValueOnce(null);
    expect(await (await check('?email=neema%40greenfield.example')).json()).toEqual({
      membershipStatus: null,
    });
  });

  it.each([['?email='], ['?email=%20%20'], [''], [`?email=${'a'.repeat(255)}`]])(
    'refuses %s without a read',
    async (query) => {
      expect((await check(query)).status).toBe(400);
      expect(findMemberByEmail).not.toHaveBeenCalled();
    },
  );

  it('refuses without a server-side session, before any read', async () => {
    requireAuthenticatedUser.mockRejectedValueOnce(new UnauthenticatedContextRequestError());
    expect((await check('?email=neema%40greenfield.example')).status).toBe(401);
    expect(findMemberByEmail).not.toHaveBeenCalled();
  });

  it('maps a lost session to 401, a refusal to 403 and anything else to 502', async () => {
    findMemberByEmail.mockRejectedValueOnce(new BackendApiError(401));
    expect((await check('?email=neema%40greenfield.example')).status).toBe(401);
    findMemberByEmail.mockRejectedValueOnce(new BackendApiError(403, { code: 'forbidden' }));
    expect((await check('?email=neema%40greenfield.example')).status).toBe(403);
    findMemberByEmail.mockRejectedValueOnce(new Error('schema drift'));
    const failed = await check('?email=neema%40greenfield.example');
    expect(failed.status).toBe(502);
    // Never the error's own text.
    expect(JSON.stringify(await failed.json())).not.toContain('schema drift');
  });
});
```

**Erratum (2c18194, `test(users): close the review's remaining test gaps`):** the over-long 400 row
is `?email=${'a'.repeat(243)}%40example.com` (255 characters with an `@`), so it fails on the 254
cap rather than on the format; and the Access step's "ties each list refusal" test pins that
neither Add button has `aria-describedby` while no list message shows.

- [ ] **Step 2: Run** — form U on the three test files: FAIL (`./invite-contract`,
      `./invite-service` and `./route` don't resolve).

- [ ] **Step 3: Implement** — `invite-contract.ts`:

```ts
import { z } from 'zod';
import { uuidSchema } from '@/lib/api/wire';

/**
 * UserInvitationResult (contract §C): `user_id`, `membership_id`, `user_status` (DRAFT for a new
 * user, else the reused account's) and `membership_status` (PENDING_APPROVAL). Only the id the
 * redirect needs is read: the invitation exists once the POST answered 201, so nothing else in the
 * echo may turn it into a failure (Ruling 8).
 */
export const invitationResultSchema = z
  .object({ user_id: uuidSchema })
  .transform((result) => ({ userId: result.user_id }));

export type InvitationResult = z.output<typeof invitationResultSchema>;
```

`invite-service.ts`:

```ts
import 'server-only';
import type { UserSummary } from './user-contract';
import { SCAN_CEILING } from './user-rules';
import { listUsers } from './user-service';

const PAGE_SIZE = 100;
// ponytail: at most SCAN_CEILING users (5 pages of 100) per check, like 10's membership search.
const PAGES = SCAN_CEILING / PAGE_SIZE;

/** The first user `GET /tenant/users?q=` lists that `matches` accepts, within the ceiling. Its `q` is
 * a case-insensitive substring over username, email and name with `%` and `_` as wildcards
 * (contract §A), so the hits are a superset and the caller compares exactly. */
async function scanUsers(
  q: string,
  matches: (user: UserSummary) => boolean,
): Promise<UserSummary | null> {
  for (let page = 0; page < PAGES; page += 1) {
    const result = await listUsers({ q, page, size: PAGE_SIZE });
    const match = result.items.find(matches);
    if (match) return match;
    if (!result.page.hasNext) return null;
  }
  return null;
}

/**
 * The member of this institution whose email this is, in any membership status (BG-28: a revoked
 * one still blocks the email); null when none is found within the ceiling. `GET /tenant/users`
 * lists everyone with a membership here; the email is compared exactly, without letter case. One
 * endpoint, no read per hit (BG-09; Ruling 1).
 *
 * A scan cut at the ceiling answers null, as if free (L1's capped scan): an exact email as `q` can't
 * realistically match 500 users, and the backstop is the invitation itself, which is posted first
 * and refused by the platform with a 500 for an email already here, so a member the scan missed is
 * never invited twice; the wizard then shows that failure with its reference.
 *
 * Every read failure REJECTS (L1): the route handler and the action decide what a failure means.
 */
export async function findMemberByEmail(email: string): Promise<UserSummary | null> {
  const q = email.trim();
  if (!q) return null;
  const wanted = q.toLowerCase();
  return scanUsers(q, (user) => user.email.toLowerCase() === wanted);
}

/**
 * The member of this institution whose username this is, compared exactly without letter case;
 * null when none is found within the ceiling. Read only after a failed invitation whose email is
 * free here, to name an in-tenant username collision (BG-07; Ruling 15); one held by an account in
 * another institution can't be seen from here. Rejects on any read failure, as above.
 */
export async function findMemberByUsername(username: string): Promise<UserSummary | null> {
  const q = username.trim();
  if (!q) return null;
  const wanted = q.toLowerCase();
  return scanUsers(q, (user) => user.username.toLowerCase() === wanted);
}
```

`app/api/tenant/users/invite-check/route.ts`:

```ts
import { headers } from 'next/headers';
import { BackendApiError } from '@/auth/backend-api';
import {
  requireAuthenticatedUser,
  UnauthenticatedContextRequestError,
} from '@/auth/require-authenticated-user';
import type { EmailCheck } from '@/modules/administration/users/invite-rules';
import { findMemberByEmail } from '@/modules/administration/users/invite-service';

/** RFC 5321's limit, which the Identity step enforces; the contract states none. */
const MAX_EMAIL = 254;

/**
 * Same-origin email check for the Invite user wizard's Identity step (Ruling 1): the membership
 * status this email already has in the institution, or null. A read, so a Route Handler, not a
 * Server Action (Next's guidance); the context token stays server-side, as for UserPicker's search.
 */
export async function GET(request: Request): Promise<Response> {
  const email = (new URL(request.url).searchParams.get('email') ?? '').trim();
  if (!email || email.length > MAX_EMAIL) {
    return Response.json({ message: 'Enter an email address.' }, { status: 400 });
  }
  try {
    await requireAuthenticatedUser(await headers());
    const member = await findMemberByEmail(email);
    const answer: EmailCheck = { membershipStatus: member?.membershipStatus ?? null };
    return Response.json(answer);
  } catch (error) {
    if (
      error instanceof UnauthenticatedContextRequestError ||
      (error instanceof BackendApiError && error.status === 401)
    ) {
      return Response.json({ message: 'Your session has expired.' }, { status: 401 });
    }
    if (error instanceof BackendApiError && error.status === 403) {
      return Response.json({ message: "You can't check emails in this context." }, { status: 403 });
    }
    return Response.json({ message: 'The email check is unavailable.' }, { status: 502 });
  }
}
```

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs (each must fail the named test; revert after
      each): match with `user.email.toLowerCase().includes(wanted)` in `findMemberByEmail` ("matches
      the email exactly, without letter case, never the first hit"); wrap the loop in
      `try { … } catch { return null; }` ("rejects with the read’s own error, so the caller decides
      what it means (L1)"); call `findMemberByEmail` before `requireAuthenticatedUser` in the route
      ("refuses without a server-side session, before any read"); match with
      `user.username.toLowerCase().includes(wanted)` in `findMemberByUsername` ("searches by the
      trimmed username and matches it exactly, without letter case").

- [ ] **Step 5: Commit** (form C):

```
feat(users): check an invitee's email against the institution's users

A same-origin route handler answers the membership status an email already has in this institution
(any status: a revoked one blocks the email for good, BG-28), from GET /tenant/users?q= matched
exactly without letter case, in at most 5 pages of 100 (Ruling 1); the same scan finds a member by
username for the action (Ruling 15). The service rejects on any read failure; the route maps a lost
session, a refusal and anything else to local words. The invitation result contract reads only the
new user's id (Ruling 8).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** the route is a read, so a Route Handler, not a
Server Action (Next's guidance; UserPicker's `/api/tenant/users` is the precedent); it validates the
email before the session check, which costs nothing and reads nothing.

**Erratum (fix commit `fix(users): harden the invite email check`):** the route answers every
response through `reply()` with `Cache-Control: private, no-store`; the 502 branch logs through
`describeProblem(error)`; the email is validated with `INVITE_FORM_SHAPE.email` (400 "Enter a valid
email address."), replacing `MAX_EMAIL`. Tests add the header, the log spy, a stale-context 403, an
exactly-254-character 200, a `%25` 400, and mixed-case input for `findMemberByEmail` and
`findMemberByUsername`.

### Task 3: The invite action

**Files:**

- Create: `modules/administration/users/invite-actions.ts`
- Create: `modules/administration/users/invite-actions.test.ts`

**Interfaces:**

- Consumes: `runServerAction`, `ActionResult` (`lib/api/action-result.ts`); `explain`
  (`lib/api/explain-action-result.ts`); `apiPost` (`lib/api/tenant-api.ts`); `BackendApiError`;
  `redirect`; 1a's copy and hrefs; 1b's `INVITE_FORM_SHAPE`, `checkInviteAccess`, `inviteBody`;
  2's `invitationResultSchema`, `findMemberByEmail`, `findMemberByUsername`.
- Produces: `inviteUser(previous, formData): Promise<ActionResult>` (`'use server'`): redirects on
  success; `email_taken` (409, with the status message on `email`) or else `username_taken` (409,
  `USERNAME_IN_USE` on `username`), each with the 500's `requestId`; `forbidden`,
  `IDEMPOTENCY_KEY_REUSED` and `internal_error` explained; any other code passes through.

- [ ] **Step 1: Write the failing test** — `invite-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import {
  EMAIL_TAKEN,
  INVITE_FAILED,
  INVITE_MAY_BE_SENT,
  INVITE_REFUSED,
  NEEDS_A_ROLE,
  ROLE_BRANCH_UNASSIGNED,
  USERNAME_IN_USE,
  USERNAME_TAKEN,
} from './invite-rules';

const { apiPost, findMemberByEmail, findMemberByUsername, redirect, runServerAction } = vi.hoisted(
  () => ({
    apiPost: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
      Promise.resolve<unknown>({}),
    ),
    findMemberByEmail: vi.fn((_email: string) => Promise.resolve<unknown>(null)),
    findMemberByUsername: vi.fn((_username: string) => Promise.resolve<unknown>(null)),
    redirect: vi.fn((to: string) => {
      throw new Error(`NEXT_REDIRECT:${to}`);
    }),
    runServerAction: vi.fn(),
  }),
);
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) as unknown }));
vi.mock('@/lib/api/tenant-api', () => ({
  apiPost: (path: string, body: Record<string, unknown>, key: string) => apiPost(path, body, key),
}));
vi.mock('@/lib/api/action-result', () => ({
  runServerAction: (...args: unknown[]) => runServerAction(...args) as unknown,
}));
vi.mock('./invite-service', () => ({
  findMemberByEmail: (email: string) => findMemberByEmail(email),
  findMemberByUsername: (username: string) => findMemberByUsername(username),
}));
vi.mock('@/config/env.server', () => ({ serverEnv: {} }));

const { inviteUser } = await import('./invite-actions');

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const ORG = '11111111-1111-4111-8111-111111111111';
// Distinct first blocks, so a field error names its row.
const WESTLANDS = 'a4000000-0000-4000-8000-0000000000aa';
const HEAD_OFFICE = 'b2000000-0000-4000-8000-0000000000bb';
const TELLER = 'c1000000-0000-4000-8000-0000000000cc';
const NEW_USER = '11000000-0000-4000-8000-0000000000e1';
const ESTHER = 'e5000000-0000-4000-8000-0000000000ee';

const FIELDS = {
  displayName: 'Neema Wanjiku',
  email: 'neema.wanjiku@greenfield.example',
  username: 'neema.wanjiku',
  phone: '',
  membershipType: 'STAFF',
  primaryBranchId: WESTLANDS,
  branchAssignments: JSON.stringify([{ branchId: WESTLANDS, assignmentType: 'HOME' }]),
  roleAssignments: JSON.stringify([{ roleId: TELLER, scopeType: 'TENANT', branchId: '' }]),
  sendIdentityInvite: 'true',
  sendApplicationInvite: 'false',
  idempotencyKey: KEY,
  contextOrganisationId: ORG,
};

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(fields).forEach(([name, value]) => {
    data.set(name, value);
  });
  return data;
}

const invite = (fields: Record<string, string> = FIELDS) => inviteUser(null, form(fields));
const ruleFailure = () => new BackendApiError(500, { code: 'internal_error', requestId: 'req-7' });

describe('inviteUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mirrors runServerAction's contract (lib/api/action-result.ts): its own zod failures become
    // fieldErrors keyed by the issue path, a thrown BackendApiError a failure carrying its code, and
    // a redirect keeps propagating. runServerAction has its own test (the cross-tab guard included).
    runServerAction.mockImplementation(
      async (schema: z.ZodType, formData: FormData, run: (input: unknown) => Promise<unknown>) => {
        const parsed = schema.safeParse(Object.fromEntries(formData));
        if (!parsed.success) {
          return {
            ok: false,
            formError: 'Check the highlighted fields and try again.',
            fieldErrors: Object.fromEntries(
              parsed.error.issues.map((issue) => [issue.path.map(String).join('.'), issue.message]),
            ),
            code: 'validation_failed',
            requestId: null,
          };
        }
        try {
          await run(parsed.data);
        } catch (error) {
          if (!(error instanceof BackendApiError)) throw error;
          return {
            ok: false,
            formError: 'generic',
            fieldErrors: {},
            code: error.code,
            requestId: error.requestId,
          };
        }
        return { ok: true };
      },
    );
  });

  it('posts the explicit snake_case body with the minted key, then opens the new record', async () => {
    apiPost.mockResolvedValueOnce({
      user_id: NEW_USER,
      membership_id: '11000000-0000-4000-8000-0000000000e2',
      user_status: 'DRAFT',
      membership_status: 'PENDING_APPROVAL',
    });

    await expect(invite()).rejects.toThrow(`NEXT_REDIRECT:/admin/users/${NEW_USER}`);
    expect(apiPost).toHaveBeenCalledWith(
      '/api/v1/tenant/users',
      {
        email: 'neema.wanjiku@greenfield.example',
        username: 'neema.wanjiku',
        display_name: 'Neema Wanjiku',
        phone_e164: null,
        membership_type: 'STAFF',
        primary_branch_id: WESTLANDS,
        branch_assignments: [{ branch_id: WESTLANDS, assignment_type: 'HOME' }],
        role_assignments: [{ role_id: TELLER, scope_type: 'TENANT', branch_id: null }],
        send_keycloak_invite: true,
        send_application_invite: false,
      },
      KEY,
    );
    // The cross-tab guard (07's I2) is runServerAction's: the field reaches it untouched.
    expect((runServerAction.mock.calls[0]?.[1] as FormData).get('contextOrganisationId')).toBe(ORG);
    // A success never reads the directory: nothing could stand in a replay's way (Ruling 1).
    expect(findMemberByEmail).not.toHaveBeenCalled();
    expect(findMemberByUsername).not.toHaveBeenCalled();
  });

  it('lands on the directory when the created invitation echoes no readable id', async () => {
    apiPost.mockResolvedValueOnce({ membership_status: 'PENDING_APPROVAL' });
    await expect(invite()).rejects.toThrow('NEXT_REDIRECT:/admin/users');
    expect(redirect).toHaveBeenCalledWith('/admin/users');
  });

  it('refuses a broken rule before any call, naming the field by its row', async () => {
    const result = await invite({
      ...FIELDS,
      roleAssignments: JSON.stringify([
        { roleId: TELLER, scopeType: 'BRANCH', branchId: HEAD_OFFICE },
      ]),
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'validation_failed',
      fieldErrors: { 'roleAssignments.0.branchId': ROLE_BRANCH_UNASSIGNED },
    });
    expect(await invite({ ...FIELDS, roleAssignments: '[]' })).toMatchObject({
      ok: false,
      fieldErrors: { roleAssignments: NEEDS_A_ROLE },
    });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('refuses a malformed key before any call', async () => {
    expect((await invite({ ...FIELDS, idempotencyKey: 'not-a-key' })).ok).toBe(false);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it.each([
    ['ACTIVE', 'This email already belongs to a member of this institution.'],
    [
      'REVOKED',
      "This email's membership here was revoked, so it can't be invited to this institution again.",
    ],
  ])(
    'names a %s member on the email after the invite failed (BG-07), and only then',
    async (status, message) => {
      apiPost.mockRejectedValueOnce(ruleFailure());
      findMemberByEmail.mockResolvedValueOnce({ membershipStatus: status });

      expect(await invite()).toEqual({
        ok: false,
        formError: EMAIL_TAKEN,
        fieldErrors: { email: message },
        code: 'email_taken',
        // The failed post's reference, for support.
        requestId: 'req-7',
      });
      expect(findMemberByEmail).toHaveBeenCalledWith('neema.wanjiku@greenfield.example');
      expect(apiPost.mock.invocationCallOrder[0]).toBeLessThan(
        findMemberByEmail.mock.invocationCallOrder[0] ?? 0,
      );
      // A taken email explains the failure: no username lookup.
      expect(findMemberByUsername).not.toHaveBeenCalled();
    },
  );

  it('names a username a member here holds once the email is free, with the reference (Ruling 15)', async () => {
    apiPost.mockRejectedValueOnce(ruleFailure());
    findMemberByUsername.mockResolvedValueOnce({ id: ESTHER, username: 'Neema.Wanjiku' });

    expect(await invite()).toEqual({
      ok: false,
      formError: USERNAME_TAKEN,
      fieldErrors: { username: USERNAME_IN_USE },
      code: 'username_taken',
      requestId: 'req-7',
    });
    expect(findMemberByUsername).toHaveBeenCalledWith('neema.wanjiku');
    expect(findMemberByEmail.mock.invocationCallOrder[0]).toBeLessThan(
      findMemberByUsername.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('names the causes it can’t check, with the reference, when no member has the email or username', async () => {
    apiPost.mockRejectedValueOnce(ruleFailure());
    expect(await invite()).toMatchObject({
      ok: false,
      formError: INVITE_FAILED,
      fieldErrors: {},
      code: 'internal_error',
      requestId: 'req-7',
    });
    expect(findMemberByUsername).toHaveBeenCalledWith('neema.wanjiku');
  });

  it('keeps the original failure when the lookups themselves fail', async () => {
    apiPost.mockRejectedValueOnce(ruleFailure());
    findMemberByEmail.mockRejectedValueOnce(new BackendApiError(503));
    findMemberByUsername.mockRejectedValueOnce(new BackendApiError(503));
    expect(await invite()).toMatchObject({
      formError: INVITE_FAILED,
      code: 'internal_error',
      requestId: 'req-7',
    });
  });

  it('looks nothing up after a failure that is no rule failure', async () => {
    apiPost.mockRejectedValueOnce(new BackendApiError(502, { requestId: 'req-8' }));
    expect(await invite()).toMatchObject({ formError: 'generic', requestId: 'req-8' });
    expect(findMemberByEmail).not.toHaveBeenCalled();
    expect(findMemberByUsername).not.toHaveBeenCalled();
  });

  it('explains a 403: the role, or one of the branches (contract §E.3)', async () => {
    apiPost.mockRejectedValueOnce(new BackendApiError(403, { code: 'forbidden' }));
    expect(await invite()).toMatchObject({ formError: INVITE_REFUSED, code: 'forbidden' });
  });

  it('says an earlier send may have landed when its key already sent other answers (Ruling 16)', async () => {
    apiPost.mockRejectedValueOnce(
      new BackendApiError(409, { code: 'IDEMPOTENCY_KEY_REUSED', requestId: 'req-9' }),
    );
    expect(await invite()).toMatchObject({
      formError: INVITE_MAY_BE_SENT,
      code: 'IDEMPOTENCY_KEY_REUSED',
      requestId: 'req-9',
    });
    expect(findMemberByEmail).not.toHaveBeenCalled();
  });

  it('leaves any other code with its own message', async () => {
    apiPost.mockRejectedValueOnce(
      new BackendApiError(409, { code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' }),
    );
    expect(await invite()).toMatchObject({
      formError: 'generic',
      code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
    });
  });
});
```

- [ ] **Step 2: Run** — form U on `modules/administration/users/invite-actions.test.ts`: FAIL
      (`./invite-actions` doesn't resolve).

- [ ] **Step 3: Implement** — `invite-actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiPost } from '@/lib/api/tenant-api';
import { invitationResultSchema } from './invite-contract';
import {
  EMAIL_TAKEN,
  EMAIL_TAKEN_CODE,
  INVITE_FAILED,
  INVITE_MAY_BE_SENT,
  INVITE_REFUSED,
  memberEmailMessage,
  USERNAME_IN_USE,
  USERNAME_TAKEN,
  USERNAME_TAKEN_CODE,
  userRecordHref,
  USERS_HREF,
} from './invite-rules';
import { checkInviteAccess, INVITE_FORM_SHAPE, inviteBody } from './invite-schema';
import { findMemberByEmail, findMemberByUsername } from './invite-service';
import type { MembershipStatus } from './user-contract';

const inviteInput = z
  .object({ ...INVITE_FORM_SHAPE, idempotencyKey: z.uuid() })
  .superRefine(checkInviteAccess);

/** BG-07: an invite rule failure is a 500 `internal_error`, which any bug is too. */
const isRuleFailure = (error: unknown): error is BackendApiError =>
  error instanceof BackendApiError && error.status === 500 && error.code === 'internal_error';

/**
 * Invite user (spec §10.5): one `POST /tenant/users` with the key the wizard minted on mount, then
 * the new user's record. The wizard checked the email on its Identity step; the POST still goes
 * first here, so a retry that replays an invitation whose response was lost (same key) is never
 * turned away by its own new member (Ruling 1, as 16's tenant code). After a 500 it names a taken
 * email, or else a username a member here holds (Ruling 15), keeping the 500's reference.
 */
export async function inviteUser(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const taken: { status: MembershipStatus | null } = { status: null };
  const result = await runServerAction(inviteInput, formData, async (input) => {
    let created: unknown;
    try {
      created = await apiPost('/api/v1/tenant/users', inviteBody(input), input.idempotencyKey);
    } catch (error) {
      if (isRuleFailure(error)) {
        // Only disambiguates the failure: an unreadable directory leaves the original error. A
        // failed mutation rolls back its key (contract §A), so a retry with it is safe.
        const member = await findMemberByEmail(input.email).catch(() => null);
        if (member) {
          taken.status = member.membershipStatus;
          // A frontend-detected condition travels as a typed problem (16's `tenant_code_taken`).
          throw new BackendApiError(409, { code: EMAIL_TAKEN_CODE, requestId: error.requestId });
        }
        if (await findMemberByUsername(input.username).catch(() => null)) {
          throw new BackendApiError(409, { code: USERNAME_TAKEN_CODE, requestId: error.requestId });
        }
      }
      throw error;
    }
    const invitation = invitationResultSchema.safeParse(created);
    // Rethrown by runServerAction (unstable_rethrow). The invitation exists either way: an echo
    // without a readable id lands on the directory, where the new member is listed first.
    redirect(invitation.success ? userRecordHref(invitation.data.userId) : USERS_HREF);
  });
  const emailNamed =
    taken.status === null
      ? result
      : explain(result, EMAIL_TAKEN_CODE, EMAIL_TAKEN, { email: memberEmailMessage(taken.status) });
  const named = explain(emailNamed, USERNAME_TAKEN_CODE, USERNAME_TAKEN, {
    username: USERNAME_IN_USE,
  });
  const refused = explain(named, 'forbidden', INVITE_REFUSED);
  // A 409 for a reused key: this wizard already sent different answers, which may have landed.
  const reused = explain(refused, 'IDEMPOTENCY_KEY_REUSED', INVITE_MAY_BE_SENT);
  return explain(reused, 'internal_error', INVITE_FAILED);
}
```

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs (each must fail the named test; revert after
      each): call `await findMemberByEmail(input.email)` before the `apiPost` ("posts the explicit
      snake_case body with the minted key, then opens the new record"); drop the `isRuleFailure`
      condition so any failure is looked up ("looks nothing up after a failure that is no rule
      failure"); pass `crypto.randomUUID()` instead of `input.idempotencyKey` ("posts the explicit
      snake_case body…"); always `redirect(USERS_HREF)` ("posts the explicit snake_case body…");
      throw the email's 409 without `requestId` ("names a ACTIVE member on the email after the
      invite failed (BG-07), and only then"); look the username up before the email ("names a
      username a member here holds once the email is free, with the reference (Ruling 15)"); drop
      the username lookup's `.catch(() => null)` ("keeps the original failure when the lookups
      themselves fail"); drop the `IDEMPOTENCY_KEY_REUSED` explain ("says an earlier send may
      have landed when its key already sent other answers (Ruling 16)").

- [ ] **Step 5: Commit** (form C):

```
feat(users): send an invitation, naming a taken email after a failed post

inviteUser posts one InviteUser body with the key the wizard minted and the cross-tab guard, then
opens the new user's record (or the directory, when the answer has no readable id). It posts first,
as 16's create does: only a 500 is followed by an email lookup that names a taken email on the Email
field, then a username lookup that names one a member here holds (Ruling 15), each keeping the
500's reference, so a retry that replays a lost success is never turned away (Ruling 1). A 403, a
reused key (Ruling 16) and an unexplained 500 get words that name their likely causes (BG-07,
BG-33).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** the two `.catch(() => null)` only disambiguate
a failure that already happened (rule 10); `runServerAction` owns the session check and the
cross-tab guard, and has its own tests.

**Erratum (fix commit `fix(users): refresh before redirecting to the invited member`):** `inviteUser`
calls `refresh()` (`next/cache`) right before `redirect(...)`, as `updateRole` does, so the shell's
bell and the back/forward cache drop the pre-invitation state; the success test asserts one call
before the redirect.

### Task 4: The wizard

Five sub-tasks, each briefed, implemented, reviewed and committed on its own: **4a** (the shared
select and the Access step), **4b** (the Identity and Invitation steps), **4c** (the Review step),
**4d** (the wizard itself, with the steps' tests) and **4e** (the wizard's sending tests). Every
component is a client component under `modules/administration/users/components/`.

#### Task 4a: The Access step

**Files:**

- Create: `modules/administration/users/components/invite-choice-field.tsx`
- Create: `modules/administration/users/components/invite-access-fields.tsx`
- Create: `modules/administration/users/components/invite-access-fields.test.tsx`

**Interfaces:**

- Consumes: 1a's `ChoiceOption`, `ASSIGNMENT_TYPE_OPTIONS`, `SCOPE_OPTIONS`, `toChoices`,
  `needsBranch`, `ROLES_CAPPED`, `BRANCHES_CAPPED`, `NEEDS_A_BRANCH`; 1b's `InviteValues`,
  `inviteSchema`, `EMPTY_INVITE`, `EMPTY_BRANCH_ROW`, `EMPTY_ROLE_ROW`; 10's `SelectOption`.
- Produces: `InviteChoiceField` (props `control`, `trigger`, `name`, `label`, `options`,
  `required?`, `hint?`, `noneLabel?`, `disabledValue?`, `sx?`: an RHF-bound MUI select whose
  choice validates its own field); `InviteAccessFields` (props `control`, `trigger`, `roles`,
  `branches`, `rolesCapped`, `branchesCapped`, `branchListError?`, `roleListError?`): row groups
  "Branch assignment N" and "Role N", "Remove branch assignment N" / "Remove role N", "Add
  branch" / "Add role", "Primary branch".

- [ ] **Step 1: Write the failing test** — `invite-access-fields.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { BRANCHES_CAPPED, NEEDS_A_BRANCH, ROLES_CAPPED } from '../invite-rules';
import { EMPTY_INVITE, inviteSchema, type InviteValues } from '../invite-schema';
import { InviteAccessFields } from './invite-access-fields';

type User = ReturnType<typeof userEvent.setup>;

const WESTLANDS = 'a4000000-0000-4000-8000-0000000000aa';
const HEAD_OFFICE = 'b2000000-0000-4000-8000-0000000000bb';
const TELLER = 'c1000000-0000-4000-8000-0000000000cc';
const ROLES = [{ id: TELLER, label: 'Teller (TELLER)' }];
const BRANCHES = [
  { id: HEAD_OFFICE, label: 'Head Office (HEAD_OFFICE)' },
  { id: WESTLANDS, label: 'Westlands Branch (WESTLANDS)' },
];

interface HarnessProps {
  values?: Partial<InviteValues>;
  capped?: boolean;
}

/** The step inside its own form, validated as the wizard's Continue does. */
function Harness({ values = {}, capped = false }: HarnessProps) {
  const {
    control,
    trigger,
    formState: { errors },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { ...EMPTY_INVITE, membershipType: 'STAFF', ...values },
  });
  return (
    <form>
      <InviteAccessFields
        control={control}
        trigger={trigger}
        roles={ROLES}
        branches={BRANCHES}
        rolesCapped={capped}
        branchesCapped={capped}
        branchListError={errors.branchAssignments}
        roleListError={errors.roleAssignments}
      />
      <button
        type="button"
        onClick={() => {
          void trigger(['branchAssignments', 'roleAssignments']);
        }}
      >
        Check
      </button>
    </form>
  );
}

async function choose(user: User, scope: HTMLElement, label: string, option: string) {
  await user.click(within(scope).getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
}

const group = (name: string) => screen.getByRole('group', { name });

describe('InviteAccessFields', () => {
  it('starts with one branch row and one role row, branches first, then the primary branch', () => {
    renderWithProviders(<Harness />);

    expect(
      screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(['Branch assignments', 'Roles']);
    expect(
      within(group('Branch assignment 1')).getByRole('combobox', { name: 'Assignment type' }),
    ).toHaveTextContent('Home');
    expect(within(group('Role 1')).getByRole('combobox', { name: 'Scope' })).toHaveTextContent(
      'Institution (all branches)',
    );
    expect(screen.getByRole('combobox', { name: 'Primary branch' })).toHaveAccessibleDescription(
      'Optional. Shown on their record as their main branch.',
    );
    expect(screen.queryByText(BRANCHES_CAPPED)).toBeNull();
  });

  it('adds a row with its first field focused, and returns focus to Add after a remove', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Add branch' }));
    await waitFor(() => {
      expect(
        within(group('Branch assignment 2')).getByRole('combobox', { name: 'Branch' }),
      ).toHaveFocus();
    });

    await user.click(screen.getByRole('button', { name: 'Remove branch assignment 2' }));
    expect(screen.queryByRole('group', { name: 'Branch assignment 2' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add branch' })).toHaveFocus();
  });

  it('says a staff member needs a branch once the last one is removed', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Remove branch assignment 1' }));
    await user.click(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByText(NEEDS_A_BRANCH)).toBeInTheDocument();
  });

  it('tells an auditor the branches are optional', () => {
    renderWithProviders(<Harness values={{ membershipType: 'AUDITOR' }} />);
    expect(
      screen.getByText(
        'Optional for auditors and system members. Assignment types are labels; roles grant permissions.',
      ),
    ).toBeInTheDocument();
  });

  it('offers one-branch scope only once a branch is assigned, and only their branches', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);
    const role = group('Role 1');

    expect(within(role).getByRole('combobox', { name: 'Scope' })).toHaveAccessibleDescription(
      'Applies at every branch and at institution level. Add a branch above to scope a role to one branch.',
    );
    await user.click(within(role).getByRole('combobox', { name: 'Scope' }));
    expect(screen.getByRole('option', { name: 'One branch' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.keyboard('{Escape}');

    await choose(user, group('Branch assignment 1'), 'Branch', 'Westlands Branch (WESTLANDS)');
    await choose(user, role, 'Scope', 'One branch');
    expect(within(role).getByRole('combobox', { name: 'Scope' })).toHaveAccessibleDescription(
      'Applies only while that branch is selected.',
    );
    await user.click(within(role).getByRole('combobox', { name: 'Branch' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Westlands Branch (WESTLANDS)',
    ]);
  });

  it('offers every active branch as primary, or none', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('combobox', { name: 'Primary branch' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'None',
      'Head Office (HEAD_OFFICE)',
      'Westlands Branch (WESTLANDS)',
    ]);
  });

  it('says when either list stops at 100 (L1)', () => {
    renderWithProviders(<Harness capped />);
    expect(screen.getByText(BRANCHES_CAPPED)).toBeInTheDocument();
    expect(screen.getByText(ROLES_CAPPED)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run** — form U on the test file: FAIL (`./invite-access-fields` doesn't resolve).

- [ ] **Step 3: Implement** — `invite-choice-field.tsx`:

```tsx
'use client';

import {
  Controller,
  type Control,
  type FieldPathByValue,
  type UseFormTrigger,
} from 'react-hook-form';
import MenuItem from '@mui/material/MenuItem';
import TextField, { type TextFieldProps } from '@mui/material/TextField';
import type { ChoiceOption } from '../invite-rules';
import type { InviteValues } from '../invite-schema';

interface InviteChoiceFieldProps {
  control: Control<InviteValues>;
  trigger: UseFormTrigger<InviteValues>;
  name: FieldPathByValue<InviteValues, string>;
  label: string;
  options: readonly ChoiceOption[];
  required?: boolean;
  /** Shown under the field while it holds no error. */
  hint?: string;
  /** An empty first option, for an optional choice. */
  noneLabel?: string;
  /** An option shown but not choosable, e.g. One branch before any branch is assigned. */
  disabledValue?: string;
  sx?: TextFieldProps['sx'];
}

/**
 * One of the wizard's selects, bound to React Hook Form. A choice is final, so it validates its own
 * field at once: a refusal clears with the fix (16's `OptionField`). Nothing validates on blur, so
 * no error line moves Continue under the pointer (AGENTS.md).
 */
export function InviteChoiceField({
  control,
  trigger,
  name,
  label,
  options,
  required = false,
  hint,
  noneLabel,
  disabledValue,
  sx,
}: InviteChoiceFieldProps) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <TextField
          select
          label={label}
          required={required}
          value={field.value}
          onChange={(event) => {
            field.onChange(event.target.value);
            void trigger(name);
          }}
          onBlur={field.onBlur}
          inputRef={field.ref}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message ?? hint}
          sx={sx}
        >
          {noneLabel !== undefined && <MenuItem value="">{noneLabel}</MenuItem>}
          {options.map((option) => (
            <MenuItem
              key={option.value}
              value={option.value}
              disabled={option.value === disabledValue}
            >
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      )}
    />
  );
}
```

`invite-access-fields.tsx`:

```tsx
'use client';

import { useRef } from 'react';
import {
  useFieldArray,
  useWatch,
  type Control,
  type FieldError,
  type UseFormTrigger,
} from 'react-hook-form';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormHelperText from '@mui/material/FormHelperText';
import Typography from '@mui/material/Typography';
import AddOutlined from '@mui/icons-material/AddOutlined';
import {
  ASSIGNMENT_TYPE_OPTIONS,
  BRANCHES_CAPPED,
  needsBranch,
  ROLES_CAPPED,
  SCOPE_OPTIONS,
  toChoices,
} from '../invite-rules';
import { EMPTY_BRANCH_ROW, EMPTY_ROLE_ROW, type InviteValues } from '../invite-schema';
import type { SelectOption } from '../user-rules';
import { InviteChoiceField } from './invite-choice-field';

const TENANT_HELP = 'Applies at every branch and at institution level.';
const TENANT_HELP_NO_BRANCH = `${TENANT_HELP} Add a branch above to scope a role to one branch.`;
const BRANCH_HELP = 'Applies only while that branch is selected.';

/** An error on a whole list sits at its root: `trigger` puts it on the list, `handleSubmit` on
 * `root` (RHF's field-array rule), and a server field error on the list again. */
type ListError = Partial<FieldError> & { root?: FieldError };
const listMessage = (error: ListError | undefined) => error?.message ?? error?.root?.message;

/** A row's fields side by side from `sm`, stacked below it; Remove stays last. */
const row = (columns: string) =>
  ({
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', sm: `${columns} auto` },
    gap: 3,
    alignItems: 'start',
  }) as const;
/** Remove lines up with the fields, under their labels. */
const REMOVE = { justifySelf: 'start', mt: { sm: 5.5 } } as const;

interface InviteAccessFieldsProps {
  control: Control<InviteValues>;
  trigger: UseFormTrigger<InviteValues>;
  roles: readonly SelectOption[];
  branches: readonly SelectOption[];
  rolesCapped: boolean;
  branchesCapped: boolean;
  /** The two lists' own errors (a missing branch or role), from the form state. */
  branchListError?: ListError;
  roleListError?: ListError;
}

/**
 * The Access step (spec §10.5; Ruling 2): branch assignments first, because a branch-scoped role
 * must name one of them; then the roles; then the primary branch. Only ACTIVE roles and branches are
 * offered, so the backend's ACTIVE rules (BG-07) hold for every choice.
 */
export function InviteAccessFields({
  control,
  trigger,
  roles,
  branches,
  rolesCapped,
  branchesCapped,
  branchListError,
  roleListError,
}: InviteAccessFieldsProps) {
  const branchRows = useFieldArray({ control, name: 'branchAssignments' });
  const roleRows = useFieldArray({ control, name: 'roleAssignments' });
  const addBranch = useRef<HTMLButtonElement>(null);
  const addRole = useRef<HTMLButtonElement>(null);
  const membershipType = useWatch({ control, name: 'membershipType' });
  const assignedRows = useWatch({ control, name: 'branchAssignments' });
  const roleValues = useWatch({ control, name: 'roleAssignments' });
  const assigned = new Set(assignedRows.map((assignment) => assignment.branchId).filter(Boolean));
  const branchChoices = toChoices(branches);
  const roleChoices = toChoices(roles);
  const branchMessage = listMessage(branchListError);
  const roleMessage = listMessage(roleListError);

  return (
    <>
      <Box component="section" aria-labelledby="invite-branches" sx={{ display: 'grid', gap: 3 }}>
        <Typography id="invite-branches" component="h3" variant="h5">
          Branch assignments
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {needsBranch(membershipType)
            ? 'Staff and admin members need at least one branch. Assignment types are labels; roles grant permissions.'
            : 'Optional for auditors and system members. Assignment types are labels; roles grant permissions.'}
        </Typography>
        {branchRows.fields.map((field, index) => (
          <Box
            key={field.id}
            role="group"
            aria-label={`Branch assignment ${index + 1}`}
            sx={row('minmax(0, 2fr) minmax(0, 1fr)')}
          >
            <InviteChoiceField
              control={control}
              trigger={trigger}
              name={`branchAssignments.${index}.branchId`}
              label="Branch"
              options={branchChoices}
              required
            />
            <InviteChoiceField
              control={control}
              trigger={trigger}
              name={`branchAssignments.${index}.assignmentType`}
              label="Assignment type"
              options={ASSIGNMENT_TYPE_OPTIONS}
              required
            />
            <Button
              aria-label={`Remove branch assignment ${index + 1}`}
              onClick={() => {
                branchRows.remove(index);
                addBranch.current?.focus();
              }}
              sx={REMOVE}
            >
              Remove
            </Button>
          </Box>
        ))}
        {branchMessage && <FormHelperText error>{branchMessage}</FormHelperText>}
        {branchesCapped && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {BRANCHES_CAPPED}
          </Typography>
        )}
        <Box>
          <Button
            ref={addBranch}
            variant="outlined"
            startIcon={<AddOutlined />}
            onClick={() => {
              branchRows.append({ ...EMPTY_BRANCH_ROW }, { shouldFocus: true });
            }}
          >
            Add branch
          </Button>
        </Box>
      </Box>

      <Box component="section" aria-labelledby="invite-roles" sx={{ display: 'grid', gap: 3 }}>
        <Typography id="invite-roles" component="h3" variant="h5">
          Roles
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          At least one role. A branch-scoped role needs one of their branches above.
        </Typography>
        {roleRows.fields.map((field, index) => {
          const scope = roleValues[index]?.scopeType ?? 'TENANT';
          const chosen = roleValues[index]?.branchId ?? '';
          // Their branches above, plus a branch chosen before it was taken away there, so the
          // select still shows it, with the refusal under it.
          const scopeBranches = branchChoices.filter(
            (branch) => assigned.has(branch.value) || branch.value === chosen,
          );
          return (
            <Box
              key={field.id}
              role="group"
              aria-label={`Role ${index + 1}`}
              sx={row('minmax(0, 2fr) minmax(0, 1fr) minmax(0, 2fr)')}
            >
              <InviteChoiceField
                control={control}
                trigger={trigger}
                name={`roleAssignments.${index}.roleId`}
                label="Role"
                options={roleChoices}
                required
              />
              <InviteChoiceField
                control={control}
                trigger={trigger}
                name={`roleAssignments.${index}.scopeType`}
                label="Scope"
                options={SCOPE_OPTIONS}
                required
                disabledValue={assigned.size === 0 ? 'BRANCH' : undefined}
                hint={
                  scope === 'BRANCH'
                    ? BRANCH_HELP
                    : assigned.size === 0
                      ? TENANT_HELP_NO_BRANCH
                      : TENANT_HELP
                }
              />
              {scope === 'BRANCH' ? (
                <InviteChoiceField
                  control={control}
                  trigger={trigger}
                  name={`roleAssignments.${index}.branchId`}
                  label="Branch"
                  options={scopeBranches}
                  required
                />
              ) : (
                // Keeps Remove in its column while the role applies everywhere.
                <Box aria-hidden="true" sx={{ display: { xs: 'none', sm: 'block' } }} />
              )}
              <Button
                aria-label={`Remove role ${index + 1}`}
                onClick={() => {
                  roleRows.remove(index);
                  addRole.current?.focus();
                }}
                sx={REMOVE}
              >
                Remove
              </Button>
            </Box>
          );
        })}
        {roleMessage && <FormHelperText error>{roleMessage}</FormHelperText>}
        {rolesCapped && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {ROLES_CAPPED}
          </Typography>
        )}
        <Box>
          <Button
            ref={addRole}
            variant="outlined"
            startIcon={<AddOutlined />}
            onClick={() => {
              roleRows.append({ ...EMPTY_ROLE_ROW }, { shouldFocus: true });
            }}
          >
            Add role
          </Button>
        </Box>
      </Box>

      <InviteChoiceField
        control={control}
        trigger={trigger}
        name="primaryBranchId"
        label="Primary branch"
        options={branchChoices}
        noneLabel="None"
        hint="Optional. Shown on their record as their main branch."
        sx={{ maxWidth: 640 }}
      />
    </>
  );
}
```

**Erratum (fix commit `fix(users): clear a stale list error and mark the capped lists as notes`):**
on Add, a list refusal that is showing re-validates its list (`if (branchMessage) void
trigger('branchAssignments')`, and the same for roles), so the new row's own refusal replaces it
(rule 8). The two capped lists are `<Alert severity="info" role="note">` (rule 13). Each list
refusal has a `useId` id and describes its Add button while it shows. RHF 7.90's `trigger` also puts
a list's error on `root`, so the pre-flight note above describes 7.89.

**Erratum (133d1b6, `fix(users): keep the Access rows readable at narrow widths`):** the role row's
Scope column has a floor, `row('minmax(0, 2fr) minmax(12.5rem, 1fr) minmax(0, 2fr)', …)`, so
"Institution (all branches)" shows whole from 600 to 1440 px, and Role and Branch names can ellipsize
from 600 to 1024 px. Below `sm`, `row(columns, separated)` rules off a row that has another row under
it (a 1 px `divider` rule, 12 px below it, on every row but a section's last): each Remove sits 25 px
from the next row's first label, against 12 px between two fields of one row, and the last row's Remove
stays 12 px above "Add branch" or "Add role". The e2e test "keeps the Access rows readable (1280 px,
375 px)" pins both.

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs (each must fail the named test; revert after
      each): delete `addBranch.current?.focus();` ("adds a row with its first field focused, and
      returns focus to Add after a remove"); pass `disabledValue={undefined}` to the Scope field
      ("offers one-branch scope only once a branch is assigned, and only their branches"); offer
      `branchChoices` instead of `scopeBranches` to the role's Branch field (same test); drop the
      `branchesCapped &&` caption ("says when either list stops at 100 (L1)").

- [ ] **Step 5: Commit** (form C):

```
feat(users): add the invite wizard's Access step

Branch assignments first (a branch-scoped role names one of them), then roles with their scope, then
an optional primary branch (Ruling 2). Each row is a named group with its own Remove; Add focuses
the new row and Remove returns focus to Add. Only active roles and branches are offered, and a list
cut at 100 says so (L1). A choice validates its own field at once through the shared select.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** a list-level error can sit on the list or on
`list.root` depending on how validation ran (the pre-flight note); `listMessage` reads both.

#### Task 4b: The Identity and Invitation steps

**Files:**

- Create: `modules/administration/users/components/invite-identity-fields.tsx`
- Create: `modules/administration/users/components/invite-identity-fields.test.tsx`
- Create: `modules/administration/users/components/invite-invitation-fields.tsx`
- Create: `modules/administration/users/components/invite-invitation-fields.test.tsx`

**Interfaces:**

- Consumes: 1a's `IDENTITY_FIELDS`, `IDENTITY_LABELS`, `IdentityField`, `MEMBERSHIP_TYPE_OPTIONS`,
  `INVITATION_NOTE`; 1b's `InviteValues`, `inviteSchema`, `EMPTY_INVITE`; 4a's
  `InviteChoiceField`.
- Produces: `InviteIdentityFields` (props `control`, `register`, `trigger`, `errors`) and
  `InviteInvitationFields` (prop `control`).

- [ ] **Step 1: Write the failing tests** — `invite-identity-fields.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { IDENTITY_FIELDS } from '../invite-rules';
import { EMPTY_INVITE, inviteSchema, type InviteValues } from '../invite-schema';
import { InviteIdentityFields } from './invite-identity-fields';

/** The step inside its own form, validated as the wizard's Continue does. */
function Harness() {
  const {
    control,
    register,
    trigger,
    formState: { errors },
  } = useForm<InviteValues>({ resolver: zodResolver(inviteSchema), defaultValues: EMPTY_INVITE });
  return (
    <form>
      <InviteIdentityFields
        control={control}
        register={register}
        trigger={trigger}
        errors={errors}
      />
      <button
        type="button"
        onClick={() => {
          void trigger([...IDENTITY_FIELDS]);
        }}
      >
        Check
      </button>
    </form>
  );
}

describe('InviteIdentityFields', () => {
  it('labels each field and says what it takes', () => {
    renderWithProviders(<Harness />);

    expect(screen.getByRole('textbox', { name: 'Full name' })).toBeRequired();
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAccessibleDescription(
      "We check it isn't already in use in this institution.",
    );
    expect(screen.getByRole('textbox', { name: 'Username' })).toHaveAccessibleDescription(
      'Letters, digits, dots, underscores or hyphens, 3–50 characters.',
    );
    // BG-17: the phone is stored but never readable afterwards.
    expect(screen.getByRole('textbox', { name: 'Phone' })).toHaveAccessibleDescription(
      "Optional. International format, e.g. +254712000140. It can't be viewed after the invitation is sent.",
    );
    expect(screen.getByRole('combobox', { name: 'Membership type' })).toHaveAccessibleDescription(
      "Staff and admin members need a branch; auditors and system members don't.",
    );
  });

  it('offers the four membership types', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('combobox', { name: 'Membership type' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Staff',
      'Admin',
      'Auditor',
      'System',
    ]);
  });

  it('adds no error line on a blur, so a click on Continue never lands on a moved page', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('textbox', { name: 'Full name' }));
    await user.tab();

    expect(screen.queryByText('Enter a name of at least 2 characters.')).toBeNull();
  });

  it('clears a refused field’s error as soon as it is fixed', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);
    const username = screen.getByRole('textbox', { name: 'Username' });

    await user.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => {
      expect(username).toHaveAccessibleDescription(
        'Use 3–50 letters, digits, dots, underscores or hyphens.',
      );
    });

    await user.type(username, 'neema.wanjiku');
    await waitFor(() => {
      expect(username).toHaveAccessibleDescription(
        'Letters, digits, dots, underscores or hyphens, 3–50 characters.',
      );
    });
  });
});
```

`invite-invitation-fields.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { useForm } from 'react-hook-form';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { INVITATION_NOTE } from '../invite-rules';
import { EMPTY_INVITE, type InviteValues } from '../invite-schema';
import { InviteInvitationFields } from './invite-invitation-fields';

function Harness({ onValues }: { onValues: (values: InviteValues) => void }) {
  const { control, getValues } = useForm<InviteValues>({ defaultValues: EMPTY_INVITE });
  return (
    <form>
      <InviteInvitationFields control={control} />
      <button
        type="button"
        onClick={() => {
          onValues(getValues());
        }}
      >
        Read
      </button>
    </form>
  );
}

describe('InviteInvitationFields', () => {
  it('starts with the identity-provider invitation on and the application invitation off', () => {
    renderWithProviders(<Harness onValues={() => undefined} />);

    const identity = screen.getByRole('checkbox', {
      name: 'Send the identity-provider invitation',
    });
    expect(identity).toBeChecked();
    expect(identity).toHaveAccessibleDescription(
      'After approval, once their sign-in identity is created, the identity provider emails them to verify their address.',
    );
    const application = screen.getByRole('checkbox', { name: 'Send the application invitation' });
    expect(application).not.toBeChecked();
    expect(application).toHaveAccessibleDescription(
      "Also sends them the application's own invitation email.",
    );
    // BG-25: a note, not an alert, so a screen reader isn't interrupted.
    expect(screen.getByRole('note')).toHaveTextContent(INVITATION_NOTE);
  });

  it("keeps each flag as the form's 'true' or 'false'", async () => {
    const user = userEvent.setup({ delay: null });
    let values: InviteValues | null = null;
    renderWithProviders(
      <Harness
        onValues={(read) => {
          values = read;
        }}
      />,
    );

    await user.click(
      screen.getByRole('checkbox', { name: 'Send the identity-provider invitation' }),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Send the application invitation' }));
    await user.click(screen.getByRole('button', { name: 'Read' }));

    expect(values).toMatchObject({ sendIdentityInvite: 'false', sendApplicationInvite: 'true' });
  });
});
```

**Erratum (7aa5a38, `test(users): pin the Identity step's input types and its re-check rule`):** the
Email input is `type="email"` and required, Phone is `type="tel"` and optional, and Username is
required; Username's `aria-invalid` follows its error (true on the refusal, false after the fix).
The re-check test types into Full name instead of clicking it, since a keystroke into a field with
no error validates nothing.

- [ ] **Step 2: Run** — form U on both test files: FAIL (the two components don't resolve).

- [ ] **Step 3: Implement** — `invite-identity-fields.tsx`:

```tsx
'use client';

import type { Control, FieldErrors, UseFormRegister, UseFormTrigger } from 'react-hook-form';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { IDENTITY_LABELS, MEMBERSHIP_TYPE_OPTIONS, type IdentityField } from '../invite-rules';
import type { InviteValues } from '../invite-schema';
import { InviteChoiceField } from './invite-choice-field';

/** Field groups stay a readable width on a wide screen, as 16's wizard does. */
const FIELD_GROUP = { maxWidth: 640, display: 'grid', gap: 4.5 } as const;

interface InviteIdentityFieldsProps {
  control: Control<InviteValues>;
  register: UseFormRegister<InviteValues>;
  trigger: UseFormTrigger<InviteValues>;
  errors: FieldErrors<InviteValues>;
}

/** The Identity step (spec §10.5): who is invited, and as what kind of member. */
export function InviteIdentityFields({
  control,
  register,
  trigger,
  errors,
}: InviteIdentityFieldsProps) {
  // An error clears as soon as its field is fixed, not on the blur that follows: that blur can be
  // the click on Continue, and the summary leaving would shift the page under the pointer (16).
  const text = (name: Exclude<IdentityField, 'membershipType'>, hint?: string) => ({
    ...register(name, {
      onChange: () => {
        if (errors[name] !== undefined) void trigger(name);
      },
    }),
    label: IDENTITY_LABELS[name],
    error: errors[name] !== undefined,
    helperText: errors[name]?.message ?? hint,
  });

  return (
    <Box sx={FIELD_GROUP}>
      <TextField
        required
        autoComplete="off"
        {...text('displayName')}
        slotProps={{ htmlInput: { maxLength: 100 } }}
      />
      <TextField
        required
        type="email"
        autoComplete="off"
        {...text('email', "We check it isn't already in use in this institution.")}
      />
      <TextField
        required
        autoComplete="off"
        {...text('username', 'Letters, digits, dots, underscores or hyphens, 3–50 characters.')}
        slotProps={{ htmlInput: { maxLength: 50, spellCheck: false, autoCapitalize: 'none' } }}
      />
      <TextField
        type="tel"
        autoComplete="off"
        {...text(
          'phone',
          "Optional. International format, e.g. +254712000140. It can't be viewed after the invitation is sent.",
        )}
      />
      <InviteChoiceField
        control={control}
        trigger={trigger}
        name="membershipType"
        label={IDENTITY_LABELS.membershipType}
        options={MEMBERSHIP_TYPE_OPTIONS}
        required
        hint="Staff and admin members need a branch; auditors and system members don't."
      />
    </Box>
  );
}
```

`invite-invitation-fields.tsx`:

```tsx
'use client';

import { useId } from 'react';
import { Controller, type Control } from 'react-hook-form';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import { INVITATION_NOTE } from '../invite-rules';
import type { InviteValues } from '../invite-schema';

/** Field groups stay a readable width on a wide screen, as 16's wizard does. */
const FIELD_GROUP = { maxWidth: 640, display: 'grid', gap: 4.5 } as const;

interface FlagProps {
  control: Control<InviteValues>;
  name: 'sendIdentityInvite' | 'sendApplicationInvite';
  label: string;
  description: string;
}

/** A flag the form keeps as `'true'`/`'false'` (FormData), described by its own line. */
function Flag({ control, name, label, description }: FlagProps) {
  const descriptionId = useId();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Box>
          <FormControlLabel
            label={label}
            control={
              <Checkbox
                checked={field.value === 'true'}
                onChange={(_event, checked) => {
                  field.onChange(checked ? 'true' : 'false');
                }}
                onBlur={field.onBlur}
                slotProps={{ input: { 'aria-describedby': descriptionId } }}
              />
            }
          />
          <FormHelperText id={descriptionId} sx={{ mt: 0 }}>
            {description}
          </FormHelperText>
        </Box>
      )}
    />
  );
}

/** The Invitation step (spec §10.5; Ruling 5): the two contract flags (contract §D), hedged. */
export function InviteInvitationFields({ control }: { control: Control<InviteValues> }) {
  return (
    <Box sx={FIELD_GROUP}>
      <Flag
        control={control}
        name="sendIdentityInvite"
        label="Send the identity-provider invitation"
        description="After approval, once their sign-in identity is created, the identity provider emails them to verify their address."
      />
      <Flag
        control={control}
        name="sendApplicationInvite"
        label="Send the application invitation"
        description="Also sends them the application's own invitation email."
      />
      <Alert severity="info" role="note">
        {INVITATION_NOTE}
      </Alert>
    </Box>
  );
}
```

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs (each must fail the named test; revert after
      each): add `onBlur: () => void trigger(name),` to the `register(name, { … })` options in
      `text()` ("adds no error line on a blur, so a click on Continue never lands on a moved
      page"); delete the `onChange` re-trigger in `text()` ("clears a refused field’s error as soon
      as it is fixed"); drop `slotProps={{ input: { 'aria-describedby': descriptionId } }}` from
      `Flag` ("starts with the identity-provider invitation on and the application invitation
      off").

- [ ] **Step 5: Commit** (form C):

```
feat(users): add the invite wizard's Identity and Invitation steps

Identity asks for the full name, email, username, an optional phone (which can't be viewed later,
BG-17) and the membership type; nothing validates on blur, and an error clears as soon as its field
is fixed. Invitation offers the two contract flags with their defaults (identity provider on,
application off), each described, and says delivery depends on the platform (BG-25, Ruling 5).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

#### Task 4c: The Review step

**Files:**

- Create: `modules/administration/users/components/invite-review.tsx`
- Create: `modules/administration/users/components/invite-review.test.tsx`

**Interfaces:**

- Consumes: `DescriptionList`, `SectionCard`, `humanizeEnum` (kit); 1a's `REVIEW_NOTE`,
  `SCOPE_OPTIONS`; 1b's `InviteValues`; 10's `SelectOption`.
- Produces: `InviteReview` (props `values`, `roles`, `branches`, `pending`, `onEdit(step)`): one
  card per step (Identity, Access, Invitation) with "Edit identity" / "Edit access" / "Edit
  invitation", then the note.

- [ ] **Step 1: Write the failing test** — `invite-review.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { ownStyle } from '@/test/own-style';
import { renderWithProviders } from '@/test/test-utils';
import { REVIEW_NOTE } from '../invite-rules';
import type { InviteValues } from '../invite-schema';
import { InviteReview } from './invite-review';

const WESTLANDS = 'a4000000-0000-4000-8000-0000000000aa';
const HEAD_OFFICE = 'b2000000-0000-4000-8000-0000000000bb';
const TELLER = 'c1000000-0000-4000-8000-0000000000cc';
const SUPERVISOR = 'd1000000-0000-4000-8000-0000000000dd';
const ROLES = [
  { id: TELLER, label: 'Teller (TELLER)' },
  { id: SUPERVISOR, label: 'Branch supervisor (SUPERVISOR)' },
];
const BRANCHES = [
  { id: HEAD_OFFICE, label: 'Head Office (HEAD_OFFICE)' },
  { id: WESTLANDS, label: 'Westlands Branch (WESTLANDS)' },
];

const VALUES: InviteValues = {
  displayName: 'Neema Wanjiku',
  email: 'neema.wanjiku@greenfield.example',
  username: 'neema.wanjiku',
  phone: '',
  membershipType: 'STAFF',
  primaryBranchId: WESTLANDS,
  branchAssignments: [
    { branchId: WESTLANDS, assignmentType: 'HOME' },
    { branchId: HEAD_OFFICE, assignmentType: 'VIEW' },
  ],
  roleAssignments: [
    { roleId: TELLER, scopeType: 'TENANT', branchId: '' },
    { roleId: SUPERVISOR, scopeType: 'BRANCH', branchId: WESTLANDS },
  ],
  sendIdentityInvite: 'true',
  sendApplicationInvite: 'false',
};

const fact = (region: HTMLElement, label: string) =>
  within(region).getByText(label, { selector: 'dt' }).nextElementSibling;

describe('InviteReview', () => {
  it('lists every answer by step, in words', () => {
    renderWithProviders(
      <InviteReview
        values={VALUES}
        roles={ROLES}
        branches={BRANCHES}
        pending={false}
        onEdit={vi.fn()}
      />,
    );

    const identity = screen.getByRole('region', { name: 'Identity' });
    expect(fact(identity, 'Membership type')).toHaveTextContent('Staff');
    const access = screen.getByRole('region', { name: 'Access' });
    expect(
      within(fact(access, 'Branch assignments') as HTMLElement)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Westlands Branch (WESTLANDS) · Home', 'Head Office (HEAD_OFFICE) · View']);
    expect(
      within(fact(access, 'Roles') as HTMLElement)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Teller (TELLER) · Institution (all branches)',
      'Branch supervisor (SUPERVISOR) · Westlands Branch (WESTLANDS)',
    ]);
    expect(fact(access, 'Primary branch')).toHaveTextContent('Westlands Branch (WESTLANDS)');
    const invitation = screen.getByRole('region', { name: 'Invitation' });
    expect(fact(invitation, 'Identity-provider invitation')).toHaveTextContent('Yes');
    expect(fact(invitation, 'Application invitation')).toHaveTextContent('No');
    expect(screen.getByRole('note')).toHaveTextContent(REVIEW_NOTE);
  });

  it('shows an unset answer muted and in regular weight, apart from real values', () => {
    renderWithProviders(
      <InviteReview
        values={{
          ...VALUES,
          primaryBranchId: '',
          branchAssignments: [],
          membershipType: 'AUDITOR',
        }}
        roles={ROLES}
        branches={BRANCHES}
        pending={false}
        onEdit={vi.fn()}
      />,
    );

    // The phone and the primary branch; no branch reads None.
    const unset = [...screen.getAllByText('Not set'), screen.getByText('None')];
    expect(unset).toHaveLength(3);
    for (const element of unset) {
      expect(ownStyle(element, 'color')).toContain('--finaxis-palette-text-secondary');
      expect(ownStyle(element, 'font-weight')).toBe('400');
    }
  });

  it('returns to each step from its Edit button, and disables them while sending', async () => {
    const user = userEvent.setup({ delay: null });
    const onEdit = vi.fn();
    const { rerender } = renderWithProviders(
      <InviteReview
        values={VALUES}
        roles={ROLES}
        branches={BRANCHES}
        pending={false}
        onEdit={onEdit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit identity' }));
    await user.click(screen.getByRole('button', { name: 'Edit access' }));
    await user.click(screen.getByRole('button', { name: 'Edit invitation' }));
    expect(onEdit.mock.calls).toEqual([[0], [1], [2]]);

    rerender(
      <InviteReview values={VALUES} roles={ROLES} branches={BRANCHES} pending onEdit={onEdit} />,
    );
    for (const name of ['Edit identity', 'Edit access', 'Edit invitation']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });
});
```

- [ ] **Step 2: Run** — form U on the test file: FAIL (`./invite-review` doesn't resolve).

- [ ] **Step 3: Implement** — `invite-review.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { DescriptionList, type DescriptionItem } from '@/components/data-display/description-list';
import { SectionCard } from '@/components/data-display/section-card';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { REVIEW_NOTE, SCOPE_OPTIONS } from '../invite-rules';
import type { InviteValues } from '../invite-schema';
import type { SelectOption } from '../user-rules';

/** An optional answer left empty: muted and regular weight, so a gap doesn't read as a value
 * (16's review). */
const NOT_SET = (
  <Typography component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
    Not set
  </Typography>
);

const NONE = (
  <Typography component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
    None
  </Typography>
);

function lines(values: readonly string[]): ReactNode {
  if (values.length === 0) return NONE;
  return (
    <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1 }}>
      {values.map((value, index) => (
        // A row can repeat only until Continue refuses it; the index keeps the keys unique.
        <li key={`${String(index)} ${value}`}>{value}</li>
      ))}
    </Box>
  );
}

const yesNo = (value: string) => (value === 'true' ? 'Yes' : 'No');

interface ReviewSection {
  /** The step's label, as the Stepper shows it. */
  title: string;
  /** The step's index, for its Edit button. */
  step: number;
  items: DescriptionItem[];
}

interface InviteReviewProps {
  values: InviteValues;
  roles: readonly SelectOption[];
  branches: readonly SelectOption[];
  /** A send in flight: Edit would move the wizard under it. */
  pending: boolean;
  onEdit: (step: number) => void;
}

/** The Review step: every answer by step, each with a way back to it (spec §10.5). */
export function InviteReview({ values, roles, branches, pending, onEdit }: InviteReviewProps) {
  const label = (options: readonly SelectOption[], id: string) =>
    options.find((option) => option.id === id)?.label ?? id;
  const scope = (scopeType: string) =>
    SCOPE_OPTIONS.find((option) => option.value === scopeType)?.label ?? scopeType;
  const sections: ReviewSection[] = [
    {
      title: 'Identity',
      step: 0,
      items: [
        { label: 'Full name', value: values.displayName },
        { label: 'Email', value: values.email },
        { label: 'Username', value: values.username },
        { label: 'Phone', value: values.phone || NOT_SET },
        { label: 'Membership type', value: humanizeEnum(values.membershipType) },
      ],
    },
    {
      title: 'Access',
      step: 1,
      items: [
        {
          label: 'Branch assignments',
          value: lines(
            values.branchAssignments.map(
              (row) => `${label(branches, row.branchId)} · ${humanizeEnum(row.assignmentType)}`,
            ),
          ),
        },
        {
          label: 'Roles',
          value: lines(
            values.roleAssignments.map((row) =>
              row.scopeType === 'BRANCH'
                ? `${label(roles, row.roleId)} · ${label(branches, row.branchId)}`
                : `${label(roles, row.roleId)} · ${scope(row.scopeType)}`,
            ),
          ),
        },
        {
          label: 'Primary branch',
          value: values.primaryBranchId ? label(branches, values.primaryBranchId) : NOT_SET,
        },
      ],
    },
    {
      title: 'Invitation',
      step: 2,
      items: [
        { label: 'Identity-provider invitation', value: yesNo(values.sendIdentityInvite) },
        { label: 'Application invitation', value: yesNo(values.sendApplicationInvite) },
      ],
    },
  ];

  return (
    <>
      {sections.map((section) => (
        <SectionCard
          key={section.title}
          title={section.title}
          headingLevel="h3"
          actions={
            <Button
              size="small"
              aria-label={`Edit ${section.title.toLowerCase()}`}
              disabled={pending}
              onClick={() => {
                onEdit(section.step);
              }}
            >
              Edit
            </Button>
          }
        >
          <DescriptionList columns={1} items={section.items} />
        </SectionCard>
      ))}
      <Alert severity="info" role="note">
        {REVIEW_NOTE}
      </Alert>
    </>
  );
}
```

**Erratum (9ffbaf8, `fix(users): show a blank phone as not set and share the Review labels`):** the
Review step takes its five Identity labels from `IDENTITY_LABELS`, shows a phone of spaces as Not
set (`values.phone.trim() || NOT_SET`, matching the body's trimmed phone), and gives both lists an
explicit `role="list"` (`listStyle: 'none'` drops list semantics in WebKit). Its tests also pin Full
name, Email and Username, a set phone (not muted) and the list role; the "unset" test's phone is
`'   '`.

**Erratum (737e1a5, `test(users): match the Review's Username exactly`):** the Review test's Username
assertion is exact (`/^neema\.wanjiku$/`), not a substring match, so an email shown under Username
fails it.

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs (each must fail the named test; revert after
      each): show `values.phone` instead of `values.phone || NOT_SET` ("shows an unset answer muted
      and in regular weight, apart from real values"); drop `disabled={pending}` ("returns to each
      step from its Edit button, and disables them while sending").

- [ ] **Step 5: Commit** (form C):

```
feat(users): add the invite wizard's Review step

Every answer by step, in words (a branch-scoped role names its branch, an institution-wide one its
scope), each step with an Edit button that is disabled while the invitation is being sent; unset
answers read muted. The note says a different administrator must approve, and that an account the
email already has elsewhere is reused with its own name, username and phone (Ruling 3).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

#### Task 4d: The wizard

**Files:**

- Create: `modules/administration/users/components/invite-user-wizard.tsx`
- Create: `modules/administration/users/components/invite-user-wizard.test.tsx` (part 1)

**Interfaces:**

- Consumes: 16's `WizardForm`, `WizardStep`; `ActionResult`; `applyFieldErrors`; 1a's
  `IDENTITY_FIELDS`, `IDENTITY_LABELS`, `INVITATION_FIELDS`, `emailCheckSchema`,
  `memberEmailMessage`, `EMAIL_CHECK_FAILED`, `SESSION_EXPIRED`, `EMAIL_CHECK_REFUSED`,
  `USERS_HREF`; 1b's `inviteSchema`,
  `EMPTY_INVITE`, `InviteValues`; 3's `inviteUser`; 4a–4c's step components.
- Produces: `InviteUserWizard` (props `roles`, `branches`, `rolesCapped`, `branchesCapped`,
  `contextOrganisationId?`), labelled "Invite user", submit "Send invitation", Cancel to
  `/admin/users`.

- [ ] **Step 1: Write the failing test** — `invite-user-wizard.test.tsx` (the steps; Task 4e adds
      the sending tests):

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import {
  EMAIL_CHECK_FAILED,
  EMAIL_CHECK_REFUSED,
  memberEmailMessage,
  ROLE_BRANCH_UNASSIGNED,
  SESSION_EXPIRED,
} from '../invite-rules';
import { InviteUserWizard } from './invite-user-wizard';

const { inviteUser } = vi.hoisted(() => ({ inviteUser: vi.fn() }));
vi.mock('../invite-actions', () => ({
  inviteUser: (...args: unknown[]) => inviteUser(...args) as unknown,
}));

type User = ReturnType<typeof userEvent.setup>;

const ORG = '11111111-1111-4111-8111-111111111111';
const WESTLANDS = 'a4000000-0000-4000-8000-0000000000aa';
const HEAD_OFFICE = 'b2000000-0000-4000-8000-0000000000bb';
const TELLER = 'c1000000-0000-4000-8000-0000000000cc';
const ROLES = [{ id: TELLER, label: 'Teller (TELLER)' }];
const BRANCHES = [
  { id: HEAD_OFFICE, label: 'Head Office (HEAD_OFFICE)' },
  { id: WESTLANDS, label: 'Westlands Branch (WESTLANDS)' },
];
const EMAIL = 'neema.wanjiku@greenfield.example';

const fetchMock = vi.fn<(input: string) => Promise<Response>>();
const answer = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function renderWizard() {
  renderWithProviders(
    <InviteUserWizard
      roles={ROLES}
      branches={BRANCHES}
      rolesCapped={false}
      branchesCapped={false}
      contextOrganisationId={ORG}
    />,
  );
}

async function choose(user: User, label: string, option: string, scope?: HTMLElement) {
  await user.click(within(scope ?? document.body).getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
}

async function next(user: User, step: string) {
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('heading', { level: 2, name: step });
}

async function fillIdentity(user: User) {
  await user.type(screen.getByRole('textbox', { name: 'Full name' }), 'Neema Wanjiku');
  await user.type(screen.getByRole('textbox', { name: 'Email' }), EMAIL);
  await user.type(screen.getByRole('textbox', { name: 'Username' }), 'neema.wanjiku');
  await choose(user, 'Membership type', 'Staff');
}

async function fillAccess(user: User) {
  await choose(
    user,
    'Branch',
    'Westlands Branch (WESTLANDS)',
    screen.getByRole('group', {
      name: 'Branch assignment 1',
    }),
  );
  await choose(user, 'Role', 'Teller (TELLER)', screen.getByRole('group', { name: 'Role 1' }));
}

beforeEach(() => {
  // Reset, not clear: a failed test's unused queued answers must not leak into the next one.
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(() => answer(200, { membershipStatus: null }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InviteUserWizard: the steps', () => {
  it('summarises the identity’s invalid fields and focuses the first, without checking the email', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText('Check these fields: Full name, Email, Username, Membership type.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Full name' })).toHaveFocus();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks the email on Continue, then moves to Access with its heading focused', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();
    await fillIdentity(user);

    await next(user, 'Access');

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/tenant/users/invite-check?email=${encodeURIComponent(EMAIL)}`,
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Access' })).toHaveFocus();
    });
  });

  it('keeps an email already in use on Identity, says why, and clears it once changed', async () => {
    const user = userEvent.setup({ delay: null });
    fetchMock.mockImplementationOnce(() => answer(200, { membershipStatus: 'REVOKED' }));
    renderWizard();
    await fillIdentity(user);

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const email = screen.getByRole('textbox', { name: 'Email' });
    await waitFor(() => {
      expect(email).toHaveAccessibleDescription(memberEmailMessage('REVOKED'));
    });
    await waitFor(() => {
      expect(email).toHaveFocus();
    });
    expect(screen.getByText('Check these fields: Email.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Identity' })).toBeInTheDocument();

    await user.type(email, 'x');
    await waitFor(() => {
      expect(email).not.toHaveAccessibleDescription(memberEmailMessage('REVOKED'));
    });
  });

  it.each([
    [502, EMAIL_CHECK_FAILED],
    [401, SESSION_EXPIRED],
    [403, EMAIL_CHECK_REFUSED],
  ])(
    'says a failed check (%i) failed, never reading it as a free email (L1)',
    async (status, message) => {
      const user = userEvent.setup({ delay: null });
      fetchMock.mockImplementationOnce(() => answer(status, { message: 'upstream detail' }));
      renderWizard();
      await fillIdentity(user);

      await user.click(screen.getByRole('button', { name: 'Continue' }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.queryByText('upstream detail')).toBeNull();
      expect(screen.getByRole('heading', { level: 2, name: 'Identity' })).toBeInTheDocument();
    },
  );

  it.each([
    ['an unreadable answer', () => answer(200, { membershipStatus: 'GONE' })],
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])(
    'says the check failed after %s, never reading it as a free email (L1)',
    async (_case, reply) => {
      const user = userEvent.setup({ delay: null });
      fetchMock.mockImplementationOnce(reply);
      renderWizard();
      await fillIdentity(user);

      await user.click(screen.getByRole('button', { name: 'Continue' }));

      expect(await screen.findByText(EMAIL_CHECK_FAILED)).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Identity' })).toBeInTheDocument();
    },
  );

  it('checks an email edited during its check again, never continuing with it unchecked', async () => {
    const user = userEvent.setup({ delay: null });
    let reply: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          reply = resolve;
        }),
    );
    renderWizard();
    await fillIdentity(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'x');

    reply(new Response(JSON.stringify({ membershipStatus: null }), { status: 200 }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });
    expect(screen.getByRole('heading', { level: 2, name: 'Identity' })).toBeInTheDocument();
    await next(user, 'Access');
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/tenant/users/invite-check?email=${encodeURIComponent(`${EMAIL}x`)}`,
    );
  });

  it('refuses a branch-scoped role at a branch they aren’t assigned to before Review', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();
    await fillIdentity(user);
    await next(user, 'Access');
    const branchRow = screen.getByRole('group', { name: 'Branch assignment 1' });
    await choose(user, 'Branch', 'Westlands Branch (WESTLANDS)', branchRow);
    const roleRow = screen.getByRole('group', { name: 'Role 1' });
    await choose(user, 'Role', 'Teller (TELLER)', roleRow);
    await choose(user, 'Scope', 'One branch', roleRow);
    await choose(user, 'Branch', 'Westlands Branch (WESTLANDS)', roleRow);
    // Their only branch changes after the role named it.
    await choose(user, 'Branch', 'Head Office (HEAD_OFFICE)', branchRow);

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Check these fields: Roles.')).toBeInTheDocument();
    expect(within(roleRow).getByRole('combobox', { name: 'Branch' })).toHaveAccessibleDescription(
      ROLE_BRANCH_UNASSIGNED,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Access' })).toBeInTheDocument();
  });

  it('returns to a step from the review with its answers kept, and links Cancel to the directory', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/admin/users');
    await fillIdentity(user);
    await next(user, 'Access');
    await fillAccess(user);
    await next(user, 'Invitation');
    await next(user, 'Review');

    await user.click(screen.getByRole('button', { name: 'Edit identity' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Identity' })).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue(EMAIL);
    expect(screen.getByRole('combobox', { name: 'Membership type' })).toHaveTextContent('Staff');
  });
});
```

**Erratum (6096b73, `fix(users): keep the Identity step whole while its email is checked`), tests:**
the "returns to a step from the review with its answers kept" test waits for the Identity heading's
focus in its own `waitFor`, and three tests join "the steps": a stale check failure clears once Continue refuses an
emptied email; an answer changed during the check keeps the wizard on Identity; and a whole-list
refusal focuses the failure Alert.

**Erratum (d6f3594, `test(users): close the wizard's remaining test gaps`), tests:** two more of
"the steps": a retried email check that fails again focuses its Alert again, and an in-use answer
about an email edited during its check is dropped (no "Check these fields: Email.").

- [ ] **Step 2: Run** — form U on the test file: FAIL (`./invite-user-wizard` doesn't resolve).

- [ ] **Step 3: Implement** — `invite-user-wizard.tsx`:

```tsx
'use client';

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';
import { unstable_rethrow } from 'next/navigation';
import { useForm, type FieldErrors, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import { WizardForm, type WizardStep } from '@/components/data-display/wizard-form';
import type { ActionResult } from '@/lib/api/action-result';
import { applyFieldErrors } from '@/lib/apply-field-errors';
import { inviteUser } from '../invite-actions';
import {
  EMAIL_CHECK_FAILED,
  EMAIL_CHECK_REFUSED,
  emailCheckSchema,
  IDENTITY_FIELDS,
  IDENTITY_LABELS,
  INVITATION_FIELDS,
  memberEmailMessage,
  SESSION_EXPIRED,
  USERS_HREF,
} from '../invite-rules';
import { EMPTY_INVITE, inviteSchema, type InviteValues } from '../invite-schema';
import type { MembershipStatus } from '../user-contract';
import type { SelectOption } from '../user-rules';
import { InviteAccessFields } from './invite-access-fields';
import { InviteIdentityFields } from './invite-identity-fields';
import { InviteInvitationFields } from './invite-invitation-fields';
import { InviteReview } from './invite-review';

type FieldName = Path<InviteValues>;

const STEPS: readonly WizardStep[] = [
  { label: 'Identity', helper: 'Who you are inviting' },
  { label: 'Access', helper: 'Their branches and roles' },
  { label: 'Invitation', helper: 'How they are invited' },
  { label: 'Review', helper: 'Check everything before you send it' },
];
const IDENTITY = 0;
const ACCESS = 1;
const INVITATION = 2;
const REVIEW = 3;

/** Every field the Access step renders, rows included, in the order they appear. */
function accessFields(values: InviteValues): FieldName[] {
  return [
    'branchAssignments',
    ...values.branchAssignments.flatMap((_row, index) => [
      `branchAssignments.${index}.branchId` as const,
      `branchAssignments.${index}.assignmentType` as const,
    ]),
    'roleAssignments',
    ...values.roleAssignments.flatMap((_row, index) => [
      `roleAssignments.${index}.roleId` as const,
      `roleAssignments.${index}.scopeType` as const,
      `roleAssignments.${index}.branchId` as const,
    ]),
    'primaryBranchId',
  ];
}

/** The step that renders a field: a server field error returns there. */
function stepOf(name: string): number {
  if ((IDENTITY_FIELDS as readonly string[]).includes(name)) return IDENTITY;
  if ((INVITATION_FIELDS as readonly string[]).includes(name)) return INVITATION;
  if (
    name === 'primaryBranchId' ||
    name.startsWith('branchAssignments') ||
    name.startsWith('roleAssignments')
  ) {
    return ACCESS;
  }
  return -1;
}

const firstStepWith = (names: readonly string[]) => {
  const steps = names.map(stepOf).filter((step) => step !== -1);
  return steps.length === 0 ? -1 : Math.min(...steps);
};

/** A step's error summary: the Identity fields by label, the Access step by section. */
function stepSummary(step: number, errors: FieldErrors<InviteValues>): string[] {
  if (step === IDENTITY) {
    return IDENTITY_FIELDS.filter((name) => errors[name] !== undefined).map(
      (name) => IDENTITY_LABELS[name],
    );
  }
  if (step !== ACCESS) return [];
  const names: string[] = [];
  if (errors.branchAssignments) names.push('Branch assignments');
  if (errors.roleAssignments) names.push('Roles');
  if (errors.primaryBranchId) names.push('Primary branch');
  return names;
}

// Mirrors ReasonDialog's and 16's wizard: never `caught.message`.
const SUBMIT_FAILED =
  "We couldn't confirm this change. Try again; it's safe to retry. If it keeps failing, reload the page.";

type EmailCheckOutcome =
  | { kind: 'free' }
  | { kind: 'member'; status: MembershipStatus }
  | { kind: 'failed'; message: string };

/** The Identity step's email check (Ruling 1), through the same-origin route handler. A failed
 * check is said, never read as "free" (Ruling 12, L1); a refused one (403) asks for a reload, since
 * a retry can't pass it. */
async function checkEmail(email: string): Promise<EmailCheckOutcome> {
  try {
    const response = await fetch(
      `/api/tenant/users/invite-check?${new URLSearchParams({ email }).toString()}`,
    );
    if (!response.ok) {
      return {
        kind: 'failed',
        message:
          response.status === 401
            ? SESSION_EXPIRED
            : response.status === 403
              ? EMAIL_CHECK_REFUSED
              : EMAIL_CHECK_FAILED,
      };
    }
    const check = emailCheckSchema.safeParse(await response.json());
    if (!check.success) return { kind: 'failed', message: EMAIL_CHECK_FAILED };
    const status = check.data.membershipStatus;
    return status === null ? { kind: 'free' } : { kind: 'member', status };
  } catch {
    return { kind: 'failed', message: EMAIL_CHECK_FAILED };
  }
}

interface InviteUserWizardProps {
  roles: readonly SelectOption[];
  branches: readonly SelectOption[];
  rolesCapped: boolean;
  branchesCapped: boolean;
  /** I2: the organisation the page rendered for, appended to the submit. */
  contextOrganisationId?: string;
}

/**
 * Invite user (spec §10.5): one React Hook Form across `WizardForm`'s four steps. Continue validates
 * the step's own fields (Identity also checks the email); Review submits everything with the key
 * minted on mount, so a retry after a failure replays (spec §6.4). A server field error returns to
 * its step. Nothing survives a reload (Ruling 9).
 */
export function InviteUserWizard({
  roles,
  branches,
  rolesCapped,
  branchesCapped,
  contextOrganisationId,
}: InviteUserWizardProps) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [active, setActive] = useState(IDENTITY);
  // After a refused Continue: the step's error summary.
  const [attempted, setAttempted] = useState(false);
  // A failure's Alert stays until the user moves to another step.
  const [failureShown, setFailureShown] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkFailure, setCheckFailure] = useState<string | null>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const {
    control,
    register,
    handleSubmit,
    trigger,
    getValues,
    setError,
    formState: { errors },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: EMPTY_INVITE,
  });
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      try {
        return await inviteUser(previous, formData);
      } catch (caught) {
        // Success is the action's redirect(), which must keep propagating (07's I1).
        unstable_rethrow(caught);
        return {
          ok: false,
          formError: SUBMIT_FAILED,
          fieldErrors: {},
          code: 'network_error',
          requestId: null,
        };
      }
    },
    null,
  );
  const failure = state && !state.ok ? state : null;

  // React's "previous value" pattern (as 16's wizard): a new failure moves the wizard to the first
  // step holding one of its field errors in the same render, never from an effect.
  const [seenFailure, setSeenFailure] = useState(failure);
  if (failure !== seenFailure) {
    setSeenFailure(failure);
    if (failure) {
      const target = firstStepWith(Object.keys(failure.fieldErrors));
      if (target !== -1) setActive(target);
      setAttempted(false);
      setFailureShown(true);
    }
  }

  // From an effect, as in 16's wizard: RHF's setError commits outside the action's transition.
  // With no field to take focus, the Alert does, so the failure isn't lost.
  useEffect(() => {
    if (!failure) return;
    const fields: FieldName[] = [
      ...IDENTITY_FIELDS,
      ...accessFields(getValues()),
      ...INVITATION_FIELDS,
    ];
    applyFieldErrors(setError, failure.fieldErrors, fields);
    if (!fields.some((name) => failure.fieldErrors[name] !== undefined)) {
      failureRef.current?.focus();
    }
  }, [failure, setError, getValues]);

  const goTo = (step: number) => {
    setActive(step);
    setAttempted(false);
    setFailureShown(false);
    setCheckFailure(null);
  };

  const onValid = (values: InviteValues) => {
    const formData = new FormData();
    formData.set('idempotencyKey', idempotencyKey);
    for (const name of [...IDENTITY_FIELDS, ...INVITATION_FIELDS]) formData.set(name, values[name]);
    formData.set('primaryBranchId', values.primaryBranchId);
    formData.set('branchAssignments', JSON.stringify(values.branchAssignments));
    formData.set('roleAssignments', JSON.stringify(values.roleAssignments));
    if (contextOrganisationId) formData.set('contextOrganisationId', contextOrganisationId);
    startTransition(() => {
      formAction(formData);
    });
  };

  // Defensive: Continue validated every step, so this only catches a value changed since.
  const onInvalid = (invalid: FieldErrors<InviteValues>) => {
    const target = firstStepWith(Object.keys(invalid));
    goTo(target === -1 ? IDENTITY : target);
    setAttempted(true);
  };

  const continueFromIdentity = async () => {
    if (!(await trigger([...IDENTITY_FIELDS], { shouldFocus: true }))) {
      setAttempted(true);
      return;
    }
    setChecking(true);
    setCheckFailure(null);
    const email = getValues('email');
    const outcome = await checkEmail(email);
    setChecking(false);
    // The answer is about the email that was sent: one edited meanwhile waits for its own Continue,
    // never continuing unchecked.
    if (getValues('email') !== email) return;
    if (outcome.kind === 'failed') {
      setCheckFailure(outcome.message);
      return;
    }
    if (outcome.kind === 'member') {
      const message = memberEmailMessage(outcome.status);
      setError('email', { type: 'taken', message }, { shouldFocus: true });
      setAttempted(true);
      return;
    }
    goTo(ACCESS);
  };

  const onSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    if (active === REVIEW) {
      void handleSubmit(onValid, onInvalid)(event);
      return;
    }
    event.preventDefault();
    if (active === IDENTITY) {
      void continueFromIdentity();
      return;
    }
    const fields = active === ACCESS ? accessFields(getValues()) : [...INVITATION_FIELDS];
    void trigger(fields, { shouldFocus: true }).then((valid) => {
      if (valid) goTo(active + 1);
      else setAttempted(true);
    });
  };

  const stepErrors = attempted ? stepSummary(active, errors) : [];
  const visibleFailure = failureShown && !pending ? failure : null;
  const values = active === REVIEW ? getValues() : null;

  return (
    <WizardForm
      label="Invite user"
      steps={STEPS}
      active={active}
      onSubmit={onSubmit}
      onBack={() => {
        goTo(active - 1);
      }}
      cancelHref={USERS_HREF}
      submitLabel="Send invitation"
      pending={pending || checking}
      alerts={
        visibleFailure || checkFailure || stepErrors.length > 0 ? (
          <>
            {visibleFailure && (
              <Alert ref={failureRef} tabIndex={-1} severity="error">
                {visibleFailure.formError}
                {visibleFailure.requestId && ` Reference: ${visibleFailure.requestId}`}
              </Alert>
            )}
            {checkFailure && <Alert severity="error">{checkFailure}</Alert>}
            {stepErrors.length > 0 && (
              <Alert severity="error">{`Check these fields: ${stepErrors.join(', ')}.`}</Alert>
            )}
          </>
        ) : undefined
      }
    >
      {active === IDENTITY && (
        <InviteIdentityFields
          control={control}
          register={register}
          trigger={trigger}
          errors={errors}
        />
      )}
      {active === ACCESS && (
        <InviteAccessFields
          control={control}
          trigger={trigger}
          roles={roles}
          branches={branches}
          rolesCapped={rolesCapped}
          branchesCapped={branchesCapped}
          branchListError={errors.branchAssignments}
          roleListError={errors.roleAssignments}
        />
      )}
      {active === INVITATION && <InviteInvitationFields control={control} />}
      {values && (
        <InviteReview
          values={values}
          roles={roles}
          branches={branches}
          pending={pending}
          onEdit={goTo}
        />
      )}
    </WizardForm>
  );
}
```

**Erratum (6096b73, `fix(users): keep the Identity step whole while its email is checked`):** the
Identity step is snapshotted around the check. `continueFromIdentity` clears `checkFailure` first
and returns when any Identity answer changed (`JSON.stringify(getValues([...IDENTITY_FIELDS]))`),
so the `getValues('email') !== email` guard that the mutation proof below names is now that
comparison. A failed check's Alert takes focus (`checkRef`), and the failure effect sets the list
roots last (`LIST_ROOTS`).

**Erratum (1cd62b7, `feat(users): add the Invite user wizard`, the planned 4d commit as made):** the
wizard differs from the block above in two places. `useForm` also destructures `getFieldState`, and
`continueFromIdentity` calls `if (getFieldState('branchAssignments').error) void trigger('branchAssignments');`
before `goTo(ACCESS)`, so a membership type change that has made a branch refusal moot clears it before
Access shows it again (rule 8). The test file imports `NEEDS_A_BRANCH` and adds one test, "clears a
branch refusal that a membership change has made moot, before Access shows it again": Access's branch
row is removed and Continue refuses it; Back, a change of membership type to Auditor, and Continue shows
Access with no refusal. The rest of both files matches the blocks above.

- [ ] **Step 4: Run** — form U: PASS. Mutation proofs (each must fail the named test; revert after
      each): replace the email check in `continueFromIdentity` with `goTo(ACCESS)` straight after
      the `trigger` ("keeps an email already in use on Identity, says why, and clears it once
      changed"); treat `outcome.kind === 'failed'` as free (`goTo(ACCESS)`) ("says a failed check
      (502) failed, never reading it as a free email (L1)"); map a 403 to `EMAIL_CHECK_FAILED`
      ("says a failed check (403) failed…"); answer `{ kind: 'free' }` for an unreadable body
      (`if (!check.success)`) ("says the check failed after an unreadable answer, never reading it
      as a free email (L1)"); answer `{ kind: 'free' }` from the `catch` ("says the check failed
      after a network failure…"); delete the `if (getValues('email') !== email) return;` guard
      ("checks an email edited during its check again, never continuing with it unchecked"); call
      `checkEmail` before the `trigger` ("summarises the identity’s invalid fields and focuses the
      first, without checking the email").

- [ ] **Step 5: Commit** (form C):

```
feat(users): add the Invite user wizard

One React Hook Form across WizardForm's four steps (spec §10.5): Continue validates the step's own
fields, and on Identity then checks the email through the route handler, staying there with the
email's status when it is in use, saying so when the check fails, asking for a reload when it is
refused, and checking an email edited meanwhile again (Rulings 1, 12). Review sends
every answer with the key minted on mount and the cross-tab guard; a server field error returns to
its step, and a failure with no field focuses its alert. Nothing survives a reload (Ruling 9).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** `stepOf` maps a server field error's path to its
step; a list's root error has no field to focus, so the Alert takes focus then (16's rule).

#### Task 4e: The wizard's sending tests

**Files:**

- Modify: `modules/administration/users/components/invite-user-wizard.test.tsx` (one import, one
  appended `describe`)

**Interfaces:**

- Consumes: 4d; `UUID_PATTERN` (`lib/api/wire.ts`).
- Produces: nothing new (tests only).

- [ ] **Step 1: Write the tests** — in `invite-user-wizard.test.tsx`, add this line immediately
      after the line `import { renderWithProviders } from '@/test/test-utils';`:

```tsx
import { UUID_PATTERN } from '@/lib/api/wire';
```

Then append this block at the end of the file, after a blank line:

```tsx
describe('InviteUserWizard: sending', () => {
  it('sends every answer once, returns to a server field error’s step, and retries with the same key', async () => {
    const user = userEvent.setup({ delay: null });
    inviteUser
      .mockResolvedValueOnce({
        ok: false,
        formError: 'Check the highlighted fields and try again.',
        fieldErrors: { 'roleAssignments.0.scopeType': 'Choose a scope.' },
        code: 'validation_failed',
        requestId: null,
      })
      .mockResolvedValueOnce({
        ok: false,
        formError: "The platform didn't respond as expected. Try again in a moment.",
        fieldErrors: {},
        code: null,
        requestId: 'req-5',
      });
    renderWizard();
    await fillIdentity(user);
    await next(user, 'Access');
    await fillAccess(user);
    await next(user, 'Invitation');
    await next(user, 'Review');
    expect(screen.getByRole('region', { name: 'Access' })).toHaveTextContent(
      'Westlands Branch (WESTLANDS) · Home',
    );
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    // The refused row's field, back on its step.
    expect(await screen.findByRole('heading', { level: 2, name: 'Access' })).toBeInTheDocument();
    const scope = within(screen.getByRole('group', { name: 'Role 1' })).getByRole('combobox', {
      name: 'Scope',
    });
    await waitFor(() => {
      expect(scope).toHaveAccessibleDescription('Choose a scope.');
    });
    expect(Object.fromEntries(inviteUser.mock.calls[0]?.[1] as FormData)).toEqual({
      idempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown,
      contextOrganisationId: ORG,
      displayName: 'Neema Wanjiku',
      email: EMAIL,
      username: 'neema.wanjiku',
      phone: '',
      membershipType: 'STAFF',
      primaryBranchId: '',
      branchAssignments: JSON.stringify([{ branchId: WESTLANDS, assignmentType: 'HOME' }]),
      roleAssignments: JSON.stringify([{ roleId: TELLER, scopeType: 'TENANT', branchId: '' }]),
      sendIdentityInvite: 'true',
      sendApplicationInvite: 'false',
    });

    await next(user, 'Invitation');
    await next(user, 'Review');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    // Nothing to return to: the failure's Alert takes focus, with its reference.
    const failed = (await screen.findByText(/Reference: req-5/)).closest('[role="alert"]');
    await waitFor(() => {
      expect(failed).toHaveFocus();
    });
    const [first, second] = inviteUser.mock.calls.map((call) => call[1] as FormData);
    // One key per wizard: the retry replays safely (spec §6.4).
    expect(second?.get('idempotencyKey')).toBe(first?.get('idempotencyKey'));
  });

  it('shows a safe message, never the error text, when the action itself rejects', async () => {
    const user = userEvent.setup({ delay: null });
    inviteUser.mockRejectedValueOnce(new Error('socket hang up'));
    renderWizard();
    await fillIdentity(user);
    await next(user, 'Access');
    await fillAccess(user);
    await next(user, 'Invitation');
    await next(user, 'Review');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    const alert = (await screen.findByText(/We couldn't confirm this change/)).closest(
      '[role="alert"]',
    );
    await waitFor(() => {
      expect(alert).toHaveFocus();
    });
    expect(screen.queryByText(/socket hang up/)).toBeNull();
  });
});
```

**Erratum (d6f3594, `test(users): close the wizard's remaining test gaps`):** the first test waits
for the refused row's Scope to take focus, then corrects that row (One branch, Westlands) before the
retry; its key pin is `getAll('idempotencyKey')` equal to the first key, plus the corrected
`roleAssignments`. The rejection test first holds a resend in flight: Send and the Edit buttons are
disabled, the stale Alert is hidden, and the second rejection focuses a new Alert.

- [ ] **Step 2: Run** — form U: PASS (Task 4d's code already sends; these tests pin it). Mutation
      proofs (each must fail the named test; revert after each): mint the key per submit
      (`formData.set('idempotencyKey', crypto.randomUUID())` in `onValid`) ("sends every answer
      once, returns to a server field error’s step, and retries with the same key"); delete the
      `contextOrganisationId` line in `onValid` (same test); delete the line
      `if (target !== -1) setActive(target);` (same test); return `caught.message` as the form
      error in the action wrapper's `catch` ("shows a safe message, never the error text, when the
      action itself rejects"). With 4d's `vi.resetAllMocks()`, a mutant that stops the first of
      these tests early fails it alone: its unused queued answers don't leak into the next test
      (review M5).

- [ ] **Step 3: Commit** (form C):

```
test(users): pin the invite wizard's submit, server field errors and retry

The invite wizard sends one FormData with every answer, the lists as JSON, the minted key and the
cross-tab guard; a server field error on a role row returns to the Access step with the field
marked; a retry after a failure reuses the key; a rejected action shows safe words, focused.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

### Task 5: The pages

Two sub-tasks: **5a** (the wizard's page) and **5b** (the directory's entry button, with the
directory's first page test).

#### Task 5a: The Invite user page

**Files:**

- Create: `app/(authenticated)/admin/users/new/page.tsx`
- Create: `app/(authenticated)/admin/users/new/page.test.tsx`

**Interfaces:**

- Consumes: `getCurrentContextProfile`; `load`, `ProblemView`; `ErrorState`, `ForbiddenState`,
  `PageHeader`, `next-link`; 09's `listRoles`; 08's `listBranches`; 1a's `canInviteUsers`,
  `INVITE_FORBIDDEN`, `NO_ACTIVE_BRANCHES`, `OPTION_CEILING`; 10's `NO_ACTIVE_ROLES`; 4d's
  `InviteUserWizard`.
- Produces: the route `/admin/users/new` (h1 "Invite user"; metadata title "Invite user").

- [ ] **Step 1: Write the failing test** — `new/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { screen } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import type { InviteUserWizard } from '@/modules/administration/users/components/invite-user-wizard';
import { INVITE_CODES, INVITE_FORBIDDEN } from '@/modules/administration/users/invite-rules';
import { renderWithProviders } from '@/test/test-utils';

const { getCurrentContextProfile, listBranches, listRoles, redirect, wizards } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  listBranches: vi.fn(),
  listRoles: vi.fn(),
  redirect: vi.fn(),
  // The props the page handed the wizard, one entry per render.
  wizards: [] as ComponentProps<typeof InviteUserWizard>[],
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  // The real `unstable_rethrow` for load().
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (to: string) => redirect(to) as unknown,
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/modules/administration/roles/role-service', () => ({
  listRoles: (...args: unknown[]) => listRoles(...args) as unknown,
}));
vi.mock('@/modules/administration/branches/branch-service', () => ({
  listBranches: (...args: unknown[]) => listBranches(...args) as unknown,
}));
vi.mock('@/modules/administration/users/components/invite-user-wizard', () => ({
  InviteUserWizard: (props: ComponentProps<typeof InviteUserWizard>) => {
    wizards.push(props);
    return <p>The wizard</p>;
  },
}));

const { default: InviteUserPage } = await import('./page');

const ORG = '11111111-1111-4111-8111-111111111111';
const TELLER = 'c1000000-0000-4000-8000-0000000000cc';
const WESTLANDS = 'a4000000-0000-4000-8000-0000000000aa';
const NO_ACTIVE_ROLES =
  'There are no active roles to assign. Create or activate one under Roles & permissions.';
const NO_ACTIVE_BRANCHES =
  'There are no active branches to assign. Activate one under Branches first.';

const resolved = (permissions: readonly string[] = INVITE_CODES) => ({
  kind: 'resolved',
  profile: { permissions },
  context: { organization: { id: ORG, name: 'Greenfield SACCO' }, branch: null },
});

const page = <T,>(items: T[], hasNext = false) => ({
  items,
  page: {
    number: 0,
    size: 100,
    totalItems: items.length,
    totalPages: 1,
    hasNext,
    hasPrevious: false,
  },
});

const ROLE = {
  id: TELLER,
  roleCode: 'TELLER',
  roleName: 'Teller',
  systemRole: false,
  status: 'ACTIVE',
};
const BRANCH = {
  id: WESTLANDS,
  branchCode: 'WESTLANDS',
  branchName: 'Westlands Branch',
  branchType: 'OPERATIONS',
  status: 'ACTIVE',
  createdAt: '2026-07-01T08:00:00Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  wizards.length = 0;
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
  getCurrentContextProfile.mockResolvedValue(resolved());
  listRoles.mockResolvedValue(page([ROLE]));
  listBranches.mockResolvedValue(page([BRANCH]));
});

describe('InviteUserPage', () => {
  it('reads one page of 100 active roles and branches by name and hands them to the wizard', async () => {
    renderWithProviders(await InviteUserPage());

    expect(screen.getByRole('heading', { level: 1, name: 'Invite user' })).toBeInTheDocument();
    expect(listRoles).toHaveBeenCalledWith({
      status: 'ACTIVE',
      sort: { by: 'roleName', dir: 'ASC' },
      page: 0,
      size: 100,
    });
    expect(listBranches).toHaveBeenCalledWith({
      status: 'ACTIVE',
      sort: { by: 'branchName', dir: 'ASC' },
      page: 0,
      size: 100,
    });
    expect(wizards).toEqual([
      {
        roles: [{ id: TELLER, label: 'Teller (TELLER)' }],
        branches: [{ id: WESTLANDS, label: 'Westlands Branch (WESTLANDS)' }],
        rolesCapped: false,
        branchesCapped: false,
        contextOrganisationId: ORG,
      },
    ]);
  });

  it('tells the wizard when either list stops at 100', async () => {
    listRoles.mockResolvedValue(page([ROLE], true));
    listBranches.mockResolvedValue(page([BRANCH], true));
    renderWithProviders(await InviteUserPage());
    expect(wizards[0]).toMatchObject({ rolesCapped: true, branchesCapped: true });
  });

  it.each(INVITE_CODES)('says why, and reads nothing, without %s (Ruling 4)', async (missing) => {
    getCurrentContextProfile.mockResolvedValue(
      resolved(INVITE_CODES.filter((code) => code !== missing)),
    );
    renderWithProviders(await InviteUserPage());

    expect(screen.getByRole('heading', { level: 1, name: 'Invite user' })).toBeInTheDocument();
    expect(screen.getByText(INVITE_FORBIDDEN)).toBeInTheDocument();
    expect(listRoles).not.toHaveBeenCalled();
    expect(listBranches).not.toHaveBeenCalled();
    expect(wizards).toHaveLength(0);
  });

  it('says so for an unresolved context too', async () => {
    getCurrentContextProfile.mockResolvedValue({
      kind: 'redirect-to-context-selection',
      reason: 'invalid-context',
    });
    renderWithProviders(await InviteUserPage());
    expect(screen.getByText(INVITE_FORBIDDEN)).toBeInTheDocument();
  });

  it('shows the forbidden state for a refused read and the error, with its reference, for another', async () => {
    listRoles.mockRejectedValueOnce(new BackendApiError(403, { code: 'forbidden' }));
    renderWithProviders(await InviteUserPage());
    expect(screen.getByText("You don't have permission")).toBeInTheDocument();
    expect(wizards).toHaveLength(0);

    listBranches.mockRejectedValueOnce(new BackendApiError(503, { requestId: 'req-9' }));
    renderWithProviders(await InviteUserPage());
    expect(screen.getByText(/Reference: req-9/)).toBeInTheDocument();
    expect(wizards).toHaveLength(0);
  });

  it.each([
    [new BackendApiError(401), '/login?reason=session_expired'],
    [new BackendApiError(403, { code: 'invalid_active_tenant_context' }), '/select-context'],
  ])('redirects a lost session or a stale context (%s)', async (error, to) => {
    listBranches.mockRejectedValueOnce(error);
    await expect(InviteUserPage()).rejects.toThrow(`NEXT_REDIRECT:${to}`);
  });

  it('points to Roles when no role is active, instead of a wizard that cannot finish', async () => {
    listRoles.mockResolvedValue(page([]));
    renderWithProviders(await InviteUserPage());
    expect(screen.getByText(NO_ACTIVE_ROLES)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Roles & permissions' })).toHaveAttribute(
      'href',
      '/admin/roles',
    );
    expect(wizards).toHaveLength(0);
  });

  it('points to Branches when no branch is active', async () => {
    listBranches.mockResolvedValue(page([]));
    renderWithProviders(await InviteUserPage());
    expect(screen.getByText(NO_ACTIVE_BRANCHES)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Branches' })).toHaveAttribute(
      'href',
      '/admin/branches',
    );
    expect(wizards).toHaveLength(0);
  });
});
```

**Erratum (fb6d2fa, `test(users): pin each option list's cap and each read's redirect on the invite
page`):** the cap test caps one list at a time (`it.each` over roles and branches, asserting the
wizard gets exactly that flag), and the redirect cases run against the roles read as well as the
branches read.

- [ ] **Step 2: Run** — form U on the test file: FAIL (`./page` doesn't resolve).

- [ ] **Step 3: Implement** — `new/page.tsx`:

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { getCurrentContextProfile } from '@/auth/context-service';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import type { ProblemView } from '@/lib/api/problem';
import { listBranches } from '@/modules/administration/branches/branch-service';
import { listRoles } from '@/modules/administration/roles/role-service';
import { InviteUserWizard } from '@/modules/administration/users/components/invite-user-wizard';
import {
  canInviteUsers,
  INVITE_FORBIDDEN,
  NO_ACTIVE_BRANCHES,
  OPTION_CEILING,
} from '@/modules/administration/users/invite-rules';
import { NO_ACTIVE_ROLES } from '@/modules/administration/users/user-rules';

export const metadata: Metadata = { title: 'Invite user' };

/** A read the page can't go on without: forbidden says so, anything else with its reference. */
function failed(problem: ProblemView): ReactNode {
  return problem.code === 'forbidden' ? <ForbiddenState /> : <ErrorState problem={problem} />;
}

/** Nothing to offer: the way to fix it, instead of a wizard that can't be finished. */
function nothingToOffer(message: string, href: string, action: string): ReactNode {
  return (
    <Box sx={{ p: 6, display: 'grid', gap: 3, justifyItems: 'start' }}>
      <Typography>{message}</Typography>
      <Button component={NextLink} href={href} variant="outlined">
        {action}
      </Button>
    </Box>
  );
}

export default async function InviteUserPage() {
  const selected = await getCurrentContextProfile();
  const resolved = selected.kind === 'resolved' ? selected : null;
  const header = (
    <PageHeader
      eyebrow="Administration · Users & access"
      title="Invite user"
      description="Give someone a membership in this institution. A different administrator approves it before they can use this institution."
    />
  );
  const withHeader = (content: ReactNode) => (
    <>
      {header}
      <Paper>{content}</Paper>
    </>
  );

  // Ruling 4: every code the wizard needs, before any read; no half-working wizard.
  if (!canInviteUsers({ permissions: resolved?.profile.permissions ?? [] })) {
    return withHeader(<ForbiddenState description={INVITE_FORBIDDEN} />);
  }

  // ponytail: one page of 100 ACTIVE roles and branches each, by name; past it the wizard says so
  // (AGENTS.md's eighth paging exception; Ruling 10).
  const [roles, branches] = await Promise.all([
    load(
      listRoles({
        status: 'ACTIVE',
        sort: { by: 'roleName', dir: 'ASC' },
        page: 0,
        size: OPTION_CEILING,
      }),
    ),
    load(
      listBranches({
        status: 'ACTIVE',
        sort: { by: 'branchName', dir: 'ASC' },
        page: 0,
        size: OPTION_CEILING,
      }),
    ),
  ]);
  if (!roles.ok) return withHeader(failed(roles.problem));
  if (!branches.ok) return withHeader(failed(branches.problem));
  if (roles.value.items.length === 0) {
    return withHeader(nothingToOffer(NO_ACTIVE_ROLES, '/admin/roles', 'Open Roles & permissions'));
  }
  if (branches.value.items.length === 0) {
    return withHeader(nothingToOffer(NO_ACTIVE_BRANCHES, '/admin/branches', 'Open Branches'));
  }

  return (
    <>
      {header}
      <InviteUserWizard
        roles={roles.value.items.map((role) => ({
          id: role.id,
          label: `${role.roleName} (${role.roleCode})`,
        }))}
        branches={branches.value.items.map((branch) => ({
          id: branch.id,
          label: `${branch.branchName} (${branch.branchCode})`,
        }))}
        rolesCapped={roles.value.page.hasNext}
        branchesCapped={branches.value.page.hasNext}
        contextOrganisationId={resolved?.context.organization.id}
      />
    </>
  );
}
```

If `tsc` reports TS2307 for the new route, run `rm -rf .next/types .next/dev/types` with no `next`
process running.

- [ ] **Step 4: Run** — form U: PASS; then form E on nothing yet (the e2e arrives in Task 7).
      Mutation proofs (each must fail the named test; revert after each): move the
      `canInviteUsers` check after the two reads ("says why, and reads nothing, without
      user.invite (Ruling 4)"); show `nothingToOffer(NO_ACTIVE_ROLES, …)` when `!roles.ok` ("shows
      the forbidden state for a refused read and the error, with its reference, for another");
      read `size: 50` (the first test).

- [ ] **Step 5: Commit** (form C):

```
feat(users): add the Invite user page

/admin/users/new checks every code the wizard needs before any read and says what is missing
(Ruling 4), then reads one page of 100 active roles and 100 active branches by name, each settled
with load(): a refusal shows the forbidden state, another failure its reference, and an empty list
links to Roles or Branches instead of a wizard that can't finish (Ruling 10).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`. **Review note:** the static `new` segment wins over 10's
`[userId]` (as `/admin/branches/new` does); the gate's `next build` confirms the route table.

#### Task 5b: Invite user on the directory

**Files:**

- Modify: `app/(authenticated)/admin/users/page.tsx` (replace it with the complete file below; the
  diff is the profile read beside the directory read, three imports and the header's `actions`)
- Create: `app/(authenticated)/admin/users/page.test.tsx`

**Interfaces:**

- Consumes: `getCurrentContextProfile`; `next-link`; `PersonAddAltOutlined`; 1a's
  `canInviteUsers`, `INVITE_HREF`.
- Produces: the "Invite user" link in the directory's header.

- [ ] **Step 1: Write the failing test** — `app/(authenticated)/admin/users/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import { INVITE_CODES } from '@/modules/administration/users/invite-rules';
import { renderWithProviders } from '@/test/test-utils';

const { getCurrentContextProfile, listUsers, redirect } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  listUsers: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => {
  // The real `unstable_rethrow` for load(), plus the list kit's hooks outside an app router.
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    redirect: (to: string) => redirect(to) as unknown,
    usePathname: () => '/admin/users',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
});
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  listUsers: (...args: unknown[]) => listUsers(...args) as unknown,
}));

const { default: UsersPage } = await import('./page');

const resolved = (permissions: readonly string[]) => ({
  kind: 'resolved',
  profile: { permissions },
  context: { organization: { id: 'org-1', name: 'Greenfield SACCO' }, branch: null },
});

const EMPTY = {
  items: [],
  page: { number: 0, size: 10, totalItems: 0, totalPages: 0, hasNext: false, hasPrevious: false },
};

const render = async () => {
  renderWithProviders(await UsersPage({ searchParams: Promise.resolve({}) }));
};

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
  listUsers.mockResolvedValue(EMPTY);
});

describe('UsersPage: the Invite user entry (Ruling 4)', () => {
  it('links to the wizard for a holder of every code it needs', async () => {
    getCurrentContextProfile.mockResolvedValue(resolved(INVITE_CODES));
    await render();
    expect(screen.getByRole('link', { name: 'Invite user' })).toHaveAttribute(
      'href',
      '/admin/users/new',
    );
  });

  it.each(INVITE_CODES)('is not offered without %s', async (missing) => {
    getCurrentContextProfile.mockResolvedValue(
      resolved(INVITE_CODES.filter((code) => code !== missing)),
    );
    await render();
    expect(screen.getByRole('heading', { level: 1, name: 'Users & access' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Invite user' })).toBeNull();
  });

  it('is not offered for an unresolved context', async () => {
    getCurrentContextProfile.mockResolvedValue({
      kind: 'redirect-to-context-selection',
      reason: 'invalid-context',
    });
    await render();
    expect(screen.queryByRole('link', { name: 'Invite user' })).toBeNull();
  });

  it('stays in the header when the directory read fails', async () => {
    getCurrentContextProfile.mockResolvedValue(resolved(INVITE_CODES));
    listUsers.mockRejectedValueOnce(new BackendApiError(503, { requestId: 'req-4' }));
    await render();
    expect(screen.getByText(/Reference: req-4/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Invite user' })).toBeInTheDocument();
  });
});
```

**Erratum (ef6ecd3, `test(users): pin the directory page's profile read and its heading`):** the
unresolved-context test also asserts the page's h1 (`Users & access`), and a new test rejects
`UsersPage` when `getCurrentContextProfile` rejects, so the error boundary sees it. The page is
unchanged.

- [ ] **Step 2: Run** — form U on the test file: FAIL (the two cases that expect a link named
      "Invite user"; the cases without it pass already).

- [ ] **Step 3: Implement** — the complete `app/(authenticated)/admin/users/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import PersonAddAltOutlined from '@mui/icons-material/PersonAddAltOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { ListNavigationProvider } from '@/components/data-display/list-navigation-context';
import {
  ListBusyRegion,
  ListNavigationProgress,
} from '@/components/data-display/list-pending-indicator';
import { ListToolbar, type ToolbarField } from '@/components/data-display/list-toolbar';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { lastPageIfPastEnd } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import { UserDirectoryTable } from '@/modules/administration/users/components/user-directory-table';
import { canInviteUsers, INVITE_HREF } from '@/modules/administration/users/invite-rules';
import { MEMBERSHIP_STATUSES, USER_STATUSES } from '@/modules/administration/users/user-contract';
import { hasUserFilters, parseUserListQuery } from '@/modules/administration/users/user-query';
import { userStatusLabel } from '@/modules/administration/users/user-rules';
import { listUsers } from '@/modules/administration/users/user-service';

export const metadata: Metadata = { title: 'Users & access' };

const PATH = '/admin/users';

const FIELDS: ToolbarField[] = [
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

interface UsersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const params = toSearchParams(await searchParams);
  const query = parseUserListQuery(params);
  const [users, selected] = await Promise.all([load(listUsers(query)), getCurrentContextProfile()]);
  const permissions = selected.kind === 'resolved' ? selected.profile.permissions : [];

  const header = (
    <PageHeader
      eyebrow="Administration"
      title="Users & access"
      description="Everyone with a membership in this institution: their onboarding, status and access."
      actions={
        // Ruling 4: offered only with every code the wizard needs.
        canInviteUsers({ permissions }) ? (
          <Button
            component={NextLink}
            href={INVITE_HREF}
            variant="contained"
            startIcon={<PersonAddAltOutlined />}
          >
            Invite user
          </Button>
        ) : undefined
      }
    />
  );

  if (!users.ok) {
    return (
      <>
        {header}
        <Paper>
          {users.problem.code === 'forbidden' ? (
            <ForbiddenState />
          ) : (
            <ErrorState problem={users.problem} />
          )}
        </Paper>
      </>
    );
  }

  const redirectPage = lastPageIfPastEnd(users.value.page);
  if (redirectPage !== null) {
    redirect(hrefWith(PATH, params, { page: redirectPage === 0 ? null : String(redirectPage) }));
  }

  const total = users.value.page.totalItems;

  return (
    <>
      {header}
      <ListNavigationProvider>
        <Paper sx={{ overflow: 'hidden', position: 'relative' }}>
          <ListToolbar
            // No datetime field here, so the zone is unused: no `GET /tenant` read for it.
            timeZone="UTC"
            resultLabel={`${total} ${total === 1 ? 'user' : 'users'}`}
            fields={FIELDS}
          />
          <ListNavigationProgress />
          <ListBusyRegion>
            {users.value.items.length === 0 ? (
              <EmptyState
                title="No users"
                description={
                  hasUserFilters(query)
                    ? 'No users match these filters.'
                    : 'No one has been invited yet.'
                }
              />
            ) : (
              <UserDirectoryTable users={users.value.items} />
            )}
            <TablePaginationBar page={users.value.page} />
          </ListBusyRegion>
        </Paper>
      </ListNavigationProvider>
    </>
  );
}
```

- [ ] **Step 4: Run** — form U: PASS; then form E on `e2e/users.spec.ts --grep "users: directory"`
      (the directory's flows, unchanged: its scenarios hold no `user.invite`). Mutation proof:
      gate the button on `can({ permissions }, 'user.invite')` alone ("is not offered without
      user.assign_branch"); revert.

- [ ] **Step 5: Commit** (form C):

```
feat(users): offer Invite user on the directory

The Users & access header links to the wizard for a holder of every code it needs (Ruling 4), even
when the directory itself can't be read. The directory gets its first page test.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check` and the directory chunk of `e2e/users.spec.ts`.

### Task 6: The fake API

Three sub-tasks: **6a** (the scenarios), **6b** (`POST /tenant/users`: binding, validation,
permissions and the invitation itself) and **6c** (the backend's 500 rules). Plain-node rules apply
(rule 15); `.mts` files go through form P before staging.

#### Task 6a: The invite scenarios

**Files:**

- Modify: `e2e/fake-api/scenarios.mts` (two insertions)
- Create: `e2e/fake-api-invite.spec.ts` (the seeds; Task 6b replaces it with the route's spec)

**Interfaces:**

- Consumes: `usersScenario`, `organisation`, `membership`, `branch`, `withoutPermission`, `IDS`,
  `FakeUser`, `FakeMembership`, `RunState` (all in `scenarios.mts`/`state.mts`).
- Produces: `INVITE_SCENARIO_IDS`, `INVITE_SCENARIO_TEXT`; the scenarios `users-invite` (`users`
  plus `user.invite` on Jane's role, the PENDING_APPROVAL Kisumu Branch, and Rehema and Otieno,
  ACTIVE members of another institution, Pwani Traders SACCO) and `users-invite-limited` (the same
  without `user.assign_branch`).

- [ ] **Step 1: Write the failing spec** — `e2e/fake-api-invite.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import {
  IDS,
  INVITE_SCENARIO_IDS as INVITE,
  seedScenario,
  USER_SCENARIO_IDS as USERS,
  type ScenarioName,
} from './fake-api/scenarios.mts';

test.describe('fake API invitations (contract §E.3, layer 11)', () => {
  test('seeds a pending branch, a disabled role and the two outside accounts', () => {
    const state = seedScenario('users-invite');
    expect(state.branches.find((branch) => branch.id === INVITE.kisumu)?.status).toBe(
      'PENDING_APPROVAL',
    );
    expect(state.roles.find((role) => role.id === USERS.loansOfficer)?.status).toBe('DISABLED');
    expect(
      state.memberships
        .filter((row) => row.organisationId === INVITE.pwaniTraders)
        .map((row) => row.userId),
    ).toEqual([INVITE.rehema, INVITE.otieno]);
  });

  test('grants user.invite only in its own scenarios, and user.assign_branch not in the limited one', () => {
    const codes = (scenario: ScenarioName) =>
      seedScenario(scenario).roles.find((role) => role.id === IDS.tenantAdminRole)?.permissions ??
      [];
    expect(codes('users-invite')).toEqual(
      expect.arrayContaining(['user.invite', 'user.assign_branch']),
    );
    expect(codes('users-invite-limited')).toContain('user.invite');
    expect(codes('users-invite-limited')).not.toContain('user.assign_branch');
    expect(codes('users')).not.toContain('user.invite');
  });
});
```

- [ ] **Step 2: Run** — form E on `e2e/fake-api-invite.spec.ts`: FAIL (`INVITE_SCENARIO_IDS` isn't
      exported; `users-invite` is no scenario).

- [ ] **Step 3: Implement** — in `e2e/fake-api/scenarios.mts`, insert this block immediately
      **before** the line ``// `satisfies` (not a `: Record<...>` annotation) keeps the literal key set``
      (after layer 12's `approvalsScenario`):

```ts
/** Layer 11 seed IDs (lane rules §5): users …a*, branches …b*, organisations …c*, memberships …d*. */
export const INVITE_SCENARIO_IDS = {
  rehema: '11000000-0000-4000-8000-0000000000a1',
  otieno: '11000000-0000-4000-8000-0000000000a2',
  kisumu: '11000000-0000-4000-8000-0000000000b1',
  pwaniTraders: '11000000-0000-4000-8000-0000000000c1',
  rehemaMembership: '11000000-0000-4000-8000-0000000000d1',
  otienoMembership: '11000000-0000-4000-8000-0000000000d2',
} as const;

/** The seeds' words the invite e2e types and asserts. */
export const INVITE_SCENARIO_TEXT = {
  rehemaEmail: 'rehema.mwangi@pwani-traders.example',
  rehemaName: 'Rehema Mwangi',
  takenUsername: 'otieno.k',
} as const;

/**
 * Layer 11: a copy of `users` (a member in every onboarding state; ACTIVE roles and the DISABLED
 * Loans officer) plus `user.invite` on Jane's role, a PENDING_APPROVAL branch the wizard must not
 * offer, and two accounts in another institution: Rehema, whose email an invite reuses (her own
 * name stays), and Otieno, whose username is taken for any other email (a 500 the wizard can't
 * check, BG-07).
 */
function usersInviteScenario(): RunState {
  const state = usersScenario();
  const ids = INVITE_SCENARIO_IDS;
  const outsider = (id: string, username: string, displayName: string): FakeUser => ({
    id,
    username,
    email: `${username}@pwani-traders.example`,
    displayName,
    status: 'ACTIVE',
    keycloakSubject: `e2e-${username}`,
  });
  const staffAt = (id: string, userId: string): FakeMembership => ({
    ...membership(id, ids.pwaniTraders, userId),
    type: 'STAFF',
  });
  return {
    ...state,
    organisations: [
      ...state.organisations,
      organisation(ids.pwaniTraders, 'pwani-traders', 'Pwani Traders SACCO'),
    ],
    users: [
      ...state.users,
      outsider(ids.rehema, 'rehema.mwangi', INVITE_SCENARIO_TEXT.rehemaName),
      outsider(ids.otieno, INVITE_SCENARIO_TEXT.takenUsername, 'Otieno Kamau'),
    ],
    memberships: [
      ...state.memberships,
      staffAt(ids.rehemaMembership, ids.rehema),
      staffAt(ids.otienoMembership, ids.otieno),
    ],
    branches: [
      ...state.branches,
      {
        ...branch(ids.kisumu, IDS.greenfield, 'KISUMU', 'Kisumu Branch', 'OPERATIONS'),
        status: 'PENDING_APPROVAL',
      },
    ],
    roles: state.roles.map((candidate) =>
      candidate.id === IDS.tenantAdminRole
        ? { ...candidate, permissions: [...candidate.permissions, 'user.invite'] }
        : candidate,
    ),
  };
}
```

Then insert these lines as the **last** entries of `BUILDERS`, immediately before the line
`} satisfies Record<string, () => RunState>;` (after layer 12's `'approvals-empty'` entry):

```ts
  // Layer 11 (invite wizard). `users` plus user.invite, a pending branch and two accounts in
  // another institution; `users-invite-limited` is the same without user.assign_branch (an invite
  // with a branch is refused, and the wizard isn't offered). `users` itself has no user.invite.
  'users-invite': usersInviteScenario,
  'users-invite-limited': () => withoutPermission(usersInviteScenario(), 'user.assign_branch'),
```

Run form P on `e2e/fake-api/scenarios.mts`.

- [ ] **Step 4: Run** — form E: PASS. Then prove the 33 existing scenarios serialise identically
      (rule 15). Write this script **outside the repository** (in the scratch directory the
      controller's brief names, as `<scratch>/serialise-check.mts`), copy the base tree's
      scenarios beside it, and run it from the repository root:

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
git show HEAD:e2e/fake-api/scenarios.mts > <scratch>/base-scenarios.mts
node <scratch>/serialise-check.mts <scratch>/base-scenarios.mts "$PWD/e2e/fake-api/scenarios.mts"
```

Expected: `33/33 existing scenarios serialise identically; new: users-invite, users-invite-limited`.
Mutation proof: append `'user.invite'` to the module-level `USER_ADMIN_CODES` array instead of
mapping Jane's role in `usersInviteScenario`; the script must report `DIFFERS: users` (and the
scenarios built on it); revert.

- [ ] **Step 5: Commit** (form C):

```
test(fake-api): seed the invite scenarios

users-invite is users plus user.invite on Jane's role, a pending branch the wizard must not offer,
and two members of another institution: Rehema, whose email an invitation reuses, and Otieno, whose
username is taken for any other email. users-invite-limited is the same without user.assign_branch.
The 33 existing scenarios serialise identically.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check` and form E on the fake spec.

#### Task 6b: `POST /tenant/users`

**Files:**

- Create: `e2e/fake-api/routes/invitations.mts`
- Modify: `e2e/fake-api/server.mts` (one import, one spread)
- Modify: `e2e/fake-api-invite.spec.ts` (replace it with the complete file below)

**Interfaces:**

- Consumes: `requireContext`, `requirePermission`, `requireTenantContext`, `AccessContext`
  (`access.mts`); `recordAuditEvent`; `UUID`, `objectBody`, `problem`, `readBody`, `stringField`,
  `Violation` (`http.mts`); `sendIdempotent`; `route`, `Route`; `FakeMembership`, `FakeUser`,
  `RunState`.
- Produces: `invitationRoutes` (`POST /api/v1/tenant/users`): 201 `UserInvitationResult`; 400
  `invalid_json` on an unknown or camelCase key, a missing required field, a bad enum or UUID, a
  `null` or non-boolean flag, or an incomplete list element (an absent or `null` list is `[]`,
  contract §D); 400 `validation_failed` with violations
  for the email, username, display name and phone; 403 without `user.invite`, or without
  `user.assign_branch` at an invited branch (a TENANT grant, or a BRANCH grant at the selected
  branch); a reused account by email (case-insensitive) keeps its own identity; a new user is DRAFT
  with no identity link; the membership is PENDING_APPROVAL with `invitedBy`; the assignments are
  ACTIVE; a `user.invite` audit event on USER; replay and key reuse through `sendIdempotent`.
  (Task 6c adds the 500 rules.)

- [ ] **Step 1: Write the failing spec** — the complete `e2e/fake-api-invite.spec.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import {
  IDS,
  INVITE_SCENARIO_IDS as INVITE,
  INVITE_SCENARIO_TEXT as TEXT,
  seedScenario,
  USER_SCENARIO_IDS as USERS,
  type ScenarioName,
} from './fake-api/scenarios.mts';
import { api, contextFor } from './support/fake-api';

interface Paged<T> {
  items: T[];
  page: { total_items: number };
}

interface UserRow {
  id: string;
  username: string;
  email: string;
  display_name: string;
  user_status: string;
  membership_status: string;
}

interface Invitation {
  user_id: string;
  membership_id: string;
  user_status: string;
  membership_status: string;
}

interface ProblemBody {
  code: string;
  violations: { field: string; code: string }[] | null;
}

const read = async <T>(response: APIResponse): Promise<T> => (await response.json()) as T;

/** A valid InviteUser body (contract §D): Neema, staff at Westlands, a Teller everywhere. */
const BODY = {
  email: 'neema.wanjiku@greenfield.example',
  username: 'neema.wanjiku',
  display_name: 'Neema Wanjiku',
  phone_e164: '+254712000140',
  membership_type: 'STAFF',
  primary_branch_id: IDS.westlands,
  branch_assignments: [{ branch_id: IDS.westlands, assignment_type: 'HOME' }],
  role_assignments: [{ role_id: USERS.teller, scope_type: 'TENANT', branch_id: null }],
  send_keycloak_invite: true,
  send_application_invite: false,
};

/** A fresh run of `scenario`, with the requests as the app sends them. */
async function signIn(
  request: APIRequestContext,
  scenario: ScenarioName = 'users-invite',
  branchId: string | null = null,
) {
  const headers = await contextFor(request, scenario, branchId);
  return {
    get: (path: string) => request.get(api(path), { headers }),
    /** A mutation carries a fresh Idempotency-Key unless the test pins one. */
    invite: (data: Record<string, unknown>, key: string = randomUUID()) =>
      request.post(api('/tenant/users'), { headers: { ...headers, 'Idempotency-Key': key }, data }),
  };
}

async function expectProblem(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status()).toBe(status);
  expect(await read<ProblemBody>(response)).toMatchObject({ code });
}

test.describe('fake API invitations (contract §E.3, layer 11)', () => {
  test('invites a new person: 201, a DRAFT user and a pending membership with its access', async ({
    request,
  }) => {
    const { get, invite } = await signIn(request);

    const created = await invite(BODY);
    expect(created.status()).toBe(201);
    const invitation = await read<Invitation>(created);
    expect(invitation).toMatchObject({
      user_status: 'DRAFT',
      membership_status: 'PENDING_APPROVAL',
    });

    // Newest first: the directory lists her at the top.
    const users = await read<Paged<UserRow>>(await get('/tenant/users?size=1'));
    expect(users.items[0]).toEqual({
      id: invitation.user_id,
      username: 'neema.wanjiku',
      email: 'neema.wanjiku@greenfield.example',
      display_name: 'Neema Wanjiku',
      user_status: 'DRAFT',
      membership_status: 'PENDING_APPROVAL',
    });
    const membership = await read<{ membership_type: string; primary_branch_id: string }>(
      await get(`/tenant/memberships/${invitation.membership_id}`),
    );
    expect(membership).toMatchObject({
      membership_type: 'STAFF',
      primary_branch_id: IDS.westlands,
    });
    const roles = await read<Paged<{ role_id: string; scope_type: string }>>(
      await get(`/tenant/role-assignments?user_id=${invitation.user_id}`),
    );
    expect(roles.items).toMatchObject([{ role_id: USERS.teller, scope_type: 'TENANT' }]);
    const branches = await read<Paged<{ user_id: string; assignment_type: string }>>(
      await get(`/tenant/branch-assignments?branch_id=${IDS.westlands}&status=ACTIVE&size=100`),
    );
    expect(branches.items.filter((row) => row.user_id === invitation.user_id)).toMatchObject([
      { assignment_type: 'HOME' },
    ]);
    // The maker lookup's source (contract §G): Jane invited her.
    const audit = await read<Paged<{ actor_id: string }>>(
      await get(
        `/tenant/audit-events?entity_type=USER&entity_id=${invitation.user_id}&action=user.invite`,
      ),
    );
    expect(audit.items).toMatchObject([{ actor_id: IDS.jane }]);
  });

  test('replays a success for the same key and refuses the key with another body', async ({
    request,
  }) => {
    const { invite } = await signIn(request);
    const key = randomUUID();
    const first = await read<Invitation>(await invite(BODY, key));

    const replay = await invite(BODY, key);
    expect(replay.status()).toBe(201);
    expect(replay.headers()['idempotency-replayed']).toBe('true');
    expect(await read<Invitation>(replay)).toEqual(first);
    await expectProblem(
      await invite({ ...BODY, display_name: 'Neema W.' }, key),
      409,
      'IDEMPOTENCY_KEY_REUSED',
    );
  });

  test('reuses an account another institution has, ignoring the entered identity', async ({
    request,
  }) => {
    const { get, invite } = await signIn(request);
    const created = await invite({
      ...BODY,
      email: TEXT.rehemaEmail.toUpperCase(),
      username: 'someone.else',
      display_name: 'Someone Else',
    });
    expect(created.status()).toBe(201);
    expect(await read<Invitation>(created)).toMatchObject({
      user_id: INVITE.rehema,
      user_status: 'ACTIVE',
      membership_status: 'PENDING_APPROVAL',
    });
    expect(await read<UserRow>(await get(`/tenant/users/${INVITE.rehema}`))).toMatchObject({
      display_name: TEXT.rehemaName,
      username: 'rehema.mwangi',
    });
  });

  test('refuses an unknown or camelCase property, a null flag and a missing field (invalid_json)', async ({
    request,
  }) => {
    const { invite } = await signIn(request);
    await expectProblem(await invite({ ...BODY, invited_by: IDS.jane }), 400, 'invalid_json');
    await expectProblem(await invite({ ...BODY, displayName: 'Neema' }), 400, 'invalid_json');
    await expectProblem(await invite({ ...BODY, send_keycloak_invite: null }), 400, 'invalid_json');
    const { username: _username, ...withoutUsername } = BODY;
    await expectProblem(await invite(withoutUsername), 400, 'invalid_json');
    await expectProblem(
      await invite({ ...BODY, branch_assignments: [{ branch_id: IDS.westlands }] }),
      400,
      'invalid_json',
    );
    // Control: the same body without the extra key succeeds.
    expect((await invite(BODY)).status()).toBe(201);
  });

  test('takes the flags as optional (absent = their defaults), and a null list as none', async ({
    request,
  }) => {
    const { invite } = await signIn(request);
    const {
      send_keycloak_invite: _keycloak,
      send_application_invite: _application,
      ...rest
    } = BODY;
    expect((await invite(rest)).status()).toBe(201);
    // Contract §D: "Missing = absent or null", and a missing list is [].
    const auditor = await invite({
      ...rest,
      email: 'auditor.null@greenfield.example',
      username: 'auditor.null',
      membership_type: 'AUDITOR',
      branch_assignments: null,
      primary_branch_id: null,
    });
    expect(auditor.status()).toBe(201);
  });

  test('validates the identity fields with violations', async ({ request }) => {
    const { invite } = await signIn(request);
    const refused = await invite({
      ...BODY,
      email: 'neema@',
      username: 'ne',
      display_name: 'N',
      phone_e164: '0712000140',
    });
    expect(refused.status()).toBe(400);
    const body = await read<ProblemBody>(refused);
    expect(body.code).toBe('validation_failed');
    expect(body.violations?.map((violation) => violation.field)).toEqual([
      'email',
      'username',
      'display_name',
      'phone_e164',
    ]);
  });

  test('needs user.invite, and user.assign_branch only for an invited branch', async ({
    request,
  }) => {
    // `users` holds user.assign_branch but no user.invite.
    await expectProblem(await (await signIn(request, 'users')).invite(BODY), 403, 'forbidden');
    // `users-invite-limited` holds user.invite but no user.assign_branch.
    const limited = await signIn(request, 'users-invite-limited');
    await expectProblem(await limited.invite(BODY), 403, 'forbidden');
    const auditor = { ...BODY, membership_type: 'AUDITOR', branch_assignments: [] };
    expect((await limited.invite({ ...auditor, primary_branch_id: null })).status()).toBe(201);
  });

  test('invites from a branch context too, to any branch (no branch restriction)', async ({
    request,
  }) => {
    const { invite } = await signIn(request, 'users-invite', IDS.headOffice);
    expect((await invite(BODY)).status()).toBe(201);
  });

  test('seeds a pending branch, a disabled role and the two outside accounts', () => {
    const state = seedScenario('users-invite');
    expect(state.branches.find((branch) => branch.id === INVITE.kisumu)?.status).toBe(
      'PENDING_APPROVAL',
    );
    expect(state.roles.find((role) => role.id === USERS.loansOfficer)?.status).toBe('DISABLED');
    expect(
      state.memberships
        .filter((row) => row.organisationId === INVITE.pwaniTraders)
        .map((row) => row.userId),
    ).toEqual([INVITE.rehema, INVITE.otieno]);
  });

  test('grants user.invite only in its own scenarios, and user.assign_branch not in the limited one', () => {
    const codes = (scenario: ScenarioName) =>
      seedScenario(scenario).roles.find((role) => role.id === IDS.tenantAdminRole)?.permissions ??
      [];
    expect(codes('users-invite')).toEqual(
      expect.arrayContaining(['user.invite', 'user.assign_branch']),
    );
    expect(codes('users-invite-limited')).toContain('user.invite');
    expect(codes('users-invite-limited')).not.toContain('user.assign_branch');
    expect(codes('users')).not.toContain('user.invite');
  });
});
```

**Erratum (c038090, `test(fake-api): accept invitations as the backend binds and checks them`):**
the seed test also asserts that Kisumu belongs to Greenfield and is `PENDING_APPROVAL`, and that
neither outside account has a membership in Greenfield. The route is the plan's.

**Erratum (aff15ae, `test(fake-api): refuse invitations the backend answers with a 500`):**
the roles assertion also pins `branch_id: null` and `status: 'ACTIVE'`, and the replay test reads
`neema.wanjiku` back through `GET /tenant/users` and expects one row, so a replay and a refused key
reuse write nothing.

**Erratum (a35c09a, `test(fake-api): pin the invite rules the review found unpinned`), reused
account:** the test enters `TEXT.takenUsername` as the username, not `'someone.else'`, so a reused
account is accepted even when the entered username is taken: the username is checked only for a
new account.

- [ ] **Step 2: Run** — form E on the spec: FAIL (every route test: `POST /api/v1/tenant/users` is a
      404 `resource_not_found`); the two seed tests pass.

- [ ] **Step 3: Implement** — `e2e/fake-api/routes/invitations.mts`:

```ts
import { randomUUID } from 'node:crypto';
import { requireContext, requirePermission, requireTenantContext } from '../access.mts';
import type { AccessContext } from '../access.mts';
import { recordAuditEvent } from '../audit-log.mts';
import { UUID, objectBody, problem, readBody, stringField } from '../http.mts';
import type { Violation } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { route } from '../router.mts';
import type { Route } from '../router.mts';
import type { FakeMembership, FakeUser, RunState } from '../state.mts';

/** Contract §D: InviteUser. */
const INVITE_KEYS = [
  'email',
  'username',
  'display_name',
  'phone_e164',
  'membership_type',
  'primary_branch_id',
  'branch_assignments',
  'role_assignments',
  'send_keycloak_invite',
  'send_application_invite',
];
const MEMBERSHIP_TYPES = ['STAFF', 'ADMIN', 'AUDITOR', 'SYSTEM'];
const ASSIGNMENT_TYPES = ['HOME', 'OPERATE', 'APPROVE', 'VIEW'];
const SCOPE_TYPES = ['TENANT', 'BRANCH'];
const USERNAME = /^[a-zA-Z0-9._-]{3,50}$/;
const E164 = /^\+[1-9]\d{1,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const invalidJson = () => problem(400, 'invalid_json', 'Malformed request body.');

interface BranchAssignmentInput {
  branchId: string;
  type: string;
}

interface RoleAssignmentInput {
  roleId: string;
  scopeType: string;
  branchId: string | null;
}

interface Invitation {
  email: string;
  username: string;
  displayName: string;
  membershipType: string;
  primaryBranchId: string | null;
  branches: BranchAssignmentInput[];
  roles: RoleAssignmentInput[];
}

/** A UUID field as the backend binds it: absent or `null` only where nullable, else invalid_json. */
function uuidField(body: Record<string, unknown>, key: string, nullable: boolean): string | null {
  const value = body[key];
  if ((value === undefined || value === null) && nullable) return null;
  if (typeof value !== 'string' || !UUID.test(value)) throw invalidJson();
  return value.toLowerCase();
}

/** A list of exact-key objects; nested element fields are non-null (contract §B), so a missing or
 * mistyped one is invalid_json. An absent or null list is `[]` (contract §D: "Missing = absent or
 * null"; the lists are `[]` if missing). */
function listField(body: Record<string, unknown>, key: string, keys: readonly string[]) {
  const value = body[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalidJson();
  return value.map((item) => objectBody(item, keys));
}

/** `send_keycloak_invite` and `send_application_invite`: absent takes the default; `null` or a
 * non-boolean doesn't bind (contract §D: "don't send null"). */
function flagField(body: Record<string, unknown>, key: string): void {
  const value = body[key];
  if (value !== undefined && typeof value !== 'boolean') throw invalidJson();
}

/** Binding (400 invalid_json), then bean validation (400 validation_failed), as InviteUserRequest. */
function readInvitation(body: Record<string, unknown>): Invitation {
  const email = stringField(body, 'email', { required: true }) ?? '';
  const username = stringField(body, 'username', { required: true }) ?? '';
  const displayName = stringField(body, 'display_name', { required: true }) ?? '';
  const phone = stringField(body, 'phone_e164', { required: false });
  const membershipType = stringField(body, 'membership_type', { required: true }) ?? '';
  if (!MEMBERSHIP_TYPES.includes(membershipType)) throw invalidJson();
  const primaryBranchId = uuidField(body, 'primary_branch_id', true);
  const branches = listField(body, 'branch_assignments', ['branch_id', 'assignment_type']).map(
    (item) => {
      const type = stringField(item, 'assignment_type', { required: true }) ?? '';
      if (!ASSIGNMENT_TYPES.includes(type)) throw invalidJson();
      return { branchId: uuidField(item, 'branch_id', false) ?? '', type };
    },
  );
  const roles = listField(body, 'role_assignments', ['role_id', 'scope_type', 'branch_id']).map(
    (item) => {
      const scopeType = stringField(item, 'scope_type', { required: true }) ?? '';
      if (!SCOPE_TYPES.includes(scopeType)) throw invalidJson();
      return {
        roleId: uuidField(item, 'role_id', false) ?? '',
        scopeType,
        branchId: uuidField(item, 'branch_id', true),
      };
    },
  );
  flagField(body, 'send_keycloak_invite');
  flagField(body, 'send_application_invite');

  const violations: Violation[] = [];
  const check = (valid: boolean, field: string, rule: string, message: string) => {
    if (!valid) violations.push({ field, code: rule, message });
  };
  check(EMAIL.test(email), 'email', 'Email', 'must be a well-formed email address');
  check(USERNAME.test(username), 'username', 'Pattern', 'must match "^[a-zA-Z0-9._-]{3,50}$"');
  check(
    displayName.trim().length >= 2 && displayName.length <= 100,
    'display_name',
    'Size',
    'size must be between 2 and 100',
  );
  check(phone === null || E164.test(phone), 'phone_e164', 'Pattern', 'must be E.164');
  if (violations.length > 0) {
    throw problem(400, 'validation_failed', 'Validation failed.', violations);
  }
  return { email, username, displayName, membershipType, primaryBranchId, branches, roles };
}

/** `user.assign_branch` at each invited branch (contract §E.3 "B"): a TENANT grant, or a BRANCH grant
 * while that branch is the selected one (§E.4). */
function requireAssignAt(access: AccessContext, branchIds: readonly string[]): void {
  for (const branchId of branchIds) {
    const held =
      access.tenantPermissions.has('user.assign_branch') ||
      (access.claims.branchId === branchId && access.permissions.has('user.assign_branch'));
    if (!held) throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
  }
}

const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The invitation (contract §E.3): an email that already has an account anywhere reuses it (case
 * aside), and the entered name, username and phone are then ignored; otherwise a DRAFT user with no
 * identity link. The membership waits for approval, the assignments are ACTIVE, and `user.invite`
 * is audited on the USER (the maker lookup's source, contract §G).
 */
function invite(state: RunState, access: AccessContext, input: Invitation) {
  const organisationId = access.organisation.id;
  const existing = state.users.find((user) => sameText(user.email, input.email));

  const now = new Date().toISOString();
  let user: FakeUser;
  if (existing) {
    user = existing;
  } else {
    user = {
      id: randomUUID(),
      username: input.username,
      email: input.email,
      displayName: input.displayName.trim(),
      status: 'DRAFT',
      keycloakSubject: `e2e-${input.username}`,
      // A new account has no identity link: its approval queues provisioning (a 202).
      identityLinked: false,
    };
    state.users.push(user);
  }
  const membership: FakeMembership = {
    id: randomUUID(),
    organisationId,
    userId: user.id,
    status: 'PENDING_APPROVAL',
    type: input.membershipType,
    primaryBranchId: input.primaryBranchId,
    createdAt: now,
    updatedAt: now,
    invitedBy: access.claims.userId,
  };
  state.memberships.push(membership);
  for (const row of input.branches) {
    state.branchAssignments.push({
      id: randomUUID(),
      organisationId,
      userId: user.id,
      branchId: row.branchId,
      type: row.type,
      status: 'ACTIVE',
    });
  }
  for (const row of input.roles) {
    state.roleAssignments.push({
      id: randomUUID(),
      organisationId,
      userId: user.id,
      roleId: row.roleId,
      scopeType: row.scopeType === 'BRANCH' ? 'BRANCH' : 'TENANT',
      branchId: row.branchId,
      status: 'ACTIVE',
    });
  }
  recordAuditEvent(state, access, {
    entityType: 'USER',
    entityId: user.id,
    action: 'user.invite',
    reason: null,
  });
  return {
    user_id: user.id,
    membership_id: membership.id,
    user_status: user.status,
    membership_status: membership.status,
  };
}

export const invitationRoutes: Route[] = [
  route('POST', '/api/v1/tenant/users', async (context) => {
    const access = requireContext(context);
    requireTenantContext(access);
    requirePermission(access, 'user.invite');
    const body = objectBody(await readBody(context.req), INVITE_KEYS);
    const input = readInvitation(body);
    requireAssignAt(access, [...new Set(input.branches.map((row) => row.branchId))]);
    // Every rule runs inside `produce`, so a refusal stores nothing and a retry with the same key
    // runs again (contract §A); a success replays for the same key.
    sendIdempotent(context, body, () => invite(context.state, access, input), 201);
  }),
];
```

In `e2e/fake-api/server.mts`, add the import after the `business-date` import:

```ts
import { invitationRoutes } from './routes/invitations.mts';
```

and spread it **last** in `routes`, after `...platformRecordRoutes,`:

```ts
  ...platformRecordRoutes,
  ...invitationRoutes,
];
```

Run form P on both `.mts` files.

- [ ] **Step 4: Run** — form E on `e2e/fake-api-invite.spec.ts` and on every other
      `e2e/fake-api*.spec.ts` (no fake behaviour changed for them): PASS. Mutation proofs (each must
      fail the named test; revert after each): answer `200` instead of `201` ("invites a new person:
      201, a DRAFT user and a pending membership with its access"); accept a `null` flag in
      `flagField` ("refuses an unknown or camelCase property, a null flag and a missing field
      (invalid_json)"); drop the `requireAssignAt(…)` call ("needs user.invite, and
      user.assign_branch only for an invited branch"); return `[]` only for an `undefined` list in
      `listField` ("takes the flags as optional (absent = their defaults), and a null list as
      none").

- [ ] **Step 5: Commit** (form C):

```
test(fake-api): accept invitations as the backend binds and checks them

POST /tenant/users binds InviteUser as the backend does (unknown, camelCase or missing fields and
null flags are invalid_json, an absent or null list is empty; bad identity values are
validation_failed with violations) and checks user.invite
and user.assign_branch at each invited branch. It reuses an account by email, keeping its own
identity, or creates a draft user with no identity link, a pending membership, active assignments
and the user.invite audit event the maker lookup reads; a success replays for its key.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check` and form E on the fake specs.

#### Task 6c: The backend's 500 rules

**Files:**

- Modify: `e2e/fake-api/routes/invitations.mts` (replace it with the complete file below)
- Modify: `e2e/fake-api-invite.spec.ts` (one appended `describe`)

**Interfaces:**

- Consumes: 6b.
- Produces: `checkInviteRules` (inside `produce`, so a refusal stores nothing): a 500
  `internal_error` for no role; STAFF/ADMIN without a branch; a role or branch (assigned or primary)
  that isn't ACTIVE in this organisation; a TENANT role with a branch, or a BRANCH role without one
  of the assigned branches; a membership of the email here in any status (BG-28); a username
  another account holds with another email.

- [ ] **Step 1: Write the failing spec** — append this block at the end of
      `e2e/fake-api-invite.spec.ts`, after a blank line:

```ts
test.describe("fake API invitations: the backend's rules (BG-07)", () => {
  test('answers each invite rule failure with a 500, storing nothing (BG-07)', async ({
    request,
  }) => {
    const { get, invite } = await signIn(request);
    const branchRole = (branchId: string | null) => ({
      ...BODY,
      role_assignments: [{ role_id: USERS.supervisor, scope_type: 'BRANCH', branch_id: branchId }],
    });
    const failures: Record<string, unknown>[] = [
      { ...BODY, role_assignments: [] },
      { ...BODY, branch_assignments: [], primary_branch_id: null },
      { ...BODY, membership_type: 'ADMIN', branch_assignments: [], primary_branch_id: null },
      { ...BODY, role_assignments: [{ role_id: USERS.loansOfficer, scope_type: 'TENANT' }] },
      { ...BODY, branch_assignments: [{ branch_id: INVITE.kisumu, assignment_type: 'HOME' }] },
      { ...BODY, primary_branch_id: INVITE.kisumu },
      {
        ...BODY,
        role_assignments: [
          { role_id: USERS.teller, scope_type: 'TENANT', branch_id: IDS.westlands },
        ],
      },
      branchRole(null),
      branchRole(IDS.headOffice),
      // Existing memberships here, in any status (BG-28): Esther is ACTIVE, Hassan REVOKED.
      { ...BODY, email: 'esther.njoki@greenfield.example' },
      { ...BODY, email: 'Hassan.Ali@greenfield.example' },
      // A username another account holds, with a new email.
      { ...BODY, username: TEXT.takenUsername },
    ];
    for (const body of failures) {
      await expectProblem(await invite(body), 500, 'internal_error');
    }
    // Control: the same body succeeds once the rule holds, and the failures stored nothing.
    expect((await invite(branchRole(IDS.westlands))).status()).toBe(201);
    const users = await read<Paged<UserRow>>(await get('/tenant/users?q=neema'));
    expect(users.page.total_items).toBe(1);
  });

  test('lets an auditor in with no branch', async ({ request }) => {
    const { invite } = await signIn(request);
    const created = await invite({
      ...BODY,
      membership_type: 'AUDITOR',
      branch_assignments: [],
      primary_branch_id: null,
    });
    expect(created.status()).toBe(201);
  });
});
```

**Erratum (a35c09a, `test(fake-api): pin the invite rules the review found unpinned`):** the
need-a-branch case keeps Westlands as the primary branch (`{ ...BODY, branch_assignments: [] }`), so
only that rule fails; the BG-28 cases add a pending member (Amina) and a suspended one (Gladys); and
the auditor test becomes "lets an auditor or a system member in with no branch", which also invites
a SYSTEM member with no branch.

- [ ] **Step 2: Run** — form E on the spec: FAIL ("answers each invite rule failure with a 500,
      storing nothing (BG-07)": the first body is accepted with a 201); "lets an auditor in with no
      branch" passes (it is the control for the branch rule).

- [ ] **Step 3: Implement** — replace `e2e/fake-api/routes/invitations.mts` with this complete file.
      It is 6b's file plus three things: `internalError` and `NEED_A_BRANCH` after `invalidJson`,
      the `checkInviteRules` function before `invite()`, and its call in `invite()` right after
      `const existing = …`:

```ts
import { randomUUID } from 'node:crypto';
import { requireContext, requirePermission, requireTenantContext } from '../access.mts';
import type { AccessContext } from '../access.mts';
import { recordAuditEvent } from '../audit-log.mts';
import { UUID, objectBody, problem, readBody, stringField } from '../http.mts';
import type { Violation } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { route } from '../router.mts';
import type { Route } from '../router.mts';
import type { FakeMembership, FakeUser, RunState } from '../state.mts';

/** Contract §D: InviteUser. */
const INVITE_KEYS = [
  'email',
  'username',
  'display_name',
  'phone_e164',
  'membership_type',
  'primary_branch_id',
  'branch_assignments',
  'role_assignments',
  'send_keycloak_invite',
  'send_application_invite',
];
const MEMBERSHIP_TYPES = ['STAFF', 'ADMIN', 'AUDITOR', 'SYSTEM'];
const ASSIGNMENT_TYPES = ['HOME', 'OPERATE', 'APPROVE', 'VIEW'];
const SCOPE_TYPES = ['TENANT', 'BRANCH'];
const USERNAME = /^[a-zA-Z0-9._-]{3,50}$/;
const E164 = /^\+[1-9]\d{1,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const invalidJson = () => problem(400, 'invalid_json', 'Malformed request body.');
// BG-07: every invite rule failure falls through to the generic handler as a 500.
const internalError = () => problem(500, 'internal_error', 'An unexpected error occurred.');
const NEED_A_BRANCH = ['STAFF', 'ADMIN'];

interface BranchAssignmentInput {
  branchId: string;
  type: string;
}

interface RoleAssignmentInput {
  roleId: string;
  scopeType: string;
  branchId: string | null;
}

interface Invitation {
  email: string;
  username: string;
  displayName: string;
  membershipType: string;
  primaryBranchId: string | null;
  branches: BranchAssignmentInput[];
  roles: RoleAssignmentInput[];
}

/** A UUID field as the backend binds it: absent or `null` only where nullable, else invalid_json. */
function uuidField(body: Record<string, unknown>, key: string, nullable: boolean): string | null {
  const value = body[key];
  if ((value === undefined || value === null) && nullable) return null;
  if (typeof value !== 'string' || !UUID.test(value)) throw invalidJson();
  return value.toLowerCase();
}

/** A list of exact-key objects; nested element fields are non-null (contract §B), so a missing or
 * mistyped one is invalid_json. An absent or null list is `[]` (contract §D: "Missing = absent or
 * null"; the lists are `[]` if missing). */
function listField(body: Record<string, unknown>, key: string, keys: readonly string[]) {
  const value = body[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalidJson();
  return value.map((item) => objectBody(item, keys));
}

/** `send_keycloak_invite` and `send_application_invite`: absent takes the default; `null` or a
 * non-boolean doesn't bind (contract §D: "don't send null"). */
function flagField(body: Record<string, unknown>, key: string): void {
  const value = body[key];
  if (value !== undefined && typeof value !== 'boolean') throw invalidJson();
}

/** Binding (400 invalid_json), then bean validation (400 validation_failed), as InviteUserRequest. */
function readInvitation(body: Record<string, unknown>): Invitation {
  const email = stringField(body, 'email', { required: true }) ?? '';
  const username = stringField(body, 'username', { required: true }) ?? '';
  const displayName = stringField(body, 'display_name', { required: true }) ?? '';
  const phone = stringField(body, 'phone_e164', { required: false });
  const membershipType = stringField(body, 'membership_type', { required: true }) ?? '';
  if (!MEMBERSHIP_TYPES.includes(membershipType)) throw invalidJson();
  const primaryBranchId = uuidField(body, 'primary_branch_id', true);
  const branches = listField(body, 'branch_assignments', ['branch_id', 'assignment_type']).map(
    (item) => {
      const type = stringField(item, 'assignment_type', { required: true }) ?? '';
      if (!ASSIGNMENT_TYPES.includes(type)) throw invalidJson();
      return { branchId: uuidField(item, 'branch_id', false) ?? '', type };
    },
  );
  const roles = listField(body, 'role_assignments', ['role_id', 'scope_type', 'branch_id']).map(
    (item) => {
      const scopeType = stringField(item, 'scope_type', { required: true }) ?? '';
      if (!SCOPE_TYPES.includes(scopeType)) throw invalidJson();
      return {
        roleId: uuidField(item, 'role_id', false) ?? '',
        scopeType,
        branchId: uuidField(item, 'branch_id', true),
      };
    },
  );
  flagField(body, 'send_keycloak_invite');
  flagField(body, 'send_application_invite');

  const violations: Violation[] = [];
  const check = (valid: boolean, field: string, rule: string, message: string) => {
    if (!valid) violations.push({ field, code: rule, message });
  };
  check(EMAIL.test(email), 'email', 'Email', 'must be a well-formed email address');
  check(USERNAME.test(username), 'username', 'Pattern', 'must match "^[a-zA-Z0-9._-]{3,50}$"');
  check(
    displayName.trim().length >= 2 && displayName.length <= 100,
    'display_name',
    'Size',
    'size must be between 2 and 100',
  );
  check(phone === null || E164.test(phone), 'phone_e164', 'Pattern', 'must be E.164');
  if (violations.length > 0) {
    throw problem(400, 'validation_failed', 'Validation failed.', violations);
  }
  return { email, username, displayName, membershipType, primaryBranchId, branches, roles };
}

/** `user.assign_branch` at each invited branch (contract §E.3 "B"): a TENANT grant, or a BRANCH grant
 * while that branch is the selected one (§E.4). */
function requireAssignAt(access: AccessContext, branchIds: readonly string[]): void {
  for (const branchId of branchIds) {
    const held =
      access.tenantPermissions.has('user.assign_branch') ||
      (access.claims.branchId === branchId && access.permissions.has('user.assign_branch'));
    if (!held) throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
  }
}

const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Mirrors UserProvisioningService's invite rules (BG-07: each is a 500; contract §D, §E.3, §F):
 * STAFF and ADMIN need a branch; at least one role; every role ACTIVE; every branch (assigned and
 * primary) ACTIVE; TENANT scope without a branch, BRANCH scope with one of the assigned branches; no
 * membership of the email in this organisation, in any status (BG-28); a username taken by another
 * email. Runs inside `produce`, so a refusal stores nothing.
 */
function checkInviteRules(
  state: RunState,
  organisationId: string,
  input: Invitation,
  existing: FakeUser | undefined,
): void {
  const activeBranch = (id: string) =>
    state.branches.some(
      (branch) =>
        branch.id === id && branch.organisationId === organisationId && branch.status === 'ACTIVE',
    );
  const activeRole = (id: string) =>
    state.roles.some(
      (role) =>
        role.id === id && role.organisationId === organisationId && role.status === 'ACTIVE',
    );
  const assigned = new Set(input.branches.map((row) => row.branchId));
  if (input.roles.length === 0) throw internalError();
  if (NEED_A_BRANCH.includes(input.membershipType) && input.branches.length === 0) {
    throw internalError();
  }
  if (input.branches.some((row) => !activeBranch(row.branchId))) throw internalError();
  if (input.primaryBranchId !== null && !activeBranch(input.primaryBranchId)) throw internalError();
  for (const row of input.roles) {
    if (!activeRole(row.roleId)) throw internalError();
    const scopeMatches =
      row.scopeType === 'TENANT'
        ? row.branchId === null
        : row.branchId !== null && assigned.has(row.branchId);
    if (!scopeMatches) throw internalError();
  }
  if (
    existing &&
    state.memberships.some(
      (membership) =>
        membership.userId === existing.id && membership.organisationId === organisationId,
    )
  ) {
    throw internalError();
  }
  if (!existing && state.users.some((user) => sameText(user.username, input.username))) {
    throw internalError();
  }
}

/**
 * The invitation (contract §E.3): an email that already has an account anywhere reuses it (case
 * aside), and the entered name, username and phone are then ignored; otherwise a DRAFT user with no
 * identity link. The membership waits for approval, the assignments are ACTIVE, and `user.invite`
 * is audited on the USER (the maker lookup's source, contract §G).
 */
function invite(state: RunState, access: AccessContext, input: Invitation) {
  const organisationId = access.organisation.id;
  const existing = state.users.find((user) => sameText(user.email, input.email));
  checkInviteRules(state, organisationId, input, existing);

  const now = new Date().toISOString();
  let user: FakeUser;
  if (existing) {
    user = existing;
  } else {
    user = {
      id: randomUUID(),
      username: input.username,
      email: input.email,
      displayName: input.displayName.trim(),
      status: 'DRAFT',
      keycloakSubject: `e2e-${input.username}`,
      // A new account has no identity link: its approval queues provisioning (a 202).
      identityLinked: false,
    };
    state.users.push(user);
  }
  const membership: FakeMembership = {
    id: randomUUID(),
    organisationId,
    userId: user.id,
    status: 'PENDING_APPROVAL',
    type: input.membershipType,
    primaryBranchId: input.primaryBranchId,
    createdAt: now,
    updatedAt: now,
    invitedBy: access.claims.userId,
  };
  state.memberships.push(membership);
  for (const row of input.branches) {
    state.branchAssignments.push({
      id: randomUUID(),
      organisationId,
      userId: user.id,
      branchId: row.branchId,
      type: row.type,
      status: 'ACTIVE',
    });
  }
  for (const row of input.roles) {
    state.roleAssignments.push({
      id: randomUUID(),
      organisationId,
      userId: user.id,
      roleId: row.roleId,
      scopeType: row.scopeType === 'BRANCH' ? 'BRANCH' : 'TENANT',
      branchId: row.branchId,
      status: 'ACTIVE',
    });
  }
  recordAuditEvent(state, access, {
    entityType: 'USER',
    entityId: user.id,
    action: 'user.invite',
    reason: null,
  });
  return {
    user_id: user.id,
    membership_id: membership.id,
    user_status: user.status,
    membership_status: membership.status,
  };
}

export const invitationRoutes: Route[] = [
  route('POST', '/api/v1/tenant/users', async (context) => {
    const access = requireContext(context);
    requireTenantContext(access);
    requirePermission(access, 'user.invite');
    const body = objectBody(await readBody(context.req), INVITE_KEYS);
    const input = readInvitation(body);
    requireAssignAt(access, [...new Set(input.branches.map((row) => row.branchId))]);
    // Every rule runs inside `produce`, so a refusal stores nothing and a retry with the same key
    // runs again (contract §A); a success replays for the same key.
    sendIdempotent(context, body, () => invite(context.state, access, input), 201);
  }),
];
```

Run form P on the file.

- [ ] **Step 4: Run** — form E on `e2e/fake-api-invite.spec.ts`: PASS. Mutation proof: make the
      existing-membership check never apply (`false && existing && …`) ("answers each invite rule
      failure with a 500, storing nothing (BG-07)"); revert.

- [ ] **Step 5: Commit** (form C):

```
test(fake-api): refuse invitations the backend answers with a 500

The fake's invitation mirrors the backend's invite rules, each a 500 inside the idempotent produce,
so a refusal stores nothing (BG-07): no role, no branch for staff or admin, an inactive or foreign
role or branch, a scope that doesn't match the assigned branches, a membership of the email here in
any status (BG-28), a username another account holds with another email.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check` and form E on the fake specs.

### Task 7: End to end and the accessibility matrix

Two sub-tasks: **7a** (the behaviour) and **7b** (the accessibility matrix). The spec runs in chunks
of at most 8 minutes (rule 16; measured in the planner's worktree on one worker: the behaviour about
1.3 minutes, each accessibility chunk about 1.7 minutes):

```bash
<e2e wrapper> e2e/users-invite.spec.ts --grep "users invite: (entry|sending)"
<e2e wrapper> e2e/users-invite.spec.ts --grep "users invite: accessibility.*\(light"
<e2e wrapper> e2e/users-invite.spec.ts --grep "users invite: accessibility.*\(dark"
```

#### Task 7a: The behaviour

**Files:**

- Create: `e2e/users-invite.spec.ts` (Task 7b replaces it with the matrix added)

**Interfaces:**

- Consumes: `enterAdmin`, `mainText`, `statusChip` (`e2e/support/admin.ts`); `authenticate`,
  `expectHydrated` (`e2e/support/auth.ts`); `INVITE_SCENARIO_TEXT`, `ScenarioName`; 16's
  `focusClearance` and `expectFocusStopsClearTheBars`, copied verbatim from
  `e2e/platform-tenants.spec.ts` (16 keeps them in its spec, not in support).
- Produces: the describes `users invite: entry and identity` and `users invite: sending` (90 s
  each); `sending` ends with the WCAG 2.4.11 keyboard walk at 1440 × 900 and 375 × 812: Access with
  three branch rows and three role rows (at least 10 stops), then Review's Edit buttons (at least
  3).

- [ ] **Step 1: Write the spec** — `e2e/users-invite.spec.ts`:

```ts
import { expect, test, type Locator, type Page } from '@playwright/test';
import { enterAdmin, mainText, statusChip } from './support/admin';
import { authenticate, expectHydrated } from './support/auth';
import { INVITE_SCENARIO_TEXT as TEXT, type ScenarioName } from './fake-api/scenarios.mts';

const ALL_BRANCHES = /All branches \(institution level\)/;

// The app's copy, repeated here: Playwright can't resolve the app's `@/` imports. Each string is
// asserted verbatim, so a reworded message fails here.
const INVITE_FORBIDDEN =
  'Inviting someone needs permission to invite users and assign branches, and to view users, roles and branches. Ask an administrator if you need access.';
const ACTIVE_EMAIL = 'This email already belongs to a member of this institution.';
const REVOKED_EMAIL =
  "This email's membership here was revoked, so it can't be invited to this institution again.";
const NEEDS_A_BRANCH = 'Add a branch: staff and admin members need at least one.';
const ROLE_BRANCH_UNASSIGNED = 'Assign them to this branch under Branch assignments first.';
const INVITE_FAILED =
  "The platform couldn't create this invitation. The username may already belong to another account, here or in another institution, or a role or branch may have changed since this page loaded. Check them, then try again.";
const REVIEW_NOTE =
  'Sending creates the invitation now. A different administrator must approve it before they can use this institution. If this email already has a Finaxis account, that account is reused: its name, username and phone stay as they are.';
const USER_MAKER_CHECKER_BLOCKED =
  'You invited this user, so another administrator must approve them.';

const RECORD = /\/admin\/users\/[0-9a-f-]{36}$/;

interface Identity {
  name: string;
  email: string;
  username: string;
}

const NEEMA: Identity = {
  name: 'Neema Wanjiku',
  email: 'neema.wanjiku@greenfield.example',
  username: 'neema.wanjiku',
};

/** The wizard as the first navigation of a test: through context selection. */
async function openWizard(page: Page) {
  await enterAdmin(page, '/admin/users/new', { heading: 'Invite user', branch: ALL_BRANCHES });
  await expectHydrated(page.getByRole('button', { name: 'Continue' }));
}

/** A select inside `scope` (a row's group, or the page), once React owns it. */
async function choose(page: Page, scope: Page | Locator, label: string, option: string) {
  const combobox = scope.getByRole('combobox', { name: label, exact: true });
  await expectHydrated(combobox);
  await combobox.click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

const group = (page: Page, name: string) => page.getByRole('group', { name, exact: true });

/** Continue, then wait for the next step's heading (the email check is a request away). */
async function next(page: Page, step: string) {
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { level: 2, name: step })).toBeVisible({
    timeout: 15000,
  });
}

async function fillIdentity(page: Page, identity: Identity = NEEMA) {
  await page.getByRole('textbox', { name: 'Full name' }).fill(identity.name);
  await page.getByRole('textbox', { name: 'Email' }).fill(identity.email);
  await page.getByRole('textbox', { name: 'Username' }).fill(identity.username);
  await choose(page, page, 'Membership type', 'Staff');
}

/** Westlands as their home branch, and the Teller role everywhere. */
async function fillAccess(page: Page) {
  await choose(page, group(page, 'Branch assignment 1'), 'Branch', 'Westlands Branch (WESTLANDS)');
  await choose(page, group(page, 'Role 1'), 'Role', 'Teller (TELLER)');
}

async function sendInvitation(page: Page) {
  await page.getByRole('button', { name: 'Send invitation' }).click();
}

// 16's two keyboard helpers (`e2e/platform-tenants.spec.ts`), kept in the spec as 16 keeps them.

/** The focused control's room above the wizard's sticky action bar and below the sticky app bar. A
 * control closer than 0 is under a bar and, for keyboard users, hidden (WCAG 2.4.11). */
async function focusClearance(page: Page) {
  // A frame after the key press: the browser has scrolled the focused control into view.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  return page.evaluate(() => {
    const focused = document.activeElement;
    const actionBar = document.querySelector('form button[type="submit"]')?.parentElement;
    const form = actionBar?.closest('form');
    const appBar = document.querySelector('header');
    if (!focused || !actionBar || !form || !appBar) return null;
    const rect = focused.getBoundingClientRect();
    const labelled = focused as HTMLInputElement;
    return {
      name:
        focused.getAttribute('aria-label') ??
        labelled.labels?.[0]?.textContent ??
        focused.textContent.trim().slice(0, 40),
      inForm: form.contains(focused),
      inActionBar: actionBar.contains(focused),
      belowAppBar: rect.top - appBar.getBoundingClientRect().bottom,
      aboveActionBar: actionBar.getBoundingClientRect().top - rect.bottom,
    };
  });
}

/** Tabs from a step's heading to the action bar, then Shift+Tabs back out of the form: every stop
 * clears both sticky bars, and the walk covers at least `minimum` stops. */
async function expectFocusStopsClearTheBars(page: Page, step: string, minimum: number) {
  await page.getByRole('heading', { level: 2, name: step }).focus();
  let stops = 0;
  for (let press = 0; press < 25; press++) {
    await page.keyboard.press('Tab');
    const stop = await focusClearance(page);
    if (!stop?.inForm || stop.inActionBar) break;
    stops++;
    expect(
      stop.aboveActionBar,
      `Tab stop "${stop.name}" is under the action bar`,
    ).toBeGreaterThanOrEqual(0);
  }
  expect(stops).toBeGreaterThanOrEqual(minimum);

  // Backwards, out of the form: the shell's app bar must not cover a stop either.
  for (let press = 0; press < 40; press++) {
    await page.keyboard.press('Shift+Tab');
    const stop = await focusClearance(page);
    if (!stop?.inForm) break;
    if (stop.inActionBar) continue;
    expect(
      stop.belowAppBar,
      `Shift+Tab stop "${stop.name}" is under the app bar`,
    ).toBeGreaterThanOrEqual(0);
  }
}

test.describe('users invite: entry and identity', () => {
  // Each test signs in, selects a context and can be the first hit of a route tree under a cold
  // `next dev` compile (users.spec.ts uses the same budget).
  test.describe.configure({ timeout: 90000 });

  test('opens the wizard from the directory', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'users-invite');
    await enterAdmin(page, '/admin/users', { heading: 'Users & access', branch: ALL_BRANCHES });

    await page.getByRole('link', { name: 'Invite user' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Invite user' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('heading', { level: 2, name: 'Identity' })).toBeVisible();
    await expect(page.getByRole('form', { name: 'Invite user' }).getByRole('listitem')).toHaveCount(
      4,
    );
  });

  for (const scenario of [
    'users',
    'users-invite-limited',
  ] as const satisfies readonly ScenarioName[]) {
    test(`offers no invitation without every code it needs (${scenario})`, async ({
      context,
      page,
    }, testInfo) => {
      await authenticate(context, testInfo, scenario);
      await enterAdmin(page, '/admin/users', { heading: 'Users & access', branch: ALL_BRANCHES });
      await expect(page.getByRole('link', { name: 'Invite user' })).toHaveCount(0);

      await page.goto('/admin/users/new');
      await expect(mainText(page, INVITE_FORBIDDEN)).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
    });
  }

  test('keeps an email already in use here on the Identity step, before anything is sent', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users-invite');
    await openWizard(page);
    const email = page.getByRole('textbox', { name: 'Email' });

    // Esther is an ACTIVE member.
    await fillIdentity(page, { ...NEEMA, email: 'esther.njoki@greenfield.example' });
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(email).toHaveAccessibleDescription(ACTIVE_EMAIL, { timeout: 15000 });
    await expect(email).toBeFocused();
    await expect(mainText(page, 'Check these fields: Email.')).toBeVisible();

    // Hassan's membership was revoked: his email can never come back (BG-28). Letter case aside.
    await email.fill('Hassan.Ali@greenfield.example');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(email).toHaveAccessibleDescription(REVOKED_EMAIL, { timeout: 15000 });
    await expect(page.getByRole('heading', { level: 2, name: 'Identity' })).toBeVisible();

    await email.fill(NEEMA.email);
    await next(page, 'Access');
  });
});

test.describe('users invite: sending', () => {
  test.describe.configure({ timeout: 90000 });

  test('refuses what the platform would answer with a 500, before sending (BG-07)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users-invite');
    await openWizard(page);
    await fillIdentity(page);
    await next(page, 'Access');

    // Only ACTIVE roles and branches are offered: no Loans officer (DISABLED), no Kisumu (pending).
    const roleRow = group(page, 'Role 1');
    await roleRow.getByRole('combobox', { name: 'Role', exact: true }).click();
    await expect(page.getByRole('option')).toHaveText([
      'Branch supervisor (SUPERVISOR)',
      'Teller (TELLER)',
      'Tenant admin (TENANT_ADMIN)',
    ]);
    await page.keyboard.press('Escape');
    const branchRow = group(page, 'Branch assignment 1');
    await branchRow.getByRole('combobox', { name: 'Branch', exact: true }).click();
    await expect(page.getByRole('option')).toHaveText([
      'Head Office (HEAD_OFFICE)',
      'Westlands Branch (WESTLANDS)',
    ]);
    await page.keyboard.press('Escape');

    // A staff member with no branch.
    await page.getByRole('button', { name: 'Remove branch assignment 1' }).click();
    await choose(page, roleRow, 'Role', 'Branch supervisor (SUPERVISOR)');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(mainText(page, NEEDS_A_BRANCH)).toBeVisible();

    // A branch-scoped role at a branch they aren't assigned to.
    await page.getByRole('button', { name: 'Add branch' }).click();
    const added = group(page, 'Branch assignment 1');
    await choose(page, added, 'Branch', 'Westlands Branch (WESTLANDS)');
    await choose(page, roleRow, 'Scope', 'One branch');
    await choose(page, roleRow, 'Branch', 'Westlands Branch (WESTLANDS)');
    await choose(page, added, 'Branch', 'Head Office (HEAD_OFFICE)');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      roleRow.getByRole('combobox', { name: 'Branch', exact: true }),
    ).toHaveAccessibleDescription(ROLE_BRANCH_UNASSIGNED);
    await expect(page.getByRole('heading', { level: 2, name: 'Access' })).toBeVisible();
  });

  test('invites a new staff member and opens their record, awaiting another administrator', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users-invite');
    await openWizard(page);
    await fillIdentity(page);
    await next(page, 'Access');
    await fillAccess(page);
    await page.getByRole('button', { name: 'Add role' }).click();
    const second = group(page, 'Role 2');
    await choose(page, second, 'Role', 'Branch supervisor (SUPERVISOR)');
    await choose(page, second, 'Scope', 'One branch');
    await choose(page, second, 'Branch', 'Westlands Branch (WESTLANDS)');
    await choose(page, page, 'Primary branch', 'Westlands Branch (WESTLANDS)');
    await next(page, 'Invitation');
    await expect(
      page.getByRole('checkbox', { name: 'Send the identity-provider invitation' }),
    ).toBeChecked();
    await next(page, 'Review');

    const access = page.getByRole('region', { name: 'Access', exact: true });
    await expect(access).toContainText('Westlands Branch (WESTLANDS) · Home');
    await expect(access).toContainText(
      'Branch supervisor (SUPERVISOR) · Westlands Branch (WESTLANDS)',
    );
    await expect(page.getByRole('note')).toHaveText(REVIEW_NOTE);
    await sendInvitation(page);

    await expect(page).toHaveURL(RECORD, { timeout: 15000 });
    await expect(page.getByRole('heading', { level: 1, name: NEEMA.name })).toBeVisible();
    await expect(statusChip(page, 'Awaiting approval')).toBeVisible();
    // Jane invited her, so the platform would refuse Jane's approval (BG-02, BG-08).
    const approve = page.getByRole('button', { name: 'Approve', exact: true });
    await expect(approve).toBeDisabled();
    await expect(approve).toHaveAccessibleDescription(USER_MAKER_CHECKER_BLOCKED);
  });

  test('keeps every answer after a refusal it can’t check, and sends again safely', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users-invite');
    await openWizard(page);
    // Otieno's username belongs to an account in another institution (a 500, BG-07).
    await fillIdentity(page, { ...NEEMA, username: TEXT.takenUsername });
    await next(page, 'Access');
    await fillAccess(page);
    await next(page, 'Invitation');
    await next(page, 'Review');
    await sendInvitation(page);

    await expect(mainText(page, INVITE_FAILED)).toBeVisible({ timeout: 15000 });
    await expect(mainText(page, /Reference: [0-9a-f-]{36}/)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Access', exact: true })).toContainText(
      'Teller (TELLER) · Institution (all branches)',
    );

    await page.getByRole('button', { name: 'Edit identity' }).click();
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue(NEEMA.email);
    await page.getByRole('textbox', { name: 'Username' }).fill(NEEMA.username);
    await next(page, 'Access');
    await next(page, 'Invitation');
    await next(page, 'Review');
    await sendInvitation(page);
    await expect(page).toHaveURL(RECORD, { timeout: 15000 });
    await expect(page.getByRole('heading', { level: 1, name: NEEMA.name })).toBeVisible();
  });

  test('reuses an account another institution has, keeping its own name', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users-invite');
    await openWizard(page);
    await fillIdentity(page, { name: 'Rehema W.', email: TEXT.rehemaEmail, username: 'rehema.w' });
    await next(page, 'Access');
    await fillAccess(page);
    await next(page, 'Invitation');
    await next(page, 'Review');
    await sendInvitation(page);

    await expect(page).toHaveURL(RECORD, { timeout: 15000 });
    await expect(page.getByRole('heading', { level: 1, name: TEXT.rehemaName })).toBeVisible();
  });

  // WCAG 2.4.11: the wizard's sticky action bar (and the shell's app bar, going backwards) must not
  // cover the control that has keyboard focus. axe can't see this; the Access step is the longest
  // form here, so it is walked with three rows of each.
  for (const viewport of [
    { label: 'desktop', width: 1440, height: 900 },
    { label: '375px', width: 375, height: 812 },
  ]) {
    test(`keeps keyboard focus clear of the sticky bars on Access and Review (${viewport.label})`, async ({
      context,
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await authenticate(context, testInfo, 'users-invite');
      await openWizard(page);
      await fillIdentity(page);
      await next(page, 'Access');
      for (const add of ['Add branch', 'Add branch', 'Add role', 'Add role']) {
        await page.getByRole('button', { name: add }).click();
      }

      // Three rows of each: their fields, their Remove buttons and the two Add buttons.
      await expectFocusStopsClearTheBars(page, 'Access', 10);

      for (const remove of [
        'Remove role 3',
        'Remove role 2',
        'Remove branch assignment 3',
        'Remove branch assignment 2',
      ]) {
        await page.getByRole('button', { name: remove }).click();
      }
      await fillAccess(page);
      await next(page, 'Invitation');
      await next(page, 'Review');

      // The three Edit buttons.
      await expectFocusStopsClearTheBars(page, 'Review', 3);
    });
  }
});
```

**Erratum (30c2c91, `test(e2e): cover the invite wizard end to end`; 58fa995, `test(e2e): prove the
bell refresh and bound only the first hits on the invite wizard`):** the waits for a route's first
hit are `FIRST_HIT` (45 s), not the plan's 15 s, and 58fa995 narrowed them to the first hits: the
directory's link to the wizard, each test's first visit to the wizard (`openWizard`, inline in 58fa995),
the forbidden gate's first load, the Identity-to-Access steps (their `next(page, step, timeout)` takes
FIRST_HIT from the caller) and the first email description. The
shell's bell is asserted at 3 approvals before a send and at 4 once the new member's record opens
(`bell(page, count)`), which proves the `refresh()` before the redirect in a browser.

**Erratum (d865a0c, `test(e2e): bound every first hit of the invite wizard's matrix and record
visits`):** d865a0c renamed the bound 58fa995 gave the wizard's first visit into `enterFirstHit` (any
path and heading; `openWizard` now calls it) and generalised it to the matrix's surfaces, whose first
visits had enterAdmin's 15 s waits. It did not add the first-visit bound itself. The three waits for
the record a send opens (`toHaveURL(RECORD)`) take FIRST_HIT.

**Erratum (280f4b4, `test(e2e): click MUI options only after their menu stops growing in`; 1745353,
`test(e2e): bound clickMuiOption's waits and correct its notes`):** `choose()` clicks through
`clickMuiOption` and asserts the combobox shows the choice. `clickMuiOption` is new in
`e2e/support/auth.ts` (`selectMuiOption` uses it too), an exception to "Files 11 never touches"
(line 225), which names `e2e/support/*`. It waits at most 5 s for the running animations, and a
failure names the menu and the option.

**Erratum (ae1aac8, `test(confirm-dialog): drive each failed submit inside an awaited act()`; 5f8f1cb,
`chore(deps): upgrade the minor and patch dependencies`):** two kit test files change outside "Files 11
never touches" (line 225), which names every kit file: `components/data-display/confirm-dialog.test.tsx`
(an awaited `act()` in one test, no behaviour change) and `components/data-display/record-tabs.test.tsx`
(the dependency upgrade's MUI 9.5 scroller observer, in the test's ResizeObserver fake).

- [ ] **Step 2: Run** — form E with `--grep "users invite: (entry|sending)"`: PASS (ten tests; the
      code under test is Tasks 1–6). Mutation proof: in `invite-user-wizard.tsx` replace the email
      check in `continueFromIdentity` with `goTo(ACCESS)`; the test "keeps an email already in use
      here on the Identity step, before anything is sent" must fail; revert.

- [ ] **Step 3: Commit** (form C):

```
test(e2e): cover the invite wizard end to end

The directory offers Invite user only with every code it needs; an email already in use here stays
on the Identity step (an active member, a revoked one in any letter case); the Access step refuses a
staff member with no branch and a role at a branch they aren't assigned to, and offers no inactive
role or branch; an invitation opens the new user's record awaiting another administrator; a 500 the
wizard can't check keeps every answer and a corrected send succeeds; an account from another
institution is reused with its own name. Keyboard focus stays clear of both sticky bars on Access,
with three rows of each, and on Review, at 1440 and 375 px (WCAG 2.4.11, 16's walk).

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check` and the behaviour chunk.

#### Task 7b: The accessibility matrix

**Files:**

- Modify: `e2e/users-invite.spec.ts` (the `./support/admin` import, and an appended block)

**Interfaces:**

- Consumes: 7a; `A11Y_CASES`, `applyA11yCase`, `expectA11yCaseApplied`,
  `expectNoSeriousOrCriticalViolations` (`e2e/support/admin.ts`).
- Produces: the describe `users invite: accessibility` (60 s): eight surfaces (the directory with
  the button, Identity with its errors, Access with a one-branch role and its errors, Invitation,
  Review, Identity with an email in use, Review after a refused send with its reference, the
  forbidden page) × light and dark × 1280 and 375 px = 32 tests, sixteen per `--grep` chunk.

- [ ] **Step 1: Write the spec** — in `e2e/users-invite.spec.ts`, replace the line
      `import { enterAdmin, mainText, statusChip } from './support/admin';` with:

```ts
import {
  A11Y_CASES,
  applyA11yCase,
  enterAdmin,
  expectA11yCaseApplied,
  expectNoSeriousOrCriticalViolations,
  mainText,
  statusChip,
} from './support/admin';
```

Then append this block at the end of the file, after a blank line:

```ts
interface Surface {
  label: string;
  scenario: ScenarioName;
  path: string;
  heading: string;
  /** Brings the page to the state the scan covers. */
  open?: (page: Page) => Promise<void>;
}

const SURFACES: readonly Surface[] = [
  {
    label: 'the directory',
    scenario: 'users-invite',
    path: '/admin/users',
    heading: 'Users & access',
  },
  {
    label: 'identity with errors',
    scenario: 'users-invite',
    path: '/admin/users/new',
    heading: 'Invite user',
    open: async (page) => {
      await expectHydrated(page.getByRole('button', { name: 'Continue' }));
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(mainText(page, /^Check these fields/)).toBeVisible();
    },
  },
  {
    label: 'access with errors',
    scenario: 'users-invite',
    path: '/admin/users/new',
    heading: 'Invite user',
    open: async (page) => {
      await fillIdentity(page);
      await next(page, 'Access');
      await choose(
        page,
        group(page, 'Branch assignment 1'),
        'Branch',
        'Westlands Branch (WESTLANDS)',
      );
      await choose(page, group(page, 'Role 1'), 'Scope', 'One branch');
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(mainText(page, 'Check these fields: Roles.')).toBeVisible();
    },
  },
  {
    label: 'invitation',
    scenario: 'users-invite',
    path: '/admin/users/new',
    heading: 'Invite user',
    open: async (page) => {
      await fillIdentity(page);
      await next(page, 'Access');
      await fillAccess(page);
      await next(page, 'Invitation');
    },
  },
  {
    label: 'review',
    scenario: 'users-invite',
    path: '/admin/users/new',
    heading: 'Invite user',
    open: async (page) => {
      await fillIdentity(page);
      await next(page, 'Access');
      await fillAccess(page);
      await next(page, 'Invitation');
      await next(page, 'Review');
    },
  },
  {
    label: 'identity with an email in use',
    scenario: 'users-invite',
    path: '/admin/users/new',
    heading: 'Invite user',
    open: async (page) => {
      await fillIdentity(page, { ...NEEMA, email: 'esther.njoki@greenfield.example' });
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(mainText(page, ACTIVE_EMAIL)).toBeVisible({ timeout: 15000 });
    },
  },
  {
    label: 'review after a refused send',
    scenario: 'users-invite',
    path: '/admin/users/new',
    heading: 'Invite user',
    open: async (page) => {
      await fillIdentity(page, { ...NEEMA, username: TEXT.takenUsername });
      await next(page, 'Access');
      await fillAccess(page);
      await next(page, 'Invitation');
      await next(page, 'Review');
      await sendInvitation(page);
      await expect(mainText(page, INVITE_FAILED)).toBeVisible({ timeout: 15000 });
    },
  },
  {
    label: 'the forbidden page',
    scenario: 'users-invite-limited',
    path: '/admin/users/new',
    heading: 'Invite user',
  },
];

// The describe's title is what the two --grep chunks select on ("users invite: accessibility .*\(light"
// and "…\(dark"): the grep text is the project, file, describe and test titles joined by spaces.
test.describe('users invite: accessibility', () => {
  test.describe.configure({ timeout: 60000 });

  for (const surface of SURFACES) {
    for (const a11yCase of A11Y_CASES) {
      test(`has no serious or critical violations: ${surface.label} (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
        context,
        page,
      }, testInfo) => {
        await applyA11yCase(page, a11yCase);
        await authenticate(context, testInfo, surface.scenario);
        await enterAdmin(page, surface.path, { heading: surface.heading, branch: ALL_BRANCHES });
        if (surface.open) await surface.open(page);
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);
      });
    }
  }
});
```

**Erratum (d865a0c, `test(e2e): bound every first hit of the invite wizard's matrix and record
visits`):** each surface's first visit opens through `enterFirstHit` (FIRST_HIT bounds) instead of
`enterAdmin`, and the matrix's Identity-to-Access steps and its email-in-use wait take FIRST_HIT
(the first hits, see Task 7a).

- [ ] **Step 2: Run** — form E, the two accessibility chunks: PASS (sixteen each); then the
      behaviour chunk again: PASS.

- [ ] **Step 3: Commit** (form C):

```
test(e2e): add the invite wizard's accessibility matrix

Eight surfaces in light and dark at 1280 and 375 px: the directory with Invite user, the Identity
step with its errors and with an email already in use, the Access step with a one-branch role and
its errors, the Invitation and Review steps, a refused send with its reference, and the forbidden
page. No serious or critical axe violation, and no horizontal page scroll at 375 px.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check` and the three chunks.

### Task 8: The docs

**Files:**

- Modify: `README.md` (the module tree, the API routes, the Users & access paragraph and its
  limits, the "not connected yet" bullet, the next steps)
- Modify: `AGENTS.md` (the eighth named paging exception)
- Modify: `docs/backend-gaps.md` (BG-07, BG-17, BG-25 and BG-28's frontend handling)
- Modify: `docs/superpowers/plans/2026-09-25-admin-parity-00-index.md` (layer 11's branch name)

**Interfaces:** none (docs).

- [ ] **Step 1: Edit** — each replacement below matches exactly one place in its file, as whole
      lines: it starts at the beginning of a line and ends at the end of one (the text between the
      fences; the fences are not part of it).

**Edit 1.** In `docs/backend-gaps.md`, replace:

```text
- **Frontend handling:** pre-validation of every known trigger (e.g. membership lookup by email before
  inviting, sort allow-lists), a tenant-code lookup after a failed create to name a duplicate (the
  create goes first, so a replayed create is never turned away), and a generic error showing
  `request_id`. The user record withholds Approve once approval ran and names the likely causes of
  the other approval 500s.
```

with:

```text
- **Frontend handling:** pre-validation of every known trigger (e.g. the invite wizard checks the
  email against the institution's users on its Identity step and every rule it can see on its Access
  step; sort allow-lists), a tenant-code lookup after a failed create to name a duplicate (the
  create goes first, so a replayed create is never turned away; the invitation likewise names a
  taken email, or a username a member here holds, only after a failed post), and a generic error
  showing `request_id`. A username taken by an account in another institution can't be checked from
  the tenant context, so the invitation's 500 names it among the likely causes. The user record
  withholds Approve once approval ran and names the likely causes of the other approval 500s.
```

**Edit 2.** In `docs/backend-gaps.md`, replace:

```text
- **Frontend handling:** columns and tabs omitted; Security links to the Keycloak account console for
  the signed-in user.
```

with:

```text
- **Frontend handling:** columns and tabs omitted; Security links to the Keycloak account console for
  the signed-in user. The invite wizard collects an optional phone and says it can't be viewed after
  the invitation is sent.
```

**Edit 3.** In `docs/backend-gaps.md`, replace:

```text
`VERIFY_EMAIL` only — no `UPDATE_PASSWORD`, lifespan, or redirect. Suggested: include `UPDATE_PASSWORD`
and a redirect to the app, and surface delivery failures (see BG-11).
```

with:

```text
`VERIFY_EMAIL` only — no `UPDATE_PASSWORD`, lifespan, or redirect. The invite wizard keeps the
contract's defaults (identity-provider invitation on, application invitation off) and says that
delivery depends on the platform and a failed delivery isn't shown. Suggested: include
`UPDATE_PASSWORD` and a redirect to the app, and surface delivery failures (see BG-11).
```

**Edit 4.** In `docs/backend-gaps.md`, replace:

```text
membership). The UI warns before both. Suggested: allow re-invitation of revoked members and
reuse/release of rejected codes.
```

with:

```text
membership). The UI warns before both, and the invite wizard refuses a revoked member's email on its
Identity step, saying it can't be invited again. Suggested: allow re-invitation of revoked members
and reuse/release of rejected codes.
```

**Edit 5.** In `AGENTS.md`, replace:

```text
  rest — no licence for an unbounded list (plan
  `docs/superpowers/plans/2026-10-04-admin-parity-12-approvals.md`, Ruling 8).
```

with:

```text
  rest — no licence for an unbounded list (plan
  `docs/superpowers/plans/2026-10-04-admin-parity-12-approvals.md`, Ruling 8).
  The Invite user wizard's pickers (`app/(authenticated)/admin/users/new/page.tsx`: one page of 100
  ACTIVE roles and one of 100 ACTIVE branches, by name, each saying so when there are more) are an
  eighth, named exception: a picker's option set, not a data-listing directory — no licence for an
  unbounded list (plan `docs/superpowers/plans/2026-10-12-admin-parity-11-invite-wizard.md`,
  Ruling 10).
```

**Edit 6.** In `README.md`, replace:

```text
│   │   └── users/               # Users & access: directory (search, user and membership status
│   │                              # filters), and the record ([userId]/: hero membership
│   │                              # lifecycle; Overview, Roles & access, Branch assignments and
│   │                              # Audit tabs)
```

with:

```text
│   │   └── users/               # Users & access: directory (search, user and membership status
│   │                              # filters), the Invite user wizard (new/), and the record
│   │                              # ([userId]/: hero membership lifecycle; Overview, Roles &
│   │                              # access, Branch assignments and Audit tabs)
```

**Edit 7.** In `README.md`, replace:

```text
├── api/tenant/users/          # Same-origin user search for UserPicker (first page only)
```

with:

```text
├── api/tenant/users/          # Same-origin user search for UserPicker (first page only), and the
│                                # Invite user wizard's email check (invite-check/)
```

**Edit 8.** In `README.md`, replace:

```text
│                                # users and membership contract, directory query, onboarding and
│                                # action rules, service, membership Server Actions, user search
│                                # for pickers, and components (modules/administration/users/);
```

with:

```text
│                                # users and membership contract, directory query, onboarding and
│                                # action rules, service, membership Server Actions, user search
│                                # for pickers, the Invite user wizard's rules, schema, email
│                                # check and Server Action, and components
│                                # (modules/administration/users/);
```

**Edit 9.** In `README.md`, replace:

```text
  suspend, reactivate, revoke) and Overview, Roles & access, Branch assignments and Audit tabs.
  The Audit tab offers up to four views: User record, Account, Membership (once the membership
  is found) and Performed by. Known limits:
```

with:

```text
  suspend, reactivate, revoke) and Overview, Roles & access, Branch assignments and Audit tabs.
  The Audit tab offers up to four views: User record, Account, Membership (once the membership
  is found) and Performed by. "Invite user" (`/admin/users/new`) is a four-step wizard
  (Identity, Access, Invitation, Review), offered with `user.invite`, `user.assign_branch` and the
  user, role and branch views; it posts one invitation and opens the new user's record, which
  waits for a different administrator's approval. Known limits:
```

**Edit 10.** In `README.md`, replace:

```text
  - The toolbar search commits on Enter or blur, and backend `validation_failed` violations
    aren't mapped onto form fields (BG-09).
```

with:

```text
  - The toolbar search commits on Enter or blur, and backend `validation_failed` violations
    aren't mapped onto form fields (BG-09).
  - The invite wizard offers the first 100 active roles and the first 100 active branches by
    name, and says so when there are more. Its Identity step checks the email against this
    institution's users (any membership, a revoked one included: such an email can never be
    invited again, BG-28); a 403 from that check asks for a reload (a stale context, or a
    branch-scoped `user.view`, BG-33). The invitation itself is posted first, and a taken email,
    or a username a member here holds, is named only after that fails, so a retry with the same
    idempotency key replays (BG-07). An account in another institution can't be seen: its email is
    reused with its own name, username and phone, which the Review step says, and a username it
    holds fails as a 500 named by its likely causes.
  - The invitation flags keep the contract's defaults; whether the emails go out depends on the
    platform (BG-25). The phone can't be viewed afterwards (BG-17). Nothing is kept across a
    reload.
```

**Edit 11.** In `README.md`, replace:

```text
- Beyond context discovery/selection, profile retrieval, Platform Administration's institutions,
  overview, institution branches and users, and platform users, and Administration's Approval
  queue, Users & access, Branches, Roles & permissions and Settings above, these are not connected
  yet: the Invite user wizard (layer 11) and the Administration overview's operational sections
  (layer 14).
```

with:

```text
- Beyond context discovery/selection, profile retrieval, Platform Administration's institutions,
  overview, institution branches and users, and platform users, and Administration's Approval
  queue, Users & access (with the Invite user wizard), Branches, Roles & permissions and Settings
  above, the Administration overview's operational sections (layer 14) are not connected yet.
```

**Edit 12.** In `README.md`, replace:

```text
2. Build out the Invite user wizard (layer 11) against real data, registering what it needs.
3. Replace the temporary `FinaxisLogo` mark with the official brand asset.
4. Expand the theme's component defaults only as real screens demand them.
```

with:

```text
2. Replace the temporary `FinaxisLogo` mark with the official brand asset.
3. Expand the theme's component defaults only as real screens demand them.
```

**Edit 13.** In `docs/superpowers/plans/2026-09-25-admin-parity-00-index.md`, replace:

```text
| 11  | `admin-parity/11-users-invite`     | just-in-time from spec §10.5                                      | JIT    |
```

with:

```text
| 11  | `admin-parity/11-invite-wizard`    | just-in-time from spec §10.5                                      | JIT    |
```

- [ ] **Step 2: Check** — `pnpm exec prettier --check README.md AGENTS.md docs/backend-gaps.md
docs/superpowers/plans/2026-09-25-admin-parity-00-index.md`: clean. Read the four diffs once:
      every claim matches the code of Tasks 1–6 (the five codes, the first 100 by name, the email
      checked on Identity and a 403 there asking for a reload, a taken email or a username held
      here named after a failed post, the reused account, the flags' defaults, the phone).

- [ ] **Step 3: Commit** (form C):

```
docs(users): describe the Invite user wizard

README: the wizard's route, its module files, the email check route, and its limits (the first 100
active roles and branches, the email check and its reload on a 403, the post-first naming of a
taken email or a username held here, an account elsewhere reused, a username taken elsewhere, the
flags, the phone). AGENTS.md records the wizard's pickers as the eighth named paging exception. The
backend gaps BG-07, BG-17, BG-25 and BG-28 say how the wizard handles them. The plan index names
layer 11's branch admin-parity/11-invite-wizard, as the plan does.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

## Layer gate (the controller's; not a task)

1. **Static and unit:** `pnpm check` (format, lint, `tsc`, the full Vitest run) and `pnpm build` on
   the layer's last commit; both clean (`/admin/users/new` and `/api/tenant/users/invite-check` in
   the route table). `git status` clean.
2. **E2E:** the full Playwright suite through the wrapper in chunks of at most 8 minutes (every
   spec, not only 11's: the users directory reads the profile now, and the fake API has a new
   route). All green; no retries needed on a second run.
3. **Visual and keyboard pass** (a person or the controller with a real browser), separately at
   **1440 px** and **375 px**, light and dark, in `users-invite` unless named:
   - the directory with "Invite user" beside the h1 (and without it in `users`);
   - Identity: the error summary and every field's error, the email in use (Esther, then Hassan),
     the failed-check alert (stop the fake API's process briefly, or block the route in the
     browser's tools);
   - Access: three branch rows and three role rows, one of them one-branch with its Branch field;
     the Remove buttons line up under the field labels from `sm`, and stack at 375 px with no
     horizontal scroll; "One branch" disabled with the reason before any branch is chosen; the
     Stepper's two-column grid at 375 px;
   - Invitation: the two flags and the note; Review: the three cards with Edit and the note, a
     long name and email wrapping inside their cards;
   - after sending: the record's "Awaiting approval" chip and Approve disabled with its caption;
     the forbidden page in `users-invite-limited`;
   - keyboard only: Tab walks every field, Remove and Add in order; no focused control sits under
     the sticky action bar or the app bar on the Access step (WCAG 2.4.11: `WizardForm`'s 96 px
     scroll padding; 7a's walk pins it at 1440 and 375 px, and this pass looks at it once by
     eye); Add focuses the new row's first field and Remove returns focus to Add; a step change
     focuses the step's heading; a failed send focuses the alert or the refused field; the email
     check's refusal (a 403: block the route's answer with 403 in the browser's tools) reads "…
     Reload the page…", never "try again".
4. **Extra axe scans** (beyond 7b's matrix, which covers the email-in-use state and a refused
   send) on the failed-check alert and the capped notes (`ROLES_CAPPED`/`BRANCHES_CAPPED`: 101 roles
   in a hand-seeded run), light and dark: no serious or critical violation.
5. **Docs:** README, AGENTS.md and `docs/backend-gaps.md` match what shipped; the plan's ruling
   table records the user's answers.
6. **Squash** the layer's commits into one on `admin-parity/11-invite-wizard` with a summary message
   and the two trailers; open the stacked PR against `admin-parity/12-approvals`.

## Controller live check (against the real backend; not a task)

Only a person signs in; the controller never enters credentials. Reads first; then each
irreversible write only after the person explicitly approves **that** action, named, in the
conversation. **An invitation is irreversible:** there is no delete, revoking it is terminal and
the email can then never be invited to the institution again (BG-28); with the identity-provider
invitation on, approval later creates a real Keycloak user and may send email (BG-11, BG-25).

1. **Reads (no approval needed):** sign in as a tenant administrator holding the five codes, at All
   branches. The directory shows "Invite user"; the wizard's pickers list the active roles and
   branches by name (compare with Roles & permissions and Branches; no disabled role, no pending
   branch). On Identity, an existing member's email stays on the step with the right status
   words, and the network panel shows only `GET /api/tenant/users/invite-check` (no invitation
   post). In a branch-selected context with only a branch-scoped `user.view` (if dev has such a
   holder; BG-33), Continue reads "…can't be checked in your current context. Reload the page…".
   Check **assumption 1**: a revoked member's email (if dev has one) is found by
   `GET /tenant/users?q=<email>` (the check says "…was revoked…"); and **assumption 2**: the same
   email typed in another letter case is found too. Record the request count per Continue against
   the 600/min budget.
2. **A refused invitation (explicit approval: it should write nothing, which is what it
   checks):** if dev has an account in another institution, send an invitation with its username
   and a new email: the 500's words and reference show, and the audit trail holds no new event
   (assumption 3). With a member of this institution's username and a new email instead, Username
   reads "This username belongs to someone in this institution." with the reference (Ruling 15;
   assumption 12: `q` matches usernames).
3. **One invitation (irreversible; explicit approval for the named address):** on a throwaway
   mailbox the person controls, with **both flags off** first if the person prefers no external
   effect (assumption 7 is unconfirmed): send it, land on the new record ("Awaiting approval",
   Approve disabled for the inviter), and find the `user.invite` audit event. Confirm the 201's
   `user_id` opened the right record (assumption 5).
4. **The flags (each only on explicit approval):** what `send_keycloak_invite` and
   `send_application_invite` do on dev is unconfirmed (BG-25); observe them only with a second
   administrator's approval of a throwaway invitation (a 202 provisions a real identity, layer
   10's live check).
5. **Not run:** a revoke as cleanup (terminal); approval by the inviter (a 403 the UI already
   prevents); a reused key with changed answers (Ruling 16: it needs a lost 201, so it stays
   the fake's and the unit tests').
6. **Notes, not checks (review O6):** the fake checks `user.invite` before binding the body (a 403
   before a 400), where the backend binds the JSON first; 11's app never sends a body the backend
   wouldn't bind, so the order doesn't matter to it. And contract §D says a missing flag takes its
   default while "Missing = absent or null", yet also "don't send `null`": the fake reads a `null`
   flag as `invalid_json` and an absent or `null` list as `[]`; the app never sends a `null` flag or
   list. If the live backend is ever seen answering either differently, the fake follows it.

## Self-review

- **Spec coverage.** §10.5: the four steps with their fields (Tasks 4a–4d), the pre-validation
  (1b, 4d: no role, STAFF/ADMIN without a branch, a branch-scoped role's branch, active roles and
  branches by construction, the email checked with any membership status), submit to the record
  (3), the existing-account note (4c). §6.4: RHF, the zod resolver, one key reused on retry,
  `applyFieldErrors` (4d, 4e). §9 and §7.3: `WizardForm` and 16's Stepper theme, unchanged. The
  handoff's tests: happy path, duplicate email before the post, STAFF without a branch, a BRANCH role
  without its branch, a failed submit keeping the entries, the axe matrix (7a, 7b).
- **Handoff deviations (each with its evidence in the pre-flight notes):** the email check uses
  `GET /tenant/users?q=` instead of memberships plus a read per hit; the action posts first (W16)
  and the early check sits on Identity; 10's validators don't exist (16's messages reused); 09's
  role index and `RoleScopeFields` aren't used; the stepper and `WizardForm` are 16's, as the
  handoff expected.
- **Adversarial review 1 and the controller's rulings, as applied.** The review's verdict: "Ready
  after the fixes" (Critical 0, Important 2, Minor 8, Observations 9). I1 a 403 from the email check
  reads `EMAIL_CHECK_REFUSED` (reload, never "try again"; 4d's 403 row); I2 the unreadable answer
  and the network failure are pinned as never "free" (4d's two-row `it.each`); M1 an untouched
  branch row reads "Choose a branch, or remove this row." (Q13); M2 `INVITE_FAILED` blames no one
  institution and `REVIEW_NOTE` (and the page's description) say "before they can use this
  institution"; M3 the email is capped at 254 characters and the route's comment no longer cites the
  contract for it; M4 Docs Edit 1 replaces whole lines and Task 8 requires whole-line anchors; M5
  4d's `beforeEach` resets mocks; M6 the matrix gains the email-in-use and refused-send surfaces (32
  tests); M7 7a walks Access and Review with 16's clearance helpers; M8 the fake reads a `null` list
  as `[]`. O2 the email's and username's 409 carry the 500's reference; O3 `findMemberByEmail`'s doc
  names the backstop for a truncated scan; O4 the stale `lib/api/lookups.ts` comment is announced
  (Shared changes), not edited; O5 the branch is `admin-parity/11-invite-wizard` everywhere, and
  Task 8 writes it into the plan index; O6 the two contract ambiguities are live-check notes; O7 an
  email edited during its check is checked again; O8 no brief is split. Questions: Q2 is now default
  (blocking: Q1, Q7); Q8 quotes the spec and adds the toast option with the planner's probe; Q12
  names the 403; Q13–Q16 are new defaults, Q15 (the username lookup) and Q16 (the reused key's
  words) built in Tasks 2 and 3 with their tests.
- **L1.** `findMemberByEmail` and `findMemberByUsername` reject; the route maps failures without
  text; the action's two catches disambiguate an existing failure; a failed check (any status, an
  unreadable body, a network failure) is never "free", and a refused one asks for a reload; a
  truncated scan's backstop is named; capped lists say so; a failed page read shows its state
  (Tasks 2, 3, 4a, 4d, 5a).
- **L2.** The key minted on mount and reused, `contextOrganisationId` forwarded, `runServerAction`
  and `explain`, no backend text, post first (3, 4d, 4e).
- **L3.** `env.server` mocked in the action harness; lettered, distinct ids; `delay: null`; focus
  in its own `waitFor`; a page test per route (5a) and the directory's first (5b); e2e hydration,
  exact names, one scenario per test, chunkable titles with per-describe timeouts.
- **L4.** Named row groups and Remove buttons, errors on fields, notes as notes, the hedged copy
  (flags, account reuse, username, approval "before they can use this institution") says only what
  the platform guarantees; keyboard focus clears both sticky bars (7a).
- **L5.** Seventeen sub-tasks along natural seams;
  the briefs run from 136 to 674 lines (the largest: 4d 674, 1b 590, 6b 578, 4a 565);
  almost all of each is complete code (O8: none split); each ends on a clean tree with one commit;
  docs in 8; prettier settled; no model names or scratch paths in code, docs or commits; the
  trailers exact.
- **L6.** No dotted `color` on Typography or Box; no function prop crosses to a client component
  (the page passes plain options; the wizard imports its own action); reads through the services'
  `apiGet` and `load()`; one new named paging exception, recorded in AGENTS.md.
- **Placeholders.** None: every code block is the complete file, an exact insertion with its
  anchor, or an exact replacement.
- **Executability (what was run).**
  This revision was checked from scratch on a fresh throwaway worktree of `e60336d` (Node 24.19.0,
  `pnpm install --frozen-lockfile`); the first draft's worktrees and the reviewer's were not reused.
  Every file the plan creates or changes was applied **task by task, in the dependency table's
  order**, from the plan's own blocks (each code block above is byte-identical to the file it was
  checked as; the final tree equals them). For every task: its unit tests were run before the
  implementation (**RED**: every task but 4e, which pins 4d's code, failed as each Step 2 says; 5b
  failed only its two link cases; 6a's and 6b's fake specs failed as stated, 6b with its two seed
  tests passing; 6c failed only its rules test) and after it (**GREEN**), then `prettier --check`
  and ESLint (`--max-warnings=0`) on the task's files and `tsc --noEmit` on the whole tree — all
  clean. Task 8's thirteen docs edits each matched exactly one run of whole lines (the first
  draft's Edit 1 fails that check, review M4). On the final tree: `pnpm check` (format, lint,
  `tsc`, the full Vitest run: 229 files, 2,385 tests) passed; `pnpm build` exited 0 with
  `/admin/users/new` and `/api/tenant/users/invite-check` in the route table; Task 6a's script
  reported "33/33 existing scenarios serialise identically" with the two new scenarios;
  Playwright (through a copy of the wrapper pointed at the worktree, one worker, ports 3100 and
  3199 free) ran every `e2e/fake-api*.spec.ts` (101 tests) and
  `e2e/users-invite.spec.ts` in its three chunks (10 behaviour, 16 light, 16
  dark: 42 tests, about 1.3–1.7 minutes per chunk), all green, and the users directory chunk
  of `e2e/users.spec.ts` (13 tests) passed. Every mutation proof the plan names was applied one
  at a time and reverted: all 47 unit-level ones (Tasks 1a–5b), the five of Tasks 6b and 6c
  and 7a's e2e one each failed its named test; with 4d's `vi.resetAllMocks()`, the
  `contextOrganisationId` mutant fails that one test alone (review M5). The Q8 toast probe ran in the
  same worktree and was removed before the run above. **Not run:** the full Playwright suite (the
  layer gate's), the manual visual and keyboard pass, and anything against the real backend (the
  controller's live check).
