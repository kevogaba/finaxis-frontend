# PR 13: Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [plan index](./2026-09-25-admin-parity-00-index.md)
> and the [parallel lane rules](./2026-09-27-admin-parity-parallel-lanes.md) first.

**Goal:** Ship `/admin/settings`, the tenant settings catalogue (spec §10.7):

- **Locale & currency**: `default_timezone` and `base_currency`, with Edit (`PUT`) and Reset to
  default (`DELETE`), both taking an optional reason;
- **Controls**: the two maker-checker switches and auto-advance, read-only with honest labels;
- **Retention**: `audit_retention_days`, read-only ("Managed by the platform");
- **Other stored settings**: stored keys outside the catalogue, read-only and collapsed.

Editing ships behind `SETTINGS_EDIT_ENABLED`. It stays `false` unless the t0 live probe proved
`PUT /tenant/settings/{key}` works (BG-04: source reading says it always answers 500). Reset works
either way.

**Architecture:**

- `settings-contract.ts` holds the zod wire schema. `***REDACTED***` becomes `value: null` plus
  `redacted: true`, so the mask is never displayed or submitted.
- `settings-rules.ts` holds the catalogue: groups, labels, notes, value labels, which actions a row
  gets, option lists, and a local code → message mapper. It is pure and client-safe.
- `settings-flags.ts` holds the flag. It imports nothing, so the E2E spec can import it.
- `settings-actions.ts` holds two Server Actions on 07's `runServerAction`. `updateSetting`
  re-checks the flag, because a Server Action can be called directly.
- The page is a Server Component. It checks `settings.view` itself, reads one page (`size=100`),
  and renders the server `SettingsCatalogue`. Each editable row gets a small client
  `SettingActions`: two 07 `ReasonDialog`s that submit `key` (hidden) plus `value` for Edit.

