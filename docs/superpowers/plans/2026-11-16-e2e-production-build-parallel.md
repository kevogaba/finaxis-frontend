# End-to-end suite on the production build, in parallel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring CI's `End-to-end tests` step from ~34 min to ≤ 10 min by running Playwright against a
production build in parallel, while making the suite stricter (production code, fail on flaky,
waits sized for what each test is about).

**Architecture:** A build-time switch (`FINAXIS_E2E_BUILD=1`) produces an e2e flavour of the
production build in `.next-e2e`, the only build in which the login bypass can turn on; every
normal build compiles the bypass out, and a browser guard proves it against the real normal build
in CI. Playwright serves the e2e build from its standalone `server.js`, one worker per CPU, retry
once and fail on flaky.

**Tech Stack:** Next.js 16.4 (Turbopack, `output: 'standalone'`), Playwright 1.65, Vitest 4,
GitHub Actions, pnpm 12, Node ≥ 24.15.

**Spec:** `docs/superpowers/specs/2026-11-16-e2e-production-build-parallel-design.md`

## Global Constraints

- CI's `End-to-end tests` step ≤ 10 min on `ubuntu-latest` (4 vCPU, 16 GB); aim ≤ 8. Reported in
  each PR, not enforced with `timeout-minutes`.
- If PR 2's CI e2e step is still over 10 min: stop and report the measurement; build nothing
  beyond this plan.
- Same tests (505) and the same single skip, all passing; no test deleted, merged, skipped, or
  loosened.
- `workers: '100%'` (one per logical CPU). `retries: CI ? 1 : 0`, `failOnFlakyTests: !!CI` — on
  PRs and on `main` alike.
- The bypass must be unreachable in any normal build (`pnpm build`, Dockerfile, Release), whatever
  runtime environment it gets.
- Repo rules (`AGENTS.md`): `pnpm check` after every change, `pnpm test:e2e` when rendered UI or
  the e2e setup changes; no `@ts-ignore`/`@ts-nocheck`/unsafe `any`/rule-disabling; fake-API files
  run under plain `node`; update `README.md` and `AGENTS.md` when the architecture changes.
