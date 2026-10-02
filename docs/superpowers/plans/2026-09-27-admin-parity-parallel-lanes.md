# Administration Prototype Parity — Parallel Lane Rules

> **For every agent in either lane.** Read this file, the
> [plan index](./2026-09-25-admin-parity-00-index.md) and your layer's plan before you touch code.
> The index's Global Constraints and execution protocol still apply. This file adds only the rules
> that two concurrent build lanes need.

**Approved:** option B, "C3 pipeline backbone + gated lane B", with sign-offs D1–D8, 2026-09-27.
**Source:** the parallelisation design's verdict, as corrected by its critic. Where a critic
correction marked [verified] contradicts the verdict text, the correction wins, and this file
already carries it.

**Where the procedures live:** step-by-step procedures (creating worktrees, boundary steps, exact
integration command sequences) are in the controller's `.superpowers/sdd/RUNBOOK-lanes.md`. This
file holds the rules.

- For procedures and command forms, the runbook wins.
- For ownership and the shared-file rules, this file wins.
- For anything else the two disagree on, stop and ask the controller.

**Which copy is authoritative:**

- Until layer 07b's docs commit, the authoritative copy is
  `/home/ogaba/finaxis/finaxis-frontend/.claude/worktrees/admin-parity/.superpowers/sdd/_jit/2026-09-27-admin-parity-parallel-lanes.md`.
- From that commit on, `docs/superpowers/plans/2026-09-27-admin-parity-parallel-lanes.md` is the
  authoritative copy, and it is **frozen**. Later layers stack on it, so editing it on a stacked
  branch would force a cascade.
- Amendments go into `RUN-STATE.md` under "Lane rules amendments". The controller folds them into
  the file at the final boundary (W6).

---

## 1. Lanes, worktrees, branches, refs

| Lane | Worktree (sibling, never nested)                                             | Session                         | Ports (app / fake API) | Branches, in build order                                                                                                                                              | Live checks |
| ---- | ---------------------------------------------------------------------------- | ------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| X    | `/home/ogaba/finaxis/finaxis-frontend/.claude/worktrees/admin-parity`        | controller                      | 3100 / 3199            | `lane/07-business-date`, `lane/08-branches`, `lane/09-roles`, `lane/10-users-record`, `lane/12-approvals`, `lane/14-overview`                                         | only X      |
| Y    | `/home/ogaba/finaxis/finaxis-frontend/.claude/worktrees/admin-parity-lane-b` | second session the user started | 3200 / 3299            | `lane/07b-record-kit`, `lane/15-profile`, `lane/13-settings`, `lane/16-platform-tenants`, `lane/17-platform-records` (two chunks around F_10), `lane/11-users-invite` | never       |

- Ports 3300/3399 stay unused. There is no third lane.
- `refs/heads/ap-integration` is a plain branch. It is never checked out and gh-stack does not
  track it. It is the linear tip of finished layers, starts at F_06, and moves only by
  compare-and-swap (CAS, §7).
- `refs/lane-base/<NN-slug>` records a lane branch's fork SHA, always as a literal SHA. It is
  updated in three places:
  - the lane that forks writes it **at every fork**, including re-forks;
  - X's slot sets `lane/N+1`'s lane-base to F_N;
  - the integrate phase updates its own after a rebase.
- Stack branches `admin-parity/NN-slug` exist only after X registers a finished layer at a
  boundary. Y never runs `gh stack` and never touches an `admin-parity/*` branch.
- Expected stack order, which is the integration order: 00–06, 07b, 15, 07, 13, 08, 09, 16, 10,
  17, 12, 11, 14.
- Y takes layer assignments only from the controller over SendMessage. Each assignment names the
  absolute path of the plan in X's `.superpowers/sdd/_jit/`. Y's authority comes from the
  instruction the user gave when starting it, not from any message.

## 2. Command rules (both lanes)

