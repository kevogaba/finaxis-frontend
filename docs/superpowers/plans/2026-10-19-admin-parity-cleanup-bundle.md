# The Bundled Cleanup after Layer 14 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [handoff](./2026-10-02-admin-parity-handoff.md)
> §3 and §9, the [11 invite wizard plan](./2026-10-12-admin-parity-11-invite-wizard.md) with its
> errata, and the [14 overview plan](./2026-10-18-admin-parity-14-overview.md) first.

**Goal:** One reviewable PR of the small items the admin-parity layers deferred: the cheap, safe and
independent ones, each its own commit. It closes the window in the kit's dialogs behind layer 12's
`e2e/settings.spec.ts` flake (latent on `main`: hardening, not a fix for a failing test), moves the
remaining raw MUI option and popover clicks onto helpers that wait for the popup to stop growing in,
adds four of the invite wizard's gate observations and its reachable test gaps, lets the wizard's
scroll clearance follow a taller action bar, answers kevogaba/finaxis-frontend#62's open question
about the bell's hint for a one-branch account, quiets the unit run and corrects the docs. Two items
exist only in layer 14's files: **Part B** applies them after kevogaba/finaxis-frontend#69 merges.

**Architecture:** No new route, module, package, theme token or `'use client'` file. Three
additive kit fixes, each announced (handoff §3.2): `ConfirmDialog`, `ReasonDialog` and
`AssignmentDrawer` report `pending` to their parent from a layout effect (A3); the theme's
`MuiAlert` gains the house `:focus-visible` ring (A4); `WizardForm` measures its action bar (A5).
One input on 12's `approvalNotifications` (A8), optional until B2 makes it required. One shared
unit-test helper, `test/press-escape-when.ts` (A3). Everything else is e2e, unit tests, tooling
and docs.

**Tech Stack:** Next.js 16.4, React 19.3, MUI 9.5, React Hook Form 7.90, Vitest 4.1 + RTL,
Playwright 1.64 + axe. No new packages: `pnpm-lock.yaml` doesn't change, and `package.json` changes
only lint-staged's glob (A9 adds `mts`); no dependency changes.

**Base:** `e6f7e7e` (`origin/main`: layers 09, 16, 10, 17, 12 and 11 merged). Part A is planned
and proven on it. Part B is planned against `8258e3e` (`admin-parity/14-overview`, PR #69, CI
green, not merged) and proven there **with Part A applied first**, as it will run: once #69 is
merged, the controller rebases the cleanup branch onto the new `main` and applies Part B on top.
The branch is `admin-parity/cleanup-bundle`; the PR targets `main`. The **Pre-flight notes**,
**Layer gate**, **Controller live check** and **Self-review** sections are not tasks.

**Plan history:** drafted 2026-10-19 on `e6f7e7e` and `8258e3e`; revised the same day after an
adversarial review (one Important and ten Minor findings applied: the settings flake's cause
restated, both edges of a submit pinned, the two click-helper tasks merged and the tasks
renumbered). Every block is replayed from this file's own text in throwaway worktrees of both
(Self-review). The maintainer's answers (`questions.md`) are recorded in the Rulings table: A2 is in,
the PR merges by rebase with one commit per task, and Part B waits for #69's merge.

## Global Constraints

Sources: **A** = `AGENTS.md`; **H3.n** = handoff §3 standing rule n; **C** = the controller's
rulings; **L1–L8** = the lessons of layers 09–14: **L1** a failed read is never absence; **L3**
test discipline (`next/headers` mocked wherever `load()` runs, e2e hydration before a click, exact
names, one scenario per test, chunkable `describe` titles); **L4** copy that says what is true;
**L5** split briefs, one commit per task on a clean tree, prettier; **L6** Next 16 / MUI v9 rules;
**L7** CI's browser: CI runs Playwright 1.64's `chrome-headless-shell` 156 with `CI=true` and two
retries, while a sandbox may carry another Chromium that lays out a few pixels apart, so every
e2e run in this plan goes through the controller's CI-browser wrapper with `--retries=0`; **L8**
never stop a dev server with a pattern that matches your own command line: stop it by pid, and
check ports 3100 and 3199 for LISTEN rows in `/proc/net/tcp` first. Every task's brief includes
this section.

**Command forms.** Every command runs from the repository root with Node 24 and the environment
`config/env.server.ts` validates (the build and the pre-push hook need it):

```bash
# U — focused unit tests (foreground)
pnpm exec vitest run <test files>
# E — E2E only through the controller's CI-browser wrapper, in the foreground, chunks of at most
#     8 minutes, always with --retries=0
<e2e wrapper> <spec files> [--grep <pattern>] --retries=0
# C — commit: write the message to a file outside the repo first; stage whole files only. The
#     husky hook (lint-staged + the full pnpm check, about 5 minutes) is the check. Never --no-verify.
git add <whole files>
git commit -F <message file>
```

**Binding rules** (one line each; the source in brackets):

1. `pnpm check` after any implementation change, the affected e2e specs (form E) when rendered UI
   or an e2e helper changes; no task is done until both are clean. [A]
2. No `@ts-ignore`, `@ts-nocheck`, unsafe `any`, or rule disables; fix the cause. [A]
3. MUI + Tailwind (layout only); no new packages, no new theme token (A4 spreads the existing
   `theme.focusVisible`); muted text by `sx`, never a dotted `color` on Typography and friends. [A]
4. Kit and theme changes are additive and announced (**Shared changes**), each in its own commit:
   no breaking prop change; one new input (A8), optional until B2 makes it required with every
   caller passing it. [H3.2]
5. An e2e test signs in to its own fake-API run, one scenario per test, `expectHydrated` before a
   click, names matched `exact`; the one exception to the fake API is A2's helper self-test, and
   only on the maintainer's yes (Q1). [A, L3]
6. Every MUI Select option is clicked through `clickMuiOption`, every click inside a MUI Popover
   through `clickInMuiPopover` (A1); an Autocomplete's options stay plain clicks (no Grow). [C]
7. A test that pins behaviour fails when the behaviour is reverted: each task names its RED run or
   its mutation proof, and says so when a test only pins existing behaviour. [C]
8. Every user-visible string is defined once and quoted verbatim in the e2e. [C]
9. Part B touches only #69's files, the overview spec and `approval-notifications.ts` with its test
   (B2 makes `canSwitch` required), and starts only after #69 is merged and the branch is rebased
   onto the new `main` (Q4). [C]
10. Every commit ends with exactly these two trailer lines, and no model name appears in code,
    docs, commit messages or trailers:

    ```
    Co-Authored-By: Claude <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
    ```

11. `README.md` and `AGENTS.md` change where a documented behaviour changes (A1, A2, A5, A10); the
    plan's trailing gate, live-check and self-review sections are the controller's. [A]

**Files this PR never touches:** `pnpm-lock.yaml`, and `package.json` but lint-staged's glob (A9);
`lib/*`, `auth/*`, `config/*`; the fake API (`e2e/fake-api/**`: no scenario or route change; the
one-branch bell's screenshot uses an uncommitted scenario, **PR body guidance**);
`app/(authenticated)/layout.tsx` and every shell component but `tenant-notifications.tsx` (A8, A9
also edit three shell tests); other layers' plans and the plan index.

## Rulings for this bundle

Decisions the implementer can't make. The maintainer answered Q1, Q3 and Q4 and approved every other recommended default on
2026-10-19; the plan carries each answer (questions.md gives the options, the reasons and the cost if wrong).

| Q   | Decision the plan carries                                                                                    | Kind                 | Maintainer's answer                |
| --- | ------------------------------------------------------------------------------------------------------------ | -------------------- | ---------------------------------- |
| Q1  | A2: a `page.setContent` self-test of the click helpers, the one e2e spec without the app or the fake API     | BLOCKING for A2 only | Confirmed: A, add the self-test    |
| Q2  | "All branches" and "Institution (all branches)" stay: two different fields, not one name for the context     | default              | Confirmed: the recommended default |
| Q3  | Merge with **rebase and merge**, one commit per task (not the house squash: the maintainer decides at merge) | default              | Confirmed: A, rebase and merge     |
| Q4  | Part B waits for #69's merge, then the branch is rebased and Part B applied                                  | default              | Confirmed: A, wait for #69         |
| Q5  | #62's bell hint: tell an account that works at one branch who activates (A8, B2)                             | default              | Confirmed: the recommended default |
| Q6  | #62: Approve's confirmation stays a plain dialog                                                             | default              | Confirmed: the recommended default |
| Q7  | #62: "Newest first" stays on User onboarding; README says it is the account's age (A10)                      | default              | Confirmed: the recommended default |
| Q8  | `WizardForm` measures its bar, never below 140 px (A5)                                                       | default              | Confirmed: the recommended default |
| Q9  | The Alert focus ring lands here (A4), not in its own PR                                                      | default              | Confirmed: the recommended default |
| Q10 | Three invite gate observations stay out (focus on `<body>` while busy, the Scope menu, 600 px names)         | default              | Confirmed: the recommended default |
| Q11 | The CI-browser how-to is a README section, no `package.json` script (A10)                                    | default              | Confirmed: the recommended default |
| Q12 | #69's skeleton heights stay as they are (Recent activity's 30 px measured and explained)                     | default              | Confirmed: the recommended default |
| Q13 | The empty readiness bar's faint track stays (the theme's shared track)                                       | default              | Confirmed: the recommended default |
| Q14 | Autocomplete options stay plain clicks (no Grow, so no race)                                                 | default              | Confirmed: the recommended default |
| Q15 | The settings flake's latent window is closed in all three dialogs' pending report (A3), not by an e2e wait   | default              | Confirmed: the recommended default |

1. **The settings flake (Q15).** The window is in the kit, not the test (Pre-flight 1): the
   dialog's parent learned `pending` from a passive effect, one render late at both edges of a
   submit, so an Escape as the failure's alert appeared was dropped, and one as the submit started
   could close the dialog mid-request. A3 reports it from a layout effect in `ConfirmDialog`,
   `ReasonDialog` and `AssignmentDrawer`, whose code is identical in this respect; the e2e test is
   unchanged. The flake doesn't reproduce on `main`, so this hardens a latent window. Cost if
   wrong: three one-line changes and their tests.
2. **Clicks in growing popups (Q14).** MUI's Select menu and Popover grow in (`Grow`); the
   Autocomplete popup doesn't. Select options go through `clickMuiOption`, clicks inside a Popover
   through a sibling `clickInMuiPopover` that shares its bounded wait (both A1); Autocomplete
   options keep plain clicks. Cost if wrong: five call sites.
3. **One-branch accounts (Q5).** The bell, and in Part B the overview, say "Ask an administrator
   who works at institution level to activate them." instead of "Switch to All branches to
   activate them." when the account has fewer than two ACTIVE branches (the rule the queue pages
   already use, PF1). `canSwitch` is optional on `approvalNotifications` in Part A, defaulting to
   today's words, so every commit compiles before and after #69; B2 makes it required once every
   caller passes it, so no later caller gets the switch advice by omission. This changes the copy
   layer 12's Ruling 9 fixed, for one-branch accounts only (the PR body says so). Cost if wrong:
   drop A8 and B2.
4. **The measured bar (Q8).** `WizardForm` keeps `max(140, ceil(bar height) + 26)` px of scroll
   padding: the same 140 px in every state the e2e covers today, more only for a bar taller than
   114 px (text at 200%: 149 px). Cost if wrong: drop A5.

## Review Focus

Every reviewer (task and gate) checks these first; each names the tests that pin it.

1. **The flake's window, closed at both edges of a submit (A3).** `confirm-dialog.test.tsx`,
   `reason-dialog.test.tsx`, `assignment-drawer.test.tsx` "closes on Escape as soon as a failed
   submit shows its alert" and "ignores Escape from the moment a submit starts", each RED on
   `e6f7e7e`; the existing "cannot be closed … while the action is pending" tests still pass (the
   guard still holds while pending).
2. **No helper change weakens a wait (A1).** `clickMuiOption`'s messages are byte-identical;
   its only change is that its in-page wait is now the named `settleInPage`, shared with
   `clickInMuiPopover`. Pinned by A2's self-test when Q1 is yes; otherwise by the specs run in A1.
3. **Every new pin fails without its fix:** A4, A5, A6, A8, B1 and B2 each have a RED run (A5's
   e2e asserts the mechanism, not only the walk; B2's required `canSwitch` also fails `tsc` at a
   caller that omits it); A7's tests pin existing behaviour and each has a mutation proof.
4. **No string copied wrong (rule 8):** the e2e quotes `USERNAME_TAKEN`, `USERNAME_IN_USE`,
   `CHOOSE_ROW_BRANCH`, the bell's new sentence and the readiness note verbatim.
