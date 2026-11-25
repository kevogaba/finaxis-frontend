import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  A11Y_CASES,
  applyA11yCase,
  enterAdmin,
  expectA11yCaseApplied,
  expectNoSeriousOrCriticalViolations,
  mainText,
  notFoundHeading,
  openRecord,
  rowsOf,
  statusChip,
  type A11yCase,
} from './support/admin';
import { authenticate, clickMuiOption, expectHydrated, selectMuiOption } from './support/auth';
import {
  BRANCH_SCENARIO_IDS,
  IDS,
  REINVITED_SCENARIO_IDS as REINVITED,
  USER_SCENARIO_IDS as USERS,
} from './fake-api/scenarios.mts';

const ALL_BRANCHES = /All branches \(institution level\)/;

// The app's copy, repeated here: Playwright can't resolve the app's `@/` imports, and an E2E only
// imports import-free modules. Each string is asserted verbatim, so a reworded message fails here.
const IDENTITY_IN_PROGRESS_NOTE =
  'Approval ran, and their sign-in identity is being created. The invitation is sent when it completes.';
const IDENTITY_FAILED_NOTE =
  "Approval ran, but their sign-in identity couldn't be created. Once the reason below is dealt with, provisioning can be retried.";
const IDENTITY_PROVIDER_FAILED =
  "The identity provider refused the request. Check that it's configured, then retry.";
const RESEND_TOO_SOON =
  'Their account was set up, or an invitation sent, moments ago. Try again in a few minutes.';
const NO_MEMBERSHIP_VIEW =
  "Membership actions need permission to view memberships, which your role doesn't include.";
const OWN_MEMBERSHIP =
  "You can't suspend or revoke your own membership. Ask another administrator.";
const OWN_ACCESS = "You can't add to your own access. A tenant administrator can.";
const USER_MAKER_CHECKER_BLOCKED =
  'You invited this user, so another administrator must approve them.';
const MEMBERSHIP_CHANGED =
  'This membership changed since the page loaded. Refresh to see its status.';
const NO_MEMBERSHIP_DETAILS = "You can't view membership details in your current role.";
const TYPE_NEEDS_BRANCH =
  'Staff and Admin members need an active branch assignment first. Assign a branch, then change the type.';
const BRANCH_HINT = 'Assign them to a branch first to give a branch-scoped role.';
const FORBIDDEN_TITLE = "You don't have permission";

/** The seeded home assignment of Felix at Westlands (`homeAt(7, …)` in scenarios.mts). */
const FELIX_HOME_ASSIGNMENT = '10000000-0000-4000-8000-000000000207';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// A user id no scenario seeds: the only seeded ids with hex letters are …000a-…000f, …001a and …001b,
// and every other seed (…0099, …0201-…0210, …0301-…0310, …0401-…0407, the …100000-…100499 fillers)
// is decimal-padded, so …00ff never appears.
const UNKNOWN_USER = '10000000-0000-4000-8000-0000000000ff';
const WANJIRU = /^Wanjiru Njeri Kamau-Otieno/;

async function openDirectory(page: Page, branch: RegExp | null = ALL_BRANCHES) {
  await enterAdmin(page, '/admin/users', { heading: 'Users & access', branch });
}

/** A user's record as the first navigation of a test: through context selection. */
async function enterUser(
  page: Page,
  id: string,
  name: string | RegExp,
  branch: RegExp | null = ALL_BRANCHES,
) {
  await enterAdmin(page, `/admin/users/${id}`, { heading: name, branch });
}

