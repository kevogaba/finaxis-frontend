# End-to-end suite on the production build, in parallel — Design

**Date:** 2026-11-16
**Status:** Approved (2026-11-16)
**Stack base:** #87, the dependency upgrade (branch `ccr-3a82fef5-f6m2hf`, superseding #86)

## 1. Why

CI's `End-to-end tests` step takes 25–34 minutes: the last green run (`admin-parity/wcag-text-resize`,
2026-10-21) ran 505 Playwright tests on one worker in 33.6 minutes (504 passed, 1 skipped, none
flaky). The allocated budget for that step is **10 minutes** on the same machine shape (GitHub's
`ubuntu-latest`, 4 vCPU, 16 GB). The fix must not reduce test quality; where it can, it should raise
it.

## 2. Goals, non-goals, anti-goals

**Goals**

- The CI `End-to-end tests` step finishes in **≤ 10 minutes** (aim: ≤ 8, for headroom as the suite
  grows), measured on CI, not only locally. The budget is reported, not enforced: no
  `timeout-minutes` cap on the step; each PR in the stack states its measured step time _(decided
  by the user)_.
- End-to-end tests exercise the **production build** — the code that ships — instead of `next dev`.
- A flaky test **fails the run**: one retry is kept only to capture a trace (Playwright
  `failOnFlakyTests`). Today two retries let a flaky test pass silently.
- Every existing test keeps running with its assertions; the accessibility matrix (light/dark ×
  desktop/375 px) stays whole.

**Non-goals**

- Unit-test duration (3–4.4 min) and browser-install time (0.3–5.6 min): outside the e2e step's
  budget. Worth a later look, not part of this stack.
- Sharding across several CI machines (see §8 for what happens if the budget is still missed).
- The manual real-Keycloak smoke config (`playwright.keycloak.config.ts`).

**Anti-goals — a failure even if the suite gets fast**

- The login bypass reachable in any build that could be deployed (`pnpm build`, the Dockerfile, the
  Release workflow), whatever runtime environment it is given.
- Tests deleted, merged, skipped, or assertions loosened to save time.
- Retries that hide flakiness.
- `pnpm test:e2e` no longer working locally as one command.

## 3. Current state

- `playwright.config.ts` starts the fake API and **`pnpm dev`** (`next dev`), with `workers: 1` and
  `retries: CI ? 2 : 0`. Its comment records why: at four workers every spec slowed and audit.spec
  timed out, because workers contended for the dev server's on-demand compilation.
- The bypass gate, `auth/e2e-test-mode.ts`'s `isE2eTestMode()`, is
  `FINAXIS_E2E_TEST_MODE === '1' && NODE_ENV !== 'production'`. Next's standalone server forces
  `NODE_ENV=production`, so the bypass cannot work against a production build — which is why e2e
  uses `next dev`, while CI's `Build` step builds the production app and then never tests it.
- Each authenticated test already gets its own isolated fake-API backend: `authenticate()` sets a
  `finaxis_e2e_run` cookie holding `<scenario>.<uuid>`, which the app forwards as the fake API's
  bearer token. Tests are therefore parallel-safe by construction (to be audited, §5.4).
- The suite is sized for a cold dev server: 251 assertions wait 15 s, 20 wait 20 s, about 36 test
  groups raise their timeout to 60–90 s, and 58 comments cite cold `next dev` compiles as the
  reason. `expectHydrated` polls 20 s for React to hydrate an element.
- Running the production build locally already has a mechanism: `FINAXIS_ALLOW_INSECURE_LOCAL_ORIGINS=1`
  (`config/env.server.ts`) relaxes the HTTPS and Redis production requirements for local origins.

## 4. Approaches considered

| Approach                             | What it does                                                                                                                                          | Trade-offs                                                                                                                                                                                                                 | Verdict    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **A. Production build, in parallel** | E2E runs against a production build whose bypass is compiled in only by a build-time switch; 3–4 workers; tighter waits; retry once and fail on flaky | Tests what ships (production React, minified bundles, the real CSP without `unsafe-eval`); a cheap production server lets workers run in parallel; costs one extra ~40 s build; touches the security-sensitive bypass gate | **Picked** |
| B. Warm `next dev`, in parallel      | Pre-compile every route before tests, cache Turbopack's dev cache across CI runs, 2–3 workers                                                         | Bypass gate untouched, but still dev-mode React (slower, StrictMode double renders), compile timing remains a flakiness source, still not testing what ships; uncertain to reach 10 min                                    | Rejected   |
| C. Shard across CI machines          | Split the unchanged suite over ~4 CI jobs                                                                                                             | No app change, but ~4× runner-minutes, each shard still pays the cold dev compile, quality unchanged; meets the budget by dividing rather than fixing                                                                      | Rejected   |

