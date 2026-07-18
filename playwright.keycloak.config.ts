import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT) || 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /keycloak-smoke\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  // Real network round trips through Keycloak plus Next.js dev's on-demand
  // route compilation make this slower than the mocked default suite.
  timeout: 90_000,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
