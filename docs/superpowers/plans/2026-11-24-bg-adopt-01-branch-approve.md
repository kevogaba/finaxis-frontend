# bg-adopt 01 — Gate branch approval on `branch.approve` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** Restore the Branch activation tab, the Activate action, the bell's branch count, the
overview's branch card and the Approvals menu entry. The platform deprecated `branch.activate`
(V21), so nobody holds it any more, and these are hidden from everyone.

**Architecture:** One permission code changes in the three gate definitions; every consumer reads
those constants. The fake API's activate route and its scenarios move to `branch.approve`. The audit
action stays `branch.activate`: the platform still writes that action name.

**Spec:** [§8 entry 01](../specs/2026-11-24-backend-gap-adoption-design.md#01--branch-approval-on-branchapprove)
· register "Backend changes that affect the current UI" item 1.

---

### Task 1: Gate branch approval on `branch.approve`

**Files:**

- Modify: `modules/administration/approvals/approval-rules.ts` (`BRANCH_ACTIVATION_CODES`)
- Modify: `modules/administration/branches/branch-rules.ts` (`PERMISSION.activate`)
- Modify: `modules/administration/administration-navigation.ts` (the queue's `requiresAny`)
- Modify: `e2e/fake-api/routes/branches.mts` (activate's permission, not its audit action)
- Modify: `e2e/fake-api/scenarios.mts` (`BRANCH_ADMIN_CODES` and the scenarios that add the code)
- Test: every unit and e2e test that names `branch.activate` as a permission:
  - `approval-rules`, `branch-rules`, `administration-navigation`, `tenant-notifications`,
    `overview-rules` and `branch-activation-actions`
  - the approvals pages, layout and id guard, the branch record layout and `admin/page`
  - `e2e/fake-api-overview.spec.ts` and the comment in `e2e/users-invite.spec.ts`

**Interfaces:**

- Produces: `BRANCH_ACTIVATION_CODES = ['branch.approve', 'branch.view'] as const`, and
  `branchActionPermission('activate') === 'branch.approve'`.
- Unchanged: the audit vocabulary's `branch.activate` action. It is an action name, not a
  permission.

- [ ] **Step 1:** In the tests, replace `branch.activate` with `branch.approve` wherever it is a
      permission code. `audit-vocabulary` and the fake route's audit-action argument stay.
- [ ] **Step 2:** Run `pnpm test:run`. Expected: the gate tests fail (tab, bell, navigation and
      Activate hidden).
- [ ] **Step 3:** Change the three gate definitions, the fake activate route's permission and the
      scenarios' grants to `branch.approve`.
- [ ] **Step 4:** Run `pnpm check`, then the e2e suite. Expected: all pass. The e2e approvals and
      overview specs exercise the restored tab, bell and card through the fake scenarios.
- [ ] **Step 5:** Docs.
  - Register item 1: "Adopted in frontend #NN".
  - BG-01 and BG-22 **To adopt**: mark the `branch.approve` gate done.
  - Contract row `POST /branches/{id}/activate`: `branch.approve` (B) + `branch.view`.
- [ ] **Step 6:** Commit `fix(approvals): gate branch approval on branch.approve`.
