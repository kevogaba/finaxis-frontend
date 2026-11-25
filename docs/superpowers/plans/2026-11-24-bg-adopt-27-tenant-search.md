# bg-adopt 27 — Search the institution from the header — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** A search box in the institution workspace's app bar finds people, members, branches and
roles (BG-19).

**Architecture:**

- **Route handler:** `app/api/tenant/search/route.ts`, following `app/api/tenant/users/route.ts`.
  It validates the session and proxies `GET /tenant/search?q=` through `apiGet` with a zod contract.
- **Search box:** a small client component in the header slot, for the tenant module only, wired
  through `app-shell.tsx` and `global-header.tsx`.
  - It debounces (300 ms) and aborts stale requests.
  - It shows a popover of grouped results with keyboard navigation (MUI `Autocomplete` with
    grouped options).

**Spec:** [§8 entry 27](../specs/2026-11-24-backend-gap-adoption-design.md#27--header-search)
· designs `#d-search` · register BG-19.

## Wire facts (platform `6a8ea28`)

- **`GET /tenant/search?q=`**
  - `q` is 2–64 characters with no control characters, checked before permissions (400 for
    everyone). Tenant context only, under the tenant-read rate limit.
  - The response has these groups:
    - `users`: `id`, `label`, `status`, `email`
    - `branches`: `id`, `label`, `status`, `branch_code`
    - `roles`: `id`, `label`, `status`, `role_code`
    - `memberships`: `id`, `label`, `status`, `membership_type`
  - At most 10 per group, with no count. A group the caller can't view is **omitted**; an empty
    array means a viewable group with no matches. Viewing none of the four is 403.
- **A membership hit** carries the membership id. Opening the user record needs the membership's
  `user_id`: `GET /tenant/memberships/{id}`.

## Tasks

### Task 1: Contract and route handler

- **Contract:** `modules/administration/search/search-contract.ts`. Every group is optional.
- **Route handler:** checks the session, then `q.trim().length >= 2`. It answers the parsed result,
  or `{ code, requestId }` with the status on failure.
- **Membership hit:** `app/api/tenant/search/membership/[id]/route.ts` resolves a membership hit to
  `{ userId }`. Alternatively, link membership hits to `/admin/users/by-membership/{id}`, a server
  page that redirects. Pick the simpler.
- **Tests:** handler tests.

### Task 2: The search box

- **Placement:** `components/shell/global-search.tsx` (client), rendered by `global-header.tsx`
  only in the tenant module.
- **Desktop field:** placeholder "Search people, branches, roles…", with `aria-label` "Search the
  institution". Under 2 characters, show no popover.
- **Groups:** People, Members, Branches and Roles. Each option shows the label, a secondary line
  (email, code or type) and a status chip.
  - Enter or click navigates: users to `/admin/users/{id}`, branches to `/admin/branches/{id}`,
    roles to `/admin/roles/{id}`, members through the resolver.
  - An empty result reads "No matches". A failure reads "Search isn't available right now."
- **Phones:** below `sm`, an icon button opens a full-width dialog with the same field.
- **Tests:** RTL (debounce, groups, navigation, a missing group); e2e (search "gra" finds Grace in
  People and Members; open her record; at 375 px with long labels, no horizontal scroll).

### Task 3: Fake API

- **Route:** `GET /tenant/search` in `routes/tenant-reads.mts`, with the rules above.
- **Spec:** the fake spec.

### Task 4: Gates, docs, commit

- [ ] Run `pnpm check` and the full e2e suite: green. Run `pnpm build` and `pnpm test:e2e:guard`,
      since this is the last entry.
- [ ] Register: BG-19 → **Closed** (frontend #NN). Update the Summary counts.
- [ ] Contract: the search route.
- [ ] Commit `feat(shell): search the institution from the header`.