5. **Part B compiles only after Part A (B2 needs A8's `canSwitch`).**

## Pre-flight notes (the workflow's pre-flight phase; not a task)

The planner's pre-flight on `e6f7e7e` and `8258e3e` (read-only), verifying every candidate the
brief listed and adding what the ledgers record as deferred and still true.

1. **The settings flake: a latent window in the kit.** `e2e/settings.spec.ts:110` ("explains a
   frozen base currency instead of resetting it") opens the Reset dialog (a `ReasonDialog`), sees
   its failure alert and presses Escape. `ReasonDialog`, `ConfirmDialog` and `AssignmentDrawer` pass
   `onClose={pending ? undefined : onClose}` to their Dialog or Drawer, where `pending` is the
   parent's state, set by the form from a **passive** effect
   (`useEffect(() => onPendingChange(pending))`, `reason-dialog.tsx:128`, `confirm-dialog.tsx:125`,
   `assignment-drawer.tsx:125`). The render that shows the failure ends `pending` in the form, but
   the parent's guard lifts only after that render's passive effects run and the parent renders
   again: an Escape in between is ignored. The start of a submit lags the same way: the render
   that sets `pending` leaves the guard off for one more render, and an Escape then closes a
   dialog whose request is running, dropping its idempotency key. Evidence:
   - **Layer 12's tree** (`22a1d89`, Next 16.3.8 and MUI 9.4, where the flake was 2 of 40 runs at
     four workers): a forced-timing probe (not a captured natural failure) that presses Escape in
     the microtask after the alert is inserted left the dialog open **5 of 5** times; with A3's
     one-line change applied there, it closed **5 of 5** times (full Chrome 141, the layer's
     browser).
   - **`e6f7e7e`** (Next 16.4): the same probe closes the dialog unchanged, 5 of 5, and so does
     one that aims the Escape at `document.activeElement`, as a key press does (the plan review's,
     6 of 6); the button is re-enabled in the same mutation batch that inserts the alert. Focus
     stays on the disabled submit button inside the dialog, so layer 12's focus hypothesis is
     excluded. The test passed **40 of 40** runs on CI's browser and **60 of 60** on the full
     Chrome, four workers each. The window is still in the kit: under the project's react-dom
     19.3.0 with a plain promise action (jsdom), A3's six tests fail. Next 16.4's vendored
     react-dom schedules commits and passive effects exactly as 19.3.0 does (the two builds differ
     in no line of `commitRoot` or `flushPendingEffects`), so what hides the window in the browser
     is on Next 16.4's server-action path and is not identified.
   - So the flake is latent: unreachable in the browser on `main` today, and back if that path
     changes, as on 16.3.8. A layout effect closes the window at both edges of a submit, whatever
     schedules the parent's render: the guard engages in the commit that starts the submit and
     lifts in the commit that shows its outcome. The e2e test is not changed (Q15).
2. **Raw option clicks** (the line numbers are `e6f7e7e`'s). MUI Select menus grow in (Popover's
   `Grow`, `@mui/material/Popover/Popover.js:292`), the race `clickMuiOption` handles: the context
   switch dialog in `e2e/context.spec.ts:81, 83, 129, 132` and `e2e/profile.spec.ts:89, 91`, and
   the Assign-role drawer in `e2e/users.spec.ts:627, 633` → **A1**. Autocomplete options
   (`branches.spec.ts:188`, `roles.spec.ts:236`, `users.spec.ts:1042, 1084`,
   `platform-tenants.spec.ts:47`) only look alike: MUI 9.5's Autocomplete renders its default
   Popper with no transition, and none of the app's three Autocompletes passes one
   (`user-picker.tsx`, `branch-draft-form.tsx`, `tenant-draft-wizard.tsx`), so nothing moves under
   the click; `clickMuiOption`'s close-wait would also wrongly fail on the audit actor picker,
   which keeps focus in an emptied search → **not moved** (Q14). Clicks inside the two Popovers
   (the app switcher, `context.spec.ts:152`; the bell, `approvals.spec.ts:282, 286-289` and
   `platform-records.spec.ts:608`) share the race → **A1**. No other e2e click lands in a Menu or
   Popover (the user and theme menus are never clicked in a spec).
3. **The helper self-test** would be the first e2e spec without `authenticate()` and the fake
   API. Nothing in `AGENTS.md` forbids it; Playwright still starts both web servers when it runs
   with the suite. It kills the two helper mutants no repo test kills today (no animation wait; no
   close-wait) → **A2, only on Q1 = yes**.
4. **Gate observations of the invite wizard** (`.superpowers` ledger, layer 11 gate 1):
   - A focused failure Alert shows Chrome's 1 px `auto` outline: `theme/create-finaxis-theme.ts`
     has the house ring for Typography, TablePagination's select and TableContainer, not for
     `MuiAlert` (`:636`). Only five Alerts take focus (`tabIndex={-1}`): two in
     `invite-user-wizard.tsx` (`:338, :344`), one in `tenant-draft-wizard.tsx` (`:418`), two in
     `context-selection-form.tsx` (`:153, :179`, both `variant="outlined"`: the ring sits beside a
     1 px border there); a `:focus-visible` rule changes nothing on any other Alert → **A4** (Q9).
   - The Primary branch select reads blank while unset: `invite-choice-field.tsx` renders the empty
     "None" option without `displayEmpty` (measured: the display holds a zero-width space). The
     theme always shrinks the label (`MuiInputLabel` `shrink: true`), so "None" can't overlap it →
     **A6**.
   - The Invitation flags' descriptions start 29.3 px left of their labels' words
     (`invite-invitation-fields.tsx:45`: 281 px against 310.3 px at 1440): the checkbox is MUI's
     24 px icon (`pxToRem`) in 9 px of padding each side, pulled 11 px left by FormControlLabel →
     **A6**.
   - Focus on `<body>` while the email check or the send runs, and after the redirect onto the
     record: the busy button is MUI's `loading` Button, which disables it, the same in
     `ConfirmDialog`, `ReasonDialog`, `AssignmentDrawer` and `WizardForm`; after a navigation Next
     leaves focus where the browser puts it. An app-wide focus policy, not a cleanup item →
     **split out** (Q10).
   - The open Scope menu covers the reason "One branch" is disabled: the reason is the
     combobox's description before it opens, and arrow keys skip the option → **dropped** (Q10).
   - Role names ellipsize at about 600 px: the trade the gate accepted for a whole Scope value;
     stacking role rows below `lg` is a layout change with its own visual pass → **split out**
     (Q10).
5. **`WizardForm`'s clearance** is the constant `ACTION_BAR_CLEARANCE = 140`
   (`wizard-form.tsx:37-39`) in `GlobalStyles` (`html { scroll-padding-bottom }`, `:82`), pinned by
   `wizard-form.test.tsx` ("keeps the page scroll padding … 140px") and `AGENTS.md`'s WizardForm
   sentence. Measured on CI's browser (each probe in the Self-review): at 360 px the bar is 70 px
   on Access and 114 px on Review (its buttons wrap), 126 px on Review with text at 150%, and
   **149 px** on both Access and Review at 375 px with text at 200% (WCAG 1.4.4), against an app
   bar of 69 px (under `globals.css`'s 80 px). At 200% with 140 px of padding, the keyboard walk's
   uncovered stop is on **Access** (a new row's blank select, 0.16 px under the bar), not Review →
   **A5** (Q8), with that case added to the invite spec's keyboard walk. A sixth of a pixel is too
   fine a margin to pin the fix (other font metrics could let it pass without it), so the case
   also asserts the mechanism: the page's scroll padding grows past 140 px, to at least the bar's
   height plus 26 px.
6. **"All branches" against "Institution (all branches)": the premise is partly false.** The
   wizard's words are the TENANT **role scope** choice (`invite-rules.ts:56`, the same words as 09's
   Assign-role drawer, `role-assignment-actions.tsx:62`); the record tables' "All branches" is the
   **Branch column** of a TENANT-scope assignment (`users/[userId]/access/page.tsx:166`,
   `roles/[roleId]/assignments/page.tsx:128`, `approvals/components/requested-access.tsx:134`),
   beside a Scope column that says "Institution" (`role-rules.ts:86-88`). Neither is
   `ApplicationContext.branch`, the one AGENTS.md names "All branches". A choice names both
   columns; a table splits them → **no change** (Q2).
7. **The invite wizard's "unit-tested only" gaps: two premises are false.** Reachable with the
   existing `users-invite` scenario, no fake change: an auditor's unfinished branch row (an
   Access-step rule, `invite-schema.ts:87`), and a username a member here holds (the fake answers a
   new email with a taken username with the backend's 500, `routes/invitations.mts:192`; the
   action then finds Esther's `esther.njoki` and names it) → **A7**. Not reachable without a fake
   change and already unit-pinned: the "first 100" notes (`invite-access-fields.test.tsx`), a failed
   check's message (`invite-user-wizard.test.tsx`), a same-key retry (the key never reaches the
   browser), and the "may already have been sent" 409 (`invite-actions.test.ts:271`) →
   **dropped**. The stale failed check for an edited email is unpinned (a guard moved below the
   failure branch passes every test) → **A7**, unit.
8. **Running the e2e as CI does.** Nothing in the README says it. CI
   (`.github/workflows/ci.yml`) installs `pnpm exec playwright install --with-deps chromium` and
   runs `pnpm test:e2e` with `CI=true`; Playwright's headless Chromium is its
   `chromium-headless-shell`, so a developer with the pinned build already matches CI, and only
   another Chromium (an older installed build, a full Chrome through `channel` or `executablePath`)
   differs. A `package.json` script would need `CI=true` in a POSIX shell (no `cross-env`, which
   rule 3 rules out) → **README only, A10** (Q11).
9. **A stale `.next/dev/lock`: the premise is false.** Next 16.4 holds the lock natively
   (`lockfileTryAcquireSync`, `next/dist/esm/build/lockfile.js`, "best-effort, depending on the
   platform"; the WASM bindings skip it): on Linux and macOS the OS releases it when its holder
   dies. Measured in a worktree: after `kill -9` of a dev server's whole process group, the lock
   file stayed (naming the dead pid) and a new `next dev` started at once; with a live server, a
   second one exited with "Another next dev server is already running." and that server's pid. The
   "stale lock" was a live orphaned `next-server` (L8). Deleting the lock by hand only bypasses a
   live server → **no code; A10 documents it**.
10. **The unit run's notices**, all three still printed on `e6f7e7e` (230 files, 2,434 tests):
    Vite's "ESM syntax in a file loaded as CommonJS (vitest.config.ts)" (the repo has no
    `"type": "module"`); jsdom's "Not implemented: navigation to another Document" from
    `components/shell/workspace-drawer.test.tsx:88` (a real anchor click); and "Not implemented:
    HTMLFormElement's requestSubmit() method" from `components/shell/user-menu.test.tsx:48-57` (the
    log-out form's native submission) → **A9**. After the rename, twelve test comments would name a
    file that no longer exists (`git grep -n "vitest.config.ts" -- ':!docs'`), and lint-staged's
    `*.{ts,tsx,js,mjs}` skips `.mts` files (the hook's `pnpm check` still covers them) → both in
    **A9**.
11. **#62's four open questions.** The bell says "Switch to All branches to activate them." to an
    account that can't switch (`approval-notifications.ts:57`; the queue page already words both
    cases, `approval-copy.ts:114-118`) → **A8 and B2** (Q5). Approve's confirmation stays a plain
    dialog → no change (Q6). "Newest first" on User onboarding is the users endpoint's order, by
    account creation (BG-09) → README sentence in **A10** (Q7). The settings flake → **A3**.
12. **Layer 14's items (Part B, `8258e3e`).** `READINESS_DESCRIPTION` reads "One your role can't
    read says so." (`readiness-rules.ts:58-59`); no test, e2e or README quotes it (layer 14's plan
    quotes it as that layer's record, which stays) → **B1**. The approvals summary keeps 4 px
    between entries and 2 px inside a wrapped one (`pending-approvals-card.tsx:52`, `py: 0.5`,
    measured at 375 px) → **B1** (`py: 1`: 8 px). The empty bar's faint track is the theme's
    shared `surfaces.tertiary` (also `ListNavigationProgress`'s) → **dropped** (Q13). Recent
    activity's skeleton is 30 px short at 375 px because the real description gains "Times in
    <zone>." after the read and pushes the header link to a second row (measured: the card is
    395.5 px, and 365.3 px, the skeleton's height, with the skeleton's words) → **dropped**
    (Q12); the approvals skeleton's row count is #69's own open question (Q12).
13. **Also deferred and still true, not in this bundle:** the README's "Git hooks" section describes
    hooks that changed (pre-commit now ends with `pnpm check`, pre-push runs `pnpm verify` with the
    build; `README.md:65-68`) → **A10**. Layer 12's decision-bar polish (a long title stacks the two
    buttons; the caption is right-aligned at 375 px, `decision-bar.tsx:171`), the stale comment in
    `record-tabs.tsx:48-58` (11's dependency review) and the handoff's §5 kit and theme backlog
    (rulings the handoff says need the maintainer) → **split out**. The earlier layers' test-gap
    minors were triaged by each layer's final review and are not re-verified here → **dropped from
    this bundle**.
14. **Versions on `e6f7e7e`:** Next 16.4.0, React 19.3.0, MUI 9.5.0, React Hook Form 7.90,
    Playwright 1.64.0, Vitest 4.1.11. Unit baseline: 230 files, 2,434 tests, green.

**The inventory** (size: lines changed with tests; risk: shipped behaviour or a pinned test it
could change; UI: whether screenshots are needed):

| #   | Item                                                   | Where on `e6f7e7e`                                                                                    | True?                     | Size              | Risk                                     | Ruling | Verdict                    |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------- | ----------------- | ---------------------------------------- | ------ | -------------------------- |
| 1   | Select options clicked raw                             | `context.spec.ts:81,83,129,132`, `profile.spec.ts:89,91`, `users.spec.ts:627,633`                     | yes                       | 3 specs, ~25      | low (adds waits)                         | —      | INCLUDE A1                 |
| 2   | Popover clicks raw                                     | `context.spec.ts:152`, `approvals.spec.ts:282,286-289`, `platform-records.spec.ts:608`                | yes                       | ~70               | low (shared helper refactor)             | —      | INCLUDE A1 (with row 1)    |
| 3   | Autocomplete options clicked raw                       | `branches.spec.ts:188`, `roles.spec.ts:236`, `users.spec.ts:1042,1084`, `platform-tenants.spec.ts:47` | no race                   | —                 | a close-wait would misfire               | Q14    | DROP                       |
| 4   | Helper self-test                                       | none                                                                                                  | gap                       | ~100              | none (test-only)                         | Q1     | INCLUDE A2 if yes          |
| 5   | Focused Alert: default ring                            | `theme/create-finaxis-theme.ts:636`                                                                   | yes                       | ~40               | visual, five focusable Alerts            | Q9     | INCLUDE A4 (UI)            |
| 6   | Primary branch blank                                   | `invite-choice-field.tsx:52-66`                                                                       | yes                       | ~10               | visual                                   | —      | INCLUDE A6 (UI)            |
| 7   | Flag descriptions under the checkbox                   | `invite-invitation-fields.tsx:45`                                                                     | yes                       | ~20               | visual                                   | —      | INCLUDE A6 (UI)            |
| 8   | Focus on `<body>` while busy, after redirect           | MUI `loading` in four kit files; Next navigation                                                      | yes                       | app-wide          | focus behaviour everywhere               | Q10    | SPLIT                      |
| 9   | Scope menu covers the reason                           | `invite-access-fields.tsx` (Scope)                                                                    | yes                       | —                 | —                                        | Q10    | DROP                       |
| 10  | Role names ellipsize at ~600 px                        | `invite-access-fields.tsx` row grid                                                                   | yes                       | layout            | the gate's accepted trade                | Q10    | SPLIT                      |
| 11  | Fixed 140 px clearance                                 | `wizard-form.tsx:37-39, 82`                                                                           | yes                       | ~90               | low (never below 140)                    | Q8     | INCLUDE A5 (UI)            |
| 12  | "All branches" wording                                 | Pre-flight 6                                                                                          | partly false              | —                 | —                                        | Q2     | DROP                       |
| 13  | Invite gaps: auditor row, username return              | `invite-schema.ts:87`; `invite-actions.ts:62`                                                         | premise false (reachable) | ~80               | none (tests)                             | —      | INCLUDE A7                 |
| 14  | Invite gap: stale failed check                         | `invite-user-wizard.tsx:283-287`                                                                      | yes                       | ~30               | none (test)                              | —      | INCLUDE A7                 |
| 15  | Invite gaps: capped notes, failed check, same key, 409 | unit-pinned                                                                                           | yes                       | fake change       | —                                        | —      | DROP                       |
| 16  | Run e2e as CI does                                     | README none; `ci.yml`                                                                                 | yes                       | docs              | none                                     | Q11    | INCLUDE A10 (docs)         |
| 17  | Stale `.next/dev/lock`                                 | Next's native lock                                                                                    | false                     | docs              | —                                        | —      | DROP code; A10 docs        |
| 18  | Vite `configLoader` notice                             | `vitest.config.ts`; 12 test comments; lint-staged's glob                                              | yes                       | rename + 13 lines | low (same config)                        | —      | INCLUDE A9                 |
| 19  | jsdom "Not implemented" lines                          | `workspace-drawer.test.tsx:88`, `user-menu.test.tsx:48-57`                                            | yes                       | ~25               | none (tests)                             | —      | INCLUDE A9                 |
| 20  | `settings.spec` flake                                  | Pre-flight 1                                                                                          | latent                    | ~250              | kit timing only (both edges of a submit) | Q15    | INCLUDE A3                 |
| 21  | #62 Q1: bell hint, one branch                          | `approval-notifications.ts:57`                                                                        | yes                       | ~90               | bell copy for one-branch accounts        | Q5     | INCLUDE A8 (+B2) (UI copy) |
| 22  | #62 Q2: Approve as an alert dialog                     | `decision-bar.tsx`                                                                                    | —                         | —                 | —                                        | Q6     | DROP (keep)                |
| 23  | #62 Q3: "Newest first"                                 | `approval-copy.ts:100-101`                                                                            | yes                       | 2 lines           | none                                     | Q7     | INCLUDE A10 (docs)         |
| 24  | README hooks section stale                             | `README.md:65-68`                                                                                     | yes                       | docs              | none                                     | —      | INCLUDE A10 (docs)         |
| B1  | Readiness note wording                                 | `readiness-rules.ts:58-59` (#69)                                                                      | yes                       | 1 line            | none                                     | —      | INCLUDE B1 (UI copy)       |
| B2  | Approvals summary spacing                              | `pending-approvals-card.tsx:52` (#69)                                                                 | yes                       | 1 line            | visual                                   | —      | INCLUDE B1 (UI)            |
| B3  | Empty bar's faint track                                | theme `surfaces.tertiary`                                                                             | yes                       | theme             | every progress bar                       | Q13    | DROP                       |
| B4  | Skeleton heights                                       | `overview-card-skeleton.tsx`, `page.tsx` (#69)                                                        | yes                       | —                 | CLS trade-offs                           | Q12    | DROP                       |
| B5  | The overview's hint for one-branch accounts            | `overview-rules.ts:202` (#69)                                                                         | yes                       | ~70               | as 21                                    | Q5     | INCLUDE B2 (UI copy)       |
| C   | Decision-bar polish, `record-tabs` comment, handoff §5 | Pre-flight 13                                                                                         | yes                       | —                 | theme- or kit-wide rulings               | —      | SPLIT                      |

**Separable under a squash.** Each task is one commit with a conventional subject; the PR body
lists them with their files. If the maintainer squash-merges (Q3), the commits stay readable in
the PR, and each task's files are disjoint from the others' except: `e2e/users-invite.spec.ts`
(A5's keyboard case, A6's two pins, A7's constants and two tests, in different places),
`README.md` (A1, A2, A10) and `AGENTS.md` (A2, A5), each in separate paragraphs, and
`approval-notifications.ts` with its test (A8, then B2, which makes A8's input required). A revert
of one task then applies cleanly, except A8 while B2 is in: revert B2 first.

## Shared changes (announcement)

- Kit, additive (handoff §3.2): `ConfirmDialog`, `ReasonDialog`, `AssignmentDrawer` report
  `pending` from a layout effect (A3); `WizardForm` measures its action bar (A5).
- Theme: `MuiAlert` gains the `:focus-visible` house ring (A4).
- 12's `approvalNotifications` gains an optional `canSwitch` (A8); the bell passes it, and B2
  makes it required.
- e2e support: `e2e/support/auth.ts` gains `clickInMuiPopover` and the shared `settleInPage`
  (A1).
- Tooling: `vitest.config.ts` becomes `vitest.config.mts`, every comment naming it follows, and
  lint-staged's glob gains `mts` (A9).
- Unit-test support: `test/press-escape-when.ts`, the dialog tests' shared Escape helper (A3).
- Docs: `README.md` (A1, A2, A10), `AGENTS.md` (A2, A5).
- Part B (after #69): `modules/administration/overview/*` and `app/(authenticated)/admin/page*`,
  `e2e/overview.spec.ts`, and `approval-notifications.ts` with its test (B2).

## Task dependency table

Tasks run in this order; a test never imports what a later task creates. "UI" marks the tasks
whose rendered UI changes (screenshots in the PR); the rest are tests, tooling or docs.

| Task | Creates or changes                                                                                                                                   | Needs      | UI                           | Commit subject                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------- | ---------------------------------------------------------------------------- |
| A1   | `e2e/support/auth.ts`, `e2e/{context,profile,users,approvals,platform-records}.spec.ts`, README                                                      | —          | no                           | `test(e2e): pick Select options and popover links through the click helpers` |
| A2   | `e2e/click-helpers.spec.ts` (new), README, AGENTS.md                                                                                                 | A1, **Q1** | no                           | `test(e2e): check the click helpers on a static page`                        |
| A3   | `components/data-display/{confirm-dialog,reason-dialog,assignment-drawer}.tsx` (+ tests), `test/press-escape-when.ts` (new)                          | —          | no (timing only)             | `fix(kit): keep a dialog's close guard in step with its submit`              |
| A4   | `theme/create-finaxis-theme.ts` (+ render test)                                                                                                      | —          | yes (a focused alert's ring) | `fix(theme): give a focused alert the house focus ring`                      |
| A5   | `components/data-display/wizard-form.tsx` (+ test), `e2e/users-invite.spec.ts`, AGENTS.md                                                            | —          | yes (scroll padding at 200%) | `fix(wizard): grow the scroll clearance with a taller action bar`            |
| A6   | `invite-choice-field.tsx`, `invite-invitation-fields.tsx` (+ tests), `e2e/users-invite.spec.ts`                                                      | A5         | yes (Access, Invitation)     | `fix(users): say None for an unset primary branch and align the flag notes`  |
| A7   | `invite-user-wizard.test.tsx`, `e2e/users-invite.spec.ts`                                                                                            | A6         | no                           | `test(users): cover the invite wizard's reachable gaps`                      |
| A8   | `approval-notifications.ts`, `components/shell/tenant-notifications.tsx` (+ tests)                                                                   | —          | yes (the bell, one branch)   | `fix(approvals): tell a one-branch account who activates branches`           |
| A9   | `vitest.config.ts` → `.mts`, `user-menu.test.tsx`, `workspace-drawer.test.tsx`, 12 test comments, `package.json` (lint-staged)                       | —          | no                           | `chore(test): load the Vitest config as ESM and keep jsdom from navigating`  |
| A10  | `README.md`                                                                                                                                          | A1         | no                           | `docs: correct the hooks and say how to run the e2e as CI does`              |
| B1   | `readiness-rules.ts`, `pending-approvals-card.tsx`, `e2e/overview.spec.ts`                                                                           | #69 merged | yes (Readiness, Approvals)   | `fix(overview): reword the readiness note and space the approvals summary`   |
| B2   | `overview-rules.ts`, `pending-approvals-card.tsx`, `app/(authenticated)/admin/page.tsx`, `readiness-rules.ts`, `approval-notifications.ts` (+ tests) | B1, A8     | yes (Approvals, one branch)  | `fix(overview): tell a one-branch account who activates branches`            |

All module paths are under `modules/administration/` unless they start with `components/`,
`theme/`, `e2e/`, `app/`, `test/` or name a document. 10 commits in Part A (9 without A2) and 2
in Part B: 12 tasks, 11 without the self-test.

---

# Part A: on `main`

### Task A1: Select options and popover links through the click helpers

The context switch dialog's Organisation and Branch selects and the Assign-role drawer's Role and
Branch selects are MUI Selects: their menus grow in, the race layer 11 fixed with
`clickMuiOption` (it waits for the menu's running animations to finish, clicks, then waits for the
menu to close, failing by name if the click was lost). These eight clicks still bypass it. The
app switcher and the bell are MUI Popovers, which grow in with the same `Grow`: `clickMuiOption`'s
wait moves into a named in-page function, `settleInPage`, shared with a new `clickInMuiPopover`
that waits the same way and clicks; a Popover's click has no listbox to close, so the caller
asserts the outcome (a URL, a toast). `clickMuiOption`'s messages and behaviour are unchanged: for
an option, the nearest `listbox` is still the popup it names.

**Files:** Modify `e2e/support/auth.ts`, `e2e/context.spec.ts`, `e2e/profile.spec.ts`,
`e2e/users.spec.ts`, `e2e/approvals.spec.ts`, `e2e/platform-records.spec.ts`, `README.md`.

- [ ] **Step 1: Change** the helper, the eight option clicks, the four popover clicks and the
      README sentence.

<!-- apply: A1 change -->

In `README.md`, replace:

```text
  menu once the menu has finished growing in, then waits for it to close.
```

with:

```text
  menu once the menu has finished growing in, then waits for it to close; `clickInMuiPopover`
  clicks inside a MUI popover (the bell, the app switcher) once it has finished growing in.
```

In `e2e/approvals.spec.ts`, replace:

```text
import { authenticate, expectHydrated } from './support/auth';
```

with:

```text
import { authenticate, clickInMuiPopover, expectHydrated } from './support/auth';
```

In `e2e/approvals.spec.ts`, replace:

```text
    await dialog.getByRole('link', { name: 'Review branch activation' }).click();
    await expect(page).toHaveURL(/\/admin\/approvals\/branches$/, { timeout: 15000 });

    await press(await bell(page, 'Notifications: 11 approvals waiting'));
    await page
      .getByRole('dialog', { name: 'Notifications' })
      .getByRole('link', { name: 'Review user onboarding' })
      .click();
```

with:

```text
    await clickInMuiPopover(dialog.getByRole('link', { name: 'Review branch activation' }));
    await expect(page).toHaveURL(/\/admin\/approvals\/branches$/, { timeout: 15000 });

    await press(await bell(page, 'Notifications: 11 approvals waiting'));
    await clickInMuiPopover(
      page
        .getByRole('dialog', { name: 'Notifications' })
        .getByRole('link', { name: 'Review user onboarding' }),
    );
```

In `e2e/context.spec.ts`, replace:

```text
import { authenticate, expectHydrated, selectMuiOption } from './support/auth';
```

with:

```text
import {
  authenticate,
  clickInMuiPopover,
  clickMuiOption,
  expectHydrated,
  selectMuiOption,
} from './support/auth';
```

In `e2e/context.spec.ts`, replace:

```text
    await page.getByRole('option', { name: /Greenfield/ }).click();
    await dialog.getByRole('combobox', { name: 'Branch' }).click();
    await page.getByRole('option', { name: /Westlands/ }).click();
```

with:

```text
    await clickMuiOption(page.getByRole('option', { name: /Greenfield/ }));
    await dialog.getByRole('combobox', { name: 'Branch' }).click();
    await clickMuiOption(page.getByRole('option', { name: /Westlands/ }));
```

In `e2e/context.spec.ts`, replace:

```text
    await page.getByRole('option', { name: /Greenfield/ }).click();
    await dialog.getByRole('combobox', { name: 'Branch' }).click();
    await expect(page.getByRole('option', { name: /Westlands/ })).toBeVisible();
    await page.getByRole('option', { name: /Westlands/ }).click();
```

with:

```text
    await clickMuiOption(page.getByRole('option', { name: /Greenfield/ }));
    await dialog.getByRole('combobox', { name: 'Branch' }).click();
    await expect(page.getByRole('option', { name: /Westlands/ })).toBeVisible();
    await clickMuiOption(page.getByRole('option', { name: /Westlands/ }));
```

In `e2e/context.spec.ts`, replace:

```text
    await page.getByRole('button', { name: /Platform administration/ }).click();
```

with:

```text
    await clickInMuiPopover(page.getByRole('button', { name: /Platform administration/ }));
```

In `e2e/platform-records.spec.ts`, replace:

```text
import { authenticate, expectHydrated, selectMuiOption } from './support/auth';
```

with:

```text
import { authenticate, clickInMuiPopover, expectHydrated, selectMuiOption } from './support/auth';
```

In `e2e/platform-records.spec.ts`, replace:

```text
    await dialog.getByRole('link', { name: 'Review pending institutions' }).click();
```

with:

```text
    await clickInMuiPopover(dialog.getByRole('link', { name: 'Review pending institutions' }));
```

In `e2e/profile.spec.ts`, replace:

```text
import { addCookie, authenticate, CONTEXT_COOKIE_NAME, selectMuiOption } from './support/auth';
```

with:

```text
import {
  addCookie,
  authenticate,
  clickMuiOption,
  CONTEXT_COOKIE_NAME,
  selectMuiOption,
} from './support/auth';
```

In `e2e/profile.spec.ts`, replace:

```text
    await page.getByRole('option', { name: /Greenfield/ }).click();
    await dialog.getByRole('combobox', { name: 'Branch' }).click();
    await page.getByRole('option', { name: /Westlands/ }).click();
```

with:

```text
    await clickMuiOption(page.getByRole('option', { name: /Greenfield/ }));
    await dialog.getByRole('combobox', { name: 'Branch' }).click();
    await clickMuiOption(page.getByRole('option', { name: /Westlands/ }));
```

In `e2e/support/auth.ts`, replace:

```text
/** How long an open menu may keep animating before a click on one of its options is refused. */
const MENU_SETTLE_LIMIT_MS = 5000;
```

with:

```text
/** How long an open menu or popover may keep animating before a click inside it is refused. */
const MENU_SETTLE_LIMIT_MS = 5000;

/**
 * In the page, before a click inside an open MUI menu or popover: waits until the running
 * animations on `item` and its ancestors finish (an endless animation on the popup or an ancestor,
 * such as a spinner's, is not waited on), at most `limitMs`. Returns the popup's name (a listbox's
 * label, or a popover dialog's title) and the item's text, for messages. Passed to `evaluate`, so
 * it uses nothing from this module.
 */
async function settleInPage(item: Element, { limitMs, kind }: { limitMs: number; kind: string }) {
  const popup = item.closest('[role="listbox"], [role="dialog"]');
  const labelId = popup?.getAttribute('aria-labelledby') ?? '';
  const menu = document.getElementById(labelId)?.textContent.trim() ?? kind;
  const name = item.textContent.trim();
  const moving: Animation[] = [];
  for (let node: Element | null = item; node; node = node.parentElement) {
    for (const animation of node.getAnimations()) {
      const end = animation.effect?.getComputedTiming().endTime;
      if (animation.playState === 'running' && typeof end === 'number' && Number.isFinite(end)) {
        moving.push(animation);
      }
    }
  }
  let timer: number | undefined;
  const stuck = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(
        new Error(
          `The "${menu}" ${kind} was still animating ${limitMs / 1000} s after it opened, so the click on "${name}" was not sent.`,
        ),
      );
    }, limitMs);
  });
  try {
    await Promise.race([Promise.allSettled(moving.map((a) => a.finished)), stuck]);
  } finally {
    window.clearTimeout(timer);
  }
  return { menu, name };
}
```

In `e2e/support/auth.ts`, replace:

```text
  const { menu, name } = await option.evaluate(async (item, limitMs) => {
    const labelId = item.closest('[role="listbox"]')?.getAttribute('aria-labelledby') ?? '';
    const menu = document.getElementById(labelId)?.textContent.trim() ?? 'menu';
    const name = item.textContent.trim();
    const moving: Animation[] = [];
    for (let node: Element | null = item; node; node = node.parentElement) {
      for (const animation of node.getAnimations()) {
        const end = animation.effect?.getComputedTiming().endTime;
        if (animation.playState === 'running' && typeof end === 'number' && Number.isFinite(end)) {
          moving.push(animation);
        }
      }
    }
    let timer: number | undefined;
    const stuck = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => {
        reject(
          new Error(
            `The "${menu}" menu was still animating ${limitMs / 1000} s after it opened, so the click on "${name}" was not sent.`,
          ),
        );
      }, limitMs);
    });
    try {
      await Promise.race([Promise.allSettled(moving.map((a) => a.finished)), stuck]);
    } finally {
      window.clearTimeout(timer);
    }
    return { menu, name };
  }, MENU_SETTLE_LIMIT_MS);
  await option.click();
  await expect(
    option.page().getByRole('listbox'),
    `The "${menu}" menu stayed open after the click on "${name}", so nothing was chosen.`,
  ).toHaveCount(0);
```

with:

```text
  const { menu, name } = await option.evaluate(settleInPage, {
    limitMs: MENU_SETTLE_LIMIT_MS,
    kind: 'menu',
  });
  await option.click();
  await expect(
    option.page().getByRole('listbox'),
    `The "${menu}" menu stayed open after the click on "${name}", so nothing was chosen.`,
  ).toHaveCount(0);
}

/**
 * Clicks `target` inside an open MUI popover (the bell's Notifications, the app switcher) once the
 * popover has stopped growing in. A Popover grows in as a Select's menu does, so a click on a
 * moving link or button can be lost the same way (see clickMuiOption). The caller asserts what the
 * click does: a popover isn't a listbox, so there is no choice to check here.
 */
export async function clickInMuiPopover(target: Locator): Promise<void> {
  await target.evaluate(settleInPage, { limitMs: MENU_SETTLE_LIMIT_MS, kind: 'popover' });
  await target.click();
```

In `e2e/users.spec.ts`, replace:

```text
import { authenticate, expectHydrated, selectMuiOption } from './support/auth';
```

with:

```text
import { authenticate, clickMuiOption, expectHydrated, selectMuiOption } from './support/auth';
```

In `e2e/users.spec.ts`, replace:

```text
    await page.getByRole('option', { name: 'Branch supervisor (SUPERVISOR)' }).click();
    await selectMuiOption(page, 'Scope', /^One branch$/);
    // Felix holds Westlands only, so it is the one branch on offer.
    await page.getByRole('combobox', { name: 'Branch' }).click();
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option')).toHaveText('Westlands Branch (WESTLANDS)');
    await page.getByRole('option', { name: 'Westlands Branch (WESTLANDS)' }).click();
```

with:

```text
    await clickMuiOption(page.getByRole('option', { name: 'Branch supervisor (SUPERVISOR)' }));
    await selectMuiOption(page, 'Scope', /^One branch$/);
    // Felix holds Westlands only, so it is the one branch on offer.
    await page.getByRole('combobox', { name: 'Branch' }).click();
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option')).toHaveText('Westlands Branch (WESTLANDS)');
    await clickMuiOption(page.getByRole('option', { name: 'Westlands Branch (WESTLANDS)' }));
```

<!-- end apply -->

- [ ] **Step 2: Run** — form E: `e2e/context.spec.ts e2e/profile.spec.ts` (11 + 15 passed, about
      3 min), `e2e/users.spec.ts` (42 passed, about 7 min, its own chunk), `e2e/approvals.spec.ts`
      (63, about 6 min, its own chunk), `e2e/platform-records.spec.ts` (54, about 5 min) and the
      invite wizard's behaviour chunk, whose `choose()` goes through `clickMuiOption`:
      `e2e/users-invite.spec.ts --grep "users invite: (entry|sending)"`. Every spec that selects a
      context uses the refactored `clickMuiOption` (`selectMuiOption`), so the gate's full run
      covers the rest. There is no RED run: the helper and the race are layer 11's, whose PR
      records their evidence; this task claims no new race fix. Mutation proof: only A2's
      self-test kills a `clickInMuiPopover` that skips the wait (its last test); without A2
      nothing in the repo does, as layer 11 found for the close-wait.

- [ ] **Step 3: Commit** (form C):

```text
test(e2e): pick Select options and popover links through the click helpers

The context switch dialog's Organisation and Branch selects and the Assign-role drawer's Role and
Branch selects grow their menus in like every MUI Select, so a click can land while an option
still moves and be lost; their eight option clicks now go through clickMuiOption, which waits for
the menu to stop moving, clicks, and fails by name if the menu stays open. The app switcher and
the notifications bell open MUI Popovers, which grow in the same way: clickMuiOption's bounded
wait becomes settleInPage, shared with a new clickInMuiPopover that waits and clicks, used by the
app switcher's Platform administration and the bell's three links in the approvals and platform
records specs. clickMuiOption keeps its messages and its close-wait.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

### Task A2: The click helpers' self-test (only on Q1 = yes)

**Skip this task, and its README and AGENTS.md lines, unless the maintainer answers Q1 yes.** A
spec on a static page (`page.setContent`): no sign-in, no fake API. Each case builds the condition
a helper guards against, because a real MUI menu can't be made to lose a click on demand: a popup
still animating (an opacity animation, which Playwright's own stability check ignores), a click
that leaves the menu open, an animation that outlives the 5 s bound, an endless one.

**Files:** Create `e2e/click-helpers.spec.ts`; modify `README.md`, `AGENTS.md`.

- [ ] **Step 1: Create the spec and say so in the docs.**

<!-- apply: A2 change -->

In `AGENTS.md`, replace:

```text
  uses, mirroring the contract document exactly (including backend quirks).
```

with:

```text
  uses, mirroring the contract document exactly (including backend quirks). The one spec without
  the app or the fake API is `e2e/click-helpers.spec.ts`: it checks the e2e click helpers on a
  static page (`page.setContent`), and helper self-tests like it belong there, not in app specs.
```

In `README.md`, replace:

```text
  `e2e/support/auth.ts`, which gives each test its own scenario-seeded fake backend; unauthenticated and fake-API smoke specs don't.
  The fake mirrors the real API's wire behaviour (snake_case, problem+json, context tokens, permissions — see
```

with:

```text
  `e2e/support/auth.ts`, which gives each test its own scenario-seeded fake backend; unauthenticated and fake-API smoke specs don't.
  `e2e/click-helpers.spec.ts` alone needs neither the app nor the fake API: it checks the click
  helpers on a static page (`page.setContent`).
  The fake mirrors the real API's wire behaviour (snake_case, problem+json, context tokens, permissions — see
```

Create `e2e/click-helpers.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { clickInMuiPopover, clickMuiOption } from './support/auth';

// The click helpers' own checks (e2e/support/auth.ts), on a static page: no sign-in and no fake
// API, the one spec without them (AGENTS.md). A real MUI menu can't be made to lose a click on
// demand, so each case builds the condition a helper guards against: a popup that is still
// animating, or a click that leaves its menu open.

/** A popup (`role`) named "Role" holding one item, "Teller". `animation` runs on the popup when it
 * opens (as MUI's Grow does); a click on the item records whether the popup was still animating,
 * then closes it unless `keepOpen`. */
async function showPopup(
  page: Page,
  options: {
    role: 'listbox' | 'dialog';
    animation?: { duration: number; iterations: number };
    keepOpen?: boolean;
  },
) {
  const item =
    options.role === 'listbox'
      ? '<li role="option" aria-selected="false">Teller</li>'
      : '<button type="button">Teller</button>';
  const tag = options.role === 'listbox' ? 'ul' : 'div';
  await page.setContent(
    `<span id="label">Role</span><${tag} id="popup" role="${options.role}" aria-labelledby="label">${item}</${tag}>`,
  );
  await page.evaluate(({ animation, keepOpen }) => {
    const popup = document.getElementById('popup');
    if (!popup) throw new Error('no popup');
    if (animation) {
      // Opacity only: the box never moves, so Playwright's own stability check doesn't wait.
      popup.animate([{ opacity: 0 }, { opacity: 1 }], animation);
    }
    popup.firstElementChild?.addEventListener('click', () => {
      document.body.dataset.clickedWhileAnimating = String(
        popup.getAnimations().some((running) => running.playState === 'running'),
      );
      if (!keepOpen) popup.remove();
    });
  }, options);
}

const clickedWhileAnimating = (page: Page) =>
  page.evaluate(() => document.body.dataset.clickedWhileAnimating);

test.describe('e2e click helpers', () => {
  test('clickMuiOption clicks an option only once its menu has finished animating', async ({
    page,
  }) => {
    await showPopup(page, { role: 'listbox', animation: { duration: 1000, iterations: 1 } });
    await clickMuiOption(page.getByRole('option', { name: 'Teller' }));
    expect(await clickedWhileAnimating(page)).toBe('false');
  });

  test('clickMuiOption fails, naming the menu and the option, when the click leaves the menu open', async ({
    page,
  }) => {
    await showPopup(page, { role: 'listbox', keepOpen: true });
    await expect(clickMuiOption(page.getByRole('option', { name: 'Teller' }))).rejects.toThrow(
      'The "Role" menu stayed open after the click on "Teller", so nothing was chosen.',
    );
  });

  test('clickMuiOption refuses to click a menu still animating after its bound', async ({
    page,
  }) => {
    await showPopup(page, { role: 'listbox', animation: { duration: 60000, iterations: 1 } });
    await expect(clickMuiOption(page.getByRole('option', { name: 'Teller' }))).rejects.toThrow(
      'The "Role" menu was still animating 5 s after it opened, so the click on "Teller" was not sent.',
    );
    expect(await clickedWhileAnimating(page)).toBeUndefined();
  });

  test('clickMuiOption does not wait on an endless animation', async ({ page }) => {
    await showPopup(page, {
      role: 'listbox',
      animation: { duration: 1000, iterations: Infinity },
    });
    const started = Date.now();
    await clickMuiOption(page.getByRole('option', { name: 'Teller' }));
    expect(Date.now() - started).toBeLessThan(4000);
    expect(await clickedWhileAnimating(page)).toBe('true');
  });

  test('clickInMuiPopover clicks inside a popover only once it has finished animating', async ({
    page,
  }) => {
    await showPopup(page, { role: 'dialog', animation: { duration: 1000, iterations: 1 } });
    await clickInMuiPopover(page.getByRole('button', { name: 'Teller' }));
    expect(await clickedWhileAnimating(page)).toBe('false');
  });
});
```

<!-- end apply -->

- [ ] **Step 2: Run** — form E: `e2e/click-helpers.spec.ts`: 5 passed (about 13 s after the web
      servers start). Mutation proofs, run together in one copy of `e2e/support/auth.ts`, then
      reverted: (a) `clickMuiOption` without `settleInPage` (click at once): fails "clickMuiOption
      clicks an option only once its menu has finished animating" (`'true'` against `'false'`)
      and "refuses to click a menu still animating after its bound"; (b) without the close-wait:
      fails "fails, naming the menu and the option, when the click leaves the menu open"; (c)
      `clickInMuiPopover` without the wait: fails "clicks inside a popover only once it has
      finished animating". "does not wait on an endless animation" passes under all three.

- [ ] **Step 3: Commit** (form C):

```text
test(e2e): check the click helpers on a static page

clickMuiOption and clickInMuiPopover guard against a click that lands while a popup still grows
in and against a lost choice, but no spec could make either happen on demand, so no test failed
when a wait was removed. A static page now builds each condition: a popup still animating, a
click that leaves the menu open, an animation past the 5 s bound and an endless one. It is the one
spec without the app or the fake API, as AGENTS.md and the README now say.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

### Task A3: A dialog's close guard follows its submit (the settings flake)

`ConfirmDialog`, `ReasonDialog` and `AssignmentDrawer` ignore Escape and the backdrop while a
submit is pending, so the request keeps its idempotency key. The form reported `pending` to the
dialog from a passive effect, so the dialog's guard followed it a render late at both edges: an
Escape pressed as a submit started could close the dialog mid-request, and one pressed as the
failure's alert appeared was dropped (Pre-flight 1; the second is the likely cause of layer 12's
settings flake, latent on `main`). A layout effect reports it in the same commit. Each new test
presses Escape in the microtask after the DOM change it waits for (Cancel disabled; the alert
inserted), before React runs that render's passive effects, as a person does the moment the
change shows. The shared `test/press-escape-when.ts` presses it, and each test disposes of its
observer in a `finally`, so a regression that never makes the change can't leave the observer
pressing Escape in a later test.

**Files:** Create `test/press-escape-when.ts`; modify `components/data-display/confirm-dialog.tsx`,
`reason-dialog.tsx`, `assignment-drawer.tsx` and their tests.

- [ ] **Step 1: Write the failing tests** and the shared helper.

<!-- apply: A3 test -->

In `components/data-display/assignment-drawer.test.tsx`, replace:

```text
import { fireEvent, screen, waitFor } from '@testing-library/react';
```

with:

```text
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { clickOutsideAct, pressEscapeWhen } from '@/test/press-escape-when';
```

In `components/data-display/assignment-drawer.test.tsx`, replace:

```text

  // Last: its action never settles, so it leaves a permanently pending promise behind — harmless
```

with:

```text

  it('closes on Escape as soon as a failed submit shows its alert', async () => {
    const user = userEvent.setup({ delay: null });
    let settle: (result: ActionResult) => void = () => undefined;
    const action = vi.fn(
      (_previous: ActionResult | null, _formData: FormData) =>
        new Promise<ActionResult>((resolve) => {
          settle = resolve;
        }),
    );
    const { props } = setup(action);
    await user.click(screen.getByRole('button', { name: 'Assign user' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });

    // The guard that ignores Escape while pending must already know the submit settled when the
    // failure first shows.
    const escape = pressEscapeWhen(() => document.querySelector('[role="alert"]'));
    try {
      settle(INVALID);
      await waitFor(() => {
        expect(escape.pressed()).toBe(true);
      });
    } finally {
      escape.dispose();
    }
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape from the moment a submit starts', async () => {
    let settle: (result: ActionResult) => void = () => undefined;
    const action = vi.fn(
      (_previous: ActionResult | null, _formData: FormData) =>
        new Promise<ActionResult>((resolve) => {
          settle = resolve;
        }),
    );
    const { props } = setup(action);
    const cancel = screen.getByRole('button', { name: 'Cancel' });

    // The guard must hold from the render that starts the submit: an Escape then would close the
    // drawer mid-request and drop its idempotency key.
    const escape = pressEscapeWhen(() => (cancel.hasAttribute('disabled') ? cancel : null));
    try {
      clickOutsideAct(screen.getByRole('button', { name: 'Assign user' }));
      await waitFor(() => {
        expect(escape.pressed()).toBe(true);
      });
    } finally {
      escape.dispose();
    }
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => {
      settle(INVALID);
      await Promise.resolve();
    });
  });

  // Last: its action never settles, so it leaves a permanently pending promise behind — harmless
```

In `components/data-display/confirm-dialog.test.tsx`, replace:

```text
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
```

with:

```text
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { clickOutsideAct, pressEscapeWhen } from '@/test/press-escape-when';
import { renderWithProviders } from '@/test/test-utils';
```

In `components/data-display/confirm-dialog.test.tsx`, replace:

```text

  // Last: its action never settles, so it leaves a permanently pending promise behind — harmless
```

with:

```text

  it('closes on Escape as soon as a failed submit shows its alert', async () => {
    const user = userEvent.setup({ delay: null });
    let settle: (result: FullResult) => void = () => undefined;
    const action = vi.fn(
      (_previous: FullResult | null, _formData: FormData) =>
        new Promise<FullResult>((resolve) => {
          settle = resolve;
        }),
    );
    const { props } = setup(action);
    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });

    // The guard that ignores Escape while pending must already know the submit settled when the
    // failure first shows (the settings flake: an Escape dropped, the dialog left open).
    const escape = pressEscapeWhen(() => document.querySelector('[role="alert"]'));
    try {
      settle(CHANGED);
      await waitFor(() => {
        expect(escape.pressed()).toBe(true);
      });
    } finally {
      escape.dispose();
    }
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape from the moment a submit starts', async () => {
    let settle: (result: FullResult) => void = () => undefined;
    const action = vi.fn(
      (_previous: FullResult | null, _formData: FormData) =>
        new Promise<FullResult>((resolve) => {
          settle = resolve;
        }),
    );
    const { props } = setup(action);
    const cancel = screen.getByRole('button', { name: 'Cancel' });

    // The guard must hold from the render that starts the submit: an Escape then would close the
    // dialog mid-request and drop its idempotency key.
    const escape = pressEscapeWhen(() => (cancel.hasAttribute('disabled') ? cancel : null));
    try {
      clickOutsideAct(screen.getByRole('button', { name: 'Submit for approval' }));
      await waitFor(() => {
        expect(escape.pressed()).toBe(true);
      });
    } finally {
      escape.dispose();
    }
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => {
      settle(CHANGED);
      await Promise.resolve();
    });
  });

  // Last: its action never settles, so it leaves a permanently pending promise behind — harmless
```

In `components/data-display/reason-dialog.test.tsx`, replace:

```text
import { fireEvent, screen, waitFor } from '@testing-library/react';
import TextField from '@mui/material/TextField';
```

with:

```text
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import TextField from '@mui/material/TextField';
import { clickOutsideAct, pressEscapeWhen } from '@/test/press-escape-when';
```

In `components/data-display/reason-dialog.test.tsx`, replace:

```text

  // Last: its action never settles, so it leaves a permanently pending promise behind — harmless
```

with:

```text

  it('closes on Escape as soon as a failed submit shows its alert', async () => {
    const user = userEvent.setup({ delay: null });
    let settle: (result: ActionResult) => void = () => undefined;
    const action = vi.fn(
      (_previous: ActionResult | null, _formData: FormData) =>
        new Promise<ActionResult>((resolve) => {
          settle = resolve;
        }),
    );
    const { props } = setup(action);
    await user.click(screen.getByRole('button', { name: 'Start close of business' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });

    // The guard that ignores Escape while pending must already know the submit settled when the
    // failure first shows (the settings flake: an Escape dropped, the dialog left open).
    const escape = pressEscapeWhen(() => document.querySelector('[role="alert"]'));
    try {
      settle(BUSY);
      await waitFor(() => {
        expect(escape.pressed()).toBe(true);
      });
    } finally {
      escape.dispose();
    }
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape from the moment a submit starts', async () => {
    let settle: (result: ActionResult) => void = () => undefined;
    const action = vi.fn(
      (_previous: ActionResult | null, _formData: FormData) =>
        new Promise<ActionResult>((resolve) => {
          settle = resolve;
        }),
    );
    const { props } = setup(action);
    const cancel = screen.getByRole('button', { name: 'Cancel' });

    // The guard must hold from the render that starts the submit: an Escape then would close the
    // dialog mid-request and drop its idempotency key.
    const escape = pressEscapeWhen(() => (cancel.hasAttribute('disabled') ? cancel : null));
    try {
      clickOutsideAct(screen.getByRole('button', { name: 'Start close of business' }));
      await waitFor(() => {
        expect(escape.pressed()).toBe(true);
      });
    } finally {
      escape.dispose();
    }
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => {
      settle(BUSY);
      await Promise.resolve();
    });
  });

  // Last: its action never settles, so it leaves a permanently pending promise behind — harmless
```

Create `test/press-escape-when.ts`:

```ts
import { fireEvent } from '@testing-library/react';

type ActGlobal = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

/**
 * Presses Escape on the element `target` returns, in the microtask after a DOM change first makes
 * it return one: the same task as the render that made the change, before React runs that
 * render's passive effects, as a person pressing Escape the moment the change shows. Run what
 * causes the change outside act() (`clickOutsideAct`, or a promise settled before `waitFor`), so
 * React schedules its work as a browser does. Call `dispose` in a `finally`: a regression that
 * never makes the change must not leave the observer pressing Escape in a later test.
 */
export function pressEscapeWhen(target: () => Element | null) {
  let pressed = false;
  const observer = new MutationObserver(() => {
    const element = target();
    if (!element) return;
    observer.disconnect();
    pressed = true;
    fireEvent.keyDown(element, { key: 'Escape' });
  });
  observer.observe(document.body, { attributes: true, childList: true, subtree: true });
  return {
    pressed: () => pressed,
    dispose: () => {
      observer.disconnect();
    },
  };
}

/**
 * A native click outside act(): React then schedules what the click starts as a browser does,
 * where act() would flush every render and effect before the next microtask. Follow it at once
 * with `waitFor`, which keeps act() off while React works.
 */
export function clickOutsideAct(element: HTMLElement) {
  const actGlobal = globalThis as ActGlobal;
  const previous = actGlobal.IS_REACT_ACT_ENVIRONMENT;
  actGlobal.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    element.click();
  } finally {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}
```

<!-- end apply -->

- [ ] **Step 2: Run** — form U on the three test files: FAIL, 6 failed and 31 passed. Each
      "closes on Escape as soon as a failed submit shows its alert" fails with
      `AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times`, and each
      "ignores Escape from the moment a submit starts" with
      `AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times`.

- [ ] **Step 3: Implement.**

<!-- apply: A3 impl -->

In `components/data-display/assignment-drawer.tsx`, replace:

```text
  useEffect,
  useId,
```

with:

```text
  useId,
  useLayoutEffect,
```

In `components/data-display/assignment-drawer.tsx`, replace:

```text
  // would be held back with the transition until the action settles. Each mount reports `false`,
  // so a reopened drawer can always be closed again.
  useEffect(() => {
```

with:

```text
  // would be held back with the transition until the action settles. A layout effect, so the
  // drawer's Escape and backdrop guard changes in the same commit as `pending`, at the start of a
  // submit and at its end (ConfirmDialog says why). Each mount reports `false`, so a reopened
  // drawer can always be closed again.
  useLayoutEffect(() => {
```

In `components/data-display/confirm-dialog.tsx`, replace:

```text
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from 'react';
```

with:

```text
import {
  useActionState,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
```

In `components/data-display/confirm-dialog.tsx`, replace:

```text
  // transition until the action settles. Each mount reports `false`, so a reopened dialog can
  // always be closed again.
  useEffect(() => {
```

with:

```text
  // transition until the action settles. A layout effect, so the parent's Escape and backdrop guard
  // changes in the same commit as `pending`: a passive effect left it one render behind at both
  // ends, so an Escape as a submit started could close the dialog mid-request, and one as the
  // failure appeared was dropped (the likely cause of the settings e2e flake on layer 12's tree).
  // Each mount reports `false`, so a reopened dialog can always be closed again.
  useLayoutEffect(() => {
```

In `components/data-display/reason-dialog.tsx`, replace:

```text
  useId,
  useRef,
```

with:

```text
  useId,
  useLayoutEffect,
  useRef,
```

In `components/data-display/reason-dialog.tsx`, replace:

```text
  );
  useEffect(() => {
    onPendingChange(pending);
```

with:

```text
  );
  // A layout effect, so the parent's Escape and backdrop guard changes in the same commit as
  // `pending`, at the start of a submit and at its end (ConfirmDialog says why).
  useLayoutEffect(() => {
    onPendingChange(pending);
```

<!-- end apply -->

- [ ] **Step 4: Run** — form U: PASS (37), with no warning. Mutation proof: restore `useEffect` in
      one component at a time; only that component's two new tests fail. Then form E:
      `e2e/settings.spec.ts` (10 passed, 1 skipped by BG-04); the formerly flaky test, at the four
      workers where it showed (20 passed):
      `e2e/settings.spec.ts --grep "frozen base currency" --repeat-each=20 --workers=4`; and
      `e2e/business-date.spec.ts e2e/branches.spec.ts` (27 passed), which drive the three dialogs.

- [ ] **Step 5: Commit** (form C):

```text
fix(kit): keep a dialog's close guard in step with its submit

ConfirmDialog, ReasonDialog and AssignmentDrawer ignore Escape and the backdrop while a submit is
pending, so a slow request keeps its idempotency key. The form told the dialog about pending from
a passive effect, so the guard followed it one render late at both edges: an Escape pressed as a
submit started could close the dialog mid-request, and one pressed as the failure's alert
appeared was dropped. The second is the likely cause of the settings e2e failure seen on layer
12's tree (Next 16.3.8). It no longer reproduces on main, where Next's action path re-renders the
parent sooner, but the window was still in the kit. The form now reports pending from a layout
effect, so the guard follows it in the same commit, at the start of a submit and at its end.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

### Task A4: The house focus ring on a focused Alert

Five Alerts take focus when nothing else can carry a failure (`tabIndex={-1}`): the invite and
tenant wizards' failure and check alerts and the context selection's errors. An Alert isn't a
ButtonBase, so it showed Chrome's 1 px `auto` outline. The theme spreads the same resolved
`theme.focusVisible` under `&:focus-visible`, as it does for Typography, TablePagination's select
and TableContainer. An Alert that never takes focus never matches.

**Files:** Modify `theme/create-finaxis-theme.ts`, `theme/create-finaxis-theme.render.test.tsx`.

- [ ] **Step 1: Write the failing test.**

<!-- apply: A4 test -->

In `theme/create-finaxis-theme.render.test.tsx`, replace:

```text
import { describe, expect, it, vi } from 'vitest';
import Autocomplete from '@mui/material/Autocomplete';
```

with:

```text
import { describe, expect, it, vi } from 'vitest';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
```

In `theme/create-finaxis-theme.render.test.tsx`, replace:

```text

describe('Keyboard-scrollable table region focus ring (gate finding M4)', () => {
```

with:

```text

describe('Alert focus-visible ring (layer 11 gate observation 5: focused failure alerts)', () => {
  it('gives a programmatically focused alert the house ring, not the browser default', () => {
    // The wizards focus their failure Alert (`tabIndex={-1}`) when no field names the problem; an
    // Alert isn't a ButtonBase, so it needs the shared ring spread under `&:focus-visible`, as
    // Typography does above.
    const { getByRole } = renderWithProviders(
      <Alert severity="error" tabIndex={-1}>
        The invitation wasn&apos;t sent.
      </Alert>,
    );
    const hash = hashClassOf(getByRole('alert'));
    const css = allEmittedCss();

    expect(varName(effectiveDeclaration(css, hash, ':focus-visible', 'outline-color') ?? '')).toBe(
      varName(theme.vars.palette.focus),
    );
    expect(effectiveDeclaration(css, hash, ':focus-visible', 'outline-offset')).toMatch(
      /^calc\(var\(--_focusVisible-offset/,
    );
    // The theme's own shape stays.
    expect(effectiveDeclaration(css, hash, '', 'border-radius')).toBe('8px');
  });
});

describe('Keyboard-scrollable table region focus ring (gate finding M4)', () => {
```

<!-- end apply -->

- [ ] **Step 2: Run** — form U on `theme/create-finaxis-theme.render.test.tsx`: FAIL, 1 failed
      ("gives a programmatically focused alert the house ring, not the browser default":
      `Expected a var() reference, got "".`).

- [ ] **Step 3: Implement.**

<!-- apply: A4 impl -->

In `theme/create-finaxis-theme.ts`, replace:

```text
      MuiAlert: {
        styleOverrides: { root: { borderRadius: 8, alignItems: 'flex-start' } },
```

with:

```text
      // A failure Alert takes focus when nothing else names the problem (the invite and tenant
      // wizards' failure and check alerts, the context selection's errors: `tabIndex={-1}`). It
      // isn't a ButtonBase either, so it showed the browser's 1px `auto` outline: spread the same
      // resolved ring as Typography above.
      MuiAlert: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 8,
            alignItems: 'flex-start',
            '&:focus-visible': theme.focusVisible === false ? undefined : theme.focusVisible,
          }),
        },
```

<!-- end apply -->

- [ ] **Step 4: Run** — form U on `theme/`: PASS (4 files, 126 tests). The border radius stays
      8 px (the test says so). Visual check for the PR (the gate's screenshot pass), light and
      dark: the invite wizard's failed-check Alert after Continue, and the context selection's
      outlined one, where the ring sits beside a 1 px border (scenario `selection-forbidden`:
      choose the organisation, then press a key and focus the Alert).

- [ ] **Step 5: Commit** (form C):

```text
fix(theme): give a focused alert the house focus ring

The invite and tenant wizards and the context selection focus an Alert when no field can carry
the failure, and an Alert isn't a ButtonBase, so it showed the browser's 1px outline instead of
the house ring. The theme spreads the shared focusVisible ring under the Alert's :focus-visible,
as it does for a focused record title; an Alert that never takes focus is unchanged.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

### Task A5: The scroll clearance follows a taller action bar

`WizardForm` keeps 140 px of page scroll padding below while mounted, so its sticky action bar
(70 px, 114 px when its buttons wrap) never covers the control the keyboard reaches. With text at
200% (WCAG 1.4.4) the bar's two rows grow taller, to 149 px, past that. A `ResizeObserver` measures the
bar and the padding becomes `max(140, ceil(height) + 26)`: the same 140 px in every state covered
today, more only when needed. jsdom has no `ResizeObserver`, so the floor holds there, as in
`record-tabs.tsx`.

**Files:** Modify `components/data-display/wizard-form.tsx`, its test,
`e2e/users-invite.spec.ts` (a fourth keyboard case), `AGENTS.md`.

- [ ] **Step 1: Write the failing tests** — a unit test that reports the bar's size through a fake
      `ResizeObserver`, and the keyboard walk at 375 px with text at 200%, which first asserts
      the mechanism: once the Access step's rows are added, the page's scroll padding is more
      than 140 px and at least the bar's height plus 26 px.

<!-- apply: A5 test -->

In `components/data-display/wizard-form.test.tsx`, replace:

```text
import { screen, within } from '@testing-library/react';
```

with:

```text
import { act, screen, within } from '@testing-library/react';
```

In `components/data-display/wizard-form.test.tsx`, replace:

```text
  });
});
```

with:

```text
  });

  it('grows the scroll padding with a bar taller than its two rows, never below 140 px', () => {
    // jsdom has no ResizeObserver: a fake keeps each instance, so the test can report the bar's
    // size as a browser would. Only this component observes anything here.
    const instances: { callback: () => void; target: Element | null }[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        callback: () => void;
        target: Element | null = null;
        constructor(callback: () => void) {
          this.callback = callback;
          instances.push(this);
        }
        observe(target: Element) {
          this.target = target;
        }
        disconnect() {
          this.target = null;
        }
      },
    );
    try {
      renderWithProviders(wizard(0));
      const continueButton = screen.getByRole('button', { name: 'Continue' });
      const observer = instances.find((instance) => instance.target?.contains(continueButton));
      if (!observer?.target) throw new Error('the action bar is not observed');
      const bar = observer.target;
      const resize = (height: number) => {
        vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ height } as DOMRect);
        act(() => {
          observer.callback();
        });
      };
      const padding = () => getComputedStyle(document.documentElement).scrollPaddingBottom;

      // One row (70 px) or two (114 px): the 140 px floor.
      resize(70);
      expect(padding()).toBe('140px');
      resize(114);
      expect(padding()).toBe('140px');
      // Larger text makes the bar's two rows taller: its height plus the 26 px gap.
      resize(158.4);
      expect(padding()).toBe('185px');
      resize(70);
      expect(padding()).toBe('140px');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
```

In `e2e/users-invite.spec.ts`, replace:

```text
  for (const viewport of [
    { label: 'desktop', width: 1440, height: 900 },
    { label: '375px', width: 375, height: 812 },
    { label: '360px', width: 360, height: 740 },
```

with:

```text
  // With text at 200% (WCAG 1.4.4) the bar's two rows grow taller (149 px), past the 140 px floor: the
  // page's clearance follows the bar's measured height.
  for (const viewport of [
    { label: 'desktop', width: 1440, height: 900, text: null },
    { label: '375px', width: 375, height: 812, text: null },
    { label: '360px', width: 360, height: 740, text: null },
    { label: '375px, text at 200%', width: 375, height: 812, text: '200%' },
```

In `e2e/users-invite.spec.ts`, replace:

```text
      await fillIdentity(page);
      await next(page, 'Access', FIRST_HIT);
      for (const add of ['Add branch', 'Add branch', 'Add role', 'Add role']) {
        await page.getByRole('button', { name: add }).click();
```

with:

```text
      if (viewport.text) {
        // A browser's larger text setting: the theme's type scale is in rem, so the root size
        // scales every label and button.
        await page.addStyleTag({ content: `html { font-size: ${viewport.text}; }` });
      }
      await fillIdentity(page);
      await next(page, 'Access', FIRST_HIT);
      for (const add of ['Add branch', 'Add branch', 'Add role', 'Add role']) {
        await page.getByRole('button', { name: add }).click();
      }
      if (viewport.text) {
        // The mechanism, not only its effect (the walk alone fails by a fraction of a pixel without
        // it): the bar wraps past its two rows, and the page's clearance follows its height.
        const bar = await boxOf(page.getByRole('button', { name: 'Continue' }).locator('..'));
        const padding = () =>
          page.evaluate(() =>
            parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom),
          );
        await expect.poll(padding).toBeGreaterThan(140);
        expect(await padding()).toBeGreaterThanOrEqual(bar.height + 26);
```

<!-- end apply -->

- [ ] **Step 2: Run** — form U on `components/data-display/wizard-form.test.tsx`: FAIL, 1 failed
      ("the action bar is not observed"). Form E:
      `e2e/users-invite.spec.ts --grep "text at 200%"`: FAIL at the mechanism,
      `expect.poll(padding).toBeGreaterThan(140)` with `Received: 140`. Without that assertion
      the walk alone fails by only 0.16 px, on the Access step, too fine a margin to pin the fix
      on its own: `Tab stop "…" is under the action bar`.

- [ ] **Step 3: Implement**, and say it in AGENTS.md.

<!-- apply: A5 impl -->

In `AGENTS.md`, replace:

```text
  pointer); a choice validates its own field. While mounted, `WizardForm` keeps 140 px of page
  scroll padding below (its action bar wraps to two rows, 114 px, on a narrow viewport), and
```

with:

```text
  pointer); a choice validates its own field. While mounted, `WizardForm` keeps at least 140 px
  of page scroll padding below (its action bar wraps to two rows, 114 px, on a narrow viewport),
  and the bar's measured height plus 26 px when that is more (larger text, zoom), and
```

In `components/data-display/wizard-form.tsx`, replace:

```text
import { useEffect, useRef, type ReactNode, type SyntheticEvent } from 'react';
```

with:

```text
import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
```

In `components/data-display/wizard-form.tsx`, replace:

```text
 * narrow viewport (at 360 px "Send invitation" drops below Cancel and Back). 114 px plus a 26 px gap. */
const ACTION_BAR_CLEARANCE = 140;
```

with:

```text
 * narrow viewport (at 360 px "Send invitation" drops below Cancel and Back). 114 px plus a 26 px gap
 * is the least the page keeps; a taller bar (larger text, zoom, a longer label) gets its own height
 * plus the gap, measured. */
const ACTION_BAR_CLEARANCE = 140;
const ACTION_BAR_GAP = 26;
```

In `components/data-display/wizard-form.tsx`, replace:

```text
  const shownStep = useRef(active);

```

with:

```text
  const shownStep = useRef(active);
  const barRef = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(0);

  // The bar's height decides the scroll clearance below: measured, so a bar that grows past its
  // two-row 114 px still never covers the control the keyboard reaches (WCAG 2.4.11).
  useEffect(() => {
    const bar = barRef.current;
    // jsdom (unit tests) has no ResizeObserver; every real browser does, and the 140 px floor holds.
    if (!bar || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setBarHeight(bar.getBoundingClientRect().height);
    });
    observer.observe(bar);
    return () => {
      observer.disconnect();
    };
  }, []);
  const clearance = Math.max(ACTION_BAR_CLEARANCE, Math.ceil(barHeight) + ACTION_BAR_GAP);

```

In `components/data-display/wizard-form.tsx`, replace:

```text
          keyboard reaches: the page keeps 140 px of scroll padding below while a wizard is mounted
          (WCAG 2.4.11). */}
      <GlobalStyles styles={{ html: { scrollPaddingBottom: ACTION_BAR_CLEARANCE } }} />
```

with:

```text
          keyboard reaches: the page keeps at least 140 px of scroll padding below while a wizard is
          mounted, and the bar's measured height plus 26 px when that is more (WCAG 2.4.11). */}
      <GlobalStyles styles={{ html: { scrollPaddingBottom: clearance } }} />
```

In `components/data-display/wizard-form.tsx`, replace:

```text
        <Box
          sx={{
```

with:

```text
        <Box
          ref={barRef}
          sx={{
```

<!-- end apply -->

- [ ] **Step 4: Run** — form U: PASS (7). Mutation proofs: drop the floor
      (`Math.ceil(barHeight) + ACTION_BAR_GAP` alone): both 140 px tests fail (`26px` with no
      measurement, `96px` at 70 px); drop the gap: the new test fails at 158.4 px (`159px` against
      `185px`). Form E:
      `e2e/users-invite.spec.ts --grep "keeps keyboard focus clear"` (4 passed), and
      `e2e/platform-tenants.spec.ts` (19 passed; 16's wizard is the other `WizardForm`).

- [ ] **Step 5: Commit** (form C):

```text
fix(wizard): grow the scroll clearance with a taller action bar

WizardForm keeps 140px of scroll padding below so its sticky action bar never covers the control
the keyboard reaches, sized for the bar's two-row height. With text at 200% the bar wraps to three
rows (149px) and a Tab stop could sit under it. The bar is now measured, and the padding is its
height plus a 26px gap whenever that is more than 140px. The keyboard walk on the invite wizard
gains that case, and checks that the padding follows the bar.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

**Erratum (the gate's visual pass; the wording fix that follows e63e190):** at 200% text the sticky bar holds two taller rows (149 px), not three: the code comments and this task's text now say so, but `e63e190`'s commit body ("the bar wraps to three rows (149px)") ships as written, so the PR body says "two taller rows".

### Task A6: "None" for an unset primary branch, and the flags' notes under their words

Two of the invite wizard's gate observations. The optional Primary branch select shows its empty
option's words ("None", as the Review step says "Not set") with `displayEmpty`; the theme always
shrinks the label above, so they can't overlap. Each Invitation flag's description starts under
its label's words: the indent is MUI's medium checkbox (its 24 px icon, scaled with the theme's
type by `pxToRem`, in 9 px of padding each side) less FormControlLabel's 11 px pull.

**Files:** Modify `modules/administration/users/components/invite-choice-field.tsx`,
`invite-invitation-fields.tsx`, `invite-access-fields.test.tsx`, `e2e/users-invite.spec.ts`.

- [ ] **Step 1: Write the failing tests.**

<!-- apply: A6 test -->

In `e2e/users-invite.spec.ts`, replace:

```text
    await choose(page, page, 'Primary branch', 'Westlands Branch (WESTLANDS)');
    await next(page, 'Invitation');
    await expect(
      page.getByRole('checkbox', { name: 'Send the identity-provider invitation' }),
    ).toBeChecked();
```

with:

```text
    // Unset, the optional primary branch says so (the Review says "Not set"), never blank.
    await expect(page.getByRole('combobox', { name: 'Primary branch', exact: true })).toHaveText(
      'None',
    );
    await choose(page, page, 'Primary branch', 'Westlands Branch (WESTLANDS)');
    await next(page, 'Invitation');
    await expect(
      page.getByRole('checkbox', { name: 'Send the identity-provider invitation' }),
    ).toBeChecked();
    // Each flag's description starts under its label's words, not under the checkbox.
    for (const name of [
      'Send the identity-provider invitation',
      'Send the application invitation',
    ]) {
      const flag = page.getByRole('checkbox', { name });
      const description = page.locator(
        `[id="${(await flag.getAttribute('aria-describedby')) ?? ''}"]`,
      );
      const label = await boxOf(page.getByText(name, { exact: true }));
      expect(Math.abs((await boxOf(description)).x - label.x), name).toBeLessThanOrEqual(1);
    }
```

In `modules/administration/users/components/invite-access-fields.test.tsx`, replace:

```text

    await user.click(screen.getByRole('combobox', { name: 'Primary branch' }));
```

with:

```text

    // Unset, it says so, as the Review step's "Not set" does, rather than reading blank.
    expect(screen.getByRole('combobox', { name: 'Primary branch' })).toHaveTextContent(/^None$/);
    await user.click(screen.getByRole('combobox', { name: 'Primary branch' }));
```

<!-- end apply -->

- [ ] **Step 2: Run** — form U on `invite-access-fields.test.tsx`: FAIL, 1 failed ("offers every
      active branch as primary, or none": the display holds a zero-width space, not "None"). Form
      E: `e2e/users-invite.spec.ts --grep "invites a new staff member"`: FAIL at the `None`
      check; with only the choice field fixed, FAIL at the alignment (`Received: 29.28125`).

- [ ] **Step 3: Implement.**

<!-- apply: A6 impl -->

In `modules/administration/users/components/invite-choice-field.tsx`, replace:

```text
          helperText={fieldState.error?.message ?? hint}
          sx={sx}
```

with:

```text
          helperText={fieldState.error?.message ?? hint}
          // An optional choice left empty shows its empty option's words ("None"), not a blank
          // field; the theme always shrinks the label above, so the two never overlap.
          slotProps={{ select: { displayEmpty: noneLabel !== undefined } }}
          sx={sx}
```

In `modules/administration/users/components/invite-invitation-fields.tsx`, replace:

```text
import { INVITATION_NOTE } from '../invite-rules';
import type { InviteValues } from '../invite-schema';

/** Field groups stay a readable width on a wide screen, as 16's wizard does. */
const FIELD_GROUP = { maxWidth: 640, display: 'grid', gap: 4.5 } as const;
```

with:

```text
import type { Theme } from '@mui/material/styles';
import { INVITATION_NOTE } from '../invite-rules';
import type { InviteValues } from '../invite-schema';

/** Field groups stay a readable width on a wide screen, as 16's wizard does. */
const FIELD_GROUP = { maxWidth: 640, display: 'grid', gap: 4.5 } as const;

/** Where a flag's label text starts, so its description starts there too: MUI's medium checkbox is
 * its 24 px icon (scaled with the theme's type by `pxToRem`) in 9 px of padding on each side,
 * pulled 11 px left by FormControlLabel. */
const LABEL_INDENT = (theme: Theme) => `calc(${theme.typography.pxToRem(24)} + 7px)`;
```

In `modules/administration/users/components/invite-invitation-fields.tsx`, replace:

```text
          <FormHelperText id={descriptionId} sx={{ mt: 0 }}>
```

with:

```text
          <FormHelperText id={descriptionId} sx={{ mt: 0, ml: LABEL_INDENT }}>
```

<!-- end apply -->

- [ ] **Step 4: Run** — form U on the access and invitation field tests: PASS (15). Form E: the
      same grep: PASS; then the invite wizard's accessibility matrix,
      `e2e/users-invite.spec.ts --grep "users invite: accessibility"` (32 passed, about 4 min).

- [ ] **Step 5: Commit** (form C):

```text
fix(users): say None for an unset primary branch and align the flag notes

The invite wizard's optional Primary branch read blank until chosen, though its empty option says
None and the Review step says Not set; it now shows None. Each Invitation flag's description
started under the checkbox rather than under the label's words; it now starts where they do,
sized from the checkbox's icon so it follows the theme's type scale.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

### Task A7: The invite wizard's reachable gaps

Three behaviours the layer shipped with no e2e or no test at all, each pinned now: an answer about
an email edited during its check that **failed** is dropped (the in-use case already is); a
username a member here holds sends the wizard back to Identity with the username named (Ruling
15); an auditor's untouched branch row is refused at its own field, never as a missing branch
(Ruling 13). All pass on arrival: they pin shipped behaviour, so each has a mutation proof.

**Files:** Modify `modules/administration/users/components/invite-user-wizard.test.tsx`,
`e2e/users-invite.spec.ts`.

- [ ] **Step 1: Add the tests.**

<!-- apply: A7 change -->

In `e2e/users-invite.spec.ts`, replace:

```text
  'You invited this user, so another administrator must approve them.';

```

with:

```text
  'You invited this user, so another administrator must approve them.';
const CHOOSE_ROW_BRANCH = 'Choose a branch, or remove this row.';
const USERNAME_TAKEN =
  "This username can't be used: it already belongs to someone in this institution.";
const USERNAME_IN_USE = 'This username belongs to someone in this institution.';

```

In `e2e/users-invite.spec.ts`, replace:

```text

  test('reuses an account another institution has, keeping its own name', async ({
```

with:

```text

  test('returns to Identity when a member here already holds the username', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users-invite');
    await openWizard(page);
    // Esther, a member here, holds esther.njoki: the platform answers a new email with her
    // username with a 500 (BG-07), and the action then finds her and names the username.
    await fillIdentity(page, { ...NEEMA, username: 'esther.njoki' });
    await next(page, 'Access', FIRST_HIT);
    await fillAccess(page);
    await next(page, 'Invitation');
    await next(page, 'Review');
    await sendInvitation(page);

    await expect(page.getByRole('heading', { level: 2, name: 'Identity' })).toBeVisible({
      timeout: 15000,
    });
    const username = page.getByRole('textbox', { name: 'Username' });
    await expect(username).toHaveAccessibleDescription(USERNAME_IN_USE);
    await expect(username).toBeFocused();
    await expect(mainText(page, USERNAME_TAKEN)).toBeVisible();
    await expect(mainText(page, /Reference: [0-9a-f-]{36}/)).toBeVisible();
    // Every other answer is kept for the retry.
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue(NEEMA.email);
  });

  test('refuses an auditor’s untouched branch row at its field, never as a missing branch', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users-invite');
    await openWizard(page);
    await page.getByRole('textbox', { name: 'Full name' }).fill(NEEMA.name);
    await page.getByRole('textbox', { name: 'Email' }).fill(NEEMA.email);
    await page.getByRole('textbox', { name: 'Username' }).fill(NEEMA.username);
    await choose(page, page, 'Membership type', 'Auditor');
    await next(page, 'Access', FIRST_HIT);
    await choose(page, group(page, 'Role 1'), 'Role', 'Teller (TELLER)');

    // Branches are optional for an auditor, but the row the step starts with is unfinished.
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      group(page, 'Branch assignment 1').getByRole('combobox', { name: 'Branch', exact: true }),
    ).toHaveAccessibleDescription(CHOOSE_ROW_BRANCH);
    await expect(mainText(page, NEEDS_A_BRANCH)).toHaveCount(0);

    // Removing the row is the other way out: an auditor needs no branch.
    await page.getByRole('button', { name: 'Remove branch assignment 1' }).click();
    await next(page, 'Invitation');
  });

  test('reuses an account another institution has, keeping its own name', async ({
```

In `modules/administration/users/components/invite-user-wizard.test.tsx`, replace:

```text

  it('refuses a branch-scoped role at a branch they aren’t assigned to before Review', async () => {
```

with:

```text

  it('drops a failed answer about an email edited during its check', async () => {
    const user = userEvent.setup({ delay: null });
    let reply: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          reply = resolve;
        }),
    );
    renderWizard();
    await fillIdentity(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'x');

    reply(new Response(JSON.stringify({}), { status: 502 }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });
    // The check failed for an email no longer in the field: nothing about it is said, and the next
    // Continue checks the edited one.
    expect(screen.queryByText(EMAIL_CHECK_FAILED)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Identity' })).toBeInTheDocument();
  });

  it('refuses a branch-scoped role at a branch they aren’t assigned to before Review', async () => {
```

<!-- end apply -->

- [ ] **Step 2: Run** — form U on `invite-user-wizard.test.tsx`: PASS (20). Form E:
      `e2e/users-invite.spec.ts --grep "users invite: (entry|sending)"`: PASS (15, about 2 min).
      Mutation proofs, each reverted: move `continueFromIdentity`'s stale guard
      (`if (JSON.stringify(getValues([...IDENTITY_FIELDS])) !== validated) return;`) below the
      `failed` branch: "drops a failed answer about an email edited during its check" fails; in
      `invite-actions.ts` replace `await findMemberByUsername(input.username).catch(() => null)`
      with `await Promise.resolve(null)`: "returns to Identity when a member here already holds
      the username" fails (no Identity heading: the Review step shows the generic failure); in
      `invite-schema.ts` refuse an unfinished row only when `needsBranch(values.membershipType)`:
      "refuses an auditor's untouched branch row …" fails (the step moves on to Invitation).

- [ ] **Step 3: Commit** (form C):

```text
test(users): cover the invite wizard's reachable gaps

Three shipped behaviours had no test that would fail without them: a failed email check for an
email edited during the check is dropped like an in-use one; a username a member here already
holds sends the wizard back to Identity with that field named and the 500's reference; an
auditor's untouched branch row is refused at its own field, never as a missing branch. The two
end-to-end cases run on the existing invite scenario.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

### Task A8: The bell tells a one-branch account who activates (#62's first question)

With a branch selected, the bell's branch entry says "Switch to All branches to activate them."
An account with fewer than two ACTIVE branches can't select All branches (PF1, the queue pages'
rule); its bell now gives the Branch activation tab's advice: "Ask an administrator who works at
institution level to activate them." (the tab's note asks them to review the branches; the
bell's entry is about activating them). `canSwitch` is optional and defaults to today's words, so
layer 14's overview compiles unchanged until B2 passes it and makes it required.

**Files:** Modify `modules/administration/approvals/approval-notifications.ts`,
`components/shell/tenant-notifications.tsx` and their tests.

- [ ] **Step 1: Write the failing tests** (the bell's fixture gains two ACTIVE branches by
      default, so the existing "switch" case still describes an account that can switch).

<!-- apply: A8 test -->

In `components/shell/tenant-notifications.test.tsx`, replace:

```text
function resolved(
  permissions: string[],
  options: { module?: ApplicationContext['module']; branch?: ApplicationContext['branch'] } = {},
) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { ...PROFILE, permissions },
```

with:

```text
const ACTIVE_BRANCH = { code: 'WESTLANDS', name: 'Westlands Branch', status: 'ACTIVE' };

function resolved(
  permissions: string[],
  options: {
    module?: ApplicationContext['module'];
    branch?: ApplicationContext['branch'];
    /** The account's ACTIVE branches in /auth/me. */
    activeBranches?: number;
  } = {},
) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: {
      ...PROFILE,
      permissions,
      branches: Array.from({ length: options.activeBranches ?? 2 }, (_entry, index) => ({
        ...ACTIVE_BRANCH,
        id: `5b000000-0000-4000-8000-00000000000${String(index)}`,
      })),
    },
```

In `components/shell/tenant-notifications.test.tsx`, replace:

```text
    );
    expect(countUserApprovals).not.toHaveBeenCalled();
  });

```

with:

```text
    );
    expect(countUserApprovals).not.toHaveBeenCalled();
  });

  it('tells an account that works at one branch who activates, never to switch', async () => {
    const user = userEvent.setup({ delay: null });
    resolved(['branch.activate', 'branch.view'], {
      branch: { id: WESTLANDS, name: 'Westlands Branch' },
      activeBranches: 1,
    });
    countBranchActivations.mockResolvedValue(1);
    await show();

    await user.click(screen.getByRole('button', { name: 'Notifications: 1 approval waiting' }));
    const dialog = screen.getByRole('dialog', { name: 'Notifications' });
    expect(dialog).toHaveTextContent(
      '1 branch is waiting for activation. Ask an administrator who works at institution level to activate them.',
    );
    expect(dialog).not.toHaveTextContent('Switch to All branches');
  });

```

In `modules/administration/approvals/approval-notifications.test.ts`, replace:

```text
    });
    expect(props.entries[0]?.text).toBe(
      '2 branches are waiting for activation. Switch to All branches to activate them.',
```

with:

```text
      canSwitch: true,
    });
    expect(props.entries[0]?.text).toBe(
      '2 branches are waiting for activation. Switch to All branches to activate them.',
    );
  });

  it('tells an account that works at one branch who activates, never to switch', () => {
    const props = approvalNotifications({
      users: null,
      branches: { ok: true, value: 2 },
      branchSelected: true,
      canSwitch: false,
    });
    expect(props.entries[0]?.text).toBe(
      '2 branches are waiting for activation. Ask an administrator who works at institution level to activate them.',
```

<!-- end apply -->

- [ ] **Step 2: Run** — form U on the two test files: FAIL, 2 failed (each new "tells an account
      that works at one branch who activates, never to switch").

- [ ] **Step 3: Implement.**

<!-- apply: A8 impl -->

In `components/shell/tenant-notifications.tsx`, replace:

```text
        branchSelected: selected.context.branch !== null,
      })}
```

with:

```text
        branchSelected: selected.context.branch !== null,
        // PF1: /auth/me branches[] can include SUSPENDED ones; All branches needs two ACTIVE.
        canSwitch:
          selected.profile.branches.filter((entry) => entry.status === 'ACTIVE').length > 1,
      })}
