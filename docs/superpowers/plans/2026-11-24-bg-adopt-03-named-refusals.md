# bg-adopt 03 — Explain the platform's 4xx and named refusal codes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** Every refusal the platform now names is explained by its code, never by the backend's
`detail`. Business-rule failures are now 4xx, not 500 (BG-07). Maker-checker refusals have their own
codes (BG-08, item 3). Self-changes are refused by code (BG-35). Wrong-context 403s carry a code
(BG-30). A bad sort is 400 (BG-26). The fake API answers these exactly as platform `6a8ea28` does.

**Architecture:**

- Actions keep using `explain(result, code, message)` (`lib/api/explain-action-result.ts`), which
  keys on the problem `code`.
- Cross-cutting codes go into `lib/api/problem.ts`'s `BY_CODE`: wrong context and the maker-checker
  family, so any action's `describeProblem` names them.
- Action-specific wording stays in each action, through `explain`.
- No UI pre-check changes. The UI still disables the maker's own approval until PR 08, so the named
  codes show only on a stale page.

**Spec:** [§8 entry 03](../specs/2026-11-24-backend-gap-adoption-design.md#03--named-refusals) · the
approved copy (designs `#d-errors`) · register BG-07, BG-26, BG-30, BG-35, and items 3 and 4 of
"Backend changes that affect the current UI".

## Wire facts (platform `6a8ea28`)

- **`POST /tenant/users` (invite)**
  - 409 `conflict`: organisation not ACTIVE; a non-REVOKED membership exists; the username is taken.
  - 400 `validation_failed` (no `violations`): bad email; blank username or name; STAFF/ADMIN without
    a branch; no role; a BRANCH role without a branch.
  - 422 `invalid_operation`: an unknown, foreign or non-ACTIVE branch or role; a TENANT role with a
    `branch_id`.
  - A REVOKED membership is re-invited (201). The fake API gains that in PR 18. Until then it
    answers 409 `conflict`, and the wizard still refuses a revoked email before posting.
- **`POST /tenant/memberships/{id}/activate`**
  - 404 `resource_not_found` for an unknown membership.
  - 403 `lifecycle.approver_is_membership_maker` or `lifecycle.approver_is_membership_beneficiary`.
    These run before the state check.
  - 409 `conflict` when the membership isn't pending, or a staff/admin member has no active role or
    branch, or the member's account blocks it: a linked account that isn't ACTIVE or INVITED, or
    one with no identity yet that isn't DRAFT or PENDING_APPROVAL (a suspended account is never
    reactivated by an approval).
  - 202 for a repeat while identity provisioning is pending or FAILED (requeued). 409 once it has
    SUCCEEDED.
- **Membership suspend and revoke:** 403 `lifecycle.self_membership_change` when the membership is
  the caller's own. The check runs after the permission check and the lookup. Revoking a REVOKED
  membership is 409; an unknown id is 404.
- **Branch activate**
  - 403 `lifecycle.approver_is_branch_maker` (the creator) or `lifecycle.approver_is_branch_modifier`
    (anyone who edited it).
  - Tenant routes don't refuse the submitter. Platform routes refuse creator and submitter, both
    with `…_branch_maker`.
- **Platform tenant approve, reject**
  - 403 `lifecycle.approver_is_tenant_maker` (requester or submitter; approve, reject and return).
  - `lifecycle.approver_is_tenant_modifier` (anyone with a successful amend; approve and reject).
  - `lifecycle.approver_is_initial_administrator` (approve only).
- **Platform checker:** 409 `lifecycle.platform_checker_closed` once the window is closed.
- **Platform account suspend and deactivate:** 403 `lifecycle.self_account_change` on your own
  account.
- **Duplicate tenant code on create or amend:** 409 `conflict`. An amend's own unchanged code is no
  duplicate, so the amend's lookup excepts the draft itself; amending a non-draft is the same 409.
- **Wrong context:** 403 `platform_context_required` or `tenant_context_required` (the sentence is
  in `detail`).