## 5. Design

### 5.1 A build-time switch for the bypass

- `next build` run with `FINAXIS_E2E_BUILD=1` produces the **e2e build**. `next.config.ts` passes
  the switch through its `env` option, which Next inlines into the bundles at build time, so the
  value is fixed when the build is made: `'1'` in the e2e build, empty in every other build.
- The gate becomes: runtime `FINAXIS_E2E_TEST_MODE === '1'` **and** (`NODE_ENV !== 'production'`
  **or** the build-time switch is `'1'`). Development keeps today's behaviour. In a normal
  production build the switch is an inlined empty string, so no runtime environment can turn the
  bypass on — two keys, one of which only exists at build time.
- The e2e build writes to its own output directory, `.next-e2e` (`distDir` keyed on the same
  switch), so it never overwrites or is mistaken for `.next`, which `pnpm start`, the Dockerfile
  and the Release workflow use. `postbuild`'s static-asset copy follows the active directory.
- New script `build:e2e`.

### 5.2 A guard that the normal production build refuses the bypass

- **Behavioural check in CI**, after the existing `Build` step: start the normal standalone build
  with every runtime e2e setting (`FINAXIS_E2E_TEST_MODE=1`, the e2e session and run cookies),
  request a protected page, and assert it is sent to `/login`. This proves the security property
  itself, rather than searching bundles for strings. It fails the run if the switch ever leaks into
  a normal build. (Today nothing checks this beyond a unit test of `NODE_ENV`.)
- **Unit tests** in `auth/e2e-test-mode.test.ts` cover the gate's truth table: production without
  the switch is inert even with the runtime flag; production with the switch needs the runtime flag
  too; development behaves as today.

### 5.3 Playwright serves the e2e build

- The app web server becomes `node .next-e2e/standalone/server.js` on port 3100 with
  `FINAXIS_E2E_TEST_MODE=1`, `FINAXIS_ALLOW_INSECURE_LOCAL_ORIGINS=1`, the fake API's URL and the
  platform organisation id — the same environment the dev server gets today.
- `pnpm test:e2e` stays one command locally: it runs `build:e2e`, then Playwright. CI runs
  `build:e2e` as its own step before `End-to-end tests`, so the step's time is the suite's; the
  PR description reports both numbers.
- `E2E_DEV_SERVER=1` keeps the `next dev` path available for iterating on a spec locally without a
  rebuild after each app change. CI never sets it. _(My call: rebuilding for every app edit would
  make spec-writing painful; the dev path costs one branch in the config.)_

### 5.4 Parallel workers, strict about flakiness

- `workers` scales with the machine: one worker per logical CPU (`workers: '100%'`, Playwright's
  percentage form), so a 2-CPU machine runs 2, a 4-CPU runner 4, an 8-CPU laptop 8 _(decided by
  the user)_. The app server and the fake API share those cores, so the benchmark on a 4-core,
  16 GB box checks that one-per-CPU is not slower or flakier than one fewer; if it is, that finding
  goes back to the user before any change to the rule. The measurements go in the config comment,
  the way the current one's do.
- `retries: CI ? 1 : 0` with `failOnFlakyTests: !!CI`; `trace: 'on-first-retry'` stays.
  `video` changed from `'retain-on-failure'` to `'on-first-retry'` in a fourth stacked PR _(decided
  by the user after PR 3's CI e2e step ran 11.1 min)_: recording every test's video competed with
  the workers for CI's four vCPUs; a flaky test's failed first attempt now keeps its error,
  screenshot and ARIA snapshot, but no video.
- Audit for shared state before raising workers: any test that reuses a fixed fake-API run (e.g.
  the `default.shared` fallback) or a process-wide fake-API value gets its own run. Coupling that
  parallelism exposes is fixed in the test or the fake, never hidden by serialising the spec.

### 5.5 Waits sized for what the test is about

- Waits whose stated reason is a cold `next dev` compile return to Playwright's defaults (5 s per
  assertion, 30 s per test). A wait that stays longer keeps a comment naming its production-relevant
  reason (an animation, a deliberate server delay). Comments that cite cold compiles are rewritten.