```

In `modules/administration/approvals/approval-notifications.ts`, replace:

```text

/** The tenant bell (spec §8, BG-22). Any permitted read that failed makes the whole count unknown:
```

with:

```text

/** With a branch selected, activation needs All branches (BG-03), which an account that works at a
 * single branch can't select (the queue's own note says the same, `branchQueueContextNote`). */
const branchContextHint = (canSwitch: boolean) =>
  canSwitch
    ? ' Switch to All branches to activate them.'
    : ' Ask an administrator who works at institution level to activate them.';

/** The tenant bell (spec §8, BG-22). Any permitted read that failed makes the whole count unknown:
```

In `modules/administration/approvals/approval-notifications.ts`, replace:

```text
  branchSelected: boolean;
}): NotificationsMenuProps {
```

with:

```text
  branchSelected: boolean;
  /** The account can select All branches (more than one ACTIVE branch); one that works at a single
   * branch is told who can activate instead. Omitted: it can. */
  canSwitch?: boolean;
}): NotificationsMenuProps {
```

In `modules/administration/approvals/approval-notifications.ts`, replace:

```text
        input.branchSelected ? ' Switch to All branches to activate them.' : ''
```

with:

```text
        input.branchSelected ? branchContextHint(input.canSwitch ?? true) : ''
```

<!-- end apply -->

- [ ] **Step 4: Run** — form U: PASS (23). Mutation proof: pass `canSwitch: true` from the bell: the
      bell's new test fails. Form E:
      `e2e/approvals.spec.ts --grep "tells a branch context to switch"` (Jane has two ACTIVE
      branches: the old words, 1 passed). No scenario has a one-branch account holding
      `branch.activate` and `branch.view`, so the new words are unit-pinned only (a scenario would
      be a fake-API change). The gate's screenshot uses the uncommitted scenario under **PR body
      guidance**; a probe on CI's browser read the new words from it.

- [ ] **Step 5: Commit** (form C):

```text
fix(approvals): tell a one-branch account who activates branches

With a branch selected, the bell told everyone to switch to All branches to activate the pending
branches, though an account with a single active branch can't. It now gives that account the
Branch activation tab's advice, to ask an administrator who works at institution level; an
account that can switch reads the same words as before. This changes the copy layer 12's Ruling 9
fixed, for one-branch accounts only.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

### Task A9: A quiet unit run

Vite loads `vitest.config.ts` as CommonJS (the repo has no `"type": "module"`) and warns that its
ESM syntax won't load that way in a later major: as `.mts` it loads as ESM. Two tests let jsdom
try a real navigation or form submission and print "Not implemented": they now cancel the
default action after React's handlers have run, as `notifications-menu.test.tsx` already does.
After the rename, twelve test comments name the config by its new name, and lint-staged's glob
gains `mts`, so the pre-commit hook lints and formats the renamed file (and the fake API's `.mts`
files) as it does every `.ts` one.

**Files:** Rename `vitest.config.ts` to `vitest.config.mts`; modify
`components/shell/user-menu.test.tsx`, `components/shell/workspace-drawer.test.tsx`,
`package.json` (lint-staged's glob only) and the twelve test files whose comments name the config.

- [ ] **Step 1: Run first** — form U on `components/shell/user-menu.test.tsx` and
      `components/shell/workspace-drawer.test.tsx`: passes, printing Vite's `configLoader` notice,
      "Not implemented: HTMLFormElement's requestSubmit() method" and "Not implemented: navigation
      to another Document".

- [ ] **Step 2: Change.**

<!-- apply: A9 change -->

Rename `vitest.config.ts` to `vitest.config.mts` (`git mv`; the content is unchanged).

In `components/shell/user-menu.test.tsx`, replace:

```text

    await user.click(screen.getByRole('button', { name: /jane muthoni/i }));
    const logOutButton = screen.getByRole('button', { name: /log out/i });
    await user.click(logOutButton);

    expect(logOutButton).toBeDisabled();
```

with:

```text
    // jsdom can't submit a form to another page: cancel the native submission after React's
    // handler has run, as a browser would leave this page.
    const keepPage = (event: Event) => {
      event.preventDefault();
    };
    document.addEventListener('submit', keepPage);
    try {
      await user.click(screen.getByRole('button', { name: /jane muthoni/i }));
      const logOutButton = screen.getByRole('button', { name: /log out/i });
      await user.click(logOutButton);

      expect(logOutButton).toBeDisabled();
    } finally {
      document.removeEventListener('submit', keepPage);
    }
```

In `components/shell/workspace-drawer.test.tsx`, replace:

```text
    fireEvent.click(mobileOverviewLink);
```

with:

```text
    // jsdom can't navigate: cancel the link's default action after React's handlers have run.
    const keepPage = (event: Event) => {
      event.preventDefault();
    };
    document.addEventListener('click', keepPage);
    try {
      fireEvent.click(mobileOverviewLink);
    } finally {
      document.removeEventListener('click', keepPage);
    }
```

<!-- end apply -->

- [ ] **Step 3: Run** — the same command: PASS (9), and none of the three lines. Then
      `pnpm typecheck` and `pnpm lint` (the `.mts` file is in `tsconfig.json`'s `**/*.mts` and is
      linted).

- [ ] **Step 4: Name the config by its new name** (found with
      `git grep -n "vitest.config.ts" -- ':!docs'`; the earlier layers' plans under `docs/` keep
      their record), and add `mts` to lint-staged's glob.

<!-- apply: A9 names -->

In `app/(authenticated)/admin/users/[userId]/page.test.tsx`, replace:

```text
  // Not the zone vitest.config.ts pins for the runner (Africa/Nairobi), and with no daylight saving,
  // so only the organisation's own zone can produce the times asserted below.
```

with:

```text
  // Not the zone vitest.config.mts pins for the runner (Africa/Nairobi), and with no daylight
  // saving, so only the organisation's own zone can produce the times asserted below.
```

In `components/auth/continue-with-keycloak-button.test.tsx`, replace:

```text
    // real, meaningful CSS in this jsdom run (vitest.config.ts has
```

with:

```text
    // real, meaningful CSS in this jsdom run (vitest.config.mts has
```

In `components/data-display/list-toolbar.test.tsx`, replace:

```text
// vitest.config.ts pins TZ to Africa/Nairobi, matching the org zone used below, so the browser-zone
// helper text stays hidden unless a test passes a *different* `timeZone`.
```

with:

```text
// vitest.config.mts pins TZ to Africa/Nairobi, matching the org zone used below, so the
// browser-zone helper text stays hidden unless a test passes a *different* `timeZone`.
```

In `components/data-display/list-toolbar.test.tsx`, replace:

```text
    // Pinned to Africa/Nairobi (vitest.config.ts): 10:00 local (+03:00) is 07:00 UTC. A literal
```

with:

```text
    // Pinned to Africa/Nairobi (vitest.config.mts): 10:00 local (+03:00) is 07:00 UTC. A literal
```

In `modules/administration/roles/components/role-assignment-actions.test.tsx`, replace:

```text
// vitest.config.ts resets no mocks, so each case must start with a clean call count.
```

with:

```text
// vitest.config.mts resets no mocks, so each case must start with a clean call count.
```

In `modules/administration/roles/components/role-assignments-table.test.tsx`, replace:

```text
// vitest.config.ts resets no mocks, so each case must start with a clean call count.
```

with:

```text
// vitest.config.mts resets no mocks, so each case must start with a clean call count.
```

In `modules/administration/roles/components/role-permission-actions.test.tsx`, replace:

```text
// vitest.config.ts resets no mocks, so without this the retry test would count the first test's
```

with:

```text
// vitest.config.mts resets no mocks, so without this the retry test would count the first test's
```

In `modules/administration/roles/components/role-permissions-table.test.tsx`, replace:

```text
// vitest.config.ts resets no mocks, so each case must start with a clean call count.
```

with:

```text
// vitest.config.mts resets no mocks, so each case must start with a clean call count.
```

In `modules/administration/users/components/user-branch-actions.test.tsx`, replace:

```text
// vitest.config.ts resets no mocks, so each case must start with a clean call count.
```

with:

```text
// vitest.config.mts resets no mocks, so each case must start with a clean call count.
```

In `modules/administration/users/components/user-branch-assignments-table.test.tsx`, replace:

```text
// vitest.config.ts resets no mocks, so each case must start with a clean call count.
```

with:

```text
// vitest.config.mts resets no mocks, so each case must start with a clean call count.
```

In `modules/administration/users/components/user-role-actions.test.tsx`, replace:

```text
// vitest.config.ts resets no mocks, so each case must start with a clean call count.
```

with:

```text
// vitest.config.mts resets no mocks, so each case must start with a clean call count.
```

In `modules/administration/users/components/user-role-assignments-table.test.tsx`, replace:

```text
// vitest.config.ts resets no mocks, so each case must start with a clean call count.
```

with:

```text
// vitest.config.mts resets no mocks, so each case must start with a clean call count.
```

In `package.json`, replace:

```text
    "*.{ts,tsx,js,mjs}": [
```

with:

```text
    "*.{ts,tsx,mts,js,mjs}": [
```

<!-- end apply -->

- [ ] **Step 5: Run** — `git grep -n "vitest.config.ts" -- ':!docs'`: nothing. With the rename
      staged (Step 2's `git mv` stages it),
      `pnpm exec lint-staged --diff=HEAD --diff-filter=R --verbose` lists
      `*.{ts,tsx,mts,js,mjs} — 1 file` and runs ESLint and Prettier on `vitest.config.mts`
      (unchanged). With main's glob the same command prints "lint-staged could not find any
      staged files matching configured tasks."

- [ ] **Step 6: Commit** (form C; `git mv` staged the rename; stage the other files whole):

```text
chore(test): load the Vitest config as ESM and keep jsdom from navigating

Vite warned on every unit run that vitest.config.ts uses ESM syntax in a file it loads as
CommonJS; renamed to .mts it loads as ESM, with the same settings. Twelve test comments now name
the new file, and lint-staged's glob gains mts, so the hook lints and formats it as it does a .ts
file. The user menu and workspace drawer tests let jsdom try a real form submission and a real
navigation, which it reports as not implemented; they now cancel the default action after
React's handlers have run.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

**Erratum (6b1ad9e, `chore(test): load the Vitest config as ESM and keep jsdom from navigating`):** the task's "twelve test files" is twelve comments in eleven files (`list-toolbar.test.tsx` has two), so the commit changes thirteen test files in all with `user-menu.test.tsx` and `workspace-drawer.test.tsx`; and the brief's `user-menu.test.tsx` replace block starts with a blank line its replacement doesn't repeat, so that blank line is gone from the committed file, as in the replayed tree.

### Task A10: The docs

The README's hooks section describes hooks that changed; nothing says how to run the e2e as CI
does, or what `next dev`'s lock means; and #62's third question asked whether User onboarding's
"Newest first" holds (it is the account's age, BG-09).

**Files:** Modify `README.md`.

- [ ] **Step 1: Change.**

<!-- apply: A10 change -->

In `README.md`, replace:

```text
- **pre-commit**: lints and formats staged files only (`eslint --fix --max-warnings=0` +
  `prettier --write`).
- **pre-push**: `pnpm typecheck && pnpm test:run` — a fast correctness gate before code leaves
  your machine. `pnpm test:e2e` and the build are intentionally left to CI since they're slower.
```

with:

```text
- **pre-commit**: lints and formats the staged files (`eslint --fix --max-warnings=0` +
  `prettier --write`; JSON, Markdown and CSS get Prettier only), then runs `pnpm check` (format,
  lint, typecheck and the unit tests) on the whole tree.
- **pre-push**: `pnpm typecheck && pnpm verify`: `pnpm check`, the unit tests with coverage and
  the production build, which needs the environment `config/env.server.ts` validates.
  `pnpm test:e2e` is left to CI since it's slower.
```

In `README.md`, replace:

```text
  `docs/authentication/security.md` for what running it for real uncovered.

```

with:

```text
  `docs/authentication/security.md` for what running it for real uncovered.
- **Running the end-to-end suite as CI does**: CI installs the Chromium build `@playwright/test`
  pins (`pnpm exec playwright install --with-deps chromium`) and runs it headless, which is
  Playwright's `chromium-headless-shell`, with `CI=true` (two retries, servers never reused).
  Another Chromium (an older installed build, or a full Chrome through `channel` or
  `executablePath`) lays out buttons and text a few pixels differently, so a layout-sensitive test
  can pass there and fail on CI. To see what CI sees, install the pinned build and run
  `CI=true pnpm test:e2e <spec> --retries=0` with ports 3100 and 3199 free. `next dev` refuses to
  start while another dev server of the same checkout runs, and names its PID: stop that process
  (stopping `pnpm` alone can leave its `next-server` child running). A `.next/dev/lock` left by a
  server that has exited is ignored on Linux and macOS.

```

In `README.md`, replace:

```text
    remarks on Approve (`docs/backend-gaps.md` BG-01).
  - The maker comes from the audit log, so without `audit.view` (or when that read fails) Approve
```

with:

```text
    remarks on Approve (`docs/backend-gaps.md` BG-01).
  - User onboarding's "Newest first" is the users endpoint's own order, by when each account was
    created (BG-09): an invitation that reused an existing account sorts by that account's age.
  - The maker comes from the audit log, so without `audit.view` (or when that read fails) Approve
```

<!-- end apply -->

- [ ] **Step 2: Run** — `pnpm exec prettier --check README.md`: clean.

- [ ] **Step 3: Commit** (form C):

```text
docs: correct the hooks and say how to run the e2e as CI does

The hooks section still described a pre-commit that only formats and a pre-push without the
build; it now names pnpm check and pnpm verify. A new Testing entry says how CI runs the end-to-end
suite (the pinned headless Chromium, CI=true) and how to see what CI sees, and that next dev
refuses to start only while another dev server of the checkout is alive. The approval queue's
limits say that User onboarding's newest-first order is the account's age.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

---

# Part B: after #69 merges

**Start only when #69 is merged into `main`.** Rebase the cleanup branch onto the new `main`
(Part A touches none of #69's files; its README and AGENTS.md paragraphs are not the ones #69
edits, and the rebase was replayed clean on `8258e3e`), run `pnpm install --frozen-lockfile` and
`pnpm check`, then apply B1 and B2. The anchors below are `8258e3e`'s; if #69 changed before its
merge, re-read the anchors first. B2 needs A8.

### Task B1: The readiness note's words, and room between the approvals summary's entries

Two of layer 14's gate observations (6 and 4). The readiness card's note read "One your role
can't read says so."; it says "An item …". At 375 px each Pending approvals summary entry wraps
its link under its sentence, with 2 px inside an entry and only 4 px between entries, so "Review
user onboarding" reads as part of the branches' sentence: `py: 1` gives 8 px.

**Files:** Modify `modules/administration/overview/readiness-rules.ts`,
`modules/administration/overview/components/pending-approvals-card.tsx`, `e2e/overview.spec.ts`.

- [ ] **Step 1: Write the failing tests.**

<!-- apply: B1 test -->

In `e2e/overview.spec.ts`, replace:

```text
const NOT_SET = "Not set: default timezone and base currency. Settings can't be saved yet.";

```

with:

```text
const NOT_SET = "Not set: default timezone and base currency. Settings can't be saved yet.";
const READINESS_NOTE =
  "Each item is computed from live data. An item your role can't read says so.";

```

In `e2e/overview.spec.ts`, replace:

```text
  return box.y;
}
```

with:

```text
  return box.y;
}

/** A visible element's box. */
async function boxOf(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error('a visible element has no box');
  return box;
}
```

In `e2e/overview.spec.ts`, replace:

```text
    await expect(approvals.getByRole('note')).toHaveCount(0);

    await expect(
      card(page, 'Operational readiness').getByRole('progressbar', {
```

with:

```text
    await expect(approvals.getByRole('note')).toHaveCount(0);

    await expect(card(page, 'Operational readiness')).toContainText(READINESS_NOTE);
    await expect(
      card(page, 'Operational readiness').getByRole('progressbar', {
```

In `e2e/overview.spec.ts`, replace:

```text

  // One test per scenario, each signing in to its own fake-API run (rule 13).
```

with:

```text

  // At 375 px each summary entry wraps its link under its sentence: the next entry must sit at least
  // three times as far away as those two lines (8 px against 2), or "Review user onboarding" reads
  // as part of the branches' sentence (layer 14's gate, observation 4: 4 px against 2).
  test('keeps the approvals summary entries apart when they wrap (375 px)', async ({
    context,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await authenticate(context, testInfo, 'overview-attention');
    await enterOverview(page);
    const approvals = card(page, 'Pending approvals');
    const users = await boxOf(
      approvals.getByText('3 users are waiting for approval.', { exact: true }),
    );
    const usersLink = await boxOf(
      approvals.getByRole('link', { name: 'Review user onboarding', exact: true }),
    );
    const branches = await boxOf(
      approvals.getByText('3 branches are waiting for activation.', { exact: true }),
    );
    const inside = usersLink.y - (users.y + users.height);
    const between = branches.y - (usersLink.y + usersLink.height);
    expect(inside, 'the users entry wraps its link under its sentence').toBeGreaterThanOrEqual(0);
    expect(
      between,
      `between entries ${between} px, inside one ${inside} px`,
    ).toBeGreaterThanOrEqual(3 * inside);
  });

  // One test per scenario, each signing in to its own fake-API run (rule 13).
```

<!-- end apply -->

- [ ] **Step 2: Run** — form E:
      `e2e/overview.spec.ts --grep "summary entries apart|omits what the holder"`: FAIL, 2 failed
      (the note's old words; `between entries 4 px, inside one 2 px`,
      `Expected: >= 6`).

- [ ] **Step 3: Implement.**

<!-- apply: B1 impl -->

In `modules/administration/overview/components/pending-approvals-card.tsx`, replace:

```text
              sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, py: 0.5 }}
```

with:

```text
              // 8 px between entries against 2 px between a wrapped entry's own lines, so each
              // sentence stays with its link (layer 14's gate, observation 4).
              sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, py: 1 }}
```

In `modules/administration/overview/readiness-rules.ts`, replace:

```text
  "Each item is computed from live data. One your role can't read says so.";
```

with:

```text
  "Each item is computed from live data. An item your role can't read says so.";
```

<!-- end apply -->

- [ ] **Step 4: Run** — the same grep: PASS (2). Then form E:
      `e2e/overview.spec.ts --grep "overview: the cards"` (9 passed) and
      `e2e/overview.spec.ts e2e/fake-api-overview.spec.ts --grep "overview: accessibility|fake"`
      (16 + 6 passed).

- [ ] **Step 5: Commit** (form C):

```text
fix(overview): reword the readiness note and space the approvals summary

The Operational readiness note said "One your role can't read says so"; it now says "An item your
role can't read says so". At 375px the Pending approvals summary's two entries sat 4px apart while
each wrapped its link 2px under its sentence, so a link read as part of the next sentence; the
entries now sit 8px apart.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

### Task B2: The overview tells a one-branch account who activates (Q5)

The Pending approvals card shows the bell's entries (`approvalNotifications`), so it gave the same
hint. The page passes `canSwitch` (two ACTIVE branches) to the section, which passes it to the
view, as `branchSelected` goes today. `PendingApprovalsReads.canSwitch` is required: every caller
is in this layer. With every caller of `approvalNotifications` now passing `canSwitch`, it becomes
required there too, so the compiler finds a later caller that forgets it, which the optional input
would have given the switch advice silently. Layer 14's readiness item counts users only, with
`branchSelected: false`, where `canSwitch` is never read: it passes `true`, with a comment saying
so.

**Files:** Modify `modules/administration/overview/overview-rules.ts` (+ test),
`modules/administration/overview/components/pending-approvals-card.tsx` (+ test),
`app/(authenticated)/admin/page.tsx` (+ test),
`modules/administration/overview/readiness-rules.ts`,
`modules/administration/approvals/approval-notifications.ts` (+ test).

- [ ] **Step 1: Write the failing tests**, and give the bell's own test calls the input they will
      need.

<!-- apply: B2 test -->

In `app/(authenticated)/admin/page.test.tsx`, replace:

```text
        'Pending approvals card {"users":true,"branches":true,"branchSelected":false}',
```

with:

```text
        'Pending approvals card {"users":true,"branches":true,"branchSelected":false,"canSwitch":false}',
```

In `app/(authenticated)/admin/page.test.tsx`, replace:

```text
        'Pending approvals card {"users":false,"branches":true,"branchSelected":false}',
```

with:

```text
        'Pending approvals card {"users":false,"branches":true,"branchSelected":false,"canSwitch":false}',
```

In `app/(authenticated)/admin/page.test.tsx`, replace:

```text
        'Pending approvals card {"users":true,"branches":true,"branchSelected":true}',
```

with:

```text
        'Pending approvals card {"users":true,"branches":true,"branchSelected":true,"canSwitch":false}',
      ),
    ).toBeInTheDocument();
  });

  it('tells the approvals card the account can switch with two active branches', async () => {
    // A SUSPENDED branch doesn't count (PF1): two ACTIVE ones make All branches selectable.
    getCurrentContextProfile.mockResolvedValue({
      kind: 'resolved',
      profile: {
        ...PROFILE,
        permissions: EVERY_CODE,
        branches: [
          {
            id: '14e10000-0000-4000-8000-0000000000dd',
            code: 'HQ',
            name: 'Head Office',
            status: 'ACTIVE',
          },
          {
            id: '14e10000-0000-4000-8000-0000000000ee',
            code: 'WL',
            name: 'Westlands',
            status: 'ACTIVE',
          },
          {
            id: '14e10000-0000-4000-8000-0000000000ff',
            code: 'KS',
            name: 'Kisumu',
            status: 'SUSPENDED',
          },
        ],
      },
      context: {
        module: { id: 'administration', name: 'Administration' },
        organization: { id: '14e10000-0000-4000-8000-0000000000bb', name: 'Greenfield SACCO' },
        branch: { id: '14e10000-0000-4000-8000-0000000000dd', name: 'Head Office' },
      },
    });
    await show();

    expect(
      screen.getByText(
        'Pending approvals card {"users":true,"branches":true,"branchSelected":true,"canSwitch":true}',
```

In `modules/administration/approvals/approval-notifications.test.ts`, replace:

```text
        branches: { ok: true, value: 3 },
        branchSelected: false,
      }),
    ).toEqual({
```

with:

```text
        branches: { ok: true, value: 3 },
        branchSelected: false,
        canSwitch: true,
      }),
    ).toEqual({
```

In `modules/administration/approvals/approval-notifications.test.ts`, replace:

```text
      branches: null,
      branchSelected: false,
    });
    expect(users.label).toBe('Notifications: 1 approval waiting');
