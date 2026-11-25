# bg-adopt 15 — The platform checks a new institution's first members and branches — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** A new institution's first administrator can't approve their own invitations or branch
drafts. While the institution has no second active member or branch, a platform administrator can
act as checker from the institution record (BG-02). Branch drafts no longer need the platform
administrator to be a member of the institution (BG-18).

**Architecture:** Actions are added to the institution record's existing Users and Branches tabs
(`app/(authenticated)/platform-admin/tenants/[tenantId]/(record)/users` and `…/branches`).

- **Users tab:** Approve (`ReasonDialog`, optional remark, as in PR 12).
- **Branches tab:** Submit, Activate and Return.

Server Actions live in `modules/platform-administration/…` and call the platform-checker routes. An
"is the window open" rule derives from data the tabs already read.

**Spec:** [§8 entry 15](../specs/2026-11-24-backend-gap-adoption-design.md#15--platform-checker)
· designs `#d-checker` · register BG-02, BG-18.

## Wire facts (platform `6a8ea28`)

- **`POST /platform/tenants/{tenant_id}/memberships/{id}/activate`**
  - Gate: `user.approve` + `membership.view` in the platform organisation.
  - Body: optional `{ reason }`.
  - Allowed only while the tenant has no ACTIVE member beyond its bootstrap administrator.
    Otherwise 409 `lifecycle.platform_checker_closed`.
  - The checker is never the maker or the beneficiary.
  - Answers the membership detail, with `invitation`.
- **`POST /platform/tenants/{tenant_id}/branches/{id}/submit`** (`branch.create`), **`/activate`**
  (`branch.approve`) and **`/return`** (reason 3–500; `branch.create` for the creator or submitter
  withdrawing, otherwise `branch.approve`)
  - All need `branch.view`, all in the platform organisation.
  - Allowed only while the tenant has no ACTIVE branch beyond the head office. Otherwise 409
    `lifecycle.platform_checker_closed`.
  - Platform activate refuses the creator and the submitter.
- **`POST /platform/tenants/{id}/branches`** (create draft) needs only `branch.create` +
  `branch.view` in the platform organisation, for an ACTIVE or PROVISIONING tenant. No tenant
  membership is needed.
- **No platform membership list exists.** The Users tab reads `/platform/tenants/{id}/users`, whose
  items carry `membership_id`, `membership_status`, `created_by` and `user_status`.

**As built:** checked against the platform at `6a8ea28` (`PlatformTenantMembershipController`,
`PlatformTenantBranchController`, `UserProvisioningService`, `MembershipCheckerRule`,
`BranchProvisioningService`, `JooqUserProvisioningStore`, `JooqOrganisationBranchProvisioningStore`,
`ActorRefLookup`, `docs/api/foundation-api.md`). The facts above hold, with these details:

- **The window, exactly.** "Beyond its bootstrap" is an ACTIVE row whose `created_by` is not the
  system actor (`hasActiveMembershipBeyondBootstrap`, `hasActiveBranchBeyondBootstrap`): the first
  administrator is invited by `inviteAsSystem`, and the head office is made by the system. A
  platform caller reads a system maker as `created_by: null` (`ActorRefLookup` resolves only real
  accounts; `shownTo` shows every other maker to a platform caller), and the system makes at most
  one of each. So the window is not "1 or fewer" but: no ACTIVE row, or exactly one whose
  `created_by` is null. The Users and Branches tabs' own reads are filtered and paged by the URL, so
  each tab makes one bounded read (`membership_status=ACTIVE&size=1`, `status=ACTIVE&size=1`) and
  decides from its total and its one row. A row stored with a null `created_by` by SQL counts as
  beyond the bootstrap on the platform and reads as the system here; the named 409 explains it.
- **Order.** Membership activate: the permission, the platform organisation (404), the membership
  in the path tenant (404), the inviter and then the member (403, never relaxed by a switch, each
  audited `DENIED`), then the window: a tenant that isn't ACTIVE is a plain 409, then 409
  `lifecycle.platform_checker_closed`, then the tenant route's state and prerequisite 409s.
  Submit: the permission and 404s, an ACTIVE or PROVISIONING tenant (409), the window, then the
  draft's own checks. Activate: the permission and 404s, the window, the creator or latest submitter
  (403 `lifecycle.approver_is_branch_maker`) and an editor (`…_branch_modifier`), never relaxed,
  then an ACTIVE tenant and the state (409). Return: classified first (its creator or latest
  submitter withdraws with `branch.create`, anyone else returns with `branch.approve`), then a
  checker's window only (**a withdrawal isn't bounded**), an ACTIVE or PROVISIONING tenant, the
  state.
