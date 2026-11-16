import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/** The e2e build's standalone server, relative to the repository root (where pnpm runs). */
const E2E_SERVER = '.next-e2e/standalone/server.js';
const PORT = Number(process.env.PORT) || 3100;
const baseURL = `http://localhost:${PORT}`;
const FAKE_API_PORT = process.env.FAKE_API_PORT ?? '3199';
const FAKE_API_URL = `http://127.0.0.1:${FAKE_API_PORT}`;
process.env.FINAXIS_E2E_TEST_MODE = '1';

export default defineConfig({
  testDir: './e2e',
  // The real-Keycloak smoke test is separate and manually invoked via
  // `pnpm test:e2e:keycloak` (playwright.keycloak.config.ts); the guard specs run against the
  // normal production build via `pnpm test:e2e:guard` (playwright.guard.config.ts).
  testIgnore: [/keycloak-smoke\.spec\.ts/, /[\\/]e2e[\\/]guard[\\/]/],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One retry on CI: it tells a flaky test from a hard failure and records a trace
  // (`trace: 'on-first-retry'`), and a test that needed it fails the run — a flaky test is a
  // failure to fix, never a pass.
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  // One worker per logical CPU against the production build (2 on a 2-CPU machine, 4 on CI's
  // 4-vCPU runner, 8 on an 8-CPU laptop; `--workers=N` lowers it). Each test owns its fake-API run,
  // and the production server has no on-demand compile for workers to contend for. `next dev`
  // (E2E_DEV_SERVER=1) has one, so it keeps a single worker: at 4 its clicks slowed to 1.1-1.7 s
  // and audit.spec timed out.
  // Measured on a 4-CPU, 16 GB machine with CI=1 but video off and an older local Chromium (build
  // 1243): 4 workers ran the full suite in 8.3, 7.7 and 7.6 min (504 passed, none flaky), 3 in
  // 8.4 min, 1 in 19.7 min. On CI, 1 worker took 16.6 min.
  workers: process.env.E2E_DEV_SERVER === '1' ? 1 : '100%',
  // Waits are Playwright's defaults (5 s per assertion, 30 s per test) against the production build.
  // `next dev` (E2E_DEV_SERVER=1, local spec-writing only) compiles each route on its first visit,
  // which takes tens of seconds, so that mode alone gets one allowance here — never per call.
  ...(process.env.E2E_DEV_SERVER === '1' && { timeout: 120_000, expect: { timeout: 45_000 } }),
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Video only on the retry: `retain-on-failure` records every test's video and discards the
    // passing ones, encoding 500+ videos on the same CPUs the workers run on. A failing test's
    // retry is still recorded (with its trace); its first attempt keeps the screenshot and error.
    video: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Zero-dependency fake of the platform API (e2e/fake-api); state is isolated per test run.
      command: 'node e2e/fake-api/server.mts',
      env: { FAKE_API_PORT },
      url: `${FAKE_API_URL}/__health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    appServer(),
  ],
});

/**
 * The app under test: the e2e flavour of the production build (`pnpm build:e2e`, served from its
 * standalone `server.js`), so the suite exercises the code that ships — production React, minified
 * bundles, the production CSP. Its session bypass exists only because that build was made with
 * `FINAXIS_E2E_BUILD=1` (next.config.ts); every backend call goes to the fake API, and
 * PLATFORM_ORGANISATION_ID matches the fake API's reserved organisation.
 * `E2E_DEV_SERVER=1` swaps in `next dev` for writing a spec without rebuilding after each app
 * change. CI never sets it.
 */
function appServer() {
  const env = {
    ...process.env,
    FINAXIS_E2E_TEST_MODE: '1',
    FINAXIS_API_URL: FAKE_API_URL,
    PLATFORM_ORGANISATION_ID: '00000000-0000-0000-0000-000000000000',
  };

  if (process.env.E2E_DEV_SERVER === '1') {
    return {
      command: 'pnpm dev',
      env,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    };
  }

  if (!existsSync(E2E_SERVER)) {
    throw new Error(
      'No e2e build found: run `pnpm build:e2e` first (or `pnpm test:e2e`, which builds it).',
    );
  }

  return {
    // `.env.local` supplies local auth settings the way `next dev` would load them; the explicit
    // `env` below wins over it.
    command: `node --env-file-if-exists=.env.local ${E2E_SERVER}`,
    env: {
      ...env,
      PORT: String(PORT),
      // Loopback only, whatever HOSTNAME a container exports: this server accepts the bypass.
      HOSTNAME: '127.0.0.1',
      // Plain HTTP on localhost for a production build (config/env.server.ts).
      FINAXIS_ALLOW_INSECURE_LOCAL_ORIGINS: '1',
    },
    url: baseURL,
    // Never test a server this run did not start (a forgotten `pnpm dev`, an older build).
    reuseExistingServer: false,
    timeout: 60_000,
  };
}