- `expectHydrated` stays — hydration still happens in production — with a default-sized timeout.
- Tightening is measured like 5.4: three full green runs with no flaky tests.

### 5.6 Both workflows, and the evidence kept

- `ci.yml` (every non-`main` push, so every PR) and `release.yml` (`main`) get the same steps: the
  `build:e2e` step, the guard (§5.2) after the normal build, and the e2e step. The PR run is the
  gate that matters, since it runs before merge; the Release run keeps `main` honest. _(My call:
  the two workflows already mirror each other step for step.)_
- `main` uses the same flaky policy as PRs: retry once, fail if any test was flaky _(decided by the
  user)_. Release does not gate deployment (Coolify deploys `main` regardless), so on `main` it is
  a signal, not a gate.
- `ci.yml` uploads the Playwright report and the retry's trace on failure, as `release.yml`
  already does; without it the one retry kept for diagnosis would leave nothing to diagnose with.
  _(My call.)_
- `.next-e2e` is ignored by git, Docker (`.dockerignore`), TypeScript, ESLint and Prettier, like
  `.next`. _(My call.)_

### 5.7 Documentation

`README.md`'s end-to-end section, `AGENTS.md`'s E2E rule, and `playwright.config.ts`'s comments
describe the production-build run, the build-time switch and its guard, the worker count with its
measurements, and the flaky policy.

## 6. The stack

| PR                                     | Base   | Contents                              | Exit check                                                              |
| -------------------------------------- | ------ | ------------------------------------- | ----------------------------------------------------------------------- |
| 0. Dependency upgrade (supersedes #86) | `main` | the upgrade and its lint fix          | CI green; its e2e step time is the **baseline** on the new dependencies |
| 1. E2E on the production build         | PR 0   | 5.1, 5.2, 5.3, 5.6; workers stay at 1 | CI green; e2e step time compared with PR 0's                            |
| 2. Parallel workers, fail on flaky     | PR 1   | 5.4                                   | CI e2e step ≤ 10 min, no flaky tests                                    |
| 3. Waits sized for production          | PR 2   | 5.5, 5.7                              | CI e2e step ≤ 10 min, no flaky tests                                    |

PR 2 carries the budget: tighter waits (PR 3) make failures faster and slowness visible, but barely
shorten a passing run, since a wait returns as soon as its condition holds.

**If PR 2 still misses 10 minutes on CI:** stop and report the measured time and where it goes;
the user chooses the next lever (for example sharding, or setting context through the fake API in
tests not about context selection). Nothing beyond this design is built on a guess _(decided by
the user)_.

Branches (my call): `ccr-3a82fef5-f6m2hf-e2e-1-prod-build`, `…-e2e-2-parallel`,
`…-e2e-3-waits`, each a draft PR based on the previous branch.

## 7. Verification

- Same test count (505) and the same single skip, all passing.
- No flaky tests across three consecutive full local runs at the chosen worker count, then CI green.
- The guard is shown to bite: in PR 1, a normal build made with the switch accidentally on fails
  the guard (demonstrated once, recorded in the PR description).
- `pnpm check`, `pnpm build` and `pnpm test:e2e` green on every PR.

## 8. Risks

- **Inlining in server bundles:** that `next.config` `env` reaches Turbopack's server bundles must be
  confirmed for Next 16.4; the guard and an e2e run of the e2e build prove it either way.
- **Production-only behaviour:** the production build may surface real differences (secure
  cookies, HSTS, the CSP without `unsafe-eval`). They are fixed in the app, or the test is corrected
  to the production truth — never papered over.
- **Browser build:** this container's Chromium (build 1243) is older than Playwright 1.65's (1254),
  which can shift layout by a few pixels; CI's run is authoritative.
- **CPU ceiling:** one worker per CPU leaves no core to the app server and fake API; the
  benchmark (§5.4) shows whether that costs time or stability, and any change goes back to the
  user.

## 9. Left to the builder

The guard's form (a small Node script or a dedicated Playwright project) and how the e2e build is
started in Playwright's `webServer`.
