# PR 08: Branches — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [plan index](./2026-09-25-admin-parity-00-index.md)
> and the [parallel lane rules](./2026-09-27-admin-parity-parallel-lanes.md) first.

**Goal:** Ship `/admin/branches`: a searchable, filterable, sortable directory; the create-draft
form; the branch record (hero lifecycle actions and Overview / Users / Audit tabs); branch user
assignments; and the guided "switch to All branches" state. With it come the shared pieces later
layers reuse:

- the user search (`UserPicker`);
- `AssignmentDrawer`;
- the React Hook Form `applyFieldErrors` helper;
- the branch contract.

It is the first consumer of the 07b record kit.

**Architecture:**

- Server Components read through `modules/administration/branches/branch-service.ts`, which uses
  zod snake_case schemas in `branch-contract.ts`.
- The record is a nested-route layout. The layout reads the branch once (a `cache()`d `getBranch`)
  and renders `RecordHero` plus `RecordTabs`. Each tab (`page.tsx`, `users/`, `audit/`) fetches its
  own data.
- Mutations are Server Actions built on 07's `runServerAction`. Known 409/403 guards get
  guard-specific messages from a local `explain()`.
- The one multi-field form (create draft) uses React Hook Form with the zod resolver.
- Dialogs keep `useActionState` (07's rule for forms with one or two fields).
- The user search is a same-origin route handler (`/api/tenant/users`), so the client
  `UserPicker` never holds a token.

**Tech Stack:** Next.js 16 (nested layouts, Server Actions, `redirect`, a route handler),
React 19 `useActionState`/`cache`, React Hook Form 7.88 with `@hookform/resolvers` 5 (zod 4),
MUI 9.4 (`Autocomplete`, `TableSortLabel`, `Drawer`, `Tabs`), Vitest and RTL, Playwright and axe.

**Spec:** [`…-design.md`](../specs/2026-09-25-admin-prototype-parity-design.md):

- §6.4 (mutations, RHF), §6.5 (All branches, guided state), §6.6 (permissions, BG-31),
  §6.7 (errors);
- §9 (list and record patterns, assignment `Drawer`);
- §10.3 (branches).

Contract: §C (`BranchSummary`, `BranchDetail`, `BranchDraftResult`, `BranchAssignmentSummary`,
`UserInTenantSummary`), §D (`CreateBranch`, the branch transitions, `AssignBranch`), §E.3 (branches,
branch assignments, tenant users), §E.4 (context), §F (branch state machine), §I.
Gaps: BG-03, BG-07, BG-08, BG-09, BG-13, BG-15, BG-31.

**Base:** 08 is built on `G'_07`, 07's gated head rebased onto `ap-integration`. `G'_07` contains
07b. 15 arrives when 07's slot, inside this build, rebases it onto `F_07` (lane rules §8); 13
starts from `F_07`, so it arrives at a later rebase (B2's step 7 or slot(08)).
`refs/lane-base/08-branches` records the fork.
**Branch:** `lane/08-branches` in lane X. The controller registers it as
`admin-parity/08-branches` and commits this plan at the boundary. **No task in this plan commits
the plan.**

## Global Constraints

See the index and the lane rules. Additionally:

**Command forms (lane X).** Every command below shows only the command part. Run it in the lane
rules' §2 form (the runbook's §0 wins if it changed since):

```
# T: focused unit tests (foreground)
flock -E 75 -w 240 /tmp/finaxis-e2e.lock env VITEST_MAX_WORKERS=3 pnpm test:run <paths>

# E: scoped E2E (run_in_background + log + Monitor). First, `ss -ltn '( sport = :3100 or sport = :3199 )'`
#    must show no listener you didn't start. Never kill a 3100 listener.
flock -E 75 -w 1800 /tmp/finaxis-e2e.lock env VITEST_MAX_WORKERS=3 PORT=3100 FAKE_API_PORT=3199 pnpm test:e2e <specs>

# C: commit (run_in_background + Monitor). Write the message to <your scratchpad>/commit-msg.txt with
#    the Write tool first. Stage whole files only. The husky wrapper locks the hook, so git never
#    goes inside flock.
git add <whole files>
VITEST_MAX_WORKERS=3 git commit -F <your scratchpad>/commit-msg.txt

# G: gates, pnpm check / pnpm build / pnpm test:e2e (each run_in_background + Monitor)
flock -E 75 -w 1800 /tmp/finaxis-e2e.lock env VITEST_MAX_WORKERS=3 PORT=3100 FAKE_API_PORT=3199 <gate command>
```

Exit 75 means the lock wait timed out: retry, don't skip.

**Fake seed rule (blocking).** The fake `default` scenario stays read-only for branches. 08's
mutation codes live only in its own `branches` builder:

- `branch.create`, `branch.activate`, `branch.suspend`, `branch.reactivate`, `branch.close`;
- `user.assign_branch`, `user.revoke_branch`.

07b's `e2e/fake-api-access.spec.ts` uses `branch.suspend` as a branch-only code against
`seedScenario('default')`, and Jane's TENANT grant would turn it red. So **never add them to
`TENANT_ADMIN_PERMISSIONS`**. Every create, lifecycle and assignment E2E uses `branches`, and the
read-only gating test uses `default`.

**Seed IDs** use `08000000-0000-4000-8000-00000000000n` (lane rules §5). The `branches` builder
copies `greenfieldTenant()` and appends to its own copy. `greenfieldTenant()` itself is never
edited.

**Consumed signatures (pinned).** The code below is written against these. The pre-flight diffs them
against the real files at the base. On a mismatch, adapt **08's call sites only**, never the
producing layer's file, and record a `Ruling:`.

| From | Item                                                                                                                                                                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 07   | `runServerAction(schema, formData, run)`, `type ActionResult`, `type FormAction` (`lib/api/action-result.ts`)                                                                                                                                             |
| 07   | `apiPost(path, body, idempotencyKey): Promise<unknown>`; **A1** `apiDelete(path: string, idempotencyKey: string): Promise<unknown>` (`lib/api/tenant-api.ts`)                                                                                             |
| 07   | `ReasonDialog({ open, title, description, confirmLabel, reason, action, onClose, onSuccess, fields? })`, `SectionCard({ title, description?, actions?, headingLevel?, children })`                                                                        |
| 07   | `businessDateSchema` (`lib/api/wire.ts`), `formatBusinessDate(value, 'short' \| 'long')` (`lib/format.ts`)                                                                                                                                                |
| 07   | fake **A2** `sendIdempotent(context, body, produce, status = 200)` (`e2e/fake-api/idempotency.mts`); **R** `recordAuditEvent(state, access, { entityType, entityId, action, reason })` (`e2e/fake-api/audit-log.mts`), which sets the actor from `access` |
| 07b  | `RecordHero({ back?, avatar, eyebrow, title, subtitle?, status?, actions? })`, `RecordTabs({ label, tabs })`, `CopyIdButton({ value, label? })`                                                                                                           |
| 07b  | `ForbiddenState({ title?, description?, action? })`, `BranchContextState()`, `ConfirmDialog({ open, title, description, confirmLabel, tone?, action, onClose, onSuccess, children? })`                                                                    |
| 07b  | `parseListSort(params, allowed, fallback)`, `sortQuery(sort)`, `type ListSort`, `type SortDir` (`lib/api/list-sort.ts`)                                                                                                                                   |
| 07b  | `RecordAuditTab({ views, params, path, title?, description? })`, `type RecordAuditView`                                                                                                                                                                   |
| 07b  | fake `requirePermission(access, code, scope = 'tenant')`; `enterAdmin(page, pathname, { heading, organisation?, branch? })`, `expectNoSeriousOrCriticalViolations`, `A11Y_CASES`, `applyA11yCase`, `expectA11yCaseApplied`                                |

**Concurrent lane Y.** While 08 builds, Y builds 15 then 13 (settings); 16 (platform tenants)
starts near 08's slot (runbook §13). Files both lanes may touch are resolved by R3 or R4 at
integration:

- `scenarios.mts`, `state.mts`, `server.mts`, `routes/tenant-reads.mts`;
- `administration-navigation.ts`;
- `components/data-display/list-toolbar.tsx` and its test;
- `README.md`, `AGENTS.md`, `docs/backend-gaps.md`.

The toolbar `search` kind is a new shared item, flagged to the controller (see Rulings).

**Live checks:** reads first, then only mutations the user approves one by one, on a throwaway
branch (Task 9).

**Rulings to record in the ledger** (`Ruling:` lines):

1. **Default stays read-only.** Branch mutation codes are granted only in the `branches`
   builder (see the fake seed rule above).
2. **The toolbar search commits on Enter and on blur**, through `useListNavigation`'s `push` like
   every other filter. It is not debounced as you type, and it doesn't use `router.replace`.
   - Spec §9 says debounced with `router.replace`.
   - Why: a debounced commit races the draft text the user is still typing.
   - Ceiling: characters typed while a commit is in flight are replaced by the committed value.
   - Upgrade path: debounce, with a pending-commit guard.
   - The `search` field kind is new and shared. The controller decides whether 16 consumes it
     after F_08.
3. **Code gets its own sortable column**, as in the prototype, so every §10.3 sort field
   (name, code, type, status, created) has a header. Spec §10.3 lists the column as "branch
   (name + code)".
4. **Sort headers are server-built links.** They don't flip the list's shared pending bar (06's
   `useListNavigation` ceiling). Each header shows its own `LinkPendingIndicator`.
5. **The maker lookup** reads the audit event `branch.create_draft`, and only when Activate is
   on offer and the user holds `audit.view`.
   - An unknown maker never disables Activate.
   - A 403 on activate is explained as "permission or maker-checker" (BG-08).
6. **Submit and Activate have no context rule.** A branch-selected context can't read a DRAFT or
   PENDING branch at all (404, then the guided state), so the hero never offers them there. When
   the branch is the user's working branch, Suspend and Close warn that the working context ends.
7. **All five lifecycle actions use `ReasonDialog`.**
   - Submit, Activate and Reactivate take an optional reason.
   - Suspend and Close require a reason of 3–500 characters.
   - Revoke uses `ConfirmDialog`, because `DELETE` has no body.
   - The Close trigger is error-coloured. Its confirm button isn't, because `ReasonDialog` has no
     `tone`. Add one only as an optional `refactor(kit):` prop, and only if the visual pass asks
     for it.
8. **Backend `validation_failed` violations are not mapped to fields.**
   - The forms apply the same rules client-side (RHF) and server-side (zod), and 07's
     `runServerAction` is frozen.
   - Known guard codes get guard-specific messages instead: create 409, activate 403, close 409,
     assign 409, revoke 409.
   - No 409 message states its cause as fact. `conflict` also covers an invalid transition, a
     race and a duplicate (contract §I), so each names its likely guard and hedges. The create 409
     never states the code is a duplicate: the same 409 also means the organisation isn't ACTIVE.
9. **The user search slice** (`modules/administration/users/user-option.ts` and
   `user-search-service.ts`) is search-only. 10 owns the full users contract and may re-point the
   service to it.
10. **The Overview's active-assignment count** is one `size=1` read (BG-15). The Users tab
    resolves each visible user with one read. Ceiling: page size plus 3 reads.
11. **The timezone list** is `Intl.supportedValuesOf('timeZone')`, plus the organisation's zone
    when it's missing (V8 omits `UTC`). Branch type is free text with the suggestions
    `HEAD_OFFICE` and `OPERATIONS`, capped at 50 characters by the frontend.
12. **`hrefWith(pathname, params, changes)`** is added to `lib/api/query-string.ts`. The audit
    page keeps its local copy; it isn't migrated mid-stack.
13. **Create redirects to the new record** (spec §6.4, step 5), with no toast across the redirect.
    The record's Draft status and its Submit action are the confirmation.
14. **The fake revoke returns summary fields only.** The real API returns the full detail, and the
    UI ignores the body.
15. **The directory's Type filter offers only the platform's two types** (`HEAD_OFFICE`,
    `OPERATIONS`), plus a type already in the URL so it stays selected.
    - `branch_type` is free text (contract §F), so a tenant-defined type (e.g. `Service centre`)
      can't be picked from the UI. It filters only through `?type=` in the URL; the search covers
      code and name only (contract §E.3).
    - Why: the list is server-paginated, and no endpoint lists the types in use.
    - Upgrade path: a free-text or `freeSolo` type filter that commits like the `search` kind.

## Review Focus

Pins these index items:

- **Item 1:** a context that goes stale mid-session lands on `/select-context`, never an error
  page. Task 8 "suspending the working branch sends the user back to context selection".
- **Item 2:** double submit and retry. Task 4 drawer, Task 5 form.
- **Item 4:** long names at 375 px. Task 8 a11y matrix.

It adds:

1. **A branch the current branch context can't reach renders the guided "Switch to All
   branches" state, never a raw 404.** Switching then shows the record.
   - Task 6 layout.
   - Task 7 `fake-api-branches.spec.ts` ("hides every other branch").
   - Task 8 `branches.spec.ts` ("guides a branch context").
2. **Maker-checker.**
   - The drafter sees Activate disabled, with a visible explanation tied to the button.
   - Without `audit.view` it stays enabled, and a 403 explains "permission or maker-checker".
   - Tests: Task 2 `branch-rules.test.ts` (`activateBlocked`), Task 3 `branch-actions.test.ts`
     (403 mapping), Task 6 `branch-lifecycle-actions.test.tsx`, Task 8 ("creates a draft … blocks
     the drafter").
3. **An unknown `sortBy`, `status` or page size in the URL never reaches the backend**, because
   an unknown `sort_by` is a 500. Task 2 `branch-query.test.ts`.
4. **Guard failures read as their guard, not as "record changed".** Close with active
   assignments, and revoking a STAFF member's last assignment. The message names the guard
   first; the "may have changed" hedge comes second (Ruling 8). Task 3 `branch-actions.test.ts`,
   Task 8 ("explains a blocked close", "assigns and revokes").
5. **The create form retries with the same idempotency key after a server failure**, and shows
   server field errors on their fields. Task 5 `branch-draft-form.test.tsx`.
6. **Schema drift:** an unknown branch status or an ISO `closed_on` gives the safe error state.
   Task 2 `branch-contract.test.ts`.
7. **Suspend and Close refuse a reason under 3 characters** before calling the backend. Task 3.

---

### Pre-flight (build workflow phase; not a taskList entry)

**Files:** none, and no commit. The build workflow runs this as its pre-flight phase. The results
go into the ledger. Task 9 is controller-only, at L2.

**Launch arg:** the tasks are numbered 2–8 and there is no Task 1, so launch build(08) with
`"taskList": [2, 3, 4, 5, 6, 7, 8]`, **never** `tasks`. v3 expands a count to 1..N, so the runbook
§4 build(08) template's `"tasks": 6` would ask for a missing Task 1 brief and drop Tasks 7–8. The
controller records in RUN-STATE that the §4 template's `tasks: 6` does not apply to 08.

- [ ] **Step 1: Confirm the base**

- `git log --oneline -1` shows the `docs(plans): add plan 08` commit (runbook §5 step 10 commits
  it on top of the fork).
- `git rev-parse refs/lane-base/08-branches HEAD~1` prints the same SHA twice, or
  `git merge-base --is-ancestor <lane-base SHA> HEAD` exits 0.
- `git status --short` is empty.

- [ ] **Step 2: Diff the pinned signatures**

For each row of "Consumed signatures", read the real export at HEAD. Use `git show HEAD:<path>`,
never a moving tree:

- `lib/api/tenant-api.ts` (`apiDelete`);
- `lib/api/action-result.ts`;
- `lib/api/wire.ts` (`businessDateSchema`) and `lib/format.ts` (`formatBusinessDate`);
- `components/data-display/{reason-dialog,section-card,record-hero,record-tabs,copy-id-button,forbidden-state,confirm-dialog}.tsx`;
- `lib/api/list-sort.ts`;
- `modules/administration/audit/components/record-audit-tab.tsx`;
- `e2e/fake-api/{idempotency,audit-log,access}.mts`;
- `e2e/support/admin.ts`.

On any difference, note the adaptation this plan's code needs (call sites only).

- [ ] **Step 3: Confirm the seed constraints**

- `grep -n "branch.suspend" e2e/fake-api-access.spec.ts` must show 07b's branch-only use. That
  confirms the fake seed rule.
- `grep -n "branch\.\|user\.assign_branch\|user\.revoke_branch" e2e/fake-api/scenarios.mts`:
  `TENANT_ADMIN_PERMISSIONS` must hold none of the codes 08 grants.

- [ ] **Step 4: Check the shared files**

- Look for navigation entries added since this plan was written, such as Settings from 13.
  Branches still goes directly after Overview (spec §8 order).
- Check whether `components/data-display/list-toolbar.tsx` already has a `search` kind (from 13
  or 16). If it does, consume it instead of Task 5's.
- `ls e2e/fake-api/routes/`: confirm no `branches.mts` exists yet.

- [ ] **Step 5: Read the Next.js guides**

`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/{layout,route,dynamic-routes}.md`
and `01-app/02-guides/server-actions.md`, which covers `redirect` inside an action.

---

### Task 2: Branch contract, query, rules, and service

**Files (under `modules/administration/branches/`):**

- Create: `branch-contract.ts`, `branch-contract.test.ts`
- Create: `branch-query.ts`, `branch-query.test.ts`
- Create: `branch-rules.ts`, `branch-rules.test.ts`
- Create: `branch-service.ts`, `branch-service.test.ts`

**Interfaces:**

- Consumes:
  - `pageSchema`, `instantSchema`, `uuidSchema`, `businessDateSchema` (06, 07);
  - `parseListSort`, `sortQuery`, `ListSort` (07b);
  - `parsePaging`, `toQueryString`, `apiGet` (06), `can`, `PermissionHolder` (04);
  - `humanizeEnum`, and `listAuditEvents` (06).
- Produces (consumed by 10, 12, 14, 17):
  - `branch-contract.ts`:
    - `BRANCH_STATUSES` and `type BranchStatus`;
    - `BRANCH_TYPE_SUGGESTIONS`;
    - `BRANCH_ASSIGNMENT_TYPES` and `type BranchAssignmentType`;
    - `BRANCH_SORT_FIELDS` and `type BranchSortField`;
    - `branchPageSchema` and `type BranchSummary`
      (`{ id, branchCode, branchName, branchType, status, createdAt }`);
    - `branchDetailSchema` and `type BranchDetail` (the summary plus `parentBranchId`,
      `timezone`, `openedOn`, `closedOn`, `statusReason`, `updatedAt`);
    - `branchDraftResultSchema` (to `{ branchId }`);
    - `branchAssignmentPageSchema` and `type BranchAssignment`
      (`{ id, userId, branchId, assignmentType, status }`).
  - `branch-query.ts`:
    - `DEFAULT_BRANCH_PAGE_SIZE = 10`, `DEFAULT_BRANCH_SORT`;
    - `interface BranchListQuery { q?; status?; type?; sort; page; size }`;
    - `parseBranchListQuery(params)`, `branchListApiPath(query)`.
  - `branch-rules.ts`:
    - `type BranchLifecycleAction = 'submit' | 'activate' | 'suspend' | 'reactivate' | 'close'`;
    - `availableBranchActions(status, holder)`;
    - `MAKER_CHECKER_BLOCKED`, `activateBlocked(makerId, userId)`;
    - `canAssignUsers(status, holder)`, `canRevokeAssignments(holder)`;
    - `branchTypeLabel(type)`;
    - `isTimeZone(value)`, `branchDraftSchema` and `type BranchDraftValues`.
  - `branch-service.ts` (server-only):
    - `listBranches(query)`;
    - `getBranch(branchId)` (`cache`d, so the layout and its tabs share one read);
    - `listBranchAssignments(branchId, paging)`, the ACTIVE rows only;
    - `countActiveAssignments(branchId): Promise<number | null>`;
    - `getBranchMaker(branchId): Promise<string | null>`.

- [ ] **Step 1: Write the failing tests**

`branch-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  branchAssignmentPageSchema,
  branchDetailSchema,
  branchDraftResultSchema,
  branchPageSchema,
} from './branch-contract';

const WESTLANDS = '44444444-4444-4444-8444-444444444444';
const HEAD_OFFICE = '22222222-2222-4222-8222-222222222222';
const PAGE = {
  number: 0,
  size: 10,
  total_items: 1,
  total_pages: 1,
  has_next: false,
  has_previous: false,
};
const DETAIL = {
  id: WESTLANDS,
  organisation_id: '11111111-1111-4111-8111-111111111111',
  branch_code: 'WESTLANDS',
  branch_name: 'Westlands Branch',
  branch_type: 'OPERATIONS',
  parent_branch_id: HEAD_OFFICE,
  status: 'SUSPENDED',
  timezone: 'Africa/Nairobi',
  address: {},
  opened_on: null,
  closed_on: '30-09-2026',
  status_reason: 'Cash audit',
  created_at: '2026-07-01T08:00:00Z',
  updated_at: '2026-07-24T08:00:00Z',
};

