# Backend gap adoption — design

**Status:** approved 2026-11-24 (plan of action, low-fidelity designs and workflow changes).
**Scope:** frontend only. Adopt every fix the platform shipped for the gaps in
[`docs/backend-gaps.md`](../../backend-gaps.md), so each entry can be marked **Closed** or **Adopted**.
**Target contract:** `kevogaba/finaxis-platform` `main` @ `6a8ea28`.
**Plan:** [`docs/superpowers/plans/2026-11-24-bg-adopt-00-index.md`](../plans/2026-11-24-bg-adopt-00-index.md).

## 1. Why

The platform has fixed 26 of the 35 gaps and partly fixed the other 9. The frontend adopted none of
them, and 14 of those fixes changed behaviour the UI depends on, so some screens are wrong against the
real platform today. Fixed points include the following:

- Branch activation is hidden for everyone. The UI gates it on `branch.activate`, which V21
  deprecated.
- Institution counts read one low.
- Settings can't be edited although `PUT` works. Reset on `base_currency` fails, and the
  maker-checker switches are shown as always on.
- Error explanations key on 500s that no longer happen.
- Some actions are shown and then refused with 403: missing paired views, `user.assign_self`, and the
  grant drawer offering `user.assign_self`.
- An archived role offers Activate.
- A revoked member can't be re-invited, and after a re-invite Approve is blocked for the wrong person.

The e2e fake API still mirrors the old contract, so `pnpm test:e2e` passes against behaviour the
platform dropped. Success means every register entry is **Closed** (or **Adopted** where the platform
keeps part open), the fake API mirrors `6a8ea28` for every route the UI uses, and the workarounds the
fixes made unnecessary are gone.

## 2. Goals, non-goals, anti-goals

- **Goals**
  - Adopt every shipped fix.
  - Retire the workarounds: the 5×100 branch-assignment scan, the email membership search, the
    audit-log maker lookups, the client de-duplication of `/auth/me`, and the "switch to All
    branches" detours.
  - Keep the register, the API contract document and `AGENTS.md` true.
- **Non-goals**
  - Platform changes.
  - The items the platform declined (ADR 0029, 0035, 0037, 0038, 0039).
  - Generating a client from the OpenAPI.
- **Anti-goals**
  - Echoing backend `detail` text.
  - Gating a UI action on a permission the platform doesn't check, or showing an action the platform
    will refuse.
  - Weakening a client guard that protects the user from an irreversible self-action.
  - Introducing an unbounded list.

## 3. Constraints

The rules in `AGENTS.md` all apply. These are the ones most often touched here:

- **Stack and styling**
  - MUI v9 plus Tailwind for layout only.
  - Colours only through theme tokens.
  - No new packages.
- **React boundaries**
  - Server Components by default.
  - No function props across the client boundary.
- **Wire and mutations**
  - Mutations are Server Actions through `runServerAction`.
  - Reads go through `apiGet(path, schema)` with snake_case zod schemas.
  - Lists are server-paginated, with their state in the URL.
- **Fake API:** it mirrors the platform exactly, quirks included, for every route a PR touches, and
  never runs ahead of the PR.
- **Verification:** `pnpm check` and `pnpm test:e2e` are clean for every PR; `pnpm build` and
  `pnpm test:e2e:guard` run at the end of each milestone.

## 4. Approaches considered

1. **One linear stack, merged a milestone at a time** (chosen). Twenty-eight small PRs, each closing
   whole gaps and carrying its own contract, fake-API, test and register changes. About six are open
   at once. It costs strict ordering: a fix low in the stack rebases everything above it.
2. **One stack per area.** Areas could be reviewed in parallel, but they share `scenarios.mts`,
   `state.mts`, the fake-API route files and the wire contracts. The cross-area dependencies (makers →
   users → audit) force an order anyway.
3. **One PR per milestone.** Several thousand lines each, against the prefer-small-PRs rule.

## 5. Decisions (owner answers, 2026-11-24)

