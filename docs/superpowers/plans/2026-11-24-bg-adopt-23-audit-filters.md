# bg-adopt 23 — Audit filters and one user history — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** The audit trail adopts the platform's audit search (BG-16) in four ways:

- **New filters:** outcome, minimum severity, branch acted on, actor type and text search.
- **One user history:** "About this person", through `subject_user_id`.
- **Vocabulary:** the new action names.
- **Field names:** moves off the deprecated aliases.

**Architecture:**

- **URL query:** `audit-query.ts` owns it; the new keys go there, with the `q` window rule.
- **Filters:** `audit-filters.tsx` gains selects and a text field in the existing `ListToolbar`.
- **Vocabulary:** `audit-vocabulary.ts` maps the new actions and entity types.
- **User record:** the Audit tab's four views become two.

**Spec:** [§8 entry 23](../specs/2026-11-24-backend-gap-adoption-design.md#23--audit-filters)
· designs `#d-audit` · register BG-16, item 10.

## Wire facts (platform `6a8ea28`)

- **`GET /tenant/audit-events` filters**
  - `subject_user_id`
  - `outcome` (SUCCESS, FAILURE, DENIED)
  - `severity` or `min_severity` (INFO, LOW, MEDIUM, HIGH, CRITICAL: check the enum in
    `common/audit`)
  - `branch_id`
  - `action_prefix` (2–64 characters)
  - `actor_type` (USER, SYSTEM)
  - `actor_subject`
  - `q`: 3–64 characters over the action, entity type and reason. It needs `occurred_from`, and a
    window of at most 31 days.
  - A bad value is 400 `invalid_parameter`.
- **Items** carry
  - `id`, `organisation_id`, `occurred_at`, `actor_type`, `actor_user_id`, `subject_user_id`,
    `actor_external_subject`;
  - `branch_id` (the branch the event is about), `event_type` (= action), `action`;
  - `entity_type`, `entity_id`, `outcome`, `severity`, `reason`, `ip_address`, `user_agent`,
    `correlation_id`, `request_id`, `before_json`, `after_json`, `metadata_json`;
  - deprecated aliases `actor_id`, `resource_type`, `resource_id`.
- **Actions written going forward**
  - `user_account.<transition>` on `USER_ACCOUNT`.
  - `membership.<suspend | reactivate | revoke | revoke_pending | revoke_suspended | reinvite | update>`
    on `MEMBERSHIP`, plus `membership.assignments_revoked`.
  - `api.access_denied` on `API_ROUTE` (DENIED, HIGH).
  - `audit.export` on `AUDIT_EVENT`, and `audit.retention_purge`.
  - `role.archive`.
  - `branch.update`, `branch.withdraw`, `branch.discard` and the return action, plus
    `branch.self_approve`.
  - `user.invitation_retry`.
  - Check the exact names in the platform source before writing them.
- **No backfill:** older rows aren't backfilled.

## Tasks

### Task 1: Contract and vocabulary

- **`audit-contract.ts`:** parse the canonical names (`entity_type`, `entity_id`, `actor_user_id`)
  and `subject_user_id`, `event_type`, `organisation_id`. Stop reading the aliases.
- **`audit-vocabulary.ts`**
  - Add every action above with a label: "Suspended account", "Suspended membership", "Access
    denied", "Exported audit events", "Archived role", "Edited branch", "Withdrew branch",
    "Discarded branch", "Returned branch for changes", "Re-invited member", and so on.
  - Add entity types `USER_ACCOUNT`, `MEMBERSHIP`, `API_ROUTE` and `AUDIT_EVENT`.
  - Move `membership.suspend` and `membership.reactivate` under MEMBERSHIP.
  - Keep the old rows' actions, which are still readable history.
- **Tests:** vocabulary tests.

### Task 2: Filters

- **`audit-query.ts`**
  - Parse and serialise `outcome`, `minSeverity`, `branchId`, `actorType` and `q`.
  - Validate `q` client-side: 3–64 characters; requires From; window of 31 days or less. Field
    errors: "Search needs at least 3 characters." and "Text search covers up to 31 days from
    'From'. Set From, or narrow the dates."
- **`components/audit-filters.tsx`**
  - Search (`q`).
  - Outcome (Any, Success, Failure, Denied).
  - Severity, "High and above" style (`min_severity`).
  - Branch: the institution's branches, one page of 100 by name.
  - Actor (Person, System).
  - Chips for active filters, as today.
- **Table:** relabel the "Branch" column "Branch acted on".
- **Tests:** query round-trip tests, filter RTL tests, and e2e (filter Denied + High; text search
  with a window).

### Task 3: User history

- **User record Audit tab** (`admin/users/[userId]/audit/page.tsx`): two views.
  - "About this person" (`subject_user_id = userId`), with the note "Events recorded before the
    platform's update may be missing here; the Account and Membership filters on the audit trail
    still find them."
  - "Performed by this person" (`actor_id`).
  - The old User record, Account and Membership views go.
- **Tests:** page tests.

### Task 4: Fake API

- **`routes/audit.mts`:** the new filters, `q` with its window rule, the canonical fields plus the
  aliases, and `event_type = action`.
- **`audit-log.mts`:** rows carry `subjectUserId`, the branch acted on (not the selected branch),
  and policy severity (HIGH for the HIGH verbs).
- **`routes/memberships.mts`:** suspend and reactivate write on `MEMBERSHIP`.
- **`FakeAuditEvent`:** gains `subjectUserId`.
- **Specs:** `e2e/fake-api-*.spec.ts` for audit.

### Task 5: Gates, docs, commit

- [ ] Run `pnpm check` and the full e2e suite: green.
- [ ] Register: BG-16 → **Closed** (frontend #NN), keeping Still open; item 10 adopted.
- [ ] Contract: the audit filters and fields.
- [ ] Commit `feat(audit): outcome, severity, branch and text filters, and one user history`.