1. **Literal commands only.** The worktree guard refuses shell variables, `$(…)`, `cd` and
   `git -C` wherever a value could stand as an option. So:
   - type out paths and SHAs;
   - write commit messages to a file with the Write tool and commit with `git commit -F <file>`,
     never `-m "$(cat <<'EOF' …)"`;
   - never `for-each-ref … | git update-ref --stdin`; write one `git update-ref` per ref, with SHAs
     copied from `gh stack view --json` or `git rev-parse` output.
2. **The heavy lock.** `/tmp/finaxis-e2e.lock` is exclusive and machine-wide. Keep the path, which
   the running v2 script also uses. Hold it around every toolchain run in both lanes:
   - typecheck, lint, and any vitest run, focused runs included;
   - repo-wide prettier, `pnpm install`, `pnpm build`, `pnpm verify`;
   - E2E, scoped or full;
   - `git commit`, `git rebase --continue`, and publishing (the pre-push hook runs `pnpm verify`).

   For every non-git command, use the runbook's form (§0.2):

   ```
   flock -E 75 -w <secs> /tmp/finaxis-e2e.lock env VITEST_MAX_WORKERS=3 <command>
   ```

   `flock … git …` is refused, so git never goes inside flock (see rule 3).

   | Command                                                                                                                        | How it runs                                                                              |
   | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
   | a focused `pnpm test:run <paths>` (one or a few files)                                                                         | foreground, `-w 240`                                                                     |
   | `git commit` (lock wait up to 900 s + hook), scoped or full E2E, `pnpm check`, `pnpm build`, `pnpm install`, `gh stack submit` | `run_in_background` with a log file, polled with Monitor (Bash dies at 600 s), `-w 1800` |

   Exit 75 means the lock wait timed out. Retry; it is not a failure. Never skip the step.