describe('branch contract', () => {
  it('maps a branch detail, ignoring the always-empty address (BG-13)', () => {
    expect(branchDetailSchema.parse(DETAIL)).toEqual({
      id: WESTLANDS,
      branchCode: 'WESTLANDS',
      branchName: 'Westlands Branch',
      branchType: 'OPERATIONS',
      parentBranchId: HEAD_OFFICE,
      status: 'SUSPENDED',
      timezone: 'Africa/Nairobi',
      openedOn: null,
      closedOn: '30-09-2026',
      statusReason: 'Cash audit',
      createdAt: '2026-07-01T08:00:00Z',
      updatedAt: '2026-07-24T08:00:00Z',
    });
  });

  it('rejects an unknown status or an ISO date (schema drift → error state)', () => {
    expect(branchDetailSchema.safeParse({ ...DETAIL, status: 'PAUSED' }).success).toBe(false);
    expect(branchDetailSchema.safeParse({ ...DETAIL, closed_on: '2026-09-30' }).success).toBe(
      false,
    );
  });

  it('maps directory and assignment pages, which carry nothing else (D8)', () => {
    const branches = branchPageSchema.parse({
      items: [
        {
          id: WESTLANDS,
          organisation_id: 'o1',
          branch_code: 'WESTLANDS',
          branch_name: 'Westlands Branch',
          branch_type: 'OPERATIONS',
          status: 'ACTIVE',
          created_at: '2026-07-01T08:00:00Z',
        },
      ],
      page: PAGE,
    });
    expect(branches.items[0]).toEqual({
      id: WESTLANDS,
      branchCode: 'WESTLANDS',
      branchName: 'Westlands Branch',
      branchType: 'OPERATIONS',
      status: 'ACTIVE',
      createdAt: '2026-07-01T08:00:00Z',
    });

    const assignments = branchAssignmentPageSchema.parse({
      items: [
        {
          id: '08000000-0000-4000-8000-000000000009',
          user_id: '08000000-0000-4000-8000-000000000001',
          branch_id: WESTLANDS,
          assignment_type: 'HOME',
          status: 'ACTIVE',
        },
      ],
      page: PAGE,
    });
    expect(assignments.items[0]).toEqual({
      id: '08000000-0000-4000-8000-000000000009',
      userId: '08000000-0000-4000-8000-000000000001',
      branchId: WESTLANDS,
      assignmentType: 'HOME',
      status: 'ACTIVE',
    });
  });

  it('reads the new draft id', () => {
    expect(branchDraftResultSchema.parse({ branch_id: WESTLANDS, status: 'DRAFT' })).toEqual({
      branchId: WESTLANDS,
    });
  });
});
```

`branch-query.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { branchListApiPath, parseBranchListQuery } from './branch-query';

const parse = (query: string) => parseBranchListQuery(new URLSearchParams(query));

describe('branch list query', () => {
  it('reads filters, sort, and paging from the URL', () => {
    expect(
      parse(
        'q=%20west%20&status=SUSPENDED&type=OPERATIONS&sortBy=branchName&sortDir=desc&page=2&size=20',
      ),
    ).toEqual({
      q: 'west',
      status: 'SUSPENDED',
      type: 'OPERATIONS',
      sort: { by: 'branchName', dir: 'DESC' },
      page: 2,
      size: 20,
    });
  });

  it('drops anything the backend would reject or answer with a 500', () => {
    expect(parse('status=PAUSED&sortBy=branch_name&size=7&page=-1')).toEqual({
      sort: { by: 'createdAt', dir: 'DESC' },
      page: 0,
      size: 10,
    });
  });

  it('builds the snake_case request with camelCase sort values', () => {
    expect(branchListApiPath(parse('q=west&sortBy=branchCode'))).toBe(
      '/api/v1/branches?q=west&sort_by=branchCode&sort_dir=ASC&page=0&size=10',
    );
  });
});
```

`branch-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  activateBlocked,
  availableBranchActions,
  branchDraftSchema,
  branchTypeLabel,
  canAssignUsers,
  canRevokeAssignments,
} from './branch-rules';

const ALL = [
  'branch.view',
  'branch.create',
  'branch.activate',
  'branch.suspend',
  'branch.reactivate',
  'branch.close',
];
const DRAFT = {
  branchCode: 'NAIROBI_CBD',
  branchName: 'Nairobi CBD Branch',
  branchType: 'OPERATIONS',
  parentBranchId: '',
  timezone: 'Africa/Nairobi',
};

describe('branch rules', () => {
  it.each([
    ['DRAFT', ['submit']],
    ['PENDING_APPROVAL', ['activate']],
    ['ACTIVE', ['suspend', 'close']],
    ['SUSPENDED', ['reactivate', 'close']],
    ['CLOSED', []],
    ['ARCHIVED', []],
  ] as const)('offers the %s transitions', (status, expected) => {
    expect(availableBranchActions(status, { permissions: ALL })).toEqual(expected);
  });

  it('needs each code and branch.view, and submit is gated by branch.create (BG-31)', () => {
    expect(
      availableBranchActions('ACTIVE', { permissions: ['branch.view', 'branch.close'] }),
    ).toEqual(['close']);
    expect(
      availableBranchActions('DRAFT', { permissions: ['branch.view', 'branch.create'] }),
    ).toEqual(['submit']);
    expect(availableBranchActions('ACTIVE', { permissions: ['branch.suspend'] })).toEqual([]);
  });

  it('blocks activation only for a known drafter (BG-08)', () => {
    expect(activateBlocked('u1', 'u1')).toBe(true);
    expect(activateBlocked('u2', 'u1')).toBe(false);
    expect(activateBlocked(null, 'u1')).toBe(false);
  });

  it('assigns only to an ACTIVE branch, with all three codes', () => {
    const holder = { permissions: ['user.assign_branch', 'branch_assignment.view', 'user.view'] };
    expect(canAssignUsers('ACTIVE', holder)).toBe(true);
    expect(canAssignUsers('SUSPENDED', holder)).toBe(false);
    expect(canAssignUsers('ACTIVE', { permissions: ['user.assign_branch', 'user.view'] })).toBe(
      false,
    );
    // The drawer's user search (GET /tenant/users) needs user.view.
    expect(
      canAssignUsers('ACTIVE', { permissions: ['user.assign_branch', 'branch_assignment.view'] }),
    ).toBe(false);
    expect(
      canRevokeAssignments({ permissions: ['user.revoke_branch', 'branch_assignment.view'] }),
    ).toBe(true);
    expect(canRevokeAssignments({ permissions: ['user.revoke_branch'] })).toBe(false);
  });

  it('labels enum-like types and keeps free text as typed', () => {
    expect(branchTypeLabel('HEAD_OFFICE')).toBe('Head office');
    expect(branchTypeLabel('Service centre')).toBe('Service centre');
  });

  it('validates a draft like the backend does, plus a real timezone', () => {
    expect(branchDraftSchema.safeParse(DRAFT).success).toBe(true);
    expect(branchDraftSchema.safeParse({ ...DRAFT, branchCode: 'nairobi cbd' }).success).toBe(
      false,
    );
    expect(branchDraftSchema.safeParse({ ...DRAFT, branchCode: 'X' }).success).toBe(false);
    expect(branchDraftSchema.safeParse({ ...DRAFT, branchName: 'N' }).success).toBe(false);
    expect(branchDraftSchema.safeParse({ ...DRAFT, timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(branchDraftSchema.safeParse({ ...DRAFT, parentBranchId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });
});
```

`branch-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet, listAuditEvents } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  listAuditEvents: vi.fn(),
}));
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args) as unknown,
}));
vi.mock('@/modules/administration/audit/audit-service', () => ({
  listAuditEvents: (...args: unknown[]) => listAuditEvents(...args) as unknown,
}));

const service = await import('./branch-service');

const ID = '08000000-0000-4000-8000-000000000006';

describe('branch service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads a branch by a validated id only; a malformed id rejects (a load() failure)', async () => {
    apiGet.mockResolvedValueOnce({});
    await service.getBranch(ID);
    expect(apiGet).toHaveBeenCalledWith(`/api/v1/branches/${ID}`, expect.anything());
    await expect(service.getBranch('../../tenant')).rejects.toThrow();
    await expect(service.listBranchAssignments('../x', { page: 0, size: 10 })).rejects.toThrow();
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('counts active assignments with one size=1 read, or null when unreadable', async () => {
    apiGet.mockResolvedValueOnce({ items: [], page: { totalItems: 3 } });
    await expect(service.countActiveAssignments(ID)).resolves.toBe(3);
    expect(apiGet).toHaveBeenCalledWith(
      `/api/v1/tenant/branch-assignments?branch_id=${ID}&status=ACTIVE&page=0&size=1`,
      expect.anything(),
    );
    apiGet.mockRejectedValueOnce(new Error('forbidden'));
    await expect(service.countActiveAssignments(ID)).resolves.toBeNull();
  });

  it('reads the drafter from the branch.create_draft audit event, or null (BG-08)', async () => {
    listAuditEvents.mockResolvedValueOnce({ items: [{ actorUserId: 'u-9' }], page: {} });
    await expect(service.getBranchMaker(ID)).resolves.toBe('u-9');
    expect(listAuditEvents).toHaveBeenCalledWith({
      entityType: 'BRANCH',
      entityId: ID,
      action: 'branch.create_draft',
      page: 0,
      size: 1,
    });
    listAuditEvents.mockRejectedValueOnce(new Error('forbidden'));
    await expect(service.getBranchMaker(ID)).resolves.toBeNull();
  });
});
```

Run (form T): `pnpm test:run modules/administration/branches`. Expected: FAIL (the modules are
missing).

- [ ] **Step 2: Implement `branch-contract.ts`**

```ts
import { z } from 'zod';
import { businessDateSchema, instantSchema, pageSchema, uuidSchema } from '@/lib/api/wire';

export const BRANCH_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'ACTIVE',
  'SUSPENDED',
  'CLOSED',
  'ARCHIVED',
] as const;
export type BranchStatus = (typeof BRANCH_STATUSES)[number];

/** `branch_type` is free text (contract §F); these are the values the backend itself writes. */
export const BRANCH_TYPE_SUGGESTIONS = ['HEAD_OFFICE', 'OPERATIONS'] as const;

/** Labels only — an assignment type grants no permissions (contract §D). */
export const BRANCH_ASSIGNMENT_TYPES = ['HOME', 'OPERATE', 'APPROVE', 'VIEW'] as const;
export type BranchAssignmentType = (typeof BRANCH_ASSIGNMENT_TYPES)[number];

/** `sort_by` allow-list for `GET /branches` (contract §E.3); anything else is a backend 500. */
export const BRANCH_SORT_FIELDS = [
  'branchName',
  'branchCode',
  'branchType',
  'status',
  'createdAt',
] as const;
export type BranchSortField = (typeof BRANCH_SORT_FIELDS)[number];

const branchSummarySchema = z
  .object({
    id: uuidSchema,
    branch_code: z.string(),
    branch_name: z.string(),
    branch_type: z.string(),
    status: z.enum(BRANCH_STATUSES),
    created_at: instantSchema,
  })
  .transform((branch) => ({
    id: branch.id,
    branchCode: branch.branch_code,
    branchName: branch.branch_name,
    branchType: branch.branch_type,
    status: branch.status,
    createdAt: branch.created_at,
  }));

export type BranchSummary = z.output<typeof branchSummarySchema>;

export const branchPageSchema = pageSchema(branchSummarySchema);

/** `address` is always `{}` and `opened_on`/`closed_on` are never set (BG-13) — not mapped. */
export const branchDetailSchema = z
  .object({
    id: uuidSchema,
    branch_code: z.string(),
    branch_name: z.string(),
    branch_type: z.string(),
    parent_branch_id: uuidSchema.nullable(),
    status: z.enum(BRANCH_STATUSES),
    timezone: z.string(),
    opened_on: businessDateSchema.nullable(),
    closed_on: businessDateSchema.nullable(),
    status_reason: z.string().nullable(),
    created_at: instantSchema,
    updated_at: instantSchema,
  })
  .transform((branch) => ({
    id: branch.id,
    branchCode: branch.branch_code,
    branchName: branch.branch_name,
    branchType: branch.branch_type,
    parentBranchId: branch.parent_branch_id,
    status: branch.status,
    timezone: branch.timezone,
    openedOn: branch.opened_on,
    closedOn: branch.closed_on,
    statusReason: branch.status_reason,
    createdAt: branch.created_at,
    updatedAt: branch.updated_at,
  }));

export type BranchDetail = z.output<typeof branchDetailSchema>;

// `status` stays a plain string: a create that succeeded must never fail on its echo.
export const branchDraftResultSchema = z
  .object({ branch_id: uuidSchema, status: z.string() })
  .transform((result) => ({ branchId: result.branch_id }));

const branchAssignmentSchema = z
  .object({
    id: uuidSchema,
    user_id: uuidSchema,
    branch_id: uuidSchema,
    assignment_type: z.enum(BRANCH_ASSIGNMENT_TYPES),
    status: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    userId: row.user_id,
    branchId: row.branch_id,
    assignmentType: row.assignment_type,
    status: row.status,
  }));

export type BranchAssignment = z.output<typeof branchAssignmentSchema>;

export const branchAssignmentPageSchema = pageSchema(branchAssignmentSchema);
```

- [ ] **Step 3: Implement `branch-query.ts`**

```ts
import { parseListSort, sortQuery, type ListSort } from '@/lib/api/list-sort';
import { parsePaging } from '@/lib/api/paging';
import { toQueryString } from '@/lib/api/query-string';
import {
  BRANCH_SORT_FIELDS,
  BRANCH_STATUSES,
  type BranchSortField,
  type BranchStatus,
} from './branch-contract';

export const DEFAULT_BRANCH_PAGE_SIZE = 10;
export const DEFAULT_BRANCH_SORT: ListSort<BranchSortField> = { by: 'createdAt', dir: 'DESC' };

export interface BranchListQuery {
  q?: string;
  status?: BranchStatus;
  type?: string;
  sort: ListSort<BranchSortField>;
  page: number;
  size: number;
}

/** URL → validated directory query; unknown statuses and sort fields are dropped, never sent. */
export function parseBranchListQuery(params: URLSearchParams): BranchListQuery {
  const query: BranchListQuery = {
    ...parsePaging(params, DEFAULT_BRANCH_PAGE_SIZE),
    sort: parseListSort(params, BRANCH_SORT_FIELDS, DEFAULT_BRANCH_SORT),
  };
  const q = params.get('q')?.trim().slice(0, 100);
  if (q) query.q = q;
  const status = BRANCH_STATUSES.find((value) => value === params.get('status'));
  if (status) query.status = status;
  // Free text on the wire: an unknown type returns an empty page, never an error (contract §A).
  const type = params.get('type')?.trim().slice(0, 50);
  if (type) query.type = type;
  return query;
}

export function branchListApiPath(query: BranchListQuery): string {
  return `/api/v1/branches${toQueryString({
    q: query.q,
    status: query.status,
    type: query.type,
    ...sortQuery(query.sort),
    page: query.page,
    size: query.size,
  })}`;
}
```

- [ ] **Step 4: Implement `branch-rules.ts`**

```ts
import { z } from 'zod';
import { can, type PermissionHolder } from '@/auth/permissions';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { uuidSchema } from '@/lib/api/wire';
import type { BranchStatus } from './branch-contract';

export type BranchLifecycleAction = 'submit' | 'activate' | 'suspend' | 'reactivate' | 'close';

const ACTIONS_BY_STATUS: Record<BranchStatus, readonly BranchLifecycleAction[]> = {
  DRAFT: ['submit'],
  PENDING_APPROVAL: ['activate'],
  ACTIVE: ['suspend', 'close'],
  SUSPENDED: ['reactivate', 'close'],
  CLOSED: [],
  ARCHIVED: [],
};

// Contract §E.3: submitting a draft is gated by `branch.create`, not a code of its own.
const PERMISSION: Record<BranchLifecycleAction, string> = {
  submit: 'branch.create',
  activate: 'branch.activate',
  suspend: 'branch.suspend',
  reactivate: 'branch.reactivate',
  close: 'branch.close',
};

/** Every transition reads the branch back, so it also needs `branch.view` (BG-31). */
export function availableBranchActions(
  status: BranchStatus,
  holder: PermissionHolder,
): BranchLifecycleAction[] {
  if (!can(holder, 'branch.view')) return [];
  return ACTIONS_BY_STATUS[status].filter((action) => can(holder, PERMISSION[action]));
}

export const MAKER_CHECKER_BLOCKED =
  'You drafted this branch, so another administrator must activate it.';

/** BG-08: the drafter comes from the audit log. An unknown drafter never blocks — the backend
 * decides, and a 403 is explained then. */
export function activateBlocked(makerId: string | null, userId: string | null): boolean {
  return makerId !== null && makerId === userId;
}

/** Assigning needs an ACTIVE branch (else 409), the read-back permission (BG-31), and
 * `user.view` for the drawer's user search. */
export function canAssignUsers(status: BranchStatus, holder: PermissionHolder): boolean {
  return (
    status === 'ACTIVE' &&
    can(holder, 'user.assign_branch') &&
    can(holder, 'branch_assignment.view') &&
    can(holder, 'user.view')
  );
}

export function canRevokeAssignments(holder: PermissionHolder): boolean {
  return can(holder, 'user.revoke_branch') && can(holder, 'branch_assignment.view');
}

/** `HEAD_OFFICE` → `Head office`; free text such as `Service centre` stays as typed. */
export function branchTypeLabel(type: string): string {
  return /^[A-Z0-9_]+$/.test(type) ? humanizeEnum(type) : type;
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** CreateBranch (contract §D), shared by the form (RHF) and the Server Action. The backend
 * doesn't validate the timezone; an invalid one would break every date on the record later. */
export const branchDraftSchema = z.object({
  branchCode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_-]{2,20}$/, 'Use 2–20 capital letters, digits, underscores or hyphens.'),
  branchName: z
    .string()
    .trim()
    .min(2, 'Enter a name of at least 2 characters.')
    .max(100, 'Use at most 100 characters.'),
  branchType: z
    .string()
    .trim()
    .min(1, 'Enter a branch type.')
    .max(50, 'Use at most 50 characters.'),
  parentBranchId: z.union([z.literal(''), uuidSchema]),
  timezone: z.string().refine(isTimeZone, 'Choose a timezone.'),
});

export type BranchDraftValues = z.infer<typeof branchDraftSchema>;
```

- [ ] **Step 5: Implement `branch-service.ts`**

```ts
import 'server-only';
import { cache } from 'react';
import { toQueryString } from '@/lib/api/query-string';
import { apiGet } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import { listAuditEvents } from '@/modules/administration/audit/audit-service';
import {
  branchAssignmentPageSchema,
  branchDetailSchema,
  branchPageSchema,
} from './branch-contract';
import { branchListApiPath, type BranchListQuery } from './branch-query';

export function listBranches(query: BranchListQuery) {
  return apiGet(branchListApiPath(query), branchPageSchema);
}

/** One read per request: the record layout (hero) and its tabs share it. `async`, so a malformed
 * id rejects (a `load()` failure) instead of throwing synchronously past `load()`. */
export const getBranch = cache(async (branchId: string) => {
  const id = uuidSchema.parse(branchId);
  return await apiGet(`/api/v1/branches/${id}`, branchDetailSchema);
});

/** ACTIVE assignments at one branch (with a branch selected the backend forces its own). */
export async function listBranchAssignments(
  branchId: string,
  paging: { page: number; size: number },
) {
  const id = uuidSchema.parse(branchId);
  return await apiGet(
    `/api/v1/tenant/branch-assignments${toQueryString({
      branch_id: id,
      status: 'ACTIVE',
      page: paging.page,
      size: paging.size,
    })}`,
    branchAssignmentPageSchema,
  );
}

/** BG-15: no count endpoint — one `size=1` read; null when unreadable. */
export async function countActiveAssignments(branchId: string): Promise<number | null> {
  try {
    return (await listBranchAssignments(branchId, { page: 0, size: 1 })).page.totalItems;
  } catch {
    return null;
  }
}

/** BG-08: the drafter is only in the audit log (`branch.create_draft`, contract §G "maker
 * lookups"); null without `audit.view` or when no event is readable. */
export async function getBranchMaker(branchId: string): Promise<string | null> {
  try {
    const events = await listAuditEvents({
      entityType: 'BRANCH',
      entityId: branchId,
      action: 'branch.create_draft',
      page: 0,
      size: 1,
    });
    return events.items[0]?.actorUserId ?? null;
  } catch {
    return null;
  }
}
```

Run (form T): `pnpm test:run modules/administration/branches`. Expected: PASS.

- [ ] **Step 6: Commit** (form C)

`git add modules/administration/branches/branch-contract.ts modules/administration/branches/branch-contract.test.ts modules/administration/branches/branch-query.ts modules/administration/branches/branch-query.test.ts modules/administration/branches/branch-rules.ts modules/administration/branches/branch-rules.test.ts modules/administration/branches/branch-service.ts modules/administration/branches/branch-service.test.ts`

```
feat(branches): add the branch contract, list query, lifecycle rules, and reads

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 3: Branch Server Actions and `applyFieldErrors`

**Files:**

- Create: `modules/administration/branches/branch-actions.ts`, `branch-actions.test.ts`
- Create: `lib/apply-field-errors.ts`, `lib/apply-field-errors.test.ts`

**Interfaces:**

- Consumes: `runServerAction`, `ActionResult` (07), and `apiPost` plus **A1** `apiDelete` (07).
  From Task 2: `branchDraftSchema`, `branchDraftResultSchema`, `BRANCH_ASSIGNMENT_TYPES`.
- Produces:
  - `FormAction`s (`(previous, formData) => Promise<ActionResult>`):
    - `createBranchDraft`, which redirects to `/admin/branches/<id>` on success;
    - `submitBranch`, `activateBranch`, `reactivateBranch` (fields `idempotencyKey`, `branchId`,
      and an optional `reason`);
    - `suspendBranch`, `closeBranch` (the same fields, with `reason` required, 3–500);
    - `assignBranchUser` (`idempotencyKey`, `branchId`, `userId`, `assignmentType`);
    - `revokeBranchAssignment` (`idempotencyKey`, `assignmentId`).
  - `applyFieldErrors<T extends FieldValues>(setError: UseFormSetError<T>, fieldErrors: Partial<Record<string, string>>, fields: readonly Path<T>[]): void`.
    It sets each listed field that has a message, focuses the first, and ignores unknown keys.
    Consumed by 09, 11 and 16.

- [ ] **Step 1: Write the failing tests**