```

with:

```text
      branches: null,
      branchSelected: false,
      canSwitch: true,
    });
    expect(users.label).toBe('Notifications: 1 approval waiting');
```

In `modules/administration/approvals/approval-notifications.test.ts`, replace:

```text
      branches: { ok: true, value: 1 },
      branchSelected: false,
    });
    expect(branches.entries.map((entry) => entry.text)).toEqual([
```

with:

```text
      branches: { ok: true, value: 1 },
      branchSelected: false,
      canSwitch: true,
    });
    expect(branches.entries.map((entry) => entry.text)).toEqual([
```

In `modules/administration/approvals/approval-notifications.test.ts`, replace:

```text
        branches: { ok: true, value: 0 },
        branchSelected: false,
      }),
    ).toMatchObject({ label: 'Notifications: nothing waiting', total: 0, entries: [] });
```

with:

```text
        branches: { ok: true, value: 0 },
        branchSelected: false,
        canSwitch: true,
      }),
    ).toMatchObject({ label: 'Notifications: nothing waiting', total: 0, entries: [] });
```

In `modules/administration/approvals/approval-notifications.test.ts`, replace:

```text
    expect(approvalNotifications({ users, branches, branchSelected: false })).toMatchObject({
```

with:

```text
    expect(
      approvalNotifications({ users, branches, branchSelected: false, canSwitch: true }),
    ).toMatchObject({
```

In `modules/administration/overview/components/pending-approvals-card.test.tsx`, replace:

```text
    <>{await PendingApprovalsSection({ users, branches, branchSelected })}</>,
```

with:

```text
    <>{await PendingApprovalsSection({ users, branches, branchSelected, canSwitch: true })}</>,
```

In `modules/administration/overview/components/pending-approvals-card.test.tsx`, replace:

```text
      PendingApprovalsSection({ users: true, branches: true, branchSelected: false }),
```

with:

```text
      PendingApprovalsSection({
        users: true,
        branches: true,
        branchSelected: false,
        canSwitch: true,
      }),
```

In `modules/administration/overview/overview-rules.test.ts`, replace:

```text
  branchSelected: false,
};
```

with:

```text
  branchSelected: false,
  canSwitch: true,
};
```

In `modules/administration/overview/overview-rules.test.ts`, replace:

```text

  it('reads only the kinds the holder can decide', () => {
```

with:

```text

  it('tells an account that works at one branch who activates, as the bell does', () => {
    const view = pendingApprovalsView({ ...READS, branchSelected: true, canSwitch: false });
    expect(view.summary[1]?.text).toBe(
      '3 branches are waiting for activation. Ask an administrator who works at institution level to activate them.',
    );
  });

  it('reads only the kinds the holder can decide', () => {
```

In `modules/administration/overview/overview-rules.test.ts`, replace:

```text
      branchSelected: false,
    });
```

with:

```text
      branchSelected: false,
      canSwitch: true,
    });
```

In `modules/administration/overview/overview-rules.test.ts`, replace:

```text
        branchSelected: false,
      }),
