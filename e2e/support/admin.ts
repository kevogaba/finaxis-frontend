import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { selectMuiOption } from './auth';

interface EnterAdminOptions {
  /** The h1 the page renders once settled. */
  heading: string | RegExp;
  organisation?: RegExp;
  /** The branch option after the organisation; `null` when the scenario has no branch step. */
  branch?: RegExp | null;
}

/**
 * Opens a tenant admin page through context selection. Waits are bounded: a route can be the first
 * hit of its tree under a cold `next dev` compile, and the URL updates before the RSC payload (and
 * its h1) renders. `/select-context` drops a deep link's query string, so `pathname` has none —
 * navigate to a query afterwards.
 */
export async function enterAdmin(
  page: Page,
  pathname: string,
  { heading, organisation = /Greenfield/, branch = /Head Office/ }: EnterAdminOptions,
): Promise<void> {
  await page.goto(pathname);
  await selectMuiOption(page, 'Organisation', organisation);
  if (branch) await selectMuiOption(page, 'Branch', branch);
  await expect(page).toHaveURL((url) => url.pathname === pathname, { timeout: 15000 });
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
    timeout: 15000,
  });
}

export async function expectNoSeriousOrCriticalViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
}

/** The layer a11y gate: light and dark, desktop and 375 px (index Global Constraints). */
export const A11Y_CASES = [
  { colorScheme: 'light', label: 'desktop', width: 1280, height: 800 },
  { colorScheme: 'light', label: '375px', width: 375, height: 812 },
  { colorScheme: 'dark', label: 'desktop', width: 1280, height: 800 },
  { colorScheme: 'dark', label: '375px', width: 375, height: 812 },
] as const;

export type A11yCase = (typeof A11Y_CASES)[number];

/** Before navigating: InitColorSchemeScript reads `matchMedia` on load, so a scheme emulated after
 * `goto` would scan whatever scheme the page booted into. */
export async function applyA11yCase(page: Page, a11yCase: A11yCase): Promise<void> {
  await page.emulateMedia({ colorScheme: a11yCase.colorScheme });
  await page.setViewportSize({ width: a11yCase.width, height: a11yCase.height });
}

/** After the page settled: the scheme applied, the title streamed, and — below 768 px — no
 * horizontal page scroll. */
export async function expectA11yCaseApplied(page: Page, a11yCase: A11yCase): Promise<void> {
  await expect(page.locator('html')).toHaveClass(new RegExp(a11yCase.colorScheme));
  await expect(page).toHaveTitle(/.+/);
  if (a11yCase.width < 768) {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  }
}
