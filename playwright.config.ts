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
  // `pnpm test:e2e:keycloak` (playwright.keycloak.config.ts).
  testIgnore: /keycloak-smoke\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // One worker locally too, as on CI. Measured in layer 06 (Task 6): at the default 4 workers
  // every spec slowed (median click 1.1-1.7 s), the full suite took 6.6-10.1 min and audit.spec
  // timed out; on one worker it ran 76/76 in 3.0 min.
  // ponytail: serial by default; re-measure before raising it on another machine.
  workers: 1,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
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