**Tech Stack:** Next.js 16 Server Actions, React 19 `useActionState` (inside 07's `ReasonDialog`),
zod 4, MUI 9.4 (`Accordion` with an `h2` heading slot, `TextField select` native, `Tooltip
describeChild`), `Intl.supportedValuesOf` and `Intl.DisplayNames`, Vitest + RTL, Playwright + axe.

**Spec:** [`…-design.md`](../specs/2026-09-25-admin-prototype-parity-design.md):

- §4 D10 (unenforced settings), §6.4 (mutations), §6.6–6.7 (permissions, errors), §8 (nav order),
  §9 (`SectionCard`, `ReasonDialog`, `ForbiddenState`), §10.7, §16 item 5.
- Contract §C (`TenantSetting`), §D (`CreateOrUpdateTenantSetting`, `DeactivateTenantSetting`),
  §E.3 (the four settings endpoints), §H (the catalogue), §I (problem codes).
- Gaps: BG-04 (PUT 500), BG-12 (unenforced keys, no metadata, platform-only key).
- Backend source, read-only, cited in code comments:
  `/home/ogaba/finaxis/platform/src/main/kotlin/com/finaxis/platform/lifecycle/application/TenantSettingsService.kt`
  and `…/lifecycle/domain/TenantSettingCatalog.kt`.
  - `deactivate` (DELETE) runs `requireFunctionalCurrencyNotFrozen` too. So Reset on
    `base_currency` can return 409 `accounting.functional_currency_frozen` or `…_lock_timeout`.
  - An unknown key returns 422 `invalid_operation`.
  - In a tenant context the platform-only value is masked even when it is unset.

**Base:** F_07, the `ap-integration` tip when Y forks (it holds 06, 07b, 15 and 07), recorded in
`refs/lane-base/13-settings`.
**Branch:** `lane/13-settings` in lane Y. The controller registers it as
`admin-parity/13-settings`, between 07 and 08.
**Plan commit:** runbook §7 step 3 copies this file to
`docs/superpowers/plans/2026-09-27-admin-parity-13-settings.md` and commits it before the workflow
starts. It isn't a task here.

## Global Constraints

See the index and the lane rules. Additionally:

**Command forms** (lane Y; the runbook's §0). Every command below shows only the command part:

```
# T — focused unit tests (foreground)
flock -E 75 -w 240 /tmp/finaxis-e2e.lock env VITEST_MAX_WORKERS=3 pnpm test:run <paths>

# E — scoped E2E (run_in_background + log + Monitor). First, `ss -ltn '( sport = :3200 or sport = :3299 )'`
#     must show no listener you didn't start.
flock -E 75 -w 1800 /tmp/finaxis-e2e.lock env VITEST_MAX_WORKERS=3 PORT=3200 FAKE_API_PORT=3299 pnpm test:e2e <specs>

# P — prettier on the files you touched (foreground)
flock -E 75 -w 240 /tmp/finaxis-e2e.lock pnpm exec prettier --write <paths>

# C — commit (run_in_background + Monitor). Write the message to <your scratchpad>/commit-msg.txt
#     with the Write tool first. The husky wrapper locks the hook; never put git inside flock.
git add <whole files>
VITEST_MAX_WORKERS=3 git commit -F <your scratchpad>/commit-msg.txt

# G — gates: pnpm check, pnpm build, pnpm test:e2e (each run_in_background + Monitor)
flock -E 75 -w 1800 /tmp/finaxis-e2e.lock env VITEST_MAX_WORKERS=3 PORT=3200 FAKE_API_PORT=3299 <gate command>
```

Exit 75 means the lock wait timed out: retry, don't skip. If this layer moves to X (lane rules §7,
"Y failure path"), use the same forms with ports 3100/3199.

**Files 13 never touches:**

- `lib/api/problem.ts`. 07 owns it and X's 08 is in flight, so settings codes map locally.
- The index, `README.md`, `AGENTS.md`, `e2e/support/auth.ts`, the Playwright/Vitest configs and
  `test/*`.
- The frozen kit files: `ReasonDialog`, `SectionCard`, `runServerAction` and everything 07b owns.
- `lib/api/tenant-api.ts` and `auth/backend-api.ts`. A1 is 07's. The controller folds
  `apiDelete`'s optional body into it, and Task 1 checks it's there. 13 only consumes it.

**Disjointness with 08** (X builds 08 from F_07 while this lane builds 13; 13 integrates first, and
X's slot(08) rebases onto it):

| 13 touches                                                                                        | 08 (per the ownership table)                    | Resolution                        |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------- |
| `modules/administration/settings/**`, `app/(authenticated)/admin/settings/page.tsx` (new)         | —                                               | disjoint                          |
| `modules/administration/administration-navigation.ts` (adds Settings before Business date)        | adds Branches                                   | R2: spec §8 order, Branches first |
| `e2e/fake-api/state.mts`, `scenarios.mts`, `server.mts`                                           | users search, branch lifecycle state and routes | R3: union in stack order          |
| `e2e/fake-api/routes/settings.mts`, `e2e/fake-api-settings.spec.ts`, `e2e/settings.spec.ts` (new) | —                                               | disjoint                          |
| `docs/backend-gaps.md` (BG-04), the contract's §E.3 settings rows                                 | may record branch gaps and rows                 | R4: union                         |

**Seed data.**

- `tenantSettings` is a **new** RunState collection with default rows, which lane rules §5 allows.
  `baseCurrencyFrozen` is a new flag.
- Nothing is added to `greenfieldTenant()`'s existing collections.
- Rows are keyed by `key`, so this layer needs **no** `13000000-…` IDs.
- `TENANT_ADMIN_PERMISSIONS` gains `settings.update`, which the real TENANT_ADMIN holds (contract
  §J).

**Rulings to record in the ledger** (`Ruling:` lines):

1. **The flag.** `SETTINGS_EDIT_ENABLED` is `true` only if RUN-STATE records the t0
   `PUT /tenant/settings` probe as **PASS**. The runbook calls this batch L0; the lanes file and
   this layer's brief call it L1. It is the same probe.
   - PASS means a 200 response to a PUT that **sent an `Idempotency-Key`**, a body whose `key` and
     `value` match, and a follow-up read showing the value unchanged.
   - A keyless 200 proves nothing, because BG-04 lives on the idempotency path and the app always
     sends a key.
   - A 500, a probe that wasn't run, or an ambiguous result all mean `false`. Spec §10.7 and the
     critic default to disabled.
2. **Both dialogs are 07's `ReasonDialog`**, per 07's ruling that one- or two-field dialogs use
   native constraints plus server zod, not React Hook Form. `ConfirmDialog` (07b) has no reason
   field.
3. **Reset only on an editable key whose value isn't null.** Both editable keys default to null, so
   a non-null value is a stored one. The API has no `is_default` (BG-12).
4. **Controls, retention and stored extras are read-only** (D10). An extra's `value_type` is read
   as any string, because stored keys carry their own type.
5. **Setting problem codes map locally** in `withSettingProblem`, never in `lib/api/problem.ts`.
6. **One bounded read** (`size=100`, the backend maximum), with a caption if `hasNext`.
7. **The fake PUT implements the intended contract** (200), not BG-04. The app never calls PUT while
   the flag is off.
8. **No audit row from the fake settings routes.** `recordAuditEvent` (07's R) has no reader in this
   layer. `ponytail:` add one when a settings history view exists.
9. **The live check is X's** (runbook §10, L2). Y records "live read pending L2" in `LANE-B.md`. It
   gates publishing, not integration.

## Review Focus

Pins index items 4 (long values at 375 px, Task 5) and 5 (schema drift, Task 2). For index item 2,
13 pins only the successful reset replay (Task 5 fake spec). Retry after a failure is PR 07's
(Tasks 3, 4 and 6, as the index lists them): `ReasonDialog` keeps its key across a failed submit,
and `sendIdempotent` stores nothing when `produce` throws. Adds:

1. **PUT never reaches the backend while editing ships disabled**, not even through a direct Server
   Action call. Task 3 `settings-actions.test.ts` "never calls the backend…"; Task 5 E2E "ships
   editing disabled…".
2. **The redaction mask is never shown or submitted, and masked or platform-only keys never get
   actions.** Task 2 contract and rules tests; Task 4 `settings-catalogue.test.tsx`; Task 5 E2E.
3. **A frozen base currency is explained on Reset, not only on Edit**, because the backend guards
   both. Task 2 `withSettingProblem` test; Task 5 fake spec and the frozen-scenario E2E, which runs
   whatever the flag says.
4. **Only the two editable keys can be changed.** A read-only, platform-only or unknown key is
   refused before any backend call. Task 3 "refuses read-only or unknown keys…".
5. **An unfamiliar stored key never breaks the page.** Any `value_type` string is tolerated; a
   missing field or a wrong type renders the error state. Task 2 contract test.

---

### Task 1: Pre-flight

**Files:** none.

**Interfaces:**

- Consumes, at F_07 (read them in Y's own worktree on `lane/13-settings`, which only this lane moves):
  - 07: `runServerAction`, `ActionResult`, `FormAction` (`lib/api/action-result.ts`).
  - 07, A1 (`lib/api/tenant-api.ts`, `auth/backend-api.ts`):
    - `apiPut(path, body, idempotencyKey)`, which mirrors `apiPost`;
    - `apiDelete(path: string, idempotencyKey: string, body?: Record<string, unknown>)`, where
      `backendApi.delete` sends the body as JSON when one is present. 08 calls it with two
      arguments.
  - 07: `ReasonDialog` with `fields`; `SectionCard`.
  - 07, A2 (`e2e/fake-api/idempotency.mts`): `sendIdempotent(context, body, produce, status = 200)`.
    A replay sends back the stored status with `Idempotency-Replayed: true`, and a 204 replay has
    no body.
  - 07: the RunState fields 07 added.
  - 07b: `ForbiddenState` (`components/data-display/forbidden-state.tsx`); `enterAdmin`,
    `A11Y_CASES`, `applyA11yCase`, `expectA11yCaseApplied`, `expectNoSeriousOrCriticalViolations`
    (`e2e/support/admin.ts`); `requirePermission(access, code, scope = 'tenant')`.
- Produces: the flag value for Task 2, and `Ruling:` lines.

- [ ] **Step 1: Check each consumed item exists with the shape above**

```bash
grep -n "export async function api\(Put\|Delete\)" -A 8 lib/api/tenant-api.ts
grep -n "delete" -A 20 auth/backend-api.ts
# The whole function: the replay branch, not only the signature.
grep -n "export function sendIdempotent" -A 45 e2e/fake-api/idempotency.mts
grep -n "fields?:" components/data-display/reason-dialog.tsx
grep -n "export function \(ForbiddenState\|SectionCard\)" components/data-display/forbidden-state.tsx components/data-display/section-card.tsx
grep -n "^export" e2e/support/admin.ts
grep -n "export function requirePermission" -A 4 e2e/fake-api/access.mts
grep -n "requestSubmit" components/data-display/reason-dialog.test.tsx
grep -n "export interface RunState" -A 30 e2e/fake-api/state.mts
grep -n "href:" modules/administration/administration-navigation.ts
# Specs that count permission codes break when TENANT_ADMIN_PERMISSIONS gains settings.update
# (15 groups codes by prefix and sits below 13; X's slot(07) may already have adjusted its counts).
grep -rn -E "permission|settings\." e2e app/\(authenticated\)/profile modules/profile components/profile --include='*.ts' --include='*.tsx' 2>/dev/null | grep -E "toHaveCount|toHaveLength|\([0-9]+\)|[0-9]+ (codes|permissions)"
```

- Anything missing or renamed is an escalation to the controller (lane rules §6). Don't build a
  local copy.
- `apiPut` must take `(path, body, idempotencyKey)`. `apiDelete` must take
  `(path, idempotencyKey, body?)`, and `backendApi.delete` must send `JSON.stringify(body)` with
  `Content-Type: application/json` when a body is present. Escalate if any is missing, in a
  different order, or without the body. Never patch `lib/api/tenant-api.ts` or
  `auth/backend-api.ts` from this lane.
- `sendIdempotent` must store the status it produced, and a replay must send that status back
  with `Idempotency-Replayed: true`. A 204, first or replayed, must send no body. Task 5's
  replay test asserts all three. A replay hard-coded to 200, or a 204 sent as JSON, is an
  escalation.
- If `reason-dialog.test.tsx` carries a local `requestSubmit` polyfill, copy it into Task 4's
  `setting-actions.test.tsx`. Lane rules §4 say to keep polyfills local.
- If the permission-count grep finds an assertion tied to TENANT_ADMIN's codes, for example
  profile's "Settings (n)" group count, update it in Task 5's fake-API commit, because 13's seed
  change causes it. Add a `Ruling:` line for it.
- Compare Task 3's `reason` schema with the one in F_07's
  `modules/administration/business-date/business-date-actions.ts`. 07's final version passed lint,
  so if they differ, use 07's.

- [ ] **Step 2: Read the probe result and set the flag**

```bash
grep -n -i "settings.*probe\|probe.*settings\|PUT /tenant/settings" /home/ogaba/finaxis/finaxis-frontend/.claude/worktrees/admin-parity/.superpowers/sdd/RUN-STATE.md
```

Apply Ruling 1. Record the literal RUN-STATE line and the chosen value (`true`/`false`) in the
ledger. Task 2 writes that value.

### Task 2: Settings contract, catalogue rules, flag, and read

**Files (all under `modules/administration/settings/`):**

- Create: `settings-contract.ts`, `settings-contract.test.ts`
- Create: `settings-rules.ts`, `settings-rules.test.ts`
- Create: `settings-flags.ts`
- Create: `settings-service.ts`

**Interfaces:**

- Consumes: PR 06 `apiGet`, `pageSchema`; the type `ActionResult` from 07 (type-only).
- Produces (14 reuses the read for its "Institution profile" readiness rule):
  - `type TenantSetting = { key: string; value: string | null; redacted: boolean; platformAdminOnly: boolean }`, `settingsPageSchema`.
  - `listSettings(): Promise<Page<TenantSetting>>`.
  - `SETTINGS_EDIT_ENABLED: boolean`.
  - `type SettingKind = 'timezone' | 'currency' | 'switch' | 'retention'`; `SettingEntry`, `SettingGroup`, `SETTING_GROUPS`.
  - `EDITABLE_KEYS`, `type EditableKey`, `isEditableKey(key)`, `EDIT_UNAVAILABLE`.
  - `otherSettings(settings)`, `currencyLabel(code)`, `settingValueLabel(kind | null, setting | undefined)`.
  - `type AllowedSettingActions = { settingKey: EditableKey; value: string | null; reset: boolean }`, `settingActions(setting | undefined, canUpdate): AllowedSettingActions | null`.
  - `type SettingOption = { value: string; label: string }`, `settingOptions(key: EditableKey, current: string | null): SettingOption[]`.
  - `withSettingProblem(result: ActionResult): ActionResult`.

- [ ] **Step 1: Write the failing tests**

`settings-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { settingsPageSchema } from './settings-contract';

const PAGE = {
  number: 0,
  size: 100,
  total_items: 1,
  total_pages: 1,
  has_next: false,
  has_previous: false,
};

function wire(overrides: Record<string, unknown> = {}) {
  return {
    key: 'default_timezone',
    value: 'Africa/Nairobi',
    value_type: 'TIMEZONE',
    sensitive: false,
    platform_admin_only: false,
    ...overrides,
  };
}

const parse = (...items: unknown[]) => settingsPageSchema.safeParse({ items, page: PAGE });

describe('settings contract', () => {
  it('maps settings and never keeps the redaction mask as a value', () => {
    const result = parse(
      wire(),
      wire({
        key: 'audit_retention_days',
        value: '***REDACTED***',
        value_type: 'INT',
        platform_admin_only: true,
      }),
      wire({ key: 'base_currency', value: null, value_type: 'CURRENCY' }),
    );

    expect(result.success && result.data.items).toEqual([
      {
        key: 'default_timezone',
        value: 'Africa/Nairobi',
        redacted: false,
        platformAdminOnly: false,
      },
      { key: 'audit_retention_days', value: null, redacted: true, platformAdminOnly: true },
      { key: 'base_currency', value: null, redacted: false, platformAdminOnly: false },
    ]);
  });

  it('tolerates any value_type on a stored key, but not a missing field or a wrong type', () => {
    expect(parse(wire({ key: 'settings.operational', value_type: 'JSON' })).success).toBe(true);

    const { sensitive: _sensitive, ...missing } = wire();
    expect(parse(missing).success).toBe(false);
    expect(parse(wire({ value: 30 })).success).toBe(false);
  });
});
```

`settings-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ActionResult } from '@/lib/api/action-result';
import type { TenantSetting } from './settings-contract';
import {
  SETTING_GROUPS,
  otherSettings,
  settingActions,
  settingOptions,
  settingValueLabel,
  withSettingProblem,
} from './settings-rules';

function setting(
  key: string,
  value: string | null,
  extra: Partial<TenantSetting> = {},
): TenantSetting {
  return { key, value, redacted: false, platformAdminOnly: false, ...extra };
}

describe('settings rules', () => {
  it('groups exactly the six catalogue keys (contract §H); anything else is an extra', () => {
    expect(
      SETTING_GROUPS.flatMap((group) => group.entries.map((entry) => entry.key)).sort(),
    ).toEqual([
      'audit_retention_days',
      'base_currency',
      'business_date_auto_advance_enabled',
      'default_timezone',
      'require_maker_checker_for_branch_creation',
      'require_maker_checker_for_user_invites',
    ]);
    expect(
      otherSettings([setting('default_timezone', 'UTC'), setting('settings.operational', 'x')]).map(
        (candidate) => candidate.key,
      ),
    ).toEqual(['settings.operational']);
  });

  it.each([
    ['switch', setting('k', 'true'), 'On'],
    ['switch', setting('k', 'false'), 'Off'],
    ['currency', setting('base_currency', 'KES'), 'KES · Kenyan Shilling'],
    ['retention', setting('audit_retention_days', '365'), '365 days'],
    ['retention', setting('audit_retention_days', null, { redacted: true }), 'Hidden'],
    ['timezone', setting('default_timezone', null), 'Not set'],
    ['timezone', undefined, 'Not available'],
    [null, setting('settings.operational', 'raw'), 'raw'],
  ] as const)('labels a %s value', (kind, value, label) => {
    expect(settingValueLabel(kind, value)).toBe(label);
  });

  it('offers edit on the two editable keys with settings.update, and reset only for a stored value', () => {
    expect(settingActions(setting('default_timezone', 'Africa/Nairobi'), true)).toEqual({
      settingKey: 'default_timezone',
      value: 'Africa/Nairobi',
      reset: true,
    });
    expect(settingActions(setting('base_currency', null), true)).toEqual({
      settingKey: 'base_currency',
      value: null,
      reset: false,
    });
    expect(settingActions(setting('default_timezone', 'Africa/Nairobi'), false)).toBeNull();
    expect(settingActions(undefined, true)).toBeNull();
    [
      setting('business_date_auto_advance_enabled', 'false'),
      setting('audit_retention_days', null, { redacted: true, platformAdminOnly: true }),
      setting('default_timezone', null, { redacted: true }),
      setting('settings.operational', 'x'),
    ].forEach((readOnly) => {
      expect(settingActions(readOnly, true)).toBeNull();
    });
  });

  it('lists the runtime zones and currencies, with a current value it lacks first', () => {
    const zones = settingOptions('default_timezone', 'Legacy/Zone');
    expect(zones[0]).toEqual({ value: 'Legacy/Zone', label: 'Legacy/Zone' });
    expect(zones.some((option) => option.value === 'Africa/Nairobi')).toBe(true);
    expect(settingOptions('base_currency', 'KES').find((option) => option.value === 'KES')).toEqual(
      { value: 'KES', label: 'KES · Kenyan Shilling' },
    );
  });

  it('explains the currency freeze on the form and a bad value on the field', () => {
    const failure = (code: string): ActionResult => ({
      ok: false,
      formError: 'Generic',
      fieldErrors: {},
      code,
      requestId: 'req-1',
    });

    expect(withSettingProblem(failure('accounting.functional_currency_frozen'))).toMatchObject({
      formError: expect.stringContaining('already posted journals'),
      fieldErrors: {},
      code: 'accounting.functional_currency_frozen',
      requestId: 'req-1',
    });
    expect(withSettingProblem(failure('accounting.currency_invalid'))).toMatchObject({
      fieldErrors: { value: expect.stringContaining("can't be used for settlement") },
      requestId: 'req-1',
    });
    expect(withSettingProblem(failure('conflict'))).toEqual(failure('conflict'));
    expect(withSettingProblem({ ok: true })).toEqual({ ok: true });
  });
});
```

Run (form T): `pnpm test:run modules/administration/settings`. Expected: FAIL (modules missing).

- [ ] **Step 2: Implement the contract, flag and service**

`settings-contract.ts`:

```ts
import { z } from 'zod';
import { pageSchema } from '@/lib/api/wire';

/** The backend's mask for sensitive and platform-only values (TenantSettingsService.MASK). */
const REDACTED = '***REDACTED***';

const settingSchema = z
  .object({
    key: z.string().min(1),
    value: z.string().nullable(),
    // A string, not an enum: stored keys outside the catalogue carry their own stored type.
    value_type: z.string(),
    sensitive: z.boolean(),
    platform_admin_only: z.boolean(),
  })
  .transform((setting) => ({
    key: setting.key,
    // The mask is never a value: the UI shows "Hidden" and never offers the key for changes.
    value: setting.value === REDACTED ? null : setting.value,
    redacted: setting.value === REDACTED,
    platformAdminOnly: setting.platform_admin_only,
  }));

export type TenantSetting = z.output<typeof settingSchema>;

export const settingsPageSchema = pageSchema(settingSchema);
```

`settings-flags.ts`, with the value Task 1 Step 2 chose (`false` unless the probe passed):

```ts
/**
 * Editing (PUT /tenant/settings/{key}) ships behind this flag: spec §10.7, BG-04. It stays false
 * unless RUN-STATE records the t0 PUT probe as PASS (plan 13, Ruling 1). When BG-04 closes, flip it
 * here; the page, the Server Action guard, and e2e/settings.spec.ts all follow.
 *
 * Import-free on purpose, so the E2E spec can import it. `as boolean` stops a bare literal making
 * every check of it an always-true/false condition to the type checker (no-unnecessary-condition).
 */
export const SETTINGS_EDIT_ENABLED = false as boolean;
```

`settings-service.ts`:

```ts
import 'server-only';
import { apiGet } from '@/lib/api/tenant-api';
import { settingsPageSchema } from './settings-contract';

/**
 * One page at the backend's maximum size (contract §A).
 * ponytail: the catalogue is six keys plus a few stored extras; the page captions it if there are
 * ever more than 100.
 */
export function listSettings() {
  return apiGet('/api/v1/tenant/settings?size=100', settingsPageSchema);
}
```

- [ ] **Step 3: Implement the rules**

`settings-rules.ts`:

```ts
import type { ActionResult } from '@/lib/api/action-result';
import type { TenantSetting } from './settings-contract';

/** How a catalogue value renders (contract §H types). */
export type SettingKind = 'timezone' | 'currency' | 'switch' | 'retention';

export interface SettingEntry {
  key: string;
  label: string;
  /** Under the label: what the setting is, or why it is read-only (spec §10.7, D10). */
  note: string;
  kind: SettingKind;
}

export interface SettingGroup {
  title: string;
  description: string;
  entries: readonly SettingEntry[];
}

/** The only keys this page changes (D10). Both default to null (contract §H). */
export const EDITABLE_KEYS = ['default_timezone', 'base_currency'] as const;
export type EditableKey = (typeof EDITABLE_KEYS)[number];

export const EDIT_UNAVAILABLE =
  "Editing isn't available yet: the platform can't save setting changes. Reset to default still works.";

export const SETTING_GROUPS: readonly SettingGroup[] = [
  {
    title: 'Locale & currency',
    description: 'Stored configuration for this institution.',
    entries: [
      {
        key: 'default_timezone',
        label: 'Default timezone',
        note: 'IANA timezone, for example Africa/Nairobi.',
        kind: 'timezone',
      },
      {
        key: 'base_currency',
        label: 'Base currency',
        note: "ISO 4217 code. It can't change once the institution has posted journals.",
        kind: 'currency',
      },
    ],
  },
  {
    title: 'Controls',
    description: 'Shown for reference. The platform applies these rules itself.',
    entries: [
      {
        key: 'require_maker_checker_for_user_invites',
        label: 'Maker-checker for user invites',
        note: 'Maker-checker always applies',
        kind: 'switch',
      },
      {
        key: 'require_maker_checker_for_branch_creation',
        label: 'Maker-checker for branch creation',
        note: 'Maker-checker always applies',
        kind: 'switch',
      },
      {
        key: 'business_date_auto_advance_enabled',
        label: 'Automatic business date advance',
        note: 'Automatic advance is not available yet',
        kind: 'switch',
      },
    ],
  },
  {
    title: 'Retention',
    description: 'Set by the platform operator.',
    entries: [
      {
        key: 'audit_retention_days',
        label: 'Audit retention',
        note: 'Managed by the platform',
        kind: 'retention',
      },
    ],
  },
];

const CATALOGUE_KEYS: ReadonlySet<string> = new Set(
  SETTING_GROUPS.flatMap((group) => group.entries.map((entry) => entry.key)),
);

export function isEditableKey(key: string): key is EditableKey {
  return EDITABLE_KEYS.some((editable) => editable === key);
}

/** Stored keys outside the catalogue (contract §H), listed read-only. */
export function otherSettings(settings: readonly TenantSetting[]): TenantSetting[] {
  return settings.filter((setting) => !CATALOGUE_KEYS.has(setting.key));
}

const CURRENCY_NAMES = new Intl.DisplayNames(['en'], { type: 'currency' });

/** `KES · Kenyan Shilling`; the bare code when the runtime has no name for it. */
export function currencyLabel(code: string): string {
  try {
    const name = CURRENCY_NAMES.of(code);
    return name && name !== code ? `${code} · ${name}` : code;
  } catch {
    // RangeError: not a well-formed ISO 4217 code.
    return code;
  }
}

export function settingValueLabel(
  kind: SettingKind | null,
  setting: TenantSetting | undefined,
): string {
  if (!setting) return 'Not available';
  if (setting.redacted) return 'Hidden';
  const { value } = setting;
  if (value === null) return 'Not set';
  if (kind === 'switch') return value === 'true' ? 'On' : value === 'false' ? 'Off' : value;
  if (kind === 'currency') return currencyLabel(value);
  if (kind === 'retention') return `${value} days`;
  return value;
}

export interface AllowedSettingActions {
  settingKey: EditableKey;
  value: string | null;
  /** Both editable keys default to null, so a value means one is stored (no is_default: BG-12). */
  reset: boolean;
}

/** Editable keys only, with `settings.update`, never on a masked or platform-only value. */
export function settingActions(
  setting: TenantSetting | undefined,
  canUpdate: boolean,
): AllowedSettingActions | null {
  if (!setting || !canUpdate || setting.redacted || setting.platformAdminOnly) return null;
  const { key, value } = setting;
  return isEditableKey(key) ? { settingKey: key, value, reset: value !== null } : null;
}

export interface SettingOption {
  value: string;
  label: string;
}

/**
 * The runtime's IANA zones or ISO 4217 codes. The current value goes first when the list lacks it
 * (an alias such as `UTC`), so the select still shows it.
 */
export function settingOptions(key: EditableKey, current: string | null): SettingOption[] {
  const values = Intl.supportedValuesOf(key === 'default_timezone' ? 'timeZone' : 'currency');
  const all = current !== null && !values.includes(current) ? [current, ...values] : values;
  return all.map((value) => ({
    value,
    label: key === 'base_currency' ? currencyLabel(value) : value,
  }));
}

/**
 * Remedies for the settings codes (contract §I). Kept local because lib/api/problem.ts belongs to
 * 07. `onValue` also puts the message on the Edit dialog's value field.
 */
const SETTING_PROBLEMS = new Map<string, { message: string; onValue: boolean }>([
  // TenantSettingsService runs the freeze on createOrUpdate *and* deactivate, so Reset hits it too.
  [
    'accounting.functional_currency_frozen',
    {
      message: "The base currency can't change: this institution has already posted journals.",
      onValue: false,
    },
  ],
  [
    'accounting.functional_currency_lock_timeout',
    { message: 'Another currency change is in progress. Try again in a moment.', onValue: false },
  ],
  [
    'accounting.currency_invalid',
    { message: "This currency can't be used for settlement. Choose another.", onValue: true },
  ],
  ['invalid_operation', { message: "This value isn't valid for this setting.", onValue: true }],
]);

export function withSettingProblem(result: ActionResult): ActionResult {
  if (result.ok || result.code === null) return result;
  const known = SETTING_PROBLEMS.get(result.code);
  if (!known) return result;
  return {
    ...result,
    formError: known.message,
    fieldErrors: known.onValue
      ? { ...result.fieldErrors, value: known.message }
      : result.fieldErrors,
  };
}
```

Run (form T): `pnpm test:run modules/administration/settings`. Expected: PASS.

- [ ] **Step 4: Commit** (form C)

`git add modules/administration/settings`

```
feat(settings): add the tenant settings contract, catalogue rules, edit flag, and read

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

### Task 3: Server Actions

**Files:**

- Create: `modules/administration/settings/settings-actions.ts`, `settings-actions.test.ts`

**Interfaces:**

- Consumes: 07's `runServerAction`, `ActionResult`, `apiPut(path, body, idempotencyKey)`,
  `apiDelete(path, idempotencyKey, body?)` (A1, checked in Task 1); `getAuthenticatedUser` (`auth/get-authenticated-user.ts`);
  Task 2's `EDITABLE_KEYS`, `EDIT_UNAVAILABLE`, `withSettingProblem`, `SETTINGS_EDIT_ENABLED`.
- Produces `FormAction`s:
  - `updateSetting`, with fields `idempotencyKey`, `key`, `value` and `reason`. While the flag is
    off, it checks the session first (redirecting to `/login` like `runServerAction`), then
    returns `{ ok: false, code: 'settings_edit_unavailable', … }` without any backend call.
  - `resetSetting`, with fields `idempotencyKey`, `key` and `reason`.

- [ ] **Step 1: Write the failing test**

`settings-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

const { apiPut, apiDelete, flag, getAuthenticatedUser } = vi.hoisted(() => ({
  apiPut: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
    Promise.resolve({}),
  ),
  // A1's order: the key second, the optional body last.
  apiDelete: vi.fn((_path: string, _key: string, _body?: Record<string, unknown>) =>
    Promise.resolve(undefined),
  ),
  flag: { enabled: true },
  getAuthenticatedUser: vi.fn(() => Promise.resolve<unknown>({ id: 'user-1' })),
}));
vi.mock('@/lib/api/tenant-api', () => ({
  apiPut: (path: string, body: Record<string, unknown>, key: string) => apiPut(path, body, key),
  apiDelete: (path: string, key: string, body?: Record<string, unknown>) =>
    apiDelete(path, key, body),
}));
// The flag-off path checks the session itself (runServerAction's mock below skips it).
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock('@/auth/get-authenticated-user', () => ({
  getAuthenticatedUser: () => getAuthenticatedUser(),
}));
vi.mock('./settings-flags', () => ({
  get SETTINGS_EDIT_ENABLED() {
    return flag.enabled;
  },
}));
// Pass-through: this test covers each action's fields and body; runServerAction has its own test.
vi.mock('@/lib/api/action-result', () => ({
  runServerAction: async (
    schema: z.ZodType,
    formData: FormData,
    run: (input: unknown) => Promise<unknown>,
  ) => {
    await run(schema.parse(Object.fromEntries(formData)));
    return { ok: true };
  },
}));

const { resetSetting, updateSetting } = await import('./settings-actions');

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(fields).forEach(([name, value]) => {
    data.set(name, value);
  });
  return data;
}

describe('settings actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flag.enabled = true;
  });

  it('puts the chosen value, snake_case only, with the client key', async () => {
    await updateSetting(
      null,
      form({ idempotencyKey: KEY, key: 'default_timezone', value: ' Africa/Kampala ', reason: '' }),
    );
    expect(apiPut).toHaveBeenLastCalledWith(
      '/api/v1/tenant/settings/default_timezone',
      { value: 'Africa/Kampala' },
      KEY,
    );

    await updateSetting(
      null,
      form({ idempotencyKey: KEY, key: 'base_currency', value: 'UGX', reason: ' Moved ' }),
    );
    expect(apiPut).toHaveBeenLastCalledWith(
      '/api/v1/tenant/settings/base_currency',
      { value: 'UGX', reason: 'Moved' },
      KEY,
    );
  });

  it('never calls the backend while editing ships disabled (BG-04), even when invoked directly', async () => {
    flag.enabled = false;

    await expect(
      updateSetting(
        null,
        form({ idempotencyKey: KEY, key: 'default_timezone', value: 'Africa/Kampala' }),
      ),
    ).resolves.toMatchObject({ ok: false, code: 'settings_edit_unavailable' });
    expect(apiPut).not.toHaveBeenCalled();
  });

  it('checks the session before the flag guard (index: every Server Action does)', async () => {
    flag.enabled = false;
    getAuthenticatedUser.mockResolvedValueOnce(null);

    await expect(
      updateSetting(
        null,
        form({ idempotencyKey: KEY, key: 'default_timezone', value: 'Africa/Kampala' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT:/login?reason=session_expired');
    expect(apiPut).not.toHaveBeenCalled();
  });

  it('resets with {} or {reason}, whatever the flag says', async () => {
    flag.enabled = false;

    await resetSetting(null, form({ idempotencyKey: KEY, key: 'base_currency', reason: '  ' }));
    expect(apiDelete).toHaveBeenLastCalledWith('/api/v1/tenant/settings/base_currency', KEY, {});

    await resetSetting(null, form({ idempotencyKey: KEY, key: 'base_currency', reason: 'Typo' }));
    expect(apiDelete).toHaveBeenLastCalledWith('/api/v1/tenant/settings/base_currency', KEY, {
      reason: 'Typo',
    });
  });

  it('refuses read-only or unknown keys, a blank value, or a missing key before any call', async () => {
    await expect(
      resetSetting(null, form({ idempotencyKey: KEY, key: 'audit_retention_days' })),
    ).rejects.toThrow();
    await expect(
      updateSetting(
        null,
        form({ idempotencyKey: KEY, key: 'require_maker_checker_for_user_invites', value: 'true' }),
      ),
    ).rejects.toThrow();
    await expect(
      updateSetting(null, form({ idempotencyKey: KEY, key: 'default_timezone', value: '   ' })),
    ).rejects.toThrow();
    await expect(resetSetting(null, form({ key: 'base_currency' }))).rejects.toThrow();
    expect(apiPut).not.toHaveBeenCalled();
    expect(apiDelete).not.toHaveBeenCalled();
  });
});
```

Run (form T): `pnpm test:run modules/administration/settings/settings-actions.test.ts`.
Expected: FAIL.

- [ ] **Step 2: Implement `settings-actions.ts`**

A `'use server'` file may export only async functions, so every helper stays private or lives in
`settings-rules.ts`.

```ts
'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/auth/get-authenticated-user';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { apiDelete, apiPut } from '@/lib/api/tenant-api';
import { SETTINGS_EDIT_ENABLED } from './settings-flags';
import { EDIT_UNAVAILABLE, EDITABLE_KEYS, withSettingProblem } from './settings-rules';

// Explicit, not `value || null`: the empty string must become null too, and prefer-nullish-coalescing
// rejects `||` on a nullable operand. Task 1: if 07's final `reason` schema differs, copy 07's.
const reason = z
  .string()
  .trim()
  .max(500, 'Keep the reason under 500 characters.')
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value));

// Only the two editable keys: read-only, platform-only and unknown keys never reach the backend.
const resetInput = z.object({ idempotencyKey: z.uuid(), key: z.enum(EDITABLE_KEYS), reason });
const updateInput = resetInput.extend({
  value: z.string().trim().min(1, 'Choose a value.').max(64, 'Choose a value from the list.'),
});

const settingPath = (key: string) => `/api/v1/tenant/settings/${encodeURIComponent(key)}`;
// `reason` only when there is one (contract §D).
const reasonBody = (value: string | null) => (value ? { reason: value } : {});

/** PUT, behind SETTINGS_EDIT_ENABLED (BG-04). Guarded here too: a Server Action is callable directly. */
export async function updateSetting(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!SETTINGS_EDIT_ENABLED) {
    // Session first, as runServerAction does on the enabled path (index: every Server Action
    // validates the session server-side).
    if (!(await getAuthenticatedUser(await headers()))) {
      redirect('/login?reason=session_expired');
    }
    return {
      ok: false,
      formError: EDIT_UNAVAILABLE,
      fieldErrors: {},
      code: 'settings_edit_unavailable',
      requestId: null,
    };
  }
  return withSettingProblem(
    await runServerAction(updateInput, formData, (input) =>
      apiPut(
        settingPath(input.key),
        { value: input.value, ...reasonBody(input.reason) },
        input.idempotencyKey,
      ),
    ),
  );
}

