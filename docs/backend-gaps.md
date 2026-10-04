# Backend gaps

Gaps between the Administration prototype's intended functionality and the platform API, found while
scoping the prototype build-out (2026-09-25). The frontend does **not** change the backend: each gap
below is handled in the UI by omission, derivation, or a guided state, and is listed here so it can be
tackled separately in the platform repository.

- **Evidence:** backend source `/home/ogaba/finaxis/platform` @ `7a7f4c3` (file references are
  relative to `src/main/kotlin/com/finaxis/platform/` unless stated) and read-only probes of
  `https://finaxis-dev.api.ogaba.dev`.
- **Priority:** **P0** blocks a core prototype flow · **P1** degrades a flow or forces workarounds ·
  **P2** polish, consistency, or documentation.
- **Frontend handling** describes what the UI does until the gap closes. Wire details are in
  [`docs/superpowers/specs/2026-09-25-admin-prototype-parity-api-contract.md`](superpowers/specs/2026-09-25-admin-prototype-parity-api-contract.md).
- Keep this document current: close an entry (with the backend PR link) when the frontend adopts the
  fix.

## Summary

| ID    | Priority | Gap                                                                                                |
| ----- | -------- | -------------------------------------------------------------------------------------------------- |
| BG-01 | P0       | No approval-request / pending-change model (no return-for-changes, resubmission, branch rejection) |
| BG-02 | P0       | A tenant created through the API cannot onboard a second person through the API                    |
| BG-03 | P0       | Branch pinning: a selected branch hides every other branch; draft branches are unreachable         |
| BG-04 | P0       | Tenant settings `PUT` fails with 500 and rolls back (per source reading)                           |
| BG-05 | P0       | Published OpenAPI casing is wrong and list-item schemas are missing                                |
| BG-06 | P0       | No platform audit endpoint; tenant audit is 403 in the platform context                            |
| BG-07 | P1       | Business-rule failures return 500 instead of 4xx                                                   |
| BG-08 | P1       | Maker identity not exposed; maker-checker 403 indistinguishable from missing permission            |
| BG-09 | P1       | No `user_id` filters on branch assignments / memberships; thin list items                          |
| BG-10 | P1       | No global user directory or global user read                                                       |
| BG-11 | P1       | Invitation state not exposed; no resend; provisioning can stick with no recovery                   |
| BG-12 | P1       | Tenant settings catalogue unenforced and missing metadata; platform-only key unmanageable          |
| BG-13 | P1       | Branch address never returned; no branch update; opened/closed dates never set                     |
| BG-14 | P1       | Tenant legal name / registration number write-only; PATCH wipes them                               |
| BG-15 | P1       | No aggregate counts (role users/permissions, branch users, tenant branches/users)                  |
| BG-16 | P1       | Audit search and recording limitations                                                             |
| BG-17 | P1       | Missing user profile fields (phone read/edit, member number, last activity, MFA/security)          |
| BG-18 | P1       | Platform administrators can't create tenant branches without tenant membership                     |
| BG-19 | P2       | No global search endpoint                                                                          |
| BG-20 | P2       | No export endpoints                                                                                |
| BG-21 | P2       | No close-of-business readiness checks exposed                                                      |
| BG-22 | P2       | No notifications endpoint                                                                          |
| BG-23 | P2       | Context discovery inconsistencies (`total_items` overcount, duplicate branch IDs)                  |
| BG-24 | P2       | Bootstrap status can flip COMPLETED → FAILED from unrelated invitee failures                       |
| BG-25 | P2       | Identity and email delivery defaults (Keycloak admin off, email off, no password step)             |
| BG-26 | P2       | Ignored or dangerous sort parameters                                                               |
| BG-27 | P2       | Role lifecycle gaps (no delete; DISABLED roles assignable; ARCHIVED unused)                        |
| BG-28 | P2       | Terminal states without recovery (rejected tenant code stays taken; revoked member can't return)   |
| BG-29 | P2       | PLATFORM organisation included in tenant search results                                            |
| BG-30 | P2       | Wrong-context 403s put a sentence in `code`; invalid JWT 401 has no body                           |
| BG-31 | P2       | Mutations silently require the matching `.view` permission                                         |
| BG-32 | P2       | Documentation drift in the platform repository                                                     |
| BG-33 | P2       | Permission codes in /auth/me carry no scope                                                        |
| BG-34 | P2       | Role update accepts a blank name; an empty description clears it                                   |
| BG-35 | P2       | No documented self-lockout guard: a member may suspend or revoke themselves                        |

## Details

### BG-01 — No approval-request / pending-change model · P0

- **Gap:** Maker-checker exists only as per-resource transitions: membership activate (approver ≠
  inviter), branch activate (activator ≠ drafter), tenant approve (approver ≠ creator and submitter).
  There is no approval-request entity, no "return for changes", no resubmission, no reject for a
  pending branch, and no decision remarks for approvals that take no body (membership activate,
  tenant approve). Role and branch assignments made after onboarding take effect immediately; the
  prototype's "pending, no effective access" assignments can't exist. Rejecting a tenant is terminal.
  The `require_maker_checker_*` settings are never read. The platform roadmap plans no workflow module
  (`docs/architecture/accounting-foundation.md:653-690`).
- **Frontend handling:** a typed approval inbox (User onboarding, Branch activation) built from
  `membership_status=PENDING_APPROVAL` and `status=PENDING_APPROVAL` reads; decisions limited to
  approve, and reject-and-revoke for users; assignments presented as immediately effective.
- **Suggested change:** a generic approval request resource (subject, proposed change, maker, status,
  decisions with remarks, history) covering onboarding, assignments, branch creation, and sensitive
  settings, with approve / reject / return-for-changes and resubmission; or, at minimum, reject/withdraw
  for pending branches and remarks on every decision.

### BG-02 — A tenant created through the API cannot onboard a second person · P0

- **Gap:** Tenant approval creates one user, the `TENANT_ADMIN` bootstrap admin. That admin cannot
  approve their own invites (maker-checker 403) nor activate branches they drafted. Platform
  administrators cannot step in: tenant routes reject the platform context
  (`lifecycle/adapter/inbound/web/CallerContextResolver.kt:78-94`), and platform branch creation also
  requires tenant membership (`lifecycle/application/BranchProvisioningService.kt:38-42`). No setting
  disables the rule; the local seed works only because migration V4 seeds a second actor.
- **Frontend handling:** approve controls are disabled for the maker with an explanation; the overview
  readiness item "People" flags tenants with fewer than two active members.
- **Suggested change:** let the bootstrap flow create a second approver, allow a platform-context
  checker for a tenant's first approvals, or exempt the bootstrap admin's first invite under an
  audited policy.

### BG-03 — Branch pinning · P0

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
- **Suggested change:** check tenant-administration branch operations at tenant scope independently
  of the selected branch (branch context should narrow operational work, not administration), and
  allow single-branch users to clear the branch.

### BG-04 — Tenant settings `PUT` fails with 500 · P0

- **Gap:** `IdempotencyExecutor.kt:39` validates each successful mutation response with
  `SafeReplayResponse.kt:112-153`, which rejects any property whose name contains `key`;
  `TenantSettingResponse` has `key`, so every `PUT /tenant/settings/{key}` throws, returns
  `500 internal_error`, and rolls back the write, audit, and event. `TenantSettingsControllerTests`
  (a `@WebMvcTest` without the idempotency aspect) doesn't catch it. Found by source reading; to be
  confirmed live. `DELETE` (204, no body) is unaffected.
- **Frontend handling:** editing ships disabled behind `SETTINGS_EDIT_ENABLED`
  (`modules/administration/settings/settings-flags.ts`), with the reason shown on the Locale &
  currency card. Reset to default (`DELETE`, 204) works. Flip the flag when this closes.
- **Suggested change:** exempt the settings response (or the specific `key` property) from the
  replay-safety filter, and cover the endpoint with an integration test including the aspect.

### BG-05 — OpenAPI casing wrong; list-item schemas missing · P0

- **Gap:** The wire format is snake_case and rejects unknown properties
  (`common/web/api/ApiJsonCodec.kt:27-28`), but springdoc publishes camelCase for every DTO except the
  auth ones (which carry explicit `@Schema(name=…)`). `ApiPage.items` is untyped; the summary item
  schemas (`MembershipSummaryResponse`, `BranchSummaryResponse`, `RoleSummaryResponse`,
  `TenantSummaryResponse`, `PermissionSummaryResponse`, `AuditEventSummaryResponse`,
  `BusinessDateHistoryEntryResponse`, `AvailableOrganisationResponse`, `AvailableBranchResponse`) are
  absent. A client generated from the spec sends camelCase and gets `400 invalid_json`.
- **Frontend handling:** hand-written zod wire schemas from source; no generated client.
- **Suggested change:** configure springdoc with the same naming strategy (or a property-naming
  customizer) and publish generic page schemas per item type.

### BG-06 — No platform audit · P0

- **Gap:** There is no platform audit endpoint, and `/tenant/audit-events` returns 403 in the platform
  context. Platform actions on a tenant are written to that tenant's audit log (unreadable from the
  platform context); platform user lifecycle events are written under the PLATFORM organisation and
  can't be read at all.
