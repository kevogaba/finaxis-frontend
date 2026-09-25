import { randomUUID } from 'node:crypto';
import type { BrowserContext, Page, TestInfo } from '@playwright/test';

export const SESSION_COOKIE_NAME = 'finaxis.session_token';
export const SESSION_COOKIE_VALUE = 'e2e-authenticated-session';
export const RUN_COOKIE_NAME = 'finaxis_e2e_run';
export const CONTEXT_COOKIE_NAME = 'finaxis_context';

/** Mirrors `SCENARIOS` in e2e/fake-api/scenarios.mts. */
export type FakeApiScenario =
  'default' | 'empty-organisations' | 'selection-forbidden' | 'platform-operator';

export function baseUrl(testInfo: TestInfo): string {
  const configured = testInfo.project.use.baseURL;
  if (typeof configured !== 'string') {
    throw new Error('Playwright baseURL must be configured for e2e auth fixtures.');
  }
  return configured;
}

export async function addCookie(
  context: BrowserContext,
  testInfo: TestInfo,
  name: string,
  value: string,
): Promise<void> {
  await context.addCookies([
    { httpOnly: true, name, sameSite: 'Lax', secure: false, url: baseUrl(testInfo), value },
  ]);
}

/** Signs the browser in (E2E bypass) against a fresh, isolated fake-API run. */
export async function authenticate(
  context: BrowserContext,
  testInfo: TestInfo,
  scenario: FakeApiScenario = 'default',
): Promise<string> {
  const run = `${scenario}.${randomUUID()}`;
  await addCookie(context, testInfo, SESSION_COOKIE_NAME, SESSION_COOKIE_VALUE);
  await addCookie(context, testInfo, RUN_COOKIE_NAME, run);
  return run;
}

export async function selectMuiOption(page: Page, label: string, option: RegExp): Promise<void> {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}
