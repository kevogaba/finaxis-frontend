# bg-adopt 10 — Return, withdraw and discard branch requests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** A pending branch can go back to draft. Its maker withdraws it; a checker returns it for
changes. A draft can be discarded. Each needs a reason, and a returned draft shows why (BG-01,
branch part).

**Architecture:**

- **State machine:** two lifecycle actions join `branch-rules.ts`'s state machine, plus one action
  on the approval page.
- **Dialogs:** reuse the kit `ReasonDialog`, which forwards the minted idempotency key, and
  `transition()`/`reasonedInput` in `branch-actions.ts`.
- **Withdraw or Return:** chosen from the branch's `createdBy`/`submittedBy` (PR 08) against the
  caller.

**Spec:** [§8 entry 10](../specs/2026-11-24-backend-gap-adoption-design.md#10--branch-requests)
· designs `#d-branch-req` · register BG-01.

## Wire facts (platform `6a8ea28`)

- **`POST /branches/{id}/return`** (and the platform route
  `POST /platform/tenants/{tenant_id}/branches/{id}/return`, used in PR 15)
  - Body: `{ reason }`, 3–500 characters. PENDING_APPROVAL → DRAFT, `status_reason` = the reason.
  - Gate: `hasAnyAuthority('branch.create', 'branch.approve')`.
    - The creator or latest submitter withdraws, which needs `branch.create`.
    - Anyone else returns, which needs `branch.approve`.
    - Both are checked on the target branch, plus `branch.view`.
  - The tenant must be ACTIVE or PROVISIONING.
  - Wrong state is 409.
  - Answers the branch detail.
  - Platform source: `BranchProvisioningService.kt:290-338`.
- **`POST /branches/{id}/discard`**
  - Body: `{ reason }`, required, 3–500 characters. DRAFT → CLOSED.
  - Needs `branch.create` **tenant-wide**, plus `branch.view`.
  - The head office (`branch_code == "HEAD_OFFICE"`) is 409
    `lifecycle.head_office_branch_protected`.
  - A draft with an ACTIVE child branch or an active assignment is a plain 409 `conflict`.
  - Afterwards the code stays taken, `closed_on` is set, and `opened_on` is null.
  - Platform source: `BranchProvisioningService.kt:423-447`.
- **Audit actions:** check `grep -rn '"branch\.' BranchProvisioningService.kt` for withdraw
  (`branch.withdraw`), return and discard.

## Tasks

### Task 1: Rules and actions

- **`branch-rules.ts`**
  - New lifecycle actions `'withdraw' | 'return'` (PENDING_APPROVAL) and `'discard'` (DRAFT).
  - `export function pendingBranchAction(branch: { createdBy: ActorRef; submittedBy: ActorRef }, callerId: string): 'withdraw' | 'return'`:
    `'withdraw'` when the caller is the creator or submitter.
  - Withdraw needs `branch.create`, Return needs `branch.approve`, Discard needs `branch.create`
    tenant-wide (`canTenantWide`). All also need `branch.view`. **As built:** each goes through
    entry 09's `canActOnBranch` on the target branch, as Submit and Activate do: a branch-scope
    grant never reaches a PENDING_APPROVAL or DRAFT branch (#242), so all three need their code
    and `branch.view` tenant-wide, on the branch record and the approval page alike. Withdraw and
    Return pass `RETURN_ROUTE_CODES` for the route's own gate
    (`hasAnyAuthority('branch.create', 'branch.approve')`, either code in the selected context),
    and the target check takes the intent's code; the fake API's return route does the same.
  - Discard is not offered when the branch code is `HEAD_OFFICE` or its type is HEAD_OFFICE.
    **As built:** by the code `HEAD_OFFICE` only, as the platform's 409 is
    (`JooqOrganisationBranchProvisioningStore.isHeadOffice` matches `branch_code`, never the type),
    so a draft merely typed HEAD_OFFICE, which the platform discards, is offered Discard.
- **`branch-actions.ts`**
  - `returnBranch`, which serves both Withdraw and Return (the same route), and `discardBranch`.
  - Both use the required-reason schema, 3–500 characters.
  - Both explain `lifecycle.head_office_branch_protected` ("The head office can't be discarded.")
    and 409 `conflict` ("This draft still has an active child branch or assignment, or it changed.
    Refresh and check.").
- **Tests:** rule tables and action tests, including retry key reuse (Review Focus 2).

### Task 2: UI

- **Branch record hero** (`branch-lifecycle-actions.tsx` `copyFor`)
  - **Withdraw:** outlined; title "Withdraw <name>?"; body "It goes back to draft so you can change
    it and submit it again."
  - **Return for changes:** outlined; title "Return <name> for changes?"; body "It goes back to
    draft. Its maker sees your reason."; field "What needs to change".
  - **Discard draft:** error tone; title "Discard the <name> draft?"; body "The draft closes and
    can't be reopened. Its code <CODE> stays taken."
- **Approval branch page:** `decision-bar.tsx`, `availableBranchDecisions` and `decisionCopy` add
  Return beside Activate (Withdraw when the caller is the maker).
- **Returned draft:** a DRAFT branch with `statusReason` shows "Returned: <reason>" in its subtitle
  and Overview. **As built:** "Sent back: <reason>", and the approval page's note reads "Sent back
  to draft: it can be changed and submitted again.": the record can't tell a withdrawal from a
  return (`status_reason` only, no actor of the last transition), so the copy names neither.
- **Tests:** RTL; e2e:
  - a checker returns a pending branch with a reason, then the maker sees it as a draft with the
    reason;
  - the maker withdraws their own pending branch;
  - discard a draft;
  - head office offers no Discard. **As built:** no e2e: a tenant's head office is seeded ACTIVE
    with the tenant and is never a draft, so the UI can't reach the case; the rule, the record's
    RTL test and the fake API's head-office 409 (`e2e/fake-api-branches.spec.ts`) cover it.

### Task 3: Fake API

- **`routes/branches.mts`:** `return` and `discard` routes with the rules above, including
  creator/submitter → `branch.create`, else `branch.approve`, the head-office 409, the
  child/assignment 409, `status_reason`, `closed_on` and the audit rows.
- **Spec:** `e2e/fake-api-branches.spec.ts`.

### Task 4: Gates, docs, commit

- [x] Run `pnpm check` and the full e2e suite: green.
- [x] Register: BG-01's branch return/withdraw/discard is adopted (frontend #NN). BG-01 stays Partly
      fixed until PRs 12–13.
- [x] Contract: add the return and discard rows.
- [x] Commit `feat(branches): return, withdraw and discard branch requests`.