/** DELETE → 204; the platform default applies again. */
export async function resetSetting(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withSettingProblem(
    await runServerAction(resetInput, formData, (input) =>
      apiDelete(settingPath(input.key), input.idempotencyKey, reasonBody(input.reason)),
    ),
  );
}
```

Run (form T): the same file. Expected: PASS.

- [ ] **Step 3: Commit** (form C)

`git add modules/administration/settings/settings-actions.ts modules/administration/settings/settings-actions.test.ts`

```
feat(settings): add the update and reset Server Actions, with editing behind its flag

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

### Task 4: The page, the catalogue, and navigation

**Files:**

- Create (under `modules/administration/settings/components/`): `settings-catalogue.tsx` (server)
  and its test, `setting-actions.tsx` (client) and its test
- Create: `app/(authenticated)/admin/settings/page.tsx`
- Modify: `modules/administration/administration-navigation.ts`

**Interfaces:**

- Consumes:
  - Tasks 2–3;
  - 07's `SectionCard` and `ReasonDialog`;
  - 07b's `ForbiddenState`;
  - PR 06's `load`, `ErrorState`, `TruncatedText` and `PageHeader`;
  - PR 05's `getCurrentContextProfile` and `useToast`;
  - PR 04's `can`.
- Produces:
  - `SettingsCatalogue({ settings, truncated, canUpdate, editBlocked })`. Each row is a
    `role="group"` named by its label.
  - `SettingActions({ settingKey, value, reset, label, editBlocked })`.
  - The Settings nav entry.