- Commits end with the session's attribution lines. Push only the stack's branches.
- Every PR's description documents, under these headings: **Improvements** (what changed for
  speed and for quality), **Strategy** (why this approach, what was rejected), and **Time saved**
  (CI `End-to-end tests` step: before → after, minutes saved against the previous PR and against
  #87's baseline, with local measurements labelled as local) _(requested by the user)_.

## Review Focus

1. **`FINAXIS_E2E_BUILD` in a `.env*` file.** Next loads `.env*` before evaluating `next.config.ts`,
   so the switch there turns every `pnpm build` into an e2e build. Expected: the build lands in
   `.next-e2e`, `.next/standalone` does not exist, and the Dockerfile and the guard fail loudly
   rather than ship it. Pinned by Task 4's guard-without-a-normal-build step and Task 6's docs.
2. **A server already listening on :3100 locally** (a forgotten `pnpm dev`). Expected: the run
   refuses to start rather than silently testing that server. Pinned in Task 3
   (`reuseExistingServer: false` outside `E2E_DEV_SERVER`).
3. **A missing or stale `.next-e2e`** when someone runs `pnpm exec playwright test` directly.
   Expected: a missing build fails with "run `pnpm build:e2e`" rather than a 120 s web-server
   timeout; `pnpm test:e2e` always rebuilds. Pinned in Task 3.
4. **A container that exports `HOSTNAME`** (Docker does). Expected: the e2e server still binds to
   loopback. Pinned in Task 3 by setting `HOSTNAME: '127.0.0.1'` explicitly.
5. **Production-only behaviour** (secure-cookie naming, HSTS, the CSP without `unsafe-eval`, the
   generic `error.tsx` instead of the dev overlay). Expected: a test that fails only on the
   production build is fixed in the app or corrected to the production truth, never skipped.
   Pinned by Task 3's full-suite step.

---

## PR 1 — E2E on the production build

Branch `ccr-3a82fef5-f6m2hf-e2e-1-prod-build`, based on `ccr-3a82fef5-f6m2hf` (#87). When #87
merges, retarget the PR to `main` and merge `main` into the branch.

### Task 1: The bypass gate honours a build-time switch

**Files:**

- Modify: `auth/e2e-test-mode.ts` (`isE2eTestMode`)
- Test: `auth/e2e-test-mode.test.ts`

**Interfaces:**

- Produces: the gate reads `process.env.FINAXIS_E2E_BUILD` (`'1'` only in the e2e build; Task 2
  inlines it). Public exports unchanged.

- [ ] **Step 1: Write the failing tests** in the existing `describe('e2e test mode')`:

```ts
it('stays inert in a production build without the e2e build switch, even with the runtime flag', () => {
  vi.stubEnv('FINAXIS_E2E_TEST_MODE', '1');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('FINAXIS_E2E_BUILD', '');
  expect(getE2eAuthenticatedUser(headersWith(session))).toBeNull();
  expect(getE2eAccessToken(headersWith(session))).toBeNull();
  expect(getE2eBetterAuthSession(headersWith(session))).toBeNull();
});

it('turns on in the e2e production build only with the runtime flag too', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('FINAXIS_E2E_BUILD', '1');
  vi.stubEnv('FINAXIS_E2E_TEST_MODE', '1');
  expect(getE2eAuthenticatedUser(headersWith(session))?.id).toBe('e2e-session-user');
  expect(getE2eAccessToken(headersWith({ ...session, [E2E_RUN_COOKIE_NAME]: 'default.abc' }))).toBe(
    'e2e.default.abc',
  );
  vi.stubEnv('FINAXIS_E2E_TEST_MODE', '0');
  expect(getE2eAuthenticatedUser(headersWith(session))).toBeNull();
});

it.each(['true', 'yes', ' 1'])('treats a non-"1" build switch (%s) as off', (value) => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('FINAXIS_E2E_BUILD', value);
  vi.stubEnv('FINAXIS_E2E_TEST_MODE', '1');
  expect(getE2eAuthenticatedUser(headersWith(session))).toBeNull();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run auth/e2e-test-mode.test.ts`
Expected: the "turns on in the e2e production build" test FAILS (bypass returns `null`); the
others pass.

- [ ] **Step 3: Change `isE2eTestMode(): boolean`** to
      `FINAXIS_E2E_TEST_MODE === '1' && (NODE_ENV !== 'production' || FINAXIS_E2E_BUILD === '1')`, each
      read as `process.env.X` directly (not destructured — the build inlines the literal property
      access). Comment: the switch is fixed when the build is made (Task 2), so no runtime environment
      can enable it in a normal build.

- [ ] **Step 4: Run the file, then `pnpm check`**

Expected: all `auth/e2e-test-mode.test.ts` tests PASS; `pnpm check` clean.

- [ ] **Step 5: Commit** — `feat(e2e): let the bypass gate honour a build-time e2e switch`

### Task 2: An e2e build in its own directory

**Files:**

- Modify: `next.config.ts` (export `createNextConfig(env)`; default export uses `process.env`)
- Modify: `package.json` (`build:e2e`)
- Modify: `.gitignore`, `.dockerignore`, `eslint.config.mjs` (ignores), `vitest.config.ts`
  (`exclude`) — each gains `.next-e2e`
- Test: `next.config.test.ts`

**Interfaces:**

- Produces: `createNextConfig(env: { FINAXIS_E2E_BUILD?: string } & CspEnv): NextConfig`;
  `pnpm build:e2e` → `.next-e2e/standalone/server.js` with static assets in
  `.next-e2e/standalone/.next-e2e/static` (and `public/` when present).

- [ ] **Step 1: Write the failing tests** in `next.config.test.ts`:

```ts
describe('the e2e build switch', () => {
  const env = { KEYCLOAK_ISSUER: 'http://localhost:8080/realms/finaxis', NODE_ENV: 'production' };

  it('builds normally into .next and inlines an empty switch', () => {
    const config = createNextConfig(env);
    expect(config.distDir).toBe('.next');
    expect(config.compiler?.defineServer).toEqual({ 'process.env.FINAXIS_E2E_BUILD': '' });
    expect(config.compiler?.define).toBeUndefined();
  });

  it('builds the e2e flavour into .next-e2e and inlines "1" for server code only', () => {
    const config = createNextConfig({ ...env, FINAXIS_E2E_BUILD: '1' });
    expect(config.distDir).toBe('.next-e2e');
    expect(config.compiler?.defineServer).toEqual({ 'process.env.FINAXIS_E2E_BUILD': '1' });
  });

  it.each(['true', '0', ''])('treats %j as a normal build', (value) => {
    expect(createNextConfig({ ...env, FINAXIS_E2E_BUILD: value }).distDir).toBe('.next');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run next.config.test.ts`
Expected: FAIL — `createNextConfig` is not exported.

- [ ] **Step 3: Implement `createNextConfig`** in `next.config.ts`: the existing config plus
      `distDir` and `compiler.defineServer` keyed on `env.FINAXIS_E2E_BUILD === '1'`. Values are raw
      strings — Next JSON-serialises `defineServer` values itself (`next/dist/build/define-env.js`).
      `defineServer`, not `define`: the switch never reaches client bundles. Comment why the e2e build
      gets its own directory (the Dockerfile, `pnpm start` and Release only ever read `.next`).
      `export default createNextConfig(process.env)`.

- [ ] **Step 4: Add the script and the ignores**

`"build:e2e": "FINAXIS_E2E_BUILD=1 next build && if [ -d public ]; then cp -r public .next-e2e/standalone/; fi && cp -r .next-e2e/static .next-e2e/standalone/.next-e2e/"`
(the existing `postbuild` hook only runs after `build`). Add `.next-e2e` / `.next-e2e/**` wherever
`.next` is listed in `.gitignore`, `.dockerignore`, `eslint.config.mjs`'s ignores and
`vitest.config.ts`'s `exclude`.

- [ ] **Step 5: Verify both builds**

Run (with CI's env vars from `.github/workflows/ci.yml` exported): `pnpm build:e2e && pnpm build`
Expected: both succeed; `.next-e2e/standalone/server.js` and `.next/standalone/server.js` exist;
`git status --short` shows no change outside this task's files. If `next build` adds
`.next-e2e/types/**/*.ts` to `tsconfig.json`'s `include`, keep that edit and commit it.

- [ ] **Step 6: `pnpm check`, then commit** — `feat(e2e): build an e2e flavour of the production build into .next-e2e`

### Task 3: Playwright serves the e2e build

**Files:**

- Modify: `playwright.config.ts`
- Modify: `package.json` (`test:e2e`, `test:e2e:ui`)

**Interfaces:**

- Consumes: `.next-e2e/standalone/server.js` (Task 2).
- Produces: `E2E_DEV_SERVER=1` selects today's `pnpm dev` server (local spec-writing only);
  otherwise the e2e build. `test:e2e` = `pnpm build:e2e && playwright test`;
  `test:e2e:ui` = `pnpm build:e2e && playwright test --ui`.

- [ ] **Step 1: Point the app web server at the e2e build.** Unless `E2E_DEV_SERVER === '1'`:
  - if `.next-e2e/standalone/server.js` is missing, throw
    `"No e2e build found: run \`pnpm build:e2e\` first (or \`pnpm test:e2e\`, which builds it)."`
  - `command: 'node --env-file-if-exists=.env.local .next-e2e/standalone/server.js'` (the explicit
    `env` below wins over `.env.local`)
  - `env`: `...process.env`, `PORT: String(PORT)`, `HOSTNAME: '127.0.0.1'`,
    `FINAXIS_E2E_TEST_MODE: '1'`, `FINAXIS_ALLOW_INSECURE_LOCAL_ORIGINS: '1'`,
    `FINAXIS_API_URL: FAKE_API_URL`, `PLATFORM_ORGANISATION_ID: '00000000-0000-0000-0000-000000000000'`
  - `url: baseURL`, `reuseExistingServer: false`, `timeout: 60_000`

  With `E2E_DEV_SERVER=1`, keep today's `pnpm dev` entry unchanged (including
  `reuseExistingServer: !CI`). Workers, retries and timeouts stay as they are in this PR. Replace
  the comment above `webServer` to say which server runs and why.

- [ ] **Step 2: Update the scripts** (`test:e2e`, `test:e2e:ui` as in Interfaces).

- [ ] **Step 3: Smoke-run the suites that touch auth and a heavy admin flow, with an exported
      container `HOSTNAME` (Review Focus 4)**

Run (CI env exported, `CI=1`): `pnpm build:e2e && HOSTNAME=some-container pnpm exec playwright test e2e/login.spec.ts e2e/protected-routes.spec.ts e2e/users.spec.ts --retries=0`
Expected: all pass. A failure that only happens on the production build is a Review Focus 5 case:
find the production-only cause and fix the app or correct the test to the production truth.

- [ ] **Step 4: Check the missing-build message and a busy port (Review Focus 2 and 3)**

Run: `mv .next-e2e .next-e2e.hidden && pnpm exec playwright test e2e/login.spec.ts; mv .next-e2e.hidden .next-e2e`
Expected: fails immediately with the "No e2e build found" message.
Run: `(python3 -m http.server 3100 >/dev/null 2>&1 &) ; pnpm exec playwright test e2e/login.spec.ts; pkill -f "http.server 3100"`
Expected: refuses to start because port 3100 is already used, instead of testing that server.

- [ ] **Step 5: Full suite, one worker, recorded**

Run (CI env, `CI=1`): `pnpm test:e2e`
Expected: 504 passed, 1 skipped. Record the wall time for the PR description (compare with #87's
CI e2e step).

- [ ] **Step 6: `pnpm check`, then commit** — `feat(e2e): run Playwright against the e2e production build`

### Task 4: The guard — the normal production build ignores the bypass

**Files:**

- Create: `playwright.guard.config.ts`
- Create: `e2e/guard/production-bypass-inert.spec.ts`
- Modify: `playwright.config.ts` (`testIgnore` also skips `e2e/guard/`)
- Modify: `package.json` (`test:e2e:guard`: `playwright test --config=playwright.guard.config.ts`)

**Interfaces:**

- Consumes: `.next/standalone/server.js` (normal `pnpm build`); `authenticate()` from
  `e2e/support/auth.ts`.
- Produces: `pnpm test:e2e:guard` — exits non-zero if the bypass works on the normal build.
  `GUARD_DIST_DIR` (default `.next`) exists only to prove the guard bites (Step 3).

- [ ] **Step 1: Write the spec** `e2e/guard/production-bypass-inert.spec.ts`:

```ts
for (const path of ['/profile', '/admin', '/platform-admin']) {
  test(`the production build ignores the e2e session bypass at ${path}`, async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await page.goto(path);
    await expect(page).toHaveURL((url) => url.pathname === '/login');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
}
```

A browser check, not a status-code check: behind the root loading boundary a layout's
`redirect()` can answer 200 and redirect on the client.

- [ ] **Step 2: Write `playwright.guard.config.ts`** — `testDir: './e2e/guard'`, chromium only,
      `workers: 1`, `retries: 0`, `forbidOnly: !!CI`, `baseURL` `http://localhost:3100`; one web server:
      `node --env-file-if-exists=.env.local <GUARD_DIST_DIR>/standalone/server.js` with the same `env`
      as Task 3's server (every
      runtime e2e setting on), `reuseExistingServer: false`; throw
      `"No production build found: run \`pnpm build\` first."` when the server file is missing. No
      fake API: with the bypass off, nothing calls it.

- [ ] **Step 3: Prove it bites, then passes**

Run: `GUARD_DIST_DIR=.next-e2e pnpm test:e2e:guard`
Expected: FAIL — 3 tests, each landing on the authenticated page instead of `/login`.
Run: `pnpm build && pnpm test:e2e:guard`
Expected: 3 passed. Record both outputs for the PR description.

- [ ] **Step 4: Check a missing normal build (Review Focus 1)**

Run: `mv .next .next.hidden && pnpm test:e2e:guard; mv .next.hidden .next`
Expected: fails immediately with the "No production build found" message.

- [ ] **Step 5: `pnpm check`, then commit** — `test(e2e): guard that the production build ignores the e2e bypass`

### Task 5: Both workflows build, guard and test

**Files:**

- Modify: `.github/workflows/ci.yml`, `.github/workflows/release.yml`

- [ ] **Step 1: Reorder and add steps in both workflows**, after `Build`:
  1. `Install Playwright browsers` (moved up; unchanged command)
  2. `Check the production build ignores the e2e bypass` — `pnpm test:e2e:guard`
  3. `Build for end-to-end tests` — `pnpm build:e2e`
  4. `End-to-end tests` — `pnpm exec playwright test` (not `pnpm test:e2e`, which would build again)

  In `ci.yml`, add the `Upload Playwright report` step exactly as `release.yml` has it
  (`if: ${{ !cancelled() }}`, `playwright-report/`, 7 days) so a retry's trace is kept.

- [ ] **Step 2: Validate the YAML**

Run: `python3 -c "import yaml; [yaml.safe_load(open(f'.github/workflows/{f}.yml')) for f in ('ci', 'release')]"`
Expected: no error. (CI's run on the PR is the real check.)

- [ ] **Step 3: Commit** — `ci: guard the production build and run e2e against the e2e build`

### Task 6: Documentation, then PR 1

**Files:**

- Modify: `README.md` (end-to-end sections), `AGENTS.md` (E2E and authentication rules),
  `docs/authentication/security.md` (E2E section)
- Add: this plan and the design under `docs/superpowers/`

- [ ] **Step 1: Update the docs.** README: `pnpm test:e2e` builds the e2e flavour and serves it;
      `E2E_DEV_SERVER=1` for spec-writing; `pnpm test:e2e:guard`; never set `FINAXIS_E2E_BUILD` in a
      `.env*` file. AGENTS.md: e2e runs against the `.next-e2e` production build; the bypass gate
      needs the runtime flag and, in production, the build-time switch — never widen it; the guard
      must stay in both workflows. security.md: the gate's truth table and the guard.

- [ ] **Step 2: Verify**

Run: `pnpm check && pnpm build && pnpm test:e2e:guard && pnpm test:e2e` (CI env, `CI=1`)
Expected: all green; 504 passed, 1 skipped.

- [ ] **Step 3: Commit, push, open PR 1** (draft, base `ccr-3a82fef5-f6m2hf`), describing the
      switch, the guard's bite-then-pass output, and local and CI e2e step times next to #87's.
      Subscribe to its activity.

---

## PR 2 — Parallel workers, fail on flaky

Branch `ccr-3a82fef5-f6m2hf-e2e-2-parallel`, based on PR 1's branch.

### Task 7: No test shares fake-API state with another

**Files:**

- Modify: only specs or fake-API modules the audit finds coupled

- [ ] **Step 1: Audit.** Find tests that can share a backend run: no `authenticate()` yet a session
      cookie (falls back to `default.shared`); fixed bearer tokens in `e2e/fake-api-*.spec.ts`
      (`e2e.<scenario>.` without a UUID); and module-level mutable state in `e2e/fake-api/*.mts` not
      keyed by run. List each finding with file:line.

- [ ] **Step 2: For each finding, give the test its own run** (a UUID-suffixed token or
      `authenticate()`), or key the fake's state by run. Never serialise a spec to hide it.

- [ ] **Step 3: Prove it under parallelism**

Run (CI env, `CI=1`): `pnpm build:e2e && pnpm exec playwright test --workers=4 --retries=0 --repeat-each=2 <each spec the audit touched>`
Expected: all pass.

- [ ] **Step 4: `pnpm check`, then commit** — `test(e2e): give every test its own fake-API run`
      (skip the commit if the audit found nothing; say so in the PR).

### Task 8: One worker per CPU, retry once, fail on flaky

**Files:**

- Modify: `playwright.config.ts`, `README.md` ("Running the end-to-end suite as CI does"),
  `AGENTS.md` (if it states the worker count)

- [ ] **Step 1: Set** `workers: '100%'`, `retries: process.env.CI ? 1 : 0`,
      `failOnFlakyTests: !!process.env.CI`. Keep `fullyParallel`, `trace: 'on-first-retry'`,
      `video: 'retain-on-failure'`.

- [ ] **Step 2: Benchmark** on this 4-CPU, 16 GB container, CI env, `CI=1`:
      three full runs of `pnpm exec playwright test` (4 workers), then one with `--workers=3`.
      Expected: three green runs, none flaky. Record each wall time.
      If 3 workers is clearly faster or steadier than 4, report it to the user before changing the rule.

- [ ] **Step 3: Replace the config's worker comment** with the rule and these measurements; update
      README's CI section (one retry, flaky fails the run, workers per CPU).

- [ ] **Step 4: `pnpm check`, commit, push, open PR 2** (draft, base PR 1's branch) with the
      benchmark table. Subscribe.

- [ ] **Step 5: Read PR 2's CI e2e step time.** ≤ 10 min: continue. Over 10 min: stop and report
      the time and where it goes; do not start PR 3.

---

## PR 3 — Waits sized for production

Branch `ccr-3a82fef5-f6m2hf-e2e-3-waits`, based on PR 2's branch.

### Task 9: Inventory every long wait

**Files:**

- Create: `docs/superpowers/plans/2026-11-16-e2e-waits-inventory.md`

- [ ] **Step 1: List** every `timeout:` ≥ 10 000, `test.describe.configure({ timeout })`,
      `test.setTimeout`, and fixed sleep (`setTimeout`/`waitForTimeout`) in `e2e/**/*.ts`, with
      file:line, value, and the reason its comment gives.

- [ ] **Step 2: Classify each** as _cold compile_ (remove) or _production reason_ (keep, with the
      reason it will state). Commit — `docs(e2e): inventory long waits`.

### Task 10: Return cold-compile waits to Playwright's defaults

**Files:**

- Modify: the specs and `e2e/support/*.ts` the inventory lists

- [ ] **Step 1: Remove** every _cold compile_ wait (defaults: 5 s per assertion, 30 s per test).
      Keep `expectHydrated` with a default-sized poll. Rewrite comments that cite cold `next dev`
      compiles. Keep each _production reason_ wait with its comment.

- [ ] **Step 2: Verify under load**

Run (CI env, `CI=1`): `pnpm build:e2e`, then three full `pnpm exec playwright test` runs.
Expected: three green runs, none flaky. If failures trace to assertion latency under load, raise
the project-level `expect: { timeout }` once, to the smallest value that is green three times,
with the measurement in its comment — never per-call.

- [ ] **Step 3: `pnpm check`, commit** — `test(e2e): size waits for the production server`

### Task 11: Documentation, then PR 3

**Files:**

- Modify: `README.md`, `AGENTS.md`, `playwright.config.ts` comments

- [ ] **Step 1: Update** what Tasks 9–10 changed (wait policy: defaults unless a stated production
      reason; no per-call cold-compile allowances).

- [ ] **Step 2: Verify** — `pnpm check && pnpm test:e2e` (CI env, `CI=1`). Expected: green.

- [ ] **Step 3: Commit, push, open PR 3** (draft, base PR 2's branch) with the three run times and
      CI's e2e step time. Subscribe.
