import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT) || 3100;
const baseURL = `http://localhost:${PORT}`;
process.env.FINAXIS_E2E_TEST_MODE = '1';

export default defineConfig({
  testDir: './e2e',
  // The real-Keycloak smoke test is separate and manually invoked via
  // `pnpm test:e2e:keycloak` (playwright.keycloak.config.ts) — it requires a
  // live local Keycloak/Postgres stack and must never run as part of this
  // Keycloak-independent default gate.
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
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // CI builds separately before this suite; keep the test server non-production so the
    // explicitly gated, token-free E2E fixture can exercise authenticated flows.
    command: 'pnpm dev',
    env: {
      ...process.env,
      FINAXIS_E2E_TEST_MODE: '1',
    },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