- [ ] **Step 1: Load skills**

Invoke `frontend-design` and `ui-ux-pro-max` (the design-system command with
`"settings catalogue grouped configuration read-only controls"`, plus
`--domain ux "settings page disabled action explanation reset to default"`). The prototype's reference
is `/home/ogaba/Downloads/finaxis-admin-prototype-source-v5/finaxis-admin-prototype/src/App.jsx:2332-2375`
(`SettingsPage`: 78 px rows) and `src/styles.css:30` (`.settings-list`). Its four fake groups are not
reproduced (D7).

- [ ] **Step 2: Write the failing component tests**

`components/setting-actions.test.tsx` (add Task 1's `requestSubmit` polyfill here if 07's test
has one):

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { ActionResult } from '@/lib/api/action-result';

const { updateSetting, resetSetting } = vi.hoisted(() => ({
  updateSetting: vi.fn((_previous: ActionResult | null, _formData: FormData) =>
    Promise.resolve<ActionResult>({ ok: true }),
  ),
  resetSetting: vi.fn((_previous: ActionResult | null, _formData: FormData) =>
    Promise.resolve<ActionResult>({ ok: true }),
  ),
}));
vi.mock('../settings-actions', () => ({ updateSetting, resetSetting }));

const { SettingActions } = await import('./setting-actions');

const BLOCKED = "Editing isn't available yet.";