/** A record once the context is selected. */
async function openUser(page: Page, id: string, name: string | RegExp) {
  await page.goto(`/admin/users/${id}`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

const TAB_SEGMENTS = {
  'Roles & access': 'access',
  'Branch assignments': 'branches',
  Audit: 'audit',
} as const;

async function openTab(page: Page, label: keyof typeof TAB_SEGMENTS) {
  await page.getByRole('tab', { name: label }).click();
  await expect.poll(() => new URL(page.url()).pathname.split('/').pop()).toBe(TAB_SEGMENTS[label]);
}

/** A click on a client control, once React owns it (a click on the SSR markup is dropped). */
async function press(locator: Locator) {
  await expectHydrated(locator);
  await locator.click();
}

// Reject & revoke and Revoke are alertdialogs (destructive); Approve, Suspend and Reactivate are
// dialogs.
const dialogOf = (page: Page) => page.getByRole('alertdialog').or(page.getByRole('dialog'));

/** A hero lifecycle action through its dialog; the caller asserts the outcome. */
async function act(page: Page, label: string, reason?: string) {
  await press(page.getByRole('button', { name: label, exact: true }));
  const dialog = dialogOf(page);
  if (reason) await dialog.getByRole('textbox', { name: /^Reason/ }).fill(reason);
  await dialog.getByRole('button', { name: label, exact: true }).click();
  return dialog;
}

/** The record hero: the innermost surface holding the page's h1, with its chips and actions. The
 * Overview repeats statuses further down (a "Membership status" row, a "User status" row), so a
 * status that must hold in the hero is asserted here, never against `main`. */
const hero = (page: Page) =>
  page
    .locator('.MuiPaper-root')
    .filter({ has: page.getByRole('heading', { level: 1 }) })
    .last();

/** The value of a description-list row on the Overview, found by its label. */
const fact = (page: Page, label: string) =>
  page
    .getByRole('main')
    .locator('dt')
    .filter({ hasText: label })
    .locator('xpath=following-sibling::dd[1]');

/** How many lines an element's text takes: its height over its line height. */
const lineCount = (locator: Locator) =>
  locator.evaluate((element) => {
    const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
    return Math.round(element.getBoundingClientRect().height / lineHeight);
  });

/** Tabs from `from` until `target` holds focus: a scroll container that no Tab stop reaches can't
 * be scrolled from the keyboard. A bounded walk, so a missing stop fails rather than hangs. */
async function tabTo(page: Page, from: Locator, target: Locator) {
  await from.focus();
  for (let press = 0; press < 15; press += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error('Tab never reached the target in 15 presses');
}

/** The browser's keyboard focus ring: `:focus-visible` paints an outline, an unfocused element none. */
const outlineOf = (locator: Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
async function expectFocusRing(locator: Locator) {
  await expect(locator).toBeFocused();
  const outline = await outlineOf(locator);
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThan(0);
}
async function expectNoFocusRing(locator: Locator) {
  expect((await outlineOf(locator)).style).toBe('none');
}

/** A toast: MUI alerts in the toast region; Next's route announcer is an alert too. */
const toast = (page: Page, text: string) => page.getByRole('alert').filter({ hasText: text });

/** A drawer is `position: fixed`, so the page scroll check can't see it overflow: at 375 px its own
 * box must hold its content (roles.spec's check). */
async function expectDrawerFits(a11yCase: A11yCase, dialog: Locator) {
  if (a11yCase.width >= 768) return;
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
}

/** The hidden inputs a Server Action form carries: the organisation the page rendered for (the
 * cross-tab guard) and the idempotency key the form minted. */
async function expectGuardFields(form: Locator) {
  await expect(form.locator('input[name="contextOrganisationId"]')).toHaveValue(IDS.greenfield);
  await expect(form.locator('input[name="idempotencyKey"]')).toHaveValue(UUID);
}

const searchParam = (page: Page, name: string) => new URL(page.url()).searchParams.get(name);

/** A pattern for text a longer string contains (an accessible description is every part joined). */
const containing = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

test.describe('users: directory and lifecycle', () => {
  // The organisation's zone is Africa/Nairobi: a time rendered in the browser's zone would differ.
  test.use({ timezoneId: 'UTC' });

  test('lists users newest first and filters them through the URL', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await openDirectory(page);

    await expect(mainText(page, '13 users', { exact: true })).toBeVisible();
    await expect(rowsOf(page, 'Users')).toHaveCount(11); // header + 10
    await expect(
      rowsOf(page, 'Users').nth(1).getByRole('link', { name: 'Joann Mwangi', exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Administration' })
        .getByRole('link', { name: 'Users & access' }),
    ).toHaveAttribute('aria-current', 'page');

    const search = page.getByRole('searchbox', { name: 'Search' });
    await expectHydrated(search);
    await search.fill('mwangi');
    await search.press('Enter');
    await expect(page).toHaveURL((url) => url.searchParams.get('q') === 'mwangi');
    await expect(rowsOf(page, 'Users')).toHaveCount(3); // header + Joann + Ann
    await expect(
      rowsOf(page, 'Users').nth(1).getByRole('link', { name: 'Joann Mwangi', exact: true }),
    ).toBeVisible();
    await expect(
      rowsOf(page, 'Users').nth(2).getByRole('link', { name: 'Ann Mwangi', exact: true }),
    ).toBeVisible();

    // Wait for each cleared render: the next push builds on the rendered query.
    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(mainText(page, '13 users', { exact: true })).toBeVisible();
    await selectMuiOption(page, 'Membership', /^Pending approval$/);
    await expect(page).toHaveURL(
      (url) => url.searchParams.get('membershipStatus') === 'PENDING_APPROVAL',
    );
    await expect(rowsOf(page, 'Users')).toHaveCount(5); // header + Amina, Brian, Carol, Daniel
    // The Onboarding column is the third. Daniel's approval ran and his identity failed, which his
    // membership's invitation says (BG-28); his User status cell still reads Provisioning identity.
    const daniel = rowsOf(page, 'Users').filter({ hasText: 'Daniel Mutua' });
    await expect(daniel.getByRole('cell').nth(2)).toHaveText('Identity failed');
    await expect(daniel.getByRole('cell').nth(4)).toHaveText('Provisioning identity');
    await expect(
      rowsOf(page, 'Users').filter({ hasText: 'Amina Odhiambo' }).getByRole('cell').nth(2),
    ).toHaveText('Awaiting approval');

    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(mainText(page, '13 users', { exact: true })).toBeVisible();
    await press(page.getByRole('button', { name: 'Go to next page' }));
    await expect(page).toHaveURL((url) => url.searchParams.get('page') === '1');
    await expect(rowsOf(page, 'Users')).toHaveCount(4); // header + Amina, Victor, Jane
    await expect(
      rowsOf(page, 'Users').nth(1).getByRole('link', { name: 'Amina Odhiambo', exact: true }),
    ).toBeVisible();
    await expect(
      rowsOf(page, 'Users').nth(2).getByRole('link', { name: 'Victor Otieno', exact: true }),
    ).toBeVisible();
    await expect(
      rowsOf(page, 'Users').nth(3).getByRole('link', { name: 'Backend Jane Manager', exact: true }),
    ).toBeVisible();
  });

  test('caps a long name and email to the card on a narrow screen, so the ellipsis stays visible', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDirectory(page);

    const row = rowsOf(page, 'Users').filter({ hasText: 'wanjiru.long' });
    const name = row.getByRole('link', { name: WANJIRU });
    const email = row.getByText(/^wanjiru\.njeri\.kamau-otieno/);
    const width = async (locator: Locator) => (await locator.boundingBox())?.width ?? 0;

    // Positive control: a wide screen shows the full 320 px, so the cap below is the narrow one.
    expect(await width(name)).toBeGreaterThan(300);
    expect(await width(email)).toBeGreaterThan(300);

    // At 375 px the card shows about 300 px: the name and the email stop at 60% of the viewport
    // (225 px), inside it, not at 320 px beyond its edge.
    await page.setViewportSize({ width: 375, height: 812 });
    await expect.poll(() => width(name)).toBeLessThanOrEqual(0.6 * 375 + 1);
    await expect.poll(() => width(email)).toBeLessThanOrEqual(0.6 * 375 + 1);
    await expect(name).toBeVisible();
  });

  test('makes the users table keyboard-scrollable: Tab reaches it, with a visible focus ring', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await page.setViewportSize({ width: 375, height: 812 });
    await openDirectory(page);

    // The table is wider than the card here, so the region really scrolls sideways: without a stop
    // of its own, a keyboard user could not reach the Onboarding and status columns.
    const region = page.getByRole('region', { name: 'Users table' });
    await expect(region).toHaveAttribute('tabindex', '0');
    expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await expectNoFocusRing(region);

    const search = page.getByRole('searchbox', { name: 'Search' });
    await expectHydrated(search);
    await tabTo(page, search, region);
    await expectFocusRing(region);
    // The stop is the region, not a row inside it: the next Tab moves on to the first name link.
    await page.keyboard.press('Tab');
    await expect(
      rowsOf(page, 'Users').nth(1).getByRole('link', { name: 'Joann Mwangi', exact: true }),
    ).toBeFocused();
  });

  test('approves a user with no sign-in identity: provisioning starts (202)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, USERS.amina, 'Amina Odhiambo');

    // Before: awaiting approval, and Approve on offer with its form guards.
    await expect(hero(page).getByText('Awaiting approval', { exact: true })).toBeVisible();
    await expect(
      hero(page).getByText('Membership pending approval', { exact: true }),
    ).toBeVisible();
    await press(page.getByRole('button', { name: 'Approve', exact: true }));
    const dialog = dialogOf(page);
    await expect(dialog).toContainText('Approve Amina Odhiambo?');
    await expectGuardFields(dialog);
    await expect(dialog.locator('input[name="membershipId"]')).toHaveValue(USERS.aminaMembership);
    await dialog.getByRole('button', { name: 'Approve', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(toast(page, 'Approval recorded')).toBeVisible();
    // The 202: the hero's onboarding chip moves on while the membership stays pending, read from
    // the membership's invitation (BG-11).
    await expect(hero(page).getByText('Identity in progress', { exact: true })).toBeVisible();
    await expect(
      hero(page).getByText('Membership pending approval', { exact: true }),
    ).toBeVisible();
    await expect(hero(page).getByText('Awaiting approval', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    // Approve left, so focus lands on the first action that remains.
    await expect(page.getByRole('button', { name: 'Reject & revoke', exact: true })).toBeFocused();
    await expect(mainText(page, IDENTITY_IN_PROGRESS_NOTE)).toBeVisible();
    await expect(fact(page, 'Identity provisioning')).toHaveText('In progress');
    // A job still queued has nothing to retry.
    await expect(page.getByRole('button', { name: 'Retry provisioning' })).toHaveCount(0);
  });

  test('approves an existing account straight to active (200)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, USERS.brian, 'Brian Kiprono');

    // Brian's account is already Active, so the Overview says `Active` before and after: only the
    // hero's membership chip tells the two states apart.
    await expect(
      hero(page).getByText('Membership pending approval', { exact: true }),
    ).toBeVisible();
    await expect(hero(page).getByText('Membership active', { exact: true })).toHaveCount(0);

    await expect(await act(page, 'Approve')).toBeHidden();
    await expect(toast(page, 'Approval recorded')).toBeVisible();
    await expect(hero(page).getByText('Membership active', { exact: true })).toBeVisible();
    await expect(hero(page).getByText('Active', { exact: true })).toBeVisible();
    await expect(hero(page).getByText('Awaiting approval', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Suspend', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revoke', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Approve|Reject & revoke)$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Suspend', exact: true })).toBeFocused();
  });

  test("disables Approve for the user's inviter and explains why", async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, USERS.carol, 'Carol Wambui');

    // Jane invited Carol (her record's `created_by`) and maker-checker is on, so the platform would
    // refuse her approval.
    const approve = page.getByRole('button', { name: 'Approve', exact: true });
    await expect(approve).toBeDisabled();
    await expect(approve).toHaveAccessibleDescription(USER_MAKER_CHECKER_BLOCKED);
    await expect(mainText(page, USER_MAKER_CHECKER_BLOCKED)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reject & revoke', exact: true })).toBeEnabled();
  });

  test("keeps the hero's name and email on one line beside a blocked-action reason", async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await page.setViewportSize({ width: 1440, height: 900 });
    const subtitle = (text: string) => hero(page).getByText(text, { exact: true });

    // The caption is as wide as its sentence; uncapped, it sized the actions box and squeezed the
    // title column, so the email broke mid-word and the name wrapped.
    await enterUser(page, USERS.carol, 'Carol Wambui');
    await expect(mainText(page, USER_MAKER_CHECKER_BLOCKED)).toBeVisible();
    expect(await lineCount(page.getByRole('heading', { level: 1 }))).toBe(1);
    const carolSubtitle = subtitle('carol.wambui · carol.wambui@greenfield.example');
    expect(await lineCount(carolSubtitle)).toBe(1);

    // Your own record: another long caption, and a 20-character name.
    await openUser(page, IDS.jane, 'Backend Jane Manager');
    await expect(mainText(page, OWN_MEMBERSHIP)).toBeVisible();
    expect(await lineCount(page.getByRole('heading', { level: 1 }))).toBe(1);

    // Positive control: the measure does see a wrap. At 375 px the same subtitle can't fit a line.
    await openUser(page, USERS.carol, 'Carol Wambui');
    await page.setViewportSize({ width: 375, height: 812 });
    await expect.poll(() => lineCount(carolSubtitle)).toBeGreaterThan(1);
  });

  test('rejects and revokes a provisioning user, checking the reason on the server', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, USERS.daniel, 'Daniel Mutua');

    // Approval already ran and provisioning failed (BG-11): Retry stands in for Approve.
    await expect(hero(page).getByText('Identity failed', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry provisioning' })).toBeVisible();

    await press(page.getByRole('button', { name: 'Reject & revoke', exact: true }));
    const dialog = page.getByRole('alertdialog', { name: 'Reject and revoke Daniel Mutua?' });
    // BG-28: a revoked member can be invited again, so nothing says it is permanent.
    await expect(dialog).toContainText('They can be invited again later.');
    await expectGuardFields(dialog);
    await expect(dialog.locator('input[name="membershipId"]')).toHaveValue(USERS.danielMembership);

    // Two spaces and one letter pass the browser's minLength, and the server trims them.
    const reason = dialog.getByRole('textbox', { name: /^Reason/ });
    await reason.fill('  a  ');
    await dialog.getByRole('button', { name: 'Reject & revoke', exact: true }).click();
    await expect(dialog.getByText('Give a reason of at least 3 characters.')).toBeVisible();
    await expect(reason).toHaveValue('  a  ');

    await reason.fill('Duplicate invitation');
    await dialog.getByRole('button', { name: 'Reject & revoke', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(toast(page, 'Membership revoked')).toBeVisible();
    await expect(hero(page).getByText('Membership revoked', { exact: true })).toBeVisible();
    await expect(hero(page).getByText('Revoked', { exact: true })).toBeVisible();
    // Revoked is terminal: nothing is left to offer, so the title takes focus.
    await expect(hero(page).getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Daniel Mutua' })).toBeFocused();
  });

  test('refuses a stale Reject & revoke after another tab approved the user into provisioning (202)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    // This tab renders Amina awaiting approval, with Reject & revoke on offer for that state.
    await enterUser(page, USERS.amina, 'Amina Odhiambo');
    await expect(hero(page).getByText('Awaiting approval', { exact: true })).toBeVisible();

    // Another tab of the same browser context (same run, same session) approves her. She has no
    // sign-in identity, so the answer is a 202: the membership stays pending and only she moves on
    // (contract §E.3, BG-11), which a membership-status check alone cannot see.
    const other = await context.newPage();
    await openUser(other, USERS.amina, 'Amina Odhiambo');
    await expect(await act(other, 'Approve')).toBeHidden();
    await expect(hero(other).getByText('Identity in progress', { exact: true })).toBeVisible();
    await expect(
      hero(other).getByText('Membership pending approval', { exact: true }),
    ).toBeVisible();
    await other.close();

    // The first tab never refreshed, so its Reject & revoke is stale: the server refuses it, the
    // dialog stays open with the reason the administrator typed, and no revoke is sent.
    const dialog = await act(page, 'Reject & revoke', 'Wrong person');
    await expect(dialog.getByText(MEMBERSHIP_CHANGED)).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: /^Reason/ })).toHaveValue('Wrong person');
    await expect(toast(page, 'Membership revoked')).toHaveCount(0);

    // A fresh read: she is still provisioning, not revoked, and still revocable by an administrator
    // who sees that (the page showed her as provisioning, so the guard has nothing to compare).
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Amina Odhiambo' })).toBeVisible();
    await expect(hero(page).getByText('Identity in progress', { exact: true })).toBeVisible();
    await expect(
      hero(page).getByText('Membership pending approval', { exact: true }),
    ).toBeVisible();
    await expect(hero(page).getByText('Revoked', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reject & revoke', exact: true })).toBeVisible();
  });

  // BG-11: the design's "Identity failed" record.
  test("shows why a member's provisioning failed, and Retry moves it back to in progress", async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, USERS.daniel, 'Daniel Mutua');

    await expect(hero(page).getByText('Identity failed', { exact: true })).toBeVisible();
    const onboarding = page.getByRole('region', { name: 'Onboarding' });
    const steps = onboarding.getByRole('list', { name: 'Onboarding steps' });
    await expect(steps.getByRole('listitem').nth(2)).toContainText('Failed');
    await expect(mainText(page, IDENTITY_FAILED_NOTE)).toBeVisible();
    await expect(fact(page, 'Identity provisioning')).toHaveText('Failed after 3 attempts');
    await expect(fact(page, 'Reason')).toHaveText(IDENTITY_PROVIDER_FAILED);
    await expect(fact(page, 'Last update (Africa/Nairobi)')).toHaveText('24 Nov 2026 · 09:14');

    await press(page.getByRole('button', { name: 'Retry provisioning' }));
    const dialog = page.getByRole('dialog', {
      name: 'Retry identity provisioning for Daniel Mutua?',
    });
    await expect(dialog).toContainText(
      "We'll ask the identity provider to create their account again.",
    );
    await expectGuardFields(dialog);
    await expect(dialog.locator('input[name="membershipId"]')).toHaveValue(USERS.danielMembership);
    await dialog.getByRole('button', { name: 'Retry', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(toast(page, 'Provisioning retried')).toBeVisible();
    await expect(hero(page).getByText('Identity in progress', { exact: true })).toBeVisible();
    await expect(
      hero(page).getByText('Membership pending approval', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry provisioning' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    // Retry left, so focus lands on the action that remains.
    await expect(page.getByRole('button', { name: 'Reject & revoke', exact: true })).toBeFocused();
    await expect(mainText(page, IDENTITY_IN_PROGRESS_NOTE)).toBeVisible();
    await expect(fact(page, 'Identity provisioning')).toHaveText('In progress after 3 attempts');
    await expect(page.getByRole('main').locator('dt').filter({ hasText: 'Reason' })).toHaveCount(0);
  });

  test("resends an invited member's invitation, and says so when it was sent moments ago", async ({
    context,
    page,
  }, testInfo) => {
    // `users-invite` adds user.invite to the administrator's role.
    await authenticate(context, testInfo, 'users-invite');
    await enterUser(page, USERS.esther, 'Esther Njoki');
    await expect(hero(page).getByText('Awaiting first sign-in', { exact: true })).toBeVisible();
    // Her provisioning succeeded in August.
    await expect(fact(page, 'Identity provisioning')).toHaveText('Completed');
    const lastUpdate = fact(page, 'Last update (Africa/Nairobi)');
    await expect(lastUpdate).toHaveText('02 Aug 2026 · 12:00');

    const resend = async () => {
      await press(page.getByRole('button', { name: 'Resend invitation' }));
      const dialog = page.getByRole('dialog', { name: "Resend Esther Njoki's invitation?" });
      await expect(dialog).toContainText(
        'The identity provider emails them a new link to verify their address and set a password. The link lasts 72 hours. Delivery depends on how the platform is set up.',
      );
      await expectGuardFields(dialog);
      await dialog.getByRole('button', { name: 'Resend', exact: true }).click();
      return dialog;
    };

    await expect(await resend()).toBeHidden();
    await expect(toast(page, 'Invitation resent')).toBeVisible();
    // The refreshed record: the resend moved the last update, and the platform's extra attempt is
    // no failure, so no count is shown.
    await expect(lastUpdate).not.toHaveText('02 Aug 2026 · 12:00');
    await expect(fact(page, 'Identity provisioning')).toHaveText('Completed');
    // The same actions remain, so focus returns to Resend.
    await expect(page.getByRole('button', { name: 'Resend invitation' })).toBeFocused();

    // Within the five-minute cooldown the platform refuses it by name: the dialog stays open.
    const again = await resend();
    await expect(again.getByText(RESEND_TOO_SOON)).toBeVisible();
    await expect(again).toBeVisible();
  });

  test('suspends and reactivates a member, and audits both', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, USERS.esther, 'Esther Njoki');
    await expect(hero(page).getByText('Awaiting first sign-in', { exact: true })).toBeVisible();

    await expect(await act(page, 'Suspend', 'Cash audit')).toBeHidden();
    await expect(toast(page, 'Membership suspended')).toBeVisible();
    await expect(hero(page).getByText('Membership suspended', { exact: true })).toBeVisible();
    await expect(hero(page).getByText('Suspended', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reactivate', exact: true })).toBeFocused();

    // Reactivate's reason is optional.
    await expect(await act(page, 'Reactivate')).toBeHidden();
    await expect(toast(page, 'Membership reactivated')).toBeVisible();
    await expect(hero(page).getByText('Membership active', { exact: true })).toBeVisible();
    await expect(hero(page).getByText('Awaiting first sign-in', { exact: true })).toBeVisible();
    await expect(hero(page).getByText('Suspended', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Suspend', exact: true })).toBeFocused();

    // The default view is the user record, which the fake (like the platform, BG-16) keys both by.
    await openTab(page, 'Audit');
    const trail = page.getByRole('region', { name: 'Audit trail' });
    await expect(trail).toContainText('Suspended membership');
    await expect(trail).toContainText('Reactivated membership');
    await expect(rowsOf(page, 'Audit events')).toHaveCount(3); // header + the two
  });

  test('revokes a suspended membership and every assignment', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, USERS.gladys, 'Gladys Chebet');
    await expect(hero(page).getByText('Membership suspended', { exact: true })).toBeVisible();

    // Positive controls: she holds one role and one branch before the revoke.
    await openTab(page, 'Roles & access');
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(2);
    await openTab(page, 'Branch assignments');
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2);
    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Profile' })).toBeVisible();

    const dialog = await act(page, 'Revoke', 'Left the SACCO');
    await expect(dialog).toBeHidden();
    await expect(hero(page).getByText('Membership revoked', { exact: true })).toBeVisible();
    await expect(hero(page).getByText('Revoked', { exact: true })).toBeVisible();
    await expect(hero(page).getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Gladys Chebet' })).toBeFocused();

    // Every assignment went with it, and a revoked membership takes no new one.
    await openTab(page, 'Roles & access');
    await expect(mainText(page, 'No roles assigned', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assign role' })).toHaveCount(0);
    await openTab(page, 'Branch assignments');
    await expect(mainText(page, 'No branch assignments', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assign branch' })).toHaveCount(0);
  });

  test('disables Suspend and Revoke on your own record', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, IDS.jane, 'Backend Jane Manager');

    for (const label of ['Suspend', 'Revoke']) {
      const button = page.getByRole('button', { name: label, exact: true });
      await expect(button).toBeDisabled();
      await expect(button).toHaveAccessibleDescription(OWN_MEMBERSHIP);
    }
    await expect(mainText(page, OWN_MEMBERSHIP)).toBeVisible();
  });

  // #342: `users-self` is Jane without user.assign_self (an IAM_ADMIN shape) on her own record.
  test('disables Assign role and Assign branch on your own record, and says why', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users-self');
    await enterUser(page, IDS.jane, 'Backend Jane Manager');

    await openTab(page, 'Roles & access');
    const role = page.getByRole('button', { name: 'Assign role' });
    await expect(role).toBeDisabled();
    await expect(role).toHaveAccessibleDescription(OWN_ACCESS);
    await openTab(page, 'Branch assignments');
    const branch = page.getByRole('button', { name: 'Assign branch' });
    await expect(branch).toBeDisabled();
    await expect(branch).toHaveAccessibleDescription(OWN_ACCESS);

    // Someone else's record offers both (the control).
    await openUser(page, USERS.felix, 'Felix Omondi');
    await openTab(page, 'Branch assignments');
    await expect(page.getByRole('button', { name: 'Assign branch' })).toBeEnabled();
  });

  test('leaves you out of the branch Assign user search when you cannot assign yourself', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users-self');
    await enterAdmin(page, `/admin/branches/${IDS.westlands}/users`, {
      heading: 'Westlands Branch',
      branch: ALL_BRANCHES,
    });

    await press(page.getByRole('button', { name: 'Assign user' }));
    const user = page.getByRole('dialog', { name: 'Assign a user' }).getByRole('combobox', {
      name: /^User/,
    });
    await user.fill('felix');
    await expect(page.getByRole('option', { name: /Felix Omondi/ })).toBeVisible();
    // The search matches Jane (the audit actor filter picks her the same way), but she is left out.
    await user.fill('Backend Jane');
    await expect(
      page.locator('.MuiAutocomplete-popper').getByText('No matching users', { exact: true }),
    ).toBeVisible();
  });

  test("shows each user's own membership facts, even when emails nest", async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    // `ann.mwangi@…` is a substring of `joann.mwangi@…`, and the fake lists Joann first for Ann's
    // email: a resolver that took the first hit would show Ann as Joann, a Staff member.
    await enterUser(page, USERS.ann, 'Ann Mwangi');
    const ann = page.getByRole('region', { name: 'Membership', exact: true });
    await expect(ann.getByText('Admin', { exact: true })).toBeVisible();
    await expect(ann.getByText('Staff', { exact: true })).toHaveCount(0);

    await openUser(page, USERS.joann, 'Joann Mwangi');
    const joann = page.getByRole('region', { name: 'Membership', exact: true });
    await expect(joann.getByText('Staff', { exact: true })).toBeVisible();
    await expect(joann.getByText('Admin', { exact: true })).toHaveCount(0);

    // Seeded `2026-07-01T08:00:00Z`: 11:00 in the organisation's zone, though the browser is UTC.
    await openUser(page, USERS.felix, 'Felix Omondi');
    await expect(fact(page, 'First invited (Africa/Nairobi)')).toHaveText('01 Jul 2026 · 11:00');
    // BG-17: the seed numbers everyone ever active, Felix fourth; the system invited him.
    await expect(fact(page, 'Member no.')).toHaveText('4');
    await expect(fact(page, 'Last invited by')).toHaveText('—');

    // Victor invited Amina, who is pending, so she has no number yet (ADR 0040).
    await openUser(page, USERS.amina, 'Amina Odhiambo');
    await expect(fact(page, 'Member no.')).toHaveText('—');
    await expect(fact(page, 'Last invited by')).toHaveText('Victor Otieno');
  });

  // BG-17 (platform #161): the type and the primary branch, sending only what changed.
  test("edits a member's type and primary branch, and the card shows the change", async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, USERS.felix, 'Felix Omondi');
    const card = page.getByRole('region', { name: 'Membership', exact: true });
    await expect(fact(page, 'Membership type')).toHaveText('Staff');
    await expect(fact(page, 'Primary branch')).toHaveText('Westlands Branch (WESTLANDS)');

    await press(card.getByRole('button', { name: 'Edit membership' }));
    const dialog = page.getByRole('dialog', { name: "Edit Felix Omondi's membership" });
    await expectGuardFields(dialog);
    await selectMuiOption(page, 'Membership type', /^Auditor$/);
    await selectMuiOption(page, 'Primary branch', /^Head Office/);
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(dialog).toHaveCount(0);
    await expect(toast(page, 'Membership updated')).toBeVisible();
    await expect(fact(page, 'Membership type')).toHaveText('Auditor');
    await expect(fact(page, 'Primary branch')).toHaveText('Head Office (HEAD_OFFICE)');
    await expect(fact(page, 'Member no.')).toHaveText('4');

    // Back to no primary branch: None sends null.
    await press(card.getByRole('button', { name: 'Edit membership' }));
    await selectMuiOption(page, 'Primary branch', /^None$/);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(fact(page, 'Primary branch')).toHaveText('None');
    await expect(fact(page, 'Membership type')).toHaveText('Auditor');
  });

  test('explains why an active auditor with no branch cannot become Staff, keeping the choice', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, USERS.wanjiru, WANJIRU);

    await press(
      page
        .getByRole('region', { name: 'Membership', exact: true })
        .getByRole('button', { name: 'Edit membership' }),
    );
    const dialog = page.getByRole('dialog', { name: /^Edit Wanjiru Njeri/ });
    await selectMuiOption(page, 'Membership type', /^Staff$/);
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(dialog.getByRole('alert')).toContainText(TYPE_NEEDS_BRANCH);
    await expect(dialog.getByRole('combobox', { name: 'Membership type' })).toHaveText('Staff');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(fact(page, 'Membership type')).toHaveText('Auditor');
  });
});

test.describe('users: access and audit', () => {
  test('assigns and revokes roles, offering branch scope only where the user is assigned', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, USERS.felix, 'Felix Omondi');
    await openTab(page, 'Roles & access');
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(4); // header + 3
    // A DISABLED role grants nothing: the table says so beside its name, once.
    const disabled = page
      .getByRole('table', { name: 'Role assignments' })
      .getByText('Disabled', { exact: true });
    await expect(disabled).toHaveCount(1);
    await expect(
      rowsOf(page, 'Role assignments').filter({ hasText: 'Loans officer' }).getByText('Disabled'),
    ).toBeVisible();

    await press(page.getByRole('button', { name: 'Assign role' }));
    const drawer = page.getByRole('dialog', { name: 'Assign a role' });
    const role = drawer.getByRole('combobox', { name: 'Role' });
    await expectHydrated(role);
    await role.click();
    // The ACTIVE roles only: Tenant admin, Teller and Branch supervisor, never Loans officer.
    await expect(page.getByRole('option')).toHaveCount(3);
    await expect(page.getByRole('option', { name: /Loans officer/ })).toHaveCount(0);
    await clickMuiOption(page.getByRole('option', { name: 'Branch supervisor (SUPERVISOR)' }));
    await selectMuiOption(page, 'Scope', /^One branch$/);
    // Felix holds Westlands only, so it is the one branch on offer.
    await page.getByRole('combobox', { name: 'Branch' }).click();
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option')).toHaveText('Westlands Branch (WESTLANDS)');
    await clickMuiOption(page.getByRole('option', { name: 'Westlands Branch (WESTLANDS)' }));
    await drawer.getByRole('button', { name: 'Assign role' }).click();
    await expect(drawer).toBeHidden();
    await expect(toast(page, 'Role assigned')).toBeVisible();
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(5);

    await page
      .getByRole('button', {
        name: "Revoke Felix Omondi's Branch supervisor assignment (Westlands Branch)",
      })
      .click();
    const revoke = page.getByRole('alertdialog');
    await revoke.getByRole('button', { name: 'Revoke' }).click();
    await expect(revoke).toBeHidden();
    // The revoked row's button unmounts, so focus falls back to the record title.
    await expect(page.getByRole('heading', { level: 1, name: 'Felix Omondi' })).toBeFocused();
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(4);

    // Wanjiru holds no branch assignment: "One branch" is disabled, and the drawer says why.
    await openUser(page, USERS.wanjiru, WANJIRU);
    await openTab(page, 'Roles & access');
    await press(page.getByRole('button', { name: 'Assign role' }));
    const wanjiru = page.getByRole('dialog', { name: 'Assign a role' });
    await expect(wanjiru.getByRole('combobox', { name: 'Scope' })).toHaveAccessibleDescription(
      containing(BRANCH_HINT),
    );
    await wanjiru.getByRole('combobox', { name: 'Scope' }).click();
    await expect(page.getByRole('option', { name: 'One branch' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('forwards the organisation, the user and the row from the role drawer and the revoke dialog', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, USERS.felix, 'Felix Omondi');
    await openTab(page, 'Roles & access');
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(4);

    // Without these the cross-tab guard is silently off, whatever the unit tests of the pieces say.
    await press(page.getByRole('button', { name: 'Assign role' }));
    const drawer = page.getByRole('dialog', { name: 'Assign a role' });
    await expectGuardFields(drawer);
    await expect(drawer.locator('input[name="userId"]')).toHaveValue(USERS.felix);
    await drawer.getByRole('button', { name: 'Cancel' }).click();
    await expect(drawer).toBeHidden();

    await page
      .getByRole('button', { name: "Revoke Felix Omondi's Teller assignment (Westlands Branch)" })
      .click();
    const revoke = page.getByRole('alertdialog');
    await expectGuardFields(revoke);
    await expect(revoke.locator('input[name="assignmentId"]')).toHaveValue(USERS.felixBranchTeller);
    // Someone else's assignment carries no self warning.
    await expect(revoke).not.toContainText('This is your own assignment');
    await revoke.getByRole('button', { name: 'Cancel' }).click();
    await expect(revoke).toBeHidden();
  });

  test('lists only active assignments and offers none on a revoked membership', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    // Hassan's membership is revoked and so are his Teller and Head Office assignments.
    await enterUser(page, USERS.hassan, 'Hassan Ali');
    await openTab(page, 'Roles & access');
    await expect(mainText(page, 'No roles assigned', { exact: true })).toBeVisible();
    await expect(mainText(page, 'This user holds no roles.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assign role' })).toHaveCount(0);
    await openTab(page, 'Branch assignments');
    await expect(mainText(page, 'No branch assignments', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assign branch' })).toHaveCount(0);
  });

  // BG-03: the platform checks a revoke on the assignment's own scope, so a tenant-wide holder
  // revokes at any branch, whichever branch is selected.
  test('offers every Revoke to a tenant-wide holder with another branch selected', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await openDirectory(page, /Head Office/);
    await openRecord(page, 'Users', 'Felix Omondi');
    await openTab(page, 'Roles & access');
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(4);

    await expect(
      page.getByRole('button', {
        name: "Revoke Felix Omondi's Teller assignment (Westlands Branch)",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: "Revoke Felix Omondi's Teller assignment (institution-wide)",
      }),
    ).toBeVisible();
  });

  test('warns before you revoke your own role assignment, and lets you back out', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, IDS.jane, 'Backend Jane Manager');
    await openTab(page, 'Roles & access');

    await page
      .getByRole('button', {
        name: "Revoke Backend Jane Manager's Tenant admin assignment (institution-wide)",
      })
      .click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('This is your own assignment');
    // Never confirmed: Jane's Tenant admin role is how the whole run reads anything.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(2);
  });

  test('warns before you revoke your own branch assignment, then revokes it (BG-35)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, IDS.jane, 'Backend Jane Manager');
    await openTab(page, 'Branch assignments');
    // The header row, then Head Office and Westlands.
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(3);

    await press(
      page.getByRole('button', {
        name: "Revoke Backend Jane Manager's Operate assignment at Westlands Branch",
      }),
    );
    const dialog = page.getByRole('alertdialog', {
      name: 'Revoke your own Westlands Branch assignment?',
    });
    await expect(dialog.getByRole('alert')).toHaveText(
      "This is your own access. If Westlands Branch is your selected branch, you'll be asked to choose your context again.",
    );
    // All branches is selected, so Jane's context survives: she can revoke and keep working.
    await dialog.getByRole('button', { name: 'Revoke' }).click();
    await expect(dialog).toBeHidden();
    await expect(toast(page, 'Assignment revoked')).toBeVisible();
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2);
    await expect(rowsOf(page, 'Branch assignments').nth(1)).toContainText('Head Office');
  });

  test('assigns a branch and explains the last-assignment refusal', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, USERS.felix, 'Felix Omondi');
    await openTab(page, 'Branch assignments');
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2); // Westlands
    await expect(rowsOf(page, 'Branch assignments').nth(1)).toContainText('Westlands Branch');
    await expect(rowsOf(page, 'Branch assignments').nth(1)).toContainText('Home');

    await press(page.getByRole('button', { name: 'Assign branch' }));
    const drawer = page.getByRole('dialog', { name: 'Assign to a branch' });
    await selectMuiOption(page, 'Branch', /^Head Office \(HEAD_OFFICE\)$/);
    await selectMuiOption(page, 'Assignment type', /^Operate$/);
    await drawer.getByRole('button', { name: 'Assign branch' }).click();
    await expect(drawer).toBeHidden();
    await expect(toast(page, 'Branch assigned')).toBeVisible();
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(3);
    // Newest assigned first (BG-09), so Head Office now precedes Westlands.
    await expect(rowsOf(page, 'Branch assignments').nth(1)).toContainText('Head Office');
    await expect(rowsOf(page, 'Branch assignments').nth(2)).toContainText('Westlands Branch');

    await page
      .getByRole('button', { name: "Revoke Felix Omondi's Operate assignment at Head Office" })
      .click();
    const revoke = page.getByRole('alertdialog');
    await revoke.getByRole('button', { name: 'Revoke' }).click();
    await expect(revoke).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Felix Omondi' })).toBeFocused();
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2);

    // A staff member's last assignment can't go (409), and the dialog names why.
    await page
      .getByRole('button', { name: "Revoke Felix Omondi's Home assignment at Westlands Branch" })
      .click();
    const last = page.getByRole('alertdialog');
    await last.getByRole('button', { name: 'Revoke' }).click();
    await expect(last.getByRole('alert')).toContainText("may be the user's last branch assignment");
    await expect(last).toBeVisible();
    // Nothing changed behind it: the row is still there once the dialog is closed.
    await last.getByRole('button', { name: 'Cancel' }).click();
    await expect(last).toBeHidden();
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2);
  });

  test('forwards the organisation, the user and the row from the branch drawer and the revoke dialog', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, USERS.felix, 'Felix Omondi');
    await openTab(page, 'Branch assignments');
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2);

    await press(page.getByRole('button', { name: 'Assign branch' }));
    const drawer = page.getByRole('dialog', { name: 'Assign to a branch' });
    await expectGuardFields(drawer);
    await expect(drawer.locator('input[name="userId"]')).toHaveValue(USERS.felix);
    await drawer.getByRole('button', { name: 'Cancel' }).click();
    await expect(drawer).toBeHidden();

    await page
      .getByRole('button', { name: "Revoke Felix Omondi's Home assignment at Westlands Branch" })
      .click();
    const revoke = page.getByRole('alertdialog');
    await expectGuardFields(revoke);
    await expect(revoke.locator('input[name="assignmentId"]')).toHaveValue(FELIX_HOME_ASSIGNMENT);
    await revoke.getByRole('button', { name: 'Cancel' }).click();
    await expect(revoke).toBeHidden();
  });

  // BG-03: a search by user ignores the selected branch, and a tenant-wide grant assigns anywhere.
  test("lists every branch of a user's, and assigns at any, whichever branch is selected", async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await openDirectory(page, /Westlands/);
    await openRecord(page, 'Users', 'Esther Njoki');

    // Esther holds Head Office only: listed from a Westlands context, with no note about it.
    await openTab(page, 'Branch assignments');
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2);
    await expect(rowsOf(page, 'Branch assignments').nth(1)).toContainText('Head Office');
    await expect(page.getByRole('main').getByRole('note')).toHaveCount(0);
    await press(page.getByRole('button', { name: 'Assign branch' }));
    const branches = page.getByRole('dialog', { name: 'Assign to a branch' });
    await branches.getByRole('combobox', { name: 'Branch' }).click();
    await expect(page.getByRole('option')).toHaveText([
      'Head Office (HEAD_OFFICE)',
      'Westlands Branch (WESTLANDS)',
    ]);
    await page.keyboard.press('Escape');
    await branches.getByRole('button', { name: 'Cancel' }).click();
    await expect(branches).toBeHidden();

    // A branch-scoped role at her Head Office, from Westlands.
    await openTab(page, 'Roles & access');
    await press(page.getByRole('button', { name: 'Assign role' }));
    const roles = page.getByRole('dialog', { name: 'Assign a role' });
    await expect(roles.getByRole('combobox', { name: 'Scope' })).not.toHaveAccessibleDescription(
      containing("They aren't assigned to"),
    );
    await roles.getByRole('combobox', { name: 'Scope' }).click();
    await expect(page.getByRole('option', { name: 'One branch' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('shows a user history in four audit views', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, USERS.felix, 'Felix Omondi');
    await openTab(page, 'Audit');

    const views = page.getByRole('group', { name: 'Audit view' });
    await expect(views.getByRole('button')).toHaveText([
      'User record',
      'Account',
      'Membership',
      'Performed by',
    ]);
    await expect(views.getByRole('button', { name: 'User record' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Each view is one event, so a dropped `entityId` (every USER event, every MEMBERSHIP event) or
    // a dropped `actorId` (every event) fails the count.
    const events = rowsOf(page, 'Audit events');
    await expect(events).toHaveCount(2);
    await expect(events.nth(1)).toContainText('Invited user');

    await press(views.getByRole('button', { name: 'Account' }));
    await expect.poll(() => searchParam(page, 'view')).toBe('account');
    await expect(events.nth(1)).toContainText('Activated on first sign-in');
    await expect(events).toHaveCount(2);
    await expect(views.getByRole('button', { name: 'Account' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await views.getByRole('button', { name: 'Membership' }).click();
    await expect.poll(() => searchParam(page, 'view')).toBe('membership');
    await expect(events.nth(1)).toContainText('Activated membership');
    await expect(events).toHaveCount(2);

    // Felix performed the account activation himself.
    await views.getByRole('button', { name: 'Performed by' }).click();
    await expect.poll(() => searchParam(page, 'view')).toBe('actor');
    await expect(events.nth(1)).toContainText('Activated on first sign-in');
    await expect(events).toHaveCount(2);
    await expect(views.getByRole('button', { name: 'Performed by' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('redirects a page past the end on every tab, keeping the rest of the query', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await openDirectory(page);

    await page.goto(`/admin/users/${USERS.felix}/access?page=7`);
    await expect(page).toHaveURL((url) => url.searchParams.get('page') === null);
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(4);

    await page.goto(`/admin/users/${USERS.felix}/branches?page=7&size=10`);
    await expect(page).toHaveURL((url) => url.searchParams.get('page') === null);
    expect(searchParam(page, 'size')).toBe('10');
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2);

    await page.goto(`/admin/users/${USERS.felix}/audit?view=account&page=9&size=10`);
    await expect(page).toHaveURL((url) => url.searchParams.get('page') === null);
    expect(searchParam(page, 'view')).toBe('account');
    expect(searchParam(page, 'size')).toBe('10');
    await expect(rowsOf(page, 'Audit events').nth(1)).toContainText('Activated on first sign-in');
  });

  test('filters the audit trail by an actor picked from the user search', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterAdmin(page, '/admin/audit', { heading: 'Audit trail', branch: ALL_BRANCHES });
    // The picker keeps the filters already set: an Entity type of User.
    await page.goto('/admin/audit?entityType=USER');
    await expect(page.getByRole('heading', { level: 1, name: 'Audit trail' })).toBeVisible();

    const actor = page.getByRole('combobox', { name: 'Actor' });
    await expectHydrated(actor);
    await actor.fill('Victor');
    await page.getByRole('option', { name: /Victor Otieno/ }).click();

    await expect(page).toHaveURL((url) => url.searchParams.get('actorId') === USERS.victor);
    expect(searchParam(page, 'entityType')).toBe('USER');
    // That the pick drops `page` is pinned by 'starts the filtered trail on its first page after an
    // actor is picked' below: this URL has no `page` to drop (and Victor's four events fit one page).
    const chip = page.getByRole('button', { name: 'Actor: Victor Otieno' });
    await expect(chip).toBeVisible();
    // His four invitations; the other seven USER events are Jane's (six) or the system's (one).
    await expect(page.getByRole('status').filter({ hasText: /^4 events$/ })).toBeVisible();
    // The search starts over, empty, and keeps the keyboard where the user was.
    await expect(actor).toHaveValue('');
    await expect(actor).toBeFocused();

    // Removing the chip drops the filter and keeps focus on the page (the toolbar's own rule).
    await chip.click();
    await expect(page).toHaveURL((url) => url.searchParams.get('actorId') === null);
    expect(searchParam(page, 'entityType')).toBe('USER');
    await expect(page.getByRole('button', { name: /^Actor: / })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Clear filters' })).toBeFocused();
  });

  test('starts the filtered trail on its first page after an actor is picked', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterAdmin(page, '/admin/audit', { heading: 'Audit trail', branch: ALL_BRANCHES });
    // Page 2 of 4 at ten a page (37 events), so a `page` left in the URL would be a real page.
    await page.goto('/admin/audit?size=10&page=1');
    await expect(page.getByRole('status').filter({ hasText: /^37 events$/ })).toBeVisible();
    expect(searchParam(page, 'page')).toBe('1');

    const actor = page.getByRole('combobox', { name: 'Actor' });
    await expectHydrated(actor);
    await actor.fill('Jane');
    await page.getByRole('option', { name: /Backend Jane Manager/ }).click();

    await expect(page).toHaveURL((url) => url.searchParams.get('actorId') === IDS.jane);
    expect(searchParam(page, 'page')).toBeNull();
    expect(searchParam(page, 'size')).toBe('10');
    // Jane did 27 things: 3 pages, and the first one is shown.
    await expect(page.getByRole('status').filter({ hasText: /^27 events$/ })).toBeVisible();
    await expect(rowsOf(page, 'Audit events')).toHaveCount(11); // header + 10
  });
});

test.describe('users: gating and ids', () => {
  test('offers no membership actions without membership.view, and says why', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users-limited');
    await enterUser(page, USERS.amina, 'Amina Odhiambo');

    // The hero and tabs have rendered (Roles & access is the positive control for the missing
    // Audit tab), so the absences below are settled.
    await expect(page.getByRole('tab', { name: 'Roles & access' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Audit' })).toHaveCount(0);
    await expect(mainText(page, NO_MEMBERSHIP_VIEW)).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Approve|Reject & revoke)$/ })).toHaveCount(0);
    await expect(mainText(page, NO_MEMBERSHIP_DETAILS)).toBeVisible();

    // A direct visit to the Audit tab shows the forbidden state, by its content.
    await page.goto(`/admin/users/${USERS.amina}/audit`);
    await expect(mainText(page, FORBIDDEN_TITLE, { exact: true })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Audit events' })).toHaveCount(0);
  });

  test('offers no mutations without the permissions', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'users-read-only');
    await enterUser(page, USERS.amina, 'Amina Odhiambo');

    // The status still shows; no lifecycle button and no note explains a missing one.
    await expect(
      hero(page).getByText('Membership pending approval', { exact: true }),
    ).toBeVisible();
    await expect(hero(page).getByRole('button')).toHaveCount(0);
    await expect(mainText(page, NO_MEMBERSHIP_VIEW)).toHaveCount(0);
    // Nor Edit membership on its card (BG-17: membership.update).
    await expect(page.getByRole('button', { name: 'Edit membership' })).toHaveCount(0);

    await openTab(page, 'Roles & access');
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(2);
    await expect(rowsOf(page, 'Role assignments').nth(1)).toContainText('Teller');
    await expect(page.getByRole('button', { name: 'Assign role' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Revoke/ })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Actions' })).toHaveCount(0);
    // With nothing focusable inside, the scrollable table is still reachable by keyboard.
    await expect(
      page.getByRole('main').locator('[role="region"][aria-label="Role assignments"]'),
    ).toHaveAttribute('tabindex', '0');

    await openTab(page, 'Branch assignments');
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2);
    await expect(rowsOf(page, 'Branch assignments').nth(1)).toContainText('Westlands Branch');
    await expect(page.getByRole('button', { name: 'Assign branch' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Revoke/ })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Actions' })).toHaveCount(0);
    // The table's region has its own name: the section card is the "Branch assignments" region.
    await expect(page.getByRole('region', { name: 'Branch assignments table' })).toHaveAttribute(
      'tabindex',
      '0',
    );
    // The card is the one region of that name: a second would fail axe's landmark-unique.
    await expect(page.getByRole('region', { name: 'Branch assignments', exact: true })).toHaveCount(
      1,
    );
  });

  test('answers an unknown or malformed user id with the not-found page', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await openDirectory(page);

    // A malformed id never reaches the backend; an unknown one is the backend's own 404. The
    // layout's `notFound()` answers HTTP 200, so the page is recognised by its content.
    for (const path of [
      `/admin/users/${UNKNOWN_USER}`,
      `/admin/users/${UNKNOWN_USER}/access`,
      '/admin/users/not-a-uuid',
      '/admin/users/not-a-uuid/access',
      '/admin/users/not-a-uuid/branches',
      '/admin/users/not-a-uuid/audit',
    ]) {
      await page.goto(path);
      await expect(notFoundHeading(page), path).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Overview' })).toHaveCount(0);
    }
  });

  test('canonicalises a mixed-case user id', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await openDirectory(page);

    const upper = USERS.felix.toUpperCase();
    // The fake compares ids exactly, so only the lower-casing makes the reads below match.
    expect(upper).not.toBe(USERS.felix);
    await openUser(page, upper, 'Felix Omondi');
    // The tabs link to the canonical URL.
    await expect(page.getByRole('tab', { name: 'Audit' })).toHaveAttribute(
      'href',
      `/admin/users/${USERS.felix}/audit`,
    );

    await page.goto(`/admin/users/${upper}/access`);
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(4);

    await page.goto(`/admin/users/${upper}/audit`);
    await expect(rowsOf(page, 'Audit events').nth(1)).toContainText('Invited user');
    // A row's link into the full trail carries the lower-case id too. The User record view holds
    // exactly one event, so the link is the only one: a duplicate would fail the strict locator.
    await expect(rowsOf(page, 'Audit events')).toHaveCount(2); // header + the invitation
    const link = rowsOf(page, 'Audit events')
      .nth(1)
      .getByRole('link', { name: /view event/i });
    const href = new URL((await link.getAttribute('href')) ?? '', 'http://localhost');
    expect(href.pathname).toBe('/admin/audit');
    expect(href.searchParams.get('entityId')).toBe(USERS.felix);
    expect(href.searchParams.get('entityType')).toBe('USER');
  });

  // BG-09: the platform pages a member's assignments, so there is no ceiling to flag.
  test("pages a member's branch assignments on the server, newest assigned first", async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users-many-assignments');
    await enterUser(page, USERS.felix, 'Felix Omondi');

    await expect(fact(page, 'Branch assignments')).toHaveText('12');
    await openTab(page, 'Branch assignments');
    const main = page.getByRole('main');
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(11); // the header and a page of 10
    await expect(rowsOf(page, 'Branch assignments').nth(1)).toContainText('Outpost 11');
    await expect(rowsOf(page, 'Branch assignments').nth(1)).toContainText('11 Oct 2026');
    await expect(mainText(page, '1–10 of 12')).toBeVisible();
    await expect(main.getByRole('note')).toHaveCount(0);
    await expect(main).not.toContainText('incomplete');

    await press(main.getByRole('button', { name: 'Go to next page' }));
    await expect(page).toHaveURL((url) => url.searchParams.get('page') === '1');
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(3);
    await expect(rowsOf(page, 'Branch assignments').nth(1)).toContainText('Outpost 01');
    // His Westlands Home, the oldest, last.
    await expect(rowsOf(page, 'Branch assignments').nth(2)).toContainText('Westlands Branch');
    await expect(mainText(page, '11–12 of 12')).toBeVisible();
  });

  // BG-03: a branch-scoped view lists only the branches it covers, and says so.
  test("says a branch-scoped view shows only its branches' assignments", async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'branches-branch-scoped');
    await enterAdmin(page, `/admin/users/${BRANCH_SCENARIO_IDS.peter}/branches`, {
      heading: 'Peter Otieno',
      branch: /Head Office/,
    });

    await expect(
      mainText(page, 'Only assignments at branches you can view are shown.'),
    ).toBeVisible();
    // Peter holds Head Office and Westlands; the grant covers Head Office alone. The branch index is
    // target-aware too, so it names Head Office.
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2);
    await expect(rowsOf(page, 'Branch assignments').nth(1)).toContainText('Head Office');
  });
});

