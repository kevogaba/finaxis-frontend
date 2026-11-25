# bg-adopt 13 — Return an institution for changes and amend it pre-filled — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [index](./2026-11-24-bg-adopt-00-index.md) first:
> its Global Constraints apply here.

**Goal:** A platform checker can return a pending institution to draft with a reason, instead of
rejecting it (BG-01). The record shows the legal name, registration number and the return reason,
and the amend wizard opens pre-filled from the draft instead of asking again (BG-14).

**Architecture:**

- **Return action:** a new tenant lifecycle action through the kit `ReasonDialog`.
- **Detail contract:** gains the fields below.
- **Amend wizard:** `amend/page.tsx` passes the detail into `tenant-draft-wizard.tsx` as default
  values, and the action sends absent for unchanged optional fields.

**Spec:** [§8 entry 13](../specs/2026-11-24-backend-gap-adoption-design.md#13--institution-return-and-pre-filled-amend)
· designs `#d-inst-return` · register BG-01, BG-14.

## Wire facts (platform `6a8ea28`)

- **`POST /platform/tenants/{id}/return`**
  - Gate: `tenant.reject` (+ `tenant.view`).
  - Body: `{ reason }` (3–500 characters). PENDING_APPROVAL → DRAFT, `status_reason` set.
  - Its requester or submitter gets 403 `lifecycle.approver_is_tenant_maker`.
  - Wrong state is 409.
  - Answers the detail.
- **Tenant detail** (`GET /platform/tenants/{id}`, and `GET /tenant`) returns `legal_name`,
  `registration_number` and `status_reason`, each nullable and always present.
  - The platform detail also returns `admin`:
    `{ email, username, display_name, phone_e164 | null, send_application_invite }`. It is filled
    only for a holder of `tenant.update_draft` while the tenant is DRAFT; otherwise `null`.
  - The stored `business_date` is **not** returned.
- **`PATCH /platform/tenants/{id}`**
  - Required: `tenant_code`, `display_name`, `country_code`, `base_currency_code`, `timezone`.
  - `legal_name` / `registration_number`: absent keeps, `null` clears.
  - `admin`: absent keeps the draft. When sent it replaces it whole, and needs `phone_e164` and
    `send_application_invite`.
  - `business_date` (`dd-MM-yyyy`) is applied.
  - A non-empty `initial_settings` is 422.

**As built:** checked against the platform at `6a8ea28`; every fact above holds, with these
additions:

- **Return** (`PlatformTenantController.returnForChanges`,
  `OrganisationProvisioningService.returnForChanges`)
  - `ReturnTenantRequest`: `@NotBlank @Size(3, 500)` on the raw text, then `Reason.required`
    trims it; any other property is 400 `invalid_json`.
  - Order: the permission (403), the platform organisation (409
    `lifecycle.platform_organisation_protected`), the bootstrap record (404 for an unknown tenant),
    the maker (403 `lifecycle.approver_is_tenant_maker`), the system actor (422), then the state
    (409 `conflict`).
  - `lifecycle.approver_is_tenant_modifier` does **not** apply: the checker rule runs with
    `refuseAmender = false`, so an amender may return a request (it approves nothing).
  - The return resets the bootstrap record (`adminBootstrapStore.reject`, as a rejection does):
    `bootstrap_status` reads DRAFT and `submitted_by` reads `null` until the next submission.
- **`status_reason`** is overwritten by every organisation transition with its own reason, and
  `null` when it has none (`JooqFoundationLifecyclePersistence.saveOrganisation`): submitting a
  returned draft clears it, an approval stores its remark, and an amend (no transition) keeps it.
- **`GET /tenant`** does return `legal_name`, `registration_number` and `status_reason` (its `admin`
  and makers are always `null`), but the frontend doesn't parse it with the detail schema: it reads
  only `timezone`, through `tenantTimeZoneSchema` in `lib/api/lookups.ts`. Nothing changes there,
  and the fake's `GET /tenant` stays as it is.
- **PATCH order:** the bean violations (400), then the route's `@PreAuthorize` on
  `tenant.update_draft` (403), then the controller's bound on the `Optional` legal name (100) and
  registration number (50) as a 400 `validation_failed` with no violations, then the service's
  permission check with its view, 404, the state (409), `validateAmend`'s 422s (currency, zone, a non-empty
  `initial_settings`), and the code taken (409). `admin: null` keeps the draft's, as an absent
  `admin` does. A sent `admin` without `send_application_invite` is a 400 violation (`NotNull`).

## Tasks

### Task 1: Contract and Return

- **`tenant-contract.ts`:** the detail adds `legalName`, `registrationNumber`, `statusReason` and
  `admin`, all nullable.
- **`tenant-rules.ts`:** a `return` action on PENDING_APPROVAL, gated on `tenant.reject` +
  `tenant.view`. The caller equal to `requestedBy` or `submittedBy` gets it disabled, with the PR 08
  caption.
- **`tenant-actions.ts`:** `returnTenant` takes the required reason and explains
  `lifecycle.approver_is_tenant_maker` (`BY_CODE`) and 409.
- **`tenant-lifecycle-actions.tsx`:** "Return for changes", outlined.
  - Dialog title: "Return <name> for changes?"
  - Body: "It goes back to draft. The requester sees your reason and can amend and resubmit it."
  - Field: "What needs to change".
  - Order: Reject, Return for changes, Approve.

  **As built:** the hero reads Approve, Return for changes, Reject. Its first action is the
  contained primary (`ACTIONS_BY_STATUS`), so the plan's order would have made Reject the primary;
  this keeps Approve primary and puts the recoverable Return before the final Reject, as the branch
  record puts Return after Activate. Return is outlined and not error-toned, so its dialog is a
  plain `dialog`. The maker caption (`TENANT_MAKER_BLOCKED`) disables all three for the requester
  or submitter. `describeProblem` already names `lifecycle.approver_is_tenant_maker`, so
  `returnTenant` adds only the 409: "This request isn't waiting for approval any more: it was
  decided or returned elsewhere. Refresh to see where it stands." The toast reads "Returned for
  changes".