- **Bodies.** Submit and activate take an optional `{reason}` (at most 500, trimmed, a blank one
  dropped); return a required reason of 3–500. Each branch route answers the branch detail, and the
  membership route the membership detail (200, or 202 while the identity is provisioned).
- **Audit.** The membership's `user.approve` row carries `checkerScope = PLATFORM`; beside each
  branch FSM row the platform writes `branch.submit_as_platform_checker`,
  `branch.activate_as_platform_checker` or `branch.return_for_changes_as_platform_checker` (with the
  reason), and a platform withdrawal `branch.withdraw` with no marker. All in the tenant's log.
- **Makers on the lists.** `/platform/tenants/{id}/branches` items carry `created_by` and
  `submitted_by`, so Activate is disabled for the caller's own branch from the list alone.
- **The platform organisation** as `tenant_id` is a 404 on every one of these routes, create
  included.

## Tasks

### Task 1: Window rules and actions

- **Window rules** in `modules/platform-administration/…/checker-rules.ts`:
  - `memberCheckerOpen(users)`: no ACTIVE membership other than the bootstrap administrator. That
    administrator is the institution's earliest ACTIVE member; or use the tenant detail's bootstrap
    or admin email if available.
  - `branchCheckerOpen(branches)`: no ACTIVE branch other than the head office.
  - Read the page's existing reads. If a full answer needs a total, use `status=ACTIVE&size=1`
    totals: members 1 or fewer, and branches 1 or fewer.
- **Server Actions:** `approveAsPlatformChecker`, `submitInstitutionBranch`,
  `activateInstitutionBranch` and `returnInstitutionBranch`, with minted keys.
  - They explain `lifecycle.platform_checker_closed` with PR 03's `BY_CODE` copy, plus the maker
    codes.
- **Tests:** unit tests for each.

**As built:** `modules/platform-administration/checker/`: `checker-rules.ts` (`checkerWindow` from
the bounded read, `memberApproval`, `checkerBranchActions`, `activateBlocked`, the notes and copy;
`unknown` when the window's read fails, which offers the actions and leaves a closed window to the
named 409), `checker-service.ts` (`readActiveMembers`, `readActiveBranches`) and
`checker-actions.ts`. Approve has no pre-read: the platform holds every rule, and its plain 409s are
explained with hedged copy (decided, no role or branch yet, a suspended or deactivated account, or
an institution that isn't active);
the named codes are `describeProblem`'s. The window is read only for a holder who could act (Approve:
`user.approve` with `membership.view`, an ACTIVE institution; branches: `branch.view` with
`branch.create` or `branch.approve`, an ACTIVE or PROVISIONING institution), once the institution
and the caller are read, beside the tab's list read. The 200/202 outcome is
read from the echo, as the institution's own approval does. Approve's remark is bounded as PR 12's
(`APPROVAL_REMARK_TOO_LONG` over 500, before any call).

### Task 2: UI

- **Users tab:** an info Alert while the member window is open: "Platform checking is open: <name>
  has no active member besides its first administrator, so a platform administrator can approve
  its first members." Each pending row gets an Approve action, disabled with the PR 08 caption for
  the row's `created_by` or the member themself.
- **Branches tab:** the branch variant of the Alert ("…no active branch besides its head
  office…"). DRAFT rows get Submit; PENDING_APPROVAL rows get Return and Activate (Activate is
  disabled for the creator or submitter).
- **When the window is closed:** no actions, and the note "<name> now approves its own members and
  branches."
- **Create branch draft:** offered for ACTIVE and PROVISIONING institutions with `branch.create` +
  `branch.view`.
  - Delete `branchCreateWarning`, `BRANCH_CREATE_REFUSED` and the warning Alert in
    `institution-branch-rules.ts` / `branches/new/page.tsx`.
- **Tests:** RTL and e2e (approve a first member; activate a first branch; the closed window hides
  the actions; create a draft without membership).

**As built:**

- **Rows.** `UserDirectoryTable` and `BranchDirectoryTable` take an optional `rowActions` render
  prop (Server Components only), shown as an "Actions" column only when some row has an action.
  The buttons are short ("Approve", "Submit", "Return", "Activate", "Withdraw") and named for their
  row ("Approve Otieno Ouma", "Return Nakuru Branch for changes"); a disabled one is tied to its
  caption. Each dialog is a `ReasonDialog` that says "The institution's audit log records you as the
  platform checker." Approve takes the optional remark (PR 12), Submit and Activate an optional
  reason, Return a required "What needs to change". After a success the row's next action takes
  focus, else the record title.