| #   | Question                           | Decision                                                                                                                                                                                                          |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Branch names                       | `bg-adopt/NN-concern` for every PR.                                                                                                                                                                               |
| Q2  | Stack shape                        | One linear stack, merged a milestone at a time.                                                                                                                                                                   |
| Q3  | Scope                              | All 35 gaps, M0–M5, with a review point after each milestone.                                                                                                                                                     |
| Q4  | Approver who can't read the switch | Read the maker-checker switch when the approver holds `settings.view`; otherwise leave Approve enabled and explain the platform's named refusal.                                                                  |
| Q5  | "Platform users"                   | Becomes **Users**: everyone on the platform (`GET /platform/users`), with an institution filter that includes the platform organisation.                                                                          |
| Q6  | Close of business while not ready  | Allowed. The Start close of business dialog names each failing blocking check, and its confirm reads "Start anyway".                                                                                              |
| Q7  | Approval remark                    | An optional remark (at most 500 characters) in every Approve dialog, for members and institutions.                                                                                                                |
| Q8  | Register status after adoption     | **Adopted** when the frontend uses everything the platform shipped and the platform still lists work under _Still open_. **Closed** when nothing is left.                                                         |
| Q9  | Branch address fields              | Fixed fields with keys `line_1`, `line_2`, `city`, `region`, `postal_code` (labels: Address line 1, Address line 2, City or town, Region, Postal code). Any other stored key is shown read-only and kept on save. |

## 6. Verified facts that change the build

These are the 22 corrections to the register, all verified in platform source at `6a8ea28`.
PR 00 writes them into the register.

