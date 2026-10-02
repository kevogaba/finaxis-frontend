# PR 07b: Record Kit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [plan index](./2026-09-25-admin-parity-00-index.md)
> and the [parallel lane rules](./2026-09-27-admin-parity-parallel-lanes.md) first.

**Goal:** Ship the shared building blocks every record page from PR 08 on reuses, with no page
consuming them yet:

- a record hero and link tabs;
- a record audit tab with switchable views;
- a URL sort allow-list;
- an ID copy control;
- forbidden and "switch to All branches" states;
- a confirm dialog;
- the theme-wide focus ring that Tabs needs;
- three status tones;
- a scope-aware fake permission check;
- shared admin E2E helpers.

**Architecture:**

- Server Components by default: `RecordHero`, `ForbiddenState`, `BranchContextState` and the async
  `RecordAuditTab`.
- Client leaves only where interaction needs one: `RecordTabs` (active tab from `usePathname`),
  `AuditViewToggle` (URL through `useListNavigation`), `CopyIdButton`, `SwitchToAllBranchesButton`
  and `ConfirmDialog`.
- The audit row view-model moves out of the audit route into `modules/administration/audit/audit-rows.ts`,
  so the audit page and `RecordAuditTab` share it.
- MUI 9.4's `focusVisible` theme option replaces the hand-written ButtonBase ring, so a Tab's ring
  insets itself inside the Tabs scroller.

**Tech Stack:** MUI 9.4 (`Tabs`/`Tab` as links, `ToggleButtonGroup`, `Avatar`, `Dialog`, the
`focusVisible` theme option), React 19 `useActionState`, Next.js 16 (`usePathname`, `redirect`),
Vitest + RTL, Playwright.

**Spec:** [`…-design.md`](../specs/2026-09-25-admin-prototype-parity-design.md):

- §6.2 (sort allow-list), §6.5 (the guided All branches state), §6.6–6.7 (forbidden state);
- §7.3 (Tabs, focus);
- §9 (record page, building blocks, ID copy affordance);
- §10.1 (record Audit tabs with a `ToggleButtonGroup` of views);
- contract §E.4 (TENANT versus BRANCH permission scope) and §F (statuses).

**Base:** `F_06`, layer 06's final SHA, recorded in `RUN-STATE.md` and in
`refs/lane-base/07b-record-kit`. Never fork from the live 06 HEAD while its fix wave may still move.
**Branch:** `lane/07b-record-kit` in lane Y. The controller registers it as
`admin-parity/07b-record-kit`, between 06 and 15.

## Global Constraints

See the index and the lane rules. Additionally:

**Command forms.** Every command below shows only the command part. Run it through the lane rules'
§2 form for your lane (the runbook's §0): literal absolute paths, the heavy lock,
`VITEST_MAX_WORKERS=3`, and your own ports. For lane Y:

```
# T — focused unit tests (foreground)
flock -E 75 -w 240 /tmp/finaxis-e2e.lock env VITEST_MAX_WORKERS=3 pnpm test:run <paths>

# E — scoped E2E (run_in_background + log + Monitor). First, `ss -ltn '( sport = :3200 or sport = :3299 )'`
#     must show no listener you didn't start.
flock -E 75 -w 1800 /tmp/finaxis-e2e.lock env VITEST_MAX_WORKERS=3 PORT=3200 FAKE_API_PORT=3299 pnpm test:e2e <specs>

# C — commit (run_in_background + Monitor). Write the message to <your scratchpad>/commit-msg.txt
#     with the Write tool first. The husky wrapper locks the hook, so never put git inside flock,
#     and never commit before RUN-STATE records the wrapper as installed and self-tested.
git add <whole files>
VITEST_MAX_WORKERS=3 git commit -F <your scratchpad>/commit-msg.txt

# G — gates: pnpm check, pnpm build, pnpm test:e2e (each run_in_background + Monitor)
flock -E 75 -w 1800 /tmp/finaxis-e2e.lock env VITEST_MAX_WORKERS=3 PORT=3200 FAKE_API_PORT=3299 <gate command>
```

Exit 75 means the lock wait timed out: retry, don't skip.

If this layer falls back to X (lane rules §10: "the 07b kit becomes 08's Task 0"), the same forms
apply with ports 3100/3199.

**Disjointness with plan 07.** The two layers build in parallel from F_06. Re-grep this table
against 07's final file list after 07's pre-flight. Any overlap moves that item to 08.

| 07b touches                                                                                                                 | Plan 07 (+A1/A2/N/R)                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `docs/superpowers/plans/2026-09-27-*.md` (new)                                                                              | —                                                                                                         |
| `lib/api/list-sort.ts` + test (new)                                                                                         | edits `tenant-api.ts`, `problem.ts`, `action-result.ts` — disjoint                                        |
| `components/data-display/status-chip.tsx` + test                                                                            | imports `statusTone` only                                                                                 |
| `theme/create-finaxis-theme.ts`, `theme/create-finaxis-theme.render.test.tsx`                                               | —                                                                                                         |
| `components/data-display/{record-hero,record-tabs,copy-id-button,forbidden-state,confirm-dialog}.tsx` + one test each (new) | adds `section-card.tsx`, `reason-dialog.tsx`; **appends to `data-display.test.tsx` — 07b never edits it** |
| `components/context/switch-to-all-branches-button.tsx` + test, `components/context/all-branches-copy.ts` (new)              | —                                                                                                         |
| `modules/administration/audit/audit-rows.ts` + test, `components/{audit-view-toggle,record-audit-tab}.tsx` + tests (new)    | —                                                                                                         |
| `app/(authenticated)/admin/audit/page.tsx`, `modules/administration/audit/components/audit-event-table.tsx`                 | —                                                                                                         |
| `e2e/fake-api/access.mts`                                                                                                   | **R must live in `e2e/fake-api/audit-log.mts`** (lane rules §3)                                           |
| `e2e/fake-api-access.spec.ts`, `e2e/support/admin.ts`, `e2e/admin-kit.spec.ts` (new)                                        | edits `state.mts`, `scenarios.mts`, `server.mts`, `fake-api.spec.ts` — 07b edits none of them             |
| —                                                                                                                           | `README.md`, `AGENTS.md`, `docs/deployment.md` — **07b edits none of them**                               |

**Scope.**

- No page consumes the kit in this layer. Each component is proven by its own RTL test file. The
  E2E surface is:
  - the refactored audit page (the existing `e2e/audit.spec.ts`);
  - the theme ring (the existing axe matrices);
  - the fake scope spec;
  - the helpers' smoke spec.
- Existing specs stay untouched.
- **No live read check.** 07b reads no endpoint that 05/06 don't already read (audit list/detail,
  users, branches, tenant, select-organisation).
- No `README.md`, `AGENTS.md` or index edits. 07 edits the first two in parallel, and the index is
  controller-owned. 08, the kit's first consumer, adds the README entry.

**Frozen once integrated.** The kit props below become frozen when 07b integrates (lane rules §6).
They were walked against every known consumer: branch §10.3, role §10.4, user §10.5 (four audit
views), approvals §10.6 history, profile §10.9 (Activity is an actor view), and tenant record §11.2
(no Audit tab; it is a Gap). Don't rename or reshape them in review; extend them only with optional
props.

**Rulings to record in the ledger** (`Ruling:` lines, so neither 07's pre-flight nor 08 reopens
them):

1. StatusChip maps CLOSED and ARCHIVED to the neutral `default` tone, and DEPRECATED to `warning`.
   - CLOSED is a routine business-date state (OPEN → CLOSING → CLOSED, plan 07) and also a terminal
     branch state. One neutral tone leaves 07's chip unchanged after the rebase.
   - A caller that needs a different tone passes `tone`.
2. `ConfirmDialog` is generic over a minimal `ConfirmOutcome`, rather than importing 07's
   `ActionResult`, which doesn't exist at F_06. 07's `FormAction` fits it structurally, and a
   compile-time fixture pins that.
3. `RecordAuditTab` has no drawer. Its "View event" and actor links open `/admin/audit` filtered to
   the same view, with the event's drawer open. Its section header is inline because `SectionCard`
   (07) isn't at F_06; switching to `SectionCard` after 07 integrates is an internal change.
4. List sort lives in the URL as `sortBy` plus `sortDir` (`ASC`/`DESC`, case-insensitive). A valid
   `sortBy` with a missing or invalid `sortDir` sorts ascending. Anything off the allow-list falls
   back to the caller's default.
5. MUI's `focusVisible` option replaces the `MuiButtonBase` focus override. The ring keeps its
   current look (2 px solid `palette.focus`, offset 2 px). Spec §7.3's "3 px at 35 %" stays a
   visual-pass item.
6. There is no 07b live read, and no README/AGENTS/index edit (see above).

## Review Focus

Pins the index's item 2 (double submit: `ConfirmDialog`, Task 5) and item 3 (branch cardinality:
`BranchContextState` and `SwitchToAllBranchesButton`, Task 5). Adds:

1. **An unknown sort field never reaches the backend**, because an invalid `sort_by` is a 500
   there. Task 2, `list-sort.test.ts`.
2. **A Tab's focus ring is never clipped by the Tabs scroller, and ordinary buttons keep an outset
   ring.** Task 3 render tests.
3. **Users with zero branches, exactly one branch, or duplicate assignment rows for one branch
   (HOME + OPERATE) are never offered a meaningless "All branches" option** (index item 3).
   - `BranchContextState({ allBranchesAvailable: false })` renders no switch button
     (`forbidden-state.test.tsx`).
   - For stale data, the button's fallback never claims the switch worked: the backend re-pins
     the only branch, and a duplicate-row single branch is pinned again, as context selection does
     (`switch-to-all-branches-button.test.tsx`).
   - Zero-branch members are always at institution level, so they never see the state.
   - Task 5.
4. **A BRANCH grant never satisfies a tenant-scope check**, and never counts outside its branch.
   Task 7, `e2e/fake-api-access.spec.ts`.
5. **The audit page renders exactly as before the row extraction.** Task 6: `audit-rows.test.ts`
   plus the unchanged `e2e/audit.spec.ts`.

**Final-review lens** (not a Review Focus item, because it has no pinning test): the kit props
freeze at integration, so the finish-mode lenses check every Produces signature in Tasks 4–7
against its consumers' spec sections. Those are branch §10.3, role §10.4, user §10.5, approvals
§10.6, profile §10.9 and tenant record §11.2.

---

### Task 1: Commit the plan and the lane rules

**Files:**

- Create: `docs/superpowers/plans/2026-09-27-admin-parity-07b-record-kit.md` (this file)
- Create: `docs/superpowers/plans/2026-09-27-admin-parity-parallel-lanes.md`

**Interfaces:**

- Consumes: the two files the controller wrote to X's `.superpowers/sdd/_jit/`.
- Produces: the committed copies. The lanes file's committed copy becomes authoritative and frozen
  (its own header explains why).

- [ ] **Step 1: Copy both files into the lane**

```bash
cp /home/ogaba/finaxis/finaxis-frontend/.claude/worktrees/admin-parity/.superpowers/sdd/_jit/2026-09-27-admin-parity-07b-record-kit.md /home/ogaba/finaxis/finaxis-frontend/.claude/worktrees/admin-parity-lane-b/docs/superpowers/plans/
cp /home/ogaba/finaxis/finaxis-frontend/.claude/worktrees/admin-parity/.superpowers/sdd/_jit/2026-09-27-admin-parity-parallel-lanes.md /home/ogaba/finaxis/finaxis-frontend/.claude/worktrees/admin-parity-lane-b/docs/superpowers/plans/
```

Don't edit the index. The controller adds the 07b row when it registers the layer.

- [ ] **Step 2: Commit** (form C)

`git add docs/superpowers/plans/2026-09-27-admin-parity-07b-record-kit.md docs/superpowers/plans/2026-09-27-admin-parity-parallel-lanes.md`

Message:

```
docs(plans): add plan 07b and the parallel-lane rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

(The subject follows the runbook's §7 step 3 form. A subagent's trailer names its own model, per
the carried ledger rule.)

### Task 2: List sort allow-list and the new status tones

**Files:**

- Create: `lib/api/list-sort.ts`, `lib/api/list-sort.test.ts`
- Modify: `components/data-display/status-chip.tsx`, `components/data-display/status-chip.test.tsx`

**Interfaces:**

- Consumes: nothing. `list-sort.ts` stays import-free, like `paging.ts`, so a later client sort
  control can import it.
- Produces:
  - `type SortDir = 'ASC' | 'DESC'`
  - `interface ListSort<Field extends string> { by: Field; dir: SortDir }`
  - `parseListSort<Field extends string>(params: URLSearchParams, allowed: readonly Field[], fallback: ListSort<Field>): ListSort<Field>`,
    which reads the URL params `sortBy` and `sortDir`.
  - `sortQuery<Field extends string>(sort: ListSort<Field>): { sort_by: Field; sort_dir: SortDir }`,
    to spread into `toQueryString`.
  - `statusTone`: `ARCHIVED → 'default'`, `CLOSED → 'default'`, `DEPRECATED → 'warning'`.

- [ ] **Step 1: Write the failing tests**

`lib/api/list-sort.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseListSort, sortQuery, type ListSort } from './list-sort';

