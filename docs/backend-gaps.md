# Backend gaps

Gaps between the Administration prototype's intended functionality and the platform API, found while
scoping the prototype build-out (2026-09-25) and re-verified against the platform on 2026-11-16 and
2026-11-24. The frontend does **not** change the backend: each gap below is handled in the UI by
omission, derivation, or a guided state, and is listed here so it can be tackled separately in the
platform repository.

- **Evidence:** found against backend source `/home/ogaba/finaxis/platform` @ `7a7f4c3` (file
  references under **Gap** are relative to `src/main/kotlin/com/finaxis/platform/` and may have
  drifted) and read-only probes of `https://finaxis-dev.api.ogaba.dev`. Re-verified on 2026-11-16
  against `kevogaba/finaxis-platform` `main` @ `3b462c3`, and on 2026-11-24 @ `6a8ea28`, which adds
  platform #343, #344 and #346 (BG-34, BG-35 and the self-assignment guard), by reading its code,
  migrations and tests (no live probes). The adoption plan's second pass the same day
  ([spec](superpowers/specs/2026-11-24-backend-gap-adoption-design.md) §6) corrected 22 details
  against the code; each is marked **Verified 2026-11-24** in its entry.
- **Platform references:** "platform #NNN" is an issue or pull request in
  `kevogaba/finaxis-platform`. Tracker platform #177 lists BG-01–BG-33; BG-34 and BG-35 are platform
  #340 and #341, and the self-assignment guard is platform #342.
- **Priority:** **P0** blocks a core prototype flow · **P1** degrades a flow or forces workarounds ·
  **P2** polish, consistency, or documentation.
- **Status:** **Open**, the backend still has the gap · **Backend fixed**, the platform closed it
  but the UI still does what **Frontend handling** says until it adopts the fix (**To adopt**) ·
  **Partly fixed**, part shipped and the rest stays under **Still open**, which says when an owner
  decision (an ADR) declined it · **Adopted**, the frontend uses everything the platform shipped and
  the platform's remaining work stays under **Still open** · **Closed**, the frontend adopted the fix
  and nothing is left. Limits the platform kept on purpose are listed under **Still open** even for a
  fixed gap.
- **Frontend handling** describes what the UI does until the gap closes. Wire details are in
  [`docs/superpowers/specs/2026-09-25-admin-prototype-parity-api-contract.md`](superpowers/specs/2026-09-25-admin-prototype-parity-api-contract.md),
  which mirrors `7a7f4c3`: where a gap is fixed, **Backend resolution** and the platform's
  `docs/api/foundation-api.md` are the current wire reference until the contract is refreshed.
- Keep this document current: when the frontend adopts a fix, mark the entry **Closed** (or
  **Adopted**) with the frontend PR, and update the contract and the e2e fake API (`e2e/fake-api/`)
  in the same change. The adoption order is the stack in
  [`plans/2026-11-24-bg-adopt-00-index.md`](superpowers/plans/2026-11-24-bg-adopt-00-index.md).

## Backend changes that affect the current UI

Fixing these gaps, and the self-assignment guard of platform #342, changed behaviour the current UI
depends on. The e2e fake API still mirrors the old contract, so `pnpm test:e2e` passes against
behaviour the platform has dropped and catches none of the changes below. The first two hide or
miscount things today.