- **Overview** (`[tenantId]/(record)/page.tsx`)
  - Shows Legal name and Registration no. (or "—").
  - A DRAFT with a `statusReason` shows a warning Alert: "**Returned for changes.** <reason>".
  - Drop the "not returned" copy.

  **As built:** the label reads "Registration number", as the wizard's field and review do. The
  note is an MUI `Alert` with `role="note"` (static, so no live announcement) and
  `overflowWrap: 'anywhere'`, shown only for a DRAFT, since every transition overwrites the
  reason (a rejection's or a suspension's is no return).

- **Tests:** rules, action, RTL, and e2e: return a pending institution with a reason, then see the
  draft's alert.

### Task 2: Amend pre-filled

- **`amend/page.tsx`:** drop the "enter them again" description, and pass the detail's
  `legalName`, `registrationNumber` and `admin` to the wizard as defaults.
- **`tenant-draft-wizard.tsx`**
  - In amend mode, the defaults are pre-filled.
  - The administrator fields are pre-filled from `admin`, with `send_application_invite` from the
    draft.
  - An optional "Business date" field (`dd-MM-yyyy`) appears in amend mode. It isn't pre-filled: the
    platform doesn't return it.
- **The amend action**
  - Sends `legal_name`/`registration_number` only when changed. A field cleared by the user sends
    `null`.
  - Sends `admin` only when an administrator field changed, with the whole admin object.
  - Sends `business_date` when entered, and never `initial_settings`.

**As built:**

- `tenantAmendDefaults(detail)` builds the wizard's starting values; a `null` phone starts empty,
  so the required field then asks for it. Past the amend page's checks (`tenant.update_draft`, a
  draft), an absent administrator is a tenant without a bootstrap record, whose amend the platform
  applies to no row (`JooqInitialAdministratorBootstrapStore.amendDraft`), discarding a sent
  `admin`. The wizard (`withoutAdministrator`) then says so on the administrator step and its
  review card ("The platform keeps no draft administrator for this institution, so there's none
  to change here."), asks nothing, validates nothing there
  (`tenantDraftWithoutAdministratorSchema`) and sends no `admin`.
- `changedTenantFields(defaults, values)` (beside 11's `changedBranchFields`) chooses what the
  wizard sends: the five required fields always, the legal name and registration number when they
  differ from the draft's (trimmed), all five administrator fields when any differs, and the
  business date when entered. `tenantAmendSchema` makes those optional and refuses half an
  administrator ("Enter the first administrator in full."); `tenantAmendBody` sends a cleared
  field as `null` and an empty business date as nothing.
- The business date field keeps the create field's label, "First business date" (it is the same
  platform field: the date the tenant opens on), with the helper "Optional. Leave it empty to keep
  the draft's date, or today in the institution's timezone at approval if it has none." The
  review shows an empty one as "Unchanged", and its note reads "Saving keeps anything you didn't
  change." The amend page has no description now.
- **Tests:** wizard pre-fill and the changed-fields body; e2e: amend a returned draft (the fields
  are already filled) and resubmit.

### Task 3: Fake API

- **`routes/platform-tenants.mts`:** the `return` route; the detail fields (`legalName`,
  `registrationNumber`, `statusReason` and the admin draft in `FakeOrganisation`); PATCH keep/clear
  semantics for legal name, registration number and admin; `business_date` applied; non-empty
  `initial_settings` → 422.
- **Specs:** `e2e/fake-api-platform-tenants.spec.ts`.

**As built:**

- `FakeOrganisation` gains `legalName`, `registrationNumber`, `statusReason` and `admin`
  (`FakeTenantAdmin`), each optional (absent reads `null`), so other seeds stay valid. Create
  stores them as sent; the business date stays kept nowhere, since no fake read returns it.
- Every transition stores its trimmed reason, or `null`, as `status_reason`; bootstrap retry, no
  lifecycle transition, leaves it. This replaces 12's `ponytail:` note on approve.
- Reject now also clears `submitted_by`, as the platform's shared bootstrap reset does for both.
- The PATCH follows the platform's order (state before `validateAmend`), so an amend carrying
  settings is a 422 only on a draft; the existing fake specs now amend without settings.
- Seeds: Umoja is a returned draft (legal name, administrator, and a 500-character reason around an
  unbroken 70-character path, `LONG_RETURN_REASON`), Harambee holds a legal name, registration
  number and administrator, and Mwangaza an administrator. A new `platform-tenants-no-amend`
  scenario (the same without `tenant.update_draft`) pins that the detail withholds a draft's
  administrator from a caller who can't amend it, and `platform-tenants-no-administrator` (Umoja
  with no bootstrap record) that the PATCH validates, then discards, an `admin` for such a draft.

### Task 4: Gates, docs, commit

- [x] Run `pnpm check` and the full e2e suite: green.
- [x] Register:
  - BG-14 → **Closed** (frontend #120).
  - BG-01 → **Adopted** (frontend #120), with its declined items under "Still open".
  - Update the Summary.
- [x] Contract: the return row, the detail fields, the PATCH semantics.
- [x] Commit `feat(platform): return an institution for changes and amend it pre-filled`.

**As built:** the diff runs past spec §9's 900-line guide for splitting (most of it tests, the fake
API and the contract table's realignment), and stays one stack entry, since its three parts share
the detail contract. README's Platform Administration notes describe the return and the pre-filled
amend.