`lib/apply-field-errors.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { applyFieldErrors } from './apply-field-errors';

describe('applyFieldErrors', () => {
  it('sets each known field once, focuses only the first, and ignores unknown keys', () => {
    const setError = vi.fn();

    applyFieldErrors<{ branchCode: string; branchName: string }>(
      setError,
      { branchName: 'Too short', branchCode: 'Taken', idempotencyKey: 'Invalid' },
      ['branchCode', 'branchName'],
    );

    expect(setError.mock.calls).toEqual([
      ['branchCode', { type: 'server', message: 'Taken' }, { shouldFocus: true }],
      ['branchName', { type: 'server', message: 'Too short' }, { shouldFocus: false }],
    ]);
  });
});
```

`modules/administration/branches/branch-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

const { apiDelete, apiPost, redirect, runServerAction } = vi.hoisted(() => ({
  apiPost: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
    Promise.resolve<unknown>({}),
  ),
  apiDelete: vi.fn((_path: string, _key: string) => Promise.resolve<unknown>({})),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  runServerAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) as unknown }));
vi.mock('@/lib/api/tenant-api', () => ({
  apiPost: (path: string, body: Record<string, unknown>, key: string) => apiPost(path, body, key),
  apiDelete: (path: string, key: string) => apiDelete(path, key),
}));
vi.mock('@/lib/api/action-result', () => ({
  runServerAction: (...args: unknown[]) => runServerAction(...args) as unknown,
}));

const actions = await import('./branch-actions');

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const BRANCH = '44444444-4444-4444-8444-444444444444';
const USER = '08000000-0000-4000-8000-000000000002';
const ASSIGNMENT = '08000000-0000-4000-8000-000000000009';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(fields).forEach(([name, value]) => {
    data.set(name, value);
  });
  return data;
}

const failure = (code: string) => ({
  ok: false as const,
  formError: 'generic',
  fieldErrors: {},
  code,
  requestId: 'req-1',
});

describe('branch actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Pass-through: this file covers fields, bodies, and messages; runServerAction has its own test.
    runServerAction.mockImplementation(
      async (schema: z.ZodType, formData: FormData, run: (input: unknown) => Promise<unknown>) => {
        await run(schema.parse(Object.fromEntries(formData)));
        return { ok: true };
      },
    );
  });

  it('creates a draft with an explicit snake_case body and redirects to the record', async () => {
    apiPost.mockResolvedValueOnce({ branch_id: BRANCH, status: 'DRAFT' });

    await expect(
      actions.createBranchDraft(
        null,
        form({
          idempotencyKey: KEY,
          branchCode: 'NAIROBI_CBD',
          branchName: ' Nairobi CBD Branch ',
          branchType: 'OPERATIONS',
          parentBranchId: '',
          timezone: 'Africa/Nairobi',
        }),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/admin/branches/${BRANCH}`);
    expect(apiPost).toHaveBeenCalledWith(
      '/api/v1/branches',
      {
        branch_code: 'NAIROBI_CBD',
        branch_name: 'Nairobi CBD Branch',
        branch_type: 'OPERATIONS',
        parent_branch_id: null,
        timezone: 'Africa/Nairobi',
      },
      KEY,
    );
  });

  it("points a create 409 at the code without claiming it's a duplicate", async () => {
    runServerAction.mockResolvedValueOnce(failure('conflict'));
    const result = await actions.createBranchDraft(null, form({}));
    expect(result).toMatchObject({
      ok: false,
      code: 'conflict',
      requestId: 'req-1',
      fieldErrors: { branchCode: 'This code may already be in use.' },
      formError: expect.stringContaining('may already be in use') as unknown,
    });
  });

  it.each([
    ['submitBranch', 'submit'],
    ['activateBranch', 'activate'],
    ['reactivateBranch', 'reactivate'],
  ] as const)('%s posts {} or {reason} with the client key', async (name, path) => {
    await actions[name](null, form({ idempotencyKey: KEY, branchId: BRANCH, reason: '  ' }));
    expect(apiPost).toHaveBeenLastCalledWith(`/api/v1/branches/${BRANCH}/${path}`, {}, KEY);

    await actions[name](null, form({ idempotencyKey: KEY, branchId: BRANCH, reason: ' Ready ' }));
    expect(apiPost).toHaveBeenLastCalledWith(
      `/api/v1/branches/${BRANCH}/${path}`,
      { reason: 'Ready' },
      KEY,
    );
  });

  it.each(['suspendBranch', 'closeBranch'] as const)(
    '%s requires a reason of 3–500 characters before calling the backend',
    async (name) => {
      await expect(
        actions[name](null, form({ idempotencyKey: KEY, branchId: BRANCH, reason: 'ab' })),
      ).rejects.toThrow();
      await expect(
        actions[name](
          null,
          form({ idempotencyKey: KEY, branchId: BRANCH, reason: 'x'.repeat(501) }),
        ),
      ).rejects.toThrow();
      expect(apiPost).not.toHaveBeenCalled();

      await actions[name](
        null,
        form({ idempotencyKey: KEY, branchId: BRANCH, reason: 'Cash count' }),
      );
      expect(apiPost).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`/branches/${BRANCH}/(suspend|close)$`)),
        { reason: 'Cash count' },
        KEY,
      );
    },
  );

  it('explains an activation 403 as permission or maker-checker (BG-08) and leaves others alone', async () => {
    runServerAction.mockResolvedValueOnce(failure('forbidden'));
    expect(await actions.activateBranch(null, form({}))).toMatchObject({
      code: 'forbidden',
      formError: expect.stringContaining('you drafted it') as unknown,
    });

    runServerAction.mockResolvedValueOnce(failure('conflict'));
    expect(await actions.activateBranch(null, form({}))).toMatchObject({ formError: 'generic' });
  });

  it('explains a blocked close', async () => {
    runServerAction.mockResolvedValueOnce(failure('conflict'));
    expect(await actions.closeBranch(null, form({}))).toMatchObject({
      formError: expect.stringContaining("can't be closed while users are assigned") as unknown,
    });
  });

  it('assigns with a snake_case body and refuses a missing user before calling the backend', async () => {
    await actions.assignBranchUser(
      null,
      form({ idempotencyKey: KEY, branchId: BRANCH, userId: USER, assignmentType: 'APPROVE' }),
    );
    expect(apiPost).toHaveBeenCalledWith(
      '/api/v1/tenant/branch-assignments',
      { user_id: USER, branch_id: BRANCH, assignment_type: 'APPROVE' },
      KEY,
    );

    apiPost.mockClear();
    await expect(
      actions.assignBranchUser(
        null,
        form({ idempotencyKey: KEY, branchId: BRANCH, userId: '', assignmentType: 'APPROVE' }),
      ),
    ).rejects.toThrow();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("revokes with DELETE and explains a member's last assignment", async () => {
    await actions.revokeBranchAssignment(
      null,
      form({ idempotencyKey: KEY, assignmentId: ASSIGNMENT }),
    );
    expect(apiDelete).toHaveBeenCalledWith(`/api/v1/tenant/branch-assignments/${ASSIGNMENT}`, KEY);

    runServerAction.mockResolvedValueOnce(failure('conflict'));
    expect(await actions.revokeBranchAssignment(null, form({}))).toMatchObject({
      formError: expect.stringContaining('last branch assignment') as unknown,
    });
  });
});
```

Run (form T): `pnpm test:run lib/apply-field-errors.test.ts modules/administration/branches/branch-actions.test.ts`.
Expected: FAIL.

- [ ] **Step 2: Implement `lib/apply-field-errors.ts`**

```ts
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

/**
 * Merges a Server Action's `fieldErrors` into React Hook Form (spec §6.4). Only `fields` are set,
 * so a key the form doesn't render (e.g. `idempotencyKey`) stays in the form-level message; the
 * first one set takes focus.
 */
export function applyFieldErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fieldErrors: Partial<Record<string, string>>,
  fields: readonly Path<T>[],
): void {
  let focus = true;
  for (const field of fields) {
    const message = fieldErrors[field];
    if (message === undefined) continue;
    setError(field, { type: 'server', message }, { shouldFocus: focus });
    focus = false;
  }
}
```

- [ ] **Step 3: Implement `branch-actions.ts`**

```ts
'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { apiDelete, apiPost } from '@/lib/api/tenant-api';
import { UUID_PATTERN, uuidSchema } from '@/lib/api/wire';
import { BRANCH_ASSIGNMENT_TYPES, branchDraftResultSchema } from './branch-contract';
import { branchDraftSchema } from './branch-rules';

const idempotencyKey = z.uuid();

// No `|| null` transform (prefer-nullish-coalescing has no autofix): `transition()` tests the
// value, and a trimmed '' is falsy, so a blank reason still sends `{}`.
const optionalReason = z
  .string()
  .trim()
  .max(500, 'Keep the reason under 500 characters.')
  .optional();

const requiredReason = z
  .string()
  .trim()
  .min(3, 'Give a reason of at least 3 characters.')
  .max(500, 'Keep the reason under 500 characters.');

const transitionInput = z.object({ idempotencyKey, branchId: uuidSchema, reason: optionalReason });
const reasonedInput = transitionInput.extend({ reason: requiredReason });

/** Swaps the generic status message for one that names the guard behind a known code (spec §6.7). */
function explain(
  result: ActionResult,
  code: string,
  formError: string,
  fieldErrors: Partial<Record<string, string>> = {},
): ActionResult {
  if (result.ok || result.code !== code) return result;
  return { ...result, formError, fieldErrors: { ...result.fieldErrors, ...fieldErrors } };
}

// Submit/Activate/Reactivate take an optional reason, Suspend/Close a required one; the body is
// `{}` when there's no reason (contract §D).
function transition(
  path: string,
  schema: typeof transitionInput | typeof reasonedInput,
  formData: FormData,
): Promise<ActionResult> {
  return runServerAction(schema, formData, (input) =>
    apiPost(
      `/api/v1/branches/${input.branchId}/${path}`,
      input.reason ? { reason: input.reason } : {},
      input.idempotencyKey,
    ),
  );
}

export async function createBranchDraft(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(
    branchDraftSchema.extend({ idempotencyKey }),
    formData,
    async (input) => {
      const draft = branchDraftResultSchema.parse(
        await apiPost(
          '/api/v1/branches',
          {
            branch_code: input.branchCode,
            branch_name: input.branchName,
            branch_type: input.branchType,
            parent_branch_id: input.parentBranchId || null,
            timezone: input.timezone,
          },
          input.idempotencyKey,
        ),
      );
      // Rethrown by runServerAction (unstable_rethrow): the client navigates to the new record.
      redirect(`/admin/branches/${draft.branchId}`);
    },
  );
  // 409 = duplicate code OR organisation not ACTIVE (contract §E.3) — never assert which.
  return explain(
    result,
    'conflict',
    "The branch couldn't be created. Its code may already be in use, or the institution can't add branches right now.",
    { branchCode: 'This code may already be in use.' },
  );
}

export async function submitBranch(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transition('submit', transitionInput, formData);
}

export async function activateBranch(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // BG-08: the backend answers a maker-checker violation with the same 403 as a missing permission.
  return explain(
    await transition('activate', transitionInput, formData),
    'forbidden',
    "You can't activate this branch. Your role may not allow it, or you drafted it — a different administrator must activate it.",
  );
}

export async function suspendBranch(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transition('suspend', reasonedInput, formData);
}

export async function reactivateBranch(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transition('reactivate', transitionInput, formData);
}

export async function closeBranch(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explain(
    await transition('close', reasonedInput, formData),
    'conflict',
    // 409 = this guard OR an invalid transition or a race (contract §I) — never assert which.
    "This branch couldn't be closed. A branch can't be closed while users are assigned to it or child branches are active. It may also have changed — refresh and check.",
  );
}

const assignInput = z.object({
  idempotencyKey,
  branchId: uuidSchema,
  userId: z.string().regex(UUID_PATTERN, 'Choose a user.'),
  assignmentType: z.enum(BRANCH_ASSIGNMENT_TYPES, { error: 'Choose an assignment type.' }),
});

export async function assignBranchUser(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(assignInput, formData, (input) =>
    apiPost(
      '/api/v1/tenant/branch-assignments',
      { user_id: input.userId, branch_id: input.branchId, assignment_type: input.assignmentType },
      input.idempotencyKey,
    ),
  );
  return explain(
    result,
    'conflict',
    "This user can't be assigned here: their membership may be revoked, or the branch isn't active.",
  );
}

const revokeInput = z.object({ idempotencyKey, assignmentId: uuidSchema });

export async function revokeBranchAssignment(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(revokeInput, formData, (input) =>
    apiDelete(`/api/v1/tenant/branch-assignments/${input.assignmentId}`, input.idempotencyKey),
  );
  return explain(
    result,
    'conflict',
    // 409 = this guard OR an already-revoked assignment or a race (contract §I) — never assert which.
    "This assignment couldn't be revoked. It may be the user's last branch assignment (staff and admin members need one), or it changed — refresh and check.",
  );
}
```

Run (form T): the two test files. Expected: PASS.

- [ ] **Step 4: Commit** (form C)

`git add lib/apply-field-errors.ts lib/apply-field-errors.test.ts modules/administration/branches/branch-actions.ts modules/administration/branches/branch-actions.test.ts`

```
feat(branches): add branch lifecycle, draft, and assignment Server Actions with guard messages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 4: User search, `UserPicker`, and `AssignmentDrawer`

**Files:**

- Create: `modules/administration/users/user-option.ts` (client-safe)
- Create: `modules/administration/users/user-search-service.ts` (server-only),
  `user-search-service.test.ts`
- Create: `app/api/tenant/users/route.ts`, `app/api/tenant/users/route.test.ts`
- Create: `modules/administration/users/components/user-picker.tsx` (client), `user-picker.test.tsx`
- Create: `components/data-display/assignment-drawer.tsx` (client), `assignment-drawer.test.tsx`

**Interfaces:**

- Consumes:
  - `apiGet`, `pageSchema`, `uuidSchema`, `toQueryString` (06);
  - `requireAuthenticatedUser`, `UnauthenticatedContextRequestError`, `BackendApiError` (05);
  - `ActionResult`, `FormAction` (07, type-only).
- Produces (consumed by 09 role assignments, and by 10's actor picker and branch assignments):
  - `interface TenantUserOption { id; displayName; email; username; membershipStatus }` and
    `tenantUserOptionPageSchema` (`user-option.ts`).
  - `searchTenantUsers(q: string): Promise<TenantUserOption[]>`. It returns the first 10 matches
    of `GET /tenant/users?q=`; the list is never unbounded.
  - `GET /api/tenant/users?q=`. It returns `{ items: TenantUserOption[] }`, or `401`, `403` or
    `502` with `{ message }`, and needs a server-side session.
  - `UserPicker({ name, label, required?, error?, helperText?, onChange? })`. A 300 ms debounced
    search. The chosen id is submitted as the hidden input `name`.
  - `AssignmentDrawer({ open, title, description?, submitLabel, action: FormAction, onClose, onSuccess, children: (fieldErrors) => ReactNode })`.
    A right-anchored drawer form. It submits a hidden `idempotencyKey`, one per opening, and a
    retry after a failure reuses it.

- [ ] **Step 1: Load skills**

Invoke `frontend-design` and `ui-ux-pro-max`
(`--domain ux "async user search autocomplete side drawer form assignment"`).

- [ ] **Step 2: Write the failing tests**

`app/api/tenant/users/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { headersMock, requireAuthenticatedUser, searchTenantUsers } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  requireAuthenticatedUser: vi.fn(),
  searchTenantUsers: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: headersMock }));
vi.mock('@/auth/require-authenticated-user', () => ({
  requireAuthenticatedUser,
  UnauthenticatedContextRequestError: class UnauthenticatedContextRequestError extends Error {},
}));
vi.mock('@/modules/administration/users/user-search-service', () => ({ searchTenantUsers }));

const { GET } = await import('./route');
const { UnauthenticatedContextRequestError } = await import('@/auth/require-authenticated-user');
const { BackendApiError } = await import('@/auth/backend-api');

const PETER = {
  id: '08000000-0000-4000-8000-000000000002',
  displayName: 'Peter Otieno',
  email: 'peter.otieno@greenfield.example',
  username: 'peter.otieno',
  membershipStatus: 'ACTIVE',
};
const search = (query: string) => GET(new Request(`http://localhost/api/tenant/users${query}`));

describe('GET /api/tenant/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    requireAuthenticatedUser.mockResolvedValue({});
  });

  it('returns the first page of matches for a trimmed query', async () => {
    searchTenantUsers.mockResolvedValueOnce([PETER]);
    const response = await search('?q=%20pet%20');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [PETER] });
    expect(searchTenantUsers).toHaveBeenCalledWith('pet');
  });

  it('refuses without a server-side session', async () => {
    requireAuthenticatedUser.mockRejectedValueOnce(new UnauthenticatedContextRequestError());
    expect((await search('?q=pet')).status).toBe(401);
    expect(searchTenantUsers).not.toHaveBeenCalled();
  });

  it('maps a lost context or missing permission to 403 and anything else to 502', async () => {
    searchTenantUsers.mockRejectedValueOnce(new BackendApiError(403, { code: 'forbidden' }));
    expect((await search('?q=pet')).status).toBe(403);
    searchTenantUsers.mockRejectedValueOnce(new Error('schema drift'));
    expect((await search('?q=pet')).status).toBe(502);
  });
});
```

`modules/administration/users/user-search-service.test.ts` (the route test mocks the service, so
its query and mapping are pinned here; the mock parses through the real schema):

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ZodType } from 'zod';

const WIRE = {
  items: [
    {
      id: '08000000-0000-4000-8000-000000000002',
      username: 'peter.otieno',
      email: 'peter.otieno@greenfield.example',
      display_name: 'Peter Otieno',
      user_status: 'ACTIVE',
      membership_status: 'ACTIVE',
    },
  ],
  page: {
    number: 0,
    size: 10,
    total_items: 1,
    total_pages: 1,
    has_next: false,
    has_previous: false,
  },
};

const apiGet = vi.fn((_path: string, schema: ZodType) => Promise.resolve(schema.parse(WIRE)));
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (...args: Parameters<typeof apiGet>) => apiGet(...args),
}));

const { searchTenantUsers } = await import('./user-search-service');

describe('searchTenantUsers', () => {
  it('asks for the first 10 matches and maps them to camelCase options', async () => {
    expect(await searchTenantUsers('pet')).toEqual([
      {
        id: '08000000-0000-4000-8000-000000000002',
        displayName: 'Peter Otieno',
        email: 'peter.otieno@greenfield.example',
        username: 'peter.otieno',
        membershipStatus: 'ACTIVE',
      },
    ]);
    expect(apiGet).toHaveBeenLastCalledWith(
      '/api/v1/tenant/users?q=pet&size=10',
      expect.anything(),
    );
  });

  it('drops an empty query instead of sending q=', async () => {
    await searchTenantUsers('');
    expect(apiGet).toHaveBeenLastCalledWith('/api/v1/tenant/users?size=10', expect.anything());
  });
});
```

`modules/administration/users/components/user-picker.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { UserPicker } from './user-picker';

const PETER = {
  id: '08000000-0000-4000-8000-000000000002',
  displayName: 'Peter Otieno',
  email: 'peter.otieno@greenfield.example',
  username: 'peter.otieno',
  membershipStatus: 'ACTIVE',
};

// A fresh Response per call: a body can be read only once.
const respond =
  (body: unknown, status = 200) =>
  () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

describe('UserPicker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('searches once per pause in typing and submits the chosen user id', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(respond({ items: [PETER] }));
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <UserPicker name="userId" label="User" onChange={onChange} />,
    );

    await user.type(screen.getByRole('combobox', { name: 'User' }), 'pet');
    await user.click(await screen.findByRole('option', { name: /Peter Otieno/ }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/tenant/users?q=pet');
    expect(onChange).toHaveBeenCalledWith(PETER);
    expect(container.querySelector('input[name="userId"]')).toHaveValue(PETER.id);
  });

  it('explains a failed search instead of showing an empty list', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(respond({ message: 'down' }, 502));
    const user = userEvent.setup();
    renderWithProviders(<UserPicker name="userId" label="User" />);

    await user.type(screen.getByRole('combobox', { name: 'User' }), 'pet');

    expect(await screen.findByText("Couldn't search users. Try again.")).toBeInTheDocument();
  });
});
```

`components/data-display/assignment-drawer.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import TextField from '@mui/material/TextField';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { UUID_PATTERN } from '@/lib/api/wire';
import type { ActionResult } from '@/lib/api/action-result';
import { AssignmentDrawer } from './assignment-drawer';

const INVALID: ActionResult = {
  ok: false,
  formError: 'Check the highlighted fields and try again.',
  fieldErrors: { assignmentType: 'Choose an assignment type.' },
  code: 'validation_failed',
  requestId: 'req-4',
};

const keyOf = (formData: FormData | undefined) => String(formData?.get('idempotencyKey'));

function setup(
  action: (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>,
) {
  const onSuccess = vi.fn();
  const props = {
    title: 'Assign a user',
    description: 'Give a user access to Westlands Branch.',
    submitLabel: 'Assign user',
    action,
    onClose: vi.fn(),
    onSuccess,
  };
  const fields = (fieldErrors: Partial<Record<string, string>>) => (
    <>
      <input type="hidden" name="branchId" value="b-1" />
      <TextField
        name="assignmentType"
        label="Assignment type"
        defaultValue="OPERATE"
        error={Boolean(fieldErrors.assignmentType)}
        helperText={fieldErrors.assignmentType}
      />
    </>
  );
  const view = renderWithProviders(
    <AssignmentDrawer open {...props}>
      {fields}
    </AssignmentDrawer>,
  );
  return { ...view, props, fields, onSuccess };
}

describe('AssignmentDrawer', () => {
  it('is a dialog named by its title and submits a key with its fields', async () => {
    const user = userEvent.setup();
    const action = vi.fn((_previous: ActionResult | null, _formData: FormData) =>
      Promise.resolve<ActionResult>({ ok: true }),
    );
    const { onSuccess } = setup(action);

    expect(screen.getByRole('dialog', { name: 'Assign a user' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Assign user' }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    const formData = action.mock.calls[0]?.[1];
    expect(formData?.get('branchId')).toBe('b-1');
    expect(formData?.get('assignmentType')).toBe('OPERATE');
    expect(keyOf(formData)).toMatch(UUID_PATTERN);
  });

  it('shows a failure on its field with the reference and retries with the same key', async () => {
    const user = userEvent.setup();
    const action = vi
      .fn((_previous: ActionResult | null, _formData: FormData) =>
        Promise.resolve<ActionResult>({ ok: true }),
      )
      .mockResolvedValueOnce(INVALID);
    const { onSuccess } = setup(action);

    await user.click(screen.getByRole('button', { name: 'Assign user' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('req-4');
    expect(screen.getByText('Choose an assignment type.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Assign user' }));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(keyOf(action.mock.calls[1]?.[1])).toBe(keyOf(action.mock.calls[0]?.[1]));
  });

  it('uses a fresh key each time it opens', async () => {
    const user = userEvent.setup();
    const action = vi.fn((_previous: ActionResult | null, _formData: FormData) =>
      Promise.resolve<ActionResult>({ ok: true }),
    );
    const { props, fields, rerender } = setup(action);

    await user.click(screen.getByRole('button', { name: 'Assign user' }));
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });
    rerender(
      <AssignmentDrawer {...props} open={false}>
        {fields}
      </AssignmentDrawer>,
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    rerender(
      <AssignmentDrawer {...props} open>
        {fields}
      </AssignmentDrawer>,
    );
    await user.click(screen.getByRole('button', { name: 'Assign user' }));
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(2);
    });

    expect(keyOf(action.mock.calls[1]?.[1])).not.toBe(keyOf(action.mock.calls[0]?.[1]));
  });
});
```