3. **Commits and the husky wrapper.** The approved `~/.config/husky/init.sh` (source:
   `…/scratchpad/husky-init.sh`, installed per the runbook's §3.2) re-executes the **pre-commit
   and pre-push** hooks under `flock -E 75 -w 900 /tmp/finaxis-e2e.lock`, and exports
   `VITEST_MAX_WORKERS=3`. So:
   - commit with the plain form `VITEST_MAX_WORKERS=3 git commit -F <msgfile>`, in the background;
   - never hold the lock yourself around a commit. The hook would wait on your lock and fail after
     900 s. The only exception is setting `FINAXIS_LOCK_HELD=1`, which the runbook reserves for its
     self-test;
   - never commit before `RUN-STATE.md` records the wrapper as installed and self-tested. Without
     it, the hook's full `pnpm check` runs unlocked.
4. **Worker cap.** Prefix every command that runs vitest with `VITEST_MAX_WORKERS=3`, or the value
   P0 chose. That includes `git commit`, because the prefix reaches the pre-commit hook. D7 is
   resolved as this env prefix. Never edit `vitest.config.ts` for it.
5. **Ports.** Before every Playwright run, check your own two ports with
   `ss -ltn '( sport = :3200 or sport = :3299 )'` (X: 3100/3199). Playwright reuses an existing
   server outside CI, so a listener you did not start would run your specs against someone else's
   code. If one exists, stop and report it. Never kill a listener you did not start, and
   especially never a 3100 listener. Run E2E as `PORT=<app> FAKE_API_PORT=<fake> pnpm test:e2e …`.
6. **Stage whole files only:** `git add <path>`, never `git add -p`. lint-staged 17 drops its backup
   stash by an index into the stash stack, and every worktree shares that stack. After a killed
   commit, find `lint-staged automatic backup (<runId>)` in `git stash list --format='%H %gs'`,
   apply it by hash, and never pop.
7. **The hook is the check.** Don't run `pnpm check` by hand before a commit, because the
   pre-commit hook runs it. Run it explicitly only at gates.
8. **Gate evidence** (ruling cv-T6-G8, as the runbook words it): "the gate held the exclusive heavy
   lock; /proc/loadavg recorded before each run". Gate agents record the value.
9. **Disk floor.** Before any heavy job, run `df -k --output=avail,target /home/ogaba/finaxis /tmp`.
   If either has less than 2 GB free, stop and free space first.
10. **Readers never follow a moving tree.** Finish-mode lenses, skeptics and JIT-plan writers read
    `git show <literal sha>:<path>` or a `git archive` snapshot, never X's working tree. While
    build(N+1) is active, the controller runs no mutating git in X.

## 3. Ownership

Each item has one owner. Other layers consume it and never build their own copy.

| Layer | Owns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 07    | The mutation pipeline (`runServerAction`, `ActionResult`, `FormAction`); `SectionCard`; `ReasonDialog` with `fields`. **A1:** `backendApi` `put`/`patch`/`delete`, a 204 returning `undefined`, plus `apiPut`/`apiPatch`/`apiDelete`. **A2:** `sendIdempotent(context, body, produce, status = 200)`, with a 204 replayed without a body. **N:** `notifications?: ReactNode` next to `businessDate` in GlobalHeader, AppShell and the layout, filled by `components/shell/notifications-slot.tsx`, which renders two `null` stubs by workspace from two separate files (tenant for 12, platform for 17), so 12 and 17 never both edit `app/(authenticated)/layout.tsx`. **R:** a fake `recordAuditEvent(state, access, {…})` in **its own file**, `e2e/fake-api/audit-log.mts`, not in `access.mts` (07b edits `access.mts`). |
| 07b   | `RecordHero`, `RecordTabs`, `RecordAuditTab` (with `AuditViewToggle` and `audit-rows.ts`), `lib/api/list-sort.ts`, `CopyIdButton`, `ForbiddenState` and `BranchContextState` (with `SwitchToAllBranchesButton`), `ConfirmDialog`, the MUI `focusVisible` ring, StatusChip tones for ARCHIVED/CLOSED/DEPRECATED, fake `requirePermission(access, code, scope = 'tenant')`, `e2e/support/admin.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 08    | Users search (fake `GET /tenant/users`, service, route handler, `UserPicker`); `AssignmentDrawer`; the React Hook Form `applyFieldErrors` helper; the branch contract; the README entry for the 07b kit (its first consumer).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 09    | `getRoleIndex`; the role-assignment contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 10    | The users contract; onboarding rules; membership actions; the `AuditFilters` actor picker.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 11    | The invite wizard, built on 16's Stepper and wizard scaffold.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 12    | The tenant notifications badge, which fills N's tenant stub.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 13    | The settings catalogue. PUT ships disabled unless the L1 `PUT /tenant/settings` probe passed; spec §10.7 defaults to disabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 14    | The overview. It keeps the h1 "Administration Overview", which existing specs assert.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 15    | The profile. It groups permissions by code prefix. It uses MUI `Card`, and adopts `SectionCard` only as a drop-in change after 07 integrates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 16    | Stepper and the wizard scaffold (moved from 11); the platform contracts. It migrates only the tenant mappers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 17    | `KpiTile`; the platform notifications badge (moved from 12), which fills N's platform stub.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Disjointness, a hard rule.** After 07's pre-flight, re-grep 07b's file list against plan 07's
final file list, including A1/A2/N/R. Any overlap moves that 07b item to 08. Plan 07b carries the
table to check against.

## 4. Controller-owned files

Lanes never edit these. A lane that needs a change asks the controller: Y over SendMessage, X by
ruling it in the ledger.

- `playwright.config.ts`, `playwright.keycloak.config.ts`, `vitest.config.ts`
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
- `eslint.config.mjs`, `prettier.config.mjs`, `.prettierignore`
- `.gitattributes`, `.gitignore`, `tsconfig.json`, `next.config.ts`, `.husky/*`
- `docs/superpowers/plans/2026-09-25-admin-parity-00-index.md`. The controller adds each layer's row
  and Plan link when it registers the layer. A lane's docs commit never touches the index.
- `.superpowers/sdd/RUN-STATE.md` and `.superpowers/sdd/RUNBOOK-lanes.md`
- Shared test infrastructure, `test/setup.ts` and `test/test-utils.tsx`: change only with the
  controller's approval. Keep a polyfill local to the test file that needs it.

Lanes never edit another layer's plan.

## 5. Shared-file rules

**Seed data (`e2e/fake-api/scenarios.mts`).**

- Never add rows to the existing collections of `greenfieldTenant()`: `users`, `memberships`,
  `branches`, `branchAssignments`, `roles`, `roleAssignments`, `auditEvents`. Existing specs count
  them; for example, `audit.spec` depends on the 30 audit events.
- A layer may add a **new** collection with its default rows (07 adds `businessDates`), and
  permission codes that the real TENANT_ADMIN seed holds (contract §J).
- Everything else goes into the layer's own scenario builder in `BUILDERS`. `FakeApiScenario`
  derives from `BUILDERS`, so never edit `e2e/support/auth.ts` to add a scenario name.
- A test that needs extra state and no route may seed it inside the spec. Call `seedScenario()`,
  then push layer-prefixed rows (see `e2e/fake-api-access.spec.ts`, layer 07b).
- A test that needs a permission code no seed holds uses a layer-prefixed synthetic code, such as
  `07b.branch_only`, never a real one. Any layer may add real TENANT_ADMIN codes (above), which
  would turn a real code into a TENANT grant under that test.

**Seed IDs.** Every ID a layer adds uses its prefix. The last 12 hex digits are a per-layer
counter, and no ID is ever reused across layers.

| Layer | ID pattern                             | Layer | ID pattern                             |
| ----- | -------------------------------------- | ----- | -------------------------------------- |
| 07    | `07000000-0000-4000-8000-00000000000n` | 12    | `12000000-0000-4000-8000-00000000000n` |
| 07b   | `07b00000-0000-4000-8000-00000000000n` | 13    | `13000000-0000-4000-8000-00000000000n` |
| 08    | `08000000-0000-4000-8000-00000000000n` | 14    | `14000000-0000-4000-8000-00000000000n` |
| 09    | `09000000-0000-4000-8000-00000000000n` | 15    | `15000000-0000-4000-8000-00000000000n` |
| 10    | `10000000-0000-4000-8000-00000000000n` | 16    | `16000000-0000-4000-8000-00000000000n` |
| 11    | `11000000-0000-4000-8000-00000000000n` | 17    | `17000000-0000-4000-8000-00000000000n` |

Reserved by layers 03–06, never reused: the `IDS` constants (`00000000…`, `11111111…` through
`aaaaaaaa…`), `b0000000-…` (branch assignments), `c0000000-…` (role assignments) and
`e0000000-…` (audit events).

**Tests.**

- One test file per component or module, next to its subject (`x.tsx` → `x.test.tsx`). Never append
  to a test file another in-flight layer edits; for example, 07 appends to
  `components/data-display/data-display.test.tsx`.
- Fake-API smoke tests go in `e2e/fake-api-<domain>.spec.ts`, not `e2e/fake-api.spec.ts`, which 07
  appends to.
- E2E helpers for admin pages come from `e2e/support/admin.ts` (07b). Existing specs keep their own
  local helpers; don't migrate them mid-stack.

**Backend-gap IDs** are layer-scoped: `BG-<NN><letter>`, for example `BG-13a`. The controller
renumbers them when it registers the layer.

**Shared registries** are append-only, with one commit per registry group per layer, as 06's
`bdf11e6` did. They are `administration-navigation.ts`, the route list in `server.mts`,
`TENANT_ADMIN_PERMISSIONS`, the StatusChip `TONES`, and the audit vocabulary. Navigation follows
spec §8 order.

**README.md / AGENTS.md:** edit them only in the layer that changes the architecture. Resolve a
conflict by union (R4).

## 6. Kit freeze

- Once 07b integrates, its kit files change only additively: new optional props and new exports.
  The kit files are `RecordHero`, `RecordTabs`, `RecordAuditTab`, `AuditViewToggle`,
  `audit-rows.ts`, `ConfirmDialog`, `list-sort.ts`, `CopyIdButton`, `ForbiddenState`,
  `BranchContextState`, `SwitchToAllBranchesButton`, `e2e/support/admin.ts` and the fake
  `requirePermission`.
- Each kit change is one `refactor(kit): …` commit, announced to the other lane over SendMessage.
- The same rule applies to 07's `runServerAction`, `ReasonDialog` and `SectionCard` once 07
  integrates.
- Renaming or removing a Produces item, or changing its meaning, is an escalation to the
  controller, never a lane decision. Otherwise X's 08 and Y's 16 could both extend `RecordHero`,
  rebase cleanly, and still clash in meaning.

## 7. Integration

**Y self-integration** (the integrate phase of mode `all`, run in Y):

1. Freeze the lane tip L. Check that `git log refs/lane-base/<NN>..L` matches the ledger, and that
   `package.json` and `pnpm-lock.yaml` are unchanged.
2. Read the `ap-integration` tip T.
   - If T equals the lane-base, take the fast path.
   - Otherwise run
     `GIT_EDITOR=true git -c rerere.enabled=true -c rerere.autoUpdate=true rebase --onto <T> <refs/lane-base/NN SHA>`,
     resolve conflicts with R1–R6 below, and then run
     `git update-ref refs/lane-base/<NN> <T> <old lane-base SHA>`.
3. Run full gates on your own ports, under the lock (§2).
4. Run a range-diff review: sonnet, or opus for R5/R6. Cross-check every `Ruling:` line against
   X's `.superpowers/sdd/*/progress.md`.
5. Wait while X's slot marker `/tmp/finaxis-x-slot` exists, because X's slot has priority.
6. Assert `git merge-base --is-ancestor <T> <new tip>`. `update-ref` does not check ancestry, so a
   bad rebase could silently drop X's layers. Then CAS:
   `git update-ref refs/heads/ap-integration <new tip> <T>`. If the CAS fails, go back to step 2.
7. Update `Y/.superpowers/sdd/LANE-B.md` and SendMessage the controller.

**Conflict rules:**

- R1: lower layers win.
- R2: navigation follows spec §8 order.
- R3: append-only registries are unioned in stack order.
- R4: docs are unioned.
- R5: a semantic break gets a fix-forward commit.
- R6: if resolving needs a change to a lower layer, abort and escalate.

**Decide before the first integration:** whether husky's pre-commit runs on
`git rebase --continue` after a conflict. If it does, either resolve each conflicted commit to
green, or run `rebase --continue` with `HUSKY=0` (only with the user's approval) and run full gates
afterwards. `--no-verify` is never used.

**Y failure path.** A Y layer must not integrate if its `all` run ends "OPEN after fix wave", or if
its gates are still red after 2 rounds. It reports to X instead. At the next boundary the
controller decides: retry, move the layer to X (`git switch -c` from Y's tip, without checking out
Y's branch), or pull the kill switch (§10).

**Rollback and cascades.**

- A top layer that isn't registered yet can be dropped by CAS back to its lane-base, but only while
  nothing sits on top of it. After that, fix forward on the owning layer through a boundary cascade.
- Before any cascade, register every integrated layer, so that `ap-integration` equals the
  registered top. Layers that exist only on `ap-integration` are not rewritten by
  `gh stack rebase --upstack` and would be orphaned.

**Y bootstrap and re-sync.**

- Before each Y layer, re-sync X's `.superpowers/sdd/*/{progress,context}.md` into Y. The next
  layer's pre-flight reads every ledger, and some don't exist at setup time.
- Y runs with `--add-dir /home/ogaba/Downloads/finaxis-admin-prototype-source-v5/finaxis-admin-prototype`.
- Y's probes include a file read from Y to X and from X to Y.
- Y commits the layer's plan (and, for 07b, this file) as the first commit of its lane.

## 8. X slot rules

The slot for layer N is where N's fix wave lands inside build(N+1).

- a) build(N+1) must not start its gates until finish(N) has written `fix-wave.json`.
- b) A clean finish(N) still writes an empty marker, so the slot's rebase, full gate and CAS
  (which produce F_N) still happen.
- c) If finish(N) returns `stopped` (an agent returned null), build(N+1) must not poll forever.
  After a timeout it escalates to the controller, who relaunches with `resumeFromRunId`.
- d) A failed slot (gates red after 2 rounds, or a scoped re-review that is not clean) does not
  CAS. lane/N stays as it is, build(N+1) continues, and the controller rules at the next boundary.
- e) Triage a red slot gate before fixing anything: run the failing spec at the `ap-integration`
  tip without N. If it is red there too, the defect is in a lower or Y layer. Escalate it as a
  boundary cascade, and never fix it on lane/N ("Never commit a lower layer's concern on a higher
  branch").
- `/tmp/finaxis-x-slot` is X's priority flag. X writes it for its slots, boundaries and cascades,
  and removes it afterwards. Y's integrate phase waits while it exists, for up to 60 min.
- finish(N) always ends with `<X>/.superpowers/sdd/<slug N>/fix-wave.json`, whose `items` is `[]`
  when clean, or with `fix-wave.failed`. build(N+1) waits up to 120 min for it before its gates, and
  then returns `needs-controller`.

## 9. Live checks and publishing

- Only X runs live checks. The user signs in themselves; the agent never types credentials. The
  user approves every mutation individually.
- Never advance the dev business date.
- Terminal or real-world mutations run only with approval for that specific action: membership
  revoke, branch close, tenant reject, deprovision, tenant approve (real provisioning), and invite
  (a real Keycloak user plus email).
- Maker-checker checks need a second signed-in identity: 08 activate ≠ drafter, 10/12 approve ≠
  inviter, 16 approve ≠ creator/submitter.
- At t0: the paging probes, the `PUT /tenant/settings` probe (it writes the key's current value
  with a fresh Idempotency-Key), and the 05/06 live reads.
- A layer is publishable only after a live read check on its **final** SHA. For B2, 07's mutation
  checks and 15's reads (audit filtered by `actor_id`, the `/auth/me`-derived tabs) run on F_07
  before the user is asked about publishing.
- 07b reads no endpoint that 05/06 don't already read, so it needs no live read of its own.
- While a non-E2E dev server runs on 3100 for a live batch, hold the heavy lock through a
  background fd-lock shell, so no E2E run reuses that server.
- Publishing always needs the user's approval for that action. Before `gh stack submit --auto`,
  `git ls-remote --heads origin 'admin-parity/*' 'lane/*' ap-integration` must show nothing the
  user hasn't approved. The pre-push verify hook stays on.

## 10. Go/no-go, kill switch, fallbacks

**Lane B goes ahead only on a clean P0.** All of these must hold:

- the capped check is at least 1.5× faster, or MHz stays above 2 GHz under the capped load;
- at least 3 GB of disk has been freed;
- the guard probes pass, or their fallbacks are accepted;
- the projected two-lane usage fits the weekly budget before its reset without repeatedly
  exhausting 5-hour windows. At 13:05 on 2026-09-27, weekly usage was 69% and it resets on
  2026-09-30 at 03:00Z.

**Kill switch:** Y finishes its current layer and retires if any of these happens:

- two contention-caused red gates;
- lock waits above 10% of X's time (re-measure at every boundary);
- weekly usage above about 90%.

| If                              | Then                                                                |
| ------------------------------- | ------------------------------------------------------------------- |
| Y isn't ready at t0             | The 07b kit becomes 08's Task 0 on X; Y starts with 13              |
| The 07 amendments are declined  | A1/A2/N/R become 08's Task 0; Y's 13 and 16 start from F_08         |
| Lane B is a no-go, or is killed | Pure pipeline: 07 → 08 → 13 → 09 → 15 → 10 → 16 → 11 → 12 → 17 → 14 |
