# Administration Prototype Parity — Implementation Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Each stack layer has its own plan file (table below); read
> this index first — its constraints and protocol apply to every task in every layer.

**Goal:** Take the Finaxis frontend from the current shell to the functional level of the
Administration prototype, as a linear `gh stack` of dependency-ordered pull requests.

**Architecture:** Server-first Next.js 16: Server Components read through server-only services
(zod-validated snake_case wire contracts); Server Actions mutate with client-generated idempotency
keys; URL search params hold list state; MUI v9 components styled through the theme; Playwright
runs against a standalone fake API.

**Tech Stack:** Next.js 16.3 (App Router, React 19.3), TypeScript 6, MUI 9.4 (+ icons),
Tailwind 4 (layout only), zod 4.6, React Hook Form 7.88, Vitest 4 + RTL, Playwright 1.63 + axe,
`gh stack` 0.1.

**Spec:** [`docs/superpowers/specs/2026-09-25-admin-prototype-parity-design.md`](../specs/2026-09-25-admin-prototype-parity-design.md)
· contract [`…-api-contract.md`](../specs/2026-09-25-admin-prototype-parity-api-contract.md)
· gaps [`docs/backend-gaps.md`](../../backend-gaps.md)

## Global Constraints

- MUI v9 is the component system; Tailwind classes only for layout (flex, grid, gap, sizing,
  positioning, visibility). No new packages; `package.json` dependencies do not change.
- Colours come from theme tokens (`theme/create-finaxis-theme.ts`, `theme/theme.types.ts`); no hex or
  rgba literals in components.
- No function props from a Server Component into a Client Component (including `sx` callbacks and
  `component={Link}`); use `@/components/navigation/next-link` for `component` props and plain-object
  `sx`. Icons are components — navigation registries live in client modules and are selected by
  string IDs.
- Server Components are the default; add `'use client'` only for interaction, browser APIs, or MUI
  hooks.
- Every authenticated route and every Server Action validates the session server-side
  (`getAuthenticatedUser`) and reads the context token server-side; tokens never reach client state.
- Wire bodies are snake_case; build request bodies explicitly (unknown properties → `400
invalid_json`); parse every response with a zod schema; `sort_by` values are camelCase from an
  allow-list.
- Every list is server-paginated (page sizes 10, 20, 30, 40, 50) with state in the URL; no unbounded
  list requests except the bounded lookup indexes (≤ 5 pages × 100).
- Accessibility: one `h1` per page, visible focus, labelled fields, errors tied to fields,
  `prefers-reduced-motion` respected, no serious/critical axe violations (light + dark, desktop +
  375 px).
- TypeScript/ESLint are never bypassed (`@ts-ignore`, `@ts-nocheck`, unsafe `any`, rule disables).
- `pnpm check` after every change; `pnpm test:e2e` when rendered UI changes; `pnpm build` before a
  layer is marked done.
- **Ponytail during execution** (`ponytail:ponytail`, full): take the laziest correct rung — reuse
  what the codebase or an earlier layer already has, prefer platform and installed features, write
  the shortest working diff, mark deliberate ceilings with `ponytail:` comments. The plan's code is a
  ceiling, not a floor: simplify internals freely, but never rename or drop an **Interfaces →
  Produces** item another task consumes, and never cut validation, error handling, security, or
  accessibility. Report every deviation from the plan in the task report.

## Review Focus

The five input classes most likely to bite users that no single task's happy-path tests cover. Each
has a pinned test in the owning task (named in brackets).

1. **Stale or revoked context mid-session** — any backend call can return `403
invalid_active_tenant_context` (e.g. the selected branch was suspended). The user must land on
   `/select-context?next=…`, never on an error page. [PR 05 Task 1; PR 06 Task 1]
2. **Double submit and retry of a mutation** — a second click or a retry after a timeout must reuse
   the same idempotency key (no duplicate change); after a success the key must change so the next,
   different submission isn't rejected as `IDEMPOTENCY_KEY_REUSED`. [PR 07 Tasks 3, 4, 6]
