# bg-adopt 02 — Count institutions without subtracting the platform organisation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** The institution directory's result count and the overview's Active institutions tile
read one low today. Platform #283 took the reserved platform organisation out of
`GET /platform/tenants` and its `total_items`, but the UI still subtracts it. Show the platform's
totals as returned.

**Architecture:** Delete the two compensating helpers and use `totalItems` directly. The fake API's
tenant list leaves out the platform organisation unless `include_platform=true`, as the platform
does. `isPlatformOrganisation`/`isInstitutionId` stay for record URLs, which can still name it.

**Spec:** [§8 entry 02](../specs/2026-11-24-backend-gap-adoption-design.md#02--platform-organisation-counts)
· register BG-29.

---

### Task 1: Show the platform's institution totals as returned

**Files:**

- Modify: `modules/platform-administration/tenants/tenant-rules.ts` (delete `visibleTenantTotal`)
- Modify: `modules/platform-administration/overview/overview-rules.ts` (delete
  `activeInstitutionCount`)
- Modify: `app/(authenticated)/platform-admin/tenants/page.tsx` (use `page.totalItems`; drop the
  row filter)
- Modify: `app/(authenticated)/platform-admin/page.tsx` (the active tile uses the count as read)
- Modify: `e2e/fake-api/routes/platform-tenants.mts` (`GET /platform/tenants` excludes
  `PLATFORM_ORGANISATION_ID` unless `include_platform=true`, for every filter)
- Test: `tenant-rules.test.ts`, `overview-rules.test.ts`, `platform-admin/tenants/page.test.tsx`,
  `platform-admin/page.test.tsx`, `e2e/fake-api-platform-tenants.spec.ts`

**Interfaces:**

- Removes: `visibleTenantTotal`, `activeInstitutionCount`. No other module consumes them.

- [ ] **Step 1: Write the failing tests.**
  - The page tests: with `totalItems: 7` and no platform row, the toolbar reads "7 institutions"
    filtered or not, and the Active tile reads the `status=ACTIVE` read's total unchanged.
  - The fake-API spec: `GET /api/v1/platform/tenants` has no item with the platform id and
    `total_items` excludes it; with `include_platform=true` it is included.
- [ ] **Step 2:** Run `pnpm test:run`. Expected: the page tests fail (one low). Then run
      `pnpm exec playwright test e2e/fake-api-platform-tenants.spec.ts -c playwright.local.config.ts`.
      Expected: the include/exclude test fails.
- [ ] **Step 3:** Implement. Delete both helpers and their tests, and use the totals as returned.
      Filter the fake list on `tenant.id !== PLATFORM_ORGANISATION_ID` unless
      `query.get('include_platform') === 'true'`.
- [ ] **Step 4:** Run `pnpm check` and the e2e suite. Expected: all pass. `e2e/platform-tenants.spec.ts`
      ("7 institutions") and `e2e/platform-records.spec.ts` ("Active institutions 2") keep their
      numbers, because the fake now leaves the platform row out.
- [ ] **Step 5:** Docs. Register BG-29 is **Closed** (frontend #NN). Mark item 2 of "Backend changes
      that affect the current UI" as adopted. Update the contract row for `GET /platform/tenants`
      with `include_platform`.
- [ ] **Step 6:** Commit `fix(platform): stop subtracting the platform organisation from counts`.