Run (form T): `pnpm test:run app/api/tenant modules/administration/users components/data-display/assignment-drawer.test.tsx`.
Expected: FAIL.

- [ ] **Step 3: Implement the search slice**

`modules/administration/users/user-option.ts`:

```ts
import { z } from 'zod';

/** A user as pickers show them — the browser-safe shape `/api/tenant/users` returns. */
export const tenantUserOptionSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string(),
  username: z.string(),
  membershipStatus: z.string(),
});

export type TenantUserOption = z.output<typeof tenantUserOptionSchema>;

export const tenantUserOptionPageSchema = z.object({ items: z.array(tenantUserOptionSchema) });
```

`modules/administration/users/user-search-service.ts`:

```ts
import 'server-only';
import { z } from 'zod';
import { toQueryString } from '@/lib/api/query-string';
import { apiGet } from '@/lib/api/tenant-api';
import { pageSchema, uuidSchema } from '@/lib/api/wire';
import type { TenantUserOption } from './user-option';

// ponytail: a search-only UserInTenantSummary; layer 10 owns the full users contract and may
// re-point this at it.
const tenantUserSchema = z
  .object({
    id: uuidSchema,
    username: z.string(),
    email: z.string(),
    display_name: z.string(),
    user_status: z.string(),
    membership_status: z.string(),
  })
  .transform((user) => ({
    id: user.id,
    displayName: user.display_name,
    email: user.email,
    username: user.username,
    membershipStatus: user.membership_status,
  }));

const SEARCH_SIZE = 10;

/** First page only of `GET /tenant/users?q=` (username, email, name; newest first). */
export async function searchTenantUsers(q: string): Promise<TenantUserOption[]> {
  const page = await apiGet(
    `/api/v1/tenant/users${toQueryString({ q: q || undefined, size: SEARCH_SIZE })}`,
    pageSchema(tenantUserSchema),
  );
  return [...page.items];
}
```

`app/api/tenant/users/route.ts`:

```ts
import { headers } from 'next/headers';
import { BackendApiError } from '@/auth/backend-api';
import {
  requireAuthenticatedUser,
  UnauthenticatedContextRequestError,
} from '@/auth/require-authenticated-user';
import { searchTenantUsers } from '@/modules/administration/users/user-search-service';

const SESSION_EXPIRED = 'Your session has expired. Please sign in again.';

/** Same-origin user search for `UserPicker`: the context token stays server-side. */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireAuthenticatedUser(await headers());
    const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 100);
    return Response.json({ items: await searchTenantUsers(q) });
  } catch (error) {
    if (
      error instanceof UnauthenticatedContextRequestError ||
      (error instanceof BackendApiError && error.status === 401)
    ) {
      return Response.json({ message: SESSION_EXPIRED }, { status: 401 });
    }
    if (error instanceof BackendApiError && error.status === 403) {
      return Response.json({ message: "You can't search users in this context." }, { status: 403 });
    }
    return Response.json({ message: 'User search is temporarily unavailable.' }, { status: 502 });
  }
}
```

- [ ] **Step 4: Implement `UserPicker`**

`modules/administration/users/components/user-picker.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { tenantUserOptionPageSchema, type TenantUserOption } from '../user-option';

interface UserPickerProps {
  /** The hidden input carrying the chosen user's id into the form's FormData. */
  name: string;
  label: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  onChange?: (user: TenantUserOption | null) => void;
}

class SearchFailed extends Error {
  constructor(readonly status: number) {
    super(`User search failed with status ${status}.`);
    this.name = 'SearchFailed';
  }
}

async function searchUsers(q: string, signal: AbortSignal): Promise<readonly TenantUserOption[]> {
  const response = await fetch(`/api/tenant/users?${new URLSearchParams({ q }).toString()}`, {
    signal,
  });
  if (!response.ok) throw new SearchFailed(response.status);
  return tenantUserOptionPageSchema.parse(await response.json()).items;
}

const SEARCH_DELAY_MS = 300;

/** Tenant user search (spec §9 assignment drawer, §10.1 actor filter): first 10 matches only. */
export function UserPicker({
  name,
  label,
  required,
  error,
  helperText,
  onChange,
}: UserPickerProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<TenantUserOption | null>(null);
  const [input, setInput] = useState('');
  const [options, setOptions] = useState<readonly TenantUserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      searchUsers(input.trim(), controller.signal)
        .then((items) => {
          setOptions(items);
          setFailure(null);
        })
        .catch((caught: unknown) => {
          if (controller.signal.aborted) return;
          setOptions([]);
          setFailure(
            caught instanceof SearchFailed && caught.status === 401
              ? 'Your session has expired. Sign in again.'
              : "Couldn't search users. Try again.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input, open]);

  return (
    <>
      <Autocomplete
        open={open}
        onOpen={() => {
          setOpen(true);
        }}
        onClose={() => {
          setOpen(false);
        }}
        options={options}
        value={value}
        loading={loading}
        // The backend already filtered by `q`.
        filterOptions={(all) => all}
        isOptionEqualToValue={(option, selected) => option.id === selected.id}
        getOptionLabel={(option) => option.displayName}
        noOptionsText={
          failure ?? (input.trim() ? 'No matching users' : 'Type a name, username, or email')
        }
        onInputChange={(_event, next) => {
          setInput(next);
        }}
        onChange={(_event, next) => {
          setValue(next);
          onChange?.(next);
        }}
        renderOption={({ key, ...optionProps }, option) => (
          <Box component="li" key={key} {...optionProps}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>
                {option.displayName}
              </Typography>
              <Typography variant="caption" component="p" color="text.secondary" noWrap>
                {option.email}
              </Typography>
            </Box>
          </Box>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            required={required}
            error={Boolean(error)}
            helperText={error ?? helperText}
          />
        )}
      />
      <input type="hidden" name={name} value={value?.id ?? ''} />
    </>
  );
}
```

- [ ] **Step 5: Implement `AssignmentDrawer`**

`components/data-display/assignment-drawer.tsx`:

```tsx
'use client';

import { useActionState, useId, useState, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import type { ActionResult, FormAction } from '@/lib/api/action-result';

type FieldErrors = Partial<Record<string, string>>;
const NO_ERRORS: FieldErrors = {};

interface AssignmentDrawerProps {
  open: boolean;
  title: string;
  description?: string;
  submitLabel: string;
  /** A Server Action; receives `idempotencyKey` plus whatever `children` renders. */
  action: FormAction;
  onClose: () => void;
  onSuccess: () => void;
  /** The assignment's fields (and hidden inputs for fixed IDs), given the server's field errors. */
  children: (fieldErrors: FieldErrors) => ReactNode;
}

/** Right-anchored assignment form (spec §9): user/role/branch assignment across 08–10. */
export function AssignmentDrawer({ open, onClose, ...form }: AssignmentDrawerProps) {
  const titleId = useId();
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      // The temporary Drawer's paper already has role="dialog" + aria-modal; add the name.
      slotProps={{ paper: { 'aria-labelledby': titleId, sx: { width: { xs: '100%', sm: 440 } } } }}
    >
      <AssignmentForm {...form} titleId={titleId} onClose={onClose} />
    </Drawer>
  );
}

/** Mounted once per opening (the Drawer unmounts closed content), like ReasonDialog: a fresh key
 * each time; a failed attempt keeps it, so a retry replays safely (spec §6.4). */
function AssignmentForm({
  titleId,
  title,
  description,
  submitLabel,
  action,
  onClose,
  onSuccess,
  children,
}: Omit<AssignmentDrawerProps, 'open'> & { titleId: string }) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      const result = await action(previous, formData);
      if (result.ok) onSuccess();
      return result;
    },
    null,
  );
  const failure = state && !state.ok ? state : null;

  return (
    <Box
      component="form"
      action={formAction}
      sx={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <Box sx={{ px: 4.5, py: 3.75, borderBottom: 1, borderColor: 'divider' }}>
        <Typography id={titleId} component="h2" variant="h4">
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {description}
          </Typography>
        )}
      </Box>
      <Box sx={{ p: 4.5, flexGrow: 1, display: 'grid', alignContent: 'start', gap: 4 }}>
        {failure && (
          <Alert severity="error">
            {failure.formError}
            {failure.requestId && ` Reference: ${failure.requestId}`}
          </Alert>
        )}
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        {children(failure?.fieldErrors ?? NO_ERRORS)}
      </Box>
      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          px: 4.5,
          py: 3,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 2,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Button variant="outlined" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" loading={pending}>
          {submitLabel}
        </Button>
      </Box>
    </Box>
  );
}
```

Run (form T): the Step 2 paths. Expected: PASS. jsdom's harmless "requestSubmit" notice may
appear (07b Task 5 note). Keep any polyfill local to the test file.

- [ ] **Step 6: Commit** (form C)

`git add modules/administration/users app/api/tenant components/data-display/assignment-drawer.tsx components/data-display/assignment-drawer.test.tsx`

```
feat(users): add a same-origin tenant user search, UserPicker, and the assignment drawer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 5: The directory, the create form, toolbar search, and navigation

**Files:**

- Modify: `components/data-display/list-toolbar.tsx` (`search` field kind),
  `components/data-display/list-toolbar.test.tsx` (append)
- Modify: `lib/api/query-string.ts` (`hrefWith`), `lib/api/query-string.test.ts` (append)
- Create: `modules/administration/branches/components/branch-directory-table.tsx`,
  `branch-directory-table.test.tsx`
- Create: `modules/administration/branches/components/branch-draft-form.tsx` (client),
  `branch-draft-form.test.tsx`
- Create: `app/(authenticated)/admin/branches/page.tsx`, `app/(authenticated)/admin/branches/new/page.tsx`
- Modify: `modules/administration/administration-navigation.ts` (its own commit, as the registry
  rule requires)

**Interfaces:**

- Consumes:
  - Tasks 2–3;
  - 06: `load`, `lastPageIfPastEnd`, `toSearchParams`, `getOrganisationTimeZone`,
    `getBranchIndex`, `ListNavigationProvider`, `ListNavigationProgress`, `ListBusyRegion`,
    `TablePaginationBar`, `EmptyState`, `ErrorState`, `StatusChip`, `TruncatedText`,
    `LinkPendingIndicator`;
  - `PageHeader` (04); `ForbiddenState` (07b); `getCurrentContextProfile` (05).
- Produces:
  - `ToolbarField` gains `{ kind: 'search'; name: string; label: string; placeholder?: string }`.
    It commits a trimmed value on Enter or blur and resets `page`. It's consumed by 09 and 10,
    and by 16 if the controller rules so.
  - `hrefWith(pathname: string, params: URLSearchParams, changes: Record<string, string | null>): string`,
    where `null` deletes a key.
  - `BranchDirectoryTable({ branches, sort, sortHref: (field: BranchSortField) => string, timeZone })`.
    A Server Component: its function prop never crosses to the client.
  - `BranchDraftForm({ parents: readonly { id: string; label: string }[]; defaultTimeZone: string })`.
  - Routes `/admin/branches` and `/admin/branches/new`, and the Branches nav entry
    (`branch.view`).

- [ ] **Step 1: Load skills**

Invoke `frontend-design`, then `ui-ux-pro-max`:

```
python "/home/ogaba/.claude/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/2.13.0/.claude/skills/ui-ux-pro-max/scripts/search.py" "branch directory record lifecycle core banking SACCO administration console data-dense" --design-system --density 9 --motion 2 --variance 3 -p "Finaxis Administration"
```

Add `--domain ux "sortable table headers search filter create form"`. Keep the output as working
notes for the whole layer. The prototype is the reference:
`/home/ogaba/Downloads/finaxis-admin-prototype-source-v5/finaxis-admin-prototype/src/App.jsx:1257-1330`
(the directory) and `:1940-2060` (the record tabs).

- [ ] **Step 2: Write the failing tests**

Append to `lib/api/query-string.test.ts` (import `hrefWith`):

```ts
describe('hrefWith', () => {
  it('sets, replaces, and deletes params on a path', () => {
    expect(
      hrefWith('/admin/branches', new URLSearchParams('q=west&page=2'), {
        sortBy: 'branchName',
        page: null,
      }),
    ).toBe('/admin/branches?q=west&sortBy=branchName');
    expect(hrefWith('/admin/branches', new URLSearchParams('page=1'), { page: null })).toBe(
      '/admin/branches',
    );
  });
});
```

Append to `components/data-display/list-toolbar.test.tsx`, inside `describe('ListToolbar')`:

```tsx
const SEARCH_FIELDS = [
  { kind: 'search' as const, name: 'q', label: 'Search', placeholder: 'Code or name' },
];

it('commits a trimmed search on Enter, once, and resets the page', async () => {
  search = 'status=ACTIVE&page=2';
  const user = userEvent.setup();
  renderWithProviders(
    <ListToolbar fields={SEARCH_FIELDS} resultLabel="2 branches" timeZone={NAIROBI} />,
  );

  await user.type(screen.getByRole('searchbox', { name: 'Search' }), '  west {Enter}');

  expect(push).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenCalledWith('/admin/audit?status=ACTIVE&q=west', { scroll: false });
});

it('skips an unchanged blur and clears the search when emptied', async () => {
  search = 'q=west';
  const user = userEvent.setup();
  renderWithProviders(
    <ListToolbar fields={SEARCH_FIELDS} resultLabel="1 branch" timeZone={NAIROBI} />,
  );
  const field = screen.getByRole('searchbox', { name: 'Search' });
  expect(field).toHaveValue('west');

  await user.click(field);
  await user.tab();
  expect(push).not.toHaveBeenCalled();

  await user.clear(field);
  await user.tab();
  expect(push).toHaveBeenCalledWith('/admin/audit', { scroll: false });
});

it('resets the search box on every URL change, including back to empty (Clear filters)', () => {
  search = '';
  const { rerender } = renderWithProviders(
    <ListToolbar fields={SEARCH_FIELDS} resultLabel="6 branches" timeZone={NAIROBI} />,
  );
  const field = screen.getByRole('searchbox', { name: 'Search' });
  fireEvent.change(field, { target: { value: 'west' } });
  fireEvent.keyDown(field, { key: 'Enter' });

  search = 'q=west'; // the commit lands
  rerender(<ListToolbar fields={SEARCH_FIELDS} resultLabel="1 branch" timeZone={NAIROBI} />);
  expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('west');

  search = ''; // "Clear filters": the old text must not come back, nor re-commit on blur
  rerender(<ListToolbar fields={SEARCH_FIELDS} resultLabel="6 branches" timeZone={NAIROBI} />);
  expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('');
});
```

`modules/administration/branches/components/branch-directory-table.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { BranchSummary } from '../branch-contract';
import { BranchDirectoryTable } from './branch-directory-table';

const LONG =
  'Old Town Branch — Moi Avenue, Tom Mboya Street and River Road Customer Service Centre';
const BRANCHES: BranchSummary[] = [
  {
    id: '44444444-4444-4444-8444-444444444444',
    branchCode: 'WESTLANDS',
    branchName: 'Westlands Branch',
    branchType: 'OPERATIONS',
    status: 'SUSPENDED',
    createdAt: '2026-07-01T08:00:00Z',
  },
  {
    id: '08000000-0000-4000-8000-000000000008',
    branchCode: 'OLD_TOWN',
    branchName: LONG,
    branchType: 'Service centre',
    status: 'CLOSED',
    createdAt: '2026-07-15T08:00:00Z',
  },
];

describe('BranchDirectoryTable', () => {
  it('links each branch, marks the sorted column, and links every sort field', () => {
    renderWithProviders(
      <BranchDirectoryTable
        branches={BRANCHES}
        sort={{ by: 'branchName', dir: 'ASC' }}
        sortHref={(field) => `/sort/${field}`}
        timeZone="Africa/Nairobi"
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Branch' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(screen.getByRole('columnheader', { name: 'Created' })).not.toHaveAttribute('aria-sort');
    for (const [label, field] of [
      ['Branch', 'branchName'],
      ['Code', 'branchCode'],
      ['Type', 'branchType'],
      ['Status', 'status'],
      ['Created', 'createdAt'],
    ]) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', `/sort/${field}`);
    }
    expect(screen.getByRole('link', { name: 'Westlands Branch' })).toHaveAttribute(
      'href',
      '/admin/branches/44444444-4444-4444-8444-444444444444',
    );
    expect(screen.getByRole('link', { name: LONG })).toHaveAttribute('title', LONG);
    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(screen.getByText('Service centre')).toBeInTheDocument();
    expect(screen.getByText('Suspended')).toBeInTheDocument();
    expect(screen.getByText('01 Jul 2026')).toBeInTheDocument();
  });
});
```

`modules/administration/branches/components/branch-draft-form.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { UUID_PATTERN } from '@/lib/api/wire';
import { BranchDraftForm } from './branch-draft-form';

const { createBranchDraft } = vi.hoisted(() => ({ createBranchDraft: vi.fn() }));
vi.mock('../branch-actions', () => ({
  createBranchDraft: (...args: unknown[]) => createBranchDraft(...args) as unknown,
}));

const PARENTS = [
  { id: '22222222-2222-4222-8222-222222222222', label: 'Head Office (HEAD_OFFICE)' },
];
const CONFLICT = {
  ok: false,
  formError:
    "The branch couldn't be created. Its code may already be in use, or the institution can't add branches right now.",
  fieldErrors: { branchCode: 'This code may already be in use.' },
  code: 'conflict',
  requestId: 'req-3',
};
const sent = (call: number) => createBranchDraft.mock.calls[call]?.[1] as FormData | undefined;

function renderForm() {
  renderWithProviders(<BranchDraftForm parents={PARENTS} defaultTimeZone="Africa/Nairobi" />);
  return {
    code: screen.getByRole('textbox', { name: 'Branch code' }),
    name: screen.getByRole('textbox', { name: 'Branch name' }),
    create: screen.getByRole('button', { name: 'Create draft' }),
  };
}