- **Invalid or expired token:** 401 problem body, code `authentication_required`, with
  `X-Request-Id` and a `WWW-Authenticate: Bearer` challenge carrying `error="invalid_token"`,
  `error_description="The access token is invalid or has expired."`,
  `error_uri="https://tools.ietf.org/html/rfc6750#section-3.1"` (Spring's
  `BearerTokenErrors.invalidToken`) and `resource_metadata="<origin>/.well-known/oauth-protected-resource"`,
  in that order. A missing token's challenge is the bare `Bearer resource_metadata="…"`.
- **Bad sort:** an off-list `sort_by`, or a `sort_dir` other than ASC/DESC (case-insensitive), is 400
  `invalid_parameter` with one violation on the field. `/branches` has no endpoint gate, so the sort
  is checked before `branch.view`; the roles, permissions and platform list routes check their
  permission first (`@PreAuthorize` or the controller).
- **Role assignment:** assigning a non-ACTIVE role is 422 `invalid_operation`.

## Copy (approved; exact)

| Key / where                                        | Code                                           | Message                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BY_CODE`                                          | `lifecycle.approver_is_membership_maker`       | title "Someone else must approve", message "You invited this person, so someone else must approve them."                                                                                                                                                     |
| `BY_CODE`                                          | `lifecycle.approver_is_membership_beneficiary` | "You can't approve your own membership."                                                                                                                                                                                                                     |
| `BY_CODE`                                          | `lifecycle.approver_is_branch_maker`           | "You drafted or submitted this branch, so someone else must activate it."                                                                                                                                                                                    |
| `BY_CODE`                                          | `lifecycle.approver_is_branch_modifier`        | "You edited this branch, so someone else must activate it."                                                                                                                                                                                                  |
| `BY_CODE`                                          | `lifecycle.approver_is_tenant_maker`           | "You requested or submitted this institution, so another platform administrator must decide it."                                                                                                                                                             |
| `BY_CODE`                                          | `lifecycle.approver_is_tenant_modifier`        | "You amended this draft, so another platform administrator must decide it."                                                                                                                                                                                  |
| `BY_CODE`                                          | `lifecycle.approver_is_initial_administrator`  | "You're named as this institution's first administrator, so you can't approve it."                                                                                                                                                                           |
| `BY_CODE`                                          | `lifecycle.platform_checker_closed`            | "This institution now has its own approvers. The platform can no longer approve here."                                                                                                                                                                       |
| `BY_CODE`                                          | `lifecycle.self_membership_change`             | "You can't suspend or revoke your own membership."                                                                                                                                                                                                           |
| `BY_CODE`                                          | `lifecycle.self_account_change`                | "You can't suspend or deactivate your own account."                                                                                                                                                                                                          |
| `BY_CODE`                                          | `platform_context_required`                    | "This page belongs to the platform workspace. Switch workspace to open it."                                                                                                                                                                                  |
| `BY_CODE`                                          | `tenant_context_required`                      | "This page belongs to an institution workspace. Switch workspace to open it."                                                                                                                                                                                |
| invite (`inviteUser`)                              | 409 `conflict`                                 | Keep the post-failure lookups; they now run on `conflict`, not `internal_error`. Fallback `INVITE_CONFLICT`: "This invitation conflicts with an existing member or username, or the institution isn't active. Check the email and username, then try again." |
| invite                                             | 422 `invalid_operation`                        | `INVITE_STALE_ACCESS`: "A role or branch you picked is no longer active. Go back to Access and choose again."                                                                                                                                                |
| invite                                             | 400 `validation_failed` (backend)              | `INVITE_REJECTED`: "The platform didn't accept these details. Check each step, then try again."                                                                                                                                                              |
| approve (`approveMembership`, approvals `approve`) | 404 `resource_not_found`                       | "This request no longer exists. Refresh the page."                                                                                                                                                                                                           |
| approve                                            | 409 `conflict`                                 | "This request was already decided, or the person has no active role or branch yet. Refresh and check."                                                                                                                                                       |
| revoke                                             | 409 `conflict`                                 | "This membership was already revoked. Refresh and check."                                                                                                                                                                                                    |
| tenant create                                      | 409 `conflict`                                 | Keep the post-failure code lookup on `conflict`; it names `tenant_code_taken`.                                                                                                                                                                               |
| assign role                                        | 422 `invalid_operation`                        | "This role is no longer active, so it can't be assigned."                                                                                                                                                                                                    |

The action-specific 403 `forbidden` explanations stay: a missing permission is still `forbidden`.
Drop their "or you invited them / drafted it" hedges, since that case now has its own code:

- `APPROVE_FORBIDDEN`: "You can't approve this user. Your role doesn't allow it."
- The branch and tenant equivalents likewise.

## Self-revoke warning (BG-35)

`RevokeAssignmentButton` (`modules/administration/branches/components/branch-user-actions.tsx`)
gains `self?: boolean`. With `self`, the dialog title reads "Revoke your own <branch> assignment?",
with a warning Alert: "This is your own access. If <branch> is your selected branch, you'll be asked
to choose your context again."

`user-branch-assignments-table.tsx` passes `self` when the row's user is the signed-in user. It
mirrors `user-role-assignments-table.tsx`'s `self`, and is required there as it is on the role
table. The branch record's Users tab (`branch-users-table.tsx`) passes it per row, from the page's
signed-in user id. It names no branch, so its title reads "Revoke your own assignment at this
branch?" and its warning "If this branch is your selected branch…".

---

### Task 1: Name the cross-cutting codes in `describeProblem`

**Files:** Modify `lib/api/problem.ts`; Test `lib/api/problem.test.ts`.

- [ ] Write a failing test: `describeProblem(new BackendApiError(403, { code }))` returns the table's
      message for each `BY_CODE` row above, and keeps the request id.
- [ ] Implement: add the `BY_CODE` entries, with the titles the copy table gives: "Someone else
      must approve" for `lifecycle.approver_is_membership_maker`, "Someone else must decide" for
      the other seven maker-checker and checker codes, "Not allowed on your own access" for the
      two `self_*` codes, and "Wrong workspace" for the two context codes.
- [ ] Run `pnpm exec vitest run lib/api/problem.test.ts`. PASS.

### Task 2: Re-key the business-rule explanations (BG-07)

**Files:**

- Modify:
  - `modules/administration/users/invite-actions.ts` (`isRuleFailure` → status 409 and code
    `conflict`; explain 422 and backend 400)
  - `modules/administration/users/invite-rules.ts` (copy constants; retire `INVITE_FAILED`)
  - `modules/administration/users/membership-actions.ts` (`APPROVE_FAILED` and `REVOKE_FAILED` are
    retired, with 404/409 copy instead)
  - `modules/administration/approvals/approval-actions.ts` and `approval-copy.ts` (the same approve
    copy)
  - the tenant create action in `modules/platform-administration/tenants/tenant-actions.ts`
    (duplicate code on 409 `conflict`)
  - `modules/administration/roles/role-actions.ts` (`assignRole` explains 422 `invalid_operation`;
    keep the pre-read until PR 06)
  - the matching `*.test.ts` files
- Fake API:
  - `e2e/fake-api/routes/invitations.mts`: every rule answers its status above, not 500.
  - `e2e/fake-api/routes/memberships.mts`: unknown → 404, illegal transition → 409, repeat approve of
    a provisioning member → 202 requeue, re-revoke → 409.
  - `e2e/fake-api/routes/platform-tenants.mts`: duplicate code → 409 `conflict`.
- Specs: `e2e/fake-api-invite.spec.ts`, `e2e/fake-api-users.spec.ts`, `e2e/users-invite.spec.ts`,
  `e2e/users.spec.ts`, `e2e/fake-api-platform-tenants.spec.ts` (any expectation of 500 for these
  rules).

- [ ] Change the unit tests to the new statuses and copy, and run them: FAIL.
- [ ] Implement the actions; run the unit tests: PASS.
- [ ] Change the fake routes and the fake-API specs, then run those specs with
      `pnpm exec playwright test <spec> -c playwright.local.config.ts`: PASS.
- [ ] **Pinned (Review Focus 1):** an approve whose membership was decided elsewhere gets the 409
      copy, the dialog stays open, and its key is reused on retry. Add this as an action unit test.

### Task 3: Name the maker-checker, self and context refusals in the actions (item 3, BG-35, BG-30)

**Files:**

- Modify: `modules/administration/approvals/branch-activation-actions.ts`,
  `modules/administration/branches/branch-actions.ts` (activate),
  `modules/platform-administration/tenants/tenant-actions.ts` (approve and reject: maker,
  modifier, initial administrator), `modules/platform-administration/users/account-actions.ts`
  (`explainAccount`: `lifecycle.self_account_change`), `membership-actions.ts` (suspend and revoke:
  `lifecycle.self_membership_change`).
- Each action relies on `describeProblem`'s `BY_CODE` from Task 1 (no per-action copy needed). The
  task is to remove the hedged `forbidden` copy that claimed the maker case, and to make sure no
  `explain(…, 'forbidden', …)` swallows the named codes. They are distinct codes, so it won't.
- Fake API:
  - `e2e/fake-api/routes/branches.mts` `makerChecker` → 403 `lifecycle.approver_is_branch_maker`.
  - `memberships.mts` → `…_membership_maker` (inviter) and `…_membership_beneficiary` (own
    membership), both before the state check.
  - `platform-tenants.mts` approve/reject → `…_tenant_maker` (creator or submitter).
  - `memberships.mts` suspend/revoke of your own → `lifecycle.self_membership_change`, after the
    permission check and lookup.
  - `platform-records.mts` account suspend/deactivate of your own → `lifecycle.self_account_change`.
  - `access.mts`: the wrong-context sentences become codes `platform_context_required` /
    `tenant_context_required`, with the sentence in `detail`.
  - `http.mts` and `state.mts`: the empty-body 401 becomes a problem body with
    `code: 'authentication_required'`, an `X-Request-Id` and
    `WWW-Authenticate: Bearer error="invalid_token"`.
- Specs: `e2e/fake-api-approvals.spec.ts`, `e2e/fake-api-branches.spec.ts`,
  `e2e/fake-api-users.spec.ts`, `e2e/fake-api-platform-records.spec.ts`,
  `e2e/fake-api-platform-tenants.spec.ts` and `e2e/fake-api.spec.ts` (the 403 and 401 shapes).

- [ ] Write failing action unit tests: each code yields its `BY_CODE` message.
- [ ] Implement; update the fake routes and specs; run them: PASS.

### Task 4: Fake sort refusals are 400 (BG-26)

**Files:**

- Fake API: `e2e/fake-api/routes/roles.mts` (roles and permissions), `tenant-reads.mts` (branches),
  `platform-tenants.mts`. An off-list `sort_by`, or a bad `sort_dir`, answers 400
  `invalid_parameter` with `violations: [{ field: 'sort_by' | 'sort_dir', message }]`.
- Comments that say "anything else is a backend 500" become "anything else is a 400":
  `role-contract.ts`, `branch-contract.ts`, `tenant-contract.ts`, `tenant-query.ts`,
  `tenant-directory-table.tsx` (and its test), `lib/api/list-sort.test.ts`,
  `institution-branch-query.test.ts`.
- Specs: `e2e/fake-api-roles.spec.ts`, `fake-api-branches.spec.ts`,
  `fake-api-platform-tenants.spec.ts`, `fake-api-platform-records.spec.ts`.

- [ ] Change the specs to expect 400 and run them: FAIL. Change the fake routes: PASS.

### Task 5: Warn on revoking your own branch assignment (BG-35)

**Files:** Modify `modules/administration/branches/components/branch-user-actions.tsx`
(`RevokeAssignmentButton` `self?: boolean`) and
`modules/administration/users/components/user-branch-assignments-table.tsx` (pass `self`). Tests:
their `*.test.tsx`, plus an `e2e/users.spec.ts` case that revokes the signed-in user's own branch
assignment from the user record and sees the warning.

- [ ] Write a failing RTL test: with `self`, the dialog shows the title and warning above. Without
      it, no warning.
- [ ] Implement; PASS.

### Task 6: Gates, docs, commit

- [ ] Run `pnpm check` and the full e2e suite: green.
- [ ] Register:
  - BG-07 → **Adopted** (frontend #NN), with **Still open** unchanged.
  - BG-26, BG-30 and BG-35 → **Closed** (frontend #NN).
  - Items 3 and 4 of "Backend changes…" marked adopted.
  - BG-08's "explain each code" part done.
- [ ] Contract document: update the status column for the rows whose 500s are now 4xx (invite,
      activate, revoke, transitions, tenant create, sort) and the 403 codes. Each cell cites
      `6a8ea28`.
- [ ] Commit `fix(errors): explain the platform's 4xx and named refusal codes`.
