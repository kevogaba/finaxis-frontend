# bg-adopt 25 — Platform audit and an institution Audit tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** Platform administrators can read audit history in the platform workspace (BG-06):

- the platform organisation's own log, on a platform Audit page;
- each institution's log, on an Audit tab on its record.

**Architecture:**

- **Reuse:** the tenant audit components (PR 23) gain a `basePath`/`source` parameter, so the same
  table, filters and drawer read the platform routes.
- **Lookups:** names in the platform workspace resolve through the platform user directory (PR 21)
  and the platform branch reads, not the tenant routes (which are 403 there).
- **Parsing:** platform list items parse with a schema that allows the nulled fields.

**Spec:** [§8 entry 25](../specs/2026-11-24-backend-gap-adoption-design.md#25--platform-audit)
· designs `#d-platform-audit` · register BG-06.

## Wire facts (platform `6a8ea28`)

- **Routes**, each needing `audit.view` in the platform organisation (PLATFORM_SUPER_ADMIN and
  PLATFORM_SUPPORT hold it):
  - `GET /platform/audit-events`: the platform organisation's log;
  - `GET /platform/audit-events/{event_id}`: platform rows only, every field;
  - `GET /platform/tenants/{tenant_id}/audit-events`: one tenant's log. An unknown tenant gives an
    empty page.
- **Filters:** the tenant search's filters, except `actor_subject` (400).
- **List items** carry the same keys, with `before_json`, `after_json`, `metadata_json`,
  `user_agent`, `ip_address` and `actor_external_subject` always `null`.
- **Refusals:** a tenant caller gets `forbidden` without `audit.view`, and
  `platform_context_required` with it.
- **No export:** there is no platform export.

## Tasks

### Task 1: Parameterise the audit module

- **Base path:** `audit-query.ts` and `audit-service.ts` take a base path instead of the hard-coded
  `/api/v1/tenant/audit-events`.
- **Schema:** a `platformAuditItemSchema` (nullable `metadata_json` etc.) is used for platform
  lists.
- **Drawer:** for institution events, it renders from the list item (no detail route) and says
  "Before-and-after values, IP addresses and user agents aren't shown in the platform workspace."
- **Lookups:** actor names come from `getGlobalUser` (PR 21); branch names from the platform branch
  read; the organisation's time zone from the tenant detail. For platform rows, use the platform's
  own time zone or UTC.
- **Filters:** the Actor filter uses the platform user directory picker. The Branch filter shows
  only on the institution tab.

### Task 2: Pages

- **Platform Audit page:** `app/(authenticated)/platform-admin/audit/page.tsx` (one `h1`, "Audit"),
  with a nav item gated on `audit.view` in `platform-administration-navigation.ts`.
- **Institution Audit tab:** `[tenantId]/(record)/audit/page.tsx`, registered in the record layout
  and gated on `audit.view`.
- **Tests:** page tests and e2e (both pages list, filter and open an event).

### Task 3: Fake API

- **Routes:** the three platform routes with the rules above.
- **Scenarios:** `PLATFORM_ADMIN_PERMISSIONS` gains `audit.view`.
- **Audit rows:** platform actions on a tenant write to that tenant's log; platform user lifecycle
  events write to the platform organisation's log.
- **Comment:** update the stale comment in `audit-log.mts`.

### Task 4: Gates, docs, commit

- [ ] Run `pnpm check` and the full e2e suite: green.
- [ ] Register: BG-06 → **Closed** (frontend #NN), keeping Still open.
- [ ] Contract: the platform audit routes.
- [ ] Commit `feat(platform): platform audit and an institution Audit tab`.