const FIELDS = ['branchName', 'branchCode', 'createdAt'] as const;
type Field = (typeof FIELDS)[number];
const DEFAULT: ListSort<Field> = { by: 'createdAt', dir: 'DESC' };
const parse = (query: string) => parseListSort(new URLSearchParams(query), FIELDS, DEFAULT);

describe('list sort', () => {
  it('reads an allow-listed field and direction from the URL', () => {
    expect(parse('sortBy=branchName&sortDir=DESC')).toEqual({ by: 'branchName', dir: 'DESC' });
    expect(parse('sortBy=branchCode&sortDir=asc')).toEqual({ by: 'branchCode', dir: 'ASC' });
  });

  it('falls back for a missing or non-allow-listed field (an unknown sort_by is a backend 500)', () => {
    expect(parse('')).toEqual(DEFAULT);
    expect(parse('sortBy=branch_name&sortDir=ASC')).toEqual(DEFAULT);
    expect(parse('sortBy=passwordHash')).toEqual(DEFAULT);
  });

  it('sorts an allow-listed field ascending when the direction is missing or invalid', () => {
    expect(parse('sortBy=branchName')).toEqual({ by: 'branchName', dir: 'ASC' });
    expect(parse('sortBy=branchName&sortDir=sideways')).toEqual({ by: 'branchName', dir: 'ASC' });
  });

  it('maps to the snake_case wire params', () => {
    expect(sortQuery({ by: 'branchName', dir: 'ASC' })).toEqual({
      sort_by: 'branchName',
      sort_dir: 'ASC',
    });
  });
});
```

In `components/data-display/status-chip.test.tsx`, add three rows to the `it.each` table, after
`['MEDIUM', 'warning'],`:

```ts
    ['CLOSED', 'default'],
    ['ARCHIVED', 'default'],
    ['DEPRECATED', 'warning'],
```

Run (form T): `pnpm test:run lib/api/list-sort.test.ts components/data-display/status-chip.test.tsx`.
Expected: FAIL. `list-sort` doesn't exist, and DEPRECATED is `default`. The CLOSED and ARCHIVED
rows already pass; they pin Ruling 1.

- [ ] **Step 2: Implement `lib/api/list-sort.ts`**

```ts
/**
 * List sort state in the URL (`sortBy`, `sortDir`) → the backend's `sort_by`/`sort_dir` (spec
 * §6.2). `sort_by` values are camelCase and endpoint-specific; anything outside the caller's
 * allow-list is dropped before the request — the backend answers an unknown value with a 500.
 * Import-free (like paging.ts) so a client sort control can use it.
 */
export type SortDir = 'ASC' | 'DESC';

export interface ListSort<Field extends string> {
  by: Field;
  dir: SortDir;
}

export function parseListSort<Field extends string>(
  params: URLSearchParams,
  allowed: readonly Field[],
  fallback: ListSort<Field>,
): ListSort<Field> {
  const requested = params.get('sortBy');
  const by = allowed.find((field) => field === requested);
  if (by === undefined) return fallback;
  return { by, dir: params.get('sortDir')?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC' };
}

export function sortQuery<Field extends string>(
  sort: ListSort<Field>,
): { sort_by: Field; sort_dir: SortDir } {
  return { sort_by: sort.by, sort_dir: sort.dir };
}
```

- [ ] **Step 3: Add the tones**

In `components/data-display/status-chip.tsx`, add to `TONES` after `MEDIUM: 'warning',`:

```ts
  // Explicitly neutral: CLOSED is also business date's routine end-of-day state (plan 07), so it
  // must never read as an error; a terminal branch passes `tone` if it needs one.
  CLOSED: 'default',
  ARCHIVED: 'default',
  DEPRECATED: 'warning',
```

Run (form T): the same two files. Expected: PASS.

- [ ] **Step 4: Commit** (form C)

`git add lib/api/list-sort.ts lib/api/list-sort.test.ts components/data-display/status-chip.tsx components/data-display/status-chip.test.tsx`

```
feat(api): add a URL sort allow-list and status tones for closed, archived, and deprecated

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

### Task 3: Adopt MUI's `focusVisible` ring (the deferred layer-02 ruling)

**Files:**

- Modify: `theme/create-finaxis-theme.ts`, `theme/create-finaxis-theme.render.test.tsx`

**Interfaces:**

- Consumes: MUI 9.4's `ThemeOptions.focusVisible` (`node_modules/@mui/material/styles/focusVisible.js`).
  `ButtonBase`, `Link`, `Chip`, `ToggleButtonGroup` and others spread the ring on
  `.Mui-focusVisible`. `Tab` insets it with `applyInsetFocusVisible(3)`.
- Produces: `theme.focusVisible`, with `outlineColor` equal to `theme.vars.palette.focus`. There is
  no `MuiButtonBase` focus override any more.

- [ ] **Step 1: Load skills**

Invoke `material-ui-theming` and `material-ui-styling`.

- [ ] **Step 2: Write the failing tests**

Append to `theme/create-finaxis-theme.render.test.tsx`. Add `Button`, `Tab` and `Tabs` imports
next to the existing MUI imports. The file's `theme`, `varName`, `allEmittedCss` and `hashClassOf`
are reused.

```tsx
import Button from '@mui/material/Button';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
```

```tsx
/** The value the cascade applies for `property` on `.<hash><suffix>`: the last declaration across
 * every emitted rule with exactly that selector (emotion can split one class into several rules). */
function effectiveDeclaration(
  css: string,
  hashClass: string,
  selectorSuffix: string,
  property: string,
): string | undefined {
  const escapedHash = hashClass.replace(/[.:#]/g, '\\$&');
  const pattern = new RegExp(`\\.${escapedHash}${selectorSuffix}\\{([^}]*)\\}`, 'g');
  let value: string | undefined;
  for (const match of css.matchAll(pattern)) {
    for (const declaration of (match[1] ?? '').split(';')) {
      const colon = declaration.indexOf(':');
      if (colon > 0 && declaration.slice(0, colon).trim() === property) {
        value = declaration.slice(colon + 1).trim();
      }
    }
  }
  return value;
}

describe('focus ring (MUI focusVisible; deferred from layer 02)', () => {
  it('draws the theme-wide ring in the focus token', () => {
    const ring = theme.focusVisible;
    if (!ring) throw new Error('theme.focusVisible is not enabled');
    expect(ring).toMatchObject({ outlineStyle: 'solid', outlineWidth: 2 });
    expect(varName(ring.outlineColor ?? '')).toBe(varName(theme.vars.palette.focus));
  });

  it('insets a Tab ring so the Tabs scroller cannot clip it', () => {
    const { getByRole } = renderWithProviders(
      <Tabs value={0} aria-label="Record sections">
        <Tab label="Overview" />
      </Tabs>,
    );
    const hash = hashClassOf(getByRole('tab', { name: 'Overview' }));
    const css = allEmittedCss();

    expect(effectiveDeclaration(css, hash, '', '--_focusVisible-offset')).toBe('-3');
    // The old MuiButtonBase override re-declared a literal `outline-offset: 2px` after MUI's
    // var-based offset, which re-outset the Tab ring — the effective value must be the calc.
    expect(effectiveDeclaration(css, hash, '\\.Mui-focusVisible', 'outline-offset')).toMatch(
      /^calc\(var\(--_focusVisible-offset/,
    );
  });

  it('keeps an ordinary button ring outset, in the focus colour', () => {
    const { getByRole } = renderWithProviders(<Button>Save</Button>);
    const hash = hashClassOf(getByRole('button', { name: 'Save' }));
    const css = allEmittedCss();

    expect(effectiveDeclaration(css, hash, '', '--_focusVisible-offset')).toBe('1');
    expect(
      varName(effectiveDeclaration(css, hash, '\\.Mui-focusVisible', 'outline-color') ?? ''),
    ).toBe(varName(theme.vars.palette.focus));
  });
});
```

Run (form T): `pnpm test:run theme`. Expected: FAIL. `theme.focusVisible` is undefined, and the
Tab has no `--_focusVisible-offset`.

If emotion serializes a declaration differently from `name:value;` (for example, with spaces),
adapt `effectiveDeclaration`'s parsing, not the assertions.

- [ ] **Step 3: Implement**

In `theme/create-finaxis-theme.ts`:

1. Above `createFinaxisTheme`, add:

   ```ts
   const CSS_VAR_PREFIX = 'finaxis';
   ```

2. Change `cssVarPrefix: 'finaxis',` to `cssVarPrefix: CSS_VAR_PREFIX,`.
3. Add this option to the `createTheme({...})` object, after `colorSchemes`:

   ```ts
   // MUI 9.4's keyboard focus ring, spread on `.Mui-focusVisible` by ButtonBase, Link, Chip,
   // Tab, ToggleButtonGroup, … Clip-prone components (Tab inside the Tabs scroller, MenuItem)
   // inset it themselves. Default solid/2px/offset 2px keeps the ring's existing look; the colour
   // is the focus token's CSS var, written out because `theme.vars` doesn't exist yet here (the
   // render test pins it to `theme.vars.palette.focus`).
   focusVisible: { outlineColor: `var(--${CSS_VAR_PREFIX}-palette-focus)` },
   ```

4. Delete the whole `MuiButtonBase` entry under `components`:

   ```ts
         MuiButtonBase: {
           styleOverrides: {
             root: ({ theme }) => ({
               '&.Mui-focusVisible': {
                 outline: `2px solid ${theme.vars.palette.focus}`,
                 outlineOffset: 2,
               },
             }),
           },
         },
   ```

Run (form T): `pnpm test:run theme`. Expected: PASS, including the existing Chip hover/focus test.
The soft variant's inset `boxShadow` is emitted after the ring's, so it still wins.

Then `grep -rn "focusVisible\|outline" theme/*.test.* components/**/*.test.tsx` to make sure no
other test pins the deleted override.

- [ ] **Step 4: Commit** (form C)

`git add theme/create-finaxis-theme.ts theme/create-finaxis-theme.render.test.tsx`

```
feat(theme): adopt MUI's focusVisible ring so Tab rings inset inside the Tabs scroller

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

### Task 4: `RecordHero`, `RecordTabs`, `CopyIdButton`

**Files (all under `components/data-display/`):**

- Create: `record-hero.tsx`, `record-hero.test.tsx`
- Create: `record-tabs.tsx` (client), `record-tabs.test.tsx`
- Create: `copy-id-button.tsx` (client), `copy-id-button.test.tsx`

**Interfaces:**

- Consumes:
  - `components/navigation/next-link.tsx` and `initialsOf` (`components/shell/initials.ts`);
  - `useToast` (`components/providers/toast-provider.tsx`) and `shortId` (`lib/format.ts`);
  - the palette paths `avatar.bg`/`avatar.fg`/`status.infoBg`/`primary.main`;
  - Task 3's ring, for the Tabs.
- Produces:
  - `type RecordAvatar = { kind: 'person'; name: string } | { kind: 'icon'; icon: ReactNode }`
  - `RecordHero({ back?: { href: string; label: string }; avatar: RecordAvatar; eyebrow: string; title: string; subtitle?: string; status?: ReactNode; actions?: ReactNode })`.
    A Server Component that renders the page's only `h1`.
  - `interface RecordTab { href: string; label: string }`
  - `RecordTabs({ label: string; tabs: readonly RecordTab[] })`. A client component: a `nav`
    landmark named `label` around link tabs. The selected tab is the deepest tab whose `href` is
    the current path or an ancestor of it, and it carries `aria-current="page"`.
  - `CopyIdButton({ value: string; label?: string })`, where `label` defaults to `'ID'`. A client
    component showing `shortId(value)` with the full value in its `title`, and a
    `Copy <label>` icon button that toasts `<label> copied`, or explains a blocked clipboard.

- [ ] **Step 1: Load skills**

Invoke `frontend-design` and `ui-ux-pro-max`: the design-system command with
`"record detail page hero tabs"`, plus `--domain ux "record page header tabs navigation copy id"`.
The prototype's record page is the reference:

- `/home/ogaba/Downloads/finaxis-admin-prototype-source-v5/finaxis-admin-prototype/src/App.jsx:1560-1625`;
- `src/styles.css:246-262`.

- [ ] **Step 2: Write the failing tests**

`components/data-display/record-hero.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import Button from '@mui/material/Button';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { RecordHero } from './record-hero';
import { StatusChip } from './status-chip';