describe('BranchDraftForm', () => {
  beforeEach(() => {
    createBranchDraft.mockReset();
  });

  it('validates on the client before calling the action', async () => {
    const user = userEvent.setup();
    const { code, create } = renderForm();

    await user.type(code, 'nairobi cbd');
    await user.click(create);

    expect(
      await screen.findByText('Use 2–20 capital letters, digits, underscores or hyphens.'),
    ).toBeInTheDocument();
    expect(code).toHaveAttribute('aria-invalid', 'true');
    expect(createBranchDraft).not.toHaveBeenCalled();
  });

  it('sends the fields with one key, shows server field errors, and retries with the same key', async () => {
    const user = userEvent.setup();
    createBranchDraft.mockResolvedValueOnce(CONFLICT).mockResolvedValueOnce({ ok: true });
    const { code, name, create } = renderForm();

    await user.type(code, 'NAIROBI_CBD');
    await user.type(name, 'Nairobi CBD Branch');
    await user.click(create);

    expect(await screen.findByText('This code may already be in use.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('req-3');
    expect(Object.fromEntries(sent(0) ?? new FormData())).toEqual({
      idempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown,
      branchCode: 'NAIROBI_CBD',
      branchName: 'Nairobi CBD Branch',
      branchType: 'OPERATIONS',
      parentBranchId: '',
      timezone: 'Africa/Nairobi',
    });

    await user.click(create);
    await waitFor(() => {
      expect(createBranchDraft).toHaveBeenCalledTimes(2);
    });
    expect(sent(1)?.get('idempotencyKey')).toBe(sent(0)?.get('idempotencyKey'));
  });
});
```

Run (form T): `pnpm test:run lib/api/query-string.test.ts components/data-display/list-toolbar.test.tsx modules/administration/branches/components`.
Expected: FAIL.

- [ ] **Step 3: Add `hrefWith` and the toolbar `search` kind**

`lib/api/query-string.ts`, appended:

```ts
/** `pathname` with `params` plus `changes` applied (`null` deletes a key). */
export function hrefWith(
  pathname: string,
  params: URLSearchParams,
  changes: Record<string, string | null>,
): string {
  const next = new URLSearchParams(params);
  Object.entries(changes).forEach(([key, value]) => {
    if (value === null) next.delete(key);
    else next.set(key, value);
  });
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}
```

`components/data-display/list-toolbar.tsx`:

1. Import `useState` next to `useRef`.
2. Add a member to the `ToolbarField` union:

   ```ts
     | {
         kind: 'search';
         name: string;
         label: string;
         placeholder?: string;
       }
   ```

3. Add, above `ListToolbar`:

   ```tsx
   /**
    * Free-text search, committed (trimmed) on Enter or blur — not per keystroke, so a commit never
    * races the text still being typed. Every URL change (a commit landing, "Clear filters",
    * Back/Forward) resets the draft to the URL value — React's "previous prop" pattern, so a cleared
    * URL never shows (or re-commits on blur) the old text.
    * ponytail: characters typed while a commit is in flight are replaced by the committed value;
    * add a debounce with a pending-commit guard if users expect live filtering.
    */
   function SearchField({
     field,
     current,
     onCommit,
   }: {
     field: Extract<ToolbarField, { kind: 'search' }>;
     current: string;
     onCommit: (value: string) => void;
   }) {
     const [seen, setSeen] = useState(current);
     const [draft, setDraft] = useState(current);
     if (current !== seen) {
       setSeen(current);
       setDraft(current);
     }
     const commit = (raw: string) => {
       const next = raw.trim();
       if (next !== current) onCommit(next);
     };
     return (
       <TextField
         type="search"
         label={field.label}
         placeholder={field.placeholder}
         value={draft}
         sx={{ width: { xs: '100%', sm: 260 } }}
         slotProps={{ htmlInput: { maxLength: 100 } }}
         onChange={(event) => {
           setDraft(event.target.value);
         }}
         onBlur={(event) => {
           commit(event.target.value);
         }}
         onKeyDown={(event) => {
           if (event.key !== 'Enter') return;
           event.preventDefault();
           commit(draft);
         }}
       />
     );
   }
   ```

4. Make this the first branch of `fields.map`:

   ```tsx
   if (field.kind === 'search') {
     return (
       <SearchField
         key={field.name}
         field={field}
         current={searchParams.get(field.name) ?? ''}
         onCommit={(value) => {
           setParam(field.name, value);
         }}
       />
     );
   }
   ```

- [ ] **Step 4: Implement `BranchDirectoryTable`**

`modules/administration/branches/components/branch-directory-table.tsx`:

```tsx
import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';
import { LinkPendingIndicator } from '@/components/navigation/link-pending-indicator';
import { StatusChip } from '@/components/data-display/status-chip';
import { TruncatedText } from '@/components/data-display/truncated-text';
import type { ListSort } from '@/lib/api/list-sort';
import { formatInstant } from '@/lib/format';
import type { BranchSortField, BranchSummary } from '../branch-contract';
import { branchTypeLabel } from '../branch-rules';

const COLUMNS: readonly { field: BranchSortField; label: string }[] = [
  { field: 'branchName', label: 'Branch' },
  { field: 'branchCode', label: 'Code' },
  { field: 'branchType', label: 'Type' },
  { field: 'status', label: 'Status' },
  { field: 'createdAt', label: 'Created' },
];

interface BranchDirectoryTableProps {
  branches: readonly BranchSummary[];
  sort: ListSort<BranchSortField>;
  /** Server Component: this function prop never crosses to the client — keep it that way. */
  sortHref: (field: BranchSortField) => string;
  timeZone: string;
}

/** The branch directory (spec §10.3): every header is a server-built sort link. */
export function BranchDirectoryTable({
  branches,
  sort,
  sortHref,
  timeZone,
}: BranchDirectoryTableProps) {
  return (
    <TableContainer sx={{ maxHeight: { md: 'calc(100dvh - 300px)' }, minHeight: 240 }}>
      <Table stickyHeader aria-label="Branches" sx={{ minWidth: 760 }}>
        <TableHead>
          <TableRow>
            {COLUMNS.map(({ field, label }) => {
              const active = sort.by === field;
              const direction = active && sort.dir === 'DESC' ? 'desc' : 'asc';
              return (
                <TableCell key={field} sortDirection={active ? direction : false}>
                  <TableSortLabel
                    component={NextLink}
                    href={sortHref(field)}
                    active={active}
                    direction={direction}
                  >
                    {label}
                    <LinkPendingIndicator />
                  </TableSortLabel>
                </TableCell>
              );
            })}
          </TableRow>
        </TableHead>
        <TableBody>
          {branches.map((branch) => (
            <TableRow key={branch.id} hover>
              <TableCell>
                <Link
                  component={NextLink}
                  href={`/admin/branches/${branch.id}`}
                  variant="body2"
                  noWrap
                  title={branch.branchName}
                  sx={{ display: 'block', maxWidth: 320, fontWeight: 700 }}
                >
                  {branch.branchName}
                  <LinkPendingIndicator />
                </Link>
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {branch.branchCode}
                </Typography>
              </TableCell>
              <TableCell>
                <TruncatedText value={branchTypeLabel(branch.branchType)} maxWidth={180} />
              </TableCell>
              <TableCell>
                <StatusChip value={branch.status} />
              </TableCell>
              <TableCell>{formatInstant(branch.createdAt, timeZone).date}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
```

- [ ] **Step 5: Implement `BranchDraftForm`**

`modules/administration/branches/components/branch-draft-form.tsx`:

```tsx
'use client';

import { startTransition, useActionState, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import NextLink from '@/components/navigation/next-link';
import type { ActionResult } from '@/lib/api/action-result';
import { applyFieldErrors } from '@/lib/apply-field-errors';
import { createBranchDraft } from '../branch-actions';
import { BRANCH_TYPE_SUGGESTIONS } from '../branch-contract';
import { branchDraftSchema, type BranchDraftValues } from '../branch-rules';

const FIELDS = ['branchCode', 'branchName', 'branchType', 'parentBranchId', 'timezone'] as const;

interface BranchDraftFormProps {
  /** Every branch the index resolved (≤ 500), as `Name (CODE)`. */
  parents: readonly { id: string; label: string }[];
  /** The organisation's zone (or UTC) — listed even where Intl omits it (V8 has no `UTC`). */
  defaultTimeZone: string;
}

function timeZones(defaultTimeZone: string): string[] {
  const zones = Intl.supportedValuesOf('timeZone');
  return zones.includes(defaultTimeZone) ? zones : [defaultTimeZone, ...zones];
}

/**
 * Create branch draft (spec §10.3) — the first multi-field form, so React Hook Form + the zod
 * resolver (spec §6.4); server field errors merge back with `applyFieldErrors`. One idempotency
 * key per mount: a retry after a failure replays safely; success redirects to the record.
 * No address field: it's stored but never returned (BG-13).
 */
export function BranchDraftForm({ parents, defaultTimeZone }: BranchDraftFormProps) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [zones] = useState(() => timeZones(defaultTimeZone));
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<BranchDraftValues>({
    resolver: zodResolver(branchDraftSchema),
    defaultValues: {
      branchCode: '',
      branchName: '',
      branchType: 'OPERATIONS',
      parentBranchId: '',
      timezone: defaultTimeZone,
    },
  });
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      const result = await createBranchDraft(previous, formData);
      if (!result.ok) applyFieldErrors(setError, result.fieldErrors, FIELDS);
      return result;
    },
    null,
  );
  const failure = state && !state.ok ? state : null;

  const onValid = (values: BranchDraftValues) => {
    const formData = new FormData();
    formData.set('idempotencyKey', idempotencyKey);
    for (const name of FIELDS) formData.set(name, values[name]);
    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <Box
      component="form"
      noValidate
      onSubmit={(event) => {
        void handleSubmit(onValid)(event);
      }}
      sx={{ p: 4.5, maxWidth: 640, display: 'grid', gap: 4 }}
    >
      {failure && (
        <Alert severity="error">
          {failure.formError}
          {failure.requestId && ` Reference: ${failure.requestId}`}
        </Alert>
      )}
      <TextField
        label="Branch code"
        required
        {...register('branchCode')}
        error={Boolean(errors.branchCode)}
        helperText={
          errors.branchCode?.message ??
          '2–20 capital letters, digits, underscores or hyphens, e.g. WESTLANDS.'
        }
        slotProps={{
          htmlInput: { maxLength: 20, autoCapitalize: 'characters', spellCheck: false },
        }}
      />
      <TextField
        label="Branch name"
        required
        {...register('branchName')}
        error={Boolean(errors.branchName)}
        helperText={errors.branchName?.message}
        slotProps={{ htmlInput: { maxLength: 100 } }}
      />
      <Controller
        name="branchType"
        control={control}
        render={({ field }) => (
          <Autocomplete
            freeSolo
            options={BRANCH_TYPE_SUGGESTIONS}
            value={field.value}
            inputValue={field.value}
            onInputChange={(_event, next) => {
              field.onChange(next);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Branch type"
                required
                inputRef={field.ref}
                onBlur={field.onBlur}
                error={Boolean(errors.branchType)}
                helperText={
                  errors.branchType?.message ??
                  'Free text. The platform itself uses HEAD_OFFICE and OPERATIONS.'
                }
              />
            )}
          />
        )}
      />
      <Controller
        name="parentBranchId"
        control={control}
        render={({ field }) => (
          <Autocomplete
            options={parents}
            value={parents.find((parent) => parent.id === field.value) ?? null}
            onChange={(_event, parent) => {
              field.onChange(parent?.id ?? '');
            }}
            getOptionLabel={(parent) => parent.label}
            isOptionEqualToValue={(parent, selected) => parent.id === selected.id}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Parent branch"
                inputRef={field.ref}
                onBlur={field.onBlur}
                error={Boolean(errors.parentBranchId)}
                helperText={errors.parentBranchId?.message ?? 'Optional.'}
              />
            )}
          />
        )}
      />
      <Controller
        name="timezone"
        control={control}
        render={({ field }) => (
          <Autocomplete
            options={zones}
            value={field.value || null}
            onChange={(_event, zone) => {
              field.onChange(zone ?? '');
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Timezone"
                required
                inputRef={field.ref}
                onBlur={field.onBlur}
                error={Boolean(errors.timezone)}
                helperText={errors.timezone?.message}
              />
            )}
          />
        )}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 2 }}>
        <Button component={NextLink} href="/admin/branches" variant="outlined" disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" loading={pending}>
          Create draft
        </Button>
      </Box>
    </Box>
  );
}
```

(`void handleSubmit(onValid)(event)` satisfies `no-misused-promises`. If the Autocomplete render
params' own `slotProps.input.ref` conflicts with `inputRef`, keep `inputRef`: RHF only needs it
to focus the field.)

- [ ] **Step 6: Implement the pages**

`app/(authenticated)/admin/branches/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import AddOutlined from '@mui/icons-material/AddOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can } from '@/auth/permissions';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ListNavigationProvider } from '@/components/data-display/list-navigation-context';
import {
  ListBusyRegion,
  ListNavigationProgress,
} from '@/components/data-display/list-pending-indicator';
import { ListToolbar } from '@/components/data-display/list-toolbar';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { getOrganisationTimeZone } from '@/lib/api/lookups';
import { lastPageIfPastEnd } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import {
  BRANCH_STATUSES,
  BRANCH_TYPE_SUGGESTIONS,
} from '@/modules/administration/branches/branch-contract';
import { parseBranchListQuery } from '@/modules/administration/branches/branch-query';
import { branchTypeLabel } from '@/modules/administration/branches/branch-rules';
import { listBranches } from '@/modules/administration/branches/branch-service';
import { BranchDirectoryTable } from '@/modules/administration/branches/components/branch-directory-table';

export const metadata: Metadata = { title: 'Branches' };

const PATH = '/admin/branches';

interface BranchesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BranchesPage({ searchParams }: BranchesPageProps) {
  const params = toSearchParams(await searchParams);
  const query = parseBranchListQuery(params);
  const [branches, selected, timeZone] = await Promise.all([
    load(listBranches(query)),
    getCurrentContextProfile(),
    getOrganisationTimeZone(),
  ]);
  const permissions = selected.kind === 'resolved' ? selected.profile.permissions : [];

  const header = (
    <PageHeader
      eyebrow="Administration"
      title="Branches"
      description="Operating locations, their lifecycle, and who is assigned to each."
      actions={
        can({ permissions }, 'branch.create') ? (
          <Button
            component={NextLink}
            href={`${PATH}/new`}
            variant="contained"
            startIcon={<AddOutlined />}
          >
            Create branch
          </Button>
        ) : undefined
      }
    />
  );

  if (!branches.ok) {
    return (
      <>
        {header}
        <Paper>
          <ErrorState problem={branches.problem} />
        </Paper>
      </>
    );
  }

  const redirectPage = lastPageIfPastEnd(branches.value.page);
  if (redirectPage !== null) {
    redirect(hrefWith(PATH, params, { page: redirectPage === 0 ? null : String(redirectPage) }));
  }

  const total = branches.value.page.totalItems;
  // A free-text type from the URL is applied, so it must stay selectable (not render as "All").
  // ponytail: only the two platform types are offered (Ruling 15); upgrade: a freeSolo type filter.
  const typeOptions = [
    ...new Set([...BRANCH_TYPE_SUGGESTIONS, ...(query.type ? [query.type] : [])]),
  ].map((type) => ({ value: type, label: branchTypeLabel(type) }));
  const hasFilters = Boolean(query.q ?? query.status ?? query.type);

  return (
    <>
      {header}
      <ListNavigationProvider>
        <Paper sx={{ overflow: 'hidden', position: 'relative' }}>
          <ListToolbar
            timeZone={timeZone}
            resultLabel={`${total} ${total === 1 ? 'branch' : 'branches'}`}
            fields={[
              { kind: 'search', name: 'q', label: 'Search', placeholder: 'Code or name' },
              {
                kind: 'select',
                name: 'status',
                label: 'Status',
                allLabel: 'All statuses',
                options: BRANCH_STATUSES.map((status) => ({
                  value: status,
                  label: humanizeEnum(status),
                })),
              },
              {
                kind: 'select',
                name: 'type',
                label: 'Type',
                allLabel: 'All types',
                options: typeOptions,
              },
            ]}
          />
          <ListNavigationProgress />
          <ListBusyRegion>
            {branches.value.items.length === 0 ? (
              <EmptyState
                title="No branches"
                description={
                  hasFilters
                    ? 'No branches match these filters.'
                    : 'No branches have been created yet.'
                }
              />
            ) : (
              <BranchDirectoryTable
                branches={branches.value.items}
                sort={query.sort}
                timeZone={timeZone}
                sortHref={(field) =>
                  hrefWith(PATH, params, {
                    sortBy: field,
                    sortDir: query.sort.by === field && query.sort.dir === 'ASC' ? 'DESC' : 'ASC',
                    page: null,
                  })
                }
              />
            )}
            <TablePaginationBar page={branches.value.page} />
          </ListBusyRegion>
        </Paper>
      </ListNavigationProvider>
    </>
  );
}
```

`app/(authenticated)/admin/branches/new/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can } from '@/auth/permissions';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { PageHeader } from '@/components/shell/page-header';
import { getBranchIndex, getOrganisationTimeZone } from '@/lib/api/lookups';
import { BranchDraftForm } from '@/modules/administration/branches/components/branch-draft-form';

export const metadata: Metadata = { title: 'Create branch' };

export default async function NewBranchPage() {
  const [selected, timeZone, branches] = await Promise.all([
    getCurrentContextProfile(),
    getOrganisationTimeZone(),
    getBranchIndex(),
  ]);
  const resolved = selected.kind === 'resolved' ? selected : null;
  const header = (
    <PageHeader
      eyebrow="Administration · Branches"
      title="Create branch"
      description="A new branch starts as a draft. After you submit it, a different administrator must activate it."
    />
  );

  if (!can({ permissions: resolved?.profile.permissions ?? [] }, 'branch.create')) {
    return (
      <>
        {header}
        <Paper>
          <ForbiddenState />
        </Paper>
      </>
    );
  }

  return (
    <>
      {header}
      <Paper>
        {resolved?.context.branch && (
          // Spec §6.5: a draft is unreachable from a branch context; submitting needs All branches.
          <Alert severity="info" sx={{ m: 4.5, mb: 0 }}>
            You&apos;re working in {resolved.context.branch.name}. You can create the draft here,
            but switch to All branches to open and submit it.
          </Alert>
        )}
        <BranchDraftForm
          defaultTimeZone={timeZone}
          parents={[...branches].map(([id, branch]) => ({
            id,
            label: `${branch.name} (${branch.code})`,
          }))}
        />
      </Paper>
    </>
  );
}
```

Run (form T): the Step 2 paths. Expected: PASS.

- [ ] **Step 7: Commit the pages** (form C)

`git add lib/api/query-string.ts lib/api/query-string.test.ts components/data-display/list-toolbar.tsx components/data-display/list-toolbar.test.tsx modules/administration/branches/components/branch-directory-table.tsx modules/administration/branches/components/branch-directory-table.test.tsx modules/administration/branches/components/branch-draft-form.tsx modules/administration/branches/components/branch-draft-form.test.tsx 'app/(authenticated)/admin/branches/page.tsx' 'app/(authenticated)/admin/branches/new/page.tsx'`

```
feat(branches): add the branch directory, toolbar search, and the create-draft form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

- [ ] **Step 8: Add the navigation entry, in its own commit** (form C)

`modules/administration/administration-navigation.ts`: import `AccountTreeOutlined` from
`@mui/icons-material/AccountTreeOutlined` and insert **directly after the Overview entry**. That
is spec §8 order: no Approval queue or Users & access entry exists yet.

```ts
  {
    href: '/admin/branches',
    label: 'Branches',
    icon: AccountTreeOutlined,
    requiresAny: ['branch.view'],
  },
```

`git add modules/administration/administration-navigation.ts`

```
feat(nav): add Branches to the administration navigation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 6: The branch record: layout, lifecycle, Overview, Users, Audit

**Files:**

- Create: `app/(authenticated)/admin/branches/[branchId]/layout.tsx`, `page.tsx`, `users/page.tsx`,
  `audit/page.tsx`
- Create (under `modules/administration/branches/components/`):
  - `branch-lifecycle-actions.tsx` (client) and `branch-lifecycle-actions.test.tsx`;
  - `branch-user-actions.tsx` (client), with `AssignBranchUserButton` and
    `RevokeAssignmentButton`;
  - `branch-users-table.tsx`.

**Interfaces:**

- Consumes:
  - Tasks 2–5;
  - 07b: `RecordHero`, `RecordTabs`, `CopyIdButton`, `ForbiddenState`, `BranchContextState`,
    `ConfirmDialog`, `RecordAuditTab`;
  - 07: `ReasonDialog`, `SectionCard`, `formatBusinessDate`;
  - 06: `DescriptionList`, `getTenantUser`, `getBranchIndex`, `useToast`.
- Produces:
  - `BranchLifecycleActions({ branchId, branchName, actions, activateBlocked, selectedHere })`;
  - `AssignBranchUserButton({ branchId, branchName })`;
  - `RevokeAssignmentButton({ assignmentId, userLabel, typeLabel })`;
  - `BranchUsersTable({ rows: readonly BranchUserRow[]; canRevoke })`;
  - the routes `/admin/branches/[branchId]` (Overview), `/users` and `/audit`.

- [ ] **Step 1: Load skills**

Reuse Task 5's `ui-ux-pro-max` notes. Add `--domain ux "record page hero lifecycle actions disabled explanation"`.

- [ ] **Step 2: Write the failing test**

`branch-lifecycle-actions.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { MAKER_CHECKER_BLOCKED } from '../branch-rules';
import { BranchLifecycleActions } from './branch-lifecycle-actions';

const { suspendBranch } = vi.hoisted(() => ({ suspendBranch: vi.fn() }));
vi.mock('../branch-actions', () => ({
  submitBranch: vi.fn(),
  activateBranch: vi.fn(),
  reactivateBranch: vi.fn(),
  closeBranch: vi.fn(),
  suspendBranch: (...args: unknown[]) => suspendBranch(...args) as unknown,
}));

const ID = '44444444-4444-4444-8444-444444444444';

describe('BranchLifecycleActions', () => {
  it('explains a blocked activation, tied to the disabled button (BG-08)', () => {
    renderWithProviders(
      <BranchLifecycleActions
        branchId={ID}
        branchName="Karen Branch"
        actions={['activate']}
        activateBlocked
        selectedHere={false}
      />,
    );

    const activate = screen.getByRole('button', { name: 'Activate' });
    expect(activate).toBeDisabled();
    expect(activate).toHaveAccessibleDescription(MAKER_CHECKER_BLOCKED);
  });

  it('suspends with a required reason and the branch id, warning when it is the working branch', async () => {
    const user = userEvent.setup();
    suspendBranch.mockResolvedValueOnce({ ok: true });
    renderWithProviders(
      <BranchLifecycleActions
        branchId={ID}
        branchName="Westlands Branch"
        actions={['suspend', 'close']}
        activateBlocked={false}
        selectedHere
      />,
    );

    expect(screen.getByRole('button', { name: 'Close branch' })).toHaveClass(
      'MuiButton-colorError',
    );
    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    const dialog = screen.getByRole('dialog', { name: 'Suspend Westlands Branch?' });
    expect(within(dialog).getByText(/choose a working context again/)).toBeInTheDocument();
    const reason = within(dialog).getByRole('textbox', { name: 'Reason' });
    expect(reason).toBeRequired();
    await user.type(reason, 'Cash count');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));

    await waitFor(() => {
      expect(suspendBranch).toHaveBeenCalledTimes(1);
    });
    const formData = suspendBranch.mock.calls[0]?.[1] as FormData;
    expect(formData.get('branchId')).toBe(ID);
    expect(formData.get('reason')).toBe('Cash count');
    expect(await screen.findByRole('alert')).toHaveTextContent('Branch suspended');
  });
});
```

Run (form T): `pnpm test:run modules/administration/branches/components/branch-lifecycle-actions.test.tsx`.
Expected: FAIL.

- [ ] **Step 3: Implement `branch-lifecycle-actions.tsx`**

```tsx
'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { ReasonDialog } from '@/components/data-display/reason-dialog';
import { useToast } from '@/components/providers/toast-provider';
import type { FormAction } from '@/lib/api/action-result';
import {
  activateBranch,
  closeBranch,
  reactivateBranch,
  submitBranch,
  suspendBranch,
} from '../branch-actions';
import { MAKER_CHECKER_BLOCKED, type BranchLifecycleAction } from '../branch-rules';