test.describe('users: accessibility', () => {
  // Each case scans eight surfaces after /select-context: 18-24 s on the production build at
  // 4 workers on 4 CPUs, so the 30 s default is too close.
  test.describe.configure({ timeout: 75000 });

  for (const a11yCase of A11Y_CASES) {
    test(`has no serious or critical accessibility violations (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
      context,
      page,
    }, testInfo) => {
      const scan = async (path: string, heading: string | RegExp) => {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);
      };

      await applyA11yCase(page, a11yCase);
      await authenticate(context, testInfo, 'users');
      await openDirectory(page);
      await expect(rowsOf(page, 'Users')).toHaveCount(11);
      await expectA11yCaseApplied(page, a11yCase);
      await expectNoSeriousOrCriticalViolations(page);
      // axe counts landmark-unique as moderate, so the one region of that name is asserted here.
      await expect(page.getByRole('region', { name: 'Users table' })).toHaveCount(1);
      await expect(page.getByRole('region', { name: 'Users', exact: true })).toHaveCount(0);

      // The 100-character name and a long, nested email: hero, tabs and Overview never scroll the
      // page (index item 4).
      await scan(`/admin/users/${USERS.wanjiru}`, WANJIRU);
      // Edit membership (BG-17), titled with that name.
      await press(page.getByRole('button', { name: 'Edit membership' }));
      const editMembership = page.getByRole('dialog', { name: /^Edit Wanjiru Njeri/ });
      await expect(editMembership).toBeVisible();
      await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
      await expectNoSeriousOrCriticalViolations(page);
      await expectDrawerFits(a11yCase, editMembership);
      await expectA11yCaseApplied(page, a11yCase);

      await scan(`/admin/users/${USERS.wanjiru}/access`, WANJIRU);
      await press(page.getByRole('button', { name: 'Assign role' }));
      const assignRole = page.getByRole('dialog', { name: 'Assign a role' });
      await expect(assignRole).toBeVisible();
      await expectNoSeriousOrCriticalViolations(page);
      await expectDrawerFits(a11yCase, assignRole);

      await scan(`/admin/users/${USERS.felix}/branches`, 'Felix Omondi');
      await press(page.getByRole('button', { name: 'Assign branch' }));
      const assignBranch = page.getByRole('dialog', { name: 'Assign to a branch' });
      await expect(assignBranch).toBeVisible();
      await expectNoSeriousOrCriticalViolations(page);
      await expectDrawerFits(a11yCase, assignBranch);

      // The disabled Approve and its caption.
      await scan(`/admin/users/${USERS.carol}`, 'Carol Wambui');
      await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();

      // The four-view toggle wraps at 375 px.
      await scan(`/admin/users/${USERS.felix}/audit?view=account`, 'Felix Omondi');
      await expect(rowsOf(page, 'Audit events')).toHaveCount(2);

      // Reject & revoke is an alertdialog.
      await scan(`/admin/users/${USERS.daniel}`, 'Daniel Mutua');
      await press(page.getByRole('button', { name: 'Reject & revoke', exact: true }));
      await expect(
        page.getByRole('alertdialog', { name: 'Reject and revoke Daniel Mutua?' }),
      ).toBeVisible();
      // MUI's Fade sets `opacity` on the dialog's transition container, and axe blends ancestor
      // opacity into color-contrast: scanning mid-fade reports a false violation against a
      // half-faded surface (the same wait as platform-tenants.spec.ts).
      await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
      await expectNoSeriousOrCriticalViolations(page);

      // The audit trail's Actor search, with its options open.
      await scan('/admin/audit', 'Audit trail');
      const actor = page.getByRole('combobox', { name: 'Actor' });
      await expectHydrated(actor);
      await actor.fill('a');
      await expect(page.getByRole('option').first()).toBeVisible();
      await expect(page.locator('.MuiAutocomplete-popper')).toHaveCSS('opacity', '1');
      await expectNoSeriousOrCriticalViolations(page);
    });

    test(`has no serious or critical accessibility violations on the read-only tabs (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
      context,
      page,
    }, testInfo) => {
      await applyA11yCase(page, a11yCase);
      await authenticate(context, testInfo, 'users-read-only');
      await enterUser(page, USERS.amina, 'Amina Odhiambo');
      await expectA11yCaseApplied(page, a11yCase);
      await expectNoSeriousOrCriticalViolations(page);

      // No action in either table, so the keyboard reaches each scrollable region only because the
      // region itself is focusable (axe: scrollable-region-focusable).
      for (const [tab, table] of [
        ['Roles & access', 'Role assignments'],
        ['Branch assignments', 'Branch assignments'],
      ] as const) {
        await openTab(page, tab);
        await expect(rowsOf(page, table)).toHaveCount(2);
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);
      }
    });

    // BG-28: Kamau, re-invited with his account never provisioned, awaits approval again.
    test(`has no serious or critical accessibility violations on a re-invited member's record (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
      context,
      page,
    }, testInfo) => {
      await applyA11yCase(page, a11yCase);
      await authenticate(context, testInfo, 'users-reinvited');
      await enterUser(page, REINVITED.kamau, 'Kamau Njoroge');
      await expect(statusChip(page, 'Awaiting approval')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
      await expectA11yCaseApplied(page, a11yCase);
      await expectNoSeriousOrCriticalViolations(page);
    });

    // #342: the disabled Assign role and Assign branch with their reasons, on your own record.
    test(`has no serious or critical accessibility violations where your own access is blocked (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
      context,
      page,
    }, testInfo) => {
      await applyA11yCase(page, a11yCase);
      await authenticate(context, testInfo, 'users-self');
      await enterUser(page, IDS.jane, 'Backend Jane Manager');
      for (const [tab, label] of [
        ['Roles & access', 'Assign role'],
        ['Branch assignments', 'Assign branch'],
      ] as const) {
        await openTab(page, tab);
        await expect(page.getByRole('button', { name: label })).toBeDisabled();
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);
      }
    });
  }
});