- **Frontend handling:** the existing `/platform-admin/audit` page (which only worked against the E2E
  fake) is removed; tenant records have no Audit tab in the platform workspace.
- **Suggested change:** `GET /platform/audit-events` (platform organisation log) and
  `GET /platform/tenants/{id}/audit-events` (a tenant's log for platform operators).

### BG-07 — Business-rule failures return 500 · P1

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
- **Frontend handling:** pre-validation of every known trigger (e.g. membership lookup by email before
  inviting, sort allow-lists), a tenant-code lookup after a failed create to name a duplicate (the
  create goes first, so a replayed create is never turned away), and a generic error showing
  `request_id`. The user record withholds Approve once approval ran and names the likely causes of
  the other approval 500s.
- **Suggested change:** map domain precondition failures to 404/409/422 with specific codes.

### BG-08 — Maker not exposed; ambiguous 403 · P1

- **Gap:** No membership, branch, or tenant DTO exposes the maker; the only source is the audit
  `actor_id` on `user.invite` / `branch.create_draft` / `organisation.create_draft`/`submit`, which
  needs `audit.view` (and isn't readable at all for tenants from the platform context). Maker-checker
  violations return `403 forbidden`, identical to a missing permission.
- **Frontend handling:** maker looked up from audit when `audit.view` is held; otherwise the approve
  action stays enabled and a 403 is explained as "permission or maker-checker". The user record
  disables Approve for the user's inviter (the `user.invite` actor).
- **Suggested change:** add `created_by`/`submitted_by` (id + display name) to the DTOs and a distinct
  problem code such as `maker_checker_violation`.

### BG-09 — Missing filters; thin list items · P1

- **Gap:** Branch assignments have no `user_id` filter (and are forced to the selected branch);
  memberships have no `user_id` filter; `/tenant/users` items lack `membership_id`, `membership_type`,
  and dates; membership items lack names; assignment items are IDs only; branch items lack timezone,
  parent, and dates; tenant items lack currency, timezone, and bootstrap status. Role items lack
  description and dates. `sort_*` on memberships and branch assignments is accepted but ignored;
  `/tenant/users` has no sort.
- **Frontend handling:** memberships resolved with `q=<email>` (at most 5 pages of 100, matched on
  the user id); a user's branch assignments found by a bounded scan and flagged "partial" (at most
  500 active assignments); names resolved per visible page; the role index (role names, and the
  Assign-role picker's options) reads at most the first 500 roles by name, because roles can be
  searched (`q`) but not looked up by a set of ids, so past 500 the picker says so and a role's name
  on an assignment falls back to its short id; lists show only what items carry (the role directory
  shows role, code, type, and status only). The roles page also departs
  from the prototype in three smaller ways: the Overview's "Active assignments" counts assignments,
  not distinct users; the toolbar search commits on Enter or blur; and backend `validation_failed`
  violations aren't mapped onto form fields (the forms apply the same rules client-side).
- **Suggested change:** `user_id` filters on memberships and branch assignments; an `ids` filter on
  roles; embed display names
  (user, role, branch) in assignment and membership summaries; add membership fields to user
  summaries; honour or remove the sort parameters.

### BG-10 — No global user directory · P1

- **Gap:** No endpoint lists all users or fetches a global user by ID; `/platform/users` only has
  suspend, reactivate, deactivate.
- **Frontend handling:** "Platform users" lists the platform organisation's members
  (`/platform/tenants/{PLATFORM}/users`); tenant users are reachable per tenant.
- **Suggested change:** `GET /platform/users` (search, status filter, memberships per user) and
  `GET /platform/users/{id}`.

### BG-11 — Invitation state, resend, and stuck provisioning · P1

- **Gap:** No invitation entity, status, expiry, or accepted timestamp; the `identity_dispatch_log` is
  internal. No resend endpoint. With Keycloak admin disabled (the default, `application.yaml:378`),
  approval leaves users in `PROVISIONING_IDP` and memberships `PENDING_APPROVAL` forever; approving
  again returns 500.
- **Frontend handling:** an onboarding state derived from membership + user status; "Provisioning
  identity" shown as a distinct state with guidance; no resend or expiry.
- **Suggested change:** expose invitation/dispatch status, add resend and retry endpoints, and make
  re-approval idempotent.

### BG-12 — Settings catalogue unenforced and under-described · P1

- **Gap:** None of the six catalogue keys is read at runtime (`lifecycle/domain/TenantSettingCatalog.kt:25-159`):
  the maker-checker toggles are no-ops (maker-checker always applies), auto-advance doesn't exist,
  accounting reads the organisation's currency column, retention isn't enforced. The catalogue has no
  label, description, or group metadata; unset keys show their default (indistinguishable from an
  explicit value); non-catalogue stored keys appear in the list; `audit_retention_days` needs
  `tenant_setting.manage_platform` in the PLATFORM organisation even for reads, while tenant routes
  reject the platform context — so only a member of both can manage it.
- **Frontend handling:** timezone and currency editable (subject to BG-04); the three no-op keys
  read-only with honest labels; retention shown as "Managed by the platform".
- **Suggested change:** enforce or remove the no-op keys; add metadata (label, description, group,
  `is_default`); a platform-context endpoint for platform-only tenant settings.

### BG-13 — Branch address, update, and dates · P1

- **Gap:** `address` is accepted and stored but branch detail always returns `{}`
  (`BranchController.kt:860`, `PlatformTenantBranchController.kt:323`). No branch update endpoint.
  `opened_on`/`closed_on` are never set by the API.
- **Frontend handling:** no address input or display; no edit; dates shown only when present.
- **Suggested change:** return the stored address; add `PATCH /branches/{id}` for name, parent,
  timezone, address; set opened/closed dates on activate/close.

### BG-14 — Tenant legal name and registration number · P1

- **Gap:** Accepted on create/amend but never returned (`TenantApiDtos.kt:172-194`); the admin draft
  details and `status_reason` can't be read either. PATCH replaces every field, so an amend without
  re-entering legal name / registration number nulls them; `initial_settings` and `business_date` are
  ignored on amend.
- **Frontend handling:** the amend wizard asks for those fields and the first administrator to be
  re-entered, says why, and sends no settings or business date.
- **Suggested change:** return them (and admin draft details, status reason) on tenant detail; make
  PATCH a partial update.

### BG-15 — No aggregate counts · P1

- **Gap:** No counts for role users, role permissions, branch users, tenant branches, or tenant users.
  Deriving them costs one `size=1` call per count per row against a 600 reads/min budget.
- **Frontend handling:** counts only on record pages (one call each); lists don't show them.
- **Suggested change:** include counts on summary DTOs or add a counts endpoint.

### BG-16 — Audit search and recording · P1

- **Gap:** No free-text, outcome, severity, branch, or event-type filters; `actor_id` matches USER
  actors only. Every non-accounting event is INFO; `recordSecurityEvent` is never called, so denied
  API calls aren't audited; `ip_address` is never populated. `event_type` always equals `entity_type`.
  Membership suspend/reactivate are keyed by user ID while revoke is keyed by membership ID; branch
  assign/revoke are logged on the branch with no user reference; assignment events carry no user in
  metadata — so one user's history needs several queries and is still incomplete. Branch-selected
  requests stamp the selected branch on audit rows regardless of the branch acted on. Summary and
  detail DTOs name the same columns differently (`resource_*`/`actor_id` vs `entity_*`/`actor_user_id`).
- **Frontend handling:** structured filters only; record tabs offer per-entity views.
- **Suggested change:** add the missing filters and a "related subject" query (e.g. `subject_user_id`),
  record severity and denied calls, populate IP, key membership events consistently, and align DTO
  names.

### BG-17 — Missing user profile fields · P1

- **Gap:** Phone is stored but no read DTO returns it and nothing edits it; the per-tenant MEMBER
  sequence (member/staff number) is created but unused; `last_login_at` is updated on every
  context-bearing request but never exposed; MFA/security state lives only in Keycloak; no profile or
  display-name edit; no change of membership type or primary branch.
- **Frontend handling:** columns and tabs omitted; Security links to the Keycloak account console for
  the signed-in user.
- **Suggested change:** expose phone, member number, and last activity; add user and membership update
  endpoints; optionally surface Keycloak credential/MFA status.

### BG-18 — Platform branch creation needs tenant membership · P1

- **Gap:** `POST /platform/tenants/{id}/branches` checks `branch.create` in PLATFORM **and** inside the
  tenant (`BranchProvisioningService.kt:38-42`), so it returns 403 unless the platform administrator is
  an active member of that tenant.
- **Frontend handling:** create-draft on the platform tenant record warns about the requirement.
- **Suggested change:** authorize platform-context branch creation with the platform permission alone.

### BG-19 — No global search · P2

No endpoint searches across users, branches, roles, or references. The header ships without a search
box. Suggested: `GET /tenant/search?q=` returning typed hits.

### BG-20 — No export · P2

No CSV/Excel export for audit events or directories. Export buttons are omitted. Suggested: streaming
export endpoints with the same filters as the searches.

### BG-21 — No close-of-business readiness · P2

The prototype's COB readiness checks (unbalanced tellers, pending closures, audit stream, exports,
jobs, posting window) have no API; close-of-business is optional and unchecked. Suggested: a
readiness endpoint returning named checks and their status.

### BG-22 — No notifications · P2

No notification feed. The header badge counts actionable approvals from two list reads. Suggested: a
notifications/inbox endpoint.

### BG-23 — Context discovery inconsistencies · P2

`/auth/organisations` filters after paging, so `total_items` can overcount
(`AuthSelectionService.kt:103-115`). The assigned-branch lookup has no DISTINCT
(`IamRepositories.kt:248-266`): a user holding HOME and OPERATE at one branch gets duplicate
`assigned_branch_ids`, `requires_branch_selection: true`, and no auto-selection; `/auth/me` and
`/auth/branches` repeat branches and roles, and `/auth/me` can include SUSPENDED branches and DISABLED
roles. The frontend de-duplicates. Suggested: filter before paging and de-duplicate server-side.

### BG-24 — Bootstrap status overwritten by unrelated failures · P2

Any Keycloak provisioning failure in a tenant marks its bootstrap FAILED, without checking the current
status (`KeycloakUserProvisioningJobRequestHandler.kt:101`), so a later invitee's failure turns
COMPLETED into FAILED and invites a bootstrap retry. Suggested: scope the status update to the
bootstrap admin's job.

### BG-25 — Identity and email delivery defaults · P2

Keycloak admin provisioning and outbound email are disabled by default; with email off, invite and
welcome emails fail permanently (audited, no state change). The Keycloak execute-actions email sends
`VERIFY_EMAIL` only — no `UPDATE_PASSWORD`, lifespan, or redirect. Suggested: include `UPDATE_PASSWORD`
and a redirect to the app, and surface delivery failures (see BG-11).

### BG-26 — Sort parameters · P2

`sort_by` values are camelCase and anything outside the allow-list returns 500 (BG-07); memberships and
branch assignments accept and ignore sort. Suggested: validate sort values with 400 and document them
in the OpenAPI.

### BG-27 — Role lifecycle · P2

No role delete; `ARCHIVED` is never written; activate/deactivate work from any state; a DISABLED role
can be assigned (it grants nothing). The roles page offers assignment only for ACTIVE roles and has
no delete. Suggested: archive/delete for unused custom roles and a status check on assignment.
The assign action also re-reads the role's status before posting, which narrows the race but cannot
close it: the backend must check.

### BG-28 — Terminal states without recovery · P2

A rejected tenant is terminal and its `tenant_code` stays taken, so resubmission needs a new code. A
revoked membership can never be re-invited (unique per organisation + user; invite rejects any existing
membership). The UI warns before both. Suggested: allow re-invitation of revoked members and
reuse/release of rejected codes.

### BG-29 — PLATFORM organisation in tenant search · P2

`GET /platform/tenants` includes the reserved PLATFORM organisation. The frontend filters it out,
so a page can show one fewer row. The result count subtracts it whenever it is known to be included
(always when unfiltered, and when its row is on the page), so a filtered count can read one high;
its record URL shows the not-found page. Suggested: exclude it server-side.

### BG-30 — Error envelope inconsistencies · P2

Wrong-context 403s pass a message as the `code` (`CallerContextResolver.kt:61-87`), e.g.
"Branch operations are restricted to non-platform tenant context.", also embedded in `type`. An invalid
or expired JWT returns 401 with an empty body and no `X-Request-Id`. Suggested: stable codes
(`platform_context_required`, `tenant_context_required`) and a problem body for invalid tokens.

### BG-31 — Hidden `.view` requirement on mutations · P2

Role, membership, branch, branch-assignment, role-assignment revoke, and platform tenant mutations read
their result back in the same transaction and need the matching `.view` permission; without it they
return 403 and roll back. The UI gates on both. Suggested: read back with the mutation's own authority
or document the requirement.

### BG-32 — Documentation drift (platform repository) · P2

- `docs/api/foundation-api.md`: profile example (`organisation.tenant_code`/`display_name`,
  `membership.membership_type`) doesn't match `organisation {id, code, name, status}` /
  `membership {id, status}`; audit example uses `event_type: "TenantApproved"` and action
  `tenant.approve`, neither of which exists; settings example key `statement.cutoff_time` isn't in the
  catalogue; permission example module "lifecycle" isn't a module; sort parameters listed for
  memberships and branch assignments are ignored.
- `docs/operations/tenant-settings.md:79-81` says reads need `settings.update` (code: `settings.view`).
- `docs/security/active-organisation-context.md:29-31,61-63` shows camelCase request bodies (rejected).
- `docs/architecture/rate-limiting.md` doesn't match `application.yaml`.
- `docs/architecture/lifecycle-fsm.md` omits transitions and shows PROVISIONING_IDP → ACTIVE, which the
  code doesn't have.
- `README.md:121-122` says API docs are off in production (environment-controlled, default on).
- `docs/architecture/accounting-foundation.md:659-660` calls the `require_maker_checker_*` settings
  switches; the code never reads them.

### BG-33 — Permission codes in `/auth/me` carry no scope · P2

`/auth/me` returns only the flattened effective permission codes, so tenant-scoped gates can't be
told apart from branch-scoped ones. Some routes check their permission at tenant scope:
`GET /branches` (`branch.view`), and the user search and branch assignment behind the assign drawer
(`user.view`, `user.assign_branch`). A role granting those codes only at branch scope passes the
UI's gate and then gets a 403. Frontend handling: the backend stays the authority. The Branches
directory shows its access-denied state (spec §6.6), and the assign drawer reports the 403 inline.
Suggested: return each permission with its scope (tenant or the branch ids) on `/auth/me`.

### BG-34 — Role update accepts a blank name; an empty description clears it · P2

- **Gap:** `UpdateRoleRequest` has no `@NotBlank` (`iam/adapter/inbound/web/dto/RoleApiDtos.kt`),
  and `updateRole` sets every non-null field (`JooqIamAdministrationPersistence.kt`). So a blank
  `role_name` is stored and `""` replaces the description, while `null` keeps either field.
  Found by source reading at f74e44b; the contract (7a7f4c3) said the description can't be
  cleared. Source reading only (no UI path to probe it live).
- **Frontend handling:** the edit form requires a name (1–100 characters) and sends `null` for a
  blank description, so a description can be replaced but not removed.
- **Suggested change:** validate `role_name` as `CreateRoleRequest` does, and document whether
  `""` clears the description.

### BG-35 — No documented self-lockout guard on memberships · P2

- **Gap:** The contract documents no guard against a caller suspending or revoking their own
  membership, or revoking their own role assignments (§E.3 names none; source 7a7f4c3). Without
  one, a self-suspend ends the session's context at once, because every request re-validates an
  ACTIVE membership (§A), and a self-revoke is permanent (BG-28). Not probed live: the probe
  itself would be irreversible.
- **Frontend handling:** the user record shows Suspend and Revoke disabled on the signed-in user's
  own record, with the reason; revoking your own role assignment warns in its confirmation
  (layer 09). Revoking your own branch assignment from the user record's Branch assignments tab
  shows no such warning (layer 08's `RevokeAssignmentButton` has no `self` prop); at the selected
  branch it invalidates your context (§E.4).
- **Suggested change:** document the guard if one exists; otherwise refuse a self-suspend and a
  self-revoke with a 409 and a specific code.