3. **Branch cardinality edge cases** — users with zero branches, exactly one branch, or duplicate
   assignment rows for one branch (HOME + OPERATE) must never be offered a meaningless "All
   branches" option or duplicate branch choices. [PR 05 Task 2]
4. **Long values at narrow widths** — 100-character names/emails/codes at 375 px must not cause
   horizontal page scroll; cells truncate with the full value available. [PR 04 Task 6; PR 06 Task 5;
   PR 07 Task 5]
5. **Schema drift** — extra response fields are ignored; a missing required field or wrong type
   renders the safe error state with a support reference instead of crashing or rendering
   `undefined`. [PR 05 Task 1; PR 06 Tasks 1, 3; PR 07 Tasks 2, 4]

## Stack

Trunk `main`. Branches use the `admin-parity/NN-concern` prefix. Each layer is independently green.
From layer 07 on, two build lanes run in parallel (see the
[parallel-lanes rules](./2026-09-27-admin-parity-parallel-lanes.md)), and layers are registered in
the order they integrate, so the stack order can differ from the numbering below. Stack order so
far: 00–06, 07b, 07, 15.

| #   | Branch                             | Plan                                                              | Detail |
| --- | ---------------------------------- | ----------------------------------------------------------------- | ------ |
| 00  | `admin-parity/00-deps`             | [01-deps-and-docs](./2026-09-25-admin-parity-01-deps-and-docs.md) | full   |
| 01  | `admin-parity/01-docs`             | [01-deps-and-docs](./2026-09-25-admin-parity-01-deps-and-docs.md) | full   |
| 02  | `admin-parity/02-theme`            | [02-theme](./2026-09-25-admin-parity-02-theme.md)                 | full   |
| 03  | `admin-parity/03-fake-api`         | [03-fake-api](./2026-09-25-admin-parity-03-fake-api.md)           | full   |
| 04  | `admin-parity/04-shell`            | [04-shell](./2026-09-25-admin-parity-04-shell.md)                 | full   |
| 05  | `admin-parity/05-context`          | [05-context](./2026-09-25-admin-parity-05-context.md)             | full   |
| 06  | `admin-parity/06-audit`            | [06-audit](./2026-09-25-admin-parity-06-audit.md)                 | full   |
| 07b | `admin-parity/07b-record-kit`      | [07b-record-kit](./2026-09-27-admin-parity-07b-record-kit.md)     | full   |
| 07  | `admin-parity/07-business-date`    | [07-business-date](./2026-09-25-admin-parity-07-business-date.md) | full   |
| 08  | `admin-parity/08-branches`         | just-in-time from spec §10.3                                      | JIT    |
| 09  | `admin-parity/09-roles`            | just-in-time from spec §10.4                                      | JIT    |
| 10  | `admin-parity/10-users-record`     | just-in-time from spec §10.5                                      | JIT    |
| 11  | `admin-parity/11-users-invite`     | just-in-time from spec §10.5                                      | JIT    |
| 12  | `admin-parity/12-approvals`        | just-in-time from spec §10.6, §8 (notifications)                  | JIT    |
| 13  | `admin-parity/13-settings`         | just-in-time from spec §10.7                                      | JIT    |
| 14  | `admin-parity/14-overview`         | just-in-time from spec §10.8                                      | JIT    |
| 15  | `admin-parity/15-profile`          | [15-profile](./2026-09-27-admin-parity-15-profile.md)             | full   |
| 16  | `admin-parity/16-platform-tenants` | just-in-time from spec §11.1–11.2                                 | JIT    |
| 17  | `admin-parity/17-platform-records` | just-in-time from spec §11.2–11.4                                 | JIT    |

The shell layer from the spec's §13 is split into `04-shell` (chrome, navigation, cleanup) and
`05-context` (All branches, context dialog, app switcher) for reviewability; later numbers shift by
one. Just-in-time plans are written with superpowers:writing-plans from the spec before the layer
starts, reusing the interfaces established here.