```

with:

```text
        branchSelected: false,
        canSwitch: true,
      }),
```

<!-- end apply -->

- [ ] **Step 2: Run** — form U on the three overview test files: FAIL, 5 failed and 43 passed:
      the new overview-rules test and four page tests (`canSwitch` missing from the card's props).

- [ ] **Step 3: Implement**, and make `canSwitch` required.

<!-- apply: B2 impl -->

In `app/(authenticated)/admin/page.tsx`, replace:

```text
              branchSelected={selected.context.branch !== null}
            />,
```

with:

```text
              branchSelected={selected.context.branch !== null}
              // PF1: /auth/me branches[] can include SUSPENDED ones; All branches needs two ACTIVE.
              canSwitch={
                selected.profile.branches.filter((entry) => entry.status === 'ACTIVE').length > 1
              }
            />,
```

In `modules/administration/approvals/approval-notifications.ts`, replace:

```text
   * branch is told who can activate instead. Omitted: it can. */
  canSwitch?: boolean;
```

with:

```text
   * branch is told who can activate instead. Required, so no caller gets the switch advice by
   * omission; read only with `branchSelected`. */
  canSwitch: boolean;
```

In `modules/administration/approvals/approval-notifications.ts`, replace:

```text
        input.branchSelected ? branchContextHint(input.canSwitch ?? true) : ''
