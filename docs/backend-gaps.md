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
   permission message.
4. **Business-rule failures are 4xx, not 500** (platform #152): a taken email or username and a
   duplicate tenant code are 409 `conflict`; approving or revoking a membership in the wrong state
   is 404 or 409 (BG-07). The invite's `isRuleFailure`, the `TENANT_CODE_TAKEN` field error and the
   `APPROVE_FAILED`/`REVOKE_FAILED` copy key on 500 `internal_error`, so they no longer fire.
5. **`base_currency` is a read-only mirror of the organisation's currency** (platform #282): `PUT`
   and `DELETE` answer 422 `invalid_operation`. `settingActions` offers Reset whenever a value is
   set, which it now always is, so Reset is offered and fails; the key is also still in
   `EDITABLE_KEYS` (BG-04, BG-12).
6. **The maker-checker switches are real** (platform #282, ADR 0032): on by default, and a stored
   `false` lets the tenant's own maker approve (audited), and also the invited person and a branch's
   amenders; reading a switch needs `settings.view`. Settings still says "Always on (enforced)", and
   the approval actions refuse the maker before any write even when the switch is off (BG-01,
   BG-12).
7. **A mutation implies more views** (ADR 0030, V22): `user.invite` needs `membership.view` and
   `user.view`; `user.assign_role` needs `role_assignment.view`. `INVITE_CODES` and the assign-role
   gates don't include them, so the action shows and then gets a 403. Role composition refuses a
   mutation granted without its view with 400 `validation_failed`; the grant drawer posts codes in
   selection order and doesn't map that 400 (BG-31).
8. **A revoked member can be re-invited** (platform #304): the invitation reuses the membership,
   sets `created_by` to the re-inviter and audits `membership.reinvite`, not `user.invite`. The
   invite wizard still refuses a revoked member's email, and `getUserInviter` (the `user.invite`
   audit actor) names the original inviter, so the user record disables Approve for the wrong
   person (BG-28, BG-08).
9. **Roles can be archived, and status changes only from the named state** (platform #289, #302):
   `roleStatusAction` offers Activate for an `ARCHIVED` role, which is a 409 explained as a system
   role, and the default role list leaves archived roles out, so their names on old assignments fall
   back to the short id (BG-27).
10. **Audit rows changed shape going forward** (ADR 0031, platform #268, #286): user transitions
    write `user_account.<transition>` on `USER_ACCOUNT`; `membership.suspend` and
    `membership.reactivate` are keyed `MEMBERSHIP` (the audit vocabulary files them under `USER`);
    every authenticated 403 writes an `api.access_denied` row, which Recent activity will show
    (BG-16).
11. **`/auth/me` lists only ACTIVE branches and roles, de-duplicated** (platform #240): the
    profile's Contexts table no longer receives SUSPENDED branches or DISABLED roles (BG-23).
12. **Stricter create validation:** `audit_retention_days` is bounded to 2555–36500 days (the draft
    wizard accepts 0–99999), a `base_currency` initial setting must equal `base_currency_code`, and
    a time zone must be an IANA id the platform knows (raw offsets are 422) (BG-12, BG-13, BG-14).
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
14. **A blank role description now removes it** (platform #343, BG-34). `updateRole` sends `null`
    for a blank description field. That used to keep the description and now clears it, so the
    edit form's help text ("can be replaced but not removed") and the action's comment are wrong.

## Summary

22 backend fixed · 9 partly fixed · 0 open · 0 adopted · 4 closed.

| ID    | Priority | Status        | Gap                                                                                                |
| ----- | -------- | ------------- | -------------------------------------------------------------------------------------------------- |
| BG-01 | P0       | Partly fixed  | No approval-request / pending-change model (no return-for-changes, resubmission, branch rejection) |
| BG-02 | P0       | Backend fixed | A tenant created through the API cannot onboard a second person through the API                    |
| BG-03 | P0       | Backend fixed | Branch pinning: a selected branch hides every other branch; draft branches are unreachable         |
| BG-04 | P0       | Backend fixed | Tenant settings `PUT` fails with 500 and rolls back (per source reading)                           |
| BG-05 | P0       | Closed        | Published OpenAPI casing is wrong and list-item schemas are missing                                |
| BG-06 | P0       | Backend fixed | No platform audit endpoint; tenant audit is 403 in the platform context                            |
| BG-07 | P1       | Partly fixed  | Business-rule failures return 500 instead of 4xx                                                   |
| BG-08 | P1       | Backend fixed | Maker identity not exposed; maker-checker 403 indistinguishable from missing permission            |
| BG-09 | P1       | Partly fixed  | No `user_id` filters on branch assignments / memberships; thin list items                          |
| BG-10 | P1       | Backend fixed | No global user directory or global user read                                                       |
| BG-11 | P1       | Partly fixed  | Invitation state not exposed; no resend; provisioning can stick with no recovery                   |
| BG-12 | P1       | Backend fixed | Tenant settings catalogue unenforced and missing metadata; platform-only key unmanageable          |
| BG-13 | P1       | Backend fixed | Branch address never returned; no branch update; opened/closed dates never set                     |
| BG-14 | P1       | Backend fixed | Tenant legal name / registration number write-only; PATCH wipes them                               |
| BG-15 | P1       | Backend fixed | No aggregate counts (role users/permissions, branch users, tenant branches/users)                  |
| BG-16 | P1       | Backend fixed | Audit search and recording limitations                                                             |
| BG-17 | P1       | Partly fixed  | Missing user profile fields (phone read/edit, member number, last activity, MFA/security)          |
| BG-18 | P1       | Backend fixed | Platform administrators can't create tenant branches without tenant membership                     |
| BG-19 | P2       | Backend fixed | No global search endpoint                                                                          |
| BG-20 | P2       | Partly fixed  | No export endpoints                                                                                |
| BG-21 | P2       | Backend fixed | No close-of-business readiness checks exposed                                                      |
| BG-22 | P2       | Partly fixed  | No notifications endpoint                                                                          |
| BG-23 | P2       | Backend fixed | Context discovery inconsistencies (`total_items` overcount, duplicate branch IDs)                  |
| BG-24 | P2       | Closed        | Bootstrap status can flip COMPLETED → FAILED from unrelated invitee failures                       |
| BG-25 | P2       | Partly fixed  | Identity and email delivery defaults (Keycloak admin off, email off, no password step)             |
| BG-26 | P2       | Backend fixed | Ignored or dangerous sort parameters                                                               |
| BG-27 | P2       | Backend fixed | Role lifecycle gaps (no delete; DISABLED roles assignable; ARCHIVED unused)                        |
| BG-28 | P2       | Partly fixed  | Terminal states without recovery (rejected tenant code stays taken; revoked member can't return)   |
| BG-29 | P2       | Closed        | PLATFORM organisation included in tenant search results                                            |
| BG-30 | P2       | Backend fixed | Wrong-context 403s put a sentence in `code`; invalid JWT 401 has no body                           |
| BG-31 | P2       | Backend fixed | Mutations silently require the matching `.view` permission                                         |
| BG-32 | P2       | Closed        | Documentation drift in the platform repository                                                     |
| BG-33 | P2       | Backend fixed | Permission codes in /auth/me carry no scope                                                        |
| BG-34 | P2       | Backend fixed | Role update accepts a blank name; an empty description clears it                                   |
| BG-35 | P2       | Backend fixed | No documented self-lockout guard: a user may suspend, revoke or deactivate themselves              |

## Details

**Gap** and **Frontend handling** keep their 2026-09-25 wording (the P2 paragraphs are split into
the same bullets): the first is the gap as found, the second what the UI still does.

### BG-01 — No approval-request / pending-change model · P0

- **Status:** Partly fixed. Platform #155 (sub-issues #178–#182), #221, #222, #282. ADR 0029 chose
  per-resource extensions over an approval-request model.
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
- **To adopt:** Return/Withdraw and Discard on branches, Return on pending institutions with their
  `status_reason`, and an optional remark on Approve. (Activation is gated on `branch.approve` since
  frontend #107.)

### BG-02 — A tenant created through the API cannot onboard a second person · P0

- **Status:** Backend fixed. Platform #153, #223, #250, #282 (ADR 0028, ADR 0032).
- **Gap:** Tenant approval creates one user, the `TENANT_ADMIN` bootstrap admin. That admin cannot
  approve their own invites (maker-checker 403) nor activate branches they drafted. Platform
  administrators cannot step in: tenant routes reject the platform context
  (`lifecycle/adapter/inbound/web/CallerContextResolver.kt:78-94`), and platform branch creation also
  requires tenant membership (`lifecycle/application/BranchProvisioningService.kt:38-42`). No setting
  disables the rule; the local seed works only because migration V4 seeds a second actor.
- **Frontend handling:** approve controls are disabled for the maker with an explanation; the overview
  readiness item "People" flags tenants with fewer than two active members (layer 14).
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
- **To adopt:** the platform checker routes on the institution record (handling 409
  `lifecycle.platform_checker_closed`); read the switches (`GET /tenant/settings`) before refusing
  the maker; revisit the overview's People rule, since two active members is no longer the only way
  through.

### BG-03 — Branch pinning · P0

- **Status:** Backend fixed. Platform #154, #242.
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
- **To adopt:** drop the client-side "switch to All branches" refusals (activation, branch pages,
  the approval queue); let single-branch users clear their branch; pass `branch_id` explicitly in
  assignment searches. The guided state keyed on `resource_not_found` stops firing: tenant-wide
  holders now get the branch, branch-scoped ones a 403.

### BG-04 — Tenant settings `PUT` fails with 500 · P0

- **Status:** Backend fixed. Platform #150, covered through the idempotency aspect by
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
- **To adopt:** take `base_currency` out of `EDITABLE_KEYS` (it is read-only now, BG-12), then flip
  `SETTINGS_EDIT_ENABLED`, and drop the overview's "settings can't be saved yet". Offer only time
  zones the platform accepts (IANA ids; raw offsets are 422).

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

- **Status:** Partly fixed. Platform #152. No listed case returns 500 any more, but most share a
  generic code.
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
  step; sort allow-lists), a tenant-code lookup after a failed create to name a duplicate (the
  create goes first, so a replayed create is never turned away; the invitation likewise names a
  taken email, or a username a member here holds, only after a failed post), and a generic error
  showing `request_id`. A username taken by an account in another institution can't be checked from
  the tenant context, so the invitation's 500 names it among the likely causes. The user record
  withholds Approve once approval ran and names the likely causes of the other approval 500s.
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
- **To adopt:** key the invite, tenant-create and approve/revoke explanations on the new statuses
  instead of 500 `internal_error`, and keep the post-failure lookups that name a cause, since the
  codes don't.

### BG-08 — Maker not exposed; ambiguous 403 · P1

- **Status:** Backend fixed. Platform #156 (also #221, #251), with one code per cause instead of a
  single `maker_checker_violation`.
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
- **To adopt:** read the maker from `created_by`, `submitted_by` and `requested_by` instead of the
  audit log (no `audit.view` needed, and it works from the platform context), and explain each code.
  A re-invited membership's maker is its `created_by`, not the `user.invite` actor (BG-28).

### BG-09 — Missing filters; thin list items · P1

- **Status:** Partly fixed. Platform #159 (sub-issues #188, #189, #190).
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
- **To adopt:** `user_id` replaces the email-search membership lookup and the 500-assignment scan,
  with their "partial" states; embedded names replace the per-page lookups; `membership_created_at`
  with `sort_by=createdAt` gives User onboarding a defined order. The role index's ceiling of 500
  stays until roles take `ids`.

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

- **Status:** Partly fixed. Platform #162, #274 (also #237, #313).
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
- **To adopt:** show `invitation.status` and its error code on the user record with Retry and
  Resend, and replace the "Provisioning identity" guidance and the overview's provisioning note.

### BG-12 — Settings catalogue unenforced and under-described · P1

- **Status:** Backend fixed. Platform #164 (also #271, #272, #273, #276, #277, #278, #331), ADR 0032.
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
- **To adopt:** render labels, groups and `is_default` from the API instead of `SETTING_GROUPS`;
  offer Reset only when `is_default` is false; make `base_currency` read-only; make the maker-checker
  and auto-advance switches editable with true copy; add a platform Settings tab for retention.

### BG-13 — Branch address, update, and dates · P1

- **Status:** Backend fixed. Platform #165, #203 (V18, V19).
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
- **To adopt:** show and enter the address (`branch-contract.ts` drops it today) and add an Edit
  form gated on `branch.update`.

### BG-14 — Tenant legal name and registration number · P1

- **Status:** Backend fixed. Platform #166, #271.
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
- **To adopt:** pre-fill the amend wizard from the detail instead of re-asking, and show
  `status_reason`.

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

- **Status:** Partly fixed. Platform #161, #287, #332 (ADR 0033, ADR 0040).
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
- **To adopt:** the member number on the user record and directory (through the membership), a
  membership edit form (type, primary branch), and phone, last sign-in and profile edit on the
  platform user record.

### BG-18 — Platform branch creation needs tenant membership · P1

- **Status:** Backend fixed. Platform #153.
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
- **To adopt:** drop the membership warning and its 403 copy; consider offering it for PROVISIONING
  institutions.

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

- **Status:** Partly fixed. Platform #169 (ADR 0038).
- **Gap:** no notification feed.
- **Frontend handling:** the platform bell counts institutions pending approval with one `size=1`
  read, for holders of `tenant.approve` and `tenant.view` (layer 17); the administration bell counts
  users waiting for approval (pending less provisioning: two `size=1` reads) and branches waiting
  for activation (one), for holders of the matching codes (layer 12). The administration overview's
  Pending approvals card shows the same counts: the users' from the bell's reads, shared per request,
  the branches' from its preview's total (layer 14).
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
- **To adopt:** replace the bells' `size=1` reads with the count routes, keeping the provisioning
  read if the bell should still leave those out. (The branch count is gated on `branch.approve`
  since frontend #107.)

### BG-23 — Context discovery inconsistencies · P2

- **Status:** Backend fixed. Platform #170.
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
- **To adopt:** drop the client de-duplication (`uniqueBy` in `auth/context-contract.ts`). The
  profile's Contexts table no longer receives SUSPENDED branches or DISABLED roles.

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

- **Status:** Partly fixed. Platform #162, #274.
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
- **To adopt:** the Invitation step can say the email includes a set-password step. Delivery still
  depends on the deployment.

### BG-26 — Sort parameters · P2

- **Status:** Backend fixed. Platform #151, #152, #190.
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
- **To adopt:** nothing required, since everything the UI sends is still accepted. The users,
  memberships and branch-assignment lists can now offer sortable columns.

### BG-27 — Role lifecycle · P2

- **Status:** Backend fixed. Platform #171, #297 (ADR 0035), with archive instead of delete by
  decision.
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
- **To adopt:** an Archive action; no Activate or Edit for an archived role; explain the assignment
  422 as a role that is no longer active; resolve archived roles' names on old assignments with
  `status=ARCHIVED`.

### BG-28 — Terminal states without recovery · P2

- **Status:** Partly fixed. Platform #172.
- **Gap:** a rejected tenant is terminal and its `tenant_code` stays taken, so resubmission needs a
  new code. A revoked membership can never be re-invited (unique per organisation + user; invite
  rejects any existing membership).
- **Frontend handling:** the UI warns before both, and the invite wizard refuses a revoked member's
  email on its Identity step, saying it can't be invited again.
- **Backend resolution:** inviting a REVOKED member's email through `POST /tenant/users` re-invites
  them: 201, the same membership id, back to PENDING_APPROVAL. `created_by` becomes the re-inviter,
  the membership's dates and direct permission overrides are reset, `member_number` is kept, fresh
  assignments are created, and the audit action is `membership.reinvite`.
- **Still open:** a rejected tenant stays terminal with its `tenant_code` taken (ADR 0037 decision
  13); return for changes (BG-01) is how a request goes back to its maker.
- **Verified 2026-11-24:** the reset clears `joined_at`, `suspended_at`, `revoked_at` and
  `status_reason` but **keeps `created_at`**; the account is matched by email, so the username, name
  and phone in the request are ignored.
- **To adopt:** let the invite wizard re-invite a revoked member, saying the re-inviter can't
  approve, and change the "can't be invited again" copy.

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

- **Status:** Backend fixed. Platform #173, #235, #253.
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
- **To adopt:** name the wrong-context case by its code.

### BG-31 — Hidden `.view` requirement on mutations · P2

- **Status:** Backend fixed. Platform #174, by naming the requirement rather than removing it (ADR
  0030 decision 4).
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
- **Still open:** the requirement stays, and pairs more codes than the UI gates on: `user.invite`
  needs `membership.view` and `user.view`; `user.assign_role` and `user.revoke_role` need
  `role_assignment.view`; `settings.update`, the `business_date.*` mutations, `branch.create` and
  `tenant.create` need their views.
- **Verified 2026-11-24:** the catalogue route is tenant-only and needs `permission.view`, which the
  branch roles lack, and the composition 400 carries no `violations`, so the gates need a checked-in
  map of the pairs, tested against the catalogue. `INVITE_CODES` also includes `user.assign_branch`,
  which `POST /tenant/users` no longer checks. Platform-scope codes (`grant_scope: PLATFORM`) can be
  granted to tenant roles without refusal and grant nothing there.
- **To adopt:** derive the gates from `required_view_permissions` instead of hand-kept pairs; grant a
  view before or with its mutation, and map the composition 400.

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

- **Status:** Backend fixed. Platform #175.
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
- **Still open:** nothing.
- **Verified 2026-11-24:** `branch_ids` is absent (not null) on TENANT entries; a code held at
  both scopes is reported once, as TENANT. `/auth/me` lists only ACTIVE roles, so it can't show that
  the caller holds a DISABLED one (which matters for re-enabling a held role, platform #342).
- **To adopt:** parse `permission_scopes` in `auth/context-contract.ts` and gate the tenant-scope
  routes (the users directory, the invite wizard's email check) on a TENANT entry.

### BG-34 — Role update accepts a blank name; an empty description clears it · P2

- **Status:** Backend fixed. Platform #340 (PR #343).
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
- **To adopt:** the form already sends `null` for a blank description, which now removes it. Drop
  the "can be replaced but not removed" help text (`role-form.tsx`) and the comment in
  `role-actions.ts`'s `updateRole`, and correct the contract's UpdateRole row, which still says the
  description can't be cleared.

### BG-35 — No documented self-lockout guard on memberships and accounts · P2

- **Status:** Backend fixed. Platform #341 (PR #344, ADR 0043).
- **Gap:** The contract documents no guard against a caller suspending or revoking their own
  membership, or revoking their own role assignments (§E.3 names none; source 7a7f4c3). Nor is one
  documented for `POST /platform/users/{id}/suspend` or `/deactivate` (§E.2), where a
  self-deactivate would be permanent. Without one, a self-suspend ends the session's context at
  once, because every request re-validates an ACTIVE membership (§A), and a self-revoke is
  permanent (BG-28). Not probed live: the probe itself would be irreversible.
- **Frontend handling:** the user record shows Suspend and Revoke disabled on the signed-in user's
  own record, with the reason; revoking your own role assignment warns in its confirmation
  (layer 09). Revoking your own branch assignment from the user record's Branch assignments tab
  shows no such warning (layer 08's `RevokeAssignmentButton` has no `self` prop); at the selected
  branch it invalidates your context (§E.4). The platform user record shows Suspend account and
  Deactivate account disabled on your own account, and their Server Actions refuse it before any
  call (layer 17).
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
- **To adopt:** keep the UI's own guards, and name the two codes in the membership and platform-user
  actions, so a refusal the UI didn't predict (a stale page) isn't explained as a missing
  permission. The Branch assignments tab's self-revoke still lacks the warning the Roles & access
  revoke has.