## Execution protocol (every layer)

Execution mode (chosen 2026-09-25): **superpowers:subagent-driven-development** — a fresh implementer
subagent per task, a fresh reviewer per task, a whole-layer review before the layer is done.

0. **One worktree for the whole stack.** Create a single linked worktree with
   superpowers:using-git-worktrees and build every layer in it. Do not use per-task `isolation:
"worktree"` agents: those worktrees are temporary, so their commits would never land on the stack
   branches. Bootstrap it once: `pnpm install --frozen-lockfile`, copy `.env.local`, and (for the
   docs layer) the untracked `docs/` files. After `gh stack init`, run `gh stack view --json` inside
   the worktree to prove gh-stack works there; if it doesn't, stop and ask the user before falling
   back to the main checkout.
   Every implementer prompt carries: the worktree's absolute path, the layer plan's task text, this
   index's Global Constraints, the instruction to invoke `ponytail:ponytail` scoped as above, and the
   gates. Live read and mutation checks are never delegated — the main session runs them with the
   user.
1. **Place the work.** `gh stack view --json` → check out the layer being built (`gh stack checkout
admin-parity/NN-…` or `gh stack top`). New layers: `gh stack add admin-parity/NN-concern` from
   the layer below. Never commit a lower layer's concern on a higher branch; if a lower layer needs a
   fix: check it out, commit, `gh stack rebase --upstack`, `gh stack top`.
2. **Load skills per task type.**
   - Every task: superpowers:test-driven-development; superpowers:verification-before-completion
     before claiming done.
   - UI tasks (anything rendering components): `frontend-design`, then `ui-ux-pro-max` — run once per
     layer and keep the output as working notes (not committed unless the task says so):
     `python "/home/ogaba/.claude/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/2.13.0/.claude/skills/ui-ux-pro-max/scripts/search.py" "<screen> core banking SACCO administration console data-dense" --design-system --density 9 --motion 2 --variance 3 -p "Finaxis Administration"`
     plus `--stack nextjs` / `--domain ux` searches for the screen's patterns; finish with its
     pre-delivery checklist (`references/pro-rules.md`). The prototype's tokens (spec §7) win over
     any generated palette.
   - Theme/styling tasks: project skills `material-ui-theming` and `material-ui-styling`.
   - Next.js APIs: read the matching guide in `node_modules/next/dist/docs/` before first use (Server
     Actions: `01-app/02-guides/server-actions.md`, `forms.md`, `data-security.md`).
3. **Gates before a layer is done:** `pnpm check`, `pnpm test:e2e`, `pnpm build`; the ui-ux-pro-max
   checklist for UI layers; from PR 05 on, a **live read check** against dev (the user signs in once
   in the browser pane; the agent never enters credentials) covering every endpoint the layer reads;
   from PR 07 on, live mutation checks only after the user approves each action on a dev tenant.
4. **Record findings.** Contract surprises go into the contract document and, if they are backend
   defects, into `docs/backend-gaps.md`, in the same layer.
5. **Publishing is outward-facing.** Push/PR creation (`gh stack submit --auto`, drafts) happens only
   after the user says so; `gh stack view --json` afterwards to confirm.

## Shared conventions

- Test files sit next to their subject (`x.ts` → `x.test.ts`). Server-only modules are testable
  because `vitest.config.ts` aliases `server-only`. Mock `next/navigation`, `next/headers`, and
  service modules with `vi.mock`, as in `app/(authenticated)/layout.test.tsx`.
- Component tests render through `renderWithProviders` (`test/test-utils.tsx`) and query by role and
  accessible name.
- E2E specs import helpers from `e2e/support/auth.ts` (introduced in PR 03) and use a unique fake-API
  run per test.
- Commit messages: Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`,
  `chore:`), ending with the attribution trailer:

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