1. **`branch.activate` is deprecated; activation needs `branch.approve`** (V21, platform #208).
   Effective permissions hold only `ACTIVE` codes, so `/auth/me` no longer lists `branch.activate`.
   The UI still gates on it (`BRANCH_ACTIVATION_CODES` in
   `modules/administration/approvals/approval-rules.ts`, the `activate` code in
   `modules/administration/branches/branch-rules.ts`, `administration-navigation.ts`), so the
   Branch activation tab, the Activate action, the bell's branch count and that navigation entry
   are hidden for everyone. Gate on `branch.approve` (BG-01, BG-22). **Adopted** (frontend #107):
   every gate reads `branch.approve`; the audit action stays `branch.activate`.
2. **The platform organisation left `GET /platform/tenants`** (platform #283): the list and its
   `total_items` exclude it unless `include_platform=true`. `visibleTenantTotal`
   (`modules/platform-administration/tenants/tenant-rules.ts`) and `activeInstitutionCount`
   (`modules/platform-administration/overview/overview-rules.ts`) still subtract it, so the
   directory's unfiltered count and the overview's active count read one low (BG-29). **Adopted**
   (frontend #108): both counts are the platform's totals as returned.
3. **Maker-checker refusals have their own codes** (platform #280, #245): 403
   `lifecycle.approver_is_*` and 409 `lifecycle.platform_checker_closed` (BG-08). The membership,
   approval, branch and tenant actions explain only `forbidden`, so a maker now gets the generic
   permission message. **Adopted** (frontend #109): `describeProblem` names every code, and each
   action's `forbidden` copy now names a missing permission only.
4. **Business-rule failures are 4xx, not 500** (platform #152): a taken email or username and a
   duplicate tenant code are 409 `conflict`; approving or revoking a membership in the wrong state
   is 404 or 409 (BG-07). The invite's `isRuleFailure`, the `TENANT_CODE_TAKEN` field error and the
   `APPROVE_FAILED`/`REVOKE_FAILED` copy key on 500 `internal_error`, so they no longer fire.
   **Adopted** (frontend #109): the invite, tenant-create, approve and revoke explanations key on
   the 4xx statuses, and the post-failure lookups run on 409 `conflict`.
5. **`base_currency` is a read-only mirror of the organisation's currency** (platform #282): `PUT`
   and `DELETE` answer 422 `invalid_operation`. `settingActions` offers Reset whenever a value is
   set, which it now always is, so Reset is offered and fails; the key is also still in
   `EDITABLE_KEYS` (BG-04, BG-12). **Adopted** (frontend #113): base currency is read-only by
   key ("Set from the institution's currency. It can't be changed here."), with no Edit or Reset,
   and has left `EDITABLE_KEYS`.
6. **The maker-checker switches are real** (platform #282, ADR 0032): on by default, and a stored
   `false` lets the tenant's own maker approve (audited), and also the invited person and a branch's
   amenders; reading a switch needs `settings.view`. Settings still says "Always on (enforced)", and
   the approval actions refuse the maker before any write even when the switch is off (BG-01,
   BG-12). **Adopted on Settings** (frontend #113): the three switches show their stored state
   and change after a confirmation; turning a maker-checker switch off needs a reason and says what
   it relaxes. **Adopted on approvals** (frontend #114): the approval pages and the user and
   branch records read the matching switch (`readMakerCheckerSwitch`, with `settings.view`
   tenant-wide) only when the caller made the request; on, the decision shows disabled with its
   reason; off, it stays enabled under a warning that the approval is recorded as a high-severity
   event; unread, it stays enabled and the platform's named refusal explains a refusal. The
   actions no longer refuse the maker before any write.
7. **A mutation implies more views** (ADR 0030, V22): `user.invite` needs `membership.view` and
   `user.view`; `user.assign_role` needs `role_assignment.view`. `INVITE_CODES` and the assign-role
   gates don't include them, so the action shows and then gets a 403. Role composition refuses a
   mutation granted without its view with 400 `validation_failed`; the grant drawer posts codes in
   selection order and doesn't map that 400 (BG-31). **Adopted** (frontend #110): the gates derive
   each mutation's views from `auth/permission-views.ts`, and the grant drawer adds the views a
   mutation needs, posts them first and names the 400.
8. **A revoked member can be re-invited** (platform #304): the invitation reuses the membership,
   sets `created_by` to the re-inviter and audits `membership.reinvite`, not `user.invite`. The
   invite wizard still refuses a revoked member's email, and `getUserInviter` (the `user.invite`
   audit actor) names the original inviter, so the user record disables Approve for the wrong
   person (BG-28, BG-08). **Adopted** (frontend #114) for the maker: the user record and the
   approval page read the inviter from `created_by`, so a re-invited membership's maker is its
   re-inviter. **Adopted** (frontend #125) for the wizard: its Identity step lets a revoked
   member's email through and says, by name, that the invitation re-invites them, and no dialog or
   note calls revocation permanent any more (BG-28).
9. **Roles can be archived, and status changes only from the named state** (platform #289, #302):
   `roleStatusAction` offers Activate for an `ARCHIVED` role, which is a 409 explained as a system
   role, and the default role list leaves archived roles out, so their names on old assignments fall
   back to the short id (BG-27). **Adopted** (frontend #112): each toggle is offered only from its
   named state, an archived role offers nothing, administrators can archive, and the 409 copy names
   archived roles. No screen lists an assignment that can name an archived role (see BG-27).
10. **Audit rows changed shape going forward** (ADR 0031, platform #268, #286): user transitions
    write `user_account.<transition>` on `USER_ACCOUNT`; `membership.suspend` and
    `membership.reactivate` are keyed `MEMBERSHIP` (the audit vocabulary files them under `USER`);
    every authenticated 403 writes an `api.access_denied` row, which Recent activity will show
    (BG-16).
11. **`/auth/me` lists only ACTIVE branches and roles, de-duplicated** (platform #240): the
    profile's Contexts table no longer receives SUSPENDED branches or DISABLED roles (BG-23).
    **Adopted** (frontend #110): the client de-duplication is gone, and the profile lists what
    `/auth/me` sends.
12. **Stricter create validation:** `audit_retention_days` is bounded to 2555–36500 days (the draft
    wizard accepts 0–99999), a `base_currency` initial setting must equal `base_currency_code`, and
    a time zone must be an IANA id the platform knows (raw offsets are 422) (BG-12, BG-13, BG-14).
    **Adopted** (frontend #113): the draft wizard bounds retention to 2555–36500 days, sends no
    `base_currency` setting (it follows the institution's currency), and every time-zone field
    (`isTimeZone`) accepts IANA ids only.
13. **Adding to your own access needs `user.assign_self`** (platform #342, PR #346, ADR 0044, V39).
    Assigning yourself a role or a branch, adding a permission to a role you hold, or re-enabling a
    `DISABLED` role you hold is 403 `forbidden` (detail `Missing permission: user.assign_self.`)
    unless you hold the new code tenant-wide. Only the seeded `TENANT_ADMIN`, the bootstrap
    `local-admin` and `PLATFORM_SUPER_ADMIN` hold it.
    - The user record offers Assign role and Assign branch on your own record, because
      `canAssignUserRole` and `canAssignUserBranch` (`modules/administration/users/user-rules.ts`)
      don't check self. The role page offers Grant permissions and Activate on a role you hold.
      A non-admin such as `IAM_ADMIN` then gets the generic permission message.
    - The grant drawer offers every `ACTIVE` code not yet granted
      (`admin/roles/[roleId]/permissions`), now including `user.assign_self`. Every role refuses it
      with 422 `invalid_operation`, so a selection that includes it fails at that code. The
      catalogue now holds 86 codes.
    - **Adopted** (frontend #111): `ownAccessBlocked` (`user-rules.ts`) checks `user.assign_self`
      and its view tenant-wide. Without it, Assign role and Assign branch on your own record, and
      Grant permissions and Activate on a role you hold (an ACTIVE assignment at any scope; `/auth/me`
      lists ACTIVE roles only, so a `DISABLED` one takes one `size=1` role-assignment read), show
      disabled with the reason. The assign drawers' user search leaves you out, and the grant
      drawer never lists `user.assign_self`.
14. **A blank role description now removes it** (platform #343, BG-34). `updateRole` sends `null`
    for a blank description field. That used to keep the description and now clears it, so the
    edit form's help text ("can be replaced but not removed") and the action's comment are wrong.
    **Adopted** (frontend #112): the help text reads "Optional." and the comment says `null`
    clears it.

## Summary

7 backend fixed · 2 partly fixed · 0 open · 8 adopted · 18 closed.

| ID    | Priority | Status        | Gap                                                                                                |
| ----- | -------- | ------------- | -------------------------------------------------------------------------------------------------- |
| BG-01 | P0       | Adopted       | No approval-request / pending-change model (no return-for-changes, resubmission, branch rejection) |
| BG-02 | P0       | Adopted       | A tenant created through the API cannot onboard a second person through the API                    |
| BG-03 | P0       | Closed        | Branch pinning: a selected branch hides every other branch; draft branches are unreachable         |
| BG-04 | P0       | Closed        | Tenant settings `PUT` fails with 500 and rolls back (per source reading)                           |
| BG-05 | P0       | Closed        | Published OpenAPI casing is wrong and list-item schemas are missing                                |
| BG-06 | P0       | Backend fixed | No platform audit endpoint; tenant audit is 403 in the platform context                            |
| BG-07 | P1       | Adopted       | Business-rule failures return 500 instead of 4xx                                                   |
| BG-08 | P1       | Closed        | Maker identity not exposed; maker-checker 403 indistinguishable from missing permission            |
| BG-09 | P1       | Adopted       | No `user_id` filters on branch assignments / memberships; thin list items                          |
| BG-10 | P1       | Backend fixed | No global user directory or global user read                                                       |
| BG-11 | P1       | Adopted       | Invitation state not exposed; no resend; provisioning can stick with no recovery                   |
| BG-12 | P1       | Backend fixed | Tenant settings catalogue unenforced and missing metadata; platform-only key unmanageable          |
| BG-13 | P1       | Closed        | Branch address never returned; no branch update; opened/closed dates never set                     |
| BG-14 | P1       | Closed        | Tenant legal name / registration number write-only; PATCH wipes them                               |
| BG-15 | P1       | Backend fixed | No aggregate counts (role users/permissions, branch users, tenant branches/users)                  |
| BG-16 | P1       | Backend fixed | Audit search and recording limitations                                                             |
| BG-17 | P1       | Partly fixed  | Missing user profile fields (phone read/edit, member number, last activity, MFA/security)          |
| BG-18 | P1       | Closed        | Platform administrators can't create tenant branches without tenant membership                     |
| BG-19 | P2       | Backend fixed | No global search endpoint                                                                          |
| BG-20 | P2       | Partly fixed  | No export endpoints                                                                                |
| BG-21 | P2       | Backend fixed | No close-of-business readiness checks exposed                                                      |
| BG-22 | P2       | Adopted       | No notifications endpoint                                                                          |
| BG-23 | P2       | Closed        | Context discovery inconsistencies (`total_items` overcount, duplicate branch IDs)                  |
| BG-24 | P2       | Closed        | Bootstrap status can flip COMPLETED → FAILED from unrelated invitee failures                       |
| BG-25 | P2       | Adopted       | Identity and email delivery defaults (Keycloak admin off, email off, no password step)             |
| BG-26 | P2       | Closed        | Ignored or dangerous sort parameters                                                               |
| BG-27 | P2       | Closed        | Role lifecycle gaps (no delete; DISABLED roles assignable; ARCHIVED unused)                        |
| BG-28 | P2       | Adopted       | Terminal states without recovery (rejected tenant code stays taken; revoked member can't return)   |
| BG-29 | P2       | Closed        | PLATFORM organisation included in tenant search results                                            |
| BG-30 | P2       | Closed        | Wrong-context 403s put a sentence in `code`; invalid JWT 401 has no body                           |
| BG-31 | P2       | Closed        | Mutations silently require the matching `.view` permission                                         |
| BG-32 | P2       | Closed        | Documentation drift in the platform repository                                                     |
| BG-33 | P2       | Closed        | Permission codes in /auth/me carry no scope                                                        |
| BG-34 | P2       | Closed        | Role update accepts a blank name; an empty description clears it                                   |
| BG-35 | P2       | Closed        | No documented self-lockout guard: a user may suspend, revoke or deactivate themselves              |

## Details

**Gap** and **Frontend handling** keep their 2026-09-25 wording (the P2 paragraphs are split into
the same bullets): the first is the gap as found, the second what the UI still does.

### BG-01 — No approval-request / pending-change model · P0

- **Status:** Adopted (frontend #120). Platform #155 (sub-issues #178–#182), #221, #222, #282.
  ADR 0029 chose per-resource extensions over an approval-request model, and declined the rest
  (under **Still open**). The branch return, withdrawal and discard were adopted in frontend #117,
  the decision remarks in #119, and the institution return in #120.
- **Gap:** Maker-checker exists only as per-resource transitions: membership activate (approver ≠
  inviter), branch activate (activator ≠ drafter), tenant approve (approver ≠ creator and submitter).
  There is no approval-request entity, no "return for changes", no resubmission, no reject for a
  pending branch, and no decision remarks for approvals that take no body (membership activate,
  tenant approve). Role and branch assignments made after onboarding take effect immediately; the
  prototype's "pending, no effective access" assignments can't exist. Rejecting a tenant is terminal.
  The `require_maker_checker_*` settings are never read. The platform roadmap plans no workflow module
  (`docs/architecture/accounting-foundation.md:653-690`).
- **Frontend handling:** a typed approval inbox (User onboarding, Branch activation) built from
  `membership_status=PENDING_APPROVAL` and `status=PENDING_APPROVAL` reads, with a page per request
  (a user's requested access or the branch, control checks); decisions limited to approve and
  reject-and-revoke for users and activate for branches; assignments presented as immediately
  effective.
- **Backend resolution:**
  - Decision remarks: an optional `reason` (at most 500 characters) on
    `POST /tenant/memberships/{id}/activate`, `POST /platform/tenants/{tenant_id}/memberships/{id}/activate`
    and `POST /platform/tenants/{id}/approve` (platform #179).
  - Return or withdraw a pending branch: `POST /branches/{id}/return` and
    `POST /platform/tenants/{tenant_id}/branches/{id}/return` (reason required, 3–500 characters)
    move it from PENDING_APPROVAL back to DRAFT. Its creator or latest submitter withdraws it
    (`branch.create`); anyone else returns it (`branch.approve`) (platform #180).
  - Discard a draft branch: `POST /branches/{id}/discard` (`branch.create`, reason required) moves
    it from DRAFT to CLOSED; the head office is 409 `lifecycle.head_office_branch_protected`, and the
    code stays taken (platform #222).
  - Return a pending tenant: `POST /platform/tenants/{id}/return` (`tenant.reject`, reason required)
    moves it from PENDING_APPROVAL back to DRAFT, and tenant detail carries `status_reason`
    (platform #181).
  - Branch approval moved from `branch.activate` (now deprecated) to `branch.approve` (V21,
    platform #208).
  - A tenant's requester, submitter or amender can't decide it (platform #221; codes under BG-08),
    and the `require_maker_checker_*` settings are read (BG-12).
- **Still open:**
  - Declined (ADR 0029): no generic approval-request resource, approval history, or approval of
    sensitive settings; role and branch assignments stay immediately effective (platform #182, not
    planned).
  - Rejecting a tenant stays terminal (ADR 0037 decision 13); return for changes replaces it.
  - No return for changes on a membership (rejecting is still revoke), and the membership approval's
    `reason` is stored but not returned (membership detail has no `status_reason`).
  - No platform route to discard a draft branch.
- **Verified 2026-11-24:** branch `activate` already takes an optional `reason` (at most 500), and
  the UI sends it; only membership and tenant approval lacked a remark. Discard needs `branch.create`
  **tenant-wide**, and a draft with an ACTIVE child branch or an active assignment is a plain 409
  `conflict`. A discarded draft ends CLOSED with `closed_on` set and `opened_on` null.
- **Adopted** (frontend #117): a pending branch offers Withdraw to its creator or latest submitter
  (with `branch.create`) and Return for changes to anyone else (with `branch.approve`), on the branch
  record and beside Activate on the approval page; a draft offers Discard draft (never the head
  office). Each needs its code and `branch.view` tenant-wide, since a branch-scope grant never
  reaches a pending or draft branch (#242, `canActOnBranch`). Each takes a required reason of 3–500
  characters, and a draft with a reason shows "Sent back: <reason>" (the record can't tell a
  withdrawal from a return). The head-office 409 and the closure guard's 409 are named, and a
  return of a request decided elsewhere says so.
- **Adopted** (frontend #119): Approve takes an optional remark (decision Q7) on the user record,
  the user approval page and the institution record: a "Remark (optional)" field ("Recorded with the
  approval. Up to 500 characters."), sent as `{reason}` only when it isn't blank, and refused over
  500 characters before any call. The platform trims it, drops a blank one and refuses one over 500
  (`validation_failed`). A member's remark is on the `user.approve` audit row, which the user's audit
  trail shows (and is the membership's status reason on a 200, which no read returns); an
  institution's is on its approval's transitions and audit rows and becomes its `status_reason`,
  which its detail returns. Branch activation already sent one, and keeps its "Reason (optional)"
  field.
- **Adopted** (frontend #120): a pending institution offers Return for changes (`tenant.reject`
  with `tenant.view`) on its record, between Approve and Reject, outlined. Its dialog ("Return <name>
  for changes?", "It goes back to draft. The requester sees your reason and can amend and resubmit
  it.") takes a required "What needs to change" of 3–500 characters and forwards the minted key.
  Its requester or submitter sees it disabled with the maker caption, as Approve and Reject;
  `lifecycle.approver_is_tenant_maker` is explained by `describeProblem`, and the 409 says the
  request was decided or returned elsewhere. A draft with a `status_reason` shows "**Returned for
  changes.** <reason>" on its Overview until it is submitted again. The platform refuses no
  amender a return (`refuseAmender = false`), and a return resets the bootstrap record, so
  `submitted_by` reads null until the next submission. The e2e fake API mirrors the route, stores
  every transition's reason (or null) as `status_reason`, and clears `submitted_by` on return and
  reject. (Activation is gated on `branch.approve` since frontend #107.)

### BG-02 — A tenant created through the API cannot onboard a second person · P0

- **Status:** Adopted (frontend #122). Platform #153, #223, #250, #282 (ADR 0028, ADR 0032). The
  maker-checker switches were adopted in frontend #114.
- **Gap:** Tenant approval creates one user, the `TENANT_ADMIN` bootstrap admin. That admin cannot
  approve their own invites (maker-checker 403) nor activate branches they drafted. Platform
  administrators cannot step in: tenant routes reject the platform context
  (`lifecycle/adapter/inbound/web/CallerContextResolver.kt:78-94`), and platform branch creation also
  requires tenant membership (`lifecycle/application/BranchProvisioningService.kt:38-42`). No setting
  disables the rule; the local seed works only because migration V4 seeds a second actor.
- **Frontend handling:** approve controls are disabled for the maker with an explanation; the overview
  readiness item "People" flags tenants with fewer than two active members (layer 14), and says that
  a platform administrator can approve the first ones (frontend #122).
- **Backend resolution:**
  - A platform checker can approve a new tenant's first members and branches:
    `POST /platform/tenants/{tenant_id}/memberships/{id}/activate` (`user.approve` in the platform
    organisation) and `POST /platform/tenants/{tenant_id}/branches/{id}/submit` (`branch.create`),
    `/activate` (`branch.approve`) and `/return`. Memberships only while the tenant has no ACTIVE
    member beyond its bootstrap administrator, branches only while it has no ACTIVE branch beyond the
    head office; otherwise 409 `lifecycle.platform_checker_closed`. The platform checker is never
    the maker, beneficiary, submitter or amender.
  - Alternatively the tenant stores `require_maker_checker_for_user_invites` or
    `require_maker_checker_for_branch_creation` as `false`, and its maker may approve (audited
    HIGH, ADR 0032).
  - Tenant approval refuses the account named as the first administrator: 403
    `lifecycle.approver_is_initial_administrator`.
- **Still open:** tenant routes still refuse the platform context, and there is no platform invite
  route, so the tenant administrator is always the maker of an invitation. The checker window can
  reopen if the tenant suspends members or branches (accepted on platform #223).
- **Verified 2026-11-25** (platform `6a8ea28`): the bootstrap administrator and the head office are
  the rows the system actor made, which a platform caller reads as `created_by: null`, and the system
  makes at most one of each. The window is checked after the maker refusals on the membership route
  (an inviter or the member is refused by name even once it has closed) and before them on the
  branch routes. Activation needs an ACTIVE tenant; submit and return an ACTIVE or PROVISIONING one;
  a withdrawal by the branch's creator or latest submitter is not bounded by the window. Each route
  writes the FSM's row and the checker's (`user.approve` with `checkerScope = PLATFORM`,
  `branch.submit_as_platform_checker`, `branch.activate_as_platform_checker`,
  `branch.return_for_changes_as_platform_checker`) in the tenant's own log.
- **Adopted** (frontend #114): the switches are read (`GET /tenant/settings/{key}`) before the maker
  is refused, and a switch that is off lets the maker decide.
- **Adopted** (frontend #122): the institution record's Users and Branches tabs read each window
  with one bounded read of the institution's ACTIVE rows (`size=1`): open while there are none, or
  one with no maker. While it is open the tab says so ("Platform checking is open: … has no active
  member besides its first administrator …", or "… no active branch besides its head office …"),
  and its rows offer the checker's actions: Approve on a pending member (`user.approve` with
  `membership.view`, an ACTIVE institution), Submit on a draft (`branch.create`), and Return and
  Activate on a pending branch (`branch.approve`; Activate for an ACTIVE institution only), each
  with `branch.view`. Approve is disabled, with the reason, for the member's inviter and the member
  themself, and Activate for the branch's creator or latest submitter, who is offered Withdraw
  instead, also once the window has closed. Once it has closed, the tab says the institution
  approves its own members (or branches) and offers no checker action. A failed window read offers
  the actions, and the named 409 explains a closed window. The People readiness item mentions the
  platform checker.

### BG-03 — Branch pinning · P0

- **Status:** Closed (frontend #116). Platform #154, #242.
- **Gap:** With a branch selected, `verifyBranchContext` returns 404 for any other branch on
  `GET /branches/{id}`, every branch transition, branch-assignment get/assign/revoke, and BRANCH-scope
  role assignment; branch-assignment search is forced to the selected branch
  (`BranchController.kt:830-837`, `BranchAssignmentController.kt:127,381-388`). Single-branch users are
  auto-pinned by `select-organisation` with no way to clear it
  (`iam/application/selection/AuthSelectionService.kt:143-155`). DRAFT/PENDING branches can never be
  selected, so submit and activate only work for a caller with **no** branch selected. The bootstrap
  admin holds only HEAD_OFFICE, so they can list all branches but open or act on none other.
- **Frontend handling:** an "All branches" (institution-level) context for multi-branch users; branch
  pages show a guided "switch to All branches" state instead of a raw 404; single-branch users can't
  administer other branches.
- **Backend resolution:**
  - The selected branch no longer pins administration. Every branch read, transition, assignment
    and BRANCH-scope role action checks the permission on the target branch (a tenant-wide grant or
    a grant on that branch), and a branch-scoped caller gets 403, never 404, for another branch.
  - `POST /auth/select-branch` with `{}` or `{"branch_id": null}` clears the branch for any user,
    single-branch users included (it needs `auth.select_branch` at tenant scope).
  - Branch-assignment search honours an explicit `branch_id`, and a `user_id` search ignores the
    selected branch.
  - A branch-scope grant counts only while its branch is ACTIVE (platform #242).
- **Still open:** by design, sign-in still auto-selects a single branch; a search with neither
  `branch_id` nor `user_id` defaults to the selected branch; DRAFT and PENDING_APPROVAL branches
  can't be selected, so only tenant-wide holders act on them.
- **Verified 2026-11-24:** `select-branch` clears on `{}` or `{"branch_id": null}` but rejects
  `""` (strict UUID). A branch-scoped caller's 403 on another branch's record renders the generic
  `ErrorState` today; it should be the Forbidden state.
- **To adopt:** done in frontend #116.
  - The guided "switch to All branches" states (branch record, approval page, queue note, bell
    hint, overview card), the activation's branch-context refusal and the re-select-organisation
    button are gone. A branch record answering 403 shows the Forbidden state.
  - The context dialog offers All branches to a single-branch member holding `auth.select_branch`
    tenant-wide, and choosing All branches sends `select-branch` `{"branch_id": null}`.
  - Branch actions gate on `canActOnBranch`, the platform's two checks: the route's code in the
    selected context (`/auth/me`'s `permissions`), and the code and its views tenant-wide or at
    the target branch while it is ACTIVE (`/auth/me`'s BRANCH `branch_ids`), whichever branch is
    selected. Activating a pending branch, and the queue, the bell and the overview card for it,
    are tenant-wide only. Role and branch assignment options and revokes follow the same rule;
    institution-scope role assignment needs the grant tenant-wide.
  - `GET /branches` and role-assignment search are target-aware: the directory and branch pickers
    say when a branch-scoped `branch.view` lists only its branches, the role lists and counts say
    the same of a branch-scoped `role_assignment.view`, and the overview reads branch counts only
    with `branch.view` tenant-wide.
  - The branch record's Users tab searches by `branch_id`, and the user record's scan by
    `user_id`. A branch-scoped `branch_assignment.view` says it shows only its branches.
  - The fake API checks the target branch (403 for a branch-scoped caller, 404 for an unknown id
    only to a tenant-wide one) and honours `branch_id`/`user_id`.

### BG-04 — Tenant settings `PUT` fails with 500 · P0

- **Status:** Closed (frontend #113). Platform #150, covered through the idempotency aspect by
  `TenantSettingIdempotentPutIntegrationTests`.
- **Gap:** `IdempotencyExecutor.kt:39` validates each successful mutation response with
  `SafeReplayResponse.kt:112-153`, which rejects any property whose name contains `key`;
  `TenantSettingResponse` has `key`, so every `PUT /tenant/settings/{key}` throws, returns
  `500 internal_error`, and rolls back the write, audit, and event. `TenantSettingsControllerTests`
  (a `@WebMvcTest` without the idempotency aspect) doesn't catch it. Found by source reading; to be
  confirmed live. `DELETE` (204, no body) is unaffected.
- **Frontend handling:** editing ships disabled behind `SETTINGS_EDIT_ENABLED`
  (`modules/administration/settings/settings-flags.ts`), with the reason shown on the Locale &
  currency card. Reset to default (`DELETE`, 204) works. Flip the flag when this closes. The
  overview's Institution profile item reads the stored keys, so a tenant created without them (layer
  16's wizard sends them only when entered) shows Needs attention, saying settings can't be saved
  yet, until then (layer 14).
- **Backend resolution:** `PUT /tenant/settings/{key}` returns 200 with the setting, and a replay
  with the same key returns the same body. The replay-safety filter exempts `key` only for the exact
  setting response shape.
- **Still open:** nothing.
- **To adopt:** done in frontend #113: `base_currency` left `EDITABLE_KEYS` (read-only, BG-12),
  `SETTINGS_EDIT_ENABLED` and `settings-flags.ts` are gone, so Edit (`PUT`, with the dialog's
  minted idempotency key) is live, and the overview's "settings can't be saved yet" is retired
  (Institution profile no longer counts an unset `default_timezone`). The time-zone picker offers
  IANA ids only.

### BG-05 — OpenAPI casing wrong; list-item schemas missing · P0

- **Status:** Closed (frontend #105): nothing to adopt. Platform #151.
- **Gap:** The wire format is snake_case and rejects unknown properties
  (`common/web/api/ApiJsonCodec.kt:27-28`), but springdoc publishes camelCase for every DTO except the
  auth ones (which carry explicit `@Schema(name=…)`). `ApiPage.items` is untyped; the summary item
  schemas (`MembershipSummaryResponse`, `BranchSummaryResponse`, `RoleSummaryResponse`,
  `TenantSummaryResponse`, `PermissionSummaryResponse`, `AuditEventSummaryResponse`,
  `BusinessDateHistoryEntryResponse`, `AvailableOrganisationResponse`, `AvailableBranchResponse`) are
  absent. A client generated from the spec sends camelCase and gets `400 invalid_json`.
- **Frontend handling:** hand-written zod wire schemas from source; no generated client.
- **Backend resolution:** springdoc publishes the codec's snake_case for every schema property and
  `required` entry; pages are typed per item type (e.g. `ApiPageRoleSummaryResponse`) and the nine
  summary item schemas are published; `sort_dir` is an `ASC`/`DESC` enum and `sort_by` lists its
  values per endpoint. `OpenApiWireNamingContractTests` pins it. The wire format didn't change.
- **Still open:** nothing.
- **To adopt:** nothing required. The published document is now a usable reference; generating a
  client from it would be a deliberate change to the hand-written zod contracts.

### BG-06 — No platform audit · P0

- **Status:** Backend fixed. Platform #157, #224.
- **Gap:** There is no platform audit endpoint, and `/tenant/audit-events` returns 403 in the platform
  context. Platform actions on a tenant are written to that tenant's audit log (unreadable from the
  platform context); platform user lifecycle events are written under the PLATFORM organisation and
  can't be read at all.
- **Frontend handling:** the existing `/platform-admin/audit` page (which only worked against the E2E
  fake) is removed; tenant records have no Audit tab in the platform workspace.
- **Backend resolution:** `GET /platform/audit-events` and `GET /platform/audit-events/{event_id}`
  read the platform organisation's log; `GET /platform/tenants/{tenant_id}/audit-events` reads one
  tenant's log. All need `audit.view` in the platform organisation (PLATFORM_SUPER_ADMIN and
  PLATFORM_SUPPORT hold it) and take the tenant search's filters; a tenant caller gets 403
  `platform_context_required`.
- **Still open:** by owner ruling, the platform list items return `null` for `before_json`,
  `after_json`, `metadata_json`, `user_agent`, `ip_address` and `actor_external_subject`, and
  `actor_subject` is a 400 there. No route reads one of a tenant's events from the platform (the
  detail route reads platform rows only), and there is no platform export (ADR 0039).
  `/tenant/audit-events` still refuses the platform context, by design.
- **Verified 2026-11-24:** an unknown `tenant_id` on `/platform/tenants/{tenant_id}/audit-events`
  answers an empty page, not 404; a tenant caller without `audit.view` gets plain `forbidden`, with it
  `platform_context_required`. The audit page's tenant lookups (user and branch names, the
  organisation's time zone) are 403 in the platform context, so the platform pages need their own.
  The tenant summary schema parses platform items; only the detail schema (which requires
  `metadata_json`) doesn't.
- **To adopt:** restore `/platform-admin/audit` and add an Audit tab to institution records, gated on
  `audit.view` in the platform context. Parse the platform items with their own schema: the tenant
  detail schema requires `metadata_json`.

### BG-07 — Business-rule failures return 500 · P1

- **Status:** Adopted (frontend #109). Platform #152. No listed case returns 500 any more, but
  most share a generic code.
- **Gap:** `require`, `requireNotNull`, `error`, and unique-constraint violations fall through to the
  generic handler as `internal_error` (`common/web/api/ApiExceptionHandler.kt:243-258`). Hits:
  invite validation (organisation not ACTIVE, inactive branch, missing/non-ACTIVE role, scope/branch
  mismatch, STAFF/ADMIN without a branch, no role, existing membership, taken username with a new
  email — `UserProvisioningService.kt:52-54,327-389`); approving an unknown, non-pending or
  provisioning membership, or one whose user lacks an active role (or, for a staff or admin member,
  an active branch assignment); suspend/reactivate/revoke of unknown memberships and revoke of a
  revoked one; reject/suspend of unknown tenants; activate/suspend/reactivate of unknown
  branches; duplicate tenant codes; any invalid `sort_by`/`sort_dir`; a BRANCH-scoped role
  assignment with no `branch_id` (`RoleAssignmentController`'s `requireNotNull`, source f74e44b;
  the contract's 409 is from 7a7f4c3).
- **Frontend handling:** pre-validation of every known trigger (e.g. the invite wizard checks the
  email against the institution's users on its Identity step and every rule it can see on its Access
  step; sort allow-lists), a tenant-code lookup after a create's 409 to name a duplicate (the
  create goes first, so a replayed create is never turned away; the invitation likewise names a
  taken email, or a username a member here holds, only after its 409), and a generic error showing
  `request_id`. A username taken by an account in another institution can't be checked from the
  tenant context, so the invitation's 409 then names every cause a 409 can have; its 422 says a
  role or branch went stale, and the platform's own 400 says the details weren't accepted. Approve
  explains 404 (gone) and 409 (decided, or no active role or branch), revoke 409 (already revoked),
  assign role 422 (no longer active), and amend's 409 hedges between a taken code and a draft no
  longer a draft (frontend #109). The user record still withholds Approve once approval ran, and
  offers Retry provisioning in its place once provisioning failed (BG-11, frontend #124).
- **Backend resolution:**
  - Invite: an organisation that isn't ACTIVE is 409 `conflict`. An invalid email, a blank username
    or display name, STAFF/ADMIN without a branch, no role, or a BRANCH role without a branch is 400
    `validation_failed`. An unknown, foreign or non-ACTIVE branch or role, or a TENANT role with a
    `branch_id`, is 422 `invalid_operation`. An existing membership or a taken username is 409
    `conflict` (a REVOKED membership is re-invited instead, BG-28).
  - Approve: an unknown membership is 404 `resource_not_found`; one that isn't pending, has no
    active role, or is a staff/admin member without an active branch is 409 `conflict`; a repeat
    while provisioning is 202 (BG-11).
  - Revoking a revoked membership is 409; an unknown id on a transition route is 404; an illegal
    transition is 409; a duplicate tenant code is 409 `conflict`; a BRANCH-scope role assignment
    without `branch_id` is 400 `validation_failed` (violation on `branch_id`); a bad sort is 400
    `invalid_parameter` (BG-26).
- **Still open:** the refusals mostly share `conflict`, `validation_failed` or `invalid_operation`
  and differ only in `detail`, which the UI must not echo, so a taken email, a taken username, an
  inactive organisation and a missing prerequisite can't be told apart. Service-level 400s carry no
  `violations`. Unclassified `IllegalArgument`/`IllegalState` failures stay 500 on purpose (internal
  invariants). Suggested: specific codes for the invite and approve refusals.
- **To adopt:** done in frontend #109: the invite, tenant-create and approve/revoke explanations
  key on the new statuses instead of 500 `internal_error`, the post-failure lookups that name a
  cause run on 409 `conflict` (the codes don't name one), and the e2e fake API answers each rule
  with the platform's status.

### BG-08 — Maker not exposed; ambiguous 403 · P1

- **Status:** Closed (frontend #114). Platform #156 (also #221, #251), with one code per cause
  instead of a single `maker_checker_violation`.
- **Gap:** No membership, branch, or tenant DTO exposes the maker; the only source is the audit
  `actor_id` on `user.invite` / `branch.create_draft` / `organisation.create_draft`/`submit`, which
  needs `audit.view` (and isn't readable at all for tenants from the platform context). Maker-checker
  violations return `403 forbidden`, identical to a missing permission.
- **Frontend handling:** maker looked up from audit when `audit.view` is held; otherwise the approve
  action stays enabled and a 403 is explained as "permission or maker-checker". The user record
  disables Approve for the user's inviter (the `user.invite` actor). The approval queue's pages
  disable Approve for the inviter and Activate for the drafter the same way, and their actions
  refuse before any write; when the maker can't be read, the control check reads "Verified by the
  platform on approval".
- **Backend resolution:**
  - Makers as `{id, display_name}`, `null` when unknown, the system, or hidden: `created_by` on
    membership items and detail and on `/tenant/users` items; `created_by` and `submitted_by` on
    branches (tenant and platform routes); `requested_by` and `submitted_by` on tenants for
    platform callers (`null` on `GET /tenant`). A tenant caller sees a maker only when the maker is
    a member of that tenant.
  - Refusals, all 403: `lifecycle.approver_is_membership_maker`,
    `lifecycle.approver_is_membership_beneficiary`, `lifecycle.approver_is_branch_maker`,
    `lifecycle.approver_is_branch_modifier`, `lifecycle.approver_is_tenant_maker` (approve, reject,
    return), `lifecycle.approver_is_tenant_modifier` (approve, reject) and
    `lifecycle.approver_is_initial_administrator`. A closed platform-checker window is 409
    `lifecycle.platform_checker_closed`. A missing permission stays `forbidden`. Each refusal writes
    a DENIED, HIGH audit row.
- **Still open:** nothing. A tenant's stored `require_maker_checker_*` = `false` lets its maker
  approve (BG-12).
- **Verified 2026-11-24:** the tenant activate route refuses the branch's creator and amenders but
  **not its submitter**; the platform route refuses the submitter too. Nothing exposes amenders, so
  `approver_is_branch_modifier` can only be explained after the refusal. Tenant **reject** also
  answers the `approver_is_tenant_*` codes. `/tenant/users` items and detail also carry
  `membership_id`, `membership_type`, `created_at` (the account's) and `membership_created_at`.
- **To adopt:** done in frontend #114. The branch, membership, user and tenant contracts parse the
  makers with one `actorRefSchema` (`lib/api/wire.ts`), and the users' `membership_id`,
  `membership_type`, `created_at` and `membership_created_at`. The audit-log lookups
  (`getMakerEvent`, `knownMaker`, `getBranchMaker`, `getUserInviter`) are gone, so naming a maker
  needs no `audit.view`: the approval pages show Invited by, or Drafted by and Submitted by ("You
  (…)" for the caller, "—" when the record names nobody), and the institution Overview shows
  Requested by and Submitted by. `makerGate` (`modules/administration/approvals/maker-checker.ts`)
  decides from the record's maker, the caller and the switch; the institution record disables
  Approve and Reject for its requester or submitter (no switch applies to the platform checker).
  The actions' pre-write maker refusals are gone: the platform decides, and each code is explained
  since frontend #109 (`describeProblem`). Amenders aren't exposed, so `…_branch_modifier` and
  `…_tenant_modifier` are still explained only after the refusal.

### BG-09 — Missing filters; thin list items · P1

- **Status:** Adopted (frontend #123). Platform #159 (sub-issues #188, #189, #190).
- **Gap:** Branch assignments have no `user_id` filter (and are forced to the selected branch);
  memberships have no `user_id` filter; `/tenant/users` items lack `membership_id`, `membership_type`,
  and dates; membership items lack names; assignment items are IDs only; branch items lack timezone,
  parent, and dates; tenant items lack currency, timezone, and bootstrap status. Role items lack
  description and dates. Roles can be searched (`q`) but not fetched by a set of ids. `sort_*` on
  memberships and branch assignments is accepted but ignored; `/tenant/users` has no sort.
- **Frontend handling:** memberships resolved with `q=<email>` (at most 5 pages of 100, matched on
  the user id); a user's branch assignments found by a bounded scan and flagged "partial" (at most
  500 active assignments); names resolved per visible page; the role index reads at most the first
  500 roles by name, because roles can't be looked up by a set of ids, so past 500 a role's name on
  an assignment falls back to its short id; the Assign-role picker reuses that index rather than
  searching, so past 500 it says so; lists show only what items carry (the role directory shows
  role, code, type, and status only). The roles page also departs
  from the prototype in three smaller ways: the Overview's "Active assignments" counts assignments,
  not distinct users; the toolbar search commits on Enter or blur; and backend `validation_failed`
  violations aren't mapped onto form fields (the forms apply the same rules client-side). The
  approval queue's User onboarding tab keeps the users endpoint's own order: the contract calls it
  newest user first (its §E.3 lists no sort parameter), but doesn't say which date that is, and
  neither user nor membership items carry dates.
- **Backend resolution:**
  - `GET /tenant/memberships`: filters `user_id` and `member_number`; items add `username`,
    `email`, `display_name`, `primary_branch_name`, `created_at`, `created_by` and `member_number`.
  - `GET /tenant/branch-assignments`: filter `user_id`, which ignores the selected branch; items add
    `username`, `display_name`, `branch_name` and `assigned_at`.
  - `/tenant/users` and `/platform/tenants/{id}/users` items add `membership_id`, `membership_type`,
    `created_at` (the account's), `membership_created_at` and `created_by`.
  - Branch items add `parent_branch_id`, `timezone`, `opened_on` and `closed_on`; platform tenant
    items add `base_currency_code`, `timezone` and `bootstrap_status`.
  - Sort is honoured on memberships, branch assignments and `/tenant/users` (BG-26).
- **Still open:** no `ids` filter on roles; role items still lack `description` and dates;
  role-assignment items are still ids only and take no sort; `/platform/tenants/{id}/users` takes no
  sort; user items carry no `member_number`.
- **Verified 2026-11-24:** `GET /tenant/users/{id}` already returns the `membership_id` and
  `created_by`, so the user record needs no membership search at all. `/tenant/users?sort_by=createdAt`
  sorts by the **account's** `created_at`, not `membership_created_at`, so User onboarding's order
  stays undefined for reused and re-invited accounts. With `user_id`, branch-assignment search still
  returns only the branches the caller may view (ACTIVE ones, for a branch-scoped holder).
- **To adopt:** done in frontend #123.
  - The user record and the approval page read the membership by the user read's
    `membership_id` (`GET /tenant/memberships/{id}`), so the email search and its "not found" and
    "couldn't be loaded" notes are gone; the actions, the decisions and the Audit tab's Membership
    view need no lookup, and the approval page takes the membership type from the user read. The
    read needs `membership.view` tenant-wide (BG-33), as the platform checks it.
  - The Branch assignments tab pages `GET /tenant/branch-assignments?user_id=…&status=ACTIVE`
    on the platform (`sort_by=assignedAt`, newest first), with the URL holding page and size and
    each row showing the embedded branch name and `assigned_at`; the Overview counts them with
    one `size=1` read. The 500-assignment scan, its "partial" notes and counts, and the tab's
    branch-index lookups are gone; a branch-scoped `branch_assignment.view` still says it sees
    only its branches, and reads them at All branches too (BG-03).
  - The approval page's Requested access reads one page of 100 branch assignments, like its
    roles, and says so when there are more; the Assign-role drawer's branch scopes read one page
    of 100 and say so when there are more, whether that page held none of theirs or some.
  - Not adopted: `/tenant/users?sort_by=createdAt` sorts by the account's `created_at`, so User
    onboarding keeps the list's default order. The branch record's Users tab still reads each
    visible member for the email, which assignment items don't carry. The role index's ceiling
    of 500 stays until roles take `ids`.
  - The fake API filters memberships by `user_id`, embeds their names, sorts both lists as the
    platform does (an unknown `sort_by` is a 400), embeds the names and `assigned_at` in
    branch assignments, and answers a revoke with the detail shape, as the platform does.

### BG-10 — No global user directory · P1

- **Status:** Backend fixed. Platform #160.
- **Gap:** No endpoint lists all users or fetches a global user by ID; `/platform/users` only has
  suspend, reactivate, deactivate.
- **Frontend handling:** "Platform users" lists the platform organisation's members
  (`/platform/tenants/{PLATFORM}/users`) and opens the same account record as an institution's
  user; an institution's users are on its record's Users tab. Nobody can be found across
  institutions (layer 17).
- **Backend resolution:** `GET /platform/users` (filters `q`, `user_status`, `organisation_id`;
  `sort_by` `createdAt`, `username`, `displayName`, `email`, `userStatus`; items carry
  `membership_count`) and `GET /platform/users/{user_id}` (up to 100 memberships, each with
  `tenant_code`, `organisation_name`, `membership_status` and `membership_type`, plus `phone_e164`
  and `last_login_at`). Both need `user.view` in the platform organisation.
- **Still open:** list items carry a membership count, not the memberships; no `membership_status`
  filter; the detail lists at most 100 memberships.
- **To adopt:** make Platform users a cross-institution directory and show a user's institutions on
  their record.

### BG-11 — Invitation state, resend, and stuck provisioning · P1

- **Status:** Adopted (frontend #124). Platform #162, #274 (also #237, #313).
- **Gap:** No invitation entity, status, expiry, or accepted timestamp; the `identity_dispatch_log` is
  internal. No resend endpoint. With Keycloak admin disabled (the default, `application.yaml:378`),
  approval leaves users in `PROVISIONING_IDP` and memberships `PENDING_APPROVAL` forever; approving
  again returns 500.
- **Frontend handling:** an onboarding state derived from membership + user status; "Provisioning
  identity" shown as a distinct state with guidance; no resend or expiry. The overview notes
  identities still provisioning apart from the approvals waiting, and its users preview reads past
  them (five plus their count, at most 100), so it still lists the requests waiting (layer 14).
- **Backend resolution:**
  - Membership detail, and the activate, retry and resend responses, carry `invitation`:
    `{status, attempts, last_error_code, updated_at}`. `status` is `AWAITING_APPROVAL`,
    `IN_PROGRESS`, `FAILED`, `COMPLETED` or `NOT_REQUIRED`; `last_error_code`, only when FAILED, is
    one of `IDENTITY_PROVIDER_FAILED`, `CONFLICT`, `NOT_FOUND`, `INVALID_STATE`, `DATABASE_ERROR`,
    `UNEXPECTED`, `CANCELLED` or `UNKNOWN`.
  - `POST /tenant/memberships/{id}/invitation/retry` (`user.approve`) requeues identity
    provisioning for a pending membership whose user is PROVISIONING_IDP; otherwise 409 `conflict`.
  - `POST /tenant/memberships/{id}/invitation/resend` (`user.invite`, `user.view`) re-sends the
    identity provider's email to an INVITED account with an ACTIVE membership; otherwise 409
    `lifecycle.invitation_resend_not_applicable`, and 409 `lifecycle.invitation_resend_too_soon`
    within the cooldown (5 minutes by default).
  - Approving again while provisioning is unfinished is 202 and requeues; it is 409 once
    provisioning succeeded or the membership is no longer pending.
- **Still open:** no invitation entity, expiry or accepted time; `invitation` is on membership
  detail only (not list items, user detail or platform routes); a failed resend or application-invite
  email isn't visible; resend doesn't re-send the application invite.
- **Verified 2026-11-24:** every membership mutation response (activate, suspend, reactivate,
  revoke, PATCH, retry, resend, and the platform activate) answers the detail with `invitation`.
  Retry has no maker-checker rule, needs a recorded dispatch that hasn't succeeded, and is a 200
  no-op while a job runs; resend also needs a dispatch row. A REVOKED membership whose last dispatch
  failed still reads `FAILED` (code `CANCELLED`), so Retry also checks the membership and user status.
- **To adopt:** done in frontend #124.
  - The user record's Overview reads `invitation` with the membership (`membership.view`
    tenant-wide), and its layout reads it only for a pending member whose account is
    PROVISIONING_IDP. "Provisioning identity" splits into **Identity in progress** and **Identity
    failed**; the Onboarding card marks the third step Failed and lists the identity
    provisioning's status (with its attempts, once more than one, only while it failed or is in
    progress: a resend adds one to a completed dispatch's count), the failure's reason worded by
    its code (never the platform's text; an unknown or missing code reads "The reason wasn't
    recorded.", and "then retry" is said only beside a Retry the reader is offered) and its last
    update in the organisation's zone. The fact reads "Identity provisioning", not "Invitation", so
    a NOT_REQUIRED one never contradicts Resend beside it. A row of a list carries no
    `invitation`, so the users directory, the queue and the overview's preview read it per such row,
    at most 10 a page (frontend #125, BG-28); a row past the cap, read without `membership.view`,
    or whose read failed, still reads "Provisioning identity", as does a record whose reader lacks
    `membership.view`. A
    pending provisioning member whose invitation reads AWAITING_APPROVAL (a
    re-invite's first approval, ADR 0037) is awaiting approval, and Approve queues it.
  - **Retry provisioning** (`user.approve` + `membership.view`, tenant-wide) replaces Approve for a
    PENDING_APPROVAL member whose account is PROVISIONING_IDP and whose invitation is FAILED; while
    it is in progress neither is offered. Its 409 reads "Provisioning can't be retried now.
    Refresh to see where it stands."
  - **Resend invitation** (`user.invite` + `membership.view` + `user.view`, tenant-wide) is offered
    for an INVITED account with an ACTIVE membership, whatever its invitation reads (the platform
    touches the user's newest succeeded dispatch in any institution, so the cooldown, five
    minutes by default and configurable, runs from provisioning's own success or the last
    resend). Both 409 codes are named: `…_too_soon` "Their account was set up, or an invitation
    sent, moments ago. Try again in a few minutes.", `…_not_applicable` "There's no invitation to
    resend for this person. Refresh to see where they stand." (on a stale page, they have most
    often signed in since). Resend leaves the hero's actions as they were, so its trigger keeps
    focus, and its success moves none on a later refresh.
  - Both are confirmations with no field, each with its own minted idempotency key. The approval
    page says, as a warning, when provisioning failed and sends the approver to the record, and
    the overview's provisioning note says a failed one can be retried from the user record (list
    rows carry no invitation, so it can't say which). The audit vocabulary names
    `user.invitation_retry` and `user.invitation_resend`.
  - The fake API derives `invitation` from a per-membership dispatch, as `deriveInvitationStatus`
    does, and serves retry and resend with the platform's gates, 409s, five-minute cooldown and
    audit rows; a repeat approval requeues a failed dispatch. `users-invite-dispatch-edges` seeds an
    invited member with no dispatch (resend not applicable) and a pending one whose dispatch
    already succeeded (retry a 409).

### BG-12 — Settings catalogue unenforced and under-described · P1

- **Status:** Backend fixed. Platform #164 (also #271, #272, #273, #276, #277, #278, #331), ADR 0032.
  The tenant part is adopted (frontend #113); the platform Settings tab for retention is entry
  22's.
- **Gap:** None of the six catalogue keys is read at runtime (`lifecycle/domain/TenantSettingCatalog.kt:25-159`):
  the maker-checker toggles are no-ops (maker-checker always applies), auto-advance doesn't exist,
  accounting reads the organisation's currency column, retention isn't enforced. The catalogue has no
  label, description, or group metadata; unset keys show their default (indistinguishable from an
  explicit value); non-catalogue stored keys appear in the list; `audit_retention_days` needs
  `tenant_setting.manage_platform` in the PLATFORM organisation even for reads, while tenant routes
  reject the platform context — so only a member of both can manage it.
- **Frontend handling:** timezone and currency editable (subject to BG-04); the three no-op keys
  read-only with honest labels; retention shown as "Managed by the platform".
- **Backend resolution:**
  - Every key has a consumer:
    - `default_timezone` fills a new branch's time zone when none is sent (`timezone` is now
      optional on branch create).
    - `base_currency` is a read-only mirror of `organisation.base_currency_code`; `PUT` and `DELETE`
      are 422 `invalid_operation`.
    - `require_maker_checker_for_user_invites` and `require_maker_checker_for_branch_creation` are
      on by default; a stored `false` lets the tenant's own maker approve (audited HIGH) and never
      relaxes the platform checker. V31 closed every earlier stored `false`.
    - `business_date_auto_advance_enabled` drives an hourly advance of an OPEN business date, which
      holds while a blocking readiness check fails (BG-21); storing `true` needs
      `business_date.advance`.
    - `audit_retention_days` drives a daily purge of routine (INFO and SUCCESS) rows older than the
      larger of the value and 2555 days; writes are bounded to 2555–36500.
  - Each setting carries `label`, `description`, `group` (General, Approvals, Business date, Audit)
    and `is_default`; an unset platform-only value lists as `null` rather than masked.
  - `/platform/tenants/{tenant_id}/settings` (a paged GET, and GET, PUT and DELETE on `/{key}`)
    manages the platform-only keys with `tenant_setting.manage_platform` in the platform
    organisation, without tenant membership.
- **Still open:** the auto-advance and retention jobs stay off until the deployment sets
  `finaxis.lifecycle.business-date.auto-advance.mode` and `finaxis.audit.retention.mode` (both
  default OFF); reading `audit_retention_days` on the tenant route still needs the platform
  permission; the bounds aren't published in the response; a stored key outside the catalogue still
  lists.
- **Verified 2026-11-24:** `base_currency` always reads `is_default: false` and the response has no
  read-only flag, so read-only is decided by key. The list is sorted by key, not group, and the API's
  labels differ from the UI's ("Default time zone", "Require maker-checker for user invitations", …).
  Reading a maker-checker switch needs `settings.view`. `settings.operational` is never listed.
- **To adopt:** add a platform Settings tab for retention (entry 22). Done in frontend #113:
  Settings renders the API's labels, descriptions and groups (`groupSettings`, in the order
  General, Approvals, Business date, Audit) instead of `SETTING_GROUPS`; Reset is offered only when
  `is_default` is false; `base_currency` and `audit_retention_days` are read-only by key; and the
  maker-checker and auto-advance switches are real switches, gated on `settings.update` (and
  `business_date.advance` to turn automatic advance on) tenant-wide.

### BG-13 — Branch address, update, and dates · P1

- **Status:** Closed (frontend #118). Platform #165, #203 (V18, V19).
- **Gap:** `address` is accepted and stored but branch detail always returns `{}`
  (`BranchController.kt:860`, `PlatformTenantBranchController.kt:323`). No branch update endpoint.
  `opened_on`/`closed_on` are never set by the API.
- **Frontend handling:** no address input or display; no edit; dates shown only when present.
- **Backend resolution:**
  - Branch detail (`GET /branches/{id}`, `GET /platform/tenants/{tenant_id}/branches/{id}`) returns
    the stored `address`, a flat map of strings.
  - `PATCH /branches/{branch_id}` edits `branch_name`, `parent_branch_id` (explicit `null`
    detaches), `timezone` and `address` (replaced whole; `{}` clears it) on a DRAFT or ACTIVE
    branch. It needs the new `branch.update`, checked on the target branch; other states are 409,
    and a bad zone or a parent cycle is 422.
  - `opened_on` is the business date of first activation and `closed_on` that of closure; V18
    backfilled older branches with approximate dates.
- **Still open:** no platform PATCH route; PENDING_APPROVAL and SUSPENDED branches can't be edited;
  list items don't carry the address; a discarded draft gets a `closed_on` and no `opened_on`.
- **To adopt:** done in frontend #118. The branch detail parses `address`; the tenant Overview and
  the platform branch page show it on one line (`formatAddress`: decision Q9's keys `line_1`,
  `line_2`, `city`, `region`, `postal_code` in order, then any other stored key), and the Overview
  also names Drafted by and Submitted by. Both create forms take the five fields and send `address`
  only when one is filled in. `/admin/branches/{id}/edit` (an Edit link on the record) is gated by
  `canEditBranch`, which is `canActOnBranch` on `branch.update` for a DRAFT or ACTIVE branch
  (`EDITABLE_BRANCH_STATES`): the route's code in the selected context, then `branch.update` and
  `branch.view` at the branch, tenant-wide or through a BRANCH grant there while it is ACTIVE, so a
  draft is edited tenant-wide only. It reuses the create form with the code and type fixed, and
  `updateBranch` PATCHes only the changed fields: an emptied parent as `null`, and the address whole
  (`{}` when blank) with any other stored key kept. The form's 120-character cap applies only to an
  address value the user changed, so a longer stored one never blocks a save. The parent picker
  leaves out the branch itself, the branches below it and closed ones, and says when a
  branch-scoped `branch.view` lists only its branches. A draft warns that its editor can't activate
  it, and the 409, 422 and 404 are explained by code. The opening and closing dates show once set.
  The e2e fake API stores and returns the address (a number or boolean value as its text, as
  Jackson coerces it) and both dates, adds `parent_branch_id` to list items, and answers the PATCH
  in the platform's order: the body's 400s, the route gate, `{}`, the target check, then 404 and
  the state (audit `branch.update` with the changed field names). It refuses an editor's activation
  with `lifecycle.approver_is_branch_modifier` unless the switch is off, recording the refusal as a
  `DENIED` `branch.activate` row, as the platform does for the drafter's too.

### BG-14 — Tenant legal name and registration number · P1

- **Status:** Closed (frontend #120). Platform #166, #271.
- **Gap:** Accepted on create/amend but never returned (`TenantApiDtos.kt:172-194`); the admin draft
  details and `status_reason` can't be read either. PATCH replaces every field, so an amend without
  re-entering legal name / registration number nulls them; `initial_settings` and `business_date` are
  ignored on amend.
- **Frontend handling:** the amend wizard asks for those fields and the first administrator to be
  re-entered, says why, and sends no settings or business date.
- **Backend resolution:**
  - Tenant detail (`GET /tenant`, `GET /platform/tenants/{id}`) returns `legal_name`,
    `registration_number` and `status_reason`. The platform detail also returns the first
    administrator's draft (`admin`: `email`, `username`, `display_name`, `phone_e164`,
    `send_application_invite`) while the tenant is DRAFT, to holders of `tenant.update_draft`.
  - On `PATCH /platform/tenants/{id}`, an absent `legal_name` or `registration_number` keeps the
    value (`null` clears it), an absent `admin` keeps the draft, `business_date` is applied, and a
    non-empty `initial_settings` is 422 `invalid_operation`.
  - A tenant created without a business date gets one derived at approval.
- **Still open:** PATCH still requires `tenant_code`, `display_name`, `country_code`,
  `base_currency_code` and `timezone`; an `admin` that is sent replaces the whole draft (its
  `phone_e164` is still required); amend can't change settings.
- **Verified 2026-11-25:** `GET /tenant` returns the same three fields (its `admin` and makers are
  always `null`), but the frontend reads only its `timezone` there (`tenantTimeZoneSchema`,
  `lib/api/lookups.ts`), so nothing changes on the tenant side. The PATCH answers its state 409
  before `validateAmend`'s 422s (currency, zone, a non-empty `initial_settings`), and bounds an
  `Optional` legal name or registration number in the controller, after the bean violations, as a
  400 `validation_failed` with no violations. A sent `admin` without `send_application_invite` is
  a 400 violation (`@NotNull`); `admin: null` keeps the draft's, as an absent one does.
- **To adopt:** done in frontend #120. The detail parses `legal_name`, `registration_number`,
  `status_reason` and `admin` (each required and nullable, as the platform always sends them); the
  Overview shows the legal name and registration number ("—" when unset) and a returned draft's
  reason. The amend wizard opens pre-filled from the detail (`tenantAmendDefaults`: legal name,
  registration number, the first administrator and `send_application_invite`), offers an optional
  business date (not pre-filled: no read returns it), and sends what changed
  (`changedTenantFields`): the five required fields always, the legal name and registration number
  only when changed (a cleared one as `null`), the administrator whole only when any of its fields
  changed, the business date only when entered, and never `initial_settings`. A draft the platform
  keeps no administrator for (no bootstrap record, `admin` null, whose amend discards a sent one)
  gets an administrator step that says so and asks nothing, and no `admin` is sent. "Enter them
  again" is gone. The e2e fake API stores and returns the three fields and the administrator (to a
  holder of `tenant.update_draft` while it is a draft), and answers the PATCH with the platform's
  keep, clear and replace rules, its order and its 422 for settings, discarding an `admin` for a
  tenant with no bootstrap record.

### BG-15 — No aggregate counts · P1

- **Status:** Backend fixed, on list items. Platform #191.
- **Gap:** No counts for role users, role permissions, branch users, tenant branches, or tenant users.
  Deriving them costs one `size=1` call per count per row against a 600 reads/min budget.
- **Frontend handling:** counts only on record pages (one call each); lists don't show them. The
  platform overview reads five counts the same way (`size=1`, or the total of a five-row preview)
  (layer 17). The administration overview counts active branches and active memberships the same
  way, and takes the approvals waiting from the bell's reads and its previews' totals (layer 14).
- **Backend resolution:** list items carry counts over ACTIVE rows. Roles have `permission_count`
  and `active_user_count` (distinct users; `null` without tenant-wide `role_assignment.view`).
  Branches have `active_user_count` (`null` without `branch_assignment.view` on that branch).
  Platform tenants have `active_branch_count` and `active_user_count` (`null` without `branch.view`
  or `user.view`, tenant-wide or, for a platform caller, in the platform organisation). Approvals are
  counted by their own routes (BG-22).
- **Still open:** detail responses carry no counts, there is no counts endpoint, and lists can't sort
  by a count.
- **Verified 2026-11-24:** `permission_count` counts every grant whatever the permission's status;
  a platform tenant's `active_user_count` counts ACTIVE memberships; branch and role
  `active_user_count` count distinct users.
- **To adopt:** count columns in the role, branch and institution directories, treating `null` as
  not permitted. Record pages still need a `size=1` read. The roles Overview's "Active assignments"
  counts assignments; `active_user_count` counts people.

### BG-16 — Audit search and recording · P1

- **Status:** Backend fixed. Platform #158 (sub-issues #183–#187), V25–V30. Rows written before it
  keep the old shape.
- **Gap:** No free-text, outcome, severity, branch, or event-type filters; `actor_id` matches USER
  actors only. Every non-accounting event is INFO; `recordSecurityEvent` is never called, so denied
  API calls aren't audited; `ip_address` is never populated. `event_type` always equals `entity_type`.
  Membership suspend/reactivate are keyed by user ID while revoke is keyed by membership ID; branch
  assign/revoke are logged on the branch with no user reference; assignment events carry no user in
  metadata — so one user's history needs several queries and is still incomplete. Branch-selected
  requests stamp the selected branch on audit rows regardless of the branch acted on. Summary and
  detail DTOs name the same columns differently (`resource_*`/`actor_id` vs `entity_*`/`actor_user_id`).
- **Frontend handling:** structured filters only; record tabs offer per-entity views.
- **Backend resolution:**
  - `GET /tenant/audit-events` adds `subject_user_id`, `outcome` (SUCCESS, FAILURE, DENIED),
    `severity` or `min_severity`, `branch_id`, `action_prefix` (2–64 characters), `actor_type`
    (USER, SYSTEM), `actor_subject` and `q` (3–64 characters over the action, entity type and
    reason; it needs `occurred_from` within 31 days). A bad value is 400 `invalid_parameter`.
  - Severity is set by policy; every authenticated 403 writes an `api.access_denied` row (DENIED,
    HIGH, at most 10 a minute per caller); `ip_address` (from trusted proxies only) and a capped
    user agent are recorded; `branch_id` is the branch the event is about, not the selected one;
    `subject_user_id` names the user an event is about; `event_type` equals the action.
  - One row per user or membership transition (ADR 0031), keyed by its aggregate:
    `user_account.<transition>` on `USER_ACCOUNT` and `membership.<transition>` on `MEMBERSHIP`; a
    revoke also writes `membership.assignments_revoked`.
  - Summary items and detail carry the same fields; `resource_type`, `resource_id` and `actor_id`
    remain as deprecated aliases of `entity_type`, `entity_id` and `actor_user_id`.
- **Still open:** older rows aren't backfilled; `actor_id` still matches USER actors only; the roles
  an invitation grants write no audit row; a non-UUID `entity_id` is stored as null.
- **Verified 2026-11-24:** `api.access_denied` rows use entity type `API_ROUTE`; `audit.export`
  (entity `AUDIT_EVENT`) and `audit.retention_purge` rows also land in the tenant log, so Recent
  activity shows them.
- **To adopt:** the outcome, severity, branch and text filters, and a user's whole history from one
  `subject_user_id` query; label `branch_id` as the branch acted on; update the audit vocabulary
  (membership events on `MEMBERSHIP`, `user_account.*`, `api.access_denied`); move off the
  deprecated aliases.

### BG-17 — Missing user profile fields · P1

- **Status:** Partly fixed. Platform #161, #287, #332 (ADR 0033, ADR 0040). The tenant part is
  adopted (frontend #126); the platform user record's phone, last sign-in and profile edit are
  entry 21's.
- **Gap:** Phone is stored but no read DTO returns it and nothing edits it; the per-tenant MEMBER
  sequence (member/staff number) is created but unused; `last_login_at` is updated on every
  context-bearing request but never exposed; MFA/security state lives only in Keycloak; no profile or
  display-name edit; no change of membership type or primary branch.
- **Frontend handling:** columns and tabs omitted; Security links to the Keycloak account console for
  the signed-in user. The invite wizard collects an optional phone and says it can't be viewed after
  the invitation is sent.
- **Backend resolution:**
  - `member_number`, a per-organisation number assigned at first activation and never edited, is on
    membership items and detail, with a `member_number` filter (V35, V38).
  - `PATCH /tenant/memberships/{membership_id}` changes `membership_type` (STAFF, ADMIN, AUDITOR) and
    `primary_branch_id` (`null` clears it), with `membership.update`; an empty body, a REVOKED or
    SYSTEM membership, or a non-ACTIVE branch is 422.
  - Platform context only (ADR 0033 decision 1): `phone_e164` and `last_login_at` on
    `GET /platform/users/{user_id}`, and `PATCH /platform/users/{user_id}` for `display_name` and
    `phone_e164` (the phone can't be cleared), with `user.update`.
- **Still open:** no MFA or credential status; no self-service profile edit; by decision, a tenant
  administrator can't see or edit a phone or display name; `joined_at` isn't returned; user items
  and the global directory carry no member number; an invitation that reuses an existing account
  ignores its profile fields (ADR 0033 decision 5).
- **Verified 2026-11-24:** the membership PATCH is also 409 `conflict` when an ACTIVE membership
  becomes STAFF or ADMIN while its user has no active branch assignment; the platform user PATCH is
  also 422 for a DEACTIVATED or ARCHIVED account, and trims `display_name`.
- **To adopt:** phone, last sign-in and profile edit on the platform user record (entry 21). Done in
  frontend #126, the tenant part:
  - The user record's Membership card shows the member number ("—" until the first activation),
    who last invited them ("Last invited by": `created_by`, the re-inviter after a re-invite, "—"
    for the system) and when they were first invited (the membership's `created_at`, which a
    re-invite keeps).
  - Edit membership changes the type (Staff, Admin, Auditor) and the primary branch (one page of
    100 ACTIVE branches by name, or None), sending only what changed, with `null` for None. It is
    offered with `membership.update` and `membership.view` tenant-wide, never for a revoked or
    system membership, and on your own membership too (the platform has no self rule here). The
    409 is explained ("Staff and Admin members need an active branch assignment first…").
  - The Users directory shows no number: user rows don't carry one (under **Still open**).

### BG-18 — Platform branch creation needs tenant membership · P1

- **Status:** Closed (frontend #122). Platform #153.
- **Gap:** `POST /platform/tenants/{id}/branches` checks `branch.create` in PLATFORM **and** inside the
  tenant (`BranchProvisioningService.kt:38-42`), so it returns 403 unless the platform administrator is
  an active member of that tenant.
- **Frontend handling:** "Create branch draft" appears only for an ACTIVE institution and a holder
  of `branch.create` and `branch.view`; the form warns that the platform also needs you to be a
  member there, and a 403 is explained in those words (layer 17).
- **Backend resolution:** `POST /platform/tenants/{id}/branches` needs only `branch.create` (and
  `branch.view`) in the platform organisation, for an ACTIVE or PROVISIONING tenant.
- **Verified 2026-11-24:** a platform-created draft can be platform-submitted only while the
  platform-checker window is open (BG-02); after that the tenant submits it.
- **Still open:** nothing.
- **Closed** (frontend #122): "Create branch draft" is offered for an ACTIVE or PROVISIONING
  institution to holders of `branch.create` and `branch.view`; the membership warning and its 403
  copy are gone, and a 403 is explained by its status. The draft is then submitted, returned and
  activated from the Branches tab while the platform-checker window is open (BG-02).

### BG-19 — No global search · P2

- **Status:** Backend fixed. Platform #167 (ADR 0039).
- **Gap:** No endpoint searches across users, branches, roles, or references.
- **Frontend handling:** the header ships without a search box.
- **Backend resolution:** `GET /tenant/search?q=` (2–64 characters) returns
  `{users, branches, roles, memberships}`, at most 10 hits each (`id`, `label`, `status`, plus
  `email`, `branch_code`, `role_code` or `membership_type`), unpaged. A type is left out when the
  caller lacks its view (`user.view`, `branch.view` on the branch, `role.view`, `membership.view`);
  lacking all four is 403. Tenant context only.
- **Still open:** no references (accounting has no REST API yet, platform #52) and no platform
  search.
- **To adopt:** a header search box. A membership hit carries the membership id, so opening the
  user record needs the membership's `user_id`.

### BG-20 — No export · P2

- **Status:** Partly fixed. Platform #167 (ADR 0039), V34.
- **Gap:** No CSV/Excel export for audit events or directories.
- **Frontend handling:** export buttons are omitted.
- **Backend resolution:** `GET /tenant/audit-events/export` streams `text/csv` (11 fixed columns)
  for the audit search's filters. `occurred_from` is required, the window is at most 31 days, more
  than 10,000 rows is 400 `audit.export_too_large`, and it allows five requests a minute. It needs
  the new `audit.export` (with `audit.view`), which only administrators hold.
- **Still open:** declined in ADR 0039's scope: directory exports (users, branches, roles,
  memberships), Excel, and a platform export.
- **To adopt:** an Export button on the audit trail, gated on `audit.export`, through a route
  handler so the token stays server-side.

### BG-21 — No close-of-business readiness · P2

- **Status:** Backend fixed. Platform #168 (ADR 0038).
- **Gap:** the prototype's COB readiness checks (unbalanced tellers, pending closures, audit stream,
  exports, jobs, posting window) have no API; close-of-business is optional and unchecked.
- **Frontend handling:** the administration overview's Operational readiness is not one: five fixed
  rules over live reads (spec §10.8, layer 14).
- **Backend resolution:** `GET /tenant/business-date/cob/readiness` (`cob.start`) returns
  `{business_date, status, ready, checks: [{code, severity, status, detail, count}]}` with five
  checks: `business_date_open`, `organisation_active` and `manual_journals_pending_approval`
  (BLOCKING), and `manual_journals_draft` and `reconciliation_breaks` (ADVISORY). `ready` is false
  while a BLOCKING check fails, and the scheduled auto-advance holds on it.
- **Still open:** it is advice only: starting and completing close of business don't consult it
  (ADR 0038). No checks exist for tellers, pending closures, the audit stream, exports, jobs or the
  posting window, because the platform has no signal for them yet.
- **To adopt:** show it on the Business date page before Start close of business, and use it in
  Operational readiness for holders of `cob.start`.

### BG-22 — No notifications · P2

- **Status:** Adopted (frontend #121). Platform #169 (ADR 0038).
- **Gap:** no notification feed.
- **Frontend handling:** the platform bell counts the institutions pending approval that its caller
  could approve (`GET /platform/approvals/pending-count`); the administration bell counts the users
  waiting for approval and the branches waiting for activation
  (`GET /tenant/approvals/pending-count`), its user line capped by the User onboarding tab's total
  (pending less provisioning: two `size=1` reads), for holders of the matching codes tenant-wide
  (frontend #121; layers 12 and 17 used `size=1` list reads). The administration overview's
  Pending approvals card shows the queue's tab counts: the users' from those two reads, shared per
  request, the branches' from its preview's total (layer 14).
- **Backend resolution:** `GET /tenant/approvals/pending-count` returns `{memberships, branches}`:
  memberships for holders of `user.approve`, branches for holders of `branch.approve` tenant-wide. A
  key is left out, not 0, when the caller can't approve that kind, and a caller who can approve
  neither gets 403. `GET /platform/approvals/pending-count` returns `{tenants}` for holders of
  `tenant.approve`. Each counts PENDING_APPROVAL rows less the caller's own (unless the tenant's
  switch is off).
- **Still open:** declined (ADR 0029, ADR 0038): no feed, inbox, read state or push. The membership
  count includes members whose identity is still provisioning.
- **Verified 2026-11-24:** "less the caller's own" means rows the caller **created**: a
  membership's beneficiary and a branch's submitter or amenders are still counted, so each count is
  an upper bound (tenants exclude the requester and submitter).
- **Verified 2026-11-25:** both kinds are tenant-wide: `memberships` needs `user.approve` with
  `membership.view` (`requireTenantPermission`), `branches` needs `branch.approve` with
  `branch.view` at every branch (`mutationBranchVisibility`), so a holder of either at one branch
  only gets no key. The 403 for a caller who approves neither is the endpoint gate's `forbidden`
  when the selected context holds neither code, and otherwise the named refusal
  (`Missing permission: user.approve.`, or its view). A row with no maker counts
  (`created_by IS DISTINCT FROM`). The platform route needs `tenant.approve` with `tenant.view` in
  the platform organisation, never counts the platform organisation, and leaves out a tenant whose
  requester or latest submitter is the caller whatever any switch says. The users list has no
  `created_by` filter, so the provisioning read (`user_status=PROVISIONING_IDP`) counts every
  inviter's requests, the caller's own included.
- **To adopt:** done in frontend #121. Both bells read the count routes (`readPendingCounts`,
  `readPlatformPendingCount`), settled with `load()`. The administration bell asks only a caller it
  can show a line to (`canCountPendingApprovals`): one who approves branches tenant-wide with their
  view, or members with `membership.view` and the tab's `user.view` tenant-wide (anyone approving
  neither would get the 403, and the membership pair alone has no line to show). It shows one line
  per key the platform sends, so a holder of `branch.approve` at one branch only sees no branch
  count. It doesn't subtract the provisioning read from `memberships`:
  that read includes the caller's own requests, which the count already left out, so a caller's own
  provisioning request would be removed twice and the bell could read none while someone waits.
  The user line is the lower of `memberships` and the User onboarding tab's total (pending less
  provisioning, the two `size=1` reads the queue and the overview share), both upper bounds on what
  the caller can decide: exact while the caller has no request of their own pending, and never
  below what waits (`bellUserApprovals`). It needs `user.view` tenant-wide for that read, as the
  tab does. The platform bell counts the institutions its caller could approve, so it reads "No
  institutions are waiting for your approval." when only the caller's own wait. The queue's tab
  counts, the overview's cards and its Onboarding item keep their list totals. The e2e fake API
  serves both routes with the platform's gates, exclusions and key omission.

### BG-23 — Context discovery inconsistencies · P2

- **Status:** Closed (frontend #110). Platform #170.
- **Gap:** `/auth/organisations` filters after paging, so `total_items` can overcount
  (`AuthSelectionService.kt:103-115`). The assigned-branch lookup has no DISTINCT
  (`IamRepositories.kt:248-266`): a user holding HOME and OPERATE at one branch gets duplicate
  `assigned_branch_ids`, `requires_branch_selection: true`, and no auto-selection; `/auth/me` and
  `/auth/branches` repeat branches and roles, and `/auth/me` can include SUSPENDED branches and
  DISABLED roles.
- **Frontend handling:** the frontend de-duplicates.
- **Backend resolution:** assigned branch ids are distinct and ACTIVE only, so a user with two
  assignment types at one branch is auto-selected; `/auth/branches` rows and `total_items` are
  distinct; `/auth/me` lists distinct, ACTIVE branches and roles only.
- **Still open:** `/auth/organisations` still filters after paging; the platform left it because
  the counts diverge only on a stale permission cache.
- **To adopt:** done in frontend #110: `auth/context-contract.ts` no longer de-duplicates
  (`uniqueBy` and the assigned-id `Set` are gone), and the profile's Contexts and Roles tables list
  what `/auth/me` sends, ACTIVE rows only. The e2e fake API's `/auth/*` routes list distinct,
  ACTIVE branches and roles, so a member with two assignment types at one branch is auto-selected.

### BG-24 — Bootstrap status overwritten by unrelated failures · P2

- **Status:** Closed (frontend #105): nothing to adopt. Platform #163.
- **Gap:** any Keycloak provisioning failure in a tenant marks its bootstrap FAILED, without checking
  the current status (`KeycloakUserProvisioningJobRequestHandler.kt:101`), so a later invitee's
  failure turns COMPLETED into FAILED and invites a bootstrap retry.
- **Frontend handling:** none beyond offering the retry the status asks for.
- **Backend resolution:** only the bootstrap administrator's own provisioning failure marks the
  bootstrap FAILED, and no write replaces COMPLETED. The failure code is a closed set (V24).
- **Still open:** nothing.
- **To adopt:** nothing: the retry offer is now trustworthy.

### BG-25 — Identity and email delivery defaults · P2

- **Status:** Adopted (frontend #124). Platform #162, #274.
- **Gap:** Keycloak admin provisioning and outbound email are disabled by default; with email off,
  invite and welcome emails fail permanently (audited, no state change). The Keycloak
  execute-actions email sends `VERIFY_EMAIL` only — no `UPDATE_PASSWORD`, lifespan, or redirect.
- **Frontend handling:** the invite wizard offers both flags, starting from the contract's defaults
  (identity-provider invitation on, application invitation off), and says that delivery depends on
  the platform and a failed delivery isn't shown.
- **Backend resolution:** the identity provider's email asks for `VERIFY_EMAIL` and
  `UPDATE_PASSWORD` with a 72-hour lifespan, and redirects to the app when the deployment sets
  `finaxis.keycloak.admin.invitation-redirect-uri` and `invitation-redirect-client-id`. A failed
  identity provisioning shows in the membership's `invitation` (BG-11), and a startup warning says
  when email is off.
- **Still open:** `finaxis.keycloak.admin.enabled` and `finaxis.email.enabled` still default to off
  (Keycloak admin off logs no warning); the redirect is unset by default; SMTP delivery failures
  aren't surfaced.
- **To adopt:** done in frontend #124. The invite wizard's identity-provider option says the
  email asks them to verify their address and set a password, with a link that lasts 72 hours, and
  its note says delivery depends on how the platform is set up, that a failed identity provisioning
  shows on the user record, and that an undelivered email isn't shown. Resend invitation's dialog
  says the same.

### BG-26 — Sort parameters · P2

- **Status:** Closed (frontend #109). Platform #151, #152, #190.
- **Gap:** `sort_by` values are camelCase and anything outside the allow-list returns 500 (BG-07);
  memberships and branch assignments accept and ignore sort.
- **Frontend handling:** sort allow-lists (BG-07).
- **Backend resolution:** an off-list `sort_by` or a bad `sort_dir` is 400 `invalid_parameter`, with
  a violation on the field and the value not echoed. Sort is honoured on memberships, branch
  assignments and `/tenant/users`, and the values are published per endpoint (BG-05). Accepted
  `sort_by` values, camelCase and case-sensitive:
  - `/tenant/roles`: `roleCode`, `roleName`, `status`, `createdAt`.
  - `/tenant/permissions`: `permissionCode`, `permissionName`, `riskLevel`, `status`, `createdAt`.
  - `/platform/tenants`: `tenantCode`, `displayName`, `countryCode`, `createdAt`.
  - `/branches`, `/platform/tenants/{id}/branches`: `branchCode`, `branchName`, `branchType`,
    `status`, `createdAt`.
  - `/tenant/memberships`: `createdAt`, `membershipStatus`, `membershipType`.
  - `/tenant/branch-assignments`: `assignedAt`, `assignmentType`, `status`.
  - `/tenant/users`: `createdAt`, `username`, `displayName`, `email`, `userStatus`,
    `membershipStatus`.
  - `/platform/users`: `createdAt`, `username`, `displayName`, `email`, `userStatus`.
- **Still open:** the values stay camelCase (an owner call on platform #152). `sort_dir` without
  `sort_by` is ignored on memberships, branch assignments, tenant users and platform users but sets
  the default key's direction elsewhere. `/platform/tenants/{id}/users`, role assignments,
  business-date history and settings take no sort.
- **To adopt:** done in frontend #109: nothing the UI sends changed (only allow-listed values are
  sent), its comments now say an off-list sort is a 400, and the e2e fake API answers one with the
  400 and its violation. The users, memberships and branch-assignment lists can now offer sortable
  columns; that is an option, not a gap.

### BG-27 — Role lifecycle · P2

- **Status:** Closed (frontend #112). Platform #171, #297 (ADR 0035), with archive instead of
  delete by decision.
- **Gap:** no role delete; `ARCHIVED` is never written; activate/deactivate work from any state; a
  DISABLED role can be assigned (it grants nothing).
- **Frontend handling:** the roles page offers assignment only for ACTIVE roles and has no delete.
  The assign action also re-reads the role's status before posting, which narrows the race but
  cannot close it: the backend must check.
- **Backend resolution:** role status is a state machine: ACTIVE ⇄ DISABLED, and either →
  ARCHIVED, which is terminal. `POST /tenant/roles/{role_id}/archive` (`role.archive`) is 409
  `conflict` while the role has an ACTIVE assignment (the detail names the count), for a system
  role, or when already archived. Activate or deactivate from the wrong state is 409, editing or
  granting on an archived role is 409, and assigning a non-ACTIVE role is 422 `invalid_operation`.
  Archived roles are left out of the default list (`status=ARCHIVED` lists them) and keep their
  code.
- **Still open:** no hard delete (ADR 0035).
- **To adopt:** done in frontend #112.
  - `roleStatusAction` offers Deactivate only from ACTIVE and Activate only from DISABLED, and
    nothing for an archived role, which also offers no Edit, grant or remove.
  - Archive (`role.archive` + `role.view` tenant-wide, custom roles) is an error-tone confirmation.
    When the page holds `role_assignment.view` tenant-wide it reads the active-assignment count,
    and a non-zero count disables the confirm and links to the Assignments tab. Its 409 is
    explained without echoing the count.
  - An archived record says it is kept for history. The directory's default status option reads
    "Active and disabled", and Archived lists archived roles.
  - The assign action no longer re-reads the role; it explains the platform's 422.
  - Archived names on old assignments: not needed. Every screen that lists role assignments
    (the role's Assignments tab, the user record's Roles & access, the approval's Requested access)
    reads ACTIVE ones only, and the platform never leaves an ACTIVE assignment on an archived role
    (archive is refused while one exists, and assigning one is 422), so the role index reads no
    `status=ARCHIVED` page.

### BG-28 — Terminal states without recovery · P2

- **Status:** Adopted (frontend #125). Platform #172.
- **Gap:** a rejected tenant is terminal and its `tenant_code` stays taken, so resubmission needs a
  new code. A revoked membership can never be re-invited (unique per organisation + user; invite
  rejects any existing membership).
- **Frontend handling:** the UI warns before rejecting a tenant. The invite wizard's Identity step
  lets a revoked member's email through: its first Continue says "This re-invites <name>." with
  what the platform keeps and ignores, and stays; the next one goes on, and the Review step says
  the same. The invitation is the same `POST /tenant/users`, and the user record then shows the
  member awaiting approval, with Approve disabled for the re-inviter while maker-checker is on
  (entry 08). Revoke, Reject & revoke and the revoked notes on the user record and the approval
  page say the person can be invited again. A list row PENDING_APPROVAL with its account
  PROVISIONING_IDP reads its membership's `invitation` (one read per such row, at most 10 a page,
  with `membership.view` tenant-wide), so a re-invited member whose account was never provisioned
  reads Awaiting approval in the directory, the queue and the overview's preview; a row past the
  cap, or whose read failed or wasn't permitted, keeps the status-only label (failed reads are
  logged by count and status). The queue and the overview's provisioning note say those members
  were usually approved already, not all, and the queue's that such a member can be missing from
  the tab's count (frontend #125).
- **Backend resolution:** inviting a REVOKED member's email through `POST /tenant/users` re-invites
  them: 201, the same membership id, back to PENDING_APPROVAL. `created_by` becomes the re-inviter,
  the membership's dates and direct permission overrides are reset, `member_number` is kept (a
  membership never activated has none: V35 numbers it at first activation), fresh assignments are
  created, and the audit action is `membership.reinvite`.
- **Still open:** a rejected tenant stays terminal with its `tenant_code` taken (ADR 0037 decision
  13); return for changes (BG-01) is how a request goes back to its maker. A re-invited member whose
  account was never provisioned is left out of the pending counts (the bell, the queue tab, the
  overview) until the platform's lists or counts carry the invitation: only the membership detail
  does, so the counts' PROVISIONING_IDP exclusion can't tell them from members approved and
  waiting on their identity.
- **Verified 2026-11-24:** the reset clears `joined_at`, `suspended_at`, `revoked_at` and
  `status_reason` but **keeps `created_at`**; the account is matched by email, so the username, name
  and phone in the request are ignored.
- **To adopt:** done in frontend #125. **As built:** the email check's route handler also
  returns a revoked member's name (the caller already reads it from the directory with
  `user.view`; any other status refuses the email and answers no name), and after a failed
  invitation's 409 a revoked member's email is not named as the cause: the platform re-invites it,
  and never checks its account's username, so the 409 names an inactive institution or a change
  since the check, never the username.

### BG-29 — PLATFORM organisation in tenant search · P2

- **Status:** Closed (frontend #108). Platform #160, #283.
- **Gap:** `GET /platform/tenants` includes the reserved PLATFORM organisation.
- **Frontend handling:** the frontend filters it out, so a page can show one fewer row. The result
  count subtracts it whenever it is known to be included (always when unfiltered, and when its row
  is on the page), so a filtered count can read one high; its record URL shows the not-found page.
  The overview's active count subtracts it exactly once: it is always ACTIVE while anyone works in
  the platform context (layer 17).
- **Backend resolution:** `GET /platform/tenants` and its `total_items` leave out the platform
  organisation unless `include_platform=true`; reading it by id is unchanged.
- **Still open:** nothing.
- **To adopt:** done in frontend #108: the directory and the overview show the platform's totals
  as returned (`visibleTenantTotal` and `activeInstitutionCount` are gone), and the e2e fake API
  leaves the platform organisation out unless `include_platform=true`. `isInstitutionId` stays for
  the record URLs.

### BG-30 — Error envelope inconsistencies · P2

- **Status:** Closed (frontend #109). Platform #173, #235, #253.
- **Gap:** wrong-context 403s pass a message as the `code` (`CallerContextResolver.kt:61-87`), e.g.
  "Branch operations are restricted to non-platform tenant context.", also embedded in `type`. An
  invalid or expired JWT returns 401 with an empty body and no `X-Request-Id`.
- **Frontend handling:** 401 handling is status-based; nothing keys on the sentence.
- **Backend resolution:** wrong-context 403s carry `code` `platform_context_required` or
  `tenant_context_required`, with the sentence in `detail`. An invalid or expired token is a 401
  problem body (`authentication_required`) with `X-Request-Id` and a
  `WWW-Authenticate: Bearer error="invalid_token"` challenge. An incoming `X-Request-Id` is kept only
  when it is 8–64 characters of `[A-Za-z0-9._-]`.
- **Still open:** nothing.
- **To adopt:** done in frontend #109: `describeProblem` names both wrong-context codes ("Wrong
  workspace"), and the e2e fake API answers them, and an invalid token's 401, as the platform does.

### BG-31 — Hidden `.view` requirement on mutations · P2

- **Status:** Closed (frontend #110). Platform #174, by naming the requirement rather than removing
  it (ADR 0030 decision 4).
- **Gap:** role, membership, branch, branch-assignment, role-assignment revoke, and platform tenant
  mutations read their result back in the same transaction and need the matching `.view`
  permission; without it they return 403 and roll back.
- **Frontend handling:** the UI gates on both.
- **Backend resolution:** every mutation requires its own code and each view the catalogue pairs
  with it, at the same scope, checked before any lookup or write; the refusal is 403 `forbidden`
  naming the first missing code in `detail`. `GET /tenant/permissions` publishes `kind`,
  `grant_scope` and `required_view_permissions`, and roles report `missing_view_permissions`. Role
  composition refuses a mutation without its view, or removing a view a held mutation needs, with
  400 `validation_failed`.
- **Still open:** nothing. The requirement itself stays by design (ADR 0030 decision 4), and the
  frontend now gates on every pair it uses.
- **Verified 2026-11-24:** the catalogue route is tenant-only and needs `permission.view`, which the
  branch roles lack, and the composition 400 carries no `violations`, so the gates need a checked-in
  map of the pairs, tested against the catalogue. `INVITE_CODES` lacked `membership.view`; the invite
  still checks `user.assign_branch`, with `branch_assignment.view`, at each invited branch
  (`BranchProvisioningService.assignUser`; corrected during frontend #110, which first read it as
  dropped). Platform-scope codes (`grant_scope: PLATFORM`) can be granted to tenant roles without
  refusal and grant nothing there.
- **To adopt:** done in frontend #110. The gates come from `auth/permission-views.ts`, the
  platform's `permission_view_requirement` pairs (V22, V32-V34, V39), kept in step with the platform
  migrations and pinned against the e2e fake API's 86-code catalogue (`withViews`): Invite needs
  `user.invite`, `membership.view` and `user.view`, and `user.assign_branch` with
  `branch_assignment.view` for its branches; assigning and revoking a role need
  `role_assignment.view`; every other mutation gate adds its view the same way. The grant drawer leaves out PLATFORM-scope codes,
  adds the views a selected mutation needs ("Also grants …"), posts views first and names the
  composition 400; Remove is disabled ("Needed by …") on a view a granted ACTIVE mutation needs. The
  catalogue's `kind`, `grant_scope` and `required_view_permissions` and the roles'
  `missing_view_permissions` are parsed. The fake API pairs each mutation with its views at the same
  scope (403 `forbidden`, naming the first missing code) and refuses role composition with 400
  `validation_failed`.

### BG-32 — Documentation drift (platform repository) · P2

- **Status:** Closed (frontend #105): nothing to adopt. Platform #176.
- **Gap:**
  - `docs/api/foundation-api.md`: profile example (`organisation.tenant_code`/`display_name`,
    `membership.membership_type`) doesn't match `organisation {id, code, name, status}` /
    `membership {id, status}`; audit example uses `event_type: "TenantApproved"` and action
    `tenant.approve`, neither of which exists; settings example key `statement.cutoff_time` isn't in
    the catalogue; permission example module "lifecycle" isn't a module; sort parameters listed for
    memberships and branch assignments are ignored.
  - `docs/operations/tenant-settings.md:79-81` says reads need `settings.update` (code:
    `settings.view`).
  - `docs/security/active-organisation-context.md:29-31,61-63` shows camelCase request bodies
    (rejected).
  - `docs/architecture/rate-limiting.md` doesn't match `application.yaml`.
  - `docs/architecture/lifecycle-fsm.md` omits transitions and shows PROVISIONING_IDP → ACTIVE,
    which the code doesn't have.
  - `README.md:121-122` says API docs are off in production (environment-controlled, default on).
  - `docs/architecture/accounting-foundation.md:659-660` calls the `require_maker_checker_*`
    settings switches; the code never reads them.
- **Frontend handling:** the frontend follows its own contract document, not these.
- **Backend resolution:** each item above is corrected at `3b462c3`, and the maker-checker switches
  are now real, so the accounting-foundation text is true.
- **Still open:** new and minor: `foundation-api.md`'s sort table omits `GET /platform/users` and
  says other lists take no `sort_by`, which its own `/platform/users` section contradicts; the
  platform `CLAUDE.md` (V32) and ADR 0033 give `PATCH /api/v1/memberships/{id}`, but the route is
  `/api/v1/tenant/memberships/{membership_id}`.
- **To adopt:** nothing.

### BG-33 — Permission codes in `/auth/me` carry no scope · P2

- **Status:** Closed (frontend #110). Platform #175.
- **Gap:** `/auth/me` returns only the flattened effective permission codes, so tenant-scoped gates
  can't be told apart from branch-scoped ones. Some routes check their permission at tenant scope:
  `GET /branches` (`branch.view`), and the user search and branch assignment behind the assign
  drawer (`user.view`, `user.assign_branch`). A role granting those codes only at branch scope passes
  the UI's gate and then gets a 403.
- **Frontend handling:** the backend stays the authority. The Branches directory shows its
  access-denied state (spec §6.6), and the assign drawer reports the 403 inline. The invite wizard
  does the same: a 403 from its email check (a stale context, or `user.view` held only at branch
  scope) asks for a reload (`EMAIL_CHECK_REFUSED`), and a 403 from the invitation itself, such as a
  branch-scoped `user.assign_branch` that doesn't cover an invited branch, is named
  `INVITE_REFUSED`. The administration overview marks such a refused read on its own: the Branches
  readiness item shows Couldn't be checked and the Pending approvals card says the branches couldn't
  be loaded, each with its reference, while the other cards stay (layer 14).
- **Backend resolution:** `GET /auth/me` adds `permission_scopes`, one entry per code:
  `{code, scope, branch_ids}`, where `scope` is `TENANT` or `BRANCH` and `branch_ids` (BRANCH only)
  covers every ACTIVE branch, not just the selected one. The flat `permissions` list is unchanged,
  so the change is additive. Since the gap was written, `GET /branches` became target-aware and
  assign-branch checks the target branch; `GET /tenant/users` still needs tenant-scope `user.view`.
- **Still open:** nothing on the platform. In the frontend, a few read gates still use the
  effective set, so a branch-scoped holder gets their failure state from the platform's 403 instead
  of no offer: the record pages' Audit tabs and the profile's Activity tab
  (`audit.view`), the user record's and approval page's membership lookup (`membership.view`), and
  the per-user name lookups (`getTenantUser`, `user.view`), which show the short id.
- **Verified 2026-11-24:** `branch_ids` is absent (not null) on TENANT entries; a code held at
  both scopes is reported once, as TENANT. `/auth/me` lists only ACTIVE roles, so it can't show that
  the caller holds a DISABLED one (which matters for re-enabling a held role, platform #342).
- **To adopt:** done in frontend #110: `auth/context-contract.ts` parses `permission_scopes`
  (`branch_ids` optional), and `permissionHolder(profile)` carries the TENANT codes as
  `tenantPermissions`. `canTenantWide` gates what the platform checks tenant-wide
  (`requireTenantPermission`, or `requirePermission` without a branch), with each mutation's views:
  - the user directory's reads (`user.view`): the Users & access item and page (its access-denied
    state, with no read), the user pickers, the approval queue's User onboarding tab, its user
    approval page, the bell's and the overview's pending-user counts, the overview's actor names
    and the readiness links to Users & access and User onboarding;
  - the invite (`user.invite`; each invited branch still needs `user.assign_branch` at that branch),
    the membership decisions (`user.approve`, `membership.suspend`, `.reactivate`, `.revoke`), the
    role mutations and the grant drawer's catalogue (`permission.view`), `settings.update` and the
    business date actions;
  - the navigation items of Roles & permissions, Settings, Business date and the Audit trail, the
    readiness reads (all but the branch counts) and their links, the overview's business date and
    activity cards, and the app bar's date chip.

  Target-branch checks (`branch.*`, `user.assign_branch`, `user.revoke_branch`, a BRANCH-scope role
  assignment, revoking a role assignment, `GET /branches`) stay on the effective set. The e2e fake
  API's `/auth/me` reports the scopes over every ACTIVE branch.

### BG-34 — Role update accepts a blank name; an empty description clears it · P2

- **Status:** Closed (frontend #112). Platform #340 (PR #343).
- **Gap:** `UpdateRoleRequest` has no `@NotBlank` (`iam/adapter/inbound/web/dto/RoleApiDtos.kt`),
  and `updateRole` sets every non-null field (`JooqIamAdministrationPersistence.kt`). So a blank
  `role_name` is stored and `""` replaces the description, while `null` keeps either field.
  Found by source reading at f74e44b; the contract (7a7f4c3) said the description can't be
  cleared. Source reading only (no UI path to probe it live).
- **Frontend handling:** the edit form requires a name (1–100 characters) and sends `null` for a
  blank description, so a description can be replaced but not removed.
- **Backend resolution:** in `PATCH /tenant/roles/{id}` every field is optional.
  - `role_name`: absent or `null` keeps the name; a value with no non-whitespace character is 400
    `validation_failed`.
  - `description`: absent keeps it, an explicit `null` clears it, a string sets it, and a blank
    string is 400 `validation_failed`.
  - An empty body is a no-op that still writes its `role.update` audit row.
- **Still open:** nothing.
- **To adopt:** done in frontend #112: the form sends `null` for a blank description, which now
  removes it; the help text reads "Optional.", the `updateRole` comment says so, and the contract's
  UpdateRole row says `null` clears it. The e2e fake API's PATCH keeps an absent field, clears a
  `null` description and answers a blank name or description with 400 `validation_failed`.

### BG-35 — No documented self-lockout guard on memberships and accounts · P2

- **Status:** Closed (frontend #109). Platform #341 (PR #344, ADR 0043).
- **Gap:** The contract documents no guard against a caller suspending or revoking their own
  membership, or revoking their own role assignments (§E.3 names none; source 7a7f4c3). Nor is one
  documented for `POST /platform/users/{id}/suspend` or `/deactivate` (§E.2), where a
  self-deactivate would be permanent. Without one, a self-suspend ends the session's context at
  once, because every request re-validates an ACTIVE membership (§A), and a self-revoke ends
  your access until another administrator re-invites you (a revoked member can be re-invited
  since platform #172, BG-28; it was permanent when this was recorded). Not probed live: the
  probe itself would have been irreversible.
- **Frontend handling:** the user record shows Suspend and Revoke disabled on the signed-in user's
  own record, with the reason; revoking your own role assignment warns in its confirmation
  (layer 09), and so does revoking your own branch assignment, from the user record's Branch
  assignments tab or the branch record's Users tab, since at the selected branch it invalidates
  your context (§E.4; frontend #109).
  The platform user record shows Suspend account and Deactivate account disabled on your own
  account, and their Server Actions refuse it before any call (layer 17).
- **Backend resolution:**
  - Suspending or revoking your own membership is 403 `lifecycle.self_membership_change`. The
    check runs after the permission check and the lookup, so a missing permission is still 403
    `forbidden` and an unknown membership 404.
  - Suspending or deactivating your own account (`/platform/users/{id}/suspend`, `/deactivate`)
    is 403 `lifecycle.self_account_change`.
  - A refusal changes nothing and writes one `DENIED`, `HIGH` audit row under the transition's own
    action (`membership.suspend` or `membership.revoke`, `user_account.suspend` or
    `user_account.start_deactivation`), with no `api.access_denied` row.
  - Reactivating or editing your own membership, and revoking your own role or branch assignment,
    stay allowed.
- **Still open:** nothing. Revoking your own role or branch assignment stays allowed on purpose
  (ADR 0043).
- **To adopt:** done in frontend #109: the UI's own guards stay, `describeProblem` names the two
  codes, so a refusal the UI didn't predict (a stale page) isn't explained as a missing permission,
  and a self-revoke from the Branch assignments tab or a branch's Users tab warns as the Roles &
  access revoke does.