- **Withdraw.** A pending branch's creator or latest submitter is offered Withdraw (the platform's
  rule, PR 10's copy) in place of Return, also once the window has closed, since the platform
  doesn't bound it; Activate is disabled for them ("You created or submitted this branch, so another
  administrator must activate it."). Approve is disabled for the member's inviter (PR 08's caption),
  the member themself ("You can't approve your own membership.") and a blocked account.
- **Notes.** The windows are independent, so the closed note is per tab: "<name> now approves its
  own members." on Users and "… its own branches." on Branches, not one note for both. Activate is
  offered for an ACTIVE institution only; Submit and Return for a PROVISIONING one too, whose open
  branch note offers only those and says activation waits until the institution is active. A
  branch record (where a create lands) says a platform administrator submits and activates the
  institution's branches from its Branches tab while platform checking is open.
- **Create branch draft** is offered for ACTIVE and PROVISIONING institutions; the inactive state
  reads "This institution can't take new branches", and the create description says the draft is
  then submitted and activated from its Branches tab, by a platform administrator until the
  institution has an active branch besides its head office.
- **e2e:** `e2e/platform-checker.spec.ts` (scenario `platform-checker`): approve a first member,
  after which no row offers Approve; activate a first branch, after which only the submitter's
  Withdraw stays; submit a draft and return a pending branch; the closed window (Tumaini) offers
  nothing; a read-only role sees neither note nor actions; a draft where the operator is no member;
  and an axe matrix over both open tabs, the closed Users tab (Tumaini) and the Approve dialog. `platform-records.spec.ts`'s refusal
  tests (BG-18) became a draft with no warning and a focus test on a code the platform refuses as
  taken.

### Task 3: Fake API

- **`routes/platform-records.mts`:**
  - drop the `canCreateIn` membership check;
  - add PROVISIONING to the creatable states;
  - add the platform membership activate route and the branch submit/activate/return routes, with
    the window rule and the checker refusals;
  - write the audit rows `branch.submit_as_platform_checker` and
    `branch.activate_as_platform_checker` (as the platform does; see `foundation-api.md:2748`).
- **Specs:** `e2e/fake-api-platform-records.spec.ts`.

**As built:** the membership approval's body (`approveMembership`, `activationRemark` in
`routes/memberships.mts`) and the branch transition's (`moveBranch`, `hasAmended` in
`routes/branches.mts`) are shared by the tenant routes and the platform checker's, so the two can't
drift. The platform organisation as `tenant_id` is a 404 on create and on the four new routes. The
fake keeps "an absent maker is the system", so the windows count ACTIVE rows with a maker. A new
scenario, `platform-checker` (and `-read-only`), rather than more seed in `platform-records`, so
no existing count moves: Bidii (both windows open), Tumaini (both closed) and Imara, where Jane is
the system-made first administrator with `audit.view`, so the spec reads the checker's rows in
Imara's own log. Submit re-checks the draft's code (a plain 409, after the window), against a
duplicate seeded only for it (`uq_branch_organisation_code` keeps a real tenant from one). The
checker's rows and the platform routes' FSM rows name the target branch, as the platform's do. The
checker's codes are granted to the platform role only. ponytail: the maker refusals' `DENIED` rows
aren't mirrored, as on the tenant routes, and the tenant routes' FSM rows keep the selected branch.

### Task 4: Gates, docs, commit

- [x] Run `pnpm check` and the full e2e suite: green.
- [x] Register:
  - BG-02 → **Adopted** (frontend #122), keeping its Still open.
  - BG-18 → **Closed** (frontend #122).
  - Revisit the overview's People readiness rule ("two active members is no longer the only way
    through"): mention the platform checker in its copy.
- [x] Contract: the platform-checker rows.
- [x] Commit `feat(platform): check a new institution's first members and branches`.

**As built:** the register records the 2026-11-25 verification, and the summary line reads 7 backend
fixed · 6 partly fixed · 0 open · 4 adopted · 18 closed. The People readiness item reads "Only 1
member is active. Someone other than the requester must decide each approval (maker-checker): until
a second member is active, a platform administrator can approve the first members." The contract's
E.2 gains the four routes and the create row's new gate, §G the checker's audit rows. `README.md`
describes the checker; `AGENTS.md` needs no change.