```

with:

```text
        input.branchSelected ? branchContextHint(input.canSwitch) : ''
```

In `modules/administration/overview/components/pending-approvals-card.tsx`, replace:

```text
}: {
  users: boolean;
  branches: boolean;
  branchSelected: boolean;
```

with:

```text
  canSwitch,
}: {
  users: boolean;
  branches: boolean;
  branchSelected: boolean;
  canSwitch: boolean;
```

In `modules/administration/overview/components/pending-approvals-card.tsx`, replace:

```text
        branchSelected,
      })}
```

with:

```text
        branchSelected,
        canSwitch,
      })}
```

In `modules/administration/overview/overview-rules.ts`, replace:

```text
  branchSelected: boolean;
}
```

with:

```text
  branchSelected: boolean;
  /** The account can select All branches (more than one ACTIVE branch), as the bell is told. */
  canSwitch: boolean;
}
```

In `modules/administration/overview/overview-rules.ts`, replace:

```text
          branchSelected: reads.branchSelected,
        }).entries;
```

with:

```text
          branchSelected: reads.branchSelected,
          canSwitch: reads.canSwitch,
        }).entries;
```

In `modules/administration/overview/readiness-rules.ts`, replace:

```text
  const waiting = approvalNotifications({ users: counts, branches: null, branchSelected: false })
    .entries[0];