describe('SettingActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ships Edit disabled with its reason as the description, and still offers Reset', () => {
    renderWithProviders(
      <SettingActions
        settingKey="default_timezone"
        value="Africa/Nairobi"
        reset
        label="Default timezone"
        editBlocked={BLOCKED}
      />,
    );

    const edit = screen.getByRole('button', { name: 'Edit' });
    expect(edit).toBeDisabled();
    // describeChild: the reason is the wrapper's title, never an aria-label on a generic span.
    expect(screen.getByTitle(BLOCKED)).toContainElement(edit);
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeEnabled();
  });

  it('resets with the key and an optional reason, then toasts', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SettingActions
        settingKey="default_timezone"
        value="Africa/Nairobi"
        reset
        label="Default timezone"
        editBlocked={BLOCKED}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Reset to default' }));
    const dialog = screen.getByRole('dialog', { name: 'Reset default timezone?' });
    // Edit is blocked, so the reset can't be undone in the product: the dialog says so.
    expect(dialog).toHaveTextContent("you won't be able to set a new value here afterwards");
    await user.type(within(dialog).getByRole('textbox', { name: 'Reason (optional)' }), 'Default');
    await user.click(within(dialog).getByRole('button', { name: 'Reset to default' }));

    await waitFor(() => {
      expect(resetSetting).toHaveBeenCalledTimes(1);
    });
    const formData = resetSetting.mock.calls[0]?.[1];
    expect(formData?.get('key')).toBe('default_timezone');
    expect(formData?.get('reason')).toBe('Default');
    expect(await screen.findByText('Default timezone reset to default')).toBeInTheDocument();
  });

  it('edits from the runtime list with the current value selected', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SettingActions
        settingKey="base_currency"
        value="KES"
        reset={false}
        label="Base currency"
        editBlocked={null}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Reset to default' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit base currency' });
    const select = within(dialog).getByRole('combobox', { name: 'Currency' });
    expect(select).toHaveValue('KES');
    await user.selectOptions(select, 'UGX');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateSetting).toHaveBeenCalledTimes(1);
    });
    const formData = updateSetting.mock.calls[0]?.[1];
    expect(formData?.get('key')).toBe('base_currency');
    expect(formData?.get('value')).toBe('UGX');
  });
});
```

`components/settings-catalogue.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { TenantSetting } from '../settings-contract';

vi.mock('../settings-actions', () => ({ updateSetting: vi.fn(), resetSetting: vi.fn() }));

const { SettingsCatalogue } = await import('./settings-catalogue');

const plain = { redacted: false, platformAdminOnly: false };
const SETTINGS: TenantSetting[] = [
  { key: 'audit_retention_days', value: null, redacted: true, platformAdminOnly: true },
  { key: 'base_currency', value: 'KES', ...plain },
  { key: 'business_date_auto_advance_enabled', value: 'false', ...plain },
  { key: 'default_timezone', value: null, ...plain },
  { key: 'require_maker_checker_for_branch_creation', value: 'false', ...plain },
  { key: 'require_maker_checker_for_user_invites', value: 'true', ...plain },
  { key: 'settings.operational', value: 'x'.repeat(200), ...plain },
];

const BLOCKED = "Editing isn't available yet.";
const row = (name: string) => screen.getByRole('group', { name });

describe('SettingsCatalogue', () => {
  it('groups the catalogue with honest read-only labels and collapses stored extras', () => {
    renderWithProviders(
      <SettingsCatalogue settings={SETTINGS} truncated={false} canUpdate editBlocked={BLOCKED} />,
    );

    expect(screen.getByRole('region', { name: 'Locale & currency' })).toHaveTextContent(BLOCKED);
    expect(row('Base currency')).toHaveTextContent('KES · Kenyan Shilling');
    expect(
      within(row('Base currency')).getByRole('button', { name: 'Reset to default' }),
    ).toBeEnabled();
    expect(row('Default timezone')).toHaveTextContent('Not set');
    expect(
      within(row('Default timezone')).queryByRole('button', { name: 'Reset to default' }),
    ).toBeNull();
    expect(row('Maker-checker for user invites')).toHaveTextContent('Maker-checker always applies');
    expect(within(row('Maker-checker for user invites')).queryByRole('button')).toBeNull();
    expect(row('Automatic business date advance')).toHaveTextContent(
      'Automatic advance is not available yet',
    );
    expect(row('Audit retention')).toHaveTextContent('Hidden');
    expect(within(row('Audit retention')).queryByRole('button')).toBeNull();
    expect(screen.queryByText('***REDACTED***')).toBeNull();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Other stored settings (1)' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Other stored settings (1)' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('offers no changes without settings.update, and captions a truncated read', () => {
    renderWithProviders(
      <SettingsCatalogue settings={SETTINGS} truncated canUpdate={false} editBlocked={BLOCKED} />,
    );

    expect(screen.queryAllByRole('button', { name: /^(Edit|Reset to default)$/ })).toHaveLength(0);
    expect(screen.queryByText(BLOCKED)).toBeNull();
    expect(screen.getByText('Showing the first 100 settings.')).toBeInTheDocument();
  });
});
```

Run (form T): `pnpm test:run modules/administration/settings/components`. Expected: FAIL.

- [ ] **Step 3: Implement `SettingActions`**

`components/setting-actions.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { ReasonDialog } from '@/components/data-display/reason-dialog';
import { useToast } from '@/components/providers/toast-provider';
import { resetSetting, updateSetting } from '../settings-actions';
import { settingOptions, type AllowedSettingActions } from '../settings-rules';

const RESET_DESCRIPTION = 'The stored value is removed, so this setting goes back to not set.';
// While editing is blocked (BG-04), Reset is one-way in the product, so the dialog says so.
const RESET_IS_ONE_WAY =
  "Editing isn't available yet, so you won't be able to set a new value here afterwards.";

interface SettingActionsProps extends AllowedSettingActions {
  label: string;
  /** Why Edit is disabled (BG-04), or null when editing ships. */
  editBlocked: string | null;
}

export function SettingActions({
  settingKey,
  value,
  reset,
  label,
  editBlocked,
}: SettingActionsProps) {
  const notify = useToast();
  const [open, setOpen] = useState<'edit' | 'reset' | null>(null);
  const close = () => {
    setOpen(null);
  };
  const name = label.toLowerCase();
  const keyField = <input type="hidden" name="key" value={settingKey} />;

  return (
    <>
      {editBlocked ? (
        // A disabled button takes no pointer events, so the span carries the tooltip. describeChild
        // makes the reason the span's title/description; the default aria-label is prohibited on a
        // generic span (axe). The catalogue repeats the reason visibly for keyboard users.
        <Tooltip title={editBlocked} describeChild>
          <span>
            <Button variant="outlined" size="small" disabled>
              Edit
            </Button>
          </span>
        </Tooltip>
      ) : (
        <Button
          variant="outlined"
          size="small"
          onClick={() => {
            setOpen('edit');
          }}
        >
          Edit
        </Button>
      )}
      {reset && (
        <Button
          size="small"
          onClick={() => {
            setOpen('reset');
          }}
        >
          Reset to default
        </Button>
      )}
      {!editBlocked && (
        <ReasonDialog
          open={open === 'edit'}
          title={`Edit ${name}`}
          description="The new value is stored for this institution."
          confirmLabel="Save"
          reason="optional"
          action={updateSetting}
          onClose={close}
          onSuccess={() => {
            close();
            notify(`${label} updated`, 'success');
          }}
          fields={(fieldErrors) => (
            <>
              {keyField}
              <TextField
                select
                name="value"
                label={settingKey === 'default_timezone' ? 'Timezone' : 'Currency'}
                defaultValue={value ?? ''}
                required
                error={Boolean(fieldErrors.value)}
                helperText={fieldErrors.value}
                slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {settingOptions(settingKey, value).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </TextField>
            </>
          )}
        />
      )}
      {reset && (
        <ReasonDialog
          open={open === 'reset'}
          title={`Reset ${name}?`}
          description={editBlocked ? `${RESET_DESCRIPTION} ${RESET_IS_ONE_WAY}` : RESET_DESCRIPTION}
          confirmLabel="Reset to default"
          reason="optional"
          action={resetSetting}
          onClose={close}
          onSuccess={() => {
            close();
            notify(`${label} reset to default`, 'success');
          }}
          fields={() => keyField}
        />
      )}
    </>
  );
}
```

(The native select renders the ~400 zones and ~300 currencies with no library, and the browser
gives it keyboard type-ahead. It renders only inside the open dialog, so the server and client
`Intl` lists never have to match.)

- [ ] **Step 4: Implement `SettingsCatalogue`**

`components/settings-catalogue.tsx`:

```tsx
import { useId, type ReactNode } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import { SectionCard } from '@/components/data-display/section-card';
import { TruncatedText } from '@/components/data-display/truncated-text';
import type { TenantSetting } from '../settings-contract';
import {
  SETTING_GROUPS,
  isEditableKey,
  otherSettings,
  settingActions,
  settingValueLabel,
} from '../settings-rules';
import { SettingActions } from './setting-actions';

interface SettingsCatalogueProps {
  settings: readonly TenantSetting[];
  /** More than one page came back (see settings-service). */
  truncated: boolean;
  canUpdate: boolean;
  /** Why Edit is disabled (BG-04), or null when editing ships. */
  editBlocked: string | null;
}

interface SettingRowProps {
  label: string;
  note?: string;
  value: string;
  actions?: ReactNode;
}

/**
 * One setting (prototype `.settings-list` row). It is a group named by its label, so every row's
 * "Edit" and "Reset to default" stay distinguishable. `useId`, not the key: a stored key can hold
 * whitespace, which would split `aria-labelledby` into IDREFs that don't exist.
 */
function SettingRow({ label, note, value, actions }: SettingRowProps) {
  const labelId = useId();
  return (
    <Box
      role="group"
      aria-labelledby={labelId}
      sx={{
        minHeight: 78,
        px: 4.5,
        py: 3,
        display: 'grid',
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr)',
          md: 'minmax(0, 1.2fr) minmax(0, 1fr) auto',
        },
        alignItems: 'center',
        gap: { xs: 1.5, md: 4 },
        borderBottom: 1,
        borderColor: 'divider',
        '&:last-child': { borderBottom: 0 },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography id={labelId} sx={{ fontWeight: 700 }}>
          {label}
        </Typography>
        {note && (
          <Typography variant="body2" color="text.secondary">
            {note}
          </Typography>
        )}
      </Box>
      <TruncatedText value={value} maxWidth="100%" variant="body1" />
      {actions && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifySelf: { md: 'end' } }}>
          {actions}
        </Box>
      )}
    </Box>
  );
}

