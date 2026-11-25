# bg-adopt 26 — Close-of-business readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** Before starting close of business, operators see the platform's readiness checks (BG-21).
Starting while a blocking check fails is allowed after a confirmation that names the failing checks
(decision Q6).

**Architecture:**

- **Contract and read:** a readiness contract and service read in the business-date module.
- **Card:** a server-rendered card on the Business date page.
- **Dialog:** the Start close of business `ReasonDialog` receives the failing blocking checks as
  primitive props.
- **Overview:** Operational readiness uses the checks for `cob.start` holders.

**Spec:** [§8 entry 26](../specs/2026-11-24-backend-gap-adoption-design.md#26--close-of-business-readiness-q6)
· designs `#d-cob` · register BG-21.

## Wire facts (platform `6a8ea28`)

- **`GET /tenant/business-date/cob/readiness`**
  - Needs `cob.start`; the service also needs `business_date.view`.
  - 404 when there is no business date.
  - Returns `{ business_date: "dd-MM-yyyy", status, ready: boolean, checks: [{ code, severity: "BLOCKING" | "ADVISORY", status: "PASS" | "FAIL" | "WARN", detail, count? }] }`.
  - `count` is omitted on the lifecycle checks.
- **The five checks**
  - BLOCKING: `business_date_open`, `organisation_active` and `manual_journals_pending_approval`.
  - ADVISORY: `manual_journals_draft` and `reconciliation_breaks`.
- **Advice only:** `ready` is false while a BLOCKING check fails. Starting and completing close of
  business don't consult it; the scheduled auto-advance does.
- **`detail`** is backend text. Never show it; label each check by its `code`.

## Tasks

### Task 1: Contract, service, labels

- **`business-date-contract.ts`:** the readiness schema.
- **`business-date-service.ts`:** `getCobReadiness()`.
- **Labels:** `export const READINESS_LABELS: Record<string, { pass: string; fail: string }>`:
  - `business_date_open`: "Business date is open" / "Business date isn't open"
  - `organisation_active`: "Institution is active" / "Institution isn't active"
  - `manual_journals_pending_approval`: "No manual journals waiting for approval" /
    "{count} manual journals waiting for approval"
  - `manual_journals_draft`: "No manual journals in draft" / "{count} manual journals still in
    draft"
  - `reconciliation_breaks`: "No reconciliation breaks" / "{count} reconciliation breaks"
  - An unknown code gets a generic label: "Check {code}".
- **Tests:** contract and label tests.

### Task 2: UI

- **Business date page:** for `cob.start` holders, the readiness card renders while the date is
  OPEN.
  - The heading reads "Close-of-business readiness", with a chip "Ready" or "Not ready".
  - One row per check: a status chip (Pass, Fail or Warn), the label, and "· blocking" or
    "· advisory".
  - A caption: "Checked <time>. Automatic advance waits while a blocking check fails."
  - On failure, the card shows the `ErrorState` reference.
- **Start close of business dialog**
  - With failing blocking checks: a warning Alert, "<n> blocking checks are failing: <labels>.",
    and a confirm reading "Start anyway".
  - Otherwise: unchanged.
- **Overview:** `readiness-rules.ts` `businessDateItem` uses `ready` for `cob.start` holders.
- **Tests:** RTL and e2e (a not-ready scenario shows the failing row; start anyway works; a ready
  scenario has no warning).

### Task 3: Fake API

- **Route:** `routes/business-date.mts` serves the readiness route with fake inputs. Pending and
  draft journal counts come from scenario state, defaulting to 0.
- **Scenarios:** a not-ready scenario (2 pending approval).

### Task 4: Gates, docs, commit

- [ ] Run `pnpm check` and the full e2e suite: green.
- [ ] Register: BG-21 → **Closed** (frontend #NN), keeping Still open (advice only; missing
      signals).
- [ ] Contract: the readiness route.
- [ ] Commit `feat(business-date): close-of-business readiness`.