```

with:

```text
  const waiting = approvalNotifications({
    users: counts,
    branches: null,
    // Users only: the branch flags word a branch entry, which this item never has.
    branchSelected: false,
    canSwitch: true,
  }).entries[0];
```

<!-- end apply -->

- [ ] **Step 4: Run** — form U on `modules/administration/overview`, the page test and
      `modules/administration/approvals/approval-notifications.test.ts`: PASS (10 files, 129 tests).
      `pnpm typecheck`: clean. The compiler is the proof that it finds every caller: with
      `canSwitch` required and `readiness-rules.ts`'s call as #69 left it, `pnpm typecheck` fails
      there (`TS2345`, "Property 'canSwitch' is missing"), and, without Step 1's test calls, at the
      five calls in `approval-notifications.test.ts` that omit it.

- [ ] **Step 5: Commit** (form C):

```text
fix(overview): tell a one-branch account who activates branches

The overview's Pending approvals card shows the bell's entries, so with a branch selected it told
an account with a single active branch to switch to All branches. The page now tells the card
whether the account can switch, and the card words it as the bell does. With every caller passing
it, approvalNotifications now requires canSwitch, so no later caller gets the switch advice by
omission.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A64qenN9PHda6gtMwEETdc
```

**Gate:** the hook's `pnpm check`.

## Layer gate (the controller's; not a task)

1. **Static and unit:** `pnpm check`, `pnpm test:coverage` (CI's thresholds) and `pnpm build` on
   Part A's last commit, and again after Part B; `git status` clean.
2. **E2E:** the full Playwright suite on CI's browser with `--retries=0`, in chunks of at most 8
   minutes, after Part A and again after Part B. Every spec, not only the touched ones: A1's
   `settleInPage` refactor sits under every `selectMuiOption` call (45 sites) and A3 changes the
   dialogs every lifecycle action uses. Ports 3100 and 3199 free before each chunk (L8). After
   Part A, also the formerly flaky test, at the four workers where it showed (20 passed in each of
   the plan's two runs, about 2 min):
   `e2e/settings.spec.ts --grep "frozen base currency" --repeat-each=20 --workers=4 --retries=0`.
3. **Visual and keyboard pass** for the UI rows of the task table, light and dark, 1440 and 375:
   - the invite wizard's Access step (Primary branch "None") and Invitation step (the two notes
     under their labels);
   - a focused failure Alert with the house ring: the invite wizard's, and the context
     selection's outlined one, where the ring sits beside a 1 px border (scenario
     `selection-forbidden`: choose the organisation, then press a key and focus the Alert);
   - at 375 px with text at 200%: Tab through the Access step with three rows of each (the stop
     that sat 0.16 px under the bar is there) and on to each Edit button on Review, none under
     the bar;
   - the bell with a branch selected, for an account that can switch and one that can't (the
     second from the scenario under **PR body guidance**, or a live read);
   - after Part B, the overview's readiness note and the approvals summary at 375 px.
4. **Screenshots** for the PR (fake API only): the surfaces above, the one-branch bell included.
5. **Squash or not:** per Q3.

## Controller live check (against the real backend; not a task)

**Reads only, and optional.** Nothing in this PR changes what the app sends to the backend. If the
maintainer wants one: sign in (a person) as an account with one ACTIVE branch holding
`branch.activate` and `branch.view`, select that branch, open the bell (A8's words) and, after
Part B, the overview. Nothing that writes.

## PR body guidance (the controller's; not a task)

- **A3 hardens a latent window; it doesn't fix a failing test.** Say so. The settings test passes on
  `main` (40 of 40 on CI's browser and 60 of 60 on the full Chrome, four workers each), and 20 of 20
  at `--repeat-each=20 --workers=4` with A3; the window's evidence is a forced-timing probe on layer
  12's tree and A3's unit tests, RED on `main` under jsdom. What hides it in the browser on `main`
  is on Next 16.4's server-action path and is not identified (Pre-flight 1): don't name React's
  scheduler as the cause.
- **Ruling 9's copy changes for one-branch accounts (A8, B2).** Say so. Layer 12's Ruling 9 fixed
  "Switch to All branches to activate them."; with a branch selected, an account with fewer than
  two ACTIVE branches now reads "Ask an administrator who works at institution level to activate
  them." (#62's first question, Q5). Every other account reads the same words as before.
- **Name the merge style** the maintainer chose (Q3), and whether A2 is in (Q1).
- **The one-branch bell's screenshot** comes from the scenario below, applied locally on Part A's
  last commit and never committed. Keep the patch in the PR body so a reviewer can reproduce it.

```diff
diff --git a/e2e/fake-api/scenarios.mts b/e2e/fake-api/scenarios.mts
index 15108ee..10c2ef6 100644
--- a/e2e/fake-api/scenarios.mts
+++ b/e2e/fake-api/scenarios.mts
@@ -1674,6 +1674,16 @@ const BUILDERS = {
       ),
     };
   },
