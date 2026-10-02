import { defineConfig, devices } from '@playwright/test';

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
  workers: process.env.CI ? 1 : undefined,
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
    {
      // Non-production dev server so the gated E2E session bypass works; all backend calls go to
      // the fake API. PLATFORM_ORGANISATION_ID matches the fake API's reserved organisation.
      command: 'pnpm dev',
      env: {
        ...process.env,
        FINAXIS_E2E_TEST_MODE: '1',
        FINAXIS_API_URL: FAKE_API_URL,
        PLATFORM_ORGANISATION_ID: '00000000-0000-0000-0000-000000000000',
      },
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
