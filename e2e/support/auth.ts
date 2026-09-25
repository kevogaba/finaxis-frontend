import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { BrowserContext, Page, TestInfo } from '@playwright/test';

export const SESSION_COOKIE_NAME = 'finaxis.session_token';
export const SESSION_COOKIE_VALUE = 'e2e-authenticated-session';
export const RUN_COOKIE_NAME = 'finaxis_e2e_run';
export const CONTEXT_COOKIE_NAME = 'finaxis_context';

/** Mirrors `SCENARIOS` in e2e/fake-api/scenarios.mts. */
export type FakeApiScenario =
  | 'default'
  | 'empty-organisations'
  | 'selection-forbidden'
  | 'platform-operator'
  | 'suspended-branch';

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

/** Predicate for a same-origin request/response, e.g. inside `page.waitForRequest`/`waitForResponse`. */
export function sameOriginRequest(testInfo: TestInfo, pathname: string, method: string) {
  const expectedOrigin = new URL(baseUrl(testInfo)).origin;
  return (request: { method(): string; url(): string }) => {
    const url = new URL(request.url());
    return (
      url.origin === expectedOrigin && url.pathname === pathname && request.method() === method
    );
  };
}

export async function selectMuiOption(page: Page, label: string, option: RegExp): Promise<void> {
  const combobox = page.getByRole('combobox', { name: label });
  // MUI's Select only opens once React hydrates and attaches its click handler; a click that lands
  // on the pre-hydration SSR markup just focuses the element and never opens the listbox (visible
  // under a cold `next dev` compile with several Playwright workers contending for it). Wait for
  // React to have claimed the node (it tags hydrated DOM nodes with an internal `__reactProps$*`
  // key) before clicking, instead of clicking blind and hoping hydration already happened.
  // 20s, not the 5s default: the element itself can still be compiling in under heavy Playwright
  // worker contention on a cold `next dev` server, on top of the hydration wait this poll exists for.
  await expect
    .poll(
      () =>
        combobox.evaluate((el) => Object.keys(el).some((key) => key.startsWith('__reactProps'))),
      { timeout: 20000 },
    )
    .toBe(true);
  await combobox.click();
  await page.getByRole('option', { name: option }).click();
}