interface ActionCopy {
  label: string;
  title: string;
  description: string;
  reason: 'optional' | 'required';
  success: string;
  action: FormAction;
}

function copyFor(id: BranchLifecycleAction, name: string, selectedHere: boolean): ActionCopy {
  // A branch-selected context becomes invalid once its branch leaves ACTIVE (contract §E.4).
  const leavesContext = selectedHere
    ? ' You are working in this branch, so you will choose a working context again afterwards.'
    : '';
  switch (id) {
    case 'submit':
      return {
        label: 'Submit for approval',
        title: `Submit ${name} for approval?`,
        description: 'A different administrator must activate it before anyone can work in it.',
        reason: 'optional',
        success: 'Submitted for approval',
        action: submitBranch,
      };
    case 'activate':
      return {
        label: 'Activate',
        title: `Activate ${name}?`,
        description: 'The branch becomes available for user assignments and as a working context.',
        reason: 'optional',
        success: 'Branch activated',
        action: activateBranch,
      };
    case 'suspend':
      return {
        label: 'Suspend',
        title: `Suspend ${name}?`,
        description: `Nobody can work in a suspended branch until it is reactivated.${leavesContext}`,
        reason: 'required',
        success: 'Branch suspended',
        action: suspendBranch,
      };
    case 'reactivate':
      return {
        label: 'Reactivate',
        title: `Reactivate ${name}?`,
        description: 'The branch becomes active again for its assigned users.',
        reason: 'optional',
        success: 'Branch reactivated',
        action: reactivateBranch,
      };
    case 'close':
      return {
        label: 'Close branch',
        title: `Close ${name}?`,
        description: `Closing is permanent. It is refused while users are still assigned here or child branches are active.${leavesContext}`,
        reason: 'required',
        success: 'Branch closed',
        action: closeBranch,
      };
  }
}

const BLOCKED_ID = 'branch-activate-blocked';

interface BranchLifecycleActionsProps {
  branchId: string;
  branchName: string;
  actions: readonly BranchLifecycleAction[];
  /** The current user drafted this branch (BG-08 lookup); Activate stays visible but disabled. */
  activateBlocked: boolean;
  /** This branch is the user's selected working context. */
  selectedHere: boolean;
}

/** Record hero lifecycle (spec §10.3): availability comes from `availableBranchActions`. */
export function BranchLifecycleActions({
  branchId,
  branchName,
  actions,
  activateBlocked,
  selectedHere,
}: BranchLifecycleActionsProps) {
  const notify = useToast();
  const [open, setOpen] = useState<BranchLifecycleAction | null>(null);
  const blocked = activateBlocked && actions.includes('activate');

  return (
    <>
      {actions.map((id, index) => (
        <Button
          key={id}
          variant={index === 0 ? 'contained' : 'outlined'}
          color={id === 'close' ? 'error' : 'primary'}
          disabled={id === 'activate' && blocked}
          aria-describedby={id === 'activate' && blocked ? BLOCKED_ID : undefined}
          onClick={() => {
            setOpen(id);
          }}
        >
          {copyFor(id, branchName, selectedHere).label}
        </Button>
      ))}
      {blocked && (
        // Visible text, not a tooltip: a disabled button can't take focus to reveal one.
        <Typography
          id={BLOCKED_ID}
          variant="caption"
          color="text.secondary"
          sx={{ flexBasis: '100%' }}
        >
          {MAKER_CHECKER_BLOCKED}
        </Typography>
      )}
      {actions.map((id) => {
        const copy = copyFor(id, branchName, selectedHere);
        return (
          <ReasonDialog
            key={id}
            open={open === id}
            title={copy.title}
            description={copy.description}
            confirmLabel={copy.label}
            reason={copy.reason}
            action={copy.action}
            onClose={() => {
              setOpen(null);
            }}
            onSuccess={() => {
              setOpen(null);
              notify(copy.success);
            }}
            fields={() => <input type="hidden" name="branchId" value={branchId} />}
          />
        );
      })}
    </>
  );
}
```

- [ ] **Step 4: Implement the users components**

These components and Step 5's routes have no failing unit test first, by design. The routes'
`page.tsx`/`layout.tsx` are excluded from coverage as Playwright-covered (`vitest.config.ts`), and
`modules/**/*.tsx` is outside the coverage include. Task 8's "assigns and revokes branch users"
covers them: it finds Revoke by its aria-label, and revoking Peter's new row takes the table back
to header + 3, which needs the hidden `assignmentId`.

`branch-user-actions.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import PersonAddAltOutlined from '@mui/icons-material/PersonAddAltOutlined';
import { AssignmentDrawer } from '@/components/data-display/assignment-drawer';
import { ConfirmDialog } from '@/components/data-display/confirm-dialog';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { useToast } from '@/components/providers/toast-provider';
import { UserPicker } from '@/modules/administration/users/components/user-picker';
import { assignBranchUser, revokeBranchAssignment } from '../branch-actions';
import { BRANCH_ASSIGNMENT_TYPES } from '../branch-contract';

export function AssignBranchUserButton({
  branchId,
  branchName,
}: {
  branchId: string;
  branchName: string;
}) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="contained"
        startIcon={<PersonAddAltOutlined />}
        onClick={() => {
          setOpen(true);
        }}
      >
        Assign user
      </Button>
      <AssignmentDrawer
        open={open}
        title="Assign a user"
        description={`Give a user access to ${branchName}. The assignment takes effect immediately.`}
        submitLabel="Assign user"
        action={assignBranchUser}
        onClose={() => {
          setOpen(false);
        }}
        onSuccess={() => {
          setOpen(false);
          notify('User assigned');
        }}
      >
        {(fieldErrors) => (
          <>
            <input type="hidden" name="branchId" value={branchId} />
            <UserPicker name="userId" label="User" required error={fieldErrors.userId} />
            <TextField
              select
              name="assignmentType"
              label="Assignment type"
              required
              defaultValue="OPERATE"
              error={Boolean(fieldErrors.assignmentType)}
              helperText={fieldErrors.assignmentType ?? 'A label only — it grants no permissions.'}
            >
              {BRANCH_ASSIGNMENT_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {humanizeEnum(type)}
                </MenuItem>
              ))}
            </TextField>
          </>
        )}
      </AssignmentDrawer>
    </>
  );
}

interface RevokeAssignmentButtonProps {
  assignmentId: string;
  userLabel: string;
  typeLabel: string;
}

export function RevokeAssignmentButton({
  assignmentId,
  userLabel,
  typeLabel,
}: RevokeAssignmentButtonProps) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="small"
        variant="outlined"
        color="error"
        aria-label={`Revoke ${userLabel}'s ${typeLabel} assignment`}
        onClick={() => {
          setOpen(true);
        }}
      >
        Revoke
      </Button>
      <ConfirmDialog
        open={open}
        tone="error"
        title={`Revoke ${userLabel}'s assignment?`}
        description={`${userLabel} loses the ${typeLabel} assignment at this branch immediately.`}
        confirmLabel="Revoke"
        action={revokeBranchAssignment}
        onClose={() => {
          setOpen(false);
        }}
        onSuccess={() => {
          setOpen(false);
          notify('Assignment revoked');
        }}
      >
        <input type="hidden" name="assignmentId" value={assignmentId} />
      </ConfirmDialog>
    </>
  );
}
```

`branch-users-table.tsx`:

```tsx
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { StatusChip, humanizeEnum } from '@/components/data-display/status-chip';
import { TruncatedText } from '@/components/data-display/truncated-text';
import { RevokeAssignmentButton } from './branch-user-actions';

export interface BranchUserRow {
  assignmentId: string;
  name: string;
  email: string | null;
  assignmentType: string;
}

