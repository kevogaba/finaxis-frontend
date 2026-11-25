# bg-adopt 21 — A cross-institution user directory and profile edit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** "Platform users" becomes **Users**: everyone with an account across all institutions
(BG-10, decision Q5). A user's account record lists their institutions, shows phone and last
sign-in, and lets a platform administrator edit the display name and phone (BG-17, platform part).

**Architecture:**

- **Contract:** a new `modules/platform-administration/users/global-user-contract.ts`.
- **Directory:** `app/(authenticated)/platform-admin/users/page.tsx` reads `GET /platform/users`.
- **Account record:** `platform-admin/users/[userId]/page.tsx` reads `GET /platform/users/{id}` and
  renders a variant of `AccountRecord`.
- **Unchanged:** the institution-scoped member record
  (`platform-admin/tenants/[tenantId]/users/[userId]`) and the overview's operator count, which
  stays on the platform organisation's members.

**Spec:** [§8 entry 21](../specs/2026-11-24-backend-gap-adoption-design.md#21--cross-institution-users-q5)
· designs `#d-platform-users` · register BG-10, BG-17.

## Wire facts (platform `6a8ea28`)

- **`GET /platform/users`** (`user.view` in the platform organisation)
  - Filters: `q` (name, username, email), `user_status`, `organisation_id` (accounts with any
    membership there).
  - Sort: `sort_by` ∈ `createdAt`, `username`, `displayName`, `email`, `userStatus`; size at most 100.
  - Items: `id`, `username`, `email`, `display_name`, `user_status`, `created_at`,
    `membership_count`.
- **`GET /platform/users/{user_id}`** adds:
  - `memberships[]` (at most 100, newest first): `membership_id`, `organisation_id`, `tenant_code`,
    `organisation_name`, `membership_status`, `membership_type`, `created_at`. The platform
    organisation's own membership is included.
  - `phone_e164: string | null` and `last_login_at: string | null`.
  - Unknown id: 404.
- **`PATCH /platform/users/{user_id}`** (`user.update` + `user.view`)
  - Body: `{ display_name?: string (2–100, trimmed), phone_e164?: string (E.164) }`.
  - `null` is treated as absent, so the phone can't be cleared.
  - 422: an empty body, or a DEACTIVATED or ARCHIVED account.
  - Answers the detail.
- **Account lifecycle:** the suspend, reactivate and deactivate routes are unchanged (PR 03 named
  `self_account_change`).

## Tasks

### Task 1: Contract, service, directory

- **Contract and service:** `listGlobalUsers(query)` and `getGlobalUser(id)` in
  `institution-user-service.ts`, or a new `global-user-service.ts`.
- **Directory page:**
  - Title "Users"; description "Everyone with an account, across all institutions."
  - Filters: search, user status, and institution. The institution select is one page of 100
    institutions, including the platform organisation (`include_platform=true`), by name.
  - Sort and URL state through `useListNavigation`.
  - Columns: User, Email, Account (status), Institutions (`membership_count`), Created.
  - Rows link to `/platform-admin/users/{id}`.
- **Navigation:** `platform-administration-navigation.ts` relabels "Platform users" as "Users".
- **Copy:** `account-rules.ts` `PLATFORM_USERS_DESCRIPTION`.
- **Tests:** page tests and e2e (search across institutions; filter by institution).

### Task 2: Account record

- **Facts:** Display name, Username, Email, Account status, Phone (or "—") and Last sign-in (or
  "Never").
- **Institutions:** a section table with Institution (name · code), Type, Status and Since.
  - Each row links to `/platform-admin/tenants/{organisationId}/users/{userId}`. The platform
    organisation's row links to the same record.
  - A "Shows up to 100 memberships." caption when 100 are returned.
- **Kept:** the lifecycle actions (suspend, reactivate, deactivate; self guards).
- **Edit profile** (`withViews(['user.update'])`; not for DEACTIVATED or ARCHIVED)
  - Fields: Display name (2–100) and Phone (E.164, helper "International format, for example
    +254712345678. A phone can be changed but not removed.").
  - The action sends only changed fields; a blank phone isn't sent.
  - 422 copy: "This account can't be edited in its current state, or nothing changed."
- **Deleted:** the old single-membership facts ("Membership in the platform organisation").
- **Tests:** RTL, action tests (changed fields only; key reuse), and e2e (edit a profile; open an
  institution membership).

### Task 3: Fake API

- **`routes/platform-records.mts`:** `GET /platform/users`, `GET /platform/users/:id` and
  `PATCH /platform/users/:id`, with the rules above.
- **State:** `FakeUser` gains `createdAt`, `phoneE164` and `lastLoginAt`.
- **Specs:** `e2e/fake-api-platform-records.spec.ts`.

### Task 4: Gates, docs, commit

- [ ] Run `pnpm check` and the full e2e suite: green.
- [ ] Register:
  - BG-10 → **Closed** (frontend #NN).
  - BG-17 → **Adopted** (frontend #NN, with PR 19), keeping Still open (no MFA, no self-service
    edit).
- [ ] Contract: the three routes.
- [ ] Commit `feat(platform): a cross-institution user directory and profile edit`.