describe('RecordHero', () => {
  it('renders the back link, the only h1, eyebrow, subtitle, status, and actions', () => {
    renderWithProviders(
      <RecordHero
        back={{ href: '/admin/branches', label: 'Back to branches' }}
        avatar={{ kind: 'icon', icon: <AccountTreeOutlined /> }}
        eyebrow="Administration · Branch record"
        title="Westlands Branch"
        subtitle="WESTLANDS · Operations"
        status={<StatusChip value="SUSPENDED" />}
        actions={<Button>Reactivate</Button>}
      />,
    );

    expect(screen.getByRole('link', { name: 'Back to branches' })).toHaveAttribute(
      'href',
      '/admin/branches',
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Westlands Branch' })).toBeInTheDocument();
    expect(screen.getByText('Administration · Branch record')).toBeInTheDocument();
    expect(screen.getByText('WESTLANDS · Operations')).toBeInTheDocument();
    expect(screen.getByText('Suspended')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
  });

  it('shows a person as decorative initials and needs no back link', () => {
    renderWithProviders(
      <RecordHero
        avatar={{ kind: 'person', name: 'Mary Wanjiku' }}
        eyebrow="Administration · User record"
        title="Mary Wanjiku"
      />,
    );

    expect(screen.getByText('MW')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('heading', { level: 1, name: 'Mary Wanjiku' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
```

`components/data-display/record-tabs.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { RecordTabs } from './record-tabs';

let pathname = '/admin/branches/b1/users';
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, usePathname: () => pathname };
});

const TABS = [
  { href: '/admin/branches/b1', label: 'Overview' },
  { href: '/admin/branches/b1/users', label: 'Users' },
  { href: '/admin/branches/b1/audit', label: 'Audit' },
];

describe('RecordTabs', () => {
  it('renders deep-linkable tabs inside a named navigation landmark', () => {
    pathname = '/admin/branches/b1/users';
    renderWithProviders(<RecordTabs label="Westlands Branch sections" tabs={TABS} />);

    expect(
      screen.getByRole('navigation', { name: 'Westlands Branch sections' }),
    ).toBeInTheDocument();
    const users = screen.getByRole('tab', { name: 'Users' });
    expect(users).toHaveAttribute('href', '/admin/branches/b1/users');
    expect(users).toHaveAttribute('aria-selected', 'true');
    expect(users).toHaveAttribute('aria-current', 'page');
    const overview = screen.getByRole('tab', { name: 'Overview' });
    expect(overview).toHaveAttribute('aria-selected', 'false');
    expect(overview).not.toHaveAttribute('aria-current');
  });

  it('keeps the parent tab on a sub-route and selects Overview on the record root', () => {
    pathname = '/admin/branches/b1/users/u9';
    const { unmount } = renderWithProviders(<RecordTabs label="Sections" tabs={TABS} />);
    expect(screen.getByRole('tab', { name: 'Users' })).toHaveAttribute('aria-selected', 'true');
    unmount();

    pathname = '/admin/branches/b1';
    renderWithProviders(<RecordTabs label="Sections" tabs={TABS} />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });
});
```

`components/data-display/copy-id-button.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { CopyIdButton } from './copy-id-button';

const ID = '44444444-4444-4444-8444-444444444444';

describe('CopyIdButton', () => {
  it('shows the short ID, keeps the full value in its title, and copies the full value', async () => {
    const user = userEvent.setup(); // installs a clipboard stub on navigator
    renderWithProviders(<CopyIdButton value={ID} label="Branch ID" />);

    expect(screen.getByText('44444444')).toHaveAttribute('title', ID);
    await user.click(screen.getByRole('button', { name: 'Copy Branch ID' }));

    await expect(navigator.clipboard.readText()).resolves.toBe(ID);
    expect(await screen.findByRole('alert')).toHaveTextContent('Branch ID copied');
  });

  it('explains a blocked clipboard instead of failing silently', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
    renderWithProviders(<CopyIdButton value={ID} />);

    await user.click(screen.getByRole('button', { name: 'Copy ID' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't copy the ID");
  });
});
```

Run (form T): `pnpm test:run components/data-display/record-hero.test.tsx components/data-display/record-tabs.test.tsx components/data-display/copy-id-button.test.tsx`.
Expected: FAIL (the modules are missing).

- [ ] **Step 3: Implement `components/data-display/record-hero.tsx`**

```tsx
import type { ReactNode } from 'react';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';
import { initialsOf } from '@/components/shell/initials';

/** A person gets initials in a circle; anything else an icon in a rounded square (prototype
 * `.record-avatar`). */
export type RecordAvatar = { kind: 'person'; name: string } | { kind: 'icon'; icon: ReactNode };

interface RecordHeroProps {
  /** e.g. `{ href: '/admin/branches', label: 'Back to branches' }`. */
  back?: { href: string; label: string };
  avatar: RecordAvatar;
  /** e.g. `Administration · Branch record`. */
  eyebrow: string;
  /** The page's only h1. */
  title: string;
  subtitle?: string;
  /** Status chips, e.g. `<StatusChip value={branch.status} />`. */
  status?: ReactNode;
  /** Hero actions — client components (dialog triggers) passed as elements. */
  actions?: ReactNode;
}

/**
 * Record page header (prototype `.record-hero`, spec §9): back link, identity, status, actions.
 * Server-Component-safe — every slot is an element, never a callback.
 */
export function RecordHero({
  back,
  avatar,
  eyebrow,
  title,
  subtitle,
  status,
  actions,
}: RecordHeroProps) {
  const person = avatar.kind === 'person';
  return (
    <>
      {back && (
        <Link
          component={NextLink}
          href={back.href}
          underline="hover"
          sx={{
            minHeight: 36,
            mb: 2.5,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1.75,
            fontWeight: 700,
          }}
        >
          <ArrowBack fontSize="small" />
          {back.label}
        </Link>
      )}
      <Paper
        sx={{
          minHeight: 112,
          px: 5,
          py: 4.5,
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'stretch', md: 'center' },
          justifyContent: 'space-between',
          gap: 6,
        }}
      >
        <Box
          sx={{ minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3.75 }}
        >
          <Avatar
            aria-hidden
            variant={person ? 'circular' : 'rounded'}
            sx={{
              width: 58,
              height: 58,
              fontSize: '1.125rem',
              fontWeight: 800,
              borderRadius: person ? undefined : 2,
              bgcolor: person ? 'avatar.bg' : 'status.infoBg',
              color: person ? 'avatar.fg' : 'primary.main',
            }}
          >
            {person ? initialsOf(avatar.name) : avatar.icon}
          </Avatar>
          <Box sx={{ minWidth: 0, flex: '1 1 240px' }}>
            <Typography variant="overline" component="p" color="text.secondary">
              {eyebrow}
            </Typography>
            <Typography component="h1" variant="h2" sx={{ my: 1, overflowWrap: 'anywhere' }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {status && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>{status}</Box>}
        </Box>
        {actions && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 2,
              // Prototype ≤ md: actions take the full row and share it.
              '& > *': { flexGrow: { xs: 1, md: 0 } },
            }}
          >
            {actions}
          </Box>
        )}
      </Paper>
    </>
  );
}
```

(`variant="h2"` is 25 px, which is the prototype's record h1 size. The page-level h1 is 28 px.)

- [ ] **Step 4: Implement `components/data-display/record-tabs.tsx`**

```tsx
'use client';

import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import NextLink from '@/components/navigation/next-link';

export interface RecordTab {
  /** A nested route; the record root is the Overview tab. */
  href: string;
  label: string;
}

interface RecordTabsProps {
  /** Names the navigation landmark and its tab list, e.g. `Westlands Branch sections`. */
  label: string;
  tabs: readonly RecordTab[];
}

/** The deepest tab whose href is the current path or an ancestor of it (sub-routes keep their
 * tab; the record root only matches Overview). */
function activeTab(tabs: readonly RecordTab[], pathname: string): string | false {
  let active: string | false = false;
  for (const tab of tabs) {
    const matches = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
    if (matches && (active === false || tab.href.length > active.length)) active = tab.href;
  }
  return active;
}

/**
 * Record sections as link tabs (spec §9): each tab is a nested route — deep-linkable, fetching its
 * own data — while the shared layout renders the hero. Arrow keys move between tabs (MUI Tabs);
 * Enter follows the link.
 */
export function RecordTabs({ label, tabs }: RecordTabsProps) {
  const pathname = usePathname();
  const active = activeTab(tabs, pathname);
  return (
    <Box component="nav" aria-label={label} sx={{ mt: 3.5, mb: 4 }}>
      <Tabs
        value={active}
        aria-label={label}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
      >
        {tabs.map((tab) => (
          <Tab
            key={tab.href}
            value={tab.href}
            label={tab.label}
            component={NextLink}
            href={tab.href}
            aria-current={tab.href === active ? 'page' : undefined}
          />
        ))}
      </Tabs>
    </Box>
  );
}
```

- [ ] **Step 5: Implement `components/data-display/copy-id-button.tsx`**

```tsx
'use client';

import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import { useToast } from '@/components/providers/toast-provider';
import { shortId } from '@/lib/format';

interface CopyIdButtonProps {
  value: string;
  /** Names the copy control and the toast, e.g. `Branch ID`. */
  label?: string;
}

/** A shortened ID with a copy affordance (spec §9); the full value stays in `title`. */
export function CopyIdButton({ value, label = 'ID' }: CopyIdButtonProps) {
  const notify = useToast();

  const copy = async () => {
    try {
      // Throws too where the Clipboard API is missing (an insecure origin).
      await navigator.clipboard.writeText(value);
      notify(`${label} copied`);
    } catch {
      notify(`Couldn't copy the ${label}. Select it and copy it instead.`, 'error');
    }
  };

  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <Typography component="span" variant="body2" title={value} sx={{ fontFamily: 'monospace' }}>
        {shortId(value)}
      </Typography>
      <Tooltip title={`Copy ${label}`}>
        <IconButton
          size="small"
          aria-label={`Copy ${label}`}
          onClick={() => {
            void copy();
          }}
        >
          <ContentCopyOutlined fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
```

Run (form T): the three test files. Expected: PASS.

- [ ] **Step 6: Commit** (form C)

`git add components/data-display/record-hero.tsx components/data-display/record-hero.test.tsx components/data-display/record-tabs.tsx components/data-display/record-tabs.test.tsx components/data-display/copy-id-button.tsx components/data-display/copy-id-button.test.tsx`

```
feat(ui): add the record hero, link record tabs, and an ID copy control

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

### Task 5: `ForbiddenState`, the guided All-branches state, `ConfirmDialog`

**Files:**

- Create: `components/data-display/forbidden-state.tsx` (exports `ForbiddenState` and
  `BranchContextState`), `forbidden-state.test.tsx`
- Create: `components/context/switch-to-all-branches-button.tsx` (client),
  `switch-to-all-branches-button.test.tsx`
- Create: `components/context/all-branches-copy.ts`. It is a plain module with no directive, so the
  Server Component `BranchContextState` can read the copy. A Server Component that imports a value
  from a `'use client'` module gets a client reference, not the string
  (`node_modules/next/dist/docs/01-app/02-guides/server-and-client-boundary.md`). Vitest doesn't
  model that boundary, so no test would catch it.
- Create: `components/data-display/confirm-dialog.tsx` (client), `confirm-dialog.test.tsx`

**Interfaces:**

- Consumes:
  - from PR 05: `selectOrganisationRequest`, `selectBranchRequest` and `isSessionExpired`
    (`components/context/context-api.ts`); `nextStepAfterOrganisation`
    (`components/context/use-context-selection.ts`);
  - `useApplicationContext` (`components/shell/organization-context.tsx`) and `useToast`.
- Produces:
  - `ForbiddenState({ title?: string; description?: string; action?: ReactNode })`, a Server
    Component. The default title is "You don't have permission".
  - `BranchContextState({ allBranchesAvailable?: boolean })`, a Server Component.
    - Omitted or `true` (the default, so 08's `<BranchContextState />` keeps working): the title is
      "Switch to All branches to manage this branch", and the action is the button below.
    - `false`: `ForbiddenState` with the default title, `ALL_BRANCHES_UNAVAILABLE` as its
      description, and no button.
    - The page derives the prop from `/auth/me`: `resolved.profile.branches.length > 1`.
      `profileSchema` de-duplicates `branches` (`auth/context-contract.ts:102`). The list may
      include SUSPENDED branches (contract, UserProfile), so the count can overstate. The button's
      stale-data fallback covers that case.
  - `SwitchToAllBranchesButton()`, a client component. It re-selects the current organisation.
    - Several distinct branches: toast `Switched to <org> · All branches`, then `router.refresh()`.
    - One branch (backend-pinned, or duplicate rows pinned again). This is the fallback for stale
      data: an inline `ALL_BRANCHES_UNAVAILABLE` alert with `severity="info"`, then
      `router.refresh()`.
    - A 401: `/login?reason=session_expired`.
    - Any other failure: an inline retry message with `severity="error"`. If the organisation POST
      had already succeeded, it also calls `router.refresh()`. The server context has moved by then,
      even when the re-pin fails, as `use-context-selection.ts` assumes.
  - `ALL_BRANCHES_UNAVAILABLE: string`, from `components/context/all-branches-copy.ts`.
  - `type ConfirmOutcome = { ok: true } | { ok: false; formError: string; requestId?: string | null }`.
  - `ConfirmDialog<Result extends ConfirmOutcome>({ open, title, description, confirmLabel, tone?: 'primary' | 'error', action: (previous: Result | null, formData: FormData) => Promise<Result>, onClose, onSuccess, children?: ReactNode })`.
    - It submits a hidden `idempotencyKey` plus whatever `children` renders.
    - It uses one key per opening, and a retry after a failure reuses that key.
    - While the action is pending, nothing closes the dialog: Escape, a backdrop click and Cancel
      are all blocked. Closing would unmount the form and discard the key, so a retry after a
      timeout wouldn't be a safe replay (index Review Focus 2, spec §6.4).
    - PR 07's `FormAction` is assignable to `action`.

- [ ] **Step 1: Load skills**

Invoke `frontend-design` and `ui-ux-pro-max`
(`--domain ux "permission denied state wrong context guidance confirmation dialog destructive"`).

- [ ] **Step 2: Write the failing tests**

`components/context/switch-to-all-branches-button.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ApplicationContextProvider } from '@/components/shell/organization-context';
import { ALL_BRANCHES_UNAVAILABLE } from './all-branches-copy';
import { SwitchToAllBranchesButton } from './switch-to-all-branches-button';

const { router, selectOrganisationRequest, selectBranchRequest, EXPIRED } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  selectOrganisationRequest: vi.fn(),
  selectBranchRequest: vi.fn(),
  EXPIRED: new Error('session expired'),
}));
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, useRouter: () => router };
});
vi.mock('./context-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./context-api')>();
  return {
    ...actual,
    selectOrganisationRequest: (...args: unknown[]) =>
      selectOrganisationRequest(...args) as unknown,
    selectBranchRequest: (...args: unknown[]) => selectBranchRequest(...args) as unknown,
    isSessionExpired: (error: unknown) => error === EXPIRED,
  };
});

function renderButton() {
  renderWithProviders(
    <ApplicationContextProvider
      value={{
        module: { id: 'administration', name: 'Administration' },
        organization: { id: 'org-1', name: 'Greenfield SACCO' },
        branch: { id: 'b-1', name: 'Head Office' },
      }}
    >
      <SwitchToAllBranchesButton />
    </ApplicationContextProvider>,
  );
  return screen.getByRole('button', { name: 'Switch to All branches' });
}

describe('SwitchToAllBranchesButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-selects the organisation at institution level for a multi-branch user', async () => {
    const user = userEvent.setup();
    selectOrganisationRequest.mockResolvedValueOnce({
      branchId: null,
      requiresBranchSelection: true,
      assignedBranchIds: ['b-1', 'b-2'],
    });

    await user.click(renderButton());

    expect(selectOrganisationRequest).toHaveBeenCalledWith('org-1');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Switched to Greenfield SACCO · All branches',
    );
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(selectBranchRequest).not.toHaveBeenCalled();
  });

  it('says All branches is unavailable when the backend pins the only branch', async () => {
    const user = userEvent.setup();
    selectOrganisationRequest.mockResolvedValueOnce({
      branchId: 'b-1',
      requiresBranchSelection: false,
      assignedBranchIds: ['b-1'],
    });

    await user.click(renderButton());

    const unavailable = await screen.findByRole('alert');
    expect(unavailable).toHaveTextContent(ALL_BRANCHES_UNAVAILABLE);
    // Informational, not a failure.
    expect(unavailable).toHaveClass('MuiAlert-colorInfo');
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('pins a single branch listed twice again, as context selection does', async () => {
    const user = userEvent.setup();
    selectOrganisationRequest.mockResolvedValueOnce({
      branchId: null,
      requiresBranchSelection: true,
      assignedBranchIds: ['b-1', 'b-1'],
    });
    selectBranchRequest.mockResolvedValueOnce(undefined);

    await user.click(renderButton());

    await waitFor(() => {
      expect(selectBranchRequest).toHaveBeenCalledWith('b-1');
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(ALL_BRANCHES_UNAVAILABLE);
  });

  it('still refreshes when the re-pin fails after the organisation POST moved the context', async () => {
    const user = userEvent.setup();
    selectOrganisationRequest.mockResolvedValueOnce({
      branchId: null,
      requiresBranchSelection: true,
      assignedBranchIds: ['b-1', 'b-1'],
    });
    selectBranchRequest.mockRejectedValueOnce(new Error('context lost'));

    await user.click(renderButton());

    const failure = await screen.findByRole('alert');
    expect(failure).toHaveTextContent("couldn't switch to All branches");
    expect(failure).toHaveClass('MuiAlert-colorError');
    // The header and page must re-read the context the server now holds.
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('sends an expired session to login and explains any other failure', async () => {
    const user = userEvent.setup();
    selectOrganisationRequest.mockRejectedValueOnce(EXPIRED);
    const button = renderButton();

    await user.click(button);
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/login?reason=session_expired');
    });

    selectOrganisationRequest.mockRejectedValueOnce(new Error('network'));
    await user.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't switch to All branches");
    // Neither POST succeeded, so the context never moved.
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
```

`components/data-display/forbidden-state.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import Button from '@mui/material/Button';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ApplicationContextProvider } from '@/components/shell/organization-context';
import { ALL_BRANCHES_UNAVAILABLE } from '@/components/context/all-branches-copy';
import type { ApplicationContext } from '@/config/application-context';
import { BranchContextState, ForbiddenState } from './forbidden-state';

// One stable router object from vi.hoisted (carried layer-05/06 rule).
const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, useRouter: () => router };
});

const CONTEXT: ApplicationContext = {
  module: { id: 'administration', name: 'Administration' },
  organization: { id: 'org-1', name: 'Greenfield SACCO' },
  branch: { id: 'b-1', name: 'Head Office' },
};

describe('ForbiddenState', () => {
  it('explains a missing permission inline by default', () => {
    renderWithProviders(<ForbiddenState />);
    expect(screen.getByText("You don't have permission")).toBeInTheDocument();
    expect(screen.getByText(/Ask an administrator/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a custom explanation and action (e.g. maker-checker)', () => {
    renderWithProviders(
      <ForbiddenState
        title="You can't approve your own invitation"
        description="Another administrator must approve this user."
        action={<Button>Back to approvals</Button>}
      />,
    );
    expect(screen.getByText("You can't approve your own invitation")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to approvals' })).toBeInTheDocument();
  });

  it('guides a branch context that cannot reach the branch to All branches', () => {
    renderWithProviders(
      <ApplicationContextProvider value={CONTEXT}>
        <BranchContextState />
      </ApplicationContextProvider>,
    );
    expect(screen.getByText('Switch to All branches to manage this branch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to All branches' })).toBeInTheDocument();
  });

  it('never offers All branches to a user with at most one distinct branch', () => {
    renderWithProviders(
      <ApplicationContextProvider value={CONTEXT}>
        <BranchContextState allBranchesAvailable={false} />
      </ApplicationContextProvider>,
    );
    expect(screen.getByText(ALL_BRANCHES_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Switch to All branches to manage this branch'),
    ).not.toBeInTheDocument();
  });
});
```

`components/data-display/confirm-dialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { UUID_PATTERN } from '@/lib/api/wire';
import { ConfirmDialog } from './confirm-dialog';

/** PR 07's `ActionResult`, restated: the dialog must accept it without importing layer 07. */
type FullResult =
  | { ok: true }
  | {
      ok: false;
      formError: string;
      fieldErrors: Partial<Record<string, string>>;
      code: string | null;
      requestId: string | null;
    };

const CHANGED: FullResult = {
  ok: false,
  formError: 'This record changed. Refresh and try again.',
  fieldErrors: {},
  code: 'conflict',
  requestId: 'req-9',
};

const keyOf = (formData: FormData | undefined) => String(formData?.get('idempotencyKey'));

function setup(
  action: (previous: FullResult | null, formData: FormData) => Promise<FullResult>,
  tone?: 'primary' | 'error',
) {
  const onSuccess = vi.fn();
  const props = {
    title: 'Submit Westlands Branch for approval?',
    description: 'A second administrator must activate it.',
    confirmLabel: 'Submit for approval',
    tone,
    action,
    onClose: vi.fn(),
    onSuccess,
  };
  const view = renderWithProviders(
    <ConfirmDialog open {...props}>
      <input type="hidden" name="branchId" value="b-1" />
    </ConfirmDialog>,
  );
  return { ...view, props, onSuccess };
}

describe('ConfirmDialog', () => {
  it('submits an idempotency key with the hidden inputs and reports success', async () => {
    const user = userEvent.setup();
    const action = vi.fn((_previous: FullResult | null, _formData: FormData) =>
      Promise.resolve<FullResult>({ ok: true }),
    );
    const { onSuccess } = setup(action);

    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    const formData = action.mock.calls[0]?.[1];
    expect(formData?.get('branchId')).toBe('b-1');
    expect(keyOf(formData)).toMatch(UUID_PATTERN);
  });

  it('shows a failure with its reference and retries with the same key (a safe replay)', async () => {
    const user = userEvent.setup();
    const action = vi
      .fn((_previous: FullResult | null, _formData: FormData) =>
        Promise.resolve<FullResult>({ ok: true }),
      )
      .mockResolvedValueOnce(CHANGED);
    const { onSuccess } = setup(action);

    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This record changed');
    expect(screen.getByRole('alert')).toHaveTextContent('req-9');

    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(keyOf(action.mock.calls[1]?.[1])).toBe(keyOf(action.mock.calls[0]?.[1]));
  });

  it('uses a fresh key each time the dialog opens', async () => {
    const user = userEvent.setup();
    const action = vi.fn((_previous: FullResult | null, _formData: FormData) =>
      Promise.resolve<FullResult>({ ok: true }),
    );
    const { props, rerender } = setup(action);

    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });
    rerender(<ConfirmDialog {...props} open={false} />);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    rerender(<ConfirmDialog {...props} open />);
    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(2);
    });

    expect(keyOf(action.mock.calls[1]?.[1])).not.toBe(keyOf(action.mock.calls[0]?.[1]));
  });

  it('cannot be closed or submitted again while the action is pending', async () => {
    const user = userEvent.setup();
    // Never settles: the request is still in flight for the rest of the test.
    const action = vi.fn(
      (_previous: FullResult | null, _formData: FormData) =>
        new Promise<FullResult>(() => undefined),
    );
    const { props } = setup(action);
    const key = document.querySelector<HTMLInputElement>('input[name="idempotencyKey"]')?.value;

    // Escape closes an idle dialog, so the pending check below can't pass vacuously. The keydown
    // goes to the dialog itself: focus may sit on the now-disabled submit button.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });
    // A loading Button is disabled, so a second click or an implicit Enter can't submit again.
    // (A second user-event click on it would throw on `pointer-events: none`.)
    expect(screen.getByRole('button', { name: /Submit for approval/ })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(action).toHaveBeenCalledTimes(1);
    expect(key).toMatch(UUID_PATTERN);
    expect(keyOf(action.mock.calls[0]?.[1])).toBe(key);
  });

  it('marks a destructive confirmation with the error colour', () => {
    setup(() => Promise.resolve<FullResult>({ ok: true }), 'error');
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toHaveClass(
      'MuiButton-colorError',
    );
  });
});
```

jsdom logs a "requestSubmit"/form-submission notice when a submit button is clicked. It's
pre-existing and harmless (see the 02/03/06 reports). If a click ever fails to reach the action,
submit with `fireEvent.submit(form)` in this file, and keep any polyfill local to the test file,
never in `test/setup.ts`.

Run (form T): `pnpm test:run components/context/switch-to-all-branches-button.test.tsx components/data-display/forbidden-state.test.tsx components/data-display/confirm-dialog.test.tsx`.
Expected: FAIL (the modules are missing).

- [ ] **Step 3: Implement `components/context/all-branches-copy.ts` and `components/context/switch-to-all-branches-button.tsx`**

`components/context/all-branches-copy.ts`:

```ts
/**
 * Read by both the Server Component `BranchContextState` and its client button. It lives in this
 * plain module, not in the `'use client'` button file, because a Server Component that imports a
 * value from a client module gets a client reference instead of the string.
 */
export const ALL_BRANCHES_UNAVAILABLE =
  "All branches isn't available for your account because you're assigned to a single branch. Ask an administrator for access to this branch.";
```

`components/context/switch-to-all-branches-button.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useToast } from '@/components/providers/toast-provider';
import { useApplicationContext } from '@/components/shell/organization-context';
import { ALL_BRANCHES_UNAVAILABLE } from './all-branches-copy';
import { isSessionExpired, selectBranchRequest, selectOrganisationRequest } from './context-api';
import { nextStepAfterOrganisation } from './use-context-selection';

const SWITCH_FAILED = "We couldn't switch to All branches. Please try again.";

/** `info` when All branches is unavailable (informational), `error` when the switch failed. */
interface SwitchMessage {
  severity: 'info' | 'error';
  text: string;
}

/**
 * The guided state's action (spec §6.5): re-selecting the current organisation issues an
 * institution-level token for a multi-branch user — the same move as the context dialog's "All
 * branches". A single distinct branch ends up pinned again, as context selection always does.
 * Pages that know the user has one branch pass `allBranchesAvailable={false}` to
 * `BranchContextState`, so this fallback only runs on stale data.
 */
export function SwitchToAllBranchesButton() {
  const router = useRouter();
  const notify = useToast();
  const { organization } = useApplicationContext();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<SwitchMessage | null>(null);

  const switchToAllBranches = async () => {
    setPending(true);
    setMessage(null);
    // Once the organisation POST succeeds, the server context has moved (the backend issued a new
    // token), even if the re-pin below fails.
    let committed = false;
    try {
      const selection = await selectOrganisationRequest(organization.id);
      committed = true;
      const step = nextStepAfterOrganisation(selection);
      if (typeof step === 'object') {
        await selectBranchRequest(step.autoSelect);
      }
      if (step === 'done-branch' || typeof step === 'object') {
        setMessage({ severity: 'info', text: ALL_BRANCHES_UNAVAILABLE });
      } else {
        notify(`Switched to ${organization.name} · All branches`);
      }
      router.refresh();
    } catch (caught) {
      if (isSessionExpired(caught)) {
        router.replace('/login?reason=session_expired');
        return;
      }
      // As use-context-selection.ts does: the header and the page re-read the context that the
      // server now holds, whether the re-pin failed with a lost context (403/409) or anything else.
      if (committed) router.refresh();
      setMessage({ severity: 'error', text: SWITCH_FAILED });
    } finally {
      setPending(false);
    }
  };

  return (
    <Box sx={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
      <Button
        variant="contained"
        loading={pending}
        onClick={() => {
          void switchToAllBranches();
        }}
      >
        Switch to All branches
      </Button>
      {message && <Alert severity={message.severity}>{message.text}</Alert>}
    </Box>
  );
}
```

- [ ] **Step 4: Implement `components/data-display/forbidden-state.tsx`**

```tsx
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LockOutlined from '@mui/icons-material/LockOutlined';
import { ALL_BRANCHES_UNAVAILABLE } from '@/components/context/all-branches-copy';
import { SwitchToAllBranchesButton } from '@/components/context/switch-to-all-branches-button';

interface ForbiddenStateProps {
  title?: string;
  description?: string;
  /** e.g. a switch-context button. */
  action?: ReactNode;
}

/**
 * Inline "no permission" or "wrong context" state (spec §6.7), shown in place of the content —
 * never an error page. For approve/activate, pass the maker-checker explanation.
 */
export function ForbiddenState({
  title = "You don't have permission",
  description = "Your role doesn't include this in the current context. Ask an administrator if you need access.",
  action,
}: ForbiddenStateProps) {
  return (
    <Box
      sx={{
        minHeight: 240,
        display: 'grid',
        placeItems: 'center',
        alignContent: 'center',
        gap: 2,
        p: 6,
        textAlign: 'center',
        color: 'text.secondary',
      }}
    >
      <LockOutlined sx={{ fontSize: 34 }} aria-hidden="true" />
      <Typography component="p" variant="h5" color="text.primary">
        {title}
      </Typography>
      <Typography variant="body2" sx={{ maxWidth: 480 }}>
        {description}
      </Typography>
      {action}
    </Box>
  );
}

interface BranchContextStateProps {
  /**
   * `false` when the user has at most one distinct assigned branch, so All branches can't work:
   * `resolved.profile.branches.length > 1` from `/auth/me` (already de-duplicated). Defaults to
   * `true`. The button still handles stale data.
   */
  allBranchesAvailable?: boolean;
}

/** Spec §6.5: the current branch context can't reach the branch this page needs — offered instead
 * of a raw 404. Index Review Focus 3: never offer a meaningless "All branches". */
export function BranchContextState({ allBranchesAvailable = true }: BranchContextStateProps) {
  if (!allBranchesAvailable) {
    return <ForbiddenState description={ALL_BRANCHES_UNAVAILABLE} />;
  }
  return (
    <ForbiddenState
      title="Switch to All branches to manage this branch"
      description="With a branch selected, you can only reach that branch. At All branches (institution level) you can manage every branch, including drafts and branches awaiting approval."
      action={<SwitchToAllBranchesButton />}
    />
  );
}
```

- [ ] **Step 5: Implement `components/data-display/confirm-dialog.tsx`**

```tsx
'use client';

import { useActionState, useEffect, useState, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';

/** The least a confirm action returns. PR 07's `ActionResult` fits; its extra failure fields are
 * ignored here. */
export type ConfirmOutcome =
  { ok: true } | { ok: false; formError: string; requestId?: string | null };

interface ConfirmDialogProps<Result extends ConfirmOutcome> {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  /** `error` for destructive or irreversible actions. */
  tone?: 'primary' | 'error';
  /** A Server Action; receives `idempotencyKey` plus any inputs rendered in `children`. */
  action: (previous: Result | null, formData: FormData) => Promise<Result>;
  onClose: () => void;
  onSuccess: () => void;
  /** Under the description: a warning, or hidden inputs the action reads. */
  children?: ReactNode;
}

export function ConfirmDialog<Result extends ConfirmOutcome>({
  open,
  onClose,
  ...form
}: ConfirmDialogProps<Result>) {
  // Lifted from ConfirmForm: while the action is pending, Escape and a backdrop click must not
  // unmount the form, which would discard its idempotency key (spec §6.4).
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} fullWidth maxWidth="xs">
      <ConfirmForm {...form} onClose={onClose} onPendingChange={setPending} />
    </Dialog>
  );
}

/**
 * Mounted once per opening (the dialog unmounts closed content), like PR 07's ReasonDialog: a
 * fresh idempotency key each time; a failed attempt keeps its key, so a retry replays safely
 * (spec §6.4).
 */
function ConfirmForm<Result extends ConfirmOutcome>({
  title,
  description,
  confirmLabel,
  tone = 'primary',
  action,
  onClose,
  onSuccess,
  onPendingChange,
  children,
}: Omit<ConfirmDialogProps<Result>, 'open'> & { onPendingChange: (pending: boolean) => void }) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, formAction, pending] = useActionState<Result | null, FormData>(
    async (previous, formData) => {
      const result = await action(previous, formData);
      if (result.ok) onSuccess();
      return result;
    },
    null,
  );
  // Reported from an effect: a parent setState inside the action would be held back with the
  // transition until the action settles. Each mount reports `false`, so a reopened dialog can
  // always be closed again.
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);
  // Narrow through the concrete union: a generic `Result` doesn't narrow on `ok`.
  const outcome: ConfirmOutcome | null = state;
  const failure = outcome && !outcome.ok ? outcome : null;

  return (
    <Box component="form" action={formAction}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 3 }}>
        <DialogContentText>{description}</DialogContentText>
        {failure && (
          <Alert severity="error">
            {failure.formError}
            {failure.requestId && ` Reference: ${failure.requestId}`}
          </Alert>
        )}
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        {children}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" color={tone} loading={pending}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Box>
  );
}
```

Run (form T): the three test files. Expected: PASS.

- [ ] **Step 6: Commit** (form C)

`git add components/context/all-branches-copy.ts components/context/switch-to-all-branches-button.tsx components/context/switch-to-all-branches-button.test.tsx components/data-display/forbidden-state.tsx components/data-display/forbidden-state.test.tsx components/data-display/confirm-dialog.tsx components/data-display/confirm-dialog.test.tsx`

```
feat(ui): add forbidden and switch-to-All-branches states and an idempotent confirm dialog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

### Task 6: Audit rows, the audit view toggle, and `RecordAuditTab`

**Files (under `modules/administration/audit/` unless noted):**

- Create: `audit-rows.ts`, `audit-rows.test.ts`
- Create: `components/audit-view-toggle.tsx` (client), `components/audit-view-toggle.test.tsx`
- Create: `components/record-audit-tab.tsx` (async Server Component),
  `components/record-audit-tab.test.tsx`
- Modify: `app/(authenticated)/admin/audit/page.tsx` (use `audit-rows.ts`)
- Modify: `components/audit-event-table.tsx` (an optional `scrollOnNavigate` prop)

**Interfaces:**

- Consumes:
  - from PR 06: `AuditEvent`, `AuditRow`/`AuditEventTable`, `listAuditEvents`, `auditApiPath`,
    `DEFAULT_AUDIT_PAGE_SIZE`, `AuditQuery`, `actionLabel`, `entityTypeLabel`, `load`,
    `parsePaging`, `lastPageIfPastEnd`, `toQueryString`, `resolveUserNames`, `getBranchIndex`,
    `getOrganisationTimeZone`, `formatInstant`, `shortId`;
  - `ListNavigationProvider`, `ListNavigationProgress`, `ListBusyRegion`, `useListNavigation`,
    `TablePaginationBar`, `EmptyState`, `ErrorState`.
- Produces:
  - `audit-rows.ts`:
    - `interface AuditLookups { names: ReadonlyMap<string, string>; branches: ReadonlyMap<string, { name: string; code: string }>; timeZone: string }`
    - `interface AuditRowLinks { detail: (eventId: string) => string; actor: (actorUserId: string) => string }`
    - `auditUserIds(events: readonly AuditEvent[]): string[]`: the actor IDs and USER-entity IDs.
    - `auditEntityName(entityType: string, entityId: string, lookups: Pick<AuditLookups, 'names' | 'branches'>): string`
    - `toAuditRows(events: readonly AuditEvent[], lookups: AuditLookups, links: AuditRowLinks): AuditRow[]`
    - `type AuditTrailFilter = { entityType?: string; entityId?: string; actorId?: string; event?: string }`
    - `auditTrailHref(filter: AuditTrailFilter): string`, which returns `/admin/audit?…`.
  - `AuditViewToggle({ views: readonly { value: string; label: string }[]; value: string })`. A
    client component. Choosing a view sets `view` in the URL and removes `page`.
  - `AuditEventTable` gains `scrollOnNavigate?: boolean`, default `false`. It sets `scroll` on the
    row and actor links. `/admin/audit` keeps `false`, because those links open the drawer in the
    same page. `RecordAuditTab` passes `true`, because its links go to a different page
    (`/admin/audit?…&event=…`), which must open at the top, not at the tab's scroll offset.
  - `record-audit-tab.tsx`:
    - `type RecordAuditFilter = { entityType: string; entityId: string } | { actorId: string }`
    - `interface RecordAuditView { value: string; label: string; filter: RecordAuditFilter }`
    - `RecordAuditTab({ views: readonly [RecordAuditView, ...RecordAuditView[]]; params: URLSearchParams; path: string; title?: string; description?: string })`.
      `params` is the tab's `toSearchParams(await searchParams)`. It reads `view`, `page` and
      `size`, with the first view as the default. `path` is the tab's own pathname, used for the
      past-the-end redirect. `title` defaults to `'Audit trail'`; 15 passes `'Activity'`.
      The toggle shows only when there are 2 or more views.

- [ ] **Step 1: Load skills**

Invoke `frontend-design` and `ui-ux-pro-max`
(`--domain ux "segmented control filter views audit history table"`).

- [ ] **Step 2: Write the failing tests**

`modules/administration/audit/audit-rows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AuditEvent } from './audit-contract';
import { auditEntityName, auditTrailHref, auditUserIds, toAuditRows } from './audit-rows';

const ACTOR = '55555555-5555-4555-8555-555555555555';
const BRANCH = '44444444-4444-4444-8444-444444444444';
const USER = '66666666-6666-4666-8666-666666666666';

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 'e1',
    occurredAt: '2026-09-07T07:59:00Z',
    actorType: 'USER',
    actorUserId: ACTOR,
    branchId: BRANCH,
    action: 'user.invite',
    entityType: 'USER',
    entityId: USER,
    outcome: 'SUCCESS',
    severity: 'INFO',
    reason: 'New teller',
    ...overrides,
  };
}

const LOOKUPS = {
  names: new Map([
    [ACTOR, 'Jane Manager'],
    [USER, 'Mary Wanjiku'],
  ]),
  branches: new Map([[BRANCH, { name: 'Westlands Branch', code: 'WESTLANDS' }]]),
  timeZone: 'Africa/Nairobi',
};
const LINKS = {
  detail: (id: string) => `/detail/${id}`,
  actor: (id: string) => `/actor/${id}`,
};

describe('audit rows', () => {
  it('resolves names, the organisation timezone, vocabulary labels, and links', () => {
    expect(toAuditRows([event()], LOOKUPS, LINKS)).toEqual([
      {
        id: 'e1',
        date: '07 Sep 2026',
        time: '10:59',
        actorLabel: 'Jane Manager',
        actorFilterHref: `/actor/${ACTOR}`,
        actionLabel: 'Invited user',
        action: 'user.invite',
        reason: 'New teller',
        entityLabel: 'User · Mary Wanjiku',
        branchLabel: 'Westlands Branch',
        outcome: 'SUCCESS',
        severity: 'INFO',
        detailHref: '/detail/e1',
      },
    ]);
  });

  it('falls back to System, short IDs, and dashes', () => {
    const [system] = toAuditRows(
      [
        event({
          actorUserId: null,
          actorType: 'SYSTEM',
          entityType: 'ROLE',
          entityId: 'abcdef12-0000-4000-8000-000000000000',
          branchId: null,
        }),
      ],
      { ...LOOKUPS, names: new Map() },
      LINKS,
    );
    expect(system).toMatchObject({
      actorLabel: 'System',
      actorFilterHref: null,
      entityLabel: 'Role · abcdef12',
      branchLabel: '—',
    });

    const [noEntity] = toAuditRows(
      [event({ entityType: 'BUSINESS_DATE', entityId: null })],
      LOOKUPS,
      LINKS,
    );
    expect(noEntity?.entityLabel).toBe('Business date · —');
  });

  it('collects only actor and USER-entity IDs for name resolution', () => {
    expect(
      auditUserIds([event(), event({ actorUserId: null, entityType: 'BRANCH', entityId: BRANCH })]),
    ).toEqual([ACTOR, USER]);
  });

  it('names users and branches from the lookups, and anything else by short ID', () => {
    expect(auditEntityName('BRANCH', BRANCH, LOOKUPS)).toBe('Westlands Branch');
    expect(auditEntityName('USER', 'ffffffff-0000-4000-8000-000000000000', LOOKUPS)).toBe(
      'ffffffff',
    );
    expect(auditEntityName('MEMBERSHIP', USER, LOOKUPS)).toBe('66666666');
  });

  it('links to the audit trail narrowed to a view, optionally with an event open', () => {
    expect(auditTrailHref({ entityType: 'BRANCH', entityId: BRANCH, event: 'e1' })).toBe(
      `/admin/audit?entityType=BRANCH&entityId=${BRANCH}&event=e1`,
    );
    expect(auditTrailHref({ actorId: ACTOR })).toBe(`/admin/audit?actorId=${ACTOR}`);
  });
});
```

`modules/administration/audit/components/audit-view-toggle.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { AuditViewToggle } from './audit-view-toggle';

// One stable router object from vi.hoisted (carried layer-05 rule).
const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => '/admin/users/u1/audit',
    useRouter: () => router,
    useSearchParams: () => new URLSearchParams('view=user&page=2'),
  };
});

const VIEWS = [
  { value: 'user', label: 'User record' },
  { value: 'membership', label: 'Membership' },
];

describe('AuditViewToggle', () => {
  it('switches the view through the URL and returns to the first page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuditViewToggle views={VIEWS} value="user" />);

    expect(screen.getByRole('group', { name: 'Audit view' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'User record' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Membership' }));

    expect(router.push).toHaveBeenCalledWith('/admin/users/u1/audit?view=membership', {
      scroll: false,
    });
  });

  it('ignores a click on the selected view', async () => {
    const user = userEvent.setup();
    router.push.mockClear();
    renderWithProviders(<AuditViewToggle views={VIEWS} value="user" />);

    await user.click(screen.getByRole('button', { name: 'User record' }));

    expect(router.push).not.toHaveBeenCalled();
  });
});
```

`modules/administration/audit/components/record-audit-tab.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { BackendApiError } from '@/auth/backend-api';
import type { RecordAuditView } from './record-audit-tab';

const { listAuditEvents, redirect, router } = vi.hoisted(() => ({
  listAuditEvents: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    redirect: (to: string) => redirect(to) as unknown,
    usePathname: () => '/admin/users/u1/audit',
    useRouter: () => router,
    useSearchParams: () => new URLSearchParams(),
  };
});
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('../audit-service', () => ({
  listAuditEvents: (...args: unknown[]) => listAuditEvents(...args) as unknown,
}));
vi.mock('@/lib/api/lookups', () => ({
  getOrganisationTimeZone: () => Promise.resolve('Africa/Nairobi'),
  getBranchIndex: () => Promise.resolve(new Map()),
  resolveUserNames: () =>
    Promise.resolve(new Map([['66666666-6666-4666-8666-666666666666', 'Mary Wanjiku']])),
}));

const { RecordAuditTab } = await import('./record-audit-tab');

const USER_ID = '66666666-6666-4666-8666-666666666666';
const MEMBERSHIP_ID = '33333333-3333-4333-8333-333333333333';
const PATH = '/admin/users/u1/audit';
const VIEWS: readonly [RecordAuditView, ...RecordAuditView[]] = [
  { value: 'user', label: 'User record', filter: { entityType: 'USER', entityId: USER_ID } },
  {
    value: 'membership',
    label: 'Membership',
    filter: { entityType: 'MEMBERSHIP', entityId: MEMBERSHIP_ID },
  },
  { value: 'performed', label: 'Performed by', filter: { actorId: USER_ID } },
];
const EVENT = {
  id: 'e1',
  occurredAt: '2026-09-07T07:59:00Z',
  actorType: 'USER',
  actorUserId: USER_ID,
  branchId: null,
  action: 'user.invite',
  entityType: 'USER',
  entityId: USER_ID,
  outcome: 'SUCCESS',
  severity: 'INFO',
  reason: null,
};

function pageOf(items: unknown[], page: Record<string, number> = {}) {
  return {
    items,
    page: {
      number: 0,
      size: 20,
      totalItems: items.length,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
      ...page,
    },
  };
}

describe('RecordAuditTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the default view with a view toggle and links into the audit trail', async () => {
    listAuditEvents.mockResolvedValueOnce(pageOf([EVENT]));

    renderWithProviders(
      await RecordAuditTab({ views: VIEWS, params: new URLSearchParams(), path: PATH }),
    );

    expect(listAuditEvents).toHaveBeenCalledWith({
      page: 0,
      size: 20,
      entityType: 'USER',
      entityId: USER_ID,
    });
    expect(screen.getByRole('region', { name: 'Audit trail' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'User record' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('link', { name: 'View event: Invited user, 07 Sep 2026 10:59' }),
    ).toHaveAttribute('href', `/admin/audit?entityType=USER&entityId=${USER_ID}&event=e1`);
  });

  it('reads the view and page from the URL, falling back to the first view for an unknown one', async () => {
    listAuditEvents.mockResolvedValueOnce(
      pageOf([EVENT], { number: 1, totalItems: 21, totalPages: 2, hasPrevious: true }),
    );
    renderWithProviders(
      await RecordAuditTab({
        views: VIEWS,
        params: new URLSearchParams('view=performed&page=1'),
        path: PATH,
      }),
    );
    expect(listAuditEvents).toHaveBeenLastCalledWith({ page: 1, size: 20, actorId: USER_ID });
    expect(
      screen.getByRole('link', { name: 'View event: Invited user, 07 Sep 2026 10:59' }),
    ).toHaveAttribute('href', `/admin/audit?actorId=${USER_ID}&event=e1`);

    listAuditEvents.mockResolvedValueOnce(pageOf([]));
    await RecordAuditTab({ views: VIEWS, params: new URLSearchParams('view=bogus'), path: PATH });
    expect(listAuditEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityType: 'USER', entityId: USER_ID }),
    );
  });

  it('shows no toggle for a single view and an empty state with no events', async () => {
    listAuditEvents.mockResolvedValueOnce(pageOf([]));
    const [onlyView] = VIEWS;

    renderWithProviders(
      await RecordAuditTab({
        views: [onlyView],
        params: new URLSearchParams(),
        path: PATH,
        title: 'Activity',
      }),
    );

    expect(screen.getByRole('region', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.getByText('No audit events')).toBeInTheDocument();
  });

  it('keeps the section and shows a safe error when the list fails', async () => {
    listAuditEvents.mockRejectedValueOnce(new BackendApiError(403, { code: 'forbidden' }));

    renderWithProviders(
      await RecordAuditTab({ views: VIEWS, params: new URLSearchParams(), path: PATH }),
    );

    expect(screen.getByRole('region', { name: 'Audit trail' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('redirects a page past the end to the last page, keeping the view', async () => {
    listAuditEvents.mockResolvedValueOnce(pageOf([], { number: 5, totalItems: 21, totalPages: 2 }));

    await expect(
      RecordAuditTab({
        views: VIEWS,
        params: new URLSearchParams('view=membership&page=5'),
        path: PATH,
      }),
    ).rejects.toThrow(`NEXT_REDIRECT:${PATH}?view=membership&page=1`);
  });
});
```

Run (form T): `pnpm test:run modules/administration/audit`. Expected: FAIL (the new modules are
missing). The existing audit tests still pass.

- [ ] **Step 3: Implement `modules/administration/audit/audit-rows.ts`**

```ts
import { toQueryString } from '@/lib/api/query-string';
import { formatInstant, shortId } from '@/lib/format';
import type { AuditEvent } from './audit-contract';
import { actionLabel, entityTypeLabel } from './audit-vocabulary';
import type { AuditRow } from './components/audit-event-table';

export interface AuditLookups {
  names: ReadonlyMap<string, string>;
  branches: ReadonlyMap<string, { name: string; code: string }>;
  timeZone: string;
}

export interface AuditRowLinks {
  detail: (eventId: string) => string;
  actor: (actorUserId: string) => string;
}

/** The user IDs a page of events shows by name: actors and USER entities (≤ 2 × page size). */
export function auditUserIds(events: readonly AuditEvent[]): string[] {
  return events.flatMap((event) => [
    ...(event.actorUserId ? [event.actorUserId] : []),
    ...(event.entityType === 'USER' && event.entityId ? [event.entityId] : []),
  ]);
}

/** Users and branches by resolved name; any other type (or an unresolved ID) by short ID. */
export function auditEntityName(
  entityType: string,
  entityId: string,
  lookups: Pick<AuditLookups, 'names' | 'branches'>,
): string {
  if (entityType === 'USER') return lookups.names.get(entityId) ?? shortId(entityId);
  if (entityType === 'BRANCH') return lookups.branches.get(entityId)?.name ?? shortId(entityId);
  return shortId(entityId);
}

/** The audit table's row view-model, shared by `/admin/audit` and record Audit tabs. */
export function toAuditRows(
  events: readonly AuditEvent[],
  lookups: AuditLookups,
  links: AuditRowLinks,
): AuditRow[] {
  return events.map((event) => {
    const when = formatInstant(event.occurredAt, lookups.timeZone);
    return {
      id: event.id,
      date: when.date,
      time: when.time,
      actorLabel: event.actorUserId
        ? (lookups.names.get(event.actorUserId) ?? shortId(event.actorUserId))
        : 'System',
      actorFilterHref: event.actorUserId ? links.actor(event.actorUserId) : null,
      actionLabel: actionLabel(event.action),
      action: event.action,
      reason: event.reason,
      entityLabel: `${entityTypeLabel(event.entityType)} · ${
        event.entityId === null ? '—' : auditEntityName(event.entityType, event.entityId, lookups)
      }`,
      branchLabel: event.branchId
        ? (lookups.branches.get(event.branchId)?.name ?? shortId(event.branchId))
        : '—',
      outcome: event.outcome,
      severity: event.severity,
      detailHref: links.detail(event.id),
    };
  });
}

export type AuditTrailFilter = {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  event?: string;
};

/** `/admin/audit` narrowed to one view, optionally with an event's drawer open. */
export function auditTrailHref(filter: AuditTrailFilter): string {
  return `/admin/audit${toQueryString(filter)}`;
}
```

(`AuditTrailFilter` is a type alias, not an interface, so that it satisfies
`toQueryString`'s index signature.)

- [ ] **Step 4: Switch the audit page to it**

In `app/(authenticated)/admin/audit/page.tsx`:

1. Change the table import to
   `import { AuditEventTable } from '@/modules/administration/audit/components/audit-event-table';`.
   `AuditRow` is no longer used here.
2. Add
   `import { auditEntityName, auditUserIds, toAuditRows } from '@/modules/administration/audit/audit-rows';`.
3. Replace the `userIds` block and the `rows` mapping with:

   ```ts
   const userIds = [
     ...auditUserIds(events.value.items),
     ...(query.actorId ? [query.actorId] : []),
     ...(query.entityId && query.entityType === 'USER' ? [query.entityId] : []),
   ];
   const names = await resolveUserNames(userIds);
   const lookups = { names, branches, timeZone };

   const rows = toAuditRows(events.value.items, lookups, {
     detail: (eventId) => hrefWith(params, { event: eventId }),
     actor: (actorId) => hrefWith(params, { actorId, page: null, event: null }),
   });
   ```

   That replaces everything from `const userIds = [` down to the end of
   `const rows: AuditRow[] = events.value.items.map(…);`.

4. Replace the `entityChip` label with the shared name rule:

   ```ts
   const entityChip = query.entityId
     ? {
         label: `Entity: ${query.entityType ? entityTypeLabel(query.entityType) : 'Unknown'} · ${auditEntityName(
           query.entityType ?? '',
           query.entityId,
           lookups,
         )}`,
         removeParam: 'entityId',
       }
     : null;
   ```

Leave everything else as it is: the drawer view-model, `hrefWith`, `prettyJson` and the redirect.
`formatInstant`, `shortId` and `actionLabel` are still used by the drawer and the actor chip.

Then, in `modules/administration/audit/components/audit-event-table.tsx`, add the prop. Change the
signature to:

```tsx
export function AuditEventTable({
  rows,
  timeZone,
  scrollOnNavigate = false,
}: {
  rows: readonly AuditRow[];
  timeZone: string;
  /** `true` when the links leave the page (a record Audit tab). `/admin/audit` opens its drawer
   * in place, so it keeps the scroll position. */
  scrollOnNavigate?: boolean;
}) {
```

Then replace both `scroll={false}` (the "View event" link and the actor link) with
`scroll={scrollOnNavigate}`. The audit page passes nothing, so it renders exactly as before
(Review Focus 5).

- [ ] **Step 5: Implement `components/audit-view-toggle.tsx`**

```tsx
'use client';

import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useListNavigation } from '@/components/data-display/use-list-navigation';

interface AuditViewToggleProps {
  views: readonly { value: string; label: string }[];
  value: string;
}

/** Spec §10.1: one subject's history spans several entity types, so record Audit tabs switch
 * between paginated views (`view` in the URL; a new view starts on page 1). */
export function AuditViewToggle({ views, value }: AuditViewToggleProps) {
  const navigate = useListNavigation();
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      aria-label="Audit view"
      // Wraps instead of overflowing at 375 px; no scroll container, which would clip focus rings.
      sx={{ flexWrap: 'wrap' }}
      onChange={(_event, next: string | null) => {
        if (next === null || next === value) return;
        navigate((params) => {
          params.set('view', next);
          params.delete('page');
        });
      }}
    >
      {views.map((view) => (
        <ToggleButton key={view.value} value={view.value}>
          {view.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
```

- [ ] **Step 6: Implement `components/record-audit-tab.tsx`**

```tsx
import { redirect } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ListNavigationProvider } from '@/components/data-display/list-navigation-context';
import {
  ListBusyRegion,
  ListNavigationProgress,
} from '@/components/data-display/list-pending-indicator';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { load } from '@/lib/api/load';
import { getBranchIndex, getOrganisationTimeZone, resolveUserNames } from '@/lib/api/lookups';
import { lastPageIfPastEnd, parsePaging } from '@/lib/api/paging';
import { toQueryString } from '@/lib/api/query-string';
import { DEFAULT_AUDIT_PAGE_SIZE, auditApiPath, type AuditQuery } from '../audit-query';
import { auditTrailHref, auditUserIds, toAuditRows } from '../audit-rows';
import { listAuditEvents } from '../audit-service';
import { AuditEventTable } from './audit-event-table';
import { AuditViewToggle } from './audit-view-toggle';

export type RecordAuditFilter = { entityType: string; entityId: string } | { actorId: string };

export interface RecordAuditView {
  /** The URL's `view` value, e.g. `membership`. */
  value: string;
  label: string;
  filter: RecordAuditFilter;
}

interface RecordAuditTabProps {
  /** The first view is the default. */
  views: readonly [RecordAuditView, ...RecordAuditView[]];
  /** The tab's awaited `searchParams` (`toSearchParams`): `view`, `page`, `size`. */
  params: URLSearchParams;
  /** The tab's own pathname, for the past-the-end page redirect. */
  path: string;
  title?: string;
  description?: string;
}

// One record Audit tab per page, so a fixed id is unique (an async component can't `useId`).
const HEADING_ID = 'record-audit-heading';

/**
 * A record's Audit tab (spec §10.1): the audit table narrowed to one view of the subject, with a
 * view toggle when there are several. "View event" and actor links open the full audit trail
 * (narrowed the same way) where the event drawer lives.
 */
export async function RecordAuditTab({
  views,
  params,
  path,
  title = 'Audit trail',
  description = 'Traceable changes and access activity for this record.',
}: RecordAuditTabProps) {
  const view = views.find((candidate) => candidate.value === params.get('view')) ?? views[0];
  const query: AuditQuery = { ...parsePaging(params, DEFAULT_AUDIT_PAGE_SIZE), ...view.filter };

  const [events, timeZone, branches] = await Promise.all([
    load(listAuditEvents(query)),
    getOrganisationTimeZone(),
    getBranchIndex(),
  ]);

  if (events.ok) {
    const redirectPage = lastPageIfPastEnd(events.value.page);
    if (redirectPage !== null) {
      redirect(
        `${path}${toQueryString({
          view: params.get('view') ?? undefined,
          size: params.get('size') ?? undefined,
          page: redirectPage === 0 ? undefined : redirectPage,
        })}`,
      );
    }
  }

  const header = (
    <Box
      sx={{
        px: 4,
        py: 3.5,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 3,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography id={HEADING_ID} component="h2" variant="h5">
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {description}
        </Typography>
      </Box>
      {views.length > 1 && (
        <AuditViewToggle
          views={views.map(({ value, label }) => ({ value, label }))}
          value={view.value}
        />
      )}
    </Box>
  );

  // ponytail: inline section header — SectionCard (PR 07) isn't at this layer's base; swapping to
  // it after 07 integrates is an internal change.
  if (!events.ok) {
    return (
      <Paper component="section" aria-labelledby={HEADING_ID} sx={{ overflow: 'hidden' }}>
        {header}
        <ErrorState problem={events.problem} />
      </Paper>
    );
  }

  const names = await resolveUserNames(auditUserIds(events.value.items));
  const filter =
    'actorId' in view.filter
      ? { actorId: view.filter.actorId }
      : { entityType: view.filter.entityType, entityId: view.filter.entityId };
  const rows = toAuditRows(
    events.value.items,
    { names, branches, timeZone },
    {
      detail: (eventId) => auditTrailHref({ ...filter, event: eventId }),
      actor: (actorId) => auditTrailHref({ actorId }),
    },
  );

  return (
    <ListNavigationProvider>
      <Paper
        component="section"
        aria-labelledby={HEADING_ID}
        sx={{ overflow: 'hidden', position: 'relative' }}
      >
        {header}
        <ListNavigationProgress />
        <ListBusyRegion>
          {rows.length === 0 ? (
            <EmptyState
              title="No audit events"
              description="Nothing has been recorded for this view yet."
            />
          ) : (
            <AuditEventTable
              key={auditApiPath(query)}
              rows={rows}
              timeZone={timeZone}
              // Its links open another page (/admin/audit), which starts at the top.
              scrollOnNavigate
            />
          )}
          <TablePaginationBar page={events.value.page} />
        </ListBusyRegion>
      </Paper>
    </ListNavigationProvider>
  );
}
```

Run (form T): `pnpm test:run modules/administration/audit`. Expected: PASS, including the existing
audit tests.

Then run form E: `e2e/audit.spec.ts`. Expected: PASS. The page must render exactly as before,
which is Review Focus 5.

- [ ] **Step 7: Commit** (form C)

`git add modules/administration/audit/audit-rows.ts modules/administration/audit/audit-rows.test.ts modules/administration/audit/components/audit-view-toggle.tsx modules/administration/audit/components/audit-view-toggle.test.tsx modules/administration/audit/components/record-audit-tab.tsx modules/administration/audit/components/record-audit-tab.test.tsx modules/administration/audit/components/audit-event-table.tsx 'app/(authenticated)/admin/audit/page.tsx'`

```
feat(audit): share the audit row view-model and add a record Audit tab with switchable views

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

### Task 7: Fake permission scope, admin E2E helpers, gates

**Files:**

- Modify: `e2e/fake-api/access.mts`
- Create: `e2e/fake-api-access.spec.ts`
- Create: `e2e/support/admin.ts`, `e2e/admin-kit.spec.ts`

**Interfaces:**

- Consumes:
  - PR 03's `requireContext`, `encodeContext`, `seedScenario`, `IDS`, `RunState`, `RouteContext`;
  - PR 03's `authenticate` and `selectMuiOption` (`e2e/support/auth.ts`);
  - `@axe-core/playwright`.
- Produces:
  - `access.mts`:
    - `type PermissionScope = 'tenant' | 'branch'`
    - `AccessContext` gains `tenantPermissions: ReadonlySet<string>`, the TENANT grants only.
      `permissions` stays everything the context holds; `/auth/me` reports it.
    - `requirePermission(access: AccessContext, code: string, scope: PermissionScope = 'tenant'): void`.
      Contract §E.4: `'tenant'` counts TENANT grants only; `'branch'` also counts BRANCH grants at
      the selected branch. Existing callers keep the default, and every seeded grant is TENANT
      scope, so their behaviour doesn't change.
  - `e2e/support/admin.ts`:
    - `enterAdmin(page: Page, pathname: string, options: { heading: string | RegExp; organisation?: RegExp; branch?: RegExp | null }): Promise<void>`.
      Defaults: `organisation` `/Greenfield/`, `branch` `/Head Office/`. `null` skips the branch
      step, for a single-branch or zero-branch scenario.
    - `expectNoSeriousOrCriticalViolations(page: Page): Promise<void>`
    - `A11Y_CASES`, the light/dark × 1280×800/375×812 matrix, and `type A11yCase`.
    - `applyA11yCase(page: Page, a11yCase: A11yCase): Promise<void>`. Call it before navigating.
    - `expectA11yCaseApplied(page: Page, a11yCase: A11yCase): Promise<void>`. It checks the scheme
      class and the title, and below 768 px that there is no horizontal page scroll.

- [ ] **Step 1: Write the failing fake-scope spec**

`e2e/fake-api-access.spec.ts`:

```ts
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { expect, test } from '@playwright/test';
import { requireContext, requirePermission } from './fake-api/access.mts';
import { encodeContext } from './fake-api/context-token.mts';
import type { RouteContext } from './fake-api/router.mts';
import { IDS, seedScenario } from './fake-api/scenarios.mts';
import type { RunState } from './fake-api/state.mts';

// 07b-prefixed seed IDs (lane rules §5); seeded here, not as a scenario — no route needs them.
const BRANCH_ROLE = '07b00000-0000-4000-8000-000000000001';
const BRANCH_GRANT = '07b00000-0000-4000-8000-000000000002';
// Synthetic, so no seed ever holds it: any layer may add real TENANT_ADMIN codes to
// TENANT_ADMIN_PERMISSIONS (lane rules §5), which would make a real code a TENANT grant here. The
// fake API never checks codes against a catalogue.
const BRANCH_ONLY = '07b.branch_only';

function withBranchGrantAtHeadOffice(): RunState {
  const state = seedScenario('default');
  state.roles.push({
    id: BRANCH_ROLE,
    organisationId: IDS.greenfield,
    code: 'BRANCH_OPS',
    name: 'Branch operations',
    description: null,
    systemRole: false,
    status: 'ACTIVE',
    permissions: [BRANCH_ONLY],
    createdAt: '2026-07-01T08:00:00Z',
    updatedAt: '2026-07-01T08:00:00Z',
  });
  state.roleAssignments.push({
    id: BRANCH_GRANT,
    organisationId: IDS.greenfield,
    userId: IDS.jane,
    roleId: BRANCH_ROLE,
    scopeType: 'BRANCH',
    branchId: IDS.headOffice,
    status: 'ACTIVE',
  });
  return state;
}

function contextAt(state: RunState, branchId: string | null): RouteContext {
  const req = new IncomingMessage(new Socket());
  req.headers['x-active-organisation-context'] = encodeContext({
    userId: IDS.jane,
    organisationId: IDS.greenfield,
    membershipId: IDS.greenfieldMembership,
    branchId,
  });
  return {
    req,
    res: new ServerResponse(req),
    params: {},
    query: new URLSearchParams(),
    state,
    path: '/api/v1/branches',
  };
}

test.describe('fake API permission scopes (contract §E.4)', () => {
  test('a BRANCH grant counts only for branch-scoped checks at its own branch', () => {
    const state = withBranchGrantAtHeadOffice();
    const headOffice = requireContext(contextAt(state, IDS.headOffice));
    const westlands = requireContext(contextAt(state, IDS.westlands));
    const institution = requireContext(contextAt(state, null));

    expect(() => {
      requirePermission(headOffice, BRANCH_ONLY, 'branch');
    }).not.toThrow();
    expect(() => {
      requirePermission(headOffice, BRANCH_ONLY);
    }).toThrow('not permitted');
    expect(() => {
      requirePermission(westlands, BRANCH_ONLY, 'branch');
    }).toThrow('not permitted');
    expect(() => {
      requirePermission(institution, BRANCH_ONLY, 'branch');
    }).toThrow('not permitted');
    // /auth/me reports the context's effective codes, BRANCH grants at the selected branch included.
    expect(headOffice.permissions.has(BRANCH_ONLY)).toBe(true);
    expect(institution.permissions.has(BRANCH_ONLY)).toBe(false);
  });

  test('a TENANT grant satisfies both scopes, at a branch and at institution level', () => {
    const state = seedScenario('default');
    for (const branchId of [IDS.headOffice, null]) {
      const access = requireContext(contextAt(state, branchId));
      expect(() => {
        requirePermission(access, 'audit.view');
      }).not.toThrow();
      expect(() => {
        requirePermission(access, 'audit.view', 'branch');
      }).not.toThrow();
    }
  });
});
```

Run (form E): `e2e/fake-api-access.spec.ts`. Expected: FAIL. `requirePermission` ignores its third
argument, so `requirePermission(headOffice, BRANCH_ONLY)` doesn't throw.

- [ ] **Step 2: Implement the scope in `e2e/fake-api/access.mts`**

Replace the `AccessContext` interface and `effectivePermissions`, return both sets from
`requireContext`, and replace `requirePermission`:

```ts
export interface AccessContext {
  state: RunState;
  claims: ContextClaims;
  organisation: FakeOrganisation;
  membership: FakeMembership;
  /** Everything the context holds: TENANT grants plus, with a branch selected, that branch's
   * BRANCH grants — what `/auth/me` reports. */
  permissions: ReadonlySet<string>;
  /** TENANT-scope grants only (contract §E "T"). */
  tenantPermissions: ReadonlySet<string>;
}

/** Contract §E.4: `tenant` counts TENANT grants only; `branch` also counts BRANCH grants at the
 * selected branch. */
export type PermissionScope = 'tenant' | 'branch';
```

```ts
function effectivePermissions(
  state: RunState,
  claims: ContextClaims,
): { all: Set<string>; tenant: Set<string> } {
  const all = new Set<string>();
  const tenant = new Set<string>();
  for (const assignment of state.roleAssignments) {
    if (
      assignment.userId !== claims.userId ||
      assignment.organisationId !== claims.organisationId ||
      assignment.status !== 'ACTIVE'
    ) {
      continue;
    }
    // A BRANCH grant counts only while its branch is selected — never at institution level.
    if (
      assignment.scopeType === 'BRANCH' &&
      (claims.branchId === null || assignment.branchId !== claims.branchId)
    ) {
      continue;
    }
    const role = state.roles.find((candidate) => candidate.id === assignment.roleId);
    if (role?.status !== 'ACTIVE') {
      continue;
    }
    for (const code of role.permissions) {
      all.add(code);
      if (assignment.scopeType === 'TENANT') tenant.add(code);
    }
  }
  return { all, tenant };
}
```

In `requireContext`, compute the sets before the `return` and return both. Replace
`permissions: effectivePermissions(state, claims),` in the returned object with:

```ts
const { all, tenant } = effectivePermissions(state, claims);
return {
  state,
  claims,
  organisation,
  membership,
  permissions: all,
  tenantPermissions: tenant,
};
```

```ts
export function requirePermission(
  access: AccessContext,
  code: string,
  scope: PermissionScope = 'tenant',
): void {
  const held = scope === 'branch' ? access.permissions : access.tenantPermissions;
  if (!held.has(code)) {
    throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
  }
}
```

The file runs under plain `node`: keep erasable syntax only, relative imports only.

Run (form E): `e2e/fake-api-access.spec.ts e2e/fake-api.spec.ts`. Expected: PASS.

- [ ] **Step 3: Write `e2e/support/admin.ts`**

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { selectMuiOption } from './auth';

interface EnterAdminOptions {
  /** The h1 the page renders once settled. */
  heading: string | RegExp;
  organisation?: RegExp;
  /** The branch option after the organisation; `null` when the scenario has no branch step. */
  branch?: RegExp | null;
}

/**
 * Opens a tenant admin page through context selection. Waits are bounded: a route can be the first
 * hit of its tree under a cold `next dev` compile, and the URL updates before the RSC payload (and
 * its h1) renders. `/select-context` drops a deep link's query string, so `pathname` has none —
 * navigate to a query afterwards.
 */
export async function enterAdmin(
  page: Page,
  pathname: string,
  { heading, organisation = /Greenfield/, branch = /Head Office/ }: EnterAdminOptions,
): Promise<void> {
  await page.goto(pathname);
  await selectMuiOption(page, 'Organisation', organisation);
  if (branch) await selectMuiOption(page, 'Branch', branch);
  await expect(page).toHaveURL((url) => url.pathname === pathname, { timeout: 15000 });
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
    timeout: 15000,
  });
}

export async function expectNoSeriousOrCriticalViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
}

/** The layer a11y gate: light and dark, desktop and 375 px (index Global Constraints). */
export const A11Y_CASES = [
  { colorScheme: 'light', label: 'desktop', width: 1280, height: 800 },
  { colorScheme: 'light', label: '375px', width: 375, height: 812 },
  { colorScheme: 'dark', label: 'desktop', width: 1280, height: 800 },
  { colorScheme: 'dark', label: '375px', width: 375, height: 812 },
] as const;

export type A11yCase = (typeof A11Y_CASES)[number];

/** Before navigating: InitColorSchemeScript reads `matchMedia` on load, so a scheme emulated after
 * `goto` would scan whatever scheme the page booted into. */
export async function applyA11yCase(page: Page, a11yCase: A11yCase): Promise<void> {
  await page.emulateMedia({ colorScheme: a11yCase.colorScheme });
  await page.setViewportSize({ width: a11yCase.width, height: a11yCase.height });
}

/** After the page settled: the scheme applied, the title streamed, and — below 768 px — no
 * horizontal page scroll. */
export async function expectA11yCaseApplied(page: Page, a11yCase: A11yCase): Promise<void> {
  await expect(page.locator('html')).toHaveClass(new RegExp(a11yCase.colorScheme));
  await expect(page).toHaveTitle(/.+/);
  if (a11yCase.width < 768) {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  }
}
```

- [ ] **Step 4: Prove the helpers once, in `e2e/admin-kit.spec.ts`**

This is also the audit trail's first run at institution level:

```ts
import { expect, test } from '@playwright/test';
import {
  A11Y_CASES,
  applyA11yCase,
  enterAdmin,
  expectA11yCaseApplied,
  expectNoSeriousOrCriticalViolations,
} from './support/admin';
import { authenticate } from './support/auth';

test.describe('admin E2E helpers', () => {
  // Institution-level /admin/audit can be the first hit of its route tree under `next dev`.
  test.describe.configure({ timeout: 90000 });

  test('enter the audit trail at All branches, dark at 375 px, with no serious a11y violations', async ({
    context,
    page,
  }, testInfo) => {
    const darkNarrow = A11Y_CASES.find(
      (a11yCase) => a11yCase.colorScheme === 'dark' && a11yCase.width === 375,
    );
    if (!darkNarrow) throw new Error('A11Y_CASES lost its dark 375 px case');

    await applyA11yCase(page, darkNarrow);
    await authenticate(context, testInfo);
    await enterAdmin(page, '/admin/audit', {
      heading: 'Audit trail',
      branch: /All branches \(institution level\)/,
    });

    await expectA11yCaseApplied(page, darkNarrow);
    await expect(page.getByText('30 events')).toBeVisible();
    await expectNoSeriousOrCriticalViolations(page);
  });
});
```

Run (form E): `e2e/admin-kit.spec.ts`. Expected: PASS.

- [ ] **Step 5: Commit** (form C)

`git add e2e/fake-api/access.mts e2e/fake-api-access.spec.ts e2e/support/admin.ts e2e/admin-kit.spec.ts`

```
test(e2e): add scope-aware fake permission checks and shared admin page helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

- [ ] **Step 6: Gates** (form G, each in the background, polled with Monitor)

```bash
pnpm check
pnpm build
pnpm test:e2e
```

Expected: all pass. Record the gate evidence line (lane rules §2.8).

Then run a keyboard visual pass, because Task 3 changed every focus ring. The method is the
carried rule: a throwaway Playwright script against the fake API with E2E cookies (06
`progress.md`, "Carried"). Don't use a browser pane or a hand-started server.

1. Only after the three gates above, write the throwaway `e2e/zz-visual-07b.spec.ts`. It must not
   exist during a gate or a commit. `pnpm check` runs `format:check`, `lint` and `typecheck` over
   untracked files too, and a full `pnpm test:e2e` would pick it up.

   ```ts
   // THROWAWAY (07b Task 7 Step 6): never commit; delete after the pass.
   import { test } from '@playwright/test';
   import { A11Y_CASES, applyA11yCase, enterAdmin } from './support/admin';
   import { authenticate } from './support/auth';

   for (const a11yCase of A11Y_CASES) {
     test(`focus stops on /admin/audit, ${a11yCase.colorScheme} ${a11yCase.label}`, async ({
       context,
       page,
     }, testInfo) => {
       test.setTimeout(180000);
       await applyA11yCase(page, a11yCase);
       await authenticate(context, testInfo);
       await enterAdmin(page, '/admin/audit', { heading: 'Audit trail' });

       for (let stop = 1; stop <= 120; stop += 1) {
         await page.keyboard.press('Tab');
         const focused = page.locator(':focus');
         if ((await focused.count()) === 0) break; // focus left the page: the pass is complete
         const ring = await focused.evaluate((element) => {
           const style = getComputedStyle(element);
           const name = element.getAttribute('aria-label') ?? element.textContent ?? '';
           return `${element.tagName} "${name.trim().slice(0, 40)}" outline: ${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}, offset ${style.outlineOffset}`;
         });
         console.log(`${a11yCase.colorScheme} ${a11yCase.label} #${stop}: ${ring}`);
         const box = await focused.boundingBox();
         if (box) {
           await page.screenshot({
             path: testInfo.outputPath(`stop-${String(stop).padStart(3, '0')}.png`),
             clip: {
               x: Math.max(0, box.x - 12),
               y: Math.max(0, box.y - 12),
               width: box.width + 24,
               height: box.height + 24,
             },
           });
         }
       }
     });
   }
   ```

2. Run it with form E, on this spec only: `e2e/zz-visual-07b.spec.ts`.
3. Read the log lines, and look at the clipped screenshots under the test's `test-results/` output
   directories. The expected rings are:
   - **Rail items, the rail collapse toggle and the drawer Close:** a 2 px **`brand.onNavy`** ring,
     inset (offset −2 px). This is deliberate: the layer-04 rulings in
     `components/shell/workspace-navigation.tsx` and `components/shell/workspace-drawer.tsx`.
     Don't "fix" it to `palette.focus`. At 375 px the rail is hidden, so rail stops appear only at
     1280 px. The drawer Close appears only while the drawer is open, and this pass doesn't open
     it.
   - **Every other stop** (header buttons, the Entity type and Action selects, the datetime fields,
     "Clear filters", chips, row links, the pagination arrows): a 2 px solid `palette.focus` ring
     with a 2 px offset, unclipped.
4. Delete `e2e/zz-visual-07b.spec.ts`, then confirm that `git status --short` doesn't list it
   before any later commit or gate.
5. Record the result in the task report: each case, any stop that deviates, and what you did
   about it.

Then run the ui-ux-pro-max pre-delivery checklist (index gate 3; `references/pro-rules.md`, section
"Pre-Delivery Checklist") on `/admin/audit`. Task 3's ring change and Task 6's row extraction both
affect that page. Use the pass's screenshots as evidence, and record the result in the task report.
The kit's components get their first page in 08, which runs the checklist on it.

- [ ] **Step 7: Ledger**

- Write the six Rulings from Global Constraints as `Ruling:` lines.
- Re-grep this plan's file list against plan 07's final list (the disjointness table), and record
  the result.
- Record "no live read: 07b reads no new endpoint".
- Record that `AuditEventTable` gained `scrollOnNavigate` (default `false`), and that
  `RecordAuditTab` passes `true`, because its links leave the page.
- Record for 07 (a note, not a fix here): `ReasonDialog` has the gap `ConfirmDialog` closed. Its
  Dialog `onClose` isn't blocked while the action is pending; only Cancel is disabled. So Escape
  or a backdrop click during a slow request unmounts `ReasonForm` and discards its idempotency key.
  The fix is the same: lift `pending` into the dialog, and pass `onClose={pending ? undefined : onClose}`.
- Record for the controller: plan 08's workaround for 07b's old real branch-only code is no longer
  needed. That is the "Fake seed rule (blocking)" ban on adding `branch.*` codes to
  `TENANT_ADMIN_PERMISSIONS`, its Step 3 `branch.suspend` grep, and the `BRANCH_ADMIN_CODES`
  comment. The Step 3 grep now finds nothing, so 08's pre-flight stops until 08 is updated. 08
  should also pass `allBranchesAvailable={resolved.profile.branches.length > 1}` to
  `BranchContextState`, and update its pinned `BranchContextState()` signature row.
- Then run the lane rules' §7 self-integration.