export function BranchUsersTable({
  rows,
  canRevoke,
}: {
  rows: readonly BranchUserRow[];
  canRevoke: boolean;
}) {
  return (
    <TableContainer>
      <Table aria-label="Branch users" sx={{ minWidth: 560 }}>
        <TableHead>
          <TableRow>
            <TableCell>User</TableCell>
            <TableCell>Assignment type</TableCell>
            {canRevoke && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.assignmentId} hover>
              <TableCell>
                <TruncatedText value={row.name} maxWidth={280} />
                {row.email && (
                  <TruncatedText
                    value={row.email}
                    maxWidth={280}
                    variant="caption"
                    color="text.secondary"
                  />
                )}
              </TableCell>
              <TableCell>
                <StatusChip value={row.assignmentType} />
              </TableCell>
              {canRevoke && (
                <TableCell align="right">
                  <RevokeAssignmentButton
                    assignmentId={row.assignmentId}
                    userLabel={row.name}
                    typeLabel={humanizeEnum(row.assignmentType)}
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
```

- [ ] **Step 5: Implement the routes**

`app/(authenticated)/admin/branches/[branchId]/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Paper from '@mui/material/Paper';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can } from '@/auth/permissions';
import { ErrorState } from '@/components/data-display/error-state';
import { BranchContextState } from '@/components/data-display/forbidden-state';
import { RecordHero } from '@/components/data-display/record-hero';
import { RecordTabs } from '@/components/data-display/record-tabs';
import { StatusChip } from '@/components/data-display/status-chip';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { UUID_PATTERN } from '@/lib/api/wire';
import {
  activateBlocked,
  availableBranchActions,
  branchTypeLabel,
} from '@/modules/administration/branches/branch-rules';
import { getBranch, getBranchMaker } from '@/modules/administration/branches/branch-service';
import { BranchLifecycleActions } from '@/modules/administration/branches/components/branch-lifecycle-actions';

export const metadata: Metadata = { title: 'Branch record' };

interface BranchRecordLayoutProps {
  children: ReactNode;
  params: Promise<{ branchId: string }>;
}

/** Record shell (spec §9): the hero record is read once here; each tab fetches its own data. */
export default async function BranchRecordLayout({ children, params }: BranchRecordLayoutProps) {
  const { branchId } = await params;
  if (!UUID_PATTERN.test(branchId)) notFound();

  const [branch, selected] = await Promise.all([
    load(getBranch(branchId)),
    getCurrentContextProfile(),
  ]);
  const resolved = selected.kind === 'resolved' ? selected : null;

  if (!branch.ok) {
    const missing = branch.problem.code === 'resource_not_found';
    // Spec §6.5 / BG-03: with a branch selected, every other branch is a 404 — guide instead.
    if (missing && resolved?.context.branch) {
      return (
        <>
          <PageHeader eyebrow="Administration · Branch record" title="Branch not available here" />
          <Paper>
            <BranchContextState />
          </Paper>
        </>
      );
    }
    if (missing) notFound();
    return (
      <>
        <PageHeader eyebrow="Administration · Branch record" title="Branch record" />
        <Paper>
          <ErrorState problem={branch.problem} />
        </Paper>
      </>
    );
  }

  const record = branch.value;
  const holder = { permissions: resolved?.profile.permissions ?? [] };
  const actions = availableBranchActions(record.status, holder);
  // BG-08: the drafter is only in the audit log — look it up only when Activate is on offer.
  const maker =
    actions.includes('activate') && can(holder, 'audit.view')
      ? await getBranchMaker(branchId)
      : null;
  const base = `/admin/branches/${branchId}`;

  return (
    <>
      <RecordHero
        back={{ href: '/admin/branches', label: 'Back to branches' }}
        avatar={{ kind: 'icon', icon: <AccountTreeOutlined /> }}
        eyebrow="Administration · Branch record"
        title={record.branchName}
        subtitle={`${record.branchCode} · ${branchTypeLabel(record.branchType)}`}
        status={<StatusChip value={record.status} />}
        actions={
          actions.length > 0 ? (
            <BranchLifecycleActions
              branchId={branchId}
              branchName={record.branchName}
              actions={actions}
              activateBlocked={activateBlocked(maker, resolved?.profile.user_id ?? null)}
              selectedHere={resolved?.context.branch?.id === branchId}
            />
          ) : undefined
        }
      />
      <RecordTabs
        label={`${record.branchName} sections`}
        tabs={[
          { href: base, label: 'Overview' },
          ...(can(holder, 'branch_assignment.view')
            ? [{ href: `${base}/users`, label: 'Users' }]
            : []),
          ...(can(holder, 'audit.view') ? [{ href: `${base}/audit`, label: 'Audit' }] : []),
        ]}
      />
      {children}
    </>
  );
}
```

`app/(authenticated)/admin/branches/[branchId]/page.tsx` (Overview):

```tsx
import Link from '@mui/material/Link';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can } from '@/auth/permissions';
import { CopyIdButton } from '@/components/data-display/copy-id-button';
import { DescriptionList, type DescriptionItem } from '@/components/data-display/description-list';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import NextLink from '@/components/navigation/next-link';
import { load } from '@/lib/api/load';
import { getBranchIndex, getOrganisationTimeZone } from '@/lib/api/lookups';
import { formatBusinessDate, formatInstant, shortId } from '@/lib/format';
import { branchTypeLabel } from '@/modules/administration/branches/branch-rules';
import {
  countActiveAssignments,
  getBranch,
} from '@/modules/administration/branches/branch-service';

interface BranchOverviewPageProps {
  params: Promise<{ branchId: string }>;
}

export default async function BranchOverviewPage({ params }: BranchOverviewPageProps) {
  const { branchId } = await params;
  const [branch, selected, timeZone] = await Promise.all([
    load(getBranch(branchId)), // cached: the layout's read
    getCurrentContextProfile(),
    getOrganisationTimeZone(),
  ]);
  if (!branch.ok) return null; // the layout renders the failure or the guided state

  const record = branch.value;
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };
  const [index, assignments] = await Promise.all([
    record.parentBranchId ? getBranchIndex() : Promise.resolve(null),
    can(holder, 'branch_assignment.view')
      ? countActiveAssignments(branchId)
      : Promise.resolve(null),
  ]);
  const at = (iso: string) => {
    const when = formatInstant(iso, timeZone);
    return `${when.date} · ${when.time}`;
  };

  const items: DescriptionItem[] = [
    { label: 'Branch name', value: record.branchName },
    { label: 'Branch code', value: record.branchCode },
    { label: 'Type', value: branchTypeLabel(record.branchType) },
    { label: 'Status', value: <StatusChip value={record.status} /> },
    {
      label: 'Parent branch',
      value: record.parentBranchId ? (
        <Link component={NextLink} href={`/admin/branches/${record.parentBranchId}`}>
          {index?.get(record.parentBranchId)?.name ?? shortId(record.parentBranchId)}
        </Link>
      ) : (
        '—'
      ),
    },
    { label: 'Timezone', value: record.timezone },
    { label: 'Last status reason', value: record.statusReason ?? '—' },
    // Never set by the API today (BG-13) — shown only when present.
    ...(record.openedOn
      ? [{ label: 'Opened on', value: formatBusinessDate(record.openedOn, 'short') }]
      : []),
    ...(record.closedOn
      ? [{ label: 'Closed on', value: formatBusinessDate(record.closedOn, 'short') }]
      : []),
    ...(assignments === null ? [] : [{ label: 'Active assignments', value: String(assignments) }]),
    { label: `Created (${timeZone})`, value: at(record.createdAt) },
    { label: `Updated (${timeZone})`, value: at(record.updatedAt) },
    { label: 'Branch ID', value: <CopyIdButton value={record.id} label="Branch ID" /> },
  ];

  return (
    <SectionCard title="Branch details">
      <DescriptionList items={items} />
    </SectionCard>
  );
}
```

`app/(authenticated)/admin/branches/[branchId]/users/page.tsx`:

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentContextProfile } from '@/auth/context-service';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { SectionCard } from '@/components/data-display/section-card';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { load } from '@/lib/api/load';
import { getTenantUser } from '@/lib/api/lookups';
import { lastPageIfPastEnd, parsePaging } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import { shortId } from '@/lib/format';
import {
  canAssignUsers,
  canRevokeAssignments,
} from '@/modules/administration/branches/branch-rules';
import { getBranch, listBranchAssignments } from '@/modules/administration/branches/branch-service';
import { AssignBranchUserButton } from '@/modules/administration/branches/components/branch-user-actions';
import { BranchUsersTable } from '@/modules/administration/branches/components/branch-users-table';

export const metadata: Metadata = { title: 'Branch users' };

interface BranchUsersPageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BranchUsersPage({ params, searchParams }: BranchUsersPageProps) {
  const { branchId } = await params;
  const query = toSearchParams(await searchParams);
  const [branch, assignments, selected] = await Promise.all([
    load(getBranch(branchId)),
    load(listBranchAssignments(branchId, parsePaging(query, 10))),
    getCurrentContextProfile(),
  ]);
  if (!branch.ok) return null; // the layout renders the failure or the guided state
  const record = branch.value;
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };

  const card = (content: ReactNode) => (
    <SectionCard
      title="Branch users"
      description="Active assignments at this branch. Assignment types are labels; roles grant permissions."
      actions={
        canAssignUsers(record.status, holder) ? (
          <AssignBranchUserButton branchId={branchId} branchName={record.branchName} />
        ) : undefined
      }
    >
      {content}
    </SectionCard>
  );

  if (!assignments.ok) {
    return card(
      assignments.problem.code === 'forbidden' ? (
        <ForbiddenState />
      ) : (
        <ErrorState problem={assignments.problem} />
      ),
    );
  }
  const redirectPage = lastPageIfPastEnd(assignments.value.page);
  if (redirectPage !== null) {
    redirect(
      hrefWith(`/admin/branches/${branchId}/users`, query, {
        page: redirectPage === 0 ? null : String(redirectPage),
      }),
    );
  }

  // ponytail: one cached read per distinct visible user (≤ page size, BG-09 — assignment items
  // carry no names).
  const users = await Promise.all(
    [...new Set(assignments.value.items.map((row) => row.userId))].map((id) => getTenantUser(id)),
  );
  const byId = new Map(users.flatMap((user) => (user ? [[user.id, user] as const] : [])));

  return card(
    assignments.value.items.length === 0 ? (
      <EmptyState
        title="No users assigned"
        description="Assign users so they can work in this branch."
      />
    ) : (
      <>
        <BranchUsersTable
          canRevoke={canRevokeAssignments(holder)}
          rows={assignments.value.items.map((row) => ({
            assignmentId: row.id,
            name: byId.get(row.userId)?.displayName ?? shortId(row.userId),
            email: byId.get(row.userId)?.email ?? null,
            assignmentType: row.assignmentType,
          }))}
        />
        <TablePaginationBar page={assignments.value.page} />
      </>
    ),
  );
}
```

`app/(authenticated)/admin/branches/[branchId]/audit/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { toSearchParams } from '@/lib/api/query-string';
import { RecordAuditTab } from '@/modules/administration/audit/components/record-audit-tab';

export const metadata: Metadata = { title: 'Branch audit trail' };

interface BranchAuditPageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Branch assign/revoke are logged on the branch (contract §G), so one view covers them. */
export default async function BranchAuditPage({ params, searchParams }: BranchAuditPageProps) {
  const { branchId } = await params;
  return (
    <RecordAuditTab
      views={[
        {
          value: 'branch',
          label: 'Branch record',
          filter: { entityType: 'BRANCH', entityId: branchId },
        },
      ]}
      params={toSearchParams(await searchParams)}
      path={`/admin/branches/${branchId}/audit`}
    />
  );
}
```

Run (form T): `pnpm test:run modules/administration/branches`. Expected: PASS. Then run
`pnpm typecheck` (form G) once for the new routes.

- [ ] **Step 6: Commit** (form C)

`git add 'app/(authenticated)/admin/branches/[branchId]' modules/administration/branches/components/branch-lifecycle-actions.tsx modules/administration/branches/components/branch-lifecycle-actions.test.tsx modules/administration/branches/components/branch-user-actions.tsx modules/administration/branches/components/branch-users-table.tsx`

```
feat(branches): add the branch record with lifecycle actions, users, audit, and the guided state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 7: Fake API branches, assignments, user search, and the `branches` scenario

**Files:**

- Modify: `e2e/fake-api/state.mts` (`FakeBranch.draftedBy?`)
- Create: `e2e/fake-api/routes/branches.mts`
- Modify: `e2e/fake-api/routes/tenant-reads.mts` (`GET /tenant/users`)
- Modify: `e2e/fake-api/scenarios.mts` (`BRANCH_SCENARIO_IDS`, the `branches` builder)
- Modify: `e2e/fake-api/server.mts` (register `branchRoutes`, in its own commit)
- Create: `e2e/fake-api-branches.spec.ts`

**Interfaces:**

- Consumes:
  - 07: `sendIdempotent` (A2), `recordAuditEvent` (R);
  - 07b: `requirePermission(…, 'branch')`;
  - 03/06: `requireContext`, `requireTenantContext`, `objectBody`, `readBody`, `stringField`,
    `pageOf`, `problem`, `Violation`.
- Produces:
  - Fake routes:
    - `GET` and `POST /api/v1/branches/:id` (POST is create, on `/api/v1/branches`);
    - `POST /branches/:id/{submit,activate,suspend,reactivate,close}`;
    - `GET` and `POST /tenant/branch-assignments`, `DELETE /tenant/branch-assignments/:id`;
    - `GET /tenant/users`.
  - They mirror four backend behaviours: the branch-context 404, the maker-checker 403, the
    close/last-assignment 409, and `invalid_json` for unknown properties.
  - The scenario `branches` and `BRANCH_SCENARIO_IDS`.

- [ ] **Step 1: Write the failing fake spec**

`e2e/fake-api-branches.spec.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { BRANCH_SCENARIO_IDS, IDS } from './fake-api/scenarios.mts';

const FAKE_API_URL = `http://127.0.0.1:${process.env.FAKE_API_PORT ?? '3199'}`;
const api = (path: string) => `${FAKE_API_URL}/api/v1${path}`;

/** Headers for a fresh run: at one branch, or at institution level (`null`). */
async function contextFor(
  request: APIRequestContext,
  scenario: string,
  branchId: string | null,
): Promise<Record<string, string>> {
  const bearer = { Authorization: `Bearer e2e.${scenario}.${randomUUID()}` };
  const organisation = await request.post(api('/auth/select-organisation'), {
    headers: bearer,
    data: { organisation_id: IDS.greenfield },
  });
  const { context_token: institution } = (await organisation.json()) as { context_token: string };
  if (branchId === null) return { ...bearer, 'X-Active-Organisation-Context': institution };
  const branch = await request.post(api('/auth/select-branch'), {
    headers: { ...bearer, 'X-Active-Organisation-Context': institution },
    data: { branch_id: branchId },
  });
  const { context_token: pinned } = (await branch.json()) as { context_token: string };
  return { ...bearer, 'X-Active-Organisation-Context': pinned };
}

test.describe('fake API branches (contract §E.3–§E.4)', () => {
  test('hides every other branch from a branch-selected context (BG-03)', async ({ request }) => {
    const atHeadOffice = await contextFor(request, 'default', IDS.headOffice);
    const own = await request.get(api(`/branches/${IDS.headOffice}`), { headers: atHeadOffice });
    expect(own.status()).toBe(200);
    expect(await own.json()).toMatchObject({
      branch_code: 'HEAD_OFFICE',
      address: {},
      opened_on: null,
      closed_on: null,
    });
    expect(
      (await request.get(api(`/branches/${IDS.westlands}`), { headers: atHeadOffice })).status(),
    ).toBe(404);
    expect(
      (
        await request.get(api(`/tenant/branch-assignments?branch_id=${IDS.westlands}`), {
          headers: atHeadOffice,
        })
      ).status(),
    ).toBe(404);

    const institution = await contextFor(request, 'default', null);
    expect(
      (await request.get(api(`/branches/${IDS.westlands}`), { headers: institution })).status(),
    ).toBe(200);
  });

  test('records the drafter and refuses their own activation (maker-checker)', async ({
    request,
  }) => {
    const headers = await contextFor(request, 'branches', null);
    const created = await request.post(api('/branches'), {
      headers,
      data: {
        branch_code: 'NAIROBI_CBD',
        branch_name: 'Nairobi CBD Branch',
        branch_type: 'OPERATIONS',
        parent_branch_id: null,
        timezone: 'Africa/Nairobi',
      },
    });
    expect(created.status()).toBe(201);
    const { branch_id: branchId } = (await created.json()) as { branch_id: string };

    expect(
      (await request.post(api(`/branches/${branchId}/submit`), { headers, data: {} })).status(),
    ).toBe(200);
    const own = await request.post(api(`/branches/${branchId}/activate`), { headers, data: {} });
    expect(own.status()).toBe(403);
    expect(await own.json()).toMatchObject({ code: 'forbidden' });

    const drafts = await request.get(
      api(
        `/tenant/audit-events?entity_type=BRANCH&entity_id=${branchId}&action=branch.create_draft`,
      ),
      { headers },
    );
    expect(await drafts.json()).toMatchObject({ items: [{ actor_id: IDS.jane }] });
    expect(
      (
        await request.post(api(`/branches/${BRANCH_SCENARIO_IDS.thikaRoad}/activate`), {
          headers,
          data: {},
        })
      ).status(),
    ).toBe(200);
  });

  test("guards close and a staff member's last assignment", async ({ request }) => {
    const headers = await contextFor(request, 'branches', null);
    expect(
      (
        await request.post(api(`/branches/${IDS.westlands}/close`), {
          headers,
          data: { reason: 'Relocating' },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await request.delete(
          api(`/tenant/branch-assignments/${BRANCH_SCENARIO_IDS.maryAtWestlands}`),
          { headers },
        )
      ).status(),
    ).toBe(409);
    const revoked = await request.delete(
      api(`/tenant/branch-assignments/${BRANCH_SCENARIO_IDS.peterAtWestlands}`),
      { headers },
    );
    expect(await revoked.json()).toMatchObject({ status: 'REVOKED' });
  });

  test('rejects unknown properties and searches tenant users', async ({ request }) => {
    const headers = await contextFor(request, 'branches', null);
    const camel = await request.post(api('/branches'), { headers, data: { branchCode: 'X1' } });
    expect(camel.status()).toBe(400);
    expect(await camel.json()).toMatchObject({ code: 'invalid_json' });

    const users = await request.get(api('/tenant/users?q=peter'), { headers });
    expect(await users.json()).toMatchObject({
      items: [
        {
          id: BRANCH_SCENARIO_IDS.peter,
          display_name: 'Peter Otieno',
          membership_status: 'ACTIVE',
        },
      ],
      page: { total_items: 1 },
    });
  });
});
```

Run (form E): `e2e/fake-api-branches.spec.ts`. Expected: FAIL (routes, scenario and IDs are
missing).

- [ ] **Step 2: Extend the state**

`e2e/fake-api/state.mts`, in `FakeBranch` after `updatedAt`:

```ts
  /** Maker-checker only (activate ≠ drafter); the real API keeps the drafter in the audit log. */
  draftedBy?: string;
```

- [ ] **Step 3: Implement `e2e/fake-api/routes/branches.mts`**

```ts
import { randomUUID } from 'node:crypto';
import { requireContext, requirePermission, requireTenantContext } from '../access.mts';
import type { AccessContext } from '../access.mts';
import { recordAuditEvent } from '../audit-log.mts';
import { objectBody, pageOf, problem, readBody, sendJson, stringField } from '../http.mts';
import type { Violation } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { route } from '../router.mts';
import type { Route, RouteContext } from '../router.mts';
import type { FakeBranch, FakeBranchAssignment } from '../state.mts';

const BRANCH_CODE = /^[A-Z0-9_-]{2,20}$/;
const ASSIGNMENT_TYPES = ['HOME', 'OPERATE', 'APPROVE', 'VIEW'];
const NEED_A_BRANCH = ['STAFF', 'ADMIN'];

const branchNotFound = () => problem(404, 'resource_not_found', 'Branch not found.');

function tenantAccess(context: RouteContext): AccessContext {
  const access = requireContext(context);
  requireTenantContext(access);
  return access;
}

/** Contract §E.4 / BG-03: with a branch selected, every other branch is a 404. */
function reachableBranch(access: AccessContext, branchId: string): FakeBranch {
  const branch = access.state.branches.find(
    (candidate) => candidate.id === branchId && candidate.organisationId === access.organisation.id,
  );
  if (!branch || (access.claims.branchId !== null && access.claims.branchId !== branchId)) {
    throw branchNotFound();
  }
  return branch;
}

const detailWire = (branch: FakeBranch) => ({
  id: branch.id,
  organisation_id: branch.organisationId,
  branch_code: branch.code,
  branch_name: branch.name,
  branch_type: branch.type,
  parent_branch_id: branch.parentBranchId,
  status: branch.status,
  timezone: branch.timezone,
  address: {}, // stored, never returned (BG-13)
  opened_on: null, // never set by the API (BG-13)
  closed_on: null,
  status_reason: branch.statusReason,
  created_at: branch.createdAt,
  updated_at: branch.updatedAt,
});

const assignmentWire = (row: FakeBranchAssignment) => ({
  id: row.id,
  user_id: row.userId,
  branch_id: row.branchId,
  assignment_type: row.type,
  status: row.status,
});

function reasonField(body: Record<string, unknown>, required: boolean): string | null {
  const reason = stringField(body, 'reason', { required });
  if (required && (reason === null || reason.trim().length < 3 || reason.length > 500)) {
    throw problem(400, 'validation_failed', 'Validation failed.', [
      { field: 'reason', code: 'Size', message: 'size must be between 3 and 500' },
    ]);
  }
  return reason;
}

type Guard = (access: AccessContext, branch: FakeBranch) => void;

const makerChecker: Guard = (access, branch) => {
  if (branch.draftedBy === access.claims.userId) {
    throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
  }
};

const nothingActiveBelow: Guard = (access, branch) => {
  const assigned = access.state.branchAssignments.some(
    (row) => row.branchId === branch.id && row.status === 'ACTIVE',
  );
  const activeChild = access.state.branches.some(
    (candidate) => candidate.parentBranchId === branch.id && candidate.status === 'ACTIVE',
  );
  if (assigned || activeChild) {
    throw problem(409, 'conflict', 'Branch still has active assignments or active child branches.');
  }
};

function transition(
  path: string,
  permission: string,
  from: readonly string[],
  to: string,
  action: string,
  reasonRequired: boolean,
  guard: Guard = () => undefined,
): Route {
  return route('POST', `/api/v1/branches/:branch_id/${path}`, async (context) => {
    const access = tenantAccess(context);
    const branch = reachableBranch(access, context.params.branch_id ?? '');
    requirePermission(access, permission, 'branch');
    requirePermission(access, 'branch.view', 'branch'); // read-back (BG-31)
    const raw = await readBody(context.req);
    // Submit/Activate/Reactivate bodies are optional; Suspend/Close need a reason (contract §D).
    const body = raw === undefined && !reasonRequired ? {} : objectBody(raw, ['reason']);
    const reason = reasonField(body, reasonRequired);
    sendIdempotent(context, body, () => {
      if (!from.includes(branch.status)) {
        throw problem(409, 'conflict', `The branch must be ${from.join(' or ')}.`);
      }
      guard(access, branch);
      branch.status = to;
      branch.statusReason = reason; // overwritten by every transition (contract §C)
      branch.updatedAt = new Date().toISOString();
      recordAuditEvent(context.state, access, {
        entityType: 'BRANCH',
        entityId: branch.id,
        action,
        reason,
      });
      return detailWire(branch);
    });
  });
}

export const branchRoutes: Route[] = [
  route('GET', '/api/v1/branches/:branch_id', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'branch.view');
    sendJson(context.res, 200, detailWire(reachableBranch(access, context.params.branch_id ?? '')));
  }),

  route('POST', '/api/v1/branches', async (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'branch.create');
    const body = objectBody(await readBody(context.req), [
      'branch_code',
      'branch_name',
      'branch_type',
      'parent_branch_id',
      'timezone',
      'address',
    ]);
    const code = stringField(body, 'branch_code', { required: true }) ?? '';
    const name = stringField(body, 'branch_name', { required: true }) ?? '';
    const type = stringField(body, 'branch_type', { required: true }) ?? '';
    const timezone = stringField(body, 'timezone', { required: true }) ?? '';
    const parentId = stringField(body, 'parent_branch_id', { required: false });
    const violations: Violation[] = [];
    if (!BRANCH_CODE.test(code)) {
      violations.push({
        field: 'branch_code',
        code: 'Pattern',
        message: 'must match "^[A-Z0-9_-]{2,20}$"',
      });
    }
    if (name.trim().length < 2 || name.length > 100) {
      violations.push({
        field: 'branch_name',
        code: 'Size',
        message: 'size must be between 2 and 100',
      });
    }
    if (violations.length > 0) {
      throw problem(400, 'validation_failed', 'Validation failed.', violations);
    }
    sendIdempotent(
      context,
      body,
      () => {
        const { branches } = context.state;
        if (branches.some((c) => c.organisationId === access.organisation.id && c.code === code)) {
          throw problem(409, 'conflict', 'A branch with this code already exists.');
        }
        if (
          parentId !== null &&
          !branches.some((c) => c.id === parentId && c.organisationId === access.organisation.id)
        ) {
          throw problem(404, 'resource_not_found', 'Parent branch not found.');
        }
        const now = new Date().toISOString();
        const created: FakeBranch = {
          id: randomUUID(),
          organisationId: access.organisation.id,
          code,
          name,
          type,
          status: 'DRAFT',
          timezone,
          parentBranchId: parentId,
          statusReason: null,
          createdAt: now,
          updatedAt: now,
          draftedBy: access.claims.userId,
        };
        branches.push(created);
        recordAuditEvent(context.state, access, {
          entityType: 'BRANCH',
          entityId: created.id,
          action: 'branch.create_draft',
          reason: null,
        });
        return { branch_id: created.id, status: 'DRAFT' };
      },
      201,
    );
  }),

  transition('submit', 'branch.create', ['DRAFT'], 'PENDING_APPROVAL', 'branch.submit', false),
  transition(
    'activate',
    'branch.activate',
    ['PENDING_APPROVAL'],
    'ACTIVE',
    'branch.activate',
    false,
    makerChecker,
  ),
  transition('suspend', 'branch.suspend', ['ACTIVE'], 'SUSPENDED', 'branch.suspend', true),
  transition(
    'reactivate',
    'branch.reactivate',
    ['SUSPENDED'],
    'ACTIVE',
    'branch.reactivate',
    false,
  ),
  transition(
    'close',
    'branch.close',
    ['ACTIVE', 'SUSPENDED'],
    'CLOSED',
    'branch.close',
    true,
    nothingActiveBelow,
  ),

  route('GET', '/api/v1/tenant/branch-assignments', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'branch_assignment.view', 'branch');
    const requested = context.query.get('branch_id');
    const selected = access.claims.branchId;
    // With a branch selected the search is forced to it; asking for another is a 404 (BG-03).
    if (selected !== null && requested && requested !== selected) throw branchNotFound();
    const branchId = selected ?? requested;
    const type = context.query.get('assignment_type');
    const status = context.query.get('status');
    const rows = context.state.branchAssignments.filter(
      (row) =>
        row.organisationId === access.organisation.id &&
        (!branchId || row.branchId === branchId) &&
        (!type || row.type === type) &&
        (!status || row.status === status),
    );
    sendJson(context.res, 200, pageOf(rows.map(assignmentWire), context.query));
  }),

  route('POST', '/api/v1/tenant/branch-assignments', async (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'user.assign_branch');
    requirePermission(access, 'branch_assignment.view', 'branch');
    const body = objectBody(await readBody(context.req), [
      'user_id',
      'branch_id',
      'assignment_type',
    ]);
    const userId = stringField(body, 'user_id', { required: true }) ?? '';
    const type = stringField(body, 'assignment_type', { required: true }) ?? '';
    if (!ASSIGNMENT_TYPES.includes(type)) {
      throw problem(400, 'invalid_json', 'Malformed request body.');
    }
    const branch = reachableBranch(
      access,
      stringField(body, 'branch_id', { required: true }) ?? '',
    );
    sendIdempotent(
      context,
      body,
      () => {
        const { state } = context;
        const member = state.memberships.find(
          (m) => m.userId === userId && m.organisationId === access.organisation.id,
        );
        if (!member) throw problem(404, 'resource_not_found', 'User not found.');
        if (branch.status !== 'ACTIVE' || member.status === 'REVOKED') {
          throw problem(
            409,
            'conflict',
            'The branch or the membership does not allow new assignments.',
          );
        }
        // One ACTIVE row per (user, branch, type): a repeat returns the existing row.
        const existing = state.branchAssignments.find(
          (row) =>
            row.userId === userId &&
            row.branchId === branch.id &&
            row.type === type &&
            row.status === 'ACTIVE',
        );
        if (existing) return assignmentWire(existing);
        const created: FakeBranchAssignment = {
          id: randomUUID(),
          organisationId: access.organisation.id,
          userId,
          branchId: branch.id,
          type,
          status: 'ACTIVE',
        };
        state.branchAssignments.push(created);
        recordAuditEvent(state, access, {
          entityType: 'BRANCH',
          entityId: branch.id,
          action: 'branch.assign_user',
          reason: null,
        });
        return assignmentWire(created);
      },
      201,
    );
  }),

  route('DELETE', '/api/v1/tenant/branch-assignments/:assignment_id', (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'user.revoke_branch');
    requirePermission(access, 'branch_assignment.view', 'branch');
    const { state } = context;
    const row = state.branchAssignments.find(
      (candidate) =>
        candidate.id === context.params.assignment_id &&
        candidate.organisationId === access.organisation.id,
    );
    if (!row) throw problem(404, 'resource_not_found', 'Branch assignment not found.');
    reachableBranch(access, row.branchId);
    sendIdempotent(context, {}, () => {
      if (row.status !== 'ACTIVE')
        throw problem(409, 'conflict', 'The assignment is already revoked.');
      const member = state.memberships.find(
        (m) => m.userId === row.userId && m.organisationId === row.organisationId,
      );
      const others = state.branchAssignments.some(
        (c) =>
          c.id !== row.id &&
          c.userId === row.userId &&
          c.organisationId === row.organisationId &&
          c.status === 'ACTIVE',
      );
      if (member && NEED_A_BRANCH.includes(member.type) && !others) {
        throw problem(
          409,
          'conflict',
          "A staff or admin member's last branch assignment can't be revoked.",
        );
      }
      row.status = 'REVOKED';
      recordAuditEvent(state, access, {
        entityType: 'BRANCH',
        entityId: row.branchId,
        action: 'branch.revoke_user',
        reason: null,
      });
      // ponytail: summary fields only; the real API returns BranchAssignmentDetail and the UI
      // ignores the body.
      return assignmentWire(row);
    });
  }),
];
```

- [ ] **Step 4: Add `GET /tenant/users` to `routes/tenant-reads.mts`**

Append to `tenantReadRoutes`:

```ts
  route('GET', '/api/v1/tenant/users', (context) => {
    const access = requireContext(context);
    requireTenantContext(access);
    requirePermission(access, 'user.view');
    const { query, state } = context;
    const q = query.get('q')?.toLowerCase();
    const userStatus = query.get('user_status');
    const membershipStatus = query.get('membership_status');
    const rows = state.memberships
      .filter((membership) => membership.organisationId === access.organisation.id)
      .flatMap((membership) => {
        const user = state.users.find((candidate) => candidate.id === membership.userId);
        return user ? [{ user, membership }] : [];
      })
      .filter(
        ({ user, membership }) =>
          (!q ||
            [user.username, user.email, user.displayName].some((value) =>
              value.toLowerCase().includes(q),
            )) &&
          (!userStatus || user.status === userStatus) &&
          (!membershipStatus || membership.status === membershipStatus),
      )
      // ponytail: "newest user first" = reverse seed order; the fake keeps no user creation time.
      .reverse()
      .map(({ user, membership }) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.displayName,
        user_status: user.status,
        membership_status: membership.status,
      }));
    sendJson(context.res, 200, pageOf(rows, query));
  }),
```

- [ ] **Step 5: Add the `branches` scenario to `scenarios.mts`**

Add `FakeAuditEvent` to the type imports if it's missing. Above `BUILDERS`:

```ts
/** Layer 08 seed IDs (lane rules §5). */
export const BRANCH_SCENARIO_IDS = {
  mary: '08000000-0000-4000-8000-000000000001',
  peter: '08000000-0000-4000-8000-000000000002',
  maryMembership: '08000000-0000-4000-8000-000000000003',
  peterMembership: '08000000-0000-4000-8000-000000000004',
  karen: '08000000-0000-4000-8000-000000000005',
  thikaRoad: '08000000-0000-4000-8000-000000000006',
  kisumu: '08000000-0000-4000-8000-000000000007',
  oldTown: '08000000-0000-4000-8000-000000000008',
  maryAtWestlands: '08000000-0000-4000-8000-000000000009',
  peterAtWestlands: '08000000-0000-4000-8000-00000000000a',
  peterAtHeadOffice: '08000000-0000-4000-8000-00000000000b',
  thikaRoadDraftEvent: '08000000-0000-4000-8000-00000000000c',
  karenDraftEvent: '08000000-0000-4000-8000-00000000000d',
} as const;

/** Codes the real TENANT_ADMIN holds (contract §J) that `default` deliberately leaves out: 07b's
 * scope spec uses `branch.suspend` as a branch-only code there, so only this scenario grants them. */
const BRANCH_ADMIN_CODES = [
  'branch.create',
  'branch.activate',
  'branch.suspend',
  'branch.reactivate',
  'branch.close',
  'user.assign_branch',
  'user.revoke_branch',
];

function branchDraftEvent(
  id: string,
  branchId: string,
  actorUserId: string,
  occurredAt: string,
): FakeAuditEvent {
  return {
    id,
    organisationId: IDS.greenfield,
    occurredAt,
    actorUserId,
    actorType: 'USER',
    branchId: null,
    entityType: 'BRANCH',
    entityId: branchId,
    action: 'branch.create_draft',
    outcome: 'SUCCESS',
    severity: 'INFO',
    reason: null,
    beforeJson: null,
    afterJson: '{"status":"DRAFT"}',
    metadataJson: '{}',
  };
}

/**
 * Layer 08: a copy of `default` plus two staff members, one branch per lifecycle state, and
 * Westlands assignments — Mary's HOME is her only one (the last-assignment 409), Peter also holds
 * Head Office. Thika Road was drafted by Mary (so Jane may activate it); Karen by Jane.
 */