export function SettingsCatalogue({
  settings,
  truncated,
  canUpdate,
  editBlocked,
}: SettingsCatalogueProps) {
  const byKey = new Map(settings.map((setting) => [setting.key, setting]));
  const others = otherSettings(settings);

  return (
    <Stack spacing={5}>
      {SETTING_GROUPS.map((group) => (
        <SectionCard key={group.title} title={group.title} description={group.description}>
          {canUpdate && editBlocked && group.entries.some((entry) => isEditableKey(entry.key)) && (
            // The disabled Edit buttons can't take focus, so a tooltip alone would hide the reason
            // from keyboard and screen-reader users. role="note": a static notice, not an alert
            // announced on every page load (and not confused with the toast's alert).
            <Alert severity="info" role="note" sx={{ mx: 4.5, mt: 3, mb: 1 }}>
              {editBlocked}
            </Alert>
          )}
          {group.entries.map((entry) => {
            const setting = byKey.get(entry.key);
            const allowed = settingActions(setting, canUpdate);
            return (
              <SettingRow
                key={entry.key}
                label={entry.label}
                note={entry.note}
                value={settingValueLabel(entry.kind, setting)}
                actions={
                  allowed && (
                    <SettingActions {...allowed} label={entry.label} editBlocked={editBlocked} />
                  )
                }
              />
            );
          })}
        </SectionCard>
      ))}
      {others.length > 0 && (
        // h2 like the SectionCards around it (heading order); MUI's default heading is h3.
        <Accordion disableGutters slotProps={{ heading: { component: 'h2' } }}>
          <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
            <Typography component="span" variant="h5">
              Other stored settings ({others.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ px: 4.5, pb: 2 }}>
              Stored keys outside the catalogue, shown read-only.
            </Typography>
            {others.map((setting) => (
              <SettingRow
                key={setting.key}
                label={setting.key}
                value={settingValueLabel(null, setting)}
              />
            ))}
          </AccordionDetails>
        </Accordion>
      )}
      {truncated && (
        <Typography variant="caption" color="text.secondary">
          Showing the first 100 settings.
        </Typography>
      )}
    </Stack>
  );
}
```

- [ ] **Step 5: The page and the nav entry**

`app/(authenticated)/admin/settings/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can } from '@/auth/permissions';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { SettingsCatalogue } from '@/modules/administration/settings/components/settings-catalogue';
import { SETTINGS_EDIT_ENABLED } from '@/modules/administration/settings/settings-flags';
import { EDIT_UNAVAILABLE } from '@/modules/administration/settings/settings-rules';
import { listSettings } from '@/modules/administration/settings/settings-service';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const selected = await getCurrentContextProfile();
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };
  const header = (
    <PageHeader
      eyebrow="Administration"
      title="Settings"
      description="Institution-wide operating defaults. Changes keep an optional reason in the audit trail."
    />
  );

  // Spec §6.6–6.7: the nav hides this page without settings.view; a direct visit gets the inline
  // state (and keeps the page's h1), with no backend call.
  if (!can(holder, 'settings.view')) {
    return (
      <>
        {header}
        <Paper>
          <ForbiddenState />
        </Paper>
      </>
    );
  }

  const settings = await load(listSettings());
  return (
    <>
      {header}
      {settings.ok ? (
        <SettingsCatalogue
          settings={settings.value.items}
          truncated={settings.value.page.hasNext}
          canUpdate={can(holder, 'settings.update')}
          editBlocked={SETTINGS_EDIT_ENABLED ? null : EDIT_UNAVAILABLE}
        />
      ) : (
        <Paper>
          <ErrorState problem={settings.problem} />
        </Paper>
      )}
    </>
  );
}
```

`modules/administration/administration-navigation.ts`: import
`SettingsOutlined from '@mui/icons-material/SettingsOutlined'`, and insert **before** the Business
date entry (spec §8 order; 08 and 09 insert above it):

```ts
  {
    href: '/admin/settings',
    label: 'Settings',
    icon: SettingsOutlined,
    requiresAny: ['settings.view'],
  },
```

Run (form T): `pnpm test:run modules/administration/settings`. Expected: PASS.

- [ ] **Step 6: Commit** (form C, two commits: the navigation registry gets its own, per lane
      rules §5)

`git add "app/(authenticated)/admin/settings/page.tsx" modules/administration/settings/components`

```
feat(settings): add the settings page with grouped read-only controls, edit, and reset

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

`git add modules/administration/administration-navigation.ts`

```
feat(nav): add Settings to the administration navigation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

### Task 5: Fake API settings, E2E, docs, gates

**Files:**

- Modify: `e2e/fake-api/state.mts`, `e2e/fake-api/scenarios.mts`, `e2e/fake-api/server.mts`
- Create: `e2e/fake-api/routes/settings.mts`, `e2e/fake-api-settings.spec.ts`, `e2e/settings.spec.ts`
- Modify: `docs/backend-gaps.md` (BG-04),
  `docs/superpowers/specs/2026-09-25-admin-prototype-parity-api-contract.md` (§E.3 settings rows)

**Interfaces:**

- Consumes: 07's `sendIdempotent` (A2 status), 07b's `requirePermission` and admin helpers, PR 03's
  fake-API modules, Task 2's `SETTINGS_EDIT_ENABLED`.
- Produces:
  - `FakeTenantSetting`, and the RunState fields `tenantSettings` and `baseCurrencyFrozen`.
  - `settingsRoutes`.
  - The scenarios `settings-read-only`, `settings-currency-frozen` and `no-settings-permission`.

- [ ] **Step 1: Pin the fake in `e2e/fake-api-settings.spec.ts` (failing first)**

```ts
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { IDS } from './fake-api/scenarios.mts';

const FAKE_API_URL = `http://127.0.0.1:${process.env.FAKE_API_PORT ?? '3199'}`;
const SETTINGS = `${FAKE_API_URL}/api/v1/tenant/settings`;

async function tenantHeaders(request: APIRequestContext, scenario = 'default') {
  const authorization = { Authorization: `Bearer e2e.${scenario}.${randomUUID()}` };
  const selection = await request.post(`${FAKE_API_URL}/api/v1/auth/select-organisation`, {
    headers: authorization,
    data: { organisation_id: IDS.greenfield },
  });
  const { context_token: contextToken } = (await selection.json()) as { context_token: string };
  return { ...authorization, 'X-Active-Organisation-Context': contextToken };
}

interface Item {
  key: string;
  value: string | null;
}

async function list(request: APIRequestContext, headers: Record<string, string>) {
  const response = await request.get(`${SETTINGS}?size=100`, { headers });
  return ((await response.json()) as { items: Item[] }).items;
}

test.describe('fake API tenant settings', () => {
  test('lists the catalogue with defaults and stored extras by key, masking the platform-only value', async ({
    request,
  }) => {
    const items = await list(request, await tenantHeaders(request));

    expect(items.map((item) => item.key)).toEqual([
      'audit_retention_days',
      'base_currency',
      'business-date.timezone',
      'business_date_auto_advance_enabled',
      'default_timezone',
      'require_maker_checker_for_branch_creation',
      'require_maker_checker_for_user_invites',
      'settings.operational',
    ]);
    const value = (key: string) => items.find((item) => item.key === key)?.value;
    expect(value('audit_retention_days')).toBe('***REDACTED***');
    expect(value('business_date_auto_advance_enabled')).toBe('false');
    expect(value('base_currency')).toBe('KES');
  });

  test('replays a reset for the same key as an empty 204, and the default applies', async ({
    request,
  }) => {
    const headers = await tenantHeaders(request);
    const key = randomUUID();
    const reset = () =>
      request.delete(`${SETTINGS}/default_timezone`, {
        headers: { ...headers, 'Idempotency-Key': key },
        data: { reason: 'Back to default' },
      });

    const first = await reset();
    const replay = await reset();

    expect(first.status()).toBe(204);
    expect(replay.status()).toBe(204);
    expect(replay.headers()['idempotency-replayed']).toBe('true');
    expect(await replay.text()).toBe('');
    expect((await list(request, headers)).find((item) => item.key === 'default_timezone')).toEqual(
      expect.objectContaining({ value: null }),
    );
  });

  test('canonicalises writes, rejects bad values, and guards the platform key and a frozen currency', async ({
    request,
  }) => {
    const headers = await tenantHeaders(request);
    const put = (key: string, value: string) =>
      request.put(`${SETTINGS}/${key}`, {
        headers: { ...headers, 'Idempotency-Key': randomUUID() },
        data: { value },
      });

    const written = await put('base_currency', 'ugx');
    expect(written.status()).toBe(200);
    expect(await written.json()).toMatchObject({ key: 'base_currency', value: 'UGX' });
    expect(await (await put('base_currency', 'XXX')).json()).toMatchObject({
      status: 422,
      code: 'accounting.currency_invalid',
    });
    expect(await (await put('default_timezone', 'Mars/Olympus')).json()).toMatchObject({
      status: 422,
      code: 'invalid_operation',
    });
    expect(await (await put('default_timezone', '  ')).json()).toMatchObject({
      status: 400,
      code: 'validation_failed',
    });
    expect(await (await put('nope', 'x')).json()).toMatchObject({
      status: 422,
      code: 'invalid_operation',
    });
    expect((await put('audit_retention_days', '30')).status()).toBe(403);

    const frozen = await tenantHeaders(request, 'settings-currency-frozen');
    const reset = await request.delete(`${SETTINGS}/base_currency`, {
      headers: { ...frozen, 'Idempotency-Key': randomUUID() },
    });
    expect(await reset.json()).toMatchObject({
      status: 409,
      code: 'accounting.functional_currency_frozen',
    });
  });
});
```

Run (form E): `e2e/fake-api-settings.spec.ts`. Expected: FAIL. The settings routes don't
exist yet (404, so `items` is undefined), and the `settings-currency-frozen` scenario is unknown.

- [ ] **Step 2: Extend the fake state and scenarios**

`state.mts`: add the interface, and the two fields at the end of `RunState`:

```ts
export interface FakeTenantSetting {
  organisationId: string;
  key: string;
  value: string;
  valueType: string;
  sensitive: boolean;
}
```

```ts
  /** Stored tenant settings only; an unset catalogue key shows its default (contract §H). */
  tenantSettings: FakeTenantSetting[];
  /** The tenant has posted a journal, so `base_currency` can't change (409). */
  baseCurrencyFrozen: boolean;
```

`scenarios.mts`:

- add `FakeTenantSetting` to the type imports;
- append `'settings.update'` to `TENANT_ADMIN_PERMISSIONS`;
- add above `greenfieldTenant()`:

```ts
/** A fresh array per seed (fake-api.spec pins unshared fixtures). No IDs: rows are keyed by `key`. */
function seedTenantSettings(organisationId: string): FakeTenantSetting[] {
  const row = (key: string, value: string, valueType: string): FakeTenantSetting => ({
    organisationId,
    key,
    value,
    valueType,
    sensitive: false,
  });
  return [
    row('default_timezone', 'Africa/Nairobi', 'TIMEZONE'),
    row('base_currency', 'KES', 'CURRENCY'),
    // Stored keys outside the catalogue, as on dev (contract §H); one long value for 375 px.
    row('business-date.timezone', 'Africa/Nairobi', 'STRING'),
    row(
      'settings.operational',
      '{"cash_limit_per_teller":"250000","end_of_day_cutoff":"17:30","statement_numbering":"GF-{branch}-{yyyy}-{seq}"}',
      'STRING',
    ),
  ];
}
```

- in `greenfieldTenant()`, add
  `tenantSettings: seedTenantSettings(IDS.greenfield), baseCurrencyFrozen: false,`;
- in `platformOperator()`, add `tenantSettings: [], baseCurrencyFrozen: false,`;
- add both fields to any other builder that builds `RunState` from scratch rather than spreading
  one of those two (Task 1 Step 1 listed the fields). Then add to `BUILDERS`:

```ts
  'settings-read-only': () => withoutPermission(greenfieldTenant(), 'settings.update'),
  'settings-currency-frozen': () => ({ ...greenfieldTenant(), baseCurrencyFrozen: true }),
  'no-settings-permission': () =>
    withoutPermission(greenfieldTenant(), 'settings.view', 'settings.update'),
