# Backend Gap Adoption — Implementation Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Each stack entry has its own plan file, written just in
> time (table below). Read this index first: its constraints and protocol apply to every task in
> every entry.

**Goal:** Adopt every fix the platform shipped for `docs/backend-gaps.md`, as a linear stack of
small, dependency-ordered pull requests, until every register entry is Closed or Adopted.

**Architecture:**

- Server-first Next.js 16. Reads go through `apiGet(path, schema)` with snake_case zod contracts per
  domain.
- Mutations are Server Actions on `runServerAction`, using the form's minted idempotency key.
- List state lives in the URL.
- The standalone e2e fake API mirrors the platform at `6a8ea28` for every route a PR touches.

**Tech Stack:** Next.js 16.4 (App Router, React 19), TypeScript, MUI 9.5 + Tailwind 4 (layout only),
zod 4, React Hook Form, Vitest + RTL, Playwright + axe.

**Spec:** [`docs/superpowers/specs/2026-11-24-backend-gap-adoption-design.md`](../specs/2026-11-24-backend-gap-adoption-design.md)
· register [`docs/backend-gaps.md`](../../backend-gaps.md) · contract
[`…-api-contract.md`](../specs/2026-09-25-admin-prototype-parity-api-contract.md) · platform
`docs/api/foundation-api.md` @ `6a8ea28`.

## Global Constraints

- **Rules.** `AGENTS.md` applies in full.
- **Packages and styling**
  - No new packages; `package.json` dependencies don't change.
  - MUI owns visuals; Tailwind is for layout only.
  - Colours come from theme tokens.
- **React boundaries**
  - Server Components by default; `'use client'` only where interaction needs it.
  - No function props across the client boundary.
  - No pre-built elements into MUI props that MUI clones.
- **Wire**
  - Bodies are snake_case and built explicitly (unknown properties are `400 invalid_json`).
  - Parse every response with a zod schema.
  - Never echo a backend `detail`. Explain a refusal by its `code` (and status).
- **Mutations**
  - Forward the idempotency key the form minted when it opened.
  - Fan-out writes derive their keys from it (`grantKey`).
- **Lists**
  - Every list is server-paginated with URL state.
  - The named exceptions in `AGENTS.md` are the only bounded scans. Update that text when an entry
    retires a scan.
- **Fake API**
  - It mirrors the platform at `6a8ea28` exactly for every route an entry touches, quirks included,
    and never runs ahead of the entry.
  - Its files run under plain `node`: relative `.mts` imports, `import type`, erasable TypeScript
    only.
- **Gates**
  - `pnpm check` after every change. `pnpm test:e2e` whenever rendered UI changes.
  - At the end of each milestone, `pnpm build` and `pnpm test:e2e:guard`.
  - TypeScript and ESLint are never bypassed.
- **Accessibility**
  - One `h1` per page and labelled fields.
  - Errors tied to their fields.
  - Visible focus, and `prefers-reduced-motion` respected.
  - Axe clean in light and dark, desktop and 375 px.
- **Register**
  - Each entry marks its gaps **Closed** or **Adopted** with the PR number.
  - Each entry updates the contract document's rows in the same change.
- **Commits and PRs**
  - One conventional commit per PR, ending with the session's attribution trailers.
  - A draft PR titled `<subject> (NN/27)`, based on the previous entry's branch.
- **Ponytail** (`ponytail`, full): take the laziest correct rung. Reuse what the codebase has,
  delete what a fix retires, and mark deliberate ceilings with `ponytail:` comments. Never cut
  validation, error handling, security or accessibility.

## Review Focus

These failure modes are implied by the spec, but no single task's happy-path tests cover them. Each
entry that touches the code owns the pinned test named in brackets.

1. **Stale page after someone else acted.** A request withdrawn, returned, decided or archived
   elsewhere must answer with its named 404/409 message, keep the dialog's typed reason, and never
   reach `app/error.tsx`. [03 refusal table test; 10, 13, 17 action tests "already decided"]
