import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * The guard: the normal production build (`pnpm build` — what `pnpm start`, the Dockerfile and the
 * Release workflow ship) must ignore the e2e session bypass whatever runtime environment it gets.
 * Every runtime e2e setting is switched on below; only the build-time switch, compiled out of a
 * normal build (next.config.ts), keeps the bypass off. Run by `pnpm test:e2e:guard` in CI after
 * `pnpm build`.
 *
 * `GUARD_DIST_DIR=.next-e2e` points it at the e2e build instead, to show the guard fails there.
 * No fake API: with the bypass off, nothing calls it.
 */
const DIST_DIR = process.env.GUARD_DIST_DIR ?? '.next';
const SERVER = `${DIST_DIR}/standalone/server.js`;
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

if (!existsSync(SERVER)) {
  throw new Error('No production build found: run `pnpm build` first.');
}

export default defineConfig({
  testDir: './e2e/guard',
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  // Not the html report: the e2e run that follows in CI owns playwright-report/.
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node --env-file-if-exists=.env.local ${SERVER}`,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
      FINAXIS_E2E_TEST_MODE: '1',
      FINAXIS_ALLOW_INSECURE_LOCAL_ORIGINS: '1',
      PLATFORM_ORGANISATION_ID: '00000000-0000-0000-0000-000000000000',
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