+  // Not committed: the bell for an account with one ACTIVE branch (Westlands SUSPENDED).
+  'approvals-one-branch': () => {
+    const state = approvalsScenario();
+    return {
+      ...state,
+      branches: state.branches.map((candidate) =>
+        candidate.id === IDS.westlands ? { ...candidate, status: 'SUSPENDED' } : candidate,
+      ),
+    };
+  },
   'no-audit-permission': () => withoutPermission(greenfieldTenant(), 'audit.view'),
   'business-date-read-only': () =>
     withoutPermission(
```

With it applied, sign in with `authenticate(context, testInfo, 'approvals-one-branch')` and open
the queue with `enterAdmin(page, '/admin/approvals/users', { heading: 'Approval queue', branch: null })`:
with one ACTIVE branch there is no branch step, and the context is Head Office. The bell is
"Notifications: 11 approvals waiting", and its branch entry reads "3 branches are waiting for
activation. Ask an administrator who works at institution level to activate them." (a probe on
CI's browser; the same steps on `approvals`, with its branch step, read "Switch to All branches to
activate them.").

## Self-review

- **Scope against the brief.** Every candidate is in the inventory with its place on `e6f7e7e` or
  `8258e3e`, whether it still holds, its size, its risk, its ruling and a verdict: 10 Part A tasks
  (one, A2, only on Q1 = yes) and 2 Part B tasks, 12 sub-tasks (11 without the self-test), within
  the target of 8–12 once review 1 merged the two click-helper tasks. Four premises were false or
  partly false and are recorded (Pre-flight 6, 7, 9, and the settings flake's "intermittent on
  main", Pre-flight 1); the safest default was carried for each.
- **Briefs.** Each task's brief is its section here plus Global Constraints. The sections run from
  95 to 479 lines: A3 479 (three components, three test files and the shared helper), B2 451, A1
  381, A5 296, A9 276, A8 223, the rest under 175. All code is complete: each block is an exact
  replacement with enough context to occur once, or a whole file, or a rename.
- **The settings flake (A3).** Investigated with evidence, not skipped: a forced-timing probe that
  presses Escape in the microtask after the failure's alert appears kept the Reset dialog open 5 of
  5 times on layer 12's tree (`22a1d89`, where the flake was 2 of 40) and closed it 5 of 5 times
  there with A3's change. On `e6f7e7e` the probe closes it 5 of 5 times unchanged, and the test
  passed 40 of 40 runs on CI's browser and 60 of 60 on the full Chrome
  (`--grep "frozen base currency"` with `--repeat-each=40` and `--repeat-each=60`, four workers),
  and 20 of 20 with A3 applied, twice (`--repeat-each=20 --workers=4`, about 2 min each). What is
  proven: the mechanism at both edges of a submit (the old tree, and the project's react-dom under
  jsdom, where A3's six tests are RED on `e6f7e7e`), and that the change closes it. What is not: a
  natural failure on `e6f7e7e`, which no run here produced, and what hides the window there:
  something on Next 16.4's server-action path, not React's scheduler (identical to react-dom
  19.3.0's), hides the window in the browser today.
- **The click helpers (A1).** No new race fix is claimed and no amplified loop was run: A1 moves
  eight clicks onto layer 11's helper and shares its wait with a sibling for Popovers (`Grow`, as
  the menu). The Autocomplete clicks share no race (no transition) and stay. A2's self-test kills
  the three helper mutants no repo test kills today (run and listed in A2).
- **Every measured number, and its probe.** Each probe was a throwaway spec, never committed, run
  through the CI-browser wrapper with `--retries=0`, or a one-off command:
  - **The bar** (Pre-flight 5, A5): a spec that fills the invite wizard, sets
    `html { font-size: N% }` and logs the action bar's height (the submit button's parent's
    `getBoundingClientRect().height`), the `header`'s, and `html`'s computed
    `scroll-padding-bottom`. With A5 applied: Access and Review at 375 px with text at 200%, bar
    149, app bar 69, padding 175 px; at 360 px with text at 100%, Access 70 and Review 114
    (padding 140 px); Review at 360 px with text at 150%, 126.25 (padding 153 px). The 0.16 px is
    A5's 200% walk with the fixed 140 px: a stop on Access 0.15625 px under the bar.
  - **The flags and the blank select** (Pre-flight 4, A6): the same spec's Invitation step at
    1440 px logs each label's left edge at 310.28 px and its description's at 281 px (the checkbox
    box 40.28 px wide), and the unset Primary branch display's text, a lone zero-width space.
  - **Recent activity** (Pre-flight 12, Q12): a spec at 375 px on the `overview-ready` scenario
    logs the card at 395.47 px with its real description ("The latest events. Times in
    Africa/Nairobi.", its link's top at 1226.30 px), and at 365.34 px with the skeleton's words in
    its place ("The latest events.", the link back on the first row at 1184.13 px).
  - **The track** (Q13): `contrastRatio(surfaces.tertiary, background.paper)` from
    `theme/contrast.ts` and `theme/tokens.ts`, under Node 24: 1.167 light (`#E8EEF6` on `#FFFFFF`)
    and 1.250 dark (`#1B3048` on `#101E30`).
  - **The lock** (Pre-flight 9): in a worktree, `PORT=3150 pnpm dev`, then `kill -9` of its
    process group: the lock file stayed, and a second `PORT=3150 pnpm dev` printed "Ready in
    449ms"; with that one alive, `PORT=3151 pnpm dev` exited 1 with "Another next dev server is
    already running." and the live server's PID.
  - **The one-branch bell** (A8): the scenario under **PR body guidance** gives "Notifications: 11
    approvals waiting", whose branch entry ends "Ask an administrator who works at institution
    level to activate them."; `approvals` ends it "Switch to All branches to activate them.".
  - **The outlined Alert** (A4): on `selection-forbidden`, the Alert focused after a key press
    matches `:focus-visible`, with a solid 2 px ring at a 2 px offset beside its solid 1 px
    border: `rgb(47, 109, 242)` light and `rgb(120, 165, 255)` dark.
  - **The summary's spacing** (Pre-flight 12, B1): B1's own e2e RED,
    `between entries 4 px, inside one 2 px`.
- **Executability (what ran).** The plan was replayed from this file's own text, as formatted by
  the repository's Prettier, by a script that applies each task's blocks in the dependency
  table's order (every old block matched exactly once):
  - **Part A on `e6f7e7e`** (a throwaway worktree, `pnpm install --frozen-lockfile`): after each
    task's Step 1, its unit RED as the plan says (A3 6 failed, A4 1, A5 1, A6 1, A8 2), then GREEN
    (A3 37 with no warning, A4 126 in `theme/`, A5 7, A6 15, A7 20, A8 23, A9 9 with no notice left
    and no comment naming the old config), prettier and ESLint on the task's files after each task;
    the final tree is byte-identical to the files the e2e ran on. Then `pnpm check` (format, lint,
    `tsc`, the full Vitest run: **230 files, 2,445 tests**, and no Vite or jsdom notice) and
    `pnpm build`: exit 0. The unit mutation proofs named in A3–A8 were applied one at a time on that
    tree and reverted: each failed its named tests (A3: only that component's two; A5: the floor 2
    tests, the gap 1; A6, A7, A8, A4: 1 each).
  - **Part B on `8258e3e`** (a second worktree): Part A replayed first (every block applied; its
    code files byte-identical to main's; its README and AGENTS.md paragraphs applied beside #69's),
    then B1 and B2; B2's RED 5 failed, GREEN 10 files, 129 tests; `tsc` with `canSwitch` required
    and `readiness-rules.ts`'s call unchanged: `TS2345` there and at the five test calls; then
    `pnpm check` (**238 files, 2,562 tests**) and `pnpm build`: exit 0.
  - **E2E on CI's browser** (`chrome-headless-shell` 156, `CI=true`, `--retries=0`, one worker
    unless stated, no listener on 3100 or 3199 before a run). Before review 1, on the replayed Part
    A tree: `click-helpers`, `context`, `profile`, `settings` 41 passed and 1 skipped (BG-04, 3.4
    min); `users-invite` behaviour 15 (2.1 min) and accessibility 32 (3.5 min); `users` 42 (6.7
    min); `approvals` 63 (6.0 min); `platform-records` 54 (4.3 min); `platform-tenants`,
    `business-date`, `branches` 46 (6.1 min); `roles`, `shell` 34 (4.4 min): **327 passed, 0
    failed**. On the replayed Part A + B tree: the overview's cards 9 (0.8 min), its accessibility
    matrix and fake spec 16 + 6 (1.3 min), `shell`, `audit`, `context`, `protected-routes` 45 (3.7
    min), `approvals` 63 (6.2 min): **139 passed, 0 failed**. After review 1, which changed only
    A3's tests and comments, A5's e2e case, A9's comments and glob, B2's required input and README's
    lock sentence (every other e2e and app file byte-identical to the runs above): `settings` and
    the keyboard walk 14 passed and 1 skipped (1.7 min); `business-date`, `branches` 27 (3.3 min);
    the formerly flaky test at `--repeat-each=20 --workers=4`, 20 of 20 in each of two runs (1.8 and
    2.0 min); and on A + B the overview's cards 9 (0.7 min): **90 passed, 0 failed**. A5's 200% case
    was also run RED with the fixed 140 px (`Received: 140`).
  - **E2E RED and mutation proofs** (on the draft tree, whose files are byte-identical to the
    replayed ones): A5's 200% case with the fixed 140 px (now `Received: 140` at the mechanism;
    before it, −0.16 px under the bar); A6's two pins with each fix reverted (the zero-width
    space; 29.28 px); A7's two e2e mutants (both fail); A2's three helper mutants (four tests
    fail, the endless-animation test passes); B1's two pins with its fix reverted (the note's old
    words; 4 px against 6).
- **Not run:** the full Playwright suite (the gate's: about 33 minutes in three shards on layer
  14's gate), the visual and keyboard pass and its screenshots, `pnpm test:coverage`, anything
  against the real backend, a natural reproduction of the settings flake on `e6f7e7e`, and a
  committed e2e for A8's and B2's new words (no committed scenario has a one-branch account with
  the branch codes; the screenshot's scenario was probed, not committed).
- **L1–L8.** No read changes (L1). Each test signs in to its own scenario run, `exact` names,
  `expectHydrated` before clicks, chunkable titles (L3; A2's static page excepted, Q1). The copy
  says what holds: the bell's new sentence gives the queue's advice (the queue's note asks the
  administrator to review the branches, the bell to activate them) (L4). One commit per task on a
  clean tree, prettier settled (L5). No dotted `color`, no function prop across a server boundary
  (A6's `LABEL_INDENT` is an `sx` callback in a `'use client'` file), no new `'use client'` file
  (L6). Every e2e run above used CI's browser with `--retries=0` (L7). Ports checked in
  `/proc/net/tcp`; servers stopped by pid (L8).
- **No model names or scratch paths** in the plan's code, docs or commit blocks; the trailers are
  exact.