2. **Retry of a new mutation.** A second click, or a retry after a failure, on Return, Withdraw,
   Discard, Archive, Retry, Resend, membership edit, a settings switch or branch edit must reuse the
   minted idempotency key. After a success the key changes. [each new action's test: "reuses the
   minted key on retry"]
3. **Permission mixes.**
   - A mutation held without its view, `user.view` held only at branch scope, a non-admin on their own
     record, a branch-scoped approver on another branch.
   - Each must hide or disable the action with its reason. Never show it and then 403.
   - [04 `withViews`/`canTenantWide` tables; 05 own-record and held-role tests; 09 branch-scoped 403
     → `ForbiddenState`]
4. **Absent and null fields.**
   - Inputs: `created_by: null`, `branch_ids` absent, a `null` count, `invitation.last_error_code`
     `null`, an address `{}` or with unknown keys, an unset setting.
   - These render "—" or are omitted. They never show `undefined` or fail the parse.
   - [04 scopes schema; 08 actor-ref schema; 11 address; 17 invitation; 20 count cells]
5. **Long values at 375 px.** 500-character remarks, return reasons and status reasons, 100-character
   addresses, institution names and search hits must not cause horizontal page scroll. [11, 13, 20,
   27 e2e narrow-width checks]

## Stack

Trunk `main`. Branches use the `bg-adopt/NN-concern` prefix. Each entry is independently green.
Plans marked JIT are written with superpowers:writing-plans just before the entry starts, from the
spec's §8 entry. They are committed with that entry.

| #   | Branch                           | Plan                           | Milestone |
| --- | -------------------------------- | ------------------------------ | --------- |
| 00  | `bg-adopt/00-docs`               | this index + the spec          | M0        |
| 01  | `bg-adopt/01-branch-approve`     | JIT `2026-11-24-bg-adopt-01-…` | M1        |
| 02  | `bg-adopt/02-platform-counts`    | JIT                            | M1        |
| 03  | `bg-adopt/03-named-refusals`     | JIT                            | M1        |
| 04  | `bg-adopt/04-view-pairs`         | JIT                            | M1        |
| 05  | `bg-adopt/05-assign-self`        | JIT                            | M1        |
| 06  | `bg-adopt/06-role-archive`       | JIT                            | M1        |
| 07  | `bg-adopt/07-settings`           | JIT                            | M1        |
| 08  | `bg-adopt/08-makers`             | JIT                            | M2        |
| 09  | `bg-adopt/09-branch-context`     | JIT                            | M2        |
| 10  | `bg-adopt/10-branch-requests`    | JIT                            | M2        |
| 11  | `bg-adopt/11-branch-edit`        | JIT                            | M2        |
| 12  | `bg-adopt/12-approval-remarks`   | JIT                            | M2        |
| 13  | `bg-adopt/13-institution-return` | JIT                            | M2        |
| 14  | `bg-adopt/14-pending-counts`     | JIT                            | M2        |
| 15  | `bg-adopt/15-platform-checker`   | JIT                            | M2        |
| 16  | `bg-adopt/16-member-reads`       | JIT                            | M3        |
| 17  | `bg-adopt/17-invitation`         | JIT                            | M3        |
| 18  | `bg-adopt/18-reinvite`           | JIT                            | M3        |
| 19  | `bg-adopt/19-membership-edit`    | JIT                            | M3        |
| 20  | `bg-adopt/20-count-columns`      | drafted, see Status            | M4        |
| 21  | `bg-adopt/21-platform-users`     | drafted, see Status            | M4        |
| 22  | `bg-adopt/22-platform-settings`  | drafted, see Status            | M4        |
| 23  | `bg-adopt/23-audit-filters`      | drafted, see Status            | M5        |
| 24  | `bg-adopt/24-audit-export`       | drafted, see Status            | M5        |
| 25  | `bg-adopt/25-platform-audit`     | drafted, see Status            | M5        |
| 26  | `bg-adopt/26-cob-readiness`      | drafted, see Status            | M5        |
| 27  | `bg-adopt/27-tenant-search`      | drafted, see Status            | M5        |

## Execution protocol (every entry)

Execution mode (chosen 2026-11-24): **superpowers:subagent-driven-development**. A fresh implementer
subagent builds each entry, and a fresh reviewer checks it against the spec's §8 entry and this
index. Entries of size S may be built inline by the main session. Entries run one at a time in one
checkout: the e2e build and the fake API's ports can't be shared.

0. **Bootstrap (once per container).**
   - Run `pnpm install --frozen-lockfile`.
   - Create `.env.local` with the CI workflow's environment values.
   - Where the installed Chromium differs from `@playwright/test`'s, use an untracked
     `playwright.local.config.ts`. It spreads `playwright.config.ts` and sets
     `launchOptions.executablePath`, and is run with `pnpm build:e2e && pnpm exec playwright test -c
playwright.local.config.ts`.
1. **Place the work.** Check out the previous entry's branch and run
   `git checkout -b bg-adopt/NN-concern`. Never commit a lower entry's concern on a higher branch.
   - If a lower entry needs a fix, commit it there (amending its one commit).
   - Then rebase each branch above onto it in order (`git rebase --onto <new> <old> <branch>`).
   - Push each with `--force-with-lease`.
2. **Write the entry's plan** (JIT), from the spec's §8 entry and the files it names.
3. **Build it test-first.**
   - Every task uses superpowers:test-driven-development, and superpowers:verification-before-completion
     before claiming done.
   - UI tasks also use `frontend-design` for the screens the designs show.
4. **Gates.**
   - `pnpm check`, then the e2e suite. Fix the cause of any failure; never skip or retry a test.
   - Register entry → Closed/Adopted (PR number added once the PR exists). Contract rows updated.
5. **Commit, push and open the PR.**
   - One commit (`git commit --amend` for later changes).
   - `git push -u origin bg-adopt/NN-concern`, retrying network errors up to 4 times with backoff.
   - A draft PR with base = the previous entry's branch, then subscribe to its activity.
6. **Milestone end.**
   - Run `pnpm build` and `pnpm test:e2e:guard`.
   - Send the owner a short milestone summary to review and merge. Merging is the owner's.
7. **Keep the stack on the latest `main`.** Whenever `main` moves, and before each milestone's
   handoff:
   - Fetch it and rebase the whole stack onto it in one go, from its top branch:
     `git fetch origin main && git rebase --update-refs origin/main` (or
     `--onto origin/main <old-base>`). This moves every branch below with it.
   - After a dependency change, re-run `pnpm install --frozen-lockfile`.
   - Resolve conflicts in the branch that owns the code. Run `pnpm check` and the full e2e suite on
     the top branch; CI checks each branch on push.
   - Push every rebased branch with `--force-with-lease`.

## Status and handoff (2026-11-25)

The owner paused the adoption after M3. M4 and M5 resume later from this section.

### Where the stack stands

| Entries | PRs                    | State                                    |
| ------- | ---------------------- | ---------------------------------------- |
| 00–07   | #105, #107–#113        | M0–M1 open, reviewed, green              |
| 08–15   | #114, #116–#122        | M2 open, reviewed, green                 |
| 16–19   | #123, #124, #125, #126 | M3 open, reviewed, green                 |
| 20–27   | —                      | M4–M5 not started; plans drafted (below) |

- **Base:** every entry sits on `main` `241888b`, one commit each.
- **Merging:** nothing is merged. Merging is the owner's, bottom-up.
- **Register:** after entry 19 the register reads 7 backend fixed · 2 partly fixed · 0 open · 8
  adopted · 18 closed (35). BG-17 stays Partly fixed until entry 21, its platform-users part.

### The M4–M5 plans

This change (#127) commits the drafts for entries 20–27 beside the others:

- `2026-11-24-bg-adopt-20-count-columns.md` … `2026-11-24-bg-adopt-27-tenant-search.md`.
- They were written on 2026-11-24 against platform `6a8ea28`, **before** M2–M3 landed. Read each one
  against the code as it now stands, and record differences as "**As built:**", as entries 08–19
  did.
- The changes most likely to affect them:
  - **The branch gate.** `canActOnBranch` and `canActAtBranch` apply the platform's two checks.
    Target-aware reads use `canAnywhere`.
  - **The membership read.** `membership.view` is read tenant-wide only (`canTenantWide`).
  - **Paging.** The user record's paging is the platform's, and the named list exceptions in
    `AGENTS.md` were rewritten.
  - **Makers.** Every record carries `created_by` / `submitted_by`, through `actorRefSchema` and
    `makerLabel`.

### Open follow-ups (small; fold into the entry that next touches the code)

- **Entry 09's commit message** doesn't name its last three fixes: the New branch gate, the scope
  helper copy and the Branches navigation item. PR #116's description does. Update it at the next
  amend of 09.
- **Two target-aware reads still use `can`.** The approval page's requested branches
  (`listRequestedBranches`) and the `role_assignment.view` reads (the Overview role count, the Roles
  & access tab) are target-aware on the platform. A branch-scoped holder at All branches doesn't see
  them. Gate them with `canAnywhere`.
- **Re-invited members missing from counts.** A re-invited member whose account was never
  provisioned is left out of the pending counts (entry 18, "option C"). The platform's list and
  count reads carry no invitation. This is recorded under BG-28 "Still open".

### Resuming

1. Fetch and rebase the stack onto the latest `main` (protocol step 7). Rebase onto whatever the
   owner has merged.
2. Bootstrap the container (protocol step 0).
3. Start entry 20 from `bg-adopt/19-membership-edit`, or from what replaced it.
4. Follow the protocol.

**What helped during M2–M3:**

- **Parallel worktrees.**
  - Two worktrees ran in parallel: the main checkout, plus `git worktree add ../fx-push`.
  - Each used its own e2e ports. Set them with `PORT=3200 FAKE_API_PORT=3299` in the worktree that
    isn't the main checkout. Each worktree also needs its own untracked `playwright.local.config.ts`
    and `.env.local`.
  - This lets the next entry build while the previous one is reviewed. Rebase it onto the reviewed
    entry before its final gates.
- **An independent, git-only reviewer** per entry, given the platform paths to check. Fold its
  findings into the one commit before pushing.
- **The PR number.** Fill it in place of the `#PRNN` placeholder with one amend before the first
  push, when the next number is certain. Otherwise create the PR, then amend and push again.
