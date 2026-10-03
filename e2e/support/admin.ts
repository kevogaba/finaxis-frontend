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

// Scoped to `main`: in an observed failure, an unscoped page.getByText resolved to two elements
// for the branches spec's "guides a branch context" test -- one hidden and outside `main`, one
// inside it (the layout has a single BranchContextState call site, so it wasn't a double render).
// The likely cause (not reproduced in this session) is app/loading.tsx's root Suspense boundary
// letting the streamed content briefly exist as a hidden duplicate segment. Whatever the actual
// cause, `getByRole('main')` excludes a hidden `<main>` from resolution, so a chained getByText only
// ever searches the one rendered, visible `<main>` -- deterministic regardless of the mechanism.
export const mainText = (page: Page, value: string | RegExp, options?: { exact?: boolean }) =>
  page.getByRole('main').getByText(value, options);

// A record's Overview can render its status twice by design (the hero chip, then the
// description-list row), both visible, so `.first()` is load-bearing here, not a leftover: without
// it this assertion would be a two-match strict-mode violation on every run. It does not pin the
// check to the hero specifically -- if only one copy carried the asserted value, `.first()` would
// resolve to whichever one does.
export const statusChip = (page: Page, value: string) =>
  mainText(page, value, { exact: true }).first();

/** Every row of the table named `table`, **the header row included**: N data rows count N + 1. */
export const rowsOf = (page: Page, table: string) =>
  page.getByRole('table', { name: table }).getByRole('row');

// Not-found renders `app/not-found.tsx`. A record layout's `notFound()` answers HTTP 200 behind the
// root loading boundary, so a missing page is asserted by its content, never by
// `response.status()`.
export const notFoundHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: "We couldn't find that page" });

/** Opens a record from its directory: the exact link in the named table, then its `h1` (bounded: a
 * record route can be the first hit of its tree under a cold `next dev` compile). */
export async function openRecord(page: Page, table: string, name: string): Promise<void> {
  await page.getByRole('table', { name: table }).getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15000 });
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