function branchesScenario(): RunState {
  const state = greenfieldTenant();
  const ids = BRANCH_SCENARIO_IDS;
  const person = (id: string, username: string, displayName: string): FakeUser => ({
    id,
    username,
    email: `${username}@greenfield.example`,
    displayName,
    status: 'ACTIVE',
    keycloakSubject: `e2e-${username}`,
  });
  const staff = (id: string, userId: string): FakeMembership => ({
    ...membership(id, IDS.greenfield, userId),
    type: 'STAFF',
  });
  const extra = (
    id: string,
    code: string,
    name: string,
    overrides: Partial<FakeBranch>,
  ): FakeBranch => ({
    ...branch(id, IDS.greenfield, code, name, 'OPERATIONS'),
    ...overrides,
  });
  return {
    ...state,
    users: [
      ...state.users,
      person(ids.mary, 'mary.wanjiku', 'Mary Wanjiku'),
      person(ids.peter, 'peter.otieno', 'Peter Otieno'),
    ],
    memberships: [
      ...state.memberships,
      staff(ids.maryMembership, ids.mary),
      staff(ids.peterMembership, ids.peter),
    ],
    branches: [
      ...state.branches,
      extra(ids.karen, 'KAREN', 'Karen Branch', {
        status: 'DRAFT',
        draftedBy: IDS.jane,
        createdAt: '2026-09-01T08:00:00Z',
      }),
      extra(ids.thikaRoad, 'THIKA_ROAD', 'Thika Road Branch', {
        status: 'PENDING_APPROVAL',
        draftedBy: ids.mary,
        parentBranchId: IDS.headOffice,
        createdAt: '2026-09-02T08:00:00Z',
      }),
      extra(ids.kisumu, 'KISUMU', 'Kisumu Branch', {
        status: 'SUSPENDED',
        statusReason: 'Cash audit in progress',
        createdAt: '2026-08-01T08:00:00Z',
      }),
      // A long name: the 375 px a11y cases prove it never scrolls the page (index item 4).
      extra(
        ids.oldTown,
        'OLD_TOWN',
        'Old Town Branch — Moi Avenue, Tom Mboya Street and River Road Customer Service Centre',
        {
          status: 'CLOSED',
          statusReason: 'Merged into Westlands',
          createdAt: '2026-07-15T08:00:00Z',
        },
      ),
    ],
    branchAssignments: [
      ...state.branchAssignments,
      assignment(ids.maryAtWestlands, IDS.greenfield, ids.mary, IDS.westlands, 'HOME'),
      assignment(ids.peterAtWestlands, IDS.greenfield, ids.peter, IDS.westlands, 'OPERATE'),
      assignment(ids.peterAtHeadOffice, IDS.greenfield, ids.peter, IDS.headOffice, 'HOME'),
    ],
    roles: state.roles.map((candidate) => ({
      ...candidate,
      permissions: [...candidate.permissions, ...BRANCH_ADMIN_CODES],
    })),
    auditEvents: [
      ...state.auditEvents,
      branchDraftEvent(ids.thikaRoadDraftEvent, ids.thikaRoad, ids.mary, '2026-09-02T08:00:00Z'),
      branchDraftEvent(ids.karenDraftEvent, ids.karen, IDS.jane, '2026-09-01T08:00:00Z'),
    ],
  };
}
```

Register it in `BUILDERS`: `branches: branchesScenario,`. `FakeApiScenario` derives from
`BUILDERS`, so `e2e/support/auth.ts` is untouched.

Run (form E): `e2e/fake-api-branches.spec.ts`. Expected: still FAIL; the routes aren't
registered yet.

- [ ] **Step 6: Commit the fake** (form C)

First run `pnpm exec prettier --write e2e/fake-api` (form T's flock prefix). lint-staged's globs
skip `.mts` files, but the hook's `pnpm check` (`prettier --check .`) covers them, and several
lines above exceed the 100-column `printWidth`. Then stage:

`git add e2e/fake-api/state.mts e2e/fake-api/routes/branches.mts e2e/fake-api/routes/tenant-reads.mts e2e/fake-api/scenarios.mts e2e/fake-api-branches.spec.ts`

```
test(fake-api): add branch lifecycle, assignment, and user search routes with a branches scenario

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

- [ ] **Step 7: Register the routes, in their own commit** (form C)

`e2e/fake-api/server.mts`: import `branchRoutes` from `./routes/branches.mts` and append
`...branchRoutes,` to `routes`.

Run (form E): `e2e/fake-api-branches.spec.ts e2e/fake-api.spec.ts e2e/fake-api-access.spec.ts`.
Expected: PASS.

Run `pnpm exec prettier --write e2e/fake-api` (form T's flock prefix) again, as in Step 6, then:

`git add e2e/fake-api/server.mts`

```
test(fake-api): register the branch routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 8: E2E, accessibility, docs, and gates

**Files:**

- Create: `e2e/branches.spec.ts`
- Modify: `README.md`, `AGENTS.md`

- [ ] **Step 1: Write `e2e/branches.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test';
import {
  A11Y_CASES,
  applyA11yCase,
  enterAdmin,
  expectA11yCaseApplied,
  expectNoSeriousOrCriticalViolations,
} from './support/admin';
import { authenticate, selectMuiOption } from './support/auth';
import { BRANCH_SCENARIO_IDS, IDS } from './fake-api/scenarios.mts';

const ALL_BRANCHES = /All branches \(institution level\)/;
const MAKER_CHECKER = 'You drafted this branch, so another administrator must activate it.';

async function openDirectory(page: Page, branch: RegExp | null = ALL_BRANCHES) {
  await enterAdmin(page, '/admin/branches', { heading: 'Branches', branch });
}

async function openRecord(page: Page, name: string) {
  await page
    .getByRole('table', { name: 'Branches' })
    .getByRole('link', { name, exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15000 });
}

/** A hero lifecycle action through its dialog; the caller asserts the outcome. */
async function lifecycle(page: Page, label: string, reason?: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
  const dialog = page.getByRole('dialog');
  if (reason) await dialog.getByRole('textbox', { name: /^Reason/ }).fill(reason);
  await dialog.getByRole('button', { name: label, exact: true }).click();
  return dialog;
}

const statusChip = (page: Page, value: string) => page.getByText(value, { exact: true }).first();
const rowsOf = (page: Page, table: string) =>
  page.getByRole('table', { name: table }).getByRole('row');

test.describe('branches', () => {
  // A branch route can be the first hit of its tree under a cold `next dev` compile.
  test.describe.configure({ timeout: 90000 });

  test('searches, filters, and sorts the directory through the URL', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'branches');
    await openDirectory(page);

    await expect(page.getByText('6 branches')).toBeVisible();
    await expect(rowsOf(page, 'Branches')).toHaveCount(7);

    await page.getByRole('searchbox', { name: 'Search' }).fill('west');
    await page.getByRole('searchbox', { name: 'Search' }).press('Enter');
    await expect(page).toHaveURL(/q=west/, { timeout: 15000 });
    await expect(rowsOf(page, 'Branches')).toHaveCount(2);

    // Wait for each cleared render (as audit.spec does): the next push builds on the rendered
    // query, and the sort headers' hrefs are server-built from it.
    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(page.getByText('6 branches')).toBeVisible({ timeout: 15000 });
    await selectMuiOption(page, 'Status', /^Suspended$/);
    await expect(page).toHaveURL(/status=SUSPENDED/, { timeout: 15000 });
    await expect(rowsOf(page, 'Branches').nth(1)).toContainText('Kisumu Branch');

    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(page.getByText('6 branches')).toBeVisible({ timeout: 15000 });
    const byName = page.getByRole('columnheader', { name: 'Branch', exact: true });
    await byName.getByRole('link').click();
    await expect(page).toHaveURL(/sortBy=branchName&sortDir=ASC/, { timeout: 15000 });
    await expect(byName).toHaveAttribute('aria-sort', 'ascending');
    await expect(rowsOf(page, 'Branches').nth(1)).toContainText('Head Office');
    await byName.getByRole('link').click();
    await expect(page).toHaveURL(/sortDir=DESC/, { timeout: 15000 });
    await expect(rowsOf(page, 'Branches').nth(1)).toContainText('Westlands Branch');
  });

  test('creates a draft, submits it, and blocks the drafter from activating it', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'branches');
    await openDirectory(page);

    await page.getByRole('link', { name: 'Create branch' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Create branch' })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('textbox', { name: 'Branch code' }).fill('nairobi cbd');
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(
      page.getByText('Use 2–20 capital letters, digits, underscores or hyphens.'),
    ).toBeVisible();

    await page.getByRole('textbox', { name: 'Branch code' }).fill('NAIROBI_CBD');
    await page.getByRole('textbox', { name: 'Branch name' }).fill('Nairobi CBD Branch');
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(page).toHaveURL(/\/admin\/branches\/[0-9a-f-]{36}$/, { timeout: 15000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Nairobi CBD Branch' })).toBeVisible();
    await expect(statusChip(page, 'Draft')).toBeVisible();

    const dialog = await lifecycle(page, 'Submit for approval');
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Submitted for approval' }),
    ).toBeVisible();
    await expect(statusChip(page, 'Pending approval')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activate', exact: true })).toBeDisabled();
    await expect(page.getByText(MAKER_CHECKER)).toBeVisible();
  });

  test('activates a branch another administrator drafted and shows it in the audit tab', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'branches');
    await openDirectory(page);
    await openRecord(page, 'Thika Road Branch');

    await lifecycle(page, 'Activate');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(statusChip(page, 'Active')).toBeVisible();

    await page.getByRole('tab', { name: 'Audit' }).click();
    await expect(page).toHaveURL(/\/audit$/, { timeout: 15000 });
    await expect(page.getByRole('table', { name: 'Audit events' })).toContainText(
      'Activated branch',
    );
  });

  test('suspends with a required reason, shows it, and reactivates', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'branches');
    await openDirectory(page);
    await openRecord(page, 'Westlands Branch');

    await lifecycle(page, 'Suspend', 'Cash count');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(statusChip(page, 'Suspended')).toBeVisible();
    await expect(page.getByText('Cash count')).toBeVisible();

    await lifecycle(page, 'Reactivate');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(statusChip(page, 'Active')).toBeVisible();
  });

  test('explains a blocked close and closes a branch with nothing assigned', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'branches');
    await openDirectory(page);
    await openRecord(page, 'Westlands Branch');

    const blocked = await lifecycle(page, 'Close branch', 'Relocating');
    await expect(blocked.getByRole('alert')).toContainText(
      "can't be closed while users are assigned",
    );
    await blocked.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('link', { name: 'Back to branches' }).click();
    await openRecord(page, 'Kisumu Branch');
    await lifecycle(page, 'Close branch', 'Consolidated into Westlands');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(statusChip(page, 'Closed')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reactivate' })).toHaveCount(0);
  });

  test('assigns and revokes branch users, and explains a last assignment', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'branches');
    await openDirectory(page);
    await openRecord(page, 'Westlands Branch');
    await page.getByRole('tab', { name: 'Users' }).click();
    await expect(rowsOf(page, 'Branch users')).toHaveCount(4, { timeout: 15000 }); // header + 3

    await page.getByRole('button', { name: 'Assign user' }).click();
    const drawer = page.getByRole('dialog', { name: 'Assign a user' });
    await drawer.getByRole('combobox', { name: /^User/ }).fill('peter');
    await page.getByRole('option', { name: /Peter Otieno/ }).click();
    await selectMuiOption(page, 'Assignment type', /^Approve$/);
    await drawer.getByRole('button', { name: 'Assign user' }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole('alert').filter({ hasText: 'User assigned' })).toBeVisible();
    await expect(rowsOf(page, 'Branch users')).toHaveCount(5);

    await page.getByRole('button', { name: "Revoke Peter Otieno's Operate assignment" }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(rowsOf(page, 'Branch users')).toHaveCount(4);

    await page.getByRole('button', { name: "Revoke Mary Wanjiku's Home assignment" }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
      'last branch assignment',
    );
  });

  test('guides a branch context to All branches for another branch', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'branches');
    await openDirectory(page, /Head Office/);

    await page.goto(`/admin/branches/${BRANCH_SCENARIO_IDS.thikaRoad}`);
    await expect(page.getByText('Switch to All branches to manage this branch')).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'Switch to All branches' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Switched to Greenfield SACCO · All branches' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Thika Road Branch' })).toBeVisible({
      timeout: 15000,
    });
  });

  test('suspending the working branch sends the user back to context selection (index item 1)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'branches');
    await openDirectory(page, /Westlands/);
    await openRecord(page, 'Westlands Branch');

    await page.getByRole('button', { name: 'Suspend', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('You are working in this branch');
    await dialog.getByRole('textbox', { name: /^Reason/ }).fill('Cash count');
    await dialog.getByRole('button', { name: 'Suspend', exact: true }).click();
    // The selected branch left ACTIVE, so its context token is now invalid (contract §E.4): the
    // refresh must land on context selection, never an error page.
    await expect(page).toHaveURL(/\/select-context/, { timeout: 15000 });
  });

  test('offers no mutations without the permissions', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo); // default: branch reads only
    await openDirectory(page);

    await expect(page.getByRole('link', { name: 'Branches', exact: true })).toBeVisible(); // rail
    await expect(page.getByRole('link', { name: 'Create branch' })).toHaveCount(0);
    await openRecord(page, 'Westlands Branch');
    await expect(page.getByRole('button', { name: /^(Suspend|Close branch)$/ })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Users' }).click();
    await expect(rowsOf(page, 'Branch users')).toHaveCount(2, { timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Assign user' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Revoke/ })).toHaveCount(0);

    await page.goto('/admin/branches/new');
    await expect(page.getByText("You don't have permission")).toBeVisible({ timeout: 15000 });
  });

  for (const a11yCase of A11Y_CASES) {
    test(`has no serious or critical accessibility violations (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
      context,
      page,
    }, testInfo) => {
      await applyA11yCase(page, a11yCase);
      await authenticate(context, testInfo, 'branches');
      await openDirectory(page);
      await expectA11yCaseApplied(page, a11yCase);
      await expectNoSeriousOrCriticalViolations(page);

      for (const [path, heading] of [
        ['/admin/branches/new', 'Create branch'],
        [`/admin/branches/${BRANCH_SCENARIO_IDS.oldTown}`, /^Old Town Branch/],
        [`/admin/branches/${IDS.westlands}/users`, 'Westlands Branch'],
      ] as const) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
          timeout: 15000,
        });
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);
      }

      await page.getByRole('button', { name: 'Assign user' }).click();
      await expect(page.getByRole('dialog', { name: 'Assign a user' })).toBeVisible();
      await expectNoSeriousOrCriticalViolations(page);
    });
  }
});
```

In the default scenario Westlands has one assignment (Jane's OPERATE), so the gating test expects
`header + 1`.

Run (form E): `e2e/branches.spec.ts e2e/fake-api-branches.spec.ts`. Expected: PASS. Fix any
failure at its root; never weaken an assertion.

- [ ] **Step 2: Document the layer**

`README.md`, in "Directory structure":

- Under `admin/`:

  ```
  │   ├── branches/              # Branch directory (search, status/type filters, sortable headers),
  │   │                            # create draft (new/), and the record ([branchId]/: layout hero +
  │   │                            # lifecycle actions; Overview, Users, and Audit tabs)
  ```

- After the `api/context/` line: `├── api/tenant/users/ # Same-origin user search for UserPicker (first page only)`.
- Replace the `data-display/` note with: "Reusable list and record building blocks: ListToolbar
  (search/select/datetime), TablePaginationBar, StatusChip, DescriptionList, TruncatedText,
  EmptyState, ErrorState, useListNavigation; the record kit (layer 07b) RecordHero, RecordTabs
  (link tabs as nested routes), CopyIdButton, ForbiddenState/BranchContextState, ConfirmDialog;
  SectionCard and ReasonDialog (07); AssignmentDrawer (08)". This is the 07b kit's README entry,
  which 08 owns.
- `lib/`: add `apply-field-errors.ts` ("Server Action fieldErrors → React Hook Form"), and
  `list-sort.ts` ("URL sort allow-list") under `api/`.
- `modules/administration/`: add `branches/` (contract, list query, lifecycle rules, service,
  Server Actions, components) and `users/` ("tenant user search for pickers").

`AGENTS.md`, directly below 07's mutation rule:

```md
- Multi-field forms use React Hook Form with the zod resolver and merge a Server Action's
  `fieldErrors` back with `applyFieldErrors` (`lib/apply-field-errors.ts`). Dialogs with one or
  two fields keep `useActionState` + native constraints. Name specific guard failures (a 409/403
  with a known cause) in the action, never with a raw backend message.
```

Run `pnpm exec prettier --write README.md AGENTS.md e2e` (under the lock, form T's flock prefix).

- [ ] **Step 3: Commit** (form C)

`git add e2e/branches.spec.ts README.md AGENTS.md`

```
test(e2e): cover the branch directory, draft, lifecycle, assignments, guided state, and a11y

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

- [ ] **Step 4: Gates** (build workflow's gate phase; **not an implementer step**)

The implementer's task ends with Step 3's commit and Step 5's ledger notes. It runs none of this:
v3 runs the full suite only at gates and skips visual steps in tasks, and the gates must wait for
slot(07) (lane rules §8a).

The workflow's gate phase runs `pnpm check`, `pnpm build` and the full `pnpm test:e2e` (form G)
after slot(07), and records the gate evidence line (lane rules §2.8). The controller passes the
following to build(08) as its `visual` arg. Run the `ui-ux-pro-max` pre-delivery checklist on
these, in light and dark, at 1440 and 375 px:

- `/admin/branches`, `/new`;
- a record's three tabs;
- the assign drawer;
- the Suspend, Close and Revoke dialogs.

Then run a keyboard pass: sort headers, search (Enter), the tabs (arrow keys), the drawer's picker
(type, arrow, Enter) and Escape closing it. Every stop needs a visible, unclipped ring. The gate
phase records the results.

- [ ] **Step 5: Ledger**

- Write the Rulings above as `Ruling:` lines, plus any adaptation from the pre-flight.
- Record the flagged open question: who consumes the toolbar `search` kind (16).

---

### Task 9: Live check (controller with the user; batch L2 on the `ap-integration` tip containing F_08)

Only the controller in lane X runs this, at the L2 live batch, on the `ap-integration` tip that
contains F_08 (08's final SHA). The user signs in themselves; the agent never types credentials.
Follow the runbook §10 procedure (it wins over lane rules §9's fd-lock line):

- `git status --short` is empty. Take `git rev-parse refs/heads/ap-integration` and run
  `git switch --detach <that SHA>`, so the evidence is tied to an integrated SHA.
- `ss -ltn` shows 3100 free. Start plain `pnpm dev` in the background (non-E2E mode, no fake-API
  or E2E env vars, dev API through `.env.local`).
- Don't hold the heavy lock for the batch; it would stall both lanes' commits for hours. No X
  Playwright run while the server is up, so `reuseExistingServer` can't reuse it.
- Afterwards, stop the dev server, confirm 3100 is free, and `git switch` back to the lane.

- [ ] **Step 1: Reads** (no approval needed beyond the batch)

1. The directory shows dev's branches.
   - Try search by code and by name, each status, and the type filter.
   - Sort by **each** of the five fields in both directions. Any 500 means an allow-list drift:
     record it in the contract.
   - Pagination works.
2. A real branch's Overview shows:
   - parent and timezone;
   - the last status reason;
   - no address;
   - opened/closed on hidden while null;
   - the active-assignment count, and the ID copy control.
3. The Users tab lists assignments with resolved names and types. Open the assign drawer and type
   in the user search: results appear. Then **Cancel**, with no submit.
4. The Audit tab shows BRANCH events for that branch.
5. Guided state: select a single branch in the context dialog, open **another** branch's URL, and
   the guided state appears. Choose "Switch to All branches": the record appears.
6. Maker lookup: on any PENDING_APPROVAL branch, Activate is disabled for its drafter and enabled
   for anyone else.

- [ ] **Step 2: Mutations** (ask before **each** one; name what it permanently leaves on dev)

Run every mutation **at All branches**: suspending or closing the user's selected branch
invalidates their context. Use only a throwaway branch, code `ZZ08TEST`, name "ZZ Test Branch
(08)". Never touch a real branch's lifecycle.

1. **Create the draft.** This is permanent: there is no delete, withdraw or reject (BG-01).
2. **Submit.** The branch stays PENDING_APPROVAL for good unless someone activates it.
3. **Activate**, only if the user signs in as the second administrator (maker ≠ drafter, lane
   rules §9). As the drafter, first confirm Activate is disabled with the maker explanation. If
   no second identity is available, stop here and tell the user the draft stays pending on dev.
4. If the branch is ACTIVE: assign the second administrator (or the user) as VIEW, then revoke
   that one assignment. Never revoke a real STAFF or ADMIN member's last assignment.
5. **Suspend** (reason "Live check"), then **Reactivate**.
6. **Close** (reason "Live check cleanup"). Closing is terminal. It cleans up the branch and proves
   the close guard stays quiet when nothing is assigned.

- [ ] **Step 3: Record**

- **Never commit on `lane/08-branches` after F_08.** It is already integrated, so a commit there
  silently diverges from `ap-integration`.
- Park the findings in `RUN-STATE.md` for the next boundary:
  - contract surprises, for `docs/superpowers/specs/2026-09-25-admin-prototype-parity-api-contract.md`;
  - backend defects, for `docs/backend-gaps.md` as layer-scoped `BG-08a`, `BG-08b`, … (the
    controller renumbers them);
  - code fixes.
- The controller lands them on `admin-parity/08-branches` through the runbook's cascade
  procedure. It registers first (lane rules §7) and commits
  `docs(contract): record the layer 08 live check findings`.
- In the ledger, record the request IDs of every mutation, the SHA checked, and
  "live read + approved mutations: <list>".

---

## Self-review

- **Spec §10.3 coverage.**
  - Directory: Task 5.
  - Create draft (code pattern, name, type suggestions, parent, IANA timezone, no address): Tasks
    2 and 5.
  - Record tabs (Overview fields, Users with assign/revoke, Audit): Task 6.
  - Lifecycle by status and permission (maker ≠ drafter, reasons, close warning): Tasks 2, 3 and 6.
  - Submit/Activate at All branches: the guided state (Rulings 5 and 6).
  - Omitted, as the spec says: Operations and Controls tabs, edit, address.
- **Ownership (lane rules §3).**
  - Users search: fake route in Task 7; service, route handler and `UserPicker` in Task 4.
  - `AssignmentDrawer`: Task 4. `applyFieldErrors`: Task 3. Branch contract: Task 2.
  - The README entry for the 07b kit: Task 8.
  - No 07 or 07b file is modified. Kit changes would be additive `refactor(kit):` commits, and
    none is planned.
- **Shared registries.** Navigation (Task 5, Step 8) and the `server.mts` route list (Task 7,
  Step 7) each have one commit. `TENANT_ADMIN_PERMISSIONS`, `TONES` and the audit vocabulary are
  untouched.