```

`FakeApiScenario` derives from `BUILDERS`, so `e2e/support/auth.ts` stays untouched.

- [ ] **Step 3: Implement the routes, then re-run the fake spec**

`e2e/fake-api/routes/settings.mts`:

```ts
import { requireContext, requirePermission, requireTenantContext } from '../access.mts';
import type { AccessContext } from '../access.mts';
import { objectBody, pageOf, problem, readBody, sendJson, stringField } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { route } from '../router.mts';
import type { Route, RouteContext } from '../router.mts';
import type { FakeTenantSetting } from '../state.mts';

const BASE = '/api/v1/tenant/settings';
const MASK = '***REDACTED***';

interface Definition {
  valueType: 'TIMEZONE' | 'CURRENCY' | 'BOOLEAN' | 'INT';
  platformAdminOnly: boolean;
  defaultValue: string | null;
}

/** lifecycle/domain/TenantSettingCatalog.kt (contract §H). A Map, so `toString` is never a key. */
const CATALOGUE = new Map<string, Definition>([
  ['default_timezone', { valueType: 'TIMEZONE', platformAdminOnly: false, defaultValue: null }],
  ['base_currency', { valueType: 'CURRENCY', platformAdminOnly: false, defaultValue: null }],
  [
    'require_maker_checker_for_user_invites',
    { valueType: 'BOOLEAN', platformAdminOnly: false, defaultValue: 'false' },
  ],
  [
    'require_maker_checker_for_branch_creation',
    { valueType: 'BOOLEAN', platformAdminOnly: false, defaultValue: 'false' },
  ],
  [
    'business_date_auto_advance_enabled',
    { valueType: 'BOOLEAN', platformAdminOnly: false, defaultValue: 'false' },
  ],
  ['audit_retention_days', { valueType: 'INT', platformAdminOnly: true, defaultValue: null }],
]);

function tenantAccess(context: RouteContext): AccessContext {
  const access = requireContext(context);
  requireTenantContext(access);
  return access;
}

function rowsOf(context: RouteContext, access: AccessContext): FakeTenantSetting[] {
  return context.state.tenantSettings.filter(
    (row) => row.organisationId === access.organisation.id,
  );
}

/**
 * TenantSettingsService.view plus list's masking. A tenant context never holds the PLATFORM
 * organisation's `tenant_setting.manage_platform`, so a platform-only value is masked here even
 * when it is unset.
 */
function toWire(key: string, row: FakeTenantSetting | undefined) {
  const definition = CATALOGUE.get(key);
  const raw = row?.value ?? definition?.defaultValue ?? null;
  const sensitive = row?.sensitive ?? false;
  const platformAdminOnly = definition?.platformAdminOnly ?? false;
  return {
    key,
    value: platformAdminOnly || (sensitive && raw !== null) ? MASK : raw,
    value_type: definition?.valueType ?? row?.valueType ?? 'STRING',
    sensitive,
    platform_admin_only: platformAdminOnly,
  };
}

/** The service's order: unknown key → 422, platform-only → 403, then `settings.update`. */
function writable(access: AccessContext, key: string): Definition {
  const definition = CATALOGUE.get(key);
  if (!definition) {
    throw problem(422, 'invalid_operation', 'Unknown tenant setting key.');
  }
  if (definition.platformAdminOnly) {
    throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
  }
  requirePermission(access, 'settings.update');
  return definition;
}

const invalidValue = () =>
  problem(422, 'invalid_operation', 'The value is not valid for this setting.');

/** TenantSettingCatalog.canonicalize. ponytail: INT is platform-only, so it 403s first here. */
function canonical(definition: Definition, raw: string): string {
  const value = raw.trim();
  if (definition.valueType === 'BOOLEAN') {
    const lower = value.toLowerCase();
    if (lower !== 'true' && lower !== 'false') throw invalidValue();
    return lower;
  }
  if (definition.valueType === 'TIMEZONE') {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
    } catch {
      throw invalidValue();
    }
    return value;
  }
  if (definition.valueType === 'CURRENCY') {
    const code = value.toUpperCase();
    // ponytail: approximates MoneyPolicy.requireSettlementCurrency (unknown codes and XXX only).
    if (code === 'XXX' || !Intl.supportedValuesOf('currency').includes(code)) {
      throw problem(
        422,
        'accounting.currency_invalid',
        'The currency is not a settlement currency.',
      );
    }
    return code;
  }
  return value;
}

/** TenantSettingsService runs the freeze on createOrUpdate *and* deactivate. */
function requireCurrencyNotFrozen(context: RouteContext, key: string): void {
  if (key === 'base_currency' && context.state.baseCurrencyFrozen) {
    throw problem(
      409,
      'accounting.functional_currency_frozen',
      'The base currency cannot change once the organisation has posted a journal.',
    );
  }
}

export const settingsRoutes: Route[] = [
  route('GET', BASE, (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'settings.view');
    const rows = rowsOf(context, access);
    // Catalogue keys plus stored extras, sorted by key like the service.
    const keys = [...new Set([...CATALOGUE.keys(), ...rows.map((row) => row.key)])].sort();
    const items = keys.map((key) =>
      toWire(
        key,
        rows.find((row) => row.key === key),
      ),
    );
    sendJson(context.res, 200, pageOf(items, context.query));
  }),

  // The intended contract (200 TenantSetting). Dev answers 500 while BG-04 stands; the app never
  // calls this then (SETTINGS_EDIT_ENABLED).
  route('PUT', `${BASE}/:key`, async (context) => {
    const access = tenantAccess(context);
    const key = context.params.key ?? '';
    const body = objectBody(await readBody(context.req), ['value', 'reason']);
    const raw = stringField(body, 'value', { required: true }) ?? '';
    stringField(body, 'reason', { required: false });
    if (raw.trim() === '') {
      throw problem(400, 'validation_failed', 'Validation failed.', [
        { field: 'value', code: 'NotBlank', message: 'must not be blank' },
      ]);
    }
    const definition = writable(access, key);
    const value = canonical(definition, raw);
    sendIdempotent(context, body, () => {
      requireCurrencyNotFrozen(context, key);
      const row = rowsOf(context, access).find((candidate) => candidate.key === key);
      if (row) {
        row.value = value;
      } else {
        context.state.tenantSettings.push({
          organisationId: access.organisation.id,
          key,
          value,
          valueType: definition.valueType,
          sensitive: false,
        });
      }
      return toWire(
        key,
        rowsOf(context, access).find((candidate) => candidate.key === key),
      );
    });
  }),

  route('DELETE', `${BASE}/:key`, async (context) => {
    const access = tenantAccess(context);
    const key = context.params.key ?? '';
    // The body is optional (contract §D); an absent one fingerprints like `{}`.
    const body = objectBody((await readBody(context.req)) ?? {}, ['reason']);
    stringField(body, 'reason', { required: false });
    writable(access, key);
    sendIdempotent(
      context,
      body,
      () => {
        requireCurrencyNotFrozen(context, key);
        // 204 even when nothing was stored (TenantSettingsService.deactivate).
        context.state.tenantSettings = context.state.tenantSettings.filter(
          (row) => row.organisationId !== access.organisation.id || row.key !== key,
        );
        return null;
      },
      204,
    );
  }),
];
```

Register `...settingsRoutes` at the end of the `routes` list in `server.mts`, after 07's
`...businessDateRoutes`. The file runs under plain `node`, so keep erasable syntax and relative
imports only.

Run (form E): `e2e/fake-api-settings.spec.ts e2e/fake-api.spec.ts`. Expected: PASS.

- [ ] **Step 4: Write `e2e/settings.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test';
import { SETTINGS_EDIT_ENABLED } from '../modules/administration/settings/settings-flags';
import {
  A11Y_CASES,
  applyA11yCase,
  enterAdmin,
  expectA11yCaseApplied,
  expectNoSeriousOrCriticalViolations,
} from './support/admin';
import { authenticate } from './support/auth';

const enter = (page: Page) => enterAdmin(page, '/admin/settings', { heading: 'Settings' });
const row = (page: Page, name: string) => page.getByRole('group', { name });
const EDIT_UNAVAILABLE = /Editing isn't available yet/;

async function reset(page: Page, label: string) {
  await row(page, label).getByRole('button', { name: 'Reset to default' }).click();
  const dialog = page.getByRole('dialog', { name: `Reset ${label.toLowerCase()}?` });
  await dialog.getByRole('button', { name: 'Reset to default' }).click();
  return dialog;
}