1. `GET /tenant/users/{id}` and the user list items return `membership_id`, `membership_type`,
   `created_at` (the account's), `membership_created_at` and `created_by {id, display_name}|null`.
   The user record therefore needs no membership search, and no `audit.view` to name its inviter.
2. `/tenant/users?sort_by=createdAt` sorts by the account's creation date, not the membership's.
3. A re-invite clears `joined_at`, `suspended_at`, `revoked_at` and `status_reason`, but keeps the
   membership's `created_at`.
4. **`invitation`**
   - Every membership mutation response carries it, the platform `activate` included.
   - Retry has no maker-checker rule. It answers 200 doing nothing while a job runs, and needs a
     recorded delivery that hasn't succeeded.
   - Resend needs a delivery row, an INVITED user and an ACTIVE membership.
   - A REVOKED membership can still read `FAILED` (code `CANCELLED`).
5. **Edit refusals**
   - The membership PATCH answers 409 `conflict` when an ACTIVE membership moves to STAFF/ADMIN while
     the user has no active branch assignment.
   - The platform user PATCH answers 422 for a DEACTIVATED or ARCHIVED account, and trims
     `display_name`.
6. **Settings shape**
   - `base_currency` always reads `is_default: false`, and no read-only flag exists, so read-only is
     decided by key.
   - The settings list is sorted by key, not by group.
   - The API labels differ from today's UI labels.
7. The frontend's `isTimeZone` accepts raw offsets such as `+03:00`. The platform answers those with 422.
8. **Platform audit**
   - It answers an empty page, not 404, for an unknown institution.
   - The tenant lookups the audit page uses (user names, branch names, organisation time zone) are 403
     in the platform context.
   - Platform list items null `before_json`, `after_json`, `metadata_json`, `user_agent`,
     `ip_address` and `actor_external_subject`.
9. The tenant audit log also receives `audit.export` and `audit.retention_purge` rows. Denied rows
   (`api.access_denied`) use entity type `API_ROUTE`.
10. Branch `activate` already takes an optional `reason`, and the UI sends it. Only membership and
    institution approval lacked one.
11. Discard needs `branch.create` tenant-wide. A draft with an active child branch or an active
    assignment is a plain 409 `conflict`.
12. **Who can approve a branch**
    - The tenant activate route refuses the creator and anyone who edited the branch, but not the
      submitter.
    - The platform route also refuses the submitter.
    - Nothing exposes who edited a branch, so `approver_is_branch_modifier` can only be explained
      after the refusal.
13. **A switch set to `false`**
    - It also lets the invited person approve their own membership, and lets anyone who edited a
      branch approve it.
    - Reading a switch needs `settings.view`.
    - The platform checker is never relaxed.
14. `pending-count` excludes only the rows the caller created. The beneficiary, the submitter and
    anyone who edited the request are still counted, as are memberships still provisioning.
15. A platform-created branch draft can be platform-submitted only while the checker window is open.
16. **Branch selection and access**
    - `POST /auth/select-branch` clears the branch on `{}` or `{"branch_id": null}`, and rejects `""`.
    - A branch-scoped caller now gets 403 on another branch's page. Today that renders a generic
      `ErrorState`.
17. **Count fields**
    - `permission_count` counts every grant, whatever the permission's status.
    - Role `active_user_count` counts distinct users with an ACTIVE assignment.
    - Branch `active_user_count` counts distinct users.
    - An institution's `active_user_count` counts ACTIVE memberships.
18. In `/auth/me` `permission_scopes`, `branch_ids` is absent (not null) on TENANT entries.
19. `/auth/me` lists ACTIVE roles only, so it can't show that the caller holds a DISABLED role.
    The grant refusal order is 403 `role.assign_permission` → 404 → 409 (system/archived) → 422
    `user.assign_self` → 403 holder → 404 permission → 400 composition.
20. **Permission catalogue**
    - `GET /tenant/permissions` is tenant-only and needs `permission.view`, which branch roles lack.
    - The composition 400 carries no `violations`.
    - So view requirements need a checked-in map, tested against the platform's catalogue.
21. `POST /tenant/users` checks `user.invite` with `membership.view` and `user.view` tenant-wide,
    and assigns each invited branch through `user.assign_branch` with `branch_assignment.view` at
    that branch (`UserProvisioningService.createInvitationAssignments` →
    `BranchProvisioningService.assignUser`). `INVITE_CODES` lacked `membership.view`. (Corrected
    during 04: an earlier reading said the invite no longer checked `user.assign_branch`; the
    platform's own tests invite with no branch assignments.)
22. Platform-scope codes (`grant_scope: PLATFORM`) can be granted to tenant roles without refusal,
    and grant nothing there.

## 7. The stack

Trunk `main`. One linear stack of draft PRs, titled `<conventional subject> (NN/27)`. Each PR has one
conventional commit.

| #   | Branch                           | Pull request                                                                    | Closes                             |
| --- | -------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------- |
| 00  | `bg-adopt/00-docs`               | docs(backend-gaps): correct the register and record the adoption plan           | BG-05, BG-24, BG-32                |
| 01  | `bg-adopt/01-branch-approve`     | fix(approvals): gate branch approval on branch.approve                          | item 1                             |
| 02  | `bg-adopt/02-platform-counts`    | fix(platform): stop subtracting the platform organisation from counts           | BG-29                              |
| 03  | `bg-adopt/03-named-refusals`     | fix(errors): explain the platform's 4xx and named refusal codes                 | BG-07, BG-26, BG-30, BG-35         |
| 04  | `bg-adopt/04-view-pairs`         | fix(access): pair each mutation with its views and read permission scopes       | BG-23, BG-31, BG-33                |
| 05  | `bg-adopt/05-assign-self`        | fix(access): guard adding to your own access                                    | item 13                            |
| 06  | `bg-adopt/06-role-archive`       | fix(roles): archive roles and allow clearing a description                      | BG-27, BG-34                       |
| 07  | `bg-adopt/07-settings`           | feat(settings): edit settings from the platform's catalogue                     | BG-04 (BG-12 tenant part, item 12) |
| 08  | `bg-adopt/08-makers`             | feat(approvals): read makers from records and honour the maker-checker switches | BG-08                              |
| 09  | `bg-adopt/09-branch-context`     | feat(context): retire the branch-pinning workarounds                            | BG-03                              |
| 10  | `bg-adopt/10-branch-requests`    | feat(branches): return, withdraw and discard branch requests                    | BG-01 (branch part)                |
| 11  | `bg-adopt/11-branch-edit`        | feat(branches): branch address and edit                                         | BG-13                              |
| 12  | `bg-adopt/12-approval-remarks`   | feat(approvals): an optional remark on every approval                           | BG-01 (remarks)                    |
| 13  | `bg-adopt/13-institution-return` | feat(platform): return an institution for changes and amend it pre-filled       | BG-01, BG-14                       |
| 14  | `bg-adopt/14-pending-counts`     | feat(approvals): pending counts from the count routes                           | BG-22                              |
| 15  | `bg-adopt/15-platform-checker`   | feat(platform): check a new institution's first members and branches            | BG-02, BG-18                       |
| 16  | `bg-adopt/16-member-reads`       | feat(users): read a member's membership and assignments by id                   | BG-09                              |
| 17  | `bg-adopt/17-invitation`         | feat(users): invitation status with retry and resend                            | BG-11, BG-25                       |
| 18  | `bg-adopt/18-reinvite`           | feat(users): re-invite a revoked member                                         | BG-28                              |
| 19  | `bg-adopt/19-membership-edit`    | feat(users): member number and membership edit                                  | BG-17 (tenant part)                |
| 20  | `bg-adopt/20-count-columns`      | feat(directories): count columns for roles, branches and institutions           | BG-15                              |
| 21  | `bg-adopt/21-platform-users`     | feat(platform): a cross-institution user directory and profile edit             | BG-10, BG-17                       |
| 22  | `bg-adopt/22-platform-settings`  | feat(platform): an institution Settings tab for audit retention                 | BG-12                              |
| 23  | `bg-adopt/23-audit-filters`      | feat(audit): outcome, severity, branch and text filters, and one user history   | BG-16                              |
| 24  | `bg-adopt/24-audit-export`       | feat(audit): export the audit trail as CSV                                      | BG-20                              |
| 25  | `bg-adopt/25-platform-audit`     | feat(platform): platform audit and an institution Audit tab                     | BG-06                              |
| 26  | `bg-adopt/26-cob-readiness`      | feat(business-date): close-of-business readiness                                | BG-21                              |
| 27  | `bg-adopt/27-tenant-search`      | feat(shell): search the institution from the header                             | BG-19                              |

Milestones: **M0** 00 · **M1** 01–07 (fix what is wrong today) · **M2** 08–15 (approvals,
maker-checker, branches) · **M3** 16–19 (users and invitations) · **M4** 20–22 (directories and
platform records) · **M5** 23–27 (audit and new capabilities).

## 8. Behaviour by PR

What each PR must do, as approved in the designs. The just-in-time plan for each PR turns it into
tasks.

### 01 — branch approval on `branch.approve`

- Replace `branch.activate` with `branch.approve` everywhere the UI gates branch activation:
  - `BRANCH_ACTIVATION_CODES`
  - the `activate` code in `branch-rules.ts`
  - the navigation's `requiresAny`
- The fake API's activate checks `branch.approve`, and the scenarios grant it.
- `branch.activate` stays only in the audit vocabulary (historical rows).

### 02 — platform organisation counts

- Delete `visibleTenantTotal` and `activeInstitutionCount`; use `total_items` as returned.
- The fake `GET /platform/tenants` leaves out the platform organisation unless
  `include_platform=true`.
- Keep `isInstitutionId` for record URLs.

### 03 — named refusals

Explain these codes, without echoing `detail`.

- **Business-rule statuses (BG-07)**
  - Invite: 409 `conflict` (keep the post-failure email/username lookup, which names the cause),
    422 `invalid_operation`, 400 `validation_failed`.
  - Approve: 404, 409, and 202 for "still processing, requeued".
  - Revoke: 409.
  - Tenant create: duplicate code is 409.
- **Maker-checker codes (BG-08 item 3):** every `lifecycle.approver_is_*` code and
  `lifecycle.platform_checker_closed`, on approve, reject, activate and return. Tenant reject now
  maps the maker codes too.
- **Self-change codes (BG-35):** `lifecycle.self_membership_change` and
  `lifecycle.self_account_change`. The UI's own pre-checks stay.
- **Context codes (BG-30):** `platform_context_required` and `tenant_context_required`, in
  `lib/api/problem.ts`.
- **Sort (BG-26):** 400 `invalid_parameter` replaces the fake API's sort 500s. Fix the "anything
  else is a backend 500" comments.
- **Role assignment:** 422 `invalid_operation` reads "This role is no longer active, so it can't be
  assigned."
- **Self-revoke warning:** revoking your own branch assignment from the user record warns the way the
  role revoke does: "This is your own access. If <branch> is your selected branch, you'll be asked to
  choose your context again."
- Copy is in the approved designs (`#d-errors`).

### 04 — view pairs and permission scopes

- **View-requirement map:** add `auth/permission-views.ts`, the platform's
  `permission_view_requirement` pairs (V22, V32–V34, V39) as `Record<string, readonly string[]>`,
  plus `requiredViews(code)` and `withViews(codes)`.
  - A unit test pins it against the fake API's catalogue.
  - The fake catalogue mirrors the platform's 86 codes, with `kind`, `grant_scope` and
    `required_view_permissions`.
- **Gates:** derive them from the map.
  - Invite needs `user.invite` + `membership.view` + `user.view` tenant-wide, and
    `user.assign_branch` + `branch_assignment.view` for its branches.
  - Assign role and revoke role need `role_assignment.view`.
- **Permission scopes:** parse `permission_scopes` (zod: `branch_ids` optional) and add
  `canTenantWide(holder, code)`.
  - Gate the Users nav item, the users page, Invite and the user pickers on tenant-wide `user.view`.
  - The fake `/auth/me` emits scopes computed over all ACTIVE branches.
- **De-duplication (BG-23):** drop `uniqueBy` and the `Set`. The fake `/auth/*` routes stop emitting
  duplicates, SUSPENDED branches and DISABLED roles.
- **Grant drawer**
  - Auto-adds the views a selected mutation needs ("Also grants …").
  - Posts views before mutations.
  - Hides platform-scope codes.
  - Maps the composition 400 by status.
- **Remove:** disabled, with "Needed by <mutation>", for a view a held mutation needs.
- **Fake API:** `requirePermission` pairs views at the same scope and refuses with 403 `forbidden`.
  Composition refuses with 400 `validation_failed`.

### 05 — your own access (`user.assign_self`)

- **User record:** on your own record, Assign role and Assign branch are disabled with "You can't add
  to your own access. A tenant administrator can." unless you hold `user.assign_self` tenant-wide.
- **Role page:** on a role you hold (an ACTIVE assignment at any scope, read with
  `GET /tenant/role-assignments?user_id=<me>&role_id=<id>&status=ACTIVE&size=1`), Grant permissions
  and Activate are disabled with "You hold this role, so adding to it or re-enabling it needs a
  tenant administrator."
- **Pickers:** the assign drawers' user picker excludes the caller under the same rule.
- **Grant drawer:** never lists `user.assign_self`.
- **Fake API:** grant 422 `invalid_operation` for `user.assign_self`. The self 403s on role and
  branch assignment, grant and activate follow the platform's order. `TENANT_ADMIN` holds
  `user.assign_self`.

### 06 — role archive and description

- **Rules**
  - `roleStatusAction`: Activate only from DISABLED, Deactivate only from ACTIVE, nothing for
    ARCHIVED.
  - `canArchiveRole`: custom, not archived, `role.archive` + `role.view`.
  - Edit, grant and remove are unavailable on an archived role.
- **Archive action:** an error-tone confirmation reading "Archiving is final. The role can't be
  edited, activated or assigned again, and its code <CODE> stays reserved."
  - When active assignments are known (`role_assignment.view`), the dialog says how many and
    disables the confirm, with a View assignments link.
  - A 409 is explained as "This role still has active assignments, or can't be archived."
- **Archived state:** a "This role is archived. It's kept for history and can't be changed." alert.
- **Directory:** the status filter's default option is labelled "Active and disabled"; Archived
  lists archived roles.
- **Lookups:** the role index adds a bounded `status=ARCHIVED` read (one page of 100), so names on
  old assignments resolve.
- **Assign:** drop the assign pre-read and map 422 instead.
- **Description:** drop the "can be replaced but not removed" help text and comment. The fake PATCH
  distinguishes absent, null and blank.

### 07 — settings

- **Contract:** parse `label`, `description`, `group`, `is_default` and `value_type`.
- **Layout:** cards follow the API's `group` in the order General, Approvals, Business date, Audit.
  Keys outside the catalogue keep the collapsed "Other stored settings" accordion.
- **Editable**
  - `default_timezone`: an IANA zone picker; the reason is optional.
  - The three BOOLEAN switches.
    - Turning a maker-checker switch off asks for a required reason and says what the switch
      relaxes (copy in `#d-settings`).
    - Storing `true` in auto-advance needs `business_date.advance` (403 named).
- **Read-only:** `base_currency`, with "Set from the institution's currency. It can't be changed
  here." `audit_retention_days` reads "Managed by the platform".
- **Reset:** offered only when `!is_default` on an editable key.
- **Retired:** `SETTINGS_EDIT_ENABLED`, `SETTING_GROUPS`, `EDIT_UNAVAILABLE`, and the overview's
  "Settings can't be saved yet".
- **Item 12**
  - The institution draft wizard bounds retention to 2555–36500 days.
  - Its Base currency setting follows the institution's currency.
  - Every time-zone field accepts IANA ids only (tighten `isTimeZone`).
- **Fake API:** maker-checker defaults `"true"`; unset platform-only value lists `null`; catalogue
  metadata; `base_currency` `PUT`/`DELETE` 422; 409 for a non-ACTIVE tenant; the
  `business_date.advance` check; audit row.
  - Drop the retired `business-date.timezone` seed and the listed `settings.operational`.
  - The frozen-currency scenario goes.

### 08 — makers and switches

- **Makers on the wire:** parse `created_by`/`submitted_by` (branches), `created_by` (memberships
  and users) and `requested_by`/`submitted_by` (tenants) with a shared `actorRefSchema` in
  `lib/api/wire.ts`.
- **Retired lookups:** delete `getMakerEvent`, `getBranchMaker`, `getUserInviter`, `knownMaker` and
  their callers.
- **Facts:** show "Invited by", "Drafted by", "Requested by" and "Submitted by" on the records.
- **Control checks:** the maker check resolves from the record without `audit.view`.
- **Decision gating (Q4)**
  - When the approver is the creator (or, on platform routes, the submitter), read the matching
    switch with `GET /tenant/settings/{key}` if they hold `settings.view`.
    - Switch on: Approve disabled, with the named reason.
    - Switch off: Approve enabled with "Maker-checker is off for <kind>. … recorded as a
      high-severity event."
  - Without `settings.view`, Approve stays enabled.
  - The pre-write maker refusals in the actions go; the platform decides, and PR 03's copy names the
    refusal.
- **Institution record:** Approve and Reject are disabled for its requester or submitter, with the
  reason.
- **Settings card:** the maker-checker switch descriptions on Settings already come from PR 07.

### 09 — branch context

- **Clearing the branch:** `selectBranch(null)` clears with `{"branch_id": null}`. Single-branch
  users get "All branches" in the context switcher.
- **Retired workarounds:**
  - the guided "switch to All branches" states (branch record, approval page, branch queue note,
    bell hint, overview card)
  - `BRANCH_CONTEXT_CODE`/`BRANCH_CONTEXT_REFUSAL`
  - `BranchContextState`
- **Branch record 403:** renders `ForbiddenState`.
- **Assignment searches:** pass `branch_id` or `user_id` explicitly.
- **Fake API:** branch reads, transitions and assignments check the target branch (a tenant-wide
  grant, or a grant on that branch, 403 otherwise). Assignment search honours `branch_id`/`user_id`.
  `select-branch` accepts null and absent and rejects `""`.

### 10 — branch requests

- **Return or Withdraw** on PENDING_APPROVAL (required reason, 3–500 characters), on the branch
  record and beside Activate on the approval page.
  - Withdraw shows for its creator or latest submitter with `branch.create`.
  - Return shows for anyone else with `branch.approve`.
- **Discard draft** on DRAFT: error tone, required reason, `branch.create` tenant-wide, not the head
  office. Copy: "The draft closes and can't be reopened. Its code <CODE> stays taken."
- **Refusals:** explain `lifecycle.head_office_branch_protected` and the 409.
- **DRAFT reason:** a DRAFT branch with a `status_reason` shows "Returned: <reason>".
- **Fake API:** return and discard routes with the platform's rules.

### 11 — branch address and edit

- **Address:** parsed and shown on tenant and platform branch detail, and entered on both create
  forms (Q9 keys).
- **Edit page** `admin/branches/[branchId]/edit`, gated on `branch.update` (+ `branch.view`) for a
  DRAFT or ACTIVE branch.
  - Fields: name, parent (or None, sent as `null`), IANA time zone, address. Only changed fields
    are sent.
  - On a draft it warns: "If you edit this draft, you won't be able to activate it yourself."
  - Code and type are fixed.
- **Refusals:** 409 (state), 422 (zone or cycle), 404 (parent).
- **Fake API:** PATCH. The address and `opened_on`/`closed_on` are stored and returned.

### 12 — approval remarks

- **Approve becomes a dialog with an optional "Remark" field** (at most 500 characters), on:
  - the user record
  - the user approval page
  - the institution record
- **Wire:** send `{reason}` only when non-blank. The fake routes accept it.

### 13 — institution return and pre-filled amend

- **Return for changes** on PENDING_APPROVAL (`tenant.reject`, required reason 3–500).
- **Detail fields:** parse `legal_name`, `registration_number`, `status_reason` and the DRAFT
  `admin`.
  - The Overview shows the legal name and registration number.
  - A DRAFT shows "Returned for changes. <reason>".
- **Amend wizard**
  - Pre-filled from the detail: legal name, registration number, administrator, and
    `send_application_invite`.
  - It sends absent for unchanged optional fields, and offers the optional business date.
  - "Enter them again" goes.
- **Fake API:** return, detail fields and PATCH keep/clear semantics.

### 14 — pending counts

- **Shell bells** read `GET /tenant/approvals/pending-count` and `GET /platform/approvals/pending-count`.
  - A key left out means the caller can't approve that kind.
  - The tenant bell keeps its provisioning read. As built it caps the user line with the queue's
    total instead of subtracting that read, which would remove a caller's own provisioning request
    twice (see the entry's plan, `2026-11-24-bg-adopt-14-pending-counts.md`, "As built").
- **Queue tabs** keep their list totals.
- **Fake API:** both routes, with the platform's exclusions.

### 15 — platform checker

- **Institution record, Users tab:** Approve as platform checker for pending members.
- **Institution record, Branches tab:** Submit (platform drafts), Activate and Return.
- **Checker window:** offered while the window is open, with the alert "Platform checking is open:
  <institution> has no active member besides its first administrator…" (the branch variant names the
  head office). A 409 `lifecycle.platform_checker_closed` hides the actions on reload and explains
  itself.
- **Create branch draft:** offered for ACTIVE and PROVISIONING institutions with `branch.create` +
  `branch.view` in the platform organisation. The membership warning and its 403 copy go.
- **Fake API:** platform membership activate, branch submit/activate/return, and the window rule.

### 16 — member reads by id

- **Membership:** the user record reads `membershipId` from the user read and `GET` its membership.
  The email search (`findUserMembership`) goes.
- **Branch assignments:** the tab pages `GET /tenant/branch-assignments?user_id=…` on the server
  (URL state, `TablePaginationBar`), sorted by `assigned_at`, with embedded branch names.
- **Retired notes:** the partial-scan notes, `SCAN_CEILING`, `PARTIAL_SCAN_NOTE`, the "(partial)"
  counts and `branchContextNote` (for tenant-wide holders).
- **AGENTS.md:** the fifth named exception shrinks to the Assign drawers' pickers.
- **Fake API:** `user_id` filters, embedded names, and the user summary's new fields.

### 17 — invitation status

- **Contract:** parse `invitation` on membership detail.
- **Onboarding card:** shows the invitation status, attempts, last update, and the explained failure
  code.
- **States:** "Provisioning identity" splits into Identity in progress and Identity failed.
- **Retry provisioning** (`user.approve` + `membership.view`; confirm dialog) is shown for a
  PENDING_APPROVAL member whose user is PROVISIONING_IDP and whose invitation is FAILED.
- **Resend invitation** (`user.invite` + `membership.view` + `user.view`; confirm dialog) is shown
  for an INVITED account with an ACTIVE membership.
  - `lifecycle.invitation_resend_too_soon`: "An invitation was sent moments ago. Try again in a few
    minutes."
  - `…_not_applicable` is named.
- **BG-25 copy:** the Invitation step says the email asks the person to verify their address and set
  a password, and the link lasts 72 hours.
- **Fake API:** `invitation`, retry, resend, 202 on a repeat approve.

### 18 — re-invite

- **Identity step:** lets a revoked member's email through with the alert "This re-invites <name>.
  Their revoked membership returns to awaiting approval with the access you choose next. They keep
  their member number and their existing account details, so the name and phone you enter here are
  ignored. Someone else must approve them."
- **Copy:** Revoke and Reject & revoke stop calling revocation permanent.
- **Fake API:** the reinvite path (same membership id, `created_by` the re-inviter,
  `membership.reinvite` audit on MEMBERSHIP).

### 19 — member number and membership edit

- **Membership card:** shows Member no., Invited by and First invited.
- **Edit membership dialog** (`membership.update` + `membership.view`; not for REVOKED or SYSTEM)
  - Fields: type (Staff, Admin, Auditor) and primary branch (active branches, or None).
  - Sends only changed fields.
  - Explains the 409: "Staff and Admin members need an active branch assignment first. Assign a
    branch, then change the type."
- **Fake API:** PATCH, `member_number` assigned at first activation.

### 20 — count columns

- **Roles:** Permissions and People columns.
- **Branches:** a People column.
- **Institutions:** Active branches and Active members columns.
- **Null counts:** `null` renders "—" with a tooltip saying the count needs a permission you don't
  hold.
- **Fake API:** the counts, with the platform's null rules.

### 21 — cross-institution users (Q5)

- **Navigation:** "Platform users" becomes **Users**.
- **Directory:** `GET /platform/users`, with the platform's filters (search, status, institution) and
  sort.
  - Columns: User, Email, Account, Institutions, Created.
- **Account record**
  - Phone and Last sign-in.
  - An Institutions table (at most 100) linking to each institution's member record.
  - Edit profile (display name, phone; the phone can't be cleared) with `user.update` + `user.view`.
- **Kept:** the overview's operator count stays on the platform organisation's members.
- **Fake API:** `GET /platform/users[/:id]` and `PATCH /platform/users/:id`.

### 22 — institution Settings tab

- **Tab:** an institution record Settings tab (`tenant_setting.manage_platform`) with Audit retention
  (2555–36500 days), Edit and Reset.
- **Fake API:** the platform settings routes.

### 23 — audit filters

- **New filters:** Outcome, Severity (minimum), Branch, Actor type and text search (`q`, 3–64
  characters, requires `occurred_from` within 31 days).
- **Wire:** move to the canonical field names.
- **Vocabulary**
  - Adds `user_account.*`, `membership.*` filed under Membership, `api.access_denied` (`API_ROUTE`),
    `audit.export`, `audit.retention_purge`, `role.archive`, and the new branch actions.
- **Table:** the column reads "Branch acted on".
- **User Audit tab:** offers "About this person" (`subject_user_id`) and "Performed by this person",
  with a note that older events may be missing from the first.
- **Fake API:** the filters, `subject_user_id`, `event_type = action`, the branch acted on.

### 24 — audit export

- **Export CSV:** a button gated on `audit.export` (+ `audit.view`), through a route handler that
  streams the platform's CSV with the token server-side.
- **Dialog:** uses the current filters; From and To are required, at most 31 days.
- **Refusals:** `audit.export_too_large` and 429 are named.
- **Fake API:** the export route.

### 25 — platform audit

- **Platform Audit page:** `/platform-admin/audit`, with a nav item.
- **Institution Audit tab:** `GET /platform/tenants/{id}/audit-events`.
- **Gating:** both on `audit.view` in the platform context.
- **Parsing:** platform list items use a schema that allows the nulled fields.
- **Lookups:** actor names resolve through the platform user directory (PR 21), branch names through
  the platform branch read.
- **Fake API:** the three platform audit routes.

### 26 — close-of-business readiness (Q6)

- **Readiness card:** on the Business date page, for `cob.start` holders while OPEN. Pass, Fail and
  Warn rows, each with severity and count.
- **Start close of business:** with a failing blocking check, the dialog names the checks and its
  confirm reads "Start anyway".
- **Overview:** Operational readiness uses the checks for `cob.start` holders.
- **Fake API:** the readiness route.

### 27 — header search

- **Search box:** in the tenant app bar (an icon opening a full-width field on narrow screens).
  Debounced through a route handler.
- **Results:** grouped People, Members, Branches and Roles, at most 10 each. A kind the caller can't
  view is absent.
- **Members:** a membership hit opens the user record through its membership's `user_id`.
- **Fake API:** `GET /tenant/search`.

## 9. Left to the builder

- **Exact component and file names** beyond those named above. Follow the existing module layout.
- **Wording.** Wording not quoted above follows the existing voice: sentence case, dd-MM-yyyy dates,
  no backend `detail`.
- **Tests:** which e2e specs gain cases, so long as every new action, dialog and refusal has a pinned
  test.
- **Splitting.** A PR may be split into two stack entries when its diff exceeds about 900 lines. The
  plan index records the split.