test.describe('settings', () => {
  // /admin/settings can be the first hit of its route tree under a cold `next dev` compile.
  test.describe.configure({ timeout: 60000 });

  test('shows the catalogue in groups, honest read-only labels, and collapsed extras', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    await expect(
      page
        .getByRole('navigation', { name: 'Administration' })
        .getByRole('link', { name: 'Settings' }),
    ).toBeVisible();
    await expect(row(page, 'Default timezone')).toContainText('Africa/Nairobi');
    await expect(row(page, 'Base currency')).toContainText('KES · Kenyan Shilling');
    await expect(row(page, 'Maker-checker for user invites')).toContainText(
      'Maker-checker always applies',
    );
    await expect(row(page, 'Automatic business date advance')).toContainText(
      'Automatic advance is not available yet',
    );
    await expect(row(page, 'Audit retention')).toContainText('Managed by the platform');
    await expect(row(page, 'Audit retention').getByRole('button')).toHaveCount(0);
    await expect(page.getByText('***REDACTED***')).toHaveCount(0);

    await page.getByRole('button', { name: 'Other stored settings (2)' }).click();
    await expect(row(page, 'settings.operational')).toBeVisible();
    await expect(row(page, 'business-date.timezone').getByRole('button')).toHaveCount(0);
  });

  test('ships editing disabled with a visible explanation (BG-04)', async ({
    context,
    page,
  }, testInfo) => {
    test.skip(SETTINGS_EDIT_ENABLED, 'The PUT probe passed: editing ships enabled.');
    await authenticate(context, testInfo);
    await enter(page);

    await expect(
      row(page, 'Default timezone').getByRole('button', { name: 'Edit' }),
    ).toBeDisabled();
    await expect(row(page, 'Base currency').getByRole('button', { name: 'Edit' })).toBeDisabled();
    await expect(page.getByRole('region', { name: 'Locale & currency' })).toContainText(
      EDIT_UNAVAILABLE,
    );
  });

  test('edits the timezone from the runtime list', async ({ context, page }, testInfo) => {
    test.skip(!SETTINGS_EDIT_ENABLED, 'BG-04: editing ships disabled until the PUT probe passes.');
    await authenticate(context, testInfo);
    await enter(page);

    await row(page, 'Default timezone').getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit default timezone' });
    await dialog.getByRole('combobox', { name: 'Timezone' }).selectOption('Africa/Kampala');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(row(page, 'Default timezone')).toContainText('Africa/Kampala');
  });

  test('resets a stored value to its default', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    await row(page, 'Default timezone').getByRole('button', { name: 'Reset to default' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reset default timezone?' });
    await dialog
      .getByRole('textbox', { name: 'Reason (optional)' })
      .fill('Use the platform default');
    await dialog.getByRole('button', { name: 'Reset to default' }).click();

    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Default timezone reset to default' }),
    ).toBeVisible();
    await expect(row(page, 'Default timezone')).toContainText('Not set');
    await expect(
      row(page, 'Default timezone').getByRole('button', { name: 'Reset to default' }),
    ).toHaveCount(0);
  });

  test('explains a frozen base currency instead of resetting it', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'settings-currency-frozen');
    await enter(page);

    const dialog = await reset(page, 'Base currency');
    await expect(dialog.getByRole('alert')).toContainText('already posted journals');
    await page.keyboard.press('Escape');
    await expect(row(page, 'Base currency')).toContainText('KES');
  });

  test('offers no changes without settings.update', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'settings-read-only');
    await enter(page);

    await expect(row(page, 'Base currency')).toContainText('KES');
    await expect(
      page.getByRole('main').getByRole('button', { name: /^(Edit|Reset to default)$/ }),
    ).toHaveCount(0);
    await expect(page.getByText(EDIT_UNAVAILABLE)).toHaveCount(0);
  });

  test('shows the forbidden state and no nav entry without settings.view', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'no-settings-permission');
    await enter(page);

    await expect(page.getByText("You don't have permission")).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Administration' })
        .getByRole('link', { name: 'Settings' }),
    ).toHaveCount(0);
  });

  for (const a11yCase of A11Y_CASES) {
    test(`has no serious a11y violations (${a11yCase.colorScheme}, ${a11yCase.label}; extras and dialog open)`, async ({
      context,
      page,
    }, testInfo) => {
      await applyA11yCase(page, a11yCase);
      await authenticate(context, testInfo);
      await enter(page);

      // Expanded, so the long stored value is on screen for the 375 px no-scroll check.
      await page.getByRole('button', { name: /Other stored settings/ }).click();
      await expect(row(page, 'settings.operational')).toBeVisible();
      await expectA11yCaseApplied(page, a11yCase);
      await expectNoSeriousOrCriticalViolations(page);

      await row(page, 'Base currency').getByRole('button', { name: 'Reset to default' }).click();
      await expect(page.getByRole('dialog', { name: 'Reset base currency?' })).toBeVisible();
      await expectNoSeriousOrCriticalViolations(page);
    });
  }
});
```

Run (form E): `e2e/settings.spec.ts`. Expected: PASS, with exactly one of the two flag tests
skipped.

- [ ] **Step 5: Record the probe in the docs**

Use the probe outcome Task 1 recorded. `<date>` is the probe's date, copied from that RUN-STATE
line; never assume it.

- `docs/backend-gaps.md`, BG-04: replace the "Frontend handling" bullet according to the outcome.
  - **Probe failed** (500), so the flag is `false`. Use two bullets:
    - **Live probe (`<date>`):** confirmed. A `PUT` with an `Idempotency-Key` returned
      `500 internal_error`, and the value was unchanged.
    - **Frontend handling:** editing ships disabled behind `SETTINGS_EDIT_ENABLED`
      (`modules/administration/settings/settings-flags.ts`), with the reason shown on the Locale &
      currency card. Reset to default (`DELETE`, 204) works. Flip the flag when this closes.
  - **Probe passed**, so the flag is `true`. Use two bullets:
    - **Live probe (`<date>`):** not reproduced. A `PUT` with an `Idempotency-Key` returned 200
      and read back unchanged.
    - **Frontend handling:** editing ships enabled. Close this entry once the backend change is
      identified.
  - **No PASS or FAIL recorded** (not run, or ambiguous), so the flag is `false` by Ruling 1:
    - keep the "Found by source reading; to be confirmed live" wording;
    - replace only the "Frontend handling" bullet, with the failed branch's text;
    - ledger "PUT probe still owed; BG-04 unconfirmed".
- The contract, §E.3:
  - In the `PUT /tenant/settings/{key}` row, set the Success cell to either
    `intended 200 TenantSetting — **500, confirmed live** (see backend gaps)` (failed, 71
    characters) or `200 TenantSetting (probe passed <date>)` (passed). A failed probe's date goes
    only in the BG-04 bullet, because the dated cell (82 characters) would outgrow the column (74
    characters). With no recorded outcome, leave the cell as it is.
  - Whatever the outcome, append to the `DELETE /tenant/settings/{key}` Notes cell:
    `; the base-currency freeze applies too (409 accounting.functional_currency_frozen)`.
  - Keep each edited cell no longer than its column's longest cell. Otherwise prettier re-pads the
    whole table, and a re-padded table conflicts with 08's edits.

Run (form P): both doc files.

- [ ] **Step 6: Commit** (form C, three commits: the fake-API registries together, then the specs,
      then the docs)

Before the first commit, format and lint every Task 5 code file. The pre-commit hook's
`pnpm check` runs `prettier --check .` and `eslint . --max-warnings=0` over the whole working tree,
so the specs, still unstaged at the first commit, must already be clean. lint-staged's globs
(`*.{ts,tsx,js,mjs}`) also skip the `.mts` files, so nothing fixes those on commit.

```bash
# form P
flock -E 75 -w 240 /tmp/finaxis-e2e.lock pnpm exec prettier --write e2e/fake-api/state.mts e2e/fake-api/scenarios.mts e2e/fake-api/server.mts e2e/fake-api/routes/settings.mts e2e/fake-api-settings.spec.ts e2e/settings.spec.ts
# focused lint, with form P's lock prefix
flock -E 75 -w 240 /tmp/finaxis-e2e.lock pnpm exec eslint --max-warnings=0 e2e/fake-api/state.mts e2e/fake-api/scenarios.mts e2e/fake-api/server.mts e2e/fake-api/routes/settings.mts e2e/fake-api-settings.spec.ts e2e/settings.spec.ts
```

Expected: eslint exits 0. Fix any finding in the source; never disable a rule.

`git add e2e/fake-api/state.mts e2e/fake-api/scenarios.mts e2e/fake-api/server.mts e2e/fake-api/routes/settings.mts`

```
test(fake-api): add tenant settings routes, stored rows, and settings scenarios

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

`git add e2e/fake-api-settings.spec.ts e2e/settings.spec.ts`

```
test(e2e): cover the settings catalogue, reset, the frozen currency, gating, and a11y

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

`git add docs/backend-gaps.md docs/superpowers/specs/2026-09-25-admin-prototype-parity-api-contract.md`

```
docs(settings): record the live PUT probe and the freeze on reset

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

- [ ] **Step 7: Gates** (form G, each in the background, polled with Monitor)

```bash
pnpm check
pnpm build
pnpm test:e2e
```

Expected: all pass. Record the gate evidence line (lane rules §2.8).

Then run the ui-ux-pro-max pre-delivery checklist (`references/pro-rules.md`) and a visual pass
on your lane's app port, in fake-API E2E mode. Cover `/admin/settings` in light and dark, at 1280
and 375 px, with the extras expanded and the reset dialog open.

- Each row's label, value and actions align.
- At 375 px the long value truncates with its `title` and there is no horizontal scroll.
- Tab reaches every enabled Edit and Reset button, and the accordion summary, with a visible ring.
- The disabled Edit shows its tooltip on hover.

Record the result in the task report.

- [ ] **Step 8: Ledger**

- Write the nine Rulings from Global Constraints as `Ruling:` lines. Include Task 1's probe line
  and the flag value.
- Record the disjointness check: the only shared files are the append-only registries and the docs
  in the table.
- Record "live read pending L2 (controller)" in `LANE-B.md`.
- Then run the lane rules' §7 self-integration.

### Task 6: Live check (controller, lane X, live batch L2)

Only X runs live checks (lane rules §9). The runbook's §10 schedules 13's reads in **L2**, at B4, on
the tip that contains 13. This task never runs in Y and never blocks integration. It gates
publishing.

- [ ] **Step 1: Set up**, per runbook §10:
  - a non-E2E dev server on 3100 against dev, with the heavy lock held by a background fd-lock
    shell;
  - the user signs in themselves; the agent never types credentials;
  - the user names the dev tenant.

- [ ] **Step 2: Reads** (no approval needed beyond the sign-in)

On `/admin/settings`, confirm:

- Settings sits in the rail between Roles & permissions (once 09 lands) and Business date.
- The three groups show dev's six catalogue keys.
- The controls read "Maker-checker always applies" and "Automatic advance is not available yet".
- Audit retention reads "Managed by the platform" and "Hidden". The literal mask never appears.
- "Other stored settings" lists dev's stored extras. Compare them with contract §H
  (`settings.operational`, `business-date.timezone`). Record any other key and its `value_type`.
- The Edit state matches the flag: disabled with the visible reason when it is `false`.
- No console errors, and no error state.

- [ ] **Step 3: Mutations** (ask before **each** one, on the tenant the user names)

- **Flag `false`:**
  - Tell the user that Reset drops the value to its default (not set), and that the old value
    **can't be restored through the API while BG-04 stands**.
  - Reset only a key the user designates after hearing that, and confirm the toast, "Not set" and
    that Reset disappears.
  - If the user declines, ledger "DELETE verified against the fake only".
- **Flag `true`:**
  - The safe mutation is Edit writing the key's **current** value, with a reason. Confirm the
    toast and the unchanged value.
  - A Reset followed by an Edit that restores the value runs only if the user approves both.
- Never touch `base_currency` on a tenant that may have posted journals unless the user approves
  that specific action. Expect the frozen explanation, not a change.

- [ ] **Step 4: Record**

- Write the results in 13's ledger (`progress.md`) with the SHA checked.
- A contract surprise goes into the contract document and, if it is a backend defect, into
  `docs/backend-gaps.md`. The fix goes on 13 through a boundary cascade (runbook §9), never on a
  higher branch.
- 13 is publishable only after this read check on its final SHA.
